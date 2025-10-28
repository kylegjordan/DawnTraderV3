/**
 * Goals Learning Engine
 * Phase 6: Adaptive Learning Mode
 * 
 * Automatically adjusts preset boundaries based on historical performance metrics.
 * Expands preset ranges by 5% when performance consistently reaches 80% of target ceiling.
 * Enforces global safety caps to prevent excessive risk expansion.
 */

import { storage } from '../storage';
import { contextBridge } from './context-bridge';

// Global safety caps (Phase 6 specification)
const SAFETY_CAPS = {
  MAX_PORTFOLIO_RISK_PER_TRADE_PCT: 5.0,   // Maximum 5% portfolio risk per trade
  MAX_DAILY_LOSS_KILL_SWITCH_PCT: 20.0,    // Maximum 20% daily loss kill switch
  MAX_SYMBOL_COOLDOWN_MINUTES: 90,         // Maximum 90 minutes cooldown
  MAX_OPEN_POSITIONS: 20                   // Maximum 20 open positions
};

// Learning threshold (80% of target = trigger expansion)
const PERFORMANCE_THRESHOLD_MULTIPLIER = 0.8;

// Expansion rate (5% increase)
const EXPANSION_RATE = 1.05;

// Learning engine metrics
interface LearningMetrics {
  mode: 'paper' | 'live';
  avg_daily_return_30d: number | null;
  avg_risk_per_trade_30d: number | null;
  avg_drawdown_30d: number | null;
  total_trades_30d: number | null;
}

interface PresetAdjustmentResult {
  presetName: string;
  adjusted: boolean;
  reason: string;
  oldValues?: Partial<{
    portfolioRiskPerTradePct: string;
    dailyLossKillSwitchPct: string;
    symbolCooldownMinutes: number;
    maxOpenPositions: number;
  }>;
  newValues?: Partial<{
    portfolioRiskPerTradePct: string;
    dailyLossKillSwitchPct: string;
    symbolCooldownMinutes: number;
    maxOpenPositions: number;
  }>;
}

class GoalsLearningEngine {
  private runningMode: Set<'paper' | 'live'> = new Set();

  /**
   * Run the learning engine for a specific mode.
   * Analyzes performance and adjusts presets if conditions are met.
   */
  public async run(mode: 'paper' | 'live'): Promise<PresetAdjustmentResult[]> {
    // Prevent concurrent runs for the same mode
    if (this.runningMode.has(mode)) {
      console.log(`[GoalsLearningEngine] Already running for ${mode}, skipping...`);
      return [];
    }

    this.runningMode.add(mode);
    
    try {
      console.log(`[GoalsLearningEngine] 🔄 Starting learning cycle for ${mode} mode...`);
      
      // Step 1: Fetch 30-day performance metrics
      const metrics = await this.fetchLearningMetrics(mode);
      
      if (!metrics || metrics.avg_daily_return_30d === null) {
        console.log(`[GoalsLearningEngine] ⏸️  No metrics available for ${mode}, skipping...`);
        return [];
      }

      // Step 2: Fetch all presets for this mode (excluding 'custom')
      const presets = await storage.getGoalsPresets({ mode });
      const managedPresets = presets.filter(p => p.name !== 'custom');

      // Step 3: Evaluate each preset and adjust if needed
      const results: PresetAdjustmentResult[] = [];
      
      for (const preset of managedPresets) {
        const result = await this.evaluateAndAdjustPreset(mode, preset, metrics);
        results.push(result);
      }

      // Step 4: Emit telemetry summary
      const adjustedCount = results.filter(r => r.adjusted).length;
      if (adjustedCount > 0) {
        await contextBridge.broadcast({
          type: 'goals.learning.completed',
          payload: {
            mode,
            adjustedPresets: adjustedCount,
            totalPresets: managedPresets.length,
            timestamp: new Date().toISOString()
          },
          timestamp: new Date().toISOString()
        });
        
        console.log(`[GoalsLearningEngine] ✅ Adjusted ${adjustedCount}/${managedPresets.length} presets for ${mode}`);
      } else {
        console.log(`[GoalsLearningEngine] ℹ️  No preset adjustments needed for ${mode}`);
      }

      return results;
      
    } catch (error: any) {
      console.error(`[GoalsLearningEngine] ❌ Error during learning cycle for ${mode}:`, error.message);
      throw error;
    } finally {
      this.runningMode.delete(mode);
    }
  }

  /**
   * Fetch 30-day learning metrics from the summary view
   */
  private async fetchLearningMetrics(mode: 'paper' | 'live'): Promise<LearningMetrics | null> {
    const summary = await storage.getLearningSummary({ mode });
    return summary;
  }

  /**
   * Evaluate a single preset and adjust if performance threshold is met
   */
  private async evaluateAndAdjustPreset(
    mode: 'paper' | 'live',
    preset: any,
    metrics: LearningMetrics
  ): Promise<PresetAdjustmentResult> {
    const presetName = preset.name;
    
    // Calculate performance vs target
    const targetReturn = parseFloat(preset.targetDailyAvgEarningPct);
    const actualReturn = metrics.avg_daily_return_30d || 0;
    const performanceRatio = targetReturn > 0 ? actualReturn / targetReturn : 0;

    console.log(
      `[GoalsLearningEngine][${mode}][${presetName}] Performance: ${(performanceRatio * 100).toFixed(1)}% ` +
      `(actual: ${actualReturn.toFixed(3)}%, target: ${targetReturn.toFixed(3)}%)`
    );

    // Check if performance meets expansion threshold (80% of target)
    if (performanceRatio < PERFORMANCE_THRESHOLD_MULTIPLIER) {
      return {
        presetName,
        adjusted: false,
        reason: `Performance ${(performanceRatio * 100).toFixed(1)}% below threshold (${(PERFORMANCE_THRESHOLD_MULTIPLIER * 100)}%)`
      };
    }

    // Performance is good - calculate new expanded values
    const oldValues = {
      portfolioRiskPerTradePct: preset.portfolioRiskPerTradePct,
      dailyLossKillSwitchPct: preset.dailyLossKillSwitchPct,
      symbolCooldownMinutes: preset.symbolCooldownMinutes,
      maxOpenPositions: preset.maxOpenPositions
    };

    const newValues = this.calculateExpandedValues(oldValues);

    // Check if any values changed (not capped out)
    const hasChanges = Object.keys(oldValues).some(
      key => oldValues[key as keyof typeof oldValues] !== newValues[key as keyof typeof newValues]
    );

    if (!hasChanges) {
      return {
        presetName,
        adjusted: false,
        reason: 'All parameters at safety caps',
        oldValues,
        newValues
      };
    }

    // Apply the adjustment to database
    await this.applyPresetAdjustment(mode, presetName, newValues);

    // Emit telemetry event
    await contextBridge.broadcast({
      type: 'goals.learning.expanded',
      payload: {
        mode,
        presetName,
        performanceRatio: parseFloat(performanceRatio.toFixed(3)),
        oldValues,
        newValues,
        timestamp: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

    console.log(`[GoalsLearningEngine][${mode}][${presetName}] ✨ Expanded preset boundaries by 5%`);

    return {
      presetName,
      adjusted: true,
      reason: `Performance ${(performanceRatio * 100).toFixed(1)}% meets expansion threshold`,
      oldValues,
      newValues
    };
  }

  /**
   * Calculate expanded values with safety cap enforcement
   */
  private calculateExpandedValues(current: {
    portfolioRiskPerTradePct: string;
    dailyLossKillSwitchPct: string;
    symbolCooldownMinutes: number;
    maxOpenPositions: number;
  }) {
    const expanded = {
      portfolioRiskPerTradePct: this.applyExpansionCap(
        parseFloat(current.portfolioRiskPerTradePct) * EXPANSION_RATE,
        SAFETY_CAPS.MAX_PORTFOLIO_RISK_PER_TRADE_PCT
      ).toFixed(2),
      dailyLossKillSwitchPct: this.applyExpansionCap(
        parseFloat(current.dailyLossKillSwitchPct) * EXPANSION_RATE,
        SAFETY_CAPS.MAX_DAILY_LOSS_KILL_SWITCH_PCT
      ).toFixed(2),
      symbolCooldownMinutes: Math.floor(
        this.applyExpansionCap(
          current.symbolCooldownMinutes * EXPANSION_RATE,
          SAFETY_CAPS.MAX_SYMBOL_COOLDOWN_MINUTES
        )
      ),
      maxOpenPositions: Math.floor(
        this.applyExpansionCap(
          current.maxOpenPositions * EXPANSION_RATE,
          SAFETY_CAPS.MAX_OPEN_POSITIONS
        )
      )
    };

    return expanded;
  }

  /**
   * Apply expansion with safety cap enforcement
   */
  private applyExpansionCap(value: number, cap: number): number {
    return Math.min(value, cap);
  }

  /**
   * Apply preset adjustment to database
   */
  private async applyPresetAdjustment(
    mode: 'paper' | 'live',
    presetName: string,
    newValues: {
      portfolioRiskPerTradePct: string;
      dailyLossKillSwitchPct: string;
      symbolCooldownMinutes: number;
      maxOpenPositions: number;
    }
  ): Promise<void> {
    // Update preset values using raw SQL to bypass insert schema validation
    const { db } = await import('../db');
    const { goalsPresets } = await import('@shared/schema');
    const { eq, and, sql } = await import('drizzle-orm');

    await db
      .update(goalsPresets)
      .set({
        portfolioRiskPerTradePct: newValues.portfolioRiskPerTradePct,
        dailyLossKillSwitchPct: newValues.dailyLossKillSwitchPct,
        symbolCooldownMinutes: newValues.symbolCooldownMinutes,
        maxOpenPositions: newValues.maxOpenPositions,
        updatedAt: new Date()
      })
      .where(and(
        eq(goalsPresets.mode, mode),
        eq(goalsPresets.name, presetName as any)
      ));

    // Update learning status
    await storage.updatePresetLearningStatus({
      mode,
      presetName,
      lastAdjustedAt: new Date(),
      learningActive: true
    });
  }

  /**
   * Get learning engine status for a mode
   */
  public isRunning(mode: 'paper' | 'live'): boolean {
    return this.runningMode.has(mode);
  }

  /**
   * Get safety caps configuration
   */
  public getSafetyCaps() {
    return { ...SAFETY_CAPS };
  }
}

// Export singleton instance
export const goalsLearningEngine = new GoalsLearningEngine();
