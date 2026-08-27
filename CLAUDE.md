# Claude Code — DawnTrader V3 Project Instructions

> Auto-loaded into every Claude Code session. Holds the stable rules: identity, workflow, governance, communication, canonical paths, critical invariants. Current project state (current batch, recent findings, next step) lives in your session's memory store — `~/.claude/projects/<your-project-slug>/memory/` (see §3.1; the slugs are junctioned onto ONE store). Rule origin stories + empirical backstories live in `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` (referenced as "see history doc §X" below).

---

## 0.a ⛔⛔ THE WORKFLOW — **ELEVEN STEPS. READ THE STEP'S FILE BEFORE YOU DO THE STEP. EVERY TIME.**

> ★★ **ANY TIME YOU ARE WORKING A BATCH OR A PHASE, OR ITERATING WITH LANGSTON, THESE ARE THE ELEVEN STEPS YOU MUST FOLLOW — AND YOU READ THE STEP'S FILE BEFORE WORKING IT.** Not from memory. Not from this table — **this table is only the NAMES AND THE ADDRESSES.**

| # | step | ⛔ READ THIS BEFORE WORKING THE STEP |
|---|---|---|
| **1** | Planning + Scope | `.claude/skills/workflow-01-scope/SKILL.md` |
| **2** | Pre-Implementation Audit AND Implementation Plan | `.claude/skills/workflow-02-audit-and-plan/SKILL.md` |
| **3** | Implementation | `.claude/skills/workflow-03-implementation/SKILL.md` |
| **4** | Code Review — Langston, at the graded ref | `.claude/skills/workflow-04-code-review/SKILL.md` |
| **5** | GitHub Push + CI — 4/4 green | `.claude/skills/workflow-05-ci/SKILL.md` |
| **6** | Staging Deploy — `dt-deploy` | `.claude/skills/workflow-06-deploy/SKILL.md` |
| **7** | First-Pass Verification — CC, UI navigated | `.claude/skills/workflow-07-verify-cc/SKILL.md` |
| **8** | Second-Pass Verification — Langston | `.claude/skills/workflow-08-verify-langston/SKILL.md` |
| **9** | Iterate until every objective is green | `.claude/skills/workflow-09-iterate/SKILL.md` |
| **10** | Governance Updates | `.claude/skills/workflow-10-governance/SKILL.md` |
| **11** | Completion Report | `.claude/skills/workflow-11-completion/SKILL.md` |

⛔⛔ **NOT EVERY CHANGE IS A BATCH — AND THE FAST PATH IS *NOT* AN UNREVIEWED PATH.** An urgent live break runs the **HOTFIX PATH: `.claude/skills/workflow-hotfix/SKILL.md`** — the eleven steps miniaturised into one, **and Langston still reviews it BEFORE it reaches staging** (Kyle 2026-08-21). ⚠️ **BUILT 2026-08-21 BECAUSE IT DID NOT EXIST: "hotfix" appeared 256 times across the governance corpus and EVERY occurrence was a usage — there was no definition, no qualifying test and no steps**, so the fast path was whatever the session in a hurry decided it was. **Read the qualifying test BEFORE declaring one; if in doubt it is a batch.** ★ It is also the missing half of **rule 23** — which orders a "mini-cycle through Langston" and never said what one is.

★★ **THIS TABLE IS THE INDEX, AND IT IS THE *PRIMARY* TRIGGER (Kyle's design, 2026-08-21).** It auto-loads with this file on every start and every compaction, so a session always knows the eleven steps exist and where each one is written down. ⇒ **rules file → READ THE STEP FILE.** ★ **That route is an ordinary file read and needs NO skill machinery at all**, so the primary leg does NOT depend on skill auto-invocation — the mechanism that is measured-unreliable.
★ **THE BACKUP TRIGGER: each step file is ALSO A SKILL** (its own folder, its own `SKILL.md`), so the model may pull the right step in on its own. **Eleven independent triggers, not one** — that is the whole reason they are skills rather than plain documents. ⚠️ **The backup leg is a COIN FLIP and is never relied on** (five-plus open Anthropic issues; worst for skills overlapping trained behaviour, which is every step here). ⚠️ **A new skill registers only at a session START** — the backup leg is not live in a session that began before it was built.
⛔ **DESCRIPTION RULE, and it exists because the failure mode is CONFIDENT WRONGNESS:** eleven near-neighbour descriptions can fire the WRONG step, which is worse than firing none. **So every step's description leads with `STEP N ONLY`, names its own step in distinct words, and states explicitly what it is NOT for.** Keep it that way when editing one.
⛔ **AND NEVER PUT `“: ”` (COLON-SPACE) INSIDE A DESCRIPTION VALUE — IT SILENTLY BREAKS THE SKILL.** The frontmatter is YAML, so an unquoted value containing a colon-space is ambiguous; the parser drops the description and the app **falls back to the file’s first heading**. ⚠️ **MEASURED 2026-08-21:** `workflow-05-ci` and `workflow-07-verify-cc` both lost their descriptions this way — the two whose text read “branch head: TypeScript Check…” and “change works: PM2 logs…”. **NOTHING ERRORED. The files were valid, the frontmatter looked right, and the only symptom was the skill listing showing a heading where a description belonged** — which also silently disarms that skill’s auto-invocation trigger, the entire reason it is a skill. **Use a dash or a comma instead, and after editing any description CHECK THE SKILL LISTING rather than the file.**
⛔ **NO STEP DETAIL IN THIS FILE.** `§2` — which held the long version — was REMOVED on 2026-08-21, deliberately and completely. **Two copies is the #641 shape and the copy that loads always wins.** Do not reintroduce one.

---

## 0. Mission (read first, every session)

Grow the portfolio as much and as fast as possible, trading fully autonomously, **without ever compromising the risk tolerance Kyle has set.** The risk limits — kill-switch, daily-loss budget, position sizing, concurrency caps, EV/Net-Expectancy gating — are HARD boundaries that bound growth, never dials to loosen; **if growth and risk tolerance conflict, risk tolerance wins.** The edge is **selection, not frequency**: pick and size the single best signal from the ready-to-buy pool each cycle (honest ranking + EV gating + evidence-based calibration). **Pick right, size right, stay inside the risk envelope, compound.** (Full original framing: history doc §0.)

---

## 1. Identity & Persona

> **MOVED to `CONDUCT.md` sections 1-3 and 5-7 (B-CONDUCT-FILE, 2026-08-20) — it is AUTO-LOADED on every start, resume and compaction, so it now arrives BEFORE you act instead of being findable after. Nothing was deleted.**

Role, communication style, the plain-language mandate, the two-paragraph default, canonical terminology, the step-report shape, and the problem-solving disposition all live there now. **The expertise blurb was CUT, not moved** — it was a FACT list (it enumerated a strategy count), and facts drift while rules do not; that same enumeration went stale in Langston's own always-loaded copy, which B-RULES-1a caught asserting 18 strategies against the SSOT's 19.

**STAYS HERE — it is a PROCEDURE with a known trigger, not conduct:**
**ALWAYS post plain-language summaries in BOTH channels (Kyle directive 2026-05-25 — mandatory):** every plain-language summary goes to Discord `#general` (async visibility when Kyle is away) AND the Claude Desktop conversation (where he's reading at the keyboard) — same content, every time. The Desktop post is the primary delivery; the Discord post is the visibility side-effect + paper trail. See history doc §1.ALWAYS-POST for the failure-mode rationale.

---

## 2. *(REMOVED 2026-08-21 — the workflow lives in §0.a + the eleven step skills)*

⛔ **§2 held the long-form eleven-step workflow. Kyle removed it COMPLETELY: "there shouldn't be a second set of references to it."** Every step's full text moved, VERBATIM, into that step's own skill — see the §0.a table for the addresses. **Do NOT restate a step here.**
⚠️ **THIS HEADING IS A FORWARDING ADDRESS, NOT A SECOND COPY. It is kept because `§2` is cited 136 times across 107 files** — mostly frozen batch completion reports, which are historical records and are NOT rewritten. Deleting the heading outright would silently break every one of those pointers, which is the same absent-as-valid failure the citation was meant to prevent. **A citation to "§2 step 7" now means the step-7 skill.**
★ **The two governance rules that lived in §2's preamble were NOT step detail and did NOT move to a step** — batch/phase NAMING and the CHANGE-CLASS declaration bind every commit and every scope, not one step, so demoting them to a file that loads only at step 1 would be a real demotion. **They are relocated intact to §3 below** (Langston's standing condition: a single-homed rule may not be dropped or demoted without a named replacement landing in the same commit).

---

## 3. Batch Identity, Governance Documents & Memory Rules *(renamed 2026-08-23)*

> ⚠️ **RENAMED FOR THE SAME REASON AS §9, AND IN THE SAME COMMIT.** It read *"Governance Tiers & Mandatory Documents"* — but the tier LISTS moved into `workflow-10-governance` today, and what remains is three things that are NOT tiers: **§3.0 batch naming + change-class** (fires when a batch is CREATED) and **§3.1/§3.2 the memory-file rules** (fire at SESSION START). **The number is unchanged, so every `§3.x` citation still resolves.**

### 3.0 BATCH IDENTITY — NAMING + CHANGE-CLASS *(relocated intact from the removed §2 preamble, 2026-08-21)*

A batch is NOT done until every numbered objective from the scope is verifiably achieved in the staging UI and confirmed by both Claude Code and Langston.

> **Naming note (B65.2, 2026-04-23):** the 11 stages below are **steps**, not phases — system-phase references (Phase 15c, Phase 16, Phase 19) are unchanged.

> **Batch & phase NAMING convention (Kyle directive 2026-06-17 — B-GOV; the governance-checker parses this, so it is now a governed rule):** Phases = `Phase NN` (e.g. Phase 19). Batches = the phase-scoped form `P<phase>-B<n>` (e.g. `P19-B6`); **sub-batches** append a dotted suffix (`P19-B6.5a`); **letter-named** standalone batches use `B-<NAME>` (e.g. `B-NAMES`, `B-GOV`); the historical `B-NEW-NN` form stays valid. **Every code/governance commit for a batch carries its batch-id at the START of the commit subject** (e.g. `P19-B6 Step-3 ...`) so the checker can attribute it. **★ Do NOT put a CLOSED or not-yet-existent batch-id token ANYWHERE in a follow-up commit subject you are only REFERENCING (CC-A + Langston, 2026-06-25 — RUNNING_ISSUES #350).** The checker's `extractBatchId` matches a batch-id pattern ANYWHERE in the subject (not just the leading token — confirmed live: a mid-subject `B-GOV-4` reference fired 8 false missing-doc alerts), and grades it as a fresh batch-needing-docs. So for a follow-up that is NOT a fresh close of that batch (issue-homing, governance-ledger, soak-run), use a plain descriptor subject (`Governance ledger: …`) and reference any issue with `#NNN` or the batch-id in the BODY, not the subject. Lead with the ACTIVE batch-id only when the commit genuinely IS that batch's work. (Interim convention until B-GOV-4 lands the parser fix per #350 — which is now more urgent: it floods 8 alerts per stray reference.) **Exempt** (no batch tag needed): pure-housekeeping commits touching ONLY MEMORY.md, CLAUDE.md, or `Cross-Session Briefs/` — they are not code/governance pushes.

> **Change-class declaration in the scope header (Kyle directive 2026-06-18 — B-GOV-2; the governance-checker reads this):** every batch's scope file declares its change-class on a header line — `change-class: architecture | non_architecture | sub_batch | hotfix` — written at Step-1 so Langston reviews it before code exists. The checker grades the batch's doc-set against the declared class; an **undeclared (or unparseable) class defaults to the strictest set (architecture) + raises a flag** (fail-closed), and a declared class whose diff touches core engine paths is cross-checked (possible under-declaration → Langston). The class is amendable (a sub-batch that grows re-declares).

---

**⛔ THE PER-BATCH DOCUMENT SET LIVES IN `workflow-10-governance` — loaded at Step 10, NOT here. The enumeration was CUT on 2026-08-23 (Langston ruling (b)); DO NOT PUT IT BACK.**
**THE OBLIGATION, THE TRIGGER AND THE CONSEQUENCE STAY:** a batch is **NOT complete** until every **APPLICABLE** governance document has its **CONTENT** updated — **reorganising a document is NOT updating it** — the completion report’s governance-files-changed list is the checklist, and **a missing applicable entry REJECTS the close.** Tier-1 is unconditional every batch AND sub-batch; Tier-2 is judged EXPLICITLY, never skipped by default.
★ **THE INDEPENDENT DETECTOR IS THE GOVERNANCE CHECKER, not the completion report** (which the skipping session writes itself): `scripts/governance-checker/` runs ON STAGING, reads at `origin/migration/aws-supabase`, grades the doc-set against the DECLARED change-class from its own machine-readable table (`config.mjs:106-141`), and **raises a system alert on a miss.** ⚠️ **That table is why the cut is safe — the enumeration already had two homes and only the config enforced anything.**
⛔ **BUT DO NOT CITE THE CHECKER AS COVERAGE FOR WHAT IT CANNOT SEE (Langston, 2026-08-23, re-derived at the ref): its `DOCS` table has NO entry for `CLAUDE.md`, `CONDUCT.md` or `MEMORY.md`.** It detects a skipped governance DOC. **It is blind to four sessions colliding in shared PROSE** — that residual is still detection-by-Monday-review only. *(Full ruling + the three detectors + the staleness precedent: history doc §3-enumeration-cut.)*
**★ `1-system-manual/DELIVERY_BOARD_PROTOCOL.md` — THE DELIVERY BOARD (Kyle-directed 2026-08-03).** A GitHub Projects board — https://github.com/users/kylegjordan/projects/1 — is now the at-a-glance state of every batch, phase, hotfix and task: **columns = the workflow stage, plus Owner · Type · Issue (`#NNN`) · Review · Blocked-on on each card, and a plain-language description so a card explains itself.** ★ **THE CARD-UPDATE STEPS ARE FOLDED INTO THE 11-STEP WORKFLOW — see the protocol's §4 table; the card moves when the WORK moves, it is never a separate status to remember.** **The OWNER moves the card; LANGSTON sets `Review` (Kyle's decision).** ⛔ **HARD BOUNDARY: the board holds STATUS, OWNER, ORDER and the description — NOTHING ELSE. Every finding, citation and verdict stays in the repo and the card LINKS to it; evidence written into a card rebuilds the two-sources-of-truth failure this project keeps paying for.** ⚠️ **NOTHING AUTOMATES IT — an un-updated board becomes a confidently wrong second record, which is worse than none.** Depth, field values and the honest limits live in the protocol; this pointer is deliberately short (§4 placement rule).

### 3.1 MEMORY.md two-file pattern (Kyle directive 2026-04-29)

Two MEMORY.md files, kept in sync:

| File | Path | Role |
|---|---|---|
| **Truth** | `C:\Users\kyleg\.claude\projects\<your-project-slug>\memory\MEMORY.md` | What Claude Code auto-loads at session start. THIS GETS EDITED. |
| **Persistence copy** | `<your clone>\.claude\memory\MEMORY.md` | Mirror checked into git, pushed to GitHub. |

> **★ MEMORY IS SHARED; TRANSCRIPTS ARE NOT — link ONLY the `memory\` subfolder (corrected 2026-07-27).** Claude Code derives the project slug from the folder a session opened, so the three sessions have three slugs — `C--DawnTraderV3-old` / `-new` / `-analyst`. **The rule: only the `memory\` SUBFOLDER is junctioned to ONE shared store** — so a memory write from any session is immediately visible to all, one copy of each memory file — while **each session keeps its OWN separate transcript/conversation folder.** ⚠️ **What was wrong (being fixed):** an earlier setup junctioned the ENTIRE project folder (not just `memory\`) of all three slugs onto one store (the retired `G--My-Drive-…` folder). That over-shared — it commingled every session's transcripts in one place, made the app render all three as confusing **"forks,"** and risked sessions corrupting each other's history. It is un-tangled by the **session-fix (2026-07-27)**: each session gets its own real folder with only its own transcripts (sorted by traced fork-lineage) plus a memory-only junction; conversations are trimmed and backed up nightly to Google Drive. Full detail: `1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md` + `BUILD_METHOD_PLAYBOOK.md` §5.1. **Never re-junction a whole project folder to share memory — link `memory\` only.**

**Two-step update (non-negotiable):** (1) edit the user-cache MEMORY.md (truth file); (2) copy entire updated file to in-repo persistence path + commit/push in the same governance turn. See history doc §3.1 for rationale.

**★ PER-SESSION MEMORY SPLIT (Kyle directive 2026-06-19; auto-load added 2026-07-25).** Three concurrent sessions share ONE memory folder (the slugs are junctions — §3.1 top), so the harness-native auto-load of the file NAMED `MEMORY.md` is necessarily SHARED. Therefore: the shared `MEMORY.md` holds ONLY the **operational session-start commands + project-consensus truths** (edit surgically; coordinate any big change; RULES live in this file). **Each session's VOLATILE working-state lives in its OWN file: Claude Old (CC-A) → `MEMORY_CC_A.md`; Claude New (CC-B) → `MEMORY_CC_B.md`; Claude Analyst (CC-C) → `MEMORY_CC_C.md`** (each mirrors to `.claude/memory/`).

**★ EACH SESSION'S OWN FILE IS AUTO-LOADED — `.claude/hooks/load-own-memory.mjs` (SessionStart, `startup|resume|compact`).** The harness natively auto-loads only `MEMORY.md`; this hook fills the gap. It identifies the session by its clone folder (`DawnTraderV3-old|-new|-analyst` → CC-A|B|C), reads that session's `MEMORY_CC_<X>.md` (live truth-file via the hook's `transcript_path`, falling back to the in-clone `.claude/memory/` mirror), and injects its contents — on every start, resume, AND compaction. **Fail-open by construction:** unmapped folder or missing file → inject nothing, exit 0 (never worse than the old manual-read world; never blocks a session). So the three things that auto-load every start/compaction are: **CLAUDE.md (rules) + shared MEMORY.md (ops + truths) + your own MEMORY_CC_<X>.md (state).** Each session still **WRITES ONLY its own** file. The §3.2 200-line cap applies per file.

### 3.2 MEMORY HARD CAP — 200 LINES **AND** 24,576 BYTES, **PER FILE** (Kyle directive 2026-04-29; scope made explicit 2026-08-24)

⛔ **THE CAP IS PER FILE AND APPLIES TO EVERY MEMORY FILE — the shared `MEMORY.md` AND each session’s own `MEMORY_CC_A/B/C.md`.** ⚠️ **Stated at the top because the heading used to read "MEMORY.md hard cap", and the per-file clause sat at the end of §3.1 where a reader checking the cap would not see it (Kyle, 2026-08-24).**

**NO FILE MAY EXCEED 200 LINES *OR* 24,576 BYTES — whichever binds first, and it is usually the BYTES.** **WATCH BYTES, NOT LINES:** dense mega-paragraph lines blow past 24,576 B while comfortably under 200 lines, which is exactly how the breaches have happened. **Every update: check the size AFTER the edit; if over, prune BEFORE the commit.**
⚠️ **NOTHING ENFORCES THIS — it is checked by whoever is writing, which is why it has been breached repeatedly.** A session writing its own memory is the only thing standing between the file and the cap.

**★ How to keep a MEMORY file lean (Kyle directive 2026-07-01 — the discipline, short + simple):** the moment a batch CLOSES, collapse its whole blow-by-blow (scope → dispatch → review → deploy → verify) to ONE line in a "recent history" list — the repo completion report + scope files are the authoritative record, so memory only needs a pointer. Keep in full only: standing behavioral rules, identity/wake-arm, the ONE current/in-flight batch, and armed alerts. If it's already recorded in the repo, it does NOT belong in memory in longform. (Origin: CC-B's file hit 189KB — ~8× the cap — by retaining full narration of dozens of closed batches; collapsing them to one-liners cut it to 13KB with zero loss.)

---

## 4. Canonical File Locations (post-reorganization 2026-04-14)

**CLAUDE.md canonical location = repo ROOT `./CLAUDE.md` ONLY (Kyle directive 2026-06-15).** Claude Code auto-loads BOTH `./CLAUDE.md` AND `./.claude/CLAUDE.md` if present and CONCATENATES them (doubling tokens) — the two are interchangeable alternatives per the official docs, NOT a pair meant to coexist. A stale untracked `./.claude/CLAUDE.md` duplicate was removed 2026-06-15. **Do NOT recreate `./.claude/CLAUDE.md`** — keep the root file as the sole source. (Contrast: the MEMORY.md two-file pattern in §3.1 IS intentional — its truth file lives OUTSIDE the repo in the user cache, so the in-repo `.claude/memory/MEMORY.md` mirror is a real git backup. That reasoning does not apply to CLAUDE.md, which is fully in-repo either way.)

**★ PRE-GOVERNANCE / ARCHIVED HISTORY — `bridge/canonical/`.** The pre-governance reference corpus that **the step-1 skill’s MANDATORY 1.b and §9.5(b) send EVERY batch to consult** for original intent. ⚠️ **POINTER ONLY — its full description and the NEVER-EDIT caveat live in §9; read them there.** A second description here would be exactly the duplicate-source drift this section exists to prevent.

**Governance (all in `1-system-manual/`):** BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL, SYSTEM_IMPACT_MAP, CHANGES_AND_FIXES, POST_AUDIT_ROADMAP, ADJUSTMENT_FRAMEWORK, AUTHORITY_BASELINE, RUNNING_ISSUES, MULTI_ASSET_VTS_EXPANSION_PLAN, ASSET_CLASS_ONBOARDING_WORKFLOW, STORAGE_POLICY, GOVERNANCE_EXCEPTIONS, ALERT_HANDLING_PROTOCOL, DELETED_COMPONENTS_LOG, `_archive/CLAUDE_MD_RULE_HISTORY.md` (this file's companion).

**★ RUNBOOKS — depth moved OUT of this file per #564 (*operative→`CLAUDE.md`, depth→runbooks*), nothing deleted:** `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` (§7.1's conductor map, measured evidence, and the preserved 2026-06-01 incident record) · `COMMS_BRIDGE_RUNBOOK.md` (§8.2's ordered bridge diagnostics) · `CLAUDE_CODE_PERMISSION_PROMPT_RUNBOOK.md` · `CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md`. **★ THE PLACEMENT RULE, now standing (Langston-ruled, #564): this file holds the OPERATIVE statement — what to do, what not to do, the decision. Diagnostic depth, evidence chains, version histories and repair procedures go to a named runbook, referenced by a pointer of a few lines.** It auto-loads for **every CC session at start AND on every compaction, across all three sessions**, so everything in it is paid for repeatedly. ⛔ **It does NOT auto-load for Langston** — his context carries his OWN `CLAUDE.md` and an auto-memory index; this file is absent and he fetches it on demand. ★ **#564's conclusion STANDS on the CC-side cost alone.** ⚠️ **But his side is NOT free — his own always-loaded file is a large artifact in its own right. Two SEPARATE problems, separate fixes.** *(Dated measurements: history doc §5.30 — deliberately NOT inline, because a figure measuring THIS file goes stale on the next write to it. **LIVE measurement now exists (B-RULES-1a OBJ-1): every session start appends its loaded-set bytes to `~/.claude/instructions-loaded.jsonl` — read the instrument, never quote a stored figure.**)* ⚠️ **This is NOT a licence to trim rules — Kyle ruled NO-TRIM (#339). Nothing is deleted or made unfindable; only its supporting evidence relocates.**

**★ `1-system-manual/LANGSTON_ARCHITECTURE.md` — HOW THE REVIEWER IS BUILT (Kyle-requested 2026-07-24).** Host, runtime + model, auth (⏳ token rotates by 2027-04), his auto-loading files, how he is invoked + the address gate, **how he reads code (off the review branch, no working copy)**, what he can and cannot touch, rollback snapshots, known limits, and a dated change log. **LIVING — update when his BUILD changes** (model, runtime, invocation, read path, auth, files), never for per-batch review activity; record what it was BEFORE and why it changed. Complements `BUILD_METHOD_PLAYBOOK.md` (portable/role-based) — this one is the concrete instance.

**★ `1-system-manual/BUILD_METHOD_PLAYBOOK.md` — THE PORTABLE DESCRIPTION OF HOW WE BUILD (Kyle-requested 2026-07-24).** The cast (human decider / implementation agents / independent reviewer / automated checkers), the physical setup, the batch process, the document set, the comms fabric, **the rules that earn their keep — each with the incident that produced it** — the anti-patterns, a **build ORDER** (what is load-bearing in hour one vs what should wait), and what we'd do differently. **Written to be lifted onto a DIFFERENT project from scratch**, so it is deliberately role-based rather than DawnTrader-specific. **This file is DESCRIPTIVE, not authoritative** — `CLAUDE.md` and the docs above remain the binding rules for THIS project; the playbook is what you hand someone starting a new one. Update it when the METHOD changes (a new role, a changed gate, a rule that earned its place), not when this project's state changes.

**Claude Comms and Packages (inside repo at `DawnTraderV3/Claude Comms and Packages/`):**
- `Scope Files/` — `BATCH_N_SCOPE.md`, `BATCH_N_PRE_AUDIT.md`, audit discussion docs
- `Batch Completion/` — `BATCH_N_COMPLETION_REPORT.md` (canonical location, promoted from `Reports/Batch Completion/` 2026-04-14)
- `Change Lists/` — per-batch change lists for Langston code review
- `Langston Design Asks/` — file-first design dispatches per §6.5
- `Batch Zips/` and `Governance Zips/` — legacy, pre-clone-repo era
- `Langston/` — Langston setup reference, skills
- `CCDT Relay/` — Telegram-relayed images
- `Telegram Discussion Archives/` — historical Telegram content

**Archived (pre-Phase-12 governance):** `DawnTraderV3/Archived Reports - Pre-Phase 12 Governance Implementation/`.

**What does NOT exist anymore:** `DawnTraderV3/Reports/` (renamed); `DawnTraderV3/Claude Comms and Packages/Reports/` (contents promoted); `G:/My Drive/Dawn Trader/Claude Comms and Packages/` (Drive root, deleted); `G:/My Drive/Dawn Trader/DT_Clone_Repo/Claude Comms and Packages/` (clone-repo level, deleted). Only ONE `Claude Comms and Packages/` exists — inside `DawnTraderV3/`. Do not create duplicates.

---

## 5. Critical Rules (Non-Negotiable Invariants)

> **⛔ THE EIGHT — READ-FIRST NON-NEGOTIABLES (index; full text at the cited home — do not duplicate).** These are the rules most often violated after a compaction; if unsure you still hold them, re-read the cited sections before acting. (1) **Never push on RED CI** — `workflow-05-ci` + rule 19. (2) **Langston reviews the diff AT THE GRADED REF** (after push to the review branch, before `main` advances) and you iterate to consensus — `workflow-04-code-review` + rule 9. (3) **Iterate to completion; don't stop after a status update** — §6.7. (4) **Full 11-step workflow every batch** — §0.a + the eleven step skills. (5) **Commit hygiene** (own clone, explicit paths, `git fetch` first, CI-green after) — rule 25 + §7.1. (6) **Bug taxonomy** (code-first; three outcomes never collapsed) — **`CONDUCT.md` §9**. (7) **Investigate before you announce** (a cause is a claim; check arithmetic + code + intent first) — **`CONDUCT.md` §8**. (8) **Stay in your own lane** — *and the correct output for a wake that is not yours is NOTHING, not a shorter comment* — **`CONDUCT.md` §5**. ★ **(6)-(8) now live in `CONDUCT.md`, which is AUTO-LOADED separately on every start/resume/compaction — so they arrive ahead of this file rather than below 100 KB of it. That was the point of the move (B-CONDUCT-FILE, 2026-08-20).** *(Relocated from the shared MEMORY.md 2026-07-25; the content was already here, so this is a pointer index, not a copy.)*

1. **Each session works in its OWN clone — that clone is its working copy.** Edit on the migration branch. Push to GitHub. **No DT_Staged_Changes folders or zip packages.** ★ **This rule is the SOLE home of the anti-zip/anti-staged-folder clause — §7.1 forbids it only BY IMPLICATION, never verbatim, so do NOT cite §7.1 as an independent statement of it.** *(History: history doc §5.30.)*
2. **Replit is FROZEN** (since 2026-03-30). No updates, no syncing, no code flows to or from.
3. **Never skip the workflow.** Every phase, every batch. If tempted to skip, tell Kyle.
4. **Never improvise architecture under pressure.** If blocked, stop and tell Kyle.
5. **Communicate deviations before acting.** → `CONDUCT.md` section 11.
6. **Never confabulate when context is degraded.** → `CONDUCT.md` section 1.
7. **Single source of truth per domain.** Each governance doc owns its domain. No duplicates.
8. **Batch completion reports are mandatory** — every batch, canonical location, governance-files-changed list.
9. **Langston code-level reviews are mandatory** — scope → pre-audit → code diff (**at the graded ref, after the push to the review branch and before `main` advances** — see `workflow-04-code-review`) → completion report. Not high-level glosses.
10. **All governance in the repo.** No parallel copies in Drive root or DT_Clone_Repo root.
11. *(removed)*
12. **Always consult SIM in pre-audit.** Always update SIM + System Manual in governance. Buried details are the enemy.
13. **Prefer rolling windows over single-point snapshots for distribution metrics.** Snapshots can be off by 10+ percentage points vs the underlying rolling window. If only a snapshot is available, label it "snapshot, single-moment, not decision-grade." Decisions get made from rolling windows, audits, or repeated measurements — not one-shot point-in-time observations. See history doc §5.13 for the B59 → B61 empirical evidence (47% snapshot vs 72.59% rolling; 19.3% vs 3.42%).
14. **Log non-existent exchange API names (Kyle directive 2026-04-30).** When you spend time investigating a feed name / channel / endpoint / symbol form that turns out NOT to exist on an exchange, add an entry to `KNOWN_NONEXISTENT_NAMES` in `server/services/utils/symbol-canonicalizer.ts`: exchange, type (WS/REST/etc.), failing name, context, correct alternative, date, one-line reason. Reference from any code comment using the alternative. See history doc §5.14 for the B74 Kraken Futures origin.
15. **NO PATCHES (Kyle directive 2026-05-08).** Every fix, every feature must be long-term, sustainable, stable, scalable. No duct tape. No "good enough for now." When a problem surfaces, identify the structural root cause, design the right architecture, document the design BEFORE implementing, get Langston's review, ship a proper batch. **Specific corollaries:** cold-start warmup acceptable (1-5 min clean startup > instant-on with stale-cache race); backpressure is never asset-class shedding (vertical-scale or computational-distribution refactor — not dropping a class); every architectural decision documented BEFORE implementation (verbal commitments don't survive); per-asset-class configuration is the default for behavioral knobs (BE enable, trailing, stop policy, regime thresholds — DB-resolved with `asset_class` as first-class dimension; no silent fallbacks). See history doc §5.15 for the BE-latch origin + each corollary's full rationale.
16. **Claude Code permission-prompt regression (Kyle directive 2026-05-20).** If previously-allowed operations start prompting, the fix is a **launch-time** property, not a toggle: `permissions.defaultMode: "bypassPermissions"` in **USER-level `~/.claude/settings.json`** (durable — survives branch switches, worktrees, app updates). **A session that did not LAUNCH in bypass can never be switched into it** — that is the "it keeps reverting" symptom, and no setting fixes it; relaunch.
    **⚠️ SCHEDULED ROUTINES ARE A DIFFERENT, UNFIXED PROBLEM** — an open upstream regression ([#77817](https://github.com/anthropics/claude-code/issues/77817), [#76469](https://github.com/anthropics/claude-code/issues/76469), [#76141](https://github.com/anthropics/claude-code/issues/76141), all reproducing on 2.1.215). **NO settings file can fix a routine.** Workaround: recreate it via the app's Routines → New routine FORM, not by asking a session. **Do not re-diagnose this as a settings problem.**
    **Full detail** — the settings block, protected paths, session-mode drift, the shipped-CLI mechanics, and what was verified NOT to be the cause — is in **`1-system-manual/CLAUDE_CODE_PERMISSION_PROMPT_RUNBOOK.md`**. See history doc §5.16.
17. **xStock trading window is 24/5 — NOT US regular trading hours (Kyle directive 2026-05-22).** xStocks trade 24 hours a day, Sunday through Friday — continuous ~5-day window, off only for weekend (Fri close → Sun open; B-NEW-36 `weekend_shutdown`/`weekend_restart` timers manage the boundary). **Never assume xStocks follow US equity RTH (≈13:30–20:00 UTC).** "Overnight / off-hours" is NOT a valid explanation for xStock trades not closing or prices being blank during Sun-Fri. **US market holidays DO pause the cadence** (added during B79.0n.CONFIDENCE-CHAIN 2026-05-25 when Memorial Day paused the live xstock signal flow). See history doc §5.17.

18. **Legacy-component removal — NEVER leave legacy lingering (Kyle directive 2026-06-13, SUPERSEDES the 2026-05-22 "mark, don't delete in-flight" posture).** When any batch surfaces legacy code (system / module / function / helper / route / type that predates current architecture and is a removal candidate), do NOT leave it stubbed, commented-out, deprecated, or lingering — lingering legacy creates confusion AND the risk a dead path accidentally re-enters the live system. **Two acceptable dispositions, decided AT the moment of surfacing:** (a) discuss it + **delete it on the spot** — still through the full workflow (Langston Step-4 diff review, CI, deploy) with certainty-before-cutting blast-radius verification (trace every caller, confirm no UI/runtime dependency, prove no dangling reference via tsc); OR (b) **schedule a concrete dated deletion** — a named batch / roadmap phase+item / dated task, never a vague "Phase 16 someday." **Mechanics:** every removal is recorded in `1-system-manual/DELETED_COMPONENTS_LOG.md` (what / why / blast-radius verification / archive path / commit) and the file archived to `1-system-manual/_archive/deleted-code/` with a non-compilable `.removed` suffix (git history is the authoritative archive; the copy is for quick browse). List any "left intentionally" items (e.g. forward-looking permission taxonomy) in the log so a later grep doesn't read as a missed sweep. Recurring legacy theme still holds: **user-ID dependency** (system is mode-based; userId-coupled paths are prime candidates). First application: P19-B2 `live-trading-service` stub deletion 2026-06-13. (The old "Phase 16 consolidated sweep" was right mid-migration; that era is over and lingering stubs now cost more than the deferral saves — Langston.) See history doc §5.18.

19. **CI per-batch confirmation rule (Kyle directive 2026-05-23, B-NEW-43 Phase 3).** Every batch close MUST verify all 4 GitHub Actions jobs are GREEN on the head commit of `migration/aws-supabase` BEFORE marking complete. The 4 jobs: TypeScript Check (baseline gate), Test Suite, Build, Docker Build. Verification: `gh run list --branch migration/aws-supabase --limit 1` → confirm `completed success`. If `in_progress` or `queued`, wait via `gh run watch <run-id> --exit-status`. If RED, batch NOT complete — surface to Kyle + iterate. Completion reports MUST cite run ID + green status. See history doc §5.19.

20. **TRADING-MODE TAXONOMY — two orthogonal axes; DO NOT CONFUSE.** → `CONDUCT.md` section 4.
    ⚠️ **MOVED AND DELIBERATELY STRIPPED OF ITS COUNTS AND ENUMERATIONS.** The DISTINCTIONS are conduct — you mis-speak them unprompted, with no moment at which you would think to check. The COUNTS were not: **rules do not drift, facts do.** B-RULES-1a caught this very taxonomy asserting 18 strategies against the SSOT's 19, with one missing entirely, inside an always-loaded file. **Current state and counts are read from the SSOT and the System Manual, never from a rules file.**

21. **Daily Claude model + feature check (Kyle directives 2026-06-13 + 2026-06-16).** Once daily (scheduled task `daily-claude-model-check`) + opportunistically: check for a newer/stronger Claude model AND new Claude Code features useful to DawnTrader. **⚠️ Availability is confirmed TWO ways — official Anthropic sources AND a live one-off invocation on Langston’s box; NEVER the app’s model dropdown (it lists shut-down models).** Surface + recommend to Kyle in plain language — NEVER switch anything unilaterally; a Langston switch flips BOTH his model sites or he runs split. **Authoritative procedure + dedup ledger + the COMMITTED per-run liveness log: `1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md`** (B-RULES-1b C1 — a RUN LOG row lands with every run, so the mechanism’s liveness is readable at the ref by anyone; a row missing >48h IS the alarm).

22. **GOVERNED-READ / NO-FALSE-ABSENCE.** The standing rule → `CONDUCT.md` section 10 (*an asserted absence needs presence-evidence; a failed read must produce a REFUSAL, not a recollection*).
    **STAYS HERE — the MECHANICAL part, because it is a fact about a hook, not a behaviour:** `.claude/hooks/guard-governed-read.mjs` (wired in `.claude/settings.local.json`) BLOCKS exactly ONE shape — a git object read (`git show|cat-file|ls-tree`) combined with stderr suppression — and is **FAIL-OPEN** (any parse problem exits 0), so **its silence is NOT evidence of compliance with the standing rule.** `.claude/hooks/session-reminder.mjs` re-injects the rule every start/resume/compaction. Hooks load at session start — a freshly-added hook is live from the NEXT session.

---

23. **FIX-ON-FIND — the pipeline-cleanup default (Kyle directive 2026-07-16; BOTH CC sessions).** Context: active trading is ON and the pipeline is functioning overall, but two-to-three DawnTrader generations of legacy/hidden/hardcoded code may be silently distorting how signals are generated, how filters operate, how signals pass the SQE, how the RTB pool ranks/refreshes/promotes, and how trades open and close. **The rule: when work surfaces a legacy remnant, hardcoded variable/coefficient, or hidden code path that disrupts INTENDED behavior anywhere in the pipeline, it gets determined and FIXED AT THE FIND — instantly, in a mini-cycle through Langston — NOT scheduled for later.** Deferral is the EXCEPTION and requires an explicit, justified decision with a named dated home (§9.4 mechanics) — "we'll get to it" is not a disposition. This TIGHTENS rule 18 (legacy removal) and §9.4 (surfaced-issue scheduling) for the cleanup era: the default flips from "schedule it" to "fix it now"; scheduling is what you argue FOR, not the path of least resistance. Rationale (Kyle): deferred pipeline defects historically sat unfixed; fix-on-find is how the entire pipeline actually gets clean before Phase 21. Companion booking: a FULL RUNTIME PIPELINE AUDIT is the closing step of Phase 19 (PHASE_19_PLAN) — verify end-to-end that evaluation, selection, ranking, promotion, open/close, and refresh run exactly as designed with no surviving legacy influence.

24. **A FOUND BUG IS A HYPOTHESIS, NOT A VERDICT.** → `CONDUCT.md` section 9 (the trigger and the three outcomes) and **section 8** (investigate before you announce).
    ⚠️ **THE FULL PROTOCOL IS STAGED, NOT DELETED: `1-system-manual/_pending-skills/bug-investigation-SOURCE.md`** holds rule 24 + 24.a VERBATIM, including the 24.0 provenance binding, the evidence standard and the origin cases. The scope routes this to a SKILL, but **the skills build is B-RULES-1d and does not exist yet** — removing a live rule into a home that has not been built is the absent-as-valid failure this rule itself warns about. **1d builds the skill from that file and then deletes it.**

25. **COMMIT DISCIPLINE — EXPLICIT PATHS, AND THE ATTESTATION TOKEN IS NOW RARE (Kyle directive 2026-07-20, #542).**
    **THE NORMAL FORM, on the local clones: `git add <explicit paths>` → `git diff --cached` — READ THE STAGED **CONTENT**, not just `--name-only` — → `git commit -F <msgfile> -- <the same explicit paths>`.** That path-limited commit is the mandated form on the local NTFS clones, with zero #542 recurrences REPORTED by any session since 2026-07-23 — an absence-of-reported-failure record, not per-commit proof of the form’s use (dated measurement + instrument reach: history doc §5.25). **Mechanical backstop — FORM only:** `.claude/hooks/guard-bare-commit.mjs` blocks a bare `git commit` lacking explicit paths; it cannot check WHOSE content is staged — that is 25.c, which no hook covers.
    - **`CC_COMMIT_ATTESTED` is now for genuinely exceptional cases only** — and every use still requires that you have *just* read `git diff --cached --name-only` and confirmed the index holds **only your paths**. **Never attest over a mixed index.** If you find yourself reaching for it routinely, something else is wrong; say so rather than normalising it.
    - **Stale lock:** only under the #540 tier-3 protocol — reported-blocking **AND** no live git process across several samples **AND** mtime frozen ≥60s. A lock you created yourself and know is dead still gets the samples.
    - ⚠️ **`git diff HEAD` DOES NOT SHOW UNTRACKED FILES**, and says nothing about the omission. A change-set built with it can silently exclude a brand-new module — this shipped an incomplete Step-4 diff to Langston on 2026-07-20, omitting the batch's single most load-bearing file. **Cross-check `git status --porcelain` for `??` entries before calling any diff "the change set."**
    - **Never carry a multi-hour uncommitted diff** — it breaks Langston's ability to verify at a ref and other sessions' line-number measurements. **Quote `path:line` from `origin/migration/aws-supabase`, never from your working tree** (#545 rule 2).

25.c **★ EXPLICIT PATHS PROTECT YOU FROM THE WRONG *FILE*, NOT THE WRONG *CONTENT* — SO READ THE STAGED HUNK, NOT THE FILENAME (crew-adopted 2026-07-28; CC-B measured, Langston-ruled).** On a shared branch where three sessions write into the SAME governance docs, **the path is ALWAYS right — which is precisely why the explicit-path habit is the one that cannot catch this.** **MEASURED:** CC-B's pull was blocked by a STAGED `RUNNING_ISSUES.md` holding **CC-A's #598 + #582 annotation — not CC-B's content**; the prescribed `--name-only` check confirmed the path and **showed nothing wrong**, so a routine `git add <path>` + commit would have **published another session's work under the wrong name**, possibly duplicating entries already arriving via origin. ⇒ **A `git status` entry you do not remember staging is a SIGNAL, not noise — check WHOSE content it is before committing.** ⚠️ **RECOVERY: `stash` → `pull` → confirm it arrived from origin — and KEEP THE STASH UNTIL THE CAUSE IS ESTABLISHED, not merely until the content is proven safe.** (CC-B dropped it after proving nothing was lost, which destroyed the only artifact carrying HOW it got staged; the mechanism is now unreconstructable. Recovering the work and diagnosing the incident are two different jobs — do not collapse them.) **Topology was cleared separately and is NOT implicated:** `.git` a real directory, `--show-toplevel` correct, and every reflog pull `Fast-forward` ⇒ no merge, so no merge-staging; §7.1 clone isolation holds. Same failure family as `grep -c`, as reading a worktree instead of a ref, and as a LAG-gap blind to a trailing silence: **A MATCHING NAME IS NOT A MATCHING THING.**

25.a **✅ THE CREW COORDINATION BOARD — RETIRED 2026-08-23** (Langston ruling, Kyle-delegated). **The deciding number was not low usage but THREE CLAIMS MADE, ZERO EVER RELEASED** — a protocol nobody completes, so its empty state was never EARNED. The race it was built for became structurally impossible at one-clone-per-session (#557), and the one real collision (`RUNNING_ISSUES.md`) has a structural fix in the #702 number blocks. ⛔ **DO NOT RE-PROPOSE WITHOUT A NEW FAILURE THE NUMBER BLOCKS DO NOT COVER.**
    ⚠️ **RESIDUAL, NAMED NOT CONCEDED: `CLAUDE.md`, `CONDUCT.md`, shared `MEMORY.md`** — four sessions edit the same prose regions, blocks cannot apply, and a semantic collision merges cleanly. Detection exists (`fresh-rules.mjs` + the Monday review); prevention does not. **Code removal + the residual’s structural fix: `B-CREW-BOARD-REMOVAL`, CC-A, due 2026-09-05.** *(Full ruling, blast radius and restore path: `DELETED_COMPONENTS_LOG.md`.)*

26. **WHEN NAMED, ANSWER — FAST.** → `CONDUCT.md` section 12. The ack/resolve mechanics stay in `ALERT_HANDLING_PROTOCOL.md`.

27. **PAIRWISE REVIEW IS THE DEFAULT; FOUR-WAY DEBATE IS THE EXCEPTION.** → `CONDUCT.md` section 12.

28. **STAY IN YOUR OWN LANE — THE CORRECT OUTPUT FOR A WAKE THAT IS NOT YOURS IS *NOTHING*.** → `CONDUCT.md` section 5.

28.a **SELF-CORRECTION IS *ONE LINE*.** → `CONDUCT.md` section 7.
    **THE RECORD IT PRODUCES MUST BE FINDABLE, so it carries a trailer:** `MISTAKE: <slug> [<batch-id>] — <one line>`. Slugs, the promotion threshold (3+ instances across 2+ distinct batches, **as a floor**) and the weekly pass live in **`1-system-manual/MISTAKE_PATTERNS.md`**. ⚠️ **The trailer is ALSO mandated on the commit that CARRIES AN ISSUE ENTRY** — this rule's destination is *"the commit message **or** the issue entry,"* and a commit-only trailer would silently cover one branch while the index read as complete. **Population limit, stated: the grep sees COMMITS ONLY; a claim retracted in review that touched no file is invisible to it.**

29. **MEASUREMENT DISCIPLINE — NAME THE OBJECT AND THE POPULATION; PROVE THE INSTRUMENT BEFORE SILENCE IS EVIDENCE.** → `CONDUCT.md` section 10.
    ⚠️ **MIRROR — NOT THE AUTHORITATIVE COPY. The reviewer obligation below is Langston's OWN standing rule and it already lives, verbatim, in HIS auto-loaded file; edit it THERE first.** *(Step-4 correction: my original reason — "it binds Langston and he does not load `CONDUCT.md`" — was wrong in a load-bearing way. **He does not load the repo `CLAUDE.md` either**, so this copy never reaches him by loading; it reaches him only when he goes and reads it. It is kept because CC benefits from seeing the bar it is graded against — and it has ALREADY drifted from his copy in emphasis and casing, which is the #641 two-copies shape. Treat any divergence as this copy being stale.)* *"A measurement with no stated object and population is not a finding — it is a claim, and I rule it unevidenced. For any number load-bearing on the decision I am being asked to make, I either re-derive it myself or I bounce it. `RULED ON REPORTED FACT` stays as a tag, but it is **disqualifying for a PROCEED on the leg it covers**, not a disclaimer I can attach to one. And for every piece of negative evidence: ask what the instrument's reach is before accepting its silence."*
    **★ WHERE POSSIBLE, PREFER IMPOSSIBLE OVER INTERCEPTED (Langston):** section 7.1's backup push URL is a deliberately invalid `DISABLED://…` value — *"a push from it fails at git, not at somebody's memory."* That is stronger than a hook: it makes the wrong action impossible rather than caught. **Hooks are the fallback, not the first choice.**

---

## 6. Three-Way Communication Protocol (Kyle ↔ Langston ↔ Claude Code)

> Architecture as of 2026-05-06: Langston migrated from OpenClaw+Opus-4.6-API to **Claude Code under Kyle's Max OAuth** on the same Hetzner box. Comms via two custom Python bridges, not OpenClaw. Cost ~$200/mo (Max sub) vs ~$750/mo (API). See §8 for service-level details. See history doc §8.1 for the OpenClaw decommission context.

> **★ COMMS BACKEND — DISCORD ONLY · TELEGRAM IS DECOMMISSIONED (#333 cutover 2026-06-25; #348 decommission 2026-07-02).** **`COMMS_BACKEND=discord` in `/etc/dawntrader/comms-active.env`** routes ALL of CC’s outbound (`cc-send` + the §10.5 alerts) to **Discord `#general`** — THE crew channel. Its decisive win is **native bot-to-bot messaging**, so **CC↔Langston is a normal in-channel exchange**. ⛔ **Setting `COMMS_BACKEND=telegram` now makes `cc-send` FAIL LOUDLY** — there is no silent dead branch, and **restoring Telegram is a restore-from-archive job, not a switch flip.** *(The decommission record, bake evidence and archive paths: `COMMS_BRIDGE_RUNBOOK.md` §telegram-decommission-348.)*
> **LIVE MECHANICS — all operative, all needed every day:** display names — **the `--sender` value, and they are ALSO the wake-routing keys, so they must be exact:** **OLD Claude** (CC-A) · **NEW Claude** (CC-B) · **ANALYST Claude** (CC-C) · **Infra Claude** (CC-INFRA). ⚠️ **MEASURED on the live channel 2026-08-23, because this list was wrong twice:** it named only CC-A and CC-B for months, and a same-day fix added CC-C under the WRONG form (“Claude Analyst”, which he has never posted under). Observed counts: NEW 2114 · OLD 1829 · ANALYST 836 · Infra 31. **Read the roster `(repo)/.claude/cc-session-roster.json` for the binding; read the channel for the posted FORM — they are not the same string.** A Claude addressing Langston **LEADS THE POST WITH "Langston"** — his bridge engages only when his name is at the **START**; a mid-sentence mention does **NOT** wake him. **Kyle may name him anywhere.** Langston’s bridge **auto-leads every reply with the addressee’s name** ("OLD Claude — …") so CC wake-routing catches it — deterministic, from the triggering message’s author, not his phrasing. The wake watcher tails `/var/log/cc-discord-inbox.jsonl` and **MUST be armed with the Monitor tool, NOT Bash `run_in_background`** (§6.9 + MEMORY §4.5/4.6). §10.5 alerts feed Discord with a dedicated always-engage path for Langston, keyed off the alert’s `category` marker.
> **TO POST:** `ssh root@204.168.141.77 'cc-send --sender "OLD Claude" --message "..."'` — backend-routed; add `--notify` to @-mention Kyle for a phone push. Direct bridge call (bypasses the backend switch — for crew posts during a rollback test): `'/opt/discord-bridges/venv/bin/python3 /opt/discord-bridges/discord-cc-bridge.py send --sender "OLD Claude" --message "..."'`.
>
> **★ Discord behaviour on record (2026-06-20/21):** the CC↔Langston circuit breaker is **effectively removed** (`BOT_TURN_LIMIT` 100,000 — a normal overnight review is 30-50 messages and a low cap silently swallowed real work); the **relay hand-off** rule is §6.9/MEMORY §4.7; component detail is in `SYSTEM_IMPACT_MAP.md` "Discord Comms Fabric". *(The measured incidents and the dated change record: `COMMS_BRIDGE_RUNBOOK.md` §discord-mechanics-2026-06-20.)*

**Roles:**
- **Kyle** — decider. Approves scope, architecture, risk. Breaks ties. Only person who can override governance with explicit exception. **Communicates with CC in this Claude Desktop conversation directly**, and reaches the crew remotely via **Discord `#general`** (text or voice — wakes the named CC session). Reaches Langston by posting in `#general` (naming "Langston" anywhere in his message). (Telegram is decommissioned — see the COMMS BACKEND block above.)
- **Langston** — senior PM + code-level reviewer. Independent perspective on scope, pre-audit, code diff, completion reports. Runs on Claude Code **Opus 5** (1M-context `[1m]` variant; switched 2026-07-27 from Opus 4.8, now legacy per Anthropic — same price, newer cutoff) on Hetzner `204.168.141.77`. **Reachable in Discord `#general` — lead the post with "Langston"** (his Discord bridge replies natively in-channel; this is the live path) OR via direct SSH+`claude -p --session-id <UUID>` invocation. **★ Langston is STATELESS per-invoke on Discord** — each message spins a fresh `claude -p` with no cross-turn memory, so a single-shot review (prompt + staged file = self-contained) works, but any MULTI-turn discussion must carry its context IN the prompt or a staged file; never assume he recalls his own prior messages.
- **Claude Code (you)** — implementation lead. Drafts scope, runs audits, writes code, deploys, verifies, writes reports, packages governance updates. Peer to Langston on review discussions. **TWO named CC sessions run concurrently (Kyle directive 2026-06-12): "Claude Old" (CC-A — comms/roadmap/governance session) and "Claude New" (CC-B — batch-implementation session).** Know which one you are (unsure → ask Kyle). Full naming + wake-routing protocol: §6.9.

**Live channel = Discord `#general`** (one channel, all three parties) — post anything that needs Langston's or a CC's attention here. **Rollback only:** the Telegram forum (group `-1003575211453`, "Dawn Trader HQ"), topic **21** (Batch Implementation) — used solely if `COMMS_BACKEND` is reverted to telegram.

### 6.1 Send / receive architecture

**Hetzner-side systemd services (24/7) — Discord (see §8 for full component detail):**
- `discord-cc-bridge.service` — CC's outbound to `#general` (`cc-send` → webhook with the `--sender` display name) + Kyle/voice inbound → `/var/log/cc-discord-inbox.jsonl`.
- `discord-langston-bridge.service` — invokes Langston's reasoning (`claude -p`, fresh session per message) when a message names him; posts his reply natively in-channel, auto-led with the addressee's name.

**Unified inbox log** `/var/log/cc-discord-inbox.jsonl` on Hetzner is the single read-tap point. Each line is a JSON entry with `kind` ∈ {inbound kinds, `langston_inbound`, `langston_outbound`, `langston_alert_inbound`, `cc_outbound`, voice kinds}. (The Telegram-era `cc-bridge-inbox.jsonl` is frozen history — kept on disk, no writers since the 2026-07-02 decommission.)

### 6.2 Kyle ↔ CC

Kyle messages CC in the Claude Desktop conversation as the primary channel, and reaches CC remotely by posting in Discord `#general` (text or voice), which WAKES the targeted session(s) through the wake watcher (§6.9). **A Discord message gets a Discord reply** — a Desktop-only answer is invisible to him (MEMORY 4.6).


### 6.3 Kyle → Langston

**LIVE PATH (Discord, since cutover #333):** Kyle posts in `#general` naming "Langston" anywhere in the message; the Discord Langston bridge wakes and replies natively in-channel. CC sees the whole round-trip in the same channel (`/var/log/cc-discord-inbox.jsonl`).

### 6.4 CC → Kyle

**LIVE PATH (Discord, since cutover #333):** post to `#general` via the backend-routed dispatcher — `ssh root@204.168.141.77 'cc-send --sender "OLD Claude" --message "..."'` (add `--notify` to @-mention Kyle for a phone push). The `--sender` sets your webhook display name (**OLD Claude** / **NEW Claude**). The same names are the wake-routing keys (mention "Claude Old"/"Claude New" anywhere → only the named session(s) wake; both names = both; no name = broadcast). For multi-line bodies with shell metacharacters, use the scp-to-file pattern below but target `cc-send`.

For multi-line messages with shell metacharacters in the body, use the scp-the-body-to-a-file pattern (cat to a local file → scp to Helsinki `/tmp` → `cc-send --message "$(cat /tmp/…)"` inside single quotes so expansion happens remotely).

**On Discord the display name IS the speaker label — do NOT also prefix the body.** `--sender "OLD Claude"` / `"NEW Claude"` / `"Claude Analyst"` posts under that webhook name, so an in-body `**CLAUDE OLD (CC) SPEAKING:**` is duplication. Those bold-caps prefixes were a **Telegram-era** device (one shared thread, no per-sender identity) and are retired with it.

**Session naming (Kyle directive 2026-06-12) still governs, because the names are the wake-routing keys:** a message mentioning "Claude Old"/"OLD Claude" anywhere wakes only CC-A, "Claude New"/"NEW Claude" only CC-B, "Claude Analyst" only CC-C; several names wake several; no name = broadcast. Names are bound to session IDs in the roster, never inferred from role (§6.9). Wake-watcher mechanics: MEMORY.md session-start item 4.5 + `C:\Users\kyleg\.claude\cc-wake-filter.py`.

### 6.5 CC → Langston (AI-to-AI delivery) — Discord native

CC↔Langston is a normal Discord `#general` post: **lead the post with "Langston"** and his bridge wakes + replies natively in-channel (Kyle sees the whole exchange; no separate visibility step). Mechanics in §6.9/§6.7; infra in §8.

> **★ LENGTH IS NO LONGER A CONSTRAINT ON A LANGSTON DISPATCH (#553).** Send him whatever length the work needs. **No sender does anything differently — there is no flag, no command and no length discipline to remember.** *(How it broke, and the reassembly mechanism: `COMMS_BRIDGE_RUNBOOK.md` §langston-dispatch-chunking-553.)*
> ⚠️ **KNOW HOW NARROW THAT IS:** reassembly applies **ONLY** to a CC dispatch that **STARTS with "Langston" AND exceeds 2000 chars.** Langston’s own replies, every Kyle-facing post and the §10.5 alert webhook take the untouched path and split exactly as before. **A `file:line`, sha, path or URL can never be split across a seam** (cuts are whitespace-only), but a reassembled message is **not** byte-identical in its blank lines. *(Both properties in full, and the unbreakable-run case: `COMMS_BRIDGE_RUNBOOK.md` §chunking-known-properties.)*

**Two disciplines still apply on Discord:**
- **File-first for anything MULTI-turn — the reason is STATELESSNESS, not length.** Langston is **stateless per-invoke** — each message is a fresh session with no memory of his own prior turns. **That is unchanged by the length fix above:** a long message now arrives whole, but he still cannot recall his own previous turn, so multi-turn context must live IN the prompt or in a staged file regardless of how much the channel can carry. Stage the full context in a committed file (`Claude Comms and Packages/Langston Design Asks/<batch-id>_<topic>_<rev>.md`) and reference it in the post; for code reviews, **embed the load-bearing diff snippets inline** (NEW/MODIFIED/DELETED with 5-20-line BEFORE/AFTER blocks) rather than making him navigate the repo. **He also reviews at the graded ref — so COMMIT AND PUSH before dispatching, or he is reading a file that does not exist yet.**
- **Follow through — "dispatched" ≠ "reviewed."** After a dispatch, watch the Discord log for his pickup; if no engagement in ~8-10 min, re-poke; escalate after 2-3 tries (the hung-instance follow-through discipline, now on Discord). Don't go idle giving Kyle status instead of chasing Langston.

> **🗄 The legacy Telegram SSH-deliver apparatus is ARCHIVED, not on standby** — the bridges were stopped and their unit files removed (#348). Reverting is a restore-from-archive job, not a switch flip. `1-system-manual/_archive/TELEGRAM_COMMS_APPARATUS_ARCHIVED_2026-07-01.md`.

### 6.6 Receiving — reading the unified inbox log

```bash
ssh root@204.168.141.77 "tail -n 30 /var/log/cc-discord-inbox.jsonl"
```

Each line is a JSON entry. Filter by `kind`: inbound kinds for Kyle's messages/voice, `langston_inbound`/`langston_outbound` for the Langston round-trip, `cc_outbound` for CC's own posts (mirror). Gateway push → bridge writes to log → CC reads (near-zero latency). The §6.9 wake watcher tails this continuously, so manual polling is rarely needed.

### 6.7 Three-way discussion protocol (live)

Same iterate-to-consensus pattern as always; **the mechanics are now Discord (since cutover #333).** CC and Langston exchange directly in `#general`: CC leads a post with "Langston", his Discord bridge wakes and replies natively in-channel (Kyle sees the whole exchange in the same channel — no separate visibility step). All three parties read one channel. For any LARGE or MULTI-turn review, still stage the context in a file and reference it in the post (Langston is stateless per-invoke — he cannot recall his own prior turns), but the delivery is a plain Discord post, not the legacy SSH-deliver of §6.5.

**Autonomy with Langston — iterate to consensus, don't escalate every round to Kyle.** CC and Langston are peers on technical review. When Langston returns feedback: read carefully, decide per-point (agree / partially agree / disagree), respond directly with decision + reasoning, iterate until consensus or true deadlock.

**Escalate to Kyle when:** true deadlock (2-3 rounds, not converging — summarize both positions + recommendation + ask Kyle); architectural decision Kyle owns (roadmap, adjustment framework, authority baseline, strategy taxonomy, go-live); risk/authority boundary (violates §5 critical rule or exceeds Langston's autonomy); new directive needed; scope expansion beyond what Kyle approved.

**Default is "iterate and decide."** Asking Kyle on routine technical exchanges is a failure mode. **Respect Langston's non-objecting feedback** — "no revisions" / "approved as-is" → proceed. **Kyle interrupts any loop** — his input takes precedence over in-progress CC ↔ Langston loops.

**★ A HAND-OFF TO LANGSTON IS NOT A STOPPING POINT — the autonomous-completion rule (Kyle directive 2026-06-29, BOTH sessions, mandatory).** When Kyle has explicitly told you to **iterate to completion with Langston autonomously** (e.g. "iterate autonomously to verified correct completion," "keep going with Langston," an autonomous batch directive), then after you dispatch something to Langston you **ACTIVELY follow up** — poll the inbox for his reply, re-prompt/chase if it's slow (per the §6.5 follow-through discipline), and on receiving it **continue straight through the workflow** (next step → push → CI → deploy → verify → governance → close) WITHOUT yielding the turn back to Kyle. You may post Kyle brief plain-language progress updates *as you go*, but a Langston dispatch is NOT a place to freeze and wait for Kyle. The ONLY reasons to stop and come to Kyle mid-loop are a genuine escalation (true deadlock, an architectural/scope/risk decision he owns — see the Escalate list above). The failure mode this kills (flagged repeatedly, incl. an 8-hour idle freeze 2026-06-29): saying "I've sent it to Langston, I'll continue" and then stopping. **Absent** that explicit iterate-to-completion directive, the normal cadence still applies — dispatch to Langston, update MEMORY, and it's fine to pause for Kyle.

**Image relay:** images Kyle posts land in Discord `#general`; historical Telegram-relayed images remain on disk at `Claude Comms and Packages/CCDT Relay/images/<filename>` (frozen — no new arrivals since the 2026-07-02 decommission). Read either with the Read tool.

### 6.8 Voice note transcription (B-NEW-41, 2026-05-17)

Kyle’s voice messages are transcribed locally and land in the inbox log as `kind: "voice_inbound"` (or `voice_inbound_failed` with a reason). The wake watcher (§6.9) picks them up like any inbound. *(Pipeline, models and the audio archive: `COMMS_BRIDGE_RUNBOOK.md` §voice-transcription-pipeline.)*

### 6.9 CC wake channel + session naming — "Claude Old" / "Claude New" (Kyle directive 2026-06-11/12) — ONE HOME for the PROTOCOL (names/routing/wake sources); the OPERATIONAL depth's one home is the wake-watcher runbook

**What it is:** each open CC desktop session arms a persistent background watcher at session start that WAKES the session (no Kyle prompt needed) on inbound events. Built + live-verified 2026-06-11/12.

**Session names (also the Discord `--sender` display names per §6.4) — names are PERMANENTLY BOUND to session IDs in the roster `(repo)/.claude/cc-session-roster.json` (Kyle directive 2026-06-12). At session start, look up YOUR OWN session id in the roster: found → that is your name, period; not found → you are UNNAMED — ask Kyle, then register yourself. NEVER infer your name from your role/work; a fresh conversation NEVER inherits a name automatically (name carry-over to a successor session happens only on Kyle's explicit say-so). Self-ID: any background Bash task's output path contains your session UUID.**

| Name | Alias | Bound to | Role (descriptive, NOT the binding) |
|---|---|---|---|
| **Claude Old** | CC-A | session `3ce652e6-…` (roster) | comms / roadmap / governance |
| **Claude New** | CC-B | session `7f66d970-…` (roster; self-registered 2026-06-12) | batch implementation |

**Status: all named sessions ACTIVE; the routing was live-verified 2026-06-12** — a real both-names test woke both sessions independently and both replied under their own names. (Verified on Telegram, which was the channel at the time; the routing logic is unchanged on Discord.)

**What wakes a session (four log sources, one watcher):**
1. **Kyle (or the crew) via Discord `#general`** — text OR voice, written to `/var/log/cc-discord-inbox.jsonl` (the live path since cutover #333). Name-mention routing: "Claude Old …"/"OLD Claude" wakes only CC-A; "Claude New …"/"NEW Claude" only CC-B; BOTH names wakes both and BOTH reply in `#general` under their own webhook names; NO name = broadcast, all armed sessions wake. **When woken by a Discord message, REPLY IN DISCORD** (`cc-send` / `discord-cc-bridge.py send`), including for Kyle's own Discord/voice messages — a Desktop-only reply is invisible to him on Discord. Works whether the session is the front tab or backgrounded — only a fully closed session misses.
2. **Langston alert completions** — every `invoke DONE` line in `/var/log/langston-alert-invokes.log` (Helsinki) wakes CC automatically so alert follow-through starts immediately (Langston ACK ≠ resolved; the work is usually CC's).
3. **The wake file** `/var/log/cc-wake.log` (Helsinki, langston-writable) — Langston's explicit summon channel: `echo "Claude Old: <reason+pointer>" >> /var/log/cc-wake.log`. Same name-routing rules.

**Mechanics (re-arm EVERY session start — MEMORY.md session-start item 4.5 is the canonical command):** persistent Monitor running a self-healing SSH loop tailing the three Helsinki sources (`cc-discord-inbox.jsonl` = Discord, `langston-alert-invokes.log`, `cc-wake.log`) through the filter `C:\Users\kyleg\.claude\cc-wake-filter.py <ALIAS>`. The filter holds the name registry (adding a session = one registry line) and forces UTF-8 output (Windows cp1252 pipe encoding silently killed non-ASCII events — fixed 2026-06-11). Watcher dies with the session; the self-healing loop survives SSH drops and announces reconnects.

**OPERATIONAL DEPTH — relocated (B-RULES-1b C4 r2): `1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md` is THE home** for the arm/verify/re-arm procedure, every trap with its incident (the 06-19 run_in_background silent-stream, the 06-25 TaskList blind-re-arm), the compaction behavior (#25188, kills the watcher USUALLY but not always), and the THREE reliability layers — including the **hourly heartbeat scheduled task (Kyle 2026-07-13)**, which closed the mid-session idle-death gap an older copy of this section still called uncovered. Honest residual: a fully-CLOSED desktop session cannot be woken — platform gap. This section keeps the PROTOCOL only (names, routing, wake sources); the shared MEMORY §4.5 keeps the executable arm command inline.

### 6.10 Remote Control + push-when-blocked (Kyle directive 2026-06-16) — DON'T be the bottleneck

**Remote Control is ON** (app Settings → Claude Code → "Enable remote control by default"). Kyle can view + drive + **approve permission prompts** for any open session from claude.ai/code or the Claude mobile app (signed into his account). To attach a session that started before the toggle: run `/remote-control` in it. The local machine must stay awake/open (same limit as §6.9). With `bypassPermissions` ON, routine prompts are gone; the rare remaining ones (catastrophic patterns, protected paths) Kyle can now approve from his phone.

**★ STANDING RULE (BOTH sessions — Claude Old AND Claude New; ESCALATION model, Kyle 2026-06-16) — when you END a turn BLOCKED needing Kyle's response/decision/approval to proceed, do NOT notify immediately — escalate only if he stays silent ~10 min** (if he's at the keyboard he'll see the ask and answer; the notification is only to pull him in when he's away). Both push AND the messaging channel verified reaching his phone 2026-06-16. **Mechanism (Discord path since cutover #333):** (1) end the turn with the clear ask (visible instantly if present); (2) arm a one-shot background timer — `run_in_background` Bash `sleep 600` that, on completion, posts the one-liner to Discord `#general` via `cc-send --notify --sender "OLD Claude"` (the `--notify` @-mentions Kyle so it pushes to his phone; body `STILL NEED YOU: <ask>`); when that timer's completion re-invokes the session, ALSO fire `PushNotification` (the tool can't be called from inside the bash timer). (3) On Kyle's NEXT turn, FIRST `TaskStop` the pending blocked-notify timer so it never fires after he's already answered — **use the task_id the `run_in_background` call returned when you armed it (note it then); do NOT try to find it via `TaskList`, which lists only TaskCreate todo items, not Monitor/background-bash tasks (same gotcha corrected in §6.9 layer-3).** Net: notification fires ONLY if Kyle hasn't responded in ~10 min. Genuine blocks/decisions only, NOT routine progress. (Hard permission prompts FREEZE the session so it can't self-arm the timer — those rely on the app's own notification + Remote Control + bypass-makes-them-rare; flag to Kyle if one ever traps a session.)

**★ LANGSTON-FLAGGED APPROVALS → relay to Kyle (Kyle directive 2026-06-16).** When Langston flags something that needs KYLE's approval (not just CC's), the CC session that sees it surfaces it to Kyle as a plain Discord `#general` post via `cc-send --notify --sender "OLD Claude"` (`Langston flags <X> — needs your approval: <plain ask>`) + a `PushNotification`. Kyle approves in `#general`; CC carries it out. This is the agreed path because Langston's own bridge doesn't push to Kyle's phone and Langston has no Remote-Control channel.

### 6.11 Session-transcript bloat + scroll-bounce repair — governed procedure (B-DISCORD OBJ-7)

When a CC session's transcript grows too large (context overhead climbs; ~195MB ≈ 87% context, ~311MB sticks) OR the window exhibits **scroll-bounce / stuck-on-a-repeated-message** (the renderer keys on `uuid`; **duplicate uuids** — caused by compaction re-appending history blocks — make it jump/freeze), the fix is **findable here, not buried**: runbook `1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md` (§2.5 = the duplicate-uuid defect + repair) + tools `memory/{trim,distill,dedup}_transcript.py` and `memory/validate.py`. **Dedup** (`dedup_transcript.py`) keeps the first entry per uuid, drops byte-identical repeats, and re-stamps same-id-different-content collisions; **validate** confirms zero dupes. The session must be ARCHIVED during a file swap; re-homing re-stamps each entry's `sessionId` + drops `custom-title`. Pass file paths as ARGS (Windows MSYS can't resolve `/tmp`-style literals inside the script). Prune aggressively (~20–70MB target).

---

## 7. Infrastructure Reference

- **GitHub:** `kylegjordan/DawnTraderV3`, branch `migration/aws-supabase`. GitHub CLI `gh` at `"/c/Program Files/GitHub CLI/gh.exe"`, authenticated as `kylegjordan`.
- **Staging server:** Hetzner CPX22 at `188.245.193.8` (Falkenstein), Ubuntu 24.04. App runs as `dawntrader` under `deploy` user via PM2. **TLS edge (B-SEC-HARDEN #353, 2026-07-13): Caddy on :80/:443 terminates HTTPS (auto Let's Encrypt cert for `188.245.193.8.sslip.io`, auto-renew) and reverse-proxies to nginx on `127.0.0.1:8080`** (nginx keeps WS upgrade + rate limiting + the X-Forwarded-Proto allowlist map → app :5000). SSH is key-only (password auth off); ufw active (deny-in / allow-out / 22,80,443). Rollback: stop caddy + nginx `listen 8080`→`80`.
- **Database:** Supabase PostgreSQL 17.6 (Frankfurt), project `vqqyisaudwenrdhnmjwt`.
- **Staging URL:** **canonical = `https://188.245.193.8.sslip.io`** (HTTPS, clean padlock; B-SEC-HARDEN #353). The bare **`http://188.245.193.8` now 302-REDIRECTS to the HTTPS host** (Kyle 2026-07-13 — plain HTTP could still serve the login form = a cleartext-password path; the redirect closes it, no unencrypted login possible). Browsers/Claude-in-Chrome follow the redirect transparently, so §9.3 UI verification + login flows keep working — just land on HTTPS. Credentials: `testuser123 / SecurePass123!` or `kylegjordan`.
- **CI/CD:** GitHub Actions on migration branch — 4 checks (TypeScript Check, Test Suite, Build, Docker Build). ALL 4 GREEN since B56.
- **Replit:** FROZEN since 2026-03-30.

### Staging server commands
```bash
# Deploy:
ssh root@188.245.193.8 "su - deploy -c 'dt-deploy <full-40-char-sha> --by <session>'"   # B-DEPLOY-LOCK #649 — the raw chain is RETIRED; dt-deploy is the only deploy path

# Logs:
ssh root@188.245.193.8 "su - deploy -c 'pm2 logs dawntrader --lines 50 --nostream'"

# Status:
ssh root@188.245.193.8 "su - deploy -c 'pm2 list'"

# Authenticated API call:
ssh root@188.245.193.8 'TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"testuser123\",\"password\":\"SecurePass123!\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)[\"accessToken\"])") && curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/vts/filter-diagnostics'
```

### 7.1 Storage & sync workflow — THE canonical flow (🔒 SET IN STONE — Kyle 2026-07-23, superseding the 2026-06-01 rule)

> **📖 FULL REFERENCE — `1-system-manual/REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md`:** the conductor map (who moves what, which hops are automatic vs deliberate), the measured evidence behind every choice, and **the preserved 2026-06-01 incident record with its corrected root cause**. Nothing was deleted — depth moved per #564; the operative rules are all here.

**THE FLOW:** **each session's own clone on the laptop → push → GitHub review branch (`migration/aws-supabase`) → staging deploys the review branch → verified + approved advances `main`.** Backups fan out from there; they are NOT in the push path.

**★★ THE ONE-DIRECTION RULE — flow is one way; nothing ever flows back.**
- The **review branch takes input from exactly ONE source: the clones on Kyle's laptop.** Never from `main`, the Helsinki backup, Google Drive, or staging.
- From the review branch everything moves **OUTWARD only**; **`main` advances only from the review branch.**
- **Staging and the backups are TERMINAL IN NORMAL FLOW** — they receive, never send. *A copy that can write upstream is not a backup, it is a second author.*
- **★ ONE exception: DISASTER RECOVERY.** If the review branch is CONFIRMED LOST, re-seeding it from a backup is the only reason a backup exists — a **Kyle-authorized EVENT, not a flow.**
- **★ ENFORCED, NOT REMEMBERED:** the backup's push URL is a deliberately invalid `DISABLED://…` value. A push from it fails at git, not at somebody's memory.

**★ GITHUB IS THE SOURCE OF TRUTH** — what staging deploys, what CI grades, what Langston reviews at, what every `file:line` resolves against. **The laptop is authoritative for uncommitted work only: if it isn't pushed, it doesn't exist.**

**Each session works in its OWN INDEPENDENT CLONE on local NTFS:** `C:\DawnTraderV3-old` (CC-A) · `-new` (CC-B) · `-analyst` (CC-C) · `C:\DawnTraderV3` (spare, used by the Drive-archive script). **Separate clones, NOT worktrees** (worktrees force per-session branches, whose failure mode is a **silent revert at merge**; separate indexes are what structurally kill #557). A session's cwd does **not** need to change — work by absolute path.

**★ ALL CLONES SIT ON ONE BRANCH AND GIT ENFORCES THE SYNC.** Pull to receive, push to share. **Git REJECTS a push from a clone that is behind — a rejected push is the system working, not an error to route around: pull, then push.** With three sessions pushing, being behind is the normal state. ⚠️ **This does NOT weaken the review gate** — nothing lands unreviewed because it was easy to push.

**★ GOOGLE DRIVE IS NOT A GIT REMOTE AND MUST NEVER BE ONE.** Git's own FAQ forbids repos on cloud-sync. Measured here: a bare repo on `G:` reported **SUCCESS while holding no pack file at all**. Same root cause as #542 (path-limited-commit segfault; zero #542 recurrences REPORTED by any session since 2026-07-23 — an absence-of-reported-failure record, not per-commit proof of the form’s use (dated measurement + instrument reach: history doc §5.25)) and #567 (~99%-destroyed `node_modules`).

**Backups — two, both gated by REPRODUCTION:** (1) **Helsinki bare mirror** `/srv/dawntrader-backup.git` (langston-owned, push-DISABLED, self-pulling from GitHub every 15 min, doubles as Langston's whole-tree-search corpus); (2) **Google Drive archive** — ONE `git bundle` at `G:\My Drive\Dawn Trader\DawnTraderV3-backup.bundle`, nightly 03:00, same name/path always overwritten (no versions to track; **cadence settled nightly, #576 CLOSED**).
- **★★ THE GATE IS REPRODUCTION, NOT COMPARISON.** Comparing refs proves the pointers agree and nothing about whether objects exist — **that check certified an EMPTY backup four times.** PASS is earned only by cloning FROM the backup and matching a known path's object hash against source.
- **★ A backup is a SEPARATE REMOTE, never a second push-URL on `origin`** — a dead backup leg **blocks the normal push outright.** Backups must never be able to stop work.

**★ WHO MOVES WHAT (summary; full map in the runbook):** clone→review branch = **the session that did the work**. Review branch→Helsinki (15 min), →Drive archive (nightly) = **automatic, self-pulling**. Review branch→**staging** and →**`main`** = **the session that owns the batch, deliberately manual** (a deploy restarts live trading; `main` advances only at batch close after verification + Langston + Kyle's acknowledgement). **`main` is force-push- and delete-protected.**
- **★ "Someone else pushed" is announced** — `dt-push-notice.sh` (Helsinki, every 2 min) posts ONE line naming all sessions when the branch head moves. **Deliberately minimal by Kyle's instruction: the sha and nothing else.** ⚠️ **Do NOT narrate push notices to Kyle** (§5 rule 28).
  ⛔ **SINCE 2026-08-18 (#694) THE ROUTINE NOTICE STILL POSTS BUT NO LONGER WAKES YOU — do not rely on it reaching you mid-task.** The wake filter suppresses **only** the sha-only body; you learn the branch moved at your next `git fetch`, which §7.1’s gate already forces before any push. ★ **THE ESCALATED VARIANT — the "THE RULES CHANGED IN THIS PUSH — PULL AND RELOAD NOW" one — STILL WAKES, and that is deliberate: the fetch gate fires at your NEXT PUSH, which may be hours out, while that line exists to reach you MID-TASK.** *(Both variants ship under the same `--sender "Push notice"`, so the suppression is CONTENT-keyed and FAILS SAFE: anything that is not exactly the routine sentence — including a reworded future escalation — is DELIVERED.)*
- **★ The uncommitted-work nag was DELIBERATELY NOT BUILT** (Kyle): it fires mid-edit and tells someone what they already know; noisy alerts get ignored. The fortnight-scale case is covered by **sync-gate check 4**. Do not re-propose without a new failure that check 4 misses.

**★ NOTHING CARRIES TO AN INDEPENDENT CLONE** — git identity (global is empty; the first commit outright FAILS without it), remotes, `http.postBuffer` 500 MB, untracked local config (`.claude/launch.json`). `node_modules` are per-clone, never shared.

**★ LANGSTON READS OFF THE REVIEW BRANCH — no working copy at all.** Single file = raw GitHub at the stamped sha; whole-tree search = `dt-review` (pulls from GitHub FIRST, refuses on failed fetch). **Full detail: `1-system-manual/LANGSTON_ARCHITECTURE.md` §6.** Never `/mnt/gdrive`.

**`C:\dev` is RETIRED** (deleted 2026-07-24; stashes archived at `root@204.168.141.77:/root/backups/dev-bench-stashes-2026-07-23/`). **The old Google Drive working folder is RETIRED** (push URL disabled, marker file at its root, moved by Kyle to `Frozen Jan - July 2026 REPO/`).

**🔒 BATCH-CLOSE SYNC GATE (HARD — every batch).** From your OWN clone:

**0. ★ `git fetch origin` FIRST — the gate is INVALID without it.** `origin/<branch>` is a **local cached pointer**, refreshed only by a fetch. Without step 0, check 1 compares you against your own stale copy and **reports "behind 0" while you are genuinely behind** — measured 2026-07-24 on `C:\DawnTraderV3-old`: reported behind **0**, and after a fetch reported behind **3**. This is the absent-as-valid class (#546/#568) inside the gate meant to catch it. **Then all four must hold:**

1. `git rev-list --count HEAD..origin/migration/aws-supabase` = **0** (not behind), AND
2. `git rev-list --count origin/migration/aws-supabase..HEAD` = **0** (nothing committed-but-unpushed), AND
3. `git status --porcelain --untracked-files=no` shows only intentional local config, AND
4. **`git status --porcelain | grep '^??'` reviewed BY EYE** — every untracked file committed, deliberately ignored, or named disposable. **An untracked file is invisible to checks 1–3**, and `git diff HEAD` does not show untracked files or say so (#542 corollary). This check exists because a never-committed file sat in one place 2026-07-08 → 07-23.

**The crew coordination board — what it is FOR now.** Separate clones dissolved the race it was built for (#557 — structurally impossible now, not merely unlikely), and git's push rejection is harder than its advisory lock. **What remains: git cannot warn two sessions IN ADVANCE that they are about to work the same file** — it only discovers that at pull time, and the dangerous version merges cleanly while being semantically wrong. So **claim shared paths before editing** (`crew claim <path…> --note "<batch id>"`, release when done), treat it as a notice board, and **do not treat it as a lock** (§5 rule 25.b).

**🚫 STILL FORBIDDEN:** never author in a backup, never push from one, never let any copy silently diverge without a **reproduction** check catching it.
---

## 8. Langston Operations Reference (post-OpenClaw, 2026-05-06)

- **Server:** Hetzner CPX22 at `204.168.141.77` (Helsinki). Ubuntu 24.04. Hostname `dawntrader-agent`.
- **Runtime:** Claude Code 2.1.159+ under Kyle's Max OAuth (updated from 2.1.131 on 2026-06-01 to fix the `[1m]` thinking-block-on-tool-use error). Token at `/etc/langston/oauth.env` (mode 640 root:langston, valid 1 year — rotate by 2027-04 via `claude setup-token`).
- **Default model: `claude-opus-5[1m]` (Opus 5, 1M context — switched 2026-07-27, Kyle-directed).** Anthropic's official docs now list Opus 4.8 as **legacy** with an explicit migrate-to-Opus-5 recommendation; Opus 5 is same price ($5/$25 per MTok), same 1M context, newer cutoff (May 2026). **★ THE MODEL IS SET AT TWO LIVE SITES — SWITCH BOTH OR HE RUNS SPLIT:** (1) `/opt/discord-bridges/discord-langston-bridge.py:69` `CLAUDE_MODEL` (the Discord conversational path) and (2) `/usr/local/bin/langston-call:38` `MODEL` (the generic invoker the **alert/queue** path uses). The second site was found by census at the 07-27 switch — the older wording here named only the bridge, and a single-site switch leaves alerts on the old model, a silent split that reads as reasoning drift rather than config drift. **Rollback:** restore `*.pre-opus5-20260727-234713` for BOTH files + `systemctl restart discord-langston-bridge.service`. ⚠️ The pre-07-02 rollback paths formerly listed here (`/usr/local/bin/langston-bridge.py*`, `langston-bridge.service`) are the **decommissioned Telegram-era bridge** and are DEAD — do not use them (corrected 2026-07-27). Prior models: Opus 4.8 `[1m]` 2026-06-13→07-27; Fable 5 `[1m]` 06-09→06-13. Full build record + change log: `1-system-manual/LANGSTON_ARCHITECTURE.md`.
- **Working directory:** `/home/langston/` owned by `langston`. Contains `CLAUDE.md` (persona, ~261 lines including §11 "When to respond in the group" with `[SILENT]` marker rules) + `MEMORY.md` (volatile state, mirrors project's MEMORY.md, ≤200 lines). Both auto-load every claude-cli invocation.
- **★ LIVE COMMS FABRIC = DISCORD (since cutover #333, 2026-06-25)** — all in `/opt/discord-bridges/` on Helsinki:
  - **Bridges (systemd):** `discord-cc-bridge.service` (CC's outbound to `#general` + Kyle/voice inbound → `/var/log/cc-discord-inbox.jsonl`) + `discord-langston-bridge.service` (Langston's native in-channel reasoning + replies; engages a CC post only when it LEADS with "Langston"). Both run on `discord.py` in the venv at `/opt/discord-bridges/venv/`.
  - **Two Discord bot apps** ("DawnTrader CC", "Langston"), MESSAGE_CONTENT intent ON. Tokens: `/etc/langston/discord-cc-bot.env`, `/etc/langston/discord-langston-bot.env`. Channel/IDs: `/etc/dawntrader/discord-comms.env` (`DISCORD_CHANNEL_ID`, `KYLE_DISCORD_ID`, `CC_BOT_ID`).
  - **Outbound dispatcher:** `cc-send` (`/usr/local/bin/cc-send`, routes by `COMMS_BACKEND`) → `discord-cc-bridge.py send --sender "OLD Claude|NEW Claude" [--notify]`. Webhook posts the `--sender` as the display name.
  - **Switch file:** `/etc/dawntrader/comms-active.env` (`COMMS_BACKEND=discord`). One-line lossless rollback to `telegram`.
  - **Langston self-advance review queue:** `langston_queue.py` (gated by `LANGSTON_SELF_ADVANCE`); component detail in SIM "Discord Comms Fabric".
- **Logs (Discord = live):** `/var/log/cc-discord-inbox.jsonl` (read this — Kyle/voice inbound + Langston round-trip + cc mirror); plus the bridges' journald units.
- **🗄 Telegram set — DECOMMISSIONED 2026-07-02 (B-TELEGRAM-DECOMM, #348):** bridges stopped, unit files removed, scripts archived (`/root/telegram-bridges-archive-2026-07-02/` + repo `_archive/deleted-code/*.removed`); `/var/log/cc-bridge-inbox.jsonl` kept frozen as history. Bot accounts + token env files (`/etc/langston/telegram-bot.env`, `/etc/langston/ccdt-bot.env`) left registered-but-unused (deleting the accounts = Kyle's call). Entry in `DELETED_COMPONENTS_LOG.md`.
- **Voice transcription** (B-NEW-41, 2026-05-17): `whisper.cpp v1.8.4` at `/opt/whisper.cpp/build/bin/whisper-cli`, model `ggml-small.en.bin` at `/opt/whisper.cpp/models/`. ffmpeg as Ogg→WAV preprocessor. Audio archive at `/var/log/cc-bridge-voice-archive/{cc,langston}/<YYYY-MM-DD>/<msg_id>.ogg` with 30-day logrotate + 5GB cron prune (`cc-voice-archive-prune.timer`).
- **Langston-side staging SSH** (B-NEW-41, 2026-05-17): keypair at `/home/langston/.ssh/id_ed25519`; staging access as `deploy@188.245.193.8` with `from="204.168.141.77"` IP restriction; alias `ssh staging` available via `/home/langston/.ssh/config`. Use for Step 8 second-pass verification + Langston-side §10.5 alerts check.

### 8.1 OpenClaw — DECOMMISSIONED 2026-05-06

OpenClaw replaced as Langston's runtime. See history doc §8.1 for the migration narrative + cost context. Cleanup status: OpenClaw `default` and `ccdt-relay` Telegram accounts both `enabled: false` in `/root/.openclaw/openclaw.json`; `openclaw-gateway` user-systemd service may still be running but idle. Optional cleanup: `systemctl --user stop openclaw-gateway && systemctl --user disable openclaw-gateway`.

**Obsolete commands not to use:**

| Don't use | Use instead |
|---|---|
| `openclaw message send` | `cc-send --sender "<your name>" --message "..."` |
| `openclaw agent --deliver` | a Discord `#general` post LEADING with "Langston" (§6.5) |
| `cc-inbox read && cc-inbox mark-read` | `tail /var/log/cc-discord-inbox.jsonl` |

### 8.2 Diagnostic Runbook — "Bridge Is Misbehaving"

**📖 `1-system-manual/COMMS_BRIDGE_RUNBOOK.md`** — the ordered check sequence (service status → OAuth token → the historical Telegram-era steps → the long-review hang and its GDrive-mount root cause). Moved out per #564: you read it when something is broken, not on every turn. Nothing removed.

---

## 9. Investigation, Findings & Reporting Discipline *(renamed 2026-08-23 — Kyle)*

> ⚠️ **RENAMED, AND THE OLD NAME WAS ACTIVELY MISLEADING.** It read *"System Impact Map & System Manual Discipline"*, which centres the whole section on two documents — but only the opening rules are about those. **Everything else here is how you INVESTIGATE and how you REPORT what you find:** §9.1 declaring scaffolding that is not yet functional · §9.2 surfacing any number that has changed · §9.3 what *"verified on staging"* is allowed to mean · §9.4 giving every "fix it later" a dated home · §9.5 how to audit a subsystem without missing the second mechanism. **A session looking for the investigation rules would not have looked here, and that is a governance failure of exactly the kind §9.5 exists to catch — in the index rather than in the code.**
> ★ **THE SECTION NUMBER IS UNCHANGED ON PURPOSE.** MEASURED before renaming: **237 inbound citations use `§9`** (overwhelmingly `§9.3`, `§9.4`, `§9.5`) and only **3** cite the old title text. Renumbering would have broken all 237; renaming breaks 3, which are corrected in this same commit.

**Framing rule — buried implemented logic is a governance failure, not just a documentation miss.** The job of CC and Langston is to SURFACE buried details. See history doc §9.framing for the DBS-orphan canonical example.

**Both maps are SELF-DOCUMENTING — read/maintain per their own top-of-file header (Kyle directive 2026-06-15; substance lives in-doc where it's used, NOT duplicated in this always-loaded file).** `SYSTEM_IMPACT_MAP.md` opens with How-to-Use + a Table of Contents + the **"Cross-Cutting Runtime State, Singletons & Liveness Registry"** (read it before any change touching mode / engines / shared in-memory state); per-batch history is archived at the BOTTOM. `SYSTEM_MANUAL.md` opens with a "How to read & maintain" note + Table of Contents (Chapters 1–12 + Part VI Appendices). **Maintenance convention for both:** write new architecture INTO the relevant Layer/Chapter and update the Table of Contents — do NOT append dated sections at the tail; per-batch notes go in the bottom archive / Part VI, and a still-core note folds up into its Layer/Chapter.

**Rules:**

1. **Pre-audit (Step 2):** Read `1-system-manual/SYSTEM_IMPACT_MAP.md` for every affected component. Trace UPSTREAM dependencies, DOWNSTREAM consumers, SHARED STATE, BACKGROUND EXECUTION, BLAST RADIUS. Also read `SYSTEM_MANUAL.md` for architectural / mathematical truth. If scope contradicts System Manual, one of them is wrong — flag it. If either file is silent on something the batch touches, that itself is a governance gap — flag it. Document in `BATCH_N_PRE_AUDIT.md`. Langston reviews the SIM + System Manual analysis before implementation.

2. **Implementation (Step 3):** If you discover a component is more connected than SIM showed, stop and update SIM before continuing. Don't paper over it.

3. **Governance (Step 10):** Any batch changing architecture, formulas, routing, thresholds, or canonical meaning is **incomplete** until SIM and System Manual are updated where applicable. Completion report listing code changes but omitting SIM / System Manual updates (when applicable) is rejected, not approved.

4. **System Manual scope:** architecture, strategy logic, regime detection, filter design, signal pipeline, quantitative math, canonical meaning of regime/strategy/filter terms.

5. **SIM scope:** every component with upstream feeders, downstream consumers, or cross-cutting state.

**Proactive surfacing.** When you spot orphaned code, unused metrics, dead endpoints, undocumented dependencies, fields written-but-never-read, parameters declared-but-never-referenced — flag them immediately as governance-failure candidates.

**Anti-pattern:** "I'll update the governance docs after the code is deployed." No. Deferred governance becomes forgotten governance. Update as part of the same batch, reviewed by Langston, before close.

**Anti-pattern (Kyle directive 2026-06-16 — after a real P19-B4b D5 miss): "we reorganized/reformatted the doc recently, so it must be current." NO — reorganizing ≠ updating content.** A navigability pass, a TOC add, a history-archive move, a consolidation — none of those discharge the obligation to update a doc's CONTENT for the CURRENT batch. The System Manual and the SIM each get a CONTENT update at **every batch AND sub-batch that changes what they document** (System Manual = architecture / strategy logic / regime / filter / signal pipeline / math; SIM = any added/removed/re-keyed component or cross-cutting state) — having just reorganized the file is irrelevant to whether this batch's architecture change is recorded in it. A batch is NOT complete (and "fully closed" must NOT be claimed) until every APPLICABLE Tier-1 + Tier-2 doc has its content update landed — the completion report's governance-files-changed list is the checklist, and if the System Manual/SIM were applicable but absent from it, the close is rejected (§9.3). Sub-batches are batches for this purpose: each one gets its own applicable governance, not a deferred lump at the parent's close. (Use judgment on APPLICABILITY — a pure display/data-quality service is SIM-scope, not System-Manual-scope — but apply the judgment explicitly; do not skip the doc by default.)

### 9.1 SCAFFOLDING-VS-FUNCTIONAL declaration (Kyle directive 2026-05-11)

Any sub-batch shipping scaffolding without making the user-facing capability functional MUST state this at the TOP of the completion report, in bold, separated from other content:

> 🚨 THIS BATCH DOES NOT MAKE \<CAPABILITY\> FUNCTIONAL. \<CAPABILITY\> WILL REMAIN INERT UNTIL \<BATCH N+x\>.

Equally applies in real time — if mid-conversation you tell Kyle a capability is being set up but won't actually be active until a later batch, surface as bold-prefixed inline disclaimer, not a parenthetical. See history doc §9.1 for the B79.0d ORB + xstock_spot scaffolding origin cases.

### 9.2 NUMERIC-DELTAS-MUST-BE-SURFACED (Kyle directive 2026-05-11)

Any change to a previously-stated number (strategy count, threshold value, sub-batch count, LOC estimate, sequencing day, verification gate count) MUST be surfaced in the next user-facing communication as:

> **PREVIOUSLY STATED: X. NOW: Y. REASON: \<one line\>.**

Pre-audit and completion reports MUST include a "PREVIOUSLY-STATED-VS-NOW" section at the top listing every prior-number → new-number delta with decision source cited. Applies retroactively to in-flight communications: if you realize a previously-stated number is now different, lead the next message with the PREVIOUSLY/NOW/REASON block. See history doc §9.2 for origin context.

### 9.3 STAGING-VERIFIED means UI-navigated, not curl-checked (Kyle directive 2026-05-11)

"Staging verified" / "verified on staging" / etc. is **reserved for outcomes visually inspected on the staging UI via Claude-in-Chrome**. It is NOT satisfied by: a successful API curl, a psql row count, a PM2 log line, or a `npm run build` + `pm2 restart`. Those are backend health checks — they do NOT prove the UI panel renders correctly, that values aren't undefined-rendering-as-"--", or that the layout isn't broken.

**Requires:** invoke `mcp__Claude_in_Chrome__navigate` to load the staging URL; use `mcp__Claude_in_Chrome__read_page` or `get_page_text` to read the actual DOM; cross-check rendered values; optionally screenshot via `mcp__Claude_in_Chrome__gif_creator`. Kyle's browser opens a tab when Claude-in-Chrome navigates — false claims of "staging verified" are immediately detectable.

**★ STRENGTHENED (Kyle directive 2026-07-16) — UI verification is now a REQUIRED verification step BY DEFAULT, not only when Kyle asks.** The era when everything was backend plumbing is over: with active trading ON, the majority of changes have a staging-visible surface (Filter Diagnostics tabs, the Ready-to-Buy queue tab, Open/Closed Trades tabs, the Dashboard). For ANY change with a UI-visible surface, the implementer MUST navigate the staging site (Claude-in-Chrome / the browser tools), load the affected tab(s), and visually verify the change renders and behaves correctly — as part of Step 7, before claiming completion. Backend health (logs, psql, curl) alone is INSUFFICIENT: "working in the background but not showing on the front end" is a failure state Kyle cannot detect, and it can mask or cause other problems. This was not being done consistently (Kyle called it out 2026-07-16 after the Open Trades crash sat visible on staging while backend checks read green).

**Flip side — when Kyle asks for UI verification, it is NOT optional.** If Kyle says "verify it on staging" / "check the UI" / "navigate to the staging site and confirm" — hard requirement to use Claude-in-Chrome, not a suggestion.

**No assumptions when Kyle reports issues.** Every issue raised must be confirmed (reproduce + locate code path + quote actual data), investigated (not dismissed with "marked N/A"), tracked in a dedicated batch-tracking document. Quick-fixing one item + declaring everything resolved is the failure mode. Enumerate → tackle each with evidence → only mark resolved when independently re-verified. See history doc §9.3 for the full rationale.

### 9.5 ARCHITECTURAL AUDITS — ENTRY-POINT ENUMERATION + PROVENANCE READ (Kyle directive 2026-07-19)

**Origin:** the RTB refresh ran TWO independent mechanisms concurrently over the same queue for ~7 months, and **two separate audits missed it** — both traced forward from ONE entry point and both read only CURRENT code and CURRENT docs. *(Full narrative + the audit record: history doc §9.5-origin-rtb.)*

**Two mandatory steps for ANY audit, pre-audit (`workflow-02-audit-and-plan`), or architectural dispute touching a subsystem:**

**(a) COMPONENT CENSUS AT EVERY HOP — NOT A PATH TRACE.** ⚠️ **An end-to-end trace is satisfied by the FIRST SUFFICIENT EXPLANATION at each hop** — reaching a component it asks *"what happens here?"*, finds **a** mechanism, and moves on, because the narrative already works. **Nothing in the method ever asks "is there a SECOND thing doing this?"** ⇒ **A COMPLETE NARRATIVE IS NOT AN EXHAUSTIVE INVENTORY.** So at every component on the path, produce a CENSUS, not a step. *(Why an explicitly end-to-end-instructed audit still missed it: history doc §9.5-why-a-trace-is-not-enough.)*

| Census question | Why it is the one that catches duplicates |
|---|---|
| Who **writes/creates** here? | multiple producers |
| Who **reads** here? | hidden consumers |
| Who **mutates** state here? | competing updaters |
| **Who DELETES here?** | ★ the highest-yield question — BOTH RTB refresh mechanisms delete queued signals; this alone surfaces them |
| Who **schedules/starts** work against it? | timers, clock subscriptions, service `.start()`, bootstrap, cron, event subscriptions |

Repo-wide grep per question, tests excluded; state each list in the audit. If a list has exactly one member, say so explicitly (asserted absence needs presence-evidence, rule 22). **Two or more schedulers over one component require a mutual-exclusion check** (does mechanism 2 respect mechanism 1's in-flight guard?).

**★ (a-ii) DELETION-TIME STATE-WRITE CENSUS — before cutting ANY code, enumerate the STATE IT WRITES and grep for READERS of each (#568, Langston-endorsed 2026-07-22).** Caller-tracing answers *"does anything still CALL this?"* — but a **removed WRITER whose READER survives produces NO compile error and NO failing test**, so caller-tracing, green CI and a clean `tsc` all pass while the deletion silently breaks a live dependency. ⇒ **A deletion is verified by "zero callers AND every state it wrote has no surviving reader" — never by zero callers alone.** ⚠️ **And tracing forward from one entry point structurally CANNOT discover a second entry point**, so enumerate every scheduler, timer, clock subscription, service `.start()`, bootstrap call, cron and event subscription FIRST, repo-wide, tests excluded — and **if exactly one exists, SAY SO** (an asserted absence needs presence-evidence, rule 22). Concurrent entry points additionally require a mutual-exclusion check. *(The five absent-as-valid instances in one day, and the `isRefreshing` case: history doc §9.5-a-ii-origin.)*

**(b) READ THE PROVENANCE — original intent, not just current state.** For any component whose behavior is disputed, surprising, or predates the 2026-01/02 governance change (the Replit exit), consult BOTH:
- **`bridge/canonical/`** — the pre-governance reference corpus (`DawnTrader_System_Architecture_Execution_Flow.md`, `DawnTrader_Current_State_Reference.md`, `DawnTrader_Complete_Project_History.md`, `DawnTrader_System_Invariants_Design_Guarantees.md`, the `Phase_N_Implementation_History.md` set). **Kyle's framing (2026-07-19): these document the system we INTENDED to build at that time. The purpose is unchanged; the architecture has completely changed — so they are NOT current-state truth and must never be cited as such. Their value is WHY something was built the way it was.** Refer back to them whenever we are in dispute over how something functions.
- **Git archaeology of the component's origin** — `git log -S "<symbol>" --reverse`, then READ the introducing commit's message, its attached directive/spec (Replit-era commits often attach the directive under `attached_assets/`), and what it deleted.

**(b-ii) SEARCH THE GOVERNANCE LEDGER BEFORE FILING ANYTHING AS A FINDING (added 2026-07-19 after a third recurrence).** Before recording ANY behavior as a defect/discovery, grep `RUNNING_ISSUES.md` + `BATCH_CATALOG.md` + the completion reports for the component and the symbol. **A deliberate, Kyle-approved, Langston-reviewed decision reported as a defect is worse than no finding** — it burns review cycles and impugns work that was done correctly. ★ **And when the CODE COMMENT names its own provenance — a batch id, an issue number, "Langston-approved" — FOLLOW IT. Do not read it and move on.** (The RTB audit reported the shadowed Confidence/Governance gates as a discovery; the comment beside them cited "P19-B8.5 OBJ-6 (Langston-approved)" and "#514" — a three-day-old governed decision. Kyle caught it from memory. See #534 WITHDRAWN.) A finding that survives this check is real; one that does not becomes a cross-reference, and any NEW insight about it (e.g. a coupling to other work) is recorded ON the existing issue rather than as a fresh one.

**The synthesis is the point, not the inventory.** The RTB finding was not *"A is right, B is wrong"* — it was *the documented mechanism has the right engineering and the wrong semantics; the undocumented one is the reverse; combine them.* **That judgement is UNREACHABLE from current code alone.** *(Worked example: history doc §9.5-the-synthesis.)*

**Recording rule:** every audit states what the provenance read found — including "consulted `bridge/canonical/`, no coverage of this component" (itself a finding: the canonical corpus documented only ONE of the two RTB mechanisms). A batch that changes a component documented in the canonical corpus updates the CURRENT docs (SIM / System Manual); the canonical corpus is a frozen historical record and is NOT edited.

### 9.4 SURFACED-ISSUE SCHEDULING — every "fix it later" gets a named home, NOW (Kyle directive 2026-06-13)

When CC and/or Langston surface an issue worth fixing and agree it should be fixed, it MUST be given a **concrete scheduled home at the moment of agreement** — a named batch, a specific roadmap phase AND item number, or a dated scheduled task/alert. **"Fix it later" / "in a future phase" / "post-launch" without a named home is NOT acceptable.** The failure mode this kills: vague deferral → everyone forgets → it never happens.

⛔⛔ **A HOME IS A NAME AND A PLACE IN THE QUEUE — NEVER A CALENDAR DATE. DO NOT PUT A DUE DATE ON A BATCH (Kyle directive 2026-08-25).** His words: *"Who knows what we're gonna be doing on September fifth?"* **Batches are SLOTTED into the current batch/task list where they make the most sense; they are not booked against a day.** A date on a batch is a **fake commitment** — nothing enforces it, the queue in front of it moves, and it expires into a stale record that reads as a missed deadline rather than as work that was correctly re-ordered.
★ **THE ONE THING A DATE IS FOR, and it is the reason the mechanism exists at all: a period whose LENGTH is the point** — an observation window, a soak, a test period, a data-collection run. *"+48h gate"*, *"14-day soak"*, *"collect 30 days"*. **There the days ARE the content**, so the date is a measurement parameter, not a promise. `RUNNING_ISSUES` #87's *"+48h gate"* is the correct shape; **`B-GATE-GUARD` due 2026-09-05 was not.**
⛔⛔ **AND "QUEUED" IS NOT A HOME EITHER — THAT WORDING WAS MINE AND IT WAS WRONG (Kyle, 2026-08-26).** Striking the date does not license a vaguer home; **it raises the bar on the PLACE.** ★ **THE HOME IS A SPECIFIC PLACEMENT IN THE PHASE PLAN — A POSITION ANYONE CAN LOOK UP AND SEE.** Kyle’s words: *"it didn’t actually do the thing it was supposed to, which is to put it in a specific place in our phase plan, where anyone can look and see — okay, this is where that hotfix or that batch goes."*
⇒ **WRITE IT INTO `PHASE_19_PLAN.md` (or the active phase plan / `POST_AUDIT_ROADMAP.md`) AS A REAL, PLACED ITEM** — named, owned, and **positioned relative to the work around it** — then cite that placement in the `RUNNING_ISSUES` entry. **The ledger entry POINTS AT the plan; the plan is where the position lives.**
⚠️ **THE FAILURE THIS KILLS, measured 2026-08-26: a session named the batch, minted an issue number, declared it "locked", correctly refused a due date — AND NEVER PUT IT ANYWHERE IN THE PLAN.** Every ceremony of homing was performed and **the item still had no place**, so it is invisible to anyone reading the plan to find out what happens next. **Naming is not placing.**
⇒ **WRITE IT IN THIS FORM — IT IS A FORMAT, NOT A REMINDER:**
> `HOME: B-<NAME>, owner <session>, placed in <plan> at <position>, after <item>`
⚠️ **RESTORED 2026-08-27 (Langston condition 3). Kyle’s correction was to the FALLBACK — the word "queued" — and I deleted the TEMPLATE along with it, replacing a format with prose.** That is the same trade his own B-MEASURE-GATE rule refuses: **a gate that is a format gets followed; a gate that is a paragraph gets paraphrased.** The fallback is struck; the form stays.

★ **IF THE RIGHT POSITION IS GENUINELY UNCLEAR, SETTLE IT WITH LANGSTON AND RECORD WHAT YOU AGREED** (§6.7 iterate-and-decide). **"I discussed it and we placed it after X" is a home. "Queued" is not.**
⚠️ **NOT A LICENCE TO GO VAGUE — the rest of §9.4 stands unchanged.** The name, the owner and the ledger entry are still mandatory; only the DATE is struck, because it was the one part of the home that nothing could keep true.

**Mechanics (mandatory):** (1) the item lands in `RUNNING_ISSUES.md` with its assigned home stated explicitly in the entry; (2) if it's a roadmap item, it is written into `POST_AUDIT_ROADMAP.md` (or the active phase plan, e.g. `PHASE_19_PLAN.md`) as a real numbered/named item — not just referenced; (3) the completion report or message that surfaces it NAMES the home; (4) if the right home is genuinely a judgment call (e.g. Phase 19 small-batch vs Phase 20 workstream), CC + Langston decide it then and there (escalate to Kyle only on no-consensus) — but a home IS chosen before the item is considered "handled." A surfaced issue with no home is an open loop, and open loops get dropped. Applies to BOTH CC and Langston (his CLAUDE.md carries the matching rule).

---

## 10. Session Startup Checklist

**On first message of a new CC session, in this order:**

1. Read the shared `MEMORY.md` **and your own per-session file** (`MEMORY_CC_A/B/C.md`) in `~/.claude/projects/<your-project-slug>/memory/` (auto-loaded; confirm current phase, current batch, next step).
2. Check current phase against `POST_AUDIT_ROADMAP.md` to confirm orientation.
3. Read the latest batch completion report in `Claude Comms and Packages/Batch Completion/` if a batch recently closed.
4. If mid-batch: read active scope + pre-audit files in `Claude Comms and Packages/Scope Files/`.
5. Acknowledge readiness in one line — do NOT dump full context back at Kyle.
6. Wait for his directive.

**Do NOT:** start implementing before understanding the current state; announce polling status; confabulate about prior session details; skip the pre-audit SIM review.

---

## 10.5 System Alerts per-turn check (Kyle directive 2026-05-17 — MANDATORY)

Every CC session — both CC (this) and Langston — must perform this check **before responding to any user message**, on every turn, regardless of session age.

**Procedure:**
1. Read `/var/log/dawntrader/system-alerts.jsonl` from staging via SSH:
   - CC sessions: `ssh root@188.245.193.8 'tail -50 /var/log/dawntrader/system-alerts.jsonl'`
   - Langston sessions: `ssh staging 'tail -50 /var/log/dawntrader/system-alerts.jsonl'` (via `~/.ssh/config` alias, IP-restricted to Helsinki)
2. For each entry where `state === 'active'` AND `acknowledged_at === null` AND `triggers_at <= NOW()`: surface to user **as part of your response in plain language** (not raw JSON, not file paths); cite `id`, `title`, `severity`, `body`, `metadata`; state whether action this turn or FYI.
3. If you ACT on an alert: `ssh <user>@188.245.193.8 'cd /home/deploy/dawntrader && npm run system-alerts -- ack <id> --by <session-name>'` (session names: `cc-session-<YYYY-MM-DD>` or `langston` or `kyle-direct`).
4. If can't reach staging (SSH timeout / file missing / Hetzner unreachable): state explicitly to user; continue with user's request anyway.

**Why mandatory:** sessions can be days/weeks apart; whoever's at the keyboard when a scheduled check fires is the one who picks it up. Telegram messages don't get reliably read (too much technical CC↔Langston chatter). Per-turn check ensures alerts get surfaced. See history doc §10.5 for full rationale. **Failure to perform on every turn is a process violation** — not session-start-only; alerts can fire between turns of a long session.

**Queue contents:** scheduled verifications (e.g., 14-day soak verification), one-off reminders, recurring health checks, breakage triggers. Dispatcher cron on staging promotes scheduled events to active when `triggers_at` arrives. See `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md` §2.8 for architecture.

**★ Post-diagnosis handling (B-ALERT-PROTOCOL #340, 2026-06-23):** the per-turn check above is the PULL side (read + surface). What happens AFTER an alert is diagnosed — who owns the follow-through, the ack=owned / resolve=fixed discipline, the per-class action table, and the no-silent-drop re-surface closure guarantee — is the definitive process in **`1-system-manual/ALERT_HANDLING_PROTOCOL.md`**. Short version: Langston's triage ends with `[[ALERT id=.. owner=<CC-A|CC-B|Kyle> action=".."]]` → the wake routes to the owner → owner `ack --by` (claims) → does the work → `resolve --by` (the ONLY thing that stops the dispatcher re-surfacing it on a widening back-off + escalating to Kyle).

---

## 11. Kyle Preferences

> **MOVED to `CONDUCT.md` sections 11 and 2 (B-CONDUCT-FILE, 2026-08-20) — it is AUTO-LOADED on every start, resume and compaction, so it now arrives BEFORE you act instead of being findable after. Nothing was deleted.**

**STAY HERE — these are workflow and verification gates, not conduct:** outcomes-based verification (a batch is done when objectives are green in the UI, not when code compiles) · **no hard-coded fallbacks for DB-governed settings** — if it should come from the DB, fail hard when the DB is empty, do not silently use a default · code-level reviews from Langston, not high-level glosses · if Langston cannot complete a task he says so immediately · all governance in the repo, one canonical copy per file · every completion report lists the governance files changed · **CI must stay green** · visual verification in the browser for UI changes · full purge mentality — do not defer legacy cleanup.

---

*End of CLAUDE.md. Current project state lives in `~/.claude/projects/<your-project-slug>/memory/` (§3.1). Rule origin stories + empirical backstories live in `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md`.*
