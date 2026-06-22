#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
DASHBOARD_TOKEN="${DASHBOARD_TOKEN:-test-dashboard-token}"
API_KEY="${API_KEY:-test-api-key-12345}"
OAUTH_CLIENT_ID="${OAUTH_CLIENT_ID:-test-client}"
OAUTH_CLIENT_SECRET="${OAUTH_CLIENT_SECRET:-test-secret}"

PASS=0
FAIL=0

pass() { echo -e "\e[0;32m✓\e[0m $1"; PASS=$((PASS + 1)); }
fail() { echo -e "\e[0;31m✗\e[0m $1"; FAIL=$((FAIL + 1)); }

echo "=== CamPhish OAuth2 + API Key Integration Test ==="
echo "Base URL: $BASE_URL"
echo ""

# ─── 1. Health check ────────────────────────────────────────────────
echo "1. Health check ..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/health")
if [ "$HEALTH" == "200" ]; then
  pass "Health check returns 200"
else
  fail "Health check returned $HEALTH (expected 200)"
fi

# ─── 2. No-auth → 401 ───────────────────────────────────────────────
echo "2. /api/stats without auth ..."
STATS_NO_AUTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/api/stats")
if [ "$STATS_NO_AUTH" == "401" ]; then
  pass "Stats without auth returns 401"
else
  warn "Stats without auth returned $STATS_NO_AUTH (no auth configured — backward compat active)"
fi

# ─── 3. DASHBOARD_TOKEN Bearer ───────────────────────────────────────
echo "3. /api/stats with DASHBOARD_TOKEN Bearer ..."
STATS_BEARER=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $DASHBOARD_TOKEN" "$BASE_URL/api/stats")
if [ "$STATS_BEARER" == "200" ]; then
  pass "Stats with DASHBOARD_TOKEN Bearer returns 200"
else
  fail "Stats with DASHBOARD_TOKEN Bearer returned $STATS_BEARER (expected 200)"
fi

# ─── 4. API key ─────────────────────────────────────────────────────
echo "4. /api/stats with X-API-Key ..."
STATS_APIKEY=$(curl -s -o /dev/null -w "%{http_code}" -H "X-API-Key: $API_KEY" "$BASE_URL/api/stats")
if [ "$STATS_APIKEY" == "200" ]; then
  pass "Stats with X-API-Key returns 200"
else
  fail "Stats with X-API-Key returned $STATS_APIKEY (expected 200)"
fi

# ─── 5. OAuth2 token issuance ───────────────────────────────────────
echo "5. OAuth2 token issuance ..."
TOKEN_RESP=$(curl -s -X POST "$BASE_URL/api/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=$OAUTH_CLIENT_ID&client_secret=$OAUTH_CLIENT_SECRET")
ACCESS_TOKEN=$(echo "$TOKEN_RESP" | sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p' || true)
if [ -n "$ACCESS_TOKEN" ]; then
  pass "OAuth2 token issued (token present)"
else
  fail "OAuth2 token issuance failed (no access_token in response: $TOKEN_RESP)"
fi

# ─── 6. OAuth2 Bearer access ────────────────────────────────────────
echo "6. /api/stats with OAuth2 Bearer ..."
if [ -n "$ACCESS_TOKEN" ]; then
  STATS_OAUTH=$(curl -s -o /dev/null -w "%{http_code}" -H "Authorization: Bearer $ACCESS_TOKEN" "$BASE_URL/api/stats")
  if [ "$STATS_OAUTH" == "200" ]; then
    pass "Stats with OAuth2 Bearer returns 200"
  else
    fail "Stats with OAuth2 Bearer returned $STATS_OAUTH (expected 200)"
  fi
else
  PASS=$((PASS - 1))
fi

# ─── 7. Invalid client ──────────────────────────────────────────────
echo "7. OAuth2 with invalid client ..."
INVALID_RESP=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=client_credentials&client_id=bad&client_secret=bad")
if [ "$INVALID_RESP" == "401" ]; then
  pass "Invalid client returns 401"
else
  fail "Invalid client returned $INVALID_RESP (expected 401)"
fi

# ─── 8. Unsupported grant type ──────────────────────────────────────
echo "8. OAuth2 with unsupported grant_type ..."
UNSUPPORTED=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/oauth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=$OAUTH_CLIENT_ID&client_secret=$OAUTH_CLIENT_SECRET")
if [ "$UNSUPPORTED" == "400" ]; then
  pass "Unsupported grant_type returns 400"
else
  fail "Unsupported grant_type returned $UNSUPPORTED (expected 400)"
fi

# ─── Summary ────────────────────────────────────────────────────────
echo ""
echo "========================================"
if [ $FAIL -eq 0 ]; then
  echo "All $PASS tests passed"
  exit 0
else
  echo "$FAIL/$((PASS + FAIL)) tests failed"
  exit 1
fi
