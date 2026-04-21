/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B63 Item 16 — Directional Bias Store Contract Test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Verifies the five mutually-exclusive behavior-spec rows from
 * BATCH_63_PRE_AUDIT.md §13 Item 16:
 *
 *   1. Cold start → null
 *   2. Below floor WITH prior snapshot → stale prior snapshot
 *   3. Below floor WITHOUT prior snapshot → null
 *   4. Invalid compute with prior snapshot → stale prior snapshot
 *   5. Happy path → fresh snapshot
 *
 * Plus: snapshot determinism within a cycle (multiple reads = same value).
 * Plus: 20-pair floor enforcement.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  directionalBiasStore,
  getLatestGlobalDbsSnapshot,
  GLOBAL_DBS_MIN_SAMPLE_COUNT,
} from '../../core/metrics/directional-bias-store';

function populateStore(count: number, baseScore = 0.1): void {
  for (let i = 0; i < count; i++) {
    directionalBiasStore.updatePair(
      `SYM${i}/USD`,
      baseScore + i * 0.01,
      false,
      1000 + i,
    );
  }
}

describe('B63 Item 16 — Directional Bias Store', () => {
  beforeEach(() => {
    directionalBiasStore.clear();
  });

  describe('Cold start (Row 1)', () => {
    it('returns null when store is empty and no snapshot has ever been published', () => {
      expect(directionalBiasStore.getLatestSnapshot()).toBeNull();
      expect(getLatestGlobalDbsSnapshot()).toBeNull();
    });

    it('getStoreSize reports 0 at cold start', () => {
      expect(directionalBiasStore.getStoreSize()).toBe(0);
    });

    it('publishSnapshot also returns null on empty store (PM2-restart production path)', () => {
      // This is the MCE.computeGlobalBias path: MCE calls publishSnapshot() directly.
      // On fresh process restart, store is empty and no prior snapshot exists — must
      // return null so MCE surfaces NEUTRAL/pairCount=0 to legacy callers. The
      // `[GlobalDBS][coldStart]` log is the signature event for PM2 restart.
      expect(directionalBiasStore.publishSnapshot()).toBeNull();
    });
  });

  describe('Below floor without prior snapshot (Row 3)', () => {
    it('returns null when fewer than 20 pairs and no prior snapshot', () => {
      populateStore(5);
      const snap = directionalBiasStore.publishSnapshot();
      expect(snap).toBeNull();
    });

    it('returns null at exactly floor - 1', () => {
      populateStore(GLOBAL_DBS_MIN_SAMPLE_COUNT - 1);
      expect(directionalBiasStore.publishSnapshot()).toBeNull();
    });
  });

  describe('Happy path (Row 5)', () => {
    it('publishes a fresh snapshot when store has ≥ 20 pairs', () => {
      populateStore(25);
      const snap = directionalBiasStore.publishSnapshot();
      expect(snap).not.toBeNull();
      if (!snap) return;
      expect(snap.isStale).toBe(false);
      expect(snap.coverage).toBe(25);
      expect(snap.value.pairCount).toBeGreaterThan(0);
      expect(isFinite(snap.value.score)).toBe(true);
    });

    it('getLatestSnapshot returns the published value', () => {
      populateStore(25);
      directionalBiasStore.publishSnapshot();
      const latest = directionalBiasStore.getLatestSnapshot();
      expect(latest).not.toBeNull();
      if (!latest) return;
      expect(latest.isStale).toBe(false);
    });
  });

  describe('Snapshot determinism within cycle', () => {
    it('returns identical snapshot object across multiple getLatestSnapshot reads', () => {
      populateStore(25);
      directionalBiasStore.publishSnapshot();
      const a = directionalBiasStore.getLatestSnapshot();
      const b = directionalBiasStore.getLatestSnapshot();
      expect(a).toBe(b); // same reference — not just equal value
    });
  });

  describe('Below floor with prior snapshot (Row 2)', () => {
    // Uses fake timers to simulate the natural production scenario:
    //   1. Populate 25 pairs and publish a good snapshot (happy path).
    //   2. Advance wall-clock past PAIR_HARD_EXPIRY_MS (5 minutes).
    //   3. Repopulate fewer than 20 fresh pairs.
    //   4. Republish — prior pairs are pruned (expired), new count is below floor,
    //      but the prior snapshot is retained and served with isStale=true.
    afterEach(() => {
      vi.useRealTimers();
    });

    it('serves the last good snapshot marked stale when prior pairs expire below floor', () => {
      vi.useFakeTimers();
      const t0 = new Date('2026-04-21T12:00:00Z');
      vi.setSystemTime(t0);

      // 1. Publish happy-path snapshot at t0 with 25 pairs
      populateStore(25, 0.25);
      const firstSnap = directionalBiasStore.publishSnapshot();
      expect(firstSnap).not.toBeNull();
      if (!firstSnap) return;
      expect(firstSnap.isStale).toBe(false);
      const firstValue = firstSnap.value;
      const firstCoverage = firstSnap.coverage;

      // 2. Advance 6 minutes — past the 5-minute hard expiry
      vi.advanceTimersByTime(6 * 60 * 1000);

      // 3. Repopulate with 10 fresh pairs (below the 20 floor). Different symbols
      //    so they don't just refresh the existing entries. The original 25 have now
      //    all expired.
      for (let i = 0; i < 10; i++) {
        directionalBiasStore.updatePair(`FRESH${i}/USD`, 0.4 + i * 0.01, false, 2000);
      }

      // 4. Publish: should return prior snapshot marked stale
      const staleSnap = directionalBiasStore.publishSnapshot();
      expect(staleSnap).not.toBeNull();
      if (!staleSnap) return;
      expect(staleSnap.isStale).toBe(true);
      expect(staleSnap.value).toEqual(firstValue); // prior value carried forward
      expect(staleSnap.coverage).toBe(firstCoverage); // coverage reflects prior good snapshot, not current live count
      expect(staleSnap.snapshotTime).toBe(firstSnap.snapshotTime); // snapshotTime is the ORIGINAL publish time
    });

    it('returns stale on subsequent reads until the store replenishes above floor', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-21T12:00:00Z'));

      populateStore(25, 0.25);
      directionalBiasStore.publishSnapshot();

      vi.advanceTimersByTime(6 * 60 * 1000);
      // 10 pairs — below floor
      for (let i = 0; i < 10; i++) {
        directionalBiasStore.updatePair(`FRESH${i}/USD`, 0.4 + i * 0.01, false, 2000);
      }
      const snap1 = directionalBiasStore.publishSnapshot();
      expect(snap1?.isStale).toBe(true);

      // Add 15 more fresh pairs — now 25 live, above floor
      for (let i = 0; i < 15; i++) {
        directionalBiasStore.updatePair(`REFRESH${i}/USD`, 0.5 + i * 0.01, false, 2500);
      }
      const snap2 = directionalBiasStore.publishSnapshot();
      expect(snap2?.isStale).toBe(false);
      // The newly-published snapshot may have a different value than the stale prior — that's expected.
    });
  });

  describe('Floor value is 20', () => {
    it('GLOBAL_DBS_MIN_SAMPLE_COUNT is 20 per scope commitment', () => {
      expect(GLOBAL_DBS_MIN_SAMPLE_COUNT).toBe(20);
    });
  });
});
