/**
 * B-DASHBOARD-STATS-BLANK (hotfix, 2026-10-04) — two blank figures on the staging dashboards.
 *
 * (1) The paper Earnings card's two LIFETIME rows (OBJ-4, Kyle 2026-08-21) read "—" whenever the selected
 *     window held no closes: `/active-engine/trades/analytics` returned `lifetime` from its main return only,
 *     not from its empty-window early return. Fence: every success return of that handler that carries the
 *     rolling `earnings` key also carries `lifetime`.
 * (2) The main Dashboard's Portfolio Value card never loaded: it called the authenticateToken-gated
 *     `/api/portfolio/overview` with a bare fetch (no Bearer token), so every call got 401. Fence: neither
 *     caller reaches that route except through `apiFetch`.
 * NOT COVERED, stated: other bare fetches to other gated routes (a separate census, own issue).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

function handlerBody(src: string, route: string): string {
  const start = src.indexOf(`apiRouter.get('${route}'`);
  if (start < 0) throw new Error(`route ${route} not found`);
  const next = src.indexOf('apiRouter.', start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

describe('B-DASHBOARD-STATS-BLANK', () => {
  it('every analytics success return carrying earnings also carries lifetime', () => {
    const body = handlerBody(read('server/routes.ts'), '/active-engine/trades/analytics');
    const returns = body.split(/res\.json\(\{/).slice(1);
    const withEarnings = returns.filter((r) => /\bearnings\s*[:,]/.test(r));
    // positive control: the instrument sees both the early return and the main return
    expect(withEarnings.length).toBeGreaterThanOrEqual(2);
    for (const r of withEarnings) {
      expect(/\blifetime\s*[:,]/.test(r), 'a return carries earnings but no lifetime').toBe(true);
    }
  });

  it('the portfolio overview is fetched with the auth token, never a bare fetch', () => {
    for (const p of ['client/src/pages/dashboard.tsx', 'client/src/hooks/use-trading.tsx']) {
      const src = read(p);
      // positive control: the file does call the route
      expect(src.includes('/api/portfolio/overview'), p).toBe(true);
      expect(/[^a-zA-Z_.]fetch\(\s*[`'"]\/api\/portfolio\/overview/.test(src), `${p} bare-fetches the overview`).toBe(false);
      expect(/apiFetch\(\s*[`'"]\/api\/portfolio\/overview/.test(src), p).toBe(true);
    }
  });
});
