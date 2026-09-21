#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Building frontend ==="
cd "$PROJECT_DIR/frontend" && npm run build && cd "$PROJECT_DIR"

echo "=== Build complete ==="
