# B-WORKFLOW-IMPROVE — Step 4 change list

actor: PM Claude (session 994e6488) · role: implementer · STEP: 4 of 11 · NEXT STEP: 5 of 11 · 2026-11-20
Review at `origin/migration/aws-supabase`. Line numbers are at `a8df50f02`, the head of this batch's commits; after the push they resolve unchanged at the ref.

## Header (workflow-04, the three fields)
**(i) DECLARED CHANGE-CLASS:** `non_architecture` (scope header, `Scope Files/B_WORKFLOW_IMPROVE_SCOPE.md`). The diff touches no engine path: tooling under `scripts/crew-tooling/`, one test-only file under `server/tests/`, one advisory CI step, and Markdown.

**(ii) THAT CLASS'S DOC SET, ROW BY ROW** (`scripts/governance-checker/config.mjs` `CLASS_DOCSET.non_architecture`; `REQUIRED_IF` does not apply, the id is not `P19-*`):
| doc | kind | state now | reason |
|---|---|---|---|
| scope | required | present | `Scope Files/B_WORKFLOW_IMPROVE_SCOPE.md` |
| pre_audit | required | present | `Scope Files/B_WORKFLOW_IMPROVE_PRE_AUDIT.md` (r2 passed with conditions) |
| completion_report | required | absent | written at Step 11 |
| batch_catalog | required | absent | Step 10 |
| phase_history | required | absent | Step 10 |
| system_manual | conditional | N/A | no strategy, regime, filter, pipeline or maths change |
| sim | conditional | owed at Step 10 | the scope names the skills section, the language-server plugin and the new tools as SIM content |
| changes_and_fixes | conditional | owed at Step 10 | the `history.mjs` defect fixed in Q8 |
| running_issues | conditional | owed at Step 10 | the #1038 note named in the scope; any home Kyle slots for the enum drift (gate 4) |
| roadmap | conditional | N/A | no roadmap item added or moved |
| deleted_log | conditional | N/A | nothing deleted: the step-skill text moved to an archive, recorded in the move ledger |
| adjustment_framework | conditional | N/A | no trading setting touched |
| phase_19_plan | conditional | N/A | the batch's row is in `SPRINT_TO_LIVE_PLAN.md` (`:113`), updated at Step 10 |
Outside the checker: `SEARCH_SURFACES.md` (scope `:158`), the memory files and the task list, at Step 10.

**(iii) THE STEP-2 REFERENCE:** `Scope Files/B_WORKFLOW_IMPROVE_PRE_AUDIT.md`, its implementation plan Q0-Q11 and the r2 conditions 1-3.

## What was built, by task
| Q | objective | commits | files | proof (in the commit or record) |
|---|---|---|---|---|
| Q0 | OBJ-9 prerequisite | `7eccaaa63`, `959bd9da1` | `Change Lists/B_WORKFLOW_IMPROVE_PILOT_TARGETS.md` | four batches covering the four defect classes, each kept row re-read at the ref |
| Q1 | OBJ-1 | `7eccaaa63` | `ledger-schema.json`, `ledger-validate.mjs` | a sample passes; missing field, wrong type, done-while-unproven each rejected; exit 0/1/2 |
| Q2 | OBJ-2, OBJ-3 | `c52134911` | workflow-01, -08, -09, -10, -11 | DRAFT text, each section headed "non-blocking until the OBJ-9 pilot" |
| Q3 | OBJ-4 | `e6534d928`, `fe308004a` | `code-refs.mjs` | at `c8b07e21f`: `toCanonical` = 65 uses in 10 files + 1 definition, equal to the pre-audit's 65/10; uncalled probe exit 1; undeclared exit 2 |
| Q4 | OBJ-5 | `bf4e73156` | `census.mjs` | the pre-audit's known positive and its B3 count; unknown table exit 1; undeclared symbol exit 2 |
| Q5 | OBJ-6 | `b6d06642a`, `959bd9da1` | `history.mjs` | `ml-calibration.ts`: 6 commits and #174 at `RUNNING_ISSUES:2387`; v1.1 fix proofs below |
| Q6 | OBJ-7 | `bd3b7dc75` | `closeout.mjs` | one closed batch: every row equal to its hand ledger, differences named; its first commit as positive control shows the missing docs, exit 1 |
| Q7 | OBJ-8 | `4265cb1df`, `a8df50f02` | workflow-01, -02, -hotfix, `CLAUDE.md`, `AGENTS.md`, `Change Lists/B_WORKFLOW_IMPROVE_REACHABILITY.md` | canary 8/8 paths reached the text; Codex leg simulated, stated |
| Q8 | OBJ-9 | `959bd9da1` | `Change Lists/B_WORKFLOW_IMPROVE_PILOT.md`, `history.mjs` 1.1 | four replays; blind-spot list; proposed reliance text |
| Q9 | OBJ-10 | `896b86333`, `b75aeba60` | `enum-parity.parity.ts`, `vitest.enum-parity.config.ts`, `ci.yml`, `Change Lists/B_WORKFLOW_IMPROVE_ENUM_PARITY_FIRST_RUN.md` | seeded controls both directions; first CI run found live drift (gate 4) |
| Q10 | OBJ-11 | `96114da21`, `b6f70412e`, `c830dca0a` | `skill-cites.mjs`, `move-ledger-check.mjs` 1.1, `WORKFLOW_SHARED_CONTRACT.md`, `_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md`, the 12 step skills, `bug-investigation`, `ci.yml`, `CLAUDE.md`, the move ledger, the reconciliation | the ledger check passes in CI as a blocking line; 31 citations reading different text after the move, all in frozen records, mapped |
| Q11 | OBJ-12 | none | none | waits on row 5b; CLOSED-UNPROVEN at close if 5b has not delivered |

Untracked files: none (`git status --porcelain` shows only the hook-refreshed `RUNNING_ISSUES.md`, not this batch's).

**Deviations from the plan, each stated in its commit:**
1. The enum check is `server/tests/enum-parity/enum-parity.parity.ts` with its own config, not `server/tests/unit/enum-parity.test.ts`. A `*.test.ts` under `server/` would be picked up by the main include and run inside the required Test Suite step; the separate name and config keep it outside, which is what r2 condition 1 asks for.
2. r2 condition 1's scratch-database run was CI's own first run (no local Postgres). That run found live drift, so the live control exists; the seeded controls run regardless.
3. Q7 landed after B-TOKEN-ECONOMY P5, as sequenced.

## Load-bearing snippets
### Q9 — the advisory CI step (`ci.yml`, after the Test Suite step)
```yaml
      - name: Enum parity (advisory, not required)
        continue-on-error: true
        run: npx vitest run --config vitest.enum-parity.config.ts --reporter=verbose
```
And the test's safety rail (`enum-parity.parity.ts:19-29`): it runs only against `localhost`/`127.0.0.1` database `/test`, and throws in CI if that database is unreachable, so a skipped run cannot pass as green.

### Q10 — the ledger check made blocking for the step-skill move (`ci.yml`)
```yaml
          node scripts/crew-tooling/move-ledger-check.mjs --dupes
+         node scripts/crew-tooling/move-ledger-check.mjs --ledger "Claude Comms and Packages/Change Lists/B_WORKFLOW_IMPROVE_MOVE_LEDGER.json" --dupes
```
`move-ledger-check.mjs` 1.1: `check(root, { dupes, ledgerPath })`; a ledger may set `marker`, and a move may list `sources` (one passage that stood in several skills, one home now). Every listed source must have lost the passage and kept the id.

### Q8 — `history.mjs` 1.1, the defect fixed in the pilot
BEFORE: a batch id `B55` looked only for `B55_*` documents, so every numbered batch before about B80 (filed as `BATCH_55_*`) reported "docs: NONE FOUND".
AFTER:
```js
const docKeys = (id) => {
  const key = id.replace(/-/g, '_').replace(/\./g, '_').toUpperCase();
  const m = key.match(/^B(\d.*)$/);
  return m ? [key, 'BATCH_' + m[1]] : [key];
};
const docsFor = (id) => {
  const own = docsMatching(id);
  const pm = id.match(/^(B\d+)[a-z.]/i);
  if (own.length || !pm) return own;
  const parent = pm[1];
  return docsMatching(parent).map((f) => 'parent ' + parent + ': ' + f);
};
```
Proofs: B55 now lists `BATCH_55_COMPLETION_REPORT.md, BATCH_55_SCOPE.md` (was NONE FOUND); B74 lists its three documents; B-NEW-40 unchanged (no regression). Known over-inclusion (`BATCH_67_` also matches `BATCH_67_1_*`) is labelled.

### Q7 — the one home (`workflow-02-audit-and-plan/SKILL.md:83-93`)
> ⛔ **They answer WHERE, never WHETHER. Quote each run's "cannot see" lines in the pre-audit.** Their silence is **not evidence** for: two value lists agreeing · literal copies of a list · properties and fields · sibling producers of one label or panel · what a site MEANS · error paths · a library's own behaviour · files outside the TypeScript programs (`scripts/`). **For each of those the batch touches, name the lists or sites and compare them by hand, in the pre-audit.** A `--table` zero counts only after you confirm the object is a table with that name.

Pointers to it: `workflow-02:51` (provenance read), `:60` (census), `workflow-01` under MANDATORY 1.b, `workflow-hotfix` after §2's five questions, `CLAUDE.md:459`, `AGENTS.md` §2 item 5.

### Q2 — every draft section's heading
> `## ◇ DRAFT — B-WORKFLOW-IMPROVE (non-blocking until the OBJ-9 pilot; any part becomes a gate only by the reviewer's recorded ruling)`

## The gates, one per dispatch, cheapest first
1. **Reliance and gates (rule only, no code read).** Does the Q7 text above, built from the pilot, say the right thing? Does any aid, or any Q2 draft, become a required gate now, or do all stay leads and drafts? PM's recommendation: no aid becomes a gate (none caught an escape class); the Q2 drafts stay drafts until a batch has used them once.
2. **The scripts, the enum check and CI.** `code-refs`, `census`, `history`, `closeout`, `ledger-validate`, `skill-cites`, `move-ledger-check` 1.1, the enum check and its two CI lines.
3. **The text.** Q2's drafts, Q10's shared contract and archive (against the reconciliation and the move ledger), Q7's pointers.
4. **The enum drift's home.** The first CI run found drift both ways (code declares, database lacks: six `market_regime` names and `tuning_status 'reverted'`; database holds, code lacks: eight `strategy_type` values, `trading_mode` passive and learning, `tuning_status 'pending'`; staging matches CI). Whether each is a defect is outside this batch. PM proposes it as an owner's bug investigation; the slot is Kyle's.
5. **Two proposals from the pilot:** a value-set comparison aid (blind spot 1) and a field-level census (blind spot 3). Build here, own batch, or neither.

## Judgement calls to attack
- **The pilot's verdict rests on five escapes in four batches.** A different sample could hold a "where" miss the aids would have caught. Is four enough to write "leads, never verdicts" into Step 2?
- **The Codex canary was simulated.** OBJ-8 asks for one per crew; PM ruled the Claude-walked Codex path a partial proof and carried the real one to B-TOKEN-ECONOMY OBJ-3. Is that acceptable at close, or must it be CLOSED-UNPROVEN?
- **The enum check is advisory while it finds real drift today.** It stays outside the required result by r2's ruling; does a live finding change that?
- **The `history.mjs` fix was folded in** (disposition 1) rather than filed, because the pilot depended on it. The checker's `batchIdToFileRegex` (`config.mjs:89`) has the same blind spot and was recorded as no work, because the checker grades modern ids only.
- **The 31 citations that read differently after the move** were left in frozen records with a map, not rewritten.

## Fresh-reader record
- The pilot's helper claims were re-checked by PM at the ref (listed in the pilot record).
- The reachability canary was a fresh sonnet reader with no context.
- NOT RE-READ by a fresh reader: this change list's own figures; PM re-derived each from the commits.
