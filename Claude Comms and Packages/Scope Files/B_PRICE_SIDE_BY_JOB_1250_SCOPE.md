# B-PRICE-SIDE-BY-JOB — `#1250` STEP 1 SCOPE: xSTOCK TAKER-ENTRY STOP AND TARGET ON THE PRICE PAID

change-class: architecture (the batch's declared class; unchanged — this is an item of `B-PRICE-SIDE-BY-JOB`, row 3n / `SPRINT_TO_LIVE_PLAN.md` §4 row 17, not a new slot)

**Owner:** CC-C · **Carrier:** alert `6e8340c3-ab13-4a50-8660-6419f5fe391c` (fired 2026-11-07T15:00Z; resolved when this scope is filed) · **Ledger:** `RUNNING_ISSUES` `#1250` · **Sibling:** row `8c` (crypto per-leg levels), `Scope Files/B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` §8 — one level-basis rule for both classes.

## 0. Start condition — met, and what it changed
- **The joint deploy landed:** `e0e68dfdbd497033c8c6b22222949b13c9c3c4b1` at 2026-11-07T13:20:59Z (`dt-deploy` record, `--by cc-c`), carrying `B-ENTRY-GATE` inc A; staging now runs `6c39f14cb` (KD-19, 15:15:11Z), which contains it.
- **What inc A does at a TAKER entry (read at the ref, `active-execution-engine.ts` taker open, the `B-ENTRY-GATE (#1224) increment A, P1 + P1b` block):** it REFUSES a taker fill more than `entry_window_worse_side_frac` × the planned risk ABOVE the planned entry (`entryWindowRefusal`), and runs the economic test at the price paid (`computeFillEconomics`, `arm: 'taker'`). **A fill BELOW plan is never refused** — it is recorded only, against the cheaper-side floor, WATCH-ONLY (`cheaperSideRecord` → `remainingRiskFrac`, `belowCheaperFloor`, `[B-ENTRY-GATE][CHEAPER_FLOOR][SHADOW]`).
- **⇒ `#1250`'s population is exactly the side inc A only records:** 9 of the 10 walk-priced `stop_hit` rows filled BELOW the decision price, and their stop stayed on the decision price. **Inc A measures the shrunken stop room (`remainingRiskFrac`); nothing re-bases the levels.** The fix is still owed, and inc A's record is its baseline instrument.
- **The written levels at the ref:** both open writes take `stopLoss: signal.stopPrice` / `takeProfit: signal.targetPrice` (the `createClosedTrade` and open-position writes on the taker arm), and every taker gate in between (`entryFillShadow`, `refuseTakerBooking`, the window) judges the fill AGAINST those decision-based levels.

## 1. Objectives (numbered, each with its verification)
**OBJ-1 — On the xStock TAKER arm, the stop and target the position carries are referenced to the TRANSACTED entry, not the decision price.** The rule for HOW (preserve the planned distances from the fill, or re-derive each level on its role's side under the 2026-09-04 level-basis rule `priceForLevelRole`) is decided at Step 2 with Langston, and must be the SAME rule `8c` switches on for crypto.
*Verify:* fixtures on both arms of every taker gate (below-plan, at-plan, above-plan inside the window); a mutation that reverts to `signal.stopPrice` turns them red; Step 7 — every post-deploy xStock taker open's stop distance from its fill equals the rule's intended distance (tolerance stated at Step 2), read from `closed_trades` beside `entry_decision_price`.

**OBJ-2 — Gate ordering is decided, not inherited.** The geometry refusal, the entry window and the fill economics currently judge the fill against decision-based levels. Step 2 states, per gate, whether it judges the decision geometry (the plan) or the re-based geometry (what the position will carry), with the reason.
*Verify:* the per-gate table in the pre-audit, each row with its `file:line`; a fixture per gate.

**OBJ-3 — A second producer is measurable: the entry-age field on the `kraken_equities_ws_mid` producer.** Langston's fold (2): `entry_book_age_ms` is NULL on 4/4 mid-producer rows. ⚠️ **The recorded intent conflicts and must be reconciled, not overwritten:** the maker fill stamp (`B-EXIT-PROVENANCE` P4, `8a-P3` rewrite) writes `entryBookAgeMs` as the BOOK quote's age and `null` when no book was read — a resting xStock fill reads the equities tick, not a book. Step 2 decides between (a) the tick's own age under a separately named field, (b) `entry_book_age_ms` with its column meaning widened, or (c) deriving it from `entry_observed_at_ms` already stamped — and checks whether that stamp is non-null on those rows.
*Verify:* the chosen field non-null on every post-deploy xStock maker fill, with a positive control.

**OBJ-4 — Rows before and after are separable.** Re-based levels change xStock paper outcomes; the boundary is an epoch move (`calibration_epoch` `xstock_spot/paper_sim` +1, the KD-19 template) and/or a stamp naming the level basis on the row. Decided at Step 2.
*Verify:* the epoch row read after deploy; a pre/post row pair shows the stamp.

**OBJ-5 — Scope boundary stated:** the 4 maker rows (`kraken_equities_ws_mid`, 0/4 below plan) are NOT this item's population — a resting maker fills at its limit or better (Langston fold (1)). The maker arm is checked at Step 2 for the same decision-vs-fill gap and recorded either way; any gap found there is a finding with a §9.4 disposition, not silent scope growth. Crypto taker levels are `8c`'s.

## 2. Architectural read (1.a)
- **`SYSTEM_MANUAL.md` "The LEVEL BASIS" (`:731`)** documents only the crypto lanes (smoothed-mid quant basis, bar-close pattern basis) and states at `:750`: *"THE xSTOCK LANES' LEVEL BASIS IS NOT DOCUMENTED HERE AND IS NOT ASSUMED SYMMETRIC … Stated as a gap rather than left to read as covered."* ⇒ **Step 2 traces the xStock quant and pattern level bases** before any rule is chosen; Step 10 closes the `:750` gap.
- **`SYSTEM_IMPACT_MAP.md` S27** — the level-basis funnel (`core/calculations/level-basis.ts`) is the instrument; `priceForLevelRole` has zero production callers (8c A1). Components touched (Step 2 enumerates their consumers): the taker open path in `active-execution-engine.ts`, the two durable writes (`closed_trades`, `active_open_positions`), the exit monitor's reads of `stop_loss` / `take_profit`, the xStock dispatch (`asset_classes/xstock_spot/active-dispatch.ts`) where the signal's levels are formed.

## 3. Provenance (1.b)
**Corpora searched:** `RUNNING_ISSUES.md` (`#1250`, `#1235`), `8c` audit §8, `B_SILENT_STRATEGY_CENSUS_PROGRESS_REPORT.md` §3a.1 (the measurement), git `-S`, unrestricted by path.
- **TIER 1 — the level write at open (behaviour changes).** Introduced `cb8ee0942`, 2025-10-10, Replit era, quoted: *"Add paper trading execution engine to simulate trades without real money … Introduces the `PaperExecutionEngine` class for simulating trades on Kraken, including price monitoring, signal generation, and position management."* In that commit the fill was `const actualEntryPrice = signal.entryPrice + slippage; // Worse price due to slippage` with `SLIPPAGE_PERCENT = 0.15`, and the levels were written as `stopLoss: signal.stopPrice.toString()`. **⇒ The original design held decision and fill at most 0.15 % apart, so decision-referenced levels were a negligible approximation.** P19-B4b.1 replaced the flat slippage with an honest depth walk (`order-placer.ts` header), which lets the fill move far from the decision (NET: −1.482 %) — and the level write was never revisited. **Disposition (2): relevant, needs updating to today's intent** (the 2026-09-04 rule: a level's basis is a price we could transact at).
- **TIER 2 — `entryDecisionPrice` stamp** (`68930cd35`, `B-EXIT-PROVENANCE`, 2026-08-26): kept beside the walked entry so slippage is reconstructable from the row; it is what the Step-7 read uses. (1) correct.
- **TIER 2 — `refuseTakerBooking`** (shared primitive, VTS and xStock booking): refuses a fill at or through its own stop/target. (1) correct; OBJ-2 decides which geometry it judges.
- **`bridge/canonical/`:** not consulted yet — the component post-dates it in its current form (the depth walk is P19); Step 2 records whether the pre-governance corpus states an intended level reference.

## 4. Already decided / already exists
- The rule exists and is Langston's: the 2026-09-04 level-basis rule (LEVEL-SETTING job). The machinery exists unwired (`level-basis.ts`, 8c A1). **This item wires a rule; it does not invent one.**
- Not calibration: Langston's disposition on `#1250` — do NOT route to Phase 25 / 25-14.
- KD-36: trailing and break-even stay OFF, so the constructed stop is the operative exit (8c A8) — the re-based stop is what fires.

## 5. Plain-language summary
When an xStock trade is bought straight off the order book, the price actually paid can be a percent or more away from the price the decision was made at. Today the stop-loss and the profit target stay where they were set for the decision price, so a cheaper fill quietly leaves the stop much closer than planned — in one case about 1 % below the fill instead of 2.5 %. This item moves those two levels to the price paid, using the same rule the crypto side is about to switch on.
