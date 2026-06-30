# P19-B7.2 — maker/taker shared service: design discussion (CC-B ↔ Langston, to CONSENSUS)

**From:** NEW Claude (CC-B) · **For:** Langston · **Mandate:** Kyle 2026-07-01 — he can't make the maker/taker POLICY call himself; he directed (a) field-research what desks do [DONE — `P19_B7_2_FIELD_SURVEY.md`, staged], then (b) **CC-B + Langston discuss to CONSENSUS**, then bring the recommendation back to Kyle. This is Step-1 (no code yet). Read the field survey + the architectural findings below, then let's iterate to consensus on the 5 questions.

---

## Architectural findings (my code-verify — USE-WHAT-EXISTS)
Substantial maker scaffolding ALREADY exists, deliberately placed for this batch:
- Both fee rates DB-resolved per class (`module_constants fee_model`: crypto+xStock both `spot_taker_fee=0.008` / `spot_maker_fee=0.004`) via `resolveFeeRates`/`getFrictionForAssetClass` (`cost-model.ts:42-46,73-84`). The comment at `:38-40`: "maker carried so the Phase-19 maker-entry flip is a smaller change; model prices taker both legs (pre-audit §0)."
- `slippage-fee-model.calculateFees(grossAmount, isMaker, assetClass)` (`:188-204`) is FULLY maker-aware (`feeRate = isMaker ? maker : taker`, splits makerFee/takerFee).
- `pre-execution-validator` already reads `systemContext.defaultFeeMode || 'taker'` (`:190,198`) in its net-profit check + `resolveValidatorFeeRates` (operator-override-aware, `:401`). `systemContext.makerFeePct/takerFeePct` = operator-override cols.
- **The GAP B7.2 fills:** (1) a PER-SIGNAL maker-vs-taker DECISION (today it's a GLOBAL static `'taker'`); (2) wire it into the EV gate (SQE `:331/:490` + the kernel are TAKER-only via `.feeRateTaker`) + the paper fill (`paper-execution-engine.feePercentFor:173` taker-only → depth-walk fill); (3) the maker ECONOMICS (spread-CAPTURE credit + ~0 slippage + the NON-FILL/ADVERSE-SELECTION costs, NOT modeled — kernel assumes 100% fill); (4) #330 reconcile the two fee-source paths.
- No shared singleton — friction is shared by both paths calling `getFrictionForAssetClass` + `evaluateTradeExpectancy`.

## The field bottom-line (full detail in the survey)
EV comparison IS the right backbone (post passively iff `maker-EV > taker-EV`), BUT a *purely* EV rule is sound only if two soft terms are conditioned right: **(A) adverse selection conditioned on OUR OWN signal strength** — a predictive signal adversely-selects its own passive fills (we ARE the informed trader; we only fill when the market hasn't moved our way → we miss the fills where our edge pays off), so an unconditional-markout A *overstates* maker-EV for us; **(C) non-fill cost must price alpha decay** during the chase, not just the re-cross spread. Since we have **ZERO live passive-fill history** (VTS since Phase 8) → A,C will be noisy → a pure EV rule is most fragile on the strong/urgent signals where it matters most. Field-standard robust design = **EV-backbone + an explicit URGENCY/edge-strength GUARDRAIL** (force taker / short-budget make-then-take when edge is large AND alpha half-life short) + the **MAKE-THEN-TAKE LADDER** (post passively, escalate to taker after a time budget — bounds non-fill cost). Crypto fee gap (0.80% taker / 0.40% maker = ~0.8% round-trip) makes making the structural default — which is *more* reason to nail adverse-selection, since that head start tempts a naive EV rule to post passively on signals that should be taken.

## My RECOMMENDATION (to test against your view → consensus)
1. **Backbone = EV-driven** (compute net-EV both modes per signal, pick higher) — consistent with the mission's EV gating + B7.1's R-multiple. But NOT pure-EV: layer the two refinements.
2. **Signal-conditioned adverse-selection haircut** on maker-EV (not unconditional markout) + **alpha-decay-aware non-fill cost**.
3. **Explicit urgency/edge-strength guardrail** forcing taker (or short-budget make-then-take) when edge large + half-life short — a robustness bound while A,C are uncalibrated.
4. **Implementation = make-then-take ladder**, but in B7.2 (paper, dormant) the ladder is SIMULATED (model maker-fill-prob + escalation economics); the REAL Kraken post-only→cross order lifecycle is **Phase-21** (live-mode). B7.2 = the decision + paper economics, shared active+VTS, + #330 reconcile.
5. **Pre-calibration posture (the crux — see Q2):** ZERO passive-fill history → A,C are guesses → be CONSERVATIVE.
6. **Phase-25 calibration homes:** signal-conditioned adverse-selection markout curves (TOP), fill-prob `p(δ,T)`, alpha-decay/half-life, non-fill cost C, maker-vs-taker A/B — hosted on the reorg-B4 + B7.1 selection-ic shadow layer.

## The 5 questions for CONSENSUS
1. **Shape:** agree on EV-backbone + urgency-guardrail + make-then-take ladder? Or do you want something simpler/different (e.g. pure-EV, or a flat spread-vs-fee threshold)?
2. **★ THE CRUX — pre-calibration enablement:** given ZERO live passive-fill history, does B7.2 turn maker entry ON in paper now (conservatively) to start opening crypto, OR build the decision machinery + telemetry and keep it mostly-taker until Phase-25 calibrates A,C? My lean: the **make-then-take ladder with a SHORT time budget is the pre-calibration-safe middle** — it captures the fee saving WHEN the order fills fast (low adverse selection) and falls back to taker otherwise, bounding adverse-selection exposure by the budget WITHOUT needing calibrated A first. But this is exactly the maker/taker risk policy Kyle would want us to get right — your call matters here.
3. **B7.1 integration:** the R-multiple ranker ranks by `netEV÷risk`. Maker vs taker CHANGES netEV (cheaper friction). Does the ranker rank using the CHOSEN entry mode's netEV (decision-before-rank), or rank by best-of-both-modes netEV? I lean: decide entry-mode first (or jointly), rank on the chosen-mode netEV, so the R-multiple reflects the actual planned entry. Reconcile cleanly with B7.1.
4. **"Asymmetric-stop EV kernel" (the reorg-plan phrasing):** the field frames the maker adjustment as fill-prob weighting + adverse-selection haircut, NOT literally asymmetric stop distances. Do we read "asymmetric-stop EV kernel" as = the maker-mode EV adjustment (pFill + adverse-sel + non-fill), or did the original plan intend something else (literally different stop geometry for maker)? I lean the former.
5. **Scope boundary:** agree B7.2 = decision + paper economics + #330 reconcile, with the REAL post-only order lifecycle deferred to Phase-21? And #330 folded in here (touches the fee path) — agree?

Iterate with me to consensus on these, then I'll draft the Step-1 scope + we bring the agreed recommendation to Kyle.

---

## ★★ REVISION (Kyle 2026-07-01 — a better architecture; RE-CONSENSUS needed)
Kyle pushed on the pipeline placement and landed on a cleaner shape than our v1 consensus (which was "gate/rank on TAKER-EV, decide entry-mode at the END"). **His reframe (and I agree it's better — defending the best design, not caving):**

**1. BEST-OF-BOTH comparison computed EARLY — at/just-after signal generation, BEFORE the SQE.** Each signal is represented by its BEST opportunity (max of maker-EV and taker-EV); that best version flows through SQE → RTB rank → execution. **Why it's better:** evaluating every signal on the WORSE (taker) option understates the real opportunity AND can never open crypto (the SQE ROI gate + the open-path Net-EV gate sit UPSTREAM of where v1 put the decision, so maker economics never reach the gates that reject crypto). Computing best-of-both early is the ONLY placement that lets a taker-unprofitable-but-maker-profitable signal survive the SQE + get ranked = the actual "crypto opener."

**2. ★ The conservatism moves from the ARCHITECTURE to a single PARAMETER — a deliberately pessimistic, signal-strength-conditioned adverse-selection HAIRCUT on the maker side.** Maker only WINS the comparison when its fee+spread advantage survives a worst-case A estimate. As Phase-25 calibrates A, the haircut tightens + the comparison sharpens — NO re-architecture. This is a cleaner place for the caution than crippling the pipeline to taker-only, and it makes urgency ENDOGENOUS (strong/fast → large haircut → taker wins; patient/reversal → small → maker wins) exactly as the survey said. (The explicit hard floor from v1-Q1 stays as belt-and-suspenders on top.)

**3. ★ CONVERT-SAFETY RULE (my refinement — the piece that makes it safe).** The comparison decides the PLAN; the make-then-take ladder still plays out at execution. Trap: a signal profitable ONLY on maker (failed taker — the pure opener) that posts maker and DOESN'T fill must NOT blindly convert to a taker entry we already know is a LOSER. So at the convert step: **only cross to taker if taker-EV is STILL positive; else CANCEL (no trade).** One rule handles both — taker-profitable signals safely convert; maker-only signals cancel rather than open a guaranteed loss. (The conservative haircut bounds the FILLED-maker adverse-selection risk; convert-safety bounds the NO-FILL case; paper mode bounds the residual to learning-pollution, not loss.)

**4. Honest caveat (unchanged):** paper fills are model-vs-model → they exercise the path + flow telemetry but do NOT calibrate the haircut (real A data = Phase-21 live). Pre-calibration the haircut is a conservative guess; acceptable in paper (no real money) as the way to open crypto + prove the path.

**Net change vs v1 consensus:** gate/rank on BEST-OF-BOTH (with the conservative haircut) instead of taker-only; execute with the convert-safety rule. Everything else from v1 (EV-backbone, A-vs-C separation, honest fill model = trade-through, data fence, #330-consolidate, async/non-blocking, SysManual+SIM content, §13 named Phase-21/Phase-25 homes) carries forward.

**RE-CONSENSUS QUESTIONS (Langston + OLD Claude):**
- **RA:** Agree best-of-both-before-SQE (conservatism in the haircut) beats v1's taker-only-gate? The decisive points: it's the only placement that opens crypto, it's paper (no real loss), and convert-safety bounds the no-fill trap. Push back if you think the optimistic-haircut risk to SELECTION/RANKING still outweighs — but note the convert-safety + paper-mode + pessimistic-haircut stack.
- **RB:** Convert-safety rule (cross only if taker-EV still >0, else cancel) — agree it cleanly handles the maker-only-signal trap?
- **RC:** Signal-conditioned conservative haircut as the single conservatism knob (urgency endogenous; hard floor on top) — agree?
- **RD:** B7.1 integration now flips: RTB ranks on best-of-both netEV÷risk (not taker-only). With the conservative haircut + convert-safety, is that sound? (v1 said rank-on-taker; this revises it.)
- **RE:** Does this collapse Q2 into "how conservative is the haircut" (architecture opens crypto by default; the haircut dials how much)? Kyle still owns the haircut-conservatism level; the architecture is settled.
