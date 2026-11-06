# B-LANGSTON-TWO-WORKERS — SCOPE r1

change-class: architecture

> **Class:** `architecture`, on the precedent of `B-LANGSTON-RELIEF` (which changed this same queue and declared `architecture`). It removes a MUST-level invariant from the System Impact Map (`:2975`, "single-claude-at-a-time") and changes how every review in the crew is scheduled. No trading architecture, strategy, regime, filter, pipeline or math changes, so the System Manual is judged at Step 10, not assumed.

**Issue:** none yet (KD-44 is the authority; a `RUNNING_ISSUES` entry is opened in the scope commit only if Langston asks for one). **Owner:** Infra Claude (CC-INFRA). **Reviewers:** Langston at every gate, and **Coltrane second-passes the concurrency diff** at Step 4, because Langston is the beneficiary (KD-34 consensus §8 item 8).
**Placement:** `SPRINT_TO_LIVE_PLAN.md` §0a, stage "0 — clear the plates (Infra Claude)", order **4a**, after `B-LANGSTON-MEMORY-WRITE-FENCE`, before `B-TRANSCRIPT-ARCHIVE` (4b) and `B-TOKEN-WATCH-FOLLOWUP-MEMORY`.
**Kyle (KD-44, 2026-11-05):** *"We can slot this in. Need to observe how well it works and if the quality of the reviews is impacted."*
**Decision record:** `1-system-manual/pm/decisions/2026-11-05_langston-review-capacity.md` (§3 numbers, §7 positions, §8 consensus of Infra Claude, Langston and Coltrane).

## 0. What happens today

- **One worker.** `task_q = lq.TaskPriorityQueue()` (`discord-langston-bridge.py:1298`) feeds ONE thread, `task-worker` (`:1304`); `task_worker` (`:758-791`) runs `get → process_task → task_done` serially. Its docstring: *"Single worker thread: serial claude invocation (one at a time)."* The alert lane has its own worker (`:1310`) and is untouched by this batch.
- **Load (decision pack §3.2, 2026-11-05 00:00-20:00Z, re-derived from the journal):** 190 invocations, mean 354.9 s, the worker busy ~92.7 % of 20 h; text posts waited a **median 70 min, p90 93 min** (message-id time to handling time, n=163). Full 11-05 day: 229 `handling msg` lines (journal, read 2026-11-06).
- **Shared state a second worker would touch** (read at the ref; the census is Step 2's):
  - `breaker = {"bot_turns": 0}` is created INSIDE `task_worker` (`:762`) and passed to `process_task` (`:440`, used `:458-473`). Two workers would each hold their own and the circuit breaker would count half the turns.
  - `state` is shared; `invoke_claude` writes `state["session_id"]` and calls `save_state` on its rotation backstop (`:307-311`). Every invocation already uses a fresh UUID (`:606`), so the backstop *"now effectively never trigger[s]"* (`:604-605`).
  - The review-queue file is already flock-locked (`langston_queue.py`, `queue_lock`).
  - **His working files collide by name.** `/home/langston/scratch/` holds 2,547 files with fixed names (`probe.sql`, `gate.sql`, `schema.ts`, `dpg.ts` among the newest), and his home root holds fixed-name drafts (`a.md`, `b.md`, `ri.md`, `plan.md`, `sprint.md`). Two concurrent invokes writing `probe.sql` overwrite each other. **No auto-loaded file of his names a scratch convention:** `grep -l scratch` over `/home/langston/*.md` matches `LEDGER.md` and many drafts (positive control) but NOT `CLAUDE.md` or `MEMORY.md`, so the habit is not written down where it loads (Langston's C3 said his loaded rule names the path; on this read it does not, and the scope does not depend on which).
  - **His memory and ledger writes:** `langston-memory-write` takes a blocking `flock` and compares `--expect-sha`; a mismatch is `Refused(4)` with **no retry** (Langston's C1, re-derived at `:613`, `:1406`, `:2064`, `:2190` of the installed copy). Under two workers the loser of a race loses its write, and the writer that must notice is a stateless invoke at the end of its turn.

## 1. Provenance read

**Corpora searched:** `PHASE_HISTORY.md`, `CHANGES_AND_FIXES.md`, `SYSTEM_IMPACT_MAP.md`, `LANGSTON_ARCHITECTURE.md`, `RUNNING_ISSUES.md`, the `B-NEW-41`, `B-DISCORD` and `B-LANGSTON-RELIEF` scopes and reports, and `git log -S` on the symbols below (not path-limited). The pack's §2.1 carries the full search; this section quotes the deciding commits.

| thing | introduced | quoted intent | disposition |
|---|---|---|---|
| the single task worker | `04d7cb3e9` (2026-06-19, B-DISCORD build) | commit body: *"on_message is a pure enqueuer → queue.Queue → single worker thread … Single-claude-at-a-time invariant preserved (one worker thread, one FIFO)."* — inherited from B-NEW-41 (`PHASE_HISTORY.md:673`): *"two concurrent `claude --session-id <same UUID>` subprocesses → session state corruption"* | **(2) relevant, needs updating**: the reason it protects is gone (next row); the serial ORDER it gave each batch's rounds is still wanted, so it is kept per batch, not globally |
| fresh session id per invocation | `bb415a1d8` (2026-06-21) | *"Langston bridge uses a FRESH session-id per invocation (fix the 'Session ID already in use' latency)"*; code `:599-606` | **(1) still correct**; it is what makes concurrency safe for the session store |
| SIM `:2975` "MUST preserve single-claude-at-a-time" | B-NEW-41, carried to the Discord bridge | *"Two concurrent `claude --session-id <same UUID>` subprocesses would corrupt session state."* | **(2)**: amended with the dead reason replaced by this batch's invariants (one task per batch lane, memory writes safe under concurrency) |
| `breaker` | B-DISCORD review 1b (`:72`, `:443`) | *"a hard floor under the soft [SILENT] discipline"* | **(1) still relevant**; becomes shared under a lock |
| `invoke_claude` rotation backstop (`:307-311`) | pre-`bb415a1d8` | `:604-605`: *"stays as a backstop (now effectively never triggered)"* | **decided at Step 2** — kept with its write made safe, or removed under rule 18 if Step 2 shows it can no longer fire |
| the priority queue | `B-LANGSTON-RELIEF` OBJ-1 | people first, then self-advance, then alerts; FIFO in a class | **(1)**, unchanged; both workers take from it |

## 2. Objectives

**OBJ-1: two workers, with a per-batch lane that fails closed (consensus §8 item 1, Langston C2).**
- Exactly two task workers over the existing `TaskPriorityQueue`. Not a pool.
- A task whose opening carries a readable batch id is not started while another task for the same id is running; it waits and the other worker takes the next eligible task.
- **A task with no readable batch id goes into ONE shared serial lane** — never "no key, so parallel" (12 of 166 posts named no batch on 11-05). Kyle's own messages follow the same rule.
- Priority order between classes is kept: a worker takes the highest-priority eligible task.
- **Verify:** unit tests with a fake invoker — two tasks for different batches run at once; two for the same batch run in arrival order; two with no id run in order; a people task is taken before a self-advance task. A mutation that treats "no id" as its own lane per task must fail a test.

**OBJ-2: memory and ledger writes are safe under concurrency (Langston C1, BINDING).**
- Step 2 chooses, with Langston: (a) bounded retry on refusal inside `langston-memory-write` (re-read the sha, re-apply the caller's edit, a fixed number of attempts, then refuse loudly), or (b) memory and ledger writes routed through one serialising path.
- **Verify:** two concurrent writes from two processes against a scratch copy, each with a stale-by-the-other sha: both land, in either order, with neither's content lost; the counters (retractions, ledger bullets) move by exactly the sum. A mutation that removes the retry or the serialisation must lose a write in that test.

**OBJ-3: a per-invoke scratch directory, named in the prompt (Langston C3).**
- Each invocation gets its own directory (created, mode 0700, owned by `langston`), passed as `TMPDIR` AND named in the prompt the bridge sends, with an instruction to write working files there.
- Old per-invoke directories are cleaned on a stated rule (age), not left to grow.
- His rules file gains one line naming the convention, **net-zero bytes** against his loaded-set ceiling (a cut pays for it).
- `B-AGENT-PRIVATE-TMP` (plan row 13, the shared `/tmp` class) is NOT absorbed; this objective covers only the collision two workers create.
- **Verify:** two concurrent fake invokes each write `probe.sql` in their directory and both files survive; a live check at Step 7 shows a real invoke writing inside its own directory.

**OBJ-4: the shared state is made safe, and the invariant is restated.**
- `breaker` becomes one shared object under a lock.
- Every other write to shared state from inside a task (census at Step 2: `state`, `save_state`, the spool, the mirror log, the queue file) is shown safe or made safe.
- Log lines name the worker (`task-worker-1`, `task-worker-2`), so the journal can tell them apart.
- **Verify:** the census table at Step 2, each row with its line and its answer; a test drives the breaker from two threads and asserts the shared count.

**OBJ-5: the 85 % stop line holds (consensus §8 item 5).**
- Both workers live in the ONE bridge process, so the existing stop (stopping the service, or `crew-switch`) halts both.
- A **drain flag**: a root-owned file both workers read before taking the next task; when it is set, neither starts a new invocation, each finishes the one in hand, and the queue is kept.
- A **one-worker flag**: a root-owned file that drops capacity to one worker without a deploy (read when a worker is about to take a task).
- **Verify:** tests for each flag; a live drill at Step 7 sets each flag and reads the journal.

**OBJ-6: a concurrent-invoke smoke test before switch-on (consensus §8 item 6).**
- Two trivial invocations at once on Langston's OAuth account, through the same invoke path. Any rate or concurrency refusal is a **stop**: the batch does not switch on, and the fallback in §8 of the pack goes to Kyle through PM.
- **Verify:** both return; the journal shows them overlapping in time.

**OBJ-7: a pre-registered observation window, measuring wait AND review quality, before vs after (Kyle, KD-44; Langston C4).**
- **The instrument is persisted, not read from the journal** (journald rotates at defaults): at handling time the bridge appends one line per task to a log on disk: message id, post time from the id, start time, end time, worker, lane key, class, outcome (reply / silent / bridge error / timeout).
- **Baseline:** the 7 days before switch-on, from the same log (it ships and runs on ONE worker first, so the baseline uses the identical instrument).
- **After:** the 7 days from switch-on.
- **Wait:** the median wait of text posts (alert escalations excluded, the pack's §3.2 population) is **under 20 min over the first full working day**, and the 7-day median is reported beside it.
- **Quality, each defined and its instrument checked against known cases at Step 2, BEFORE the baseline is read:**
  - (q1) **Coltrane blind second pass on a sample:** the same fixed number of Step-2 and Step-4 verdicts from each window, chosen by a rule fixed in advance (not by reading them). Coltrane gets the dispatch and the ref, never Langston's verdict, and rules. Measured: agreement on the verdict, and must-fix items Coltrane raises that Langston did not.
  - (q2) **sent-back rate** per gate type (Step 2, Step 4, Step 8): CHANGES / SENT BACK against PROCEED / APPROVED / CONFIRMED.
  - (q3) **findings per review**: the count of numbered conditions, must-fixes and blockers in a verdict.
  - (q4) **later-caught misses**: a defect found at Step 7 or later, or after close, in work a gate in the window passed, traced back to that gate.
  - (q5) **invoke health**: bridge errors, timeouts and mean invoke time per window.
- **The decision rule, written at Step 2 before the baseline is read:** PASS = the wait test met AND no quality measure worse than the baseline by more than a band stated at Step 2. A quality miss sets the one-worker flag (OBJ-5) and goes to Kyle through PM, whatever the wait shows.
- **The reader:** one `scheduled` system alert, owner CC-INFRA, fires at the end of the after-window and names the log. It is resolved at the read with evidence, never acked.
- **Honest limit, stated now:** a week holds roughly a thousand invocations but only a small Coltrane sample, so (q1) can show a large drop in quality, not a small one. That is the reason (q2)-(q5) are measured too, over every verdict.

**OBJ-8: review.** Langston at Steps 1, 2, 4, 8 and 11 as usual; **Coltrane second-passes the concurrency diff at Step 4** (OBJ-1, OBJ-2, OBJ-4, OBJ-5), with his verdict recorded in the change list.

**OBJ-9: governance.**
- `SYSTEM_IMPACT_MAP`: `:2975`'s MUST rewritten with the new invariants; the bridge row `:3021` (which also still names `claude-opus-4-8[1m]`, a stale model, folded here under disposition 1); the new log and flags.
- `LANGSTON_ARCHITECTURE`: §9 known limit 2 ("Work is serialised, one at a time") updated, and a change-log row with BEFORE/AFTER/why.
- His rules file (OBJ-3's line), his memory, and the class doc set at Step 10.

## 3. Out of scope, with homes
- The alert lane's own worker: untouched.
- The shared `/tmp` exposure: `B-AGENT-PRIVATE-TMP` (plan row 13).
- Failed-invoke notices: `B-AGENT-INVOKE-FAILURE-NOTICE` (row 137, `#1198`).
- Coltrane as a standing reviewer: the pack's fallback (b), only if this batch's smoke test fails or its test misses, and only through Kyle.

## 4. What I want attacked
1. **The lane key.** Is "the batch id in the opening" readable reliably enough, and is one shared serial lane for everything else the right fail-closed shape, or does it put Kyle's own messages behind a long serial queue?
2. **OBJ-7's quality measures.** Are (q1)-(q5) the right ones, and is a fixed Coltrane sample per window worth its cost against what it can detect?
3. **Ship on one worker first.** I propose the code installs with the one-worker flag SET, so the instrument runs a full baseline week on the identical code before the second worker switches on. Does that cost too much calendar against KD-44's intent?
