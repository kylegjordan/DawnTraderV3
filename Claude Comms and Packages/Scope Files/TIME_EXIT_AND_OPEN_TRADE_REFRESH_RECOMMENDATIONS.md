# Recommendations — Max-Hold Time-Exit + Open-Trade Signal Refresh

**Author:** CC-B (NEW Claude) · **Date:** 2026-07-21 · **Requested by:** Kyle (research + recommend, DO NOT implement)
**Grounding:** measured on live `closed_trades` + `active_open_positions`; external practice researched; roadmap consulted. Related ledger: `#550` (max-hold carry), `#551` (open-trade dynamic management), `#548` (mark trust).

> ⚠️ **DATA CONFOUND stated up front:** the soak sample (n≈152 real-fill closes) mixes EXPLORATION admits with organic selections and carries the known fee drag → the whole sample is net-negative for reasons unrelated to holding time (#547 CR-5). So every P/L *magnitude* below is unreliable; the *directional shape* is what survives. Nothing here should set a final numeric knob — that is Phase-25 calibration on clean data. This is a recommendation on DIRECTION + SEQUENCING, not final values.

---

## Q1 — What's already in my queue (besides tonight's new points)

Active/owned: **P19-B8.5e** (per-symbol mark staleness + LULD plausibility — Step-2 pre-audit underway, Langston-approved) · **#547 CR-3 floorPct decouple** (Langston-approved "go") · **P19-B8.5f** (#549 open-trades field population — deferred behind B8.5e) · **P19-B8.5g** (#550 max-hold carry — the fix that makes a time-exit *able* to fire). Tonight's two research questions (#550-value, #551) are additive to these.

## Q2 — Time frame of our trades + should there be a max-hold?

### Measured (real-fill closes, target_hit + stop_hit only)
| | median | p90 | max |
|---|---|---|---|
| crypto resolve time | ~6.2-6.7h | ~18-20h | ~64h |
| xStock resolve time | ~6.4-7.6h | ~15-20h | ~65h |

**Winners and losers resolve in about the SAME time** (median ~6-7h both). So there is no "winners resolve fast, cut the slow ones as losers" clean separation on median alone.

### The staleness curve — win-rate + avg P/L by hold bucket (the decision-relevant measurement)
| bucket | n | win% | avg net P/L |
|---|---|---|---|
| **< 3h** | 38 | 36.8% | **+0.27 (only positive bucket)** |
| 3-6h | 33 | 36.4% | −1.67 |
| 6-12h | 44 | 45.5% | −0.95 |
| 12-24h | 25 | **24.0% (worst)** | **−2.18 (worst)** |
| > 24h | 12 | 50.0% | −1.08 *(n too small)* |

**The only profitable holding bucket is < 3h; everything held longer bleeds, worst at 12-24h.** Direction matches the literature (time-exits cut prolonged exposure to reversals). ⚠️ Magnitude confounded (fees + exploration + small n) — do NOT read the dollar figures as truth.

### Recommendation Q2
1. **YES, a max-hold is warranted** — it is standard practice (the triple-barrier method = stop / target / **time**; we run 2 of 3), and our data shows the edge is concentrated early and the tail bleeds.
2. **Fix the carry NOW (Phase 19, #550/B8.5g)** so a time-exit *can* fire — that plumbing is broken today and positions have NO time bound right now (the 5-day USDC/CHF is the symptom). This is a mechanical fix, not a calibration.
3. **Set a CONSERVATIVE interim value, calibrate the real one in Phase 25.** Interim ~24h is defensible: it sits near p90 of resolution (so it cuts almost no winners) and flushes the dead tail. Do NOT tune tighter on this confounded sample — the 6-12h bucket has our *highest* win rate (45.5%), so an aggressive cut there could hurt. The precise value is a Phase-25 calibration on clean data.
4. **xStock weekend caveat:** the max-hold clock must pause across the weekend closure (S18) or a Friday position auto-closes Monday for no reason. Wire the pause, don't count closed-market hours.

## Q3 — Should we refresh the whole signal on open trades, not just price?

### What we have (verified)
The **TEC** (`trailing-exit-controller.ts`) already does PRICE-based dynamic management: trailing stop (ratchet up as price rises), break-even latch, target-lock, moonbag, cost-aware ratchet. **The gap = your exact point:** nothing re-derives stop/target from CURRENT regime/volatility while open — the entry-time levels are frozen even if the thesis has decayed.

### External practice (researched)
- Active open-trade management IS standard and professional — but **rule-based, never reactive**: move stops PROTECTIVELY (tighten/de-risk), do not loosen on hope, do not chase a fixed target around. "Constantly changing SL/TP without logic destroys consistency."
- **The disciplined way to "let a winner run" is NOT to re-price a fixed target** — it is a TRAILING mechanism (Chandelier Exit = 3×ATR below highest close is the professional standard) or **scaling out** (bank partial profit, let the rest run on a trailing stop).
- **Pareto fact that validates your instinct:** in trend trading the top ~10% of trades produce ~80% of profit; firms run 30-40% win rates on 3:1+ R:R. **Our measured win rate ≈ 37% sits exactly in that band** — so prematurely capping a winner at a fixed target is precisely how you kill the tail. Your "don't dismiss raising the target" instinct is theoretically sound; the *mechanism* is trailing / scale-out, not periodic fixed-target-moving.

### Recommendation Q3
1. **YES to a rule-based open-trade signal refresh — with a strict asymmetry.** The refresh may:
   - **EXIT** the trade when the entry thesis is invalidated (regime flips against the position) — highest-value, clearly disciplined.
   - **TIGHTEN** the stop / de-risk when volatility or regime deteriorates — protective, clearly disciplined.
   - **RELAX the trailing (let it run further)** when the refreshed signal confirms strength — this is your target-raise instinct, implemented as a *looser trail / scale-out*, NOT a re-priced fixed target. Allowed but gated on high confidence.
   - **NEVER** loosen a stop away from price on hope. That is the one hard prohibition.
2. **Frequency:** tie it to our horizon + the MCE cadence, not "constantly." Median resolution is ~6-7h and the MCE/regime updates every scan cycle (minutes). Re-evaluating an open trade **every RTB-refresh cycle (the cadence OLD Claude is building) or on a material regime/vol CHANGE event** is the right granularity — frequent enough to catch a 20-minute thesis change (your example), not so continuous it thrashes. Event-driven (on regime/vol change) is cleaner than a fixed timer.
3. **Reuse, don't rebuild:** OLD Claude is building the MCE-refresh pipe for QUEUED signals (B-REGIME-INPUTS-LIVE). The open-trade refresh is the same computation applied to open positions — extend that substrate, do not stand up a parallel one.

## ★★ KYLE'S REFINEMENT (2026-07-21) — THE REFRESH RESETS THE STALENESS CLOCK; Q2 AND Q3 ARE COUPLED, NOT INDEPENDENT

Kyle's insight: **the <3h "edge lives early, everything later bleeds" curve was measured on a system with NO signal refresh — trades ran on frozen entry-time information.** If we refresh the underlying signal and re-derive stop/target to current reality, an open trade is **fresh by construction** — it is no longer chasing a target set on 3-hour-old truth. So the 3-hour decay may NOT apply to a refreshed trade the way it applies to a frozen one.

**Consequence for the recommendations:** the max-hold (Q2) and the refresh (Q3) are **complementary, not alternatives**:
- **Without refresh** (today): the max-hold is the PRIMARY staleness control — it caps the frozen-signal decay, and the measured curve says cut the tail.
- **With refresh** (the target design): the refresh keeps the trade CURRENT, so the time-limit demotes to a **safety backstop** (max exposure / capital-recycling cap), NOT the main staleness mechanism. A refreshed trade that *stays* thesis-valid can legitimately hold LONGER than 3h — the refresh is what earns it the right to.
- ⚠️ **Empirical test this creates for Phase 25:** once the refresh is live, RE-MEASURE the staleness curve on REFRESHED trades. If the <3h-only-profitable shape flattens (edge persists past 3h on refreshed trades), that is the refresh *working* and the max-hold can widen. If it does NOT flatten, the refresh is not adding value and the tight time-limit stands. **This is the clean calibration experiment — and it can only run after the refresh mechanism exists.** It is the single strongest argument for building the refresh mechanism (Phase 20) and calibrating BOTH together (Phase 25), rather than setting a hard max-hold value now on frozen-signal data.

## Q4 — When (roadmap)

Run order (POST_AUDIT_ROADMAP §2): **Phase 19 (paper audit/debug, NOW) → Phase 25 (calibration with evidence) → Phase 16+20 (cleanup/hardening) → Phase 21 (live).**

- **Phase 19 (now):** the **#550 carry fix** (mechanical — a time-exit must be *able* to fire) + a conservative interim max-hold value. Nothing else here is a Phase-19 blocker (paper-active turns ON without dynamic management).
- **Phase 25 (calibration):** this is the natural home for BOTH the **max-hold VALUE calibration** and the **open-trade signal-refresh design + cadence + target-management rules** — they are calibration questions by nature, needing clean paper wins/losses (exactly Phase-25's purpose). The confound in this very analysis is the argument for waiting for clean data.
- **The refresh MECHANISM** (extending the MCE-refresh to open trades) can be *scoped* at the Phase-19→25 boundary once OLD Claude's architecture lands, then *calibrated* in Phase 25.

**Net timing recommendation:** carry-fix now (Phase 19); value + full dynamic-management design + calibration in Phase 25; mechanism reuses OLD Claude's refresh substrate. Do not build the dynamic management in Phase 19 — it is not required to turn paper-active on, its values need calibration data, and its prerequisites (#548 mark trust, #550 time-exit) land first.

---

**Sources:** quantifiedstrategies (triple-barrier / time-exit) · optimusfutures (position management) · luxalgo (ATR dynamic stops) · trendfollowing / graham capital (Pareto, let-winners-run, Chandelier) · López de Prado triple-barrier framework.
