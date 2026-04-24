// event_router.h — route ZXFS asynchronous events to vendor app windows.
//
// Background: CEN/XFS 3.30 uses WFMPostMessage to deliver async events
// (service events like MEDIA_INSERTED, execute events like ENTER_DATA,
// system events like HARDWARE_ERROR) to any HWND that called WFSRegister.
//
// Our bridge receives these same events as `event` frames over TCP. This
// module maps a frame to:
//   1. The registered HWND set for the target hService.
//   2. A Windows message code (WFS_SERVICE_EVENT / WFS_EXECUTE_EVENT /
//      WFS_SYSTEM_EVENT / WFS_USER_EVENT) based on the CEN eventClass.
//   3. A WFSRESULT* payload allocated via WFMAllocateBuffer and populated
//      with the event code + service-specific data fields.
//
// When the real CEN/XFS xfsadmin.h is on the build host, the implementation
// calls WFMPostMessage directly. In the Phase 8c.2 skeleton the stub logs
// the event so the protocol round-trip can be verified end-to-end.

#pragma once

#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#else
// Non-Windows IDE/CI parse stubs — real build runs on MSVC + windows.h.
// These match the stubs in include/zegen_xfs.h so includers can compile
// either header first without a conflict.
using HWND     = void*;
using HSERVICE = void*;
using WPARAM   = uintptr_t;
using LPARAM   = intptr_t;
#endif

namespace zegen::wfs {

// CEN/XFS WinMessage codes per spec §1.6.
constexpr uint32_t WFS_OPEN_COMPLETE     = 0x00010001;
constexpr uint32_t WFS_CLOSE_COMPLETE    = 0x00010002;
constexpr uint32_t WFS_LOCK_COMPLETE     = 0x00010003;
constexpr uint32_t WFS_UNLOCK_COMPLETE   = 0x00010004;
constexpr uint32_t WFS_REGISTER_COMPLETE = 0x00010005;
constexpr uint32_t WFS_DEREGISTER_COMPLETE = 0x00010006;
constexpr uint32_t WFS_GETINFO_COMPLETE  = 0x00010007;
constexpr uint32_t WFS_EXECUTE_COMPLETE  = 0x00010008;
constexpr uint32_t WFS_EXECUTE_EVENT     = 0x00020001;
constexpr uint32_t WFS_SERVICE_EVENT     = 0x00020002;
constexpr uint32_t WFS_USER_EVENT        = 0x00020003;
constexpr uint32_t WFS_SYSTEM_EVENT      = 0x00020004;
constexpr uint32_t WFS_TIMER_EVENT       = 0x00020005;

class EventRouter {
public:
    static EventRouter& instance();

    // WFPRegister binds an HWND to a set of event classes for an hService.
    // dwEventClass bits follow CEN/XFS §1.5: 1=SERVICE, 2=USER, 4=SYSTEM,
    // 8=EXECUTE (OR'd together). We keep one registration per HWND per
    // hService; re-register replaces the class mask. `logical_name` is the
    // backend's logical hService string (e.g. "IDC30") so the async event
    // dispatcher can route on it — optional, empty = skip.
    void register_window(HSERVICE h_service,
                         const std::string& logical_name,
                         HWND hwnd,
                         uint32_t event_classes);
    void deregister_window(HSERVICE h_service, HWND hwnd, uint32_t event_classes);

    // Drop all registrations for an hService (called on WFPClose).
    void clear_service(HSERVICE h_service);

    // Dispatch a ZXFS event frame body to all matching registered windows.
    // The body is the JSON text of the bridge event frame. The router
    // parses the eventClass / eventCode / payload fields and posts a
    // Windows message (WFMPostMessage) to each subscriber.
    void dispatch(const std::string& event_json);

    // Map "SRVE" / "EXEE" / "SYSE" / "USRE" (ZXFS event class strings) to
    // the CEN/XFS WFS_*_EVENT message codes.
    static uint32_t message_for_class(const std::string& cls);

private:
    EventRouter() = default;

    struct Subscription {
        HWND hwnd;
        uint32_t event_classes;
    };
    std::mutex mtx_;
    // Keyed by HSERVICE for register/deregister (vendor uses its handle).
    std::unordered_map<HSERVICE, std::vector<Subscription>> subs_;
    // Parallel index: logical name → HSERVICE, populated at register_window
    // time so the async event dispatcher can route by the logical name
    // that ZXFS frames carry in the `hService` field.
    std::unordered_map<std::string, HSERVICE> by_logical_;

    static bool class_matches(uint32_t subscribed_mask, uint32_t event_class_bit);
};

} // namespace zegen::wfs
