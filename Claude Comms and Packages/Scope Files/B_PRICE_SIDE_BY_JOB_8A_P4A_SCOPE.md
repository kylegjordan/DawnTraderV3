# B-PRICE-SIDE-BY-JOB row `8a-P4a` — THE BOOK-STATE RESEED ESCAPE — SCOPE (Step 1)

change-class: sub_batch

**Owner:** CC-C. **Parent:** `3n` `B-PRICE-SIDE-BY-JOB`, the xStock half (`8a-P4`, plan row `3n.q2`). **This is its first item.** Previously homed as `B-BOOK-STATE-RESEED-ESCAPE` in the `8a-P3` record (§6), with no plan row written yet.
**Status:** `STEP: 1 of 11` · `NEXT STEP: 2 of 11`. **r2** — Langston approved r1 at 19:55Z with BLOCKER-1 (OBJ-1's staging test), BLOCKER-2 (a bound independent of the retained ring), one finding and two conditions; each is folded below and marked *(r2)*.

---

## 0. THE DIRECTIVE, AND WHY THIS ITEM GOES FIRST

Kyle, 2026-09-15: the exit/fill-side work is one batch in two halves, and the xStock half starts after the Friday budget reset. On 2026-09-18 **all three held paper xStock positions were found locked out of exit evaluation during US regular hours**, and one of them is past its stop. The evidence is in `Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md` §6. Langston accepted the diagnosis and the ordering the same evening (19:38Z), with no restart. *(r2)* **He then corrected his own word "absorbing" from the log (19:55Z):** it is **a latch that renews at each off-hours reconnect**. ANET's chain DID end, at `2026-09-18 00:16:38` (`COMPARATOR_CLEARED … validated=false framesSinceSeed=60678 reason=yield_after_60_hollow`), and re-seeded implausible two seconds later at the same boundary. **Magnitude, his whole-reach count of `REFUSE unvalidated`:** ANET 106,623 · AMC 88,588 · LOW 25,471 · MDB 1,611, then a tail of ≤ 22 per symbol (the stated one-tick post-clear cost, and the positive control that the instrument records short runs). AMC: ~88,585 frames ≈ **43.6 h with no exit evaluation** at 19:53Z.

## 1. WHAT HAPPENS TODAY — measured, at `origin/migration/aws-supabase`

**Mechanism.**
1. A new comparator chain judges its SEED against the symbol's retained spread ring. If `seedSpread > kRel × retainedMedian`, it sets `seedImplausible = true` and logs `SEED_IMPLAUSIBLE … chain can never validate` (`xstock_spot/book-state-tracker.ts:172-187`).
2. `validated` is `!seedImplausible && …` for the chain's whole life (`:203`), so nothing inside the chain can promote it.
3. A chain ends only at `clearBookStateComparator` (`:233-273`). It has **exactly one call site**: the hollow-skip yield at `active-execution-engine.ts:1918` (`yield_after_${n}_hollow`). The other two grep hits are the import (`:483`) and a comment (`:2039`).
4. The exit path refuses every tick on an unvalidated comparator (`aee:2059-2069`, `REFUSE unvalidated`, `_recordPriceSkip(…'book_state_unvalidated')`). That refusal is **not** a hollow skip, so it never reaches the yield.
⇒ **A seed-implausible chain on a book that stays two-sided never ends.** It ends only at the next hollow episode, which in practice is the next off-hours handoff, and that one re-seeds implausible too (ANET, above). *(r2, Langston's finding)* **And nothing evicts a chain when its position closes** (`_comparators` written `:196`, deleted only at `:273`): a symbol that closes while locked and is bought again inherits the locked chain, skips the `if (!prev)` block, and emits **no `SEED_IMPLAUSIBLE` line at all**. Not yet measured; it spans one process life.

**Live, 2026-09-18.** The seeds all landed off-hours:
| symbol | seed | `seedSpread` / retained median | last-60-min median spread (captured ticker) | bid vs level at 19:36Z |
|---|---|---|---|---|
| ANET/USD | 09-18 00:16:40Z | 0.01000 / 0.00253 | 0.00086 | 198.18 vs stop 193.66 |
| AMC/USD | 09-17 00:16:33Z | 0.02256 / 0.00374 | 0.00368 | 2.71 vs target 2.7081 |
| LOW/USD | 09-17 20:16:31Z | 0.01461 / 0.00026 | 0.00062 | **192.32 vs stop 193.47 — below its stop** |

Each is refusing every tick (396 `REFUSE unvalidated` lines per symbol in the 10 minutes to 19:27Z; no other symbol). **All three books have recovered:** by the guard's own test (`kRel` = 3), a fresh seed now would be plausible on all three.

## 2. PROVENANCE (1.b) — Tier 1: `book-state-tracker.ts` chain lifecycle; the `aee` unvalidated refusal

**Corpora searched:** `git log -S"seedImplausible"` (not path-limited), the `8a` r3-r5 commits, the SIM entry for `book-state*.ts` and S25/S25b, `SYSTEM_MANUAL` §3.5.1, `RUNNING_ISSUES` (`#943`, `#958`), and the `8a-P3` record.
**Introducing commit `f73fbfd0d` (2026-09-13, "8a r3: a reference cannot judge its own seed"), verbatim:**
> *"a new chain whose seed spread exceeds kRel times that retained median can never promote validated. … A healthy re-seed qualifies immediately, so the latch the clear exists to fix stays fixed."*
> *"COST WRITTEN DOWN RATHER THAN DISCOVERED: a book that never recovers holds indefinitely. The position stays open throughout. That is real exposure, not a free win."*

Followed by `293fd3d6b` (r4: retain only a plausible ring) and `8872b2435` (r5: retain on observed movement).
**Reading:** the accepted cost covers a book that **never recovers**. The design's escape is *a healthy re-seed*, and that assumes a re-seed will happen. For a book that recovers while staying two-sided, no re-seed ever comes. So a recovered book is held forever, which is **outside the written-down cost**.
⇒ **Rule-24 outcome (1), a real defect in the escape path against its own stated intent.** It is not outcome (2): the intent is on the page.
**Dispositions:** `book-state-tracker.ts` chain lifecycle — **(2) relevant, needs updating to today's intent.** `aee` unvalidated refusal — **(1) still correct** (refuse on an unvalidated chain stays; what changes is that the chain can end).
**Standing constraints this batch may not break:**
- **No clock term** anywhere in the guard (Kyle, 2026-09-03; SIM: *"The predicate tests the BOOK, never the time"*).
- The **r3-r5 hollow protections** stay: the CRM 7.00/1000.00 self-validation case, the restart-mid-hollow ring, and the frozen artefact.
- **Crypto is untouched.**

## 3. OBJECTIVES — each must FAIL on today's code

| OBJ | objective | verified by |
|---|---|---|
| **1** | A seed-implausible chain whose book **recovers** ends and re-seeds without a human, a restart or a clock, and then validates by the normal rule. *(r2: "recovers" is defined by the arm §4 selects — within `kRel ×` the ring under A; the §4 bound otherwise.)* | **Unit, the REAL tracker state machine** (not a restated boolean — the r2 C1 lesson): an implausible seed, then two-sided frames that recover ⇒ a new chain ⇒ `validated` within a stated number of frames. **Red on today's code.** The new chain does **NOT** inherit `observedMovement` (r5 — a chain earns it); pinned in the fixture. **Staging — the discriminating rule, fixed now (r2 BLOCKER-1):** the population is every held xStock symbol with `REFUSE unvalidated … validated=false` after deploy — **keyed on the REFUSE line, not the seed event**, so an inherited locked chain is inside it. For each such episode, read the concurrently captured ticker spread (`xstock_spot_ticker_snap`). ⛔ **A frame that passes the escape test with no escape line within the stated frame bound is a FAIL.** ⛔ **A `yield_after_N_hollow` clear is NOT an escape** — only the new escape reason counts. Frames-to-escape reported, window and n stated. |
| **2** | The hollow protections are unchanged. | The r3-r5 fixtures (`b-price-side-obj8-reseed-selfvalidation.test.ts` and siblings) stay green **unmodified**. Plus a new fixture: a book that stays hollow (7.00/1000.00) never escapes. |
| **3** | No clock term, and crypto untouched. | Source fence on the three `book-state*` modules; class tripwire. |
| **4** | The escape is observable. | One log line per escape — symbol, frames held, seed spread, escape spread, retained median — on the stream the extract reads (it is `warn`, so `error.log`). |

## 4. THE DESIGN QUESTION FOR STEP 2 — two candidates; the audit decides

- **A — re-judge each frame of an implausible chain against the SAME outside datum.** While `seedImplausible`, test the new frame's spread against `kRel × retainedMedian`. The first plausible frame ends the chain and seeds a new one from itself (and consumes the ring under the r4 rule).
  - No self-validation: the yardstick is the retained ring, which is outside the chain by construction.
  - A 197% hollow spread never passes, so the hollow case still holds.
- **B — count the unvalidated refusal toward the existing yield cap**, so an implausible chain is cleared and re-seeded every N ticks.
  - Reuses the existing *"can never strand a position indefinitely"* invariant.
  - But the yield's alert says *hollow*, which is the wrong label for this state, and escape waits up to the cap.

**Lean: A.** It reuses the exact test that set the flag, so it is the smallest change that makes the stated intent reachable.
**One risk the audit must MEASURE, not assume:** the retained ring has **no age term** (SIM S25b). If a symbol's retained median is tighter than its normal regular-hours spread by more than `kRel`, then A never fires for it. LOW today is 2.4×, under 3, and that margin is thin. Step 2 reads the `SEED_IMPLAUSIBLE` history (14-day `error.log` reach) against the captured-ticker spreads to size this.

### 4a. *(r2 BLOCKER-2)* NEITHER A NOR B RESTORES A BOUND — the ring risk is decided HERE, not at Step 2
A and B share one yardstick, the retained ring (B's re-seed is judged against the same ring, so B fires exactly when A does, only later). **For a symbol whose ring is tighter than its normal spread by more than `kRel`, neither ever fires** — so OBJ-1 is unachievable there and the yield's *"can never strand a position indefinitely"* invariant is not restored. Two ways out:
- **C — a ring-independent bound.** An implausible chain may end and re-seed on evidence that does not come from the ring. The candidate: K consecutive two-sided frames in which **both** sides move and the spread stays under a class-wide absolute ceiling (a DB-governed knob, no default). ⚠️ **This is the PERMISSIVE direction r5's BLOCKER-3/4 fought** — a half-hollow stub-ask book fails "both sides move", and a collapsed 7.00/503 book fails the absolute ceiling, but C is new surface and gets its own fixtures for every r3-r5 case.
- **A + a NAMED ARM for the rest.** A for books within `kRel ×` the ring. For the residual, a dedicated alert that names the symbol, the ring, the current spread and the exposure against stop and target, **owned by CC-C**, and the position held under that alert — the written-down cost, made visible and owned instead of silent.
⛔ **PRE-REGISTERED FLIP RULE — fixed before the Step 2 measurement:**
- **Measure:** over the xStock universe and the captured-ticker archive (14 days), for each symbol, the ratio of its regular-hours median spread to the tightest plausible ring it could plausibly hold. Proxy for the ring: the 5th percentile of its rolling medians at the ring's own window length, `trailingSpreadWindowSnaps`.
- **Stranded set:** the symbols whose ratio exceeds `kRel`.
- **The rule:** if the stranded set holds **≥ 5% of universe symbols, OR any symbol held by paper in the last 30 days**, then **C is built in this batch**. Otherwise it is **A + the named arm**, with C homed.
- ⚠️ The proxy is not the in-memory ring (unreadable), and the captured ticker is a different producer from the guard's frames. Both limits are stated beside the result, and the rule is not re-cut after the data.

## 5. NOT IN THIS BATCH

- **Session-aware plausibility.** An off-hours seed being refused is Kyle's no-clock ruling working as designed.
- **The retained ring's age term.** Measured at Step 2; if needed, it gets its own home.
- **The rest of `8a-P4`** (row `3n.q2`).

## 6. THE LIVE POSITIONS, AND WHAT THEY CANNOT PROVE

A deploy restarts the process, and a restart cold-seeds every chain *"vacuously plausible"*. That clears these three locks **without exercising the fix** (the `8a-P3` Carry-3 precedent). ⇒ **The three current cases are NOT OBJ-1 evidence after the deploy.** OBJ-1 staging evidence is only a `SEED_IMPLAUSIBLE` event that happens after the deploy. Off-hours reconnects seed daily (00:16Z on 09-17 and 09-18), so the population arrives on its own.
**LOW/USD's outcome is recorded as AFFECTED by this defect** in the batch record, so it is never read as a strategy result.

## 7. GOVERNANCE — required in fact, not N/A *(r2)*
`SYSTEM_IMPACT_MAP` **S25b** (*"written at a clear … deleted at the next plausible seed"*) and the `book-state*` entry, and `SYSTEM_MANUAL` §3.5.1, both become factually wrong when the escape lands, so both are required content updates. Plus the Tier-1 set at the `8a-P4` close.
