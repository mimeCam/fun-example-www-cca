# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json* ./

RUN npm ci --prefer-offline 2>/dev/null || npm install

# Copy source and config
COPY astro.config.mjs tsconfig.json ./
COPY src/ ./src/

# Build hybrid output → dist/
RUN npm run build

# ── Stage 2: serve (Node.js standalone for SSR + static) ─────────────────────
FROM node:20-alpine AS server

WORKDIR /app

# Copy built output — client (static) + server (SSR entry)
COPY --from=builder /app/dist ./dist

# Copy production node_modules — @astrojs/node SSR needs @astrojs/internal-helpers at runtime
COPY --from=builder /app/node_modules ./node_modules

# Ensure data directories exist for whisper queue and collective memory DB.
RUN mkdir -p /app/dist/server/data \
 && echo '[]' > /app/dist/server/data/wall-pending.json \
 && mkdir -p /app/data

# Mark data dirs as volume mount-points for persistence across deploys
VOLUME /app/dist/server/data
VOLUME /app/data

# @astrojs/node standalone serves both static and SSR routes
ENV HOST=0.0.0.0
ENV PORT=7100

EXPOSE 7100

CMD ["node", "dist/server/entry.mjs"]
