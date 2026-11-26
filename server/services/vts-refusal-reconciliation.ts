import {
  isProvedVtsRefusalCrossing, VTS_REFUSAL_RECEIPT_PREFIX, vtsRefusalReceiptField,
  type VtsRefusalCrossing, type VtsRefusalEvidence,
} from '../core/trading/vts-refusal-evidence.js';
import { isVtsFeedIncidentAlert, railKey, railRowTradeId, RAIL_KEY_PREFIX, VTS_STANDING_KEY } from '../core/trading/vts-rail.js';
import type { AlertStoreDraft, SystemAlert } from './system-alerts.js';

const receiptKey = (field: string, tradeId: string) => JSON.stringify([field, tradeId]);

export function recoverableVtsRefusals(
  refusals: VtsRefusalEvidence[], runId: string,
): VtsRefusalEvidence[] {
  return refusals.filter(refusal => refusal.runId !== runId && !refusal.closed && refusal.decidedAtMs === null);
}

function recoveredWarning(
  refusal: VtsRefusalEvidence, crossing: VtsRefusalCrossing, nowMs: number, field: string,
) {
  const { symbol, tradeId, streakId, firstAtMs, firstReason } = refusal;
  const { pageSinceMs, observedAtMs, reason } = crossing;
  return {
    triggers_at: new Date(nowMs), category: 'breakage', severity: 'warning' as const,
    title: `VTS exit decisions unavailable — recovered warning for ${symbol}`,
    body: `VTS had no exit decision for virtual trade ${tradeId} in ${symbol} when the warning became due `
      + `at ${new Date(observedAtMs).toISOString()} (reason: ${reason}). No saved decision for this streak was found. `
      + 'The saved observations cover the earlier crossing only.',
    dedupe_key: `${railKey(symbol, tradeId)}-recovered-${streakId}-${pageSinceMs}`,
    one_shot: true,
    metadata: {
      tradeId, [field]: tradeId, originalRefusal: { streakId, firstAtMs, firstReason, pageSinceMs, observedAtMs, reason },
      decisionAtRecovery: 'unknown',
    },
  };
}

/** Recheck the snapshot at publication. Only this sweep's positively identified closes are terminal. */
export function reconcileVtsRefusals(
  draft: AlertStoreDraft, snapshot: VtsRefusalEvidence[], closed: ReadonlySet<string>, nowMs: number,
): void {
  const receipts = new Map<string, Readonly<SystemAlert>>();
  for (const row of draft.rows) {
    const shared = row.dedupe_key === VTS_STANDING_KEY || isVtsFeedIncidentAlert(row);
    if (!shared && !row.dedupe_key?.startsWith(RAIL_KEY_PREFIX)) continue;
    const trade = shared ? null : railRowTradeId(row);
    for (const [field, tradeId] of Object.entries(row.metadata ?? {})) {
      if (!field.startsWith(VTS_REFUSAL_RECEIPT_PREFIX) || typeof tradeId !== 'string') continue;
      if (shared || trade === tradeId) receipts.set(receiptKey(field, tradeId), row);
    }
  }

  for (const item of snapshot) {
    const current = draft.vtsRefusals.get(item.streakId);
    if (!current || current.tradeId !== item.tradeId || current.closed || current.decidedAtMs !== null) continue;
    const identity = { tradeId: current.tradeId, streakId: current.streakId };
    if (closed.has(current.tradeId)) {
      draft.recordVtsRefusal({ ...identity, kind: 'closed' });
      continue;
    }
    for (const crossing of current.crossings) {
      if (crossing.disposition || !isProvedVtsRefusalCrossing(current, crossing) ||
        !item.crossings.some(saved => saved.pageSinceMs === crossing.pageSinceMs && saved.observedAtMs === crossing.observedAtMs)) continue;

      const field = vtsRefusalReceiptField(current.streakId, crossing.pageSinceMs);
      const receipt = receipts.get(receiptKey(field, current.tradeId));
      if (receipt) {
        draft.recordVtsRefusal({
          ...identity, kind: 'disposition', pageSinceMs: crossing.pageSinceMs,
          disposition: {
            alertId: receipt.id,
            route: isVtsFeedIncidentAlert(receipt) ? 'incident' : receipt.dedupe_key === VTS_STANDING_KEY ? 'joined' : 'individual',
          },
        });
        continue;
      }
      const row = draft.add(recoveredWarning(current, crossing, nowMs, field));
      if (row.metadata[field] !== current.tradeId || railRowTradeId(row) !== current.tradeId) continue;
      draft.recordVtsRefusal({
        ...identity, kind: 'disposition', pageSinceMs: crossing.pageSinceMs,
        disposition: { alertId: row.id, route: 'individual' },
      });
    }
  }
}
