# B-WAKE-LEASE-PID-REUSE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1w · **Issue:** `#1179` · **Scope:** r1 `c31d13ed9`, **APPROVED by Langston 2026-10-08 with C1-C6** (folded below). `path:line` at `c31d13ed9`.

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (scope §2): "the probe now cannot read the pid's creation time" ⇒ not the holder. NOW: "`OpenProcess` REFUSED (error 5)" ⇒ not the holder; a handle that opens but whose `GetProcessTimes` fails stays on today's fail-safe.** REASON: Langston C1 — `created is None` has two producers (`_proc` `:357` denied; `:361` times failed with a handle in hand), and the scope's reason covers only the first.
- **PREVIOUSLY STATED (scope §2): "the same process cannot become unreadable to the same user". NOW: the same process at the same INTEGRITY LEVEL.** REASON: C4 — a loop armed from an elevated shell is denied to a non-elevated newcomer while alive. Declared limit, §1.D.
- **PREVIOUSLY STATED (scope OBJ-3): rewrite STUCK's text. NOW: branch it on whether the holder's identity was confirmed.** REASON: C2 — the `#1140` case (identified, alive, not saving) reaches the same line and is right to say "stop it".

## 1. AUDIT

### A. The probe and the verdict (code)
`_proc(pid)` `:347-367` returns `(alive, created)`: `None` off Windows; on `OpenProcess` failure `(False, None)` for error 87 else `(True, None)` (`:356-357`); with a handle, `created` from `GetProcessTimes` or `None` if that fails (`:360-361`), `alive` from `WaitForSingleObject(h, 0) != 0` (`:365`). `_holder_alive(lease)` `:370-378`: `_proc(lease.loop)`; dead if `None` or not alive; alive if `created is None or loop_created is None or created == loop_created`. **Callers:** `_lease_gate` `:474`, `_lease_ours` `:528`; `_proc` also at `_lease_create` `:454` (our own loop at take — always readable). One producer of `loop_created`: `_lease_create`.

### B. C5 — `--loop` carries a WINDOWS pid (measured)
The arm text (shared `MEMORY.md` §4.5, verbatim in every arm) sets `L=$(cat /proc/$$/winpid)` — Cygwin/MSYS's map from the shell's own pid to its Windows pid. **Measured now on CC-A's live lease:** `{"loop": 30608, "loop_created": 134359149157821092, "taken_at": "2026-10-08T06:35:16Z"}` → `tasklist` pid 30608 = `bash.exe`; `Win32_Process` 30608 `CreationDate` = `2026-10-08T06:35:15.7821090Z`, which is `loop_created` read as a FILETIME (100 ns units since 1601: 2026-10-08 06:35:15.782109Z), equal to the microsecond. **Control that the map matters:** in this shell `$$` = 23698 while `/proc/$$/winpid` = 30572 — the MSYS pid is not the Windows one. ⇒ `loop_created` is the holder's own creation time; the existing reuse check and this fix are keyed to the right object.

### C. C3 — direction of failure
The fix turns a REFUSAL into a TAKEOVER in one case. **Wrong in that direction** = two live watchers for one session (a duplicate). **Wrong in today's direction** = no watcher at all while the arm says one is running — a lost wake, silent (#1179, measured: ~11 min). Langston's 2026-10-02 ruling on `B-WAKE-ARM-EXCLUSIVE`: *a duplicate reader announces itself; a lost wake does not.* ⇒ the fix moves the residual to the announced side. **`WATCHER-ORPHAN` is NOT a backstop here:** `_readers()` `:385` counts `python.exe … cc-wake-filter.py <ALIAS> … --once` processes — transient, alive only while a reader pass runs — not the bash arm loop; an idle-but-live holder (between passes, in its 30 s sleep) is invisible to it.

### D. C4 — declared limit
A holder loop armed from an ELEVATED shell, with a newcomer arming NON-elevated (same user, lower integrity): `OpenProcess` is denied while the holder lives; under this fix the newcomer takes over → two watchers until one ends (a duplicate — the announced direction). Requires a cross-integrity restart with the old loop still running. Declared, not designed against.

### E. C6 — Langston's reach
The lease suite (`scripts/analysis/test-wake-lease.py`) needs real Windows processes and is not in CI. **What CI can reach:** a pure verdict function, read out of the installed file's own bytes. ⚠️ Correction to C6's premise, stated: CI does run Python — the Test Suite job runs `test-wake-filter-cuts.py`, `test-wake-state-unsaved.py` and, since `#1177`, `langston_queue_test.py` (`.github/workflows/ci.yml`). So the truth table can be **CI-gated**, not only reviewer-reachable.

### F. Sources read
1 code (above) · 2 the live lease, `tasklist`, `Win32_Process` (§B) · 3 SIM wake block (B-WAKE-ARM-EXCLUSIVE) — owed at Step 10 · 4 System Manual N/A · 5 `#1140`, `#1179`, `22336156f`, `test-wake-lease.py` OBJ-6 · 6 `bridge/canonical/` N/A (built 2026-10-02).

## 2. PLAN (each item → its finding)
| # | item | from |
|---|---|---|
| **P1** | `_proc` returns a 3-tuple `(alive, created, denied)`: `denied=True` only on `OpenProcess` failure with an error other than 87; both callers updated (`_holder_alive`, `_lease_create`) | §A, C1 |
| **P2** | a pure `holder_verdict(alive, created, loop_created, denied)` → `'alive' \| 'dead'`: not alive → dead · **denied AND `loop_created` recorded → dead (#1179)** · `created is None` (times failed, handle in hand) → alive · `loop_created is None` → alive (OBJ-6, ruled) · `created == loop_created` → alive, else dead (reuse). `_holder_alive` = `_proc` + this. | §A, C1 |
| **P3** | `WATCHER-STUCK` text branches on identity: confirmed (`created == loop_created`) → today's text; unconfirmed → "check that process <pid> is this session's bash arm loop (tasklist) before stopping it; if it is not, move the lease aside and re-arm" | C2 |
| **P4** | `scripts/analysis/test-wake-lease-verdict.py` (NEW, runs anywhere): reads `holder_verdict` out of `comms-infra/laptop/cc-wake-filter.py` with `ast` (the exact bytes, no import of the script), and asserts the full truth table — 2 alive × 3 created {None, =, ≠} × 2 loop_created {None, set} × 2 denied — 24 rows, each with its expected verdict and the reason; the #1179 row and OBJ-6's row named. **Control:** today's `_holder_alive` logic (transcribed in the test) disagrees on exactly the #1179 rows. **CI step** added beside the other wake tests. | C6, §E |
| **P5** | `test-wake-lease.py` (Windows): OBJ-1 — lease `{loop: 4, loop_created: <number>}` → taken over; OBJ-6 unchanged (`loop_created` None → STAND-DOWN); a STUCK-wording case on an unconfirmed holder. Reported fact to Langston, stated. | scope OBJ-1/2/3 |
| **P6** | install by hand: `~/.claude/cc-wake-filter.py` = the blob (sha256), CC-A re-armed; tell the other sessions once | OBJ-4 |
| **P7** | Step 10: runbook (the hand recovery for a pre-fix filter; the STUCK identity check), SIM wake block | OBJ-5 |

## 3. JUDGEMENT CALLS TO ATTACK
1. Reading the pure function out of the file with `ast` rather than splitting the filter into a module (the filter is installed as one file by hand; a second file is a second install).
2. The 24-row table enumerates impossible rows too (e.g. not alive with a creation time) — kept, each labelled, so a future change cannot silently re-order the checks.
3. C4 left as a declared limit rather than detected (detecting elevation would need a token query on a process we cannot open).
