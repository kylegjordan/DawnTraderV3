# P19-reorg-B2.3 — Completion Report

**Batch:** reorg-B2.3 — per-(strategy × asset_class) minRR baseline-set + single-chokepoint canonicalization
**change-class:** architecture
**Owner:** Claude New (CC-B) · **Reviewer:** Langston (Step-1/2/4/8)
**Closed:** 2026-06-27 (pending Langston Step-8 + Kyle ack)
**Head commit:** `47286ccfd` · **CI:** `28283869359` all-4-green · **Deploy:** staging restart, HTTP 200, migration applied

---

## Objectives checklist

| OBJ | Description | Met | Evidence |
|---|---|---|---|
| 1 | Per-(strategy×class) `min_rr` resolution; `getPerClassTargetGate(assetClass, strategy)` REQUIRED param; single-chokepoint canonicalization | ✅ YES | 13 per-strategy floors + 2 class-default (2.0) live in DB; gate resolves most-specific-wins; `strategy` required (tsc-enforced — CF-1) |
| 2 | Data-derived floors from the live 48h tracker (arithmetic shown in pre-audit §2) | ✅ YES | spread `max(1.0,mean×0.90)` / fixed-RR `max(1.0,mean−0.05)` / thin→`*` 2.0; xStock from xStock's own data |
| 5 | `canonicalizeStrategyName` SSOT + LOUD fail-closed unknown-token + CI tripwire | ✅ YES | REUSED `normalizeStrategy` + `resolveCanonicalStrategy` (no duplicate, Langston-approved); unknown→`min_rr_unknown_floor` (2.88/2.16/2.88) + `unknown_strategy_at_gate` §13 alert + queryable `getUnknownStrategyCounts()`; CI tripwire reads `STRATEGY_DISPLAY_NAMES` at test time |
| 6 | `rrSumSq` instrumentation for Phase-25 25-20 σ | ✅ YES | `rrSumSq` + `rrSumSqEvals` (CF-2 paired counter) in guard-eval tracker; same `_stats.clear()` eviction; restore-seam homed #399 |
| D | morning_star / low-mean strategies decision | ✅ RESOLVED | Kyle 2026-06-27 KEEP ACTIVE → Phase-25 25-20 (win-rate, not reward-size); changes ZERO floors here |

## Seeded floors (live in DB, verified)
- **crypto_spot:** mean_reversion 2.88, vwap_pullback 2.44, strong_bull_trend 1.95, range_trade 1.71, reverse_impulse 2.40, morning_star 1.39, support_bounce 1.0, volatility_edge 1.0; `*` default 2.0.
- **xstock_spot:** vwap_pullback 1.96, sma_trend_ride 1.95, pivot_shift 2.16, vwap_bounce 1.95, morning_star 1.0; `*` default 2.0.
- **`min_rr_unknown_floor`:** crypto 2.88 / xstock 2.16 / global 2.88.

## Langston Step-4 carry-forwards — RESOLVED
- **CF-1 (silent fail-open):** `strategy` made REQUIRED; the `undefined||null||''→'*'` permissive branch deleted entirely. tsc now enforces every caller passes a token (a future/unedited caller fails the COMPILE, not silently drops to 2.0 — §8#10 trap closed). Empty/falsy → fail CLOSED (strict floor + tripwire); a `resolveCanonicalStrategy` falsy-guard prevents a hot-path crash on undefined.
- **CF-2 (rrSumSq restore-seam):** option (a) — added `rrSumSqEvals` (the n paired to rrSumSq). On deploy it restores to 0 while rrEvals carries the 4-day backlog, so `rrSumSqEvals < rrEvals` marks the seam; 25-20 computes σ only over `rrSumSqEvals === rrEvals` windows. Homed **RUNNING_ISSUES #399** (25-20 named gate).

## Verification (Step-7 first-pass)
- ✅ Bench: tsc-baseline GREEN (no regressions); 10/10 new reorg-B2.3 tests + 30/30 affected existing (canonical_source_lock, reorg-b2-2 tracker rekey, 11.4C.3 harmonization).
- ✅ CI `28283869359`: TypeScript Check / Test Suite / Build / Docker Build all success.
- ✅ Deploy: HTTP 200; migration applied (`db:migrate`, 1 pending → applied, the `DO $$` seed-count guard passed).
- ✅ All **18 rows** live in DB (queried): 15 `min_rr` (13 per-strategy + 2 class-default `*`=2.0, lowered from 2.5) + 3 `min_rr_unknown_floor` (crypto/xstock/global). Langston Step-8 nit reconciled — "16" excluded the two `*` updates; the unambiguous live total is 18.
- ✅ **48h guard-eval window SURVIVED the restart** (CF-2 evidence): eval counts continuous/thousands (morning_star 7104→7440, range_trade 4545, total 19,085), not reset — the `rrSumSq`/`rrSumSqEvals` new fields didn't bump `_KEY_SCHEMA` so the checkpoint wasn't discarded.
- ✅ Unknown-strategy counter = 0 in practice (zero `unknown-strategy-at-gate` log hits since restart — all live strategies canonicalize clean, no drift).
- **Step-8:** Langston independent verification dispatched (pending).

## Governance files changed
- `1-system-manual/SYSTEM_MANUAL.md` — NEW "reorg-B2.3" subsection (per-strategy floor derivation + single-chokepoint + fail-closed + rrSumSq).
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — NEW cross-cutting-singletons callout (`resolveCanonicalStrategy` reuse + the `unknown-strategy-counter` `_counts`/`_alerted`/`_lastWarnAtMs` singletons + the tracker `rrSumSq`/`rrSumSqEvals`).
- `1-system-manual/RUNNING_ISSUES.md` — #399 (rrSumSq restore-seam, homed 25-20).
- `1-system-manual/BATCH_CATALOG.md` — this batch entry.
- `1-system-manual/PHASE_HISTORY.md` — phase status.
- `1-system-manual/PHASE_19_PLAN.md` — §1 status board + §5 decision (D).
- MEMORY (CC-B truth + repo mirror) + Langston MEMORY (§10.b).
- Scope `P19_REORG_B2_3_SCOPE.md` + pre-audit `P19_REORG_B2_3_PRE_AUDIT.md` + Step-4 dispatch `Langston Design Asks/reorg-B2.3_STEP4_DIFF.md`.

## Files changed (code)
`canonical-regime-strategy-map.ts` (alias + `resolveCanonicalStrategy`), `expectancy.ts` (gate + `_resolvePerStrategyMinRR`), `unknown-strategy-counter.ts` (NEW), `guard-eval-tracker.ts` (rrSumSq + rrSumSqEvals), 21 gate callers (strategy-engine ×8, 10 strategy files, orchestrator, vts-runner, eval-cycle), `reorg-b2-3-per-strategy-minrr.test.ts` (NEW), migration + rollback + MANIFEST.

## Notes / follow-ups
- Queryable counter via HTTP endpoint NOT wired (verified via logs + the function + the §13 alert) — flagged to Langston at Step-8; add to filter-diagnostics if he wants live HTTP queryability.
- The per-strategy floors are now APPLIED; suppression behavior shifts as new evals accumulate under the new floors (most lower than 2.5 → less suppression; mean_reversion-crypto stricter at 2.88 by design).
- (D) — Phase-25 25-20 owns the trade-vs-shelve call on the 3 sub-1.0-mean strategies (win-rate × RR − friction).
