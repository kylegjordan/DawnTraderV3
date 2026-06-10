# B-4.7 chunk A — Step-4 diff-A change list (per-class dominant regime, objectives 1-3)

> Local commit `26be9a8c2`, NOT pushed — this review gates the push. INFRASTRUCTURE: DO NOT touch /mnt/gdrive; everything load-bearing is embedded; staging does NOT have this commit.
> Bench: tsc baseline OK (net server errors DOWN — my block replacements removed erroring lines); new lock suite 5/5; FULL vitest = the identical pre-existing 12-fail set, 1652 pass, ZERO new failures.

## Your four pre-audit diff-A items — resolutions

**(a) per-class friction fallback:**
```ts
const pool = activeFilterPool.getActivePool('paper')
  .filter(p => resolveAssetClass(p.symbol, 'kraken') === assetClass);
const symbolsToSample = pool.length >= 10
  ? pool.slice(0, 100).map(p => p.symbol)
  : (assetClass === 'crypto_spot' ? TOP_100_FALLBACK_PAIRS : pool.map(p => p.symbol));
// count === 0  →  { score: null, sampleSize: 0, ... }  — the synthetic 25 default is GONE
```
Crypto keeps its static fallback (the list is crypto by construction); xStock thin/idle → `score: null`, surfaced as a `NO_SAMPLE` FrictionStatus (`value:-1, status:'NO_SAMPLE'`, explicit narrative). `FrictionResult.score` + `MarketIndicators.globalFrictionScore` + `getGlobalFriction(assetClass)` are now `number | null`. NOTE the threshold became **≥10 same-class pool members** (was ≥50 on the mixed pool): 50 was sized for the mixed pool; the xStock pool is ~75 names at full strength, and 10 same-class sampled books is an honest minimum for an average. Flag if you want a different floor.

**(b) at-open preservation:** ALL outcome-path re-resolutions removed (vts-runner ~:2990-:3012) — `globalRegime/globalFriction/globalDirectionalBias(Score)` are `input.X ?? undefined` only. The open-stamp itself: `getDominantRegimeForClass(tradeAssetClass)?.regime ?? undefined` (the old `?? regime` SILENT per-pair substitution is gone), `getGlobalFriction(tradeAssetClass) ?? undefined`, per-class DBS getters.

**(c) column nullability:** `global_regime` = `varchar(40)` nullable (schema:1000) ✓ — undefined/null stamps are representable; no schema change.

**(d) dormant flipRate note:** queued for governance as RUNNING_ISSUES #219 (with #217 CONTEXT_BONUS→AMR and #218 below).

## The build (8 files)

1. **market-context-engine.ts** — `getDominantRegimeForClass(assetClass)`: key-suffix filter (`${symbol}:${assetClass}` keys), `MIN_CLASS_VOTE_PAIRS = 5` (matches the pre-existing MCE-preferred threshold), null below. Mixed `getDominantRegime()` DELETED. `_seedCacheForTests` (vitest-guarded, throws outside test env — the B-4.5 `_seedModuleCacheForTests` pattern).
2. **telemetry-aggregator.ts** — `PairTelemetry.assetClass?` (optional ONLY for pre-B-4.7 disk-rehydrated records — excluded from votes, age out); `recordPairTelemetry` data param `assetClass: AssetClass` REQUIRED (compile-forced the 2 writer sites); per-class vote with the same MIN-5/null semantics; mixed vote DELETED.
3. **vts-runner.ts** — both telemetry writes stamp `assetClass` (trade.assetClass / tradeRecord.assetClass); open-stamp + outcome path per (b); `:4445` contextBonus comment now cites the #217 register item; WIRE-IN #16 deferral notes superseded.
4. **market-indicators.ts** — `getMarketIndicators(assetClass)` REQUIRED; ALL module singletons → per-class `ClassIndicatorState` Map; `voteStatus: 'LIVE' | 'IDLE_OR_WARMING'` on the bundle (the explicit no-silent-stale-hold marker; marketRegime carries last-known WITH the flag, regimePercentage 0); MCE-preferred→telemetry per class; DBS: crypto = existing `computeGlobalBias` path, xstock = `xstockDirectionalBiasStore.getLatestSnapshot()` (B-PHASE-A2 store — clean if/else, no cross-path); `favoredStrategies/SignalTypes` per class (the 'crypto_spot' hardcode + the OBSERVABILITY-#18 deferral note superseded); per-class getters (`getCurrentRegime/getGlobalFriction/getLastGlobalDBSCategory/getLastGlobalDBSScore/getFrictionSampleSize/updateGlobalRegime/computeGlobalFriction` all take REQUIRED assetClass).
5. **market-events.ts** — per-class `lastRegimeByClass/lastFrictionBandByClass/classWasIdle` Maps; `checkRegimeTransition(assetClass, regime, voteStatus)`: IDLE suppresses (one log line on entry), first LIVE after idle RE-SEEDS silently (no false flip on Sunday reopen — 24/5 anchor), events class-labeled `[xstock_spot]`; friction transitions skip `NO_SAMPLE`; startup event-file rehydration RETIRED (pre-B-4.7 events carry no class label; trackers re-seed on first LIVE vote — no spurious event either way); `initializeMarketState` + the 30s scheduler check loop BOTH classes; `getLastKnownState(assetClass)`; `clearMarketEvents` clears the Maps.
6. **routes.ts** — ranked-pairs panel: `globalRegime` stays crypto (back-compat) + NEW `globalRegimeByClass`; `/api/market-indicators`: top-level stays the crypto bundle (back-compat for the Analytics Overview panel) + NEW `perClass.{crypto_spot,xstock_spot}` (regime, voteStatus, score, percentage, friction) + `voteStatus` on the top-level bundle.
7. **trade-model.ts** — **★ NEW FINDING:** `getMarketContextFields()` has ZERO callers (dead) AND carried a hardcoded `fee: number = 0.0026` default (a B-4.5-class Tier-6 literal the importer sweep couldn't see — default param, not an import). Register note added in code → RUNNING_ISSUES **#218** at governance; explicit `'crypto_spot'` keeps the dead path compiling.
8. **b47-per-class-regime.test.ts** — 5 locks: per-class winners differ on a two-class seeded cache; null below MIN; mixed votes DELETED (regression lock on both sources); telemetry write-stamp filter; idle suppress → silent re-seed → labeled event (other class untouched). Test-infra notes: vite-node hoists runtime imports (env-set + dynamic imports), M70 guard needs `caller: 'vts'`.

## Deltas / judgment calls to confirm
1. Friction sample floor 50→**10 same-class** (above).
2. **UI back-compat strategy:** existing panels keep reading the crypto bundle top-level; per-class data is ADDITIVE in both payloads. The §9.3 UI verification will confirm the existing Overview panel renders unchanged; a richer two-class display is a small client follow-up if Kyle wants it (the API already serves it). Flag if you want the client edit in THIS batch.
3. `updateGlobalRegime(assetClass, …)` had zero external callers (kept, per-class, for the existing export surface).

Reply APPROVE (→ I build chunk B #163 next; per your Q1 option I'd deploy A WITH B unless you prefer A early — C1 stops bleeding either way only on deploy, so say if you want A shipped alone tonight) / revisions.
