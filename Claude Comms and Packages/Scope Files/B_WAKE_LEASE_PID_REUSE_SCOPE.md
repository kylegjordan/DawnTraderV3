# B-WAKE-LEASE-PID-REUSE — SCOPE (Step 1, r1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1w**, after row 1u · **Issue:** `#1179` · **Placed by:** CC-A at filing (§9.4 disposition 3, wake layer).

## 0. WHY
The wake lease (one watcher per session) read a DEAD watcher as alive when Windows gave its process number to a protected process. **Measured 2026-10-08 ~05:50Z on CC-A:** the loop that held the lease (pid 5448, `loop_created` 134359110427768539 recorded at 05:30:43Z) ended normally at ~05:42Z; pid 5448 became `svchost.exe` (session "Services"); `OpenProcess` from the session fails with error 5 (access denied); no reader process ran. Every arm then refused `WATCHER-STAND-DOWN`, and after 900 s would refuse `WATCHER-STUCK … stop that task or process 5448` — an instruction to stop a Windows service. The lease never clears by itself; the session is unwoken until someone moves the lease by hand (done: ~11 min).

## 1.a ARCHITECTURAL READ
`comms-infra/laptop/cc-wake-filter.py` (installed by hand at `~/.claude/cc-wake-filter.py`, `#1004` class): `_proc` `:347-367` (pid → `(alive, creation)`); `_holder_alive` `:370-378`; callers `_lease_gate` `:474` and `_lease_ours` `:528` (and `_lease_create` `:454` reads our own loop's creation time at take). SIM: the wake block (B-WAKE-ARM-EXCLUSIVE entry). No trading component; System Manual N/A.

## 1.b PROVENANCE READ (corpora: the lease commit, `test-wake-lease.py`, `#1140`)
- **The lease — TIER 1.** `22336156f` (2026-10-02, `B-WAKE-ARM-EXCLUSIVE`), verbatim: *"A newcomer acquires only when the holder's loop is dead (OpenProcess 0x1000; only error 87 reads dead; creation time primary against pid reuse)"*. Docstring `:348-349`: *"ANY failure to read the process except 'invalid parameter' (87, no such process) reads ALIVE — an unreadable process is not a dead one."*
- **⛔ A RULED, TESTED DECISION, NOT AN OVERSIGHT (§9.5(b-ii)):** `scripts/analysis/test-wake-lease.py` OBJ-6 pins *"a holder the probe cannot open (System, pid 4: access denied) reads ALIVE -> refused"* — with a lease whose `loop_created` is **None**. **Disposition (2): relevant, needs updating** — the rule is right when nothing is known about the holder, and wrong when the lease itself proves the holder was readable when it took the lease.

## 2. DESIGN
**When the lease carries a `loop_created` and the probe now cannot read the pid's creation time, the pid is not the holder → dead.** Reasoning: the holder is always this session's own arm loop, same user; `_lease_create` reads its creation time at take (`:454`), so a recorded `loop_created` proves the holder WAS readable; the same process cannot become unreadable to the same user. A lease with `loop_created` None (the OBJ-6 case: nothing known) keeps today's fail-safe — ALIVE.
**And the `WATCHER-STUCK` line stops telling a session to stop a process it has not identified:** it names the check (the process must be this session's bash arm loop) before "stop".

## 3. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | A recorded-creation lease whose pid is now unreadable is taken over | `test-wake-lease.py`: a lease `{loop: 4, loop_created: <a number>}` (pid 4 = System, access denied) → a newcomer takes it (exit 0, lease names the newcomer). **Control:** fails on today's filter. The suite runs on this Windows laptop only (the lease is Windows-only; it is not in CI) — Langston's reach on it is reported fact, stated. |
| **OBJ-2** | The ruled fail-safe is unchanged | OBJ-6's existing case (`loop_created` None, pid 4) still refuses `WATCHER-STAND-DOWN`; the reused-pid-with-wrong-creation case still takes over |
| **OBJ-3** | `WATCHER-STUCK` never instructs stopping an unidentified process | its text names the identity check first; a test asserts the wording |
| **OBJ-4** | Installed = reviewed | `~/.claude/cc-wake-filter.py` sha256 = the blob; CC-A re-armed on it; the other sessions told (they pick it up at their next re-arm) |
| **OBJ-5** | Docs | the wake-watcher runbook (the hand recovery written down for a pre-fix filter), the SIM wake block, MEMORY §4.5 only if a first word changes (none planned) |

## 4. OUT OF SCOPE
The reader census (PowerShell, unaffected); POSIX (no armer there, a declared limit); any change to `WATCHER-STAND-DOWN` timing.

## 5. OBSERVATION
None — graded by the suite at close.
