/**
 * B-SIZING-DEC-RESTORE increment 3 (Langston's re-grade condition, 2026-09-29 16:28Z): read what the app has logged
 * SINCE an instant, without the two false misses a forward read has on staging.
 *
 * Measured by Langston on staging: `out.log` grows 13.1-22.1 MB a minute, and pm2-logrotate rotates it at 1 GB (about
 * every 45 minutes at that rate) by copying it to `out__<YYYY-MM-DD_HH-mm-ss>.log` and truncating the original.
 *  1. A forward read capped at N bytes stops seeing new lines once N bytes have been written — and the line being
 *     waited for is always at the NEW end. ⇒ when the cap binds, read the TAIL.
 *  2. A rotation after the offset was taken moves the line into the rotated file, and the live file restarts from 0.
 *     ⇒ on a shrink, also read the newest rotated sibling from the old offset.
 * Every read says what it did (`bytesSinceOffset`, `capped`, `rotated`), so a miss is attributable rather than
 * indistinguishable from "the line was never written".
 */
import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export const DEFAULT_CAP_BYTES = 8 * 1024 * 1024;

export interface LogReadReport {
  file: string;
  /** the size when the offset was taken; -1 = the file could not be read then */
  offset: number;
  size: number;
  /** bytes written since the offset (for a rotated file: in the live file plus the rotated sibling) */
  bytesSinceOffset: number;
  /** more was written than the cap: only the last `cap` bytes were read */
  capped: boolean;
  /** the live file shrank below the offset — it rotated after the offset was taken */
  rotated: boolean;
  /** the rotated sibling that was read, when one was found */
  rotatedFrom: string | null;
  /** the file could not be read now */
  error: string | null;
}

/** Byte sizes of `files` now (-1 when unreadable), for a later `readLogsSince`. */
export function logOffsets(files: string[]): Map<string, number> {
  return new Map(files.map((f) => {
    try { return [f, statSync(f).size] as [string, number]; } catch { return [f, -1] as [string, number]; }
  }));
}

function readRange(file: string, start: number, end: number): string {
  if (end <= start) return '';
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(end - start);
    readSync(fd, buf, 0, buf.length, start);
    return buf.toString('utf8');
  } finally { closeSync(fd); }
}

/** The newest pm2-logrotate sibling of `file` (`<name>__<date>.log`), or null. */
function newestRotatedSibling(file: string): string | null {
  const dir = dirname(file);
  const stem = basename(file).replace(/\.log$/, '');
  try {
    const candidates = readdirSync(dir)
      .filter((n) => n.startsWith(`${stem}__`) && n.endsWith('.log'))
      .map((n) => join(dir, n))
      .map((p) => ({ p, m: statSync(p).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    return candidates[0]?.p ?? null;
  } catch { return null; }
}

/**
 * What each file gained since `offsets`, reading at most `cap` bytes per file and always the NEWEST bytes. The returned
 * text concatenates the files; the report says, per file, what was read.
 */
export function readLogsSince(offsets: Map<string, number>, cap: number = DEFAULT_CAP_BYTES): { text: string; report: LogReadReport[] } {
  let text = '';
  const report: LogReadReport[] = [];
  for (const [file, offset] of offsets) {
    const r: LogReadReport = { file, offset, size: -1, bytesSinceOffset: 0, capped: false, rotated: false, rotatedFrom: null, error: null };
    report.push(r);
    if (offset < 0) { r.error = 'unreadable when the offset was taken'; continue; }
    try {
      const size = statSync(file).size;
      r.size = size;
      if (size >= offset) {
        const bytes = size - offset;
        r.bytesSinceOffset = bytes;
        r.capped = bytes > cap;
        text += readRange(file, Math.max(offset, size - cap), size);
      } else {
        // Rotated: the live file restarted. The part written between the offset and the rotation is in the sibling.
        r.rotated = true;
        const sibling = newestRotatedSibling(file);
        let siblingBytes = 0;
        if (sibling) {
          const ssize = statSync(sibling).size;
          siblingBytes = Math.max(0, ssize - offset);
          r.rotatedFrom = sibling;
          text += readRange(sibling, Math.max(offset, ssize - cap), ssize);
        }
        r.bytesSinceOffset = siblingBytes + size;
        r.capped = siblingBytes > cap || size > cap;
        text += readRange(file, Math.max(0, size - cap), size);
      }
    } catch (err) {
      r.error = err instanceof Error ? err.message : String(err);
    }
  }
  return { text, report };
}
