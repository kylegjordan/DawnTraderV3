# B-XSTOCK-GLOBALS — Step-4 code review (CC-A / Claude Old implementing; Kyle reassigned from CC-B)

INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. The full diff is embedded below. For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

## Context / what Kyle raised
xStock VTS trades show blank **global regime / global friction / global DBS** ("—" / "pending") on the ML page; crypto populates them. Kyle confirmed we BUILT xStock-specific global calcs in two batches (B-4.7 per-class + B-PHASE-A2 xStock DBS store), it worked, regressed, was fixed, and regressed again. My earlier "by design" read was WRONG.

## Diagnosis (root cause — verified live)
The xStock per-class global computation is HEALTHY right now (staging PM2, every cycle):
- `[Phase14][MarketIndicators] class=xstock_spot regime=STRUCTURAL_TRANSITION vote=LIVE`
- `[GlobalFriction][Audit] (xstock_spot) store-sourced: score=81 sample=~360`
- `[B62][MarketIndicators] Global DBS (xstock_spot): score=-0.221 category=DOWN_WEAK pairs=418`

So the cache (`cachedGlobalRegime/cachedGlobalFriction/cachedGlobalDBSCategory/Score` for xstock_spot) is populated. The break is the **handoff at trade-open**:
- **B-4.7** made `registerOpenVtsTrade` (vts-runner.ts:3062, 3076-3078) **caller-pass-only** — `input.X ?? undefined`, no cache back-fill (it kept a back-fill ONLY for `pairFriction` at 3063-3071).
- The **crypto inline open-path** (vts-runner.ts:1561-1576) passes the 4 globals from the per-class getters.
- The **xStock caller** (`eval-cycle.ts` xOpenTrade @ ~725) sets only `pairDirectionalBias[Score]` — never the 4 globals → they default `undefined` → persisted blank. Confirmed in DB: a live xStock row (WDC/USD) context has NO global keys; a crypto row (ASTER/USD) has `globalRegime/globalFriction/globalDirectionalBias`. This is the "B-4.7 pulled the net, only crypto got rewired" regression.

NOT a gate: xStock trades open fine without these (they are telemetry/learning context, not a pre-open gate). Impact = every xStock VTS row is recorded without whole-market context → cross-class learning is blind to that dimension for xStocks.

## The fix (mirror the crypto per-class stamp)
```diff
 import { getMarketContextEngine } from '../../services/market-context-engine.js';
+import { getCurrentRegime, getGlobalFriction, getLastGlobalDBSCategory, getLastGlobalDBSScore } from '../../services/market-indicators.js';
 import { recordSyncSpan, syncSpanStart } from '../../services/scan-stall-instrument.js';
```
```diff
           pairDirectionalBias: mceContext.directionalBias?.category,
           pairDirectionalBiasScore: mceContext.directionalBias?.score ?? null,
+          // at-open per-class GLOBAL snapshot (B-4.7 made registerOpenVtsTrade caller-pass-only)
+          globalRegime: getCurrentRegime(ASSET_CLASS),
+          globalFriction: getGlobalFriction(ASSET_CLASS) ?? undefined,
+          globalDirectionalBias: getLastGlobalDBSCategory(ASSET_CLASS),
+          globalDirectionalBiasScore: getLastGlobalDBSScore(ASSET_CLASS) ?? undefined,
           macroModifierValue: getMarketContextEngine().getCurrentMacroContext()?.modifier.value,
```
`ASSET_CLASS = 'xstock_spot' as const`. Field types: globalRegime?:string, globalFriction?:number, globalDirectionalBias?:string, globalDirectionalBiasScore?:number|null — all type-compatible, no casts.

## Bench validation (C:\dev, origin HEAD 362474d + this one file)
- tsc baseline gate: **OK — no regressions above baseline**.
- Unit suite: **1924 passed, 0 failed**, 160 skipped.
- 9 integration/system files fail on Postgres connection (bench has no DB — #226); none assertion-failed; CI runs them green with DB on push.

## Two calls I want from you
**Q1 — globalRegime source.** I used `getCurrentRegime('xstock_spot')` = the cached `cachedGlobalRegime` the getMarketIndicators cycle keeps updated (the SAME value displayed for xStock, guaranteed-populated). Trade-off: it returns the last-known regime even when the class is idle/warming, whereas the crypto path sources globalRegime from the telemetry-aggregator dominant vote (`?.regime ?? undefined` = honest-null-when-idle). I chose guaranteed-populate + matches-displayed over honest-null, because mirroring crypto's telemetry-only source risks stamping `undefined` for xStock when MCE (not telemetry) is the live xStock regime source. friction/DBS already mirror crypto exactly (per-class getters, null preserved). **Your call: keep getCurrentRegime, or switch globalRegime to MCE-dominant-then-telemetry-then-undefined to honor honest-null? I lean getCurrentRegime.**

**Q2 — guardrail (§13).** I want to add a loud tripwire: alert if an xStock VTS row opens with blank globals while `getMarketIndicators('xstock_spot')` voteStatus=LIVE — so a 3rd regression is caught at the source, not by eye. Include in THIS batch, or home it as a fast follow-up? I lean include-now (small).

## Ask
APPROVE the diff for push (or CHANGES-NEEDED), and answer Q1 + Q2. Batch name B-XSTOCK-GLOBALS, change-class non_architecture (telemetry-completeness; touches no gate/regime/filter math — it reads existing per-class outputs). §13 home will land in RUNNING_ISSUES + the completion report.
