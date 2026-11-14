/**
 * B-ALERT-INSERT-CONTRACT (#1255) — the alert insert contract, against REAL Postgres.
 *
 * WHY AN INTEGRATION TEST: every claim here is a property of the database's own rules — `unique_global_alert`
 * (mode, alert_type, message), `ON CONFLICT … DO UPDATE`, the `xmax = 0` inserted-vs-refreshed signal, the transaction
 * clock behind `now()`. A mocked `db` would only prove that an imitation of a constraint behaves like one. CI's Test Suite
 * job runs a migrated pg17 (`.github/workflows/ci.yml`, `test` job), so this file runs there; on a machine without Postgres
 * it skips itself loudly (same guard discipline as b-killswitch-window.test.ts).
 *
 * WHAT IT PINS (pre-audit P1/P5/P4, tests 1-5):
 *   1. a new (mode, type, message) inserts;
 *   2. a repeat does NOT throw: same id, `user_id` unchanged, reported as refreshed;
 *   3a. a row a person dismissed STAYS dismissed across a refresh (Langston C-1);
 *   3b. a row closed by `acknowledgeFeedHealthAlerts` (stamped `episodeClosedAt`) re-raises, and the stamp is dropped;
 *   4. a non-conflict error still throws (the contract swallows exactly one thing);
 *   5. F-5, the uncovered contract, stated by test: two rows for the same (user_id, mode) written inside ONE transaction
 *      share `now()` and collide on `system_alerts_user_mode_timestamp_idx` — the conflict target does not cover it;
 *   6. `acknowledgeFeedHealthAlerts` reaches every user's rows, returns `{id, mode}` only, and is idempotent;
 *   7. `getAlertOwner` is deterministic: `is_admin`, then `created_at`, then `id`.
 * No users row is seeded for the alert writes: `system_alerts.user_id` has NO foreign key in the database (Langston,
 * measured at Step 2 — 12 orphan rows on staging prove it), so a fixed fake owner is legitimate here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../db.js';
import { systemAlerts, users } from '../../../shared/schema.js';
import { eq, inArray, like, sql } from 'drizzle-orm';
import { AlertsService, EPISODE_CLOSED_KEY } from '../../services/alerts-service.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
if (!isTestDb) {
  console.warn('[B-ALERT-INSERT-CONTRACT] REFUSING TO WRITE: DATABASE_URL is not a local test database. Skipped.');
}
const d = isTestDb ? describe : describe.skip;
let dbReachable = true;

const TAG = `B-ALERT-INSERT-CONTRACT-${Date.now()}`;
const TYPE = 'aic_test'; // a type no production writer uses
const OWNER = 'aic-owner-0000';
const msg = (n: string) => `${TAG} ${n}`;

async function rowById(id: string) {
  const [r] = await db.select().from(systemAlerts).where(eq(systemAlerts.id, id));
  return r;
}

d('B-ALERT-INSERT-CONTRACT — the insert contract against real Postgres', () => {
  beforeAll(async () => {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      dbReachable = false;
      console.warn('[B-ALERT-INSERT-CONTRACT] Postgres unreachable — suite skipped (CI provides it).');
    }
  });
  afterAll(async () => {
    if (!dbReachable) return;
    await db.delete(systemAlerts).where(like(systemAlerts.message, `${TAG}%`));
    await db.delete(users).where(like(users.username, `${TAG}%`));
  });

  it('1+2: a new alert inserts; a repeat refreshes the same row instead of throwing, keeping user_id', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const first = await AlertsService.createAlert({ userId: OWNER, mode: 'paper', alertType: TYPE, severity: 'warning', message: msg('repeat') });
    expect(first.inserted).toBe(true);
    const again = await AlertsService.createAlert({ userId: 'someone-else', mode: 'paper', alertType: TYPE, severity: 'critical', message: msg('repeat'), metadata: { n: 2 } });
    expect(again.inserted).toBe(false);
    expect(again.id).toBe(first.id);
    const stored = await rowById(first.id);
    expect(stored.userId).toBe(OWNER); // the refresh never rewrites the owner
    expect(stored.severity).toBe('critical'); // it takes the caller's severity and metadata
    expect(stored.metadata).toEqual({ n: 2 });
    const count = await db.select({ n: sql<number>`count(*)::int` }).from(systemAlerts).where(eq(systemAlerts.message, msg('repeat')));
    expect(count[0].n).toBe(1); // exactly one row per (mode, type, message)
  });

  it('3a: a row a person dismissed STAYS dismissed across a refresh (no stamp, no re-raise)', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const a = await AlertsService.createAlert({ userId: OWNER, mode: 'live', alertType: TYPE, severity: 'warning', message: msg('dismissed') });
    await AlertsService.acknowledgeAlert(a.id);
    const r = await AlertsService.createAlert({ userId: OWNER, mode: 'live', alertType: TYPE, severity: 'warning', message: msg('dismissed') });
    expect(r.inserted).toBe(false);
    expect((await rowById(a.id)).acknowledged).toBe(true);
  });

  it('3b+6: the feed-health episode close stamps every user\'s rows; the next recurrence re-raises and drops the stamp', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const mine = await AlertsService.createAlert({ userId: OWNER, mode: 'live', alertType: 'feed_health', severity: 'critical', message: msg('feed') });
    const orphan = await AlertsService.createAlert({ userId: 'no-such-user', mode: 'paper', alertType: 'feed_health', severity: 'critical', message: msg('feed-orphan') });
    const closed = await AlertsService.acknowledgeFeedHealthAlerts();
    const closedIds = closed.map((c) => c.id);
    expect(closedIds).toEqual(expect.arrayContaining([mine.id, orphan.id])); // no user filter: the orphan is reached
    expect(Object.keys(closed[0]).sort()).toEqual(['id', 'mode']); // {id, mode} only (Langston C-5)
    const stamped = await rowById(mine.id);
    expect(stamped.acknowledged).toBe(true);
    expect((stamped.metadata as any)?.[EPISODE_CLOSED_KEY]).toBeTruthy();
    // idempotent: a second close does not touch the already-closed rows
    const again = await AlertsService.acknowledgeFeedHealthAlerts();
    expect(again.map((c) => c.id)).not.toContain(mine.id);
    // the episode returns: the refresh re-raises and the new metadata carries no stamp
    const back = await AlertsService.createAlert({ userId: OWNER, mode: 'live', alertType: 'feed_health', severity: 'critical', message: msg('feed'), metadata: { grade: 'F' } });
    expect(back.inserted).toBe(false);
    const raised = await rowById(mine.id);
    expect(raised.acknowledged).toBe(false);
    expect((raised.metadata as any)?.[EPISODE_CLOSED_KEY]).toBeUndefined();
  });

  it('4: a non-conflict error still throws (alert_type longer than its varchar(50))', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await expect(
      AlertsService.createAlert({ userId: OWNER, mode: 'paper', alertType: 'x'.repeat(60), severity: 'info', message: msg('too-long-type') }),
    ).rejects.toThrow();
  });

  it('5 (F-5): the conflict target does NOT cover the (user_id, mode, timestamp) index — same user, same mode, one transaction collides', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    await expect(
      db.transaction(async (tx) => {
        for (const n of ['tx-a', 'tx-b']) {
          await tx.execute(sql`INSERT INTO system_alerts (user_id, mode, alert_type, message, metadata, acknowledged)
            VALUES (${OWNER}, 'paper', ${TYPE}, ${msg(n)}, '{}'::jsonb, false)
            ON CONFLICT (mode, alert_type, message) DO UPDATE SET timestamp = now()`);
        }
      }),
    ).rejects.toThrow(/system_alerts_user_mode_timestamp_idx/);
  });

  it('7: getAlertOwner = is_admin, ordered by created_at then id', async (ctx) => {
    if (!dbReachable) return ctx.skip();
    const at = new Date('1900-01-01T00:00:00Z');
    const mk = (suffix: string, isAdmin: boolean) => ({
      id: `000-aic-${suffix}`, username: `${TAG}-${suffix}`, email: `${TAG}-${suffix}@example.invalid`, isAdmin, createdAt: at,
    });
    await db.insert(users).values([mk('b', true), mk('a', true), mk('0', false)] as any);
    try {
      const owner = await AlertsService.getAlertOwner();
      expect(owner?.id).toBe('000-aic-a'); // same created_at: the id breaks the tie; the earlier non-admin is never chosen
    } finally {
      await db.delete(users).where(inArray(users.id, ['000-aic-a', '000-aic-b', '000-aic-0']));
    }
  });
});
