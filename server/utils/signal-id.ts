/**
 * P19-B8.10 (OBJ-2): the active-path signal-ID mint, relocated VERBATIM from the
 * deleted SLAL service (signal_lifecycle_audit.ts:107 — the Phase 8.8.4-A audit
 * layer whose sole reader, the Ready-tab ExecutionMetricsPanel, was purged per
 * Kyle 2026-07-18). The format is a stored-data contract: signalIds minted here
 * appear in rtb_signals, active_open_positions.metadata.originalSignalId and
 * closed_trades rows — it must never change shape (pinned by
 * server/tests/unit/signal-id-format.test.ts).
 */
export function generateSignalId(symbol: string, strategy: string): string {
  return `${symbol}-${strategy}-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}
