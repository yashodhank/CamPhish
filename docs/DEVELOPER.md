# CamPhish Developer Guide

**Audience:** Software Engineers, Contributors, Security Researchers

---

## Table of Contents

1. [Codebase Architecture](#codebase-architecture)
2. [Component Deep-Dive](#component-deep-dive)
3. [Build System](#build-system)
4. [Data Flow](#data-flow)
5. [Adding New Templates](#adding-new-templates)
6. [Adding New Proxy Providers](#adding-new-proxy-providers)
7. [Testing](#testing)
8. [Contributing](#contributing)
9. [API Reference](#api-reference)

---

## Codebase Architecture

### Directory Structure

```
CamPhish/
├── app/
│   ├── public/                    # Phishing application (served by Apache)
│   │   ├── index.php              # Entry point, template selector
│   │   ├── ip.php                 # IP + User-Agent logger
│   │   ├── location.php           # GPS data handler
│   │   ├── post.php               # Camera image handler
│   │   ├── debug_log.php          # Filtered debug logger
│   │   ├── health.php             # Docker healthcheck endpoint
│   │   ├── composer.json          # PHP project manifest
│   │   ├── composer.lock          # Dependency lock file
│   │   ├── Procfile               # Heroku process type
│   │   └── templates/             # Phishing templates
│   │       ├── festivalwishes.html
│   │       ├── LiveYTTV.html
│   │       └── OnlineMeeting.html
│   └── dashboard/                 # Operator dashboard
│       ├── index.php              # Dashboard UI
│       └── api/
│           └── capture.php        # Image serving endpoint
├── docker/                        # Docker configuration
│   ├── Dockerfile.dashboard       # Dashboard image
│   ├── apache-vhost.conf          # App virtual host
│   ├── dashboard-vhost.conf       # Dashboard virtual host
│   ├── entrypoint.sh              # Container init script
│   └── php.ini                    # PHP runtime config
├── proxy/                         # Reverse proxy configs
│   ├── caddy/Caddyfile
│   ├── traefik/traefik.yml
│   ├── traefik/dynamic.yml
│   └── nginx/
│       ├── nginx.conf
│       └── conf.d/
│           ├── camphish.conf
│           └── dashboard.conf
├── cloudflare/                    # DNS automation
│   ├── dns-setup.sh
│   └── dns-delete.sh
├── pack/                          # Buildpack build scripts
│   ├── build.sh
│   └── run.sh
├── docs/                          # Documentation
│   ├── OPS.md
│   ├── DEVELOPER.md
│   ├── USER.md
│   ├── ANALYSIS.md
│   └── diagrams/                  # Mermaid diagrams + PNG exports
├── data/                          # Runtime data (gitignored)
│   ├── captures/
│   ├── locations/
│   ├── logs/
│   └── config/
├── Dockerfile                     # App image (Dockerfile build path)
├── docker-compose.yml             # Service orchestration
├── project.toml                   # Buildpack descriptor
├── .env / .env.example            # Configuration
├── Makefile                       # Build/deploy targets
├── camphish                       # Unified CLI
└── README.md
```

### Component Interaction Diagram

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│  camphish   │────▶│ docker-compose│────▶│  Docker Engine │
│  (CLI)      │     │  (orchestr.) │     │  (runtime)    │
└─────────────┘     └──────────────┘     └───────┬───────┘
                                                  │
                    ┌──────────────────────────────┤
                    │                              │
            ┌───────┴───────┐              ┌───────┴───────┐
            │  camphish-app │              │   dashboard   │
            │  (Apache+PHP) │              │  (Apache+PHP) │
            └───────┬───────┘              └───────────────┘
                    │
        ┌───────────┼───────────┐
        │           │           │
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │ ip.php  │ │loc.php  │ │post.php │
   └────┬────┘ └────┬────┘ └────┬────┘
        │           │           │
   ┌────┴────┐ ┌────┴────┐ ┌────┴────┐
   │ip.txt   │ │loc_*.txt│ │cam*.png │
   └─────────┘ └─────────┘ └─────────┘
```

---

## Component Deep-Dive

### index.php — Entry Point & Template Selector

**Path:** `app/public/index.php`
**Purpose:** First page the target sees. Reads session config, selects template, injects tunnel URL.

```php
// Reads /data/config/session.env for:
//   DEFAULT_TEMPLATE (1=Festival, 2=YouTube, 3=Meeting)
//   FESTIVAL_NAME (if template=1)
//   YOUTUBE_VIDEO_ID (if template=2)

// Loads template HTML, replaces placeholders:
//   forwarding_link → tunnel URL
//   fes_name → festival name
//   live_yt_tv → YouTube video ID

// Outputs the final HTML to the target's browser
```

**Key design decisions:**
- Template selection is server-side (not exposed to target)
- Placeholder replacement uses `str_replace` (no template engine dependency)
- Config read from file, not environment (survives container restarts)

### ip.php — IP Logger

**Path:** `app/public/ip.php`
**Purpose:** Captures target IP and User-Agent on first request.

```php
// Priority chain for real IP:
//   1. HTTP_CLIENT_IP
//   2. HTTP_X_FORWARDED_FOR
//   3. REMOTE_ADDR

// Writes to:
//   /data/logs/ip.txt (current session)
//   /data/logs/saved.ip.txt (cumulative)
```

**Edge cases handled:**
- Proxy headers present (X-Forwarded-For from Cloudflare/ngrok)
- IPv6 addresses
- Missing User-Agent header

### location.php — GPS Handler

**Path:** `app/public/location.php`
**Purpose:** Receives GPS coordinates from target browser via POST.

```php
// Input: POST {lat, lon, acc}
// Output: JSON {status: "success"|"error"}

// Writes to:
//   /data/locations/location_DDMMYYYYHHMMSS.txt (timestamped)
//   /data/locations/current_location.txt (latest, for shell detection)
//   /data/locations/saved.locations.txt (cumulative append)
```

**Validation:**
- Both `lat` and `lon` must be present and non-empty
- Returns JSON error if data missing
- Uses `LOCK_EX` for concurrent write safety

### post.php — Camera Image Handler

**Path:** `app/public/post.php`
**Purpose:** Receives base64-encoded PNG from target browser.

```php
// Input: POST {cat: "data:image/png;base64,..."}
// Process:
//   1. Strip "data:image/png;base64," prefix
//   2. base64_decode
//   3. Validate decoded data is non-empty
//   4. Write to /data/captures/camDDMMYYYYHHMMSS.png

// Returns: empty 200 OK (or 400 on invalid data)
```

**Security:**
- Validates base64 decode result before writing
- Uses `LOCK_EX` for atomic writes
- Returns 400 on invalid input (no silent corruption)

### debug_log.php — Filtered Debug Logger

**Path:** `app/public/debug_log.php`
**Purpose:** Receives debug messages from target browser JS, filters noise.

```php
// Filters out messages containing:
//   - "Location data sent"
//   - "getLocation called"
//   - "Geolocation error"
//   - "Location permission denied"

// Only logs messages with:
//   - "Lat:" or "Latitude:" (coordinate data)
//   - "Position obtained" (success marker)
```

### health.php — Health Check Endpoint

**Path:** `app/public/health.php`
**Purpose:** Docker healthcheck target. Returns JSON status.

```json
{"status":"ok","service":"camphish-app","timestamp":"...","php_version":"8.2.31"}
```

### Dashboard — index.php

**Path:** `app/dashboard/index.php`
**Purpose:** Operator UI for viewing captures.

**Features:**
- Scans `/data/captures/` for PNG files, displays as clickable gallery
- Scans `/data/locations/` for GPS files, parses lat/lon/accuracy/maps link
- Reads `/data/logs/saved.ip.txt` for IP log
- Lightbox modal for full-size image viewing
- Session stats (capture count, location count, IP entries)
- Auto-refresh via browser reload button

### Dashboard — api/capture.php

**Path:** `app/dashboard/api/capture.php`
**Purpose:** Serves individual capture images securely.

```php
// Validates filename matches pattern: cam*.png
// Uses basename() to prevent path traversal
// Returns 400 on invalid filename, 404 on missing file
// Sets Content-Type: image/png, Content-Length
```

---

## Build System

### Path A: Cloud Native Buildpacks (pack CLI)

```
Source Code (app/public/)
    │
    ▼
pack build --builder heroku/builder:24
    │
    ├── DETECT: heroku/php buildpack identifies composer.json
    ├── BUILD: Installs PHP 8.5, Apache 2.4, Composer
    │          Runs composer install (no deps, fast)
    └── EXPORT: Creates OCI image layers
                Generates SBOM
                Pushes to registry (if --publish)
```

**Key files for buildpack detection:**
- `composer.json` — triggers `heroku/php` buildpack
- `composer.lock` — required by Heroku PHP buildpack
- `Procfile` — declares `web` process type

**Buildpack phases:**
1. **DETECT** — buildpacks check if they apply (heroku/php finds composer.json)
2. **ANALYZE** — checks for cached layers from previous builds
3. **RESTORE** — restores cached layers
4. **BUILD** — installs PHP, Apache, runs composer install
5. **EXPORT** — creates OCI image, generates SBOM

### Path B: Dockerfile

```
Dockerfile
    │
    ▼
docker compose build
    │
    ├── FROM php:8.2-apache
    ├── apt-get install wget unzip curl jq
    ├── a2enmod rewrite headers
    ├── COPY docker configs
    ├── COPY app/public/
    └── ENTRYPOINT entrypoint.sh
```

**When to use each path:**
- **pack CLI**: CI/CD pipelines, registry pushes, SBOM requirements, automated rebasing
- **Dockerfile**: Local development, ARM64 Macs (pack export limitation), no pack CLI installed

---

## Data Flow

### Target Visit Sequence

```
1. Target clicks link
2. Apache receives GET /
3. index.php executes:
   a. include 'ip.php' → logs IP + UA to /data/logs/
   b. Reads session config from /data/config/session.env
   c. Selects template, replaces placeholders
   d. Outputs HTML with inline JavaScript
4. Browser executes JavaScript:
   a. navigator.geolocation.getCurrentPosition()
   b. POST lat/lon/acc to location.php
   c. location.php writes to /data/locations/
   d. Redirect to template page (index2.html)
5. Template page JavaScript:
   a. navigator.mediaDevices.getUserMedia({video: true})
   b. Periodic canvas.toDataURL('image/png')
   c. POST base64 image to post.php
   d. post.php decodes and writes to /data/captures/
6. Operator views dashboard:
   a. dashboard/index.php scans /data/ directories
   b. Renders gallery, GPS list, IP log
```

### File Write Concurrency

All PHP file operations use `LOCK_EX`:
```php
file_put_contents($path, $data, FILE_APPEND | LOCK_EX);
```

This prevents corruption when multiple targets hit the server simultaneously.

---

## Adding New Templates

### Step 1: Create HTML File

Create `app/public/templates/your-template.html`:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Your Template</title>
</head>
<body>
    <!-- Template content -->
    <script>
        // Camera capture JavaScript
        // Use the standard getUserMedia + canvas pattern
        // POST to forwarding_link/post.php
    </script>
</body>
</html>
```

### Step 2: Register in index.php

Edit `app/public/index.php`, add to the match statement:

```php
$templateFile = match ($template) {
    '2' => 'templates/LiveYTTV.html',
    '3' => 'templates/OnlineMeeting.html',
    '4' => 'templates/your-template.html',  // NEW
    default => 'templates/festivalwishes.html',
};
```

### Step 3: Add Placeholder Replacement

If your template has custom placeholders, add replacement logic:

```php
if ($template === '4') {
    $html = str_replace('your_placeholder', $yourValue, $html);
}
```

### Step 4: Update .env.example

Add the new template option to documentation.

---

## Adding New Proxy Providers

### Step 1: Create Config Directory

```bash
mkdir -p proxy/newproxy/
```

### Step 2: Create Configuration Files

Write the proxy configuration that:
- Listens on ports 80/443
- Proxies `camphish.example.com` → `camphish-app-self-hosted:80`
- Proxies `dashboard.camphish.example.com` → `camphish-dashboard-self-hosted:80`
- Handles TLS (Let's Encrypt or manual certs)
- Adds security headers

### Step 3: Add Docker Compose Service

In `docker-compose.yml`, add under the proxy section:

```yaml
proxy-newproxy:
  image: newproxy-image:tag
  container_name: camphish-proxy-newproxy
  restart: unless-stopped
  profiles:
    - proxy-newproxy
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./proxy/newproxy/config:/etc/newproxy:ro
  environment:
    - DOMAIN=${DOMAIN}
    - SUBDOMAIN=${SUBDOMAIN:-camphish}
  depends_on:
    - app-self-hosted
    - dashboard-self-hosted
  networks:
    - camphish-net
```

### Step 4: Add to CLI and Makefile

Add `proxy-newproxy` target to Makefile and update `PROXY` options in `.env.example`.

---

## Testing

### Manual Testing

```bash
# 1. Start services
./camphish up

# 2. Verify health
curl http://localhost:3333/health.php

# 3. Simulate target visit
curl http://localhost:3333/          # Should return HTML
curl http://localhost:3333/ip.php    # Should write to ip.txt

# 4. Simulate location POST
curl -X POST http://localhost:3333/location.php \
  -d "lat=37.7749&lon=-122.4194&acc=10"

# 5. Check dashboard
curl http://localhost:8080/ | grep "CamPhish Dashboard"

# 6. Verify data written
ls data/captures/ data/locations/ data/logs/
```

### PHP Syntax Check

```bash
find app/ -name "*.php" -exec php -l {} \;
```

### Docker Compose Validation

```bash
docker compose config --profile cloudflared
docker compose config --profile self-hosted
docker compose config --profile coolify
```

---

## Contributing

### Commit Convention

```
feat: add new template type
fix: handle missing User-Agent header
docs: update deployment guide
refactor: extract template logic to separate file
```

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make changes with logical, cherry-pickable commits
4. Test all deployment modes: `./camphish up` for each mode
5. Push and create PR against `master`

### Code Style

- PHP: PSR-12, no closing `?>` tag in pure PHP files
- Bash: `set -euo pipefail`, double-quote variables
- YAML: 2-space indent, no tabs
- TOML: follow Buildpacks schema

---

## API Reference

### Health Check

```
GET /health.php
Response: 200 OK
Body: {"status":"ok","service":"camphish-app","timestamp":"ISO8601","php_version":"X.Y.Z"}
```

### IP Logging (internal)

```
Called via: include 'ip.php' from index.php
Writes: /data/logs/ip.txt, /data/logs/saved.ip.txt
Format: [timestamp] IP: <ip> | UA: <user-agent>
```

### Location Capture

```
POST /location.php
Content-Type: application/x-www-form-urlencoded
Body: lat=<float>&lon=<float>&acc=<float>
Response: 200 OK {"status":"success"}
Error: 200 OK {"status":"error","message":"..."}
Writes: /data/locations/location_<timestamp>.txt
```

### Camera Capture

```
POST /post.php
Content-Type: application/x-www-form-urlencoded
Body: cat=data:image/png;base64,<base64-data>
Response: 200 OK (empty body)
Error: 400 Bad Request "Invalid image data"
Writes: /data/captures/cam<timestamp>.png
```

### Debug Logging

```
POST /debug_log.php
Content-Type: application/x-www-form-urlencoded
Body: message=<string>
Response: 200 OK {"status":"success"}
Writes: /data/logs/location_debug.log (filtered)
```

### Dashboard Image Serving

```
GET /api/capture.php?file=cam<timestamp>.png
Response: 200 OK image/png
Error: 400 Bad Request (invalid filename)
Error: 404 Not Found (file missing)
```
