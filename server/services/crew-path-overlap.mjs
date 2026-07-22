/**
 * B-CREW-COORD (#554) — THE SINGLE SOURCE OF PATH-OVERLAP TRUTH.
 *
 * ★ WHY THIS IS A `.mjs` AND NOT PART OF THE `.ts` SERVICE (Langston-ruled, Step-4):
 *   THREE call sites need this matcher — the board store (`crew-coordination.ts`),
 *   the `crew claim` preview (`scripts/crew.ts`), and the PreToolUse commit guard
 *   (`.claude/hooks/guard-bare-commit.mjs`). The guard is plain `.mjs` run directly
 *   by node with NO build step, so it cannot import TypeScript. Keeping the logic
 *   here — pure JS, zero dependencies, no DB, no clock — lets all three import the
 *   SAME function instead of hand-rolling the match a third time.
 *
 *   That matters specifically: this exact prefix-matching logic has TWICE produced
 *   false positives that landed on the people documenting the guard, and *a control
 *   whose false positives punish its own upkeep gets silenced*. One implementation,
 *   one test suite, no drift.
 *
 * Types live alongside in `crew-path-overlap.d.mts` (no `allowJs` needed).
 */

/**
 * Normalise a path for prefix comparison: strip any trailing slash so that
 * `server/core` and `server/core/` behave identically.
 *
 * ★ This is the bug Langston caught at Step-4: an earlier inline copy appended
 *   `'/'` unconditionally, so a claim recorded as `server/core/` became
 *   `server/core//` and silently matched NOTHING. A claim that matches nothing
 *   is indistinguishable from no claim at all — the absent-as-valid shape again.
 */
function norm(p) {
  return p.endsWith('/') ? p.slice(0, -1) : p;
}

/**
 * Does `container` cover `candidate`? True when they are the same path, or when
 * `candidate` sits beneath `container` as a DIRECTORY.
 *
 * ★ The boundary check is what stops `server/core` from capturing
 *   `server/core-extras/thing.ts`. A bare `startsWith` would match that sibling
 *   and produce exactly the false positive that gets this control disabled.
 */
export function pathCovers(container, candidate) {
  const c = norm(container);
  const x = norm(candidate);
  return x === c || x.startsWith(c + '/');
}

/**
 * Do two paths overlap in EITHER direction — i.e. would work on one plausibly
 * touch the other? Used when PREVIEWING a claim, where the caller has not yet
 * decided which is the broader scope.
 *
 * ★ Deliberately different from `pathCovers`, and the difference is the point:
 *   the commit guard asks the UNIDIRECTIONAL question (does an existing claim
 *   cover this staged file?), while a claim preview asks the SYMMETRIC one
 *   (does anything I am about to claim collide with anything already held?).
 *   Claiming `server/core` when someone holds `server/core/rtb/x.ts` IS a
 *   collision, even though the existing claim does not cover my path.
 */
export function pathsOverlapEitherWay(a, b) {
  return pathCovers(a, b) || pathCovers(b, a);
}
