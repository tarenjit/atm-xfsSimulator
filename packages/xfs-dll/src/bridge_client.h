// bridge_client.h — persistent TCP client to the ATMirror xfs-server.
// See packages/xfs-dll/ZXFS_PROTOCOL.md.

#pragma once

#include <string>
#include <functional>
#include <cstdint>

namespace zegen {

struct BridgeConfig {
    std::string host = "127.0.0.1";
    uint16_t    port = 9101;
    uint32_t    reconnect_delay_ms = 500;
    uint32_t    reconnect_max_ms   = 10000;
};

struct BridgeResponse {
    int         result;         // 0 = success, negative = XfsResult error
    std::string payload_json;   // response body as JSON string
    std::string error_detail;
};

using EventHandler = std::function<void(const std::string& json)>;

class BridgeClient {
public:
    explicit BridgeClient(BridgeConfig cfg);
    ~BridgeClient();

    // Blocks until connected, reconnecting forever with backoff.
    void connect();

    // Synchronous request/response. Internally assigns a correlation id,
    // serializes to JSON, sends, waits for matching response frame.
    BridgeResponse send_request(const std::string& op,
                                const std::string& service,
                                const std::string& h_service,
                                const std::string& command_code,
                                const std::string& payload_json,
                                uint32_t timeout_ms);

    // Register an event handler. Called from the read thread.
    void on_event(EventHandler handler);

    // Stop and disconnect.
    void shutdown();

private:
    // Windows implementation uses WinSock2 (WSAStartup / socket / send / recv).
    // Phase 8c.1 adds the full C++ implementation.
    struct Impl;
    Impl* impl_;
};

} // namespace zegen
