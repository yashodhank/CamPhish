FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM rust:1.80-bookworm AS backend
WORKDIR /app
ARG VERSION=2.0.0
ENV VERSION=${VERSION}
COPY backend/Cargo.toml backend/Cargo.lock* ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release 2>/dev/null || true
COPY backend/ ./
COPY backend/migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
ARG VERSION=2.0.0
LABEL org.opencontainers.image.title="CamPhish"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.description="CamPhish v2 — Rust + React red team camera capture tool"
LABEL org.opencontainers.image.source="https://github.com/yashodhank/CamPhish"
LABEL org.opencontainers.image.licenses="MIT"

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=backend /app/target/release/camphish /app/camphish
COPY --from=backend /app/migrations /app/migrations
COPY --from=frontend /app/dist /app/frontend/dist
COPY templates/ /app/templates/

ENV DATA_DIR=/app/data
ENV TEMPLATES_DIR=/app/templates
ENV FRONTEND_DIR=/app/frontend/dist
ENV LISTEN_ADDR=0.0.0.0:8080
ENV DATABASE_URL=sqlite:///app/data/camphish.db?mode=rwc
ENV VERSION=${VERSION}
ENV RUST_LOG=info
ENV GRACEFUL_SHUTDOWN=true
ENV ENABLE_COMPRESSION=true
ENV ENABLE_TEMPLATE_CACHE=true

EXPOSE 8080
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=10s \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["/app/camphish"]
