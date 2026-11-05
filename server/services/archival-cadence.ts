/**
 * B-DISK-FILE-TIERING (#1233) amendment 1, AP-2 / H-3 — the cadence-aware staleness test the
 * archival-health watchdog applies to each archive cron (`server/scripts/b-storage-archival-health.ts`).
 *
 * The old test was `log mtime age > graceMs`, a fixed grace per check. Checked once a day at 05:00Z it
 * could not catch one missed run of a daily job with a grace over 24 h, and it caught a missed monthly
 * rotator on the 4th, not the 1st. This asks the question the cron implies: was the log written at or
 * after the most recent scheduled fire? (`computePrevFire`, cron-parser `.prev()`, B-NEW-51.)
 *
 * SETTLE: the fire is taken at `now - settleMs`, so a run that has only just started is not judged.
 * ⚠️ INERT TODAY — stated so nobody cites it as a measured guard: the nearest subject fire is Monday 04:00Z,
 * 60 min before archival-health's own 05:00Z, and the measured first-write lag is 2-3 s. It becomes
 * load-bearing only if a check's cron lands within `settleMs` before 05:00Z (Langston, amendment 1 (b)).
 *
 * MISCONFIGURED is a verdict, never an exception and never a skip (Langston C-2): `computePrevFire` fails
 * safe to null (`cron-next-fire.ts`), and a null read as "due at 0" would pass every log silently.
 */
import { computePrevFire } from './cron-next-fire.js';

export const ARCHIVAL_SETTLE_MS = 15 * 60 * 1000;

export type CadenceVerdict =
  | { kind: 'ok'; dueMs: number }
  | { kind: 'stale'; dueMs: number }
  | { kind: 'misconfigured'; schedule: string };

/** `schedule` is a crontab expression in UTC (staging runs Etc/UTC). */
export function cadenceVerdict(
  schedule: string,
  logMtimeMs: number,
  nowMs: number,
  settleMs: number = ARCHIVAL_SETTLE_MS,
): CadenceVerdict {
  const due = computePrevFire(schedule, 'UTC', new Date(nowMs - settleMs));
  if (due === null || !Number.isFinite(due.getTime())) return { kind: 'misconfigured', schedule };
  const dueMs = due.getTime();
  return logMtimeMs >= dueMs ? { kind: 'ok', dueMs } : { kind: 'stale', dueMs };
}
