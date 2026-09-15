#!/usr/bin/env bash

cd "$(dirname "$0")"

echo "=== Starting backend server ==="
cd backend && npm start && cd ..
