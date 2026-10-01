# B-WAKE-ARM-EXCLUSIVE — SCOPE (Step 1, r2)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1o**, immediately after row 1h (`B-TOKEN-BURN-CUT`) · **Issue:** `#1140` · **Placed by:** Langston, 2026-10-01 (message `1555324062803300454`), §9.4 disposition 3.
**r1 → r2:** Langston SENT BACK r1 (`1555340217743843340`, at `fbf43e4b9`) with two blockers and five findings. Each is answered in §2/§3; the table at §6 maps them.

## 0. WHY

A session can run two wake watchers at once, and then every message reaches it twice (seen on NEW Claude, 2026-10-01). The only guard is a sentence ("do NOT blind-re-arm"), and `B-WAKE-QUIET` (`#995`) measured three instruction-shaped fixes failing.

Since `cfe70f92c` a stale `.alive` also means "running but cannot save", and the usual cause is a second reader holding the file. Stale then invites a third arm. `~/.claude/cc-wake-count.sh` diagnoses it; this batch makes the second reader impossible.

## 1.a ARCHITECTURAL READ

- **SYSTEM_IMPACT_MAP.md**, "Discord Comms Fabric", and the `cc-wake-filter.py` content updates, including the B-TOKEN-BURN-CUT block added at `07f8d7fa3` (event-only delivery, position state, `.alive` only after a good save, count-first). Its own last line says one-watcher-per-session is still instruction-only until this batch.
- **SYSTEM_MANUAL.md**: silent on the wake watcher, correctly — this is comms tooling, SIM-scope. The search that returns nothing returns `SQE` 62 times, so it can see the file.
- **Components:** `cc-wake-filter.py` (tier 1: behaviour changes); the arm command (tier 1: text changes); `cc-wake-count.sh` (tier 1: its match changes, F1); `cc-wake-follow.py` (tier 2: unchanged).

## 1.b PROVENANCE READ

Corpora: `RUNNING_ISSUES.md`, `BATCH_CATALOG.md` and the completion reports, searched by filename (`cc-wake-filter`); git history of `comms-infra/laptop/cc-wake-filter.py` and its former path `comms-infra/telegram-reference/cc-wake-filter.py`; `CLAUDE.md` §6.9.

- **`cc-wake-filter.py`.** Built 2026-06-11/12 outside the repo (`CLAUDE.md` §6.9). First repo copy `04d7cb3e9` (2026-06-19), quoted: *"comms-infra/telegram-reference/: faithful copies of the live bridges mirrored."* Re-homed at `b279dfe79` (2026-08-07). Run-once with saved positions since B-TOKEN-BURN-CUT (2026-09-30).
  - One watcher per session was always assumed and never enforced. A search of the filter and the follower for any lock finds only the word "BLOCKER" (the same search hits that word).
  - **Disposition (2):** relevant, needs updating.
- **The arm command.** Shared MEMORY 4.5, kept inline by design; written there and in the runbook by `B_TOKEN_BURN_CUT_ARM_SWITCH.py` (a frozen one-off switch record). **(2).**
- **`cc-wake-count.sh`.** B-TOKEN-BURN-CUT Step 7. **(2):** its match must survive the new argument (F1).
- **`cc-wake-follow.py`.** **(1).**

## 2. DESIGN

### 2.1 What has to be impossible — measured, not assumed (Langston BLOCKER-1)

Langston's question: does ending the arm loop always end its reader? Measured on this laptop 2026-10-01 (~22:10Z), with the real arm command pointed at a scratch `--state`:

| how the loop ends | loop shell | subshell | Python reader | ssh |
|---|---|---|---|---|
| **TaskStop** of the background task (the normal path) | gone | gone | gone | gone |
| **only the loop shell killed** (`taskkill /F /PID <loop>`, no tree) | gone | **ALIVE** | **ALIVE** | **ALIVE** (still alive 24 s later) |

Control: my real watcher's ssh stayed ALIVE throughout test 1, so the probe can see a live process.

⇒ **An orphaned reader is real**, so option (ii), "ending the loop always ends the reader", is refuted by measurement. A second instance with no measurement needed: at 2026-10-01 ~22:07Z I armed a watcher detached (`&`, output to nowhere) by mistake. It was a live reader the session could never hear, and it would have eaten the next wake. I killed it within a minute.

**So the design is option (i): exclusivity is about READERS, not loops.**

### 2.2 The lease

- **Path (F4):** `~/.claude/cc-wake-state/<ALIAS>.lease` — the fixed shared root, never `/tmp` (`#979`) and **never derived from `--state`**, so a non-default `--state` cannot hand a session a private lease. Tests point it elsewhere ONLY through an explicit `--lease-root <dir>`, a named flag rather than a silent derivation.
- **Content:** the loop's Windows pid and creation time, and the reader's pid and creation time.
- **Acquire only when BOTH hold:**
  - the lease's loop is dead, or is our own loop;
  - **AND no live reader exists for the alias**, by the same enumerator `cc-wake-count.sh` uses: `python.exe` whose command line holds `cc-wake-filter.py <ALIAS>` and `--once`, excluding our own process tree.
  - An orphan has a dead loop and a live reader, so it is **refused**.
- **Atomic (F5):** absent file → `O_CREAT|O_EXCL`. Dead or foreign holder → temp file + `_replace_retrying` + **read back and assert our own pid**; refuse if it is not ours.
- **Liveness probe (judgement (b), Langston's three conditions):** ctypes `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION=0x1000)`.
  - `ERROR_INVALID_PARAMETER` (87) is the only "dead".
  - `ERROR_ACCESS_DENIED` (5), or any other failure, reads **ALIVE** and refuses.
  - `GetProcessTimes` creation time is the **primary** discriminator against a reused pid. `STILL_ACTIVE` (259) is secondary, and both ambiguities fail safe.
  - Never `os.kill` — on Windows it calls TerminateProcess for any non-console signal (Python docs, `os.kill`).

### 2.3 Two channels — machine and human (Langston BLOCKER-2)

- **`--positions` does the lease check**, because it runs first and owns the stale-reset `save_state` (OBJ-5).
  - On refusal it prints **NOTHING on stdout**. Its stdout is spliced unquoted into a remote shell string as the follower's arguments.
  - It writes the human line to **stderr** and exits with a **distinct code, 5**.
- **The arm command changes to:** `P=$(… --positions … --loop $L) || break`. A refused arm ends its own task at once. Its stderr is captured in the task's output file, so the completion notification carries the stand-down line.
- **The stand-down line names the case:**
  - live loop, fresh `.alive` → "already running (loop N, alive 40 s ago) — stand down, do not arm";
  - live loop, stale `.alive` → "running but STUCK (loop N) — TaskStop that task, then re-arm";
  - dead loop, live reader → "an ORPHANED reader is running (process N) — stop process N, then re-arm".
- **`--once` re-checks** that the lease is ours and exits 5 silently if it is not, as a backstop for a race between the two calls.

### 2.4 Argument order and the instrument (F1)

- `--loop <pid>` is appended **after** `--once` and after `--positions`, with a comment at both sites saying the order is load-bearing.
- **`cc-wake-count.sh` is widened in the same commit:** `cc-wake-filter\.py <ALIAS> ` with `--once` anywhere after it. Today's exact-adjacency regex would read 0 for a leased watcher.
- OBJ-8 carries a control proving the count reads 1 for a leased watcher.

### 2.5 Rollout in both directions (F2, F3)

- **Old arm + new filter (no `--loop`):** the filter cannot take a lease. As an interim measure it still **reads** the lease and **refuses** to a live holder (F3's free improvement), so no new failure mode appears.
- **New arm + old filter:** an old filter silently ignores `--loop` (`_flags` membership tests), so the session would believe it is leased. The new arm command therefore checks first: `grep -q 'LEASE_V1' "$S/cc-wake-filter.py" || { echo "WAKE[WATCHER->$A]: the installed filter predates the lease — install it, then re-arm"; break; }`. The filter announces `lease taken: loop N, reader M` on stderr on every acquire.
- **Terminal condition (F3):** OBJ-9, in this batch. Once OBJ-8 reads 4/4, no-`--loop` is flipped from read-only to **REFUSED**. Keeping it inside the batch, rather than in a follow-on row, means the batch cannot close with the mechanism still optional.

### 2.6 Platform (judgement (c))

**Declared limit, measured by Langston at the ref:** there is no POSIX armer — the only invocations are shared MEMORY 4.5, the runbook, and the frozen switch script. The lease is a no-op off Windows. If a POSIX armer ever appears, this limit is reopened.

## 3. OBJECTIVES AND VERIFICATION

Every test writes its expected result before it runs, and has a control that fails on the current filter.

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | A second arm for an alias whose loop is alive is refused at `--positions`: stdout empty, exit 5, one stderr line naming the holder loop, its start time and the `.alive` age | test: live lease → newcomer `--positions` prints nothing on stdout, exits 5, never starts a reader; control (current filter) prints positions |
| **OBJ-2** | The reconnect gap is covered: with no reader running (the loop asleep), a newcomer is still refused, and the holder's own next pass is accepted | test: lease names a live loop pid, no reader → newcomer refused; the same `--loop` → accepted |
| **OBJ-3a** | A dead holder never strands the alias: loop dead **and** no live reader → the newcomer acquires | test |
| **OBJ-3b** | **An orphan is refused:** loop dead, reader alive → refused with "ORPHANED reader … stop process N" | test: a stand-in reader process with a matching command line, dead loop pid → refused; control: same without the stand-in → acquires |
| **OBJ-4** | A refused arm does not harm the survivor: after a refusal, a real wake is still delivered once by the incumbent | test |
| **OBJ-5** | `--positions` never writes state while another live holder has the lease | test: live foreign lease + stale state → no write (state file mtime unchanged) |
| **OBJ-6** | A reused pid is not mistaken for the holder; an unreadable process is not mistaken for a dead one | tests: live pid with wrong creation time → treated dead; a probe returning ERROR_ACCESS_DENIED → treated alive, refused |
| **OBJ-6b** | Acquisition is atomic: two newcomers racing an absent or dead lease → exactly one reader | test: two concurrent `--positions` → one exit 0, one exit 5 |
| **OBJ-7a** | Every **repo-tracked** live copy of the arm command carries the version check, `--loop` after the mode flag, and `|| break` | census at the ref, quoted before and after: shared `MEMORY.md` 4.5 and the wake-watcher runbook (`B_TOKEN_BURN_CUT_ARM_SWITCH.py` is a frozen one-off record, declared and left) |
| **OBJ-7b** | **OWED rows, not ticked by CC-A:** `MEMORY_CC_B.md` (its "check `ps | grep` before re-arm" reminder) — owner CC-B; any other session file carrying arm text — its owner; anything off-repo found by the census — named owner | each owner confirms at the ref |
| **OBJ-8** | Live, all four sessions: after re-arming with the new command, a deliberate second arm in each session is refused, **and the session is shown to RECEIVE the stand-down line in its task output and act on it** (4/4). `cc-wake-count.sh` reads 1 per alias throughout (control: it reads 1 for a leased watcher) | per session: the task output line + the session's next action, count before/after |
| **OBJ-9** | Terminal condition: once OBJ-8 reads 4/4, a `--positions` without `--loop` is refused outright | test + the flip commit |

## 4. OUT OF SCOPE / CARRIED

- **Langston condition 3:** the cause of NEW Claude's `WinError 5` stays RULED ON REPORTED FACT; the lease does not depend on it.
- **`/proc/$$/winpid`:** measured on this laptop (it printed `20656` and `20724`); RULED ON REPORTED FACT for Langston, who cannot run it — the OBJ-2/OBJ-8 live legs exercise it.
- **Langston's two seed nits on `a89a90138`** ride here (recorded on `#1140`): a seed rebuilds rather than merges (`owners = {} if SEED else _load_owners()`); the seed test asserts `rc == 4`.

## 5. GOVERNANCE THIS CLASS OWES

`non_architecture`, per `workflow-10-governance`:
- **SIM:** content update (the lease, the arm command).
- **System Manual:** N/A — comms tooling (see 1.a).
- **Also:** the wake-watcher runbook, `RUNNING_ISSUES` `#1140`, `BATCH_CATALOG`, `PHASE_HISTORY`, the plan row, the completion report, the task-list row, shared and own memory, and Langston's memory (the stand-down line is a token he may read).

## 6. r1 → r2, POINT BY POINT

| Langston r1 | r2 |
|---|---|
| BLOCKER-1: the lease binds the loop, the harm is the reader | §2.1 measured: an orphan survives a killed loop shell; option (i) adopted; OBJ-3 split into 3a/3b |
| BLOCKER-2: the stdout refusal collides with `--positions` | §2.3: `--positions` refuses on stderr with exit 5 and empty stdout; `|| break` in the arm |
| F1: the count regex breaks on argument order | §2.4: `--loop` after the mode flag, regex widened in the same commit, OBJ-8 control |
| F2: new arm + old filter is silent | §2.5: `LEASE_V1` check in the arm; the filter announces the lease on acquire |
| F3: no terminal condition | §2.5 + OBJ-9, in this batch; interim, an unleased arm still refuses to a live holder |
| F4: the lease path | §2.2: fixed root, not from `--state`; tests only via `--lease-root` |
| F5: TOCTOU | §2.2: `O_EXCL` / replace + read-back; OBJ-6b |
| (b) ctypes, three conditions | §2.2, all three; OBJ-6 includes the access-denied case |
| (c) Windows-only | §2.6, declared limit |
| OBJ-7 census short | OBJ-7a (repo, quoted census) / OBJ-7b (OWED rows with owners) |
| add: the stand-down line is received and acted on | OBJ-8, 4/4 |
