# B-NEW-34 — Round 3 — Pre-flight C findings + scope addition

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-15
**Status:** Round 3 — pre-flight C results + Round 2 sign-off on 5 SQL refinements absorbed

---

## 0. Pre-flight C executed per your scope expansion

You said "broaden from 'VTS granularity assumptions' to ALL strategy + VTS + exit-ladder granularity assumptions." Done. 28 findings across 11 files. Two BLOCKERS surfaced that require scope expansion to B-NEW-34. Everything else is calibration debt (Phase B of XSTOCK_CALIBRATION_PLAN.md).

## 1. The two blockers — both same root cause, both small fix

### Blocker A — `server/asset_classes/xstock_spot/global-filter.ts:125-132`

```typescript
if (ohlc.length < 60) {
  // Comment: "60 bars ≈ 1h of 1m candles — minimum warmup"
  return REJECT_INSUFFICIENT_HISTORY;
}
```

On 60-min bars: 60 bars = 60 HOURS of history required = ~2.5 trading days. Every xstock fails this gate until 60 hourly bars accumulate. The post-deploy "no signals" window is ~3 days, not minutes.

### Blocker B — `server/asset_classes/xstock_spot/pattern-filter.ts:211`

Identical 60-bar floor in the pattern-IMF lane. Same problem, same fix.

### Combined fix

Lower floor to 20 bars (= 20 hours of 60-min OHLC) and promote to `module_constants`:

```
INSERT module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value)
VALUES ('xstock_spot', '*', 'xstock_spot', '*', '*', 'min_ohlc_history_bars', 20);
```

Then both filters read the constant via the existing `getConstant()` pattern. Twenty bars chosen because:

1. **Solves the post-deploy blocker** — 20 hourly bars = 20h = roughly 1 trading day. xstocks start firing signals ~1 day after deploy, not 2.5.
2. **Solves your Monday-morning cold-start concern from Round 2** — Friday open (13:30 UTC) → Friday close (20:00 UTC) + extended-hours close (00:00 UTC) = ~10 hours of bars on Friday. Plus Monday pre-market 09:00-13:30 UTC = 4.5 hours. Total ~14.5 hours by Monday open, plus a few more during pre-market = 18-20 by Monday 13:30 UTC. Floor at 20 means Monday morning has just barely enough — Phase-1 names start firing shortly after Monday open, ARCA-aligned names firing by mid-morning.
3. **Avoids over-fitting** — too low (e.g., 10 bars) and indicators like ADX(14) lose statistical meaning. 20 bars gives the 14-period indicators 6 bars of free room.
4. **Calibratable later** — promoting to module_constants means Phase B can tune up or down empirically without code change.

### Crypto-side fence: ZERO impact

Both global-filter.ts and pattern-filter.ts are under `server/asset_classes/xstock_spot/`. Crypto's equivalents in fx5-scanner have their own thresholds. Crypto's no-touch fence holds.

## 2. Round 2 SQL refinements — absorbed into Round 3 scope

All 5 of your Round 2 SQL flags are now explicit Step 3 implementation requirements:

| # | Round 2 flag | Step 3 implementation |
|---|---|---|
| 1 | Open/close need ordered aggregation | Use `(array_agg(open ORDER BY interval_begin))[1]` for open + `(array_agg(close ORDER BY interval_begin))[array_length(...)]` for close, OR equivalent window-function pattern. Add golden-fixture rollup test (your "regression insurance"). |
| 2 | Partial-bar semantics — emit in-progress? | YES emit. Match crypto. Document in SYSTEM_MANUAL "Bar interval — design rationale". |
| 3 | 240-min boundary alignment | `to_timestamp(floor(extract(epoch from t)/14400)*14400)` — UTC 00/04/08/12/16/20 boundaries matching Kraken's 4h candle alignment. |
| 4 | Query fanout (75×2=150) | Single SQL: `WHERE symbol = ANY($1) AND interval_begin > NOW() - INTERVAL '$2'`. Postgres groups in-process. One round trip per interval (so 2 total per cycle, not 150). |
| 5 | Cache depth — why 720? | Lean tighter per your suggestion. 200 bars for 60-min (8 trading days history) and 60 bars for 240-min (10 trading days). Total memory: 265 × (200 + 60) × 80 bytes ≈ 5.5 MB — way under the previous 30 MB estimate. |

## 3. Other Round 2 items — concur as-stated and absorbed

- Pre-flight C scope expansion: done, this round 3 is the result.
- Golden-fixture rollup regression test: added to Step 7 verification.
- Cache depth: tightened to 200/60 (item #5 above).
- 240-min warming math: confirmed 75 × 4 = 300 ≥ 265 holds because rotation cursor is deterministic with no batch overlap. Will add a one-line Step 7 assertion.
- Monday-morning floor: SOLVED by the 20-bar floor (see §1). No skip-and-document needed.

## 4. defensive-hedge strategy — separate decision

Pre-flight C flagged that `defensive-hedge.ts:91-99` uses BTC as the correlation reference. For xstocks the right benchmark is SPY or QQQ.

Three options:

A. **Leave active for xstocks, knowing correlations will be near-zero.** Strategy almost never fires for xstocks. Benign — no wrong trades, just no trades.
B. **Disable for xstocks via registry (same as ORB).**
C. **Plumb SPY as the equity benchmark.** Real fix. But not B-NEW-34 scope — calibration Phase A item.

**My lean: A (leave active).** Defensive-hedge produces zero false positives with near-zero correlations to BTC for unrelated equity tokens. Phase A of calibration plan addresses it properly with SPY plumbing. Disabling now creates two-time-touched complexity for no observable benefit.

Do you concur?

## 5. Updated B-NEW-34 SCOPE (final)

Changes from Round 2:

ADDED to scope:
- `server/asset_classes/xstock_spot/global-filter.ts:125-132` — replace hardcoded 60-bar floor with `getConstant('xstock_spot', 'min_ohlc_history_bars')` lookup
- `server/asset_classes/xstock_spot/pattern-filter.ts:211` — same
- New `module_constants` row: `xstock_spot.min_ohlc_history_bars = 20`

UNCHANGED from Round 2 plan:
- All other items in §4 of Round 2 design ask

REJECTED for B-NEW-34 (carried into XSTOCK_CALIBRATION_PLAN.md Phase B):
- LQ/VN/momentum/regime threshold recalibration (~10 module_constants rows under `xstock_spot/regime-thresholds.ts`)
- defensive-hedge BTC→SPY benchmark plumbing
- ADX/Donchian/RSI period adjustments per strategy
- 300-period Z-score window cadence
- macro-modifier xstock-specific feeds (VIX/DXY)
- maxHoldingPeriod semantic verification

These are real concerns but all per-pair threshold calibrations, which is precisely what Phase B exists to address with empirical data.

## 6. Updated verification additions

Step 7 first-pass adds:
1. **Golden-fixture rollup test** — locked test fixture covering one symbol's 4-hour window with hand-computed expected 60-min + 240-min values. CI guards against silent regressions.
2. **Confirm 240-min cache warms within 4 cycles** — single line assertion.
3. **Floor parameter verified live** — `SELECT value FROM module_constants WHERE constant_name='min_ohlc_history_bars'` returns 20.
4. **Spot-check xstock pair within first hour post-deploy** — pick a Phase-1 name (AAPL or TSLA), confirm scanner evaluates it (no insufficient-history rejection by min 1 hour after deploy).
5. **48-hour signal-rate baseline** — log signal generation rate on xstock pipeline for 48 hours after deploy. Compare to 7-day pre-deploy baseline (currently ~14-55 trades/day). Don't gate Step 8 sign-off on this number (too short a window), but record it for the calibration baseline.

## 7. Action requested (round 3)

1. Concur the 2 blocker fixes (global-filter + pattern-filter floor lowered to 20, promoted to module_constants).
2. Concur defensive-hedge "leave active" call (option A) — OR push back if you'd prefer B.
3. Confirm the floor value: 20. Reasonable? Too aggressive? Too conservative?
4. Green-light Step 3 implementation.

Time-box: 10 minutes of your time if no pushback. Step 3 implementation starts immediately after.

— Claude Code, 2026-05-15
