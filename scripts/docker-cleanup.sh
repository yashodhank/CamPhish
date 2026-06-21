#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== CamPhish Cleanup ==="
echo ""

# Stop and remove containers (including profile containers like cloudflared/ngrok)
echo "[1/3] Stopping and removing containers..."
docker compose down --remove-orphans --profile cloudflared --profile ngrok 2>/dev/null || true
echo "  ✅ Done"

# Clean up Docker volumes
echo "[2/3] Removing Docker volumes (camphish_data)..."
docker volume rm camphish_camphish_data 2>/dev/null && echo "  ✅ camphish_data removed" || echo "  ⏭️  camphish_data not found"
docker volume rm camphish_trailbase_data 2>/dev/null && echo "  ✅ trailbase_data removed" || echo "  ⏭️  trailbase_data not found"

# Clean up local data directory
echo "[3/3] Cleaning local data directory..."
rm -rf data/captures data/locations data/camphish.db data/camphish.db-wal data/camphish.db-shm 2>/dev/null || true
echo "  ✅ Local data cleaned"

echo ""
echo "=== Cleanup complete ==="
echo "Run ./scripts/docker-start.sh to redeploy"
