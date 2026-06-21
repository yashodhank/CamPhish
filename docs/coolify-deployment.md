# CamPhish on Coolify v4+

Deploy CamPhish on Coolify v4+ using the provided `docker-compose.coolify.yml`.

## Prerequisites

- Coolify v4.0.0-beta.411+ instance
- Wildcard domain configured in Coolify (or per-resource domain)
- GitHub repository connected to Coolify

## Quick Deploy

### Option A: Docker Compose from Git (Recommended)

1. In Coolify dashboard, create a new **Resource → Docker Compose**
2. Select your CamPhish GitHub repo
3. Set **Build Pack** to `Docker Compose`
4. Set **Compose File** to `docker-compose.coolify.yml`
5. Under **Environment Variables**, add:

   | Variable | Description | Required |
   |----------|-------------|----------|
   | `CAMPHISH_ACCESS_SEED` | Deterministic access code for dashboard | No (auto-generated) |
   | `RUST_LOG` | Log level (default: `info`) | No |

6. Under **Domains**, add your domain and point to port `8080` or use the auto-generated FQDN
7. Click **Deploy**

### Option B: Raw Compose

1. Copy the contents of `docker-compose.coolify.yml`
2. Create a new **Resource → Docker Compose** resource
3. Paste the compose content into the editor
4. Configure environment variables and domains as above
5. Deploy

## Environment Variables

### Coolify Magic Variables (auto-injected)

These are handled automatically by Coolify — **do not set them manually**:

| Variable | Purpose |
|----------|---------|
| `SERVICE_FQDN_CAMPHISH_8080` | Auto-generated domain, routes to port 8080 |
| `SERVICE_PASSWORD_CAMPHISH_ACCESS` | Auto-generated dashboard access code |

The access code is written to `/app/data/.access_code` inside the container.
To retrieve it: `docker exec camphish-app cat /app/data/.access_code`

### User-Supplied Variables

Set these in the Coolify dashboard Environment Variables tab:

| Variable | Purpose | Default |
|----------|---------|---------|
| `CAMPHISH_ACCESS_SEED` | Deterministic seed for access code (persists across restarts) | random |
| `RUST_LOG` | Log level: `info`, `debug`, `trace`, `warn`, `error` | `info` |
| `LOG_LEVEL` | Alias for `RUST_LOG` | `info` |

### TrailBase (Optional)

To enable TrailBase, uncomment the `trailbase` service and the `trailbase_data` volume
in `docker-compose.coolify.yml`, then add these environment variables:

| Variable | Purpose | Default |
|----------|---------|---------|
| `TRAILBASE_URL` | URL of TrailBase instance | `http://trailbase:4000` |
| `TRAILBASE_API_KEY` | API key for TrailBase admin | `changeme` |
| `TRAILBASE_ADMIN_EMAIL` | Admin email | `admin@camphish.local` |

## Ports

- CamPhish listens on **`0.0.0.0:8080`** (internal)
- Coolify's proxy (Traefik/Caddy) auto-routes your domain to this port
- **Do not bind to host ports** — Coolify handles external access

## Volumes

`camphish_data` named volume persists:
- SQLite database (`camphish.db`)
- Captured data (`captures/`, `locations/`)
- `.access_code` file

## Health Check

The Dockerfile includes a `HEALTHCHECK` instruction. Coolify automatically
monitors container health. The health endpoint is `GET /api/health`.

## Updating

1. Push new commits to your repo
2. In Coolify, click **Deploy** on the resource
3. Coolify pulls the latest code, rebuilds, and restarts

For manual version bumps: trigger the **Release** workflow on GitHub, then
update `docker-compose.coolify.yml` to reference the new tag.
