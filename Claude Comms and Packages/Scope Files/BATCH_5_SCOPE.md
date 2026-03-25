# Batch 5 Scope: Wave 3 Sub-Batch A — Walter Safe Deletions

> **Date**: 2026-02-24
> **Directive**: 12.2.3 (Walter/Bob/Cortex Removal, Wave 3)
> **Type**: Code deletion + minimal test cleanup (no active service modifications)
> **Estimated Size**: ~2,792 lines deleted across 9 files + test cleanup

---

## Strategy: Why Sub-Batching Wave 3

The Wave 3 scope (Directive 12.2.3) covers ~40+ files across Walter, Bob, and Cortex — far too large for a single batch. Investigation of the full dependency graph reveals three natural tiers:

| Tier | Description | Files | Complexity |
|------|-------------|-------|------------|
| **A — Safe Deletions** | Walter files with zero external importers | 9 service files | LOW — pure deletion |
| **B — Walter + Routes** | Walter files imported by routes.ts, index.ts, active services | 9 service files + frontend + routes | HIGH — requires active code surgery |
| **C — Bob + Cortex** | Bob ecosystem (bob-core hub, 9+ consumers) + Cortex (8 active importers) | 15+ files | HIGH — deeply integrated |

**This batch (5) = Tier A only.** Tiers B and C will be scoped separately after Tier A is validated.

---

## Batch 5 Targets: 9 Walter Service Files

All 9 files have **zero external importers** outside the `walter-*` namespace. They are only referenced by other Walter files (which are also deprecated) and one test file.

### Files to Delete

| # | File | Lines | Internal Importers | Notes |
|---|------|-------|--------------------|-------|
| 1 | `server/services/walter-cognitive-layer.ts` | 491 | Imports walter-intent-gateway (also in delete set) | Cognitive reasoning layer |
| 2 | `server/services/walter-data-pipeline.ts` | 182 | None | Data ingestion pipeline |
| 3 | `server/services/walter-feedback.ts` | 309 | None | User feedback collection |
| 4 | `server/services/walter-intent-gateway.ts` | 237 | Imported by walter-cognitive-layer (also in delete set) | Intent routing gateway |
| 5 | `server/services/walter-knowledge-refresh.ts` | 279 | Imported by test file only | Knowledge base refresh service |
| 6 | `server/services/walter-personality.ts` | 355 | None | Personality configuration |
| 7 | `server/services/walter-reasoning-templates.ts` | 317 | Imported by test file only | Reasoning template definitions |
| 8 | `server/services/walter-reference-tracker.ts` | 334 | None | Reference/citation tracking |
| 9 | `server/services/walter-response-templates.ts` | 288 | None | Response formatting templates |

**Total**: ~2,792 lines

### Test File Cleanup (1 file modified)

**`server/tests/phase-6.0-simulations.test.ts`** imports two files from the delete set:
- Line 24: `} from '../services/walter-reasoning-templates';`
- Line 25: `import { walterKnowledgeRefresh } from '../services/walter-knowledge-refresh';`

These imports and any test blocks that use them must be removed or commented out. The test file also imports `walter-expert-corpus` and `walter-purpose` — those are NOT in this batch (they have active external importers) and must be preserved.

---

## What Is NOT in This Batch

These Walter files have active external importers and require routes.ts/index.ts surgery — deferred to Tier B:

| File | Active External Importers |
|------|--------------------------|
| `walter-purpose.ts` | ai-analyst.ts, ai-opportunities.ts |
| `walter-memory.ts` | ai-analyst.ts, context-refresh-coordinator.ts, event-broker.ts |
| `walter-expert-corpus.ts` | corpus-domain-service.ts |
| `walter-chat-lifecycle.ts` | routes.ts |
| `walter-ops-engine.ts` | routes.ts, formula-auto-audit.ts, feed-integrity-auto-check.ts |
| `walter-tts.ts` | routes.ts |
| `walter-ingest.ts` | routes.ts |
| `walter-patch-analyst.ts` | routes.ts |
| `walter-health-monitor.ts` | index.ts (startup) |

Bob and Cortex files are deferred to Tier C (bob-core alone has 9+ importers; cortex-core has 8 active service consumers).

Frontend files (walter.tsx, walter-floating-assistant.tsx, walter-approvals.tsx, sidebar.tsx nav item) are deferred to Tier B with the routes/index cleanup.

---

## Dependency Safety Verification

The 9 files in this batch form a self-contained island:

```
walter-cognitive-layer.ts ──imports──> walter-intent-gateway.ts
  (both in delete set — no dangling references)

walter-knowledge-refresh.ts ──imported by──> phase-6.0-simulations.test.ts
  (test file cleanup included in this batch)

walter-reasoning-templates.ts ──imported by──> phase-6.0-simulations.test.ts
  (test file cleanup included in this batch)

All other 5 files: zero imports in, zero imports out to non-Walter code
```

No active services, no routes.ts changes, no index.ts changes, no frontend changes, no lazy-loader changes.

---

## Expected Validation

- **TSC**: No new errors expected (deleted files are not imported by any active code)
- **Vitest**: Baseline should hold at 816 pass / 81 fail (test cleanup removes Walter-specific tests, not active pipeline tests). Some tests in phase-6.0-simulations.test.ts may shift from pass to removed — total count may decrease slightly.
- **Server startup**: No impact (none of these files are initialized in index.ts)

---

## Batch Deliverables

1. **INSTRUCTIONS.md** — Delete 9 files + find/replace for test file cleanup
2. **README.md** — Batch documentation
3. **Zip** — `BATCH_5-DIR_12.2.3_WALTER_SAFE_DELETIONS.zip`

No full file replacements needed — all changes are pure deletions + test import cleanup.

---

## Future Batches Roadmap

| Batch | Tier | Scope | Estimated Complexity |
|-------|------|-------|---------------------|
| **5** (this) | A | 9 Walter safe deletions | LOW |
| **6** | B | 9 Walter files with external importers + frontend + routes.ts/index.ts cleanup | HIGH |
| **7** | C | Bob ecosystem (bob-core hub + modules) + bob-routing.ts | HIGH |
| **8** | C | Cortex files + lazy-loader cleanup | MODERATE-HIGH |
| TBD | — | 12.2.1 residuals (latti-safety-monitor.tsx) | LOW |
| TBD | — | 12.1.6 LSP error triage | LOW (documentation-only, deferred) |

> **Note**: Batch numbers 6-8 are provisional. Actual scoping will be done after each batch validates. The order may change based on what we learn.
