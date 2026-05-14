# BATCH_82 — xstock_spot ablation + calibration data path repair

**Status:** DRAFT (rev 2) — Langston design review concur 2026-05-14 (Q1/Q2/Q3/Q4 + concerns 1-4; concern 5 push-back resolved — INSTRUCTIONS.md is legacy per project CLAUDE.md §4)
**Author:** Claude Code, 2026-05-13 (rev 1) → 2026-05-14 (rev 2)
**Predecessor:** B-NEW-28 in `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` (graduated to a numbered batch per Kyle directive 2026-05-13)
**Blast radius:** 4 services + 2 DB tables + 2 UI components + ReplayContext type tightening
**Workflow path:** full 11-step (Kyle directive 2026-05-13 — "please go through the full workflow")

## REV HISTORY

- **rev 1 (2026-05-13):** initial scope draft. Sent to Langston.
- **rev 2 (2026-05-14):** Langston design review applied:
  - Obj 1 — `emitAblationRecord(assetClass)` REQUIRED parameter, NO default (Q1 concur).
  - Obj 2 — `ReplayContext.assetClass: AssetClass` non-nullable. Drop `??` fallback at BOTH `exit-strategy-replay-service.ts:264` AND `:294` (the line-294 OHLC-fetch fallback shipped in B79.0m.b2 was the same anti-pattern). Update all `replayAndPersist` callers.
  - Obj 4 — empty-state copy split per-section (calibration triggers from factor-replay, not trade-close) + render `ASSET_CLASS_REGISTRY.displayName` ("xStock Spot") not raw enum (`xstock_spot`).
  - §6 risk analysis rewritten to match REQUIRED+no-default decision (was contradictory in rev 1).
  - INSTRUCTIONS.md / batch-zip packaging dropped from completion checklist — legacy pre-Clone-Repo workflow per project CLAUDE.md §4.
  - Pre-audit obligations (concerns 1-4 + Q3 partition/Drizzle gotchas) added to §5 Step-2 row.

---

## 1. PROBLEM STATEMENT

The xStocks tab's two rich ablation/calibration panels are unusable because of a 4-layer breakage cascade discovered during B-NEW-28 diagnosis 2026-05-13:

1. **Endpoint perf catastrophe.** `/api/xstocks/exit-strategy-ablation?window=rolling_7d` takes **133.6 seconds**. `/api/xstocks/factor-calibration?window=rolling_7d` takes **38.1 seconds**. The UI panels render "Loading..." forever because browsers and intermediate proxies time out before either endpoint responds.

2. **Empty results even when the endpoint finally responds.** Both endpoints return `totalTrades:0, variants:[], factors:[], totalReplayed:0` because despite xstock VTS running since 2026-05-11, **zero rows have been written to either ablation table tagged as `xstock_spot`**.

3. **Writer-side asset_class drop (root cause of #2).** Two persistence sites hard-code `asset_class='crypto_spot'` regardless of caller intent:
   - `server/services/factor-ablation-emitter.ts:236` — `assetClass: 'crypto_spot'` baked into `emitAblationRecord()` row builder
   - `server/services/exit-strategy-replay-service.ts:264` — SQL literal `'crypto_spot'` in the INSERT statement (ironically `ctx.assetClass` IS available on the context but never used)
   Every xstock VTS-emitted ablation/replay row since 2026-05-11 has been **mis-tagged as crypto_spot**, contaminating the crypto panels too.

4. **UI empty-state missing.** When the endpoint returns empty arrays, the `ExitStrategyAblationSection` and `FactorCalibrationSection` components stay on "Loading..." instead of rendering "No data yet — accumulating."

5. **Layer-3 (deferred, scope-flagged):** `regime_factor_alternates` factor-calibration query times out at 122s **even without an asset_class filter**, meaning the crypto path is also fragile. Indexes alone won't fix this; the query has heavy JSONB extractions in SELECT + WHERE. Layer-3 fix scoped as a follow-up batch.

This is the **5th instance** of the crypto-first / asset-class-lost pattern (after B-NEW-20/22/25/26). The pattern is now well-documented enough to fix systematically.

## 2. NUMBERED OBJECTIVES (verification gates)

| # | Objective | Verification gate |
|---|---|---|
| 1 | **REQUIRED, no default.** Thread `assetClass: AssetClass` as a REQUIRED parameter on `emitAblationRecord()` signature — NO default value (silent-fallback pattern is what caused B-NEW-20/22/25/26/28; type-system enforcement is the structural fix). Remove hardcode at `factor-ablation-emitter.ts:236`. Update ALL caller sites (`signal-orchestrator.ts:959`, `vts-runner.ts:1794`, plus any test/script callers surfaced by pre-audit grep) to pass the correct asset class. | `INSERT` rows on `regime_factor_alternates` for xstock pairs show `asset_class='xstock_spot'` post-deploy (DB query). Compiler enforces caller passes `assetClass` — no `??` fallback path. |
| 2 | **Non-nullable threading, drop fallback at BOTH sites.** Tighten `ReplayContext.assetClass: AssetClass` to non-nullable (currently optional with `?? 'crypto_spot'` fallback). Drop the `??` fallback at BOTH `exit-strategy-replay-service.ts:264` (replay INSERT) AND `:294` (OHLC-fetch — same anti-pattern shipped in B79.0m.b2). Update all `replayAndPersist` callers (enumerated in pre-audit) to pass `assetClass` explicitly. | `INSERT` rows on `exit_strategy_alternates` for closed xstock trades show `asset_class='xstock_spot'` post-deploy. No `??` fallback anywhere in replay-service. |
| 3 | Add 2 composite DB indexes for partitioned tables. **Pre-audit MUST enumerate partitions for both tables and document the per-partition `CREATE INDEX CONCURRENTLY` + parent-table non-concurrent `CREATE INDEX` adoption pattern** (PG doesn't support `CONCURRENTLY` on partitioned parents). Drizzle migration MUST disable transaction wrapping (`CONCURRENTLY` cannot run inside BEGIN/COMMIT). Index definitions: <br/>(a) `(asset_class, created_at DESC)` on `exit_strategy_alternates` <br/>(b) `(asset_class, evaluated_at DESC) WHERE replay_completed_at IS NOT NULL` on `regime_factor_alternates` | EXPLAIN on the xstock variant queries shows `Index Cond: (asset_class = 'xstock_spot' ...)` instead of `Filter:`. Endpoint response time < 5s for xstock both endpoints. Crypto endpoint times unchanged (regression-tested). |
| 4 | UI empty-state branch in `ExitStrategyAblationSection` + `FactorCalibrationSection` (`client/src/pages/analytics.tsx`). Different copy per panel (different data-source triggers): <br/>**Ablation** (when `totalTrades===0 && variants.length===0`): `"No {displayName} data yet — accumulating. Panel populates as closed trades complete the ablation replay window."` <br/>**Calibration** (when `factors.length===0 && totalReplayed===0`): `"No {displayName} data yet — accumulating. Panel populates as the factor replay pipeline evaluates new signals."` <br/>`{displayName}` is `ASSET_CLASS_REGISTRY[assetClass].displayName` (e.g., "xStock Spot"), NOT the raw enum (`xstock_spot`). | Visual: load `/machine-learning` with a fresh xstock_spot universe (no closed xstock trades + no recent factor evaluations) → both panels show their respective empty-state copy with human-readable asset class label, NOT "Loading..." |
| 5 | **NO BACKFILL** — historical mis-tagged rows (2026-05-11 → BATCH_82 deploy) remain in the `crypto_spot` bucket. Per Kyle directive 2026-05-13, fresh-start posture: panels begin populating from deploy time forward. Calibration windows are LOCKED through 2026-05-15 per MEMORY no-touch fence; no decisions are being made off this data yet. | Note documented in completion report + governance docs. No DB UPDATE statements. |
| 6 | Governance: update SIM (file-level dependency map) for both writer changes + both new indexes. Update System Manual for asset-class threading invariant. Update RUNNING_ISSUES, BATCH_CATALOG, PHASE_HISTORY, MEMORY (both copies + Langston Hetzner). Update CHANGES_AND_FIXES with the fix entries. | Completion report lists every governance file changed |
| 7 | All 4 CI checks GREEN (TypeScript, Test Suite, Build, Docker Build). Phase 16 §16.7 pre-existing failures NOT addressed here; will not be made worse. | CI status on the BATCH_82 merge commit |

## 3. EXPLICIT NON-OBJECTIVES

- **NOT addressed:** Layer-3 query perf rewrite for `regime_factor_alternates` factor-calibration (122s timeout without filter). The asset_class index dramatically reduces xstock-side scan time, but the JSONB-heavy crypto query still has bottlenecks. Scoped as a separate Phase 16 / 19 hardening item (B-NEW-31, to-be-filed).
- **NOT addressed:** Backfill of contaminated `crypto_spot` rows. Option β chosen per Kyle directive 2026-05-13.
- **NOT addressed:** Phase 16 §16.7 Test Suite Recovery (~60 pre-existing CI failures). Separate sequencing.
- **NOT addressed:** The deeper observability gap that allowed B79.0m.b2's missing import bug to run silently for 2 days (B-NEW-23 carryover). Phase 16/19.

## 4. AFFECTED FILES (preliminary — full list in BATCH_82_PRE_AUDIT.md)

### Server (4 services)
- `server/services/factor-ablation-emitter.ts` — Objective 1
- `server/services/signal-orchestrator.ts` — Objective 1 (caller update)
- `server/services/vts-runner.ts` — Objective 1 (caller update)
- `server/services/exit-strategy-replay-service.ts` — Objective 2

### DB migration
- `server/db/migrations/0NN_b82_asset_class_indexes.sql` (or wherever Drizzle migrations live in current branch) — Objective 3

### Client (UI)
- `client/src/pages/analytics.tsx` — Objective 4 (both sections share this file)

### Governance (Step 10 mandatory)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — writer asset-class threading + index entries
- `1-system-manual/SYSTEM_MANUAL.md` — asset-class threading invariant
- `1-system-manual/RUNNING_ISSUES.md` — close B-NEW-28-equivalent + carry B-NEW-31 forward
- `1-system-manual/BATCH_CATALOG.md`
- `1-system-manual/PHASE_HISTORY.md`
- `1-system-manual/CHANGES_AND_FIXES.md`
- `.claude/memory/MEMORY.md` + `/home/langston/MEMORY.md` (CLAUDE.md §2 Step 10.b mandatory)
- `Claude Comms and Packages/Batch Completion/BATCH_82_COMPLETION_REPORT.md`

## 5. WORKFLOW SEQUENCING

| Step | Action | Owner | Duration estimate |
|---|---|---|---|
| 1 | This scope doc — Langston design review (file-first per §6.5.0) | CC → Langston | ~30 min Langston |
| 2 | Pre-audit `BATCH_82_PRE_AUDIT.md` — SIM consultation, blast-radius doc per CLAUDE.md §9. MUST cover: (a) exhaustive `grep -rn 'emitAblationRecord\b'` + `grep -rn 'replayAndPersist\b'` including server/, scripts/, tests/ — every caller listed; (b) partition enumeration on `exit_strategy_alternates` + `regime_factor_alternates` with the per-partition `CREATE INDEX CONCURRENTLY` + parent-table non-concurrent adoption plan; (c) Drizzle migration must disable txn-wrap (CONCURRENTLY cannot run in BEGIN/COMMIT); (d) negative + regression verification gates (NO new crypto_spot rows for xstock pairs post-deploy; crypto_spot rows still tag correctly); (e) T+1h / T+6h / T+24h spot-check schedule; (f) downstream-consumer audit: enumerate ML training pipeline + weekly digest jobs + training-data export scripts that read these two tables, check for implicit `WHERE asset_class='crypto_spot'` filters that might break or silently exclude new xstock rows. | CC → Langston | ~1.5h |
| 3 | Implementation in 3 sub-phases: <br/>3.a writer-side asset_class threading (Obj 1 + 2) <br/>3.b DB index migration (Obj 3) <br/>3.c UI empty-state (Obj 4) | CC | ~2h |
| 4 | Code review diff (Langston reads `git diff` BEFORE push) | Langston | ~30 min |
| 5 | GitHub push + CI (all 4 green) | CC | 5-10 min |
| 6 | Staging deploy + PM2 restart | CC | 5 min |
| 7 | First-pass verification (PM2 logs, DB queries, UI screenshots, endpoint timing) | CC | 15 min |
| 8 | Second-pass verification (independent) | Langston | 30 min |
| 9 | Iterate if any objective NO/PARTIAL | both | as needed |
| 10 | Governance updates per §4 above | CC | 30 min |
| 11 | Completion report | CC → Langston confirm | 20 min |

## 6. RISK ANALYSIS

- **Writer-side change (Obj 1):** Medium risk. `emitAblationRecord` is on the hot path of every VTS evaluation. **Mitigation is type-system enforcement, not silent-fallback.** Per Langston rev 1 review concur 2026-05-14 + per §5 #15 NO PATCHES + §11 no-silent-fallbacks: the new `assetClass: AssetClass` parameter is REQUIRED (no default). All known callers (signal-orchestrator.ts:959, vts-runner.ts:1794, plus any surfaced by pre-audit grep) MUST be updated in the same commit. Compile fails if any caller missed → the type system is the gate that prevents incident #6. This is the structural fix; the rev-1-draft "optional with crypto_spot default" mitigation was the silent-fallback anti-pattern itself and is rejected.
- **Replay-service change (Obj 2):** Medium risk (NOT low — upgraded post-review). Same logic as Obj 1: drop `??` fallback. `ReplayContext.assetClass` becomes non-nullable. All `replayAndPersist` callers (enumerated in pre-audit) update in same commit. Compile fails if missed → no silent re-introduction of the crypto_spot tag.
- **DB index creation (Obj 3):** Low risk on the SQL side IF the partition pattern is correct. Real risk is operational: <br/>(a) Drizzle wraps migrations in BEGIN/COMMIT by default — `CREATE INDEX CONCURRENTLY` fails inside a txn block. Migration MUST be marked txn-disabled (Drizzle's `// breakpoint` directive or raw SQL outside the migration runner). <br/>(b) PostgreSQL does NOT support `CREATE INDEX CONCURRENTLY` on a partitioned PARENT — must per-partition CONCURRENTLY then non-concurrent on parent (which adopts the existing child indexes). Pre-audit enumerates partitions for both tables and locks the exact DDL sequence. Rollback SQL ready (`DROP INDEX CONCURRENTLY ...` per partition + non-concurrent drop on parent).
- **UI empty-state (Obj 4):** Low risk. Pure render-path branch; no data flow change. Per-section copy split (calibration triggers from factor-replay, not trade-close) + human-readable displayName label.
- **Downstream-consumer risk (added per Langston concern 4):** Unknown until pre-audit completes. If a ML training pipeline / weekly digest / training-data export script has an implicit `WHERE asset_class='crypto_spot'` filter, the writer fix correctly tags new xstock rows BUT a reader silently filters them out OR breaks on the new tag. Pre-audit enumerates consumers + maps each one's tag-handling.

## 7. ROLLBACK PLAN

- Writer change: revert commit, redeploy. Rows written between deploy and rollback will be correctly tagged; that's a small fix-forward not a regression.
- DB index: `DROP INDEX CONCURRENTLY idx_exit_strategy_alternates_asset_created; DROP INDEX CONCURRENTLY idx_regime_factor_alternates_asset_evaluated;` — instant. No data impact.
- UI: revert commit, redeploy. UI returns to current "Loading..." behavior.

## 8. POST-DEPLOY MONITORING

- 24h forward-watch: confirm xstock_spot row count growing in both tables (sanity check the writer fix landed)
- 24h forward-watch: endpoint response times < 5s p99 on the xstock variants
- 7d window: re-run xstock Factor Calibration + Exit Strategy Ablation panels to confirm data accumulates (panels will show "Accumulating" until n>=200 trades / n>=150 per factor bucket per existing decision-grade gates)

---

## CHANGELOG

- **rev 1 (2026-05-13):** initial draft. Pending Langston design review.
- **rev 2 (2026-05-14):** Langston design review concur (Q1/Q2/Q3/Q4 + concerns 1-4). Concern 5 (INSTRUCTIONS.md / batch zip) push-back resolved — confirmed legacy per project CLAUDE.md §4, retired. Revisions applied to Obj 1, 2, 4 + §5 (pre-audit expansion) + §6 (risk analysis rewritten — REQUIRED+no-default is the structural fix, not the silent-fallback mitigation written in rev 1).
