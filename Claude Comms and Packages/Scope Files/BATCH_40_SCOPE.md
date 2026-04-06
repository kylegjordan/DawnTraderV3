# Batch 40 Scope: Migration to Hetzner + Supabase (Post-Replit)

## Purpose
Migrate DawnTrader's deployment infrastructure from Replit to a Hetzner staging server with Supabase PostgreSQL, establishing a git-native workflow with direct SSH access for improved debugging, verification, and development efficiency.

## Desired Outcomes
1. Hetzner staging server provisioned and running DawnTrader
2. Supabase PostgreSQL database provisioned with full schema and data from Neon
3. FX5 scanner operational on staging in passive learning mode
4. VTS accumulating simulated trade data
5. Login working with existing user credentials
6. Historical VTS data and regime archive imported
7. GitHub Actions CI pipeline running (typecheck, build, Docker)
8. Dockerfile, nginx config, PM2 ecosystem config, .env template in repo
9. Database driver swapped from Neon serverless to standard pg
10. Replit-specific code removed (Vite plugins, env vars, OpenAI crash fixed)
11. Post-Replit workflow document written and approved by all three actors

## Verification Criteria
- Staging site accessible at http://188.245.193.8
- User can log in and navigate all pages
- FX5 scanner logs show active scanning (300 pairs per cycle)
- Closed Trades (7d) tab shows historical data
- Filter Diagnostics tab populates with scan data
- GitHub CI passes build + Docker steps
- PM2 shows stable process with zero restarts over 12+ hours

## Files Changed
### New files (in repo)
- Dockerfile, .dockerignore, docker-compose.yml, ecosystem.config.cjs
- .github/workflows/ci.yml, .github/workflows/deploy-staging.yml
- deploy/nginx.conf, deploy/DEPLOYMENT.md
- .env.example (updated)

### Modified files
- server/db.ts (Neon to pg driver)
- server/routes.ts (OpenAI imports disabled)
- server/config/index.ts (REPLIT env vars removed)
- server/index.ts (REPLIT_DEV_DOMAIN CORS removed)
- server/services/openai-rate-limiter.ts (graceful init when no API key)
- server/scripts/backup-verify.ts (Supabase as recognized PITR provider)
- vite.config.ts (Replit plugins removed)
- package.json (Neon to pg, Replit plugins removed, @types/pg added)
- client/src/components/layout/top-bar.tsx (sidebar toggle z-index fix)

### New governance/planning docs
- POST_REPLIT_WORKFLOW.md
- SUPABASE_DECISION_MEMO.md
- REPLIT_DEPENDENCY_AUDIT.md
- ARCHITECTURE_AND_MIGRATION_PLAN.md (Langston's original plan)

## Risks
- Database schema mismatch between Neon export and current Drizzle schema (mitigated: columns added manually)
- Non-fatal DB column errors on some tables (known, tracked for follow-up)
- ai-analyst.ts disabled but not removed (legacy Walter code, tracked for cleanup)
- Replit scanner and staging scanner both running simultaneously (acceptable, separate Kraken API keys)

## Branch
`migration/aws-supabase` (all commits on this branch, Replit's `dawntrader-v4` untouched)
