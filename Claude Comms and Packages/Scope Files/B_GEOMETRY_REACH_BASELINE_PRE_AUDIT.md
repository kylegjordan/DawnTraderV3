# B-GEOMETRY-REACH-BASELINE — STEP 2: PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

**Batch:** `B-GEOMETRY-REACH-BASELINE` · **Issue:** `#1052` · **Plan row:** `PHASE_19_PLAN` 2.4g-2 · **Owner:** CC-B
**change-class: architecture** · **r1, 2026-09-12** · **Step 1 APPROVED at `d174ed7a9`**

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

⇒ ⛔⛔ **SO THE ENDOGENEITY LANGSTON FLAGGED IS NOT ONLY HISTORICAL — IT BECOMES ONGOING AT DEPLOY.** The scope already labels the values *a policy tightening with a measured lower bound* because `H` is shaped by the gate being calibrated. **The census shows the same loop closing FORWARD: after OBJ-A, the corpus that would re-derive these values is generated under the new ceilings.**
✅ **It does NOT invalidate OBJ-A** — tightening remains the safe direction, and VTS **tags rather than drops** (reorg-B3.3), so no VTS trade is lost and the counterfactual survives.
⛔ **But it means the pre-deploy corpus is the ONLY clean measurement of the old regime that will ever exist**, and any later re-derivation straddles the boundary unless it is stamped.

⇒ ⭐ **AND IT ANSWERS KYLE'S ORIGINAL QUESTION AT THE CODE, which no earlier revision did: *"why are we only making this change for paper mode and not in the VTS also?"* — WE ARE NOT. The change reaches VTS automatically, through the shared resolver, on both crypto and xStock lanes.** What differs is only which rows are seeded.

### 1c. ⚠️ WHAT THE `vtsGateVerdict` DISTRIBUTION DOES AT DEPLOY

Gates **C** and **D** write `vtsGateVerdict ∈ {passed, rr_below_min, unreachable}`. Tightening seven crypto ceilings **moves trades from `passed` into `unreachable` in the VTS record**, with no change in what is simulated.
⇒ ⛔ **Any analysis grouping on `vtsGateVerdict` across the deploy reads two populations as one** — the same shape as rider 1, on a second field, and **the same defect that made §1b's own "3.8× longer" claim unusable.**

---

## 2. THE PLAN — each item back-references its finding

### P-1 — Stamp the boundary on all THREE recorded fields *(from §1a riders, §1b, §1c)*
⛔ **BEFORE the resolver change lands**, not after. Three fields change basis or distribution at the same instant: `decision-provenance.resolvedSet.reach_atr_max` (per-class → per-strategy), `guard-eval-tracker`'s reach buckets, and `vtsGateVerdict` on both VTS lanes.
**VERIFICATION:** the deploy sha is recorded against each of the three, and a query grouping any of them across the boundary **refuses or splits** rather than pooling.

### P-2 — The resolver change *(from §1a; scope OBJ-A parts 1–2)*
`expectancy.ts:206/211` per-(strategy × class), **plus the fail-closed `reach_atr_max_unknown_floor` on the FULL key set — crypto, xStock, and global `*` — mirroring `min_rr_unknown_floor`'s three rows and its migration-level `RAISE EXCEPTION`, NOT `b72-warmup`'s boot list.**
✅ **No call-site edits: all four gates inherit it.**
**VERIFICATION:** a negative control per gate site — an unknown token resolves to the unknown floor, **not** 4.0, asserted at each of the four; plus the migration's own seed-completeness exception.

### P-3 — Seed the seven crypto rows *(from scope §1b)*
⛔ **Crypto calibration rows only. `vwap_pullback` excluded (it would loosen). xStock excluded (`c` is class-dependent, zero rows).** ⚠️ **"Crypto only" governs THESE rows and NOT P-2's safety row.**
**VERIFICATION:** each value with n, denominator, bootstrapped CI, the **policy-tightening** label, and its implied refusal rate.

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
