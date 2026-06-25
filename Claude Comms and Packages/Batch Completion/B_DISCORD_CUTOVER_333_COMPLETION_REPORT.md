# B-DISCORD-CUTOVER (#333) — Completion Report

**Owner:** OLD Claude (CC-A). **Closed:** 2026-06-25. **change-class:** non_architecture (comms-infra / governance — the Telegram→Discord backend switch + doc rewrite; no trading-engine/strategy/regime/signal-pipeline/math → **System Manual N/A**, **SIM applies**). **Reviewer:** Langston (Step-4, CONCUR after one CHANGES-NEEDED pass). **Source:** RUNNING_ISSUES #333 + `comms-infra/discord/TEST_AND_SWITCH_RUNBOOK.md`.

---

## Outcome: ✅ CLOSED + LIVE — Discord is the permanent comms channel; Telegram held as instant rollback

The permanent Telegram→Discord cutover is executed. `COMMS_BACKEND=discord` in `/etc/dawntrader/comms-active.env`; all CC outbound (`cc-send` + the §10.5 system alerts) and the Langston bot-to-bot exchange now run natively on Discord `#general`. Telegram bridges are left running as a one-line lossless rollback until a dated bake (#348) retires them.

## Why this was safe to switch now
Kyle made the cutover call after a Discord-isolation test window (B-GOV-3 + reorg-B2.1 ran Discord-only, zero Telegram, to prove Discord stands alone). The decisive capability — native bot-to-bot — was re-proven live at switch time: Langston's Discord bridge received CC's bot post and replied in-channel during this batch (the Step-4 review round-trip itself is the proof).

## Objectives + evidence

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Flip the backend switch | ✅ | `COMMS_BACKEND=discord` written to `/etc/dawntrader/comms-active.env` (comment header + rollback note restored). |
| 2 | Verify outbound routes to Discord end-to-end | ✅ | Posted through `cc-send` (the backend-routed dispatcher, NOT a direct bridge call) → landed in `#general` (`sent id=1519616921912475680`). Also updated the stale PATH `cc-send` (`/usr/local/bin/cc-send`) to the current version carrying `--sender` (backup `cc-send.bak-pre-cutover-20260625`). |
| 3 | Bot-to-bot live round-trip at switch time | ✅ | Langston's Discord bridge replied in-channel to CC's posts twice (cutover announcement + Step-4 dispatch). |
| 4 | Archive Telegram topic-21 searchable | ✅ | `Claude Comms and Packages/Telegram Discussion Archives/`: full human-readable `TOPIC_21_ARCHIVE_2026-05-06_to_2026-06-21_CUTOVER-FINAL.md` (658 entries, by-day), raw greppable `…_2026-06-25_CUTOVER-FINAL.jsonl`, and a `README.md` index naming the authoritative files + how to search. |
| 5 | Rewrite comms governance to the Discord-live model | ✅ | CLAUDE.md §6 intro + §6.3/§6.4/§6.5(legacy banner)/§6.6/§6.7/§6.9/§6.10 + §8; SIM "Discord Comms Fabric" → status LIVE/SWITCHED + Cross-Cutting dual-backend state; shared MEMORY.md session-start steps 4/4.5/4.6/4.8/5/5.5 + the SHARED CONSENSUS cutover line. |
| 6 | Crew aligned on the new workflow | ✅ | Discord `#general` post to NEW Claude + Langston: Discord is live, post here not Telegram, native bot-to-bot, wrench-claim on CLAUDE.md + shared MEMORY, NEW Claude to update its own MEMORY_CC_B.md. |
| 7 | Keep rollback intact | ✅ | Telegram bridges (`langston-bridge`, `cc-comms-bridge`) LEFT RUNNING (`systemctl is-active` = active). Rollback = `echo 'COMMS_BACKEND=telegram' > /etc/dawntrader/comms-active.env`. |
| 8 | Decommission given a concrete home (not "after a bake") | ✅ | RUNNING_ISSUES **#348** (B-TELEGRAM-DECOMM) + a LIVE dated §10.5 alert `e4bb6055-4c1a-4e3f-bbc6-ba2659ad4054` (triggers 2026-07-02T12:00:00Z, owner CC-A) firing the bake-check after a 7-day zero-rollback window, with the full teardown checklist. |

## The judgment call (surfaced, not silent): keep §6.5 vs delete it
The runbook said "retire the §6.5 SSH-deliver apparatus." I did NOT delete it — I reframed it as **LEGACY / rollback-reference** with a banner, because (a) it *is* the live CC↔Langston path the instant someone reverts to `COMMS_BACKEND=telegram`, and (b) the #339 decision was no-trim. Deletion is deferred to the #348 decommission batch (a named, dated home — not a vague deferral), logged at that time in `DELETED_COMPONENTS_LOG.md` per §5 rule 18. **Langston Step-4 CONCUR** on this disposition ("you don't delete the parachute while you're still wearing it").

## A real defect found + fixed in passing (wake-watcher reliability rule)
The documented post-compaction re-arm rule said "verify via `TaskList`, re-arm if absent." That is wrong: `TaskList` lists only TaskCreate todo items, **not** Monitor/background-bash tasks, so it always reads "absent" → a blind re-arm spawns a DUPLICATE Monitor that double-wakes. I hit exactly this on THIS session's post-compaction re-arm (the prior watcher had survived compaction; I armed a second; caught the doubled WAKE event and `TaskStop`'d one). Corrected in CLAUDE.md §6.9 (judge liveness from WAKE-event arrival + doubled-signature dedup) and §6.10 (cancel the blocked-notify timer via its returned task_id, not via TaskList), and in shared MEMORY 4.5. (Also noted: compaction USUALLY kills the watcher but did NOT this time — survival is nondeterministic.)

## Workflow (honest record)
Switch flipped + verified → bot-to-bot proven live → topic-21 archived → comms docs rewritten → **Langston Step-4 CHANGES-NEEDED** (CONCUR on both judgment calls; caught a missed stale-live sweep: §6.3 + the topic-21=primary line + §6.6 poll pointer still pointed at Telegram-as-live; a §6.9↔§6.10 TaskList self-contradiction; and the vague "after a bake" deferral) → 4 surgical fixes + #348 dated home + live bake alert → **Langston Step-4 CONCUR for push** → governance → push.

## Governance files changed
- `CLAUDE.md` (§6 intro/§6.3/§6.4/§6.5/§6.6/§6.7/§6.9/§6.10/§8 — Discord-live model)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` (Discord Comms Fabric → LIVE/SWITCHED + dual-backend Cross-Cutting state)
- `1-system-manual/RUNNING_ISSUES.md` (#333 RESOLVED; alert-isolation now steady-state; **#348** new dated decommission home)
- `1-system-manual/BATCH_CATALOG.md` (this batch row)
- `1-system-manual/PHASE_HISTORY.md` — **N/A** (phase status unchanged; comms-infra batch, consistent with how B-DISCORD / B-ALERT-PROTOCOL / B-LANGSTON-QUEUE were handled — none are phase rows). `PHASE_19_PLAN.md` also N/A (not a Phase-19 batch).
- `.claude/memory/MEMORY.md` (shared session-start → Discord) + `MEMORY_CC_A.md` (volatile state)
- Langston's `/home/langston/MEMORY.md` (§10.b sync — Discord-live)
- New: `Claude Comms and Packages/Telegram Discussion Archives/` (FINAL archive .md + .jsonl + README)
- **System Manual: N/A** (no architecture/strategy/regime/signal-pipeline/math touched — comms-infra only).

## Rollback (instant, lossless)
`echo 'COMMS_BACKEND=telegram' > /etc/dawntrader/comms-active.env` → CC outbound returns to Telegram immediately; the Telegram bridges were never stopped. (Full rollback note: also remove the `ALERT_DISCORD_ISOLATION=1` drop-in so alerts repost to Telegram — captured in #348.)
