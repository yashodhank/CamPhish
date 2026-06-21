#!/bin/bash
set -e

mkdir -p /data/captures /data/locations /data/logs /data/config
chown -R www-data:www-data /data

if [ -n "$NGROK_AUTHTOKEN" ]; then
    echo "$NGROK_AUTHTOKEN" > /data/config/ngrok_token
fi

echo "SESSION_NAME=${SESSION_NAME:-default}" > /data/config/session.env
echo "DEFAULT_TEMPLATE=${DEFAULT_TEMPLATE:-1}" >> /data/config/session.env
echo "FESTIVAL_NAME=${FESTIVAL_NAME:-NewYear}" >> /data/config/session.env
echo "YOUTUBE_VIDEO_ID=${YOUTUBE_VIDEO_ID:-dQw4w9WgXcQ}" >> /data/config/session.env

exec "$@"
