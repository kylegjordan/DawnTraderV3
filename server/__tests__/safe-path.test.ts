import { describe, it, expect } from 'vitest';
import path from 'path';
import { resolveWithin, UnsafePathError } from '../services/safe-path';

// B-SEC-HARDEN (#1022): the containment guard for the report/download handlers.
// These assert the function's behaviour on plain inputs — no server, no filesystem.
describe('resolveWithin — containment guard', () => {
  const base = path.join(process.cwd(), 'reports');

  it('accepts a plain in-directory basename and returns a contained path', () => {
    const out = resolveWithin(base, 'CSAV_Report_2026-09-30.json');
    expect(out).toBe(path.join(base, 'CSAV_Report_2026-09-30.json'));
    expect(out.startsWith(base + path.sep)).toBe(true);
  });

  it('rejects a name that carries the report prefix/suffix but walks up with ..', () => {
    // This is the shape the old startsWith/endsWith checks let through.
    expect(() => resolveWithin(base, 'CSAV_Report_../../secret.json')).toThrow(UnsafePathError);
  });

  it('rejects a forward-slash path segment', () => {
    expect(() => resolveWithin(base, 'sub/child.json')).toThrow(UnsafePathError);
  });

  it('rejects a backslash path segment', () => {
    expect(() => resolveWithin(base, 'sub\\child.json')).toThrow(UnsafePathError);
  });

  it('rejects a bare parent reference', () => {
    expect(() => resolveWithin(base, '..')).toThrow(UnsafePathError);
  });

  it('rejects an absolute path', () => {
    expect(() => resolveWithin(base, '/etc/passwd')).toThrow(UnsafePathError);
  });

  it('rejects a NUL byte', () => {
    expect(() => resolveWithin(base, 'a\0.json')).toThrow(UnsafePathError);
  });

  it('rejects an empty name', () => {
    expect(() => resolveWithin(base, '')).toThrow(UnsafePathError);
  });
});
