// dllmain.cpp — DLL entry points for ZegenXFS.dll.
//
// Phase 8c.1 — WFPExecute now uses the wfs_codec to map dwCommand to
// the backend's WFS_CMD_* string and to serialize the command payload
// struct. Per-command struct marshalling is still a stub (lands in
// Phase 8c.2 once we have the CEN/XFS SDK headers on the build host);
// each command presently sends an empty {} payload, so commands with
// no inputs round-trip fine and commands with inputs still succeed at
// the dispatch level but ignore vendor-side fields until 8c.2.

#include "../include/zegen_xfs.h"
#include "bridge_client.h"
#include "event_router.h"
#include "ini_config.h"
#include "wfs_codec.h"

#include <map>
#include <memory>
#include <mutex>
#include <string>

namespace {

std::unique_ptr<zegen::BridgeClient> g_bridge;

// hService → (service class, logical hService string) map.
// The backend returns the logical hService (e.g. "IDC30") inside the
// WFPOpen response; we keep a mapping so WFPExecute/GetInfo/Close can
// reuse it. Phase 8c.2 should key this by the vendor-provided HSERVICE
// handle instead of a parallel map.
struct ServiceBinding {
    std::string service_class; // IDC / PIN / CDM / PTR
    std::string h_service;     // IDC30 / PIN30 / …
};
std::map<HSERVICE, ServiceBinding> g_services;
std::mutex g_services_mtx;

zegen::wfs::IniConfig g_ini;
uint32_t g_request_timeout_ms = 30000;

void ensure_bridge() {
    if (g_bridge) return;

    g_ini = zegen::wfs::load_ini();
    zegen::BridgeConfig cfg;
    cfg.host = g_ini.bridge_host;
    cfg.port = g_ini.bridge_port;
    g_request_timeout_ms = g_ini.request_timeout_ms;

    g_bridge = std::make_unique<zegen::BridgeClient>(cfg);
    g_bridge->connect();
    g_bridge->on_event([](const std::string& json) {
        zegen::wfs::EventRouter::instance().dispatch(json);
    });
}

// Extract a JSON string field without a full JSON parser — matches the
// minimal parsing approach in bridge_client.cpp. Returns empty on miss.
std::string json_string_field(const std::string& body, const std::string& key) {
    std::string needle = std::string("\"") + key + "\":\"";
    size_t p = body.find(needle);
    if (p == std::string::npos) return {};
    size_t start = p + needle.size();
    size_t end = body.find('"', start);
    if (end == std::string::npos) return {};
    return body.substr(start, end - start);
}

} // namespace

extern "C" {

HRESULT WFPOpen(
    HSERVICE  hService,
    const char* lpszLogicalName,
    DWORD     /*hApp*/,
    const char* /*lpszAppID*/,
    DWORD     /*dwTraceLevel*/,
    DWORD     dwTimeOut,
    HWND      /*hWnd*/,
    DWORD     /*ReqID*/,
    HPROVIDER /*hProvider*/,
    DWORD     /*dwSPIVersionsRequired*/,
    void*     /*lpSPIVersion*/,
    DWORD     /*dwSrvcVersionsRequired*/,
    void*     /*lpSrvcVersion*/) {

    ensure_bridge();
    const std::string service = lpszLogicalName ? lpszLogicalName : "";
    auto resp = g_bridge->send_request("WFPOpen", service, "", "", "{}", dwTimeOut);
    if (resp.result == 0) {
        // Extract the logical hService string from the response so
        // subsequent calls can reuse it.
        std::string h_service = json_string_field(resp.payload_json, "hService");
        std::lock_guard<std::mutex> lock(g_services_mtx);
        g_services[hService] = { service, h_service };
    }
    return resp.result;
}

HRESULT WFPClose(HSERVICE hService, HWND /*hWnd*/, DWORD /*ReqID*/) {
    ensure_bridge();
    std::string h_service;
    {
        std::lock_guard<std::mutex> lock(g_services_mtx);
        auto it = g_services.find(hService);
        if (it != g_services.end()) h_service = it->second.h_service;
        g_services.erase(hService);
    }
    zegen::wfs::EventRouter::instance().clear_service(hService);
    auto resp = g_bridge->send_request("WFPClose", "", h_service, "", "{}", 5000);
    return resp.result;
}

HRESULT WFPGetInfo(
    HSERVICE hService,
    DWORD    /*dwCategory*/,
    void*    /*lpQueryDetails*/,
    DWORD    dwTimeOut,
    HWND     /*hWnd*/,
    DWORD    /*ReqID*/) {

    ensure_bridge();
    std::string h_service;
    {
        std::lock_guard<std::mutex> lock(g_services_mtx);
        auto it = g_services.find(hService);
        if (it != g_services.end()) h_service = it->second.h_service;
    }
    auto resp = g_bridge->send_request("WFPGetInfo", "", h_service, "", "{}", dwTimeOut);
    return resp.result;
}

HRESULT WFPExecute(
    HSERVICE hService,
    DWORD    dwCommand,
    void*    lpCmdData,
    DWORD    dwTimeOut,
    HWND     /*hWnd*/,
    DWORD    /*ReqID*/) {

    ensure_bridge();
    std::string service_class, h_service;
    {
        std::lock_guard<std::mutex> lock(g_services_mtx);
        auto it = g_services.find(hService);
        if (it == g_services.end()) return -4; // ERR_INVALID_HSERVICE
        service_class = it->second.service_class;
        h_service     = it->second.h_service;
    }

    // Map dwCommand to the backend's WFS_CMD_* string.
    std::string command_code = zegen::wfs::command_code_for(service_class, dwCommand);
    if (command_code.empty()) return -8; // ERR_UNSUPP_COMMAND

    // Serialize the command payload struct. Phase 8c.2 fills in the
    // per-command marshallers; the stub returns "{}" today.
    std::string payload = zegen::wfs::payload_to_json(
        service_class, dwCommand, lpCmdData);

    auto resp = g_bridge->send_request(
        "WFPExecute", service_class, h_service, command_code, payload, dwTimeOut);

    if (resp.result == 0) {
        // Populate the vendor app's result struct from the response
        // JSON. Phase 8c.2 implements the per-command demarshallers.
        zegen::wfs::response_from_json(
            service_class, dwCommand, resp.payload_json, lpCmdData);
    }
    return resp.result;
}

HRESULT WFPCancelAsyncRequest(HSERVICE /*hService*/, DWORD /*ReqID*/) { return 0; }

HRESULT WFPRegister(HSERVICE hService, DWORD dwEventClass,
                    HWND hWndReg, HWND /*hWnd*/, DWORD /*ReqID*/) {
    std::string logical_name;
    {
        std::lock_guard<std::mutex> lock(g_services_mtx);
        auto it = g_services.find(hService);
        if (it != g_services.end()) logical_name = it->second.h_service;
    }
    zegen::wfs::EventRouter::instance().register_window(
        hService, logical_name, hWndReg, static_cast<uint32_t>(dwEventClass));
    return 0;
}

HRESULT WFPDeregister(HSERVICE hService, DWORD dwEventClass,
                      HWND hWndReg, HWND /*hWnd*/, DWORD /*ReqID*/) {
    zegen::wfs::EventRouter::instance().deregister_window(
        hService, hWndReg, static_cast<uint32_t>(dwEventClass));
    return 0;
}

HRESULT WFPLock(HSERVICE, DWORD, HWND, DWORD)                        { return 0; }
HRESULT WFPUnlock(HSERVICE, HWND, DWORD)                             { return 0; }

} // extern "C"

#ifdef _WIN32
BOOL APIENTRY DllMain(HMODULE, DWORD ul_reason_for_call, LPVOID) {
    switch (ul_reason_for_call) {
        case DLL_PROCESS_ATTACH: break;
        case DLL_THREAD_ATTACH:  break;
        case DLL_THREAD_DETACH:  break;
        case DLL_PROCESS_DETACH:
            if (g_bridge) {
                g_bridge->shutdown();
                g_bridge.reset();
            }
            break;
    }
    return TRUE;
}
#endif
