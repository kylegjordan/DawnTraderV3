# DawnTrader Multi-Stage Dockerfile
# Stage 1: Install dependencies
# Stage 2: Build frontend + backend
# Stage 3: Production runtime

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

# Install Python 3 + pip for ML microservice
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# Create Python virtual environment and install ML dependencies
RUN python3 -m venv /opt/ml-venv
RUN /opt/ml-venv/bin/pip install --no-cache-dir flask numpy scikit-learn

WORKDIR /app

# Copy built application from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

# Copy ML service (Python microservice on port 5001)
COPY --from=build /app/services ./services

# Copy shared schema (needed by Drizzle ORM at runtime)
COPY --from=build /app/shared ./shared

# Copy Drizzle config and migrations (for db:push)
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

# Copy server version file
COPY --from=build /app/server/version.json ./server/version.json

# Set environment
ENV NODE_ENV=production
ENV PORT=5000
ENV ML_SERVICE_HOST=http://localhost:5001
ENV PATH="/opt/ml-venv/bin:$PATH"

# Expose ports: app (5000) + ML service (5001)
EXPOSE 5000 5001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://localhost:5000/api/health/summary').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start the application
# PM2 is the recommended process manager for production (see ecosystem.config.cjs)
# For Docker-only deployments, use this CMD directly:
CMD ["node", "dist/index.js"]
