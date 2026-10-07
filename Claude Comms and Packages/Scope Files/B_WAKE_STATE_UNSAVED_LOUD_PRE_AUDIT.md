# B-WAKE-STATE-UNSAVED-LOUD — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1r · **Issue:** `#1151` · **Scope:** r2 at `806ddea1b`, **APPROVED by Langston 2026-10-07 with two conditions for Step 3** (C1 → P5; C2 → OBJ-4 below).

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (scope r1): three unguarded save sites. NOW: four** (`:793`, `:836`, `:893`, `:1148`). **REASON:** r1 keyed its census on `_checkpoint()` and missed the direct `save_state(st)` in `--positions`; Langston found it, and re-derived the full census himself at `ff5a21d39`: exactly five save paths, one (`:878`) already guarded.
- **PREVIOUSLY STATED (scope r2 OBJ-4): "in OBJ-1's run, `.alive` is not written." NOW: OBJ-4 measures the residual instead. REASON:** Langston C2 — `.alive` has one writer (`:887`, inside the keepalive's success branch), so the delivered-class sites never touch it and the old check passes on the pre-fix filter: it could not fail.

## 1. AUDIT (code read at `origin/migration/aws-supabase`; the installed file `~/.claude/cc-wake-filter.py` sha256 `26a2371a…` = the blob)

### 1.1 Census at every hop (§9.5(a))
| question | answer | line |
|---|---|---|
| who **writes** the position state | `save_state` only (temp file + `_replace_retrying`) | `:542-555` |
| who **calls** the writer | `--positions` stale reset `:793`; `_checkpoint()` at `:836` (stale-resume notice), `:878` (keepalive — **guarded**), `:893` (`#@CAUGHTUP` after a delivery), `:1148` (end of input) | — |
| who **reads** it | `load_state` at `--positions` `:785` and at `--once` start `:822` | `:534` |
| who **deletes** | `_sweep_tmp` removes this alias's temp files older than an hour; `:510` removes a set-aside lease | `:569-582`, `:510` |
| who **writes `.alive`** | **exactly one site**, `:887`, only after a successful keepalive save | `:878-891` |
| who **reads `.alive`** | the lease refusal text (age only, `:440`), the hourly heartbeat, `cc-wake-count.sh` | — |
| who **schedules** | the arm loop in shared MEMORY §4.5 (`.claude/memory/MEMORY.md:19`) — one per session, enforced by the lease | — |

### 1.2 What each unguarded site does today when the save raises (the failure this batch fixes)
| site | today | the session sees |
|---|---|---|
| `:793` | `--positions` exits 1 with a traceback; the arm's `|| break` ends the loop; `stale_from` never saved (**measured on Windows 2026-10-07**, scope r2) | a task that ended with a traceback; the "you were away" notice lost every attempt |
| `:836` | the stale-resume WAKE prints, then the save raises before any input is read: exit 1 | nothing — the arm retries every 30 s (`PIPESTATUS[1]` ≠ 0) and the notice is re-printed into an output nobody is told about |
| `:893` | the WAKE printed, then exit 1 (**measured on Linux at `#1142` P4**) | nothing — silent retry, the same message re-read every pass |
| `:1148` | exit 1 instead of 0/3 | nothing |

### 1.3 Sources
SIM wake-watcher block (`SYSTEM_IMPACT_MAP.md:3727-3740`) — read; holds "print-then-save, so a kill re-delivers" and "cannot save ⇒ STALE `.alive`", both kept. System Manual — N/A (laptop comms tooling). Ledger — `#1151`, `#1142`, `#1127`; no decision reverses Langston's option (a). Runtime: laptop-only, measured directly (§1.2). `bridge/canonical/` — not needed (built 2026-09-30, after the governance change).

### 1.4 The residual (Langston's record item; now OBJ-4)
On the new exit-0 path: a keepalive saves and refreshes `.alive`, then the `:893` save fails → the filter prints and exits 0 → the arm loop breaks → **no watcher runs while `.alive` is still fresh, for up to 15 minutes.** The session IS told (the task ends with the line), so this is bounded; OBJ-4 measures it so it cannot widen unnoticed.

## 2. IMPLEMENTATION PLAN (each item → its finding)
| # | item | from |
|---|---|---|
| P1 | `:793` — catch `OSError` around the save; print `WATCHER-STATE-UNSAVED: <state dir> errno <n> (<strerror>) — the watcher was away over 12 h; anything posted since <stale_from> was NOT delivered: sweep the Discord inbox from then` on stderr; exit 1 (the arm's `|| break` ends the task with this line). **The filter exits 1; the TASK exits 0 after `|| break` — Step 7 reads the TEXT, never an exit status** (Langston's note). | §1.2 row 1 |
| P2 | one helper used at `:836`, `:893`, `:1148`: try the save; on `OSError` print `WATCHER-STATE-UNSAVED: <state dir> errno <n> (<strerror>) — position not saved; this message will be delivered again` on every failing pass; the run then exits on what was **delivered** (0), or 3 at end of input with nothing delivered (that line is a DIAGNOSTIC, not the alarm — its absence proves nothing). `.alive` untouched there (its one writer is `:887`). | §1.2 rows 2-4 |
| P3 | rewrite the `save_state` comment body to state the new rule; delete the "(Corrected per Langston …)" sentence | scope OBJ-5 |
| P4 | shared MEMORY §4.5 vocabulary + `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md`: `WATCHER-STATE-UNSAVED` ⇒ the state folder cannot be written — if it names a time, sweep the inbox from then; re-arm once; if it repeats, tell Kyle. SIM wake block: one line | scope OBJ-6 |
| P5 | tests in `scripts/analysis/test-wake-filter-cuts.py`, run in CI (Linux) and on this laptop (Windows, ACL deny): **every failure-arm case first asserts a direct write into the state dir raises `OSError`, and FAILS LOUDLY if it does not** (Langston C1 — under root/DAC override a `chmod 500` denies nothing). Cases: OBJ-1 (`:893`: WAKE + line + exit 0, second pass re-delivers), OBJ-2 (restored permissions: saved, no re-delivery), OBJ-3 (`:836` prints twice; `:1148` exit 3 + diagnostic), OBJ-8 (`:793`: line with `stale_from`, no positions, exit 1), OBJ-4 (below), each also run against the pre-fix blob as the control. The existing `#1142` P4 drops its "exit code not asserted" caveat and asserts exit 0. | §1.2, C1 |
| P6 | install by hand at Step 6; verify `sha256sum ~/.claude/cc-wake-filter.py` = the blob at the approved sha (`#1004` class). ⚠️ Langston cannot reach the laptop: this leg is permanently `RULED ON REPORTED FACT`. | scope OBJ-6 |

**OBJ-4, re-registered (Langston C2):** feed `#@KEEPALIVE` with the dir writable (`.alive` written, mtime T), deny writes, then deliver a WAKE + `#@CAUGHTUP`: expected — the line printed, exit 0, and `.alive` still at mtime T (fresh) with no further write. Pre-fix control: exit 1 and the same `.alive`. This pins the residual's shape: fresh `.alive`, no watcher, the session told by the line.

## 3. JUDGEMENT CALLS
1. `:793` exits 1 (so `|| break` ends the task) rather than printing positions and carrying on without a saved reset — a watcher that cannot save cannot keep its place, so stopping and saying so is the honest outcome.
2. One helper for three sites rather than three inline `try` blocks.

**NOT RE-READ** (no fresh reader routed): the wording of the `WATCHER-STATE-UNSAVED` line.
