# B-ENTRY-DISTANCE-GUARD — Step-4 change list (Langston code review)

**Batch:** `B-ENTRY-DISTANCE-GUARD` · sprint row 59 increment 1 (pre-sprint P1a) · `#915`, `#1168` · owner CC-B.
**Graded ref:** commit `c285745e9` on `origin/migration/aws-supabase` (one code commit; parent is docs).
**CI:** recorded in the dispatch post.

## DISPATCH HEADER
**(i) CHANGE-CLASS:** `architecture` (scope header, verbatim).
**(ii) DOC SET for `architecture`, at this ref:**
| document | state |
|---|---|
| batch `SCOPE` | present — `Scope Files/B_ENTRY_DISTANCE_GUARD_SCOPE.md` (Step 1 PROCEED, §7 your five findings) |
| batch `PRE_AUDIT` | present — `Scope Files/B_ENTRY_DISTANCE_GUARD_PRE_AUDIT.md` (§0 pre-registration `373d85e7b`, audit + plan `7e53da6ca`, r2 `bac54bf3d`) |
| `COMPLETION_REPORT` | absent — Step 11 |
| `BATCH_CATALOG.md`, `PHASE_HISTORY.md` | absent — Step 10 |
| `SYSTEM_MANUAL.md` | absent — Step 10 (plan item 8: what the open refuses, what it only logs, why OBJ-2 is shadow) |
| `SYSTEM_IMPACT_MAP.md` | absent — Step 10 (plan item 8: the booking's fill-time checks, the primitive's fourth caller, the stage, the shadow line, the counter) |
| `RUNNING_ISSUES.md` | present for this step — `#1183`, `#1184` filed at r2; `#915`/`#1168` close at Step 10 |
| `SPRINT_TO_LIVE_PLAN.md` | present — rows 59 (Step 1 status), 59a, 59b placed at r2 |
| `DELETED_COMPONENTS_LOG.md` | N/A for this increment — nothing removed (item 4, the 2 % target removal, is held for your BLOCKER-1) |
**(iii) STEP-2 REFERENCE:** `Scope Files/B_ENTRY_DISTANCE_GUARD_PRE_AUDIT.md` — plan items 1, 2, 5, 6, 7 built here; **3 (the band) and 4 (the three 2 % copies) NOT built**, held for your Step-2 blockers; 8 at Step 10.

## 1. Plan item → change
| item | change | ← finding |
|---|---|---|
| 1 OBJ-1 LIVE | `active-execution-engine.ts`, inside the taker `else`, right after `actualEntryPrice = _openFill.fillPrice`: `refuseTakerBooking(fill, stop, target)`; a refusal ⇒ `[ENTRY_GEOMETRY][REFUSED]` log, `recordOpenFailed(…'ENTRY_GEOMETRY', reason)`, an `entry_fill` archive row, `return { opened:false, stage:'ENTRY_GEOMETRY', reason }` — before any write | §1.1, A2, A3; your placement affirmation (a fourth sibling of the three `FILL_REJECTED` returns, downstream of `recordAttempt`) |
| 2 OBJ-2 SHADOW | the floor `getPerClassTargetGate(_openClass, strategy).minRR` read once, in the taker branch, BEFORE `openOrder`, inside a `catch` (`floor_unresolved=<msg>` on the line, the open proceeds); `entryFillShadow()` (pure, `entry-booking.ts`); one `[ENTRY_GEOMETRY][SHADOW]` line per taker open, written BEFORE the refusal decision | §1.2, A4, FINDING-1/2 |
| 5 the record | `'ENTRY_GEOMETRY'` in `OpenFailStage` and the zero-init list (`rtb-metrics-service.ts`); the archive row `gate:'entry_fill', accepted:false, reason, fillPrice, intendedEntryPrice, stopPrice, targetPrice`, `rejectStage:'tcl'` (the `DUP_POSITION` archive's shape); `[ENTRY_GEOMETRY][ARCHIVE_FAILED]` on an archive throw | A5, FINDING-5 |
| 6 `riskAmount`'s abs | unchanged — item 1 makes a fill at or below the stop unreachable there | FINDING-3 |
| 7 tests | `server/tests/unit/b-entry-distance-guard.test.ts` (17) | all |

## 2. The load-bearing hunks (at `c285745e9`)
**Before the fill (taker branch):**
```ts
    } else {
    // B-ENTRY-DISTANCE-GUARD OBJ-2 (shadow): the strategy's live `min_rr`, read ONCE per open and BEFORE the fill …
    let _entryFloor: number | null = null;
    let _entryFloorNote = '';
    try { _entryFloor = getPerClassTargetGate(_openClass, signal.strategy).minRR; }
    catch (floorErr) { _entryFloorNote = ` floor_unresolved=${JSON.stringify(floorErr instanceof Error ? floorErr.message : String(floorErr))}`; }
    const _openFill = await this.orderPlacer.openOrder({
```
**After the fill, before any write:**
```ts
    actualEntryPrice = _openFill.fillPrice;
    entryFee = _openFill.feeQuote;
    totalSlippage = _openFill.slippageQuote;
    const _shadow = entryFillShadow({ fill: actualEntryPrice, intended: signal.entryPrice, stop: signal.stopPrice, target: signal.targetPrice, floor: _entryFloor });
    console.log(`[ENTRY_GEOMETRY][SHADOW] ${signal.symbol} strategy=… class=… fill=… intended=… stop=… target=… rr_fill=… floor=… adverse_r=… would_refuse=…${_entryFloorNote}`);
    const _geom = refuseTakerBooking(actualEntryPrice, signal.stopPrice, signal.targetPrice);
    if (_geom !== null) {
      console.error(`[ENTRY_GEOMETRY][REFUSED] … reason=${_geom} — not opened`);
      rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'ENTRY_GEOMETRY', _geom);
      try { … archiveSignalEval({ … rejectStage: 'tcl', gateDecision: { gate: 'entry_fill', accepted: false, reason: _geom, fillPrice, intendedEntryPrice, stopPrice, targetPrice } }); }
      catch (archErr) { console.error(`[ENTRY_GEOMETRY][ARCHIVE_FAILED] …`); }
      return { opened: false, stage: 'ENTRY_GEOMETRY', reason: _geom };
    }
    }
```
**`entryFillShadow` (new, `server/core/trading/entry-booking.ts`):**
```ts
export function entryFillShadow(a: { fill: number; intended: number; stop: number; target: number; floor: number | null }): EntryFillShadow {
  const fin = (x: number) => Number.isFinite(x);
  const risk = a.fill - a.stop;
  const rrFill = fin(a.fill) && fin(a.stop) && fin(a.target) && risk > 0 ? (a.target - a.fill) / risk : null;
  const plannedRisk = a.intended - a.stop;
  const adverseR = fin(a.intended) && fin(a.fill) && plannedRisk > 0 ? (a.fill - a.intended) / plannedRisk : null;
  const wouldRefuse = a.floor === null || !fin(a.floor) || rrFill === null ? null : rrFill < a.floor;
  return { rrFill, adverseR, wouldRefuse };
}
```

## 3. Tests and checks
- `b-entry-distance-guard.test.ts` (17): the six replays from W1 (STZ, CEG, INTC, CRCL ⇒ `ask_at_or_through_stop`; ANET, BBY ⇒ `ask_at_or_through_target`); a fill inside passes; the knife-edge shadow case (RR 2.0, floor 1.95, fill +0.02 R ⇒ `wouldRefuse` true, rr 1.9412); at plan ⇒ false; floor null ⇒ null; fill below stop ⇒ rr null; the `morning_star` case (INTC at plan clears floor 1.0 — the population OBJ-1 catches and OBJ-2 does not); source fences: fill → refusal call → record → return → the first `createClosedTrade` in that order, no local copy of the primitive, the floor read before `openOrder` inside a catch, the shadow line before the decision, the archive-failure log; `ENTRY_GEOMETRY` zero-initialised and counted.
- **Mutant:** the refusal call replaced by `null` ⇒ 2 fail. **All 41 test files that import or read the engine: 675 pass.** tsc baseline 337 = 337.
- **Wiring is proved at the source**, as `b-sizing-inc2c-risk-retired.test.ts` does — `executeSimulatedTrade` needs the whole engine graph to run. The runtime proof is Step 7 (the shadow line on every taker open; a refusal when one occurs).

## 4. Judgement calls to attack
1. **The floor is read in the TAKER branch only**, not in `processSignal` as the plan said — the shadow line exists only for taker opens, so reading it for a maker would be a call with no consumer (FINDING-2's counter). Same "before the fill, inside a catch" property.
2. **The shadow line is `console.log` (out.log, ~1 day retained), not a durable record** — the promotion read will need W1-length data. Should it also stamp the admitted-open archive row (`:~6094`, which already carries entry/stop/target) with `rrFill`/`adverseR`/`floor`? That would make the shadow durable at no new write. I lean yes — say if you want it in this increment.
3. **`signal.entryPrice` is the intended price** — on a promoted RTB signal it is the queue-time entry, which is what `#1168` says the refresh never updates. The adverse move is therefore measured from the plan the signal carried, not from a refreshed one. That is the population the band is meant to judge.
