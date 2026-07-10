/**
 * B-GOV-INTEGRITY-1 OBJ-2 — one-shot backfill of resolve provenance.
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * WHY: 249 of 249 resolved alerts predate F3b and carry no provenance — no
 * `resolved_at`, no `resolved_by_claimed`, no `resolution_evidence`. This script
 * adds an HONEST record to each, and NEVER fabricates one.
 *
 * THE ONE RULE (Langston + CC-B, 2026-07-10): do not invent provenance to make a
 * row look complete. A backfilled row that claimed "resolved 2026-06-14 by X with
 * evidence Y" would be a forgery with good posture — the exact #447/#455 disease.
 * So the backfill records only what is actually known and marks the rest unknown:
 *   - resolved_at            = the row's existing acknowledged_at, else null
 *                             (a RECONSTRUCTION from ack time, never a minted one)
 *   - resolved_by_claimed    = the row's existing acknowledged_by (the only
 *                             identity we actually have; verified present on all 249)
 *   - resolved_by_transport  = null — the channel was never recorded, and null is
 *                             the honest value for "unknown". (Deviation from the
 *                             scope's free-form sentinel: the field is a typed
 *                             ResolveTransport enum; null is truthful and keeps the
 *                             enum unpolluted. Flagged to Langston at Step-4.)
 *   - resolution_evidence    = 'provenance-unknown-pre-F3b' — a SANCTIONED sentinel
 *                             (RESOLUTION_EVIDENCE_SENTINELS), so a backfilled row
 *                             passes OBJ-1's own validator on any re-run.
 *
 * SAFETY (OBJ-5):
 *   - idempotent + no-clobber: a row that ALREADY carries any real provenance is
 *     never touched (zero such rows today; guarded regardless).
 *   - pre-image sha256 recorded; id-set conserved exactly (a SET diff, not a count
 *     — #495); reuses the store's own withLock + atomic write (no hand-rolled I/O).
 *   - ADDS fields only; never drops, re-states, or invalidates a row.
 *
 * USAGE:  tsx scripts/b-gov-integrity-1-backfill-resolve-provenance.ts [--apply]
 *   default = DRY RUN (reports what it would do, writes nothing).
 *   --apply = perform the migration under lock.
 */
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import {
  ALERTS_FILE,
  readAllAlerts,
  type SystemAlert,
} from '../server/services/system-alerts.js';

const BACKFILL_EVIDENCE = 'provenance-unknown-pre-F3b';

function hasAnyProvenance(a: SystemAlert): boolean {
  return (
    a.resolved_at != null ||
    a.resolved_by_claimed != null ||
    a.resolved_by_transport != null ||
    a.resolution_evidence != null
  );
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  if (!fs.existsSync(ALERTS_FILE)) {
    console.error(`[backfill] alerts file not found: ${ALERTS_FILE}`);
    process.exit(1);
  }
  const preBytes = fs.readFileSync(ALERTS_FILE);
  const preHash = crypto.createHash('sha256').update(preBytes).digest('hex');

  const before = readAllAlerts();
  const beforeIds = new Set(before.map((a) => a.id));

  const resolved = before.filter((a) => a.state === 'resolved');
  const targets = resolved.filter((a) => !hasAnyProvenance(a));
  const alreadyHasProvenance = resolved.length - targets.length;
  const missingAckIdentity = targets.filter((a) => !a.acknowledged_by).map((a) => a.id);

  console.log('─── B-GOV-INTEGRITY-1 OBJ-2 backfill ' + (apply ? '(APPLY)' : '(DRY RUN)') + ' ───');
  console.log(`  file            : ${ALERTS_FILE}`);
  console.log(`  pre sha256      : ${preHash}`);
  console.log(`  distinct alerts : ${before.length}`);
  console.log(`  resolved        : ${resolved.length}`);
  console.log(`  to backfill     : ${targets.length}`);
  console.log(`  already has prov: ${alreadyHasProvenance} (skipped — no-clobber)`);
  if (missingAckIdentity.length > 0) {
    // Honest handling: if a resolved row somehow has no acknowledged_by, we still
    // do not invent an identity — resolved_by_claimed stays null for it.
    console.warn(`  ⚠ ${missingAckIdentity.length} target(s) have no acknowledged_by; resolved_by_claimed will be null (not invented): ${missingAckIdentity.join(', ')}`);
  }

  if (targets.length === 0) {
    console.log('  nothing to do — every resolved row already carries provenance. (idempotent)');
    return;
  }

  if (!apply) {
    console.log('  DRY RUN — no write. Re-run with --apply to perform the migration.');
    return;
  }

  // Perform under the store's OWN lock + atomic write. We re-read inside the lock
  // (the value captured above may be stale by write time) and re-derive targets,
  // so a concurrent writer cannot be clobbered.
  const svc = await import('../server/services/system-alerts.js');
  // withLock + writeAllAlertsAtomic are module-internal; expose the migration
  // through a dedicated exported helper to keep the lock discipline in one place.
  const result = await svc.__backfillResolveProvenance__({
    evidence: BACKFILL_EVIDENCE,
  });

  const afterBytes = fs.readFileSync(ALERTS_FILE);
  const afterHash = crypto.createHash('sha256').update(afterBytes).digest('hex');
  const after = readAllAlerts();
  const afterIds = new Set(after.map((a) => a.id));

  const lost = [...beforeIds].filter((id) => !afterIds.has(id));
  const gained = [...afterIds].filter((id) => !beforeIds.has(id));

  console.log('─── result ───');
  console.log(`  rows backfilled : ${result.backfilled}`);
  console.log(`  post sha256     : ${afterHash}`);
  console.log(`  id-set conserved: ${lost.length === 0 && gained.length === 0} (lost=${JSON.stringify(lost)} gained=${JSON.stringify(gained)})`);
  console.log(`  count before/after: ${before.length} / ${after.length}`);
  if (lost.length !== 0 || gained.length !== 0) {
    console.error('  ✗ CONSERVATION FAILED — id set changed. Investigate before trusting this run.');
    process.exit(1);
  }
  // Verify every backfilled row now passes OBJ-1's validator (no self-contradiction).
  const stillInvalid = after.filter(
    (a) => a.state === 'resolved' && a.resolution_evidence != null &&
      !svc.isValidResolutionEvidence(a.resolution_evidence),
  );
  console.log(`  all resolved evidence passes OBJ-1 gate: ${stillInvalid.length === 0} (${stillInvalid.length} fail)`);
  if (stillInvalid.length !== 0) process.exit(1);
}

main().catch((err) => {
  console.error('[backfill] fatal:', err);
  process.exit(1);
});
