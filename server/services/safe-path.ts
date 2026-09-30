import path from 'path';

/**
 * Containment guard for any file path built from a caller-supplied name.
 *
 * B-SEC-HARDEN (#1022): three report/download handlers joined an untrusted
 * `filename` onto a base directory. Their `startsWith("X_Report_") && endsWith(".json")`
 * checks do NOT prevent traversal, because a name can carry the required prefix
 * and suffix and still contain `..` segments that walk out of the base directory
 * once `path.join` normalises it. This helper is the single containment rule the
 * download side of the app uses, so the check exists in one place, not three.
 *
 * It rejects, rather than sanitising: an out-of-bounds name is a bug or an
 * attempt, never something to silently rewrite into an in-bounds one.
 *
 * SCOPE, stated so callers do not over-trust it (Coltrane review, 2026-09-30):
 *  - This is LEXICAL containment. It does NOT resist a symlink: an accepted
 *    basename that names a symlink pointing outside the base still reads
 *    through it. On staging the base dirs are trusted and not attacker-writable,
 *    but do not rely on this helper where that is not true.
 *  - It is for callers that supply a plain basename. It deliberately rejects a
 *    legitimate nested name (e.g. `command_history/x.json`), so it must NOT be
 *    applied unchanged to writers that use subdirectories.
 *  - baseDir must be a real directory, not `/` (a `/` base makes the prefix
 *    check `//` and rejects valid children). No current caller uses `/`.
 *
 * @throws {UnsafePathError} if `name` is not a plain in-directory basename, or
 *         the resolved path is not strictly inside `baseDir`.
 * @returns the absolute, contained path.
 */
export class UnsafePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafePathError';
  }
}

export function resolveWithin(baseDir: string, name: string): string {
  if (typeof name !== 'string' || name.length === 0) {
    throw new UnsafePathError('empty filename');
  }
  // A download name is a single basename: no directory separators, no NUL,
  // no traversal, and not a `.`/`..` entry. This alone closes the reported
  // routes; the resolved-prefix check below is defence in depth.
  if (
    name.includes('/') ||
    name.includes('\\') ||
    name.includes('\0') ||
    name === '.' ||
    name === '..' ||
    name.split(/[/\\]/).some((seg) => seg === '..')
  ) {
    throw new UnsafePathError('filename must be a plain basename with no path segments');
  }
  const base = path.resolve(baseDir);
  const resolved = path.resolve(base, name);
  // Defence in depth, NOT the load-bearing check (Langston review 2026-09-30): once the
  // separator/NUL/`..` rejection above has passed, `resolved === path.join(base, name)` always
  // holds, so this branch is dead-but-harmless on POSIX. It stays as a second net; the basename
  // rejection is what actually closes the traversal.
  if (resolved !== path.join(base, name) || !resolved.startsWith(base + path.sep)) {
    throw new UnsafePathError('resolved path escapes its base directory');
  }
  return resolved;
}
