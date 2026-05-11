# BATCH 79.0m.a — Completion Report

> 🚨 **THIS BATCH DOES NOT MAKE xstock_spot VTS EVALUATION FUNCTIONAL. xstock_spot VTS PIPELINE REMAINS INERT UNTIL B79.0m.b SHIPS.** (Applying the new CLAUDE.md §9.1 SCAFFOLDING-VS-FUNCTIONAL rule to this batch's own report.)

> **Status:** SHIPPED + verified on staging
> **Author:** Claude Code
> **Created:** 2026-05-11
> **Commits:** `b8c642206` (impl) + `0a9d85588` (schema index hotfix)
> **PM2 deploy:** #216 on `migration/aws-supabase` HEAD `0a9d85588`
> **Resolves:** RUNNING_ISSUES #92 partially (threshold + diagnostic + governance layer). Full closure on B79.0m.b ship.

## PREVIOUSLY-STATED-VS-NOW (per new §9.2 rule applied to this report)

| Topic | Previously stated | Now | Reason |
|---|---|---|---|
| xstock_spot strategy whitelist storage | Code constant `XSTOCK_SPOT_ENABLED_STRATEGIES` (`canonical-regime-strategy-map.ts:910`) | DB rows in `module_constants.strategy_gates.xstock_spot.<strategy>.enabled` (19 rows: 10 enabled + 9 disabled, all explicit) | Langston Step 1 R1 — code+DB dual SSOT violates CLAUDE.md §8 #11; DB authoritative. |
| screener_filters unique index | `(mode, filter_path)` | `(mode, asset_class, filter_path)` | xstock rows collided with existing crypto rows on same (mode, filter_path) — required to ship the 10 family-IMF seeds. Pre-Phase-24 the table was effectively crypto-only; B79.0a missed this hygiene. |
| LOC estimate for B79.0m.a | ~200-250 (Langston Step 1) | ~280 actual (16 files changed, 867 insertions, 123 deletions; +45 insertions for hotfix) | Schema-index hotfix added mid-implementation; remained under the Langston 500 LOC ceiling. |

## 1. What shipped (Phase A + Phase C + Phase D from parent scope)

### Phase A — Threshold authoring (DB seeds)

| Surface | Rows | Source |
|---|---|---|
| `screener_filters` family-IMF for xstock_spot | 10 (5 paths × 2 modes) | Cloned from crypto_spot values, tagged `last_updated_by='b79.0m.a-layer1-starter-cloned-from-crypto'` |
| `screener_filters` global mode=live for xstock_spot | 1 | Mirror of existing paper-mode row |
| `module_constants.strategy_gates` for xstock_spot | 18 new (orb pre-existing → 19 total) | 10 enabled = explicit allowlist; 9 disabled = explicit blocklist matching pre-B79.0m.a code-constant set membership |
| `module_constants.regime_classifier` + `path_b_sustainability` for xstock_spot | 3 | TFS branch volatility/momentum scales halved from crypto (equity ATR baseline) + Path B sustainability momentum_min halved. Wildcard-keep for asset-class-agnostic primitives (DI, DBS, regime_age, volume_regime, multi_tf_agreement, pair_correlation, outcome_feedback) documented inline. |
| `screener_filters` unique index migration | (mode, asset_class, filter_path) | Hotfix `0a9d85588` — required for the family-IMF seeds to actually insert (the `(mode, filter_path)` index collided with crypto rows). |

### Phase C — Diagnostic endpoint fixes (`routes.ts:7036-7159`)

- Removed `passed_all_filters: universe24h` mis-wiring (universe24h is `COUNT DISTINCT symbol FROM xstock_spot_ticker_snap` — archive metric NOT pipeline pass)
- Added `applicable: { failed_stablecoin, failed_quote_currency, failed_market_cap }` booleans to emptyGlobal so frontend can render N/A for the 3 non-applicable gates instead of misleading 0
- `xstocks-tab.tsx`: SCAFFOLDING-VS-FUNCTIONAL banner added at top of tab; removed by B79.0m.b once VTS evaluation pipeline ships

### Phase D — CLAUDE.md §9 standing rules (Kyle directive 2026-05-11)

- **§9.1 SCAFFOLDING-VS-FUNCTIONAL declaration** — any sub-batch shipping scaffolding-without-functionality MUST state at top of completion report in bold 🚨 banner format. Applied to this report. Equally applies to in-flight communications.
- **§9.2 NUMERIC-DELTAS-MUST-BE-SURFACED** — any change to a previously-stated number MUST be surfaced as "PREVIOUSLY STATED: X. NOW: Y. REASON: …" Pre-audit + completion reports include PREVIOUSLY-STATED-VS-NOW section at top. Applied to this report.

### Code changes

- `server/config/canonical-regime-strategy-map.ts` — DELETED `XSTOCK_SPOT_ENABLED_STRATEGIES` constant. Rewrote `isStrategyEnabledForAssetClass` to read DB via `getCachedConstant('strategy_gates', 'enabled', {assetClass, strategy, ...})`. Default-open back-compat preserved for asset classes without rows (crypto_spot, future asset classes pre-B79.x onboarding).
- `server/startup/b72-warmup.ts` — added `strategy_gates` to PREFETCH_MODULES so the sync helper has warm cache. Existing HARD-FAIL semantic (throw if rowCount=0) applies; boot log confirms `prefetched module_constants module='strategy_gates' rows=19`.
- `server/storage.ts` — `getScreenerFilters` accepts optional `assetClass` (defaults `crypto_spot`); query now filters by all 3 of (mode, filterPath, assetClass) consistent with the new unique index. Existing crypto callers unchanged (back-compat).
- `server/routes.ts` — diagnostic endpoint fixes.
- `client/src/components/machine-learning/xstocks-tab.tsx` — scaffolding banner.
- `server/tests/unit/b79-0b-strategy-asset-class-gate.test.ts` — rewritten for DB-authoritative gating (mocks module-constants-service cache). 10 enabled + 9 disabled test matrix.

## 2. Verification gates (G1-G7 all GREEN)

| Gate | Result |
|---|---|
| **G1 CI** | Build + Docker green. Legacy red baseline unchanged. b72-warmup boot succeeded with strategy_gates rows=19. |
| **G2 schema + seeds** | `\d screener_filters` confirms new unique index `screener_filters_mode_class_path_idx (mode, asset_class, filter_path)`. 10 family-IMF rows + 1 live-mode row + 19 strategy_gates rows + 3 regime classifier rows confirmed via psql. |
| **G3 PM2 boot logs** | `[B72][warmup] prefetched module_constants module='strategy_gates' rows=19`, `[B79.0g][REHYDRATE] loaded 160 open VTS trades from DB`, `[B79.0g-tx][GC_SWEEP] retention=90d swept=0`, `[B79.0a][SCAN_CYCLE_DONE] tick=30 pairs_scanned=260 fresh=260 stale=0`. Zero ERROR/FATAL/[CONFIG_MISSING] log lines for xstock. |
| **G4 Diagnostic endpoint** | `/api/xstocks/filter-diagnostics` returns `passed_all_filters: 0` (was 380 archive-feed metric) + `applicable: {failed_stablecoin: false, failed_quote_currency: false, failed_market_cap: false}` per Langston Q2 rider. |
| **G5 UI surfaces correctly** | Claude-in-Chrome navigation confirmed: xStocks tab shows `🚨 VTS evaluation pipeline NOT yet wired for xstock_spot` amber banner above all panels. Diagnostic panels load without errors. Banner explicitly states removal-on-B79.0m.b. (Screenshot: ss_53900phea) |
| **G6 Crypto no-touch fence** | All 10 factor families emitting at 7-8/hr for crypto_spot (within ±10% baseline of 8/hr). No regression. |
| **G7 Governance** | CLAUDE.md §9.1 + §9.2 present. SCOPE doc + this completion report apply the rules to themselves. RUNNING_ISSUES update pending the same governance commit as MEMORY sync. |

## 3. Snags + lessons

### Snag 1 — screener_filters unique index collision (hotfix `0a9d85588`)

First family-IMF seed apply returned `INSERT 0 0`. Investigation: pre-existing `screener_filters_mode_path_idx UNIQUE (mode, filter_path)` collided with crypto rows on identical (paper, vts_trend) tuples. `ON CONFLICT DO NOTHING` silently skipped all 10 xstock rows.

**Fix:** dropped the old index, created new `screener_filters_mode_class_path_idx UNIQUE (mode, asset_class, filter_path)`. Updated `getScreenerFilters` storage helper to filter by assetClass; existing callers default to `crypto_spot` for back-compat. 3-LOC + 1 migration; clean inflight resolution.

**Standing rule reinforcement:** the asset-class-index-hygiene work B79.0a *should* have shipped as part of asset_class scoping (adding the column to the table but not the index is a half-job). Logged as a Phase 24 retrospective; similar patterns to audit in other Phase 24-touched tables.

### Lesson — schema-pasting in pre-audit (Langston Step 8 rule from B79.0g-tx)

This batch followed the new Langston rule: pre-audit pasted `\d screener_filters` output + crypto reference rows BEFORE writing migration SQL. The phantom-column problem from B79.0g-tx didn't recur because the column list came directly from `\d`. The unique-index collision was NOT caught by `\d` (the constraint is structural not column-shape) — surfaced at INSERT time. Pre-audit can be extended to also paste `pg_indexes WHERE tablename='<x>'` for hygiene work; logged as a future-batch pre-audit-template addition.

## 4. Crypto regression posture

NONE by-construction. All new DB rows scoped `asset_class='xstock_spot'`. All code-path changes default-resolve to existing crypto behavior when no xstock row exists. Storage helper back-compat default `assetClass='crypto_spot'`. Diagnostic endpoint changes are scoped to `/api/xstocks/*`. Crypto no-touch fence G6 confirms factor cadence unchanged.

## 5. Open follow-ups + sequencing

- **B79.0m.b — TOP PRIORITY, IMMEDIATE NEXT BATCH.** Carves `evaluatePairForVTS` out of `runPhase10SimulationCycle`, wires xstockSpotScanner through it. Without this, the rows seeded today remain inert. Banner removed when B79.0m.b ships.
- **B79.0n — active-trading path wire-in.** Sequences after B79.0m.b. Same DB rows (already seeded by B79.0m.a `mode=live` family rows + universal strategy_gates) cover the active path too; only signal-orchestrator dispatch + paper-execution plumbing remains.
- **B79.3 — equity-equivalent macro confidence modifiers** (RUNNING_ISSUES #94). Sequences after B79.0n.
- **Phase 24 retrospective audit — other tables that gained `asset_class` column but didn't update unique indexes.** Filed as new RUNNING_ISSUES candidate; not bundled into B79.0m.b.

## 6. Governance touch list (this commit)

- `Claude Comms and Packages/Scope Files/BATCH_79_0m_SCOPE.md` — parent scope
- `Claude Comms and Packages/Scope Files/BATCH_79_0m_a_SCOPE.md` — split half 1
- `Claude Comms and Packages/Langston Design Asks/B79_0m_*_rev{1,2}.md` — Langston review artifacts
- `Claude Comms and Packages/Batch Completion/BATCH_79_0m_a_COMPLETION_REPORT.md` — this file
- `BATCH_CATALOG.md` + `PHASE_HISTORY.md` + `RUNNING_ISSUES.md` (#92 partially-resolved, B79.0m.b tracker) + `CHANGES_AND_FIXES.md` (entry for the ship + the hotfix) — governance pass next commit alongside MEMORY 3-way sync
- `CLAUDE.md` §9.1 + §9.2 — committed in this batch

---

*End BATCH_79_0m_a_COMPLETION_REPORT.md.*
