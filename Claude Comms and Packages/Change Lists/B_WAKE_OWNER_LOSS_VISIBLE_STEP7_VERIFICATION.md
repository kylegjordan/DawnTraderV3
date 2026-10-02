# B-WAKE-OWNER-LOSS-VISIBLE (#1142) — Step 7 first-pass verification (CC-A)

> Row 1p, `SPRINT_TO_LIVE_PLAN.md`. Reviewed code = `a23e42871` on `migration/aws-supabase` (Step 4 APPROVED by Langston, r2 with
> in-commit conditions). CI run **37076538062**, 4/4 per job, including the two new Test Suite steps.
> ⚠️ **Everything below except the CI rows is laptop-measured and RULED ON REPORTED FACT for Langston.**

## No staging surface — stated, not skipped
Nothing under `server/`, `client/` or `shared/` changed, so there is no staging deploy and no staging tab to navigate. The
surface this batch changes is **each session's per-turn alert list** (the `inject-due-alerts` hook's output) and the wake
filter's records on the laptop. Those are what was checked.

## Install (Step 6 for laptop tooling)
- `~/.claude/cc-wake-filter.py` replaced from the blob at `a23e42871`: sha256 `26a2371a776e1ad2…b729`, **equal to the blob**
  (before: `8b2bf0848da87ed2…`, kept as `cc-wake-filter.py.pre-1142`). Installed 2026-10-02 23:19:50Z.
- The hook runs from each clone's working tree, so a pull installs it; this clone pulled at `a23e42871`.

## Live checks
| check | how | result |
|---|---|---|
| the installed hook shows a loss in the REAL alert list | the hook run with this clone's real environment and the real state folder: before, with one planted fake loss line (`f1420000-…-test → CC-B`, wall-clock now), and after removing it | before: no loss line · planted: `⚠ this session's wake filter failed to save 1 alert routing(s) in the last 24 h — they read as unrouted here until re-stated: f1420000 → CC-B — tell Langston, leading with his name, to re-state those markers.` · removed: no loss line; the file is gone, as it was before |
| the PROCESS runs the new code, not just the file | each session's reader start time against the 23:19:50Z install (CIM, production readers only) | at 23:21:31Z — CC-A 23:20:13 · CC-C 23:20:59 · CC-INFRA 23:21:22 — all after the install. **CC-B: no reader at that moment** (see below) |
| the stale comment is gone (Langston's B-WAKE-ARM-EXCLUSIVE Step 11 condition A) | `grep -c "the Monitor treats stdout"` on the blob at `a23e42871`, control `grep -c "UNROUTED LINE"` | 0 · control 1 (Langston also re-derived it at the ref) |
| a failed save or load still delivers the wake, and leaves the loss line | `test-wake-filter-cuts.py` — CI (Linux) and laptop (Windows) | CI: P1-P4, C-2 and the rotate-fails leg all PASS · Windows: ALL PASS, incl. the held-file leg with its loss line |
| the clearing and expiry rules | `test-alert-split.mjs` — CI and laptop | 42 / 42 |
| the ORPHAN stamp is UTC | `test-wake-lease.py`, laptop only | PASS (stamp ends `Z`, age 6 s); the pre-#1142 filter FAILS it. **Zero CI reach** — PowerShell-only, stated in the change list. |

## Not verified live, by design
- **A real lost routing on a live watcher.** It requires a save to fail on a running watcher; the tests force it in temp folders
  (Windows held file, Linux read-only directory, a directory at the record's path). Forcing it on a live watcher would cost a
  real routing. It has never been observed (0 in 1,436 task outputs, scope §0).

## OBJ-6 — CC-B's watcher
CC-B had no running reader at 23:21:31Z (between watchers, or not yet re-armed). Checked again before Step 8 dispatch — see the
dispatch.
