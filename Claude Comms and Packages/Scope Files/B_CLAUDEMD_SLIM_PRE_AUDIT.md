# B-CLAUDEMD-SLIM — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN

change-class: non_architecture · **Owner:** CC-A · **Step 2 of 11** · **Scope APPROVED r5** (`c7ce7d8ea`)
**Audit ref: `e44c2ba47`** · **Placement:** `PHASE_19_PLAN.md` §governance queue, **position 9**

> ⛔ **THE AUDIT COMES FIRST AND THE PLAN FALLS OUT OF IT.** Every plan item back-references its finding; anything without one is flagged **`UNAUDITED`**.

**PREVIOUSLY STATED / NOW / REASON (§9.2):** **PREVIOUSLY: queue position 5** (`SCOPE:5`). **NOW: position 9.** **REASON:** four batches placed ahead of it 2026-08-27/28; `PHASE_19_PLAN.md:449` confirms.

## ⛔⛔ THE ROUND RECORD — READ THIS FIRST, IT IS THE MOST IMPORTANT THING IN THE DOCUMENT
| round | mode | verdict | re-derived |
|---|---|---|---|
| **r1** | object | **HIT ×8** — three load-bearing | y |
| **r2** | object | **HIT ×13** — including that my *fix* had the flaw it fixed | y |
| **r3** | object | **HIT ×11** — including a correct number I replaced with an unreproducible one | y |

⛔⛔ **THE ERROR RATE DID NOT CONVERGE, AND THAT IS THE FINDING I MOST WANT LANGSTON TO RULE ON.** Three rounds, ~32 accepted corrections, and **round 3 still found eleven** — several of them *inside the paragraphs correcting the same class of error one bullet earlier.* ★ **The loop is not polishing; it is still finding first-order defects at round three.** ⚠️ **Kyle's termination condition — the reviewer's own called-out items satisfied — is met for r3's list, but the TREND says the next round would find more.** **I stopped at the cap, as required, rather than because it was clean.**

---

## PART 1 — THE AUDIT

### 0. SOURCES READ — all six

| # | source | returned |
|---|---|---|
| 1 | **CODE at the ref** | `CLAUDE.md`, 12 `SKILL.md`, `CONDUCT.md`, the loaders, `fresh-rules.mjs`, `discord_common.py` |
| 2 | **RUNTIME instrument** | `~/.claude/instructions-loaded.jsonl` — **F1** |
| 3 | **`SYSTEM_IMPACT_MAP.md`** | applicable — **F4** |
| 4 | **`SYSTEM_MANUAL.md`** | applicable, `:517` — **F5** |
| 5 | **the LEDGER** | ⛔ **searched, and I still MISSED `#749`'s own disposition — see F10** |
| 6 | **`bridge/canonical/`** | 14 files, zero coverage (control run) — **F7** |

---

### F1 — THE LOADED SET, **FROM THE INSTRUMENT THIS TIME.**

⛔ **MY EARLIER TABLE REPORTED REF-TREE BYTES FOR FILES THE HARNESS DOES NOT LOAD FROM THE REF** — the memory truth files live in the user cache (F1b proves it), and `CONDUCT.md` loads from the working tree. **I measured the ref copy of files nobody reads from the ref, in a table headed *"how it arrives"*.**

**What the instrument actually reports (last CC-A `SessionStart`, 2026-08-28T06:06:20Z):**
| file | bytes AS LOADED |
|---|---|
| `CLAUDE.md` | **114,901** |
| `CONDUCT.md` | 24,710 |
| `MEMORY_CC_A.md` | 24,000 |
| shared `MEMORY.md` | 17,884 |
| **TOTAL** | **181,495** |
⇒ **`CLAUDE.md` = 63.3% of what a session actually loads.** ✅ **The scope's *"~64%"* survives — the CONCLUSION held while the DERIVATION was wrong, which is the least comfortable way to be right.**

⛔ **AND P9's PREMISE IS REFUTED BY THIS SAME LOG: a second instrument already exists.** 236 rows are `log-instructions-loaded.mjs` SessionStart rows carrying **per-file bytes and `context_bytes_total`**. ★ **I proposed `wc -c` as the missing instrument while the instrument was in the file I was reading.**
⚠️ **ROW COUNT: 169 by `cwd` exact, 170 by suffix. My "corrected" 338 is unreproducible under any predicate — I RETRACTED A CORRECT NUMBER AND REPLACED IT WITH A WRONG ONE**, inside the finding series about stated populations. **The original 170 stands.** *(The schema half was right: 236 rows carry no `cwd` key at all.)*

### F1b — **`MEMORY.md`: ONE REAL DIVERGENCE, DIRECTION STATED.**
truth **17,884** (*"ONE OF THREE SESSIONS"*, no CC-INFRA) · ref mirror **18,056** (*"FOUR"*) · worktree 18,110 = **CRLF only, not a divergence**.
⇒ ★ **THE TRUTH FILE IS THE STALE ONE — the §3.1 two-step was run backwards.** **DISPOSITION: §9.4 #4, scheduled review, folded into `B-CROSS-SESSION-BLEED` (#753).**

### F2 — CITATION CENSUS AT `e44c2ba47`

| target | occurrences | regime |
|---|---|---|
| §9.3 | **462** | A |
| §9.5 | **341** | **B** |
| §9.1 | **234** | A |
| §9.2 | **145** | A |
| rule 19 | **36** | **B** |
| **total** | **1,218** | **841 A / 377 B** |

⚠️ **CORRECTED AGAIN AT r3 — the contamination bullet was still measured at the PARENT, one bullet after retracting exactly that.** At this ref: **naive `§9.1` = 288, anchored 234, contamination 54** (`§9.10` 27, `§9.13` 14, `§9.14` 13). My published 26/13/12 = 51 reconciled only against the *old* 230.
⛔ **AND THE CONTROL IS NOT CLEAN: `§9.99` returns 1, not 0 — the hit is THIS DOCUMENT'S OWN CONTROL SENTENCE.** ★ **The control passes only by excluding the measuring instrument from the population, and I never declared that.**
⚠️ **POPULATION: `*.md`. That excludes `§9.x` citations in tracked source — 27 across `*.ts/*.js/*.mjs`, NOT the 22 I wrote (22 is `server/` alone, while my own example list cited `poller.mjs`, outside it — two populations spliced in the bullet whose purpose is naming the population).** ⛔ **My *"20 `dist/` artifacts correctly excluded"* has no object: there are ZERO tracked files under `dist/` at the ref.**

### F3 — **TWO FAILURE MODES.**
| regime | targets | occ | what happens |
|---|---|---|---|
| **A — hollow but resolving** | §9.1 · §9.2 · §9.3 (each retains ≥1 clause) | **841** | pointer resolves onto a section that no longer says what was cited. **§4's check PASSES VACUOUSLY.** |
| **B — dangling** | rule 19 (`SCOPE:49` *"CUT, WHOLE"*) · §9.5 | **377** | **the pointer BREAKS.** |
⚠️ **REGIME B IS AN INFERENCE: the scope never says §9.5's heading is removed, and never defines Class A/B/C.** It rests on `SCOPE:52`'s 6,038 B matching `CLAUDE.md:500-529` (re-derived 6,039 B, line 500 = the heading). **DISPOSITION: §9.4 #1 — FOLD INTO THIS BATCH: Step 3 does not begin until the scope states it explicitly.**

### F3b — **A KEPT HEADING SERVES 29% OF §9.5's CITATIONS.** sub-citations `§9.5(a/a-ii/b/b-ii)` = **242**; bare `§9.5` = **99**. ⇒ ⛔ **a husk gives `§9.5(a-ii)` nothing — F3-A's failure inside my own fix for F3-B.** ⇒ **P1c.**

### F4 — **SIM APPLICABLE.** ⚠️ **CORRECTED EVIDENCE: `SIM:938`/`:957` are untouched by the cuts and were the wrong citations.** The real evidence: **SIM carries 6 anchored `§9.5`, 3 `§9.3`, 10 `§9.1`** — several dangling under regime B. ★ **Right verdict, wrong citations, in a finding series about citation integrity.**

### F5 — **`SYSTEM_MANUAL:517`** — *"GOVERNANCE LESSON (now `CLAUDE.md` §9.5)"* — **dangles if regime B holds.**

### F6 — **`#339` NO-TRIM** at risk under regime B unless P1+P1b+P1c land. **`#564`** — this batch is it, applied to §9.

### F7 — **`bridge/canonical/`: 14 files, ZERO coverage** (control run). ⇒ no original-intent record; provenance is git history + `_archive/CLAUDE_MD_RULE_HISTORY.md`.

### F8 — CENSUS. **Population: this repo; Langston's own `CLAUDE.md` and server-side scripts are outside any local grep.**
Writers: four sessions by hand. Readers: the harness + **1,218 markdown + 27 source citations**. Programmatic mutator: **`fresh-rules.mjs:124`, exactly one.**
⛔ **DELETER — REFUTED, by that same component.** `git checkout <ref> -- CLAUDE.md` is a whole-file replacement; its own comment records it *"reverted my commit's content in the working tree"*. ⚠️ **I called it a mutator in one row and asserted no deleter in the next.** *(Guards at `:101`/`:111`.)*
⚠️ `config.mjs:31` `HOUSEKEEPING_ONLY_BASENAMES` **does** key off `CLAUDE.md`. ⇒ **no automated reader validates a citation.**

### F9 — ⛔ **RETRACTED: no renumber cascade.** `CLAUDE.md:161` = `11. *(removed)*` — a rule was cut whole, the hole left explicit, 12-29 unrenumbered. ⚠️ **n=1, and it is FIVE WEEKS OLD (`b3d9b8bcb`, 2026-07-24) — I called it "the established practice" and PART 3 called it "years-deep". Both overstated.** ⚠️ **My "840 across rules 1-29" was unreproducible (866 anchored / 810 line-based / 1,674 unanchored).** ✅ **What survives: the explicit hole is the right FORM, and it should cite `:161`.**

### F10 — ⛔⛔ **SUBSTANTIALLY WITHDRAWN. THE LEDGER REFUTES IT, AND F6 SAYS I SEARCHED THE LEDGER.**
I claimed `#749` is a **NEW FEATURE** on the comms send path, strengthening a change-class challenge, and blamed `SCOPE:95` for a wrong reading.
⛔ **`SCOPE:95` WAS CORRECT** — it says the code *"already stamps every chunk of a Langston-addressed post"*, which is exactly what `discord_common.py:251-256` does. **Blaming it would have sent a reviewer to "fix" a correct line.**
⛔ **AND `#749`'s OWN ENTRY SETTLES IT (`RUNNING_ISSUES:3076`): *"THE FIX IS NARROW AND THE MACHINERY ALREADY EXISTS … One conditional is drawn too narrowly. No new subsystem."* Kyle, `:3079`: *"widen the same message method."*** ⇒ **it is a WIDENING of existing per-chunk stamping — a modification, not a new feature.**
★★ **This is a §9.5(b-ii) miss inside a document whose F6 row asserts the ledger was searched. The rule exists precisely to stop this, I invoked it, and I still filed the finding.**
✅ **RESIDUAL, and it is much smaller: the batch still edits live comms code, so the change-class deserves one line of confirmation from Langston — not a challenge.** **DISPOSITION: §9.4 #5 — WITHDRAWN, carrying `RUNNING_ISSUES:3076` + `:3079` as the citations that dissolve it.**

### F11 — ★★ **NEW AT r3, AND IT IS A HARD PREREQUISITE THE AUDIT NEVER MENTIONED.**
**`PHASE_19_PLAN.md:448`** places **`B-EOL-NORMALISE` (#751) at position 6 with: *"**Before the slim**: the cap and the delivery-chunk figures are PER CHECKOUT until this lands, so the slim's byte targets are unreliable without it."***
⇒ ⛔ **THIS AUDIT IS BUILT ALMOST ENTIRELY ON BYTE MEASUREMENTS, TRIPPED OVER CRLF THREE TIMES IN ONE DAY, AND THE WHOLE-BATCH VERIFICATION (`SCOPE:125`/P9) IS A BYTE DELTA — precisely the figure the plan declares unreliable until #751 lands.**
**DISPOSITION: §9.4 #1 — FOLD INTO THIS BATCH as a sequencing constraint: `B-EOL-NORMALISE` lands FIRST, or the slim's verification is not decision-grade.**

---

## PART 2 — THE IMPLEMENTATION PLAN

| # | item | falls out of |
|---|---|---|
| **P0** | ✅ **`B-EOL-NORMALISE` (#751) LANDS FIRST — ALREADY TRUE: it is queue position 6, the slim is 9.** Recorded as a stated precondition on the verification, **not a re-ordering**: every byte figure in this audit is PROVISIONAL until it lands. | **F11** |
| **P1** | Regime-A cut clauses leave a forwarding pointer at their section | **F3-A** + the `§2` precedent |
| **P1b** | Regime B: `§9.5`'s heading survives as a husk; `rule 19`'s number as an explicit hole **in the form of `CLAUDE.md:161`** | **F3-B**, **F5**, **F9** |
| **P1c** | **The husk carries the four sub-labels as named pointers** — a bare heading serves 99 of 341 | **F3b** |
| **P1d** | ★ **Carry-across item 2 (trigger breadth) lands ON the §9.5 husk** — a rule that must fire unprompted stays in `CLAUDE.md` (`SCOPE:107-108`), and the husk is a legal host | **r3** — ⛔ **my P6b claimed this was a contradiction needing Langston. It is not: P1b/P1c already solve it. WITHDRAWN, §9.4 #5.** |
| **P2** | §4 gains: follow ONE real inbound citation per cut clause and confirm it still supports the citing sentence | **F3-A** |
| **P2b** | ⚠️ Stated limit: samples ~6 of **1,245** (1,218 md + 27 source). No automated reader exists. **§9.4 #4, scheduled review at close.** | **F8** |
| **P3** | SIM content update — **on the 19 dangling §9.x citations, not `:938`/`:957`** | **F4** |
| **P4** | System Manual — `:517` re-aimed | **F5** |
| **P5** | `_archive/CLAUDE_MD_RULE_HISTORY.md` takes the evicted evidence | **F7** |
| **P6** | Execute the cuts per the approved scope | ⚠️ **`UNAUDITED` as to WHICH clauses — the scope's determination. Audited as to consequence.** |
| **P7** | Nearest-paraphrase step per cut, before the cut | ⚠️ **`UNAUDITED` — Langston condition (iii)** |
| **P8** | Class C: `#749`, `#750` | ✅ **`#749` is a narrow widening (F10) — no longer flagged.** ⚠️ **One line of change-class confirmation still wanted.** |
| **P9** | Re-measure after the cut — ⚠️ **using the EXISTING per-file instrument in the same log, not `wc -c`** | **F1** |
| **P10** | Update the skill-count check — Class C builds a thirteenth | **P8** |

---

## PART 3 — PLAIN LANGUAGE

**Three review rounds. Each found roughly ten real errors, and the third still found eleven — several inside the paragraphs correcting the same kind of error one line earlier.** That is the honest headline: **this stopped because it hit the round limit, not because it came out clean.**

The rules file is **about 64% of what a session reads before starting work** — the conclusion held, while my way of getting there was wrong twice.

**The two things worth your attention:**

**I filed a concern that our own records already answered.** I flagged that part of this batch adds something new to the live messaging code. **Our issue log says plainly that it's a narrowing fix to code that already exists** — and my own audit claims to have searched that log. The rule I invoked exists specifically to stop that.

**And this audit never named a dependency it rests on.** Another queued item fixes a line-ending problem that makes file sizes differ depending on which copy of the repo you look at. **The plan already puts it ahead of this batch, so nothing needs to move** — but the audit did not say so, and its numbers are provisional until that lands. **This audit is built almost entirely on file sizes, and I hit that exact problem three times today.**
