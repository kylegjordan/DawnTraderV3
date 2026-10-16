# B-WAKE-HEARTBEAT-CONTROL-DATE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan row:** 1q · **Issue:** `#1162` · **Scope:** `B_WAKE_HEARTBEAT_CONTROL_DATE_SCOPE.md`, APPROVED by Langston at Step 1 (`f565e42c4`, conditions folded at `90b6b234c`) · **Reviewer:** Langston

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED** (scope r1 §1): the CC-B and CC-C leases were "renewed" on 10-16. **NOW:** they were re-taken at new arms. **REASON:** Langston, Step 1 (A): the lease has one write site and is never refreshed.
- **PREVIOUSLY STATED** (scope §0): "the live copy is identical apart from line endings". **NOW:** unchanged and re-measured 2026-10-16: `diff` of both files with `\r` stripped is empty. The watcher filter's live copy equals the ref `comms-infra/laptop/cc-wake-filter.py` byte-for-byte after the same stripping. **REASON:** re-measured for this audit, not carried from memory.

No number in the approved scope moved.

## A. THE AUDIT
### A1. Sources read (the six)
| # | source | read |
|---|---|---|
| 1 | code at `origin/migration/aws-supabase` | `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md` (whole, 58 lines); `comms-infra/laptop/cc-wake-filter.py` `:322`, `:323`, `:341`, `:467`, `:487-497`, `:552-563`, `:637-652`, `:857-871`, `:960-975`, `:995-1004`, `:1220-1226`; `cc-wake-follow.py` `:82`, `:89` |
| 2 | runtime | the live files on Helsinki (`/var/log/cc-wake.log`, 229 lines, inode 1255) and on the laptop (`cc-wake-state/`); the inbox's 10-06 → 10-16 Heartbeat posts; the scheduled-task registry (below) |
| 3 | `SYSTEM_IMPACT_MAP.md` | wake-watcher block `:3764` (liveness, lease, stale-not-dead) — **SILENT on the daily control and on the heartbeat's decision rules. This is a governance gap, to be filled at Step 10 (plan item P6).** |
| 4 | `SYSTEM_MANUAL.md` | no coverage, and none expected (crew tooling, not trading logic) |
| 5 | ledger and reports | `RUNNING_ISSUES` `#1162`, `#1127`, `#731`, `#1140`; `BATCH_CATALOG` B-TOKEN-BURN-CUT; `B_TOKEN_BURN_CUT_{SCOPE,PRE_AUDIT,CHANGE_LIST}.md`; `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:27` |
| 6 | `bridge/canonical/` | **consulted, no coverage.** The daily control was introduced 2026-09-30, after the governance change; its intent is recorded in the B-TOKEN-BURN-CUT documents quoted in scope §2. |

### A2. ENTRY POINTS — enumerated repo-wide and on both machines, FIRST
**Who SCHEDULES the heartbeat:** exactly ONE entry point.
- The scheduled task `wake-watcher-heartbeat` (`0 * * * *`, ~12 min jitter, enabled; read from the app's task registry 2026-10-16).
- The registry holds no other enabled task that runs it.
- Nothing on Helsinki writes `WATCHER-CONTROL`: `grep -rln cc-wake.log` over `/usr/local/bin` and `/opt/discord-bridges` returns no match. Its only hits are Langston's own instruction files, which document the manual summon `echo`.
- **No mutual-exclusion check is needed:** one hourly scheduler. JUDGEMENT CALL D: two overlapping runs are possible only if one run takes over an hour, and the record file's read-back would expose a concurrent writer as a mismatch.

### A3. COMPONENT CENSUS
**`/var/log/cc-wake.log` (Helsinki)**
| question | members |
|---|---|
| writes | (1) the heartbeat's step 2c over SSH: `WATCHER-CONTROL <alias> <token>`, 56 of 229 lines; (2) manual summon lines from Langston and sessions (`Claude Old: …`, `Claude New: …`, about 170 lines), documented in Langston's `CLAUDE.md`. **After this batch, writer (1) also appends re-issues.** |
| reads | each session's watcher via `cc-wake-follow.py` (one follower per arm; `SOURCES` at `:322`). Analysis and test scripts read copies, never the live file. |
| mutates | none (append-only) |
| **deletes / rotates** | **none**: no logrotate stanza names it (Langston, measured) and no cron or timer mentions it. A rotation is therefore unscheduled; the design handles it (scope state 6, `log rotated`). |
| schedules against it | the followers' tail loop |

**`<alias>.json` / `.control` / `.alive` / `.lease` (laptop `cc-wake-state/`)**
| question | members |
|---|---|
| writes | the filter only: `.json` positions at `_checkpoint`, `.alive` at `:971` after a successful checkpoint, `.control` at `:1001-1002`, `.lease` at `_lease_create` `:487-497` |
| reads | the heartbeat (`.alive` age in 2b; `.control` in 2c). **After this batch it also reads `.json` `pos` and `.lease` `taken_at`.** The filter reads its own `.json` and `.lease`. |
| deletes | `_sweep_tmp` `:637-652` (only `<ALIAS>.*` names containing `.tmp` or `.lease.stale.`); the lease rename-aside `:552-563` (only the alias's lease). **Neither can reach `heartbeat-control.json` or its `.bad-<utc>`** (Langston re-derived both). |

**`heartbeat-control.json` (new)**: the heartbeat is its only writer and only reader; nothing deletes it except its own RESET (moved aside, not deleted).

### A4. STATE-WRITE CENSUS (what this batch writes, and who reads it)
| state written | readers |
|---|---|
| re-issued `WATCHER-CONTROL` lines | the alias's watcher, through the normal path (that is the design). Other aliases skip it at `:1000`/`:1003` before `addressed_to_me` `:1004`, at zero turns. |
| `heartbeat-control.json` | the heartbeat only |
| the Discord post line | unchanged route. The wake filter's `_HEARTBEAT_BAD` (`:121-125`) matches `control:\s*NOT answered` among others. **FINDING A4-1:** the new labels that page (`NOT delivering`, `UNDETERMINED`, `control record new/RESET/NOT PERSISTING`, `ISSUER NOT RUN`) are **not** in `_HEARTBEAT_BAD`. `is_allclear_heartbeat` (`:128-137`) suppresses a Heartbeat post when `_HEARTBEAT_BAD` does not match and `_HEARTBEAT_OK` does. So a post whose other fields read healthy and whose control carries only those labels would page Kyle (`--notify`) but **wake no session**. **DISPOSITION 1 — folded, without touching the filter:** the composed line puts a fixed lead token `control: NOT answered —` before every paging control label (for example `control: NOT answered — NOT delivering: CC-C`). The existing pattern then matches, and both Kyle and the owning session are reached. **Mutation-proved in the plan (P4):** a test feeds each paging label through the live filter's `_HEARTBEAT_BAD` and asserts a match. |

### A5. PROVENANCE
Recorded in the approved scope §2: introduced by `3a31cf3a6`, intent per `B_TOKEN_BURN_CUT_CHANGE_LIST.md:46` C3, disposition (2). This audit adds nothing that changes it.

### A6. WHAT THE CURRENT RUNS SHOW (runtime, 10-06 → 10-16)
- The original `#1162` form did not recur; five false control pages fell on 10-16 (scope §1).
- The heartbeat ran at 15:13Z; its next run is 17:12Z. The prompt's own 2c text drove each run's control field differently (for example "issued today, verify next run" vs "today lines written (first run >=09:00 local)"). The state is free text composed by the model, which is the defect this batch removes.

## B. THE IMPLEMENTATION PLAN (every item back-references its finding)
| item | what | from |
|---|---|---|
| **P1** | **NEW `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/control_state.py`**, the one decision script the scope requires. Arguments: `--liveness CC-A=<alive|DEAD|STUCK|CENSUS-FAILED|not armed> …` (step 2b's results, as now). It runs remote read 1 (`N`, `O`, inode, `D` per alias, whole-file scan), the per-alias issue, and remote read 2 over SSH. It then reads `A`, `P` and `T` on the laptop, applies the ordered table (states 1-7), writes and **reads back** `heartbeat-control.json`, appends any re-issue, and prints exactly two lines: `control: …` and `NOTIFY yes/no`. Test seams: `--log <path>` and `--state-dir <path>` replace SSH and the live folder, so the fixtures never touch live files (the `#1192` fixture-not-process lesson). | scope §3; A2; A3 |
| **P2** | **SKILL.md:** step 2c is replaced with "run `control_state.py --liveness …` and copy its two lines". Step 3 enumerates the label set (OBJ-5). Step 4's `--notify` rule adds "or the script printed `NOTIFY yes`". Every local-date and 09:00-local wording is removed. | scope OBJ-1, OBJ-3, OBJ-5; A6 |
| **P3** | **NEW `scripts/analysis/test-heartbeat-control.py`:** <ul><li>the scope's fixtures (yesterday's token answered, re-issue and its bound, NOT delivering, the record new / RESET / NOT PERSISTING, rotation, GATED / NOT RUN);</li><li>**the totality grid** (2b states × position cases including `P` absent and a foreign inode × record states), each cell printing exactly one state;</li><li>a mutation run that disables the read-back and the state-7 else, and must fail.</li></ul> | scope OBJ-1 to OBJ-5, Step-1 conditions 1-2 |
| **P4** | **Wake-route test:** each paging label's composed line is matched against the live filter's `_HEARTBEAT_BAD` (imported from `cc-wake-filter.py`, not copied). | A4-1 |
| **P5** | **Install at Step 6:** copy `SKILL.md` and `control_state.py` into `~/.claude/scheduled-tasks/wake-watcher-heartbeat/`, verify both against the deployed blob (line endings stripped), then trigger one run with the app's "Run now". The **first live run is expected to page once** (`control record: new`, Step-1 condition 1); this is stated to Kyle beforehand. | scope §4, R5; condition 1 |
| **P6** | **Step 10:** `SYSTEM_IMPACT_MAP` wake-watcher block gains the daily control, the heartbeat's decision states and the new record file (the A1 silence); runbook layer 3; `#1162`. | A1 row 3 |

**UNAUDITED:** none. Every plan item traces to an audit row or a scope objective.

## C. PLAIN-LANGUAGE SUMMARY
The heartbeat has a single scheduler, and nothing else writes the check-in lines. The change touches only the heartbeat: a small new script makes the pass-or-fail decision from the files, and the instructions just copy its answer.

The audit found one extra gap. Some of the new alarm labels would have paged Kyle without waking the session that owns the problem, because the watchers only recognise one fixed phrase. The plan writes every alarm label after that phrase, and a test proves the watchers still see each one.
