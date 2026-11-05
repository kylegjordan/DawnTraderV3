/**
 * [11.8B] EV open-disposition routing (Kyle override + Langston live carve-out,
 * 2026-07-16 — pure + standalone so the label integrity is unit-FENCED without
 * importing the engine's module graph):
 *   SHADOW                 — paper, snapshot present: observe/alarm, never block.
 *   BLOCK_EV_REJECT        — live, snapshot present + non-positive: the real-money
 *                            fail-safe retained pending Kyle's #522 ratification.
 * The caller only consults this when the effective EV verdict is non-tradeable;
 * the function itself is verdict-agnostic routing.
 *
 * B-ENTRY-GATE (#1224) P4b: the third outcome, BLOCK_SNAPSHOT_MISSING (snapshot NULL), is DELETED. It was unreachable:
 * the engine refuses a non-finite snapshot as POLICY_SNAPSHOT_MISSING before it calls this, so the argument is always a
 * finite number. The parameter is narrowed to `number`, so that is now enforced by the compiler rather than by the caller
 * (Langston r2 condition C-3). See DELETED_COMPONENTS_LOG.
 */
export type EvBlockDisposition = 'SHADOW' | 'BLOCK_EV_REJECT';

export function resolveEvBlockDisposition(mode: 'paper' | 'live'): EvBlockDisposition {
  // Step-4 r3 (Langston, rule 15): the EV argument was dead once the snapshot-missing outcome went — the verdict is the
  // caller's, and this routes by mode only. The parameter is removed rather than left `void`.
  return mode === 'paper' ? 'SHADOW' : 'BLOCK_EV_REJECT';
}
