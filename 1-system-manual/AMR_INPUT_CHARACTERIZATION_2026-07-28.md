# AMR input characterization — leg A of B-AMR-INPUT-INTEGRITY

**Date:** 2026-07-28 · **Owner:** CC-B · **Status:** characterization only — **no fix language, no taxonomy ruling committed to code**
**Purpose:** establish, at a ref Langston can re-read, what the AMR weather report's inputs actually *are*, before leg B argues about what one of them *means* and leg C asks a counterfactual *of* them.

> **Why this file exists rather than a Discord summary (Langston, 2026-07-28):** *"Leg B's paper is an options paper for Kyle — every option in it will lean on these numbers, and if the evidence base isn't on paper at a ref I can re-read, the paper is a gloss and I'd have to rule on reported fact."* Everything below is either a code citation or a query result, with the population stated.

---

## 0. ⚠️ CENSUS BOUND — read this before quoting any number here

All ledger figures come from `amr_decision_ledger`, window **2026-06-11 14:19:03Z → 2026-07-28 13:31:18Z = 47.0 days, 269,158 rows total (both classes)**.

- Retention on this table is a **90-day** in-service prune. **47 < 90 ⇒ nothing has been pruned; this window IS the complete ledger.**
- ★ **But "complete ledger" ≠ "the system's history."** The ledger only exists from **2026-06-11**, when B-5 shipped it. Every "never" in this document means **"not once in the 47 days of ledger that exist"** — never "not once in the system's history." **Retention is not history, and neither is instrumentation age.**
- Any claim here that would change if the window were longer is flagged inline.

---

## 1. THE HEADLINE — FAVORABLE is unreachable on 94.6% of crypto cycles because an INPUT IS MISSING

Not because conditions are bad. Not because of friction. Not because of the ev-gap cap.

| Measurement | Crypto | Source |
|---|---|---|
| Cycles in window | 134,595 | ledger |
| `evGapRatio` **present** | **2,921 = 2.17%** | ledger |
| `favorable_blocked_missing_inputs` stamped | **127,279 = 94.6%** | ledger |
| …of which stamped exactly `(4/5)` | 125,295 | ledger |
| …of which `evGapRatio IS NULL` | **127,269** (dbs_null = **0**) | ledger, **measured directly, not reconciled by arithmetic** |
| `max(continuous_score)` **all** crypto cycles | **0.6990** | ledger |

`0.6990` is not a near-miss and carries no information about reach: `amr-weather-report.ts:280-281` is
`if (parts.length < 5) score = Math.min(score, favorable_min_score - 0.001)` — with `favorable_min_score = 0.7` **live**, that constant *is* `0.699`. It is **the cap's own output**, observed because the cap fired.

⇒ **On 94.6% of crypto cycles the score is clamped strictly below the FAVORABLE boundary by construction.** The completeness cap is doing exactly what it was designed to do — refuse to call conditions favourable on thin evidence. **What is wrong is upstream of the cap.**

---

## 2. WHY THE INPUT IS ABSENT — three mechanisms, all read from code

**(a) The window threshold is large for crypto and doubles as the minimum.**
`ev_gap_window_n` is used both as the ring-buffer cap (`:159-160`) and as the **minimum to emit a ratio** (`:167`: `if (t.evGap.length < minN) return { ratio: null, n }`).
**LIVE values: crypto 100, xstock 30.**

**(b) The window is in-process and does not survive a restart.**
`evGap: []` is initialised at `:126` on a per-class tracker. **Grepped for any rehydrate/persist path: there is none.** The sole writer is `feedEvGapObservation`. ⇒ **every deploy or restart zeroes it**, after which crypto must re-accumulate **100** closes before the input exists again.

**(c) ★ The only feeder is the VTS close path — the active/paper path does not feed it.**
`feedEvGapObservation`'s only caller repo-wide is `vts-service.ts:1120`. The function's own header (`:150-153`) states it: *"source-filtered by the caller (vts now; **paper joins in Phase 19 as a SEPARATE operator decision — scope B2**)."*
⇒ **With paper-mode active trading ON, real paper closes contribute nothing to this input.** This is flagged by its own author as a pending decision and was never dispositioned.

**(d) ★ `ev_gap_window_n` IS DUAL-USE — and that is a DEFECT (bucket 1), not a config value.** (Langston, 2026-07-28.)
The same constant is the ring capacity (`:159`) **and** the emit-minimum (`:167`), so **`capacity == warmup` is structurally forced.** You cannot ask for a 100-deep average that begins speaking at 30 — **the only way to shorten the warmup is to shorten the window you are averaging.**
It is a **two-constant fix** (split capacity from minimum), and it is the one item in leg A that is a genuine defect rather than an undispositioned decision.

> ⛔ **CAUSAL CLAIM STRUCK 2026-07-28 — struck, not softened.** This section originally read *"this — not a tuning mistake — is why crypto lives at 17.7/100."* **Leg (c) refuted it.** See §2(e).

**(e) ★★ NEITHER MECHANISM ABOVE ACTUALLY EXPLAINS THE ABSENCE — and the truth is anti-correlated with the obvious guess.**

Langston's discriminator (§13-named, run before leg (a) could claim a magnitude): *if crypto closes ~100 in under a week, 47 days should have produced ~20 window-fills rather than 4 ⇒ restarts binding; if 100 takes ~11 days, four fills is expected ⇒ the constant is binding.*

**Measured:** `vts_open_trades`, crypto, closed — **33,862 closes since 2026-05-11, mean 431/day.** Recent daily: 07-23 **7,773** · 07-24 5,263 · 07-21 5,086 · 07-16 3,303.
⇒ **100 closes takes ~5.6 hours.** The window should be full essentially permanently. ⇒ **The constant is NOT the binding constraint.**

⇒ ★ **But the restart explanation fails too, in the opposite direction.** It predicts the input appears on **high**-volume days. It does the reverse:

| the four days the input existed | crypto closes that day |
|---|---|
| 2026-07-13 | **60** |
| …while 2026-07-23 | **7,773 — and produced no ev-gap rows at all** |
| …2026-07-24 | 5,263 — none |
| …2026-07-21 | 5,086 — none |

**A window that refills in under six hours, on a day with 7,773 closes, that never once emits.** Restart-zeroing does not produce that pattern.

⇒ **Both stated explanations are co-occurring, not sufficient.**

### 2(f) ★★ RESOLVED — THE MECHANISM IS ROUTING, AND IT IS MEASURED EXACTLY

Langston found an **exact** counter rather than another bound: `feedEvGapObservation` (`:1118-1120`) and `updateEma` (`:1126-1136`) sit in the **same** `if (_assetClass !== null)` inside the **same** `:1094` guard — **co-counted, not merely co-gated** — and `updateEma`'s only internal drop paths (`:329`, `:335`) both **log**. The retained window holds **zero** such lines, zero `EV-gap feed failed`, zero `outcome feedback update failed`.
⇒ **the `[B67.4][feedback]` log-line count IS the block-entry count IS the feed-call count.**

| day | crypto **calls into the block** | crypto closes |
|---|---|---|
| 2026-07-27 | **35** | — |
| 2026-07-28 (→14:00Z) | **18** | 341 |

⇒ ★ **~35 calls a day against thousands of closes. The loss is overwhelmingly UPSTREAM of `:1094` ⇒ candidate (c), routing, essentially by itself** — most closes complete via `persistTwinClosedRecord` / `persistNeverFilledRecord` and never reach `persistRealPriceTrade` at all.
⇒ **Candidate (a) (`:156` NaN drop) is REAL BUT MINOR** — 07-28 shows 8 pushes against 18 calls, so ~10 fell inside the try. **It cannot explain 99.5%.**
⇒ **Candidate (d) (`cfg`) is dead as a volume explanation** — an MCE cache, not a per-close quantity. *(Langston leaning; accessor unread.)*
⇒ **The 07-14 boundary is NOT the cause.** `a8242a3bc` deleted **computation** sites, not feed sites, so the feed fires once per close as before — **H2 refuted at the diff, and H1 demoted to explaining at most the small `:156` residue.** The earlier alarm about that batch is withdrawn.

> ⚠️ **TWO UNRESOLVED MEASUREMENT CAVEATS, kept visible rather than smoothed:**
> 1. **stdout retention (`retain=14`, size-rotated) buys 07-27 onward only — 2026-07-23, the one airtight day, is GONE.** This enumeration must **not** be retro-applied to it.
> 2. **07-27 disagrees in an impossible direction: 45 pushes vs 35 calls.** A push cannot exceed a call. The 45 reconstructs exactly (day opens at 46 carried; four drops **all to zero**, confirming clean restarts and no interleaved writer; then +22+1+9+13). **Most likely the retained 07-27 log starts mid-day** — the trailing-silence family, where a truncated window reads as *fewer events* rather than as missing data. Unsettled.

> ⚠️ **UNVERIFIED HYPOTHESIS, labelled as one:** the `vts-service.ts:1118-1120` call sits on the `persisted===true` path and may not fire for most closes, or may not fire with the asset class assumed. **A guess, not a finding** — it gets the same code-first treatment as everything else here before it is repeated.

**Standing consequence: name no expected magnitude for what the constant split recovers until this resolves.** The defect is real; its blast radius is unknown.

**★ METHOD NOTE — the same failure three times in one day.** *Double-block* → the cap was redundant, not independent. *The percentiles* → a plateau artefact, not a distribution. *The constant* → neither it nor restarts. **Each time, the first mechanism that fit the evidence was adopted before a competing one was excluded.** That is §9.5(a)'s component census applied to **explanations**: *enumerate the competing mechanism and exclude it, before adopting the one that fits.*

**How full the window actually gets:** mean `n` while warming — **crypto 17.7 / 100 · xstock 6.3 / 30.** The window lives most of its life around a fifth full.

> ⚠️ **DO NOT quote the maximum of the `ev_gap_warming(n=X/N)` stamp (crypto 99, xstock 29) as a measurement.** The stamp is written *only while below threshold* (`:414`), so its maximum is **necessarily N−1**. It is a boundary constant, not an observation — the same shape as `0.2498`, `0.6990` and the 359s cap that have each been mis-cited on this project. Use the **mean**.

---

## 3. FRICTION — a severe drag, **NOT** algebraically sufficient

Live: `weight_friction = 0.30` (**largest of five**); crypto `friction_score_choppy 40` / `friction_score_stormy 60`.
Band mapping (`:226-233`), choppy band: `fav = 0.5·(1 − (f − choppyF)/(stormyF − choppyF))`.

Crypto friction distribution (n = 130,168): **min 43.00 · p5 51 · p25 53 · p50 54.**

| f | `fav` | cost of the 0.30 imperfection budget | ceiling if all else perfect |
|---|---|---|---|
| 43 (all-time best) | 0.425 | 0.1725 = **57.5%** | 0.8275 |
| 53 (p25) | 0.175 | 0.2475 = **82.5%** | 0.7525 |
| 54 (p50) | 0.150 | 0.2550 = **85.0%** | 0.7450 |

⇒ At **typical** friction, the largest-weighted input consumes **85%** of the entire budget between a perfect score and the FAVORABLE boundary.
⇒ **But the ceiling stays above 0.70. Friction does NOT algebraically bar FAVORABLE.**

> **RETRACTED (CC-B, corrected by Langston 2026-07-28):** an earlier claim that *"baseline drag alone is sufficient to block crypto"* was **wrong and is withdrawn**. It rested on the n=741 no-cap cohort's maximum (0.4432). **A cohort maximum cannot bound the counterfactual score of a *different* cohort** — capped cycles may carry better friction/dbs/flips/macro profiles than anything in the uncapped set. The correct statement is *severe drag*, established by the algebra above, not by that cohort.

★ **Crypto's friction has never once been below its own choppy threshold of 40 in the 47 days of ledger — minimum 43.** So crypto sits permanently in the choppy band or worse. xStock, by contrast, drops below 40 on 23,157 cycles (min 31).

> **RETRACTED (CC-B, self-caught 2026-07-28):** an earlier statement that friction fell to 34.07 *"for the only time on record"* **conflated the classes.** The 59 AGGRESSIVE cycles are **all `xstock_spot`**; 34.07 is an xStock reading and belongs against **xStock's** choppy threshold of **45**, not crypto's 40. The sentence wrongly implied crypto had once seen cheap friction. **It never has.**

---

## 4. ★ THE xSTOCK TRAP — higher friction does NOT mean worse conditions

**State this every time the two classes are compared, or the comparison inverts.**

xStock runs **higher** average friction than crypto (60.09 vs 53.20) and yet **xStock is the class that reached FAVORABLE** (65 minutes total, 2026-06-12, never since). Two reasons, both structural:

1. **The thresholds differ by class.** xStock's choppy/stormy are **45/70** against crypto's **40/60**. A raw friction number is meaningless without its class's band.
2. **The other inputs differ sharply** — xStock's dbs and macro readings are far better, and its ev-gap window needs only **30** observations, so the input exists far more often.

⇒ **Never rank the two classes on a raw friction figure.** Compare each against its own bands, or not at all.

### 4.1 ★ The same inversion applies to `ev_gap_window_n` — **30 reads like the safer number and is the opposite**

Seeded asymmetric at `2026-06-11c-b5-amr-body.sql:123,128`: **crypto 100, xstock 30.**

A smaller window looks like a weaker, noisier setting. In this mechanism it is the **less damaged** one: because `capacity == warmup` (§2(d)), xStock's window both **fills** and **starts speaking** three times sooner than crypto's. **Same defect, three times smaller blast radius.**

⇒ crypto's larger number is not extra rigour — it is what keeps the input absent 97.8% of the time.

---

## 5. THE EV-GAP RATIO — what it is, on the 2.17% where it exists

`computeEvGapRatio` (`:165-172`) = `(sumPredicted − sumRealized) / sumPredicted`, with a `sumPredicted <= 0 → null` guard at `:171` forcing a **positive denominator**.
⇒ **`ratio ≥ 1 ⟺ sumRealized ≤ 0`.** Live `ev_gap_stormy_ratio` = **1.0 exactly**.
⇒ **At that threshold the `hostile` flag is not a calibration measure — it is a SIGN TEST on the rolling window's realised net P&L.** This is the observation leg B has to rule on; it is **not ruled here**.

### 5.1 ⚠️ THE DISTRIBUTION OF THIS INPUT CANNOT BE QUOTED — n = 2,921 rows is closer to **n = 4 observations**

> **RETRACTED (CC-B, 2026-07-28, on Langston's ask to date-bound the population).** An earlier reading gave *"min 0.6046 · p5 0.6703 · p25 0.8465 · p50 1.5944 · 41.9% below 1.0, strongly bimodal."* **All of it is withdrawn.** Those percentiles describe an artefact, not a distribution.

The 2,921 cycles where the input exists do **not** spread across the 47-day window. **They fall on four days:**

| day | cycles | p50 of `g` |
|---|---|---|
| 2026-07-03 | 357 | 0.6740 |
| 2026-07-04 | 941 | 0.8963 |
| 2026-07-05 | 702 | 1.6594 |
| 2026-07-13 | 921 | 2.2979 |

Each day is **nearly constant internally**; the four differ wildly. ⇒ **The percentiles were measuring "which of four window-fills you land in," not market conditions.** "41.9% below 1.0" decodes to *"two of the four days sat below 1.0"* (357 + 941 = 1,298, against 1,224 counted).

⇒ ★ **The row count is not the sample size.** 2,921 rows are ~4 independent observations of a rolling window.

### 5.1a ★★ THIS IS NOT A SAMPLING PROBLEM — IT IS THE SAME DEFECT AS §2(d), AND THE INPUT IS CURRENTLY **UNMEASURABLE**

> **(Langston, 2026-07-28 — a correction to the retraction above, which did not go far enough.)**

Because `capacity == warmup` is structurally forced (§2(d)), **the ring can only ever emit while completely full, sliding forward one observation at a time.** Consecutive emissions therefore differ by at most one of 100 members — they are **near-identical by construction**. A window that fills during one day emits a **day-long plateau**, and the next fill (after the next restart) starts from an unrelated set and plateaus somewhere else entirely.

⇒ **"Nearly constant within a day, wildly different across days" is not a property of market conditions. It is the defect's signature.**

⇒ Therefore the honest statement is **not** *"my percentiles were wrong and better sampling would fix them."* It is:

> ★ **The distribution of this input CANNOT BE MEASURED AT ALL under the current constants, and will stay unmeasurable until capacity and emit-minimum are split.** No amount of additional data helps, because the mechanism that produces the data destroys its independence.

Leaving that question **open** is stronger than replacing the numbers with better ones, and no statistic over this input — mean, median, percentile, or the earlier "41.9% below 1.0" — should be quoted anywhere until the split lands.

### 5.2 ★ Every crypto ev-gap value on record predates the predictor correction

**A3 IS PINNED** (Langston, at the ref): commit **`90f6a3f72`, 2026-07-27T23:31:13Z**, *"B-RETIRED-SCORE-REMOVAL A3: re-source expectedEdge/predictedProfit off finalScore."* It re-sourced the *predicted* operand away from the formula this project retired as anti-predictive.

The last ev-gap day on record is **2026-07-13**; A3 lands **14 days later**, a single clean boundary with nothing touching the operand in between.

⇒ **Stated flat: every crypto ev-gap ratio in existence predates the predictor correction. The corrected operand has produced zero crypto observations to date.**

> **Why my earlier `-S` search came back empty** — reported because the negative result was nearly mistaken for evidence: **the operand is not in `vts-service.ts` at all.** It is set in **`vts-runner.ts:2065` and `:2235`** (`taker.netEV / entryPrice`); `vts-service.ts:1118-1120` only *forwards* it. I searched the forwarding file, not the assigning one. **An empty search of the wrong file is the absent-as-valid trap (#568), and it was one inference away from being read as "the change never happened."**

### 5.3 Both null paths — discriminated, not assumed

`:414` stamps `ev_gap_warming(n=…)` whenever `ratio === null`, **regardless of which of the two null paths produced it** (`:167` warmup, or `:171` `sumPredicted <= 0`). So a null is not self-evidently a warmup.
**Measured:** crypto rows with `evGapN >= 100 AND evGapRatio IS NULL` = **0**; max `evGapN` across all 131,684 null-ratio crypto rows = **99**.
⇒ **The `:171` path has never fired on crypto. Every null is warmup.** No full window is silently reporting itself as warming.

---

## 6. LIVE RULES — confirmed at source, seed and live AGREE

Read from **`module_constants` WHERE `module_name = 'amr_weather_rules'`**. (The physical table is `module_constants`; `amr_weather_rules` is the module-name argument to `getCachedNumberRequired` at `:138` — same object, one level up. Worth stating because `score_stormy_max` previously burned us on exactly a seed-vs-live gap. **No drift this time.**)

| Constant | crypto_spot | xstock_spot |
|---|---|---|
| `weight_friction` | 0.30 | 0.30 |
| `weight_dbs` / `weight_evgap` / `weight_flips` | 0.20 each | 0.20 each |
| `weight_macro` | 0.10 | 0.10 |
| `favorable_min_score` | 0.7 | 0.7 |
| `friction_score_choppy` / `_stormy` | 40 / 60 | 45 / 70 |
| `ev_gap_choppy_ratio` / `_stormy_ratio` | 0.5 / 1.0 | 0.5 / 1.0 |
| `ev_gap_window_n` | **100** | **30** |

---

## 7. WHAT THIS DOES TO LEGS B AND C

- **Leg B (ev-gap semantics) is no longer the load-bearing question.** Any re-threshold can only act on the **2.17%** of cycles where the input exists; on the other 94.6% the completeness cap clamps the score below FAVORABLE regardless of any threshold anywhere. Leg B remains a genuine **scope call for Kyle** — but it is a scope call about 2% of cycles, and the options paper must say so in its first paragraph.
- **Leg C's counterfactual re-score** would run on inputs that are absent 97.8% of the time. Its gate behind leg A is vindicated.
- **The load-bearing question is leg A's own:** an input absent on 97.8% of cycles, on an in-memory window that resets every deploy, fed only by VTS while active trading runs.

**No disposition is proposed here.** Taxonomy (real defect / working-as-designed-but-unaddressed / legacy drift) is ruled at leg A's Step-1 scope, from code, per rule 24 — not in a characterization document.

---

## 7b. ★ NAMED HOME (§9.4) — assigned here, not deferred

Langston's process item: the `:150-153` *"paper joins in Phase 19 as a SEPARATE operator decision — scope B2"* deferral has sat undispositioned and **must not leave this document without a concrete home.**

**Home: `RUNNING_ISSUES.md` #604, owner CC-B, homed to leg A's own Step-1 batch** (not a future phase — leg A is already open). **Langston-confirmed 2026-07-28, with one split he insisted on:**

**The entry carries TWO SEPARATELY-TRACKABLE LEGS, and neither blocks the other:**

| leg | what | taxonomy | who closes it |
|---|---|---|---|
| **(a)** | split `ev_gap_window_n` into distinct **capacity** and **emit-minimum** constants (§2(d)) | **bucket 1 — a defect** | **CC-B, in leg A.** Does **not** wait on (b). |
| **(b)** | does the active/paper close path feed `feedEvGapObservation`, and with what source label (§2(c)) | **bucket 2 — undispositioned decision** | ★ **KYLE. Not CC's and not Langston's to close.** |

★ **Why (b) is explicitly not ours** (Langston, verbatim intent): `:150-153` *already* designates this "a SEPARATE operator decision," which makes it **Kyle's** — *"I'm not going to decide it for him or stage a ceremonial re-approval of something he hasn't been asked yet."* ⇒ (b) is presented to Kyle as an open question in leg B's options paper; **it is not pre-decided here, and a CC agreeing with a CC does not constitute its approval.**

★ **The legs must not block each other.** (a) is a two-constant defect fix and ships on its own schedule; parking it behind a decision Kyle has not yet been asked is how a defect becomes permanent.

## 8. Provenance read (§9.5(b))

- `bridge/canonical/` — **consulted; no coverage of the AMR weather report.** The corpus predates it (AMR shipped 2026-06-11, the corpus is the pre-governance Replit-era reference). **That absence is itself recorded rather than left silent**, per rule 22.
- ★ **Prior-census check (§9.5(b-ii)), pointer supplied by CC-A:** `Claude Comms and Packages/Scope Files/ITEM_4_STORAGE_AND_LEARNING_DESIGN.md` **§B.8** is a full sweep of "things that learn," which named `outcomeFeedbackStore` as the one live contaminator and flagged two latent vectors. **The AMR ev-gap window is NOT in it — and could not have been: the census was taken 2026-06-09, and the AMR weather report shipped 2026-06-11, two days later.** So this is **not a duplicate of a known item**, it is a **third member of the family that census identified, created after the sweep**.
  - **Same shape as §B.8's "Latent vector 1"** (`recalibrate-predictive-weights.ts`, VTS-locked at L223-235 ⇒ paper outcomes never reach it).
  - ⚠️ **But NOT the same severity, and the difference matters.** Latent vector 1 is a **silent blind spot** — safe today, wrong later. The AMR ev-gap window is a blind spot **that also gates behaviour today**: VTS-only feed **+** in-process reset **+** `window_n = 100` ⇒ the input is absent on 97.8% of crypto cycles ⇒ the completeness cap fires ⇒ FAVORABLE is unreachable. **A blind spot with a live gating consequence, not merely a future one.**
  - ★ **§B.8 adopted a HOUSE RULE:** *"source-label discipline is mandatory for ANY future outcome-fed store."* **The AMR ev-gap window is an outcome-fed store built after that rule was adopted, and it was born VTS-only with no source label.** That is the cleanest frame for leg A's disposition question — and it is a governance-ledger finding, not a fresh opinion.
- Governance-ledger search (§9.5(b-ii)) before filing anything: the `:150-153` comment names its own provenance — *"paper joins in Phase 19 as a SEPARATE operator decision — scope B2"* — and that pointer was **followed, not skimmed**. It confirms the VTS-only feed was a deliberate, stated deferral, **not an oversight**. It is therefore reported here as an **undispositioned decision**, not as a defect.
