/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B63 Item 16 — Directional Bias Store (Persistent per-pair DBS + atomic snapshot)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Replaces the opportunistic-cache-read approach with:
 *   1. Persistent per-pair DBS entries with timestamps (hard expiry 5 minutes)
 *   2. End-of-cycle atomic snapshot publish
 *   3. Fixed 20-pair floor (replaces prior 70% coverage gate)
 *
 * Consumers read `getLatestGlobalDbsSnapshot()` and receive a deterministic
 * value within any given cycle. Stale / cold-start / below-floor / invalid-compute
 * states are explicit via snapshot.isStale and/or `null` returns.
 *
 * Behavior spec (from BATCH_63_PRE_AUDIT.md §13 Item 16) — five mutually-exclusive
 * situations, each with explicit behavior and log:
 *
 *   1. Cold start (empty store, no prior snapshot)
 *        → return null; log `[GlobalDBS][coldStart] snapshot unavailable, store has N pairs, floor 20`
 *   2. Sample count below floor AND a prior good snapshot exists
 *        → return last good snapshot with isStale: true; log `[GlobalDBS][degradedCoverage] serving stale snapshot, liveStore=N, floor 20`
 *   3. Sample count below floor AND no prior snapshot exists
 *        → return null; log `[GlobalDBS][noSnapshot] store below floor and no prior snapshot; returning null`
 *   4. Sample count ≥ 20 BUT computed value is invalid (NaN / non-finite)
 *        → keep last good snapshot with isStale: true; log `[GlobalDBS][invalidCompute] kept prior snapshot`
 *   5. Sample count ≥ 20 and compute succeeds (happy path)
 *        → publish fresh snapshot with isStale: false; no explicit log (normal operation)
 *
 * Key principle: `null` and `isStale: true` are DIFFERENT states. Consumers must
 * check both and never substitute zero or any default for `null`.
 *
 * Scope constraint: in-memory only for B63 (Langston-confirmed). Cold-start
 * warmup is acceptable; DB-backed persistence deferred to B64+ if operational
 * evidence requires it.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { computeGlobalDirectionalBias } from './directional-bias';
import type { GlobalDirectionalBias } from '../../types/directional-bias.types';
// B72 (2026-05-05): GLOBAL_DBS_MIN_SAMPLE_COUNT moved to module='dbs_calculation'.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

function getGlobalDbsMinSampleCount(): number {
  return getCachedNumberRequired('dbs_calculation', 'min_sample_count',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
}

/**
 * Per-pair store entry. Timestamp is the last time this pair's DBS was updated.
 */
interface PairStoreEntry {
  score: number;
  timestamp: number;
  sentinelZero: boolean;
  volume: number;
}

/**
 * Atomic snapshot of global DBS, published at end of cycle.
 * `isStale: true` means we served a prior snapshot because current inputs were
 * insufficient or invalid. Consumers surface this in UI where appropriate.
 */
export interface GlobalDbsSnapshot {
  value: GlobalDirectionalBias;
  snapshotTime: number;
  coverage: number;       // number of non-expired pairs used (or the count when last good)
  isStale: boolean;
}

/** Hard expiry for per-pair entries. Older entries are pruned. */
const PAIR_HARD_EXPIRY_MS = 5 * 60 * 1000;

/**
 * Fixed floor — do not compute global DBS from fewer than this many pairs.
 *
 * @deprecated B72: live runtime callers use `getGlobalDbsMinSampleCount()`.
 * This exported constant exists for tests + non-runtime tooling that runs
 * before module_constants is warmed. Mirrors the seed value of the
 * 'dbs_calculation' / 'min_sample_count' module_constants row; if you tune
 * that row, this constant will NOT auto-update — keep in sync manually.
 */
export const GLOBAL_DBS_MIN_SAMPLE_COUNT = 20;

/** Ring-buffer size for snapshot history. 96 entries × 15 min = 24h of history. */
const SNAPSHOT_HISTORY_MAX = 96;

/** Ring-buffer size for category transitions. Keeps most recent N category changes. */
const TRANSITION_HISTORY_MAX = 50;

/**
 * Minimal snapshot record for the history ring buffer. Trimmed from the full
 * GlobalDbsSnapshot to keep memory bounded — we only persist the values the
 * dashboard needs for plotting.
 */
export interface HistoricalSnapshot {
  timestamp: number;  // epoch ms
  score: number;
  category: string;
  pairCount: number;
}

/**
 * Category transition event. Emitted by the store whenever publishSnapshot
 * produces a different `category` than the prior published snapshot.
 */
export interface CategoryTransition {
  timestamp: number;
  from: string;
  to: string;
  scoreAt: number;
}

class DirectionalBiasStore {
  private store = new Map<string, PairStoreEntry>();
  private latestSnapshot: GlobalDbsSnapshot | null = null;
  private history: HistoricalSnapshot[] = [];
  private transitions: CategoryTransition[] = [];

  /**
   * Update (or insert) a pair's DBS entry. Called whenever computePairDirectionalBias
   * produces a fresh value — typically during the scan cycle's per-pair processing.
   */
  updatePair(symbol: string, score: number, sentinelZero: boolean, volume: number): void {
    this.store.set(symbol, {
      score,
      timestamp: Date.now(),
      sentinelZero,
      volume,
    });
  }

  /**
   * Sweep hard-expired entries. Called at the start of publishSnapshot so expired
   * entries do not contaminate the sample.
   */
  private pruneExpired(): number {
    const cutoff = Date.now() - PAIR_HARD_EXPIRY_MS;
    let pruned = 0;
    for (const [sym, entry] of this.store.entries()) {
      if (entry.timestamp < cutoff) {
        this.store.delete(sym);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Publish an atomic global DBS snapshot. Called at the end of each scan cycle
   * (or on-demand by MCE.computeGlobalBias for backward compatibility).
   *
   * Implements the five-row behavior spec documented at top of file.
   *
   * @returns the freshly-published snapshot, a stale snapshot, or null
   */
  publishSnapshot(): GlobalDbsSnapshot | null {
    this.pruneExpired();
    const freshCount = this.store.size;

    // Rows 1, 2, and 3: below-floor handling.
    // Row 1 (cold start — empty store AND no prior snapshot) logs `coldStart` to align with
    // the semantic expectation that PM2 restart produces a coldStart log through the MCE
    // computeGlobalBias path. Row 3 (partial store but < 20 pairs, no prior) logs `noSnapshot`.
    // Row 2 (below floor but we have a prior snapshot to carry forward) logs `degradedCoverage`.
    const minSampleCount = getGlobalDbsMinSampleCount();
    if (freshCount < minSampleCount) {
      if (this.latestSnapshot) {
        // Row 2: serve stale prior snapshot
        this.latestSnapshot = {
          ...this.latestSnapshot,
          isStale: true,
        };
        console.log(
          `[GlobalDBS][degradedCoverage] serving stale snapshot, liveStore=${freshCount}, floor=${minSampleCount}`
        );
        return this.latestSnapshot;
      }
      // No prior snapshot branch.
      if (freshCount === 0) {
        // Row 1: empty store + no prior — true cold start
        console.log(
          `[GlobalDBS][coldStart] snapshot unavailable, store has 0 pairs, floor ${minSampleCount}; returning null`
        );
      } else {
        // Row 3: partial but below floor, no prior
        console.log(
          `[GlobalDBS][noSnapshot] store below floor (${freshCount}) and no prior snapshot; returning null`
        );
      }
      return null;
    }

    // Happy-path candidate: compute from current inputs
    const pairScores = new Map<string, number>();
    const sentinelFlags = new Map<string, boolean>();
    const volumes = new Map<string, number>();
    for (const [sym, entry] of this.store.entries()) {
      pairScores.set(sym, entry.score);
      sentinelFlags.set(sym, entry.sentinelZero);
      volumes.set(sym, entry.volume);
    }

    const computed = computeGlobalDirectionalBias(
      pairScores,
      volumes,
      undefined,
      sentinelFlags
    );

    // Row 4: invalid compute result (NaN / non-finite) — keep prior snapshot stale
    if (!isFinite(computed.score)) {
      if (this.latestSnapshot) {
        this.latestSnapshot = {
          ...this.latestSnapshot,
          isStale: true,
        };
        console.log(
          `[GlobalDBS][invalidCompute] kept prior snapshot (current compute produced non-finite score=${computed.score})`
        );
        return this.latestSnapshot;
      }
      // No prior snapshot + invalid compute → return null
      console.log(
        `[GlobalDBS][invalidCompute] non-finite compute AND no prior snapshot; returning null`
      );
      return null;
    }

    // Row 5: happy path — publish fresh
    const priorSnapshot = this.latestSnapshot;
    const nowMs = Date.now();
    this.latestSnapshot = {
      value: computed,
      snapshotTime: nowMs,
      coverage: freshCount,
      isStale: false,
    };

    // Record in history ring buffer (bounded to 24h at 15-min cadence).
    this.history.push({
      timestamp: nowMs,
      score: computed.score,
      category: computed.category,
      pairCount: freshCount,
    });
    if (this.history.length > SNAPSHOT_HISTORY_MAX) {
      this.history.shift();
    }

    // Emit a transition if category changed vs prior non-stale snapshot.
    // (Stale snapshots don't reflect a real change, so we compare against
    // the prior FRESH value instead of prior served value.)
    if (priorSnapshot && !priorSnapshot.isStale && priorSnapshot.value.category !== computed.category) {
      this.transitions.push({
        timestamp: nowMs,
        from: priorSnapshot.value.category,
        to: computed.category,
        scoreAt: computed.score,
      });
      if (this.transitions.length > TRANSITION_HISTORY_MAX) {
        this.transitions.shift();
      }
    }

    return this.latestSnapshot;
  }

  /** Historical snapshot ring buffer (up to last 24h at 15-min cadence). */
  getHistory(): HistoricalSnapshot[] {
    return this.history.slice(); // defensive copy
  }

  /** Category transitions observed across published snapshots. */
  getTransitions(): CategoryTransition[] {
    return this.transitions.slice();
  }

  /**
   * Return the latest published snapshot, or null if no snapshot has ever been
   * published (Row 1: cold start).
   *
   * Consumers must handle `null` explicitly. Never substitute zero or any default.
   */
  getLatestSnapshot(): GlobalDbsSnapshot | null {
    if (!this.latestSnapshot) {
      // Row 1: cold start
      console.log(
        `[GlobalDBS][coldStart] snapshot unavailable, store has ${this.store.size} pairs, floor ${getGlobalDbsMinSampleCount()}`
      );
      return null;
    }
    return this.latestSnapshot;
  }

  /** Current pair-count in the live store (for diagnostics / UI). */
  getStoreSize(): number {
    return this.store.size;
  }

  /** Reset — tests only. */
  clear(): void {
    this.store.clear();
    this.latestSnapshot = null;
    this.history = [];
    this.transitions = [];
  }
}

/** Module-level singleton. Same pattern used elsewhere for infra singletons. */
export const directionalBiasStore = new DirectionalBiasStore();

/** Convenience accessor (e.g. for UI/API endpoints). */
export function getLatestGlobalDbsSnapshot(): GlobalDbsSnapshot | null {
  return directionalBiasStore.getLatestSnapshot();
}
