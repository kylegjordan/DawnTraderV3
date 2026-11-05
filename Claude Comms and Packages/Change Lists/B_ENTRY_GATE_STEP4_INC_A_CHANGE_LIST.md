# B-ENTRY-GATE (#1224) — STEP 4 CHANGE LIST, INCREMENT A (at the fill)

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
**P1/P1b/P4 at the taker fill** (`active-execution-engine.ts`, after `entryFillShadow`, inside the one `_entryShadowRec` site):
```ts
const _ewKey = { exchange: '*', assetClass: _openClass, strategy: '*', regime: '*' };
const _ewWorseSide = getCachedNumberRequired('entry_gate', 'entry_window_worse_side_frac', _ewKey);
const _ewCheaperFloor = getCachedNumberRequired('entry_gate', 'entry_cheaper_side_floor_frac', _ewKey);
const _ewCheaper = cheaperSideRecord(_shadow.adverseR, _ewCheaperFloor);
const _ewRefusal = entryWindowRefusal(_shadow.adverseR, _ewWorseSide);
const _feT = this._fillEconomics(signal, _openClass, 'taker', actualEntryPrice);
_fillEconRec = this._fillEconRecord(_feT, 'taker', _fillExplo);
_entryShadowRec = { …existing…, entryWindowFrac, entryWindowRefused, cheaperSideFloorFrac, remainingRiskFrac, belowCheaperFloor };
…  // after the ENTRY_GEOMETRY refusal:
if (_ewRefusal !== null) { …archive entry_fill…; return { opened: false, stage: 'ENTRY_WINDOW', reason: _ewRefusal }; }
if (_feT.refuse && !_fillExplo) { return await this._refuseFillEconomics(signal, _openClass, 'taker', actualEntryPrice, _feT, { ...(_entryShadowRec ?? {}), ..._fillEconRec }); }
```
**P4 at the maker placement:**
```ts
if (_b72cPendingMaker) {
  actualEntryPrice = _b72cLimit; …
  const _feM = this._fillEconomics(signal, _openClass, 'maker', _b72cLimit);
  _fillEconRec = this._fillEconRecord(_feM, 'maker', _fillExplo);
  if (_feM.refuse && !_fillExplo) return await this._refuseFillEconomics(signal, _openClass, 'maker', _b72cLimit, _feM, _fillEconRec);
}
```
**P4 kernel** (`fill-economics.ts`): `decideMakerTaker({ entryPrice: fillPrice, entryPriceMaker: fillPrice, levelGeometry: 'mid', … })`; `netEvAtFill = (arm === 'taker' ? d.taker : d.maker).netEV − (arm === 'maker' ? d.adverseSelectionPct × fillPrice : 0)`; `refuse = !(netEvAtFill > 0)`.

**The conversion** — BEFORE: `if (_entryFillPolicy === 'maker_preferred' && _b72cStoredTakerEv != null && _b72cStoredTakerEv > 0)`. AFTER: `if (_entryFillPolicy === 'maker_preferred')` — it converts and P4 decides at the price paid.

## Deviations from the plan — attack these
1. **The conversion (pre-audit §2 row).** The plan said "the conversion decision becomes OBJ-4's taker test at the live ask". Built: the stored-EV condition is removed and the decision moves to P4 at the WALKED fill price — the price actually paid — so there is ONE deciding number, not a live-ask estimate followed by a fill check. Effect: a marketable maker whose stored taker EV was ≤ 0 used to be `MAKER_MARKETABLE_DROPPED` (no book walk); now it walks the book and is refused `FILL_ECONOMICS` if its EV at the paid price is ≤ 0. Same non-trade, a different label and one book walk.
2. **P5's SQE `InvalidTarget` rule moves to increment B.** It needs the plan in `SQEInput`, which is P2. Increment A deletes the fallbacks at their three sites.
3. **P7a withdrawn** (pre-audit r6: every trade already carries `metadata.queuedAt`).
4. **P9 writes transitions only.** Directive 8.8.4-A3.R8's intent is status transitions; `reconfirmed → reconfirmed` every 120 s per row would be ~14 MB a day of non-events.
5. **The maker is judged at its limit at PLACEMENT, not at its eventual fill.** At placement the price it will pay is known (its limit); judging then means a refused maker never rests. The fill-time inputs (DI, costs) could move during the rest; that is accepted, and P3's record shows how often the market leaves the plan during a rest.
6. **A-12's "real DI" candidate is null for all xStock at the fill** — the birth deliberately carries none (`signal-orchestrator.ts:1017-1020`), and I did not resolve an xStock DI at the fill (your "not verified" leg). It is recorded as null, never zero.

## Evidence
- **tsc baseline:** 329 = 329 at every commit.
- **Unit:** the batch's tests — `b-entry-gate.test.ts` 26, `b-entry-gate-fill-economics.test.ts` 11, `b-entry-gate-refresh-logs.test.ts` 5, plus `ev-reject-shadow`, `b-entry-distance-guard` (spread count 2 → 4, comment names each), `b-entry-consumption-freshness-engine` (its cold-cache fixture now supplies the new settings).
- **Full unit suite:** 4 file failures, all pre-existing and environmental on this laptop (`b-staging-liveness-watch`, `b-tsc-baseline-fix` load errors; `b63-item12`, `b63-item16` load errors) — present with these commits stashed too. Five other files failed once in a full run and pass alone (timing).
- **Mutations, each RED:** M1 window `>` → `>=` (2 tests); M2 P4 never refuses (1); M3 exploration not exempt at the taker (1); M4 strong-trend pool not excluded from `pWinDefaulted` (1).
- **CI:** to be read on the pushed head before you rule (4/4 per job).
