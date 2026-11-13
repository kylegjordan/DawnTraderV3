# PM slot check — CC-C

- ref: origin/migration/aws-supabase
- ref-sha: eef103563f46bd010da7eb846c6c45eee0e9832e
- origin-head: eef103563f46bd010da7eb846c6c45eee0e9832e
- freshness: FRESH
- owner: CC-C
- item: Collect the read-only weekend xStock capacity evidence for NEW-owned B-XSTOCK-WEEKEND-POSTURE after Friday close: count xStock/crypto/unused slots, capacity-specific crypto refusals, hold durations, and comparable prior weekends; hand evidence to NEW without owning policy or implementation.
- generated: 2026-11-13T07:55:33.865Z

## 1. Open plan rows (plan order)

- section 4 row 1t (line 238) [queued] B-RTB-STALE-LEVELS (`#1168`) — ~~FOLDED 2026-10-07 into row 59 B-ENTRY-LEVEL-RECHECK (the same gap, placed by Langston 2026-09-18) — `#1168` am. 2~~ A queued signal must not open after the p… — status: QUEUED
- section 4 row 2 (line 239) [in_progress] B-XSTOCK-BID-TRIGGER-RELAND — B-XSTOCK-BID-TRIGGER-RELAND — ONE BATCH (Kyle 2026-10-09): xStock trades open and close only where a real trade could — status: ⏳ **OPEN — status 2026-11-05: (4b) Step 7 PASS (19/19 paper xStock exits on the…
- section 4 row 3b (line 258) [queued] B-VTS-BOOKING-REFUSAL-VISIBILITY — Make the VTS entry-booking refusals visible: the five reasons a VTS entry or twin is refused at booking (a resting maker already marketable, no usable ask, an … — status: QUEUED
- section 4 row 4b (line 263) [queued] B-VTS-REST-DEADLINE (`#1073`; was the valve's increment 2, … — Measure whether a paper maker rest can fill after its deadline while a price is refused: persist placement time and deadline beside the fill, then measure the … — status: QUEUED
- section 4 row 4c (line 264) [queued] B-SHADOW-HOLD-CLOCK (`#1144`) — Decide whether the VTS shadow lane's 48 h hold should pause while xStock is shut: on wall-clock time a Friday-afternoon open gets about 3 h of market exposure … — status: QUEUED
- section 4 row 8 (line 268) [queued] — batch named at Step 1 — Define 'comfortable in paper' in numbers — status: QUEUED
- section 4 row 8a (line 269) [queued] B-OPEN-REFUSAL-DURABLE-ROW (`#1083`) — An open refused at the fill stage leaves a durable record — status: QUEUED
- section 4 row 8b (line 270) [queued] B-STALE-BOOK-DEPTH-REFUSAL (`#1085`) — Depth-gate refusals that come from our own stale book cache, not the venue — status: QUEUED
- section 4 row 9b (line 273) [queued] B-SETTINGS-REAL-TYPE (`#1106`) — Give the settings builder its real type — 24 fields code reads are never set — status: QUEUED
- section 4 row 9b1 (line 274) [queued] B-SIZING-FENCE-WALK-WIDEN (`#1182`) — Widen the sizing deletion fence's file walk so every block sees `shared/`, `types/`, `scripts/` and `.js`/`.mjs`, not only the two blocks where the gap was fou… — status: QUEUED
- section 4 row 9c (line 275) [queued] B-LIVE-READERS-CLOSED-TRADES (`#1108`, was `#668`) — Point live mode's balance, daily-loss and open-position reads at the table live writes — status: QUEUED
- section 4 row 9d (line 276) [queued] B-STRATEGY-SETTINGS-KNOBS (`#1109`) — Remove the per-strategy max-concurrent setting that nothing enforces — status: QUEUED
- section 4 row 9e (line 277) [queued] B-CLAMP-ESTIMAND-RESPEC (`#1110`) — Decide what Phase 25's ranker switch should measure — the old clamp number measured one scaling factor — status: QUEUED
- section 4 row 9g (line 279) [queued] B-M5D-HARNESS-CENSUS (`#1112`) — Audit the M5D test harness the same way the M5E one was audited — status: QUEUED
- section 4 row 9h (line 280) [queued] B-OPEN-POSITION-INDEX-TRUTH (`#1113`) — Make the code, the schema and the database agree on which unique index guards open positions — status: QUEUED
- section 4 row 10 (line 283) [queued] #628 — batch named at Step 1 — #628 — status: QUEUED
- section 4 row 14a (line 288) [queued] B-KRAKEN-PRIMARY-KEY-RESOLUTION (`#1076`, `#1146`) — Make every price-cache key the Kraken primary key (two remaining gaps, and a header naming a gate that no longer exists) — status: QUEUED — narrowed 2026-11-06: B-PRICE-FEED-TRUTH I2 (live 2026-10-10) delivered…
- section 4 row 14b (line 289) [queued] B-ONE-SYMBOL-TRANSLATOR (`#1176`) — One table of Kraken asset codes: today three separate tables translate Kraken's names (the shared canonicaliser, the symbol resolver, the pair-list service), a… — status: QUEUED
- section 4 row 17 (line 293) [in_progress] B-PRICE-SIDE-BY-JOB — B-PRICE-SIDE-BY-JOB — status: IN FLIGHT — per piece (status stated 2026-11-06): `8a-P4c` incs 2-3 = row 3 `B-…
- section 4 row 31 (line 312) [queued] B-XSTOCK-LIVE-FEED — B-XSTOCK-LIVE-FEED — status: QUEUED
- section 4 row 34 (line 315) [queued] B-EQUITY-RECONNECT-STALL-TIMER — B-EQUITY-RECONNECT-STALL-TIMER — status: QUEUED
- section 4 row 36 (line 318) [queued] #506 — batch named at Step 1 — #506 — status: QUEUED
- section 4 row 37 (line 319) [queued] B-BOOK-SUBSCRIPTION-REACH — B-BOOK-SUBSCRIPTION-REACH — status: QUEUED
- section 4 row 38 (line 320) [queued] B-CRYPTO-MARK-AGE-GATE — B-CRYPTO-MARK-AGE-GATE — status: QUEUED — PRE-SPRINT stage 2, after row 2 (Kyle 2026-10-10)
- section 4 row 39 (line 321) [queued] #977 — batch named at Step 1 — #977 — status: QUEUED
- section 4 row 42 (line 324) [queued] B-DECIDED-INTENT-INDEX — B-DECIDED-INTENT-INDEX — status: QUEUED
- section 4 row 43 (line 325) [queued] B-POST-GRID-MUTATION-CENSUS — B-POST-GRID-MUTATION-CENSUS — status: QUEUED
- section 4 row 44 (line 326) [queued] plan row 7 — The VTS reads prices through the shared accessor — status: QUEUED
- section 4 row 45 (line 327) [queued] #1033 — batch named at Step 1 — #1033 — status: QUEUED
- section 4 row 48 (line 330) [queued] — batch named at Step 1 — Independent review of the pricing architecture (Codex) — status: QUEUED
- section 4 row 53 (line 346) [queued] B-TARGET-FABRICATION — B-TARGET-FABRICATION — status: QUEUED
- section 4 row 60 (line 367) [queued] B-INTENT-ENTRY-PARITY — B-INTENT-ENTRY-PARITY — status: QUEUED
- section 4 row 61 (line 368) [queued] B-GRID-LIVE-PATH-PARITY — B-GRID-LIVE-PATH-PARITY — status: QUEUED
- section 4 row 62 (line 369) [queued] — batch named at Step 1 — A resting order's deadline must run whether or not a price is usable — status: QUEUED
- section 4 row 63 (line 370) [queued] #630 — batch named at Step 1 — #630 — status: QUEUED
- section 4 row 65 (line 371) [queued] B-EXIT-TICKER-LEG-ADAPTER-SIDES — B-EXIT-TICKER-LEG-ADAPTER-SIDES — status: QUEUED
- section 4 row 67 (line 372) [queued] #204 — batch named at Step 1 — #204 — status: QUEUED
- section 4 row 68 (line 373) [queued] plan row 3h.b — Remove the second exit implementation — status: QUEUED
- section 4 row 69 (line 374) [queued] B-EXIT-LATCH-INVESTIGATION — B-EXIT-LATCH-INVESTIGATION — status: QUEUED
- section 4 row 70 (line 375) [queued] — batch named at Step 1 — Map EXIT_PATH_MACHINERY_AUDIT §10 items to their homes — status: QUEUED
- section 4 row 86 (line 394) [queued] plan row 8 — Fill-integrity detector — status: QUEUED
- section 4 row 87a (line 396) [queued] B-BALANCE-CORRECTNESS-PROOF (`#614`) — Prove the balance itself is right against the anchor events, first checking whether B-BALANCE-TRUTH (`#618`) already covered it — status: QUEUED
- section 4 row 89 (line 398) [queued] B-IMPLEMENTATION-SHORTFALL — B-IMPLEMENTATION-SHORTFALL — status: QUEUED
- section 4 row 90 (line 399) [queued] B-GRID-REFUSAL-RATE — B-GRID-REFUSAL-RATE — status: QUEUED
- section 4 row 111 (line 428) [queued] #513 — batch named at Step 1 — #513 — status: QUEUED
- section 4 row 112 (line 429) [queued] B-DECISION-INSTANT-QUOTE — B-DECISION-INSTANT-QUOTE — status: QUEUED
- section 4 row 113 (line 430) [queued] B-EXIT-DECISION-RUNG-STAMP — B-EXIT-DECISION-RUNG-STAMP — status: QUEUED
- section 4 row 118 (line 435) [queued] #1072 — batch named at Step 1 — #1072 — status: QUEUED
- section 4 row 124a (line 442) [queued] B-AMR-INPUT-INTEGRITY-ARC (`#600`, `#604` leg A, `#608`, `#… — Correct what the AMR observes, so it learns correctly while it stays watch-only — status: QUEUED
- section 4 row 124b (line 443) [queued] P19-B-DROUGHT-2 (`PHASE_19_PLAN.md:23`; roadmap `25-5`) — Fix the learning-data defects found in the 2026-08 drought work, and run the observational decision gate's seven untriggered items — status: QUEUED
- section 4 row 124c (line 444) [queued] B-NEWS-ALTDATA-LAYER (`STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`… — Capture news and on-chain inputs per decision, so a news score can later be tested as a ranking input — status: QUEUED
- section 4 row 135b (line 464) [queued] B-CONCENTRATION-SCORE-UNITS — Rebuild the correlation-concentration score so it measures what it claims — status: QUEUED
- section 4 row 148c (line 484) [queued] `#399` (b) — Size by fractional Kelly on the calibrated pWin — status: QUEUED
- section 4 row 154a (line 492) [queued] B-MAKER-PFILL-CALIBRATION (`#738`) — Maker fill probability: replace the 0.50 assumption with the measured rate — status: QUEUED
- section 4 row 156 (line 499) [queued] roadmap 19-11 — batch named at Step 1 — 19-11 §19.1 Paper Trading Run The act of actually running paper-ac — status: QUEUED
- section 4 row 166 (line 523) [queued] #692 — batch named at Step 1 — #692 — status: QUEUED
- section 4 row 176 (line 535) [queued] #296 — batch named at Step 1 — #296 — status: QUEUED
- section 4 row 183a (line 549) [queued] B-MAKER-CANCEL-ON-DROP (`#1103`) — Cancel the venue order when an unfilled maker is dropped — status: QUEUED
- section 4 row 183b (line 550) [queued] B-LOSS-WINDOW-OPERATOR-CLOSES (`#1154`) — Keep operator closes (the paper reset's 'reset') out of the kill switch's daily loss count by their label, not only by the session start — status: QUEUED
- section 4 row 183b1 (line 551) [queued] B-KILLSWITCH-REANCHOR-WINDOW (`#1171`) — The kill switch's loss window must notice a balance re-anchor that comes with no closes: the paper safety-net re-anchor (`reanchorToLive('paper','auto_divergen… — status: QUEUED
- section 4 row 183b2 (line 552) [queued] B-CLOSE-REASON-TYPED-WRITER (`#1172`) — A trade's close reason is free text a caller can set (`routes.ts:12660`, from the request body) while trade analytics read it as a fixed label (`routes.ts:1301… — status: QUEUED
- section 4 row 183b3 (line 553) [queued] B-RESET-POSITIONS-MODE-FENCE (`#1174`) — The reset routine deletes every open-position row in both modes, because the open-positions table records no mode; decide whether it needs one before live mode… — status: QUEUED
- section 4 row 183c (line 554) [queued] B-SIZING-SLIP-DETECTOR (`#1155`) — Notice a mistyped max position % (e.g. 0.5 for 5) in paper and live — nothing does since the size alert was removed — status: QUEUED
- section 4 row 189a (line 561) [queued] B-XSTOCK-BOOK-LADDER (`#949`, decision D3 of `PRICING_DECIS… — Subscribe the xStock 20-level order book when our trade size outgrows top-of-book — status: QUEUED — TRIGGER, not a date
- section 4 row 192 (line 564) [queued] B-KRAKEN-FEE-WATCH — B-KRAKEN-FEE-WATCH — status: QUEUED
- section 4 row 194 (line 571) [queued] — batch named at Step 1 — Confirm the live fee schedule — status: QUEUED
- section 4 row 196 (line 573) [queued] roadmap 21-3b — batch named at Step 1 — 21-3b (NEW, P19-B6.9 2026-06-30 — RUNNING_ISSUES #398/#396): calib — status: QUEUED

## 2. Pre-sprint rows

- stage 00 — data truth first (Kyle 2026-11-04, KD-2) order 2 (line 18) B-XSTOCK-BAR-AVAILABILITY — status: IN FLIGHT — Step 9 — waiting on: CC-C (read 2026-11-04: the window FAILED its handoff rule —…
- stage 0 — reset safety order 1 (line 25) B-LOSS-WINDOW-OPERATOR-CLOSES — plan row 183b — status: row — waiting on: nothing
- stage 1 — feed truth under the exits order 2 (line 28) B-KRAKEN-PRIMARY-KEY-RESOLUTION — plan row 14a — status: row — waiting on: nothing
- stage 2 — exit, in order order 1 (line 41) P-8e split (the extrapolated-fill field) — status: QUEUED (lands with or before row 2's ve… — waiting on: nothing
- stage 2 — exit, in order order 2 (line 42) B-XSTOCK-BID-TRIGGER-RELAND — plan row 2 — status: row — waiting on: CC-C ((4b) deployed 2026-11-04 12:13Z — Step 7 PASS, Step 8…
- stage 2 — exit, in order order 3 (line 43) B-SPREAD-BLOWN-RELEASE-MOVEMENT — status: QUEUED — waiting on: nothing (objective 6's observation read is recorded on row …
- stage 2 — exit, in order order 4 (line 44) B-CRYPTO-MARK-AGE-GATE — plan row 38 — status: row — waiting on: nothing
- stage 2 — exit, in order order 5 (line 45) B-EXIT-TICKER-LEG-ADAPTER-SIDES — plan row 65 — status: row — waiting on: nothing
- stage 2 — exit, in order order 6 (line 46) B-STALE-BOOK-DEPTH-REFUSAL — plan row 8b — status: row — waiting on: nothing
- stage 2 — exit, in order order 7 (line 47) B-EXIT-DECISION-RUNG-STAMP — plan row 113 — status: row — waiting on: nothing
- stage 2 — exit, in order order 9 (line 49) [C3] with row 62 — plan row 62 — status: row — waiting on: nothing
- stage 3 — feed order 7 (line 55) B-CRON-MISSED-CATCHUP — status: IN FLIGHT — Step 10 COMPLETE; deployed … — waiting on: nothing
- stage 4 — paper truth order 1 (line 56) B-OPEN-REFUSAL-DURABLE-ROW — plan row 8a — status: row — waiting on: nothing
- stage 0 — clear the plates (CC-C) order 3 (line 72) B-PRICE-SIDE-BY-JOB — plan row 17 — status: row — waiting on: nothing
- stage 0 — clear the plates (CC-C) order 5 (line 74) B-VTS-REST-DEADLINE (was the valve's increment 2) — plan row 4b — status: row — waiting on: nothing

## 3. Task list

task-list: UNPARSEABLE (| plan row | batch | where it stands (2026-09-30) |)

First table, verbatim:

| plan row | batch | where it stands (2026-09-30) |
|---|---|---|
| 13 | `B-OHLC-FRAME-GUARD` (`#1028`) | ✅ CLOSED 2026-11-06 — Step 11 CONFIRMED by Langston (`Batch Completion/B_OHLC_FRAME_GUARD_COMPLETION_REPORT.md`) |
| 16 | `F-G-1` reopened (`#1031`) = `B-OHLC-WRITE-ORDER` | ✅ CLOSED 2026-11-06 — `Batch Completion/F_G_1_COMPLETION_REPORT.md` |
| 17 · 3 · 2 | `B-PRICE-SIDE-BY-JOB` | `8a-P4c` incs 2-3 (row 3) CLOSED 2026-11-06 (Step 11 confirmed by Langston); `8c` at Step 2 (hold lifted 09-28, re-read the plan at the ref before Step 3); `8d` CLOSED 2026-11-07 (absorbed by `8a-P3`, Langston); KD-19 (b)/(c) at Step 2 with Langston (`B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md`; Step 1 scope addendum, D-1 ruled by Coltrane); the xStock half is row 2 |
| 14 · 15 | `B-REST-SIDES-TO-CACHE`, `B-BOOK-STATE-RESTART-DURABLE` | Row 14: ✅ CLOSED 2026-11-06 — Step 11 CONFIRMED by Langston (`Batch Completion/B_REST_SIDES_TO_CACHE_COMPLETION_REPORT.md`). Row 15: ✅ CLOSED 2026-11-06 (Step 11 confirmed by Langston) |
| 9 | `B-SIZING-DEC-RESTORE` | ✅ CLOSED 2026-10-09 (Step 11 CONFIRMED by Langston 2026-10-09 07:42Z) |
| 40 | `B-XSTOCK-SESSION-FRESHNESS` | ➕ KD-48 (2026-11-06): the weekly xStock opportunity-loss watch is an item of this batch, CC-A building it (spec §20 of the registration). P1b `B-ENTRY-CONSUMPTION-FRESHNESS` ✅ CLOSED 2026-10-15: deployed `3a2cd4ee5`, Coltrane Step 11 confirmed at `c3c8d7ce1`. Umbrella residual alert/exit/dedupe work remains separately placed. |
| P1c | `B-CLASS-LEG-FILL-MODE` (`#1170` + `[C3]`) | ✅ CLOSED 2026-10-15; final runtime `30af855f2`, Coltrane Step-11 confirmed at `c8c185e63`, CI `38778491511` four of four; no observation or deployment hold. (`B-PRICE-FEED-TRUTH` closed 2026-11-06.) |
| — | `F-G-2` | ✅ closed as absorbed into `B-PRICE-SIDE-BY-JOB` (2026-09-28, `0ccad12f5`) |
| Stage 1 | `B-PRICE-FEED-TRUTH` (`#1047`, `#1076`, `#1146`, `#1173`) | ✅ CLOSED 2026-11-06 at Step 10 (I2 + I3 live 2026-10-10, Coltrane-approved 2026-10-15; I1 shipped as `B-PRICE-STALENESS-BOUND`, I4 moved to row 31) — `Batch Completion/B_PRICE_FEED_TRUTH_COMPLETION_REPORT.md`; Step 11 APPROVED by Langston 2026-11-06 |
| Stage 00 order 6 | `B-BALANCE-SESSION-PAIRING` (`#618` sizing/exposure leg) | ✅ CLOSED 2026-11-10 — deployed `e0e68dfdb`; Coltrane CONFIRMED Step 8 at exact corrected ref `368b60401` and Step 11 at exact ref `391ba05d5`; CI `42874563623` four of four. §4a closed PARTIAL; four named `#618` follow-ups plus the corrected proof method remain placed under row 87a. |
| Plan row 87a | `B-BALANCE-CORRECTNESS-PROOF` (`#614`, `#618`, `#620`) | QUEUED — now explicitly owns the four residual `#618` items: automatic-anchor semantics under KD-34, audit-cast removal, canonical retention-key resolution, and a persistent money-held refusal page; its proof must also distinguish candidates eligible to reach the balance guardrail from upstream capacity blocks. |

## 4. Decisions binding the owner and not DONE (newest first; last 48 h flagged)

- KD-73 (2026-11-12) [LAST 48 H] status RELAYED [also: PM Codex] — **Preserve KD-57, O3, the active strong_bull_trend xStock observation and every live setting. Add `R-SBT-XSTOCK-PUBLISHED-BASELINE` as a named prerequisite to sprint row 129 / roadmap 25-17 and as a …
- KD-71 (2026-11-10) status IN WORK [also: PM Codex] — **Keep the Codex crew working until the weekly account meter reaches 92% used, then stop all Codex-side allowance consumers at safe boundaries and keep them stopped through the weekly reset. PM Codex…
- KD-64 (2026-11-09) status DECIDED — **The whole building crew switches to ChatGPT (Codex) now, not after PM Codex is built, because the Claude crew is stopped until the 11-12 23:00Z reset. OLD Codex builds PM Codex first and coordinate…
- KD-48 (2026-11-06) status ACKED (CC-A ~11:1xZ, CC-C ~11… — **#441, Kyle's July xStock capture-rate condition: option A.** The weekly xStock opportunity-loss watch is built as an item of ANALYST's `B-XSTOCK-SESSION-FRESHNESS` (row 3b.f-c), CC-A building it, C…
- KD-43 (2026-11-05) status IN PROGRESS — **Every batch closes with proper and complete governance. PM Claude checks each completion report's governance-files-changed list against the batch's class doc set (`workflow-10-governance`) before c…
- KD-36 (2026-11-05) status DECIDED — **Trailing exits and break-even exits stay OFF in paper mode and the VTS until after live mode is running normally; work on them waits until then.** The dormant VTS-to-paper trailing write (`PRICING_…
- KD-34 (2026-11-05) status DECIDED — **Technical decisions are made by the owning session + Langston + Coltrane to consensus, on a full provenance pack PM Claude assembles (original intent back to the pre-governance records, what is bui…
- KD-19 (2026-11-04) status ACKED — VTS exit pricing matches paper: (a) finish VTS xStock exits on the real sell side instead of the midpoint; (b) book VTS exits with the same order-book walk paper uses, not the single best price; (c) …
- KD-18 (2026-11-04) status ACKED — `#914` keeps its slot; first confirm what the VTS now books at exit (exit-pricing work), so the cost study measures real slippage instead of assuming it.
- KD-8 (2026-11-04) status ACKED — The fix for the paper balance snapping back to $820 at each restart (`B-BALANCE-SESSION-PAIRING`) moves up to straight after the five front fixes.
- KD-4 (2026-11-04) status IN PLAN — **Kyle works through PM Claude; PM Claude relays decisions, records them here and makes sure they are implemented where and when agreed.**
- KD-2 (2026-11-04) status ACKED — **Five data-truth fixes lead the pre-sprint table, in order:** (1) finish the crypto price-feed watchdog; (2) finish the xStock bar check; (3) new batch, guard the shared database connections, owner …

## 5. Plan vs task list disagreements

NOT COMPARABLE: the task list is UNPARSEABLE, so nothing was compared (this is not an agreement).

## 6. Candidate placement analysis

### Immediately after Friday close

1. **Open xStock trades / faulty closes:** No implementation slot is requested; analysis is read-only and handed to NEW. The work could still compete for CC-C attention with the in-progress B-XSTOCK-BID-TRIGGER-RELAND and B-PRICE-SIDE-BY-JOB; protect those active exit responsibilities first if evidence collection would delay them.
2. **Calibration data and KD-2 data truth:** Do not displace the in-flight B-XSTOCK-BAR-AVAILABILITY handoff (KD-2 order 2). Evidence collection should use the weekend close window and report any conflict rather than consume the bar-check slot.
3. **Everything else:** This placement would put queued B-VTS-REST-DEADLINE, B-SHADOW-HOLD-CLOCK, and other CC-C investigations behind a bounded evidence handoff to NEW. Keep evidence gathering bounded to capacity/refusal/hold-duration/prior-weekend facts; no policy or implementation.

### Keep current queue only

1. **Open xStock trades / faulty closes:** Preserves CC-C attention for B-XSTOCK-BID-TRIGGER-RELAND and B-PRICE-SIDE-BY-JOB, both already in progress; this is the safest choice if the evidence task interferes with either.
2. **Calibration data and KD-2 data truth:** Preserves the B-XSTOCK-BAR-AVAILABILITY handoff currently waiting on CC-C; delaying or interrupting that work carries the strongest data-truth cost.
3. **Everything else:** No new handoff would move ahead of queued VTS work or other CC-C investigations; NEW would lack the requested weekend capacity evidence for B-XSTOCK-WEEKEND-POSTURE.

Placement judgment: prefer immediately after Friday close only as a bounded read-only handoff that does not interrupt active exit work or the KD-2 bar-availability handoff; otherwise keep the current queue until those protected items reach a safe boundary.
