/**
 * B-CREW-COORD (#554) — types for the shared path-overlap matcher.
 * Runtime lives in `crew-path-overlap.mjs`; see that file for WHY it is plain JS
 * (the PreToolUse commit guard is `.mjs` with no build step and must import the
 * same function rather than fork the logic a third time).
 */

/** Same path, or `candidate` sits beneath `container` as a directory. Trailing slashes normalised. */
export declare function pathCovers(container: string, candidate: string): boolean;

/** Overlap in EITHER direction — the symmetric question a claim preview asks. */
export declare function pathsOverlapEitherWay(a: string, b: string): boolean;
