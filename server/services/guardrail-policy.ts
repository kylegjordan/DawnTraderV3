import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import type { GuardrailsV2 } from '@shared/schema';
import { storage } from '../storage';

/**
 * Phase 5: GuardrailPolicy Service
 * 
 * Single backend source of truth for guardrail values with coherency enforcement.
 * Resolves effective values (Lottie vs Manual), validates against coherency_rules.yaml,
 * and provides runtime enforcement for RiskManager, StrategyEngine, and LATTI.
 */

// ============================================================================
// Types & Interfaces
// ============================================================================

export type TradingMode = 'paper' | 'live';
export type CoherencyStatus = 'PASS' | 'WARN' | 'FAIL';

/**
 * Phase 8.8.4-B: Guardrail Category Types
 * 
 * CAPACITY_GUARDRAILS: Control how many trades can be open
 * - maxTotalExposure, position limits (the open-positions setting was retired: slots are derived)
 * - Signals blocked by capacity can be queued for later
 * 
 * QUALITY_GUARDRAILS: Control which signals deserve to be trades
 * - risk factors, confidence thresholds, volatility limits
 * - Signals blocked by quality are rejected outright
 */
export type GuardrailCategory = 'CAPACITY' | 'QUALITY';

export const CAPACITY_GUARDRAILS = [
  'MAX_TOTAL_EXPOSURE',   // Total portfolio exposure limit
  'POSITION_LIMIT',       // Already have position in symbol
  'SLOT_CONFLICT',        // Post-guardrail slot overflow
] as const;

export const QUALITY_GUARDRAILS = [
  'KILL_SWITCH',          // Trading halted due to loss threshold
  'NO_STOP_LOSS',         // Missing stop-loss (invalid signal)
  'INVALID_STOP_LOSS',    // Stop above entry (invalid signal)
  'COOLDOWN',             // Symbol still cooling down
  'MAX_POSITION',         // Single position too large (sizing issue)
  'INSUFFICIENT_BALANCE', // Not enough balance
  'PORTFOLIO_RISK',       // Risk per trade exceeded
  'LPCP_LOW_PRICE',       // Low-priced coin protection
  'LPCP_MIN_NOTIONAL',    // Below minimum notional
  'FX_CONVERSION_FAILED', // FX conversion error
  'EXPIRED_SIGNAL',       // Signal TTL expired
  'NO_PRICE',             // Cannot get reliable price
] as const;

export type CapacityGuardrailCode = typeof CAPACITY_GUARDRAILS[number];
export type QualityGuardrailCode = typeof QUALITY_GUARDRAILS[number];
export type GuardrailBlockCode = CapacityGuardrailCode | QualityGuardrailCode;

/**
 * Determines if a rejection reason is a capacity constraint (queueable)
 * vs a quality constraint (rejected outright)
 */
export function isCapacityBlock(code: string): boolean {
  return (CAPACITY_GUARDRAILS as readonly string[]).includes(code);
}

export function isQualityBlock(code: string): boolean {
  return (QUALITY_GUARDRAILS as readonly string[]).includes(code);
}

export interface EffectiveGuardrails {
  mode: TradingMode;
  symbolCooldownMinutes: number;
  dailyLossKillSwitchPct: number;
  dailyLossWarning1Pct: number; // P19-B6: tier-1 warning, % OF the kill threshold (coherency: 0 < w1 < w2 < 100)
  dailyLossWarning2Pct: number; // P19-B6: tier-2 warning, % OF the kill threshold
  maxPositionPercentPct: number; // REB 8.8.3-G: Max position size as % of portfolio
  maxTotalExposurePct: number; // B-SIZING-DEC-RESTORE (Langston Step-4 FINDING-3): so RULE_013 reaches every validate(getEffective(row)) site
  // REB 8.8.3-H: Low-Priced Coin Protection (LPCP) Module
  lpcp: {
    minStopAtrMult: number;       // Minimum stop distance as ATR multiple
    minPositionNotional: number;   // Minimum trade notional in USD
    threshold: number;             // Price threshold for low-priced coin rules
  };
  management: {
    isManualOverride: boolean;
    tunedByLatti: boolean;
    lockedByUser: Record<string, boolean>;
  };
}

export interface RuleFailure {
  ruleId: string;
  ruleName: string;
  severity: 'error' | 'warn';
  message: string;
  param?: string;
  value?: number | string;
  expected?: string;
}

export interface CoherencyValidationResult {
  status: CoherencyStatus;
  failures: RuleFailure[];
  timestamp: string;
}

interface CoherencyRule {
  name: string;
  id: string;
  description: string;
  condition: string;
  severity: 'error' | 'warn';
  error_message: string;
  rationale?: string;
}

interface CoherencyRulesConfig {
  metadata: {
    version: string;
    purpose: string;
  };
  rules: CoherencyRule[];
}

// ============================================================================
// GuardrailPolicy Service Class
// ============================================================================

class GuardrailPolicyService {
  private rulesConfig: CoherencyRulesConfig | null = null;
  
  // Metrics counters (kill switch trips tracked in DB, not in-memory)
  private metrics = {
    ruleFailures: new Map<string, number>(),
    ruleWarnings: new Map<string, number>(),
    killSwitchTrips: new Map<TradingMode, number>([
      ['paper', 0],
      ['live', 0]
    ]),
    overrideConflicts: new Map<TradingMode, number>([
      ['paper', 0],
      ['live', 0]
    ])
  };

  constructor() {
    this.loadCoherencyRules();
    console.log('[GuardrailPolicy] Service initialized with persistent kill switch state');
    this.logStartupTelemetry();
  }
  
  /**
   * Phase 28.E: Log startup telemetry for coherency policy status
   */
  private logStartupTelemetry(): void {
    if (!this.rulesConfig) {
      console.warn('[GuardrailPolicy] Cannot log telemetry - rules not loaded');
      return;
    }
    
    const activeRules = this.rulesConfig.rules.filter(r => r.severity === 'error');
    const warningRules = this.rulesConfig.rules.filter(r => r.severity === 'warn');
    const totalRules = this.rulesConfig.rules.length;
    const disabledRules = 0; // TODO: Track disabled rules when admin UI is implemented
    
    console.log(
      `[Audit] CoherencyPolicy | ` +
      `activeRules=${activeRules.length} | ` +
      `warningRules=${warningRules.length} | ` +
      `disabledRules=${disabledRules} | ` +
      `version=${this.rulesConfig.metadata.version}`
    );
    
    // Log individual rule status (Phase 28.E Final)
    console.log(`[GuardrailPolicy] Loaded coherency rules v${this.rulesConfig.metadata.version}`);
    this.rulesConfig.rules.forEach(rule => {
      console.log(`  - ${rule.id}: ${rule.name} (${rule.severity})`);
    });
  }

  // ============================================================================
  // Coherency Rules Loading
  // ============================================================================

  private loadCoherencyRules(): void {
    try {
      const rulesPath = path.join(process.cwd(), 'audit', 'coherency_rules.yaml');
      const fileContent = fs.readFileSync(rulesPath, 'utf8');
      this.rulesConfig = yaml.parse(fileContent) as CoherencyRulesConfig;
      console.log(`[GuardrailPolicy] Loaded coherency rules v${this.rulesConfig.metadata.version}`);
    } catch (error: any) {
      console.error('[GuardrailPolicy] Failed to load coherency_rules.yaml:', error.message);
      throw new Error('Cannot initialize GuardrailPolicy without coherency rules');
    }
  }

  /**
   * Hot-reload coherency rules from file (for runtime updates)
   */
  public reloadRules(): void {
    console.log('[GuardrailPolicy] Hot-reloading coherency rules...');
    this.loadCoherencyRules();
  }

  // ============================================================================
  // Effective Value Resolution
  // ============================================================================

  /**
   * Resolves effective guardrail values based on manual override vs LATTI management.
   * 
   * Resolution logic:
   * 1. If is_manual_override = true OR locked_by_user[param] = true → use DB value (manual)
   * 2. Else use DB value (LATTI-managed)
   * 
   * Note: The DB row already contains the effective values. This method primarily
   * structures the response and resolves per-parameter lock states.
   */
  public getEffective(guardrail: GuardrailsV2): EffectiveGuardrails {
    const lockedByUser = (guardrail.lockedByUser as Record<string, boolean>) || {};
    
    // B-SIZING-DEC-RESTORE P5: NO fallback. The column is NOT NULL and (P5) CHECKed to 0 < p <= 100, so the
    // old `value ? parse : (paper 30 | live 10)` could only ever fire on a stored 0 — and then it MASKED it,
    // reporting 30 while the sizer refused every open on the real 0. Parse the stored value and let
    // RULE_012 in validate() report it (rule 15: no hard-coded fallback for a DB-governed setting).
    const guardrailAny = guardrail as any;
    const maxPositionPercentPct = parseFloat(String(guardrail.maxPositionPercentPct));
    
    // REB 8.8.3-H: LPCP fields with safe defaults
    const lpcp = {
      minStopAtrMult: guardrailAny.lowPriceMinStopAtrMult 
        ? parseFloat(String(guardrailAny.lowPriceMinStopAtrMult)) 
        : 3.0,
      minPositionNotional: guardrailAny.lowPriceMinPositionNotional 
        ? parseFloat(String(guardrailAny.lowPriceMinPositionNotional)) 
        : 25.00,
      threshold: guardrailAny.lowPriceThreshold 
        ? parseFloat(String(guardrailAny.lowPriceThreshold)) 
        : 0.50
    };
    
    return {
      mode: guardrail.mode as TradingMode,
      symbolCooldownMinutes: guardrail.symbolCooldownMinutes,
      dailyLossKillSwitchPct: parseFloat(String(guardrail.dailyLossKillSwitchPct)),
      // P19-B6: warning tiers (% of kill threshold). Fallback to defaults for pre-migration rows.
      dailyLossWarning1Pct: guardrailAny.dailyLossWarning1Pct != null ? parseFloat(String(guardrailAny.dailyLossWarning1Pct)) : 50.00,
      dailyLossWarning2Pct: guardrailAny.dailyLossWarning2Pct != null ? parseFloat(String(guardrailAny.dailyLossWarning2Pct)) : 75.00,
      maxPositionPercentPct, // REB 8.8.3-G
      // B-SIZING-DEC-RESTORE FINDING-3: without this field RULE_013 hit its `undefined` skip at every
      // validate(getEffective(row)) site (routes.ts PUT response, storage getGuardrailsCompliance). No fallback.
      maxTotalExposurePct: parseFloat(String(guardrail.maxTotalExposurePct)),
      lpcp, // REB 8.8.3-H
      management: {
        isManualOverride: guardrail.isManualOverride,
        tunedByLatti: guardrail.tunedByLatti,
        lockedByUser
      }
    };
  }

  // ============================================================================
  // Coherency Validation
  // ============================================================================

  /**
   * Validates guardrail values against all coherency rules.
   * Returns structured validation result with failures array.
   */
  public validate(guardrail: EffectiveGuardrails | Partial<EffectiveGuardrails>): CoherencyValidationResult {
    const failures: RuleFailure[] = [];
    
    if (!this.rulesConfig) {
      throw new Error('Coherency rules not loaded');
    }

    const cooldown = guardrail.symbolCooldownMinutes;
    const killSwitch = guardrail.dailyLossKillSwitchPct;
    const isManualOverride = guardrail.management?.isManualOverride;
    const tunedByLatti = guardrail.management?.tunedByLatti;

    // RULE_001 (Risk ≤ 50% × KillSwitch, Phase 28.E) and RULE_006 (Portfolio Risk Range 0.10-5.00) are DELETED —
    // B-SIZING-DEC-RESTORE increment 2c: Portfolio Risk per Trade is retired in paper and live (Kyle 2026-09-29), and both
    // rules existed only for it. ⚠️ WHAT IS NO LONGER BOUNDED: RULE_001 kept one trade's risk under half the kill switch;
    // nothing now bounds a single trade's worst-case loss (size × stop distance) against the kill switch — `#1105`
    // B-TRADE-LOSS-BOUND-DECISION (sprint row 9a) is Kyle's decision on whether it should be.

    // RULE_002 (Total Exposure ≤ 50%, computed as open positions × risk %) is DELETED — B-SIZING-DEC-RESTORE
    // obj-4 (PRE_AUDIT §14.4 D7): with the open-positions setting gone it is uncomputable. Under the derived
    // model, floor(100 / p) × p ≤ 100 holds by construction; the bound that matters is RULE_012 on p.

    // RULE_003: Cooldown ≥ 0 minutes (Phase 28.E)
    if (cooldown !== undefined && cooldown < 0) {
      const rule = this.rulesConfig.rules.find(r => r.id === 'RULE_003')!;
      failures.push({
        ruleId: 'RULE_003',
        ruleName: rule.name,
        severity: 'error',
        message: rule.error_message.replace('{value}', String(cooldown)),
        param: 'symbolCooldownMinutes',
        value: cooldown,
        expected: '>= 0 minutes'
      });
      this.incrementMetric('ruleFailures', 'RULE_003');
    }

    // RULE_004: Cooldown Maximum (WARNING)
    if (cooldown !== undefined && cooldown > 90) {
      const rule = this.rulesConfig.rules.find(r => r.id === 'RULE_004')!;
      failures.push({
        ruleId: 'RULE_004',
        ruleName: rule.name,
        severity: 'warn',
        message: rule.error_message.replace('{value}', String(cooldown)),
        param: 'symbolCooldownMinutes',
        value: cooldown,
        expected: '<= 90 minutes'
      });
      this.incrementMetric('ruleWarnings', 'RULE_004');
    }

    // RULE_005: Manual Override Exclusivity
    if (isManualOverride === true && tunedByLatti === true) {
      const rule = this.rulesConfig.rules.find(r => r.id === 'RULE_005')!;
      failures.push({
        ruleId: 'RULE_005',
        ruleName: rule.name,
        severity: 'error',
        message: rule.error_message,
        param: 'management',
        value: 'conflicting flags'
      });
      this.incrementMetric('ruleFailures', 'RULE_005');
      
      // Track override conflict
      const mode = guardrail.mode as TradingMode;
      if (mode) {
        const current = this.metrics.overrideConflicts.get(mode) || 0;
        this.metrics.overrideConflicts.set(mode, current + 1);
      }
    }

    // RULE_007: Kill Switch ≤ 25% of Portfolio (Phase 28.E)
    if (killSwitch !== undefined && (killSwitch < 1.00 || killSwitch > 25.00)) {
      const rule = this.rulesConfig.rules.find(r => r.id === 'RULE_007')!;
      failures.push({
        ruleId: 'RULE_007',
        ruleName: rule.name,
        severity: 'error',
        message: rule.error_message.replace('{value}', killSwitch.toFixed(2)),
        param: 'dailyLossKillSwitchPct',
        value: killSwitch,
        expected: '1.00% - 25.00%'
      });
      this.incrementMetric('ruleFailures', 'RULE_007');
    }

    // RULE_008 (Max Positions Range, 1-20) is DELETED with the setting it checked (B-SIZING-DEC-RESTORE
    // obj-4). The slot count is derived, floor(100 / p); p itself is bounded by RULE_012.

    // RULE_011: Daily loss warning tiers strictly ordered + strictly below kill (P19-B6)
    // warn1/warn2 are % OF the kill threshold; equal tiers = duplicate noise, warn2=100 is inert.
    // P19-B6 fix (Langston Step-4 Blocker-1): decimal(5,2) columns arrive off Drizzle as STRINGS,
    // so a raw `warn1 < warn2` would be a LEXICOGRAPHIC compare ("9.00" < "80.00" === false → a
    // legal config rejected; "80.00" < "9.00" === true → an inverted one passes). parseFloat both
    // (mirroring the getEffective() resolver) before the numeric ordering compare.
    const warn1raw = guardrail.dailyLossWarning1Pct;
    const warn2raw = guardrail.dailyLossWarning2Pct;
    if (warn1raw !== undefined && warn2raw !== undefined) {
      const warn1 = parseFloat(String(warn1raw));
      const warn2 = parseFloat(String(warn2raw));
      // Langston Step-4 note-1: a present-but-non-finite value must FAIL the rule, not skip it —
      // a skipped validation reads as "passed", letting a malformed value bypass RULE_011 silently.
      // So Number.isFinite is part of the validity predicate (NaN → ok=false → failure emitted),
      // not an outer skip-guard.
      const ok = Number.isFinite(warn1) && Number.isFinite(warn2) && warn1 > 0 && warn1 < warn2 && warn2 < 100;
      if (!ok) {
        const rule = this.rulesConfig.rules.find(r => r.id === 'RULE_011');
        failures.push({
          ruleId: 'RULE_011',
          ruleName: rule?.name || 'Daily Loss Warning Tier Ordering',
          severity: 'error',
          message: (rule?.error_message || 'Daily loss warning tiers must satisfy 0 < warn1 ({warn1}) < warn2 ({warn2}) < 100')
            .replace('{warn1}', warn1.toFixed(2))
            .replace('{warn2}', warn2.toFixed(2)),
          param: 'dailyLossWarning1Pct',
          value: warn1,
          expected: `0 < warn1 < warn2 < 100 (got ${warn1.toFixed(2)}, ${warn2.toFixed(2)})`
        });
        this.incrementMetric('ruleFailures', 'RULE_011');
      }
    }

    // RULE_012 / RULE_013 (B-SIZING-DEC-RESTORE P5; RULE_012's floor raised to 1 by increment 2b, PRE_AUDIT §15.1 G1):
    // RULE_012: 1 <= p <= 100. The floor of 1 is HEADROOM (p = 1 holds a $145 trade up to a ~$14,950 balance) and a
    // guard against a decimal slip below 1 (0.5 for 5 would derive 200 slots now the slot count is floor(100 / p)).
    // It is NOT a micro-position guard (p = 1 at $3,000 is 100 slots of ~$29) — the band alert is the only check that
    // sees dollars, on both sides. RULE_013 keeps 0 < e <= 100: an e typo is loud (the budget collapses; the band fires).
    // Nothing refused a mistyped value before: 50 typed for 5 saved (trades 10x larger), an emptied box
    // saved 0 (the sizer then refuses every open, active-position-sizing.ts:180-184). The sizer is
    // B x e x p (:225-227), so p above e is coherent and NOT refused (PRE_AUDIT §13 F13). Same
    // present-but-non-finite => FAIL rule as RULE_011: a skipped check would read as a pass.
    const pctRangeRules: Array<{ id: string; name: string; param: 'maxPositionPercentPct' | 'maxTotalExposurePct'; fallbackMsg: string }> = [
      { id: 'RULE_012', name: 'Position Size Range', param: 'maxPositionPercentPct', fallbackMsg: 'Max position % must satisfy 1 <= p <= 100 (got {value})' },
      { id: 'RULE_013', name: 'Total Exposure Range', param: 'maxTotalExposurePct', fallbackMsg: 'Max total exposure % must satisfy 0 < e <= 100 (got {value})' },
    ];
    const lowerBoundOk: Record<string, (v: number) => boolean> = {
      RULE_012: (v) => v >= 1,
      RULE_013: (v) => v > 0,
    };
    const expectedRange: Record<string, string> = { RULE_012: '1 <= p <= 100', RULE_013: '0 < e <= 100' };
    for (const r of pctRangeRules) {
      const raw = (guardrail as Record<string, unknown>)[r.param];
      if (raw === undefined) continue;
      const v = parseFloat(String(raw));
      const ok = Number.isFinite(v) && lowerBoundOk[r.id](v) && v <= 100;
      if (!ok) {
        const rule = this.rulesConfig.rules.find(x => x.id === r.id);
        failures.push({
          ruleId: r.id,
          ruleName: rule?.name || r.name,
          severity: 'error',
          message: (rule?.error_message || r.fallbackMsg).replace('{value}', String(raw)),
          param: r.param,
          value: v,
          expected: expectedRange[r.id],
        });
        this.incrementMetric('ruleFailures', r.id);
      }
    }

    // Determine overall status
    const hasErrors = failures.some(f => f.severity === 'error');
    const hasWarnings = failures.some(f => f.severity === 'warn');
    
    const status: CoherencyStatus = hasErrors ? 'FAIL' : hasWarnings ? 'WARN' : 'PASS';

    return {
      status,
      failures,
      timestamp: new Date().toISOString()
    };
  }

  // ============================================================================
  // Kill Switch Management
  // ============================================================================

  /**
   * REB 8.8.3-KS-B: Trip the kill switch for a specific mode.
   * Uses the SAME code path as /api/trading/stop:
   * 1. Set killSwitchTripped = true
   * 2. Set isEngineActive = false (via updateSystemContext)
   * 3. Clear Active Filter Pool
   * 4. Broadcast system:killswitch_tripped event
   * State is persisted to database for restart resilience.
   */
  public async tripKillSwitch(mode: TradingMode, reason: string, lossPercent?: number, threshold?: number): Promise<void> {
    console.log(`[GuardrailPolicy] 🚨 KILL SWITCH TRIPPED for ${mode}: ${reason}`);
    
    // 1. Persist kill switch state to database — ONLY its own three columns (#1088).
    // It used to go through `upsertGuardrailsV2`, whose update list never carried these columns, so a
    // trip was never saved; and it re-wrote every other guardrail from a read taken just before, so a
    // setting saved in between was reverted (PRE_AUDIT §13 F9). `setKillSwitchState` throws when the
    // mode has no row — a kill switch with no configured guardrails row is a real error.
    await storage.setKillSwitchState(mode, { tripped: true, reason, trippedAt: new Date() });
    
    // 2. REB 8.8.3-KS-B: Stop trading using SAME path as /api/trading/stop
    // Set isEngineActive = false
    await storage.updateSystemContext(mode, {
      isEngineActive: false,
      changeReason: `Kill switch tripped: ${reason}`
    });
    console.log(`[GuardrailPolicy][KS-B] Set isEngineActive=false for ${mode}`);
    
    // 3. REB 8.8.3-KS-B: Clear Active Filter Pool (same as trading stop)
    try {
      // P19-B3b: activeFilterPool is exported from active-filter-pool.js (fx5-scanner
      // re-consumes it from there); the old ./fx5-scanner.js import path no longer
      // re-exports it.
      const { activeFilterPool } = await import('./active-filter-pool.js');
      activeFilterPool.enforcePassiveModeIfStopped(mode, false);
      console.log(`[GuardrailPolicy][KS-B] Cleared Active Pool for ${mode}`);
    } catch (err: any) {
      console.error(`[GuardrailPolicy] Failed to clear Active Pool:`, err.message);
    }
    
    // 4. Stop the appropriate engine
    try {
      if (mode === 'paper') {
        const { stopActiveEngine } = await import('./active-engine-service.js');
        await stopActiveEngine('system'); // System-initiated stop
        console.log(`[GuardrailPolicy][KS-B] Paper simulation stopped`);
      } else {
        // P19-B3b: the live trading engine does not exist yet (Phase-21 work). The
        // prior dynamic import of ./global-live-engine.js referenced a non-existent
        // module. Do NOT import it; log honestly that the live kill-switch engine
        // stop is not wired. The kill-switch state + isEngineActive=false above are
        // already persisted, so live trading cannot resume; only the (absent)
        // in-memory engine.stop() is a no-op until Phase-21.
        console.warn(`[GuardrailPolicy][KS-B] Live kill-switch not wired until Phase-21 (live engine not built); kill-switch state persisted, isEngineActive=false for ${mode}`);
      }
    } catch (err: any) {
      console.error(`[GuardrailPolicy] Failed to stop engine:`, err.message);
    }
    
    const current = this.metrics.killSwitchTrips.get(mode) || 0;
    this.metrics.killSwitchTrips.set(mode, current + 1);
    
    // 5. Broadcast kill switch event
    await this.emitEvent('guardrail.kill_switch.tripped', {
      type: 'system:killswitch_tripped',
      mode,
      reason,
      lossPercent: lossPercent || 0,
      threshold: threshold || 0,
      timestamp: new Date().toISOString(),
      tripCount: current + 1
    });
    
    // 6. Broadcast state change for UI
    try {
      const { tradingStateSync } = await import('./trading-state-sync.js');
      tradingStateSync.broadcastUserUpdate('system')
        .catch(err => console.warn('[GuardrailPolicy] Broadcast error:', err.message));
    } catch (err: any) {
      console.error(`[GuardrailPolicy] Failed to broadcast state:`, err.message);
    }
  }

  /**
   * Reset the kill switch for a specific mode.
   * State is persisted to database for restart resilience.
   */
  public async resetKillSwitch(mode: TradingMode): Promise<void> {
    console.log(`[GuardrailPolicy] ✅ Kill switch reset for ${mode}`);
    
    // Persist to database — ONLY the kill switch's own three columns (#1088; see tripKillSwitch).
    await storage.setKillSwitchState(mode, { tripped: false, reason: null, trippedAt: null });

    // P19-B6: clear the in-memory daily-loss-budget state for this mode — releases the
    // `killInProgress` re-entrancy latch AND re-arms the warning tiers (Langston invariant 1b).
    // Tied to the same restart that advances engineSessionStart, so the loss window, the latch,
    // and the warnings all rebaseline together (circuit-breaker semantics).
    try {
      const { resetDailyLossBudgetState } = await import('./daily-loss-budget.js');
      resetDailyLossBudgetState(mode);
    } catch (err: any) {
      console.error('[GuardrailPolicy] Failed to reset daily-loss budget state:', err?.message);
    }

    await this.emitEvent('guardrail.kill_switch.reset', {
      mode,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Check if kill switch is currently tripped for a mode.
   * Reads from database for restart-safe state.
   */
  public async isKillSwitchTripped(mode: TradingMode): Promise<boolean> {
    try {
      const guardrails = await storage.getGuardrailsV2({ mode });
      return guardrails?.killSwitchTripped || false;
    } catch (error) {
      console.error(`[GuardrailPolicy] Error checking kill switch for ${mode}:`, error);
      // Fail-safe: assume tripped on error for safety
      return true;
    }
  }

  // ============================================================================
  // Metrics & Telemetry
  // ============================================================================

  private incrementMetric(category: 'ruleFailures' | 'ruleWarnings', ruleId: string): void {
    const map = this.metrics[category];
    const current = map.get(ruleId) || 0;
    map.set(ruleId, current + 1);
  }

  /**
   * Get current metrics snapshot
   */
  public getMetrics() {
    return {
      ruleFailures: Object.fromEntries(this.metrics.ruleFailures),
      ruleWarnings: Object.fromEntries(this.metrics.ruleWarnings),
      killSwitchTrips: {
        paper: this.metrics.killSwitchTrips.get('paper') || 0,
        live: this.metrics.killSwitchTrips.get('live') || 0
      },
      overrideConflicts: {
        paper: this.metrics.overrideConflicts.get('paper') || 0,
        live: this.metrics.overrideConflicts.get('live') || 0
      }
    };
  }

  /**
   * Emit telemetry event (integrates with ContextBridge)
   */
  private async emitEvent(
    type: 'guardrail.kill_switch.tripped' | 'guardrail.kill_switch.reset' | 'guardrail.override.conflict' | 'guardrail.policy.updated',
    payload: any
  ): Promise<void> {
    try {
      const { contextBridge } = await import('./context-bridge');
      contextBridge.broadcast({
        type,
        payload
      });
    } catch (error: any) {
      console.error(`[GuardrailPolicy] Failed to emit event ${type}:`, error.message);
    }
  }

  /**
   * Log structured JSON for policy events
   */
  public logPolicyEvent(data: {
    ruleId?: string;
    mode: TradingMode;
    param?: string;
    oldValue?: any;
    newValue?: any;
    status: CoherencyStatus;
    message?: string;
  }): void {
    console.log('[GuardrailPolicy:Event]', JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data
    }));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const guardrailPolicy = new GuardrailPolicyService();
