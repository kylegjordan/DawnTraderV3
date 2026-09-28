# B-XSTOCK-BID-TRIGGER-RELAND (row `3n.q7`) INCREMENT 1 — STEP 4 CHANGE LIST

**Graded ref:** `f0a5db295` on `origin/migration/aws-supabase` (the code commit itself). **CI:** run `36496094817` on `f0a5db295`, 4/4 green per job (TypeScript Check · Test Suite · Build · Docker Build). **Telemetry only: no decision input changes.**

## DISPATCH HEADER (workflow-04, three fields)
| # | field | value |
|---|---|---|
| i | **declared change-class** | `sub_batch` — `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` (Langston C1; the checker's own `batchIdToFileRegex` + `CHANGE_CLASS_MARKER` read it as `sub_batch`, and reject the near-miss `…RELANDX_SCOPE.md`) |
| ii | **doc set for `sub_batch`** (`config.mjs:129-132`) | `completion_report`: **absent, due Step 11** · `batch_catalog`: **absent, due Step 10** · `phase_history`: **absent, due Step 10** · `scope`: **present**, `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` · `pre_audit`: **present**, `B_XSTOCK_BID_TRIGGER_RELAND_PRE_AUDIT.md` (`d00b3af9a`) · `system_manual`: **judged N/A**, no pricing or decision change · `sim`: **applicable, due Step 10** (exit-path log line + two per-cycle counters + the fence) · `changes_and_fixes`: **applicable, due Step 10** · `running_issues`: **judged N/A** unless the window read files a finding · `deleted_log`: **N/A**, nothing removed · `adjustment_framework`: **N/A** · `phase_19_plan`: **applicable, due Step 10** (row `3n.q7`) |
| iii | **Step-2 reference** | `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_PRE_AUDIT.md` at `d00b3af9a` — cleared by Langston 2026-09-28T22:58Z with C1-C3 |

## FILES
| file | status |
|---|---|
| `server/services/xstock-exit-frame-log.ts` | NEW — the pure line builder |
| `server/services/active-execution-engine.ts` | MODIFIED — import, reason plumbing, emit, counters, EVAL_EXIT suffix, fence |
| `server/tests/unit/b-xstock-bid-trigger-reland-frame.test.ts` | NEW — 13 tests (9 behaviour incl. 4 reason cases, 4 wiring) |
| `server/tests/unit/b-price-side-8a-p4b-paper-xstock.test.ts` | MODIFIED — the X3 frame-argument pin extended to the new log object; the trigger-slot assertion unchanged |
| `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` | NEW — C1 |

## THE LINE (`xstock-exit-frame-log.ts`)
```ts
export function xsExitFrameLine(i: XsExitFrameLineInput): string | null {
  const evalIsXs = i.evalCls === 'xstock';
  if (!evalIsXs && i.frame === null) return null;
  const state =
    i.frame === null ? 'frame=none reason=no_frame_object'
      : (i.frame.bid === null || i.frame.ask === null) ? `frame=none reason=${i.frame.reason ?? 'unset'}`
        : `frame=ok basis=${i.frame.basis ?? 'none'}`;
  const mismatch =
    evalIsXs && i.frame === null ? ' class_mismatch evalCls=xstock posClass=not_xstock'
      : !evalIsXs ? ` class_mismatch evalCls=${i.evalCls} posClass=xstock_spot`
        : '';
  ... `[3n.q7][XS_FRAME] ${symbol} pos=${id} ${state}${mismatch} mark= sl= tp= bid= ask= spread= thr= bidWouldFire= markExit=`
}
```

## THE ENGINE
**Reason plumbing (C/P2):** `let xsFrameReason: string | null = null;` beside `xsBid`. Guard-off arm: crossed ⇒ `'unguarded_crossed'`, else (a side missing, non-positive or non-finite) ⇒ `'unguarded_not_two_sided'`. Guarded arm, `_gSides` null ⇒ `_crossed ? 'guarded_crossed' : 'guarded_non_finite'`. Caller BEFORE → AFTER:
```ts
_posClass === 'xstock_spot' ? { bid: xsBid, ask: xsAsk, spread: xsSpread, thr: xsThr } : null,
_posClass === 'xstock_spot' ? { bid: xsBid, ask: xsAsk, spread: xsSpread, thr: xsThr, basis: xsSideBasis, reason: xsFrameReason } : null,
```
**Emit (P1 + C2), immediately after `this._exitEvalByClass[_evalCls].invoked++;`:**
```ts
{
  const _xsLine = xsExitFrameLine({ symbol: position.symbol, positionId: String(position.id), evalCls: _evalCls, frame: xsFrame,
    mark: currentPrice, stopLoss, takeProfit, bidWouldFire: _xsBidStop ? 'stop' : _xsBidTarget ? 'target' : 'no', markExit: !!decision.shouldExit });
  if (_xsLine !== null) {
    if (_evalCls === 'xstock') this._xsFramesEmitted++;
    if ((_evalCls === 'xstock') !== (xsFrame !== null)) this._xsFrameClassMismatch++; // either direction
    console.warn(_xsLine);
  }
}
```
**Fence + counters:** `EVAL_EXIT` gains ` xsFrames=${emitted}/${xstock.invoked} xsFrameClassMismatch=${n}`; before the per-cycle reset, `emitted !== xstock.invoked` ⇒ `console.error('[3n.q7][XS_FRAME_RECONCILE_BROKEN] …')`. **Labelled in code as a DRIFT DETECTOR** (equal by construction today), never as proof of coverage (C2).

## TESTS AND MUTATIONS
Behaviour (called): frame=ok + basis · each of the four reasons · null object ⇒ `no_frame_object` + mismatch · a frame on an `other`-classed tick is emitted with mismatch (C2) · CONTROL crypto with no frame ⇒ null · a realistic worst-case line < 375 B (C3). Wiring (source, comments stripped): emit + write right after `invoked++` · the fence and the `xsFrames=` print · the caller's frame carries basis + reason and all four reason assignments exist · the counters reset after the fence reads them.
**Mutations, all 6 KILLED:** emit removed · emit for all classes · reason dropped in the line · reason not carried by the caller · fence removed · a mismatch frame dropped. Existing exit suites re-run green: 8a-P1 (33), 8a-P4b (25), exit-provenance (25), w21 (12).
**tsc:** the engine's three baseline `TS2339 Property 'assetClass' does not exist on type '{}'` entries are unchanged in count (their line numbers moved); no new error in either file.

## JUDGEMENT CALLS I WANT ATTACKED
1. **The emit uses `console.warn` inside the per-position loop, synchronously.** At 20 held xStock positions it is ~13 lines/s; PM2 buffers stdio. Acceptable, or should it batch per cycle?
2. **`markExit` reads `decision.shouldExit`** — the mark trigger's verdict, the other half of the bid-vs-mark comparison. The static stop/target caveat (row `3n.q7` note (c)) still binds.
3. **`positionId` is `String(position.id)`**: the episode key for the n-floor. A position that reopens under a new id is a new episode.

## ✅ STEP 4 — APPROVED at `f0a5db295` (Langston, 2026-09-29), four conditions, all folded in the deployed ref
| # | condition | disposition |
|---|---|---|
| 1 | `markExit` is true for ANY exit reason while `bidWouldFire` is level-only; a non-level exit (`timeout`, `stale_timeout`, `moonbag_timeout`) would read as a divergence. | **Done:** the line carries `exitReason=<reason|none>` from `decision.exitReason`; tested. |
| 2 | Bind the budget to position count, not line length: ~48 held crosses 1 GB/day and shortens `error.log`'s reach for every instrument. | **Done (plan P3):** re-budget above 30 concurrent xStock positions or any `error.log` day over 600 MB. |
| 3 | The mirror arm (`evalCls xstock`, no frame) is unreachable by construction; the mismatch counter is one-directional and its zero is not evidence of agreement. | **Done:** labelled in code (helper and engine). |
| 4 | The 2026-09-19 notes (a) `endedBy=converged` on a lost frame and (b) `ticks` vs `durMs` were undispositioned. | **FIXED, not withdrawn:** the X3 END line prints `endedBy=frame_lost` when the bid disappeared; the `ticks`/`durMs` convention is stated at the line; the per-tick line is named the rate source. Tested. |
**Nit:** the Step-2 clearance is dated 2026-09-28T22:58Z (was stamped 2026-09-29). **Line length:** typical 217 B, true worst 330 B, measured with the real function.
