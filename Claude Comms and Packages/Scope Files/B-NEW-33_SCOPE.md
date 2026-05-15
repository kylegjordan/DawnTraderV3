# B-NEW-33 — Crypto factor calibration backtest tool (8-lever verdicts)

**Status:** SCOPE DRAFT (Step 1) — pending Langston review
**Date:** 2026-05-15
**Owner:** CC (impl) + Langston (review)
**Branch:** `migration/aws-supabase`
**Prerequisite:** none (regime_factor_alternates already has 40,642 rows of data)
**Unblocks:** B67.5 consumer-gate design + ship

---

## 1. Background

`regime_factor_alternates` is the B67.0 factor-ablation framework's data store. Each row records a "real decision" the live system made AND an "alternate decision" representing what the system would have decided if a single confidence-modifying factor (lever) were disabled. The diff between the two is the lever's marginal contribution to the confidence chain.

Eight crypto levers are emitting rows:

- **b67_1 macro modifier** (split into 3 underlying inputs: `b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`)
- **b67_2 phase preference**
- **b67_4 outcome feedback**
- **b68_1 multi-timeframe agreement**
- **b68_2 volume regime**
- **b68_3 pair correlation**
- **b68_4 regime age**
- **b68_5 Path B sustainability**

Total = 10 distinct `factor_name` values (b67_1 fans out to 3).

Per-row data structure (verified via DB sample 2026-05-15):
- `real_decision.confidence` (0..1)
- `alternate_decision.confidence` (0..1)
- `alternate_decision.metadata.confidence_with_factor` / `confidence_without_factor` (the lever-specific delta)
- `replay_outcome.outcome` (`admitted_won` / `admitted_lost` / `unreplayable_real_rejected` / `pre_b67_5_both_admit`)
- `replay_outcome.pnl_usd` (actual realized P&L)
- `replay_completed_at` (NULL if not yet replayed)

Cron `npm run b67:replay-ablation` runs nightly at 04:00 UTC to back-fill `replay_outcome` for new rows. **The cron has been broken since 2026-05-11.** Each night it loads 5000 pending rows, attempts a natural-key join (pairSymbol, evaluated_at±60s, strategy) against last-14-day VTS JSONL logs, and matches 0 of 5000.

Current state (2026-05-15 15:30 UTC):
- 40,642 total rows (crypto_spot)
- 7,593 replayed (peaked May 3-5 ~2000/day, dwindled to 17 by May 10, 0 since)
- 33,049 pending
- Earliest row 2026-04-30, latest 2026-05-15

The existing `computeFactorCalibration()` aggregator in `drift-dashboard-aggregator.ts` reads only `WHERE replay_completed_at IS NOT NULL`, so the analytics panel displays only the ~7.5K replayed rows — many factors are at sub-threshold n per tertile bucket.

---

## 2. Objectives

1. **Diagnose** why the natural-key join is matching 0/5000 since 2026-05-11. Specifically: what changed in the VTS close-trade path or JSONL log shape that broke the match?
2. **Fix** the matching logic structurally — likely by sourcing closed VTS trades from the **DB** (`vts_open_trades` with `closed=true` per B79.0g-tx OR `paper_sim_trades` per B70) rather than from the file-based JSONL logs. JSONL was the B67.0 source-of-truth before B70/B79.0g-tx existed; current canonical state is DB-backed.
3. **Drain the backlog** — run a one-shot tool that replays the 33,049 pending rows in one pass. Operates as a CLI script invokable via `npm run b-new-33:factor-backtest`.
4. **Compute per-lever verdicts** with decision-grade statistical rigor:
   - Tertile-split (low/mid/high) on `real_decision.confidence` per factor.
   - Win rate per tertile = `count(outcome='admitted_won') / count(*)`.
   - Real spread = WR(high tertile) − WR(low tertile).
   - Counterfactual spread = same calculation but using `alternate_decision.confidence` for the split. (Catch: if disabling the lever produces near-identical confidence values across rows, alternate tertiles collapse to one bucket — log and flag.)
   - Predictive lift = real spread − alt spread (positive lift = the lever adds predictive value).
   - Statistical significance: Fisher's exact test (or chi-square for n>30) on the high vs low tertile contingency table. Report p-value.
   - Decision-grade gate: **n ≥ 150 per tertile bucket** AND **spread ≥ 7 percentage points** AND **p < 0.05**. All three required to declare a lever "decision-grade ADD" or "decision-grade DROP."
5. **Output** a per-lever verdict report:
   - VERDICT: KEEP / DROP / INCONCLUSIVE
   - n_replayed (total replayed rows for this factor)
   - tertile_ns (low/mid/high counts)
   - tertile_wrs (WR per tertile)
   - real_spread / alt_spread / predictive_lift
   - p_value
   - notes (e.g. "alt confidence delta is degenerate" if relevant)
6. **Preserve** the existing `/api/analytics/factor-calibration` route + UI panel. No modifications to the live aggregator or UI. The CLI tool is an OUT-OF-BAND analysis script that runs once and produces a Markdown verdict report, not a permanent service.

---

## 3. Out of scope (for this batch)

- **B67.5 consumer wiring.** B-NEW-33 produces VERDICTS. B67.5 (separate batch) acts on those verdicts to wire chain-final confidence into the 7 consumer sites and remove the legacy `RegimeWeight` class.
- **Restoring the nightly cron permanently.** The fix in objective 2 (source from DB instead of JSONL) MAY incidentally restore the cron — but verifying that the cron stays healthy for the next 7 nights is out of scope for THIS batch. Tracked as a follow-up item.
- **Forward-simulation harness** for `unreplayable_real_rejected` rows. Per `replay-ablation.ts` design notes, these need a forward-sim harness (Phase 19). Out of scope.
- **Other asset classes.** xstock_spot factor calibration is locked behind XSTOCK_CALIBRATION_PLAN Phase E. crypto_perp doesn't have factor emission yet. Crypto-only.
- **Adding new factors.** The 10 existing factor_name values are fixed; no new lever introductions.

---

## 4. Architectural decisions (proposed — Langston review please)

### 4.1 Replay source = DB tables, not JSONL files

**Proposed:** rewrite the natural-key matcher to query `paper_sim_trades` (B70 archive of closed VTS trades) instead of file-system JSONL logs. JSONL was the B67.0-era source when B70 didn't exist. Current canonical truth lives in DB.

**Alternative considered:** keep JSONL and widen the lookback from 14d to 30d. Rejected because (a) the JSONL files may not even exist for older windows (retention/rotation), (b) DB tables are the canonical source per B70, and (c) a JSONL-source replay would re-break the next time JSONL semantics change.

### 4.2 Natural-key match: (pairSymbol, evaluated_at ± window, strategy)

**Proposed:** match `regime_factor_alternates.pair_symbol = paper_sim_trades.symbol` AND `regime_factor_alternates.strategy = paper_sim_trades.strategy` AND `regime_factor_alternates.evaluated_at BETWEEN paper_sim_trades.opened_at - INTERVAL '5 minutes' AND paper_sim_trades.opened_at + INTERVAL '5 minutes'`.

Time window WIDER than the cron's existing ±60s — empirical 2026-05-15: ablation row's `evaluated_at` is set at MCE-cycle time, the trade `opened_at` is set at order-fill time, drift can be 60s-300s depending on scanner cadence + signal-orchestrator queue depth + paper-execution timing. ±5min is generous but won't cause cross-trade collisions if (symbol, strategy) is also matched — same pair + same strategy within 10min would be the same signal.

### 4.3 P-value implementation

**Proposed:** Fisher's exact test for n ≤ 100 per tertile, chi-square for n > 100. Implement inline (no library dep) using:
- Fisher's exact: `simple-statistics` library's `fisherTest` if available; otherwise build a stable hypergeometric tail sum.
- Chi-square: 2×2 contingency table on (won/lost) × (high/low tertile), df=1.

**Alternative:** binomial test on each tertile's WR vs the overall WR. Rejected — less directly relevant to the "is the spread real?" question that the decision-grade gate asks.

### 4.4 One-shot CLI vs in-app job

**Proposed:** CLI script at `scripts/b-new-33-factor-backtest.ts`, invokable via `npm run b-new-33:factor-backtest`. Output: human-readable Markdown to stdout + write copy to `Claude Comms and Packages/Batch Completion/B-NEW-33_VERDICTS.md`. No webhook, no UI changes, no cron entry.

**Rationale:** the analysis is meant to be run ONCE per major calibration window (every 30 days). The existing /api/analytics/factor-calibration endpoint already provides the live-rolling view; the CLI tool's job is the deeper p-value-grade verdict that informs B67.5 design.

---

## 5. Verification criteria

| # | Criterion | How verified |
|---|---|---|
| 1 | Replay matcher hits ≥85% of pending rows that have a corresponding closed trade in `paper_sim_trades` | SQL count + script's `matched`/`unmatched` log lines |
| 2 | Backlog drained: `pending_replay` count drops from 33,049 to <1000 (residual = `unreplayable_real_rejected` rows that have no actual trade) | DB count post-run |
| 3 | Each of 10 factors has a verdict line in the output report | Markdown sections present |
| 4 | At least 6 of 10 factors reach decision-grade (n≥150/bucket, spread≥7pp, p<0.05) | Read verdict report |
| 5 | No regression to live `/api/analytics/factor-calibration` panel | Curl + UI smoke test post-run |
| 6 | CI green (Build + Docker; TS check + Test Suite at pre-existing legacy baseline) | GitHub Actions run |
| 7 | Crypto factor families still emitting at expected cadence post-run | psql before/after counts |

---

## 6. Workflow checkpoints

| Step | Owner | Deliverable |
|---|---|---|
| 1 | CC | This scope file (DONE — pending Langston ack) |
| 2 | CC | `B-NEW-33_PRE_AUDIT.md` with SIM consult + replay-ablation.ts file map |
| Langston review | Langston | Combined scope + pre-audit ACK (or REVISE) |
| 3 | CC | Implementation: `scripts/b-new-33-factor-backtest.ts`, optionally refactor `replay-ablation.ts` shared logic into `factor-replay-core.ts` |
| 4 | Langston | Code-diff review pre-push |
| 5 | CC | CI green check on `migration/aws-supabase` |
| 6 | CC | Deploy to staging via `npm run b-new-33:factor-backtest` (no PM2 restart needed — out-of-band) |
| 7 | CC | First-pass verification: run, collect output, check verification criteria |
| 8 | Langston | Step 8 independent review |
| 9 | CC + Langston | Iterate if needed |
| 10 | CC | Governance: BATCH_CATALOG + PHASE_HISTORY + CHANGES_AND_FIXES + MEMORY.md update + Langston Hetzner MEMORY mirror |
| 11 | CC | `B-NEW-33_COMPLETION_REPORT.md` + `B-NEW-33_VERDICTS.md` |
| Close | Kyle | Ack |

---

## 7. Risk + concerns flagged

- **Risk: alt-confidence-delta is degenerate for some levers.** If disabling lever X produces alt_confidence ≈ real_confidence for >95% of rows, the alternate tertile split collapses and predictive lift becomes uninformative. Mitigation: report the confidence-shift distribution per factor in the verdict block; flag any factor with `mean_abs_shift < 0.01` as "lever effectively dormant — alt-vs-real comparison degenerate."
- **Risk: replay backlog includes rows from before B82's asset-class fix (2026-05-14).** Rows 2026-05-11 → 2026-05-14 may have been mis-tagged crypto_spot when emitted from xstock VTS. Mitigation: cross-check with `vts_jsonl_signal_id` shape in replay_outcome metadata (rows from xstock pipeline have `vsig_p10_*` xstock-specific IDs); flag suspect rows in a "data hygiene" section of the report.
- **Risk: `paper_sim_trades` may not be the right canonical source.** Need to verify in pre-audit which table holds the actual closed VTS trade outcome P&L data (paper_sim_trades vs vts_open_trades-with-closed=true vs a separate B70 archive).
- **Risk: cron permanently restored as a side effect.** If the natural-key fix is applied to `replay-ablation.ts` itself (not just to the CLI tool), the nightly cron starts working again. This is GOOD but means there's an interaction surface — pre-audit must spell out whether the cron fix is bundled in this batch or left as a follow-up.

---

## 8. Questions for Langston

1. Should the replay-source fix be applied to BOTH the CLI tool AND `replay-ablation.ts` (cron)? Or keep the cron untouched in this batch and let it stay broken until a future B-NEW-XX restoration batch?
2. Decision-grade gate parameters — are n≥150 / spread≥7pp / p<0.05 the right thresholds, or has the design discussion converged on different values? (Memory says these from a prior round, want to confirm.)
3. P-value test choice: Fisher's exact / chi-square / binomial — does the cc-inbox history have a preference?
4. Output venue: CLI Markdown to stdout + file? Or extend the existing `/api/analytics/factor-calibration` endpoint with a `?detail=verdicts` parameter and surface in the UI? CC proposes the former (one-shot calibration analysis, not ongoing UI surface).
5. Wider time window for natural-key (±5min) — too generous, just right, or too narrow given some signals are queued?
