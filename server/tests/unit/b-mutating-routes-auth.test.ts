/**
 * B-MUTATING-ROUTES-AUTH (#1228, hotfix, Kyle 2026-10-21) — every /api route that changes
 * state or runs work requires a login.
 *
 * The routes are registered inside registerRoutes(), which needs the whole server to run, so
 * the wiring is pinned by structure at the source: each of the nine routes in routes.ts names
 * authenticateToken in its own registration, and each of the four sub-router routes has a
 * guard registered on apiRouter ABOVE its router's mount (a guard below the mount would never
 * run, because the router answers first). The live 401s are verified on staging after deploy.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROUTES = fs.readFileSync(path.resolve(__dirname, '../../routes.ts'), 'utf8');

const INLINE: Array<[string, string]> = [
  ['post', '/vtp/start'],
  ['post', '/vtp/stop'],
  ['post', '/mbim/start'],
  ['post', '/mbim/stop'],
  ['post', '/mbim/audit'],
  ['post', '/internal/active-engine/register-session'],
  ['post', '/internal/active-engine/deregister-session'],
  ['patch', '/conversations/:id'],
  ['post', '/screener/test'],
];

// [method, full path under apiRouter, the mount it must sit above]
const GUARDED: Array<[string, string, string]> = [
  ['post', '/health/recovery/test', "apiRouter.use('/health', healthRouter);"],
  ['post', '/back-audit/run', "apiRouter.use('/back-audit', backAuditRouter.default);"],
  ['get', '/audit/run', "apiRouter.use('/audit', auditRouter.default);"],
  ['get', '/signal-audit/run', "apiRouter.use('/signal-audit', signalAuditRouter.default);"],
];

function registrations(method: string, route: string): string[] {
  const re = new RegExp(`apiRouter\\.${method}\\('${route.replace(/[/:.-]/g, (c) => '\\' + c)}'[^\\n]*`, 'g');
  return ROUTES.match(re) ?? [];
}

describe('B-MUTATING-ROUTES-AUTH: the nine routes in routes.ts require a login', () => {
  for (const [method, route] of INLINE) {
    it(`${method.toUpperCase()} ${route} is registered once, with authenticateToken`, () => {
      const regs = registrations(method, route);
      expect(regs).toHaveLength(1);
      expect(regs[0]).toContain(`'${route}', authenticateToken,`);
    });
  }
});

describe('B-MUTATING-ROUTES-AUTH: the four sub-router routes are guarded above their mount', () => {
  for (const [method, route, mount] of GUARDED) {
    it(`${method.toUpperCase()} ${route} has a guard, and it sits above ${mount}`, () => {
      const guard = `apiRouter.${method}('${route}', authenticateToken);`;
      const g = ROUTES.indexOf(guard);
      const m = ROUTES.indexOf(mount);
      expect(g).toBeGreaterThan(-1);
      expect(m).toBeGreaterThan(-1);
      expect(ROUTES.indexOf(guard, g + 1)).toBe(-1);
      expect(g).toBeLessThan(m);
    });
  }
});

describe('B-MUTATING-ROUTES-AUTH: what was left out on purpose stays as it was', () => {
  it('POST /market-context/analyze is unchanged (adding a login would switch on an AI call from an off-limits page)', () => {
    const regs = registrations('post', '/market-context/analyze');
    expect(regs).toHaveLength(1);
    expect(regs[0]).not.toContain('authenticateToken');
  });
  it('login itself stays open', () => {
    const regs = registrations('post', '/auth/login');
    expect(regs).toHaveLength(1);
    expect(regs[0]).not.toContain('authenticateToken');
  });
});
