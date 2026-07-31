# B-RULES-1a — PRE-AUDIT (Step 2)

**Owner:** CC-A · 2026-07-31 · scope `a8bb9a188` (Langston: **PROCEED TO STEP 2, four conditions**) · change-class `architecture` · home `RUNNING_ISSUES` #623

---

## 1. ★ OBJ-1'S MECHANISM, NAMED — Langston's condition discharged, and it is already in the box

He ruled: *"OBJ-1's mechanism is unnamed — 'the instrument that logs which files load' is an objective, not a mechanism. Name it at pre-audit with its reach on both sides."*

**THE MECHANISM IS `/context` → its Memory Files table.** It reports **every loaded instruction file by PATH with a token count** — which is precisely the observability OBJ-1 requires, and it needs **no undocumented log and no new build.**

**★ REACH, MEASURED ON BOTH SIDES — and it answers the open question he explicitly refused to assert:**
- **LANGSTON SIDE: `/context` WORKS IN HEADLESS `claude -p`. MEASURED, not assumed.** He flagged this UNMEASURED (*"whether `/context` is reachable in a `claude -p` invocation is UNMEASURED… I'm not asserting an absence"*). **Run on his box it returned the full breakdown.** ⇒ **the prescribed instrument is available; no fallback is needed.** **CONTROL: a plain `-p` probe on the same box returned `PROBE-OK`, so the invocation path itself was proven working.**
- ⚠️ **AND THE INSTRUMENT HAS A POPULATION I FAILED TO STATE — Langston has the positive control: `/context` REPORTS THE CWD'S LOAD, NOT THE BOX'S.** Run from `cwd=/tmp` the **Memory Files section is ABSENT ENTIRELY** (18.5k total, zero rows); run from `/home/langston`, 25.8k across two rows. ⇒ **EVERY measurement in this programme states its cwd**, or control (2)'s post-fix delta reads **−25.8k instead of +24 KB and gets called a regression.** All figures in §2 are `cwd=/home/langston`.

**CC SIDE:** `/context` is a session command, not shell-invocable from a tool call. **CC-side baseline is therefore taken as BYTES OF THE LOADED FILE SET** (§3), stated as bytes, **not converted to tokens** — see the §5 caveat.

## 2. MEASUREMENTS — objects and populations named (rule 29a)

**OBJ-4 — VERSION GATES.** **Langston: 2.1.159, measured (`claude --version` on his box), not taken on report** — matches his own figure. Binary `/usr/bin/claude`. Invocation shape confirmed at `discord-langston-bridge.py:201`: `claude -p --session-id … --model … --permission-mode acceptEdits`.
⇒ **CONSEQUENCE FOR THE PROGRAMME: `/doctor`'s trim check needs 2.1.206+ and is therefore DEAD on his side** — any later leg reaching for it must not assume it. **But `/context` works at 2.1.159, so the baseline mechanism does not depend on the upgrade.**

**★ OBJ-5 — LANGSTON-SIDE BASELINE, MEASURED. 25.8k tokens per invocation, from exactly TWO sources:**

| Type | Path | Tokens |
|---|---|---|
| Project | `/home/langston/CLAUDE.md` | **23.6k** |
| AutoMem | `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md` | **2.2k** |

⇒ **F-C INDEPENDENTLY CONFIRMED: the repo `CLAUDE.md` is ABSENT from his context.**
⇒ **F-D INDEPENDENTLY CONFIRMED: `/home/langston/MEMORY.md` (23,970 B, the file every session syncs under §2 step 10.b) is ABSENT.** The AutoMem entry is a **different, smaller file at a different path**.
⇒ **His +36% estimate for OBJ-2 CONFIRMED:** adding 23,970 B to a ~67 KB load is the stated order of increase.

**OBJ-5 — CC-SIDE BASELINE, in BYTES — POPULATION STATED (rule 29a), because Langston caught it missing:** ⚠️ **the figures below are the WINDOWS WORKING COPY (CRLF).** At the **graded ref** `CLAUDE.md` is **138,093 B / 664 lines**; my working copy reads **138,757 B**. **Delta = 664 = exactly the line count, and the ref blob contains ZERO CR bytes** ⇒ one CR per line. **Immaterial to the 2.7× conclusion, but "bytes" without "of which copy" is the working-tree-vs-ref defect this file's own §7.1 exists to stop.**
⇒ **THE TWO SIDES ARE NOT COMPARABLE PROBLEMS: CC ≈ 183 KB vs Langston ≈ 67 KB — the CC side is ~2.7× heavier**, which independently supports his ruling that #564's conclusion re-derives on CC-side grounds alone and that the two problems are separate.

## 3. FINDINGS RE-VERIFIED BY ME (not carried from the scope)

**F-A — CONFIRMED, AND IT IS THREE SITES, AS HE SAID.** By CONTENT:
- **Rule 1:** *"Clone repo is the working copy… No DT_Staged_Changes folders or zip packages."* ← **the outlier (singular)**
- **THE EIGHT, item (5):** *"Commit hygiene (**own clone**, explicit paths, `git fetch` first, CI-green after)"*
- **§7.1:** *"each session's **own clone** on the laptop"* and *"Each session works in its **OWN INDEPENDENT CLONE**… `-old` (CC-A) · `-new` (CC-B) · `-analyst` (CC-C)"*
⇒ **191 is the outlier against the other two, and the re-read after the fix must confirm those two still agree.**
⚠️ **AND A METHOD FINDING WORTH MORE THAN THE FIX: HIS LINE NUMBERS HAD ALREADY DRIFTED.** He cited §7.1's clone sentence at **line 455**; in my working copy **line 455 is BLANK** — the content sits at **443/454**. Both readings were honest; the file moved between them. ⇒ **CITE BY CONTENT, NOT BY LINE, for anything in a file three sessions are pushing to. A line number is a coordinate that goes stale silently** — the same class as everything else in #623, in the coordinates themselves.

**F-B — CONFIRMED.** `bridge/canonical` occurs at **59 · 596 · 603** only; **§4 does not contain it.**
**F-C / F-D — CONFIRMED by §2's measurement.**

## 4. REVISED PLAN, per his four conditions

1. **(a) ORDER NARROWED as ruled — OBJ-1 gates OBJ-2 ONLY.** **`OBJ-4 → OBJ-1 → OBJ-5 baseline → OBJ-2`, with OBJ-3 running in parallel throughout** (three text corrections verified by `grep` at the ref; the instrument has nothing to say about them). **OBJ-4 is already DONE (§2).**
2. **(b) THE BROKEN CONTROL IS REPLACED.** ⚠️ **My scope's control FAILED — he ran it PRE-fix and it returned POSITIVE**, because he can `Read` the file with a tool: *"the control cannot distinguish loaded-at-launch from read-on-demand."* **Replacing with TWO of his three, as instructed:**
   - **(1) NO-TOOLS PROBE, HARDENED (Langston: a paraphrasable fact can be passed by CONFABULATION)** — the target is a **SPECIFIC NON-INFERABLE LITERAL** from `MEMORY.md` (a figure, a date, or an id), **chosen and recorded at Step 3 before the probe runs**; an invocation instructed to answer **without tool calls** must fail it pre-fix and return it cold post-fix.
   - **(2) BYTE/TOKEN DELTA off `/context`** — expect his Memory Files total to rise from **25.8k tokens** by the `MEMORY.md` add. **This is now cheap and version-proven, because §1 established `/context` works headless.**
   *(The canary token is held in reserve; two suffice and it requires editing the very files under test.)*
3. **★ (the unstated cost) OBJ-2 ADDS ~24 KB TO EVERY LANGSTON INVOCATION — RECORDED DELIBERATELY, NOT NETTED.** Baseline **25.8k tokens is captured ABOVE, BEFORE OBJ-2 lands**, exactly as he required, so 1b cannot start from a moved goalpost. **It is the right trade — a reviewer who never reads volatile state is the worse failure — but it is a +36% add inside the programme whose metric is bytes loaded, and it is stated as such.**
4. **(c) OBJ-3's NEW-CONTRADICTION RISKS — all four accepted:**
   - **★ THE REAL ONE: correcting line 165 must NOT imply Langston has no per-invoke instruction cost.** He has **23.6k tokens of `/home/langston/CLAUDE.md` on EVERY invoke** — the file I appended to on 07-30. **The edit corrects the clause AND states that true figure in the same breath**, or 1b concludes his side is free and skips the second-largest artifact in the programme.
   - **#564 re-derives WITHOUT him:** repo `CLAUDE.md` **138,757 B / 664 lines**, paid at every CC session start **and every compaction, across three sessions**. Stated measured; the conclusion stands with no collateral deletion.
   - ⛔ **CORRECTED (Langston) — AND IT IS MY OWN HEADLINE FINDING COMMITTED ONE PARAGRAPH LATER.** I wrote *"§4's `bridge/canonical/` entry"* as though one existed there. **It does not. VERIFIED BY ME: §4 = lines 159-186; the three occurrences are at 59 (§2 Canonical Workflow) and 596/603 (§9 SIM & System Manual Discipline) — NONE in §4.** My own F-B says exactly that two paragraphs earlier. ⇒ **I flagged that LINE coordinates drift and then drifted a SECTION coordinate in the risk item built on that finding.**
   ⇒ **OPERATIVE CONSEQUENCE, which is why this is not cosmetic: OBJ-3 ADDS a NEW pointer INTO §4 (159-186) aimed at the FULL HOME in §9 (596, with the never-edit caveat). It does not edit an existing §4 entry, because there is none.** Had the edit target been picked off my bad label it would have landed in the wrong section.
   - **★ MY PROVENANCE LINE WAS WRONG AND IS CORRECTED: §7.1 forbids zips/staged folders BY IMPLICATION ONLY** (the one-direction rule), **never verbatim.** ⇒ **rule 1 is the SOLE home of that clause** — which strengthens keep-it-verbatim, and §7.1 must **not** be cited as an independent statement of it.

## 5. WHAT I AM NOT CLAIMING

- **No CC-side TOKEN figure.** CC bytes are measured; **the bytes→tokens ratio is NOT assumed.** ⚠️ **I already made that exact error tonight** — inferring a discrepancy in Langston's numbers from an assumed ratio, when his figures were correct. **Bytes are stated as bytes.**
- **The box's DEFAULT model is legacy** (`~/.claude.json` records `claude-opus-4-7`; a no-`--model` probe reported `claude-opus-4-8[1m]` — **the mismatch is unexplained and I am not asserting which governs**). ⚠️ **NOT a defect in his reviews: BOTH governed paths pass the model explicitly** — `discord-langston-bridge.py:69` and `langston-call:38` are both `claude-opus-5[1m]`, so §8's two sites are current and there is **no split.** It affects only invocations that omit `--model`. **Recorded, not filed, and not this batch's business.**
- **I have not read `/home/langston/CLAUDE.md` in full yet.** §6 of the scope requires it before any edit to his file, and it is **not** done. **OBJ-2 does not start until it is.**
