# BATCH_82 — Design ask (rev 1)

**To:** Langston
**From:** Claude Code
**Date:** 2026-05-14
**Re:** Design review for BATCH_82 scope (xstock_spot ablation + calibration data path repair)
**Files referenced:**
- Scope draft: `Claude Comms and Packages/Scope Files/BATCH_82_SCOPE.md`
- Original tracker entry (B-NEW-28): `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` Open Items
- Pre-flight reading: `1-system-manual/SYSTEM_IMPACT_MAP.md` (ablation tables, factor-ablation-emitter, exit-strategy-replay-service consumers)

## Context

The xStocks tab's Factor Calibration (B67) and Exit Strategy Ablation (B73) panels are unusable. B-NEW-28 diagnosis 2026-05-13 revealed:

- `/api/xstocks/factor-calibration?window=rolling_7d` → 38.1s response, returns `factors:[]`
- `/api/xstocks/exit-strategy-ablation?window=rolling_7d` → 133.6s response, returns `totalTrades:0, variants:[]`

Root cause: **writer-side asset_class is hardcoded `'crypto_spot'`** at two persistence sites despite xstock VTS having shipped 2026-05-11:

1. `server/services/factor-ablation-emitter.ts:236` — hardcode in row builder
2. `server/services/exit-strategy-replay-service.ts:264` — SQL literal in INSERT (ironically `ctx.assetClass` IS available on the context object but never used)

Every xstock VTS-emitted ablation/replay row since 2026-05-11 has been mis-tagged as `crypto_spot` (contaminating crypto's panels too). And the endpoints take 38-133 seconds because neither table has an `asset_class` composite index.

**This is the 5th instance of the crypto-first / asset-class-lost pattern** (after B-NEW-20 exit-side price fetch, B-NEW-22 open context fields, B-NEW-25 open UI price dispatch, B-NEW-26 closed-trade persist).

## Decisions already locked (Kyle directives during diagnosis)

| Decision | Choice | Rationale |
|---|---|---|
| Workflow path | **Full 11-step workflow** (this batch — not a tracker quick-fix) | Touches 4 services + 2 DB tables + 2 UI components |
| Backfill posture | **Option β — NO backfill** | Calibration windows LOCKED through 2026-05-15 per MEMORY no-touch fence; no decisions made off this data yet. Crypto panels mildly contaminated for ~4 days; acceptable. Trades fresh-start from BATCH_82 deploy time forward. |
| Detection of stuck-pipeline class of bugs | Filed as separate **§10d observability batch** in `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | Out of scope for BATCH_82. Sequenced AFTER BATCH_82 ships. |

## Numbered objectives (7)

| # | Objective | Files | Risk |
|---|---|---|---|
| 1 | Thread `assetClass` through `emitAblationRecord()` signature (add as required parameter); update 2 callers (signal-orchestrator.ts:959, vts-runner.ts:1794) to pass correct value; remove hardcode at factor-ablation-emitter.ts:236 | factor-ablation-emitter.ts + 2 callers | **Medium** — on hot signal path; need backward-compat care |
| 2 | At exit-strategy-replay-service.ts:264, change SQL literal `'crypto_spot'` to bind `${ctx.assetClass ?? 'crypto_spot'}`. ReplayContext already carries it. | exit-strategy-replay-service.ts | Low |
| 3 | Add 2 composite DB indexes (CONCURRENTLY): `(asset_class, created_at DESC)` on `exit_strategy_alternates`; `(asset_class, evaluated_at DESC) WHERE replay_completed_at IS NOT NULL` on `regime_factor_alternates` | Drizzle migration | Low (additive, non-blocking) |
| 4 | UI empty-state branch in `ExitStrategyAblationSection` + `FactorCalibrationSection` (client/src/pages/analytics.tsx): when `totalTrades===0 && variants.length===0` / `factors.length===0 && totalReplayed===0`, render explicit "No <asset_class> data yet — accumulating" panel | analytics.tsx | Low |
| 5 | NO BACKFILL per Kyle directive (Option β). Document in completion report + governance. | Governance docs | Zero (no SQL execution) |
| 6 | Governance updates: SIM, System Manual, MEMORY (both copies + Langston Hetzner), RUNNING_ISSUES, BATCH_CATALOG, PHASE_HISTORY, CHANGES_AND_FIXES | Tier-1 + Tier-2 docs | Zero |
| 7 | All 4 CI checks green; do not regress Phase 16 §16.7 pre-existing failures | CI | Low |

## Explicit non-objectives

- Layer-3 `regime_factor_alternates` factor-calibration query rewrite (122s timeout even without filter). Asset_class index will dramatically reduce xstock scan time; deeper query rewrite for crypto path's JSONB-heavy WHERE is a separate Phase 16/19 hardening item.
- Phase 16 §16.7 Test Suite Recovery.
- B-NEW-23 observability gap that allowed B79.0m.b2's missing-import bug to run silently 2 days.

## Specific design questions for your review

**Q1 — `emitAblationRecord` signature change.** I'm proposing:

```ts
export function emitAblationRecord(
  source: AblationSource,
  pairSymbol: string,
  realDecision: RegimeDecision,
  alternates: FactorAlternate[],
  assetClass: AssetClass,        // NEW — required
  strategy?: string,              // existing optional
): Promise<void>
```

Alternative: optional `assetClass` parameter with default `'crypto_spot'`. **My recommendation: REQUIRED**, no default — that's how we avoid silent crypto-first drops in future. Each caller MUST resolve and pass their actual class. The 2 known callers (signal-orchestrator + vts-runner) both have it on hand.

**Your call:** required + caller-must-pass, or optional with default? (I'll cite this as Q1 in the Step 2 pre-audit.)

**Q2 — Backfill exception case.** Option β is "no backfill." But there IS a small possibility a user could write a query expecting the historical 2026-05-11→deploy-time xstock-on-crypto-bucket rows are corrected. Do you want me to:
   - (a) Pure no-backfill (cleanest — completion report just documents the contamination window).
   - (b) Add a one-time DB-side flag column / migration note tagging the contamination window so future queries can filter it out.
   - (c) Something else.

**My recommendation: (a) pure no-backfill.** Documented in governance. The contamination period (~5 days, ~unknown row count) will roll out of the rolling_30d window by 2026-06-15 anyway.

**Q3 — Index creation strategy.** Both tables are partitioned (regime_factor_alternates and exit_strategy_alternates). `CREATE INDEX CONCURRENTLY` on partitioned tables creates the index on each partition. With ~23k + ~39k total rows, this should complete in seconds per partition. Are you OK with:
   - Running `CREATE INDEX CONCURRENTLY` from a one-time SQL migration script committed in the batch.
   - Rollback path: `DROP INDEX CONCURRENTLY ...` (instant; no data impact).
   
Or do you want a different DDL deployment approach (e.g., via Drizzle migration with explicit txn-mode tag)?

**Q4 — UI empty-state copy.** Suggested text: `"No <asset_class> data yet — accumulating. Panel will populate as closed trades complete the ablation replay window."` Acceptable, or do you prefer different wording / per-section variant copy?

## Workflow + sequencing

| Step | Action | Owner | Est. time |
|---|---|---|---|
| 1 | This design ask → your review | Langston | ~30 min |
| 2 | Pre-audit (`BATCH_82_PRE_AUDIT.md`) — SIM consultation, blast-radius | CC → Langston | ~1h |
| 3 | Implementation in 3 sub-phases (3a writer-side, 3b indexes, 3c UI) | CC | ~2h |
| 4 | Code-review diff | Langston | ~30 min |
| 5 | Push + CI green | CC | 10 min |
| 6 | Staging deploy | CC | 5 min |
| 7 | First-pass verification (DB writes correctly tagged + endpoint speeds + UI empty-state) | CC | 15 min |
| 8 | Second-pass verification | Langston | 30 min |
| 9 | Iterate as needed | both | — |
| 10 | Governance | CC | 30 min |
| 11 | Completion report | CC → your confirm | 20 min |

## What I need from you

Please review the scope file (`Claude Comms and Packages/Scope Files/BATCH_82_SCOPE.md`) + this design ask. Specifically I want your call on Q1-Q4 above, and any other concerns about:
- Signal-orchestrator + vts-runner caller integration (the path is well-trodden after the 5 prior crypto-first incidents — but I'd value your independent read).
- Any SIM components I've missed in the blast-radius enumeration.
- Any other architectural risk you see.

If approved as-is or with minor revs, I'll proceed to Step 2 pre-audit. If you want a substantive rev, I'll regenerate to rev 2.

— CC
