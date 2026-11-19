# Crew efficiency and workflow design: the whole concept, for review (PM Claude, 2026-11-19)

**Decisions:** KD-102 and KD-103 (Kyle, 2026-11-19), in `1-system-manual/pm/DECISIONS.md`.
- KD-102 widens B-CONVERSATION-INDEX to the governance and historical documents and the commit messages.
- KD-103 approves two PM-owned batches, **B-TOKEN-ECONOMY** then **B-WORKFLOW-IMPROVE**, which PM implements once this whole design is reviewed and approved.

**The design must work for both the Claude and the Codex sessions.** Plan rows: `SPRINT_TO_LIVE_PLAN.md` stage 0 (PM Claude) 1 and 2, and row 5b.

**Detail lives in two reviewed documents. This file ties them together and adds the Claude/Codex design.**
- `Claude Comms and Packages/Scope Files/B_TOKEN_ECONOMY_PROPOSAL.md` (r4; Coltrane PROCEED WITH CONDITIONS, all six folded).
- `1-system-manual/pm/reviews/2026-11-19_WORKFLOW_REVIEW_PRELIMINARY.md` (r7; Coltrane's advisory review folded; R0-R5 and the search-aid table).

## 1. B-TOKEN-ECONOMY (summary; the proposal is authoritative)
- **Measurement baseline first.** The criteria are pre-registered: usage rate, compaction count, continuity, helper routing, hook bytes, and lane volume, each with acceptance and rollback criteria.
- **A. Cap the live conversation.** Each session compacts at about 250k tokens instead of about 967k. One canary session goes first, with positive checks:
  - the threshold fires;
  - every start-up manifest loads;
  - the task and handover survive;
  - the wake watcher re-arms;
  - alert state is intact;
  - resume works;
  - there are zero duplicate transcript ids.

  Then the rest roll out, with a stated rollback trigger.
- **B. Slim the rules file.** CLAUDE.md goes from 122 KB to about 75 KB.
  - Depth moves to runbooks and skills; the operative rules stay loaded at the point of action.
  - Section 8 becomes a pointer to LANGSTON_ARCHITECTURE.md.
  - The byte ceiling is exact, its warning is tested red, and every later change is one-in-one-out.
  - Alerts are injected as deltas, with full state rules: a full list after start or compaction, a count that tells zero, unchanged and failed apart, and a baseline that advances only after a complete read.
  - An advisory hook warning is shown once; blocks are always shown.
  - The five memory and conduct registrations stay as they are.
- **C. Cut alert volume.** The two open-batch nags fire at the threshold and then weekly. The owner is stored on the alert when it is created. A lane cap, if any, has a critical bypass and a digest.
- **D. Cheaper models for helper agents only** (Kyle: no per-step switching, no effort changes, no pacer).
  - A helper is used only when the task is self-contained, independently checkable, returns a short cited answer, and is cheaper to verify than to read yourself.
  - Haiku is used for literal file finding and Sonnet for anything needing interpretation. Opus is used only when a session asks for it, and never above Opus 5.5.
  - The model actually served is proven with four controls.

## 2. B-WORKFLOW-IMPROVE (summary; the review is authoritative)
- **R0. One traceability ledger per batch,** machine-readable: objective → intent → affected components, entry points and readers → plan item → diff and tests → Step-7 proof → Step-8 challenge → final status. It records tool versions and outputs at the graded ref.
- **R1. A proof record per objective.**
  - Each record holds the observable, population, instrument, expected result, controls, evidence class, safe forcing method, and the change that turns it red.
  - Criteria are fixed before results are seen. CLOSED-UNPROVEN is an explicit residual, never counted as done.
  - The contradiction between Step 9 and Step 11 is fixed.
- **R2. A supporting census script.**
  - It builds on the existing code-search tool and adds what that tool cannot see: schedulers, start paths, database readers, and server jobs.
  - It labels what it cannot see, and its output is a lead, never a verdict.
  - Its limits are studied in a pilot on closed batches, and our reliance on it is set from that.
  - The reader table includes meaning, missing/error/stale handling, and concurrency columns.
  - A CI check compares code and database allowed values.
- **R3. A generated close-out.** One artifact is built from the class, the census, R0 and the base-to-deployed diff. Steps 10 and 11 stay separate.
- **R4. A two-legged Step 8:** reproduce Step 7 exactly, then run an orthogonal challenge that tries to falsify the result.
- **R5. Closing the governance-history gap.**
  - A per-component history list, built from batch-id-led commit subjects and files touched (following renames), plus the issues, decisions and deletions that cite each file.
  - The widened search index (KD-102).
  - A whole read of the shortlist, citing the lines accepted and rejected.
- **Where the aids apply:** Step 1, Step 2, the hotfix blast-radius check, and any audit or architectural dispute outside a batch (the §9.5 trigger names them).
- **Every aid produces leads only.** The mandatory reads of code, logs, database, the System Impact Map, the System Manual, and the shortlisted documents read in full are unchanged.
- **Also:** objective-to-test mapping with a red mutant for load-bearing checks; the hotfix path inherits the proof record and census in proportion; repeated blocks are stripped from the skills.
- **Pilot first:** the census and the generated ledger are replayed on closed batches, including #903, #1063, #1160 and #691, before either becomes a gate.

## 3. Working for both the Claude and the Codex sessions (new; KD-103)
**How each crew loads rules today.**
- Claude auto-loads `CLAUDE.md` and `CONDUCT.md` through hooks, plus its own memory file.
- Codex auto-loads `AGENTS.md` (14.7 KB; the Codex project-document cap defaults to 32,768 B). That file tells it to read `CONDUCT.md` and `CLAUDE.md`, and the step skill files **by path** (AGENTS.md §2).
- Both crews therefore read the same rules and the same step files.

**Design principles.**
1. **One copy of every rule, in the shared files** (`CLAUDE.md`, `CONDUCT.md`, the step skills, the runbooks). `AGENTS.md` carries only what differs for Codex. Every moved rule is reachable by a file path that both crews follow. Nothing lives only in a Claude-specific mechanism such as skill auto-invocation or a Claude hook.
2. **Every search aid is a command-line tool run from Git Bash,** usable identically by both crews and by either reviewer (Langston on a Claude shift, Coltrane on a Codex shift).
   - **The census script, the per-component history list and the search index** are plain scripts or CLIs over files and SQLite.
   - **Code search:** the existing language-server plugin is Claude-only, and Codex has no official language-server route; the only documented mechanism is an MCP server. The design adds a small CLI wrapper that runs the same TypeScript language service for find-references and definitions. The Claude plugin stays as a convenience; the CLI is the shared, recorded instrument.
3. **Shared logic lives in a script; each crew's mechanism only calls it.**
   - The alert-delta logic and the hook-warning dedupe are written once as scripts.
   - Claude calls them from its existing hooks.
   - Codex documents hooks (SessionStart including after compaction, PreToolUse, UserPromptSubmit), but the crew's Codex setup uses none today, and Windows support is not stated. Codex therefore runs the same script by hand at each start and after compaction, as AGENTS.md §2 already orders for the alert read.
   - A Codex hook is adopted only after it is proven on Windows.
4. **Settings, crew by crew.**

   | Lever | Claude | Codex |
   |---|---|---|
   | Compaction cap | `autoCompactWindow` ~250k, `idleCompaction: false` (user settings) | `model_auto_compact_token_limit` set to the matching value in the Codex config; whether a project-level `.codex/config.toml` is honoured is verified on the Codex canary, not assumed |
   | Helper models | `CLAUDE_CODE_SUBAGENT_MODEL=sonnet`; our own Explore agent on Haiku; allowed-models ceiling Opus 5.5 | `[agents]` roles, each with its own config file setting a cheaper model. The docs do not state the model key for a role, so it is proven with the same four served-model controls before any rule relies on it |
   | Rules load | CLAUDE.md byte cap | AGENTS.md stays under its 32 KB cap. The CLAUDE.md slim directly shrinks what Codex reads after each compaction (AGENTS.md says it re-reads only the sections it needs) |

5. **The canary runs once per crew.** One Claude session and one Codex session each prove the compaction cap and helper routing before rollout to their crew. Codex usage is a separate allowance (ChatGPT), measured and reported apart.
6. **Workflow artifacts are crew-neutral.** The R0 ledger, the proof records and the generated close-out are files in the repo with no Claude-only fields. Reviewer names are recorded as roles (routine reviewer, second reviewer), so the same batch can cross a crew switch without rework.
7. **Handover.** Each `pm-transition-*` and `pm-*-usage-stop` skill names the new settings, so a crew switch carries them across.

## 4. Order of work
B-TOKEN-ECONOMY first:
1. Baseline.
2. The A canary on Claude, then on Codex.
3. A rollout.
4. D.
5. B slim with the cap.
6. C.
7. The alert-delta script.

Then B-WORKFLOW-IMPROVE:
1. The R1 and R4 rule edits, and the Step 9/11 fix.
2. The shared code-search CLI and the census script.
3. The per-component history list.
4. The R0 ledger and generated close-out.
5. The pilot on closed batches.
6. Gates switched on only where the pilot supports them.
7. The search-index leg once B-CONVERSATION-INDEX (Infra) delivers.

Each runs the full eleven-step workflow. Langston or Coltrane reviews at the graded ref.

## 5. Questions for the reviewer
1. Do the Claude/Codex principles in section 3 cover both crews without creating a second copy of any rule?
2. Is a CLI wrapper the right shared instrument for code search, rather than an MCP bridge?
3. Is the Codex compaction and helper-model plan sound, given what the docs leave unstated (project-level config, the role model key, Windows hooks)?
4. Does the order hold? Anything missing?

Verdict form: PROCEED / PROCEED WITH CONDITIONS / REVISE, with numbered conditions.

## 6. Coltrane's verdict (2026-11-19 01:40Z, at 8cd8d360a): PROCEED WITH CONDITIONS. All six accepted and binding on both batches.
He confirmed the shared CLI is the right instrument for code search: an MCP bridge would add a crew-specific transport without improving reproducibility.
1. **Reachability is proved, not claimed.** Codex auto-loads only `AGENTS.md`; `CONDUCT.md`, `CLAUDE.md` and the step skills are explicit reads. Keep a crew-by-rule manifest, and canary-test loading at start, after compaction and at the point of action. Audit for duplicates before claiming one copy of each rule.
2. **Pin the code-search CLI.** Fix the TypeScript service version, the project root and config discovery, the output schema and the exit codes. Record the tool version, invocation, unresolved surfaces and output at the graded ref. Prove it with a positive control and a red mutation. Its results stay leads, never completeness claims.
3. **Every Codex setting is unproved until the Codex canary observes it.** That covers the effective configuration and served model, config scope and precedence, the exact compaction threshold, the role model key, silent fallback, continuity and rollback. One canary per crew proves the mechanism only. Every session and folder gets a rollout smoke check, because project-level configuration may differ.
4. **The full alert path stays until the shared delta script is independently green.** Codex has no hooks today, so "run by hand after compaction" needs a canary showing the instruction reappears and runs after a real auto-compaction. If that fails, keep the full manual read, or wait for a Windows-proven hook.
5. **Artifacts record the role and the actual actor,** plus the trusted crew mode and generation, the graded ref and a timestamp. The live crew mode selects the reviewer. A mode boundary invalidates an in-flight review; completed gates stay usable with their recorded provenance.
   - **For these two batches, Kyle named "Langston or Coltrane" (KD-103), so Coltrane reviews while Langston is off.** This is recorded as Kyle's direction for these batches, not as discretion.
6. **The R1, R4 and Step 9/11 edits land as draft and non-blocking.** They become gates only when the closed-batch pilot supports activation.
