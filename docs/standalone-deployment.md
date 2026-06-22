# CamPhish Standalone Deployment

Deploy CamPhish without any panel, using only Docker Compose + your own
reverse proxy (nginx, Caddy, Traefik, or cloudflared tunnel).

## Quick Start

```bash
# Start the service
docker compose -f docker-compose.standalone.yml up -d

# Check health
curl http://localhost:8080/api/health

# Get the dashboard access code
docker exec camphish-app cat /app/data/.access_code

# Access the dashboard
open "http://localhost:8080/?code=$(docker exec camphish-app cat /app/data/.access_code)"
```

## With Caddy (Automatic HTTPS)

```bash
# Set your domain
export DOMAIN=camphish.example.com
export CAMPHISH_URL=https://camphish.example.com

# Start with Caddy reverse proxy
docker compose \
  -f docker-compose.standalone.yml \
  -f docker-compose.caddy.yml \
  up -d

# Caddy auto-provisions Let's Encrypt certs
# Your instance is now at https://camphish.example.com
```

## With Nginx

```nginx
server {
    listen 80;
    server_name camphish.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name camphish.example.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## With Cloudflare Tunnel (No Open Ports)

```bash
# Start the app
docker compose -f docker-compose.standalone.yml up -d

# Install cloudflared on the host
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/install-and-setup/tunnel-guide/

# Authenticate and create a tunnel
cloudflared tunnel login
cloudflared tunnel create camphish

# Route DNS
cloudflared tunnel route dns camphish camphish.example.com

# Run the tunnel
cloudflared tunnel run --url http://localhost:8080 camphish
```

Or use Docker:

```bash
docker run -d --name camphish-tunnel \
  --network host \
  cloudflare/cloudflared:latest \
  tunnel --url http://localhost:8080
```

## Environment Variables

| Variable | Purpose | Default | Required |
|----------|---------|---------|----------|
| `CAMPHISH_URL` | Public URL used in templates for redirect links | `http://localhost:8080` | No, but recommended |
| `CAMPHISH_ACCESS_SEED` | Deterministic access code | random | No |
| `RUST_LOG` | Log level | `info` | No |

**Note**: `CAMPHISH_URL` is the unified env var. Backward-compatible
`TUNNEL_URL` and `TUNNEL_LINK` also work as fallbacks.

## Data Persistence

Data is stored in the `camphish_data` Docker named volume:

```bash
# Backup the database
docker run --rm -v camphish_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/camphish-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restore
docker run --rm -v camphish_data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/camphish-backup-*.tar.gz -C /data
```

## Updating

```bash
docker compose -f docker-compose.standalone.yml pull
docker compose -f docker-compose.standalone.yml up -d --force-recreate
```

## Multiple Instances

```bash
# Instance 1
export CAMPHISH_URL=https://camphish-1.example.com
export CAMPHISH_ACCESS_SEED=seed-1
docker compose -f docker-compose.standalone.yml -p camphish-1 up -d

# Instance 2 (different port)
export CAMPHISH_URL=https://camphish-2.example.com
export CAMPHISH_ACCESS_SEED=seed-2
docker compose -f docker-compose.standalone.yml -p camphish-2 up -d
```
