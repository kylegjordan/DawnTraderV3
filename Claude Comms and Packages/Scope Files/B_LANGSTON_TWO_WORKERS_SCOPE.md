# B-LANGSTON-TWO-WORKERS — SCOPE r2

> **r2 (2026-11-06) — Langston APPROVED r1 at Step 1 (msg `1568112998042697909`) with seven binding conditions, all folded here:** C-1 §0's false absence about his scratch rule corrected · C-2 OBJ-2's retry option kept only for `--ledger-append`; whole-file part writes are serialised · C-3 a mid-window read for OBJ-7's early stop · C-4 OBJ-9 declares an `open` row in `GOVERNANCE_EXCEPTIONS` · C-5 who writes the two flags; `:3021` is disposition (2) and names where to read the model · C-6 the lane key normalised, exact-token, multi-id and quoted-line cases, and the people-class split · C-7 OBJ-7 rebuilt on overlap, with (q5) a stop, (q2)/(q3) descriptive, (q4) a +21-day tail read and a new (q6). Attack 3: install with the one-worker flag set; baseline three working days or 400 text posts. Issue `#1248` opened.

change-class: architecture

> **Class:** `architecture`, on the precedent of `B-LANGSTON-RELIEF` (which changed this same queue and declared `architecture`). It removes a MUST-level invariant from the System Impact Map (`:2975`, "single-claude-at-a-time") and changes how every review in the crew is scheduled. No trading architecture, strategy, regime, filter, pipeline or math changes, so the System Manual is judged at Step 10, not assumed.

**Issue:** `#1248` (opened at r2 on Langston's request: the memory-write interface limit, (q4)'s window limit and the ~10-day observation outlive this scope). **Owner:** Infra Claude (CC-INFRA). **Reviewers:** Langston at every gate, and **Coltrane second-passes the concurrency diff** at Step 4, because Langston is the beneficiary (KD-34 consensus §8 item 8).
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
  - **His working files collide by name.** `/home/langston/scratch/` holds 2,547 files with fixed names (`probe.sql`, `gate.sql`, `schema.ts`, `dpg.ts` among the newest; Langston counted 2,550, one written by his own first command while reviewing this scope), and his home root holds fixed-name drafts (`a.md`, `b.md`, `ri.md`, `plan.md`, `sprint.md`). Two concurrent invokes writing `probe.sql` overwrite each other. **His loaded set DOES name a scratch convention** (r2, Langston C-1 — r1 said it did not, from a grep one directory too shallow): the harness auto-memory index `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md` carries *"Use /home/langston/scratch (0700), never /tmp"*, detail in `feedback_scratch_dir_not_tmp.md`. **It names a directory and sets no per-file uniqueness rule**, so two workers following it still both write `probe.sql` — which is why OBJ-3 is needed.
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
- **The key (r2, Langston C-6), each mode failing CLOSED:**
  - **Normalised:** case-folded and `_` read as `-`, so `B_LANGSTON_TWO_WORKERS` and `B-langston-two-workers` are one lane.
  - **Exact token, not prefix:** `B-LANGSTON-RELIEF` never matches a longer id that starts with it.
  - **Two or more ids in the opening ⇒ the shared serial lane** (never "first id wins").
  - **"Opening" is defined at Step 2** (proposed: the first line, after the address list, excluding a line that starts with a quote marker `>`), and a test feeds a dispatch whose first line quotes another batch's id.
- **A task with no readable batch id goes into ONE shared serial lane** — never "no key, so parallel" (12 of 166 posts named no batch on 11-05). Kyle's own messages follow the same rule.
- Priority order between classes is kept: a worker takes the highest-priority eligible task.
- **Verify:** unit tests with a fake invoker — two tasks for different batches run at once; two for the same batch run in arrival order; two with no id run in order; a people task is taken before a self-advance task; each of the four key modes above. A mutation that treats "no id" as its own lane per task must fail a test. **Live, from the OBJ-7 log:** no two overlapping tasks ever shared a normalised key.
- **The people class, measured at Step 2 (r2, Langston C-6):** the no-id share WITHIN the people class (Kyle, session text AND escalated alerts, which name an alert id, not a batch), not the global 12 of 166. And stated now: because an ineligible top task does not hold a worker, **Kyle's post can wait behind a lower-priority invoke that started after it arrived** (~6 min at the mean). The log measures that case.

**OBJ-2: memory and ledger writes are safe under concurrency (Langston C1, BINDING).**
- **Split by write type (r2, Langston C-2):**
  - **`--ledger-append` is retry-safe:** it is an anchored insert with exactly one anchor enforced, so a bounded retry (re-read the sha, re-locate the anchor, insert, a fixed number of attempts, then refuse loudly) is sound.
  - **A whole-file `--part` write is NOT:** the tool takes the whole body on stdin under compare-and-swap, so a retry can only resubmit the same body and would overwrite what the other writer landed. These writes are **serialised** — Step 2 chooses the mechanism (one lane in the bridge for invokes that write his memory, or a lock the two invokes take before reading the part). A patch or merge interface is out of scope (a bigger batch).
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
- **Who writes them (r2, Langston C-5):** root only — so Langston cannot raise his own capacity. Every Claude session reaches Helsinki as root over SSH, so CC-INFRA (the owner of OBJ-7's quality consequence) and PM Claude (the 85 % line) can both set them; the mid-window alert (OBJ-7) names the exact command. Each write is logged with its `--by`.
- **Verify:** tests for each flag; a live drill at Step 7 sets each flag and reads the journal.

**OBJ-6: a concurrent-invoke smoke test before switch-on (consensus §8 item 6).**
- Two trivial invocations at once on Langston's OAuth account, through the same invoke path. Any rate or concurrency refusal is a **stop**: the batch does not switch on, and the fallback in §8 of the pack goes to Kyle through PM.
- **Verify:** both return; the journal shows them overlapping in time.

**OBJ-7: a pre-registered observation window, measuring wait AND review quality, before vs after (Kyle, KD-44; Langston C4).**
- **The instrument is persisted, not read from the journal** (journald rotates at defaults): at handling time the bridge appends one line per task to a log on disk: message id, post time from the id, start time, end time, worker, lane key, class, outcome (reply / silent / bridge error / timeout).
- **Install with the one-worker flag SET** (Langston, attack 3): the code ships, the log runs on one worker, and the second worker switches on only after the baseline.
- **Wait baseline:** **three full working days or 400 text posts, whichever comes first.** Its job is to **positive-control the new log** against the pack's §3.2 figure (median 70 min on 11-05), not to re-establish the wait.
- **Quality baselines are retrospective:** (q1)-(q4) read the verdicts already in Discord and the batch documents for the **7 days before install**, so they do not wait on the new log.
- ⛔ **The Step-2 document that fixes every band, rule and sample is COMMITTED BEFORE ANY BASELINE FIGURE IS COMPUTED, and its sha is named in the progress report** (Langston: a retrospective baseline is visible to the band-setter, so a restatement written after it is read is not a pre-registration).
- **After:** 7 days from switch-on.
- **Wait:** the median wait of text posts (alert escalations excluded, the pack's §3.2 population) is **under 20 min over the first full working day**, and the 7-day median is reported beside it.
- ⛔ **THE TREATMENT IS "INVOKED WHILE THE OTHER WORKER WAS BUSY", NOT "THE AFTER WINDOW"** (r2, Langston C-7). An after-window verdict that ran with the other worker idle carries no signal about concurrency. The log's worker, start and end give each invoke an **overlap** flag; comparisons are overlapped against non-overlapped invokes, and against the baseline.
- **Which quality risks have a mechanism** (asked before banding anything): scratch collision (OBJ-3 removes it), memory-write loss (OBJ-2 removes it), a stale memory read at invoke start (already true with one worker), and **shared-account rate pressure or box contention producing slow, truncated or failed invokes** — the only one with a live mechanism. The measures follow from that:
  - **(q5) invoke health — a STOP, not a band:** bridge errors, timeouts, non-zero exits and mean invoke time, overlapped vs not. A rise beyond the stop stated at Step 2 sets the one-worker flag.
  - **(q6) degraded invokes (new):** a non-zero exit that still posts, a truncated reply, a lost queue marker. Detected from the log and the reply, counted per invoke. Also a stop.
  - **(q1) Coltrane blind second pass, one-sided, stratified on overlap:** about eight Step-2/Step-4 verdicts per window, drawn by a rule fixed at Step 2 from overlapped invokes (after) and from the baseline (before). Coltrane gets the dispatch and the ref, never Langston's verdict. **Scored on must-fix items Coltrane raises that Langston did not**, not on two-way agreement (agreement between two reviewers at this n is noise).
  - **(q2) sent-back rate and (q3) findings per review: DESCRIPTIVE, not banded.** They are confounded by which batches landed and who wrote them; a band there would trip on population change.
  - **(q4) later-caught misses: a +21-day tail read** on the gates in both windows, because a miss on a day-6 gate surfaces at Step 7 or after close, past the window's edge.
- **The decision rule, written at Step 2 before any baseline figure:** PASS = the wait test met AND no (q5)/(q6) stop tripped AND (q1) not worse by more than its stated margin. (q2)-(q4) are reported, not graded.
- **Readers (r2, Langston C-3 — the early stop needs an instrument):** three `scheduled` system alerts, owner CC-INFRA, each resolved at the read with evidence and never acked: (i) **mid-window, day 3 of the after-window**, reading (q5)/(q6) and setting the one-worker flag on a stop; (ii) **end of window, day 7**; (iii) **day +21**, the (q4) tail. They are minted by a script at switch-on, not by hand.
- **Honest limit, stated now:** about eight blind re-reviews per window can show a large quality drop, not a small one. That is why the stops sit on (q5)/(q6), which are measured on every invoke.

**OBJ-8: review.** Langston at Steps 1, 2, 4, 8 and 11 as usual; **Coltrane second-passes the concurrency diff at Step 4** (OBJ-1, OBJ-2, OBJ-4, OBJ-5), with his verdict recorded in the change list.

**OBJ-9: governance.**
- `SYSTEM_IMPACT_MAP`: `:2975`'s MUST rewritten with the new invariants; the bridge row `:3021`, which also still names `claude-opus-4-8[1m]` — a stale model, disposition **(2)** (r2, Langston C-5): the row is rewritten to name WHERE the model is read (`CLAUDE_MODEL` in `discord-langston-bridge.py`), never what it is; the new log and flags.
- `LANGSTON_ARCHITECTURE`: §9 known limit 2 ("Work is serialised, one at a time") updated, and a change-log row with BEFORE/AFTER/why.
- His rules file (OBJ-3's line), his memory, and the class doc set at Step 10.
- ⛔ **A declared-`open` row in `GOVERNANCE_EXCEPTIONS.md`** (r2, Langston C-4): the batch sits in an observation window for about ten days, and a `*_PROGRESS_REPORT.md` cannot satisfy the checker's REQUIRED completion report (it matches basenames on `COMPLETION|COMPLETE`), so only the declared-`open` row suspends the deadline. At close: flip it to `open-retired` and PUSH, then hand-resolve the open-age nag — in that order, or the next 30-min tick re-mints it.

## 3. Out of scope, with homes
- The alert lane's own worker: untouched.
- The shared `/tmp` exposure: `B-AGENT-PRIVATE-TMP` (plan row 13).
- Failed-invoke notices: `B-AGENT-INVOKE-FAILURE-NOTICE` (row 137, `#1198`).
- Coltrane as a standing reviewer: the pack's fallback (b), only if this batch's smoke test fails or its test misses, and only through Kyle.

## 4. What I want attacked
1. **The lane key.** Is "the batch id in the opening" readable reliably enough, and is one shared serial lane for everything else the right fail-closed shape, or does it put Kyle's own messages behind a long serial queue?
2. **OBJ-7's quality measures.** Are (q1)-(q5) the right ones, and is a fixed Coltrane sample per window worth its cost against what it can detect?
3. **Ship on one worker first.** I propose the code installs with the one-worker flag SET, so the instrument runs a full baseline week on the identical code before the second worker switches on. Does that cost too much calendar against KD-44's intent?
