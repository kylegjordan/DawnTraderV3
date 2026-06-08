# B-NEW-53.2 — STEP-4 CHANGE LIST (code review) — xStock admitted at-entry-context (#208)

**Author:** Claude Code. **Date:** 2026-06-08. **Reviewer:** Langston. **Step-1+Step-2:** ratified (payload-hoist; `expectedEdge=netEV` + `netRewardToRisk`; nulls accounted; never-pool condition).
**INFRASTRUCTURE NOTE:** do NOT `cd /mnt/gdrive` or `git status` the gdrive mount (FUSE hang). The full diff is embedded below; use `ssh staging` for any repo inspection.

**Diff = ONE file, `server/asset_classes/xstock_spot/eval-cycle.ts`. No migration (features JSONB). Telemetry-only; active trading OFF; zero behavior change to the trade or gates.**

---

## Your Step-2 conditions — discharged
- **Rider (a) hoist purity:** confirmed (see pre-audit). The hoisted `dollarValue`/`quantity` + the named `xOpenTrade` const move above the archive hook; `archiveSignalEval` is fire-and-forget (return not read); nothing between the hook and the register call mutates an input. Archive-before-register ordering preserved; `registerOpenVtsTrade(xOpenTrade)` gets the identical object.
- **Rider (b):** captured **both** per your call — `expectedEdge = kernelResult.netEV` (raw price-space, the literal value the admit gate compared to `VTS_NET_EV_FLOOR`) **and** `netRewardToRisk = kernelResult.netRewardToRisk` (kernel-native scale-free). Not normalized.
- **Never-pool is CODE-LEVEL (your blocking condition) — VERIFIED:** `scripts/hce/hce_study.py` tags each trade's `asset_class` (`resolve_asset_class`, L98-110) and **every** analysis stage loops `for ac in ['crypto_spot','xstock_spot']` separately (L262/318/371/431); `hce_ohlc_sim.py` (L162) + `hce_rawfeat.py` (L76) do the same. The two classes are never combined into one distribution — it's a per-`ac` partition in code, not prose. The caveat is documentary on top of an enforced partition.
- **Refinement to the pre-audit's null justification (surfaced honestly):** the 5 global-market-structure fields (`globalRegime`/`pairFriction`/`globalFriction`/`globalDirectionalBias`+score) are NOT merely "absent" — `registerOpenVtsTrade` **default-resolves** them internally when the caller omits them (B-NEW-22, `vts-runner.ts` L2925-2939), so they DO get stamped on the `vts_open_trades` row. They're null in the *admitted archive* because (i) they're resolved AFTER the archive hook (the ordering constraint), and (ii) they're crypto-market aggregates not part of the xStock decision. So: honest null in the at-entry archive; the values remain on the open-trade row if ever needed.

## CHANGE — `eval-cycle.ts` admitted branch (hoist + at-entry block)
**BEFORE:** archive (scoring-metadata-only `features`) → `dollarValue`/`quantity` → inline `registerOpenVtsTrade({...})`.
**AFTER (abbrev. — full in the file):**
```ts
// hoisted: pure, side-effect-free
const dollarValue = 150;
const quantity = entryPrice > 0 ? dollarValue / entryPrice : 0;
const xOpenTrade = {  /* the former register payload, named; pool:'rotational' as const, entryLiquidityKind:'depth_usd' as const */ };
try {
  archiveSignalEval({
    ...archiveCommon, rejectStage: 'admitted',
    gateDecision: { gate: 'net_ev_floor', accepted: true, netEv: kernelResult.netEV },
    // ⚠️ UNITS comment: expectedEdge = xStock price-space net-EV, NOT comparable to crypto; never pool (HCE partitions per ac).
    features: {
      entryPrice: xOpenTrade.entryPrice, target: xOpenTrade.takeProfit, stopLoss: xOpenTrade.stopLoss,
      positionSize: xOpenTrade.positionSize, quantity: xOpenTrade.quantity,
      signalType: xOpenTrade.signalType, patternType: xOpenTrade.patternType ?? null,
      pool: xOpenTrade.pool, sourcePool: lane.sourcePool, filterTier: null,
      hybridScore, predictiveConfidence, regimeWeight,
      expectedEdge: kernelResult.netEV, netRewardToRisk: kernelResult.netRewardToRisk, decayPenalty,
      globalRegime: null, pairFriction: null, globalFriction: null,
      pairDirectionalBias: xOpenTrade.pairDirectionalBias ?? null, globalDirectionalBias: null,
      pairDirectionalBiasScore: xOpenTrade.pairDirectionalBiasScore ?? null, globalDirectionalBiasScore: null,
      regimeConfidenceRaw: xOpenTrade.regimeConfidenceRaw ?? null, macroModifierValue: xOpenTrade.macroModifierValue ?? null,
      phase: xOpenTrade.phase ?? null, phaseAgeSeconds: xOpenTrade.phaseAgeSeconds ?? null,
      strategyPhaseWeight: null, pairIdHash: null, atrAtOpen: xOpenTrade.atrAtOpen ?? null,
    },
    modulators: { chain_modulated_confidence: null, regimeConfidenceModulated: xOpenTrade.regimeConfidenceModulated ?? null },
    provenance: _provBase ? { ..._provBase, resolvedStopPrice: stopLoss, resolvedTargetPrice: takeProfit } : undefined,
  });
  counters.signalsArchived++;
} catch { counters.archiveFailures++; }
const tradeId = await registerOpenVtsTrade(xOpenTrade);
```
Type: `pool`/`entryLiquidityKind` carry `as const` so the inferred `xOpenTrade` stays assignable to `RegisterOpenVtsTradeInput` — verified by tsc (zero new baseline errors).

## Verification (bench)
- **tsc baseline GREEN** — no new errors from `eval-cycle.ts` (the 25→8 in the diff output is B-NEW-53.1, already on origin).
- **vitest** — 11 failed files / 12 tests = the known pre-existing clean-head set (identical to B-NEW-53.1); 1626 passed; **zero new failures**.

## Verification (Step-7, live, post-deploy)
xStock admitted rows → at-entry block populated (genuine values non-null; the documented-null keys present-as-null); `expectedEdge` + `netRewardToRisk` present; archived entry/stop/target == the trade's `vts_open_trades` row; trade-open count unaffected.

## Governance plan at close
RUNNING_ISSUES #208 resolved; CHANGES_AND_FIXES (incl. the units caveat + never-pool-is-code-level note); SIM (B70.2 xStock line → realized); BATCH_CATALOG; PHASE_HISTORY; MEMORY 3-way + Langston MEMORY.

**Ask:** APPROVE TO PUSH, or flag revisions.
