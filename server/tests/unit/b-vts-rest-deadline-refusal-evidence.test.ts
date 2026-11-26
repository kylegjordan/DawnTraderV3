import { describe, expect, it } from 'vitest';
import {
  observePaperMakerRefusal,
  shouldPersistPaperMakerRefusal,
  type PaperMakerObservation,
  type PaperMakerRefusalEvidence,
} from '../../core/trading/paper-maker-refusal-evidence.js';

const epoch = { id: 'engine-start-a', periodMs: 4_000, wallAnchorMs: 100_000, monotonicAnchorMs: 1_000.125 };
const placement = { placedAtMs: 101_000, deadlineAtMs: 110_000 };

function observe(
  slot: number,
  previous?: PaperMakerRefusalEvidence,
  observation: PaperMakerObservation = 'upstream_refusal',
  options: { wallOffset?: number; monotonicOffset?: number; epochId?: string } = {},
) {
  const elapsedMs = slot * epoch.periodMs + 100;
  return observePaperMakerRefusal({ ...epoch, id: options.epochId ?? epoch.id }, placement, {
    slot, callbackNumber: slot, observation, wallAtMs: epoch.wallAnchorMs + elapsedMs + (options.wallOffset ?? 0),
    monotonicAtMs: epoch.monotonicAnchorMs + elapsedMs + (options.monotonicOffset ?? 0),
  }, previous);
}

describe('paper maker refusal evidence', () => {
  it('keeps an adjacent observed span through the deadline and its immediate usable look', () => {
    const first = observe(1);
    const second = observe(2, first);
    const third = observe(3, second);
    const recovery = observe(4, third, 'evaluated_side');
    expect(recovery.recovered).toEqual({ first: first.sample, last: third.sample, count: 3 });
    expect(recovery).toMatchObject({
      epochAnchorAtMs: epoch.wallAnchorMs,
      epochMonotonicAnchorMs: epoch.monotonicAnchorMs,
      sample: { monotonicAtMs: 17_100.125 },
    });
    expect([shouldPersistPaperMakerRefusal(first), shouldPersistPaperMakerRefusal(second, first),
      shouldPersistPaperMakerRefusal(third, second), shouldPersistPaperMakerRefusal(recovery, third)])
      .toEqual([true, false, true, true]);
  });

  it('withholds attribution if the engine or the exact pending position missed a slot', () => {
    const first = observe(1);
    const third = observe(3, first);
    expect(third.discontinuity).toBe('slot_gap');
    expect(third.refusing?.count).toBe(1);
    expect(observe(4, third, 'evaluated_side').recovered).toBeNull();
  });

  it('withholds attribution across clock jumps, late completions and repeated slots', () => {
    const first = observe(1);
    const second = observe(2, first);
    expect(observe(2, second).discontinuity).toBe('repeated_slot');
    expect(observe(3, second, 'upstream_refusal', { wallOffset: 1_001 }).discontinuity).toBe('clock');
    expect(observe(3, second, 'upstream_refusal', { monotonicOffset: 4_000 }).discontinuity).toBe('slot_time');
    const duplicate = observe(2, second);
    expect(observe(4, observe(3, duplicate), 'evaluated_side').recovered).toBeNull();
  });

  it('withholds adjacent credit from the immediate cycle and timer replacements', () => {
    expect(observe(0).refusing).toBeNull();
    const old = observe(2, observe(1));
    const replaced = observe(3, old, 'upstream_refusal', { epochId: 'engine-start-b' });
    expect(replaced.discontinuity).toBe('epoch');
    expect(replaced.refusing?.count).toBe(1);
    expect(observe(4, replaced, 'evaluated_side', { epochId: 'engine-start-b' }).recovered).toBeNull();
  });

  it('does not credit null-side or quiet/cold outcomes as refusal or usable recovery', () => {
    const span = observe(3, observe(2, observe(1)));
    for (const observation of ['null_side', 'venue_quiet_or_cold'] as const) {
      const result = observe(4, span, observation);
      expect(result.refusing).toBeNull();
      expect(result.recovered).toBeNull();
      expect(shouldPersistPaperMakerRefusal(result, span)).toBe(true);
    }
  });

  it('requires pre- and post-deadline refusals outside clock uncertainty', () => {
    const uncertain = observe(3, observe(2, observe(1)), 'upstream_refusal', { wallOffset: -1_200, monotonicOffset: -800 });
    expect(uncertain.discontinuity).toBe('slot_time');
    const nearDeadlinePlacement = { placedAtMs: 101_000, deadlineAtMs: 111_500 };
    const second = { ...observe(2).sample };
    const third = { ...observe(3).sample };
    const fourth = { ...observe(4, undefined, 'evaluated_side').sample };
    const pre = observePaperMakerRefusal(epoch, nearDeadlinePlacement, second);
    const near = observePaperMakerRefusal(epoch, nearDeadlinePlacement, third, pre);
    expect(near.refusing?.count).toBe(2);
    expect(observePaperMakerRefusal(epoch, nearDeadlinePlacement, fourth, near).recovered).toBeNull();
  });
});
