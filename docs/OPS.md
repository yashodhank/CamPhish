# CamPhish Operations Manual

**Audience:** DevOps Engineers, SREs, System Administrators

> ⚠️ **This document describes the legacy v3 PHP-based architecture (Apache + PHP + Heroku).**
> The current version (v2.1) runs on Rust (axum) in Docker (Alpine 3.20) with SQLite + optional TrailBase.
> For current ops procedures, see the [Architecture Guide](./ARCHITECTURE.md) or the `docker-compose.yml`.

---

## Table of Contents

1. [Architecture](#architecture)
2. [Deployment Procedures](#deployment-procedures)
3. [Configuration Reference](#configuration-reference)
4. [Monitoring & Health Checks](#monitoring--health-checks)
5. [Logging](#logging)
6. [Backup & Recovery](#backup--recovery)
7. [Scaling Considerations](#scaling-considerations)
8. [Troubleshooting](#troubleshooting)
9. [Security Hardening](#security-hardening)
10. [Maintenance](#maintenance)

---

## Architecture

### Container Topology

```
┌─────────────────────────────────────────────────────────┐
│                    Docker Host                           │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Tunnel   │  │  Proxy   │  │     Dashboard        │  │
│  │ ngrok or  │  │ Caddy /  │  │  PHP 8.2 + Apache   │  │
│  │cloudflared│  │Traefik / │  │     Port 80          │  │
│  │           │  │  Nginx   │  └──────────┬───────────┘  │
│  └─────┬─────┘  └────┬─────┘             │              │
│        │              │                   │              │
│        └──────────────┼───────────────────┘              │
│                        │                                  │
│               ┌────────┴────────┐                        │
│               │   CamPhish App  │                        │
│               │ PHP 8.2+Apache │                        │
│               │    Port 80     │                        │
│               └────────┬───────┘                        │
│                        │                                  │
│         ┌──────────────┼──────────────┐                 │
│         │              │              │                 │
│    ┌────┴────┐   ┌─────┴─────┐  ┌────┴────┐           │
│    │Captures │   │ Locations │  │  Logs   │           │
│    │  Volume │   │  Volume   │  │ Volume  │           │
│    └─────────┘   └───────────┘  └─────────┘           │
└─────────────────────────────────────────────────────────┘
```

### Network Architecture

All containers are connected via a single Docker bridge network (`camphish-net`). The app container is the central hub — tunnel and proxy containers route traffic to it. The dashboard container reads from shared volumes but has no write access to captures/locations.

### Volume Strategy

| Volume | Mount Type | App Access | Dashboard Access | Persistence |
|--------|-----------|------------|------------------|-------------|
| `captures` | Bind mount (`./data/captures`) | Read/Write | Read-only | Survives container restart |
| `locations` | Bind mount (`./data/locations`) | Read/Write | Read-only | Survives container restart |
| `logs` | Bind mount (`./data/logs`) | Read/Write | Read/Write | Survives container restart |
| `config` | Bind mount (`./data/config`) | Read/Write | Read-only | Survives container restart |

---

## Deployment Procedures

### Local Mode (Development/Testing)

```bash
# 1. Configure
cp .env.example .env
# Set TUNNEL=cloudflared or TUNNEL=ngrok
# If ngrok: set NGROK_AUTHTOKEN=<your-token>

# 2. Build (choose one)
docker compose build                    # Dockerfile build
./camphish build                        # pack buildpacks build

# 3. Deploy
./camphish up                           # Uses TUNNEL from .env

# 4. Get link
./camphish link

# 5. Monitor
./camphish logs -f                      # Tail all logs
open http://localhost:8080              # Dashboard
```

### Self-Hosted Mode (VPS Production)

```bash
# 1. Configure .env
DEPLOY_MODE=self-hosted
DOMAIN=example.com
SUBDOMAIN=camphish                    # Results in camphish.example.com
PROXY=caddy                           # or traefik, nginx
LETSENCRYPT_EMAIL=admin@example.com

# Optional Cloudflare DNS automation:
CF_API_TOKEN=<token>
CF_ZONE_ID=<zone-id>
CF_ORANGE_CLOUD=true                  # or false

# 2. Set up DNS (automatic if Cloudflare configured)
make cf-dns

# 3. Deploy
./camphish up

# 4. Verify
curl -I https://camphish.example.com
curl -I https://dashboard.camphish.example.com
```

**VPS Requirements:**
- Ports 80 and 443 open in firewall
- Docker 24+ installed
- Public IP address
- Domain with A record pointing to VPS IP (or Cloudflare API token)

### Coolify Mode

```bash
# 1. Configure .env
DEPLOY_MODE=coolify
DOMAIN=example.com
SUBDOMAIN=camphish

# 2. Deploy
./camphish up

# 3. In Coolify dashboard:
#    - Add new service from existing docker-compose
#    - Set FQDN to camphish.example.com
#    - Enable TLS
```

---

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DEPLOY_MODE` | Yes | `local` | `local`, `self-hosted`, `coolify` |
| `TUNNEL` | Local only | `cloudflared` | `ngrok`, `cloudflared`, `none` |
| `NGROK_AUTHTOKEN` | If TUNNEL=ngrok | — | From ngrok dashboard |
| `BUILDER` | No | `heroku/builder:24` | Buildpack builder image |
| `IMAGE_NAME` | No | `camphish-app` | OCI image name |
| `IMAGE_REGISTRY` | No | — | e.g. `ghcr.io/myuser` |
| `DASHBOARD_PORT` | No | `8080` | Host port for dashboard |
| `SESSION_NAME` | No | `default` | Organizes captures |
| `AUTO_CLEANUP` | No | `false` | Remove temp files on stop |
| `DEFAULT_TEMPLATE` | No | `1` | 1=Festival, 2=YouTube, 3=Meeting |
| `FESTIVAL_NAME` | No | `NewYear` | If template=1 |
| `YOUTUBE_VIDEO_ID` | No | `dQw4w9WgXcQ` | If template=2 |
| `DATA_DIR` | No | `./data` | Persistent data path |
| `DOMAIN` | Self-hosted | — | e.g. `example.com` |
| `SUBDOMAIN` | Self-hosted | `camphish` | Subdomain prefix |
| `PROXY` | Self-hosted | `caddy` | `caddy`, `traefik`, `nginx` |
| `LETSENCRYPT_EMAIL` | Self-hosted | — | For TLS certificate |
| `CF_API_TOKEN` | Cloudflare DNS | — | Zone:DNS:Edit permission |
| `CF_ZONE_ID` | Cloudflare DNS | — | From Cloudflare dashboard |
| `CF_ORANGE_CLOUD` | Cloudflare DNS | `false` | `true` = proxied, `false` = DNS-only |

### Docker Compose Profiles

| Profile | Services Started |
|---------|-----------------|
| (none) | `app`, `dashboard` |
| `ngrok` | `app`, `dashboard`, `ngrok` |
| `cloudflared` | `app`, `dashboard`, `cloudflared` |
| `self-hosted` | `app-self-hosted`, `dashboard-self-hosted` |
| `proxy-caddy` | `proxy-caddy` |
| `proxy-traefik` | `proxy-traefik` |
| `proxy-nginx` | `proxy-nginx`, `certbot` |
| `coolify` | `app-coolify`, `dashboard-coolify` |

---

## Monitoring & Health Checks

### Built-in Health Checks

The `app` container has a Docker healthcheck:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:80/health.php"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

The `/health.php` endpoint returns:
```json
{"status":"ok","service":"camphish-app","timestamp":"2026-06-20T05:46:12+00:00","php_version":"8.2.31"}
```

### Manual Health Verification

```bash
# Check container status
docker compose ps

# Check app health
curl http://localhost:3333/health.php

# Check dashboard
curl -I http://localhost:8080/

# Check tunnel
./camphish link

# Check proxy (self-hosted)
curl -I https://camphish.example.com
```

### Monitoring Recommendations

For production deployments, add:
- **Uptime monitoring**: Uptime Kuma, Better Uptime, or Pingdom on the phishing URL
- **Log aggregation**: Ship container logs to Loki, ELK, or Datadog
- **Disk monitoring**: Watch `./data/captures/` size — PNG files accumulate
- **Alert on**: Container restart loops, disk >80%, tunnel link failure

---

## Logging

### Log Locations

| Log | Path | Content |
|-----|------|---------|
| Apache access | `data/logs/apache_access.log` | HTTP requests |
| Apache error | `data/logs/apache_error.log` | Server errors |
| PHP error | `data/logs/php_error.log` | PHP runtime errors |
| IP captures | `data/logs/ip.txt`, `saved.ip.txt` | Target IPs + User-Agents |
| Location debug | `data/logs/location_debug.log` | Geolocation events |
| Session markers | `data/logs/Log.log`, `LocationLog.log` | Capture events |
| Tunnel logs | Container stdout | ngrok/cloudflared output |
| Proxy logs | Container stdout | Caddy/Traefik/Nginx access |

### Viewing Logs

```bash
# All containers
./camphish logs

# Specific service
docker compose logs app
docker compose logs cloudflared
docker compose logs proxy-caddy

# With tail and follow
docker compose logs -f --tail=200 app

# Last N lines
LOG_TAIL=500 ./camphish logs
```

### Log Rotation

Bind-mounted log files grow indefinitely. Implement rotation:

```bash
# Manual cleanup
./camphish clean     # Removes all data

# Cron-based rotation (add to crontab)
0 3 * * * find /path/to/CamPhish/data/logs -name "*.log" -mtime +7 -delete
```

---

## Backup & Recovery

### What to Back Up

| Data | Priority | Method |
|------|----------|--------|
| `data/captures/` | High | `rsync` or `tar` |
| `data/locations/` | High | `rsync` or `tar` |
| `data/logs/saved.ip.txt` | Medium | `rsync` |
| `.env` | Critical | Git (excluded by default), secret manager |
| `data/config/` | Low | Regenerates on restart |

### Backup Script

```bash
#!/bin/bash
BACKUP_DIR="/backups/camphish/$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
cp -r data/captures "$BACKUP_DIR/"
cp -r data/locations "$BACKUP_DIR/"
cp data/logs/saved.ip.txt "$BACKUP_DIR/"
tar -czf "$BACKUP_DIR.tar.gz" "$BACKUP_DIR"
rm -rf "$BACKUP_DIR"
echo "Backup: $BACKUP_DIR.tar.gz"
```

### Recovery

```bash
# Restore captures and locations
tar -xzf backup.tar.gz -C /path/to/CamPhish/data/

# Restart services
./camphish restart
```

---

## Scaling Considerations

CamPhish is designed for **single-target sessions**. For multiple concurrent targets:

1. **Horizontal scaling not recommended** — each session needs its own tunnel URL
2. **Run multiple instances** on different ports with different session names:
   ```bash
   SESSION_NAME=target1 DASHBOARD_PORT=8081 ./camphish up
   SESSION_NAME=target2 DASHBOARD_PORT=8082 ./camphish up
   ```
3. **Resource limits**: Each instance uses ~100MB RAM. A 4GB VPS can run ~30 concurrent sessions.

---

## Troubleshooting

### Tunnel Link Not Generating

**Cloudflared:**
```bash
# Check logs
docker compose logs cloudflared

# Common causes:
# - Cloudflare Tunnel service down (rare)
# - Internet connectivity issue
# - cloudflared already running (killall cloudflared)
```

**Ngrok:**
```bash
# Check ngrok API
curl http://localhost:4040/api/tunnels

# Common causes:
# - Invalid/expired authtoken
# - Ngrok already running
# - Free tier limit reached
```

### Dashboard Not Loading

```bash
# Check container status
docker compose ps dashboard

# Check logs
docker compose logs dashboard

# Common causes:
# - Port conflict (change DASHBOARD_PORT)
# - Volume mount permission issue
# - Apache config error
```

### Proxy Not Serving (Self-Hosted)

```bash
# Check proxy logs
docker compose logs proxy-caddy

# Verify DNS resolution
dig camphish.example.com

# Check port accessibility
nc -zv your-vps-ip 443

# Common causes:
# - DNS not propagated (wait 5 min)
# - Firewall blocking 80/443
# - Let's Encrypt rate limit (5 certs/week per domain)
# - Caddyfile syntax error
```

### Container Won't Start

```bash
# Check all logs
docker compose logs

# Check Docker daemon
docker info

# Common causes:
# - Port already in use
# - Volume path doesn't exist
# - Disk full
# - Docker daemon not running
```

---

## Security Hardening

### Network

- All services bind to `127.0.0.1` by default (not `0.0.0.0`)
- Dashboard and app ports are not exposed to the network
- Only the proxy/tunnel containers accept external traffic
- Bridge network isolates containers from host network

### Application

- `X-Frame-Options: SAMEORIGIN` on all proxy responses
- `X-Content-Type-Options: nosniff` on all proxy responses
- `Server` header stripped from responses
- PHP `display_errors = Off` in production
- File operations use `LOCK_EX` for concurrent safety
- Input validation on all POST endpoints

### Infrastructure

- `.env` excluded from git (contains tokens)
- Bind mounts restrict dashboard to read-only on captures/locations
- Health checks prevent tunnel/proxy from starting before app is ready
- `restart: unless-stopped` on all containers

### Additional Hardening (Production)

```bash
# Run as non-root user inside container
# Add to Dockerfile:
# USER www-data

# Enable Docker content trust
export DOCKER_CONTENT_TRUST=1

# Use read-only root filesystem
# Add to docker-compose.yml:
# read_only: true

# Limit container capabilities
# Add to docker-compose.yml:
# cap_drop:
#   - ALL
# cap_add:
#   - NET_BIND_SERVICE
```

---

## Maintenance

### Daily
- Check dashboard for new captures
- Verify tunnel link is still active
- Monitor disk usage: `du -sh data/`

### Weekly
- Rotate logs older than 7 days
- Archive captures to long-term storage
- Check for Docker image updates: `docker compose pull`

### Monthly
- Review and rotate ngrok authtoken if used
- Test recovery from backup
- Update pack builder: `pack config default-builder heroku/builder:24`
- Rebase images: `./camphish rebase`

### Upgrade Procedure

```bash
# 1. Pull latest code
git pull origin master

# 2. Rebuild images
docker compose build --no-cache
# or
./camphish build-all

# 3. Restart services
./camphish restart

# 4. Verify
./camphish status
./camphish link
```
