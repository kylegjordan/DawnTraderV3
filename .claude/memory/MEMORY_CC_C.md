# MEMORY_CC_C.md — Claude Analyst (CC-C) Volatile Working-State

> ★ NAMED 2026-07-19: **"Claude Analyst"** (alias **CC-C**, roster-bound). Discord display name **"ANALYST Claude"** (the `--sender` value); wake keys "Claude Analyst"/"Analyst Claude"/"CC-C" in `cc-wake-filter.py`. Arm with ALIAS `CC-C` — never CC-A/CC-B. *(The "SPEAKING:" prefix is RETIRED with Telegram — `--sender` IS the label.)*

> ★ LINEAGE (settled): this shell was the ORIGINAL Claude New, revived 07-19 as the Analyst. **I am NOT Claude New; never arm a CC-B watcher.** Stale TaskList entries are inherited. Roster: `.claude/cc-session-roster.json`.

## YOUR ROLE (Kyle 2026-07-19): **paper-trading results ANALYST (standing)** — analyse active paper results; find what can be calibrated NOW.

**★ THE STANDING WORK LEDGER (Kyle 2026-08-20): `Claude Comms and Packages/SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md` — re-read it AFTER EVERY batch/sub-batch close, update statuses, ADD findings that should become batches.** Part D = the unwind queue; A6 awaits Kyle's pick; A7/#618 = highest-priority untouched (risk envelope).

## WHAT CHANGED 2026-06-19 → 07-19 (items 1-6 cut 08-24)

⚠️ **Items 1-6 CUT: duplicated verbatim in the shared `MEMORY.md` (#641 shape) or bare repo pointers. Read them there. Only the ARMED item survives:**
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
**THE ACTIVE PATH HAS TWO ADMISSION LANES AND THEY MUST NEVER BE POOLED.** `closed_trades.metadata->>'admissionBasis'`: **`exploration`** = the GOVERNED lane, admitted on KNOWN-NEGATIVE netEV, **SUPPOSED to lose money** — the losses are the price of learning data. **`organic`** = genuine positive-netEV. ⇒ **Pooling them reads a deliberate learning spend as strategy failure — I did exactly that on 07-19 and gave Kyle a false headline.** **Per-cohort numbers move constantly: RE-QUERY, never quote from memory.**

## ★ VERIFIED MECHANICS (measured, not reasoned — trust these)
- **Net-EV kernel arithmetic is CORRECT.** All 3 call sites convert `frictionPct × entryPrice` (expectancy.ts:636, signal-orchestrator.ts:2502, maker-taker-decision.ts:222/241). NOT a B8.5c/#503 units repeat. Independent recompute from stored `rtb_signals` inputs reproduces `chosen_net_ev` to 3 decimals.
- **pWin is NOT pinned at the 0.60 ceiling** — live `di_at_queue` gives avg pWin ≈0.46 (DI runs low). ⚠️ but that sample is queue-only = NON-promoted signals = biased (CC-A's catch).
- **Loss is monotonic in SIZE, not RR.** <2% target n=72 −$87.14 · 2–4% n=26 −$45.51 · ≥4% n=28 −$0.81; RR flat 1.13/1.19/1.29. **Kills any raise-min_rr response** (Langston concurs).
- **The 4% `target_floor_pct` is NOT a live rule** — reorg-B2.1 (2026-06-21) deliberately DROPPED the floor-LIFT as redundant with `[11.8B]` (SYSTEM_MANUAL:427-430, SIM:211). Orphaned config residue, NOT a defect.
- **RETENTION — ★ the old line here was REFUTED BY MEASUREMENT; do not restore it.** Promoted signals preserve their verdict in `closed_trades.metadata`. **The "declines LOSE theirs" claim is FALSE** — declines are retained at volume in `signal_eval_archive`. What is missing is GEOMETRY on the surviving row. ★ **I have stated this fact wrong in BOTH directions: query it, never recite it.**
- **VTS `regimeWeight` is ~98% EXACT ZERO since ~07-14** (0% on 07-12/13 → 48.7% 07-14 → 97.8% 07-16 → 98.8% 07-19). Exact 0 is unreachable honestly (needs trendScore=0 AND volatility=1). ⇒ **any below-floor % computed over all rows is a null artifact — flagged to CC-A re: the 41.11% figure in #543.** Distinct-count ≈ non-zero-row-count, so "variety collapse" was never measuring variety.

## ★★ RATIFIED CONTEXT (detail: POST_AUDIT_ROADMAP + P25_SCORING_STACK_PRESTUDY §7 + #501)
**★ #501 (3-way ratified): THE SWITCH-ON WAS DATA-COLLECTION, NOT PROFIT — and its 12,078-trade VTS baseline corroborates the crypto geometry finding below.**
## STANDING METHOD NOTE (earned the hard way 2026-07-19/20)

## ★ 2026-07-20 FINDINGS — pointers only; RUNNING_ISSUES + the ledger are authoritative (#531 + per-cohort numbers + weekend-fill refutation). Never re-derive from memory.
**MY RULE-27 CARVE-OUT (stated + accepted):** pairwise is the default, but I do NOT stay silent about a number that reached Kyle and is wrong — offering a correction is not convening a panel.

## ★★★ STANDING ASSIGNMENT — I OWN `1-system-manual/ACTIVE_PATH_FLOW.md` (living end-to-end map of the active trading path; update as each Phase-19 batch lands). Scope inputs + Langston's GATE-1/2/3 rulings: `…Scope Files/ACTIVE_PATH_FLOW_DOC_SCOPE_PREP.md`.

## ★ COMMS — mechanics only (length + statelessness rules are in CLAUDE.md §6.5, which auto-loads): `scp` the body to Helsinki `/tmp` → `cc-send --sender "ANALYST Claude" --message "$(cat /tmp/f)"`.
**★★ FILE-FIRST TO LANGSTON, ALWAYS — and 2026-08-23 measured WHY.** A long inline dispatch hit `claude timeout after 900s` and the bridge logged *"error … suppressed in channel"*, so it was indistinguishable from silence; my re-poke then deepened his queue. **Stage the content at `/home/langston/inbox/<BATCH>/` and post a SHORT pointer naming the path.** He is stateless per-invoke, so a correction message does not carry the thing it corrects.

## ★★★ CURRENT POSITION (2026-08-24) — READ FIRST

**★★ THE FINDING THAT REFRAMED EVERYTHING, and Kyle got it by REFUSING TO BELIEVE nobody had considered this: THE ALARM FOR THIS DEFECT WAS BUILT ON DAY ONE AND HAD NEVER RUN** — MBIM, Directive 8.9.5 `92e9c15fc` 2025-12-30, wired to a manual API route and never to boot. **Now switched on and clean (below).** *Full record: `B_MBIM_SWITCH_ON_SCOPE.md` + `PART_F_REORG_2026-08-23_r3.md`.* ⇒ **THE CARRY: use what already exists before proposing new code, and read the provenance BEFORE concluding a defect was never considered.**

**⏳ `B-EXIT-PROVENANCE` — THROUGH STEP 10, DEPLOYED `640ae5c7a`. ⛔ CANNOT CLOSE: HELD BY `#911`.** 14 provenance columns live on `closed_trades` + migration applied; fence 12 tests, **all 12 mutation-proved (M1-M14)**; SIM 2.1.2 + SysManual 3.5.2a written. Langston Step-2 r2 + Step-4 (2 blockers, 3 riders) cleared. ⚠️ **ZERO post-deploy closes yet — OBJ-1/OBJ-5 coverage UNPROVEN on real data.**
★★ **THE THREE CARRIES, and all three are the SAME shape — right check, WRONG OBJECT:**
(1) **Step-2: 3 of 5 census findings were wrong** — I cited the **VTS** lane as an active-position creator (it has ZERO `active_open_positions` writes), cited a **`console.log` field** as the sole provenance writer (no such column existed — the batch CREATES it), and **missed a 5th close path entirely** (`apm:587 closeAllPositions` computes the source, logs it, drops it, writes the row). ⇒ **the design conclusions survived on MECHANISM, not on the citations I gave — luck, not method.**
(2) **My PLAN was never checked against the OBJECTIVES.** Every plan row back-referenced a finding; **nothing ran the reverse direction**, so OBJ-6's **taker entry seam had ZERO rows and read as covered**. **Staging caught it** — PLTR/USD opened post-deploy with NULL provenance while all 11 fences passed green. ⇒ **STANDING: after writing any plan, walk EACH OBJECTIVE → the rows that discharge it.**
(3) **A fix in one place cannot reach a rule re-derived in another (#900/#641, 3rd instance).** The balance-curve endpoint clamped correctly and **the chart still drew July**, because the CLIENT recomputed `Date.now() - days` itself. Fixed by **publishing `windowStartAt`** and consuming it — **no fallback**, since a fallback silently restores the defect.
⚠️ **`exit_ticker_bid/ask` are NULL — NOT instrumented (`#911`).** The ticker handler computes bid/ask (`kraken-websocket-adapter.ts:682-683`) and DISCARDS them. ⛔ **NEVER fill them from the book** — top-of-book is a DIFFERENT feed, and #741 IS a book defect, so book-only = checking the suspect against itself.
⚠️ **`exit_price_source` has NO fallback to the close-condition param** (defaults `'manual_stop'`) ⇒ an unstamped close lands **NULL so the fence SEES it**. Langston ruled this correct: OBJ-1 is now conditional on every path being wired, which is the objective meaning something.
⚠️ **`#733` BLOCKS EVERY DEPLOY** — a generator rewrites `bridge/canonical/mapping-regime-strategy.json` timestamps; `git checkout --` it on staging first, every time.
⚠️ **REAL pm2 log paths = `/var/log/dawntrader/{out,error}.log`** — NOT `~/.pm2/logs/`. I grepped the non-existent path and got a meaningless zero.

✅ **F-A `B-MBIM-SWITCH-ON` CLOSED + deployed `afb7d326c`; GOVERNANCE_EXCEPTIONS row closed 08-26 at `1c9dcdf02`, alert `2080705d` resolved by hand.** ⚠️ **`gov-staleopen` is MINT-ONLY (`poller.mjs:282`) — it can be raised and can NEVER self-clear.** Repo has the rest; do not re-narrate.

**★ OBSERVATION EPOCH LIVE:** `module_constants` `scoreboard`/`epoch_started_at` = **`2026-08-22T22:01:00Z`** (the #507 fix line); paper anchor **UNTOUCHED at 824.11 v4**. The mechanism already existed and Kyle's own ruling shaped it — balance and score reset are DECOUPLED. ⚠️ **The epoch also resets the kill-switch numerator — surfaced to Kyle as his to ratify.** ⚠️ 3 governed docs still assert paper 2250.00/v3, and `portfolio_anchor_events` has **NO v4 row** (audit-trail hole). *Detail: `B_OBSERVATION_EPOCH_SCOPE.md`.*

**★ ROLLING WINDOWS CLAMPED + BOTH-LEG KEYED at `8088b49be`.** A trade counts only if **BOTH legs are ≥ epoch**; missing `openedAt` **fails closed**. ⚠️ **`tsconfig` EXCLUDES `**/*.test.ts` — tests are NOT type-checked.**

**PART F — KYLE'S RUN ORDER, 2026-08-26 (supersedes dependency order):** **1st** `B-EXIT-PROVENANCE` (in flight) · **2nd** `B-SCANNER-EGRESS-NORMALISE` (BTC+DOGE) · **3rd** F-G exit-on-the-transactable-side · **4th** F-5 reach · then F-C, F-D, F-E, F-F(reset). ✅ CLOSED: F-A MBIM · F-F(a) epoch · `B-EPOCH-KEYING-PARITY` · `B-PHANTOM-FILL-RECONSTRUCT`. ⚠️ **F-5 ships BUILD-ONLY — the reach FIT is gated on F-E's tier-A fills REGARDLESS of run order; #11 must NOT close as "reach calibrated".**

★★ **F-E SIZING — MEASURED, do not re-derive from feel: F-E NEEDS NO NEW TRADES.** It grades the **547 closed paper trades already in hand** (crypto 320 / xStock 227, 2026-07-15 on) against retained venue OHLC — a CLASSIFICATION job, not an accumulation wait. **The "30 per strategy" worry belongs to F-5's FIT, not to F-E.** At ~55% tier-A survival only **3-4 strategies** clear 30 clean fills; **since the epoch: 26 total** ⇒ an epoch-only fit is far off. **F-E does NOT gate F-5 shipping; it gates the FIT, which is deferred anyway.**

**★ DATA USABILITY — fill-integrity TIERS:** A provably clean **289/525** · B contaminated **109 exits + 18 taker entries** · C unassessable **127, ENRICHED for contamination not neutral**. ⛔ **BUT SELECTION DOES NOT TIER** — `signal-orchestrator:2160` reads the same cache ⇒ **every crypto trade since 2025-12-30 was SELECTED through a possibly-contaminated feed.** ⇒ **accounting: use the tiers. CALIBRATION/LEARNING: treat crypto as compromised as a whole.** xStock materially better.

**TWO EXPOSURES, NOT ONE:** VTS *learning* since **2025-12-30** (VTS reads `priceCache`; `updateFromWebSocket` writes the book mid into it); paper *money* since **2026-06-16** (depth-walked fills). The wipe block masked it until **2026-07-15**. **The book was NEVER SPECIFIED** — Directive 8.9.0 covers the TICKER channel only, and Kraken's truncation rule appears in **none of the 1,567 archived directives**.

✅ **`B-EPOCH-KEYING-PARITY` CLOSED `30808c6c0`.** ★★ **CARRY: a DECIDED rule shipped into ONE READER OF FOUR, and the 4 tests pinned the FUNCTION, not the PARITY — all passed while the card showed THREE answers.** Langston then holed that fence (**#900**): it asserts TS↔TS while `getLifetimeScoreboard` is a 2nd implementation IN SQL with NO test. ⚠️ Honest picture came out WORSE than the contaminated one (win 66.7→50.0%, PF 2.51→0.78). **OPEN, mine: #900** fence · **#901** epoch value resolves two ways · **#902** last unscoped readers · **#903** dashboard 401 that MASKED #902.

⛔ **STEP-7 MEANS THE *PAPER TRADING* PAGE, NOT THE DASHBOARD TAB (Kyle 2026-08-24)** — on the right page the defect was visible in ONE SCREENSHOT. ⚠️ **`/api/auth/login` allows 5 per 900 s** — repeated curl logins self-inflict a 429; get ONE token and reuse it. ⚠️ **Python `write_text` REWRITES EVERY LINE ENDING** (one edit = a 644-line diff for 12 real lines) — use `read_bytes`/`write_bytes` and check `git diff --cached --ignore-all-space --numstat` before committing.
## THE TWO LESSONS FROM `B-BOOK-TRUNCATE-HOTFIX` (#507, closed; repo has the mechanics)

⚠️ **ARMED — the trade-level leg is INSUFFICIENT and must be REPORTED as such.** Pre-registered PASS = **≥20 NEW crypto stop-type closes with 0 above entry** (vs a 70% base ⇒ p≈2×10⁻⁴). Cutline **2026-08-22 22:01Z**; baseline 14/20 above entry.
⛔ **THIS LINE ONCE ASSERTED "checksum mismatch ~100% is EXPECTED" — the stale-fact-in-an-always-loaded-file failure this file warns about. READ BOTH COUNTERS AT THE REF; never quote a stored figure.**

**⛔⛔ THE LESSON THAT COST KYLE'S TRUST.** I established a MECHANISM then attached THREE damage figures to it (**$187.78 · 111 rows · ~$111**), each from an instrument I never validated. **ALL THREE WITHDRAWN; Langston reproduced none.** Truth: **~$55 measurable / <$150 bounded, paper only.** ★ The control sat in the same table one `GROUP BY` away: **MAKER exits never read the book, so an honest instrument must be SILENT on them.** Every candidate fired near-equally on both arms; **only excursion MAGNITUDE discriminates (382.2 vs 58.6 bps).**
⇒ **A NEGATIVE CONTROL IS NOT A NICETY ADDED WHEN A NUMBER LOOKS ODD — IT IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT.** Applies to a POSITIVE result as hard as to a zero.
⚠️ **2026-08-26: the withdrawn $187.78 was STILL asserted as fact in `kraken-websocket-adapter.ts:811` and the b507 test docblock — I fixed one copy during the phantom-fill batch and left two. Both now POINT AT `CHANGES_AND_FIXES.md` instead of restating a revisable number.**

## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ #1 ACTION ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER.** It is ARMED (ALIAS **CC-C**, display **"ANALYST Claude"**, registered in `cc-wake-filter.py`) and fired continuously all session — but **compaction KILLS it.** Re-arm via the Monitor tool per shared MEMORY.md item 4.5 (`persistent: true`, NOT Bash run_in_background). Judge liveness by whether WAKE events have arrived; if none since a compaction, arm ONCE; doubled events ⇒ TaskStop one. Then sweep `/var/log/cc-discord-inbox.jsonl` for anything missed.

**★ KYLE LIFTED MY READ-ONLY FOR TWO BATCHES (2026-07-21 GO; recorded in the roster `write_scope` field — the lift is SCOPED, not general).** I IMPLEMENT them, full 11-step, Langston reviews diffs.

## RECENT HISTORY — CLOSED, one line each (repo completion reports are authoritative; do NOT re-narrate here)

- **07-27/28 Kyle scratch list** — Part A done; Parts B/C outstanding (`SCRATCH_CHECKLIST_2026-07-27_Kyle-CCC.md`).
- **07-28 B-COST-ACCOUNTING-HONESTY** — premise was FALSE; the obvious fix would have broken correct P&L. ⚠️ **`%` basis changed at the 07-28 11:57Z cutover — pre/post are different denominators.**
- **07-31 B-COST-MATH-CONSOLIDATION** — one shared `core/math/trade-pnl.ts`; **ended at the RISK ENVELOPE: Langston VOIDED his own P19-B6 approval** (#618).
- **07-31 B-KILLSWITCH-WINDOW** — numerator only; **denominator leg still open** (→ `B-READER-TRUTH` obj-6). Report written LATE 08-07 (checker caught it).
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

**★★ `wrong-object` — THE PATTERN THAT KEEPS COSTING ME (rule only; the cases are in the repo).** I filed #735, push-escalated it to Kyle, and **WITHDREW it the same day** — tested an identity against the wrong column. ⇒ **lifetime −$173.14 is CORRECT with no caveat; "+$187.14 clean era" is MEANINGLESS.** ★ **What caught it was the MANDATORY provenance read, NOT vigilance** — I had passed the data 3× attentively, and it was the THIRD instance in one session by the session that filed the previous one. **Knowing the pattern does not suppress it; only a measure-time gate does.** ⇒ **STANDING: before testing any identity, read what the column is DEFINED as. Before asserting absent callers, grep `this.<name>` and never exclude the defining file.**

**MY OPEN ISSUES (armed only — closed narration lives in the repo, per the leanness rule):** **#734 drawdown-anchor = a PHASE-21 GO-LIVE BLOCKER** — `active-portfolio-manager.ts:165` THROWS in LIVE (paper only logs); **TWO independent trips** (47.15%-vs-20% anchor mismatch, AND `MAX_OPEN_POSITIONS=10` hardcoded vs 15 slots) ⇒ **fixing either alone leaves live blocked** (B-DRAWDOWN-ANCHOR-COHERENCE, me, 09-04). · **#733** bridge/canonical 4-of-14 regenerated vs governance-says-frozen (B-CANONICAL-CORPUS-ACCURACY, me, 09-04) — ↔ **#402**, same generator, and it now BLOCKS `dt-deploy` (dirty-worktree refusal), which #402 predates. · #687 stale equity JSON · #688 B-DAILY-CUTOVER-SWEEP · #689 ohlcStoreFraction denominator · **#690 ✅ FIXED** — residual still open: **audit-FAILs have NO alert path** (a 03:00Z cron miss ≠ an RSI verdict; the manual audit route is the instrument). · **#692 ✅ root-caused — but CARRY THE MECHANISM: a DOWNWARD re-anchor leaves legacy-notional positions exceeding the new budget ⇒ ZERO opens until they close. Designed-breaker × designed-sizer. RECURS on EVERY downward re-anchor** (it froze opens 08-13→16). ⚠️ **Live now:** the 824.11 epoch is exactly that shape — 7 open positions at $719 against an $824 base.

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07 after a 4-second collision where my resolve freed the key his announced park had just blocked). Everything else in triage stays mine.
**★ SESSION-FIX 07-27 — ✅ DONE (detail: `CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md`).** Each session now has its OWN transcript folder (analyst = **4dfc = THIS session**) + a MEMORY-ONLY junction. ⚠️ Sessions still show "(fork)" — INTRINSIC + COSMETIC; do NOT re-root unless Kyle insists.
