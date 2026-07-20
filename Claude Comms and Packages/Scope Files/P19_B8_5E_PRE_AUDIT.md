# P19-B8.5e — PRE-AUDIT (Step 2, COMPLETE)

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

## 3. Step-2 RESOLUTIONS (design decisions for Langston's Step-2 review)

1. **Budget-from-risk-to-stop + OBJ-4 (Langston carry #1).** Feasibility confirmed (§2b). Design: `budget = k × (remaining risk-to-stop)`, remaining-risk = `|currentPrice − stopLoss| / currentPrice`, `k` a DB-governed fraction (<1). Near-stop ⇒ small budget ⇒ tight window (the dangerous case gets the least tolerance) — OBJ-4 solved in the same knob. Null-stop ⇒ fail-closed to a conservative fixed budget, never fail-open. The escalation-on-failure (OBJ-4's open behavioural question) stays the existing skip-and-continue rail for now; Step-3 decides whether repeated refusal escalates harder — the one genuinely-open choice, NOT designed past.
2. **σ + knobs as `module_constants` (Langston carry #2).** Proposed module `mark_staleness`, keys: `budget_k`, `null_stop_budget_pct`, `floor_ms` (15000), `cap_ms` (300000), `sigma_min_observations` (earn-your-own-σ threshold), `sigma_classwide_percentile` (conservative inherited σ, ~p90 across class). All fail-closed via `getCachedNumberRequired` (boot-hard-fail on missing rows). Named, not hardcoded.
3. **★ LULD tier source (OBJ-3) — REUSE the existing universe machinery.** There is already a DB-backed, cron-refreshed `xstock_spot_universe` (`universe-service.ts` + `xstock-universe-cron.ts`, file-cache + bootstrap fallbacks) — columns: symbol/name/sector/crypto_adjacent/adr/source_chain/is_delisted/timestamps, NO tier field yet. **Add a `luld_tier` column** (or sibling mapping table) populated from a **seeded S&P 500 / Russell 1000 membership list refreshed on a schedule aligned to quarterly index reconstitution** (named source = a committed data file or DB table, NOT a TS hardcode). **UNKNOWN/unmapped ⇒ TIER 2 (wider, safer band)** — a stale membership file mis-tiers only toward caution. 
4. **S21 reconciliation — RESOLVED (§2b):** share the per-symbol tick-age SOURCE (`getLatestEquityTick` age); two independent decision layers (class feed-alarm vs single-position exit gate). No merge; name the shared source.
5. **System Manual (Step-10):** exit-path chapter (staleness guard + plausibility band) + friction/staleness math. SIM: the new `mark-staleness` component + its touch on S18/S20/S21/S22. ADJUSTMENT_FRAMEWORK: `mark_staleness` module + refresh cadence + `luld_tier` refresh.

**Step-2 STATUS: pre-audit COMPLETE — ready for Langston's Step-2 review before Step-3 implementation.**

## 4. Governance applicability (Step-2 confirms)
`SYSTEM_MANUAL` (exit-path behaviour + a new gate) · `SYSTEM_IMPACT_MAP` (new component + it touches S18/S20/S21/S22) · `ADJUSTMENT_FRAMEWORK` (DB-governed per-symbol params) · `CHANGES_AND_FIXES` · `RUNNING_ISSUES` #548 — all APPLICABLE.
