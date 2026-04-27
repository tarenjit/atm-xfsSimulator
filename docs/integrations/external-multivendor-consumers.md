# Building an external multivendor middleware that consumes ATMirror

> **Audience**: a separate project / repo that wants to develop its own ATM multivendor middleware (e.g. Jalin's planned in-house middleware) using ATMirror as the "fake real ATM" their middleware tests against during development.
>
> **TL;DR**: ATMirror's XFS Service Provider can stand in for real ATM hardware when testing a brand-new multivendor middleware. The new middleware project lives in a separate repo; this repo provides the SP DLL, the bank-app simulator UI, the host emulator, the operator console, and the macro test studio. Wire them together via the existing surface — no changes needed to either side.

---

## 1. The picture

```
[ Customer-built ATM application                ]   ← what they want to validate
        │
        ▼ XFS API
[ Customer-built MULTIVENDOR MIDDLEWARE         ]   ← THE NEW PROJECT
        │      (this is what they're building)
        ▼ XFS SPI
[ Windows XFS Manager (msxfs.dll) ]                  ← OS component
        │
        ▼ routes by registry to providers
[ ZegenXFS_SP.dll (from THIS repo, Phase 8b+)   ]   ← the "fake real ATM"
        │
        ▼ WebSocket :8080
[ ATMirror Management Server (THIS repo)        ]   ← visualises + records
        │
        └── browser UI: operator sees what the new middleware
            is doing to the simulated devices
```

Their multivendor middleware is the **system under test**. Our SP is the
**reference implementation of XFS hardware**. The combination lets them
validate every XFS code path without owning a single physical ATM.

---

## 2. Two ways to consume ATMirror from a new project

### Option A — Black-box: use the deployed binary

The new multivendor project depends on **nothing from this repo at compile
time**. It runs against:

- A built `ZegenXFS_SP.dll` (Phase 8b+ deliverable from this repo)
- A running ATMirror management server (xfs-server + Postgres)
- The ATM-simulator UI (atm-frontend)

Their dev loop:
```
1. clone this repo, run `pnpm install && pnpm db:migrate && pnpm db:seed`
2. start the ATMirror stack:  pnpm --filter @atm/xfs-server start
                              pnpm --filter @atm/atm-frontend start
3. build ZegenXFS_SP.dll (Phases 8a.1 → 8b)
4. install the DLL on their test VM (regedit /s register-spi.reg)
5. install + start their multivendor middleware on the same VM
6. install + start their ATM application on top of their middleware
7. exercise via the operator console / macros / direct ATM UI
```

This is the **correct boundary** for a customer project. They ship without
inheriting any of our codebase, and they can swap out our SP for real hardware
when they're ready for staged rollout.

### Option B — White-box: pull our shared packages as workspace deps

For a customer project that wants the **XFS contract** itself (e.g., to
generate their own internal types from `spec/xfs-contract.yaml`), they can
publish + consume:

- `@atm/xfs-core` — TS command/event constants + types
- `@atm/iso8583` — ISO 8583 codec + Indonesian switch profiles
- `@atm/emv` — EMV L2 simulator (handy for their PIN/chip tests)
- `spec/xfs-contract.yaml` + `generators/cpp-codegen.ts` — for emitting their own C++ headers from the same source of truth

Setup:
```bash
# In their repo
pnpm add @zegen/atmirror-xfs-core @zegen/atmirror-iso8583 @zegen/atmirror-emv

# Or via git URL while we're not publishing to a registry yet:
pnpm add github:tarenjit/atm-xfsSimulator#main \
        --filter packages/xfs-core
```

Their codebase imports `IDC_CMD`, `PIN_CMD`, `IsoSwitchProfile`, etc.
**directly from our packages** — guaranteeing their types stay in sync with
the SP they're testing against. When we update the spec YAML, they re-run
codegen and get the new contract.

We are not (yet) publishing these packages to npm. If a customer wants white-box
consumption, the cleanest current path is:

1. Add our git URL as a workspace dep
2. Or carve a tiny "export-to-customer" build step that emits a tarball

For Phase 14 we'll publish the public surface to npm under `@zegen/atmirror-*`.

---

## 3. The XFS contract surface they need to know about

Whichever option they pick, the **wire/in-process contract** is the only thing
that matters technically:

| What | Where | Notes |
|---|---|---|
| Command codes (`WFS_CMD_*`) | `spec/xfs-contract.yaml` (source of truth) | Generated into both TS + C++ headers |
| Event codes (`WFS_*EVE_*`) + classes | `spec/xfs-contract.yaml` | Same |
| Result codes (`WFS_SUCCESS = 0`, errors negative) | `packages/xfs-core/src/types.ts` + generated | Standard CEN/XFS 3.30 semantics |
| Payload shapes (per command) | `packages/xfs-core/src/{idc,pin,cdm,ptr,siu}.ts` | Manual today; payload-codegen lands Phase 9 |
| Indonesian switch routing (Jalin / ATMB / Prima / BI-FAST) | `packages/iso8583/src/switches.ts` | BIN-prefix → switch profile + per-tx caps |
| ATM hardware profiles (Hyosung / NCR / DN) | `prisma/schema.prisma` `AtmProfile` model + `prisma/seed.ts` | Cassette layout, FDK count, chip protocols |

---

## 4. Sanity contract their middleware MUST honour

Even a perfectly-coded multivendor middleware can ship subtle bugs we've
seen in the wild. If the customer wants their middleware to integrate cleanly
with our simulator (and with real banks later), it must:

1. **Not lose XFS events.** The XFS spec guarantees in-order delivery per service. Many naive middleware implementations drop events under load. Our simulator emits events at realistic timing and gives them a way to test.
2. **Reverse host authorisations on hardware failure.** If `WFS_CMD_CDM_DISPENSE` returns `WFS_ERR_HARDWARE_ERROR` after the host already approved, the middleware MUST send ISO 8583 MTI 0400 reversal. Test: inject CDM error mid-dispense, check the resulting transaction status is `REVERSED`. (See `docs/device-error-matrix.md` §3 row "Hardware error during dispense (jam)".)
3. **Honour the WFMAllocateBuffer contract** for variable-length result structs. Vendor middleware that doesn't free WFS buffers properly leaks until OOM after thousands of transactions.
4. **Survive WebSocket / mgmt-plane disconnects.** Our SP stays operational even if the management plane is unreachable. Their middleware should not assume management plane is always up.
5. **Respect the per-switch withdrawal caps.** Jalin = Rp 5M, ATM Bersama = Rp 3M, Prima = Rp 5M, BI-FAST = Rp 250M (per `packages/iso8583/src/switches.ts`).

A simple regression suite hitting all 5 above gives Jalin's QA a clean
handoff signal: "your multivendor passed our reference suite; you can now
sell it to bank A and bank B."

---

## 5. Suggested folder layout for the new project

```
jalin-multivendor/                       (their new repo)
├── apps/
│   ├── core/                            their core multivendor C++
│   ├── atm-app-mock/                    their TS reference ATM app
│   └── certification-runner/            runs ATMirror's macros against their stack
├── packages/
│   ├── xfs-types/                       their generated types from spec
│   └── shared/
├── tests/
│   ├── unit/
│   ├── integration/                     uses ATMirror as the SP
│   └── certification/                   the 9-point suite + extras
├── third_party/
│   └── atmirror/                        git submodule or pnpm dep
├── docs/
└── README.md
```

The `third_party/atmirror` reference (whether submodule, pnpm-workspace dep,
or git URL) lets their CI clone our repo, boot our stack, run their tests
against it, then tear it all down. Reproducible from scratch.

---

## 6. Where their project ENDS and ATMirror BEGINS

A clean boundary makes both projects easier to maintain:

| Their project owns | ATMirror owns |
|---|---|
| Multivendor middleware C++ codebase | XFS SP DLL (`native/zegen-xfs-sp/`) |
| ATM application (their bank UI on top of their middleware) | Bank-simulator UI (`apps/atm-frontend/`) — for visualising what their middleware is doing |
| Their middleware's own config / installer | XFS SPI registration on the test VM |
| Their CI pipeline | Our CI pipeline — they don't touch our tests |
| Their pricing / commercial story | Our pricing / commercial story (Tier 1 + 2 + 3) |
| Their HSM key-management | Our simulated keys (clearly marked test-only) |
| Their relationship with banks | Our relationship with Zegen customers |

If ever in doubt: **ATMirror is the test bench, their multivendor is the unit
under test.** Both can ship independently; both can be sold separately to
different customers.

---

## 7. Two-line architectural memo for the future-multivendor stakeholder

> The new multivendor middleware lives in its own repo. It links to ATMirror
> only as a test/dev dependency: ATMirror's SP DLL stands in for real ATM
> hardware so the new middleware can be developed, tested, and certified
> against deterministic device behaviour before touching a real ATM. When the
> new middleware is ready for production, it loads real hardware drivers
> instead of our SP — same XFS contract, same code, different DLL behind the
> Windows XFS Manager.

Hand that to the future-multivendor architect and they have the pattern.
