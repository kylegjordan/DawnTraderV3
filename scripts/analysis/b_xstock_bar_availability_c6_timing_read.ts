/**
 * B-XSTOCK-BAR-AVAILABILITY C6 - timing read over the widest SURVIVING span. NOT A GRADE.
 *
 * Why this exists (2026-11-20): the capacity gate always reads from the governed
 * `graded_window_start` (2026-11-09T00:05Z). The nightly B75 sweep has already dropped the
 * 11-09, 11-10 and 11-11 revision-event partitions, so the gate's first chunk finds 926,329 of
 * 926,329 links absent, exceeds EXACTNESS_MAX_IDS and returns INCONCLUSIVE in ~3 s (staging run
 * 2026-11-20T08:07:54Z, exit 3). That is the gate behaving as designed - it never grinds an
 * unbounded lookup - but it means the gate cannot time itself over the governed window.
 *
 * This harness times the SAME deployed reader functions (it imports them from the deploy clone,
 * so the code timed is the deployed code) from a later start: the first surviving partition.
 * Same connection shape as the gate: named `application_name`, one REPEATABLE READ READ ONLY
 * snapshot, lock_timeout, the same 20-minute budget object. It writes nothing.
 *
 * Usage (staging, as deploy, with the app env loaded):
 *   node_modules/.bin/tsx <this file> --repo /home/deploy/dawntrader --span-start 2026-11-12T00:00:00Z
 */
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

function arg(name: string): string {
  const i = process.argv.indexOf(name);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (!v) throw new Error(`${name} is required`);
  return v;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const repo = arg('--repo');
  const spanStart = new Date(arg('--span-start'));
  if (!Number.isFinite(spanStart.getTime())) throw new Error('--span-start must be an ISO timestamp');

  const req = createRequire(`${repo}/package.json`);
  const pg = req('pg') as typeof import('pg');
  const reader = await import(pathToFileURL(`${repo}/server/scripts/b-xstock-bar-availability-gate-read.ts`).href);

  const budget = reader.startBudget();
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    application_name: 'xstock-bar-availability-c6-timing-read',
  });
  await client.connect();
  const legs: Array<Record<string, unknown>> = [];
  const t0 = Date.now();
  let outcome: Record<string, unknown> = { state: 'completed' };
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL lock_timeout = ${reader.GATE_READ_BUDGET.lockTimeoutMs}`);
    const observedAt = new Date(String((await client.query('SELECT transaction_timestamp()::text AS t')).rows[0].t));

    let s = Date.now();
    const population = await reader.readPopulationChunked(client, budget, spanStart, observedAt);
    legs.push({
      leg: 'population', elapsedMs: Date.now() - s, chunks: population.perDay.length,
      expectedRevisionLinks: population.expectedRevisionLinks, revisionEvents: population.revisionEvents,
      missingLinkedRevisionEvents: population.missingLinkedRevisionEvents, boundMisses: population.boundMisses,
      perDay: population.perDay.map((d: Record<string, unknown>) => ({
        chunkStart: d.chunkStart, partial: d.partial, links: d.expectedRevisionLinks,
        boundMisses: d.boundMisses, elapsedMs: d.elapsedMs,
      })),
    });

    s = Date.now();
    const unlinked = await reader.readUnlinkedChunked(client, budget, spanStart, observedAt);
    legs.push({ leg: 'unlinked', elapsedMs: Date.now() - s, ...unlinked });

    s = Date.now();
    const identity = await reader.readIdentity(client, budget, spanStart, observedAt);
    legs.push({ leg: 'identity', elapsedMs: Date.now() - s, ...identity });

    s = Date.now();
    const sessions = await reader.readSessionsChunked(client, budget, spanStart, observedAt, population.outOfBoundIds);
    legs.push({
      leg: 'sessions', elapsedMs: Date.now() - s, sessions: sessions.length,
      revisionEvents: sessions.reduce((a: number, r: { revision_events: number }) => a + Number(r.revision_events), 0),
    });
    await client.query('COMMIT');
    outcome = { state: 'completed', observedAt: observedAt.toISOString() };
  } catch (error) {
    const inconclusive = error instanceof reader.InconclusiveRead ? error : reader.asInconclusive(error, 'timing-read');
    outcome = inconclusive
      ? { state: 'inconclusive', leg: inconclusive.leg, reason: inconclusive.reason }
      : { state: 'fatal', message: String((error as Error)?.message ?? error) };
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    await client.end();
  }
  console.log(JSON.stringify({
    batch: 'B-XSTOCK-BAR-AVAILABILITY', purpose: 'C6 timing read - NOT A GRADE',
    spanStart: spanStart.toISOString(), totalElapsedMs: Date.now() - t0,
    budgetMs: reader.GATE_READ_BUDGET.totalMs, outcome, legs,
  }, null, 2));
  process.exitCode = outcome.state === 'completed' ? 0 : outcome.state === 'inconclusive' ? 3 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
