// B-ORCHESTRATOR-ROUTES-REMOVAL (row 59g1, #1210): the four routes that imported the AI orchestrator deleted in
// 2025-11-05 (b5eba38a7) are gone, with every piece of the AI Transparency page that depended on them; the live
// /orchestrator routes (learning-summary, logs, updateGoal, updateStrategy) stay; the Formula Health card is drawn.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const PAGE = 'client/src/pages/ai-transparency.tsx';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'tests' || name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|js|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

/** True when `testid`'s element is a direct child of the AI Command Center tab: every `{` opened between the tab's
 *  tag and the element is closed before it, so no `cond ? (` / `cond && (` holds it open. */
function drawnUngated(src: string, testid: string): boolean {
  const tab = src.indexOf('<TabsContent value="ai-command-center"');
  const el = src.indexOf(`data-testid="${testid}"`);
  if (tab < 0 || el < tab || src.indexOf('</TabsContent>', tab) < el) return false;
  const span = src.slice(src.indexOf('>', tab) + 1, src.lastIndexOf('<', el));
  return span.split('{').length - span.split('}').length === 0;
}

describe('the deleted routes', () => {
  const routes = read('server/routes.ts');
  it('routes.ts registers none of the four paths that imported the deleted module', () => {
    for (const path of ['/orchestrator/telemetry', '/orchestrator/analysis', '/orchestrator/analyze', '/orchestrator/audit']) {
      expect(routes, path).not.toContain(`'${path}'`);
    }
  });
  it('positive control: the live /orchestrator routes are still registered', () => {
    for (const path of ['/orchestrator/learning-summary', '/orchestrator/logs', '/orchestrator/logs/:id', '/orchestrator/updateGoal', '/orchestrator/updateStrategy']) {
      expect(routes, path).toContain(`'${path}'`);
    }
  });
  it('nothing under server/ imports the deleted module', () => {
    const files = walk(join(ROOT, 'server'));
    expect(files.length).toBeGreaterThan(100); // the walk reached the tree
    const hits = files.filter((f) => /orchestrator\/orchestrator['"]/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('the tsc baseline carries none of the three errors that lived in the audit route', () => {
    const baseline = read('.tsc-baseline.json');
    expect(baseline).not.toContain("Cannot find module './orchestrator/orchestrator'");
    expect(baseline).not.toContain("Property 'getDatabaseStatus' does not exist on type 'DatabaseStorage'.");
    expect(baseline).not.toContain("Property 'getStatus' does not exist on type 'TradingEngine'.");
  });
});

describe('the page', () => {
  const src = read(PAGE);
  it('requests none of the four endpoints', () => {
    for (const path of ['/api/orchestrator/telemetry', '/api/orchestrator/analysis', '/api/orchestrator/analyze', '/api/orchestrator/audit']) {
      expect(src, path).not.toContain(path);
    }
  });
  it('keeps no state or handler of the removed pieces, and has no AI Analysis tab', () => {
    for (const name of ['telemetryData', 'telemetryLoading', 'analysisData', 'analysisLoading', 'auditReport',
      'triggerAnalysisMutation', 'runSystemAuditMutation']) {
      expect(src, name).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(src).not.toContain('value="ai-analysis"');
  });
  it('positive control: the live endpoints the page still reads are named', () => {
    for (const path of ['/api/orchestrator/learning-summary', '/api/orchestrator/logs', '/api/system/formula-audit', '/api/system/feed-health']) {
      expect(src, path).toContain(path);
    }
  });
  it('Formula Health and Feed Health are both drawn ungated in the AI Command Center tab', () => {
    expect(drawnUngated(src, 'card-formula-health')).toBe(true);
    expect(drawnUngated(src, 'card-feed-health')).toBe(true);
  });
  it('the fence catches a gated card (its minting twin)', () => {
    const gated = src.replace('<Card data-testid="card-formula-health">', '{formulaAuditData && (<Card data-testid="card-formula-health">');
    expect(gated).not.toBe(src);
    expect(drawnUngated(gated, 'card-formula-health')).toBe(false);
  });
});
