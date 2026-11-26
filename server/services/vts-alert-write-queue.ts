import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { VtsRefusalEvent } from '../core/trading/vts-refusal-evidence.js';
import type { VtsAlertWrite, VtsAlertWriteResult } from './vts-alert-write-worker.js';

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

interface PendingWrite {
  key: string;
  write: VtsAlertWrite;
  finish: (written: boolean) => void;
}

/** Keep exact refusal and decision observations until the same store writer responds. */
export class VtsAlertWriteQueue {
  private worker?: Worker;
  private scheduled?: NodeJS.Timeout;
  private inFlight?: PendingWrite[];
  private readonly pending = new Map<string, PendingWrite>();

  markDecision(rowId: string, atMs: number): Promise<boolean> | undefined {
    return this.enqueue(`alert:${rowId}`, { kind: 'individual-decision', rowId, atMs });
  }

  recordRefusal(event: VtsRefusalEvent): Promise<boolean> | undefined {
    const run = 'pageSinceMs' in event ? event.pageSinceMs : null;
    const key = JSON.stringify([event.streakId, event.tradeId, event.kind, run]);
    return this.enqueue(key, { kind: 'refusal', event });
  }

  private enqueue(key: string, write: VtsAlertWrite): Promise<boolean> | undefined {
    // An existing entry already owns its completion. Repeats add no waiters during a failed write.
    if (this.pending.has(key)) return;
    return new Promise<boolean>((finish) => {
      this.pending.set(key, { key, write, finish });
      this.schedule(COALESCE_MS);
    });
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
      worker.postMessage(this.inFlight.map(({ write }) => write));
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
        this.retry('worker returned an incomplete alert batch');
        return;
      }
      this.inFlight = undefined;
      for (const [index, entry] of batch.entries()) {
        this.pending.delete(entry.key);
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
