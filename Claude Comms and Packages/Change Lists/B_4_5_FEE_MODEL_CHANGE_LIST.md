# B-4.5 — Step-4 change list (DB-governed Tier-1 fee model) — for Langston code review

> Local commits `2a0cc18bb` + `cfc6dab01` on `migration/aws-supabase`, NOT pushed — this review gates the push.
> INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git on the gdrive mount. Everything load-bearing is embedded below; for inspection beyond it use `ssh staging` (note staging does NOT have these commits yet).
> Scope `B_4_5_FEE_MODEL_SCOPE.md` (ACK'd) + pre-audit `B_4_5_PRE_AUDIT.md` v3 (APPROVED; §0 amended). Bench: tsc baseline gate OK (no regressions); vitest fully triaged (§7).

## 0. PREVIOUSLY-STATED-VS-NOW (§9.2)

1. **PREVIOUSLY: xstock round-trip ≈1.87%. NOW: 1.82%. REASON:** the scope's 1.87% was an estimate mis-add; the kernel formula on actual statics = (0.008×2)+(0.0005×2)+0.0012 = **0.0182**. Crypto 1.80% unchanged. The new unit lock pins both.
2. **PREVIOUSLY: 12-importer surface, 4 test files. NOW: 16 production files + 8 test files. REASON:** fee consumers beyond the direct exchange-defaults importers surfaced during the sweep — (a) `expectancy.ts`'s `DEFAULT_FEE` default-params chain via `adaptive-thresholds.ts` with 3 live call sites relying on the silent default (SQE ×2, vts-runner); (b) a **SECOND fee source** in `pre-execution-validator.ts` (§5 — the buried finding); (c) `slippage-fee-model`'s class-blind defaults requiring per-class threading to its 2 callers; (d) a third MCE test suite + 11.4C-R2 suite reaching the now-fail-hard merge.

## 1. Migration — `2026-06-11-b45-fee-model-tier1.sql` (MANIFEST-registered; rollback alongside, excluded)
4 rows `ON CONFLICT DO NOTHING`: `fee_model` × {crypto_spot, xstock_spot} × {spot_taker_fee '0.008', spot_maker_fee '0.004'} (decimal, per pre-audit Q2). Header carries the Tier-1 provenance + taker-both-legs decision rule + Phase-21 tier-automation deferral. Rollback file warns it pairs with a code revert (rows gone + code in = boot fail, intended).

## 2. THE merge site — `cost-model.ts` getFrictionForAssetClass
```ts
case 'crypto_spot':
  return { ...CRYPTO_SPOT_FRICTION, ...resolveFeeRates(assetClass) };
case 'xstock_spot':
  return { ...XSTOCK_SPOT_FRICTION, ...resolveFeeRates(assetClass) };
// resolveFeeRates: getCachedNumberRequired('fee_model','spot_taker_fee'|'spot_maker_fee',
//   {exchange:'*', assetClass, strategy:'*', regime:'*'}) — fail-hard, warmed at boot.
```
New object every call (R3 — statics never mutated). `updateCachedCostMetrics` DELETED (R2 — tombstone comment left in place). `DEFAULT_FEE` re-export retired; `DEFAULT_SLIPPAGE/SPREAD/MAX_COST_BOUND` re-exports kept.

## 3. Statics — exchange-defaults + friction tombstones + clamp
- `exchange-defaults.ts`: DEFAULT_TAKER_FEE / DEFAULT_MAKER_FEE / DEFAULT_COST_BUNDLE / computeDefaultTotalCost **deleted** (retirement comment with the Tier-6 rationale). `MAX_COST_BOUND 0.01 → 0.02` with the headroom comment (§1 pre-audit).
- BOTH friction modules: `feeRateTaker: NaN, feeRateMaker: NaN` tombstones (loud-on-misread); xstock literals + the lying "round-trip cap" comment dead; `maxCostBound` both = global 0.02 with the per-component semantic + "declared-not-enforced today, kept for B81" note.

## 4. b72-warmup — prefetch + strict boot assertion
`'fee_model'` added to PREFETCH_MODULES + a dedicated post-prefetch block asserting **both constants × both classes** resolve (partial-seed guard, mirrors the calibration_epoch precedent) **+ sanity rails: any fee outside (0, 0.05] decimal refuses to start** (fat-finger guard ABOVE the clamp). Boot log: `[B45][warmup] fee_model verified: crypto taker=0.008 ...`.

## 5. ★ BURIED FINDING — a SECOND fee source in `pre-execution-validator.ts` (~:133)
```ts
// BEFORE — Tier-6 string fallbacks, never in the pre-audit's importer table
// (it parses system_context, doesn't import exchange-defaults):
const makerFeePct = parseFloat(systemContext?.makerFeePct || '0.0016');
const takerFeePct = parseFloat(systemContext?.takerFeePct || '0.0026');
// AFTER — explicit system_context overrides still win (legacy operator surface,
// flagged for the Phase-16 register); the FALLBACK is the resolved per-class rate:
const _b45Friction = getFrictionForAssetClass(_b45AssetClass);
const makerFeePct = systemContext?.makerFeePct ? parseFloat(systemContext.makerFeePct) : _b45Friction.feeRateMaker;
const takerFeePct = systemContext?.takerFeePct ? parseFloat(systemContext.takerFeePct) : _b45Friction.feeRateTaker;
```
Also: its `calculateFees(orderValue, false)` → `calculateFees(orderValue, false, _b45AssetClass)` (resolveAssetClass on the signal symbol). **Q-R1: agree with explicit-override-wins + resolved-fallback, or should B-4.5 kill the system_context fee override entirely?** (I kept it: changing a possibly-user-facing settings contract exceeds this batch's scope; registered for Phase 16.)

## 6. Per-class threading (the engine-reality paths)
- **slippage-fee-model.ts**: class defaults deleted → `private resolveFee(assetClass, constant)`. `calculateFees(grossAmount, isMaker, assetClass, makerFeeRate?, takerFeeRate?)` (REQUIRED class; `??` not `||`). `modelTradeRealism(..., intendedPrice, assetClass, orderBook?, ...)`. `getConfig(assetClass)`.
- **realtime-paper-executor.ts:93**: threads `resolveAssetClass(request.symbol,'kraken')`; the `false // Assume taker` comment now cites the Phase-19 direction-B eval.
- **expectancy.ts**: `isSignalProfitable` + `getROIDetails` — `fee` becomes **REQUIRED** (was `= DEFAULT_FEE`, the silent crypto-era default). 3 call sites threaded: SQE:312 (`getFrictionForAssetClass(input.assetClass).feeRateTaker`), SQE:449 (sync path, `undefined` keeps the 0.5 confidence default), vts-runner:1300-1301 (passes the SAME `costMetrics.fee` + `estimatedSlippage` its Net-EV gate just used — gate consistency).
- **paper-execution-engine.ts**: `FEE_PERCENT` static field retired → `feePercentFor(symbol)` per-class at the 3 fill sites (close ×2 via one local, entry ×1). SLIPPAGE_PERCENT untouched (out of scope).
- **adaptive-thresholds.ts**: `DEFAULT_FEE` + config `defaultFee` retired (zero remaining consumers — verified).
- **cost-cache.ts**: `resolveCryptoTakerFee()` (cache is structurally crypto-lane) replaces DEFAULT_TAKER_FEE at the clamp default, the getOrSet seed (DEFAULT_COST_BUNDLE inlined to resolved fee + static slip/spread), and empty-stats avgFee.
- **routes.ts** (4 sites): two paper-position P/L display surfaces → per-position-symbol resolved taker; the per-class-state diagnostic → `feePercent: _b45Friction(cls).feeRateTaker * 100` (genuinely per-class now — the knownGaps wildcard note rewritten to slippage-only).

## 7. Tests — bench evidence
- **NEW `_seedModuleCacheForTests`** (module-constants-service): vitest-guarded in-memory cache seed (same `CachedModule` shape, never expires; throws outside test env). Rationale: prefetchModule needs a DB; without the seed, previously-DB-free unit suites would have joined the local-fail set. **Q-R2: comfortable with the test-only export, or prefer a separate test-utils module?**
- NEW `b45-fee-model.test.ts` (4 locks): per-class Tier-1 resolution + statics; FAIL-HARD on cold cache; NaN-tombstone + no-mutation; EV flow-through 1.80%/1.82% + xstock consumer fee.
- Updated: `cost_cache.test.ts` (retired-constants regression locks + MAX_COST_BOUND 0.02 + Tier-1 fixtures + seed), `net_expectancy.test.ts` (seed + 0.008), `b79-0n-execution-audit.test.ts` (Tests 9/10/12 → new patterns + `not.toMatch(DEFAULT_TAKER_FEE)` lock), 3 MCE suites + `directive-11.4C-R2` (seed — they reach the now-fail-hard merge).
- **Bench verdict**: tsc baseline OK. Full vitest fully triaged: every remaining failure verified PRE-EXISTING by a clean-bench (stash) comparison run — pattern-filter 7 + regime-strings 5 fail IDENTICALLY without my changes; the file-level fails are the known no-local-Postgres class. **Bonus: cost_telemetry + net_expectancy's fee tests now pass locally** (the seed fixed what DB-absence used to break).

## 8. Deploy plan (on your APPROVE)
Push → CI 4-green → staging `git pull && npm run db:migrate && npm run build && pm2 restart` → verify boot assertion line + cost telemetry 0.80/0.40 + round-trip 1.80/1.82% + VTS cadence + **EPOCH BUMP ALL 3 SOURCES** (vts/paper_sim/live — shared-substrate rule; via module_constants write path) + 1h admit counters; 24h admit-rate comparison at the 06-11T19Z soak touchpoint (with the lq_min load sanity — one window, both reads).

**Questions: Q-R1 (§5), Q-R2 (§7). Everything else implements the approved pre-audit design as written. Reply APPROVE / revisions.**
