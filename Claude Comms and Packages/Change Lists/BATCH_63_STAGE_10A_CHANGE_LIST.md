# Batch 63 — Stage 10A Change List

**Stage:** 10A — Counter-trend LONG guards (Item 10 of BATCH_63_SCOPE.md)
**Author:** Claude Code
**Date:** 2026-04-21
**Branch:** `migration/aws-supabase`
**Ready for:** Langston code-level review BEFORE push

---

## Scope of this commit

Apply Item 10 `b63b_counter_trend_long_exclusion` guard — block LONG-only strategies from firing on pairs with strong NEGATIVE DBS (`dbsScore <= -0.35`). Mirror of the existing B63 Item 6 positive-DBS guard.

Target strategies (confirmed LONG-only):
- `morning_star` — BUY only
- `reverse_impulse` — LONG only (pinbar reversal)
- `defensive_hedge` — `direction: 'BUY'` only (verified per Langston's pre-audit resolution)
- `sma_trend_ride` — LONG-only trend-rider

**NOT included in this stage:**
- `vwap_pullback` — restructured in Stage 10B+10C (Items 11/12/14), not here
- `volatility_edge` — audit did not flag mirror-defect contribution; no action
- Any strategies outside the LONG-only set

---

## Files changed (4)

```
 server/services/strategy-engine.ts   | 17 ++++++++++++++---
 server/strategies/defensive-hedge.ts |  8 ++++++++
 server/strategies/morning-star.ts    | 11 ++++++++++-
 server/strategies/reverse-impulse.ts |  8 ++++++++
 4 files changed, 40 insertions(+), 4 deletions(-)
```

### `server/strategies/morning-star.ts`
Added mirror guard after existing `dbs >= 0.35` guard. Also cleaned stale comment ("Strong negative DBS (bear trends) still handled here") that was no longer accurate once the new guard was added.

### `server/strategies/reverse-impulse.ts`
Added mirror guard after existing `dbs >= 0.35` guard.

### `server/strategies/defensive-hedge.ts`
Added mirror guard after existing `dbs >= 0.35` guard. Directionality verified — `direction: 'BUY'` only.

### `server/services/strategy-engine.ts` (sma_trend_ride block)
Added mirror guard at top of `detectSMATrendRide`. No paired positive-DBS guard added — high-positive-DBS pairs are routed exclusively to Path D per B63 Item 4 and never reach sma_trend_ride's quant family. The mirror guard is sufficient.

Also normalized trailing whitespace on two lines near the function signature (no behavior change).

---

## Guard pattern (identical across all four strategies)

```ts
if (((indicators as any).dbsScore ?? 0) <= -0.35) {
  setNullReason('b63b_counter_trend_long_exclusion');
  return null;
}
```

Placement:
- In strategies that already had the B63 Item 6 positive-DBS guard: placed IMMEDIATELY AFTER that guard. Together they cover `|dbs| >= 0.35`.
- In sma_trend_ride (no existing positive-DBS guard): placed at top of `detectSMATrendRide`.

Null-reason code: **`b63b_counter_trend_long_exclusion`** — new, distinct from `b63_strong_dbs_exclusion` so logs and diagnostics can separate the two gate types.

---

## Verification — what Langston should check in the diff

1. **Guard placement** — does every guard appear ABOVE all detection logic (before ATR checks, candle parsing, etc.)? If placement is deep inside the function, early work happens before the guard fires.
2. **Null-reason string consistency** — every addition uses `b63b_counter_trend_long_exclusion` literal string. Grep should find exactly 4 new instances.
3. **Threshold is `-0.35` not `-0.30`** — matches the B63 positive-DBS threshold for symmetry. The counterfactual audit used 0.30 but B63's threshold convention is 0.35.
4. **No changes to logic below the guards** — guards are purely additive; the existing detection logic below is untouched.
5. **No changes to other strategies** — grep the diff, should show exactly these 4 files.
6. **`direction: 'BUY'`-only strategies only** — this is a LONG-only guard; if any of the 4 strategies is mixed-direction, the guard would incorrectly block legitimate SHORT entries. All 4 verified LONG-only.
7. **Comment quality** — each comment references BATCH_63_COUNTERFACTUAL_AUDIT for traceability and cites the specific count of mirror-defect trades each strategy contributed (22 morning_star, 54 reverse_impulse, 2 defensive_hedge, 1 sma_trend_ride).

---

## Expected behavior post-deploy

- Log search for `b63b_counter_trend_long_exclusion` should return > 0 occurrences within minutes (pairs with DBS ≤ -0.35 do exist in current market; guards will fire on those pairs when any of the 4 strategies attempts detection).
- Closed LONG trades with `pairDirectionalBiasScore ≤ -0.35` in the 48h window post-deploy: target **0**.
- Morning_star / reverse_impulse / defensive_hedge / sma_trend_ride non-zero count on DBS ∈ (-0.35, +0.35): still firing where appropriate. Guards did not over-restrict.

---

## TypeScript check result

Pre-existing tsc errors in the codebase (client components, vts-telemetry) are unchanged — not introduced by this diff. Zero new tsc errors in the four files touched. CI should remain green on push.

---

## Out of scope reminder

- No vwap_pullback changes (Stage 10B+10C scope)
- No mode-overlay bypass changes (Stage 10B+10C scope)
- No global DBS changes (Stage 16 scope)
- No audit work ships as code in this stage (Items 15/18/19 are audit-only)

---

## Post-review actions (on Langston approval)

1. `git add` the 4 files
2. Commit message: `B63 Stage 10A: counter-trend LONG guards on morning_star, reverse_impulse, defensive_hedge, sma_trend_ride (Item 10)`
3. Push to `migration/aws-supabase`
4. Verify CI all 4 checks GREEN
5. Deploy to staging: `git pull && npm run build && pm2 restart dawntrader`
6. First-pass verification: log grep for `b63b_counter_trend_long_exclusion`; count > 0 within 5 minutes
7. Second-pass verification: Langston confirms from independent observation
8. Proceed to Stage 10B+10C scope (Items 11/12/14)
