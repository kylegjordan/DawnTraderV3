# Directive 12.2.1 — Wave 1: Safe Deletions

> **Status**: COMPLETE
> **Date Issued**: 2026-02-27
> **Date Complete**: 2026-02-27
> **Batch**: 8
> **Code Commit**: `8086264c`
> **Governance Commit**: (this batch)
> **Review Cycles**: 1
> **Test Baseline**: 800 pass / 81 fail (881 total) — unchanged

---

## Objective

Remove ~1,254 lines of dead code across 13 files in 4 categories: orphaned file deletions, server surgery (LATTi system residuals), client surgery (LATTi text references), and interface cleanup (unused field removal).

---

## Scope

### Category 1: File Deletions (2 files, ~962 lines)
| File | Lines | Reason |
|------|-------|--------|
| `client/src/components/system/latti-safety-monitor.tsx` | 306 | Standalone LATTi monitoring component — no importers |
| `server/strategies/dhma.ts` | 656 | Orphaned DHMA strategy module — never instantiated. Active DHMA detection runs via `strategy-engine.ts:detectDHMA()` |

### Category 2: Server Surgery (3 files, ~230 lines)
| File | Change | Lines |
|------|--------|-------|
| `server/routes.ts` | Remove orphaned `handleLATTITargets()` function (~137 lines) + LATTI route comment (3 lines) | ~140 |
| `server/index.ts` | Remove LATTI comment/log (3 lines) + rename `lattiManaged` → `systemManaged` in FilterCoherence and GuardrailsCoherence audit blocks (~50 lines affected) | ~53 |
| `shared/schema.ts` | Remove `lattiBaselineHistory` table + insert schema + types (40 lines) + 3 LATTI fields from `systemContext` (4 lines) | ~44 |

### Category 3: Client Surgery (7 files, ~60 lines)
| File | Change |
|------|--------|
| `enhanced-system-monitoring.tsx` | Remove LATTISafetyMonitor import + render block |
| `target-daily-goals.tsx` | Full rewrite: remove LATTI query/interface, use static pace defaults |
| `coherency-rules-tab.tsx` | Replace 9 "LATTI" text mentions with "system" |
| `goals-table.tsx` | Replace 3 "LATTI" text mentions |
| `guardrails-tab.tsx` | Rename "LATTI Baseline Status" → "Paper Baseline Status" |
| `copy-to-live-modal.tsx` | Update "LATTI-optimized" → "optimized" |
| `core-four-guardrails.tsx` | Update JSDoc comment (remove "LATTi authority surfaces" reference) |

### Category 4: Interface Cleanup (1 file, ~2 lines)
| File | Change |
|------|--------|
| `server/services/signal-orchestrator.ts` | Remove `expectedDuration` from `SizedStrategySignal` interface + write site |

---

## Safety Boundaries

These items were explicitly **NOT touched** to prevent regressions:

- **`tunedByLatti` / `managedByLottie` database column names** — DB column names preserved (renaming requires migration)
- **`quality_index.ts` expectedDuration** — Part of CWQI pipeline, different `expectedDuration` than the one removed from `SizedStrategySignal`
- **`strategy-engine.ts:detectDHMA()`** — Active inline DHMA detection (the standalone `dhma.ts` module that was deleted was orphaned/never instantiated)
- **Physical database tables** — Only ORM definitions removed from `schema.ts`; no migrations needed, physical tables remain in Neon
- **`adaptive-guardrails.ts`** — Active LATTI adaptive tuning system, not dead code
- **`lazy-loader.ts` LATTI stub** (lines 37-40) — Remains; logged as RISK-044

---

## Risks Addressed

| Risk | Status | Notes |
|------|--------|-------|
| RISK-081 | PARTIALLY RESOLVED | 3 LATTI ORM fields removed from `systemContext`, `lattiBaselineHistory` ORM removed. Physical DB columns/tables remain. |
| RISK-044 | OPEN (updated) | Lazy-loader LATTI stub still present (lines 37-40). All other code-level LATTI residuals now removed. |

---

## Verification

- **Vitest**: 800 pass / 81 fail (881 total) — baseline unchanged
- **Broken imports**: 0 detected
- **handleLATTITargets**: Confirmed removed from routes.ts
- **All 3 repos in sync** at commit `8086264c`

---

*Directive write-up created as part of Batch 8B governance update.*
