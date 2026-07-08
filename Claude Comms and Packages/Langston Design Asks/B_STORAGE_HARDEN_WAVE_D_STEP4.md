# B-STORAGE-HARDEN Wave D — Step-4 diff review (OBJ-3 daily-partitioning code)

Reviewer: Langston · Owner: CC-A · Date: 2026-07-08 · change-class: architecture
Scope: B_STORAGE_HARDEN_WAVE_D_SCOPE.md · Pre-audit: B_STORAGE_HARDEN_WAVE_D_PRE_AUDIT.md (both Step-1/2 APPROVED)

This packet covers ONLY the OBJ-3 daily-partitioning CODE + the cutover migration + the per-table warm knob.
Per Kyle's 2026-07-08 directive the OBJ-4 capture throttle stays at 1000ms and is NOT flipped until liquid US
equity hours; that flip + its live p90/p95/p99/MAX tail-measurement is a separate post-deploy step, not in this diff.

## Your 4 implement-time requirements → how each is met
1. **Measured-p90-WITH-TAIL throttle gate** — deferred to the OBJ-4 flip step (not this diff). Recorded as the commit
   condition: flip to 8000 during liquid RTH, capture p90/p95/p99/MAX inter-capture gap over >=10min, require p90<=12s, revert if the tail blows margin.
2. **Monthly creator EXCLUDES xstock_spot_ticker_snap at/after cutover** — b74-create-monthly-partitions.ts skips any
   (table, month) where isDailyPartitionedForMonth() is true; single-source cutover in daily-partition-cutover.ts.
3. **Daily creator cron 0 1 * * * with 14-day look-ahead** — NEW b74-create-daily-partitions.ts, LOOKAHEAD_DAYS=14, self-heals current day, skips pre-cutover days.
4. **Sweep regex daily-FIRST, both anchored, golden test both shapes** — classifyPartition() in sweep-slicing.ts tests
   /_(\d{4})_(\d{2})_(\d{2})$/ BEFORE /_(\d{4})_(\d{2})$/, both leading-_ and trailing-$ anchored + calendar-validity guard;
   isPartitionEligible() applies rangeEnd<=cutoff (daily, rolling) vs rangeStart<cutoffMonth (monthly). 14 new golden tests, all green.

## Cutover design (transition-forward, NO repartition of the 63GB table)
- Cutover = 2026-08-01 (first clean month-start post-deploy). July-2026 + earlier stay MONTHLY and age out; daily from Aug.
- **Seam collision hazard CONFIRMED + handled:** staging probe shows the monthly creator's 12-month look-ahead ALREADY made
  9 EMPTY future monthly partitions (xstock_spot_ticker_snap_2026_08 .. _2027_04, all rows=0). These would OVERLAP the daily
  children and break inserts. The migration's step-1 DETACHes+DROPs them (ABORTS LOUDLY if any holds rows), then creates 16
  daily partitions 2026-08-01..08-16 so day-1 is covered before the daily cron catches up.
- **DB session timezone = UTC** (probed) → bare-date bounds align exactly with the sweep's UTC-computed ranges; July monthly
  [.., 2026-08-01) abuts first daily [2026-08-01, ..) with ZERO overlap.

## Bench: CI tsc-baseline gate GREEN (no regressions); vitest 27/27 sweep-helpers + 12/12 b70 archive.

## FULL DIFF (modified files)
```diff
diff --git a/drizzle/migrations/MANIFEST.txt b/drizzle/migrations/MANIFEST.txt
index ebc5d9a28..74ea80d76 100644
--- a/drizzle/migrations/MANIFEST.txt
+++ b/drizzle/migrations/MANIFEST.txt
@@ -164,3 +164,4 @@
 2026-07-03-p19-b-rename-w3-b1-closed-trades.sql
 2026-07-05-p19-b8-2-balance-policy.sql
 2026-07-08-b-storage-harden-wave-c-b70-retention.sql
+2026-07-08-b-storage-harden-wave-d-xstock-ticker-daily-cutover.sql
diff --git a/server/scripts/b74-create-monthly-partitions.ts b/server/scripts/b74-create-monthly-partitions.ts
index 7e0e616a5..dc55b3e3b 100644
--- a/server/scripts/b74-create-monthly-partitions.ts
+++ b/server/scripts/b74-create-monthly-partitions.ts
@@ -24,6 +24,7 @@
 
 import { db } from '../db.js';
 import { sql } from 'drizzle-orm';
+import { isDailyPartitionedForMonth } from '../services/data-archive/daily-partition-cutover.js';
 
 const SIX_TABLES = [
   'xstock_spot_ohlc_1m',
@@ -70,10 +71,21 @@ async function main(): Promise<void> {
   // Ensure partitions for: current month (self-heal), next 12 months (forward window)
   let createdCount = 0;
   let selfHealedCount = 0;
+  let dailyExcludedCount = 0;
 
   for (const table of SIX_TABLES) {
     for (let i = 0; i <= 12; i++) {
       const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
+      // B-STORAGE-HARDEN Wave D (OBJ-3): a daily-partitioned table (e.g.
+      // xstock_spot_ticker_snap) is owned by the DAILY creator from its cutover
+      // month forward. Creating a monthly partition here would overlap the daily
+      // children and break inserts (Langston Wave-D req #2). Skip those months;
+      // months BEFORE the cutover still get a monthly partition (transition-fwd).
+      const monthStartUtc = new Date(Date.UTC(target.getFullYear(), target.getMonth(), 1));
+      if (isDailyPartitionedForMonth(table, monthStartUtc)) {
+        dailyExcludedCount++;
+        continue;
+      }
       const { created, name } = await ensurePartition(table, target.getFullYear(), target.getMonth() + 1);
       if (created) {
         createdCount++;
@@ -88,7 +100,10 @@ async function main(): Promise<void> {
     }
   }
 
-  console.log(`[B74][partitions] done. ${createdCount} new partitions created (${selfHealedCount} self-healed).`);
+  console.log(
+    `[B74][partitions] done. ${createdCount} new partitions created ` +
+      `(${selfHealedCount} self-healed, ${dailyExcludedCount} daily-partitioned months excluded).`,
+  );
 }
 
 main()
diff --git a/server/scripts/b75-cold-rotator.ts b/server/scripts/b75-cold-rotator.ts
index 5237f1358..91b5109c4 100644
--- a/server/scripts/b75-cold-rotator.ts
+++ b/server/scripts/b75-cold-rotator.ts
@@ -34,6 +34,11 @@ const { Client } = pg;
 
 interface Cfg {
   warmRetentionDays: number;
+  /** B-STORAGE-HARDEN Wave D: optional per-table warm-window overrides, keyed by
+   *  source_table. Read from `data_lifecycle.<table>.warm_retention_days`. Empty
+   *  by default (all tables use `warmRetentionDays`) — a future one-line dial to
+   *  send a rarely-re-read table to cold sooner without a code change. */
+  perTableWarmRetentionDays: Map<string, number>;
   coldRotatorDryRun: boolean;
   warmBucket: string;
   warmPrefix: string;
@@ -42,6 +47,12 @@ interface Cfg {
   coldProvider: string;
 }
 
+/** The warm-retention window (days) that applies to a given source_table: its
+ *  per-table override if present, else the global default. */
+function warmWindowForTable(cfg: Cfg, sourceTable: string): number {
+  return cfg.perTableWarmRetentionDays.get(sourceTable) ?? cfg.warmRetentionDays;
+}
+
 async function loadConfig(client: pg.Client): Promise<Cfg> {
   const r = await client.query(
     `SELECT constant_name, value FROM module_constants WHERE module_name = 'data_lifecycle'`,
@@ -71,8 +82,23 @@ async function loadConfig(client: pg.Client): Promise<Cfg> {
     return v;
   }
 
+  // Wave D: harvest any per-table warm-window overrides. Constant names look like
+  // `<table>.warm_retention_days` under module_name='data_lifecycle'. Absent by
+  // default → the map is empty and every table uses the global default (behavior
+  // byte-identical to before this knob existed).
+  const perTableWarmRetentionDays = new Map<string, number>();
+  for (const [name, value] of map.entries()) {
+    const m = /^(.+)\.warm_retention_days$/.exec(name);
+    if (!m) continue;
+    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
+      throw new Error(`[B75 rotator] invalid numeric data_lifecycle.${name}`);
+    }
+    perTableWarmRetentionDays.set(m[1], value);
+  }
+
   return {
     warmRetentionDays: reqNum('default_warm_retention_days'),
+    perTableWarmRetentionDays,
     coldRotatorDryRun: reqBool('cold_rotator_dry_run'),
     warmBucket: reqStr('warm_bucket'),
     warmPrefix: reqStr('warm_prefix'),
@@ -94,7 +120,14 @@ interface Candidate {
 }
 
 async function listCandidates(client: pg.Client, cfg: Cfg): Promise<Candidate[]> {
-  const cutoff = new Date(Date.now() - cfg.warmRetentionDays * 86_400_000);
+  // Wave D per-table windows: prefilter in SQL by the SHORTEST applicable window
+  // (so no eligible row is excluded), then refine per-table in JS. With NO
+  // per-table overrides, minWindow == default → this is exactly the historical
+  // `created_at < now - default` single-cutoff behavior.
+  const nowMs = Date.now();
+  const windows = [cfg.warmRetentionDays, ...cfg.perTableWarmRetentionDays.values()];
+  const minWindowDays = Math.min(...windows);
+  const prefilterCutoff = new Date(nowMs - minWindowDays * 86_400_000);
   const r = await client.query(
     `SELECT id, source_table, partition_label, storage_uri, row_count, bytes_compressed,
             checksum, created_at
@@ -110,9 +143,12 @@ async function listCandidates(client: pg.Client, cfg: Cfg): Promise<Candidate[]>
              AND m2.tier = 'cold'
         )
       ORDER BY created_at ASC`,
-    [cutoff],
+    [prefilterCutoff],
+  );
+  // Per-table refine: keep only rows past THEIR own warm window.
+  return (r.rows as Candidate[]).filter(
+    (row) => row.created_at.getTime() < nowMs - warmWindowForTable(cfg, row.source_table) * 86_400_000,
   );
-  return r.rows;
 }
 
 async function main(): Promise<void> {
@@ -142,9 +178,13 @@ async function main(): Promise<void> {
   const warmRetentionOverride = parseIntFlag(argv, '--warm-retention-days');
   if (warmRetentionOverride !== null) {
     console.log(
-      `[B75 rotator] warm-retention override (CLI): ${cfg.warmRetentionDays} → ${warmRetentionOverride} days`,
+      `[B75 rotator] warm-retention override (CLI): ${cfg.warmRetentionDays} → ${warmRetentionOverride} days ` +
+        `(single global window; per-table overrides ignored for this run)`,
     );
     cfg.warmRetentionDays = warmRetentionOverride;
+    // The CLI override is a deliberate single-window run (bounded proof / manual
+    // batch) — clear per-table overrides so every table uses exactly this value.
+    cfg.perTableWarmRetentionDays.clear();
   }
 
   const storage = getStorageClient();
diff --git a/server/scripts/b75-retention-sweep.ts b/server/scripts/b75-retention-sweep.ts
index c9457e5c2..c0a083a90 100644
--- a/server/scripts/b75-retention-sweep.ts
+++ b/server/scripts/b75-retention-sweep.ts
@@ -42,10 +42,12 @@ import pg from 'pg';
 import { exportPartition } from '../services/data-archive/partition-exporter.js';
 import { getStorageClient, type StorageClient } from '../services/data-archive/storage-client.js';
 import {
+  classifyPartition,
   decideSliceMode,
   enumerateUtcDays,
   dayLabel,
   deriveModeFromLabels,
+  isPartitionEligible,
 } from '../services/data-archive/sweep-slicing.js';
 import { addAlert } from '../services/system-alerts.js';
 
@@ -192,6 +194,7 @@ async function listOldPartitions(
   client: pg.Client,
   parent: string,
   cutoffMonthStart: Date,
+  cutoff: Date,
 ): Promise<PartitionRow[]> {
   const r = await client.query(
     `SELECT child.relname AS child_name,
@@ -203,21 +206,25 @@ async function listOldPartitions(
     [parent],
   );
 
+  // B-STORAGE-HARDEN Wave D (OBJ-3): a parent may now hold MONTHLY (`…_YYYY_MM`)
+  // and/or DAILY (`…_YYYY_MM_DD`) children (xstock_spot_ticker_snap transitions
+  // month→day at the cutover). `classifyPartition` tests the daily shape FIRST
+  // (so `_DD` is never mis-read as a month), and `isPartitionEligible` applies
+  // the right cutoff per granularity: a monthly child tiers when its whole month
+  // is in the past (rangeStart < cutoffMonthStart, legacy); a daily child tiers
+  // when its whole day is past the day-granular retention cutoff (rangeEnd <=
+  // cutoff) — a true rolling window.
   const out: PartitionRow[] = [];
   for (const row of r.rows) {
-    const m = /(\d{4})_(\d{2})$/.exec(row.child_name);
-    if (!m) continue;
-    const year = Number(m[1]);
-    const month = Number(m[2]);
-    const rangeStart = new Date(Date.UTC(year, month - 1, 1));
-    const rangeEnd = new Date(Date.UTC(year, month, 1));
-    if (rangeStart >= cutoffMonthStart) continue; // not old enough / not write-sealed
+    const parsed = classifyPartition(row.child_name);
+    if (!parsed) continue;
+    if (!isPartitionEligible(parsed, cutoff, cutoffMonthStart)) continue;
     out.push({
       parent,
       child: row.child_name,
-      partitionLabel: `${year}-${String(month).padStart(2, '0')}`,
-      rangeStart,
-      rangeEnd,
+      partitionLabel: parsed.partitionLabel,
+      rangeStart: parsed.rangeStart,
+      rangeEnd: parsed.rangeEnd,
     });
   }
   return out;
@@ -926,7 +933,7 @@ async function runSweep(): Promise<boolean> {
     await ctlList.connect();
     let oldPartitions: PartitionRow[];
     try {
-      oldPartitions = await listOldPartitions(ctlList, spec.parent, cutoffMonth);
+      oldPartitions = await listOldPartitions(ctlList, spec.parent, cutoffMonth, cutoff);
     } finally {
       await ctlList.end();
     }
diff --git a/server/services/data-archive/sweep-slicing.ts b/server/services/data-archive/sweep-slicing.ts
index 86f778f69..6292199b2 100644
--- a/server/services/data-archive/sweep-slicing.ts
+++ b/server/services/data-archive/sweep-slicing.ts
@@ -65,3 +65,89 @@ export function deriveModeFromLabels(
   if (hasDay) return 'sliced';
   return null;
 }
+
+// ─────────────────────────────────────────────────────────────────────────────
+// B-STORAGE-HARDEN Wave D (OBJ-3) — daily-vs-monthly partition classification
+// ─────────────────────────────────────────────────────────────────────────────
+// `xstock_spot_ticker_snap` transitions from MONTHLY (`…_YYYY_MM`) to DAILY
+// (`…_YYYY_MM_DD`) RANGE partitions at a month-boundary cutover so a true
+// rolling-30-day hot window is reclaimable one day at a time. The retention
+// sweep therefore has to recognize BOTH child-name shapes and tier each on the
+// right granularity. This classification is the load-bearing parse — extracted
+// here (pure, no DB) so both shapes are golden-tested.
+
+export interface ClassifiedPartition {
+  kind: 'daily' | 'monthly';
+  partitionLabel: string; // 'YYYY-MM-DD' (daily) or 'YYYY-MM' (monthly)
+  rangeStart: Date;       // inclusive lower bound (UTC midnight)
+  rangeEnd: Date;         // exclusive upper bound (UTC midnight)
+}
+
+/**
+ * Classify a partition child relname into its date range + label.
+ *
+ * DAILY (`…_YYYY_MM_DD`) is tested FIRST, before MONTHLY (`…_YYYY_MM`), so a
+ * daily name's trailing `_DD` can never be mis-read as a month (Langston Wave-D
+ * req #4 — a daily-as-monthly mis-parse would tier a single day as if it were a
+ * whole month = silent mis-tier / data-loss risk). Both patterns are anchored:
+ * a leading `_` (so digits inside the table name aren't captured) and a trailing
+ * `$`. Returns null for a name that is neither shape OR encodes an impossible
+ * calendar date (e.g. `_02_30`, `_13_01`).
+ */
+export function classifyPartition(childName: string): ClassifiedPartition | null {
+  const daily = /_(\d{4})_(\d{2})_(\d{2})$/.exec(childName);
+  if (daily) {
+    const year = Number(daily[1]);
+    const month = Number(daily[2]);
+    const day = Number(daily[3]);
+    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
+    const rangeStart = new Date(Date.UTC(year, month - 1, day));
+    const rangeEnd = new Date(Date.UTC(year, month - 1, day + 1));
+    // Reject an impossible date that JS silently rolled over (e.g. `_02_30` →
+    // Mar 2): the round-tripped fields must match the parsed ones exactly.
+    if (
+      rangeStart.getUTCFullYear() !== year ||
+      rangeStart.getUTCMonth() !== month - 1 ||
+      rangeStart.getUTCDate() !== day
+    ) {
+      return null;
+    }
+    return { kind: 'daily', partitionLabel: `${daily[1]}-${daily[2]}-${daily[3]}`, rangeStart, rangeEnd };
+  }
+
+  const monthly = /_(\d{4})_(\d{2})$/.exec(childName);
+  if (monthly) {
+    const year = Number(monthly[1]);
+    const month = Number(monthly[2]);
+    if (month < 1 || month > 12) return null;
+    return {
+      kind: 'monthly',
+      partitionLabel: `${monthly[1]}-${monthly[2]}`,
+      rangeStart: new Date(Date.UTC(year, month - 1, 1)),
+      rangeEnd: new Date(Date.UTC(year, month, 1)),
+    };
+  }
+
+  return null;
+}
+
+/**
+ * Is a classified partition eligible to tier (write-sealed AND older than
+ * retention)?
+ *  - monthly: its whole month is strictly before the cutoff month
+ *    (`rangeStart < cutoffMonthStart`) — unchanged legacy semantics; a monthly
+ *    partition tiers only once its entire month is in the past.
+ *  - daily: the ENTIRE day is at/older than the day-granular retention cutoff
+ *    (`rangeEnd <= cutoff`), so every row the partition can hold is ≥ retention
+ *    old — a true rolling-N-day window. Keying on rangeEnd (the next-day
+ *    boundary), NOT rangeStart, guarantees the newest possible row in the day is
+ *    past retention before we tier + drop.
+ */
+export function isPartitionEligible(
+  p: ClassifiedPartition,
+  cutoff: Date,
+  cutoffMonthStart: Date,
+): boolean {
+  if (p.kind === 'daily') return p.rangeEnd.getTime() <= cutoff.getTime();
+  return p.rangeStart.getTime() < cutoffMonthStart.getTime();
+}
diff --git a/server/tests/unit/b-new-47-sweep-helpers.test.ts b/server/tests/unit/b-new-47-sweep-helpers.test.ts
index 683a9c547..264dc2fd8 100644
--- a/server/tests/unit/b-new-47-sweep-helpers.test.ts
+++ b/server/tests/unit/b-new-47-sweep-helpers.test.ts
@@ -12,6 +12,8 @@ import {
   enumerateUtcDays,
   dayLabel,
   deriveModeFromLabels,
+  classifyPartition,
+  isPartitionEligible,
 } from '../../services/data-archive/sweep-slicing.js';
 
 const GB = 1024 * 1024 * 1024;
@@ -79,3 +81,112 @@ describe('B-NEW-47 deriveModeFromLabels (resume invariant guard)', () => {
     expect(() => deriveModeFromLabels('2026-05', ['2026-05', '2026-05-03'])).toThrow(/INVARIANT VIOLATION/);
   });
 });
+
+// ─────────────────────────────────────────────────────────────────────────────
+// B-STORAGE-HARDEN Wave D (OBJ-3) — daily-vs-monthly partition classification
+// Golden-fixture lock on BOTH child-name shapes (Langston Wave-D req #4). The
+// load-bearing invariant: DAILY (`…_YYYY_MM_DD`) is parsed FIRST so a daily
+// name's trailing `_DD` is NEVER mis-read as a month (that mis-parse would tier
+// a single day as a whole month = silent mis-tier / data loss).
+// ─────────────────────────────────────────────────────────────────────────────
+
+describe('B-STORAGE-HARDEN Wave D classifyPartition', () => {
+  it('MONTHLY name → kind=monthly, YYYY-MM label, whole-month range', () => {
+    const p = classifyPartition('xstock_spot_ticker_snap_2026_07')!;
+    expect(p.kind).toBe('monthly');
+    expect(p.partitionLabel).toBe('2026-07');
+    expect(p.rangeStart.toISOString()).toBe('2026-07-01T00:00:00.000Z');
+    expect(p.rangeEnd.toISOString()).toBe('2026-08-01T00:00:00.000Z');
+  });
+
+  it('DAILY name → kind=daily, YYYY-MM-DD label, single-day range', () => {
+    const p = classifyPartition('xstock_spot_ticker_snap_2026_08_01')!;
+    expect(p.kind).toBe('daily');
+    expect(p.partitionLabel).toBe('2026-08-01');
+    expect(p.rangeStart.toISOString()).toBe('2026-08-01T00:00:00.000Z');
+    expect(p.rangeEnd.toISOString()).toBe('2026-08-02T00:00:00.000Z');
+  });
+
+  it('★ a DAILY name is NEVER mis-classified as monthly (daily tested first)', () => {
+    const p = classifyPartition('xstock_spot_ticker_snap_2026_08_01')!;
+    expect(p.kind).toBe('daily'); // not 'monthly'
+    expect(p.partitionLabel).not.toBe('2026-08'); // must not read _08 as a month
+  });
+
+  it('★ a MONTHLY name is NEVER mis-classified as daily', () => {
+    expect(classifyPartition('xstock_spot_ticker_snap_2026_07')!.kind).toBe('monthly');
+  });
+
+  it('daily month-end rolls to the next month (2026-08-31 → [.., 2026-09-01))', () => {
+    const p = classifyPartition('xstock_spot_ticker_snap_2026_08_31')!;
+    expect(p.rangeStart.toISOString()).toBe('2026-08-31T00:00:00.000Z');
+    expect(p.rangeEnd.toISOString()).toBe('2026-09-01T00:00:00.000Z');
+  });
+
+  it('daily December rolls to the next year', () => {
+    const p = classifyPartition('xstock_spot_ticker_snap_2026_12_31')!;
+    expect(p.rangeEnd.toISOString()).toBe('2027-01-01T00:00:00.000Z');
+  });
+
+  it('B70 monthly analytics table name classifies as monthly', () => {
+    const p = classifyPartition('signal_eval_archive_2026_05')!;
+    expect(p.kind).toBe('monthly');
+    expect(p.partitionLabel).toBe('2026-05');
+  });
+
+  it('a table name with an embedded digit run is not confused (ohlc_1m monthly)', () => {
+    const p = classifyPartition('xstock_spot_ohlc_1m_2026_07')!;
+    expect(p.kind).toBe('monthly');
+    expect(p.partitionLabel).toBe('2026-07'); // the `1m` is not captured as the year
+  });
+
+  it('a table name with an embedded digit run is not confused (ohlc_1m daily)', () => {
+    const p = classifyPartition('xstock_spot_ohlc_1m_2026_08_05')!;
+    expect(p.kind).toBe('daily');
+    expect(p.partitionLabel).toBe('2026-08-05');
+  });
+
+  it('the bare parent name (no date suffix) → null', () => {
+    expect(classifyPartition('xstock_spot_ticker_snap')).toBeNull();
+  });
+
+  it('an impossible calendar date → null (rejects _02_30 and _13_01)', () => {
+    expect(classifyPartition('xstock_spot_ticker_snap_2026_02_30')).toBeNull();
+    expect(classifyPartition('xstock_spot_ticker_snap_2026_13_01')).toBeNull();
+    expect(classifyPartition('xstock_spot_ticker_snap_2026_13')).toBeNull(); // bad month, monthly shape
+  });
+});
+
+describe('B-STORAGE-HARDEN Wave D isPartitionEligible', () => {
+  // retention 30d, "now" = 2026-09-15 → cutoff = 2026-08-16, cutoffMonth = 2026-08-01
+  const cutoff = new Date('2026-08-16T00:00:00Z');
+  const cutoffMonth = new Date('2026-08-01T00:00:00Z');
+
+  it('MONTHLY eligible when its whole month is before the cutoff month', () => {
+    const july = classifyPartition('xstock_spot_ticker_snap_2026_07')!;
+    expect(isPartitionEligible(july, cutoff, cutoffMonth)).toBe(true);
+  });
+
+  it('MONTHLY NOT eligible for the cutoff month itself (not write-sealed)', () => {
+    const aug = classifyPartition('xstock_spot_ticker_snap_2026_08')!;
+    expect(isPartitionEligible(aug, cutoff, cutoffMonth)).toBe(false);
+  });
+
+  it('DAILY eligible when the whole day is at/older than the day-granular cutoff', () => {
+    // 2026-08-14 → rangeEnd 2026-08-15 <= cutoff 2026-08-16 → eligible
+    const d = classifyPartition('xstock_spot_ticker_snap_2026_08_14')!;
+    expect(isPartitionEligible(d, cutoff, cutoffMonth)).toBe(true);
+  });
+
+  it('DAILY boundary: rangeEnd exactly == cutoff → eligible', () => {
+    // 2026-08-15 → rangeEnd 2026-08-16 == cutoff → eligible (<=)
+    const d = classifyPartition('xstock_spot_ticker_snap_2026_08_15')!;
+    expect(isPartitionEligible(d, cutoff, cutoffMonth)).toBe(true);
+  });
+
+  it('DAILY NOT eligible when the day is too young (rangeEnd > cutoff)', () => {
+    // 2026-08-16 → rangeEnd 2026-08-17 > cutoff 2026-08-16 → NOT eligible
+    const d = classifyPartition('xstock_spot_ticker_snap_2026_08_16')!;
+    expect(isPartitionEligible(d, cutoff, cutoffMonth)).toBe(false);
+  });
+});
```

## NEW FILE: server/services/data-archive/daily-partition-cutover.ts
```ts
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-STORAGE-HARDEN Wave D (OBJ-3) — daily-partition cutover registry
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * `xstock_spot_ticker_snap` transitions from MONTHLY to DAILY RANGE partitions at
 * a MONTH-BOUNDARY cutover so the hot window can be reclaimed one DAY at a time
 * (a true rolling ~30 d) instead of one month at a time (monthly DROP can only
 * free whole months → up to ~60 d hot). This module is the SINGLE source of
 * truth for:
 *   - which tables are daily-partitioned, and
 *   - the UTC month-boundary date at/after which each table's partitions are DAILY.
 *
 * Consumed by BOTH partition creators so they never collide on the seam:
 *   - the DAILY creator (`b74-create-daily-partitions.ts`) makes `…_YYYY_MM_DD`
 *     children FROM the cutover forward;
 *   - the MONTHLY creator (`b74-create-monthly-partitions.ts`) EXCLUDES these
 *     tables for any month AT/AFTER the cutover, so a monthly `…_YYYY_MM` child
 *     is never created for a range the daily children own (an overlapping RANGE
 *     partition makes attach/insert fail — Langston Wave-D req #2).
 *
 * Transition-forward: months BEFORE the cutover stay monthly and age out under
 * the existing sweep; NO existing partition is repartitioned (the live ~63 GB
 * table is never rewritten). The cutover migration additionally drops any EMPTY
 * pre-created future monthly partitions at/after the cutover (the monthly
 * creator's 12-month look-ahead may already have made them).
 * ═════════════════════════════════════════════════════════════════════════════
 */

export interface DailyPartitionCutover {
  table: string;
  /** UTC month-boundary 'YYYY-MM-01'. Partitions are DAILY for days >= this. */
  cutoverDate: string;
}

export const DAILY_PARTITION_CUTOVERS: DailyPartitionCutover[] = [
  // Cutover = the first clean month-start after the Wave-D deploy (deploy
  // 2026-07-08 → cutover 2026-08-01). July-2026 + earlier stay monthly.
  { table: 'xstock_spot_ticker_snap', cutoverDate: '2026-08-01' },
];

/** The cutover Date (UTC midnight) for a table, or null if it is not daily-partitioned. */
export function cutoverForTable(table: string): Date | null {
  const row = DAILY_PARTITION_CUTOVERS.find((c) => c.table === table);
  return row ? new Date(`${row.cutoverDate}T00:00:00.000Z`) : null;
}

/**
 * True if `table` is daily-partitioned for the UTC month starting at `monthStart`
 * (i.e. `monthStart` is at/after the table's cutover). Drives the monthly
 * creator's exclusion so it never overlaps the daily children.
 */
export function isDailyPartitionedForMonth(table: string, monthStart: Date): boolean {
  const cutover = cutoverForTable(table);
  return cutover !== null && monthStart.getTime() >= cutover.getTime();
}
```

## NEW FILE: server/scripts/b74-create-daily-partitions.ts
```ts
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 / B-STORAGE-HARDEN Wave D — Daily Partition Creator (OBJ-3)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Runs DAILY at ~01:00 UTC via system cron. For each daily-partitioned table
 * (currently just `xstock_spot_ticker_snap`), pre-creates `…_YYYY_MM_DD` RANGE
 * partitions for a forward window [today .. today + LOOKAHEAD_DAYS], never before
 * that table's cutover. A 14-day look-ahead (Langston Wave-D req #3 — bumped
 * 7→14) means even a two-week cron stall can't leave a day unpartitioned, and an
 * empty daily partition is ~free. Self-heals the current day with a loud warning.
 *
 * The MONTHLY creator EXCLUDES these tables at/after the cutover (see
 * `daily-partition-cutover.ts`), so the monthly and daily jobs never create
 * overlapping RANGE children — an overlap makes inserts fail.
 *
 * Partition bounds use the SAME bare-date convention as the monthly creator
 * (`FROM ('YYYY-MM-DD') TO ('next-day')`) so the July-monthly ↔ August-daily
 * seam is continuous regardless of the DB session timezone (both bounds are
 * interpreted identically). The first daily partitions are also created by the
 * cutover migration, so day-1 is covered even before this cron first catches up;
 * CREATE … IF NOT EXISTS + a pg_class existence probe make that idempotent.
 *
 * Cron line (add to /etc/cron.d/dawntrader on staging server):
 *   0 1 * * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b74-create-daily-partitions.ts >> /var/log/dawntrader/b74-daily-partitions.log 2>&1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import {
  DAILY_PARTITION_CUTOVERS,
  cutoverForTable,
} from '../services/data-archive/daily-partition-cutover.js';

const LOOKAHEAD_DAYS = 14;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dailyPartitionName(table: string, d: Date): string {
  return `${table}_${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}`;
}

/** Bare-date bounds 'YYYY-MM-DD' → next day (matches the monthly creator). */
function dayBounds(d: Date): { start: string; end: string } {
  const next = new Date(d.getTime() + 86_400_000);
  const fmt = (x: Date) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  return { start: fmt(d), end: fmt(next) };
}

async function ensureDailyPartition(table: string, d: Date): Promise<{ created: boolean; name: string }> {
  const name = dailyPartitionName(table, d);
  const { start, end } = dayBounds(d);

  const existsResult = await db.execute(sql`
    SELECT 1 FROM pg_class WHERE relname = ${name} LIMIT 1
  `);
  const exists = (Array.isArray(existsResult) ? existsResult.length : (existsResult as any).rows?.length) > 0;
  if (exists) return { created: false, name };

  await db.execute(sql.raw(
    `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF ${table} FOR VALUES FROM ('${start}') TO ('${end}')`
  ));
  return { created: true, name };
}

async function main(): Promise<void> {
  const now = new Date();
  console.log(`[B74][daily-partitions] running at ${now.toISOString()}`);

  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let createdCount = 0;
  let selfHealedCount = 0;
  let skippedPreCutover = 0;

  for (const { table } of DAILY_PARTITION_CUTOVERS) {
    const cutover = cutoverForTable(table)!;
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const d = new Date(todayUtc.getTime() + i * 86_400_000);
      if (d.getTime() < cutover.getTime()) {
        // The daily scheme is not yet in effect for this day — the month is
        // still monthly-partitioned (owned by the monthly creator). Skip.
        skippedPreCutover++;
        continue;
      }
      const { created, name } = await ensureDailyPartition(table, d);
      if (created) {
        createdCount++;
        if (i === 0) {
          // Current day was missing — that's a self-heal (the daily cron should
          // have created it the prior run; loud so the operator notices a miss).
          selfHealedCount++;
          console.warn(`[B74][daily-partitions][SELF-HEAL] created missing CURRENT-day partition: ${name}`);
        } else {
          console.log(`[B74][daily-partitions] created forward partition: ${name}`);
        }
      }
    }
  }

  console.log(
    `[B74][daily-partitions] done. ${createdCount} new partitions created ` +
      `(${selfHealedCount} self-healed, ${skippedPreCutover} pre-cutover days skipped).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[B74][daily-partitions] FATAL:', err);
    process.exit(1);
  });
```

## NEW MIGRATION: 2026-07-08-b-storage-harden-wave-d-xstock-ticker-daily-cutover.sql
```sql
-- ═════════════════════════════════════════════════════════════════════════════
-- B-STORAGE-HARDEN Wave D (OBJ-3) — xstock_spot_ticker_snap monthly→daily cutover
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Transitions xstock_spot_ticker_snap from MONTHLY to DAILY RANGE partitions at a
-- MONTH boundary (cutover = 2026-08-01, the first clean month-start after the
-- Wave-D deploy on 2026-07-08) so the hot window is reclaimable one DAY at a time
-- (true rolling ~30 d) instead of whole months. TRANSITION-FORWARD: the ~63 GB
-- live table is NEVER repartitioned — July-2026 and earlier stay MONTHLY and age
-- out under the existing sweep; from the cutover, NEW partitions are DAILY.
--
-- Two steps, one transaction:
--   1. Drop any EMPTY pre-created future MONTHLY partitions at/after the cutover.
--      The monthly creator's 12-month look-ahead may already have made
--      xstock_spot_ticker_snap_2026_08 (…_09, …) — those would OVERLAP the daily
--      children and break inserts (Langston Wave-D req #2, the real seam risk).
--      They are FUTURE months = empty; ABORT LOUDLY if any holds rows.
--   2. Create the first 16 DAILY partitions (2026-08-01 … 2026-08-16) so day-1 is
--      covered even before the daily creator cron (0 1 * * *) first catches up.
--
-- Bounds use the SAME bare-date convention as the monthly creator so the
-- July-monthly [.., 2026-08-01) ↔ August-daily [2026-08-01, ..) seam abuts with
-- ZERO overlap regardless of DB session timezone.
--
-- ★ DEPLOY ORDER: apply this migration in the same deploy as the code that adds
--   the monthly-creator exclusion + the daily creator. After deploy, the monthly
--   cron no longer re-creates xstock_spot_ticker_snap monthlies at/after cutover,
--   so step 1's drops are not re-introduced.
--
-- Reference: B_STORAGE_HARDEN_WAVE_D_SCOPE.md + _PRE_AUDIT.md (OBJ-3). #430.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  cutover DATE := DATE '2026-08-01';
  r       RECORD;
  yr      INT;
  mo      INT;
  mstart  DATE;
  n       BIGINT;
  d       DATE;
  dname   TEXT;
BEGIN
  -- ── Step 1: drop empty future MONTHLY partitions at/after the cutover ────────
  FOR r IN
    SELECT child.relname AS child_name
      FROM pg_inherits
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
     WHERE parent.relname = 'xstock_spot_ticker_snap'
       AND child.relname ~ '_[0-9]{4}_[0-9]{2}$'        -- MONTHLY shape …_YYYY_MM
       AND child.relname !~ '_[0-9]{4}_[0-9]{2}_[0-9]{2}$'  -- exclude DAILY (defensive)
  LOOP
    yr := (substring(r.child_name from '_([0-9]{4})_[0-9]{2}$'))::INT;
    mo := (substring(r.child_name from '_[0-9]{4}_([0-9]{2})$'))::INT;
    mstart := make_date(yr, mo, 1);
    IF mstart >= cutover THEN
      EXECUTE format('SELECT count(*) FROM %I', r.child_name) INTO n;
      IF n > 0 THEN
        RAISE EXCEPTION
          'Wave-D cutover ABORT: monthly partition % holds % row(s) (expected an empty future month) — manual review required before cutover',
          r.child_name, n;
      END IF;
      EXECUTE format('ALTER TABLE xstock_spot_ticker_snap DETACH PARTITION %I', r.child_name);
      EXECUTE format('DROP TABLE %I', r.child_name);
      RAISE NOTICE 'Wave-D cutover: dropped empty future monthly partition %', r.child_name;
    END IF;
  END LOOP;

  -- ── Step 2: create the first 16 DAILY partitions from the cutover ────────────
  FOR i IN 0..15 LOOP
    d := cutover + i;
    dname := 'xstock_spot_ticker_snap_' || to_char(d, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF xstock_spot_ticker_snap FOR VALUES FROM (%L) TO (%L)',
      dname, d::TEXT, (d + 1)::TEXT
    );
    RAISE NOTICE 'Wave-D cutover: ensured daily partition % [%, %)', dname, d, (d + 1);
  END LOOP;
END $$;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Post-migration verification (deploy step):
--   -- No monthly partition at/after cutover remains:
--   SELECT child.relname FROM pg_inherits
--     JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
--     JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
--    WHERE parent.relname='xstock_spot_ticker_snap'
--      AND child.relname ~ '_2026_(0[8-9]|1[0-2])$';   -- expect 0 rows
--   -- 16 daily partitions exist:
--   SELECT count(*) FROM pg_inherits
--     JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
--     JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
--    WHERE parent.relname='xstock_spot_ticker_snap'
--      AND child.relname ~ '_2026_08_[0-9]{2}$';        -- expect 16
-- ═════════════════════════════════════════════════════════════════════════════
```

## NEW ROLLBACK (stays OUT of MANIFEST): ...-daily-cutover-rollback.sql
```sql
-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — B-STORAGE-HARDEN Wave D (OBJ-3) xstock_spot_ticker_snap daily cutover
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Reverts the monthly→daily cutover. ONLY safe/meaningful BEFORE data lands in
-- the daily partitions (i.e. before 2026-08-01, or a same-day abort). ABORTS
-- LOUDLY if any daily partition holds rows (dropping it would lose data — the
-- never-drop directive).
--
-- ★ Rolling back the DB is NOT enough: the CODE (monthly-creator exclusion +
--   daily creator) must ALSO be reverted, else the monthly creator keeps skipping
--   xstock_spot_ticker_snap at/after cutover and no August monthly partition is
--   maintained → inserts fail in August. Revert code + this SQL together.
--
-- Steps: (1) drop every EMPTY daily partition of xstock_spot_ticker_snap;
--        (2) recreate the 2026-08 MONTHLY partition (only if none of its days
--            held data — enforced by step 1's empty-check).
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  r     RECORD;
  n     BIGINT;
BEGIN
  -- Step 1: drop empty DAILY partitions (abort if any holds rows).
  FOR r IN
    SELECT child.relname AS child_name
      FROM pg_inherits
      JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
      JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
     WHERE parent.relname = 'xstock_spot_ticker_snap'
       AND child.relname ~ '_[0-9]{4}_[0-9]{2}_[0-9]{2}$'   -- DAILY shape
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.child_name) INTO n;
    IF n > 0 THEN
      RAISE EXCEPTION
        'Wave-D rollback ABORT: daily partition % holds % row(s) — cannot roll back without data loss',
        r.child_name, n;
    END IF;
    EXECUTE format('ALTER TABLE xstock_spot_ticker_snap DETACH PARTITION %I', r.child_name);
    EXECUTE format('DROP TABLE %I', r.child_name);
    RAISE NOTICE 'Wave-D rollback: dropped empty daily partition %', r.child_name;
  END LOOP;

  -- Step 2: recreate the 2026-08 monthly partition (now that its range is free).
  EXECUTE
    'CREATE TABLE IF NOT EXISTS xstock_spot_ticker_snap_2026_08 '
    'PARTITION OF xstock_spot_ticker_snap FOR VALUES FROM (''2026-08-01'') TO (''2026-09-01'')';
  RAISE NOTICE 'Wave-D rollback: recreated monthly partition xstock_spot_ticker_snap_2026_08';
END $$;

COMMIT;
```
