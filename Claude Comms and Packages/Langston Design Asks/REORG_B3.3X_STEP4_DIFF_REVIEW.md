# reorg-B3.3x — Step-4 diff review (CC-B → Langston)

INFRASTRUCTURE NOTE: read THIS file directly (local FS). For repo inspection use `ssh staging`.

Bench: **tsc baseline OK — no regressions.** New unit test `reorg-b3-3x-xstock-vts-gate` **5/5**. Diffstat:
`eval-cycle.ts +83/-10`, `vts-runner.ts +10` (the sink fix). No migration.

---

## ★ Your Step-1 OBJ-3 catch — CONFIRMED + FIXED (you were right; "zero sink change" was wrong)

I verified your finding: `RegisterOpenVtsTradeInput` (vts-runner.ts:3057) had **no `vtsGateVerdict`**, and my
`xOpenTrade.vtsGateVerdict` only type-checked because excess-property checks are bypassed on a variable (not a
direct literal) — so the sink **silently ignored it.** OBJ-3 was inert as first written. Fix (the "add a field +
thread it" path, not "zero change"):

```diff
// vts-runner.ts — RegisterOpenVtsTradeInput
  amrClassification?: string;
  amrMode?: string;
+ vtsGateVerdict?: 'passed' | 'rr_below_min' | 'unreachable';
}
// vts-runner.ts — registerOpenVtsTrade's openTrade: OpenVirtualTrade construction
    sourcePool: input.sourcePool,
+   vtsGateVerdict: input.vtsGateVerdict,
    atrAtOpen: input.atrAtOpen,
```

**Where the verdict lands (your sub-question answered):** the `openTrade: OpenVirtualTrade` record that
`registerOpenVtsTrade` builds (:3151) — the SAME `OpenVirtualTrade` type (:564) crypto's inline path stamps at
~:1649 — which goes to the in-memory `openVirtualTrades` Map (:3221) + `insertOpenTrade` (:3211). So xStock now
lands the verdict on the EXACT surface crypto uses. **Honest limitation (shared, pre-existing, NOT a B3.3x
regression):** `vtsGateVerdict` is **in-memory-only — there is no DB column** (reorg-B3.2's deliberate
no-migration; re-derivable from geometry). So the "what active would do" filter is queryable on LIVE open
trades, not closed/historical, for BOTH classes today. If historical analysis needs it, that's a shared
follow-up (a DB column on the open/closed-trade tables) — I can home it; it's out of B3.3x's scope and affects
crypto equally. The completion report will state this correctly (not "zero sink change").

## 1. The shared normalizer block (eval-cycle.ts, after `finalScore`, BEFORE the Net-EV kernel)

```ts
const _b3xGate = getPerClassTargetGate(ASSET_CLASS);          // ASSET_CLASS = the file-level 'xstock_spot'
const _b3x = normalizeAndGateTarget({
  entryPrice, stopPrice: stopLoss, targetPrice: takeProfit,    // entry :607 / stop :609 / target :608
  floorPct: _b3xGate.floorPct, minRR: _b3xGate.minRR,
  atr: mceContext.indicators.atr, reachAtrMax: _b3xGate.reachAtrMax,  // atr from mceContext (in scope, used :611)
});
let vtsGateVerdict: 'passed' | 'rr_below_min' | 'unreachable' = 'passed';
if (!_b3x.ok) {
  if (_b3x.reason === 'rr_below_min' || _b3x.reason === 'unreachable') {  // POSITIVE-NARROW (flat type)
    vtsGateVerdict = _b3x.reason;                              // TAG + simulate (native target retained)
    console.log(`[reorg-B3.3x][VTS][TAG_NO_DROP] ${symbol}/${strategyKey} would-gate=${_b3x.reason} rr=${_b3x.rr.toFixed(2)} — simulating anyway...`);
  } else {
    // invalid_atr / invalid_geometry → DROP (validity); invalid_atr loud; counters + archive(rejectStage 'sqe'); continue.
  }
}
```
And the un-strangle itself:
```diff
  strategySignal = callStrategyDetect(
    strategyKey, mceContext.indicators, ohlc as any, stratPatternInput as any, symbol, ASSET_CLASS,
+   'tag', // reorg-B3.3x: xStock VTS — strategy guard no longer hard-drops quality fails; normalizer tags them
  );
```

## 2. Your five Step-4 catches — addressed

1. **Asset-class to `getPerClassTargetGate` is the xStock class, not a default.** `getPerClassTargetGate(ASSET_CLASS)` — `ASSET_CLASS` is the file-level `'xstock_spot'` literal (same constant the kernel call uses at :638-640). No `?? crypto_spot` default anywhere on this path.
2. **Normalizer placement vs input availability.** Placed right after `finalScore` — `entryPrice`/`stopLoss`/`takeProfit` are resolved at :607-609 and `mceContext.indicators.atr` is in scope (used at :611, well before). I did NOT copy "right after detect :526" literally — I placed it where ALL four inputs are ready, BEFORE the Net-EV kernel (your slot-ordering requirement). The :753 `atr` you flagged was just another READ of the same `mceContext.indicators.atr`, not its definition.
3. **Positive-narrow verdict typing.** `if (reason === 'rr_below_min' || reason === 'unreachable')` → tag; the `else` (incl. invalid_atr/invalid_geometry AND any future/unknown reason) → DROP. Mirrors vts-runner:1220-1228; `!ok` does not narrow the flat `TargetNormalizeResult`.
4. **`'tag'` on the VTS dispatch ONLY.** eval-cycle is VTS-only (`mode:'vts'` throughout); the xStock active path (`dispatchXstockActiveSignal` → orchestrator, which already has its own normalizer at :1227) is untouched and stays default-`'enforce'`.
5. **Tests incl. explicit `invalid_geometry` (target≤entry).** `reorg-b3-3x-xstock-vts-gate` 5/5: healthy→pass; valid-low-RR→rr_below_min→TAG; far→unreachable→TAG; **target==entry→invalid_geometry→DROP** (the new backstop xStock gains); atr≤0→invalid_atr→DROP. Each asserts the reason→disposition partition with xStock-shaped inputs (minRR 2.5, reach 4.0).

## 3. Sequencing confirm (your Step-3 note)

The normalizer and the Net-EV floor (:~660) stay sequential + orthogonal — normalizer FIRST (geometry/RR/
reachability/validity), floor UNCHANGED (friction-adjusted EV). A tag'd-through signal (rr_below_min/unreachable)
flows on to hit the :660 floor exactly as today. The un-strangle is at the strategy guard ('tag'), not the floor.

## 4. Governance (your §16) — committed for Step-10

SYSTEM_MANUAL §11 (xStock VTS gate chain now unified onto the shared normalizer — the disposition is the shared
VTS gate for crypto AND xStock) + SIM §1.2a-2 (xStock VTS path entry) + BATCH_CATALOG + PHASE_HISTORY +
RUNNING_ISSUES #382 RESOLVED + PHASE_19_PLAN + completion report (with the corrected OBJ-3 wording).

Ask: CONCUR to push? Step-7 will confirm xStock `[reorg-B3.3x][VTS][TAG_NO_DROP]` markers fire + xStock VTS
opens carry `vtsGateVerdict` + some candidates now drop on `invalid_geometry` (your "backstop does real work"
check #3 — I'll report the count).
