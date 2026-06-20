#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

source .env 2>/dev/null || true

IMAGE_NAME="${IMAGE_NAME:-camphish-app}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"

run_local() {
    local image="$IMAGE_NAME"
    [ -n "$IMAGE_REGISTRY" ] && image="${IMAGE_REGISTRY}/${IMAGE_NAME}"

    echo "Running $image locally..."
    docker run --rm -it \
        -p 8080:80 \
        -v "${PROJECT_DIR}/data/captures:/data/captures" \
        -v "${PROJECT_DIR}/data/locations:/data/locations" \
        -v "${PROJECT_DIR}/data/logs:/data/logs" \
        -v "${PROJECT_DIR}/data/config:/data/config" \
        -e "SESSION_NAME=${SESSION_NAME:-default}" \
        -e "DEFAULT_TEMPLATE=${DEFAULT_TEMPLATE:-1}" \
        -e "FESTIVAL_NAME=${FESTIVAL_NAME:-NewYear}" \
        -e "YOUTUBE_VIDEO_ID=${YOUTUBE_VIDEO_ID:-dQw4w9WgXcQ}" \
        "$image"
}

run_dashboard() {
    local image="${IMAGE_NAME}-dashboard"
    [ -n "$IMAGE_REGISTRY" ] && image="${IMAGE_REGISTRY}/${IMAGE_NAME}-dashboard"

    echo "Running dashboard $image locally..."
    docker run --rm -it \
        -p "${DASHBOARD_PORT:-8080}:80" \
        -v "${PROJECT_DIR}/data/captures:/data/captures:ro" \
        -v "${PROJECT_DIR}/data/locations:/data/locations:ro" \
        -v "${PROJECT_DIR}/data/logs:/data/logs" \
        -v "${PROJECT_DIR}/data/config:/data/config:ro" \
        -e "SESSION_NAME=${SESSION_NAME:-default}" \
        "$image"
}

case "${1:-app}" in
    app)        run_local ;;
    dashboard)  run_dashboard ;;
    *)
        echo "Usage: $0 {app|dashboard}"
        exit 1
        ;;
esac
