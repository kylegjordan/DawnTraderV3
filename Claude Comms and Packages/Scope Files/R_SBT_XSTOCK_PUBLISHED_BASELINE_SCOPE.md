# Strong Bull Trend xStock published baseline

**2026-11-26 · Step 1 draft · R-SBT-XSTOCK-PUBLISHED-BASELINE (KD-73)**

change-class: non_architecture

This research sits within the [Target Geometry Study Plan](TARGET_GEOMETRY_STUDY_PLAN.md). It supplies the Strong Bull Trend xStock prerequisite for sprint row 129 / roadmap 25-17 and for any change to the strategy's xStock reward-to-risk floor under row 131 / roadmap 25-20. NEW records the current mechanism and integrates the reviewed result. ANALYST owns the comparison with published practice and DawnTrader's observed results. Coltrane reviews transferability.

## 1. Establish the current Strong Bull Trend xStock baseline

The staging read at 16:21:28.869092 UTC on November 26, under `dt_reader`, enumerated matching wildcard and class/strategy settings across exchange and regime scopes. The strategy was enabled for xStock. The xStock strategy overrides were a 1.95 reward-to-risk floor and 6.5 ATR reach ceiling, against xStock class defaults of 2.0 and 4.0. Both xStock overrides were seeded on September 20. The crypto strategy's 1.95 row comes from a separate June seed and provides a class control. The detector settings were a six-bar lookback, 0.15 ATR breakout buffer, 1.5 ATR anti-exhaustion limit, 3 ATR stop, 6 ATR target and 0.35 DBS minimum.

The [System Impact Map](../../1-system-manual/SYSTEM_IMPACT_MAP.md) describes the Strong Bull Trend routing and xStock target-gate scope. The [System Manual](../../1-system-manual/SYSTEM_MANUAL.md) describes the gate's role in evaluating reward-to-risk and target distance. At serving ref `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`, `server/strategies/strong-bull-trend.ts` computes the detector's native stop and target from the breakout bar. `server/core/calculations/expectancy.ts` resolves the scoped target-gate settings. The September geometry migration in `drizzle/migrations/2026-09-21-b-reach-baseline-adjust-geometry-baseline.sql` records the xStock overrides.

The provenance read covered the [Batch Catalog](../../1-system-manual/BATCH_CATALOG.md), [Running Issues](../../1-system-manual/RUNNING_ISSUES.md), [Batch 63 Completion Report](../Batch%20Completion/BATCH_63_COMPLETION_REPORT.md) and the introducing change. The introduction at `b7d4e0f82d98ed11a58feb299b8c3729b905cc21` specified:

> New strong_bull_trend strategy (QUANT): N=12 Donchian breakout + 0.15xATR buffer +
> DBS slope rising + anti-exhaustion (body <= 1.5xATR) + 3xATR stop + 6xATR target.

The original intent remains relevant and correct for this scope. The strategy identifies long breakouts in the DBS-routed strong-trend lane. The current detector uses the six-bar lookback and no slope-rising gate. The target gate applies the current scoped floors and ceilings to proposed trade geometry. The comparison must distinguish the detector's nominal 2:1 geometry from the reward-to-risk at an executable entry after costs.

**Verification.** Resolve the strategy rows against the xStock class defaults, check the separate crypto control, and reproduce the mechanism at the pinned source. Identify the applicable effective settings, priced entry and decision path for the empirical sample.

## 2. Compare published practice with DawnTrader paper evidence

Retain the [Silent Strategy Census Progress Report](../Batch%20Completion/B_SILENT_STRATEGY_CENSUS_PROGRESS_REPORT.md) §3a.5 as a dated comparison point. Its registered first 20 Strong Bull Trend paper xStock filled closes began with the November 7 13:20:59 UTC opened-at fence and ended with XLE/USD on November 12 at 14:43:14.634 UTC. Four of 20 were winners, with 11 classified as taker and nine as maker. Mean net return was −0.561800% per filled close and failed the registered non-negative-mean criterion. KD-76 retained the enabled setting. Before closing the KD-73 verdict, identify the governing clean post-Entry Gate observation record and verify its terminal or insufficient-evidence disposition.

**Verification.** ANALYST records each reputable source's population, 15-minute decision timeframe, holding horizon and cost assumptions. Compare each with DawnTrader's observed fees, executable spread, volatility, balance, position size and slot constraints. Record the empirical cohort's fence and any gaps in comparability. Use the existing August Target Geometry Study Plan as context for the narrower comparison.

## 3. Integrate the reviewed transferability result

**Verification.** Record Coltrane's ruling on a bounded starting range with a pre-stated falsifier, or on a conclusion of not transferable or insufficient evidence. Apply the ruling to the named prerequisites in rows 129 and 131. The scope covers documentation and read-only evidence. Strategy settings, deployment and the sequence of the other O3 candidates remain governed by their existing decisions.
