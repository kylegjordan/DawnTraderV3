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

## Step 7 first look — 2026-11-10

**Boundary.** Deployed `1d4be9cf7c27ab337dd68e660a56a89b737d27f0` at `2026-11-07T19:06:27Z`. This is the alert `0c5f81ac-be2d-4d68-8e47-1a97d7079356` first look after the first US session, not the registered five-session verdict. The Chrome Open Trades leg remains **UI not yet checked — waiting on Kyle** under the Codex handover rule.

### 1. Durable paper taker open — PASS for the first observed taker

Population: all three `closed_trades` xStock paper opens with `opened_at >=` the deploy boundary. The realised taker object is the durable fill producer `xstock_ticker_snap_walk`; the other two rows use `kraken_equities_ws_mid` and are the maker controls.

| population | n | result |
|---|---:|---|
| post-deploy xStock paper opens | 3 | TSLA maker, SPG taker, TGT maker |
| realised taker opens | 1 | SPG/USD, `13fa3943-e1e2-4737-8168-acc06d2d4290`, opened `2026-11-09T18:38:47.064Z` |
| taker rows with `levelSpec`, `levelBasis`, all three plan prices, and stop/target bases | 1/1 | PASS |

SPG booked at entry `233.30000000`, stop `231.12392857`, target `237.65214286`; its plan was entry `233.515`, stop `231.33892857`, target `237.86714286`. Both bases and `levelBasis` are `fill_rebased`. Recomputed stop-distance error and target-distance error are both exactly `0.000000000000` over this one taker row. The two maker controls carry the strategy's `levelSpec` and no fill-rebase metadata, which is the intended non-taker boundary.

### 2. Entry-fill refusals — zero in the first-look population, instrument controlled

Population: every post-deploy xStock `signal_eval_archive` row at `reject_stage = entry_fill`. Total rows: **0**; therefore `STOP_DISTANCE_AT_FILL`: **0/0**, and `LEVEL_REBASE_*`: **0/0**. Positive control using the same table and stage before deployment (`2026-11-05T00:00:00Z` to the deploy boundary) returns one BABA/USD `entry_fill` refusal at `2026-11-05T15:21:23.805Z`, reason `ask_at_or_through_stop`. The zero is therefore a readable first-look observation, not the registered PASS: the five-session gate still requires its stated denominator and must not pass on zero opportunities.

### 3. VTS admitted evidence — present on the effective taker arm

Population: 536 post-deploy xStock VTS admitted archive rows. **252/536** carry `gateDecision.levelRebase`; **252/252** of those have an empty `levelSpecInconsistent` set. Their capture window is `2026-11-09T01:16:20.858Z` through `2026-11-10T08:57:06.379Z`; basis split is `fill_rebased` **244/252** and `plan` **8/252**.

The carrier is `gateDecision.levelRebase`, not `gateDecision.chosenMode`: a marketable maker choice can convert to the effective taker path after the policy choice. This first look therefore selects the rows by the rebase object that only that effective path writes, rather than by the earlier policy label.

### First-look disposition

- Non-UI evidence legs 1-3: **PASS at first look**, with the limited populations above.
- Chrome Open Trades stop/target leg: **WAITING ON KYLE; not checked by Codex**.
- Formal Step 7: **still open** through the registered five complete US sessions; alert `ac78c006` owns that read.
- Alert `0c5f81ac`: resolved by `codex-c` at `2026-11-10T11:26:56.421Z` with evidence commit `57c6077675052b279cf240ac4d3195475a8cd6fe`; CI run `42807070563` passed all four jobs. This resolution closes the first-look reminder, not Step 7.

## Row 2 increment (4a) — INIT/USD self-clearing alert inspection, 2026-11-10

Alert `2d0884e4-9d30-4fe2-9aec-130bc10bb482` remains **active and unacknowledged**. Its one durable row was created at `2026-11-10T10:41:58.726Z` and fired at `10:49:32.090Z`; the exact VTS trade `vts_INIT_USD_vwap_pullback_1794304799204` remains open (`opened_at 09:59:59.206Z`, entry `0.15569714`, stop `0.06381143`, target `0.43135429`).

The live price-cache diagnostic at `11:19:45.541Z` showed INIT/USD mark `0.1556`, source `kraken_rest`, refreshed at `11:19:11.507Z`; that diagnostic does not expose the cached bid and ask. The separate durable ticker archive, used here as the side witness rather than mislabelled as the cache, showed repeated two-sided but implausibly wide books: the latest archived row at `11:14:00.886Z` was bid `0.1460`, ask `0.1556`, spread **6.3660%**; the 20 archived observations from `10:40:14.852Z` through `11:14:00.886Z` were all wider than the VTS 2% ceiling, ranging **4.2324%-9.0698%**. A direct Kraken ticker read later showed bid `0.1474`, ask `0.1529`, last `0.1556` — still a real, unlocked two-sided book and still wider than 2% (about 3.66%).

Disposition: the active refusal `no_transactable_side (implausible_spread)` is corroborated as a genuinely wide INIT/USD book, not a synthetic `bid = ask` cache row and not a missing mark. Do not change the ceiling from this one pair, and do not acknowledge or manually resolve the row; its registered machine path clears it when this trade decides or closes.
