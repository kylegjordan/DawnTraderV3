# B-ENTRY-CONSUMPTION-FRESHNESS — Step 3 implementation change list r2

**Base:** `97f7a108a28e22e57ea3c1268984fd1935757b8c`
**Step:** 3 of 11 — implementation

## Mandatory Step-4 dispatch fields

**i. DECLARED CHANGE-CLASS:** `change-class: sub_batch` (scope header, verbatim).

**ii. SUB-BATCH DOCUMENT SET, ROW BY ROW:**

| document-set row | status at the review ref |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_ENTRY_CONSUMPTION_FRESHNESS_SCOPE.md` r2 |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_ENTRY_CONSUMPTION_FRESHNESS_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | **absent** — required Step-11 deliverable; this is the Step-3 implementation ref |
| `BATCH_CATALOG.md` | **absent from this ref's change** — required Step-10 close update |
| `PHASE_HISTORY.md` | **absent from this ref's change** — required Step-10 close update |
| `SYSTEM_MANUAL.md` | **applicable, due Step 10** — document the final entry-consumption freshness rule and separate gate/consumption ages |
| `SYSTEM_IMPACT_MAP.md` | **applicable, due Step 10** — correct the stale OrderPlacer/pending-maker description and add the carried age contract |
| `CHANGES_AND_FIXES.md` | **applicable, due Step 10** — record the repaired gap between gate-time and consumption-time freshness |
| `RUNNING_ISSUES.md` | **present** — `#684` owns the batch; closure waits for Step 10 |
| `POST_AUDIT_ROADMAP.md` | **judged N/A** — no roadmap placement changes |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A** — no component is deleted |
| `ADJUSTMENT_FRAMEWORK.md` | **judged N/A** — no governed parameter changes; the existing per-class thresholds remain authoritative |
| `PHASE_19_PLAN.md` | **judged N/A** — this is not a `P19-*` batch and has no in-flight row there |
| active plan `PRE_SPRINT_SIMULATION_TRUTH_PLAN.md` | **present** — the P1b row remains active; close state waits for Step 10 |
| shared and Analyst memory files | **present for current position** — the Analyst file records the Step-3 boundary in the review-ref commit; final close state waits for Step 10 |
| four session task lists | **absent from this ref's change** — Analyst's close verdict and the other three `N/A — not mine` rows wait for Step 10 |
| Coltrane/Langston memory | **absent from this ref's change** — required Step-10 close update after the verified outcome is known |

**iii. STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_ENTRY_CONSUMPTION_FRESHNESS_PRE_AUDIT.md` at Coltrane-approved ref `711a6df4a99dc587eef86d85fa323a5d68755f58`.

**Judgement calls to attack:** whether the pre-source-read anchor is conservative without laundering upstream clock skew; whether the passing gate result carries exactly the threshold used by the first decision; whether every immediate arm and only those arms are dominated by the final check; whether refusal counts exactly once; and whether the separate nullable age and rollback contract preserve historical meaning.

## Changed

1. `server/services/execution/depth-source.ts`
   - captures one process-monotonic anchor before every crypto/xStock source read, including the xStock last-two-sided fallback;
   - preserves the existing xStock compatibility clamp while carrying whether the source age was actually finite/non-negative;
   - adds the pure consumption-freshness decision with exact-boundary pass, stale refusal, and invalid-clock refusal.
2. `server/services/active-execution-engine.ts`
   - carries the exact first-gate age limit on the passing result;
   - checks the same snapshot after all awaited work and immediately before the sole immediate `openOrder` call in `ActiveExecutionEngine`;
   - covers direct taker and maker→taker, while pending-maker placement may inspect the top ask for marketability but does not depth-walk or fill from the snapshot; emits structured pass/block evidence and writes the admitted consumption age.
3. `server/services/rtb-metrics-service.ts`
   - adds and zero-initializes the distinct `CONSUMPTION_FRESHNESS` open-failure stage.
4. `shared/schema.ts`
   - adds nullable `entryBookConsumptionAgeMs` beside the unchanged first-gate age.
5. `drizzle/migrations/2026-10-15-b-entry-consumption-freshness.sql`
   - adds nullable `closed_trades.entry_book_consumption_age_ms` with no default and no backfill, plus the live database comment.
6. `drizzle/migrations/2026-10-15-b-entry-consumption-freshness-rollback.sql`
   - provides the operator-only column rollback, ordered after deployment of the older code and deliberately excluded from the manifest.
7. `drizzle/migrations/MANIFEST.txt`
   - registers the forward migration.
8. `scripts/codex-export/export-data.sql`
   - exports the new raw provenance field beside `entry_book_age_ms`.
9. `server/tests/unit/b-entry-consumption-freshness.test.ts`
   - proves the boundary/elapsed/invalid matrix, wall-clock independence, pre-read source anchors, xStock compatibility-clamp refusal, delay mutations with a side-effecting fake placer, sole-call dominance, arm coverage, stage initialization, and forward/rollback/schema/export contract.
10. `server/tests/unit/p19-b4b1-depth-gate.test.ts`
   - updates the typed snapshot fixture for the required anchor and source-age-validity fields.
11. `server/tests/unit/b-xstock-feed-sanity-fence.test.ts`
   - updates the existing entry-gate source fence to locate the gate through its new carried-threshold return shape.
12. `server/tests/unit/b-entry-consumption-freshness-engine.test.ts`
   - drives the real `ActiveExecutionEngine.executeSimulatedTrade` branch on a prototype-backed engine with only external seams replaced;
   - proves direct taker and maker→taker expiry each produce exactly one depth block plus one `CONSUMPTION_FRESHNESS` open failure, with no placement, trade write, or position write;
   - proves an admitted immediate fill passes the identical asks array to `openOrder` and persists the ordered first-gate/final-consumption ages;
   - proves pending maker neither calls `openOrder` nor stamps a consumption age.

## Verification run before commit

- targeted unit suite: 5 files, 116 tests passed;
- production-seam correction: 4 engine-path tests passed after restoration; bypassing the final guard made exactly the direct-taker and maker→taker expiry tests fail because each opened and persisted instead of refusing, then the restored guard returned all four tests to green;
- TypeScript baseline gate: 335 current vs 337 baseline, zero regressions above baseline; the two absent errors are pre-existing `partition-exporter.ts` baseline entries and no changed file is involved;
- `git diff --cached --check`: passed after explicit-path staging.

## Explicit non-changes

- no change to the DB-governed 5,000 ms crypto or 15,000 ms xStock limits;
- no source timestamp fabrication and no claim to repair skew already embedded in a source age;
- no snapshot replacement or second book read;
- no pending-maker later-fill, legacy `TradingEngine`, exit-fill, RTB-refresh, liveness, VPG/VOG, session, or spread policy change;
- no backfill and no reinterpretation of `entry_book_age_ms`;
- `.claude/launch.json` remains untouched.

REVIEWER: claim-only · name settling objects and alternative consistent states · HIT: bounded the sole-call claim to `ActiveExecutionEngine` and clarified pending-maker read-versus-consumption semantics; source-clock and test-reach limits retained for Coltrane's judgement · re-derived yes

## Step-4 correction after exact-ref review

Coltrane returned `ae2b5d3eb07f33b3f7bfff7229749c7b39d4949e` because the original delay fixture wrapped the pure decision in a locally invented `attempt()` function and the branch/persistence assertions read source text. Those checks could remain green while the production branch, telemetry count, or persisted age was wrong. The new engine-path suite above replaces that missing proof at the production seam; the original pure and source-contract checks remain supplementary rather than carrying the runtime claim.

## Load-bearing diff snippets

### MODIFIED — source snapshot carries a pre-read monotonic anchor

Before:

```ts
const book = krakenWebSocketAdapter.getBookForFill(symbol);
if (!book) return null;
return { asks: book.asks, bids: book.bids, ageMs: book.ageMs, source: 'crypto_ws_book' };
```

After:

```ts
const ageReadStartedMonoMs = performance.now();
const book = krakenWebSocketAdapter.getBookForFill(symbol);
if (!book) return null;
return {
  asks: book.asks, bids: book.bids, ageMs: book.ageMs,
  ageReadStartedMonoMs,
  ageReadValid: Number.isFinite(book.ageMs) && book.ageMs >= 0,
  source: 'crypto_ws_book',
};
```

### NEW — one fail-closed final decision before `ActiveExecutionEngine`'s sole immediate placement call

```ts
const _consumption = assessConsumptionFreshness(_gate.snapshot, _gate.warmthMaxAgeMs);
if (!_consumption.fresh) {
  recordDepthGateBlock(_openClass, _consumption.reason);
  rtbMetricsService.recordOpenFailed(
    signal.symbol, signal.strategy, 'CONSUMPTION_FRESHNESS', _consumption.reason,
  );
  console.warn(`[B-ENTRY-CONSUMPTION-FRESHNESS][CONSUMPTION_BLOCK] ...`);
  return { opened: false, stage: 'CONSUMPTION_FRESHNESS', reason: _consumption.reason };
}
_entryBookConsumptionAgeMs = _consumption.ageMs;
console.log(`[B-ENTRY-CONSUMPTION-FRESHNESS][CONSUMPTION_PASS] ...`);
const _openFill = await this.orderPlacer.openOrder({
  ...,
  bookAsks: _gate.snapshot.asks,
});
```

### NEW — distinct durable fact with an operator-only rollback

```sql
ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS entry_book_consumption_age_ms DOUBLE PRECISION;

COMMENT ON COLUMN closed_trades.entry_book_consumption_age_ms IS
  'Conservative age of the SAME depth snapshot immediately before an immediate entry depth walk ...';
```

```sql
-- rollback, deliberately absent from MANIFEST.txt
ALTER TABLE closed_trades
  DROP COLUMN IF EXISTS entry_book_consumption_age_ms;
```
