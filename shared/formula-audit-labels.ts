// B-FORMULA-HEALTH-AUDIT-FRESHNESS (row 59g1a, #1214): what the Formula Health card says about where its figure came
// from. The server decides the source (`server/services/formula-audit-view.ts`); the card only names it.

export type FormulaAuditRunType = 'manual' | 'scheduled' | 'on-read';

export function formulaAuditSourceLabel(runType: string | undefined | null): string {
  switch (runType) {
    case 'scheduled': return 'daily scheduled run';
    case 'manual': return 'run by an admin';
    case 'on-read': return 'run when this page loaded — no scheduled result recorded yet';
    default: return 'source unknown';
  }
}

/** The admin pointer to the text report, and why it may not match the run shown. */
export const FORMULA_AUDIT_REPORT_FILE_NOTE =
  ' Review /tmp/audit_report.txt for details — it holds the most recent run of the audit, which may not be the run shown here.';
