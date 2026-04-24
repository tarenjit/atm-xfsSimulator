// bridge_client.cpp — ZXFS TCP bridge client (WinSock2).
//
// Phase 8c.1 implementation. Windows-only. Build target: MSVC v143,
// Windows SDK 10.0.22621, C++20. Links against ws2_32.lib.
//
// Threading model:
//   - One writer thread? No — writes are synchronized under a mutex.
//     Every send_request() serializes its frame on the caller's stack
//     and writes under the mutex, then waits on a per-id condition
//     variable for the matching response frame from the reader thread.
//   - One reader thread consumes framed responses + events. Responses
//     land in `pending_` keyed by correlation id; events invoke
//     on_event_.
//   - Reconnect loop is driven by the caller via connect() after a
//     socket error; simpler than an auto-reconnect thread for v1.

#ifdef _WIN32
#define WIN32_LEAN_AND_MEAN
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#else
// Non-Windows: provide a no-op stub so the file parses on macOS/Linux
// for IDE tooling. Real builds must target Windows.
#include <sys/types.h>
#include <sys/socket.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <unistd.h>
using SOCKET = int;
constexpr SOCKET INVALID_SOCKET = -1;
constexpr int SOCKET_ERROR = -1;
inline int closesocket(SOCKET s) { return close(s); }
#endif

#include "bridge_client.h"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>
#include <sstream>

namespace zegen {

namespace {
// Pending outgoing request → promise the reader thread fulfills when
// the matching response frame arrives.
struct PendingSlot {
    std::mutex m;
    std::condition_variable cv;
    bool   done = false;
    BridgeResponse response;
};
} // namespace

struct BridgeClient::Impl {
    explicit Impl(BridgeConfig c) : cfg(std::move(c)) {}

    BridgeConfig                 cfg;
    SOCKET                       sock = INVALID_SOCKET;
    std::mutex                   write_mtx;
    std::atomic<bool>            running{false};
    std::thread                  reader_thread;
    EventHandler                 on_event;

    std::mutex                   pending_mtx;
    std::unordered_map<std::string, std::shared_ptr<PendingSlot>> pending;

    std::atomic<uint64_t>        next_id{1};

    std::string make_id() {
        // Simple unique correlation id. Reader uses it as the map key.
        std::ostringstream ss;
        ss << "REQ_" << next_id.fetch_add(1, std::memory_order_relaxed);
        return ss.str();
    }

    // Encode a frame: 4-byte LE length + body.
    static std::vector<uint8_t> frame(const std::string& body) {
        uint32_t len = static_cast<uint32_t>(body.size());
        std::vector<uint8_t> out(4 + body.size());
        out[0] = static_cast<uint8_t>((len)       & 0xFF);
        out[1] = static_cast<uint8_t>((len >> 8)  & 0xFF);
        out[2] = static_cast<uint8_t>((len >> 16) & 0xFF);
        out[3] = static_cast<uint8_t>((len >> 24) & 0xFF);
        std::memcpy(out.data() + 4, body.data(), body.size());
        return out;
    }

    bool send_all(const uint8_t* data, size_t len) {
        std::lock_guard<std::mutex> lock(write_mtx);
        size_t sent = 0;
        while (sent < len) {
            int n = ::send(sock, reinterpret_cast<const char*>(data + sent),
                           static_cast<int>(len - sent), 0);
            if (n <= 0) return false;
            sent += static_cast<size_t>(n);
        }
        return true;
    }

    bool recv_all(uint8_t* data, size_t len) {
        size_t got = 0;
        while (got < len) {
            int n = ::recv(sock, reinterpret_cast<char*>(data + got),
                           static_cast<int>(len - got), 0);
            if (n <= 0) return false;
            got += static_cast<size_t>(n);
        }
        return true;
    }

    // Reader loop. Blocks until socket closes or recv fails.
    void reader_loop() {
        while (running.load(std::memory_order_acquire)) {
            uint8_t header[4];
            if (!recv_all(header, 4)) break;
            uint32_t len = static_cast<uint32_t>(header[0]) |
                           (static_cast<uint32_t>(header[1]) << 8) |
                           (static_cast<uint32_t>(header[2]) << 16) |
                           (static_cast<uint32_t>(header[3]) << 24);
            if (len == 0 || len > 1'000'000) break;
            std::string body(len, '\0');
            if (!recv_all(reinterpret_cast<uint8_t*>(body.data()), len)) break;

            // Extract type + id without a JSON library (minimal parse).
            // Full JSON parsing lives in the caller — we only need type
            // and id here to route. Looks for "type":"…" and "id":"…".
            auto find_field = [&](const std::string& key) -> std::string {
                std::string needle = std::string("\"") + key + "\":\"";
                size_t p = body.find(needle);
                if (p == std::string::npos) return {};
                size_t start = p + needle.size();
                size_t end = body.find('"', start);
                if (end == std::string::npos) return {};
                return body.substr(start, end - start);
            };
            std::string type = find_field("type");
            std::string id   = find_field("id");

            if (type == "response") {
                std::shared_ptr<PendingSlot> slot;
                {
                    std::lock_guard<std::mutex> lock(pending_mtx);
                    auto it = pending.find(id);
                    if (it != pending.end()) {
                        slot = it->second;
                        pending.erase(it);
                    }
                }
                if (slot) {
                    std::lock_guard<std::mutex> lk(slot->m);
                    // Caller parses the JSON for result/payload. Here we
                    // just hand back the raw body and the protocol-level
                    // result if we can find it quickly.
                    slot->response.payload_json = body;
                    // Extract integer result field: "result":N
                    size_t rp = body.find("\"result\":");
                    slot->response.result = 0;
                    if (rp != std::string::npos) {
                        slot->response.result = std::atoi(body.c_str() + rp + 9);
                    }
                    slot->done = true;
                    slot->cv.notify_one();
                }
            } else if (type == "event") {
                if (on_event) on_event(body);
            } else if (type == "pong") {
                // Heartbeat ack; nothing to do beyond letting the
                // pinger know we're alive (not tracked in this MVP).
            }
        }

        // Socket closed — wake every pending slot with an error.
        std::lock_guard<std::mutex> lock(pending_mtx);
        for (auto& [id, slot] : pending) {
            std::lock_guard<std::mutex> lk(slot->m);
            slot->response.result = -5; // ERR_INTERNAL_ERROR
            slot->response.error_detail = "bridge disconnected";
            slot->done = true;
            slot->cv.notify_one();
        }
        pending.clear();
    }
};

BridgeClient::BridgeClient(BridgeConfig cfg) : impl_(new Impl(std::move(cfg))) {}

BridgeClient::~BridgeClient() {
    shutdown();
    delete impl_;
}

void BridgeClient::connect() {
#ifdef _WIN32
    WSADATA wsa;
    static std::atomic<bool> wsa_started{false};
    bool expected = false;
    if (wsa_started.compare_exchange_strong(expected, true)) {
        if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) return;
    }
#endif

    uint32_t delay_ms = impl_->cfg.reconnect_delay_ms;
    while (true) {
        impl_->sock = ::socket(AF_INET, SOCK_STREAM, 0);
        if (impl_->sock == INVALID_SOCKET) {
            std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
            delay_ms = std::min(delay_ms * 2, impl_->cfg.reconnect_max_ms);
            continue;
        }

        sockaddr_in addr{};
        addr.sin_family = AF_INET;
        addr.sin_port = htons(impl_->cfg.port);
#ifdef _WIN32
        inet_pton(AF_INET, impl_->cfg.host.c_str(), &addr.sin_addr);
#else
        inet_pton(AF_INET, impl_->cfg.host.c_str(), &addr.sin_addr);
#endif

        if (::connect(impl_->sock,
                      reinterpret_cast<sockaddr*>(&addr),
                      sizeof(addr)) == SOCKET_ERROR) {
            closesocket(impl_->sock);
            impl_->sock = INVALID_SOCKET;
            std::this_thread::sleep_for(std::chrono::milliseconds(delay_ms));
            delay_ms = std::min(delay_ms * 2, impl_->cfg.reconnect_max_ms);
            continue;
        }

        // Connected.
        impl_->running.store(true, std::memory_order_release);
        impl_->reader_thread = std::thread([this]() { impl_->reader_loop(); });
        return;
    }
}

BridgeResponse BridgeClient::send_request(const std::string& op,
                                          const std::string& service,
                                          const std::string& h_service,
                                          const std::string& command_code,
                                          const std::string& payload_json,
                                          uint32_t timeout_ms) {
    std::string id = impl_->make_id();
    auto slot = std::make_shared<PendingSlot>();
    {
        std::lock_guard<std::mutex> lock(impl_->pending_mtx);
        impl_->pending.emplace(id, slot);
    }

    // Construct request JSON. Hand-built to avoid a JSON dep; all
    // string fields are ASCII per protocol so we escape nothing beyond
    // the payload which the caller supplies already-JSON.
    std::ostringstream body;
    body << "{\"type\":\"request\","
         << "\"id\":\"" << id << "\","
         << "\"ts\":\"\","
         << "\"op\":\"" << op << "\","
         << "\"service\":\"" << service << "\","
         << "\"hService\":\"" << h_service << "\","
         << "\"commandCode\":\"" << command_code << "\","
         << "\"payload\":" << (payload_json.empty() ? "{}" : payload_json)
         << "}";
    auto frame = Impl::frame(body.str());
    if (!impl_->send_all(frame.data(), frame.size())) {
        std::lock_guard<std::mutex> lock(impl_->pending_mtx);
        impl_->pending.erase(id);
        return { -5, "", "send failed" };
    }

    // Wait for the reader thread to populate the slot.
    std::unique_lock<std::mutex> lk(slot->m);
    bool got = slot->cv.wait_for(
        lk,
        std::chrono::milliseconds(timeout_ms),
        [&]() { return slot->done; });
    if (!got) {
        std::lock_guard<std::mutex> lock(impl_->pending_mtx);
        impl_->pending.erase(id);
        return { -6, "", "response timeout" }; // ERR_TIMEOUT
    }
    return slot->response;
}

void BridgeClient::on_event(EventHandler handler) {
    impl_->on_event = std::move(handler);
}

void BridgeClient::shutdown() {
    impl_->running.store(false, std::memory_order_release);
    if (impl_->sock != INVALID_SOCKET) {
        closesocket(impl_->sock);
        impl_->sock = INVALID_SOCKET;
    }
    if (impl_->reader_thread.joinable()) {
        impl_->reader_thread.join();
    }
}

} // namespace zegen
