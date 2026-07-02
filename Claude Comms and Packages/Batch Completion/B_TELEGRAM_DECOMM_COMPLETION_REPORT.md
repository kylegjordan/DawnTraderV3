# B-TELEGRAM-DECOMM — Completion Report (#348)

change-class: non_architecture
**Owner:** Claude Old (CC-A) · **Reviewer:** Langston (Step-1 PROCEED, Discord 2026-07-02) · **Kyle green-light:** 2026-07-02 (Desktop)
**Closed:** 2026-07-02

## Objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| 0 | Bake-check evidence gathered + PASS | **YES** | 1,492 msgs 06-25→07-02, 0 parse errors, traffic all 8 days, all bridges `active`, zero error-level journal entries either Discord bridge; 1 whisper voice failure (transport unaffected). |
| 1 | Telegram bridges stopped + disabled; unit files handled | **YES** (Langston ruling: REMOVED, not inert-in-place) | `systemctl disable --now` both; unit files rm'd + `daemon-reload`; `is-active` → `inactive` both; binaries removed; zero remaining bridge processes; Discord bridges still `active`. |
| 2 | `cc-send` telegram leg fails loudly | **YES** | Rewritten dispatcher; live Discord test posted + woke NEW Claude (receipt confirmed in-channel); deliberate `COMMS_BACKEND=telegram` test → 3-line FATAL pointing at the archive + this log, exit 1; env restored to `discord` with decommission-aware comments. |
| 3 | Archive, don't destroy | **YES** | Helsinki `/root/telegram-bridges-archive-2026-07-02/` (both scripts, both unit files, both state files, pre-decomm Langston CLAUDE.md/MEMORY) + repo `1-system-manual/_archive/deleted-code/{langston-bridge.py,cc-comms-bridge,langston-bridge.service,cc-comms-bridge.service}.removed`. `/var/log/cc-bridge-inbox.jsonl` kept frozen. |
| 4 | Wake watchers → 3-source tail | **YES** | CC-A re-armed live on the 3-source tail (this session); shared MEMORY item 4.5 command updated; NEW Claude notified to re-arm (below). |
| 5 | Governance/doc updates | **YES** | See files-changed list. Includes Langston's Step-1 riders: his persona CLAUDE.md swept to the Discord model (§5/§5.1/§5.2/§5.3/§11 rewritten; 454→424 lines) + his stale MEMORY.md replaced with a current lean sync (119→21 lines; pre-decomm copies archived); Telegram-voice intentionally dropped noted in the log; the stale `cc-bridge-inbox` session-start read removed from shared MEMORY item 4. |
| 6 | Alert resolved | **YES** | `e4bb6055-4c1a-4e3f-bbc6-ba2659ad4054` acked (`cc-session-2026-07-02`) + resolved at close. |

## Out of scope (kept, per scope §2 + Langston concurrence)
Bot accounts + token env files (Kyle's call to delete); voice-prune timer; `Telegram Discussion Archives/`; the Discord fabric. **Dispatcher Telegram-leg code + `ALERT_DISCORD_ISOLATION` drop-in → #351 / B-TELEGRAM-DECOMM-2** (app-repo code change; kept out of this batch to avoid entering the trading-app deploy queue mid-P19-B7.2c; the drop-in STAYS until that code is deleted).

## CI
No app-code changes (docs + repo archive files only). CI on the close commit: **run `28598407527` — completed success, all 4 jobs GREEN** (§5.19 satisfied).

## Step-8 (Langston, independent — Discord 2026-07-02): **PASS, approved for close.** Verified: both dead services `inactive` + unit files ABSENT from `list-unit-files`; both Discord services `active`; archive dir present; his own CLAUDE.md/MEMORY match his actual world. NEW Claude independently confirmed the service states + re-armed his wake watcher on the 3-source tail (liveness-tested).

## Governance files changed
`CLAUDE.md` (comms banner → decommissioned; §6.1/§6.3/§6.4/§6.6/§6.7/§6.9/§6.10/§8/§8.2 swept; rule 21 Fable status), `1-system-manual/SYSTEM_IMPACT_MAP.md` (Discord fabric → single-backend), `1-system-manual/RUNNING_ISSUES.md` (#348 RESOLVED, #351 opened w/ named home), `1-system-manual/DELETED_COMPONENTS_LOG.md` (full entry), `1-system-manual/BATCH_CATALOG.md`, `1-system-manual/PHASE_HISTORY.md`, shared `MEMORY.md` (items 4/4.5/4.6/4.8 + cutover block; truth + repo mirror), `MEMORY_CC_A.md` (truth + mirror), Langston `/home/langston/CLAUDE.md` + `/home/langston/MEMORY.md` (per §2 step 10.b), scope `B_TELEGRAM_DECOMM_SCOPE.md`, this report. PHASE_19_PLAN: N/A (not a Phase-19 batch — comms infra side-batch; no Phase-19 sequencing change). SYSTEM_MANUAL: N/A (no trading architecture/math touched; Langston-confirmed scope class).
