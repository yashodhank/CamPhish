# CamPhish v2.1.0 — Architecture Documentation

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Network                        │
│                                                         │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ TrailBase │  │  CamPhish    │  │   Cloudflared     │  │
│  │  :4000    │  │  App :8080   │  │   Tunnel          │  │
│  │           │  │              │  │                   │  │
│  │ Admin UI  │  │ Rust/axum   │  │ HTTPS → :8080    │  │
│  │ REST CRUD │  │ SQLite WAL  │  │                   │  │
│  │ Realtime  │  │ React SPA   │  └───────────────────┘  │
│  │ Auth      │  │ Templates   │                          │
│  └──────────┘  └──────────────┘                          │
└─────────────────────────────────────────────────────────┘
         ↑                              ↑
    Operator                     Target Browser
    (Dashboard)                  (Phishing Link)
```

## Component Details

### 1. Rust Backend (axum)
- **Entry**: `backend/src/main.rs`
- **Framework**: axum 0.7 with tower-http middleware (CORS, compression, tracing)
- **Database**: SQLite via sqlx 0.8 with WAL mode
- **Template serving**: `GET /t/:id` — reads HTML, replaces `API_BASE_URL` → `/api` and `forwarding_link` → tunnel URL
- **Static files**: React SPA served from `frontend/dist/`
- **Health check**: `GET /api/health` returns JSON with uptime, DB status, TrailBase status
- **Self-healing**: Periodic DB connectivity check (configurable interval)
- **Graceful shutdown**: Waits for ctrl_c signal, drains connections

### 2. React Frontend (Vite + TypeScript + TailwindCSS)
- **Pages**: Dashboard, Captures, Locations, IP Logs, Session Replay, Templates, Sessions
- **Auto-refresh**: 3-5 second polling on all pages
- **Real-time**: Captures gallery with NEW badge on recent (<30s), lightbox with keyboard nav
- **Responsive**: Sidebar collapses to icons on mobile

### 3. Template System
- **Location**: `templates/*.html` (auto-scanned on startup)
- **Shared library**: `templates/recon.js` served at `/t/recon.js`
- **Placeholders**: `API_BASE_URL` → `/api`, `forwarding_link` → tunnel URL
- **18 templates**: 6 games, 6 social login, 3 gender psychology, 3 original

### 4. TrailBase Integration
- **Purpose**: Admin UI, REST CRUD, realtime subscriptions, auth
- **Migration**: `V7__camphish.sql` (V1-V6 reserved for TrailBase built-ins)
- **Tables**: sessions, captures, locations, ip_logs, templates, audit_log, events, storage_dumps, credentials
- **Fallback**: App uses SQLite directly if TrailBase unavailable

### 5. Capture Pipeline
```
Target Browser
    ↓
recon.js (CamPhishRecon.init)
    ├── POST /api/capture/ip         → IP + User-Agent
    ├── POST /api/capture/location   → GPS (lat, lon, accuracy, altitude)
    ├── POST /api/capture/image      → Base64 PNG camera snapshot
    ├── POST /api/capture/fingerprint → 25+ fingerprint fields
    ├── POST /api/capture/event      → Session replay events
    ├── POST /api/capture/storage    → Cookies + localStorage + sessionStorage
    └── POST /api/capture/credentials → Username + password (social login)
    ↓
SQLite (primary) + TrailBase (secondary)
    ↓
React Dashboard (real-time display)
```

### 6. Recon Library (recon.js)
- **Persistent permissions**: localStorage tracking + navigator.permissions API
- **Gender detection**: Social media favicon timing (Pinterest/Instagram = female, Reddit/Steam = male)
- **Enhanced fingerprint**: Canvas, WebGL, audio context, 28 fonts, battery, WebRTC local IP
- **Cookie grabber**: document.cookie extraction
- **Storage dump**: localStorage + sessionStorage + IndexedDB enumeration
- **History detection**: 12 sites across 5 categories (favicon timing)
- **Auto permissions**: Re-requests camera/location if previously granted (no user prompt)

## Database Schema (SQLite)

### Tables
| Table | Purpose | Key Columns |
|-------|---------|-------------|
| sessions | Campaign instances | id, name, template_id, status |
| captures | Camera snapshots | session_id, filename, file_path, capture_method |
| locations | GPS coordinates | session_id, latitude, longitude, accuracy |
| ip_logs | Visitor info + fingerprint | session_id, ip_address, canvas_fingerprint, gender_prediction |
| templates | Template registry | id, name, description, file_path |
| events | Session replay | session_id, event_type, event_data |
| storage_dumps | Browser storage | session_id, data (JSON) |
| credentials | Login credentials | session_id, template_id, username, password |
| audit_log | Chain of custody | actor, action, resource_type, session_id |

## Docker Architecture

### Multi-stage Dockerfile
```
Stage 1: node:20-alpine → npm install → npm run build (React SPA)
Stage 2: rust:1.96-alpine → cargo build --release (Rust binary)
Stage 3: alpine:3.20 → copy binary + frontend + templates → CMD
```

### docker-compose.yml Services
| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| trailbase | trailbase/trailbase:latest | 4000 | Admin UI, REST, realtime |
| app | camphish:2.1.0 (built) | 8080 | API + dashboard + templates |
| cloudflared | cloudflare/cloudflared:latest | — | HTTPS tunnel |
| ngrok | ngrok/ngrok:latest | — | Alternative tunnel |

## Version History
- v1.0.0: PHP + Docker (original)
- v2.0.0: Rust + React rewrite
- v2.1.0: TrailBase + red team + self-healing + 18 templates
