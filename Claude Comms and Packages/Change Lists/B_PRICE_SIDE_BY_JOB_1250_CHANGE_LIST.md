# B-PRICE-SIDE-BY-JOB `#1250` — Step-4 CHANGE LIST (CC-C)

## Dispatch header (workflow-04, three fields)
| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (the batch's class; `#1250` scope line 3) |
| ii | **DOC SET (architecture)** | SCOPE — present, `Scope Files/B_PRICE_SIDE_BY_JOB_1250_SCOPE.md` (r2) · PRE_AUDIT — present, `Scope Files/B_PRICE_SIDE_BY_JOB_1250_PRE_AUDIT.md` (§1-§9) · COMPLETION_REPORT — absent, Step 11 · BATCH_CATALOG, PHASE_HISTORY — absent, Step 10 · SYSTEM_MANUAL (`:731`/`:750` the xStock level basis + the per-leg rule + the floor at the fill + the economics change) and SYSTEM_IMPACT_MAP (open path, the stamp hop, `mergeClosedTradeMetadata`) — absent, Step 10 = P9 · RUNNING_ISSUES `#1250` — Step 10 · `SPRINT_TO_LIVE_PLAN` row 17 — Step 10 · `PRE_LIVE_SPRINT` item (post-fill refusals in live, §7.3(c)) and the `8c` item (A4 park) — Step 10 |
| iii | **STEP-2 REFERENCE** | pre-audit §9 — Langston PROCEED r4, Discord `1568677973609947248` (r1-r3 records §6-§8) |

**Seven Step-3 commits, one per plan item, on `origin/migration/aws-supabase`. 27 files, +1008 / −25.** tsc = baseline. **121 new `#1250` tests**; unit suite otherwise green apart from the local-environment failures that fail identically at the head without this diff.

## Item map (plan → code)
| P | what shipped | where |
|---|---|---|
| P1 | `rebaseLevels` (pure): four forms; a mixed leg `{op, terms}` re-derives BOTH terms and re-applies the operator (B-6); self-consistency per leg against the ARRIVING plan within one tick (B-7) — a failing leg keeps the plan and is reported; re-based legs rounded by role with `roundPriceForRole`, the cap toward entry (C-2); refuses non-finite / non-long output. **Absent stamp ⇒ every leg anchor ⇒ nothing moves.** | `core/trading/level-rebase.ts` |
| P0 | **All 18 members stamp `levelSpec` at the branch that built the level** (C-1: the five mixed legs — `vwap_pullback` default target, `abcd_long` trailing target, `pivot_shift` stop, `adaptive_flow` stop, `volatility_edge` target — carry `{op, terms}` with the term values; `r` stamped explicitly). | `strategy-engine.ts` (9), `strategies/*.ts` (9) |
| hop | `levelSpec` rides `strategySignal.metadata` → `dispatchXstockActiveSignal` input → `rawSignal.metadata` → the RTB row (`...(input.metadata || {})`) → `signal.metadata` at `processSignal`. | `eval-cycle.ts`, `active-dispatch.ts` |
| P2 | In `executeSimulatedTrade`, **taker arm, `_openClass === 'xstock_spot'`**: carried levels in locals; `signal.*` never mutated. Shadow, window and `refuseTakerBooking` keep `signal.*`; `computeFillEconomics` receives `stopPrice: _carriedStop, targetPrice: _carriedTarget`; both durable writes, the OPEN log, the admitted archive, both broadcasts, the OPENED execution audit and `riskAmount` read the carried locals (equal to the plan on every other path, since they start as `signal.*`). | `active-execution-engine.ts` |
| P2b | `netEvAtFillPlanGeometry` + `fillEconRefusedPlanGeometry` recorded beside the deciding EV on xStock taker opens. | same |
| P3 | After the `ENTRY_WINDOW` return, before the economics refusal: `LEVEL_REBASE_INVALID`, then `STOP_DISTANCE_AT_FILL` (`validateStopDistance(actualEntryPrice, _carriedStop)`, xStock only — the rounded carried stop), through `_refuseLevelAtFill` (logged, `recordOpenFailed`, `entry_fill` archive row carrying the shadow, the EVs and the plan stamp). Two `OpenFailStage` values. | engine, `rtb-metrics-service.ts` |
| P4 | `closed_trades.metadata` = signal metadata (incl. `levelSpec`) + `planEntryPrice`, `planStopLoss`, `planTakeProfit`, `stopBasis`, `targetBasis`, `levelBasis` (`fill_rebased` \| `plan`), `levelSpecStamped`, `levelSpecInconsistent`. Absent ⇒ written before `#1250`. | engine |
| P5 | VTS xStock taker (`eval-cycle.ts`): after the window — `rebaseLevels` unrounded (this lane books unrounded, §8.2), refusals `level_rebase_*` / `stop_distance_at_fill` through `_xRefuseBooking`; the VTS trade carries the carried levels and `levelRebase` (persisted to `vts_open_trades.context`); the **admitted archive `gateDecision.levelRebase`** is the Step-7 VTS read. `stopLoss`/`takeProfit` stay the plan for the active dispatch. | `eval-cycle.ts`, `vts-runner.ts` (type + register) |
| P6 | `2026-11-08-b-price-side-1250-xstock-epoch.sql` (+ rollback, MANIFEST last): `xstock_spot/paper_sim` and `xstock_spot/vts` +1, every other epoch row asserted against its pre-image. | drizzle |
| P7 | `entryObservedAgeMs` on the resting xStock fill = fill instant − `provenance.observedAtMs`, via a new **`storage.mergeClosedTradeMetadata`** (jsonb `||`, mode-scoped, returns row-matched) — never a metadata SET, which would erase the open's keys. `entry_book_age_ms` untouched (option (b) refused). | `storage.ts`, engine |
| C-2 | The orchestrator's rounding reads the cap bit from the stamp. | `signal-orchestrator.ts` |
| P8 | Fences — see below. | 4 test files |

## The fences (P8)
- **Counterfactual invariance (fence 1), `b1250-level-spec-counterfactual`:** for each of the 21 strategy-branches, the test **pins the source lines** that build entry/stop/target (so what is evaluated is what runs), evaluates them twice with only the decision price moved (3 seeds, both directions), classifies each term (anchor 0, distance 1:1, proportional ratio, r_multiple with the risk) and **pins the stamp literal in the same source**. Mutation control: a distance construction classified as anchor fails. ⚠️ **It reads the construction EXPRESSIONS, not a fixture run of the whole strategy** — a strategy fixture that passes every gate was impractical across 18 strategies; the expressions are the object the stamp describes. Branch SELECTION is not exercised (each branch is a separate case). Narrowed claim as you ruled: equivalent forms are not separated.
- **Membership (fence 2):** the case table equals the 18 members, both sides through `resolveCanonicalStrategy`.
- **Argument provenance per call site, the gate, the refusal order, the hops, the cap bit** (`b1250-engine-wiring`), including **a doubly-refusable input** (plan stop 0.305 % distance, fill 1.8 % above plan: both the window and the floor would refuse; the source order makes the window report it).
- **Helper** (`b1250-level-rebase`, 20) and the **three remaining mixed-leg flip fixtures** (C-1).
- **Re-pointed:** `b-entry-distance-guard` (5 shadow-carrying archive rows — the new refused row carries it), `b-sizing-inc2c-risk-retired` (`riskAmount` on the carried stop).

## Deviations from the plan, stated
1. **C-2 keeps the name equality for an UNSTAMPED signal only.** A HYBRID rebuild (`signal-orchestrator.ts` hybrid path) creates fresh metadata without the strategy's stamp; stamp-only would silently flip an unstamped `volatility_edge` to floor rounding. Stamp present ⇒ the stamp decides.
2. **P5's VTS stamp lands on the admitted archive and the open row's `context`, not on the closed VTS JSON** (that record has an explicit field list; threading it would touch three more types). §3(a3) reads the admitted archive.
3. **`dhma` is stamped `distance`** though its levels are `currentPrice ∓ k·vol` and its entry `currentPrice × premium`: the re-base shifts by `fill − plan` where the construction would shift by `(fill − plan)/premium` — a difference of the premium (≈0.05 %) of the shift. Fence 1 passes it at 5e-3.
4. **P7 lands in `metadata`, not a column** — as the pre-audit A8 said; the merge helper is new.

## Judgement calls — attack these
1. **Fence 1 on expressions rather than fixtures** (above) — is that the object, or an adjacent one?
2. **The fill-economics change ships deciding on the carried geometry** (§7.2, dominant direction tighter); flips are counted from P2b at Step 7, not estimated.
3. **The floor check runs on EVERY xStock taker open, re-based or not** — that is A11's population (anchored stops); a stamp-less strategy is still floor-checked.
4. **A self-consistency failure keeps the plan and counts** rather than refusing the open — the fail-safe direction is today's behaviour, and §3 names its expected count as 0.

## Pre-registered Step-7 read
Pre-audit §3 as amended by §7.5 and §8.3 (taker rows by realised `entryArm`; ≤ ~10 % `STOP_DISTANCE_AT_FILL` of window-admitted taker opens, FAIL = zero over ≥ 50; `LEVEL_SPEC_INCONSISTENT` = 0; flips both ways; active at one tick, VTS at 1e-9, not pooled).
