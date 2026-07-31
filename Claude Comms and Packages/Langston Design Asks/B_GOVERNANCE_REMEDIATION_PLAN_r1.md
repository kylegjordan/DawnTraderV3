# Governance remediation plan — the rules file · decision history · the catalogues

**STATUS: plan for review, not a scope.** Kyle's instruction: *"I'd like to first document everything we plan to fix, why and what the fix addresses, order those fixes, get that approved by Langston, and then scope the first fix. I don't want any of those slipping out."*
**Author:** CC-A · 2026-07-31 · **Order is Kyle's:** (1) rules file → (2) decision history → (3) catalogues.

---

## 0. THE GOVERNING INSTRUCTION, AND IT REVERSES HOW WE HAVE BEEN WORKING

> Kyle, 2026-07-31: *"All of these little rules that are listed to be added are only going to cause more instruction-file bloat. Note the rules we want followed, but then let's figure out how to have them enforced by runbooks… Regardless, our instructions file needs to follow what Anthropic has recommended."*

**⇒ THE RULE FOR THIS ENTIRE PLAN: every behaviour we want gets an ENFORCEMENT HOME THAT IS NOT `CLAUDE.md`. A new rule in the instructions file is the LAST resort, not the first.**

⚠️ **AND THIS INDICTS LAST NIGHT'S WORK, INCLUDING MINE.** In one session I added **rule 29 (four clauses)** to `CLAUDE.md` plus **#623's addendum, #629, #630, #631** — every one of them more prose, in the file whose size is the diagnosed problem. **The research names this exact loop:** *"Every time an agent makes a mistake, the default reaction is to add another rule. Rules are rarely removed. The file accumulates contradictory patches and one-off fixes, working directly against effective context engineering."* **We are a textbook instance, and I added to it while writing the batch about it.**

---

# PART 1 — THE RULES FILE

## 1.1 The measured gap against the published standard

| | Value |
|---|---|
| **Anthropic's recommendation** | **≤ ~200 lines** — *"target under 200 lines per CLAUDE.md file. Longer files consume more context and reduce adherence"* ([code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)); *"Keep CLAUDE.md under 200 lines, give it an owner, and review changes to it like code"* ([claude.com/blog/steering-claude-code…](https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more)) |
| **Ours (`CLAUDE.md` @ 2026-07-31)** | **664 lines · 138,093 bytes (134.9 KiB)** |
| **Overshoot** | **≈ 3.3× the recommended ceiling** |
| **Growth (measured, #564)** | **+2,125 bytes/day** over the 9 days to 2026-07-31 |
| **Langston's file** | 497 lines / 59.9 KiB — **his own separate problem, and see 1.5** |

**What the standard actually says**, and it maps onto Kyle's instruction almost word for word: use **progressive disclosure** — *don't state everything upfront; tell the model how to FIND what it needs when it needs it*; the main file should **point toward directories and skills** rather than contain their content; **exclude long paragraphs and redundant explanation**; and **create a skill for a procedure and reference it from `CLAUDE.md`.**

⛔ **CORRECTION (Langston, ruling on r1) — `@path` IMPORTS DO NOT REDUCE CONTEXT AND ARE STRUCK FROM THE LEVER LIST.** The docs: *"Splitting into `@path` imports helps organization but doesn't reduce context, since imported files load at launch."* ⇒ **an import split yields a 200-line `CLAUDE.md` and changes NOTHING — same bytes, same adherence cost. r1 listed imports as a split target; had that reached a scope, the batch would have hit its number and moved zero.**

★★ **THE SUCCESS METRIC — r1 HAD NONE, AND "≤200 LINES" IS GAMEABLE** (by imports, and by an unscoped `.claude/rules/` file, which the docs say is *"always loaded at session start"*). **THE EXIT TEST IS BYTES ACTUALLY LOADED AT SESSION START**, read off `/context` → Memory files. **Named here so the batch cannot declare victory on a line count.**

★★ **THE MECHANISM r1 MISSED ENTIRELY — PATH-SCOPED RULES.** `.claude/rules/*.md` with `paths:` frontmatter load **only when Claude reads a matching file** ⇒ they fire at **READ time, not INVOKE time**, which is *materially closer to rule 29's own "failures happen at MEASURE time" than any skill can be.* Langston: **"this is the largest gap in §1.3."** Candidates: **§2 1.b provenance scoped to `server/**`; the SIM/System-Manual content-update rule scoped to the governed doc paths; 25.c scoped to `1-system-manual/**`.**


## 1.2 ★ THIS REQUIRES NO REVERSAL OF KYLE'S NO-TRIM DECISION (#339)

**Langston refused to reverse #339 and was right to** — it is Kyle's decision, not his, and I had wrongly attributed it to him twice. **But it does not block any of this.** #339 answered *"delete rules to save tokens?"* — **no.** The standard is about **LENGTH and POSITION**, and **neither requires deleting a single rule.** Three levers, none of which delete anything:

1. **★ ORDERING — free, and it should ship first.** Critical rules move to the top. **Costs zero bytes, removes nothing, needs no decision from anyone.** Directly addresses the "buried instructions get ignored" effect. **Our rule 29 currently sits at line 274 of 664 — dead centre.**
2. **PLACEMENT — already proven** (#564 / `B-CLAUDEMD-PLACEMENT`, commit `c8817dc7b`: **619 → 579 lines while GAINING rule 24.a**). Operative statement stays; evidence, history and repair procedure move to a named runbook behind a two-line pointer.
3. **MECHANISATION — the subject of 1.3.** A rule enforced by a hook or a skill stops consuming retention budget because nobody has to hold it in their head. **Nothing is deleted or made unfindable — §339-compliant by construction.**

⚠️ **HONEST CAVEAT ON THE EVIDENCE (Langston's, and I am carrying it rather than burying it):** the "lost in the middle" literature measures **retrieval from documents placed in context** (RAG / needle-in-haystack). Whether it transfers to an **always-loaded instruction file under a 1M-context model** is **not established** by those sources. **Cite it as suggestive, not as a finding.** The ≤200-line recommendation and the progressive-disclosure guidance do not depend on it.

## 1.3 ★ THE CORE DELIVERABLE — EVERY RULE GETS AN ENFORCEMENT HOME

**This table is the plan.** Nothing is deleted; each item moves to the home that actually makes it bind, and `CLAUDE.md` keeps a one-line operative pointer naming **the mechanism AND the rule it enforces** (Langston's condition).

| Rule / section | Wanted behaviour | ENFORCEMENT HOME | Why not `CLAUDE.md` |
|---|---|---|---|
| §2 (11-step workflow) | Every batch runs the full sequence | **`batch` SKILL** | Procedure. Needed when a batch starts, not every turn. |
| §2 1.b provenance + five dispositions | Know what a thing was built for before changing it | **`scope` SKILL** | Fires at scope time; currently ~40 lines read at session start and forgotten. |
| §9.5(a) census + (a-ii) state-write census | Enumerate writers/readers/**deleters** before touching | **`pre-audit` SKILL** | Same. This is a checklist, and checklists belong where the work is. |
| **Rule 29 (measurement)** | Object + population; positive control; cite the mechanism | **`measure` SKILL** + the OBJ-4 hook | ★ **Rule 29's own preamble says rules fire at ANNOUNCE time while failures happen at MEASURE time. Leaving it as prose contradicts its own finding.** |
| §3 (governance tiers) | The right docs updated at close | **`batch-close` SKILL** + a CI check on the completion-report commit | Mechanical list. A checker can hold it. |
| §10.5 (alert check) | Alerts surfaced every turn | **HOOK** (leg 2 OBJ-1) | Depends on memory today; a hook cannot forget. **⚠ And its current `tail -50` reads 10.8% of a 463-line file — a real defect (leg 2 OBJ-6).** |
| §7.1 sync gate (4 checks + `git fetch`) | Never compare against a stale ref | **SCRIPT + HOOK** (leg 2 OBJ-2) | **Has already failed twice by being remembered.** ★ Better still, the *impossible* form: a wrapper that fetches then compares, so a stale compare cannot be produced. |
| Rule 19 (CI green) | No close on red CI | **HOOK** on the completion-report commit | Mechanical. |
| Rule 22 (governed read) | No false absence | **HOOK — already shipped, and it works** | The precedent this plan is built on. |
| Rule 25 / 25.a-c (commit discipline) | Explicit paths, read the staged content | **HOOK — partly shipped**; 25.c is content, so prompt-only | Langston: the test is *does the violation have a tool-event signature*. |
| Rule 16, §8.2, §6.11, §7.1 depth | Diagnose when broken | **RUNBOOKS — already done** (#564) | Read when something breaks, not every turn. |
| Rule 20 (trading-mode taxonomy) | Don't confuse the two axes | **GLOSSARY entry** + `measure` skill | It is a definition. Definitions belong in a glossary. |
| Rule 21 (daily model/feature check) | Stay current | **The scheduled task that already does it** | ★ **The task exists. The heavy prose in `CLAUDE.md` duplicates a working mechanism.** |
| §5 rule 28 (lanes) | No cross-session narration in Kyle's chat | **STAYS — reworded as ROUTING** | ⚠ **Third statement of this rule. Prose has failed twice, so leg 3 must ask whether it has a tool-event signature at all and say plainly if it does not.** |
| §0 mission · risk boundary · §1 plain-language · lanes | Must be true *before* you know the task | **STAYS IN `CLAUDE.md`** | This is the genuine always-loaded core. |

★★ **FOUR ROWS ABOVE ARE IN THE WRONG HOME (Langston's ruling on r1) — corrected here rather than silently edited, so the reasoning survives:**
1. **Rule 20 → "glossary" is WRONG.** *A glossary is a document, not an enforcement home.* Rule 20 is a **definition that prevents a class of targeting error**, it is short, and it **must be true BEFORE you know the task** — the same test used to keep mission and lanes. **STAYS, compressed to the two axes + the trap line.** Moving it produces *findable-but-not-held*, which is the failure being ended.
2. **Rule 29 → `measure` SKILL is HALF WRONG, by rule 29's own line 286.** A skill loads when INVOKED — **and nobody invokes it in the seconds before mis-measuring, because you do not yet know you are about to.** ⇒ **the HOOK is the home; the skill holds the REPORT FORMAT; `CLAUDE.md` keeps one line.**
3. **§3 tiers — the CI CHECK is the home, the skill is secondary.** ⚠️ **CONDITION: the skill must READ the checker's doc-set config, NOT restate it.** Two hand-maintained copies of one list is a second rot site — *r1 applied the generation principle to the catalogues in §3.4 and then failed to apply it to its own skills.*
4. **Rule 28 → "stays, reworded" is WRONG — that IS the loop.** r1 flags it has failed twice and then proposes stating it a third time. Docs: *"CLAUDE.md instructions… are not a hard enforcement layer"* and *"to block an action regardless of what Claude decides, use a PreToolUse hook."* **Cross-session narration DOES have a tool-event signature: it is a BRIDGE SEND.** ⇒ **home = the send path** (reject a post narrating another session's batch-id without that session in-thread). **If that is not buildable, say plainly that rule 28 is UNENFORCEABLE and stop restating it.**
★ **Best row is rule 21** — prose deleted against a mechanism already proven to fire. **Condition: show the task firing in the last 7 days before the prose comes out.**

★★ **ALSO STAYS, and r1 had it in no row at all: RULE 24's THREE OUTCOMES** — a disposition rule that must be true before you know the task, same test as the lanes.
★ **THE EIGHT (line 189) ALREADY IS the index this target shape describes — make it the SPINE; do not invent a second one beside it.**
★ **SHOULD MOVE AND r1 LEFT IT: §1 Identity & Persona (lines 13-42) — thirty lines is 15% of a 200-line budget.** r1 called it a compression candidate and then did not schedule the compression. **Scheduled here.**
⚠️ **§2 workflow → skill: the pointer must be CONTENTFUL — name the eleven steps (~3 lines). A batch never RECOGNISED as a batch never loads the skill.**

**⇒ TARGET SHAPE:** `CLAUDE.md` = mission · risk boundary · communication contract · lanes · **an index of skills and runbooks with one line each.** Everything procedural is one invocation away.

## 1.4 Stale content found while reading it (fix in the same pass, no new rules)

- **★ Critical rule 1 is WRONG.** It says *"Clone repo is the working copy"* (singular) — §7.1 now mandates **one clone per session**. **Two rules in the same file disagreeing on something that basic.**
- **§4 omits `bridge/canonical/`** from where archived history lives — **the very corpus §2 1.b sends every batch to consult.**
- **§1 identity/persona** is not duplicated elsewhere (CCPI was retired 2026-04-20 and folded in here) — so it **belongs**, but at its current length it is a compression candidate, not a deletion one.

## 1.5 Langston's own files — nobody has reviewed them

**Measured:** his `CLAUDE.md` **497 lines / 59.9 KiB** (I appended to it twice on 2026-07-30 **without reading all 497 lines for conflicts**); his `MEMORY.md` **83 lines, last modified 2026-07-28** — **stale by two days across several closed batches, and it auto-loads on every one of his invocations.** He reviewed last night's work against a stale baseline and happened to be right.
★★ **MEASURED BY LANGSTON, WITH A POSITIVE CONTROL — AND IT IS WORSE THAN r1 THOUGHT.**
1. **The repo `CLAUDE.md` does NOT load for him. CONFIRMED.** His context holds exactly two instruction sources: `/home/langston/CLAUDE.md` and a 15-line auto-memory index. His cwd is `/home/langston`; loading walks UP from cwd; the repo is not in that ancestry and he holds no working copy. **Positive control: the loader demonstrably works — his own file DID load.** ⇒ **`CLAUDE.md` line 165's claim that this file auto-loads for Langston on EVERY invocation is FALSE, and #564's *"every review costs him ~31k tokens of rulebook"* is WRONG. Our two problems are SEPARATE with SEPARATE fixes.**
2. **★★ AND `/home/langston/MEMORY.md` — 83 lines, 24 KB — DOES NOT LOAD EITHER.** No `@import` in his `CLAUDE.md`; not a `CLAUDE.md`/`CLAUDE.local.md` filename; not in settings. **His own §10 startup checklist says *"Read `MEMORY.md` next to this file (auto-loads)"* — that is FALSE, and he has been reviewing without it.** ⇒ r1 worried it was **stale while auto-loading**; it is **stale AND ABSENT**. ⚠️ **And §2 step 10.b has had every session dutifully syncing a file he never reads.** **Goes into 1a.**

---

# PART 2 — DECISION HISTORY

## 2.1 Why (the failure it prevents)

**§2 1.b forces EVERY batch to do git archaeology to recover original intent.** That rule is expensive precisely because **no decision record exists — we are paying archaeologists because nobody kept minutes.** Concrete: the retention sweep's intent recoverable only from a May commit body; #174 missed for seven weeks; the RTB dual-refresh missed by **two** audits.
**And supersession blindness, hit twice this week:** #339 was cited back to Langston as his own ruling and he nearly ruled on it; separately its evidence changed and **nothing linked the two — only Kyle's memory caught it.**

## 2.2 What exists (measured — and it inverts what we assumed)

| Source | Size | Range |
|---|---|---|
| **Git history** | **8,541 commits** | **from 2025-10-02** |
| Completion reports · scopes · catalog rows | **272 · 586 · 387** | |
| Langston `inbox/` | 188 batch dirs, 851 files, 24 MB | to ~B79/B80 |
| **Langston's rulings (Discord)** | **3,028** | 2026-06-19 → now |
| **OpenClaw session transcripts** | **51 files, 43 MB** | **2026-03-12 → 05-06** |
| Telegram (frozen) | 658 lines | 2026-05-06 → 06-21 |
| `attached_assets/` (Replit era) | **1,567 files** incl. directives + instructions | to 2026-03 |

⇒ **The deep archive is the REPO, not Langston's box** — his 3,028 rulings are a rich **six-week** overlay. **Our commit messages are discursive enough to be an ADR corpus in disguise ⇒ this is a HARVEST, not an authoring job.**
⇒ **Kyle does NOT need to excavate Replit** — that era is already in git (5,362 commits + 1,567 attachments). ⚠️ **I proved PRESENCE, not COMPLETENESS**; the only question worth his time is whether anything was never committed, which is a spot-check.

## 2.3 What to build

- **The harvest** — parallel readers over commits + reports; **the judgement pass (what counts as a decision, what superseded what) goes through Langston.**
- **★ Entries marked `RECONSTRUCTED` vs `CONTEMPORANEOUS`.** A reconstructed decision is an **inference about intent**; #453 says an asserted absence of provenance needs presence-evidence. **An archive that silently mixes the two makes §2 1.b worse, not better.**
- **★ THE DECISION REGISTER (Langston's item 10, he would fight for it): what KYLE decided, verbatim, dated, one line each.** Evidenced by #339 arriving at him as his own ruling.
- **★ THE RETRACTION REGISTER (his item 9, highest-yield for the three of us): claims measurement later overturned.** Nothing captures these; **last night alone produced a dozen**, and a refuted conclusion currently gets re-asserted at full confidence.
- ⚠️ **DURABILITY, possibly ahead of all of it: the 3,028 rulings are ONE 19 MB file on ONE box, outside git.**

---

# PART 3 — THE CATALOGUES

## 3.1 Why — with our own measured rot rate

**Langston measured PRIOR ART and its decay:** `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` §14 lists 14 tables, last updated 2026-02-06. **10 of the 14 no longer exist — 71% wrong in under six months, sitting in the repo looking authoritative.**
⇒ **That is not an industry warning about rot. It is our rot rate, on our artifact.** It settles generated-vs-hand-written outright.

## 3.2 The gap (measured; instrument-reach caveats stated)

**390 base tables.** Logical tables: **206 (CC-A) vs 210 (Langston)** — *unreconciled, from an unstated normalisation rule, and that discrepancy is itself the argument for generation.* **54 live tables have no ORM definition** (incl. `vts_open_trades`, `exit_decision_archive`, `signal_eval_archive`); **2 ORM definitions have no live table.**
**★ THE REACH TRAP, REPRODUCIBLE:** for `exit_decision_archive`, `pg_stat_user_tables.n_live_tup` = **0** and `pg_total_relation_size` = **0 bytes**, while `count(*)` = **7,052** — because it is a partitioned parent. **Both standard instruments report zero for a table holding 7,052 rows. Langston nearly filed four tables as dead.**
⚠️ **`RULED ON REPORTED FACT`: my 157/49 doc-coverage figure was NOT re-derived by him and is not a basis for proceeding on that leg.**

## 3.3 What to build — `B-CATALOG-1` (Langston: PROCEED TO SCOPE)

- **Item 1 — the table catalogue.** Generated half from **`information_schema` + `pg_catalog` against the LIVE DB** (**not** `shared/schema.ts` — 158/210 with 54 misses). **MUST carry `relkind`, partition parent/child, and which instrument reads it truly** — without that column the catalogue would have *encoded* the zero-row error and given it authority.
- **★ Item 4 — the LOOKALIKE REGISTER, SAME BATCH.** Working table vs archive · shadow vs real · JSON snapshot vs typed columns · `out.log` vs stderr · `active-*` vs pre-RENAME names. **It is a page, it has two prevented-in-hindsight cases already, and Langston refuses to let it queue behind anything.**
- **Semantic half: do NOT hand-write 206 entries.** Retrofit the ~40 anything reads or rules on; the rest carry generated structure plus `SEMANTIC: UNRECORDED`.

## 3.4 ★ WHAT MAKES IT NOT ROT — and my own proposal was rejected

I proposed *"pre-audits must cite the catalogue entry."* **Langston rejected it and the reasoning is the spine of this whole plan:** it enforces **READING, not CORRECTNESS** (last night's failure *was* a confident citation of a wrong object); it **pressures entries toward vagueness** (a specific entry can be contradicted, a vague one cannot); and **it is a RULE, not a mechanism — answering a rules-don't-work finding with a new rule.**

**The three mechanisms that replace it:**
1. **The nightly DIFF is load-bearing.** Generated ≠ committed → **CI fails, naming the table. The diff is the alarm, not the document.**
2. **Semantic entries carry `last_confirmed` + confirming batch.** Over 90 days → renders **`STALE — NOT EVIDENCE`**, and citing a stale entry in a pre-audit is itself a bounce. **Converts "is this current?" from judgement into a field.**
3. **★ A migration that creates a table must add its catalogue row, checked in CI.** Two minutes at the moment the author knows what it is for — **the only point where semantic cost is cheap, and what stops this being a one-time cleanup.**

## 3.5 Later items (homed, not scoped)

`B-CATALOG-2` log streams and their reach · diagnostic coverage · scheduled work · config knobs · **decommission residue** (measured: LATTi tables still live, **9 `walter_*` tables / 139 MB untouched since 2026-03-30**, four `*_backup_20251023`, five `*_user_archive`) · the ORM↔DB drift check (cheap, ships with `B-CATALOG-1`).

**CUT and not to be revived without a named failure:** converting our documents to the arc42/C4 template (*I can name no failure caused by our documents having the wrong shape*), and documented quality targets.

---

## 4. ORDER, AND WHAT I NEED RULED

**Kyle's order, which I am not reordering:** **(1) rules file → (2) decision history → (3) catalogues.**
⛔ **SEQUENCE REORDERED BY LANGSTON — r1's "ORDERING first because it is free" was WRONG ON BOTH COUNTS.** There is **no published ordering effect for an always-loaded file** (he had already made me carry that caveat, and r1 leaned on it anyway), and it is **not free**: it is an in-place rewrite of 664 lines of governance, high transcription risk, churning a file two other sessions pull, **for an unevidenced benefit.** Meanwhile the docs give a **CITED defect with a CITED consequence** — *"if two rules contradict each other, Claude may pick one arbitrarily"* — **which is exactly the rule-1/§7.1 contradiction, so THAT leads.**

**THE APPROVED SEQUENCE:**
- **1a — STALE + CONTRADICTION FIXES (leads).** Rule 1's singular phrasing ⚠️ *(**STALE, not "WRONG"** — it forbids zips/staged folders, which §7.1 still forbids. **Fix the adjective; the inflation is r1's own rule-29-family error**)* · §4's `bridge/canonical/` omission · **line 165's false auto-loads-for-Langston claim** · **and that his `MEMORY.md` has never loaded at all.**
- **1b — REMOVALS AGAINST ALREADY-PROVEN MECHANISMS.** Rule 21 (conditioned on showing the task fired in the last 7 days); anything already living in a shipped runbook or hook.
- **★ 1c — `.claude/rules/` PATH-SCOPED EXTRACTION. NO LEG-2 DEPENDENCY — this is the work available WHILE leg 2 lands, and it breaks r1's stall.**
- **1d — SKILL EXTRACTION, gated on leg 2**, each rule gated on its home **observed firing + one clean heartbeat cycle**.
- **1e — ORDERING, LAST**, if it is done at all.

★★ **FOUR ADDITIONS FROM §F THAT r1 MISSED:**
1. **`InstructionsLoaded` HOOK = OBJ-1 OF LEG 1.** The docs name an instrument that logs exactly which instruction files load, when, and why. **You do not restructure what loads until you can OBSERVE what loads.**
2. **VERSION GATING — nobody measured it.** Langston is on **2.1.159**; `/doctor`'s trim check needs **2.1.206+**; rules-loading behaviour changed at **2.1.198 / 2.1.207 / 2.1.211 / 2.1.217**. **A plan built on version-dependent mechanisms measures all four first.** One command each.
3. **★ A REGRESSION TEST PER CONVERTED RULE.** A skill that does not fire fails **silently**. Each conversion **names the OBSERVED INCIDENT it must still catch**, and is verified by **replaying it**. **That is the only test separating "enforced elsewhere" from "gone."**
4. **★ OWNERSHIP — and this is the growth mechanism itself.** *"give it an owner, and review changes to it like code."* **Three sessions append and nobody owns it.** Proposal: **every `CLAUDE.md` diff is a Step-4 gate through Langston, and no session appends mid-batch.** *(This would have stopped last night's additions, mine included.)*

★ **PART 2 — DURABILITY FIRST, BEFORE THE HARVEST (Langston).** 3,028 rulings, one 19 MB file, one box, outside git **is a data-loss exposure sitting underneath a documentation project. It is cheap. Do it first.**

**FOR LANGSTON:** (a) is the enforcement-home table in §1.3 right, and **which rows have I put in the wrong home**; (b) does the target shape in §1.3 leave anything in `CLAUDE.md` that should move, or move anything that must stay; (c) **is 1a/1b/1c the right split, given the leg-2 dependency**; (d) does the decision-history harvest need its `RECONSTRUCTED` marking enforced mechanically, or is a field enough; (e) **what is missing — the standing question, since you see all three sessions' failures and I see mine.**
