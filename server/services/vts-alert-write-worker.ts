import { parentPort } from 'node:worker_threads';
import { editAlertStore } from './system-alerts.js';
import type { VtsRefusalEvent } from '../core/trading/vts-refusal-evidence.js';

export type VtsAlertWrite =
  | { kind: 'individual-decision'; rowId: string; atMs: number }
  | { kind: 'refusal'; event: VtsRefusalEvent };

export type VtsAlertWriteResult = { written: boolean[] } | { error: string };

const port = parentPort;
if (!port) throw new Error('VTS alert writer requires a worker thread');

port.on('message', async (writes: VtsAlertWrite[]) => {
  try {
    const written = await editAlertStore((draft) => ({
      value: writes.map((write) => {
        if (write.kind === 'refusal') return draft.recordVtsRefusal(write.event);
        return draft.mergeMetadata(write.rowId, (current) => {
          const savedAtMs = current.decidedAtMs;
          return typeof savedAtMs === 'number' && savedAtMs >= write.atMs ? {} : { decidedAtMs: write.atMs };
        }) !== null;
      }),
    }));
    port.postMessage({ written } satisfies VtsAlertWriteResult);
  } catch (error) {
    port.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies VtsAlertWriteResult);
  }
});
