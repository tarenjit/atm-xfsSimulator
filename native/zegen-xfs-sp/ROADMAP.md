# ROADMAP.md — ZegenXFS_SP Phase 8a → 14

> **Audience**: the senior C++ developer picking up the in-VM Service Provider work after the TypeScript management plane is shipped.
>
> **Total scope**: 12 weeks of focused work, ~22,000 LOC C++ + tests, delivering Tier 2 (in-VM Service Provider) per [docs/Architecture_v3.md §10](../../docs/Architecture_v3.md).
>
> **Prerequisites met by Phase 8a (this commit)**:
> - Folder layout, vcpkg manifest, SPI .def file, dllmain.cpp with all WFP* exports stubbed
> - Real C++ codegen replacing the Phase 2 stub — headers emit from `spec/xfs-contract.yaml` into `ZegenXFS_SP/include/generated/`
> - BUILD.md describing Windows + VS 2022 + vcpkg + CEN/XFS SDK setup
>
> **Prerequisites NOT met by Phase 8a (need human action)**:
> - Visual Studio 2022 installed on the build host
> - vcpkg bootstrapped at `C:\vcpkg`
> - CEN/XFS 3.30 SDK headers extracted into `ZegenXFS_SP/include/third_party/cen-xfs-3.30/`
> - EV code-signing certificate ordered (4-6 weeks lead time — order in Phase 11 latest)
> - First PoC bank identified (suggested: Bank DKI, Bank Jatim, or a regional development bank)

---

## Phase 8a.1 — VS solution + .vcxproj + Windows CI (1-2 days)

**Goal**: build `ZegenXFS_SP.dll` reproducibly from MSBuild + a GitHub Actions runner.

Work items:
- [ ] `ZegenXFS_SP.sln` — single-project solution
- [ ] `ZegenXFS_SP/ZegenXFS_SP.vcxproj` per [BUILD.md §3](BUILD.md):
  - `ConfigurationType` = `DynamicLibrary`
  - `PlatformToolset` = `v143`
  - `LanguageStandard` = `stdcpp20`
  - `CharacterSet` = `MultiByte` (XFS strings are ANSI)
  - `WarningLevel` = `Level4`, `TreatWarningAsError` = `true`
  - Sources: every `.cpp` under `spi/`, `devices/`, `emv/`, `events/`, `store/`, `mgmt/`, `profile/`, `config/`, `util/` plus `dllmain.cpp`
  - Module def: `ZegenXFS_SP.def`
  - AdditionalDependencies: `ws2_32.lib;msxfs.lib;xfs_conf.lib`
  - AdditionalIncludeDirectories: `include;include/generated;include/third_party/cen-xfs-3.30/INCLUDE`
- [ ] `.github/workflows/cpp-windows.yml` running on `windows-latest`:
  - Restore vcpkg cache
  - `vcpkg install --triplet x64-windows --x-manifest-root=native/zegen-xfs-sp`
  - `msbuild ZegenXFS_SP.vcxproj /p:Configuration=Release /p:Platform=x64`
  - Upload `ZegenXFS_SP.dll` artefact
- [ ] Smoke verification: `dumpbin /exports ZegenXFS_SP.dll` lists all 10 WFP* names

**Exit criteria**: Windows CI green; an artefact-downloaded DLL loads (with 6.05 = unimplemented) when called from a minimal harness.

---

## Phase 8b — DLL skeleton wires to handle table + event router (3-5 days)

**Goal**: empty SP loads in real Windows XFS Manager and returns clean WFS_SUCCESS on `WFPOpen`.

Work items:
- [ ] `spi/hservice_table.cpp` — thread-safe `unordered_map<HSERVICE, ServiceState>`
- [ ] Split `dllmain.cpp` stubs into `spi/wfp_*.cpp` (one file per export). `WFPOpen` registers the hService, posts `WFS_OPEN_COMPLETE` to the host window via `WFMPostMessage`. `WFPClose` removes from table.
- [ ] `events/event_poster.cpp` — wraps `WFMPostMessage` with `WFMAllocateBuffer` so the WFSRESULT survives past the call.
- [ ] `events/event_queue.cpp` — per-service ordered queue.
- [ ] `events/async_request_table.cpp` — tracks REQUESTID handles for `WFPCancelAsyncRequest`.
- [ ] `config/registry_config.cpp` — reads `HKLM\SOFTWARE\Zegen\ATMirror`.
- [ ] `config/ini_config.cpp` — fallback loader (port from packages/xfs-dll/src/ini_config.cpp).
- [ ] `util/logger.cpp` — spdlog file sink with rotation.
- [ ] `installer/register-spi.reg` (port from packages/xfs-dll/register-spi.reg.example, edit dllname path).

**Exit criteria**: smoke test from BUILD.md §6 — `xfstest.exe IDC30` returns `0` on `WFSStartUp` and `WFSOpen`; `WFSExecute` cleanly returns `WFS_ERR_UNSUPP_COMMAND`.

---

## Phase 9 — IDC + PIN devices in C++ (2 weeks, ~3,200 LOC)

**Source of truth**: TS implementations in `packages/xfs-devices/src/{idc,pin}/*.service.ts`.

Work items:
- [ ] `devices/base/virtual_device.{h,cpp}` — port `VirtualDeviceBase` (state machine + error injection + delay simulation).
- [ ] `devices/idc/idc_device.{h,cpp}` — port IDC service:
  - Card-in-reader state, motor reader semantics
  - READ_TRACK / READ_RAW_DATA / EJECT / RETAIN
  - Wire CHIP_IO + CHIP_POWER to `emv/emv_simulator` (Phase 11 — stub-return for now)
- [ ] `devices/idc/card_inventory.{cpp}` — virtual card store, persisted in SQLite.
- [ ] `devices/idc/magstripe_codec.cpp` — track1/track2 ASCII codec.
- [ ] `devices/pin/pin_device.{h,cpp}` — PIN entry state machine + FDK handling.
- [ ] `devices/pin/key_store.cpp` — TPK/TMK/TWK key ring (in-memory; production uses HSM).
- [ ] `devices/pin/pin_block_iso0.cpp` — ISO-0/1/3 PIN block generation.
- [ ] `devices/pin/des_3des.cpp` — 3DES encryption (use OpenSSL EVP).
- [ ] `store/sqlite_store.{h,cpp}` — SQLite wrapper (open + prepare + bind + step).
- [ ] `store/card_inventory_store.cpp` — schema + CRUD for virtual cards.
- [ ] `tests/unit/idc_test.cpp` + `tests/unit/pin_test.cpp` — GoogleTest coverage matching TS spec tests 1:1.
- [ ] `tests/contract/contract_runner.cpp` — YAML-driven shared test runner. First fixture: `spec/contract/idc-basic.yaml` mirroring `idc.service.spec.ts`.

**Exit criteria**: integration test in `tests/integration/` loads the DLL, `WFSExecute(IDC30, READ_TRACK)` returns the same bytes the TS device returns for the same card.

---

## Phase 10 — CDM + PTR + SIU devices in C++ (2 weeks, ~4,100 LOC)

**Source of truth**: TS implementations in `packages/xfs-devices/src/{cdm,ptr,siu}/*.service.ts`.

Work items:
- [ ] `devices/cdm/cdm_device.{h,cpp}` — dispense / present / retract / reject / count / cash-unit-info.
- [ ] `devices/cdm/cassette.{cpp}` — cassette model (denomination, count, status).
- [ ] `devices/cdm/denomination_mix.cpp` — port the min-notes algorithm from TS `cdm.service.ts`.
- [ ] `devices/cdm/presenter.cpp` — present-with-auto-retract timer.
- [ ] `store/cassette_state.cpp` — SQLite persistence so cassettes survive SP reload.
- [ ] `devices/ptr/ptr_device.{h,cpp}` — print form / raw data / cut.
- [ ] `devices/ptr/form_renderer.cpp` — Handlebars-ish template substitution (port from TS).
- [ ] `devices/siu/siu_device.{h,cpp}` — sensor + indicator state machine.
- [ ] GoogleTest unit + contract YAML coverage for all three.

**Exit criteria**: full end-to-end withdrawal flow runs through the in-VM SP — IDC card insert + PIN entry + CDM dispense + PTR receipt — with the same observable behaviour as native mode.

---

## Phase 11 — EMV L2 + error injection + profile loader (2 weeks, ~3,800 LOC)

**Source of truth**: TS implementation in `packages/emv/src/emv-simulator.ts`.

Work items:
- [ ] `emv/emv_simulator.{h,cpp}` — port `EmvSimulator` class.
- [ ] `emv/apdu_handlers.cpp` — SELECT PSE/AID, GPO, READ RECORD, GENERATE AC.
- [ ] `emv/tlv_codec.cpp` — port BER-TLV codec (encode/decode/findTag).
- [ ] `emv/application_selection.cpp` — multi-AID priority list.
- [ ] `emv/cryptogram.cpp` — ARQC generator (deterministic FNV-1a fake matching TS).
- [ ] `devices/base/error_injection.cpp` — port the per-command error-injection engine.
- [ ] `profile/profile_loader.cpp` — pull active ATM profile from registry / mgmt-plane.
- [ ] `profile/{hyosung,ncr,diebold}_profile.cpp` — vendor-specific FDK layouts + cassette caps + chip protocol overrides.
- [ ] Contract YAML for EMV: `spec/contract/emv-visa-flow.yaml` covering full PSE→GPO→READ→GENAC.

**Exit criteria**: an EMV chip card inserted in the SP produces an ARQC byte-identical to the TS simulator (deterministic seeding) and the host-emulator approves it.

---

## Phase 12 — Management plane WebSocket client + ZegenXFS_Agent (2 weeks, ~3,000 LOC)

**Source of truth**: protocol spec in [Architecture_v3.md §8.2](../../docs/Architecture_v3.md).

Work items in `ZegenXFS_SP/mgmt/`:
- [ ] `mgmt_client.{h,cpp}` — Boost.Beast WebSocket client over TLS.
- [ ] `log_forwarder.cpp` — batches command + event logs every 5s, COMMAND_LOG_BATCH frames.
- [ ] `macro_loader.cpp` — receives LOAD_MACRO / RUN_MACRO frames, executes against in-process devices.
- [ ] `error_injection_sync.cpp` — applies INJECT_ERROR / CLEAR_ERROR rules from server.
- [ ] `heartbeat.cpp` — 30s heartbeat with HealthMetrics payload.
- [ ] Auto-reconnect with exponential backoff; offline-buffer drains to SQLite ring buffer (100k entries).

Work items in `ZegenXFS_Agent/`:
- [ ] `service_main.cpp` — Windows service entry (svchost integration).
- [ ] `screen_capture/dxgi_capture.cpp` — Desktop Duplication API (start with periodic JPEG; WebRTC defers to Phase 14).
- [ ] `health/metrics_reporter.cpp` — CPU, memory, disk, last-XFS-cmd timestamps.
- [ ] `remote_control/command_server.cpp` — named-pipe IPC to the SP (`\\.\pipe\ZegenXFS_Control`).

Server-side (TS work, lives in `apps/xfs-server/`):
- [ ] WebSocket gateway at `wss://server/agent` with HELLO/HELLO_ACK auth handshake.
- [ ] VM registry endpoints (CRUD on GhostVm + AgentSession Prisma models — Phase 1 already shipped the schema).
- [ ] Multi-VM macro orchestration (RUN_MACRO fan-out + result aggregation).

**Exit criteria**: a single ghost VM connects to the server, server pushes a 5-step macro, SP executes against vendor middleware, server receives MACRO_RESULT + evidence frames.

---

## Phase 13 — Customer integration & first PoC (1 week)

**First PoC customer (confirmed)**: **Jalin Pembayaran Indonesia** running
**Euronet MVS** in member-bank ghost ATM VMs. See
[`docs/integrations/jalin-euronet-poc.md`](../../docs/integrations/jalin-euronet-poc.md)
for the full integration playbook (pre-engagement checklist, install sequence,
rollback recipe, 9-point acceptance criteria, known unknowns to clarify with
the Euronet integration engineer).

Work items:
- [ ] `installer/ZegenXFS.wxs` — WiX MSI:
  - Deploys DLL to `C:\Program Files\Zegen\ATMirror\`
  - Writes config to `C:\ProgramData\Zegen\ATMirror\ZegenXFS.ini`
  - Backs up `HKLM\SOFTWARE\XFS` before changes
  - Imports `register-spi.reg`
  - Installs ZegenXFS_Agent as a Windows service
  - Clean uninstall restores the registry backup
- [ ] `installer/post-install.ps1` — restart XFS service, validate connection.
- [ ] **Jalin-specific deliverables** (per `docs/integrations/jalin-euronet-poc.md`):
  - Confirmed Euronet MVS major.minor on Jalin's ghost VM
  - Jalin-specific bank theme + receipt template (Bahasa Indonesia, including statutory wording)
  - Hardware profile matching the cloned-from-real-ATM ghost (Hyosung / NCR / DN — confirm with Jalin ops)
  - HSM key-management config alignment (TPK / TMK rotation cadence + ISO0/1/3 selection)
  - Indonesian network policy timeouts (per-tx + retry) match Jalin switch's expectations
  - 9-point acceptance test suite from the playbook §6, all green on the ghost
- [ ] Verify [`docs/device-error-matrix.md`](../../docs/device-error-matrix.md) "ATM app response" column against actual Euronet MVS behaviour during walk-through with Jalin's QA engineer.
- [ ] Hardening cycle from real-world feedback.

**Exit criteria**: Jalin's ghost VM runs the 9-point acceptance suite from
[`docs/integrations/jalin-euronet-poc.md`](../../docs/integrations/jalin-euronet-poc.md) §6
end-to-end through Euronet MVS, and the QA team can record + replay sessions
from our management plane.

---

## Phase 14 — Production hardening (1 week)

Work items:
- [ ] Multi-VM testing — 50 ghost VMs connected to one management server.
- [ ] Load test: 50-VM × 10-cmd/sec sustained for 1 hour. p95 latency < 500ms.
- [ ] Security review:
  - TLS 1.3 client/server cert pinning
  - Auth-token rotation cycle
  - Code-sign DLL + MSI with EV cert
  - Audit log tamper-evidence (hash chain)
- [ ] WebRTC screen streaming upgrade (replace JPEG-poll with H.264-via-Media-Foundation + mediasoup relay).
- [ ] `docs/customer-deployment-guide.md` — bank IT-ready deployment manual.
- [ ] Commercial launch package — sales deck, pricing sheet, support runbook.

**Exit criteria**: Tier 2 product is shippable. Pricing per [Architecture_v3.md §15](../../docs/Architecture_v3.md): IDR 250-500M/year per tenant.

---

## Cross-cutting commitments (every phase)

- **Spec-first**: any new XFS command/event/payload starts with a `spec/xfs-contract.yaml` edit + `pnpm codegen`. Hand-coding command-code constants in C++ is a code-review blocker.
- **Behavior contract tests**: any new device behavior added to the TS side gets a YAML test entry in `spec/contract/`. Both TS and C++ test runners consume the same YAML — drift between them is impossible by construction.
- **Coding standards** ([Architecture_v3.md §18.10](../../docs/Architecture_v3.md)):
  - C++20, MSVC v143, `/W4 /WX`
  - No exceptions across the SPI boundary — return `HRESULT` codes
  - RAII + smart pointers, no manual `new`/`delete`
  - clang-format (`.clang-format` in repo root)
  - Coverage target ≥ 80% per device
  - ASan in CI when running tests
- **Phase isolation**: don't start Phase N+1 until Phase N tests are green and the integration smoke runs cleanly. Specifically: Phase 9 doesn't start until Phase 8b's empty SP loads in real Windows XFS Manager.

---

## Open questions to resolve before Phase 8b

Per [Architecture_v3.md §17](../../docs/Architecture_v3.md):

1. **Vendor middleware target list** — ✅ **RESOLVED**: Euronet MVS first (Jalin's chosen middleware). All Phase 9-11 device porting prioritises calls Euronet MVS makes. Other vendors (NCR APTRA, Diebold ProTopas, Hyosung MoniPlus) come after Jalin signs off.
2. **Code signing certificate** — order EV cert NOW (4-6 weeks lead). Required before any production deployment.
3. **C++ developer staffing** — at least one senior Windows C++ dev for Phases 8b-14. If not in-house, engage a consultancy. Budget IDR 30-50M/month for a good senior.
4. **CEN/XFS SDK** — download from CEN-CENELEC and verify headers compile against `dllmain.cpp` shadow types. Target: end of Phase 8a.
5. **First PoC customer** — ✅ **RESOLVED**: Jalin Pembayaran Indonesia + Euronet MVS. See `docs/integrations/jalin-euronet-poc.md` for the full pre-engagement checklist + acceptance criteria.
6. **License model for Tier 1 vs Tier 2 upsell** — affects database design (per-VM pricing requires VM-level metering on GhostVm).
7. **On-premise vs cloud deployment for first customer** — affects DevOps + update mechanism design.
