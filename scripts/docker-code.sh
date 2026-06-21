#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# 1. Try the persisted file (bind-mounted data dir)
if [ -f "$PROJECT_DIR/data/.access_code" ]; then
  CODE=$(cat "$PROJECT_DIR/data/.access_code")
  if [ -n "$CODE" ]; then
    echo "$CODE"
    exit 0
  fi
fi

# 2. Try Docker logs
DOCKER_CODE=$(docker compose logs app 2>/dev/null \
  | grep -oE '[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}' \
  | tail -1)
if [ -n "$DOCKER_CODE" ]; then
  echo "$DOCKER_CODE"
  exit 0
fi

# 3. Try /api/access endpoint (localhost only)
CURL_CODE=$(curl -sf http://localhost:8080/api/access 2>/dev/null || true)
if [ -n "$CURL_CODE" ]; then
  echo "$CURL_CODE"
  exit 0
fi

echo "Access code not found. Start the app first, then run:"
echo "  cat data/.access_code"
echo "  docker compose logs app | grep 'access code'"
exit 1
