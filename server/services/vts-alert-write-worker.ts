import { parentPort } from 'node:worker_threads';
import { editAlertStore, readVtsRefusalEvidence } from './system-alerts.js';
import type { VtsRefusalEvent } from '../core/trading/vts-refusal-evidence.js';
import { reconcileVtsRefusals, recoverableVtsRefusals } from './vts-refusal-reconciliation.js';

export type VtsAlertWrite =
  | { kind: 'individual-decision'; rowId: string; atMs: number }
  | { kind: 'refusal'; event: VtsRefusalEvent };

export type VtsAlertWorkerRequest =
  | VtsAlertWrite[]
  | { kind: 'reconcile'; writes: VtsAlertWrite[]; nowMs: number; runId: string }
  | { kind: 'closed-trades'; ids: string[] | null };

export type VtsAlertWorkerMessage =
  | { written: boolean[]; reconciled?: boolean }
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
    const snapshot = recovery ? recoverableVtsRefusals(readVtsRefusalEvidence(), recovery.runId) : [];
    const requestedIds = new Set(snapshot.map(item => item.tradeId));
    const closedIds = snapshot.length ? await new Promise<string[] | null>((resolve) => {
      receiveClosedTrades = resolve;
      port.postMessage({ kind: 'lookup-closed', ids: [...requestedIds] } satisfies VtsAlertWorkerMessage);
    }) : [];
    receiveClosedTrades = undefined;
    const closed = closedIds && new Set(closedIds.filter(id => requestedIds.has(id)));

    const written = writes.length || (closed && snapshot.length) ? await editAlertStore((draft) => {
      const results = writes.map((write) => {
        if (write.kind === 'refusal') return draft.recordVtsRefusal(write.event);
        return draft.mergeMetadata(write.rowId, (current) => {
          const savedAtMs = current.decidedAtMs;
          return typeof savedAtMs === 'number' && savedAtMs >= write.atMs ? {} : { decidedAtMs: write.atMs };
        }) !== null;
      });
      if (recovery && closed && snapshot.length) reconcileVtsRefusals(draft, snapshot, closed, recovery.nowMs);
      return { value: results };
    }) : [];
    port.postMessage({ written, reconciled: recovery ? closed !== null : undefined } satisfies VtsAlertWorkerMessage);
  } catch (error) {
    receiveClosedTrades = undefined;
    port.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies VtsAlertWorkerMessage);
  }
});
