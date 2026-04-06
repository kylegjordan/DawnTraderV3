# DawnTrader Replit Dependency Audit

**Author:** Claude Code
**Date:** 2026-03-30
**Purpose:** Catalog every Replit-specific assumption in the codebase to inform the AWS + Supabase migration plan.

---

## Executive Summary

DawnTrader's Replit coupling is **moderate and well-contained**. The core application logic is portable. The migration-critical items are:

1. **Database driver** (`@neondatabase/serverless` + WebSocket config) — must change to standard `pg` for Supabase
2. **4 Replit environment variables** — defined but only 1 is actively used (CORS)
3. **3 Replit Vite plugins** — dev-only, conditional, easy to remove
4. **9 hardcoded `/home/runner/workspace` paths** — all in scripts/diagnostics, not core runtime
5. **15+ hardcoded `localhost:5000` URLs** — mostly in test/audit code
6. **`.replit` configuration file** — replaced by Docker/PM2/nginx config
7. **`replit.md` onboarding file** — replaced by updated documentation
8. **`replit-cmd` automation pipeline** — eliminated entirely (direct SSH to EC2)

**Estimated migration effort**: 2-3 focused batches for code changes, plus infrastructure provisioning.

---

## Category 1: DATABASE DRIVER (CRITICAL)

### Current State
- **File:** `server/db.ts`
- **Driver:** `@neondatabase/serverless` with Neon-specific WebSocket configuration
- **ORM:** Drizzle ORM via `drizzle-orm/neon-serverless`
- **Connection:** `DATABASE_URL` environment variable (Neon serverless Postgres)

### What Must Change
- Replace `@neondatabase/serverless` with standard `pg` (node-postgres) package
- Replace `drizzle-orm/neon-serverless` with `drizzle-orm/node-postgres`
- Remove `neonConfig.webSocketConstructor = ws` (Neon-specific WebSocket transport)
- Update `drizzle.config.ts` if driver configuration differs
- Update `package.json` dependencies

### Migration Complexity: MEDIUM
- Drizzle ORM abstracts the query layer, so all application queries remain unchanged
- Only `server/db.ts` and `drizzle.config.ts` need driver changes
- Schema files (`shared/schema.ts`) are driver-agnostic
- `backup-verify.ts` has a Neon-specific URL check (`neon.tech`, `neon-proxy`) that should be removed

### Files Affected
| File | Change Required |
|------|----------------|
| `server/db.ts` | Replace Neon driver with standard pg driver |
| `drizzle.config.ts` | Update driver configuration |
| `package.json` | Replace `@neondatabase/serverless` with `pg`, update drizzle adapter |
| `server/scripts/backup-verify.ts` | Remove Neon-specific URL check |

---

## Category 2: ENVIRONMENT VARIABLES

### Replit-Specific Variables (4)

| Variable | File | Used? | Action |
|----------|------|-------|--------|
| `REPLIT` | `server/config/index.ts:11` | Declared but NEVER consumed downstream | Remove |
| `REPLIT_DEPLOYMENT` | `server/config/index.ts:12` | Declared but NEVER consumed downstream | Remove |
| `REPLIT_DEV_DOMAIN` | `server/index.ts:27` | YES — used for CORS allowed origins | Replace with `ALLOWED_ORIGINS` (already supported) |
| `REPL_ID` | `vite.config.ts:11` | YES — gates Replit Vite plugin loading | Remove (plugins removed) |

### All Required Environment Variables for Migration

These must be configured in the new environment (EC2 env file, systemd, or Docker):

| Variable | Purpose | Current Source |
|----------|---------|----------------|
| `DATABASE_URL` | PostgreSQL connection string | Replit Secret → Supabase connection string |
| `JWT_SECRET` | Auth token signing | Replit Secret → EC2 env/secrets manager |
| `JWT_REFRESH_SECRET` | Refresh token signing | Replit Secret |
| `OPENAI_API_KEY` | AI analysis features | Replit Secret |
| `KRAKEN_API_KEY` | Exchange API access | Replit Secret |
| `KRAKEN_API_SECRET` | Exchange API auth | Replit Secret |
| `KRAKEN_PRIVATE_KEY` | Exchange private key | Replit Secret |
| `PORT` | Server port (default 5000) | `.replit` config |
| `NODE_ENV` | Runtime environment | `.replit` config |
| `ALLOWED_ORIGINS` | CORS whitelist | New — replaces REPLIT_DEV_DOMAIN |
| `ML_SERVICE_HOST` | ML microservice URL | `.replit` userenv |
| `ML_SERVICE_AUTO_START` | Auto-start ML service | `.replit` userenv |
| `INTERNAL_SERVICE_KEY` | ML service auth | `.replit` userenv |
| `PASSIVE_LEARNING_ENABLED` | VTS feature flag | Replit Secret |
| `COMMIT_SHA` | Build version tracking | Set during CI/CD build |

### Migration Complexity: LOW
- Standard env var migration — create `.env` file or use Docker env, systemd EnvironmentFile, or AWS Secrets Manager

---

## Category 3: REPLIT VITE PLUGINS (LOW PRIORITY)

### Current State
- **File:** `vite.config.ts`
- 3 Replit-specific dev plugins loaded conditionally when `REPL_ID` is set:
  - `@replit/vite-plugin-cartographer` — Replit code navigation
  - `@replit/vite-plugin-dev-banner` — Replit dev environment banner
  - `@replit/vite-plugin-runtime-error-modal` — Error overlay (loaded unconditionally on line 9)

### What Must Change
- Remove all 3 `@replit/vite-plugin-*` imports and plugin entries
- Remove the `REPL_ID` conditional block entirely
- Remove packages from `package.json` devDependencies

### Migration Complexity: TRIVIAL
- 10 lines of code in `vite.config.ts` + 3 lines in `package.json`

---

## Category 4: HARDCODED PATHS

### `/home/runner/workspace` References (9 files)

| File | Context | Severity |
|------|---------|----------|
| `REPLIT_VALIDATION.sh:12` | Validation script `REPO_DIR` | LOW — script is Replit-specific, will be replaced |
| `scripts/github-push.sh` | Push script `REPO_DIR` | LOW — deprecated script |
| `scripts/test-phase-6-5-setup.ts:34-36` | Log directory paths | LOW — test utility |
| `server/scripts/diagnostic-11.4G-2.ts` | Audit report output path | LOW — diagnostic script |
| `server/scripts/diagnostic-11.4G-3.ts` | Audit report output path | LOW — diagnostic script |
| `server/services/market-data-health-check.ts:32` | Daily health log path | MEDIUM — active service |
| `server/services/schema-audit.ts` | Audit report path | LOW — diagnostic |
| `server/services/provenance-governance.ts` | Report output path | LOW — diagnostic |
| `diagnostic-reports/validate-production-e2e.sh` | E2E validation script | LOW — test script |

### `localhost:5000` Hardcoded URLs (15+ references)

| File | Context | Severity |
|------|---------|----------|
| `server/services/back_audit_engine.ts` | 11 internal API calls | MEDIUM — active service, should use relative URLs |
| `playwright.config.ts:14,27` | E2E test base URL | LOW — test config |
| `e2e/*.spec.ts` (multiple) | E2E test URLs | LOW — test files |
| `server/__tests__/config-snapshot-api.test.ts:13` | API test URL | LOW — test file |
| Various `scripts/*.ts` | Diagnostic/validation scripts | LOW — utility scripts |

### Migration Action
- `market-data-health-check.ts` — change to `process.cwd() + '/reports/'` or configurable path
- `back_audit_engine.ts` — refactor 11 hardcoded localhost URLs to use relative paths or `BASE_URL` env var
- All others are scripts/tests that can be updated as needed

---

## Category 5: PLATFORM CONFIGURATION FILES

### `.replit` File
- **Purpose:** Replit platform manifest (modules, ports, deployment, workflows)
- **Action:** Not needed on EC2. Replace with:
  - `Dockerfile` + `docker-compose.yml` (or PM2 ecosystem file)
  - nginx config for port mapping / reverse proxy
  - systemd service files (if not using Docker)

### `replit.md` File
- **Purpose:** Replit Agent onboarding prompt with system architecture docs
- **Action:** Can be retained as general documentation or replaced with updated project README
- **Note:** `server/services/context-loader.ts` whitelists and auto-parses `replit.md` at startup — this reference should be updated or removed

### `.replit` Port Mapping
- Current: Port 5000 (app) → external 80, Port 5001 (ML) → external 3000
- New: nginx reverse proxy handles this mapping

---

## Category 6: NPM DEPENDENCIES TO CHANGE

### Remove (Replit-specific)
```
@replit/vite-plugin-cartographer
@replit/vite-plugin-dev-banner
@replit/vite-plugin-runtime-error-modal
```

### Replace (Database driver)
```
@neondatabase/serverless  →  pg (node-postgres)
drizzle-orm/neon-serverless  →  drizzle-orm/node-postgres
```

### Add (Infrastructure)
```
pg                    (standard PostgreSQL driver)
dotenv                (already present — env file loading)
```

---

## Category 7: REPLIT-CMD AUTOMATION PIPELINE (ELIMINATED)

The entire `replit-cmd` toolchain on Langston's Hetzner server becomes unnecessary:
- `replit-cmd upload` → replaced by `git push` + CI/CD auto-deploy
- `replit-cmd agent` → replaced by direct SSH to EC2 or CI/CD pipeline
- `replit-cmd shell` → replaced by direct SSH to EC2
- `replit-cmd wait-for-agent` → eliminated
- `replit-cmd read-agent` → eliminated

The batch zip/upload/Agent workflow is fully replaced by a git-native workflow.

---

## Category 8: MULTI-TENANT READINESS

### Current State
- `SINGLE_TENANT` flag exists (default: true)
- `server/middleware/singleTenantGuard.ts` — middleware that gates multi-tenant behavior
- `server/config/single-tenant.ts` — single-tenant configuration with `GLOBAL_CONTEXT_ID`
- `server/startup/invariants.ts` — logs when multi-tenant mode is enabled

### Assessment
The codebase already has scaffolding for multi-tenant mode. The `SINGLE_TENANT=false` flag activates multi-tenant behavior. This is a positive finding for the Supabase migration — the app was designed with tenant isolation in mind.

---

## Category 9: WEBSOCKET / REAL-TIME

### Current State
- `server/services/context-bridge.ts` — WebSocket server using standard `ws` package
- No hardcoded WebSocket URLs — server-side creates WS server
- Client connects to same host (relative WebSocket URL)

### Migration Impact: LOW
- WebSocket upgrade must be configured in nginx (`proxy_set_header Upgrade`, `proxy_set_header Connection "upgrade"`)
- No code changes required — the `ws` package is platform-agnostic

---

## Migration Priority Matrix

| Priority | Item | Effort | Risk |
|----------|------|--------|------|
| **P0** | Database driver swap (Neon → pg) | 1-2 hours | MEDIUM — must test all queries |
| **P0** | DATABASE_URL connection string update | 10 minutes | LOW |
| **P0** | Environment variable migration | 30 minutes | LOW |
| **P1** | Remove Replit Vite plugins | 15 minutes | TRIVIAL |
| **P1** | Remove REPLIT/REPL_ID env vars and CORS | 15 minutes | TRIVIAL |
| **P1** | nginx WebSocket upgrade config | 30 minutes | LOW |
| **P2** | Fix hardcoded `/home/runner/workspace` paths | 1 hour | LOW |
| **P2** | Fix hardcoded `localhost:5000` in back_audit_engine | 30 minutes | LOW |
| **P2** | Update context-loader.ts replit.md reference | 10 minutes | TRIVIAL |
| **P3** | Update test/e2e URLs | 1 hour | LOW |
| **P3** | Remove deprecated scripts (github-push.sh, REPLIT_VALIDATION.sh) | 15 minutes | TRIVIAL |

**Total estimated code migration effort: ~6-8 hours of focused work (1 batch)**

---

## Conclusion

DawnTrader's Replit coupling is surprisingly clean. The core application is portable. The critical path item is the **database driver swap** from `@neondatabase/serverless` to standard `pg`, which is well-scoped (primarily `server/db.ts`). Everything else is configuration, cleanup, and infrastructure provisioning.

The existing `SINGLE_TENANT` scaffolding and Drizzle ORM abstraction layer mean the app is better prepared for multi-tenant Supabase than expected.
