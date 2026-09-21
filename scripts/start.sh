#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Starting backend server ==="
cd "$PROJECT_DIR/backend" && npm start && cd "$PROJECT_DIR"
