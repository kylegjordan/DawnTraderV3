# B-WAKE-LEASE-PID-REUSE (#1179, row 1w) — STEP 7 VERIFICATION (CC-A, 2026-10-08)

**Landed:** `01ba50771` (the reviewed `2bfe98d4d`, cherry-picked) + `8734c0acc` (Langston's Step-4 record items: the `expected()` docstring; the OBJ-3 control asserts its setup; change-list condition 2). CI `37742165456` at `1276bccc1` (contains both): TypeScript Check ✅ · Test Suite ✅ · Build ✅ · Docker Build ✅ (per job).
**Installed:** `~/.claude/cc-wake-filter.py` sha256 `a0fa0fd464b692d2…` = `git show 1276bccc1:comms-infra/laptop/cc-wake-filter.py | sha256sum` (backup `.pre-1179`). The filter file is shared by all four sessions on this laptop; each picks it up at its next re-arm (told in channel 07:16Z).
**Re-armed on it:** CC-A's lease `{"loop": 27840, "loop_created": 134359173856141766, "taken_at": "2026-10-08T07:16:26Z"}` — a recorded creation time, so no C6 warning.

| obj | result | evidence |
|---|---|---|
| **OBJ-1** a recorded-creation lease whose pid is now refused is taken over | PASS | Windows suite `#1179 OBJ-1 … taken over (rc=0)`; `#1179 C2 the probe on pid 4 is refused with error 5` — and both #1179 cases FAIL on the pre-fix installed filter (control) |
| **OBJ-2** the ruled fail-safe is unchanged | PASS | `OBJ-6 an unreadable holder (access denied) reads ALIVE (rc=5)` (lease with `loop_created` None) and `OBJ-6 a reused pid is not the holder` both PASS; CI truth table (29/0) carries OBJ-6's row and the producer-B row (open succeeded, times failed → alive) |
| **OBJ-3** STUCK never tells a session to stop an unconfirmed process | PASS | `#1179 OBJ-3 an unconfirmed stuck holder names the identity check, not 'stop'`; control: `a confirmed stuck holder still says stop it` (setup asserted) |
| **OBJ-4** installed = reviewed | PASS | sha256 equality above; CC-A re-armed on it |
| **OBJ-5** docs | Step 10 | runbook (the C6 recovery and the STUCK identity check — Langston's Step-4 condition 1: it must land before Step 11), SIM wake block |

**Langston's reach, stated:** the Windows suite and the installed file are reported fact to him; the decision itself is CI-graded (`Wake lease verdict tests (pid reuse)`, 29 passed, 0 failed) and the wiring is code he read.
**Not a live reproduction:** the fix was not exercised on a real reused pid (that needs Windows to hand a dead watcher's number to a protected process); pid 4 stands in, as in the ruled OBJ-6 case.
