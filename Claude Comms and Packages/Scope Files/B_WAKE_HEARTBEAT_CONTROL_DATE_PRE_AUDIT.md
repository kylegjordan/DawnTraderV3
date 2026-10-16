# B-WAKE-HEARTBEAT-CONTROL-DATE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r2) — ✅ APPROVED by Langston at Step 2 (16:24Z, at `49b9bde4d`), his in-commit correction applied to A4-1, P4 and P8

**r2** answers Langston's Step-2 CHANGES on r1 (`c4bb783cb`, 16:15Z):
- BLOCKER-1: a `CHECK FAILED` verdict and a one-arm filter change, replacing the lead token;
- BLOCKER-2: the entry points re-counted, and an `O_EXCL` run lock;
- BLOCKER-3: the wake-route test in both directions;
- condition 4: the SSH failure branch run against a real refusing host;
- the record items, the Step-10 note, and his §13 placement.

A table of changes is at the end.

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan row:** 1q · **Issue:** `#1162` · **Scope:** `B_WAKE_HEARTBEAT_CONTROL_DATE_SCOPE.md`, APPROVED by Langston at Step 1 (`f565e42c4`, conditions folded at `90b6b234c`) · **Reviewer:** Langston

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED** (scope r1 §1): the CC-B and CC-C leases were "renewed" on 10-16. **NOW:** they were re-taken at new arms. **REASON:** Langston, Step 1 (A): the lease has one write site and is never refreshed.
- **PREVIOUSLY STATED** (scope §4, approved): "Prompt-only … The filter is untouched." **NOW:** the filter changes by **one regex arm** (P7). **REASON:** Langston, Step-2 BLOCKER-1 — borrowing the `NOT answered` verdict as a routing prefix would make it stop discriminating (`:116-118`, *"The token must be a verdict, not a mention"*). **This is a scope amendment, recorded here and in the scope.**
- **PREVIOUSLY STATED** (scope §0): "the live copy is identical apart from line endings". **NOW:** unchanged and re-measured 2026-10-16: `diff` of both files with `\r` stripped is empty. The watcher filter's live copy equals the ref `comms-infra/laptop/cc-wake-filter.py` byte-for-byte after the same stripping. **REASON:** re-measured for this audit, not carried from memory.

No number in the approved scope moved.

## A. THE AUDIT
### A1. Sources read (the six)
| # | source | read |
|---|---|---|
| 1 | code at `origin/migration/aws-supabase` | `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md` (whole, 58 lines); `comms-infra/laptop/cc-wake-filter.py` `:107` (`_HEARTBEAT_OK`), `:113-126` (`_HEARTBEAT_BAD`, every arm), `:128-137`, `:322`, `:323`, `:341`, `:467`, `:487-497`, `:552-563`, `:638-653`, `:857-871`, `:960-975`, `:995-1004`, `:1220-1226` (citations corrected per Langston's record items); `cc-wake-follow.py` `:82`, `:89` |
| 2 | runtime | the live files on Helsinki (`/var/log/cc-wake.log`, 229 lines, inode 1255) and on the laptop (`cc-wake-state/`); the inbox's 10-06 → 10-16 Heartbeat posts; the scheduled-task registry (below) |
| 3 | `SYSTEM_IMPACT_MAP.md` | wake-watcher block `:3764` (liveness, lease, stale-not-dead) — **SILENT on the daily control and on the heartbeat's decision rules. This is a governance gap, to be filled at Step 10 (plan item P6).** |
| 4 | `SYSTEM_MANUAL.md` | no coverage, and none expected (crew tooling, not trading logic) |
| 5 | ledger and reports | `RUNNING_ISSUES` `#1162`, `#1127`, `#731`, `#1140`; `BATCH_CATALOG` B-TOKEN-BURN-CUT; `B_TOKEN_BURN_CUT_{SCOPE,PRE_AUDIT,CHANGE_LIST}.md`; `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:27` |
| 6 | `bridge/canonical/` | **consulted, no coverage.** The daily control was introduced 2026-09-30, after the governance change; its intent is recorded in the B-TOKEN-BURN-CUT documents quoted in scope §2. |

### A2. ENTRY POINTS — enumerated repo-wide and on both machines, FIRST
**Who INVOKES the heartbeat:** TWO entry points (r2: r1 counted schedulers and called them entry points).
1. The scheduled task `wake-watcher-heartbeat` (`0 * * * *`, enabled; read from the app's task registry 2026-10-16). Its last four runs **started at 13:13:00, 14:13:00, 15:13:00 and 16:13:01Z** (`list_task_runs`), so the spacing is 60 min as measured. With jitter the floor is about 48 min (Langston), so overlap needs a run longer than about 48 min.
2. **The app's "Run now"**, used by P5 for the install run. That is a second invoker, at any minute.

Nothing on Helsinki writes `WATCHER-CONTROL`. `grep -rln cc-wake.log` over `/usr/local/bin` and `/opt/discord-bridges` matches only Langston's instruction files, which document the manual summon `echo`.
**Mutual exclusion: REQUIRED** (two invokers), so a judgement call is no longer enough. It is P8: the decision script takes `heartbeat-control.lock` with `os.open(…, O_CREAT | O_EXCL)`, the same primitive the filter uses for its lease at `:492` and for the same reason (*"so two newcomers cannot both win"*).
- **A run that finds the lock held** prints `control: held — another heartbeat run is in progress` and `NOTIFY no`, and touches nothing. The holder reports.
- **A lock older than 30 min** (a run that died holding it) is moved aside to `.lock.stale.<utc>` and taken. That takeover is reported in the line.
- **Release path (Langston's record item):** the lock is unlinked in a `finally`, covering every early exit: the remote-read failure (P9), the record RESET, the read-back mismatch, and any exception. The 30-min takeover only handles a process that was killed outright.
- The read-back no longer stands in for concurrency detection. Langston: *it is one-sided*, because whichever run reads last sees the mismatch, and the cause would be misattributed to the disk.

**Reconciled (Langston's record item, A6):** the registry read at about 16:06Z showed `lastRunAt 15:13`, `nextRunAt 17:12`, but a run **did** start at 16:13:01Z and posted at 16:15:23Z. **No run was skipped.** The registry's `nextRunAt` already named the run after the imminent one, so it is not a schedule instrument and is not cited as one.

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
| the Discord post line | unchanged route, **and the invariant it depends on is named here, corrected at Step 2 (Langston's condition): `NOTIFY ⊆ BAD`. Every post that pages Kyle must also wake the sessions.** The two sets are NOT equal:
- the `--notify` set (`SKILL.md:55`) is `{watcher DEAD, control NOT answered}` and says *"NOT for STUCK"*;
- `_HEARTBEAT_BAD` (`:113-126`) has five arms: bridges `n|partial|inactive`, inbox-log `STALE`, `bridge…down|dead|failed|inactive`, `watchers:…DEAD|STUCK`, and `control: NOT answered`.

So STUCK and the two bridge/inbox arms are **delivered without paging**, on purpose (`:123-124`: *"the stuck session is reachable, so it must be delivered"*). P7 restores `NOTIFY ⊆ BAD` for the new paging states; it does not make the sets equal. **FINDING A4-1:** this batch adds paging states, so it would break that equality. `is_allclear_heartbeat` (`:128-137`) suppresses a post when `_HEARTBEAT_BAD` misses and `_HEARTBEAT_OK` (`:107`) matches. A healthy-bridge post whose control carries only a new paging label would page Kyle and **wake no session**. **DISPOSITION 1 (r2), in Langston's form:** **one arm** of `_HEARTBEAT_BAD` becomes `\bcontrol:\s*(?:NOT answered|CHECK FAILED)\b` (P7). Labels are composed as true verdicts: `control: NOT answered — <alias>` and `control: NOT answered — NOT delivering: <alias>` where the control genuinely was not answered; `control: CHECK FAILED — <reason>` for record new / RESET / NOT PERSISTING, UNDETERMINED, ISSUER NOT RUN and a failed remote read. No label asserts something the script did not measure. **P4 proves the equality in both directions.** |

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
| **P4** | **Wake-route test, BOTH directions (r2, BLOCKER-3)**, against `_HEARTBEAT_BAD` and `_HEARTBEAT_OK` imported from `cc-wake-filter.py`, not copied: for every state the script can print, compose the full post with **healthy other fields** — bridges active, inbox-log recent, watchers all alive. ⛔ **This qualifier is load-bearing (Langston's Step-2 condition):** P4 tests the CONTROL field's contribution in isolation. A STUCK watcher or a bridge-down field is NOTIFY-no but correctly DELIVERED (`:123-124`). Adding such a case to the reverse leg would fail, and that failure would be misread as an over-broad filter; **`NOTIFY yes` ⇒ the post is delivered** (`is_allclear_heartbeat` is False); **`NOTIFY no` ⇒ it is suppressed** (True). The reverse leg is the one that guards the burn: a non-paging label that matched would wake all four sessions every hour. | A4-1 |
| **P5** | **Install at Step 6:** copy `SKILL.md` and `control_state.py` into `~/.claude/scheduled-tasks/wake-watcher-heartbeat/` and `cc-wake-filter.py` into `~/.claude/`. Verify each against the deployed blob (line endings stripped), then trigger one run with "Run now". **The first live run is expected to page once** (`control: CHECK FAILED — record new`, Step-1 condition 1), and Kyle is told before it fires. **Filter transition (Langston):** the filter is ONE file on ONE machine; the only exposure is watcher processes still running the old regex until they re-arm. During that window a `CHECK FAILED` post pages Kyle (`--notify` does not depend on the filter), but an un-re-armed watcher suppresses it. **It discharges at each session's next arm**, and every wake ends in a re-arm. The install post names all four sessions with `re-arm to load the new filter`, so the window closes at their next turn, not at their next wake. | scope §4, R5; condition 1; P7 |
| **P6** | **Step 10 — REQUIRED rows, not judged (Langston):** the `SYSTEM_IMPACT_MAP` wake-watcher block (A1 row 3 established that it applies): the daily control, the decision states, `heartbeat-control.json`, the run lock and the filter arm; Langston's `MEMORY.md` row; runbook layer 3; `#1162`; and the rest of scope §6. | A1 row 3; Langston Step-10 note |
| **P7** | **`comms-infra/laptop/cc-wake-filter.py`: one arm,** `\bcontrol:\s*NOT answered\b` → `\bcontrol:\s*(?:NOT answered|CHECK FAILED)\b`, in place, with its comment extended. The existing 22-case `test-wake-filter-cuts.py` must pass before and after. A new case proves a `CHECK FAILED` heartbeat is delivered and a healthy one is still suppressed. | A4-1 |
| **P8** | **The run lock** (A2): `O_CREAT|O_EXCL` on `heartbeat-control.lock`, 30-min stale takeover. **Test:** two concurrent processes, exactly one takes it and the other prints `held`; a 31-min-old lock is taken over and reported. | A2 |
| **P9** | **The SSH failure branch against a REAL refusing host (Langston condition 4, `#744` rider).** The script's remote target is a parameter. The test points it at `root@204.168.141.77` port **1**, which refuses connection. **Expected output, stated before the run:** `control: CHECK FAILED — remote read failed (ssh exit 255)` and `NOTIFY yes`; no control line written anywhere; the record untouched apart from the lock taken and released; exit status 0, so the heartbeat still posts. | condition 4 |

**UNAUDITED:** none. Every plan item traces to an audit row, a scope objective or a Langston condition.

### Outside this scope — placed (Langston §13, disposition 3)
`/var/log/cc-wake.log` is append-only, with two writers, no rotation and no deleter. That is harmless at 56 control lines in 14 days, but this batch raises the write rate with re-issues, and the bound belongs to nobody.
`HOME: B-WAKE-LOG-BOUND, owner CC-A, placed in SPRINT_TO_LIVE_PLAN.md at row 1qa, after row 1q` — `#1202`, written into the plan and the ledger in this commit.

## C. PLAIN-LANGUAGE SUMMARY
The heartbeat has a single scheduler, and nothing else writes the check-in lines. The change touches only the heartbeat: a small new script makes the pass-or-fail decision from the files, and the instructions just copy its answer.

The audit found one extra gap. Some of the new alarm labels would have paged Kyle without waking the session that owns the problem, because the watchers only recognise one fixed phrase. r2 fixes it the honest way:
- a failed check gets its own wording, `CHECK FAILED`, and the watchers learn that phrase too;
- a test proves both directions: every alarm wakes the sessions, and nothing routine does.

Two runs can no longer overlap: a lock lets only one run at a time. The case where the server cannot be reached is tested against a real refusal.

## r1 → r2, by Langston's item
| item | where |
|---|---|
| BLOCKER-1 the lead token writes a falsehood; extend the arm | A4-1 (invariant named), P7, PREVIOUSLY-vs-NOW (scope amendment) |
| BLOCKER-2 entry points ≠ schedulers; the ~48 min floor; one-sided read-back | A2 (two invokers, measured spacing), P8 |
| BLOCKER-3 P4 one-directional | P4 |
| condition 4 the SSH failure branch | P9, with its pre-stated expected output |
| records: `:113-126`, `:638-653`, the A6 gap | A1 row 1, A2 reconciliation |
| Step-10 SIM and his MEMORY row required | P6 |
| §13 `cc-wake.log` unbounded | the placed home above |
