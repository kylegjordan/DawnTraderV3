# B-WAKE-HEARTBEAT-CONTROL-DATE (#1162, sprint row 1q) — CHANGE LIST (Step 4, r3)

> **This body describes the code at the ref named below.** Earlier revisions are summarised under "REVISION HISTORY" at the end and are labelled superseded. The completion report is to be written from this body (Langston gate A r2, record item 1).

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` — crew tooling on the laptop (the heartbeat task, its decision script, and one wake-filter pattern line). No trading path; nothing is deployed to staging. |
| **(ii) DOC SET for the class** | **SCOPE** — present, `Claude Comms and Packages/Scope Files/B_WAKE_HEARTBEAT_CONTROL_DATE_SCOPE.md` (APPROVED at Step 1 `f565e42c4`; amended at Step 2 for the filter arm; three sentences corrected to the code at Step 4) · **PRE_AUDIT** — present, `…/B_WAKE_HEARTBEAT_CONTROL_DATE_PRE_AUDIT.md` (APPROVED at Step 2 `49b9bde4d`) · **CHANGE LIST** — this file · **COMPLETION_REPORT** — Step 11 · **BATCH_CATALOG, PHASE_HISTORY** — Step 10 · **SYSTEM_IMPACT_MAP** — Step 10, **required** · **RUNNING_ISSUES `#1162`** — Step 10 · **SPRINT_TO_LIVE_PLAN row 1q** — Step 10 · **CLAUDE_CODE_WAKE_WATCHER_RUNBOOK** layer 3 — Step 10 · **CC-A task list** — Step 10 · **CC-A `MEMORY_CC_A.md`** and **Langston's `MEMORY.md` row** — Step 10, required · **board card** — present (`PVTI_lAHODmulEM4BfQP4zhBSS5Q`) · **SYSTEM_MANUAL** — N/A (no trading logic) · **DELETED_COMPONENTS_LOG** — N/A (nothing removed) |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_WAKE_HEARTBEAT_CONTROL_DATE_PRE_AUDIT.md`, APPROVED by Langston at `49b9bde4d` |

**REF: `review/b-wake-heartbeat-control-date`** — the commit carrying this r3 file, named in the dispatch. It sits on top of `migration/aws-supabase` `4be562e14` and is **not on that branch yet**.
- CI does not run on `review/**`, and none of the four CI jobs exercise these files.
- The review branch reaches Langston's mirror through `agent-work-sync.timer` (every 15 min), not `dt-review` (his gate A r2 provenance note), so a fresh head can take up to 15 min to be readable.

## FILES (5)
| file | change |
|---|---|
| `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/control_state.py` | **NEW** — the decision script |
| `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md` | steps 2c, 3 and 4 |
| `comms-infra/laptop/cc-wake-filter.py` | one `_HEARTBEAT_BAD` line (`:133`) |
| `scripts/analysis/test-heartbeat-control.py` | **NEW**, 42 cases |
| `scripts/analysis/test-wake-filter-cuts.py` | four `#1162` cases (35 in all) |

## THE LOAD-BEARING HUNKS (current)
**Filter, `cc-wake-filter.py:133`**: control arm field-scoped; watchers arm gains CENSUS-FAILED.
```diff
-    r"|\bwatchers:\s*[^|]*\b(?:DEAD|STUCK)\b|\bcontrol:\s*NOT answered\b",
+    r"|\bwatchers:\s*[^|]*\b(?:DEAD|STUCK|CENSUS-FAILED)\b|\bcontrol:[^|]*\b(?:NOT answered|CHECK FAILED)\b",
```

**SKILL.md:**
- **step 2c** runs `control_state.py --liveness …` every run and copies its two lines verbatim. It no longer issues control lines itself and makes no date or local-clock judgement.
- **step 3** has a watchers slot for every step-2b report, including `CENSUS-FAILED: names` (gate A r2 BLOCKER-A2), and lists every label the script emits.
- **step 4** pages when a watcher is DEAD or the script printed `NOTIFY yes`.

**`control_state.py`** (read it at the ref)
- `main` `:347`: the prologue (argument parse, `--liveness`, `--now`, the lock) is inside `try … except (Exception, SystemExit)` (`:371`). A failure there prints `control: CHECK FAILED — UNDETERMINED (script start failed …)` and `NOTIFY yes`. `decide()` has its own guard, and the lock is released in `finally`.
- **Lock** `:156`: `O_CREAT|O_EXCL`. If it is held, the run prints `held`, `NOTIFY no` and touches nothing. A lock older than 30 min is moved aside and taken over, with a note in the line.
- **Record** `:182-206`: absent means `new`; unparseable means moved aside and `RESET` (both page). Every write is read back, and a mismatch means `NOT PERSISTING` (pages).
- **Issue rule** `:229-245`: `armed` is the set of aliases with a `.alive` file. If none is missing, write today's issuer UTC date for each alias whose `N != D`. Read 2 runs only if something was issued; otherwise `s2 = s1`, which is inert because nothing changed (noted for the report). An append failure is reported by read 2 as `ISSUER NOT RUN`, which pages on the second consecutive run.
- **Ordered table** `:280-333`, in order:
  - DEAD;
  - not armed;
  - CENSUS-FAILED;
  - `N is None` → not yet issued;
  - answered (exact token match on `split()[0]`);
  - STUCK (control pending);
  - an unknown liveness, or `P` or `T` missing → UNDETERMINED;
  - a foreign inode without a rotation → UNDETERMINED;
  - `P <= O` → awaiting, or NOT delivering if `P` is unchanged since the last run on the same token;
  - a held record → held;
  - `if rotated or pino != ino: reissues = []` (`:308`, gate B condition 1);
  - `live_before`, or `arms` (including this arm) ≥ 3 → NOT answered;
  - otherwise the token is validated (`TOKEN_RE`, `:317`) and re-issued once.
- **Composition** `:339`: `control: NOT answered — …` if any NOT answered / NOT delivering; otherwise `control: CHECK FAILED — …` if any check; otherwise a quiet line.

## PER-STATE NOTIFY TABLE (gate-B condition 1)
| state (as printed) | NOTIFY | how it reaches the sessions |
|---|---|---|
| answered · awaiting · re-issued · re-issued (log rotated) · log rotated · not yet issued · held (record reset) · ISSUER GATED BY · ISSUER NOT RUN (first run) · held — another heartbeat run is in progress | no | suppressed as an all-clear (correct) |
| STUCK (control pending) | no | delivered by the watchers field (`watchers: STUCK: …`) |
| CENSUS-FAILED (control not judged) | no | delivered by the watchers field (`watchers: CENSUS-FAILED: …`, now in step 3's slot list and in the arm) |
| not armed | no | not a failure; it gates the issue |
| DEAD | no from the script | paged by step 4's DEAD rule and delivered by the watchers field |
| NOT answered · NOT delivering | **yes** | the line starts `control: NOT answered —` |
| control record new / RESET / NOT PERSISTING · UNDETERMINED · ISSUER NOT RUN (second run) · re-issue failed · remote read failed · script start failed · script error | **yes** | the line starts `control: CHECK FAILED —` |

## TESTS, run on the laptop at this ref
- `python3 scripts/analysis/test-heartbeat-control.py` → **42 passed, 0 failed.**
  - **P4** checks EVERY control line the suite produces, in both directions, against `_HEARTBEAT_OK`, `_HEARTBEAT_BAD` and `is_allclear_heartbeat`, parsed out of the repo filter. The extraction asserts that all three names were found.
  - **P4 coverage** requires **all 9** paging kinds, including `re-issue failed` (gate A r2, condition A3).
  - Every run must print exactly two lines (an assert, so the pool cannot shrink silently).
  - **TOTALITY**: a 90-cell grid.
  - **P9**: port 1 gives `ssh exit 255`.
  - The gate-B tests cover C1 and C2 (four start-failure shapes) and the token check.
- `python3 scripts/analysis/test-wake-filter-cuts.py` → **ALL PASS, 35 cases, 18 woke.**
- **Mutations, measured:**
  - The mid-field and CENSUS-FAILED cases **FAIL on the r1 arm** (`5a486de9d`'s filter: 2 FAILED; Langston re-ran this himself).
  - The `CHECK FAILED` case FAILS on the installed (pre-batch) filter.
  - Gate B C1 FAILS with the old `if pino != ino` guard (40/41).
  - R1 failed on the first draft until the current arm was counted.

## JUDGEMENT CALLS (Langston's rulings)
1. `not yet issued`: accepted.
2. A rotation clears the re-issue history: agreed, completed by C1.
3. `issuer_fail` counts runs: accepted.
4. An exception pages: accepted, and extended to the prologue (C2).
5. `ast` extraction of the filter: accepted, and the extraction now asserts all three names.

**Recorded, no action** (his gate A r2 record 4): the control arm has no negation lookbehind. The error direction is an extra wake, not a missed one.

## NOT YET DONE (Steps 5-7)
**Install (Step 6, P5):**
1. Copy the three files to `~/.claude/` and verify each against the blob.
2. Tell Kyle the first run pages once (`CHECK FAILED — control record new`).
3. Trigger "Run now".
4. Ask all four sessions to re-arm, so their watchers load the new filter.

## REVISION HISTORY (superseded text, kept short)
- **r1** (`62dc9b3b5`): the arm was `\bcontrol:\s*(?:NOT answered|CHECK FAILED)\b` (anchored), with 32 cases. The whole-batch Step-4 dispatch hit the 900 s ceiling and was split into gates A and B.
- **r2** (`59c2c6ffc`): the arm became field-scoped and CENSUS-FAILED was added; P4 covered all lines, with 8 paging kinds; the per-state table was added.
- **r3** (this): step 3 gains the `CENSUS-FAILED` slot (A2); `re-issue failed` gets a fixture and a coverage kind (A3); the two-line assert; `alive_files` renamed `armed`; gate B conditions C1 and C2 and its record items; this body rewritten to the current code.
