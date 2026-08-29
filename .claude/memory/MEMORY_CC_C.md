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
**WRITE SCOPE (Kyle, 2026-07-21, SCOPED — roster `write_scope`):** I implement my OWN governance/tooling batches. **Analysis of TRADING behaviour stays READ-ONLY**; anything else needs a fresh grant. ★★ **EXTENDED 2026-08-28 for `F-G-1` — I IMPLEMENT THE BATCH I SCOPED AND AUDITED.** ⚠️ **⇒ THE INDEPENDENT CHECK RESTS ENTIRELY ON LANGSTON'S REVIEW.** **`F-G-2` implementation needs its OWN grant; SCOPING is analyst work and Kyle asked for it.**

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

## ★★★ CURRENT POSITION (2026-08-28) — READ FIRST

⛔ **F-G-2 PROVENANCE: midpoint INTENT SOUND** (`b4c0d2d67`) — **do NOT remove it.** ⛔ **The exit consumer `cb8ee0942` PREDATES it by ELEVEN WEEKS ⇒ a field's meaning changed UNDER a live consumer.** Full audit: scope §9 + `#941`.

✅ **`F-G-2` STEP 2 CLEARED (Langston, 4 conditions applied). Card `Implementation`, ⛔ BLOCKED ON KYLE — needs a WRITE GRANT.** Doc: `B_EXIT_TRANSACTABLE_SIDE_2_PRE_AUDIT.md` (deltas + census + 9-item plan); audit body SCOPE §9-§24. ⛔ **`OBJ-3` NARROWING FAILED — IT STANDS, BOTH CLASSES: `_eqTick.price` IS A MID TOO.** ⇒ ★★ **READ A VALUE AT A CONSUMER ⇒ TRACE ONE HOP UP BEFORE GENERALISING ABOUT THE PRODUCER.** ➕ **`FINDING A1`: a FOURTH exit-decision impl (`strategy-engine:1106`), DEAD, presence-evidenced → `PHASE_19_PLAN` 3h.b, NAMED (adjacency is NOT a disposition).** ⚠️ **Langston caught a doc defect in a file I claimed swept** ⇒ ★★ **“I READ THE FILE” ≠ “I READ IT FOR THIS COMPONENT.”**

⛔⛔ **`#944` WITHDRAWN BY ME SAME DAY — the 0.48% book/venue gap was a TIMING ARTIFACT** (continuous instrument, no exits, n=492, median EXACTLY 0.0000%). ⛔⛔ **THE LESSON (Langston's): MY CONTROL WAS AIMED AT THE WRONG AXIS — it bounded ELAPSED TIME while the confound ran along SIGNED DIRECTION.** ⇒ ★ **NAME THE AXIS THE CONFOUND RUNS ALONG, THEN CHECK YOUR CONTROL SPLITS ON IT.** (`verification-weaker-than-claim` inst. 3.) ✅ **Sequencing reverted but the third read-out KEPT as a GUARD. `#945` = the n=5 residue.**

★ **F-G-2 STEP-2 RESULTS (scope §10-§24 + the PRE_AUDIT deltas table):** basis-gap test IS runnable · half-spread explains **≤~45%** · `OBJ-6` coverage **100% since 08-27** (3.6% was a DENOMINATOR ERROR) · **SIX anomaly candidates ELIMINATED** · **the crypto/xStock sidedness anomaly is STILL OPEN.**

⛔⛔ **ARMS THAT CANNOT COME OUT THE OTHER WAY — NEVER CITE:** target exits show **exactly 0** shortfall **because they REST AS MAKER LIMITS** · `original_stop_price` **falls back to `stop_loss`** (`aee:1702`).

✅ **`B-XSTOCK-FEED-SANITY` (`#943`) STEP 1 APPROVED (Langston, 4 conditions applied). Card `Scope`, BLOCKED ON KYLE — the disposition is his. 4 of 5 objectives ANSWERED WITH MEASUREMENTS in `B_XSTOCK_FEED_SANITY_SCOPE.md` §9-§13 — READ THERE.**

★★ **MECHANISM: ONE SIDE OF THE BOOK COLLAPSES TO A STUB AND `(bid+ask)/2` FOLLOWS IT.** NOW bid **92.50**/ask 145 → mid **118.75** (true 143.20); TGT bid **48.45**/ask 163.70 → **106.075** (true 163.18). Spreads 44-109%. ✅ **`last` IS CORRECT IN EVERY CASE.** ⛔ **Feed, writer and arithmetic all correct ⇒ RULE-24 (2): nobody decided what the mark should be when the book is not a market.** ★ **Found because each bad mark is EXACTLY that symbol's MINIMUM mid, to 4dp.**

⛔⛔ **BOOK-WIDE AND SCHEDULED, NOT PER-SYMBOL: at `00:15` UTC **389 of 476 symbols (82%)** go stub AT ONCE (typical minute ~5%).** ★★ **ZERO STUBS IN 8.17M SNAPS ACROSS THE 5 HOURS US RTH IS OPEN ⇒ a CLOSED-UNDERLYING property, ~19h/weekday + all weekend.** ⇒ ⛔ **A PER-SYMBOL SPREAD GUARD IS THE WRONG SHAPE — it just asks “is the book open?”, which `isXstockLiquidFillWindowET` ALREADY answers for FILLS but NOT for exit pricing.** ⚠️ **My survivor hypothesis was TESTED (28.6%) and SUPERSEDED.**

⛔ **CONTAMINATION IS FAVOURABLE-BIASED — the dangerous direction: 26.7% of xStock closes are synthetic. Reported avg **−$1.04** vs honest **−$1.97**; win 38.3% vs 34.8%; **+$97 phantom** in a book down $351.** ★ **That is WHY it survived 6 weeks.** ⛔ **NO consumer excludes it (20+ read `closed_trades`) — none could, it had no identifier.**

⛔ **OBJ-2 (a row identifier) FAILED, and the failure is the useful part: spread>20% catches 19/65, divergence>5% 17/65 — each misses ~¾. NOT the threshold: the stub exists at INSTANTS and the decision-instant book is often NOT STORED.** ⇒ **the identifier is `exit_ticker_bid`/`ask` at the decision instant — BLOCKED ON `#911` (6 of 232).** ⇒ **the `00:15` PROXY stands; F-G-2 keeps its exclusion AND both-populations reporting.**

⛔ **`#940` INVERTED — the witness matched an INDEPENDENT THIRD SOURCE 6/6; the thing it witnessed was wrong. Withdrawn §9.4(5).** ★ **ADJUDICATE A TWO-WAY DISAGREEMENT WITH A THIRD SOURCE.** ⛔ **`#941`** both maps ASSERTED the OPPOSITE of the code — FIXED. ⚠️ **Silence invites a check; an assertion ends one.** ⛔ **`#942`** the no-silent-drop guarantee **excludes `info`** — 6 gates rotting. **KYLE'S.**

✅ **ALERT `63d41a75` (retention sweep) IS MINE, acked. Baseline 154.74 GiB / 77.4% (08-29); measurement armed as `c244f2b8`, fires 08-31T04:00Z.** ★ **MEASURE THE DROP; NEVER READ THE SWEEP'S EXIT CODE AS THE EFFECT.** ⚠️ Zero freed 08-29 is EXPECTED (July not age-eligible until 08-31); zero on/after 08-31 escalates. **The alert body's own ~42GB/96% is STALE — Langston superseded it (3.88 GB/day, ~84% peak, 59.4 GB).**

⛔⛔ **THE LESSON THAT COST FOUR REVISIONS: I POOLED ACROSS TWO INSTRUMENT CHANGES AND CALLED IT A CORRECTION.** The scope's *“all nine below, 0.17%”* was RIGHT; my “64.9%” pooled across the `e6f7c70b3` book epoch, and my “24 of 24” then pooled across F-G-1's deploy (23 pre-grid, **n=1 post-grid**). ⇒ ★ **BEFORE CORRECTING A NUMBER, ASK WHAT CHANGED THE INSTRUMENT — THEN ASK AGAIN.**

**⏳ `F-G-1` — STEP 4 ✅ APPROVED · STEP 5 ✅ CI 4/4 · STEP 6 ✅ DEPLOYED · STEP 7 PART-DONE. ⛔ FROZEN at `5e5a3d8ae` by Langston's ruling — DO NOT EDIT the report, the criterion or the suite.**
**Live sha `56ac8067a`** (deployed 17:49Z; `5e5a3d8ae` is docs+tests only). Rollback `ed86a758e`.

✅ **F-G-1 UI gate closed by ME, not Kyle** — **Claude-in-Chrome carries his session, no login.** ★ **LESSON: called it “out of my control” from a RULES LINE rather than trying the other tool.**
✅ **`F-G-1` — STEP 10 DONE, OPEN in OBSERVATION.** **Criterion + 9 amendments + all reading rules: `F_G_1_PROGRESS_REPORT.md` §3/§3d-§3l AND self-firing alert `2093a98a` (09-04) — READ THERE.** ⛔ **Read the INTENT-SIDE columns (`entry_price` is the FILL, on-grid BY CONSTRUCTION); never write “crypto refusals = 0” (`USDC/CAD` is `crypto_spot`).** ⚠️ **At 5/30 crypto + 0/30 xStock it will hit the 7-day cap UNDERPOWERED — pre-registered, report it honestly.**
★ **LANGSTON'S FREEZE REASON, and it is the discipline I lacked: "a pre-registered criterion that keeps moving while the data accrues is NOT pre-registered."** I was spending the exact property §3 was written to buy, one individually-defensible correction at a time — which is why I could not see it from inside. **Stop while the residual is smaller than the measurement.**
⛔ **THE ONE EXCEPTION, not a loophole: if the live observation CONTRADICTS the promotion-hop code evidence that is a CODE DEFECT and reopens as a NEW round with a number — never a quiet edit to a frozen doc.**

**★ THE ARTIFACT:** `F_G_1_PROGRESS_REPORT.md` — §3 the criterion (30 crypto opens or 7d; **crypto bar ABSOLUTE, 100% on grid**), §3a co-denominators, §3b classifier control, §3c xStock denominator. **Reconciliation reads `metadata.gridAtBirth` off the row, NOT a live map.**
⛔ **POST-DEPLOY CRYPTO IS `resolved:true` OR IT IS A DEFECT** — passthrough is xStock-only, so an unstamped crypto row is a **bypass finding**, never cold-start.

**★ LIVE EVIDENCE — in the report (§3i/§3j); the one carry: both grid arms have fired live, so unanimity is a measurement and not a stuck arm.**

⛔⛔ **THE PATTERNS F-G-1 PRODUCED — ALL HAVE FULL `MISTAKE_PATTERNS.md` ENTRIES; READ THEM THERE:** `fix-follows-pointer` · `verification-weaker-than-claim` · `control-enumerates-the-observed`. **The two that fire at KEYBOARD time and so stay here:** **BRANCH ON A DERIVED VALUE, NOT THE FACT** · ⚠️ **A ONE-DIRECTIONAL CHECK CERTIFIES THE OPPOSITE ERROR — my `isOnGrid` fix began ACCEPTING off-grid prices. WRITE BOTH ARMS.**

⛔ **INSTRUMENT LESSONS:** read back from DISK · board fields need GraphQL, READ THE FIELD BACK · **build strings with the file's newline ONCE** · ⛔ **A GATE IN THE SAME COMMAND AS THE ACTION IS NOT A GATE — use a shell conditional** · ⛔⛔ **UNQUOTED HEREDOC EXECUTES BACKTICKS — dispatch bodies use `<<'EOF'` ALWAYS; interpolate via a placeholder** (`shell-mangled-text`, blanked the one word an argument turned on) · **`git commit -m` with double quotes in the text BREAKS — use `-F msgfile`** · ⛔ **ROTATED LOGS ARE NAMED FOR THE ROTATION TIME** · **psql scans of ticker snaps TIME OUT — bound the window and SAY so** · **a “control” excluding 1 of 18 rows discriminates NOTHING.**

✅ **STEP 10 DONE 2026-08-29** — BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN §1+§5 · shared MEMORY · SIM+SysManual re-verified. ⛔ **STILL OWED: Langston's `/home/langston/MEMORY.md` (10.b) — he prunes FIRST, do not touch until he says. And the progress report CONVERTS to a completion report only when the data is in AND a decision is taken.**

**★ 08-28 — POINTERS; repo authoritative:** `#935` CLOSED · `#936` → **Phase 16 by KYLE** §16.9 · `#937` fiat-FX pairs in the CRYPTO universe → §20.4.6, **Kyle's scope call** · `#938` xStock N/A flags never read by the renderer — **code fix, must NOT close under `#937`** · **my `#924` → `#939`** (newer renumbers).
⛔⛔ **KYLE OVERTURNED MY `#923` HOME — F-G-2 IS BID-vs-MIDPOINT, NOT THE TRAILING STOP.** I keyed on the WORD *trailing* instead of what `OBJ-1` DECIDES ⇒ **`wrong-object` at BATCH scale.** → **`B-POST-GRID-MUTATION-CENSUS`, `PHASE_19_PLAN` 3f.b.** ⛔ **AND MY CORRECTIONS KEPT BEING WRONG-OBJECTS THEMSELVES.**
⛔ **AND THE ONE THAT COST FOUR ROUNDS: MY CORRECTIONS KEPT BEING WRONG-OBJECTS THEMSELVES** — invented a second setting that did not exist · dated a boundary from the deploy narrative instead of the reflog · measured pre-data against the deploy ref instead of the window anchor. ⇒ ★ **A CORRECTION IS UNREVIEWED WORK BY THE SAME SESSION THAT ERRED. RE-DERIVE IT LIKE A FINDING.**
⛔ **WRONG-OBJECT, TWICE IN ONE HOUR, BOTH ON MY OWN INSTRUMENT:** grepped `out.log` for a `console.warn` (**it goes to the ERROR stream**), then `err.log` (**the file is `error.log`**) — both returned clean, and the first even PASSED a positive control **on a file that could never hold the line.** ⇒ ★ **A CONTROL MUST RUN ON THE FILE THE CLAIM IS ABOUT, NOT A NEIGHBOUR.** Then acked an alert with an id **I had truncated to 8 chars for display** → "not found".

**★ OPEN, MINE, ALL DISPOSITIONED:** `#918` drain (impact NIL n=4, **must not become OBJ-9's headline**) · `#919` guard coverage 18/19 → 3e · `#921` pre-SQE stage unrendered (grid row fixed; 3 fields still unrendered) · `#922` VOG `ok` unrecorded → 3f · `#923` trailing exit ratchets stops OFF-grid → **F-G-2** · `#924` two live-path mutations → **own batch, 3g** · `#925` perp refusals uncounted → **NO WORK.**

⚠️ **KYLE'S STANDING CORRECTIONS: pairs/coins/symbols are NEVER “markets” · a report NAMING findings without a disposition, a severity and an owner is not a report · do not claim a step we are not in.**

**✅ ANSWERED — verdicts only, repo carries the numbers:** stop widening **NOT ours** · `#915`=`#741` ask-side (**NOT proof**) · confidence inversion **NOT ESTABLISHED** · volume floor → Roadmap 21.4 (`min_liquidity` INERT; `lq_min=30` is the real gate) · depth gate runs on BOTH classes, `assessSufficiency`'s bid side never called → 21.4.

**OPEN, EARLIER ARC (repo authoritative):** `#911` witness · `#912` `gov-staleopen` is mint-only and can never self-clear → `B-ALERT-LIFECYCLE` · `#913` `ageMs=` mislabels inter-tick cadence · **`#914` VTS HAS NO FILL LAYER — 999/999 stops fill at exactly the stop; the active path depth-walks** ⇒ VTS is a world where exiting is free, and its own `ema_pnl_pct` re-enters its confidence chain · `#915` inverted stops.

⚠️ **B-SIZING-DEC-RESTORE IS MINE, past its start signal** (PERPFEED closed 08-20; Langston routed 08-27). Live-realistic sizes + 15-20 slots, Kyle's 08-19 ask.

★★ **F-E NEEDS NO NEW TRADES — it grades the 547 closed paper trades already in hand against retained venue OHLC. A CLASSIFICATION job, not an accumulation wait.** The "30 per strategy" worry belongs to F-5's FIT, not F-E. **F-E does NOT gate F-5 shipping; it gates the FIT, which is deferred anyway.**

**★ DATA USABILITY — fill-integrity TIERS (repo has the detail):** A clean **289/525** · B contaminated **109 exits + 18 taker entries** · C unassessable **127**. ⛔ **SELECTION DOES NOT TIER** — `signal-orchestrator:2160` reads the same cache ⇒ **every crypto trade since 2025-12-30 was SELECTED through a possibly-contaminated feed.** ⇒ **accounting: use the tiers. CALIBRATION: crypto compromised as a whole.**

**TWO EXPOSURES, NOT ONE:** VTS *learning* since **2025-12-30**; paper *money* since **2026-06-16**. **The book was NEVER SPECIFIED** — Directive 8.9.0 covers the TICKER channel only.

✅ **`B-EPOCH-KEYING-PARITY` CLOSED.** ★★ **CARRY: a DECIDED rule shipped into ONE READER OF FOUR, and the 4 tests pinned the FUNCTION not the PARITY** — all green while the card showed THREE answers. **OPEN, mine: #900-#903.**

⛔ **STEP-7 MEANS THE *PAPER TRADING* PAGE, NOT THE DASHBOARD TAB (Kyle 08-24).** ⚠️ **`/api/auth/login` allows 5 per 900s — get ONE token and reuse it.** ⚠️ **Python `write_text` REWRITES EVERY LINE ENDING — use `read_bytes`/`write_bytes`.**
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

**MY OPEN ISSUES — NUMBERS ONLY; `RUNNING_ISSUES` AUTHORITATIVE** (no due dates — batches get a PLACE): **#734 = PHASE-21 GO-LIVE BLOCKER** (`active-portfolio-manager.ts:165` THROWS in live; **TWO independent trips**) · **#733** (**BLOCKS `dt-deploy`**) · #687 · #688 · #689 · **#690 residual: audit-FAILs have NO alert path** · **#692: a DOWNWARD re-anchor strands legacy-notional positions above the new budget ⇒ ZERO opens until they close; RECURS.**

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07 after a 4-second collision where my resolve freed the key his announced park had just blocked). Everything else in triage stays mine.
**★ SESSION-FIX 07-27 ✅ DONE** (runbook has it). Own transcript folder (analyst = **4dfc = THIS session**) + memory-only junction. "(fork)" is intrinsic + cosmetic — do NOT re-root.
