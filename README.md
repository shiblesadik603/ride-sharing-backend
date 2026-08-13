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

Running tests requires a separate database — see [Testing](#testing) below for one-time setup, then `npm test`.

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

`estimateFare`/`computeRoute` fall back to a Haversine straight-line estimate (× 1.3 road factor) whenever `GOOGLE_MAPS_API_KEY` is unset **or** the Google call fails — a third-party outage degrades fare accuracy, it doesn't break ride requests. `actualFare` is still set equal to `estimatedFare` at completion — recomputing it from a real GPS trail stayed out of scope through the Payments phase too; it's listed under Known Limitations below.

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

## Payments & Wallet

**Three payment methods, one entry point.** `POST /rides/:id/pay` takes `{method: "CARD"|"WALLET"|"CASH", couponCode?}` — `provider` (what's actually charged) is derived from `method`, never trusted from the request body. CARD always means Stripe; there's no way for a client to claim a card charge went through Stripe when it didn't.

**Wallet debits are race-safe the same way ride-accept is.** `wallet.repository.js: tryDebit` compiles `balance >= amount` (WHERE) and `decrement` (SET) into one atomic `UPDATE`, so two concurrent payment attempts against the same wallet can't both succeed against insufficient funds — Postgres serializes the competing updates, exactly like `ride.repository.js: tryAssignDriver` in Phase 5. Verified: an admin-initiated debit larger than the wallet balance was cleanly rejected, never partially applied.

**No live Stripe credentials in this environment.** CARD payments, wallet top-ups, and Stripe refunds are fully implemented and follow Stripe's documented PaymentIntent/webhook/refund API shapes, but couldn't be exercised against Stripe's actual servers here — code-reviewed and syntax-verified, not integration-tested. Every other path (WALLET, CASH, coupons, refunds-to-wallet, the admin wallet-adjustment endpoint that made testing WALLET possible at all without Stripe) was verified live: full CASH payment, WALLET payment with a percentage coupon (math confirmed to the cent), partial refund, remainder refund, double-refund rejection, and over-refund rejection all ran against the real database. Set `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` in `.env` (test-mode keys are fine) to light up the CARD path — see `.env.example` for the local webhook-forwarding command.

Mounted under `/api/v1/rides` (extends the Ride Lifecycle table above):

| Method | Route | Notes |
|---|---|---|
| POST | `/:id/pay` | Ride must be `COMPLETED` and unpaid; CARD returns a `clientSecret` for Stripe.js to confirm client-side |
| GET | `/:id/payment` | View payment + refund history for a ride you're a participant in |

Mounted under `/api/v1/wallet` (authenticated):

| Method | Route | Notes |
|---|---|---|
| GET | `/me` | Balance + paginated transaction ledger |
| POST | `/me/topup` | Creates a Stripe PaymentIntent; wallet is credited only once the webhook confirms success, never from this call directly |

Mounted under `/api/v1/admin` (role: `ADMIN` only), each writing an `AuditLog` entry:

| Method | Route | Notes |
|---|---|---|
| GET | `/payments` \| `/payments/:id` | Filterable by status |
| POST | `/payments/:id/refund` | Full or partial; STRIPE payments refund through Stripe, WALLET/CASH payments credit the payer's wallet (the only channel available to push money back ourselves) |
| GET/POST/PATCH | `/coupons` | `PERCENTAGE` (capped at 100, optionally capped again by `maxDiscount`) or `FIXED`; `code` is immutable after creation |
| POST | `/wallets/:userId/adjust` | Signed amount — credit or debit; the debit path reuses the same race-safe `tryDebit` |

`POST /api/v1/webhooks/stripe` is mounted **before** the global `express.json()` parser in `app.js` specifically so it can use `express.raw()` — Stripe signs the exact request bytes, and a body already parsed into an object no longer has the bytes the signature was computed over.

## Ratings

One `Rating` row per `(rideId, direction)` — the DB unique constraint is the real guarantee, a pre-check in `rating.service.js` just makes the failure a clean 409 instead of a raw Prisma error. `direction` is inferred from who's calling, never accepted as input: if the caller is the ride's passenger it's `PASSENGER_TO_DRIVER`, if the driver it's `DRIVER_TO_PASSENGER`, anything else is a 404 (same "don't confirm this ride exists to people uninvolved in it" reasoning as everywhere else a ride is looked up).

`Driver.averageRating`/`Passenger.averageRating` are recomputed with a fresh `AVG()` over the `Rating` table on every new rating, not adjusted incrementally — cheap at this scale, and it can never drift out of sync with the ratings actually on file the way a running average could.

Mounted under `/api/v1/rides` (extends the table above):

| Method | Route | Notes |
|---|---|---|
| POST | `/:id/rating` | `{value: 1-5, comment?}`; ride must be `COMPLETED`; one rating per direction per ride |
| GET | `/:id/ratings` | Both directions' ratings, for participants (or admin) |

Mounted under `/api/v1/users`:

| Method | Route | Notes |
|---|---|---|
| GET | `/me/ratings` | Ratings you've received, paginated, with the rater's first name |

## Notifications & Background Jobs

**BullMQ runs on its own Redis connection**, separate from the general-purpose `redis` client (`config/redis.js`) — BullMQ's blocking commands need `maxRetriesPerRequest: null`, which would be the wrong setting for every other command sharing that client. `config/queue.js` holds this dedicated connection; `jobs/queues.js` defines three queues (`email`, `maintenance`, `report`) on top of it, each with 3-attempt exponential-backoff retry by default — BullMQ's own answer to "retry failed notifications," not a hand-rolled retry loop.

**`notification.service.js: notify()` is the one place every other service goes through to notify a user.** It always persists a `Notification` row first (the audit trail behind `GET /users/me/notifications`), then dispatches per channel:
- `EMAIL` — enqueued, actually sent by `jobs/processors/email.processor.js` (the swap promised back in Phase 2's `email.service.js` comment — sending used to happen inline, right there).
- `SOCKET` — immediate, over the Phase 6 socket layer; nothing about a live socket emit benefits from a queue.
- `PUSH` — recorded and marked `FAILED` immediately, not queued, not retried. This is an honest stub: push needs FCM/APNs project credentials this environment doesn't have, and retrying can't fix a permanently unconfigured channel — pretending otherwise would be worse than saying so.

**Three real integration points**, not a sprawling retrofit of every event in the app: auth emails (verification, password reset — moved from synchronous to queued), driver verification decisions (`verification.service.js`, approve/reject/suspend), and payment refunds (`payment.service.js`). Live ride-status push during an active ride (Phase 6) deliberately stays untouched — that's ephemeral by design, this is a persistent inbox, and conflating the two would be the wrong abstraction.

**Repeatable jobs, registered idempotently on every boot:**

| Job | Schedule | What it does |
|---|---|---|
| `expired-tokens` (maintenance queue) | daily 3am | Deletes expired/revoked refresh tokens and used/expired verification tokens — pure housekeeping, changes no behavior |
| `daily-summary` (report queue) | daily 6am | Computes a 24h ops summary (rides, revenue, signups, online drivers) and emails every active admin |

Both use BullMQ v6's `upsertJobScheduler` API — **not** the pre-v6 `queue.add(name, data, {repeat: {pattern}})` idiom, which this project tried first and which silently runs the job once immediately instead of scheduling it, a real bug caught by noticing both jobs fire on the very first server boot when they shouldn't have. Verified idempotent across restarts by checking `queue.getJobSchedulers()` stays at one entry, not growing with each boot.

`GET /admin/reports/summary` computes the same numbers synchronously for on-demand inspection (no emailing); `POST /admin/reports/summary/send` runs the full real pipeline — generate, notify, queue, worker-send — immediately, which is how this was actually verified without waiting for 6am.

Mounted under `/api/v1/users`:

| Method | Route | Notes |
|---|---|---|
| GET | `/me/notifications` | Paginated, filterable by `isRead` |
| PATCH | `/me/notifications/:id/read` | Ownership-checked |

Mounted under `/api/v1/admin`:

| Method | Route | Notes |
|---|---|---|
| GET | `/reports/summary` | `?from=&to=`, defaults to the last 24h |
| POST | `/reports/summary/send` | Same computation, also emails every active admin |

**A second real bug, unrelated to jobs, found while testing this phase**: `?isRead=false` on the notifications endpoint was matching *read* notifications, not unread ones. `z.coerce.boolean()` on a query string runs `Boolean("false")`, and any non-empty string is truthy in JavaScript — so `"false"` coerced to `true`. This exact pattern had been sitting unnoticed in two earlier phases (`GET /admin/users?isActive=false` since Phase 3, `GET /admin/coupons?isActive=false` since Phase 7) — neither had ever been tested with the `false` case specifically. Fixed once, centrally, in `common.validator.js: booleanQueryParam`, and applied to all three call sites.

## Admin Dashboard & Analytics

User management (Phase 3) and driver verification (Phase 4) already covered two of this bucket's five items — this phase is the other three: a live snapshot, time-bucketed trends, and a leaderboard.

**Categorical breakdowns use Prisma's `groupBy`** (users by role, drivers by verification status, payments by status) — no reason to reach for raw SQL when the query builder expresses it directly. **Time-bucketed trends use raw SQL** (`analytics.repository.js: rideTrends`/`revenueTrends`) because grouping by a truncated timestamp (day/week/month buckets) isn't something `groupBy` can express — the same "go straight to Prisma for a read-model query" precedent `report.repository.js` set in Phase 9. `interval` is restricted to a fixed enum by the validator before it's ever used, and is still passed as a bound parameter rather than string-interpolated, for defense in depth. Every `COUNT`/`SUM` in the raw queries is explicitly cast (`::int`/`::float`) — Postgres returns `COUNT` as `bigint` and `NUMERIC` sums as strings over the wire by default, neither of which survives `JSON.stringify` cleanly without the cast.

Mounted under `/api/v1/admin`:

| Method | Route | Notes |
|---|---|---|
| GET | `/dashboard` | Users/drivers/vehicles/rides/revenue/payments, all "right now" |
| GET | `/analytics/rides` \| `/analytics/revenue` | `?from=&to=&interval=day\|week\|month`, defaults to the last 30 days |
| GET | `/analytics/top-drivers` | `?by=earnings\|rides\|rating&limit=`; `rating` excludes drivers with zero completed rides — a driver who's never been rated defaults to `0`, which would otherwise incorrectly rank above everyone with a real 5-star average |

## Testing

**Real Postgres, no mocked database** — the same philosophy this project used manually (curl + a real local Postgres/Redis) for ten phases before a test suite existed at all. `ride_sharing_test` is a separate database, migrated with `prisma migrate deploy` (the non-interactive command, correct for an environment that only applies existing migrations rather than authoring new ones); Redis tests use logical DB index 1, keeping job/geo state out of whatever's in the dev Redis (index 0).

**Native ESM, no Babel.** Jest runs with `NODE_OPTIONS=--experimental-vm-modules`, understanding the project's actual `"type": "module"` code directly — adding a Babel transform just to satisfy the test runner would mean tests execute through a step the real app never goes through.

```bash
createdb ride_sharing_test
DATABASE_URL="postgresql://<user>@localhost:5432/ride_sharing_test?schema=public" npx prisma migrate deploy
npm test
```

Three layers, each earning its place rather than duplicating the others:

- **`tests/unit/`** — pure functions and two regression tests for real bugs found earlier in this project (the Express 5 `req.query` getter, and `z.coerce.boolean()` treating `"false"` as truthy). No I/O, no setup.
- **`tests/integration/`** — repository functions against the real test database. This is where the two most important correctness guarantees in the codebase get proven under **genuine concurrent access**, not sequential calls: `wallet.repository.test.js` fires two real simultaneous debits at a wallet that can only cover one, and `ride.repository.test.js` fires two real simultaneous `accept` attempts at the same ride — the same scenario verified manually with curl back in Phase 5, now automated.
- **`tests/api/`** — full HTTP round trips via Supertest against `app.js` directly, **not** `server.js` — the Phase 1 decision to keep `app.js` free of side effects (no listening socket, no job workers, no Socket.IO) is what makes this simple at all.

**Two more real bugs, found while wiring the test suite itself up** (not app bugs — testing-infrastructure bugs, still worth being honest about):
- `npm test` hung indefinitely instead of exiting. Cause: importing `app.js` transitively imports `jobs/queues.js` (auth → email → notifications), and each BullMQ `Queue` duplicates its own Redis connection internally rather than sharing one — closing only the original connection left those duplicates open. Fixed in `tests/helpers/teardown.js`, which closes the actual `Queue` instances.
- Every test ran with `LOG_LEVEL=debug` (dev's value) instead of `.env.test`'s `error`, flooding output with SQL query logs. Cause: dotenv's default is to never override a `process.env` value that's already set, and something in Jest's own startup left stray values in place before `env.js`'s `dotenv.config()` call ran. Fixed with `override: true`, scoped to test mode only — dev intentionally keeps the opposite default, since a developer temporarily exporting a var to override `.env` without editing it is a normal workflow worth preserving.

This suite is a foundation and a demonstrated pattern — proof the highest-risk logic (money, matching) is actually correct, and a template for the next contributor to extend — not a claim of exhaustive endpoint coverage. Most of the ~15 domains built across this project don't have API-layer tests yet.

## Known Limitations

Deliberate, stated simplifications accumulated across phases — not gaps found by accident:

- **`actualFare` always equals `estimatedFare`.** Recomputing a fare from a real GPS trail (vs. the Haversine/Directions estimate taken at request time) needs the live location history the Real-Time phase streams but doesn't persist. Flagged since Phase 5, still true after Payments.
- **No driver payout system.** `Driver.totalEarnings` accrues on every completed ride, but there's no Stripe Connect integration to actually pay a driver out to a bank account — that's KYC + Connect account onboarding, a substantially larger feature than this phase's scope.
- **No heartbeat/staleness detection for "online" drivers.** A driver who force-quits without calling `/drivers/me/offline` stays in `geo:drivers:online` indefinitely. Now that Background Jobs exists, this is straightforward to add (a repeatable job sweeping stale `lastLocationAt` timestamps) — it just wasn't what got built this phase; the two jobs implemented (token cleanup, daily report) were chosen to match the spec's explicit examples.
- **Coupon usage limits are check-then-write, not atomic.** Unlike wallet debits, a coupon's `usageLimit` could be oversold by a few redemptions under heavy concurrent use — an accepted tradeoff since the failure mode is marketing overspend, not lost funds (see the comment in `coupon.service.js`).
- **Job workers run in the same process as the HTTP server.** Appropriate at this project's scale; a production deployment handling meaningful job volume would typically run `jobs/index.js`'s workers as a separate process so a burst of email jobs can't compete with API requests for event-loop time. Nothing about the processors themselves would need to change — see the comment in `jobs/index.js`.

## Phases

This backend is being built incrementally. Each phase is scoped, explained, and approved before the next begins.

- [x] **Phase 1** — Planning, architecture, folder structure, database design
- [x] **Phase 2** — Authentication
- [x] **Phase 3** — User management (passenger/driver/admin)
- [x] **Phase 4** — Vehicle management
- [x] **Phase 5** — Ride lifecycle
- [x] **Phase 6** — Real-time location & sockets
- [x] **Phase 7** — Payments & wallet
- [x] **Phase 8** — Ratings
- [x] **Phase 9** — Notifications & background jobs
- [x] **Phase 10** — Admin dashboard & analytics
- [x] **Phase 11** — Testing
- [ ] API documentation (Swagger)
- [ ] Docker & CI/CD
