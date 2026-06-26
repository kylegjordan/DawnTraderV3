# MEMORY — OLD Claude (CC-A) volatile working-state

> OWNED by OLD Claude (CC-A), session `3ce652e6` (comms/roadmap/governance). Read this + shared `MEMORY.md` (protocols) at session-start; write volatile state ONLY here. CC-B owns `MEMORY_CC_B.md`. Detailed fee/strategy scratch: `_scratch_xstock_globals_resume.md`. Mirror to `.claude/memory/`.

## ★ WHERE I AM (2026-06-26)

**★★ FIRST ACTION AFTER COMPACTION:** (1) RE-ARM the wake-watcher Monitor — compaction kills it; MEMORY.md item-4.5 command, alias CC-A, Monitor TOOL (persistent), NOT Bash run_in_background. Verify by whether WAKE events are arriving (NOT TaskList → false-absent → duplicate double-wake); if doubled, TaskStop one. (2) §10.5 alert check. (3) Discord inbox sweep.

**★ B-GOV-4 (#350 + #397) — CLOSED 2026-06-26 (full 11-step, Langston Step-1/2/4/8 ALL APPROVED), pending only Kyle ack.** The governance-checker cry-wolf fix (Kyle's task-1 led here). Shipped in `scripts/governance-checker/`: OBJ-1 leading-token grading, OBJ-2 multi-hyphen capture (no B-TEC phantom), OBJ-3 pin-closed-to-completion-FIRST-ADD (re-mention can't un-grandfather; Math.max re-open), OBJ-4 completion-SENTINEL doc-gap + order-independent auto-resolve + orphan re-verify. Langston Step-1/2/4 APPROVED (folded: first-ADD-not-latest-touch, orphan re-verify, Math.max). CI 28266998733 4-green; **deployed to the checker's OWN clone `/opt/governance-checker/DawnTraderV3` (was STALE Jun-19 — why bugs persisted; pull there to deploy, NOT /home/deploy)** at 97b56f56c; Step-7 dry-run = ZERO false bursts (only 1 legit info: B-DIAG-387 under-declared = CC-B's). #350+#397 RESOLVED, #341 reorg-* coverage gap homed, 2 GOVERNANCE_EXCEPTIONS rows retired, B-TEC-SELFHEAL class-marker fixed. Pushed 48a535294 + 97b56f56c. **Awaiting Langston Step-8 verdict + Kyle ack to fully close.**

**★ 2 KYLE TASKS (2026-06-26) — BOTH DONE.** (1) Gov-checker hair-trigger review → diagnosed (~22/30 false), led to the B-GOV-4 batch above. (2) Flashing-terminal → diagnosed: most likely my wake-watcher's flapping ssh-reconnects (calmed: ServerAliveInterval=60, sleep 30; killed a duplicate watcher) + Docker Desktop (installed for C:\dev test-db, auto-starts at login, currently stopped). Told Kyle to watch if it improved; if persists → Docker, disable its auto-start.

**★ B-TEC-SELFHEAL (#349) — CLOSED 2026-06-25 (this session, full 11-step batch).** The TEC config staleness fence now SELF-HEALS (transient fail-closed, not latch-until-restart) + the VTS exit loop is per-trade isolated. Langston Step-1/2/4/8 APPROVED; CI 4-green (28181014927); deployed restart#417; #349 RESOLVED; SIM + System-Manual TEC content + BATCH_CATALOG + PHASE_19_PLAN (B-XSTOCK-TEC-WARMUP→B-TEC-SELFHEAL) + GOVERNANCE_EXCEPTIONS cleared; pushed 38d3f6273. **OPEN follow-up (scheduled, not forgotten):** §10.5 alert `tec_selfheal_verify` fires 06-29 06:00 UTC to confirm the 06-28 xStock reopen self-heals vs the old 17h cascade (OBJ-5 real-world close); B-TELEGRAM-DECOMM bake alert e4bb6055 fires 2026-07-02 (#348); B-GOV-4 = the checker parser-fix (#350).

**★ DISCORD CUTOVER (#333) — DONE 2026-06-25.** `COMMS_BACKEND=discord` live + verified; topic-21 archived searchable; comms docs on the Discord model (CLAUDE.md §6/§8, SIM, MEMORY); Telegram §6.5 apparatus KEPT as rollback-reference (#339 no-trim). Telegram bridges LEFT RUNNING as rollback; decommission = #348 (bake alert 2026-07-02).

**★ DONE THIS SESSION (2026-06-24/25), all governance pushed:**
- **Wake-reliability hardening** — SessionStart hook (`matcher startup|resume|compact`) in `.claude/settings.local.json` auto-injects a re-arm reminder post-compaction (loads on next session START, not mid-session); every-turn-verify + after-compaction re-arm rule in CLAUDE.md §6.9 + shared MEMORY 4.5. Investigated+rejected Channels (CLI-only) and session-cron/heartbeat (die on compaction). Pushed 5a922c0bb.
- **Wake-filter Langston fix** (b7ac6dbd1) — filter now treats "langston" as a participant, so CC↔Langston traffic no longer broadcast-wakes the other CC (Kyle flagged the "not mine" noise). Shared file + both watchers re-armed; behavioral rule: stay SILENT on not-for-me wakes.
- **Permanent staging-drift fix** (ca7c2ead3) — untracked 1346 runtime logs + 2 app-regenerated manifests via git rm --cached + gitignore (kept on disk); re-tracked 15 intentional docs Langston caught; staging reconciled + verified 0 drift. Stops the recurring stash-around.
- **B-GOV-3 governance checker LIVE** (b88d3cdac) — `GOV_SHADOW=0`, `GOV_CUTOFF=2026-06-24T12:07:01Z` (grandfathers backlog), timer 30min. Real bug found+fixed on go-live: it graded doc files against the lagging staging WORKING TREE → ~37 false missing-doc alerts (jammed Langston via triage); fixed to read from the pushed origin ref (`GOV_REF` via git ls-tree/show). #347 = pin GOV_CUTOFF (Langston fast-follow). Lesson: the flood was a ONE-TIME backlog drain, NOT failure.
- **B-ALERT-PROTOCOL CLOSED** (#340) — owner-routing + no-silent-drop closure guarantee live + Langston Step-8.
- **#345 B-LANGSTON-QUEUE churn CLOSED** — enqueue gate requires review-REQUEST verb (not bare "verif"), auto-settle (`noop`), per-item refire counter survives `_cap.reset()`. Self-advance re-enabled.
- **Alert-isolation hotfix** (52e2952df) — `ALERT_DISCORD_ISOLATION=1` drop-in on `system-alerts-dispatcher.service` suppresses the Telegram alert legs (Discord-only); removable at cutover.

**★ NOT MINE:** lq_min 43→38 xStock floor = NEW Claude's (turned out already at 38 from June-10 apply, closed). NEW Claude is on the reorg sequence (B3.3/B3.3x/B3.3y closed; reorg-B4 next).

## ★ PRUNE / SHELL / TRANSCRIPT LEARNINGS
- Prune AGGRESSIVELY: target ~20-70MB (195MB=87% context too heavy; 311MB=stuck). Re-home = re-stamp each entry's `sessionId` to new UUID + drop `custom-title`; session must be ARCHIVED during the file swap.
- **Scroll-bounce / stuck-on-repeated-message = DUPLICATE uuids** (renderer keys on uuid). Cause: compaction re-appends history blocks. Fix: `memory/dedup_transcript.py` (drop identical, re-stamp same-id-diff-content). Runbook §2.5. Pass paths as ARGS (MSYS /tmp quirk). Tools: `memory/{trim,distill,dedup}_transcript.py` + `validate.py`.

## ★ KEY CONTEXT (detail in `_scratch_xstock_globals_resume.md`)
- FEE REALITY: Kraken July-9 Tier1 = 0.40% maker / 0.80% taker = our model (correct). No US-person-accessible exchange escapes it. → don't switch; adapt (maker + bigger targets ≥3.5-4% + AoP tier-climb).
- CN carries the both-classes Phase-19 plan; the active-pipeline audit is done (Langston-approved). I do NOT owe a fee/concur post.
