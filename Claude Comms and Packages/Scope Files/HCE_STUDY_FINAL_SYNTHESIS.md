# Hidden-Contextual-Edge Study — Final Synthesis

> **Overnight autonomous run, 2026-06-05.** Author: Claude Code. Reviewer: Langston (consensus at S1 and S2–S5). Plan: `HIDDEN_CONTEXTUAL_EDGE_STUDY_PLAN.md`. Section reports: `HCE_S1_FINDINGS_AND_METHODOLOGY_rev1.md`, `HCE_FINDINGS_ADMITTED_ARM_S2-S5.md`. Engine: `scripts/hce/hce_study.py` + `scripts/hce/hce_ohlc_sim.py`. Identify-only; no production change. Active trading OFF (VTS); crypto untouched in production (read-only analysis).

## Executive summary

Kyle's directive: for every strategy, bullish-only, find the contextual conditions (regime, directional bias / DBS, volatility, continuation, confidence, phase) under which its winners cluster, so each strategy could be gated to its favorable context and lift both win-rate and per-trade profit — built as a re-runnable engine for a periodic ML drift-scan.

**Core result: within the trades the system actually took (the admitted, SQE-survivor population of ~22,810 VTS trades since January), there is no robust, generalizable contextual condition that turns a losing strategy into a winning one.** Every strategy stays net-negative even sliced by its most-favorable context; a strategy's winners and losers look almost identical on the logged context; and directional bias has no standalone power to predict win/loss within admitted (AUC ≈ 0.50). The only two net-positive cells are verified artifacts (a two-month momentum episode; a single gold-token scalp). The informative interpretation: the system's existing approval gates have already removed the contextually-bad setups, so among survivors little exploitable context remains — the leverage is in the **admission boundary** (which trades to admit vs reject) and Phase-25 calibration, not in re-gating survivors by context. The causal test of that boundary (the rejected arm) is data-coverage-limited (below).

## 1. Data foundation + S1 exit gates

- **Source:** VTS daily trade logs (`logs/virtual_trades/*.json`), **22,810 closed trades, 2026-01→06-05** (one corrupt file, 2026-01-17). Asset class resolved via the canonical resolver (`shared/asset-classes.ts`) + a temporal guard (xStock onboarding 2026-04-30): **crypto 20,515 / xStock 2,295, never pooled.**
- **Gate (a) — friction provenance: PASS.** `netProfit = grossProfit − round-trip friction` at source, friction per-asset-class; verified `net = gross − frictionCost` on all 22,810 (max deviation 0.0). Outcome variable is net-of-cost and trustworthy *as a function of exit price*.
- **Geometry correction (Langston ratio test).** An initial "13.7% corrupt geometry" read was overturned: `signal.stopLoss ≥ entry` is the **final trailed/break-even stop** of winners (94% exit above entry via break-even/target/trailing; `originalStopPrice` holds the sane entry stop). Only **25 trades** are true units-bugs (stop off by >50%, e.g. STX 818 on a $0.25 entry); those are excluded; `originalStopPrice` is the entry-geometry field. → **RUNNING_ISSUES #204:** the 25 units-bugs are **21 xStock / 4 crypto (~45× higher xStock rate)** — an xStock price-scale/precision integrity item that could bite live execution; flagged for Phase-A/19.
- **Coverage tiers:** backbone (netProfit/regime/strategy/signalType) = 100%. Deep context (DBS/phase/explicit asset-class) and `originalStopPrice` and OHLC are **May–June only** (0% Jan–Mar, ~8% Apr, 100% May+). This confines all reconstruction work to a matched May–June window.

## 2. S2–S5 — admitted-arm analysis (the within-admitted descriptive layer)

- **S2:** crypto 34.4% win / −0.89% mean; xStock 28.2% / −0.64%. No regime or strategy net-positive standalone.
- **S3:** AUC(DBS→win) ≈ 0.50; continuation vs reversal both negative; winner-vs-loser context profiles near-identical. The logged context does not separate outcomes within admitted.
- **S4:** the only FDR-significant net-positive gates are **`volatility_edge`** (+3.5% — but a Mar–Apr momentum episode that collapsed to −1.1%/36% win in May; documented negative) and **`liquidity_trap`+RANGE_BOUND** (+0.78% — but 52% PAX Gold, a single ultra-low-vol token, Mar–Apr only; non-generalizable).
- **S5:** broad strategies are stable losers across split-halves (consistent, not noise). The two positives fail generalization.
- **Caveat closed/scoped:** this tested *logged* context features; raw OHLC-derived features (realized vol, trend-strength, distance-from-high) were the intended P1 extension — but the logged `regime` already encodes vol×trend and `DBS` encodes direction, and both are null within admitted, so a raw-feature re-run on survivors is expected to reproduce the null (selection dominates).

## 3. P2 — OHLC managed-exit reconstruction validation (Gate (c))

*(Hard GO/NO-GO gate; pass bar pre-registered before running — see `hce_ohlc_sim.py` header.)*

**RESULT: <PENDING — append on completion>.**

The pure stop/target first-hit simulator (logged geometry: entry, `originalStopPrice`, `takeProfit`; OHLC forward) is validated against admitted clean-exit trades whose realized `netProfit` is known. Pass bar: sign-match ≥85%, sim win-rate within ±5pp of observed (no sign bias), no-hit ≤15%.

## 4. P3 — rejected arm (the causal layer): scoped, validated-tooling-ready, COVERAGE-LIMITED

The admitted null concentrates the study's payoff on the admission boundary — i.e. did the net-EV gate (`net_ev_rejected`, 5,068 signals, May–June) reject trades that would have been profitable? Tooling to answer it (entry price + ATR + managed-exit sim from OHLC at the signal timestamp) is feasible and built. **But the rejected-signal population is OHLC-coverage-limited:** only ~53% of rejected signals have 1-min bars within 30 min of the signal, and covered ones are sparse (e.g. 6 bars / 60 min) — because rejected signals are disproportionately thin-liquidity alts (partly *why* they were rejected), exactly the symbols with poor intraday data. So a faithful rejected-arm reconstruction needs **denser intraday data or order-book history** for the thin symbols; on the current 1-min OHLC it would be a low-fidelity, liquidity-biased estimate.

**Per Langston's guards:** matched May–June window both arms; instrument-mix composition reported (PAXG lesson); metric = admitted-vs-rejected expectancy delta with the P2 reconstruction tolerance carried as an error band (delta inside band → inconclusive, not null); `net_ev_rejected` only; power pre-stated (the coverage limit likely powers only a pooled delta, not strategy×context cells).

## 5. Conclusion + recommendation

1. **Do not expect a free win-rate/expectancy lift from context-gating the strategies as currently admitted** — the survivor population is context-homogenized; there is no hidden context gate to exploit there.
2. **The leverage is the admission boundary + Phase-25 calibration** — which trades to admit/reject, not how to re-slice survivors. The rejected-arm causal test is the right next investment but requires better intraday data for the thin rejected symbols before it can produce a trustworthy number.
3. **xStock data-integrity (RUNNING_ISSUES #204):** resolve the ~45× xStock stop-price scale anomaly before Phase-19 active-paper.
4. **Re-runnable engine delivered** (S6): `hce_study.py` (S2–S5) + `hce_ohlc_sim.py` (Gate (c)) are parameterized and stdlib-only; suitable for a periodic ML drift-scan. Cadence + drift-report wiring documented for the analytics runbook / onboarding workflow.

## 6. Deliverables (committed)

- `scripts/hce/hce_study.py` — loader + asset-class resolver + S2–S5 (re-runnable engine).
- `scripts/hce/hce_ohlc_sim.py` — OHLC managed-exit reconstruction + Gate (c) validation (pre-registered bar).
- `HCE_S1_FINDINGS_AND_METHODOLOGY_rev1.md`, `HCE_FINDINGS_ADMITTED_ARM_S2-S5.md`, this synthesis.
- `RUNNING_ISSUES.md` #204 (xStock stop-price integrity).
