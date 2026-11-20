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
▶ **RESUMED 2026-11-20 (KD-99 stop lifted).** **Row 2 C-P5 `STEP: 10 of 11` DONE 11-20** (Step 7 PASS `c0bdb98f5`, Step 8 CONFIRMED by Langston, Step 10 ledger = progress report §6d) · NEXT: row 2 Step 11 only after its other items (`#961`/`#962`/`#1087`, Langston 11-20); at that close flip GE row 39 to open-retired, then resolve `e473d7da`. **`B-XSTOCK-BAR-AVAILABILITY` `STEP: 9 of 11`**: R2 window FAIL (read missed in the stop; sweep dropped 11-09/11-10), pre-audit at `a46a79f7a`; C6 PROCEED (`1573180473671422033`), deployed `85e7ce638`; C6 timing read COMPLETED 471,843/1,200,000 ms, recorded pre-audit + GE re-justified (8bd256bc) at `20ed71345`; C6 RULED PROCEED+3 conditions (`1573271063721287783`). R7 Step 4 CHANGES NEEDED (`1573299718837108808`+`1573304681877348355`) answered in R7c: code `38af683a6`, change list `ede8c7847` (inbox STEP9_R7_R7B_CHANGE_LIST.md §R7c); graded head `b6428d6ef` CI `44745580867` 4/4; re-dispatch sent 13:57Z (`1573336277841875066`), card Blocked on=Langston · NEXT: his verdict before 20:30Z (rides OLD's deploy only if cleared) → Infra cron+dt-install-drift handoff → R2' (window move, migration, DEPLOY_WINDOWS row, GE amend, resolve 3306c5c3 superseded) → Steps 10-11 (~665 s/55%, held-days note); never ack `3306c5c3`. **8c week** (`c15fb88d` 11-23 10:00Z): boundary table row 1 = cc-a `ecbdf882e` 11-20 00:03:38Z, no 9j code, not a boundary (8c plan). `#1250` re-read ~11-21 01:00Z. `#677` watch `db184965` 12-16. Local `.git/info/attributes` has DEPLOY_WINDOWS merge=union.
▶ **CLOSED 11-14:** `B-GUARDRAIL-FAIL-CLOSED` (`#1081`, report in Batch Completion; gap → `#744`) and `B-CRON-MISSED-CATCHUP` (deployed `9591ba8c2`; report in Batch Completion). feed_integrity insert-collision defect put to Kyle (no batch without his list). INIT/USD VTS no-decision alerts recur: book too wide, refusal correct, self-clears; not for Kyle. Preserve the untracked `.claude/launch.json` (and any withheld completion-report draft).
▶ **ANALYST CODEX 2026-11-11 — active-fill alert `78be13a6-bf2b-489b-8c6a-94686254830c` (CHPT replay row) stays active/unacked by design; 11-16 b0672b57 NWL + c3de1862 CPB same class, left active; no Kyle route.**
▶ **ANALYST CLAUDE 2026-11-13 — KD-19 `B-PRICE-SIDE-BY-JOB` (b)+(c) exit leg DONE — `STEP: 11 of 11` CONFIRMED by Langston 2026-11-13 (record progress report §9.11). Parent stays open (8c, #1250, KD-19 entry leg); at parent close flip its open rows to open-retired BEFORE resolving 1ae9a06b.** Evidence §8 of `Change Lists/B_PRICE_SIDE_BY_JOB_KD19_STEP7.md` at `ae571e113b0f`; alert `7e20ed0f` RESOLVED (its recorded evidence sha is mistyped past char 9 — corrected of record at `9bbc55f06`).
▶ **ANALYST CLAUDE 2026-11-15 — `#1250` `B-PRICE-SIDE-BY-JOB` `STEP: 9 of 11` (the SBET fix, Step 7 waiting on market) · `NEXT STEP: 7` re-read at the window close.** Fix LIVE 2026-11-15T04:22:48Z at `3e2504129` (joint deploy by OLD; Langston PROCEED code `1571370392256258239`, fold `1571375066460193001`); build verified; resting xStock RTB rows at the boundary = 0. DEPLOY_WINDOWS row open (cc-c) to 5th US session, expected 2026-11-21T01:00Z — close it with a `close` row then. Re-read PASS = active ≥3 / VTS ≥50 rebased r_multiple legs, 0 inconsistent, 0 malformed; count planTick≠fillTick; booked R vs r. Records: change list "Step 9", pre-audit §13/§13.1. Read at `9ef4c35e2`; `ac78c006` RESOLVED. UI leg DONE by me in Chrome 11-15 22:34Z, PASS (GS rebased target on screen; `7d6a11f65`) — Kyle said a session does it. KD-84 hold MET (Langston PROCEED NEW r8): **8c ON 11-16 09:45:01Z (KD-91)**; 1st sided open LIGHTER 10:43Z, UI PASS; week read alert `c15fb88d` 11-23 10:00Z (25-40 opens; <10 ⇒ stop). Record: 8c plan §13-SWITCHED-ON. Then `8c-OFF-REMOVAL` after Step 7/8. DB reads: `ssh root@188.245.193.8 "dt-sql -c '...'"` ONLY (B-DB-READ-TOOL, KD-96; CLAUDE.md §7). KD-82: 3n.c boot half → NEW, row 172.
▶ **ANALYST CODEX 2026-11-10 — R2 window state SUPERSEDED by the R2 FAIL + C6/R7 line above.** Kept: daily tallies `0bf1414d`/`507072de` never ack, close with counts at the final read; 11-16 row `1c849e4b` = 573 fails in the 04:20-05:20Z DB outage — judge exclusion then (Infra `1571771511357046825`).
▶ **OTHER OPEN WAITS PRESERVED BY KD-70 PRUNE (2026-11-10).** `B-PRICE-SIDE-BY-JOB` 8c ON since 11-16 09:45Z (KD-91). `B-XSTOCK-BID-TRIGGER-RELAND` C-P5 retirement `STEP: 7 of 11` (row 2 sub-batch): Step 4 APPROVED (Review=Approved), CI `43798998284` 4/4, DEPLOYED `8fac86e5e` 11-16 03:39Z (7 windows named); clean. NEXT: Step 7 read after Mon 11-16 session (alert `3c04dd63`, 11-17 02:00Z) → close DEPLOY_WINDOWS row → Step 10 (SIM:2923, #943, AF named impact, catalog/history; SM done) → row 2 Step 11 (flip GE row 39, resolve e473d7da). `e473d7da` resolves only at close. Increment 4c done through `STEP: 10 of 11` 2026-11-13 (Step 7 PASS, Step 8 PROCEED; ledger §3f). Row 2 now waits only on C-P5 (11-16) for its own Step 11; at close flip GOVERNANCE_EXCEPTIONS row 39 to open-retired, push, THEN resolve e473d7da (Langston). `3n.q8` residual stalled-store alert and ring-age work remain in row 2 increment 1.

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




✅ **F-G-1 + `B-OHLC-WRITE-ORDER` CLOSED 11-06 (Langston Step 11); `#705` re-homed to `3b.h-8`/`#1032` (must splice after success).** **`3n.q7` inc-1 (+amendment `30bf12df4`, approved) `STEP: 5` · `NEXT: 6` D1. inc-2 `STEP: 5` DONE (Step 4 approved, CI 4/4) · `NEXT: 6` in deploy B; Step 10 resolves `4cae3f6e`+`bf86001f`. Declared OPEN (GE). Extractor crontab via Infra before day 14.** **`#1081` `B-GUARDRAIL-FAIL-CLOSED` — `STEP: 5 of 11` DONE (Step 4 approved; nits `bcfdee7a0`, CI `36500554369` 4/4) · `NEXT: 6` at D1; Step 8 observable `CHECK_THREW` (zero = unexercised). `#1086` 4.b2.** ✅ **PAPER-STANDARD r12 LANGSTON-APPROVED (`2fd667240`); §4 is Kyle's. `#1087` (3b.b-b): dead arm ships only WITH the qty-zero fix.** Homes: `#1080`-`#1085` (rows 3n.y, 3b.h-9, 3n.z, 4.b1, 3n.z2). ⛔ **Never push while a CI run is pending: it cancels it.** 8a-P4c read at 2026-09-30T00:00Z.

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

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (Langston 2026-08-01):** the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's** (lane partition 08-07). ⛔ **xStock exit-skip alerts are exposure-checked and LEFT ACTIVE — no ack, no resolve; they are the signal.**

⛔ **LANGSTON'S MEMORY.md IS COMPOSED FROM PARTS — write ONLY via `langston-memory-write --part <part> --expect-sha <part sha> ... < body`; a direct edit locks the composer for EVERY session.** Part name WITH `.md`; `--ledger-delta 0 --retractions-delta 0`; build the draft under `umask 077` and delete it in the same command (a world-readable /tmp draft raised `2b6a2da7`, 2026-11-05).
⛔ **NEVER A BACKTICK INSIDE A TAGGED TEMPLATE LITERAL** (``sql`…` ``) — it ends the string; tsc far BELOW baseline = a parse break, not a fix (2026-09-03).

★ OBJ-9: do NOT move `active_fill_max_age_ms` (15 s); counts in `scripts/analysis/obj9_counts_v2.sql`.

➕ **`#994` KYLE DIRECTIVE, MINE: staleness because the US market is SHUT must not raise a breakage alert; staleness because OUR feed is impaired must.** OBJ-9's alert-policy requirement; discriminator = feed-wide liveness (the other ~478 books are the control). Converges with Langston's instrument point.
