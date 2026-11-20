# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **KYLE 11-19 ~20:30Z (laptop clock = his time, UTC+1): keep building step by step while weekly <98%. At 98%: wait for 22:00Z (his 11pm), then one more step, stop just before 100% (extra usage is ON - never run into it). If stopped: set a wake for 23:00Z (his midnight = weekly reset); on waking, resume the crew per pm-usage-stop Resume (re-enable 4 tasks, crew-switch langston on, wake OLD/NEW/ANALYST/INFRA to re-arm + continue), then carry on with my batches (B-TOKEN-ECONOMY Steps 4-11, then B-WORKFLOW-IMPROVE).** Step 4 PROCEED (Langston 21:17Z, record Change Lists/B_TOKEN_ECONOMY_STEP4_REVIEW.md); his defects 1-4 fixed + ledger check blocking in CI. Midnight wake done. B-TOKEN-ECONOMY is IN OBSERVATION (see its line below). Weekly usage 3% at 11-19 23:50Z. ASKED KYLE in Desktop 11-19 ~23:50Z (awaiting): (a) restart the 4 sessions at next pause for the 250k window (OBJ-2), (b) this week's usage line (90% carried).
- **RESUMED 2026-11-19 23:0xZ after the weekly reset (usage 0%):** 4 scheduled tasks re-enabled; `crew-switch langston on` (bridge active/enabled); OLD/NEW/ANALYST/INFRA woken to re-arm + continue; PM watcher re-armed; guard cron 0257d520 (hourly :17, 90% line carried from KD-99 - Kyle may set this week's line).
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

- **FOR KYLE (OLD 11-20 ~00:10Z, Discord 1573132153913348188):** proposal from B-ARCHIVE-NETWORK-RETRY J3: raise the xStock ticker recorder outage hold 9 min -> 60 min (~196 MB worst case); BLOCKED until #1032 (row 119); OLD recommends an item AFTER row 119. Slotting ask -> run pm-slotting (CC-A) before putting it to Kyle.

- **FOR KYLE (ANALYST 11-20 ~01:00Z, via Langston C-P5 Step-8 review, Discord 1573141069716262923):** xStock positions carry no ATR (open paper: crypto 6/6 have it, xStock 0/9), so every xStock stop uses the fixed-stop fallback and trailing can never engage for xStocks. Not urgent: trailing is OFF until after live (KD-36). Open: by design or dropped. Old home #556 CLOSED 09-29 - needs a slot; decision required, no work. Run pm-slotting before asking.

- **Small-items bundle +1 (ANALYST 11-16 ~16Z):** Settings "config snapshot" view 500s (route calls removed storage.getPortfolioBalance; repoint vs remove undecided). Not paper/VTS. Bundle ids in archive 2026-11: small-items-bundle-1/2-pending-kyle.

- Archived 2026-11-16 · nudge-11-16-1623z → `1-system-manual/pm/archive/memory/2026-11.md`

- Archived 2026-11-16 · usage-87-safe-stop-superseded → `1-system-manual/pm/archive/memory/2026-11.md`

- **B-TOKEN-ECONOMY STEP: 11 of 11 DONE — IN OBSERVATION (not complete).** Pushed c8b07e21f (progress report) + 9ee51c2d9 (Step 10). Langston memory pointer :113 (his set 5 B under ceiling). Board card -> Observation. Close waits: OBJ-2 (each session reads contextWindow 250000 at resume), OBJ-3 (Codex canary), P6 flip (--verify PASS >=50, check_failed 0/explained, separate commit, re-dispatch Langston). #1261 = decision for Kyle (proposed: CC-INFRA test repair after resume). 
- **B-WORKFLOW-IMPROVE STEP: 4 of 11 (in progress) · NEXT STEP: 5 of 11.** Step 3 DONE: Q0-Q10 all committed (Q8 pilot 959bd9da1, Q7 4265cb1df + a8df50f02 reachability/canary 8/8, Codex leg simulated -> real canary with B-TOKEN-ECONOMY OBJ-3). Q11 waits on row 5b (else CLOSED-UNPROVEN). Step 4 change list daf25a31d (Change Lists/B_WORKFLOW_IMPROVE_CHANGE_LIST.md): 5 gates cheapest first - 1 reliance + any gate (rule only), 2 scripts+enum+CI, 3 text, 4 enum-drift home (-> Kyle via pm-slotting), 5 value-set aid + field census proposals. NEXT: push when CI idle (bg b422t39nh), CI 4/4, dispatch gate 1 to Langston, board Blocked on = Langston, 🟦 Step 3 report to Kyle (Desktop + Discord).

# OPEN
- Archived 2026-11-04 · stale-local-session-ids → `1-system-manual/pm/archive/memory/2026-11.md`
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.

- Archived 2026-11-05 · historical-pm-log → `1-system-manual/pm/archive/memory/2026-11.md`
