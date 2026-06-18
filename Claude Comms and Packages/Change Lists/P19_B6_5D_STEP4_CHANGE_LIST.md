# P19-B6.5d — Step-4 Change List (asset-class stamp integrity)

> **For Langston (Step-4 code review, BEFORE push).** Implementer: Claude New (CC-B). Scope+audit: `Scope Files/BATCH_P19_B6_5D_ASSET_CLASS_INTEGRITY_SCOPE.md` (commit 419408374, your Step-1 reconciliations folded in).
> **INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run `git status`/`git log` on the gdrive mount.** Read the embedded snippets below + the raw diff at `/home/langston/inbox/p19-b6-5d/p19-b6-5d.diff` (Read-tool, local FS). For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.
> **Diffstat:** 14 files, +240 / −102. New test: `server/tests/unit/p19-b6-5d-asset-class-integrity.test.ts` (14 tests, all pass). **Bench: tsc-baseline clean (no regressions above baseline); the 9 vitest file-failures are the pre-existing #226 DB-isolation env issue — reproduced on the clean baseline with my changes stashed, so NOT from this batch.** Dormant baseline verified (paper+live engines off, `active_asset_classes={}`).

The invariant this batch enforces: **one SizingContext = one asset class = one pipe; the class is STAMPED at pipe entry and CARRIED with the pair — never re-derived from the symbol string downstream** (re-deriving hardcodes `exchange='kraken'`, which mis-handles the 9 USD/8 EUR collision tickers + single-letter bases).

---

## OBJ-1 — single-letter resolver widen (clears the live `A/EUR@kraken` alert) — `shared/asset-classes.ts`
One SSOT floor constant feeds all three resolver regexes (mirrors `CRYPTO_SPOT_BASE_MAX_LEN`):
```ts
export const TICKER_BASE_MIN_LEN = 1;          // was an implicit 2
const XSTOCK_PERP_RAW   = new RegExp(`^PF_[A-Z]{${TICKER_BASE_MIN_LEN},6}X(USD|EUR|GBP)$`);
const XSTOCK_SPOT_DISPLAY = new RegExp(`^[A-Z]{${TICKER_BASE_MIN_LEN},5}x\\/[A-Z]{3,4}$`);
export const CRYPTO_SPOT_CANONICAL = new RegExp(`^[A-Z0-9]{${TICKER_BASE_MIN_LEN},${CRYPTO_SPOT_BASE_MAX_LEN}}\\/[A-Z0-9]{3,4}$`);
```
`symbol-normalize.ts` imports the compiled `CRYPTO_SPOT_CANONICAL` (not a re-declared literal) → widen propagates, zero drift.
**Verified:** `A/EUR→crypto_spot` (A=Vaulta), `T/USD→crypto_spot` (via COLLISIONS gate), `/USD` still throws, 15-ok/16-throws unchanged. **Collision precedence held** — DISPLAY→COLLISIONS→SYMBOLS→CANONICAL→raw order means the widened single-letter canonical can never shadow the collision map (locked as the ORDER test in OBJ-7).

## OBJ-2 — per-pair classify-fallthrough alert key — `server/index.ts:265`
```ts
- dedupe_key: 'classify-fallthrough-active',
+ dedupe_key: `classify-fallthrough-active:${symbol}@${exchange}`,   // two distinct unclassifiable pairs → two alerts
```

## OBJ-3 — SWAP the stamp-available re-derive sites to prefer the carried stamp
**SQE gate (highest value) — `signal_quality_evaluator.ts:227` (combined OBJ-3+OBJ-5):** honor `input.assetClass` (REQUIRED@:106); FAIL-CLOSED on a genuinely-missing stamp (no silent `?? 'crypto_spot'`). This is the gate that decides xstock-vs-crypto path, so re-deriving a collision ticker silently skipped every xStock gate.
```ts
- const resolvedAssetClass = safeResolveAssetClass(input.symbol, 'kraken') ?? 'crypto_spot';
+ const resolvedAssetClass = asValidAssetClass(input.assetClass) ?? safeResolveAssetClass(input.symbol, 'kraken');
+ if (resolvedAssetClass === null) { return { passed:false, ...failures:['unclassifiable_asset_class'] }; }
```
**signal-orchestrator (4 sites, 1510/1696/2042/2146) — `signal-orchestrator.ts`:** these are the CRYPTO pipe (evaluateMarket stamps `sizingContext.assetClass='crypto_spot'`). I used the stamp DIRECTLY (typed non-null `AssetClass`, satisfies §D without `asValidAssetClass(...) ?? …`): 1510→`sizingContext.assetClass`; 1696 captures `const assetClass = sizingContext.assetClass` (was the throwing re-derive); 2042 ORB-gate + 2146 NetEV-filter reuse that captured `assetClass` (the `.filter()` callback closes over it). **Top-level throwing `resolveAssetClass` import removed (now unused).** Reconciliation confirmed: the 4 were NEVER B4a-converted (out-of-frame), not regressed.
**routes.ts:11835 + 12165 (P/L display):** swapped THROWING `resolveAssetClass` → prefer `pos.assetClass`, safe-resolve fallback, **logged** crypto_spot last-resort (display route — not fail-closed; a position always carries a NOT-NULL stamp so the fallback is defensive). Removes a route-500 risk on a bad symbol.
**paper-execution-engine 1756/2758 (+ inner position filters 1760/2784):** prefer `signal.metadata?.assetClass` (the 2122 model idiom); **§B instrument** the fallback (`[STAMP_MISSING_ACTIVE]`) on the active promotion/execution-entry sites; position filters use each `p.assetClass`.
**pre-execution-validator.ts:148:** prefer `request.signal.assetClass`/`.metadata.assetClass`; §B instrument; existing fail-closed null-block retained.
**ready_to_buy_service.ts 1243/1256 (AMR shadow grouping, telemetry):** prefer `s.assetClass`/`bestSignal.assetClass`, safe-resolve fallback, existing null-skip kept (no money-site warning — shadow path).

## OBJ-4 — THREAD the 2 no-stamp active sites (removes the in-code "future batch" deferral)
**`expectancy.ts evaluateTradeExpectancy(symbol, tradeMeta, assetClass?)`:** prefer the threaded stamp; single production caller `paper-execution-engine.ts:2030` now passes `asValidAssetClass(signal.metadata?.assetClass) ?? undefined`.
**`feePercentFor(symbol, assetClass?)` + order-placer:** the order requests ALREADY carry `assetClass` (types.ts:110/133; open path stamped it at :2150, close at :1218). So the thread is clean — `FeePercentResolver = (symbol, assetClass?) => number`; order-placer's two `feeQuote` lines now pass `req.assetClass`; injection `(s,ac)=>this.feePercentFor(s,ac)`; direct caller :1206 passes `position.assetClass`. The money-boundary fill fee is now class-correct, not symbol-re-derived. Invariant-throw on total-null retained.

## OBJ-5 — remove silent `?? 'crypto_spot'` defaults
**`rtb-refresh-service.ts` (active-reachable, §E):** throwing `resolveAssetClass`→safe; an unclassifiable signal DROPS (fail-closed, `continue`) + a non-RTB-active class DROPS rather than being relabeled crypto_spot (was a real misroute). **Two `continue`s replace two silent crypto_spot defaults.**
**Two reject-capture archive tail-defaults (`ready_to_buy_service.ts:1562`, `paper-execution-engine.ts:2229`):** compute the class; if null, SKIP the archive row (no mislabeled crypto_spot telemetry).
**VTS passive (`vts-runner.ts`):** the audit named 4 sites; the grep found **5** (1999/2667/3043/3690/3781) — I fixed all 5 via a DRY `vtsResolveClassOrLoggedDefault(symbol)` helper (logged default, never silent — passive rule). **`getCachedCostMetrics(... ?? 'crypto_spot')` at 3043 included.**

## OBJ-6 — swap exactly 2 throwing-variant passive sites
`market-context-engine.ts:1442` (pair-scan archiver) + `vts-service.ts:341` (sim friction): throwing `resolveAssetClass`→safe; MCE skips the archive write on null, VTS `simulateTrade` logs + crypto_spot fallback (passive sim, fail-soft). **Reconciliation: `vts-service.ts:963` the audit-vs-subagent disagreement — the subagent mislabeled it "throwing"; it is ALREADY `safeResolveAssetClass` + null-guarded, so correctly LEFT (scope was right).**

---

## ⚠️ Judgment calls I need you to ratify
1. **signal-orchestrator stamp used DIRECTLY** (`sizingContext.assetClass`, not `asValidAssetClass(stamp) ?? safeResolve`). Rationale: it's a typed non-null `AssetClass` field on the crypto pipe → §D non-null is compile-guaranteed; the `?? safeResolve` fallback would be dead code. Agree?
2. **routes.ts display sites: logged crypto_spot last-resort, NOT fail-closed.** They are P/L *reporting* routes (not money execution), and a stored position always carries a NOT-NULL stamp, so the last-resort never fires in practice but keeps the route from 500-ing. Agree vs strict fail-closed?
3. **`vts-runner.ts:2772` `const assetClass = trade.assetClass ?? 'crypto_spot'`** — a STAMP-with-silent-default, NOT a resolver call, so it fell outside the function-name audit (the 35). It's the same silent-crypto_spot concern. **Include it in this batch (one-line: log the default) or defer?** I left it untouched pending your call to avoid silent scope-expansion.
4. **§B `[STAMP_MISSING_ACTIVE]` warnings** on paper-engine promotion (1756) + execution-entry (2758) + pre-execution-validator (148): if `signal.metadata?.assetClass` turns out NOT to be carried to those stages, these fire per-signal. Dormant now; the B6.5e dry-run will reveal the rate. Acceptable as the §B "pipe-entry bug detector," or downgrade to a counted/throttled log?

Acceptance gate (Step-8): the `classify-fallthrough-active` alert (id `58367b27`) clears post-deploy + A/EUR flows; no active-path re-derive of a stamped pair remains; CI all-4-green.
