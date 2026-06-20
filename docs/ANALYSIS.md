# CamPhish Technical Analysis

**Audience:** Security Engineers, Architects, Technical Evaluators

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Security Analysis](#security-analysis)
3. [Performance Analysis](#performance-analysis)
4. [Reliability Analysis](#reliability-analysis)
5. [Design Decisions](#design-decisions)
6. [Threat Model](#threat-model)
7. [Comparison: v2.0 vs v3.0](#comparison-v20-vs-v30)
8. [Compliance Considerations](#compliance-considerations)
9. [Future Roadmap](#future-roadmap)

---

## Executive Summary

CamPhish v3.0 is a complete architectural modernization of a social engineering tool. The original v2.0 was a single 520-line bash script that downloaded tunnel binaries at runtime, used PHP's built-in single-threaded server, and had no persistent storage or monitoring capabilities.

v3.0 introduces:
- **Containerized microservices** (3-6 containers depending on deployment mode)
- **Cloud Native Buildpacks** (OCI-compliant image builds, SBOM generation)
- **Multi-mode deployment** (local tunnel, self-hosted VPS, Coolify panel)
- **Web dashboard** (real-time capture viewing, GPS mapping, IP logging)
- **Persistent storage** (bind-mounted volumes surviving container lifecycle)
- **Production-grade web server** (Apache 2.4 replacing PHP built-in server)

### Architecture Metrics

| Metric | v2.0 | v3.0 |
|--------|------|------|
| Lines of code | 520 (bash) | ~2,500 (PHP + bash + YAML + TOML) |
| Deployment modes | 1 (local bash) | 3 (local, self-hosted, Coolify) |
| Tunnel options | 2 (ngrok, cloudflared) | 2 + none (direct domain) |
| Proxy options | 0 | 3 (Caddy, Traefik, Nginx) |
| Build systems | 0 (manual binary download) | 2 (pack buildpacks, Dockerfile) |
| Monitoring | Terminal stdout | Web dashboard + health checks |
| Data persistence | None (lost on cleanup) | Persistent volumes |
| Concurrent targets | 1 (single-threaded PHP) | Multiple (Apache worker threads) |

---

## Security Analysis

### Attack Surface

#### v2.0 Attack Surface
```
┌─────────────────────────────────────────┐
│ Threat: Binary download MITM            │
│ Vector: wget from github.com without   │
│         certificate pinning            │
│ Impact: Malicious ngrok/cloudflared    │
│         binary execution              │
│ Mitigation: None                       │
├─────────────────────────────────────────┤
│ Threat: PHP built-in server exploits   │
│ Vector: Single-threaded, no request    │
│         filtering, no rate limiting    │
│ Impact: DoS via connection exhaustion  │
│ Mitigation: None                       │
├─────────────────────────────────────────┤
│ Threat: Data exfiltration via logs     │
│ Vector: Plaintext IP/GPS/captures in   │
│         working directory             │
│ Impact: Data leakage if directory      │
│         shared or backed up           │
│ Mitigation: Manual cleanup.sh          │
└─────────────────────────────────────────┘
```

#### v3.0 Attack Surface & Mitigations

| Threat | Vector | Impact | Mitigation |
|--------|--------|--------|------------|
| Container escape | Docker daemon exploit | Host access | Run as non-root user, drop capabilities |
| Image supply chain | Malicious base image | Compromised container | Use official images, digest pinning, SBOM verification |
| Tunnel MITM | ngrok/cloudflared compromise | Traffic interception | Cloudflare Tunnel e2e encrypted, ngrok TLS |
| Dashboard access | Unauthenticated web UI | Data exposure | Bind to 127.0.0.1, proxy auth (self-hosted) |
| Data leakage | Volume mounts on shared FS | Unauthorized access | Restrictive file permissions (0755/0644) |
| Input injection | Malformed POST data | File corruption | Input validation, basename() sanitization |
| DoS | Concurrent request flood | Service degradation | Apache MaxRequestWorkers, rate limiting (proxy) |
| Information disclosure | Server headers, error messages | Fingerprinting | Stripped Server header, display_errors=Off |

### Security Headers

All reverse proxies add:

```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Server: (stripped)
```

Traefik additionally adds:
```
X-XSS-Protection: 1; mode=block
```

### Data Protection

| Data Type | Storage | Encryption | Access Control |
|-----------|---------|------------|----------------|
| Camera captures | `./data/captures/` (bind mount) | None at rest | Host filesystem permissions |
| GPS locations | `./data/locations/` (bind mount) | None at rest | Host filesystem permissions |
| IP logs | `./data/logs/` (bind mount) | None at rest | Host filesystem permissions |
| Config/secrets | `.env` (gitignored) | None at rest | Filesystem, excluded from git |
| Ngrok token | Container environment | In-memory only | Not persisted to disk |

**Recommendation for production:** Encrypt `./data/` at rest using LUKS (Linux) or FileVault (macOS).

---

## Performance Analysis

### Web Server Comparison

| Metric | PHP Built-in (v2.0) | Apache 2.4 (v3.0) |
|--------|---------------------|-------------------|
| Concurrency model | Single-threaded, one request at a time | Multi-process (MPM event), 256+ concurrent |
| Max connections | ~10 before queuing | 256 default, configurable |
| Keep-Alive | No | Yes (reduces TCP handshake overhead) |
| Static file serving | PHP handles everything | Apache serves static files directly |
| Gzip compression | No | Yes (via Apache mod_deflate) |
| Request filtering | None | mod_rewrite, mod_headers |

**Performance gain:** Apache handles ~25x more concurrent targets than PHP built-in server.

### Container Resource Usage

| Container | CPU (idle) | RAM (idle) | RAM (under load) | Image Size |
|-----------|------------|------------|-------------------|------------|
| camphish-app | <1% | ~45 MB | ~80 MB | ~150 MB |
| camphish-dashboard | <1% | ~35 MB | ~60 MB | ~140 MB |
| cloudflared | <1% | ~20 MB | ~30 MB | ~25 MB |
| ngrok | <1% | ~25 MB | ~35 MB | ~20 MB |
| proxy-caddy | <1% | ~15 MB | ~25 MB | ~15 MB |
| proxy-traefik | <1% | ~40 MB | ~60 MB | ~50 MB |
| proxy-nginx | <1% | ~10 MB | ~20 MB | ~10 MB |

**Total (local mode):** ~100 MB RAM idle, ~145 MB under load
**Total (self-hosted with Caddy):** ~130 MB RAM idle, ~190 MB under load

### Network Throughput

- **Camera capture POST:** ~50-200 KB per snapshot (base64 PNG)
- **Location POST:** <1 KB per request
- **Template page GET:** ~25-50 KB (HTML + inline JS)
- **Dashboard page GET:** ~5-10 KB (HTML, images served separately)

**Bandwidth per target visit:** ~200-500 KB total (page load + 1-2 snapshots)

---

## Reliability Analysis

### Failure Modes & Recovery

| Failure | Detection | Automatic Recovery | Manual Recovery |
|---------|-----------|-------------------|-----------------|
| App container crash | Docker healthcheck (30s interval) | `restart: unless-stopped` | `./camphish restart` |
| Tunnel disconnect | Link becomes unreachable | Tunnel container restarts | `./camphish restart` |
| Proxy crash | HTTP 502 from proxy | `restart: unless-stopped` | `./camphish restart` |
| Disk full | Write failures in PHP logs | None (graceful degradation) | `./camphish clean`, expand disk |
| Docker daemon crash | All containers stop | Docker daemon restart policy | `sudo systemctl restart docker` |
| DNS propagation delay | Proxy can't get TLS cert | Retry (Let's Encrypt) | Wait 5 min, retry |
| Let's Encrypt rate limit | Cert issuance fails | None | Wait 7 days or use staging |

### Health Check Flow

```
Docker Engine
    │
    ├── Every 30s: curl http://app:80/health.php
    │
    ├── Success (3 consecutive) → Container marked "healthy"
    │   └── Tunnel/Proxy containers (depends_on: app) start
    │
    └── Failure (3 consecutive) → Container marked "unhealthy"
        └── restart: unless-stopped triggers restart
```

### Data Durability

| Scenario | Captures | Locations | Logs | Config |
|----------|----------|-----------|------|--------|
| Container restart | Survives (bind mount) | Survives | Survives | Survives |
| Container rebuild | Survives (bind mount) | Survives | Survives | Survives |
| `docker compose down` | Survives (named volumes) | Survives | Survives | Survives |
| `docker compose down -v` | **DESTROYED** | **DESTROYED** | **DESTROYED** | **DESTROYED** |
| Host reboot | Survives | Survives | Survives | Survives |
| `./camphish clean` | **DESTROYED** | **DESTROYED** | **DESTROYED** | Survives |

---

## Design Decisions

### Why Apache Instead of Nginx for the App?

**Decision:** Apache 2.4 with mod_php
**Rationale:**
- PHP builds include mod_php by default (no PHP-FPM configuration needed)
- `.htaccess` support for per-directory config (useful for template isolation)
- Heroku PHP buildpack defaults to Apache
- Simpler Dockerfile (single process vs nginx + PHP-FPM)

**Trade-off:** Nginx would be ~20% more memory-efficient. For a single-target tool, this difference is negligible.

### Why Bind Mounts Instead of Named Volumes?

**Decision:** Bind mounts (`./data/captures:/data/captures`)
**Rationale:**
- Direct filesystem access (browse captures with Finder/Explorer)
- Easy backup with standard tools (rsync, tar, cp)
- Predictable path (no Docker volume UUIDs)
- Survives Docker daemon resets

**Trade-off:** Named volumes would be more portable across hosts. Bind mounts are host-specific.

### Why Cloud Native Buildpacks?

**Decision:** Support pack CLI as primary build system
**Rationale:**
- No Dockerfile maintenance (buildpack handles PHP/Apache installation)
- Automatic security patches via `pack rebase` (update run image without rebuild)
- SBOM generation for supply chain security
- OCI-compliant images (portable across registries)
- CNCF standard (industry adoption)

**Trade-off:** pack CLI is an additional dependency. Dockerfile remains as fallback.

### Why Three Proxy Options?

**Decision:** Support Caddy, Traefik, and Nginx
**Rationale:**
- **Caddy:** Simplest setup (auto-TLS, single config file). Best for beginners.
- **Traefik:** Docker-native (auto-discovers containers). Best for Coolify/microservices.
- **Nginx:** Most control (custom config, certbot). Best for experienced operators.

**Trade-off:** Maintenance burden of three config sets. Mitigated by simple configs (~20 lines each).

### Why No Authentication on Dashboard?

**Decision:** No built-in auth on dashboard
**Rationale:**
- Dashboard binds to `127.0.0.1` (not network-accessible in local mode)
- Self-hosted mode uses reverse proxy (add auth at proxy level)
- Keeps dashboard simple (no user management, no session tokens)

**For production:** Add HTTP Basic Auth at the proxy level:
```nginx
# Nginx example
location / {
    auth_basic "CamPhish Dashboard";
    auth_basic_user_file /etc/nginx/.htpasswd;
    proxy_pass http://camphish-dashboard-self-hosted:80;
}
```

---

## Threat Model

### Adversary: Target Detecting Surveillance

**Capability:** Tech-savvy target inspects browser behavior
**Detection vectors:**
1. Camera indicator light (hardware, cannot be hidden)
2. Browser permission dialog ("Allow camera?")
3. Network tab in DevTools (POST requests to post.php)
4. Page source inspection (JavaScript camera code)

**Mitigation:**
- Templates designed to justify camera use (meeting, celebration)
- Obfuscated variable names in JS (already implemented)
- HTTPS prevents network inspection by intermediaries

**Residual risk:** Determined target with DevTools open will detect capture. This is inherent to browser-based camera access.

### Adversary: Network Intermediary

**Capability:** ISP, corporate proxy, VPN provider inspecting traffic
**Detection vectors:**
1. HTTPS SNI reveals domain (trycloudflare.com or custom domain)
2. Traffic pattern (periodic POSTs of ~100KB = image uploads)
3. DNS queries for tunnel domain

**Mitigation:**
- Cloudflare Orange Cloud (traffic proxied through CF, origin hidden)
- Custom domain (less suspicious than trycloudflare.com)
- ESNI/ECH (Encrypted Client Hello, future TLS 1.3 extension)

**Residual risk:** Traffic volume analysis can reveal image uploads. Mitigate with randomized intervals.

### Adversary: Platform Operator

**Capability:** Cloudflare, ngrok, VPS provider with access to traffic
**Detection vectors:**
1. Tunnel provider sees all traffic (Cloudflare/ngrok terminate TLS)
2. VPS provider can inspect disk (captures stored unencrypted)

**Mitigation:**
- End-to-end encryption not possible (tunnel must terminate TLS)
- Disk encryption on VPS (LUKS)
- Minimal data retention (clean after each session)

**Residual risk:** Tunnel provider has full traffic visibility. This is inherent to tunnel-based architectures.

---

## Comparison: v2.0 vs v3.0

| Feature | v2.0 (camphish.sh) | v3.0 (Docker + Pack) |
|---------|-------------------|---------------------|
| **Deployment** | | |
| Setup time | 5-10 min (install php, wget, unzip) | 2 min (docker compose up) |
| Platform support | Kali, Termux, macOS, Ubuntu, WSL | Any Docker host (Linux, Mac, Windows) |
| Binary downloads | Every run (ngrok/cloudflared) | Once (Docker image pull) |
| **Reliability** | | |
| Web server | PHP built-in (single-threaded) | Apache 2.4 (multi-process) |
| Process management | Manual (killall in trap) | Docker (restart: unless-stopped) |
| Health monitoring | None | Docker healthcheck + dashboard |
| **Data** | | |
| Storage | Working directory (lost on cleanup) | Persistent volumes (survives restart) |
| Dashboard | None (terminal output only) | Web UI with gallery, GPS, IP log |
| Backup | Manual file copy | Standard backup tools on ./data/ |
| **Security** | | |
| Binary verification | None (wget without checksum) | Official Docker images (digest-pinned) |
| Input validation | Minimal | Full validation on all endpoints |
| Security headers | None | X-Frame-Options, X-Content-Type-Options |
| **Extensibility** | | |
| Deployment modes | 1 (local bash) | 3 (local, self-hosted, Coolify) |
| Proxy options | 0 | 3 (Caddy, Traefik, Nginx) |
| Build systems | 0 | 2 (pack buildpacks, Dockerfile) |
| Cloud integration | None | Cloudflare DNS API |
| **Operations** | | |
| Logging | stdout only | Structured logs in volumes |
| Monitoring | Manual (check files) | Dashboard + health checks |
| Cleanup | Manual script | `./camphish clean` |
| Scaling | 1 session | Multiple sessions (different ports) |

---

## Compliance Considerations

### GDPR (EU)

CamPhish captures personal data (IP addresses, GPS coordinates, biometric data via camera). Under GDPR:
- **Lawful basis required** — penetration testing agreement serves as legal basis
- **Data minimization** — clean data after authorized test
- **Storage limitation** — do not retain captures beyond test duration
- **Security** — encrypt data at rest, restrict access

### PCI DSS

If target device processes payment data:
- Camera captures may inadvertently capture payment screens
- Treat capture storage as cardholder data environment
- Apply PCI DSS controls to `./data/` directory

### HIPAA (US Healthcare)

If target device displays PHI (Protected Health Information):
- Camera captures may capture PHI on screen
- Treat as PHI storage — encryption, access controls, audit logging required

---

## Future Roadmap

### Short-term (v3.1)
- [ ] HTTP Basic Auth on dashboard
- [ ] Template hot-swap without restart
- [ ] Capture auto-refresh via WebSocket/SSE
- [ ] Docker Scout / Trivy vulnerability scanning in CI

### Medium-term (v3.2)
- [ ] Kubernetes Helm chart
- [ ] Multi-target session management (operator panel)
- [ ] Capture watermarking (session ID overlay)
- [ ] Automated Let's Encrypt renewal monitoring

### Long-term (v4.0)
- [ ] WebRTC-based streaming (video instead of snapshots)
- [ ] AI-based template generation (context-aware phishing pages)
- [ ] Distributed deployment (multiple VPS, load-balanced)
- [ ] Blockchain-anchored audit trail for authorized tests
