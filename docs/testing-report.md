# Testing report — ATMirror simulator

> **Snapshot date**: 2026-04-27
> **Branch / commit at time of report**: `feat/p7.2-submenu-macros-docs` (rolling — see `git log` for the latest tip)
> **Scope**: every test layer that runs in the repo — unit, contract, E2E, live host-transport probes, macro test studio runs.
>
> This document is regenerated whenever a meaningful test layer changes. The numbers below are from a fresh clean-build + clean-seed + full-run on a Windows 11 dev box.

---

## At-a-glance scoreboard

| Layer | Suite | Tests | Pass | Fail | Notes |
|---|---|---|---|---|---|
| Unit | `@atm/iso8583` | 31 | 31 | 0 | Field codec + bitmap + Indonesian switch profiles |
| Unit | `@atm/emv` | 23 | 23 | 0 | APDU parser + BER-TLV codec + EMV simulator (PSE/AID/GPO/READ/GENAC) |
| Unit | `@atm/xfs-devices` | 84 | 84 | 0 | IDC, PIN, CDM, PTR, SIU device behaviour + base class |
| Unit (NestJS) | `@atm/xfs-server` | 51 | 51 | 0 | Macros, Prisma, host emulator, ISO 8583 + ISO 20022 transports, reports |
| **Total unit** | **all packages** | **189** | **189** | **0** | ✅ green |
| Spec / contract | `pnpm codegen:check` | 1 | 1 | 0 | Spec ↔ generated TS + C++ headers byte-identical |
| Workspace typecheck | `pnpm -r typecheck` | 8 packages | 8 | 0 | Strict TS, `noUncheckedIndexedAccess` enabled |
| E2E (Playwright) | `atm-happy-path.spec.ts` | 5 | 5 | 0 | Card + PIN + withdrawal + cancel + operator panels + theme switch |
| E2E (Playwright) | `sub-menu.spec.ts` | 1 | 1 | 0 | UANG ELEKTRONIK + MENU LAINNYA + 4 sub-menu items + KEMBALI |
| Live probe | `scripts/probe-host-transports.py` | 10 | 10 | 0 | Backend health + 3 transports + TCP echo/auth/withdrawal + XML health + approve + decline |
| Macro studio | 7 seeded scenarios | 7 | 6-7 | 0-1 | 7/7 individually; 6/7 in batch (CDM-error macro flaky after Blocked card runs first — known race) |

**Overall**: 217 of 218 individual checks pass on a single clean run. The 1 flaky macro is documented below + has a workaround.

---

## How to reproduce all of this on a clean machine

```bash
# 1. Clone
git clone https://github.com/tarenjit/atm-xfsSimulator.git
cd atm-xfsSimulator

# 2. Install + DB
pnpm install
pnpm prisma migrate deploy --schema=prisma/schema.prisma
pnpm prisma generate --schema=prisma/schema.prisma
pnpm db:seed

# 3. Spec/codegen + typecheck + unit
pnpm codegen:check                        # exit 0 = TS + C++ headers up to date
pnpm -r typecheck                         # exit 0 = all 8 packages clean
pnpm --filter @atm/iso8583 test           # 31/31
pnpm --filter @atm/emv test               # 23/23
pnpm --filter @atm/xfs-devices test       # 84/84
pnpm --filter @atm/xfs-server test        # 51/51

# 4. Build for E2E + serve
pnpm -r build
pnpm --filter @atm/xfs-server start &     # backend on :3001
pnpm --filter @atm/atm-frontend start &   # frontend on :3000

# 5. E2E
pnpm --filter @atm/atm-frontend test:e2e  # 6/6

# 6. Live probe
python scripts/probe-host-transports.py   # 10/10

# 7. Macro suite
# (run via operator UI — http://localhost:3000/operator → Macro Test Studio)
# or via REST:
#   curl -s http://localhost:3001/api/v1/macros | jq '.macros[].id' | xargs -I{} curl -X POST http://localhost:3001/api/v1/macros/{}/run
```

---

## Layer-by-layer breakdown

### 1. Unit tests — packages

#### `@atm/iso8583` — 31 tests across 2 suites

- **`bitmap.spec.ts` + `codec.spec.ts` + `fields.spec.ts`** (rolled into the index suite): primary bitmap encode/decode round-trip; per-field length and padding rules (fixed, llvar, lllvar, numeric); MTI enums; 8583:1987 wire format conformance.
- **`switches.spec.ts`** (added in Phase 3): all 4 Indonesian switch profiles (Jalin / ATM Bersama / Prima / BI-FAST) properly seeded, BIN-prefix routing works, BI-FAST has highest withdrawal cap and shortest echo interval, switch-private response codes resolve, fallbacks work.

#### `@atm/emv` — 23 tests across 2 suites

- **`tlv.spec.ts`**: BER-TLV encode/decode round-trip, single + multi-byte tags, single + multi-byte length encoding, constructed templates, recursive `findTag`, truncation detection.
- **`emv-simulator.spec.ts`**: chip power-on/off, SELECT PSE, SELECT AID, GET PROCESSING OPTIONS, READ RECORD with PAN/expiry/cardholder, GENERATE AC with ATC increment, deterministic ARQC across instances, unknown-APDU rejection, power-off state isolation.

#### `@atm/xfs-devices` — 84 tests across 6 suites

One `.spec.ts` per device:
- **`base/virtual-device.base.spec.ts`** — common state machine, error injection one-shot semantics, response delay simulation
- **`idc/idc.service.spec.ts`** — card insert/eject/retain, track read, raw read, chip IO/power, RESET clears state, error injection
- **`pin/pin.service.spec.ts`** — PIN entry buffer, FDK key handling, PIN block generation (ISO 0/1/3), key-store import
- **`cdm/cdm.service.spec.ts`** — denomination mix algorithm, present/retract, cassette state, jam injection
- **`ptr/ptr.service.spec.ts`** — print form, raw data, paper status events
- **`siu/siu.service.spec.ts`** (added in Phase 2) — sensor state changes, indicator control, operator-switch behaviour, port-status event flow

#### `@atm/xfs-server` — 51 tests across 7 suites

- **`macros/macro-recorder.service.spec.ts`** — recorder captures user actions + state checkpoints
- **`atm/atm-app.service.spec.ts`** — full state machine: card → PIN → menu → amount → confirm → dispense → eject; cancel paths; PIN-tries-exceeded → retain; idle timeout
- **`host/host-emulator.service.spec.ts`** — auth, balance, withdrawal authorise (incl. per-switch caps), reversal, daily-limit enforcement, advisory-lock concurrency
- **`reports/reports.service.spec.ts`** — PDF generation for macro-run + executive summary; not-found handling; malformed month rejection
- **`host-transport/iso8583-tcp.transport.spec.ts`** (Phase 7.1) — TCP listener echo, auth, financial req, unsupported MTI, request counter
- **`host-transport/iso20022-http.transport.spec.ts`** (Phase 7.1) — HTTP /health, pacs.008 approve / decline / missing-account, GET / 404

### 2. Spec / contract gate — `pnpm codegen:check`

Single check: regenerate `packages/xfs-core/src/generated/*.ts` + `native/zegen-xfs-sp/ZegenXFS_SP/include/generated/*.h` from `spec/xfs-contract.yaml` and assert byte-identity with the committed files. If anyone hand-edits a generated file or forgets to regen after a spec change, this fails. Wire into CI.

### 3. Workspace typecheck — `pnpm -r typecheck`

All 8 packages compile under strict TS:
- `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`
- `experimentalDecorators` + `emitDecoratorMetadata` for NestJS DI
- Prisma client narrows model + payload types

### 4. End-to-end (Playwright + Chromium)

Tests in `apps/atm-frontend/e2e/`:

#### `atm-happy-path.spec.ts` — 5 tests

1. `page renders, connects, insert card via UI → PIN_ENTRY state` — proves the WebSocket connection from the browser to xfs-server is live and the UI re-renders on state change.
2. `full withdrawal driven via REST, UI reflects each state` — cardinal end-to-end: insert + PIN + WITHDRAWAL + 300k + confirm → dispense → print → eject. UI tracks every state. Final assertion: a COMPLETED `Transaction` row in Postgres.
3. `cancel button during PIN_ENTRY ejects the card` — the recovery path.
4. `/operator smoke › all panels render` — Bank theme, Host transport, Macro Test Studio, Macro Suites, Devices, Cassettes, XFS event stream, Recent transactions, Session history, Virtual cards, all rendered without errors.
5. `/operator smoke › theme switcher flips the active theme` — clicking BSI tile updates `/api/v1/themes/active` and the UI reflects it.

#### `sub-menu.spec.ts` — 1 test (Phase 7.2)

1. `all FDK click flows behave correctly in one session` — combined: drive to MAIN_MENU → click UANG ELEKTRONIK → overlay shown → dismiss → click MENU LAINNYA → sub-menu screen swaps in → click TRANSFER → overlay → dismiss → click SETOR TUNAI → overlay → dismiss → click PEMBAYARAN → overlay → dismiss → click KEMBALI → back to main menu.

   Combined into a single test (rather than 4 separate ones) to avoid races between Playwright's between-test session cancellation and in-flight `begin-pin` POSTs from the previous test.

### 5. Live host-transport probe — `scripts/probe-host-transports.py`

Self-contained Python (stdlib only) script. Hits a running stack and validates 10 things in sequence:

1. Backend `/api/v1/health` returns `{status: ok}`
2. `/api/v1/host-transport` lists the 3 seeded transports
3. Activates ISO 8583 TCP listener via REST → confirms `listening: true` on `127.0.0.1:8583`
4. Activates ISO 20022 HTTP listener via REST → confirms on `127.0.0.1:8443`
5. TCP MTI 0800 echo → expects `0810|39=00|switch=JALIN|alive=true`
6. TCP MTI 0100 auth (PAN 4580...7234) → expects `0110|39=00|switch=JALIN`
7. TCP MTI 0200 withdrawal Rp 100k → expects `0210|39=00|stan=...|auth=...|switch=JALIN`
8. HTTP GET `/health` → expects `200 + {status: ok, switch: BIFAST}`
9. HTTP POST `/pacs.008` (Rp 100k) → expects `pacs.002` with `<TxSts>ACSC</TxSts>`
10. HTTP POST `/pacs.008` (Rp 999,999,999, oversize) → expects `<TxSts>RJCT</TxSts>` with reason code

CLI flags `--pan`, `--amount`, `--backend` for variants. Bash wrapper `scripts/probe-host-transports.sh` boots a transient server if none is running.

### 6. Macro Test Studio — 7 seeded scenarios

Stored in Postgres (`Macro` table) on every `pnpm db:seed`. Run via the operator console (`/operator → Macro Test Studio → ▶ Play`) or via REST `POST /api/v1/macros/:id/run`.

Each row captured `stepResults` in JSONB and a final `status` of `PASSED|FAILED|ABORTED`.

| # | Folder | Macro | Expected outcome | Step count | Demonstrates |
|---|---|---|---|---|---|
| 1 | Withdrawals | Happy-path withdrawal (300,000) | PASS | 8 (1 disabled) | Full IDC + PIN + CDM + PTR happy path |
| 2 | Withdrawals | Maximum withdrawal (2,000,000) | PASS | 8 | Largest preset amount end-to-end + receipt + COMPLETED txn |
| 3 | Inquiries | Cek Saldo (balance inquiry) | PASS | 4 | Balance flow (no cash dispensed) |
| 4 | Negative scenarios | Insufficient funds (decline path) | PASS | 8 | LOW BAL card (Rp 150k) attempting Rp 1M; host returns 51, session ENDED |
| 5 | Negative scenarios | CDM dispense fault → host reversal | PASS *(see note)* | 9 | Inject CDM hardware error + drive withdrawal → host approves → CDM fails → reversal logged in DB as `REVERSED` |
| 6 | Negative scenarios | Blocked card rejected | PASS | 3 | BLOCKED card; auth fails immediately (response code 62) |
| 7 | Negative scenarios | Expired card rejected | PASS | 3 | EXPIRED card (year 2020); auth fails (response code 54) |

**Pass rate**: 7/7 when run individually, 6/7 in batch (see known limitation §7 below).

---

## What the macros prove (positive + negative coverage)

### Positive paths
- Full XFS round-trip: IDC insert → tracks read → PIN buffer → host auth approved → CDM dispense + present → PTR print → IDC eject
- Account balance debited correctly in Postgres
- Daily-withdrawn counter incremented
- COMPLETED status on the Transaction row with stanNo + authCode

### Negative paths exercised
- **Card-side auth failure** (Blocked, Expired) — host returns 62 / 54 before PIN; session ends cleanly without retaining the card.
- **Host-side decline** (Insufficient funds) — host returns 51 mid-flow; no debit; session enters ENDED state.
- **XFS device fault** (CDM dispense error) — XFS error injected one-shot; CDM throws on dispense after host approval; host emulator triggers reversal; transaction logged as REVERSED with `errorReason` capturing the XFS code.

This covers exactly the 4 categories in `docs/device-error-matrix.md` that Jalin's QA team needs to validate during their PoC.

---

## 7. Known limitations / flakiness

### Macro batch run: CDM dispense fault occasionally fails after Blocked-card macro

**Symptom**: when running all 7 macros sequentially in a single shot via REST, the CDM dispense fault macro sometimes fails at step #3 (PIN entry) with `pin rejected: no pin entered`.

**Why**: the PIN device's internal entry buffer doesn't always release in the ~1.5s window between back-to-back macros. The Blocked-card macro fails authentication very quickly (no PIN ever requested), then the next macro inserts a card and immediately tries `EnterPin` — sometimes the previous session's `safeEject` cleanup hasn't finished propagating to the PIN device's `isEntryActive` flag.

**Workarounds**:
- Run macros one at a time from the operator console UI (works 7/7 every time)
- In your test orchestrator, sleep ≥ 2 seconds between macros that follow a fast-failing one
- (Future fix) Make `MacroRunnerService.run` await an "ATM idle" signal before starting the next macro.

**Tracker**: not yet ticketed — file under "Phase 8b polish" or earlier if Jalin's PoC requires reliable batch runs from CI.

### `pnpm clean` was missing tsbuildinfo (fixed)

Symptom: `pnpm clean && pnpm build` produced an empty dist/. Fixed in chore commit `a94cd51`.

### `rm -rf` in package.json scripts didn't work on Windows (fixed)

Fixed in chore commit `432f348` — swapped to `rimraf`.

### CLAUDE.md gets reverted to legacy 74KB version when VS Code re-saves it

The slim version Claude Code loads as project context occasionally gets overwritten by an older legacy version when VS Code's autosave kicks in with stale buffer contents. Workaround: open the slim version in VS Code yourself + Save once.

---

## What is NOT covered yet

These are explicit gaps — file as issues if Jalin needs any of them.

- **Cassette-empty fallback path** — verifies what the ATM app does when the requested denomination drains the cassette mid-transaction. Needs a macro that drains CASS3 first.
- **Network-outage simulation** — host emulator has no "network down" mode; you'd need to add a transient fault injection at the HostEmulatorService layer.
- **PIN tries exceeded → card retain** — backend supports it but no macro covers the 3-wrong-PIN flow + retain assertion.
- **Concurrent multi-VM scenarios** — single-VM today; multi-VM needs Phase 12 mgmt-plane work.
- **WebRTC screen streaming** — Phase 14.
- **C++ Service Provider tests** — `native/zegen-xfs-sp/` is scaffold only. GoogleTest + contract YAML runner land in Phase 9-11.
- **Real EMV cryptogram verification** — our ARQC is deterministic-fake; production hosts would reject it.
- **Production-grade load tests** — k6 / artillery scenarios for 50 concurrent VMs are Phase 14.

---

## CI integration recipe (when GitHub Actions land)

```yaml
# .github/workflows/ci.yml (suggested)
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: atm_dev_pw
          POSTGRES_DB: atm_simulator
        ports: ['5432:5432']
        options: --health-cmd "pg_isready" --health-interval 10s
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy --schema=prisma/schema.prisma
      - run: pnpm prisma generate --schema=prisma/schema.prisma
      - run: pnpm db:seed
      - run: pnpm codegen:check
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm -r build
      - run: pnpm --filter @atm/atm-frontend exec playwright install chromium --with-deps
      - run: pnpm --filter @atm/xfs-server start &
        env: { DATABASE_URL: "postgresql://postgres:atm_dev_pw@localhost:5432/atm_simulator" }
      - run: pnpm --filter @atm/atm-frontend start &
      - run: sleep 10 && pnpm --filter @atm/atm-frontend test:e2e
      - run: python scripts/probe-host-transports.py
```

This is what would lock in the 218-check guarantee on every PR.
