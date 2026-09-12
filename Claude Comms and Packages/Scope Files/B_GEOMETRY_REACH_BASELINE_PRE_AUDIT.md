# B-GEOMETRY-REACH-BASELINE — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **r3, 2026-09-13** · **Step 1 APPROVED at `d174ed7a9`**

> ⛔ **THE AUDIT COMES FIRST AND THE PLAN FALLS OUT OF IT.** Every plan item back-references the finding it derives from; anything with no audit treatment is flagged `UNAUDITED`.

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED (scope r11) | NOW (audit) | REASON |
|---|---|---|---|
| 1 | ⛔ **TWO reachability gate sites** — signal-gen and the active path. | ⭐⭐ **FOUR.** Signal-gen, active crypto, **VTS crypto**, **xStock VTS**. | Census at the ref, §1a. `vts-runner.ts:1719-1723` and `xstock_spot/eval-cycle.ts:722-726` both resolve and pass `reachAtrMax`, and r11 named neither. |
| 2 | OBJ-A is a code change **plus per-call-site work**, implied. | ✅ **ONE resolver change reaches all four sites** — none of them needs editing. | All four call `getPerClassTargetGate(assetClass, strategy)`, which **already takes `strategy`** and discards it for reach (`expectancy.ts:206`). |
| 3 | OBJ-A ships **"CRYPTO ONLY"**, read as *the active crypto path*. | ⚠️ **It reaches the VTS CRYPTO LANE TOO — and that is the lane the seven values were DERIVED from.** | §1b. Not a defect; a **feedback** property that has to be stamped. |

---

## 1. THE AUDIT

### 1a. ⛔⛔ COMPONENT CENSUS — FOUR GATE SITES, NOT TWO (§9.5(a), `git grep` at the ref, tests excluded)

**Who READS the constant:** ⭐ **exactly ONE** — `expectancy.ts:211`, inside `getPerClassTargetGate`. **Stated explicitly because an asserted absence needs presence-evidence: there is no second read site anywhere in `server/`, `shared/`, `client/` or `scripts/`.** *(Independently confirmed by Langston at `d174ed7a9`.)*

**Who CONSUMES it as a gate — four, and r11 named two:**

| # | site | lane | ATR basis | disposition on fail |
|---|---|---|---|---|
| **A** | `strategy-helpers.ts:422` (`validateReachability`, `:386-389`) | signal generation, **all lanes** | **clamped `effectiveATR`** | drop, or `tag` under reorg-B3.3 |
| **B** | `signal-orchestrator.ts:1909` → `signal-target-normalizer.ts:111` | **active crypto** | raw MCE ATR | `return null` at `:1925` |
| **C** | ⭐ **`vts-runner.ts:1719-1723`** | **VTS crypto** | raw MCE ATR | sets `vtsGateVerdict`, **tags — does not drop** |
| **D** | ⭐ **`xstock_spot/eval-cycle.ts:722-726`** | **xStock VTS** | raw MCE ATR | sets `vtsGateVerdict`, tags |

⇒ ✅ **AND THIS IS FAVOURABLE: all four resolve through the SAME function, which already accepts `strategy` and throws it away for reach.** So OBJ-A's single change at `expectancy.ts:206/211` propagates to **all four sites with no call-site edits.** ⛔ **But the blast radius is wider than the scope states, and that is the finding.**

**Who RECORDS or DISPLAYS it — four more, all of which go stale at OBJ-A:**
- `decision-provenance.ts:112` — **persists** `reach_atr_max` into `resolvedSet` *(Langston's rider 1)*
- `guard-eval-tracker.ts:26,55` — the reach-drop counter, comment *">4 = the live reach_atr_max"* *(rider 2; the counter `#696` homed for reading reach-tail movement)*
- `strategy-helpers.ts:365` — type comment *"per-class max ATRs-to-target"*
- `client/src/components/vts/vts-shared.tsx:244` — UI label *"dropped by reachability > per-class"* ⭐ **found by this census, named by nobody**
- `skipped-signals-logger.ts:28` / `signal-target-normalizer.ts:13,24,46` / `b72-warmup.ts:362` — reason label, docstrings, boot list

### 1b. ⭐⭐ THE FINDING THAT CHANGES THE PLAN — OBJ-A EDITS THE LANE ITS OWN EVIDENCE COMES FROM

Gate **C** is the **VTS crypto lane**. ⛔ **That is the lane the seven ceiling values were derived from** — all of §1b's hold figures are `vts_open_trades`.

⛔⛔ **r1 SAID THE FORWARD CORPUS IS CONTAMINATED AT GENERATION. THAT IS WRONG FOR LANES C AND D, AND THE SENTENCE IS STRUCK.** Verified at the ref: `vts-runner.ts:1745-1768` sets `vtsGateVerdict` and **simulates on the NATIVE target**, and `strategy-helpers.ts:427-440` makes Gate A non-dropping on the VTS path. ⇒ ✅ **post-deploy VTS still generates uncensored geometry AND realised outcome for exactly the trades the new ceilings refuse. The forward corpus is NOT contaminated at generation.**

⭐⭐ **BUT THE SENTENCE IS TRUE OF *GATE B*, AND THAT IS A REAL FINDING THAT WAS SITTING ON THE WRONG ROW.** The **active crypto** path **enforces and DROPS** (`signal-orchestrator.ts:1925`). ⇒ ⛔ **`closed_trades` is HARD-CENSORED at deploy, permanently: after OBJ-A, no active-path trade will exist for geometry the tightened ceilings refuse.** **The pre-deploy `closed_trades` corpus is the only clean active-path measurement of the old regime that will ever exist.**
⚠️ **r3 CORRECTION — r2 SAID *"AND NO TAG SURVIVES IT"* AND THAT OVERSTATES GATE B (Langston, re-derived by me at the ref).** The **per-trade record** is censored; a **RATE** is not. `signal-orchestrator.ts:1922` fires `recordActivePostSqeReject(mode, class, reason)` on the same drop, and the comment above it names the reasons explicitly — *"invalid_geometry / rr_below_min / invalid_atr / **unreachable**"*. ✅ **So the post-deploy refusal RATE stays observable on the active path, and it is the instrument that can size the `UNAUDITED` forward-feedback magnitude without waiting on `B-EXCURSION-RECORD`.**
⚠️ **ITS REACH, STATED BEFORE ITS SILENCE IS USED AS EVIDENCE (rule 29):** the call is guarded `if (_fClass)`, and `_fClass` at `:562-564` is `undefined` for any class outside crypto and xStock. ✅ **The DENOMINATOR (`recordActiveSignalsGenerated`, `:565`) carries the IDENTICAL guard, so numerator and denominator share one reach and the rate is internally consistent — it is blind only to a future third asset class, which is a bounded and stated limit rather than an unknown one.**
---

## §1b-bis — ⛔⛔ THE BLOCKER, ANSWERED AT THE DATA: `vts_open_trades` IS TWO POPULATIONS, THE PREDICATE WAS NOWHERE ON THE RECORD, AND SHADOW WAS IN

⛔ **LANGSTON IS RIGHT AND THE ANSWER IS THE ONE THAT COSTS ME.** The seven-value table stated its population as *"VTS crypto, closed, `opened_at >= 2026-08-01`, n = 28,020"* and **named no lane predicate at all.** ✅ **RE-DERIVED, AND THE POOLED COUNT REPRODUCES TO THE ROW: n = 28,020.** => **the shadow lane was in.**

✅ **THE DISCRIMINATOR IS CLEAN, AND I CHECKED IT BEFORE USING IT.** Two writers land here: the VTS learning path and reorg-B4's shadow lane (`registerOpenShadowTrade`, `vts-runner.ts:888`, id minted with a `shadow_` prefix at `:915`, `shadow: true` into the context jsonb at `:959`). **MEASURED, crypto, `opened_at >= 2026-08-01`: the id-prefix test and `context->>'shadow'='true'` agree on 29,873 of 29,873 rows — 27,370 shadow (both true) / 2,503 VTS (both false). ZERO disagreement, so either predicate is sound.**

### ⭐⭐ BUT THE CORPUS IS LANE-**SEGREGATED**, NOT LANE-MIXED — AND THAT IS WORSE THAN POOLING, NOT BETTER

**MEASURED per strategy, crypto, closed, `opened_at >= 2026-08-01` (the identical population, now split):**

| strategy | n shadow | median shadow | n VTS | median VTS | **pooled (what I shipped)** |
|---|---|---|---|---|---|
| `reverse_impulse` | 476 | 1.65 h | **84** | **3.46 h** | 1.77 h |
| `sma_trend_ride` | 1,361 | 3.89 h | 8 | 13.14 h | 3.89 h |
| `range_trade` | **0** | — | 156 | 5.22 h | 5.22 h |
| `inside_bar_reversal` | 524 | 5.55 h | **0** | — | 5.55 h |
| `volatility_edge` | 19,123 | 6.01 h | 10 | 1.80 h | 6.01 h |
| `morning_star` | 3,137 | 6.34 h | **253** | **5.25 h** | 6.02 h |
| `pivot_shift` | 433 | 7.41 h | 3 | 6.27 h | 7.40 h |
| `support_bounce` | 135 | 13.30 h | 7 | 1.02 h | 13.27 h |
| `strong_bull_trend` | **0** | — | 1,652 | 15.44 h | 15.44 h |
| ⚠️ `vwap_pullback` | 328 | **14.10 h** | **252** | **46.36 h** | **40.97 h** |

=> ⛔ **SEVEN OF THE TEN ROWS WERE NEVER A MIXTURE — THEY ARE ONE LANE WEARING A POOLED LABEL.** Two are pure VTS (`strong_bull_trend`, `range_trade`); five are 99.4 %+ shadow. **So most of the table is numerically unchanged — and that is LUCK, not method.** ⭐ **"Right by accident" is the same finding as the census itself: I did not know which population I was holding, and the predicate is what would have told me.**

### ⛔ THE THREE ROWS WHERE IT ACTUALLY BITES — AND ONE OF THEM REVERSES A CLAIM IN THE SCOPE

1. ⛔⛔ **`vwap_pullback` IS BIMODAL AND ITS POOLED VALUE IS AN ARTIFACT: 14.10 h shadow vs 46.36 h VTS, 3.3x apart.** The pooled 40.97 h sat on the VTS mode. ⭐ **AND THIS REVERSES THE SCOPE'S OWN SENTENCE:** the square root of 14.10 is **3.75**, which **TIGHTENS** against the live 4.0. => **"`vwap_pullback` is the only row that would LOOSEN the ceiling" IS A POOLING ARTIFACT and is struck.** On the shadow lane it tightens; on the VTS lane it loosens. **It still does not ship — but the reason is now DISAGREEMENT BETWEEN LANES, not direction.**
2. **`reverse_impulse`: 1.65 h shadow vs 3.46 h VTS, 2.1x apart, and BOTH lanes have a usable n (476 / 84).** The shipped 1.77 h is effectively the shadow value. Square roots: 1.28 vs 1.86.
3. **`morning_star`: 6.34 h vs 5.25 h**, both usable (3,137 / 253) — modest, same side of the default.

### ⛔⛔ AND THE CONSEQUENCE FOR OBJ-A IS NOT A CAVEAT — IT IS A SHIPPABILITY QUESTION I CANNOT SETTLE ALONE

**IF the rule is "derive `H` on the clean VTS lane only", then FIVE of the seven tightening strategies have no usable clean-lane sample:** `inside_bar_reversal` **0**, `pivot_shift` **3**, `support_bounce` **7**, `sma_trend_ride` **8**, `volatility_edge` **10**. => ⛔ **OBJ-A AS SCOPED IS NOT SHIPPABLE ON THE CLEAN LANE.** The four strategies with an adequate VTS sample are `strong_bull_trend` (1,652), `morning_star` (253), `range_trade` (156) and `reverse_impulse` (84) — **and only `reverse_impulse` is among the seven the ceiling is 1.5-3.0x too generous for.**

⭐ **I AM NOT RULING ON WHICH LANE IS RIGHT, AND I DO NOT THINK I SHOULD.** There is a real argument each way and it is a design question, not a measurement: the shadow lane shadows actual **RTB promotions**, so its holds may be CLOSER to what an active trade would do than the VTS learning lane's; the VTS lane is the one whose verdict field the whole gate analysis is built around. **This is the decision that determines whether OBJ-A ships as seven rows, as four, or not at all — Langston's call, or Kyle's.**

### ⚠️ A SECOND CENSORING PROBLEM, MEASURED HERE AND NAMED BY NEITHER OF US: **BOTH LANES ARE RIGHT-CENSORED, AT DIFFERENT WALLS, 3.5x APART**

**MEASURED, same population:** shadow **p99 48.01 h, max 48.03 h**; VTS **p99 168.01 h, max 168.02 h**. => **clean TTL walls at 48 h and 168 h.** `vts-runner.ts:4045` names the shadow one: an expiring shadow closes with reason `shadow_max_hold`.
=> ⛔ **SO `H` IS NOT "MEASURED" — IT IS MEASURED UP TO A HOUSEKEEPING TTL, AND THE TWO LANES USE DIFFERENT ONES.** **6.11 % of shadow rows (1,563 of 25,592) sit within 1 % of their wall.**
✅ **WHAT SURVIVES, STATED HONESTLY RATHER THAN ALARMINGLY: THE MEDIAN.** A median is unaffected by right-censoring while under half the rows are censored, and **14 of the 15 strategy-by-lane cells with n >= 20 are under 21 %.** ⛔ **THE ONE EXCEPTION IS `vwap_pullback` SHADOW AT 48.17 % — one row short of its median being undefined — so that cell's 14.10 h is a FLOOR, not an estimate.**
⛔ **WHAT DOES NOT SURVIVE IS THE MEAN AND EVERY UPPER QUANTILE: a shadow mean of 11.55 h against a median of 6.01 h is a statistic the TTL chose.** => **STANDING RULE ADDED: `H` is taken as a MEDIAN, never a mean, and the censored share is published per cell.**

✅ **AND THE FOUR STRATEGIES MY TABLE SILENTLY DROPPED ARE NAMED, because an unstated n-threshold is the same defect as an unstated lane predicate:** `mean_reversion` (30), `vwap_bounce` (35), `defensive_hedge` (12), `dhma` (1). **The threshold was never written down; it is now n >= 100, stated.**

---


⇒ ⭐ **AND THE FORWARD RISK ON THE VTS LANES IS *ANALYSIS-TIME POPULATION SELECTION*, NOT DATA GENERATION — which our own code advertises.** `vts-runner.ts:1743`: *"verdict rides onto the trade record (`vtsGateVerdict`) so analysis can always filter back to"* the gate-passing view. **Filter to `vtsGateVerdict='passed'` and re-derive reach off it, and that IS the circularity.** ⛔ **This is not a new problem — it is the one reorg-B3.2 was built for, in its own words at `:1736`: *"you cannot calibrate the RR floor from a population the floor already filtered."*** ★ **r1 treated the purpose-built answer as a mitigating detail; it is the disposition.**

⇒ ⭐ **AND IT ANSWERS KYLE'S ORIGINAL QUESTION AT THE CODE, which no earlier revision did: *"why are we only making this change for paper mode and not in the VTS also?"* — WE ARE NOT. The change reaches VTS automatically, through the shared resolver, on both crypto and xStock lanes.** What differs is only which rows are seeded.

### 1c. ⚠️ WHAT THE `vtsGateVerdict` DISTRIBUTION DOES AT DEPLOY

Gates **C** and **D** write `vtsGateVerdict ∈ {passed, rr_below_min, unreachable}`. Tightening seven crypto ceilings **moves trades from `passed` into `unreachable` in the VTS record**, with no change in what is simulated.
⇒ ⛔ **Any analysis grouping on `vtsGateVerdict` across the deploy reads two populations as one** — the same shape as rider 1, on a second field, and **the same defect that made §1b's own "3.8× longer" claim unusable.**

---

## 2. THE PLAN — each item back-references its finding

### P-1 — A STANDING POPULATION RULE, and the boundary stamp beneath it *(from §1b, §1c)*
⭐⭐ **CONDITION 1. Any re-derivation of `reach_atr_max` — and of `min_rr`, which is the same shape — runs on the UNFILTERED VTS population, INCLUDING `unreachable` and `rr_below_min` rows, and STATES that it did.** ⛔ **A stamp alone is necessary and NOT sufficient: it marks where the regime changed and does nothing about selecting on the gate's own verdict.**
✅ **Executable today, verified at the ref:** the verdict persists (`vts-runner.ts:2306`, `eval-cycle.ts:1071`) and `atrAtOpen` is stamped (`:2312`, `:1072`), so any row's `atrsToTarget` reconstructs against any candidate ceiling.

⛔⛔ **CONDITION 4 — r2'S NUMBER WAS ARITHMETICALLY EXACT AND WRONG ON THE OBJECT, AND I COMMITTED CONDITION 3'S OWN ERROR ONE SECTION AFTER WRITING IT.** r2 reported *"1,029 of 32,085 rows (3.21 %) hold `atrAtOpen = 0`"*. ✅ **THE COUNTS REPRODUCE EXACTLY — AND 3.21 % IS A POOLED CRYPTO + xSTOCK + SHADOW RATE, which is precisely the mixture condition 3 exists to forbid.**

✅ **RE-DERIVED BY ME, SPLIT BY CLASS x LANE, `opened_at >= 2026-08-01`, rows carrying the key:**

| class | lane | `atrAtOpen = 0` | n | share |
|---|---|---|---|---|
| `crypto_spot` | shadow | **0** | 27,370 | **0.00 %** |
| `crypto_spot` | vts_learning | **0** | 2,503 | **0.00 %** |
| `xstock_spot` | **shadow** | **1,029** | **1,029** | ⛔ **100.00 %** |
| `xstock_spot` | vts_learning | **0** | 1,183 | **0.00 %** |

✅ **POSITIVE CONTROL (rule 29(b)) — the same instrument on the three cells that are NOT zero returns live ATRs: crypto shadow min 0.000031 / max 57.6064; crypto VTS 0.000005 / 591.3429; xStock VTS 0.000181 / 21.9640.** => **the zeros are the data, not the query.**

=> ⭐⭐ **AND SPLIT, IT IS A SHARPER FINDING THAN THE POOLED ONE WAS — NOT A SOFTER ONE. 1,029 of 1,029 is not "a sentinel sometimes fires"; it is ONE WRITER ON ONE CLASS THAT NEVER STAMPS A REAL ATR, on every row it has ever written.** Crypto is clean on both lanes and xStock's own VTS lane is clean, so the defect is exactly the xStock **shadow** writer.
=> ⛔ **THE `atrAtOpen = 0` EXCLUSION STAYS, BUT IT IS NOT THE GUARD AND r2 WAS WRONG TO CALL IT ONE (Langston).** The row-class predicate excludes all 1,029 **by construction and for the right reason** — they are xStock shadow rows and this batch ships crypto. **The UNKNOWN-exclusion is a backstop behind the predicate, not a substitute for it.**
=> ✅ **PROMOTED, on its own merits: the xStock-shadow `atrAtOpen` writer defect goes to `B-TRADE-RECORD-JOINABILITY`'s WRITER class, beside `realDiAtOpen` NULL on all 3,685 — the identical shape, a writer that stamps nothing 100 % of the time.**

⛔⛔ **AND THE `diAtOpen` PAIRING r2 PROPOSED IS WITHDRAWN — REFUSED AS WRONG OBJECT, AND HE IS RIGHT.** At the **shadow** writer it is `?? 50`; at the **VTS** writer it is the **literal `50`**, deliberate and documented in place as a live trailing-engine input rather than telemetry, **with `realDiAtOpen` and `kernelDiInputAtOpen` beside it as the honest capture** — the OPPOSITE of absent-as-valid, with its successor already shipped. **My 14.8 % was the same pooled-mixture error a third time: 100 % on verdict-bearing rows by construction, 22 of 27,370 on shadow.** => **`atrAtOpen` stands alone; nothing about `diAtOpen` is carried forward.**

✅ **AND CONDITION 1 MUST SAY WHAT THE POPULATION *IS*, NOT ONLY WHAT IT IS NOT (Langston).** Filtering to verdict-bearing rows drops **27,370 of 29,873 crypto rows** — the shadow lane — not the 1,029. **The unfiltered rule alone does not name a population; the lane predicate does, and it is now mandatory on every re-derivation.**

**AND THE BOUNDARY STAMP, beneath the rule:**
⛔ **BEFORE the resolver change lands**, not after. Three fields change basis or distribution at the same instant: `decision-provenance.resolvedSet.reach_atr_max` (per-class → per-strategy), `guard-eval-tracker`'s reach buckets, and `vtsGateVerdict` on both VTS lanes.
**VERIFICATION:** the deploy sha is recorded against each of the three, and a query grouping any of them across the boundary **refuses or splits** rather than pooling.

### P-2 — The resolver change *(from §1a; scope OBJ-A parts 1–2)*
`expectancy.ts:206/211` per-(strategy × class), **plus the fail-closed `reach_atr_max_unknown_floor` on the FULL key set — crypto, xStock, and global `*` — mirroring `min_rr_unknown_floor`'s three rows and its migration-level `RAISE EXCEPTION`, NOT `b72-warmup`'s boot list.**
✅ **No call-site edits: all four gates inherit it.**
⛔⛔ **CONDITION 2 — THE WIDENED RADIUS IS TOKEN-CORRECTNESS, AND r1'S FOUR-SITE FRAMING HID IT.** ⭐ **TODAY reach is token-INDEPENDENT, so a drifted token can only mis-resolve `min_rr`. AFTER OBJ-A every one of those tokens ALSO PICKS A REACH CEILING.**

✅ **ENUMERATED AT THE REF, UNBOUNDED, NOT TRUNCATED — EXACTLY 22 NON-TEST CALL SITES** (a 23rd hit is the `strategy-helpers.ts:358` docstring, not a call). ⚠️ **Langston's own first grep truncated at 40 lines and hid two of them; mine is printed whole. "Enumerate, don't truncate" cost us both a pass on the same census.**

⛔⛔ **AND THE SPLIT IS THE FINDING, NOT THE COUNT: 18 STATIC TOKENS / 4 DYNAMIC — AND A STATIC TOKEN TABLE ASSERTS THE 18 WHILE BEING STRUCTURALLY UNABLE TO REACH THE 4, WHICH ARE THE ONLY SITES DRIFT CAN ENTER.**
- **The 4 DYNAMIC (a variable reaches the resolver):** `signal-orchestrator.ts:1903` (`strategyId`), `vts-runner.ts:1719` (`strategy`), `xstock_spot/eval-cycle.ts:722` (`strategyKey`), `decision-provenance.ts:111` (`strategy`). ✅ **These are also, exactly, the four gate/record sites — so the harm surface and the enforcement surface are the same four rows.**
- **The 18 STATIC:** eight in-class detects (`strategy-engine.ts:299/434/568/680/781/890/993/1615`) and ten strategy files. ⚠️ **TWO OF THE 18 ARE NOT LITERALS — `orb.ts:298` and `strong-bull-trend.ts:176` pass a module constant `STRATEGY_KEY`.** A test that asserts a literal at each site silently skips those two; the assertion must resolve the constant.

⇒ ✅ **SO THE VERIFICATION IS TWO TESTS, NOT ONE:** **(a)** assert the **FULL 22-row token table** — every caller's token resolves to its own strategy's ceiling, with the two module constants resolved rather than pattern-matched; **(b)** at the **four dynamic sites**, assert the token SOURCE is the canonical SSOT (`normalizeStrategy`) rather than a raw upstream string, because that is the only place an unvetted token can arrive.

⛔ **AND `canonical===null` IS THE WRONG CONTROL, WHICH IS WHY THE ALIAS MAP IS ENUMERATED RATHER THAN DESCRIBED.** The canonicalizer **ALIASES**, so a WRONG-BUT-VALID token silently inherits ANOTHER STRATEGY'S CEILING and the unknown floor never fires. **`STRATEGY_NAME_NORMALIZATION` (`canonical-regime-strategy-map.ts:~585-614`) enumerated, and it is finite and knowable today:**
- ✅ **MOST ENTRIES ARE PASCAL-CASE SPELLINGS OF THE SAME STRATEGY** (`VolatilityEdge` to `volatility_edge`, `PivotShift` to `pivot_shift`, and so on) ⇒ **same ceiling after OBJ-A, BENIGN by construction.**
- ✅ **`range_trading` to `range_trade` is snake-case drift from the `StrategyType` union, cured at the SSOT (`:613`)** ⇒ **same strategy, same ceiling, BENIGN.**
- ⚠️ **TWO ARE CROSS-NAME RENAMES AND THEY ARE THE ONLY ROWS THAT CAN LAND ON A DIFFERENT CEILING: `ImpulseChaser` to `liquidity_trap` and `TriangleBreakout` to `abcd_long`.** ✅ **Both are legacy names for their target strategy, so inheriting its ceiling is CORRECT — but it is correct by a fact about the rename, not by anything the gate checks, so it is PUBLISHED rather than assumed.**
⇒ ✅ **PUBLISHED CONCLUSION: after OBJ-A, ZERO alias pairs resolve to a ceiling belonging to a materially different strategy.** ⛔ **That is a statement about TODAY'S map and it must be RE-RUN whenever a row is added — the finite set is the deliverable, not the reassurance.**
**VERIFICATION:** (a) ⛔ **assert the FULL ~22-row token table**, not a spot check — every caller's token resolves to its own strategy's ceiling; (b) a negative control per gate site: an unknown token resolves to the unknown floor, **not** 4.0, asserted at each of the four; (c) the migration's own seed-completeness `RAISE EXCEPTION`.

### P-3 — Seed the seven crypto rows *(from scope §1b)*
⛔ **Crypto calibration rows only. `vwap_pullback` excluded (it would loosen). xStock excluded (`c` is class-dependent, zero rows).** ⚠️ **"Crypto only" governs THESE rows and NOT P-2's safety row.**
⚠️ **CONDITION 3 — THE IMPLIED REFUSAL RATE IS TWO NUMBERS, NOT ONE.** Gate A runs on the **CLAMPED `effectiveATR`** (floored by `getEffectiveATR`) ⇒ **larger ATR ⇒ smaller `atrsToTarget` ⇒ Gate A is SYSTEMATICALLY MORE PERMISSIVE than B/C/D on identical geometry.** ⛔ **One pooled rate is a mixture of two gates that do not agree.**
**VERIFICATION:** each value with n, denominator, bootstrapped CI, the **policy-tightening** label, and its implied refusal rate **published PER ATR BASIS — clamped (Gate A) and raw (Gates B/C/D) separately.**

### P-4 — Correct every stale consumer IN THE SAME COMMIT *(from §1a)*
The docstring (`signal-target-normalizer.ts:24-29`), the type comment (`strategy-helpers.ts:365`), the tracker comment (`guard-eval-tracker.ts:55`), the reason label, **and the client UI label (`vts-shared.tsx:244`) — which this census found and nobody had named.**
⛔ **A stale comment on a live instrument is a first-class false source** (Langston's own 09-07 retraction).
**VERIFICATION:** a class grep **by meaning, not by wording** — see P-5 — returns no surviving "per-class" description of a now-per-strategy value.

### P-5 — ⭐ CLOSE THE GREP'S OWN BLIND SPOT *(from Langston's residual)*
⛔⛔ **The six-pattern grep in scope OBJ-D is keyed on the withdrawn WORDING, not the withdrawn PROPOSITION — so it cannot see `PHASE_19_PLAN:530`'s compressed *"4.00 = the seeded 16 h"*, which asserts the same retracted thing in different words.** ★ **That is this batch's own lesson landing on its own instrument: the shape of the search decided what it could find.**
**VERIFICATION:** one pass **by meaning** over every artifact naming the batch, in addition to the pattern grep, with both recorded at close.

---

## 3. WHAT IS NOT AUDITED HERE

`UNAUDITED` — **the magnitude of the forward feedback in §1b.** How much the post-deploy VTS corpus shifts is not estimated, because it needs the excursion record (`B-EXCURSION-RECORD`) to measure properly. **Named rather than silently assumed small.**
