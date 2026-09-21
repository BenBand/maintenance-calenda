#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Maintenance Calendar Setup ==="
echo "Project: $PROJECT_DIR"

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed"
  exit 1
fi
echo "Node: $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
  echo "ERROR: npm is not installed"
  exit 1
fi
echo "npm: $(npm --version)"

# Check PostgreSQL connection if DATABASE_URL is set
if [ -f "$PROJECT_DIR/backend/.env" ]; then
  source "$PROJECT_DIR/backend/.env"
  if [ -n "$DATABASE_URL" ]; then
    echo "Database URL configured"
  fi
fi

echo ""
echo "=== Installing Dependencies ==="
cd "$PROJECT_DIR/frontend"
echo "Installing frontend..."
npm install

cd "$PROJECT_DIR/backend"
echo "Installing backend..."
npm install

echo ""
echo "=== Running Backend Syntax Checks ==="
node --check "$PROJECT_DIR/backend/src/index.js" && echo "  index.js OK"
node --check "$PROJECT_DIR/backend/src/controllers/authController.js" && echo "  authController.js OK"
node --check "$PROJECT_DIR/backend/src/controllers/incidentController.js" && echo "  incidentController.js OK"
node --check "$PROJECT_DIR/backend/src/controllers/maintenanceController.js" && echo "  maintenanceController.js OK"
node --check "$PROJECT_DIR/backend/src/controllers/serviceController.js" && echo "  serviceController.js OK"
node --check "$PROJECT_DIR/backend/src/middleware/auth.js" && echo "  auth.js OK"
node --check "$PROJECT_DIR/backend/src/middleware/audit.js" && echo "  audit.js OK"
node --check "$PROJECT_DIR/backend/src/middleware/csrf.js" && echo "  csrf.js OK"
node --check "$PROJECT_DIR/backend/src/middleware/rateLimits.js" && echo "  rateLimits.js OK"
node --check "$PROJECT_DIR/backend/src/middleware/validate.js" && echo "  validate.js OK"
node --check "$PROJECT_DIR/backend/src/middleware/validateEnv.js" && echo "  validateEnv.js OK"
node --check "$PROJECT_DIR/backend/src/models/tables.js" && echo "  tables.js OK"
node --check "$PROJECT_DIR/backend/src/routes/auth.js" && echo "  auth routes OK"
node --check "$PROJECT_DIR/backend/src/routes/incidents.js" && echo "  incidents routes OK"
node --check "$PROJECT_DIR/backend/src/routes/maintenance.js" && echo "  maintenance routes OK"
node --check "$PROJECT_DIR/backend/src/routes/services.js" && echo "  service routes OK"
node --check "$PROJECT_DIR/backend/src/config/database.js" && echo "  database.js OK"
node --check "$PROJECT_DIR/backend/src/utils/bcrypt.js" && echo "  bcrypt.js OK"
node --check "$PROJECT_DIR/backend/src/utils/pagination.js" && echo "  pagination.js OK"
node --check "$PROJECT_DIR/backend/src/seed.js" && echo "  seed.js OK"

echo ""
echo "=== Frontend Build Check ==="
cd "$PROJECT_DIR/frontend"
npx vite build 2>&1 | tail -5

echo ""
echo "=== Setup Complete ==="
echo "To start development:"
echo "  npm run dev    (from project root - starts both frontend & backend)"
echo "Or individually:"
echo "  cd backend && npm start"
echo "  cd frontend && npm run dev"
echo ""
echo "To initialize the database and admin user:"
echo "  cd backend && npm run migrate"
echo "  cd backend && npm run seed  (requires ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL in .env)"
