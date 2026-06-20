#!/usr/bin/env bash
set -euo pipefail

CF_API_TOKEN="${1:?Missing CF_API_TOKEN}"
CF_ZONE_ID="${2:?Missing CF_ZONE_ID}"
FQDN="${3:?Missing FQDN}"
ORANGE_CLOUD="${4:-false}"

CF_API="https://api.cloudflare.com/client/v4"

get_record() {
    curl -s -X GET "${CF_API}/zones/${CF_ZONE_ID}/dns_records?type=A&name=${FQDN}" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json"
}

get_public_ip() {
    curl -s https://api.ipify.org || curl -s https://ifconfig.me || curl -s https://icanhazip.com
}

create_record() {
    local ip="${1}"
    local proxied="false"
    [ "$ORANGE_CLOUD" = "true" ] && proxied="true"

    echo "Creating A record: ${FQDN} -> ${ip} (proxied: ${proxied})"

    local response=$(curl -s -X POST "${CF_API}/zones/${CF_ZONE_ID}/dns_records" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"A\",
            \"name\": \"${FQDN}\",
            \"content\": \"${ip}\",
            \"ttl\": 1,
            \"proxied\": ${proxied}
        }")

    local success=$(echo "$response" | jq -r '.success // false')
    if [ "$success" != "true" ]; then
        echo "ERROR: Failed to create DNS record"
        echo "$response" | jq '.errors'
        exit 1
    fi
    echo "DNS record created successfully"
}

update_record() {
    local record_id="${1}"
    local ip="${2}"
    local proxied="false"
    [ "$ORANGE_CLOUD" = "true" ] && proxied="true"

    echo "Updating A record ${record_id}: ${FQDN} -> ${ip} (proxied: ${proxied})"

    local response=$(curl -s -X PUT "${CF_API}/zones/${CF_ZONE_ID}/dns_records/${record_id}" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"A\",
            \"name\": \"${FQDN}\",
            \"content\": \"${ip}\",
            \"ttl\": 1,
            \"proxied\": ${proxied}
        }")

    local success=$(echo "$response" | jq -r '.success // false')
    if [ "$success" != "true" ]; then
        echo "ERROR: Failed to update DNS record"
        echo "$response" | jq '.errors'
        exit 1
    fi
    echo "DNS record updated successfully"
}

delete_record() {
    local record_id="${1}"
    echo "Deleting DNS record ${record_id} for ${FQDN}"

    local response=$(curl -s -X DELETE "${CF_API}/zones/${CF_ZONE_ID}/dns_records/${record_id}" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json")

    local success=$(echo "$response" | jq -r '.success // false')
    if [ "$success" != "true" ]; then
        echo "WARNING: Failed to delete DNS record"
        echo "$response" | jq '.errors'
    else
        echo "DNS record deleted"
    fi
}

echo "=== Cloudflare DNS Setup ==="
echo "FQDN: ${FQDN}"
echo "Orange Cloud: ${ORANGE_CLOUD}"

existing=$(get_record)
existing_id=$(echo "$existing" | jq -r '.result[0].id // empty')
existing_ip=$(echo "$existing" | jq -r '.result[0].content // empty')

public_ip=$(get_public_ip)
echo "Public IP: ${public_ip}"

if [ -n "$existing_id" ]; then
    if [ "$existing_ip" = "$public_ip" ]; then
        echo "DNS record already exists with correct IP. No changes needed."
    else
        echo "DNS record exists but IP differs (existing: ${existing_ip})"
        update_record "$existing_id" "$public_ip"
    fi
else
    echo "No existing DNS record found"
    create_record "$public_ip"
fi

echo ""
echo "=== Dashboard Subdomain ==="
dashboard_fqdn="dashboard.${FQDN}"
dashboard_existing=$(curl -s -X GET "${CF_API}/zones/${CF_ZONE_ID}/dns_records?type=A&name=${dashboard_fqdn}" \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json")
dashboard_id=$(echo "$dashboard_existing" | jq -r '.result[0].id // empty')

if [ -n "$dashboard_id" ]; then
    echo "Dashboard DNS record already exists: ${dashboard_fqdn}"
else
    echo "Creating dashboard DNS record: ${dashboard_fqdn}"
    create_record_for_dashboard "$public_ip" "$dashboard_fqdn"
fi

create_record_for_dashboard() {
    local ip="${1}"
    local fqdn="${2}"
    local proxied="false"
    [ "$ORANGE_CLOUD" = "true" ] && proxied="true"

    curl -s -X POST "${CF_API}/zones/${CF_ZONE_ID}/dns_records" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "{
            \"type\": \"A\",
            \"name\": \"${fqdn}\",
            \"content\": \"${ip}\",
            \"ttl\": 1,
            \"proxied\": ${proxied}
        }" > /dev/null
    echo "Dashboard DNS record created"
}

echo ""
echo "=== DNS Setup Complete ==="
echo "Main:     https://${FQDN}"
echo "Dashboard: https://dashboard.${FQDN}"
echo ""
echo "Note: DNS propagation may take up to 5 minutes."
