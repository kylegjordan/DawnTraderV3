# B-XSTOCK-BID-TRIGGER-RELAND (row `3n.q7`) — SCOPE

change-class: sub_batch

> **Why this file exists (Langston, Step-2 C1, cleared 2026-09-28T22:58Z):** the governance checker reads the change-class only from a file whose name carries `SCOPE` (`checker.mjs:327`). With the marker only in the pre-audit, it defaulted this batch to `architecture` and made the System Manual a REQUIRED row, which the plan judges N/A. Under `sub_batch` that N/A is legitimate (`config.mjs:138`).

**Parent:** `3n` `B-PRICE-SIDE-BY-JOB` (owner CC-C). **Row:** `PHASE_19_PLAN.md` `3n.q7`, which carries the row's objective and Langston's three re-land conditions (2026-09-19).

**Objective of the row:** put the xStock stop/target TRIGGER back on the transactable bid, after `8a-P4b` Step 9 C1 took it off (`#1065`), once the three conditions are met. **The overnight hold policy is Kyle's call**, brought to him with numbers before any verdict ships.

**Increments:**
1. **The instrument (telemetry only, this increment):** one `[3n.q7][XS_FRAME]` line per evaluated xStock exit tick, with its reconciliation fence, the `frame=none` reasons, the write-rate budget and the pre-registered n-floor; plus the `SNAPSHOT proxy`. Plan: `B_XSTOCK_BID_TRIGGER_RELAND_PRE_AUDIT.md` (Step 2 cleared 2026-09-28T22:58Z with C1-C3; Step 4 approved at `f0a5db295` with four conditions, folded).
2. **The false-HOLLOW instrument and the reseed → `8a-P4a` escape chain** (the row's conditions 2 and 3): scoped 2026-09-30 in §INC-2 below (Kyle: start the next piece now), so its tools are ready when increment 1's window reads.
3. **The re-land itself**, gated on the window's read and on Kyle's hold-policy decision.

**Verification (increment 1):** the frame count reconciles 1:1 to `_exitEvalByClass.xstock.invoked` every cycle (`EVAL_EXIT` prints both); `frame=none` lines carry a reason; the first real line's byte length is recorded in the Step-7 evidence (re-budget above ~375 B); `error.log` stays on daily rotation.

---

## §INC-2 — INCREMENT 2 SCOPE (Step 1, 2026-09-30; Kyle: *"start the next pricing piece, the xStock bid trigger"*)

change-class: sub_batch (unchanged — one increment of the row; declared again so this section stands alone)

**Why now, not after the window.** Increment 1 (the per-tick `[3n.q7][XS_FRAME]` line) deploys with the 2026-10-02 release and then needs its 21-day window. Conditions (2) and (3) do not depend on that window's result — they are an instrument and a proof of the chain. Building them now means the re-land (increment 3) is gated only on the window's read and Kyle's hold decision, not on work that could have been done in parallel. **Nothing in this increment changes a trading decision.**

**The rule under test (named so every objective measures the same thing).** The absolute plausibility test that `book-state.ts:220-224` names as *"a separate, gated decision"*, in the form the 2026-09-17 replay simulated (`B_PRICE_SIDE_BY_JOB_8A_P4B_AUDIT_AND_PLAN.md` §L (A)): a two-sided frame whose spread exceeds the arm-(i) threshold — `max(kRel × trailing median two-sided spread, floorPct/100)`, i.e. `inputs.departureThresholdFrac` — reads `hollow` with reason `spread_blown`. That threshold is already computed on every judged frame, and increment 1's `XS_FRAME` line already prints it (`thr=`, from `departureThresholdFrac`, `active-execution-engine.ts:2231`) beside `spread=`. ⇒ **the would-refuse verdict is recomputable from increment 1's line alone.**

### Objectives

**OBJ-1 — the `spread_blown` arm in the predicate, INERT BY KNOB.** A new branch in `assessBookState` after the side-departure arm (i): `spreadFrac > threshold` ⇒ `hollow`, reason `spread_blown`, gated by a thirteenth knob `spread_blown_enabled` seeded `0` (in the one knob list, `BOOK_STATE_KNOBS`, so the seed migration, the resolver and the boot assertion move together; the boot assertion's count goes 12 → 13). Precedent in the same file: candidate (ii), `feed_read_enabled = 0`. With the knob at 0 every verdict is byte-identical to today.
*Verify:* (a) with the knob at 0, a fixture set covering every existing branch returns the same verdict and reasons as before (a mutation that ignores the knob turns it red); (b) with the knob at 1, the MDB/USD 2026-09-19 00:15:00.592Z frame (derived 335.12 / 465.00 against a 0.72% / 0.46% history) reads `hollow:spread_blown`, and a normal-width frame reads `two_sided`; (c) the boot assertion refuses 12 and 14 knobs.
🚨 **SCAFFOLDING, DECLARED: OBJ-1 DOES NOT MAKE THE ARM FUNCTIONAL. IT STAYS INERT UNTIL INCREMENT 3** (the re-land, gated on the window and Kyle's hold decision).

**OBJ-2 — the false-HOLLOW instrument for the would-refuse runs (condition 2).** An analysis script (no engine change) reading increment 1's `XS_FRAME` lines from `error.log` and the ticker snapshots. A *would-refuse run* is consecutive `frame=ok` lines on one position with `spread > thr`. A run with `bidWouldFire=stop` is a **false HOLLOW** when the market really went there: the traded price (`last`, median over run end + 5 min, with +90 s and +30 min beside it — the horizons `B-XSTOCK-FEED-SANITY` used) is at or below the position's stop — i.e. refusing the run withheld a stop the market actually printed. (Measured against the STOP, not the run's bid: a stub bid can sit far below a stop the market genuinely reached.) The target leg is symmetric (`bidWouldFire=target`, traded price at or above the target). No trades in the horizon ⇒ **not computable**, never "not false". Reported per run, with the RTH / off-hours split and the 13:30Z-open split that condition (1) uses.
*Verify:* positive control — the MDB 2026-09-19 run is EXPECTED to classify as a TRUE hollow (stop 354.79; the snapshots either side quoted 385.00/386.79 and 369.01/415.00 — expected, not measured: the control reads `last` itself and a different answer is a finding); a planted real-move run classifies FALSE; a run with no trades classifies not computable. **The definition is for Langston to rule on at Step 2, before any window data is read.**

**OBJ-3 — the reseed → `8a-P4a` escape chain driven through the decision site to a terminal row (condition 3).** A test through the engine's exit loop (not the predicate alone), knob at 1: a held xStock position's frames go normal → symmetric blowout (`spread_blown` SKIP × `hollow_skip_cap`) → YIELD (refused, `book_state_yield_refused`, the alert fires) → clear → reseed judged IMPLAUSIBLE against the retained ring → refused while wide → the book recovers and moves twice → `SEED_ESCAPED` → the next `two_sided` frame validates → the stop is evaluated on that frame → **the position closes (the terminal row: a `closePosition` call carrying `stop_hit` on the recovered book's price, with the book-state label).** Plus the negative arm: a book that never recovers holds, with the yield alert, and never closes on a blown price.
*Verify:* the test asserts each named line and decision in order and the terminal close; mutations — escape removed, the two-move rule dropped, the arm reading the knob inverted — each turn it red.

**OBJ-4 — nothing ships that changes a decision.** Knob seeded 0; the xStock X3 trigger stays on the mark (C1); `bidWouldFire` stays log-only.
*Verify:* the `8a-P4b` C1 fence (2d) and increment 1's fences stay green unchanged.

### Out of scope (declared)
- Enabling the arm, moving the trigger to the bid, and the overnight hold policy — increment 3; **the hold policy is Kyle's decision, brought with the window's numbers** (the 2026-09-17 replay: 25 of 68 symbols refused for more than 1 h overnight).
- The arm's effect on the ENTRY gate (the engine's entry check refuses on `hollow`) — named now so increment 3's Step 2 audits it; inert here.

### Provenance (1.b)
Corpora: `git log -S` (not path-limited) on `SEED_ESCAPED`, `clearBookStateComparator`, `XS_FRAME` and the false-hollow script; `BATCH_CATALOG` / `RUNNING_ISSUES` / completion reports by symbol; `8A_P4B_AUDIT_AND_PLAN` §L; `B_XSTOCK_FEED_SANITY_COMPLETION_REPORT` §6(c).
- **Tier 1 — `assessBookState` (`book-state.ts`), gains a branch.** Introduced `3b2c4966c` (2026-09-03): *"B-XSTOCK-FEED-SANITY Step 3: the book-state guard on the xStock exit path (#943, closes #567) — build only, DEPLOY HELD to 2026-09-07"*. Its own header (`:220-224`, D1 fix `4dc231e57`) names this arm: *"Catching that needs an ABSOLUTE plausibility test, which changes exit behaviour and is therefore a separate, gated decision."* **Disposition (2): relevant, needs updating to today's intent** — the gate is the knob plus increment 3.
- **Tier 1 — the knob list `BOOK_STATE_KNOBS` and the boot assertion (`b72-warmup.ts`).** Same introducing commit; the one-list rule is `#641` / Langston Step-2 C2. **(2).**
- **Tier 2 — the escape (`advanceBookStateComparator`, `SEED_ESCAPED`)**, `31d90772c` (2026-09-19, `8a-P4a` Step 3): exercised by OBJ-3, not changed. **(1).**
- **Tier 2 — the yield-clear (`clearBookStateComparator`)**, `3ad89b699` (2026-09-03). **(1).**
- **Tier 2 — the false-hollow definition**, `scripts/analysis/b_xstock_feed_sanity_false_hollow.sql` (`056c56981`): OBJ-2 re-applies its horizons to a new population. **(1).**
- `bridge/canonical/`: not consulted for intent — every component here post-dates 2026-09-03; stated.

### Existence + ledger check
`RUNNING_ISSUES` `#1065` (the false stop), `#1066` (the restart-durable ring, row `3n.q8`, which OBJ-3's chain relies on for its outside datum), `#943` / `#567`. No entry or batch builds a `spread_blown` arm or a false-hollow instrument for the spread test.
