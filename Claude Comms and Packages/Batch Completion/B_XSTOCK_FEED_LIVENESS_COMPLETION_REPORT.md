# B-XSTOCK-FEED-LIVENESS — Completion Report (#594)

**Owner:** CC-B · **change-class:** `non_architecture` · **Date:** 2026-07-31
**Scope:** `Scope Files/B_XSTOCK_FEED_LIVENESS_SCOPE.md` · **Pre-audit:** `Scope Files/B_XSTOCK_FEED_LIVENESS_PRE_AUDIT.md` (written BEFORE implementation — deliberately, because #605's was skipped)
**Code:** `0464c8219` (fix + Langston Step-4 corrections) → `e93136f81` (Langston Step-8 corrections)
**Sequence:** Kyle-ordered immediately after #605. **Hard prerequisite for xStock active-fill enablement** (Langston-ruled).

---

## 0. What was broken, in one paragraph

The xStock price feed has a watchdog whose job is to notice the feed going quiet and force a reconnect. **It was watching the wrong clock.** The field it read was stamped by **any** frame the socket delivered — including heartbeats and subscription acknowledgements, which carry no prices. ⇒ **a feed sending heartbeats and zero prices read as perfectly healthy, indefinitely.** This is the only venue price source for tokenized equities, and the watchdog is a named prerequisite for turning on xStock active fills — so the alarm that was supposed to protect that switch-on could not fire for the failure it was built to catch.

## 1. Objectives vs outcome

| # | objective | outcome |
|---|---|---|
| OBJ-1 | Provenance read before judging (§2 1.b, rule 24.0) | **YES — and it CHANGED the fix.** At `ce4a7e408` (B74, 2026-05-01) `lastMsgAt` had exactly two consumers — the stamp and a health-log line — and `git show ce4a7e408 \| grep -c "runStallWatchdogTick"` = **0**. ⇒ original intent = *"is this socket talking?"*, for which stamping on **any** frame is **CORRECT**. **Disposition: rule 24 outcome (3) / §2 1.b disposition (2) — the field is not broken; the DEFECT IS THE SECOND ATTACHMENT.** |
| OBJ-2 | ADD a data-liveness clock; never repoint the existing one | **YES.** `lastDataMsgAt` stamped only in the parsers, after each guard; seeded at ws-open. **`lastMsgAt` keeps its stamp site and its health-log consumer — a requirement, not an omission.** |
| OBJ-3 | Watchdog thresholds the new clock, through the same session selection | **YES** — unchanged RTH/off-RTH selection and weekend guard (rule 17: xStocks are 24/5, not US RTH). |
| OBJ-4 | Fences that fail before they pass | **YES — both halves, see §2.** |
| OBJ-5 | Make the new clock observable from outside the process | **YES** (Langston Step-8 ②) — `last_data_msg_age_ms` on the 60s health line. **Without it, #635/#636 would be permanently unobservable.** |

## 2. Mutation proofs — and the one that mattered most was a MISS Langston caught

| mutation | result |
|---|---|
| Watchdog reverted to `lastMsgAt` | **chatter-only fence FAILS** ⇒ the reader is fenced |
| **Stamp restored to `handleMessage` line 1 (the ORIGINAL DEFECT)** | ⛔ **the six original #594 tests ALL STAYED GREEN** |
| Same mutation, against the NEW stamp-site fences | **4 FAIL / 15 pass — and the 4 are precisely the four no-price frames** |
| Restored | **19 passed / 0 failed** |

★ **THIS IS THE BATCH'S CENTRAL LESSON.** Every original #594 test injected both clocks via the test setter and asserted the watchdog read the DATA one. **That fences the READER — but the defect was a WRITER.** Re-introducing the exact bug left all six green. **A fence that stays green with the bug restored does not fence the bug.** Six new fences drive real frames through `handleMessage`: heartbeat · subscribe-ack · malformed snap · unparseable JSON ⇒ connection clock only; ticker · ohlc ⇒ both. **Caught by Langston at Step-8, not by me.**

## 3. Verification

- **CI:** 4/4 green confirmed **job-by-job on the exact reviewed sha** (not inferred from an ancestor, not a cancelled-superseded run).
- **Deploy:** by **naming the sha** (`git reset --hard`, per #621 — the staging deploy otherwise pulls unreviewed HEAD), deployed head confirmed equal to the reviewed sha, process `online`, HTTP 200.
- **Live, non-provoked half — both directions:** the **regression fence holds** (`connected=true last_msg_age_ms=64 rows_persisted_60s=644` — the health log still answers CONNECTION liveness, which the instinctive repoint-the-stamp fix would have silently inverted); the **separation is visible** (`[DIAG] non-data message (key=channel:heartbeat)` / `(key=method:subscribe)` classified as non-data while 644 real price rows landed in the same minute).
- **Provoked half — Langston ruled (a) ACCEPTED:** the mutation-proved unit fence stands as the provoked evidence. **Provoking a real chatter-only stall means suppressing price frames on the only venue mark source with active trading ON** — his words: *"to buy an increment over a mutation-proved test. Not close."*

⚠️ **THE NEGATIVE EVIDENCE WAS MEASURED ON A STREAM THAT COULD NOT CARRY IT — recorded, not buried.** I reported `[STALL]` = zero from **`out.log`**. `[STALL]` is `console.error` ⇒ **`error.log`**. ⇒ **that zero was VOID either way, not merely uninformative.** ★ **This is rule 29(b), and I had written 29(b) into this batch's own verification posture one line earlier** — I required a positive control of everyone else and ran none on myself. Langston re-derived it on the right stream **with** a control (103 `disconnected` + 103 `reconnecting` present ⇒ instrument reaches stream and prefix): **`[STALL]` = 0 across ~13 days RETAINED (07-18 → 07-31).** **Say "retained," not "EVER" — retention is not history.** The conclusion (silence proves nothing) survives; the evidence for it did not.

## 4. What this batch does NOT fix — homed, not folded in

| item | why it is not a defect fix here |
|---|---|
| **#635** — aggregate-clock calibration + **partial-stall blindness** | The thresholds came from **PER-SYMBOL** `captured_at` diffs; this clock is **UNIVERSE-WIDE** (~485 symbols ⇒ ~4ms aggregate vs a 75s threshold) — **~4 orders apart.** What is true and checkable: the aggregate clock is **strictly denser**, so this change **cannot make the watchdog fire more often**. ⇒ it detects a **TOTAL** stall only; one symbol dark of 485 still reads fresh. **Rule 24 outcome (2) — a scope decision, not a unilateral fix.** |
| **#636** — snap-arrival ≠ mark-freshness | The stamp is unconditional; the mark write is conditional on a finite positive mark. A snap can stamp the clock and write no mark. **Mechanism cited, frequency NOT measured.** ⚠ Do not "fix" by moving the stamp into the mark branch — that desynchronises it from `parseOhlcBar`, which has no mark at all. |
| Sibling archivers | `crypto-spot-archiver.ts` / `equity-perp-archiver.ts` stamp identically but have **no watchdog** ⇒ **no defect today.** Recorded so a later grep does not read as a missed sweep, and flagged because **any watchdog added later inherits this exact trap.** |

## 5. Process record

1. ⛔ **PRE-AUDIT FENCED THE WRONG FUNCTION.** I put the live-trading constraint on `handleMessage` when the edit lands in **`parseTickerSnap` — which IS the `latestEquityTick` writer.** I guarded the NEIGHBOUR of the thing I was editing. Corrected by Langston at Step-2; the audit carries the correction in place rather than a silent rewrite.
2. ⛔ **A WRONG POPULATION ON THE BATCH'S ONE LOAD-BEARING CLAIM.** I wrote that the thresholds "were derived against THIS clock all along." They were not — per-symbol vs universe-wide, ~4 orders apart. Corrected by Langston at Step-4 and replaced with the checkable version (strictly denser ⇒ cannot fire more often).
3. ⛔ **THE VOID `[STALL]` MEASUREMENT** — §3 above.
4. ⛔ **FENCED THE READER AND CALLED IT DONE** — §2 above.
5. ✅ **Asked instead of improvising** on the provoked case. Langston: *"you were right to ask rather than improvise."* An outward act affecting live trading is his call, not a unilateral one.

★ **The through-line in 1–4: every one is the same error — measuring or guarding an object ADJACENT to the real one.** The wrong function, the wrong population, the wrong log stream, the wrong half of the mechanism. Rule 29 exists for this and I still produced four instances inside one batch; **what caught all four was an independent reviewer re-deriving at the ref, not the rule.**

## 6. Governance files changed
`SYSTEM_IMPACT_MAP.md` (content update — the watchdog's clock, the blast-radius census, the sibling-archiver trap, the retained-not-ever verification note) · `RUNNING_ISSUES.md` (#594 closed; #635 + #636 filed) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` · `GOVERNANCE_EXCEPTIONS.md` (the in-flight `open` row, now dischargeable) · this report · the scope · the pre-audit · `equity-spot-archiver.ts` · `p19-b4a-c3-gate-watchdog.test.ts`.

**System Manual: NOT applicable** — judged explicitly per §9, not skipped by default. No architecture / strategy logic / regime / filter design / signal pipeline / math change; this is feed-liveness instrumentation on an archiver.
