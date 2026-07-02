# P19-B7.2a Completion Report — #330 fee-resolver consolidation (one road to the fee fact)

**Batch:** P19-B7.2a · **change-class: non_architecture** · **Closed:** 2026-07-02 · **Implementer:** Claude New (CC-B) · **Reviewer:** Langston
**Head:** `4b9d62fc9` (build) + the governance close commit · **CI:** run `28617134643` all-4-green · **Deploy:** staging restart#435, HTTP 200 (no migration)
**Scope:** `Scope Files/P19_B7_2a_SCOPE.md` (rev 3) + `P19_B7_2a_PRE_AUDIT.md` · **Step-4 artifact:** inbox `P19_B7_2a_STEP4.diff` (782 lines, 12 files, +303/−99)

## PREVIOUSLY-STATED-VS-NOW (§9.2 — the two probe corrections, both recorded in scope rev 2/3)

1. PREVIOUSLY: "the only direct cache reader touches `.spread`"; blast radius 2 source files. NOW: **4 direct `.fee` readers** (2 on the friction-scoring path); blast radius 8 source files. REASON: my probe grepped one consumer file and generalized — Langston's independent Step-1 probe caught it.
2. PREVIOUSLY: `getCacheStats` drops `avgFee`. NOW: `avgFee` kept, merge-site-sourced, on the new `getCostCacheStatsWithFee` wrapper. REASON: 4 production stat readers (incl. the cost-drift monitor and the PERSISTING cost-telemetry) would have broken silently — my counter-probe on Langston's Step-1 ask.
3. PREVIOUSLY (rev 2): all read sites compose `'crypto_spot'`. NOW: per-site class context (fn param / at-write stamp / justified literal). REASON: Langston Step-2 CHANGE-1 — a blanket hardcode re-imports the class-provenance assumption the batch eliminates.

## Objectives — verification

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | Fee never lives in the cost-cache | **YES** | `CostMetrics` drops `fee` (tsc enforces); `resolveCryptoTakerFee` DELETED (§15, DELETED_COMPONENTS_LOG 2026-07-02); clamp bounds measurements only; `getCacheStats` measured-only; the fee-bearing stats shape = `cost-model.getCostCacheStatsWithFee` (circular-import split, Langston-endorsed) |
| 2 | Every fee read composes from the merge site, class per site | **YES** | cost-model crypto lane + tec-costs + routes cost-diag (`crypto_spot` — the crypto-only cache lane, Langston-verified justified); market-indicators (fn `assetClass` param — class-filtered sample, xstock routed to the store pre-loop); telemetry-aggregator (at-write entry stamp, B-4.7 #163) |
| 3 | Spread/slippage semantics untouched | **YES** | B-5.1 crossed-quote reject + TTL + measurement clamp identical; both scanner writers untouched; existing tests pass |
| 4 | Tests + docs | **YES** | NEW `p19-b7-2a-fee-consolidation.test.ts` 5/5 (poisoned-fee-cannot-leak; fee_model-visibility/no-TTL; **friction identity BOTH classes + the diverged-fees leg that fails on any friction hardcode**; clamp-for-measurements-only w/ a 3%-above-bound fee passing unclamped; stats-wrapper shape); cost_cache + cost_telemetry tests updated (fee_model warmed like boot); governance list below |

**Bench:** tsc-baseline OK; vitest **2138 pass / 0 fail** (9 known no-DB collect files). **Step-7 live proof:** `/api/diagnostics/tec/costs` — 642 cached symbols, **every** `takerFee = 0.008` (the merge-site Tier-1 value); costs-summary avgFee 0.008; HTTP 200, boot clean.

## Langston review record

Step-1 PROCEED → **rev 2 CHANGES** (the 4 direct readers — verified by my re-probe, not taken on faith) → Step-2 **PROCEED-WITH-CHANGES** (3: per-site class compose / §15 disposition / both-classes named friction test — all folded, scope rev 3) → Step-4 **APPROVE-to-push**: "dropping `fee` from `CostMetrics`… makes tsc the enforcer — that's what makes this a real consolidation and not a move-the-problem." His two Step-4 riders: (1) governance content verified at Step-8 (landed — list below); (2) the #330→B81 pointer names the telemetry-aggregator ternary explicitly (done — RUNNING_ISSUES #330 lists BOTH single-class assumptions for the B81 re-key).

## Issues

- **#330 RESOLVED** (this batch) — with the two B81 forward-coupling pointers (the wrapper's single-class `avgFee`; the telemetry-aggregator two-class ternary that collapses a future third class to crypto).

## Governance files changed

1. `1-system-manual/SYSTEM_IMPACT_MAP.md` — §2.5 cost-cache charter NARROWED (measured microstructure only; the full B7.2a block) + the B-4.5 consumer-table `resolveCryptoTakerFee` strike
2. `1-system-manual/SYSTEM_MANUAL.md` — B-4.5 supersession completion line (both blocks): "single fee merge site" now literally true
3. `1-system-manual/DELETED_COMPONENTS_LOG.md` — `resolveCryptoTakerFee()` disposition (function-level; git-history archive; both internal callers rewired; zero external, tsc-proven)
4. `1-system-manual/CHANGES_AND_FIXES.md` — FIX-2026-07-02-A
5. `1-system-manual/RUNNING_ISSUES.md` — #330 RESOLVED + the two B81 pointers
6. `1-system-manual/BATCH_CATALOG.md` + `PHASE_HISTORY.md` + `PHASE_19_PLAN.md` §1/§5
7. `Claude Comms and Packages/Scope Files/P19_B7_2a_SCOPE.md` (rev 3) + `P19_B7_2a_PRE_AUDIT.md`
8. This report · MEMORY_CC_B (truth + mirror) · Langston MEMORY (§10.b)

**Sync gate:** both `rev-list` directions 0 at close; staging deployed at head.
