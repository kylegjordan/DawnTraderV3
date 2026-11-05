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

export function engineNotRunningResponse(action: 'close the position' | 'clear stranded positions'): RouteResponse {
  return { http: 200, body: { success: false, error: `Paper trading simulation not running — start the engine, then ${action} from Active Trades.` } };
}

export function manualCloseResponse(positionId: string, r: OperatorCloseOutcome): RouteResponse {
  if (r.status === 'closed') {
    return { http: 200, body: { success: true, closedTradeId: positionId, message: `Closed ${r.symbol} position${r.reason ? ` (${r.reason})` : ''}` } };
  }
  if (r.status === 'not_found') return { http: 200, body: { success: false, error: 'Position not found (it may already have closed)' } };
  return { http: 200, body: { success: false, error: `${r.symbol ?? 'Position'} not closed: ${r.reason ?? r.status}` } };
}

export function strandedClearResponse(clearedCount: number, notCleared: Array<{ symbol: string; reason: string }>): RouteResponse {
  const ok = notCleared.length === 0;
  const message = ok
    ? `Cleared ${clearedCount} stranded position(s)`
    : `Cleared ${clearedCount}; ${notCleared.length} not cleared (${notCleared.map((n) => `${n.symbol}: ${n.reason}`).join('; ')})`;
  // BLOCKER-1b: a partial clear carries the message in `error` too — the client's failure branch reads `error`, so without
  // it "Cleared 4; 1 not cleared (…)" rendered as a bare "Failed to clear stranded trades".
  return { http: 200, body: { success: ok, strandedClosed: clearedCount, clearedCount, notCleared, message, ...(ok ? {} : { error: message }) } };
}
