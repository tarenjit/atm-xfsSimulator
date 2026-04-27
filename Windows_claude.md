# Windows_claude.md — ATM XFS Simulator: What's Built, What's Pending, Windows Test Plan

> **Audience:** the next operator (you, future Claude, a new engineer, a customer SE) picking up the project on a **Windows dev/staging machine** with a ghost ATM image + multi-vendor middleware. This document is the single source of truth for *where we are*, *what remains*, and *how to run it on Windows*.
>
> **Last updated:** 2026-04-25 (Phase 8c.2 landed, commit `34f4a0b`).
>
> **Architecture target:** the simulator's **backend + UI run on Linux** (or a Linux VM next to the ghost); the **ZegenXFS.dll** is the *only* Windows artifact — it drops into the ghost ATM's XFS stack and forwards every `WFS*` call over TCP back to the backend.
>
> **⚠ ARCHITECTURE NOTE (added 2026-04-27):** This document describes the **TCP bridge architecture** (CLAUDE.md v2.0 plan). **Architecture_v3.md is now authoritative** and supersedes this approach: the C++ component should be a full in-VM Service Provider, not a TCP bridge. Code in `packages/xfs-dll/` will be migrated to `native/zegen-xfs-sp/` per Architecture_v3.md §16. Read this doc as historical context for what's built; read Architecture_v3.md for what to build next.

---

## 1. What exists today

### 1.1 Monorepo layout

| Path                                        | Role                                                                      |
|---------------------------------------------|---------------------------------------------------------------------------|
| [apps/xfs-server/](apps/xfs-server/)        | NestJS backend — XFS Manager, devices, ISO 8583, macros, ZXFS bridge     |
| [apps/atm-frontend/](apps/atm-frontend/)    | Next.js 14 ATM screen + operator console (themed)                         |
| [packages/xfs-core/](packages/xfs-core/)    | Pure command/event contracts (IDC/PIN/CDM/PTR) — zero runtime deps        |
| [packages/xfs-devices/](packages/xfs-devices/) | Virtual IDC/PIN/CDM/PTR device implementations                         |
| [packages/iso8583/](packages/iso8583/)      | ISO 8583 codec for the host emulator                                      |
| [packages/shared/](packages/shared/)        | Logger, env validator, error types, ID generator                          |
| [packages/xfs-dll/](packages/xfs-dll/)      | **Windows-only** — ZegenXFS.dll C++ source, builds on MSVC v143           |
| [prisma/](prisma/)                          | Postgres schema + migrations (sessions, macros, suites, cassettes, logs)  |

### 1.2 Phases shipped (all green)

| Phase   | Commit      | What                                                                             |
|---------|-------------|----------------------------------------------------------------------------------|
| 1       | (initial)   | Turborepo + pnpm workspaces + strict TS + lint/format                            |
| 2       | `b391aaf`   | ATM state machine + websocket to the front-end                                   |
| 3       | (early)     | XFS Manager + IDC/PIN/CDM/PTR virtual devices                                    |
| 4       | `b391aaf`   | ATM screen UI driven by live websocket events                                    |
| 5       | `b64cf09`   | Operator console (device status, cassettes, cards, logs, txn list)               |
| 6       | `6fdf828`   | ISO 8583 codec + OpenAPI docs + session replay                                   |
| 7       | `4193822`   | Postgres advisory locks, session replay UI, idle timeout, dev hardening          |
| 8a      | `ab49a23`   | ATMirage-style ATM widget + bank themes + FDK keys                               |
| 8a.1    | `f3a07e7`   | Unified PIN `111111`, auto-start PIN entry, dark/light toggle                    |
| 8a.2    | `2443884`   | Fascia/chrome theme tokens, bank theme live-switch                               |
| 8b      | `7913808`   | **Macro Test Studio MVP** — runner, REST, UI, demo macro                         |
| 8b.2    | `5f0b523`   | Macro recorder — record user actions into replayable steps                       |
| 8b.3    | `272fd14`   | Inline macro step editor + fix JSONB passthrough                                 |
| 8b.4    | `2e3041b`   | BullMQ-backed **macro suite scheduler** + suites UI                              |
| 8b.5    | `0c87ee4`   | Step parameter edit-in-place in MacroStepEditor                                  |
| 8c      | `ae67aee`   | **ZXFS TCP bridge** in `xfs-server` + ZegenXFS.dll Windows SPI skeleton           |
| 8c.1    | `05a0e40`   | C++ `BridgeClient` (WinSock2) + WFS codec + HSERVICE mapping                     |
| **8c.2**| `34f4a0b`   | **WFS marshallers + event router + INI loader**                                  |
| 9       | `342be37`   | Playwright E2E smoke — 5 tests driving the live UI                               |

### 1.3 Feature surface (end-user visible)

- **ATM screen** (`/atm`): chrome/fascia themes per bank, FDK keys, PIN pad, cash dispense animation, receipt overlay.
- **Operator console** (`/operator`): device status, cassettes (count/low/empty/jammed), card manager, live log stream, transaction list, session replay, macro studio, suite scheduler.
- **Macro Test Studio**: record a session → replay as a macro → edit steps/parameters inline → schedule as a suite on BullMQ.
- **ISO 8583 host emulator**: 1987 ASCII variant, fields 2/3/4/7/11/12/14/22/37/38/39/41/42/49 supported.
- **ZXFS bridge (port 9101)**: length-prefixed JSON over TCP; carries `WFPOpen` / `WFPClose` / `WFPExecute` / `WFPGetInfo` + async events.
- **ZegenXFS.dll**: Windows XFS Service Provider that proxies every `WFP*` call through the bridge.

### 1.4 Test + build status

| Check                        | Count  | Status |
|------------------------------|--------|--------|
| Turbo tasks (typecheck/lint/build) | 21 | ✅ all green |
| Jest suites (server-side)    | 33     | ✅ all passing |
| Playwright E2E               | 5      | ✅ all passing |
| C++ clang -fsyntax-only      | 6 files | ✅ parses clean (IDE tooling) |

---

## 2. What's done inside ZegenXFS.dll (Phase 8c.1 + 8c.2)

| Component                                                           | Status | Notes                                                                 |
|---------------------------------------------------------------------|--------|-----------------------------------------------------------------------|
| [src/dllmain.cpp](packages/xfs-dll/src/dllmain.cpp)                 | ✅     | Full WFP* export surface: Open/Close/Execute/GetInfo/Register/Deregister/Lock/Unlock/Cancel |
| [src/bridge_client.{h,cpp}](packages/xfs-dll/src/bridge_client.cpp) | ✅     | WinSock2 TCP client, correlation-id req/resp, auto-reconnect with backoff |
| [src/wfs_codec.{h,cpp}](packages/xfs-dll/src/wfs_codec.cpp)         | ✅     | Command-code map (27 commands) + per-command marshallers              |
| [src/wfs_shadow_types.h](packages/xfs-dll/src/wfs_shadow_types.h)   | ✅     | CEN/XFS 3.30 struct shadows (delete when real SDK headers land)       |
| [src/mini_json.h](packages/xfs-dll/src/mini_json.h)                 | ✅     | Header-only JSON writer + minimal reader — zero 3rd-party deps        |
| [src/event_router.{h,cpp}](packages/xfs-dll/src/event_router.cpp)   | ✅     | Routes ZXFS events → `WFMPostMessage`, keyed on logical name          |
| [src/ini_config.{h,cpp}](packages/xfs-dll/src/ini_config.cpp)       | ✅     | `ZegenXFS.ini` loader with multi-path search                          |
| [ZegenXFS.ini.example](packages/xfs-dll/ZegenXFS.ini.example)       | ✅     | Sample config                                                         |
| [ZXFS_PROTOCOL.md](packages/xfs-dll/ZXFS_PROTOCOL.md)               | ✅     | Frozen wire protocol                                                  |
| `ZegenXFS.vcxproj` (MSBuild)                                        | ❌     | **Needs to be created** — see §4.1                                    |
| `register-spi.reg` (registry hook)                                  | ❌     | **Needs to be created** — see §4.2                                    |
| WiX installer (`.msi`)                                              | ❌     | **Phase 8c.3** — see §5                                               |

### 2.1 Per-command marshaller coverage

All 27 commands in the codec dispatch table. Commands with inputs have real struct→JSON marshallers; commands with no inputs (`EJECT_CARD`, `PRESENT`, `CUT_PAPER` etc.) send `{}`.

| Service | Command                  | Marshaller | Response parser |
|---------|--------------------------|------------|-----------------|
| IDC     | READ_TRACK               | no input   | dllmain passes-through (variable-length) |
| IDC     | READ_RAW_DATA            | ✅ track bit-mask → `["1","2","3","chip"]` | (variable-length) |
| IDC     | EJECT_CARD / RETAIN_CARD | no input   | no typed output |
| IDC     | CHIP_IO / CHIP_POWER     | ✅ protocol + hex APDU | pending (phase 8c.3) |
| IDC     | RESET / RESET_COUNT      | no input   | no typed output |
| PIN     | GET_PIN / GET_DATA       | ✅ min/max/autoEnd + key/FDK bit-mask → string list | ✅ WFSPINENTRY {pinLength} |
| PIN     | GET_PINBLOCK             | ✅ keyName + format + PAN | ✅ WFSXDATA (length) |
| PIN     | GET_KEY_DETAIL / RESET   | no input   | passes through |
| CDM     | DISPENSE                 | ✅ amount/currency/mixType/present + customMix slots | passes through |
| CDM     | PRESENT / REJECT / RETRACT / COUNT / CASH_UNIT_INFO | no input | passes through |
| CDM     | RESET                    | no input   | passes through |
| PTR     | PRINT_FORM               | ✅ form/media/cut + parsed `KEY=value\r\n` fields | passes through |
| PTR     | RAW_DATA                 | ✅ printable-vs-base64 auto-detect | passes through |
| PTR     | CUT_PAPER / RESET        | no input   | passes through |

### 2.2 Event routing

The `EventRouter` singleton maintains two indexes:
1. `HSERVICE → [{HWND, event_class_mask}, …]` for subscribe/unsubscribe.
2. `logical_name ("IDC30") → HSERVICE` so async ZXFS event frames route back to the right subscriber.

On Windows the real build calls `PostMessageA(hwnd, msg, hash(eventCode), 0)` with `msg ∈ {WFS_SERVICE_EVENT, WFS_EXECUTE_EVENT, WFS_SYSTEM_EVENT, WFS_USER_EVENT}`. Future wiring (Phase 8c.3) swaps `PostMessage` for `WFMPostMessage` with a `WFSRESULT*` allocated via `WFMAllocateBuffer` so it survives past the call.

### 2.3 Config

The DLL searches for `ZegenXFS.ini` in:
1. `%ZEGEN_XFS_INI%` env var (absolute path override)
2. `ZegenXFS.ini` next to the running .exe (process cwd)
3. `%ProgramData%\Zegen\ZegenXFS.ini`
4. `%WINDIR%\System32\ZegenXFS.ini` (WOSA convention)

Missing file or missing keys → defaults (localhost:9101, INFO, no log file). The DLL **never refuses to start** because the INI is incomplete.

---

## 3. What still needs to be built

### 3.1 Gap inventory (ranked by risk)

| Gap                                    | Risk  | Phase  | Why it matters |
|----------------------------------------|-------|--------|----------------|
| `ZegenXFS.vcxproj` + MSBuild config    | HIGH  | 8c.3   | Blocks ALL real DLL testing on Windows |
| `register-spi.reg` for XFS Manager     | HIGH  | 8c.3   | Windows XFS Manager won't find the DLL without it |
| `WFMAllocateBuffer`-backed WFSRESULT   | MED   | 8c.3   | Event payloads currently use hash-as-WPARAM — works for routing verification, not for real vendor apps that read the WFSRESULT buffer |
| Variable-length response structs (READ_RAW_DATA, CASH_UNIT_INFO) copied into WFM buffers | MED | 8c.3 | Vendor apps need the actual byte arrays, not just result codes |
| WiX `.msi` installer                   | MED   | 8c.4   | Makes customer deployment one-click + audit-friendly |
| Real CEN/XFS SDK headers vs. shadow types | MED | 8c.3 | Shadow layouts track the spec but vendor SDKs sometimes pad — verify against real headers |
| Async request cancellation (`WFPCancelAsyncRequest`) | LOW | 8c.4 | Currently returns 0 — vendor timeout on cancel might hang |
| Structured logging + log rotation       | LOW   | 8c.4   | INI reserves `LogFile` but the DLL doesn't write yet |
| Code-signing the DLL (Authenticode)    | LOW   | 8c.4   | Some ghost images reject unsigned DLLs; also makes SmartScreen quiet |

### 3.2 Backend gaps (server-side)

| Gap                               | Risk | Phase | Why it matters |
|-----------------------------------|------|-------|----------------|
| ZXFS bridge authentication (token) | MED  | 8c.3  | Port 9101 is currently unauthenticated — fine for same-host only |
| ZXFS bridge TLS (mutual cert)     | LOW  | 8c.4  | Useful when the ghost VM crosses a subnet boundary |
| Per-HSERVICE rate limiting        | LOW  | 8c.4  | Defence against a runaway vendor app flooding the bridge |

### 3.3 Testing gaps

| Missing                                  | Phase |
|------------------------------------------|-------|
| C++ unit tests for marshallers (catch2)  | 8c.3  |
| Bridge load test (100 concurrent WFPExecute) | 8c.3 |
| End-to-end Windows smoke test (ghost VM → DLL → bridge → host) | 8c.3 |
| Vendor-matrix soak: Euronet MVS, APTRA, ProTopas, Hyosung MoniPlus | 8c.4 |

---

## 4. Windows setup + test plan

### 4.1 Prerequisites on the Windows dev machine

1. **Windows 10 22H2 or Windows Server 2019** (matches customer ghost ATM OS baseline).
2. **Visual Studio 2022 Community** with:
   - "Desktop development with C++" workload
   - MSVC v143 toolset
   - Windows SDK 10.0.22621
3. **CEN/XFS 3.30 SDK headers** — [download from CEN-CENELEC](https://www.cencenelec.eu/areas-of-work/xfs_cwa16926_330_release/) (free; installer zip). Extract into `packages\xfs-dll\third_party\cen-xfs-3.30\`.
4. **Windows XFS Manager** (`msxfs.dll`) — usually ships with the ghost image; on a bare dev box install from the CEN installer.
5. **Node.js 20 LTS + pnpm** (only if running the backend locally on the same box; the recommended layout runs the backend on a separate Linux VM).
6. **Python 3.11** for the live probe scripts.
7. **Git + winget** for tooling.

### 4.2 First-time build

Create `packages\xfs-dll\ZegenXFS.vcxproj` with the following skeleton (Phase 8c.3 will commit this):

```xml
<!-- Key settings -->
<ConfigurationType>DynamicLibrary</ConfigurationType>
<PlatformToolset>v143</PlatformToolset>
<CharacterSet>MultiByte</CharacterSet>  <!-- CEN/XFS strings are ANSI -->
<LanguageStandard>stdcpp20</LanguageStandard>

<!-- Sources -->
<ClCompile Include="src\dllmain.cpp" />
<ClCompile Include="src\bridge_client.cpp" />
<ClCompile Include="src\wfs_codec.cpp" />
<ClCompile Include="src\event_router.cpp" />
<ClCompile Include="src\ini_config.cpp" />

<!-- Deps -->
<AdditionalDependencies>ws2_32.lib;msxfs.lib;xfs_conf.lib;%(AdditionalDependencies)</AdditionalDependencies>
<AdditionalIncludeDirectories>include;third_party\cen-xfs-3.30\INCLUDE;%(AdditionalIncludeDirectories)</AdditionalIncludeDirectories>
```

Build:
```powershell
cd packages\xfs-dll
msbuild ZegenXFS.vcxproj /p:Configuration=Release /p:Platform=x64
# Output: bin\x64\Release\ZegenXFS.dll
```

When the real SDK lands: **delete `src\wfs_shadow_types.h`** and swap the include for `<xfsidc.h>` etc. — marshallers compile unchanged because field names match the spec.

### 4.3 Register the SPI

Save as `packages\xfs-dll\register-spi.reg` and run once (elevated):

```reg
Windows Registry Editor Version 5.00

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\SERVICE_PROVIDERS\ZegenXFS_IDC]
@="IDC"
"dllname"="C:\\Program Files\\Zegen\\ATMirror\\ZegenXFS.dll"
"vendor_name"="Zegen Solusi Mandiri"
"version"="1.0.0"

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\SERVICE_PROVIDERS\ZegenXFS_PIN]
@="PIN"
"dllname"="C:\\Program Files\\Zegen\\ATMirror\\ZegenXFS.dll"
"vendor_name"="Zegen Solusi Mandiri"
"version"="1.0.0"

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\SERVICE_PROVIDERS\ZegenXFS_CDM]
@="CDM"
"dllname"="C:\\Program Files\\Zegen\\ATMirror\\ZegenXFS.dll"
"vendor_name"="Zegen Solusi Mandiri"
"version"="1.0.0"

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\SERVICE_PROVIDERS\ZegenXFS_PTR]
@="PTR"
"dllname"="C:\\Program Files\\Zegen\\ATMirror\\ZegenXFS.dll"
"vendor_name"="Zegen Solusi Mandiri"
"version"="1.0.0"

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\LOGICAL_SERVICES\IDC30]
"provider"="ZegenXFS_IDC"

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\LOGICAL_SERVICES\PIN30]
"provider"="ZegenXFS_PIN"

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\LOGICAL_SERVICES\CDM30]
"provider"="ZegenXFS_CDM"

[HKEY_LOCAL_MACHINE\SOFTWARE\XFS\LOGICAL_SERVICES\PTR30]
"provider"="ZegenXFS_PTR"
```

**CRITICAL — back up first:**
```powershell
reg export HKLM\SOFTWARE\XFS xfs-backup.reg
```
If something breaks: `reg import xfs-backup.reg` restores the vendor-original SPI bindings.

### 4.4 Deploy + configure

```powershell
# Copy DLL
New-Item -ItemType Directory -Force "C:\Program Files\Zegen\ATMirror"
Copy-Item bin\x64\Release\ZegenXFS.dll "C:\Program Files\Zegen\ATMirror\"

# Copy INI (edit Host to point at the Linux backend)
New-Item -ItemType Directory -Force "C:\ProgramData\Zegen\ATMirror"
Copy-Item ZegenXFS.ini.example "C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini"
notepad "C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini"   # set Host = 10.x.x.x
```

### 4.5 Start the backend (Linux VM)

```bash
cd atm-xfs-simulator
ZXFS_BRIDGE_ENABLED=true pnpm -w dev                    # dev mode
# or for production-stable UI:
ZXFS_BRIDGE_ENABLED=true pnpm --filter @atm/xfs-server start
ZXFS_BRIDGE_ENABLED=true pnpm --filter @atm/atm-frontend serve
```

Verify bridge is listening:
```bash
nc -zv <linux-vm> 9101
```

### 4.6 Live-probe from Windows (before the vendor middleware is in the loop)

`scripts/zxfs_probe.py` (already in repo, add if missing):

```python
import json, socket, struct, time

def frame(obj):
    body = json.dumps(obj).encode()
    return struct.pack('<I', len(body)) + body

def send(sock, obj):
    sock.sendall(frame(obj))
    hdr = sock.recv(4)
    n, = struct.unpack('<I', hdr)
    return json.loads(sock.recv(n).decode())

s = socket.create_connection(("LINUX_VM_IP", 9101), timeout=5)
print(send(s, {"type":"ping","id":"p1"}))                     # → {"type":"pong", ...}
r = send(s, {"type":"request","id":"r1","op":"WFPOpen","service":"IDC"})
print(r)  # → {"result":0,"payload":{"hService":"IDC30"}, ...}
```

Run on Windows:
```powershell
python scripts\zxfs_probe.py
```

### 4.7 Test the DLL through the XFS Manager

Use the CEN/XFS Test Utility (`xfstest.exe`, ships with CEN installer) or a minimal C harness:

```c
#include <xfsapi.h>
int main() {
    HSERVICE h; REQUESTID req;
    WFSStartUp(..., NULL);
    HRESULT r = WFSOpen("IDC30", ..., &h);              // → 0
    r = WFSExecute(h, WFS_CMD_IDC_READ_TRACK, NULL, 30000, &res);  // → 0 + track data
    WFSClose(h);
    WFSCleanUp();
    return 0;
}
```

Expected wire traffic (tail `ZegenXFS.log` or `tcpdump -A -i any port 9101`):
1. `WFPOpen("IDC") → {"result":0,"payload":{"hService":"IDC30"}}`
2. `WFPExecute("IDC30","WFS_CMD_IDC_READ_TRACK",{}) → {"result":0,"payload":{"track1":"...","track2":"...","pan":"..."}}`
3. `WFPClose("IDC30") → {"result":0}`

### 4.8 Integration acceptance test plan (12 steps)

Per `README.md` §6.3 — run against each tier-1 middleware (Euronet MVS, NCR APTRA Edge, Diebold Vynx / ProTopas, Hyosung MoniPlus):

1. `WFSStartUp` succeeds.
2. `WFSOpen` succeeds for IDC / PIN / CDM / PTR.
3. `WFSGetInfo` returns a struct the middleware accepts.
4. Card insert (operator console → insert) triggers `WFS_SRVE_IDC_MEDIAINSERTED`.
5. `WFS_CMD_IDC_READ_TRACK` returns track data the middleware parses.
6. `WFS_CMD_PIN_GET_PIN` captures a PIN.
7. `WFS_CMD_PIN_GET_PINBLOCK` returns an encrypted block the host accepts.
8. `WFS_CMD_CDM_DISPENSE` dispenses the correct mix.
9. `WFS_CMD_CDM_PRESENT` + `ITEMSTAKEN` sequence works.
10. `WFS_CMD_PTR_PRINT_FORM` prints a receipt.
11. `WFS_CMD_IDC_EJECT_CARD` works.
12. Full end-to-end withdrawal through the middleware completes and reaches the bank host over ISO 8583.

---

## 5. Roadmap

### 5.1 Phase 8c.3 — **Windows build + real ATM smoke test** (next)

**Goal:** produce a `.dll` that MSBuild builds reproducibly and that a vendor middleware can load.

Work items:
- [ ] Commit `ZegenXFS.vcxproj` + `ZegenXFS.sln`.
- [ ] Commit `register-spi.reg` + `unregister-spi.reg`.
- [ ] Wire `WFMAllocateBuffer` so `WFPExecute` populates variable-length result structs (`WFSIDCCARDDATA[]`, `WFSCDMCASHUNIT[]`) instead of passing through.
- [ ] Wire `WFMPostMessage` in `event_router.cpp` (replace `PostMessage` stub).
- [ ] Write Catch2 unit tests for each marshaller (`test/test_wfs_codec.cpp`).
- [ ] Add a Windows CI leg (GitHub Actions `windows-latest` runner) that builds `ZegenXFS.dll` on every PR.
- [ ] Smoke-test the DLL on a local Windows dev box using the CEN test harness (`xfstest.exe`).
- [ ] Add a `docs/integration-playbook.md` with step-by-step ghost-ATM rollout + rollback.

### 5.2 Phase 8c.4 — **Installer + hardening**

- [ ] WiX `.msi` installer that:
  - Installs `ZegenXFS.dll` to `C:\Program Files\Zegen\ATMirror\`.
  - Writes `ZegenXFS.ini` to `C:\ProgramData\Zegen\ATMirror\` (with customer's host/port).
  - Imports `register-spi.reg`.
  - Backs up the existing `HKLM\SOFTWARE\XFS` tree before changes.
  - Offers a clean uninstall that restores the backup.
- [ ] Code-sign the DLL + MSI (Authenticode).
- [ ] Add bridge auth (shared-secret HMAC on every frame) + optional TLS with client-cert.
- [ ] Structured file logging with rotation (use `spdlog` via vcpkg).
- [ ] Per-hService rate limiter on the bridge server side.

### 5.3 Phase 8c.5 — **Multi-vendor matrix soak**

- [ ] Spin up one Windows ghost VM per tier-1 middleware.
- [ ] Run the 12-step acceptance test suite from §4.8 on each.
- [ ] Document vendor-specific quirks (Hyosung extra padding in `WFSCDMDENOMINATION`, APTRA chip-IO protocol IDs, etc.) in `docs/vendor-quirks.md`.
- [ ] Publish a compatibility matrix in the main README.

### 5.4 Phase 10+ — Product work (post-DLL)

Not on the critical path for the ghost-VM milestone but queued in the backlog:

- [ ] Multi-ATM fleet mode (one backend hosts N virtual ATMs, each with its own hService namespace).
- [ ] Chaos/fault injection in the operator console (inject jams, comms timeouts, cassette empty).
- [ ] Audit-grade session replay export (signed JSON + video).
- [ ] SNMP MIB exposure for ops dashboards.
- [ ] XFS4IoT (CWA 16926 v4) alternative transport — parallel to the v3 DLL path.

---

## 6. Known hazards + how to avoid them

| Hazard                                                                     | Mitigation                                                                                 |
|----------------------------------------------------------------------------|--------------------------------------------------------------------------------------------|
| Overwriting the ghost's original SPI bindings                              | **Always `reg export HKLM\SOFTWARE\XFS xfs-backup.reg` before applying `register-spi.reg`** |
| Shadow struct layout diverges from real vendor SDK                         | Diff `wfs_shadow_types.h` against `xfsidc.h` / `xfspin.h` / `xfscdm.h` / `xfsptr.h` — add any padding fields before building with the real header |
| Windows XFS Manager caches DLLs — changes don't take effect                | Restart the XFS service: `net stop XFS_Service && net start XFS_Service` (or reboot VM)     |
| Bridge port 9101 blocked by Windows Firewall                               | `New-NetFirewallRule -DisplayName "ZXFS out" -Direction Outbound -Protocol TCP -RemotePort 9101 -Action Allow` |
| DLL loads but `WFSOpen` returns `-9 ERR_SERVICE_NOT_FOUND`                 | Backend isn't running, or `ZXFS_BRIDGE_ENABLED` isn't set, or the Linux VM is unreachable. `ping <linux-vm>` + `nc -zv <linux-vm> 9101` from Windows. |
| PIN block returns empty string (`usLength=0`)                              | `WFMAllocateBuffer` wiring pending (Phase 8c.3) — for now the response parser records the length but not the bytes |
| Vendor middleware freezes on `WFSExecute`                                  | Check `dwTimeOut` vs `RequestTimeoutMs` in the INI — make the INI value ≥ the vendor's default |
| Multiple ATM apps share one DLL load → HSERVICE collisions                 | The `g_services` map is per-DLL-load; if the ghost has two independent processes using XFS, each gets its own DLL instance — generally fine, but verify under load |

---

## 7. Quick command reference

```powershell
# Windows side — build DLL
cd packages\xfs-dll
msbuild ZegenXFS.vcxproj /p:Configuration=Release /p:Platform=x64

# Windows — register SPI (elevated)
reg export HKLM\SOFTWARE\XFS xfs-backup.reg
regedit /s register-spi.reg

# Windows — deploy
copy bin\x64\Release\ZegenXFS.dll "C:\Program Files\Zegen\ATMirror\"
copy ZegenXFS.ini.example "C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini"
notepad "C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini"

# Windows — live probe
python scripts\zxfs_probe.py

# Windows — rollback
regedit /s xfs-backup.reg
del "C:\Program Files\Zegen\ATMirror\ZegenXFS.dll"
```

```bash
# Linux side — start backend with bridge enabled
cd atm-xfs-simulator
ZXFS_BRIDGE_ENABLED=true pnpm -w dev                    # dev
ZXFS_BRIDGE_ENABLED=true pnpm --filter @atm/xfs-server start  # prod

# Linux — full CI gate
pnpm turbo typecheck lint build test
pnpm --filter @atm/atm-frontend test:e2e
```

---

## 8. Pointers to canonical docs

- [README.md](README.md) — project overview
- [Update_features.md](Update_features.md) — original feature PRD (Phase-by-phase plan)
- [packages/xfs-dll/README.md](packages/xfs-dll/README.md) — DLL-specific quickstart
- [packages/xfs-dll/ZXFS_PROTOCOL.md](packages/xfs-dll/ZXFS_PROTOCOL.md) — wire protocol
- [packages/xfs-dll/ZegenXFS.ini.example](packages/xfs-dll/ZegenXFS.ini.example) — sample config
- [docs/](docs/) — architecture + deployment notes (keep adding here)

---

## 9. When you're handing this off

The critical context that isn't obvious from the code:
1. **The backend is Linux-hosted, the DLL is the only Windows piece.** Don't try to run the backend on Windows — it works but isn't the supported path, and you'll have to redo env/path setup.
2. **The shadow types are a placeholder.** They track the CEN/XFS 3.30 spec accurately, but *vendor SDKs sometimes pad fields* for alignment. Always diff against the real header before a production deploy.
3. **Always back up `HKLM\SOFTWARE\XFS` before registering.** Ghost ATM images are expensive to rebuild.
4. **The 12-step acceptance plan in §4.8 is the minimum before claiming "integrated with vendor X"** — partial passes indicate you're about to ship a support nightmare.
5. **`ZXFS_BRIDGE_ENABLED=true` is off by default** for safety — dev machines don't open a rogue TCP port. Only flip it on when you actually want the DLL to connect.
6. **Phase 8c.3 (Windows build infrastructure) is the current blocker** for any real vendor testing.
