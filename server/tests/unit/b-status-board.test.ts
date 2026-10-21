/**
 * B-STATUS-BOARD (#1227) — GET /api/status-board.
 *
 * The reader is tested by behaviour on temp files (missing, unreadable JSON, no generated_at, fresh, stale). The
 * route lives inside registerRoutes(), which needs the whole server, so its login requirement is pinned by
 * structure at the source; the live 401 is measured on staging at Step 7.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readStatusBoard, STATUS_BOARD_STALE_MS } from '../../services/status-board-file';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'b-status-board-'));
const file = (name: string, body: string) => { const p = path.join(dir, name); fs.writeFileSync(p, body); return p; };
const NOW = Date.parse('2026-10-21T12:00:00Z');

describe('B-STATUS-BOARD: the board file reader', () => {
  it('a missing file is a 503 with a reason, never an empty board', async () => {
    const out = await readStatusBoard(path.join(dir, 'absent.json'), NOW);
    expect(out.status).toBe(503);
    expect(out.body.ok).toBe(false);
    expect(String(out.body.reason)).toMatch(/not written the board yet/);
    expect(out.body).not.toHaveProperty('items');
  });
  it('a file that is not JSON is a 503', async () => {
    const out = await readStatusBoard(file('bad.json', '{ not json'), NOW);
    expect(out.status).toBe(503);
    expect(String(out.body.reason)).toMatch(/not valid JSON/);
  });
  it('a board with no generated_at is a 503', async () => {
    const out = await readStatusBoard(file('nodate.json', JSON.stringify({ items: [] })), NOW);
    expect(out.status).toBe(503);
  });
  it('a fresh board is served as written, with its age and not stale', async () => {
    const out = await readStatusBoard(file('fresh.json', JSON.stringify({ generated_at: '2026-10-21T11:40:00Z', ref: 'abc', items: [{ key: 'B-X' }] })), NOW);
    expect(out.status).toBe(200);
    expect(out.body.ok).toBe(true);
    expect(out.body.ref).toBe('abc');
    expect(out.body.items).toEqual([{ key: 'B-X' }]);
    expect(out.body.ageMs).toBe(20 * 60 * 1000);
    expect(out.body.stale).toBe(false);
    expect(out.body).toHaveProperty('pageBuild');
  });
  it('a board older than an hour is marked stale', async () => {
    const old = new Date(NOW - STATUS_BOARD_STALE_MS - 1000).toISOString();
    const out = await readStatusBoard(file('stale.json', JSON.stringify({ generated_at: old, items: [] })), NOW);
    expect(out.body.stale).toBe(true);
  });
});

describe('B-STATUS-BOARD: the route requires a login', () => {
  const ROUTES = fs.readFileSync(path.resolve(__dirname, '../../routes.ts'), 'utf8');
  it('GET /status-board is registered once, with authenticateToken', () => {
    const regs = ROUTES.match(/apiRouter\.get\('\/status-board'[^\n]*/g) ?? [];
    expect(regs).toHaveLength(1);
    expect(regs[0]).toContain("'/status-board', authenticateToken,");
  });
});

describe('B-STATUS-BOARD: the page is a login-protected route', () => {
  const APP = fs.readFileSync(path.resolve(__dirname, '../../../client/src/App.tsx'), 'utf8');
  it('the /status-board route sits inside RequireAuth', () => {
    const route = APP.indexOf('<Route path="/status-board"');
    const open = APP.lastIndexOf('<RequireAuth', route);
    const close = APP.indexOf('</RequireAuth>', route);
    expect(route).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(route);
    expect(APP.slice(open, route)).not.toContain('</RequireAuth>');
  });
});
