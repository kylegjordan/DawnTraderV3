/** Durable evidence for an exact VTS refusal streak. Wall time after a restart adds no evidence. */
interface RefusalIdentity {
  tradeId: string;
  streakId: string;
}

interface FirstRefusal {
  runId?: string;
  symbol: string;
  assetClass: string;
  firstAtMs: number;
  firstReason: string;
  thresholdMs: number;
}

interface RefusalDisposition {
  alertId: string;
  route: 'joined' | 'incident' | 'individual';
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
  disposition?: RefusalDisposition;
}

export type VtsRefusalEvent = RefusalIdentity & (
  | ({ kind: 'first' } & FirstRefusal)
  | { kind: 'paging'; pageSinceMs: number }
  | ({ kind: 'crossing' } & Omit<VtsRefusalCrossing, 'disposition'>)
  | { kind: 'decided'; atMs: number }
  | { kind: 'closed' }
  | { kind: 'disposition'; pageSinceMs: number; disposition: RefusalDisposition }
);

export interface VtsRefusalEvidence extends RefusalIdentity, FirstRefusal {
  pagingStarts: number[];
  crossings: VtsRefusalCrossing[];
  decidedAtMs: number | null;
  closed?: true;
}

export const VTS_REFUSAL_RECEIPT_PREFIX = 'vtsRefusalCrossing:';
export const vtsRefusalReceiptField = (streakId: string, pageSinceMs: number) =>
  `${VTS_REFUSAL_RECEIPT_PREFIX}${streakId}:${pageSinceMs}`;

export function isProvedVtsRefusalCrossing(refusal: VtsRefusalEvidence, crossing: VtsRefusalCrossing): boolean {
  return Number.isFinite(refusal.firstAtMs) && Number.isFinite(refusal.thresholdMs) && refusal.thresholdMs > 0
    && Number.isFinite(crossing.pageSinceMs) && Number.isFinite(crossing.observedAtMs)
    && crossing.pageSinceMs >= refusal.firstAtMs && refusal.pagingStarts.includes(crossing.pageSinceMs)
    && crossing.observedAtMs - crossing.pageSinceMs >= refusal.thresholdMs;
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
    || previous.decidedAtMs !== null || previous.closed) return previous;

  if (event.kind === 'closed') return { ...previous, closed: true };

  if (event.kind === 'disposition') {
    const crossing = previous.crossings.find((item) => item.pageSinceMs === event.pageSinceMs);
    if (!crossing || crossing.disposition || !isProvedVtsRefusalCrossing(previous, crossing)) return previous;
    const crossings = previous.crossings.map((item) =>
      item === crossing ? { ...item, disposition: event.disposition } : item);
    return { ...previous, crossings };
  }

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

  if (event.pageSinceMs !== lastStart || !isProvedVtsRefusalCrossing(previous, event)
    || previous.crossings.at(-1)?.pageSinceMs === event.pageSinceMs) return previous;
  const { pageSinceMs, observedAtMs, reason, feedCoverage } = event;
  return { ...previous, crossings: [...previous.crossings, { pageSinceMs, observedAtMs, reason, feedCoverage }] };
}
