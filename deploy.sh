#!/usr/bin/env bash
# deploy.sh — build & run the persona-blog static site in Docker
# Exposes the site on port 7100 (Caddy handles SSL & reverse-proxy upstream).
# Safe to run repeatedly: stops/removes any existing container first.

set -euo pipefail

CONTAINER_NAME="persona-blog-a"
IMAGE_NAME="persona-blog-a"
HOST_PORT=7100
CONTAINER_PORT=7100

echo "==> [deploy] Starting deployment of ${CONTAINER_NAME}"

# ── 1. Stop & remove existing container (idempotent) ─────────────────────────
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "==> [deploy] Stopping existing container: ${CONTAINER_NAME}"
  docker stop "${CONTAINER_NAME}" || true
  echo "==> [deploy] Removing existing container: ${CONTAINER_NAME}"
  docker rm   "${CONTAINER_NAME}" || true
fi

# ── 2. Build Docker image ─────────────────────────────────────────────────────
echo "==> [deploy] Building Docker image: ${IMAGE_NAME}"
docker build \
  --pull \
  --tag "${IMAGE_NAME}" \
  "$(dirname "$0")"

# ── 3. Run the new container ──────────────────────────────────────────────────
echo "==> [deploy] Starting container: ${CONTAINER_NAME} on port ${HOST_PORT}"
docker run \
  --detach \
  --restart unless-stopped \
  --name "${CONTAINER_NAME}" \
  --publish "${HOST_PORT}:${CONTAINER_PORT}" \
  "${IMAGE_NAME}"

echo "==> [deploy] Done. $CONTAINER_NAME is live at http://localhost:${HOST_PORT}"
