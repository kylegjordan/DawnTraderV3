import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { VtsAlertWriteResult, VtsIndividualDecision } from './vts-alert-write-worker.js';

const COALESCE_MS = 10;
const RETRY_MS = 1_000;

function startWorker(): Worker {
  if (!import.meta.url.endsWith('.ts')) {
    return new Worker(new URL('./vts-alert-write-worker.js', import.meta.url));
  }
  const entry = new URL('./vts-alert-write-worker.ts', import.meta.url);
  const loader = pathToFileURL(createRequire(import.meta.url).resolve('tsx/esm/api')).href;
  const source = `import { tsImport } from ${JSON.stringify(loader)}; await tsImport(${JSON.stringify(entry.href)}, ${JSON.stringify(import.meta.url)});`;
  return new Worker(new URL(`data:text/javascript,${encodeURIComponent(source)}`), { execArgv: [] });
}

interface PendingDecision {
  mark: VtsIndividualDecision;
  committed: Promise<boolean>;
  finish: (written: boolean) => void;
}

/** Keep an exact individual alert's first observed decision until the store responds. */
export class VtsAlertWriteQueue {
  private worker?: Worker;
  private scheduled?: NodeJS.Timeout;
  private inFlight?: PendingDecision[];
  private readonly pending = new Map<string, PendingDecision>();

  markDecision(rowId: string, atMs: number): Promise<boolean> {
    const existing = this.pending.get(rowId);
    if (existing) return existing.committed;
    let finish!: PendingDecision['finish'];
    const committed = new Promise<boolean>((resolve) => { finish = resolve; });
    this.pending.set(rowId, { mark: { rowId, atMs }, committed, finish });
    this.schedule(COALESCE_MS);
    return committed;
  }

  private schedule(delayMs: number): void {
    if (this.scheduled || this.inFlight || this.pending.size === 0) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      this.flush();
    }, delayMs);
    this.scheduled.unref();
  }

  private flush(): void {
    try {
      const worker = this.worker ?? this.attach(startWorker());
      this.inFlight = [...this.pending.values()];
      worker.postMessage(this.inFlight.map(({ mark }) => mark));
    } catch (error) {
      this.retry(error);
    }
  }

  private attach(worker: Worker): Worker {
    this.worker = worker;
    worker.on('message', (result: VtsAlertWriteResult) => {
      const batch = this.inFlight;
      if (this.worker !== worker || !batch) return;
      if ('error' in result) {
        this.retry(result.error);
        return;
      }
      if (result.written.length !== batch.length) {
        this.retry('worker returned an incomplete decision batch');
        return;
      }
      this.inFlight = undefined;
      for (const [index, entry] of batch.entries()) {
        this.pending.delete(entry.mark.rowId);
        entry.finish(result.written[index]);
      }
      this.schedule(COALESCE_MS);
    });
    worker.on('error', (error) => {
      if (this.worker !== worker) return;
      this.worker = undefined;
      this.retry(error);
    });
    worker.on('exit', (code) => {
      if (this.worker !== worker) return;
      this.worker = undefined;
      if (this.pending.size) this.retry(`worker exited with code ${code}`);
    });
    worker.unref();
    return worker;
  }

  private retry(error: unknown): void {
    this.inFlight = undefined;
    console.error('[VTS_RAIL][DECISION_BATCH_FAILED]', error);
    this.schedule(RETRY_MS);
  }
}
