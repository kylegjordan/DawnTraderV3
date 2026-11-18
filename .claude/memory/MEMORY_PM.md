# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **USAGE STOP SENT 2026-11-16 ~19:45Z at 87% (Kyle: "If all are at a safe stopping point, then let's just stop for now.").** PAUSED (restore exactly this on resume): sessions OLD/NEW/ANALYST/INFRA told stop (OLD combined deploy NOT started; NEW 20:30Z read cancelled, re-run next US session); `crew-switch langston off` (bridge inactive/disabled, alert lane off; Coltrane already off); scheduled tasks disabled: wake-watcher-heartbeat, daily-claude-currency-check, freshness-log-review, transcript-bloat-check (cashflow-workbench-gardening NOT touched, other project); PM guard cron 6b575bdd deleted; PM wake watcher not re-armed. Resume only on Kyle word: re-enable those 4 tasks, crew-switch langston on, sessions re-arm watchers, recreate guard cron (90% line text, KD-99), re-arm PM watcher. Reset 11-19 23:00Z. Kyle deciding: wait / ChatGPT switch / ChatGPT upgrade.
- Archived 2026-11-16 · kd85-88-decided → `1-system-manual/pm/archive/memory/2026-11.md`
- **11-16 ~09:35Z Kyle (e0c304cc5):** KD-91 8c ON (DONE 09:45:01Z, first-week read alert c15fb88d 11-23 10:00Z; first real-price open gets Chrome check); KD-92 PM approvals bind crew (rule 6a; access keys/accounts/passwords/money still need his yes in acting chat - Backblaze key still needs his yes in OLD chat); KD-93 urgent ban root-cause NOW (Infra lead + OLD + Langston; incl. self-unban via mgmt API = Kyle token proposal); KD-94 two DB-outage items to NEW before live; KD-95 cron-stop design (ANALYST+Langston) + restart procedure (Infra+Langston+PM) delegated. STILL PENDING KYLE: Backblaze key yes in OLD chat; Infra index cost figures + Langston/Coltrane chats yes/no; transcript trims at next restart; small-items bundle.
- Archived 2026-11-16 · kyle-0130z-kd89-90 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · kyle-2320z-2026-11-15 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · kd81-84-decided-2026-11-15 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · kyle-questions-2026-11-15 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · now-2026-11-15-1500 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-14 · claude-return-2026-11-13 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-14 · state-2026-11-13-kd76-kd77-deploys → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-15 · now-2026-11-14 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-15 · guard-log-2026-11-14 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-14 · friday-window-kd74-kd75 → `1-system-manual/pm/archive/memory/2026-11.md`
- **DESKTOP COMPUTER USE DISABLE TEST — ACTIVE, DO NOT RESTORE WITHOUT KYLE (2026-11-12):** Both desktop Computer Use plugins remain disabled; `notify = []` and `SKY_CUA_NATIVE_PIPE_DIRECTORY = ""`; Browser and Chrome remain enabled. The Codex desktop host relaunched its Swift helper despite those settings. Kyle directed PM to leave the app running, leave the plugins disabled, and stop trying to kill the helper while the test continues. Non-UI work continues and staging checks are browser-scoped only. Exact restoration material: `C:\Users\kyleg\.codex\config.toml.computer-use-test-20261112T012821Z.restore.txt`.
- Archived 2026-11-12 · kd67-resolved-nudges-2026-11-12 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-init-alert-6ced8e12 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-alert-routes-2026-11-12 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-init-alert-63b1a778 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-init-alert-9683dfa8 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-init-alert-11656b30 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · codex-usage-stop-kd71-2026-11-12 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-analyst-memory-zero-20261112 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd73-claude-return-handover → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · kd67-old-governance-alerts-2026-11-11 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · archive-pointers-2026-11-a → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · kd67-new-browser-handoff-2026-11-11 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · kd67-alert-routes-2026-11-11-evening → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · kd67-alert-routes-1124-cleared → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-10 · old-weekly-alert-nudge-2026w46 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · archive-pointers-2026-11-b → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-09 · completed-pm-build-record → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-09 · codex-takeover-2026-11-09 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-06 · stale-pm-planning-notes → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · small-items-bundle-1-pending-kyle → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · small-items-bundle-2-pending-kyle → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · staging-signin-cleared → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · aprjul-archive-ask-superseded-kd83 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-07 · completed-joint-deploy-and-restart-alert → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · bootrace-ask-decided-kd82 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · 8c-dark-coming-superseded → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-08 · historical-guard-and-pm-setup → `1-system-manual/pm/archive/memory/2026-11.md`
- **Pushing:** CI idle check as its own call; commit and push in SEPARATE calls.

- Archived 2026-11-04 · done-today-2026-11-04 → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · nudge-0131-cleared → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · nudge-0201-cleared → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · nudge-0231-cleared → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · outage-resolved-0520z → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · nudge-0801-withdrawn → `1-system-manual/pm/archive/memory/2026-11.md`

- **FOR KYLE LIST (Infra 11-16 ~08:35Z, Discord 1571809848444584037):** B-TOKEN-WATCH-PACED-LIQUIDITY proposed after live (Infra): token study suspended pool-liquidity reads (AMENDMENT 18, credits); paced daily budget would restore part; primary outcome unaffected. Kyle may want sooner or paid. Birth-cap at Step 4 with Langston.

- Archived 2026-11-16 · nudge-0931-census-done → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · kd93-cause-found → `1-system-manual/pm/archive/memory/2026-11.md`

- **NUDGE 11-16 11:31Z:** NEW - CLEARED: started row 9j Step 1 (pool-fix scope), pausing for PFC readings 14:45Z/20:30Z.

- **11-16 ~12:35Z Kyle (b785d8714):** KD-96 DB query tool NOW, interrupts birth-cap (Infra told; flag if ~11-19 at risk); KD-97 #705 retry fix now by OLD (told; out of NEW row 119); KD-98 sessions may verify KD rows in PM transcript (rules 6a). Backblaze key still needs his yes in OLD chat.

- **11-16 ~17:30Z Kyle:** KD-100 3 DB security items YES (869c3c3ed; OLD TLS fold into POOL-GUARD, cert DOWNLOADED by Kyle 11-16 ~18:57 local: C:SERSKYLEGDOWNLOADSPROD-CA-2021.CRT (OLD TOLD); Infra role->helper-retire); KD-101 B-DB-MAP Infra before live after role, before helper-retire (564884387; PM ruled on Kyle delegation). Backblaze key DONE 12:57Z (OLD). USAGE: KD-99 90% line (cron 6b575bdd). CERT DOWNLOADED by Kyle ~18:57 local: Downloads/prod-ca-2021.crt (OLD told).

- **Small-items bundle +1 (ANALYST 11-16 ~16Z):** Settings "config snapshot" view 500s (route calls removed storage.getPortfolioBalance; repoint vs remove undecided). Not paper/VTS. Bundle ids in archive 2026-11: small-items-bundle-1/2-pending-kyle.

- **NUDGE 11-16 16:23Z:** NEW - WITHDRAWN: 9j Step 2 done (Langston PROCEED x2, 1c2ac6a4f); Step 3 waits B-ENTRY-GATE close by design (KD-87); only PFC C-1 END read 20:30Z left today. MISTAKE: stall-misread.

- **USAGE 87% @ ~18:23Z 11-16:** all four AT SAFE STOP (OLD 6a67e252e, combined deploy after 21:00Z only if room; Infra clean, birth-cap unattended; NEW 20:30Z PFC read or re-run next US session; ANALYST d2c30001a, timed reads 11-17/18/21/23). At 90% run pm-usage-stop (guard cron 6b575bdd).

- **B-TOKEN-ECONOMY proposal (11-18, PM, Kyle-asked 11-17):** Scope Files/B_TOKEN_ECONOMY_PROPOSAL.md. Key: cap live context (autoCompactWindow ~250k, idleCompaction off), slim CLAUDE.md 123KB, changes-only alert hook, alert nag volume, subagents Sonnet, heartbeat->script, PM pacing governor. Owner PM, Langston review. Awaiting Kyle: approve + apply A before Langston back?

# OPEN
- Archived 2026-11-04 · stale-local-session-ids → `1-system-manual/pm/archive/memory/2026-11.md`
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.

- Archived 2026-11-05 · historical-pm-log → `1-system-manual/pm/archive/memory/2026-11.md`
