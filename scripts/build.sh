#!/usr/bin/env bash

cd "$(dirname "$0")"

echo "=== Building frontend ==="
cd frontend && npm run build && cd ..

echo "=== Build complete ==="
