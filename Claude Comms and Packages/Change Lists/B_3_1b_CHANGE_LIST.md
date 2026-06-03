# B3.1b — Volume-confirmation removal (xStock path) — CHANGE LIST for Langston code review (Step 4)

**INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run `git`/`grep` on the gdrive mount (FUSE hangs). Everything is embedded below. For repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.**

## What + why (1 paragraph)
B3.1a settled that the xStock per-bar volume is the UNDERLYING-EQUITY share volume (ws-equities OHLC channel; ~$6.8B/day SPY vs <$1M/24h token market), and that the only honest replacement (top-of-book depth-delta) has no forward-return signal (AUC ~0.50). So B3.1b REMOVES volume-confirmation on the xStock strategy paths — NOT replace (NO-PATCHES). Mechanism: a per-class numeric flag `volume_confirmation_enabled` (1=on, 0=off) under each volume-touching strategy module, read via the existing `getCachedNumbersForModule` per-class resolver; the gate is bypassed when 0. Seeded global `*`=1 (crypto + all non-xStock = enabled, behavior preserved) + `xstock_spot`=0 (override). **Crypto KEEPS its volume gates.** Both VTS + active paths read the same flag. Verified: tsc clean on all 4 touched files; new unit test green; staging behavioral verification to follow (§9.3).

## NEW — migration `drizzle/migrations/2026-06-03-b3-1b-xstock-volume-confirmation-disable.sql`
14 rows (7 volume-touching modules × {global=1, xstock_spot=0}), idempotent ON CONFLICT:
```sql
INSERT INTO module_constants (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('strategy.vwap_pullback','volume_confirmation_enabled','1'::jsonb,'*','*','*','*',NOW(),'b3.1b'),
  ... (vwap_bounce, breakout, abcd_long, inside_bar_reversal, pivot_shift, morning_star — all '1' global) ...
  ('strategy.vwap_pullback','volume_confirmation_enabled','0'::jsonb,'xstock_spot','*','*','*',NOW(),'b3.1b'),
  ... (same 7 modules — all '0' for xstock_spot) ...
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = 'b3.1b';
```

## MODIFIED — 3 quant detectors in `server/services/strategy-engine.ts` (bypass folded INTO the confirmation boolean)
**detectVWAPPullback** (~line 162):
```diff
   const avgVolume = totalVolume / lookbackPeriod;
-  const hasVolumeConfirmation = volume >= avgVolume * volumeMultiplier;
+  const volConfirmEnabled = (c['volume_confirmation_enabled'] ?? 1) !== 0;
+  const hasVolumeConfirmation = !volConfirmEnabled || (volume >= avgVolume * volumeMultiplier);
   ...
   if (priceAboveVWAP && nearVWAP && hasReversalPattern && hasVolumeConfirmation) {
```
**detectVWAPBounce** (~line 803): `const hasVolume = !volConfirmEnabled || (volume >= avgVolume * volumeMultiplier);` (same pattern; flag read added above it).
**detectBreakout** (~line 528): `const hasVolumeSpike = !volConfirmEnabled || (currentVolume >= avgVolume * volumeMultiplier);` (same).
> NOTE: the `volume_confirm_min_history` / `totalVolume===0` `insufficient_data` guards in detectVWAPPullback are LEFT in place (they rarely fire for xStock: history>10 and underlying-equity volume is never 0). They are data-sufficiency guards, not the volume-confirmation gate. Flag if you'd prefer them gated too.

## MODIFIED — 2 pattern detectors (gate the `volume_insufficient` early-return)
**`server/strategies/inside-bar-reversal.ts`** (constants block + ~line 144):
```diff
   const IB_VOL_MULT           = c.volume_threshold_multiplier;
+  const IB_VOL_CONFIRM        = (c.volume_confirmation_enabled ?? 1) !== 0;
   ...
-  if (avgVolume === 0 || breakoutVolume < avgVolume * IB_VOL_MULT) {
+  if (IB_VOL_CONFIRM && (avgVolume === 0 || breakoutVolume < avgVolume * IB_VOL_MULT)) {
       setNullReason('volume_insufficient'); return null; }
```
**`server/strategies/pivot-shift.ts`** (~line 144): identical pattern with `PS_VOL_CONFIRM` / `PS_VOL_MULT`.

## MODIFIED — morning_star SOFT volume bonus (`server/strategies/morning-star.ts`, ~line 182)
morning_star's volume is a confidence factor, not a hard gate. Neutralized when disabled so wrong data does not nudge xStock confidence:
```diff
+  const MS_VOL_CONFIRM       = (c.volume_confirmation_enabled ?? 1) !== 0;
   ...
-  const volumeBonus = volumeRatio >= 2.0 ? MS_HIGH_VOL_BONUS : volumeRatio >= 1.2 ? 0.04 : volumeRatio >= 0.8 ? 0 : -0.04;
+  const volumeBonus = !MS_VOL_CONFIRM ? 0
+    : volumeRatio >= 2.0 ? MS_HIGH_VOL_BONUS : volumeRatio >= 1.2 ? 0.04 : volumeRatio >= 0.8 ? 0 : -0.04;
```

## NEW — test `server/tests/unit/b3-1b-volume-confirmation-per-class.test.ts`
Mocks the DB layer (mirrors b65 resolver test). Asserts: flag resolves 1 for crypto / 0 for xstock_spot; bypass expression → gate-active crypto, gate-bypassed xStock; absent row → enabled default; crypto_perp falls through to global=1 when only xstock override exists. (3 tests, green locally.)

## Review asks
1. Mechanism sound (per-class numeric flag via the tested resolver, default-enabled)?
2. Leaving the vwap_pullback `insufficient_data` volume-history guards in place — agree, or gate them too?
3. Including morning_star's soft confidence bonus in the same flag — agree (data-correctness) or keep B3.1b to hard gates only?
4. abcd_long seeded but disabled for xStock — harmless future-proofing, or drop it from the seed?
5. Anything else before push? (CI = the authoritative full-project gate; local tsc clean on the 4 files.)
