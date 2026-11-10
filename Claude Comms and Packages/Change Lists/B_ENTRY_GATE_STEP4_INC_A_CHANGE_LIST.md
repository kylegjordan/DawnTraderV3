# B-ENTRY-GATE (#1224) — STEP 4 CHANGE LIST, INCREMENT A (at the fill)

> **r4 correction (2026-11-10): Coltrane's Step-8 CHANGES on the first-full-session read.** Increment A had promised
> the OBJ-4 friction-coverage shadow but shipped no setting reader, computation, result or archive field. This correction
> folds the obligation into increment A before increment B lands. `entry_friction_coverage_k` is seeded per class at
> **1.0 as WATCH-ONLY**; every evaluated fill now records the probability-free net reward after the realised arm's
> complete friction, the friction amount, their ratio, `k`, and whether the observation falls below `k`. The full ratio
> is the durable measurement; `k=1` is an observation line, never an open/refuse input.
>
> **Exact computation:** `roundTripFrictionAtFill = kernel totalCost`; `netRewardAtFill = distTarget - roundTripFrictionAtFill`;
> `frictionCoverageWouldRefuse = netRewardAtFill < k * roundTripFrictionAtFill`. The scope's exact `>=` edge passes.
> The reader is fail-hard in the existing pre-fill settings guard, so an absent class row becomes the already-counted
> `FILL_ECONOMICS` refusal rather than a fallback. A dedicated `friction_coverage_shadow` archive row is queued
> immediately after each successful maker or taker evaluation, before any later failure can erase the population;
> terminal admitted/refused rows keep the same fields for local diagnosis.
>
> **Files:** `server/core/trading/fill-economics.ts`; `server/services/active-execution-engine.ts`;
> `server/startup/b72-warmup.ts`; `server/tests/unit/b-entry-gate-fill-economics.test.ts`;
> `server/tests/unit/b-entry-gate.test.ts`; `server/tests/unit/b8c-switch-on-wiring.test.ts`;
> `drizzle/migrations/2026-11-10-b-entry-gate-friction-coverage.sql` and its rollback; `MANIFEST.txt`.
> **Proof:** 100/100 targeted tests passed; the TypeScript baseline held at 324/324. Mutation M6 (`<` → `<=` at the
> coverage edge) made the exact-edge test red, proving the comparison fence can detect the boundary regression.
>
> **Fresh-reader HIT, re-derived and folded before dispatch:** maker adverse selection consumed the pWin-derived
> `signalStrength`, so including it in coverage made the shadow probability-linked; it is now excluded from the shadow
> while remaining in P4's deciding net EV, with a nonzero-slope test. The same reader found late duplicate/race/insert
> exits could follow a computation with no terminal archive row; the dedicated immediate carrier closes that gap.
> `REVIEWER: claim-only · name settling objects and materially different consistent states · HIT—maker probability dependency, post-evaluation archive gaps, and setting-dependent decision parity; boundary test kills <= but retained mutation-run evidence is assertion-only · re-derived y`

> **r3 (2026-11-05 ~16:00Z): Langston's PROCEED (msg 1567911217417429013, graded at head `c67740745`, Review = Approved) — his three conditions and four record items, against the r2 code.**
> - **C-1** (window-refused row lacks the EV legs): **already in r2** — `..._fillEconRec` is spread on the `ENTRY_WINDOW` row and `_fillEconRec` is assigned from `_feT` before the refusal (r2's own C-5). His graded head predates `db4152691`.
> - **C-2** the P3 watch-only `entry_gate` read inside `_processPendingMaker` is now in its own `try`/`catch` (`RECORD_FAILED`), ending before `_quoteArrivedAtMs`, so a missing row can no longer abort the resting order's fill/deadline handling for the tick. The open path's read stays fail-hard. Fenced.
> - **C-3** every fill-economics row now carries `measuredBaseSource: flat_pwin_base:p19-b8-5a:2026-07-13:pinned-placeholder:n12140-vts:vts-era-contaminated` — the A-12 comparator is a pinned placeholder from post-B62 VTS closes under the same fake-DI feed, and the KD-11 pack must not read it as EV at the real win rate.
> - **Record items, all done:** `pWinDefaulted` now also covers a strong-trend signal with no DBS (`dbsScore ?? 0` ⇒ floor); `netEvAtMeasuredBase` fenced to the kernel (with `measuredBasePWin = pWin` it equals `netEvAtFill`, both arms); `resolveEvBlockDisposition` takes the mode only (dead parameter removed, rule 15); `_reportMakerWouldCancel` is a plain call and the fixture (`b-sizing-inc3-reset-and-band.test.ts`) carries the method instead; the refresh-log test's fs predicate is the exact two files and their two directories.
> - **Moved to increment B (his §13, no new slot):** the same `require`-in-ESM defect at `server/lib/event-bus.ts:157-158` (`logs/tcl_event_trace_<date>.log`, six emitters, measured absent on the box) and `server/middleware/singleTenantGuard.ts:36`; the P9 fence widens to the server tree with the `require(` census as its positive control. Recorded on P9 in the pre-audit.

> **r2 (2026-11-05 ~15:30Z): Langston's CHANGES on r1 (msg 1567907580712583189, graded `21c614a0a`) folded.**
> - **C-1** the taker arm's friction is now `composeAskEntryMidExitFriction = 2·fee + 1·slippage + ½·spread` (the walked ask fill already holds the entry half-spread and walk), computed with the kernel directly; the maker arm keeps the decision's maker leg. Pinned: at fill 100, DI 20, costs 0.004 / 0.0005 / 0.001 ⇒ `netEvAtFill` = 1.1 exactly (the mid-to-mid composition would give 1.0). Mutation M5 (revert the composer) → 3 red.
> - **C-2** every fail-hard read (`entry_gate` ×2 and the five P4 inputs) is resolved by `_resolveFillEconInputs` BEFORE `openOrder` and before either arm; a failure is a COUNTED `FILL_ECONOMICS` refusal (`entry_gate_settings_unresolved`), so I3 still reconciles. Fence: no `getCachedNumberRequired(` between the fill and the window decision.
> - **C-3** the maker arm refuses an inverted triple (`refuseTakerBooking(limit, stop, target)`) before it is priced, stage `ENTRY_GEOMETRY`.
> - **C-4** re-dispatched at a sha containing `5a3d1bbd4`, CI read there.
> - **C-5** the window-refused row carries `..._fillEconRec`. **C-6** `spreadSource` is on the record.
> - **Deviation 1 rider, corrected:** r1 said *"Same non-trade, a different label and one book walk"* — **wrong.** A marketable maker whose stored taker EV was ≤ 0 **or null** now converts and **OPENS** whenever P4 clears at the price paid: a NEW trade path, not only a relabel. Its exposure is bounded by P4 itself (now with the corrected composition).
> - **Governance owed now:** `DELETED_COMPONENTS_LOG.md` entry for the four removals; `LEVER_INVENTORY.md:184` no longer names `ENTRY_PREMIUM_BPS`; migration header cites pre-audit r9. The `entry_gate`-row coupling (a future class needs a seed row or its taker entries refuse as `settings_unresolved`) is a SIM line at Step 10.
> - **P9 log growth** (append-forever `sqe_rejections.log`, unswept dated traces): proposed to OLD Claude as an item on B-DISK-FILE-TIERING, his agreement required; no new row placed.

| field | value |
|---|---|
| **(i) declared change-class** | `architecture` (scope header) |
| **(ii) doc set for that class** | scope `Claude Comms and Packages/Scope Files/B_ENTRY_GATE_SCOPE.md` — **present** (r4, Step-1 PROCEED) · pre-audit + plan `…/B_ENTRY_GATE_PRE_AUDIT.md` — **present** (r7; Step-2 PROCEED, Review = Approved) · completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_MANUAL`, `SYSTEM_IMPACT_MAP` — **absent, owed at Steps 10-11** · this change list — **present** |
| **(iii) Step-2 reference** | `Claude Comms and Packages/Scope Files/B_ENTRY_GATE_PRE_AUDIT.md` (r7 at the ref) |
| **code** | 7 commits on `origin/migration/aws-supabase`, `B-ENTRY-GATE Step-3 (inc A, …)`; the READY-AT sha is in the dispatch |
| **deploys** | **after 2026-11-07T13:03:42Z** (row 59a's window, scope §5) |

## What increment A does, item by item (pre-audit P-numbers)
| P | what | where |
|---|---|---|
| **P1** | Worse-side entry window at the ACTIVE taker fill: refuse when `adverseR > entry_gate.entry_window_worse_side_frac` (per class, fail-hard). Archive `entry_fill` / `entry_window`, stage `ENTRY_WINDOW`. | `server/core/trading/entry-window.ts` (new), engine taker branch |
| **P1b** | Cheaper-side record, WATCH-ONLY: `remainingRiskFrac = 1 + adverseR`, `belowCheaperFloor` vs `entry_cheaper_side_floor_frac`. Never refuses. | same |
| **P3** | Resting maker would-cancel, WATCH-ONLY: per tick, ask above the window ⇒ recorded; one line when the rest resolves (fill or drop). Never cancels. | engine `_processPendingMaker`, `_reportMakerWouldCancel` |
| **P3v** | The same window at the VTS taker entries: crypto `vts-runner`, the crypto taker twin, xStock `eval-cycle`. | `entryWindowRefusalAt` |
| **P4** | Economic test at the PRICE PAID for the ARM THAT FILLS (Reply A): taker at its walked fill; maker at its limit, conditional on filling. `netEvAtFill ≤ 0` refuses (`FILL_ECONOMICS`), exploration-stamped paper opens exempt and recorded. A-12 leg recorded for BOTH classes: defaulted pWin flag, EV on a real carried DI, EV at the measured base rate — never decides. | `server/core/trading/fill-economics.ts` (new), engine `_fillEconomics` |
| **P4b** | `BLOCK_SNAPSHOT_MISSING` / `EV_SNAPSHOT_MISSING` deleted (unreachable); `resolveEvBlockDisposition(chosenNetEv: number, …)` — null is now a compile error. LIVE `BLOCK_EV_REJECT` untouched (Kyle §6.2). | `server/services/ev-block-disposition.ts`, engine |
| **P5** | The three `entry × 1.02` target fallbacks deleted: ranker ranks a target-less plan last, shadow pool skips it, promoted open refuses `invalid_target`. | `ready_to_buy_service.ts`, engine `executePromotedSignal` |
| **P9** | `logRtbTrace` / `logSqeRejection` write again (ESM `node:fs`); the trace writes status TRANSITIONS only; a failed write warns once. | `ready_to_buy_service.ts` |
| A-9 | `ENTRY_PREMIUM_BPS` deleted (no reader; spec-only since `aa2698233`). | `strategy-helpers.ts` |
| seed | `entry_gate` 4 rows (0.25 / 0.40 × crypto_spot, xstock_spot), count-asserted; rollback file; MANIFEST; warmed in `b72-warmup`. | `drizzle/migrations/2026-11-05-b-entry-gate*.sql` |

## Load-bearing hunks
**P1/P1b/P4 at the taker fill** (`active-execution-engine.ts`; the settings are resolved before either arm, and the
taker is priced on the carried levels that the position will own):
```ts
const _ewCheaper = cheaperSideRecord(_shadow.adverseR, _ewCheaperFloor);
const _ewRefusal = entryWindowRefusal(_shadow.adverseR, _ewWorseSide);
const _feT = computeFillEconomics({ ..._feInputs, arm: 'taker', fillPrice: actualEntryPrice,
  stopPrice: _carriedStop, targetPrice: _carriedTarget });
const _feTPlan = _levelRec !== null
  ? computeFillEconomics({ ..._feInputs, arm: 'taker', fillPrice: actualEntryPrice }) : null;
_fillEconRec = { ...this._fillEconRecord(_feT, 'taker', _fillExplo),
  ...(_feTPlan !== null ? { netEvAtFillPlanGeometry: _feTPlan.netEvAtFill,
    fillEconRefusedPlanGeometry: _feTPlan.refuse } : {}) };
await this._archiveFrictionCoverageShadow(signal, _openClass, 'taker', actualEntryPrice,
  _carriedStop, _carriedTarget, _feT);
// The later ENTRY_GEOMETRY / level-rebase / ENTRY_WINDOW / FILL_ECONOMICS exits cannot erase this carrier.
```
**P4 at the maker placement:**
```ts
if (_b72cPendingMaker) {
  const _feM = computeFillEconomics({ ..._feInputs, arm: 'maker', fillPrice: _b72cLimit });
  _fillEconRec = this._fillEconRecord(_feM, 'maker', _fillExplo);
  await this._archiveFrictionCoverageShadow(signal, _openClass, 'maker', _b72cLimit,
    signal.stopPrice, signal.targetPrice, _feM);
  if (_feM.refuse && !_fillExplo) return await this._refuseFillEconomics(signal, _openClass, 'maker', _b72cLimit, _feM, _fillEconRec);
}
```
**P4 kernel and probability-free coverage shadow** (`fill-economics.ts`):
```ts
const d = decideMakerTaker({ entryPrice: i.fillPrice, entryPriceMaker: i.fillPrice,
  levelGeometry: i.levelGeometry, stopPrice: i.stopPrice, targetPrice: i.targetPrice, ... });
const leg = i.arm === 'taker'
  ? computeNetExpectancyKernel({ ...,
      totalFriction: (i.levelGeometry === 'sided'
        ? composeAskEntrySidedExitFriction(i.costs.fee, i.costs.slippage)
        : composeAskEntryMidExitFriction(i.costs.fee, i.costs.slippage, i.costs.spread)) * i.fillPrice })
  : d.maker;
const adverseSelection = i.arm === 'maker' ? d.adverseSelectionPct * i.fillPrice : 0;
const netEvAtFill = leg.netEV - adverseSelection;
const roundTripFrictionAtFill = leg.totalCost;
const netRewardAtFill = leg.distTarget - roundTripFrictionAtFill;
const frictionCoverageRatio = roundTripFrictionAtFill === 0 ? null : netRewardAtFill / roundTripFrictionAtFill;
const frictionCoverageWouldRefuse = netRewardAtFill < i.frictionCoverageK * roundTripFrictionAtFill;
return { ..., netEvAtFill, refuse: !(netEvAtFill > 0), netRewardAtFill,
  roundTripFrictionAtFill, frictionCoverageRatio, frictionCoverageWouldRefuse };
```
The dedicated carrier writes `gate='friction_coverage_shadow'`, `accepted=true`, `shadow=true`, the arm/fill/carried
stop/target, `k`, net reward, round-trip friction, ratio and watch-only result immediately after each successful
evaluation. Maker adverse selection remains in deciding `netEvAtFill` but is deliberately outside the probability-free
coverage shadow because its strength multiplier consumes the pWin-derived `signalStrength`.

**The conversion** — BEFORE: `if (_entryFillPolicy === 'maker_preferred' && _b72cStoredTakerEv != null && _b72cStoredTakerEv > 0)`. AFTER: `if (_entryFillPolicy === 'maker_preferred')` — it converts and P4 decides at the price paid.

## Deviations from the plan — attack these
1. **The conversion (pre-audit §2 row).** The plan said "the conversion decision becomes OBJ-4's taker test at the live ask". Built: the stored-EV condition is removed and the decision moves to P4 at the WALKED fill price — the price actually paid — so there is ONE deciding number, not a live-ask estimate followed by a fill check. Effect (corrected in r2): a marketable maker whose stored taker EV was ≤ 0 or null used to be `MAKER_MARKETABLE_DROPPED`; now it converts, walks the book, and OPENS if P4 clears at the paid price, or is refused `FILL_ECONOMICS` if not. ~~Same non-trade, a different label and one book walk.~~
2. **P5's SQE `InvalidTarget` rule moves to increment B.** It needs the plan in `SQEInput`, which is P2. Increment A deletes the fallbacks at their three sites.
3. **P7a withdrawn** (pre-audit r6: every trade already carries `metadata.queuedAt`).
4. **P9 writes transitions only.** Directive 8.8.4-A3.R8's intent is status transitions; `reconfirmed → reconfirmed` every 120 s per row would be ~14 MB a day of non-events.
5. **The maker is judged at its limit at PLACEMENT, not at its eventual fill.** At placement the price it will pay is known (its limit); judging then means a refused maker never rests. The fill-time inputs (DI, costs) could move during the rest; that is accepted, and P3's record shows how often the market leaves the plan during a rest.
6. **A-12's "real DI" candidate is null for all xStock at the fill** — the birth deliberately carries none (`signal-orchestrator.ts:1017-1020`), and I did not resolve an xStock DI at the fill (your "not verified" leg). It is recorded as null, never zero.

## Evidence
- **tsc baseline:** 324 = 324 at the correction head.
- **Unit:** the correction target set is 100/100 green across `b-entry-gate`, `b-entry-gate-fill-economics`, `b8c-switch-on-wiring`, `b1250-engine-wiring`, and `b-entry-consumption-freshness-engine`; the last suite's cold-cache fixture supplies all three required `entry_gate` rows, including `entry_friction_coverage_k=1.0`.
- **Full local suite:** 5,220 passed / 199 skipped; 11 files did not complete in this laptop environment (missing local `jsdom`, unavailable local PostgreSQL, and pre-existing watchdog/module load errors). The prior pushed run isolated its four failures to the now-corrected cold-cache fixture.
- **Mutations, each RED:** M1 window `>` → `>=` (2 tests); M2 P4 never refuses (1); M3 exploration not exempt at the taker (1); M4 strong-trend pool not excluded from `pWinDefaulted` (1).
- **CI:** run `42737548649` at correction ref `5b119e307ae2a09cbaad66731854d87c0aa10b6c`: Test Suite, Build, TypeScript Check, and Docker Build individually `success` (4/4).
