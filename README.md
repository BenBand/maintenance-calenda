# Maintenance Calendar

Lusaka City Council - IT Maintenance Calendar System for laptops, desktops, network equipment, and printers.

## Security Features

- **JWT + bcrypt authentication** with configurable expiry
- **Rate limiting** on login (5 attempts / 15 min) and all API routes (100 requests / 15 min)
- **Helmet.js** security headers (clickjacking protection, MIME sniffing prevention, CSP, XSS filtering)
- **CSRF protection** - a synchronizer token is issued with the JWT and validated on all state-changing requests
- **Input validation & sanitization** on both backend (express-validator) and frontend
- **IP address hashing** in audit logs for privacy compliance
- **Role-based permissions** with `requirePermission` middleware on all routes
- **Environment validation** - the server refuses to start if `JWT_SECRET` or `DATABASE_URL` are missing or `JWT_SECRET` is too weak/short

## Features

- Login with JWT + bcrypt authentication
- Dashboard with upcoming/overdue reminders
- Month calendar with event markers and day details
- Add/edit/cancel maintenance schedules
- Service maintenance form with work performed, outcome, follow-up, signature, signer name/date
- Report and track maintenance incidents with status and priority
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
- `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_EMAIL` - Initial admin account (see Seeding below)

### 3. Setup & Install

```bash
npm run dev          # Start both frontend & backend
# or
npm run dev:backend  # Backend only
npm run dev:frontend # Frontend only
```

### 4. Database Migration & Admin Seeding

```bash
cd backend
npm run migrate      # Create database tables
npm run seed         # Create initial admin user from .env variables
```

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
| `npm run check` | Syntax check all backend JS files |
| `npm run migrate` | Run database migrations (backend) |
| `npm run seed` | Seed initial admin user (backend) |

## Roles

- **admin**: Full access to schedules, service records, maintenance records, and incidents

## Asset Types

- Laptop
- Desktop
- Network Equipment
- Printer
