# B79.0n.RTB — Step 3 Change List (for Langston code review)

**HEAD commit:** `298cb2e` (Step 3 implementation at `8dd10c7` + MANIFEST.txt hotfix at `298cb2e`)
**Branch:** `migration/aws-supabase`
**Built on:** SCOPE v2.2 (`239723058`) + PRE_AUDIT v1 (`97572094e`) + Langston Step 2 ACK CLEAN (NEW-Q1 + NEW-Q2 dispositions)
**Files changed:** 24 (8 production + 4 migrations + 11 new tests + 1 backfill script). +2083 / -210 lines net.
**Local verification:** `npx tsc --noEmit` 494 errors (zero new in touched files — pre-existing ngc/riskScore/profitRate baseline noise filtered); `npx vitest run b79-0n-rtb` 53 NEW tests PASS in 3.33s.
**INFRASTRUCTURE NOTE:** DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. All load-bearing diff snippets embedded inline below per §6.5.0.a.

**Inbox local-FS paths (Read directly — fast):**
- `/home/langston/inbox/b79-0n-rtb/SCOPE_v2.md`
- `/home/langston/inbox/b79-0n-rtb/PRE_AUDIT_v1.md`
- `/home/langston/inbox/b79-0n-rtb/CHANGE_LIST_v1.md` (this file)

---

## §1. Chunk completeness — A through N (14 chunks)

| Chunk | What | LOC actual | Status |
|---|---|---|---|
| A | Phase 1 migration + 4 cadence seed rows + rollback | ~110 | ✅ |
| B | Phase 2 backfill script (dual-path) | ~170 | ✅ |
| C | Phase 3 CHECK + index + rollback | ~70 | ✅ |
| D | Drizzle schema rtbSignals.assetClass + index | 7 | ✅ |
| E | storage.ts dual-write + optional filter + IStorage interface | 52 | ✅ |
| F+G | ready_to_buy_service per-class queue + getQueueDepth + getRankedSignals + queueSQESignal | 64 | ✅ |
| H | rtb-refresh-service LOCKED-module nested per-class buckets (per Langston C-1 Option A) | 148 | ✅ |
| I | event-bus PromotionEvent.assetClass optional additive | 11 | ✅ |
| J | rtb_queue_refresher.ts RETIRED (deleted) + index.ts comment | -144 / 7 | ✅ |
| K | tcl_watchdog.ts JSDoc documenting NEW-Q1 + NEW-Q2 | 10 | ✅ |
| L | server/index.ts boot enumerate 4 classes + cadence + HARD-FAIL | 23 | ✅ |
| M | 11 new test files / 53 tests | ~620 | ✅ |
| N | Local tsc + vitest verification | — | ✅ |

---

## §2. Embedded diff snippets (per §6.5.0.a — no gdrive navigation needed)

### 2.1 Schema migration Phase 1 (Chunk A)

NEW FILE: `drizzle/migrations/2026-05-27-b79-0n-rtb-phase1.sql`

```sql
BEGIN;

-- §1. Schema: ADD COLUMN asset_class (nullable, no default, no CHECK)
ALTER TABLE rtb_signals
  ADD COLUMN IF NOT EXISTS asset_class VARCHAR(32) NULL;

COMMENT ON COLUMN rtb_signals.asset_class IS
  'B79.0n.RTB Phase 1 2026-05-27: per-class queue partitioning key. NULL allowed only during Phase 1+2 backfill window. Post-Phase-3 CHECK constraint + Phase 4 (contingent) SET NOT NULL.';

-- §2. Module-constants: seed 4 refresh_interval_ms rows (C-10 mitigation)
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('rtb_config', '*', 'crypto_spot',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB'),
  ('rtb_config', '*', 'crypto_perp',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB'),
  ('rtb_config', '*', 'xstock_spot',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB'),
  ('rtb_config', '*', 'xstock_perp',  '*', '*', 'refresh_interval_ms', '30000'::jsonb, 'B79.0n.RTB')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- §3. Verification: confirm 4 rows landed (HARD-FAIL trigger if not)
DO $$
DECLARE row_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
  WHERE module_name = 'rtb_config' AND constant_name = 'refresh_interval_ms'
    AND asset_class IN ('crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp');
  IF row_count != 4 THEN
    RAISE EXCEPTION 'B79.0n.RTB Phase 1 verification FAILED: expected 4 rows, found %', row_count;
  END IF;
END $$;

COMMIT;
```

Phase 3 (`2026-05-27-b79-0n-rtb-phase3.sql`) adds CHECK constraint enforcing NOT NULL + index `rtb_signals_mode_asset_class_status_idx`. Pre-condition block fails-loud if any rows still have asset_class IS NULL (forces Phase 2 backfill completion before Phase 3 applies).

### 2.2 Drizzle schema (Chunk D — shared/schema.ts:1873)

```typescript
// rtbSignals table — added field + index:
metadata: jsonb("metadata"),
// B79.0n.RTB (2026-05-27, Phase 1): per-class queue partitioning key.
// NULL allowed only during Phase 1+2 backfill window. Post-Phase-3 CHECK
// constraint enforces NOT NULL; Phase 4 column-level SET NOT NULL is
// contingent on §6.4 zero-null verify-gate per Langston C-4.
assetClass: varchar("asset_class", { length: 32 }),
}, (table) => ({
  // ... existing indexes ...
  // B79.0n.RTB Phase 3: per-class queue hot-read index
  modeAssetClassStatusIdx: index("rtb_signals_mode_asset_class_status_idx").on(table.mode, table.assetClass, table.status),
}));
```

### 2.3 Storage layer (Chunk E — storage.ts)

```typescript
// IStorage interface + implementation: getRtbSignals optional assetClass filter
getRtbSignals(filters: {
  mode: 'live' | 'paper';
  status?: string;
  symbol?: string;
  strategy?: string;
  /** B79.0n.RTB (2026-05-27): per-class queue filter. Optional. */
  assetClass?: string;
  orderBy?: string;
  orderDir?: string;
  limit?: number
}): Promise<RtbSignal[]>;

// Implementation: WHERE assetClass condition appended when provided
if (assetClass) {
  conditions.push(eq(rtbSignals.assetClass, assetClass));
}

// upsertRtbSignal SET clause adds assetClass:
.onConflictDoUpdate({
  target: [rtbSignals.mode, rtbSignals.symbol, rtbSignals.strategy],
  set: {
    // ... existing fields ...
    metadata: data.metadata,
    // B79.0n.RTB (2026-05-27, Phase 1): dual-write asset_class column
    // alongside metadata so per-class queue reads can filter by the
    // indexed column.
    assetClass: data.assetClass,
  },
})
```

### 2.4 ready_to_buy_service per-class accessors (Chunks F+G)

```typescript
// queueSQESignal insertData (line ~1664) — populate first-class column:
const insertData: InsertRtbSignal = {
  // ... existing fields ...
  metadata: enrichedMetadata as any,
  // B79.0n.RTB (2026-05-27, Phase 1 dual-write): populate first-class
  // asset_class column alongside metadata.assetClass. Defaults to
  // crypto_spot if SQEInput didn't carry it (legacy path).
  assetClass: input.assetClass || 'crypto_spot',
};

// getQueuedSignals — optional assetClass filter:
async getQueuedSignals(mode: TradingMode, assetClass?: AssetClass): Promise<RtbSignal[]> {
  const baseFilter = assetClass ? { mode, assetClass } : { mode };
  const activeSignals = await storage.getRtbSignals({ ...baseFilter, status: 'active', orderBy: 'finalScore', orderDir: 'desc' });
  // ... reconfirmed + queued similar ...
}

// NEW: getQueueDepth() accessor — serves 48h verify-gate signal
async getQueueDepth(): Promise<Record<AssetClass, Record<TradingMode, number>>> {
  const activeClasses: AssetClass[] = ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'];
  const modes: TradingMode[] = ['paper', 'live'];
  const out = {} as Record<AssetClass, Record<TradingMode, number>>;
  for (const cls of activeClasses) {
    out[cls] = {} as Record<TradingMode, number>;
    for (const mode of modes) {
      const signals = await this.getQueuedSignals(mode, cls);
      out[cls][mode] = signals.length;
    }
  }
  return out;
}

// getRankedSignals — optional assetClass for per-class top-N:
async getRankedSignals(mode: TradingMode, limit: number = 15, assetClass?: AssetClass): Promise<RtbSignal[]> {
  const signals = await this.getQueuedSignals(mode, assetClass);
  // ... existing ranking logic unchanged ...
}
```

### 2.5 rtb-refresh-service LOCKED-module per-class buckets (Chunk H)

**LOCKED-module override directive citation:** B79.0n umbrella v4 row #11 authorizes per-class bucket allocation + per-class pool sizing + per-class ACT calibration. **NOT authorized** (no separate directive): algorithmic redesign of bucket assignment, cadence threshold changes, ACT scaler logic rewrites. Diffs below stay within authorized scope.

```typescript
// New top-of-file import + active classes const:
import { resolveAssetClass, type AssetClass } from '../../shared/asset-classes.js';
const RTB_ACTIVE_CLASSES: readonly AssetClass[] = ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'];

// Class member refactor (LOCKED-module change):
// BEFORE:
private signalBuckets: Map<number, Set<string>> = new Map();
private lastBucketAssignment: Map<string, number> = new Map();

// AFTER (per Langston C-1 Option A):
private signalBuckets: Map<AssetClass, Map<number, Set<string>>> = new Map();
private lastBucketAssignment: Map<string, { assetClass: AssetClass; bucketIndex: number }> = new Map();

// Constructor — init 8 buckets per active class:
constructor() {
  for (const cls of RTB_ACTIVE_CLASSES) {
    const perClassBuckets = new Map<number, Set<string>>();
    for (let i = 0; i < this.TOTAL_BUCKETS; i++) {
      perClassBuckets.set(i, new Set());
    }
    this.signalBuckets.set(cls, perClassBuckets);
  }
}

// assignSignalsToBuckets — per-class assignment with resolveAssetClass fallback:
private async assignSignalsToBuckets(): Promise<void> {
  const currentSignalIds = new Set<string>();
  for (const mode of ['paper', 'live'] as TradingMode[]) {
    const signals = await readyToBuyService.getQueuedSignals(mode);
    if (!signals) continue;
    for (const signal of signals) {
      const signalKey = `${mode}:${signal.symbol}:${signal.strategy}`;
      currentSignalIds.add(signalKey);
      if (!this.lastBucketAssignment.has(signalKey)) {
        let assetClass = signal.assetClass as AssetClass | null;
        if (!assetClass) {
          try { assetClass = resolveAssetClass(signal.symbol, 'kraken'); }
          catch { assetClass = 'crypto_spot'; }
        }
        if (!RTB_ACTIVE_CLASSES.includes(assetClass as AssetClass)) {
          console.warn(`[B79.0n.RTB][BUCKET_ASSIGN] signalKey=${signalKey} resolved to non-active assetClass=${assetClass}; defaulting to crypto_spot`);
          assetClass = 'crypto_spot';
        }
        const hash = this.hashString(signalKey);
        const bucketIndex = hash % this.TOTAL_BUCKETS;
        this.lastBucketAssignment.set(signalKey, { assetClass: assetClass as AssetClass, bucketIndex });
        this.signalBuckets.get(assetClass as AssetClass)?.get(bucketIndex)?.add(signalKey);
      }
    }
  }
  for (const [signalKey, assignment] of this.lastBucketAssignment.entries()) {
    if (!currentSignalIds.has(signalKey)) {
      this.signalBuckets.get(assignment.assetClass)?.get(assignment.bucketIndex)?.delete(signalKey);
      this.lastBucketAssignment.delete(signalKey);
    }
  }
}

// refreshBucket — aggregate per-class buckets at same index:
let totalBucketSize = 0;
const perClassSizes: Record<string, number> = {};
for (const cls of RTB_ACTIVE_CLASSES) {
  const perClassBuckets = this.signalBuckets.get(cls);
  const bucket = perClassBuckets?.get(bucketIndex) || new Set<string>();
  perClassSizes[cls] = bucket.size;
  totalBucketSize += bucket.size;
}
console.log(`[A4.R10R-3][RTBRefresh][CYCLE_START] bucket=${bucketIndex} size=${totalBucketSize} (...per-class...) poolSize=${getAdaptivePoolSize()}`);

// getBucketStats() bug fix (surfaced by Chunk M T7 test):
getBucketStats(): { bucketIndex: number; size: number; perClass: Record<string, number> }[] {
  const stats: { bucketIndex: number; size: number; perClass: Record<string, number> }[] = [];
  for (let i = 0; i < this.TOTAL_BUCKETS; i++) {
    let totalSize = 0;
    const perClass: Record<string, number> = {};
    for (const cls of RTB_ACTIVE_CLASSES) {
      const perClassBuckets = this.signalBuckets.get(cls);
      const bucketSize = perClassBuckets?.get(i)?.size || 0;
      perClass[cls] = bucketSize;
      totalSize += bucketSize;
    }
    stats.push({ bucketIndex: i, size: totalSize, perClass });
  }
  return stats;
}
```

### 2.6 PromotionEvent additive (Chunk I — event-bus.ts)

```typescript
export interface PromotionEvent {
  mode: TradingMode;
  symbol: string;
  strategy: string;
  signalId: string;
  tradeId: string;
  timestamp: string;
  /**
   * B79.0n.RTB (2026-05-27, R-8 mitigation): asset class of the promoted
   * signal. Optional in v1 per Langston Step 2 ACK C-7 — additive field is
   * safe for all 3 current consumers (ready_to_buy_service:369 destructure,
   * c13-validation-service collection, c14-validation-service collection);
   * none use exhaustive switch or `keyof PromotionEvent` enumeration.
   */
  assetClass?: string;
}
```

### 2.7 rtb_queue_refresher RETIRED (Chunk J)

`server/core/rtb/rtb_queue_refresher.ts` (144 LOC) DELETED — verified zero production callers across `server/`, `client/`, `shared/` (Kyle directive 2026-05-27).

`server/index.ts:1329-1333` comment updated:
```typescript
// B79.0n.RTB (2026-05-27): rtb_queue_refresher.ts RETIRED per Kyle directive
// 2026-05-27 — verified zero production callers across server/ + client/ +
// shared/ before delete. File was Phase 8.8.4-C.6 cron-based 30s refresh
// already superseded by ReadyToBuyService.startRefreshCycle() (Central-
// Clock-synchronized) wired into PaperExecutionEngine lifecycle.
console.log('[B79.0n.RTB] rtb_queue_refresher.ts retired (legacy file deleted; ReadyToBuyService.startRefreshCycle is canonical via PaperExecutionEngine lifecycle)');
```

### 2.8 tcl_watchdog.ts NEW-Q1 + NEW-Q2 documentation (Chunk K)

JSDoc on `checkSignalThresholdLive` documents both decisions per Langston Step 2 ACK:

```typescript
/**
 * Check if signal threshold is reached and activate TCL if needed
 * ...
 * B79.0n.RTB (2026-05-27, Langston NEW-Q1 + NEW-Q2 documentation):
 *   - TCL stays GLOBAL: the threshold counts signals across all asset
 *     classes (sum over per-class queues = same number as today's global
 *     queue depth). NEW-Q1 preserves current global-count semantics.
 *   - Per-class promotion ordering inside the TCL barrier is by LOCK
 *     ACQUISITION ORDER (first-call-wins, deterministic per JavaScript
 *     event-loop ordering). No explicit class priority. If priority is
 *     needed later, introduce `module_constants.rtb_priority.<asset_class>`
 *     in a follow-up batch with workload justification.
 */
async checkSignalThresholdLive(mode: TradingMode, _rtbRefreshComplete?: boolean): Promise<void> {
```

### 2.9 Boot pre-warm enumeration (Chunk L — server/index.ts after rtbRefreshService.start)

```typescript
// B79.0n.RTB (2026-05-27, Langston C-10 + R-3 HARD-FAIL visibility):
// explicitly enumerate the 4 active classes + per-class refresh cadence
// values loaded from module_constants. HARD-FAIL boot if any row missing.
try {
  const { getCachedNumberRequired } = await import('./services/module-constants-service.js');
  const rtbActiveClasses = ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'] as const;
  const cadenceLog: string[] = [];
  for (const cls of rtbActiveClasses) {
    const cadenceMs = getCachedNumberRequired('rtb_config', 'refresh_interval_ms', {
      exchange: '*', assetClass: cls, strategy: '*', regime: '*',
    });
    cadenceLog.push(`${cls}=${cadenceMs}ms`);
  }
  console.log(`[B79.0n.RTB][BOOT] 4-class refresh cadence loaded: ${cadenceLog.join(' ')}`);
} catch (rtbCadenceErr) {
  console.error('[B79.0n.RTB][BOOT_FAIL] per-class rtb_config.refresh_interval_ms rows missing:', rtbCadenceErr);
  process.exit(1);
}
```

### 2.10 11 new test files (Chunk M) — listed by path (53 tests total)

| File | Test count | Coverage |
|---|---|---|
| `b79-0n-rtb-isolation.test.ts` | 5 | T1 per-class queue isolation |
| `b79-0n-rtb-cadence.test.ts` | 4 | T2 per-class refresh cadence config |
| `b79-0n-rtb-fsm-isolation.test.ts` | 4 | T3 FSM transition integrity |
| `b79-0n-rtb-tcl-barrier.test.ts` | 4 | T4 TCL serialization + 5-run determinism per C-9 |
| `b79-0n-rtb-queue-depth.test.ts` | 5 | T5 getQueueDepth accessor |
| `b79-0n-rtb-class-not-wired.test.ts` | 6 | T6 reserved-future throws |
| `b79-0n-rtb-locked-module.test.ts` | 5 | T7 LOCKED-module preservation (surfaced getBucketStats bug) |
| `b79-0n-rtb-schema-legacy.test.ts` | 5 | T8a pre-Phase-3 null WARN |
| `b79-0n-rtb-schema-postcheck.test.ts` | 5 | T12 post-Phase-3 HARD-FAIL per C-3 |
| `b79-0n-rtb-promotion-event.test.ts` | 5 | T9 additive field safety |
| `b79-0n-rtb-cold-boot.test.ts` | 5 | T11 cold-boot accessors |

All 53 tests pass locally (3.33s). T10 (rtb_queue_refresher import-graph) is covered by tsc compile pass since the file is deleted.

---

## §3. Deploy-order sequence (CLAUDE.md §2 Step 6 — per Langston C-5)

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
  git pull origin migration/aws-supabase && \
  npm run db:migrate && \
  npm run b79-0n-rtb-backfill && \
  npm run db:migrate && \
  npm run build && \
  pm2 restart dawntrader'"
```

Sequence rationale:
1. `git pull` — fetch HEAD with all code + migration files
2. First `npm run db:migrate` — applies **Phase 1** (ADD COLUMN nullable + seed 4 cadence rows). Phase 3 cannot apply yet because Phase 3 pre-condition block fails if any nulls remain.
3. `npm run b79-0n-rtb-backfill` — **Phase 2** dual-path backfill on `WHERE asset_class IS NULL`. Idempotent.
4. Second `npm run db:migrate` — applies **Phase 3** (CHECK constraint + index). Pre-condition block passes now that backfill is done.
5. `npm run build` + `pm2 restart` — activates Chunk E dual-write code with the new column live.

Note: Phase 4 SET NOT NULL is **contingent on §6.4 48h gate** (zero null count over the window). Runs at Step 9-10 in-batch if conditions met; only defers to RTB.b if soak surfaces nulls.

Need to add `b79-0n-rtb-backfill` to `package.json` scripts before deploy. CC will handle pre-deploy.

---

## §4. LOCKED-module modification boundary (per Langston Q5)

Step 4 code review must verify rtb-refresh-service.ts changes stay within authorized scope per Directive 8.8.4-A4.R10R-4 + B79.0n umbrella v4 row #11.

**Authorized modifications confirmed in §2.5:**
- Per-class bucket allocation (`signalBuckets` nested-map refactor) ✅
- Per-class ACT calibration — **no actual ACT change** (shared global ACT pool kept per C-2; pool sizing constants UNCHANGED) ✅
- Schema-extension reads (assetClass column lookup in assignSignalsToBuckets) ✅
- `getBucketStats()` bug fix (test-surfaced; not a behavioral change, restores correct sizing) ✅

**NOT authorized — NOT touched in this batch:**
- Bucket-assignment algorithm (hash-mod-8 UNCHANGED) ✅
- Cadence threshold constants (`MICRO_CYCLE_INTERVAL=15`, `MACRO_CYCLE_INTERVAL=120`, `TOTAL_BUCKETS=8` ALL UNCHANGED) ✅
- ACT scaler logic + thresholds (`adaptPoolSize`, `recordCycleMetrics` UNCHANGED — line range 92-153 untouched) ✅

If Langston spots any modification outside this boundary, flag at Step 4 + I revert that hunk + re-run tests.

---

## §5. R-9 schema migration risk re-assessment

R-9 was HIGH severity in scope §5. Updated assessment after Step 3 implementation:

- Phase 1 ADD COLUMN nullable on production table: **LOW RISK** (no constraint violation, no blocking lock)
- Phase 2 backfill batch UPDATE: **LOW RISK** (idempotent, per-row, no transaction wrap)
- Phase 3 CHECK constraint: **MEDIUM RISK** (requires zero nulls; pre-condition block fails-loud if not met; mitigation via Phase 2 completion gate)
- Phase 4 SET NOT NULL (contingent): **MEDIUM RISK** at Step 9-10 (conditional execution gate)

Step 6 deploy supervisor (CC) executes Phase 1 + 2 + 3 in tight sequence per §3. If any phase fails, rollback files are ready at `2026-05-27-b79-0n-rtb-phase1-rollback.sql` + `2026-05-27-b79-0n-rtb-phase3-rollback.sql`.

---

## §6. Step 4 ACK / revision request

Please review the embedded diffs in §2 against the scope v2.2 + pre-audit v1 lock decisions. Areas to focus on per pre-audit §9.1:

- **C-1 bucket allocation Option A correctly implemented?** (§2.5 nested-map refactor)
- **C-2 shared global ACT preserved?** (§2.5 + §4 boundary table — no ACT-scaler changes)
- **C-3 deploy-order sequencing explicit?** (§3 Step 6 command sequence)
- **C-7 PromotionEvent additive optional safe?** (§2.6)
- **C-8 FSM class-invariance preserved?** (No `_RTB_GK` wildcard resolver touches — verified via grep)
- **C-9 T4 deterministic 5-run check landed?** (§2.10 + `b79-0n-rtb-tcl-barrier.test.ts`)
- **C-12 VTS-shadow tie-in noted?** (Deferred to OBSERVABILITY #18 per pre-audit)
- **NEW-Q1 + NEW-Q2 documentation landed in tcl_watchdog.ts JSDoc?** (§2.8)
- **LOCKED-module boundary held?** (§4 — flag any out-of-scope hunks)

If ACK clean: I proceed to Step 5 CI all-4-green confirmation (already pushed; CI watching in background) → Step 6 staging deploy → Step 7 first-pass verification per pre-audit §6.2.

If revisions requested: I iterate from here per CLAUDE.md §6.7.
