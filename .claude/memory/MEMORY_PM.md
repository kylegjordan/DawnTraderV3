# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **DESKTOP COMPUTER USE DISABLE TEST — ACTIVE, DO NOT RESTORE WITHOUT KYLE (2026-11-12):** Both desktop Computer Use plugins remain disabled; `notify = []` and `SKY_CUA_NATIVE_PIPE_DIRECTORY = ""`; Browser and Chrome remain enabled. The Codex desktop host relaunched its Swift helper despite those settings. Kyle directed PM to leave the app running, leave the plugins disabled, and stop trying to kill the helper while the test continues. Non-UI work continues and staging checks are browser-scoped only. Exact restoration material: `C:\Users\kyleg\.codex\config.toml.computer-use-test-20261112T012821Z.restore.txt`.
- Archived 2026-11-12 · kd67-resolved-nudges-2026-11-12 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-init-alert-6ced8e12 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-alert-routes-2026-11-12 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-init-alert-63b1a778 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-12 · kd67-init-alert-9683dfa8 → `1-system-manual/pm/archive/memory/2026-11.md`
- **KD-67 ALERT ROUTE — 2026-11-12T09:42Z, ANALYST Codex:** routed fresh INIT/USD recurrence `11656b30-522c-4cbf-b45a-d60af7515160` during the B-CRON-MISSED-CATCHUP Step-3 repair loop. The direct message was accepted while ANALYST's turn was active; acceptance is not receipt. Await the visible `PM PRIORITY RECEIVED` and evidence-based disposition, then confirm the owner returned to its recorded repair step.
- **CODEX USAGE STOP LINE (KD-71, Kyle 2026-11-10): 92% of the weekly Codex allowance USED.** The latest read was 82% used at 2026-11-12T09:42Z; reset is 2026-11-18T08:22:24Z (09:22:24 Europe/Warsaw). The active PM heartbeat reads the account meter first. Below 92%, keep the crew moving. At or above 92%, run `pm-codex-usage-stop`, stop the four building chats, PM Codex, Coltrane and active Codex automations at safe boundaries, and keep them stopped through the reset. Do not use either available rate-limit reset credit. Resume remains governed by the skill's explicit Kyle-resume rule.
- **CLAUDE-RETURN HANDOVER — KD-73 (2026-11-12):** Coltrane agreed that the missing November 6 SBT/xStock-specific reputable-practice comparison is restored as `R-SBT-XSTOCK-PUBLISHED-BASELINE`, prerequisite to row 129 / 25-17 and any SBT xStock `min_rr` action in row 131 / 25-20. Preserve KD-57/O3, the live SBT observation and every setting; research may start after existing higher-priority work, but the verdict waits for the clean SBT window. Durable outgoing sheet: `1-system-manual/pm/handovers/2026-11-12_codex-to-claude.md`.
- Archived 2026-11-11 · kd67-old-governance-alerts-2026-11-11 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · archive-pointers-2026-11-a → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · kd67-new-browser-handoff-2026-11-11 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · kd67-alert-routes-2026-11-11-evening → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · kd67-alert-routes-1124-cleared → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-10 · old-weekly-alert-nudge-2026w46 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-11 · archive-pointers-2026-11-b → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-09 · completed-pm-build-record → `1-system-manual/pm/archive/memory/2026-11.md`
- **▶ PM HANDOVER (11-09, crew SWITCHED TO CODEX on Kyle's word, KD-63/64; order S3 20:32:08Z, PM typed the 4 stopped Claude receipts after checking; status CODEX, Langston off, no open orders. NEXT: check each Codex session's first post/commit names its batch+step from the sheet):** crew handover sheet `1-system-manual/pm/handovers/2026-11-09_claude-to-codex.md` (per-session open items, timed checks, held deploy, reviews Langston answered after the stop). PM Codex being built by OLD Codex (KD-62, brief steps 0-8); OLD Codex coordinates until it runs. Kyle items still open: row 172 boot-race yes/no (slot-checks uncommitted, commit with the KD row), Apr-Jul conversations (after-live rec), Chrome sign-in to staging, 8c switch-on report (ANALYST), #1201 pull-forward (asked, unanswered). Switch back after the 11-12 23:00Z reset is PM Codex's (or OLD Codex's if PM Codex is not ready). On switch back: re-enable the 3 paused tasks, Langston on (crew-switch does it), re-arm watchers, re-create guard cron.
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
