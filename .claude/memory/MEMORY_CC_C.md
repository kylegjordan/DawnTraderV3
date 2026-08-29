# MEMORY_CC_C.md — Claude Analyst (CC-C) Volatile Working-State

> ★ NAMED 2026-07-19: **"Claude Analyst"** (alias **CC-C**, roster-bound). Discord display name **"ANALYST Claude"** (the `--sender` value); wake keys "Claude Analyst"/"Analyst Claude"/"CC-C" in `cc-wake-filter.py`. Arm with ALIAS `CC-C` — never CC-A/CC-B. *(The "SPEAKING:" prefix is RETIRED with Telegram — `--sender` IS the label.)*

> ★ LINEAGE (settled): this shell was the ORIGINAL Claude New, revived 07-19 as the Analyst. **I am NOT Claude New; never arm a CC-B watcher.** Stale TaskList entries are inherited. Roster: `.claude/cc-session-roster.json`.

## YOUR ROLE (Kyle 2026-07-19): **paper-trading results ANALYST (standing)** — analyse active paper results; find what can be calibrated NOW.

**★ THE STANDING WORK LEDGER (Kyle 2026-08-20): `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` — re-read it AFTER EVERY batch/sub-batch close, update statuses, ADD findings that should become batches.** Part D = the unwind queue; A6 awaits Kyle's pick; A7/#618 = highest-priority untouched (risk envelope).

## ARMED

7. **Weekend posture:** #531 — active-path xStock positions have NO weekend mechanism (4 held through the 48h shutdown 07-17→07-19); options paper (suspend/flatten/hold + calendar-based admission gate (d), NEVER a hold prediction) → Kyle ruling pending. xStock trades 24/5 (Sun 8pm ET → Fri 8pm ET); US holidays pause.

## YOUR DATA SOURCES (psql via staging: `ssh root@188.245.193.8` → deploy → `set -a && . ./.env` → `psql "$DATABASE_URL"`)
- **`closed_trades`** — realized active-path results; THE fee-viability population. ⚠️ **always filter `closed_at IS NOT NULL`** (rows are written AT OPEN). Post-2026-07-28: gross on ACTUAL fills, `total_cost` = fees only — **aggregates spanning 07-28 11:57Z mix two denominators.**
- **`active_open_positions`** / **`rtb_signals`** (genesis metadata: regime/DBS/pattern/pool/rankAtPromote) — selection forensics. **`vts_open_trades`** = the wide learning population, SEPARATE from active, never blended.
- **`/api/active-engine/trades/analytics`** — the rolling summary Kyle sees; the EV-reject breakdown + Filter-Diagnostics counters show where signals die.
- Mechanics: `net-expectancy-kernel.ts`, `decideMakerTaker`, friction model. Context: **`…/Scope Files/P25_SCORING_STACK_PRESTUDY.md` §7** (READ before any retire/calibrate opinion), `POST_AUDIT_ROADMAP.md`, `PHASE_19_PLAN.md`, the two pipeline audits.
- ⚠️ **SCHEMA TRAP — A COLUMN'S NAME IS NOT ITS CONTENT. `closed_trades.trade_mode` holds `'TARGET'`, NOT paper/live** ⇒ filtering `trade_mode='paper'` returns ZERO and reads as "no trades". **★ the `positions=N` token in `out__*.log` is NOT the open-position count** (read 2 while the DB held 8). **Open positions ⇒ `active_open_positions`; closes ⇒ `closed_trades`. NEVER a log token.**

## STANDING BEHAVIORAL RULES (unchanged, they bind you too)
**WRITE SCOPE (Kyle lifted read-only 2026-07-21, SCOPED — roster `write_scope`):** I implement my OWN governance/tooling batches. **Analysis of TRADING behaviour stays READ-ONLY**; anything else needs a fresh grant — do NOT read the lift as general. ★★ **EXTENDED 2026-08-28 for F-G-1 (Kyle: "permission granted") — I IMPLEMENT THE BATCH I SCOPED AND AUDITED.** ⚠️ **Granted AFTER I put the counter-argument to him myself: the analyst writing the code removes a separation he drew deliberately. ⇒ THE INDEPENDENT CHECK RESTS ENTIRELY ON LANGSTON'S DIFF REVIEW — not a formality on this batch.** **F-G-2 implementation would need its own grant; SCOPING is analyst work and Kyle asked for it.**

## ★★ THE HEADLINE FINDING (2026-07-20) — READ BEFORE ANALYZING ANY TRADING RESULT
**THE ACTIVE PATH HAS TWO ADMISSION LANES AND THEY MUST NEVER BE POOLED.** `closed_trades.metadata->>'admissionBasis'`: **`exploration`** = the GOVERNED lane, admitted on KNOWN-NEGATIVE netEV, **SUPPOSED to lose money** — the losses are the price of learning data. **`organic`** = genuine positive-netEV. ⇒ **Pooling them reads a deliberate learning spend as strategy failure — I did exactly that on 07-19 and gave Kyle a false headline.** **Per-cohort numbers move constantly: RE-QUERY, never quote from memory.**

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

**⏳ `F-G-1` — STEP 4 ✅ APPROVED · STEP 5 ✅ CI 4/4 · STEP 6 ✅ DEPLOYED · STEP 7 PART-DONE. ⛔ FROZEN at `5e5a3d8ae` by Langston's ruling — DO NOT EDIT the report, the criterion or the suite.**
**Live sha `56ac8067a`** (deployed 17:49Z; `5e5a3d8ae` is docs+tests only). Rollback `ed86a758e`.

✅ **GATE 1 (UI) CLOSED BY ME 2026-08-28, NOT BY KYLE — I HAD IT WRONG.** Both Filter Diagnostics tabs navigated in **Claude-in-Chrome**, which carries Kyle's session ⇒ **no login, no password.** VPG row renders on BOTH: crypto **0 would-fail / 344→347 live-incrementing**, xStock **0 / 294**. ⛔ **THE LESSON, bigger than the gate: I declared it "outside my control" from a rules line listing credentials without saying WHICH SURFACE needs them — CC-A measured both browsers and fixed `CLAUDE.md` the same day. I reasoned from a rules file instead of trying the other tool.**
✅ **GATE 2 + §3g's POSITIVE CONTROL BOTH DISCHARGED 2026-08-29 (Langston re-derived).** `TRUMP/USD` crypto opened `00:15:02Z`, first row after the durability ref: `{tick 0.001, resolved true, venue_published}`, **all three legs exact on grid**, negative control run. ⇒ **`18:05:22Z` is now OBSERVED, not inferred.** ⛔⛔ **n=1. NOT a pass — §3's bar is 30 crypto opens or 7 days; print `PASS (n=…)`/`UNDERPOWERED (n=…)`, never bare.** ⛔⛔ **READ THE CRITERION ON THE INTENT-SIDE COLUMNS, ALL IN `active_open_positions`: entry = `intended_entry_price` · stop = `stop_loss` · target = `take_profit`.** ★ **`entry_price` IS THE FILL — on the venue grid BY CONSTRUCTION ⇒ grading it grades KRAKEN and CAN NEVER FAIL** (I wrote that test; Langston caught it; slippage 0.11470578/19.11763 = 0.006 = 2.795−2.789). **`intended_/actual_entry_price`, `target_exit_price`, `actual_exit_price` are NULL as ONE FAMILY until fill/close.** ✅ **KILL-CRITERION WATCH ARMED** (`b6fkkrdmb`) on those 3 columns; an ABSENT leg reports CHECK, never a pass. ✅ §3a co-denominators: `getVTSEvalRolling24h` = 24h rolling, in-memory, resets on restart ⇒ true reach min(24h, uptime). Snapshot every wake → `scratchpad/fg1-codenominators.jsonl`; **record SYMBOLS, classify at READ time.** ⛔ **Never write “crypto refusals = 0” — `USDC/CAD` is `crypto_spot`; split volatile / stablecoin-fiat / fiat-fiat.** ⛔ **PIN the window's class composition** — `#937` could remove sets A+B mid-window.
★ **LANGSTON'S FREEZE REASON, and it is the discipline I lacked: "a pre-registered criterion that keeps moving while the data accrues is NOT pre-registered."** I was spending the exact property §3 was written to buy, one individually-defensible correction at a time — which is why I could not see it from inside. **Stop while the residual is smaller than the measurement.**
⛔ **THE ONE EXCEPTION, not a loophole: if the live observation CONTRADICTS the promotion-hop code evidence that is a CODE DEFECT and reopens as a NEW round with a number — never a quiet edit to a frozen doc.**

**★ THE ARTIFACT:** `…/Batch Completion/F_G_1_PROGRESS_REPORT.md` — §3 the pre-registered criterion (30 crypto opens or 7 days; **crypto bar ABSOLUTE, 100% on grid**), §3a co-denominators, §3b the live classifier control, §3c the xStock denominator. **Reconciliation reads `metadata.gridAtBirth` off the row, NOT a live map.**
⛔ **POST-DEPLOY CRYPTO IS `resolved:true` OR IT IS A DEFECT** — passthrough is xStock-only, so an unstamped crypto row is a **bypass finding**, never cold-start.

**★ LIVE EVIDENCE — in the report; the one that still matters here:** the stamp on a real row is `{"tick":0.001,"resolved":true,"provenance":"venue_published"}`, and **both grid arms have fired live** (`on_grid` is no longer 0), so unanimity is a measurement and not a stuck arm.

⛔⛔ **THE PATTERNS F-G-1 PRODUCED — ALL FOUR NOW HAVE FULL `MISTAKE_PATTERNS.md` ENTRIES; READ THEM THERE.** `fix-follows-pointer` · `verification-weaker-than-claim` · `control-enumerates-the-observed` · and the two that stay live in my head because they fire at KEYBOARD time: **BRANCH ON A DERIVED VALUE, NOT THE FACT** (his blockers 1-5) and ⚠️ **A ONE-DIRECTIONAL CHECK CERTIFIES THE OPPOSITE ERROR — my `isOnGrid` fix began ACCEPTING off-grid prices. WRITE BOTH ARMS.**

⛔ **INSTRUMENT LESSONS:** a mutation harness reporting three clean verdicts **with no output captured** · an edit script that **printed success BEFORE the write, then crashed** (hit TWICE — **read back from disk, never the tool's report**) · pm2 `--lines N` ≈ 1s on this feed · `gh project item-list` returns nothing for cards that exist — **use the GraphQL API; assert `len == totalCount` before asserting absence** · **LINE ENDINGS: repo LF, checkout CRLF — always diff `--numstat` vs `--ignore-all-space --numstat` before committing.** · ⛔⛔ **ROTATED LOGS ARE NAMED FOR THE ROTATION TIME, NOT THEIR CONTENT DATE — `error__2026-08-29_00-00-00.log` HOLDS 08-28. Reading `error__<date>` for `<date>` returns a FALSE ZERO** (08-28's file had 0; the day's 372 sat in the 08-29 file). ★ **`error.log` resets at midnight ⇒ SEAL day-denominators BEFORE 00:00Z.**

⛔ **STEP 10 OWES — SIX TIER-1 DOCS, ALL UNTOUCHED:** `BATCH_CATALOG` · `PHASE_HISTORY` · `PHASE_19_PLAN` §1+§5 · shared `MEMORY.md` · **Langston's `MEMORY.md`** (he prunes FIRST) · **progress report → completion report.** ⚠️ **SIM + System Manual were written at STEP 3 and MUST BE RE-VERIFIED at step 10** — part-done 08-28 (2 #923 dupes merged, stale test list fixed). · **`B-BALANCE-TRUTH` closed or converted in the SAME turn** (its date is FIXED and alert `ef4e1018` resolved, but the batch is open and the 7d backstop is now armed against it) · alert `ebd151de` still owes `resolve --evidence`.

**★ 08-28 — POINTERS; repo authoritative:** `#935` hotfix CLOSED (card Complete, `CHANGES_AND_FIXES` FIX-2026-08-28-A) · `#936` → **Phase 16 by KYLE** §16.9 · `#937` fiat-FX pairs in the CRYPTO universe (13 closed, all losses, −$10.42) → §20.4.6, **Kyle's scope call** · `#938` the xStock N/A flags were never read by the renderer → same row, **code fix, must NOT close under `#937`** · **my `#924` → `#939`** (6-hour collision; newer renumbers; 5 citations updated, the change list ANNOTATED not rewritten).
⛔⛔ **KYLE OVERTURNED MY `#923` HOME — F-G-2 IS BID-vs-MIDPOINT, NOT THE TRAILING STOP.** I keyed on the WORD *trailing* in `OBJ-1` instead of reading what it DECIDES (which SIDE it reads, not whether the computed price is rounded) ⇒ **`wrong-object` at BATCH scale.** → **`B-POST-GRID-MUTATION-CENSUS`, INVESTIGATION-ONLY, `PHASE_19_PLAN` row 3f.b**, ahead of 3g whose scope it sets. ★ **THREE post-VPG mutation sites on the record, ALL FOUND INCIDENTALLY — never enumerated.**
⛔ **AND THE ONE THAT COST FOUR ROUNDS: MY CORRECTIONS KEPT BEING WRONG-OBJECTS THEMSELVES** — invented a second setting that did not exist · dated a boundary from the deploy narrative instead of the reflog · measured pre-data against the deploy ref instead of the window anchor. ⇒ ★ **A CORRECTION IS UNREVIEWED WORK BY THE SAME SESSION THAT ERRED. RE-DERIVE IT LIKE A FINDING.**
⛔ **WRONG-OBJECT, TWICE IN ONE HOUR, BOTH ON MY OWN INSTRUMENT:** grepped `out.log` for a `console.warn` (**it goes to the ERROR stream**), then `err.log` (**the file is `error.log`**) — both returned clean, and the first even PASSED a positive control **on a file that could never hold the line.** ⇒ ★ **A CONTROL MUST RUN ON THE FILE THE CLAIM IS ABOUT, NOT A NEIGHBOUR.** Then acked an alert with an id **I had truncated to 8 chars for display** → "not found".

**★ OPEN, MINE, ALL DISPOSITIONED:** `#918` drain (impact NIL n=4, **must not become OBJ-9's headline**) · `#919` guard coverage 18/19 → 3e · `#921` pre-SQE stage unrendered (grid row fixed; 3 fields still unrendered) · `#922` VOG `ok` unrecorded → 3f · `#923` trailing exit ratchets stops OFF-grid → **F-G-2** · `#924` two live-path mutations → **own batch, 3g** · `#925` perp refusals uncounted → **NO WORK.**

⚠️ **KYLE'S STANDING CORRECTIONS: pairs/coins/symbols are NEVER "markets" · a report that NAMES findings without a disposition, a severity and an owner is not a report · and do not claim a step we are not in.**

**✅ ANSWERED — do NOT re-derive; the REPO carries the numbers, this is the verdict only:** stop widening **NOT ours** · `#915`=`#741` ask-side (**P(zero|unfixed)≈0.64 ⇒ NOT proof**) · confidence inversion **NOT ESTABLISHED** (discrimination on the ranker's own population is ZERO) · volume floor **DEFERRED → Roadmap 21.4** (`min_liquidity` INERT; `lq_min=30` is the real gate; **`seed-family-filters.ts:29-30` still seeds 250k/200k — the zero exists only in the DB**) · depth gate runs on BOTH classes, `assessSufficiency`'s **bid side never called** → 21.4.

**OPEN, EARLIER ARC (repo authoritative):** `#911` witness · `#912` `gov-staleopen` is mint-only and can never self-clear → `B-ALERT-LIFECYCLE` · `#913` `ageMs=` mislabels inter-tick cadence · **`#914` VTS HAS NO FILL LAYER — 999/999 stops fill at exactly the stop; the active path depth-walks** ⇒ VTS is a world where exiting is free, and its own `ema_pnl_pct` re-enters its confidence chain · `#915` inverted stops.

⚠️ **B-SIZING-DEC-RESTORE RESUMPTION IS MINE and is past its start signal** (PERPFEED closed 08-20) — Langston routed it 08-27. Live-realistic position sizes + 15-20 slots, Kyle's 08-19 ask.

★★ **F-E NEEDS NO NEW TRADES — it grades the 547 closed paper trades already in hand against retained venue OHLC. A CLASSIFICATION job, not an accumulation wait.** The "30 per strategy" worry belongs to F-5's FIT, not F-E. **F-E does NOT gate F-5 shipping; it gates the FIT, which is deferred anyway.**

**★ DATA USABILITY — fill-integrity TIERS:** A provably clean **289/525** · B contaminated **109 exits + 18 taker entries** · C unassessable **127, ENRICHED for contamination not neutral**. ⛔ **BUT SELECTION DOES NOT TIER** — `signal-orchestrator:2160` reads the same cache ⇒ **every crypto trade since 2025-12-30 was SELECTED through a possibly-contaminated feed.** ⇒ **accounting: use the tiers. CALIBRATION/LEARNING: treat crypto as compromised as a whole.** xStock materially better.

**TWO EXPOSURES, NOT ONE:** VTS *learning* since **2025-12-30**; paper *money* since **2026-06-16**. The wipe block masked it until 07-15. **The book was NEVER SPECIFIED** — Directive 8.9.0 covers the TICKER channel only.

✅ **`B-EPOCH-KEYING-PARITY` CLOSED.** ★★ **CARRY: a DECIDED rule shipped into ONE READER OF FOUR, and the 4 tests pinned the FUNCTION not the PARITY** — all green while the card showed THREE answers. Langston then holed that fence (**#900**). **OPEN, mine: #900 · #901 · #902 · #903.**

⛔ **STEP-7 MEANS THE *PAPER TRADING* PAGE, NOT THE DASHBOARD TAB (Kyle 2026-08-24)** — on the right page the defect was visible in ONE SCREENSHOT. ⚠️ **`/api/auth/login` allows 5 per 900 s** — repeated curl logins self-inflict a 429; get ONE token and reuse it. ⚠️ **Python `write_text` REWRITES EVERY LINE ENDING** (one edit = a 644-line diff for 12 real lines) — use `read_bytes`/`write_bytes` and check `git diff --cached --ignore-all-space --numstat` before committing.
## ★★ A NEGATIVE CONTROL IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT (`#507`; the repo holds the case)

I established a MECHANISM then hung THREE damage figures on it from instruments I never validated. **All three WITHDRAWN; Langston reproduced none.** ★ **The control sat one `GROUP BY` away: maker exits never read the book, so an honest instrument must be SILENT on them.** ⇒ **Applies to a POSITIVE result as hard as to a zero.**

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ #1 ACTION ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER.** It is ARMED (ALIAS **CC-C**, display **"ANALYST Claude"**, registered in `cc-wake-filter.py`) and fired continuously all session — but **compaction KILLS it.** Re-arm via the Monitor tool per shared MEMORY.md item 4.5 (`persistent: true`, NOT Bash run_in_background). Judge liveness by whether WAKE events have arrived; if none since a compaction, arm ONCE; doubled events ⇒ TaskStop one. Then sweep `/var/log/cc-discord-inbox.jsonl` for anything missed.

**★ KYLE LIFTED MY READ-ONLY FOR TWO BATCHES (2026-07-21 GO; recorded in the roster `write_scope` field — the lift is SCOPED, not general).** I IMPLEMENT them, full 11-step, Langston reviews diffs.

## RECENT HISTORY — CLOSED (the repo completion reports are authoritative; do NOT re-narrate here)

⚠️ **CLOSED-BATCH NARRATION CUT 2026-08-28 (leanness rule — the repo completion reports are authoritative).** **Only the LIVE carries survive:** `#618` the VOIDED P19-B6 risk-envelope approval (`B-COST-MATH-CONSOLIDATION` ended there — **highest-priority untouched**) · `B-KILLSWITCH-WINDOW`'s **denominator leg still open** → `B-READER-TRUTH` obj-6 · `#632` restart re-anchors the loss window · `#624` regime-stamp gap · `#677` stop-provenance (49/241) · ⚠️ **the `%` basis changed at the 07-28 11:57Z cutover — aggregates spanning it mix two denominators.**

## ★★ STANDING LESSONS — the ones that keep re-earning their place

1. **A MATCHING NAME IS NOT A MATCHING THING** — substring collisions · a stream vs its file · a mirror row vs an observation. **Anchor on a delimiter; NAME THE SOURCE TABLE.**
2. **A CONTROL THAT CANNOT FIRE IS THE SAME DEFECT AS THE FENCE IT GUARDS** — prove it by breaking it. ⚠️ **A ONE-DIRECTIONAL check certifies the OPPOSITE error: write BOTH arms.**
3. **CAPABILITY ≠ COVERAGE** — a positive control proves the instrument CAN see it, not that it WAS looking. **State the time reach.** ★ **AND IT APPLIES TO BOUNDARIES: *the commit that makes X possible landed at T* is NOT *X was observed from T*.**
4. **NAME THE POPULATION BEFORE THE NUMBER — AND NAME THE REF.** A deploy time is not a window anchor.
5. **FIVE ERRORS IN ONE APPROVED BATCH (`B-KILLSWITCH-WINDOW`):** RED-CI push ×3 · a vacuous fence · a mutation proof I never ran · an overstated danger · an unlanded sha. **Pattern: ASSERTING A CHECK INSTEAD OF RUNNING IT.**
6. **TWO RULES I AUTHORED are in `CLAUDE.md` (auto-loads — read them THERE): r24.a investigate-before-announce, r29 measurement discipline.**

**★ P19-B-PERPFEED — CLOSED 08-19. Repo is authoritative.**

**FEEVIABILITY carry-over, operative half only:** the divergence paired-n CLOCK STARTS AT MARK-2 DEPLOY. Sequencing detail lives in POST_AUDIT_ROADMAP + the batch's completion report.

**08-19 morning reads — DISCHARGED** (#691 node-cron re-test and the rest; anything still live is in RUNNING_ISSUES, which is authoritative).

**★★ `wrong-object` — THE PATTERN THAT KEEPS COSTING ME (cases in `MISTAKE_PATTERNS.md`; this is the RULE).** ★ **Only a MEASURE-TIME GATE has ever caught it — never vigilance.** ⇒ **BEFORE ANY CLAIM: read what the column is DEFINED as · grep `this.<name>` and never exclude the defining file before asserting absent callers · RUN THE CONTROL ON THE OBJECT THE CLAIM IS ABOUT — a neighbour that passes is worse than no control.** ⛔⛔ **AND MY CORRECTIONS ARE THEMSELVES WRONG-OBJECTS: invented a second setting · dated a boundary from the deploy narrative · measured against the deploy ref not the window anchor. A CORRECTION IS UNREVIEWED WORK BY THE SESSION THAT ERRED — RE-DERIVE IT LIKE A FINDING.**

**MY OPEN ISSUES — NUMBERS ONLY; `RUNNING_ISSUES` IS AUTHORITATIVE** (no due dates — batches get a PLACE): **#734 = PHASE-21 GO-LIVE BLOCKER** (`active-portfolio-manager.ts:165` THROWS in live; **TWO independent trips ⇒ fixing either alone leaves live blocked**) · **#733** (↔ **#402**; **BLOCKS `dt-deploy`**) · #687 · #688 · #689 · **#690 fixed — residual: audit-FAILs have NO alert path** · **#692 CARRY THE MECHANISM: a DOWNWARD re-anchor strands legacy-notional positions above the new budget ⇒ ZERO opens until they close; RECURS every downward re-anchor.**

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07 after a 4-second collision where my resolve freed the key his announced park had just blocked). Everything else in triage stays mine.
**★ SESSION-FIX 07-27 ✅ DONE** (runbook has it). Own transcript folder (analyst = **4dfc = THIS session**) + memory-only junction. "(fork)" is intrinsic + cosmetic — do NOT re-root.
