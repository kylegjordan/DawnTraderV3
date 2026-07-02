# B-TELEGRAM-DECOMM-2 — Scope: strip the alert dispatcher's Telegram legs (#351, folds #107)

change-class: non_architecture

**Owner:** Claude Old (CC-A) · **Reviewer:** Langston · **Kyle green-light:** 2026-07-02 ("clean up the rest of the Telegram steps", after acking B-TELEGRAM-DECOMM)

## 1. Objectives
1. **`scripts/system-alerts.ts` — delete the Telegram legs** (currently suppressed by `ALERT_DISCORD_ISOLATION=1`):
   - `pushToTelegram` + `telegramSend` + `readTokenFile` + `formatAlertText` (markdown/plain formatter used ONLY by the Telegram push — the Discord path has its own `formatAlertTextDiscord`) + the `KYLE_DM_CHAT_ID`/`TELEGRAM_GROUP_CHAT_ID`/`TELEGRAM_BATCH_THREAD` consts. **This resolves #107** (the hardcoded `KYLE_DM_CHAT_ID`) by deletion.
   - `invokeLangstonForAlert` + `shellSingleQuote` (its only caller) — the Telegram-era Langston SSH invoke whose Helsinki handler relays to the dead topic 21. Langston's alert engagement is FULLY carried by the Discord alerts webhook (his bridge always-engages on `webhook_id` — B-DISCORD OBJ-5, live-verified #332), which is exactly why isolation mode already suppressed this with "closure coverage unchanged".
   - The `ALERT_DISCORD_ISOLATION` env gate itself (both fire-path call sites + the resurface sink) — delivery becomes `pushToDiscord` alone; the resurface `delivered` = the Discord sink. Update the dead-channel WARNING text (no more "Telegram+…").
   - Header/comment sweep of the file's Telegram-era narration (keep the B-NEW-43/#135 history as one-line pointers, not live instructions).
2. **Staging systemd drop-in removed AFTER deploy:** `ALERT_DISCORD_ISOLATION=1` drop-in on `system-alerts-dispatcher.service` becomes moot once the code has no gate — remove + `daemon-reload` + restart the timer's service.
3. **Helsinki: archive + remove `/usr/local/bin/langston-alert-handler.sh`** (orphaned once obj-1 lands; its whole purpose was claude-invoke + Telegram relay). Archive to `/root/telegram-bridges-archive-2026-07-02/` + repo `_archive/deleted-code/langston-alert-handler.sh.removed`; DELETED_COMPONENTS_LOG entry.
4. **Verification:** bench tsc-baseline + vitest green; deploy; fire a real test alert (`add` + `fire-due`) → Discord alerts webhook posts + Langston bridge engages (always-engage path) + owner-routing wake; ZERO Telegram sends in the dispatcher log; resolve the test alert.
5. **Governance:** RUNNING_ISSUES #351 + #107 RESOLVED; DELETED_COMPONENTS_LOG; BATCH_CATALOG; PHASE_HISTORY; SIM (alert-fabric sink list: Telegram legs removed — the §10.5 dispatcher row + B-ALERT-PROTOCOL sink note); completion report; MEMORYs.

## 2. Left intentionally
- `/var/log/langston-alert-invokes.log` + the wake-watcher tail of it — the log stays (frozen history; tail is harmless); removing the tail from both sessions' watchers is churn for zero gain. Noted so a later grep isn't read as a missed sweep.
- `CCDT_BOT_TOKEN_FILE` env mentions die with the code; the token files themselves stay (Kyle's bot-account call, unchanged).
- The re-surface framing (`frameResurface`) + `processResurface` closure guarantee — UNTOUCHED (only the sink list narrows to Discord).

## 3. Deploy coordination
App-repo code change → staging deploy required. **CC-B is mid-P19-B7.2c** — the deploy will be called in the channel ("I've got the deploy wrench") and sequenced so it never lands between CC-B's Step-4 approval and his own deploy. Single-file change, no migration.
