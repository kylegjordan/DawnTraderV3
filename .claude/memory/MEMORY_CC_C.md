# MEMORY_CC_C.md — Claude Analyst (CC-C) Volatile Working-State

> ★ NAMED 2026-07-19: **"Claude Analyst"** (alias **CC-C**, roster-bound). Discord display name **"ANALYST Claude"** (the `--sender` value); wake keys "Claude Analyst"/"Analyst Claude"/"CC-C" in `cc-wake-filter.py`. Arm with ALIAS `CC-C` — never CC-A/CC-B. *(The "SPEAKING:" prefix is RETIRED with Telegram — `--sender` IS the label.)*

> ★ LINEAGE (settled): this shell was the ORIGINAL Claude New, revived 07-19 as the Analyst. **I am NOT Claude New; never arm a CC-B watcher.** Stale TaskList entries are inherited. Roster: `.claude/cc-session-roster.json`.

## YOUR ROLE (Kyle 2026-07-19): **paper-trading results ANALYST (standing)** — analyse active paper results; find what can be calibrated NOW.

**★ THE STANDING WORK LEDGER (Kyle 2026-08-20): `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` — re-read it AFTER EVERY batch/sub-batch close, update statuses, ADD findings that should become batches.** Part D = the unwind queue; A6 awaits Kyle's pick; A7/#618 = highest-priority untouched (risk envelope).

## ARMED

7. **Weekend posture:** `#531` — active-path xStock positions have NO weekend mechanism; options paper → Kyle ruling pending. **xStock trades 24/5 (Sun 8pm ET → Fri 8pm ET); US holidays pause.**

## YOUR DATA SOURCES (read ONLY via `dt-sql` on staging — CLAUDE.md §7; never a hand psql/pg login, KD-96)
- **`closed_trades`** — realized active-path results; THE fee-viability population. ⚠️ **always filter `closed_at IS NOT NULL`** (rows are written AT OPEN). Post-2026-07-28: gross on ACTUAL fills, `total_cost` = fees only — **aggregates spanning 07-28 11:57Z mix two denominators.**
- **`active_open_positions`** — live exposure. ⛔⛔ **`rtb_signals` IS A TRANSIENT WORKING QUEUE, NOT A LEDGER — `n_tup_ins` 49,306 = `n_tup_del` 49,306, live 0 (2026-09-14). A `count(*)`=0 there means SERVED, never UNWRITTEN; the discriminator is the INSERT COUNTER, not the row count.** ✅ **SELECTION FORENSICS LIVES IN `rtb_shadow_pool_members` (231,282 rows, still writing): `promoted`, `promotion_rank`, `pool_size`, `sqe_verdict`, `final_score`, `di_at_queue`, `dbs_score_at_queue`, `cross_class_promotion`.** ⚠️ **ALWAYS take `count(DISTINCT symbol)` beside the row count — 24h crypto reads 2,649 promoted rows on SIX symbols across 2,451 cycles.** **`vts_open_trades`** = the wide learning population, SEPARATE from active, never blended.
- **`/api/active-engine/trades/analytics`** — the rolling summary Kyle sees; the EV-reject breakdown + Filter-Diagnostics counters show where signals die.
- Mechanics: `net-expectancy-kernel.ts`, `decideMakerTaker`, friction model. Context: **`…/Scope Files/P25_SCORING_STACK_PRESTUDY.md` §7** (READ before any retire/calibrate opinion), `POST_AUDIT_ROADMAP.md`, `PHASE_19_PLAN.md`, the two pipeline audits.
- ⚠️ **SCHEMA TRAP — A COLUMN'S NAME IS NOT ITS CONTENT. `closed_trades.trade_mode` holds `'TARGET'`, NOT paper/live** ⇒ filtering `trade_mode='paper'` returns ZERO and reads as "no trades". **★ the `positions=N` token in `out__*.log` is NOT the open-position count** (read 2 while the DB held 8). **Open positions ⇒ `active_open_positions`; closes ⇒ `closed_trades`. NEVER a log token.**

## STANDING BEHAVIORAL RULES (unchanged, they bind you too)
✅✅ **WRITE SCOPE — FULL. NO PER-BATCH GRANT; ASKING FOR ONE IS A DEFECT (Kyle 2026-08-30, emphatic).** **I IMPLEMENT, including TRADING-BEHAVIOUR code, and I spin up fresh readers WITHOUT ASKING.** ⛔ **The old "read-only except governance/tooling" line was stale by MONTHS and I cited it to STOP WORK. Langston reviews; he is NOT a gate I wait behind before starting.**

## ★★ THE HEADLINE FINDING (2026-07-20) — READ BEFORE ANALYZING ANY TRADING RESULT
**THE ACTIVE PATH HAS TWO ADMISSION LANES AND THEY MUST NEVER BE POOLED.** `closed_trades.metadata->>'admissionBasis'`: **`exploration`** = the GOVERNED lane, admitted on KNOWN-NEGATIVE netEV, **SUPPOSED to lose money**; **`organic`** = genuine positive-netEV. ⇒ **Pooling reads a deliberate learning spend as strategy failure — I did exactly that and gave Kyle a false headline. RE-QUERY, never quote from memory.**

## ★ VERIFIED MECHANICS (measured — trust these; detail in the repo)
- **Net-EV kernel arithmetic is CORRECT** at all 3 call sites; independently reproduced to 3 decimals. NOT a units repeat.
- **pWin is NOT pinned at the 0.60 ceiling** (live DI gives ≈0.46). ⚠️ that sample is queue-only = non-promoted = biased.
- **Loss is monotonic in SIZE, not RR** (<2% target n=72 −$87.14 · ≥4% n=28 −$0.81; RR flat). **Kills any raise-min_rr response.**
- **The 4% `target_floor_pct` is NOT a live rule** — orphaned config residue, not a defect.
- **RETENTION: declines ARE retained at volume in `signal_eval_archive`** — what is missing is GEOMETRY on the surviving row. ★ **I have stated this wrong in BOTH directions: query it, never recite it.**
- **VTS `regimeWeight` ~98% EXACT ZERO since ~07-14** ⇒ any below-floor % over all rows is a null artifact.

## ★★ RATIFIED CONTEXT (detail: POST_AUDIT_ROADMAP + P25_SCORING_STACK_PRESTUDY §7 + #501)
**★ #501 (3-way ratified): THE SWITCH-ON WAS DATA-COLLECTION, NOT PROFIT — and its 12,078-trade VTS baseline corroborates the crypto geometry finding below.**
## STANDING METHOD NOTE (earned the hard way 2026-07-19/20)

**MY RULE-27 CARVE-OUT (stated + accepted):** pairwise is the default, but I do NOT stay silent about a number that reached Kyle and is wrong — offering a correction is not convening a panel. *(2026-07-20 findings: RUNNING_ISSUES is authoritative; never re-derive from memory.)*

## ★★★ STANDING ASSIGNMENT — I OWN `1-system-manual/ACTIVE_PATH_FLOW.md` (living end-to-end map of the active trading path; update as each Phase-19 batch lands). Scope inputs + Langston's GATE-1/2/3 rulings: `…Scope Files/ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md`.

## ★ COMMS — mechanics only (length + statelessness rules are in CLAUDE.md §6.5, which auto-loads): `scp` the body to Helsinki `/tmp` → `cc-send --sender "ANALYST Claude" --message "$(cat /tmp/f)"`.
**★★ FILE-FIRST TO LANGSTON, ALWAYS — MEASURED 2026-08-23:** a long inline dispatch hit `claude timeout after 900s` and the bridge logged *"error … suppressed in channel"*, indistinguishable from silence; my re-poke deepened his queue. **Stage at `/home/langston/inbox/<BATCH>/` and post a SHORT pointer.** He is stateless per-invoke.

⛔⛔ **KYLE 2026-10-19 (via Langston, binds all): (1) main Dashboard + AI pages OFF-LIMITS unless breaking paper/VTS; (2) NO NEW BATCH unless on Kyle's AGREED list — a find gets ASKED to Kyle, never filed+started; a Langston placement is NOT Kyle's agreement.** My off-list rows 16a (`B-WRITE-TIMEOUT-ORDERING`) and 59g1b (`#1213`) wait for Kyle.

## ★★★ CURRENT POSITION (2026-11-04, after Kyle's two weeks off) — READ FIRST

▶ **2026-11-24 S7 CODEX — `B-XSTOCK-BAR-AVAILABILITY` `STEP: 10 of 11` DONE · `NEXT STEP: 11 of 11` after R2prime's graded result and decision.** Deployed in aggregate `e3a96a8126f0280a9568bb1823b9210783f0afe0`, ancestor of Phase A. Governed start read back `2026-11-30T01:00:00Z`; final gate 12-09T01:10Z; first due stored grade 12-10T00:15Z; event-wait `48fce948` at 00:45Z. Progress report is `Batch Completion/B_XSTOCK_BAR_AVAILABILITY_PROGRESS_REPORT.md`; card Observation; open GE row re-justified. Leave `ba8b42e2` and `8bd256bc` active/unacked. This wait is nonblocking; return for the result/decision and Step 11.
▶ **2026-11-26 S7 CODEX — B-PRICE-SIDE-BY-JOB 8c-OFF-REMOVAL · STEP: 6 of 11 Phase A DONE · NEXT STEP: 6 of 11 Phase B after OLD release and separate gates, then 7 of 11.** Exact A 5ecd7ee24fb7a741e8e015e0e6a262a464e7d016 live, restart 716 at 02:32:06.222Z, deploy recorded 02:32:16Z. Identity passed, wrong SHA refused, census PENDING_ON. A CI 45589022150 4/4 and shared d3ec4a5d8 CI 45605238768 4/4. Keep exact B 3282a856fe3cb8356702e5e00c8713139173429c (CI 45595430916 4/4) off shared until release and permitted slot. Recheck installed deployer digest 8835871626b97951292081ff2b249a91f217a80886c678e3d029ae74221ecad6. Card CI + Deploy / External / Approved. Full evidence in B_PRICE_SIDE_BY_JOB_8C_OFF_REMOVAL_CHANGE_LIST. Parent 8c NO-RESULT / no stop trigger / operational hold discharged. No reset credit; preserve .claude/launch.json.
▶ **Row 14a B-KRAKEN-PRIMARY-KEY-RESOLUTION · STEP: 5 of 11 DONE · NEXT STEP: 6 of 11.** 2dbc2b568 CI 45724236582 4/4. Stage after 8c B. 359913cf closed 933890dc9.
▶ **KD-120, Nov 26.** C-2/NEW handoff and exact-A return riders in 8c change list. R3 8f97c294e shared-reachable; substitution approved 05:14:25Z, execution still gated. R2prime planning cleared Nov 27 R3 02:30–02:55Z and A return proposed 06:10–06:35Z; repeat all fresh gates and agree recovery authority. Restart 716 holds. OLD release required. Preserve legacy crontab and cache.
▶ **ACK KD-121, Nov 25.** Owner and Coltrane agreed the bounded 24h proof at 0ee3b49f1e6c1049497b02d0f6a8950e561ff94d on Nov 24 14:43:27Z. PM confirmed the slot at 55c329135: after full 8c OFF-removal, ahead of the remaining KD-19 entry increment, with dated xStock reads and higher-priority open-trade/faulty-close work protected. Compare pre-restart scanner rank to saved VTS trade/outcome replay, with wrong class, session/epoch and trade identity controls. See SPRINT_TO_LIVE_PLAN and CC_C_SESSION_TASK_LIST row 17. KD-121 covers replay only; KD-119 no-delete hold and other placements remain.
▶ **WINGS/USD VTS, Nov 25 21:44Z.** Same crypto VTS trade open. Prior 8e4387fb cleared after a decision at 16:45Z. New 936c1fc2-4cde-4bbe-93b5-bd2bf8a027a6 active/unacked, implausible spread. Two archived quotes 21:30Z were within 2%, before the new alert. VTS clears on a decision or close.
▶ **Nov 26 xStock:** 15 current escalations active/unacked at 03:43Z, all in open paper. Previous 11 superseded; no pricing recovery. Reconnect 186e8711 and venue quiet e80d1129 still active/unacked. Exact IDs and feed evidence in Bid Trigger Reland Progress Report §3k.
▶ **Nov 26 cron:** 13a2720c resolved as pre-activation; Coltrane concurred 03:50:01Z. Per-job first eligible slot candidate unplaced; proof in Cron Missed Catchup Completion Report §10.
▶ **2026-11-24 S7 CODEX — `#1263` `B-DB-REGIME-ENUM-ALIGN` `STEP: 11 of 11` PLACEMENT DECISION PENDING · `NEXT STEP: 11 of 11` after Kyle placement.** **ACK KD-119:** all twelve dormant rows remain under the no-delete hold; neither deletion nor pre-live rebuild is approved. Coltrane technical PROCEED at 14:43:27Z on `0ee3b49f1`; completion gate CHANGES NEEDED at 15:13:42Z on `d136d9fbb` because related sprint rows were not authorized homes. Settled end state remains: rows 1, 3–8 and 10–12 DELETE after hold/placement; row 2 REPAIR replay duty then DELETE old body; row 9 REPAIR typed cost capture then DELETE old limb. KD-121 places the replay proof. Typed cost capture and old-limb cleanup remain UNPLACED pending Kyle’s list decision. No deletion, reconnect, deploy, restart or mode change is authorized. While these placements wait, follow the current 8c-OFF-REMOVAL position above.
▶ **S7 alert outcomes:** evidence a638c6baf cleared a9351617, 9429aa7e, a641d0cc, 322a736b and a446f715. Active/unacked 9798d24f is ANALYST’s objective-12 shadow-close running count; fix and close only under B-SHADOW-HOLD-CLOCK row 4c / #1144. e67b2638 clears when pricing resumes.
▶ **8c week Step 8 done Nov 23:** c15fb88d resolved against 34fec1121 after Coltrane PROCEED. 67/67 observed sided; November 21 supply 6 < 7, official NO-RESULT; no stop trigger. Window closed and operational hold discharged.
▶ **B-XSTOCK-BID-TRIGGER-RELAND #961 · STEP: 2 of 11 plan r1 drafted · NEXT STEP: 2 of 11 exact Coltrane ruling.** 09:55:32Z PROCEED to draft at 5f7d97f7e; progress §5a; EXIT_FILL_PRE_AUDIT. #962 disposition at row 2 Step 11; #1087 entry dependencies stand. GE 39 then e473d7da. #441 read-only audit ready, OLD notified 1575455963266285682. #1250 Step 2 END evidence and full 8c change list at 2802a4f9f; review extractor before next END. #677 db184965 Dec 16. DEPLOY_WINDOWS merge=union.
▶ **CLOSED 11-14:** `B-GUARDRAIL-FAIL-CLOSED` (`#1081`, report in Batch Completion; gap → `#744`) and `B-CRON-MISSED-CATCHUP` (deployed `9591ba8c2`; report in Batch Completion). feed_integrity insert-collision defect put to Kyle (no batch without his list). INIT/USD VTS no-decision alerts recur: book too wide, refusal correct, self-clears; not for Kyle. Preserve the untracked `.claude/launch.json` (and any withheld completion-report draft).
▶ Active-fill alerts `78be13a6` (CHPT), `b0672b57` (NWL), `c3de1862` (CPB): left active/unacked by design; no Kyle route.
▶ **ANALYST CLAUDE 2026-11-13 — KD-19 `B-PRICE-SIDE-BY-JOB` (b)+(c) exit leg DONE — `STEP: 11 of 11` CONFIRMED by Langston 2026-11-13 (record progress report §9.11). Parent stays open (8c, #1250, KD-19 entry leg); at parent close flip its open rows to open-retired BEFORE resolving 1ae9a06b.** Evidence §8 of `Change Lists/B_PRICE_SIDE_BY_JOB_KD19_STEP7.md` at `ae571e113b0f`; alert `7e20ed0f` RESOLVED (its recorded evidence sha is mistyped past char 9 — corrected of record at `9bbc55f06`).
▶ **#1250 Step 8 PROCEED Nov 21** (1573525095614251190; corrected read 4db529c28). Mid half withdrawn 46c5650ce; stop book freshness owed #961/#959, row 2 Step 11; Kyle owed 151→108 correction and finding. KD-82 3n.c boot → NEW row 172.
▶ **Row 2 remaining:** 4c Step 10 recorded Nov 13 (progress §3f); 3n.q8 stalled-store alert and ring-age pending in increment 1. Preserve e473d7da to parent close.

⛔⛔ **THREE THINGS IN FLIGHT — READ THE RECORDS, DO NOT RE-DERIVE:**
0. ⭐⭐ **TOP PRIORITY: PRICING. `3n` `B-PRICE-SIDE-BY-JOB` r5 — OBJ-7 DONE; `8f` + `8l` DEPLOYED; `8c` `STEP: 7`: full Step-4 PROCEED 01:58Z (F1-F4 closed); LIVE DARK in 5c3b14496 (01:31Z), OFF stamp 'mid' seen in RTB; UI pass + flip wait on Kyle (flip must state flow rate, plan §13). STOPPED 85%.** ⛔ **ORDER: remaining OBJ-8 → xStock fees (CC-B) → reachability (row 4 `F-5`). $0.25 floor STAYS. Governance shadow gate STAYS OFF (Kyle 2026-09-13, recorded at the SQE site).**
0.a ⛔ **`3n` exit/fill remains one batch, and the durable details live in `…8A_P3_PROGRESS_REPORT.md` plus `…8A_P4C_AUDIT_AND_PLAN.md`.** All P2/P3/P4a/P4b legs are live; P4c rules A-D were read and confirmed. Preserve `gov-openmaxage` alert `1ae9a06b-73a9-4e4f-9a6a-00f03544101e` unacknowledged until close; X3 re-lands after `3n.q8`; a `MAKER_RESTED` line is not a placement — `MAKER_PLACED` is.
0.a-4 ▶ **valve (row 4) ✅ CLOSED 11-06. STRK max-hold read 11-11 17:30Z (alert 00b727aa) is mine.** #507 held; cond 3+item 5 done ae9bff2d4; rerun: per-stratum min; rm ccc-507-sep at close. `#1145` = 79 fake STX/STRK wins.
⚠️ **`#1026`: GATE EVERY LANGSTON SEND ON `wc -c` < 1990, BEFORE `cc-send`** (a split orphan can wake `coltrane-bot`).
⚠️ **SUPERSEDED IN PART 2026-10-06 (Kyle, via CC-B): the xStock exit-freshness ROWS and the NOTIFY cut are CC-B's — `B-VENUE-QUIET-ALERTING`, sprint row 3a1. Do not disposition them.**
✅ **LANE SETTLED 2026-09-13 with CC-B (he verified it at the code): the CLASS is mine — exit-freshness / the shut-vs-impaired discriminator, `#994`, row `3b.f-c`; ordinary `price-skip-paper-*` ROWS are his; an exit-freshness row needing an EXPOSURE CHECK is mine, because that check is my class's operative rule.** ⛔⛔ **MY OLD RULE FOR IT WAS BACKWARDS — “leave active” MUTES IT.** `system-alerts.ts:509` dedups on same-key AND `state !== 'resolved'`, so a NON-RESOLVED row BLOCKS every fresh mint on that key, and the mint site is STRICT EQUALITY on the streak (fires once per streak, never again). Its own comment: **`resolved` is terminal and does NOT block recurrence.** ⇒ **RESOLVE is what re-arms the alarm; ACK and LEAVE-ACTIVE are both suppression.** ★ **An open row silences the next one.**
⛔ **KYLE 2026-09-07: use the governance skill's LEDGER FORMAT when reporting Step 10 — name every document, strip the folder, keep the name. Not my own table shape.**
⛔⛔ **THE STALENESS GATE IS THREE TERMS, NOT ONE — my `age AND feed-not-live` was REFUSED and he is right: a term ANDed onto a fail-CLOSED gate can only WIDEN it, and it passes per-symbol subscription death behind a healthy socket.** CELLS: **old+feed-dead → refuse whole-feed · old+feed-live → SUSPICION, NO auto-pass · fresh → transact.** **Term 2 = the SYMBOL'S OWN expected inter-arrival; term 3 = feed liveness as a DISTINCT-SYMBOL COUNT, never recency — one chatty name keeps a gauge green.**
⚠️ **ALERT `5b2849e0-e586-4fa5-80a7-d851ad7c5702` — MINE, deliberately NOT acked (an ack silences it, `#982`). Fold notify-suppression into `3b.f-c` per `#994` am.1-3; EMIT stays, NOTIFY goes.**

⭐ **PRICE-SIDE (`3n` `B-PRICE-SIDE-BY-JOB`, delegated to CC-C+Langston) — THE FOUR JOBS, THE RULE AND PER-LEG TRANSACTABILITY LIVE IN THE SHARED `MEMORY.md`; READ THEM THERE, NOT HERE.** **Only what the shared copy lacks:** midpoint is built at the FEED layer (`kraken-v2-translator.ts:73` overwrites v1 `c`); levels set at `signal-orchestrator.ts:2387`/`:2276-2278`; trigger `aee:1503`. **Spreads: median 0.199% crypto / 0.395% xStock, xStock p90 11.784%.** `F-G-2` OBJ-0 lands FIRST.

⛔⛔ **REACHABILITY NEEDS NO CLEAN WINDOW — I told Kyle it did and the plan's own cell said otherwise (`wrong-object`, corrected 2026-09-03). `F-E` grades the 547 closed trades already in hand.** **SEQUENCE: `3n` → `F-5` structure → `F-E` on existing history → the reach FIT → THEN the paper reset + clean window. THE RESET IS LAST — opened earlier it measures the old ruler again.**

⛔⛔ **DURABLE — PM2 SPLITS THE APP'S STREAMS: `console.log` → `out.log`; `console.warn`/`console.error` → `error.log`. EVERY exit-path skip/refusal line is warn/error.** **CONTROL: `EQUITY_MARK` = 0 matches in `out.log`, 1,031 in `error.log`, same window.** ⇒ **NEVER read an exit-path ZERO from `out.log` alone — it is `#661` leg 3 waiting to happen.**


⛔⛔ **THE MACHINERY AUDIT IS THE LIVE WORK — `1-system-manual/EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md`, NOW §0-§10. READ IT; DO NOT RE-DERIVE FROM HERE.** §8 provenance · §9 the second independent audit · **§10 = THE CORRECT DESIGN, DRAFT 1.**

⛔⛔ **KYLE'S STANDING DIRECTIVE: ITERATE TO COMPLETION WITH LANGSTON + SECOND READERS THROUGH THE GOVERNANCE STEP. Step-report blocks only; STOP ONLY for a decision that is HIS.**

⭐ **USE SECOND READERS FOR LOAD-BEARING PIECES AT EVERY PIVOTAL STEP.** ⚠️ **His caution: readers surface incidental nitpicks and sometimes claim wrong things — FOCUS ON LOAD-BEARING, verify, and do not let a retraction reach implementation.** ★ *"I want this to be perfect... it's very late to be noticing we don't have the right prices feeding in. I'd assumed for months that was foundational."*

✅ **THE xSTOCK PRICING PLAN IS THE LIVE ARTIFACT: `1-system-manual/XSTOCK_PRICING_PLAN.md`** — 6 problems, 6 solutions, the order; **P6 (which price per job) = KYLE'S.** Read it there; do not re-narrate here.




✅ F-G-1/B-OHLC-WRITE-ORDER closed; #705 rehomed to 3b.h-8/#1032. 3n.q7 inc-2 Step 5 done, Step 6 deploy B, Step 10 resolves 4cae3f6e and bf86001f. PAPER-STANDARD r12 approved (2fd667240), §4 is Kyle’s. #1087 dead arm only with qty-zero fix. Never cancel pending shared CI.

✅ **RATCHET / TRAILING / BREAK-EVEN — OFF in paper AND VTS UNTIL AFTER LIVE (Kyle KD-36, 2026-11-05, via PM Claude). Settled; do not re-ask.** ⛔ **KD-34: technical questions are decided by the owning session + Langston + Coltrane to consensus on a full provenance pack (original intent read first), NOT by Kyle; PM Claude records the decision. KD-35: keep my task list until B-PM-CLAUDE's master list lands.**

⛔⛔ **LANGSTON'S STANDING RULING ON THE AUDIT: findings survive as MEASUREMENTS and are NOT CERTIFIED AS DISPOSITIONS.** The exposed class is **any sentence asserting behaviour is unintended/undecided/unspecified, WHEREVER IT SITS** — my findings-vs-proposals split was *"the wrong cut, and it fails in your own favour."* ⇒ **uncertified until `#956`/`B-DECIDED-INTENT-INDEX` (3b.g) lands.**

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ AFTER ANY DISPATCH, READ THE INBOX ON THE NEXT WAKE OF ANY KIND — the watcher missed two Langston replies on 2026-09-02 (12:20, 13:10).** 
**⚠️ #1 ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER** — ALIAS **CC-C**, display **“ANALYST Claude”**. **Compaction KILLS it.** Arm the EVENT-ONLY form as a Bash `run_in_background` task (NOT Monitor any more — B-TOKEN-BURN-CUT): `cc-wake-filter.py CC-C --positions` → ssh `cc-wake-follow.py` → `cc-wake-filter.py CC-C --once`, loop until exit 0; it ends on ONE wake, so RE-ARM after every completion. **Liveness = the file `~/.claude/cc-wake-state/CC-C.json.alive`, never TaskList; ONE watcher at a time.** Read each WAKE line, then fetch the full message by id from the inbox.

## ★★ STANDING LESSONS — the ones that keep re-earning their place

1. **A MATCHING NAME IS NOT A MATCHING THING** · **A CONTROL THAT CANNOT FIRE IS THE DEFECT IT GUARDS — write BOTH arms** · **CAPABILITY ≠ COVERAGE: state the time reach** · **NAME THE POPULATION AND THE REF BEFORE THE NUMBER — a deploy time is not a window anchor.**
6. **TWO RULES I AUTHORED are in `CLAUDE.md` (auto-loads — read them THERE): r24.a investigate-before-announce, r29 measurement discipline.**

**★★ `wrong-object` — THE PATTERN THAT KEEPS COSTING ME (cases: `MISTAKE_PATTERNS.md`).** ★ **Only a MEASURE-TIME GATE has ever caught it.** ⇒ **BEFORE ANY CLAIM: read what the column is DEFINED as · RUN THE CONTROL ON THE OBJECT THE CLAIM IS ABOUT · and when you read a value at a CONSUMER, TRACE ONE HOP UP BEFORE GENERALISING ABOUT THE PRODUCER (F-G-2 §17).** ⛔⛔ **MY CORRECTIONS ARE THEMSELVES WRONG-OBJECTS — RE-DERIVE ONE LIKE A FINDING.**

**MY OPEN ISSUES — NUMBERS ONLY; `RUNNING_ISSUES` AUTHORITATIVE:** **#734 = PHASE-21 GO-LIVE BLOCKER** (`apm:165` THROWS in live; TWO independent trips) · **#733** (BLOCKS `dt-deploy`) · #687 #688 #689 · **#690 residual: audit-FAILs have NO alert path** · **#692: a DOWNWARD re-anchor strands legacy-notional positions above the new budget ⇒ ZERO opens until they close; RECURS.**

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **Exit skips:** check exposure vs stop; never ack. B-VENUE-QUIET-ALERTING writer clears on priced/closed or regular-session handback; only proven recovery can clear a live wait.

⛔ **LANGSTON'S MEMORY.md IS COMPOSED FROM PARTS — write ONLY via `langston-memory-write --part <part> --expect-sha <part sha> ... < body`; a direct edit locks the composer for EVERY session.** Part name WITH `.md`; `--ledger-delta 0 --retractions-delta 0`; build the draft under `umask 077` and delete it in the same command (a world-readable /tmp draft raised `2b6a2da7`, 2026-11-05).
⛔ **NEVER A BACKTICK INSIDE A TAGGED TEMPLATE LITERAL** (``sql`…` ``) — it ends the string; tsc far BELOW baseline = a parse break, not a fix (2026-09-03).

★ OBJ-9: do NOT move `active_fill_max_age_ms` (15 s); counts in `scripts/analysis/obj9_counts_v2.sql`.

➕ **`#994` KYLE DIRECTIVE, MINE: staleness because the US market is SHUT must not raise a breakage alert; staleness because OUR feed is impaired must.** OBJ-9's alert-policy requirement; discriminator = feed-wide liveness (the other ~478 books are the control). Converges with Langston's instrument point.
