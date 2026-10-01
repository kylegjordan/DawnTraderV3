# B-WAKE-ARM-EXCLUSIVE — SCOPE (Step 1, r1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1o**, immediately after row 1h (`B-TOKEN-BURN-CUT`) · **Issue:** `#1140` · **Placed by:** Langston, 2026-10-01 (message id 1555324062803300454), §9.4 disposition 3 — "not a fold".

## 0. WHY

A session can run two wake watchers at once, and each delivers every wake, so every message arrives twice (seen on NEW Claude, 2026-10-01). The only guard is a sentence, and `B-WAKE-QUIET` (`#995`) measured three instruction-shaped fixes failing: "do NOT blind-re-arm" in `.claude/hooks/session-reminder.mjs`, "TaskStop one" in shared MEMORY 4.5, and the runbook. Langston, approving the direction: *"A lock is a mechanism. Build it."*

Since `cfe70f92c` there is a second reason. A watcher that cannot save its position deliberately lets `.alive` go stale, and the most likely thing stopping it saving is a second watcher of the same alias holding the file. Stale then invites a third arm. `B-TOKEN-BURN-CUT` added a count-before-arming step (`~/.claude/cc-wake-count.sh`) as a diagnostic; this batch makes the second watcher impossible rather than merely countable.

## 1.a ARCHITECTURAL READ

- **SYSTEM_IMPACT_MAP.md**, "Discord Comms Fabric" (around line 2833, 2862-2880) and the `cc-wake-filter.py` content updates (around 3689-3710). The filter is hand-installed to `~/.claude/` from `comms-infra/laptop/`, and each running watcher holds the code it armed with. Both stay true. ⚠️ Two lines are stale: "3-source tail" (two sources since `#1054`) and "a RUNNING Monitor holds the OLD code" (the Monitor form is retired). That correction is folded into `B-TOKEN-BURN-CUT`'s Step 10 SIM update, not this batch.
- **SYSTEM_MANUAL.md**: silent on the wake watcher. A search for it returns nothing, and the same search finds `SQE` 62 times, so the search itself works. That is correct: this is comms tooling, SIM-scope only.
- **Components touched:** `cc-wake-filter.py` (behaviour changes: tier 1), the arm command (text changes in every place it is written: tier 1), `cc-wake-follow.py` (not changed; tier 2), `cc-wake-count.sh` (kept as a diagnostic; tier 2).

## 1.b PROVENANCE READ

Corpora searched: `RUNNING_ISSUES.md`, `BATCH_CATALOG.md` and the completion reports, by filename (`cc-wake-filter`); the git history of `comms-infra/laptop/cc-wake-filter.py` and its former path `comms-infra/telegram-reference/cc-wake-filter.py`; `CLAUDE.md` §6.9.

- **`cc-wake-filter.py` (tier 1).** Built 2026-06-11/12 outside the repo (`CLAUDE.md` §6.9: *"each open CC desktop session arms a persistent background watcher at session start that WAKES the session"*). Its first repo copy is `04d7cb3e9` (2026-06-19), quoted: *"comms-infra/telegram-reference/: faithful copies of the live bridges mirrored."* Re-homed to `comms-infra/laptop/` at `b279dfe79` (2026-08-07, B-COMMS-IMAGES-2). Turned into the run-once, position-saving form by `B-TOKEN-BURN-CUT` (2026-09-30). **One watcher per session was always the assumption, and it was never enforced:** a search of the filter and the follower for any lock returns nothing but the word "BLOCKER" (the same search hits that word, so it can see the file). Duplicates were handled only by instruction (the 06-25 TaskList trap in the runbook; "do NOT blind-re-arm"). **Disposition: (2) relevant, needs updating to today's intent.**
- **The arm command (tier 1).** Written out in full in shared MEMORY 4.5 (kept inline by design, so a compacted session can re-arm without following a pointer). It was changed to the loop-until-wake form by `B-TOKEN-BURN-CUT`. **Disposition: (2).**
- **`cc-wake-follow.py` (tier 2).** Runs on Helsinki, tails the two sources, emits `#@POS`/`#@KEEPALIVE`/`#@CAUGHTUP`. Not changed. **(1).**
- **`cc-wake-count.sh` (tier 2).** Added by `B-TOKEN-BURN-CUT` Step 7 as count-before-arming. **(1)** — kept as the diagnostic for a stuck watcher.

## 2. THE DESIGN DECISION LANGSTON REQUIRED (his condition 1, a BLOCKER)

**The lease belongs to the ARM LOOP, not to one run of the filter.** A filter-held lock is free during the loop's 30-second reconnect sleep, which is exactly when a session judges the watcher dead and re-arms. Worse, the incumbent's next pass would then be refused, exit 0, and end its task — a content-free wake, which is `#1127` itself. So:

- The arm command records the loop shell's Windows process id (`/proc/$$/winpid` in Git Bash) once, before the loop, and passes it to every filter call as `--loop <pid>`.
- The filter keeps a lease file `<ALIAS>.lease` holding that pid and the process's creation time (creation time defends against a reused pid).
- **On start**, the filter takes the lease if it is absent, if its process is gone, or if it is its own loop's. Otherwise it **refuses**: it prints ONE line to **stdout** (Langston's condition 2: the task output file is what the session reads) and exits 0, which ends the newcomer's task. That one line is the wake, and it carries content.
- **The refusal says which case it is (condition 2):** holder pid, holder start time, and `.alive` age. Fresh `.alive` → *"already running (loop pid N, alive 40 s ago) — stand down, do not arm"*. Stale `.alive` → *"a watcher is running but STUCK (loop pid N, .alive 22 min old) — stop process N, then re-arm"*.
- **The incumbent is untouched:** its lease names its own live loop, so its reconnect passes are never refused.

I chose this over keeping a filter-held lock and documenting the exit-0 handover, because the handover IS the defect this programme exists to remove.

**Cost, stated:** the arm command changes, and it is written out in several places. Census at Step 2 (Langston named five: shared MEMORY 4.5, the wake-watcher runbook, `B_TOKEN_BURN_CUT_ARM_SWITCH.py`, `MEMORY_CC_B.md`, the heartbeat skill). Every place changes in the same commit; the other sessions' own memory files are their owners' to edit, asked once.

**Fallback if `--loop` is absent** (a session still on the old arm command): the filter runs exactly as today, with no lease. A partly re-armed estate must not refuse everyone.

## 3. OBJECTIVES AND VERIFICATION

Every test states its expected result before it runs and has a control that fails on the current filter.

| # | objective | verified by |
|---|---|---|
| **OBJ-1** | A second arm for an alias whose arm loop is alive is refused: no second reader starts, and the refusal is one stdout line naming the holder pid, its start time and the `.alive` age | test: holder loop live → newcomer exits 0 with the line and never reads input; control (`cfe70f92c`/current) starts a second reader |
| **OBJ-2** | The reconnect gap is covered: while the incumbent loop sleeps between filter runs, a newcomer is still refused, and the incumbent's next pass is NOT refused (condition 4c) | test: lease held by a live loop pid with no filter running → newcomer refused; the same loop pid → accepted |
| **OBJ-3** | A dead holder never strands the alias: holder process killed → the next arm takes the lease (condition 4a) | test: lease names a killed process → newcomer acquires |
| **OBJ-4** | A refused arm does not harm the survivor: after a refusal, a real wake is still delivered by the incumbent (condition 4b) | test: refuse, then feed the incumbent a wake line → delivered once |
| **OBJ-5** | `--positions` never writes state while another live loop holds the lease (condition 4d) — today its stale-position branch writes the state file | test: lease held by another live pid + a stale state → `--positions` prints and writes nothing |
| **OBJ-6** | A reused pid is not mistaken for the holder | test: lease with a live pid but a wrong creation time → treated as dead, newcomer acquires |
| **OBJ-7** | Every written copy of the arm command carries `--loop`, census-enumerated, in one commit; the old command still works (no lease) | census at the ref before and after (zero old-form hits outside history); test: no `--loop` → today's behaviour |
| **OBJ-8** | Live: after every session re-arms, a deliberate second arm in each session is refused with the stand-down line, and the process count stays 1 per alias | four sessions, `cc-wake-count.sh` before and after |

## 4. OUT OF SCOPE / CARRIED

- **Langston condition 3 — the cause of NEW Claude's `WinError 5` stays RULED ON REPORTED FACT.** The double arm is proven (doubled `[src=…@offset]` tags), but that it produced that particular error is not: the two process ids, their start times and the error timestamp inside both lifetimes were never captured. The lease does not depend on it.
- The `.alive`/stale semantics and the count script are `B-TOKEN-BURN-CUT`'s and are not reopened here.
- Helsinki-side code (`cc-wake-follow.py`) is unchanged.

## 5. GOVERNANCE THIS CLASS OWES (declared now, graded at Step 10)

`non_architecture`: per `workflow-10-governance`'s class matrix. SIM content update (the filter's lease and the arm command); System Manual N/A (comms tooling, silent by design — see 1.a); the wake-watcher runbook; `RUNNING_ISSUES` `#1140`; `BATCH_CATALOG`; completion report; task-list row.
