# Ride Sharing Backend

A production-grade, Uber-like ride sharing backend built incrementally, phase by phase.

## Stack

Node.js (ESM) · Express 5 · PostgreSQL · Prisma · Redis · BullMQ · Socket.IO · JWT · Zod · Jest

## Architecture

Layered ("clean") architecture, organized by **layer first, domain second**:

```
src/
  config/        # env validation, DB/Redis clients, logger — the process's dependencies
  routes/        # HTTP routing only: path -> controller. No logic.
  controllers/   # HTTP concern only: parse req, call a service, shape the res. No business logic.
  services/      # Business logic. Framework-agnostic — no req/res here.
  repositories/  # Data access. Wraps Prisma calls so services never import PrismaClient directly.
  validators/    # Zod schemas for request input, one per endpoint group.
  middlewares/   # Cross-cutting request pipeline concerns (auth, error handling, rate limiting).
  models/         # Non-DB domain types/DTOs shared across layers.
  jobs/           # BullMQ queue definitions + worker processors.
  sockets/        # Socket.IO namespaces/event handlers.
  utils/          # Small stateless helpers (ApiError, ApiResponse, etc).
  docs/           # Swagger/OpenAPI source.
prisma/
  schema.prisma  # Single source of truth for the DB schema.
  migrations/    # Generated, versioned SQL migrations. Never hand-edit.
tests/
  unit/          # Services/utils in isolation, dependencies mocked.
  integration/   # Repository <-> real test DB.
  api/           # Supertest against the Express app, black-box.
```

**Why layer-first instead of feature-first (`src/modules/ride/...`)?** At this project's size, a request's failure mode is almost always "wrong layer has the logic" (e.g. a controller doing a Prisma query directly) — layer-first folders make that violation visually obvious in a file's own path. Feature-first scales better past ~15-20 domains with multiple teams; this API has ten-ish domains owned by one team, so the extra navigation cost of layer-first is worth the discipline it enforces. Within each layer, files are still named by domain (`ride.controller.js`, `ride.service.js`) so nothing is lost.

**Request flow:** `routes` → `middlewares` (auth, validation) → `controller` → `service` → `repository` → Prisma → PostgreSQL. Nothing skips a layer — a controller never imports a repository directly, and a service never touches `req`/`res`. This is what makes services unit-testable without spinning up Express, and repositories swappable (e.g. adding a cache layer) without touching business logic.

## Database

Design lives in [prisma/schema.prisma](prisma/schema.prisma) — 22 tables, fully normalized, PostgreSQL-native enums. Key decisions:

- **`User` is auth-only; `Driver`/`Passenger` are 1:1 extension tables.** Keeps the hot, frequently-joined identity table small. Role-specific stats (rating, total rides) and behavior (online status) don't bloat every auth check.
- **Money is always `Decimal`, never `Float`.** Floats can't represent currency exactly (`0.1 + 0.2 !== 0.3`); at scale that's a slow, silent accounting bug. Every fare, wallet balance, and payment amount uses `@db.Decimal`.
- **`Driver.lastKnownLat/Lng` is a snapshot, not the source of truth for matching.** Live GPS pings (every few seconds, per active driver) would overwhelm Postgres as a write path. The Location phase will use **Redis Geo** (`GEOADD`/`GEOSEARCH`) as the authoritative store for "who's near this pickup point right now" — Postgres only keeps a last-known value for admin/history views.
- **`WalletTransaction` is an append-only ledger; `Wallet.balance` is a denormalized cache.** Never mutate balance without writing a corresponding ledger row in the same transaction — that discipline is what makes wallet balances reconcilable/auditable later.
- **IDs are `cuid()`, not auto-increment or `uuid()`.** Non-guessable (safe to expose in URLs, unlike sequential IDs) and more index-friendly than random UUIDv4 (which fragments B-tree indexes at scale due to random insert order).
- **`RideStatusLog` and `AuditLog` are append-only audit trails**, separate from the mutable `Ride`/`User` rows. Reconstructing "what happened and when" from `updatedAt` alone doesn't survive a support dispute or a fraud investigation.

## Local Setup

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL / REDIS_URL / JWT secrets
npx prisma migrate dev
npm run dev
```

Health check: `GET /health` — verifies both Postgres and Redis are reachable, not just that the process is up.

> macOS note: port 5000 is claimed by AirPlay Receiver by default — this project defaults to **4000**.

## Authentication

All routes mounted under `/api/v1/auth`:

| Method | Route | Auth required | Notes |
|---|---|---|---|
| POST | `/register` | — | Creates a passenger account, sends a verification email |
| POST | `/login` | — | Generic error on bad credentials (no user enumeration) |
| POST | `/google` | — | Verifies a Google ID token, auto-links/creates account |
| POST | `/refresh` | refresh token (cookie or body) | Rotates the refresh token; reuse of a rotated token revokes all sessions |
| POST | `/logout` | refresh token (cookie or body) | Revokes that one session |
| POST | `/forgot-password` | — | Always responds the same way, regardless of whether the email exists |
| POST | `/reset-password` | — | Revokes all existing sessions on success |
| POST | `/verify-email` | — | Single-use token |
| POST | `/resend-verification` | — | No-op if already verified (silent) |

Access tokens: `Authorization: Bearer <token>`, 15 min lifetime. Refresh tokens: httpOnly cookie for web clients, also returned in the JSON body for native/mobile clients that can't use cookies.

## Phases

This backend is being built incrementally. Each phase is scoped, explained, and approved before the next begins.

- [x] **Phase 1** — Planning, architecture, folder structure, database design
- [x] **Phase 2** — Authentication
- [ ] Phase 3 — User management (passenger/driver/admin)
- [ ] Vehicle management
- [ ] Ride lifecycle
- [ ] Real-time location & sockets
- [ ] Payments & wallet
- [ ] Ratings
- [ ] Notifications & background jobs
- [ ] Admin dashboard & analytics
- [ ] Testing
- [ ] API documentation (Swagger)
- [ ] Docker & CI/CD
