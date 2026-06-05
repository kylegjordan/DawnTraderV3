# Hidden-Contextual-Edge Study — S1 Findings + Methodology Decisions (for Langston consensus)

> **From:** Claude Code · **Date:** 2026-06-05 (overnight autonomous run) · **Re:** plan `HIDDEN_CONTEXTUAL_EDGE_STUDY_PLAN.md` (committed c018c9292, you approved v2 in principle).
> **INFRA NOTE — DO NOT `cd /mnt/gdrive` or run git grep/status/log on the gdrive mount (hangs 30+ min).** Everything you need is embedded inline below. For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && …'`. All numbers below were produced by python probes over the live staging data (`/home/deploy/dawntrader/logs/virtual_trades/*.json` + Supabase), not from memory.

This is the **S1 review checkpoint**. I built the loader logic + ran all three exit-gate investigations as python prototypes against live staging data. Gate (a) passes cleanly. Gates (b)/(c) are definable but I discovered material limitations + a data-quality issue that change the sequencing. I'm proposing four methodology decisions (D1–D4) and asking for your consensus before I port to the committed TS engine and start S2–S4 mining.

---

## 1. GATE (a) — friction provenance — **PASS (decisive)**

Writer is `server/services/vts-service.ts` `simulateTrade` (L336–356):
```
grossProfit = (exitPrice - entry) / entry          // fractional return
frictionRate = computeTotalRoundTripCost(fee, slippage, spread)   // per-asset-class via resolveAssetClass(symbol,'kraken')
netProfit = grossProfit - frictionRate
```
Python check over **all 22,810 closed trades**: `netProfit == grossProfit − frictionCost` with **max abs deviation 0.0, zero mismatches**. So `netProfit` is mechanically net-of-friction at source, friction is resolved per-asset-class. `netProfit`/`grossProfit` are FRACTIONS; `fees` is dollars; `frictionCost` is the rate. Friction magnitudes: xStock mean ~0.72%, crypto 0.62–1.62%. **Outcome variable is trustworthy.**

## 2. Data foundation — VERIFIED reality (some deltas vs plan)

- **22,810 closed trades** (plan said ~22,801). One corrupt log file = **2026-01-17** (partial; not 2025-12-29 as plan stated). By month: Jan 2476 · Feb 8126 · Mar 3002 · Apr 2941 · May 4973 · Jun 1291.
- **Asset-class resolution (never-pool is sacred):** explicit `assetClass` when present (May 61%→Jun 100%); else the canonical resolver from `shared/asset-classes.ts` — collision tickers (BDX/CVX/DASH/EDU/MET/OPEN/PEP/SUI/T ±/EUR)→crypto, membership in `xstock_spot_universe` (489 syms, DB-loaded)→xstock, else crypto — **plus a temporal guard** (xStock OHLC + onboarding begins 2026-04-30, so any pre-04-30 trade is forced crypto regardless of ticker). Result: **crypto_spot 20,515 / xstock_spot 2,295.** Only 14 unlabeled trades recovered as xStock; the collision+temporal rules correctly kept the rest crypto (e.g. 388 "xStock-ticker" trades in Jan–Mar are crypto on colliding tickers).
- **Tiering:** backbone (netProfit, regime, strategy, signalType, predictiveConfidence) = 100% on all 22,810. Deep-context (pair/global DBS score, phase, explicit assetClass) is native **May–June only (~6.3k)**; globalRegime Apr+. `exitReason` present only 32% (7,305) — older path logs `resultType` instead; both map to managed exits.

## 3. DATA-QUALITY RED FLAG — corrupt stop geometry (new; must handle before trusting any cell)

- **3,129 trades (13.7%) have `signal.stopLoss ≥ entryPrice`** — impossible for a bullish-only long. Breakdown: 2,968 `stop≥entry`, 140 also `target≤entry`, 21 also wild-ratio.
- **They inflate apparent performance:** corrupt-stop cohort = **59.4% win / +1.96% mean net**; clean ("ok") cohort = **29.8% win / −1.30% mean net**.
- **Concentrated in NEWER trades:** 40.9% of exitReason-set (newer-path) trades are corrupt vs 0.9% of older — a **recent persistence bug** (carry to Phase 19). Example: xStock `strong_bull_trend` STX/USD `entry=0.2518, signal.stopLoss=818.93` (units bug), unreachable stop ⇒ trade rides to a +4.2% target ⇒ fake win.
- **BUT geometry-field semantics are NOT uniform across strategies.** `liquidity_trap` example: `entry=1.3037, "stopLoss"=1.3203 (above), "takeProfit"=1.2916 (below)`, exited UP at 1.3203 for +0.58% net — a legitimate long whose stop/target fields follow a fade/mean-reversion convention, NOT corruption. So a blanket "stop≥entry = corrupt" rule conflates a real units-bug with a field-labeling convention.
- `originalStopPrice` (top-level) is sane (<entry) for **2,437 of the 3,129**, so a reliable stop usually exists elsewhere — but only **13** of the corrupt trades exited at `originalStopPrice` (stops rarely bound these sims).

**Why this matters:** the two only-positive S2 cells are explained by this. `strong_bull_trend` is **47% corrupt-geometry** (its "edge" is mostly artifact). `volatility_edge` (crypto, N=212, 92% win, +3.54%) is only 5/212 corrupt — but it's **concentrated in Mar–Apr 2026 and a handful of momentum names** (FET/RENDER/ALGO), almost all older-path: a single-episode artifact that should fail temporal-stability, NOT a geometry artifact. Two different failure modes.

## 4. Provisional S2 (pre-clean, for context only)

Both classes net-negative on average (the VTS baseline we're trying to beat): crypto 34.4% win / −0.89% mean; xStock 28.9% win / −0.60% mean. Highest *real* (non-artifact) win-rates: crypto STRUCTURAL_TRANSITION regime 44.1%, `liquidity_trap` 47.4% (both still net-negative → regime/strategy alone is not a sufficient gate — exactly the premise of the study). No regime is net-positive standalone.

## 5. GATE (b) rejected arm — definable, with two discovered constraints

- `signal_eval_archive` (timestamp col is `captured_at`, not created_at), mode=`vts`: **sqe 5,068** (`detailReason='net_ev_rejected'` = the EV near-miss) + **tcl 183k** + admitted 7,078; `strategy_internal` = **13.0M** (exclude — ambient non-signals). Admitted 7,078 ≈ May–Jun VTS closed trades 6,264 → arms reconcile.
- **Constraint 1 — window:** `signal_eval_archive` is **May–June only**, so every admitted-vs-rejected comparison is capped to ~5 weeks.
- **Constraint 2 — no geometry, no rich context:** rejected rows carry only symbol, `captured_at`, strategy, `regime_label`, `final_score`. `features` jsonb = `{sourcePool, detailReason, schema_version}`; `modulators`/`gate_decision` similarly thin. So evaluating "what the rejected trade would have done" requires **full geometry reconstruction (Gate c) + OHLC context recompute** — there's nothing to read off the row.

## 6. GATE (c) geometry reconstruction — required, dual-role

Plan framed Gate (c) as validating the rejected-arm reconstruction. Finding §3 means it's **also the admitted-arm data-cleaning tool**: re-replay trades with sane geometry against 1-min OHLC (`interval_begin` time col; partitions from 2026-04) to get a corrected managed-exit outcome, and validate the replay by blind-reconstructing admitted trades whose realized `netProfit` we know. `exit_decision_archive` (5,437 rows, May–Jun, independent `entry_price`/`exit_price`/`pnl_pct`/`r_multiple`; join on nested `signal.id`) gives a second independent outcome to cross-check.

---

## 7. PROPOSED METHODOLOGY DECISIONS (your consensus requested)

**D1 — Outcome = realized `netProfit`; do NOT re-derive admitted-arm outcomes from geometry.** Gate (a) proves `netProfit` is the trustworthy net outcome. The geometry-field inconsistency (§3) therefore does NOT corrupt the edge metrics for most trades — it only affects trades where a *non-functional stop let the sim ride to target*. Geometry reconstruction is reserved for (i) the rejected arm and (ii) re-validating the specific corrupt-stop cohort.

**D2 — Corrupt-stop handling:** flag the `stop≥entry` cohort as a data-quality tier; **report every S2–S4 result twice (all trades vs ok-geometry-only)** so the artifact inflation is always visible; cross-check the May–Jun overlap against `exit_decision_archive`. Do NOT blanket-exclude (would drop legitimate fade-convention trades like `liquidity_trap`). The newer-path units-bug is logged as a **Phase 19 fix item** + a CHANGES_AND_FIXES entry.

**D3 — Sequencing:** treat Gate (a) as the gate on ALL mining (PASSED) and Gates (b)+(c) as gates on the **rejected-arm comparison specifically**. So **admitted-arm S2/S3/S4 proceed now** (on Gate (a), with the D2 dual-reporting); the **rejected-arm selection-bias layer waits on Gate (b)+(c)** and is explicitly scoped to the May–June common window. This unblocks the headline deliverable tonight without weakening rigor.

**D4 — Provisional verdicts:** `volatility_edge` and `strong_bull_trend` apparent positives are flagged **NOT robust** (episode + geometry artifacts) and carried to S5 holdout/temporal-stability rather than reported as findings.

## 8. Questions

1. Do you agree with **D1** (outcome = realized netProfit; geometry only for reconstruction/rejected-arm)? Any case where you'd want an admitted trade's outcome re-derived from OHLC even though netProfit exists?
2. **D2** dual-reporting (all vs ok-geometry) + cross-check vs `exit_decision_archive` — sufficient, or do you want the corrupt-stop cohort re-replayed with `originalStopPrice` to *recover* corrected outcomes (adds a Gate-c-style build to the admitted arm)?
3. **D3** — agree admitted-arm S2–S4 can proceed on Gate (a) alone, with the rejected arm (Gate b+c) as a separate May–Jun layer? Or do you hold to "no mining until a+b+c all pass" as written?
4. Given the rejected arm is geometry-less + context-less + May–Jun only, is the selection-bias layer worth the Gate-(c) reconstruction build, or should it be a clearly-caveated secondary with lower priority than S3/S4 depth on the admitted arm?

I'll proceed on my D1–D4 recommendation if you concur; tell me where you'd diverge.
