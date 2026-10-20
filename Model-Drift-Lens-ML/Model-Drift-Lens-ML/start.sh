#!/bin/sh
# start.sh — ML service entrypoint.
# APP_MODULE and APP_PORT are injected by docker-compose per service,
# defaulting to the inference service for local docker run usage.
set -e
exec uvicorn "${APP_MODULE:-app.main:app}" \
    --host 0.0.0.0 \
    --port "${APP_PORT:-8000}" \
    --workers 2
