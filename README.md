# Maintenance Calendar

Lusaka City Council - IT Maintenance Calendar System for laptops, desktops, network equipment, and printers.

## Security Features

- **JWT + bcrypt authentication** with short-lived access tokens and rotating refresh tokens
- **Rate limiting** on login (5 attempts / 15 min) and all API routes (100 requests / 15 min)
- **Helmet.js** security headers (clickjacking protection, MIME sniffing prevention, CSP, XSS filtering)
- **CSRF protection** - a synchronizer token is issued with the JWT and validated on all state-changing requests
- **Input validation & sanitization** on both backend (express-validator) and frontend
- **IP address hashing** in audit logs for privacy compliance
- **Role-based permissions** with `requirePermission` middleware on all routes
- **Environment validation** - the server refuses to start if `JWT_SECRET` or `DATABASE_URL` are missing, `JWT_SECRET` is too weak/short or still the template placeholder, `AUDIT_IP_SALT` is unset/placeholder, or `CLIENT_ORIGIN` is missing

## Features

- Login with JWT + bcrypt authentication
- Dashboard with upcoming/overdue reminders
- Month calendar with event markers and day details
- Add/edit/cancel maintenance schedules
- Service maintenance form with work performed, outcome, follow-up, signature, signer name/date
- Report and track maintenance incidents with status and priority
- List/filter/search maintenance records

### Scheduling

- Month, week and day views over a 15-minute time grid (`06:00`-`20:00`)
- Jobs carry a start time and a **duration** (15-1440 minutes); the slot end is
  derived from `duration_minutes` in one place so the calendar, conflict
  detection and analytics agree
- **Per-slot conflict detection** for the technician and the room, surfaced in
  the booking form before saving rather than after
- **Downtime windows** (planned / unplanned / maintenance) can block a
  department, room or single asset
- Monthly, quarterly and annual **recurrence**, with occurrences materialised by
  `POST /api/maintenance/:id/generate-recurrences`
- **Asset registry** with lifecycle stages (procurement, deployed, in_service,
  maintenance, retired, disposed) and an append-only event history. Lifecycle
  dates are validated and constrained so end-of-life and disposal can never
  precede purchase

### Analytics and cost

`/analytics` reports, each scoped to a period (`7d`, `30d`, `90d`, `6m`, `12m`,
`ytd`) and optionally a department, in the `Africa/Lusaka` timezone:

| Endpoint | Report |
| --- | --- |
| `GET /api/analytics/overview` | Headline counters |
| `GET /api/analytics/maintenance-frequency` | Jobs per asset over time |
| `GET /api/analytics/technician-workload` | Jobs and completion rate per technician |
| `GET /api/analytics/overdue-trend` | Overdue jobs, day or week buckets |
| `GET /api/analytics/cost-by-department` | Labour, parts and total spend per department |
| `GET /api/analytics/uptime` | Availability, downtime and MTTR per department |

Cost flows from an **estimated** amount on the schedule to the **actual**
labour/parts spend on the service record. `service_records.total_cost` is a
stored generated column, and `downtime_minutes` captured at sign-off feeds the
uptime report.

### Offline PWA

- Installable via the web app manifest, with a service worker that pre-caches the
  app shell and falls back to the cached shell when the network is gone
- **Last-known-good read cache**: successful API reads are cached per user and
  served when the network drops, with a banner so a technician knows the screen
  is stale
- **Offline write queue**: a signed service record created without connectivity
  is parked in a local outbox, replayed in order on reconnect via Background
  Sync (with an `online` listener and retry for browsers without it), and only
  dropped on a permanent 4xx so one bad request cannot wedge the queue
- Mobile-first layout with a bottom tab bar and tables that collapse to cards
- A reload prompt appears when a new build is waiting, so nobody stays on a
  stale bundle for a whole shift

The outbox lives in the page rather than the service worker, because the queue
holds the session token; the worker asks the open clients to flush.


## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Node.js Express
- **Database**: PostgreSQL (pg)
- **Auth**: JWT + bcrypt

## Quick Start

### 1. Prerequisites
- Node.js >= 18
- PostgreSQL >= 14

### 2. Environment Variables

Copy the environment templates and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Required variables:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - A strong secret (minimum 32 characters). Generate one with:
  ```bash
  openssl rand -base64 64
  ```
- `AUDIT_IP_SALT` - Random salt for hashing IP addresses in audit logs
- `CLIENT_ORIGIN` - Frontend URL (e.g. `http://localhost:3001`)

### 3. Setup & Install

```bash
npm run dev          # Start both frontend & backend
# or
npm run dev:backend  # Backend only
npm run dev:frontend # Frontend only
```

### 4. Database Migrations

```bash
cd backend
npm run migrate      # Create/update database tables
```

All data (users, assets, schedules, incidents) is loaded directly from Neon via
`DATABASE_URL`. The application ships no seed data and no seed script, so
`npm run migrate` only applies schema changes.

### 5. Build for Production

```bash
npm run build        # Build frontend
npm start            # Start backend in production
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both frontend & backend |
| `npm run dev:backend` | Backend dev server |
| `npm run dev:frontend` | Frontend dev server |
| `npm run build` | Build frontend for production |
| `npm start` | Start backend production |
| `npm run check` | Syntax check every backend source file (walks `backend/src`) |
| `npm run migrate` | Run database migrations (backend) |

## Data

There is no seed data and no seed script. Users, the asset register and all
maintenance history live in Neon and are loaded through `DATABASE_URL`; run
`npm run migrate` for schema only.

`backend/database/migrations/000008_asset_registry_and_lifecycle.sql` contains
two non-demo data statements that must stay in place:

- It inserts the four rows into `asset_types` (Laptop, Desktop, Network
  Equipment, Printer). This is reference data, and `assets.asset_type` has a
  foreign key to it, so the table cannot be empty.
- It backfills `assets` from any pre-existing `maintenance_schedules` and
  `incidents` rows. On a database loaded from Neon this is a no-op; on an older
  database it is what links existing schedules to the registry.

## Roles

Access is enforced server-side with `requirePermission` on every route. The
role/permission matrix lives in `backend/src/middleware/auth.js`
(`ROLE_PERMISSIONS`) and is mirrored for UI gating in
`frontend/src/services/permissions.js`. The two must be kept in sync.

| Permission | staff | manager | admin |
| --- | :---: | :---: | :---: |
| `maintenance:read` | yes | yes | yes |
| `maintenance:write` | - | yes | yes |
| `maintenance:delete` | - | - | yes |
| `service:read` | yes | yes | yes |
| `service:write` | yes | yes | yes |
| `service:delete` | - | - | yes |
| `asset:read` | yes | yes | yes |
| `asset:write` | - | yes | yes |
| `asset:delete` | - | - | yes |
| `analytics:read` | - | yes | yes |
| `incident:read` | - | yes | yes |
| `incident:write` | - | yes | yes |
| `incident:delete` | - | - | yes |
| `profile:read` / `profile:update` | yes | yes | yes |
| `user:read` / `user:write` / `user:delete` | - | - | yes |

- **staff**: Field technician. Works a job from the calendar and closes it out on
  site, so they can read and write service records. The schedule and the asset
  register stay read-only: technicians do not plan work, and the register is a
  council-wide inventory.
- **manager**: Create/edit schedules, complete service records, manage the asset
  register and incidents, read analytics
- **admin**: Full access, including user management (`/api/users`)

Note: the access token embeds the role, so a role change takes effect for an
existing session only after the token is refreshed. Updating or deleting a user
clears their refresh token to force re-authentication, but an already-issued
access token remains valid until it expires (`JWT_EXPIRES_IN`, 8h by default).

## Asset Types

- Laptop
- Desktop
- Network Equipment
- Printer

The vocabulary lives in the `asset_types` table rather than a hard-coded check,
so new types are added with `POST /api/assets/types` (manager or admin) instead
of a migration.

## API

All routes are under `/api`, require a bearer token, and require the
`X-CSRF-Token` header on state-changing requests.

| Route | Permission | Purpose |
| --- | --- | --- |
| `GET /api/maintenance` | `maintenance:read` | Schedules, filterable by range, department, technician and status; returns `{ data, recurrences, pagination }` |
| `POST /api/maintenance` | `maintenance:write` | Book a slot with duration, estimated cost and recurrence |
| `PUT /api/maintenance/:id` | `maintenance:write` | Replace a schedule |
| `POST /api/maintenance/:id/generate-recurrences` | `maintenance:write` | Materialise recurring occurrences |
| `POST /api/services` | `service:write` | Close out a job: work performed, costs, downtime, signature |
| `GET /api/assets` | `asset:read` | Asset registry, filterable and paginated |
| `GET /api/assets/stats` | `asset:read` | Fleet counts, warranty and end-of-life standing |
| `POST /api/assets/:id/lifecycle` | `asset:write` | Move an asset to the next lifecycle stage |
| `GET /api/assets/:id/events` | `asset:read` | Append-only lifecycle history |
| `GET /api/downtime/windows` | `maintenance:read` | Downtime windows in a date range |
| `GET /api/downtime/availability` | `maintenance:read` | Bookings, conflicts and downtime for one day |
| `GET /api/analytics/*` | `analytics:read` | Reports, see above |

## Migrations

Numbered SQL files in `backend/database/migrations`, applied in order by
`npm run migrate` and recorded in `pgmigrations`, so a rerun is a no-op. The
recent ones:

| Migration | Adds |
| --- | --- |
| `000008_asset_registry_and_lifecycle` | `asset_types`, `assets`, append-only `asset_events` |
| `000009_time_slots_downtime_and_costs` | Duration, technician, downtime windows, cost columns |
| `000010_asset_lifecycle_date_ordering` | Constraints keeping lifecycle dates in order |
| `000011_recurrence_estimated_cost` | `estimated_cost` on recurring occurrences |

