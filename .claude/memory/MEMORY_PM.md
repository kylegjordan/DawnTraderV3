# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **USAGE STOP SENT 2026-11-22T23:41Z at 85% (KD-106; resets 11-26 23:00Z).** PAUSED, restore exactly on Kyle's resume: scheduled tasks wake-watcher-heartbeat, daily-claude-currency-check, freshness-log-review, transcript-bloat-check (enabled:false); Langston bridge (crew-switch langston off, status inactive/disabled; no claude -p running); PM guard cron cc239f3f deleted (re-create hourly :17 guard prompt); PM watcher not re-armed. Sessions told via send_message: OLD local_66dbb030, ANALYST local_4dfcc10e, INFRA local_1a70b6ce; NEW local_0fe1c46a self-stopped 22:59Z (not messaged). Stop lines: OLD 22:58Z (B-UNIVERSE-REFRESH-ACTS at Step 4), NEW 22:59Z (nothing deploys), Infra 23:41Z (KD-115 item 2 live+verified; B-DB-READONLY-ROLE Step 5, install not started). ANALYST line pending. Left running (not DawnTrader): cashflow-workbench-gardening. Resume: each session re-arms its watcher, then run the token-economy smoke check.
- **USAGE RULE KD-106 (Kyle 11-20 ~10:15Z, replaces KD-99/98%):** at 85% weekly run pm-usage-stop (sessions finish, clean stop), all stopped by 90% (88-89% ok); rest reserved for PM+Kyle and his other projects. Guard cron b1514f3e (hourly :17, 85%; session-only, expires 7 days).
- Archived 2026-11-19 · resumed-1119 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-20 · laptop-off-1120 → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · kd85-88-decided → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-20 · kd91-93-decided → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-19 · pointer-group-b → `1-system-manual/pm/archive/memory/2026-11.md`
- **DESKTOP COMPUTER USE DISABLE TEST — ACTIVE, DO NOT RESTORE WITHOUT KYLE (2026-11-12):** Both desktop Computer Use plugins remain disabled; `notify = []` and `SKY_CUA_NATIVE_PIPE_DIRECTORY = ""`; Browser and Chrome remain enabled. The Codex desktop host relaunched its Swift helper despite those settings. Kyle directed PM to leave the app running, leave the plugins disabled, and stop trying to kill the helper while the test continues. Non-UI work continues and staging checks are browser-scoped only. Exact restoration material: `C:\Users\kyleg\.codex\config.toml.computer-use-test-20261112T012821Z.restore.txt`.
- Archived 2026-11-19 · pointer-group-a → `1-system-manual/pm/archive/memory/2026-11.md`
- **KD-104..107 recorded 11-20 (b71f3223b):** 104 OLD recorder hold row 119a; 105 ANALYST ATR row 196a; 106 usage rule; 107 OLD deletes wide Backblaze key once restricted key proven. Relay + collect ACKs.
- Archived 2026-11-20 · popup-closed-1120 → `1-system-manual/pm/archive/memory/2026-11.md`
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
- **KD-109 (Kyle 11-21): B-ALERT-MARKER-RETIRE after live** (PRE_LIVE_SPRINT, after B-ALERT-LANE-LEDGER-OWNER), CONDITIONAL on no delay/excess tokens; Infra confirms in its ACK, else back to Kyle (option B after P6). Collect Infra ACK.
- **Small-items bundle +1 (ANALYST 11-16 ~16Z):** Settings "config snapshot" view 500s (route calls removed storage.getPortfolioBalance; repoint vs remove undecided). Not paper/VTS. Bundle ids in archive 2026-11: small-items-bundle-1/2-pending-kyle.
- Archived 2026-11-16 · nudge-11-16-1623z → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-16 · usage-87-safe-stop-superseded → `1-system-manual/pm/archive/memory/2026-11.md`
- Archived 2026-11-22 · bte-amd1-step4-superseded → `1-system-manual/pm/archive/memory/2026-11.md`
- **B-TOKEN-ECONOMY STEP: 11 of 11 DONE — IN OBSERVATION (not complete).** Pushed c8b07e21f (progress report) + 9ee51c2d9 (Step 10). Langston memory pointer :113 (his set 5 B under ceiling). Board card -> Observation. Close waits: OBJ-2 (each session reads contextWindow 250000 at resume), OBJ-3 (Codex canary), P6 flip (--verify PASS >=50, check_failed 0/explained, separate commit, re-dispatch Langston). #1261 = decision for Kyle (proposed: CC-INFRA test repair after resume). 
- **11-21 ~11:35Z Kyle: batches must move, not sit.** Gate 3 RULED PROCEED; D-1/D-2 at 9285df148. TOKEN-ECONOMY PM legs: P8 alert-followup.mjs + P7 hook one-line at 0c79b6b34 (first live run: 3 CC-C unpriced VTS closes, ANALYST acting 1573665147829100566; repeat limit held); P4 tools list + CLAUDE.md rule 30 at 603c78710, PROOF MET: Infra 53,002 first-turn vs 92,974 control (tool list proves new def; context-restart, not fresh session; Discord 1573685684726800550). Guard cron now cc239f3f (usage + follow-up). Pushed 11-21 13:1xZ (head 8ec7ab0f1). Left: P10, P11. Gate-4 enum slot record FRESH (uncommitted), rec after live, to Kyle. Midpoint: no decision uses mid; residual fold into row 2 (CC-C) awaits Kyle.
- Archived 2026-11-22 · bwi-step11-1122 → `1-system-manual/pm/archive/memory/2026-11.md`
- **B-WORKFLOW-IMPROVE CLOSED 11-22**; 🟩 sent to Kyle. Add-on KD-112/113: Langston PROCEED on all (F-F 4172e74a8, F-I a086362de: 1574066755746144439); only F-H deploy leg left (11-23 05:51Z coltrane-size-watch should read 14,755). e03dc3e8 resolved pm-claude. CLAUDE.md headroom 13 B: next move must be a net cut. Infra proposals: decided KD-115. Langston adds (1574067519155867770): his own size-watch ratchet never exercised either; cite GOVERNANCE_EXCEPTIONS rows by batch+type+confirm id, never line (table prepends).
- Archived 2026-11-22 · kd114-116-acked → `1-system-manual/pm/archive/memory/2026-11.md`
- **KD-117 (Kyle 11-22 ~19:50Z, e1f1650ec): #1267 user-link census AFTER LIVE, NEW owns, with legacy user-ID cleanup; relayed, collect ACK.** All KD-114/115/116 + KD-109 ACKED; KD-115 item 1 done 19:10Z.
- **Infra 11-22 ~20:20Z (Discord 1574166962525962435):** KD-115 item 2 installs after CI on bb141c124 + bridge idle. Folded into B-TOKEN-ECONOMY (PM leg, with P10/P11): alert-followup.mjs SESSIONS/SENDER_TO_ALIAS lack CC-PM, add + test row, Langston review. FOR KYLE next round: RIDER-3 guard-pm-slot SESSION_WORDS + inventory.py OWNER_PAT lack CC-PM; PM rec after live (KD-15); needs slot check first.
- **FOR KYLE, after Langston scope review of row 18 (OLD 11-22, Discord 1574099488753057973):** row 118 (#1072, crypto recorder frozen symbols / empty-start no-retry / ticker-batch omits) marked covered by row 18 B-UNIVERSE-REFRESH-ACTS (CC-A), #1072 closes with it; xStock frozen list stays row 31 (CC-C). Acked OLD.


# OPEN
- Archived 2026-11-04 · stale-local-session-ids → `1-system-manual/pm/archive/memory/2026-11.md`
- Hourly "Wake watcher heartbeat" sessions pile up unarchived in the sidebar — ask Kyle whether to archive.
- Next analysis owed to Kyle: issues opened vs closed and batches opened vs closed per week since 2026-09-28.
- Archived 2026-11-05 · historical-pm-log → `1-system-manual/pm/archive/memory/2026-11.md`
