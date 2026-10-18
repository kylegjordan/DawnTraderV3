/**
 * B-FORMULA-HEALTH-AUDIT-FRESHNESS (row 59g1a, #1214): what the Formula Health card shows, and the note beside it.
 *
 * The card's read used to RUN the audit, so its "Last audit" always said "just now". It now shows the newest REAL
 * result — the admin's last manual run (held in memory since the process started) or the daily scheduled run's
 * result (persisted in its `formula_audit_cron` fire row's `meta`) — and runs one on the read only when neither
 * exists. A note, from the latest scheduled row alone, says when that row is abnormal (failed, or recorded no result).
 * Scope: `Scope Files/B_FORMULA_HEALTH_AUDIT_FRESHNESS_SCOPE.md` (the A1-A5 / N1-N3b table).
 *
 * Pure — no I/O. The route does the reads and the on-read run.
 */

export type AuditStatus = 'PASS' | 'WARNING' | 'FAIL';

/** The per-test fields the card renders (`ai-transparency.tsx`: name, status, deviationPercent.toFixed(2)). */
export interface AuditTestSummary {
  name: string;
  status: string;
  deviationPercent: number;
}

/** What the daily run writes into its fire row's `meta`, beside `trigger_source` and `duration_ms`. */
export interface CountedAuditMeta {
  totalFormulas: number;
  passed: number;
  warnings: number;
  failed: number;
  auditTimestamp: string;
  tests: AuditTestSummary[];
}

/** One audit result, from whichever source. */
export interface AuditResultView {
  timestamp: string;
  totalFormulas: number;
  passed: number;
  warnings: number;
  failed: number;
  tests: AuditTestSummary[];
}

/** A `formula_audit_cron` row as the route reads it (raw SQL, so `meta` is unknown until validated). */
export interface FireRow {
  firedAt: string;
  status: string;
  meta: unknown;
}

export type AuditRunType = 'manual' | 'scheduled' | 'on-read';

export interface AuditViewDecision {
  /** What to show; `null` = run the audit on this read (state A1). */
  shown: { runType: 'manual' | 'scheduled'; result: AuditResultView } | null;
  /** The note from the latest scheduled row, when it is abnormal and is not what is shown. */
  note: string | null;
}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * The validating predicate (Langston, scope r6 and Step-2 C2): the value crosses raw SQL and jsonb, so a row
 * "carries counts" only if every field the card renders is present and well-typed — counts as finite numbers, and
 * every test with a string `name`, a string `status` and a finite-number `deviationPercent` (the card calls
 * `.toFixed(2)` on it unguarded). A row that fails reads as carrying none. A type predicate, so callers get the type
 * from the check, not from a cast.
 */
export function rowCarriesCounts(meta: unknown): meta is CountedAuditMeta {
  if (!meta || typeof meta !== 'object') return false;
  const m = meta as Record<string, unknown>;
  if (![m.totalFormulas, m.passed, m.warnings, m.failed].every(isFiniteNumber)) return false;
  if (typeof m.auditTimestamp !== 'string' || Number.isNaN(Date.parse(m.auditTimestamp))) return false;
  if (!Array.isArray(m.tests)) return false;
  return m.tests.every((t: unknown) => {
    if (!t || typeof t !== 'object') return false;
    const x = t as Record<string, unknown>;
    return typeof x.name === 'string' && typeof x.status === 'string' && isFiniteNumber(x.deviationPercent);
  });
}

/** The `meta` fields the daily run writes, from its report (only the fields the card renders). */
export function countedMetaFromReport(report: {
  timestamp: string; totalFormulas: number; passed: number; warnings: number; failed: number;
  tests: Array<{ name: string; status: string; deviationPercent: number }>;
}): CountedAuditMeta {
  return {
    totalFormulas: report.totalFormulas,
    passed: report.passed,
    warnings: report.warnings,
    failed: report.failed,
    auditTimestamp: report.timestamp,
    tests: report.tests.map((t) => ({ name: t.name, status: t.status, deviationPercent: t.deviationPercent })),
  };
}

const viewFromMeta = (meta: CountedAuditMeta): AuditResultView => ({
  timestamp: meta.auditTimestamp,
  totalFormulas: meta.totalFormulas,
  passed: meta.passed,
  warnings: meta.warnings,
  failed: meta.failed,
  tests: meta.tests,
});

const ms = (iso: string) => Date.parse(iso);

/**
 * The table. Shown = the newest of M (manual) and C (latest counted row); neither ⇒ run on this read.
 * Note = from L (latest row of any status) alone: iff L exists, L is not the shown result, and L is abnormal
 * (`error`, or success without valid counts). "A later" when L is newer than what is shown, "the last" otherwise.
 * C is "the newest row that VALIDATES" — the route reads the latest 10 rows that name their counts and takes the
 * first that passes `rowCarriesCounts` (bound: 10 daily rows). A newer counted-but-invalid row is then L and is noted.
 */
export function resolveFormulaAuditView(input: {
  manual: AuditResultView | null;
  latestRow: FireRow | null;
  latestCountedRow: (FireRow & { meta: CountedAuditMeta }) | null;
}): AuditViewDecision {
  const { manual, latestRow: L, latestCountedRow: C } = input;

  let shown: AuditViewDecision['shown'] = null;
  if (manual && C) {
    shown = ms(manual.timestamp) >= ms(C.meta.auditTimestamp)
      ? { runType: 'manual', result: manual }
      : { runType: 'scheduled', result: viewFromMeta(C.meta) };
  } else if (manual) {
    shown = { runType: 'manual', result: manual };
  } else if (C) {
    shown = { runType: 'scheduled', result: viewFromMeta(C.meta) };
  }

  let note: string | null = null;
  const lIsShown = !!(L && C && shown?.runType === 'scheduled' && L.firedAt === C.firedAt);
  const lAbnormal = !!L && (L.status === 'error' || !rowCarriesCounts(L.meta));
  if (L && lAbnormal && !lIsShown) {
    const shownAtMs = shown ? ms(shown.result.timestamp) : Number.NaN;
    const later = shown !== null && ms(L.firedAt) > shownAtMs;
    const which = later ? 'a later scheduled run' : 'the last scheduled run';
    // A row that names its counts but fails the predicate (e.g. a non-finite deviation serialised to jsonb `null`)
    // is distinguished from a row that recorded none (Langston Step-3 D1): the card must not read it as "no result".
    const namesCounts = !!L.meta && typeof L.meta === 'object' && 'passed' in (L.meta as Record<string, unknown>);
    const what = L.status === 'error' ? 'did not complete'
      : namesCounts ? 'recorded a result the card cannot read' : 'recorded no result';
    note = `${which[0].toUpperCase()}${which.slice(1)} (${L.firedAt}) ${what}`;
  }
  return { shown, note };
}
