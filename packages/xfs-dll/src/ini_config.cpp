// ini_config.cpp — parse ZegenXFS.ini into an IniConfig.

#include "ini_config.h"
#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <fstream>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

namespace zegen::wfs {

namespace {

std::string trim(std::string s) {
    size_t start = 0;
    while (start < s.size() &&
           (s[start] == ' ' || s[start] == '\t' || s[start] == '\r' || s[start] == '\n'))
        ++start;
    size_t end = s.size();
    while (end > start &&
           (s[end - 1] == ' ' || s[end - 1] == '\t' ||
            s[end - 1] == '\r' || s[end - 1] == '\n'))
        --end;
    return s.substr(start, end - start);
}

std::string to_upper(std::string s) {
    std::transform(s.begin(), s.end(), s.begin(),
                   [](unsigned char c) { return std::toupper(c); });
    return s;
}

bool file_exists(const std::string& p) {
    std::ifstream f(p);
    return f.good();
}

std::string default_ini_path() {
    // 1. explicit override
    if (const char* envp = std::getenv("ZEGEN_XFS_INI")) {
        std::string p(envp);
        if (!p.empty() && file_exists(p)) return p;
    }
    // 2. cwd
    if (file_exists("ZegenXFS.ini")) return "ZegenXFS.ini";

#ifdef _WIN32
    // 3. ProgramData
    char programData[MAX_PATH] = {};
    DWORD n = GetEnvironmentVariableA("ProgramData", programData, MAX_PATH);
    if (n > 0 && n < MAX_PATH) {
        std::string p = std::string(programData) + "\\Zegen\\ZegenXFS.ini";
        if (file_exists(p)) return p;
    }
    // 4. System32
    char sysDir[MAX_PATH] = {};
    UINT m = GetSystemDirectoryA(sysDir, MAX_PATH);
    if (m > 0 && m < MAX_PATH) {
        std::string p = std::string(sysDir) + "\\ZegenXFS.ini";
        if (file_exists(p)) return p;
    }
#else
    // Non-Windows (CI / macOS dev): /etc and home fallbacks.
    if (file_exists("/etc/ZegenXFS.ini")) return "/etc/ZegenXFS.ini";
    if (const char* home = std::getenv("HOME")) {
        std::string p = std::string(home) + "/.ZegenXFS.ini";
        if (file_exists(p)) return p;
    }
#endif
    return {};
}

uint32_t parse_u32(const std::string& v, uint32_t fallback) {
    if (v.empty()) return fallback;
    try {
        long long n = std::stoll(v);
        if (n < 0) return fallback;
        return static_cast<uint32_t>(n);
    } catch (...) {
        return fallback;
    }
}

uint16_t parse_u16(const std::string& v, uint16_t fallback) {
    uint32_t n = parse_u32(v, fallback);
    if (n > 0xFFFF) return fallback;
    return static_cast<uint16_t>(n);
}

} // namespace

IniConfig load_ini(const std::string& explicit_path) {
    IniConfig cfg;

    const std::string path = explicit_path.empty() ? default_ini_path() : explicit_path;
    if (path.empty()) return cfg;

    std::ifstream in(path);
    if (!in.is_open()) return cfg;

    std::string section;
    std::string line;
    while (std::getline(in, line)) {
        // Strip inline comments. Accept both `;` and `#` per common INI dialects.
        for (char delim : {';', '#'}) {
            size_t at = line.find(delim);
            if (at != std::string::npos) line = line.substr(0, at);
        }
        line = trim(line);
        if (line.empty()) continue;

        if (line.front() == '[' && line.back() == ']') {
            section = to_upper(line.substr(1, line.size() - 2));
            continue;
        }

        const size_t eq = line.find('=');
        if (eq == std::string::npos) continue;
        const std::string key = to_upper(trim(line.substr(0, eq)));
        const std::string val = trim(line.substr(eq + 1));
        if (key.empty()) continue;

        if (section == "BRIDGE") {
            if      (key == "HOST")               cfg.bridge_host        = val;
            else if (key == "PORT")               cfg.bridge_port        = parse_u16(val, cfg.bridge_port);
            else if (key == "CONNECTTIMEOUTMS")   cfg.connect_timeout_ms = parse_u32(val, cfg.connect_timeout_ms);
            else if (key == "REQUESTTIMEOUTMS")   cfg.request_timeout_ms = parse_u32(val, cfg.request_timeout_ms);
        } else if (section == "TRACE") {
            if      (key == "LEVEL")              cfg.trace_level = to_upper(val);
            else if (key == "LOGFILE")            cfg.log_file    = val;
        } else if (section == "SERVICES") {
            // Preserve original casing for service keys — CEN/XFS logical
            // names are case-sensitive in some implementations.
            std::string raw_key = trim(line.substr(0, eq));
            cfg.services[raw_key] = val;
        }
    }

    return cfg;
}

} // namespace zegen::wfs
