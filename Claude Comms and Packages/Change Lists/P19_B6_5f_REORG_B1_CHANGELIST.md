# P19-B6.5f (reorg-B1) — Step-4 Code Review (change list, embedded diff)

> **For Langston — Step-4 review BEFORE this counts as reviewed.** Commit `b06eb9e5c` (on `586c61a5b`). 6 files, +278/−32. **Bench: tsc-baseline OK (no new errors); vitest 128/128** (new `p19-b6-5f-recognition.test.ts` + all related existing suites). CI in-progress at write time.
> **INFRASTRUCTURE NOTE:** do NOT `cd /mnt/gdrive` or run git there. Full diff staged at `/home/langston/inbox/reorg-B1/reorgb1_step3.diff`; the scope + pre-audit are in the same inbox dir. Use `ssh staging` for any repo-side inspection.
> All Step-1 + Step-2 conditions you set are implemented; the load-bearing hunks are inline below so you don't need to open files.

## What I'm asking you to confirm
1. **Your Step-3 condition is honored:** `setDiscoveredQuotes()` fires at the TAIL of EVERY `refresh()` (not just boot) — snippet B. And the raw-form regexes REBUILD from the active set on each call (snippet C) so a refresh-added quote is recognized without restart.
2. **The slot mirrors `setClassifyFallthroughHook` (no `shared/`→`server/` import)** — snippet A.
3. **seed = fallback = complete** (no narrow window): VALID_QUOTES widened to 23 legs (snippet D) + curated KNOWN_QUOTE_CURRENCIES complete (snippet A).
4. **The named alert is storm-safe** (dedup on exchange, not the quote) — snippet E.
5. **A design call I made you should sanity-check (snippet A):** `CRYPTO_SPOT_CANONICAL` stays GENERIC (length-widened, not quote-list-validated). Rationale: a list-validated canonical would RE-DROP a real newly-listed ≤5-char quote until the SSOT caught up — reintroducing the exact bug. So slash-form recognition is permissive-by-length; the quote-LIST SSOT serves the compact/no-slash split + the unknown-quote alert; trade-eligibility stays the downstream arbiter (recognized ≠ traded). Flag if you'd rather strict-validate.

## Hold-me-to items (your Step-2 asks) — status
- **Collision-order test** (SUI/USD → crypto_spot): DONE — in the new suite + still green.
- **Eligibility-gate proof** (exotic-quote pairs recognized-not-traded): to verify at Step-7/8 on staging (the `allowedTradingPairs` / b74 USD-USDT-USDC filter is downstream + untouched). Will cite in the completion report.
- **Governance** (SIM §17 liveness + System-Manual recognition-path note + Tier-1): Step-10, before close.

---
## Snippet A — `shared/asset-classes.ts`: QUOTE_LEN SSOT + quote-set SSOT + slot + generic canonical
```ts
export const QUOTE_LEN_MIN = 3;
export const QUOTE_LEN_MAX = 5;   // = longest CONFIRMED live leg (EUROP/PYUSD/RLUSD), live AssetPairs 2026-06-19
// ...
export const KNOWN_QUOTE_CURRENCIES: ReadonlySet<string> = new Set<string>([
  'USD','EUR','USDT','USDC','BTC','GBP','ETH','AUD','CAD','JPY','CHF',
  'EURC','USD1','SOL','DAI','EUROP','FIDD','PYUSD','AUSD','USDD','RLUSD','USDQ','USDR',
]);
let _discoveredQuotes: ReadonlySet<string> | null = null;
export function setDiscoveredQuotes(quotes: ReadonlySet<string> | null): void {
  _discoveredQuotes = quotes && quotes.size > 0 ? quotes : null;
  _rebuildQuoteRegexes();
}
export function getRecognitionQuotes(): ReadonlySet<string> {
  return _discoveredQuotes ?? KNOWN_QUOTE_CURRENCIES;   // ALWAYS complete, never narrow
}
// canonical: GENERIC charset + SSOT length bound (NOT quote-list validated — by design)
export const CRYPTO_SPOT_CANONICAL = new RegExp(
  `^[A-Z0-9]{${TICKER_BASE_MIN_LEN},${CRYPTO_SPOT_BASE_MAX_LEN}}\\/[A-Z0-9]{${QUOTE_LEN_MIN},${QUOTE_LEN_MAX}}$`,
);
```

## Snippet B — `kraken-asset-pairs-service.ts` `refresh()`: re-register on EVERY refresh (your condition)
```ts
this.dynamicQuotes = newDynamicQuotes;
console.log(`${LOG_PREFIX} Built dynamic quotes: ${newDynamicQuotes.size} unique quotes`);
// push into the shared recognition slot on EVERY refresh (not just boot) — self-healing
setDiscoveredQuotes(newDynamicQuotes);
```

## Snippet C — `shared/asset-classes.ts`: self-healing raw-form regexes (rebuilt from active set)
```ts
let CRYPTO_SPOT_KRAKEN_RAW_1 = new RegExp(`^X[A-Z0-9]+Z(${_quoteAlternation()})$`);
let CRYPTO_SPOT_KRAKEN_RAW_2 = new RegExp(`^[A-Z]{3,5}(${_quoteAlternation()})$`);
function _rebuildQuoteRegexes(): void {
  CRYPTO_SPOT_KRAKEN_RAW_1 = new RegExp(`^X[A-Z0-9]+Z(${_quoteAlternation()})$`);
  CRYPTO_SPOT_KRAKEN_RAW_2 = new RegExp(`^[A-Z]{3,5}(${_quoteAlternation()})$`);
}   // _quoteAlternation() = active set, sorted LONGEST-FIRST (EUROP before EUR)
```

## Snippet D — `kraken-asset-pairs-service.ts`: VALID_QUOTES seed widened to complete set
```ts
const VALID_QUOTES = new Set([
  'USD','EUR','GBP','CHF','JPY','CAD','AUD',
  'USDT','USDC','PYUSD','DAI','EUROP','RLUSD','EURC','USD1','AUSD','USDD','USDQ','USDR','FIDD',
  'BTC','ETH','XBT','SOL',   // raw XBT kept — parseAltname matches raw altname suffixes
]);
```

## Snippet E — `server/index.ts`: dedicated storm-safe unknown-quote alert (dedup on exchange)
```ts
setClassifyFallthroughHook((symbol, exchange, meta) => { void (async () => { try {
  // ...active-engine gate...
  if (meta?.unknownQuote) {
    await addAlert({ /*critical*/ title: 'Unrecognized quote currency during ACTIVE trading',
      body: `Pair ${symbol}@${exchange} was SKIPPED: quote '${meta.unknownQuote}' not in the recognition set...`,
      dedupe_key: `classify-unknown-quote:${exchange}` });   // storm-safe: exchange, not quote
  } else { /* existing classify-fallthrough-active per-pair alert */ }
} catch {} })(); });
```

And the resolver names the quote (`shared/asset-classes.ts` `safeResolveAssetClass` catch):
```ts
let meta: ClassifyFallthroughMeta | undefined;
const slashIdx = symbol.indexOf('/');
if (slashIdx >= 0) { const q = symbol.slice(slashIdx + 1).toUpperCase();
  if (q && !getRecognitionQuotes().has(q)) meta = { unknownQuote: q }; }
try { _classifyFallthroughHook?.(symbol, exchange, meta); } catch {}
```

---
*PROCEED to CI-confirm + deploy + verify, or REVISE? Full diff: `/home/langston/inbox/reorg-B1/reorgb1_step3.diff`.*
