# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **KYLE 11-19 ~20:30Z (laptop clock = his time, UTC+1): keep building step by step while weekly <98%. At 98%: wait for 22:00Z (his 11pm), then one more step, stop just before 100% (extra usage is ON - never run into it). If stopped: set a wake for 23:00Z (his midnight = weekly reset); on waking, resume the crew per pm-usage-stop Resume (re-enable 4 tasks, crew-switch langston on, wake OLD/NEW/ANALYST/INFRA to re-arm + continue), then carry on with my batches (B-TOKEN-ECONOMY Steps 4-11, then B-WORKFLOW-IMPROVE).** Step 4 PROCEED (Langston 21:17Z, record Change Lists/B_TOKEN_ECONOMY_STEP4_REVIEW.md); his defects 1-4 fixed + ledger check blocking in CI. Midnight wake done. B-TOKEN-ECONOMY is IN OBSERVATION (see its line below). Weekly usage 3% at 11-19 23:50Z. ASKED KYLE in Desktop 11-19 ~23:50Z (awaiting): (a) restart the 4 sessions at next pause for the 250k window (OBJ-2), (b) this week's usage line (90% carried).
- **RESUMED 2026-11-19 23:0xZ after the weekly reset (usage 0%):** 4 scheduled tasks re-enabled; `crew-switch langston on` (bridge active/enabled); OLD/NEW/ANALYST/INFRA woken to re-arm + continue; PM watcher re-armed; guard cron 0257d520 (hourly :17, 90% line carried from KD-99 - Kyle may set this week's line).
- **11-20 laptop off ~03:35-07:17Z (Windows restart).** 07:20Z woke OLD/NEW/ANALYST/INFRA (re-arm, OBJ-2 read, resume); OBJ-2 250000 confirmed ALL FOUR: NEW, OLD, ANALYST self-read 07:3xZ; INFRA by my get_usage(session_id) 08:3xZ (its 966,823 prompt pre-dates its 07:35Z compaction; told it). PM watcher re-armed. Status report + 3 decisions posted 07:23Z (Discord 1573237169856716883, 1573237333212397619, 1573237344620912723): two placements (rec A both) + this week's usage line (default: carry 98% rule). Guard cron 0257d520 live. 08:2xZ asked Kyle D4: OLD wide Backblaze key delete yes (Discord 1573239602070814854; rec A after new key proven).
- Archived 2026-11-16 · kd85-88-decided → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-20 · kd91-93-decided → `1-system-manual/pm/archive/memory/2026-11.md`
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

- **FOR KYLE (OLD 11-20 ~00:10Z, Discord 1573132153913348188):** proposal from B-ARCHIVE-NETWORK-RETRY J3: raise the xStock ticker recorder outage hold 9 min -> 60 min (~196 MB worst case); BLOCKED until #1032 (row 119); OLD recommends an item AFTER row 119. ASKED KYLE 03:19Z (Discord 1573175707419414549), rec: directly after #1032; record slot-checks/20261120T031710Z_CC-A_* (uncommitted; commit WITH the decision row).

- **FOR KYLE (ANALYST 11-20, corrected framing per Langston Discord 1573145946089455727): a RECORD GAP, not a trailing decision** (trailing on/off is answered, KD-36). The xStock path computes ATR (xstock_spot/eval-cycle.ts :629, :774) and stamps it on the VTS open trade (:1273), but it is dropped on the way to the active position record: xStock paper 0/7 carry it (atr_at_open literal '0'), crypto 5/5. Same family as carry defects #549/#550/#560. Likely a defect but a HYPOTHESIS (active-path writer not read yet). No trading effect today (trailing off by flag). Decision required, no work; needs a slot. ASKED KYLE 03:19Z same post, rec: end of CC-C queue; record slot-checks/20261120T031720Z_CC-C_* (uncommitted; commit WITH the row).

- **Small-items bundle +1 (ANALYST 11-16 ~16Z):** Settings "config snapshot" view 500s (route calls removed storage.getPortfolioBalance; repoint vs remove undecided). Not paper/VTS. Bundle ids in archive 2026-11: small-items-bundle-1/2-pending-kyle.

- Archived 2026-11-16 · nudge-11-16-1623z → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · usage-87-safe-stop-superseded → `1-system-manual/pm/archive/memory/2026-11.md`

- **B-TOKEN-ECONOMY STEP: 11 of 11 DONE — IN OBSERVATION (not complete).** Pushed c8b07e21f (progress report) + 9ee51c2d9 (Step 10). Langston memory pointer :113 (his set 5 B under ceiling). Board card -> Observation. Close waits: OBJ-2 (each session reads contextWindow 250000 at resume), OBJ-3 (Codex canary), P6 flip (--verify PASS >=50, check_failed 0/explained, separate commit, re-dispatch Langston). #1261 = decision for Kyle (proposed: CC-INFRA test repair after resume). 
- **B-WORKFLOW-IMPROVE STEP: 4 of 11 (in progress) · NEXT STEP: 5 of 11.** Step 3 DONE (Q0-Q10; Q11 waits on row 5b, else CLOSED-UNPROVEN; Codex canary with B-TOKEN-ECONOMY OBJ-3). Change list 5 gates. GATE 1 PROCEED (Discord 1573165268514119742). GATE 2 PROCEED+5 conditions applied 70a629f64; RE-CHECK (Discord 1573183217178124359): C-3/C-4/C-6 fixed in 7cac109df (self-tests 7/7, 6/6), no diff round, he takes them at Step 8. readDeclaredClassAt + #744 mid-line marker item asked of OLD 07:3xZ (queued). NEXT: push 7cac109df on green, flip board Blocked-on, dispatch gate 3 (Q2 drafts, Q10 contract+archive, Q7 pointers); gate 4 (enum drift home, undeclared DB types -> pm-slotting -> Kyle); gate 5.

# OPEN
- Archived 2026-11-04 · stale-local-session-ids → `1-system-manual/pm/archive/memory/2026-11.md`
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.

- Archived 2026-11-05 · historical-pm-log → `1-system-manual/pm/archive/memory/2026-11.md`
