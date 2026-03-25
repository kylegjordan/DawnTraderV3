# BATCH 8 SCOPE — Directive 12.2.1: Wave 1 Safe Deletions

**Date:** 2026-02-27
**Directive:** 12.2.1 — Wave 1: Safe Deletions (LATTi residuals, DHMA orphaned module)
**Baseline Commit:** `e74e4646` (Batch 7B governance)
**Test Baseline:** 800 pass / 81 fail (881 total)

---

## BACKGROUND

The LEGACY_DEPRECATION_PLAN lists Wave 1 as covering: LATTi, Strategy Presets, Goals ML Engine,
DHMA, unused SQE exports, and legacy SizedStrategySignal fields.

### Items confirmed ALREADY RESOLVED (no action needed)

| Category | Status | Notes |
|----------|--------|-------|
| Strategy Presets | REMOVED | No active files or routes remain |
| Goals ML Engine | REMOVED | Fully decommissioned in prior phase |
| SQE Exports | ACTIVE — NOT candidates | All `SQE_THRESHOLDS` actively consumed by RTB, paper engine, system audit |
| Walter peripheral refs | CLEANED in Batch 7B | Only directive comments remain |

### Items verified NOT removable

| Category | Status | Notes |
|----------|--------|-------|
| SizedStrategySignal `ngc` | ACTIVELY USED | Read by routes.ts RTB endpoint + validation-session-service.ts |
| SizedStrategySignal `cwqi` | **CRITICAL fallback** | Used by ready_to_buy_service.ts, paper-execution-engine.ts, routes.ts, client UI. Persisted in paper_sim_trades DB table. |
| SizedStrategySignal `riskScore` | ACTIVELY USED | Persisted in rtbSignals table, used in quality_index.ts + storage.ts |
| SizedStrategySignal `volatility` | ACTIVELY USED | Used in regime calculations (score-calculator.ts), health API |
| SizedStrategySignal `profitRate` | ACTIVELY USED | Persisted in paper_sim_trades, used in quality_index.ts CWQI calculations |
| SizedStrategySignal `expectedDuration` | Write-only (safe to remove) | Only field that is truly unused downstream — included in this batch |

The original deprecation plan incorrectly flagged 5 of 6 SizedStrategySignal fields as removable.
Only `expectedDuration` can be safely removed. The interface itself is NOT exported (internal to
signal-orchestrator.ts only).

---

## VERIFIED SCOPE — 13 files total

### CATEGORY 1: DELETIONS (2 files, ~962 lines)

| # | File | Lines | Reason |
|---|------|-------|--------|
| 1 | `client/src/components/system/latti-safety-monitor.tsx` | 306 | Standalone LATTi monitoring component. Single consumer (enhanced-system-monitoring.tsx). |
| 2 | `server/strategies/dhma.ts` | 656 | **VERIFIED ORPHANED.** `DHMAStrategy` class is NEVER instantiated, NEVER imported. Active DHMA signal generation happens through `strategy-engine.ts:detectDHMA()` — a completely separate inline implementation. The `'dhma'` string in strategy maps stays (it's just a name, not an import). |

### CATEGORY 2: SERVER SURGERY (3 files, ~230 lines)

| # | File | Change | Lines |
|---|------|--------|-------|
| 3 | `server/routes.ts` | Remove orphaned `handleLATTITargets()` function (lines ~21098-21234). Function is declared but NEVER registered as a route — pure dead code. Also remove "Removed: /latti/targets" comment at line 1235. | ~137 |
| 4 | `server/index.ts` | Remove LATTi comment + log (lines 407-409, 3 lines). Refactor audit telemetry to remove `lattiManaged` property from FilterCoherence and GuardrailsCoherence validation blocks (lines ~900-995, ~50 lines). | ~53 |
| 5 | `shared/schema.ts` | Remove `lattiBaselineHistory` table definition + indexes + TypeScript types (lines ~4398-4437, 40 lines). Remove 3 LATTi fields from `systemContext` table: `lattiMode`, `lattiLastAnchorTime`, `lattiLastModeSyncTime` (lines 4376-4378). **DO NOT** touch `tunedByLatti`/`managedByLottie` in guardrails_v2/screenerFilters — these are column names in active DB tables, too risky to rename. | ~43 |

### CATEGORY 3: CLIENT SURGERY (7 files, ~60 lines)

| # | File | Change | Lines |
|---|------|--------|-------|
| 6 | `client/src/components/system/enhanced-system-monitoring.tsx` | Remove LATTISafetyMonitor import + render block | ~5 |
| 7 | `client/src/components/goals/target-daily-goals.tsx` | Remove `LATTITargets` interface + `/api/latti/targets` query hook. Keep goal input fields. | ~30 |
| 8 | `client/src/components/goals/coherency-rules-tab.tsx` | Remove LATTi explanatory text (9 mentions) | ~15 |
| 9 | `client/src/components/goals/goals-table.tsx` | Update UI text removing LATTi references (3 mentions) | ~5 |
| 10 | `client/src/components/goals/guardrails-tab.tsx` | Remove "LATTI Baseline Status" section | ~5 |
| 11 | `client/src/components/goals/copy-to-live-modal.tsx` | Update description removing LATTi reference | ~2 |
| 12 | `client/src/components/goals/core-four-guardrails.tsx` | Remove "All LATTi authority surfaces removed" comment | ~1 |

### CATEGORY 4: INTERFACE CLEANUP (1 file, ~2 lines)

| # | File | Change | Lines |
|---|------|--------|-------|
| 13 | `server/services/signal-orchestrator.ts` | Remove `expectedDuration` field from `SizedStrategySignal` interface (only truly unused field). Also remove any write site that sets it. | ~2 |

### VERIFIED NO-ACTION FILES (0 LATTi references found)

These were initially flagged as "TBD" but verification confirmed they have ZERO LATTi references:
- `server/startup.ts` — clean
- `server/startup/lazy-loader.ts` — clean
- `server/storage.ts` — clean
- `server/config/index.ts` — clean
- `server/services/adaptive-guardrails.ts` — clean
- `server/services/guardrail-policy.ts` — clean
- `server/services/pre-execution-validator.ts` — clean
- `server/scripts/seed-config.ts` — clean
- `server/scripts/validate-phase6.ts` — clean
- `client/src/components/goals/low-priced-protection-card.tsx` — only has a comment, can skip

---

## SIZE SUMMARY

| Category | Files | Est. Lines Removed |
|----------|-------|--------------------|
| Deletions (LATTi monitor + DHMA) | 2 | ~962 |
| Server surgery (routes, index, schema) | 3 | ~230 |
| Client surgery (goals components) | 7 | ~60 |
| Interface cleanup (signal-orchestrator) | 1 | ~2 |
| **Total** | **13** | **~1,254** |

This is a manageable single-batch scope. No splitting needed.

---

## SCHEMA / DATABASE NOTES

**`lattiBaselineHistory` table removal:** Removing the Drizzle ORM definition from `schema.ts` means
the ORM won't know about the table. The physical database table will remain but is unused — no active
code reads from or writes to it. A database migration to DROP the table is optional and can be deferred
to a future database cleanup batch.

**`systemContext` LATTi fields:** Same approach — remove from ORM schema, physical columns remain
in the DB but won't be read/written. No migration needed now.

**`tunedByLatti` / `managedByLottie` columns:** These are column names in the active `guardrails_v2`
and `screenerFilters` tables. The column names contain "latti" but renaming DB columns requires
migrations and risks breaking queries. **Leave as-is** — the names are cosmetic.

---

## TEST IMPACT

- **DHMA tests:** `signal_mapping_integrity.test.ts` and `regime_mapping_integrity.test.ts` reference
  DHMA as a strategy constant (string `'dhma'`). These do NOT import from `dhma.ts` — they test the
  strategy map. **No test changes needed.**
- **LATTi tests:** No dedicated LATTi test files found. The `lattiManaged` property removal in
  `index.ts` audit telemetry may need the property removed from any test assertions if present.

---

## RECOMMENDED APPROACH

Single batch (Batch 8). No splitting needed — 13 files is manageable.

**Commit message:**
```
Batch 8: Directive 12.2.1 — Wave 1 Safe Deletions. Delete orphaned DHMA strategy module
and LATTi safety monitor. Remove LATTi system residuals from routes, index, schema, and
7 client components. Clean expectedDuration from SizedStrategySignal. ~1,250 lines removed.
```
