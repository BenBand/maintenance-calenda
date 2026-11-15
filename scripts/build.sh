#!/usr/bin/env bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Installing frontend dependencies ==="
cd "$PROJECT_DIR/frontend"
npm install --include=dev

echo "=== Building frontend ==="
npm run build
cd "$PROJECT_DIR"

echo "=== Build complete ==="
