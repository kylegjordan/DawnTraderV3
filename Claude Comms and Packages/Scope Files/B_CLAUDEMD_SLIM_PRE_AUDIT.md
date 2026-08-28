# B-CLAUDEMD-SLIM — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

change-class: non_architecture ⚠️ **CHALLENGED BY F10 — see below** · **Owner:** CC-A · **Step 2 of 11**
**Scope APPROVED r5** (`c7ce7d8ea`) · **Audit ref:** `origin/migration/aws-supabase` · **Placement:** `PHASE_19_PLAN.md` §governance queue, position 9

> ⛔ **THE AUDIT COMES FIRST AND THE PLAN FALLS OUT OF IT.** Every plan item back-references its finding; anything without one is flagged **`UNAUDITED`** in-document.

**`REVIEWER r1: object (this document + the scope + the hooks) · "re-derive the numbers, refute the absences, find plan items with no finding" · HIT — eight, three of them load-bearing · re-derived y (all four critical ones, by me, at the ref)`**

---

## PART 1 — THE AUDIT

### 0. SOURCES READ — all six, named

| # | source | what it returned |
|---|---|---|
| 1 | **the CODE at the ref** | `CLAUDE.md`, 12 `SKILL.md`, `CONDUCT.md`, the SessionStart loaders, `fresh-rules.mjs` |
| 2 | **the RUNTIME instrument** | `~/.claude/instructions-loaded.jsonl` — 548 rows, 170 this clone — **F1** |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | **NOT silent — 11 lines incl. a component entry ⇒ APPLICABLE — F4** |
| 4 | **`SYSTEM_MANUAL.md`** | **NOT silent — 15 lines incl. a by-number pointer into a section being DELETED — F5** |
| 5 | **the LEDGER** (§9.5(b-ii)) | `#339` NO-TRIM · `#564` PLACEMENT · `#749` · `#750` — **F6** |
| 6 | **`bridge/canonical/`** (§9.5(b)) | **14 files at the ref; ZERO cover the instruction files** (control run) — **F7** |

---

### F1 — THE LOADED SET. **CORRECTED: TWO OF MY FOUR FIGURES WERE WORKING-TREE READS IN A DOCUMENT HEADED "AUDIT REF".**

| file | **at the ref** | what I first wrote | how it arrives |
|---|---|---|---|
| `CLAUDE.md` | **117,191** | 117,191 ✅ | harness-native |
| `CONDUCT.md` | **24,536** | ~~24,710~~ ❌ | `load-conduct.mjs` |
| `MEMORY_CC_A.md` | **24,426** | 24,426 ✅ | `load-own-memory.mjs` |
| shared `MEMORY.md` | **18,056** | ~~17,884~~ ❌ | harness-native |

⛔⛔ **THE `CONDUCT.md` ERROR IS THE SAME CRLF TRAP I RETRACTED THIS MORNING AND THEN REPEATED INSIDE THE AUDIT.** `24,710` exists **nowhere at the ref** — it is `core.autocrlf` adding one byte per line to a 174-line file. ★ **`#751` already records this exact defect. Knowing the pattern did not prevent the pattern; only reading at the ref does.**

⇒ **corrected total 184,209 B; `CLAUDE.md` = 63.6%.** ✅ **The scope's *"~64%"* holds.** ⚠️ **Its *"112 KB"* is stale: +2,206 B during the review of its own slimming scope.**

⚠️ **AND THE TOTAL IS STILL AN UNDERCOUNT, SO 63.6% IS A CEILING, NOT A MEASUREMENT.** `session-reminder.mjs` injects on every start/resume/compact, and `load-conduct.mjs` / `load-own-memory.mjs` prepend a per-chunk manifest to each chunk. **None are in the table.** ⇒ **CLAUDE.md's true share is BELOW 63.6%.**

⛔ **INSTRUMENT REACH, stated because it would have produced a wrong-object claim: THE NATIVE SINK REPORTS EXACTLY ONE FILE — `CLAUDE.md`.** Read naively: *"100% of what loads."* ★ **It is 100% of what the HARNESS NATIVELY loads; the hook-injected files are invisible to it.** ⇒ **it answers *"what does the harness load?"*, not *"what is in the context?"***

### F1b — ★ NEW, FOUND WHILE CORRECTING F1: **THE `MEMORY.md` TWO-FILE PATTERN IS OUT OF SYNC THREE WAYS, RIGHT NOW.**
| copy | bytes |
|---|---|
| truth file (user cache) | **17,884** |
| mirror at the ref | **18,056** |
| mirror in my worktree | **18,110** |
⇒ **§3.1 mandates these be kept in sync and they are not.** ⚠️ **Not this batch's to fix, and it is NOT a finding about the slim** — but it is a live governance violation surfaced by this audit. **DISPOSITION: §9.4 #4 — a scheduled review, folded into `B-CROSS-SESSION-BLEED` (#753, queue position 2), which is already investigating divergence in shared files.**

### F2 — INBOUND CITATION CENSUS. **CORRECTED TOTAL: 1,188.**

| target | citations | files |
|---|---|---|
| §9.3 | 458 | 217 |
| §9.5 | 330 | 108 |
| §9.1 | 230 | 136 |
| §9.2 | 142 | 112 |
| rule 19 | **28** *(22 lower-case + 6 `RULE 19`/`Rule 19`)* | — |
| **total** | **1,188** | |

⚠️ **TWO CORRECTIONS TO MY OWN CENSUS, AND BOTH ARE THE ERROR THE CENSUS IS ABOUT:**
- **The prefix contamination is 51, not 39.** `§9.10`=26, `§9.13`=13, **`§9.14`=12 — which I missed entirely.** ⇒ **I enumerated the contaminants and my enumeration was itself one short.**
- **`rule 19` was measured case-SENSITIVELY and I never stated the population.** Case-insensitive = 28.
⚠️ **POPULATION, now stated as a CHOICE rather than left implicit:  only.** A working-tree sweep finds **20 stale  build artifacts** carrying  citations in compiled comments. ✅ **Excluding them is correct — they are build output, not a governance surface — but it is a choice, and an unstated population is the defect this census exists to demonstrate.**

✅ **Boundary-anchoring did work** (naive `§9.1` = 281, anchored = 230). **Control: `§9.99` = 0.**

⚠️ **UNRECONCILED, AND I AM FLAGGING IT RATHER THAN SILENTLY PREFERRING MY OWN NUMBER:** the scope's §4 asserts *"§9 alone carries 237 of them"*, lifted from `CLAUDE.md:462`. **Measured: `§9` returns 1,969 occurrences across 570 files.** ⇒ **the governing figure inside the file being audited is off by roughly 8×.** **It is not decision-bearing here — every §9.x count above is measured directly — but it must not be cited again.**

### F3 — ★★ **CORRECTED, AND MY CENTRAL FINDING WAS WRONG FOR 30% OF ITS OWN DENOMINATOR. THERE ARE TWO FAILURE MODES, NOT ONE.**

**I claimed: the scope cuts CLAUSES not HEADINGS ⇒ all citations still resolve ⇒ the risk is a vacuous pass.** ⛔ **That is true for three of the five targets and FALSE for two — and the scope says so explicitly, in the table I was auditing.**

| regime | targets | citations | what actually happens |
|---|---|---|---|
| **A — HOLLOW BUT RESOLVING** | §9.1 · §9.2 · §9.3 *(each keeps ≥1 clause — `SCOPE:40-47`)* | **830** | pointer resolves, lands on a section that no longer says what was cited. **§4's *"citations still resolve"* PASSES VACUOUSLY.** |
| **B — ⛔ GENUINELY DANGLING** | **rule 19** *(`SCOPE:49` **"CUT, WHOLE"** — a numbered rule has no heading to leave behind)* · **§9.5** *(`SCOPE:52` gives 6,038 B; **re-derived: lines 500-529 = 6,039 B, and line 500 IS the `### 9.5` heading** ⇒ the section goes entirely)* | **358** | **the pointer BREAKS. Nothing to forward to.** |

★★ **I NAMED ONE FAILURE MODE AND APPLIED IT TO BOTH.** ⇒ **the plan had no item at all for the 358 dangling citations, which are the WORSE half.**
✅ **The vacuous-pass finding survives — for regime A, 830 citations. It is still real, and `§4` step 4 still does not catch it.**

### F4 — **`SYSTEM_IMPACT_MAP.md` IS APPLICABLE; THE SCOPE NAMES IT ZERO TIMES.**
- **`SIM:938`** — component entry for **`fresh-rules.mjs`**, *"re-stages `CLAUDE.md` / `.claude/*` when the branch has moved"*.
- **`SIM:957`** — live cross-reference: *"If you change this, check: `CLAUDE.md` §5 'THE EIGHT'…"*.
⇒ **SIM gets a CONTENT update** (§9 rule 3 — *reorganising is not updating*).

### F5 — **CORRECTED: `SYSTEM_MANUAL:517` IS A HARD BREAK, NOT A SOFT ONE.**
*"GOVERNANCE LESSON (now `CLAUDE.md` §9.5)…"* — and **F3 regime B establishes §9.5 is removed entirely.** ⇒ **this pointer does not hollow out; it dangles.** ★ **I had it in the soft category, which was the direct consequence of F3's error.**

### F6 — LEDGER. **NO CONFLICT; TWO DECISIONS BIND.**
- **`#339` NO-TRIM.** ⛔ **REGIME B PUTS THIS AT RISK: 358 citations pointing at content with no forwarding address IS content made unfindable.** ✅ Satisfied only if P1+P1b land.
- **`#564` PLACEMENT** — this batch is §564 applied to §9.
- `#749`/`#750` — the Class C builds.

### F7 — PROVENANCE. **CONSULTED `bridge/canonical/`: 14 FILES AT THE REF, NO COVERAGE OF THE INSTRUCTION FILES** (control: `DawnTrader` returns 9/7/4 in three corpus files, so the absence is real).
✅ Expected — the corpus is pre-2026-01/02 and describes the trading system. ⚠️ **Consequence: there is NO original-intent record for these rules; their provenance is git history + `_archive/CLAUDE_MD_RULE_HISTORY.md`.** ⇒ **that history doc is the correct destination for evicted EVIDENCE, as a skill is for evicted PROCEDURE.**

### F8 — §9.5(a) CENSUS ON `CLAUDE.md`. ⛔ **ONE OF MY TWO ASSERTED ABSENCES IS REFUTED — BY THE COMPONENT I NAMED IN THE ROW ABOVE IT.**

**Population, now stated: this repo only.** ⚠️ **Langston's `/home/langston/CLAUDE.md` and the server-side scripts are outside any local grep's reach and are NOT covered by this census.**

| question | answer at the ref |
|---|---|
| who **writes** it? | four sessions, by hand |
| who **reads** it? | the harness + **1,188 in-corpus citations** |
| who **mutates** it programmatically? | **`fresh-rules.mjs:124` — `git checkout <REMOTE_REF> -- <path>`. Exactly one, in-repo.** |
| ★ who **DELETES** from it? | ⛔ **REFUTED. `fresh-rules.mjs` IS the deleter — `git checkout <ref> -- CLAUDE.md` is a WHOLE-FILE REPLACEMENT: every local byte absent at origin is destroyed.** ★ **Its own comment records it having already done so: *"the next run checked the path out from origin and reverted my commit's content in the working tree"* (`:104-108`).** ⚠️ **I classified this hook as a MUTATOR in one row and asserted NO DELETER in the next — the same code path, two rows apart. That is the §9.5(a-ii) shape inside the census invoking §9.5(a-ii).** *(Guards at `:100`/`:110` narrow the window; the second exists because the first was insufficient. A guarded deleter is not an absent one.)* |
| who **schedules** work against it? | the SessionStart hook chain. ⚠️ **AND THE CHECKER DOES KEY OFF IT: `config.mjs:31` `HOUSEKEEPING_ONLY_BASENAMES = ['MEMORY.md','CLAUDE.md']` exempts commits touching only it.** My *"the checker does not grade it"* was true of the `DOCS` table and incomplete as stated. |

⇒ ⚠️ **NO AUTOMATED READER VALIDATES A CITATION.** The only thing that catches F3 is a person following a pointer.

### F9 — ★ NEW: **THE RENUMBER CASCADE. `rule 19` IS CUT WHOLE OUT OF AN EXPLICITLY NUMBERED LIST.**
That leaves either **a hole at 19** or a tidy-up that renumbers 20-29. **Measured: 840 inbound citations across `rule 1`-`rule 29`** — `rule 29` alone carries 105, `rule 23` 35, `rule 25` 32.
⇒ ⛔ **A RENUMBER IS UNRECOVERABLE AT THAT SCALE. The hole is mandatory and must be stated in the file**, exactly as §2's heading was kept as a forwarding address.

### F10 — ★ NEW, AND IT CHALLENGES THE CHANGE-CLASS: **`#749` (Class C) EDITS LIVE COMMS CODE, AND PART 1 HAD NO ANALYSIS OF IT.**
`#749` modifies `comms-infra/discord/discord_common.py:252-256` (`SCOPE:95`) — recipient stamping on **every chunk of a multi-party message**, which changes **wake routing for all four sessions**.
⇒ ⛔ **A documentation batch that edits the comms fabric is not obviously `non_architecture`, and the SIM's "Discord Comms Fabric" entry is in scope.** ★ **Flagged for Langston as a change-class question, not settled here.**

---

## PART 2 — THE IMPLEMENTATION PLAN

| # | item | falls out of |
|---|---|---|
| **P1** | **Every cut clause in REGIME A leaves a forwarding pointer at its own section**, naming the destination skill — the `§2` pattern at clause granularity | **F3-A**, and the `§2` precedent (*"cited 136 times … deleting the heading would silently break every one of those pointers"*) |
| **P1b** | ★ **NEW: REGIME B GETS A KEPT HUSK, NOT A POINTER.** `§9.5`'s **heading survives** as a forwarding address with its content removed; **`rule 19`'s NUMBER survives as an explicit hole** naming `workflow-05`. **358 citations depend on this and had no plan item at all.** | **F3-B**, **F5**, **F9**, and `#339` per **F6** |
| **P2** | **§4 gains: for each cut clause, follow ONE real inbound citation and confirm it still supports the citing sentence** — not *"does §9.3 exist"* | **F3-A** |
| **P2b** | ⚠️ **STATED LIMIT, not a fix: P2 samples ~6 of 1,188. F8 establishes no automated reader exists.** The residual is accepted and named, not discharged. **DISPOSITION §9.4 #4 — a scheduled review at the batch's close.** | **F8** |
| **P3** | **SIM content update** — `fresh-rules.mjs` entry + the `:957` cross-reference | **F4** |
| **P4** | **System Manual content update** — `:517` re-aimed | **F5** |
| **P5** | **Update `_archive/CLAUDE_MD_RULE_HISTORY.md`** with the evicted evidence | **F7** — *a finding with no plan item is the mirror of a plan item with no finding* |
| **P6** | Execute the cuts: §9.1/§9.2 clauses, §9.3's two copied halves, rule 19 whole, §9.5 Class B with the **two** survivors, item 1 as ONE clause adjacent to `w2:53` with the hop-vs-unreachability discriminator | ⚠️ **`UNAUDITED` as to WHICH clauses — that determination is the approved scope's, not this audit's.** Audited as to **consequence** (F3, F9). |
| **P7** | The nearest-paraphrase step runs per cut, before the cut | ⚠️ **`UNAUDITED` — Langston condition (iii), a method requirement, not an audit finding.** |
| **P8** | Class C: `#749`, `#750` | ⛔ **`UNAUDITED` AND FLAGGED — see F10. `#749` touches live comms code and this audit did not analyse it. It should be split out or separately audited before implementation.** |
| **P9** | **Re-measure the loaded set after the cut** — ⚠️ **and the second instrument is NAMED: `wc -c` at the ref on the hook-injected files, since the native sink cannot see them and `log-instructions-loaded.mjs` cannot prove loading** | **F1** |
| **P10** | ★ **Update the skill-count check: `SCOPE:123` verifies "all twelve skills parse" and Class C builds a THIRTEENTH** | **F7/P8** — the check would pass while ignoring the new skill |

⛔ **THREE ITEMS ARE FLAGGED `UNAUDITED` (P6 partially, P7, P8).** ★ **My first draft claimed *"Nothing here is `UNAUDITED`"* while three items traced to the scope rather than to any finding — the blanket claim was contradicted three rows below itself.**

---

## PART 3 — PLAIN LANGUAGE

**What the audit turned up, and the second reader changed the answer materially.**

The rules file is **117,191 bytes, about 64% of what a session reads before starting work** — the scope's percentage was right and its byte figure stale.

**My central finding was half wrong.** I'd said that trimming these sections leaves all ~1,200 records that point at them still working, just pointing at something emptier — a quiet failure our check would have missed. **That's true for three of the five things being cut. For the other two the section is removed outright, so roughly 360 pointers simply break** — the louder failure, and my plan had nothing for it at all.

**I also asserted that nothing automated ever deletes from the rules file. That was wrong, and the thing that refutes it is a tool I'd listed one row earlier** — it restores the file from the server copy, which erases anything local that isn't there. **Its own comments record it having done exactly that once.**

**And one piece of this batch quietly edits the live messaging code** rather than documentation — that changes what kind of batch this is, and I've flagged it for Langston rather than deciding it.
