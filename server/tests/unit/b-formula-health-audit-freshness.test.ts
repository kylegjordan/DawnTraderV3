// B-FORMULA-HEALTH-AUDIT-FRESHNESS (row 59g1a, #1214): the Formula Health card shows the newest REAL result (an admin
// manual run, or the daily run's result persisted in its fire row) and runs the audit on the read only when neither
// exists; a note says when the latest scheduled row failed or recorded no result. One test per row of the scope's
// A1-A5 / N1-N3b table, then the predicate, the two write guards, the persisted meta and the card's labels.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  resolveFormulaAuditView, rowCarriesCounts, countedMetaFromReport,
  type AuditResultView, type CountedAuditMeta, type FireRow,
} from '../../services/formula-audit-view';
import { formulaAuditSourceLabel, FORMULA_AUDIT_REPORT_FILE_NOTE } from '../../../shared/formula-audit-labels';

const TESTS = Array.from({ length: 10 }, (_, i) => ({ name: `F${i}`, status: i === 0 ? 'WARNING' : 'PASS', deviationPercent: i === 0 ? 0.3 : 0.01 }));
const result = (ts: string): AuditResultView => ({ timestamp: ts, totalFormulas: TESTS.length, passed: 9, warnings: 1, failed: 0, tests: TESTS });
const counted = (ts: string): CountedAuditMeta => ({ totalFormulas: TESTS.length, passed: 9, warnings: 1, failed: 0, auditTimestamp: ts, tests: TESTS });
const row = (firedAt: string, status: string, meta: unknown): FireRow => ({ firedAt, status, meta });
const countedRow = (firedAt: string) => ({ firedAt, status: 'success', meta: counted(firedAt) });
// Every row written before this batch: success, meta without counts (138 of 138 on staging, 2026-10-18).
const legacyRow = (firedAt: string) => row(firedAt, 'success', { trigger_source: 'cron', duration_ms: 12 });

const D1 = '2026-10-17T03:00:00.000Z';
const D1_10 = '2026-10-17T10:00:00.000Z';
const D2 = '2026-10-18T03:00:00.000Z';
const D3 = '2026-10-19T03:00:00.000Z';

describe('what is shown (A1-A5)', () => {
  it('A1 — today\'s state: no manual run, no counted row, the latest row has no counts ⇒ run on this read, with the N2b note', () => {
    const d = resolveFormulaAuditView({ manual: null, latestRow: legacyRow(D2), latestCountedRow: null });
    expect(d.shown).toBeNull();
    expect(d.note).toBe(`The last scheduled run (${D2}) recorded no result`);
  });
  it('A2 — a counted row and no manual run ⇒ the scheduled result, no note when it is the latest row', () => {
    const C = countedRow(D2);
    const d = resolveFormulaAuditView({ manual: null, latestRow: C, latestCountedRow: C });
    expect(d.shown).toEqual({ runType: 'scheduled', result: result(D2) });
    expect(d.note).toBeNull();
  });
  it('A3 — a manual run and no counted row ⇒ the manual run', () => {
    const d = resolveFormulaAuditView({ manual: result(D1_10), latestRow: null, latestCountedRow: null });
    expect(d.shown).toEqual({ runType: 'manual', result: result(D1_10) });
    expect(d.note).toBeNull();
  });
  it('A4 — manual newer than the counted row ⇒ manual', () => {
    const C = countedRow(D1);
    const d = resolveFormulaAuditView({ manual: result(D1_10), latestRow: C, latestCountedRow: C });
    expect(d.shown?.runType).toBe('manual');
  });
  it('A5 — counted row newer than the manual run ⇒ scheduled (newest real result wins, not precedence)', () => {
    const C = countedRow(D2);
    const d = resolveFormulaAuditView({ manual: result(D1_10), latestRow: C, latestCountedRow: C });
    expect(d.shown).toEqual({ runType: 'scheduled', result: result(D2) });
  });
});

describe('the note, from the latest scheduled row alone (N1-N3b)', () => {
  it('N1 — a normal counted latest row older than a shown manual run ⇒ no note', () => {
    const C = countedRow(D1);
    const d = resolveFormulaAuditView({ manual: result(D1_10), latestRow: C, latestCountedRow: C });
    expect(d.note).toBeNull();
  });
  it('N2a — the latest row recorded no result and is NEWER than what is shown ⇒ "a later scheduled run"', () => {
    // Langston's case: manual day 1, counted day 2, uncounted day 3 ⇒ C shown, day-3 noted.
    const d = resolveFormulaAuditView({ manual: result(D1_10), latestRow: legacyRow(D3), latestCountedRow: countedRow(D2) });
    expect(d.shown?.runType).toBe('scheduled');
    expect(d.note).toBe(`A later scheduled run (${D3}) recorded no result`);
  });
  it('N2b — recorded no result and NOT newer than what is shown ⇒ "the last scheduled run"', () => {
    const d = resolveFormulaAuditView({ manual: result(D2), latestRow: legacyRow(D1), latestCountedRow: null });
    expect(d.note).toBe(`The last scheduled run (${D1}) recorded no result`);
  });
  it('N3a — the latest row is an error, newer than what is shown ⇒ "a later … did not complete"', () => {
    const d = resolveFormulaAuditView({ manual: null, latestRow: row(D3, 'error', { trigger_source: 'cron' }), latestCountedRow: countedRow(D2) });
    expect(d.shown?.runType).toBe('scheduled');
    expect(d.note).toBe(`A later scheduled run (${D3}) did not complete`);
  });
  it('N3b — an error OLDER than a shown manual run still gets its note (a manual run must not hide a failing schedule)', () => {
    const d = resolveFormulaAuditView({ manual: result(D1_10), latestRow: row(D1, 'error', {}), latestCountedRow: null });
    expect(d.shown?.runType).toBe('manual');
    expect(d.note).toBe(`The last scheduled run (${D1}) did not complete`);
  });
});

describe('the validating predicate (a row carries counts only if every rendered field is well-typed)', () => {
  it('accepts the persisted shape and rejects the legacy one', () => {
    expect(rowCarriesCounts(counted(D2))).toBe(true);
    expect(rowCarriesCounts({ trigger_source: 'cron', duration_ms: 12 })).toBe(false);
    expect(rowCarriesCounts(null)).toBe(false);
  });
  it('rejects a deviationPercent that is a string, null (a NaN through jsonb) or missing — the card calls .toFixed on it', () => {
    for (const bad of ['0.3', null, undefined]) {
      const m = counted(D2);
      m.tests = [{ ...m.tests[0], deviationPercent: bad as unknown as number }, ...m.tests.slice(1)];
      expect(rowCarriesCounts(m), String(bad)).toBe(false);
    }
  });
  it('a row that fails the predicate is not shown — it gets its own "cannot read" note, not a broken card', () => {
    const broken = row(D2, 'success', { ...counted(D2), passed: 'nine' });
    const d = resolveFormulaAuditView({ manual: null, latestRow: broken, latestCountedRow: null });
    expect(d.shown).toBeNull();
    expect(d.note).toBe(`The last scheduled run (${D2}) recorded a result the card cannot read`);
  });
  it('a NEWER counted-but-invalid row does not hide the older valid one: C is the older row, the invalid one is noted (D1)', () => {
    const invalid = row(D3, 'success', { ...counted(D3), tests: [{ name: 'RSI', status: 'PASS', deviationPercent: null }] });
    const d = resolveFormulaAuditView({ manual: null, latestRow: invalid, latestCountedRow: countedRow(D2) });
    expect(d.shown).toEqual({ runType: 'scheduled', result: result(D2) });
    expect(d.note).toBe(`A later scheduled run (${D3}) recorded a result the card cannot read`);
  });
  it('countedMetaFromReport keeps exactly the fields the card renders, totalFormulas from the run', () => {
    const meta = countedMetaFromReport({ ...result(D2), tests: TESTS.map((t) => ({ ...t, sampleData: { x: 1 }, notes: 'n' })) });
    expect(meta.totalFormulas).toBe(TESTS.length);
    expect(Object.keys(meta.tests[0]).sort()).toEqual(['deviationPercent', 'name', 'status']);
    expect(rowCarriesCounts(meta)).toBe(true);
  });
});

// ---- the write guards: a failed /tmp write must not discard a completed audit
const { writeFileSync } = vi.hoisted(() => ({ writeFileSync: vi.fn() }));
vi.mock('fs', async (orig) => {
  const actual = await orig<typeof import('fs')>();
  // Only the audit's own report files fail; any other write is a no-op in this file.
  writeFileSync.mockImplementation((path: unknown) => {
    if (String(path).includes('audit_report')) throw new Error('EACCES: permission denied');
  });
  const mocked = { ...actual, writeFileSync, existsSync: () => true, statSync: actual.statSync, readdirSync: () => [] };
  return { ...mocked, default: mocked };
});
vi.mock('../../services/alerts-service', () => ({ AlertsService: { createAlert: vi.fn() } }));
vi.mock('../../storage', () => ({ storage: { getAllUsers: vi.fn(async () => []) } }));

describe('the write guards', () => {
  beforeEach(() => writeFileSync.mockClear());
  const auditWrites = () => writeFileSync.mock.calls.filter((c) => String(c[0]).includes('audit_report')).length;
  it('runFormulaAudit returns the report with reportPath null when the text-file writes throw, and records a manual run', async () => {
    const svc = await import('../../services/formula-audit');
    const spy = vi.spyOn(svc.FormulaAuditService.prototype, 'runAudit').mockResolvedValue(
      { ...result(D2), summary: ['s'] } as never);
    const job = await import('../../jobs/formula-auto-audit');
    const out = await job.runFormulaAudit('manual');
    expect(auditWrites()).toBeGreaterThan(0);
    expect(out.reportPath).toBeNull();
    expect(out.reportWriteError).toMatch(/EACCES/);
    expect(out.passed).toBe(9);
    expect(job.getLastManualFormulaAudit()?.timestamp).toBe(D2);
    spy.mockRestore();
  });
  it('FormulaAuditService.saveReportToFile logs a failed write instead of throwing out of runAudit', async () => {
    const svc = await import('../../services/formula-audit');
    const s = new svc.FormulaAuditService() as unknown as { saveReportToFile(r: unknown): Promise<void> };
    await expect(s.saveReportToFile({ ...result(D2), tests: [], summary: [] })).resolves.toBeUndefined();
    expect(auditWrites()).toBeGreaterThan(0);
  });
});

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
describe('wiring', () => {
  it('the daily run writes its result into the fire row meta, beside trigger_source', () => {
    const src = read('server/jobs/formula-auto-audit.ts');
    expect(src).toMatch(/resultMeta = \{ \.\.\.countedMetaFromReport\(result\) \}/);
    expect(src).toMatch(/meta: \{ trigger_source: 'cron', duration_ms: Date\.now\(\) - startMs, \.\.\.resultMeta \}/);
  });
  it('the card read runs the audit only on the branch where nothing is shown', () => {
    const src = read('server/routes.ts');
    const route = src.slice(src.indexOf("apiRouter.get('/system/formula-audit', authenticateToken"), src.indexOf("apiRouter.get('/system/formula-audit/run'"));
    expect(route.match(/runAudit\(\)/g)).toHaveLength(1);
    expect(route.indexOf('if (decision.shown)')).toBeGreaterThan(-1);
    expect(route.indexOf('runAudit()')).toBeGreaterThan(route.indexOf('} else {', route.indexOf('if (decision.shown)')));
    expect(route).not.toMatch(/as any/);
  });
  it('the card names the source, shows the note, and both /tmp pointers carry the clause', () => {
    const page = read('client/src/pages/ai-transparency.tsx');
    expect(page).toContain('formulaAuditSourceLabel(formulaAuditData.runType)');
    expect(page).toContain('data-testid="text-audit-note"');
    expect(page.match(/\{isAdmin && FORMULA_AUDIT_REPORT_FILE_NOTE\}/g)).toHaveLength(2);
    expect(page).not.toContain('" Review /tmp/audit_report.txt for details."');
  });
  it('the labels', () => {
    expect(formulaAuditSourceLabel('scheduled')).toBe('daily scheduled run');
    expect(formulaAuditSourceLabel('manual')).toBe('run by an admin');
    expect(formulaAuditSourceLabel('on-read')).toBe('run when this page loaded — no scheduled result recorded yet');
    expect(FORMULA_AUDIT_REPORT_FILE_NOTE).toContain('may not be the run shown');
  });
});
