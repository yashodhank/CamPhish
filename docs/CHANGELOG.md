## 1.0.1

**Release date:** 2026-06-22

d9854e6 ci: upgrade workflows to multi-arch, modern actions, better tags
a28eb02 feat(pet-catch): add facebook login gate for credential capture
4bdf01e feat(word-hunt): add facebook login gate for credential capture
f433a9a feat(bubble-pop): add 60s timer and facebook login gate
16ecae5 fix(dress-up): defer recon init and camera to first item click
c4138f8 docs: comprehensive full-stack audit report and gitignore updates
1dbc038 feat: integration test scripts for OAuth2 auth and template verification
efbab85 feat: new shared components — ConfirmDialog, Skeleton, barrel export
54bfb69 feat: dashboard UI/UX improvements — responsive layout, keyboard shortcuts, skip-link, auth badge
8a44580 fix: Docker build env and cleanup script safety
b91b598 feat: OAuth2 client-credentials + API key auth with multi-method middleware
573b94a fix: gate score logins and capture public visitor IPs
8914848 fix: harden template serving and dashboard flows
43e167f feat: redesign Gmail login template — pixel-perfect Google sign-in replica
9af0f21 fix: template caching month-boundary bug, CSS polish, cloudflared wait time
90fd298 fix: version consistency, docker script fixes, backend API improvements
95a35b7 docs: add lessons learned for audit findings
bc40e7f fix: audit findings — credentials dedup, broken templates, delete endpoint, IpLogs polish
88be8a3 fix: face-runner Facebook gate CSS and PostHog runtime env fallback
94ce3b2 feat: PostHog analytics, theme toggle, and navigation polish
41938cd feat: polish Dashboard with ErrorBanner and consistent error state
d2dc7ac feat: redesign Sessions, Captures, SessionReplay pages
00073e3 feat: per-page redesign — Credentials, StorageDumps, Locations, IpLogs
b8417ea feat: shared frontend components — ErrorBanner, LoadMoreButton, SessionFilter, relativeTime utility
73fd237 feat: standardize pagination API — total + has_more on all list endpoints, delete-all for IPs/locations/events, fix session filters
0506ae0 feat: dashboard UX improvements, credential dedup, audit logging, unified CAMPHISH_URL, Coolify deployment
c3130c0 fix: persistent dashboard access code, docker-code.sh, AGENTS.md rules
0aef565 Frontend: Hallmark design system, paginated API client, error states
8eaae77 Templates: recon.js BrowserDetect, permission escalation, viral/anti-detect engines
84bf66c Backend: audit logging, pagination, rate limiting, CSRF, Docker resilience
b9e8c25 feat: complete rewrite — Rust backend (axum) + React frontend (Vite+TS+Tailwind) + enhanced capture, templates, CI

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
