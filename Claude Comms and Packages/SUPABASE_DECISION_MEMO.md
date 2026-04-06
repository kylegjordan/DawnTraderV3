# DawnTrader Migration Decision Memo — Supabase as Managed Postgres First

**Date:** 2026-03-30  
**Decision Makers:** Kyle, Langston, Claude Code  
**Status:** Approved

---

## 1) Decision

DawnTrader will use **Supabase from the start of the migration**, but **only as managed PostgreSQL in Phase 1**.

This is **not** a decision to adopt the full Supabase platform on day one.

For the initial migration, Supabase is being selected as the long-term database host so the team does **one database migration instead of two**. The application will connect to Supabase as standard Postgres via connection string, with the migration treated as a Postgres-host move first and a broader product-platform opportunity second.

---

## 2) Phase 1 Scope

Phase 1 includes:

- Provision a **Supabase project in the AWS-aligned region** closest to the application host
- Use Supabase as the new **managed Postgres backend**
- Migrate schema, data, environment variables, and connection strings from the current database host
- Validate application behavior in staging using the new database host
- Preserve the existing DawnTrader application behavior during migration
- Confirm export/backup and rollback procedures before production cutover
- Measure latency, query performance, and scan-cycle impact in staging before approval for production use

Phase 1 is an **infrastructure migration**, not a product-platform expansion.

---

## 3) Explicitly Deferred Items

The following are **not** part of Phase 1:

- **Supabase Auth**
- **Supabase Storage**
- **Supabase Realtime**
- Customer account creation and self-service onboarding
- Full multi-user authorization rollout
- Langston / OpenClaw migration off Hetzner
- Broader commercialization work beyond keeping the architecture ready for it

These are intentionally deferred so the migration remains controlled and testable.

---

## 4) Why This Path Won

This path was chosen for five reasons:

### A. One Database Migration Is Better Than Two
Kyle correctly pushed back on the idea of doing a “safe now, harder later” database move. If Supabase is a likely long-term home for a commercial product, migrating there now avoids a second full database migration after more valuable data accumulates.

### B. Managed Postgres First Keeps the First Step Clean
The team is **not** adopting all Supabase platform features immediately. That reduces migration complexity while still landing on the likely long-term database home.

### C. Standard Postgres Reduces Lock-In Risk
Supabase is still PostgreSQL underneath. The team is not choosing a proprietary database engine. That preserves optionality for later export or migration if needed.

### D. Future Multi-User/Product Path Stays Open
Using Supabase from the start keeps the database layer aligned with a future customer-facing product model without forcing Auth/Storage/Realtime adoption during the initial move.

### E. Cost Is Acceptable for This Stage
The expected cost profile is reasonable enough for an active project migration, without committing to an oversized enterprise database footprint prematurely.

### F. Replit Audit Reduced Migration Risk
Claude Code's Replit dependency audit found DawnTrader to be more portable than expected. The critical runtime database-hosting change is primarily the driver swap from `@neondatabase/serverless` to standard `pg`, centered in `server/db.ts` and `drizzle.config.ts`, while Drizzle ORM keeps the application query layer largely unchanged. The audit also found that existing SINGLE_TENANT scaffolding is already present in the codebase, which improves confidence that the codebase can migrate to Supabase-managed Postgres now without forcing an immediate multi-tenant redesign.

---

## 5) Validation Gates Before Production Cutover

Supabase is approved for migration **only if staging meets the following validation targets**.

### Database Connectivity and Stability
- No recurring connection failures, auth failures, or pool exhaustion during repeated test runs
- No schema drift between migrated schema and expected application schema
- Backup/export process tested successfully before production cutover

### Latency Targets
These are practical acceptance gates, not theoretical ideals.

- **App → DB simple query p95:** <= **25 ms** in staging
- **App → DB normal operational query p95:** <= **75 ms** in staging
- **User-facing diagnostics/API endpoint p95:** <= **300 ms** under normal staging load
- **No single critical DB-backed request p95** should exceed **500 ms** without a known, documented reason

### Scan / Trading Workflow Targets
- FX5 / VTS scan pipeline must show **no material regression greater than 10%** versus current baseline for comparable runs
- 300-pair scan cycles must complete without DB-related timeout patterns or query backpressure
- No new persistent DB latency spikes may cause silent starvation of survivors, signal generation, or diagnostics aggregation

### Data Integrity Targets
- Row counts for critical tables reconcile after migration
- Configuration tables (especially filter/config tables such as `screener_filters`) migrate intact
- Recent operational data needed for diagnostics, VTS, and paper trading remains readable and correct
- No sourcePool, diagnostics, or recent trading-state fields are lost or silently coerced during migration

### Operational Validation
- Environment variables and connection strings rotate cleanly between staging and production
- Application logs show no repeated DB retry storms, transport warnings, or driver incompatibilities
- Any WebSocket/driver requirements are validated explicitly in the new deployment stack

---

## 6) Reopen Trigger

This decision must be reopened **before production cutover** if any of the following occur in staging:

- Latency consistently misses the validation targets above
- DB behavior causes scan starvation, aggregation gaps, or signal-generation instability
- Export/backup/rollback confidence is weak
- Connection management is unstable under realistic load
- Region placement cannot keep latency within acceptable bounds
- The migration begins to require immediate adoption of Supabase platform features just to keep the app working

If those conditions occur, the team reopens the host decision rather than forcing production onto a bad foundation.

---

## 7) Operating Assumptions

To keep scope controlled, the migration will proceed under these assumptions:

- Supabase is being used as **managed Postgres first**
- Product-platform features are **deliberately deferred**
- Langston/OpenClaw stays on **Hetzner during the application migration** to avoid adding a second high-risk infrastructure move at the same time
- Claude Code and Langston will validate the migration through staging before any production cutover is approved

---

## 8) Summary

DawnTrader will migrate to **Supabase now**, but in a deliberately narrow way:

- **database host now**
- **platform expansion later**

This preserves future commercial flexibility, avoids a second database migration, and keeps the initial move operationally manageable.

If staging proves the latency, stability, or operational assumptions wrong, the decision is reopened before production cutover.
