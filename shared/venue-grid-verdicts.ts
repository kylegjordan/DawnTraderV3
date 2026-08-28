/**
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *  THE ONE HOME OF "WHOSE FAULT IS THIS GRID VERDICT?"  (F-G-1, Langston's r6 fold-in condition)
 * ══════════════════════════════════════════════════════════════════════════════════════════════
 *
 * ⛔⛔ THIS EXISTS BECAUSE THE ANSWER WAS WRITTEN TWICE — the server derived `isWiringBug` from an
 * inline literal, and the VTS panel hand-copied the same verdicts into its own `Set`. Two homes
 * for a decided rule is the defect `B-EPOCH-KEYING-PARITY` is held on, and my own sentence about
 * it landed on my own fix.
 *
 * ★ AND THE DEFAULT DIRECTION ON EXTENSION WAS THE WRONG ONE, which is what makes it worth a file
 * rather than a comment: a SIXTH verdict marked as ours on the server would have kept landing in
 * the client's "would fail the venue price grid" figure — i.e. re-creating CHANGES-NEEDED-4 one
 * release later, silently, with no test failing. Adding a verdict here now fixes both sides at
 * once. Impossible over intercepted; a parity test is the fallback we did not need.
 *
 * ⚠️ IMPORTED BY BOTH SIDES ON PURPOSE: `server/core/calculations/venue-price-grid.ts` derives
 * `GridTag.isWiringBug` from this set, and `client/src/components/vts/vts-filter-diagnostics-panel.tsx`
 * excludes it from the signal-quality figure.
 * ⛔ NEITHER MAY RE-STATE THE MEMBERSHIP LOCALLY — AND THAT SENTENCE IS NOW ENFORCED RATHER THAN
 * ASKED FOR. It was an unenforced rule when first written, which is the exact shape this file was
 * created to remove, one level up: a re-inline whose literal happened to MATCH passed the whole
 * suite (measured, 69/69). ★ I had told Langston those tests caught the re-inline; they caught
 * DRIFT AFTER one. The fence now requires the IMPORT at both consumer sites, comments stripped —
 * an inline literal cannot satisfy it.
 * ⛔ SO: ADD A VERDICT HERE, NEVER AT A CONSUMER. And when the membership changes, CHECK THE PROSE
 * that describes this bucket — the fence proves the SET is in step and nothing proves the wording
 * is, which is this defect's own original shape.
 */

/**
 * Verdicts that are OUR defect or OUR limitation, never a property of the signal.
 *
 * ⛔ THE TEST FOR MEMBERSHIP IS NOT "did it fail" — it is **"if this fires, is the SIGNAL the thing
 * that is wrong?"** If the answer is no, it belongs here, because everything outside this set is
 * counted against signal quality on a tab used to judge signals.
 */
export const VPG_WIRING_BUG_VERDICTS: ReadonlySet<string> = new Set([
  /** No venue grid could be resolved at all — a data-wiring gap, not a bad signal. */
  'grid_unknown',
  /** The VPG rounded and its own output was still off-grid — an arithmetic defect in the VPG. */
  'not_representable_after_rounding',
  /**
   * A well-formed SHORT, refused because that branch has never been exercised.
   * ⚠️ ADDED ON LANGSTON'S SECOND FOLD-IN, and it is a RECLASSIFICATION rather than a loosened
   * control: this is a POLICY limitation of ours, not a malformed signal. It sat outside the set,
   * so a refused short counted against SIGNAL QUALITY.
   * ★ n is ~0 today — zero shorts have ever been taken — so no number on any tab moves. The
   * classification is what is wrong-shaped, and it is wrong-shaped for the day shorts arrive,
   * which is exactly when nobody will be looking at this file.
   */
  'short_side_unexercised',
]);

/**
 * Verdicts that are not failures at all — the price was already on the grid, or rounding would
 * move it and the result is still a valid trade.
 * ⚠️ Kept beside the set above because the client needs BOTH to compute a would-fail figure, and
 * splitting them across two files would re-open the drift this file closes.
 */
export const VPG_NOT_A_FAILURE_VERDICTS: ReadonlySet<string> = new Set([
  'on_grid',
  'would_round',
]);
