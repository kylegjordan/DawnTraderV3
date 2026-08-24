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

## ★★★ CURRENT POSITION (2026-08-24) — READ FIRST

**★★ THE FINDING THAT REFRAMED EVERYTHING, and Kyle got it by REFUSING TO BELIEVE nobody had considered this: THE ALARM FOR THIS DEFECT WAS BUILT ON DAY ONE AND HAD NEVER RUN** — MBIM, Directive 8.9.5 `92e9c15fc` 2025-12-30, wired to a manual API route and never to boot. **Now switched on and clean (below).** *Full record: `B_MBIM_SWITCH_ON_SCOPE.md` + `PART_F_REORG_2026-08-23_r3.md`.* ⇒ **THE CARRY: use what already exists before proposing new code, and read the provenance BEFORE concluding a defect was never considered.**

**⇒ F-A `B-MBIM-SWITCH-ON` ✅ DEPLOYED `afb7d326c` 2026-08-24T10:21Z** (Langston APPROVED at `481bda9e3` + 3 conditions landed; CI run `32715866997` 4/4). **IT RUNS AND THE BOOK IS CLEAN:** 6 symbols, drift 0.000–0.028% vs the 0.2% line, 0 drifted. **Checksum now 18,758/18,758 MATCHES** (pre-deploy it could not match at all — no precision arg). ★ **LOG-ONLY** (Langston BLOCKER-3): the drift branch used to call `triggerSoftResubscribe` → `orderBooks.delete` → `getBookForFill` null → **FAIL-CLOSED #295 depth gate** = a silently blocked promotion. Method RETAINED + deliberately uncalled, rule-18 docblock, **homed on #507 (CC-B)**. ⚠️ **`crossedDetections` is NOT comparable across this deploy** — the checksum mismatch arm `continue`s ABOVE the crossed detector.

**★ OBSERVATION EPOCH LIVE:** `module_constants` `scoreboard`/`epoch_started_at` = **`2026-08-22T22:01:00Z`** (the #507 fix line); paper anchor **UNTOUCHED at 824.11 v4**. The mechanism already existed and Kyle's own ruling shaped it — balance and score reset are DECOUPLED. ⚠️ **The epoch also resets the kill-switch numerator — surfaced to Kyle as his to ratify.** ⚠️ 3 governed docs still assert paper 2250.00/v3, and `portfolio_anchor_events` has **NO v4 row** (audit-trail hole). *Detail: `B_OBSERVATION_EPOCH_SCOPE.md`.*

**★ ROLLING WINDOWS CLAMPED + BOTH-LEG KEYED at `8088b49be`.** `computeRollingEarnings` had NO epoch term while the lifetime scoreboard had one ⇒ a clean lifetime figure would have sat beside a 30d figure summing the whole tainted era. **A trade counts only if BOTH legs are ≥ epoch** — MEASURED: 11 closes since the fix but only **4** with both legs after it, and **3 of 7 open positions opened pre-fix**. Missing `openedAt` **fails closed**. 4 tests pin it. ⚠️ **`tsconfig` EXCLUDES `**/*.test.ts` — tests are NOT type-checked.**

**PART F SEQUENCE (Kyle-approved; VTS + paper only, live = Phase 21 unless free):** **F-A** MBIM switch-on ✅ · **F-B** provenance stamp, both legs BOTH PATHS · **F-C** staleness bound (`#743`) · **F-D** VTS accessor + isolation · **F-E** detector + disposition (tier the history) · **F-5** per-strategy reach, **moved AHEAD of the reset** · **F-F** reset. ⛔ **NOTHING IS DEPLOYED. Staging still runs `e6f7c70b3`.**

**★ THE DATA-USABILITY ANSWER (Kyle's question):** **fill integrity TIERS** — A provably clean **289/525** · B contaminated **109 exits + 18 taker entries** · C unassessable **127, ENRICHED for contamination not neutral** (no trades ⇒ no bar ⇒ quiet windows). **BUT SELECTION DOES NOT TIER** — `signal-orchestrator:2160` reads the same cache, so **every crypto trade since 2025-12-30 was SELECTED through a possibly-contaminated feed.** ⇒ **for accounting use the tiers; for CALIBRATION/LEARNING treat crypto as compromised as a whole.** xStock materially better (no book; VTS xStock reads the equities archiver directly).

**TWO EXPOSURES, NOT ONE:** VTS *learning* since **2025-12-30** (VTS reads `priceCache`; `updateFromWebSocket` writes the book mid into it); paper *money* since **2026-06-16** (depth-walked fills). The wipe block masked it until **2026-07-15**. **The book was NEVER SPECIFIED** — Directive 8.9.0 covers the TICKER channel only, and Kraken's truncation rule appears in **none of the 1,567 archived directives**.

**⚠️ IN FLIGHT — `B-EPOCH-KEYING-PARITY`, dispatched to Langston at `60e53fe36` (CI 4/4 run `32717798726`), NOT deployed.** ★★ **THE LESSON, and it is bigger than the batch: B-OBSERVATION-EPOCH DECIDED both-leg keying, argued it, and pinned it with FOUR TESTS — and shipped it into ONE READER OUT OF FOUR, because the predicate lived INLINE in `computeRollingEarnings`. The four tests tested the FUNCTION, NOT THE PARITY, so all four passed while the card showed THREE answers to one question.** MEASURED on the Paper Trading page 2026-08-24T10:26Z: Earnings **−$4.91/6** (both-leg) beside Lifetime **+$5.76/13** (close-keyed) beside win rate **66.7%/9** (unscoped) — **disagreeing in SIGN**. FIX = predicate EXTRACTED+exported (`isInObservationEpoch`/`clampWindowToEpoch`); epoch resolved ABOVE the analytics window filter (**it was read ~180 lines below — that placement WAS the root cause**); empty-window branch was passing `null` over the FULL 534-row set; `getLifetimeScoreboard` got the `opened_at` leg, GUARDED so OBJ-5 holds. Fence **MUTATION-PROVED** (revert ⇒ 4+2 FAIL; restored ⇒ 26/26). **Langston's open rulings:** VALID/INVALID usability split · v4 ledger gap vs F-F · the 3 stale governed docs · F-D disposition. **Reach p70=1.57R still BOUNCED under 29(a)** — re-measure after F-E.

⛔ **STEP-7 MEANS THE *PAPER TRADING* PAGE, NOT THE DASHBOARD TAB (Kyle, 2026-08-24).** I ran UI verification against the main Dashboard tab and reported it; he redirected me. **On the right page the defect was visible in ONE SCREENSHOT.** ⚠️ **AND I RATE-LIMITED THE STAGING LOGIN MYSELF** — `/api/auth/login` allows **5 per 900 s** and repeated `curl` logins burn it, returning 429. **Get ONE token and reuse it**; a 429 is my own doing, never a finding. ⚠️ **PYTHON `write_text` REWRITES EVERY LINE ENDING** — one `storage.ts` edit produced a **644-line diff for 12 real lines**. Use `read_bytes`/`write_bytes`, and check `git diff --cached --ignore-all-space --numstat` before committing.
## SUPERSEDED — kept only for the two BEHAVIOURAL lessons below

**`B-BOOK-TRUNCATE-HOTFIX` (#507) — CLOSED, deployed `e6f7c70b3` 2026-08-22T22:01Z. Declared OPEN in `GOVERNANCE_EXCEPTIONS` because trade-level verification is INSUFFICIENT, not failing.** Repo has the mechanics; do not re-narrate.

⚠️ **ARMED — trade-level leg is INSUFFICIENT and must be reported as such. Pre-registered PASS = ≥20 NEW crypto stop-type closes with 0 above entry** (0/20 vs a 70% base ⇒ p≈2×10⁻⁴). Cutline **2026-08-22 22:01Z**; baseline was 14/20 above entry.
⛔ **THIS LINE USED TO SAY "checksum mismatch ~100% is EXPECTED; the integrity signal is `crossedDetections` ONLY." NO LONGER TRUE — corrected 2026-08-24, and it is the exact stale-fact-in-an-always-loaded-file failure THIS FILE ITSELF WARNS ABOUT.** The v2 instrument precision feed HAS landed: measured post-deploy at `afb7d326c`, **checksum matches 18,758 / 18,758, mismatches 0.** A mismatch now means a REAL desync and the arm resubscribes. ⚠️ **AND `crossedDetections` IS NOT COMPARABLE ACROSS THAT DEPLOY** — the mismatch arm `continue`s ABOVE the crossed detector, so a resubscribing update never reaches it. **Read both counters at the ref; never quote a stored figure.**

**⛔⛔ THE LESSON THAT COST ME KYLE'S TRUST — CARRY THIS.** I established a MECHANISM and then attached THREE damage figures to it (**$187.78 · 111 rows · ~$111**), each from an instrument I never validated, revising down each time. **ALL THREE WITHDRAWN; Langston reproduced none.** Truth: **~$55 measurable / <$150 bounded, paper only.** ★ **The control was in the same table one `GROUP BY` away: MAKER exits never read the book, so any honest instrument must be SILENT on them.** Every candidate fires near-equally on both arms (42.05/30.38 · 45.63/41.30 · 35.59/32.50); **only excursion MAGNITUDE discriminates (382.2 vs 58.6 bps).**
⇒ **A NEGATIVE CONTROL IS NOT A NICETY ADDED WHEN A NUMBER LOOKS ODD — IT IS WHAT CONVERTS A NUMBER INTO A MEASUREMENT.** Rule 29(b) for zeros applies just as hard to a POSITIVE result.




## STANDING SESSION ITEMS (not dated state — the dated state is the block above)
**⚠️ #1 ACTION ON WAKE/COMPACT: RE-ARM THE WAKE WATCHER.** It is ARMED (ALIAS **CC-C**, display **"ANALYST Claude"**, registered in `cc-wake-filter.py`) and fired continuously all session — but **compaction KILLS it.** Re-arm via the Monitor tool per shared MEMORY.md item 4.5 (`persistent: true`, NOT Bash run_in_background). Judge liveness by whether WAKE events have arrived; if none since a compaction, arm ONCE; doubled events ⇒ TaskStop one. Then sweep `/var/log/cc-discord-inbox.jsonl` for anything missed.

**★ KYLE LIFTED MY READ-ONLY FOR TWO BATCHES (2026-07-21 GO; recorded in the roster `write_scope` field — the lift is SCOPED, not general).** I IMPLEMENT them, full 11-step, Langston reviews diffs.

## RECENT HISTORY — CLOSED, one line each (repo completion reports are authoritative; do NOT re-narrate here)

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

**★★ `wrong-object` — THE PATTERN THAT KEEPS COSTING ME (carry the RULE, the cases are in the repo).** I filed **#735** ("broken fee era"), push-escalated it to Kyle, and **WITHDREW it the same day**: I tested `gross_pnl − pnl` against `total_fee` when the value is DEFINED from `total_cost` (fees **+ slippage**, `schema.ts:1708/1710`). Correct column ⇒ **478/478 consistent**. ⇒ **lifetime −$173.14 is CORRECT with no caveat; "+$187.14 clean era" is MEANINGLESS — never use it.** ★ **What caught it was the MANDATORY provenance read, NOT vigilance** — I had passed the data 3× attentively, and it was the THIRD instance in one session, by the session that filed the previous one and wrote the warning above it. **Knowing the pattern does not suppress it; only a measure-time gate does.** ⇒ **STANDING: before testing any identity, read what the column is DEFINED as. Before asserting absent callers, grep `this.<name>` and never exclude the defining file.**

**MY OPEN ISSUES (armed only — closed narration lives in the repo, per the leanness rule):** **#734 drawdown-anchor = a PHASE-21 GO-LIVE BLOCKER** — `active-portfolio-manager.ts:165` THROWS in LIVE (paper only logs); **TWO independent trips** (47.15%-vs-20% anchor mismatch, AND `MAX_OPEN_POSITIONS=10` hardcoded vs 15 slots) ⇒ **fixing either alone leaves live blocked** (B-DRAWDOWN-ANCHOR-COHERENCE, me, 09-04). · **#733** bridge/canonical 4-of-14 regenerated vs governance-says-frozen (B-CANONICAL-CORPUS-ACCURACY, me, 09-04) — ↔ **#402**, same generator, and it now BLOCKS `dt-deploy` (dirty-worktree refusal), which #402 predates. · #687 stale equity JSON · #688 B-DAILY-CUTOVER-SWEEP · #689 ohlcStoreFraction denominator · **#690 ✅ FIXED** — residual still open: **audit-FAILs have NO alert path** (a 03:00Z cron miss ≠ an RSI verdict; the manual audit route is the instrument). · **#692 ✅ root-caused — but CARRY THE MECHANISM: a DOWNWARD re-anchor leaves legacy-notional positions exceeding the new budget ⇒ ZERO opens until they close. Designed-breaker × designed-sizer. RECURS on EVERY downward re-anchor** (it froze opens 08-13→16). ⚠️ **Live now:** the 824.11 epoch is exactly that shape — 7 open positions at $719 against an $824 base.

**GOVERNANCE OWED AT CLOSE (any batch):** SIM + SysManual CONTENT, and a completion report that states its KNOWN LIMITS rather than only its wins. This is a standing habit, not a per-batch to-do.

**THIS ARC'S DISCIPLINES (hard-won, keep):** read-back after EVERY write · distinct updated_by ALWAYS (storage.ts coalesce trap) · §3/§9A/§9 same-action edits per flip · measured-never-forecast to Kyle (the struck-60% lesson) · instrument reach before reading silence (pm2-logs-empty; out.log rotates midnight; head-truncation manufactures zeros) · wrong-object reads: migration-seeds vs live DB, alert-body vs gauge, my-own-pre-audit-line vs my-own-code.

- **⚠️ OPERATIVE RULE, NOT IN THE REPO — `Exit checks skipped` alerts (changed 2026-08-01, Langston):** treat as the recurring deep-evening mark-staleness class; **check exposure vs stop BEFORE dispositioning**, and **`price-skip-paper-*` rows are CC-B's EXCLUSIVELY** (lane partition settled 08-07 after a 4-second collision where my resolve freed the key his announced park had just blocked). Everything else in triage stays mine.
**★ SESSION-FIX 07-27 — ✅ DONE (detail: `CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md`).** Each session now has its OWN transcript folder (analyst = **4dfc = THIS session**) + a MEMORY-ONLY junction. ⚠️ Sessions still show "(fork)" — INTRINSIC + COSMETIC; do NOT re-root unless Kyle insists.
