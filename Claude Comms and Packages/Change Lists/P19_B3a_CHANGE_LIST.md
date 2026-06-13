# P19-B3a CHANGE LIST — OrderPlacer port + #139 classify root-cause (Step-4 code review)

> For Langston Step-4. Full B3a diff, load-bearing snippets embedded (§6.5.0.a).
> **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git status/log on the gdrive mount.** Use `ssh staging 'cd /home/deploy/dawntrader && git ...'` for any repo-side inspection beyond these snippets. The files below are Read-able directly on your FUSE mount but the embedded snippets are authoritative.
> Verification already GREEN on the C:\dev bench: tsc baseline = no regressions; full suite passing incl. the 2 new test files.

## Surface (8 files: 4 modified, 4 new; ~136 insertions)
NEW: `server/services/execution/types.ts`, `server/services/execution/order-placer.ts`, `server/services/execution/order-placer.test.ts`, `server/tests/unit/b3a-139-classify.test.ts`
MODIFIED: `server/services/paper-execution-engine.ts`, `server/services/vts-runner.ts`, `shared/asset-classes.ts`, `server/utils/symbol-normalize.ts`

---

## PART 1 — OrderPlacer port (OBJ-1)

### NEW `execution/types.ts` — the contract (live-swap seam)
`FillResult` discriminated union: `filled | partial | delayed | rejected` (paper only ever produces `filled`; the other three carry live's reality from day one). `OrderPlacer` interface: `openOrder(OpenOrderRequest)→FillResult`, `closeOrder(CloseOrderRequest)→FillResult`. Carries the BINDING **close-seam state rule** (C3) in the interface JSDoc: a non-`filled` close leaves the position OPEN (close not recorded), retried next cycle — never half-closed.

### NEW `execution/order-placer.ts` — `PaperOrderPlacer` (thin port)
Wraps ONLY the fill (slippage+fee math). BEHAVIOUR-IDENTICAL relocation of the prior inline math; always returns `filled`. Slippage% + per-class fee resolver INJECTED (no engine import).
```ts
async openOrder(req): Promise<FillResult> {
  const slippagePerUnit = req.intendedPrice * (this.slippagePercent / 100);
  const fillPrice = req.intendedPrice + slippagePerUnit;          // worse (higher) for a buy
  const notional = fillPrice * req.quantity;
  const feeQuote = notional * (this.feePercentFor(req.symbol) / 100);
  const slippageQuote = slippagePerUnit * req.quantity;
  return { status: 'filled', fillPrice, fillQty: req.quantity, feeQuote, slippageQuote };
}
// closeOrder: identical but fillPrice = requestedPrice - slippagePerUnit (worse-lower for a sell)
```

### MODIFIED `paper-execution-engine.ts` — wire the port through both seams
Field + constructor inject (SLIPPAGE_PERCENT field-init runs before ctor body):
```ts
private readonly orderPlacer: OrderPlacer;
// ctor: this.orderPlacer = new PaperOrderPlacer(this.SLIPPAGE_PERCENT, (s) => this.feePercentFor(s));
```
Open seam (`executeSimulatedTrade` ~:2025) — replaces the inline entry slippage+fee with:
```ts
const _openFill = await this.orderPlacer.openOrder({ symbol: signal.symbol, side: 'buy', quantity, intendedPrice: signal.entryPrice, mode: this.mode });
if (_openFill.status !== 'filled') { console.error(`[...][OPEN_FILL_NONFILLED] ...`); return; }   // C3 contained fail-loud
const actualEntryPrice = _openFill.fillPrice;
const positionValue   = actualEntryPrice * quantity;
const entryFee        = _openFill.feeQuote;
const totalSlippage   = _openFill.slippageQuote;
```
Close seam (`closePosition` ~:1142) — same pattern; `_b45FeePct` retained (reused for the entry-fee fallback); the C3 guard `if (_closeFill.status !== 'filled') { ...; return; }` BEFORE any position mutation. `actualExitPrice/exitFee/exitSlippage` now come from `_closeFill`. **Downstream-var trace done:** the dropped per-unit locals (`slippage`/`exitSlippagePerUnit`/`exitValue`) were only used to derive the values the port now returns; every consumed local is preserved identically.

---

## PART 2 — #139 classify root-cause (widen + centralized alarm + 9-site switch)

### MODIFIED `shared/asset-classes.ts`
**(a) SSOT base-length cap (Langston C1 — single constant, both files import it):**
```ts
export const CRYPTO_SPOT_BASE_MAX_LEN = 15;   // finite tripwire: live max base = 6 (RENDER); 15 = headroom + still alarms on garbage
export const CRYPTO_SPOT_CANONICAL = new RegExp(`^[A-Z0-9]{2,${CRYPTO_SPOT_BASE_MAX_LEN}}\\/[A-Z0-9]{3,4}$`);
```
**(b) Centralized alarm in `safeResolveAssetClass` (every safe-site inherits; no 21-site edit):**
```ts
let _classifyFallthroughCount = 0;
export function getClassifyFallthroughCount(): number { return _classifyFallthroughCount; }
let _classifyFallthroughHook: ((symbol: string, exchange: string) => void) | null = null;
export function setClassifyFallthroughHook(hook): void { _classifyFallthroughHook = hook; }   // server registers the active-vs-passive escalation at P19-B4 (shared/ can't import server/)
// catch: _classifyFallthroughCount++; console.warn('[B69][CLASSIFY_FALLTHROUGH] ...'); try { _classifyFallthroughHook?.(symbol, exchange); } catch {} ; return null;
```

### MODIFIED `server/utils/symbol-normalize.ts` — SSOT import (no second literal)
```ts
import { ASSET_CLASSES, CRYPTO_SPOT_CANONICAL, type AssetClass } from '../../shared/asset-classes.js';
// normalizeCryptoSpot :74 — was an inline /^[A-Z0-9]{2,10}\/[A-Z0-9]{3,4}$/ literal; now:
if (CRYPTO_SPOT_CANONICAL.test(symbol)) { return symbol.toUpperCase(); }
```

### MODIFIED `server/services/vts-runner.ts` — 9 throwing sites → safe + alarm
All 9 throwing `resolveAssetClass(X,'kraken')` → `safeResolveAssetClass(X,'kraken') ?? 'crypto_spot'` (alarms via the central counter on null; VTS cycle survives instead of throwing). The 4 dynamic `const { resolveAssetClass } = await import(...)` → `const { safeResolveAssetClass } = await import(...)`. Verified: zero throwing call-sites remain (only comment references).

---

## §9.4 HOMES (named now, not floated)
- **~12 remaining active-path throwing-resolve sites** (signal-orchestrator/RTB/paper-engine/etc.) → **P19-B4** (where active-path signal-drop semantics + the active-vs-passive system-alert hook registration are designed). RUNNING_ISSUES entry.
- **4-module symbol-form consolidation** (asset-classes / symbol-canonicalizer / kraken-symbol-resolver[LOCKED] / symbol-normalize) → **Phase 20** hardening. RUNNING_ISSUES entry.
- **OBJ-4d** (xStock-on-kraken silent collision) — reachability confirm + home at implementation (open).

## Tests (both green on bench)
`execution/order-placer.test.ts` (6): each FillResult variant + exact open/close math + symbol→fee passthrough. `tests/unit/b3a-139-classify.test.ts` (10): widen boundary (11/15 classify, 16 throws), SSOT constant, regex-from-constant, counter increments, hook fires + survives a throwing hook, no-alarm on valid pair.

**Asks:** (1) the SSOT-constant approach (C1) — confirm satisfied. (2) the thin-port extraction — confirm behaviour-identical + the C3 close-seam guard placement (before any mutation) is correct. (3) the 9-site `?? 'crypto_spot'` fallback-with-alarm on the VTS passive path — acceptable vs hard-skip? (4) any objection before I push.
