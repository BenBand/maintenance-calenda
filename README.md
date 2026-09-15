# Maintenance Calendar

Lusaka City Council - IT Maintenance Calendar System for laptops, desktops, network equipment, and printers.

## Features

- Login with JWT + bcrypt authentication
- Dashboard with upcoming/overdue reminders
- Month calendar with event markers and day details
- Add/edit/cancel maintenance schedules
- Service maintenance form with work performed, outcome, follow-up, signature, signer name/date
- List/filter/search maintenance records

## Tech Stack

- **Frontend**: React 18 + Vite
- **Backend**: Node.js Express
- **Database**: PostgreSQL (pg)
- **Auth**: JWT + bcrypt

## Quick Start

### 1. Prerequisites
- Node.js >= 18
- PostgreSQL >= 14

### 2. Setup

```bash
chmod +x scripts/*.sh
./scripts/setup.sh
```

### 3. Environment

Copy `backend/.env.example` to `backend/.env` and configure:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` - Admin account (seeded on startup)
- `CLIENT_ORIGIN` - Frontend URL

### 4. Start

```bash
npm run dev        # both frontend (3001) and backend (5000)
# or
npm run dev:backend  # backend only
npm run dev:frontend # frontend only
```

## API Endpoints

- `POST /api/auth/login` - Authenticate
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout
- `PUT /api/auth/profile` - Update profile
- `GET/POST /api/maintenance` - List/create schedules
- `GET/PUT/DELETE /api/maintenance/:id` - CRUD schedules
- `GET /api/maintenance/upcoming` - Upcoming schedules
- `GET /api/maintenance/overdue` - Overdue schedules
- `GET /api/maintenance/departments` - Unique departments
- `GET /api/maintenance/date/:date` - Schedules by date
- `GET/POST /api/services` - List/create service records
- `GET/PUT/DELETE /api/services/:id` - CRUD service records
- `GET /api/health` - Health check

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both frontend & backend |
| `npm run dev:frontend` | Frontend dev server (port 3001) |
| `npm run dev:backend` | Backend dev server (port 5000) |
| `npm run build` | Build frontend for production |
| `npm run start` | Start backend production |
| `npm run check` | Syntax check all backend JS files |
| `./scripts/setup.sh` | Full setup (install + check + build) |

## Roles

- **admin**: Full access to schedules, service records, and maintenance records
- **manager**: Read/write schedules, service records, view maintenance records
- **staff**: Read schedules and service records

## Asset Types

- Laptop
- Desktop
- Network Equipment
- Printer
