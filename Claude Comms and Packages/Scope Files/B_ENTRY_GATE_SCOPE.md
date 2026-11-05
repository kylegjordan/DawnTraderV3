# B-ENTRY-GATE — SCOPE r2 (`#1224`)

change-class: architecture

**Owner:** CC-B (NEW Claude) · **Placed:** CC-B pre-sprint list item 2 (Kyle, locked 2026-10-20, `e400fed12`). Under Kyle's D-2 (2026-11-04) it runs after stage 00's `B-XSTOCK-DBS-TO-STRATEGIES` (`#1235`). · **Design record:** `Claude Comms and Packages/Langston Design Asks/B_ENTRY_GATE_DESIGN_r1.md` · **Written:** r1 2026-10-20; **r2 2026-11-05**

> **r2 (2026-11-05): what changed since r1, and why.**
> **(i) Kyle's two decisions of 2026-11-04** (`1-system-manual/pm/DECISIONS.md`, recorded on `#1224`):
> - **KD-10:** the 25 % window applies to the WORSE side only, plus a cheaper-side floor of about 40 % of the planned room to the stop, watch-only first.
> - **KD-11:** the economic test is Langston's Reply A. A trade must clear net EV after the ACTUAL fees, with no assumed win rate when data is missing. A minimum ratio of profit to trading cost is watch-only until it is measured.
>
> **(ii) Langston's Step-1 CHANGES on r1** (2026-10-21T00:08Z, Discord):
> - (a) the birth-side effect is measured in shadow before the SQE gate goes live;
> - (b) `missed_refreshes` provenance, the `last_priced_at` upsert decision, and the promotion ceiling;
> - the exploration-lane reader;
> - (c) Step 7 pre-registers magnitudes, not zeros;
> - (d) increments re-ordered: fill first;
> - the 59a window collision;
> - `ENTRY_PREMIUM_BPS`;
> - full repo-relative paths.
>
> **(iii) The stale-plan time limit folds in** (Kyle via OLD Claude, 2026-11-04: "the stale-plan time limit folds in"). This was Langston's proposed `B-RTB-PLAN-AGE-BOUND`.
>
> **(iv) Superseded r1 text is kept in §8 (struck),** so the review trail is readable.

## 0. What this batch is for
Kyle, 2026-10-20: enter only near the price the plan was built on, and only when the trade is still worth taking at the price actually paid. Today nothing compares the live price with the plan, except the refusals at or through the stop or target:
- `refuseTakerBooking` (`server/core/trading/entry-booking.ts`), live since `B-ENTRY-DISTANCE-GUARD`;
- `decideRetirement` (`server/services/rtb-retirement-decision.ts` family), live since `B-RTB-REFRESH-LIVE-PRICE`.

The reward-to-risk at the fill and the distance from the planned entry exist only as a shadow (`entryFillShadow`, `server/core/trading/entry-booking.ts:55-63`).

## 1. What is there (census at `9b0e830fd`; re-read line by line at Step 2 at the then-current ref)
Full repo-relative paths (Langston r1). **Re-read at Step 2:** the census came from a read-only helper agent.
- **The SQE cannot see a plan or a price.** `SQEInput` (`server/core/sqe/signal_quality_evaluator.ts:100-129`) has `entryPrice?` and `targetPrice?` but no stop and no live price. Neither production caller sets the entry, target or regime: birth (`server/services/signal-orchestrator.ts:1166`) and refresh (`server/core/rtb/ready_to_buy_service.ts:1093`). So the ROI sub-gate (`:376`) never runs.
- **Birth order** (`buildSizedSignalForStrategy`, `server/services/signal-orchestrator.ts:552-2011`): the SQE at `:1166`, the RTB write at `:1506`, the reward-to-risk / target-reach gate at `:1926-1949`. The write precedes the gate. ⚠️ **A structural fact, not a defect claim:** `#1051`'s claim was withdrawn on 2026-09-12. Moving the gate is Kyle's decision 8, a tidy-up.
- **Refresh** (`refreshAndRank`, `server/core/rtb/ready_to_buy_service.ts:820`, once per signal per 120 s, `server/services/rtb-refresh-service.ts:182-184`):
  - net EV and the maker/taker choice are recomputed only when the geometry throttle fires (`:689`), and then on the STORED plan prices (`:691-693`);
  - otherwise the stored `chosen_net_ev` is fed in (`:1086-1087`);
  - the fresh ask is read once per pass (`server/services/rtb-refresh-service.ts:500-504`) and used only for retirement (`:1028-1054`).
- **"Reconfirmed" is written whether or not the pass saw a price** (`:1124`); nothing reads `last_refreshed_at`.
- **Promotion checks no freshness** (`getRankedSignals`, `:1803`; `checkRtbPromotion`, `server/services/active-execution-engine.ts:5202`).
- **The fill** (`executeSimulatedTrade`, `server/services/active-execution-engine.ts:5506`): a maker books at its limit (`:6045-6048`); a taker walks the book, then `entryFillShadow` (`:6118`, shadow) and `refuseTakerBooking` (`:6135`, live).
- **A resting maker is never checked against the plan** (`_processPendingMaker`, `:1809`; `evaluatePendingMaker`, `server/core/trading/pending-maker-logic.ts:48`).
- **The three 2 % target fallbacks:** `server/core/rtb/ready_to_buy_service.ts:1778` (rank key), `:1933` (shadow pool), `server/services/active-execution-engine.ts:5418` (open). They are unreachable from live births (`RULED ON REPORTED FACT` by Langston: 0 of 58 live rows null).
- **Dead logs:** `logRtbTrace` (`:1350`) and `logSqeRejection` (`:1382`) call `require` in an ESM bundle, inside an empty `catch`. INFERRED to throw and write nothing.
- **★ A THIRD reader of the SQE failure strings (Langston r1, missed by r1's census):** the exploration lane.
  - `server/services/signal-orchestrator.ts:1186-1192` runs it on `!sqeResult.passed && mode === 'paper'`, and `server/services/exploration-lane.ts:209-211` admits only `failures.length === 1 && failures[0].startsWith('NetEV ')`.
  - The canonical gate-id lists are `server/core/observability/active-funnel-tracker.ts` and `shared/sqe-gate-classifier.ts:16-28`, fence-pinned equal.
- **No entry-distance constant exists.** ⚠️ `ENTRY_PREMIUM_BPS: 10` (`server/strategies/strategy-helpers.ts:24`) has no reader in `server/` (Langston's scoped grep: "looks dead", not proven). See §2.
- **`missed_refreshes`** (`shared/schema.ts:2149`, documented as *failed refresh attempts* in `docs/schema_reference_v1_5_1.md:51`) is recorded as dead BY DESIGN per directive 8.8.4-A3.R8 (`DISCORD_FINDINGS_RUNNING_LIST_2026-07-20.md:43`). Its original semantic was a threshold-driven action (`[8.8.4-A3.R2][SQE][WARN] missedRefreshes=…/${MISSED_REFRESH_THRESHOLD}`). See §2.
- **Plan age:** plans up to 21.8 h old in the queue (Langston 2026-10-20); no TTL since R9.3-C.

## 2. Provenance (Tier 1 for behaviour this batch changes)
| component | origin | intent | disposition |
|---|---|---|---|
| `entryFillShadow` | `c285745e9` (B-ENTRY-DISTANCE-GUARD Step 3, 2026-10-11) | measure RR at the fill and `adverseR`, in shadow, until the floors were understood (`#1183`) | **(2)** relevant, update: its `adverseR` becomes the live WORSE-side check at the fill (KD-10). ⚠️ The probe that row 59a's window reads is NOT re-pointed before 2026-11-07T13:03:42Z (§5). |
| `refuseTakerBooking` | same | refuse a fill at or through stop/target | **(1)** kept; the window sits beside it |
| `decideRetirement` / the KEEP contract | `40306a0a0` (B-RTB-REFRESH-LIVE-PRICE, 2026-10-12, Kyle-directed) | "every ambiguous input resolves to KEEP: no admissible ask ⇒ `unpriced`, never a retirement" | **(1)** kept |
| RR / target-reach gate | `d592c8e29` (reorg-B2, 2026-06-20) | refuse a plan below its strategy's `min_rr`, or with an unreachable target | **(2)** moves into the SQE, ahead of the queue write |
| the 2 % fallbacks | `f3cbe2d14` (reorg-B4), `15cb299f2` (P19-B7.1) | give a target to a row that had none | **(4)** remove (Kyle: "we shouldn't be doing anything with fallbacks") |
| `logRtbTrace` / `logSqeRejection` | INFERRED-FROM-CODE | a durable record of refresh decisions | **(3)** reconnect |
| `missed_refreshes` column | directive 8.8.4-A3 (`[8.8.4-A3.R2]` threshold action; R8 made it dead by design) | count FAILED refresh attempts toward a threshold | **(5) stays disconnected.** This batch does NOT reuse it: "consecutive unpriced passes" is a different meaning (a pass can succeed and still see no admissible ask). OBJ-7 uses a NEW, honestly named column. The old column's removal is placed at Step 2 under rule 18, or kept with a stated reason, with directive 8.8.4-A3.R8's disposition written out. |
| `ENTRY_PREMIUM_BPS` | Step 2 reads `git log -S ENTRY_PREMIUM_BPS --reverse` | an "entry premium" of 10 bps above price | **Settled at Step 2 with presence evidence:** if it has no reader at the ref ⇒ **(5)**, deleted under rule 18 in this batch (a dead "entry premium" beside a new entry window invites re-use). If a reader exists ⇒ it is in scope. |
| the exploration lane's NetEV-only contract | Step 2 | admit a paper exploration trade that failed ONLY the NetEV gate (Kyle's 25-30/day learning budget) | **(1)** kept. The new gate ids must not change what it admits by accident (OBJ-12). |

## 3. Objectives (each with how it is verified)
1. **The entry window, WORSE side only (KD-10), one rule for both classes.** Refuse when the price paid is more than 25 % of the planned entry-to-stop distance ABOVE the planned entry (for a BUY, judged on the ASK). A price below the planned entry is NOT refused by the window; it goes on to OBJ-1b and the economic test.
   - *Verify:* edge tests on both classes: at +25 % passes; one tick above refuses; any amount below is not refused by the window.
1b. **The cheaper-side floor, WATCH-ONLY (KD-10).** For a fill below the planned entry, compute `remaining = (fill − stop) / (planned entry − stop)`. Record whether `remaining < m`, with `m ≈ 0.40` (Langston's measured edge, 2026-11-04: of fills more than 0.60R below plan, 40 opens, 40 stop-outs, 0 targets), as a DB setting. **It never refuses in this batch.** Switching it live is a separate decision, once measured.
   - *Verify:* the shadow field is written on every taker fill below plan; a test at `m` ± 1e-6.
2. **In the SQE, at birth and on every refresh (decision 2).** `SQEInput` gains the plan (entry, stop, target) and a priced input (price, its age, its source). A new gate `EntryWindow` joins both canonical gate-id lists (kept equal).
   - **(a) Birth is measured before it is live (Langston r1):** OBJ-2 ships in SHADOW at birth first. It runs `adverseR` against the fresh ask and records it without refusing. It goes live only once that number is known.
   - The reason: the plan's entry is a bar close or a mid, never the ask. At the minimum stop distance (`MIN_STOP_DISTANCE_BPS: 30`, `server/strategies/strategy-helpers.ts:27`) the whole window is 7.5 bps, against an xStock p99 half-spread of about 40 bps. So "passes by construction at birth" was unevidenced in r1 and is withdrawn.
   - *Verify:* the refresh refuses a signal whose fresh ask left the window and records `EntryWindow` in the SQE tally; the birth shadow field is populated on every birth with a fresh ask.
3. **At the fill (decision 2), including resting orders (decision 3).** A taker fill above the window refuses the open (archive `rejectStage: 'entry_fill'`, reason `entry_window`). A resting maker whose live ask leaves the window is cancelled with its own reason, on every monitoring tick. The VTS, which has no SQE or RTB, applies the fill check at its entry.
   - *Verify:* a taker fill one tick above refuses; a resting order whose ask moves above is cancelled and logged; twins inside pass or keep resting.
4. **The economic test at the actual price: Reply A (KD-11).** Net EV after the ACTUAL arm's fees must be > 0. A missing win probability refuses, with NO default (`#546`). No reward-to-risk floor at the fill: a floor there silently narrows the window Kyle set, because with stop and target fixed at the plan, `rrFill = (R_plan − x)/(1 + x)`.
   - **Plus a friction-coverage floor, WATCH-ONLY:** net reward at the fill ≥ `k` × round-trip friction, with `k` a DB setting measured before it is ever live. This is the leg that answers Kyle's "risking $5 to make 10 cents" without leaning on a win probability.
   - Applied in the SQE (refresh) and at the fill.
   - *Verify:* edge tests at net EV = 0 ± 1e-9; missing pWin refuses; a mutation that adds an RR floor goes red; the friction shadow is written on every evaluated fill.
5. **A valid target is a hard SQE rule; all three 2 % fallbacks deleted (decision 7).** Missing, non-finite or wrong-side ⇒ SQE refusal `InvalidTarget`.
   - *Verify:* the refusal fires; a repo-wide grep finds no `* 1.02` target fallback; `DELETED_COMPONENTS_LOG` entries.
6. **The refresh keeps the plan and re-prices it (decision 6).** Entry, stop and target never move. Every pass with a fresh price recomputes net EV after fees, the maker/taker choice and the window AT THAT PRICE. No strategy re-detection. **No price ⇒ no decision and never a retirement.**
   - *Verify:* a priced pass records net EV at that ask; an unpriced pass changes nothing but its counters.
7. **A priced pass is recorded, and promotion needs one.**
   - **Columns:** a NEW `last_priced_at` stamp and a NEW `consecutive_unpriced_passes` counter. NOT `missed_refreshes` (§2).
   - **(b2) The upsert decision, stated (Langston r1):** both new columns are OUT of the upsert conflict SET. A re-issued plan resets to NULL / 0 and cannot promote until its next priced pass. A new plan must never inherit an old plan's price stamp. The cost: a re-issue waits up to one refresh interval (120 s).
   - **(b3) The promotion ceiling is NEW and named:** promotion today checks no freshness, so there is no existing ceiling to keep (Langston). Promotion requires a priced pass within `promotion_price_max_age_ms` (DB, per class) and the window still inside at it.
   - ⚠️ **CONSEQUENCE FOR KYLE, named and not left to be discovered:** on a quiet xStock venue, a priced-pass requirement acts like a session gate on entries. Kyle ruled on 2026-09-03: off-hours entries YES, no session gate either way. **So this goes to Kyle as a decision before Step 2:** accept the de-facto quiet-venue pause, or set the xStock ceiling to cover quiet periods (with the trade-off measured).
   - *Verify:* a never-priced row is not promoted; a priced row inside the window is; a re-issued row starts at NULL.
8. **The RR / target-reach gate runs inside the SQE, ahead of the queue write (decision 8; closes `#1051` structurally).**
   - *Verify:* a below-floor plan is refused before `queueSQESignal` is called (the test spies on the write).
9. **The dead refresh logs write again.**
   - *Verify:* on staging, the files appear after the first refresh pass with a rejection; a test proves the writer reaches the file system under the ESM build.
10. **Freshness uses each checkpoint's existing reader and ceiling for now, except promotion, which gets OBJ-7's new ceiling.** Item 3 (`B-PRICE-FEED-COVERAGE`) replaces them with the measured standard.
    - *Verify:* each gate records the age and source of the price it judged.
11. **The stale-plan time limit (folded in, Kyle via OLD Claude 2026-11-04).** A queued plan older than `rtb_plan_max_age_ms` (DB, per class) is retired with its own reason, whatever its price.
    - **The value is set at Step 2 from the measured plan-age distribution** against outcomes; it is not guessed here. Langston's 2026-11-04 measurement found plan age does NOT discriminate the zero-win band (the older cohort was the profitable one). So the limit is a hygiene bound on 21.8 h-old plans, not a quality filter, and Step 2 must show it cuts no net-positive cohort.
    - *Verify:* a plan past the limit is retired with the reason; one inside is untouched.
12. **The exploration lane's admission does not change by accident (Langston r1).** The new failures (`EntryWindow`, `InvalidTarget`, the economic test) must not take the `NetEV ` prefix: the lane would otherwise become a bypass of OBJ-4. And a signal failing NetEV plus a new gate is DECLINED by the lane (`length === 2`). That shrinks the 25-30/day learning budget, so it is reported, not silent.
    - *Verify:* a test pins each new failure string's prefix; Step 7 reports exploration-lane admissions per day before and after.
13. **Step 7, pre-registered as MAGNITUDES (Langston r1 (c)); not zeros, which would measure the deploy rather than the fix.** Per class, over the first full session after each increment, report:
    - the worse-side window refusal rate at the fill (expected about 7 to 12 % of admitted xStock taker opens; about 0 % of crypto, n small; Langston's 11-04 and 10-21 cohorts);
    - the `adverseR` distribution of ACCEPTED fills (the falsifiable artifact);
    - the economic-test refusal count;
    - the cheaper-side shadow (how many fills fall below `m`, and their outcomes as they close);
    - the friction-coverage shadow;
    - resting-order cancellations, the priced-pass ratio, exploration-lane admissions, and the open rate before and after.
    - **INVESTIGATE** if the worse-side refusal rate exceeds 25 % of admitted xStock taker opens, or the open rate falls by more than half.

## 4. Increments (Langston r1 (d): fill first)
- **A — at the fill:** the worse-side window (OBJ-1), the cheaper-side shadow (OBJ-1b), the economic test at the fill (OBJ-4), the resting-order cancel (OBJ-3). No `SQEInput` contract change, no schema change; the only checkpoint that stops a bad open today.
- **B — in the SQE and the refresh:** the SQE gate (OBJ-2, birth in shadow first), the refresh re-pricing (OBJ-6), the priced pass and promotion (OBJ-7), the gate move (OBJ-8), the plan-age limit (OBJ-11), the exploration-lane pins (OBJ-12).
- **Ride-along on A (free work, no behaviour risk today):** the fallback deletion and the hard target rule (OBJ-5), the dead logs (OBJ-9), `ENTRY_PREMIUM_BPS` (§2).

## 5. Sequencing constraints
- **Row 59a (`B-RR-FLOOR-HEADROOM`) is in a pre-registered window to 2026-11-07T13:03:42Z** that reads `entryFillShadow`'s fields. Reply A puts no RR floor at the fill, so it does not END that study. But **increment A must not re-point or rename the probe's fields before 2026-11-07T13:03:42Z.** Increment A deploys after that time, or leaves the probe's fields untouched and adds its own.
- **D-2 order:** after `B-XSTOCK-DBS-TO-STRATEGIES` (`#1235`) lands.

## 6. Decisions owed to Kyle BEFORE Step 2
1. **OBJ-7's quiet-venue consequence:** accept a de-facto entry pause on a quiet xStock venue, or set the xStock promotion ceiling to cover it (his 2026-09-03 ruling is no session gate either way).

## 7. Not in this batch
- The Filter Diagnostics display (Kyle 2026-10-20: later in the sprint, KD-9). The new gate ids land in the existing SQE tally only.
- The measured freshness standard and live-feed widening: item 3.
- How each strategy prices its plan: item 4.
- Switching the cheaper-side floor or the friction-coverage floor live: a later decision, once each is measured.

## 8. Superseded r1 text (kept for the review trail)
- ~~"Allowed entry = planned entry ± 25 % … both sides"~~ → OBJ-1, worse side only (KD-10).
- ~~"At birth the window passes by construction today"~~ → withdrawn; birth is measured in shadow first (OBJ-2).
- ~~OBJ-4 "being settled by Langston and Coltrane"~~ → settled by Kyle as KD-11 (Reply A).
- ~~"`missed_refreshes` counts consecutive passes without one (its first writer)"~~ → a new column (OBJ-7); `missed_refreshes` is disposition (5).
- ~~OBJ-11 PASS "no open happens outside the window"~~ → magnitudes (OBJ-13).
- ~~"A plan-age bound … awaiting Kyle's slot"~~ → folded in as OBJ-11.

## 9. Doc set (architecture)
scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_MANUAL` (the SQE gate set, §18.0.1 entry jobs, the promotion rule), `SYSTEM_IMPACT_MAP` (SQE, RTB refresh, promotion, the pending-maker monitor, the exploration lane), `RUNNING_ISSUES` (`#1224`, `#1051`), `DELETED_COMPONENTS_LOG`, the plan line, the task list, memory.
