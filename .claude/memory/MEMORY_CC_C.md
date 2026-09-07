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

## ★★★ CURRENT POSITION (2026-09-02) — READ FIRST

⛔⛔ **STEP: 3 of 11 · NEXT STEP: 4 of 11 — `B-PRICE-SIDE-BY-JOB` (row `3n`) + the pricing-architecture document. r2 DISPATCHED to Langston 2026-09-07, awaiting his re-read.** ⛔ **RECORD: `1-system-manual/PRICING_DATA_ARCHITECTURE.md` at `95646ab39` — §0-§5b and §6 r2 all filled. DO NOT RE-DERIVE HERE.** CI 4/4 run `34157527260`.
✅ **THE DOC IS COMPLETE END TO END.** §3 is Langston's (job × lane × asset class). §6 r2 fixed his three blockers: lane column restored, row 1 split into 1a context-mid / 1b level-transactable, crypto pattern lane's bar-close basis named.
⛔⛔ **FOURTH CAPTURED FEED FOUND 2026-09-07 — `xstock_perp_ticker_snap` (renamed from `equity_perp_*` by B79.0e): 191,041 rows / 10 symbols / 24h, 7.1M all-time, LIVE. §1 never listed it.** ⚠️ **My first query used a GUESSED table name and returned null — enumerate, never guess.**
⛔ **CODEX DISPATCH IS HELD until §6 clears. Brief + prompt both COMPLETE: `Scope Files/CODEX_PRICING_ARCHITECTURE_BRIEF.md` and `CODEX_PRICING_PROMPT.md`.** ⛔ **"What to distrust" was written by Langston then STRUCK by Kyle — do NOT reinstate; it biases the reviewer's search.**
✅ **`B-EXIT-BOOK-AGE-STAMP` CLOSED 2026-09-07** (C4 passed on `JUP/USD` 40=40; my "3-hour reach" was wrong — `retain 14` is FILES, ~18h). ⏳ **`B-PRICE-AGE-TRUTH` (`#951`) EXTENDS — zero rows on the touched arm.** ⛔ **Do NOT ack `cecd4a47`; an ack silences the dedupe key.**
➕ **PLACED: `#1017` B-TICKER-BBO-TRIGGER (3b.h-1, mine) · `#1018` B-UNIVERSE-REFRESH-ACTS (3b.h-2, mine) · `#1019` B-TSC-GUARD-DETERMINISM (3b.h-3, **CC-A**, Kyle-assigned) · `#927` now owns 4 sites not 2.**
⛔ **KYLE 2026-09-07: use the governance skill's LEDGER FORMAT when reporting Step 10 — name every document, strip the folder, keep the name. Not my own table shape.**
⛔⛔ **THE GATE IS THREE TERMS, NOT ONE — my `age AND feed-not-live` was REFUSED and he is right: a term ANDed onto a fail-CLOSED gate can only WIDEN it, and it passes per-symbol subscription death behind a healthy socket.** CELLS: (a) old+feed-dead -> refuse whole-feed · (b) old+feed-live -> **suspicion, NO auto-pass** · (c) fresh -> transact. **Term 2 = the SYMBOL'S OWN expected inter-arrival (quiet is symbol-specific); term 3 = feed liveness as a DISTINCT-SYMBOL COUNT, never recency — one chatty name keeps a gauge green.**
⭐ **THREE MEASURED NUMBERS, RE-DERIVABLE: ticker time-average age 1,188.5 s / 316,522 gaps / 467 symbols (LENGTH-BIASED — the 18.2 s median understates it ~65x); pure-heartbeat rate 0.02% over 29,307 pairs => Kraken's ticker is EVENT-DRIVEN, so a gap means QUIET not LOST; live cache 161 REST-sourced vs 9 WS-sourced of 170 — ⚠️ READ 2.5 min AFTER A RESTART, warm-up UNEXCLUDED, steady-state re-read armed.**
⛔ **THREE WRONG-POPULATION/CONTAMINATED NUMBERS THIS BATCH, ALL RETRACTED: `rtb_signals`=2 rows all-time; the 44.6% repeat rate was stablecoins; and the active p50 `30000-60000` was the POST-RESTART COLD PERIOD inside a MONOTONE ACCUMULATOR (246 s later it read `2000-5000`). ⇒ READ THE INTERVAL, NEVER THE TOTAL — same trap as `3b.d`'s `GRID_REJECT`.**
⭐⭐ **THE BIGGEST FIND OF 2026-09-06 — `#977` am. 3+4, ANSWERED IN CODE: THE PRICE-CACHE BUCKETS ARE REFRESH CADENCES, NOT DATA PARTITIONS.** ONE `Map<string,CachedPrice>` (`price-cache.ts:101`); `subscribe()` only does `bucket.symbols.add(symbol)`. **FOUR subscribe sites: RTB=`readyToBuy`, and THREE in `vts-runner` hardcoded `vtsSimulation`.** ⇒ **VTS is CORRECT; the ACTIVE lane reads the SAME map by symbol with NO bucket arg and INHERITS the 60 s VTS cadence for the ~180 symbols only VTS subscribed** (live: `vts=180` of `cacheSize=185`, `fx5=0`). ★ **`:91-92` says the bucket exists so *'VTS data isolation prevents simulation from affecting live trading cache'* — TRUE of refresh LOAD, FALSE of DATA, and that wording is why nobody noticed.** ⛔ **RULE 24 OUTCOME (2), not a defect — a DECISION nobody made; Kyle's scope call. NO HARM MEASURED: 60 s is the DECLARED interval, and the consequence needs the rate of active signals born on VTS-only symbols, which I do not have.**
⛔ **AND THE LIVENESS FIELD AS SHIPPED MAY BE INERT: `lastUpdatedAt` is advanced by THREE REST writers, so it tracks OUR POLL LOOP, not venue pushes. Verify before any gate reads it.**
⏳ **`B-XSTOCK-FEED-SANITY` (`#943`) OPEN, observation, `6d6b0e7be` — record in its PROGRESS_REPORT. Handoff 2 = 2026-09-08 00:15Z; `out.log` SIZE-rotated => extract AFTER EACH HANDOFF.**
📊 **ALERT `5b2849e0-e586-4fa5-80a7-d851ad7c5702` — MINE, deliberately NOT acked (an ack silences it, `#982`). Action: fold notify-suppression into `3b.f-c` per `#994` am.1-3; EMIT stays, NOTIFY goes.**

⭐⭐ **KYLE DELEGATED THE PRICE-SIDE DECISION TO CC-C + LANGSTON, 2026-09-03 — plan row `3n` `B-PRICE-SIDE-BY-JOB`, NEXT after `3b.b` closes.** His reason IS the binding constraint: he is biased toward whatever improves results, and **THE TEST IS FIDELITY TO LIVE TRADING.** ⛔ **A PRICE DOES FOUR JOBS AND WE USE THE MIDPOINT FOR ALL FOUR** (built at the FEED layer, `kraken-v2-translator.ts:73` overwrites the v1 `c`; crypto+xStock, paper+VTS all inherit it — `#952`/`#941`): **(1) SIGNAL GENERATION — KYLE CAUGHT THIS ONE, I HAD FOLDED IT INTO RANKING; it is where the LEVELS are set** (`signal-orchestrator.ts:2387` reads the cache, `:2276-2278` set entry/stop/target off it) · (2) RANKING · (3) TRIGGERING (`aee:1503`) · (4) BOOKING. ★ **THE RULE: estimates value ⇒ midpoint (correct as-is); becomes a LEVEL, FIRES an action, or is RECORDED ⇒ the transactable side** — entry on the ask, stop+target on the bid, trigger reads the SAME side the level was set on. ⛔⛔ **PER-LEG TRANSACTABILITY — “same side” WAS MY WRONG r1 INVARIANT (Langston BLOCKER-2): entry is a BUY on the ASK, stop/target are SELLS on the BID — OPPOSITE BY CONSTRUCTION. THREE sides: level basis (mid), entry fill (ask), exit trigger (bid). The error is **A FULL SPREAD, NOT HALF**, and R:R moves in OPPOSITE directions on the two legs. Each leg on the side THAT LEG transacts at. `F-G-2` OBJ-0 lands FIRST.** ⚠️ **NOT a new observation window — a CORRECTNESS decision. Spreads already measured: median 0.199% crypto / 0.395% xStock, xStock p90 11.784%.**

⛔⛔ **REACHABILITY NEEDS NO CLEAN WINDOW — I told Kyle it did and the plan's own cell said otherwise (`wrong-object`, corrected 2026-09-03). Row 4 `F-5`: the BUILD does not wait on `F-E`, and `F-E` grades the 547 closed trades already in hand. Detail in plan rows 4 and 8; do not re-derive here.** **SEQUENCE: `3b.b` closes → `3n` (four jobs) → `F-5` structure → `F-E` on existing history → the reach FIT → THEN the paper reset + clean window. THE RESET IS LAST — opened earlier it measures the old ruler again.**

✅✅ **ROW `3b.f-c` `B-XSTOCK-SESSION-FRESHNESS` — Kyle's blocker DISCHARGED 2026-09-03 (he ruled DO NOT LOOSEN, evidence-gated). (i-r) DELIVERED, verdict `INCONCLUSIVE` on pre-registered arms; Langston re-ran it and reproduced D=36. (ii-r) FOLDED OUT to `#526`/`B-VENUE-QUIET-ALERTING`, **OWNER CC-B — I write NOTHING into it.** ⛔ **FULL RECORD `Scope Files/B_XSTOCK_SESSION_FRESHNESS_ESTIMAND_REGISTRATION.md` §10 — RE-READ AT THE REF AT RULING TIME AND SAY WHICH REF; NEVER from memory.** ⭐ **THE FINDING: the condition that triggers a refusal STARVES the σ estimate — refused attempts 9.1% σ-eligible (median 43 obs) vs 93.5% (390).** ⛔ **WITHDRAWN at the object: *'the design already resists it'* — `room` does the work, not σ, and an understated σ WIDENS (my own `#566`).**

⛔⛔ **DURABLE, CROSS-BATCH — PM2 SPLITS THE APP'S STREAMS AND I READ THE WRONG FILE (2026-09-03):** `console.log` → `/var/log/dawntrader/out.log`; **`console.warn` / `console.error` → `/var/log/dawntrader/error.log`.** Every exit-path skip/refusal line (`EQUITY_MARK`, `PRICE_SKIP_ESCALATION`, my own `[BOOK_STATE]` SKIP/YIELD) is warn/error. **CONTROL: `EQUITY_MARK` = 0 matches in `out.log`, 1,031 in `error.log`, same window.** ⇒ **NEVER read an exit-path ZERO from `out.log` alone** — it is `#661` leg 3 waiting to happen.

★ **LI/USD `ab16f068` = the first LIVE-EXPOSURE case of the OBJ-9 staleness class (NOT my OBJ-6 hollow class — LI's book is tight): open, 1.18 % above its stop, 841 skipped exit ticks 03:11–05:03 in five runs of 40, σ `src=classwide`, ceilings 177–250 s vs marks 251–343 s.** Not a defect (`budget_k` sizes the blind window at half the remaining room, by design) — the live form of `#563`. Carried into OBJ-9 / 3b.f-c. **All five alerts (MDT `b1f58a01` · RIOT `1d1573c7` · NEM `6339b2d9` · CTVA `1ea0a78f` · LI `ab16f068`) stay ACTIVE under the `#951` rule — no ack, no resolve until the deploy.**

⏳ **`B-PRICE-AGE-TRUTH`** (`#951`), card `Observation` — STEP 10 done, 11 CONVERTS on the 09-07 alert `cecd4a47`. Deployed `2af2e0bac`. ⛔ **Read `B_PRICE_AGE_TRUTH_PROGRESS_REPORT.md`; do NOT re-derive here.** Key traps: JOIN `observedAtMs` WITH `producer`; 3 arms (`aee:1244`/`:1285`/`:1324`); ZERO reserve rows = EXTEND not fail; ENUMERATE producers, never `LIKE`.

⛔⛔ **THE MACHINERY AUDIT IS THE LIVE WORK — `1-system-manual/EXIT_PATH_MACHINERY_AUDIT_2026-08-30.md`, NOW §0-§10. READ IT; DO NOT RE-DERIVE FROM HERE.** §8 provenance · §9 the second independent audit · **§10 = THE CORRECT DESIGN, DRAFT 1.**

⛔⛔ **KYLE'S STANDING DIRECTIVE: ITERATE TO COMPLETION WITH LANGSTON + SECOND READERS THROUGH THE GOVERNANCE STEP. Step-report blocks only; STOP ONLY for a decision that is HIS.**

⭐ **USE SECOND READERS FOR LOAD-BEARING PIECES AT EVERY PIVOTAL STEP.** ⚠️ **His caution: readers surface incidental nitpicks and sometimes claim wrong things — FOCUS ON LOAD-BEARING, verify, and do not let a retraction reach implementation.** ★ *"I want this to be perfect... it's very late to be noticing we don't have the right prices feeding in. I'd assumed for months that was foundational."*

✅ **THE xSTOCK PRICING PLAN IS THE LIVE ARTIFACT: `1-system-manual/XSTOCK_PRICING_PLAN.md`** — 6 problems, 6 solutions, the order; **P6 (which price per job) = KYLE'S.** Read it there; do not re-narrate here.

⛔⛔ **`B-EXIT-BOOK-AGE-STAMP` — CRITERION FIRED + EVALUATED 2026-09-06. C1/C2/C3 ✅ (zero coarse producers; 27/27 taker closes carry the depth age; mix 69.2 vs 63.0 = 6pp on n=39, inside SE). V1 11 · V2 10 · V3 18 · V4 CITED (`withRestPrice=0` over 7,197 cycles, reach 3h).** ⛔ **C4 UNEVALUATED — NOT passed, NOT waived: I wrote a 7-day criterion whose proof lives in a ~3h SIZE-ROTATED log, so all 11 qualifying closes predate the retention.** ✅ **DEFERRED to alert `6cbef7d0-8067-4085-ab8c-8cc4c1fe19e5` (fires 2026-09-07T13:00Z), which carries C4 verbatim + the discharge steps.** ⛔⛔ **CLOSURE IS LANGSTON'S RULING, NOT MINE — put to him; card stays `Observation`.** ⚠️ **C1's own PASS wording was under-enumerated (a legitimate 7th producer `kraken_ws_book_mid`); the verdict rests on the FAIL clause.** Record: `B_EXIT_BOOK_AGE_STAMP_PROGRESS_REPORT.md` §9-§10.

✅ **F-G-2 SPLITS BY ASSET CLASS (Langston): crypto legs on the F-G-1 soak alone; xStock legs behind 3b.b + 3b.d (plan row 3c). CARVE-OUT: no `observedAt`/`cachedAt`/age-derived value as a sample filter or covariate (scope §0).** ✅ `B-EXIT-PROVENANCE` CLOSED (#954 for the two nulls). ★ **A batch held open by a close gate owes governance TWICE — body ship AND gate close; a PROGRESS REPORT holds the open state.**

➕ **PLACED: `#965` (3b.j — T2 *is* enforced at `aee:3570`, the scanner check is dead legacy) · `#966` (5.a — non-USD quote denomination, DIRECTION PER QUOTE: BTC overstates/fail-safe, a SUB-DOLLAR quote INVERTS and is too PERMISSIVE) · `#967` (5.b — the $0.25 active price floor excludes DOGE *and* ADA, KYLE'S DECISION) · `#968` (3b.k — change-class marker needs line-start AND colon OUTSIDE the bold).**

⏳ **`F-G-1` OPEN — OBSERVATION WINDOW. Full record: `F_G_1_PROGRESS_REPORT.md`, FROZEN at `5e5a3d8ae` — DO NOT EDIT report/criterion/suite.** Deployed `56ac8067a`, card `Observation`. **Criterion = self-firing alert `2093a98a`, fires 2026-09-04: 30 crypto opens or 7d, per-class, 100% on-grid NO tolerance.** ★ **Read it on the INTENT-side columns — `entry_price` is the FILL, on-grid by construction.** ⛔ **A post-deploy CRYPTO row unstamped `resolved:true` is a BYPASS finding, never cold-start.**

✅ **RATCHET — CONFIRMED OFF AND IT IS KYLE'S OWN DECISION, WITH A REASON THAT HAS EXPIRED.** 0 break-even latches in 705 states; all 705 `TARGET` mode; live DB `break_even_enabled=false` on all four classes since May (xStock by `kyle-directive-2026-05-21`). ★★ **HIS REASON (2026-08-30): break-evens were exiting trades BEFORE WE COULD SEE HOW THEY FINISHED, so we learned nothing — AND THAT WAS WHEN WE WERE VTS-ONLY, NOT PAPER TRADING.** ⇒ ⛔ **THE CONDITION THE DECISION RESTS ON HAS CHANGED. Re-ask it; do not treat it as settled.**

⭐⭐ **NEW MISTAKE SLUG, MINE, n=1: `vendor-docs-unread`.** I measured for hours toward an answer Kraken PUBLISHES. ⛔ **TRIGGER: the object is operated by SOMEONE ELSE — a venue, an API, a hosted service. If we do not control it, its behaviour is DOCUMENTATION BEFORE IT IS DATA. Read the operator's docs, then forums, THEN instrument.** ⚠️ **Self-concealing: every measurement SUCCEEDED, so it felt like progress.** ⚠️ **NOT docs-INSTEAD-of-measure — only measurement found the 27.1%.**

⛔⛔ **LANGSTON'S STANDING RULING ON THE AUDIT: findings survive as MEASUREMENTS and are NOT CERTIFIED AS DISPOSITIONS.** The exposed class is **any sentence asserting behaviour is unintended/undecided/unspecified, WHEREVER IT SITS** — my findings-vs-proposals split was *"the wrong cut, and it fails in your own favour."* ⇒ **uncertified until `#956`/`B-DECIDED-INTENT-INDEX` (3b.g) lands.**

## ★★ A NEGATIVE CONTROL IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT (`#507`; the repo holds the case)

I established a MECHANISM then hung THREE damage figures on it from instruments I never validated. **All three WITHDRAWN; Langston reproduced none.** ★ **The control sat one `GROUP BY` away: maker exits never read the book, so an honest instrument must be SILENT on them.** ⇒ **Applies to a POSITIVE result as hard as to a zero.**

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ AFTER ANY DISPATCH, READ THE INBOX ON THE NEXT WAKE OF ANY KIND — the watcher missed two Langston replies on 2026-09-02 (12:20, 13:10).** MDT `b1f58a01` stays ACTIVE to 09-07 (Langston ratified 19:00Z; record in `B_PRICE_AGE_TRUTH_PROGRESS_REPORT` §4).
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

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07). ⛔ **AMENDED 2026-09-02 (Langston, inside the `#951` window to 09-07): xStock exit-skip alerts are exposure-checked and LEFT ACTIVE — do NOT ack, do NOT resolve; they are the window's signal. I resolved two (PANW/MDT 09:42Z) before his routing landed — the fired rows still count.**

⛔⛔ **NEW DURABLE RULE, LEARNED THE HARD WAY 2026-09-03: NEVER PUT A BACKTICK INSIDE A TAGGED TEMPLATE LITERAL** — my markdown-style `` `code` `` in a SQL comment inside ``sql`…` `` terminated the string and broke the parse of `ready_to_buy_service.ts`; tsc fell 377 → 16 and the push guard refused on exactly the partial-parse signature it exists to catch. **A tsc count far BELOW baseline is a parse break, not a fix.**

★ **OBJ-9 RE-BASE — ANSWER STANDS: DO NOT MOVE `active_fill_max_age_ms` (15,000 ms). The limit sat at ~1.71× the RTH p99 when written at a 1.8 s throttle and sits at 1.00× now (p99 15.07 s at the 4 s throttle) — drift RECORDED, deliberately stricter, and Kyle ruled against relaxing off-hours. ⛔ **THE SESSION REFUSAL SHARES THIS BLOCK USED TO CARRY WERE WEEKEND-CONTAMINATED AND ARE DELETED RATHER THAN CORRECTED HERE — read them from `scripts/analysis/obj9_counts_v2.sql`, never from memory.**

➕ **`#994` KYLE DIRECTIVE, MINE: staleness because the US market is SHUT must not raise a breakage alert; staleness because OUR feed is impaired must.** OBJ-9's alert-policy requirement; discriminator = feed-wide liveness (the other ~478 books are the control). Converges with Langston's instrument point.
