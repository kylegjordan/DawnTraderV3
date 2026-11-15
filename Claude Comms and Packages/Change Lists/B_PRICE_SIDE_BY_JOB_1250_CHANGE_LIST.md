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

## Step 7 five-session read — 2026-11-15 (CC-C, alert `ac78c006`)

**Window:** deploy `1d4be9cf7` at `2026-11-07T19:06:27Z` → close of the fifth US session, Fri 2026-11-13 8pm ET = `2026-11-14T01:00Z` (sessions Mon 11-09 … Fri 11-13). **Queries, verbatim and re-runnable:** `scripts/analysis/b1250_step7_five_session.sql`. ⚠️ Archive paper rows carry `mode='paper_sim'`; `closed_trades` paper rows carry `mode='paper'` (a first pass on `'paper'` in the archive returned zero everywhere, crypto included — caught by a mode census, not reported).

**Populations.** Active: 82 xStock paper opens (`closed_trades`), split by the admitted row's realised `entryArm` — **45 taker / 37 maker**, 40 and 30 distinct symbols; the archive's admitted rows match the durable rows one-for-one (45/45 joined; 44/45 byte-equal, the 45th is SPG's float-vs-`numeric(…,8)` rendering of the same value). VTS: 1,949 xStock admitted rows, of which **1,003 carry `levelRebase`**; 986 VTS trades with `levelRebase` in `vts_open_trades`.

| §3 clause (as amended §7.5, §8.2, §8.3, §9) | result | verdict |
|---|---|---|
| (a) every taker open carries the stamps | 45/45 `levelBasis`, 45/45 `levelSpecStamped` | PASS |
| (a) each leg equals its stamped form (active: one tick) | **stops** 45/45, max error 3e-14 (18 distance, 24 anchor, 3 mixed `max`). **targets** 44/45: 18+5+3 distance exact; the 13 r_multiple / mixed-`max` targets re-derived by hand from the carried risk (`e + 2·(e − s)`, the `max` taking the anchor term where it is higher) — all 13 exact to the grid; 1 anchor | PASS on 44 — SBET below |
| `LEVEL_SPEC_INCONSISTENT` = 0 over r_multiple / mixed legs (§9 narrowing) | **1 of 18** target legs (11 `max` + 7 r_multiple): SBET | ⛔ **FAIL — the pre-registered non-zero** |
| (a2) zero opens with a fill-relative stop < 0.3 %; refusals archived | 0/45 active, 0/986 VTS. `STOP_DISTANCE_AT_FILL` archived: active **1**, VTS **43** | PASS |
| (a2) rate ≤ ~10 % of window-admitted taker opens; FAIL = zero over ≥ 50 | active **1/47** (45 opens + 1 floor + 1 `fill_economics`, all after the window) = 2.1 %, under the 50 floor for the zero-test and non-zero anyway; VTS **43/1,046** = 4.1 % | PASS |
| (a3) VTS taker legs at 1e-9 | **stops:** 169 pure-distance exact; the 13 that are not are all `pivot_shift`, whose stop is `max(3-candle low, entry − k·ATR)` (`pivot-shift.ts:223`) — after a below-plan fill the anchor term wins, which is BLOCKER-6 working; `originalStopPrice` = booked stop on all six sampled, so nothing moved after open. **targets:** all 986 match their strategy's form — 497 distance exact, 456 r2 within the 8-dp column, 70 plan, and 6 `vwap_pullback` above r2 = its `max(anchor, r2)` taking the anchor. `levelSpecInconsistent` empty on all 1,003 admitted rows | PASS |
| (b) maker and crypto opens carry no `levelBasis` | xStock maker 0/37, crypto 0/5,482 admitted | PASS |
| (c) `entryObservedAgeMs` on every xStock maker FILL | **31/31** filled; the 6 maker rows without it all carry `neverFilledReason` (rested, never filled) | PASS |
| (d) epoch +1 | read at deploy, §12 of the pre-audit (7→8, 10→11) | PASS (not re-read) |
| (e) zero `LEVEL_REBASE_INVALID` | active 0, VTS 0 `level_rebase_*` | PASS |
| flips (P2b), both directions | admitted 45: carried geometry refused 0 the plan geometry admitted; admitted **1** the plan geometry would have refused (a loosening); net EV lower under the carried geometry on 28, higher on 9. Refused 3: 1 refused only under the carried geometry, 1 only under the plan's | reported, as registered |
| UI — Open Trades in Claude-in-Chrome | not checked | **waiting on Kyle** |

### The one FAIL — SBET/USD, `sma_trend_ride`, target r_multiple (r = 2) over an anchor stop
Plan as it arrived: entry `6.1322`, stop `5.9793`, target `6.4382`; fill `6.12`. The self-consistency check re-derives the target at the plan: `6.1322 + 2 × (6.1322 − 5.9793) = 6.4380` — **0.0002 off the arriving `6.4382`**, against a tolerance of one tick (`level-rebase.ts:131`) + 1e-9 relative. So the leg was kept on the plan (`6.4382`; re-based it would have been `6.12 + 2 × 0.1407 = 6.4014`) and counted — the fail-safe direction the design chose, today's behaviour on that leg.
**Hypothesis — `NOT RE-READ`, a mechanism claim not yet routed to a reader:** the orchestrator rounds each leg once, independently, after construction (§8.2), so re-deriving an r_multiple target from the ROUNDED entry and stop carries `(1+r)·εe − r·εs − εt` of rounding error — up to **(1 + r) ticks = 3 ticks at r = 2** — against a one-tick tolerance. SBET's 2-tick miss sits inside that bound, and the other 17 r_multiple / mixed legs sitting within one tick is what the same bound predicts most of the time. The tick (`0.0001`) is inferred from the 4-dp plan prices, not read from the grid.
**DISPOSITION: folded into this batch — Step 9 iterate**, design for Langston to rule: size the r_multiple / mixed-leg tolerance from the propagation bound, or check against the pre-rounding plan. No other leg is affected (§9: the check is structurally `|x − x|` on single-form legs).

## Row 2 increment (4a) — INIT/USD self-clearing alert inspection, 2026-11-10

Alert `2d0884e4-9d30-4fe2-9aec-130bc10bb482` remains **active and unacknowledged**. Its one durable row was created at `2026-11-10T10:41:58.726Z` and fired at `10:49:32.090Z`; the exact VTS trade `vts_INIT_USD_vwap_pullback_1794304799204` remains open (`opened_at 09:59:59.206Z`, entry `0.15569714`, stop `0.06381143`, target `0.43135429`).

The live price-cache diagnostic at `11:19:45.541Z` showed INIT/USD mark `0.1556`, source `kraken_rest`, refreshed at `11:19:11.507Z`; that diagnostic does not expose the cached bid and ask. The separate durable ticker archive, used here as the side witness rather than mislabelled as the cache, showed repeated two-sided but implausibly wide books: the latest archived row at `11:14:00.886Z` was bid `0.1460`, ask `0.1556`, spread **6.3660%**; the 20 archived observations from `10:40:14.852Z` through `11:14:00.886Z` were all wider than the VTS 2% ceiling, ranging **4.2324%-9.0698%**. A direct Kraken ticker read later showed bid `0.1474`, ask `0.1529`, last `0.1556` — still a real, unlocked two-sided book and still wider than 2% (about 3.66%).

Disposition: the active refusal `no_transactable_side (implausible_spread)` is corroborated as a genuinely wide INIT/USD book, not a synthetic `bid = ask` cache row and not a missing mark. Do not change the ceiling from this one pair, and do not acknowledge or manually resolve the row; its registered machine path clears it when this trade decides or closes.

## Step 9 — the SBET fix (pre-audit §13 + §13.1; Langston PROCEED `1571362220619730945`)

**Class:** architecture (the batch's declared class, unchanged). **Step 2 reference:** `Scope Files/B_PRICE_SIDE_BY_JOB_1250_PRE_AUDIT.md` §13 (design) + §13.1 (the ruling's five conditions). **Doc set at this step:** scope present; pre-audit present (§13/§13.1); this change list present; completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, System Manual, System Impact Map — owed at the batch's Step 10 (the parent stays open: 8c, the KD-19 entry leg, this re-read).

| item | what changed | where |
|---|---|---|
| D1 | a single-form `r_multiple` stamp carries `builtEntry` / `builtStop` — the operands the site multiplies — and `isWellFormedLegSpec` REQUIRES them there (a mixed-leg term still carries only its `value`). Old shape ⇒ malformed ⇒ anchor (nothing moves); at crypto birth (8c, dark) the existing `level_spec_malformed` refusal | `level-rebase.ts` type + `isWellFormedLegSpec`; `strategy-engine.ts` the three sites (strong-trend override, `sma_trend_ride` break, `vwap_bounce`) |
| D2 | `atPlan(r_multiple) = builtEntry + (builtEntry − builtStop)·r` — the same expression the sites evaluate | `level-rebase.ts` |
| D3 | the check is EXACT: a leg that rebuilds its value (single-form `r_multiple`, mixed) must equal the arriving level once rounded on `planTick` (birth grid) by its role's direction; `planTick` null ⇒ within 1e-9. New `rebaseLevels` inputs `planTick`, `strategyId`; the one-tick tolerance is gone | `level-rebase.ts`; active caller reads `metadata.gridAtBirth` (resolved ⇒ its tick) — `active-execution-engine.ts`; VTS and crypto birth pass `planTick: null` |
| C-1 | `resolveTargetIsCap(levelSpec, strategyId)` — ONE derivation, called at birth (orchestrator grid rounding) and by `rebaseLevels` for both the check and the output rounding | `level-rebase.ts`; `signal-orchestrator.ts` |
| C-2 | only a reconstruction is re-rounded; anchor / distance / proportional stay structural | `level-rebase.ts` (`isReconstruction`) |
| C-5 | `RebaseResult.malformed`; active `_levelRec` and the VTS `levelRebase` carry `levelSpecMalformed`; the active arm logs `[#1250][LEVEL_SPEC_MALFORMED]`; `_levelRec` also carries `planTick` and `fillTick` | `level-rebase.ts`, `active-execution-engine.ts`, `eval-cycle.ts` |

**Tests (new or changed):** `b1250-level-rebase` — exact-on-birth-grid block (mismatch; the r = 2.1-built / r = 2-stamped **mutation control at planTick 0.0001, 0.01 and null**; the **SBET replay** — operands rounding to 6.1322 / 5.9793 / 6.4382 are consistent and re-based, while the old reconstruction misses by > 1 tick; **tick drift** born 0.0001 / filled 0.01, and the same plan graded on the fill grid failing; direction; C-2 no re-round; mixed exact), C-1 (the helper's five cases; a cap target reproduces and the same plan graded as a floor misses by one tick), C-5 (old-shape stamp ⇒ `malformed: ['target']`, nothing moves), C-3 (VTS unrounded plan exact at null; `gridAtBirth.tick` and the operands survive a JSON round-trip byte-for-byte). `b1250-level-spec-counterfactual` — the three pins updated, plus **D5(vi): `builtEntry + (builtEntry − builtStop)·r` is `Object.is`-identical to the site's own target at four seeds each, and the source holds `const riskDistance = entryPrice - stopPrice;`**, and a mutation control showing an algebraically-equal, differently-computed target is not bit-identical. `b1250-engine-wiring`, `b8c-birth-levels`, `b8c-switch-on-wiring` — pins moved to the shared helper and the new arguments.
**Results:** the five touched test files 189/189. Full unit suite: 6 files fail, and the same 6 fail identically with this change stashed (local-environment). tsc error count 324 with and without the change.

**Pre-registered Step-7 re-read (§13 D6 as amended by §13.1 C-5):** five US sessions after the deploy, post-deploy births only. PASS = `LEVEL_SPEC_INCONSISTENT` 0 over every `r_multiple` and mixed leg; **positive cell: active ≥ 3 and VTS ≥ 50 `r_multiple` target legs `fill_rebased` with an empty inconsistent set (below the floor is a FAIL)**; the malformed count reported separately, split at the deploy boundary; `planTick ≠ fillTick` counted; booked R against stamped r per `r_multiple` leg, magnitude and direction.

### Step 9 — Step-4 r1 (Langston PROCEED `1571370392256258239`, re-read at `da24ed0f2`) — dispositions, folded
- **FINDING-1 — disposition (a), folded into this increment.** The exact check had no term for the plan's STORAGE scale: the active arm's plan returns through the RTB queue's `decimal(20,8)` entry/stop/target columns, so an UNROUNDED plan (the xStock passthrough, `planTick` null — 32 of 490 xStock paper opens over 30 days, his measurement) arrives quantised to 1e-8, up to 5e-9 off the built value, which beats the 1e-9-relative slack under $5. **Fix:** `rebaseLevels` takes `planStorageQuantum` from the caller; the active arm passes `1e-8` (its column), VTS and crypto birth pass `null` (in memory). On a rebuilt leg with `planTick` null, the comparison allows half the quantum on top of the slack — the storage error's own bound, caller-scoped, never a blanket floor; on the `planTick` path it is not read. **Tests added:** a sub-$5 plan built unrounded and stored at 8 dp FAILS without the quantum (positive control on the false FAIL) and passes with it; a plan two storage units off its stamp still fails (detection floor on this path ≈ 1e-8 — one unit can hide inside it, stated); the quantum is inert on the `planTick` path.
- **NOTE-2 — folded.** The `strategyId` input on `rebaseLevels` could never matter (with no spec every leg is anchor-only and the cap bit is read by nothing), so it is removed; `rebaseLevels` calls `resolveTargetIsCap(i.spec, null)`. The shared helper is still the ONE derivation, and birth still passes its strategy for the no-stamp fallback.
- **C-4 wording — corrected** in pre-audit §13 D1: no duration is asserted; the resting xStock RTB rows' age distribution is **measured at the deploy instant** (Step 6) and their effect read as the malformed count split at the deploy boundary (Step 7).
- **Attack (1)** stays as decided: a `null` `levelSpec` reads "present, not a cap", pinned by the C-1 test; nothing writes one today.
**Results after the fold:** the five touched test files 193/193 (189 + 4); tsc error count 324, unchanged.
