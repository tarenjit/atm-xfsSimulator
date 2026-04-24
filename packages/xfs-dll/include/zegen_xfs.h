// zegen_xfs.h — Public C API for ZegenXFS.dll
//
// This mirrors the CEN/XFS 3.30 Service Provider Interface. The Windows
// XFS Manager (msxfs.dll) dispatches every WFS* application call through
// our exported WFP* functions; we serialize them to JSON frames over TCP
// to the ATMirror xfs-server backend.
//
// Build target: Windows x64, MSVC v143, C++20.
// Not buildable on macOS / Linux — Phase 8c source reference only.

#pragma once

#ifdef _WIN32
#include <windows.h>
#else
// Allow the source to at least parse on macOS/Linux for IDE tooling;
// real builds must be on Windows with the XFS SDK.
typedef void* HSERVICE;
typedef long  HRESULT;
typedef unsigned long DWORD;
typedef unsigned short WORD;
#endif

#ifdef __cplusplus
extern "C" {
#endif

// Called by the XFS Manager when the vendor app calls WFSOpen.
// Returns 0 on success; negative on error (see ZXFS_PROTOCOL.md §6).
__declspec(dllexport) HRESULT WFPOpen(
    HSERVICE  hService,
    const char* lpszLogicalName,
    DWORD     hApp,
    const char* lpszAppID,
    DWORD     dwTraceLevel,
    DWORD     dwTimeOut,
    HWND      hWnd,
    DWORD     ReqID,
    HPROVIDER hProvider,
    DWORD     dwSPIVersionsRequired,
    void*     lpSPIVersion,
    DWORD     dwSrvcVersionsRequired,
    void*     lpSrvcVersion);

__declspec(dllexport) HRESULT WFPClose(HSERVICE hService, HWND hWnd, DWORD ReqID);

__declspec(dllexport) HRESULT WFPGetInfo(
    HSERVICE  hService,
    DWORD     dwCategory,
    void*     lpQueryDetails,
    DWORD     dwTimeOut,
    HWND      hWnd,
    DWORD     ReqID);

__declspec(dllexport) HRESULT WFPExecute(
    HSERVICE  hService,
    DWORD     dwCommand,
    void*     lpCmdData,
    DWORD     dwTimeOut,
    HWND      hWnd,
    DWORD     ReqID);

__declspec(dllexport) HRESULT WFPCancelAsyncRequest(HSERVICE hService, DWORD ReqID);

__declspec(dllexport) HRESULT WFPRegister(
    HSERVICE  hService,
    DWORD     dwEventClass,
    HWND      hWndReg,
    HWND      hWnd,
    DWORD     ReqID);

__declspec(dllexport) HRESULT WFPDeregister(
    HSERVICE  hService,
    DWORD     dwEventClass,
    HWND      hWndReg,
    HWND      hWnd,
    DWORD     ReqID);

__declspec(dllexport) HRESULT WFPLock(
    HSERVICE  hService,
    DWORD     dwTimeOut,
    HWND      hWnd,
    DWORD     ReqID);

__declspec(dllexport) HRESULT WFPUnlock(HSERVICE hService, HWND hWnd, DWORD ReqID);

#ifdef __cplusplus
}
#endif
