/**
 * Phase 8.8.3-I2: RTB Metrics Service
 * 
 * Single source of truth for RTB (Ready-To-Buy) statistics.
 * All RTB metrics (top row, breakdown table, I1 diagnostics) read from this service.
 * 
 * This service:
 * - Maintains O(1) counter increments for attempts, opens, blocks
 * - Provides blockedByReason breakdown
 * - Enforces invariant: attemptsTotal === openedTotal + blockedTotal
 * - Is purely in-memory (no DB or file writes in hot path)
 */

export type RtbBlockReason =
  | 'KILL_SWITCH'
  | 'NO_STOP_LOSS'
  | 'INVALID_STOP_LOSS'
  | 'POSITION_LIMIT'
  | 'COOLDOWN'
  | 'MAX_POSITION'
  | 'LPCP_LOW_PRICE'
  | 'LPCP_MIN_NOTIONAL'
  | 'FX_CONVERSION_FAILED'
  | 'PORTFOLIO_RISK'
  | 'INSUFFICIENT_BALANCE'
  | 'MAX_EXPOSURE'
  | 'MAX_TOTAL_EXPOSURE'
  | 'MAX_TRADES'
  | 'ENGINE_STOPPING'
  | 'OTHER';

/**
 * P19-B6.5e: post-guardrail OPEN-stage failure classes. Distinct from a guardrail
 * BLOCK — these fire AFTER all guardrails pass, inside the paper-engine open path
 * (EV gate, sizing, depth-sufficiency gate, fill, dup-guard, trade-insert). Before
 * B6.5e every one of these was a silent bare-`return` invisible to the I3 invariant,
 * which is why a sized crypto signal could vanish (`attempts>0 / opened=0 / blocked=0`).
 */
export type OpenFailStage =
  | 'DRY_RUN'             // AJ19 dry-run-no-guardrails skip (pre-attempt; NOT recorded)
  | 'GUARDRAIL_BLOCK'     // guardrail rejection — return label only; already counted via recordBlock, NOT recorded as openFailed
  | 'EV_REJECT'           // Net-Expectancy gate (11.8B)
  | 'SIZING_INVALID'      // quantity <= 0 / no valid portfolio value
  | 'UNCLASSIFIABLE'      // open/trade asset-class could not be resolved
  | 'DEPTH_GATE'          // 24/5 book-depth-sufficiency gate (no_book/stale/thin/insufficient)
  | 'LIVENESS_GATE'       // P19-B6.6 (#236): xStock price-discovery-liveness (flat_last/no_data/sparse/timeout)
  | 'FILL_REJECTED'       // depth-walked fill rejected / non-filled / zero qty
  | 'MAKER_MARKETABLE_DROPPED' // P19-B7.2c: maker limit already marketable at placement + stored taker EV not positive → dropped (non-trade)
  | 'DUP_POSITION'        // duplicate-position guard
  | 'TRADE_INSERT_ERROR'  // DB trade/position insert threw
  | 'OTHER';

export interface RtbStats {
  attemptsTotal: number;
  openedTotal: number;
  blockedTotal: number;
  blockedByReason: Record<RtbBlockReason, number>;
  // P19-B6.5e: post-guardrail open-stage failures — the third term that makes the
  // I3 invariant reconcile: attemptsTotal === openedTotal + blockedTotal + openFailedTotal.
  openFailedTotal: number;
  openFailedByStage: Record<OpenFailStage, number>;
  sessionStart: Date;
}

/**
 * reorg-B3 (#233, OBJ-4): the per-input snapshot of what actually reached the Net-Expectancy
 * kernel at the open-gate. This is the OBJ-6 PROOF SURFACE — it makes the at-queue EV-input thread
 * OBSERVABLE: a sample with `dbsScore` non-null + `usedStrongTrendBranch=true` proves a routing-time
 * dbsScore reached `evaluateTradeExpectancy` and took the strong-trend pWin branch (the #233 fix
 * working), instead of defaulting to the 0.40 floor (the bug). `DI`/`dbsScore` are the values
 * FORWARDED to the kernel: null ⇒ the column was null ⇒ the kernel used its documented default.
 *
 * 🚨 FORWARD-INSTRUMENTATION (§9.1): this buffer only fills when the open-gate runs, which is the
 * ACTIVE-trading path. The system is in VTS/passive (active trading OFF), so this surface stays
 * EMPTY until paper-active turns on (Phase-19 turn-on). It is verified now by the reorg-B3
 * integration test (which drives a sample through), and lights up live at turn-on.
 */
export interface EvInputSample {
  symbol: string;
  strategy: string;
  assetClass?: string;
  DI: number | null;               // value forwarded to the kernel (null ⇒ kernel default DI=50)
  dbsScore: number | null;         // value forwarded to the kernel (null ⇒ kernel default 0 → floor)
  sourcePool?: string;
  usedStrongTrendBranch: boolean;  // sourcePool === 'quant-strong_trend' (kernel took the DBS branch)
  netEV: number;
  isTradeable: boolean;
  rejectionReason?: string;
  timestamp: number;
}

/**
 * P19-B7.1 (OBJ-5): one sized-signal's risk-fraction telemetry — the clamp-bind watch.
 * Recorded once per actually-SIZED signal at the open path (NOT per candidate — denominator
 * trap). `effectiveRiskFractionRatio` = sized dollar-risk ÷ intended riskAmount (≤1); `bound` =
 * the ratio fell materially below 1 (a clamp or the covariance scale held the position below its
 * intended risk). The Phase-25 GO/NO-GO reads the bind-RATE: >~15-20% bound → the sizer is
 * piecewise-notional in practice, R-rank overstates the top of the book → switch the honest
 * ranker to realized-$EV at the executed size; <~5% → noise, keep R. All zero until paper-active.
 */
export interface SizingClampSample {
  symbol: string;
  strategy: string;
  assetClass?: string;
  effectiveRiskFractionRatio: number;
  wasClamped: boolean;     // the notional cap bound (sizer's own flag)
  bound: boolean;          // ratio < BIND_THRESHOLD (absorbs notional clamp AND covariance scale)
  timestamp: number;
}

/** P19-B7.2 (OBJ-6): one maker/taker best-of-both decision, recorded at signal-gen. */
export interface MakerTakerDecisionSample {
  symbol: string;
  strategy: string;
  assetClass?: string;
  chosenMode: 'taker' | 'maker';
  takerNetEV: number;
  makerNetEVAdjusted: number;
  adverseSelectionPct: number;
  nonFillCostPct: number;
  hardFloorFired: boolean;
  timestamp: number;
}

class RtbMetricsService {
  private static instance: RtbMetricsService;

  private stats: RtbStats = {
    attemptsTotal: 0,
    openedTotal: 0,
    blockedTotal: 0,
    blockedByReason: {} as Record<RtbBlockReason, number>,
    openFailedTotal: 0,
    openFailedByStage: {} as Record<OpenFailStage, number>,
    sessionStart: new Date(),
  };

  private bySymbol: Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }> = {};
  private byStrategy: Record<string, { attempts: number; opened: number; blocked: number }> = {};
  
  // Phase 8.8.3-I3: 60-second periodic invariant check
  private invariantCheckInterval: ReturnType<typeof setInterval> | null = null;
  private invariantCheckIntervalMs = 60000; // 60 seconds

  private constructor() {
    this.initializeBlockReasons();
  }

  private initializeBlockReasons(): void {
    const reasons: RtbBlockReason[] = [
      'KILL_SWITCH', 'NO_STOP_LOSS', 'INVALID_STOP_LOSS', 'POSITION_LIMIT',
      'COOLDOWN', 'MAX_POSITION', 'LPCP_LOW_PRICE', 'LPCP_MIN_NOTIONAL',
      'FX_CONVERSION_FAILED', 'PORTFOLIO_RISK', 'INSUFFICIENT_BALANCE',
      'MAX_EXPOSURE', 'MAX_TOTAL_EXPOSURE', 'MAX_TRADES', 'ENGINE_STOPPING', 'OTHER'
    ];
    for (const reason of reasons) {
      this.stats.blockedByReason[reason] = 0;
    }
    // P19-B6.5e: initialize the open-stage failure breakdown
    const stages: OpenFailStage[] = [
      'DRY_RUN', 'EV_REJECT', 'SIZING_INVALID', 'UNCLASSIFIABLE', 'DEPTH_GATE',
      'FILL_REJECTED', 'MAKER_MARKETABLE_DROPPED', 'DUP_POSITION', 'TRADE_INSERT_ERROR', 'OTHER'
    ];
    for (const stage of stages) {
      this.stats.openFailedByStage[stage] = 0;
    }
  }

  static getInstance(): RtbMetricsService {
    if (!RtbMetricsService.instance) {
      RtbMetricsService.instance = new RtbMetricsService();
    }
    return RtbMetricsService.instance;
  }

  /**
   * Record an RTB attempt (signal evaluation started)
   * Call this at the START of guardrail checks
   */
  recordAttempt(symbol: string, strategy: string): void {
    this.stats.attemptsTotal++;

    if (!this.bySymbol[symbol]) {
      this.bySymbol[symbol] = { attempts: 0, opened: 0, blocked: 0, byReason: {} };
    }
    this.bySymbol[symbol].attempts++;

    if (!this.byStrategy[strategy]) {
      this.byStrategy[strategy] = { attempts: 0, opened: 0, blocked: 0 };
    }
    this.byStrategy[strategy].attempts++;
  }

  /**
   * Record a successful trade open
   * Call this when trade is successfully opened
   */
  recordOpen(symbol: string, strategy: string): void {
    this.stats.openedTotal++;

    if (this.bySymbol[symbol]) {
      this.bySymbol[symbol].opened++;
    }

    if (this.byStrategy[strategy]) {
      this.byStrategy[strategy].opened++;
    }
  }

  /**
   * P19-B6.5e: Record a POST-GUARDRAIL open-stage failure (the attempt passed all
   * guardrails but the open path bailed: EV gate, sizing, depth gate, fill, dup-guard,
   * or trade-insert). This is the third term that makes the I3 invariant reconcile —
   * `attempts === opened + blocked + openFailed`. Do NOT call for the pre-attempt
   * DRY_RUN skip (no attempt was recorded for it).
   */
  recordOpenFailed(symbol: string, strategy: string, stage: OpenFailStage, reason: string): void {
    this.stats.openFailedTotal++;
    this.stats.openFailedByStage[stage] = (this.stats.openFailedByStage[stage] || 0) + 1;

    // [8.8.3-I5]-parallel: per-symbol/strategy funnel — count an open-stage failure
    // as a "blocked" in the per-symbol/strategy rollups (which only track attempts/
    // opened/blocked) so those funnels still reconcile; the precise stage lives in
    // openFailedByStage above. The reason string carries the fine detail.
    if (this.bySymbol[symbol]) {
      this.bySymbol[symbol].blocked++;
      this.bySymbol[symbol].byReason[`OPEN_${stage}`] = (this.bySymbol[symbol].byReason[`OPEN_${stage}`] || 0) + 1;
    }
    if (this.byStrategy[strategy]) {
      this.byStrategy[strategy].blocked++;
    }

    console.log(`[8.8.3-I3][OPEN_FAILED] stage=${stage} symbol=${symbol} strategy=${strategy} reason=${reason} timestamp=${Date.now()}`);
  }

  /**
   * Record a blocked RTB attempt with reason
   * Call this when guardrail blocks a trade
   */
  recordBlock(symbol: string, strategy: string, reason: RtbBlockReason | string): void {
    this.stats.blockedTotal++;

    const normalizedReason = this.normalizeBlockReason(reason);
    this.stats.blockedByReason[normalizedReason] = (this.stats.blockedByReason[normalizedReason] || 0) + 1;

    if (this.bySymbol[symbol]) {
      this.bySymbol[symbol].blocked++;
      this.bySymbol[symbol].byReason[normalizedReason] = (this.bySymbol[symbol].byReason[normalizedReason] || 0) + 1;
    }

    if (this.byStrategy[strategy]) {
      this.byStrategy[strategy].blocked++;
    }
    
    // Phase 8.8.3-I5: Diagnostic logging for RTB block recording audit
    console.log(`[8.8.3-I5][RTB_BLOCK] reason=${normalizedReason} symbol=${symbol} strategy=${strategy} timestamp=${Date.now()}`);
    
    // Phase 8.8.3-I5: Store block event in circular buffer for API retrieval
    this.recordBlockEvent(symbol, strategy, normalizedReason);
  }
  
  // Phase 8.8.3-I5: Circular buffer for block events
  private blockEventBuffer: Array<{
    reason: string;
    symbol: string;
    strategy: string;
    timestamp: number;
  }> = [];
  private readonly MAX_BLOCK_EVENTS = 500;

  // reorg-B3 (#233, OBJ-4): bounded circular buffer of the EV inputs that reached the open-gate
  // kernel. The OBJ-6 proof surface (forward-instrumentation — empty until paper-active turns on).
  private evInputSamples: EvInputSample[] = [];
  private readonly MAX_EV_INPUT_SAMPLES = 500;

  /**
   * reorg-B3 (#233, OBJ-4): record the EV inputs that reached `evaluateTradeExpectancy` at the
   * open-gate. Called once per open-gate Net-Expectancy evaluation. Bounded buffer.
   */
  recordEvInputSample(sample: EvInputSample): void {
    this.evInputSamples.push(sample);
    if (this.evInputSamples.length > this.MAX_EV_INPUT_SAMPLES) {
      this.evInputSamples = this.evInputSamples.slice(-this.MAX_EV_INPUT_SAMPLES);
    }
  }

  /** reorg-B3 (#233, OBJ-4): full EV-input sample buffer for the rtb-metrics diagnostics surface. */
  getEvInputSamples(): EvInputSample[] {
    return [...this.evInputSamples];
  }

  // ── P19-B7.1 (OBJ-5): the sizing clamp-bind watch (the wired deliverable, not prose). ──
  private sizingClampSamples: SizingClampSample[] = [];
  private readonly MAX_SIZING_CLAMP_SAMPLES = 500;
  /** A position risking < this fraction of its intended risk counts as "bound" (clamp/scale held it down). */
  private readonly SIZING_BIND_THRESHOLD = 0.95;

  /** P19-B7.1 (OBJ-5): record one SIZED signal's effective-risk-fraction. Bounded buffer; called once per open-path sizing. */
  recordSizingClampSample(sample: Omit<SizingClampSample, 'bound'>): void {
    const bound = Number.isFinite(sample.effectiveRiskFractionRatio)
      && sample.effectiveRiskFractionRatio < this.SIZING_BIND_THRESHOLD;
    this.sizingClampSamples.push({ ...sample, bound });
    if (this.sizingClampSamples.length > this.MAX_SIZING_CLAMP_SAMPLES) {
      this.sizingClampSamples = this.sizingClampSamples.slice(-this.MAX_SIZING_CLAMP_SAMPLES);
    }
  }

  /** P19-B7.1 (OBJ-5): full sizing-clamp sample buffer for the diagnostics surface. */
  getSizingClampSamples(): SizingClampSample[] {
    return [...this.sizingClampSamples];
  }

  // ── P19-B7.2 (OBJ-6): maker/taker decision telemetry + the maker-PICK-RATE monitoring line ──
  private makerTakerSamples: MakerTakerDecisionSample[] = [];
  private readonly MAX_MAKER_TAKER_SAMPLES = 500;

  /** Record one maker/taker best-of-both decision (called once per signal at gen). Bounded buffer. */
  recordMakerTakerDecision(sample: MakerTakerDecisionSample): void {
    this.makerTakerSamples.push(sample);
    if (this.makerTakerSamples.length > this.MAX_MAKER_TAKER_SAMPLES) {
      this.makerTakerSamples = this.makerTakerSamples.slice(-this.MAX_MAKER_TAKER_SAMPLES);
    }
  }

  getMakerTakerSamples(): MakerTakerDecisionSample[] {
    return [...this.makerTakerSamples];
  }

  /**
   * P19-B7.2 (OBJ-6, Langston Step-2 item 1): the maker-PICK-RATE — the early-warning monitor for a
   * too-loose adverse-selection haircut. An implausibly high maker-pick rate (before any live
   * calibration exists) means the haircut is under-set and best-of-both is silently converting
   * EV-negative maker fills into "passing" signals. All zero until paper-active trading is on; the
   * paper maker-fill outcomes remain DATA-FENCED (non-calibration — model-vs-model; real adverse
   * selection is Phase-21 live data).
   */
  getMakerPickProof(): { totalSamples: number; makerCount: number; takerCount: number; makerPickRate: number | null; hardFloorCount: number } {
    const s = this.makerTakerSamples;
    if (s.length === 0) return { totalSamples: 0, makerCount: 0, takerCount: 0, makerPickRate: null, hardFloorCount: 0 };
    const makerCount = s.filter((x) => x.chosenMode === 'maker').length;
    const hardFloorCount = s.filter((x) => x.hardFloorFired).length;
    return { totalSamples: s.length, makerCount, takerCount: s.length - makerCount, makerPickRate: makerCount / s.length, hardFloorCount };
  }

  /**
   * P19-B7.1 (OBJ-5): the clamp-bind summary — the Phase-25 decision input. `boundRate` is the
   * fraction of SIZED signals held below their intended risk by a clamp or the covariance scale.
   * >~0.15-0.20 → R-rank decoheres from realized-$EV in practice (switch the honest ranker to
   * realized-$EV at executed size; §13). All zero until paper-active trading is on.
   */
  getSizingClampProof(): { totalSamples: number; boundCount: number; boundRate: number | null; meanRatio: number | null } {
    const s = this.sizingClampSamples;
    if (s.length === 0) return { totalSamples: 0, boundCount: 0, boundRate: null, meanRatio: null };
    const boundCount = s.filter((x) => x.bound).length;
    // CHANGE-1 (Langston): guard the mean against a non-finite ratio — one NaN/undefined would
    // otherwise poison the whole summary via reduce. meanRatio is over the finite ratios only.
    const finite = s.filter((x) => Number.isFinite(x.effectiveRiskFractionRatio));
    const meanRatio = finite.length > 0 ? finite.reduce((a, x) => a + x.effectiveRiskFractionRatio, 0) / finite.length : null;
    return { totalSamples: s.length, boundCount, boundRate: boundCount / s.length, meanRatio };
  }

  /**
   * reorg-B3 (#233, OBJ-6): compact proof summary derived from the EV-input samples — answers
   * "did a NON-DEFAULT dbsScore reach the kernel and fire the strong-trend branch?" at a glance.
   * `strongTrendWithDbs` > 0 is the #233-working proof. All zero until paper-active turns on.
   */
  getEvInputThreadProof(): {
    totalSamples: number;
    withNonNullDbs: number;
    withNonNullDi: number;
    strongTrendBranchFired: number;
    strongTrendWithDbs: number;
  } {
    const s = this.evInputSamples;
    return {
      totalSamples: s.length,
      withNonNullDbs: s.filter(x => x.dbsScore != null).length,
      withNonNullDi: s.filter(x => x.DI != null).length,
      strongTrendBranchFired: s.filter(x => x.usedStrongTrendBranch).length,
      strongTrendWithDbs: s.filter(x => x.usedStrongTrendBranch && x.dbsScore != null).length,
    };
  }

  private recordBlockEvent(symbol: string, strategy: string, reason: string): void {
    this.blockEventBuffer.push({
      reason,
      symbol,
      strategy,
      timestamp: Date.now()
    });
    
    // Trim to max size
    if (this.blockEventBuffer.length > this.MAX_BLOCK_EVENTS) {
      this.blockEventBuffer = this.blockEventBuffer.slice(-this.MAX_BLOCK_EVENTS);
    }
  }
  
  /**
   * Phase 8.8.3-I5: Get block event log for diagnostics API
   */
  getBlockEventLog(): Array<{
    reason: string;
    symbol: string;
    strategy: string;
    timestamp: number;
  }> {
    return [...this.blockEventBuffer];
  }

  /**
   * Normalize block reason to known type
   */
  private normalizeBlockReason(reason: string): RtbBlockReason {
    const knownReasons: RtbBlockReason[] = [
      'KILL_SWITCH', 'NO_STOP_LOSS', 'INVALID_STOP_LOSS', 'POSITION_LIMIT',
      'COOLDOWN', 'MAX_POSITION', 'LPCP_LOW_PRICE', 'LPCP_MIN_NOTIONAL',
      'FX_CONVERSION_FAILED', 'PORTFOLIO_RISK', 'INSUFFICIENT_BALANCE',
      'MAX_EXPOSURE', 'MAX_TOTAL_EXPOSURE', 'MAX_TRADES', 'ENGINE_STOPPING'
    ];
    
    if (knownReasons.includes(reason as RtbBlockReason)) {
      return reason as RtbBlockReason;
    }
    return 'OTHER';
  }

  /**
   * Get current RTB stats
   */
  getStats(): RtbStats {
    return { ...this.stats };
  }

  /**
   * Get stats by symbol
   */
  getBySymbol(): Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }> {
    return { ...this.bySymbol };
  }

  /**
   * Get stats by strategy
   */
  getByStrategy(): Record<string, { attempts: number; opened: number; blocked: number }> {
    return { ...this.byStrategy };
  }

  /**
   * Get summary for API response
   */
  getSummary(): {
    timestamp: string;
    sessionStart: string;
    totals: { attempts: number; opened: number; blocked: number; openFailed: number };
    byReason: Record<string, number>;
    openFailedByStage: Record<string, number>;
    byStrategy: Record<string, { attempts: number; opened: number; blocked: number }>;
    bySymbol: Record<string, { attempts: number; opened: number; blocked: number; byReason: Record<string, number> }>;
    invariantCheck: { valid: boolean; message: string };
    // reorg-B3 (#233, OBJ-4): the EV-input proof surface (empty until paper-active turns on).
    evInputThreadProof: { totalSamples: number; withNonNullDbs: number; withNonNullDi: number; strongTrendBranchFired: number; strongTrendWithDbs: number };
    recentEvInputSamples: EvInputSample[];
    // P19-B7.1 (OBJ-5): the sizing clamp-bind watch surface (empty until paper-active turns on).
    sizingClampProof: { totalSamples: number; boundCount: number; boundRate: number | null; meanRatio: number | null };
    recentSizingClampSamples: SizingClampSample[];
    // P19-B7.2 (OBJ-6): maker/taker decision watch — makerPickRate is the too-loose-haircut early warning.
    makerPickProof: { totalSamples: number; makerCount: number; takerCount: number; makerPickRate: number | null; hardFloorCount: number };
    recentMakerTakerSamples: MakerTakerDecisionSample[];
  } {
    // P19-B6.5e: invariant is now attemptsTotal === openedTotal + blockedTotal + openFailedTotal
    const { attemptsTotal, openedTotal, blockedTotal, openFailedTotal } = this.stats;
    const expectedTotal = openedTotal + blockedTotal + openFailedTotal;
    const invariantValid = attemptsTotal === expectedTotal;

    if (!invariantValid) {
      console.error(`[8.8.3-I2][RTB_INVARIANT_VIOLATION] attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, openFailed=${openFailedTotal}, expected=${expectedTotal}`);
    }

    const reasonSum = Object.values(this.stats.blockedByReason).reduce((a, b) => a + b, 0);
    if (reasonSum !== blockedTotal) {
      console.error(`[8.8.3-I2][RTB_BREAKDOWN_MISMATCH] blockedTotal=${blockedTotal}, reasonSum=${reasonSum}`);
    }

    return {
      timestamp: new Date().toISOString(),
      sessionStart: this.stats.sessionStart.toISOString(),
      totals: {
        attempts: attemptsTotal,
        opened: openedTotal,
        blocked: blockedTotal,
        openFailed: openFailedTotal,
      },
      byReason: { ...this.stats.blockedByReason },
      openFailedByStage: { ...this.stats.openFailedByStage },
      byStrategy: { ...this.byStrategy },
      bySymbol: { ...this.bySymbol },
      invariantCheck: {
        valid: invariantValid && reasonSum === blockedTotal,
        message: invariantValid && reasonSum === blockedTotal
          ? 'OK: attemptsTotal === openedTotal + blockedTotal + openFailedTotal && blockedTotal === sum(byReason)'
          : `MISMATCH: attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, openFailed=${openFailedTotal}, reasonSum=${reasonSum}`,
      },
      // reorg-B3 (#233, OBJ-4): EV-input proof surface — the compact proof + the most recent samples
      // (bounded). Empty until paper-active turns on; the #233-working signal is strongTrendWithDbs>0.
      evInputThreadProof: this.getEvInputThreadProof(),
      recentEvInputSamples: this.evInputSamples.slice(-25),
      // P19-B7.1 (OBJ-5): the sizing clamp-bind watch — boundRate is the Phase-25 ranker decision
      // input (>~0.15-0.20 → switch the honest ranker to realized-$EV). Zero until paper-active.
      sizingClampProof: this.getSizingClampProof(),
      recentSizingClampSamples: this.sizingClampSamples.slice(-25),
      // P19-B7.2 (OBJ-6): the maker-pick-rate watch — an implausibly high makerPickRate before live
      // calibration = the haircut is too loose (Langston Step-2 item 1). Zero until paper-active.
      makerPickProof: this.getMakerPickProof(),
      recentMakerTakerSamples: this.makerTakerSamples.slice(-25),
    };
  }

  /**
   * Reset all stats (called on session start)
   */
  reset(): void {
    this.stats = {
      attemptsTotal: 0,
      openedTotal: 0,
      blockedTotal: 0,
      blockedByReason: {} as Record<RtbBlockReason, number>,
      openFailedTotal: 0,
      openFailedByStage: {} as Record<OpenFailStage, number>,
      sessionStart: new Date(),
    };
    this.initializeBlockReasons();
    this.bySymbol = {};
    this.byStrategy = {};
    this.evInputSamples = []; // reorg-B3 (#233, OBJ-4): clear the EV-input proof buffer on session reset
    this.sizingClampSamples = []; // P19-B7.1 (OBJ-5): clear the sizing clamp-bind buffer on session reset
    console.log(`[8.8.3-I2][RTB_METRICS_RESET] Session reset at ${this.stats.sessionStart.toISOString()}`);
  }

  /**
   * Phase 8.8.3-I3: Start 60-second periodic invariant check logging
   * Called when trading engine starts
   */
  startInvariantCheck(): void {
    if (this.invariantCheckInterval) {
      console.log('[8.8.3-I3][INVARIANT_CHECK] Already running, skipping start');
      return;
    }

    console.log('[8.8.3-I3][INVARIANT_CHECK] Starting 60-second periodic invariant check');
    
    this.invariantCheckInterval = setInterval(() => {
      this.logInvariantCheck();
    }, this.invariantCheckIntervalMs);
  }

  /**
   * Phase 8.8.3-I3: Stop periodic invariant check logging
   * Called when trading engine stops
   */
  stopInvariantCheck(): void {
    if (this.invariantCheckInterval) {
      clearInterval(this.invariantCheckInterval);
      this.invariantCheckInterval = null;
      console.log('[8.8.3-I3][INVARIANT_CHECK] Stopped periodic invariant check');
    }
  }

  /**
   * Phase 8.8.3-I3: Log invariant check status
   * Logs every 60 seconds to verify attemptsTotal === openedTotal + blockedTotal
   */
  private logInvariantCheck(): void {
    // P19-B6.5e: invariant now reconciles the post-guardrail open stage too \u2014
    // attemptsTotal === openedTotal + blockedTotal + openFailedTotal. The openFailedByStage
    // breakdown is what names WHERE a sized signal vanished (e.g. DEPTH_GATE) instead of opening.
    const { attemptsTotal, openedTotal, blockedTotal, openFailedTotal, blockedByReason, openFailedByStage } = this.stats;
    const expectedTotal = openedTotal + blockedTotal + openFailedTotal;
    const invariantValid = attemptsTotal === expectedTotal;
    const reasonSum = Object.values(blockedByReason).reduce((a, b) => a + b, 0);
    const stageSum = Object.values(openFailedByStage).reduce((a, b) => a + b, 0);
    const breakdownValid = reasonSum === blockedTotal && stageSum === openFailedTotal;

    const status = invariantValid && breakdownValid ? 'OK' : 'MISMATCH';
    const symbol = invariantValid && breakdownValid ? '\u2713' : '\u2717';

    // Compact non-zero openFailed breakdown for the log line (only when there are any).
    const stageBreakdown = openFailedTotal > 0
      ? ' [' + Object.entries(openFailedByStage).filter(([, v]) => v > 0).map(([k, v]) => `${k}:${v}`).join(',') + ']'
      : '';

    console.log(`[8.8.3-I3][INVARIANT_CHECK][${status}] ${symbol} attempts=${attemptsTotal}, opened=${openedTotal}, blocked=${blockedTotal}, openFailed=${openFailedTotal}${stageBreakdown}, reasonSum=${reasonSum}`);

    if (!invariantValid) {
      console.error(`[8.8.3-I3][INVARIANT_VIOLATION] attemptsTotal(${attemptsTotal}) !== openedTotal(${openedTotal}) + blockedTotal(${blockedTotal}) + openFailedTotal(${openFailedTotal}) = ${expectedTotal}`);
    }

    if (!breakdownValid) {
      console.error(`[8.8.3-I3][BREAKDOWN_MISMATCH] blockedTotal(${blockedTotal}) !== reasonSum(${reasonSum}) OR openFailedTotal(${openFailedTotal}) !== stageSum(${stageSum})`);
      console.error(`[8.8.3-I3][BREAKDOWN_DETAILS]`, { blockedByReason, openFailedByStage });
    }
  }
}

export const rtbMetricsService = RtbMetricsService.getInstance();
