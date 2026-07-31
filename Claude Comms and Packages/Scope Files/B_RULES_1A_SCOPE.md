# B-RULES-1a — SCOPE: stale content, self-contradiction, and instruments that were never loading

change-class: architecture

**Owner:** CC-A · 2026-07-31 · **Plan:** `B_GOVERNANCE_REMEDIATION_PLAN_r1.md` @ `8f68b7ec3` (Langston: *Part 1 APPROVED TO SCOPE*) · **Home:** `RUNNING_ISSUES` #623 family
**Kyle's process, followed:** document everything → Langston approves → **scope the first fix.** Both gates met; this is that scope.
**Why this leads and not the trimming (Langston's reversal of my r1 order):** the size guidance is published, but **there is no published ordering effect for an always-loaded file**, whereas the docs give a **cited defect with a cited consequence** — *"if two rules contradict each other, Claude may pick one arbitrarily."* **We have such a contradiction. It leads.**

---

## 1. PREVIOUSLY-STATED-VS-NOW (§9.2)

- **PREVIOUSLY STATED: reordering `CLAUDE.md` is free and should go first. NOW: it goes LAST, if at all. REASON:** Langston — no published ordering effect for an always-loaded file; it is an in-place rewrite of 664 lines churning a file two other sessions pull, for an unevidenced benefit.
- **PREVIOUSLY STATED: rule 1 is "WRONG." NOW: rule 1 is STALE. REASON:** it forbids zips and staged-changes folders, which §7.1 still forbids. Only its *singular* phrasing of the working copy is out of date. **The inflation was mine and is exactly the rule-29-family error this batch exists to reduce.**
- **PREVIOUSLY STATED: the remainder of `CLAUDE.md` can split into `@path` imports. NOW: imports are STRUCK. REASON:** *"imported files load at launch"* — an import split changes zero bytes.
- **PREVIOUSLY STATED (in `CLAUDE.md` itself, line 165): this file auto-loads for Langston on every invocation. NOW: FALSE, measured. REASON:** §3 below.

## 2. PROVENANCE READ (§2 1.b) — TIER 1 on every item whose behaviour changes

- **Rule 1** — born with the post-Replit clone-repo migration; its intent was *"edit in the clone, no zips, no staged-changes folders."* **Disposition (2): relevant, needs updating to today's intent** — §7.1 (2026-07-23) made it one clone PER SESSION; the anti-zip clause is untouched and stays.
- **§4 canonical file locations** — intent: one authoritative list of where governance lives. **Disposition (2)** — `bridge/canonical/` was added to the workflow by §2 1.b / §9.5(b) but never back-referenced in §4.
- **`CLAUDE.md` line 165 / #564** — intent: justify moving depth to runbooks partly on Langston's per-invocation cost. **Disposition (2): the CLAIM is false and the CONCLUSION may still stand on CC-side grounds alone.** ⚠️ **Do not delete #564's conclusion as collateral; correct the premise and re-derive.**
- **`/home/langston/MEMORY.md` + §2 step 10.b** — intent: give the reviewer volatile state each batch. **Disposition (3): DISCONNECTED AND SHOULD BE RECONNECTED** — the file is maintained, synced by every session, and has never loaded.

## 3. THE FINDINGS THIS BATCH FIXES — measured, with objects and populations named

**F-A — `CLAUDE.md` CONTRADICTS ITSELF ON THE WORKING COPY.** Rule 1 (line 191) says *"Clone repo is the working copy"* (singular); §7.1 mandates **one clone per session** (`-old` / `-new` / `-analyst`). **Cited consequence: the model may pick one arbitrarily.**
**F-B — §4 OMITS `bridge/canonical/` FROM WHERE ARCHIVED HISTORY LIVES.** Measured by Langston at `3d554e971`: §4 spans lines **159–186**; `bridge/canonical/` appears only at **59 / 596 / 603**. ⇒ **the corpus §2 1.b sends every batch to consult is absent from the section that lists where history lives.**
**F-C — LINE 165'S LANGSTON AUTO-LOAD CLAIM IS FALSE.** Langston measured his own context: exactly two instruction sources — `/home/langston/CLAUDE.md` and a 15-line auto-memory index. cwd is `/home/langston`; loading walks **up** from cwd; the repo is not in that ancestry and he holds no working copy. **POSITIVE CONTROL: the loader demonstrably works — his own file DID load.**
**★ F-D — `/home/langston/MEMORY.md` HAS NEVER LOADED.** 83 lines / 23,970 B. No `@import` in his `CLAUDE.md`; not a `CLAUDE.md`/`CLAUDE.local.md` filename; not in settings. **His own §10 startup checklist says *"Read `MEMORY.md` next to this file (auto-loads)"* — false.** ⇒ **every session has synced a file the reviewer never reads, and he has reviewed every batch without it.** **This is the highest-value item here: it improves every subsequent review the moment it lands.**

## 4. OBJECTIVES

**OBJ-1 — `InstructionsLoaded` OBSERVABILITY FIRST (Langston: *"you do not restructure what loads until you can OBSERVE what loads"*).** Stand up the instrument that logs which instruction files load, when, and why, on both the CC side and Langston's. **Verification: a run naming the loaded set on each side, and on Langston's side it must show his `MEMORY.md` ABSENT before the fix and PRESENT after.** ⇒ **F-D's fix is verified by this instrument, not by assertion.**

**OBJ-2 — FIX F-D: make Langston's `MEMORY.md` actually load.** ⚠️ **`@import` is the CORRECT tool here** — its documented property is *"imported files load at launch,"* which is a defect for shrinking and exactly the behaviour wanted for a file that must load. **And correct his §10 startup checklist, which currently asserts a falsehood.**
**Verification: OBJ-1's instrument shows it in his loaded set, plus a live invocation in which he cites a fact that exists ONLY in `MEMORY.md`.** *(A control: if he can cite it without the fix, the premise was wrong.)*

**OBJ-3 — FIX F-A, F-B, F-C in `CLAUDE.md`.** Rule 1 re-phrased to per-session clones **keeping its anti-zip clause verbatim**; §4 gains `bridge/canonical/` with one line on what it is and the §9.5(b) never-edit caveat; line 165's premise corrected **without deleting #564's conclusion**, which is re-derived on CC-side grounds or explicitly marked unsupported.
**Verification: `grep` proves each corrected string at the graded ref; and a re-read confirms no NEW contradiction was introduced.**

**OBJ-4 — MEASURE THE VERSION GATES BEFORE ANYTHING DEPENDS ON THEM.** Langston is on **2.1.159**; `/doctor`'s trim check needs **2.1.206+**; rules-loading behaviour changed at **2.1.198 / 2.1.207 / 2.1.211 / 2.1.217**. **Measure the CC-side and Langston-side versions and state which mechanisms are available at each.** **No later leg may assume a version-dependent mechanism until this lands.**

**OBJ-5 — RECORD THE BASELINE THE WHOLE PROGRAMME IS MEASURED AGAINST.** **BYTES ACTUALLY LOADED AT SESSION START**, per side, read off `/context` → Memory files. ⚠️ **NOT a line count — the docs make ≤200 lines gameable by imports and by an unscoped always-loaded `.claude/rules/` file.** **Without this, no later leg can prove it moved anything.**

## 5. EXPLICITLY OUT OF SCOPE

**Any trimming, reordering, skill extraction, or `.claude/rules/` conversion.** Those are 1b/1c/1d. **This batch changes only statements that are FALSE or SELF-CONTRADICTORY, plus the instruments needed to measure the rest.** ⚠️ **Nothing is deleted — §339-compliant by construction.**
**Also out:** rule 21's removal (1b, and gated on showing the task fired in the last 7 days); rule 28's enforceability question (needs the bridge-send analysis).

## 6. RISK

**The batch edits the file every session auto-loads, and Langston's own instruction file.** Mitigations: no deletions; each edit is a correction of a demonstrably false or self-contradicting statement with its measurement cited; **backups before touching Langston's files** (precedent: `/root/backups/langston-CLAUDE.md.pre-*`); and **OBJ-1 lands before OBJ-2/3 so changes are observed rather than asserted.**
⚠️ **AND A RISK I AM CREATING BY MY OWN RECENT CONDUCT: I appended to Langston's `CLAUDE.md` twice on 2026-07-30 without reading all 497 lines for conflicts.** **This batch reads his file in full before touching it**, and per his own proposal every `CLAUDE.md` diff is a Step-4 gate through him.
