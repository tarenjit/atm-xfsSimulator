// =============================================================================
// dllmain.cpp — ZegenXFS_SP DLL entry + SPI surface stubs
// =============================================================================
//
// Phase 8a (this file): DllMain + every WFP* export stubbed to return either
// WFS_SUCCESS (where the spec demands it for the SP to load at all) or
// WFS_ERR_NOT_IMPLEMENTED. No real device logic here yet — that lands per-file
// under spi/ and devices/ in Phases 8b-11 per ROADMAP.md.
//
// Compile target: x64 Windows DLL, MSVC v143, /W4 /WX, C++20.
//
// References:
//   - CEN/XFS 3.30 spec, §B (SPI), §A.5 (return codes)
//   - Architecture_v3.md §5.1 (component breakdown)
//   - native/zegen-xfs-sp/ROADMAP.md (per-phase deliverables)
// =============================================================================

#define WIN32_LEAN_AND_MEAN
#include <windows.h>

// CEN/XFS headers — consumed via include/third_party/cen-xfs-3.30/INCLUDE.
// These shadow types let the file syntax-check on machines without the SDK
// (Phase 8a dev cycle); BUILD.md drops the real headers in for Phase 8b.
#if __has_include(<xfsapi.h>)
  #include <xfsapi.h>
  #include <xfsspi.h>
#else
  // Minimal shadow until the CEN SDK is on the build host.
  using HSERVICE   = unsigned short;
  using HPROVIDER  = void*;
  using REQUESTID  = unsigned long;
  using HRESULT    = long;
  using LPSTR      = char*;
  using LPVOID     = void*;
  using LPWFSVERSION = void*;

  constexpr HRESULT WFS_SUCCESS              = 0;
  constexpr HRESULT WFS_ERR_NOT_IMPLEMENTED  = -8;       // mapped from WFS_ERR_UNSUPP_COMMAND
  constexpr HRESULT WFS_ERR_INTERNAL_ERROR   = -5;
#endif

// -----------------------------------------------------------------------------
// DllMain — minimal: just record load/unload for spdlog later.
// -----------------------------------------------------------------------------

BOOL APIENTRY DllMain(HMODULE /*hModule*/, DWORD reason, LPVOID /*lpReserved*/) {
  switch (reason) {
    case DLL_PROCESS_ATTACH:
      // Phase 8b: initialise spdlog file sink, load registry config,
      // open SQLite store, start mgmt-plane WebSocket client.
      break;
    case DLL_PROCESS_DETACH:
      // Phase 8b: flush spdlog, close SQLite, close mgmt-plane client.
      break;
    case DLL_THREAD_ATTACH:
    case DLL_THREAD_DETACH:
    default:
      break;
  }
  return TRUE;
}

// -----------------------------------------------------------------------------
// SPI surface — stubs.
//
// Each function below MUST be present (see ZegenXFS_SP.def). Phase 8b moves
// each into its own file under spi/ with real handle tracking + device
// dispatch. For now we return WFS_ERR_NOT_IMPLEMENTED so the SP can load and
// register but a vendor middleware call gets a clean rejection rather than
// a crash.
// -----------------------------------------------------------------------------

extern "C" {

__declspec(dllexport) HRESULT WINAPI WFPOpen(
    HSERVICE       /*hService*/,
    LPSTR          /*lpszLogicalName*/,
    HPROVIDER      /*hProvider*/,
    LPSTR          /*lpszServiceName*/,
    DWORD          /*dwSrvcVersionsRequired*/,
    LPWFSVERSION   /*lpSrvcVersion*/,
    LPWFSVERSION   /*lpSPIVersion*/,
    HWND           /*hWnd*/,
    REQUESTID      /*ReqID*/) {
  // Phase 8b: register the hService in HServiceTable, instantiate a
  // VirtualDevice for the requested service class, post WFS_OPEN_COMPLETE
  // back to hWnd asynchronously.
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPClose(
    HSERVICE  /*hService*/,
    HWND      /*hWnd*/,
    REQUESTID /*ReqID*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPLock(
    HSERVICE  /*hService*/,
    DWORD     /*dwTimeOut*/,
    HWND      /*hWnd*/,
    REQUESTID /*ReqID*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPUnlock(
    HSERVICE  /*hService*/,
    HWND      /*hWnd*/,
    REQUESTID /*ReqID*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPExecute(
    HSERVICE  /*hService*/,
    DWORD     /*dwCommand*/,
    LPVOID    /*lpCmdData*/,
    DWORD     /*dwTimeOut*/,
    HWND      /*hWnd*/,
    REQUESTID /*ReqID*/) {
  // Phase 8b: dispatch (hService, dwCommand, lpCmdData) to the matching
  // VirtualDevice::handle(...). On completion, post WFS_EXECUTE_COMPLETE
  // with WFSRESULT* allocated via WFMAllocateBuffer.
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPGetInfo(
    HSERVICE  /*hService*/,
    DWORD     /*dwCategory*/,
    LPVOID    /*lpQueryDetails*/,
    DWORD     /*dwTimeOut*/,
    HWND      /*hWnd*/,
    REQUESTID /*ReqID*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPCancelAsyncRequest(
    HSERVICE  /*hService*/,
    REQUESTID /*ReqID*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPRegister(
    HSERVICE  /*hService*/,
    DWORD     /*dwEventClass*/,
    HWND      /*hWndReg*/,
    HWND      /*hWnd*/,
    REQUESTID /*ReqID*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPDeregister(
    HSERVICE  /*hService*/,
    DWORD     /*dwEventClass*/,
    HWND      /*hWndReg*/,
    HWND      /*hWnd*/,
    REQUESTID /*ReqID*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

__declspec(dllexport) HRESULT WINAPI WFPSetTraceLevel(
    HSERVICE /*hService*/,
    DWORD    /*dwTraceLevel*/) {
  return WFS_ERR_NOT_IMPLEMENTED;
}

}  // extern "C"
