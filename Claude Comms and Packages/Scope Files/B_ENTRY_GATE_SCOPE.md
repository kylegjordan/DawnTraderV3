# B-ENTRY-GATE — SCOPE r1 (`#1224`)

change-class: architecture

**Owner:** CC-B (NEW Claude) · **CC-B pre-sprint item 2** (Kyle's list, re-ordered and locked 2026-10-20, `e400fed12`) · **Design record:** `Claude Comms and Packages/Langston Design Asks/B_ENTRY_GATE_DESIGN_r1.md` (Kyle's decisions §2, read as decided) · **Census:** every `path:line` below is at `9b0e830fd`, from a read-only census (helper agent, NOT RE-READ line by line by CC-B; the load-bearing ones are re-read at Step 2).

## 0. What this batch is for
Kyle, 2026-10-20: enter only near the price the plan was built on, and only when the trade is still worth taking at the price actually paid. Today nothing compares the live price with the plan except two refusals at or through the stop or the target (`refuseTakerBooking`, live since `B-ENTRY-DISTANCE-GUARD`; `decideRetirement`, live since `B-RTB-REFRESH-LIVE-PRICE`). The reward-to-risk at the fill and the distance from the planned entry are computed only as a shadow (`entryFillShadow`, `entry-booking.ts:55-63`).

## 1. What is there (census at `9b0e830fd`)
- **The SQE cannot see a plan or a price.** `SQEInput` (`signal_quality_evaluator.ts:100-129`) has `entryPrice?` and `targetPrice?` but no stop and no live price, and neither production caller (`signal-orchestrator.ts:1166` birth, `ready_to_buy_service.ts:1093` refresh) sets the entry, target or regime — so the ROI sub-gate (`:376`) never runs.
- **Birth order (`buildSizedSignalForStrategy`, `signal-orchestrator.ts:552-2011`):** SQE at `:1166`, the RTB write at `:1506`, the reward-to-risk / target-reach gate at `:1926-1949`. The write precedes the gate.
  - ⚠️ **This is a STRUCTURAL fact, not a defect claim.** `#1051`'s claim that a refused signal could still become a trade was **withdrawn on 2026-09-12** after Kyle disputed it and the runtime test showed no refused pair reached the pool. Moving the gate ahead of the write is Kyle's decision 8, a tidy-up.
- **Refresh (`refreshAndRank`, `ready_to_buy_service.ts:820`, once per signal per 120 s, `rtb-refresh-service.ts:182-184`):** net EV and the maker/taker choice are recomputed only when the geometry throttle fires (`:689`), and then on the STORED plan prices (`:691-693`), not the fresh ask; otherwise the stored `chosen_net_ev` is fed (`:1086-1087`). The fresh ask is read once per pass (`rtb-refresh-service.ts:500-504`) and used only for retirement at or through stop/target (`:1028-1054`).
- **"Reconfirmed" is written whether or not the pass saw a price** (`:1124`), and nothing reads `last_refreshed_at`. `missed_refreshes` (`shared/schema.ts:2149`) has no writer and no reader.
- **Promotion checks no freshness** (`getRankedSignals`, `:1803`; `checkRtbPromotion`, `active-execution-engine.ts:5202`).
- **The fill (`executeSimulatedTrade`, `active-execution-engine.ts:5506`):** a maker books at its limit (`:6045-6048`); a taker walks the book, then `entryFillShadow` (`:6118`, shadow) and `refuseTakerBooking` (`:6135`, live).
- **A resting maker order is never checked against the plan** (`_processPendingMaker`, `:1809`; `evaluatePendingMaker`, `pending-maker-logic.ts:48`): it is cancelled only at its deadline, on legacy provenance or when the engine stops.
- **The three 2 % target fallbacks:** `ready_to_buy_service.ts:1778` (rank key), `:1933` (shadow pool), `active-execution-engine.ts:5418` (open). Unreachable from live births today (target required, `strategy-engine.ts:121`; grid refusal, `venue-price-grid.ts:274-285`); 0 of 58 live rows null.
- **Dead logs:** `logRtbTrace` (`:1350`) and `logSqeRejection` (`:1382`) call `require` in an ESM bundle (`package.json:4`, `:8`) inside an empty `catch` — INFERRED to throw and write nothing.
- **No entry-distance constant exists** (searches in the census, §F).

## 2. Provenance (Tier 1 for behaviour this batch changes)
| component | origin | intent | disposition |
|---|---|---|---|
| `entryFillShadow` | `c285745e9` (B-ENTRY-DISTANCE-GUARD Step 3, 2026-10-11) | measure RR at the fill and `adverseR`, shadow until the floors were understood (`#1183`) | **(2)** relevant, update: its `adverseR` becomes the live window check at the fill |
| `refuseTakerBooking` | same | refuse a fill at or through stop/target | **(1)** kept; the window is stricter and sits beside it |
| `decideRetirement` / the KEEP contract | `40306a0a0` (B-RTB-REFRESH-LIVE-PRICE, 2026-10-12, Kyle-directed) | "every ambiguous input resolves to KEEP: no admissible ask ⇒ `unpriced`, never a retirement" | **(1)** kept; Kyle 2026-10-20 restated it ("never retiring on a missing price") |
| RR / target-reach gate | `d592c8e29` (reorg-B2, 2026-06-20) | refuse a plan whose RR is below the strategy's `min_rr` or whose target is out of reach | **(2)** moves into the SQE ahead of the queue write |
| the 2 % fallbacks | `f3cbe2d14` (reorg-B4, 2026-06-25), `15cb299f2` (P19-B7.1, 2026-06-30) | give a target to a row that had none | **(4)** connected but should be removed (Kyle: "we shouldn't be doing anything with fallbacks") |
| `logRtbTrace` / `logSqeRejection` | INFERRED-FROM-CODE | a durable record of refresh decisions | **(3)** disconnected by the ESM build; reconnect |

## 3. Objectives (each with how it is verified)
1. **The 25 % entry window (Kyle decision 1), one rule for both classes.** Allowed entry = planned entry ± 25 % of |planned entry − planned stop|, both sides, inclusive. A BUY is judged on the ASK (the side a counterparty fills). *Verify:* tests at the two edges (inside passes, one tick outside refuses, both sides, both classes).
2. **In the SQE, at birth and on every refresh (decision 2).** `SQEInput` gains the plan (entry, stop, target) and a priced input (price, its age, its source). A new SQE gate `EntryWindow` joins the canonical gate list (`active-funnel-tracker.ts:64-82` and `shared/sqe-gate-classifier.ts:17-28`, kept equal). *Verify:* the refresh refuses a signal whose fresh ask left the window and records `EntryWindow` in the SQE tally.
   - ⚠️ **At birth the window passes by construction today**, because the plan's entry IS the birth price. It starts to bite at birth only when item 4 (`B-PLAN-PRICE-BASIS`) prices plans from an independent fresh price. Stated, not hidden.
3. **At the fill (decision 2), including resting orders (decision 3).** The taker walk's fill price outside the window refuses the open (archive `rejectStage: 'entry_fill'`, reason `entry_window`). A resting maker whose live ask leaves the window is cancelled with its own reason, every monitoring tick. The VTS, which has no SQE or RTB, applies the fill check at its entry. *Verify:* a taker fill one tick outside refuses; a resting order whose ask moves outside is cancelled and logged; twins inside pass/keep resting.
4. **The economic test at the actual price.** ⏳ **The rule is being settled by Langston and Coltrane at Kyle's request** (Coltrane: gross RR ≥ 0.60 AND net EV after fees > 0; Langston: RR ≥ 1.0 net of fees). Applied in the SQE (refresh) and at the fill. **The number is settled before Step 2; with no consensus, the two options go to Kyle with their trade-off.** *Verify:* edge tests at the settled number, plus a mutation that moves the floor by 1e-6 and goes red.
5. **A valid target is a hard SQE rule; all three 2 % fallbacks deleted (decision 7).** Missing, non-finite, or on the wrong side of the entry ⇒ SQE refusal `InvalidTarget`. *Verify:* the refusal fires; a repo-wide grep finds no `* 1.02` target fallback; rule-18 entries in `DELETED_COMPONENTS_LOG`.
6. **The refresh keeps the plan and re-prices it (decision 6).** Entry, stop and target never move. Every pass with a fresh price recomputes net EV after fees, the maker/taker choice and the window AT THAT PRICE — not on the geometry throttle and not at the stored plan price. No strategy re-detection. **No price ⇒ no decision and never a retirement** (the KEEP contract). *Verify:* a pass with a fresh ask records net EV at that ask; a pass without one changes nothing but the counters.
7. **A priced pass is recorded as such, and promotion needs one.** A new `last_priced_at` stamp on a pass that saw a fresh price; `missed_refreshes` counts consecutive passes without one (its first writer). Promotion requires a priced pass within the current ceiling and the window still inside at it. ⏳ **Whether the economic test and target validity also run at promotion** (Langston's Q3 (ii)) **is part of the consensus in objective 4**; Kyle's standing rule is no gates at promotion beyond freshness and the window. *Verify:* a never-priced row is not promoted; a priced row inside the window is.
8. **The RR / target-reach gate runs inside the SQE, ahead of the queue write (decision 8; closes `#1051` structurally).** *Verify:* a below-floor plan is refused before `queueSQESignal` is called (test spies the write).
9. **The dead refresh logs write again (decision 6).** *Verify:* on staging, the trace and `sqe_rejections.log` files appear after the first refresh pass with a rejection; a test proves the writer reaches the file system under the ESM build.
10. **Freshness uses each checkpoint's existing reader and ceiling for now.** Refresh: the retirement ask (`readRetirementAsk`); fill: the depth source and the xStock fill-safety ceiling. **Item 3 (`B-PRICE-FEED-COVERAGE`) replaces those ceilings with the measured standard** — the "freshness check switches on when item 3 lands" (Kyle, 2026-10-20). *Verify:* the gate records the age and source of the price it judged.
11. **Step 7 (pre-registered here):** on staging, per class, the counts of `EntryWindow`, `InvalidTarget` and the economic-test refusals at the SQE and at the fill, the resting-order cancellations, the priced-pass ratio, and the open rate before and after. **PASS** = every refusal carries a priced input with its age and source, and no open happens outside the window. **FAIL** = any open whose fill is outside the window, or any retirement on a missing price.

## 4. Not in this batch
- **Filter Diagnostics display** — Kyle, 2026-10-20: later in the sprint. The new gate ids land in the existing SQE tally only.
- **The measured freshness standard and live-feed widening** — item 3.
- **How each strategy prices its plan** — item 4.
- **A plan-age bound** (plans up to 21.8 h old in the queue, Langston 2026-10-20; no TTL since R9.3-C) — Langston proposed `B-RTB-PLAN-AGE-BOUND`; **awaiting Kyle's slot.**

## 5. Doc set (architecture)
scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_MANUAL` (the SQE gate set, §18.0.1 entry jobs), `SYSTEM_IMPACT_MAP` (SQE, RTB refresh, promotion, the pending-maker monitor), `RUNNING_ISSUES` (`#1224`, `#1051`), `DELETED_COMPONENTS_LOG`, the plan line, the task list, memory.
