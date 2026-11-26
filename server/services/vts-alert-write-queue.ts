import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { VtsRefusalEvent } from '../core/trading/vts-refusal-evidence.js';
import type { VtsAlertWrite, VtsAlertWriteResult, VtsAlertWorkerMessage, VtsAlertWorkerRequest } from './vts-alert-write-worker.js';
import type { LiveRailSweep, LiveRailSweepResult, LiveWarning, LiveWarningResult } from './vts-live-warning.js';

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
  finish: (written: VtsAlertWriteResult) => void;
}

interface PendingReconciliation {
  nowMs: number;
  runId: string;
  closedTradeIds: (ids: string[]) => Promise<Set<string>>;
  rail?: LiveRailSweep;
  finish: (reconciled: boolean, rail?: LiveRailSweepResult) => void;
}

/** Keep exact refusal and decision observations until the same store writer responds. */
export class VtsAlertWriteQueue {
  private worker?: Worker;
  private scheduled?: NodeJS.Timeout;
  private inFlight?: { writes: PendingWrite[]; reconciliation?: PendingReconciliation };
  private reconciliation?: PendingReconciliation;
  private readonly pending = new Map<string, PendingWrite>();

  markDecision(rowId: string, atMs: number): Promise<boolean> | undefined {
    return this.enqueue(`alert:${rowId}`, { kind: 'individual-decision', rowId, atMs })?.then(result => result === true);
  }

  markLiveDecision(tradeId: string, atMs: number): Promise<boolean> | undefined {
    return this.enqueue(JSON.stringify(['live-decision', tradeId, atMs]), { kind: 'live-decision', tradeId, atMs })
      ?.then(result => result === true);
  }

  writeLiveWarning(warning: LiveWarning): Promise<LiveWarningResult | null> | undefined {
    const { crossing, action, nowMs } = warning;
    const key = JSON.stringify(['live-warning', action, crossing.tradeId, crossing.streakId, crossing.pageSinceMs, nowMs]);
    return this.enqueue(key, { ...warning, kind: 'live-warning' })?.then(result => typeof result === 'object' ? result : null);
  }

  recordRefusal(event: VtsRefusalEvent): Promise<boolean> | undefined {
    const run = 'pageSinceMs' in event ? event.pageSinceMs : null;
    const key = JSON.stringify([event.streakId, event.tradeId, event.kind, run]);
    return this.enqueue(key, { kind: 'refusal', event })?.then(result => result === true);
  }

  reconcileRefusals(
    nowMs: number, runId: string, closedTradeIds: (ids: string[]) => Promise<Set<string>>,
  ): Promise<boolean> | undefined {
    if (this.reconciliation) return;
    return new Promise<boolean>((finish) => {
      this.reconciliation = { nowMs, runId, closedTradeIds, finish };
      this.schedule(COALESCE_MS);
    });
  }

  sweepRail(
    nowMs: number, runId: string, closedTradeIds: (ids: string[]) => Promise<Set<string>>, rail: LiveRailSweep,
  ): Promise<{ reconciled: boolean; rail: LiveRailSweepResult } | null> | undefined {
    if (this.reconciliation) return;
    return new Promise((finish) => {
      this.reconciliation = {
        nowMs, runId, closedTradeIds, rail,
        finish: (reconciled, result) => finish(result ? { reconciled, rail: result } : null),
      };
      this.schedule(COALESCE_MS);
    });
  }

  private enqueue(key: string, write: VtsAlertWrite): Promise<VtsAlertWriteResult> | undefined {
    // An existing entry already owns its completion. Repeats add no waiters during a failed write.
    if (this.pending.has(key)) return;
    return new Promise<VtsAlertWriteResult>((finish) => {
      this.pending.set(key, { key, write, finish });
      this.schedule(COALESCE_MS);
    });
  }

  private schedule(delayMs: number): void {
    if (this.scheduled || this.inFlight || (!this.pending.size && !this.reconciliation)) return;
    this.scheduled = setTimeout(() => {
      this.scheduled = undefined;
      this.flush();
    }, delayMs);
    this.scheduled.unref();
  }

  private flush(): void {
    try {
      const worker = this.worker ?? this.attach(startWorker());
      const reconciliation = this.reconciliation;
      this.inFlight = { writes: [...this.pending.values()], reconciliation };
      const writes = this.inFlight.writes.map(({ write }) => write);
      const request: VtsAlertWorkerRequest = reconciliation
        ? { kind: 'reconcile', writes, nowMs: reconciliation.nowMs, runId: reconciliation.runId, rail: reconciliation.rail }
        : writes;
      worker.postMessage(request);
    } catch (error) {
      this.retry(error);
    }
  }

  private attach(worker: Worker): Worker {
    this.worker = worker;
    worker.on('message', (result: VtsAlertWorkerMessage) => {
      const batch = this.inFlight;
      if (this.worker !== worker || !batch) return;
      if ('kind' in result) {
        const request = batch.reconciliation;
        if (!request) return;
        void Promise.resolve().then(() => request.closedTradeIds(result.ids)).then(
          (closed) => [...closed],
          (error: unknown) => {
            console.error('[VTS_RAIL][RECOVERY_CLOSE_LOOKUP_FAILED]', error);
            return null;
          },
        ).then((ids) => {
          if (this.worker === worker && this.inFlight === batch) {
            try {
              worker.postMessage({ kind: 'closed-trades', ids } satisfies VtsAlertWorkerRequest);
            } catch (error) {
              this.worker = undefined;
              void worker.terminate().catch(() => {});
              this.retry(error);
            }
          }
        });
        return;
      }
      if ('error' in result) {
        this.retry(result.error);
        return;
      }
      if (result.written.length !== batch.writes.length) {
        this.retry('worker returned an incomplete alert batch');
        return;
      }
      this.inFlight = undefined;
      for (const [index, entry] of batch.writes.entries()) {
        this.pending.delete(entry.key);
        entry.finish(result.written[index]);
      }
      if (batch.reconciliation) {
        this.reconciliation = undefined;
        batch.reconciliation.finish(result.reconciled === true, result.rail);
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
      if (this.pending.size || this.reconciliation) this.retry(`worker exited with code ${code}`);
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
