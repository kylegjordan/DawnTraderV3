# B-WAKE-ARM-EXCLUSIVE — CHANGE LIST (Step 3 → Step 4)

**Batch:** `#1140`, plan row 1o · **class:** `non_architecture` · **Scope:** `Scope Files/B_WAKE_ARM_EXCLUSIVE_SCOPE.md` (r2 + §7) · **Step 2:** `Scope Files/B_WAKE_ARM_EXCLUSIVE_PRE_AUDIT.md` (PROCEED + D1-D6).

## FILES IN THIS COMMIT

| file | change | plan item |
|---|---|---|
| `comms-infra/laptop/cc-wake-filter.py` | the lease (`LEASE_V1`): `--loop`, `--lease-root` (tests only), `--count`; `_proc` (OpenProcess 0x1000; only error 87 reads dead), `_holder_alive` (creation time primary), `_readers` (the ONE predicate, per lease domain, either slash), `_lease_gate` (FIRST in `--positions`: interpreter assert, own-loop pass, STAND-DOWN / STUCK / OLD-ARM / ORPHAN refusals with empty stdout and exit 5, takeover by atomic rename then `O_EXCL` create), `_lease_ours` (FIRST in `--once`, before stdin and `_sweep_tmp`); seed builds from an empty in-memory record | P1-P4, P6-P8, D4-D6 |
| `comms-infra/laptop/cc-wake-count.sh` | now a wrapper: `python <dir>/cc-wake-filter.py <ALIAS> --count` | P4 (C4) |
| `scripts/analysis/test-wake-lease.py` | NEW — 15 cases, below | P10 |
| `scripts/analysis/test-wake-filter-cuts.py`, `test-wake-follow.py` | every arm-mode call passes its own `--lease-root`; the seed leg asserts `rc == 4` | A8, P8 |

## NOT IN THIS COMMIT — applied at INSTALL, in ONE commit with the filter install (Langston D1)

Publishing the new arm before the filter is installed would make every re-arming session print WATCHER-UPGRADE and go deaf, so the order is: (1) your Step 4; (2) CI 4/4; (3) install `cc-wake-filter.py` + `cc-wake-count.sh` to `~/.claude/` (sha256 = blob) — old arms keep working unleased, since no lease exists until a new arm takes one; (4) in ONE commit, the shared `MEMORY.md` 4.5 text below (truth file + mirror) and the runbook's arm line and liveness bullet; (5) I re-arm with the new command; other sessions switch at their next re-arm, which loads the new 4.5.

**The proposed shared MEMORY 4.5 (replaces its three lines; truth file 24,565 → 24,543 B, r3: lists WATCHER-CENSUS and WATCHER-INTERPRETER, cap 24,576):**
```
4.5. **★ARM WAKE WATCHER — Bash `run_in_background: true`, NOT the Monitor tool (`#1127`).** The task ENDS on the first message for you — **its completion IS the wake: read the task's output file, act on its FIRST WORD, then:** a `WAKE[` line ⇒ act, then RE-ARM with this command · `WATCHER-STAND-DOWN` ⇒ a watcher of yours is live: do **NOT** re-arm · `WATCHER-STUCK <pid>` / `WATCHER-ORPHAN <pid>` ⇒ stop that task or process, then re-arm · `WATCHER-OLD-ARM` / `WATCHER-UPGRADE` ⇒ re-arm with THIS command / install the filter · `WATCHER-CENSUS` ⇒ re-arm ONCE after a minute; if it repeats, stop and tell Kyle · `WATCHER-INTERPRETER` ⇒ tell Kyle. Command, verbatim:
`S=C:/Users/kyleg/.claude; A=<ALIAS>; L=$(cat /proc/$$/winpid); grep -q LEASE_V1 "$S/cc-wake-filter.py" || { echo "WATCHER-UPGRADE: install the leased filter, then re-arm"; exit 0; }; while :; do P=$(python3 "$S/cc-wake-filter.py" $A --positions --loop $L) || break; ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 "python3 - $P" < "$S/cc-wake-follow.py" | python3 -u "$S/cc-wake-filter.py" $A --once --loop $L; [ "${PIPESTATUS[1]}" = 0 ] && break; sleep 30; done`
**ONE WATCHER PER SESSION — a lease (`#1140`) refuses a second arm with a WATCHER- line, so re-arming is safe.** Diagnostics: `~/.claude/cc-wake-state/<ALIAS>.json.alive`; `bash ~/.claude/cc-wake-count.sh <ALIAS>`. Names: `.claude/cc-session-roster.json`; a name anywhere wakes, none = broadcast. **FULL depth: `1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md`** (B-RULES-1b C4).
```

**Verified on the draft:** `bash -n` passes; pointed at a pre-lease filter, the guard prints `WATCHER-UPGRADE: install the leased filter, then re-arm` and exits 0 (the task ends with a reason, not deaf).

## TESTS — every expected result written before the run

`scripts/analysis/test-wake-lease.py` on this commit: **ALL PASS (15)** — OBJ-1 ×2, OBJ-2, OBJ-3a, OBJ-6 ×2 (pid reuse; access-denied reads alive), OBJ-5, OBJ-6b (8 racing rounds, one winner each by the exclusive create), P6 ×2 (old arm refused; old `--once` yields), P3 (non-holder `--once` exits before any mutation; an hour-old temp file survives), the arm-loop reader count, OBJ-4 ×2 (newcomer refused; the survivor still delivers, once), **OBJ-3b with a REAL orphan** (loop shell killed alone; its reader survives; the newcomer is refused `WATCHER-ORPHAN` naming it).
**Control — the installed pre-lease filter (`a89a90138`): 13 FAILED**; its 2 passes are the cases a lease does not change (the holder's own pass; a wake delivered once).
`test-wake-filter-cuts.py` and `test-wake-follow.py` on this commit: **ALL PASS**.

**Found and fixed while testing:** the reader predicate first matched the lease root as a plain string, so a reader whose command line carried `C:/…` was invisible to a check holding `C:\…`; a newcomer then TOOK the lease beside a live orphan. The domain now matches each path component joined by either slash. Production readers carry no `--lease-root` and were never affected, but the defect would have hidden every orphan in the tests. The test's own cleanup had the same flaw (it missed one orphan); it now matches by folder name.

## OPEN FOR LATER STEPS

- **OBJ-8** (live, four sessions): after install + re-arm, a deliberate second arm per session is refused and the session acts on the WATCHER- line; `cc-wake-count.sh` reads 1 per alias.
- **OBJ-9 / C1:** measure the OLD arm against a filter that refuses no-`--loop` outright BEFORE any such flip; the prediction (A7) is a silent endless loop, in which case the flip does not ship and P6 is terminal.
- **Owed:** `MEMORY_CC_C.md:108` (ANALYST Claude) describes the old arm.

## STEP 4 — APPROVED by Langston (2026-10-02 ~01:15Z, at `22336156f`), three conditions; this commit discharges C1, C2 and his record items

- **C1 — the census can no longer crash the gate.** `_readers()` retries once, then raises `CensusFailed`; `_lease_gate` refuses `WATCHER-CENSUS` (stdout empty, exit 5) with a bounded instruction (re-arm ONCE after a minute; if it repeats, do not re-arm, tell Kyle). `--count` prints `unknown: …` and exits 1, never a 0. Test: `CC_WAKE_PS` (env, tests only) pointed at a missing program → `WATCHER-CENSUS`, no traceback; `--count` → `unknown`.
- **C2 — every orphan is named, with the count.** `WATCHER-ORPHAN: N reader process(es) … — stop ALL of them, then re-arm`. Test: two stray readers → one refusal naming both pids and `2`.
- **Record items taken:** liveness by `WaitForSingleObject(h, 0)` — only a confirmed exit reads dead; this needed `SYNCHRONIZE` on the open (the first attempt without it made every live holder read dead and FAILED six cases — caught by the suite before commit); the interpreter assert now runs in `--once` too, as the plan said; `--count` prints `n/a` off Windows; the `age unknown` STAND-DOWN line names the lease path; `_sweep_tmp` also sweeps `<ALIAS>.lease.stale.*`. The unused exit-code read is removed.
- **Tests on this commit:** `test-wake-lease.py` **ALL PASS (18)**; `test-wake-filter-cuts.py` and `test-wake-follow.py` ALL PASS; no test process left running.

## C3 — THE D1 INSTALL COMMIT'S SET, from a grep of the count-first class at the ref (Langston: "grep the class and state what it returned")

Pattern `cc-wake-count|count first|COUNT BEFORE|do NOT arm|1 = running|stale is not proof`, history files excluded. Live hits that teach the arm rule:
| file | what changes in the install commit |
|---|---|
| `.claude/memory/MEMORY.md:20` (4.5, truth + mirror) | the text above, plus `WATCHER-CENSUS` in its first-word list |
| **`.claude/hooks/session-reminder.mjs:14-16`** (SessionStart, the most-read copy) | "count, 1 = do NOT arm" → "re-arm with the 4.5 command; a lease refuses a second watcher with a WATCHER- line — act on its first word" |
| `1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:8` (the arm) and `:17` (liveness) | the new arm; the count becomes a diagnostic, the lease the guard |
| `1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:24` (heartbeat layer) | one clause: a STUCK count of 2+ now means an arm older than the lease |
| `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md:41` | same clause; its counting stays (diagnostic) |
| `1-system-manual/SYSTEM_IMPACT_MAP.md:3713, :3717` | **Step 10** (with the lease as new cross-session state and the `WATCHER-` vocabulary, per Langston) |
Other hits are unrelated (`count before/after` in two scripts and an archive; the filter's and count script's own references).

## STEP-4 r2 (Langston, 2026-10-02 ~01:35Z): C2 DISCHARGED; C1 half; an install blocker — this commit

- **C1-a — the census must prove it ran.** The PowerShell script ends with a `'CENSUS-OK'` marker and `Get-CimInstance -ErrorAction Stop`; an exit 0 WITHOUT the marker raises `CensusFailed` → `WATCHER-CENSUS`. The census runs with `stdin=DEVNULL`. **Test:** `CC_WAKE_PS=cmd.exe` (with empty input it prints its banner and exits 0 — a success with no marker) → `WATCHER-CENSUS … exit 0, no completion marker`. (A first stub, a `.bat`, choked on the arguments and refused through exit 255 — right direction, wrong path; replaced so the case tests what it names.)
- **C1-b — the reason carries the diagnostic.** `exit <code>: <stderr, one line, 120 chars>` for a failed run; `repr` kept only for the exception arm.
- **The install blocker, answered with measurements on this laptop (RULED ON REPORTED FACT for you):**
  - `python3 -c "import sys; print(sys.executable)"` in Git Bash → `C:\Python313\python.exe`; `python` → the same (D2, 2026-10-02 ~00:52Z).
  - A live production reader is TWO processes: `Name=python3.exe` (the WindowsApps launcher, pid 38204) and its child `Name=python.exe` (pid 40464), both carrying `cc-wake-filter.py CC-A --once`. The census's `Name='python.exe'` counts the child only — one per watcher.
  - **A production count of 1+ has been witnessed, with a control:** the new filter's `--count` read CC-A **0** while I had no watcher armed, **1** eight seconds after re-arming; CC-B, CC-C and Infra read **1** each (2026-10-02 ~01:40Z). Earlier the pre-lease script read 1 per alias at 2026-10-01 21:20Z.
  - The test arm loop now runs `python3`, as the shipped command does; the suite passes under it.
- **Record items for the install commit, recorded:** the 4.5 block above is corrected in its body (both new words, trimmed to fit); heartbeat `SKILL.md` 2b gains an `unknown: …` branch (a failed census is reported as CENSUS-FAILED, never DEAD with `--notify`); beside the count call, `--positions` can take up to ~122 s before refusing (two 60 s census attempts plus the pause).
- **Tests on this commit:** lease suite **ALL PASS (19)**; the other two suites ALL PASS; no test process left running.
