#!/usr/bin/env bash
set -euo pipefail

CF_API_TOKEN="${1:?Missing CF_API_TOKEN}"
CF_ZONE_ID="${2:?Missing CF_ZONE_ID}"
FQDN="${3:?Missing FQDN}"

CF_API="https://api.cloudflare.com/client/v4"

echo "=== Deleting Cloudflare DNS Records ==="

delete_by_name() {
    local name="${1}"
    local records=$(curl -s -X GET "${CF_API}/zones/${CF_ZONE_ID}/dns_records?type=A&name=${name}" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json")

    local ids=$(echo "$records" | jq -r '.result[]?.id // empty')
    if [ -z "$ids" ]; then
        echo "No records found for ${name}"
        return
    fi

    for id in $ids; do
        echo "Deleting record ${id} for ${name}"
        curl -s -X DELETE "${CF_API}/zones/${CF_ZONE_ID}/dns_records/${id}" \
            -H "Authorization: Bearer ${CF_API_TOKEN}" \
            -H "Content-Type: application/json" > /dev/null
        echo "Deleted"
    done
}

delete_by_name "$FQDN"
delete_by_name "dashboard.${FQDN}"

echo "=== DNS Cleanup Complete ==="
