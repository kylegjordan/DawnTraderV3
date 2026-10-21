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
    const out = await readStatusBoard(file('fresh.json', JSON.stringify({ schema: 1, generated_at: '2026-10-21T11:40:00Z', ref: 'abc', items: [{ key: 'B-X' }] })), NOW);
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
    const out = await readStatusBoard(file('stale.json', JSON.stringify({ schema: 1, generated_at: old, items: [] })), NOW);
    expect(out.body.stale).toBe(true);
  });
  it('a board of another version is a 503 that says so (Langston gate C (b))', async () => {
    for (const schema of [2, undefined]) {
      const out = await readStatusBoard(file(`v${schema}.json`, JSON.stringify({ schema, generated_at: '2026-10-21T11:40:00Z', items: [] })), NOW);
      expect(out.status).toBe(503);
      expect(String(out.body.reason)).toMatch(/this page reads version 1/);
    }
  });
  it('nothing in the file can override ok or the computed fields (Langston gate C (a))', async () => {
    const out = await readStatusBoard(file('override.json', JSON.stringify({ schema: 1, generated_at: '2026-10-21T11:40:00Z', ok: false, stale: false, ageMs: 0, pageBuild: 'forged' })), NOW);
    expect(out.body.ok).toBe(true);
    expect(out.body.ageMs).toBe(20 * 60 * 1000);
    expect(out.body.pageBuild).not.toBe('forged');
  });
});

describe('B-STATUS-BOARD: the route requires a login', () => {
  const ROUTES = fs.readFileSync(path.resolve(__dirname, '../../routes.ts'), 'utf8');
  it('GET /status-board is registered once, with authenticateToken', () => {
    const regs = ROUTES.match(/apiRouter\.get\('\/status-board'[^\n]*/g) ?? [];
    expect(regs).toHaveLength(1);
    expect(regs[0]).toContain("'/status-board', authenticateToken,");
  });
  it('the handler catches, so a failed import answers 503 instead of hanging (Langston gate C (2))', () => {
    const start = ROUTES.indexOf("apiRouter.get('/status-board'");
    const block = ROUTES.slice(start, ROUTES.indexOf('\n  });', start));
    expect(block).toMatch(/try \{[\s\S]*await import\('\.\/services\/status-board-file'\)[\s\S]*\} catch/);
    expect(block).toContain('res.status(503)');
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
  it('the page reads a 503 back as its reason, not as a failure (Langston gate C blocker; the render is measured at Step 7)', () => {
    const PAGE = fs.readFileSync(path.resolve(__dirname, '../../../client/src/pages/status-board/StatusBoardPage.tsx'), 'utf8');
    expect(PAGE).toMatch(/queryFn: async \(\) => \{[\s\S]*apiFetch\('\/api\/status-board'\)[\s\S]*unavailableFromError\(e\)/);
  });
});
