# P19-B5a chunk-A — Step-3 verify-before-edit findings: 4 site-list corrections (need your re-sign-off before I hook)

**From:** Claude New (CC-B) · **Date:** 2026-06-16 · **For:** Langston · **Re:** your chunk-A sign-off (you gated "no hook is written until you sign off on this list")

**INFRASTRUCTURE NOTE:** Read THIS inbox file directly (local FS, fast). Do NOT cd to /mnt/gdrive or run git on the gdrive mount. For any repo inspection beyond the snippets below use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

I did the verify-before-edit pass on every signed-off site (your Q-A "pin the SoT before writing the gate" + rule-18). Net: the SEMANTIC framework you signed holds 1:1, but **4 of the concrete sites in the tagged list point at the wrong line** — every correction is a direct application of YOUR Q3 principle ("logging a reject for a pair that proceeds to trade is semantically-false telemetry"). I will not write a hook until you bless the corrected list.

---

## GATE + MODE — SoT pinned (your Q-A condition satisfied, no new boolean)

- **fx5-scanner** `scanMode(mode: 'paper' | 'live')`: `earlyContext = await storage.getSystemContext(mode)` (:674) → `isEngineActive = earlyContext?.isEngineActive || false` (:1127). All fx5 capture sites sit AFTER :1127 except the family loop which is after it too — `isEngineActive` is in scope. Gate = `if (isEngineActive)`.
- **market-scanner** `collectAdaptiveBatch(krakenService, filters, mode: 'paper'|'live', options)`: `isPassiveLearning = options?.passiveLearning ?? false` (:532). fx5 calls it (:803-808) with `passiveLearning: isPassiveLearningMode` where `isPassiveLearningMode = !(earlyContext?.isEngineActive)` (:682). **So market-scanner's `!isPassiveLearning` IS fx5's `isEngineActive` threaded down — the same canonical SoT, an EXISTING in-scope flag, not a parallel boolean.** Gate = `if (!isPassiveLearning)`.
- **mode → RunMode:** `tradingModeToRunMode(mode)` (run-mode-controller.ts:34) = paper→`paper_sim`, live→`live`. The single mapping site. Stamped at each hook.
- **exchange/assetClass:** both scanners are the CRYPTO path → `exchange:'kraken'`, `assetClass:'crypto_spot'`.

---

## CORRECTION 1 — DROP `core_imf_lq_vn` (fx5 :1089). It is NOT a drop anymore.

`passesMetricFilter` has exactly 3 references: computed (:1043), LOGGED (:1089), attached to the returned object (:1108). **No `.filter()` anywhere consumes it.** The Batch-43 comment at :1133 is explicit:

```
// Batch 43: Global quant IMF stage REMOVED.
// classifiedSurvivors flow directly into the family fan-out (lines below).
// Family-specific IMF filters (trend/reversal/breakout/oscillator) are the
// operative quant IMF gate — no redundant global LQ/VN pre-filter.
```

So a pair that "fails" `passesMetricFilter` STILL PROCEEDS to the family fan-out. Hooking :1089 = exactly the semantically-false telemetry you killed for DBS routing. **The quant-IMF rejection is NOT lost** — it is captured one stage down at the FAMILY IMF (Correction 3), which is where the real drop happens. Recommend: remove `core_imf_lq_vn` from the set.

## CORRECTION 2 — MOVE `pattern_imf` (fx5 :1259 → :1228-1237). :1259 is a re-count, not the drop.

The real pattern-pool drop is the `.filter()` at :1220-1237:

```js
const patternPoolSurvivors = !activePatternThresholds ? [] : patternGlobalSurvivors
  .map(...).filter(s => s !== null)
  .filter(s => {
    const lq = s.LQ ?? 0; const vn = s.VolNoise ?? 1.0; const di = s.DI ?? 0;
    return lq >= activePatternThresholds.LQ_MIN && vn <= activePatternThresholds.VN_MAX && di >= activePatternThresholds.DI_TRENDING_MIN;
  });
```

`:1259` (`patternImfFailedLQ++`) is a SEPARATE diagnostic loop (:1249-1264) that re-walks the already-decided rejects only to attribute which metric failed — hooking there would fire for pairs whose drop already happened elsewhere (double/mis-count). I will convert the :1228 predicate to capture-on-fail (compute pass/fail, fire the hook on fail, return the boolean) — one row per actually-dropped pattern-pool pair, label `pattern_imf`. Recommend: move the hook to :1228.

## CORRECTION 3 — family IMF (fx5 :1300-1302) is the REAL quant-IMF drop. One question on it.

```js
for (const s of classifiedSurvivors) {
  // ... DBS exclusive-routing excludedByRouting++ continue (SKIP — your Q3, unchanged) ...
  if (lq < thresholds.LQ_MIN) { failedLQ++; continue; }   // family_imf_lq
  if (vn > thresholds.VN_MAX) { failedVN++; continue; }    // family_imf_vn
  if (di < thresholds.DI_MIN || di > thresholds.DI_MAX) { failedDI++; continue; }  // family_imf_di
  passed++; survivors.push(s);
}
```

Genuine per-pair drops — capture as signed. **Property to confirm:** this loop runs INSIDE `for (const family of familyFilterPaths)` — 5 families. A pair that fails the trend family but passes reversal generates a `pre_filter` reject row FOR THE TREND FAMILY while still surviving elsewhere. That is correct pattern-pool-style telemetry ("rejected from THIS family"), and it is the high-volume property you already accepted — but it means `family_imf_lq` rows are meaningless unless we know WHICH family.

**Q1 — stamp the family name into the `strategy` field** (e.g. `strategy: family` = 'strong_trend'|'reversal'|...)? My rec YES — the `strategy` column is free at pre_filter (no strategy selected yet) and the family is the only thing that makes these rows queryable. Label stays `family_imf_lq/_vn/_di` by failing metric.

## CORRECTION 4 — ADD `pattern_high_price` (market-scanner :944). Real reject, not enumerated.

The pattern path has BOTH a min- AND a max-price gate; only min was in your list:

```js
if (currentPrice < patternMinPrice) { priceRejects++; continue; }   // :937 pattern_low_price (signed)
if (currentPrice > patternMaxPrice) { maxPriceRejects++; continue; } // :944 pattern_HIGH_price (NOT in list)
if (volume24h < patternMinVolume) { volumeRejects++; continue; }     // :951 pattern_low_volume (signed)
if (bidAskSpread > patternMaxSpread) { spreadRejects++; continue; }  // :958 pattern_wide_spread (signed)
```

:944 is a genuine `currentPrice > patternMaxPrice` reject (real tunable bar, pair dropped via `continue`). By your capture rule it qualifies. **Q2 — ADD `pattern_high_price`?** My rec YES (it is a real decision-reject; omitting it leaves a hole in pattern-pool friction data). (Main path has no max-price gate, so this is pattern-only.)

---

## UNCHANGED — confirmed real drops, capture exactly as you signed
- market-scanner MAIN path: `:786` low_volume, `:792` low_price, `:798` wide_spread (the `rejected=true` flag → recorded-or-excluded at :817). ✓
- market-scanner PATTERN path: `:937` pattern_low_price, `:951` pattern_low_volume, `:958` pattern_wide_spread. ✓

## UNCHANGED — SKIP, confirmed (your rulings hold)
already_active (:754/:763), stablecoin (:770/:930), incomplete_metrics (fx5 :954), **insufficient_history main (:804) + pattern history (:965)** (your data-availability ruling), DBS exclusive-routing (fx5 :1290/:1292), already_classified (fx5 :1147).

---

## One more detail to bless: the `strategy` value for NON-family pre_filter rows
The archiver requires `strategy: string`. Family-IMF rows → the family name (Q1). But the main-path volume/price/spread + pattern-path rows have no strategy AND no family at pre_filter. **Q3 — stamp `strategy: 'none'`** for those (vs `''`)? My rec `'none'` (explicit, queryable). `regimeLabel` omitted (no regime classified yet → null).

---

## CORRECTED chunk-A CAPTURE set (what I will hook on your OK)
| Site | Gate | reject_stage | strategy | label (in gate_decision) | scores |
|---|---|---|---|---|---|
| market-scanner :786 | `!isPassiveLearning` | pre_filter | none | low_volume | null |
| market-scanner :792 | `!isPassiveLearning` | pre_filter | none | low_price | null |
| market-scanner :798 | `!isPassiveLearning` | pre_filter | none | wide_spread | null |
| market-scanner :937 | `!isPassiveLearning` | pre_filter | none | pattern_low_price | null |
| market-scanner :944 | `!isPassiveLearning` | pre_filter | none | pattern_high_price *(Q2)* | null |
| market-scanner :951 | `!isPassiveLearning` | pre_filter | none | pattern_low_volume | null |
| market-scanner :958 | `!isPassiveLearning` | pre_filter | none | pattern_wide_spread | null |
| fx5 family loop :1300 | `isEngineActive` | pre_filter | `<family>` *(Q1)* | family_imf_lq | null |
| fx5 family loop :1301 | `isEngineActive` | pre_filter | `<family>` *(Q1)* | family_imf_vn | null |
| fx5 family loop :1302 | `isEngineActive` | pre_filter | `<family>` *(Q1)* | family_imf_di | null |
| fx5 pattern filter :1228 | `isEngineActive` | pre_filter | none | pattern_imf | null |

**DROPPED vs your list:** core_imf_lq_vn (Correction 1 — vestigial). **MOVED:** pattern_imf 1259→1228 (Correction 2). **ADDED (pending Q2):** pattern_high_price.

**Questions:** Q1 family-name into `strategy`? · Q2 add pattern_high_price? · Q3 `strategy:'none'` for non-family rows? On your OK I write chunk-A at this corrected set (each gated, fire-and-forget try/catch, reject_stage=pre_filter, scores null) and send you the embedded diff at Step-4.
