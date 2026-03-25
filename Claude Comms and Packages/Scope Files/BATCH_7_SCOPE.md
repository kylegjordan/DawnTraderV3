# Batch 7 Scope — Directive 12.2.3, Sub-Batch C: Bob + Cortex Removal

**Directive**: 12.2.3 (Wave 3: Walter/Bob/Cortex Removal)
**Sub-Batch**: C — Bob ecosystem + Cortex ecosystem + peripheral Walter remnants
**Predecessor**: Batch 6 (`1ea3bb38`), Batch 6B (`eaacf34c`)
**Snapshot**: SNAPSHOT-012 (to be created at `eaacf34c`)
**Test Baseline**: 802/81

---

## Summary

Sub-Batch C completes Directive 12.2.3 by removing the Bob and Cortex ecosystems — the last two AI assistant subsystems in DawnTrader. This is the highest-complexity sub-batch in the directive: 22 files to delete, 15 files to surgically modify, Bob/Cortex route handlers to remove from routes.ts, and the phase-8.6.5.ts route file to delete entirely.

**Estimated removal**: ~10,700 lines (6,111 in deletions + ~4,600 in surgical removals from consuming files)

---

## Part 1: Bob Files to DELETE (15 files, ~4,861 lines)

### Core Bob Services (9 files, ~3,429 lines)
| # | File | Lines | Notes |
|---|------|-------|-------|
| 1 | `server/services/bob-core.ts` | 364 | Core caching + FetchContext. Hub — imported by 7 Bob modules + 4 external consumers |
| 2 | `server/services/bob-config.ts` | 643 | ConfigBob. Imports bob-core |
| 3 | `server/services/bob-data.ts` | 424 | DataBob. Imports bob-core |
| 4 | `server/services/bob-insight.ts` | 335 | InsightBob. Imports bob-core. Used by lazy-loader for Cortex sync |
| 5 | `server/services/bob-inspector.ts` | 589 | BobInspector. Standalone. Used by diagnostic-controller + diagnostic-system.test.ts |
| 6 | `server/services/bob-metrics.ts` | 291 | MetricsBob. Imports bob-core. Used by index.ts, self-repair, devops-bob, bob-routing |
| 7 | `server/services/bob-strategy.ts` | 343 | StrategyBob. Imports bob-core |
| 8 | `server/services/bob-trade.ts` | 252 | TradeBob. Imports bob-core |
| 9 | `server/services/bob-ui.ts` | 188 | UIBob. Imports bob-core |

### Bob Sub-Module (1 file, 326 lines)
| # | File | Lines | Notes |
|---|------|-------|-------|
| 10 | `server/services/bob-modules/learning-bob.ts` | 326 | LearningBob. Used by cognitive-interpreter, learning-cycle-service, phase-8.6.5-enhancements |

### Specialist Bobs (4 files, ~1,006 lines)
| # | File | Lines | Notes |
|---|------|-------|-------|
| 11 | `server/services/bobs/devops-bob.ts` | 169 | DevOpsBob. Imports metricsBob |
| 12 | `server/services/bobs/fullstack-bob.ts` | 170 | FullStackBob. No external importers |
| 13 | `server/services/bobs/trading-bob.ts` | 500 | TradingBob. No external importers |
| 14 | `server/services/bobs/ux-bob.ts` | 167 | UXBob. No external importers |

### Bob Middleware (1 file, 100 lines)
| # | File | Lines | Notes |
|---|------|-------|-------|
| 15 | `server/middleware/bob-routing.ts` | 100 | Request routing. Imports bob-core, bob-metrics. Exports bobStatsHandler used by routes.ts |

---

## Part 2: Cortex Files to DELETE (5 files, ~909 lines)

| # | File | Lines | Notes |
|---|------|-------|-------|
| 16 | `server/services/cortex/cortex-core.ts` | 392 | CortexCore singleton. Hub — imported by 8 consumers |
| 17 | `server/services/cortex/analytics-scheduler.ts` | 249 | 15-min analytics cycle. Imports cortex-core |
| 18 | `server/services/cortex/cortex-config.yaml` | 19 | Config file |
| 19 | `server/services/cortex/cortex-registry.json` | 13 | Registry data |
| 20 | `server/services/cortex/cortex-memory.json` | 236 | Memory state |

---

## Part 3: Other Files to DELETE (2 files, ~341 lines)

| # | File | Lines | Notes |
|---|------|-------|-------|
| 21 | `server/services/corpus-domain-service.ts` | 65 | Already stubbed in Batch 6. Full deletion now that Cortex is being removed. Imported by index.ts + phase-8.6.5.ts |
| 22 | `server/routes/phase-8.6.5.ts` | 276 | Phase 8.6.5 route file. All routes are Walter/Cortex/Corpus-specific. Imported by index.ts |

**Total Deletions: 22 files, ~6,111 lines**

---

## Part 4: Files to Surgically Modify (15 files)

### 4A. routes.ts — Bob + Cortex Route Handler Removal

**File**: `server/routes.ts` (~21,625 lines after Batch 6)

**Imports to remove:**
```
import { bobStatsHandler } from "./middleware/bob-routing";
import { bobCore } from "./services/bob-core";
import { metricsBob } from "./services/bob-metrics";
import { dataBob } from "./services/bob-data";
import { configBob } from "./services/bob-config";
import { strategyBob } from "./services/bob-strategy";
import { tradeBob } from "./services/bob-trade";
import { insightBob } from "./services/bob-insight";
import { uiBob } from "./services/bob-ui";
import { cortexCore } from "./services/cortex/cortex-core";
```
(10 import lines)

**Route handler sections to remove:**
- All Bob API endpoints using bobCore, metricsBob, dataBob, configBob, strategyBob, tradeBob, insightBob, uiBob
- Cortex endpoints: `/api/cortex/status`, `/api/cortex/snapshot`, `/api/cortex/flush`, `/api/cortex/force-sync` (lines ~5712-5782)
- Walter peripheral references: `walterActions` in health-summary (~lines 13775-13790), `getWalterActivity` in diagnostics export (~lines 14049-14064)
- Bob provenance debug route reference (`bobStatsHandler` middleware usage)

**Estimated removal**: ~500-800 lines (needs precise section mapping during implementation)

### 4B. server/index.ts

**Remove:**
- `corpusDomainService` dynamic import + initialize (lines ~348-349)
- `registerPhase865Routes` import + call (lines ~356-357)
- `metricsBob` dynamic import for Phase 7.2 prefetch (line ~676)

### 4C. server/startup/lazy-loader.ts (189 lines)

**Remove:**
- Cortex Core initialization block (lines ~22-48): cortexCore import, insightBob import, initialize(), startSync(), fetchBobSnapshot, fetchUISnapshot
- System Health Monitor block (lines ~64-73): bobCore import, setHealthMonitor call
- Analytics Scheduler block (lines ~52-60): analyticsScheduler import and start

**Note**: This removes 3 of the 6 critical service blocks in Promise.all. The remaining 3 (LATTi removed marker, AuditReport, MarketDataHealthCheck) stay.

### 4D. server/services/config-change-handler.ts (126 lines)

**Remove:**
- `import { bobCore } from './bob-core'` (line 13)
- `import { cortexCore } from './cortex/cortex-core'` (line 14)
- `configBob` dynamic import and call sites (lines ~41, ~105)
- `cortexCore.delete()` / cache invalidation call sites (line ~48)

**Note**: Need to check if meaningful non-Bob/Cortex logic remains, or if this file becomes a candidate for deletion.

### 4E. server/services/diagnostic-controller.ts (405 lines)

**Remove:**
- `import { bobInspector } from './bob-inspector'` (line 9)
- `BobInspectionCommand` / `BobInspectionReport` type usage (lines ~13-14)
- All bobInspector call sites and Bob diagnostic methods

### 4F. server/services/cognitive-interpreter.ts (590 lines)

**Remove:**
- `import { learningBob } from './bob-modules/learning-bob'` (line 15)
- All learningBob call sites

### 4G. server/services/learning-cycle-service.ts (424 lines)

**Remove:**
- `import { learningBob } from './bob-modules/learning-bob'` (line 14)
- All learningBob call sites

### 4H. server/services/phase-8.6.5-enhancements.ts (558 lines)

**Remove:**
- `import { learningBob } from './bob-modules/learning-bob'` (line 15)
- `import { cortexCore } from './cortex/cortex-core'` (line 14)
- All learningBob and cortexCore call sites

**Note**: Need to assess how much of this file is Bob/Cortex-dependent. If the entire file is Bob/Cortex infrastructure, it becomes a deletion candidate.

### 4I. server/services/self-repair.ts (303 lines)

**Remove:**
- `bobCore` dynamic imports (lines ~105, ~190)
- `metricsBob` dynamic import (line ~115)
- All Bob call sites

### 4J. server/services/intent-executor.ts (653 lines)

**Remove:**
- `bobCore` dynamic imports (lines ~226, ~277)
- All bobCore call sites

### 4K. server/services/context-refresh-coordinator.ts (already modified in Batch 6)

**Remove:**
- `import { cortexCore } from './cortex/cortex-core'` (line 9)
- All cortexCore call sites

### 4L. server/services/purpose-layer.ts (204 lines) — CANDIDATE FOR FULL DELETION

**Assessment**: This entire file is Walter/Cortex infrastructure:
- Imports `cortexCore` and `walterPurpose` schema
- All methods load Walter purposes and mirror them to Cortex
- With both Walter and Cortex gone, this service has no purpose

**Recommendation**: DELETE entirely. Remove registration from index.ts.

### 4M. server/services/system-truth-diagnostic.ts (357 lines) — CANDIDATE FOR FULL DELETION

**Assessment**: This service compares Backend vs Cortex vs Walter layers:
- Imports `cortexCore`
- `getCortexSnapshot()` reads from cortex cache
- `getWalterSnapshot()` fetches from behavioral-template
- With Walter and Cortex removed, this becomes a single-layer (backend-only) diagnostic — functionally useless

**Recommendation**: DELETE entirely. Remove route handler from routes.ts.

### 4N. server/routes/provenance-debug.ts (292 lines) — Surgical

**Remove:**
- Bob traces endpoint `/api/provenance/debug/bob-traces/recent` (lines ~89-103)
- Internal `queryRecentBobTraces` call (line ~232)

### 4O. Frontend & Test Files

**client/src/components/dashboard/system-truth-panel.tsx** (332 lines) — CANDIDATE FOR FULL DELETION
- Entire component displays Backend vs Cortex vs Walter comparison
- With Walter and Cortex removed, this panel is useless
- Need to check where it's imported/rendered and remove from parent

**server/tests/diagnostic-system.test.ts** (414 lines)
- `import { bobInspector }` (line 11) — remove
- Tests 1-7 use bobInspector — assess which tests to remove

**server/tests/phase-6.0-simulations.test.ts** (65 lines)
- Currently has Bob diagnostic tests remaining from Batch 6 cleanup
- With Bob being removed, this file becomes empty — DELETE

---

## Part 5: Ancillary Files

| # | File | Action | Notes |
|---|------|--------|-------|
| A1 | `docs/training/Walter_Learning_Files/` | ASSESS | Entire training data directory. Contains historical Walter files. Candidate for deletion in this or future batch |
| A2 | `docs/current_state/screeners_export/backend/routes.ts` | NO CHANGE | Archived copy of old routes.ts. Not active code — skip |
| A3 | `server/services/bob-modules/` | DELETE directory | Empty after learning-bob.ts deletion |
| A4 | `server/services/bobs/` | DELETE directory | Empty after specialist Bob deletions |
| A5 | `server/services/cortex/` | DELETE directory | Empty after all cortex file deletions |

---

## Part 6: Schema References (DEFERRED)

The `walterPurpose`, `walterMemory`, `walterActions` tables are still referenced in `@shared/schema` (imported in routes.ts line 19 and purpose-layer.ts line 10). These are DB schema definitions — removing them would require a migration and is better handled in a schema cleanup directive (12.2.x). Left untouched in this batch.

---

## Complexity Assessment

| Factor | Rating | Notes |
|--------|--------|-------|
| Files to delete | HIGH | 22 files across 5 directories |
| Files to modify | HIGH | 15 files with surgical edits |
| routes.ts surgery | HIGH | 10 import removals + multiple route handler sections + Walter peripheral cleanup |
| Cascade risk | MEDIUM | bob-core is a hub (7 internal + 4 external importers), but all importers are being deleted or cleaned |
| Potential full-file deletions | HIGH | purpose-layer.ts, system-truth-diagnostic.ts, system-truth-panel.tsx, phase-6.0-simulations.test.ts could all be deleted entirely |
| Test impact | MEDIUM | diagnostic-system.test.ts has 4+ Bob tests to remove; phase-6.0 becomes empty |

**Overall**: HIGH complexity. Recommend careful implementation with the same staged-changes workflow used in Batch 6.

---

## Verification Items (Pre-Implementation)

Before proceeding, verify:

1. **phase-8.6.5-enhancements.ts**: How much non-Bob/Cortex logic remains? If it's all Bob/Cortex infrastructure, delete entirely instead of surgical cleanup.

2. **config-change-handler.ts**: Same question — does meaningful non-Bob/Cortex configuration logic remain?

3. **diagnostic-system.test.ts**: How many tests use bobInspector? If all tests are Bob-dependent, the file becomes a deletion candidate.

4. **system-truth-panel.tsx**: Confirm where it's rendered (which parent component) so we can remove the import/render.

5. **purpose-layer.ts**: Confirm it's registered in index.ts and whether any non-Walter/Cortex consumers exist.

6. **docs/training/Walter_Learning_Files/**: Include in this batch or defer? (~historical training data, no runtime impact)

---

## Expected Outcomes

- **22+ files deleted** (~6,111+ lines)
- **~15 files surgically modified** (~2,000-3,000 lines removed from modifications)
- **Net reduction**: ~8,000-10,000 lines
- **Test baseline**: 802/81 → expect ~790-800/81 (Bob tests removed, 0 new failures)
- **Directive 12.2.3**: COMPLETE after this batch
- **All three AI assistants (Walter, Bob, Cortex)**: Fully removed from active codebase
