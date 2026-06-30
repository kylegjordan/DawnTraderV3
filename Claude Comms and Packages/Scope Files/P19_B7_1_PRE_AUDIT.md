# P19-B7.1 — Pre-Implementation Audit + Recommended Design (the ranking fix)

change-class: architecture

**Owner:** Claude New (CC-B) · **Ultimate reviewer:** Langston · **Independent 2nd-eyes:** Claude Old (CC-A, `P19_B7_1_CC_A_INDEPENDENT_DIG.md`)
**Status:** Step-2 deep pre-audit (Kyle-directed: exhaustive code + SIM + System Manual + Active-Trading-Path-Audit). Two independent digs (CC-B deep-trace + CC-A architecture) converged on a recommendation that DIFFERS from CC-B's first reframe — see below.

---

## 0. Headline (read first)
The first reframe ("wire the VTS-only `rankingScore` onto the active picker") is **superseded**. Both digs converge on a cleaner, more correct shape:

> **B7.1 = make the live ranker PLUGGABLE, and default it to the gate's net-EV (`evaluateTradeExpectancy`) — which is already live on the active path with real inputs — instead of the friction-blind `finalScore`. Extend the reorg-B4 shadow layer to also capture net-EV, so Phase-25 can A/B the rankers on real outcomes. pWin calibration is Phase-25 (data-gated).**

Justified on the **structural** problem, NOT the fragile anti-predictive correlation.

> **★ RECONCILED (2026-06-30, Langston correction + field survey + code-verify) — the canonical form is the RISK-NORMALIZED net-EV = the EXPECTED R-MULTIPLE, not raw net-EV.** Wherever this doc body (§4, etc.) says "rank by net-EV DESC," read **`rank by R = netEV ÷ (entry−stop)` DESC** — the field-standard cross-asset normalization (Kyle's requirement). Code-verify confirmed `netEV` is in PRICE-delta units (`net-expectancy-kernel.ts:114`, NOT ÷entry), so `R = netEV ÷ (entry−stop)` is the correct dimensionally-clean R-multiple. **The authoritative, fully-folded design is now `P19_B7_1_SCOPE.md` (Step-1)** — this pre-audit is the Step-2 input that fed it.

---

## 1. The structural problem (the real case — CC-A, confirmed by CC-B's lineage)
The active pipeline is **RANK-then-EV-GATE**: the ready-to-buy pool is ranked by `finalScore` (gross quality, friction-blind, reward:risk-blind), the top-N are promoted, and only at execution does the Net-Expectancy gate compute the *real* net-of-friction EV (`paper-execution-engine.ts:2076-2138`). Consequences:
- The ranker maximizes **gross confidence/quality**, blind to net-of-friction EV + reward:risk geometry.
- Under the ~1.8% Kraken Tier-1 round-trip fee wall, a **high-confidence small-target signal (net-NEGATIVE) outranks a lower-confidence big-net-EV one** → the system promotes the gross-quality pick and lets the EV gate *bounce* it, instead of ranking by EV in the first place.
- This is a sufficient mechanism for the observed anti-predictiveness **without** leaning on the contested r.

## 2. Why NOT the anti-predictive `r` as the justification
The `finalScore` anti-predictive finding (r=−0.140 full / **−0.057 CLEAN** / r=−0.094 hostile; 740 post-B62 trades; POST_AUDIT_ROADMAP:373, B63-Item18) is **weak + hostile-amplified**, the roadmap (§19.4) **MANDATES re-validation with sibling-strategy-WR controls** before acting, and the **sibling claims from the same B63 audit largely don't replicate** (Item-15 ExpectedEdge r=−0.130→+0.008; Item-18 source-pool inverted). So we justify B7.1 on the structural friction-blindness (§1), and treat the r as a flag to re-validate, not a load-bearing premise.

## 3. The three scoring constructs (file:line)
| Construct | What it is | Where | Active-path status |
|---|---|---|---|
| **finalScore** (current ranker) | `hybridScore×0.40 + confidence×0.30 + regimeWeight×0.20 − decayPenalty×0.10`, all 0-1 (dimensionally sound). **Friction-blind, R:R-blind.** | computed `ready_to_buy_service.ts:738-742`; **sorted DESC** in `getRankedSignals` `:1671-1676` | THE active ranker |
| **rankingScore** (the rejected wire-in) | `finalScore×qualityWeight(.30-.45) + normNetReturn×returnWeight − frictionPenalty×frictionWeight + contextBonus` + a `finalScore` veto override | `ranking-weights.ts:82-99`; computed **VTS-only** (`vts-runner.ts:5120`); active defaults to finalScore (`:1797`) | **INERT** — and a finalScore-blend (keeps finalScore dominant) |
| **net-EV** (the gate) | `pWin×(target−entry) − (1−pWin)×(entry−stop) − roundTripCost`, real per-class friction | `evaluateTradeExpectancy`, `paper-execution-engine.ts:2076-2138` | **ALREADY LIVE**, real DI/dbsScore inputs (reorg-B3 #233 typed cols `di_at_queue`/`dbs_score_at_queue`) |

**CC-B lineage confirming finalScore is degenerate on the active path:** `hybridScore` → defaults to `confidence` (no real quant/pattern blend); `regimeWeight` → `calculateRegimeWeight` off **hardcoded** `trendStrength=0.5`/`volatility=0.3` (≈ a constant — NOT real regime alignment; contextBonus #217 never wired); `confidence` → deterministic, unmodulated; `decayPenalty` → linear age, recomputed every refresh. So finalScore ≈ `confidence − decay`. **This is the lineage evidence under CC-A's "friction-blind + barely-informative" argument.**

**Why net-EV over rankingScore:** rankingScore is built *on* finalScore (0.30-0.45 quality weight + a finalScore veto) so it keeps the friction-blind term dominant → DILUTES the fix; AND its `normNetReturn`/`frictionPenalty` are not computable at RTB-insert (post-trade / geometry-refresh only), so wiring it needs new plumbing. net-EV is the theoretically-correct objective (maximize net expected value = the mission's EV gating), **already computed live with real inputs**, lowest plumbing, and **unifies ranking with the gate** (the #1-ranked is the best-net-EV survivor; the gate just confirms >0).

## 4. Recommended design (B7.1)
1. **Pluggable ranker:** a single selectable sort strategy in `getRankedSignals` (`ready_to_buy_service.ts:1671`) — candidates `finalScore` (control) | `rankingScore` | **`netEV`** — DB/config-selected (no hidden default; §5-rule-15).
2. **Default to `netEV`:** promote by the gate's `netEV` DESC, reusing `evaluateTradeExpectancy` (do NOT thread a 2nd VTS-only score that can diverge from the gate).
3. **Shadow A/B harness:** extend reorg-B4 `rtb_shadow_pairings` to also capture `netEV` at decision time (it already captures finalScore + rankingScore + DI/dbsScore), so Phase-25 can empirically rank the three rankers against real promoted-AND-non-promoted outcomes — making "calibrate later" a DATED, instrumented commitment, not a §13 open loop.
4. **pWin calibration = Phase-25** (data-gated; calibrate DI→pWin + regime-conditioning on LIVE shadow outcomes, not VTS breadth). Pre-calibration, crude-but-real-pWin net-EV is **still strictly better than gross finalScore** (it already incorporates R:R + real friction).

## 5. The B7.1 ↔ B7.2 order (resolved)
Ranking by net-EV **works with the CURRENT (taker) friction** and **auto-improves when B7.2 (maker/taker) lands** (net-EV reuses the same friction model B7.2 upgrades). So the reorder I floated to Kyle (maker/taker first) is **no longer required** — B7.1 can go first. **OPEN for Langston:** confirm we keep B7.1 (rank-by-netEV) first, or still do B7.2 first. (Kyle is fine either way.)

## 6. The 7 traps (must land in scope — CC-A)
1. **pWin is the net-EV ranker's Achilles heel** — DI/dbsScore-derived, UNCALIBRATED; xStock strong-trend reaches the kernel with NULL `dbs_score_at_queue` → 0.40 floor (a real EV-input gap, RUNNING_ISSUES). The ranker is only as good as pWin. **Open Q: gate xStock netEV-ranking on closing that dbsScore gap, or ship crude + flag?**
2. **Don't blend finalScore back in** (rankingScore's design) without evidence — keeping the friction-blind term dominant dilutes the fix.
3. **Window/regime confound** — re-validate the anti-predictive r with sibling-WR controls + window-quality segmentation; net-EV does NOT fix regime-blindness unless pWin is regime-aware (part of Phase-25 calibration).
4. **Calibrate on LIVE shadow outcomes, not VTS breadth** (the promotion distribution differs).
5. **Freshness** — net-EV drops finalScore's decay/freshness preference; B6.6 price-liveness blocks stale-price fills, but add a **small recency tie-break** rather than silently losing freshness.
6. **active+VTS parity** — ensure the shadow layer captures whatever the active ranker actually uses, so the calibration basis is explicit.
7. **Gate-as-ranker compute / side-effects** — calling `evaluateTradeExpectancy` for the whole pool at ranking time (vs top-N at execution) is extra compute but cheap (pool ~15, the TCL threshold). **MUST verify it's side-effect-free for ranking use — it currently records an EV-input sample; that instrumentation must NOT double-fire when used for ranking.**

## 7. Open questions for Langston (ultimate scope reviewer)
1. **Default ranker = netEV** (CC-A + CC-B converged) vs. a hedge? Confirm netEV-default.
2. **Order:** keep B7.1 (rank-by-netEV) first, or still reorder B7.2 maker/taker first? (Now optional — netEV auto-improves with B7.2.)
3. **xStock dbsScore-NULL→0.40 gap (trap 1):** block xStock netEV-ranking until closed, or ship crude-pWin + flag for Phase-25?
4. **Pre-calibration robustness hedge:** pure netEV, or netEV + a small recency tie-break (trap 5)? Any small finalScore hedge, or none (trap 2)?
5. **change-class architecture** — agreed? (Touches the active selection/EV path.)

## 8. Governance plan (at close)
SYSTEM_MANUAL (Ch1 ranking + Ch4 RTB — the ranker becomes pluggable/netEV-default), SIM (§1.5/§4.3 — ranking construct + the gate-as-ranker reuse + shadow netEV capture; cross-cutting), RUNNING_ISSUES (#217 contextBonus disposition + the xStock dbsScore gap + a DATED Phase-25 calibration home), ADJUSTMENT_FRAMEWORK (the ranker-selection knob), BATCH_CATALOG, PHASE_19_PLAN §1/§5, completion report. Likely a migration (the ranker-selection config + the shadow netEV column). **Tests:** pluggable-ranker selection; netEV-sort correctness; the side-effect-free gate-as-ranker (no double EV-sample); shadow netEV capture.
