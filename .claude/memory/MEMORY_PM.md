# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **NOW (11-15 15:0xZ):** On Claude; usage 59% (resets 11-19 23:00Z). Decisions this weekend: KD-77 (7 xStock closes), KD-78 (NEW B-ALERT-INSERT-CONTRACT now), KD-79 (delete 2 Backblaze residue copies; OLD wants Kyle's yes typed in OLD chat), KD-80 (Data Archive estimate fix in B-DB-SIZE-RELIEF). Staging at 84eeb168e (11-15 11:05Z). PENDING KYLE: (1) KD-79 yes in OLD chat (blocks file-tiering 3d steps 3-4); (2) B-TOKEN-WATCH-PROMOTE-CURSOR (#1257, Infra) placement, slot-check pm/slot-checks/20261115T124348Z_CC-INFRA_* UNCOMMITTED, PM rec after live; (3) ANALYST 8c crypto real-price switch-on (PM+ANALYST rec yes) + Open Trades screen look; (4) trim OLD/NEW/ANALYST transcripts (283/273/366 MB) at next restart; plus older bundle items below. Lessons: before nudging read lastActivity + timers + local-held work; ask, don't assume. Langston bridge auto-restart 06:55Z (apt/needrestart) dropped queued reviews; fix folded into Infra B-AGENT-INVOKE-FAILURE-NOTICE. Prior detail: archive ids now-2026-11-14, guard-log-2026-11-14.
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
- **FOR KYLE'S SMALL-ITEMS BUNDLE (added 11-14 15:1xZ, NEW, Discord 1571178725607866461; Langston msg 1571178494883405876 ruled both decisions, not batch work):** (a) alerts table lacks the database user foreign key the code declares; 12 old alerts point at deleted users, so adding the key needs a cleanup choice first; (b) alert action-button route allows only the alert owner; after B-ALERT-INSERT-CONTRACT every alert is owned by one admin (test admin, not Kyle), and 0 of 5,904 alerts have buttons today. NEW proposes drop the check or make Kyle the owner. PM rec: both after live (PRE_LIVE_SPRINT), no trading effect. Detail: Scope Files/B_ALERT_INSERT_CONTRACT_PRE_AUDIT.md section C.
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
