FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM rust:1.96-alpine AS backend
WORKDIR /app
RUN apk add --no-cache musl-dev gcc
COPY backend/ ./
RUN cargo build --release && ls -lh target/release/camphish

FROM alpine:3.20
ARG VERSION=2.1.0
LABEL org.opencontainers.image.title="CamPhish"
LABEL org.opencontainers.image.version="${VERSION}"
LABEL org.opencontainers.image.description="CamPhish v2 — Rust + React red team camera capture tool"
LABEL org.opencontainers.image.source="https://github.com/yashodhank/CamPhish"
LABEL org.opencontainers.image.licenses="MIT"

RUN apk add --no-cache ca-certificates curl

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
