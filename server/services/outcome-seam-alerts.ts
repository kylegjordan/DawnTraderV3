/**
 * B-CLOSE-WRITER-COSTS P-15 (pre-audit r3): the two exclusion counts of `countedTrades` that are WRITER DEFECTS under
 * KD-17 ("never drop a trade") are raised, not dropped quietly. Kept out of `dashboard-metrics.ts`, which is pure.
 *   - `unknownReason` ⇒ one alert per distinct reason, `close-reason-unknown-<mode>-<reason>`: a close was written with a
 *     reason outside `TradeCloseReason`, so no money figure counts it until it is classed.
 *   - `bookedWithoutExitPrice` ⇒ `booked-close-without-exit-price-<mode>`: a booked close with no exit price.
 * Both are RESOLVE-only (the condition is a row that exists; an ack would silence it while the row stays excluded).
 * The dedupe key holds one active alert per condition, so a route that runs every refresh raises it once.
 * Best-effort: an alert failure is logged and never fails the route that called it.
 */
import type { CountedTrades } from './dashboard-metrics';

export async function raiseOutcomeSeamAlerts(mode: string, route: string, seam: CountedTrades<unknown>): Promise<void> {
  if (seam.unknownReason === 0 && seam.bookedWithoutExitPrice === 0) return;
  try {
    const { addAlert } = await import('./system-alerts.js');
    for (const reason of seam.unknownReasons) {
      await addAlert({
        triggers_at: new Date(),
        category: 'breakage',
        severity: 'warning',
        title: `Closed trades with an unclassified close reason "${reason}" are excluded from every money figure`,
        body: `${route} (${mode}) found closed trade record(s) whose close reason "${reason}" is not in TradeCloseReason, `
          + `so they are counted nowhere until the reason is classed (server/services/trade-close-reason.ts) or the `
          + `writer is corrected. ${seam.unknownReason} row(s) across ${seam.unknownReasons.length} reason(s) in this read. `
          + `B-CLOSE-WRITER-COSTS P-15. DISPOSITION: RESOLVE, do not ACK.`,
        dedupe_key: `close-reason-unknown-${mode}-${reason || 'blank'}`,
      });
    }
    if (seam.bookedWithoutExitPrice > 0) {
      await addAlert({
        triggers_at: new Date(),
        category: 'breakage',
        severity: 'warning',
        title: `${seam.bookedWithoutExitPrice} booked close(s) have no exit price and are excluded from the money figures`,
        body: `${route} (${mode}) found ${seam.bookedWithoutExitPrice} closed trade record(s) with a booked close reason `
          + `and no exit price. A booked close must carry its exit (KD-17); the writer that produced them is defective. `
          + `B-CLOSE-WRITER-COSTS P-15. DISPOSITION: RESOLVE, do not ACK.`,
        dedupe_key: `booked-close-without-exit-price-${mode}`,
      });
    }
  } catch (err) {
    console.error(`[B-CLOSE-WRITER-COSTS][OUTCOME_SEAM_ALERT] ${route} (${mode}): addAlert failed:`, err);
  }
}
