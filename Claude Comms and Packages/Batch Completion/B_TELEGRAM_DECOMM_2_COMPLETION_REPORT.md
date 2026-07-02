# B-TELEGRAM-DECOMM-2 — Completion Report (#351 + #107)

change-class: non_architecture
**Owner:** Claude Old (CC-A) · **Reviewer:** Langston (Step-1 PROCEED w/ 2 riders + Step-4 APPROVE-to-push, Discord 2026-07-02) · **Kyle green-light:** 2026-07-02 ("clean up the rest of the Telegram steps")
**Closed:** 2026-07-02 (same-day)

## Objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Delete the dispatcher's Telegram legs from `scripts/system-alerts.ts` | **YES** | Commit `21c080208` (253-line diff: 23+/230−). Removed: `pushToTelegram`/`telegramSend`/`readTokenFile`/`formatAlertText` + `KYLE_DM_CHAT_ID`/`TELEGRAM_GROUP_CHAT_ID`/`TELEGRAM_BATCH_THREAD` (**#107 resolved by deletion**) + `invokeLangstonForAlert`/`shellSingleQuote` + the `ALERT_DISCORD_ISOLATION` gate. Fire + resurface sink = `pushToDiscord` alone. Grep-clean of live Telegram refs (history pointers only). |
| 2 | Isolation drop-in removed AFTER deploy | **YES** | `discord-isolation.conf` removed + `daemon-reload` post-deploy (ordering per pre-audit R1); dispatcher timer `active`. |
| 3 | Helsinki `langston-alert-handler.sh` archived + removed | **YES** | Copied to `/root/telegram-bridges-archive-2026-07-02/` + repo `_archive/deleted-code/langston-alert-handler.sh.removed`; original removed. |
| 4 | Verification | **YES** | Bench: tsc-baseline no regressions; vitest **2,122 passed / 0 failed** (9 file-collect failures = the known pre-existing no-local-test-db set). CI **4-green run `28610184140`**. Deployed `21c080208` restart#430, HTTP 200. **Live end-to-end:** test alert `72fafa61` fired → `[fire-due] Discord alert posted` (ZERO Telegram attempts) → Langston always-engage triage in **12 seconds** → resolved `--by cc-session-2026-07-02`. Deploy wrench called in-channel; NEW Claude cleared (B7.2c pre-Step-4, nothing pending). |
| 5 | Governance | **YES** | Files-changed list below. |

## Langston's 2 Step-1 riders — dispositions
1. **info-severity parity:** verified NO behavior change — `pushToDiscord` already gates `warning|critical` post / `info` skips (byte-for-byte the old Telegram routing tiers minus the critical-DM split, which was Telegram-specific). Noted here per his ask.
2. **Sole-sink WARNING text:** the undelivered-branch console text reworded to name the Discord webhook as the sole push sink; the #340 no-advance-on-no-delivery semantics unchanged (a Discord outage does not consume the re-surface window).

## Governance files changed
`scripts/system-alerts.ts` (the change), `1-system-manual/RUNNING_ISSUES.md` (#351 + #107 RESOLVED), `1-system-manual/DELETED_COMPONENTS_LOG.md` (entry), `1-system-manual/BATCH_CATALOG.md`, `1-system-manual/PHASE_HISTORY.md`, `1-system-manual/_archive/deleted-code/langston-alert-handler.sh.removed`, scope + pre-audit (`B_TELEGRAM_DECOMM_2_{SCOPE,PRE_AUDIT}.md`), this report, `MEMORY_CC_A.md` (truth + mirror). SIM: the alert-fabric sink note was already updated to Discord-only in the parent batch's sweep (single-backend section names `pushToDiscord` as the path); no further SIM component change (no component added/removed at the SIM grain — the dispatcher row's sink list is the parent-batch text). SYSTEM_MANUAL: N/A (no trading architecture/math). PHASE_19_PLAN: N/A (comms infra side-batch).
