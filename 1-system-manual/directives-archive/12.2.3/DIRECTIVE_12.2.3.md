# Directive 12.2.3: Wave 3 — Walter/Bob/Cortex Removal

> **Status**: IN PROGRESS (Sub-Batch A complete, Sub-Batches B and C pending)
> **Date Issued**: 2026-02-24
> **Severity**: MEDIUM
> **Risk IDs**: RISK-040, RISK-060, RISK-070, RISK-083
> **Batch**: 5 (Sub-Batch A), future batches for B and C

---

## Background

The Walter/Bob/Cortex ecosystem is a deprecated AI assistant system comprising ~96 files and ~16,800 lines of code. Kyle confirmed these as LEGACY during the Phase 6 Addendum (2026-02-16). The system includes:

- **Walter**: 18 server-side service files + 3 frontend components + sidebar nav item
- **Bob**: 9 core service files + 4 specialized "bobs" modules + bob-routing middleware
- **Cortex**: 3 TypeScript files + config/data files (ACTIVE in-memory cache, 15-min analytics cycle)
- **Supporting**: chat-logging middleware, phase-8.6.5 routes, provenance-debug routes

Due to the massive size and deep entanglement (cortex-core has 8 active service importers, bob-core has 9+), this directive is split into sub-batches ordered by blast radius.

## Sub-Batch Strategy

| Sub-Batch | Scope | Status | Batch # |
|-----------|-------|--------|---------|
| **A — Safe Deletions** | 9 Walter files with zero external importers | COMPLETE | Batch 5 |
| **B — Walter + Routes** | 9 Walter files with active importers + frontend + routes.ts/index.ts | PENDING | TBD |
| **C — Bob + Cortex** | Bob ecosystem (bob-core hub + modules) + Cortex (8 active consumers) | PENDING | TBD |

## Sub-Batch A: What Was Done (Batch 5)

### Files Deleted (9 files, ~2,792 lines)
| File | Lines | Purpose |
|------|-------|---------|
| walter-cognitive-layer.ts | 491 | Cognitive reasoning layer |
| walter-data-pipeline.ts | 182 | Data ingestion pipeline |
| walter-feedback.ts | 309 | User feedback collection |
| walter-intent-gateway.ts | 237 | Intent routing gateway |
| walter-knowledge-refresh.ts | 279 | Knowledge base refresh service |
| walter-personality.ts | 355 | Personality configuration |
| walter-reasoning-templates.ts | 317 | Reasoning template definitions |
| walter-reference-tracker.ts | 334 | Reference/citation tracking |
| walter-response-templates.ts | 288 | Response formatting templates |

### Files Modified (1 file)
- **`server/tests/phase-6.0-simulations.test.ts`** — Removed 2 imports and 3 test describe blocks (7 tests) referencing deleted files. Preserved all other test blocks (Expert Corpus, Bob Identity, Bob Frontend Health, Corpus Formatting).

### Validation
- TSC: Zero errors related to deletions
- Vitest: 809 passed / 81 failed / 890 total (7 tests removed, 0 new failures)
- New test baseline: **809 / 81** (was 816 / 81)

## Sub-Batch B: What Remains — Walter with External Importers

| File | Active External Importers |
|------|--------------------------|
| walter-purpose.ts | ai-analyst.ts, ai-opportunities.ts |
| walter-memory.ts | ai-analyst.ts, context-refresh-coordinator.ts, event-broker.ts |
| walter-expert-corpus.ts | corpus-domain-service.ts |
| walter-chat-lifecycle.ts | routes.ts |
| walter-ops-engine.ts | routes.ts, formula-auto-audit.ts, feed-integrity-auto-check.ts |
| walter-tts.ts | routes.ts |
| walter-ingest.ts | routes.ts |
| walter-patch-analyst.ts | routes.ts |
| walter-health-monitor.ts | index.ts (startup) |

Frontend: walter.tsx (App.tsx lazy-load), walter-floating-assistant.tsx (App.tsx, all pages), walter-approvals.tsx, sidebar.tsx nav item

## Sub-Batch C: What Remains — Bob + Cortex

- **bob-core.ts** — CRITICAL HUB (9+ importers)
- **cortex-core.ts** — 8 active service consumers + lazy-loader
- All bob-*.ts files imported by routes.ts
- bob-routing.ts and chat-logging.ts middleware in routes.ts
- phase-8.6.5.ts and provenance-debug.ts registered in index.ts

---

## Commit History

| Batch | Commit | Description |
|-------|--------|-------------|
| 5 (Sub-Batch A) | `cc320466` | 9 Walter service files deleted, 1 test file cleaned |
| 5B (Governance) | TBD | Governance docs updated, directive IN PROGRESS |
