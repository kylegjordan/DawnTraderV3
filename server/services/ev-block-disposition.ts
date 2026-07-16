/**
 * [11.8B] EV open-disposition routing (Kyle override + Langston live carve-out,
 * 2026-07-16 — pure + standalone so the label integrity is unit-FENCED without
 * importing the engine's module graph):
 *   SHADOW                 — paper, snapshot present: observe/alarm, never block.
 *   BLOCK_EV_REJECT        — live, snapshot present + non-positive: the real-money
 *                            fail-safe retained pending Kyle's #522 ratification.
 *   BLOCK_SNAPSHOT_MISSING — snapshot NULL (either mode): data-integrity refusal.
 * The caller only consults this when the effective EV verdict is non-tradeable;
 * the function itself is verdict-agnostic routing.
 */
export type EvBlockDisposition = 'SHADOW' | 'BLOCK_EV_REJECT' | 'BLOCK_SNAPSHOT_MISSING';

export function resolveEvBlockDisposition(
  chosenNetEv: number | null,
  mode: 'paper' | 'live',
): EvBlockDisposition {
  if (chosenNetEv == null) return 'BLOCK_SNAPSHOT_MISSING';
  return mode === 'paper' ? 'SHADOW' : 'BLOCK_EV_REJECT';
}
