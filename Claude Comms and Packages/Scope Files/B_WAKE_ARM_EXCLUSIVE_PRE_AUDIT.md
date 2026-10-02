# B-WAKE-ARM-EXCLUSIVE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Owner:** CC-A · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1o · **Issue:** `#1140` · **Scope:** `B_WAKE_ARM_EXCLUSIVE_SCOPE.md` (r2, Step 1 APPROVED by Langston 2026-10-01 with conditions C1-C7, recorded in its §7). Written 2026-10-02 UTC at `origin/migration/aws-supabase` after a fetch (head `d244015fe` or later).

## PREVIOUSLY STATED vs NOW

- **PREVIOUSLY STATED (scope r2 §2.2):** the reader enumerator excludes our own process tree. **NOW:** no self-exclusion. **REASON:** Langston C2 — nothing of ours can match the predicate at check time, by construction (A4); a mis-firing exclusion would admit a foreign reader.
- **PREVIOUSLY STATED (scope r2 §2.4, F1):** widen `cc-wake-count.sh`'s regex because `--loop` would break the match. **NOW:** no regex change is needed for that reason. **REASON:** Langston C6 — `-match` is an unanchored substring, so `--loop` appended after `--once` leaves `cc-wake-filter\.py <ALIAS> --once` intact. The regex moves into the filter anyway under C4 (P4), unchanged in shape.
- **PREVIOUSLY STATED (scope r2 §2.5 / OBJ-9):** flip no-`--loop` to REFUSED once OBJ-8 reads 4/4. **NOW:** the flip is gated on measuring the old-arm + flipped-filter case first (A7, C1). If that case is silent, the flip does not ship.
- **PREVIOUSLY STATED:** `--once` re-checks "and exits 5". **NOW:** the re-check is the first thing `--once` does, before reading stdin or saving, and the arm breaks on any non-zero exit (C3) — measured that 5 survives the launcher (A5) but the arm does not depend on the value.

## AUDIT — the six sources

**Sources read:** (1) the code at the ref — `comms-infra/laptop/cc-wake-filter.py` (whole), `cc-wake-follow.py` (arguments and the pipeline), `cc-wake-count.sh`; (2) live behaviour on this laptop — the process probes below, the arm loop's process tree (B-TOKEN-BURN-CUT §2.1 measurement); (3) `SYSTEM_IMPACT_MAP.md` Discord Comms Fabric + the B-TOKEN-BURN-CUT block (`07f8d7fa3`); (4) `SYSTEM_MANUAL.md`: silent on the watcher, correctly (comms tooling); (5) the ledger — `RUNNING_ISSUES`, `BATCH_CATALOG`, completion reports; (6) `bridge/canonical/`: **no coverage** of the wake watcher (0 files match `wake.watcher|cc-wake|wake filter`; control: 10 files match `regime`) — expected, since it was built 2026-06-11/12, after the governance change; its intent is `CLAUDE.md` §6.9.

**A1 — Flag parsing (code).** `_flags = sys.argv[2:]` with membership tests (`"--once" in _flags`, `"--positions" in _flags`, `"--seed-owners" in _flags`); `--state` takes the next token. ⇒ an unknown `--loop` is silently ignored by today's filter (Langston F2), and `--loop <pid>`'s value token is harmless to the membership tests.

**A2 — State paths (code).** `STATE` defaults to `~/.claude/cc-wake-state/<ALIAS>.json`, or the path after `--state`. Every other file the filter writes is derived from `STATE`: `.alive`, `.control`, `.tmp.<pid>`, and `<ALIAS>.alert-owners.json` beside it. ⇒ a lease derived the same way would follow `--state` into a test directory and give that process a private lease (Langston F4). The lease path must be fixed, with an explicit override for tests.

**A3 — `--positions` writes state (code).** When the saved positions are older than 12 h it stamps `stale_from`, clears `pos` and calls `save_state` before printing. ⇒ a newcomer's `--positions` can rewrite the state file of a live watcher today. OBJ-5's reason is real.

**A4 — Nothing of ours matches the reader predicate when `--positions` runs (code + arm text).** The arm runs `P=$(… --positions)`, then `ssh … | … --once`, then `sleep 30`: sequential. `--positions` carries no `--once`, and the previous iteration's `--once` has exited before the next `--positions` starts. ⇒ the predicate (`python.exe`, command line holding `cc-wake-filter.py <ALIAS>` and `--once`) cannot match our own process when the check runs. Langston C2: no self-exclusion. Proven live in OBJ-3a (the count reads 0 while our own `--positions` runs).

**A5 — Exit codes and the launcher (measured, 2026-10-02 ~00:10Z).** `python3 -c "sys.exit(5)"` through the WindowsApps launcher returns **5**; `python.exe` returns 5; `P=$(python3 … exit 5) || …` fires with status 5. ⇒ `|| break` works through the launcher (C3b). The arm still breaks on any non-zero, not on the literal 5.

**A6 — Liveness probe (measured, same session; `OpenProcess(0x1000)` + `GetExitCodeProcess` + `GetProcessTimes` via ctypes).**

| case | result |
|---|---|
| own process | opens; exit code 259 (STILL_ACTIVE); creation time readable |
| a child that has exited (handle still held) | opens; exit code 0 → reads EXITED |
| System (pid 4), lsass | open fails, error **5** (access denied) → per C(b) reads **ALIVE**, refuse |
| pid 0 | open fails, error **87** (invalid parameter) → the only "dead" |

⇒ the probe behaves as Langston's three conditions require on this machine. A watcher runs as the same user, so its probe opens normally. **Creation time is the primary key against pid reuse.**

**A7 — The old arm under a flipped filter (code read; measurement deferred to OBJ-9).** The old arm is `P=$(… --positions); ssh … | … --once; [ "${PIPESTATUS[1]}" = 0 ] && break; sleep 30`. It has no `|| break` after `--positions`. A flipped filter refusing at `--positions` returns non-zero with empty stdout; the old arm ignores that status, starts ssh with empty arguments, the `--once` run also refuses, `PIPESTATUS[1]` is non-zero, and the loop sleeps and retries forever. ⇒ **predicted silent: a task that never completes, so no notification and no stand-down line** (Langston C1). This must be measured before any flip; if confirmed, the flip does not ship.

**A8 — Entry points, repo-wide (census at the ref; history files excluded).** Live invocations of the filter's arm modes: shared `MEMORY.md` 4.5 and `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md` (the arm command, two copies) and `B_TOKEN_BURN_CUT_ARM_SWITCH.py` (frozen one-off). Other modes: `--seed-owners` (`B_TOKEN_BURN_CUT_AMENDMENT_1_SWITCH.py`, one-off), plain mode (`scripts/analysis/replay-wake-lead-name.py`, a replay tool), and the test harnesses `test-wake-filter-cuts.py` and `test-wake-follow.py` — the latter runs `--positions` and `--once` with `--state` and **no `--loop`**. **Prose descriptions of the arm:** `MEMORY_CC_C.md:108` (CC-C's own file). Readers of the state directory: `alert-split.mjs` and `inject-due-alerts.mjs` (the owner record), `session-reminder.mjs` (text), the heartbeat skill (`.alive`), `cc-wake-count.sh` (processes, not files). **No existing reader or writer of a lease file** — it is new.
⇒ the lease touches the two arm-mode entry points only; seed mode and plain mode are unaffected; the tests need `--lease-root` (and, after OBJ-9, `--loop`).

**A9 — The ssh leg when `--once` refuses in a race (code).** The follower is started in the same pipeline as `--once`. If `--once` refuses before reading stdin, ssh keeps running until its next write fails — at most one keepalive interval (5 min). It consumes no position (the filter saved nothing). ⇒ harmless, bounded, stated.

**A10 — The ledger (§9.5(b-ii)).** `RUNNING_ISSUES`, `BATCH_CATALOG` and the completion reports carry no prior decision on locking the wake watcher. The only hits are this batch's own `#1140` and the double arm it records; "lease" matches are other words ("release", "please") or other systems (29 of its 42 hits name deploy or release).

**A11 — The SIM and System Manual.** The SIM's B-TOKEN-BURN-CUT block says one-watcher-per-session is still instruction-only until this batch — this batch changes that line at Step 10. System Manual silent, correctly.

**A12 — The interpreter limit (code + C5).** The enumerator counts `python.exe` only. A watcher under another interpreter name would read as absent, so the lease would be granted and two readers could run. ⇒ the filter asserts `basename(sys.executable).lower() == 'python.exe'` at the start of `--positions` and `--once`, and refuses otherwise.

## PLAN — each item cites its finding

| # | change | from |
|---|---|---|
| **P1** | Lease file at a FIXED path `~/.claude/cc-wake-state/<ALIAS>.lease` = {loop pid, loop creation time, reader pid, reader creation time, taken_at}; tests redirect it ONLY via an explicit `--lease-root <dir>` | A2, F4 |
| **P2** | `--positions` with `--loop <pid>`: before anything else, assert the interpreter (A12); read the lease; acquire if absent (`O_CREAT|O_EXCL`) or if its loop is dead AND no live reader matches the predicate (A6); otherwise print NOTHING on stdout, one line on stderr naming the case (live / STUCK / ORPHANED reader, with pids, start times and the `.alive` age), and exit 5 — before the stale-reset `save_state` | A3, A4, A6, A12, BLOCKER-2, C5 |
| **P3** | `--once` with `--loop`: the FIRST thing it does — before reading stdin, before any save — is confirm the lease names its loop; if not, exit 5 silently | A9, C3a |
| **P4** | One predicate, one home: the filter gains `--count <ALIAS>` (the `python.exe` + regex enumeration); `cc-wake-count.sh` becomes a wrapper that calls it | C4 |
| **P5** | The arm command, both live copies: `L=$(cat /proc/$$/winpid)`; a `grep -q LEASE_V1` check on the installed filter that ends the task with a WAKE line if missing; `P=$(… --positions --loop $L) || break`; `--loop $L` appended AFTER `--once`; a comment that the order is load-bearing | A1, A5, A8, F2, C3b, C6 |
| **P6** | No `--loop` (an old arm): the filter cannot take a lease, but still READS it and refuses to a live holder (interim, F3) | A1, F3 |
| **P7** | Dead-holder takeover is atomic: temp + `_replace_retrying` + read back our own pid, refusing if it is not ours | F5 |
| **P8** | Langston's two seed nits on `a89a90138`: a seed rebuilds (`owners = {} if SEED else _load_owners()`); the seed test asserts `rc == 4` | `#1140` record |
| **P9** | OBJ-9 (flip no-`--loop` to REFUSED) ships ONLY if the measured old-arm + flipped-filter case is not silent; otherwise P6 is the terminal state, recorded as the batch's honest limit | A7, C1 |
| **P10** | Tests, each with its expected result written first and a control that fails on the current filter: OBJ-1, 2, 3a (count reads 0 during our own `--positions`), 3b with a REAL orphan made by killing only the loop shell (C7), 4, 5, 6 (pid reuse; access-denied reads alive), 6b (two concurrent newcomers → one reader); the harnesses pass `--lease-root` | A4, A6, C2, C7 |
| **P11** | Governance at Step 10: the SIM's "instruction-only" line; the runbook; shared MEMORY 4.5 (byte budget: the truth file is near its cap — a line out for every line in); `MEMORY_CC_C.md:108` is an OWED row for ANALYST Claude | A8, A11 |

**Nothing in the plan is UNAUDITED.**

## IN PLAIN LANGUAGE

The audit confirmed the design holds on this machine: an exit code survives the Python launcher, and the Windows process check reads a running watcher, a finished one and a protected one correctly. It found three things the plan now handles: the existing tests run without the new loop flag; the old arm command would loop silently forever under the strict "refuse old arms" switch, so that switch waits for a measurement; and the lock file must not follow a test's private state folder. The plan is eleven items, each tied to what the audit found.

## STEP 2 RULED — PROCEED (Langston, 2026-10-02 ~00:50Z, at `3ac7123b6`), six conditions. They bind Step 3 and supersede the plan above where they differ.

He re-derived A1-A3, C6's substring reasoning and A8's census at the ref; A5/A6 were RULED ON REPORTED FACT, converted below to measurements.

**D1 (BLOCKING on P5) — the re-arm rule changes in the SAME commit as the command.** Today shared MEMORY 4.5 says the completion IS the wake, then RE-ARM. A refusal ends the task, which wakes the session, which re-arms, which is refused: a treadmill, one turn per cycle. ⇒ **P5′:** the refusal prints a fixed machine-matchable first word, and 4.5 reconciles its instructions in that commit:
- `WATCHER-STAND-DOWN` — a watcher of yours is live: do NOT re-arm.
- `WATCHER-STUCK <pid>` — stop that task or process, then re-arm.
- `WATCHER-ORPHAN <pid>` — stop that process, then re-arm.
- `WATCHER-UPGRADE` — the installed filter predates the lease: install it, then re-arm.
- Anything else is a normal wake: act, then re-arm.
The count-first dance becomes a DIAGNOSTIC for sessions still on an old arm (P6), not the rule for a leased one. (Byte budget: 4.5's truth file is ~10 B under its cap; the count-first sentence is replaced, not added to.)

**D2 — MEASURED (2026-10-02 ~00:52Z).** Through the WindowsApps `python3` launcher, `sys.executable` is `C:\Python313\python.exe` and its lowercased basename is `python.exe` — identical to calling `python` directly. ⇒ the A12 interpreter check passes on the live arm; it does not refuse every session.

**D3 — MEASURED.** In a fresh `bash -c`, `cat /proc/$$/winpid` returns a value (`ls` reports the file as size 0, so "non-empty" is checked by READING it, never by size); `OpenProcess(0x1000)` on that pid opens, exit code 259, and the creation time is identical across two reads one second apart. `$$` stays the top shell's pid inside subshells (`BASHPID` changes), which is why `$$` is deliberate: it names the loop shell from anywhere in the pipeline. ⇒ P5′ computes `L` ONCE, before the `while`.

**D4 — takeover is decided by an atomic operation, not by read-back timing.** P7 is replaced. A newcomer that finds a dead holder first RENAMES the stale lease to `<ALIAS>.lease.stale.<own pid>` (only one rename of the same source can succeed; the loser gets file-not-found and refuses), then creates the new lease with `O_CREAT|O_EXCL`. Both the absent case and the takeover therefore end in an exclusive create. **OBJ-6b asserts exactly one winner by the create, not merely "one reader".**

**D5 — the reader fields are DROPPED from P1.** Nothing would write them: P2 runs before the reader exists and the dead-holder test uses the enumerator. The lease holds the loop pid, its creation time and `taken_at` only.

**D6 — P3 reads "before any mutation".** The lease check sits above `_sweep_tmp()`, so a refused `--once` provably touches nothing in the state directory.

**(a) — both bounds published.** When `--once` refuses in a race, the follower already started has empty `$P`, so it sends its first keepalive on its first pass (`cc-wake-follow.py` starts `last_keepalive = 0.0` deliberately) and the pipe breaks there. **Expected: one pass. Ceiling: one keepalive interval (5 min).** No position is consumed either way.

**(b) — `.alive` is diagnostic text only.** It feeds the stand-down line's age ("age unknown" when missing, never "fresh") and NEVER enters the acquire/refuse predicate. The follower's own comment records that `.alive` proves the pipeline started, not that it can deliver.

**P6, priced (Langston).** An old arm under the interim refuses at `--positions` with empty `$P`, so its follower runs with no sources: one ssh handshake per 30 s, no replay, and the session is not deaf because the live holder delivers. Acceptable, stated. ⇒ the no-`--loop` refusal prints its own stderr line (`WATCHER-OLD-ARM: a lease is held by loop N; this arm cannot take one — re-arm with the current command`) so the task output carries a reason. **Known exposure, named here rather than only as an owed row:** `MEMORY_CC_C.md:108` is the one live source that can still mint an old arm, until ANALYST Claude updates it.
