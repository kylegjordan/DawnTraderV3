# B-WORKFLOW-IMPROVE — SCOPE (Step 1)

change-class: non_architecture
owner: PM Claude (KD-103; crew tooling only, no trading code) · reviewer for this batch: Coltrane (KD-103; Langston is off for usage) · plan row: `SPRINT_TO_LIVE_PLAN.md` stage 0 (PM Claude) order 2, after B-TOKEN-ECONOMY
STEP: 1 of 11 (gate passed with conditions, r2) · NEXT STEP: 2 of 11

## Intent (Kyle's words, 11-18 and KD-103)
11-18:
> "Ability to capture the intent and purpose of a batch and make sure that it is fulfilled by the completion of this batch, and that our audits and our scope work are thorough and cover every piece of our system that is impacted by the batch... so that... that build, once completed, is correct and does not disrupt, break, or cause these other systems to malfunction."

Also: recommend only meaningful changes.

11-19 (on the census script):
> "it should be a supporting tool as opposed to the only tool... its limitations need to be investigated and understood before we implement it and make sure that once they're understood that we set our reliance on it accordingly."

KD-103:
> "the plan for these new search designs and integration into the workflow...and any other workflow improvements Coltrane approved... works for both the Claude and Codex sessions."

**Done means:**
- every batch carries one traceable record from intent to proof;
- the four search aids are written into the steps where they fire, with stated limits, for both crews;
- no new rule blocks work until a pilot on closed batches supports it.

## Design sources (reviewed)
- `1-system-manual/pm/reviews/2026-11-19_WORKFLOW_REVIEW_PRELIMINARY.md` r7: R0-R5 and the search-aid table. Coltrane's advisory review was folded in at 11-18 23:21Z.
- `2026-11-19_CREW_EFFICIENCY_AND_WORKFLOW_DESIGN.md` §2, §3 and §6: Coltrane PROCEED WITH CONDITIONS at 11-19 01:40Z.

Where this scope and those documents differ, this scope is the build contract.

## Ground rules from the review (binding)
- **Every new rule lands as draft and non-blocking.** It becomes a gate only after the pilot (OBJ-9) supports it, and that switch is recorded with Coltrane's (or Langston's) ruling.
- **Every search aid is a Git Bash command-line tool.** Both crews and both reviewers run it the same way. Its output is a lead, never a completeness claim.
- **Every artifact records the role and the actual actor,** plus crew mode and generation, the graded ref, and a timestamp.

## Objectives (each with its proof)

**OBJ-1 — R0 traceability ledger.** One machine-readable file per batch (`Change Lists/<BATCH>_LEDGER.json`) traces each objective through:
- intent;
- affected components, entry points and readers;
- plan item;
- diff and tests;
- Step-7 proof;
- Step-8 challenge;
- final status.

It also records each tool's version, invocation and output at the graded ref, and has one line for "missed earlier, found at step N".
- **Proof:** a schema plus a validator script. The validator passes a well-formed sample and fails three seeded defects: a missing link, a missing actor, and a status of done on an unproven objective.

**OBJ-2 — R1 proof record and an honest residual (draft).**
- **The step-1 skill gains the proof record:** observable, population, instrument, expected result, positive and negative controls, evidence class, safe forcing method, the change that turns it red, and the named test for load-bearing objectives.
- **Criterion change control:** a criterion can change only before results are seen, or by a reviewed amendment.
- **CLOSED-UNPROVEN** is defined: owner, placed home, closing condition, failure condition, and an alert. It never counts as done.
- **The Step 9 / Step 11 contradiction is resolved in the draft text.** Step 9 says "every objective green"; Step 11 allows NO / PARTIAL.
- **Proof:** the text at the ref, marked draft, and the R0 validator enforcing the done/unproven distinction.

**OBJ-3 — R4 two-legged Step 8 (draft).** Leg 1 reproduces Step 7 with the same instrument and population. Leg 2 is an orthogonal challenge aimed at wrong-object, alternate-path or failure-state risk, with its red condition stated. If either leg cannot be done, the objective stays unproven.
- **Proof:** the text at the ref, marked draft.

**OBJ-4 — Shared code-search CLI.** A small wrapper around the TypeScript language service for references and definitions, usable from Git Bash by Claude and Codex. It pins the TypeScript version, the project root and config discovery, the output schema and the exit codes. Each run records its version and invocation. The existing Claude language-server plugin stays as a convenience.
- **Proof:**
  - **Positive control:** the same 65 references for `toCanonical` that `SEARCH_SURFACES.md` recorded, re-measured at the ref.
  - **Red mutation:** adding a call raises the count; renaming the symbol drops it.
  - It runs identically from a Codex session.

**OBJ-5 — Census script (supporting).** For each changed symbol, table or column it lists:
- the code-search CLI's references;
- schedulers, timers and start paths repo-wide;
- database readers;
- systemd, cron and PM2 starts.

It labels what it cannot see (dynamic dispatch, string-built SQL, stored routines, triggers, views, config-driven paths, external consumers) and states the population searched. It fills the R0 reader table: reader · path · assumed meaning · missing/error/stale handling · concurrency assumption · still true?
- **Proof:** positive controls on known entry points.

**OBJ-6 — Per-component history list.** For a file or symbol, the script lists:
- every batch that touched it, from batch-id-led commit subjects, following renames (the `active-*` family renamed on 07-03);
- links to those batches' scope, audit and completion reports;
- every `RUNNING_ISSUES` entry, KD row and `DELETED_COMPONENTS_LOG` row that cites it.

It states its blind spots: work that never touched a file, chat-only decisions, and commits without a batch id.
- **Proof:** replay of #174 (missed for seven weeks when searched by symptom). The list for its file must surface the deciding batch.

**OBJ-7 — Generated close-out (Steps 10 and 11 stay separate).** One artifact is generated from:
- the declared class (`scripts/governance-checker/config.mjs` `CLASS_DOCSET` / `REQUIRED_IF`);
- the Step-2 census;
- R0;
- the base-to-deployed tree diff.

It is rendered into the session post, the commit and the report instead of retyped. Every judged or N/A row carries its reason.
- **Proof:** generated for one closed batch and compared with that batch's hand ledger. Every difference is explained.

**OBJ-8 — Write the aids into the workflow, for both crews.**
- **Where:** Step 1 (provenance), Step 2 (audit), the hotfix blast-radius check, and the always-loaded §9.5 trigger in `CLAUDE.md` (out-of-batch audits and disputes).
- **Each place names the four aids and their standing:** the code-search CLI, the census script, the history list, and the search index (once delivered).
- **`AGENTS.md` §2** gains the same read path for Codex.
- **Proof:** a crew-by-rule reachability manifest showing each new instruction reachable at the point of action for Claude (auto-load or skill read) and Codex (`AGENTS.md` §2 reads), canary-tested once per crew.

**OBJ-9 — Pilot on closed batches; reliance set from it.**
- Run OBJ-4 to OBJ-7 on at least four closed batches that include the escapes #903, #1063, #1160 and #691.
- Record for each:
  - what the aids found;
  - what they missed;
  - what the hand audit missed.
- Write the blind-spot list.
- Set each aid's reliance in the Step-2 text from that list.
- Activate any gate only where the pilot supports it, by the reviewer's ruling, recorded.
- **Proof:** `Change Lists/B_WORKFLOW_IMPROVE_PILOT.md` at the ref, with the per-batch tables.

**OBJ-10 — CI check: code versus database allowed values.**
- Both directions, for named shared contracts only; intentionally historical values are listed.
- It is test-only, with no runtime change.
- **Proof:** replaying #1063 (six pattern types in code, five in the database) turns it red; the fixed state is green.
- The reviewer rules whether a test in the app's test suite is within PM's "no app code" exception.

**OBJ-11 — Strip repetition from the step skills.**
- **What repeats:** 11 preserved-verbatim blocks, 11 board blocks, and four full fresh-reader blocks.
- **The fix:**
  - the common rules go into one shared contract file, which every step skill names;
  - the historical text is archived to `_archive/`, not deleted.
- **Proof:**
  - a move ledger like B-TOKEN-ECONOMY OBJ-5a (each moved passage found at its destination);
  - the skills' combined bytes before and after;
  - no step loses a step-specific rule.

**OBJ-12 — Search-index leg.** Once B-CONVERSATION-INDEX (Infra, row 5b, widened by KD-102) delivers, Steps 1 and 2 and the §9.5 trigger name its CLI. The pilot then adds a known-miss test scored keyword-only against keyword plus meaning.
- **Proof:** the index CLI runs from both crews; the test set is scored.
- **Dependency:** this objective waits on row 5b.

## 1.a Architectural read
- **`SYSTEM_IMPACT_MAP.md`:**
  - It records where the old §9.1/9.2/9.3/9.5 bodies went (into the step skills).
  - Its B-CODEX-FAILOVER "INSTRUCTION SURFACE" line names `AGENTS.md` as the Codex counterpart, with skills read as plain files (`AGENTS.md` line 24).
  - It is silent on the language-server plugin and on `SEARCH_SURFACES.md`. Searched `language.server|\blsp\b`; the positive control is the Hook Layer grep that does hit.
  - Both silences are governance gaps, closed at Step 10.
- **`SYSTEM_MANUAL.md`:** three skill mentions (line 591). It is otherwise silent, which is correct for crew tooling.
- **Upstream and downstream:**
  - The step skills are read by every builder session at each step, by Codex via `AGENTS.md`, and by reviewers.
  - The governance checker reads the class table and grades doc sets on staging.
  - The language-server plugin is laptop-only and Claude-only, configured outside the repo (`~/.claude/skills/dt-typescript-lsp/.lsp.json`).

## 1.b Provenance read
Corpora searched: `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, the completion reports, `git log -S` (not path-limited), and `SEARCH_SURFACES.md`.

| Component | Tier | Origin (verbatim where quoted) | Disposition |
|---|---|---|---|
| The eleven step skills | 1 | B-RULES-1d `077c435f7` (2026-08-21) moved §2 into skills; B-CLAUDEMD-SLIM `f22ba8bcb` carried nine clauses in | (2) update: proof record, two-legged Step 8, search aids, de-duplication |
| `CLAUDE.md` §9.5 trigger | 1 | Kept always-loaded on purpose: "THE TRIGGER STAYS HERE AND IS NOT MOVED... `workflow-02` IS GATED `STEP 2 ONLY`" (Langston 2026-08-28, in the file) | (2) add the aid names; the trigger stays put |
| `AGENTS.md` | 1 | `ae9b039a2` 2026-10-13 "B-CODEX-FAILOVER: AGENTS.md - the rules entry point for the Codex failover crew (Kyle 2026-10-12/13)" | (2) add the read path for the new aids |
| `dt-typescript-lsp` plugin | 2 | #1038; fix `99ca4c1db` / `73b4ae381` (2026-09-11); B-INSTRUMENTS-OVER-RULES closed 2026-10-01 with "the pre-registered usage measure FAILED (no session used the tool)" | (1) kept as a convenience; the shared CLI is the recorded instrument |
| `SEARCH_SURFACES.md` | 2 | `edbf50a8c` 2026-08-30 "SEARCH_SURFACES: nine surfaces catalogued and measured - and a wake source has been dead 63 days" | (2) the governance-prose gap gets an answer recorded (R5) |
| Governance checker class table | 2 | `ec37b2990` 2026-06-19 "B-GOV-2: activate the governance-checker — change-class declaration + dead-man heartbeat + path-heuristic guard + shadow mode" | (1) read by OBJ-7, not changed |

## Out of scope (named homes)
- Usage savings: B-TOKEN-ECONOMY.
- The index build itself: B-CONVERSATION-INDEX (Infra, row 5b).
- Turning any gate on before the pilot: OBJ-9's ruling.

## Governance applicable (Step 10, judged now)
- `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (the skills section, the language-server plugin, and the new tools), `SEARCH_SURFACES.md`, `CLAUDE.md`, `AGENTS.md`, the step skills, `RUNNING_ISSUES` (#1038 note), and the memory files.
- `SYSTEM_MANUAL`: not applicable (crew tooling).

## Risks
- **A draft rule read as binding:** each draft is marked in its heading and listed in R0.
- **A tool's clean output read as completeness:** every output prints its blind spots and population.
- **A Codex session not reaching the new text:** guarded by the OBJ-8 manifest and canary.
- **Process weight:** OBJ-7 and OBJ-11 remove more repetition than R0 and R1 add. The pilot measures it.

## r2 — Langston's Step-1 conditions (2026-11-19, at `72bd37a4a`; verdict file `Langston Design Asks/B_TOKEN_ECONOMY_B_WORKFLOW_IMPROVE_STEP1_VERDICTS.md`), all accepted
1. **OBJ-4's positive control is pinned to `e16767ef7`,** the population `SEARCH_SURFACES.md:31` states. At the build ref, the expected count is re-derived before it is used as a control.
2. **The pilot replays closed batch audits, not issue states.** For each escape, Step 2 names the closed batch whose audit is replayed and the ref where the escape happened. #903 and #691 are closed; #1063 and #1160 are still open, so their replay targets are the batches that let them through.
3. **OBJ-11 also covers `.claude/skills/bug-investigation/SKILL.md`,** which holds a fifth fresh-reader copy. It also says what `workflow-hotfix`, which carries none of the three blocks, inherits from the shared contract. Both go in the move ledger.
4. **The batch is gradable.** The OBJ-4, OBJ-5 and OBJ-6 CLIs land under `scripts/crew-tooling/`, a `CODE_PREFIXES` path (`scripts/governance-checker/config.mjs:102`). Step 2 names every file.
5. **OBJ-10 ships non-blocking:** warn-only, or outside the required CI jobs. It stays that way until Kyle rules whether a PM-authored test may block a trading deploy. Langston ruled that PM may build it, because it is not trading code.
6. **OBJ-12 cannot be marked done by proxy.** If row 5b has not delivered at close, OBJ-12 closes CLOSED-UNPROVEN with its home named.
