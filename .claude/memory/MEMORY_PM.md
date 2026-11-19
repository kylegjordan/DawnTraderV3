# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **KYLE 11-19 ~20:30Z (laptop clock = his time, UTC+1): keep building step by step while weekly <98%. At 98%: wait for 22:00Z (his 11pm), then one more step, stop just before 100% (extra usage is ON - never run into it). If stopped: set a wake for 23:00Z (his midnight = weekly reset); on waking, resume the crew per pm-usage-stop Resume (re-enable 4 tasks, crew-switch langston on, wake OLD/NEW/ANALYST/INFRA to re-arm + continue), then carry on with my batches (B-TOKEN-ECONOMY Steps 4-11, then B-WORKFLOW-IMPROVE).** Step 4 PROCEED (Langston 21:17Z, record Change Lists/B_TOKEN_ECONOMY_STEP4_REVIEW.md); his defects 1-4 fixed + ledger check blocking in CI. Midnight wake cron 26077fa3 set (00:03 local, session-only). NEXT: Step 5 CI, then read workflow-06 (deploy likely N/A: crew tooling, no app code).
- **USAGE STOP SENT 2026-11-16 ~19:45Z at 87% (Kyle: "If all are at a safe stopping point, then let's just stop for now.").** PAUSED (restore exactly this on resume): sessions OLD/NEW/ANALYST/INFRA told stop (OLD combined deploy NOT started; NEW 20:30Z read cancelled, re-run next US session); `crew-switch langston off` (bridge inactive/disabled, alert lane off; Coltrane already off); scheduled tasks disabled: wake-watcher-heartbeat, daily-claude-currency-check, freshness-log-review, transcript-bloat-check (cashflow-workbench-gardening NOT touched, other project); PM guard cron 6b575bdd deleted; PM wake watcher not re-armed. Resume only on Kyle word: re-enable those 4 tasks, crew-switch langston on, sessions re-arm watchers, recreate guard cron (90% line text, KD-99), re-arm PM watcher. Reset 11-19 23:00Z. Kyle deciding: wait / ChatGPT switch / ChatGPT upgrade.
- Archived 2026-11-16 · kd85-88-decided → `1-system-manual/pm/archive/memory/2026-11.md`
- **11-16 ~09:35Z Kyle (e0c304cc5):** KD-91 8c ON (DONE 09:45:01Z, first-week read alert c15fb88d 11-23 10:00Z; first real-price open gets Chrome check); KD-92 PM approvals bind crew (rule 6a; access keys/accounts/passwords/money still need his yes in acting chat - Backblaze key still needs his yes in OLD chat); KD-93 urgent ban root-cause NOW (Infra lead + OLD + Langston; incl. self-unban via mgmt API = Kyle token proposal); KD-94 two DB-outage items to NEW before live; KD-95 cron-stop design (ANALYST+Langston) + restart procedure (Infra+Langston+PM) delegated. STILL PENDING KYLE: Backblaze key yes in OLD chat; Infra index cost figures + Langston/Coltrane chats yes/no; transcript trims at next restart; small-items bundle.
- Archived 2026-11-19 · pointer-group-b → `1-system-manual/pm/archive/memory/2026-11.md`
- **DESKTOP COMPUTER USE DISABLE TEST — ACTIVE, DO NOT RESTORE WITHOUT KYLE (2026-11-12):** Both desktop Computer Use plugins remain disabled; `notify = []` and `SKY_CUA_NATIVE_PIPE_DIRECTORY = ""`; Browser and Chrome remain enabled. The Codex desktop host relaunched its Swift helper despite those settings. Kyle directed PM to leave the app running, leave the plugins disabled, and stop trying to kill the helper while the test continues. Non-UI work continues and staging checks are browser-scoped only. Exact restoration material: `C:\Users\kyleg\.codex\config.toml.computer-use-test-20261112T012821Z.restore.txt`.
- Archived 2026-11-19 · pointer-group-a → `1-system-manual/pm/archive/memory/2026-11.md`
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

- Archived 2026-11-16 · nudge-11-16-1131z → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · kd-96-db-tool-recorded → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · kd-100-db-security-recorded → `1-system-manual/pm/archive/memory/2026-11.md`

- **Small-items bundle +1 (ANALYST 11-16 ~16Z):** Settings "config snapshot" view 500s (route calls removed storage.getPortfolioBalance; repoint vs remove undecided). Not paper/VTS. Bundle ids in archive 2026-11: small-items-bundle-1/2-pending-kyle.

- Archived 2026-11-16 · nudge-11-16-1623z → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · usage-87-safe-stop-superseded → `1-system-manual/pm/archive/memory/2026-11.md`

- **B-TOKEN-ECONOMY STEP: 11 of 11 DONE — IN OBSERVATION (not complete).** Pushed c8b07e21f (progress report) + 9ee51c2d9 (Step 10). Langston memory pointer :113 (his set 5 B under ceiling). Board card -> Observation. Close waits: OBJ-2 (each session reads contextWindow 250000 at resume), OBJ-3 (Codex canary), P6 flip (--verify PASS >=50, check_failed 0/explained, separate commit, re-dispatch Langston). #1261 = decision for Kyle (proposed: CC-INFRA test repair after resume). NEXT: B-WORKFLOW-IMPROVE after reset.

# OPEN
- Archived 2026-11-04 · stale-local-session-ids → `1-system-manual/pm/archive/memory/2026-11.md`
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.

- Archived 2026-11-05 · historical-pm-log → `1-system-manual/pm/archive/memory/2026-11.md`
