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
| Q10 | OBJ-11 | `96114da21`, `b6f70412e`, `c830dca0a` | `skill-cites.mjs`, `move-ledger-check.mjs` 1.1, `WORKFLOW_SHARED_CONTRACT.md`, `_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md`, the 12 step skills, `bug-investigation`, `ci.yml`, `CLAUDE.md`, the move ledger, the reconciliation | the ledger check passes in CI as a blocking line; 31 citation records (33 ledger entries, 28 distinct file+skill+line keys) reading different text after the move; 27 of the 33 entries sit in frozen records, 6 entries in 3 live governed files (the classification holds, the drift predates Q10), all mapped |
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

### Q7 — the one home (`workflow-02-audit-and-plan/SKILL.md:83-96`, generated verbatim from the file at the commit that carries this change list: `git show <that commit>:<path> | sed -n 83,96p`, each line prefixed `> `)
> ## ★ THE AUDIT AIDS — LEADS, NEVER VERDICTS (B-WORKFLOW-IMPROVE OBJ-8, 2026-11-20)
> **The one home for the aids' table and standing** — Step 1, the hotfix path, `CLAUDE.md` §9.5 and `AGENTS.md` §2 point here. Plain Node scripts in `scripts/crew-tooling/`; both crews run them from Git Bash at the repo root.
> | aid | what it lists | command |
> |---|---|---|
> | code search | every type-aware use of one symbol | `node scripts/crew-tooling/code-refs.mjs <symbol> [--file <declaring file>]` |
> | census | uses, plus the entry points that reach the target (bootstrap, timers, cron, PM2, systemd) and drizzle and raw-SQL table hits | `node scripts/crew-tooling/census.mjs --symbol <s> [--file <f>]` · `--path <file>` · `--table <name>` |
> | history | the batches behind a file, their scope, audit and completion documents, and the `RUNNING_ISSUES`, `DECISIONS` and `DELETED_COMPONENTS_LOG` rows that cite it | `node scripts/crew-tooling/history.mjs <path> --ref origin/migration/aws-supabase` |
> | close-out matrix | the governance documents the declared change-class requires for a batch, each row's verdict from the repo at `--head`; imports the governance checker's own tables. **Cannot see:** it reads the scope's change-class marker the same way the governance checker does, so a marker the checker misses it misses too; an omitted update is silent in a diff, so a row it fills is a lead, not a verdict | `node scripts/crew-tooling/closeout.mjs --class <c>` · `--batch <ID> --base <ref> --head <ref>` · `--compare` |
> | search index | — | **not yet delivered; do not cite it** |
>
> ⛔ **They answer WHERE. They resolved none of the pilot's five escapes; for one they produced the governing lead, and the miss was in following it. Quote each run's "cannot see" lines in the pre-audit.** Their silence is **not evidence** for: two value lists agreeing (a type against a database enum, or against a literal list or `Set`) · literal copies of a list · properties and fields (the symbol modes take top-level declarations only) · sibling producers of one label or panel · what a site MEANS (counted before or after a filter; an empty result versus a failed read) · error paths · a library's own behaviour · files outside the TypeScript programs (`scripts/`). ⚠️ **The `scripts/` exclusion is NOT stated in the census output, so there is no line to quote: write it into the pre-audit yourself.**
> ⛔ **THE PRE-AUDIT CARRIES ONE NAMED LINE PER BLIND-SPOT CLASS ABOVE (eight lines):** for a class the batch touches, the lists or sites named and compared by hand; for one it does not, `N/A — <why>`. A declared N/A is checkable at Step 4; a missing line reads as a skip.
> ⚠️ **`--table` misled in 3 of the 4 pilot replays** — an enum type, a misnamed table, and a real table of that name belonging to a different system (the real store was a file). **A `--table` zero, or a hit, counts only after the object is confirmed from its WRITE SITE** — a name match is not an object match.
> *(Why: the pilot replayed four closed batches chosen to cover four defect classes — a purposive sample, so "all five escapes were value or meaning misses" is NOT a frequency claim; its load-bearing output is the blind-spot list, each entry a named run with a named wrong result — `Change Lists/B_WORKFLOW_IMPROVE_PILOT.md`. No aid is a required gate (Langston, Step-4 gate 1, 2026-11-20): the census and provenance obligations are already mandatory, and the aids are entry points into them.)*

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
- **The citations that read differently after the move** were mapped, not rewritten. Population: the tool reports 31 citation records; the ledger enumerates 33 entries (13 moved + 20 pre_existing; the 2 extra cite `bug-investigation:49`, blank at both refs), which collapse to 28 distinct (file, skill, cited line) keys. 27 of the 33 entries sit in frozen records; 6 entries in three live governed files (`RUNNING_ISSUES.md:1784`, `PHASE_19_PLAN.md:83` row `3i.c` / `#948`, `EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md:199`). The classification holds and that drift predates Q10 (Langston gate 3).

## Fresh-reader record
- The pilot's helper claims were re-checked by PM at the ref (listed in the pilot record).
- The reachability canary was a fresh sonnet reader with no context.
- NOT RE-READ by a fresh reader: this change list's own figures; PM re-derived each from the commits.

## Gate 2 — ruled PROCEED with five conditions (Langston, at `57a8bf75e`); applied in one commit
| item | file | what changed | proof | review path |
|---|---|---|---|---|
| C-1 | `history.mjs` 1.2, `skill-cites.mjs` 1.1, `closeout.mjs` | each prints the resolved sha beside the ref name and "no fetch performed"; JSON carries `ref_sha` / `base_sha`+`head_sha` and `fetched: false` | runs below print the sha | Step 8 |
| C-2 | `ci.yml` | `if: ${{ !cancelled() }}` on "Enum parity (advisory, not required)", so a red Test Suite no longer skips it | YAML parses; the effect shows on the next red-suite run only | Step 8 |
| C-3 | `closeout.mjs` | imports `CHANGE_CLASS_MARKER` from `config.mjs` instead of a copied regex; scope selection mirrors `checker.mjs` `readDeclaredClass` (first SCOPE file in sorted order that carries the marker, else the first) | B-GOV-2 now reads UNDECLARED, same as the checker (its `**change-class:**` bold breaks the marker); B-TOKEN-WATCH picks `B_TOKEN_WATCH_BIRTH_CAP_SCOPE.md`, the checker's same over-inclusion; B-PRICE-AGE-TRUTH architecture; this batch non_architecture | **diff to Langston** |
| C-4 | `skill-cites.mjs` | `--check` keys each citation on file + skill + cited line and adds `DISAPPEARED` (in before, not after) and `appeared`; exit 1 on stale or disappeared | `b75aeba60 -> ddcf8be55`: 87 before, 87 after, 31 records point at different text (the ledger enumerates 33 entries, 28 distinct keys; see the citations note), 0 DISAPPEARED, 0 new; positive control: a planted citation removed reports 1 DISAPPEARED | **diff to Langston** |
| C-5 | `code-refs.mjs`, `census.mjs` | the two fixed cannot-see lines now name JavaScript (.mjs/.js/.cjs, mostly `scripts/`) and the TypeScript outside both includes (`scripts/` about 40 files, then `docs/`, `e2e/`, `tests/`, `types/`, `chaplet/`, `diagnostics/`, root configs); census states that leg 2 does walk .mjs | measured by `git ls-files` at the ref | Step 8 |
| O-1 | `enum-parity.parity.ts` | header narrowed: database-only values are compared only inside types the code declares; database-only TYPES are not covered (11 of 84 on staging), carried to gate 4 | header text | Step 8 |

**Fold-ins (no conditions):**
- `census.mjs` 1.1 `--path`: exits 1 when no start file reaches the file (was: always 0 on the file's own presence). Controls: `server/services/active-portfolio-manager.ts` exit 0; `scripts/crew-tooling/census.mjs` (nothing imports it) exit 1. `--path` and `--table` now print fixed cannot-see lines instead of none.
- `skill-cites.mjs`: `cite_state` splits `past_end` from `skill_unreadable` (22 past end, 0 unreadable at `fa12a2f96`).
- `ledger-validate.mjs`: `objectives: {}` now fails `bad-type` (was VALID, "undefined objectives"); new self-test case, 10/10.
- `move-ledger-check.mjs`: a leftover that was re-spaced or re-wrapped now fails ("still in ... (re-spaced or re-wrapped)"), compared with whitespace collapsed; new self-test case, 9/9. **The sources-less fallback is already exercised:** the default ledger (`B_TOKEN_ECONOMY_MOVE_LEDGER.json`) has 55 moves, none with `sources`, and is what the first six self-test cases and CI's first move-ledger line run.
- `history.mjs`: three `not_covered` entries (phase-scoped sub-batch ids such as P19-B8.5l; ledger rows matched by basename; former names proven for one rename only).

Carried to gate 4: the undeclared database enum types; the checker's own marker missing five `**Batch:** … **change-class: …**` lines (nothing mis-graded).

## Gate 2 re-check — C-3 changes needed, C-4 one condition (Langston, Discord `1573183217178124359`); applied, no diff round (he takes them at Step 8)

| item | Langston's measurement | what changed |
|---|---|---|
| **C-3** | the candidate set was recursive (`ls-tree -r`) while the checker lists the scope dir non-recursively (`checker.mjs:116`); a nested file with the id and `SCOPE` that sorts first made `git show` throw uncaught, exit 1 | `closeout.mjs` 1.1: scope selection is now a pure `selectScope()`: immediate children of the scope dir only, and an unreadable candidate is skipped (`continue`), as the checker's `showFile` → null skips it. The header comment names the mirror's drift class (listing recursion). |
| **C-6** (fold-in) | 12 scopes declare a class in a form the marker does not match; UNDECLARED sent authors hunting for a line that is there | three UNDECLAREDs kept apart: `invalid-class` (marker names a token that is not a class), `present-unmatched` ("a declaration is present in a form the checker's marker does not match"), `no-marker`; plus `no-scope`. B-GOV-2 now reads `present-unmatched`. |
| **C-4 condition** | the `--check` key used the name as written, so re-pointing `workflow-10:5` → `workflow-10-governance:5` gave 2 DISAPPEARED | `skill-cites.mjs` 1.2: `compare()` keys on `c.skill_dir \|\| c.skill`. |
| C-4 note | the key drops duplicates (drop one of a pair: 0 DISAPPEARED) | `--check` prints a `not covered:` line naming the key, with the count change as the tell. |
| C-4 note | `--check` resolved a `--ref` it never used | under `--check` the skills are read at `--at` unless `--ref` is given. |
| self-tests | both measured cases become tests | `closeout.mjs --self-test` 7/7 (nested candidate, unreadable candidate, sort order, mid-line, invalid token, no marker, no scope); `skill-cites.mjs --self-test` 6/6 (3-removed positive control, full-name re-point = 0 DISAPPEARED, stale text, other line, the duplicate limit). |

Real-data runs at `9bca59ced`: `skill-cites --check` against its own listing: 129 before, 129 after, 0 / 0 / 0; `closeout --compare`: every row equal; B-WORKFLOW-IMPROVE reads declared `non_architecture`.
`readDeclaredClassAt` (Langston's question): asked of CC-A, whose file `checker.mjs` is; until it lands, the mirror stays with both fixes. The 12-scope mid-line marker item: **HOME: an item on `#744` B-GATE-GUARD, owner CC-A** (disposition 2, Langston).

## Gate 3 — ruled PROCEED (Langston, Discord `1573662327868235786`, at `b3bde2575`); fixes in one commit, two record conditions applied, no diff round (he takes them at Step 8)
| item | file | what changed | proof | review path |
|---|---|---|---|---|
| C-7 | `workflow-10-governance` | the open `GOVERNANCE_EXCEPTIONS` row obligation for a batch held in observation is live text inside the progress-report block (`:69`, block ends `:74`); the draft bullet at `:269` points back to it (corrected at Step 10 from `:270`, Langston Step 8 F-3; the file is unchanged between `b3bde2575` and the graded ref) | Langston read `:69`/`:74`/`:269` at the ref | Step 8 |
| C-8 | `workflow-09-iterate` | `:29` names `scripts/crew-tooling/ledger-validate.mjs` for what it is: it validates the batch ledger, is not the governance checker, and is reported, not gated | Langston read `:29` at the ref | Step 8 |
| Q10 (a) | this change list, citations note | the moved-text citations are split: 27 entries in frozen records, 6 in three live governed files, each named | Langston enumerated the 6 live entries in 3 files and the 27 frozen | Step 8 |
| Q10 (b) | this change list, move ledger | the populations are stated: 31 tool records vs 33 ledger entries (13 moved + 20 pre_existing), collapsing to 27 / 28 distinct keys; the two extra entries cite `bug-investigation:49` | Langston re-derived 33 → 28 distinct, and 31 → 27 without the two `:49` entries (`B_GOV_REPORTING_REVIEWER_ROUNDS_r6.md:48`, `:53`); every figure lands | Step 8 |
| Q10 (c) | move ledger, reconciliation | provenance re-stamped to `b75aeba60` at both sites; the two remaining `eb12f019b` mentions are marked historical | Langston grep at the ref | Step 8 |
| Q10 (d) | `B_WORKFLOW_IMPROVE_RECONCILIATION.md` | the re-check at the graded ref closes 5 of 9 (wf-01 M16/M17, wf-10 M8/M12/M13); totals PRESENT 55 / PARTIAL 15 / MISSING 4, the four left are archive material | Langston spot-checked `workflow-01:32` (M16+M17) and `workflow-10:208` (M8+M12+M13) | Step 8 |
| Q10 (e) | `bug-investigation`, `WORKFLOW_SHARED_CONTRACT.md`, `move-ledger-check.mjs` | the six duplicated one-pass bullets and the precedence clause are gone from `bug-investigation`, replaced by one pointer to contract §1 block `WI-F1`; the contract's row 1 names it as a pointer; the checker states its cannot-see (`--dupes` searches declared sources only) at `:25-27` and in the OK line at `:160` | 0 of 6 bullets left, exact and whitespace-collapsed (Langston); all 6 present verbatim in the contract (`grep -xF`, 6/6) | Step 8 |
| Q7 snippet | this change list `:88-101` | regenerated verbatim from `workflow-02:83-96` at the carrying commit; the heading names the commit, not a sha | 3,495 B each, `cmp` equal with `> ` stripped; control: a one-character change differs (Langston) | Step 8 |
| Q7 gap (Langston's fold-in) | `workflow-02-audit-and-plan`, `workflow-10-governance` | `closeout.mjs` added to THE AUDIT AIDS at `workflow-02:90` with its own cannot-see line (reads the change-class marker as the checker does; an omitted update is silent); `workflow-10:14` names it as a pointer only | all six pointers resolve by heading, one home (Langston) | Step 8 |
| the whole ledger | `B_WORKFLOW_IMPROVE_MOVE_LEDGER.json` | (no change at gate 3 beyond the re-stamp) | Langston re-ran `check()` at the ref: 14/14 moves, sha256 and bytes match, gone from every declared source, pointer kept, `--dupes` total 1, 0 failures; control: an altered `WI-S1` hashes differently | Step 8 |

**Record conditions (applied after the ruling):**
| item | file | what changed | proof | review path |
|---|---|---|---|---|
| D-1 | this change list | this gate-3 section added; until now the only record of gate 3 was the corrected body text, and PM's dispatch described a section that did not exist | — | Step 8 |
| D-2 | `B_WORKFLOW_IMPROVE_MOVE_LEDGER.json` | `.claude/skills/bug-investigation/SKILL.md` added to `WI-F1`'s `sources`, so a future re-paste there fails `--dupes` instead of sitting in the documented blind spot | `move-ledger-check --ledger <this ledger> --dupes`: OK, 14 moves; the passage occurs 0 times in `bug-investigation` and its `WI-F1` pointer is at `:41` | Step 8 |

Gate 3 is not a substitute for CI: gate 5 needs all four jobs green on the head, and a cancelled job is not a green one.
Out of gate 3, disposed of by Langston in the same ruling: the 69 `[AISummary] … trading_mode` enum errors are an AI-page fault, withdrawn to the cleanup phase under Kyle's 2026-10-19 ruling, no slot.

## Gate 5 — ruled PROCEED (Langston, Discord `1573682180478075051`, at `ff58cf026`); neither aid built here; Step 4 complete
Ruling: the value-set comparison aid and the field-level census are not built in this batch. The gap is covered today by the Q7 obligation with a check (one named line per blind-spot class, `N/A — <why>` checkable at Step 4, a missing line reads as a skip), and Q9 covers the schema-against-database leg (`enum-parity.parity.ts:63`). New code at Step 4 would re-open Step 3, and a new batch is Kyle's to slot (2026-10-19).

The proposal PM takes to Kyle at close (one batch, for his after-live list; not a plan row until he agrees), carrying Langston's four conditions:
| # | condition | what the proposal says |
|---|---|---|
| P-1 | order them, with the reason | the value-set aid first: it is the only one that could mechanically resolve an escape class (#1063's shape); the field census closes a WHERE gap only and would not have resolved #1029 (blind spot 5) |
| P-2 | entry criterion | the batch starts only after the first real eight-line blind-spot blocks have been read; the obligation landed in this batch and is unexercised, and the pilot sample was purposive |
| P-3 | pre-registered test | the value-set aid reports #1063's TypeScript-union drift at a pre-fix ref (positive control) and reports clean where the lists agree, both directions; an aid that cannot discriminate on that escape does not ship |
| P-4 | lead, not gate | gate-1 ruling unchanged; no CI step rides in with it |

Carried to Step 10 (non-blocking, `fix-follows-pointer`): `Scope Files/B_WORKFLOW_IMPROVE_PRE_AUDIT.md:119` still says the enum check reports #1063's `pattern_type` drift today. `ENUM_PARITY_FIRST_RUN.md` measured no such drift (CI database and staging both hold the six code values). Amend the line or stamp the supersession where it sits. Gate 4 stays separate from this proposal.

## Step 5 and Step 6
- **Step 5 (CI):** all four jobs green on `29303adff` (run 44907099007: TypeScript Check, Test Suite, Build, Docker Build), which contains every commit of this batch through the gate-5 record. The two runs on `8ec7ab0f1` and `64a4d1a61` were cancelled by the newer push, not failed.
- **Step 6 (deploy): none owed by this batch.** Population: every file touched by a `B-WORKFLOW-IMPROVE` commit since 2026-11-15 (`git log --grep`, `--name-only`): skills, CI, `scripts/crew-tooling`, `server/tests/enum-parity`, its vitest config, governance and records. None is server runtime code and none is `scripts/governance-checker`, so staging runs nothing this batch changed; the enum check runs in CI. A deploy would restart trading for no change.


## Step 8 — ruled PROCEED (Langston, Discord `1573704029442412579`, 2026-11-21T14:18Z, at `53a56b3db`)
Leg 1: every instrument in the Step 7 record re-derived and matched. Leg 2: three of the four challenges run and passed (OBJ-4 red mutation 66/64; OBJ-7 first-commit control on B-FEED-HEALTH-GRADE-ARM; `skill-cites --check` against a planted before listing, 3 DISAPPEARED). The fourth, the real Codex canary, could not be run here and stays with B-TOKEN-ECONOMY OBJ-3. No objective failed, so Step 9 has nothing to iterate.

Carried, none a Step 8 failure:
| # | item | goes to |
|---|---|---|
| F-1 | closeout's diff legs are not filtered to the batch and the tool does not say so (`closeout.mjs:177-178`, `:214-215`); on B-FEED-HEALTH-GRADE-ARM the range holds 1,877 commits, 29 carrying the id, and 48 deleted paths, none its own. Measured direction: a doc can read `UPDATED` from another batch's touch. The false-`UPDATED` from an earlier id mention is a hypothesis, instance not produced. Fix: one `not_covered` entry plus the Q7 closeout cannot-see row | Step 10 |
| F-2 | the advisory enum step reports `success` in run metadata even when its test found drift (run 44907099007), so nothing distinguishes drift / clean / database unreachable without opening the log, and nobody opens it | one line in the gate-4 proposal to Kyle; no new slot |
| F-3 | C-7 cites `workflow-10-governance:270`; the draft bullet is at `:269` (same at `b3bde2575` and the graded ref) | Step 10, with the pre-audit `:119` correction |
| F-4 | the B55 positive control (`history server/jobs/formula-auto-audit.ts --ref 36126033e`) is not in the evidence file, which promises every command verbatim; Langston re-derived it and it passes | named here; no further work |

Tags for the completion report:
- **OBJ-10 drift CONTENT: `RULED ON REPORTED FACT`** — the 73-vs-85 figures and per-type lists sit in an Actions log his token cannot read (HTTP 403). OBJ-10's own deliverable (the check at the ref, controls, narrowed header, advisory, not skipped on a red suite, ran in the 4/4 run) he verified.
- **OBJ-8: CARRIED, labelled** — a Claude-walked Codex document path, never a Codex run; the Codex session read is B-TOKEN-ECONOMY OBJ-3.
- **OBJ-12: CLOSED-UNPROVEN unless row 5b delivers** (condition 6).
- **OBJ-4 count:** 65 uses includes the import specifier; it is not 65 call sites.
- **OBJ-1:** schema and validator with no live instance; its 10/10 is seeded cases and may never be cited as evidence that any batch ledger exists or conforms.
