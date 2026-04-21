# B63 Item 13 — `vwap_pullback`-in-Strong-Trend-Lane Decision Gate Spec

**Status:** PRE-REGISTERED before evaluation window closes
**Spec created:** 2026-04-22
**Evaluation date:** ≥ 1 week after Stage 10B+10C deploy = 2026-04-28 at earliest
**Deliverable at evaluation:** appended to `BATCH_63_COMPLETION_REPORT.md` §8 with verdict KEEP / TUNE / BUILD_DEDICATED + rationale
**Scope source:** `BATCH_63_SCOPE.md` Item 13

---

## 1. What this decision gate answers

After B63 Items 11 + 12 + 14 promoted `vwap_pullback` into the strong-trend lane with Variant E geometry (4×ATR stop, 3R target) + mode-overlay bypass, does the data support:

- **KEEP** — the current promotion + geometry produce a profitable strategy in the lane; no further changes needed.
- **TUNE** — the archetype is viable but geometry needs adjustment (e.g., 3×ATR or 5×ATR stop; 2R or 4R target); re-observe after tuning.
- **BUILD_DEDICATED** — the archetype does not fit cleanly under `vwap_pullback`'s current entry conditions; spin up a purpose-built `strong_bull_pullback` strategy with its own detector in a B64+ batch.

## 2. Population and window

- **Cohort:** trades with `strategy === 'vwap_pullback'` AND `sourcePool === 'quant-strong_trend'`
- **Open from:** 2026-04-21 ~15:13 UTC (PM2 restart #80 — Stage 10B+10C deploy boundary)
- **Evaluation window start (observation open):** 2026-04-21 15:13 UTC
- **Evaluation window end (earliest):** 2026-04-28 15:13 UTC (≥ 1 week)
- **Minimum sample size:** 20 closed trades within the window
- **If sample size < 20 at 1 week:** extend window to 2 weeks (2026-05-05). If still < 20, document as INSUFFICIENT_SAMPLE and defer decision to B64+.

## 3. Pre-registered criteria (hard thresholds)

Evaluated on closed trades only. Open positions at window end are excluded from the sample.

| Metric | KEEP | TUNE | BUILD_DEDICATED |
|---|---|---|---|
| Win Rate (wins / total) | ≥ 55% | 45% ≤ WR < 55% | < 45% |
| Sum R (net, after friction) | > 0 | 0 ≥ Sum R > −2.0 | ≤ −2.0 |

### Decision order

1. Apply WR + Sum R to the **primary cohort** (quant-strong_trend lane).
2. If cohort meets **both** KEEP thresholds → verdict KEEP.
3. Else if cohort meets **either** TUNE threshold AND neither BUILD_DEDICATED threshold → verdict TUNE.
4. Else → verdict BUILD_DEDICATED.

### Tie-breakers

- If WR says KEEP and Sum R says TUNE, verdict = TUNE (R-multiple discipline wins).
- If WR says TUNE and Sum R says BUILD_DEDICATED, verdict = BUILD_DEDICATED (losing money structurally trumps margin WR).
- If WR and Sum R point in opposite directions (e.g., 60% WR but Sum R < −2.0), investigate BEFORE applying the verdict — this indicates a small number of catastrophic losers dominating an otherwise profitable pattern; may point to specific pair / regime sub-conditions that need exclusion.

## 4. Secondary signals (informational, not determinative)

Used to enrich the verdict with "what should change" when TUNE or BUILD_DEDICATED is the call.

- **Stop-hit % vs target-hit %** — if stop-hits >> target-hits, geometry may be too tight relative to the archetype's natural excursion. Suggests stop multiplier tune up (4 → 5 ×ATR).
- **Median hold time** — if median hold ≥ 18h, targets may be too far relative to the archetype's natural trend lifespan. Suggests target tune down (3R → 2R).
- **Regime at entry distribution** — if most winners are IMPULSE_EXPANSION and most losers are TREND_FRIENDLY_STABLE, the archetype may need regime-specific filtering (e.g., restrict to IE only).
- **DBS bucket performance** — if WR scales with DBS magnitude (0.35-0.40 < 0.40-0.50 < 0.50-0.60 < ≥0.60), the archetype works; tuning only. If no scaling, archetype fit is weaker than expected.
- **Lane-conflict count** — how many `strong_trend_lane_conflict` firings? If > 10% of lane-eligible cycles, the first-claim-wins arbitration may be suppressing material signal volume; candidate for strict R-multiple arbitration upgrade.
- **`b63b_counter_trend_long_exclusion` count** — informational; confirms the mirror-defect guard is active on the population.

## 5. Data source + extraction plan

Primary source: virtual_trades disk logs `/home/deploy/dawntrader/logs/virtual_trades/YYYY-MM-DD.json` on staging.

Extraction filter (Python):
```python
cohort = [
    t for t in all_trades
    if t.get("strategy") == "vwap_pullback"
    and t.get("sourcePool") == "quant-strong_trend"
    and t.get("status") == "closed"
    and window_start_ms <= t.get("entryTime", 0) < window_end_ms
]
```

Friction baseline: match the existing VTS record's `netProfit` (already friction-adjusted per VTS config). No recomputation needed.

R-multiple per trade: `(exitPrice - entryPrice) / (entryPrice - stopLoss)` using the trade's recorded stop. Sum across cohort for Sum R.

## 6. Evaluation procedure (at T+1 week)

1. Pull `virtual_trades/2026-04-21.json` through `virtual_trades/2026-04-28.json`.
2. Apply cohort filter + closed-only.
3. Compute: n, WR, avg R, Sum R, stop-hit %, target-hit %, median hold, regime-at-entry distribution, DBS-bucket breakdown.
4. Count `strong_trend_lane_conflict` firings via pm2 log grep.
5. Apply decision tree (§3).
6. Write result into `BATCH_63_COMPLETION_REPORT.md` §8 with: verdict, metrics table, reasoning, and B64+ action item if TUNE/BUILD_DEDICATED.
7. If BUILD_DEDICATED: open a new scope doc `BATCH_XX_STRONG_BULL_PULLBACK_SCOPE.md` with proposed dedicated strategy design.

## 7. What triggers re-evaluation instead of close

If any of the following is observed during the window, hold the decision and investigate before verdict:

- Market regime shifted dramatically (UNSTABLE → STABLE or vice versa) — the sample may be biased by transient conditions. Consider extending the window to cover more regime diversity.
- `GlobalDBS` was stale (`isStale: true`) for > 10% of the window — global DBS health feeds pair-DBS routing. Stale global affects which pairs reach the lane.
- A material bug was discovered that affected vwap_pullback-in-lane behavior during the window — any fix necessitates a fresh observation window.

## 8. What this spec does NOT commit to

- Cross-archetype comparison (vwap_pullback vs strong_bull_trend WRs). Item 13 evaluates the promotion in isolation, not relative performance against the other strong-trend-lane strategy.
- Tuning specific parameters if verdict is TUNE — that becomes its own scoped work.
- Time-of-day analysis or calendar-effect analysis — keep Item 13 focused on overall lane performance; sub-analyses are future work if the verdict needs more granular intervention.

---

*End of Item 13 decision-gate spec. Pre-registered 2026-04-22. Evaluated no earlier than 2026-04-28.*
