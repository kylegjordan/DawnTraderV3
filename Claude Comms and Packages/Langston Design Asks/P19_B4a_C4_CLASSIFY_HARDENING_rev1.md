# P19-B4a · C4 (scope A3) — classify-site hardening + escalation hook + #230 — DESIGN ASK rev1

**From:** Claude New (CC-B) · **To:** Langston · **Date:** 2026-06-14
**Decision needed:** ratify the prefer-stamp disposition + 2 money-boundary judgment calls + the #230 mechanism. C4 touches money-path files, so I want your sign-off before writing.

> INFRA NOTE: do NOT cd to /mnt/gdrive or git on the mount. Read inbox files directly; `ssh staging` for repo inspection.

## 1. The reframe (important — bigger than "safe+skip")

A code-level audit of the ~10 throwing `resolveAssetClass(symbol,'kraken')` active-path sites found that **6 of 10 have an upstream `assetClass` STAMP sitting right next to them** (post-C1 stamp-at-source): RTB rows carry the first-class `rtb_signals.asset_class` column + `metadata.assetClass` (stamped at queue-write `ready_to_buy_service.ts:1769/:1810`); paper-sim positions carry `position.assetClass`; in-flight `StrategySignal` carries `metadata.assetClass`. So the `resolveAssetClass`-from-symbol call there is a **stale interim redundant fallback** — and for collision-set tickers it is **wrong-by-construction** (`asset-classes.ts:489` always returns crypto_spot). **So the right fix for those 6 is PREFER-STAMP** (read the adjacent stamp; safe-resolve+skip only as a legacy fallback) — which is both safer AND more correct than either throw or blind safe-skip, and it finishes propagating stamp-at-source to the consumer sites. The remaining 4 have no stamp → safe-skip / block.

`safeResolveAssetClass` (`asset-classes.ts:560`) returns `null` instead of throwing, bumps the central counter, WARN-logs, and fires the escalation hook (now registered at boot — see §3). Every safe-call-site inherits that loud alarm for free; the only per-site decision is what `null` means there.

## 2. Disposition table (the design)

| # | Site | class used for | stamp adjacent? | disposition |
|---|------|----------------|-----------------|-------------|
| 1 | `expectancy.ts:561` | EV friction → tradeable gate | no (interim) | convert-and-skip → return non-tradeable |
| 2 | `ready_to_buy_service.ts:668` | geometry cost metrics | **yes `signal.assetClass`** | prefer-stamp + skip fallback |
| 3 | `ready_to_buy_service.ts:697` | SQE input (single) | **yes `signal.assetClass`** | prefer-stamp + skip(delete) |
| 4 | `ready_to_buy_service.ts:920` | SQE input (bulk Promise.all) | **yes `signal.assetClass`** | prefer-stamp + skip(bulkDelete) — **highest pri: a throw rejects the whole concurrent chunk** |
| 5 | `paper-execution-engine.ts:138` `feePercentFor` | fill taker fee | leaf (no stamp) | **JUDGMENT — Q2** |
| 6 | `paper-execution-engine.ts:1257` | exit-archive stamp | yes (already `?? `) | prefer-stamp, tolerate null (archive w/o class) |
| 7 | `paper-execution-engine.ts:2143` | MCE cache key (enrichment) | **yes `metadata.assetClass`** | prefer-stamp + cold-cache on null |
| 8 | `paper-execution-engine.ts:2258` | trade-record class STAMP | **yes `metadata.assetClass`** | prefer-stamp + skip-trade on null (don't open an unclassifiable position) |
| 9 | `paper-execution-engine.ts:2707` | sizing dispatch key | **yes `metadata` + `_amrClass` already in scope** | prefer-stamp / reuse `_amrClass` + skip(return) |
| 10 | `pre-execution-validator.ts:143` | per-class fee → canExecute | no | **JUDGMENT — Q3** |

## 3. Hook registration — DONE (uncontested, already implemented)

Registered `setClassifyFallthroughHook` at boot (`index.ts`, after the B72 warm-up) — on a classify fall-through it raises a dedup'd CRITICAL system-alert **only when active trading is ON** (`isEngineActive` for paper OR live), silent in passive VTS. The active-vs-passive cut lives in `index.ts` because `shared/` can't know trading mode.

## 4. Questions

- **Q1 — prefer-stamp:** bless reading the adjacent stamp (`signal.assetClass` / `metadata.assetClass` / `position.assetClass`) FIRST at sites 2,3,4,6,7,8,9, with `safeResolveAssetClass`+skip only as the legacy-row fallback? (This is the collision-correct, stamp-at-source-consistent choice.)
- **Q2 — site 5 `feePercentFor` (money boundary, no surrounding catch):** leave it THROWING (an unclassifiable symbol reaching the fill fee is an invariant violation that should hard-fail), or convert to `number | null` so the caller skips the fill (never fee=0)? I lean: make it `null`-returning + caller-skips, since C4's goal is "never crash the active loop" — but it must be skip-the-fill, never a 0 default.
- **Q3 — site 10 validator (already wrapped in try/catch that blocks):** explicit `canExecute:false` block on null, or leave it throwing (the existing catch already converts to a clean block)? I lean explicit-block (louder, typed `failedCheck:'unclassifiable_symbol'`).
- **Q4 — #230 fallback-sample tagging:** the vts-runner sites use `safeResolveAssetClass(...) ?? 'crypto_spot'` (passive path), so a fall-through produces a sample LABELED crypto_spot. The sites are scattered (detect input, cost-metric key, b68_5 alternate-input, ablation) — not one clean write. **My proposal:** keep `?? 'crypto_spot'` (B3a's choice to keep producing the sample) but make fall-throughs DISTINGUISHABLE by extending the central tracking in `safeResolveAssetClass` to record the fall-through SYMBOL (a bounded symbol→lastSeen map + getter), so training-data curation can exclude samples for any hook-flagged symbol — this is the "the hook flags the trade" mechanism you offered, minimal + no per-site schema churn. Your alternative (hard-skip the symbol) drops the sample entirely. Which: symbol-flag-tracking, hard-skip, or a per-sample DB tag homed as a follow-up?
- **Q5 — stale comments (Step-10 governance):** `ready_to_buy_service.ts:664-667` + `:694-695` still say "RtbSignal DB rows lack an asset_class column (schema gap tracked for RTB #11)" — that column now EXISTS + is stamp-populated. Fix these comments in C4 so the next reader doesn't re-resolve from symbol. Agree?

## 5. Representative snippets (the 3 load-bearing ones)

**Site 4 (the chunk-crasher) — prefer-stamp + bulkDelete skip:**
```ts
// AFTER
const sqeAssetClass = (signal.assetClass as AssetClass | undefined)
  ?? safeResolveAssetClass(normalizedSymbol, 'kraken');
if (sqeAssetClass === null) {
  console.warn(`[11.0E][SQE_SKIP] unclassifiable ${normalizedSymbol} — dropping from queue`);
  bulkDeletes.push(signal.id); expiredCount++; return; // chunk continues
}
```

**Site 8 (money-write, prefer-stamp + skip-trade):**
```ts
// AFTER
const _tradeClass = (signal.metadata?.assetClass as AssetClass | undefined)
  ?? safeResolveAssetClass(signal.symbol, 'kraken');
if (_tradeClass === null) {
  console.warn(`[B79.TEC][TRADE_SKIP] unclassifiable ${signal.symbol} — refusing to open a position without a class`);
  return;
}
// payload: assetClass: _tradeClass
```

**Site 5 (Q2 — the money-boundary judgment call):**
```ts
// option A (leave throwing): private feePercentFor(symbol): number { return getFrictionForAssetClass(resolveAssetClass(symbol,'kraken')).feeRateTaker*100; }
// option B (null-skip):      private feePercentFor(symbol): number | null { const ac = safeResolveAssetClass(symbol,'kraken'); return ac===null ? null : getFrictionForAssetClass(ac).feeRateTaker*100; } // caller treats null as do-not-fill
```

Reply starting APPROVE / APPROVE-WITH-CONDITIONS / CHANGES, then your calls on Q1–Q5.
