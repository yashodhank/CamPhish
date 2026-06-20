#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

source .env 2>/dev/null || true

BUILDER="${BUILDER:-heroku/builder:24}"
IMAGE_NAME="${IMAGE_NAME:-camphish-app}"
IMAGE_REGISTRY="${IMAGE_REGISTRY:-}"

check_pack() {
    if ! command -v pack >/dev/null 2>&1; then
        echo "pack CLI not found. Install it:"
        echo "  macOS:  brew install buildpacks/tap/pack"
        echo "  Linux:  (curl -sSL \"https://github.com/buildpacks/pack/releases/download/v0.40.6/pack-v0.40.6-linux.tgz\" | sudo tar -C /usr/local/bin/ --no-same-owner -xzv pack)"
        exit 1
    fi
}

build_app() {
    check_pack
    echo "=== Building CamPhish App with Pack ==="
    echo "Builder: $BUILDER"
    echo "Image:   $IMAGE_NAME"

    local arch=$(uname -m)
    local platform=""
    if [ "$arch" = "arm64" ] || [ "$arch" = "aarch64" ]; then
        echo "ARM64 detected. If export fails, use --publish to push to registry."
        echo "Or use Dockerfile-based build: docker compose build app"
    fi

    local build_args=(
        --builder "$BUILDER"
        --path "$PROJECT_DIR/app/public"
        --default-process web
        --trust-builder
        --clear-cache
    )

    if [ -n "$IMAGE_REGISTRY" ]; then
        build_args+=(--publish)
        local full_image="${IMAGE_REGISTRY}/${IMAGE_NAME}"
        pack build "$full_image" "${build_args[@]}"
        echo "Published: $full_image"
    else
        pack build "$IMAGE_NAME" "${build_args[@]}"
        echo "Built locally: $IMAGE_NAME"
    fi
}

build_dashboard() {
    check_pack
    echo "=== Building CamPhish Dashboard with Pack ==="
    echo "Builder: $BUILDER"

    local dashboard_image="${IMAGE_NAME}-dashboard"
    local build_args=(
        --builder "$BUILDER"
        --path "$PROJECT_DIR/app/dashboard"
        --default-process web
        --trust-builder
        --clear-cache
    )

    if [ -n "$IMAGE_REGISTRY" ]; then
        build_args+=(--publish)
        local full_image="${IMAGE_REGISTRY}/${dashboard_image}"
        pack build "$full_image" "${build_args[@]}"
        echo "Published: $full_image"
    else
        pack build "$dashboard_image" "${build_args[@]}"
        echo "Built locally: $dashboard_image"
    fi
}

inspect() {
    check_pack
    pack inspect-image "$IMAGE_NAME"
}

rebase() {
    check_pack
    echo "=== Rebasing $IMAGE_NAME ==="
    pack rebase "$IMAGE_NAME"
    echo "Rebase complete. Image now uses latest run image."
}

sbom() {
    check_pack
    local output_dir="${PROJECT_DIR}/sbom-out"
    mkdir -p "$output_dir"
    pack sbom download "$IMAGE_NAME" --output-dir "$output_dir"
    echo "SBOM downloaded to $output_dir"
}

case "${1:-build}" in
    build)       build_app ;;
    dashboard)   build_dashboard ;;
    all)         build_app && build_dashboard ;;
    inspect)     inspect ;;
    rebase)      rebase ;;
    sbom)        sbom ;;
    *)
        echo "Usage: $0 {build|dashboard|all|inspect|rebase|sbom}"
        exit 1
        ;;
esac
