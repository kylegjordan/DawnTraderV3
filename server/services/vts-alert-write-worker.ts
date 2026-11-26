import { parentPort } from 'node:worker_threads';
import { editAlertStore } from './system-alerts.js';

export interface VtsIndividualDecision {
  rowId: string;
  atMs: number;
}

export type VtsAlertWriteResult = { written: boolean[] } | { error: string };

const port = parentPort;
if (!port) throw new Error('VTS alert writer requires a worker thread');

port.on('message', async (marks: VtsIndividualDecision[]) => {
  try {
    const written = await editAlertStore((draft) => ({
      value: marks.map(({ rowId, atMs }) => draft.mergeMetadata(rowId, (current) => {
        const savedAtMs = current.decidedAtMs;
        return typeof savedAtMs === 'number' && savedAtMs >= atMs ? {} : { decidedAtMs: atMs };
      }) !== null),
    }));
    port.postMessage({ written } satisfies VtsAlertWriteResult);
  } catch (error) {
    port.postMessage({ error: error instanceof Error ? error.message : String(error) } satisfies VtsAlertWriteResult);
  }
});
