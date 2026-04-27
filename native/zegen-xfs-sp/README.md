# native/zegen-xfs-sp

> **Project**: ZegenXFS_SP — full in-VM XFS Service Provider for the ATMirror Tier 2 product
> **Status**: Phase 8a — scaffold landed. Empty SP exports all SPI functions but does not yet handle commands.
> **Architecture**: Per [docs/Architecture_v3.md §5.1](../../docs/Architecture_v3.md). This is the AUTHORITATIVE C++ tree; the older `packages/xfs-dll/` is a deprecated TCP-bridge implementation that v3 §16 schedules for removal.

---

## What this is

A C++ Windows DLL that registers itself as the XFS Service Provider for IDC, PIN, CDM, PTR, and SIU on a customer's ghost ATM VM. The vendor middleware (Euronet MVS, NCR APTRA, Diebold ProTopas, Hyosung MoniPlus) loads this DLL through the Windows XFS Manager and talks to it just as it would to a real hardware driver.

**Key architectural property**: every XFS API call from the vendor middleware is handled **in-process, in-VM, sub-millisecond**. There is no TCP hop on the hot path. Only management/orchestration traffic (logs, macros, evidence) goes to the management server over a WebSocket.

---

## What this is NOT

- **Not a TCP bridge.** The deprecated `packages/xfs-dll/` (Phase 8c.1/8c.2 of the legacy v2.0 plan) sent every `WFPExecute` over TCP. v3 §18.8: "No bridge mode regression." Do not extend that pattern here.
- **Not a complete implementation yet.** Phase 8a is just the scaffold. Phases 8b-14 (12 weeks of work) build out the real device logic, EMV, persistence, management plane, and customer integration.

---

## Layout

```
native/zegen-xfs-sp/
├── ZegenXFS_SP.sln               (TODO Phase 8a.1: VS solution)
├── ZegenXFS_SP/
│   ├── ZegenXFS_SP.vcxproj       (TODO Phase 8a.1: MSBuild project)
│   ├── ZegenXFS_SP.def           DLL exports for SPI
│   ├── dllmain.cpp               WFP* surface (currently all stubs)
│   ├── spi/                      (Phase 8b: split per WFP* function)
│   ├── devices/                  (Phase 9-10: per-device ports of TS logic)
│   ├── emv/                      (Phase 11: EMV L2 in C++)
│   ├── events/                   (Phase 8b: WFMPostMessage event posting)
│   ├── store/                    (Phase 9-10: SQLite cassette + log persistence)
│   ├── mgmt/                     (Phase 12: WebSocket client to mgmt plane)
│   ├── profile/                  (Phase 11: ATM profile loader)
│   ├── config/                   (Phase 8b: registry + INI config)
│   ├── util/                     logger, struct_codec, thread_pool
│   └── include/
│       ├── generated/            ✅ emitted by `pnpm codegen` from spec/xfs-contract.yaml
│       └── third_party/          (Phase 8a.1: vcpkg headers)
│
├── ZegenXFS_Agent/               (Phase 12: separate Windows service)
│   ├── screen_capture/
│   ├── remote_control/
│   └── health/
│
├── installer/                    (Phase 13: WiX MSI + registry script)
├── tests/
│   ├── unit/                     (Phase 9-11: GoogleTest per device)
│   ├── contract/                 (Phase 9+: shared YAML contract tests)
│   └── integration/              (Phase 13: real Windows XFS Manager E2E)
│
├── vcpkg.json                    Pinned C++ deps
├── README.md                     This file
├── BUILD.md                      Windows build setup
└── ROADMAP.md                    Phase 8b-14 work plan
```

---

## Quick links

- [BUILD.md](BUILD.md) — Windows + Visual Studio 2022 + vcpkg + CEN/XFS SDK setup
- [ROADMAP.md](ROADMAP.md) — phase-by-phase plan for 8b-14 (12 weeks of remaining C++ work)
- [../../spec/xfs-contract.yaml](../../spec/xfs-contract.yaml) — single source of truth (TS + C++ codegen consume this)
- [../../docs/Architecture_v3.md §5](../../docs/Architecture_v3.md) — full SP design rationale + LOC estimates per component

---

## Generated headers

`pnpm codegen` (run from the workspace root) reads `spec/xfs-contract.yaml` and emits:

- `ZegenXFS_SP/include/generated/xfs_commands.h` — `WFS_CMD_*` constants per service
- `ZegenXFS_SP/include/generated/xfs_events.h` — `WFS_*EVE_*` constants per service
- `ZegenXFS_SP/include/generated/xfs_payloads.h` — payload struct skeletons (Phase 9+ adds member fields)

`pnpm codegen:check` regenerates and fails on `git diff` — wire into CI to prevent drift between TS and C++.

---

## Phase 8a deliverable summary (this commit)

- ✅ Folder layout per v3 §5.1
- ✅ `README.md`, `BUILD.md`, `ROADMAP.md`
- ✅ `vcpkg.json` with pinned deps (nlohmann-json, spdlog, sqlite3, boost-beast, openssl, gtest)
- ✅ `ZegenXFS_SP.def` listing all SPI exports
- ✅ `dllmain.cpp` with `DllMain` + every WFP* function stubbed (returns `WFS_ERR_NOT_IMPLEMENTED`)
- ✅ Real C++ codegen replacing the Phase 2 stub — emits `xfs_commands.h`, `xfs_events.h`, `xfs_payloads.h`
- ⏳ ZegenXFS_SP.sln + .vcxproj — Phase 8a.1 (next commit; needs Visual Studio for sanity-check)
- ⏳ Smoke-test the empty SP loads in real Windows XFS Manager — Phase 8b (needs CEN SDK headers + Windows VM)
