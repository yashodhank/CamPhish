# Start CamPhish

Start all CamPhish services (app + TrailBase + tunnel):

```bash
cd ~/Projects/CamPhish && docker compose --profile cloudflared up -d
```

Check status:
```bash
docker compose ps
curl -s http://localhost:8080/api/health
docker compose logs cloudflared | grep trycloudflare
```

URLs:
- Dashboard: http://localhost:8080
- TrailBase: http://localhost:4000/_/admin/
- Game: http://localhost:8080/t/face-runner
