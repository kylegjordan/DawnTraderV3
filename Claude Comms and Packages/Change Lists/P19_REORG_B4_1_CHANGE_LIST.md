# P19 reorg-B4.1 — Change List (Step-4 diff review)

**Batch:** reorg-B4.1 — shadow-trading visibility tab + per-cycle pool-membership record
**change-class:** architecture · UNCOMMITTED (Step-4 review before push)
Full diff staged at `/home/langston/inbox/reorg-B4.1/reorg-b41-full.diff` (959 lines, 11 files; read on your mount). INFRA NOTE: read the .diff + files on your mount, don't `git`/`cd` the gdrive repo.

## Summary
Adds the per-cycle pool-membership capture (OBJ-1) + read endpoint (OBJ-2) + the "Shadows" UI tab (OBJ-3) — exactly the Step-1/Step-2 design you approved (additive two-table, resolve-first-then-tolerate boundary, pool_size stamp, #390 retention home).

## Files
- **`shared/schema.ts`** — NEW `rtbShadowPoolMembers` table (EVENT grain: one row per cycle×signal) + types. Columns: cycleKey, mode, asset_class, signal_id, **shadow_trade_id (FK→rtb_shadow_pairings.id, NOT NULL)**, symbol, strategy, promotion_rank, promoted, **pool_size** (the stamp), score snapshot (final/hybrid/confidence/regimeWeight/decayPenalty/ranking), di/dbs, sqe_verdict, regime, created_at. Indexes: (mode, asset_class, cycle_key), shadow_trade_id, cycle_key.
- **`drizzle/migrations/2026-06-26-p19-reorg-b4-1-shadow-pool-members.sql`** (+ rollback OUT of git) + **MANIFEST** (`git add -f` at commit). Idempotent CREATE TABLE IF NOT EXISTS + 3 indexes + DO-block verify.
- **`server/services/rtb-shadow-store.ts`** — NEW `insertShadowPoolMember(row)` (writes ONLY `rtb_shadow_pool_members`; isolation preserved).
- **`server/services/vts-runner.ts`** — `registerOpenShadowTrade` dedupe return widened **null → existing trade id** (the one live-engine behavior change; null now only on cap-reject/persist-fail). Doc updated.

```ts
// vts-runner registerOpenShadowTrade — the return-contract change:
const existingId = shadowOpenBySignal.get(dedupeKey);
if (existingId !== undefined) {
  return existingId;   // was: return null;
}
```

- **`server/core/rtb/ready_to_buy_service.ts captureShadowPool`** — per member: resolve trade id FIRST → if non-null, write the member row (poolSize = pool.length stamp) in its own try/catch (tolerated failure = partial-cycle). Boundary per your Step-2 call.

```ts
const poolSize = pool.length; // SSOT for "N candidates" — never COUNT(*)
const shadowTradeId = await registerOpenShadowTrade({ ... promotionRank: i, promoted, ... });
if (shadowTradeId) {                       // null → no trade → skip (dangling-FK impossible)
  try { await insertShadowPoolMember({ cycleKey, ..., shadowTradeId, promotionRank: i, promoted, poolSize, ... }); }
  catch (memberErr) { /* tolerated: one telemetry row lost, no corruption */ }
}
```

- **`server/routes.ts`** — NEW `GET /api/shadow-trades/by-cycle` (read-only; paper-mode default; optional assetClass; paginated by cycle). One CTE query: page of cycles → JOIN members → LEFT JOIN pairings for outcomes; groups in JS; **pool_size from `MAX(pool_size)` stamp, never COUNT(\*)**; selection-quality summary (promoted-was-best / ≥median over closed cycles); open-shadows-in-flight list. No write, no learning store.
- **`client/src/pages/active-trades.tsx`** — "Shadows" tab after Trade History (grid 5→6; `Ghost` icon).
- **NEW `client/src/components/trading/shadow-trades-tab.tsx`** — mirrors trade-history-tab patterns (useQuery/apiFetch/Card). Summary cards (cycles captured, promoted=best %, promoted≥median %, open shadows) + honest empty/dormant state + per-cycle pool table (rank, Promoted badge, symbol, strategy, FinalScore, outcome, Net P/L %, R, hold; best-outcome trophy; promoted row highlighted) + open-shadows section + pagination.
- **NEW `server/tests/unit/reorg-b4-1-shadow-pool-members.test.ts`** (8) — insertShadowPoolMember sink purity; null→id dedupe contract; captureShadowPool boundary (member-only-when-id, pool_size stamp, tolerated partial-cycle); endpoint uses pool_size not COUNT(*) + read-only. **`reorg-b4-shadow-isolation.test.ts`** — 1-line update (the `promoted` literal became a hoisted const in the refactor).

## Your Step-2 watch item — covered
A persisted cycle can hold FEWER member rows than the pool had (tolerated member-write skip). The endpoint surfaces `pool_size` (the stamp) for "N candidates" and renders whatever member rows exist (no contiguous-rank assumption, no COUNT(*)-as-pool-size). Tested explicitly (`pool_size stamped … never COUNT(*)` + the tolerated-partial-cycle assertion).

## Bench
- tsc baseline OK no-regressions (client + server). reorg-b4-1 suite 8/8; reorg-b4 isolation 20/20 + table 2/2 unaffected; full unit suite **1873 pass** (3 ECONNREFUSED-no-Postgres env files, unrelated).

## Dormancy (§9.1)
Empty until paper-active turn-on (rtb_total=0 → no promotion cycles → no rows). Staging UI verify (OBJ-4) = empty-state renders clean + a seed-then-clean populated screenshot proof.

## After your green
push (`git add -f` migration) → CI 4-green → deploy (db:migrate) → Step-7 staging-UI verify via Claude-in-Chrome (empty + seed-then-clean) → Step-8 → governance (SIM new-table fold into the reorg-B4 callout, System Manual §19.8 extension, RUNNING_ISSUES #390, BATCH_CATALOG/PHASE_HISTORY/PHASE_19_PLAN, completion report).
