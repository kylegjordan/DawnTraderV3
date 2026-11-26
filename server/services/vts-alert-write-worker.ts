import { parentPort } from 'node:worker_threads';
import { editAlertStore, readVtsAlertSnapshot } from './system-alerts.js';
import type { VtsRefusalEvent } from '../core/trading/vts-refusal-evidence.js';
import { reconcileVtsRefusals, recoverableVtsRefusals } from './vts-refusal-reconciliation.js';
import {
  openVtsRail, standingMembers, sweepLiveWarnings, writeLiveDecision, writeLiveWarning,
  type LiveRailSweep, type LiveRailSweepResult, type LiveWarning, type LiveWarningResult,
} from './vts-live-warning.js';
import { railRowTradeId } from '../core/trading/vts-rail.js';
import { openVtsFeedIncidents, outstandingVtsIncidentTrades, saveVtsIncidentRecoveryProof } from './vts-feed-incident-members.js';
import type { VtsIncidentRecoveryProof } from './vts-feed-incident-recovery.js';

export type VtsAlertWrite =
  | { kind: 'individual-decision'; rowId: string; atMs: number }
  | { kind: 'live-decision'; tradeId: string; atMs: number }
  | ({ kind: 'live-warning' } & LiveWarning)
  | { kind: 'incident-recovery-proof'; proof: VtsIncidentRecoveryProof; atMs: number }
  | { kind: 'refusal'; event: VtsRefusalEvent };

export type VtsAlertWriteResult = boolean | LiveWarningResult | null;

export type VtsAlertWorkerRequest =
  | VtsAlertWrite[]
  | { kind: 'reconcile'; writes: VtsAlertWrite[]; nowMs: number; runId: string; rail?: LiveRailSweep }
  | { kind: 'closed-trades'; ids: string[] | null };

export type VtsAlertWorkerMessage =
  | { written: VtsAlertWriteResult[]; reconciled?: boolean; rail?: LiveRailSweepResult }
  | { error: string }
  | { kind: 'lookup-closed'; ids: string[] };

const port = parentPort;
if (!port) throw new Error('VTS alert writer requires a worker thread');

let receiveClosedTrades: ((ids: string[] | null) => void) | undefined;

port.on('message', async (request: VtsAlertWorkerRequest) => {
  if (!Array.isArray(request) && request.kind === 'closed-trades') {
    receiveClosedTrades?.(request.ids);
    return;
  }
  try {
    const recovery = Array.isArray(request) ? undefined : request;
    const writes = Array.isArray(request) ? request : request.writes;
    const stored = recovery ? readVtsAlertSnapshot() : undefined;
    const snapshot = recovery && stored ? recoverableVtsRefusals(stored.refusals, recovery.runId) : [];
    const requestedIds = new Set(snapshot.map(item => item.tradeId));
    if (recovery?.rail && stored) {
      const { warnings, standing } = openVtsRail(stored.rows);
      for (const row of warnings) {
        const tradeId = railRowTradeId(row);
        if (tradeId) requestedIds.add(tradeId);
      }
      for (const [tradeId] of standingMembers(standing)) requestedIds.add(tradeId);
      for (const incident of openVtsFeedIncidents(stored.rows)) {
        for (const tradeId of outstandingVtsIncidentTrades(incident)) requestedIds.add(tradeId);
      }
    }
    const closedIds = requestedIds.size ? await new Promise<string[] | null>((resolve) => {
      receiveClosedTrades = resolve;
      port.postMessage({ kind: 'lookup-closed', ids: [...requestedIds] } satisfies VtsAlertWorkerMessage);
    }) : [];
    receiveClosedTrades = undefined;
    const closed = closedIds && new Set(closedIds.filter(id => requestedIds.has(id)));

    const result = writes.length || recovery?.rail || (closed && snapshot.length) ? await editAlertStore((draft) => {
      const written = writes.map((write) => {
        if (write.kind === 'refusal') return draft.recordVtsRefusal(write.event);
        if (write.kind === 'live-warning') return writeLiveWarning(draft, write);
        if (write.kind === 'live-decision') return writeLiveDecision(draft, write.tradeId, write.atMs);
        if (write.kind === 'incident-recovery-proof') return saveVtsIncidentRecoveryProof(draft, write.proof, write.atMs);
        return draft.mergeMetadata(write.rowId, (current) => {
          const savedAtMs = current.decidedAtMs;
          return typeof savedAtMs === 'number' && savedAtMs >= write.atMs ? {} : { decidedAtMs: write.atMs };
        }) !== null;
      });
      if (recovery && closed && snapshot.length) reconcileVtsRefusals(draft, snapshot, closed, recovery.nowMs);
      const rail = recovery?.rail ? sweepLiveWarnings(draft, closed, requestedIds, recovery.nowMs, recovery.rail) : undefined;
      return { value: { written, rail } };
    }) : { written: [], rail: undefined };
    port.postMessage({ ...result, reconciled: recovery ? closed !== null : undefined } satisfies VtsAlertWorkerMessage);
  } catch (error) {
    receiveClosedTrades = undefined;
    port.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies VtsAlertWorkerMessage);
  }
});
