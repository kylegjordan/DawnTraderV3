# B-CLAUDEMD-SLIM — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

change-class: non_architecture ⚠️ **CHALLENGED BY F10** · **Owner:** CC-A · **Step 2 of 11**
**Scope APPROVED r5** (`c7ce7d8ea`) · **Audit ref: `e44c2ba47`** · **Placement:** `PHASE_19_PLAN.md` §governance queue, **position 9**

> ⛔ **THE AUDIT COMES FIRST AND THE PLAN FALLS OUT OF IT.** Every plan item back-references its finding; anything without one is flagged **`UNAUDITED`**.

**PREVIOUSLY STATED / NOW / REASON (§9.2, and I owed this block and did not write it):**
> **PREVIOUSLY STATED: queue position 5** (`SCOPE:5`). **NOW: position 9.** **REASON:** four batches were placed ahead of it on 2026-08-27/28 (`B-CROSS-SESSION-BLEED`, `B-MEASURE-GATE`, `B-EXIT-LATCH-INVESTIGATION`, and the guard pair). `PHASE_19_PLAN.md:449` confirms 9. ⚠️ **I silently adopted the correct value. §9.2 mandates this block — and §9.2 is one of the sections this batch is cutting.**

**`REVIEWER r1: object · "re-derive, refute the absences, find plan items with no finding" · HIT ×8, three load-bearing · re-derived y`**
**`REVIEWER r2: object · "are the corrections wrong in a NEW way?" · HIT ×13 · re-derived y (all load-bearing ones, by me, at the ref)`**

---

## PART 1 — THE AUDIT

### 0. SOURCES READ — all six

| # | source | returned |
|---|---|---|
| 1 | **CODE at the ref** | `CLAUDE.md`, 12 `SKILL.md`, `CONDUCT.md`, the loaders, `fresh-rules.mjs`, `discord_common.py` |
| 2 | **RUNTIME instrument** | `~/.claude/instructions-loaded.jsonl` — **F1** |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | NOT silent, 11 lines incl. a component entry — **F4** |
| 4 | **`SYSTEM_MANUAL.md`** | NOT silent, 15 lines incl. a by-number pointer into a cut target — **F5** |
| 5 | **the LEDGER** (§9.5(b-ii)) | `#339` · `#564` · `#749` · `#750` — **F6** |
| 6 | **`bridge/canonical/`** (§9.5(b)) | 14 files, **zero coverage** (control run) — **F7** |

---

### F1 — THE LOADED SET

| file | at `e44c2ba47` | how it arrives |
|---|---|---|
| `CLAUDE.md` | **117,191** | harness-native |
| `CONDUCT.md` | **24,536** | `load-conduct.mjs` |
| `MEMORY_CC_A.md` | **24,426** | `load-own-memory.mjs` |
| shared `MEMORY.md` | **18,056** | harness-native |
| **TOTAL** | **184,209** | |

⇒ **`CLAUDE.md` = 63.6%.** ✅ **The scope's *"~64%"* holds.** ⚠️ **Its *"112 KB"* is stale.**
⚠️ **63.6% IS A CEILING, NOT A MEASUREMENT** — `session-reminder.mjs` and the per-chunk manifests are injected and not in the table, so the true share is **lower**.
⛔ **INSTRUMENT REACH: the native sink reports exactly ONE file.** It answers *"what does the harness load?"*, **not *"what is in the context?"*** ⚠️ **Row-count population, corrected: `cwd == C:\DawnTraderV3-old` returns 338 rows, not the 170 I first wrote — and the log carries TWO row schemas, the native rows having no `cwd` key at all. My figure had no stated predicate.**

⛔⛔ **AND MY FIRST DRAFT REPORTED TWO OF THESE FROM MY WORKING TREE IN A DOCUMENT HEADED "AUDIT REF" — the CRLF trap I retracted the same morning (`#751`).**

### F1b — CORRECTED: **TWO DIVERGENCES, NOT THREE — AND THE THIRD WAS CRLF FOR THE THIRD TIME TODAY.**
| copy | bytes | |
|---|---|---|
| truth file (user cache) | **17,884** | ⇐ **the STALE one** |
| mirror at the ref | **18,056** | |
| mirror in my worktree | 18,110 | ⛔ **NOT a divergence: 54 B over 54 lines. `tr -d '\r'` → 18,056, `diff` vs the ref is EMPTY.** |
⇒ ★ **ONE real divergence, and I never stated its DIRECTION: the TRUTH FILE is behind the mirror** — it still says *"YOU ARE ONE OF THREE SESSIONS"* where the mirror says four and names CC-INFRA. **The §3.1 two-step was run backwards.**
**DISPOSITION: §9.4 #4 — scheduled review, folded into `B-CROSS-SESSION-BLEED` (#753).** ⚠️ **Not a finding about the slim.**

### F2 — INBOUND CITATION CENSUS. **RE-MEASURED AT `e44c2ba47`.**

| target | occurrences |
|---|---|
| §9.3 | **462** |
| §9.5 | **341** |
| §9.1 | **234** |
| §9.2 | **145** |
| rule 19 | **36** *(case-insensitive)* |
| **total** | **1,218** |

⚠️ **MY EARLIER FIGURES (1,188) WERE MEASURED AT THE PARENT COMMIT WHILE THE HEADER SAID "AUDIT REF".** ★ **The audit's own landing added ~30 citations to the targets it counts. The instrument is inside the population it measures.**
⚠️ **POPULATION, STATED AS A CHOICE: `*.md` only. That EXCLUDES 22 live `§9.x` citations in tracked TypeScript/JS** — `poller.mjs:137` (`§9.5(a-ii)`), `active-funnel-tracker.ts:108`/`:416`, `eval-cycle.ts:1153`, `active-execution-engine.ts:3304`, and others. **Several are §9.5 — the dangling class — and they sit outside P2's sampling and outside F8's reader row.** *(20 `dist/` build artifacts are correctly excluded; that is also a choice.)*
✅ Boundary-anchoring works: naive `§9.1` = 281, anchored = 234. **Control: `§9.99` = 0.** Contamination = 51 (`§9.10` 26, `§9.13` 13, **`§9.14` 12 — which I missed first time**).

⛔ **RETRACTED: my *"the file's own 237 figure is off by 8×"*.** I compared their **anchored** count to my **prefix** count. **Anchored `§9` = 372.** ⇒ **237 vs 372 is a population dispute, not an error of magnitude.** ★ **I corrected exactly this contamination for `§9.1` one bullet earlier and then committed it myself.** *(And it lives at **`CLAUDE.md:448`**, not `:462` as I cited — a wrong line reference inside a finding about citation integrity.)*

### F3 — ★★ **TWO FAILURE MODES, NOT ONE — AND REGIME B IS AN INFERENCE, NOT AN ESTABLISHED FACT.**

| regime | targets | occurrences | what happens |
|---|---|---|---|
| **A — HOLLOW BUT RESOLVING** | §9.1 · §9.2 · §9.3 — **verified: each retains ≥1 clause** (`SCOPE:41,42,45,47`) | **841** | pointer resolves, lands on a section that no longer says what was cited. **§4's *"citations still resolve"* PASSES VACUOUSLY.** |
| **B — ⛔ DANGLING** | **rule 19** (`SCOPE:49` **"CUT, WHOLE"**) · **§9.5** | **377** | **the pointer BREAKS.** |

⚠️ **FLAGGED FOR LANGSTON, BECAUSE I STATED IT AS FACT AND IT IS NOT: THE SCOPE NEVER SAYS §9.5's HEADING IS REMOVED.** *"Class A/B/C"* **is never defined anywhere in the scope** — grep returns usages only. My regime-B assignment rests entirely on `SCOPE:52`'s 6,038 B matching `CLAUDE.md` lines 500-529 (**re-derived: 6,039 B, line 500 IS the `### 9.5` heading**). ★ **Good evidence, and still an inference. F5 was then "corrected" on the strength of it. This is a SCOPE AMBIGUITY for Langston to settle, alongside F10.**

### F3b — ★★ **NEW, AND IT BREAKS MY OWN FIX: A KEPT HEADING SERVES ONLY 29% OF §9.5's CITATIONS.**
| §9.5 citation shape | count |
|---|---|
| **sub-citations** — `§9.5(a)`, `§9.5(a-ii)`, `§9.5(b)`, `§9.5(b-ii)` | **242** |
| bare `§9.5` | **99** |
⇒ ⛔ **A husk resolves `§9.5` and gives `§9.5(a-ii)` NOTHING — the sub-labels exist only inside the deleted body.** ★★ **THIS IS F3-A's VACUOUS-RESOLUTION FAILURE ONE LEVEL DOWN, INSIDE THE FIX I WROTE FOR F3-B.** **P1b must carry the sub-labels, not just the heading.**

### F4 — **`SYSTEM_IMPACT_MAP.md` APPLICABLE; the scope names it zero times.** `SIM:938` (component entry for `fresh-rules.mjs`) · `SIM:957` (live cross-reference into §5). ⇒ **CONTENT update required.**

### F5 — **`SYSTEM_MANUAL:517`** — *"GOVERNANCE LESSON (now `CLAUDE.md` §9.5)"* — **dangles if regime B holds.** ⚠️ **Conditional on F3's inference, not established.**

### F6 — LEDGER. **`#339` NO-TRIM** — ⛔ **regime B puts it at risk: 377 citations with no forwarding address IS content made unfindable.** Satisfied only if P1+P1b land **and P1b covers the sub-labels (F3b)**. **`#564`** — this batch is §564 applied to §9. `#749`/`#750` = Class C.

### F7 — **`bridge/canonical/`: 14 files, ZERO coverage of the instruction files** (control: `DawnTrader` returns 9/7/4 in three corpus files). ⇒ **no original-intent record exists; provenance is git history + `_archive/CLAUDE_MD_RULE_HISTORY.md`** — which is why that file is the right destination for evicted EVIDENCE.

### F8 — §9.5(a) CENSUS. **Population: this repo. Langston's `/home/langston/CLAUDE.md` and server-side scripts are OUTSIDE any laptop-local grep.**

| question | answer |
|---|---|
| writes | four sessions, by hand |
| reads | the harness + **1,218 markdown citations + 22 in tracked source (F2)** |
| mutates programmatically | **`fresh-rules.mjs:124`. Exactly one, in-repo** — confirmed against the working tree too |
| ★ **DELETES** | ⛔ **REFUTED — the same component.** `git checkout <ref> -- CLAUDE.md` is a **whole-file replacement**; its own comment records it *"reverted my commit's content in the working tree"* (`:104-108`). ⚠️ **I called it a mutator in one row and asserted no deleter in the next.** *(Guards at `:100`/`:110` narrow the window; the second exists because the first was insufficient.)* |
| schedules | the SessionStart chain. ⚠️ **`config.mjs:31` `HOUSEKEEPING_ONLY_BASENAMES` keys off `CLAUDE.md`** — my *"the checker does not grade it"* was true of `DOCS` and incomplete as stated |

⇒ **NO AUTOMATED READER VALIDATES A CITATION.**

### F9 — ⛔ **RETRACTED: THE RENUMBER CASCADE IS NOT A LIVE RISK, AND THE FILE ITSELF REFUTES IT.**
**`CLAUDE.md:161` reads `11. *(removed)*`.** ★ **A rule has ALREADY been cut whole from this list, the hole was left explicit, and rules 12-29 were NOT renumbered.** ⇒ **the established practice is one line above rule 13, in the file I was auditing.**
⚠️ **And my supporting number was unreproducible: I wrote 840 across rules 1-29; anchored-occurrence gives 866, line-based 810, unanchored 1,674. No population yielded 840** — a stated-without-population aggregate **inside the finding series whose subject is stated populations.**
✅ **What survives: P1b's "explicit hole" is CORRECT — and it is not novel. It should cite `:161` as its form.**

### F10 — ⚠️ **CHANGE-CLASS CHALLENGE STANDS; MY PREMISE ABOUT THE EXISTING CODE WAS WRONG.**
I wrote that `#749` modifies *"recipient stamping on every chunk"*. **Re-derived at `discord_common.py:251-256`: the block stamps `GROUP_MARKER_FMT = '⟨grp={grp} {i}/{n}⟩'` — a REASSEMBLY GROUP ID. No recipient name is written to any chunk anywhere in that function.**
⇒ ★ **The mechanism I described does not exist yet, so `#749` is a NEW FEATURE on the send path, not a modification — which STRENGTHENS the change-class challenge rather than weakening it.** ⚠️ **I inherited the wrong reading from `SCOPE:95` and never re-derived it. Langston had already corrected me on this exact point once (*"a reassembly marker, not a name"*) and I re-imported the error into the audit.**
⛔ **A documentation batch that adds a feature to the live comms send path is not obviously `non_architecture`. FOR LANGSTON.**

---

## PART 2 — THE IMPLEMENTATION PLAN

| # | item | falls out of |
|---|---|---|
| **P1** | Regime-A cut clauses leave a **forwarding pointer at their own section** | **F3-A** + the `§2` precedent |
| **P1b** | **Regime B: `§9.5`'s HEADING survives as a husk; `rule 19`'s number survives as an explicit hole, in the form of `CLAUDE.md:161`** | **F3-B**, **F5**, **F9** (form), **F6** |
| **P1c** | ★ **NEW: THE HUSK MUST CARRY THE SUB-LABELS `(a)`, `(a-ii)`, `(b)`, `(b-ii)` AS NAMED POINTERS** — a bare heading serves 99 of 341 | **F3b** |
| **P2** | §4 gains: **follow ONE real inbound citation per cut clause and confirm it still supports the citing sentence** | **F3-A** |
| **P2b** | ⚠️ **Stated limit, not a fix: samples ~6 of 1,240. No automated reader exists (F8).** Residual named, not discharged. **§9.4 #4.** | **F8** |
| **P3** | **SIM content update** | **F4** |
| **P4** | **System Manual content update** — `:517` re-aimed | **F5** |
| **P5** | **Update `_archive/CLAUDE_MD_RULE_HISTORY.md`** with evicted evidence | **F7** |
| **P6** | Execute the cuts per the approved scope | ⚠️ **`UNAUDITED` as to WHICH clauses — that is the scope's determination. Audited as to CONSEQUENCE (F3, F3b).** |
| **P6b** | ⛔ **NEW: FIND A DESTINATION FOR CARRY-ACROSS ITEM 2 — THE PLAN HAS NONE, AND IT IS THE ONE THAT CARRIES THE RECLASSIFICATION.** The trigger-breadth clause fires on *"any audit, pre-audit **or architectural dispute**"*; both skills fire `STEP 1/2 ONLY`. ★ **By §3's own boundary test a rule that must fire UNPROMPTED cannot live in a skill — so it has no legal home except `CLAUDE.md`, which contradicts regime B.** **FOR LANGSTON.** | **round-2 finding; unplanned** |
| **P7** | The nearest-paraphrase step, per cut, before the cut | ⚠️ **`UNAUDITED` — Langston condition (iii), a method requirement** |
| **P8** | Class C: `#749`, `#750` | ⛔ **`UNAUDITED` AND FLAGGED — F10. Split it out or audit it separately.** |
| **P9** | Re-measure after the cut; **second instrument NAMED: `wc -c` at the ref**, since the sink cannot see hook-injected files | **F1** |
| **P10** | Update the skill-count check — Class C builds a **thirteenth** skill and `SCOPE:123` checks for twelve | **F7/P8** |

---

## PART 3 — PLAIN LANGUAGE

**Two review rounds changed this document more than the original draft contained.**

The rules file is **117,191 bytes, about 64% of what a session reads before starting work** — a ceiling, not an exact figure, because some injected text still isn't counted.

**My central finding was half wrong and the correction was wrong again in a new way.** Trimming these sections leaves most pointers working but landing on something emptier — a quiet failure. **For two of the five, the section goes away entirely and the pointers simply break.** I then proposed keeping an empty heading behind as a signpost — **and about seven in ten of those pointers are to *sub-parts* of the section, which an empty heading cannot help at all.** The fix had the same flaw as the problem.

**I also claimed a renumbering risk that the file itself refutes** — a rule was already removed years-deep in this list, the gap was simply left visible, and nothing was renumbered. **That's the pattern to copy, not a danger to guard against.**

**Two things are going to Langston as questions rather than answers:** whether one section is really being deleted outright (the scope never actually says so), and the fact that **one piece of this work adds a feature to the live messaging code**, which may mean this isn't the kind of batch we filed it as.
