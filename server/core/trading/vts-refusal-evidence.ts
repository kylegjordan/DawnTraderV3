/** Durable evidence for an exact VTS refusal streak. Wall time after a restart adds no evidence. */
interface RefusalIdentity {
  tradeId: string;
  streakId: string;
}

interface FirstRefusal {
  symbol: string;
  assetClass: string;
  firstAtMs: number;
  firstReason: string;
  thresholdMs: number;
}

export interface VtsRefusalCrossing {
  pageSinceMs: number;
  observedAtMs: number;
  reason: string;
  feedCoverage: {
    key: string;
    generation: number;
    startMs: number;
    endMs: number;
    cutMs: number;
    subscribed: number;
    qualified: number;
  } | null;
}

export type VtsRefusalEvent = RefusalIdentity & (
  | ({ kind: 'first' } & FirstRefusal)
  | { kind: 'paging'; pageSinceMs: number }
  | ({ kind: 'crossing' } & VtsRefusalCrossing)
  | { kind: 'decided'; atMs: number }
);

export interface VtsRefusalEvidence extends RefusalIdentity, FirstRefusal {
  pagingStarts: number[];
  crossings: VtsRefusalCrossing[];
  decidedAtMs: number | null;
}

/** Missing predecessors prove nothing. Replays preserve the first confirmed observation for each run. */
export function applyVtsRefusalEvidence(
  previous: VtsRefusalEvidence | undefined, event: VtsRefusalEvent,
): VtsRefusalEvidence | undefined {
  if (event.kind === 'first') {
    if (previous) return previous;
    const { kind, ...exposure } = event;
    return { ...exposure, pagingStarts: [], crossings: [], decidedAtMs: null };
  }
  if (!previous || previous.tradeId !== event.tradeId || previous.streakId !== event.streakId
    || previous.decidedAtMs !== null) return previous;

  if (event.kind === 'decided') {
    const lastCrossing = previous.crossings.at(-1)?.observedAtMs ?? previous.firstAtMs;
    const lastPagingStart = previous.pagingStarts.at(-1) ?? previous.firstAtMs;
    return event.atMs >= Math.max(lastCrossing, lastPagingStart) ? { ...previous, decidedAtMs: event.atMs } : previous;
  }

  const lastStart = previous.pagingStarts.at(-1);
  if (event.kind === 'paging') {
    if (event.pageSinceMs < previous.firstAtMs
      || (lastStart !== undefined && event.pageSinceMs <= lastStart)) return previous;
    return { ...previous, pagingStarts: [...previous.pagingStarts, event.pageSinceMs] };
  }

  if (event.pageSinceMs !== lastStart || event.observedAtMs - event.pageSinceMs < previous.thresholdMs
    || previous.crossings.at(-1)?.pageSinceMs === event.pageSinceMs) return previous;
  const { pageSinceMs, observedAtMs, reason, feedCoverage } = event;
  return { ...previous, crossings: [...previous.crossings, { pageSinceMs, observedAtMs, reason, feedCoverage }] };
}
