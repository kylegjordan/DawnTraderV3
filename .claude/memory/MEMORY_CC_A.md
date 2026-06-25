# MEMORY — OLD Claude (CC-A) volatile working-state

> OWNED by OLD Claude (CC-A), session `3ce652e6` (comms/roadmap/governance). Read this + shared `MEMORY.md` (protocols) at session-start; write volatile state ONLY here. CC-B owns `MEMORY_CC_B.md`. Detailed fee/strategy scratch: `_scratch_xstock_globals_resume.md`. Mirror to `.claude/memory/`.

## ★ WHERE I AM (2026-06-25)

**★★ FIRST ACTION AFTER COMPACTION:** (1) RE-ARM the wake-watcher Monitor — compaction KILLS it (shared MEMORY item 4.5 has the command; verify it is not already running, arm with the Monitor TOOL, alias CC-A); (2) §10.5 alert check; (3) then the task below.

**★ NEXT TASK = DISCORD CUTOVER (#333)** — the permanent Telegram→Discord switch. Runbook: `comms-infra/discord/TEST_AND_SWITCH_RUNBOOK.md`. Sequence: 7-test battery (Kyle→CC, Kyle→Langston, bot-to-bot, voice, wake, phone-push, long-relay) → SWITCH (one line: `echo 'COMMS_BACKEND=discord' > /etc/dawntrader/comms-active.env`) → governance doc rewrite (CLAUDE.md §6/§8 + SIM + MEMORY to the Discord model; archive Telegram topic-21 to `Claude Comms and Packages/Telegram Discussion Archives/`) → decommission Telegram bridges (stop+disable `langston-bridge`/`cc-comms-bridge`, log in DELETED_COMPONENTS_LOG). Telegram stays as INSTANT ROLLBACK (`echo 'COMMS_BACKEND=telegram' > ...`) until verified. NOTE: cutover is CLI-runbook but the live channel = Discord; keep posting via `discord-cc-bridge.py send --sender "OLD Claude"`.

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
