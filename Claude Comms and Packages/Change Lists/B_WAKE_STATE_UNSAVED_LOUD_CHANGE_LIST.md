# B-WAKE-STATE-UNSAVED-LOUD — CHANGE LIST (Step 4)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header, `806ddea1b`) |
| **(ii) DOC SET for that class** | scope — **present** `Scope Files/B_WAKE_STATE_UNSAVED_LOUD_SCOPE.md` · pre-audit — **present** `Scope Files/B_WAKE_STATE_UNSAVED_LOUD_PRE_AUDIT.md` · completion report — **absent, Step 11** · `BATCH_CATALOG.md` / `PHASE_HISTORY.md` — **absent, Step 10** · `MEMORY.md` — **in this diff** (shared §4.5 vocabulary) · SIM — **in this diff** (wake block) · System Manual — **N/A** (conditional for the class; laptop comms tooling) |
| **(iii) STEP-2 REFERENCE** | `B_WAKE_STATE_UNSAVED_LOUD_PRE_AUDIT.md` r1 at `793cbf6fe`, APPROVED by Langston 2026-10-07 with C1-C3 + one record item, all folded below |

**REF:** review branch `migration/b-wake-state-unsaved-loud` at **`87552a8e3`** (one commit on `b0a932a17`). **Not on `migration/aws-supabase`.** Diff: 7 files, +276/-14.

## THE CODE — `comms-infra/laptop/cc-wake-filter.py`
| site | before | after |
|---|---|---|
| `load_state` | `except (FileNotFoundError, ValueError): return {}` — any other `OSError` raised uncaught (a traceback) | **your C1:** the same two still return `{}`; any other `OSError` prints `WATCHER-STATE-UNREADABLE: <file> errno … — the position is unknown, so the watcher will not resume …` and exits 1. **Not** widened to `{}` (that is the tail-resume silent loss you named). |
| `--positions` stale reset (old `:793`) | uncaught → traceback, exit 1 | `WATCHER-STATE-UNSAVED: <dir> errno … — the watcher was away over 12 h; anything posted since <stale_from> was NOT delivered: sweep the Discord inbox from then`, exit 1 (the FILTER exits 1; the arm's `|| break` makes the TASK exit 0 — Step 7 reads the text) |
| stale-resume notice (old `:836`), `#@CAUGHTUP` after a delivery (`:893`), end of input (`:1148`) | `_checkpoint()` — uncaught → exit 1 → silent 30 s retry | `_checkpoint_loud()`: on `OSError` prints `WATCHER-STATE-UNSAVED: <dir> errno … — position not saved; this message will be delivered again`, every failing pass; the run then exits exactly as before on what it delivered (0), or 3 at end of input with nothing delivered |
| keepalive (`:878`, already guarded) | `[cc-wake-filter] keepalive save skipped, .alive NOT refreshed: …` | **your record item:** the same `WATCHER-STATE-UNSAVED:` wording, `… — keepalive save skipped, .alive NOT refreshed` (the old phrase is kept inside it, so the existing held-file case still matches) |
| `save_state` comment | "A save that still fails RAISES … (Corrected per Langston: …)" | rewritten to the new rule; both phrases grep **0** (control: `_replace_retrying` present) |
`.alive` still has exactly one writer (the keepalive's success branch).

## THE TESTS — `scripts/analysis/test-wake-state-unsaved.py` (new; in CI's Test Suite)
**Your C2 — the deny, per platform, write denied and read preserved:** POSIX `chmod 0500` on the state dir; Windows an ACL deny of `WD,AD` only (never `F`). **Your C1/C3:** every failure case first checks a direct file creation in the dir raises `OSError` — a deny that "succeeds" while the write goes through **FAILS**; root on POSIX is a **SKIP** with the reason printed and counted. CI's runner is the non-root `runner` user.
| case | site | expected | Windows laptop | Linux, uid 65534 | Linux, root | pre-fix filter (control) |
|---|---|---|---|---|---|---|
| OBJ-1 | `#@CAUGHTUP` | wake + line + exit 0, position not advanced; pass 2 the same | PASS | PASS | SKIP | **FAIL** (rc 1, no line) |
| OBJ-2 | writable | saves `[7,400]`; next pass delivers nothing (rc 3) | PASS | PASS | PASS | PASS (success path) |
| OBJ-3a | stale-resume | notice + the line **twice** + exit 0 | PASS | PASS | SKIP | **FAIL** (rc 1, 0 lines) |
| OBJ-3b | end of input | exit 3 + the diagnostic line | PASS | PASS | SKIP | **FAIL** (rc 1) |
| OBJ-4 | the residual | keepalive writes `.alive` at T; deny; deliver → line, exit 0, `.alive` **still T** | PASS | PASS | SKIP | **FAIL** (rc 1) |
| OBJ-8 | `--positions` | line with the `stale_from` time, no stdout, exit 1; restored → reset saves, next pass prints the notice once | PASS ×2 | PASS ×2 | SKIP + PASS | **FAIL** + PASS |
| C1 | `load_state` | a directory at the state path → `WATCHER-STATE-UNREADABLE`, exit 1, no stdout | PASS | PASS | PASS | **FAIL** (traceback) |
Totals: Windows 8/8; Linux non-root 8/8; Linux root 2 pass, 5 SKIP stated; pre-fix 2 pass, 6 FAIL. **The `#1142` P4 case in `test-wake-filter-cuts.py` now asserts exit 0 and the line** (it carried "exit code NOT asserted"); passes on Linux as 65534. Existing suites `test-wake-filter-cuts.py`, `test-wake-follow.py`, `test-wake-lease.py`: ALL PASS on the laptop.

## DOCS (in the diff)
- shared `MEMORY.md` §4.5: `WATCHER-STATE-*` (any line) ⇒ sweep from its time, re-arm once; repeats ⇒ Kyle. **The file sat at 24,543 B of 24,576** — three phrases trimmed to fit; now **24,559 B** (LF).
- `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md`: what each line means, what to do, and the residual (fresh `.alive` with no watcher, up to 15 min).
- `SYSTEM_IMPACT_MAP.md` wake block: one line.

## JUDGEMENT CALLS TO ATTACK
1. **`ValueError` (unparseable JSON) still returns `{}`** — the same tail-resume class as your C1. I left it: `save_state` writes a temp file and replaces atomically, so the watcher itself cannot leave a half-written file; a corrupt file needs an outside edit. Rule it in or out.
2. **The `WATCHER-STATE-*` lines go to stderr**, after the `WAKE[` line in the same task output — so the session vocabulary says "any line", not "first word".
3. **Install (Step 6) is by hand on this laptop with a sha256 check** — permanently reported fact for you.
