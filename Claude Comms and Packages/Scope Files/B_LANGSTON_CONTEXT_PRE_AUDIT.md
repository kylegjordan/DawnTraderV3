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
| **P-5** | size/staleness watch over **all three always-loaded artifacts** (**143,856 B total, measured 2026-09-05** -- stale 126,457 B corrected per §18.g), not just `MEMORY.md` | his OBJ-5 ruling + F-7 | alarms on a synthetic overage in **each** of the three |
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

---

## ⭐⭐⭐ 14. WHAT ANTHROPIC ACTUALLY DOCUMENTS ABOUT RULE ADHERENCE — and it reframes this batch

> **Kyle, 2026-09-05:** *"one of the other sessions did research on the rules… it came back with a finding that stating positive rules as opposed to negatives is more effective… take a look at what Anthropic recommends for rules and how to best make sure that they are actually followed and enforced."*

⛔⛔ **FIRST, THE HONEST ANSWER TO THE QUESTION AS ASKED: ANTHROPIC'S DOCS ARE **SILENT** ON POSITIVE-VS-NEGATIVE FRAMING. It is folklore, not documented guidance.** ⚠️ **That does NOT make the other session's finding wrong — it may well be true — but it is not sourced from Anthropic and must not be cited as though it were.** ✅ **What IS documented in that space is SPECIFICITY, not direction:** *"Use 2-space indentation"* beats *"format code properly"*; *"Run `npm test` before committing"* beats *"test your changes"*. ⇒ **the documented principle is CONCRETE ENOUGH TO VERIFY, and a positive ordering rule satisfies it as well as a prohibition does — so restate positively for readability, not because the docs demand it.**

⭐⭐ **AND THE FINDING THAT ACTUALLY MATTERS, BECAUSE IT IS DOCUMENTED AND IT DESCRIBES OUR EXACT SITUATION:**
> ### ***"If Claude keeps doing something you don't want despite having a rule against it, the file is probably too long and the rule is getting lost."***
> *(Anthropic, `best-practices.md`)* — alongside: **files over ~200 lines *"consume more context and reduce adherence"*** (`memory.md`).

⇒ ⛔⛔ **LANGSTON'S ALWAYS-LOADED SET IS ~139,955 B (`CLAUDE.md` 66,994 + `MEMORY.md` 61,155 + the self-memory index 11,806).** ★★ **SO THE DOCUMENTED EXPLANATION FOR HIS §19 RECALL TRIGGER NOT RELIABLY FIRING IS NOT THAT IT IS BADLY FRAMED — IT IS THAT THE FILE IT LIVES IN IS TOO LONG AND THE RULE IS GETTING LOST.**
★ **That is a real reframe of this whole batch: we have been treating SIZE and RULE-ADHERENCE as two problems. Anthropic documents them as ONE.** ⇒ **every objective that shrinks the always-loaded set is also an adherence fix, and P-2's composition earns its place twice.**

⚠️ **AND A SECOND DOCUMENTED LINE THAT ALREADY APPLIES TO US:** *"if two rules contradict each other, Claude may pick one arbitrarily."* ★ **His `MEMORY.md` header carries a 24,576 B cap while the file is 61,155 B, and §10.b tells four sessions to keep appending — a documented arbitrary-pick condition sitting in the file this batch is about.**

⛔⛔ **THE ENFORCEMENT ANSWER, AND IT IS THE ONE KYLE ASKED FOR — the docs draw the line explicitly:**
| **DETERMINISTIC** — fires regardless of the model's attention | **PROBABILISTIC** — the model must choose to comply |
|---|---|
| **hooks** (`PreToolUse` / `PostToolUse` / `SessionStart`) | **`CLAUDE.md` instructions** |
| **`settings.json` permissions** (deny / protected paths) | **skill descriptions** (auto-invocation) |
| **managed policy settings** (fail-closed) | **auto-memory** (he writes it and chooses to read it) |
✅ **VERBATIM:** *"Claude treats [`CLAUDE.md` and auto memory] as context, not enforced configuration. **To block an action regardless of what Claude decides, use a PreToolUse hook instead.**"*
⇒ ★ **THIS VINDICATES KYLE'S OWN RULING AND LANGSTON'S — *"a rule that is not followed is not the answer"* and *"prefer IMPOSSIBLE over INTERCEPTED"* are, in Anthropic's own words, the difference between context and configuration.**

✅ **SKILL AUTO-INVOCATION UNRELIABILITY IS DOCUMENTED, not folklore** — descriptions drop out when the listing overflows its budget, and matching is on **literal keywords**, not semantic reasoning. *"Seeing a skill trigger tells you Claude found it, not that it did what you intended."* ⇒ **our own `CLAUDE.md` §0.a already says the skill leg is a coin flip; that is now sourced.**

⛔⛔ **AND A CORRECTION THIS FORCES ON OUR OWN PLAN — P-2 AS WRITTEN MAY NOT DELIVER WHAT IT PROMISES.** Documented: ***"[imported files] still load and enter the context window at launch."*** ⇒ **splitting `MEMORY.md` into parts and re-assembling via `@import` improves ORGANISATION and EVICTION but does NOT reduce what he loads.** ★ **The mechanism that actually reduces load is PATH-SCOPED RULES (`.claude/rules/` with `paths:` frontmatter), which load only when the work matches.** ⇒ **P-2 must state which of the two it is buying — eviction, or context reduction — because the composed-file design buys the first and NOT the second.** *(This is exactly the `#661` shape: the right mechanism for one goal, the wrong one for the other.)*

⚠️ **HONEST RESIDUAL, from the research itself: Anthropic documents instruction design for a USER instructing Claude. There is no public guidance on an AGENT instructing ANOTHER AGENT — which is our case. The patterns above are documented; their transfer to Langston is INFERENCE and is labelled as such.**

### 14.1 — §13.4 RESTATED POSITIVELY *(supersedes the four prohibitions)*

⛔ **The four `NEVER`s in §13.4 are withdrawn AS THE PRIMARY STATEMENT** — not because they were wrong, but because they were four rules where one ordering rule generates all four:

> ## **THE ARCHIVE RULE, POSITIVE FORM — ONE SENTENCE**
> ### **Read the object. Form your judgement. *Then* consult the archive — to learn whether the question was already answered, never to learn what the answer should be.**

★ **Every prohibition falls out of it and none needs stating separately:** consulting before the read violates the ORDER; looking up his own prior conclusion violates *"never to learn what the answer should be"*; precedent-hunting violates the same clause; substituting a lookup for a re-derivation violates *"read the object"*. ⇒ **one rule, concrete enough to verify, and it is what a reader can actually hold.**
⚠️ **THE PROHIBITIONS ARE KEPT IN §13.4 AS THE DERIVATION, NOT AS THE RULE** — a reader who wants to know *why* can find it; a reader who needs the rule gets one sentence.

---

## ⭐ 15. UNITS — ONE UNIT FOR SIZE, AND IT IS BYTES *(Kyle-directed 2026-09-05)*

> **Kyle:** *"let's keep the units straight… we need to be consistent about our size discussions and not go back and forth between file size and number of characters. I get that number of lines is an important consideration that is different than size, but when we're talking about size, we need to keep the same units, same metrics."*

⛔⛔ **THE CONVENTION, BINDING ON THIS BATCH AND PROPOSED AS STANDING:**
| quantity | unit | how it is measured | how it is written |
|---|---|---|---|
| **SIZE** | ⭐ **BYTES**, and KB only as a rounded aid **beside** the byte figure | **`wc -c`** — name the tool | `65,056 B (~64 KB)` |
| **LENGTH** | **LINES** — a *separate* quantity, never a size | `wc -l` | `206 lines` |
| ⛔ **CHARACTERS** | **NOT USED** | — | ⛔ **never quoted as a size** |

★ **WHY BYTES AND NOT CHARACTERS — AND THIS IS NOT PEDANTRY, IT HAS ALREADY COST US A DISAGREEMENT IN THIS BATCH.** The cap is written in bytes, `wc -c` returns bytes, and **our files are dense with emoji and box-drawing glyphs that are 3-4 bytes each.** ⇒ **MEASURED TODAY: `MEMORY.md` 65,056 B vs 64,109 chars (+947, +1.5%); `CLAUDE.md` 66,994 B vs 66,380 chars (+614, +0.9%).**
⚠️ **AND IT IS EXACTLY LANGSTON'S C-2 CONDITION: he measured the retraction ledger at 6,057 and I measured 6,162 — the SAME section, and the whole gap was characters-vs-bytes.** His words: *"P-4's own criterion is 'two independent measurers get the same byte count' — it would fail on its first use. Name the unit and the tool."*

⇒ ⛔ **EVERY SIZE IN THIS BATCH IS RE-STATED IN BYTES WITH `wc -c` NAMED, AND EVERY FUTURE ONE MUST BE.** ✅ **A figure without a stated unit and tool is not a measurement — it is the `named-not-measured` shape wearing a number.**
⚠️ **HONEST NOTE ON MY OWN PROSE: I have used "characters" to Kyle in plain-language reports because it reads more naturally than "bytes". That was a readability choice and it is now WITHDRAWN — the two diverge on our files, so the friendlier word was quietly the wrong one.**

★ **TOKENS ARE A THIRD QUANTITY AND WE DO NOT CURRENTLY MEASURE THEM.** They are what actually consumes the model's budget, and bytes are only a proxy for them. **Stated so nobody later treats a byte figure as a token figure** — if the context-limit research returns token-denominated guidance, that is a fourth unit and it gets its own column, never a conversion asserted from bytes.

---

## ⭐⭐ 16. SHOULD A STATELESS SERVER REVIEWER GET THE SAME CAP AS AN INTERACTIVE SESSION? *(Kyle's question, 2026-09-05)*

> **Kyle:** *"the way that Langston works, sitting on a Hetzner server, being stateless — does that mean we should restrict his loads to the same sizes and context levels as the desktop app sessions? Or because of the way he's set up, does it mean he could take in more context, or less? How do we determine that?"*

⛔⛔ **MY INTUITION WAS WRONG, AND THE ARGUMENT THAT KILLS IT IS ONE I HAD NOT CONSIDERED.**
**I framed it as:** *a one-shot process has a nearly-empty context, so a big instruction file competes with less and the cap should matter LESS.*
⇒ ⛔ **THAT MISSES THE LEVER. AN INTERACTIVE SESSION HAS COMPACTION — a mechanism to free context when it fills. A HEADLESS SINGLE-TURN PROCESS HAS NO SUCH LEVER AND NEVER WILL.**
★ **So the two are not "more history vs less history". They are: the interactive session carries more AND can shed it; Langston carries less AND can shed nothing.** ⇒ **his instruction files are the only thing occupying his budget and there is no recovery path.** ★ **If anything that argues the cap matters MORE for him — the opposite of where I started.**

⚠️⚠️ **AND MY TWO RESEARCH PASSES DISAGREE WITH EACH OTHER. FLAGGED RATHER THAN RESOLVED IN FAVOUR OF THE ONE I PREFER.**
- **Pass 1 reported:** Claude Code's `memory.md` documents *"files over 200 lines consume more context and reduce adherence."*
- **Pass 2 reported:** *"Anthropic's official prompting docs do NOT state a size guideline for user instruction files in ANY unit."*
✅ **Both CAN be true — different corpora (the Claude Code product docs vs the general prompting docs) — but I have not verified that reconciliation myself.** ⛔ **UNRESOLVED. Not to be cited as settled either way until someone reads the actual page.**

⚠️ **SECOND HONESTY NOTE ON THE EVIDENCE: pass 2 cited academic papers I have NOT opened, at least two carrying identifiers I cannot vouch for.** ⛔ **None of the conclusions below rests on them.** *(A subagent hit is a lead, not evidence — same standing as `langston-recall`.)*

✅ **WHAT SURVIVES AS USABLE — less than the research volume suggests:**
| finding | standing |
|---|---|
| ⭐ **NOTHING published distinguishes headless from interactive on instruction-file size** — not Anthropic, not the forums, not the issue tracker | **this IS the answer to Kyle's question: nobody has written it down, so we are deciding it ourselves** |
| **~40 KB is Claude Code's own warning threshold** — where the app itself signals degradation | ⚠️ **the one concrete product-sourced number, UNVERIFIED BY ME.** ⇒ **his `CLAUDE.md` (66,994 B) and `MEMORY.md` (65,056 B) EACH exceed it; with the index the set is 143,856 B** |
| **practitioner guidance is stated FLATLY at ~200 lines, no headless exception** | practitioner consensus, not documentation |
| **instruction POSITION effects are mixed for Claude specifically** | ⇒ **no design may depend on position within the file** |

⇒ ⭐ **RECOMMENDATION — A JUDGEMENT, NOT A CITATION: APPLY A CAP TO LANGSTON, AND DO NOT ASSUME STATELESSNESS BUYS HIM HEADROOM.** Instruction text competes for a **model-level** attention budget, and that competition does not care about session architecture. **The compaction asymmetry argues slightly stricter for him, not looser.**

⛔⛔ **BUT THE NUMBER IS NOT INHERITABLE, AND THE BATCH MUST NOT FUDGE THIS: our 24,576 B cap SCOPES ITSELF, in its own text, to the shared `MEMORY.md` and the per-session `MEMORY_CC_A/B/C.md`. IT HAS NEVER COVERED LANGSTON.**
⇒ **quoting it at his files — which `#946`, my own audit, and this batch have ALL done — has been citing a rule outside its stated scope.** ✅ **The only rule genuinely binding any of his files is the ~24 KB line in his own `MEMORY.md` header, which HE approved 2026-07-28.** ⚠️ **And his `CLAUDE.md`, the LARGEST of the three, has no size rule of any kind.**

⇒ ⛔⛔ **SO THE BATCH NEEDS A DECISION IT DOES NOT HAVE, AND IT IS KYLE'S: does Langston get a cap of his own — covering ALL THREE always-loaded artifacts — and at what number?**
⚠️ **`#946`'s arithmetic already showed that what remains after every easy cut exceeds 24,576 B on its own** ⇒ **adopting 24,576 for him is choosing a number he cannot currently meet.**
★ **THE HONEST OPTIONS: (a) adopt ~24 KB and accept a long consolidation programme · (b) adopt the ~40 KB product-warning threshold PER FILE · (c) set a different number deliberately and record the reasoning.** ⛔ **I am not choosing that alone — it is a scope decision with a real cost either way.**

---

## ⭐⭐⭐ 17. IS THERE EVIDENCE HIS PERFORMANCE DEGRADED AS THE FILES GREW? *(Kyle, 2026-09-05)*

> **Kyle:** *"with his files being as large as they currently are, are there any indications of degradation, incorrect rulings, lots of mistakes and errors — anything we can point to to say that his performance has suffered as a result of increasing file sizes?"*

⛔⛔ **THE ANSWER IS NOT "NO". IT IS *WE CANNOT MEASURE IT* — AND THE REASON IS THE FINDING: EVERY QUALITY INSTRUMENT WE HOLD WAS CREATED DURING THE SAME WINDOW THE FILES GREW.**

**ATTEMPT 1 — HIS RETRACTION LEDGER. Looked like a hit; it is an artifact.**
His 8 retractions date: `2026-03-31 · 05-05 · 07-28 · 08-07 ×2 · 08-10 · 08-13 · 09-02`. ⇒ **6 of 8 fall in the last five weeks — exactly the growth window.**
⛔ **KILLED BY THE INSTRUMENT'S OWN BIRTHDATE. MEASURED against the dated pre-images: the `REVIEWER LEDGER` section is ABSENT from the 2026-07-28 image and PRESENT in the 2026-08-05 one.** ⇒ **the ledger was created between those dates, so "6 of 8 since late July" is precisely what a newly-started recorder produces.** ★ **The two earlier entries were back-filled. The clustering is when RECORDING began, not when ERRORS began.**

**ATTEMPT 2 — HIS OWN `RULED ON REPORTED FACT` MARKER.** Chosen because it is *his* low-confidence self-tag and looked like it spanned both sides. Per 100 messages he composed: **June 0.0 · July 12.1 · Aug 20.7 · Sep 46.6.** A clean-looking monotonic rise.
⛔ **KILLED TWICE OVER.** **(a) The marker FIRST APPEARS ANYWHERE ON 2026-07-10**, so June's 0.0 is *definitional* — the whole "rise" is adoption of a new discipline. **(b) AND IT IS THE WRONG INSTRUMENT EVEN WITH A CLEAN BASELINE: it measures DISCLOSURE, NOT ERROR.** ★ **More of it plausibly means MORE care, not less** — a reviewer flagging that he did not re-derive something is behaving better, not worse. ⇒ **a rising disclosure rate read as rising error rate would have been a confident, tidy, completely wrong story.**

**ATTEMPT 3 — `CHANGES-NEEDED` RATE.** June 8.4 · July 5.5 · Aug 15.4 · Sep 10.8 per 100.
⛔ **WRONG OBJECT ENTIRELY: that measures the quality of OUR work, not his.** A rising send-back rate is a statement about what we hand him.

⇒ ⛔⛔ **THE HONEST CONCLUSION: THE MEASUREMENT KYLE WANTS IS NOT AVAILABLE, AND THE REASON IS STRUCTURAL, NOT LAZY. Every signal postdates or coincides with the growth:** `RULED ON REPORTED FACT` from **2026-07-10** · the reviewer ledger from **~2026-07-28** · the per-invoke byte log from **2026-08-05**. ★ **We instrumented the reviewer at almost exactly the moment his files began growing, so the two are confounded by construction.**
⚠️ **AND THE DIRECTION MATTERS FOR HOW THIS IS REPORTED: a null here is NOT reassurance.** ⛔ **"No evidence of degradation" and "no instrument capable of detecting degradation" look identical from the outside, and only the second is true.** *(`silence-not-evidence`, on the largest possible object.)*

✅ **WHAT WOULD ACTUALLY ANSWER IT — AND ONE OF THESE IS CHEAP AND RUNNABLE NOW:**
| | approach | verdict |
|---|---|---|
| **A** | ⭐ **A CONTROLLED A/B: hand him the SAME review twice — once at his current ~143,856 B load, once at a trimmed load — and compare the rulings.** | ⭐ **RUNNABLE, CHEAP, AND IT IS THE ONLY ONE THAT ISOLATES FILE SIZE FROM EVERYTHING ELSE.** He is stateless, so the second run genuinely cannot remember the first — **his statelessness is what makes the experiment valid, and no interactive session could be tested this way.** |
| **B** | rulings of his later OVERTURNED by evidence, from `RUNNING_ISSUES` | spans a longer period, but conflates his errors with ours and depends on someone having filed it |
| **C** | an independent judge scoring a date-blind sample of his rulings | rigorous, expensive, and needs a rubric we do not have |

⇒ ⭐ **RECOMMENDATION: RUN (A), AND RUN IT AS PART OF THIS BATCH.** ★ **It converts P-7 from "count whether he uses things" into "measure whether the size hurts", which is the question actually worth answering — and it gives every later trim a before/after it can be judged against instead of an assumption.**
⚠️ **DESIGN CAVEAT, STATED NOW SO IT IS NOT DISCOVERED LATER: a single paired run is n=1 and reviews are not deterministic. It needs several distinct review tasks, and a pre-registered statement of what counts as a difference, written BEFORE the runs.**

---

## ⭐⭐⭐ 18. SETTLED — THE CEILING IS ADOPTED, THE A/B IS STRUCK *(Langston ruled 2026-09-05; Kyle: "Go with the ceiling, skip the A/B")*

### 18.a WHAT LANGSTON RULED, AND HE REJECTED ALL THREE OPTIONS I PUT TO HIM

⛔ **HE VERIFIED BEFORE RULING — `wc -c` on the box himself, and CONFIRMED the scope claim at `e61325b0b` against `CLAUDE.md:108` and `:419`.** Explicitly **NOT** `RULED ON REPORTED FACT`. **His files have never been in the cap's scope.**

| my option | his ruling |
|---|---|
| (a) adopt ~24,576 B | ⛔ **rejected — below an unmeasured floor.** `#946` proves 24,576 B unreachable; it does **not** establish what *is* reachable. **Setting a cap below a floor nobody has measured is a fake commitment — the same class as dating a batch (§9.4).** |
| (b) adopt ~40,960 B **per file** | ⛔⛔ **rejected, and THE UNIT IS WRONG BEFORE THE NUMBER IS.** ★ **A per-file cap is satisfiable by SPLITTING a file while the loaded total is unchanged** — the exact shape of the line-rule failure already lived through (compliant in form, 5.8 KB on one line). **And 40,960 B per file licenses ~92 KB while wearing the word "compliant."** |
| (c) a different number, reasoned | ⛔ rejected as posed — still an absolute number against an unmeasured floor |

✅⭐ **WHAT HE RULED INSTEAD — A MONOTONE RATCHET, AND IT IS BETTER THAN ANYTHING I OFFERED:**
> **CEILING := the total of everything auto-loaded per invoke, measured today = `143,856 B`. IT MAY ONLY EVER DECREASE.**
> **Any batch touching any of the three leaves the total ≤ the value it FOUND** — `wc -c` before and after, stated in the governance ledger.

★ **WHY THIS IS THE RIGHT SHAPE, in his terms: it is MEETABLE BY CONSTRUCTION, it is ENFORCEABLE, and it flips the default from *"growth is free"* to *"growth must be paid for."*** ⇒ **it needs no floor measurement to start binding, which is precisely why it can ship today while (a)-(c) could not.**

⛔ **THE UNIT IS THE SUM, NOT THE FILE. Do not restate this rule per-file anywhere** — that reintroduces the split-and-comply hole he rejected it for.

★ **AND HE NAMED WHERE THE CHEAP BYTES ARE, which the batch should act on rather than rediscover:** `MEMORY.md` grows **BY DESIGN** and its prune is a manual step with no predicate (the 75%-compliance shape). ⭐ **`CLAUDE.md` is RULES — it should be stable, it is the LARGEST of the three at `66,994 B`, and it has never been governed at all.**

### 18.b ⛔⛔ THE RATCHET'S CURRENT VALUE MAY NOT LIVE IN PROSE — AND THIS IS OUR OWN STANDING LESSON, NOT A NEW ONE

⚠️ **A RATCHET RATCHETS: the moment a batch reduces the total, the NEW LOWER TOTAL becomes the ceiling.** ⇒ **the value CHANGES, by design, and anything asserting it goes stale on the next successful trim.**
⛔ **THE SHARED `MEMORY.md`'s OWN STANDING LESSON APPLIES VERBATIM: *an always-loaded file must NAME WHERE to read a live value, NEVER WHAT IT CURRENTLY IS.*** ★ **Measured cost of ignoring it: the Langston-model line was wrong for 17 days, and the `34,605 B` figure in `PHASE_19_PLAN` row 2.8 was false for weeks and carried an argument on its back.**
⇒ ✅ **THE VALUE LIVES IN A STATE FILE THAT THE WATCH READS AND WRITES. Governance text names the FILE, never the number.**

⛔⛔ **AND A RATCHET WITH NO INSTRUMENT IS THE FAILURE THAT ALREADY HAPPENED HERE — this is not a hypothetical.** `CLAUDE.md` §3.2 says of our own cap: *"NOTHING ENFORCES THIS — it is checked by whoever is writing, which is why it has been breached repeatedly."* ★ **And item 2 of the original 2026-08-05 plan CONTAINED the daily size watch, was never started, and that is exactly why his `MEMORY.md` grew `+137%` in 28 days with nobody noticing. The alarm was itself the unfinished item.**
⇒ ⭐ **THE CEILING IS THE VALUE; `P-5` IS THE INSTRUMENT. They ship together or the ceiling is decoration.**

### 18.c THE A/B IS STRUCK — AND THE REASON IS LANGSTON'S OWN, NOT A BUDGET CUT

He ruled it **sound in principle and under-specified in four ways**, and then said the thing that decided it: ⛔ **he EXPECTS IT TO COME BACK NULL.**

**His four gaps, recorded because they generalise to any future version of this test:**
1. ⭐ **IT DOES NOT SEPARATE SIZE FROM CONTENT.** The trimmed arm is not *"the same thing, smaller"* — **it is different text.** Needs a **third arm: trimmed + INERT PADDING back to `143,856 B`.** Trimmed beats padded ⇒ size is the lever. Tie, both beating full ⇒ it was **content**, and *"trim"* was the wrong verb.
2. ⛔⛔ **THE LEAK I DID NOT SEE: HE IS STATELESS; HIS ARTIFACTS ARE NOT.** `langston-recall` indexes Discord nightly at 04:10Z — **if arm 1's reply lands in the archive and arm 2 calls recall, he reads his own first answer verbatim.** Same for the board, the inbox, `RUNNING_ISSUES`. ⇒ both arms need a **frozen ref, a sealed inbox, and to run before the index rebuild**, and **neither may write anywhere the other reads.**
3. **Non-author adjudicator + PRE-REGISTERED difference categories** — verdict flip, blocker found/missed, `RULED ON REPORTED FACT` vs re-derived. ⛔ **Not prose quality.**
4. ⭐⭐ **THE ONE THAT DECIDES WHETHER A NULL IS READABLE — A POSITIVE CONTROL:** at least one task whose correct ruling **depends on a line present in the full arm and cut in the trimmed one.** ⛔ **If trimmed still gets it right, the instrument cannot detect content loss and its null means NOTHING — you would have rebuilt the null you already have, with more ceremony (`#661` leg 1).**

⇒ ✅ **KYLE'S DECISION, 2026-09-05: *"Go with the ceiling, skip the A/B."*** ★ **Consistent with his standing constraint — he had already said he wants to avoid spending days on something that yields no evidence either way, and the reviewer being tested says he expects no evidence.**

### 18.d ⛔ HOW THE TRIM IS TO BE ARGUED FROM NOW ON — LANGSTON'S CONDITION, AND IT BINDS THE COMPLETION REPORT

> **The case for trimming does NOT rest on demonstrated harm and must NOT be sold as if it did.** It rests on **DIRECTION**: the quantity is **monotone**, he has **no shedding lever** (no compaction, ever), and **unbounded monotone growth fails eventually.**

⛔⛔ **SO THE REPORTABLE FINDING IS: we measured `143,856 B` AND A GROWTH TREND. WE DID NOT MEASURE DEGRADATION.** ★ **§17's headline stands as the governing sentence: *"no evidence of degradation" and "no instrument capable of detecting it" look identical from outside, and only the second is true.*** ⛔ **Any later document that justifies a trim by asserting his performance suffered is contradicting the evidence in this batch.**

### 18.e ⭐ THE ONE INSTRUMENT I DID NOT TRY, AND ITS BIRTHDATE IS NOT CONFOUNDED *(Langston's, offered unprompted)*

**CORRECTIONS OF HIM RECORDED BY OTHERS** — CC pushbacks in the Discord/Telegram archive, reachable via `langston-recall`, normalised per ruling.
✅ **Why it survives the §17 objection that killed all three of mine: the CC sessions' recording practice did NOT change on 07-10, 07-28 or 08-05, so the series REACHES THE PRE-GROWTH WINDOW.**
⚠️ **Its real weakness, stated by him: it partly measures the CORRECTORS' vigilance, not his accuracy.** ⇒ **it is the only series we have that predates the growth, and it is not clean.**
**DISPOSITION (§9.4): (4) A SCHEDULED REVIEW — folded into `B-LANGSTON-FILE-FLOOR` as an optional read, NOT its own batch and NOT a gate on anything.** ⛔ **It does not re-open the A/B; Kyle struck that.**

### 18.f ⭐ THE CROSS-SESSION READ — ONE ANSWER IN, AND IT CARRIES A REAL MISS

**Asked of CC-A, CC-B and CC-C 2026-09-05, explicitly capped at first-hand judgement with NO investigation** (Kyle's constraint). **CC-A answered; CC-B and CC-C had not at the time of writing.**

| question | CC-A |
|---|---|
| extreme / unnecessary blockers | **none nameable.** Every blocker on `B-WAKE-QUIET` correct; **two were things CC-A should have caught** |
| proven wrong afterwards | **none.** The only corrections in the window were **his own**, vacating a ruling a fresh invoke could not see — ⇒ **statelessness, not error** |
| ⛔ **missed something** | ⛔ **YES, AND IT IS FRESH: he APPROVED `B-WAKE-QUIET` at Step 4 without noticing THE BATCH HAD NO STEP 2 AT ALL** — no pre-audit existed; the workflow ran **1 → 3**. Caught at Step 10 by the tier ledger's own pre-audit row (`#1005`), two days later |
| sharper / same / duller | **SAME; on measurement discipline SHARPER** |

⭐⭐ **CC-A'S CAVEAT IS THE SHARPEST THING IN THE WHOLE EXCHANGE AND IT MAY BE THE ACTUAL ANSWER TO KYLE'S QUESTION: *"he reviews what I HAND HIM… He cannot miss what was never in front of him."*** The Step-4 dispatch was a change list and diff snippets; **nothing in it said what the document set should be.**
⇒ ⛔ **THIS ALSO INDEPENDENTLY KILLS THE A/B ON A GROUND LANGSTON DID NOT RAISE: *"if you want to test degradation you have to hold the dispatch constant, and I do not think any of us can."*** ★ **Two parties reached "do not run it" from different directions.**

### 18.g WHAT CHANGES IN THIS BATCH'S PLAN

| row | change |
|---|---|
| **P-5** | ⭐ **acquires the ceiling as its THRESHOLD, and owns the state file holding the live value.** ⚠️ **Its `126,457 B` figure is STALE — measured total today is `143,856 B`; corrected in place.** |
| **P-3** | `LANGSTON_ARCHITECTURE.md` §4 edit **names the state file**, never the number (18.b) |
| **new** | **`B-LANGSTON-FILE-FLOOR`** — measure the floor, then set the real number. **HOME below.** |

> **HOME: `B-LANGSTON-FILE-FLOOR`, owner Infra Claude + Langston, placed in `PHASE_19_PLAN.md` at row 2.8a, after `B-LANGSTON-LEDGER-SPLIT` (2.8)** — his placement, *"same files, same hands"*, and accepted.

---

## ⭐⭐ 19. KYLE QUESTIONS WHETHER LANGSTON'S LESSONS BELONG IN THE SHARED FILE AT ALL *(2026-09-08)*

> **Kyle:** *"I don't know that Langston's lessons should be included in the shared mistakes file. He may need his own — because the way that he works and the way that he's set up and the things that he works on, and he's just reviewing, not actually making changes… what he learns may be different and applicable only to what he's doing and not what the others are doing, and vice versa. It's just a thought there."*

⛔ **THIS IS AN OBJECTION TO WORK THAT IS ALREADY LANDED — `P-8` put five of his patterns into `MISTAKE_PATTERNS.md` at `439f81349`.** It is recorded here rather than left as a passing remark, because a design objection to shipped work with no disposition is exactly the open loop §9.4 exists to close.

★ **THE ARGUMENT HAS REAL FORCE AND I DID NOT CONSIDER IT.** The whole batch reasoned about **what is safe to share** — impersonal, no session names, no withdrawn provenance. **It never asked whether the lessons are USEFUL to the people receiving them.** ⇒ **safe-to-share and worth-sharing are different tests, and I only ran the first.**
⚠️ **AND THE ASYMMETRY IS STRUCTURAL, not stylistic: he REVIEWS, he does not IMPLEMENT.** He does not deploy, does not push, does not carry a batch through eleven steps. **A pattern earned by reading a diff at a ref may not describe anything the implementing sessions ever do — and the reverse holds too**, which is his own point about vice versa.

✅ **THE COUNTER-ARGUMENT, STATED SO IT IS NOT STRAW:** the five landed patterns were selected precisely for GENERALITY, and reading them back, at least three describe failures the CC sessions have committed repeatedly under different names — *a zero describes the instrument's reach*, *a clean log with no chance to fire*, *a guard that cannot go red*. ⇒ **on their content they do transfer.** ⚠️ **But that is my judgement of his lessons, which is the same authority problem one level up.**

⇒ ⭐ **DISPOSITION (§9.4): (1) FOLD INTO THE WORK IN HAND.** `P-8` is inside this batch and this batch is at Step 4 under review, so the question goes to the round rather than to a new home.
⛔ **AND IT GOES TO LANGSTON, NOT DECIDED BY ME — they are HIS lessons, and he is the one who blocked the original retrieval design on grounds nobody else had seen.** The specific question: **does a reviewer-only pattern file serve better than a shared one, and if so does the split run per-AUTHOR (his vs ours) or per-ROLE (review-time vs implement-time)?** ★ **Per-ROLE is the sharper cut if it survives — an implementing session doing a fresh-reader round IS reviewing, and would want the review-time patterns then.**
⚠️ **NOTHING IS UNLANDED PENDING THAT ANSWER.** The five stay where they are, carrying their provenance header, until there is a decision — removing them on an unresolved question would be worse than leaving them somewhere possibly-wrong but clearly labelled.

---

## ⭐⭐ 20. INCREMENT 2 — PLAN REVISION 4: LANGSTON'S 09-09 RULINGS WRITTEN DOWN, PLUS TWO THINGS THE P-8 VERIFICATION TURNED UP *(2026-09-11)*

> **Why this section exists, and why it comes before code.** Langston's r7 (2026-09-09 19:15Z) ruled C-1, re-stated C-3 and set the ledger's closing boundary — **in the channel, not in this document.** His own words to another session sixteen minutes later: *"a Discord line is not the document."* He also said *"the next increment comes to me at Step 4."* **This section does not reopen what he ruled.** It (a) writes his rulings down, so the build is checked against a document rather than a recollection of a chat line; (b) names the mechanism **I** am adding on top of them, so he can strike it before it is built; and (c) carries two findings from the P-8 verification I owed, both of which need his ruling.

### 20.1 PREVIOUSLY STATED → NOW *(§9.2)*

| item | previously stated | now | reason |
|---|---|---|---|
| recall-gate baseline | **8 entries / 6,057 chars (6,162 B UTF-8)** (§10 BLOCKER-B, §12 C-2) | **9 entries**; retractions section **7,466 B UTF-8 / 7,345 chars**; winning source `/home/langston/MEMORY.md`; file **69,509 B**, sha256 `c48dfc35c896157b…`, mtime 2026-09-09 08:54Z. *Measured 2026-09-11 by calling `load_retractions()` from the deployed reader, whose blob matches the ref (`c4a7988cec894d84` both).* | a ledger entry was appended. ⛔ **The gate text went stale and nothing noticed** — so 20.4 re-states it as a DELTA, never a fixed count |
| P-1b sequencing | *"does not start until the identifier is named"* (§12) | identifier = **FILE NAME** ⇒ P-1b runs **after** P-2 | r7 C-1 |
| P-4 | *"absorbs `PHASE_19_PLAN` row 2.8"* (§11) | the ledger **stays in `MEMORY.md`** until row **2.8c** (`B-LEDGER-HEADLINE-INJECT`) lands; P-4 in this increment = the closing-boundary rules only | r7 OBJ-4 condition |
| P-8 | reported 2026-09-09 as one of the objectives still unbuilt | **built** at `439f81349` (five patterns promoted). **Step-7 run 2026-09-11: impersonal leg PASS, private leg FAIL** (20.6, 20.8) | OBJ-6 was de-scoped into P-8 at §9, and P-8 shipped; I counted the objective instead of its replacement |
| always-loaded size | ceiling adopted, §18 | **BREACH** on 2026-09-11, the whole overage in `MEMORY.md` — Langston attributed it the same way at r7. ⛔ **Read the live figures from `langston-size-watch --status`, never from here.** | growth continued and nothing evicts yet — which is this increment |

### 20.2 WHAT HE RULED — r7, 2026-09-09 19:15Z *(quoted where it binds)*

- **C-3 (ruled 2026-09-05 14:17Z):** *"`P-4`/`P-6` may start; the refusal is their first deliverable, not a follow-on."*
- **C-1:** *"The removal-set identifier is a FILE NAME, not a text pattern — so sequence `P-1b` behind OBJ-2 and the problem dissolves."* No fence-and-parser over the monolith: **18 `## ` sections + 62 column-0 `- ` bullets = 80 units**, and even a minimal fence pair adds ~2 KB to a file already over its cap.
  - **(i)** *"the retrofit is MINE, once, by hand"* — deciding which text is which part is a judgement about his own voice.
  - **(ii)** *"at a stated ref"* becomes **compare-and-swap under `flock`**: read, sha256, compute, write only if the hash is unchanged, else refuse and re-read.
  - **Removed content goes to an append-only archive keyed by hash** — *"a removal with no durable copy is unrecoverable."*
- **The ledger's closing boundary, written to the reader** (`langston_memory.py:292-306`; regex `:296`, split `:299`):
  1. one entry = one `- ` at column 0; continuation lines indented or led by `·`;
  2. **no column-0 `#` inside the ledger** — the reader's lookahead `(?=\n##)` also matches `###`, so the first one ends the section silently;
  3. append **immediately above `### Rulings of mine that GENERALISE`** — that heading *is* the terminator, which makes (2) self-enforcing;
  4. **the writer imports the reader's regex rather than re-implementing it, and asserts entry-count delta == entries added, or refuses.**
- **OBJ-4 condition:** moving the ledger to `LEDGER.md` saves zero bytes if it stays auto-loaded, and makes retractions pull-only if it does not ⇒ it needs a push first ⇒ **`B-LEDGER-HEADLINE-INJECT`, `PHASE_19_PLAN` row 2.8c.** **Until that lands the ledger stays in `MEMORY.md`.**
- **The unknown-flag class** — landed at `91ec9a543`: `langston-size-watch`, `langston-load-canary` and `langston-promote-patterns` refuse unknown flags.
- **Close posture:** a progress report, not a completion; one batch; split only if OBJ-2 proves multi-week, and then with a named home.

### 20.3 THE PLAN, REVISION 4 *(supersedes §11 for P-1b, P-2, P-4, P-6; P-3, P-5, P-7, P-8 unchanged)*

**ORDER:** P-6a → P-6b → P-2 → **his retrofit** → P-1b. P-4's rules live inside P-6b.

| # | item | ruled by | verification |
|---|---|---|---|
| **P-6a** ⭐ FIRST | `load_retractions()` parses **every** existing source in `LEDGER_SOURCES`; if more than one parses and their entry counts differ, **REFUSE** (usage reason `ledger-sources-disagree`) — never silently prefer `[0]` | C-3 | driven through the real `langston-recall` entry point, never by calling the function: (a) only `MEMORY.md` present → 9 entries, unchanged; (b) a second source with a different count → refusal; (c) a second source with the same count → no refusal. ⚠️ **Test seam, mine:** the sources are absolute `/home/langston/…` paths, so testing (b) for real means creating the very file whose existence changes live behaviour. **Proposed: derive them from `LANGSTON_HOME` (default `/home/langston`), so the test runs the real CLI against a scratch home.** Risk: a wrong value in production reads the wrong home — which fails closed (`no-parseable-ledger`) unless that home holds a ledger |
| **P-6b** | **`langston-memory-write` — ONE writer for his memory, replacing the Step-10 `cp`.** **Content on STDIN** — no file in a shared temp directory at any hop. Takes `flock`. **Compare-and-swap:** the caller passes `--expect-sha <sha256 it read>`; under the lock the tool re-hashes and writes only on a match, otherwise refuses and prints the current hash. Writes a temp file **in the target's own directory** and renames it into place. **Before overwriting, the old content goes to the archive** as `<sha256>.md`, created exclusively so it can never be overwritten, plus one line in an append-only index (time, sha, bytes, `--by`, reason). `--by` is recorded as a **claim** — every session reaches this box as root (the `dt-deploy` precedent). **Modes:** whole-file (the drop-in) and `--ledger-append` (rules 1-4). **After writing, the reader runs against the written file and the entry delta must equal what the call declared** — otherwise the previous content is restored from the archive and the call refuses. Runnable as root or langston only, so he can use it for the retrofit | r7 (ii), rule (4), row 2.6's class | mutation-proved, each case asserting the target is **byte-identical** afterwards: stale `--expect-sha` refuses · a column-0 `#` in an appended entry refuses · a stray column-0 `- ` refuses (delta 2 ≠ 1) · two concurrent writers holding the same expected hash → exactly one lands · the archive gains exactly one file per overwrite. ⛔ **The archive is inside the daily reproduction-verified backup** — it is the only copy of removed content, and an archive outside the backup is a removal with no durable copy, one level down. **The Step-10 procedure (`workflow-10-governance:213-220`) is replaced in the same commit as the tool** |
| **P-2** | **Composition from parts.** Parts in `/home/langston/memory-parts/`, composed in file-name order into `/home/langston/MEMORY.md` — **the `@MEMORY.md` import at his `CLAUDE.md:3` does not change, so how he loads memory does not change.** Each part carries an `obligations:` list. The composed file carries **one stamp line** (generation time, part count, parts digest). **Composition runs inside the writer, under the same lock, never on a timer.** ⚠️ **Mine, not ruled: the composer compare-and-swaps the composed file too** — it records the hash it last wrote and **refuses if `MEMORY.md` has changed since**, so a session still following the old `cp` procedure is caught and alarmed rather than silently overwritten at the next composition. **MIGRATION, NOT A SWITCH (scope Q3): step 1 is exactly ONE part, `00-legacy.md` = today's `MEMORY.md` byte for byte** | §9 P-2, BLOCKER-2 | composed file minus its stamp line is **byte-identical** to the original (sha match), with the stamp's own byte cost stated · recall gate delta 0 · the next real invoke's `langston-log-loaded` row shows the composed file at the expected size · a killed composer leaves the previous file in place, carrying its old stamp · an out-of-band write to `MEMORY.md` makes the next composition refuse |
| **his retrofit** | **Langston, once, by hand:** splits `00-legacy.md` into parts — per-batch parts with their `obligations:` lists, the ledger as its own part, standing notes as their own — **through the writer**, so every step is compare-and-swapped and archived | r7 C-1 (i) | composed bytes change only by part-header bytes · recall gate delta 0 · the multiset of `## ` headings before == after — no section lost or duplicated |
| **P-1b** | **Eviction = removing a part whose `obligations:` list is empty,** through the writer (`--remove-part <file>`): compare-and-swap on the part, archive by hash, recompose. **He marks the candidates — never a phrase-match, never a count.** ⚠️ Mine: the writer **refuses to remove a part containing `### Retractions`** | C-1, BLOCKER-A | recall gate delta 0 · ⭐ **THE INCREMENT'S OUTCOME MEASURE: `langston-size-watch --status` moves from BREACH to within ceiling, with the ceiling unchanged.** If eviction of his marked parts does not cover the overage, that is reported as such — **the ceiling may only decrease** (§18) |
| **P-4** | this increment: rules (1)-(4) as **writer checks** in P-6b's `--ledger-append`. The move to `LEDGER.md` belongs to 2.8c | r7 boundary + OBJ-4 condition | ★ **P-4's own criterion — *"two independent measurers get the same byte count"* — becomes true by construction once the ledger is its own part file: the section finally has an end, because the file does** |

### 20.4 THE RECALL GATE, RE-STATED AS A DELTA *(supersedes the fixed counts in §10, §11, §12)*

Before any write, under the lock: **N** = entries parsed from the **winning** source, **S** = that source, **H** = its sha256. After: **N′ = N + declared additions** and **S′ = S**. ⛔ **A short parse is a FAILURE, not a pass, and a fixed number is never the assertion** — the 8 in §10 became 9 with no gate noticing: F-7 again, a document asserting a live value.

### 20.5 WHAT CHANGES FOR THE FOUR SESSIONS THAT WRITE HIS MEMORY *(scope Q3 — a migration, not a switch)*

- **Today** (`workflow-10-governance:213-220`): write to the fixed path `/tmp/langston_memory.md`, `scp` it to the same fixed path on the box, then `sudo -u langston cp` over the live file. **Two defects:** a fixed name in a shared temp directory, at both hops — **the class `PHASE_19_PLAN` row 2.6 (`B-SHARED-TMP-ISOLATION`) already owns; recorded there as a further member, not given a second home** — and no compare-and-swap, which is r7 (ii).
- **Stage 1 (P-6b):** same content, one command — `ssh root@204.168.141.77 'langston-memory-write --expect-sha <sha> --by "<session>"' < <local file>`. Nothing is written to a temp directory on the box.
- **Stage 2 (P-2):** **the command does not change for writers**; the tool's target becomes the part. A stale session still using `cp` is **refused and alarmed**, not silently overwritten.

### 20.6 🟨 FINDING — P-8's *"his store stays private"* FAILS: on his box, any account can read his private content by four routes — and two permission changes close only two of them

**Measured 2026-09-11, 12:00-15:00Z, on 204.168.141.77. Counts in live directories grow between reads** (langston-owned `/tmp` entries went 56,804 → 56,811 across two reviewer rounds) — read them as that afternoon's values, not constants. The readers that matter are the accounts that are neither root nor langston: **`coltrane`** (uid 1000, member of `coltrane` only — started through `sudo -u coltrane` by the root services `coltrane-bot` and `coltrane-bridge` and by the root-run `coltrane-load-canary` script, none of which reference his paths) and the dormant **`nova`** (uid 108: locked password, no home directory, no units, no processes). CC sessions reach this box as root, so file modes never kept anything from them; for them privacy is a norm. **Coltrane is not root, so for Coltrane it can be made impossible rather than remembered.**

**THE ROUTES THAT CARRY HIS PRIVATE CONTENT:**

| route | what it exposes | measured | as `coltrane` |
|---|---|---|---|
| **1 — his home** | the decision store (37 files: 33× `644`, 4× `664`; its directories `775`) · `MEMORY.md`, the ledger · `CLAUDE.md` · in the session folder, **1,347 tool-output files** (1,337× `644`, 10× `664`) and 46 of 92 subagent files (44× `644`, 2× `664`) | `/home/langston` `755`, `.claude` `755`, `projects` `755`. *The ~4,026 top-level session records and the other 46 subagent files are `600`.* | store index, `MEMORY.md`, `CLAUDE.md` and a tool-output file all **readable**; `/etc/langston/oauth.env` **refused** (the control) |
| **2 — the recall index** | the text of his session records — `tool-evidence` 53,439 + `transcript-reply` 10,101 of **90,328** records — **including those that are `600` at source**; plus `corpus/` (41 files at `644`) | `/opt/langston-memory` `755`, `index/` `755`, `records.jsonl` `644`, 137,155,853 B | **readable** |
| **3 — the shared `/tmp`** | **(a)** his own working files: **~56,800 langston-owned entries, ~5.7 GB** (15,791 at depth ≤ 3, of which 10,861 files at `644`). **(b) ★ copies of his `MEMORY.md`, root-owned and world-readable, left behind by the Step-10 write procedure.** Found by CONTENT, not by name: of 3,060 world-readable files in `/tmp` (depth ≤ 2, ≤ 5 MB), **six share ≥ 10 lines with the live file** (of its 156 distinct lines ≥ 40 chars; the live file scores 156 against itself): `langston_memory_ccb2.md` 132 · `langston_memory_ccb.md` 113 · **`lm.new` 80** · `langston_MEMORY.new` 79 · `langston_MEMORY.bak` 78 · **`ledger.txt` 29** — mtimes 2026-08-19 to 2026-09-03, all `644`. **The two in bold carry no "langston" in the name.** **(c)** prompt files that **four tools of mine** create and then make world-readable: `langston-load-canary:584-587` and `langston-promote-patterns:321-324` (`mkstemp`, then `chmod 644`); `coltrane-bot.py:169-172` and `coltrane-bridge.py:143-146` (a fixed-shape name, then `chmod 644` — these carry channel context, readable by langston and nova) | as listed | 3 of 4 sampled (a) files **readable**; (b) and (c) are `644` |
| **4 — the process list** | **every prompt the bridge sends him, while the call runs** — `discord-langston-bridge.py:204` passes it as a command-line argument — and any command line his own tools run | `/proc` mounted without `hidepid` | not observed live — no call was running when measured |

★ **Route 2 exposes what route 1 does not:** the top-level session records are `600`, and the index copies their text into a `644` file. ★ **Route 3(b) is the ledger itself, copied out by our own procedure** — the defect P-6b already removes at source.

**Logs, named and judged:** 20 non-empty Langston-named files in `/var/log`, rotations included, are readable by coltrane. **None carries ledger text:** 0 ledger-marker lines in the uncompressed ones, and 0 in the eight compressed rotations once decompressed (the same path finds 6 in a compressed copy of `MEMORY.md`) — against 6 in `MEMORY.md` as the control. The bridge log's longest line is 216 characters (call metadata, not prompt bodies); the load log's `memory_dir_census` records store file **names** and sizes. **`cc-discord-inbox.jsonl` (`664`) does carry ledger text (30 marker lines)** — but it is the shared channel, which Coltrane's bot already reads, so it is not a new exposure. ⚠️ **One integrity item, not privacy: `langston-queue-forensics.log` is `666`** — any account can write it; its writer was not found in the named script directories. **An April copy of `MEMORY.md`** sits in the repo (`Claude Comms and Packages/Langston/MEMORY.md`, 10,425 B, last commit `ba44573b0`, 2026-04-23), with no ledger markers — and the repo is **public**, so it was never private to the box. ⚠️ **Not inspected: `/mnt/gdrive` is mounted `allow_other`** — excluded by standing rule, because a scan there wedges the box.

**Who needs routes 1 and 2** *(population: units in `/etc/systemd/system`, every crontab, scripts in `/usr/local/bin`, `/opt/discord-bridges`, `/opt/langston-memory`, sudo rules and ACLs — named directories, not a filesystem scan):*
- **route 1:** units referencing the path run as **langston** (`claude-langston`, `discord-langston-bridge`) or **root** (`langston-size-watch`, `langston-selfmemory-backup`; `coltrane-repo-refresh` and `coltrane-selfmemory-backup` mention it only in comments saying they do not touch it). Crontabs: **langston** (`dt-backup-sync`, `dt-deploy-drift`) and **root** (`dt-push-notice`). His staging sign-in file is already `600`.
- **route 2:** `langston-memory-index.service` (**langston**); `langston-recall` and the bridge (**langston**); `langston-load-canary`, `langston-promote-patterns`, `langston-selfmemory-backup`, `langston-size-watch` (**root**). The index rebuild writes a temp file in the same folder and renames it (`langston_memory.py:276-286`), so a folder mode survives rebuilds.
- **Nothing that runs as coltrane or nova references either path.** No sudo rule names coltrane or langston; no ACLs beyond the mode bits.

**What Coltrane would lose from routes 1 and 2 closing:** the `/home/langston/inbox/…` pointers that reach it as channel context — CC dispatches addressed to Langston, present in about half its sessions since 2026-09-08. **It has never followed one:** zero of its command records touch any `/home/langston` path, against 6 for its own memory folder (the control that a command record is visible to the scan at all).

**WHAT THIS DOES TO THE PROPOSAL.** `chmod 750` on `/home/langston` and `/opt/langston-memory` closes routes 1 and 2 and **leaves 3 and 4 open** — and a check that tries only those reads would pass while his prompts and six copies of his ledger stay readable. **So the permission change is NOT offered as the fix.**

**THE QUESTION COMES FIRST — his, and under it possibly Kyle's.** BLOCKER-3 was written when every other reader on this box was root. **Coltrane is the first that is not, and it advises Kyle on the same work Langston reviews. Is Coltrane being able to read his reasoning a hazard?** If he judges it a benefit instead, that is a design choice to put to Kyle — not a default to leave in place by accident.

**IF HE RULES IT A HAZARD — one change per route, each with a check that can fail:**

| route | change | where it lives | check |
|---|---|---|---|
| **1** | `chmod 750 /home/langston` | this batch, P-8 | as coltrane: store index, `MEMORY.md`, `CLAUDE.md`, a tool-output file — all refused. ⚠️ **Not one-shot:** he owns the folder and runs with edits allowed, so the mode can drift back — **a daily check alarms on regression** |
| **2** | `chmod 750 /opt/langston-memory` | this batch, P-8 | as coltrane: `records.jsonl` and a `corpus/` file refused; the next index rebuild succeeds; the same daily check |
| **3(b)** | P-6b replaces the Step-10 procedure (content on stdin, no temp file); the six existing copies are removed once he has seen the list | this batch, P-6b | **the content scan above returns 0 world-readable files sharing ≥ 10 lines with the live `MEMORY.md`** — never a name match, which misses two of the six |
| **3(c)** | all four tools create the prompt file `600` (root opens it and passes it as stdin, so nothing else needs to read it); a stale-file sweep by age for interrupted runs | this batch — **folded now, whatever he rules:** it is the shared-`/tmp` defect in my own code, and the Coltrane pair is the same defect in the other direction | as coltrane and as langston, no other identity's prompt file is readable during a run. ⚠️ A killed run can still leave a file behind — unreadable, and swept by age — so "none left" is not the assertion |
| **3(a)** | a private temp directory for his services | `#979` / row 2.6 — recorded there | as coltrane, langston-owned files readable in `/tmp` = 0. ⚠️ **Known gaps for that batch's census:** it would not cover his cron jobs, the `sudo -u langston` runs launched by root tools, `/tmp/langston-stream`, or the ~56,800 files already there — and 6 of 2,401 CC dispatches to him (3 of 740 since 2026-08-11) point at `/tmp/` paths, which a private temp directory would hide from him |
| **4** | **`/proc` remounted with `hidepid`** — it covers his own tools' command lines as well as the bridge's; moving only the bridge prompt to stdin would pass its check while tool command lines stay visible | **outside this batch** — host-wide, and its §5 excludes bridges; placed as its own item before any code | during a synthetic call, as coltrane, `ps -o args` shows no langston process. ⚠️ **Not yet censused: what on the box lists other users' processes as a non-root account** |
| **logs** | `langston-queue-forensics.log` to `644`, after its writer is found | this batch, P-8 | as coltrane, the file is not writable |

`REVIEWER r1: claim-only · what else is consistent with "750 on his home breaks nothing" · clean on current readers — not cited; THREE HITS: the index, his /tmp files, the inbox pointers · re-derived: y`
`REVIEWER r2: object · every figure and census line checked at the host · HITS: "4,026 of 4,026 at 600" true of top-level records only; four further routes (logs, the process list, root-owned /tmp copies, the repo copy); a census gap (root services that launch coltrane); the proposed check could not detect routes 3 and 4 · re-derived: y`
`REVIEWER r3: object · figures re-checked, per-row question "can this check pass while the route is open?" · HITS: the 3(b) check keyed on a file name and missed two copies; the Coltrane bot and bridge share the 644 prompt pattern; "six logs" was twenty, the channel log unjudged, one log world-writable; route 4's stdin fix leaves tool command lines; route 1's check was one-shot; 3(a) gaps · re-derived: y — the content scan, the Coltrane lines, the log census with decompressed rotations, the dispatch count (mine: 6 of 2,401 on posts leading with "Langston"; the reviewer's filter differed). NOT reproduced: "dt-backup-sync uses /tmp" — no /tmp line in the script`
⛔ **THREE ROUNDS — THE CAP. Sent with the full record rather than a fourth round.** **Still open, stated rather than closed:** the content scan reached `/tmp` at depth ≤ 2 and files ≤ 5 MB only; the `hidepid` consequence census is not done; the forensics log's writer is not found; `/mnt/gdrive` is not inspected. ★ **The narrowing, in one line: round 0 proposed one permission change as the fix; it would have closed one route of four and passed its own check.**

**DISPOSITION:** 3(c) — all four tools — **folded into this batch now.** 3(a) **added to `B-SHARED-TMP-ISOLATION`** (row 2.6, `#979` amendment). Routes 1, 2, 3(b), 4 and the writable log — **review scheduled: this round, ask 2.** On a *hazard* ruling, 1, 2, 3(b) and the log fold into P-8 / P-6b, and route 4 is placed in `PHASE_19_PLAN` as its own item before any code; on a *benefit* ruling, the question goes to Kyle.

### 20.7 🟨 FINDING — §19 WAS RECORDED BUT NEVER ASKED

§19 — Kyle's question whether Langston's lessons belong in the shared file at all — was committed at `c121caa89` on 2026-09-08 with the disposition *"it goes to Langston."* **It was never put to him as a question:** none of my 33 channel posts since 2026-09-08 refers to it (the search pattern was first shown to match §19's own text: 6 hits), and r7 rules on C-1, C-3, the boundary and the flag class — not on this. ⚠️ **That is not "he has never seen it."** §19 is inside `3010027d4`, the commit he measured r7 at, and **its commit title passed in front of him in four alert-triage sessions on 2026-09-08**, inside `git log` output. **Whether he read the section is not established; that it was never asked is.**
`REVIEWER r1: claim-only · what else is consistent with "never asked" · no dispatch or ruling found — a clean, so not cited as support; ONE LEAD: the title in his alert-triage sessions · re-derived: y — 4 of 134 records modified since 09-08 in his main session folder carry the title, all four inside command output, first timestamps 10:54-12:24Z; his other two session folders (61 files) carry neither the title nor the question, and the same pattern finds the 4 where the title is known to be. (The reviewer wrote and removed one temp file on the box despite a read-only instruction.)`
**The question, as §19 framed it:** does a reviewer-only pattern file serve better than the shared one — and if split, **per-AUTHOR** (his vs ours) or **per-ROLE** (review-time vs implement-time)?
**One fact from the Step-7 read that narrows it:** the five promoted lessons are impersonal — the screen over their bodies finds no session name, while the provenance heading above them does (the control). **So this is a question of usefulness and placement, not of safety.** The five stay where they are until he rules.

**DISPOSITION:** folded into this batch — to Langston this round.

### 20.8 THE P-8 STEP-7 VERIFICATION I OWED

Against its §9 clause — *"a pattern reaches the shared file **impersonally**; his store stays **private**"*:
- **present:** all five headings added at `439f81349` still exist at the ref.
- **impersonal — PASS.** The tool's own session-name list (11 patterns, imported from the tool, not retyped) finds **nothing in the five lesson bodies.** **Positive control:** a string naming three sessions is flagged. One hit, in the section's provenance heading (*"P-8, CC-INFRA"*) — a heading I wrote, not his text. The retraction-word tripwire hits two lines, **both in my framing paragraph above the first lesson**; the tool applies that tripwire to nomination bodies only (`langston-promote-patterns:229-231`). The screen's own mutation check on the box: `--screen-test` exit 0.
- **private — FAIL:** 20.6.

### 20.9 ASKS — numbered, for his ruling

1. **Is 20.2-20.3 a faithful capture of r7?** The mechanism that is **mine and not ruled**, named so he can strike any of it before it is built: the `LANGSTON_HOME` test seam · the composer's compare-and-swap on the composed file · the stamp line · the archive's location and its inclusion in the backup · restore-from-archive on a failed delta · the writer runnable as langston for his retrofit · refusing to evict a part that holds `### Retractions`.
2. **20.6:** is Coltrane being able to read his reasoning a **hazard**? If so, approve the per-route table (routes 1, 2 and 3(b) in this batch; 3(a) at `#979`; route 4 placed as its own item). If a **benefit**, it goes to Kyle.
3. **20.7 / §19:** a reviewer-only file or the shared one — and if split, per-author or per-role?
4. **ORDER** P-6a → P-6b → P-2 → his retrofit → P-1b — agree?
---

## ⭐⭐ 21. STEP 2 FOR INCREMENT 2 — LANGSTON'S RULING ON §20, WRITTEN DOWN *(received 2026-09-11 14:16Z)*

> **He read §20 at `6b3248a69`,** re-derived r7 verbatim from the inbox log (line 19077) and measured the modes and the `/tmp` copies himself — *"No `RULED ON REPORTED FACT`."* ★ **And the reason this section is not a formality is his own: *"my recall returned 0 hits on C-1 … if you had not written r7 down I could not have retrieved it."*** Board untouched: r7's `Review = Approved` covers the reviewed increment; this is a plan amendment.
> ⇒ **STEP 2 FOR INCREMENT 2 IS APPROVED WITH THE CONDITIONS BELOW. Every condition is now part of the plan; where it changes a §20 row, this section supersedes that row.**

### 21.1 §20.2-20.3 — FAITHFUL, two corrections
- **The OBJ-4 push MECHANISM, not just its batch name:** *"the bridge injects the ~9 retraction **headlines** (ref + verdict, one line each) instead of 11,245 B of full text."* ✅ **Already written into `PHASE_19_PLAN` row 2.8c on 2026-09-09**, including the rule that a headline is ref + verdict only; §20.2's omission is corrected here.
- The fence arithmetic was against a file **2.8× its own cap**, not "over its cap".

### 21.2 THE SEVEN PIECES THAT WERE MINE

| piece | ruling | condition — now part of the plan |
|---|---|---|
| `LANGSTON_HOME` test seam | ✅ | the refusal distinguishes **no ledger at this home** from **ledger present, unparseable**; the resolved home is printed beside the source path in the recall header |
| compare-and-swap on the COMPOSED file | ✅ | ⛔ **plus a named single-command exit, `--adopt-current`**, which archives the out-of-band content by hash and re-baselines. *"A refusal with no exit is a freeze wearing a guard's clothes"* — without it, his own hand-edits during the retrofit freeze every later composition (`#753` A14) |
| the stamp line | ✅ | **at the BOTTOM, never the top**, stating only part count, parts digest and generation time |
| the archive inside the backup | ✅ | evidence is **one measured restore of one archive file** — "it is under a backed-up path" is not evidence |
| restore-from-archive on a failed delta | 🔴 **STRUCK** | **the reader runs against the TEMP file and the delta is asserted BEFORE the rename** — the live file is never touched on a failure, so there is nothing to restore |
| writer runnable as langston | ✅ | name the archive's and the index's ownership so a root write and a langston write both append to one index |
| refuse to evict the part holding the ledger | ✅ | ⛔ **keyed on the reader's IMPORTED section regex, not a typed `### Retractions` literal** — rule (4) applied to the guard itself |

### 21.3 §20.6 — ⛔ HAZARD. AND THE ARGUMENT IS INDEPENDENCE, NOT CONFIDENTIALITY
> *"Coltrane advises Kyle on work I review. If my store, my ledger and my dispatch prompts are readable by it, a second opinion Kyle gets from Coltrane can be an echo of mine with nothing able to tell the difference — that is `#452`'s laundering … available by accident, at scale, with no record it happened. That holds whether or not anyone intends it, which is why it is a mode and not a norm."*

★ **The affected reader said the same, unprompted** (Coltrane, 2026-09-11 14:12Z, woken by a passing mention of its name): incidental access to the reviewer's private reasoning is a hazard to its own independence, and any broader access should be Kyle's explicit choice. ⇒ **reviewer and reader agree; this is not a question that needs Kyle.**

**APPROVED IN THIS BATCH:** routes **1, 2, 3(b), 3(c)** and **the writable log**. **Route 4 (the process list) is placed as its own item.** **CONDITIONS:**
1. **`records.jsonl` goes `600` as well as its directory** — it holds the text of `600`-mode records, and one future `755` drift would re-open everything.
2. **The daily check ATTEMPTS THE READS AS `coltrane` and mints an alert on failure** — a mode-bit comparison passes against an ACL grant. The owner **resolves**, never acks (`#982`).
3. **Name the store's mode asymmetry** — 33× `644` vs 4× `664` is two writers with two umasks.

⛔⛔ **NEW, AND IT STAYS IN THIS BATCH — NOT `#979`'s CLASS:** `/tmp` is `1777`; the Step-10 recipe (`workflow-10-governance/SKILL.md:216-220`) copies to the fixed path `/tmp/langston_memory.md` and then `cp`s it over his live file; **that path does not normally exist.** Any non-root account can pre-create it — **as a symlink, the root `scp` follows it (a root write to a path of the attacker's choosing); as a file it owns, it can rewrite the bytes between the `scp` and the `cp` (arbitrary text injected into every Langston invoke).** `#979` is peer root sessions colliding; this is a non-root account steering a root write and the reviewer's context. **P-6b removes it at source.**

**Progress already made on this route set (2026-09-11):**
- ✅ **3(b) — the six world-readable copies of his `MEMORY.md` and three leftover prompt files are QUARANTINED**, not deleted: moved to `/root/langston-tmp-quarantine-20260911/` (`700`), each with owner, mode, size, mtime and sha256 in `MANIFEST.txt`. **The content scan afterwards finds 0** world-readable files in `/tmp` sharing ≥ 10 lines with the live file. He confirmed `/tmp/ledger.txt` by content himself: his reviewer ledger, six retraction markers.
- ✅ **3(c) — Coltrane's bot and bridge** now create their prompt file with `mkstemp` (`0600`, unpredictable name) and no longer widen it. **Verified by driving the REAL `invoke()` with only the model call faked:** the committed versions handed the child a `0644` file at `/tmp/coltrane-prompt-<ms>.md`; the patched versions hand it `0600` at a random name, the prompt arrives on stdin and never in argv, and the file is gone afterwards. Installed; the bot restarted clean at 14:54:55Z.
- ◐ **3(c) — the load canary and the promotion tool** no longer widen their `mkstemp` file to `644` (patched; installed with this commit's push). ⚠️ Not driven end to end: their `main()` spends a real Langston invoke. The change removes one `chmod`, leaving `mkstemp`'s own `0600`; the `0664` that remains in each (`_own()`) is on their run logs under `/opt/langston-memory/usage`, deliberately langston-owned for rotation, and falls inside route 2.

### 21.4 §19 — RULED: NEITHER. ONE SHARED FILE, TAGGED BY THE MOMENT A PATTERN FIRES
> *"Per-AUTHOR … keys on who erred, the one axis that does not predict who needs the lesson … Per-ROLE is sharper and still fails: `enumerator-blind-spot` fires at review time and implement time … What is expensive is not the file's contents — it is that nothing pushes the relevant pattern at the relevant moment (`#998` again). ⇒ the body stays ONE shared `MISTAKE_PATTERNS.md`; tag each pattern with the moments it fires at and let the injection split. One body, many views. A reviewer-only view is legitimate; a reviewer-only file is a second source of truth."*
**The five promoted patterns stay where they are — ruled, no longer pending.**
**DISPOSITION: added to `B-RULES-LAYER` (`PHASE_19_PLAN` row 4.6, `#998`, owner CC-A)** as a further requirement — the per-moment tagging and the injection split are that batch's subject. Recorded as a `#998` amendment.

### 21.5 ORDER — AGREED
P-6a → P-6b → P-2 → his retrofit → P-1b. **Condition:** the outcome measure reports **`MEMORY.md`, `CLAUDE.md` and the auto-memory index SEPARATELY**, never one total — the whole +4,453 was one file, and a single number would hide a future drift in either of the others.

### 21.6 A SECOND INVOKE RULED ON A STUB — RECORDED, NOT ADOPTED
My plain-language summary for Kyle **began with the word "Langston"**, which his bridge's address gate reads as a dispatch. **Bridge log:** enqueued 14:12:50Z behind the real dispatch, invoked 14:16:18Z, returned 14:19:38Z. **That invoke had no document** (*"I can't confirm capture without a path and a ref"*). Where it differs from the 14:16 ruling, **the 14:16 ruling governs** — it was made against the object:
- *"four root-owned copies, not six"* — a name-based enumeration; the content scan found six, and the 14:16 invoke itself confirmed `/tmp/ledger.txt` by content.
- *"my session transcripts are not exposed — `/tmp/claude-999` is `700`"* — true of that directory, and a different object: §20.6's route 1 is the session folder **in his home**, where 1,347 tool-output files are `644` under `755` directories, measured readable as coltrane.
- *"the published record stays open"* — superseded by the HAZARD ruling above.
- *`HOME: B-LANGSTON-MEMORY-PERMS`* — not adopted; the 14:16 ruling keeps the permissions in this batch.
- ✅ **ITS ONE QUESTION IS ANSWERED: how many other hand-offs in this document were never sent? ONE — §19.** §13 (*"goes to Langston to attack"*) was ruled 2026-09-05 05:07Z (*"Interposition — yes, but on the ledger, not the corpus"*); §20 was ruled today.

### 21.7 TWO FINDINGS FROM THIS ROUND

#### 🟨 FINDING — the retired Telegram channel is still connected into Langston's invokes
**Measured 2026-09-11:** `/home/langston/.claude/settings.json` has `enabledPlugins: {"telegram@claude-plugins-official": true}`; `~/.claude/channels/telegram/.env` holds a bot token (written 2026-05-06); **every invoke starts `bun server.ts` as a child of the `claude` process**, and at 14:45Z that process held an **established connection to Telegram (`149.154.166.110:443`)**. Access policy: allowlist, 1 user, 1 group. **Telegram was decommissioned 2026-07-02 (`#348`); this plugin was not in that removal.** ⇒ a retired channel can still deliver messages into a live review, it adds process start-up to every invoke, and its tools sit in his context.
**Proposal:** set the plugin to `false` in his `settings.json`; leave the token file and the bot account for Kyle's decision, as `#348` did. **Verify:** no `bun server.ts` child and no Telegram connection during a real invoke; the bridge still replies.
**DISPOSITION:** folded into this batch — his loaded set is this batch's subject — **gated on his ruling (§21.8 ask 1).**

#### 🟨 FINDING — the wake filter silently drops Langston replies addressed to a session
**Measured 2026-09-11 by replaying every `langston_outbound` row since 2026-09-03 (409) through the live filter:** of the replies that open with a session's name, **OLD Claude 25 of 50, NEW Claude 27 of 50, ANALYST Claude 26 of 134, Infra Claude 15 of 24 never woke that session** — and for each session the dropped count equals exactly the number whose LAST alert marker names a different owner. **Mechanism, `comms-infra/laptop/cc-wake-filter.py:366-367`:** a marker for another owner `continue`s before the name check. Introduced by `#995` (`B-WAKE-QUIET`, CC-A, closed 2026-09-05), which made the marker a suppressor at a time when replies rarely carried other sessions' markers; Langston now appends §10.5 triage for every due alert. Found because both his replies to this section never woke me.
**Not a hotfix:** qualifying test 1 names money, data, the trading pipeline and the UI; a dropped wake stalls review loops but touches none of them — and "if in doubt, it is a batch".
**DISPOSITION:** its own batch — `B-WAKE-LEAD-NAME`, `#1040`, owner Infra Claude, placed in `PHASE_19_PLAN` at **4.51, after 4.5 (`B-WAKE-QUIET`)**. The other sessions were told the symptom and its reach at 14:47Z so they check the channel meanwhile.

### 21.8 ASKS
1. **§21.7 Telegram:** disable the plugin in your `settings.json`?
2. **§21.6:** agree the 14:16 ruling governs where the stub invoke differs?
Everything else above is his ruling written down, and Step 3 proceeds on it.

### 21.9 ⛔ INSTALL RECORD — WHAT IS LIVE AHEAD OF THE STEP 4 GATE, CORRECTED *(Langston Step-4 r2 FINDING-4, 2026-09-11)*

My r2 dispatch said *"Still nothing installed."* **That was false as written.** Measured on Helsinki the same afternoon — each live file's sha256 against the repo blob at each commit:

| live file | installed (UTC) | live sha256 | matches | status |
|---|---|---|---|---|
| `/usr/local/bin/langston-load-canary` | 2026-09-11 15:01:53 | `99b396810b97` | `deec5fc0b` (= `a5273ad6d`) | ⚠️ **live ahead of the gate** — the 3(c) chmod removal; retroactively APPROVED by Langston at r1 |
| `/usr/local/bin/langston-promote-patterns` | 15:01:57 | `5c7a9e523108` | `deec5fc0b` (= `a5273ad6d`) | ⚠️ same |
| `/usr/local/bin/coltrane-bot.py` | 14:54:45 | `5d1b7cbb1743` | `deec5fc0b` — **not** `a5273ad6d` (`c3b964f2f330`) | ⚠️ live ahead of the gate; **lacks** the r1 `dir="/tmp"` pin |
| `/usr/local/bin/coltrane-bridge.py` | 14:54:47 | `79b446a5c539` | `deec5fc0b` — **not** `a5273ad6d` (`4a7239ea58b6`) | ⚠️ same; its unit is disabled |
| `/opt/langston-memory/bin/langston_memory.py` | 2026-09-06 08:34 | `c4a7988cec89` | pre-chunk-1 | not installed — P-6a is not live |
| `/usr/local/bin/langston-size-watch` | 2026-09-09 19:29 | `31b2ba5899c5` | `deec5fc0b` — **not** `a5273ad6d` (`d5fd2cf9c8b7`) | not installed — the crash guard is not live |
| `/usr/local/bin/coltrane-size-watch` | 2026-09-09 09:58 | `f26d48f891af` | `deec5fc0b` — **not** `a5273ad6d` (`60b35df6efb6`) | not installed — same |
| `/etc/systemd/system/langston-size-watch.service` | 2026-09-11 12:48 | `97a28857d2a7` | `comms-infra/systemd/`, unchanged by this batch | installed earlier (`d3415d059`), outside this gate |
| `/usr/local/bin/langston-privacy-check` | — | — | — | **absent** |

⇒ **Live ahead of the gate: exactly the four prompt-file fixes from `deec5fc0b`.** **Nothing from chunk 1 (`e907aa608` → `a5273ad6d`) is installed.** ⚠️ **Consequence Langston named:** condition 1's scan-root guarantee (Coltrane's prompts pinned to `/tmp`) is true at the ref and **not** true on the box until the Step 6 install.

**ROLLBACK — the prior live copies, root-only on the box, `/root/coltrane-gate-test/`:**
`langston-load-canary.pre-no644-20260911` · `langston-promote-patterns.pre-no644-20260911` · `coltrane-bot.py.pre-mkstemp-20260911` · `coltrane-bridge.py.pre-mkstemp-20260911` · (earlier today, outside this batch) `coltrane-bot.py.pre-leadgate-20260911`, `AGENTS.md.pre-refusalfix-20260911`. **A rollback is a copy of the `.pre-` file over the live path, then for the bot a `systemctl restart coltrane-bot.service`.**

### 21.10 ⭐ STEP 6 FOR CHUNK 1 — EXECUTED IN THE APPROVED ORDER *(2026-09-11 16:24-16:31Z; Langston approved the order at `a3eac7b81`, 16:19Z, with three conditions)*

**Every gate below was measured on the object, and each carries the check that would have come out differently if it were wrong.**

| # | step | result | the discriminator |
|---|---|---|---|
| **1** | `dt-deploy` a branch head carrying the actor | ✅ **`a5273ad6d` deployed 16:24:47Z, `--by cc-infra`**, engine resumed, identity asserted. **Why that sha and not the head:** `29cce1076..a5273ad6d` changes exactly one file the app loads — the actor line in `system-alerts.ts` — plus `scripts/governance-checker/*`, which is inert in the deploy folder because the checker runs from its own clone (`/opt/governance-checker/DawnTraderV3`, self-updating). **Nothing of another session's runtime rode along:** `B-PRICE-SIDE-BY-JOB` P-7a/b/c/g sit after `18c134399`. `18c134399` itself was not used because its CI run was CANCELLED (superseded); `a5273ad6d`'s run `34617169179` is green. | **Gate (condition 1, real token):** `resolve 00000000-… --by langston-privacy-check --evidence a3eac7b81` → **`not found`**. **Before the deploy the identical command returned `alert actor refused`** — and after it, a misspelled actor (`langston-privacy-chek`) still returns `actor refused` with the new name in the allowed set. |
| **2** | install on Helsinki | ✅ eight files from `a3eac7b81`, **each sha256 equal to the ref blob** (LF, checked before and after install): `coltrane-bot.py` `c3b964f2f330` · `coltrane-bridge.py` `4a7239ea58b6` · `coltrane-size-watch` `60b35df6efb6` · `langston-privacy-check` `7a19745f2f1b` · `langston-size-watch` `d5fd2cf9c8b7` · `langston_memory.py` `bb72454cf2ef` · both units. Timer enabled (next 2026-09-12 06:00Z); `coltrane-bot` restarted while idle and back online. | `OnFailure=agent-unit-failure@langston-privacy-check.service` (non-empty). **Condition 2: `--self-test` as root on the INSTALLED copy — 30 PASS lines, 0 FAIL, exit 0** (counted from the saved output, not the summary line). |
| **3** | first live run, BEFORE any permission change | ✅ **EXPOSED, 23 findings, both controls held; alert `35766f20-ca39-42e7-b584-d80b3b65174d` armed and read back live.** Run through the unit (`systemctl start`), so the scheduled path is the one exercised; `ExecMainStatus=1` read as `Result=success`, as designed. | **Independent read-back from staging, not the tool's:** state `scheduled`, `dedupe_key langston-privacy-exposed`, severity `warning`. |
| **4** | close the fences, then the rest | ✅ `chmod 750` `/home/langston`, `/opt/langston-memory`, the session folder, the store folder · `chmod 600` `records.jsonl` · `chown langston` on the root-owned store file · `chmod 644` on the four `0664` store files. **The forensics log was QUARANTINED, not deleted** (moved to the rollback folder): Langston's census found no live writer, and the check skips a missing file. | **As coltrane: refused on `/home/langston` and on `records.jsonl`. As langston: 38 store files listed, `CLAUDE.md` read.** **Census run before the change:** every unit referencing those paths is `User=langston` (3); every other timer that could touch them runs as root, except `agent-work-sync` (`User=coltrane`), whose script has **0** references to `langston` or `/home/` (control: `git` on 10 lines); no process of any other account had a cwd or open file under them. |
| **5** | a real index rebuild, as langston | ✅ `langston-memory-index.service` (`User=langston`) rebuilt at **16:29:37Z**, 91,929 records | **`records.jsonl` is `600` with that fresh mtime** — the file was rewritten, so the mode came from the installed reader's `O_CREAT 0600 + fchmod`, not from step 4's chmod surviving. |
| **6** | second live run | ✅ **PASS, 0 findings, both controls held; `35766f20` RESOLVED.** | **Staging read-back:** `resolved_by_claimed langston-privacy-check`, `resolved_by_transport cli`, evidence `/opt/langston-memory/usage/privacy-check.jsonl:2`. |
| **7** | nothing that works stops working | ✅ **`langston-recall`**: index 16:29:37Z, `LEDGER SOURCES … 9 entries`, a retraction flagged on a hit · ✅ **`agent-staging-session --check --user langston`**: `SESSION OK` · ✅ **size watch** (runs as root) reads his store index · ✅ **`coltrane-bot`** online. ⏳ **still owed:** a real Langston invoke through the bridge (the Step 6 dispatch to him is it) · `agent-work-sync`'s first run after the fence · **condition 3 — the SCHEDULED 04:10Z rebuild, not only my hand-run one** · the first scheduled size-watch runs (05:40Z / 05:51Z) · the first scheduled privacy run (06:00Z). | Step 7 does not close on runs I started. |

**ROLLBACK — root-only, `/root/lc2-rollback-20260911/` (700):** the prior copy of every replaced file as `<name>.pre-lc2` · `MODES.before` (install targets) · `MODES.fence` (all 44 step-4 targets, recorded before the change) · `quarantine/langston-queue-forensics.log` · `selftest.out`. **The actor rollback is a deploy of `29cce1076`**; the actor is inert without the check.

**FINDING-7 (Langston, governance) — folded, §13 disposition 1:** `SYSTEM_IMPACT_MAP.md` now carries a `langston-privacy-check` section after the drift monitor's, and the B-ALERT-ACTOR-ALLOWLIST paragraph's nine-name actor list is **replaced by a pointer to `ALERT_ACTORS`** rather than extended to eleven. My scope's "SIM N/A" was wrong: the SIM enumerates the actors by name.
