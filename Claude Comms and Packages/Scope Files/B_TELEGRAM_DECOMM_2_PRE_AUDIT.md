# B-TELEGRAM-DECOMM-2 — Pre-Implementation Audit (#351 + #107)

change-class: non_architecture

## Blast radius (verified by direct reads + greps, 2026-07-02)
- **One file:** `scripts/system-alerts.ts`. The deleted symbols are self-contained:
  - `formatAlertText` — sole caller `pushToTelegram:175` (Discord uses its own `formatAlertTextDiscord:200`). Dies cleanly.
  - `telegramSend` — sole caller `pushToTelegram`. `readTokenFile` — sole caller `pushToTelegram:173`. Consts `:69-71` — sole callers the two above.
  - `shellSingleQuote:294` — sole caller `invokeLangstonForAlert:330`.
  - `ALERT_DISCORD_ISOLATION:79` — 4 references, all gates on the legs being deleted (`:402`, `:404`, `:417`, `:419`).
- **Call sites to edit:** `cmdFireDue` fire loop (`:402-404` → `pushToDiscord` only) + the resurface sink (`:415-420` → `dc` only) + the dead-channel warning text (`:431`).
- **Untouched:** `pushToDiscord`/`discordWebhookSend`/`formatAlertTextDiscord`; `frameResurface` + `processResurface` (`server/services/system-alerts.ts` — the closure guarantee); all other subcommands (`add`/`ack`/`resolve`/`list`).
- **Tests:** no unit test exercises the script's Telegram legs (`system-alerts-dedup.test.ts` etc. test the service, not the dispatcher sinks). tsc-baseline + full vitest on the bench is the gate.
- **SIM:** the §10.5 alert fabric rows list the dispatcher sinks (Telegram + Discord + Langston-invoke) — CONTENT update to Discord-only; B-ALERT-PROTOCOL sink note likewise. No engine component touched.

## Runtime/infra dependencies
- **Langston alert engagement:** carried entirely by the Discord alerts webhook (`webhook_id` always-engage, #332 live-verified). The SSH-invoke leg has been suppressed by `ALERT_DISCORD_ISOLATION=1` since 2026-06-24 — so the code being deleted has been dead-in-production for 8 days with alert triage demonstrably working over Discord throughout (e.g. the 06-29 `tec_selfheal_verify` fire→Langston-resolve in 2 min; the 07-02 bake-check alert cycle).
- **Helsinki `langston-alert-handler.sh`:** orphaned once `invokeLangstonForAlert` goes (sole invoker). Archive + remove per rule 18.
- **Staging drop-in** `system-alerts-dispatcher.service.d` (`ALERT_DISCORD_ISOLATION=1`): removed AFTER the deploy (ordering matters — removing it before deploy would resume Telegram posts to a dead channel for one tick window).
- **`/var/log/langston-alert-invokes.log`:** left in place (frozen; wake-watcher tail harmless) — listed as left-intentionally.

## Risks + mitigations
- **R1 (ordering):** drop-in removed before deploy → dispatcher posts to dead Telegram briefly. Mitigation: deploy first, drop-in second (scope obj-2 ordering is explicit).
- **R2 (resurface delivery):** with one sink, a Discord webhook outage means `delivered=false` → back-off correctly does NOT advance and the loud dead-channel warning fires — the #340 guarantee already handles single-sink degradation. No change needed; verified in `processResurface` semantics.
- **R3 (deploy queue):** single-file, no migration; deploy wrench called in-channel, sequenced around CC-B's B7.2c.
