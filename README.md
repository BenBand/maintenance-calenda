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


### 3. Environment

Copy `backend/.env.example` to `backend/.env` and configure:
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - JWT signing secret
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` - Admin account (seeded on startup)
- `CLIENT_ORIGIN` - Frontend URL


## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start both frontend & backend |
| `npm run dev:frontend` | Frontend dev server
| `npm run dev:backend` | Backend dev server
| `npm run build` | Build frontend for production |
| `npm run start` | Start backend production |
| `npm run check` | Syntax check all backend JS files |

## Roles

- **admin**: Full access to schedules, service records, and maintenance records
- **manager**: Read/write schedules, service records, view maintenance records
- **staff**: Read schedules and service records

## Asset Types

- Laptop
- Desktop
- Network Equipment
- Printer
