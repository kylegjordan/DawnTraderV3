/**
 * B-SIZING-DEC-RESTORE P6 (PRE_AUDIT §13 F8) — the audit rows for one guardrails save.
 *
 * One row per CHANGED field, built from the save's own payload. The settings route used to carry a
 * hand-written block per field; it missed `maxTotalExposurePct` and the warning tiers entirely and
 * compared numbers as strings, so re-saving 5 over "5.00" logged a change that was not one. A list
 * derived from the payload cannot miss a field the route writes.
 * Pure: the caller writes the rows in the same transaction as the save (`upsertGuardrailsV2WithAudit`).
 *
 * ⛔ IT DIFFS THE OLD ROW AGAINST THE ROW THE DATABASE RETURNED, not against the payload (Langston Step-4
 * FINDING-1). The route's field whitelist and `upsertGuardrailsV2`'s merge list are two hand-maintained
 * lists; a field in the first and missing from the second would otherwise get an audit row for a write
 * the database silently dropped — `#1088` with the sign flipped, and worse, because the log would
 * assert a change that never happened. `fields` is the payload's key set; the VALUES come from the
 * written row, so the log cannot record what was not saved (and records what the column stored,
 * e.g. `6.56` for a sent `6.555`).
 */
import type { InsertAuditLog } from '@shared/schema';

/** Fields that are written but are not user settings, so they get no audit row. */
const NOT_AUDITED = new Set(['mode', 'lastUpdatedBy']);
/** Fields compared as JSON rather than as numbers or strings. */
const JSON_FIELDS = new Set(['lockedByUser']);

export function buildGuardrailAuditEntries(
  oldRow: Record<string, unknown> | null,
  writtenRow: Record<string, unknown>,
  fields: readonly string[],
  changedBy: string,
  mode: 'live' | 'paper',
): InsertAuditLog[] {
  if (!oldRow) return [];
  const entries: InsertAuditLog[] = [];
  for (const field of fields) {
    if (NOT_AUDITED.has(field)) continue;
    const newRaw = writtenRow[field];
    const oldRaw = oldRow[field];
    const isJson = JSON_FIELDS.has(field);
    const oldStr = oldRaw == null ? null : isJson ? JSON.stringify(oldRaw) : String(oldRaw);
    const newStr = newRaw == null ? null : isJson ? JSON.stringify(newRaw) : String(newRaw);
    const bothNumeric = !isJson && oldStr !== null && newStr !== null && oldStr.trim() !== '' && newStr.trim() !== ''
      && Number.isFinite(Number(oldStr)) && Number.isFinite(Number(newStr));
    if (bothNumeric ? Number(oldStr) === Number(newStr) : oldStr === newStr) continue;
    entries.push({ entityType: 'guardrails', field, oldValue: oldStr, newValue: newStr, changedBy, tradingMode: mode });
  }
  return entries;
}
