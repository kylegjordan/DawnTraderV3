# B-WAKE-STATE-UNSAVED-LOUD — SCOPE (Step 1, r2)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1r**, after row 1p · **Issue:** `#1151` · **Design:** ruled by Langston 2026-10-06 — option (a), six conditions (recorded verbatim in `#1151`).

## STEP-1 r1 → r2 (Langston SENT BACK 2026-10-07 ~02:0xZ; one blocker, one condition, one record item, his answer, one nit — all folded)
- **BLOCKER-1 — a fourth unguarded caller, `save_state(st)` at `:793`, in `--positions`** (my census keyed on `_checkpoint()` and missed the direct call). It runs only when the saved position is older than 12 h. **Measured on this laptop, not reasoned (the leg Langston cannot reach):** a temp state dir with write denied by ACL (`icacls … /deny <user>:(WD,AD)`; **control:** a direct write into it raised `PermissionError`), a state 13 h old, then the arm's own first line `P=$(python3 cc-wake-filter.py CC-A --positions …) || break`: **`--positions` exits 1 at `save_state:548` with a Python traceback, the arm's `|| break` ends the loop, and the state file is left unchanged** (`stale_from` never persisted). So the session IS told — the task ends — but by a traceback whose first word is not one the session acts on, and the stale notice (*"anything posted since X was NOT delivered — sweep the inbox"*) is lost on every attempt. Folded as OBJ-8.
- **His answer on `:1148` (nothing delivered):** print the line, as a DIAGNOSTIC, not the alarm — the keepalive arm already leaves `.alive` stale, so the heartbeat already says STUCK; the line is for a session running `--once` by hand. **Its absence proves nothing** (a pass can leave at `:818` or `:893` without reaching `:1148`).
- **CONDITION — the comment rewrite DELETES `:554`** (*"(Corrected per Langston: this comment first said the reverse.)"*), it does not layer on it. OBJ-5's control extended.
- **RECORD ITEM — the `.alive` asymmetry on the new exit path** (now in §1.a).
- **NIT (OBJ-3):** `:836` does not exit; its pass prints the line at `:836` and again at the run's end — twice, by design ("every failing pass, no dedupe").
- **Also found while measuring:** the ACL method reproduces a failed save on Windows, so OBJ-1/OBJ-2/OBJ-8 run on both Linux (CI) and this laptop.

## 0. WHY
When the wake watcher cannot save where it stopped (its state folder is read-only, or the save is refused), it has already printed the wake, then raises and exits 1. The arm loop ends the background task only on exit 0 (`[ "${PIPESTATUS[1]}" = 0 ] && break; sleep 30` — `.claude/memory/MEMORY.md:19`), so the session is **never told** and the loop re-reads the same message every 30 s. Measured on Linux (state dir `chmod 500`, as a non-root user) at `B-WAKE-OWNER-LOSS-VISIBLE`'s P4 test.

## 1.a ARCHITECTURAL READ
- **SIM**, the wake-watcher block under the Discord comms fabric (`SYSTEM_IMPACT_MAP.md:3727-3740` at `58ec1aef8`, "CONTENT UPDATE — B-TOKEN-BURN-CUT … the wake watcher's delivery form"): position state `~/.claude/cc-wake-state/<ALIAS>.json` is **saved print-then-save, so a kill re-delivers rather than loses**; `.alive` is rewritten by `#@KEEPALIVE` **only after a successful save**, so a watcher that cannot save goes STALE on purpose and the hourly heartbeat calls it DEAD after 15 min. This batch keeps both properties and extends the second to the delivered path. ⚠️ **What the stale `.alive` does NOT cover (Langston's record item):** on the new exit-0 path, if a `#@KEEPALIVE` earlier in the same pass saved and refreshed `.alive`, and the `:893` save then fails, the filter prints and exits 0, the arm loop breaks, and no watcher is running while `.alive` is still fresh — for up to 15 min. Bounded and self-healing, and the session is told directly by the task ending; but the stale-`.alive` property must not be cited as covering this path.
- **System Manual:** not applicable (laptop comms tooling — no trading architecture, strategy, regime, filter or signal path).
- **Blast radius:** one file, `comms-infra/laptop/cc-wake-filter.py` (installed by hand to `~/.claude/`, verified by sha256 — `#1004` class), and its CI test. No server component. The arm command text is unchanged.

## 1.b PROVENANCE READ
**Tier 1 (behaviour changes):** `save_state`, `_checkpoint` and their call sites.
- Introduced by `3a31cf3a6` (B-TOKEN-BURN-CUT Step 3, 2026-09-30), verbatim: *"cc-wake-filter.py: --once / --positions / --state; routing and the default streaming mode unchanged … daily control answered by a file"*.
- The raise was made deliberate by `cfe70f92c` (2026-10-01), verbatim: *"The save comment said a failed save was safe to swallow; the order is print-then-save, so a raise re-delivers the wake next run and swallowing would exit 0 having advanced nothing. Comment now says that."* and *"KEEPALIVE refreshes .alive ONLY after a successful checkpoint."*
- **What that reasoning missed:** "re-delivers the wake next run" assumes a next run that NOTIFIES. Under the `--once` arm, a non-zero exit is a silent retry; the re-delivery goes to a task output nobody is told about.
- **Disposition (2): relevant, needs updating to today's intent** — keep print-then-save and the stale `.alive`; change what a failed save does after a delivery.

**Tier 2 (read only):** the arm loop text (shared MEMORY §4.5) — unchanged; `#@KEEPALIVE` arm (`:878-893`) — already catches `OSError`, the model for the fix.

**Ledger search (§9.5(b-ii)):** `#1151` (this), `#1142` (P4, where it was found), `#1127` (the `--once` design). No decision reverses (a).

## 2. WHAT CHANGES
At each of the three unguarded `_checkpoint()` sites in the delivered class — the stale-resume notice (`:836`), `#@CAUGHTUP` after a delivery (`:893`), end-of-input (`:1148`, where nothing-delivered prints the line as a DIAGNOSTIC, not the alarm) — catch `OSError` around the save only; print `WATCHER-STATE-UNSAVED: <state dir> errno <n> (<strerror>) — position not saved; this message will be delivered again` on stderr, on **every** failing pass (no dedupe); do not refresh `.alive`; and exit on what was **delivered**, exactly as today when the save succeeds. Rewrite the body of the `save_state` comment so it states the new rule, **deleting** the `(Corrected per Langston …)` sentence (the history goes in `#1151` and the commit, not stacked on the comment). **And at `:793` (`--positions`, the stale reset):** catch `OSError`, print `WATCHER-STATE-UNSAVED: <dir> errno <n> (<strerror>) — the watcher was away over 12 h; anything posted since <stale_from> was NOT delivered: sweep the Discord inbox from then` on stderr, and exit 1 — so the arm's `|| break` still ends the task, now with a line the session acts on instead of a traceback. Add `WATCHER-STATE-UNSAVED` to the arm vocabulary in shared MEMORY §4.5 and the wake-watcher runbook.

## 3. OBJECTIVES

| # | objective | check |
|---|---|---|
| **OBJ-1** | A failed save after a delivery ends the task and says so | Linux, state dir `chmod 500`, non-root: one pass prints the WAKE line, prints `WATCHER-STATE-UNSAVED:` naming the dir and errno, and exits **0**; a second pass re-delivers the identical WAKE line (and the line again). **Control:** the pre-fix filter (`58ec1aef8`) on the same input exits 1. |
| **OBJ-2** | When the save works, nothing changes | restored permissions: one pass delivers, saves the position, exits 0; a second pass delivers nothing. |
| **OBJ-3** | All three delivered-class sites follow the same rule | a test drives each of `:836` (stale resume), `:893` (`#@CAUGHTUP`) and `:1148` (end of input) with the save failing: the run's exit code = delivered (0) / not delivered (3 at end of input), measured at the end of the run; the line printed at each failing save — the `:836` pass prints it twice (at `:836` and at the run's end), by design. |
| **OBJ-4** | A watcher that cannot save still reads stale | in OBJ-1's run, `.alive` is not written. |
| **OBJ-5** | The comment no longer argues for the old behaviour | `save_state`'s comment body states the new rule; "A save that still fails RAISES" and "Corrected per Langston" each grep 0 in the `save_state` block (control: `_replace_retrying` 1+ in the same block). |
| **OBJ-6** | Sessions know what the line means; the installed file is the reviewed one | MEMORY §4.5 and the runbook carry `WATCHER-STATE-UNSAVED`; the installed `~/.claude/cc-wake-filter.py` sha256 equals the blob at the approved sha. |
| **OBJ-8** | A failed stale-reset save in `--positions` ends the task with a line the session acts on, and the stale notice survives | write-denied state dir, state 13 h old: `--positions` prints `WATCHER-STATE-UNSAVED:` naming the dir, the errno and the `stale_from` time, prints no positions, exits 1, and the arm's `|| break` ends the loop. **Control:** the pre-fix filter (`58ec1aef8`) exits 1 with a traceback and no such line (measured 2026-10-07 on this laptop). Restored permissions: the stale reset saves and the next `--once` prints the stale WAKE once. |
| **OBJ-7** | No existing case regresses | `test-wake-filter-cuts.py`, `test-wake-lease.py` and `test-wake-follow.py` all pass in CI's Test Suite job; P4's expectation is updated where it asserted the old exit. |

## 4. OUT OF SCOPE
- The heartbeat's control-date false alarm (`#1162`, row 1q) — separate batch.
- Windows behaviour beyond what the existing held-file test covers — reported, not gated (Langston: the Linux repro exercises the code).

## 5. OBSERVATION
None. Installed by hand at Step 6; each session picks it up at its next arm (a running watcher holds the code it armed with).
