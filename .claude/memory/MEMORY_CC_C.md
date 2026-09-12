# MEMORY_CC_C.md — Claude Analyst (CC-C) Volatile Working-State

> ★ NAMED 2026-07-19: **"Claude Analyst"** (alias **CC-C**, roster-bound). Discord display name **"ANALYST Claude"** (the `--sender` value); wake keys "Claude Analyst"/"Analyst Claude"/"CC-C" in `cc-wake-filter.py`. Arm with ALIAS `CC-C` — never CC-A/CC-B. *(The "SPEAKING:" prefix is RETIRED with Telegram — `--sender` IS the label.)*

> ★ LINEAGE (settled): this shell was the ORIGINAL Claude New, revived 07-19 as the Analyst. **I am NOT Claude New; never arm a CC-B watcher.** Stale TaskList entries are inherited. Roster: `.claude/cc-session-roster.json`.

## YOUR ROLE (Kyle 2026-07-19): **paper-trading results ANALYST (standing)** — analyse active paper results; find what can be calibrated NOW.

**★ THE STANDING WORK LEDGER (Kyle 2026-08-20): `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` — re-read it AFTER EVERY batch/sub-batch close, update statuses, ADD findings that should become batches.** Part D = the unwind queue; A6 awaits Kyle's pick; A7/#618 = highest-priority untouched (risk envelope).

## ARMED

7. **Weekend posture:** `#531` — active-path xStock positions have NO weekend mechanism; options paper → Kyle ruling pending. **xStock trades 24/5 (Sun 8pm ET → Fri 8pm ET); US holidays pause.**

## YOUR DATA SOURCES (psql via staging: `ssh root@188.245.193.8` → deploy → `set -a && . ./.env` → `psql "$DATABASE_URL"`)
- **`closed_trades`** — realized active-path results; THE fee-viability population. ⚠️ **always filter `closed_at IS NOT NULL`** (rows are written AT OPEN). Post-2026-07-28: gross on ACTUAL fills, `total_cost` = fees only — **aggregates spanning 07-28 11:57Z mix two denominators.**
- **`active_open_positions`** / **`rtb_signals`** (genesis metadata: regime/DBS/pattern/pool/rankAtPromote) — selection forensics. **`vts_open_trades`** = the wide learning population, SEPARATE from active, never blended.
- **`/api/active-engine/trades/analytics`** — the rolling summary Kyle sees; the EV-reject breakdown + Filter-Diagnostics counters show where signals die.
- Mechanics: `net-expectancy-kernel.ts`, `decideMakerTaker`, friction model. Context: **`…/Scope Files/P25_SCORING_STACK_PRESTUDY.md` §7** (READ before any retire/calibrate opinion), `POST_AUDIT_ROADMAP.md`, `PHASE_19_PLAN.md`, the two pipeline audits.
- ⚠️ **SCHEMA TRAP — A COLUMN'S NAME IS NOT ITS CONTENT. `closed_trades.trade_mode` holds `'TARGET'`, NOT paper/live** ⇒ filtering `trade_mode='paper'` returns ZERO and reads as "no trades". **★ the `positions=N` token in `out__*.log` is NOT the open-position count** (read 2 while the DB held 8). **Open positions ⇒ `active_open_positions`; closes ⇒ `closed_trades`. NEVER a log token.**

## STANDING BEHAVIORAL RULES (unchanged, they bind you too)
✅✅ **WRITE SCOPE — FULL. NO PER-BATCH GRANT. ASKING FOR ONE IS A DEFECT (Kyle, 2026-08-30, emphatic).** **I IMPLEMENT, including TRADING-BEHAVIOUR code, same as CC-A/CC-B, and have for months. I ALSO SPIN UP INDEPENDENT FRESH READERS WITHOUT ASKING.** ⛔ **The old “read-only except governance/tooling” line was stale by MONTHS and I kept citing it to stop work — `#941`'s class, in my own file, costing throughput.** ⛔ **Langston reviews; he is not a gate I wait behind before starting.**

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
**★★ FILE-FIRST TO LANGSTON, ALWAYS — and 2026-08-23 measured WHY.** A long inline dispatch hit `claude timeout after 900s` and the bridge logged *"error … suppressed in channel"*, so it was indistinguishable from silence; my re-poke then deepened his queue. **Stage the content at `/home/langston/inbox/<BATCH>/` and post a SHORT pointer naming the path.** He is stateless per-invoke, so a correction message does not carry the thing it corrects.

## ★★★ CURRENT POSITION (2026-09-11) — READ FIRST

⛔⛔ **THREE THINGS IN FLIGHT — READ THE RECORDS, DO NOT RE-DERIVE:**
0. ⭐⭐ **TOP PRIORITY: PRICING. `3n` `B-PRICE-SIDE-BY-JOB` r5 — OBJ-7 `STEP: 8 of 11` DONE (deployed `b597f1bf2`). `NEXT STEP: 9 of 11` → OBJ-8, the decision layer (commit 2, rows 8a-8k; Step 2 approved 2026-09-11 15:58Z).** ⛔⛔ **EVERY OBJ-7 DETAIL LIVES IN `Change Lists/B_PRICE_SIDE_BY_JOB_OBJ7_CHANGE_LIST.md` — STEP 7, STEP 8, STEP 9 and PRE-REGISTRATION r3. READ IT THERE; DO NOT RE-DERIVE FROM HERE.** P-7j FAILED and was ruled (A) with all four conditions discharged; P-7a MET, no revert; his three residuals homed as scope rows `8j`/`8k` with plan items `P-8j`/`P-8k`. Step-4 carry: OBJ-8a waits on F-G-2 §4 (resolve `cbb55dc9`). ⛔ **ORDER: OBJ-8 → xStock fees (CC-B) → reachability (row 4 `F-5`). `#951` waits `0db25f1d` (09-16). The $0.25 floor STAYS. Stop chasing alerts and side batches.**
0.a ⭐ **2026-09-12 — THREE FINDINGS FILED, NOTHING IN THE SYSTEM CHANGED. DERIVATIONS ON `#937`, `#1049`, `#958`; DO NOT RE-DERIVE HERE.** **`#937`:** the quote-currency remedy the ledger named is **INERT** (no reader; a reporting counter on a hard-coded literal; `kraken.ts:724` a DEAD assignment on the wrong key). ⚠️ **My August `array_length` read was a `wrong-object`.** ★★ **The gate that DOES fire is on the B74 ARCHIVE path ⇒ WE ARCHIVE ONLY DOLLAR-QUOTED PAIRS AND TRADE ANY QUOTE.** `kraken-mirror-balance.ts:29` asserts a parity that does not hold → Phase-21, beside `#734`. **`#1049`: the SCANNER IS FINE** (1,449 universe, 319-356/cycle, xStock 457 of 475) — **the collapse is the FILTER STACK: 134 distinct crypto/day, 216→134 in six days, cause NOT established.** **`#958`: 105 of 271 xStock closes sit on SEVEN session-boundary minutes; CONTROL crypto 1 of 479 ⇒ the VENUE. Decisions taken on prices up to 92.7% off (`NOW/USD` = a `stop_hit` booked +$6.53). They look BETTER than the rest — that IS the harm.** ⇒ **§9.4(1) folded into OBJ-8: a collapsed book at a boundary must REFUSE, not yield to the midpoint;** flag predicate registered before any run (n=105, a minute-of-day PROXY that over-captures). **PLACED: `12.7 B-QUOTE-CURRENCY-DENOMINATION` (Kyle's own) · `12.8 B-SCAN-BREADTH-DECLINE`.** ⏳⏳ **OPEN WITH KYLE: the interim quote block is NOT a config change — (a) wait for 12.7 or (b) a Langston mini-cycle at `kraken.ts:724`, inert until a row is populated. I recommended (b).**
0.b ⛔⛔ **`B-SIZING-DEC-RESTORE` IS MINE, OPEN AND HALF-LIVE — DECLARED IN `GOVERNANCE_EXCEPTIONS.md` 2026-09-12 (`08e8a535d`); alert `5e7f581a` RESOLVED on that evidence after 13 re-surfaces.** **obj-1 fixed-notional sizing + obj-10 + obj-11 LIVE at `213e162dc` — it SIZES EVERY TRADE TODAY; obj-2/3/4/5 and Steps 4-11 NOT BUILT.** ⚠️ **The resumption's home DID NOT EXIST and I PLACED it: `PHASE_19_PLAN` CC-C RUN ORDER banner after the `P19-B-PERPFEED` bullet (its 08-20 close IS the start signal). Scope includes `#698`.** ⛔ **Queue position vs the price work is KYLE'S — do not re-sort.** ⚠️ **Langston's `owner=CC-C` markers are INEXPRESSIBLE (enum + wake filter still CC-A/CC-B/Kyle) — verify ownership at the ALERT ROW and my checklist, NEVER the marker.**
1. **`B-OHLC-FRAME-GUARD` (`#1028`, `3b.h-6`) — PAUSED at `STEP: 7 of 11`. Deployed `29cce1076` (rollback `c52c577fd`); Step 4 APPROVED r2; CI 4/4. ONLY the on-screen panel check is left — opening staging needs no permission.** `#1037` filed (archive-writer drops while the Drift Dashboard loaded; review at `3b.h-8`). ⛔ **C1's example was WRONG at the sink (PG accepts `0x10`); gate the UNTRIMMED string.**
2. **`3b.f-c` — §14 withdrawn · §15 discriminator behind F4 (ripe? fold into `#943`?) · §16 Newmont = genuine thinness + a 249 s frame drought (capture-stamped, writer never stalled).** ⛔ **Appends renumbered §11-13 → §14-16: a `§13` citation means the ORIGINAL.**
3. **`CODEX_FINDINGS_REGISTER.md` — r14, READY (Langston).** ⛔ **Do NOT dispatch to Coltrane until `#1027` clears** — his refresh fails git's OWNERSHIP guard (root vs a langston-owned mirror), NOT auth. CC-INFRA's.
⚠️ **`#1026`: a Langston dispatch >2000 chars splits and the orphan half can wake `coltrane-bot`. GATE EVERY SEND ON `wc -c` < 1990 — "keep it short" failed by 129 chars.**
⚠️ **OPEN WITH LANGSTON: he routed `price-skip-paper-*` alerts to me though my note reserves them to CC-B; I resolved them on his routing. Settle it.**
⛔⛔ **A FOURTH CAPTURED FEED EXISTS — `xstock_perp_ticker_snap` (renamed from `equity_perp_*` by B79.0e), LIVE, 7.1M rows all-time. §1 never listed it.** ⚠️ **My first query GUESSED the table name and returned null — ENUMERATE, NEVER GUESS.**
⛔ **CODEX DISPATCH IS HELD until §6 clears. Brief + prompt COMPLETE: `Scope Files/CODEX_PRICING_ARCHITECTURE_BRIEF.md`, `CODEX_PRICING_PROMPT.md`.** ⛔ **"What to distrust" was Langston's and Kyle STRUCK it — do NOT reinstate; it biases the reviewer's search.**
⛔ **KYLE 2026-09-07: use the governance skill's LEDGER FORMAT when reporting Step 10 — name every document, strip the folder, keep the name. Not my own table shape.**
⛔⛔ **THE STALENESS GATE IS THREE TERMS, NOT ONE — my `age AND feed-not-live` was REFUSED and he is right: a term ANDed onto a fail-CLOSED gate can only WIDEN it, and it passes per-symbol subscription death behind a healthy socket.** CELLS: **old+feed-dead → refuse whole-feed · old+feed-live → SUSPICION, NO auto-pass · fresh → transact.** **Term 2 = the SYMBOL'S OWN expected inter-arrival; term 3 = feed liveness as a DISTINCT-SYMBOL COUNT, never recency — one chatty name keeps a gauge green.**
⭐ **THREE MEASURED NUMBERS, RE-DERIVABLE, FULL FORM IN THE `3b.f-c` RECORD:** ticker time-average age 1,188.5 s over 467 symbols (**LENGTH-BIASED — the 18.2 s median understates it ~65x**) · pure-heartbeat rate 0.02% over 29,307 pairs ⇒ **Kraken's ticker is EVENT-DRIVEN, so a gap means QUIET, not LOST** · live cache 161 REST-sourced vs 9 WS-sourced of 170, ⚠️ **read 2.5 min after a restart, warm-up UNEXCLUDED.**
⛔ **THREE WRONG-POPULATION/CONTAMINATED NUMBERS RETRACTED THIS BATCH (detail in the batch record):** `rtb_signals`=2 all-time · the 44.6% repeat rate was stablecoins · the active p50 was the POST-RESTART COLD PERIOD inside a MONOTONE ACCUMULATOR (246 s later it read `2000-5000`). ⇒ **READ THE INTERVAL, NEVER THE TOTAL.**
⭐⭐ **THE PRICE-CACHE BUCKETS ARE REFRESH CADENCES, NOT DATA PARTITIONS (`#977` am. 3+4) — DERIVATION ON THE ISSUE.** ONE `Map` (`price-cache.ts:101`); ⇒ **the ACTIVE lane reads it by symbol with NO bucket arg and inherits VTS's 60 s cadence for the ~180 symbols only VTS subscribed.** ⛔ **Rule-24 outcome (2), Kyle's scope call; NO HARM MEASURED.** ⚠️ **`lastUpdatedAt` may be inert as liveness — three REST writers advance it, so it tracks OUR poll loop.**
⛔ **AND THE LIVENESS FIELD AS SHIPPED MAY BE INERT: `lastUpdatedAt` is advanced by THREE REST writers, so it tracks OUR POLL LOOP, not venue pushes. Verify before any gate reads it.**
✅ **`B-XSTOCK-FEED-SANITY` (`#943`) CLOSED 2026-09-11, INCONCLUSIVE — I specified the after-each-handoff `out.log` extraction and did not run it; `#1044` exists because of that.**
⚠️ **ALERT `5b2849e0-e586-4fa5-80a7-d851ad7c5702` — MINE, deliberately NOT acked (an ack silences it, `#982`). Fold notify-suppression into `3b.f-c` per `#994` am.1-3; EMIT stays, NOTIFY goes.**

⭐ **PRICE-SIDE (`3n` `B-PRICE-SIDE-BY-JOB`, delegated to CC-C+Langston) — THE FOUR JOBS, THE RULE AND PER-LEG TRANSACTABILITY LIVE IN THE SHARED `MEMORY.md`; READ THEM THERE, NOT HERE.** **Only what the shared copy lacks:** midpoint is built at the FEED layer (`kraken-v2-translator.ts:73` overwrites v1 `c`); levels set at `signal-orchestrator.ts:2387`/`:2276-2278`; trigger `aee:1503`. **Spreads: median 0.199% crypto / 0.395% xStock, xStock p90 11.784%.** `F-G-2` OBJ-0 lands FIRST.

⛔⛔ **REACHABILITY NEEDS NO CLEAN WINDOW — I told Kyle it did and the plan's own cell said otherwise (`wrong-object`, corrected 2026-09-03). `F-E` grades the 547 closed trades already in hand.** **SEQUENCE: `3n` → `F-5` structure → `F-E` on existing history → the reach FIT → THEN the paper reset + clean window. THE RESET IS LAST — opened earlier it measures the old ruler again.**

✅✅ **`3b.f-c` `B-XSTOCK-SESSION-FRESHNESS` — Kyle's blocker DISCHARGED 2026-09-03. FULL RECORD `Scope Files/B_XSTOCK_SESSION_FRESHNESS_ESTIMAND_REGISTRATION.md` §10 — re-read AT THE REF at ruling time, never from memory. (ii-r) is CC-B's; I write nothing into it.**

⛔⛔ **DURABLE — PM2 SPLITS THE APP'S STREAMS: `console.log` → `out.log`; `console.warn`/`console.error` → `error.log`. EVERY exit-path skip/refusal line is warn/error.** **CONTROL: `EQUITY_MARK` = 0 matches in `out.log`, 1,031 in `error.log`, same window.** ⇒ **NEVER read an exit-path ZERO from `out.log` alone — it is `#661` leg 3 waiting to happen.**

★ **LI/USD `ab16f068` = the first live-exposure case of the OBJ-9 staleness class (not OBJ-6 hollow). Not a defect — `budget_k` sizes the blind window by design; the live form of `#563`. All five exit-freshness alerts stay ACTIVE under the `#951` rule — no ack, no resolve.**

⏳ **`B-PRICE-AGE-TRUTH` (`#951`) EXTENDS — record `B_PRICE_AGE_TRUTH_COMPLETION_REPORT.md` §9. Traps: JOIN observedAtMs WITH producer; ENUMERATE producers, never `LIKE`.**

⛔⛔ **THE MACHINERY AUDIT IS THE LIVE WORK — `1-system-manual/EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md`, NOW §0-§10. READ IT; DO NOT RE-DERIVE FROM HERE.** §8 provenance · §9 the second independent audit · **§10 = THE CORRECT DESIGN, DRAFT 1.**

⛔⛔ **KYLE'S STANDING DIRECTIVE: ITERATE TO COMPLETION WITH LANGSTON + SECOND READERS THROUGH THE GOVERNANCE STEP. Step-report blocks only; STOP ONLY for a decision that is HIS.**

⭐ **USE SECOND READERS FOR LOAD-BEARING PIECES AT EVERY PIVOTAL STEP.** ⚠️ **His caution: readers surface incidental nitpicks and sometimes claim wrong things — FOCUS ON LOAD-BEARING, verify, and do not let a retraction reach implementation.** ★ *"I want this to be perfect... it's very late to be noticing we don't have the right prices feeding in. I'd assumed for months that was foundational."*

✅ **THE xSTOCK PRICING PLAN IS THE LIVE ARTIFACT: `1-system-manual/XSTOCK_PRICING_PLAN.md`** — 6 problems, 6 solutions, the order; **P6 (which price per job) = KYLE'S.** Read it there; do not re-narrate here.


✅ **F-G-2 SPLITS BY ASSET CLASS (Langston): crypto legs on the F-G-1 soak alone; xStock legs behind 3b.b + 3b.d (plan row 3c). CARVE-OUT: no `observedAt`/`cachedAt`/age-derived value as a sample filter or covariate (scope §0).** ✅ `B-EXIT-PROVENANCE` CLOSED (#954 for the two nulls). ★ **A batch held open by a close gate owes governance TWICE — body ship AND gate close; a PROGRESS REPORT holds the open state.**

➕ **PLACED: `#965` (3b.j — T2 *is* enforced at `aee:3570`, the scanner check is dead legacy) · `#966` (5.a — non-USD quote denomination, DIRECTION PER QUOTE: BTC overstates/fail-safe, a SUB-DOLLAR quote INVERTS and is too PERMISSIVE) · `#967` (5.b — the $0.25 active price floor excludes DOGE *and* ADA, KYLE'S DECISION) · `#968` (3b.k — change-class marker needs line-start AND colon OUTSIDE the bold).**

⏳ **`F-G-1` — window CLOSED 2026-09-04 (crypto PASS n=24, xStock underpowered n=19); CONVERSION OWED. OBJ-9 ① AND ② both unmet in production (`#1031`, progress report §7 + am.) ⇒ reopen BOUNDED to the ordering guarantee (Langston 09-11); writer residuals → `3b.h-8`.** Read the verdict on the INTENT-side columns; `entry_price` is the fill.

✅ **RATCHET — CONFIRMED OFF, AND IT IS KYLE'S OWN DECISION WITH A REASON THAT HAS EXPIRED.** 0 break-even latches in 705 states; `break_even_enabled=false` on all four classes since May. ★★ **HIS REASON (2026-08-30): break-evens exited trades BEFORE WE COULD SEE HOW THEY FINISHED — AND THAT WAS WHEN WE WERE VTS-ONLY, NOT PAPER TRADING.** ⇒ ⛔ **THE CONDITION IT RESTS ON HAS CHANGED. RE-ASK IT; DO NOT TREAT IT AS SETTLED.**

⭐⭐ **MISTAKE SLUG, MINE: `vendor-docs-unread`.** ⛔ **TRIGGER: the object is operated by SOMEONE ELSE (a venue, an API, a hosted service) ⇒ its behaviour is DOCUMENTATION BEFORE IT IS DATA. Read the operator's docs, then forums, THEN instrument.** ⚠️ **Self-concealing — every measurement SUCCEEDED, so it felt like progress. NOT docs-instead-of-measure: only measurement found the 27.1%.**

⛔⛔ **LANGSTON'S STANDING RULING ON THE AUDIT: findings survive as MEASUREMENTS and are NOT CERTIFIED AS DISPOSITIONS.** The exposed class is **any sentence asserting behaviour is unintended/undecided/unspecified, WHEREVER IT SITS** — my findings-vs-proposals split was *"the wrong cut, and it fails in your own favour."* ⇒ **uncertified until `#956`/`B-DECIDED-INTENT-INDEX` (3b.g) lands.**

## ★★ A NEGATIVE CONTROL IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT (`#507`; the repo holds the case)

I established a MECHANISM then hung THREE damage figures on it from instruments I never validated. **All three WITHDRAWN; Langston reproduced none.** ★ **The control sat one `GROUP BY` away: maker exits never read the book, so an honest instrument must be SILENT on them.** ⇒ **Applies to a POSITIVE result as hard as to a zero.**

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ AFTER ANY DISPATCH, READ THE INBOX ON THE NEXT WAKE OF ANY KIND — the watcher missed two Langston replies on 2026-09-02 (12:20, 13:10).** MDT `b1f58a01` stays ACTIVE to 09-07 (Langston ratified 19:00Z; record in `B_PRICE_AGE_TRUTH_COMPLETION_REPORT` §4).
**⚠️ #1 ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER** — ALIAS **CC-C**, display **“ANALYST Claude”**. **Compaction KILLS it.** Arm via Monitor per shared MEMORY 4.5 (`persistent: true`, NEVER Bash run_in_background). **Judge liveness by whether WAKE events arrive; doubled ⇒ TaskStop one.** Then sweep `/var/log/cc-discord-inbox.jsonl`.

## RECENT HISTORY — CLOSED (the repo completion reports are authoritative; do NOT re-narrate here)

⚠️ **CLOSED-BATCH NARRATION CUT — repo completion reports are authoritative. LIVE carries only:** `#618` VOIDED P19-B6 risk-envelope approval (**highest-priority untouched**) · `B-KILLSWITCH-WINDOW` denominator leg → `B-READER-TRUTH` obj-6 · `#632` · `#624` · `#677` (49/241) · ⚠️ **the `%` basis changed at the 07-28 11:57Z cutover.**

## ★★ STANDING LESSONS — the ones that keep re-earning their place

1. **A MATCHING NAME IS NOT A MATCHING THING** · **A CONTROL THAT CANNOT FIRE IS THE DEFECT IT GUARDS — write BOTH arms** · **CAPABILITY ≠ COVERAGE: state the time reach** · **NAME THE POPULATION AND THE REF BEFORE THE NUMBER — a deploy time is not a window anchor.**
6. **TWO RULES I AUTHORED are in `CLAUDE.md` (auto-loads — read them THERE): r24.a investigate-before-announce, r29 measurement discipline.**

**★★ `wrong-object` — THE PATTERN THAT KEEPS COSTING ME (cases: `MISTAKE_PATTERNS.md`).** ★ **Only a MEASURE-TIME GATE has ever caught it.** ⇒ **BEFORE ANY CLAIM: read what the column is DEFINED as · RUN THE CONTROL ON THE OBJECT THE CLAIM IS ABOUT · and when you read a value at a CONSUMER, TRACE ONE HOP UP BEFORE GENERALISING ABOUT THE PRODUCER (F-G-2 §17).** ⛔⛔ **MY CORRECTIONS ARE THEMSELVES WRONG-OBJECTS — RE-DERIVE ONE LIKE A FINDING.**

**MY OPEN ISSUES — NUMBERS ONLY; `RUNNING_ISSUES` AUTHORITATIVE:** **#734 = PHASE-21 GO-LIVE BLOCKER** (`apm:165` THROWS in live; TWO independent trips) · **#733** (BLOCKS `dt-deploy`) · #687 #688 #689 · **#690 residual: audit-FAILs have NO alert path** · **#692: a DOWNWARD re-anchor strands legacy-notional positions above the new budget ⇒ ZERO opens until they close; RECURS.**

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (Langston 2026-08-01):** the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's** (lane partition 08-07). ⛔ **xStock exit-skip alerts are exposure-checked and LEFT ACTIVE — no ack, no resolve; they are the signal.**

⛔⛔ **NEW DURABLE RULE, LEARNED THE HARD WAY 2026-09-03: NEVER PUT A BACKTICK INSIDE A TAGGED TEMPLATE LITERAL** — my markdown-style `` `code` `` in a SQL comment inside ``sql`…` `` terminated the string and broke the parse of `ready_to_buy_service.ts`; tsc fell 377 → 16 and the push guard refused on exactly the partial-parse signature it exists to catch. **A tsc count far BELOW baseline is a parse break, not a fix.**

★ **OBJ-9: DO NOT MOVE `active_fill_max_age_ms` (15,000 ms) — read the counts from `scripts/analysis/obj9_counts_v2.sql`, never from memory. The refusal shares once here were weekend-contaminated and are deleted rather than corrected.**

➕ **`#994` KYLE DIRECTIVE, MINE: staleness because the US market is SHUT must not raise a breakage alert; staleness because OUR feed is impaired must.** OBJ-9's alert-policy requirement; discriminator = feed-wide liveness (the other ~478 books are the control). Converges with Langston's instrument point.
