# B-LANGSTON-CONTEXT — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (Step 2 of 11)

**Owner:** CC-INFRA · **change-class: non_architecture** · **Scope:** `B_LANGSTON_CONTEXT_SCOPE.md` @ `276be80ef`
⚠️ **Step-1 approval is OUTSTANDING — Langston was dispatched 2026-09-04 11:21Z and has not replied. Kyle directed Step 2 proceed. Stated, not hidden: his objections may revise this document, and F-6 below is already a case where the scope was wrong.**

---

## ⛔ 0. PREVIOUSLY STATED → NOW *(at the top, per §9.2 — every number that moved)*

> **PREVIOUSLY STATED:** his reviewer ledger is **34,605 B**, larger than the whole-file cap, so trimming cannot reach the cap.
> **NOW:** **11,245 B**, measured by extracting the section between its own heading and the next.
> **REASON:** I repeated `PHASE_19_PLAN` row 2.8's figure without deriving it. **The argument built on it is WITHDRAWN.** *(`named-not-measured`.)*

> **PREVIOUSLY STATED:** *"there is no delete rule."*
> **NOW:** there IS one — *"a CLOSED batch = ONE line here"*, Kyle 2026-07-01, in his `MEMORY.md` header. It is simply not honoured.
> **REASON:** I asserted an absence from the writer's side without reading the file being written to. *(`absence-never-searched`.)*

> **PREVIOUSLY STATED:** his `MEMORY.md` is **58,177 B** (2026-09-03).
> **NOW:** **59,463 B** (2026-09-04, ~16 h later).
> **REASON:** it grew **+1,286 B while this batch was being scoped** — a live confirmation of the ~1.2 KB/day rate, not a re-measurement error.

> **PREVIOUSLY STATED:** `LANGSTON_ARCHITECTURE.md:58` — his `MEMORY.md` is *"~38 KB … Kept ≤200 lines."*
> **NOW:** **59,463 B**, and the ≤200-line rule was retired by Langston on 2026-07-28.
> **REASON:** a governance doc asserting a live value. **Understated by 56%.** ⇒ **NEW FINDING F-7.**

---

## 1. THE SIX SOURCES — WHICH I READ, AND WHAT EACH RETURNED

| # | source | read? | what it returned |
|---|---|---|---|
| 1 | **the CODE / the objects**, on the host | ✅ | his `MEMORY.md`, `CLAUDE.md`, the self-memory store, `langston_memory.py`, the systemd timer |
| 2 | **runtime + live state** | ✅ | the alert file (803 rows), the Discord crew log, his 3,680 transcripts, `langston-recall` run live |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | ✅ | ⛔ **NO ENTRY for any Langston component.** The SIM maps the TRADING system. **Stated as the §9 governance gap it is** — but see F-8: I judge it correctly out of scope, not wrongly absent. |
| 4 | **`SYSTEM_MANUAL.md`** | ✅ | **SILENT on Langston entirely.** Correctly — no architecture/strategy/regime/filter/math. **Not a gap.** |
| 5 | **the ledger + batch reports** | ✅ | ⭐ **THE DECISIVE SOURCE — see F-6 and F-9. It overturned part of my own scope.** |
| 6 | **`bridge/canonical/`** | ✅ | ⛔ **ZERO coverage of Langston — 0 of 14 files.** *(Positive control: `signal` matches 12 of 14, so the corpus reads.)* **Expected: he did not exist until 2026-05-06, after that corpus was frozen. Recorded because "consulted, no coverage" is itself the required finding.** |

---

## 2. ENTRY-POINT ENUMERATION — REPO-WIDE, BEFORE ANY TRACE *(§9.5(a-ii))*

**Question: what WRITES `/home/langston/MEMORY.md`?**
✅ **EXACTLY ONE writer of record: `.claude/skills/workflow-10-governance/SKILL.md`** — the §10.b recipe (`cat > /tmp/langston_memory.md` → `scp` → `cp`). **Stated explicitly because an asserted "exactly one" needs presence-evidence.** *(Positive control: the same search returns 3 hits for `langston_memory.md` in that file, so it is not blind.)*
⇒ **It is a MANUAL RECIPE executed by a human-directed session. There is no program that writes this file.**

**Question: what SCHEDULES work against it?**
✅ **NOTHING.** One systemd timer matches `langston` — `langston-memory-index.timer` — and it rebuilds the **recall index**, never this file. **No cron entry mentions MEMORY.**

---

## 3. COMPONENT CENSUS AT THE HOP *(§9.5(a) — all five questions)*

| question | answer |
|---|---|
| who **WRITES**? | **Four sessions, manually, at every batch close.** Attributions in the live file: CC-B 13 · CC-A 10 · CC-C 8 · Infra 1. |
| who **READS**? | **Langston**, via the `@MEMORY.md` import at `CLAUDE.md:3` (added 2026-08-05); **and `langston-recall`**, which parses the REVIEWER LEDGER section and **refuses to run if it is unparseable**. |
| who **MUTATES**? | the same four sessions; no other mutator. |
| ⭐ who **DELETES**? | ⛔ **NOBODY. ZERO automated deleters.** The only deletion path is a human-directed prune, which has happened **twice ever** (2026-07-28, 2026-08-05). **THIS IS THE FINDING — see F-1.** |
| who **SCHEDULES**? | **Nothing.** See §2. |

⛔⛔ **TWO ABSENCES, BOTH LOAD-BEARING, AND THE PAIR IS THE MECHANISM: THERE IS AN APPEND OBLIGATION THAT FIRES RELIABLY AND NO DELETE ACTOR OF ANY KIND.** Monotonic growth is not a defect in any component — **it is the arithmetic of the census.**

---

## 4. FINDINGS

**F-1 — THE GROWTH IS STRUCTURAL, NOT BEHAVIOURAL.** One writer (a mandate that fires every batch, four sessions), zero deleters, zero schedulers. **24,528 B at the 2026-08-06 go-live → 59,463 B today: +142%, ~1.2 KB/day, and +1,286 B during this batch's own scoping.**

**F-2 — §10.b's STATED PREMISE WAS FALSE FOR THREE MONTHS.** *"Langston's MEMORY auto-loads every `claude -p` invocation."* It did not, and never had, until `@MEMORY.md` landed 2026-08-05. **Independently corroborated by `LANGSTON_ARCHITECTURE.md:152` and `BATCH_CATALOG.md:464`** — *"every batch's §2 10.b sync wrote to a file he never saw."* **The premise is TRUE today; it was false while the habit and most of the content formed.**

**F-3 — THE CLOSURE BLOCK IS ALREADY HELD, BETTER, BY THE ARCHIVE.** `langston-recall` returns `B-MBIM-SWITCH-ON` and `B-CONDUCT-FILE` with date, source file, line, and an `[ORIGIN — oldest record]` marker. **The note asserts a closure; the archive returns the message that announced it.**

**F-4 — WHETHER HE USES THE CLOSURE BLOCKS IS UNPROVEN IN BOTH DIRECTIONS.** Three instruments: name-counting **CONFOUNDED** (he names a batch because he reviewed it); timing shows topics stay live but **attributes nothing**; a memory-unique-string probe returned zero and is **too weak to report** (candidates were headings). ⛔ **The null is NOT evidence of non-use.** ★ **BUT F-3 makes this NON-BLOCKING: both branches lead to the same disposition.**

**F-5 — THE LEDGER HAS A MANDATORY READER AND NO WRITER.** `langston-recall` refuses on an unparseable ledger and prints retractions before every result; **`REVIEWER LEDGER` appears 0 times in his `CLAUDE.md`** and write-verbs near ledger/retraction **0 times** *(control: `langston-recall` 3, `MEMORY.md` 12)*. **The safety property of the whole recall layer rests on a structure nothing instructs him to maintain.**

⭐⭐ **F-6 — MY SCOPE'S OBJ-4 IS NOT NEW, AND AS WRITTEN IT MAY DESTROY THE THING IT MOVES. THIS IS `#946`, OPEN SINCE 2026-08-29.** §9.5(b-ii) caught it. `#946` **already measured the file, already did the arithmetic, and already put three shapes to Langston.** Two of its results overturn my scope:
- ⛔ **"COLLAPSING EVERY CLOSED BATCH LANDS AT ~32,000 B. STILL OVER."** ⇒ **OBJ-1 + OBJ-2 ARE NECESSARY BUT NOT SUFFICIENT.** *"What remains after the easy cuts is ~26,700 B of things that all look load-bearing — and it exceeds the cap before a single new line is written."*
- ⛔ **THE POSITIONAL OBJECTION TO MOVING THE LEDGER, which I did not consider:** *"its value is POSITIONAL: it works because it arrives BEFORE he reviews, without him remembering to fetch it. A pointer only fires if he goes and reads it — and he cannot be relied on to remember what he does not know he has forgotten."*
- ★ **AND A THIRD SHAPE I NEVER RAISED: THE CAP MAY BE WRONG FOR HIM.** *"He is STATELESS per-invoke — this file plus his `CLAUDE.md` IS his entire memory, where a CC session accumulates context across a long conversation. A cap derived for one may be indefensible for the other."*
⇒ **DISPOSITION: CROSS-REFERENCE, NOT A FRESH FINDING. OBJ-4 is withdrawn as scoped and re-pointed at `#946`; any new insight is recorded ON that issue.** ⚠️ **OWNERSHIP IS UNRESOLVED AND I AM NOT ASSUMING IT: `#946` is filed under CC-A, but Kyle assigned this work to me on 2026-08-30. That needs settling, not assuming.**

**F-7 — A GOVERNANCE DOC ASSERTS A STALE LIVE VALUE.** `LANGSTON_ARCHITECTURE.md:58` — *"~38 KB … Kept ≤200 lines."* Live: **59,463 B**, and the line rule was retired 2026-07-28. **Understated 56%.** Same class as the model line that was wrong for 17 days.

**F-8 — THE SIM HAS NO LANGSTON ENTRY, AND I JUDGE THAT CORRECT.** The SIM maps the trading system's components. **Stated out loud rather than skipped by default** (§9 anti-pattern). His home is `LANGSTON_ARCHITECTURE.md` — which is where F-7's gap lives and where OBJ-3 should land.

**F-9 — A STANDING VERIFICATION RULE ON §10.b THAT I DID NOT KNOW EXISTED.** `#456`: *"every §2-step-10.b Langston-MEMORY sync is complete ONLY when the writing CC greps the rule back off `/home/langston/` and posts the result."* ⇒ **any change to §10.b must preserve or consciously retire this.**

---

## 5. THE PLAN — every item back-references its finding

| # | item | falls out of | verification |
|---|---|---|---|
| **P-1** | Retire the **closure-block limb only** of §10.b; keep sequencing + invariants; preserve `#456`'s read-back rule | **F-2, F-3, F-4, F-9** | `workflow-10` no longer requires a closure block; no closed-batch section appears in his file across the next two batch closes (ledger count, whole file) |
| **P-2** | Eviction becomes structural — compose the loaded file from parts, include a batch only while OPEN | **F-1** | a batch going closed removes its section with **no human action**; generator failure leaves the file intact + alarms — proven by killing it |
| **P-3** | Add the self-memory store to `LANGSTON_ARCHITECTURE.md` §4 **and correct F-7's stale figure in the same edit** | **F-7, F-8** | §4 names the store; the size line names WHERE to read the value, never what it is |
| **P-4** | **WITHDRAWN AS SCOPED.** The ledger/standing-notes home is `#946`. Contribute the measurement + F-5 to that issue; settle ownership with Kyle and CC-A | ⭐ **F-6** | the insight lands **on `#946`**; no duplicate batch is opened |
| **P-5** | Build the daily size/staleness watch | **F-1, F-7** | alarms on a synthetic overage before a human notices |
| **P-6** | Give the reviewer ledger a WRITE rule | **F-5** | a rule exists naming who writes it and when; `langston-recall`'s refusal path still passes |
| **P-7** | Usage instrumentation for recall + memory reads | **F-4** — *the reason F-4 is unprovable is that no instrument exists* | a query is countable without grepping transcripts afterwards |
| **P-8** | Make his rulings retrievable by the other sessions, read-only | scope OBJ-6 | ⚠️ **`UNAUDITED`** — no audit finding supports or opposes it yet; it rests on Langston's answer to *"what breaks?"* |

⛔ **P-8 IS FLAGGED `UNAUDITED` DELIBERATELY** rather than given a retrofitted finding. **The one thing in the plan with no audit treatment is named as such.**

⚠️ **AND THE PLAN NO LONGER CLAIMS TO REACH THE CAP.** **F-6 kills that: P-1 + P-2 land at ~32,000 B against a 24,576 B cap.** ⇒ **the cap question is `#946`'s and may be answered by changing the cap rather than the file** — which is a Kyle scope decision, not a trim.

---

## 6. PLAIN-LANGUAGE SUMMARY

**What the audit turned up.** The growth in Langston's memory file is not anybody being sloppy — **one rule tells four sessions to add to it at every batch close, and nothing anywhere ever removes anything.** No program writes it and no program prunes it. That is the whole mechanism. The rule's own stated reason — that he reads the file on every question — **was untrue for the first three months it ran**, which is when most of the content built up.

**The most useful thing the audit found is that part of my own plan was wrong.** Another session had already measured this a week ago and found that **even removing every finished batch still leaves the file over its limit** — so the change I proposed cannot achieve what I said it would. They also raised an objection I had missed: **his retraction list works precisely because it is in front of him without his having to remember to go and get it, and moving it somewhere tidier could destroy that.** And a third possibility I never considered — **that the size limit may simply be wrong for him**, because for a reviewer who remembers nothing, that file is his entire memory, while for the rest of us it is a convenience.

**So the plan is narrower and more honest than the scope was:** remove the part with no purpose, make the removal automatic rather than remembered, fix a governance file that understates his memory by more than half, and hand the size question back to the issue that already owns it rather than starting a second one beside it.
