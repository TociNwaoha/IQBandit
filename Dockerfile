# syntax=docker/dockerfile:1
#
# Multi-stage build for IQ BANDIT (FRONTEND) — Next.js 16 + better-sqlite3
#
# Stages:
#   deps    — install production-only dependencies (compiles better-sqlite3 native addon)
#   builder — install all dependencies + run `next build`
#   runner  — lean runtime image (no build tools, no devDeps)
#
# Usage:
#   docker build -t iqbandit .
#   docker run -p 3000:3000 --env-file .env.production -v ./logs:/app/logs iqbandit
#
# better-sqlite3 requires compilation from source on Alpine (musl libc).
# python3, make, and g++ are only needed at build time — not in the runner.

# ---------------------------------------------------------------------------
# Stage 1: deps — production dependencies with native build tools
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
# --omit=dev skips devDependencies (typescript, eslint, etc.)
# npm ci ensures a clean, reproducible install matching package-lock.json
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Stage 2: builder — full install + Next.js build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
# Full install including devDeps needed for TypeScript compilation
RUN npm ci
# Copy source files (respects .dockerignore — .env*, logs/, node_modules excluded)
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 3: runner — lean production runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy production node_modules (better-sqlite3 .node binary already compiled for linux-alpine)
COPY --from=deps /app/node_modules ./node_modules

# Copy Next.js build output
COPY --from=builder /app/.next ./.next

# Copy static assets
COPY --from=builder /app/public ./public

# Copy package.json (needed for `next start` to resolve bin path)
COPY --from=builder /app/package.json ./package.json

# logs/ is created at runtime by lib/logger.ts and lib/settings.ts.
# Mount a volume here for persistence: docker run -v ./logs:/app/logs ...
VOLUME ["/app/logs"]

EXPOSE 3000

# Run next start directly — one process, no npm wrapper overhead
CMD ["node_modules/.bin/next", "start"]
