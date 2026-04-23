# B63 Item 19 — Classifier Cadence & Latency Audit Brief

**Owner:** Langston (Opus 4.6)
**Author:** Claude Code (this brief), Kyle as authorizing stakeholder
**Date issued:** 2026-04-22
**Deliverable target:** `Claude Comms and Packages/Scope Files/B63_ITEM19_CADENCE_LATENCY_AUDIT.md`
**Honesty rule:** BOOTSTRAP.md §PRIME INVARIANT + SOUL.md §Task Completion Honesty apply throughout.

## Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** All findings must be framed as "VTS-mode observations, preparation for Phase 19 paper mode." Do NOT recommend immediate code changes — the observation window runs through 2026-04-28 and the open book is resolving.

## 1. Purpose

The regime classifier, DBS scoring, and strategy-signal pipeline all adapt to changing market conditions at different speeds. If the cadence is too slow, the system reacts late to regime shifts. If too fast, it whipsaws on noise. If the cadences are uncoordinated, a downstream consumer may read a freshly-updated input paired with a stale peer input, producing silently-wrong decisions.

**The question Item 19 answers: does every adaptive component in the classifier/scoring pipeline update at an appropriate cadence, and does full-loop latency — from "market condition changes" to "trade decision reflects the change" — match the tactical horizon the system is supposed to trade?**

This is a **read-only audit** measuring cadence + latency + freshness of every input that flows into classifier / DBS / strategy selection. No code changes.

## 2. Two-part scope

### Part A — Per-input cadence inventory

For every input that feeds regime classification, DBS computation, strategy eligibility, SQE scoring, or strategy-level decisions, produce:

- **Input name** and source (file path or external API)
- **Intended cadence** (from design / code) — e.g. "per-scan (60s)", "per-MCE-cycle (15min)", "per-minute", "per-hour", "on-demand", "never-changes"
- **Observed cadence** (from logs) — how often does this input ACTUALLY update in practice?
- **Staleness window** — how long before a consumer should treat this input as untrustworthy? What does the code do when the input is stale? (Silent reuse, isStale flag, hard reject?)
- **Source of truth** — persistent store (DB / ring buffer / memory) vs transient recompute?

Target inputs to enumerate (not exhaustive — aim for the top 20–30 by downstream impact):
- Price data (Kraken WebSocket vs REST)
- ATR, RSI, volume, EMA, slope — per pair, per timeframe
- Pair DBS (pre-B63.3 vs post-B63.3 persistent store)
- Global DBS (5-row behavior spec per B63.3)
- Regime classification (per-pair, per-MCE-cycle)
- Filter eligibility (screener_filters DB rows — polled at what rate?)
- Strategy-specific state (e.g. pattern detection windows, trend-persistence counters)
- SQE inputs (FinalScore, RegimeWeight, rankingScore)
- Mode overlay (NORMAL/DEFENSIVE/SURVIVAL) — who sets this, how often does it flip?
- TEC trailing-exit parameters

### Part B — Full-loop adaptation latency

**Important: the streakiness analysis (`B63_STREAKINESS_ANALYSIS.md`) has pre-registered three specific test hypotheses for this audit. Part B must answer them.**

**Hypothesis 1 — Regime-transition latency around 04-17 → 04-18:**
Between 2026-04-17 ~12:00 UTC and 2026-04-18 ~13:31 UTC, VTS outcomes swung from a 32-win streak in TFS (04-17) to a 70-loss streak also labeled TFS at the global level (04-18 07:44 → 13:31). If the market truly transitioned around 04-18 00:00-08:00 UTC but the global regime classifier kept reporting TFS continuously, that is direct evidence of classifier latency exceeding the tactical horizon. Measure:
- When did pair regimes start diverging from global regime around the streak?
- What was the global regime "label residence time" during the streak period?
- How long did it take for any regime input (DBS, trendStrength, volatility) to produce a signal that SHOULD have triggered a transition but didn't?

**Hypothesis 2 — Scan-cycle cross-pair correlation:**
The streakiness Part III §1 documents `vts-runner.ts` L371-373 showing 30s scan × 200 pairs all evaluated against the same global snapshot. The 04-18 05:14 entry burst (4 trades: ETH/GBP, ETH/USDT, XRP/GBP, XRP/USD) all stopped-out together. Quantify:
- Per scan cycle, how many trades are admitted simultaneously?
- Of simultaneously-admitted trades, what fraction share the same underlying (ETH/*, XRP/*, SOL/*, BTC/*)?
- What is the outcome correlation for simultaneously-admitted trades sharing an underlying vs those with distinct underlyings?

**Hypothesis 3 — Global-state propagation delay:**
Same code reference. Global regime, global DBS, mode overlay are computed per-MCE-cycle but consumed per-scan (30s). During a global-state transition, signals admitted in the window between the transition and the next MCE refresh carry stale global parameters. Quantify:
- What is the MCE refresh cadence in practice (from `phase15b_dbs_telemetry` logs)?
- How many scan cycles fire between consecutive MCE refreshes on average?
- What is the WR of trades admitted in the first scan cycle after a global DBS category transition vs the MCE-refresh-aligned cycles?

Report each hypothesis with empirical measurement + verdict. If the data doesn't cleanly support a hypothesis, say so explicitly — these are tests, not conclusions.

### Part B (original scope continues) — Full-loop adaptation latency

Measure end-to-end: when a market condition meaningfully changes, how long does it take for the system to act on that change?

Specifically:
- **T0:** Event (e.g. regime transitions from RBS → TFS for a pair, or global DBS crosses threshold)
- **T1:** Upstream inputs reflect the change (price data, ATR, indicators)
- **T2:** Classifier outputs reflect the change (regime label, DBS category)
- **T3:** Strategy eligibility reflects the change (which strategies will fire for this pair)
- **T4:** Next trade decision reflects the change (first VTS entry under the new conditions)

Compute the T0 → T4 distribution empirically using the phase15b DBS telemetry + VTS trade logs. Identify the longest-latency leg — that's the bottleneck.

**Why this matters:** if the system's adaptation lag is longer than the tactical horizon of its trades (some strategies have <30min target-hit windows), the classifier is perpetually reacting to yesterday's market. Item 15's calibration findings combine with Item 19's latency findings to diagnose the WHEN of miscalibration — a lever can be correctly calibrated but applied at the wrong cadence.

## 3. Data sources

- **Source code** — same as Item 15: `server/**/*.ts`, `server/core/**`, `server/config/**`
- **Runtime logs** — `/home/deploy/dawntrader/logs/phase15b_dbs_telemetry/` for MCE samples (per-cycle regime + DBS snapshots), `/home/deploy/dawntrader/logs/virtual_trades/` for trade outcomes
- **MCE source** — `server/services/market-context-engine.ts` defines the per-MCE-cycle update structure
- **DBS store** — `server/core/metrics/directional-bias-store.ts` + B63.3 in System Manual
- **Scheduler code** — `server/services/scheduler-registry.ts` + any cron / interval patterns

SSH access: `deploy@188.245.193.8` for runtime logs and DB queries.

## 4. Deliverable structure

File: `Claude Comms and Packages/Scope Files/B63_ITEM19_CADENCE_LATENCY_AUDIT.md`

Suggested skeleton:
```
# B63 Item 19 — Classifier Cadence & Latency Audit

## Operating-Mode Context
(same block as Items 15 and 18)

## Executive Summary (written last)

## Part A — Per-Input Cadence Inventory
  - Inventory table (20-30 rows)
  - Intended vs observed cadence — gaps flagged
  - Staleness handling audit
  - Source-of-truth breakdown (persistent vs transient)

## Part B — Full-Loop Adaptation Latency
  - T0 → T4 measurement methodology
  - Distribution across 7d VTS data
  - Longest-latency leg identification
  - Regime-transition case studies (2-3 specific pair examples)

## Part C — Cadence / Latency Pathologies
  - Any component consuming stale peers silently
  - Any component adapting faster than its input refreshes (wasted compute)
  - Any component with no defined cadence at all (implicit-forever behavior)

## Part E — Modularization Lens
  - Cadence bands as module boundaries
  - Components that should share a scheduler vs ones that shouldn't
  - Staleness-contract recommendations (which inputs should carry isStale flags?)
  - Hard-coded-to-config cadence promotion list
  - Recommendation

## Appendix — Data sources, queries, code paths referenced
```

## 5. Interaction protocol

- Three-option status protocol. Concrete artifacts, "NO PROGRESS + reason + ask," or "CANNOT COMPLETE + alternative."
- Short text breadcrumbs between tool runs.
- Partial deliveries encouraged. Part A inventory can ship before Part B latency is complete.
- Out of scope: any recommendation implying code changes in the observation window. Frame all recommendations as "B66 scope candidate" or "pre-Phase-19 preparation."

## 6. Timeline

Start after Item 15 is complete (or partially complete if you have context capacity to parallelize). Target full audit by 2026-04-27 to feed B66 scoping.

## 7. Coordination with Items 15 and 18

- Item 18 (SQE) identified which formulas are miscalibrated
- Item 15 (adaptive framework) identifies WHICH levers and HOW they're wired
- Item 19 (cadence/latency) identifies WHEN those levers actually fire

Together they answer: what does the system actually do, when does it do it, and is any of that correct? B66 scope falls out of the intersection.

## 8. Part E contribution to modularization synthesis

Your Part E notes here (plus Items 15 and 18 Part E) feed into `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` — a post-synthesis document Claude Code will write after all three audits close. Cadence bands are natural module boundaries; your Part E should reflect this specifically.

---

*End of Item 19 brief. Begin when Item 15 is far enough along to avoid context-overlap confusion.*
