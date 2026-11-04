import { describe, expect, it, vi } from 'vitest';
import pg from 'pg';

// B-DB-POOL-GUARD OBJ-1 (#1239): an idle pooled connection that the database ends must not crash the app.
// pg-pool reports it as pool.emit('error'); with no listener, EventEmitter throws.

describe('the app pool survives an ended idle connection', () => {
  it('control: a pool with no error listener throws on the same event (so the test below can fail)', () => {
    const bare = new pg.Pool({ connectionString: 'postgresql://test:test@localhost:5432/test' });
    expect(() => bare.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }), {})).toThrow(
      /administrator command/,
    );
  });

  it('the app pool logs one line naming the code and counts it, and does not throw', async () => {
    const { pool, getPoolIdleClientErrorCount } = await import('../../db.js');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const before = getPoolIdleClientErrorCount();
    expect(() => pool.emit('error', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' }), {})).not.toThrow();
    expect(getPoolIdleClientErrorCount()).toBe(before + 1);
    const line = spy.mock.calls.map((c) => String(c[0])).find((s) => s.includes('[B-DB-POOL-GUARD][POOL_IDLE_CLIENT_ERROR]'));
    expect(line).toContain('code=57P01');
    expect(line).toMatch(/total=\d+ idle=\d+ waiting=\d+ count=\d+/);
    spy.mockRestore();
  });

  it('exactly one listener is registered on the app pool (a second import does not add another)', async () => {
    const { pool } = await import('../../db.js');
    await import('../../db.js');
    expect(pool.listenerCount('error')).toBe(1);
  });
});
