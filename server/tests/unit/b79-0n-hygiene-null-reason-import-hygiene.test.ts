/**
 * B79.0n.HYGIENE — null-reason-tracker import hygiene regression test.
 *
 * Purpose: every TS file that USES setNullReason / getNullReason / resetNullReason
 * MUST import them from null-reason-tracker. Historical context: 64,494 occurrences
 * of "setNullReason is not defined" accumulated in staging PM2 error log across 304
 * restart cycles before the bundling issue self-resolved. The current source has
 * had the import continuously since Batch 31 (March 2026), but esbuild bundle output
 * has been non-deterministic across builds (tree-shaking + hoisting heuristics).
 *
 * This test fences against future drift by asserting: if a file references any
 * helper name in CODE (not comments, not string literals, not the definition file
 * itself), it must have a matching import statement.
 *
 * Pair with the boot-time round-trip smoke test in server/index.ts that catches
 * the deeper case of a bundling drift producing a no-op shim (set without store,
 * get returning unknown default, or set/get bound to different module instances).
 *
 * Known limitations (per Langston Step 4 review — both silent under-enforcement,
 * not false-blocks; tolerable since codebase doesn't currently exercise either):
 *   (a) `import * as X from '.../null-reason-tracker.js'` namespace-imports: the
 *       importRegex requires named-import braces, so a future namespace-import
 *       user would false-positive the assertion (codeRefCount sees X.setNullReason
 *       as a setNullReason word match in stripped code; importRegex misses it).
 *   (b) Template-literal `${setNullReason(...)}` interpolation: stripCommentsAndStrings
 *       removes the entire backtick-string contents, so helper calls inside `${...}`
 *       don't count as code-references. Low risk — helpers are sync state-setters.
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';

const HELPER_NAMES = ['setNullReason', 'getNullReason', 'resetNullReason'] as const;
const TRACKER_DEFINITION_FILE = 'null-reason-tracker.ts';

// Files in this list are EXPECTED to reference the helpers in JSDoc / comments
// without runtime use. The hygiene test should still exempt them from the
// "must have import" rule when the only matches are in comments/string literals.
// Currently empty — we check at runtime by stripping comments/strings.
const KNOWN_DOC_ONLY_FILES = new Set<string>([]);

/**
 * Strip JS/TS comments and string literals from a source file so that
 * grep-style helper-name detection matches CODE references only.
 */
function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const next = i + 1 < n ? src[i + 1] : '';
    // Line comment
    if (ch === '/' && next === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    // Block comment (includes JSDoc)
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    // String literal (single, double, backtick) — preserve as space-equivalent
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < n && src[i] !== quote) {
        if (src[i] === '\\' && i + 1 < n) i += 2;
        else i++;
      }
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Find every .ts file (excluding tests and node_modules) under the given root
 * that mentions any of the helper names anywhere (raw source — includes comments).
 */
function collectCandidateFiles(roots: string[]): string[] {
  const out: string[] = [];
  function walk(p: string): void {
    let s;
    try {
      s = statSync(p);
    } catch {
      return;
    }
    if (s.isDirectory()) {
      if (
        p.endsWith('node_modules') ||
        p.endsWith('dist') ||
        p.endsWith('.git') ||
        p.endsWith('build')
      )
        return;
      for (const child of readdirSync(p)) walk(join(p, child));
      return;
    }
    if (!p.endsWith('.ts')) return;
    if (p.endsWith('.d.ts')) return;
    // Skip the definition file itself
    if (p.endsWith(TRACKER_DEFINITION_FILE)) return;
    // Skip test files — they may legitimately reference helper names in describe/it strings
    if (p.includes(`${join('tests', 'unit')}`) || p.endsWith('.test.ts') || p.endsWith('.spec.ts'))
      return;
    const src = readFileSync(p, 'utf8');
    if (HELPER_NAMES.some((h) => src.includes(h))) out.push(p);
  }
  for (const r of roots) walk(r);
  return out;
}

describe('B79.0n.HYGIENE — null-reason-tracker import hygiene', () => {
  const repoRoot = resolve(__dirname, '..', '..', '..');
  const candidateFiles = collectCandidateFiles([
    join(repoRoot, 'server'),
    join(repoRoot, 'shared'),
  ]);

  it('discovers at least one user of the helpers (sanity check the walker found anything)', () => {
    expect(candidateFiles.length).toBeGreaterThan(0);
  });

  // Per-file assertion using describe.each — surfaces per-file failures clearly.
  for (const file of candidateFiles) {
    const relPath = file.replace(repoRoot, '').replace(/^[\\\/]+/, '');

    it(`${relPath} — import hygiene: code-references ⇒ import present`, () => {
      const raw = readFileSync(file, 'utf8');
      const codeOnly = stripCommentsAndStrings(raw);

      // Count CODE references (after stripping comments + string literals).
      // We use word-boundary regex to avoid matching e.g. "mySetNullReason".
      let codeRefCount = 0;
      for (const h of HELPER_NAMES) {
        const re = new RegExp(`\\b${h}\\b`, 'g');
        const matches = codeOnly.match(re);
        codeRefCount += matches ? matches.length : 0;
      }

      // If the only references are in comments / string literals (codeRefCount == 0),
      // this file is exempt — it's a doc reference, not a runtime use.
      if (codeRefCount === 0) {
        // No assertion needed; this file references the helpers only in docs/strings.
        return;
      }

      // Otherwise: must have an import line for the helpers.
      // Look for any import from a null-reason-tracker module path.
      const importRegex =
        /import\s*\{[^}]*\b(setNullReason|getNullReason|resetNullReason)\b[^}]*\}\s*from\s*['"][^'"]*null-reason-tracker[^'"]*['"]/;
      const hasImport = importRegex.test(raw);

      expect(hasImport).toBe(true);
      // If the assertion fails, the file uses a helper name without importing it.
      // Add the matching import to fix:
      //   import { setNullReason, getNullReason, resetNullReason } from '../utils/null-reason-tracker.js';
      // Adjust the relative path to suit the file's location.
    });
  }
});
