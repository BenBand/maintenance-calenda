#!/usr/bin/env bash

cd "$(dirname "$0")"

echo "=== Installing dependencies ==="
cd frontend && npm install && cd ..
cd backend && npm install && cd ..

echo "=== Running backend syntax check ==="
npm run check

echo "=== Installation complete ==="
