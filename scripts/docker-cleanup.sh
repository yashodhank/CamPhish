#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "=== CamPhish Cleanup ==="
echo ""

# Stop and remove containers (including profile containers like cloudflared/ngrok)
echo "[1/3] Stopping and removing containers..."
docker compose --profile cloudflared --profile ngrok down --remove-orphans 2>/dev/null || true
echo "  ✅ Done"

# Clean up Docker volumes
echo "[2/3] Removing Docker volumes..."
for vol in $(docker volume ls -q | grep -E 'camphish.*(data|trailbase)'); do
  docker volume rm "$vol" 2>/dev/null && echo "  ✅ $vol removed" || echo "  ⏭️  $vol not found"
done

# Clean up local data directory
echo "[3/3] Cleaning local data directory..."
rm -rf data/captures data/locations data/camphish.db data/camphish.db-wal data/camphish.db-shm 2>/dev/null || true
echo "  ✅ Local data cleaned"

echo ""
echo "=== Cleanup complete ==="
echo "Run ./scripts/docker-start.sh to redeploy"
