# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **BACK ON CLAUDE (2026-11-13 ~13:15Z, PM Claude, one message from Kyle):** crew-switch CLAUDE, Langston on, Coltrane off, no open orders. Sheet `1-system-manual/pm/handovers/2026-11-13_codex-to-claude.md`. Notes copies: 4 of 5 matched the pushed copies; MEMORY_CC_C's outside copy (11:47Z, 33,397 B) was NEWER than the pushed one (33,000 B, older "Step 4 in progress" line), so NOT overwritten; ANALYST told to push it and prune (over cap). Woke OLD, NEW, ANALYST, Infra Claude (all delivered) pointing each at its sheet section; told all: NEW's 14:30-21:00Z window is deploy/restart-free. Re-enabled wake-watcher-heartbeat, daily-claude-currency-check, freshness-log-review; PM watcher re-armed; guard cron fcf23e8a (:17/:47) re-created. Claude usage 1% at 13:11Z, resets 11-19 23:00Z. All four picked up correctly (13:13-13:31Z). `pm-codex-crew-heartbeat` stays paused. Codex usage stop (KD-71) stays recorded: no Codex restart.
- **STATE 11-13 18:35Z:** KD-76 recorded (SBT xStock stays ON after FAIL; trades open >7d go into Infra's 166b weekend read, no close before Kyle decides). PENDING KYLE: B-ALERT-INSERT-CONTRACT (feed-health alert insert crash, 42 aborted checks / 6 of 14 days), owner NEW, group rec settled (Langston 13:54Z + 14:1xZ ruling (a), ANALYST agrees, Infra row 73 reverted 2455e6b50); slot-check `pm/slot-checks/20261113T134659Z_CC-B_b-alert-insert-contract-make-alertsservi.md` (UNCOMMITTED: commit with the KD row); PM rec = after B-ENTRY-GATE inc B. The 7 feed_integrity alerts RESOLVED by ANALYST 16:21Z (Langston kept re-triaging them to Kyle via the alert lane; his memory note did not stop it). JOINT DEPLOY TONIGHT: OLD runs one dt-deploy after NEW posts END capture (21:01Z), carrying OLD P-14b, ANALYST 1251fb8e4 (B-CRON Step 6), NEW inc B 9d903ea9c; each owner verifies its own piece. Staging PID 2307433 restart 697 unchanged through 18:31Z. Nudges logged in STALL_AND_DRIFT_LOG (all cleared). Lesson: check commits before calling a session stalled.
- **FRIDAY/WEEKEND PICKUP (KD-74/KD-75):** NEW must preserve the Nov. 13 14:30-21:00Z price-feed window without deploy/restart and capture both boundaries; Nov. 12 lacked evidence because Codex stopped before open, not because an interruption was proved. After the close, INFRA runs row 166b's bounded read-only xStock-slot/crypto-blocking historical read and hands it to NEW, which retains policy/implementation ownership. No close/cutoff is authorized. Any owner with an armed observation moves to its next independent recorded batch rather than idling.
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
