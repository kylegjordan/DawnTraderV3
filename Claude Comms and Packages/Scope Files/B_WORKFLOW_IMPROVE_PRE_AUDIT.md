# B-WORKFLOW-IMPROVE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · owner: PM Claude (KD-103) · routine reviewer: Langston (CLAUDE mode, generation 3) · scope: `B_WORKFLOW_IMPROVE_SCOPE.md` r2 @ `5aa251e7a`
STEP: 2 of 11 (gate passed with conditions, r2) · NEXT STEP: 3 of 11
record: author/actor = PM Claude (session 994e6488); crew mode CLAUDE gen 3; r1 graded at `4df022e9a` (2026-11-19T14:38Z); r2 written 2026-11-19 after Langston's verdict

## PREVIOUSLY STATED vs NOW (read first)
- **PREVIOUSLY STATED (review r7, scope OBJ-2):** "Step 9 says every objective green; Step 11 allows NO / PARTIAL", a contradiction.
  **NOW:** the contradiction is narrower than stated, and B1 sets it out.
  **REASON:** `workflow-09-iterate/SKILL.md:8` "Ends when: every scope objective is green", but `:11` already allows an open item with a named owner, a placed home, and a closing and failure condition. `workflow-11-completion/SKILL.md:27` allows YES / NO / PARTIAL (also at `:91`). CLOSED-UNPROVEN formalizes the `:12` residual; it is not a new concept.
- **PREVIOUSLY STATED:** "a small wrapper around the TypeScript language service" (scope OBJ-4).
  **NOW:** it is built on the repo's own pinned `typescript` 5.6.3 (`package.json:143`, lock `:9589-9590`), not on the laptop's global language server.
  **REASON:** `typescript-language-server` exists only globally on the laptop (B2). A repo-pinned compiler is the only version both crews and CI share.
- **PREVIOUSLY STATED:** the pilot replays "#903, #1063, #1160 and #691".
  **NOW:** of the four, only #691 has a confirmed introducing batch (B-NEW-49 `00945ddf8`). B8 has the detail.
  **REASON:** target identification for the other three is not done at this step. It is flagged **UNAUDITED** and is the first Step-3 task, with substitution criteria.
- **PREVIOUSLY STATED:** archive the "preserved verbatim" blocks (scope OBJ-11).
  **NOW:** reconcile, then archive.
  **REASON:** each skill says of its verbatim block, "Where the two differ, this block is authoritative." Removing it without first proving the summary matches would silently change which text binds (B6).

## Sources read (the six)
| # | Source | Read |
|---|---|---|
| 1 | Code at the ref | the 12 workflow skills, `bug-investigation`, `scripts/governance-checker/config.mjs` (`CLASS_DOCSET` L135-155, `REQUIRED_IF` L162-164, `LEDGER_ROWS` L178), `package.json`, the three tsconfigs, `ci.yml`, the bootstrap files, `shared/schema.ts`, `SEARCH_SURFACES.md` |
| 2 | Runtime | the language-server plugin's install on the laptop (B-INSTRUMENTS-OVER-RULES); git history (`--follow` across the 07-03 renames); the CI job layout. There is no staging runtime: nothing here runs on staging |
| 3 | `SYSTEM_IMPACT_MAP.md` | the skills relocation note; B-CODEX-FAILOVER "INSTRUCTION SURFACE" (AGENTS.md is the Codex counterpart; skills are read as plain files); silent on the language-server plugin and on `SEARCH_SURFACES.md` (both gaps are closed at Step 10) |
| 4 | `SYSTEM_MANUAL.md` | three skill mentions (line 591); otherwise silent, which is correct for crew tooling |
| 5 | Batch reports and the ledger | B-RULES-1d, B-CLAUDEMD-SLIM, B-INSTRUMENTS-OVER-RULES (usage FAILED), #1038, B-GOV-2 (class table), the four escapes' entries (B8), #174, the 11-18 evidence pass over 74 completion reports |
| 6 | `bridge/canonical/` | not applicable: every component post-dates 2026-01/02. One pilot escape, #1160's view default, dates from 2025-10 (`9d8135c47`) and is handled in B8 |

## Audit findings

**B1 — Steps 9, 10 and 11.** These are the lines quoted in the PREVIOUSLY STATED block above.
- The R1 proof record and CLOSED-UNPROVEN go into `workflow-01` (the record) and `workflow-09`, `-10` and `-11` (the status wording). They are marked DRAFT and are non-blocking.
- **Census:** these skills are read by every building session at each step, by Codex through `AGENTS.md:24`, and by the reviewers. No code reads them: a `git grep` over `scripts`, `.claude/hooks`, `.github` and `server` for the skill paths and block headings returns nothing. The positive control is the same pattern hitting the skills themselves.

**B2 — the code-search instrument.**
- **The TypeScript project.** `typescript` 5.6.3 is pinned. There are three tsconfigs:
  - the root, which includes `client/src`, `shared` and `server` and excludes `**/*.test.ts` and `server/legacy`;
  - `server/tsconfig.json`, with `moduleResolution: bundler` and an `@server/*` path;
  - `tsconfig.w20c-census.json`, which covers one file.

  There are no project references. CI runs Node 20 (ci.yml lines 44, 95, 263).
- **The language-server plugin is Claude-only and lives on the laptop only:** `~/.claude/skills/dt-typescript-lsp/.lsp.json` launches the global `typescript-language-server`.
- **The control.** `SEARCH_SURFACES.md:31` and `:39` record `toCanonical` at 65 references across 10 files, at `e16767ef7`, on the language server.
- **Open question:** whether the compiler API's `findReferences` with the root tsconfig equals that count. The control answers it at Step 3.
- **Note:** the root config excludes tests, while the 65 included tests, so the CLI must load test files explicitly to compare like with like.

**B3 — the census surfaces.**
- **Schedulers and start paths:**
  - `server/index.ts` (11 `.start(` lines), `server/startup/trading-bootstrap.ts` (2, reached at `server/index.ts:633`), `fx5-scanner-bootstrap.ts` (1) and `server/routes.ts` (3);
  - 58 `.start(` and 107 `setInterval(` lines under `server/` (tests excluded; line counts);
  - app-level cron in `server/services/cron-registry.ts` and the related `cron-*` files.
- **Outside the app:** PM2 `ecosystem.config.cjs`; systemd units and timers under `comms-infra/` (the full count is not established; the listing was cut at 40).
- **Tables:** declared in `shared/schema.ts` (164 `pgTable(`), plus `shared/diagnostic-schema.ts`. Migrations are in `drizzle/migrations/*.sql`.
- **Raw-SQL sites:** 501 lines under `server/` (one combined grep; the three forms sum to 574, so lines overlap).
- **What follows:** a type-aware tool sees drizzle table references but not raw SQL. The census therefore reports raw-SQL table hits as a separate, labelled text match.

**B4 — history attribution.**
- 5,019 of 9,768 commits since 2026-06-01 (51.4%) start their subject with a batch id. The other 48.6% cannot be attributed by subject.
- `git log --follow` crosses the 07-03 rename: `active-execution-engine.ts` traces back to `cb8ee0942` (2025-10-10) as `paper-execution-engine.ts`.
- **What follows:** the history list prints unattributed commits apart, by subject, and never drops them. Coverage is printed as attributed out of total.

**B5 — CI and the code-versus-database check.**
- The `test` job has a Postgres service (pgvector image, lines 69-75) and applies migrations (`npm run db:migrate`, lines 100-104) before `vitest` (lines 106-107).
- A source-only precedent exists: `server/tests/unit/b-balance-session-pairing-block-reason-enum.test.ts` regex-parses a `pgEnum` and compares it with a TypeScript type.
- No test queries the live database's enums (`git grep pg_enum|enum_range` found docs only; control: the `pgEnum` grep found the test above).
- **What follows:** after migrations, a test can compare each `pgEnum([...])` in `shared/schema.ts` with `pg_enum` in the CI database, in both directions.
- **#1063 is still open** (`shared/schema.ts:111` declares six `pattern_type` values; the database holds five). So the new check should report it today. It is a live positive control, which is why the check must ship warn-only (`continue-on-error`), per scope r2 condition 5.

**B6 — repeated blocks in the skills** (byte ranges from heading to the next heading; slightly over-counted where a block ends at a sub-heading).

| block | bytes | files |
|---|---|---|
| A: preserved verbatim | 14,789 | 11 |
| B: board | 11,233 | 10 (the hotfix has none) |
| C: fresh reader | about 26,800 | 8 (the full 6.6-6.7 KB form in 02, 04, 07 and 11; 236-525 B stubs elsewhere; 2,715 B in `bug-investigation`) |

- **The board block's first line is step-specific in every file** (create the card or move it to a named column, and set Blocked on). It stays in each skill. Only the repeated paragraphs, about Review, "nothing automates this" and the board URL, move to the shared contract.
- **`workflow-02` L94** carries a pre-audit-specific sub-heading inside its fresh-reader block. It stays in 02.
- **The A blocks are declared authoritative over their summaries.** Archiving one therefore needs a reconciliation check first. The check proves every rule in the verbatim block is present in the summary, or carries it into the summary, and then names the summary authoritative.
- **`workflow-hotfix`** has the census (L44) and the ledger search (L49-50) but no six sources and no fresh reader. Under the shared contract it inherits the fresh-reader rule for load-bearing claims, and a proportionate proof record (one line per fix).

**B7 — the close-out source.**
- **The class matrix** is in `workflow-10` (`:106-122`, 17 rows, cells marked `REQUIRED`, `judged` or `N/A` with grading tags R, c or —). It is derived from `config.mjs` `DOCS`, `CLASS_DOCSET`, `REQUIRED_IF` and `LEDGER_ROWS`.
- **The generator imports those tables; it does not copy them.** One source, so the matrix and the generator cannot drift apart.
- **What the diff alone misses:** an omitted update, because the diff is silent. The generator therefore also takes the Step-2 census and R0, as Coltrane required.

**B8 — the pilot targets.**
- **#691** is CLOSED 2026-11-14 by B-CRON-MISSED-CATCHUP. It was introduced by the B-NEW-49 verifier `00945ddf8` (2026-05-31), a batch that closed with a verifier which missed executions. This is a confirmed replay target.
- **#903** is CLOSED 2026-10-07 by hotfix B-DASHBOARD-STATS-BLANK. B-BALANCE-TRUTH OBJ-4 `567385eae` is the candidate source; its scope and completion report exist but have not been read. **Not confirmed.**
- **#1063** is OPEN. The batch that added the sixth `pattern_type` value is not identified (`git log -S` on `shared/schema.ts` returned nothing). **Not confirmed.**
- **#1160** is OPEN for its view-default half, which dates from `9d8135c47` (2025-10-06), before governance. The "active" half was fixed by hotfix B-LIVE-BANNER-ACTIVE-HOTFIX. A pre-governance origin has no audit to replay, so it is substituted unless the "active" flag's introducing batch is found.
- **Substitution pool,** from the 11-18 evidence pass: #1195 (B_B75_COUNT_GATE, a copy defect that went uncounted) and #1211 (B_CRON_VERIFIER_QUERY_FAIL, a failed read treated as empty).
- **Criteria:** the escape must be closed, or its defect pinned to a ref; it must have an introducing batch with a scope or pre-audit document; and the four together must cover the classes of second path, enum drift, meaning mismatch and failed-read-as-empty.

**B9 — two-crew reachability.**
- Codex reads `AGENTS.md`, then `CONDUCT.md`, `CLAUDE.md` and the step skills by path (`AGENTS.md:22-25`). A shared contract file is reachable only if each step skill names it and `AGENTS.md` §2 lists it.
- The CLIs are plain Node scripts under `scripts/crew-tooling/`. Node runs from Git Bash for both crews, and the existing measure-gate scripts already run that way.
- **Coordination with B-TOKEN-ECONOMY:** both batches edit `CLAUDE.md` and `AGENTS.md`. This batch's edits there (the aid names in the §9.5 trigger and the `AGENTS.md` §2 read path) land after B-TOKEN-ECONOMY's slim (P5), on the slimmed text, so the two never edit the same lines.

**B10 — gradability and windows.**
- All the CLIs land under `scripts/crew-tooling/`, which is a `CODE_PREFIXES` path (`config.mjs:102`).
- The CI change is one step in `ci.yml`.
- There is no staging observation window, so no `DEPLOY_WINDOWS` row is filed.

## Implementation plan (each item points at its finding)
| # | Objective | What is built | Finding | Proof |
|---|---|---|---|---|
| Q0 | OBJ-9 prerequisite | **UNAUDITED until done: the first Step-3 task.** Confirm or substitute the four pilot targets per B8's criteria, recording each one's introducing commit (`git log -S` / blame on the defect line) and its batch documents | B8 | A table of the four targets, each with its ref, batch and documents, committed before any replay |
| Q1 | OBJ-1 | `scripts/crew-tooling/ledger-schema.json` + `ledger-validate.mjs`. Fields: objective, intent, components, entry points, readers (with meaning, missing/error/stale, concurrency), plan item, diff, tests, Step-7 proof, Step-8 challenge, status, actor, role, crew mode and generation, ref, time, tool versions and outputs, "missed earlier, found at step N" | B1 | Passes a sample; fails three seeded defects (missing link, missing actor, done-while-unproven) |
| Q2 | OBJ-2, OBJ-3 | DRAFT text: the proof record in `workflow-01`; CLOSED-UNPROVEN in `workflow-09`, `-10` and `-11` (formalizing `09:11`); the two-legged Step 8 in `workflow-08`; criterion change control. Each marked "DRAFT — non-blocking until the pilot" | B1 | The text at the ref; Q1 rejects done-while-unproven |
| Q3 | OBJ-4 | `scripts/crew-tooling/code-refs.mjs`: the TypeScript 5.6.3 LanguageService, root tsconfig plus test files, server tsconfig for `server/**`. JSON output (tool and TS version, tsconfig, symbol, refs, unresolved). Exit codes: 0 found, 1 none, 2 error | B2 | At `e16767ef7`, `toCanonical` gives 65 refs in 10 files (or the difference explained). A scratch copy with an added call gives 66; renamed gives 0; runs the same from a Codex session |
| Q4 | OBJ-5 | `scripts/crew-tooling/census.mjs`: code-refs; an entry-point inventory (B3's bootstrap files, `setInterval`, cron registry, `ecosystem.config.cjs`, `comms-infra` systemd units) filtered to the target; drizzle references (type-aware) and raw-SQL table hits (text, labelled). Always prints the unresolved-surfaces list and the searched population | B3 | Known positives: `trading-bootstrap.ts` reached from `server/index.ts:633`; one cron registry entry; one raw-SQL reader |
| Q5 | OBJ-6 | `scripts/crew-tooling/history.mjs <path\|symbol>`: `git log --follow` (former names collected); batch ids from subjects; unattributed commits listed apart; links to the batches' scope, audit and completion files; `RUNNING_ISSUES`, `DECISIONS` and `DELETED_COMPONENTS_LOG` rows citing the file or any former name | B4 | #174's file `server/services/ml-calibration.ts` surfaces its #174 entry and the 2026-07-28 decision; `active-execution-engine.ts` reaches `cb8ee0942` |
| Q6 | OBJ-7 | `scripts/crew-tooling/closeout.mjs`: imports `config.mjs` tables; inputs the scope's class, the census output, R0, the base-to-deployed diff; emits `workflow-10`'s matrix with verdict cells and required reasons; rendered into the post, the commit and the report | B7 | Generated for one closed batch and compared with its hand ledger, each difference explained |
| Q7 | OBJ-8 | Step 1, Step 2, the hotfix and the §9.5 trigger in `CLAUDE.md` name the four aids and their standing (leads, never verdicts). `AGENTS.md` §2 lists the shared contract and the CLIs. These edits land after B-TOKEN-ECONOMY's P5 | B9 | `Change Lists/B_WORKFLOW_IMPROVE_REACHABILITY.md`; canary once per crew (a Claude session and a Codex session each reach each instruction at its point of action) |
| Q8 | OBJ-9 | The pilot: Q3-Q6 run on Q0's four batches; per batch, what the aids found, what they missed, what the hand audit missed; the blind-spot list; reliance written into Step 2; any gate switched on only by the reviewer's recorded ruling | B8 | `Change Lists/B_WORKFLOW_IMPROVE_PILOT.md` |
| Q9 | OBJ-10 | `server/tests/unit/enum-parity.test.ts`: each `pgEnum` in `shared/schema.ts` against `pg_enum` in the CI database, both directions, with a named list of historical values. A separate `ci.yml` step with `continue-on-error: true`, outside the required result. Test-only; Langston ruled PM may build it | B5 | ~~Reports #1063's `pattern_type` drift today (live positive control)~~ **SUPERSEDED at Step 10 (Langston gate 5, `fix-follows-pointer`):** measured false - `Change Lists/B_WORKFLOW_IMPROVE_ENUM_PARITY_FIRST_RUN.md` found no `pattern_type` drift (the CI database and staging both hold the six code values); the live positive control is the drift the check did report (73 declared vs 85 database types, gate 4, with Kyle). A seeded matching enum passes |
| Q10 | OBJ-11 | The shared contract `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` (the fresh-reader rule once, the board's repeated paragraphs, the stateless-reviewer note). Reconcile, then archive the A blocks to `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md`. Each skill keeps its step-specific board line; `02`'s L94 standing-approval sub-heading moves into the contract (r2 minor). `bug-investigation` points to the contract; `workflow-hotfix` names what it inherits | B6 | `Change Lists/B_WORKFLOW_IMPROVE_MOVE_LEDGER.json` checked by the B-TOKEN-ECONOMY move-ledger script (one tool for both batches); a reconciliation table per A block; bytes before and after |
| Q11 | OBJ-12 | Once row 5b delivers: Steps 1 and 2 and §9.5 name the index CLI; a known-miss test, keyword-only versus keyword plus meaning. If 5b has not delivered at close, CLOSED-UNPROVEN with its home | (dependency) | The index runs from both crews; the test set is scored |

**Order:**
1. Q0
2. Q1 and Q2
3. Q3, then Q4 and Q5
4. Q6
5. Q9
6. Q10
7. Q8 (the pilot)
8. Q7, once B-TOKEN-ECONOMY P5 has landed
9. Q11 when 5b delivers

**Files touched:**
- **New:**
  - `scripts/crew-tooling/` (six scripts and the schema)
  - `server/tests/unit/enum-parity.test.ts`
  - `1-system-manual/WORKFLOW_SHARED_CONTRACT.md`
  - the `_archive` file
  - `Change Lists/B_WORKFLOW_IMPROVE_*`
- **Modified:**
  - the 12 workflow skills
  - `bug-investigation`
  - `CLAUDE.md` (the §9.5 trigger)
  - `AGENTS.md`
  - `ci.yml` (one step)
  - `SEARCH_SURFACES.md`

## Risks and blast radius
- **A draft rule read as binding.** Every DRAFT is marked in its heading, and Q1 records the status.
- **A clean tool output taken as completeness.** Every CLI prints its population and its unresolved surfaces.
- **Archiving an authoritative block changes the binding text.** Mitigated by the Q10 reconciliation before the move.
- **The CI step blocks a trading deploy.** It does not: `continue-on-error`, outside the required result.
- **Both batches edit CLAUDE.md and AGENTS.md.** Sequenced (B9).

## Fresh-reader and NOT RE-READ record
- **REVIEWER:** none spawned for this document.
- **NOT RE-READ (load-bearing, re-derived only by PM or a helper with controls):**
  - B1's absence claim: no code reads the skills.
  - B5's: no live-enum test exists.
  - B2's control figures.
  - B8's target status.

  These go to Langston's Step-2 read as stated.

## r2 — Langston's Step-2 conditions (2026-11-19 14:41Z, at `4df022e9a`; verbatim in `Langston Design Asks/B_TOKEN_ECONOMY_B_WORKFLOW_IMPROVE_STEP1_VERDICTS.md`), all accepted
1. **Q9's live positive control is withdrawn as stated.**
   - At the ref, `pattern_type` is at `shared/schema.ts:140`, not `:111`.
   - Its comment says "ABCD made storable by migration 2026-10-02-b-pattern-enum-drift-abcd.sql". So #1063's drift is likely closed in a migrated database, and B5's "reports it today" is unevidenced.
   - **Step 3, before building Q9:** run `db:migrate` against a scratch database and compare each `pgEnum` with `pg_enum`.
   - **If a live drift exists,** it is the control.
   - **If none exists,** the control is a seeded mismatch: a test-only enum declared in code and absent from the database, which must turn the check red. A second seeded control runs in the reverse direction.
   - The CLOSED or OPEN state of #1063 is re-read at the ref and reported, not assumed.
2. **The Step-10 half of the contradiction is dropped.** `workflow-10-governance/SKILL.md` has zero occurrences of PARTIAL. The citation is removed above, and only `workflow-11:27` and `:91` are cited.
3. **The `workflow-09` residual is at `:11`,** which reads: open item with a named owner, a placed home, and a closing and failure condition. Corrected above.
4. **The class matrix is `workflow-10-governance/SKILL.md:106-122`, 17 rows.** Corrected above. Q6 reproduces exactly that object, and its proof compares row by row.
5. **Q10 gains a deletion census over the citing corpora.**
   - Before any block moves, every pinned skill-line citation in `1-system-manual/` and `Claude Comms and Packages/` (`workflow-NN:<line>`, `bug-investigation:<line>`) is enumerated.
   - Each is re-pointed to a heading, or to its new line at the post-move ref, and recorded in the Q10 move ledger with old and new targets.
   - B1's no-code-reader claim stands for code only. Its population (`scripts`, `.claude/hooks`, `.github`, `server`) is stated as excluding the doc corpora.
   - The same failure caused conditions 2-4. All three are re-read from the ref with the line text beside the number.
6. **The batch's own ground rule applies to its documents.** The header now records actor, crew mode and generation, graded ref and time. Every later artifact of this batch carries the same fields.

**Minor, answered:** `workflow-02:94`'s sub-heading grants standing approval to spawn fresh readers "at ANY point in the workflow". It therefore moves to the shared contract with the rest of the fresh-reader rule, not kept in 02 only. Q10 is amended accordingly.
