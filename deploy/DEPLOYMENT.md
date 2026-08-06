# DawnTrader Deployment Guide

## Deployment Models

DawnTrader supports two deployment models. **Choose one per environment** — do not mix.

| Model | When to Use | Config Files |
|-------|-------------|--------------|
| **PM2 on EC2** (recommended for staging/production) | Bare metal EC2, direct SSH access, log management | `ecosystem.config.cjs` |
| **Docker** (recommended for local dev, optional for prod) | Containerized, reproducible, portable | `Dockerfile` + `docker-compose.yml` |

---

## Option A: PM2 on EC2 (Recommended for Production)

### Prerequisites
- EC2 instance (t3.medium or larger)
- Node.js 20 installed
- Python 3 + venv installed
- nginx installed and configured
- PM2 installed globally: `npm install -g pm2`
- SSL certificate (via certbot)

### Initial Setup
```bash
# Clone the repo
git clone https://github.com/kylegjordan/DawnTraderV3.git /home/deploy/dawntrader
cd /home/deploy/dawntrader
git checkout staging  # or main for production

# Install dependencies
npm ci

# Build
npm run build

# Set up Python ML environment
python3 -m venv /opt/ml-venv
/opt/ml-venv/bin/pip install flask numpy scikit-learn

# Create log directory
sudo mkdir -p /var/log/dawntrader
sudo chown deploy:deploy /var/log/dawntrader

# Copy environment file
cp .env.example .env
# Edit .env with real values (DATABASE_URL, secrets, etc.)

# Start with PM2
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # generates system startup script
```

### nginx Setup
```bash
# Copy nginx config
sudo cp deploy/nginx.conf /etc/nginx/sites-available/dawntrader
sudo ln -s /etc/nginx/sites-available/dawntrader /etc/nginx/sites-enabled/

# Edit server_name to match your domain
sudo nano /etc/nginx/sites-available/dawntrader

# Test and reload
sudo nginx -t
sudo systemctl reload nginx

# SSL via certbot
sudo certbot --nginx -d staging.dawntrader.com
```

### Deploying Updates

**One path (B-DEPLOY-LOCK #649):**
```bash
ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <full-40-char-sha> --by <session>'"
```
The raw chain that stood here was the strongest form of the thing #649 kills: it
named a branch that does not exist (`staging`), so a block-paste FAILED that
line and then built + restarted whatever state the worktree happened to hold —
outside the lock, without `db:migrate`, restarting more than the app. `dt-deploy`
locks, refuses dirt, migrates in-chain, and asserts identity + engine-resume
before recording.

### Common Commands
```bash
pm2 status                    # Check process status
pm2 logs dawntrader           # View app logs
pm2 logs dawntrader-ml        # View ML service logs
pm2 monit                     # Real-time monitoring
pm2 restart dawntrader        # Restart app only
pm2 restart all               # Restart app + ML service
```

---

## Option B: Docker

### Prerequisites
- Docker and Docker Compose installed

### Build and Run
```bash
# Build the image
docker build -t dawntrader .

# Run with environment file
docker run -d \
  --name dawntrader \
  --env-file .env \
  -p 5000:5000 \
  --restart unless-stopped \
  dawntrader

# Or use Docker Compose
docker compose up -d
```

### Docker Compose
```bash
docker compose up -d          # Start
docker compose down           # Stop
docker compose logs -f app    # View logs
docker compose up -d --build  # Rebuild and restart
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

| Workflow | Trigger | What It Does |
|----------|---------|--------------|
| `ci.yml` | PR to any branch, push to dawntrader-v4/main | TypeScript check, test suite, build verification, Docker build |
| ~~`deploy-staging.yml`~~ | **DELETED 2026-08-05 (B-DEPLOY-LOCK #649 OBJ-8, rule 18)** — dormant EC2-era template, zero runs ever; archive at `1-system-manual/_archive/deleted-code/deploy-staging.yml.removed`. **Staging deploys use `dt-deploy` on the box, not CI.** |

### ~~Required GitHub Secrets (for deploy-staging.yml)~~ — OBSOLETE: the workflow was deleted (B-DEPLOY-LOCK #649); no secrets are required or should be created
| Secret | Description |
|--------|-------------|
| `STAGING_SSH_KEY` | SSH private key for EC2 staging instance |
| `STAGING_HOST` | EC2 staging IP or hostname |
| `STAGING_USER` | SSH user (e.g., `deploy`) |
| `STAGING_APP_DIR` | App directory (e.g., `/home/deploy/dawntrader`) |

---

## Database

DawnTrader uses PostgreSQL via Drizzle ORM.

**Current:** Neon serverless Postgres (via `@neondatabase/serverless`)
**Target:** Supabase managed Postgres (via standard `pg` driver)

The database driver migration (Neon → pg) is tracked separately. See `REPLIT_DEPENDENCY_AUDIT.md` for details.

### Drizzle Schema Push
```bash
# Push schema to database (creates/updates tables)
npx drizzle-kit push
```

---

## Health Checks

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health/summary` | Full system health (used by nginx, Docker, PM2) |
| `GET /api/status` | Version, build info, database status |

---

## Environment Files

| File | Purpose | In Git? |
|------|---------|---------|
| `.env.example` | Template with all required variables | Yes |
| `.env` | Actual secrets for the environment | **NO** — never commit |
| `.env.staging` | Staging-specific overrides (optional) | **NO** |
| `.env.production` | Production-specific overrides (optional) | **NO** |
