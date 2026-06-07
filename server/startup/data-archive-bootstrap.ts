/**
 * B70 Step 3.x — Data Archive Bootstrap
 *
 * One-shot startup wiring for the B70 data-archive layer. Called LAST in the
 * startup sequence (after tradingStateSync + run-mode controller + module-
 * constants resolver are all up).
 *
 * Order of operations:
 *  1. Refresh archive-config cache (reads 11 module_constants once)
 *  2. Apply queue-max from config to the batch writer
 *  3. Register all 4 archiver tables
 *  4. Start the periodic config refresh (60s)
 *  5. Start the batch-writer flush timer (5s)
 *
 * After this returns, archiver hooks throughout the codebase can call
 * `archivePairScan()` / `archiveSignalEval()` / `archiveExitDecision()` /
 * `archiveMacroSnapshot()` as fire-and-forget side effects.
 */

import {
  startArchiveBatchWriter,
  setQueueMax,
} from '../services/data-archive/archive-batch-writer.js';
import {
  startArchiveConfigRefresh,
  getArchiveConfig,
} from '../services/data-archive/archive-config.js';
import { ensureMacroArchiverRegistered } from '../services/data-archive/macro-feed-archiver.js';
import { ensurePairScanArchiverRegistered } from '../services/data-archive/pair-scan-archiver.js';
import { ensureSignalEvalArchiverRegistered } from '../services/data-archive/signal-eval-archiver.js';
import { ensureExitDecisionArchiverRegistered } from '../services/data-archive/exit-decision-archiver.js';
import { primeArchiveIdAllocator } from '../services/data-archive/archive-id-allocator.js';

let started = false;

export async function bootstrapDataArchive(): Promise<void> {
  if (started) return;
  try {
    // 1+4: refresh config + start periodic refresh
    await startArchiveConfigRefresh();

    // 2: apply queue-max
    const cfg = getArchiveConfig();
    setQueueMax(cfg.archiveWriterQueueMax);

    // 3: register all 4 partitioned archive tables
    ensureMacroArchiverRegistered();
    ensurePairScanArchiverRegistered();
    ensureSignalEvalArchiverRegistered(); // B-NEW-53: also registers signal_eval_provenance
    ensureExitDecisionArchiverRegistered();

    // B-NEW-53: prime the archive-id block allocator so the first xStock
    // decisions get a provenance link id without a hot-path DB round-trip.
    primeArchiveIdAllocator();

    // 5: start the flush timer
    startArchiveBatchWriter();

    started = true;
    console.log(
      `[B70] data-archive bootstrap complete (` +
        `pair_scan=${cfg.pairScanEnabled}, signal_eval=${cfg.signalEvalEnabled}, ` +
        `pre_filter=${cfg.signalEvalPreFilterEnabled}, exit=${cfg.exitDecisionEnabled}, ` +
        `macro=${cfg.macroFeedEnabled}, queueMax=${cfg.archiveWriterQueueMax})`,
    );
  } catch (err) {
    console.error(
      `[B70] data-archive bootstrap failed:`,
      err instanceof Error ? err.message : err,
    );
    // Do not throw — server start must not be blocked by archive layer.
  }
}
