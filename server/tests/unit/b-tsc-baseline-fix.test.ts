/**
 * B-TSC-BASELINE-FIX (#579) — the CI tsc-baseline gate now keys on (file, code, MESSAGE),
 * closing the headroom hole where a NEW error hid under a stale (file,code) count ceiling.
 *
 * These are the three cases Langston required at Step-1 (the third is the on-paper proof
 * that message-identity [A] beats a no-headroom count invariant [B]):
 *   1. NEW distinct message UNDER the (file,code) ceiling → CAUGHT (the #579 incident;
 *      a per-(file,code)-COUNT gate passes it because the count stays under the ceiling).
 *   2. SAME message, shifted line → PASSES (a relocated error is not a new error).
 *   3. 1-FOR-1 SWAP (fix one message, add a distinct one, same file+code, count UNCHANGED)
 *      → CAUGHT by identity — a per-(file,code)-COUNT gate (approach B, even zero-headroom)
 *      would silently pass this; message-identity does not.
 */
import { describe, it, expect } from 'vitest';
import { parseErrors, computeDiff } from '../../../scripts/check-tsc-baseline.mjs';

// helper: build the baseline files[] shape from a nested {file:{code:{msg:n}}} map
const mkBaseline = (counts: Record<string, any>) =>
  Object.entries(counts).map(([path, errors]) => ({ path, errors }));

describe('B-TSC-BASELINE-FIX (#579) — message-identity gate', () => {
  it('parseErrors captures the primary-line message, nested by (file, code, message)', () => {
    const out = [
      "server/services/vts-runner.ts(4957,26): error TS2339: Property 'costFeeFraction' does not exist on type 'OpenVirtualTrade'.",
      "server/services/vts-runner.ts(4979,26): error TS2339: Property 'costFeeFraction' does not exist on type 'OpenVirtualTrade'.",
      "server/services/vts-runner.ts(4331,5): error TS2561: Object literal may only specify known properties, but 'quantPatternDetected' does not exist in type 'X'.",
    ].join('\n');
    const { counts, total } = parseErrors(out);
    expect(total).toBe(3);
    const f = counts['server/services/vts-runner.ts'];
    // two identical-message TS2339 → count 2 under one message key; one TS2561.
    expect(f['TS2339']["Property 'costFeeFraction' does not exist on type 'OpenVirtualTrade'."]).toBe(2);
    expect(Object.keys(f['TS2561']).length).toBe(1);
  });

  it('CASE 1 — a NEW distinct message UNDER the (file,code) ceiling is CAUGHT', () => {
    // Baseline: file has 5 TS2339s of message A (ceiling 5). Current: 3 of A + 1 NEW message B
    // → (file,code) count 4, UNDER the ceiling 5 (a count-gate would PASS). Identity catches B.
    const baseline = mkBaseline({ 'f.ts': { TS2339: { 'msg A': 5 } } });
    const current = { 'f.ts': { TS2339: { 'msg A': 3, 'msg B (new)': 1 } } };
    const { regressions } = computeDiff(current, baseline);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].message).toBe('msg B (new)');
  });

  it('CASE 2 — the SAME message (shifted line) PASSES (relocated, not new)', () => {
    const baseline = mkBaseline({ 'f.ts': { TS2339: { 'msg A': 2 } } });
    const current = { 'f.ts': { TS2339: { 'msg A': 2 } } }; // line shift does not change the message
    const { regressions, newPaths } = computeDiff(current, baseline);
    expect(regressions).toHaveLength(0);
    expect(newPaths).toHaveLength(0);
  });

  it('CASE 3 — the 1-FOR-1 SWAP (count unchanged, distinct message) is CAUGHT', () => {
    // Baseline: 1 TS2339 of message A. Current: 1 TS2339 of message B (A fixed, B added).
    // (file,code) count is UNCHANGED (1 → 1), so approach B / a count-gate PASSES it.
    // Message-identity catches B as a new error.
    const baseline = mkBaseline({ 'f.ts': { TS2339: { 'msg A': 1 } } });
    const current = { 'f.ts': { TS2339: { 'msg B (new)': 1 } } };
    const { regressions } = computeDiff(current, baseline);
    expect(regressions).toHaveLength(1);
    expect(regressions[0].message).toBe('msg B (new)');
    // sanity: the per-(file,code) TOTAL count is unchanged — a count gate would miss this.
    const total = (o: any) => Object.values(o['f.ts'].TS2339).reduce((s: number, n: any) => s + n, 0);
    expect(total(current)).toBe(1);
  });

  it('a count-RISE on the same message is still caught', () => {
    const baseline = mkBaseline({ 'f.ts': { TS2339: { 'msg A': 1 } } });
    const current = { 'f.ts': { TS2339: { 'msg A': 2 } } };
    const { regressions } = computeDiff(current, baseline);
    expect(regressions).toHaveLength(1);
    expect(regressions[0]).toMatchObject({ baseline: 1, current: 2 });
  });
});
