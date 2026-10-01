# B-TOKEN-BURN-CUT — Step 7 first-pass verification record (CC-A, 2026-10-01)

**Purpose:** the evidence behind each objective, with the object, the population and the command for every number, so Langston's Step 8 can re-derive it rather than accept it. Each leg says where its evidence lives: **server** (he can read it himself), **repo** (at the ref), or **laptop** (only CC can reach it). A laptop-only leg is marked as such.

Installed at the end of Step 7: `~/.claude/cc-wake-filter.py` = blob at `a89a90138` (sha256 `7418ee3c…`), `~/.claude/cc-wake-count.sh` = blob at `f4cd43e3d` (`8a386127…`), heartbeat skill = blob at `f4cd43e3d` (`1a9a45a2…`). All three approved by Langston (the count script ratified after an early install).

## OBJ-1 — a session is woken only by a wake-worthy event

**(a) No empty wakes, and no Monitor notices, over at least six live-armed hours per session.**

1. **Liveness (server):** the hourly heartbeat's posts in `/var/log/cc-discord-inbox.jsonl` (sender `Heartbeat`), field `watchers:`. They read `all alive` every hour from `2026-10-01T01:14` to `21:13`. CC-A, CC-B and Infra are alive from `2026-09-30T18:13`. CC-C is `not armed` until `00:13`, and alive from `01:14`. Missing: `12:13` and `13:13` (no run) and `14:13` (run failed: "Can't reach the API server … ENOTFOUND"). The laptop was offline; the gap is not a watcher fault. Command:
   `grep -F '"Heartbeat"' /var/log/cc-discord-inbox.jsonl` → filter `ts >= 2026-09-30T18`, print the `watchers:` field.
2. **Empty wakes (laptop):** `scripts/analysis/b-token-burn-cut-wake-audit.py <from> <to>` classifies every background-task completion in each session's newest transcript. A watcher completion counts as a wake if its output file holds a `WAKE[` line, and as empty otherwise. Monitor notices are counted separately.
   - **Window `2026-10-01T00:00`–`23:59` (run 21:54Z):** CC-A wake 4, empty 0, monitor 0 · CC-B wake 8 / 0 / 0 · CC-C wake 8 / 0 / 0 · Infra wake 7 / 0 / 0.
   - **Control, the same instrument on `2026-09-29` (old form):** monitor notices CC-A 45 · CC-B 52 · CC-C 76. So the instrument sees them. Infra reads 0 for 09-29 because its newest transcript does not reach that day. That is a limit of the instrument (newest transcript only), not evidence.
3. **CC-A's long idle stretch (laptop + server):** in CC-A's transcript, the watcher was armed at `2026-09-30T21:28:42` and the next watcher event is `2026-10-01T20:37:35`: about 23 h with no completion of any kind. The heartbeat (item 1) shows CC-A alive every hour across that stretch, so the silence is a live watcher with nothing to say, not a dead one.
   ⚠️ The audit's "arm" detector matches any assistant line containing `cc-wake-follow` and `run_in_background`, including CC-A's own analysis commands. It is NOT used for any verdict here.

**(b) Positive and negative controls (server + laptop):**
- **T1:** names NEW Claude only, message `1555318264559571057`, 20:39:30Z. It woke CC-B; no T1 line appears in CC-C's or Infra's watcher outputs.
- **T2:** names all four, `1555318355261657120`, 20:39:52Z. It woke CC-B, CC-C and Infra.
- CC-A is not woken by its own posts, by design, so CC-A's positive control is **T3** in `/var/log/cc-wake.log` (line 176). It woke CC-A.
- Reported at the time in `1555322573485510769`. The per-session watcher outputs are **laptop**.

## OBJ-2 — no event lost between wakes

- **T4** (`/var/log/cc-wake.log` line 177) was posted while no CC-A watcher ran, and arrived exactly once on re-arm, tagged `[src=cc-wake.log@<offset>]` (**laptop** output).
- **Mid-turn (CC-B):** delivered exactly once, in order — **reported by NEW Claude**, not re-measured by CC-A.
- **Repo:** `scripts/analysis/test-wake-filter-cuts.py` covers the resume-from-position legs. On Windows it is ALL PASS at `a89a90138`. Its held-file legs SKIP on POSIX, with the reason printed.

## OBJ-3 — the arm procedure is updated everywhere it lives, and every session runs it

- **Census at the ref (repo):** every `Monitor` mention across `.claude/{memory,skills,hooks}`, `CLAUDE.md`, `CONDUCT.md`, the wake-watcher runbook and `comms-infra/laptop` (commit `8d25633f3`).
  - Stale lines found and fixed by their owners: `MEMORY_CC_C.md:107` (`f6b269089`), `MEMORY_CC_B.md:34` (`3a9619b62`), and `MEMORY_CC_INFRA.md:71` (now reads "Arm the watcher as shared MEMORY 4.5 says").
  - `MEMORY_CC_B.md:6` said "(older than 15 min = dead)", the pre-`cfe70f92c` reading of a stale file. NEW Claude fixed it at `4648be70e`: line 6 now points at shared MEMORY 4.5 and holds no "15 min". The census returns no stale arm line.
- **Every session runs it (laptop):** `bash ~/.claude/cc-wake-count.sh <ALIAS>` at 21:20Z gave CC-A 1, CC-B 1, CC-C 1, Infra 1 (one `python.exe … cc-wake-filter.py <ALIAS> --once` each). Controls: an unused alias gives 0; CC-A with a stand-in second process gives 2.
- **Stale means count first:** the four read-sites (shared MEMORY 4.5, `session-reminder.mjs`, runbook, heartbeat step 2b) carry it at `ecabf7a47`/`f4cd43e3d`.
- **Legacy (repo + laptop):** `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat-cc-a/` (and its laptop copy) is an unscheduled pre-shared-heartbeat task. It is absent from the scheduled-task list, and its text still describes the hourly wake this batch removed and reads alerts with a `tail -20`. Rule 18: deleted at Step 10 with a `DELETED_COMPONENTS_LOG` entry.

## OBJ-4 — fresh-reader check is one pass

Repo: zero loop references at the ref in the five step skills. The control at the pre-batch ref finds them in 4 skills (Step 7 evidence; unchanged since).

## OBJ-5 / OBJ-6 — Langston replies wake only the addressee; each session sees only its own alerts

- **Repo:** `scripts/analysis/test-alert-split.mjs` 22/0. The filter case table carries the addressee legs.
- **Live (laptop):** CC-A's per-turn alert hook shows "YOURS / routed elsewhere" and, when an owner changed within 24 h, names it as unrouted and asks for it to be told to Langston. That is visible in every CC-A turn since the install.

## Lead, not a finding — for `#1140`

CC-A's watcher was alive at 20:13Z per the heartbeat, and the session re-armed at 20:37Z on resume. **If the old watcher was still running, CC-A ran two watchers until the first one ended.** This is a HYPOTHESIS: no process census was taken at 20:37, and nothing in this record shows a doubled `[src=…@offset]` tag. It is the double-arm `#1140` exists to make impossible, and it is recorded for that batch's Step 2, not claimed here.
