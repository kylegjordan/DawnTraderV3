# DawnTrader Multi-Stage Dockerfile
# Stage 1: Install dependencies
# Stage 2: Build frontend + backend
# Stage 3: Production runtime
#
# B-NEW-54 (2026-06-08): the Python ML predictive microservice was RETIRED. The
# runtime stage no longer installs python3 / the ML venv, copies services/, or
# exposes port 5001 — the app is Node-only now.

# --------------------------------------------------
# Stage 1: Dependencies
# --------------------------------------------------
FROM node:20-slim AS deps

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json* ./

# Install production + dev dependencies (dev needed for build)
RUN npm ci

# --------------------------------------------------
# Stage 2: Build
# --------------------------------------------------
FROM node:20-slim AS build

WORKDIR /app

# Copy dependencies from stage 1
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build frontend (Vite) + backend (esbuild)
# This mirrors the existing "build" script in package.json:
#   vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist
RUN npm run build

# --------------------------------------------------
# Stage 3: Production Runtime
# --------------------------------------------------
FROM node:20-slim AS runtime

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Copy shared schema (needed by Drizzle ORM at runtime)
COPY --from=build /app/shared ./shared

# Copy Drizzle config and migrations (for db:push)
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

# Copy server version file
COPY --from=build /app/server/version.json ./server/version.json

# Set environment
ENV NODE_ENV=production
ENV PORT=5000

# Expose app port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://localhost:5000/api/health/summary').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the application
# PM2 is the recommended process manager for production (see ecosystem.config.cjs)
# For Docker-only deployments, use this CMD directly:
CMD ["node", "dist/index.js"]
