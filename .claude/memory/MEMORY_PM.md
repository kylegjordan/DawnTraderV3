# MEMORY — PM Claude

> Per-session notebook (cap 10 KB; rules file + this ≤ 18 KB). Rules: `1-system-manual/PM_CLAUDE_RULES.md`. Startup prompt: `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md`. Clone: `C:\DawnTraderV3-pm`. Records: `1-system-manual/pm/` (DECISIONS.md, reviews/).

# ▶▶ CURRENT POSITION — READ FIRST
- **CODEX USAGE STOP — ACTIVE (KD-71, 2026-11-24T16:50:08Z / 17:50:08 Europe/Warsaw):** signed-in weekly Codex meter reached **92% used / 8% remaining** at the stop trigger and **93% used / 7% remaining** during closeout; reset is 2026-11-25T08:35:12Z / 09:35:12 Europe/Warsaw. No reset credit spent. OLD visibly stopped at pushed `9ced878adb613c56219e4ad78ca76355349b4341` (B-UNIVERSE-REFRESH-ACTS Step 5 complete, Step 6 next; 0/0; outside memory matched). NEW, ANALYST and INFRA acknowledged and wrote safe-boundary handoffs but their turns remained active waiting on replacement CI after shared advances; Kyle must press Stop in those three chats now rather than spend the final 7%. Coltrane is inactive/disabled; Discord stop line sent. Only active Codex automation found: `pm-codex-crew-heartbeat` (`pm-codex-crew-heartbeat`), to pause last. Resume only on Kyle's explicit words in this PM chat.
- **ALERT FOLLOW-UP 2026-11-24T09:20Z — routed; no new Kyle action.** INFRA resolved `07eba4b2` after 11 healthy hourly runs. `ba8b42e2` remains an ANALYST event-wait. OLD owns the `d92423ce` instrument; NEW owns eventual operational clear after a permitted deploy (`0765e6afa`); keep active/unacknowledged. Coltrane routed ownerless `9798d24f` to ANALYST: carrier B-XSTOCK-BID-TRIGGER-RELAND OBJ-12, fix home B-SHADOW-HOLD-CLOCK row 4c/#1144; keep active/unacknowledged until reviewed evidence.
- **B-DB-HELPER-RETIRE STEP 3 BUILT; STEP 4 ACTIVE 2026-11-24T12:52Z.** The default-deny fence found a 92nd checked-in surface; Coltrane approved the correction at `231a8c194` and its narrow source-removal gate. INFRA built Step 3 at `220476bba`; CI `45397330268` caught a database-map integrity/snapshot failure, and INFRA remains active at the Step-4 boundary to correct it before review. Holds remain on `xstock-hollow-recut.ts` (unfinished P6 relabel) and `b_price_side_alias_census.sh` (#1024 rerun). No live-helper deletion, install, deploy or restart yet.
- **NUDGE CLEARED 2026-11-24T08:18Z — OLD Codex, `old-green-ci-record-unpushed-20261124`, nudge 1.** CI `45349623314` four-job green; OLD rebased the byte-identical approved record, pushed shared `71cb956830b0aa5b3dcb7df71de364929fc93b66`, proved outside memory SHA-256 and byte size match, and returned to B-UNIVERSE-REFRESH-ACTS Step 6 hold without deploy/restart. Full row: `1-system-manual/pm/STALL_AND_DRIFT_LOG.md`.
- **PM HANDOVER TO CODEX 2026-11-23.** Sheet `1-system-manual/pm/handovers/2026-11-23_claude-to-codex.md` (`14814384e`); S7 closed with all five Claude acks. PM start list is in the sheet. KD-118 makes the audit aids required and PM-owned. Open: KD-114..117; next Kyle round RIDER-3, row 118→18 coverage, B-TOKEN-WATCH-PACED-LIQUIDITY, B-TOKEN-ECONOMY P10/P11 and CC-PM alert-followup fix. Claude-side pauses stay paused until return.
- **USAGE STOP RECORD 2026-11-22T23:41Z at 85% (KD-106; reset 11-26 23:00Z).** Claude scheduled tasks and Langston remain paused/off; deleted PM guard cron must be recreated on Claude resume. All four builders stopped at clean boundaries with no deploy in flight. Current Codex crew resumed under S7; restore Claude machinery only on the Claude return.
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
