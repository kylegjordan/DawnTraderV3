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
⇒ **This — not a tuning mistake — is why crypto lives at 17.7/100.** It is a **two-constant fix** (split capacity from minimum), and it is the one item in leg A that is a genuine defect rather than an undispositioned decision.

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

⇒ ★ **The row count is not the sample size.** 2,921 rows are ~4 independent observations of a rolling window. **Any statistic over this input must be computed per-window-fill, never pooled over rows.**

### 5.2 ★ Every crypto ev-gap value on record predates the predictor correction

All four days are early-to-mid July and **precede the #558 work dated 2026-07-28** (`d799c47bd`, `e3a22c15a`). The `#558-A3` change re-sourced the *predicted* operand away from the formula this project retired as anti-predictive.
⇒ **Every ev-gap ratio crypto has ever produced was computed from the OLD operand. The corrected operand has produced zero crypto observations to date.**

> ⚠️ **Claim bounded:** verified that the four days precede the 2026-07-28 `#558` commits; **A3's exact commit was NOT pinned** (a `-S` search on the new operand string in `vts-service.ts` returned no hits — reported as-is, read as evidence neither way). If A3 landed earlier, the ordering needs re-checking before this sentence is load-bearing.

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

**Home:** a RUNNING_ISSUES entry owned by **CC-B**, homed to **leg A's own Step-1 batch** (not a future phase — leg A is already open and the work is two constants plus one feed decision), covering both halves:
1. **the defect** — split `ev_gap_window_n` into separate capacity and emit-minimum constants (§2(d), bucket 1);
2. **the decision** — whether the active/paper close path feeds `feedEvGapObservation`, and if so with what source label (§2(c), bucket 2, **Kyle's call, not CC's**).

*Number pending Langston's confirm-or-redirect on the framing; filed under that number the same turn it returns. **This line is the open loop and is not closed until the number exists.***

## 8. Provenance read (§9.5(b))

- `bridge/canonical/` — **consulted; no coverage of the AMR weather report.** The corpus predates it (AMR shipped 2026-06-11, the corpus is the pre-governance Replit-era reference). **That absence is itself recorded rather than left silent**, per rule 22.
- ★ **Prior-census check (§9.5(b-ii)), pointer supplied by CC-A:** `Claude Comms and Packages/Scope Files/ITEM_4_STORAGE_AND_LEARNING_DESIGN.md` **§B.8** is a full sweep of "things that learn," which named `outcomeFeedbackStore` as the one live contaminator and flagged two latent vectors. **The AMR ev-gap window is NOT in it — and could not have been: the census was taken 2026-06-09, and the AMR weather report shipped 2026-06-11, two days later.** So this is **not a duplicate of a known item**, it is a **third member of the family that census identified, created after the sweep**.
  - **Same shape as §B.8's "Latent vector 1"** (`recalibrate-predictive-weights.ts`, VTS-locked at L223-235 ⇒ paper outcomes never reach it).
  - ⚠️ **But NOT the same severity, and the difference matters.** Latent vector 1 is a **silent blind spot** — safe today, wrong later. The AMR ev-gap window is a blind spot **that also gates behaviour today**: VTS-only feed **+** in-process reset **+** `window_n = 100` ⇒ the input is absent on 97.8% of crypto cycles ⇒ the completeness cap fires ⇒ FAVORABLE is unreachable. **A blind spot with a live gating consequence, not merely a future one.**
  - ★ **§B.8 adopted a HOUSE RULE:** *"source-label discipline is mandatory for ANY future outcome-fed store."* **The AMR ev-gap window is an outcome-fed store built after that rule was adopted, and it was born VTS-only with no source label.** That is the cleanest frame for leg A's disposition question — and it is a governance-ledger finding, not a fresh opinion.
- Governance-ledger search (§9.5(b-ii)) before filing anything: the `:150-153` comment names its own provenance — *"paper joins in Phase 19 as a SEPARATE operator decision — scope B2"* — and that pointer was **followed, not skimmed**. It confirms the VTS-only feed was a deliberate, stated deferral, **not an oversight**. It is therefore reported here as an **undispositioned decision**, not as a defect.
