# P19-B8.5e — PRE-AUDIT (Step 2, IN PROGRESS)

**Batch:** `P19-B8.5e` (risk-derived per-symbol mark staleness + LULD plausibility) · **Ledger:** `#548` (+ addenda 1/2) · **Owner:** CC-B
**Step-1:** APPROVED by Langston (proceed to Step-2) with two carries: **budget must derive from the position's remaining risk-to-stop, decided WITH OBJ-4, not a flat 1% global**; and **OBJ-2's min-observation threshold + class-wide σ percentile land as DB-governed params (ADJUSTMENT_FRAMEWORK), not hardcodes.**
**Status:** partial — SIM per-component read done; code-path trace done; the fee/exit-path deep read + the ADJUSTMENT_FRAMEWORK precedence spec remain.

---

## 1. Current staleness guard — the exact code B8.5e replaces (verified at code)

`server/services/active-execution-engine.ts:933-963`, xStock equities exit branch:
```
_eqTick        = getLatestEquityTick(position.symbol)
_eqMaxAgeMs    = getCachedNumberRequired('exit_integrity','max_equity_tick_age_ms', {xstock_spot})   // ← ONE GLOBAL 90,000ms
  knob missing → _recordPriceSkip('equity_age_knob_missing'); continue   (fail-closed)
  tick missing → _recordPriceSkip('equity_tick_missing');    continue
  age > max    → _recordPriceSkip('equity_tick_stale');      continue     ← the mis-calibrated skip (#548)
  else         → currentPrice = _eqTick.price                              (drives SL/TP)
```
**B8.5e replaces the single `max_equity_tick_age_ms` read with the per-symbol `clamp(budget/σ_rate, floor, cap)` ceiling** and adds the LULD plausibility band before `currentPrice` is trusted. The skip-and-continue escalation rail (the `_recordPriceSkip … continue` pattern) is the existing OBJ-4 mechanism — the batch decides whether to keep it or escalate harder.

## 2. SIM cross-cutting-state interactions (mandatory Step-2 read — done)

**★ S21 — `FeedIntegrityMonitorService` (`feed-integrity-monitor.ts:97-101`) ALREADY GRADES PER-SYMBOL TICK-AGE.** The alarm was re-pointed (B6.7/#301) onto the primary `krakenWebSocketAdapter` per-symbol tick-age via `gradePerClassFeedLiveness` in `server/services/market-data/feed-health-aggregate.ts`. **⇒ ARCHITECTURAL FINDING: a per-symbol tick-age grader already exists.** B8.5e's per-symbol staleness ceiling MUST reconcile with it, not stand up a second parallel per-symbol age machine. Step-2 decision: does the new ceiling *consume* `feed-health-aggregate`'s per-symbol age, or is it a distinct exit-path concern (position-management vs feed-alarm)? They measure the same physical quantity (tick age) for two different purposes — name the boundary explicitly or we get two sources of "how stale is this symbol."

**★ S20 — `price-liveness._cache` (`xstock_spot/price-liveness.ts`) is the SIBLING gate.** The B6.6 price-discovery-liveness config already lives in the OPEN path, per-asset-class `xstock_spot`, **fail-closed** (missing config → `null` 5s-TTL → gate blocks). B8.5e's staleness ceiling is the same shape (a DB-governed open/exit-path gate) and must adopt the same fail-closed posture — a missing per-symbol σ or budget knob must BLOCK (skip), never default-open. Reuse the fail-closed pattern, don't reinvent it.

**★ S18 — xStock weekend pause (`xstockSpotScanner.isPaused`).** During the weekend closure the mark is *legitimately* stale for ~48h. The staleness ceiling must NOT fire escalation during a paused window — the skip is expected, not an alarm. Reconcile with the pause SSOT so the per-symbol ceiling's escalation rail is suppressed while `isPaused` (or the escalation counter resets across the pause), else B8.5e re-creates the weekend-alert noise #349/#531 addressed.

**★ Module-constants cache semantics (P19-B8.1, `111b9d349`).** B8.5e's new per-symbol params inherit swap-on-success + stale-while-revalidate + boot-hard-fail-on-zero-rows. The σ-percentile + min-observation-threshold + floor/cap knobs go in `module_constants` and get the same treatment: boot refuses to start on missing rows (no silent fallback, §5), a wedged refresher serves stale-but-logged. **This satisfies Langston's "DB-governed, not hardcodes" carry** — name the exact `module_constants` module + keys in Step-3.

**S22 — `active-funnel-tracker`.** Telemetry-only; a skip records via `_recordPriceSkip` which feeds the funnel's skip buckets. B8.5e changes WHICH skips fire (per-symbol vs global) but not the telemetry contract — confirm the new skip reasons get distinct reason-buckets so the #548 mis-calibration remains observable post-fix.

## 2b. Step-2 CONFIRMATIONS (verified at code 2026-07-20)

**★ Langston carry #1 (budget-from-risk-to-stop) is FEASIBLE — confirmed.** `active-execution-engine.ts:~1099` parses `const stopLoss = position.stopLoss ? parseFloat(position.stopLoss) : null` immediately after `currentPrice` is set and BEFORE the SL/TP evaluation — i.e. at the exact seam the staleness ceiling runs. So `budget = f(remaining risk-to-stop = |currentPrice − stopLoss| / currentPrice)` is computable in place; no new data plumbing. ⚠️ **`stopLoss` can be `null`** → the budget derivation MUST fail-closed to a conservative fixed budget for null-stop positions, never fail-open to a wide window.

**★ S21 reconciliation SHARPENED — they share the SOURCE, not the decision.** `gradePerClassFeedLiveness` returns `{ classes: ClassLivenessResult[]; overall: FeedAliveGrade }` — a per-**class** aggregate feed-alive alarm ("freshest-symbol age = min across the set; proportion fresh"), NOT a per-symbol per-position gate. ⇒ The clean boundary: **B8.5e and S21 both consume per-symbol tick-age as INPUT (the adapter / `getLatestEquityTick` age), but the grader grades a class aggregate for the feed alarm while B8.5e gates a single position's exit.** Not a duplication to collapse — a shared *age source* to name once, with two independent decision layers on top. This is a cleaner finding than §2's first-pass "reconcile with the grader."

## 3. Open Step-2 work (not yet done — resume here)

1. **Budget-from-risk-to-stop (Langston carry #1) + OBJ-4 together.** Trace how the exit branch knows the position's stop distance at mark time (`position.stopLoss` vs `currentPrice`), and design `budget = f(remaining risk-to-stop)` so a tight-stop name gets a tighter staleness window. This is the same tension as OBJ-4 (a stale mark on a near-stop position is the dangerous case) — one decision, not two.
2. **The σ source module + the min-observation threshold + class-wide percentile** as named `module_constants` keys (Langston carry #2). Enumerate the exact keys + fail-closed behaviour.
3. **LULD tier-membership source** (OBJ-3) — the named, scheduled refresh + fail-to-Tier-2. Where does the S&P500/Russell1000 list come from, and how is it refreshed without a hardcode that rots.
4. **The reconciliation decision on S21** — consume feed-health's per-symbol age, or keep the exit-path ceiling distinct with a named boundary.
5. System Manual content sites to update at Step-10 (exit-path chapter + the friction/staleness math).

## 4. Governance applicability (Step-2 confirms)
`SYSTEM_MANUAL` (exit-path behaviour + a new gate) · `SYSTEM_IMPACT_MAP` (new component + it touches S18/S20/S21/S22) · `ADJUSTMENT_FRAMEWORK` (DB-governed per-symbol params) · `CHANGES_AND_FIXES` · `RUNNING_ISSUES` #548 — all APPLICABLE.
