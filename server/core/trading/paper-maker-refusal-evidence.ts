/** A monitor observation only. These values never participate in the maker decision. */
export type PaperMakerObservation =
  | 'upstream_refusal'
  | 'null_side'
  | 'venue_quiet_or_cold'
  | 'evaluated_side';

export interface PaperMakerMonitorEpoch {
  id: string;
  wallAnchorMs: number;
  monotonicAnchorMs: number;
  periodMs: number;
}

export interface PaperMakerMonitorSample {
  /** Zero is the immediate start pass, which does not count as a scheduled slot. */
  slot: number;
  wallAtMs: number;
  monotonicAtMs: number;
  observation: PaperMakerObservation;
}

type ContinuityBreak = 'epoch' | 'slot_gap' | 'repeated_slot' | 'slot_time' | 'clock' | 'placement';

interface PaperMakerRefusalSpan {
  first: PaperMakerMonitorSample;
  last: PaperMakerMonitorSample;
  count: number;
}

export interface PaperMakerRefusalEvidence {
  version: 1;
  epochId: string;
  epochAnchorAtMs: number;
  periodMs: number;
  placedAtMs: number;
  deadlineAtMs: number;
  sample: PaperMakerMonitorSample;
  discontinuity: ContinuityBreak | null;
  refusing: PaperMakerRefusalSpan | null;
  recovered: PaperMakerRefusalSpan | null;
}

function clockAllowanceMs(periodMs: number): number {
  return Math.min(1_000, periodMs / 4);
}

function sampleBreak(epoch: PaperMakerMonitorEpoch, sample: PaperMakerMonitorSample): ContinuityBreak | null {
  const { periodMs, wallAnchorMs, monotonicAnchorMs } = epoch;
  const { slot, wallAtMs, monotonicAtMs } = sample;
  if (!Number.isFinite(periodMs) || periodMs <= 0 || !Number.isFinite(wallAnchorMs)
    || !Number.isFinite(monotonicAnchorMs) || !Number.isFinite(wallAtMs) || !Number.isFinite(monotonicAtMs)) return 'clock';

  const elapsed = monotonicAtMs - monotonicAnchorMs;
  const slotStart = slot * periodMs;
  if (!Number.isSafeInteger(slot) || slot < 1 || elapsed < slotStart || elapsed >= slotStart + periodMs) return 'slot_time';
  return Math.abs(wallAtMs - wallAnchorMs - elapsed) > clockAllowanceMs(periodMs) ? 'clock' : null;
}

/** Retain one bounded span. Missing observations cannot contribute an inferred sample. */
export function observePaperMakerRefusal(
  epoch: PaperMakerMonitorEpoch,
  placement: { placedAtMs: number; deadlineAtMs: number },
  sample: PaperMakerMonitorSample,
  previous?: PaperMakerRefusalEvidence,
): PaperMakerRefusalEvidence {
  const { placedAtMs, deadlineAtMs } = placement;
  const samePlacement = previous?.placedAtMs === placedAtMs && previous.deadlineAtMs === deadlineAtMs;
  const sameEpoch = previous?.epochId === epoch.id && previous.periodMs === epoch.periodMs;
  const adjacent = samePlacement && sameEpoch && previous.sample.slot + 1 === sample.slot;
  let discontinuity = sampleBreak(epoch, sample);
  if (!Number.isFinite(placedAtMs) || !Number.isFinite(deadlineAtMs) || deadlineAtMs <= placedAtMs
    || sample.wallAtMs <= placedAtMs) discontinuity = 'placement';
  if (samePlacement && sameEpoch && sample.slot <= previous.sample.slot) discontinuity = 'repeated_slot';
  if (adjacent && sample.wallAtMs < previous.sample.wallAtMs) discontinuity = 'clock';
  const validSample = discontinuity === null;
  if (validSample && previous) {
    if (!samePlacement) discontinuity = 'placement';
    else if (!sameEpoch) discontinuity = 'epoch';
    else if (!adjacent) discontinuity = 'slot_gap';
  }

  const priorSpan = validSample && adjacent ? previous.refusing : null;
  const refusing = validSample && sample.observation === 'upstream_refusal'
    ? { first: priorSpan?.first ?? sample, last: sample, count: (priorSpan?.count ?? 0) + 1 }
    : null;
  const allowance = clockAllowanceMs(epoch.periodMs);
  const recovered = sample.observation === 'evaluated_side' && priorSpan
    && priorSpan.first.wallAtMs < deadlineAtMs - allowance && priorSpan.last.wallAtMs > deadlineAtMs + allowance
    ? priorSpan : null;
  return {
    version: 1, epochId: epoch.id, epochAnchorAtMs: epoch.wallAnchorMs, periodMs: epoch.periodMs, placedAtMs, deadlineAtMs,
    sample, discontinuity, refusing, recovered,
  };
}

/** Write edge and threshold changes only. Within a refusal run, the adjacent spans live in memory. */
export function shouldPersistPaperMakerRefusal(
  current: PaperMakerRefusalEvidence,
  previous?: PaperMakerRefusalEvidence,
): boolean {
  if (!previous || current.epochId !== previous.epochId || current.discontinuity || current.recovered) return true;
  if (current.sample.observation !== previous.sample.observation) return true;
  if (!current.refusing) return false;
  if (!previous.refusing) return true;

  const latestProvingTime = current.deadlineAtMs + clockAllowanceMs(current.periodMs);
  return current.sample.wallAtMs > latestProvingTime && previous.sample.wallAtMs <= latestProvingTime;
}
