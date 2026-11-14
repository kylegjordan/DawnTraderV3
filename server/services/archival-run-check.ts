/**
 * B-DISK-FILE-TIERING (#1233) amendment 2, AP-7 — the run-level verdict the archival-health watchdog applies to
 * each archive cron's log (`server/scripts/b-storage-archival-health.ts`). Pure functions: the script does the
 * reads (bounded tails of `<log>` and `<log>.1`, the root crontab) and the alerting.
 *
 * WHY (Langston's Step-4 finding on increment 6, plan r1-r4 in `B_DISK_FILE_TIERING_PRE_AUDIT.md`): the old check
 * took the LAST `DONE` in a 60-line tail with no tie to the run it belongs to. A run that died after its start line
 * read green on the previous run's DONE; a run that refused BEFORE its start line (five such exits in the census)
 * freshened the mtime and read green the same way; and a large run (3,418 lines on 2026-11-06) pushed its own start
 * out of the window. The rule now, from the watchdog's `archivalHealthRan` precedent: the LAST start must be at or
 * after the scheduled fire (`startMs >= dueMs`, tolerance 0 — measured lag +1.9 s to +3.7 s, n=178, none negative),
 * and a DONE must follow it. `failedTotal` is read from that DONE.
 *
 * ROTATION CONTRACT (C-3, B3, C-r4-1): the last start is searched in the live file, then in `<log>.1`; the DONE after
 * it in the same file after the start, then in the live file. That holds only while rotation keeps `<log>.1`
 * uncompressed and does not rotate an empty file — amendment 3's logrotate stanza must carry no `dateext`,
 * `compress` only with `delaycompress`, and `notifempty`.
 */

export const ARCHIVAL_TAIL_CAP_BYTES = 32 * 1024 * 1024;
export const UNVERIFIED_PAGE_AFTER_RUNS = 3;

/** A log's last bytes as text. `truncated` = the read started mid-file, so its first (partial) line was dropped. */
export function tailText(buf: Buffer, size: number): string {
  const text = buf.toString('utf-8');
  if (buf.length >= size) return text;
  const nl = text.indexOf('\n');
  return nl === -1 ? '' : text.slice(nl + 1);
}

function lines(text: string): string[] {
  return text.split('\n').map((l) => l.replace(/\r$/, '')).filter((l) => l.trim().length > 0);
}

export type RunVerdict =
  | { kind: 'ok'; doneLine: string; failedTotal: number; startIso: string }
  | { kind: 'not_started'; lastStartIso: string | null; dueIso: string; lastLine: string }
  | { kind: 'incomplete'; startIso: string; lastLine: string };

/**
 * `startPattern`'s FIRST capture group is the start line's ISO timestamp; `donePattern`'s capture groups are the
 * failure counts (summed). `live` / `rotated` are the bounded tails of `<log>` and `<log>.1` ('' when absent).
 */
export function evaluateRun(args: {
  live: string;
  rotated: string;
  startPattern: RegExp;
  donePattern: RegExp;
  dueMs: number;
}): RunVerdict {
  const live = lines(args.live);
  const rotated = lines(args.rotated);
  const lastLine = live.length ? live[live.length - 1] : rotated.length ? rotated[rotated.length - 1] : '(log empty)';
  const dueIso = new Date(args.dueMs).toISOString();

  const lastStart = (ls: string[]): number => {
    for (let i = ls.length - 1; i >= 0; i--) if (args.startPattern.test(ls[i])) return i;
    return -1;
  };
  let where: 'live' | 'rotated' | null = null;
  let idx = lastStart(live);
  if (idx >= 0) where = 'live';
  else {
    idx = lastStart(rotated);
    if (idx >= 0) where = 'rotated';
  }
  if (where === null) return { kind: 'not_started', lastStartIso: null, dueIso, lastLine };

  const startLine = (where === 'live' ? live : rotated)[idx];
  const iso = args.startPattern.exec(startLine)?.[1] ?? '';
  const startMs = Date.parse(iso);
  if (!Number.isFinite(startMs) || startMs < args.dueMs) {
    return { kind: 'not_started', lastStartIso: Number.isFinite(startMs) ? iso : null, dueIso, lastLine };
  }

  // The DONE after the start: in the start's own file after it; then (start in .1) anywhere in the live file,
  // which is newer than the whole of .1. The LAST such DONE is the run's.
  const after = where === 'live' ? live.slice(idx + 1) : [...rotated.slice(idx + 1), ...live];
  let doneLine: string | null = null;
  for (let i = after.length - 1; i >= 0; i--) {
    if (args.donePattern.test(after[i])) { doneLine = after[i]; break; }
  }
  if (doneLine === null) return { kind: 'incomplete', startIso: iso, lastLine };
  const m = args.donePattern.exec(doneLine);
  let failedTotal = 0;
  if (m) for (let g = 1; g < m.length; g++) failedTotal += Number(m[g] || 0);
  return { kind: 'ok', doneLine, failedTotal, startIso: iso };
}

/** Leading zeros stripped from every number and whitespace collapsed, so `15 02 * * *` equals `15 2 * * *`. */
export function normaliseSchedule(expr: string): string {
  return expr.trim().split(/\s+/).map((f) => f.replace(/\b0+(\d)/g, '$1')).join(' ');
}

export type CrontabSelection =
  | { kind: 'one'; schedule: string; line: string }
  | { kind: 'none' }
  | { kind: 'many'; lines: string[] };

/**
 * The subject's line in the root crontab: an ACTIVE line (comments `^\s*#` skipped) that appends to
 * `/var/log/dawntrader/<logFile>`. The schedule is its first five fields.
 */
export function selectCrontabLine(crontab: string, logFile: string): CrontabSelection {
  const target = `>> /var/log/dawntrader/${logFile}`;
  const hits = crontab
    .split('\n')
    .map((l) => l.replace(/\r$/, ''))
    .filter((l) => l.trim().length > 0 && !/^\s*#/.test(l))
    .filter((l) => {
      const at = l.indexOf(target);
      if (at === -1) return false;
      const next = l.charAt(at + target.length);
      return next === '' || /\s/.test(next); // the whole file name, not a prefix of a longer one
    });
  if (hits.length === 0) return { kind: 'none' };
  if (hits.length > 1) return { kind: 'many', lines: hits };
  const fields = hits[0].trim().split(/\s+/);
  return { kind: 'one', schedule: fields.slice(0, 5).join(' '), line: hits[0] };
}

export const UNVERIFIED_MARKER = '[archival-health] schedule_unverified';
const RUN_START = '[archival-health] started at ';

/**
 * How many consecutive PREVIOUS runs of archival-health itself logged `schedule_unverified`, read from the tails
 * of `archival-health.log` and its `.1` (C-r4-1: a rotation must not restart the count). The run whose start line
 * carries `currentStartIso` is excluded — the current run's own output is already in the file. A run with no
 * marker ends the streak.
 */
export function unverifiedStreak(args: { live: string; rotated: string; currentStartIso: string }): number {
  const all = [...lines(args.rotated), ...lines(args.live)];
  const runs: string[][] = [];
  for (const l of all) {
    if (l.startsWith(RUN_START)) runs.push([l]);
    else if (runs.length) runs[runs.length - 1].push(l);
  }
  const previous = runs.filter((r) => r[0] !== `${RUN_START}${args.currentStartIso}`);
  let streak = 0;
  for (let i = previous.length - 1; i >= 0; i--) {
    if (previous[i].some((l) => l.startsWith(UNVERIFIED_MARKER))) streak++;
    else break;
  }
  return streak;
}

/**
 * B-DISK-FILE-TIERING 3b (r5 edit 2): the `deferred=` value of every cold-rotator DONE line in a log text, in order.
 * A DONE line written before 3b carries no `deferred=` and reads as 0. archival-health pages when the last value is
 * > 0 and escalates when the one before it is also > 0.
 */
export function deferredFromRotatorLog(logText: string): number[] {
  const out: number[] = [];
  for (const line of logText.split('\n')) {
    const m = /\[B75 rotator\] DONE candidates=\d+ rotated=\d+ failed=\d+ bytes_moved=\d+(?: deferred=(\d+))?/.exec(line);
    if (m) out.push(m[1] === undefined ? 0 : Number(m[1]));
  }
  return out;
}
