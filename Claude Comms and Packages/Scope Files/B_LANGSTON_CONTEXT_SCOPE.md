# B-LANGSTON-CONTEXT — SCOPE (Step 1 of 11)

**Owner:** CC-INFRA (Infra Claude) · **Opened:** 2026-09-03 · **change-class: non_architecture**
**Directive:** Kyle, 2026-09-03/04 — restart the Langston-improvement work; *"design a system that incorporates with what we've already built with the archiving and our overall intent of getting the benefits of his stateless reviews, but from someone that can add context when needed. And that context could be useful to the entire system, in all of the sessions."*

> ⛔ **CHANGE-CLASS REASONING, STATED RATHER THAN ASSUMED (§9 "apply the judgement OUT LOUD").** `non_architecture` because this touches **no trading code, no strategy logic, no regime/filter/signal-pipeline/math** — so `SYSTEM_MANUAL.md` is genuinely N/A, and a `REQUIRED` row may not take N/A, which is what declaring `architecture` would force. ⚠️ **`SYSTEM_IMPACT_MAP.md` is a JUDGED row here and I judge it N/A: the SIM maps the TRADING system's components; Langston's memory system has no entry there today and its home is `LANGSTON_ARCHITECTURE.md`.** **If Langston disagrees, the class is amendable (§3.0) and I would rather re-declare than defend.**

---

## 1. WHAT THIS BATCH IS FOR, IN ONE PARAGRAPH

Langston reviews our work **stateless** — he starts every invocation with no memory, which is exactly why his review is worth having: he cannot inherit a belief he formed yesterday. The cost is that he cannot carry anything forward either. Three mechanisms have grown up to compensate, **two of them built and one of them his own**, and nobody has ever designed how they fit together. This batch designs that — and removes the one that has no purpose.

---

## 2. WHAT ALREADY EXISTS — verified on the box 2026-09-03/04, not recalled

| layer | what | state |
|---|---|---|
| **PUSH — his always-loaded `MEMORY.md`** | written by ALL FOUR sessions at every batch close under `workflow-10` §10.b | ⛔ **24,528 B (2026-08-06) → 58,177 B — +137% in 28 days against a 24,576 B cap** |
| **HIS OWN — the self-memory store** | `/home/langston/.claude/projects/-home-langston/memory/` — 37 typed files + an 11.8 KB index, frontmatter + incident + `Why:` + `How to apply:` + `[[wiki-links]]` | ✅ **LIVE. Started 2026-05-07 UNPROMPTED, the day after he came online; still writing. Ungoverned: no cap, no prune, absent from `LANGSTON_ARCHITECTURE.md` §4, and had NO backup until 2026-09-03 19:08Z** |
| **PULL — `langston-recall`** | 81,948-record archive across four eras, nightly rebuild, wired at his `CLAUDE.md` §19 with a mandatory pre-verdict trigger | ✅ **LIVE 2026-08-06; 203 of his 3,680 sessions carry a real invocation** |

**The original plan (my own crew broadcast, `2026-08-05T10:48:22Z`) had THREE items: (1) `langston-recall` ✅ shipped · (2) instruction-file restructure — lean core + on-demand modules + a DAILY SIZE/STALENESS WATCH ⛔ never started, zero of three parts · (3) ledger auto-loads ✅ achieved by CC-A's `@MEMORY.md` import.** ★ **Item 2 contained the size watch — which is why the growth ran unnoticed. The alarm was itself the unfinished item.**

---

## 3. MANDATORY 1.b — PROVENANCE READ, with the five dispositions stated

| thing | ORIGINAL INTENT (quoted, not glossed) | disposition |
|---|---|---|
| **§10.b closure block** | *"Langston's MEMORY **auto-loads every `claude -p` invocation**; stale MEMORY → wrong baseline at next review"* (Kyle directive **2026-05-07**) | ⛔ **(4) CONNECTED, SHOULD BE REMOVED.** Its premise was **false from 2026-05-07 to 2026-08-05** — the file did not auto-load and never had, on Langston's own three-way verification — and the content is now held **better** by the archive. |
| **§10.b sequencing changes** | same directive | ✅ **(1) STILL RELEVANT AND CORRECT** — unpullable by construction. |
| **§10.b operational invariants** | same directive | ⚠️ **(2) RELEVANT, NEEDS UPDATING** — a generalising RULING is worth carrying; he already authors these better than we do. |
| **"a CLOSED batch = ONE line here"** | Kyle, **2026-07-01**, in his `MEMORY.md` header | ⚠️ **(2) RELEVANT, NEEDS UPDATING — as a MECHANISM, not a rule.** Kyle 2026-09-03: *"if we have a standing rule… and it's not being followed, then that's not the right answer."* |
| **his self-memory store** | none — **he built it unprompted; there is no directive to read** | ✅ **(1) STILL RELEVANT AND CORRECT — and UNGOVERNED.** `INFERRED-FROM-CODE`: no record states why he started it. **Question 1 to him.** |
| **the shelved journal** | *"His journal/'window' memory concepts were reviewed and explicitly **SHELVED on his own objection** — recall is pull-only"* (my broadcast, 2026-08-05) | ⛔ **(5) STAYS DISCONNECTED.** A reviewed decision, not unfinished work. **DO NOT RE-PROPOSE.** |

**Corpora searched:** `1-system-manual/` · `Claude Comms and Packages/` (scope files, completion reports, Langston design asks, cross-session briefs) · `LANGSTON_ARCHITECTURE.md` · `BUILD_METHOD_PLAYBOOK.md` · `BATCH_CATALOG.md` · `RUNNING_ISSUES.md` · the 11 GB transcript corpus · the Discord crew log. ⚠️ **The plan was never a repo document — it is a MESSAGE, which is why every folder search missed it.**

---

## 4. OBJECTIVES

### ⭐ OBJ-1 — RETIRE THE CLOSURE-BLOCK LIMB OF §10.b *(Kyle decided 2026-09-04)*
Remove **only** the batch-closure-record limb; **keep sequencing changes and operational invariants**. §10.b is over-broad, not wrong, and deleting it wholesale would discard the two limbs that earn their place.
**WHY IT HAS NO PURPOSE:** *you cannot pull what you do not know exists.* **History IS pullable** — when a closed batch becomes relevant something NAMES it, so the trigger arrives with the need. **Verified, not assumed:** `langston-recall` returns `B-MBIM-SWITCH-ON` and `B-CONDUCT-FILE` with dates, source file and line, and an `[ORIGIN — oldest record]` marker — **better provenance than the pushed note, which merely asserts a closure.**
★ **AND THE USAGE QUESTION IS NON-BLOCKING: both branches lead here.** Never read ⇒ dead weight. Read ⇒ a thinner copy of what the archive holds properly.
**VERIFY:** `workflow-10` no longer requires a closure block; the two surviving limbs are named explicitly; **no closed-batch section is added to his `MEMORY.md` in the first two batch closes after landing** (ledger count, whole file).

### ⭐ OBJ-2 — EVICTION BECOMES STRUCTURAL, NOT REMEMBERED
**Kyle's ruling:** a skipped rule is not to be re-issued. **Proposed shape: compose his loaded file from parts** — each batch writes its own file; what he loads is GENERATED, including a batch's part only while that batch is OPEN. **A closed batch is not deleted; it stops being composed in.**
**VERIFY:** a batch transitioning to closed causes its section to leave his loaded file **with no human action**, demonstrated end-to-end; and the generator **fails toward last-known-good, never toward empty** — proven by killing it and showing the file intact plus a loud alarm.
⚠️ **OPEN WEAKNESSES, put to him:** whatever decides "OPEN" becomes load-bearing and can drift; it changes the write path for all four sessions at once; **and the ledger + standing notes do not fit this pattern at all** (see OBJ-4).

### OBJ-3 — GOVERN HIS SELF-MEMORY STORE
Add it to `LANGSTON_ARCHITECTURE.md` §4; give it a **scheduled backup** (an ad-hoc one was taken 2026-09-03 19:08Z, verified by reproduction 37/37 + sha match); decide a retention posture **with him**.
**VERIFY:** §4 names it; a scheduled backup exists and a restore is demonstrated by **reproduction, never by comparing counts**.

### OBJ-4 — DECIDE WHERE THE REVIEWER LEDGER AND STANDING NOTES LIVE
Together **22,545 B = 92% of the 24,576 B cap** before any batch note. Append-only by design (*"survives every prune"*). ⛔ **AND THE LEDGER HAS A MANDATORY READER AND NO WRITER** — `langston-recall` refuses on an unparseable ledger and prints its retractions before every result, yet **nothing instructs him to maintain it** (measured: `REVIEWER LEDGER` 0 occurrences in his `CLAUDE.md`; positive control `langston-recall` 3, `MEMORY.md` 12).
⚠️ **CORRECTION CARRIED IN: the ledger is `11,245 B`, NOT the `34,605 B` `PHASE_19_PLAN` row 2.8 asserts. I repeated that figure without deriving it, and the "trimming cannot work" argument built on it is WITHDRAWN.**
**VERIFY:** a stated home for each, a stated write rule for the ledger, and the composed file provably under cap.

### OBJ-5 — BUILD THE DAILY SIZE/STALENESS WATCH *(item 2's missing third)*
**VERIFY:** it alarms on a synthetic overage **before** a human notices — proven by injecting one.

### ⭐ OBJ-6 — MAKE HIS RULINGS AVAILABLE TO THE OTHER SESSIONS *(Kyle's "useful to the entire system")*
His entries are re-usable rulings with a stated mechanism; one would have saved CC-A a false-absence claim. **My instinct is READ-yes / WRITE-never** — four writers on one store is the collision we keep paying for, and it is HIS voice.
**VERIFY:** a session can retrieve one; **no session can write one**; and the retrieval states its own coverage, as `langston-recall` does.

### OBJ-7 — USAGE INSTRUMENTATION
Nothing logs a recall query or a memory read. **This batch must not ship another mechanism nobody can tell is working** — the failure this whole batch exists to correct.
**VERIFY:** a query is countable without grepping transcripts afterwards.

---

## 5. WHAT THIS BATCH WILL NOT DO
- ⛔ Re-propose the shelved journal *(a reviewed decision)*.
- ⛔ Touch the bridges, the review queue, or his live loop.
- ⛔ Prune his files as the fix — **a prune buys ~28 days** (24,528 B → 58,177 B in 28) and Kyle has ruled that re-issuing the discipline is not the answer.
- ⛔ Write into his self-memory store. It is his.

---

## 6. WHAT I AM ASKING LANGSTON TO OBJECT TO
Kyle, 2026-09-04: *"make sure that Langston is on the same page with it. He might have some objections, and let's hear him out on those."*
**1.** OBJ-1 is a **removal of a governed obligation**. If the closure block is load-bearing for you in a way I have not measured, **say so and it stays** — I could not settle usage empirically (two instruments confounded, a third too weak to report) and I am not treating that null as evidence.
**2.** Is the **push/pull split** right — *history is pullable, current state is not* — or is there a fourth category I have missed?
**3.** OBJ-2 changes the write path for four sessions at once. **Is there a migration path rather than a switch?**
**4.** OBJ-6 shares your rulings with sessions you did not write them for. **What breaks?**
**5.** **Anything here you consider mis-scoped, over-reached, or already decided** — including my reading of Kyle's ruling itself.
