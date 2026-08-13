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

## User Management

All routes below require `Authorization: Bearer <access token>`.

Mounted under `/api/v1/users` (self-service, any authenticated role):

| Method | Route | Notes |
|---|---|---|
| GET | `/me` | Profile + passenger/driver/wallet summary |
| PATCH | `/me` | Partial update: firstName, lastName, phone |
| POST | `/me/change-password` | Requires current password; revokes all sessions on success |
| POST | `/me/become-driver` | One-way PASSENGER → DRIVER upgrade; keeps the passenger profile |
| GET/POST | `/me/saved-locations` | Passenger-only, ownership-checked |
| PATCH/DELETE | `/me/saved-locations/:id` | Passenger-only, ownership-checked |
| GET/POST | `/me/favorite-drivers` | Passenger-only |
| DELETE | `/me/favorite-drivers/:driverId` | Passenger-only |

Mounted under `/api/v1/admin` (role: `ADMIN` only):

| Method | Route | Notes |
|---|---|---|
| GET | `/users` | Paginated, filterable by role/isActive, searchable | 
| GET | `/users/:id` | Full profile |
| PATCH | `/users/:id/status` | Activate/deactivate; deactivation revokes all sessions; writes an `AuditLog` entry |

Admin accounts have no signup endpoint by design — provision one out-of-band:

```bash
npm run seed:admin -- <email> <password> <firstName> <lastName>
```

## Vehicle Management

Mounted under `/api/v1/vehicles` (driver-only, ownership-checked):

| Method | Route | Notes |
|---|---|---|
| GET/POST | `/` | List / add a vehicle |
| GET/PATCH/DELETE | `/:id` | DELETE deactivates (`isActive=false`), never hard-deletes |
| GET/POST | `/:id/documents` | List / upload a document, `multipart/form-data`, field `document` (PDF/JPEG/PNG, 5MB max) |
| GET | `/:id/documents/:documentId/file` | Download own document |
| DELETE | `/:id/documents/:documentId` | Fails with 409 once the document is `APPROVED` |

Editing a verified vehicle's identity fields (`make`, `model`, `year`, `plateNumber`) automatically resets `isVerified` to `false` — a changed plate is no longer what was actually verified.

Admin review, mounted under `/api/v1/admin` (role: `ADMIN` only), each writing an `AuditLog` entry:

| Method | Route | Notes |
|---|---|---|
| GET | `/drivers` | Paginated, filterable by `verificationStatus` |
| GET | `/drivers/:id` | Full detail: identity, vehicles, documents |
| PATCH | `/drivers/:id/verification` | `APPROVED` \| `REJECTED` \| `SUSPENDED`, optional `reason` |
| PATCH | `/vehicles/:id/verification` | Approve/unapprove a vehicle |
| PATCH | `/vehicle-documents/:id/review` | `APPROVED` \| `REJECTED` |
| GET | `/vehicle-documents/:id/file` | Download any document for review |

## Ride Lifecycle

**Matching is pull-based, deliberately.** Without Socket.IO (that's the next phase) there's no way to push a ride offer to a driver, so drivers poll `GET /rides/nearby` — backed by a Redis Geo set (`geo:rides:pending`), not a Postgres scan — and race to accept. The accept endpoint uses a single conditional `UPDATE ... WHERE status='REQUESTED' AND driverId IS NULL` (`ride.repository.js: tryAssignDriver`) so Postgres itself serializes concurrent accepts; exactly one caller gets the row, every other caller gets a clean 409. Verified under genuine concurrent load, not just in theory — two drivers fired `accept` on the same ride simultaneously and exactly one won.

Mounted under `/api/v1/rides` (authenticated):

| Method | Route | Who | Notes |
|---|---|---|---|
| POST | `/` | Passenger | Computes route/fare, generates OTP, indexes in `geo:rides:pending` |
| GET | `/:id` | Participant | OTP visible only if you're the passenger |
| GET | `/history` | Passenger | Own rides, paginated, filterable by status |
| GET | `/driver-history` | Driver | Own rides, OTP always stripped |
| GET | `/nearby` | Driver | Redis Geo search around the driver's own position; excludes rides they've rejected |
| POST | `/:id/accept` | Driver | Race-safe; requires online + available + a verified matching vehicle |
| POST | `/:id/reject` | Driver | Removes this ride from *this driver's* nearby results only |
| POST | `/:id/arrived` \| `/:id/start` \| `/:id/complete` | Driver | `/start` requires the OTP; capped at 5 attempts / 15 min |
| POST | `/:id/cancel` | Either | Only while `REQUESTED`/`ACCEPTED`/`ARRIVED` |

Mounted under `/api/v1/drivers` (authenticated, driver-only):

| Method | Route | Notes |
|---|---|---|
| POST | `/me/online` | Requires `verificationStatus=APPROVED` + ≥1 verified vehicle; registers position in `geo:drivers:online` |
| POST | `/me/offline` | Removes from the online geoset |
| POST | `/me/location` | REST-polled position ping; same underlying write as the `driver:location` socket event, see below |

`estimateFare`/`computeRoute` fall back to a Haversine straight-line estimate (× 1.3 road factor) whenever `GOOGLE_MAPS_API_KEY` is unset **or** the Google call fails — a third-party outage degrades fare accuracy, it doesn't break ride requests. `actualFare` is set equal to `estimatedFare` at completion; recomputing it from a real GPS trail is Payments-phase work.

## Real-Time (Socket.IO)

**Sockets are a push/telemetry layer on top of the REST services, not a second business-logic path.** Every state-changing action (accept, start, complete, cancel) stays REST-only — the socket layer only ever calls the *same* service functions REST controllers call, and pushes notifications from inside them. There's nothing a socket event can do that a REST call can't; sockets just make the REST side effects arrive without polling.

**Auth**: a socket connects with `{ auth: { token: <access token> } }` — the same short-lived JWT as `Authorization: Bearer`, verified with the same function. No separate session concept; an expired access token means a dead socket, same as a rejected REST call. A bad/missing token gets a `connect_error`, never a connection.

**Rooms**: exactly one per socket — `user:{userId}`, joined on connect. There is no `ride:{id}` room; every server-initiated push targets a specific userId directly (the ride record always has both participants' ids in hand at the point something needs pushing), which sidesteps needing a join-authorization check for room membership entirely.

**Scaling**: `io.adapter()` runs on the Redis pub/sub pair set aside for exactly this back in Phase 1 (`redis` + `redisSubscriber`) — without it, an event emitted on the server instance handling the driver's connection would never reach the passenger's socket if they land on a different instance behind a load balancer.

| Direction | Event | Notes |
|---|---|---|
| C→S | `driver:location` | `{lat, lng}` — same code path as `POST /drivers/me/location`; broadcasts to the active ride's passenger if one exists |
| S→C | `ride:offer` | Pushed to nearby online, available, approved drivers with a matching verified vehicle when a ride is requested — closes the loop `geo:drivers:online` was built for in Phase 5. Best-effort only: if it reaches no one (all offline, all rejected), the ride is still sitting in `geo:rides:pending` for `GET /rides/nearby` to find |
| S→C | `ride:accepted` \| `ride:arrived` \| `ride:started` \| `ride:completed` | Pushed to the passenger when the driver takes the corresponding REST action |
| S→C | `ride:cancelled` | Pushed to whichever side *didn't* cancel |
| S→C | `driver:location` | Pushed to the passenger of an active ride, from either the REST ping or the socket event above |

Verified with a real `socket.io-client` test harness, not just REST calls checked in isolation: a bad token was rejected at handshake, a ride request produced a `ride:offer` on the driver's actual socket, the OTP was present in `ride:accepted` (passenger) and absent from `ride:offer`/`ride:arrived`/etc. (driver), and a live `driver:location` emit reached the passenger's socket in real time.

## Phases

This backend is being built incrementally. Each phase is scoped, explained, and approved before the next begins.

- [x] **Phase 1** — Planning, architecture, folder structure, database design
- [x] **Phase 2** — Authentication
- [x] **Phase 3** — User management (passenger/driver/admin)
- [x] **Phase 4** — Vehicle management
- [x] **Phase 5** — Ride lifecycle
- [x] **Phase 6** — Real-time location & sockets
- [ ] Payments & wallet
- [ ] Ratings
- [ ] Notifications & background jobs
- [ ] Admin dashboard & analytics
- [ ] Testing
- [ ] API documentation (Swagger)
- [ ] Docker & CI/CD
