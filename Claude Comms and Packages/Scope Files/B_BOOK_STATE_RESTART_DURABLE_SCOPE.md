# B-BOOK-STATE-RESTART-DURABLE — SCOPE (Step 1)

change-class: sub_batch

**Owner:** CC-C. **Parent:** `3n` `B-PRICE-SIDE-BY-JOB`, the xStock half. **Plan row:** `3n.q8` (`PHASE_19_PLAN.md`), placed 2026-09-19 **before `3n.q7`** (the bid re-land depends on it). **Issue:** `#1066`.
**Status:** `STEP: 1 of 11` · `NEXT STEP: 2 of 11`. r1, 2026-09-24.
⛔ **DEPLOY CONSTRAINT:** no deploy before **2026-09-30T00:00:00Z**. The `8a-P4c` increment-1 window runs until then, and a deploy splits it. Steps 1-5 (scope, audit and plan, build, review, CI) run now; Step 6 waits.

---

## 0. WHY THIS, AND WHY NOW

The xStock book-state guard decides whether a price frame is a real two-sided book before an exit acts on it. It judges each new reference chain's **first** frame against the symbol's **retained spread ring** (SIM **S25b**), the one datum from outside the new chain. **Both that ring and the live chains (SIM S25) are in memory only.** A restart empties them, and every first frame after a restart seeds **vacuously plausible**, which is the permissive direction.

**MEASURED, `#1066`:** the C1 deploy's restart (`pm_uptime` 2026-09-19T00:54:06.306Z) landed in the market-wide post-close blowout. ANET/USD's first frame (bid ≈150.99 / ask ≈209.30, seed spread 0.32368) seeded against `retainedMedianNow=none`, validated against itself, and closed `stop_hit` 12 s later. That was a false stop (`closed_trades` `b2a1dcd3-3696-4e66-9123-6ad3f2544166`, net −2.91). Before the restart, an implausible chain with ratio 78.03 had been refusing that same book.
**It also blocks measurement:** the `8a-P4a` escape legs (`SEED_ESCAPED`, `ringAfter`) could not occur on 2026-09-21 because the 21:19Z restart re-emptied every ring (Langston, `8a-P4` Step 8 part 2). No amount of waiting discharges them while restarts erase the ring.
The standing workaround is written in `SYSTEM_MANUAL.md` §3.5.1a: *"Until it lands, do not restart staging during a market-wide spread blowout."* That is an operator rule standing in for a property of the code.

## 1. WHAT EXISTS TODAY — read at `origin/migration/aws-supabase`

- **S25 `_comparators`** (`xstock_spot/book-state-tracker.ts:128`): a per-symbol live chain. Each chain holds a point reference (prior bid, ask, mid, last and time), a trailing `spreads` window (`ringCap = max(5, trailingSpreadWindowSnaps)`, seeded 20), and the chain flags `seedImplausible`, `observedMovement`, `validated` and `seededAtMs`.
- **S25b `_retainedSpreads`** (`:137`): per-symbol `number[]`.
  - **Written** only in `clearBookStateComparator` (`:362-406`), and only when `!prev.seedImplausible && prev.observedMovement && prev.spreads.length > 0` (`:399`). This is **the r5 write gate**.
  - **Deleted** at the next **plausible** seed (`:313`). An implausible seed leaves it in place.
  - No eviction and no age term. That is deliberate: Langston ruled that *"staleness is not the hazard — PROVENANCE is"* (SIM S25b).
- **Writers of `clearBookStateComparator`:** exactly two, the hollow-skip yield (`aee`) and the `8a-P4a` reseed escape inside `advanceBookStateComparator` (SIM S25; `8a-P4a` scope §1).
- **Persistence: none.** Re-checked at the object: no `persist`, `restore` or `load` touches either map. This is the existence check (§6).

## 2. OBJECTIVES — each with its verification

**OBJ-1 — THE STORE HOLDS, FOR EVERY SYMBOL, THE RING A CLEAR WOULD LEAVE BEHIND RIGHT NOW.**
A restart is treated as a clear of every chain. The store's content is defined as: for each symbol, the live chain's `spreads` **if that chain passes the r5 gate**, otherwise the existing `_retainedSpreads` entry, otherwise nothing.
- The gate is **one named predicate**, used by `clearBookStateComparator` **and** by the snapshot, so the two cannot diverge (Langston's design constraint: *persistence REUSES the r5 write gate, it never re-derives it*).
- ⚠️ **This is wider than persisting `_retainedSpreads` alone, and that choice is the scope's main question for Langston (§5 Q1).**
  - Persisting S25b alone covers the ANET shape: an implausible chain does not consume the ring, so ANET's ring was still in S25b.
  - It does **not** cover a symbol whose live chain is plausible and moving. That chain consumed the ring at its seed, so after a restart it would seed vacuously again.
- *Verification:* tests drive the **real** tracker (the `f73fbfd0d` rule: no restated rules in a fixture).
  - A plausible moving chain's spreads are snapshotted.
  - An implausible chain contributes its retained ring, not its own spreads.
  - A frozen chain contributes nothing.
  - **Mutation-proved:** changing the shared predicate changes both the clear and the snapshot, and bypassing it in the snapshot fails a test.

**OBJ-2 — RESTORED AT BOOT, BEFORE THE FIRST xSTOCK EXIT FRAME, NEVER WORSE THAN TODAY.**
Rings load into S25b before the exit loop reads its first xStock frame. **Point references are NOT restored.** A prior book from before the downtime is stale, and comparing a live frame to it would read ordinary movement as departure. Only the ring, which is evidence about the instrument, crosses the restart. Every chain re-seeds fresh and is **judged** against the restored ring.
- **A failed or partial load falls back to today's behaviour** (empty maps) **with a loud alert**. It never fails closed. Refusing every xStock exit because a file or row is unreadable would turn a durability feature into a trading halt.
- *Verification:* a boot test with a seeded store makes the first post-restart seed read `retainedMedianNow` ≠ `none`. A corrupt-store test falls back and raises the alert. One log line reports the count restored and how many were skipped as invalid.

**OBJ-3 — A PERSISTED RING CARRIES ITS PROVENANCE, AND THAT IS RECORDED, NOT GATED.**
Each persisted ring records whether its chain's seed was **judged** against a ring (`seedRetainedMedian != null`, `book-state-tracker.ts:107`) or seeded **vacuously** (cold). It also records when it was written.
- ⛔ **This is NOT a gate.** Langston's r6 ruling stands: the remaining hole (a cold-seeded hollow chain earning `observedMovement` on frame 2 from its own broken ring, `book-state-tracker.ts:386-390`) **is not closeable by gating**. A `seedJudgedPlausible` gate makes the mechanism permanently inert.
- The bit makes the hole **countable across restarts**, which it is not today.
- *Verification:* restored-ring counts are reported split judged/vacuous. A test asserts the bit follows the chain's seed basis.

**OBJ-4 — THE NET EFFECT ON THE r6 HOLE IS STATED, NOT ASSUMED.**
Persistence does not create a new way in. A contaminated ring that passes r5 would reach S25b at the next yield in memory anyway. What persistence changes is its **lifetime** (a restart no longer erases it) and the **rate at which the hole is entered** (fewer vacuous cold seeds after restarts, and restarts are where cold seeds come from).
- Step 2 measures both sides on existing logs: how many post-restart seeds were vacuous, and how many retained rings came from vacuously seeded chains. The scope does not claim the net is favourable before that is read.

**OBJ-5 — DURABLE STORE, CHOSEN AT STEP 2 FROM TWO THAT EXIST (§6).**
- **(a) A database table.** It survives a rebuilt box, and Langston can read it with SQL. It needs a migration plus a rollback file, and ⛔ **the rollback file goes in git** (shared `MEMORY.md`, corrected 2026-09-21).
- **(b) A JSON file**, the pattern already used by the macro feed and by trailing-exit state. ⚠️ Row `3n.c` questions whether `/tmp` is durable enough, so option (b) would not use `/tmp`.
- **Recommendation: (a).**
- *Verification:* a crash test. The newest persisted state is no older than the snapshot cadence Step 2 sets, and that cadence is stated as a number.

**OBJ-6 — VERIFIED ON A REAL RESTART, AND THE OPERATOR RULE COMES OUT OF THE SYSTEM MANUAL.**
The deploy's own restart cannot verify this: the old code persisted nothing, so the store starts empty. Verification needs **one more restart** after the deploy, either the next deploy or a controlled restart during US regular hours, **never during a spread blowout**.
- **Pass:** every held or resting xStock symbol that had a persisted ring seeds with `retainedMedianNow` ≠ `none`, read from the `COMPARATOR_SEEDED` and refusal lines in the first 10 minutes after the restart.
- **Positive control:** the same read on the 2026-09-19 00:54Z restart, where every seed shows `none`.
- Then `SYSTEM_MANUAL.md` §3.5.1a replaces the "do not restart" caution with the mechanism.

**OBJ-7 — CALIBRATION LINE.**
The guard's behaviour changes only in the minutes after a restart, and only for xStock paper exits. Step 2 decides between an epoch bump for `xstock_spot` `paper_sim` and an explicit "no calibration impact" line, with the reason (`ADJUSTMENT_FRAMEWORK` epoch rule 2). Both are acceptable outcomes. Leaving the line out is not.

## 3. OUT OF SCOPE — named so it is not assumed

- **`3n.q5` `B-BOOK-STATE-RING-INDEPENDENT-BOUND`:** manufacturing genesis **without** a ring. This row **preserves** genesis across a restart. They answer the same question from two ends and must not be built in contradiction, so Step 2 states the interface.
- **`3n.q7`:** the xStock bid trigger re-land. It follows this row.
- **Persisting point references or chain flags (S25):** refused above, because they are stale by construction.
- **`3n.c`:** trailing-state durability. It is a different store, but the same `/tmp` question, cross-referenced.

## 4. PROVENANCE (1.b)

Searched `BATCH_CATALOG.md`, `RUNNING_ISSUES.md` (`#1066`, `#958`, `#943`), the `8a-P4a` scope and audit, SIM S25/S25b, `SYSTEM_MANUAL.md` §3.5.1/§3.5.1a, and `git log -S` (not path-limited). The component was built 2026-09-03, after the 2026-01/02 governance change, so `bridge/canonical/` does not apply.

**TIER 1 — behaviour changes:**
- **`_retainedSpreads` (S25b)** — introduced `f73fbfd0d` (2026-09-13), *"8a r3: a reference cannot judge its own seed - retain the spread ring across the yield-clear"*: *"the yield-clear drops the POINT reference but RETAINS the chain's spread ring, and a new chain whose seed spread exceeds kRel times that retained median can never promote validated."* The same commit wrote the cost down: *"a book that never recovers holds indefinitely."* Nothing in it or its successors (`31d90772c`, `e413c0983`) addresses restarts. **Disposition (2), relevant and needs updating:** the intent (an outside datum for every seed) is right, but only holds between restarts.
- **`clearBookStateComparator`** — introduced `3ad89b699` (2026-09-03), *"B-XSTOCK-FEED-SANITY: a hollow frame CAN seed the comparator and a bad seed LATCHED — Langston's Step-8 finding"*. The r4/r5 gates were added under `8a`. **Disposition (2):** its retention predicate is extracted so the snapshot can share it, and its behaviour is otherwise unchanged.
- **`advanceBookStateComparator`**, the seed consumption at `:313` — introduced `3b2c4966c` (2026-09-03), *"B-XSTOCK-FEED-SANITY Step 3: the book-state guard on the xStock exit path (#943, closes #567)"*. **Disposition (2):** the consumption is mirrored to the store.

**TIER 2 — read or called:**
- Server boot and shutdown (`server/index.ts`, the `persistTrailingStates` shutdown flush at `:1638-1649`): the place to restore and flush, following an existing pattern.
- `external-macro-feed.ts:53-58, :475, :533`: the same class of problem, already solved to disk (B67.1, 2026-04-29, Kyle directive), so it is the precedent.

## 5. QUESTIONS FOR LANGSTON AT THIS STEP

- **Q1 (the main one):** persist S25b alone, or *the ring a clear would leave now* (OBJ-1)? S25b alone covers `#1066` exactly. The wider form also covers a symbol whose live chain is plausible and moving, which today re-seeds vacuously after every restart. **Recommendation: the wider form**, through the one shared predicate.
- **Q2:** is a failed load falling back to today's behaviour with an alert (OBJ-2) the right direction, given that the fallback *is* the permissive state this batch exists to remove?
- **Q3:** does a persisted ring need any age or provenance handling at restore, beyond recording it? His S25b ruling says provenance, not staleness, is the hazard, and OBJ-3 records provenance without gating on it. **Recommendation: record only**, and let OBJ-4's measurement decide whether anything more is warranted.

## 6. EXISTENCE CHECK AND LEDGER

- **Built already?** No. Neither map has a persistence path; checked by reading the file at the ref, not by grepping for a name.
- **Two restart-durable patterns exist and are reused, not reinvented:** the macro feed's JSON persistence (B67.1) and trailing-exit state (`trade-safety.ts`, B65.2). Their `/tmp` location is the open question in `3n.c`.
- **Decided already?** No. `#1066` placed this row. The design constraint in §2 OBJ-1 is Langston's, recorded on row `3n.q8`. No ruling says the ring should *not* persist.
