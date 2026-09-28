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
cd "$PROJECT_DIR/backend" && npm run check

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
echo "To apply the database schema (data is loaded from Neon via DATABASE_URL):"
echo "  cd backend && npm run migrate"
