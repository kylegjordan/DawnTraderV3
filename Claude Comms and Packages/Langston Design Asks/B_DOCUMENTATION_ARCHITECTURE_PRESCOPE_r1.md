# PRE-SCOPE — documentation architecture: decision archive · skills system · catalogues · conformance review

**STATUS: PRE-SCOPE. Kyle's words: *"I wouldn't even say that this is the scope work. This is pre-scope, brainstorming and design discussions."*** Nothing here is agreed, sequenced, or costed. **Do not review it as a scope; review it as a proposal to be cut down.**
**Author:** CC-A · 2026-07-31 · companion to `B_CATALOG_WHAT_WE_DO_NOT_DOCUMENT_r1.md` (`7028c6fd4`)

---

## 0. ★ THE GATE KYLE SET, AND IT GOVERNS EVERY ITEM BELOW

> *"I don't wanna be doing any of this just for the sake of doing it or just because someone says that we should. If it is useful and helpful, then yes."*

**⇒ THE TEST I HAVE APPLIED TO EACH ITEM: name a CONCRETE failure that already happened which this artifact would have PREVENTED. Where I cannot name one, I say so and mark it UNJUSTIFIED — those should be cut, not softened.** "Industry standard" is **not** a justification on its own, and I have tried not to smuggle it in as one. **Langston: please cut anything whose named failure is weak. I would rather ship two artifacts that earn their keep than six that decay.**

## 1. THE RECONSTRUCTION HORIZON — measured, and it INVERTS our assumption

**OBJECT/POPULATION stated per row. CONTROL: counts re-derived at the live sources, not recalled.**

| Source | Size | Range |
|---|---|---|
| **Git history** | **8,541 commits** | **from 2025-10-02** |
| Batch completion reports | **272 files** | |
| Scope files | **586 files** | |
| `BATCH_CATALOG` rows | **387** | |
| Langston `inbox/` | 188 batch dirs, **851 files**, 24 MB | to ~B79/B80 |
| Langston's rulings (Discord) | **3,028** | **2026-06-19 → now (6 wks)** |
| Telegram frozen log | **658 lines**, 1 MB | 2026-05-06 → 06-21 |

★★ **THE FINDING: WE BOTH ASSUMED LANGSTON'S SERVER WAS THE DEEP ARCHIVE. IT IS NOT — IT IS A RICH SIX-WEEK OVERLAY.** The **conversational** record is thin and reaches early May at best (Telegram is only 658 lines). **The DEEP archive is the REPO: 8,541 commits back to October 2025, plus 272 completion reports and 586 scopes** — already versioned, already at the ref everyone reads from, already surviving the loss of any one box.
⇒ **The decision archive is mostly a HARVEST FROM GIT, not from chat logs.** Our commit messages are unusually discursive (several paragraphs of reasoning each) — **that is an ADR corpus in disguise.**
⚠️ **AND A RISK THIS SURFACED: the 3,028 rulings live in ONE 19 MB file on ONE box, outside git.** Whatever else is decided, **that corpus is currently one disk failure from gone.**

## 2. THE FOUR WORKSTREAMS, EACH AGAINST THE GATE

### (A) DECISION ARCHIVE — **JUSTIFIED, strongly**
**Failure it prevents:** `CLAUDE.md` §2 1.b forces **every batch** to do git archaeology to recover original intent — *"read the introducing commit, quote it verbatim, search FORMER filenames."* **That rule is expensive precisely because no decision record exists. We are paying archaeologists because nobody kept minutes.** Concrete cases: the retention sweep's intent (recoverable only by reading a May commit body); #174 missed for seven weeks; the RTB dual-refresh missed by **two** audits.
**Also prevents:** the supersession blindness we hit **this week** — #339 ruled NO-TRIM; the evidence now contradicts it; **nothing links the two, and only Kyle's memory caught it.**
**Shape:** harvest from git + reports; index by component and by decision; record status (active/superseded-by). **Not** hand-written from scratch.

### (B) SKILLS SYSTEM (progressive disclosure) — **JUSTIFIED, and it is the correctness fix, not housekeeping**
**Failure it prevents:** ten of eleven CC-A errors in one session, where **the governing rules existed and were auto-loaded and did not fire.** The diagnosis is **timing**: a rule in a 664-line / 136 KB always-loaded file is read at session start; the mistake happens at MEASURE time. **A skill invoked when you begin a scope / a search / a measurement fires AT THE MOMENT OF USE.**
**External support:** context-file bloat measurably **reduces** task success; *"more rules do not produce better performance"*; **"lost in the middle"** — and our own rule 29 sits at **line 274 of 664**, mid-file.
**Candidate skills:** `scope` (the §2 1.b five dispositions + evidence standard) · `pre-audit` (the §9.5(a) census incl. *who DELETES* + the state-write census) · `measure` (rule 29 object/population/positive-control) · `batch-close` (Tier-1/Tier-2 doc set + CI + sync gate).
**⇒ WHAT STAYS IN THE RULES FILE (my proposal, argue with it):** only what must be true **before** you know what task you are doing — the mission, the risk boundary, plain-language, the lanes (27/28), and the pointer index to the skills. **Everything procedural leaves.** ⚠️ **This is a direct challenge to #339 NO-TRIM; §3 of the companion doc asks you to rule on it.**

### (C) DATABASE CATALOGUE — **JUSTIFIED, with a structural caveat**
**Failure it prevents:** *"there is no trade archive"* — false; `exit_decision_archive` existed, and a name-pattern search could not see it. **206 logical tables, 49 named in no governance doc.**
⚠️ **CAVEAT: hand-maintained, it rots and a rotted catalogue is WORSE than none because it is believed.** ⇒ structural half **generated and diffed**; semantic half (purpose, owner, subsystem, retention) hand-written once and reviewed on change.

### (D) CONFORMANCE REVIEW OF EXISTING DOCS — **PARTIALLY JUSTIFIED, and I want you to cut this one hardest**
Kyle asks whether SIM / System Manual / the active-path flow file *"are written, organized, structured the way they should be according to industry standards"* and whether to reshape them or keep ours.
**My honest read: mapped against arc42, we are MORE complete than I expected** — System Manual ≈ building blocks + cross-cutting concepts; SIM ≈ structure/dependencies; the flow file ≈ runtime view; `STORAGE_POLICY` ≈ a cross-cutting concept; `RUNNING_ISSUES` ≈ risks/technical debt; runbooks ≈ operations. **The genuine holes are DECISIONS (A), a GLOSSARY, and QUALITY TARGETS.**
⇒ **RECOMMENDATION: do NOT convert our docs to arc42/C4 shape.** I cannot name a single failure caused by our documents having the wrong *template*, and arc42's own principle is to document only what stakeholders require. **Adopt the two missing ARTIFACTS; leave the existing structure alone.** **Reshaping working documents to match a template is the definition of doing it because someone says we should.**

### (E) GLOSSARY / TERM DICTIONARY — **JUSTIFIED, and cheaper than it sounds**
**Failure it prevents:** the lookalike family that caused every error this week — working table vs archive · shadow vs real · JSON snapshot vs typed columns · `vts_trades`-the-file vs the table that does not exist · `active-*` vs its pre-RENAME names. **Plus the canonical-terminology drift Kyle has corrected repeatedly (SQE → "quality evaluator", xStock → "stocks").**
⇒ **It is one artifact serving two needs, and its highest-value section is a LOOKALIKE REGISTER: pairs that have already produced a wrong call, with the distinguishing test.**

### (F) QUALITY TARGETS — **UNJUSTIFIED ON PRESENT EVIDENCE, and I am flagging it rather than including it**
arc42 wants documented quality/latency/availability targets. **I cannot name a failure this would have prevented.** Listed only so the omission is deliberate. **Cut unless you can name one.**

## 3. THE BUILD APPROACH — and a constraint Kyle should have in writing

Kyle floated **a dedicated fourth CC session** whose only job is this. **My recommendation was parallel workers inside an existing session instead, and he accepted — but the reasoning should be on the record for you to attack:**
- ⚠️ **A CC session CANNOT run unattended to completion.** It lives in an open window and dies when that window closes — the same platform gap behind the wake watcher. *"Works in the background until done"* is not actually available.
- A fourth identity adds exactly the coordination load rules 27/28 exist to contain, **and it would be writing governance docs all three other sessions depend on** ⇒ shared-file contention lands on it.
- **The mechanical half parallelises well** (index 272 reports + 8,541 commits + 3,028 rulings). **The JUDGEMENT half — what counts as a decision, and what superseded what — does not, and is precisely where sessions have been erring.**
⇒ **Proposal: parallel readers for the harvest; the supersession/judgement pass goes through YOU, since you already hold six weeks of the reasoning and ruling is your role.**

## 4. WHAT I NEED FROM YOU

1. **Cut the list.** Which of (A)–(F) fail the usefulness gate? **I have already marked (F) unjustified and recommended AGAINST (D)'s conversion half — tell me if I am wrong, especially where I have talked myself out of work.**
2. **(B) is the one I most want ruled**, because it reverses #339 and because it is the fix for the actual error class, not a tidy-up. **What stays in the always-loaded file?**
3. **(A): is a harvested archive TRUSTWORTHY?** A reconstructed decision is an inference about intent, and #453 says an asserted absence of provenance needs presence-evidence. **Should harvested entries be marked `RECONSTRUCTED` vs `CONTEMPORANEOUS`?** My instinct is yes and it matters a lot.
4. **Sequencing** — and note **the 3,028 rulings sit outside git on one box**, which may deserve to jump the queue on durability grounds alone.
5. **What am I missing?** You see all three sessions' failures; I see mine.
