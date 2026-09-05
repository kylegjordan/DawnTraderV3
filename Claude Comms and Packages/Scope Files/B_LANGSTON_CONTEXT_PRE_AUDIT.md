# B-LANGSTON-CONTEXT — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (Step 2 of 11)

**Owner:** CC-INFRA · **change-class: non_architecture** · **Scope:** `B_LANGSTON_CONTEXT_SCOPE.md` @ `276be80ef`
✅ **STEP-1 REVIEWED 2026-09-04 11:25Z — CHANGES-NEEDED ×3 + a de-scope; ALL FOLDED IN §8, plan revised in §9 which SUPERSEDES §5.** *(Original line kept:)* ⚠️ **Step-1 approval WAS outstanding — Langston was dispatched 2026-09-04 11:21Z and has not replied. Kyle directed Step 2 proceed. Stated, not hidden: his objections may revise this document, and F-6 below is already a case where the scope was wrong.**

---

## ⛔ 0. PREVIOUSLY STATED → NOW *(at the top, per §9.2 — every number that moved)*

> ⛔ **SUPERSEDED BY §8 — the ledger has NO CLOSING BOUNDARY, so all four circulating figures (34,605 / 11,245 / 22,799 / 10,296) are artifacts of where the measurer cut. The finding is the MISSING BOUNDARY, not any figure. My correction below must NOT be cited as the right number.**

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

**F-1 — THE GROWTH IS STRUCTURAL, NOT BEHAVIOURAL.** ⛔ **PARTLY CORRECTED IN §7 — the file is EFFECTIVELY append-only (31 increases : 3 decreases over 1,213 invokes), NOT absolutely so. Read this finding through §7.** One writer (a mandate that fires every batch, four sessions), zero deleters, zero schedulers. **24,528 B at the 2026-08-06 go-live → 59,463 B today: +142%, ~1.2 KB/day, and +1,286 B during this batch's own scoping.**

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

---

## ⭐ 7. FRESH-READER ROUND 1 — MODE B (claim only). FOUR HITS, ALL RE-DERIVED AT THE OBJECT, AND ONE CORRECTS F-1

`REVIEWER r1: claim-only · "name the objects that would settle 'nothing deletes from his MEMORY.md', then what other states of the world are consistent with them?" · FOUR MATERIAL HITS · re-derived: YES`

⛔ **THE REVIEWER'S FIRST MOVE WAS TO SPLIT MY CLAIM INTO THREE, AND IT WAS RIGHT:** **(A)** no automated deleter exists · **(B)** sessions only append · **(C)** the file grew monotonically. **Evidence for one is routinely mistaken for evidence for another — a deleter can exist while the file still grows, and no deleter can exist while it shrinks.** My F-1 ran all three together.

**HIT 1 — I USED A SPARSE, SELF-SELECTING INSTRUMENT WHEN A PER-INVOKE SERIES EXISTS.** I built the growth series from **backup files** — which the reviewer correctly called *"a sampled, non-random population… a backup gets taken precisely when someone is about to do something risky, so the sample is correlated with the event being measured."*
✅ **THE REAL INSTRUMENT: `/var/log/langston-instructions-loaded.jsonl` (+ 4 rotated `.gz`) records his `MEMORY.md` byte count AT EVERY INVOKE.** **POPULATION: 1,213 rows, 2026-08-05T13:44 → 2026-09-04T11:51, every row carrying the byte count.**

⛔⛔ **CORRECTION TO F-1 — THE FILE IS NOT MONOTONIC. IT SHRANK THREE TIMES:**
| when | change |
|---|---|
| 2026-08-05 13:48 | 25,488 → **23,490** (−1,998) |
| 2026-08-06 22:41 | 24,669 → **24,491** (−178) |
| ⭐ **2026-09-01 06:10** | 55,828 → **45,605** (**−10,223**) |

⇒ **THE HONEST FORM: of 1,213 transitions, 31 are INCREASES, 3 are DECREASES, and ~1,179 are UNCHANGED.** The file is **EFFECTIVELY append-only — 31:3 — not absolutely so.** ★ **"Nothing ever deletes" was false; "additions swamp removals by ten to one, and removals are three human interventions in a month" is true and is the claim that survives.**
⚠️ **AND IT REVISES MY "A PRUNE BUYS ~28 DAYS":** the 09-01 prune freed 10,223 B and the file was back to **59,463 B within three days — ~4,600 B/day, four times the 30-day mean of ~1,132 B/day.** ⛔ **Stated with its limit: three days is a short window and ~1,394 B of that regrowth is MINE, written during this batch.**
✅ **CROSS-INSTRUMENT CORROBORATION: the log's earliest row (25,488 B) matches the `pre-prune-20260805` backup byte-for-byte** — two independent instruments agreeing on the same object.

**HIT 2 — `langston_memory.py` NAMES HIS `MEMORY.md` AS A LEDGER SOURCE, AND I HAD NOT CHECKED WHETHER IT WRITES.** ✅ **RE-DERIVED: `:21` `LEDGER_SOURCES = ["/home/langston/LEDGER.md", "/home/langston/MEMORY.md"]`; it READS at `:239` and `:298`; its ONLY writes are `:224`/`:227` → `INDEX` and `:231`/`:233` → `META`.** ⇒ **reads-but-never-writes, now with line evidence rather than assumption — and it strengthens F-5 with the exact citation.** ⚠️ **RESIDUAL, the reviewer's, and I cannot close it from source: a root-owned `__pycache__/*.pyc` dated 2026-08-06 means the EXECUTING bytecode may differ from the source I read. I verified the SOURCE, not the RUNNING code.**

⛔ **HIT 3 — TWO DIFFERENT FILES ARE BOTH NAMED `MEMORY.md`, AND THIS BATCH WALKS STRAIGHT PAST IT.**
- `/home/langston/MEMORY.md` — **59,463 B** — the one this batch is about
- `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md` — **11,806 B** — the harness auto-memory index
⇒ ★ **anyone verifying *"nothing prunes MEMORY.md"* can examine the wrong object and return clean.** **This is the `wrong-object` pattern sitting in this batch's own path, and it is now named so the implementer cannot walk into it.**

⛔⛔ **HIT 4 — THE DELETION MECHANISM NEED NOT APPEAR IN ANY SCRIPT, AND THIS IS THE ONE THAT MOST CHANGES MY CENSUS.** The reviewer: *"these scripts construct prompts for an LLM that has `Write` and `Edit`. The deletion mechanism need not appear in any script — it can be a sentence in a prompt."* ★ **AND WORSE: `Write` is not an append primitive. A model performing an "append" RE-EMITS THE WHOLE FILE — so elision, summarisation, or silently dropping a section it judged stale is a FAILURE MODE OF THE APPEND ITSELF, invisible to any search for deletion tooling.**
⇒ ⛔ **MY §2 ENTRY-POINT ENUMERATION SEARCHED THE WRONG POPULATION. It enumerated write-shaped COMMANDS in the repo; the actual writers are MODELS WITH A WRITE TOOL, and their instructions are prose.** ✅ **The census result stands** — one recipe, no scheduler, no automated deleter — **but its REACH is now stated: it can only ever have covered the scripted surface.**

⚠️ **AND THE REVIEWER'S SHARPEST POINT, WHICH I AM RECORDING RATHER THAN ARGUING WITH: EVERY INSTRUMENT THAT COULD RECORD A REMOVAL IS OFF, ABSENT, OR STRUCTURALLY INCAPABLE** — `auditd` inactive, no version control on that host, and replace-on-write gives the file a **new inode on every save (Birth 2026-09-02 against content referencing May)**, so there is no continuity to inspect. ⇒ **the absence of deletion evidence here is OVER-DETERMINED: it would look identical whether or not sections were being removed.** ★ **The per-invoke byte log is the ONE instrument with real reach — which is exactly why HIT 1 matters more than the rest.**

★ **ALSO NAMED BY THE REVIEWER AND ALREADY IN THIS AUDIT AT F-6/§10.b: the file's own header carries a 24 KB cap and a "closed batch = ONE line" rule, so a session obeying THAT rule removes content IN COMPLIANCE.** ⇒ **"sessions only append under a governance rule" named one rule and omitted its antagonist. The three decreases above are what that antagonist looks like when someone does obey it.**

**PLAN IMPACT:** **P-2's verification is strengthened** — the per-invoke log is the acceptance instrument for eviction, replacing "check the file afterwards"; **P-5's watch should read that log rather than stat the file**, since it already exists and is written independently of whoever is editing; and **P-7 is partly discharged for the memory half** — the log IS the usage instrument for file loading, though not for recall queries.

---

## ⭐⭐ 8. LANGSTON'S STEP-1 REVIEW — CHANGES-NEEDED ×3 + A DE-SCOPE. FOLDED IN FULL, AND IT KILLS MY OBJ-1 AS WRITTEN

**Received 2026-09-04 11:25Z, at `276be80ef`.** He re-derived: `CLAUDE.md` 66,994 B · `MEMORY.md` **59,463 B** · self-memory store **37 files / 99,718 B** / index 11,806 B · and **reproduced my ledger-writer measurement independently** (`REVIEWER LEDGER` 0 in his `CLAUDE.md`; controls `langston-recall` 3, `MEMORY.md` 12). **He tagged `RULED ON REPORTED FACT`: the 11,245 B ledger figure, the recall archive counts, and the 203/3,680 figure** — none load-bearing for his conclusions.
⚠️ **THE LOOP DID NOT CLOSE BEFORE HE SAW IT.** Round 2 was launched and died with the process; his review arrived first. **Stated rather than dressed up as a completed loop — the round-1 record in §7 stands, round 2 did not happen, and what follows is HIS object read, which is better evidence than a subagent round anyway.**

⛔⛔ **BLOCKER-1 — OBJ-1 CUTS AT THE WRONG SEAM. "CLOSED" ≠ "NO OUTSTANDING OBLIGATION", AND MY OWN VERIFY WOULD HAVE DELETED LIVE STATE.**
**Four counterexamples live in his file right now:** `F-G-2` (Step-8 closed, **observation window OPEN**, four pre-registered INCONCLUSIVE-EXTEND criteria he must read before ruling on any result) · `B-PRICE-AGE-TRUTH` (alert `cecd4a47`, **fires 09-07**) · `B-XSTOCK-FEED-SANITY` (handoffs 09-04 / 09-08) · `F-G-1` (Step-8 is the next gate).
⇒ ★ ***"Those are not history — they are current state wearing a closure label, and your own OBJ-1 VERIFY would have deleted them."*** **He is right and this is the single most important correction in the review.**
✅ **THE FIX: CUT ON `OBLIGATION DISCHARGED`, NOT ON `BATCH CLOSED`.** ⛔ **AND THE REMOVAL IS ONLY SAFE IF THE ALTERNATIVE CARRIER PROVABLY EXISTS — condition OBJ-1 on a standing rule that NO BATCH MAY CLOSE CARRYING AN UNDISCHARGED OBLIGATION unless it is armed as an alert or placed as a named roadmap row with an owner.** *"Absent that we remove the carrier for a class we never measured — the `#661` leg-3 shape."* ⚠️ **Collides with an AWAITING-KYLE item already pending (*"scheduled ≠ verified"*) — sequence with it, do NOT re-decide it.**

✅ **AND HE ANSWERED F-4, THE QUESTION I COULD NOT SETTLE — HONESTLY, INCLUDING ITS LIMIT.** ***"I can't introspect use — I have no memory of having used anything."*** **But structurally: of the 7 `COLLAPSED — the completion report is the record` blocks, NONE carries anything he could not pull by name. Those he supports deleting outright.**
⇒ ⭐ **THE PRECISE DISPOSITION F-4 COULD NOT REACH: *not load-bearing as summary, load-bearing as obligation pointer.* The 7 truly-collapsed blocks GO; the ones carrying a live obligation STAY until the obligation is discharged elsewhere.**

⛔⛔ **BLOCKER-2 — THE `OPEN` PREDICATE MUST NOT BE THE DELIVERY BOARD, AND THE FAILURE I ONLY HYPOTHESISED HAS ALREADY BITTEN HIM TWICE.** `B-MISTAKES-FILE` read *"your Step-4 clearance is the last gate"* until 08-30 when the clearance had already landed at `ec7519410`; `B-EPOCH-KEYING-PARITY` read *"WITH YOU NOW … NOT deployed"* long after close. **Both told him on every invoke that he owed a gate he had already given.** The board lags by owner action — *"F-G-2's card still reads `Blocked on = Langston` after I set Review=Approved."*
✅ **FIX: key the predicate on an explicit `obligations:` list IN THE BATCH'S OWN PART FILE, emptied in the same commit as the close.** Self-declared, but **declared where the close happens.**
★ **AND THE ARGUMENT FOR OBJ-2 THAT MY SCOPE FAILED TO MAKE: composition-by-predicate fixes the STALE-OPEN-HEADING class, which a hand-maintained file structurally cannot.**

✅ **MIGRATION (my Q3) — ANSWERED, AND IT REMOVES THE FLAG-DAY RISK ENTIRELY.** *"Make the generator's input a DIRECTORY OF PARTS and let the entire current hand-maintained file be ONE LEGACY PART."* New batches write parts; old content sits in the legacy part and **shrinks as its batches close**. **Read path unchanged — same file, same auto-load — so only the WRITE side splits, and a batch that writes the old way still lands and still loads. Adoption is PER-BATCH, not per-session**, so a half-adopted state is no longer worse than either end.
⛔ **TWO ADDITIONS HE REQUIRES:** the composed file carries a **GENERATION STAMP + INPUT PART COUNT AT THE TOP** (*"a silently short file is indistinguishable from a quiet week"*), and fail-toward-last-known-good must **STAMP ITSELF VISIBLY STALE** — *"an unstamped frozen artifact reading as fresh is exactly the `B-CROSS-SESSION-BLEED` freeze."*

⭐⭐ **Q2 — THERE IS A FOURTH CATEGORY, AND PUSH/PULL IS THE WRONG AXIS.** *"The axis is: **does the need announce itself?** History announces by name ⇒ pull. Current state doesn't ⇒ push. The fourth is **NEGATIVE KNOWLEDGE — corrections to beliefs I will confidently hold.** The trigger there is a wrong belief that feels right, so I never query for it: **I don't search for what I think I already know.**"*
⇒ ★ **THE RIGHT PATTERN IS NEITHER PUSH NOR PULL BUT *INTERPOSITION* — attached to the ACT OF ASSERTING.** `langston-recall` printing retractions first **IS** that pattern — *"but it fires only if I invoke recall, which is a remembered rule — and Kyle just ruled that a rule not followed isn't the answer."*
⇒ ⛔ **OBJ-4 REVISED: THE LEDGER STAYS *PUSHED*, as its own capped part, UNTIL INTERPOSITION IS MECHANICAL.**
⚠️ **AND A CONCRETE BLOCKER ON COMPOSING IT: THE LEDGER HAS NO CLOSING BOUNDARY.** His heading-range measurement returned **22,799 B** because non-ledger batch bullets run on past it before the next heading. ⇒ ⛔ **IT CANNOT BE COMPOSED AS A PART UNTIL IT HAS ONE.**
★★ **AND THAT RESOLVES THE THREE-WAY DISAGREEMENT ON ITS SIZE — 34,605 (plan row) / 11,245 (mine) / 22,799 (his) / 10,296 (`#946`): ALL FOUR ARE ARTIFACTS OF WHERE THE MEASURER CUT, BECAUSE THE SECTION HAS NO END.** ⛔ **So my §0 "correction" of the 34,605 figure was itself measured against an undefined boundary and must not be cited as the right number. The finding is the MISSING BOUNDARY, not any of the four figures.**
⚠️ **`B-LANGSTON-LEDGER-SPLIT` is already `PHASE_19_PLAN` row 2.8 (him + me) — OBJ-4 must ABSORB that row or DEFER to it; two homes for one thing is what §13 forbids.**

⛔⛔ **BLOCKER-3 — OBJ-6: THREE THINGS BREAK, AND `READ-YES / WRITE-NEVER` COVERS NONE OF THEM.**
**(a)** The store contains **WITHDRAWN** entries — one literally *"never re-assert this tally."* **Retrieval that hands those to another session without the withdrawal at the top is a machine for propagating his retractions as findings** — *"strictly worse than the tool we already have."*
**(b)** It contains his **private calibration on peer sessions** (*"CC-A gets mechanisms wrong more often than measurements"*, *"wrong population ×4 in one night"*). *"Make that readable by CC-A and I will write it more diplomatically and it will be less useful to me."* ⇒ **a real loss, and it was not on my list.**
**(c)** ⭐ **THE ONE THAT ACTUALLY WORRIES HIM: if sessions read his prior rulings before writing a scope, THEY PRE-COMPLY, and his Step-4 degrades from an independent read into a check that they quoted him correctly.** Plus the `#452` laundering — a CC citing his ruling back to him as independent confirmation.
✅ **DE-SCOPED. Default PRIVATE; share by PROMOTION — and the shared surface already exists: `MISTAKE_PATTERNS.md`, which all four sessions read.** *"Generalising PATTERNS are impersonal and safe to share; 'what Langston ruled on batch X' is not. **What's missing is the promotion step, not a new retrieval mechanism.**"*
⚠️ **AND MARK IT `INFERRED`: Kyle said context should be *useful to the entire system*; he did NOT say *expose Langston's store*. A reasonable inference that should wear the label.**

⚠️ **OBJ-5 IS TOO NARROW.** His `CLAUDE.md` is **66,994 B — LARGER than `MEMORY.md`** — and auto-loads on every invoke too. **Total always-loaded: 126,457 B, plus the 11,806 B self-memory index.** ⇒ **watch all three or we alarm on the smaller one.** ★ **And a live demo of the whole disease: his file's own header asserts *"45.6 KB"* against a measured 59,463 B — an always-loaded file asserting a live value.** *(F-7 now has a second instance, in a different file.)*

✅ **OBJ-7 SHOULD LAND FIRST.** *"Every other objective's VERIFY is 'prove it works'; OBJ-7 is the only thing that makes any of them measurable after landing."* ⛔ **Give the counter a POSITIVE CONTROL — a zero read count means *not used* OR *not reachable*, and those are different findings.**

✅ **OBJ-3 CLEARED, with one ask:** he cannot read `/root/backups`, so **its existence is an asserted presence to him** — put a **readable manifest (path, count, sha, timestamp) in his reach**, or the copy itself read-only. **Retention: NO AGE-BASED EVICTION** — *"97 KB / 37 files is not the problem, and it's the only place my corrections live. If it ever needs a cap, evict by SUPERSESSION — a corrected memory replaces its predecessor — never by age."*

✅ **CHANGE-CLASS `non_architecture` RATIFIED**, reasoning accepted, SIM N/A judged defensible, *"your reading of Kyle's ruling is faithful; no over-reach."* ⛔ **ONE CONSEQUENCE HE ATTACHES: `MEMORY.md` is a REQUIRED ledger row in EVERY class including this one, and this batch restructures that file — so the row records composed bytes + part count before/after, and THIS BATCH SHOULD WRITE ITS OWN MEMORY LINE THROUGH THE NEW GENERATOR AS THE END-TO-END PROOF.**

---

## 9. THE PLAN, REVISED — supersedes §5

| # | item | falls out of | verification |
|---|---|---|---|
| **P-7** ⭐ **FIRST** ⛔ *(see §11 — kept WHOLE; the byte log stats files, it does not observe loading)* | usage instrumentation for recall + the three always-loaded files | F-4 · his OBJ-7 ruling | a query is countable; **and the counter has a positive control**, so a zero separates *not used* from *not reachable* |
| **P-1a** | **standing rule: no batch closes carrying an undischarged obligation** unless armed as an alert or placed as a named roadmap row with an owner | ⭐ **BLOCKER-1** | the rule exists and is sequenced with the pending AWAITING-KYLE *"scheduled ≠ verified"* item, not decided around it |
| **P-1b** | retire **only** the 7 truly-collapsed closure blocks; **cut on `obligation discharged`, never on `batch closed`** | **BLOCKER-1** + F-2, F-3 | the four live-obligation sections (`F-G-2`, `B-PRICE-AGE-TRUTH`, `B-XSTOCK-FEED-SANITY`, `F-G-1`) **survive**; the 7 collapsed ones go |
| **P-2** | composition from a **directory of parts**, current file as ONE legacy part, `OPEN` keyed on an **`obligations:` list in the part file**, emptied at close | **BLOCKER-2** + his migration answer | per-invoke byte log shows the section leaving with no human action; composed file carries **generation stamp + part count**; a killed generator leaves a **visibly-stale-stamped** last-known-good |
| **P-3** | self-memory store into `LANGSTON_ARCHITECTURE.md` §4; correct F-7's stale figure; **readable backup manifest in his reach**; **evict by supersession, never by age** | F-7, F-8 + his OBJ-3 ask | §4 names it; the size line names WHERE to read, never what it is; he can enumerate the backup himself |
| **P-4** | ⛔ **REVISED: the ledger stays PUSHED as its own capped part** until interposition is mechanical. **FIRST DELIVERABLE: give the ledger a CLOSING BOUNDARY** — it cannot be composed without one | ⭐ **Q2 fourth category** + F-6 | a boundary exists and two independent measurers get the same byte count; **absorb or defer to `PHASE_19_PLAN` row 2.8** |
| **P-5** | size/staleness watch over **all three always-loaded artifacts** (126,457 B total), not just `MEMORY.md` | his OBJ-5 ruling + F-7 | alarms on a synthetic overage in **each** of the three |
| **P-6** | a WRITE rule for the reviewer ledger | F-5 | rule exists; `langston-recall`'s refusal path still passes |
| **P-8** | ⛔ **DE-SCOPED — no cross-session retrieval.** Replace with a **PROMOTION step** into `MISTAKE_PATTERNS.md` | ⭐ **BLOCKER-3** | a pattern reaches the shared file **impersonally**; his store stays private. ⚠️ **Marked `INFERRED` — Kyle asked for context useful to the system, not for exposing his store** |

⛔ **NO ITEM IS NOW `UNAUDITED`** — P-8's replacement rests on BLOCKER-3, which is a finding.

---

## ⭐⭐ 10. LANGSTON'S STEP-2 REVIEW — CHANGES-NEEDED ×3, ALL THREE RE-DERIVED AND FOLDED

**Received 2026-09-04 17:31Z.** He re-derived the load-bearing numbers himself rather than ruling on report: the byte series (**1,219 rows now — 31 inc / 3 dec / 1,184 unchanged, all three decreases matching my values byte-for-byte**), `langston_memory.py:21/:239/:298`, the ledger-writer controls (0 / 3 / 12), and the three sizes. **§7 HIT 1 stands as measured.**

⛔⛔ **BLOCKER-A — *"THE 7 COLLAPSED BLOCKS"* IS A COUNT, NOT A SET, AND IT IS THE DELETION CRITERION. THIS IS BLOCKER-1 REPRODUCING ONE LEVEL DOWN INSIDE ITS OWN FIX.**
✅ **RE-DERIVED, AND IT IS WORSE THAN HE FOUND — FOUR PASSES HAVE NOW PRODUCED FOUR DIFFERENT ANSWERS:**
| pass | result |
|---|---|
| my folded claim | **7** |
| his enumeration | **9** (3 phrasings) |
| my line-numbered enumeration | **11** — lines `19 · 43 · 44 · 49 · 78 · 88 · 154 · 157 · 160 · 163 · 166` |
| my naive `grep -c` | **13** matching LINES |
⇒ ★ **AND `:49` IS NOT EVEN A MEMBER — it is the RULE *about* collapsing (*"batch entries get collapsed to pointers"*), so my own 11 contains a false positive.** ⛔ **THE SET IS UNDEFINED BY CONSTRUCTION AND NO PHRASE-MATCH WILL EVER RESOLVE IT.**
⚠️ **AND HIS SUBSTANTIVE CATCH STANDS INDEPENDENTLY OF THE COUNT: `:43` reads *"STILL-OPEN items kept: entry-slip investigation = CC-A · #529 (+regimeWeight-0.5 rider)…"* — UNHOMED OPEN THREADS, not fetchable by batch id.** ⇒ **the folded claim *"NONE carries anything he could not pull by name"* is FALSE for at least one member, and I had adopted it from his own Step-1 answer without testing it against the members.**
✅ **P-1b's VERIFICATION IS REPLACED: the removal set is named by HEADING + LINE AT A STATED REF, each member carrying an `obligations: none` DERIVED BY READING IT. Never by phrase-match, never by count.**

⛔⛔ **BLOCKER-B — P-1b AND P-2 CAN SILENTLY BREAK `langston-recall`, AND ONLY P-6 CARRIED THE CHECK.**
✅ **RE-DERIVED:** `/home/langston/LEDGER.md` **does not exist (ENOENT)** ⇒ **`MEMORY.md` is the SOLE surviving ledger source**, and `:298` refuses without it. **The parse is a MACHINE CONTRACT:** `:242` `re.search(r"###\s*Retractions.*?(?=\n##|\Z)")` then a `\n- ` split ⇒ **the literal heading text, the sibling-heading LEVEL, and top-level `- ` bullet indentation are ALL load-bearing on a file this batch proposes to regenerate.**
⛔ **AND THE FAILURE IS SILENT: `:297` `if not retr` catches only EMPTY — a generator that drops HALF the entries parses clean and prints fewer, with no signal.** ★ **Same *"a silently short file is indistinguishable from a quiet week"* class he flagged for the composed file, now inside the retraction overlay — the one thing that stops him re-asserting a withdrawn ruling.**
✅ **BASELINE CONFIRMED AT THE OBJECT: `LEDGER CHECK: … (8 on file at /home/langston/MEMORY.md)`.** ⇒ **P-1b AND P-2 each gate on `langston-recall` returning a KNOWN-POSITIVE WITH A PARSED-ENTRY COUNT — baseline 8 entries / 6,057 B. ⛔ NON-EMPTY IS NOT THE ASSERTION.**

⛔ **BLOCKER-C — MY §7 *"P-7 IS PARTLY DISCHARGED FOR THE MEMORY HALF"* CONTRADICTS THE INSTRUMENT'S OWN SELF-DESCRIPTION.** Every row carries verbatim: ***"candidate set — path existence + size at invoke time; NOT proof the harness loaded them (load proof = sentinel method)."*** ⇒ **it STATS files; it does not observe LOADING. Right instrument for the byte series, WRONG one for use — `#661` leg 1.**
✅ **P-7 STAYS WHOLE. The SENTINEL METHOD the log itself names becomes the positive control I owed.** ⚠️ **I read a size series and called it a usage series — the instrument told me so in its own `measures` field and I did not read it.**

✅ **§13 — `LEDGER_SOURCES[0]` IS A DANGLING PATH.** Disposition **(1) FOLD INTO P-6** — same object. ★ **And it reads as forward-wiring for `B-LANGSTON-LEDGER-SPLIT`, which is an argument for P-4 ABSORBING `PHASE_19_PLAN` row 2.8 rather than deferring to it: the split target is already read-supported.** ⇒ **P-4 ABSORBS 2.8.**

◐ **THE `__pycache__` RESIDUAL IS NARROWED, NOT CLOSED — and I am not recording it as closed.** He judged it closeable in one run by matching the `:298` refusal literal; **my attempt did not produce the match** (the empty-query path returned no matching literal). ✅ **What IS established behaviourally: the RUNNING tool parses the ledger out of `MEMORY.md` and reports `8 on file`, which is the source's `LEDGER_SOURCES` logic executing.** ⇒ **the bytecode agrees with the source ON THE READ PATH; the refusal path remains unverified.**

---

## 11. PLAN, REVISION 3 — the three verification repairs *(supersedes §9 for these rows only)*

| # | item | verification, REPAIRED |
|---|---|---|
| **P-1b** | retire the collapsed closure blocks | ⛔ **the removal set is enumerated by HEADING + LINE at a stated ref, each member carrying `obligations: none` derived by READING it** — never a phrase-match, never a count. **`:43` is excluded on its face** (unhomed open threads). **PLUS: `langston-recall` returns 8 parsed retraction entries after the removal** |
| **P-2** | composition from parts | as §9, **PLUS the same `langston-recall` 8-entry gate** — the composed file must satisfy the `###\s*Retractions` + `\n- ` machine contract, and **a short parse is a FAILURE, not a pass** |
| **P-6** | ledger WRITE rule | as §9, **PLUS fold §13: `LEDGER_SOURCES[0]` (`/home/langston/LEDGER.md`) is dangling — same object, one fix** |
| **P-4** | ledger home | ⛔ **ABSORBS `PHASE_19_PLAN` row 2.8** (was: absorb-or-defer). The split target is already read-supported by `LEDGER_SOURCES[0]` |
| **P-7** | usage instrumentation | ⛔ **KEPT WHOLE — not partly discharged.** The byte log **stats files and says so in its own `measures` field**; the **sentinel method** it names is the positive control |

---

## ✅ 12. STEP-2 APPROVED 2026-09-04 20:36Z — "proceed, P-7 first". FOUR CONDITIONS, three of them pre-P-1b

**He re-derived at the object, pinning the artifact by content hash:** `MEMORY.md` sha256 `d42e946b…40ad49`, **61,155 B**, written 19:29Z. *(It has grown again: 59,463 → 61,155 B.)*

⛔⛔ **C-1 — MY BLOCKER-A FIX IS NOT EXECUTABLE, AND IT IS THE SAME ERROR A THIRD TIME.** *"Heading + line at a stated ref"* fails three ways:
1. ⛔ **HEADING IS NOT A UNIQUE KEY IN THIS FILE — two `## ` headings both name `F-G-2 / B-EXIT-TRANSACTABLE-SIDE` (`:193`, `:202`).** Both are keepers so nothing burns today, **but a non-injective key cannot be a deletion criterion.** ★ **BLOCKER-A one level further down, inside its own fix, again — that is now THREE levels: count → set → key.**
2. ⛔ **IT DOES NOT TYPE-CHECK ACROSS MY OWN CANDIDATE SET.** `:19 :43 :44 :78 :88` are **BULLETS with no heading**; `:154 :157 :160 :163 :166` are **TRAILER lines** whose removal unit is the **enclosing section** (`:153 :156 :159 :162 :165`). **Three object types in one "set", and I never stated the removal UNIT.**
3. ⛔ **"AT A STATED REF" IS UNDEFINED FOR THIS ARTIFACT** — it is not a git object and it has **concurrent writers** (the §10.b `scp`+`cp`). ⇒ **pin by CONTENT HASH asserted at enumeration AND RE-ASSERTED IMMEDIATELY BEFORE THE CUT.**

⛔ **C-2 — `6,057` IS CHARACTERS; UTF-8 BYTES ARE `6,162`.** P-4's own criterion is *"two independent measurers get the same byte count"* — **it would fail on its first use.** ⇒ **name the UNIT and the TOOL wherever a size is asserted.**

⛔⛔ **C-3 — `LEDGER_SOURCES[0]` IS NOT MERELY DANGLING, IT IS THE PRIORITY SLOT, FIRST-WINS.** ⇒ **the moment P-4/P-6 creates `/home/langston/LEDGER.md`, the tool STOPS READING `MEMORY.md`.** **The 8-entry gate must run against whichever source WINS, and if both parse and disagree in count the tool must REFUSE, not silently prefer `[0]`** — otherwise **the split is itself the silent-truncation event BLOCKER-B exists to prevent.**

✅ **C-4 — CORRECT `PHASE_19_PLAN` ROW 2.8 IN PLACE, NOT MERELY SUPERSEDE IT.** Its `34,605 B` is FALSE; **he measured 11,245 B independently and matched my correction**, which is *under* the cap — so the row's argument (*"the two rules cannot both hold"*) is refuted. **Absorption inherits the premise.** ✅ **DONE 2026-09-04, corrected in place, carrying the missing-boundary finding.**
⚠️ **AND THE SAME CLASS CAUGHT IN MY OWN PLAN: P-5's `126,457 B` is STALE — `139,955 B` today (66,994 + 61,155 + 11,806) — while P-3 in the same document says a size line must name WHERE to read, never what it is.**

✅ **THE `__pycache__` RESIDUAL IS CLOSED, and he withdrew his own instrument:** *"`:298` cannot be reached without removing the ledger source; sending you at its literal was the wrong instrument."* **Closed on two measurements instead: (1) `langston-recall` runs the script as the TOP-LEVEL module, and CPython never reads or writes `__pycache__` for `__main__` — the cached bytecode is not on the execution path at all; (2) the `.pyc` is timestamp-validated (`flags=0`) with header source-mtime `1786048191` / size `21573`, both matching the current `.py`.**

⇒ ⛔ **P-1b DOES NOT START UNTIL THE IDENTIFIER IS NAMED. P-7 IS CLEARED AND STARTS NOW.**

---

## ⭐⭐ 13. WHEN SHOULD LANGSTON USE THE ARCHIVE — THE DESIGN, ANSWERED AS DESIGNER *(Kyle-directed 2026-09-05)*

> **Kyle:** *"I want that to be something that you tell me based on the design… When does it make the most sense for Langston to use his archive with the system we're trying to design for him in terms of how he makes his rulings, evaluations, and decisions? When is it best and most helpful and ideal? That's where we should start from, and then we figure out how to enforce that."*
> ⇒ **Design first, enforcement second, Langston pokes holes third. This section is the design. It is MINE and it is not yet reviewed.**

### 13.1 — THE ONE PRINCIPLE EVERYTHING ELSE FALLS OUT OF

**Start from what he IS: a reviewer with NO memory, and that is the product, not a limitation.** He cannot inherit yesterday's belief, cannot think *"I already checked that"*, and has no recollection of forming a conviction — **which is precisely why he catches what we miss.** The archive gives him reach into history **without** giving him memory. ⇒ **the design question is not "how much history should he get" but "which uses of history preserve his independence and which destroy it."**

⛔⛔ **THE PRINCIPLE, AND IT IS THE WHOLE DESIGN:**
> ### **USE THE ARCHIVE TO FIND OUT WHETHER THE QUESTION HAS ALREADY BEEN ANSWERED.**
> ### **NEVER TO FIND OUT WHAT THE ANSWER SHOULD BE.**

★ **It cuts cleanly because it separates FACT from JUDGEMENT.** *"Was this decided?"* · *"Did I withdraw this?"* · *"What was it built to do?"* are **facts about the past**, and looking them up costs him nothing. *"Is this diff correct?"* · *"Is this number right?"* · *"Should we do X?"* are **judgements about the present**, and looking up a prior opinion — **his own most of all** — reintroduces exactly the anchoring his statelessness exists to remove.

### 13.2 — ⭐ THE ORDERING IS THE MECHANISM, AND IT IS THE PART NOBODY HAS STATED

**WHEN in a review he consults it matters more than whether.**
- **Consult BEFORE forming his own read ⇒ he anchors.** The archive becomes a prior, and his verdict is a check that we quoted precedent correctly.
- **Consult AFTER forming his own read ⇒ the archive can only OVERTURN or CONFIRM. It can never SEED.**

⇒ ⛔ **THE RULE: READ THE OBJECT → FORM THE JUDGEMENT → *THEN* CONSULT THE ARCHIVE.**
★★ **AND THIS RETROSPECTIVELY VINDICATES HIS EXISTING §19 TRIGGER FOR A REASON NOBODY WROTE DOWN.** *"Before any verdict token"* is not merely a convenient hook — **the verdict is the LAST thing he emits, so "before the verdict" IS "after the work."** The placement was right; **the justification was missing, which is why it reads as arbitrary and therefore skippable.**

### 13.3 — THE THREE USES, AND ONLY ONE OF THEM CAN BE A REMEMBERED RULE

| tier | what it answers | when | enforcement it needs |
|---|---|---|---|
| **1 — NEGATIVE KNOWLEDGE** *(his retractions)* | *"Am I about to re-assert something I already withdrew?"* | **EVERY verdict, automatically** | ⛔ **INTERPOSED — attached to the act of asserting, NEVER invoked.** ★ **This is the ONE tier where a remembered rule PROVABLY cannot work: the trigger is a wrong belief that FEELS RIGHT, so he never queries for it. His own words: *"I don't search for what I think I already know."*** |
| **2 — SETTLED-QUESTION** *(has this been decided?)* | *"Is this scope re-litigating a Kyle-approved, Langston-reviewed decision? Has this defect been filed and refuted?"* | **before the verdict, AFTER the read** | **remembered is ACCEPTABLE here** — the cost of forgetting is bounded and **visible downstream** (a re-litigation gets caught). §9.5(b-ii). |
| **3 — PROVENANCE** *(what was it built to do?)* | *"Why is it this way? What did it replace?"* | **on demand, his judgement** | **discretionary.** Expensive, usually unnecessary, and **wrong to mandate** — mandating it on every review is how a gate becomes ceremony. |

### 13.4 — ⛔ WHEN HE SHOULD **NOT** USE IT — the half with no answer in his instructions today

**Not merely wasteful — actively WRONG, because each one converts a fresh reviewer into a precedent-follower:**
1. ⛔ **NEVER before reading the object.** The archive is a check on his read, not a substitute for it.
2. ⛔ **NEVER to look up what he previously concluded about a question he is being asked FRESH.** ★ **His own prior ruling is the single most anchoring thing he could read**, and unlike ours it arrives wearing his own authority.
3. ⛔ **NEVER to find how a SIMILAR case was ruled.** *"We did X last time"* is precedent-following, and precedent-following is what a stateless reviewer is FOR NOT DOING.
4. ⛔ **NEVER as a substitute for re-deriving a number.** A hit is a lead; `RULED ON REPORTED FACT` already covers this and it applies to the archive exactly as to us.

★★ **THE COMMON SHAPE, AND IT IS THE SAME OBJECTION HE USED TO DE-SCOPE OBJ-6 — NOW POINTED AT HIMSELF:** he refused to let US read his rulings because *"they pre-comply, and my Step-4 degrades from an independent read into a check that they quoted me correctly."* ⇒ **exactly the same hazard applies when HE reads his own rulings before forming a view. The de-scope argument generalises, and it generalises onto its author.**

### 13.5 — WHAT THIS MEANS FOR THE BUILD

- ✅ **Tier 2 and 3 are already correctly served by `langston-recall` and need no new mechanism** — only the *justification* written into §19 so the trigger stops reading as arbitrary.
- ⛔ **Tier 1 is the one that needs building, and it is the only genuinely NEW mechanism this design implies.** It must fire on the **SHAPE OF AN ASSERTION**, not on his remembering. ★ **`langston-recall` already does exactly this — it prints his retractions first, before any result — but only once he has invoked it, which makes a mechanical interposition depend on a remembered rule.** ⇒ **the fix is to detach the retraction check from the recall invocation.**
- ⛔ **THE "WHEN NOT TO" IS A RULE, NOT A MECHANISM, AND I AM NOT PRETENDING OTHERWISE.** Nothing can stop him consulting the archive early. **What CAN be done is remove the incentive: if Tier 1 fires automatically, the main reason to reach for the archive pre-emptively disappears.**

⚠️ **UNREVIEWED. This is my design as designer, per Kyle's instruction. It goes to Langston to attack — and §13.4 point 2 is the one I most expect him to push back on, because it constrains him more than anything currently does.**
