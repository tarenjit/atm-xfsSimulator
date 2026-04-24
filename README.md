# ATM XFS Simulator

Production-grade virtual ATM simulator with XFS device emulation — built by **PT Zegen Solusi Mandiri**.

> **Status:** All six phases shipped. Boot-ready, tested (107 unit/integration tests passing), with full ATM flow end-to-end, operator console, and ISO 8583 host emulation.
> **Spec:** `../CLAUDE (1).md`.

---

## What's in the box

- **Full XFS device layer** — IDC (card reader), PIN (EPP), CDM (cash dispenser), PTR (printer) — each with commands, events, error injection, and configurable response delay.
- **ATM transaction state machine** — card insert → PIN → menu → amount → confirm → dispense → print → eject, with automatic reversal on dispense failure and card retention after 3 wrong PINs.
- **Mock ISO 8583 host** — authenticate, PIN verify, authorize withdrawal (balance + daily-limit checks inside a Postgres transaction), balance inquiry, reversal, card retain.
- **ISO 8583 encoder/decoder** — primary bitmap + field subset (2, 3, 4, 7, 11, 12, 13, 14, 22, 37-42, 49, 52, 54, 70) with round-trippable ASCII wire format.
- **Next.js 14 ATM screen** — state-driven UI with card picker, virtual PIN pad (keyboard support), quick-amount selection, confirm, dispensing/printing/ejecting spinners, error display.
- **Operator console** — device status + one-click error injection, live cassette manager (refill/jam/clear-jam), card manager, live XFS event stream, recent transactions.
- **Structured logging** — pino JSON in prod, pretty in dev, with PAN/track/pinBlock/CVV redaction at both `@atm/shared` and nestjs-pino layers.
- **OpenAPI docs** at `/docs` in dev mode.

---

## Stack

- **Runtime:** Node.js 20 LTS
- **Backend:** NestJS 10 + Socket.IO + Prisma 5 + pino + zod
- **Frontend:** Next.js 14 (App Router) + Tailwind CSS + socket.io-client
- **DB:** PostgreSQL 16
- **Monorepo:** Turborepo + pnpm workspaces
- **Tests:** Jest + ts-jest (107 tests, 80%+ coverage on xfs-devices)

No Docker needed.

---

## Prerequisites

macOS:

```bash
nvm install 20.18.1 && nvm use
npm install -g pnpm@9

brew install postgresql@16 && brew services start postgresql@16
createdb atm_simulator

brew install redis && brew services start redis    # optional; only needed for Phase 2+ BullMQ work
```

Linux: install Postgres 16+ and Redis 7+ via your package manager.

---

## Quick start

```bash
pnpm install
cp .env.example .env                          # adjust DATABASE_URL if needed
pnpm prisma migrate dev --schema=prisma/schema.prisma --name init
pnpm db:seed
pnpm dev
```

Open:

- ATM screen       <http://localhost:3000/atm>
- Operator console <http://localhost:3000/operator>
- Backend health   <http://localhost:3001/api/v1/health>
- OpenAPI docs     <http://localhost:3001/docs>

---

## Repository layout

```
atm-xfs-simulator/
├── apps/
│   ├── atm-frontend/              Next.js 14 — ATM screen + operator console
│   │   ├── app/atm/               state-driven ATM UI
│   │   ├── app/operator/          dashboard
│   │   ├── components/atm/        CardPicker, PinPad, AtmScreen
│   │   ├── components/operator/   DeviceStatus, CassetteManager, LogStream…
│   │   └── hooks/useAtmSocket.ts  single long-lived Socket.IO client
│   └── xfs-server/                NestJS — XFS manager, ATM app, host emulator
│       ├── src/xfs/               manager + gateway + admin REST
│       ├── src/atm/               transaction state machine
│       ├── src/host/              mock ISO 8583 host
│       ├── src/sessions/          session REST (insert-card, press-key, …)
│       ├── src/cards/             virtual card CRUD
│       ├── src/cassettes/         cassette management
│       └── src/logs/              command/transaction/session replay
├── packages/
│   ├── xfs-core/                  pure XFS types (IDC/PIN/CDM/PTR contracts)
│   ├── xfs-devices/               virtual device implementations + tests
│   ├── iso8583/                   MTI + bitmap + field codec + tests
│   └── shared/                    pino logger, zod env, errors, ids,
│                                  PIN hashing (salted SHA-256 + timing-safe)
├── prisma/
│   ├── schema.prisma              Account, VirtualCard, Transaction, XfsCommandLog,
│   │                              XfsEventLog, CashUnit, AtmSession
│   └── seed.ts                    4 fixture cards: HAPPY / LOW / BLOCKED / EXPIRED
├── turbo.json
├── pnpm-workspace.yaml
└── .env.example
```

---

## Useful scripts

| Command             | Purpose                                                |
| ------------------- | ------------------------------------------------------ |
| `pnpm dev`          | backend + frontend in watch mode                       |
| `pnpm build`        | build all apps + packages                              |
| `pnpm typecheck`    | tsc --noEmit across the workspace                      |
| `pnpm lint`         | eslint (max-warnings 0) everywhere                     |
| `pnpm test`         | 107 unit + integration tests                           |
| `pnpm db:migrate`   | apply Prisma migrations                                |
| `pnpm db:seed`      | re-seed test data (idempotent)                         |
| `pnpm db:reset`     | DANGER — drop schema + re-migrate + re-seed            |
| `pnpm format`       | prettier write                                         |

---

## REST + WebSocket surface

### REST (`/api/v1`)

```
GET    /health                            liveness
GET    /health/ready                      readiness (db probe)

GET    /sessions/current                  active session
POST   /sessions/insert-card              { pan }
POST   /sessions/press-key                { key }
POST   /sessions/begin-pin
POST   /sessions/select-transaction       { txnType }
POST   /sessions/submit-amount            { amount }
POST   /sessions/confirm
POST   /sessions/cancel                   { reason? }

GET    /cards                             list virtual cards
POST   /cards                             create (PIN hashed on write)
DELETE /cards/:pan

GET    /cassettes
PATCH  /cassettes/:unitId/replenish       { count }
POST   /cassettes/:unitId/jam
POST   /cassettes/:unitId/clear-jam

GET    /xfs/services
GET    /xfs/services/:hService/info
POST   /xfs/services/:hService/inject-error  { errorCode }
POST   /xfs/services/:hService/clear-error
POST   /xfs/services/:hService/reset
PATCH  /xfs/services/:hService/delay         { ms }

GET    /logs/commands                     ?sessionId&commandCode&limit
GET    /logs/transactions                 ?pan&status&limit
GET    /logs/sessions                     ?limit
GET    /logs/sessions/:sessionId/replay   session + ordered commands + transactions
```

Full Swagger UI at `/docs`.

### WebSocket (`/xfs`)

Client emits:
- `xfs.execute` — `XfsCommand` → acks with `XfsResponse`
- `xfs.getInfo` — `{ hService }` → device capabilities + state
- `xfs.listServices` → array of registered services

Server broadcasts:
- `xfs.event` — device events (SRVE/EXEE/…)
- `atm.stateChanged` — ATM session transitions
- `atm.sessionEnded` — session wrap-up

---

## Logging

Every NestJS log goes through pino.

- **Dev:** `LOG_PRETTY=true` in `.env` → colorized human-readable.
- **Prod:** `LOG_PRETTY=false` → line-delimited JSON, tail-able with jq.

Redacted fields (both layers): `pin`, `password`, `pan`, `track1`, `track2`, `track3`, `chipData`, `pinBlock`, `cvv`, `cvv2`, `headers.authorization`, `headers.cookie`.

Every XFS command is persisted to `XfsCommandLog` with duration and result code — viewable via `GET /api/v1/logs/commands` or the operator console log stream.

---

## Test cards (seeded)

**All PINs are `111111`.** One PIN across every card to keep demos predictable.

| Scenario       | PAN                | PIN      | Expected                              |
| -------------- | ------------------ | -------- | ------------------------------------- |
| Happy path     | `4580123456787234` | `111111` | All transactions succeed              |
| Low balance    | `4580111122223333` | `111111` | Insufficient funds above Rp 150,000   |
| Blocked card   | `4580555500001111` | `111111` | `CARD_BLOCKED` on authenticate        |
| Expired card   | `4580444433332222` | `111111` | Expiry `2001` — `EXPIRED_CARD`        |

PINs are stored as salted SHA-256 via `@atm/shared`'s `hashPin()`; device code verifies with `verifyPin()` — the DB never sees plaintext.

---

## Verification

```bash
pnpm turbo run typecheck build lint test --force
# → 24/24 tasks green
# → 107 tests passing (25 xfs-server + 70 xfs-devices + 12 iso8583)
```

Coverage on device implementations:
- Statements 93.48% · Branches 80.45% · Functions 93.9% · Lines 96.2%

---

## Phase history

| Phase | Theme                      | Commit       |
| ----- | -------------------------- | ------------ |
| 1     | Foundation                 | `92fa85c`    |
| 2     | Core XFS devices + tests   | `a7a78fd`    |
| 3     | ATM app + host + sessions  | `b5d6397`    |
| 4     | Frontend ATM screen        | `b391aaf`    |
| 5     | Operator console           | current-1    |
| 6     | ISO 8583 + OpenAPI + polish| current     |

---

## Out of scope (future work)

Per CLAUDE.md §16: native Windows C++ SPI DLL bridge, real EMV chip flow, real HSM integration, ISO 8583 over TCP, physical firmware emulation, contactless/NFC, multi-currency dispensers, deposit module.

---

## License

Internal / proprietary — PT Zegen Solusi Mandiri.
