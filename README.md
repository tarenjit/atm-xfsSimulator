# ATM XFS Simulator

Virtual ATM simulator with XFS device emulation — built by PT Zegen Solusi Mandiri.

> **Status:** Phase 1 — Foundation (scaffolding complete, boot-ready monorepo).
> See the project spec in `../CLAUDE (1).md` for the full plan.

---

## Stack

- **Runtime:** Node.js 20 LTS
- **Backend:** NestJS 10 + Socket.IO + Prisma
- **Frontend:** Next.js 14 (App Router) + Tailwind
- **DB:** PostgreSQL 16
- **Queue:** Redis 7 (BullMQ) — Phase 2+
- **Monorepo:** Turborepo + pnpm workspaces
- **Logging:** pino (structured JSON) via nestjs-pino

---

## Prerequisites

No Docker required. Install these native services on macOS:

```bash
# Node.js (nvm)
nvm install 20.18.1
nvm use

# pnpm
npm install -g pnpm@9

# PostgreSQL 16
brew install postgresql@16
brew services start postgresql@16
createdb atm_simulator

# Redis 7 (needed from Phase 2 onward)
brew install redis
brew services start redis
```

On Linux / other platforms, use your package manager's Postgres 16+ and Redis 7+ equivalents.

---

## Quick start

```bash
# 1. Install dependencies
pnpm install

# 2. Copy environment template and edit as needed
cp .env.example .env
# (adjust DATABASE_URL if your Postgres user/password differ)

# 3. Generate Prisma client + run initial migration
pnpm prisma migrate dev --schema=prisma/schema.prisma --name init
pnpm prisma generate --schema=prisma/schema.prisma

# 4. Seed test cards + accounts
pnpm db:seed

# 5. Start everything (backend + frontend in parallel)
pnpm dev
```

Then open:

- Frontend:  <http://localhost:3000>
- Backend:   <http://localhost:3001/api/v1/health>

---

## Repository layout

```
atm-xfs-simulator/
├── apps/
│   ├── atm-frontend/        Next.js 14 — ATM screen + operator console
│   └── xfs-server/          NestJS — XFS manager + ATM app + host emulator
├── packages/
│   ├── xfs-core/            Pure XFS types, enums, command/event contracts
│   ├── xfs-devices/         Virtual device implementations
│   ├── iso8583/             ISO 8583 message encoder/decoder (mock)
│   └── shared/              Logger, env, errors, shared utils
├── prisma/
│   ├── schema.prisma        Database schema
│   └── seed.ts              Seed data (4 test cards)
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
└── .env.example
```

---

## Useful scripts

| Command                | Purpose                                                     |
| ---------------------- | ----------------------------------------------------------- |
| `pnpm dev`             | Run backend + frontend in watch mode (turbo pipeline)       |
| `pnpm build`           | Build all apps and packages                                 |
| `pnpm typecheck`       | TypeScript `--noEmit` across the workspace                   |
| `pnpm lint`            | Lint all packages                                           |
| `pnpm test`            | Run all unit/integration tests                              |
| `pnpm db:migrate`      | Apply Prisma migrations                                     |
| `pnpm db:seed`         | Re-seed test data (idempotent)                              |
| `pnpm db:reset`        | Drop schema + re-migrate + re-seed (DANGEROUS)              |
| `pnpm format`          | Prettier write                                              |

---

## Phase plan

Per `CLAUDE.md`:

| Phase | Theme                      | Status            |
| ----- | -------------------------- | ----------------- |
| 1     | Foundation                 | **in progress**   |
| 2     | Core XFS devices           | pending           |
| 3     | ATM application layer      | pending           |
| 4     | Frontend ATM screen        | pending           |
| 5     | Operator console           | pending           |
| 6     | Polish + ISO 8583 encoding | pending           |

---

## Logging

Every NestJS log goes through pino. Two modes are controlled by env:

- **Dev (default):** `LOG_PRETTY=true` → human-readable colorized output.
- **Prod:** `LOG_PRETTY=false` → line-delimited JSON, suitable for ingestion.

Sensitive fields (`pin`, `password`, `authorization` header, `cookie` header) are
redacted automatically via pino's redact rules.

Every XFS command is persisted to the `XfsCommandLog` table with duration and
result code — inspect it via the operator console (Phase 5) or direct SQL.

---

## Test cards (from seed)

| Scenario        | PAN                | PIN  | Expected behaviour                 |
| --------------- | ------------------ | ---- | ---------------------------------- |
| Happy path      | `4580123456787234` | 1234 | All transactions succeed           |
| Low balance     | `4580111122223333` | 0000 | Insufficient funds beyond 150k IDR |
| Blocked card    | `4580555500001111` | 9999 | Card status=BLOCKED                |
| Expired card    | `4580444433332222` | 5678 | Expiry 2001 (past)                 |

---

## License

Internal / proprietary — PT Zegen Solusi Mandiri.
