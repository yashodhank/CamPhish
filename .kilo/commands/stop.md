# Stop CamPhish

Stop all services (DO NOT use -v flag — it deletes data):

```bash
cd ~/Projects/CamPhish && docker compose --profile cloudflared down
```

NEVER run: `docker compose down -v` (destroys DB + captures)
