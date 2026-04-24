// ini_config.h — ZegenXFS.ini loader.
//
// The vendor ATM app expects to find ZegenXFS.ini next to ZegenXFS.dll
// (or in %WINDIR%\System32 where msxfs.dll picks it up by convention).
// The file tells the DLL:
//   - bridge host:port to connect to
//   - per-service WFS_CFG_LGL_NAMES entries (IDC30, PIN30, CDM30, PTR30)
//   - trace level
//
// Format (match WOSA/XFS registry layout where possible):
//
//     [Bridge]
//     Host=127.0.0.1
//     Port=9101
//     ConnectTimeoutMs=5000
//     RequestTimeoutMs=30000
//
//     [Trace]
//     Level=INFO
//     LogFile=C:\ProgramData\Zegen\xfs.log
//
//     [Services]
//     IDC30=IDC
//     PIN30=PIN
//     CDM30=CDM
//     PTR30=PTR
//
// No ini = defaults (localhost:9101, no logging). Missing keys fall back
// to defaults individually — the DLL never refuses to start because the
// INI is incomplete.

#pragma once

#include <cstdint>
#include <string>
#include <unordered_map>

namespace zegen::wfs {

struct IniConfig {
    // [Bridge]
    std::string  bridge_host          = "127.0.0.1";
    uint16_t     bridge_port          = 9101;
    uint32_t     connect_timeout_ms   = 5000;
    uint32_t     request_timeout_ms   = 30000;

    // [Trace]
    std::string  trace_level          = "INFO";
    std::string  log_file;

    // [Services] — logical name → service class map.
    // Entries here augment whatever the vendor app passes to WFSOpen;
    // if the vendor names a service that isn't in this map, we fall
    // back to the last 3 chars of the logical name ("IDC30" → "IDC").
    std::unordered_map<std::string, std::string> services;
};

/**
 * Load ZegenXFS.ini. `path` may be absolute; empty string triggers the
 * default search sequence:
 *   1. %ZEGEN_XFS_INI% env var if set
 *   2. ./ZegenXFS.ini next to the executable
 *   3. %ProgramData%\Zegen\ZegenXFS.ini
 *   4. ZegenXFS.ini in %WINDIR%\System32 (WOSA convention)
 * On any failure the returned IniConfig contains defaults — the loader
 * never throws. Returns the config it actually used.
 */
IniConfig load_ini(const std::string& path = "");

} // namespace zegen::wfs
