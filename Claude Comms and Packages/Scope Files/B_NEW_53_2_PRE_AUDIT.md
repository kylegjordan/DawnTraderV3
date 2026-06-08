# B-NEW-53.2 — PRE-AUDIT (Step-2) — xStock admitted at-entry-context block (#208)

**Author:** Claude Code. **Date:** 2026-06-08. **Predecessor:** B-NEW-53.2 scope (Langston Step-1 = all 5 ratified, 2 riders for Step-2). This pre-audit discharges both riders + does the per-field accounting (Ask-4).

---

## RIDER (a) — hoist-region purity → ✅ CONFIRMED side-effect-free
The region between the admitted archive hook and the `dollarValue`/`quantity` computation (`eval-cycle.ts` L703-726), read in code:
- L703-723 = the `archiveSignalEval({...})` try/catch. `archiveSignalEval` is fire-and-forget telemetry — returns nothing; its result is not read. L724 = blank.
- L725 `const dollarValue = 150;` — a literal constant.
- L726 `const quantity = entryPrice > 0 ? dollarValue / entryPrice : 0;` — pure arithmetic over `entryPrice` (a `const` from detect, never reassigned in this scope) + `dollarValue`.
- The payload (L727-761) reads only values in scope at L703: `entryPrice`/`stopLoss`/`takeProfit` (detect consts), `totalFriction` (L609), `regime`/`regimeScoreRaw`, `stratDef`/`strategyKey`, `finalScore`/`hybridScore`/`predictiveConfidence`/`regimeWeight`/`decayPenalty`, `lane.sourcePool`, `mceContext.*`, and `askDepthUsd` (an **immutable function parameter**, L290).
**Conclusion:** moving `dollarValue` + `quantity` + the named payload `const xOpenTrade` to just **above** L703 is provably pure — nothing they read is produced after L703, and nothing between L703 and L726 mutates an input. The archive-before-register ordering is preserved; `registerOpenVtsTrade(xOpenTrade)` receives the identical object → **zero behavior change**.

## RIDER (b) — `expectedEdge = netEV` units/basis → ⚠️ THEY DIFFER (decision needed)
Read the kernel (`server/core/calculations/net-expectancy-kernel.ts`):
```
distTarget = |targetPrice − entryPrice|        // ABSOLUTE PRICE units
distStop   = |entryPrice − stopPrice|          // ABSOLUTE PRICE units
rawEV      = pWin·distTarget − pLoss·distStop   // price-space
netEV      = rawEV − totalFriction              // price-space → SCALES WITH ASSET PRICE
```
Crypto's `expectedEdge` (`vts-runner.ts` ≈L1595) = `finalScore · dynamicTarget − frictionCost`, where `dynamicTarget = |tp−entry| / entry` is a **return fraction** and `finalScore` is a governed **score** → **score/return-space, scale-free**.

**So the two are NOT cross-comparable — different FORMULA (pWin/pLoss-weighted vs finalScore-weighted) AND different UNITS (absolute price vs normalized return).** A $0.08 xStock has `netEV ≈ 0.01` (price units); a crypto trade's `expectedEdge` is a ~0.0x return fraction. Same field name, two incommensurable scales — exactly what your rider was protecting against.

**Recommendation (your ratify):**
- **Key name — keep `expectedEdge` (Option A), with a loud documented caveat,** NOT a silent paper-over. Rationale: the field's *purpose* is identical per class — a per-class at-entry trade-quality value used for selectivity (HCE: "top-decile by expected-edge net-positive"), and HCE methodology **already forbids pooling crypto + xStock**. So the value is only ever used *within* a class, where `netEV` correctly rank-orders xStock trades and crypto's `expectedEdge` rank-orders crypto trades. I'll add (i) a code comment at the hook stating the xStock basis (price-space net-EV from the kernel) and that it is NOT cross-class comparable, and (ii) a governance note (CHANGES_AND_FIXES + SIM) with the same caveat. *Alternative if you prefer:* a distinct key `xstock_net_ev` — but that breaks the key-set mirror (Ask-4) and the never-pool rule already prevents the misuse.
- **Do NOT normalize** (`netEV/entry` or `netRewardToRisk`): normalizing aligns the *units* but the *formulas* still differ, so it would look comparable while still not being — more misleading, not less. Capture the **raw `kernelResult.netEV`** = the actual quantity the admit gate compared against `VTS_NET_EV_FLOOR` (the honest decision value). The row also carries `entryPrice` + `stopLoss`, so Phase-25 can derive a scale-free per-class metric itself. **The kernel also returns `netRewardToRisk` (scale-free) — flagging it as the better Phase-25 selectivity normalizer; say the word if you'd rather capture that instead of / alongside netEV.**

## Per-field accounting (Ask-4 — every crypto B70.2 admitted key → xStock; no silent drops)
| crypto key | xStock | source / reason |
|---|---|---|
| entryPrice / target / stopLoss / positionSize / quantity | ✅ value | `xOpenTrade.*` |
| signalType / patternType / pool / sourcePool | ✅ value | `stratDef.*` / `'rotational'` / `lane.sourcePool` |
| hybridScore / predictiveConfidence / regimeWeight / decayPenalty | ✅ value | in-scope locals |
| atrAtOpen | ✅ value | `xOpenTrade.atrAtOpen` (`mceContext.indicators.atr`) |
| regimeConfidenceRaw / macroModifierValue / phase / phaseAgeSeconds | ✅ value | `xOpenTrade.*` |
| pairDirectionalBias / pairDirectionalBiasScore | ✅ value | `xOpenTrade.*` (`mceContext.directionalBias.*`) |
| **expectedEdge** | ⚠️ `kernelResult.netEV` | price-space, documented caveat (rider b) |
| modulators.regimeConfidenceModulated | ✅ value | `xOpenTrade.regimeConfidenceModulated` |
| **pairIdHash** | `null` | crypto-only cohort A/B marker (B67.3); xStock runs no such experiment |
| **strategyPhaseWeight** | `null` | eval-cycle applies no phase-preference modulation |
| **filterTier** | `null` | xStock uses lanes, not the crypto IMF filter-tier; not in scope |
| **globalRegime / globalFriction / globalDirectionalBias / globalDirectionalBiasScore / pairFriction** | `null` | **crypto market-structure concepts — verified NOT computed on the xStock eval-cycle path** (grep-confirmed: none of `getGlobalFriction`/`getLastGlobalDBS*`/`getDominantRegime` imported or called). Honest null, not fabricated. |
| modulators.chain_modulated_confidence | `null` | xStock applies no B67 confidence chain |

So the xStock admitted `features` will mirror the crypto key SET exactly: ~16 genuine values + ~9 documented nulls (every crypto key accounted for, `?? null` preserves the JSONB key).

## Implementation plan (Step-3)
1. `eval-cycle.ts` admitted branch: hoist `dollarValue` (L725) + `quantity` (L726) above the archive hook; build `const xOpenTrade = {…the L727-761 payload…}` (annotate with `registerOpenVtsTrade`'s param type so the `'rotational'`/`'depth_usd'` literal-unions type-check); add the at-entry `features` + `modulators` block reading purely from `xOpenTrade` + locals (`kernelResult.netEV` for expectedEdge); `await registerOpenVtsTrade(xOpenTrade)`.
2. Bench: `node scripts/check-tsc-baseline.mjs` + `npx vitest run`.

## Verification (Step-7, live)
Post-deploy xStock admitted rows → the at-entry block populated (genuine values non-null, the 9 documented-null keys present-as-null); archived entry/stop/target == the same trade's `vts_open_trades` row; trade-open count unaffected.

## Governance at close
RUNNING_ISSUES #208 resolved; CHANGES_AND_FIXES (incl. the expectedEdge units caveat); SIM (the B70.2 xStock note → realized); BATCH_CATALOG; PHASE_HISTORY; MEMORY 3-way.

## Step-2 ask to Langston
(b) Ratify **Option A (keep `expectedEdge`, raw `netEV`, documented caveat)** vs a distinct key vs capturing `netRewardToRisk` instead/alongside. Everything else (rider a clear; per-field accounting) is informational — flag any null you'd rather see as a genuine value.
