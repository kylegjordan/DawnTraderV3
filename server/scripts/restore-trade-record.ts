/**
 * B-CLOSE-WRITER-COSTS P-12 — the operator's invoker for the trade-record restore (Langston Part B BLOCKER-2: the route has
 * no client caller and the shell API tool refuses writes, so without this nobody could run the remedy).
 *
 * When a close is refused because a position's open trade record is MISSING (alert `close-record-unresolved-<mode>-<symbol>`),
 * run on staging, as the deploy user, from the app directory:
 *
 *   npx tsx server/scripts/restore-trade-record.ts <positionId> --by <actor>
 *
 * `--by` must be a canonical actor (`ALERT_ACTORS` in server/services/system-alerts.ts; anything else is refused) and is
 * recorded as `restored_by_claimed`. Paper mode only — the only engine that exists. The restore refuses (exit 2) when an
 * open record already exists, when several exist, when the position's own record exists, or when the position carries no
 * entry fee or slippage; nothing is written then. A `--by` that is not a canonical actor also exits 2, before any read.
 * The position id is the FIRST argument that is not a flag, so put it first: `--by cc-a <id>` would read `cc-a` as the
 * id (it fails safe — 404, nothing written). Exit 1 = a usage error or an unexpected failure.
 * After a successful restore the next close cycle finishes the record with the real exit.
 */
import 'dotenv/config';
import { assertAlertActor } from '../services/system-alerts.js';
import { restoreOpenTradeRecord } from '../services/trade-record-restore.js';

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const positionId = args.find((a) => !a.startsWith('--'));
  const byAt = args.indexOf('--by');
  const by = byAt >= 0 ? args[byAt + 1] : undefined;
  if (!positionId || !by) {
    console.error('usage: npx tsx server/scripts/restore-trade-record.ts <positionId> --by <actor>   (position id FIRST)');
    return 1;
  }
  let actor: string;
  try {
    actor = assertAlertActor(by);
  } catch (err) {
    console.error(`[restore-trade-record] REFUSED: ${err instanceof Error ? err.message : String(err)}`);
    return 2;
  }
  const r = await restoreOpenTradeRecord('paper', positionId, actor);
  if (!r.ok) {
    console.error(`[restore-trade-record] REFUSED (${r.code}): ${r.error}${r.recordId ? ` record=${r.recordId}` : ''}${r.recordIds ? ` records=${r.recordIds.join(',')}` : ''}`);
    return 2;
  }
  console.log(`[restore-trade-record] RESTORED ${r.symbol} position ${r.positionId} -> record ${r.recordId}${r.pending ? ' (pending maker)' : ''}`);
  // P-14 (Langston Part C record 1): a trade booked moments ago would show up here — check it is not this same trade.
  console.log(r.latestClosed
    ? `[restore-trade-record] latest CLOSED record for ${r.symbol}: ${r.latestClosed.id} (${r.latestClosed.closeReason ?? 'no reason'}, closed ${r.latestClosed.closedAt}) — if it closed moments ago, check it is not this same trade`
    : `[restore-trade-record] no CLOSED record exists for ${r.symbol} in this mode and class`);
  return 0;
}

main().then((code) => process.exit(code), (err) => { console.error('[restore-trade-record] FAILED:', err); process.exit(1); });
