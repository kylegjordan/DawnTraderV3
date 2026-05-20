# B-NEW-36 Sub-batch (c) — Step 4 Pass 2 Code Review Dispatch

**From:** Claude Code
**To:** Langston (Step 4 Pass 2 ACK gate) + Kyle (decider)
**Date:** 2026-05-20
**Scope:** `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` §2.5 (sub-batch c — xStock universe-split cleanup).
**Pre-audit:** `Claude Comms and Packages/Scope Files/B_NEW_36_PRE_AUDIT.md` §3.3 + §3.4 + §4.3 + §5.1 (Step 2 CLEAN ACK in place).
**Diff stat:** 199 insertions / 435 deletions across 9 files. Net 236 lines of code removed. Net diff at end of this document.

---

## §1 Headline

Retires the `XSTOCK_SPOT_24_7_SYMBOLS` 10-name designation. Replaces the three-state universe-build (weekend-close / ARCA-open / extended-hours-only) with a two-state model (weekend-close / full universe). All xStocks now use the same Sun 8PM ET → Fri 8PM ET open window. Q9 empirical clearance (NVDA/QQQ/SPY/TSLA zero weekend bucket activity) was already validated in the Step 2 pre-audit. INFRASTRUCTURE NOTE: do not cd /mnt/gdrive. The diff is embedded inline below; for repo-side inspection use ssh staging then cd /home/deploy/dawntrader (deploy@188.245.193.8).

---

## §2 Files changed

### MODIFIED (production)

| File | Diff lines | Summary |
|---|---|---|
| `shared/asset-classes.ts` | 77 | Drop `is24_7?: boolean` field from `XstockSpotEntry` interface; remove `is24_7: true` from all 10 registry entries; remove `XSTOCK_SPOT_24_7_SYMBOLS` exported `Set`; replace its 30-line JSDoc with a forward-pointing retirement-rationale comment block. |
| `server/asset_classes/xstock_spot/market-hours.ts` | 119 | Drop `XSTOCK_SPOT_24_7_SYMBOLS` import; drop `normalizeXstockSymbol` helper (its only consumer was the 24/7 set membership check); collapse `isXstockMarketOpenUTC(symbol, now)` to `return !isInXstockWeekendClose(now)`. Symbol param kept in signature for backward compat. |
| `server/asset_classes/xstock_spot/scanner.ts` | 50 | Drop `XSTOCK_SPOT_24_7_SYMBOLS` import; collapse three-state universe-build to two-state (weekend-close empty / open-window full); rename `arcaOpen` → `xstockOpen`; remove the dual-probe pattern. Telemetry log unified to `[B-NEW-36][SCAN_WEEKEND_CLOSE]`. |
| `server/routes.ts` | 3 | `/api/xstocks/freshness` endpoint drops `is24_7` field from response row + drops the `XSTOCK_SPOT_24_7_SYMBOLS` import. |
| `server/strategies/orb.ts` | 29 | Drop `XSTOCK_SPOT_24_7_SYMBOLS` import + the dead weekend-bypass branch (ORB currently `enabled=false` per B-NEW-34; bypass was also empirically wrong). |
| `client/src/components/machine-learning/xstocks-tab.tsx` | 5 | UI consumer drops `is24_7: boolean` from `XstockFreshnessRow` type + drops the Ext/ARCA badge column + updates the helper text. |

### MODIFIED (tests)

| File | Diff lines | Summary |
|---|---|---|
| `server/tests/unit/b79-0b-market-hours.test.ts` | 88 | Updated Friday-close transition boundaries: pre-batch this test asserted Fri 22:00 UTC = closed (the per-symbol ARCA-aligned 22:00 UTC rule); post-batch asserts Fri 22:00 UTC = open (only the unified 8 PM ET = Sat 00:00 UTC EDT rule applies). |
| `server/tests/unit/b79-0L-market-hours-extended-hours.test.ts` | 127 | Removed the "Phase-1 extended-hours" framing; replaced with a "formerly-extended-hours and formerly-ARCA produce identical results" regression-lock test block to guarantee the cleanup behavior. |

### DELETED

| File | Lines | Reason |
|---|---|---|
| `server/tests/unit/b79-0c-market-hours-per-symbol.test.ts` | 136 | Dedicated `XSTOCK_SPOT_24_7_SYMBOLS` membership-integrity test file. Its tests asserted behavior we're explicitly eliminating (24/7 names bypass ARCA, normalization for the bypass check, etc.). Replaced by the regression-lock tests in `b79-0L-market-hours-extended-hours.test.ts`. |

---

## §3 Key diff snippets (load-bearing)

### 3.1 `shared/asset-classes.ts` — registry interface + export removal

BEFORE:
```ts
interface XstockSpotEntry {
  name: string;
  /** True for Phase-1 extended-hours names (Sun 8PM ET → Fri 8PM ET continuous). */
  is24_7?: boolean;
  sector: XstockSector;
  // ...
}

// ...later in the file...

export const XSTOCK_SPOT_24_7_SYMBOLS: ReadonlySet<string> = new Set(
  Array.from(XSTOCK_SPOT_REGISTRY.entries())
    .filter(([, meta]) => meta.is24_7 === true)
    .map(([pair]) => pair),
);
```

AFTER:
```ts
interface XstockSpotEntry {
  name: string;
  sector: XstockSector;
  // ...
}

// ...later in the file, replacing the XSTOCK_SPOT_24_7_SYMBOLS block...

/*
 * B79.0c introduced `XSTOCK_SPOT_24_7_SYMBOLS` as a 10-name set derived from
 * `XSTOCK_SPOT_REGISTRY` via an `is24_7` flag. B-NEW-36 sub-batch (c)
 * (2026-05-20) RETIRED that designation:
 *
 *   - Empirical reality (Q9 verified at sub-batch (c) Step 2 pre-audit): all
 *     10 of the designated names (AAPL/CRCL/GLD/GOOGL/HOOD/MSTR/NVDA/QQQ/SPY/
 *     TSLA) showed ZERO bucket activity in the Sat 00:00 UTC → Mon 00:00 UTC
 *     weekend window in `xstock_spot_ohlc_60m_snapshot`. ...
 *   - Code consequence: the `is24_7` field is removed from the registry
 *     interface; `XSTOCK_SPOT_24_7_SYMBOLS` is removed entirely;
 *     `isXstockMarketOpenUTC(symbol, now)` returns the same value regardless
 *     of `symbol` (the parameter stays in the signature for backward compat).
 */
```

Registry entries: all 10 affected entries had `is24_7: true` removed. Pattern (example for AAPL):

```ts
// BEFORE:
['AAPL/USD', { name: 'Apple', is24_7: true, sector: 'XLK' }],
// AFTER:
['AAPL/USD', { name: 'Apple', sector: 'XLK' }],
```

Equivalent removal applied to: CRCL/USD, GLD/USD, GOOGL/USD, HOOD/USD, MSTR/USD, NVDA/USD, QQQ/USD, SPY/USD, TSLA/USD.

### 3.2 `server/asset_classes/xstock_spot/market-hours.ts` — predicate collapse

BEFORE (147 lines): imported `XSTOCK_SPOT_24_7_SYMBOLS`, defined `normalizeXstockSymbol` helper, and the predicate did global-weekend-close + per-symbol-24/7-bypass + residual ARCA Fri 22:00 UTC rule.

AFTER (104 lines): just the unified weekend close.

```ts
function isInXstockWeekendClose(now: Date): boolean {
  const { weekday, hour } = getETParts(now);
  if (weekday === 'Fri' && hour >= 20) return true;
  if (weekday === 'Sat') return true;
  if (weekday === 'Sun' && hour < 20) return true;
  return false;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isXstockMarketOpenUTC(symbol: string, now: Date = new Date()): boolean {
  return !isInXstockWeekendClose(now);
}
```

`getETParts(now)` helper preserved verbatim (DST-aware via `Intl.DateTimeFormat`, unchanged).

### 3.3 `server/asset_classes/xstock_spot/scanner.ts` — universe-build collapse

BEFORE:
```ts
const arcaOpenSampleSym = 'NON_24_7_SAMPLE/USD';
const arcaOpen = isXstockMarketOpenUTC(arcaOpenSampleSym);
const extendedHoursOpen = isXstockMarketOpenUTC('AAPL/USD');
const insideUnifiedWeekendClose = !arcaOpen && !extendedHoursOpen;

let symbolList: string[];
if (this.diag.hostileSimActive) {
  symbolList = Array.from(XSTOCK_SPOT_SYMBOLS);
} else if (insideUnifiedWeekendClose) {
  symbolList = [];
} else if (arcaOpen) {
  symbolList = Array.from(XSTOCK_SPOT_SYMBOLS);
} else {
  symbolList = Array.from(XSTOCK_SPOT_24_7_SYMBOLS); // ARCA closed but extended-hours open
}
this.diag.lastUniverseSize = symbolList.length;
this.diag.lastArcaOpen = arcaOpen;
```

AFTER:
```ts
const xstockOpen = isXstockMarketOpenUTC('AAPL/USD');

let symbolList: string[];
if (this.diag.hostileSimActive) {
  symbolList = Array.from(XSTOCK_SPOT_SYMBOLS);
} else if (xstockOpen) {
  symbolList = Array.from(XSTOCK_SPOT_SYMBOLS);
} else {
  symbolList = []; // weekend close — ALL xStocks closed
}
this.diag.lastUniverseSize = symbolList.length;
this.diag.lastArcaOpen = xstockOpen;
```

Telemetry log line correspondingly simplified to:
```ts
if (!xstockOpen && !this.diag.hostileSimActive) {
  this.diag.cyclesSkippedMarketClosed++;
  if (this.diag.cyclesSkippedMarketClosed % 30 === 1) {
    console.log(`[B-NEW-36][SCAN_WEEKEND_CLOSE] tick=${tick.tickNumber} universe=0 (Fri 8PM ET → Sun 8PM ET unified window)`);
  }
}
```

(The old `[B79.0c][SCAN_EXTENDED_ONLY]` branch is gone — there's no longer an extended-hours-only state.)

### 3.4 `server/routes.ts` — freshness endpoint response

BEFORE:
```ts
const { XSTOCK_SPOT_SYMBOLS, XSTOCK_SPOT_24_7_SYMBOLS } = await import('../shared/asset-classes.js');
// ...
return {
  symbol: r.symbol,
  lastTickAt: lastTickAt !== null ? new Date(lastTickAt).toISOString() : null,
  staleSeconds,
  state,
  is24_7: XSTOCK_SPOT_24_7_SYMBOLS.has(r.symbol),
};
```

AFTER:
```ts
const { XSTOCK_SPOT_SYMBOLS } = await import('../shared/asset-classes.js');
// ...
return {
  symbol: r.symbol,
  lastTickAt: lastTickAt !== null ? new Date(lastTickAt).toISOString() : null,
  staleSeconds,
  state,
};
```

### 3.5 `server/strategies/orb.ts` — dead weekend-bypass removal

BEFORE:
```ts
import { XSTOCK_SPOT_24_7_SYMBOLS } from '../../shared/asset-classes.js';
// ...
let _no24_7LogCount = 0;
// ...
if (XSTOCK_SPOT_24_7_SYMBOLS.has(symbol)) {
  _no24_7LogCount++;
  if (_no24_7LogCount === 1 || _no24_7LogCount % 1000 === 0) {
    console.log(`${LOG_PREFIX} ${symbol} skipped — extended-hours name has no daily opening bell (count=${_no24_7LogCount})`);
  }
  return null;
}
```

AFTER:
```ts
// (import removed)
// (counter removed)
// (skip branch removed — replaced with comment block documenting why)
```

ORB is `enabled=false` in `module_constants` per B-NEW-34, so this branch was dead-code in production. It would also have been empirically wrong if ORB were re-enabled (would skip the 10 names that DO have an opening bell). Both reasons motivate the removal.

### 3.6 `client/src/components/machine-learning/xstocks-tab.tsx` — UI consumer

Three-spot edit:
- Drop `is24_7: boolean` field from `XstockFreshnessRow` type (1 line).
- Drop the `Class` column header `<th>` from the table (1 line).
- Drop the `<td>` rendering the Ext/ARCA badge (1 line).
- Update helper text: "All xStocks share identical hours: open Sun 8PM ET → Fri 8PM ET, closed Fri 8PM ET → Sun 8PM ET."

### 3.7 Tests

`b79-0c-market-hours-per-symbol.test.ts` DELETED (136 lines).

`b79-0b-market-hours.test.ts` updated for the new unified-predicate Friday-close boundary (Fri 22:00 UTC is now OPEN; Sat 00:00 UTC = Fri 8 PM ET in EDT is CLOSED). Previously the test asserted Fri 22:00 UTC = CLOSED under the old per-symbol ARCA-aligned rule.

`b79-0L-market-hours-extended-hours.test.ts` rewritten to remove "extended-hours" framing and add a regression-lock test block that asserts formerly-Phase-1 (AAPL/USD) and formerly-ARCA (CVX/USD) produce IDENTICAL results across 7 boundary times. Existing weekend-window boundary cases preserved (Friday 8 PM ET, Saturday all-day, Sunday 8 PM ET reopen, DST transitions).

---

## §4 Five-symbol Kraken-side probe results (RUNNING_ISSUES #120)

Per scope §0.5 sub-batch (c) trace-then-decide directive: probed BITF/HOLX/PARA/SAGE/WBA via Kraken public `AssetPairs` endpoint across canonical (`BASE/USD`), x-suffix (`BASExUSD`), no-suffix (`BASEUSD`), x-suffix-USDT (`BASExUSDT`), and x-suffix-with-slash (`BASEx/USD`) forms.

**Result:** all 25 queries returned `EQuery:Unknown asset pair`. Sanity check: known-good xStocks (AAPL/TSLA/AMZN) ALSO returned `EQuery:Unknown asset pair` via the same endpoint. **Conclusion: Kraken's public `AssetPairs` API does NOT index xStocks at all** — they're exclusively routed through `wss://ws-equities.kraken.com`. Scanned the full 1,544-pair AssetPairs response for any xStock name matches — zero matches.

**Decision deferred (filed in #120):** cannot justify positive retirement from registry without a Kraken-side investigation method that lets us positively confirm non-existence. All 5 are valid US equity tickers (Bitfarms / Hologic / Paramount Global / Sage Therapeutics / Walgreens Boots Alliance) — they might be tokenized under a different form OR delisted from Kraken's xStock product at some point OR never tokenized by Backed Finance. None of the five are in the (now-retired) designated-24/7 set; scanner active universe unaffected (73-74 of 75 rotation universe per cycle).

Folded into a future "Kraken xStock universe audit" mini-batch once a Kraken-side investigation method surfaces (Kraken docs / support inquiry / direct WS-equities subscribe probe).

---

## §5 Verification anchor

To confirm you read the right file (not a B-NEW-34b conflation), quote the **first sentence of §3.4** (the `server/routes.ts` BEFORE block label). Canonical correct quote begins with the word "BEFORE" followed by the code-fence opening.

---

## §6 Step 4 Pass 2 ask

Reply with one of:

(a) **PASS 2 CLEAN ACK** — code review accepted, sub-batch (c) cleared for commit + push + deploy + Step 7/8 verification.

(b) **PASS 2 ACK WITH REVISIONS** — specify (line/file + corrective change).

(c) **PASS 2 BLOCKER** — specify the obstacle.

The post-deploy verification per Kyle directive 2026-05-20 will include: (1) code review (this dispatch), (2) staging build + test run, (3) PM2 runtime log inspection during a live cycle, (4) Claude-in-Chrome navigation to the xStocks tab confirming the Class column / Ext badge removal renders cleanly. The scanner currently sees a Mon-Thu off-ARCA-hours universe of 10 names (the old extended-hours-only fallback); post-deploy the off-ARCA hours universe should be the full ~260-265 symbols, with the snapshot+overlay architecture absorbing the increased read volume (B-NEW-34b verified per-cycle DB cost is ~75-85% lower than the abandoned 120h live path).

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a: this review document is the inbox file. Diff snippets are embedded inline above. DO NOT cd /mnt/gdrive. For repo-side inspection use ssh staging then cd /home/deploy/dawntrader (deploy@188.245.193.8 from your Helsinki IP).

— Claude Code, 2026-05-20
