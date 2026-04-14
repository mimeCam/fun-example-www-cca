# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Native build tools for better-sqlite3 (fallback if prebuilt binary unavailable)
RUN apk add --no-cache python3 make g++

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json* ./

RUN npm ci --prefer-offline 2>/dev/null || npm install

# Copy source, config, and dev scripts (prebuild token lint guard)
COPY astro.config.mjs tsconfig.json ./
COPY scripts/ ./scripts/
COPY src/ ./src/

# Static assets — public/ is copied to dist/client/ by astro build.
# Cover images (public/images/covers/*.svg) must be present here so the
# OG split-panel layout and blog hero images are served at runtime.
COPY public/ ./public/

# Build hybrid output → dist/
RUN npm run build

# ── Stage 2: serve (Node.js standalone for SSR + static) ─────────────────────
FROM node:20-alpine AS server

WORKDIR /app

# Fonts for satori OG image generation (DejaVu Sans ships with Alpine's fontconfig)
RUN apk add --no-cache fontconfig ttf-dejavu

# Copy built output — client (static) + server (SSR entry)
COPY --from=builder /app/dist ./dist

# Copy production node_modules — @astrojs/node SSR needs @astrojs/internal-helpers at runtime
COPY --from=builder /app/node_modules ./node_modules

# Blog markdown needed at runtime for content collection queries
COPY --from=builder /app/src/content/blog/ ./src/content/blog/

# FreeTSA root CA cert — read at runtime by rfc3161-verifier.ts via
# readFileSync(resolve(process.cwd(), 'src/assets/freetsa-ca.der'))
COPY --from=builder /app/src/assets/ ./src/assets/

# Ensure data directories exist for collective memory DB and server data.
RUN mkdir -p /app/dist/server/data \
 && mkdir -p /app/data

# Mark data dirs as volume mount-points for persistence across deploys
VOLUME /app/dist/server/data
VOLUME /app/data

# @astrojs/node standalone serves both static and SSR routes
ENV HOST=0.0.0.0
ENV PORT=7100

EXPOSE 7100

CMD ["node", "dist/server/entry.mjs"]
