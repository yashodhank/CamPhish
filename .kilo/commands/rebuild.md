# Rebuild CamPhish After Code Changes

```bash
cd ~/Projects/CamPhish
docker compose build app
docker compose --profile cloudflared up -d --force-recreate app
```

Verify:
```bash
curl -s http://localhost:8080/api/health
curl -s http://localhost:8080/api/templates | python3 -m json.tool
```
