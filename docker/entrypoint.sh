#!/bin/bash
set -e

mkdir -p /data/captures /data/locations /data/logs /data/config /data/templates/ai-generated
chown -R www-data:www-data /data

if [ -n "$NGROK_AUTHTOKEN" ]; then
    echo "$NGROK_AUTHTOKEN" > /data/config/ngrok_token
fi

echo "SESSION_NAME=${SESSION_NAME:-default}" > /data/config/session.env
echo "DEFAULT_TEMPLATE=${DEFAULT_TEMPLATE:-1}" >> /data/config/session.env
echo "FESTIVAL_NAME=${FESTIVAL_NAME:-NewYear}" >> /data/config/session.env
echo "YOUTUBE_VIDEO_ID=${YOUTUBE_VIDEO_ID:-dQw4w9WgXcQ}" >> /data/config/session.env
echo "WATERMARK_ENABLED=${WATERMARK_ENABLED:-true}" >> /data/config/session.env
echo "WEBRTC_ENABLED=${WEBRTC_ENABLED:-true}" >> /data/config/session.env

if [ ! -f /data/config/sessions.json ]; then
    echo '{"sessions":{},"active":""}' > /data/config/sessions.json
    chown www-data:www-data /data/config/sessions.json
fi

if [ -n "${DASHBOARD_USER:-}" ] && [ -n "${DASHBOARD_PASS:-}" ]; then
    htpasswd -cb /data/config/.htpasswd "$DASHBOARD_USER" "$DASHBOARD_PASS"
    chown www-data:www-data /data/config/.htpasswd
    chmod 640 /data/config/.htpasswd
fi

exec "$@"
