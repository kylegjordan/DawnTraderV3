/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-CREW-COORD — crew coordination board (RUNNING_ISSUES #554)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Three CC sessions plus Langston share ONE working tree. "Who holds the wrench"
 * is announced in chat, which works only if every session posts AND every other
 * session reads it in time — a practice you have to remember is not a control.
 * This makes it queryable state.
 *
 * ★ WHAT THIS DOES NOT CLAIM (Langston-ruled 2026-07-22 — repeated here so a
 *   reader of the code cannot over-read it): visibility + push serialization,
 *   NOT atomicity. It cannot close #557 (one session's commit capturing another's
 *   staged paths) — that is an index race, and in the case that occurred no
 *   coordination rule was broken by anyone. A GREEN BOARD IS NOT A GUARANTEE.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * TWO DELIBERATE DESIGN CHOICES, stated because both are load-bearing:
 *
 * 1. ★ READS FAIL OPEN. WRITES FAIL LOUD.
 *    A read failure that blocks committing is a worse outage than the collisions
 *    the board prevents (scope §3, Langston non-negotiable) — so `readBoard`
 *    returns a degraded result and never throws. But a WRITE that silently fails
 *    is worse than an error: it leaves a session believing it holds a claim that
 *    was never recorded, which is false confidence rather than no confidence.
 *    So claim/push-begin/release throw on failure. The asymmetry is the point.
 *
 * 2. ★ RAW PARAMETERISED SQL OVER A DEDICATED POOL — not the ORM, not `server/db.ts`.
 *    - `shared/schema.ts` is a hot shared file that other sessions edit; adding a
 *      table definition there to support the very tool meant to reduce collisions
 *      would be self-defeating.
 *    - `server/db.ts`'s pool is tuned for the TRADING path — resilient, long
 *      timeouts, retry-friendly. The board wants the opposite: fail FAST so a
 *      commit is never held up. Borrowing the trading pool would inherit the
 *      wrong failure posture.
 *    - Keeps the "no trading-path code reads this table" fence structural rather
 *      than merely stated.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import pg from 'pg';

const { Pool } = pg;

export type CrewKind = 'claim' | 'push';
export type CrewStatus = 'active' | 'released' | 'expired';

export interface CrewEntry {
  id: number;
  session: string;
  kind: CrewKind;
  paths: string[];
  status: CrewStatus;
  note: string | null;
  createdAt: Date;
  releasedAt: Date | null;
}

/**
 * A board read ALWAYS returns. `reachable: false` means we could not consult the
 * board — NOT that the board is empty. Callers must distinguish these: treating
 * unreachable as "nothing is held" is exactly the absent-as-valid class (#546).
 */
export interface BoardRead {
  reachable: boolean;
  entries: CrewEntry[];
  error?: string;
}

/** Board queries must never hold up a commit. Short, deliberate, not tunable-by-accident. */
const BOARD_CONNECT_TIMEOUT_MS = 4000;
const BOARD_QUERY_TIMEOUT_MS = 4000;

/** A claim older than this is reported STALE. It is never auto-deleted — see reapStale. */
export const STALE_CLAIM_AFTER_MS = 4 * 60 * 60 * 1000; // 4h

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set — the coordination board cannot be reached. ' +
        '(On staging: `set -a && . ./.env`.)',
    );
  }
  pool = new Pool({
    connectionString,
    max: 2,
    connectionTimeoutMillis: BOARD_CONNECT_TIMEOUT_MS,
    query_timeout: BOARD_QUERY_TIMEOUT_MS,
    statement_timeout: BOARD_QUERY_TIMEOUT_MS,
  });
  // A pool-level error with no listener crashes the process. The board must never
  // be the reason a session dies, so swallow here — per-query errors still surface.
  pool.on('error', () => {});
  return pool;
}

export async function closeBoard(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end().catch(() => {});
  }
}

function rowToEntry(r: Record<string, unknown>): CrewEntry {
  return {
    id: Number(r.id),
    session: String(r.session),
    kind: r.kind as CrewKind,
    paths: (r.paths as string[]) ?? [],
    status: r.status as CrewStatus,
    note: (r.note as string | null) ?? null,
    createdAt: r.created_at as Date,
    releasedAt: (r.released_at as Date | null) ?? null,
  };
}

/**
 * READ — fail-open. Never throws; returns `reachable: false` on any failure.
 * This is the call the commit guard makes, so it is the one that must not block.
 */
export async function readBoard(): Promise<BoardRead> {
  try {
    const res = await getPool().query(
      `SELECT id, session, kind, paths, status, note, created_at, released_at
         FROM crew_coordination
        WHERE status = 'active'
        ORDER BY kind, created_at`,
    );
    return { reachable: true, entries: res.rows.map(rowToEntry) };
  } catch (err) {
    return {
      reachable: false,
      entries: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * WRITE — fails loud. A claim you believe you hold but that was never recorded is
 * worse than a visible error.
 */
export async function claimPaths(
  session: string,
  paths: string[],
  note?: string,
): Promise<CrewEntry> {
  if (!session.trim()) throw new Error('claim requires a session name');
  if (paths.length === 0) throw new Error('claim requires at least one path');
  const res = await getPool().query(
    `INSERT INTO crew_coordination (session, kind, paths, note)
     VALUES ($1, 'claim', $2, $3)
     RETURNING id, session, kind, paths, status, note, created_at, released_at`,
    [session, paths, note ?? null],
  );
  return rowToEntry(res.rows[0]);
}

/**
 * WRITE — push serialization. At most one active push exists at a time, enforced by
 * the DATABASE (partial unique index), not by a check-then-insert here: a check in
 * application code is exactly the race this is meant to remove.
 *
 * Postgres unique-violation is SQLSTATE 23505 — translated to a readable message
 * that says WHO holds it, because "duplicate key value violates unique constraint"
 * tells the reader nothing actionable.
 */
export async function pushBegin(session: string, note?: string): Promise<CrewEntry> {
  if (!session.trim()) throw new Error('push-begin requires a session name');
  try {
    const res = await getPool().query(
      `INSERT INTO crew_coordination (session, kind, note)
       VALUES ($1, 'push', $2)
       RETURNING id, session, kind, paths, status, note, created_at, released_at`,
      [session, note ?? null],
    );
    return rowToEntry(res.rows[0]);
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === '23505') {
      const holder = await readBoard();
      const active = holder.entries.find((e) => e.kind === 'push');
      throw new Error(
        active
          ? `A push is already in progress: ${active.session} since ${active.createdAt.toISOString()}` +
            (active.note ? ` (${active.note})` : '') +
            `. Wait for it, or ask them to run: crew release --id ${active.id}`
          : 'A push is already in progress (holder could not be read back).',
      );
    }
    throw err;
  }
}

/**
 * WRITE — release. Sets released_at in the same statement as status, because the
 * table's CHECK constraint requires them to move together; that constraint is what
 * makes a release a visible transition rather than a silent delete.
 *
 * Returns the rows actually released, so a caller can tell "released 2" from
 * "released nothing" — a release that matched nothing is a real signal, not a no-op.
 */
export async function release(opts: {
  session?: string;
  id?: number;
  kind?: CrewKind;
}): Promise<CrewEntry[]> {
  if (opts.id === undefined && !opts.session) {
    throw new Error('release requires --id or --session');
  }
  const clauses: string[] = [`status = 'active'`];
  const params: unknown[] = [];
  if (opts.id !== undefined) {
    params.push(opts.id);
    clauses.push(`id = $${params.length}`);
  }
  if (opts.session) {
    params.push(opts.session);
    clauses.push(`session = $${params.length}`);
  }
  if (opts.kind) {
    params.push(opts.kind);
    clauses.push(`kind = $${params.length}`);
  }
  const res = await getPool().query(
    `UPDATE crew_coordination
        SET status = 'released', released_at = now()
      WHERE ${clauses.join(' AND ')}
      RETURNING id, session, kind, paths, status, note, created_at, released_at`,
    params,
  );
  return res.rows.map(rowToEntry);
}

/**
 * OBJ-5 — stale-claim handling that SURFACES rather than silently clears.
 *
 * ★ `dryRun: true` (the default) REPORTS and changes nothing. That default is the
 *   objective: the failure mode being designed against is a reaper that quietly
 *   clears someone's live claim, which is indistinguishable from the claim never
 *   having been made. Expiry is an explicit act, and it lands as a visible
 *   status transition WITH a timestamp (the table's CHECK enforces that), never
 *   a delete.
 */
export async function reapStale(opts: { dryRun?: boolean } = {}): Promise<{
  stale: CrewEntry[];
  expired: CrewEntry[];
}> {
  const dryRun = opts.dryRun !== false;
  const cutoffMs = STALE_CLAIM_AFTER_MS;
  const found = await getPool().query(
    `SELECT id, session, kind, paths, status, note, created_at, released_at
       FROM crew_coordination
      WHERE status = 'active'
        AND created_at < now() - ($1::bigint * INTERVAL '1 millisecond')
      ORDER BY created_at`,
    [cutoffMs],
  );
  const stale = found.rows.map(rowToEntry);
  if (dryRun || stale.length === 0) return { stale, expired: [] };

  const res = await getPool().query(
    `UPDATE crew_coordination
        SET status = 'expired', released_at = now()
      WHERE id = ANY($1::bigint[]) AND status = 'active'
      RETURNING id, session, kind, paths, status, note, created_at, released_at`,
    [stale.map((s) => s.id)],
  );
  return { stale, expired: res.rows.map(rowToEntry) };
}

/**
 * Which active claims held by OTHER sessions overlap the given paths.
 *
 * ★ Prefix-aware on purpose: a claim on a directory covers files beneath it, and a
 *   claim on a file is matched by that exact file. Compared on the actual staged
 *   path set by the caller — never on text matched out of a command string, which
 *   is the mistake `guard-bare-commit.mjs` has already made twice (scope §3).
 */
export function overlappingClaims(
  entries: CrewEntry[],
  stagedPaths: string[],
  selfSession: string,
): Array<{ entry: CrewEntry; paths: string[] }> {
  const out: Array<{ entry: CrewEntry; paths: string[] }> = [];
  for (const e of entries) {
    if (e.kind !== 'claim') continue;
    if (e.session === selfSession) continue;
    const hits = stagedPaths.filter((sp) =>
      e.paths.some((cp) => sp === cp || sp.startsWith(cp.endsWith('/') ? cp : cp + '/')),
    );
    if (hits.length > 0) out.push({ entry: e, paths: hits });
  }
  return out;
}
