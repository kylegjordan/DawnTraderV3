# MEMORY — Claude Old (CC-A) volatile working-state

> OWNED by Claude Old (CC-A), session `3ce652e6` (comms/roadmap/governance). Read this + shared `MEMORY.md` (protocols) at session-start; write volatile state ONLY here. CC-B owns `MEMORY_CC_B.md`. Detailed fee/strategy scratch: `_scratch_xstock_globals_resume.md`. Mirror to `.claude/memory/`.

## ★ WHERE I AM (2026-06-19, late)

**★LATEST: B-DISCORD BUILD (Kyle directive "build it now, switch later").** Built a full PARALLEL Discord comms fabric (brand-new bots, zero changes to live Telegram) to a testable state, with instant switch + instant rollback. Built + committed + pushed (`04d7cb3e9` build, `350d500f3` Langston-review fixes), sync 0/0. Code in `comms-infra/discord/` (discord_common.py + discord-langston-bridge.py + discord-cc-bridge.py + cc-send dispatcher + systemd units + deploy.sh + DISCORD_BRIDGE_DESIGN.md + TEST_AND_SWITCH_RUNBOOK.md); Telegram originals mirrored in `comms-infra/telegram-reference/`. Langston reviewed (caught real issues: paid-loop-per-Kyle-msg from CC auto-ACK since Discord bots see each other; phone-push needs @-mention; schema drift vs wake filter) → I applied ALL fixes (removed ACK + address-gate + CC_BOT_ID pin + circuit breaker + dedup + rest_send 429 + Kyle inbound empty-kind + wake filter now matches `cc-discord-inbox` path + cc-send --notify) → **re-review IN FLIGHT (bg task bmtuv5y59)**.
- **★BLOCKED ON KYLE:** the only thing I can't do (account/bot/token creation). Checklist = `Claude Comms and Packages/Scope Files/DISCORD_SETUP_KYLE_CHECKLIST.md`. Need from Kyle: CC bot token, Langston bot token, CC bot ID (Application ID), channel ID, his Discord user ID (+optional Langston bot ID, server ID). Tokens → `/etc/langston/discord-{cc,langston}-bot.env`; IDs → `/etc/dawntrader/discord-comms.env`.
- **NEXT after Kyle provides:** scp files to `/opt/discord-bridges/` → run `deploy.sh` (parallel, non-destructive; sets up venv+discord.py) → arm 2nd wake watcher on the Discord log → run the 7-test battery (bot-to-bot, Kyle→CC, Kyle→Langston, voice, wake, phone-push, long relay) → only after all green + Kyle satisfied: SWITCH = `echo COMMS_BACKEND=discord > /etc/dawntrader/comms-active.env` (rollback = flip back; Telegram never stopped). Feasibility study = `Scope Files/DISCORD_MIGRATION_FEASIBILITY_STUDY_2026-06-19.md`.
- The wake-filter LIVE file `C:\Users\kyleg\.claude\cc-wake-filter.py` was edited (added cc-discord-inbox path match) — additive, Telegram unaffected.

**CN SHELL-SWAP = COMPLETE.** Moniker on `f9ed24c3` (roster `b5a5ae238`, 7f66d970 RETIRED). CLEANUP PENDING (CC-A housekeeping): delete old `7f66d970` transcript + intermediate seeds (`SEED_1WEEK`/`SEED_2WEEK`/`TRIMMED2`), KEEP `7f66d970…BACKUP-20260619b-pre-reprune` (311MB safety).

### CLAUDE NEW SHELL-SWAP — IN PROGRESS (the ACTIVE task)
- CN's old session (`7f66d970`) was STUCK (311MB rendering freeze; yesterday's 309MB prune too gentle). Kyle decided to SWAP CN's shell to a fresh session (he believes the old shell is damaged — though see the 1M note, the "damage" symptom is likely just the cosmetic 1M-dropdown quirk + size).
- **New session Kyle created = `f9ed24c3-9a40-4fa7-a9c4-f6c479801602`** ("Awaiting instructions").
- I RE-HOMED a 196MB seed (last week, since 2026-06-12, + ALL 116 compaction summaries) into `f9ed24c3`: re-stamped every entry's `sessionId` → f9ed24c3, dropped 7922 old custom-title entries, validated (0 bad JSON, 0 dangling, all sessionId correct). DONE.
- **Health check on f9ed24c3 PASSED:** files open (CLAUDE.md + MEMORY.md + MEMORY_CC_B.md), oriented (correctly recalled CN's recent work — memory split, pruning me, the audit reversal, both-classes plan, reorg-B1 next), responsive (no freeze / no can't-send). **The stuck-UI is FIXED on the new shell — the transplant works.**
- ★OPEN DECISION (awaiting Kyle): the 196MB seed loads ~865k tokens = **87% context (too heavy)** + 196MB file still near the freeze-zone. I RECOMMENDED a quick re-seed to **~69MB** (all 116 summaries + last ~2.5 days = since 2026-06-17; re-stamped to f9ed24c3) → ~30% context, durable headroom. Kyle picks: re-seed-69MB (my reco) vs accept-196MB + transfer-moniker now.
- PENDING after the seed decision: **TRANSFER the "Claude New" moniker to f9ed24c3** — update `(repo)/.claude/cc-session-roster.json` CC-B `session_id` `7f66d970` → `f9ed24c3`; then the new shell runs session-start (re-arm watcher as CC-B, §10.5 alerts, roster-bind) + picks up **reorg-B1** (the old B6.5f re-scoped to cover BOTH crypto + xStock symbol-recognition completeness).
- Backups/seeds: `7f66d970…BACKUP-20260619b-pre-reprune` (311MB full), `f9ed24c3…ORIG-tiny` (new session's original 36KB). Seeds built: `…SEED_1WEEK`(196MB, currently live in f9ed24c3), `…TRIMMED2`(69MB, Jun17), 135MB(Jun15 cutoff), `…SEED_2WEEK`(303MB).

### 1M MODEL QUESTION (Kyle, VERIFYING via docs)
A BRAND-NEW session ALSO shows no "Opus 4.8 1M" dropdown option but hovers as 1.0M context. Kyle's hypothesis: **1M is now the DEFAULT (no 200K option)** → that fully explains the non-issue. Checking Anthropic/Claude docs (claude-code-guide). If confirmed: everyone's on 1M by default, the dropdown just doesn't distinguish — NO reinstall needed; the "damage" theory for CN is mostly the rendering-bug-from-size, not a defect.

### MY GOVERNANCE (done earlier today — landed)
B-XSTOCK-GLOBALS CLOSED + B-GOV-2 activated-in-shadow-but-PAUSED (both pushed `b1453d22b`). Memory-split done + pushed (`dff806803`). I was pruned 457MB→17MB (works great). Sync 0/0.

## ★ NEXT ACTIONS (CC-A queue)
1. **B-DISCORD: awaiting Kyle's bot/token setup** → then deploy (parallel) + 7-test battery + switch. Re-review bmtuv5y59 in flight. (See top block.)
2. B-GOV-2 clean re-activation: 2 §13 follow-ups (seed `GOVERNANCE_EXCEPTIONS.md` + shadow-surfacing fix) → re-enable shadow → go-live. Langston Step-8 for both closed batches. (Checker timer currently inactive/disabled — confirmed this session.)
3. xStock guardrail-tripwire §13 follow-up (centralized witness in `registerOpenVtsTrade`).
4. CC-A housekeeping: prune old `7f66d970` transcript + intermediate seeds (keep BACKUP-20260619b).
5. (DONE) CN shell-swap; (DONE) 1M-default question — confirmed 1M is the Opus 4.8 default, no reinstall.

## ★ PRUNE / SHELL LEARNINGS
- Prune AGGRESSIVELY: target ~20-70MB (my 17MB fine; 195MB = 87% context too heavy; 311MB = stuck). 200MB+ too big for a durable light shell.
- Runbook `1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md`; scripts `memory/trim_transcript.py` (aggressive) + `distill_transcript.py` (safe). Re-home = set `sessionId` per entry to the new UUID + drop `custom-title` entries; session must be ARCHIVED (released) during the file swap; filename+sessionId match → loads (proven on f9ed24c3); picker metadata may lag (cosmetic).

## ★ KEY CONTEXT (still live; detail in `_scratch_xstock_globals_resume.md`)
- FEE REALITY: Kraken July-9 Tier1 = 0.40% maker / 0.80% taker = our model (correct). No US-person-accessible exchange escapes it. Strategy modeled for ~0.10%. → don't switch; adapt (maker + bigger targets ≥3.5-4% + AoP tier-climb).
- TRADING-APPROACH 3-way: CC-A + Langston converged; **Kyle told CN to proceed with its+Langston decision — I do NOT owe a concur/fee-post.**
- CN carries the both-classes Phase-19 plan + reorg-B1 next; the active-pipeline audit is done (Langston-approved).
