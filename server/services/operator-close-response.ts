/**
 * B-CLOSE-WRITER-COSTS P-10 (Langston Part B BLOCKER-1/1b): what the two operator routes send back, as pure functions so the
 * mapping is tested directly.
 *
 * ⛔ WHY EVERY REFUSAL IS HTTP 200 WITH `success: false` AND `error`: the Active Trades client's `apiFetch` THROWS on any
 * non-2xx (`client/src/lib/api.ts`), and both mutations' `onError` handlers show a bare "Failed to close trade" / "Failed to
 * clear stranded trades" — the honest reason (engine not running, fill contract, trade record) would be computed and then
 * discarded. Their `onSuccess` else-branch already shows `result.error`, so a 200 with `success:false` puts the reason on the
 * screen with no client change. (close-all keeps its own 400 — the same client defect sits there; recorded, not changed here.)
 */
export type OperatorCloseOutcome = { status: 'closed' | 'left_open' | 'failed' | 'not_found'; reason?: string; symbol?: string };
export type RouteResponse = { http: number; body: Record<string, unknown> };

export function engineNotRunningResponse(action: 'close the position' | 'close all positions'): RouteResponse {
  return { http: 200, body: { success: false, error: `Paper trading simulation not running — start the engine, then ${action} from Active Trades.` } };
}

export function manualCloseResponse(positionId: string, r: OperatorCloseOutcome): RouteResponse {
  if (r.status === 'closed') {
    return { http: 200, body: { success: true, closedTradeId: positionId, message: `Closed ${r.symbol} position${r.reason ? ` (${r.reason})` : ''}` } };
  }
  if (r.status === 'not_found') return { http: 200, body: { success: false, error: 'Position not found (it may already have closed)' } };
  return { http: 200, body: { success: false, error: `${r.symbol ?? 'Position'} not closed: ${r.reason ?? r.status}` } };
}

/**
 * Close-all (Kyle KD-45, 2026-11-05: the Active Trades "Clear Stranded" button is FOLDED into close-all — they had become the
 * same action). A partial result carries its message in `error` too, so the client's failure branch shows it.
 */
export function closeAllResponse(result: { closed: number; leftOpen: number; failed: number }): RouteResponse {
  const ok = result.failed === 0 && result.leftOpen === 0;
  const message = ok
    ? `All positions closed (${result.closed})`
    : `Closed ${result.closed}; ${result.leftOpen} left open (no observed price, or the close was refused — each one is alerted), ${result.failed} failed`;
  return { http: 200, body: { success: ok, ...result, message, ...(ok ? {} : { error: message }) } };
}
