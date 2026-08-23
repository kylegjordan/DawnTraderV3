# MEMORY_CC_C.md — Claude Analyst (CC-C) Volatile Working-State

> ★ NAMED 2026-07-19: **"Claude Analyst"** (alias **CC-C**, roster-bound). Discord display name **"ANALYST Claude"** (the `--sender` value); wake keys "Claude Analyst"/"Analyst Claude"/"CC-C" in `cc-wake-filter.py`. Arm with ALIAS `CC-C` — never CC-A/CC-B. *(The "SPEAKING:" prefix is RETIRED with Telegram — `--sender` IS the label.)*

> ★ LINEAGE (settled): this shell was the ORIGINAL Claude New, revived 07-19 as the Analyst. **I am NOT Claude New; never arm a CC-B watcher.** Stale TaskList entries are inherited. Roster: `.claude/cc-session-roster.json`.

## YOUR ROLE (Kyle 2026-07-19): **paper-trading results ANALYST (standing)** — analyse active paper results; find what can be calibrated NOW.

**★ THE STANDING WORK LEDGER (Kyle 2026-08-20): `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` — re-read it AFTER EVERY batch/sub-batch close, update statuses, ADD findings that should become batches.** Part D = the unwind queue; A6 awaits Kyle's pick; A7/#618 = highest-priority untouched (risk envelope).

## WHAT CHANGED 2026-06-19 → 07-19 (compressed)
1-2. **Comms fabric + B6/B7/B8 reorg arc — in the repo (CLAUDE.md §6/§8, BATCH_CATALOG).**
3. **★ ACTIVE TRADING IS ON — PAPER MODE (B8.5 THE SWITCH-ON):** crypto flipped ~2026-07-14, xStock staged behind it (first real xStock close = AC2, expected after the Sun 8pm ET venue reopen). ~5 days of live soak data exists. Live mode remains Phase 21.
4. **★ FEE REALITY (the centre of your mission):** Kraken Tier-1 = **0.80% taker / 0.40% maker** (~1.8% round-trip taker) — the binding constraint on crypto edge. FEE LADDER = the gate-10 unblock (rung-1 bigger targets at taker; rung-2 maker entries BUILT; rung-3 pWin-ceiling → Phase 25). ⚠️ **Dashboard figures move hourly — RE-QUERY, never quote remembered numbers.**
5. **★ SOAK-DATA CAVEATS — read the batch record, not memory. The trap was carrying a claim I had not checked in code.**
6. **Rules 23-27 + §9.4/§9.5 — in CLAUDE.md (auto-loads).**
7. **Weekend posture:** #531 — active-path xStock positions have NO weekend mechanism (4 held through the 48h shutdown 07-17→07-19); options paper (suspend/flatten/hold + calendar-based admission gate (d), NEVER a hold prediction) → Kyle ruling pending. xStock trades 24/5 (Sun 8pm ET → Fri 8pm ET); US holidays pause.

## YOUR DATA SOURCES (psql via staging: `ssh root@188.245.193.8` → deploy → `set -a && . ./.env` → `psql "$DATABASE_URL"`)
- **`closed_trades`** — realized active-path results; THE primary fee-viability population. ⚠️ **always filter `closed_at IS NOT NULL`** (rows are written AT OPEN). Post-2026-07-28: gross is on ACTUAL fills, `total_cost` = fees only, `%` on actual-entry basis — **aggregates spanning 07-28 11:57Z mix two denominators.**
- **`active_open_positions`** / **`rtb_signals`** (genesis-capture metadata: regime/DBS/pattern/pool/rankAtPromote) — selection forensics; **shadow-trade + selection-IC records** answer "did the ranker pick the best available signal?"
- **`vts_open_trades` + vts_trades JSON** — the wide learning population (SEPARATE from active; never blend).
- **`/api/active-engine/trades/analytics`** — the rolling summary Kyle sees; **rtb-metrics EV-reject breakdown** + Filter-Diagnostics funnel counters show where signals die.
- Mechanics: `net-expectancy-kernel.ts`, `decideMakerTaker`, friction model. Context: **`…/Scope Files/P25_SCORING_STACK_PRESTUDY.md` §7** (READ before any retire/calibrate opinion), `POST_AUDIT_ROADMAP.md`, `PHASE_19_PLAN.md`, the two pipeline audits.
- ⚠️ **SCHEMA TRAP — A COLUMN'S NAME IS NOT ITS CONTENT. VERIFIED BY ME 07-30: `closed_trades.trade_mode` holds `'TARGET'`, NOT paper/live** ⇒ filtering `trade_mode='paper'` returns ZERO and reads as "no trades". (#558 is the same family — CC-A, reported.) **★ MY OWN 07-30: the `positions=N` token in `out__*.log` is NOT the open-position count** — read `positions=2` while the DB held **8**. **Open positions ⇒ `active_open_positions`; closes ⇒ `closed_trades`. NEVER a log token.**

## STANDING BEHAVIORAL RULES (unchanged, they bind you too)
Plain language to Kyle every message (no code/paths/jargon; canonical terms: regime, xStock, live mode, paper mode, SQE, RTB, VTS, TEC, MCE, signal orchestrator); two-paragraph default; §5.13 rolling-windows-over-snapshots; evidence before assertion (rule 22: an asserted absence needs presence-evidence; never 2>/dev/null a governed read); §10.5 per-turn alerts check; NEVER push on red CI. **WRITE SCOPE (Kyle lifted read-only 2026-07-21, SCOPED — see the roster's `write_scope`): I implement my OWN governance/tooling batches (#553 done, #554 parked). Analysis of TRADING behaviour stays READ-ONLY, and any code change beyond those needs a fresh Kyle grant — do NOT read the lift as general.**

## ★★ THE HEADLINE FINDING (2026-07-20) — READ BEFORE ANALYZING ANY TRADING RESULT
**THE ACTIVE PATH HAS TWO ADMISSION LANES AND THEY MUST NEVER BE POOLED.** `closed_trades.metadata->>'admissionBasis'`: **`exploration`** = the GOVERNED lane (`exploration-lane.ts`, budget + anneal, `[11.8B]` by-design carve-out — #523/#514/#508/#505) — admitted on KNOWN-NEGATIVE netEV, **SUPPOSED to lose money**, the losses are the price of learning data. **`organic`** = genuine positive-netEV admits. ⇒ **Pooling them reads a deliberate learning spend as strategy failure — I did exactly that on 07-19 and gave Kyle a false headline.** On the organic cohort the fee is NOT insurmountable, but n is small — a hint, not a result. **Per-cohort numbers move constantly: RE-QUERY, never quote from memory.**

## ★ VERIFIED MECHANICS (measured, not reasoned — trust these)
- **Net-EV kernel arithmetic is CORRECT.** All 3 call sites convert `frictionPct × entryPrice` (expectancy.ts:636, signal-orchestrator.ts:2502, maker-taker-decision.ts:222/241). NOT a B8.5c/#503 units repeat. Independent recompute from stored `rtb_signals` inputs reproduces `chosen_net_ev` to 3 decimals.
- **pWin is NOT pinned at the 0.60 ceiling** — live `di_at_queue` gives avg pWin ≈0.46 (DI runs low). ⚠️ but that sample is queue-only = NON-promoted signals = biased (CC-A's catch).
- **Loss is monotonic in SIZE, not RR.** <2% target n=72 −$87.14 · 2–4% n=26 −$45.51 · ≥4% n=28 −$0.81; RR flat 1.13/1.19/1.29. **Kills any raise-min_rr response** (Langston concurs).
- **The 4% `target_floor_pct` is NOT a live rule** — reorg-B2.1 (2026-06-21) deliberately DROPPED the floor-LIFT as redundant with `[11.8B]` (SYSTEM_MANUAL:427-430, SIM:211). Orphaned config residue, NOT a defect.
- **RETENTION — ★ REWRITTEN 08-09, the old line here was REFUTED BY MEASUREMENT (do not restore it).** Promoted signals preserve their verdict (`closed_trades.metadata`: netEvAtAdmit/admissionBasis/floorInEffect/policyVersion/rtbQueueId/queuedAt + regimeWeight + rankAtPromote). ⚠️ **The "declined signals LOSE theirs when `rtb_signals` is deleted" claim is FALSE** — it originated with Langston, I restated it WITHOUT CHECKING, and both CCs scoped on it. **Truth: declines are RETAINED at volume in `signal_eval_archive` (90d hot → WARM/COLD, never deleted). What is missing is GEOMETRY on the surviving row** — `vts-runner` 32/32 vs `signal-orchestrator` 0/6,077. **Lesson that generalises: I have now stated this fact wrong in BOTH directions. Query it; never recite it.**
- **VTS `regimeWeight` is ~98% EXACT ZERO since ~07-14** (0% on 07-12/13 → 48.7% 07-14 → 97.8% 07-16 → 98.8% 07-19). Exact 0 is unreachable honestly (needs trendScore=0 AND volatility=1). ⇒ **any below-floor % computed over all rows is a null artifact — flagged to CC-A re: the 41.11% figure in #543.** Distinct-count ≈ non-zero-row-count, so "variety collapse" was never measuring variety.

## ★★ RATIFIED CONTEXT (detail: POST_AUDIT_ROADMAP + P25_SCORING_STACK_PRESTUDY §7 + #501)
**★ #501 (3-way ratified): THE SWITCH-ON WAS DATA-COLLECTION, NOT PROFIT — and its 12,078-trade VTS baseline corroborates the crypto geometry finding below.**
## STANDING METHOD NOTE (earned the hard way 2026-07-19/20)

## ★ 2026-07-20 FINDINGS — pointers only; RUNNING_ISSUES + the ledger are authoritative (#531 + per-cohort numbers + weekend-fill refutation). Never re-derive from memory.
**MY RULE-27 CARVE-OUT (stated + accepted):** pairwise is the default, but I do NOT stay silent about a number that reached Kyle and is wrong — offering a correction is not convening a panel.

## ★★★ STANDING ASSIGNMENT — I OWN `1-system-manual/ACTIVE_PATH_FLOW.md` (living end-to-end map of the active trading path; update as each Phase-19 batch lands). Scope inputs + Langston's GATE-1/2/3 rulings: `…Scope Files/ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md`.

## ★ COMMS — mechanics only (length + statelessness rules are in CLAUDE.md §6.5, which auto-loads): `scp` the body to Helsinki `/tmp` → `cc-send --sender "ANALYST Claude" --message "$(cat /tmp/f)"`.
**★★ FILE-FIRST TO LANGSTON, ALWAYS — and 2026-08-23 measured WHY.** A long inline dispatch hit `claude timeout after 900s` and the bridge logged *"error … suppressed in channel"*, so it was indistinguishable from silence; my re-poke then deepened his queue. **Stage the content at `/home/langston/inbox/<BATCH>/` and post a SHORT pointer naming the path.** He is stateless per-invoke, so a correction message does not carry the thing it corrects.

## ★★★ CURRENT POSITION (2026-08-23 12:00Z) — SUPERSEDES THE BLOCK BELOW

**★★ `#741` IS THE FACT THAT REFRAMES EVERYTHING.** The mini-book that carried the `#507` truncation defect ALSO fed a **midpoint** into the price cache (`kraken-websocket-adapter.ts:891` → `:916` emit → `live-pricing-adapter.ts:1022` → `getPriceWithFallback` → `currentPrice`), so it reached **every exit DECISION**, not just the taker fill PRICE. Langston and I both held "a maker exit never reads the book" and both were wrong on one word: it does not read the book for its PRICE, but the system reads the book to decide **whether it filled**. **He WITHDREW the 164.8 bps floor outright and superseded the 21-row remediation.**

**MEASURED, all 525 closes, one rule, both classes (±10-min venue traded-high):** **289 verified clean (55.0%) · 398 verifiable (75.8%) · 109 contaminated (20.8%) · 127 unassessable.** ⚠️ **The unassessable bucket is ENRICHED for contamination, not neutral** — Kraken emits a bar ON TRADE EVENTS, so no trades = no bar = the quiet windows and thin symbols, exactly where a fill at an unfilled offer is most likely. **20.8% is a floor twice over.**

⚠️ **I RETRACTED "xSTOCK IS UNASSESSABLE" — it was wrong.** I validated the OHLC bars against ticker `ask` (an unfilled offer) and `last` (a carried-forward snapshot); neither measures "highest TRADE in the interval". Kraken's docs settle it and Langston re-derived them. **That retraction took verified-clean from 28.6% → 55.0%.**

**THE PLAN — `SCRATCH_CHECKLIST` Part F, Langston-ruled, owner+due on every line:** **F3** provenance stamp (FIRST — due 08-27) · **F1+F2** one detector + disposition, Kyle's dashboard fix falls out here (09-03) · **F4** mid-divergence instrument, crypto-only (09-10) · **F5** per-strategy reach, seeded neutral (09-10) · **F6** the reset, gated. **Reset gate has a NUMBER: stamp on 100% of closes · ≥50 assessable across ≥5 consecutive days · ZERO contaminated.**

**IN FLIGHT: `B-EXIT-PROVENANCE` (F3), change-class ARCHITECTURE, design (B) ruled.** Scope r2 + pre-audit pushed; **Step 2 is BOUNCED and the amended §1+§2 are with him** (staged `/home/langston/inbox/B-EXIT-PROVENANCE/`). **Design (B) = leave `source` untouched, carry a separate `producer` field** — because `isKrakenVenueSource(source: string)` is typed `string`, so under (A) tsc CANNOT catch a miss at the one site that IS the trading gate. **Census `priceCache.set` SITES, never callers** — 3 writers: `:706` updateCache (fan-in ×3), `:784` seedLastKnownGoodPrice, **`:307` fetchPrice = THE LAUNDERER** (re-stamps `last_known_good` with `cachedAt: Date.now()`, then served as fresh). **C-B1 producer REQUIRED + closed union. Every vocabulary token needs its emit `file:line`.**

⛔ **LESSONS FROM TONIGHT THAT KEEP RE-EARNING THEIR PLACE:** (1) **an ack is NOT a resolve** — acking silences the dedupe key for the whole batch and blinds the rail; (2) **filing is NOT taking effect** — I closed governance alerts on having WRITTEN the ledger rows; they were unparseable (`type` must be exactly `open`, value must carry a real ISO date — `poller.mjs:456`) and the verification is a CLEAN CHECKER TICK (`opened=0`), never the commit landing; (3) **state a listing's PAGE SIZE before reading a negative** — I read 30-of-51 as "no board access"; (4) **file-first to Langston ALWAYS** — a long inline dispatch hit `claude timeout after 900s` and the error was **suppressed in channel**, so it looked exactly like silence, and my re-poke deepened his queue.

## SUPERSEDED STATE (2026-08-23 00:20Z) — kept only for the behavioural lesson below

**`B-BOOK-TRUNCATE-HOTFIX` (#507) — deployed `e6f7c70b3` 2026-08-22T22:01Z, Langston-verified (crossed book states 31.08% → 0), and DECLARED OPEN in `GOVERNANCE_EXCEPTIONS.md` because its trade-level verification is INSUFFICIENT, not passing.** Mechanics + evidence live in the repo (`CHANGES_AND_FIXES` FIX-2026-08-22-A, the scope file, `b507-kraken-book-truncate-checksum.test.ts`). DO NOT RE-NARRATE.

⚠️ **Trade-level leg = INSUFFICIENT and must be reported as such.** Pre-registered PASS = **≥20 NEW crypto stop-type closes with 0 above entry** (0/20 vs a 70% base ⇒ p≈2×10⁻⁴). Deploy cutline **2026-08-22 22:01Z**. Baseline was **14/20 above entry**.
⚠️ **Checksum mismatch ≈100% is EXPECTED, pre-registered, NOT failure** — Kraken sends price/qty as JSON **numbers**, so `String()` cannot rebuild the CRC input. Integrity signal is `crossedDetections` only.

**⛔⛔ THE LESSON THAT COST ME KYLE'S TRUST — CARRY THIS.** I established a MECHANISM and then attached THREE damage figures to it (**$187.78 · 111 rows · ~$111**), each from an instrument I never validated, revising down each time. **ALL THREE WITHDRAWN; Langston reproduced none.** Truth: **~$55 measurable / <$150 bounded, paper only.** ★ **The control was in the same table one `GROUP BY` away: MAKER exits never read the book, so any honest instrument must be SILENT on them.** Every candidate fires near-equally on both arms (42.05/30.38 · 45.63/41.30 · 35.59/32.50); **only excursion MAGNITUDE discriminates (382.2 vs 58.6 bps).**
⇒ **A NEGATIVE CONTROL IS NOT A NICETY ADDED WHEN A NUMBER LOOKS ODD — IT IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT.** Rule 29(b) for zeros applies just as hard to a POSITIVE result.
**Also: my test scenario was wrong THREE TIMES**, each caught by a failing test, each time modelling the venue doing something it does not do (crash with no deletes → rise leaving consumed asks alive → finally: levels the market EATS are in-window and ARE deleted; only the far-END drop-out is silent, and that is the whole defect).

**`B-PHANTOM-FILL-RECONSTRUCT` — pushed `9813fdb41`, NOT deployed, and SUPERSEDED by Part F F1+F2** after `#741` voided its detector's warrant. Kyle's ruling that shaped it stands and still governs F1+F2: *"flag and remove from our accounts, but we don't delete these trades"* AND *"we can replace the phantom exits with real market prices if we have them"* ⇒ reconstruct BESIDE, never over. Declared OPEN in `GOVERNANCE_EXCEPTIONS.md`.

**`#737`** depth-1 watch item (fails CLOSED — suppresses opens, never bad fills). **Rule defect (CC-A):** a hotfix owes no scope file yet that file is the only place its class can be declared ⇒ every hotfix trips `class-undeclared`. **`VALID_CLASSES` DOES include `hotfix`** (`config.mjs:181`) — Langston's alert text said otherwise and was wrong.

**`B-BALANCE-TRUTH` OBJ-4 lifetime scoreboard is on the page.** ⚠️ **Its headline is PRE-correction and moves when F1+F2 lands.** A positive lifetime RETURN beside a negative lifetime P&L is NOT a contradiction — the return is time-weighted, the right measure when the capital base moved for non-trading reasons.

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ #1 ACTION ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER.** It is ARMED (ALIAS **CC-C**, display **"ANALYST Claude"**, registered in `cc-wake-filter.py`) and fired continuously all session — but **compaction KILLS it.** Re-arm via the Monitor tool per shared MEMORY.md item 4.5 (`persistent: true`, NOT Bash run_in_background). Judge liveness by whether WAKE events have arrived; if none since a compaction, arm ONCE; doubled events ⇒ TaskStop one. Then sweep `/var/log/cc-discord-inbox.jsonl` for anything missed.

**★ KYLE LIFTED MY READ-ONLY FOR TWO BATCHES (2026-07-21 GO; recorded in the roster `write_scope` field — the lift is SCOPED, not general).** I IMPLEMENT them, full 11-step, Langston reviews diffs.

## RECENT HISTORY — CLOSED, one line each (repo completion reports are authoritative; do NOT re-narrate here)

- **07-23/25 B-REPO-RELOCATE + B-MEMORY-AUTOLOAD** — closed, Kyle-ack'd. · **07-24 dead-rule sweep** (`43182992f`, 8 retired).
- **07-25 board takeover** — I own `CURRENT_RUNNING_ISSUES.md`. · **07-27 B-OPEN-TRADES-DISPLAY** closed, Kyle-confirmed.
- **07-27/28 Kyle scratch list** — Part A done; Parts B/C outstanding (`SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md`).
- **07-28 B-COST-ACCOUNTING-HONESTY** — premise was FALSE; the obvious fix would have broken correct P&L. ⚠️ **`%` basis changed at the 07-28 11:57Z cutover — pre/post are different denominators.**
- **07-28 B-PROMOTION-RACE-FIX** (#508) — real concurrency defect; **three of my proposed causes were each killed by Kyle's data challenges first.**
- **07-31 B-COST-MATH-CONSOLIDATION** — one shared `core/math/trade-pnl.ts`; **ended at the RISK ENVELOPE: Langston VOIDED his own P19-B6 approval** (#618).
- **07-31 B-KILLSWITCH-WINDOW** — numerator only; **denominator leg still open** (→ `B-READER-TRUTH` obj-6). Report written LATE 08-07 (checker caught it).
- **08-07 B-SIZING-DEC-RESTORE 1-3/n** — tuner (#659) + 11.7S deleted, fixed-notional sizer landed. **Queued behind the crypto work.**
- **#632** restart re-anchors the loss window (Kyle's own circuit-breaker) · **#624** regime-stamp gap · **#677** stop-provenance (only 49/241 crypto closes carry a stop).

## ★★ STANDING LESSONS — the ones that keep re-earning their place

1. **A MATCHING NAME IS NOT A MATCHING THING** — substring collisions bit 3× in one file (deleted names are PREFIXES of surviving ones); a renamed token still CONTAINS the old name, so `includes()` controls pass while blind. **Anchor on a delimiter.**
2. **A CONTROL THAT CANNOT FIRE IS THE SAME DEFECT AS THE FENCE IT GUARDS** — prove every control by breaking it. Two of my mutations landed on code the test never executes; the suite stayed green.
3. **CAPABILITY ≠ COVERAGE** — a positive control proves the instrument CAN see it, NOT that it was LOOKING when it happened. State the time reach.
4. **NAME THE POPULATION BEFORE THE NUMBER** — `closed_trades` holds at-open + never-filled rows; pooling two lanes produced a headline that was an averaging artifact. **Both errors were mine, 11 days apart.**
5. **THE FIVE ERRORS INSIDE ONE APPROVED BATCH (B-KILLSWITCH-WINDOW):** pushed on RED CI ×3 (ran `tsc`, never the suite); a vacuous-pass fence (4 tests PASSED asserting nothing); claimed a mutation proof I had not run; overstated a staging danger; quoted an unlanded sha. **Pattern: asserting a check instead of running it.**
6. **TWO RULES I AUTHORED live in CLAUDE.md (auto-loads — read them THERE): rule 24.a investigate-before-announce, rule 29 measurement discipline.**

**★ P19-B-PERPFEED — CLOSED 2026-08-19, Review=Approved.** Full record: its completion report + BATCH_CATALOG. Do not re-narrate.

**FEEVIABILITY carry-over, operative half only:** the divergence paired-n CLOCK STARTS AT MARK-2 DEPLOY. Sequencing detail lives in POST_AUDIT_ROADMAP + the batch's completion report.

**08-19 morning reads — DISCHARGED** (#691 node-cron re-test and the rest; anything still live is in RUNNING_ISSUES, which is authoritative).

**★★ 2026-08-21 SESSION — THE THING TO CARRY:** I filed **#735** (a 184-row "broken fee era") and **escalated it to Kyle with a push notification**, then **WITHDREW it the same day**: I tested `gross_pnl − pnl` against **`total_fee`** when the value is DEFINED from **`total_cost`** (= fees **+ slippage**, `schema.ts:1708/1710`). Correct column ⇒ **478/478 consistent, deviation 0.0000**; the 184 are just the slippage rows. ⇒ **lifetime −$173.14 is CORRECT, no caveat; "+$187.14 clean era" is MEANINGLESS — never use it.** ★ **What caught it was the MANDATORY §2 1.b provenance read, NOT vigilance** (I had passed the data 3× attentively). **`wrong-object` instance 7 — THIRD in one session, by the session that filed instance 6 and wrote the warning above it. Knowing the pattern does not suppress it; only a measure-time gate does.** ⇒ **STANDING: before testing any identity, read what the column is DEFINED as. Before asserting an absence of callers, grep `this.<name>` and never exclude the defining file.**

**MY OPEN ISSUES:** **#734 drawdown-anchor: a PHASE-21 GO-LIVE BLOCKER — `active-portfolio-manager.ts:165` THROWS in LIVE (paper only logs); TWO independent trips (47.15%-vs-20% from the anchor mismatch, AND `MAX_OPEN_POSITIONS=10` hardcoded vs 15 slots), so fixing either alone leaves live blocked (home B-DRAWDOWN-ANCHOR-COHERENCE, me, 09-04)** · **#733 bridge/canonical 4-of-14 regenerated vs governance-says-frozen (home B-CANONICAL-CORPUS-ACCURACY, me, due 09-04)** · #687 stale equity JSON (OBJ-4) · #688 B-DAILY-CUTOVER-SWEEP (scheduled at close) · #689 ohlcStoreFraction denominator (options note at close) · **#690 ✅ FIXED 08-18 (Kyle-granted; Langston PROCEED; CI green; rides tonight's PERPFEED deploy at fb4acdf8a+37a294867)** — real cause DEEPER than swapped ratio: feature-enrichment assumed NEWEST-first but getPriceData is ASC → all windows → tail slices; trading path verified CLEAN (strategy-helpers RSI correct); audit's tautology tests rebuilt to probe real methods w/ literal expectations; dead saveEnrichedFeatures + dead data-normalization.ts (Langston's sibling find, same defect class, zero importers) DELETED rule-18(a), archived+logged; getPriceData ASC contract at source. **STILL OPEN under #690: audit-FAILs-have-no-alert-path options note at close. Decoupler: 03:00Z cron miss ≠ RSI verdict — manual audit route is the instrument.** · #691 (above) · **#692 the 08-12 re-anchor OPENS FREEZE** (Kyle's volume report confirmed+root-caused: $2,250→$824 anchor drop left 4 legacy-notional positions = 144% of new budget → ZERO opens all classes 08-13→16, resumed 08-17 as they closed; signals NEVER wavered ~700k xs + 1.7M cr evals/day; bucket-2 designed-breaker×designed-sizer interaction, RECURS on every downward re-anchor; **options note to Kyle at close**; corollary: the mark's crypto effect unmeasurable before 08-17 — tonight's 42be3ab7 is the real read).

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07 after a 4-second collision where my resolve freed the key his announced park had just blocked). Everything else in triage stays mine.
**★ SESSION-FIX 07-27 — ✅ DONE (detail: `CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md`).** Each session now has its OWN transcript folder (analyst = **4dfc = THIS session**) + a MEMORY-ONLY junction. ⚠️ Sessions still show "(fork)" — INTRINSIC + COSMETIC; do NOT re-root unless Kyle insists.
