# B-XSTOCK-FEE-CONTRACT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** `B-XSTOCK-FEE-CONTRACT` (`#1010`, `PHASE_19_PLAN` row 2.4-FEE) · **change-class: architecture** (Langston, stands) · **Owner:** CC-B
**Audited at:** `origin/migration/aws-supabase` `18a8b29b6`; reviewer re-derivations at `56599ad6d` and `4e7f584b5` (no code under audit changed between them) · staging DB + logs read 2026-09-11 15:00–15:55Z
**Inputs:** scope r1.1 `c891de65a` · Langston Step-1 APPROVAL with five rulings, F-1..F-5 and two gaps (2026-09-11) · Langston addendum 15:03Z (`dt-deploy` has no rollback verb; the forward-deploy window)
**Revision:** r3 — two fresh object-round reviews folded (§D). The OBJ-9 query is committed at `scripts/analysis/b_xstock_fee_contract_obj9_rerank.sql`.

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | Maker rail floor `−0.01` (scope OBJ-2) | **`−0.001`**, in code | Langston ruling 1 |
| 2 | Corrective `UPDATE` form open (scope OBJ-3) | **unconditional SET + post-condition assert on the resolved pair** | Langston ruling 2 |
| 3 | "15 test files" (scope OBJ-8) | **16 files** touch fee rates; **10** of them mention `xstock_spot` | re-derived unbounded at `18a8b29b6` (§A10) |
| 4 | "maker advantage 0.40 % → 0.12 %" (scope §2) | **Both arms fall.** Taker round-trip fee 160 → 20 bps (**−140**); maker-entry round trip 120 → 8 bps (**−112**); the gap between them 40 → 12 bps | Langston F-4 reword |
| 5 | Parity gate: "low reach today, a taker exit keeps a per-trade total positive" (scope OBJ-5) | **Reach is ZERO.** The buffer it averages has had no writer since 2026-06-16 | §A7 |
| 6 | `resolveFee` "four call sites" | four sites in **two** methods; `getConfig` has **zero** consumers; four methods of that class are dead | §A3 |
| 7 | cost-model fold rollback: "the rollback migration re-inserts the rows first" (scope r1.1) | **a committed operator runbook step with the literal re-insert SQL** — `dt-deploy` migrates forward only | Langston 15:03Z; `scripts/dt-deploy.sh:222-234` |
| 8 | `SYSTEM_IMPACT_MAP.md:3504` lists `calculateFees`/`modelTradeRealism`/`getConfig` as consumers | only `calculateFees` and `modelSlippage` have a caller | §A3 |
| 9 | **OBJ-9 (r1 of this document at `56599ad6d`, and my message to Kyle): rank 0 would have changed in "188–266 of 1,512 cycles (12.4–17.6 %)"** | **CERTAIN in 162, POSSIBLE in 339, of 1,514 cycles (10.7–22.4 %)** | **Method:** r1 shifted every xStock member by one bound together, which brackets crypto-led cycles but **not** xStock-led ones, where leader and challengers move by different, unknown amounts — re-derived per cycle (§A9). **Population:** 1,512 → 1,514 as live cycles arrived between runs (15:04Z → 15:50Z); the two new cycles changed neither count |

---

# PART A — AUDIT

## A0. The six sources, named

| # | source | read |
|---|---|---|
| 1 | Code at `18a8b29b6` | every file cited below, read at the ref (`git show` / `git grep <ref>`), tests excluded from censuses unless named |
| 2 | Runtime + DB | staging `module_constants` (all 30 `fee_model`/`cost_model`/epoch-matching rows; control 1,021 total), `calibration_ledger`, `system_context`, `pg_constraint`, `information_schema.columns`, `switch_on_shadow_evidence`, `rtb_shadow_pool_members` + `rtb_shadow_pairings`; boot log `out__2026-09-11_11-45-17.log` |
| 3 | `SYSTEM_IMPACT_MAP.md` | `:97-104` maker/taker, `:165` cache semantics, `:367` parity gate, `:407` cost cache, `:2039` calibration ledger, `:3469` epochs, `:3501-3510` `fee_model` |
| 4 | `SYSTEM_MANUAL.md` | `:423-427`, `:476-502` (#1010 banner), `:504` + `:784` (two copies of the B-4.5 banner), `:797-799`, `:1459`, `:5262` |
| 5 | Ledger + reports | `RUNNING_ISSUES` #133/#134 (+ 2026-09-11 amendment), #300, #301, #330, #398, #578, #682, #1010, #1011; `BATCH_CATALOG` P19-B4b.2 + B-CALSCORE; `DELETED_COMPONENTS_LOG.md:425-430`; `P19_B4b_2_SCOPE.md`, `P19_B4b_2_COMPLETION_REPORT.md` |
| 6 | Provenance | `bridge/canonical/DawnTrader_Mathematical_Architecture_v1.5.0.md` §8.3; `git log -S` on `spot_maker_fee`, `class SlippageFeeModelingService`, `avgFeesPerTrade > 0`, `markFill(` |

**Provenance findings.** Canonical v1.5.0 §8.3 (`:302-306`) modelled fees as a **positive cost per leg** (0.10 % taker each side) — the rebate concept never existed in the intended design, which is why every later rail and comment assumes `fee > 0`. `SlippageFeeModelingService` and the parity gate were both added on 2025-10-15 by Replit (`8f1911909`, `d1c15ac52`, "Phase 8.5 real-time execution layer") for paper realism. `fee_model` was born in B-4.5 (`dc93d9a6c`, 2026-06-10) on the account-wide-tier premise now overturned. `bridge/canonical/` has **no coverage** of maker rebates, per-product fee schedules or the boot rail.

## A1. What is stored today

- **`fee_model`** (4 rows, all `updated_by b45-tier1-seed`, `updated_at 2026-06-10 21:50:44`): crypto + xStock `spot_taker_fee 0.008` / `spot_maker_fee 0.004`. **Boot log 2026-09-11 11:19:30:** `[B45][warmup] fee_model verified: crypto taker=0.008 maker=0.004 | xstock taker=0.008 maker=0.004` — the rail runs on every boot.
- **`cost_model`** (5 rows, `b72-step3-commit-b`, 2026-05-05): `exchange '*'` `default_avg_return 0.005`; `exchange 'kraken'` `default_taker_fee 0.0026`, `default_slippage 0.0005`, `default_spread 0.0010`, `max_cost_bound 0.01`; all `asset_class/strategy/regime '*'`.
- **`calibration_epoch`** (6 rows): `live/* 2`, `paper_sim/* 2`, `paper_sim/xstock_spot 3`, `vts/* 3`, `vts/crypto_spot 5`, `vts/xstock_spot 6`. Boot log: `calibration_epoch verified: vts=3 paper_sim=2 live=2` (wildcard rows).
- **`maker_taker` haircut** (12 rows, all `updated_by p19-b7-2`): xStock `maker_fill_probability 0.50`, `adverse_selection_base 0.0010`, `non_fill_cost_base 0.0008`; seeded `hard_floor_continuation_strength 0.70` (`2026-07-01-p19-b7-2-maker-taker.sql:78`).
- **`system_context.maker_fee_pct` / `taker_fee_pct`:** NULL on both rows.
- **`calibration_ledger`:** 64 rows, all `xstock_spot`; fee rows `B.0 feeRateTaker 0.26 %` / `feeRateMaker 0.16 %`, `status baseline`, **`decision_grade true`**, seeded `2026-06-02b-calscore-comprehensive.sql:85-86`.
- **No database guard on sign.** `pg_constraint`: **0** CHECK constraints mention a fee (control: 76 CHECK constraints exist). Every fee column is signed `numeric` — `closed_trades.entry_fee/exit_fee/total_fee/fees (20,8)`, `entry_fee_rate (10,6)`, `active_open_positions.entry_fee (20,8)`, `vts_open_trades.entry_fee_rate (10,6)`, `system_context.maker_fee_pct (5,4)`.

## A2. The boot rail

`server/startup/b72-warmup.ts:219-249` — one loop over `['crypto_spot','xstock_spot'] × ['spot_taker_fee','spot_maker_fee']`, one check at `:237` `if (!(v > 0 && v <= 0.05)) throw`. `-0.0002` refuses boot. `:176-189` throws on any prefetched module that returns zero rows; `:46` carries `'cost_model'` in `PREFETCH_MODULES`. `:191-212` asserts the three **wildcard** epoch rows only. **No test covers the fee rail** — the three tests that read this file assert other literals (`b-xstock-feed-sanity-fence.test.ts:66-67` `book_state`; `p19-b-rename-w2-persisted-fence.test.ts:34` the epoch source list; `p19-b8-5j-max-hold-switch.test.ts:57` `max_hold_switch`). None asserts `cost_model`.

## A3. The resolver census (Langston F-1, F-2; binding condition OBJ-4)

- **Readers of `fee_model` rows: exactly two.** `cost-model.ts:114-120 resolveFeeRates` (the merge site) and `slippage-fee-model.ts:39-43 resolveFee`. (The 9 production lines naming `'fee_model'` resolve to these two, the warmup, and comments.)
- **`resolveFee` call sites: four, in two methods** — `:194`/`:195` inside `calculateFees`, `:321`/`:322` inside `getConfig`.
- **Every external consumer of the `slippageFeeModel` singleton** (repo-wide incl. scripts and client, any method): `pre-execution-validator.ts:136` `modelSlippage` and `:174` `calculateFees(orderValue, false, class)` — taker only. **`getConfig`: zero consumers.** Same for `modelTradeRealism` (`:213`), `getAggregateStats` (`:260`) and `updatePriceHistory` (`:301`).
- **State-write census for those four (§9.5(a-ii)):** the only state any of them writes is `priceHistory` (`:46`), written only by `updatePriceHistory` (zero callers) and **read nowhere** — `estimateVolatility` (`:150-167`) reads its `recentPrices` argument, never the map. `calculateFees`' optional `makerFeeRate`/`takerFeeRate` (`:191-192`) are never passed. `TradeRealism` (`:30`) has no importer outside the file.
- **`routes.ts:69` `import { slippageFeeModel }`** — the only occurrence of the name in `routes.ts`. Dead import.
- **The validator itself is dormant, and already homed:** callers are `routes.ts:4390` (`/api/trading/validate`) and `intent-executor.ts:449` — `#300`(b) coordinates its removal with `#297`/`#578`. So this batch consolidates the resolver on a dormant path and does **not** delete the validator.
- **Governance contradictions:** `SYSTEM_MANUAL.md:1459` lists `slippage-fee-model.ts` as `ACTIVE — Paper trade realism`; `SYSTEM_MANUAL.md:797-799` names it the paper realism model; `SYSTEM_IMPACT_MAP.md:3504` lists three consumers. `SYSTEM_MANUAL.md:504` **and** `:784` (the B-4.5 banner exists twice) say *"single fee merge site is now literally true across the codebase"* — false while `resolveFee` exists. `cost-model.ts:110-112` says maker *"has zero live consumers today"* — false since P19-B7.2.

## A4. Sign census (OBJ-5)

**Population:** every production line naming `feeRateMaker|spot_maker_fee|makerFeePct|makerFeeRate` at the ref — **46 `file:line`** hits, read with context — plus the booking functions those rates reach.

| site | what it does with a negative maker rate | verdict |
|---|---|---|
| `maker-taker-decision.ts:292-297` | advantage `(taker − maker) + …` grows; `makerFrictionPct = takerFrictionPct − advantage` falls | signed ✅ |
| `net-expectancy-kernel.ts:114-117` | `netEV = rawEV − totalFriction`; no clamp | signed ✅ |
| `cost-model.ts:176-178 composeBookedFriction` / `:212-214 composeSidedFriction` / `:163-165` | plain sums | signed ✅ |
| `signal-orchestrator.ts:1058/1074`, `ready_to_buy_service.ts:826/844`, `vts-runner.ts:1933/1953/2205/2220/2386/4496`, `xstock_spot/eval-cycle.ts:819/1015/1026/1232`, `pending-maker-logic.ts:140` | pass-through into the decision or `composeBookedFriction`; `entryFeeRate` stored in signed `numeric(10,6)` | signed ✅ |
| `vts-runner.ts:3371`, `:3870` VTS close | `netPnl = grossPnl − frictionCost` | signed ✅ |
| `active-execution-engine.ts:2419-2421` maker exit fill | `exitFee = notional × feeRateMaker` → **negative** | signed ✅ |
| `active-execution-engine.ts:3933-3936` pending-maker entry | `entryFee = limit × qty × feeRateMaker` → **negative** | signed ✅ |
| `active-execution-engine.ts:4121` | records the rate | signed ✅ |
| `active-execution-engine.ts:2480`, `routes.ts:12312` | `position.entryFee ? parseFloat(...) : estimate` — pg returns `numeric` as a string, so `"-0.00002000"` is truthy; only NULL/empty falls back | ✅ |
| `trade-pnl.ts:98-113 computeRealizedPnl` (engine close `active-execution-engine.ts:2510`, manual close `routes.ts:12938`) | `totalCost = entryFee + exitFee`; `netPnl = gross − totalCost` — a rebate raises net. Persisted to signed `total_cost numeric(20,8)` (`shared/schema.ts:1729`); client `paper-trade-adapter.ts:326` displays it | signed ✅ |
| **`trade-pnl.ts:73`** docstring *"EXPLICIT costs only (fees). Structurally cannot be negative."* | **becomes false** once a maker entry and a maker exit both book rebates; nothing enforces or branches on it | **comment** → P5 |
| `cost-model.ts:222-225 computePairFrictionIndex` | reads the **taker** fee (`:134`), capped above at 100; display telemetry only (`signal-orchestrator.ts:1320`, `vts-runner.ts:2292`) | unaffected |
| `routes.ts:12908`, `:12295/12316` | manual close / open display price the exit at **taker** | unaffected |
| `routes.ts:22513-22598` CSV + tax exports | signed arithmetic; a rebate lowers cost basis — correct accounting | ✅ |
| `c5-financial-diagnostics.ts:262` | `grossPnl − (entryFee + exitFee)` | signed ✅ |
| `pre-execution-validator.ts:189/198/405` | dormant path; override NULL → per-class rate; `roundTripFeePct = feeRate × 2 × 100` additive | signed ✅ (scope §6 item: no change) |
| `asset_classes/types.ts:25` `maxCostBound … (clamp on any single cost component)` | declared contract; enforced only on slippage and spread (`cost-cache.ts:112-113`) — already recorded as declared-not-enforced (`SYSTEM_IMPACT_MAP.md:3505`) | no change |
| `b72-warmup.ts:223-247` | the rail | **refuses boot** → P2 |
| `parity-gate.ts:117` `avgFeesPerTrade > 0` | the only positivity test | **inert** → §A7 |

**Positivity-test census** (`(fee|cost)… > 0|>= 0`, production, unbounded): `parity-gate.ts:117` is the only fee hit (control: the same form matches `book-state-config.ts:70`). **Negativity-refusal census** (`(fee|cost)… < 0|<= 0`, "negative fee/cost"): **none** (control: the same form matches `chat-container.tsx:259`). Legacy `trading-engine.ts:385/641` books fees from a hardcoded `0.0026`, never from a class rate — the engine runs in neither mode and is scheduled for removal (`#578`, plan row 11.5): cross-reference, not this batch.

⇒ **No production code between rate resolution and net P&L refuses, clamps or branches on a negative fee, except the boot rail and one inert gate. One docstring asserts non-negativity and is corrected in P5.**

## A5. Calibration epochs (OBJ-6)

Readers: `active-execution-engine.ts:2899 getCalibrationEpoch(_learnSource, _assetClass)` (paper_sim | live) and `vts-service.ts:1153 getCalibrationEpoch('vts', _assetClass)`. `calibration-epoch.ts:60-72` resolves most-specific-wins. ⇒ **an inserted `xstock_spot/live` row IS reached by xStock live closes**; crypto keeps resolving `live/* = 2`. The warmup assertion (`:199`) reads wildcards, which stay. **`ADJUSTMENT_FRAMEWORK.md:549-557` is silent that class-scoped rows exist** — rule 3 still says "Boot asserts all 3 rows" — which is the enumerator blind spot Langston named.
**Considered and NOT touched:** `scoreboard.epoch_started_at` (`storage.ts:3397-3439`) is the lifetime P&L window, one wildcard row, and by Kyle's ruling a deliberate act decoupled from system changes. Restarting it is Kyle's call, not this batch's.

## A6. Stored copies (OBJ-7) and Langston gap 2

- **`calibration_ledger` read side:** `routes.ts:8388-8410` serves it (`WHERE asset_class`, `ORDER BY display_order`); `client/src/pages/analytics.tsx:2697` **declares** `decision_grade` on the row type and **never reads it** — the render at `:2706-2790` shows setting, scope, metric, current/planned value and result, and status (control: the same file renders the unrelated computed `isDecisionGrade` at `:2360`). No server consumer; `scripts/` has no hit. ⇒ **nothing treats `decision_grade` as authority; it is not even displayed.** Writers: four migrations only (`2026-06-02`, `-02b`, `-02c`, `-10b`). `SYSTEM_IMPACT_MAP.md:2039` already records "pure display". Residual: the endpoint returns whole rows, so a human reading the API sees the field.
- **`cost_model`:** readers at the ref = the `PREFETCH_MODULES` entry only (control: `'fee_model'` 9 lines). `#133`/`#134` (B79.0n.MCE) own it; fold approved (F-3).
- **`system_context`:** NULL both rows — no action.

## A7. The parity gate (Langston F-5) — and a finding it exposed

**Read site:** `parity-gate.ts:50` `executionTiming.getMetrics(50)`; `execution-timing.ts:161-196` averages the in-memory `completedTimings` array — **class-blind, last 50**. That array is written only at `:142` inside `markFill` (`:114-130`); `clear()` (`:268`) only empties it.
**`markFill` has ZERO production callers** (call-form grep on `.markFill(|.markSubmit(|.markAck(|.markDecision(` across server/shared/scripts, any receiver; control: the same form finds `.recordMakerTakerDecision(` once; no test calls it). **Its last caller was `realtime-paper-executor.ts:134`**, the only caller at the parent of `977f3be08` (P19-B4b.2, 2026-06-16), which deleted that file. Its three readers survived: `parity-gate.ts:50`, `system-health-monitor.ts:303` (re-pointed at the buffer by the same batch — `DELETED_COMPONENTS_LOG.md:430`), and the CSV export `routes.ts:11345-11349`, which **refuses every call** because `execution-timing.ts:212-213` throws *"No execution timing data to export"* on an empty buffer.
⇒ **Population is empty by construction** (per process; no string-keyed or out-of-tree caller was found). `avgFeesPerTrade` is `0`, so check 5 always fails ("Fee modeling not active") and the gate can never pass; checks 1 and 2 pass vacuously on zeros. **No fee value can change its result ⇒ not a blocker for this batch.**
**Ledger search (§9.5(b-ii))** for `execution-timing|executionTiming|markFill|completedTimings` across `1-system-manual/`, completion reports and scopes: no record names the orphaned buffer; `SYSTEM_MANUAL.md:5262` and `:5878` still describe the service as live instrumentation. (`performance-monitor.ts:55` holds an unrelated buffer of the same name.) ⇒ **a real finding** (a removed writer whose readers survive) → filed **`#1041`**, disposition in Part C.

## A8. The instrument that will read Langston's F-4 prediction

- **In-memory:** `rtb-metrics-service.ts:432-438 getMakerPickProof` — 500 samples, **class-blind**, resets on restart. **Cannot read xStock on its own.**
- **Durable, and sufficient:** `switch_on_shadow_evidence` rows with `proof_type = 'maker_taker'`, one per orchestrator decision, carrying `asset_class` and `chosen_entry_mode` (`switch-on-evidence-sink.ts:96`, written at `signal-orchestrator.ts:1107` — before the SQE check at `:1126`, so the net-EV gate does not filter what it records).
- **Baseline, whole retained window, paper:** **xStock maker 422 / taker 1,276 — 24.9 % maker of 1,698** (2026-07-15 → 2026-09-11). Crypto maker 876,075 / taker 30,728 (96.6 % maker). Control: 908,501 `maker_taker` rows in total.
- **Why the direction is determined, not guessed:** both decision sites run `levelGeometry: 'mid'` with the maker entry equal to the taker entry (`signal-orchestrator.ts:1069-1070`, `ready_to_buy_service.ts:823-824`). After the fix the taker arm's net EV rises by `0.014 × entry` and the maker arm's by `pFill × 0.0112 × entry` = `0.0056 × entry` (xStock `maker_taker.maker_fill_probability = 0.50`). The maker-minus-taker margin therefore falls by `0.0084 × entry` at every decision; ties go to taker (`maker-taker-decision.ts:343`, strict `>`), so every decision where maker led by **at most** `0.0084 × entry` flips to taker and none flips the other way. The hard floor (`:335-341`) only ever forces taker, and cannot fire at seeded values (xStock strength = `scoring_base.flat_pwin_base 0.317` against `hard_floor_continuation_strength 0.70`).
- **Reach limit:** the sink records orchestrator decisions only; RTB-refresh re-decisions (`ready_to_buy_service.ts:817`) and VTS decisions are not in it. **Would stop holding** under a future `'sided'` switch, where the maker arm is priced off a different entry.

## A9. OBJ-9 — what the wrong fee did to xStock ranking (run at Step 2, read-only)

**Query:** `scripts/analysis/b_xstock_fee_contract_obj9_rerank.sql` (SELECTs only), run 2026-09-11 15:50Z. Every number below comes from that one file.

**Ranker, verified two ways:** `ready_to_buy_service.ts:1806-1808` ranks on `chosenNetEv / |entry − stop|` (null snapshot → the taker-only `netRewardToRisk`), sorted descending at `:1883-1884`; in the 2,000 most recent multi-member cycles, rank 0 equals the maximum `predicted_r_multiple` in **2,000 / 2,000** (control: `final_score` 0 / 2,000, `ranking_score` 0 / 2,000).

**Population:** every shadow-pool cycle holding ≥ 1 xStock member — **1,514 cycles**, **all paper** (the pool tables hold no other mode), 2026-07-16 → 2026-09-11 15:50Z; every xStock member joinable to its pairing with entry and stop; **0** null R. **Completeness, all 0:** cycles missing their rank-0 row · fewer member rows than the stamped `pool_size` · more rows than `pool_size` · duplicate `promotion_rank` · more than one mode. **832** cycles have more than one member; **173** were led by a crypto pick as recorded, **1,341** by an xStock (659 of those with challengers).

**Why the bound is per member, and per cycle.** Each xStock member's corrected R lies in `[R + lo, R + hi]`, with `lo = 0.5 × 0.0112 × entry / risk` and `hi = 0.014 × entry / risk`. A member whose recorded arm was taker — including a null-snapshot member on the taker-only fallback — moves by exactly `hi`; a maker-arm member by `max(lo, hi − margin)`. **Shadow pool rows do not record the arm** (`ready_to_buy_service.ts:2020-2044`), so only the interval is known. Crypto R is unchanged.
- **Crypto-led cycle** (leader fixed): rank 0 changes **for certain** if some xStock has `R + lo` above the leader, and **possibly** if some xStock has `R + hi` reaching it.
- **xStock-led cycle** (leader moves too): **certain** if some other xStock has `R + lo` above `leader + hi`; **possible** if some other xStock has `R + hi` reaching `leader + lo`. A crypto challenger cannot overtake an xStock leader: every xStock shift is positive, so the leader only rises.
- **Ties and rounding.** An exact tie is settled by the order the queue was read in (`storage.ts:4401-4404`, then the stable sort at `:1884`), **not** by recorded rank — so POSSIBLE must accept equality. R is stored to 4 dp, so each recorded R is only good to ±0.00005: **CERTAIN requires a margin above +0.0001; POSSIBLE accepts a margin of −0.0001 or more.** Two cycles hold a challenger within 0.0001 of the leader; neither count moved when the tolerance was applied.
- **CERTAIN is sufficient and POSSIBLE necessary however many xStocks share a cycle** — CERTAIN takes each member's worst case independently, and no challenger can reach the leader's floor unless its own ceiling does. Correlated arms can only make POSSIBLE loose, never too small.
- **Control:** at zero shift no member outranks the recorded leader in any of the 1,514 cycles.

| rank 0 as recorded | cycles | change CERTAIN | change POSSIBLE |
|---|---|---|---|
| crypto | 173 | **150** | **165** |
| xStock | 1,341 | **12** | **174** |
| **all** | **1,514** | **162 (10.7 %)** | **339 (22.4 %)** |

By month (cycles / certain–possible): July 548 / 69–203 · August 744 / 47–80 · September 222 / 46–56. **Size of the shift (r1 run):** median **+0.23 R to +0.57 R** on xStock members whose median recorded R was **0.058** (51 of 3,753 recorded negative; cause not established here).

**Reading it:** where a crypto pick held rank 0 beside an xStock candidate, the correct fee would have handed rank 0 to the xStock in **150 to 165 of 173 cycles**. Among xStock-led cycles the ordering between xStocks is mostly indeterminate from this data (12 certain, 174 possible).

**Pre-registered limits (Langston ruling 4, plus both reviewers'):**
(i) **A LOWER BOUND on reach** — xStock candidates refused at the SQE net-EV gate (`signal_quality_evaluator.ts:362`, `:571`) or evicted at refresh under the wrong fee never entered the pool.
(ii) **Pool membership is itself fee-dependent, through two channels** — the duplicate tiebreak keeps the incumbent when `existingR >= newR` (`ready_to_buy_service.ts:2207`), and the pair guard drops every symbol that already holds an active trade (`:1836-1840`), and which trades were open depended on earlier fee-priced promotions. So the counterfactual pool is not the recorded pool — for CERTAIN as well as POSSIBLE.
(iii) Rank 0 only — with more than one open slot a displaced crypto pick may still have been promoted, and `promoted` is the ranker's choice, not an executed trade.
(iv) The recorded R may come from an older decision snapshot: refresh re-decides only when geometry is recalculated (`:774`) and keeps the old snapshot on failure (`:847-848`). The interval still holds, because the fee rows have been unchanged since 2026-06-10 (A1) and pFill since `p19-b7-2`, both before the pool's first row (2026-07-14). How many xStock members sat on the null-snapshot fallback is not measurable from the shadow tables; their shift is exactly `hi`.
(v) Assumes `'mid'` geometry at both decision sites (A8).
(vi) **No outcome claim.**

## A10. Tests (OBJ-8)

**16 files** name fee rates (unbounded, at the ref); **10** mention `xstock_spot`:
- **SUBJECT — assert the xStock rate itself, corrected:** `b45-fee-model.test.ts:46-49, 66-68`; `cost_cache.test.ts:20, 30-31`.
- **PROBE — seed fixtures for other invariants, re-pointed to named per-class constants, never blind-swapped:** `b79-0n-mce-costmodel-perp-failhard.test.ts:33-36`, `b79-0n-mce-required-assetclass.test.ts:36-39`, `b79-0n-mce-required-assetclass-getcachedcostmetrics.test.ts:32-35`, `directive-11.4C-R2.test.ts:23-26`, `b5-amr-body.test.ts:150-152`.
- **Kept as-is:** `p19-b7-2a-fee-consolidation.test.ts` uses a deliberately diverged xStock taker (`:37`, `:98`) to prove live re-read — a probe that must not be "corrected"; `fg2-obj5-vts-cost-truth.test.ts:23-24` class-generic constants; `b79-0n-execution-audit.test.ts:119` comment only. The 6 crypto-only files are untouched.
- **Absent today:** any test of the boot rail, of a negative fee through booking, or of `calculateFees` reading the merge site.

## A11. Deploy mechanics

`scripts/dt-deploy.sh:35` `set -euo pipefail`; `:222-224` `npm run db:migrate` between build and `:234` `pm2 restart`. `scripts/db-migrate.ts:173-201` runs each file as one query (files carry their own `BEGIN/COMMIT`), throws on error, and records `_migrations` by **name** (a `checksum` column exists at `:68` and is never compared). ⇒ **a failing post-condition inside the migration rolls the transaction back, fails `db:migrate`, and stops the deploy before restart** — old code keeps running against unchanged rows. There is **no rollback verb**. Editing an applied file's comments does not re-run it.

## A12. Governance contradictions and silences (→ P10)

`SYSTEM_IMPACT_MAP.md:3502` ("identical by construction: account-wide tier"), `:3504` (consumer list) · `SYSTEM_MANUAL.md:427` ("fee wall affects BOTH classes similarly … identical 0.8 % taker"), `:504` + `:784` ("literally true across the codebase"), `:797-799` and `:1459` (slippage-fee-model status), `:5262`/`:5878` (execution-timing live) · `KRAKEN_FEE_SCHEDULE_REFERENCE.md:93` ("WE DO NOT IMPLEMENT IT") · `ADJUSTMENT_FRAMEWORK.md:549-557` (silent on class rows) · `drizzle/migrations/2026-06-11-b45-fee-model-tier1.sql:11-24` (three false premises in its header).

---

# PART B — IMPLEMENTATION PLAN

Every item names the finding it falls out of. **Nothing below is `UNAUDITED`.** One verification dependency is named in P5.

**P1 — Rates + corrective migration** *(A1, A11; OBJ-1, OBJ-3; ruling 2)*
New `drizzle/migrations/<date>-b-xstock-fee-contract.sql`, one `BEGIN … COMMIT`, registered in `MANIFEST.txt`:
- `UPDATE module_constants SET value = '0.0010'::jsonb, updated_by = 'b-xstock-fee-contract' WHERE module_name = 'fee_model' AND exchange = '*' AND asset_class = 'xstock_spot' AND strategy = '*' AND regime = '*' AND constant_name = 'spot_taker_fee';` — **unconditional**, no `WHERE value = …`. Same for `spot_maker_fee` → `'-0.0002'`.
- **Post-condition** `DO $$ … RAISE EXCEPTION … $$`: the xStock pair reads exactly `0.0010 / -0.0002`, the crypto pair still `0.008 / 0.004`, and each of the four rows exists once. A failure aborts the deploy before restart (A11).
- **Banner** prepended to `2026-06-11-b45-fee-model-tier1.sql`: the xStock rows it seeds are superseded by this migration; the account-wide-tier premise and the "zero live consumers" / "asymmetric failure" claims are false (cite `#1010`). Comment only — it never re-runs (A11). A fresh DB runs the seed, then this UPDATE, and ends correct.

**P2 — The boot rail, in code** *(A2; OBJ-2; ruling 1)*
`b72-warmup.ts:219-249`: named constants `FEE_RAIL_MAX = 0.05`, `MAKER_REBATE_FLOOR = -0.001`. Inside the loop, branch on the loop variable: taker must be finite and in `(0, 0.05]`; maker finite and in `[-0.001, 0.05]`. **After the loop, per class, off the `fees` map:** `maker <= taker`, else refuse. Log line unchanged in shape, signed values.

**P3 — One resolver + dead-code removal** *(A3; OBJ-4; F-1, F-2; rule 18)*
- `slippage-fee-model.ts`: delete `resolveFee`; `calculateFees` reads `getFrictionForAssetClass(assetClass).feeRateMaker/feeRateTaker`; drop the never-passed optional rate params. All four `resolveFee` sites go (two by rewrite, two by deleting `getConfig`).
- Delete, with zero callers and no surviving reader of any state they write: `getConfig`, `modelTradeRealism`, `getAggregateStats`, `updatePriceHistory`, `priceHistory`, `VOLATILITY_WINDOW`, `TradeRealism`.
- Delete `routes.ts:69`.
- Fix `cost-model.ts:110-112`.
- `DELETED_COMPONENTS_LOG.md` entry (what / why / blast radius = §A3 census / archive `1-system-manual/_archive/deleted-code/slippage-fee-model-dead-methods.ts.removed` / commit). **Kept on purpose:** `modelSlippage`, `calculateFees` — the dormant validator still calls them; its removal belongs to `#300`(b)/`#297`/`#578`.

**P4 — The other stored copies** *(A6; OBJ-7; F-3; Langston 15:03Z)*
- Same migration: `DELETE FROM module_constants WHERE module_name = 'cost_model';` (5 rows) + remove `'cost_model'` from `PREFETCH_MODULES` (`b72-warmup.ts:46`) in the same commit. **Close `#133` and `#134`.**
- Same migration: `calibration_ledger` xStock `feeRateTaker` → `'0.10%'`, `feeRateMaker` → `'-0.02%'`, notes cite the venue schedule (2026-09-06) and `#1010`, `updated_at = now()`. `decision_grade` stays — nothing reads it as authority (A6), and the values become account-confirmed.
- **Rollback — an operator runbook step, not a promise.** Committed `drizzle/migrations/<date>-b-xstock-fee-contract-rollback.sql` (never in `MANIFEST.txt`), with the literal SQL: re-insert the five `cost_model` rows exactly as A1 lists them (`module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by`); restore xStock `0.008 / 0.004`; step the two bumped xStock epochs back and delete the `xstock_spot/live` row; restore the two ledger rows. **Runbook line in the completion report and the deploy note: run the rollback SQL BEFORE `dt-deploy` of any pre-batch sha — `dt-deploy` migrates forward only (A11), and pre-batch code refuses boot on an empty `cost_model`.**
- **Deploy-note line (Langston 15:03Z):** between `db:migrate` and `pm2 restart` the old process keeps running, already warmed; if anything restarts OLD code inside that window (crash-restart, a failed restart) it refuses boot on the empty module. Not a gate.

**P5 — Negative fee through booking, locked** *(A4; OBJ-5)*
No production logic changes on the sign path (A4). **Correct the `trade-pnl.ts:73` docstring:** totalCost is signed and negative when both legs book maker rebates. New locks with xStock maker `-0.0002`: `computeRealizedPnl` (a negative entry fee → net = gross − (entry + exit), higher than at zero fee; both legs maker → negative `totalCost`); `composeBookedFriction` with a maker entry; `decideMakerTaker` (both arms priced, advantage `0.0012 + slippage [+ spread]`); `resolveValidatorFeeRates` passes a negative through. The two engine formulas (`:2419-2421`, `:3933-3936`) are verified at Step 7 on real rows: **`closed_trades.entry_fee < 0` or `exit_fee < 0` on an xStock maker fill after deploy.** ⚠️ **Verification dependency:** that needs paper xStock to open a maker trade after deploy; if none has by Step 7, the step says so rather than passing it.
`parity-gate.ts:117` **untouched** — its population is empty (A7); the instruction *do not re-encode "fees are positive"* is carried on `#1041`.

**P6 — Epoch boundary, xStock only** *(A5; OBJ-6; ruling 3)*
Same migration: `vts/xstock_spot 6 → 7`, `paper_sim/xstock_spot 3 → 4` (template `2026-09-02-fg2-obj5c-vts-epoch-bump.sql`, idempotent via `updated_by`), `INSERT … ('calibration_epoch','*','xstock_spot','*','*','live','3'::jsonb,'b-xstock-fee-contract') ON CONFLICT DO NOTHING`. Crypto and wildcard rows untouched; the post-condition asserts all seven expected values. **`ADJUSTMENT_FRAMEWORK` CALIBRATION EPOCHS:** record that class-scoped rows exist (list them) and that a shared-substrate bump must **enumerate class rows, not `*`**; amend rule 3 (the boot assertion reads wildcards; class rows are read by `getCalibrationEpoch(source, assetClass)`). The completion report carries old → new per rule 2.

**P7 — Tests** *(A10; OBJ-8)*
Correct the two SUBJECT files; re-point the five PROBE files to named per-class constants; leave the three kept files alone. **New:** a rail suite (accepts `-0.0002`; refuses `-0.0011`, maker > taker, `NaN`, `Infinity`, taker `0`); `calculateFees` reads the merge site (seed a diverged xStock taker, assert it is used); the P5 locks; a migration fence asserting the corrective UPDATE carries no value predicate and the post-condition block exists.

**P8 — The prediction and its instrument** *(A8; F-4)*
Pre-registered in this document: **the xStock paper maker share of orchestrator decisions falls below the 24.9 % baseline (422 / 1,698) after deploy.** Read from `switch_on_shadow_evidence` (`proof_type = 'maker_taker'`, `asset_class = 'xstock_spot'`, `captured_at` after the deploy instant) once **≥ 300** decisions exist. **Falsified if the share is ≥ 24.9 % at ≥ 300.** Direction only — other inputs move over the same weeks.

**P9 — OBJ-9 is delivered by this document** *(A9; ruling 4)*
Numbers, method, query and limits are in A9; they go into the completion report and to Kyle in plain language, with the r1 → r3 correction stated (§0 row 9). No deploy item.

**P10 — Governance** *(A12; Langston gaps 1 and 2)*
Governance set = scope §7 **plus `DELETED_COMPONENTS_LOG.md` and its `_archive/deleted-code/` entry** (gap 1). Content edits: every A12 item — including **both** copies of the B-4.5 banner at `SYSTEM_MANUAL.md:504` and `:784`, the `#1010` banner folded into §5's body, `KRAKEN_FEE_SCHEDULE_REFERENCE.md:93` → implemented, `SYSTEM_IMPACT_MAP.md:3502-3504` rewritten from §A3, and a note at `SYSTEM_MANUAL.md:5262` pointing at `#1041`. Gap 2 is closed by A6.

**P11 — Order of work + board**
Step 3 lands P2, P3, then P1/P4/P6 (one migration + one rollback file), then P5's docstring + P7, with one change list. Card `Blocked on = Langston` at each dispatch.

---

# PART C — FINDINGS OUTSIDE THE SCOPE, EACH DISPOSITIONED (§9.4)

| finding | disposition |
|---|---|
| **`#1041` — the parity gate and the health snapshot read a timing buffer nothing has written since 2026-06-16** (A7) | **2 — added as a named item to `P19-B12` (Diagnostics + internal-health monitoring), owner CC-B**, written into that plan row. Carries: do not re-encode "fees are positive" when the gate is rewired. |
| **`T-W20C-SCALAR-LEG`** (alert `a3610acf`, routed to CC-B by Langston) | **3 — own item, placed in `PHASE_19_PLAN` as row 2.4-FEE-c**, after 2.4-FEE-b (which stays immediately after 2.4-FEE per the earlier ruling). Re-scope first: July aged out of rolling-30 retention. |
| **`#682 B-FILTER-DIAG-XSTOCK` had no plan row** (0 hits in `PHASE_19_PLAN`; its entry carried `DUE: 2026-08-12`) | **3 — placed as row 2.4-FEE-d**, after 2.4-FEE-c; `#682` entry amended to point at the row. |
| Legacy `TradingEngine` hardcodes `0.0026` (`trading-engine.ts:385/641`) | **5 — no new work**: `#578`, plan row 11.5 removes the engine. |
| Validator prices both legs at one mode (`pre-execution-validator.ts:198`) | **5 — no new work**: dormant path, `#300`(b) coordinates its removal. |
| `scoreboard.epoch_started_at` not restarted for xStock | **5 — no work**: Kyle's deliberate act by his own ruling (`storage.ts:3397-3403`). |

---

# PART D — REVIEWER RECORD

`REVIEWER r1a: claim-only · three absence claims (no fee-sign assumption on the booking path; the timing buffer has no writer; nothing uses decision_grade to decide) · no counter-state to the three claims as bounded; leads: trade-pnl.ts:73 docstring, CSV export throws rather than exporting empty, display index cost-model.ts:224, maxCostBound contract types.ts:25, VTS close lines · re-derived y (all at 56599ad6d) · changed: A4 rows added, A7 CSV wording, P5 docstring fix, #1041 wording`

`REVIEWER r1b: object · A8 direction + A9 bounds + the r1 SQL · HIT: shifting every xStock member by one bound does not bound xStock-led cycles; plus membership fee-dependence (:2207), R vintage (:774/:848), 'mid' assumption, ties to taker (:343), member completeness · re-derived y (per-cycle certain/possible re-run; zero-shift control 0; rank-0 row missing 0; short rows 0; cited lines read at 56599ad6d) · changed: §0 row 9, A8 wording, A9 rewritten, limits added`

`REVIEWER r2: object · r1b's six called-out items at 4e7f584b5 · items 1, 3, 4, 5 satisfied; 2 recorded but a second membership channel unnamed (pair guard :1836-1840); 6 partly (no over-count / duplicate-rank / mode checks); NEW: exact ties settle by queue read order not rank ⇒ POSSIBLE must accept equality, and 4-dp storage needs a tolerance; null-snapshot members uncounted; the ranker-order check was not in the supplied query; §0 row 9 misattributed the population growth to the method · re-derived y (pair guard and queue order read at 4e7f584b5; r3 query with tolerance, >= and all completeness checks: counts unchanged at 162 / 339, all checks 0, two cycles with a 4-dp tie) · changed: §0 row 9 reason, A9 ties/rounding/completeness/query, limits (ii) and (iv), query committed`

**Rounds: three reviews over two correction cycles.** The final round read the object at the ref. No finding in this document rests on a reviewer's clean.

---

## PLAIN-LANGUAGE SUMMARY

**What the audit found.** The fix is as scoped, and smaller in one place: nothing between the fee and the final profit number refuses or trims a negative fee, so Kraken's rebate flows through once the server's startup check stops rejecting it (one code comment claiming costs can't go negative gets corrected). The second fee reader is on a path that isn't running, and most of that file is dead code, so it gets tidied rather than rebuilt. Langston's worry about the go-live readiness check turned out to be a different problem: that check has had nothing to measure since June, so it can never pass whatever the fee is — filed separately.

**What the wrong fee did.** Among the 1,514 ranking rounds where an xStock was a candidate, the correct fee would have changed the top pick in **at least 162 and at most 339 (11–22 %)**. The clearest part: in the 173 rounds a crypto pick led beside an xStock, the xStock would have taken the top spot in 150 to 165 of them. That is still the smallest the effect could be, because xStock candidates the wrong fee filtered out before they reached the pool can't be counted.

**The plan.** Set the two xStock rates, let the startup check accept a small rebate, point everything at one fee reader, delete the dead cost settings, mark the change date for xStock learning only, and fix the tests. Afterwards we expect xStock to choose resting orders less often than today's 25 % — and we will measure it.
