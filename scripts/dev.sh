#!/usr/bin/env bash

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== Starting Maintenance Calendar ==="
echo "=== Backend will start on port 5000 ==="
echo "=== Frontend will start on port 3001 ==="

cd "$PROJECT_DIR" && npm run dev
