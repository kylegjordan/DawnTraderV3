/**
 * B-XSTOCK-SNAPSHOT-RETENTION — one source of truth for the live snapshot caps.
 *
 * These caps bound every cache/prewarm result.  Retention keeps at least the
 * same number of rows per symbol, so a prewarm can never recreate an archived
 * key.  The retained floor itself remains DB-governed and is validated against
 * these code-level consumer requirements before either writer or retention acts.
 */

export type XstockSnapshotInterval = 15 | 60;
export type XstockSnapshotTable =
  | 'xstock_spot_ohlc_15m_snapshot'
  | 'xstock_spot_ohlc_60m_snapshot';

export interface XstockSnapshotPolicy {
  intervalMinutes: XstockSnapshotInterval;
  label: '15m' | '60m';
  table: XstockSnapshotTable;
  liveCapRows: number;
  bucketSeconds: number;
}

export interface XstockSnapshotRetentionPolicy {
  hotRetentionDays: number;
  keepFloorRows: number;
}

export interface XstockSnapshotLifecycleConfig {
  byTable: Map<XstockSnapshotTable, XstockSnapshotRetentionPolicy>;
  mutationEnabled: boolean;
}

export const XSTOCK_SNAPSHOT_MUTATION_KEY = 'xstock_snapshot_retention.mutation_enabled' as const;

export const XSTOCK_SNAPSHOT_POLICIES: readonly XstockSnapshotPolicy[] = [
  {
    intervalMinutes: 15,
    label: '15m',
    table: 'xstock_spot_ohlc_15m_snapshot',
    liveCapRows: 240,
    bucketSeconds: 900,
  },
  {
    intervalMinutes: 60,
    label: '60m',
    table: 'xstock_spot_ohlc_60m_snapshot',
    liveCapRows: 60,
    bucketSeconds: 3600,
  },
] as const;

export function xstockSnapshotPolicy(intervalMinutes: XstockSnapshotInterval): XstockSnapshotPolicy {
  const policy = XSTOCK_SNAPSHOT_POLICIES.find((candidate) => candidate.intervalMinutes === intervalMinutes);
  if (!policy) throw new Error(`unsupported xStock snapshot interval: ${intervalMinutes}`);
  return policy;
}

export function assertSnapshotFloorCoversLiveCap(table: XstockSnapshotTable, keepFloorRows: number): void {
  const policy = XSTOCK_SNAPSHOT_POLICIES.find((candidate) => candidate.table === table);
  if (!policy) throw new Error(`unsupported xStock snapshot table: ${table}`);
  if (!Number.isInteger(keepFloorRows) || keepFloorRows < policy.liveCapRows) {
    throw new Error(
      `${table} keep-floor ${keepFloorRows} is below live cap ${policy.liveCapRows}; `
      + 'prewarm/retention refused before any write or delete',
    );
  }
}

export function xstockSnapshotLifecycleKeys(): string[] {
  return [
    ...XSTOCK_SNAPSHOT_POLICIES.flatMap((policy) => [
      `${policy.table}.hot_retention_days`,
      `${policy.table}.keep_floor_rows`,
    ]),
    XSTOCK_SNAPSHOT_MUTATION_KEY,
  ];
}

export function parseXstockSnapshotLifecycleConfig(
  values: ReadonlyMap<string, unknown>,
  narrowScopeNames: readonly string[],
): XstockSnapshotLifecycleConfig {
  const keys = new Set(xstockSnapshotLifecycleKeys());
  const narrow = narrowScopeNames.filter((name) => keys.has(name));
  if (narrow.length > 0) {
    throw new Error(
      `snapshot lifecycle keys must exist only at exact wildcard scope; found narrow rows for ${narrow.join(',')}`,
    );
  }

  const positiveInteger = (key: string): number => {
    const value = values.get(key);
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      throw new Error(`missing or invalid positive-integer data_lifecycle.${key}`);
    }
    return value;
  };

  const byTable = new Map<XstockSnapshotTable, XstockSnapshotRetentionPolicy>();
  for (const policy of XSTOCK_SNAPSHOT_POLICIES) {
    const hotRetentionDays = positiveInteger(`${policy.table}.hot_retention_days`);
    const keepFloorRows = positiveInteger(`${policy.table}.keep_floor_rows`);
    assertSnapshotFloorCoversLiveCap(policy.table, keepFloorRows);
    byTable.set(policy.table, { hotRetentionDays, keepFloorRows });
  }

  const mutationEnabled = values.get(XSTOCK_SNAPSHOT_MUTATION_KEY);
  if (typeof mutationEnabled !== 'boolean') {
    throw new Error(`missing or non-boolean data_lifecycle.${XSTOCK_SNAPSHOT_MUTATION_KEY}`);
  }
  return { byTable, mutationEnabled };
}
