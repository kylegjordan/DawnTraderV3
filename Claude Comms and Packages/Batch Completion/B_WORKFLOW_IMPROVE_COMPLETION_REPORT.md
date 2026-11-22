# B-WORKFLOW-IMPROVE — Completion Report (Step 11)

change-class: non_architecture · owner PM Claude (KD-103) · reviewer Langston · plan row: `SPRINT_TO_LIVE_PLAN.md` stage 0 row 2

## ⚠️ LEFT OPEN — stated first

| item | owner | placed home | closes when | fails when |
|---|---|---|---|---|
| **OBJ-12 search-index leg — CLOSED-UNPROVEN** (scope condition 6: not markable by proxy) | Infra Claude (closing work), PM Claude (re-check) | `#1262` → `B-CONVERSATION-INDEX`, `SPRINT_TO_LIVE_PLAN.md` stage 0 row 5b (the row names this closing condition) | row 5b delivers an index covering the governance documents and commit messages (KD-102), passing its own known-miss test set, and the `workflow-02` aids table is updated to call it delivered, with its command and cannot-see lines | row 5b closes without the governance documents in the index, or the aids table still names the index as undelivered after 5b closes; either reopens it as a decision for Kyle |
| **OBJ-8 Codex leg — the real Codex session read** (only a Claude-walked document path was done) | PM Claude | `B-TOKEN-ECONOMY` OBJ-3 (the Codex canary), that batch is IN OBSERVATION | a real Codex session start and post-compaction read shows the new step text reaching it | the canary shows Codex not reaching the text; that batch's close records it and reopens OBJ-8 here |
| **OBJ-10 drift itself** (the check found five drifting enums) | ANALYST Claude | `#1263` → `B-DB-REGIME-ENUM-ALIGN`, `SPRINT_TO_LIVE_PLAN.md` CC-C list 1 (KD-110); residue on the after-live list | per that batch's scope | per that batch's scope |

🚨 **THIS BATCH SHIPS EVERY NEW STEP RULE AS DRAFT AND NON-BLOCKING.** OBJ-2, OBJ-3 and the Step-11 YES/NO/PARTIAL/CLOSED-UNPROVEN form are marked `◇ DRAFT` in the step skills; none is a gate until a reviewer's recorded ruling switches it on (scope line 31; gate-1 ruling). OBJ-10's CI check is advisory and outside the required jobs until Kyle rules whether a PM-authored test may block a trading deploy (scope condition 5).

## What the batch was for
Make the eleven-step workflow catch the escapes that reached staging (#903, #1063, #1160, #691) by giving Steps 1, 2, 8, 10 and 11 cheap, checkable aids — a code-search tool, a census, a history list, a generated close-out, a ledger — proving them on closed batches before relying on them, and stripping repeated text out of the step skills so the crew reads less to follow more.

## Objectives

| OBJ | result | evidence | tag |
|---|---|---|---|
| 1 traceability ledger | YES (schema and validator only) | `7eccaaa63`; `ledger-validate --self-test` PASS 10/0 (Step 7) | **seeded cases only: no live batch ledger exists; the 10/10 may never be cited as evidence that any batch ledger exists or conforms** |
| 2 proof record + honest residual | YES, as draft | `◇ DRAFT` blocks in workflow-01 :51, -08 :25, -09 :28, -10 :268, -11 :62 (Step 7) | draft, non-blocking |
| 3 two-legged Step 8 | YES, as draft; exercised on this batch | same draft blocks; this batch's own Step 8 ran both legs (Langston, `1573704029442412579`) | draft, non-blocking |
| 4 code-search CLI | YES | `code-refs toCanonical` uses 65, definitions 1; red mutation 66/64 (Langston leg 2) | **65 includes the import specifier; it is not 65 call sites** |
| 5 census | YES | exit 0 / 1 / 1 on the three controls (Step 7) | — |
| 6 history list | YES | B59 + B55 listed; B55 control passes (Langston re-derived, F-4) | — |
| 7 generated close-out | YES | `closeout --self-test` 7/7; `--compare` every row equal; first-commit control on B-FEED-HEALTH-GRADE-ARM passed (leg 2) | F-1 fixed at Step 10 (`not_covered` line) |
| 8 workflow text, both crews | PARTIAL | `B_WORKFLOW_IMPROVE_REACHABILITY.md` 8/8 Claude canary | **CARRIED: a Claude-walked Codex document path, never a Codex run**; real read → B-TOKEN-ECONOMY OBJ-3 |
| 9 pilot | YES | `B_WORKFLOW_IMPROVE_PILOT.md`: four closed batches (B-NEW-49, 19F, 74, B-NEW-40), ten blind spots, reliance text | no gate switched on (gate-5 ruling `174f5bc33`: neither proposed aid built here) |
| 10 code vs database allowed values | YES | CI run 44907099007, step "Enum parity (advisory, not required)" ran in the 4/4 run, not skipped on a red suite | **drift CONTENT `RULED ON REPORTED FACT`** — the 73-vs-85 figures sit in an Actions log Langston's token cannot read (HTTP 403); the check itself he verified |
| 11 strip repetition | YES | `move-ledger-check` 9/9, OK 55 + OK 14 moves; `skill-cites` 6/6; `--check` against a planted before-listing found 3 DISAPPEARED (leg 2) | — |
| 12 search-index leg | CLOSED-UNPROVEN | none; row 5b not delivered | home in the LEFT OPEN table |

## Review trail
- Step 4, five gates: gate 1 audit-aid text narrowed (`57a8bf75e`); gate 2 five conditions + fold-ins (`70a629f64`, re-check `07b7cd727`); gate 3 C-7, C-8, Q10 (a)-(e), Q7 row (`b3bde2575`), D-1/D-2 (`ef1d13abb`); gate 4 enum drift → Kyle, placed KD-110 (`0e417497d`); gate 5 PROCEED (`174f5bc33`).
- Step 5: CI 4/4 green at `29303adff`, run 44907099007 — TypeScript Check, Test Suite, Build, Docker Build all `success`.
- Step 6: no deploy owed — nothing in the batch runs on staging (`7538c9244`).
- Step 7: `53a56b3db`. Step 8: PROCEED, Langston `1573704029442412579` (`cdaf37ddc`). Step 9: nothing to iterate.
- Step 10: `383ee9857`, `6ba2de7eb`; #1263 provenance read `ca7dc70e9`.

## Governance files changed — transcribed from the Step 10 tier ledger (`383ee9857` message)

| # | document | WHEN IT APPLIES | verdict | ONE LINE |
|---|---|---|---|---|
| T1 | BATCH_CATALOG | every batch | ✅ | new entry, Steps 1-10 done, Step 11 pending |
| T1 | PHASE_HISTORY | every batch | ✅ | 2026-11-22 entry in plain language |
| T1 | SPRINT_TO_LIVE_PLAN | batch has a plan row | ✅ | row 2 status at Step 10; row 5b carries #1262 |
| T1 | PHASE_19_PLAN | Phase 19 batch | N/A | not a Phase 19 batch, no row there |
| T1 | shared MEMORY.md + MEMORY_PM.md | every batch | ✅ | MEMORY_PM (both copies) at Step 10; shared MEMORY.md has nothing to change |
| T1 | SCOPE | every batch | ✅ | written and approved at Step 1 |
| T1 | PRE_AUDIT | every batch | ✅ | Q9 row marked superseded |
| T1 | COMPLETION_REPORT | every batch | ✅ | this file (was BLOCKED — Step 11 at Step 10) |
| T1 | observation column | batch has an observation window | N/A | none; the Codex canary rides B-TOKEN-ECONOMY OBJ-3 |
| T1 | session task lists (CC-A, CC-B, CC-C, CC-INFRA) | owner holds a task list | N/A — not mine | PM owns the batch and has no task list; na-skip row in GOVERNANCE_EXCEPTIONS, confirmer PENDING Langston at this step |
| T1 | Langston MEMORY | every batch | ✅ | 00-legacy.md line, sha 297c8457871e -> 17305d22ee50 |
| T2 | SYSTEM_MANUAL | trading architecture or maths changed | N/A | crew tooling only; no trading behaviour |
| T2 | SYSTEM_IMPACT_MAP | a component's links changed | ✅ | new 9.16 Crew audit tooling |
| T2 | RUNNING_ISSUES | an issue opened, moved or closed | ✅ | #1038 note (recorded instrument); new #1262 (OBJ-12 home, row 5b); #1263 enum drift (`6ba2de7eb`) |
| T2 | CHANGES_AND_FIXES | app code fixed | N/A | no app code |
| T2 | POST_AUDIT_ROADMAP | roadmap-level change | N/A | none |
| T2 | ADJUSTMENT_FRAMEWORK | a trading knob changed | N/A | none |
| T2 | AUTHORITY_BASELINE | an authority value changed | N/A | none |
| T2 | STORAGE_POLICY | storage or retention changed | N/A | none |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN | asset-class or VTS change | N/A | none |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW | onboarding change | N/A | none |
| T2 | BUILD_METHOD_PLAYBOOK | the build method changed for good | N/A | the new step rules are DRAFT, not binding yet |
| T2 | LANGSTON_ARCHITECTURE | the reviewer's build changed | N/A | his build untouched |
| T2 | CLAUDE.md / CONDUCT.md | rules files changed | ✅ | CLAUDE.md pointer sentences at Step 3 (`b6f70412e`, `413b5853a`); CONDUCT unchanged |
| T2 | CLAUDE_MD_RULE_HISTORY | a CLAUDE.md rule added or materially changed | N/A | pointer sentences only, no rule added or changed |
| T2 | DELETED_COMPONENTS_LOG | a component removed | N/A | skill text archived verbatim behind a move ledger; nothing removed |
| T2 | MISTAKE_PATTERNS | a MISTAKE trailer in the batch | ✅ | skipped-the-gate #5 (tripwire hit, #754 to CC-A and Kyle); two wrong-object rows |
| T2 | GOVERNANCE_EXCEPTIONS | an exception taken | ✅ | na-skip task_lists, confirmer pending Langston |
| T2 | ALERT_HANDLING_PROTOCOL | alert handling changed | N/A | none |
| T2 | DELIVERY_BOARD_PROTOCOL | board rules changed | N/A | none |
| T2 | CLAUDE_CODE_FEATURE_WATCH | model or feature check changed | N/A | none |
| + | SEARCH_SURFACES | search instruments changed | ✅ | §1 recorded instrument; §2 R5 answer |

Ledger checker (draft line): not run — there is no batch ledger instance to check (OBJ-1 ships the schema only). Reported, not gated, during the draft period.

## New findings (each with its home)
- **Enum drift between the code and the database (gate 4):** `#1263`, placed KD-110 (ANALYST, CC-C list 1, before live mode). The provenance read also found the daily AI brief failing every day since 2025-10-25: `#1264`, switched off under KD-111 (NEW, CC-B list 3b), removal on the after-live list.
- **F-2 — the advisory enum step reports `success` even when it found drift** (run 44907099007), so drift, clean and database-unreachable look the same without opening the log. Disposition: recorded in `#1263` (the gate-4 record, `6ba2de7eb`) as a condition before the step can become a candidate to block; the step stays advisory, no new slot, no work now.
- **Skipped-the-gate tripwire hit (MISTAKE_PATTERNS #5):** a push loop checked CI was idle, not green (`70a629f64`). Per the tripwire, `#754`'s unbuilt checker legs return to priority, owner OLD Claude, and are reported to Kyle this week.
- **Aids proposal P-1..P-4 (for Kyle's list, not slotted):** a value-set aid first (the only aid that could have caught #1063's shape mechanically); entry only after the first real blind-spot blocks are read; a pre-registered discriminating test on #1063; a lead, never a gate.

## Honest residual
- No new step rule has been exercised by a batch other than this one; the pilot sample was purposive (four chosen escapes), so it shows the aids CAN find those shapes, not how often they help.
- Whether Codex sessions actually read the new step text is unestablished until B-TOKEN-ECONOMY OBJ-3.
- The process-weight claim (OBJ-7 and OBJ-11 remove more text than R0 and R1 add) was not measured on a following batch.

REVIEWER: no fresh reader spawned; every objective row is transcribed from the Langston-ruled Step 7 and Step 8 records cited above. Claims not in those records: NOT RE-READ (the P-1..P-4 framing).
