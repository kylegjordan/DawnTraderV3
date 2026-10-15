import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  evaluateCapacityGate,
  isCompleteVenueSession,
  type CapacityGateInputs,
} from '../../scripts/b-xstock-bar-availability-capacity-gate.js';

const GIB = 1024 ** 3;

function passingInputs(): CapacityGateInputs {
  return {
    elapsedMs: 9 * 86_400_000,
    completeUtcCalendarDays: 8,
    completeVenueSessions: 5,
    revisionEvents: 100_000,
    symbols: 400,
    distinctRevisionIds: 100_000,
    distinctVisibleSeqs: 100_000,
    expectedRevisionLinks: 100_000,
    missingLinkedRevisionEvents: 0,
    unlinkedRevisionEvents: 0,
    pendingCertificates: 0,
    unhealthyCertificates: 0,
    negativeCertificateLags: 0,
    repeatedPayloadAttempts: 2_000,
    appliedWinners: 95_000,
    rejectedOlderArrivals: 5_000,
    admissionFlushRows: 100,
    admissionDistinctFlushIds: 100,
    completionFlushRows: 100,
    completionDistinctFlushIds: 100,
    orphanAdmissions: 0,
    admissionCompletionMismatches: 0,
    observationContractMismatches: 0,
    telemetryProjectionAttempts: 100_000,
    telemetryAcceptedFrames: 101_000,
    telemetryBufferSuperseded: 1_000,
    telemetryRepeatedPayloadAttempts: 2_000,
    telemetryAppliedWinners: 95_000,
    telemetryRejectedOlderArrivals: 5_000,
    writerBoots: 1,
    writerBootStarts: 1,
    writerBootDistinctIds: 1,
    contributingBootsWithoutStart: 0,
    requiredWriterHandoffs: 0,
    cleanWriterHandoffs: 0,
    writerChainBreaks: 0,
    writerHandoffMismatches: 0,
    latestBootOpen: true,
    latestBootBuildSha: 'a'.repeat(40),
    contributingWriterBuildShas: ['a'.repeat(40)],
    writerBootBuildShas: ['a'.repeat(40)],
    archiveProducingBuildShas: ['a'.repeat(40)],
    gradedRef: 'a'.repeat(40),
    reviewedRefs: ['a'.repeat(40)],
    maxCompleteDayWholeStoreBytes: 2 * GIB,
    databaseBytes: 140 * GIB,
    newIndexBytes: 4 * GIB,
    archiveProof: true,
    cryptoControlRows: 1,
    buildIdentityMatches: true,
    planCapMb: 204_800,
    criticalThreshold: 0.8,
    venueSessionMaxGapSeconds: 60,
    revisionHotRetentionDays: 8,
    gradedWindowStartMatches: true,
  };
}

describe('B-XSTOCK-BAR-AVAILABILITY observation gate', () => {
  it('requires boundary coverage and the pre-registered 60-second global gap ceiling', () => {
    const complete = {
      sessionStart: '2026-10-11T00:00:00Z',
      sessionEnd: '2026-10-12T00:00:00Z',
      revisionEvents: 50_000,
      firstEventAt: '2026-10-11T00:00:05Z',
      lastEventAt: '2026-10-11T23:59:55Z',
      maxEventGapSeconds: 5.2,
    };
    expect(isCompleteVenueSession(complete, 60)).toBe(true);
    expect(isCompleteVenueSession({ ...complete, maxEventGapSeconds: 60.001 }, 60)).toBe(false);
    expect(isCompleteVenueSession({ ...complete, firstEventAt: '2026-10-11T00:01:01Z' }, 60))
      .toBe(false);
    expect(isCompleteVenueSession({ ...complete, revisionEvents: 0 }, 60)).toBe(false);
  });

  it('passes only when every quality, identity, archive, build, and capacity check passes', () => {
    expect(evaluateCapacityGate(passingInputs()).pass).toBe(true);
    const mutations: Array<Partial<CapacityGateInputs>> = [
      { completeVenueSessions: 4 },
      { distinctVisibleSeqs: 99_999 },
      { expectedRevisionLinks: 99_999 },
      { missingLinkedRevisionEvents: 1 },
      { unlinkedRevisionEvents: 1 },
      { admissionDistinctFlushIds: 99 },
      { completionDistinctFlushIds: 99 },
      { completionFlushRows: 99 },
      { orphanAdmissions: 1, completionFlushRows: 99 },
      { admissionCompletionMismatches: 1 },
      { observationContractMismatches: 1 },
      { telemetryRepeatedPayloadAttempts: 1_999 },
      { telemetryAppliedWinners: 94_999 },
      { telemetryRejectedOlderArrivals: 5_001 },
      { writerBootStarts: 2, writerBootDistinctIds: 1 },
      { contributingBootsWithoutStart: 1 },
      { requiredWriterHandoffs: 1, cleanWriterHandoffs: 0 },
      { writerChainBreaks: 1 },
      { writerHandoffMismatches: 1 },
      { latestBootOpen: false },
      { latestBootBuildSha: 'b'.repeat(40) },
      { contributingWriterBuildShas: ['a'.repeat(40), 'b'.repeat(40)] },
      { contributingWriterBuildShas: ['b'.repeat(40)] },
      { writerBootBuildShas: ['b'.repeat(40)] },
      { archiveProducingBuildShas: ['b'.repeat(40)] },
      { archiveProof: false },
      { cryptoControlRows: 0 },
      { buildIdentityMatches: false },
      { planCapMb: 200_000 },
      { criticalThreshold: 0.79 },
      { venueSessionMaxGapSeconds: 61 },
      { revisionHotRetentionDays: 7 },
      { gradedWindowStartMatches: false },
      { databaseBytes: 153 * GIB },
    ];
    for (const mutation of mutations) {
      expect(evaluateCapacityGate({ ...passingInputs(), ...mutation }).pass, JSON.stringify(mutation))
        .toBe(false);
    }
  });

  it('accepts multiple reviewed builds only with a complete clean-handoff chain', () => {
    const first = 'a'.repeat(40);
    const second = 'b'.repeat(40);
    const verdict = evaluateCapacityGate({
      ...passingInputs(),
      writerBoots: 2,
      writerBootStarts: 2,
      writerBootDistinctIds: 2,
      requiredWriterHandoffs: 1,
      cleanWriterHandoffs: 1,
      latestBootBuildSha: second,
      contributingWriterBuildShas: [first, second],
      writerBootBuildShas: [first, second],
      archiveProducingBuildShas: [first],
      gradedRef: second,
      reviewedRefs: [first, second],
    });
    expect(verdict.checks.continuousWriterHandoffs).toBe(true);
    expect(verdict.checks.allContributingBuildsReviewed).toBe(true);
    expect(verdict.pass).toBe(true);
  });

  it('fails the gate when an admitted flush has no atomic completion', () => {
    const verdict = evaluateCapacityGate({
      ...passingInputs(),
      completionFlushRows: 99,
      completionDistinctFlushIds: 99,
      orphanAdmissions: 1,
    });
    expect(verdict.checks.durableFlushPopulation).toBe(false);
    expect(verdict.pass).toBe(false);
  });

  it('keeps evidence on rollback and registers only the exact revision ledger in B75', () => {
    const root = process.cwd();
    const migration = fs.readFileSync(path.join(
      root,
      'drizzle/migrations/2026-10-15-b-xstock-bar-availability-observation.sql',
    ), 'utf8');
    const rollback = fs.readFileSync(path.join(
      root,
      'drizzle/migrations/2026-10-15-b-xstock-bar-availability-observation-rollback.sql',
    ), 'utf8');
    const sweep = fs.readFileSync(path.join(root, 'server/scripts/b75-retention-sweep.ts'), 'utf8');
    const handoffMigration = fs.readFileSync(path.join(
      root,
      'drizzle/migrations/2026-10-15-c-xstock-bar-availability-handoff.sql',
    ), 'utf8');

    expect(migration).toContain("'xstock_bar_revision_event.hot_retention_days', '8'::jsonb");
    expect(migration).toContain("'venue_session_max_gap_seconds', '60'::jsonb");
    expect(migration).toContain("'graded_window_start', to_jsonb('2026-10-16T00:05:00Z'::text)");
    expect(migration).toContain('accepted_input_frames - buffer_superseded = projection_attempts');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS xstock_bar_projection_flush_admission');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS xstock_bar_projection_flush_completion');
    expect(migration).toContain('writer_build_sha text NOT NULL');
    expect(migration).toContain('population_hash text NOT NULL');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS xstock_bar_archive_exact_evidence');
    expect(migration).toContain('source_row_count = downloaded_row_count');
    expect(migration).toContain('ON CONFLICT (flush_id) DO NOTHING');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('IF FOUND THEN');
    expect(migration).toContain('FROM apply_xstock_bar_revision_events(');
    expect(migration).toContain('BEFORE TRUNCATE ON xstock_bar_projection_flush_admission');
    expect(migration).toContain('BEFORE TRUNCATE ON xstock_bar_projection_flush_completion');
    expect(migration).toContain('BEFORE TRUNCATE ON xstock_bar_archive_exact_evidence');
    expect(migration).toContain('ON xstock_bar_revision_event (arrived_at, revision_id)');
    expect(handoffMigration).toContain('CREATE TABLE IF NOT EXISTS xstock_bar_writer_boot_start');
    expect(handoffMigration).toContain('CREATE TABLE IF NOT EXISTS xstock_bar_writer_handoff');
    expect(handoffMigration).toContain('accepted_input_frames - buffer_superseded = projection_attempts');
    expect(handoffMigration).toContain('admission_flushes = completion_flushes');
    expect(handoffMigration).toContain('BEFORE TRUNCATE ON xstock_bar_writer_boot_start');
    expect(handoffMigration).toContain('BEFORE TRUNCATE ON xstock_bar_writer_handoff');
    expect(rollback).not.toMatch(/DROP TABLE|DROP INDEX|DELETE FROM xstock_bar_projection_flush/i);
    expect(sweep.match(/parent: 'xstock_bar_revision_event'/g)).toHaveLength(1);
    expect(sweep).toContain("exactCursorTieBreakerColumn: 'revision_id'");
    expect(sweep).toContain("exactCursorTieBreakerType: 'uuid'");
    const uploadedAt = sweep.indexOf('await updateManifestUploaded');
    const evidenceAt = sweep.indexOf('await recordExactArchiveEvidence', uploadedAt);
    const verifiedAt = sweep.indexOf('await updateManifestVerified', evidenceAt);
    expect(evidenceAt).toBeGreaterThan(0);
    expect(evidenceAt).toBeGreaterThan(uploadedAt);
    expect(verifiedAt).toBeGreaterThan(uploadedAt);
    expect(verifiedAt).toBeGreaterThan(evidenceAt);
    expect(sweep).not.toMatch(/parent: 'xstock_bar_(aggregate_revision|window_manifest|projection_flush)'/);
  });

  it('owns shutdown in the exiting handler and orders intake fence, drain, handoff, then exit', () => {
    const root = process.cwd();
    const index = fs.readFileSync(path.join(root, 'server/index.ts'), 'utf8');
    const orchestrator = fs.readFileSync(path.join(root, 'server/core/boot_orchestrator.ts'), 'utf8');
    const bootstrap = fs.readFileSync(path.join(
      root,
      'server/startup/passive-archive-bootstrap.ts',
    ), 'utf8');
    const writer = fs.readFileSync(path.join(
      root,
      'server/services/passive-archive/ohlc-batch-writer.ts',
    ), 'utf8');

    const drainAt = index.indexOf('await drainArchiveBuffersForShutdown()');
    const exitAt = index.indexOf('process.exit(0)', drainAt);
    expect(drainAt).toBeGreaterThan(0);
    expect(exitAt).toBeGreaterThan(drainAt);
    expect(orchestrator).not.toContain('drainArchiveBuffersForShutdown');

    const registerAt = bootstrap.indexOf('await registerXstockWriterBootStart()');
    const writerStartAt = bootstrap.indexOf('startBatchWriter()', registerAt);
    expect(registerAt).toBeGreaterThan(0);
    expect(writerStartAt).toBeGreaterThan(registerAt);

    const fenceAt = writer.indexOf('xstockIntakeAccepting = false');
    const feedStopAt = writer.indexOf('stopEquitySpotArchiver()', fenceAt);
    const finalDrainAt = writer.indexOf('stopBatchWriter()', feedStopAt);
    const handoffAt = writer.indexOf('await recordXstockWriterHandoff(handoffState)', finalDrainAt);
    expect(fenceAt).toBeGreaterThan(0);
    expect(feedStopAt).toBeGreaterThan(fenceAt);
    expect(finalDrainAt).toBeGreaterThan(feedStopAt);
    expect(handoffAt).toBeGreaterThan(finalDrainAt);
  });
});
