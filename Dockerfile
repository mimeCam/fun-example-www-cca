# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency manifests first for better layer caching
COPY package.json package-lock.json* ./

RUN npm ci --prefer-offline 2>/dev/null || npm install

# Copy source and config
COPY astro.config.mjs tsconfig.json ./
COPY src/ ./src/

# Build static output → dist/
RUN npm run build

# ── Stage 2: serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS server

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Custom nginx config: serve on port 7100, SPA-friendly 404 handling
COPY <<'EOF' /etc/nginx/conf.d/persona-blog.conf
server {
    listen 7100;
    server_name _;

    absolute_redirect off;
    port_in_redirect off;

    root /usr/share/nginx/html;
    index index.html;

    # Serve pre-compressed brotli/gzip assets if present
    gzip_static on;

    # Cache static assets aggressively; HTML stays short-lived
    location ~* \.(js|css|woff2?|ttf|eot|ico|svg|png|jpg|jpeg|webp|avif|gif)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # Fallback for Astro-generated pages
    location / {
        try_files $uri $uri/ $uri.html /index.html;
    }
}
EOF

# Copy built site from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 7100

CMD ["nginx", "-g", "daemon off;"]
