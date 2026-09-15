#!/usr/bin/env bash

cd "$(dirname "$0")"

echo "=== Starting Maintenance Calendar ==="
echo "=== Backend will start on port 5000 ==="
echo "=== Frontend will start on port 3001 ==="

npm run dev
