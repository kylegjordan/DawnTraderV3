# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- Archived 2026-11-14 · claude-return-2026-11-13 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-14 · state-2026-11-13-kd76-kd77-deploys → `1-system-manual/pm/archive/memory/2026-11.md`
- **NOW (11-14):** On Claude since 11-13 13:15Z (Langston on, Coltrane off; handover `pm/handovers/2026-11-13_codex-to-claude.md`). KD-76 SBT xStock stays ON; KD-77 done (7 closed, net -$0.16). Joint deploys live: 77f6fd598 (restart 698), 9591ba8c2 11-14 01:40:58Z (restart 699). PENDING KYLE: B-ALERT-INSERT-CONTRACT timing, owner NEW, group rec settled; PM rec after B-ENTRY-GATE inc B; slot-check `pm/slot-checks/20261113T134659Z_CC-B_b-alert-insert-contract-make-alertsservi.md` UNCOMMITTED (commit with the KD row). Weekend: Infra 166b follow-up 2 after Mon 01:00Z (alert fe5b5abd 11-16 01:30Z), then NEW brings weekend-posture rec to Kyle. NEW inc 0 forced-carrier read Mon >=01:35Z. OLD 3a deploy Saturday after NEW+ANALYST finish checking 9591ba8c2, not Mon 01:00-01:35Z. Full prior state: archive ids claude-return-2026-11-13, state-2026-11-13-kd76-kd77-deploys.
- **11-14 02:33Z guard:** usage 22%. ANALYST CLOSED B-CRON-MISSED-CATCHUP 398977e43. OLD 3a Step-4 PROCEED adeec7b69 (deploy Sat after NEW+ANALYST checks). Nudge 1 sent to NEW (idle since 01:44Z) and Infra (idle since 01:42Z), logged in STALL_AND_DRIFT_LOG; NEW cleared (working; row 52 also needs O3, waits on entry-gate inc A). Infra cleared (Step 6-9 commits). 03:03Z nudge 1 to OLD (idle since 02:08Z); 3a deploy after NEW posts its 05:45Z read.
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
- **FOR KYLE'S SMALL-ITEMS BUNDLE (Infra orders 10-18, all 'waiting on Kyle'):** Langston find via NEW 01:3xZ (Discord 1568075945611624621): alert Discord posts put the alert id at the END and cut at 1,900 chars, so 162/3,529 posts lost their id (55 reached Langston as escalations); fix = id first, cut the body (scripts/system-alerts.ts:101/:103, frameResurface:179). Rec: fold into B-ALERT-LANE-LEDGER-OWNER (Infra order 15). Bring the bundle with a slot check.
- Archived 2026-11-11 · staging-signin-cleared → `1-system-manual/pm/archive/memory/2026-11.md`
- **FOR KYLE (morning):** INFRA candidate (msg 1568443912085835799): add the Apr-Jul crew conversations (646 files, 2.2 GB, old shared store copy) to the searchable archive? Langston: Kyle's call, not a blocker; cost = possible duplicates, sorting is a new plan item. GROUP REC (INFRA+Langston): (b) yes AFTER live, written on PRE_LIVE_SPRINT.md as a proposal; leg 1 read-only overlap count (hours), leg 2 single-copy dedup (own scope) only if overlap is big; before live it would push back row 6 + Infra 5/12/10/10a. Needs Kyle's yes; PM agrees.
- Archived 2026-11-07 · completed-joint-deploy-and-restart-alert → `1-system-manual/pm/archive/memory/2026-11.md`
- **PENDING KYLE (asked 11-07 ~20:0xZ): BOOT-RACE.** Reassign row 172 B-TEC-PRIME-BOOT-RACE (#1053, Kyle-agreed, Infra, queued 09-12) to NEW + run right after B-ENTRY-GATE inc B deploys, fold CC-C's 3n.c boot half (CC-C agreement asked). Group rec NEW+Langston+Coltrane; PM agrees. Slot-checks 1-system-manual/pm/slot-checks/20261107T194915Z_CC-B_* + 20261107T195006Z_CC-INFRA_* (UNCOMMITTED - commit with the KD row). Cost: NEW's next 3 items ~half a day; Infra none. On yes: KD row (placement) + plan row 172 owner/position + tell NEW/INFRA/ANALYST.
- **COMING TO KYLE (ANALYST, not tonight):** 8c (B-PRICE-SIDE-BY-JOB row 8c, crypto levels on real sided prices) deployed DARK in 5c3b14496, switch OFF. Switch-on waits on ANALYST's plain-language section 6(b) report to Kyle: ~4 in 10 of last month's crypto trades would be refused by the reward-to-risk floor on real prices. When it lands, PM brings it with the group's rec. ANALYST stood down 02:5xZ (Step-7 watch to ~04:00Z).
- Archived 2026-11-08 · historical-guard-and-pm-setup → `1-system-manual/pm/archive/memory/2026-11.md`
- **Pushing:** CI idle check as its own call; commit and push in SEPARATE calls.

- Archived 2026-11-04 · done-today-2026-11-04 → `1-system-manual/pm/archive/memory/2026-11.md`

# OPEN
- Archived 2026-11-04 · stale-local-session-ids → `1-system-manual/pm/archive/memory/2026-11.md`
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.

- Archived 2026-11-05 · historical-pm-log → `1-system-manual/pm/archive/memory/2026-11.md`
