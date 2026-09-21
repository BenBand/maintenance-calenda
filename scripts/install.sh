#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Installing dependencies ==="
cd "$PROJECT_DIR/frontend" && npm install && cd "$PROJECT_DIR"
cd "$PROJECT_DIR/backend" && npm install && cd "$PROJECT_DIR"

echo "=== Running backend syntax check ==="
cd "$PROJECT_DIR/backend" && npm run check

echo "=== Installation complete ==="
