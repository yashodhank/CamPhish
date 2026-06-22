# CamPhish on Coolify v4+

Deploy CamPhish on Coolify v4+ using the provided `docker-compose.coolify.yml`.

## Prerequisites

- Coolify v4.0.0-beta.411+ instance
- Wildcard domain configured in Coolify (or per-resource domain)
- GitHub repository connected to Coolify

## Quick Deploy

1. In Coolify dashboard, create a new **Resource → Docker Compose**
2. Select your CamPhish GitHub repo
3. Set **Build Pack** to `Docker Compose`
4. Set **Compose File** to `docker-compose.coolify.yml`
5. Under **Domains**, add your domain and point to port `8080`
6. Click **Deploy**

That's it. Coolify auto-injects magic envs — CamPhish uses them automatically.

## How Coolify Magic Envs Work

The compose file declares these magic envs so Coolify generates them:

| Env Var | Coolify Source | What CamPhish Does |
|---------|---------------|-------------------|
| `SERVICE_URL_CAMPHISH` | Auto-generated from domain | Full URL (`https://camphish.example.com`) — used for template redirect links |
| `SERVICE_FQDN_CAMPHISH_8080` | Auto-generated from domain | Hostname only — backend prepends `https://` as fallback |
| `SERVICE_PASSWORD_CAMPHISH_ACCESS` | Auto-generated UUID | Dashboard access code (takes **highest priority**) |
| `SERVICE_SECRET_CAMPHISH` | Auto-generated UUID | Fallback if password env not set |

### URL Resolution (Backend)

The backend resolves the public URL in this priority:

```
1. SERVICE_URL_CAMPHISH        (full URL from Coolify)
2. SERVICE_FQDN_CAMPHISH_8080  (hostname → https:// prepended)
3. CAMPHISH_URL                 (manual override if set)
4. TUNNEL_URL / TUNNEL_LINK    (legacy env vars)
5. Request Host header          (fallback)
```

### Access Code Resolution (Backend)

```
1. SERVICE_PASSWORD_CAMPHISH_ACCESS  (Coolify magic password)
2. SERVICE_SECRET_CAMPHISH           (Coolify magic secret)
3. CAMPHISH_ACCESS_SEED              (deterministic UUID v5 seed)
4. .access_code file                 (persisted from previous run)
5. Random UUID v4                    (first-time fresh install)
```

## Retrieving the Dashboard Access Code

```bash
docker exec camphish-app cat /app/data/.access_code
```

Or check startup logs: `docker compose logs camphish-app | grep "access code"`

## Customizing

Most deployments work without any manual env vars. Customize only if needed:

| Variable | Purpose | Default |
|----------|---------|---------|
| `CAMPHISH_ACCESS_SEED` | Deterministic access code seed | random/Coolify magic |
| `CAMPHISH_URL` | Override auto-detected public URL | auto-detected |
| `RUST_LOG` | Log level | `info` |
| `COOKIE_SECURE` | Set `false` for HTTP-only dev | `true` |

## TrailBase (Optional)

Uncomment the `trailbase` service block in `docker-compose.coolify.yml`, then
declare `SERVICE_PASSWORD_TRAILBASE_ADMIN` in the environment section so
Coolify generates a password for it.

## Ports

- CamPhish listens on **`0.0.0.0:8080`** (internal container port)
- Coolify's proxy (Traefik/Caddy) auto-routes your domain to this port
- **Do not bind to host ports** — Coolify handles external access

## Volumes

`camphish_data` named volume persists:
- SQLite database (`camphish.db`)
- Captured images (`captures/`)
- `.access_code` file

## Updating

1. Push new commits to your repo
2. In Coolify, click **Deploy** on the resource
3. Coolify pulls, rebuilds, and restarts

For version pinning: use a specific semver tag
(e.g. `ghcr.io/yashodhank/camphish:v2.1.0`) instead of `latest`.
