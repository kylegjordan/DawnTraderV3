# BATCH 65.4.1 Hotfix — Rung Floor Slippage Buffer

**Status:** ✅ SHIPPED 2026-04-26
**Batch type:** Hotfix on top of B65.4 ladder trailing model.
**Trigger:** Counterfactual analysis (`B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md`) showed the original cost-aware floor formula was destroying ~$11 of profit across the first 5 closed laddered VTS trades vs. just-take-target counterfactual. Kyle directive 2026-04-26 to ship the fix immediately and put a slippage-buffer multiplier into `module_constants` for future tunability.
**Reference:** `B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md` (the full data trail), `B65_4_FINDINGS_PAPER.md` (B65.4 context).

---

## 1. The change in one paragraph

Original B65.4 rung floor formula (in `cost-model.ts:computeNetTargetFloor`) returned `target × (1 − totalCost/2)` — a "breakeven-after-costs" floor that sat BELOW the just-hit target. On price reversal off target, this allowed the trade to exit BELOW the original target value. Across the first 5 closed laddered trades the ladder lost ~$11 in absolute terms vs the just-take-target counterfactual.

Hotfix replaces the formula with `target × (1 + slippage × bufferMultiplier)` — a slippage-aware floor that sits ABOVE the just-hit target by exactly enough to absorb stop-trigger slippage on a reversal. Net effect: actual fill on a stop-out is at-or-above the original target value. Multi-rung ratcheting still works as before.

Buffer multiplier is exposed as a `module_constants` entry (`rung_floor_slippage_buffer_multiplier`, seed 1.0) so it can be tuned per (asset_class, exchange, regime, strategy) without code redeploy.

---

## 2. Files changed

| File | Change |
|---|---|
| `server/core/math/cost-model.ts:139-180` | `computeNetTargetFloor` formula updated to slippage-buffer model. Function signature now takes optional `slippageBufferMultiplier` (default 1.0). |
| `server/services/trailing-exit-controller.ts:53-74` | `TrailingExitConfig` + `TEC_DEFAULTS` extended with `rungFloorSlippageBufferMultiplier`. |
| `server/services/trailing-exit-controller.ts:96-106` | `resolveTECConfig` now reads `rung_floor_slippage_buffer_multiplier` from `module_constants`. |
| `server/services/trailing-exit-controller.ts:393-402` | `updatePosition` resolves the multiplier per-cycle from cached config and passes it to `computeNetTargetFloor`. |
| `server/services/trailing-exit-controller.ts:478-481` | Inside the rung-ratchet loop, `hitFloor` calculation also uses the multiplier. |
| `server/tests/integration/net_expectancy.test.ts:111+` | Tests updated to assert floor is ABOVE target (was: BELOW). New test for custom multiplier. |
| `server/tests/unit/trailing-exit.test.ts:144` | Test assertion updated: `newStopPrice >= 110` (was: `>= 109`). |
| `drizzle/migrations/2026-04-26-b65-4-1-rung-floor-buffer-seed.sql` | New seed migration for the multiplier `module_constants` row. |
| `drizzle/migrations/2026-04-26-b65-4-1-rollback.sql` | Rollback for the seed migration. |

---

## 3. Verification

### 3.1 Verification expectation (post-deploy)

Once deployed, the next laddered trade should show:

- `[9.2][LADDER] {symbol} rung=1 ... new_floor=X` where `X > target` by approximately `target × slippage`
- `[9.2][EXIT] {symbol} trailing rung=1: ... rungFloor=X (rungFloor=X, nextTarget=Y)` continues to log rungFloor consistently above the just-hit target

### 3.2 Live verification target

Run the counterfactual analysis (see §5 for instructions) after at least 5 new laddered trades have closed under the hotfix. Compare aggregate `Ladder Δ` against the pre-hotfix sample (which was −$11.13 across 5 trades). Expected behavior under the hotfix:

- Single-rung-then-reverse trades exit ≈ at the just-hit target (vs below it under the original)
- Multi-rung trades retain incremental gains (no regression on the design's payoff scenario)
- Aggregate `Ladder Δ` should be at-or-above zero rather than the −$11 the prior sample showed

### 3.3 Phase 19.4.5 observational gate (item 7)

This hotfix narrows the question for Phase 19.4.5 item 7. The decision after observation period is no longer "fix the formula or retire the ladder" but "tune the multiplier or retire the ladder." If even the slippage-buffer formula doesn't deliver positive net contribution at active-trading scale, the ladder design itself is what needs revisiting.

---

## 4. Workflow notes

- **Hotfix ship pattern:** code change → tests updated → migration written → governance updated → push. No Step-1 / Step-4 Langston review pre-push because Kyle directive was to "proceed straight away." Langston gets a post-push heads-up with the change description so he can review at his pace and flag concerns.
- **Module_constants infrastructure paid off here.** The buffer multiplier landing as a DB-tunable value means future calibration (Phase 19.4.5 may decide multiplier should be 0.7 or 1.5) doesn't require code redeploy — just a DB update. This is exactly the lever-tunability principle B72 will sweep at scale.
- **Test mock in `b65-tec-parity.test.ts` already returned `target` for `computeNetTargetFloor`** so existing test cases still work (zero slippage → floor = target unchanged). Only the integration test that explicitly asserted `floor < target` needed updating, plus the trailing-exit unit test threshold.

---

## 5. ⭐ Reporting instructions — how to re-run the counterfactual analysis ad hoc

Kyle directive 2026-04-26: this analysis should be runnable on demand to monitor whether the ladder is actually adding net profit over time. Scripts and cohort-pull pattern preserved here for that purpose.

### 5.1 What the analysis asks

For each laddered VTS trade (closed trade with `ladderRungsHit > 0`):

- What was the actual net PnL %?
- What WOULD the net PnL % have been if we had simply exited at the original target price (the counterfactual)?
- The difference between actual and counterfactual = the ladder's true contribution.

Aggregate the contribution across the laddered-trade cohort to see if the ladder is adding or subtracting value on net.

### 5.2 How to run it

**Step 1: pull a fresh closed-trades CSV.** Login to the staging UI's Machine Learning page (or the relevant export endpoint) and download `vts_closed_trades_Nd_YYYY-MM-DD.csv` for the desired window (typically 7 days). Save to `Downloads/`.

**Step 2: run the awk extract for laddered trades.** Quick check:

```bash
awk -F',' 'NR > 1 && $37 > 0 {print $1, $14, "rungs="$37, "PnL="$19"%"}' "C:/Users/kyleg/Downloads/vts_closed_trades_Nd_YYYY-MM-DD.csv"
```

Column 37 is `ladderRungsHit`; column 19 is `netProfitPercent`; column 14 is `resultType`. This gives the same shape as the original sample table.

**Step 3: cross-reference with PM2 logs for the original target / final stop / final rung target.** On staging:

```bash
ssh root@188.245.193.8 "grep -E 'PAIR' /var/log/dawntrader/out.log | grep -E '11.8C\\[Entry\\]|11.6\\[Exit\\]|LADDER' | tail -20"
```

Replace `PAIR` with the symbol of interest. Pull these for each laddered trade in the cohort.

**Step 4: compute the counterfactual.** For each trade:

- gross_at_target_pct = (target - entry) / entry × 100
- cost_pct = costs / dollarValue × 100  (both in CSV)
- counterfactual_net_pct = gross_at_target_pct - cost_pct
- ladder_delta_pct = actual_net_pct - counterfactual_net_pct
- ladder_delta_dollar = ladder_delta_pct × dollarValue / 100

**Step 5: aggregate.** Sum `ladder_delta_dollar` across all laddered trades. If positive, ladder is adding net value. If near zero, ladder is breakeven. If negative, ladder is destroying value.

### 5.3 Reference template

Format used for the original 2026-04-26 analysis:

```
| Pair | Entry | Orig Stop | Orig Target | Final Stop (exit) | Final Rung Target | Rungs | Actual Net | Counterfactual @ Orig Target | Ladder Δ |
```

The full original analysis is at `Claude Comms and Packages/Scope Files/B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md`. Keep that template — it's the right shape for periodic re-runs.

### 5.4 When to re-run

- Recommended cadence: **weekly during Phase 19 paper observation** to track Phase 19.4.5 item 7 observation
- Earlier than weekly if a single laddered trade shows extreme behavior (e.g., closes at < −5% having ratcheted past target, which is the canonical failure mode of the original formula)
- Once the active-trading paper mode is running steadily, expand the cohort to include paper trades, not just VTS

### 5.5 Tooling owners

The original analysis was done with grep + awk + manual computation. Acceptable for n=5 but doesn't scale to n=100. When the cohort grows past n=30, refactor to a small Python/SQL script that joins the closed-trades CSV with PM2 LADDER events and produces the table automatically. This becomes a small follow-up batch (or scope expansion of Phase 18.5's observability work).

---

## 6. Governance documents touched

**Tier 1:**
- `BATCH_CATALOG.md` — B65.4.1 hotfix row added
- `MEMORY.md` — hotfix shipped + reporting instructions reference
- This completion report
- `B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md` (already written)

**Tier 2:**
- `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 7 — note that the hotfix narrows the gate from "fix the formula or retire" to "tune the multiplier or retire"
- `INDEPENDENT_VTS_DATA_FEED_FEASIBILITY.md` — updated coverage to combined Binance + Coinbase + KuCoin = ~95%

---

*B65.4.1 shipped 2026-04-26 same-day as the counterfactual analysis that triggered it. Reporting instructions preserved here for future ad-hoc runs.*
