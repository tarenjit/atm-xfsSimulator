// dllmain.cpp — DLL entry points for ZegenXFS.dll.
//
// Phase 8c SKELETON — each WFP* function proxies to BridgeClient and
// returns the result. Packing C structs into JSON payloads (and vice
// versa for responses) is delegated to the serializer module (not yet
// written; lands in Phase 8c.1).

#include "../include/zegen_xfs.h"
#include "bridge_client.h"

#include <memory>
#include <string>

namespace {

std::unique_ptr<zegen::BridgeClient> g_bridge;

void ensure_bridge() {
    if (!g_bridge) {
        zegen::BridgeConfig cfg;
        // TODO: load from ZegenXFS.ini (Phase 8c.1).
        g_bridge = std::make_unique<zegen::BridgeClient>(cfg);
        g_bridge->connect();
        g_bridge->on_event([](const std::string& json) {
            // TODO: parse event, dispatch via WFMPostMessage to the
            // registered HWND set (event_router module — Phase 8c.1).
            (void)json;
        });
    }
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
    (void)hService;
    const std::string service = lpszLogicalName ? lpszLogicalName : "";
    auto resp = g_bridge->send_request("WFPOpen", service, "", "", "{}", dwTimeOut);
    return resp.result;
}

HRESULT WFPClose(HSERVICE hService, HWND /*hWnd*/, DWORD /*ReqID*/) {
    ensure_bridge();
    (void)hService;
    auto resp = g_bridge->send_request("WFPClose", "", "", "", "{}", 5000);
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
    (void)hService;
    auto resp = g_bridge->send_request("WFPGetInfo", "", "", "", "{}", dwTimeOut);
    return resp.result;
}

HRESULT WFPExecute(
    HSERVICE hService,
    DWORD    dwCommand,
    void*    /*lpCmdData*/,
    DWORD    dwTimeOut,
    HWND     /*hWnd*/,
    DWORD    /*ReqID*/) {

    ensure_bridge();
    (void)hService;
    // TODO Phase 8c.1: map dwCommand → WFS command-code string; pack
    // *lpCmdData into JSON per command schema.
    std::string command_code = std::to_string(static_cast<unsigned>(dwCommand));
    auto resp = g_bridge->send_request("WFPExecute", "", "", command_code, "{}", dwTimeOut);
    return resp.result;
}

HRESULT WFPCancelAsyncRequest(HSERVICE /*hService*/, DWORD /*ReqID*/) { return 0; }
HRESULT WFPRegister(HSERVICE, DWORD, HWND, HWND, DWORD)              { return 0; }
HRESULT WFPDeregister(HSERVICE, DWORD, HWND, HWND, DWORD)            { return 0; }
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
