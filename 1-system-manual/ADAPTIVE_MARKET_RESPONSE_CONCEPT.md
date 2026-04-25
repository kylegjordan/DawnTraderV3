# Adaptive Market Response — Concept Document

**Status:** Concept. Not yet scoped or scheduled. Planned insertion point: Phase 19.5 (after Paper Mode Audit, before Production Hardening). May be deferred to post-launch based on paper-trading results.

**Author:** Claude Code, 2026-04-25
**Origin:** Distilled from the multi-batch conversation arc that started in the B59-B62 era when DBS was added as a first-class input to the regime classifier, formalized in `B63_STREAKINESS_ANALYSIS.md`, and clarified in the design discussion of 2026-04-24/25.

---

## 1. The picture in plain language

The trading system right now is a ship that sails at the same speed regardless of the weather. When the seas are calm and the wind is at our back, that's fine — we move along nicely. When the seas turn rough, we sail at the same speed and get knocked around — that's where the long losing streaks come from. When conditions are unusually favorable, we still sail at the same speed and miss the chance to capture extra profit while the wind is helping us.

What we want is a ship that reads the weather and adjusts how it sails:

- **Bad conditions:** slow down, smaller sails, take fewer trades, only the most reliable strategies allowed, or pull into harbor entirely.
- **Normal conditions:** sail as usual.
- **Good conditions:** open the throttle. More aggressive sizing on high-conviction setups, broader strategy roster, take advantage of the favorable wind.

Today the system has a partial version of the "bad conditions" half. It has nothing on the "good conditions" half. And the part that does exist almost never fires because the sensor it reads is too narrow.

This document describes what the full version looks like and how we get there.

---

## 2. What we have today

There is a mechanism in the code that maps the global market state to one of three driving modes. It's called the mode overlay (Directive 11.7S in code; you don't need to remember the directive number).

| Driving mode | When it activates today | What it does |
|---|---|---|
| Normal | Global market is "stable" | Full position size, normal stop and target distances, normal confidence bar, normal entry cadence |
| Defensive | Global market is "transitioning" | Cuts position size to 60%, widens stops slightly, pulls targets in, raises the confidence bar, slows entries |
| Survival | Global market is "unstable" | Cuts position size to 25%, widens stops more, pulls targets in further, raises the confidence bar high, doubles entry cooldowns |

Two important things about this:

- **It's only defensive.** There is no "good conditions" mode that does the opposite — increase size, broaden the strategy roster, accept slightly lower confidence on more trades because the wind is favorable.
- **It almost never fires.** The single sensor it reads is "is the global regime stable, transitioning, or unstable?" In our current environment that sensor reads "stable" almost all the time, even during the 60-trade losing streaks we observe in the VTS. So the overlay sits in Normal mode while the actual weather is bad, and the streaks happen.

This is the skeleton we're going to extend. It's not a new thing — we're upgrading what's already there.

---

## 3. The two halves of the full system

### 3.1 Detection — the weather report

Today the detection reads ONE thing. It needs to read several and combine them into a single weather classification.

The ingredients are all available in the system today; nothing new needs to be invented:

- **Regime state and how steady it has been.** If the regime has flipped three times in the last hour, that's a transition signal even if it currently reads stable.
- **Global DBS — direction and trend.** Is the directional bias score strengthening, weakening, or sitting still? A DBS that's been falling for two hours is a different weather pattern than one that's been climbing.
- **Realized expectancy versus predicted.** When recent trades have been paying out less than the math said they should, that's a signal that the kit's predictions are out of step with current market reality. That gap is itself a weather indicator — a leading signal that conditions have shifted.
- **Pair-level regime distribution.** If most pairs were in trend-friendly regimes an hour ago and now most are in transition or unstable, that's a coming-storm signal. The global aggregate may not have caught up yet.
- **Friction trend.** When spreads widen and slippage increases, conditions are getting harder. That shows up before P&L does.
- **External signals (later).** When B67 lands and we have BTC dominance, funding rates, dollar index data, those become additional weather inputs.

All these get combined into ONE classification: calm, choppy, or stormy. Or if a continuous score works better than three buckets, a number from 0 to 1. That's a tuning decision.

### 3.2 Response — the throttle and the steering

Today the response side has five dials: position size, stop distance, target distance, confidence floor, entry cooldown. These are the dials the existing mode overlay turns when it switches modes. They mostly already work; what's missing is:

- **Tunable values.** The dial settings (1.0/0.6/0.25 for size, etc.) are hardcoded today. They need to live in the `module_constants` database table so we can tune them without redeploying. This is part of the modularization work already in progress.
- **An offensive mode.** The current mode set has Normal/Defensive/Survival but no "Aggressive" or "Favorable" mode that pushes size and roster up when conditions are unusually good. That has to be added.
- **More dial options.** Beyond the existing five, we may want:
  - Strategy-specific allowance — block certain strategies entirely in stormy mode, allow extra strategies in favorable mode.
  - Source-pool allowance — restrict to high-conviction source pools in stormy weather, broaden in favorable.
  - Slot-count limits — cap the number of simultaneous open trades in stormy weather, raise the cap in favorable weather.
  - Hard pause — the "pull into harbor" option. In severe stormy weather, no new trades at all until the weather clears.

### 3.3 Calibration — using the data we already have

The hardest part of this whole system is figuring out what combination of weather inputs actually predicts outcomes. We don't want to guess at the thresholds.

The good news: we have months of VTS data sitting in the closed-trade logs. For each long streak (winners or losers) we can look back at what every weather indicator was reading at the time. The combinations that consistently preceded streaks become the detector's calibration. The combinations that consistently preceded calm periods become the calibration for normal mode. Combinations that preceded winning streaks become the calibration for the offensive mode.

This is a one-time calibration exercise that runs on existing data before the system goes live. After that, the detector reads the same indicator values continuously and fires the right mode.

**Important constraint Kyle raised:** once paper or live trading is on, the VTS stops generating fresh streaks for us to study. So the calibration is a pre-launch exercise. After that, the detector runs from inputs that are visible during active trading, and it doesn't depend on VTS being available.

---

## 4. Why the current trading system might not even need this

A reasonable case can be made that we don't actually need this layer pre-launch:

- The break-even lock already converts what would have been losses into near-breakeven exits. The 7-day post-B65.2 data shows this working (49 trades closed near breakeven, mean +$0.09).
- The ladder trailing exit (also in B65.2) captures additional upside past target on qualifying strategies.
- The signal quality engine (SQE) and ready-to-buy queue (RTBQ) filter trades aggressively in active trading. Many of the VTS trades that produced losing streaks would never have been admitted in active trading.
- Slot constraints in active trading naturally limit concurrent exposure during bad conditions.

If paper trading runs for several days after Phase 19 and the streak pattern doesn't materialize at meaningful magnitude, this whole framework can be deferred to post-launch where it joins the broader machine-learning rebuild (Phase 17.5 territory).

That's the decision we'd make at the end of paper trading.

---

## 5. Decision pathway

```
Phase 19 — Paper Trading Audit (several days of paper running)
      │
      ▼
[Are we seeing meaningful losing streaks in paper?]
      │
   ┌──┴──┐
   │     │
  YES    NO
   │     │
   ▼     ▼
Phase    Defer to post-launch
19.5     (folds into the larger
build    machine-learning rebuild
the      in Phase 17.5+)
adaptive
response
   │
   ▼
Phase 20 — Production hardening
   │
   ▼
Launch
```

The benefit of this pathway: we don't build something we may not need. The streak phenomenon is real in the VTS, but the VTS is permissive and the active-trading filters are strict. We have to actually observe whether the same streak pattern happens in paper before we know if the adaptive response matters at active-trading scale.

---

## 6. What we'd build, in order

Listing the work in the order it would happen if Phase 19.5 goes ahead:

### 6.1 Build the weather report

- Add a stability-signal aggregator service that reads the ingredients from §3.1 and produces a single classification (calm / choppy / stormy / favorable) plus a continuous confidence number.
- Wire each input from where it already lives:
  - Regime + how-long-in-state from the regime classifier
  - Global DBS + trend from the DBS store
  - Realized vs. predicted EV from the telemetry aggregator
  - Pair-level regime distribution from the pair regime cache
  - Friction trend from the cost cache
- Output is read by everything downstream in the response layer.

### 6.2 Add the offensive mode

- Extend the existing mode set with an Aggressive (or "Favorable") mode.
- Define the dial values for each existing dial in this mode (e.g., size 1.5×, target distance 1.2×, confidence floor lowered to 0.55, cooldown 0.7×).
- Map calm → Normal, choppy → Defensive, stormy → Survival, favorable → Aggressive.

### 6.3 Tunable response dials

- Promote the dial values from hardcoded to `module_constants` rows.
- This aligns with the modularization work already in progress.

### 6.4 New dial types

- Strategy/pool allowance lists per mode.
- Slot-count caps per mode.
- Hard-pause flag for severe stormy mode.

### 6.5 Calibrate from VTS data (one-time, pre-launch)

- Build a small analysis tool that walks the VTS closed-trade history.
- For each long streak (>= N consecutive winners or losers), capture all weather indicator values at the streak boundaries.
- Identify the combinations that consistently preceded each streak type.
- Set the detector's thresholds based on the identified combinations.
- Document the calibration method so it can be re-run with new data.

### 6.6 Verify in paper

- Restart paper with the adaptive response live.
- Watch for at least several days.
- Confirm that mode transitions actually fire when conditions warrant.
- Confirm that response actions actually reduce losing-streak length and capture more profit during favorable streaks.

---

## 7. What this is NOT

To prevent confusion with related work:

- **This is not Phase 17.5 (Smart Thermostat / ML-driven adjustment).** Phase 17.5 is the post-launch machine-learning version where the system figures out the dial values by itself. The work described here is the rules-based pre-launch version with operator-set thresholds. They're the same concept at two stages of sophistication.
- **This is not adaptive sizing of open positions.** That was a separate proposal (mid-trade resize based on signal strength) that was deferred to post-launch. The work here only adjusts behavior at trade ENTRY and at the system-wide configuration level — not mid-trade on positions that are already open.
- **This is not a new strategy.** The existing strategy roster is unchanged. This layer adjusts which existing strategies can fire and how aggressively, based on weather.
- **This is not new data infrastructure.** The ingredients all exist today. We're combining them, not collecting new ones (until B67 external data lands and adds optional ingredients).

---

## 8. Open questions for Phase 19.5 scoping

To answer when the batch is scoped (post Paper Mode Audit):

- Is the weather classification 4 buckets (calm/choppy/stormy/favorable) or a continuous score? Probably try both.
- What's the minimum dwell time before a mode change? We don't want the system flipping modes every 60 seconds.
- What's the recovery hysteresis? If we go from stormy to choppy, do we need extra evidence before flipping back to favorable?
- Does VTS keep running in paper mode for ongoing calibration data, or does it shut off entirely? Operational decision.
- How does the offensive mode interact with the SQE/RTBQ slot caps that already exist in active trading? Need to make sure we're not setting two systems against each other.
- Do we add machine-learning-light helpers (e.g., a small model that predicts streak likelihood from indicator values) or stay strictly rules-based?

---

## 9. Cross-references

- **Origin batch:** B62 (DBS-as-first-class-input integration) — the work that started this whole arc.
- **Streakiness analysis:** `Claude Comms and Packages/Scope Files/B63_STREAKINESS_ANALYSIS.md` — quantifies the streak phenomenon and identifies six concrete mechanisms that contribute to it.
- **Existing mode-overlay code:** `server/core/governance/strategy-modes.ts` — the skeleton we'll extend.
- **Tunable-constants infrastructure:** `server/services/module-constants-service.ts` (B65.1) — how the response dials become DB-tunable.
- **Phase 17.5 Smart Thermostat:** `1-system-manual/POST_AUDIT_ROADMAP.md` §17.5 — the ML-driven post-launch successor to this work.

---

*This is a concept document, not a scope or implementation plan. It defines the intent and the shape of the work. Detailed scoping happens at the start of Phase 19.5 if and when that phase is greenlit at the end of Phase 19.*

---

## 10. Canonical positive cases for the AMR detection signal (added 2026-04-26)

The following concrete events from VTS observation are canonical positive cases that any Phase 19.5 AMR detection-layer design must catch. If the detector cannot flag these in the first 30–60 minutes of the affected window, it is not detecting the phenomenon AMR is intended to address.

### 10.1 The 04-18 streakiness day (B63 origin)

- 70-loss streak documented in `Claude Comms and Packages/Scope Files/B63_STREAKINESS_ANALYSIS.md`
- Runs test z = −15.57, p < 10⁻⁵⁰
- 100% of affected trades classified as `globalRegime = TREND_FRIENDLY_STABLE` while the market disagreed catastrophically
- Existing mode overlay (Directive 11.7S) did not engage because its single stability sensor read TFS as stable

### 10.2 The 04-22 hostile-window day (B65.5 Phase A0 finding)

- 239 closed VTS trades system-wide, **18.8% WR overall** — every strategy struggled
- vwap_pullback-in-strong-trend-lane cohort: 26 trades, **1 winner / 25 losers**, sumNet −$1.01 — virtually all the cohort net loss for the entire 2026-04-21 → 2026-04-25 observation window came from this single day
- `strong_bull_trend` (lane-mate): 177 trades, 16.4% WR — same pain
- **100% of affected trades classified as `globalRegime = TREND_FRIENDLY_STABLE` while the market disagreed catastrophically** (identical pattern to 04-18)
- Existing mode overlay did not engage (same reason as 04-18)
- Source: `Claude Comms and Packages/Scope Files/B65_5_PHASE_A0_WINDOW_CONTROL.md`

### 10.3 Recurrence pattern (Langston cc-inbox #821, 2026-04-26)

**Two catastrophic days in a single ~5-day observation window, both with the same failure mode (globalRegime = TFS while the market disagreed catastrophically).** This is not a one-off anomaly. It is a recurring failure mode of the regime classifier in conjunction with the absence of a hostile-window response layer. The recurrence frequency means:

1. Per-strategy detector redesign is the wrong response — every strategy is affected, the failure is upstream.
2. The AMR detection layer is needed to identify these days in the first 30–60 minutes and throttle trading before the system runs hundreds of entries through the window.
3. The detection signal cannot rely solely on the existing `globalRegime` field — both cases were classified TFS by the existing classifier. A multi-input aggregator (per §6 of this document) is required.

### 10.4 Implications for Phase 19.5 detection-layer design

Section 6 of this document already specifies a multi-input aggregator reading regime state, global DBS, realized-vs-predicted EV gap, pair-level regime distribution, friction trend, and optional external signals (B67). The 04-18 + 04-22 evidence raises two design questions for the Phase 19.5 scope:

1. **How fast does the aggregator need to identify a hostile day?** 30–60 minutes from market open is the implied target; if the detection lags until end-of-day, the throttling window has already passed.
2. **What is the false-positive cost?** Throttling on a day that turns out to be normal is a missed-opportunity cost; missing a hostile day is the cost being paid in the 04-18 / 04-22 events. The threshold balance is part of the calibration step (§19.5.4).
