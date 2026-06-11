# B-5 Obj-15a audit results + 3 fixes for review (commit 31d402735, NOT yet pushed)

**From:** Claude Code · **To:** Langston · **Date:** 2026-06-12
**Push gated on your APPROVE.** INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the gdrive mount; everything load-bearing is embedded. Staging can be inspected via `ssh staging`.

## 1. Audit results vs the §7 R4 pinned bars (script run live on staging, AUD-1 dump surface)

| leg | class | bar | n | maxDev | verdict |
|---|---|---|---|---|---|
| vote_retally | crypto | EXACT | 41-54 (3 runs) | 0 | PASS |
| vote_retally | xstock | EXACT | 37-90 (3 runs) | 0 | PASS |
| dbs_weighted_median | crypto | 1e-6 | 432-435 | 0 | PASS |
| dbs_weighted_median | xstock | 1e-6 | 416 | 0 | PASS |
| dbs_partition_parity (your rec-2) | both | loose 0.15 advisory | — | 0 | PASS |
| friction_recompute | crypto | EXACT | 496 | 0 | PASS |
| friction_recompute | xstock | EXACT | 360 | 0 | PASS |
| netpnl_expectededge | both | 1e-6 recombined | 488 (2 days) | 0 | PASS |
| equity_z_scores (VIX) | xstock | 1e-6 | window n=77 | 0 | PASS (mine=system=−1.373011) |
| equity_z_scores (DXY) | xstock | — | window n=1 | — | honest warming skip |
| probe_xstock_staleness | xstock | identity | — | — | PASS: ev_gap_warming(n=0/30) only |
| probe_wildcard_aggressive | db | zero wildcard rows | — | 1 row | FAIL → fix 3 below |

Your rec-1 (no hardcoded floors) implemented as: null vote winner = skip+note (floor-free interpretation); weight cap imported from its canonical export; DBS publish floor not needed (dump never publishes — your A3).

## 2. THE THREE FINDINGS + FIXES (all in commit 31d402735)

### Finding B — xstock at-open AMR stamp never persisted (REAL BUG, fix embedded)
Evidence: of 19 VTS entries after the B-5 deploy, the 1 stamped row is crypto (CHOPPY/SURVIVAL — ladder lag, designed); all 18 unstamped are xstock. Cause: the inline crypto open path stamps at vts-runner:1528, but the xstock eval-cycle opens through `registerOpenVtsTrade`, which only took `input.amrClassification` — never passed. Fix = the same B-NEW-22 default-resolve pattern already used for 5 context fields in that exact function:

```ts
amrClassification: input.amrClassification ?? _amrWeatherMod?.getAmrWeatherReport(input.assetClass)?.classification,
amrMode: input.amrMode ?? _amrWeatherMod?.getAmrWeatherReport(input.assetClass)?.resolvedMode ?? undefined,
```

### Finding A2 — EV-gap/outcome-EMA realized-side UNITS BUG (REAL BUG, fix embedded)
The audit first surfaced 65 (later 114 across 2 days) rows with expectedEdge === netProfit EXACTLY — all take_profit. Attribution leg proved ALL of them are the sim-fill-at-target tautology (realized fraction = tpDistance − friction = expectedEdge; 0 unexplained) — benign. BUT the attribution exposed the real bug: **persisted netProfit IS the realized FRACTION** (verified on concrete rows: ATOM/USD entry 1.75266857 exit 1.77916457 → frac 0.008285189496299247 == netProfit exactly; the only caller, vts-runner :2451, computes `netPnl = (exit−entry)/entry − frictionCost` and keeps `dollarPnl` separate). The close hook then computes:

```ts
const netPnlPct = (tradeData.pnl / notional) * 100;   // assumes pnl in DOLLARS — never true
```

→ realized percent understated by ~notional (~100×). Consumers: (a) B67.4 outcome-feedback EMA — wrong realized side since 2026-05-01 (pre-existing, discovered by this audit); (b) B-5 `feedEvGapObservation` — predicted side is correct (fraction×100), realized side garbage → once the 30-obs window warms, evGapRatio ≈ 1/notional ≈ 0.01 → permanent hostile read, FAVORABLE permanently suppressed. Fix:

```ts
const netPnlPct = tradeData.pnl * 100;  // pnl IS percent-of-notional in fraction form
```

**JUDGMENT CALL E1 — vts calibration-epoch bump BOTH classes** (migration `2026-06-12a-b5-evgap-units-epoch.sql`): the outcome store resets its Welford stream on epoch mismatch (ITEM-4 step-2 semantics; EMA continues — documented limitation), so bumping partitions the polluted streams. Live rows: wildcard vts=3, xstock vts=4 (b5-amr), no crypto class row → xstock UPDATE 4→5 (idempotent via updated_by guard), crypto class row materialized at wildcard+1=4 (ON CONFLICT DO NOTHING). Cost note: epochs were freshly bumped yesterday (B-4.5/B-4.7), so ≤1 day of clean lineage gets re-partitioned — the cheapest moment to do this right. Over-partitioning of unaffected vts streams acknowledged: epoch granularity is per-(source,class), not per-stream.

### Fix 3 — audit side-probe (b): legacy wildcard AGGRESSIVE row DELETE (in the same migration)
`governance_modes */aggressive_mode_confidence_floor = 0.80, updated_by=b72-step3-commit-b, 2026-05-05` — a month pre-B-5, from the class-less AGGRESSIVE era. The b5-amr class rows (0.60) win via most-specific-wins, so it is INERT today (proof the class rows serve: live behavior uses 0.60) — but it would silently serve any FUTURE class before seeding, violating both §5.15 (no silent fallbacks) and the B-5 contract the 11.7S suite asserts (class-less AGGRESSIVE access throws; legacy mapping never produces it).

```sql
DELETE FROM module_constants
WHERE module_name = 'governance_modes' AND asset_class = '*'
  AND constant_name = 'aggressive_mode_confidence_floor';
```

## 3. Bench evidence
tsc baseline OK (no regressions); b5-amr-body 28/28; the vts-runner/vts-service edits don't touch any other suite's subject (the 12 known env-gated failures unchanged).

## 4. Remaining audit legs (no code, evidence-only — run after this ships)
Externals (CBOE live + DXY direction vs DTWEXBGS; FRED cross-check pending its first publish ~tomorrow AM), lifecycle (last 4 weekend transitions from the scanner record + tonight's live overnight STORMY ledger rows + Obj-3a fixtures already CI-green), side-probe (a) negative-spread WRITER root cause (code-level). These land in the completion-report evidence tables.

## Ask
APPROVE / REVISE + verdicts on E1 and the Fix-3 DELETE. On APPROVE: push → CI → deploy (migration applies) → post-deploy proof set (xstock stamps appear on new opens; netPnlPct sane magnitudes in the EV-gap feed; wildcard probe re-run → PASS) → then your Step-8 second pass covers panel + audit surface + these fixes in one sweep.
