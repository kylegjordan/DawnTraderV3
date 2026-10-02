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

**The proposed shared MEMORY 4.5 (replaces its three lines; truth file 24,565 → 24,533 B, cap 24,576):**
```
4.5. **★ARM WAKE WATCHER — Bash `run_in_background: true`, NOT the Monitor tool (`#1127`).** The task ENDS on the first message for you — **its completion IS the wake: read the task's output file, act on its FIRST WORD, then:** a `WAKE[` line ⇒ act, then RE-ARM with this command · `WATCHER-STAND-DOWN` ⇒ a watcher of yours is live: do **NOT** re-arm · `WATCHER-STUCK <pid>` / `WATCHER-ORPHAN <pid>` ⇒ stop that task or process, then re-arm · `WATCHER-OLD-ARM` / `WATCHER-UPGRADE` ⇒ re-arm with THIS command / install the filter. Command, verbatim (INLINE by design):
`S=C:/Users/kyleg/.claude; A=<ALIAS>; L=$(cat /proc/$$/winpid); grep -q LEASE_V1 "$S/cc-wake-filter.py" || { echo "WATCHER-UPGRADE: install the leased filter, then re-arm"; exit 0; }; while :; do P=$(python3 "$S/cc-wake-filter.py" $A --positions --loop $L) || break; ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 "python3 - $P" < "$S/cc-wake-follow.py" | python3 -u "$S/cc-wake-filter.py" $A --once --loop $L; [ "${PIPESTATUS[1]}" = 0 ] && break; sleep 30; done`
**ONE WATCHER PER SESSION IS ENFORCED by a lease (`B-WAKE-ARM-EXCLUSIVE`, `#1140`): a second arm is refused with a WATCHER- line, so re-arming is always safe.** Liveness: `~/.claude/cc-wake-state/<ALIAS>.json.alive` (diagnostic only); readers: `bash ~/.claude/cc-wake-count.sh <ALIAS>`. Names = roster-bound (`(repo)/.claude/cc-session-roster.json`); routing = name anywhere / none = broadcast. **FULL depth: `1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md`** (B-RULES-1b C4).
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
