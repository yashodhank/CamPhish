FROM node:20-alpine AS frontend
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build

FROM rust:1.80-bookworm AS backend
WORKDIR /app
COPY backend/Cargo.toml backend/Cargo.lock* ./
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release 2>/dev/null || true
COPY backend/ ./
COPY backend/migrations ./migrations
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
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
EXPOSE 8080
VOLUME ["/app/data"]
CMD ["/app/camphish"]
