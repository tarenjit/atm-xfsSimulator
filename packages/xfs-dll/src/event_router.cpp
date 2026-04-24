// event_router.cpp — parse ZXFS event frames + post to registered HWNDs.

#include "event_router.h"
#include "mini_json.h"
#include <algorithm>
#include <cstdio>

namespace zegen::wfs {

EventRouter& EventRouter::instance() {
    static EventRouter r;
    return r;
}

void EventRouter::register_window(HSERVICE h_service,
                                  const std::string& logical_name,
                                  HWND hwnd,
                                  uint32_t event_classes) {
    std::lock_guard<std::mutex> lock(mtx_);
    auto& vec = subs_[h_service];
    auto it = std::find_if(vec.begin(), vec.end(),
                           [&](const Subscription& s) { return s.hwnd == hwnd; });
    if (it != vec.end()) {
        it->event_classes |= event_classes;
    } else {
        vec.push_back({ hwnd, event_classes });
    }
    if (!logical_name.empty()) by_logical_[logical_name] = h_service;
}

void EventRouter::deregister_window(HSERVICE h_service, HWND hwnd, uint32_t event_classes) {
    std::lock_guard<std::mutex> lock(mtx_);
    auto it = subs_.find(h_service);
    if (it == subs_.end()) return;
    auto& vec = it->second;
    if (event_classes == 0) {
        vec.erase(std::remove_if(vec.begin(), vec.end(),
                                 [&](const Subscription& s) { return s.hwnd == hwnd; }),
                  vec.end());
    } else {
        for (auto& s : vec) {
            if (s.hwnd == hwnd) s.event_classes &= ~event_classes;
        }
        vec.erase(std::remove_if(vec.begin(), vec.end(),
                                 [](const Subscription& s) { return s.event_classes == 0; }),
                  vec.end());
    }
    if (vec.empty()) subs_.erase(it);
}

void EventRouter::clear_service(HSERVICE h_service) {
    std::lock_guard<std::mutex> lock(mtx_);
    subs_.erase(h_service);
    for (auto it = by_logical_.begin(); it != by_logical_.end();) {
        if (it->second == h_service) it = by_logical_.erase(it);
        else ++it;
    }
}

uint32_t EventRouter::message_for_class(const std::string& cls) {
    // ZXFS event class strings map to CEN/XFS WinMessage codes. See
    // CEN/XFS 3.30 §1.6 for the canonical encoding.
    if (cls == "SRVE") return WFS_SERVICE_EVENT;
    if (cls == "EXEE") return WFS_EXECUTE_EVENT;
    if (cls == "SYSE") return WFS_SYSTEM_EVENT;
    if (cls == "USRE") return WFS_USER_EVENT;
    return 0;
}

bool EventRouter::class_matches(uint32_t subscribed_mask, uint32_t event_class_bit) {
    // event_classes parameter (§1.5):
    //   SERVICE_EVENTS = 1, USER_EVENTS = 2, SYSTEM_EVENTS = 4, EXECUTE_EVENTS = 8
    uint32_t bit = 0;
    switch (event_class_bit) {
        case WFS_SERVICE_EVENT: bit = 1; break;
        case WFS_USER_EVENT:    bit = 2; break;
        case WFS_SYSTEM_EVENT:  bit = 4; break;
        case WFS_EXECUTE_EVENT: bit = 8; break;
        default: return true;  // TIMER etc — always delivered
    }
    return (subscribed_mask & bit) != 0;
}

void EventRouter::dispatch(const std::string& event_json) {
    zegen::json::Reader r(event_json);

    // Pull the fields ZXFS bridge always includes in an `event` frame.
    const std::string type       = r.get_string("type");
    if (type != "event") return;

    const std::string service    = r.get_string("service");
    const std::string hservice   = r.get_string("hService");
    const std::string eventCode  = r.get_string("eventCode");
    const std::string eventClass = r.get_string("eventClass");

    const uint32_t msg = message_for_class(eventClass);
    if (msg == 0) {
        std::fprintf(stderr, "[ZXFS event] unknown class %s\n", eventClass.c_str());
        return;
    }

    // Look up subscribers by logical name (the by_logical_ index is
    // populated whenever the vendor app calls WFPRegister).
    std::vector<Subscription> local_copy;
    {
        std::lock_guard<std::mutex> lock(mtx_);
        auto idx = by_logical_.find(hservice);
        if (idx == by_logical_.end()) return;
        auto it = subs_.find(idx->second);
        if (it != subs_.end()) local_copy = it->second;
    }

    for (const auto& s : local_copy) {
        if (!class_matches(s.event_classes, msg)) continue;

#ifdef _WIN32
        // Real CEN/XFS path: allocate a WFSRESULT, populate it, hand off
        // to WFMPostMessage which owns the buffer until the app calls
        // WFSFreeResult. Wiring left to dllmain.cpp once WFMAllocateBuffer
        // is hooked up — for now we PostMessage with the event-code hash
        // as WPARAM so an integration test can verify routing.
        uint32_t code_hash = 0;
        for (char c : eventCode) code_hash = code_hash * 31 + static_cast<uint8_t>(c);
        PostMessageA(reinterpret_cast<::HWND>(s.hwnd),
                     static_cast<UINT>(msg),
                     static_cast<WPARAM>(code_hash),
                     0);
#else
        // Non-Windows: just log. Provides a round-trip signal for the
        // pytest bridge probe.
        std::fprintf(stderr,
                     "[ZXFS event] svc=%s hs=%s class=%s code=%s → hwnd=%p msg=0x%08x\n",
                     service.c_str(), hservice.c_str(), eventClass.c_str(),
                     eventCode.c_str(), s.hwnd, msg);
#endif
    }
}

} // namespace zegen::wfs
