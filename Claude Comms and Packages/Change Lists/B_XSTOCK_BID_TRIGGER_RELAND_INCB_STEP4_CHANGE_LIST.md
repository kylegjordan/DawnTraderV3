# B-XSTOCK-BID-TRIGGER-RELAND increment B — STEP 4 CHANGE LIST

## THE DISPATCH HEADER
| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (scope header, unchanged) |
| ii | **THE CLASS'S DOC SET** | the batch SCOPE — present, `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` · the batch PRE_AUDIT — present, `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md` (r2c) · COMPLETION_REPORT — the batch is parked: present as `Batch Completion/B_XSTOCK_BID_TRIGGER_RELAND_PROGRESS_REPORT.md`, updated at Step 10 · `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, `SYSTEM_MANUAL.md` (§3.5.1b), `SYSTEM_IMPACT_MAP.md` (a `transactable-sides.ts` entry) — all present, their content updates are Step 10 (pre-audit P9) |
| iii | **THE STEP-2 REFERENCE** | `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md` — Step 2 r2 APPROVED by Langston 2026-10-17 with three binding conditions, folded as §0.r2c |

**Graded ref:** the commit carrying this file. Code, tests, migrations and this list land in ONE commit.

## WHAT CHANGED, BY PLAN ITEM
| item | file(s) | change |
|---|---|---|
| **P1** trigger on the bid, gated | `active-execution-engine.ts` | `xsBidTriggerArmed` = the guard RAN this tick AND `_c.spreadBlownEnabled`; `xsBidTriggerOff` = `guard_off` \| `spread_blown_off`. The trigger slot passes the judged `xsBid` for xStock only while armed; the evaluator's xStock arm is `xsBidArmed ? triggerBid : currentPrice` (new `xsBidArmed` parameter). Armed with no judged bid ⇒ `null` ⇒ no decision (branch 2b). |
| **P2** the size test | `transactable-sides.ts` | `xstockSideSize(side, {bid,ask,bidQty,askQty}, notionalUsd)` → `ok`\|`size_short`\|`size_unknown`; throws on a non-finite/non-positive notional. Leaf module, no imports. |
| **P3** what each site does | engine, `vts-runner.ts`, `eval-cycle.ts`, `vts-xs-select.ts` | paper X1/X2 through `_xsRestSizeGate` (no fill on short/unknown; counted only when touched); paper trigger: size LOGGED + COUNTED, never blocks; VTS rest fill and VTS taker entry refuse (`taker_entry_size_short\|unknown`); VTS real exit counted; **VTS shadow exit EXCLUDED** (r2c 1); `size_invalid` separate (r2c 3c). |
| **P4** VTS rows carry sizes | `vts-xs-instrument.ts`, `vts-runner.ts`, `scanner.ts` | `XsQuoteRow.bidQty/askQty` REQUIRED; real-lane exit query and the scanner select `bid_qty`/`ask_qty`; the shadow query does not (its row states `null`). |
| **P5** crossed | `depth-source.ts`, engine | `verdict.crossed` (separate flag). Entry gate refuses on it. **Every close walks the newest row as before**; crossed is logged + counted (`closeCrossedWalks`). Flatten fallback query gains `ask >= bid`. |
| **P6** epoch | `drizzle/migrations/2026-10-17-…-incb-epoch.sql` (+ rollback), `MANIFEST.txt` | `calibration_epoch` `xstock_spot`/`paper_sim` +1 with a delta post-condition; header states the objective-6 boundary is not machine-visible. Rollback moves forward again and deletes its `_migrations` row. |
| **P7** instrument | engine, `xstock-exit-frame-log.ts` | trigger tag `basis=bid` \| `basis=mark reason=…`, `size=…`; `XS_FRAME` ends `on=bid\|mark` and prints `bidExit=` on a bid-decided tick; `[XS_SIZE]` and `[XS_SIZE_TRIPWIRE]` on `console.warn`; X3 divergence START only on the mark arm. Tripwire: hourly, ≥ 200 looks, `size_unknown` share > 10% ⇒ `breakage` warning, resolved by the next clean hour. |
| **P8** tests | see below | — |
| — | `rtb-retirement-ask.ts` | header only: its `askQty` presence test is a different job (BLOCKER-1). |

## THE TREE-WIDE CENSUS (r2c condition 1) — the command and its output
`grep -rnF "<symbol>" server --include=*.ts | grep -v /tests/` minus comment lines, at the working tree that became this commit:
```
== xstockTransactableSides(            6
vts-xs-guard.ts:44 · vts-xs-instrument.ts:114, :247 · active-execution-engine.ts:2310 (J2), :2605 (J1) · rtb-retirement-ask.ts:61
== selectVtsXstockExitBid(             2
vts-runner.ts:3950 (real lane) · :4738 (shadow lane — EXCLUDED from size)
== selectVtsXstockEntryAsk(            2
eval-cycle.ts:1010 (taker entry) · vts-runner.ts:3821 (rest fill)
== getDepthSnapshot(                   3
active-execution-engine.ts:595 (entry gate) · :4358 (close) · active-portfolio-manager.ts:305 (flatten, allowLastTwoSided)
== xstockSideSize(                     3
vts-xs-select.ts:81 (the VTS wrapper) · active-execution-engine.ts:3183 (trigger frame) · :3616 (the X1/X2 gate)
== vtsXstockSideSize(                  3
eval-cycle.ts:1094 (taker entry) · vts-runner.ts:3826 (rest fill) · :4007 (real-lane fired exit)
== _xsRestSizeGate(                    2 calls
active-execution-engine.ts:1870 (X1) · :3251 (X2)
```
⇒ **xStock side → decision or fill: 11 production sites.** Sized here: paper trigger (log+count), X1, X2, VTS real exit (count), VTS rest, VTS taker entry. Already sized or priced before B: market entry (depth gate + sufficiency), market close and the APM flatten (the walk). Excluded on the record: VTS shadow exit. Not a decision: the guard and the instrument; a different job: the RTB retirement read. **The fence (`…-incb.test.ts`) asserts these counts.**

## LOAD-BEARING HUNKS
**P1 — the evaluator's arm (`active-execution-engine.ts`, `checkExitConditions`)**
```
BEFORE  : positionAssetClass === 'xstock_spot' ? currentPrice // `8a-P4b` Step 9 C1: the mark until row `3n.q7` re-lands the bid
AFTER   : positionAssetClass === 'xstock_spot' ? (xsBidArmed ? triggerBid : currentPrice)
```
**P1 — the caller's slot**
```
BEFORE  _lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : null,
AFTER   _lsSel !== null && _lsSel.ok ? _lsSel.quote.bid : (_posClass === 'xstock_spot' && xsBidTriggerArmed ? xsBid : null),
        …
        _posClass === 'xstock_spot' && xsBidTriggerArmed, // the xStock arm's gate
```
**P1 — where armed is set (guard-ON arm only)**
```
const { result: _r, cfg: _c, raw: _raw } = _bs;
xsBidTriggerArmed = _c.spreadBlownEnabled === true;
if (!xsBidTriggerArmed) xsBidTriggerOff = 'spread_blown_off';
```
(the guard-OFF arm sets `xsBidTriggerOff = 'guard_off'` and leaves armed false)

**P5 — `getDepthSnapshot`**
```
BEFORE  const verdict = { bid: sideVerdict(bid, bidQty), ask: sideVerdict(ask, askQty) };
        if (verdict.bid === 'ok' && verdict.ask === 'ok') {
AFTER   const _bv = sideVerdict(bid, bidQty), _av = sideVerdict(ask, askQty);
        const verdict = { bid: _bv, ask: _av, crossed: _bv === 'ok' && _av === 'ok' && ask < bid };
        if (verdict.bid === 'ok' && verdict.ask === 'ok') { // crossed or not: the newest row, with the flag recorded
```
**P5 — entry refuses; the close only records**
```
entry : if (snapshot?.verdict && (… !== 'ok' || … !== 'ok' || snapshot.verdict.crossed)) { return { pass: false, reason: `depth_verdict … crossed=…` …
close : if (_closeSnap?.verdict?.crossed) { this._xsSizeCounts.closeCrossedWalks++; console.warn(`…CLOSE_FILL … CROSSED … walking it as before`) }
        if (!_isFlatten && _closeSnap?.verdict && (_closeSnap.verdict.bid !== 'ok' || _closeSnap.verdict.ask !== 'ok')) {   // unchanged
```
**P3 — the resting-fill gate**
```
const qty = parseFloat(position.quantity);
if (!Number.isFinite(qty) || !(qty > 0)) { this._noteInvalidQuantity(position, site); return null; }   // size_invalid, paged once
const verdict = xstockSideSize(sizeSide, sides, qty * price);
if (verdict === 'ok') return price;
const touched = orderSide === 'buy' ? price <= limit : price >= limit;   // counted only when it would have filled
… return null;
```
**P3 — VTS taker entry (`eval-cycle.ts`)**
```
const VTS_XSTOCK_ENTRY_DOLLAR_VALUE = 150;     // also: const dollarValue = VTS_XSTOCK_ENTRY_DOLLAR_VALUE;
if (_xEffectiveMode === 'taker') {
  const _xSize = vtsXstockSideSize('ask', entryQuote, _xEntryAsk, VTS_XSTOCK_ENTRY_DOLLAR_VALUE);
  if (_xSize !== 'ok') { _xRefuseBooking(_xSize === 'size_short' ? 'taker_entry_size_short' : 'taker_entry_size_unknown', …); continue; }
}
```
**P4 — the shadow query (r2c 1, comment corrected)**
```
BEFORE  bid::text AS bid, ask::text AS ask, (EXTRACT(EPOCH FROM captured_at) * 1000)::text AS at_ms
        // `8a-P4c` P4b — the sides and capture time are carried for the instrument ONLY; every shadow decision still reads `last`.
AFTER   (query unchanged)
        // The sides and capture time feed the instrument AND the shadow lane's exit TRIGGER (… the old note here … was false).
        // ⛔ … the shadow lane is EXCLUDED from the size test — no notional is in scope here …
        rawQuote: { …, bidQty: null, askQty: null },
```

## TESTS
New `server/tests/unit/b-xstock-bid-trigger-reland-incb.test.ts` (P2 units incl. null/NaN/zero/negative and the throw; the census counts; the shadow exclusion; crossed: entry refuses, close does not, with the close-blocking mutation; the tripwire bar and the `size_invalid` split; the size lines on `console.warn`; the epoch migration's scope). Amended deliberately, each with the reason in place: fence 2d → the gated arm, plus 2g mutations (ungated, mark-only, inverted all red); the chain test decides on the bid by default, the arm-off control decides on the mark and names `reason=spread_blown_off`; the venue-pause tests moved their stop under the warm bids (they now prove a paused tick does not decide even with the bid through the stop); the paper-xStock, crypto-finish, X0, inc-3 and inc-3b fences re-pointed to the new lines; the depth tests carry `crossed`. Stubs in two engine-seam tests gained the new fields.
**Results (local):** the 13 related files 334/336 then 42/42 on the touched pair after the fold; the two failures in the first run were 5-second timeouts under parallel load that pass in isolation (81/81). Full suite: 7 failing tests / 10 failing files, IDENTICAL with my changes stashed (environment-dependent integration files and the clock-subscriber census). `tsc`: 335 errors = the baseline.

## HONEST RESIDUAL
- The TARGET leg of the bid trigger has no measured case (all 21 divergences were stops).
- `exit_decision_price` stays the mark on a taker close (8a-P4b J3, a label); the trigger side is log-only.
- The crossed walk still books a sell above the ask (counted, not fixed — its own home).
- The tripwire is unexercised in any `too_few` hour.
- Deploy timing: before 2026-10-19 13:30Z or after the 10-21 close — never inside increment (4a)'s window.
