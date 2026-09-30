# B-TOKEN-BURN-CUT — CHANGE LIST (Step 4)

| field | value |
|---|---|
| **(i) declared change-class** | `non_architecture` (scope header) |
| **(ii) that class's doc set** | scope — **present** `Claude Comms and Packages/Scope Files/B_TOKEN_BURN_CUT_SCOPE.md` · pre-audit — **present** `…/B_TOKEN_BURN_CUT_PRE_AUDIT.md` · completion report — **absent** (Step 11) · `BATCH_CATALOG.md` row — **absent** (Step 10) · `PHASE_HISTORY.md` — **absent** (Step 10) · `SYSTEM_IMPACT_MAP.md` (conditional) — **owed**, content update to "Discord Comms Fabric" at Step 10 · `SYSTEM_MANUAL.md` (conditional) — **judged N/A**: comms tooling, not trading architecture (pre-audit A10) |
| **(iii) Step-2 reference** | `B_TOKEN_BURN_CUT_PRE_AUDIT.md`, CLEARED by Langston 2026-09-30T11:33:29Z at `b7ea4e595`, conditions C6-C10 recorded in its §4 |

## What changed (Step 3)

**NEW `comms-infra/laptop/cc-wake-follow.py`** — the Helsinki-side reader (plan P1). Never installed remotely: the laptop pipes it into `ssh … "python3 - ARGS"`. Args `path:inode:offset` or `path:end` (parsed from the RIGHT, so a path may hold a colon). Emits a `==> path <==` header before the first content line of every run (C7), `#@AT` start points (so a file with no traffic still has a stored position), `#@POS` BEFORE each complete line, `#@CAUGHTUP` on every idle 1 s pass (teardown, C8), `#@KEEPALIVE` every 300 s. Re-opens from 0 on a new inode or a shrunk file (C2); never consumes a trailing chunk without `\n`; a content line shaped like a control or header gets a zero-width prefix so it cannot steer the filter.

**MODIFIED `comms-infra/laptop/cc-wake-filter.py`** (P2) — routing UNCHANGED; the default streaming mode is unchanged (the 22-case `test-wake-filter-cuts.py` passes before and after). Added:
- `--positions` prints resume args; a state older than 12 h is discarded, and the next run prints one `WAKE[WATCHER->…]` line naming the UTC it threw away (C10).
- `--once` wraps stdout in a tap that counts and tags wake lines `[src=<file>@<offset> id=<message_id>]` (C10). It commits a position only after the line is processed, and on `#@CAUGHTUP` after a delivery it saves, then exits 0 — print before save, so a kill gives a duplicate, never a loss (judgement call (a)). `#@KEEPALIVE` saves and touches `<state>.alive`. EOF saves and exits 3.
- `WATCHER-CONTROL <ALIAS> <nonce>` in `cc-wake.log` writes `<state>.control`, with no print; another alias's control line is ignored.
- A heartbeat reporting `watchers: … DEAD` or `control: NOT answered` is delivered; all-clear and `not armed` stay suppressed.
- DELETED: the `langston-alert-invokes` branch (a bare `pass`) — `DELETED_COMPONENTS_LOG.md`, with the `#340` reasoning (C9).
- State lives in `C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json` (C3).

**NEW `scripts/analysis/test-wake-follow.py`** — 18 cases, follower piped into filter exactly as armed, on temp copies of both sources: first arm starts at end; tag carries offset + id; follower ends by itself after the filter exits (C8); the gap delivered once, in order, other session suppressed, one exit per burst; re-arm with nothing new stays idle; negative control; half-written line; rotation; copytruncate; forged `#@POS` inert (and, being unnamed, delivered as defanged content under the broadcast rule); control file, not a wake; keepalive file; 12 h stale discard; four heartbeat routing cases. ALL PASS, 10 wake lines produced.

**Live check, Helsinki (C8):** 10 arm cycles on the REAL sources with a test state file and a planted `Claude Old:` line per cycle — each cycle rc 0, exactly one wake tagged `[src=cc-wake.log@87963 … 88522]`, process census `follower=0 tail=4 notty=6` before, between every cycle, and after. Positive control for the census: a follower started and counted `follower=1`, then 0 within 4 s of its ssh being killed.

**MODIFIED `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md`** (P4, repo copy only — live copy installed at Step 6): step 2b reads each `.alive` age on the laptop (> 900 s = DEAD; missing = not armed); 2c plants the daily control only when all four `.alive` files exist (an old-form watcher would WAKE on it); a DEAD or unanswered result adds `--notify`; the post no longer asks sessions to check themselves.

**MODIFIED five skills (OBJ-4, P6)** — `bug-investigation`, `workflow-02`, `-04`, `-07`, `-11`: the iterate/cap-3 loop block replaced by one pass on load-bearing claims only, decided before publishing, `NOT RE-READ` label on any not routed; HIT = lead re-derived, CLEAN ≠ evidence, the `REVIEWER:` record — kept.

**LEDGER:** `#1054` annotated — its documentation and watcher legs are folded here; the Helsinki `/etc` items and Langston's own `CLAUDE.md` §5.3 item 2 stay with Infra Claude.

## HELD FOR STEP 6 — the arm-instruction switch: `Claude Comms and Packages/Change Lists/B_TOKEN_BURN_CUT_ARM_SWITCH.py`
18 exact-match edits across 8 files (shared `MEMORY.md` §4.5 + its alert-log line, `CLAUDE.md` §6 comms block + §6.9, the runbook §1-§4, `session-reminder.mjs`, `COMMS_BRIDGE_RUNBOOK.md`, `SEARCH_SURFACES.md`, `TEST_AND_SWITCH_RUNBOOK.md`, `CLAUDE_CODE_FEATURE_WATCH.md`). `--dry` at this ref: every edit matches exactly once. **Held because if the instructions landed before the live copies are installed, a session re-arming from them (compaction, restart) would loop on a missing file and go deaf.** Step 6 = install the live filter, follower and heartbeat task (each `sha256` against the blob at the ref, `#1004`), run this script, commit, and each session re-arms at its next turn boundary. Other sessions' own memory lines (`MEMORY_CC_B.md:6,32,34`, `MEMORY_CC_C.md:60,107`, `MEMORY_CC_INFRA.md:71`) are theirs; each gets the new arm line in one post.

## Judgement calls to attack
1. The switch held to Step 6 rather than landing with the code (the deaf-session argument above).
2. Every idle 1 s pass writes `#@CAUGHTUP` (~11 bytes/s per session over ssh) so teardown is ~1 s; the alternative, keepalive-only writes, lets an orphaned follower live up to 300 s on your box.
3. The daily control is gated on all four `.alive` files existing, so it is inert until every session has switched.
4. `--once` exits only on `#@CAUGHTUP` after a delivery — a stream with no idle pass (sustained writes > 1/s) would not end. Your 24,332-row measurement puts the longest sub-1 s run at 7 rows / 1.7 s.

NOT RE-READ: nothing in this change list went to a second reader.
