# Batch 65.3 — Adaptive Sizing (Scope Stub)

**Status:** Stub. Not started. Preconditions pending.
**System phase:** 15c (or later depending on when queued).
**Prereq:** B65.2 functional close confirmed — trailing exits verified working in VTS AND Langston Step-8 sign-off.

---

## 1. Purpose

Reactivate the dormant **adaptive sizing** feature that was built in Phase 11 (`updateAdaptiveSize` in the now-deleted `execution-controller.ts`) but never connected. The intent: **resize an open position mid-trade based on how the underlying thesis is evolving.** Reinforced thesis → expand position (capture more upside). Weakened thesis → contract position (cut loss on a deteriorating trade before it hits the stop).

The Phase-11 implementation expected a boolean `trendline.reinforced` / `trendline.weakened` feedback signal per open trade. Nothing ever produced that signal, which is why the feature was dormant. Picking the right input is the hard part of this batch — the sizing math is trivial by comparison.

---

## 2. Operating-mode context

Goal is the same as B65.2: working end-to-end in both the simulated (VTS passive learning) and paper-active-trading paths. Observable in VTS. Also: coexists cleanly with the trailing-exit engine — an open trade can have both its stop ratcheting AND its size expanding/contracting simultaneously.

---

## 3. Key design decisions (per Langston Q2 sign-off)

### 3.1 Signal source: DBS delta

The "reinforced vs weakened" signal is driven by **change in the pair's Directional Bias Score (DBS) since trade open**.

- At trade-open, snapshot `dbsScore` onto the open-trade record (VTS in-memory; paper metadata jsonb).
- Every exit-check cycle, compute `deltaDBS = currentDBS - dbsAtOpen`.
- Thresholds (all tunable via `module_constants` under a new `adaptive_sizing` module):
  - `reinforced_delta_threshold` (default `+0.15`) — DBS strengthened by at least this much in the trade's direction → expand.
  - `weakened_delta_threshold` (default `-0.15`) — DBS weakened or reversed by at least this much → contract.
  - Between the two → no change.

**Why DBS delta over alternatives:**
- **Regime stability:** tempting but too slow — regimes persist for many cycles, so delta is near-zero most of the time.
- **Fresh trendline service:** requires building new infrastructure. DBS is already computed.
- **Multi-TF alignment:** Phase 3 external-data territory (B67), not ready as a dependency.
- **DBS delta** is computed every MCE cycle, already validated in B62 as predictive, and cheap to read per open trade.

### 3.2 Resize magnitude

Match the Phase-11 defaults seeded into the deleted `EXECUTION_CONFIG`: **+10% on reinforced, −10% on weakened**. Tunable via `module_constants.adaptive_sizing.expand_factor = 1.10` and `contract_factor = 0.90`.

### 3.3 Resize cadence — rate-limiting

Without a cap, a DBS that oscillates above/below threshold will thrash the position size (buy, sell, buy, sell…) and bleed fees on every flip. Three guards:

1. **Per-trade resize cap** — `max_resizes_per_trade = 3` (tunable). Limits total number of resizes in a trade's life.
2. **Minimum time between resizes** — `resize_cooldown_ms = 3600000` (1h default). Prevents thrash inside a short window.
3. **Hysteresis** — once expanded, a trade must see DBS drop below a `reinforced_clear_threshold` (e.g. `+0.05`) before it becomes eligible to expand again. Same for contract. Prevents oscillation right at the threshold.

### 3.4 Execution mechanics

- **Expand:** market buy of an additional `baseQuantity × (expand_factor - 1)` units. Add cost basis proportionally. Fees + slippage applied.
- **Contract:** market sell of `baseQuantity × (1 - contract_factor)` units. Realize partial P&L on that slice. Fees + slippage applied.
- Paper: `updatePaperSimOpenPosition` with new quantity. Live: Kraken partial order.

### 3.5 Qualifier gate — not every trade

Adaptive sizing only engages for strategies where DBS is a first-class input — i.e. the same family as the moonbag qualifier from B65.2 (`strong_bull_trend`, `sma_trend_ride`, `vwap_pullback` in `quant-strong_trend` pool, `breakout`). Strategies that don't use DBS get no resize. New `module_constants.adaptive_sizing.qualifying_strategies` row.

---

## 4. Tests

- Unit: signal delta crosses threshold → expand decision. Inverse for contract. Hysteresis blocks re-flip.
- Unit: cooldown blocks resize inside window.
- Unit: per-trade cap blocks 4th resize.
- Integration: simulate a trade whose DBS rises then falls through thresholds — verify sequence of expand / hold / contract + correct quantity at each stage.
- End-to-end: VTS trade on a qualifying strategy with a price path that moves DBS above the reinforced threshold — confirm position size increases AND closed-trade record captures the resize history.

---

## 5. Governance (same Tier 1+2 set as B65.2)

SIM + System Manual get updates for the new adaptive-sizing flow. `adaptive_sizing` module added to `module_constants` seeds.

---

## 6. Open questions for Step 1 scope write

- Should the reinforced/weakened signal use RAW DBS score or smoothed DBS (e.g. 3-cycle EMA)? Raw is more reactive but noisier. Smoothed is steadier but lags.
- Is the resize applied on the DB quantity field, or do we track a `scaledQuantity` separately and keep `baseQuantity` immutable for P&L reconciliation? Probably the latter for auditability.
- Interaction with break-even lock: if position has already hit break-even and we then contract it, does the net-breakeven floor recompute on the smaller position, or stay pinned to the original entry? Open.
- Interaction with moonbag: adaptive sizing should presumably freeze once a trade enters TRAILING_TAKE (the trailing stop is already handling risk from that point). Confirm with Langston.

---

## 7. When to start

- B65.2 observation window must close green (trailing_stop_hit or TRAILING_TAKE observed in VTS).
- Langston Step-8 on B65.2 complete.
- Kyle confirms he wants this done before B66 (vs. pushing it further out).

Until those are all true, this stub stays here as a reminder and a decision record.
