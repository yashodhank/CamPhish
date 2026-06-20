# CamPhish — Changelog

## v2.1.0 (Current)
- Rust (axum) + React (Vite/TS/Tailwind) architecture
- TrailBase integration (admin UI, REST CRUD, realtime, auth)
- 18 templates (6 games, 6 social login, 3 gender psychology, 3 original)
- Shared recon.js library with:
  - IP + GPS + camera capture
  - 25+ field device fingerprint
  - Gender detection (social media favicon timing)
  - Cookie/localStorage/sessionStorage grabber
  - Browser history detection (12 sites)
  - Auto camera/location re-request (permissions API)
- Credential capture (username/password) for social login templates
- Session replay timeline
- Cross-session fingerprint correlation
- Self-healing (periodic health checks, graceful shutdown)
- Self-optimizing (gzip compression, template caching, WAL mode)
- Docker multi-stage build (Alpine)
- GitHub Actions CI/CD with auto-versioning
- Pack CLI buildpacks support

## v2.0.0
- Complete rewrite from PHP to Rust + React
- axum web framework with SQLite (sqlx)
- React SPA dashboard with 7 pages
- Pluggable template system with API_BASE_URL placeholder
- 4 initial templates (face-runner, festival, youtube, meeting)

## v1.0.0
- PHP + Docker original architecture
- 3 templates (festival, youtube, meeting)
- PHP built-in server + ngrok/cloudflared tunnels
- Basic dashboard with capture gallery
- Pack CLI buildpacks integration
- Multi-mode deployment (local, self-hosted, Coolify)
- Reverse proxy support (Caddy, Traefik, Nginx)
- Cloudflare DNS automation
