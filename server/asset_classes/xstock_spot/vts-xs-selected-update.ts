interface SourceIdentity {
  bootId: string;
  generation: number;
  acknowledgedAtMs: number;
}

export interface SelectedXstockTickerRow {
  rowId: string;
  metadata: unknown;
  selectedAtMs: number;
}

export interface SelectedXstockUpdate {
  rowId: string;
  bootId: string;
  generation: number;
  frameOrdinal: number;
  rowOrdinal: number;
  receivedAtMs: number;
  selectedAtMs: number;
  acceptedAtMs: number;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

/** A guard acceptance alone can include replays. Attest the exact persisted update selected for that look. */
export function linkSelectedXstockUpdate(
  row: SelectedXstockTickerRow,
  current: SourceIdentity | null,
  acceptedAtMs: number,
): SelectedXstockUpdate | null {
  if (!current || typeof row.rowId !== 'string' || !/^[1-9]\d*$/.test(row.rowId)) return null;
  const source = record(record(row.metadata)?.equityTickerSource);
  if (!source || source.role !== 'update' || source.verifiedUpdate !== true
    || source.bootId !== current.bootId || source.generation !== current.generation) return null;
  const { frameOrdinal, rowOrdinal, receivedMonotonicMs } = source;
  if (typeof frameOrdinal !== 'number' || !Number.isSafeInteger(frameOrdinal) || frameOrdinal < 1
    || typeof rowOrdinal !== 'number' || !Number.isSafeInteger(rowOrdinal) || rowOrdinal < 0
    || typeof receivedMonotonicMs !== 'number'
    || !Number.isFinite(receivedMonotonicMs) || !Number.isFinite(row.selectedAtMs) || !Number.isFinite(acceptedAtMs)
    || receivedMonotonicMs < current.acknowledgedAtMs || receivedMonotonicMs > row.selectedAtMs
    || row.selectedAtMs > acceptedAtMs) return null;
  return {
    rowId: row.rowId, bootId: current.bootId, generation: current.generation, frameOrdinal, rowOrdinal,
    receivedAtMs: receivedMonotonicMs, selectedAtMs: row.selectedAtMs, acceptedAtMs,
  };
}
