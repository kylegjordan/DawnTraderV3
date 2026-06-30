# P19-B7.1 — CC-A independent architecture dig (the ranking fix)

**Author:** OLD Claude (CC-A), at Kyle's request — independent 2nd set of eyes on code+architecture, in parallel with CC-B's Step-2 + Langston's scope review. Date 2026-06-30. NOT a concurrence — where I see it differently I say so.

## BOTTOM LINE (read first)
The reframe's *direction* is right (move ranking toward net-of-friction expected return; swappable; calibrate later). But on the *specifics* I land differently than the proposed wire-in, on two points:

1. **Justify the change on FIRST PRINCIPLES, not the anti-predictive r.** The r=−0.14 is weak, hostile-amplified (r=−0.094 hostile vs −0.057 CLEAN), and the roadmap itself (POST_AUDIT_ROADMAP §19.4, lines 368-379) MANDATES re-validation with sibling-strategy-WR controls before it's acted on — *and the sibling claims from the same B63 audit largely don't replicate* (Item 15 ExpectedEdge r=−0.130→+0.008 discard; Item 18 source-pool inverted, discard). Leaning on r=−0.057 to justify ripping out the ranker is fragile. The real case is structural (below).

2. **I'd rank by the gate's net-EV, NOT wire the VTS-only `rankingScore`.** `rankingScore` is itself a finalScore-blend that needs new active-path plumbing; the gate's net-EV is the theoretically-correct objective, already live on the active path with real inputs, and unifies ranking with gating. Detail below.

## The three scoring constructs (file:line)
| Construct | What it is | Where | Active-path status |
|---|---|---|---|
| **finalScore** (current ranker) | gross quality composite: `hybridScore×0.40 + confidence×0.30 + regimeWeight×0.20 − decayPenalty×0.10`. All terms 0-1 normalized (dimensionally sound — NOT a scaling bug). **Friction-blind, reward:risk-blind.** | computed `ready_to_buy_service.ts:738-742` + `vts-runner.ts:1074-1087`; sorted in `getRankedSignals` `ready_to_buy_service.ts:1671-1676` | THE active ranker |
| **rankingScore** (proposed wire-in) | `finalScore×qualityWeight(.30-.45) + normNetReturn×returnWeight − frictionPenalty×frictionWeight + contextBonus`, clamp[0,1]; + a `FINAL_SCORE_GAP_OVERRIDE=0.10` letting finalScore VETO | `ranking-weights.ts:82-99`; computed only in VTS (`vts-runner.ts:5120`); on the active path it **defaults to finalScore** (`ready_to_buy_service.ts:1212,1937`) | **INERT on active** — normNetReturn/frictionPenalty are VTS-only; wiring it needs new plumbing |
| **net-EV** (the gate) | `pWin×(target−entry) − (1−pWin)×(entry−stop) − roundTripCost`, real per-class friction; returns `netEV` + `score` | `evaluateTradeExpectancy`, `paper-execution-engine.ts:2076-2138` | **ALREADY LIVE** on the active path; pWin from typed `di_at_queue`/`dbs_score_at_queue` columns (reorg-B3 #233), real fees |

## The structural problem (the real case for the fix)
The pipeline order is **RANK-then-EV-GATE**: signals are ranked by finalScore (gross, friction-blind), the top-N are promoted, and only at execution does the Net-Expectancy gate compute the *real* net-of-friction EV (`paper-execution-engine.ts:2076-2138`). So:
- The ranker maximizes **gross quality/confidence**, blind to net-of-friction EV and reward:risk geometry.
- Under the ~1.8% Kraken Tier-1 round-trip fee wall, a high-confidence small-target signal (net-NEGATIVE) outranks a lower-confidence big-net-EV one.
- The system then promotes the #1 gross-quality pick and lets the EV gate *bounce* it — instead of ranking by the EV in the first place.
- This is a plausible mechanism for the anti-predictiveness **without** needing the contested r: finalScore correlates with crowded/obvious/high-confidence setups that the fee wall turns net-negative, plus a hostile-window confound (high finalScore in volatile windows where everything loses).

## My recommendation
1. **Make the ranker a pluggable strategy** (the swappable instrumentation the reframe wants): candidates = `finalScore` (control) | `rankingScore` (the blend) | **`netEV` (the gate's expected value)**.
2. **Default the active ranker to net-EV — REFINED post-field-survey to net-EV ÷ risk-per-trade = EXPECTED R-MULTIPLE** (Langston's risk-normalization, confirmed by the field survey as THE cross-asset standard — Van Tharp R-multiples / Kelly growth / Grinold α; raw net-EV is in price/return units and is NOT cross-asset comparable, which is exactly Kyle's "rank best opportunity regardless of asset class" mandate). So: rank by `R = [pWin×(target−entry) − (1−pWin)×(entry−stop) − cost] ÷ (entry−stop)` (raw geometry ÷ risk_price — NOT the already-÷entry net-EV divided again by risk). It remains the theoretically-correct objective, already computed on the active path with real DI/dbsScore inputs (lowest plumbing), and it unifies ranking with the gate (the gate confirms net-EV>0; the ranker orders the survivors by expected R). Reuse `evaluateTradeExpectancy`'s geometry+pWin; do NOT thread a second VTS-only score that can diverge from the gate. *(Original rec said "rank by raw net-EV DESC" — superseded by this R-multiple form; the converged design is in `P19_B7_1_PRE_AUDIT.md`.)*
3. **pWin calibration is the Phase-25 work** (data-gated — Langston's right that VTS breadth ≠ live RTB promotion distribution; calibrate on shadow's promoted-AND-non-promoted outcomes). Pre-calibration, ranking by netEV with crude-but-real pWin (DI-informed) is STILL strictly better than gross finalScore — it already incorporates reward:risk + real friction.
4. **Shadow layer (reorg-B4) is the A/B harness** — it already captures finalScore + rankingScore + DI/dbsScore at decision time; extend it to capture `netEV` too, so Phase-25 can empirically rank the three rankers against real outcomes. This makes "calibrate later" a DATED, instrumented commitment, not a §13 open loop.

## Traps to put in the scope
1. **pWin is the netEV ranker's Achilles heel** — DI/dbsScore-derived, UNCALIBRATED. xStock strong-trend reaches the kernel with NULL `dbs_score_at_queue` → 0.40 floor (a real EV-input gap, already in RUNNING_ISSUES). The ranker is only as good as pWin; calibrating DI→pWin and closing the xStock dbsScore gap are prerequisites for *trusting* it (vs merely beating finalScore).
2. **Don't blend finalScore back in** (rankingScore's design — 0.30-0.45 quality weight + a veto override) without evidence it helps. The evidence says finalScore is ~noise-to-negative; keeping it as the dominant term dilutes the fix. If a pre-calibration robustness hedge is wanted, make it explicit and small, not dominant.
3. **Window-confound (roadmap mandate)** — re-validate the anti-predictive finding with sibling-strategy-WR controls + segment by window quality BEFORE leaning on it. And note: ranking by netEV does NOT fix regime-blindness unless pWin/reward are regime-aware — the confound can persist in a netEV ranker. Regime-conditioning pWin is part of the calibration.
4. **VTS-vs-live calibration population** (Langston) — calibrate on LIVE RTB promotion outcomes (shadow), not VTS breadth.
5. **Freshness** — netEV drops finalScore's decay/freshness preference. The B6.6 price-liveness gate already blocks stale-price fills; add a small recency tie-break rather than silently losing freshness.
6. **active+VTS parity** — finalScore is identical on both paths today. If the active ranker changes, the calibration basis must be explicit; the shadow layer is the bridge — ensure it captures whatever the active ranker actually uses.
7. **Gate-as-ranker compute** — calling `evaluateTradeExpectancy` for the whole pool at ranking time (vs top-N at execution) is extra compute, but the pool is small (~15-signal TCL threshold) so it's cheap; verify it's side-effect-free for ranking use (it currently records an EV-input sample — that instrumentation must not double-fire when used for ranking).

## Net
The fix is warranted — but on the structural friction-blindness, not the fragile r. The cleanest form is "rank by the net-EV the gate already computes (pluggable, instrumented), calibrate pWin in Phase-25 on shadow data," rather than wiring the VTS-only rankingScore blend. Langston is the scope authority; this is my independent read for the 2nd-eyes Kyle wanted.
