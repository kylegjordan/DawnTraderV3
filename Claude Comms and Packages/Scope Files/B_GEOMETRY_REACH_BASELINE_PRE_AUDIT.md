# B-GEOMETRY-REACH-BASELINE — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **r10, 2026-09-13** · **Step 1 APPROVED at `d174ed7a9`**

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

---

## §1b-ter — ⭐⭐ THE ARBITER, **PRE-REGISTERED BEFORE IT RUNS** — AND MY SET ARITHMETIC CORRECTED FIRST

### ⛔⛔ THE CORRECTION, BECAUSE IT INVERTS WHICH ROWS ARE CANDIDATES

**r3's dispatch said *"five of the seven tightening strategies have no usable clean-lane sample"* and *"only `reverse_impulse` is among the seven."* BOTH ARE WRONG (Langston), and I re-derived the set from §1a rather than from memory:**
- ⛔ **`support_bounce` IS NOT ONE OF THE SEVEN.** §1a grades it **3.64 vs 4.0, *"~right"***, and OBJ-A part 3 seeds the seven. ⇒ **FOUR of the seven lack a usable clean-lane sample, not five:** `inside_bar_reversal` **0**, `pivot_shift` **3**, `sma_trend_ride` **8**, `volatility_edge` **10**.
- ⛔ **AND THE SEVEN CONTAIN THREE ROWS WITH A CLEAN-LANE SAMPLE, NOT ONE:** `morning_star` (VTS **253**), `range_trade` (VTS **156**), `reverse_impulse` (VTS **84**).
- ⭐ **THE PART THAT MAKES IT A REAL ERROR RATHER THAN A MISCOUNT: I NAMED THE ONE ROW THAT FAILS MY OWN NEW n ≥ 100 THRESHOLD AND DROPPED THE TWO THAT PASS IT** — in the same document where I had just written the threshold down.

### ✅ WHAT SHIPS UNDER THE RULING, AND WHY EACH ROW IS AT ITS **LOOSER** LANE

✅ **OBJ-A parts 1, 2 and 4 ship on the finding the split leaves untouched.** ⭐ **Part 2 stands on its own legs as a §8 #10 defect regardless of the calibration: `reach_atr_max` has no fail-closed analogue to `min_rr`'s, so an uncanonicalized token lands on the permissive 4.0 TODAY.**
⛔ **Part 3 seeds only rows ROBUST TO THE LANE QUESTION BY CONSTRUCTION — both lanes usable, and the LOOSER lane still tightening materially:**

| row | lane taken | value | vs live 4.0 | n at that lane |
|---|---|---|---|---|
| `morning_star` | **shadow** (the looser) | **2.52** | 1.59x tighter | 3,137 |
| `reverse_impulse` | **VTS** (the looser) | **1.86** | 2.15x tighter | **84** |

⚠️ **`reverse_impulse`'s n = 84 FAILS THE n ≥ 100 THRESHOLD THIS DOCUMENT SET.** ✅ **It ships with n printed beside the value (Langston's own preference) — and the justification is stated rather than assumed: the threshold governs a value we DERIVE FROM, and this row is taken at its looser lane precisely so that being wrong about the sample moves the ceiling toward the status quo, not past it.** ⛔ **If the arbiter does not clear it, it drops.**
⛔ **THE OTHER FIVE DO NOT SHIP ON THIS CORPUS — INCLUDING `range_trade`, WHICH IS MY CLEANEST PURE-VTS ROW.** ⭐ **Shipping it would assert the VTS lane by preference, which is exactly the thing neither of us is willing to assert.**

### ⛔⛔ THE PRE-REGISTRATION — WRITTEN AND **COMMITTED BEFORE THE QUERY RUNS**

⭐ **This section exists in the commit that PRECEDES the result commit. That ordering is the whole evidentiary value; a pre-registration written afterwards is a description of what I did.**

**OBJECT.** `closed_trades`, `asset_class = 'crypto_spot'`, the ACTIVE path, closed rows only. **The active lane is what the ceiling actually governs; both VTS lanes are PROXIES for it, which is why neither can arbitrate the other.**
**ESTIMAND.** Per strategy: median `closed_at − opened_at`, compared against that strategy's shadow-lane and VTS-lane medians from §1b-bis, **as a ratio of DERIVED CEILINGS (√H_lane / √H_active), not of hours** — because the ceiling is what the batch ships and a ratio of hours understates the effect by its own square root.
**INCLUSION N.** ⛔ **n ≥ 30 closed active rows per strategy.** ⚠️ **STATED AS A COMPROMISE FORCED BY CORPUS SIZE, NOT AS A PRINCIPLED BAR: `closed_trades` holds ~755 rows from 2026-07-15, so n ≥ 100 would very likely admit nothing and the arbiter would return an uninformative silence I could then misread as a verdict.** 30 is the conventional floor at which a median is worth comparing.
**AGREEMENT TOLERANCE.** ⛔ **A lane TRACKS active on a strategy if the derived-ceiling ratio is within 1.25x in either direction.** ⭐ **Rationale, bound to a measured quantity rather than chosen: the observed between-lane disagreement is 1.10x / 1.45x / ≤1.81x, and the looseness this batch claims to correct is 1.5-3.0x. A tolerance LOOSER than the effect being corrected would certify a lane that cannot resolve the thing it is arbitrating.**
**DECISION RULE, fixed now.**
- **EXACTLY ONE lane within tolerance on ≥ 3 strategies** ⇒ that lane becomes the basis; the single-lane rows ship on it, `range_trade` first.
- **BOTH lanes clear, or NEITHER does** ⇒ **the batch is the two rows above.** ✅ **Both-clear resolves to two rows deliberately: if the proxies are interchangeable at this tolerance they cannot select between themselves, and the honest read is that the corpus does not answer it.**
**PRE-DECLARED THREAT TO THE ARBITER, checked in the same query rather than assumed.** Langston notes `max_hold` enforcement has been OFF on both active lanes since 2026-07-24, which is what makes the active lane uncensored and therefore the right arbiter. ⛔ **The CODE COMMENT asserts the seed (`active-execution-engine.ts:2075-2084`, *"Seeded FALSE (paper+live), so the max_holding_period branch never fires today"*) — AND A COMMENT IS NOT A LIVE VALUE.** ✅ **`module_constants.max_hold_switch` is read from the DATABASE in the same run, and the active lane's own max hold is checked for a wall the way both proxies were.** ⚠️ **AND THE CAUTION CUTS BOTH WAYS: both proxies carry a TTL wall the governed population does not, so a proxy will read SHORTER than active for structural reasons before any market fact enters.**
**WHAT A NULL RESULT MEANS, declared now so it cannot be re-read later.** ⛔ **If fewer than three strategies clear n ≥ 30, the arbiter DID NOT RUN — it did not return "no lane tracks."** ✅ **That is a silence with no reach, and it resolves to the two rows, not to a finding about the lanes.**

---

---

## §1b-quater — ⭐⭐ THE ARBITER RESULT, GRADED AGAINST THE PRE-REGISTRATION COMMITTED AT `d2c0fd65e`

✅ **THE PRE-REGISTRATION IS IN THE PARENT COMMIT AND THIS SECTION IS THE FIRST TIME THE QUERY HAS RUN.** Every threshold below was fixed before any of these numbers existed.

### ✅ THREAT CHECK 1 — PASSED, AND THE LIVE VALUE IS STRONGER THAN THE CLAIM IT CHECKED

⛔ **I read the DATABASE, not the code comment.** `module_constants`, `module_name='max_hold_switch'`, all three rows stamped **2026-07-24**:

| constant | value |
|---|---|
| `enabled_live` | **false** |
| `enabled_paper` | **false** |
| ⭐ `enabled_vts` | ⛔ **TRUE** |

⇒ ⭐⭐ **THIS IS THE MECHANISM BEHIND THE 48 h / 168 h WALLS, FOUND AT THE SWITCH RATHER THAN INFERRED FROM THE SHAPE.** Max-hold enforcement is **ON for VTS and OFF for the active lane**, by one setting, on one date. **So the two proxies are censored BY CONFIGURATION and the arbiter is not — which is exactly what makes it the arbiter.**
✅ **CONFIRMED IN THE DATA: the active lane shows no wall** — p50 3.78 h, p90 20.24 h, p99 58.98 h, **max 184.93 h**, with no pile-up at any value.

### ⚠️ ONE POPULATION QUESTION THE PRE-REGISTRATION DID NOT NAME, AND I AM REPORTING BOTH READINGS RATHER THAN PICKING

**`close_reason='never_filled'` accounts for 85 of 479 crypto rows.** ⛔ **A trade that never filled has no HOLD — its `closed_at − opened_at` is time-to-abandonment — so excluding it is clearly right, AND I DID NOT PRE-REGISTER IT.** ⭐ **So it is graded both ways, and the exclusion is declared as an un-pre-registered choice rather than folded in silently.**

### ✅ THE RESULT — FILLED ONLY (the defensible population). Tolerance: derived-ceiling ratio in [0.80, 1.25]

| strategy | n active | active median | **active-derived ceiling** | shadow ratio | verdict | VTS ratio | verdict |
|---|---|---|---|---|---|---|---|
| `morning_star` | 128 | 5.76 h | **2.40** | 1.049 | ✅ **CLEARS** | 0.955 | ✅ **CLEARS** |
| `inside_bar_reversal` | 61 | 5.66 h | **2.38** | 0.990 | ✅ **CLEARS** | — | n<30 |
| `pivot_shift` | 52 | 6.33 h | **2.52** | 1.082 | ✅ **CLEARS** | 0.995 | n<30 |
| `sma_trend_ride` | 41 | 3.46 h | **1.86** | 1.060 | ✅ **CLEARS** | 1.947 | n<30 |
| `reverse_impulse` | 48 | 7.12 h | **2.67** | **0.481** | ⛔ **FAILS** | **0.697** | ⛔ **FAILS** |
| `support_bounce` | 33 | 5.80 h | **2.41** | **1.514** | ⛔ **FAILS** | 0.419 | n<30 |

### ✅ AND THE VERDICT IS ROBUST TO THE ONE THING I FAILED TO PRE-REGISTER — WHICH IS THE ONLY REASON I AM WILLING TO ACT ON IT

**Including `never_filled`, shadow clears 3 (`morning_star` 1.146, `inside_bar_reversal` 1.226, `reverse_impulse` 0.955) and VTS clears 1.** **Excluding it, shadow clears 4 and VTS clears 1.**
⇒ ✅ **SHADOW REACHES ≥3 ON BOTH READINGS; VTS REACHES 1 ON BOTH AND STRUCTURALLY CANNOT REACH 3 — it has only TWO cells with n≥30 in the whole comparison.** ⛔ **THE DECISION RULE FIRES CLEANLY: exactly one lane clears on ≥3 ⇒ THE SHADOW LANE IS THE BASIS.**
⚠️ **WHAT IS NOT ROBUST IS THE MEMBERSHIP — `reverse_impulse` clears on the inclusive reading and fails hard on the filled-only one — and that row is exactly where it matters, so it is treated below on the filled-only reading, which is the one with a defensible population.**

### ⛔⛔ THE ARBITER DISQUALIFIES `reverse_impulse`, WHICH THE RULING PROVISIONALLY SHIPPED — AND THE DIRECTION IS THE ALARMING ONE

**Its active median is 7.12 h, implying a ceiling of 2.67 — HIGHER THAN BOTH PROXIES (shadow 1.29, VTS 1.86).** ⇒ ⛔⛔ **SEEDING 1.86 WOULD HAVE TIGHTENED IT TO WELL BELOW WHAT THE ACTIVE LANE ACTUALLY HOLDS. That is a LIVE THROTTLE, and it is precisely the failure the ruling's fix 3 moved the refusal rate forward to catch.** ⭐ **The arbiter caught it one step earlier, before a value was chosen — which is what an arbiter is for.**
⭐ **AND IT IS THE ROW I ARGUED FOR: r4 shipped it at n=84 against my own n≥100 bar, with the justification that taking the looser lane makes being wrong move the ceiling toward the status quo. THE ARBITER SHOWS THE "LOOSER LANE" WAS STILL 1.4x TIGHTER THAN REALITY — so the safety argument was itself derived from a proxy, and it did not hold.**

### ✅ WHAT SHIPS: **FOUR ROWS**, EACH TAKEN AT ITS SHADOW VALUE AND EACH ARBITRATED AGAINST THE UNCENSORED ACTIVE LANE

| row | shadow median | **seeded ceiling** | vs live 4.0 | arbiter |
|---|---|---|---|---|
| `pivot_shift` | 7.41 h | **2.72** | 1.47x tighter | 1.082 ✅ |
| `morning_star` | 6.34 h | **2.52** | 1.59x tighter | 1.049 ✅ **(both lanes)** |
| `inside_bar_reversal` | 5.55 h | **2.36** | 1.70x tighter | 0.990 ✅ |
| `sma_trend_ride` | 3.89 h | **1.97** | 2.03x tighter | 1.060 ✅ |

✅ **`reach_atr_max_unknown_floor` = 1.97** — the minimum over the rows ACTUALLY SEEDED, per the r13 binding, written as a literal at the migration.

### ⛔ WHAT DOES NOT SHIP, EACH WITH ITS OWN REASON RATHER THAN A SHARED ONE

- ⛔ **`reverse_impulse`** — **BOTH proxies fail the arbiter and both are tighter than active.** Not a data gap: a measured disagreement, in the dangerous direction.
- ⛔ **`range_trade`** — **cannot ship, and I want to be explicit because the ruling expected it first.** It has **ZERO shadow rows**, and the arbiter made shadow the basis. **It also has zero active rows, so the arbiter could not grade it at all.** ⭐ **My cleanest pure-VTS row is the one the arbiter is least able to speak to.**
- ⛔ **`volatility_edge`** — **active n = 11, below the pre-registered 30.** ✅ **Per the pre-declared null rule this is a SILENCE WITH NO REACH: the arbiter did not grade it, it did not clear it and it did not fail it.** Does not ship.
- ⛔ **`support_bounce`** — fails at 1.514, and was never one of the seven (§1a grades it *"~right"*).
- ⛔ **`vwap_pullback`** — unchanged: lanes disagree 3.3x, shadow cell 48.17 % censored.

### ⭐⭐ AND THE ARBITER SURFACED THE THING THAT ACTUALLY EXPLAINS THE WHOLE PROBLEM: **THE THREE POPULATIONS ARE CENSORED IN OPPOSITE DIRECTIONS**

- **The two PROXIES tag rather than drop, so they are UNCENSORED BY THE GATE — and both are TTL-censored by `enabled_vts = true`.**
- **The ACTIVE lane has no TTL — and it is CENSORED BY THE GATE ITSELF: every trade in it exists because its target passed `reach ≤ 4.0`, and nearer targets are hit sooner, so active `H` is biased SHORT by the very ceiling being calibrated.**
⇒ ⛔⛔ **THEREFORE THE ACTIVE LANE MUST NOT BECOME THE BASIS EITHER, however uncensored it looks — it is the endogeneity trap in its purest form, and `vts-runner.ts:1736` names it: *"you cannot calibrate the RR floor from a population the floor already filtered."*** ✅ **Its correct role is exactly the one it was given: an ARBITER between two proxies, never a source. That is why the ratio test compares lanes to it rather than reading values off it.**
✅ **AND IT EXPLAINS THE PATTERN IN THE TABLE: the four clearing rows are ones where the gate is NOT binding, so active and proxy agree. `reverse_impulse` is where they diverge most — which is information about that strategy, not noise.**

---

---

## §1b-quinquies — ⭐⭐ THE SYMMETRY QUESTION, ANSWERED AT THE SCHEMA — AND THE `never_filled` POPULATION IS A **CONSTANT**, NOT A RIVAL READING

⛔ **LANGSTON'S QUESTION WAS THE ONE THAT COULD HAVE VOIDED THE WHOLE RATIO: was the `never_filled` exclusion applied to BOTH SIDES?** *"A ratio filtered on one side is not a ratio."* ✅ **He was right that r5 did not say. Here is what it is.**

### ✅ ANSWER 1 — THE LANE SIDE HAS **NO NON-FILL ROW CLASS AT ALL**, SO THE EXCLUSION IS SYMMETRIC BY CONSTRUCTION

**Established three ways, each enumerated rather than sampled:**
1. ✅ **NO COLUMN.** Every column on `vts_open_trades`: `id, symbol, asset_class, entry_price, stop_loss, take_profit, position_size, dollar_value, quantity, regime, signal_type, strategy, pool, opened_at, context, inserted_at, updated_at, closed, closed_at, state, calibration_state, chosen_entry_mode, entry_fee_rate, maker_limit_price, maker_deadline`. **There is no `close_reason` and no fill flag.**
2. ✅ **NO CONTEXT KEY.** All **51** distinct `context` keys on crypto since 2026-08-01 enumerated — **none is fill-related.**
3. ⛔⛔ **r7 — THIS LEG WAS *FALSE AS WRITTEN* AND IS REPLACED (Langston; re-derived by me on the WHOLE table).** It read *"`state` takes exactly two values, `open` and `closed`"*. ⛔ **IT TAKES THREE.** Enumerated with no class filter: `closed` crypto **68,057** · `closed` xStock **8,282** · `open` crypto **1,853** · ⛔ **`weekend_suspended` xStock 113, 2026-09-08 → 09-11.**
⭐ **THAT IS EXACTLY THE THIRD ROW CLASS THE LEG ASSERTED DOES NOT EXIST** — and I produced the false claim by **enumerating the convenient population (crypto, since 08-01) and stating the result globally.** ✅ **`enumerator-blind-spot`: enumerate the TABLE, not the population you happen to be working in.**
✅ **SCOPED CORRECTLY: on CRYPTO the state set really is `{closed, open}`, so the conclusion survives — and this batch ships crypto only.**
⚠️ **FLAGGED FORWARD, because it is a real finding rather than a scoping nicety: `weekend_suspended` is a NON-TERMINAL row class on the xStock arm** — those rows have no close, so any xStock hold or excursion analysis must decide how to treat them. **Carried to `B-EXCURSION-RECORD` (plan row 2.4g-3) and named in `B-TRADE-RECORD-JOINABILITY` (2.4g-4).**
⭐ **AND LEG 3'S FAILURE COSTS THE ARGUMENT NOTHING, WHICH IS WORTH SAYING PLAINLY RATHER THAN LEANING ON: the load-bearing claim is *attempts vs opens* — a difference of OBJECTS, not of filters — and it stands without leg 3 entirely.**

⛔⛔ **AND THE ONE FILL-ADJACENT MECHANISM DOES NOT TOUCH THE BASIS LANE.** `maker_limit_price` + `maker_deadline` are populated on **527 rows — IN THE 2026-08-01+ WINDOW, and r7 STAMPS THAT WINDOW because the number is window-dependent (Langston): ALL-TIME crypto is 683 with a maker price and 716 at `chosen_entry_mode='maker'`, and ⚠️ 33 maker-mode rows carry NO maker price, ALL of them pre-08-01 — zero in the window used here (527/527/0). All of the 527 are VTS-lane maker entries and ZERO are shadow rows** (every one of the 27,370 shadow rows has `chosen_entry_mode` NULL, no maker price, no deadline). ✅ **The shadow lane, which the arbiter made the basis, has no maker leg and therefore no unfilled-maker state.** ✅ **And the 527 maker rows are all present as OPENED trades — an unfilled maker does not appear here as a row, so there is no such row class to filter.**

⇒ ✅ **SO IT IS NOT A FILTERED NUMERATOR OVER AN UNFILTERED DENOMINATOR. IT IS THE REMOVAL OF A ROW CLASS THAT EXISTS ON ONE SIDE ONLY.**
⇒ ⭐⭐ **AND THE HONEST VERSION IS STRONGER THAN "SYMMETRIC": THE TWO SIDES RECORD DIFFERENT OBJECTS. `closed_trades` records ATTEMPTS, including abandoned ones; `vts_open_trades` records OPENS ONLY.** ⛔ **Therefore filled-only is not merely the defensible reading — IT IS THE ONLY ONE THAT COMPARES LIKE WITH LIKE, and the inclusive arm was never a rival estimate of the same quantity.**

### ⛔⛔ ANSWER 2 — THE `never_filled` DURATION IS A **ONE-HOUR CONSTANT**, AND THAT EXPLAINS EVERY FLIP HE NAMED

✅ **AND THE ACTIVE SIDE'S ROW CLASSES ARE ENUMERATED, NOT SAMPLED — there is a FOURTH (Langston).** `closed_trades` crypto holds **481 rows: 479 with `closed_at`, and 2 with a NULL `close_reason`** — ✅ **and those 2 are exactly the 2 with `closed_at IS NULL`, i.e. STILL OPEN.** ⭐ **So the fourth class is "not yet closed", which is not a close-reason class at all and is excluded for a different and correct reason — but "enumerated not sampled" has to name it, and r6 did not.**

**MEASURED, crypto, all 85 `never_filled` rows, unbounded:**

| duration | n |
|---|---|
| 1.0003 h | 24 |
| 1.0001 h | 23 |
| 1.0002 h | 16 |
| 1.0004 h | 13 |
| 1.0000 h | 8 |
| 4.6746 h | 1 |

⇒ ⛔ **84 OF 85 SIT INSIDE 1.0000–1.0004 h. p25 = 1.0001, p75 = 1.0003.** That is a **one-hour expiry timer plus scheduler jitter**, not a holding time. *(The filled population for contrast: p25 1.48 h, p75 11.38 h, max 184.93 h.)*
⭐ **THIS IS MY OWN STANDING RULE FIRING, AND I NEARLY MISSED IT AGAIN: a value sitting on a round figure is usually THE CODE PUTTING IT THERE — check the constant before narrating the world.** ✅ **Here checking it settles the dispute instead of merely avoiding an error.**

**PER-STRATEGY `never_filled` SHARE ON THE ACTIVE SIDE, which is what Langston asked for — and the flips fall straight out of it:**

| strategy | share `never_filled` | median ALL | median FILLED | ratio inclusive → filled-only |
|---|---|---|---|---|
| `morning_star` | **9.9 %** ⚠️ *(14/142 CLOSED rows — 9.7 % on all 144 rows; both are right and r6 failed to state which, which is the whole of rule 29)* | 4.83 h | 5.76 h | 1.146 → 1.049 — *least moved, clears BOTH ways* |
| `sma_trend_ride` | **10.9 %** | 2.25 h | 3.46 h | 1.314 → **1.060** — flip |
| `inside_bar_reversal` | **16.4 %** | 3.69 h | 5.66 h | 1.226 → 0.990 — clears both |
| `pivot_shift` | **24.6 %** | 4.31 h | 6.33 h | 1.311 → **1.082** — flip |
| `reverse_impulse` | **29.4 %** | 1.81 h | 7.12 h | 0.955 → **0.481** — reverse flip |
| `support_bounce` | **29.8 %** | 3.14 h | 5.80 h | 2.060 → 1.514 — fails both |

✅ **BOTH FLIPS ARE FULLY ACCOUNTED FOR, WHICH IS THE CONDITION HE SET.** Injecting a 1.00 h constant at 10–25 % always SHORTENS the active median, and active is the DENOMINATOR, so it always INFLATES the ratio. `pivot_shift` and `sma_trend_ride` do not "clear only on the unregistered reading" — **they fail on the reading that dilutes their denominator with a timer.**
⇒ ⭐⭐ **AND IT STRENGTHENS THE `reverse_impulse` DISQUALIFICATION RATHER THAN SOFTENING IT: that row has the LARGEST contamination share at 29.4 %, so its inclusive 0.955 — the number that made it look like a clean ship — WAS THE ARTIFACT.** Its real active median is 7.12 h.
⛔ **THE INCLUSIVE ARM IS THEREFORE NOT A CONSERVATIVE CHECK. It is biased toward failing rows, so it ships FEWER rows for a reason that has nothing to do with the ceiling.**

### ✅ AND THE FLOOR DEPENDENCY HE NAMED, STATED WITH BOTH VALUES SO IT CANNOT BE READ AS CONVENIENCE

⛔ **He is right that this decision sets `reach_atr_max_unknown_floor`: with `sma_trend_ride` in, the floor is **1.97**; without it, **2.36** — looser for every unknown strategy.**
✅ **The exclusion is justified ON THE CONSTANT, independently of which floor it yields — 84 of 85 rows at 1.0000–1.0004 h is a timer whichever way the floor lands.** ⭐ **And naming the direction both ways: my exclusion produces the TIGHTER floor, so it is not convenient in the safety direction — but it does ship MORE rows, which is convenient in the other. The justification has to stand on the constant alone, and it does.**

✅ **CARVE-OUT CONDITIONS MET ⇒ filled-only is primary, the inclusive arm is published as contaminated-not-rival, and ALL FOUR ROWS SHIP AT FLOOR 1.97. ✅ STEP 3 APPROVED TO PROCEED (Langston, 2026-09-13).**

⚠️ **ONE ASSUMPTION CARRIED FORWARD *UNRULED*, AND IT IS RECORDED HERE SO IT CANNOT FIRM UP BY REPETITION (Langston, explicitly):** every ratio in §1b-quater uses **√H SCALING** — he verified it reproduces internally on all three checkable rows (√1.469 = 1.212 `pivot_shift`, √1.192 = 1.092 `morning_star`, √3.93 = 1.985 `reverse_impulse`) **and he checked its CONSISTENCY, not its MERIT.** ⛔ **The √H form itself is inherited from earlier revisions and remains `INFERRED-FROM-CODE-AND-FORM`, exactly as `4.0` does — so the arbiter's verdict is conditional on a form neither of us has ruled on.** ✅ **It does not block Step 3: the four rows tighten under any monotone scaling, and the DIRECTION is what ships.**

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

---

## §5 — STEP 7 / 8 VERIFICATION RECORD, AND THE ONE INSTRUMENT THAT IS ONLY A **PARTIAL**

**DEPLOY:** `022fd27ada7fc149ec910adeb5d9ea92a971a29f`, `deployed_by_claimed=cc-b`, dt-deploy asserted *live, engine resumed, identity asserted*.
✅ **WINDOW OPENS `2026-09-13T05:33:17.640Z`** — pm2 `pm_uptime`, **not** dt-deploy's `deployed_at` 05:33:27Z, which is its post-check stamp 10 s later (Langston Step-8 F1: naming a tool clock as a restart is wrong even when the ordering conclusion survives). Migration rows written 05:33:17.297Z ⇒ **migrate-then-restart with a 0.34 s gap, measured.**
✅ **WHAT LANDED, read at the DB not from the deploy tool:** exactly three `reach_atr_max_unknown_floor` rows (crypto / xStock / global) at **4.0**, `updated_by='b-geometry-reach-baseline'`; the two class defaults untouched (`reorg-b2`, 2026-06-20); **per-strategy `reach_atr_max` count = 0**, which is what this batch ships.
✅ **UI NAVIGATED** (Claude-in-Chrome, no login; landing dashboard ignored as stale furniture): Paper Trading → Crypto Filter Diagnostics → **Reward-vs-Risk / Reachability Gate** panel renders per strategy with a `Target Unreachable` column. ⚠️ **Stamped *since 8/23/2026* and cumulative — it SPANS the deploy and is NOT a post-deploy measurement.** It corroborates the spike mechanism; it says nothing about this change.

### ⛔⛔ THE LOG EVIDENCE IS WITHDRAWN — MY CONTROL DID NOT REACH MY CLAIM

r-earlier reported *"zero hits for `TARGET_GATE` etc., control: `EQUITY_MARK` 801"*. ⛔ **That control proves the FILE is alive, not that a reach refusal would ever land in that stream.** **RE-DERIVED: `TARGET_GATE` returns ZERO across every file in `/var/log/dawntrader/`, including `out.log` at 3,935,667 lines and today's rotated copy — while the gate is demonstrably executing.** ⇒ **those greps were UNREADABLE, not clean (`#661` leg 1), and they are withdrawn as evidence.**

### ✅ THE INSTRUMENT THAT WORKS: `gate_decision->>'gateConstantsVersion'` — AND IT IS A **PARTIAL**

`gateConstantsVersionFor` (`decision-provenance.ts:111`) is **one of the four DYNAMIC call sites**, the class where a drifted token can actually enter, and its hash is computed from the **RESOLVED VALUES**. So an unchanged hash across the boundary is the expected signature of this batch: **the resolution PATH changed and no resolved VALUE did.**
✅ **Pairwise, not merely as a set** (so the set-collision mode is not in play): `morning_star` `3cb8074d` both sides, `pivot_shift` `826db698` both sides, `support_bounce` `a901b411` both sides; **each of the nine hash-bearing strategies carries exactly ONE distinct hash.**

⛔⛔ **IT DOES NOT DISCHARGE THE CEILING CLAIM — AND r9'S REASON FOR THAT WAS WRONG IN THREE PLACES, ALL RE-DERIVED BY ME AT THE DATA (Langston Step-8; every correction runs against what I published).**

⛔ **STRUCK: r9 said *"the whole informative half is the missing one."* THAT IS FALSE FOR THIS SET.** Hash → holders, enumerated over the partition: **`826db698` is held by FIVE** (`defensive_hedge`, `inside_bar_reversal`, `pivot_shift`, `sma_trend_ride`, `vwap_bounce`), `a901b411` by two (`support_bounce`, `volatility_edge`), **`3cb8074d` by `morning_star` ALONE**, `99a40535` by `reverse_impulse` alone.
⇒ ✅ **`morning_star` IS DISCRIMINATING *AND* IS OBSERVED post-restart (51 rows).** Within the four-strategy ceiling set, **exactly one member is discriminating and it is the observed one**; the two unobserved members (`inside_bar_reversal`, `sma_trend_ride`) are both default-valued, **so their absence costs nothing.** ⭐ **That makes the 2-of-4 worth MORE than r9 credited, not less — I over-corrected against myself and the record has to say so.**

⛔⛔ **STRUCK AND REMOVED: r9 cited `mean_reversion 4fc83291` as a discriminating absentee. THAT HASH DOES NOT EXIST IN THIS POPULATION — 0 rows at any asset class, against a control where the identical probe returns 368 for `3cb8074d`.** `mean_reversion` has **190 rows in the partition and ZERO hash-bearing**, so it is not an absentee of that kind at all.
⭐ **HOW IT GOT IN, because the mechanism matters more than the fact: I took the hash from a review message and published it in a governed artifact WITHOUT DERIVING IT — and my own query, which had returned nine hash-bearing strategies with `mean_reversion` absent, HAD ALREADY CONTRADICTED IT.** ⛔ **That is the rule agreed one message earlier, firing on the sentence that introduced it: name the filter and the read time, and derive what you publish.**

✅ **WHAT ACTUALLY REMAINS TRUE, and it is the reach argument — which got STRONGER, not weaker:**
- **Coverage 114 of 45,879 = 0.248 % at 06:07Z**, against **94 of 34,498 = 0.272 % at ~05:58Z**. Denominator +33 %, numerator +21 %. ⛔⛔ **REACH IS FALLING WITH TIME, NOT CONVERGING.** ⭐ **So "the window is still accumulating" must NOT be read as though patience fixes this — waiting makes the coverage worse. Only a ceiling ship or a targeted observation discharges it.**
- **The one genuinely discriminating absentee is `reverse_impulse`** (`99a40535`, unique to it, **165 pre / 0 post**).

⛔⛔ **AND r9'S DISCHARGE CRITERION WAS ALREADY SATISFIED WHEN I WROTE IT, WHICH MEANS IT MEASURED NOTHING.** It read *"a post-restart observation of either non-default-hash strategy"* — and `morning_star` had 51 such rows at that moment. **A pre-registered criterion that is true at pre-registration is not a criterion.**
✅ **REWRITTEN SO IT CAN FAIL — either leg discharges, both are false today:**
1. **A post-restart observation of `reverse_impulse` carrying `gateConstantsVersion`** (0 today), with its hash compared across the boundary; **or**
2. **A ceiling ship that moves some strategy's resolved value OFF `826db698`**, demonstrating the hash responds to a seeded per-strategy row rather than only to a class default.

⛔ **LABEL: PARTIAL — and the reason is now the REACH (0.248 % and falling), not a missing informative half.** Nobody may read the 2-of-4 as half a discharge, and nobody may cite r9's version of why.

### ✅ AND THE POPULATION RULE THAT CAME OUT OF IT, narrower than the flag that produced it
A two-populations defect was flagged (82 hash rows vs 56 geometry rows) and **WITHDRAWN**: measured in ONE query at ONE moment over ONE population, post-restart rows carrying the hash = **94**, carrying the geometry = **94**, carrying the hash but NOT the geometry = **0** ⇒ the sets coincide. The 82-vs-56 was **one population read twice**, minutes apart off an accumulating window, with different `reject_stage` scoping.
⭐ **THE GENERALISABLE RULE: naming a population means naming the FILTER AND THE READ TIME, not the table.**

⚠️ **UNEXERCISED LIVE, AND NO SILENCE MAY LATER BE CITED FOR IT:** the unknown-token fail-closed path has not fired in production and should not — it requires a drifted token. **The unit tests cover it; this window does not.**

---
