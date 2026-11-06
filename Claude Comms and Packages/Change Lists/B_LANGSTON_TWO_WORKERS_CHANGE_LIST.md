# B-LANGSTON-TWO-WORKERS — CHANGE LIST (Step 4)

**Step-4 dispatch header**
- **(i) Declared change-class:** `architecture` (scope header; the B-LANGSTON-RELIEF precedent — it removes the SIM `:2975` MUST and changes how every review is scheduled).
- **(ii) That class's doc set:** scope `Scope Files/B_LANGSTON_TWO_WORKERS_SCOPE.md` r2 **present** (Step 1 APPROVED, seven conditions folded) · pre-audit `Scope Files/B_LANGSTON_TWO_WORKERS_PRE_AUDIT.md` r2a **present** (Step 2 PROCEED, AM-1..AM-4 and two attack rulings folded) · this change list **present** · completion_report **absent**, owed at Step 11 (the batch first sits in its observation window; a declared-`open` row in `GOVERNANCE_EXCEPTIONS.md` is owed at Step 10, C-4) · batch_catalog, phase_history **absent**, owed at Step 10 · SYSTEM_IMPACT_MAP **owed at Step 10** (`:2975`, `:3021`, the task log, the flags) · SYSTEM_MANUAL **judged N/A** — comms only, no strategy, regime, filter, signal pipeline or math; recorded as an `na-skip` row for Langston to confirm at Step 11, the B-LANGSTON-RELIEF precedent.
- **(iii) Step 2:** `Scope Files/B_LANGSTON_TWO_WORKERS_PRE_AUDIT.md` r2a at `1e29bdb38`.
- **Pre-registration:** `Scope Files/B_LANGSTON_TWO_WORKERS_PRE_REGISTRATION.md`, committed at `661e15289` **before any baseline measure was read** (only daily arrival counts, the selection variable, and the pack's 11-05 figure had been read; it says so).
- **Graded ref:** `82c03b2c3`. **CI:** run `42166547375` at `6e0e98c4a` (a descendant: `git diff 82c03b2c3 6e0e98c4a -- comms-infra .github` is empty), **4/4 per job success** (TypeScript Check, Test Suite, Build, Docker Build); in its log, `lane tests: 27 passed, 0 failed`, `9/9 caught`, `langston_queue tests: 102 passed`. (The runs at `82c03b2c3` and `79236ec56` were cancelled by later pushes.) Issue `#1248`.

## The commits
| commit | what |
|---|---|
| `1564186dd` | (1/4) `langston_queue.py`: `lane_key`, `LaneTaskQueue`; lane tests + mutation runner; CI step |
| `20c76ff49` | (2/4) the bridge: two workers by lane, shared breaker/cap, every queue RMW through `locked_update`, self-advance pick-and-mark, per-invoke scratch, flags, task log; hand-run suite + mutation runner |
| `d9bb6be23` | (3/4) `langston-memory-write`: `--retry-part` merge, the explained refusal, the ledger-append absorb; allowlist; suite + mutation runner |
| `661e15289`, `82c03b2c3` | (4/4) `langston-bridge-flag`, `langston-concurrency-smoke`, two manifest rows, the pre-registration; executable bits |
| `1c6cb9f4d` | **not this batch:** B-LANGSTON-MEMORY-WRITE-FENCE's `test_memory_trim.py`, broken since that batch's `2a336946a`, found here and repaired there |

## Part 1 — the bridge and the queue (P1, P2, P3, P5, P8 instrument)

**P1, the lane key** (`langston_queue.py`, new):
```python
def lane_key(task, alert_key=None):
    if task.get("escalated") or task.get("is_alert"):
        k = alert_key(task.get("content") or "") if alert_key else None
        if k is not None:
            return "alert:" + repr(tuple(k))            # (template, symbol) - AM-3
        return "alert-id:" + str(task.get("message_id"))
    ids = batch_ids_in_opening(task.get("content") or "")   # first non-quote line; exact token, case-folded, _ -> -
    if len(ids) == 1:
        return "batch:" + next(iter(ids))
    return SHARED_LANE                                    # none, or two or more: fail CLOSED (C-6)
```
`LaneTaskQueue.take(worker, timeout, may_take)` returns the highest-priority, then oldest, task whose lane is not running and holds the lane; `release(task)` frees it and wakes every waiter (`notify_all`). `may_take(worker)` is the flags hook, checked under the queue lock before every take.

**P1/P2, the worker** (`discord-langston-bridge.py`):
```python
# BEFORE                                            # AFTER
worker = threading.Thread(target=task_worker,       for _name in WORKER_NAMES:          # ("task-worker-1", "task-worker-2")
    args=(task_q, state), name="task-worker")           threading.Thread(target=task_worker, args=(task_q, state), name=_name).start()
task = task_q.get(timeout=HEARTBEAT)                task = task_q.take(me, HEARTBEAT, may_take=_may_take)
breaker = {"bot_turns": 0}   # per worker           process_task(task, state, BREAKER, task_q)    # ONE breaker, under _SHARED
task_q.task_done()                                  task_q.release(task); task_q.task_done(); record_task(task, me, started, time.time())
```
**P2, the queue file — every read-modify-write is now one `lq.locked_update`** (A3). The six bridge sites are gone (`lq.load_queue`/`lq.save_queue`: 0 remaining calls in the bridge). The post-reply block shows the shape — all mutation inside the lock, channel posts after it:
```python
def _settle(items):
    ...apply the marker / park an unmarked self-advance / OBJ-A auto-settle...   # appends to `notices`, posts nothing
    for it in items:                               # A4: this invoke is over, so its item is no longer in flight
        if advanced_id and it.get("id") == advanced_id: it.pop("advance_in_flight_ts", None)
    if SELF_ADVANCE_ENABLED and not task.get("is_alert") and task_q is not None:
        nxt_task, more = _self_advance_pick(items, channel_id, task)   # picks among NOT-in-flight items, then marks it
        notices.extend(more); return nxt_task
next_task = lq.locked_update(QUEUE_FILE, _settle)
for note in notices: dc.rest_send(...)
if next_task is not None: task_q.put(next_task)
```
`_self_advance_pick` marks `advance_in_flight_ts` (skipped by the other worker for 2× the 900-s ceiling), and takes `_cap` under `_SHARED`. `_resurface_stale_blocked` runs at most once a minute (stamp under `_SHARED`), its read-mark-save in one `locked_update`. The rotation backstop is **kept** until P6 (D-2); its `state` write is now under `_SHARED`.
**P3:** `make_scratch_dir` → `/home/langston/scratch/inv-<msg>-<worker>/` (0700), passed as `TMPDIR`, and the prompt gains *"run `cd <dir>` first and do all your work in it. Do NOT write into /home/langston/scratch itself"*. `sweep_scratch` removes only `scratch/inv-*` directories older than 7 days, at most daily.
**P5:** `_may_take`: drain flag ⇒ nobody takes; one-worker flag ⇒ only `task-worker-1`; an unreadable flag counts as SET.
**P8:** `record_task` → `/var/log/langston-tasks.jsonl` (ids, times, worker, lane, class, kind, outcome, reply length; no content). Outcomes are set at each exit of `process_task`.

**Tests, Part 1:**
- `test_langston_lanes.py` **27/0** and `mutate_langston_lanes.py` **9/9 caught** — on Linux (Helsinki, `/root/tw-build`), and in CI from this ref.
- `test_bridge_two_workers.py` — **hand-run gate** (the bridge loads tokens at import; the same form as `test_bridge_clean_stop.py`), Helsinki, bridge venv, as root, at the ref's content: **ALL PASS, 8 sections**: two markers applied at once both survive; two simultaneous self-advances pick two different items and a third picks nothing; ONE breaker (6 automated turns vs a limit of 3: exactly 3 invoked, one notice) both through `process_task` and through two real workers; two scratch dirs, 0700, named in the prompt; the sweep removes an old `inv-*` and leaves an old non-`inv-*` directory and a fixed-name file; the flags; two real workers overlap different batches and serialise one batch, all three tasks logged with lane and outcome.
- `mutate_bridge_two_workers.py` **8/8 caught**: an unlocked queue RMW, no in-flight mark, a per-worker breaker, a copied breaker count, no scratch dir, a sweep over `*`, the one-worker flag ignored, a lane never released (caught as a hang).
- `langston_queue_test.py` 102/0 unchanged.

## Part 2 — memory-write recovery (P4) and the tools

**P4, a stale whole-part write** (`langston-memory-write`, in the part CAS):
```python
# BEFORE: raise Refused(4, "REFUSED: --expect-sha does not match the part it names ...")
# AFTER:
base = archived_version(expect)                          # the version the caller read, re-hashed from .memory-archive/
landed = unified(base, part_old, ...)                    # what the intervening write changed
if not opts.get("--retry-part") or append:
    raise Refused(4, "... Another write landed after you read it; what it changed:\n%s\nRe-run the SAME command "
                     "with --retry-part added: it keeps both changes when they touch different lines." % ...)
merged, conflict = merge3(base, content, part_old)       # pure three-way merge of whole lines
if conflict: raise Refused(4, "... touch the same lines (%s). Nothing was written ...")
sys.stderr.write("--retry-part: absorbed an intervening write ... What it changed:\n%s\n")
content = merged                                          # then the normal write, under the same held lock
```
**AM-1/AM-2, a stale `--ledger-append`:** under the held lock, if the version read (from the archive) is an exact byte PREFIX of LEDGER.md now — nothing but appends landed — the append proceeds and stderr names what arrived; otherwise it refuses as before. One re-read, no loop.
**Allowlist:** `--retry-part` is admitted on the whole-part shape only.

**Tests, Part 2** (Helsinki, as root, throwaway homes):
- `test_memory_retry.py` **ALL PASS (30)**: merge3 cases (different lines kept, same line conflicts, same insertion point conflicts, append + prepend kept); the allowlist and `parse_args` refusals; a stale part write refused, showing writer A's line, naming `--retry-part`, writing nothing; with `--retry-part` both changes land and stderr says so; a same-line stale write refused even with `--retry-part`, writing nothing; a stale ledger append absorbed with both entries in order and writer A's entry named; a stale append after an in-place edit refused, writing nothing.
- `mutate_memory_retry.py` **5/5 caught**.
- `test_ledger_split.py` and `test_memory_fence.py` **ALL PASS** on this writer; `test_memory_trim.py` **62/0** (after the fence batch's repair, `1c6cb9f4d`).
- **`langston-bridge-flag`** (root only; `status`, `{drain|one-worker} on|off --by <actor>`, every change logged) and **`langston-concurrency-smoke`** (two trivial invokes at once; token from the env file inside `sh -c`, prompt on stdin, model read from the installed bridge, stderr searched for "already in use"): syntax-checked on Helsinki; the smoke test itself runs at Step 6 (P6), not before.

## Install plan (Step 6, after Step 4 and CI) — order matters
1. `live-vs-sha.py <last installed sha> bridges` shows no box edit; then `deploy.sh --sha <graded> --only bridges` from its blob (the bridge restart is separate).
2. `langston-bridge-flag one-worker on --by cc-infra` **before** the restart, so the new code starts with one worker (the baseline runs on identical code, P7).
3. Pre-create `/var/log/langston-tasks.jsonl` root:langston 0660.
4. Install the memory writer and allowlist at the graded sha the way the fence batch installed them (blob-verified), then **`run_memory_suites.sh` from the installed sha's blobs in a root-owned throwaway dir — all five PASS lines pasted into the completion report** (Langston part 2 A-1: running one of five rebuilds the hole C-3 closed).
5. `langston-bridge-restart` (writes the recovery floor; recovery re-feeds anything interrupted).
6. Langston's memory, through `langston-memory-write`, in one write, net ≤ 0: the 3,166-B delivery-board section is **SHORTENED, not removed** — his `Review` duty stays named (the board is live; KD-35 retired the phone status board, not this one — Langston, Step 4 part 2); the recipe line gains *"on a stale-sha refusal re-run with `--retry-part`"*. His harness memory index lines 34 and 78 point at the per-review scratch dir instead of `/tmp` / the shared root. `langston-size-watch --status` `measured_total` vs `ceiling_bytes` quoted after (AM-4).
7. **P6 smoke test** (`langston-concurrency-smoke`): both invokes return, overlap, stderr kept. Any refusal stops the batch. On pass, the rotation backstop's deletion is committed (D-2, rule 18) and goes through its own short review.
8. Baseline per the pre-registration; switch-on = `langston-bridge-flag one-worker off --by cc-infra`, and the three readers are minted then.

## What I want attacked
1. **Part 1:** the lock order (`locked_update`'s file lock is taken before `_SHARED` inside `_self_advance_pick`; `_SHARED` is never held when the file lock is taken) — is there any path that inverts it?
2. **Part 2:** `merge3`'s overlap rule (a change touching the base line just after another change's range is NOT a conflict). Too permissive for prose?

**Tier-2 attested commit, stated as the guard requires:** `82c03b2c3` (mode bits only) was committed with `CC_COMMIT_ATTESTED=1` under **Tier 2**, after reading `git diff --cached --name-only` = exactly my two paths. A path-limited commit cannot record a mode-only change on this Windows clone, where `core.filemode` is false.

## Step 4 — Coltrane's concurrency pass (2026-11-06 ~05:20Z): (1)-(3) PROCEED, (4) CHANGES, fixed
- **(1) lanes PROCEED** (he re-ran 27/0 and 9/9 at the ref) · **(2) shared state PROCEED** (no lock inversion across all seven `_SHARED` sites; only `_self_advance_pick` takes `_SHARED` under the file lock) · **(3) memory recovery PROCEED** (he probed all 64 single-line replacement pairs through `merge3`: distinct lines merged, same lines conflicted; adjacent-line widening not required).
- **(4) CHANGES, accepted:** `_may_take` said an unreadable flag counts as set, but `os.path.exists` turns a stat failure (EACCES) into False, so the `except OSError` never ran — an unstat-able drain flag admitted both workers. He showed it with a positive control (parent mode 000).
- **Fix:** `_flag_set(path)` — `os.lstat`; `FileNotFoundError` = clear; any other `OSError` = SET; used by `_may_take` and the startup log line. `langston-bridge-flag` uses the same rule (`is_set`), so its status can never show an unknown flag as off. **Test:** a section-6 case injects `PermissionError` on the flag paths (root cannot make EACCES on itself) and asserts neither worker may take. **Mutation:** `_flag_set` → `os.path.exists` is caught; the runner is now **9/9**. Suite ALL PASS (Helsinki, bridge venv, root).

## Step 4 part 1 — Langston PROCEED (msg `1568135957126058046`), two amendments and a nit, folded
- He re-derived: the files are byte-identical at `82c03b2c3` and `1fbb1a446`; CI applies (the 4 commits to `6e0e98c4a` are docs only); **no lock inversion** (three locks, every nesting edge is file-lock → `_SHARED`; `_self_advance_pick` no longer takes `task_q`, so the old file-lock → queue edge is gone; no `mutate` re-enters `locked_update`); the suites **27/0, 9/9, ALL PASS, 8/8**, run by him as `langston` with the bridge venv.
- **Amendment 1** (an unreadable flag read as clear): the same defect as Coltrane's (4), already fixed at `dd6238954`.
- **Amendment 2:** the voice-transcription-failure return now records `_outcome = "voice_failed"`; the pre-registration gains it as **A-1** (written before any baseline figure).
- **Nit:** `task_q.put(next_task)` now runs BEFORE the channel posts, so a failed post cannot strand an in-flight mark.
- **Docstring:** `test_bridge_two_workers.py` runs as root OR as `langston` (his correction) — re-derivable at Step 8.
- **His measurement, recorded in the pre-registration as A-1:** 46.4 % of 347 arrivals key to the shared lane; 190 of 283 close-together arrivals could overlap. A wait miss is read against the shared-lane share.
- **Carried to Step 10:** the tier ledger carries `SPRINT_TO_LIVE_PLAN.md` (row 4a) as a REQUIRED row; the declared-`open` `GOVERNANCE_EXCEPTIONS` row lands at Step 6, when the batch enters observation, not at close.
- **Coltrane re-check of (4): PROCEED at `dd6238954`** (~05:40Z): `_flag_set` fails closed for every `OSError` except positive absence; both `_may_take` checks and the startup read use it; the operator tool applies the same rule to `status` and its before-state. **Coltrane's concurrency pass is complete: (1)-(4) PROCEED.**

## Step 4 part 2 — Langston CHANGES (msg `1568138037605433347`), three items, folded
- He graded at the stamp `dd6238954`; everything in part 2 is byte-identical there except `langston-bridge-flag` (Coltrane's fix) — and `1c6cb9f4d` is only on the branch from head, not at `82c03b2c3`. **Naming the head now: the re-review ref is below.**
- **The overlap rule stays** (he tested the adjacency table: adjacent replaces, delete-then-replace, replace-then-insert both orders, double delete, the STATE-close-plus-new-section case all return the right union; `<=` would refuse correct merges).
- **C-1, fixed:** a merge that keeps two changes can still break the part's batch-section order (a `keep:` line landing below `STATE: closed` makes the daily trim refuse). The merge now runs `trim_plan` on the version read and on the merge, under the held lock: if the first parses and the second does not, it refuses and names the section structure (`_trim_reads`).
- **C-2, fixed:** the boundary is now tested and mutated — two adjacent-line cases asserting the union, a section-3b case (writer A closes a section, writer B appends at EOF, `--retry-part` refuses with "section structure" and writes nothing), and two new mutations (`<` → `<=`, the structure check skipped). **Mutation runner 7/7.**
- **C-3, fixed:** `comms-infra/langston-memory/bin/run_memory_suites.sh` runs all five root-only suites together, one line each, judged by exit code: **PASS test_ledger_split · PASS test_memory_fence · PASS test_memory_trim · PASS test_memory_retry · PASS mutate_memory_retry 7/7** (Helsinki, root, 05:42Z).
- **The board:** ~~retired by KD-35~~ — **wrong object, corrected by Langston at the re-review:** KD-35 retired the phone status board; the GitHub Projects delivery board is live. The card was created (`PVTI_lAHODmulEM4BfQP4zhGevKQ`: Owner Infra Claude, Type Batch, Issue #1248, Status Implementation, read back through GraphQL). Install step 6 shortens his board section and keeps his `Review` duty.

## Step 4 part 2 re-review — Langston PROCEED (msg `1568140829212803113`); Step 4 CLOSED
- **C-1 and C-2 DISCHARGED, re-derived by him** (the gate at `langston-memory-write:2287` is inside the held lock; his rebuilt 3b fixture fires it; both adjacent cases return the union; each of the six mutation anchors occurs exactly once at the ref, so 7/7 is about this file). He notes the gate is broader than claimed: a merge producing a closed section with no `superseded-by` is caught too.
- **C-3: the artifact is discharged; the RUN stays RULED ON REPORTED FACT** — so **A-1:** install step 4 runs `run_memory_suites.sh`, not one suite (folded above).
- **Install step 6 corrected** (the board is live, above).
- **Step 4 is complete:** Langston part 1 PROCEED, part 2 PROCEED; Coltrane (1)-(4) PROCEED.

## Folded from the fence batch's Step 8 (Langston, 2026-11-06)
- **`--help`** (carry 4): `langston-memory-write --help` (sole argument) prints the tool's MODES and EXIT text and exits 0, before `run()` and its client branch — touching no file, lock or spool; MODES now describes `--retry-part`. Tested in `test_memory_retry.py` section 2.
- **`run_memory_suites.sh`** (carry 3) now runs `mutate_memory_fence.py` too: **six PASS lines** on Helsinki 06:18Z (ledger split, fence, fence mutations 14/14, trim, retry, retry mutations 7/7).

## Step 5 — CI
- `42178305136` at `f6ea3f3d3`, 4/4 per job (TypeScript Check, Test Suite, Build, Docker Build). It contains every reviewed two-workers change; the commits after `58e46376a` touching `comms-infra/` are the fence batch's carries (`38cc23ebc`) and records.

## Step 6 — install, part 1 (2026-11-06 ~07:10-07:20Z), no restart yet
1. `live-vs-sha.py f38220b83 bridges`: ROWS=15 DIFFER=0 — no box edit since the last install.
   `deploy.sh` brought from blob `58ff0e77…` (hash-object equal on the box), `--sha f6ea3f3d3099bd6e389252b7ca1683e650c94637 --only bridges`: 17 files installed, every one equal to its re-hashed blob (new: `langston-bridge-flag`, `langston-concurrency-smoke`). Neither bridge restarted. `discord-cc-bridge.py`, `discord_common.py`, `address_list.py` are unchanged since `f38220b83` (empty `git diff --stat`), so the CC bridge needs no restart.
2. `langston-bridge-flag one-worker on --by cc-infra` → `{"drain": false, "one-worker": true}`, before any restart.
3. `/var/log/langston-tasks.jsonl` created root:langston 0660, empty.
4. Writer and allowlist from the mirror's blobs, each re-hashed before install: `langston-memory-write` blob `e375c70e…` root:langston 0750 (188,984 B), `langston_memory_allowlist.py` blob `8127f1b3…` root:root 0644 (6,608 B); `git hash-object` of the installed files equals both blobs. **`run_memory_suites.sh` from the 24 blobs of `comms-infra/langston-memory/bin/` at `f6ea3f3d3`, in a root-owned 0700 dir, re-hashed: six PASS lines** — `test_ledger_split.py ALL PASS` · `test_memory_fence.py ALL PASS` · `mutate_memory_fence.py 14 of 14 mutations caught` · `test_memory_trim.py ALL PASS` · `test_memory_retry.py ALL PASS` · `mutate_memory_retry.py 7/7 caught`; rc 0.
- **Held:** the restart (step 5) waits for a window with no Langston review in flight; steps 6-8 follow it.

## Step 6 part 2 — the P6 smoke test PASS, and the rotation backstop deleted (D-2), for a short review
- **P6 (install step 7), 2026-11-06 07:24:58Z:** `langston-concurrency-smoke` — model `claude-opus-5[1m]` read from the installed bridge; both invokes rc 0, both answered "ok", overlapped (a 07:24:58.545→07:25:04.939, b 07:24:58.545→07:25:04.726), stderr 0 bytes each, `already_in_use` false for both; `pass: true`. Evidence `/root/langston-smoke-20261106T072458Z`.
- **D-2 deletion (rule 18):** the "already in use" UUID-rotation branch in `invoke_claude()` and its `state`/`_retry_count`/`_noted` parameters; the one caller and the test fake updated. The review-ref note is now added unconditionally (it was guarded only so the retry would not add it twice). State-write census: the branch wrote `state["session_id"]`, whose only other reader is the startup log line. Suites on Helsinki, bridge venv, from the working tree: lanes 27/0 · two-workers ALL PASS · `mutate_langston_lanes` 9/9 · `mutate_bridge_two_workers` 9/9 · `test_bridge_clean_stop` 0 failures. `DELETED_COMPONENTS_LOG` entry + archive copy.
- **The restart is held until ~13:56Z.** `langston-bridge-restart --dry-run` (07:24Z): floor 2026-11-05T11:14:03Z, because two of my own 11-05 dispatches never got a delivered reply (`1567859541456986184`, storage amendment 1 Step 4; `1567879226038816789`, wake Step 4 — both timed out, both later reviewed and closed). Recovery would re-feed them, and a re-fed stale review could re-act on closed work (e.g. set a closed card's `Review`). Once both are over the bridge's 24 h limit, `--accept-clamp` restarts and names exactly those two as what it gives up. The restart then installs this deletion too (deploy at the reviewed sha first).
