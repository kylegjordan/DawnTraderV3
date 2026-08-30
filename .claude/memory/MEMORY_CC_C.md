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

## ★★★ CURRENT POSITION (2026-08-30) — READ FIRST

⛔⛔ **THE MACHINERY AUDIT IS THE LIVE WORK — `1-system-manual/EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md`, NOW §0-§10. READ IT; DO NOT RE-DERIVE FROM HERE.** §8 provenance · §9 the second independent audit · **§10 = THE CORRECT DESIGN, DRAFT 1.**

⛔⛔ **KYLE'S STANDING DIRECTIVE (2026-08-30): ITERATE TO COMPLETION ON `B-EXIT-BOOK-AGE-STAMP` WITH LANGSTON + SECOND READERS, ALL THE WAY THROUGH THE GOVERNANCE STEP. DO NOT STOP TO REPORT MISTAKES OR COMMENTARY — step-report blocks only. STOP ONLY FOR A CRITICAL DECISION THAT IS HIS.**

⭐ **USE SECOND READERS FOR LOAD-BEARING PIECES AT EVERY PIVOTAL STEP.** ⚠️ **His caution: readers surface incidental nitpicks and sometimes claim wrong things — FOCUS ON LOAD-BEARING, verify, and do not let a retraction reach implementation.** ★ *"I want this to be perfect... it's very late to be noticing we don't have the right prices feeding in. I'd assumed for months that was foundational."*

✅✅ **THE PLAN IS WRITTEN AND IS THE LIVE ARTIFACT: `1-system-manual/XSTOCK_PRICING_PLAN.md`** — 6 problems w/ measured costs, his 3 questions answered, 6 solutions, the order. **P1 freshness guard = 15s (matches entry; feed throttle is 4s so tighter is unachievable — 2s would block 134/236). On block: HOLD + re-evaluate. KILL SWITCH + FORCE-CLOSE EXEMPT.** **P2 resting sell reads BID not mid.** **P3 no data ⇒ no entry (kill the passing sentinel).** **P4 plausibility gate, CAUSAL not clock.** **P5 instrumentation (DEMOTED to 5th on Kyle's correction — age is already computed; recording it makes the FINDING readable, it is NOT needed for the fix).** **P6 which price per job = KYLE'S.**

⛔⛔ **`B-EXIT-BOOK-AGE-STAMP` — OPEN, OBSERVATION WINDOW. Full record: `B_EXIT_BOOK_AGE_STAMP_PROGRESS_REPORT.md` (authoritative — do NOT re-narrate here).** Deployed `104fa755b` 2026-08-30T12:05:09Z, Langston approved, CI 4/4, card `Observation`. **Criterion pre-registered BEFORE data + armed as alert `65a1379e`, fires 2026-09-06: 20 post-deploy closes or 7d, excluding `never_filled`.** ⛔ **A MAKER null is a PASS; a NULL/NULL pair is NOT evidence; NEVER `LIKE` on `exit_price_producer` — ENUMERATE.** **Converts to a completion report only when the data is in AND a decision is taken.**

⭐ **BOARD: ALWAYS `--limit 400` AND READ BACK — a truncated listing once made me read absence from a short window and create a duplicate card.**





✅✅ **LANGSTON RULED: `F-G-2` SPLITS BY ASSET CLASS — CRYPTO LEGS PROCEED ON THE F-G-1 SOAK ALONE; xSTOCK LEGS SIT BEHIND 3b.b + 3b.d.** ★ **His decisive argument was MINE to have made: I withdrew the crypto prerequisite 24h earlier (`#944`) then re-imposed a crypto hold on xStock-derived evidence.** ✅ **3 conditions discharged; `#951` DECOUPLED (row BODY edited, not annotated).** ⛔⛔ **CARVE-OUT BINDING F-G-2: may NOT use `observedAt`/`cachedAt`/any age-derived value as a SAMPLE FILTER OR COVARIATE — else the prerequisite REATTACHES BY CONSTRUCTION. Answered in scope r10 §0.**

✅ **`B-EXIT-PROVENANCE` CLOSED** — 19/19 closes carry source AND producer; both nulls `TRUMP/EUR` ⇒ `#954`. ★★ **A BATCH HELD OPEN BY A CLOSE GATE OWES GOVERNANCE *TWICE* — body ship AND gate close — and only the first fired, because no PROGRESS REPORT held the open state.**
⛔ **LESSONS FROM 4 LOOP-CAUGHT ERRORS (record: `#953`):** ⭐ **A CALLER LIST IS NOT A REACHABILITY PROOF — walk each caller UP to a real entry point.** ⭐ **A ONE-DIRECTIONAL CHECK CERTIFIES THE OPPOSITE ERROR — write BOTH arms.** ⭐ **A DOCUMENTED, REVIEWED DESIGN PROPERTY IS NOT A DEFECT — read the comment's own provenance first.**

★★ **§9 VERDICT — NINE INDEPENDENT CONFIRMATIONS incl. EVERY decision-changing finding. Headline re-derived cold: EVERY exit decision reads a MIDPOINT, both classes, both lanes — 23 of 23 stamped closes, ZERO from any last-trade producer.**

⛔⛔ **I REFUTED THE READER'S SCARIEST CLAIM BEFORE RELAYING IT: it said the daily-loss kill switch is blind to 5 of 6 close paths. Observation TRUE (`emitTradeClosed` has ONE producer site); consequence FALSE — `daily-loss-budget.ts:131` → `getRealizedPnlSince` sums `.from(closedTradesTable)` (`storage.ts:3280-3290`). EVERY close counts.** ⇒ ★ **A READER HIT IS A LEAD. RE-DERIVE BEFORE IT MOVES ANYTHING.** What survives: the exit-decision ARCHIVE undercounts ⇒ any population from it is biased to monitor-loop closes.

⛔ **NEW, MINE, PLACED:** `#948` canonical corpus NOT frozen → 3i.c · `#949` **the xStock `book` channel was ASKED, ANSWERED YES (2026-05-28, 20-level, CLOB), OBJECTIVE-ASSIGNED — AND IS STILL NOT SUBSCRIBED TO** → 3b.d · `#950` the feed was built as an archive forbidden to share state with trading, BECAME the trading feed; successor `B79.5` triggered + never built → 3b.e · `#951` **rate-limiter returns a CACHED price, caller stamps `observedAt: Date.now()` = "a genuine venue read", PASSES the actionability gate** → 3b.f · `#952` **the v1 `c` field IS A MIDPOINT while 2 comments call it "a clean ticker PRINT"** ⇒ any ticker-vs-book control compared TWO MIDPOINTS.

✅ **BOOK-CHANNEL PROBE 08-30: `success:true` on TSLA+GLD ⇒ SUBSCRIPTION ACCEPTED TODAY.** ⛔ **ZERO frames — SATURDAY, xStocks CLOSED. NOT evidence.** Say *"subscription accepted; ladder confirmed May, NOT re-observed"*. **Re-probe armed as alert, fires 08-31T00:30Z; script at staging `/tmp/bookprobe.cjs`.**

★ **THE LIVE ROW THAT EXPLAINS IT ALL (08-29 12:42:24): BABA 112/132, last 118.63, engine recorded 122.00 = THE MID TO THE DIGIT, 2.84% ABOVE last, TP 124.5567. Two hours earlier it quoted 118.62/118.63.** The mid walked most of the way to a target on a widening, with nothing traded.

✅ **REFACTOR-OR-RIPOUT, ANSWERED + RE-ARGUED: NEITHER — the parts work, the CONTRACT between them was never written (§8.1). LARGE REFACTOR, SMALL RIPOUT.** ⚠️ **The original argument (*"the parts are not individually broken"*) is contradicted 4x inside my OWN audit ⇒ re-argued on COUPLING + PINNING: `getPriceWithFallback` **10** non-test call sites, `evaluateTECExit` **3**, one depth interface already, **262** test files, an existing shadow lane.** ⛔ **Gap table restated: 5 principles have a batch producing the EVIDENCE; NONE has a batch committed to the FIX.**

✅✅ **`B-SCANNER-EGRESS-NORMALISE` CLOSED 2026-08-30, same-day, NO observation window — deployed `fd81ce18c` 16:36:32Z, Langston approved at the ref, CI 4/4.** **Bitcoin and Dogecoin had NEVER traded: the scanner sent Kraken its own raw wsname and Kraken's OHLC endpoint rejects it for exactly 2 of 661 bases (`XBT/USD`,`XDG/USD` → EQuery; `BTC/USD`,`DOGE/USD`,`ETH/USD` → 721).** One statement at `market-scanner.ts:712` + a guard at `:889`. **VERIFIED TWO-SIDED at the deploy boundary: `XBT/%` 65,268→0 / `BTC/%` absent→126; `XDG/%` 8,738→0 / `DOGE/%` absent→16 across all 8 wsnames; `%/XBT` 42,098→0 / `%/BTC` absent→94; ETH+SOL controls held.** ⛔ **THE GUARD IS THE REAL LESSON: the normalise sits ABOVE the B63.3 prefetch, so it would have handed 31 BTC-quoted pairs the strong-DBS bypass whose live `minVolume` is 0 — `TBTC/XBT` = ~$110/day against a floor of ZERO. Verified at zero `threshold=0` rows.** ⇒ ★★ **SysManual B63.6: A FILTER *BYPASS* MAY ONLY BE GRANTED WHERE THE BYPASSED FILTER WAS MEASURING THE QUANTITY IT CLAIMS TO. UNLOCKING A PATH INTRODUCES EVERY ACTION IT TAKES.**
⛔⛔ **FIVE OF MY CONSEQUENCE-CLAIMS DIED IN REVIEW, EACH TO ONE QUERY: blast radius 26→56 · "repairs INVARIANT T2" (`trades` = 0 ROWS) · "the 31 become tradable" (21,574 low_volume rows) · "BTC and DOGE are one failure" (the `gate_decision` LABEL) · "does nothing for Dogecoin" (THE ARCHIVE IS GATED `!isPassiveLearning` AND CANNOT SEE VTS).** ★ **1-4 = queries I never ran. 5 = A QUERY THE INSTRUMENT COULD NOT ANSWER, WHOSE OUTPUT I READ AS THE ANSWER.** ⇒ **NOT ONE was catchable by re-reading my own work.** ⚠️ **I gave Kyle (2) as the headline justification and (4) as a simplification; both corrected to him directly.**
⚠️ **VERIFIER TRAP: `capturePreFilterReject` writes the POST-normalise symbol, so `LIKE '%/XBT'` returns ZERO after deploy — THAT IS THE FIX WORKING. Anchor on `'%/BTC' OR '%/XBT'` split at the deploy boundary.**
➕ **SPAWNED + PLACED: `#965` dedupe reads `trades` (0 rows) — find where T2 is ACTUALLY enforced, do NOT just fix the dead check (3b.j) · `#966` non-USD quote denomination, DIRECTION PER QUOTE — BTC overstates (fail-safe), a SUB-DOLLAR quote INVERTS and is far too PERMISSIVE (5.a) · `#967` the $0.25 active price floor excludes DOGE *and* ADA while VTS's 0.05 admits both — KYLE'S DECISION (5.b) · `#968` change-class marker needs the token at line-start AND the colon OUTSIDE the bold; `**change-class:**` FAILS, `**change-class**:` PARSES, they render identically, 17 of 329 scope files across 3 authors (3b.k).**

⏳ **`F-G-1` OPEN — OBSERVATION WINDOW. Full record: `F_G_1_PROGRESS_REPORT.md`, FROZEN at `5e5a3d8ae` — DO NOT EDIT report/criterion/suite.** Deployed `56ac8067a`, card `Observation`. **Criterion = self-firing alert `2093a98a`, fires 2026-09-04: 30 crypto opens or 7d, per-class, 100% on-grid NO tolerance.** ★ **Read it on the INTENT-side columns — `entry_price` is the FILL, on-grid by construction.** ⛔ **A post-deploy CRYPTO row unstamped `resolved:true` is a BYPASS finding, never cold-start.**

✅ **RATCHET — CONFIRMED OFF AND IT IS KYLE'S OWN DECISION, WITH A REASON THAT HAS EXPIRED.** 0 break-even latches in 705 states; all 705 `TARGET` mode; live DB `break_even_enabled=false` on all four classes since May (xStock by `kyle-directive-2026-05-21`). ★★ **HIS REASON (2026-08-30): break-evens were exiting trades BEFORE WE COULD SEE HOW THEY FINISHED, so we learned nothing — AND THAT WAS WHEN WE WERE VTS-ONLY, NOT PAPER TRADING.** ⇒ ⛔ **THE CONDITION THE DECISION RESTS ON HAS CHANGED. Re-ask it; do not treat it as settled.**



⛔⛔ **THE ARCHIVE IS A *SAMPLE*, NOT A RECORD: `latestEquityTick` is written per-frame (`:137`, guarded on a finite mark); `bufferTickerSnap` (`:140`) is THROTTLED 4000ms, TIME-ONLY and VALUE-BLIND. Langston: THREE samplings not two — the exit monitor POLLS the map, so archive and exit are TWO DIFFERENT SAMPLES of one stream and a sub-4s excursion is invisible to BOTH.** ⚠️ **MEASURED: 43.6% of distinct engine marks never reach the table, and the loss SCALES WITH SYMBOL SPEED (static 0%, fastest 50%)** ⇒ **every stat on that table is biased exactly where price moves.** ✅ **BUT `closed_trades.exit_decision_price` DOES preserve a completed exit's triggering mark — that is how 13.31 was recovered.**

⭐⭐ **NEW MISTAKE SLUG, MINE, n=1: `vendor-docs-unread`.** I measured for hours toward an answer Kraken PUBLISHES. ⛔ **TRIGGER: the object is operated by SOMEONE ELSE — a venue, an API, a hosted service. If we do not control it, its behaviour is DOCUMENTATION BEFORE IT IS DATA. Read the operator's docs, then forums, THEN instrument.** ⚠️ **Self-concealing: every measurement SUCCEEDED, so it felt like progress.** ⚠️ **NOT docs-INSTEAD-of-measure — only measurement found the 27.1%.**

✅ **RAW-FRAME CAPTURE ARMED + INSTRUMENT PROVEN** (61 frames w/ market shut): cron on staging, `/usr/local/bin/rawcap.cjs`, fires 2026-08-31 00:05-00:25 UTC. Records every frame verbatim incl. `msg.type` + a `book` subscription.

⛔⛔ **LANGSTON'S STANDING RULING ON THE AUDIT: findings survive as MEASUREMENTS and are NOT CERTIFIED AS DISPOSITIONS.** The exposed class is **any sentence asserting behaviour is unintended/undecided/unspecified, WHEREVER IT SITS** — my findings-vs-proposals split was *"the wrong cut, and it fails in your own favour."* ⇒ **uncertified until `#956`/`B-DECIDED-INTENT-INDEX` (3b.g) lands.**
⛔⛔ **F-G-2's OWN FIX WOULD MAKE THE STUB CASE WORSE — THE BID IS THE COLLAPSED SIDE** (NOW −17→−35%, TGT −35→−70% vs true last). ⇒ **BOOK QUALITY IS A PREREQUISITE OF F-G-2.** ★ **Kyle: *“we shouldn't be having ridiculous spreads — root out the issue”*; preferring `last` treats the SYMPTOM.**
✅ **`F-G-2` STEP 2 CLEARED (Langston, 4 conditions applied); card `Implementation`. ✅ NO GRANT NEEDED — I IMPLEMENT IT.** ⛔ **BUT SEE THE AUDIT: book quality is now a PREREQUISITE.** ⛔ **`OBJ-3` narrowing FAILED — stands BOTH classes; `_eqTick.price` IS A MID TOO** ⇒ ★★ **TRACE ONE HOP UP FROM A CONSUMER BEFORE GENERALISING ABOUT THE PRODUCER.** ➕ **`FINDING A1`: a 4th exit impl (`strategy-engine:1106`), DEAD → 3h.b.**
⛔⛔ **`#943` IS A RE-DISCOVERY; the class is CC-B's — the entry titled *“A MARK CAN BE PERFECTLY FRESH AND STILL WRONG”* (`#85-REHOME`), NOT the dissolved `B-XSTOCK-EXIT-PLAUSIBILITY`.** ⚠️ **CITE BY TITLE — `#567` is COLLIDED.** ★★ **I FOLLOWED ONE RE-HOME POINTER AND STOPPED; IT HAD MOVED TWICE** ⇒ **CHASE A RE-HOME TO ITS LAST HOP; SEARCH BY BEHAVIOUR AS WELL AS COMPONENT.**
✅ **OBJ-2 SOLVED — A BOOK-WIDE PREDICATE (fraction of the WHOLE book stubbed ±90s): cohort median 17.52% vs 0.04%; at ≥10% = 59/65 sens, 166/167 spec, computable TODAY.** ★★ **MY “blocked on `#911`” WAS A WRONG-SHAPE ERROR — I hunted a PER-SYMBOL signature for a BOOK-WIDE event.** ⇒ ⛔ **WHEN A ROW'S OWN OBSERVATION IS MISSING, ASK WHAT THE REST OF THE POPULATION WAS DOING.** ⚠️ **10% cut is POST-HOC — pre-register before gating.**
⛔ **`#940` INVERTED (witness right, witnessed thing wrong) · `#941` both maps ASSERTED the OPPOSITE of the code — FIXED · `#942` the no-silent-drop guarantee EXCLUDES `info` — KYLE'S. ★ ADJUDICATE A TWO-WAY DISAGREEMENT WITH A THIRD SOURCE; silence invites a check, an assertion ends one.**

## ★★ A NEGATIVE CONTROL IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT (`#507`; the repo holds the case)

I established a MECHANISM then hung THREE damage figures on it from instruments I never validated. **All three WITHDRAWN; Langston reproduced none.** ★ **The control sat one `GROUP BY` away: maker exits never read the book, so an honest instrument must be SILENT on them.** ⇒ **Applies to a POSITIVE result as hard as to a zero.**

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ #1 ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER** — ALIAS **CC-C**, display **“ANALYST Claude”**. **Compaction KILLS it.** Arm via Monitor per shared MEMORY 4.5 (`persistent: true`, NEVER Bash run_in_background). **Judge liveness by whether WAKE events arrive; doubled ⇒ TaskStop one.** Then sweep `/var/log/cc-discord-inbox.jsonl`.

**★ KYLE LIFTED MY READ-ONLY FOR TWO BATCHES (2026-07-21 GO; recorded in the roster `write_scope` field — the lift is SCOPED, not general).** I IMPLEMENT them, full 11-step, Langston reviews diffs.

## RECENT HISTORY — CLOSED (the repo completion reports are authoritative; do NOT re-narrate here)

⚠️ **CLOSED-BATCH NARRATION CUT — repo completion reports are authoritative. LIVE carries only:** `#618` VOIDED P19-B6 risk-envelope approval (**highest-priority untouched**) · `B-KILLSWITCH-WINDOW` denominator leg → `B-READER-TRUTH` obj-6 · `#632` · `#624` · `#677` (49/241) · ⚠️ **the `%` basis changed at the 07-28 11:57Z cutover.**

## ★★ STANDING LESSONS — the ones that keep re-earning their place

1. **A MATCHING NAME IS NOT A MATCHING THING** · **A CONTROL THAT CANNOT FIRE IS THE DEFECT IT GUARDS — write BOTH arms** · **CAPABILITY ≠ COVERAGE: state the time reach** · **NAME THE POPULATION AND THE REF BEFORE THE NUMBER — a deploy time is not a window anchor.**
5. **`B-KILLSWITCH-WINDOW` shipped FIVE errors while APPROVED — pattern: ASSERTING A CHECK INSTEAD OF RUNNING IT.**
6. **TWO RULES I AUTHORED are in `CLAUDE.md` (auto-loads — read them THERE): r24.a investigate-before-announce, r29 measurement discipline.**

**FEEVIABILITY carry-over:** the divergence paired-n CLOCK STARTS AT MARK-2 DEPLOY (sequencing: POST_AUDIT_ROADMAP + the completion report).

**★★ `wrong-object` — THE PATTERN THAT KEEPS COSTING ME (cases: `MISTAKE_PATTERNS.md`).** ★ **Only a MEASURE-TIME GATE has ever caught it.** ⇒ **BEFORE ANY CLAIM: read what the column is DEFINED as · RUN THE CONTROL ON THE OBJECT THE CLAIM IS ABOUT · and when you read a value at a CONSUMER, TRACE ONE HOP UP BEFORE GENERALISING ABOUT THE PRODUCER (F-G-2 §17).** ⛔⛔ **MY CORRECTIONS ARE THEMSELVES WRONG-OBJECTS — RE-DERIVE ONE LIKE A FINDING.**

**MY OPEN ISSUES — NUMBERS ONLY; `RUNNING_ISSUES` AUTHORITATIVE:** **#734 = PHASE-21 GO-LIVE BLOCKER** (`apm:165` THROWS in live; TWO independent trips) · **#733** (BLOCKS `dt-deploy`) · #687 #688 #689 · **#690 residual: audit-FAILs have NO alert path** · **#692: a DOWNWARD re-anchor strands legacy-notional positions above the new budget ⇒ ZERO opens until they close; RECURS.**

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07 after a 4-second collision where my resolve freed the key his announced park had just blocked). Everything else in triage stays mine.
**★ SESSION-FIX 07-27 ✅ DONE** (runbook has it). Own transcript folder (analyst = **4dfc = THIS session**) + memory-only junction. "(fork)" is intrinsic + cosmetic — do NOT re-root.
