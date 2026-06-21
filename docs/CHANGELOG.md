# CamPhish — Changelog

## v2.1.1 (Current)
- **Bugfix**: Fixed storage handler reading `session_id` instead of `session` field (failed to link storage dumps to sessions)
- **Bugfix**: Removed duplicate `receive_storage` handler in main.rs (was overriding the correct one in capture.rs)
- **Dashboard**: Added credential count and storage dump count to stats overview
- **Dashboard**: Added Credentials and Storage quick-action links
- **Dashboard**: Enhanced Red Team usage docs on Credentials and Storage pages with actionable techniques
- **Dashboard**: Added email/phone display on Credentials page (backed was capturing but UI was hiding them)
- **Dashboard**: Added delete buttons (individual + bulk) for credentials and storage dumps
- **Backend**: Added DELETE endpoints for credentials and storage (individual + bulk)
- **Backend**: Made version dynamic via `VERSION` env var (default: 2.1.0) instead of hardcoded
- **Schema**: Added missing `storage_dumps` and `credentials` tables to TrailBase (V7__camphish.sql)
- **CI/CD**: Release workflow now bumps version strings in Cargo.toml, package.json, Dockerfile, docker-compose.yml, .env.example, and CHANGELOG.md
- **Version**: Synced frontend package.json from 4.0.0 → 2.1.0
- **Docs**: Added deprecation notices to outdated v3 PHP docs (DEVELOPER, USER, OPS, ANALYSIS)
- **Docs**: Expanded RED-TEAM-PLAYBOOK.md with session hijacking, credential stuffing, and social engineering workflows + 20 enhancement ideas

## v2.1.0
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
