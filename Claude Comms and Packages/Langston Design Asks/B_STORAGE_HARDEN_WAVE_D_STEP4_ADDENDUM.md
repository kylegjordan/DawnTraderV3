# Wave D Step-4 ADDENDUM — your two Finding items, built

Finding-1 (must-add test locking emergent daily-through-month-machinery correctness) + the call-site comment, AND
Finding-2 (daily-creator forward-coverage as a real post-deploy verification, not a comment) — both landed. Incremental diff below.

## Finding-2 → runway-depth check added to the archival-health watchdog (b-storage-archival-health.ts)
Independent process (runs 0 5 * * *, separate from the 0 1 daily creator — a dead creator can't alert on itself).
Fires a §10.5 alert when the furthest-provisioned daily partition is < 4 days ahead, OR when NONE exist at/after cutover.
```ts
/** Fire a §10.5 alert for a short/absent daily-partition runway (deduped per table). */
async function fireRunway(table: string, detail: string): Promise<void> {
  try {
    await addAlert({
      triggers_at: new Date(),
      category: 'health_check',
      severity: 'warning',
      title: `Daily-partition runway short: ${table}`,
      body:
        `The daily-partition creator (b74-create-daily-partitions.ts, cron 0 1 * * *) for "${table}" is not keeping ` +
        `enough forward daily partitions provisioned. ${detail} When the runway reaches 0, inserts into ${table} FAIL. ` +
        `Check the daily creator cron on staging and re-run it to self-heal forward coverage.`,
      metadata: {
        source: 'b-storage-archival-health',
        batch: 'B-STORAGE-HARDEN',
        check: 'daily-runway',
        table,
      },
      dedupe_key: `archival-health-daily-runway-${table}`,
    });
    console.log(`[archival-health] ALERT daily-runway/${table}: ${detail}`);
  } catch (err) {
    console.error(`[archival-health] failed to raise daily-runway alert for ${table}:`, err);
  }
}

/**
 * Daily-partition forward-coverage check (Langston Step-4 Finding-2). For each
 * daily-partitioned table that is AT/AFTER its cutover, find the furthest-forward
 * `…_YYYY_MM_DD` child and alert if it is fewer than MIN_RUNWAY_DAYS ahead of
 * today (or if NONE exist — creator never ran / migration missing). Pre-cutover
 * tables are skipped (their days are still monthly).
 */
async function checkDailyPartitionRunway(nowMs: number): Promise<boolean> {
  const now = new Date(nowMs);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (!process.env.DATABASE_URL) {
    console.log('[archival-health] daily-runway: DATABASE_URL unset — skip');
    return true;
  }
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  let ok = true;
  try {
    for (const { table } of DAILY_PARTITION_CUTOVERS) {
      const cutover = cutoverForTable(table)!;
      if (today.getTime() < cutover.getTime()) {
        console.log(
          `[archival-health] daily-runway ${table}: pre-cutover (${cutover.toISOString().slice(0, 10)}) — skip`,
        );
        continue;
      }
      const r = await client.query(
        `SELECT child.relname AS child
           FROM pg_inherits
           JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
           JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
          WHERE parent.relname = $1
            AND child.relname ~ '_[0-9]{4}_[0-9]{2}_[0-9]{2}$'`,
        [table],
      );
      let maxDay: Date | null = null;
      for (const row of r.rows) {
        const m = /_(\d{4})_(\d{2})_(\d{2})$/.exec(row.child);
        if (!m) continue;
        const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
        if (!maxDay || d.getTime() > maxDay.getTime()) maxDay = d;
      }
      if (!maxDay) {
        await fireRunway(
          table,
          `NO daily partitions exist at/after the ${cutover.toISOString().slice(0, 10)} cutover — the creator is not provisioning days.`,
        );
        ok = false;
        continue;
      }
      const daysAhead = Math.floor((maxDay.getTime() - today.getTime()) / DAY_MS);
      if (daysAhead < MIN_RUNWAY_DAYS) {
        await fireRunway(
          table,
          `the furthest-provisioned daily partition is only ${daysAhead} day(s) ahead (min ${MIN_RUNWAY_DAYS}).`,
        );
        ok = false;
      } else {
        console.log(`[archival-health] daily-runway ${table}: OK (${daysAhead} days ahead)`);
      }
    }
  } finally {
    await client.end().catch(() => {});
  }
  return ok;
}

async function main(): Promise<void> {
```

main() now also runs it:
```ts
  const runwayOk = await checkDailyPartitionRunway(nowMs);
  if (!runwayOk) allOk = false;
```
(I will ALSO make the daily-creator cron-install an explicit Step-6 deploy checklist item + schedule a one-off §13 forward-coverage verification alert dated ~Aug 1 at Step-7.)

## Finding-1 → call-site comment at b75-retention-sweep.ts (mode-derivation) + 2 golden tests
Comment paraphrase: a daily partitionLabel == its single day label, so listMonthLabels/deriveModeFromLabels/enumerateUtcDays all converge to that one label (whole==sliced==one object); regression-locked by the new test; keep green if refactoring those helpers.

New tests (bench: 31/31 green, tsc-baseline no regressions):
- 'adversarial MIXED-shape pass': monthly+daily children in ONE sweep, asserts EXACTLY [2026_07:monthly, 2026_08_14:daily] tier and the cutoff-month monthly + too-young daily do NOT.
- 'daily-partition ↔ month-machinery convergence' (3 cases): enumerateUtcDays→1 day & dayLabel==label; deriveModeFromLabels never trips the mix-guard; listMonthLabels-style match hits ONLY itself (no sibling-day/month bleed).
```ts
  it('★ adversarial MIXED-shape pass: monthly + daily children in one sweep, each tiers on its OWN rule', () => {
    // The literal Aug–Oct transition-window reality: old monthly partitions and
    // new daily partitions co-exist under the same parent. Prove each is
    // classified + tiered on its own granularity in a single pass (Langston Q4).
    const children = [
      'xstock_spot_ticker_snap_2026_07',    // monthly, before cutoffMonth → tier
      'xstock_spot_ticker_snap_2026_08',    // monthly, the cutoff month itself → NOT yet
      'xstock_spot_ticker_snap_2026_08_14', // daily, whole day past cutoff → tier
      'xstock_spot_ticker_snap_2026_08_16', // daily, too young → NOT yet
    ];
    const tiered = children
      .map((c) => ({ c, p: classifyPartition(c)! }))
      .filter(({ p }) => isPartitionEligible(p, cutoff, cutoffMonth))
      .map(({ c, p }) => `${c}:${p.kind}`);
    // Exactly the July monthly + the Aug-14 daily tier this pass; nothing mis-fires.
    expect(tiered).toEqual([
      'xstock_spot_ticker_snap_2026_07:monthly',
      'xstock_spot_ticker_snap_2026_08_14:daily',
    ]);
  });
});
```
