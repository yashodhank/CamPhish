#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:8080}"
PASS=0
FAIL=0

pass() { echo "✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "✗ $1"; FAIL=$((FAIL + 1)); }

echo "=== Template Verification (curl + static analysis) ==="
echo "Base URL: $BASE_URL"
echo ""

# ─── 1. recon.js serves with correct MIME type ──────────────────────
echo "1. /t/recon.js loads ..."
RECON=$(curl -s -o /dev/null -w "%{http_code} %{content_type}" "$BASE_URL/t/recon.js")
if echo "$RECON" | grep -q "200"; then
  pass "recon.js serves (200)"
else
  fail "recon.js returned $RECON (expected 200)"
fi
if echo "$RECON" | grep -qi "javascript"; then
  pass "recon.js Content-Type is JavaScript"
else
  warn "recon.js Content-Type: $RECON (expected application/javascript)"
fi

# ─── 2-4. Templates serve (game, social, gender categories) ────────
templates=("face-runner" "gmail" "festival")
categories=("Game (face-runner)" "Social login (Gmail)" "Festival")

for i in "${!templates[@]}"; do
  id="${templates[$i]}"
  name="${categories[$i]}"
  echo "$((2+i)). Template /t/$id ($name) ..."
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/t/$id")
  if [ "$STATUS" == "200" ]; then
    pass "$name template serves (200)"
  else
    fail "$name template returned $STATUS (expected 200)"
  fi
  
  # Check for known syntax issues
  BODY=$(curl -s "$BASE_URL/t/$id")
  if echo "$BODY" | grep -q '});\s*<'; then
    warn "$name: possible stray \`});\` before tag — inspect"
  fi
  if echo "$BODY" | grep -c 'function captureCreds' | grep -qv '^0$'; then
    pass "$name has a captureCreds function"
  fi
  if echo "$BODY" | grep -q 'captureCreds()\s*)'; then
    fail "$name has extra \`)\` after captureCreds() call — syntax error"
  fi
  if echo "$BODY" | grep 'forwarding_link' | head -1 | grep -q 'http'; then
    pass "$name forwarding_link appears to be a placeholder (will be replaced at serve time)"
  fi
  
  # Count recon.js references
  REF_COUNT=$(echo "$BODY" | grep -c 'recon\.js' || true)
  if [ "$REF_COUNT" -ge 1 ]; then
    pass "$name includes recon.js ($REF_COUNT reference(s))"
  else
    fail "$name missing recon.js reference"
  fi
done

# ─── Known issues static check ─────────────────────────────────────
echo ""
echo "5. Static analysis for known JS issues ..."

# Check meeting.html for stray });
MEETING=$(curl -s "$BASE_URL/t/meeting")
LAST_LINE=$(echo "$MEETING" | tail -1 | tr -d '[:space:]')
if echo "$LAST_LINE" | grep -q '^});$'; then
  fail "meeting.html ends with dangling \`});\` — known bug"
else
  pass "meeting.html does not end with dangling \`});\`"
fi

# Check for duplicate inline fetch in instagram
INSTA=$(curl -s "$BASE_URL/t/instagram")
FETCH_COUNT=$(echo "$INSTA" | grep -c 'fetch(' || true)
if [ "$FETCH_COUNT" -le 2 ]; then
  pass "instagram.html has reasonable fetch count ($FETCH_COUNT)"
else
  warn "instagram.html has $FETCH_COUNT fetch calls — check for duplicates"
fi

# ─── Summary ────────────────────────────────────────────────────────
echo ""
echo "========================================"
if [ $FAIL -eq 0 ]; then
  echo "All $PASS checks passed"
  exit 0
else
  echo "$FAIL/$((PASS + FAIL)) checks failed"
  exit 1
fi
