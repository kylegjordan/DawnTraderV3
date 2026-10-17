// P19-B6.7 (#301): the vestigial 2nd-WS subsystem (market-data-coordinator/market-data-ws)
// was removed. The alarm now grades the PRIMARY adapter's real per-symbol tick-age, per
// asset class, with the xStock class market-hours-gated + a post-open warmup grace.
import { krakenWebSocketAdapter } from '../exchanges/kraken/kraken-websocket-adapter.js';
import {
  gradePerClassFeedLiveness,
  computeRollingWindowReadiness,
  type SymbolFreshness,
  type PerClassThresholds,
  type FeedAliveGrade,
  type RollingWsReadiness,
} from './market-data/feed-health-aggregate.js';
import { resolveAssetClass } from '../../shared/asset-classes.js';
import { isXstockMarketOpenUTC, isInXstockWeekendClose } from '../asset_classes/xstock_spot/market-hours.js';
import { getEquityTickerUpdateAges, isEquityTickingCountWarm } from './passive-archive/equity-spot-archiver.js';
import { getCachedNumberRequired } from './module-constants-service.js';
import fs from 'fs';

/**
 * Feed health status categories
 */
export type FeedHealthStatus = 'healthy' | 'warning' | 'critical';

/**
 * Configuration thresholds (env-configurable)
 */
interface FeedHealthThresholds {
  // STATUS thresholds — COMPLETED RECONNECTS, counted over the ring window once it is ready (>= MIN_READINESS_SAMPLES
  // snapshots, ~an hour at the 5-minute cadence; the actual span is published beside the count), and over the latest
  // single interval while the ring warms. Same numbers on both bases, by decision (B-FEED-HEALTH-GRADE-ARM Step 9 r4).
  warningReconnects: number;
  criticalReconnects: number;

  // Letter-grade thresholds. Ring ready => the ring's uptime % (8.33 % per reconnect at 12 samples); warming => the interval's
  // reconnect count. Freshness enters through the per-class LIVENESS grade, on each class's own DB thresholds (an xStock
  // quote 15 s old is healthy; a crypto one is not) — a fixed seconds rung would grade xStock off crypto's clock.
  // Latency is NOT graded: it is the smoothed inter-heartbeat interval, Kraken's push cadence (~1 s by construction).
  gradeA: { uptimePercent: number; reconnects: number };
  gradeB: { uptimePercent: number; reconnects: number };
  gradeC: { uptimePercent: number; reconnects: number };
  gradeD: { uptimePercent: number; reconnects: number };
  // Grade F = anything worse than D
  
  // Alert cooldown (seconds)
  alertCooldownSec: number;
}

/**
 * Feed health metrics
 */
export interface FeedHealthMetrics {
  feedType: 'websocket' | 'rest_fallback';
  /** Smoothed inter-heartbeat interval (Kraken's push cadence) — telemetry only, graded by nothing. */
  latencyMs: number;
  stalenessSec: number;
  /** The ring's connection uptime; null while it warms (fewer than MIN_READINESS_SAMPLES snapshots) — never a number then. */
  uptimePercent: number | null;
  /** What `reconnectCount` counts over: the ring window (ready) or the latest interval (warming). */
  reconnectBasis: 'ring' | 'interval';
  /** The ring's actual newest - oldest snapshot span in ms (null with < 2 snapshots) — a stalled scheduler widens it. */
  ringSpanMs: number | null;
  ringSamples: number;
  pairCount: number;
  errorRate: number;
  reconnectCount: number;
  tickAgeSec: number;
  /** The per-class liveness grade (worst non-suppressed class, each on its own thresholds) — the freshness term. */
  livenessGrade: FeedAliveGrade;
  status: FeedHealthStatus;
  lastUpdateISO: string;
}

/**
 * Feed health report with grading
 */
export interface FeedHealthReport {
  timestamp: string;
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  metrics: FeedHealthMetrics;
  issues: string[];
  summary: string[];
}

/**
 * Rolling health metrics tracker
 */
interface HealthSnapshot {
  timestamp: number;
  latencyMs: number;
  wasHealthy: boolean;
  wasConnected: boolean;
  errorOccurred: boolean;
  reconnectsSinceLastCheck: number;
  tickAgeSec: number;
}

/**
 * Alert tracking for deduplication
 */
interface AlertState {
  lastAlertTime: number;
  lastStatus: FeedHealthStatus;
  lastGrade: string;
}

/**
 * B-FEED-HEALTH-GRADE-ARM (#1123): one class's liveness as the last cycle graded it — the per-cycle log line's source and
 * the read-only accessor row 3a1 (B-VENUE-QUIET-ALERTING) reads. `thresholdPresent=false` means NOT GRADED (no DB
 * threshold for the class), which the grader reports as `healthy`; the two must never print alike (Langston C3, #546).
 */
export interface ClassLivenessReading {
  assetClass: string;
  freshestAgeMs: number | null;
  grade: FeedAliveGrade;
  suppressed: boolean;
  suppressReason: string | null;
  thresholdPresent: boolean;
  symbolCount: number;
}
export interface LivenessReading {
  atMs: number;
  /** true when NO class had thresholds (config not warm or not seeded) — the cycle graded nothing */
  configMissing: boolean;
  classes: ClassLivenessReading[];
}

/**
 * Feed Integrity Monitor Service
 * Tracks health metrics for Kraken WebSocket + REST fallback feeds with:
 * - Completed-reconnect tracking from the WebSocket layer, over a rolling ring of snapshots
 * - Configurable thresholds
 * - Alert deduplication with cooldown
 * - Accurate grading based on all metrics
 */
class FeedIntegrityMonitorService {
  // P19-B6.7 (#301): warmup-grace state for the xStock-class alarm — when the per-symbol
  // market-open gate last transitioned closed→open (suppress xStock critical for
  // warmup_grace_ms after, so the stale-at-close age doesn't false-fire at the bell).
  private xstockWasOpen = false;
  private xstockOpenedAtMs: number | null = null;
  // F-3 (row 3a): the adapter's `reconnectsCompleted` is the monotonic count of completed reconnects (+1 per open after a
  // drop, never reset); the monitor differences it per snapshot. (Its `reconnectAttempts` resets on every open and is raised
  // on one reconnect path only — it is not a cumulative count.) null until the first snapshot sets the baseline.
  private lastReconnectsCompleted: number | null = null;
  private configWarnLogged = false;
  private healthHistory: HealthSnapshot[] = [];
  private readonly MAX_HISTORY = 12; // 12 snapshots = 1 hour at 5-min intervals
  // P19-B6.9 (#398): minimum recent snapshots before the rolling-window WS uptime gates go-live
  // readiness. Below this the windowed % is dominated by too few samples (≤2 → 50% swings), so
  // getRollingWindowReadiness() reports warming-up/not-ready (fail-closed) instead of a misleading
  // number. 6 = 30 min (half the 1h ring) — a go-live decision should rest on ≥30 min of recent intervals.
  private readonly MIN_READINESS_SAMPLES = 6;
  private lastCheckTime: number = 0;
  private alertState: AlertState = {
    lastAlertTime: 0,
    lastStatus: 'healthy',
    lastGrade: 'A',
  };
  private lastLiveness: LivenessReading | null = null;
  
  // Configurable thresholds
  private thresholds: FeedHealthThresholds;

  constructor() {
    this.thresholds = this.loadThresholds();
  }

  /**
   * Load thresholds from environment or use defaults
   */
  private loadThresholds(): FeedHealthThresholds {
    return {
      // WARNING: >= 3 completed reconnects in the ring window (or in the latest interval while the ring warms)
      warningReconnects: parseInt(process.env.FEED_WARNING_RECONNECTS || '3'),

      // CRITICAL: >= 5 completed reconnects on the same basis
      criticalReconnects: parseInt(process.env.FEED_CRITICAL_RECONNECTS || '5'),

      // Letter grade (all conditions must be met): uptime rungs while the ring is ready, reconnect rungs while it warms.
      gradeA: {
        uptimePercent: parseFloat(process.env.FEED_GRADE_A_UPTIME || '99'),
        reconnects: parseInt(process.env.FEED_GRADE_A_RECONNECTS || '0'),
      },
      gradeB: {
        uptimePercent: parseFloat(process.env.FEED_GRADE_B_UPTIME || '95'),
        reconnects: parseInt(process.env.FEED_GRADE_B_RECONNECTS || '2'),
      },
      gradeC: {
        uptimePercent: parseFloat(process.env.FEED_GRADE_C_UPTIME || '90'),
        reconnects: parseInt(process.env.FEED_GRADE_C_RECONNECTS || '5'),
      },
      gradeD: {
        uptimePercent: parseFloat(process.env.FEED_GRADE_D_UPTIME || '80'),
        reconnects: parseInt(process.env.FEED_GRADE_D_RECONNECTS || '10'),
      },
      
      // Alert cooldown. ⚠️ B-FEED-HEALTH-GRADE-ARM (Langston Step-1 C2): the 300 s default EQUALS the `*/5` cron period, and
      // `lastAlertTime` is stamped at the END of a check while `shouldSendAlert` runs at the START of the next — so an
      // unchanged non-healthy state is suppressed only by the width of one check's own duration, not by a design margin.
      // Unchanged here (changing it changes behaviour beyond the batch); `FEED_ALERT_COOLDOWN_SEC` is unset on staging.
      alertCooldownSec: parseInt(process.env.FEED_ALERT_COOLDOWN_SEC || '300'), // 5 minutes
    };
  }

  /**
   * Get current feed health metrics with interval reconnect tracking
   */
  public getHealthMetrics(): FeedHealthMetrics {
    const now = Date.now();
    const wsStatus = krakenWebSocketAdapter.getStatus();

    // F-1/F-3 (row 3a): ONE connection term at any instant — the ring's completed reconnects once it is ready, the latest
    // interval's while it warms (so the 30 min after every start is never blind), graded against the same 3 / 5.
    const conn = this.connectionReading();

    // P19-B6.7 (#301): per-asset-class FEED-LEVEL liveness (freshest-symbol age; xStock
    // market-hours-gated + warmup grace). This owns the "is data flowing" dimension.
    const { grade: livenessGrade, worstAgeSec } = this.computeLiveness(now);

    // Smoothed inter-heartbeat interval — telemetry, graded by nothing.
    const latencyMs = this.calculateAverageLatency();

    // Calculate error rate from history
    const errorRate = this.calculateErrorRate();

    // Final status = the worse of the per-class LIVENESS grade (owns staleness) and the connection count.
    const healthStatus = this.worseStatus(livenessGrade, this.connectionStatus(conn.count));

    return {
      feedType: 'websocket', // only the primary WS feed exists (no REST fallback post-#301)
      latencyMs: Math.round(latencyMs),
      stalenessSec: worstAgeSec,
      uptimePercent: conn.uptimePercent === null ? null : parseFloat(conn.uptimePercent.toFixed(2)),
      reconnectBasis: conn.basis,
      ringSpanMs: conn.ringSpanMs,
      ringSamples: conn.samples,
      pairCount: wsStatus.subscribedCount,
      errorRate: parseFloat(errorRate.toFixed(4)),
      reconnectCount: conn.count,
      tickAgeSec: worstAgeSec,
      livenessGrade,
      status: healthStatus,
      lastUpdateISO: new Date().toISOString(),
    };
  }

  /**
   * P19-B6.9 (#398): WS-readiness uptime over the ROLLING 1h window — for the Phase-21 go-live
   * parity gate. Replaces the old cumulative-since-boot formula in `assessWsReadiness` that
   * derived uptime from the adapter's LIFETIME `reconnectAttempts` over a fixed denominator, which
   * made a healthy long-lived process drift below the 99% floor and spuriously fail the gate.
   *
   * Denominator = snapshots PRESENT in the ring (`healthHistory.length`, capped at MAX_HISTORY=12),
   * NOT intervals-since-boot — so a bad hour ages out as snapshots roll off (the self-healing
   * property the cumulative metric lacked). `windowReconnects` = Σ per-interval reconnects in the ring.
   *
   * Below `MIN_READINESS_SAMPLES` the windowed % is dominated by too few samples (≤2 → 50% swings),
   * so we return `ready:false, uptimePercent:null` (fail-closed warm-up) rather than a misleading
   * number — a go-live readiness decision must rest on ≥30 min of recent feed-health intervals.
   */
  public getRollingWindowReadiness(): RollingWsReadiness {
    // Delegate to the pure helper (unit-tested in feed-health-aggregate); the monitor just maps
    // its ring → the per-interval reconnect counts. Denominator = samples present in the ring.
    return computeRollingWindowReadiness(
      this.healthHistory.map((snap) => snap.reconnectsSinceLastCheck),
      this.MIN_READINESS_SAMPLES,
    );
  }

  /** F-1/F-3 (row 3a): the connection term's count, its basis, the ring's uptime and its real span. */
  private connectionReading(): { count: number; basis: 'ring' | 'interval'; uptimePercent: number | null; ringSpanMs: number | null; samples: number } {
    const r = this.getRollingWindowReadiness();
    const h = this.healthHistory;
    const ringSpanMs = h.length >= 2 ? h[h.length - 1].timestamp - h[0].timestamp : null;
    if (r.ready) return { count: r.windowReconnects, basis: 'ring', uptimePercent: r.uptimePercent, ringSpanMs, samples: r.samplesPresent };
    const latest = h.length > 0 ? h[h.length - 1].reconnectsSinceLastCheck : 0;
    return { count: latest, basis: 'interval', uptimePercent: null, ringSpanMs, samples: r.samplesPresent };
  }

  /**
   * P19-B6.7 (#301): read the PRIMARY adapter and grade FEED-LEVEL liveness per asset class.
   * Defensive: a missing/unwarmed DB threshold logs once and skips the liveness grade
   * (returns healthy) — the alarm must never crash nor false-fire a critical off a config gap.
   */
  private computeLiveness(now: number): { grade: FeedAliveGrade; worstAgeSec: number } {
    // Crypto from the primary WebSocket adapter; xStock from the equities recorder (F-2, row 3a) — the adapter carries no
    // xStock symbols since the xStock feed moved to its own recorder. Recorder entries carry their class ASSERTED: re-resolving
    // a plain `AAPL/USD` would send the 33 collision tickers to crypto.
    const xstockWarm = isEquityTickingCountWarm(now);
    const health: SymbolFreshness[] = [
      ...krakenWebSocketAdapter.getI8EWsHealth().map((h) => ({ symbol: h.symbol, ageMs: h.ageMs })),
      ...(xstockWarm ? getEquityTickerUpdateAges(now).map((h) => ({ symbol: h.symbol, ageMs: h.ageMs, assetClass: 'xstock_spot' })) : []),
    ];

    // xStock open-state transition -> (re)start the warmup grace on the closed->open edge. One clock for every xStock symbol
    // (`isXstockMarketOpenUTC` ignores its symbol), so this reads the clock, never the symbol list — an empty list after a
    // restart must not read as a closed market.
    const anyXstockOpen = !isInXstockWeekendClose(new Date(now));
    if (anyXstockOpen && !this.xstockWasOpen) this.xstockOpenedAtMs = now;
    this.xstockWasOpen = anyXstockOpen;

    const warmupGraceMs = this.tryGetConfig('xstock_spot', 'warmup_grace_ms');
    const xstockWarmupRemainingMs =
      this.xstockOpenedAtMs !== null && warmupGraceMs !== null
        ? Math.max(0, warmupGraceMs - (now - this.xstockOpenedAtMs))
        : 0;

    const thresholds: Record<string, PerClassThresholds> = {};
    for (const cls of ['crypto_spot', 'xstock_spot']) {
      const warningMs = this.tryGetConfig(cls, 'warning_age_ms');
      const criticalMs = this.tryGetConfig(cls, 'critical_age_ms');
      if (warningMs !== null && criticalMs !== null) thresholds[cls] = { warningMs, criticalMs };
    }
    if (Object.keys(thresholds).length === 0) {
      this.lastLiveness = { atMs: now, configMissing: true, classes: [] };
      return { grade: 'healthy', worstAgeSec: 0 }; // config not warmed yet → do not alarm (and the reading says NOT GRADED)
    }

    const result = gradePerClassFeedLiveness(health, {
      classify: (sym) => resolveAssetClass(sym, 'kraken'),
      thresholds,
      xstockClassKey: 'xstock_spot',
      isXstockSymbolOpen: (sym) => isXstockMarketOpenUTC(sym, new Date(now)),
      xstockWarmupRemainingMs,
      xstockSourceWarm: xstockWarm,
    });

    let worstAgeMs = 0;
    for (const c of result.classes) {
      if (c.suppressed) continue;
      // P19-B6.7 (Langston Step-4 ②): a null-driven critical (no symbol EVER ticked) has no
      // finite age — surface the class critical threshold as a sentinel so stalenessSec does
      // not misleadingly read 0s on a genuinely dead feed.
      const ageMs = c.freshestAgeMs ?? (c.grade === 'critical' ? (thresholds[c.assetClass]?.criticalMs ?? 0) : 0);
      if (ageMs > worstAgeMs) worstAgeMs = ageMs;
    }
    this.lastLiveness = {
      atMs: now,
      configMissing: false,
      classes: result.classes.map((c) => ({
        assetClass: c.assetClass,
        freshestAgeMs: c.freshestAgeMs,
        grade: c.grade,
        suppressed: c.suppressed,
        suppressReason: c.suppressReason,
        thresholdPresent: thresholds[c.assetClass] !== undefined,
        symbolCount: c.symbolCount,
      })),
    };
    return { grade: result.overall, worstAgeSec: Math.round(worstAgeMs / 1000) };
  }

  /** B-FEED-HEALTH-GRADE-ARM: the last cycle's per-class liveness (read-only; null before the first graded cycle). */
  public getLastLiveness(): LivenessReading | null {
    return this.lastLiveness;
  }

  /** Read a per-asset-class feed_health knob (DB §11), null if unavailable (never throws). */
  private tryGetConfig(assetClass: string, name: string): number | null {
    try {
      return getCachedNumberRequired('feed_health', name, {
        exchange: '*', assetClass, strategy: '*', regime: '*',
      });
    } catch {
      if (!this.configWarnLogged) {
        this.configWarnLogged = true;
        console.warn(`[FeedIntegrity] feed_health config not warmed yet (${name}/${assetClass}); skipping liveness grade this cycle`);
      }
      return null;
    }
  }

  /** Return the more severe of two feed-health statuses. */
  private worseStatus(a: FeedHealthStatus, b: FeedHealthStatus): FeedHealthStatus {
    const rank: Record<FeedHealthStatus, number> = { healthy: 0, warning: 1, critical: 2 };
    return rank[a] >= rank[b] ? a : b;
  }

  /**
   * The connection term's status (row 3a, Step 9 r4): COMPLETED RECONNECTS against the same two numbers on either basis —
   * the ring window once ready (~an hour; its real span is published) or the latest interval while warming.
   * WARNING >= warningReconnects (3) · CRITICAL >= criticalReconnects (5). Staleness is the liveness grade's; latency grades nothing.
   */
  private connectionStatus(reconnects: number): FeedHealthStatus {
    if (reconnects >= this.thresholds.criticalReconnects) return 'critical';
    if (reconnects >= this.thresholds.warningReconnects) return 'warning';
    return 'healthy';
  }

  /**
   * Calculate average latency from recent history
   */
  private calculateAverageLatency(): number {
    if (this.healthHistory.length === 0) {
      // P19-B6.7 (#301): smoothed inter-heartbeat latency proxy (see recordSnapshot note —
      // not a true RTT; Kraken v2 heartbeats are server-pushed).
      return krakenWebSocketAdapter.getHealthMetrics().avgHeartbeatLatency;
    }

    const sum = this.healthHistory.reduce((acc, snap) => acc + snap.latencyMs, 0);
    return sum / this.healthHistory.length;
  }

  /**
   * Calculate error rate from history
   * Returns ratio of failed updates to total attempts
   */
  private calculateErrorRate(): number {
    if (this.healthHistory.length === 0) {
      return 0;
    }
    
    const errorCount = this.healthHistory.filter(snap => snap.errorOccurred).length;
    return errorCount / this.healthHistory.length;
  }

  /**
   * Record a health snapshot with interval-based reconnect tracking
   */
  public recordSnapshot(): void {
    const now = Date.now();
    const wsStatus = krakenWebSocketAdapter.getStatus();

    // F-3 (row 3a): completed reconnects since the last snapshot, from the adapter's monotonic counter. The first snapshot
    // sets the baseline (it counts nothing it did not see).
    const completed = wsStatus.reconnectsCompleted;
    const intervalReconnects = this.lastReconnectsCompleted === null ? 0 : Math.max(0, completed - this.lastReconnectsCompleted);
    this.lastReconnectsCompleted = completed;

    // Per-class FEED-LEVEL liveness owns staleness; latency is a SMOOTHED PROXY (Langston Step-4): true ping->pong RTT is not
    // available from Kraken v2's server-pushed heartbeats, so this is the adapter's averaged inter-heartbeat interval — kept
    // as telemetry for the report, graded by nothing.
    const { grade: livenessGrade, worstAgeSec } = this.computeLiveness(now);
    const latencyMs = krakenWebSocketAdapter.getHealthMetrics().avgHeartbeatLatency;

    // Record snapshot with interval reconnects
    const snapshot: HealthSnapshot = {
      timestamp: now,
      latencyMs,
      wasHealthy: false, // set below, once this snapshot is in the ring the connection term reads
      wasConnected: wsStatus.isConnected,
      errorOccurred: !wsStatus.isConnected,
      reconnectsSinceLastCheck: intervalReconnects,
      tickAgeSec: worstAgeSec,
    };
    
    this.healthHistory.push(snapshot);
    
    // Keep only last MAX_HISTORY snapshots
    if (this.healthHistory.length > this.MAX_HISTORY) {
      this.healthHistory.shift();
    }
    snapshot.wasHealthy = this.worseStatus(livenessGrade, this.connectionStatus(this.connectionReading().count)) === 'healthy';
    
    this.lastCheckTime = now;
  }

  /**
   * The letter grade (row 3a): connection + liveness. Connection: ring ready => its uptime % (one completed reconnect in a
   * 12-sample ring = 91.67 % => C; at 6 samples 83.33 % => D); warming => the interval's reconnect count. Liveness, per class on
   * its own thresholds: a class at warning caps the grade at C, a class at critical is F. Latency is not graded — it is
   * Kraken's heartbeat cadence (~1001 ms by construction), which made B and A unreachable.
   */
  private calculateGrade(metrics: FeedHealthMetrics): 'A' | 'B' | 'C' | 'D' | 'F' {
    const { uptimePercent, reconnectCount, livenessGrade } = metrics;
    if (livenessGrade === 'critical') return 'F'; // a class past its critical age: the feed is not delivering
    const passes = (g: { uptimePercent: number; reconnects: number }) =>
      uptimePercent !== null ? uptimePercent >= g.uptimePercent : reconnectCount <= g.reconnects;
    // A class past its WARNING age caps the grade at C.
    if (livenessGrade === 'healthy' && passes(this.thresholds.gradeA)) return 'A';
    if (livenessGrade === 'healthy' && passes(this.thresholds.gradeB)) return 'B';
    if (passes(this.thresholds.gradeC)) return 'C';
    if (passes(this.thresholds.gradeD)) return 'D';
    return 'F';
  }

  /**
   * Generate a comprehensive health report
   */
  public generateReport(): FeedHealthReport {
    const metrics = this.getHealthMetrics();
    const issues: string[] = [];
    const summary: string[] = [];
    
    // Calculate grade based on all metrics
    const grade = this.calculateGrade(metrics);
    
    // Identify issues. The reconnect line names its basis — ">= 3 reconnects" alone cannot say per-hour from per-interval.
    const basisText = metrics.reconnectBasis === 'ring'
      ? `in the last ${metrics.ringSpanMs === null ? '?' : Math.round(metrics.ringSpanMs / 60000)} min (${metrics.ringSamples} snapshots)`
      : `in the latest interval (ring warming, ${metrics.ringSamples}/${this.MIN_READINESS_SAMPLES} snapshots)`;
    if (metrics.reconnectCount >= this.thresholds.criticalReconnects) {
      issues.push(`Critical: ${metrics.reconnectCount} reconnects ${basisText} (threshold: ${this.thresholds.criticalReconnects})`);
    } else if (metrics.reconnectCount >= this.thresholds.warningReconnects) {
      issues.push(`Warning: ${metrics.reconnectCount} reconnects ${basisText} (threshold: ${this.thresholds.warningReconnects})`);
    }

    // Freshness, per class on its own thresholds (the liveness grade) — never a fixed seconds bar across classes.
    for (const c of this.lastLiveness?.classes ?? []) {
      if (c.suppressed || c.grade === 'healthy') continue;
      const age = c.freshestAgeMs === null ? 'no tick yet' : `${Math.round(c.freshestAgeMs / 1000)}s old`;
      issues.push(`${c.grade === 'critical' ? 'Critical' : 'Warning'}: ${c.assetClass} freshest tick ${age}`);
    }

    // Check for fallback
    if (metrics.feedType === 'rest_fallback') {
      issues.push('REST fallback engaged (WebSocket unavailable)');
    }
    
    // Generate summary
    summary.push(`Overall Grade: ${grade}`);
    summary.push(`Feed Type: ${metrics.feedType.toUpperCase()}`);
    summary.push(`Heartbeat interval: ${metrics.latencyMs}ms (Kraken's push cadence, not our latency)`);
    summary.push(metrics.uptimePercent === null
      ? `Connection uptime: warming up (${metrics.ringSamples}/${this.MIN_READINESS_SAMPLES} snapshots)`
      : `Connection uptime: ${metrics.uptimePercent.toFixed(2)}% (last ${metrics.ringSpanMs === null ? '?' : Math.round(metrics.ringSpanMs / 60000)} min)`);
    summary.push(`Reconnects: ${metrics.reconnectCount} (${metrics.reconnectBasis === 'ring' ? 'ring window' : 'latest interval'})`);
    summary.push(`Tick Age: ${metrics.tickAgeSec}s`);
    summary.push(`Active Pairs: ${metrics.pairCount}`);
    summary.push(`Error Rate: ${(metrics.errorRate * 100).toFixed(2)}%`);
    summary.push(`Status: ${metrics.status.toUpperCase()}`);
    
    if (issues.length > 0) {
      summary.push('');
      summary.push('Issues:');
      issues.forEach(issue => summary.push(`  - ${issue}`));
    } else {
      summary.push('');
      summary.push('✅ All systems healthy');
    }
    
    return {
      timestamp: metrics.lastUpdateISO,
      overallGrade: grade,
      metrics,
      issues,
      summary,
    };
  }

  /**
   * Get recent health history (for sparkline graphs)
   */
  public getHealthHistory(): HealthSnapshot[] {
    return [...this.healthHistory];
  }

  /**
   * Check if alert should be sent (with deduplication and cooldown)
   * Returns true if alert should be sent, false if suppressed
   */
  public shouldSendAlert(status: FeedHealthStatus, grade: string): boolean {
    const now = Date.now();
    const cooldownMs = this.thresholds.alertCooldownSec * 1000;
    
    // If status improved to healthy, always allow alert (to clear previous alerts)
    if (status === 'healthy' && this.alertState.lastStatus !== 'healthy') {
      return true;
    }
    
    // If status or grade changed, send alert
    if (status !== this.alertState.lastStatus || grade !== this.alertState.lastGrade) {
      return true;
    }
    
    // If within cooldown period, suppress duplicate alert
    if (now - this.alertState.lastAlertTime < cooldownMs) {
      return false;
    }
    
    // Outside cooldown, allow alert
    return true;
  }

  /**
   * Update alert state after sending alert
   */
  public updateAlertState(status: FeedHealthStatus, grade: string): void {
    this.alertState = {
      lastAlertTime: Date.now(),
      lastStatus: status,
      lastGrade: grade,
    };
  }

  /**
   * B-FEED-HEALTH-GRADE-ARM (#1123, Langston Step-1 C1): the status the alert state last recorded — the read site of the
   * recovery predicate. The job acknowledges the dashboard alerts only on a recorded non-healthy → healthy transition, then
   * records `healthy`, so it fires once per recovery. (`shouldSendAlert` alone cannot say this: with the 300 s cooldown equal
   * to the 5-minute cron it returns true on nearly every healthy cycle.)
   */
  public getLastStatus(): FeedHealthStatus {
    return this.alertState.lastStatus;
  }

  /**
   * Reset health counters (for testing)
   */
  public reset(): void {
    this.healthHistory = [];
    this.lastCheckTime = 0;
    this.alertState = {
      lastAlertTime: 0,
      lastStatus: 'healthy',
      lastGrade: 'A',
    };
    this.lastLiveness = null;
  }

  /**
   * Save report to file
   */
  public saveReport(report: FeedHealthReport, filename: string): void {
    try {
      const reportJson = JSON.stringify(report, null, 2);
      fs.writeFileSync(filename, reportJson);
      console.log(`[FeedIntegrity] Report saved to ${filename}`);
    } catch (error: any) {
      console.error('[FeedIntegrity] Failed to save report:', error.message);
      throw error;
    }
  }
}

// Singleton instance
let monitorInstance: FeedIntegrityMonitorService | null = null;

export function getFeedIntegrityMonitor(): FeedIntegrityMonitorService {
  if (!monitorInstance) {
    monitorInstance = new FeedIntegrityMonitorService();
  }
  return monitorInstance;
}

export { FeedIntegrityMonitorService };
