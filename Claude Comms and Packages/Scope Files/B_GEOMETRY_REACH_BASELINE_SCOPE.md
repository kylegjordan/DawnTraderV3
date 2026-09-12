# B-GEOMETRY-REACH-BASELINE — SCOPE

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 (replacing the withdrawn content) · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** **r5** — Langston Step-1 **CHANGES-NEEDED**, both blockers confirmed by me at the ref, his reframing finding promoted to **PROBLEM 3**, and the direction his arithmetic points at now stated out loud in §1c. **r3 — the bias is confirmed an IDENTITY that survives risk-normalisation, his discharge condition SPLITS into a direction leg (discharged now) and a margin leg (needs an instrument, folded into OBJ-4), and the five fields that instrument must carry are specified.** **r4 — Langston's §13 disposition-1 fold, landed BEFORE OBJ-1 starts: the fee reconciliation must name WHICH NOTIONAL PER LEG.**

> ⭐⭐ **KYLE-DIRECTED 2026-09-12, AND HE GAVE THE BALL ON THE *COMBINED* BATCH.** The reward-to-risk work and the reachability-ceiling work are **one batch**, because they are provably one dial. **CC-B owns it.** The reachability leg absorbs what was scoped for a separate CC-C batch.
> ⛔ **AND HIS BINDING OBJECTION TO WHAT CAME BEFORE THIS: a plan that is only measurement and changes nothing is not acceptable.** OBJ-2 and OBJ-3 change live paper behaviour and ship settings. **This is not an instrumentation batch.**

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | *(r1)* The ceiling **has a derivation and 4.0 means "sixteen hours"** — reported to Kyle in that form. | ⚠️ **r2: OVERCLAIMED. The FORM is document-derived; the VALUE 4.0 IS NOT TRACED.** | Langston BLOCKER-2, re-read by me. `:41`'s **general** rule does govern a target distance — *"a target K ATRs away is reachable in H bars when `K ≲ c·√H`"*, with **H = 12–24** (√H 3.5–4.9), so 4.0 sits inside the band. ⛔ **But its worked example specialises K to the FLOOR and outputs a volatility-admission bound, a different quantity; and `reach_atr_max` does not appear in the reorg-B2 completion report at all, arriving a batch later at B2.1 OBJ-3.** ⇒ **`INFERRED-FROM-CODE-AND-FORM`. The framing is the document's; the value is an untraced inheritance — which needs deriving MORE urgently, not less.** |
| 2 | Fee split **0.43 % vs 1.69 %**, a 4× difference; break-even 42.2 % vs 54.7 %. | ⛔ **WRONG — those were DOLLARS. As shares of notional: 0.821 % vs 1.573 %.** Break-evens restated below. | `total_cost` is an absolute amount. Re-measured: taker/taker **$1.6882 on $107.01 = 1.5729 %**; maker/maker **$0.4304 on $52.42 = 0.8210 %**. Caught by Coltrane, verified by me. |
| 3 | The maker/taker P&L comparison is *"partly"* confounded. | ⛔ **COMPLETELY confounded, and the reason is structural.** | Measured: **exit maker → 18 target hits / 0 stops; exit taker → 0 targets / 34 stops.** A winner fills its resting target limit (maker); a loser is stopped at market (taker). ⇒ **exit fee mode is an OUTCOME, not a choice.** |
| 4 | Switching to maker fees is the single biggest lever. | ⚠️ **Only the ENTRY leg is choosable, worth ~0.39 pp — and it is NOT sufficient.** | With the pattern median stop 3.54 % and gross R 1.658: taker entry ⇒ break-even **54.3 %**; maker entry ⇒ **50.2 %**. **Observed win rate 41.4 %.** Cost reduction alone does not close the gap. |
| 5 | *"3 of 19 strategies"* (read as 3 quant / 16 pattern). | **QUANT 11 · PATTERN 3 · HYBRID 5.** | Canonical map, 19 distinct keys, none twice. *"3 of 19"* referred to how many strategies have an ATR term in their **stop** — a different axis entirely. |
| 6 | Geometry is DB-resolved, so *"changing R is changing rows"*. | **Each strategy computes its own stop and target in its own module, with its own formula.** The DB holds the **numbers** those formulas read. | Seventeen formulas read one at a time; see the `RR_AND_REACHABILITY_BASELINE_STUDY_r1.md` banner. **There is no single calculation.** |
| 7 | Langston's risk-distance-multiple target must be **built**. | ✅ **It already EXISTS and needs EXTENDING.** | `sma_trend_ride` → `break_target_r_multiple`; `vwap_bounce` → `target_r_multiple`; `abcd_long` → a two-R target. Three strategies already do it, multiple in the DB. |
| 8 | Records are missing: no hold duration, no original target. | ⚠️ **Less is missing than claimed.** | All 29 filled September pattern trades carry `takeProfit`, `originalStopPrice` and timestamps; **median hold 9.76 h** is already derivable. `take_profit` is populated from the signal target (`active-execution-engine.ts:4271`); `target_exit_price` is a **different** field and is not its substitute. |

---

## 1. THE PROBLEM — **THREE** (r2 promoted the third), REAL, DOING DIFFERENT DAMAGE

### 1a. The ceiling and the holding horizon are ONE parameter, and ours are mutually inconsistent

The ceiling is `c·√H` — **it encodes how long we are willing to hold.** Run it both ways:

| ceiling | implied horizon |
|---|---|
| **3.12 ATR** | 9.76 h — **our measured median hold** |
| **4.00 ATR** | 16 h — **what we actually seeded** |
| **6.00 ATR** | 36 h — **what `strong_bull_trend` needs** |

⛔ **So we are running three different horizons at once:** a ceiling that says sixteen hours, trades that actually resolve in ten, one strategy that needs thirty-six — and **Kyle has declined a maximum hold at all**, which means we are not committing to sixteen hours in the first place. ⇒ **the inconsistency is the problem, not the number 4.0.**

⚠️ **r2 — AND I MUST NOT OVERSELL THIS, BECAUSE I ALREADY DID ONCE.** r1 said the document *"anticipated this"* and that the batch is *"the calibration the author asked for."* ⛔ **That instruction — *"Seed the per-class bound CONSERVATIVELY … let the by-reason counts calibrate in Phase 25"* — sits in the SAME SENTENCE as the ATR/price admission bound, and the reorg-B2 completion report's "conservative starting placeholder" trio is `target_floor_pct`/`min_rr`/`roi_absolute_max`. `reach_atr_max` IS IN NEITHER.** ⇒ ✅ **What survives, and it is enough: a ceiling on ATRs-to-target IS a horizon statement by the document's own general rule, 4.0 = √16 falls inside its stated √H band of 3.5–4.9, and HOW 4.0 WAS PICKED IS RECORDED NOWHERE.** **An untraced number is a stronger reason to derive one than a deliberately-seeded number is.**

**MEASURED CONSEQUENCE:** `strong_bull_trend` (`strong-bull-trend.ts:152-153`, target `entry + 6.0×ATR`, stop `entry − 3.0×ATR`, **R = 2.00**) exceeds the 4.0 ceiling on every signal. **Every `unreachable` line in the live log is that one strategy**, tagged-and-simulated on the VTS lane and **dropped on the active lane.** Coltrane ran the function directly: a 4-ATR target passes, 6 fails. ⇒ **our best-ratio strategy cannot reach execution.**
⚠️ **AND THE CEILING IS A MOVEMENT ESTIMATE BEING ENFORCED AS AN ABSOLUTE PROHIBITION.** √H estimates *typical* favourable excursion; it never established that a farther target is impossible.

### 1b. Fees consumed a real gross profit

**Object: the 29 filled September crypto pattern-pool trades** (12 target hits, 17 stop hits), recovered independently by Coltrane from the paper-history API and reconciled row by row:

| | |
|---|---|
| gross profit | **+$9.50** |
| entry + exit fees | **$18.35** |
| **net** | **−$8.85** |

✅ **All 29 accounting identities reconcile, and the check is mutation-proved: adding $1 to any recorded net makes it fail.**
⇒ **The cohort made money before costs and lost it after. Fees were 1.93× the gross profit.**

⛔⛔ **WHAT NEITHER PROBLEM ESTABLISHES, AND THIS BOUNDS THE WHOLE BATCH: that these strategies can never be profitable.** A zero-drift two-barrier benchmark on the same geometry gives `P(target first) = stop/(target+stop) = 37.6 %`; we observe **41.4 % on n=29**. ⇒ **the demonstrated edge over a coin flip is ~4 pp on 29 trades — not distinguishable from noise.** **Fixing costs and unblocking a strategy makes the machine work as designed; it does not prove an edge exists.**

---

### 1c. ⭐⭐ PROBLEM 3 — THE EV GATE REWARDS A FURTHER TARGET WITH NO PROBABILITY PENALTY, WITHOUT BOUND

**Promoted from an r1 footnote at Langston's insistence, and he is right that it reorders the batch.** Confirmed by me at the ref, `net-expectancy-kernel.ts:99-114`:

```
const distTarget = Math.abs(targetPrice - entryPrice);            // :99
pWin = min(maxPWin, max(minPWin, minPWin + (DI / diPWinFactor))); // :110  ← DI, DBS, sourcePool, bounds
const rawEV = (pWin * distTarget) - (pLoss * distStop);           // :114
```

⛔⛔ **`distTarget` APPEARS IN THE PAYOFF AND NOWHERE IN `pWin`.** `pWin` reads only `sourcePool`, `dbsScore`, `DI` and the bounds. ⇒ **`∂rawEV/∂distTarget = pWin > 0` unconditionally: moving the target further away ALWAYS raises computed expected value, with no penalty and no limit.** ⭐ **`reach_atr_max` is the ONLY brake on that.**

⇒ **THREE CONSEQUENCES, and they change the batch:**
1. ⭐ **This is the REAL argument for refusing to raise the ceilings — stronger than the raw-vs-clamped ATR one.** Raising the ceiling widens the only limit on a term the gate is already biased to maximise.
2. ⛔ **It makes OBJ-2 the RISKIEST change in the batch, not the safest.** r1 had it the other way round.
3. ✅ **AND IT EXPLAINS OUR OWN DATA COHERENTLY — the thing r1 could only call noise.** Realised 41.4 % sits near the 37.6 % two-barrier null **because the `pWin` that drove selection was never about this target at all.** It is a trend-strength score multiplied by whatever distance the strategy happened to choose.

✅✅ **r3 — AND IT SURVIVES RISK-NORMALISATION. THIS IS AN IDENTITY, NOT AN EXPECTATION.** I had deferred this as *"I expect the bias survives but I have not opened the function"*; Langston cited it and **I then read it myself at the ref:**
- `ready_to_buy_service.ts:1805` `const distStop = Math.abs(p.entry - p.stop);`
- `:1806` `let r = Number.isFinite(result.netRewardToRisk) ? result.netRewardToRisk : -Infinity;` — and `netRewardToRisk` is `netEV / distStop` (`net-expectancy-kernel.ts:117`)
- `:1807-1808` `if (p.chosenNetEv … && distStop > 0) { r = p.chosenNetEv / distStop; }`

⇒ ⛔ **BOTH BRANCHES DIVIDE BY `distStop` ONLY. THE DENOMINATOR CARRIES NO TARGET TERM.** With `netEV = pWin·distTarget − pLoss·distStop − friction`:
> **`∂r/∂distTarget = pWin / distStop > 0`, strictly, with `distStop` fixed and no probability term responding.**

⭐⭐ **SO WHAT IS UNCOMPUTABLE TODAY IS THE *MARGIN*, NEVER THE *SIGN* — and that splits the discharge condition cleanly:**
- ✅ **THE DIRECTION LEG DISCHARGES NOW, on cited algebra rather than on a corpus** — which is stronger evidence than a corpus would have been, because an identity cannot be a sampling artefact.
- ⚠️ **ONLY THE RANK-1-vs-RANK-2 MARGIN NEEDS AN INSTRUMENT**, and §3 OBJ-4 now carries it.

⛔ **AND A SECOND SITE FOUND IN THE SAME READ, which is why OBJ-4 needs a FLAG and not just numbers: `ready_to_buy_service.ts:1794` `const target = (p.target != null && Number.isFinite(p.target)) ? p.target : p.entry * 1.02;`** — a candidate arriving without a target is **ranked on a fabricated 2 % constant** (the `#927` family, comment: *"mirror executePromotedSignal default"*). ⇒ **the live ranking already mixes two populations — candidates ordered on their own measured geometry, and candidates ordered on a constant — under one ordering.** ⛔ **A margin measured across that mixture measures neither.**

### 1d. ⭐⭐ THE DIRECTION EVERY NUMBER POINTS AT, WHICH r1 NEVER SAID OUT LOUD (Langston's answer to Kyle's question)

**Friction is 1.5729 % round trip against a 3.54 % median stop — `44 %` OF THE RISK UNIT.** And **fees are proportional to notional, so SIZE CANNOT HELP.** Only three things can: **the rate**, **the number of round trips**, and **the reward per round trip.** The rate is worth ~0.39 pp and is capped (§0 row 4).

⇒ ⭐⭐ **THAT LEAVES *FEWER, LARGER-EXPECTED-MOVE TRADES* AS THE ONLY DIRECTION THE ARITHMETIC SUPPORTS — and r1 never stated it, which is why r1 read as circular.**
⛔ **AND THE MECHANISM MEANT TO ENFORCE EXACTLY THAT IS THE NET-EXPECTANCY GATE — which §1c shows currently cannot, because it prefers a further target for free rather than a better one.** ⇒ **§1c is not a side-finding. It is the blocker on the direction the whole batch is for.**

---

## 2. PROVENANCE (mandatory 1.b) — CORPORA NAMED, INTENT QUOTED

**Searched:** `RUNNING_ISSUES.md`, `BATCH_CATALOG.md`, `SYSTEM_MANUAL.md` §reorg-B2/B2.1/B2.3, `SYSTEM_IMPACT_MAP.md` §4.1/§4.3, the reorg-B2 scope + pre-audit, **the `P19_B_FEEVIABILITY` scope AND pre-audit (added at r2 — Langston's BLOCKER-2: it is the direct predecessor work on this exact constant and r1 did not name it)**, the reorg-B2 and B2.1 completion reports, `POST_AUDIT_ROADMAP`, and `git log -S` on the constants. **`bridge/canonical/` not consulted** — every site postdates the 2026-01/02 governance change; recorded rather than left silent.

| site | intent, VERBATIM | disposition |
|---|---|---|
| `reach_atr_max` = 4.0 | **THE FORM is document-derived; THE VALUE IS NOT TRACED.** `P19_REORG_B2_PRE_AUDIT.md:41` states the general rule for a target distance: *"a target K ATRs away is reachable in H bars when `K ≲ c·√H` (c≈1, conservative)"*, with *"Kyle's hold window 'half a day to a full day' ≈ **H = 12–24** 1h-bars (√H ≈ 3.5–4.9)"*. ⛔ **But its WORKED EXAMPLE specialises K to `floor/(ATR/price)` and outputs a per-symbol VOLATILITY-ADMISSION bound (`ATR/price ≥ ~0.9 %`) — a different quantity from `reach_atr_max`, which bounds the STRATEGY'S OWN target distance.** And `P19_B_FEEVIABILITY_PRE_AUDIT.md:136`: *"`reach_atr_max` does **NOT** appear in the reorg-B2 completion report at all"* — it **arrives at reorg-B2.1 OBJ-3**, with an acknowledged attribution discrepancy against `POST_AUDIT_ROADMAP:326`. | **(2) relevant but needs updating — `INFERRED-FROM-CODE-AND-FORM`, NOT ESTABLISHED (Langston BLOCKER-2, and he is right).** ✅ **What IS established: a ceiling on ATRs-to-target is a HORIZON statement by the document's own general rule, and 4.0 = √16 sits inside its stated √H band of 3.5–4.9.** ⛔ **What is NOT established: that 4.0 was chosen by that calculation.** No report records its derivation. ⚠️ **THE TWO ACCOUNTS RECONCILED, and the honest reading is the less flattering one: the FRAMING is the document's, the VALUE is an untraced inheritance.** ⭐ **That strengthens the batch rather than weakening it — an untraced number needs deriving more urgently than a deliberately-seeded one.** ⛔ **AND IT CORRECTS MY REPORT TO KYLE: I told him this batch is "the calibration the author asked for." I cannot support that for THIS constant.** *(The "seed CONSERVATIVELY … calibrate in Phase 25" instruction is in the same sentence as the ATR/price bound, and the reorg-B2 completion report's "conservative starting placeholder" trio is `target_floor_pct`/`min_rr`/`roi_absolute_max` — **`reach_atr_max` is in neither.**)* |
| `strong_bull_trend` 6.0 / 3.0 | `b72-step3-commit-b` seed; R = 2.00 by construction | **(1) still relevant and correct.** The geometry is good and matches outside practice. **What is wrong is that nothing can execute it.** |
| the RR floor (`min_rr`) | reorg-B2.3: per-(strategy × class), *"Each seeded floor is a notch below that strategy's OWN-class measured mean RR"* | **(1) correct, and NOT touched by this batch.** ⛔ No floor is moved here. |
| `patternToTradeSignal` 1.5 / 2.5 | *"ATR multipliers (1.5× stop / 2.5× target) stay hardcoded; per-class tuning deferred to Layer-3 (SIM §11263)"* | **(2) relevant, needs updating** — but **OUT OF SCOPE here** (§5). |

---

## 3. OBJECTIVES

> Each back-references the §1/§2 finding it falls out of. Anything unaudited is flagged `UNAUDITED`.

### OBJ-1 — Correct the fee basis before anything is decided on it
**From:** §0 rows 2–4, §1b.
**Change:** reconcile booked fees against **entry notional** so cost is expressed as a share, not an amount; then wire the fee model to the account's **applicable pair-specific maker/taker rates** (Kraken's `TradeVolume` account endpoint) instead of flat Tier-1 assumptions. **Model target exits, stop exits and unfilled orders separately** — they cost different amounts, and §0 row 3 shows exit mode is determined by outcome.
⛔⛔ **r4 — NAME WHICH NOTIONAL, PER LEG, OR THIS OBJECTIVE RECONCILES THE MODELLED OBJECT AGAINST THE BOOKED ONE AND CALLS AGREEMENT (Langston's §13 disposition 1, folded before OBJ-1 starts).** The ranking models **BOTH** fee legs on **ENTRY** notional — `expectancy.ts:635-636`, `frictionPct = computeTotalRoundTripCost(…)` then `friction = frictionPct × tradeMeta.entryPrice`. **A booked EXIT fee is charged on EXIT notional.** ⇒ r3's *"rate × notional"* was ambiguous in exactly the place the objective exists to disambiguate.
✅ **AND IT IS A RULE-24 OUTCOME (2), WORKING-AS-DESIGNED-BUT-UNADDRESSED — NOT A DEFECT CLAIM, and the scope says so explicitly.** The entry basis is a deliberate share-of-entry convention (⛔ **and r5 STRIKES the clause that stood here — it claimed the entry basis is load-bearing for §1c's identity, which is FALSE; see the withdrawal below**). **What is missing is a DECISION about which basis the model should carry, which is a scope call, not a bug.**
⛔⛔ **AND THE STRUCTURAL ARGUMENT I ATTACHED TO THIS IS WITHDRAWN — IT WAS WRONG, AND WRONG IN THE DIRECTION THAT SUITED ME.** I argued that leaving the entry basis alone is *structurally* right because it is what makes `∂friction/∂distTarget = 0` and therefore what makes §1c's identity unconditional — so a more accurate cost model would weaken our own headline. ✅ **The premise holds** (`expectancy.ts:636-637` does make that derivative zero). ⛔ **The conclusion does not.** Langston's derivation, re-checked by me at the object: correct the exit leg to exit notional and the expectation-correct friction term is `r_e + pWin·r_x(1+distTarget) + pLoss·r_x(1−distStop)`, giving **`∂netEV/∂distTarget = pWin(1 − r_x)` — still UNCONDITIONAL, merely scaled by 0.992.** Even the cruder deterministic-at-target form gives `pWin − r_x`, positive iff `pWin > 0.008` — and I read the clamp live: `expectancy_kernel.pwin_floor = 0.40`, `pwin_ceiling = 0.60` (`b72-step3-commit-b`). ⭐ **`pWin` is floor-clamped at FIFTY TIMES the taker rate by construction, so an accurate cost model costs §1c nothing.** ⇒ **the entry basis is NOT load-bearing for the identity, and *“a better cost model weakens our headline”* is FALSE.**
✅ **THE DISPOSITION SURVIVES ON THE HONEST REASON, which is the only one it ever needed: outcome (2), a scope call about which basis the model should carry, ≤6 bps, out of THIS batch.** ⛔ **Not because the inaccuracy protects anything.** ⚠️ **I flagged this argument for checking precisely because it favoured doing less work — which is the only reason it was caught before it became a precedent.**
⚠️ **AND WHATEVER OBJ-1 LEAVES IN PLACE BINDS OBJ-4:** the instrument must record `r` at **OBJ-1's final cost basis**, or the margin corpus **straddles a cost-basis change mid-collection** — the F-G-2 A4 split-window shape. **If the account-rung wiring deploys after collection opens, that is a SPLIT, not a continuation, and must be labelled one.**

**VERIFICATION:** (a) every September crypto row's booked fee reproduces to the cent from **rate × the NAMED notional FOR THAT LEG** — entry fee on entry notional, exit fee on exit notional — **with the per-leg basis stated beside the number and the denominator printed**; (b) the **modelled** round-trip cost is reported **separately** from the **booked** one, with the gap attributed to the entry-basis convention rather than folded into a single "cost" figure; (c) a **negative control** — feed a known-wrong rate and the reconciliation must FAIL; (d) the account's live rung is read and recorded, and **differs from or matches Tier-1 explicitly** rather than being assumed; (e) **the basis OBJ-4 must record against is stated as OBJ-1's output**, so the two objectives cannot disagree by construction.

### OBJ-2 — Release the reachability rejection for `strong_bull_trend`, PAPER PATH ONLY, AT **BOTH** GATES
**From:** §1a, and **Langston's BLOCKER-1 — r1 would have opened ZERO positions.**

⛔⛔ **THERE ARE TWO REACHABILITY GATES ON THE ACTIVE PATH, BOTH READING THE SAME `reach_atr_max`, AND r1 NAMED NEITHER SITE.** Confirmed by me at the ref:
- **GATE A — signal generation.** `strategy-helpers.ts:422` `validateReachability(entryPrice, targetPrice, effectiveATR, gate.reachAtrMax)` inside `applyGlobalGuards`, against the **CLAMPED `effectiveATR`**. ⛔ **A declared pure leaf — it receives `gate` as a parameter and cannot see the mode.**
- **GATE B — the active path.** `signal-orchestrator.ts:1906` → `signal-target-normalizer.ts:111` `atrsToTarget > reachAtrMax → 'unreachable'` → `:1925 return null`, an **unconditional drop** recorded as `recordActivePostSqeReject(… 'unreachable')`. Against the **RAW MCE ATR** (`marketContext?.atr ?? sizingContext.atr`).

⭐⭐ **AND THE ARITHMETIC IS NOT MARGINAL — IT IS AN IDENTITY, WHICH IS WHY IT FAILS IN EVERY MARKET STATE.** `strong-bull-trend.ts:79` `const atr = indicators.atr ?? 0`; `:153` `targetPrice = entryPrice + (atr × SBT_TARGET_ATR_MULT)`. Gate B divides that same MCE `indicators.atr` back out (P19-B8.5l re-stamp). ⇒ **`atrsToTarget` at Gate B ≡ `target_exit_atr_multiplier` EXACTLY.** With the multiplier at 6.0 it fails a 4.0 ceiling **unconditionally**, not merely usually — and would keep failing a ceiling of 6.0 wherever the two ATR bases diverge.
✅ **CONSTRUCTIVE, AND IT DECIDES THE SEAM: Gate B is the ONLY one of the two that can see `sizingContext.mode`, so it is the only site at which a paper-only exception is expressible at all.** Gate A must be released by the `gate` value it is handed, not by a mode test inside it.

**Change:** express the paper-only exception at **Gate B's** mode-aware seam, and supply Gate A a correspondingly released `reachAtrMax` **for the paper mode only**, so a native `strong_bull_trend` signal survives both. **Native 6-ATR target and 3-ATR stop kept. Rejection LABEL retained at both gates** so the counterfactual stays measurable. **Every other admission and risk check untouched.**
⛔ **DO NOT raise either class's `reach_atr_max` value.** Beyond the raw/clamped divergence, §1c is the decisive reason.
⛔ **DO NOT reuse the reorg-B3.3 tag-don't-drop disposition** — it also relaxes `rr_below_min`, which this batch does not touch.

**VERIFICATION:**
- (a) A test at **each** gate proving **only** `unreachable` changes disposition for `strong_bull_trend` in paper, with `rr_below_min`, `invalid_atr`, `stop_distance` and `invalid_geometry` still dropping — **each exercised against its own negative control.**
- (b) **Mutation twin:** revert the change and the test must FAIL. ⛔ **A test that passes both before and after tests nothing.**
- (c) **The identity above asserted directly:** with the multiplier at 6.0, Gate B's `atrsToTarget` must read **6.0 regardless of the ATR supplied** — so the fixture cannot pass by accident of a convenient ATR. ★ *r1's verification (c) was "live paper shows positions opening", which would have failed at Step 7 with no diagnosis.*
- (d) **Live mode provably unaffected**, asserted not assumed.
- (e) ⛔ **READ THE VTS PRIOR FIRST (Langston):** the VTS lane has tagged-and-simulated `unreachable` since reorg-B3.3, and `strong_bull_trend` is a **named reach-active control in the FEEVIABILITY baseline.** Read that record before touching the active path, **with its bias stated — VTS books at the mark, so it OVERSTATES.**

### OBJ-3 — Choose exits by net result on data we already hold
**From:** §1b, and Kyle's objection to a measure-only batch.
**Change:** compare current geometry against plausible nearer and farther targets **on the existing trade record and replay machinery**, accounting for execution, unresolved positions, overlapping trades and **capital occupancy**. **Select on a later, untouched period**, then ship the supported settings through the existing configuration system.
⛔ **The objective is NET ACCOUNT GROWTH OVER CALENDAR TIME within the existing risk limits — NOT a reward-to-risk floor.** Both advisors converge on this, and the reason is decisive: **a 1:1 system winning 60 % makes money; a 2:1 system winning 30 % loses it.** Moving a target also changes the chance of reaching it and how long capital is tied up; a ratio rule optimises one of those and silently damages the other two.
⚠️ **`UNAUDITED` — the two corpora that cannot carry this:** the 173,952-row counterfactual set is **VTS-only with unresolved extreme values** (`#1051` / `B-VPNL-WRITER-BOUND`), and the expectancy kernel's probability **does not respond to target distance** (`net-expectancy-kernel.ts:105`), so it cannot select a target by itself. **Both stated here rather than discovered at Step 8.**
⛔⛔ **PRE-REGISTERED n-FLOOR, AND LANGSTON WILL HOLD ME TO IT AT STEP 4 — r1's plan to “ship the supported settings” COULD NOT HAVE BEEN HONOURED.** A held-out split of n=29 leaves **~14**, where the standard error on a win rate is **~13 pp** against an effect I have already called indistinguishable from noise at 4 pp. ⇒ ⛔ **BELOW THE FLOOR, OBJ-3 SHIPS NOTHING.** It publishes the curve **with bands** and an explicit **`DOES-NOT-DISCRIMINATE`** verdict, and the batch closes saying so.
✅ **AND KYLE'S OBJECTION IS STILL SATISFIED, which is why this is honest rather than a retreat: OBJ-1 and OBJ-2 change behaviour, so the batch is NOT measure-only even when OBJ-3 lands INCONCLUSIVE.** ⛔ **Stating that here is deliberate — the alternative is reaching for a setting to ship, which converts noise into a live config change carrying a governance record that calls it evidence-based. That is worse than measuring.**
**VERIFICATION:** (a) the n-floor is declared **before** any comparison is run, with the power calculation shown; (b) **if the floor is met**, the chosen setting beats the incumbent on the held-out period on net growth per unit time, denominator and holding-period distribution published beside it; (c) **if it is not met**, the published output is the banded curve plus `DOES-NOT-DISCRIMINATE`, **and no config row changes.**

### OBJ-4 — Add only the records genuinely missing
**From:** §0 row 8.
**Change:** record the excursion in ATR units — what makes a **derived** ceiling possible at all. ✅ **Hold duration and the signal's own target already exist — do not re-add them.**

⛔ **r2 — LANGSTON FOUND THIS UNDER-SPECIFIED TWICE, AND BOTH FIXES ARE FREE AT THE SAME SITE:**
- ⛔ **(a) NAME THE ATR BASIS, OR THE DERIVED CEILING APPLIES TO NEITHER GATE.** Gate A compares against the **clamped `effectiveATR`**; Gate B against the **raw MCE ATR**. An excursion distribution recorded in a *third* basis derives a ceiling that governs nothing. ⇒ **record at the guard's basis and SAY SO in the column's own documentation.** *(His standing `#3711` ruling already forbids quoting effectiveATR-basis figures against MCE-ATR ones.)*
- ⛔⛔ **(b) MFE ALONE CANNOT ANSWER THE QUESTION THIS OBJECTIVE EXISTS FOR.** Favourable excursion is **censored by the stop and by the exit**, so what a stopped-out trade records is *MFE conditional on having been stopped out* — **a biased sub-population.** ⇒ **record MAE ALONGSIDE MFE, with time-to-each.** Same site, same cost. ✅ **And that joint distribution IS first-passage in substance without needing the full analytic treatment.**

✅✅ **r3 — AND IT ALSO CARRIES THE DISCHARGE INSTRUMENT FOR OBJ-2 (Langston APPROVED the fold, with the field list as his condition).** §1c's direction leg is discharged on algebra; the **margin** leg has no corpus — measured, not assumed: `signal_eval_archive`, `crypto_spot`, `captured_at ≥ 2026-09-05`, **n = 13,058,183 rows; 567,681 carry the probability input; 153,590 carry the geometry; ZERO carry both.** ⛔ **And it is structural rather than sparse: a row is ONE `reject_stage` — the probability input is written at `pre_filter`, the geometry at `sqe`/`admitted`. The joint is empty BY CONSTRUCTION.** *(My first query returned "zero cycles" and I nearly reported it as a result; a zero from an instrument that cannot reach the joint is REACH, not a finding — `#661` leg 1.)* ⛔ **`final_score` is rejected as the salvage: it is RETIRED as the ranking key (`ready_to_buy_service.ts:1405`/`:1415`/`:1423`/`:1428`, `#558 A1`; the live key is the expected R-multiple, `SYSTEM_MANUAL:240`, computed at `:1780` and sorted at `:1884`). A gap in a key that no longer selects is not evidence.**

⇒ **PERSIST, PER SELECTION CYCLE PER CANDIDATE, ALL FIVE — four numbers and two labels, and the labels are the part that makes it answerable:**
| field | why it is not optional |
|---|---|
| `distTarget`, `distStop` | the geometry the margin is a function of |
| `pWin` | `∂r/∂distTarget = pWin/distStop` — the coefficient itself |
| the `r` **actually used** | the ranking value, not a reconstruction |
| **which branch set `r`** — `chosenNetEv` override vs `netRewardToRisk` | ⛔ **otherwise the margin is measured on a MIXTURE of two different keys** |
| **a fabricated-target FLAG** (`:1794` `entry × 1.02`) | ⛔ **otherwise a candidate ranked on measured geometry cannot be separated from one ranked on a CONSTANT — two sub-populations under one ordering** |

**VERIFICATION:** (a) the column documentation names its ATR basis and it matches a named gate; (b) the joint MFE/MAE record with time-to-each is present on new rows, and a **negative control** shows a row missing either leg is refused; (c) the ceiling for at least one strategy is **derived from the recorded joint distribution** rather than chosen, and the derivation is shown; (d) **all five discharge fields present on every ranked candidate, with the two labels populated — and a negative control proving a row with an unlabelled branch or a missing fabrication flag is refused**; (e) **the OBJ-2 margin is then evaluated against §1c's coefficient and published either way**, which is also the sizing input `B-EV-TARGET-PROBABILITY` needs.

### OBJ-5 — Governance
**Tier-1 unconditional:** completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1052`) · `MEMORY_CC_B` · `PHASE_19_PLAN` row 2.4g-2 · the task-list row.
**Tier-2, judged explicitly:** **`SYSTEM_MANUAL`** — YES (the ceiling's derivation and the admission objective are architecture; §reorg-B2 documents both). **`SYSTEM_IMPACT_MAP`** — YES (§4.1 and §4.3 describe this seam).

---

## 4. THE ORDER IS BINDING

**OBJ-1 → OBJ-2 → OBJ-3, and OBJ-4 runs alongside.** OBJ-3 cannot select on costs that OBJ-1 has not corrected, and OBJ-2's window is worthless if the cost basis moves underneath it. ⛔ **Measurement-first does NOT mean measure-only: OBJ-2 changes live paper behaviour and OBJ-3 ships settings.**

---

## 5. OUT OF SCOPE — NAMED, NOT SILENT

| item | why out, and where it lives |
|---|---|
| **Moving any `min_rr` floor** | reorg-B2.3's floors are each calibrated to that strategy's own measured mean. **Nothing here justifies moving one.** |
| **The pattern pool's hardcoded 1.5/2.5** | Kyle's scope call (`#1051` item (i)). ⚠️ **It ships TWO ratios, not one:** the `atr > 0` false arm is 1 %/2 % of price ⇒ **R = 2.0**, so the pool's ratio depends on whether ATR was available. **Pick its value from its own excursion curve once OBJ-4 records it — never from outside consensus.** |
| **A maximum hold** | ✅ **Kyle's decision: none.** Both advisors agree and **Langston states plainly he does not have the 72-hour evidence.** ⚠️ **The tension, carried not buried: with no hold limit, the ceiling's `H` is a policy choice rather than an observation — OBJ-4 is what makes it well-formed.** |
| **Kelly / optimal-f sizing** | They size, they do not set geometry, and Kelly on an unreliable win-rate estimate overbets superlinearly. **Phase 25, and not before `#596` is settled.** |
| **The post-fill ratio degradation** (five September rows where the fill came in worse and nothing re-checked the ratio) | **Rule-24 outcome (2), working-as-designed-unaddressed.** Already homed by Langston against the open entry-slip item, owner CC-C. |
| **One crypto HYBRID row with a non-negative stop distance on a buy** | Langston's claim, **not yet diagnosed.** Diagnose before any measurement leans on that lane. |
| ⭐⭐ **FIXING the EV gate's target-distance bias** (§1c) | ⛔ **IN SCOPE TO NAME AND MEASURE, OUT OF SCOPE TO FIX HERE — and it must have a home before OBJ-3 selects anything (Langston's condition).** `HOME: B-EV-TARGET-PROBABILITY, owner CC-B, PHASE_19_PLAN, placed immediately after 2.4g-2 and BEFORE 2.4h` — it gates the same consumer. **Rationale for not folding it in: making `pWin` respond to target distance is a change to the selection kernel itself, which is a wider blast radius than this batch's four objectives and would need its own audit.** ✅ **OBJ-3 states plainly what it can produce that survives the bias: a comparison of exit policies at FIXED geometry is unaffected, because the bias is in how a target distance is SCORED, not in how an outcome is measured. Any comparison that VARIES target distance is contaminated and OBJ-3 will not select on one.** |
| **`B-KRAKEN-FEE-WATCH` (`#1011`, row 12.9) overlap with OBJ-1** | ⚠️ **Named per Langston's minor.** `#1011` watches whether the venue's PUBLISHED schedule has changed; **OBJ-1 wires OUR ACCOUNT'S APPLICABLE rung into the fee model.** Different objects — one is the venue's contract, the other is our position in it. ⛔ **But they share a consumer:** if OBJ-1 makes the fee model read the account rate, `#1011`'s comparison target moves from a static seed to a live read. **OBJ-1 must state which the watcher should compare against at close, and `#1011` stays deferred until it does.** |

---

## 6. EVIDENCE INDEX

| claim | object | read |
|---|---|---|
| ceiling = `c·√H`, 4.0 = √16, seeded conservatively pending calibration | `P19_REORG_B2_PRE_AUDIT.md:41-43` | at the ref |
| `strong_bull_trend` 6.0/3.0, R=2.00, exceeds 4.0 | `strong-bull-trend.ts:152-153` + 2 DB rows + live log | at the ref / 2026-09-12 |
| every `unreachable` line is `strong_bull_trend` at rr=2.00 | staging `out.log` | 2026-09-12 |
| 29 filled pattern trades: +$9.50 gross, $18.35 fees, −$8.85 net, all reconciling | paper-history API (Coltrane, independent population of 56 records incl. 4 unfilled) | 2026-09-12 |
| cost as a share: taker/taker 1.5729 %, maker/maker 0.8210 % | `closed_trades` vs `quantity×entry_price` | 2026-09-12 |
| exit mode is an outcome: maker→18/0, taker→0/34 | `closed_trades` by `close_reason` | 2026-09-12 |
| 19 strategies: QUANT 11 / PATTERN 3 / HYBRID 5 | `canonical-regime-strategy-map.ts` | at the ref |
| median hold 9.76 h; target + original stop already stored | the 29 filled rows | 2026-09-12 |

⚠️ **LIMITS BINDING THIS SCOPE:** the pattern cohort is **n=29** and is the only decision-grade lane; quant (n≈14) and hybrid (n≈9) are directional only. Staging `out.log` reaches **2026-09-10** and rotates 6–8×/day; `error.log` dailies reach **2026-08-30** — **September stderr must be captured this week or it is gone.** Coltrane's population is the API's 56 records, **not** the raw table's 58; the 29 filled pattern rows reconcile exactly between them.
