# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **USAGE RULE KD-106 (Kyle 11-20 ~10:15Z, replaces KD-99/98%):** at 85% weekly run pm-usage-stop (sessions finish, clean stop), all stopped by 90% (88-89% ok); rest reserved for PM+Kyle and his other projects. Guard cron b1514f3e (hourly :17, 85%; session-only, expires 7 days).
- **RESUMED 2026-11-19 23:0xZ after the weekly reset (usage 0%):** 4 scheduled tasks re-enabled; `crew-switch langston on` (bridge active/enabled); OLD/NEW/ANALYST/INFRA woken to re-arm + continue; PM watcher re-armed; guard cron later replaced (see KD-106 line).
- **11-20 laptop off ~03:35-07:17Z (Windows restart).** 07:20Z woke OLD/NEW/ANALYST/INFRA (re-arm, OBJ-2 read, resume); OBJ-2 250000 confirmed ALL FOUR: NEW, OLD, ANALYST self-read 07:3xZ; INFRA by my get_usage(session_id) 08:3xZ (its 966,823 prompt pre-dates its 07:35Z compaction; told it). PM watcher re-armed. Status report + 3 decisions posted 07:23Z (Discord 1573237169856716883, 1573237333212397619, 1573237344620912723): two placements (rec A both) + this week's usage line (default: carry 98% rule). Guard cron 0257d520 live. 08:2xZ asked Kyle D4: OLD wide Backblaze key delete yes (Discord 1573239602070814854; rec A after new key proven).
- Archived 2026-11-16 · kd85-88-decided → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-20 · kd91-93-decided → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-19 · pointer-group-b → `1-system-manual/pm/archive/memory/2026-11.md`
- **DESKTOP COMPUTER USE DISABLE TEST — ACTIVE, DO NOT RESTORE WITHOUT KYLE (2026-11-12):** Both desktop Computer Use plugins remain disabled; `notify = []` and `SKY_CUA_NATIVE_PIPE_DIRECTORY = ""`; Browser and Chrome remain enabled. The Codex desktop host relaunched its Swift helper despite those settings. Kyle directed PM to leave the app running, leave the plugins disabled, and stop trying to kill the helper while the test continues. Non-UI work continues and staging checks are browser-scoped only. Exact restoration material: `C:\Users\kyleg\.codex\config.toml.computer-use-test-20261112T012821Z.restore.txt`.
- Archived 2026-11-19 · pointer-group-a → `1-system-manual/pm/archive/memory/2026-11.md`
- **KD-104..107 recorded 11-20 (b71f3223b):** 104 OLD recorder hold row 119a; 105 ANALYST ATR row 196a; 106 usage rule; 107 OLD deletes wide Backblaze key once restricted key proven. Relay + collect ACKs.
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
- **B-TOKEN-ECONOMY AMENDMENT 1 (KD-108, OBJ-11..15) STEP: 4 of 11 (P6 table) DONE · NEXT STEP: 3 of 11 for the rest (Infra installs P6, builds P1-P3).** R2 ruling 12:38Z (Discord 1573316684633350144); fixes 77bc0d74e. Langston Step-4 (1573321813814157454): PROCEED on P6 install w/ riders C-1 (LF-only split + line/row refusal) and C-2 (only CC-A/B/C/INFRA seed votes; non-session owner refused). C-1..C-4 + crypto-spot-shard0 CC-A row landed dd7568b49 (72 rows, 43 flagged, 16 Kyle votes dropped, controls exit 2). Filed 1573322906065178877; his 2nd check (1573325076240277506) PROCEED, held flip on FINDING-1 numbers + C-5 (plan parse full-cell, refusal reach in _about): landed 104bf3814; APPROVED (1573327688213725185), condition + riders at dc9f496db; board -> Implementation, Review Approved. Infra told install from dd7568b49 (1573322945512742963). Then: P4 first (measure in a NEW session), Infra P1-P3/P6, PM P7-P8.
- **B-TOKEN-ECONOMY STEP: 11 of 11 DONE — IN OBSERVATION (not complete).** Pushed c8b07e21f (progress report) + 9ee51c2d9 (Step 10). Langston memory pointer :113 (his set 5 B under ceiling). Board card -> Observation. Close waits: OBJ-2 (each session reads contextWindow 250000 at resume), OBJ-3 (Codex canary), P6 flip (--verify PASS >=50, check_failed 0/explained, separate commit, re-dispatch Langston). #1261 = decision for Kyle (proposed: CC-INFRA test repair after resume). 
- **B-WORKFLOW-IMPROVE STEP: 4 of 11 (in progress) · NEXT STEP: 5 of 11.** Step 3 DONE (Q0-Q10; Q11 waits on row 5b, else CLOSED-UNPROVEN; Codex canary with B-TOKEN-ECONOMY OBJ-3). Change list 5 gates. GATE 1 PROCEED (Discord 1573165268514119742). GATE 2 PROCEED+5 conditions applied 70a629f64; RE-CHECK (Discord 1573183217178124359): C-3/C-4/C-6 fixed in 07b7cd727 (rebased 7cac109df) (self-tests 7/7, 6/6), no diff round, he takes them at Step 8. OLD 08:4xZ: both on #744 RUNNING_ISSUES at 42b679aaa (marker miss + readDeclaredClassAt export, land together); #744 unslotted, so closeout mirror stays this week. GATE 3 conditions applied, pushed b3bde2575, sent to Langston (Discord 1573279794500599849); CI 4/4 to confirm. LESSON: private bodies over stdin, never Helsinki /tmp. Next gate 4 (enum drift home, undeclared DB types -> pm-slotting -> Kyle); gate 5.


# OPEN
- Archived 2026-11-04 · stale-local-session-ids → `1-system-manual/pm/archive/memory/2026-11.md`
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.
- Archived 2026-11-05 · historical-pm-log → `1-system-manual/pm/archive/memory/2026-11.md`
