# B-GEOMETRY-REACH-BASELINE — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **r2, 2026-09-12** · **Step 1 APPROVED at `d174ed7a9`**

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

⭐⭐ **BUT THE SENTENCE IS TRUE OF *GATE B*, AND THAT IS A REAL FINDING THAT WAS SITTING ON THE WRONG ROW.** The **active crypto** path **enforces and DROPS** (`signal-orchestrator.ts:1925`). ⇒ ⛔ **`closed_trades` is HARD-CENSORED at deploy, permanently: after OBJ-A, no active-path trade will exist for geometry the tightened ceilings refuse, and no tag survives it.** **The pre-deploy `closed_trades` corpus is the only clean active-path measurement of the old regime that will ever exist.**

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

⛔⛔ **AND CONDITION 1 IS EXACTLY WHAT ACTIVATES CONDITION 4'S TRAP — measured, and this interaction is not in Langston's note.** `vts-runner.ts:949` persists `atrAtOpen: input.atrAtOpen ?? 0`, so a missing ATR is stored as **0**, which reconstructs as `atrsToTarget = ∞` and reads as a **REFUSAL**. **MEASURED, `vts_open_trades`, `opened_at ≥ 2026-08-01`, n=32,085 carrying the key: 1,029 rows (3.21 %) hold `atrAtOpen = 0` — and ALL 1,029 carry NO gate verdict** (zero in `unreachable`, zero in `passed`, zero in `rr_below_min`).
⇒ ⭐ **So today's habit of filtering to verdict-bearing rows excludes them, and CONDITION 1's unfiltered rule is what lets them in.** ⛔ **THE MITIGATION CREATES THE EXPOSURE.** ⇒ **`atrAtOpen = 0` is excluded as UNKNOWN and NEVER counted as unreachable, and the count of excluded rows is published beside every re-derivation.** *(`#546` absent-as-valid, one line above the `diAtOpen ?? 50` sentinel already measured at 14.8 %.)*

**AND THE BOUNDARY STAMP, beneath the rule:**
⛔ **BEFORE the resolver change lands**, not after. Three fields change basis or distribution at the same instant: `decision-provenance.resolvedSet.reach_atr_max` (per-class → per-strategy), `guard-eval-tracker`'s reach buckets, and `vtsGateVerdict` on both VTS lanes.
**VERIFICATION:** the deploy sha is recorded against each of the three, and a query grouping any of them across the boundary **refuses or splits** rather than pooling.

### P-2 — The resolver change *(from §1a; scope OBJ-A parts 1–2)*
`expectancy.ts:206/211` per-(strategy × class), **plus the fail-closed `reach_atr_max_unknown_floor` on the FULL key set — crypto, xStock, and global `*` — mirroring `min_rr_unknown_floor`'s three rows and its migration-level `RAISE EXCEPTION`, NOT `b72-warmup`'s boot list.**
✅ **No call-site edits: all four gates inherit it.**
⛔⛔ **CONDITION 2 — THE WIDENED RADIUS IS TOKEN-CORRECTNESS, AND r1'S FOUR-SITE FRAMING HID IT.** `getPerClassTargetGate` has **~22 non-test callers** — ten strategy files, eight in-class detects (`strategy-engine.ts:299/434/568/680/781/890/993/1615`), `decision-provenance.ts:111`, and the four gates. ⭐ **TODAY reach is token-INDEPENDENT, so a drifted token can only mis-resolve `min_rr`. AFTER OBJ-A every one of those tokens ALSO PICKS A REACH CEILING.** ⛔ **And `canonical===null` is the wrong control: the canonicalizer ALIASES (`range_trading`→`range_trade`), so a WRONG-BUT-VALID token silently inherits ANOTHER STRATEGY'S CEILING with no tripwire — the unknown floor never fires.**
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
