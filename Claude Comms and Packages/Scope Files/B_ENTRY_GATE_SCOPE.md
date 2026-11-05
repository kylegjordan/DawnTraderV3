# B-ENTRY-GATE — SCOPE r4 (`#1224`)

change-class: architecture

**Owner:** CC-B (NEW Claude) · **Placed:** CC-B pre-sprint list item 2 (Kyle, locked 2026-10-20, `e400fed12`). Under Kyle's D-2 (2026-11-04) it runs after stage 00's `B-XSTOCK-DBS-TO-STRATEGIES` (`#1235`). · **Design record:** `Claude Comms and Packages/Langston Design Asks/B_ENTRY_GATE_DESIGN_r1.md` · **Written:** r1 2026-10-20; r2, r3 and **r4 2026-11-05**

> **✅ STEP 1 PROCEED on r4 — Langston, 2026-11-05 ~08:30Z (msg 1567819543483781191), graded `6faa1102c`.** Two non-blocking Step-2 items added to §5a. He named one unverifiable leg: the commit-message quotes are RULED ON REPORTED FACT (no log verb in `dt-review`); every disposition rests on in-code intent he read himself.
>
> **r4 (2026-11-05): Langston's CHANGES on r3 (msg 1567803028747067413, graded `4ace1b4e4`), two blockers folded.**
> - **C-4:** the SQE's own NetEV sign check (`server/core/filters/signal_quality_evaluator.ts:365`, sync twin `:581`) is censused in §1, given a §2 row, and OBJ-4 now decides its fail-open-on-absence instead of inheriting it. OBJ-12 pins the EXISTING `NetEV ` string at both sites, not only the new gate ids.
> - **C-5:** every path in this file was run against the tree at `dfb8f01d2` (`git cat-file -e`). Fixed: `server/core/sqe/…` → `server/core/filters/signal_quality_evaluator.ts`; `server/services/rtb-retirement-decision.ts` → `server/core/rtb/rtb-price-retirement.ts:43` (`decideRetirement`) with `server/services/rtb-retirement-ask.ts`; the bare `DISCORD_FINDINGS_RUNNING_LIST_2026-07-20.md` → `1-system-manual/…`. The non-tree paths that remain appear only inside correction notes that name them as wrong (r2’s `server/services/exploration-lane.ts`, and the old names listed in this note).
> - The stored-taker quote now cites `:5959-5963` (r3 began one line early). Line numbers in §1 stay pinned at `686d62c9e`; at the graded `4ace1b4e4` the fill lines are +2.
> - Two non-blocking items join §5a.
>
> **r3 (2026-11-05): Langston's Step-1 CHANGES on r2 (ruled at `9df9b353d`, 2026-11-05T05:36Z), three blockers folded.**
> - **C-1:** §2 gains the row OBJ-4 actually changes, the EV-sign gate at the fill (`[11.8B]`, `server/services/active-execution-engine.ts:5756-5866` at the ref), with its history, its in-code intent quoted, and a disposition. OBJ-4 now says it REPLACES that gen-time sign check as the one deciding number at the fill, and why the snapshot's remaining jobs are not a second number. `#522` joins §9. Its live leg is a Kyle decision, added to §6.
> - **C-2:** §5's second option is struck. Increment A deploys after 2026-11-07T13:03:42Z, full stop.
> - **C-3:** the exploration-lane path is corrected to `server/services/execution/exploration-lane.ts:209-210`, reached by the dynamic import at `server/services/signal-orchestrator.ts:1188` under the condition at `:1186`.
> - **Langston's four non-blocking items** are carried to Step 2 in §5a, not dropped.
>
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
- `decideRetirement` (`server/core/rtb/rtb-price-retirement.ts:43`, with the ask reader `server/services/rtb-retirement-ask.ts`), live since `B-RTB-REFRESH-LIVE-PRICE`.

The reward-to-risk at the fill and the distance from the planned entry exist only as a shadow (`entryFillShadow`, `server/core/trading/entry-booking.ts:55-63`).

## 1. What is there (census at `9b0e830fd`; re-read line by line at Step 2 at the then-current ref)
Full repo-relative paths (Langston r1). **Re-read at Step 2:** the census came from a read-only helper agent.
- **The SQE cannot see a plan or a price.** `SQEInput` (`server/core/filters/signal_quality_evaluator.ts:100-129`) has `entryPrice?` and `targetPrice?` but no stop and no live price. Neither production caller sets the entry, target or regime: birth (`server/services/signal-orchestrator.ts:1166`) and refresh (`server/core/rtb/ready_to_buy_service.ts:1093`). So the ROI sub-gate (`:376`) never runs.
- **Birth order** (`buildSizedSignalForStrategy`, `server/services/signal-orchestrator.ts:552-2011`): the SQE at `:1166`, the RTB write at `:1506`, the reward-to-risk / target-reach gate at `:1926-1949`. The write precedes the gate. ⚠️ **A structural fact, not a defect claim:** `#1051`'s claim was withdrawn on 2026-09-12. Moving the gate is Kyle's decision 8, a tidy-up.
- **Refresh** (`refreshAndRank`, `server/core/rtb/ready_to_buy_service.ts:820`, once per signal per 120 s, `server/services/rtb-refresh-service.ts:182-184`):
  - net EV and the maker/taker choice are recomputed only when the geometry throttle fires (`:689`), and then on the STORED plan prices (`:691-693`);
  - otherwise the stored `chosen_net_ev` is fed in (`:1086-1087`);
  - the fresh ask is read once per pass (`server/services/rtb-refresh-service.ts:500-504`) and used only for retirement (`:1028-1054`).
- **"Reconfirmed" is written whether or not the pass saw a price** (`:1124`); nothing reads `last_refreshed_at`.
- **Promotion checks no freshness** (`getRankedSignals`, `:1803`; `checkRtbPromotion`, `server/services/active-execution-engine.ts:5202`).
- **The fill** (`executeSimulatedTrade`, `server/services/active-execution-engine.ts:5506`): a maker books at its limit (`:6045-6048`); a taker walks the book, then `entryFillShadow` (`:6118`, shadow) and `refuseTakerBooking` (`:6135`, live).
- **★ The EV decision at the fill today (Langston r2 C-1; r2's census named `chosen_net_ev` only at the refresh).** Lines at `origin/migration/aws-supabase` = `686d62c9e`:
  - `evaluateTradeExpectancy` runs at `:5723` and recomputes the TAKER leg at the PLAN prices. Its `netEV` is logged (`:5870`) and fed to diagnostics, but **decides nothing**.
  - The deciding number is the gen-time snapshot: `_b72IsTradeable = _b72ChosenNetEv > 0` (`:5778`), where `_b72ChosenNetEv` is the stored `chosen_net_ev`. A row missing the snapshot, its mode or its entry policy is refused `POLICY_SNAPSHOT_MISSING` (`:5768-5776`).
  - `resolveEvBlockDisposition` (`:5802`) makes a non-positive snapshot a SHADOW alarm in paper (`EV_REJECT_SHADOW`, `:5803-5827`; an exploration-stamped open is logged as expected, `:5805-5808`) and a BLOCK in live (`EV_REJECT`, `:5829-5866`), "retained pending Kyle's #522 pre-live ratification".
  - The maker arm has a THIRD EV read: a maker limit already marketable at placement converts to taker only if the stored gen-time `takerNetEv > 0` (`:5969-5980`), else `MAKER_MARKETABLE_DROPPED`.
  - So **no EV number at the fill is computed at the price actually paid.** Each one is a gen-time snapshot or a plan-price recompute. *(Absence confirmed by Langston's own enumeration of `:5506-6200`, with a positive control.)*
- **★ The SQE's own EV sign check (Langston r3 C-4; r3 censused the fill only, while OBJ-4 says "in the SQE and at the fill").** `server/core/filters/signal_quality_evaluator.ts:365` (async) and its sync twin `:581`: `input.chosenNetEv != null && !(input.chosenNetEv > 0)` pushes `NetEV <value> <= 0 (chosen <mode> mode — …)`, **the very string the exploration lane keys on** (`isNetEvOnlyFailure`, `startsWith('NetEV ')`).
  - **Fail-open on absence:** an absent `chosenNetEv` skips the check. Its justification (`:118-126` on `SQEInput.chosenNetEv`, `:363-364`, `:579-580`) says *"the [11.8B] open-gate still nets every lifecycle: it falls back to the taker-leg recompute when chosen_net_ev is null (active-execution-engine.ts:2230), so no ungated path exists."* **That fallback does not exist at the ref:** the open gate REFUSES a missing snapshot (`POLICY_SNAPSHOT_MISSING`, `server/services/active-execution-engine.ts:5768-5776`) and does not recompute, and `:2230` is ~3,500 lines from the gate. So the stated reason is stale in both legs; whether the outcome is still safe (a refusal at the fill instead of a recompute) is what OBJ-4 has to decide, not assume.
- **A resting maker is never checked against the plan** (`_processPendingMaker`, `:1809`; `evaluatePendingMaker`, `server/core/trading/pending-maker-logic.ts:48`).
- **The three 2 % target fallbacks:** `server/core/rtb/ready_to_buy_service.ts:1778` (rank key), `:1933` (shadow pool), `server/services/active-execution-engine.ts:5418` (open). They are unreachable from live births (`RULED ON REPORTED FACT` by Langston: 0 of 58 live rows null).
- **Dead logs:** `logRtbTrace` (`:1350`) and `logSqeRejection` (`:1382`) call `require` in an ESM bundle, inside an empty `catch`. INFERRED to throw and write nothing.
- **★ A THIRD reader of the SQE failure strings (Langston r1, missed by r1's census):** the exploration lane.
  - `server/services/signal-orchestrator.ts:1186` runs it on `!sqeResult.passed && this.mode === 'paper'`, through the dynamic import at `:1188`. `isNetEvOnlyFailure` (`server/services/execution/exploration-lane.ts:209-210`) admits only `failures.length === 1 && failures[0].startsWith('NetEV ')`. *(r2 cited `server/services/exploration-lane.ts:209-211`, a path not in the tree; Langston caught it.)*
  - The canonical gate-id lists are `server/core/observability/active-funnel-tracker.ts` and `shared/sqe-gate-classifier.ts:16-28`, fence-pinned equal.
- **No entry-distance constant exists.** ⚠️ `ENTRY_PREMIUM_BPS: 10` (`server/strategies/strategy-helpers.ts:24`) has no reader in `server/` (Langston's scoped grep: "looks dead", not proven). See §2.
- **`missed_refreshes`** (`shared/schema.ts:2149`, documented as *failed refresh attempts* in `docs/schema_reference_v1_5_1.md:51`) is recorded as dead BY DESIGN per directive 8.8.4-A3.R8 (`1-system-manual/DISCORD_FINDINGS_RUNNING_LIST_2026-07-20.md:43`). Its original semantic was a threshold-driven action (`[8.8.4-A3.R2][SQE][WARN] missedRefreshes=…/${MISSED_REFRESH_THRESHOLD}`). See §2.
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
| **★ the EV-sign gate at the fill (`[11.8B]` reading `chosen_net_ev`)** | `c595d987e` (P19-B7.2 Step-3, 2026-07-01) made the snapshot the deciding number; `5ae8d7c44` (P19-B8.5 fix-round, 2026-07-16) made it a shadow in paper and kept the live block | **Quoted, `c595d987e`:** *"Per-signal maker-vs-taker ENTRY decision computed once at the shared build convergence … snapshotted onto the RTB row, and read by the [11.8B] open-gate + the B7.1 ranker (single-consistent-number). A taker-unprofitable / maker-profitable signal now survives to be ranked + opened."* **Quoted, the in-code intent (`:5755-5764`):** *"Take the EV-SIGN pass/fail from that snapshot so a maker-chosen crypto opener (taker netEV<0, chosen netEV>0) passes while its taker recompute would reject … substituting taker recomputation would erase the policy decision and violate the single-consistent-number invariant."* **Quoted, `5ae8d7c44`:** *"the open-gate reads the SAME stored chosen_net_ev the SQE last passed (same operand, same standard, no fresher data = strictly redundant as a block) … LIVE KEEPS THE BLOCK (Langston risk flag — real-money fail-safe; Kyle ratifies at the #522 pre-live gate)."* | **(2) relevant, update.** The invariant's purpose is that the ARM CHOSEN decides, never a taker recompute substituted for a maker choice. OBJ-4 keeps that: it computes net EV for the ACTUAL arm at the price ACTUALLY paid, and that becomes the ONE deciding number at the fill. The snapshot keeps two jobs that decide nothing economic: the `POLICY_SNAPSHOT_MISSING` integrity refusal (unchanged) and the drift ALARM (SQE passed it positive, the snapshot is now non-positive), shadow in both modes. **The paper rationale for the shadow ("same operand … no fresher data") does not hold for OBJ-4, which has fresher data, so OBJ-4 refuses in paper.** The live leg was reserved for Kyle at `#522`, so it goes to him (§6 item 2). |
| **★ the SQE's NetEV sign check** (`server/core/filters/signal_quality_evaluator.ts:365`, sync `:581`) | `84d188804` (P19-B8.5a Step-3, 2026-07-13: *"OBJ-3 netEV->SQE admission"*) | **Quoted (`:358-364`):** *"NET-EXPECTANCY ADMISSION GATE — the number we rank on is the number that admits (Kyle directive 2026-07-13: the net-EV gate belongs in the SQE). Pure sign check on the UPSTREAM-computed best-of-both chosenNetEv … ABSENT chosenNetEv → skip (fail-open, Langston-ratified; [11.8B]'s taker-leg fallback still nets legacy rows — no ungated lifecycle)."* | **(2) relevant, update.** Kyle's placement (the EV gate belongs in the SQE) stands; OBJ-4 changes what it is fed at the refresh (net EV re-priced at the fresh ask, OBJ-6) and decides the absent case explicitly (OBJ-4). The stale fallback text at `:118-126`, `:363-364` and `:579-580` is corrected in the same change. **Both copies change together** (async and sync), pinned by one test that runs both. The `NetEV ` prefix of its failure string is a contract with the exploration lane and does not change (OBJ-12). |
| the maker-to-taker conversion's stored-taker check | `c595d987e` / P19-B7.2c | **Quoted (`:5959-5963`):** *"run the stored-taker check instead: the gen-time takerNetEv … gate is a gen snapshot ≤~30s stale via the promotion loop, the fill is live — documented approximation"* | **(2) update.** The book is in hand at that line (`_gate.snapshot.asks`), so the conversion decision becomes OBJ-4's taker test at the live ask, replacing the documented approximation: one number, not a stored one followed by a live one. |
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
   - **★ At the fill it REPLACES the gen-time sign check; it does not sit beside it (Langston r2 C-1).** One number decides: net EV for the ARM THAT ACTUALLY FILLS, at the PRICE ACTUALLY PAID (a taker at its walked average; a maker at its limit, now conditional on having filled, so with no fill-probability weight). The snapshot's remaining jobs (missing-snapshot refusal, drift alarm) decide nothing economic, so they are not a second EV number. The maker-to-taker conversion uses this same test at the live ask (§2).
   - **★ In the SQE, the absent case is DECIDED, not inherited (Langston r3 C-4).** The fail-open was justified by a fallback that no longer exists. Proposal: an absent net EV at the SQE becomes a refusal with its own failure string (not the `NetEV ` prefix, so the lane cannot admit it). The fill already refuses a missing snapshot, so this moves the refusal earlier instead of letting an ungated row sit in the queue. Step 2 counts how many live rows reach the SQE with no net EV today; if the answer is not zero, the count goes to Langston before the change.
   - **★ Exploration-stamped paper opens are known-negative by design** (Kyle's 25-30/day learning budget; stamp-honored today at `:5805-5808`). OBJ-4 does not refuse them; it records their fill-time net EV in shadow. Without this the lane would die at the fill. Pinned by a test.
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
    - **And the EXISTING `NetEV ` string is pinned at BOTH SQE sites (`:365` async, `:581` sync), Langston r3 C-4.** Changing its text would make the lane admit nothing; keeping the text while OBJ-4 changes what it tests would leave Kyle's 25-30/day budget admitting on a different test than he approved. So: the prefix is pinned, and Step 2 states in plain terms what the lane will admit on after OBJ-4 (net EV at the fresh ask instead of at birth), for Kyle to see.
    - *Verify:* a test pins each new failure string's prefix AND the existing `NetEV ` prefix at both SQE sites; Step 7 reports exploration-lane admissions per day before and after.
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
- **Row 59a (`B-RR-FLOOR-HEADROOM`) is in a pre-registered window to 2026-11-07T13:03:42Z** that reads `entryFillShadow`'s fields. Reply A puts no RR floor at the fill, so it does not END that study. So **increment A deploys after 2026-11-07T13:03:42Z, full stop** (Langston r2 C-2). ~~Or leaves the probe's fields untouched and adds its own.~~ Struck: the perturbation is to 59a's POPULATION, not its fields. 59a grades `reject_stage='admitted'` only and counts `entry_fill` rows beside it, never in it; a live worse-side window turns exactly the rows it decides on into `entry_fill`. Langston measured it: in the window, `vwap_pullback`'s positive slips would fall 10 → 5 (the bare qualification floor), graded 76 → 71, and the p90 would lose its right tail. The exposure is small (~2 days, ~17 graded rows); the fix is free, since this batch is already behind `#1235`.
- **D-2 order:** after `B-XSTOCK-DBS-TO-STRATEGIES` (`#1235`) lands.

## 5a. Carried to Step 2 (Langston r2, non-blocking)
- **OBJ-13's magnitudes name their basis window.** Langston verified them: all-history admitted xStock takers 20 of 266 above 0.25 = 7.52 %; crypto 0 of 16. The 19-day 59a sub-window runs 3.11 %, so "7-12 %" is effectively one-sided at its lower edge; Step 2 states the window.
- **OBJ-1b's cohort is passed BY CONSTRUCTION by the live economic test** (`rrFill = (R_plan − x)/(1 + x)` improves for `x < 0`; algebra checked by Langston against `server/core/trading/entry-booking.ts:55-63`). Watch-only is Kyle's call; the Step-7 report keeps that cohort's outcomes (OBJ-13 lists them).
- **OBJ-3's maker leg needs its own predicate.** `evaluatePendingMaker` (`server/core/trading/pending-maker-logic.ts:48-69`) has three outcomes (fill / drop / rest) and no "the market left the plan". A maker transacts at its LIMIT, so judging it on the ask is not "the price paid", and `vwap_pullback` (76 of 161 graded opens) buys a pullback. Step 2 measures how many resting makers the cancel would remove and how many of those would have filled, before the predicate is fixed.
- **★ A refresh SQE refusal is a QUEUE DELETE (Langston PROCEED note 1).** `server/core/rtb/ready_to_buy_service.ts:1093` runs the SQE with `gateShadowMode: true`, which disables ONLY the Governance sub-gate (`:449-457`, Kyle 2026-09-12 "leave it off"); the NetEV check pushes to `failures` unconditionally, and `!sqeResult.passed` goes to `bulkDeletes` (`:1107`) → `deleteRtbSignalsByIds` (`:1193`), with the exploration stamp the only reprieve (`:1102`). So OBJ-6 turns a live-ask EV sign into a queue-EVICTION rule, which is also what the `[11.8B]` paper shadow rests on for its safety. Step 2: census it in §1, give it a §2 row, and pre-register its own Step-7 magnitude (refresh deletions attributable to the live-ask EV, per class); watch the interaction with OBJ-11 and OBJ-7 on a widening book.
- **`:118-126` is one line early:** `:118` is `sourcePool`; the `SQEInput.chosenNetEv` comment is `:119-126`. Corrected when the text is corrected, with the line quoted beside the number.
- **`resolveEvBlockDisposition` (pure, unit-pinned, live-BLOCK arm pinned):** OBJ-4 makes the snapshot alarm shadow in both modes, which retires that arm. Step 2 names which of its fences re-point to OBJ-4's test and which die (subject vs probe).
- **`BLOCK_SNAPSHOT_MISSING` is already unreachable:** the `:5768` return catches every non-finite snapshot first, so the reject text at `:5839` describes a path that cannot execute. Step 2 gives it a disposition (rule 18), rather than carrying it.
- **`ENTRY_PREMIUM_BPS`:** Langston ran the census: exactly one occurrence under `server/` at the ref, its declaration (`server/strategies/strategy-helpers.ts:24`). Disposition (5) is supported; Step 2 still owes the `git log -S` history line.

## 6. Decisions owed to Kyle BEFORE Step 2
1. **OBJ-7's quiet-venue consequence:** accept a de-facto entry pause on a quiet xStock venue, or set the xStock promotion ceiling to cover it (his 2026-09-03 ruling is no session gate either way).
2. **★ The live leg of the EV check at the fill (r3, C-1).** In July Kyle reserved for the `#522` pre-live gate whether live mode keeps blocking on the gen-time EV snapshot. OBJ-4 replaces that snapshot with the EV at the price actually paid, which blocks in both modes. **Recommendation:** accept, and re-point `#522`'s ratification item to the new check, because it decides on fresher data than the block he was asked to ratify. Live mode is not on, so nothing trades differently today.

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
scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_MANUAL` (the SQE gate set, §18.0.1 entry jobs, the promotion rule), `SYSTEM_IMPACT_MAP` (SQE, RTB refresh, promotion, the pending-maker monitor, the exploration lane), `RUNNING_ISSUES` (`#1224`, `#1051`, `#522`: its live-leg ratification item is re-pointed, §6 item 2), `DELETED_COMPONENTS_LOG`, the plan line, the task list, memory.
