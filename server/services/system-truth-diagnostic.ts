/**
 * Phase 8.5 Addendum G - System Truth Diagnostic Service
 * 
 * Compares portfolio, strategies, engineActive, and risk settings
 * across Backend, Cortex, and Walter layers to detect discrepancies.
 */

import { storage } from '../storage';
import { cortexCore } from './cortex/cortex-core';
import { fetchUserContext } from './behavioral-template';

// SimulationSession type (defined in routes.ts)
interface SimulationSession {
  sessionId: string;
  startedBy: string;
  startTime: Date;
  isRunning: boolean;
  type: '48hr' | 'manual';
}

const MODULE_NAME = 'SystemTruthDiag';

export interface TruthSnapshot {
  source: 'backend' | 'cortex' | 'walter';
  timestamp: string;
  portfolioBalance: number;
  activeStrategies: string[];
  activeStrategiesCount: number;
  engineActive: boolean;
  mode: 'live' | 'paper';
  riskPerTrade: number;
  dailyLossKillSwitch: number;
  maxExposurePercent: number;
}

export interface TruthComparison {
  backend: TruthSnapshot;
  cortex: TruthSnapshot;
  walter: TruthSnapshot;
  discrepancies: Discrepancy[];
  isAligned: boolean;
  timestamp: string;
  liveAPIUsed: boolean; // Phase 8.5 Addendum I
}

export interface Discrepancy {
  field: string;
  backend: any;
  cortex: any;
  walter: any;
  severity: 'low' | 'medium' | 'high';
  delta?: number;
}

class SystemTruthDiagnosticService {
  private readonly MODULE_NAME = MODULE_NAME;

  /**
   * Run comprehensive truth check across all system layers
   */
  async runTruthCheck(userId: string, mode: 'live' | 'paper'): Promise<TruthComparison> {
    console.log(`[${this.MODULE_NAME}] 🔍 Running truth check for user ${userId} (${mode})`);
    const start = Date.now();

    try {
      // Fetch snapshots in parallel
      const [backendSnapshot, cortexSnapshot, walterSnapshot] = await Promise.all([
        this.getBackendSnapshot(userId, mode),
        this.getCortexSnapshot(userId, mode),
        this.getWalterSnapshot(userId, mode)
      ]);

      // Detect discrepancies
      const discrepancies = this.detectDiscrepancies(backendSnapshot, cortexSnapshot, walterSnapshot);
      const isAligned = discrepancies.length === 0;

      const comparison: TruthComparison = {
        backend: backendSnapshot,
        cortex: cortexSnapshot,
        walter: walterSnapshot,
        discrepancies,
        isAligned,
        timestamp: new Date().toISOString(),
        liveAPIUsed: true // Phase 8.5 Addendum I
      };

      const elapsed = Date.now() - start;
      console.log(`[${this.MODULE_NAME}] ${isAligned ? '✅' : '⚠️'} Truth check complete in ${elapsed}ms - ${discrepancies.length} discrepancies found`);

      // Phase 8.5 Addendum H: Log alerts for discrepancies
      if (!isAligned) {
        console.warn(`[${this.MODULE_NAME}] 🚨 DISCREPANCIES DETECTED:`, discrepancies);
        
        // Log high-severity discrepancies as alerts
        const highSeverity = discrepancies.filter(d => d.severity === 'high');
        if (highSeverity.length > 0) {
          console.error(`[TruthAlert] ⚠️ HIGH SEVERITY: ${highSeverity.length} critical misalignments detected - system layers out of sync`);
          highSeverity.forEach(d => {
            console.error(`[TruthAlert] Field: ${d.field}, Backend: ${JSON.stringify(d.backend)}, Cortex: ${JSON.stringify(d.cortex)}, Walter: ${JSON.stringify(d.walter)}`);
          });
        }

        // Emit warning for medium/low severity
        const mediumLow = discrepancies.filter(d => d.severity !== 'high');
        if (mediumLow.length > 0) {
          console.warn(`[TruthAlert] ⚠️ MEDIUM/LOW: ${mediumLow.length} minor misalignments - consider refreshing context`);
        }
      }

      return comparison;
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] ❌ Truth check failed:`, error);
      throw error;
    }
  }

  /**
   * Get backend truth snapshot from database and /api/trading/status equivalent
   * Phase 8.5 Addendum I: Uses live API source - matches /api/trading/status exactly
   */
  private async getBackendSnapshot(userId: string, mode: 'live' | 'paper'): Promise<TruthSnapshot> {
    // Get portfolio state - NO FALLBACK to 1000 (Phase 8.5 Addendum I)
    const portfolioState = await storage.getPortfolioState({ userId, mode });
    const portfolioBalance = portfolioState ? parseFloat(portfolioState.balance) : 0;

    // Get active strategies
    const strategies = await storage.listStrategySettings({ userId, mode });
    const activeStrategies = strategies
      .filter(s => s.enabled)
      .map(s => s.strategy)
      .sort();

    // Get trading settings
// Phase 41F-L.E2E-PURGE: DISABLED -     const settings = await storage.getTradingSettings(userId);

    // Get engineActive from global session (same logic as /api/trading/status)
    const globalSession = (global as any).getGlobalSession?.() as SimulationSession | null;
    const engineActive = !!(globalSession && globalSession.isRunning);

    return {
      source: 'backend',
      timestamp: new Date().toISOString(),
      portfolioBalance,
      activeStrategies,
      activeStrategiesCount: activeStrategies.length,
      engineActive,
      mode,
      riskPerTrade: settings?.riskPerTrade ? parseFloat(settings.riskPerTrade.toString()) : 0,
      dailyLossKillSwitch: settings?.dailyLossKillSwitch ? parseFloat(settings.dailyLossKillSwitch.toString()) : 7.0,
      maxExposurePercent: settings?.maxExposurePercent ? parseFloat(settings.maxExposurePercent.toString()) : 100
    };
  }

  /**
   * Get Cortex truth snapshot from cached analytics data
   */
  private async getCortexSnapshot(userId: string, mode: 'live' | 'paper'): Promise<TruthSnapshot> {
    // Get analytics from Cortex cache
    const cacheKey = `analytics_${mode}_${userId}`;
    const analytics = cortexCore.get(cacheKey);

    if (!analytics) {
      console.warn(`[${this.MODULE_NAME}] No Cortex analytics found for user ${userId} (${mode}) - returning empty snapshot`);
      return {
        source: 'cortex',
        timestamp: new Date().toISOString(),
        portfolioBalance: 0,
        activeStrategies: [],
        activeStrategiesCount: 0,
        engineActive: false,
        mode,
        riskPerTrade: 0,
        dailyLossKillSwitch: 7.0,
        maxExposurePercent: 100
      };
    }

    // Extract data from Cortex analytics snapshot
    const portfolioSummary = analytics.portfolio_summary || {};
    const strategyAnalytics = analytics.strategy_analytics || {};
    
    // Get enabled strategies from strategy analytics
    const enabledStrategies = (strategyAnalytics.strategies || [])
      .filter((s: any) => s.enabled)
      .map((s: any) => s.strategy)
      .sort();

    // Get settings from first strategy (they share the same settings)
    const firstStrategy = strategyAnalytics.strategies?.[0] || {};

    return {
      source: 'cortex',
      timestamp: analytics.computed_at || new Date().toISOString(),
      portfolioBalance: portfolioSummary.totalEquity || 0,
      activeStrategies: enabledStrategies,
      activeStrategiesCount: enabledStrategies.length,
      engineActive: false, // Cortex doesn't track engine state
      mode,
      riskPerTrade: firstStrategy.riskPerTrade || 0,
      dailyLossKillSwitch: firstStrategy.dailyLossKillSwitch || 7.0,
      maxExposurePercent: firstStrategy.maxExposurePercent || 100
    };
  }

  /**
   * Get Walter truth snapshot from current context
   */
  private async getWalterSnapshot(userId: string, mode: 'live' | 'paper'): Promise<TruthSnapshot> {
    const context = await fetchUserContext(userId);

    return {
      source: 'walter',
      timestamp: new Date().toISOString(),
      portfolioBalance: context.portfolioValue,
      activeStrategies: context.enabledStrategies.sort(),
      activeStrategiesCount: context.enabledStrategies.length,
      engineActive: false, // Walter doesn't track engine state directly
      mode: context.mode,
      riskPerTrade: context.riskPerTrade,
      dailyLossKillSwitch: context.dailyLossKillSwitch,
      maxExposurePercent: context.maxExposurePercent
    };
  }

  /**
   * Detect discrepancies between backend, Cortex, and Walter snapshots
   */
  private detectDiscrepancies(
    backend: TruthSnapshot,
    cortex: TruthSnapshot,
    walter: TruthSnapshot
  ): Discrepancy[] {
    const discrepancies: Discrepancy[] = [];

    // Compare portfolioBalance (critical)
    if (this.hasNumericDiscrepancy(backend.portfolioBalance, cortex.portfolioBalance, walter.portfolioBalance, 0.01)) {
      discrepancies.push({
        field: 'portfolioBalance',
        backend: backend.portfolioBalance,
        cortex: cortex.portfolioBalance,
        walter: walter.portfolioBalance,
        severity: 'high',
        delta: Math.abs(backend.portfolioBalance - cortex.portfolioBalance)
      });
    }

    // Compare activeStrategies (critical)
    const backendStrats = backend.activeStrategies.join(',');
    const cortexStrats = cortex.activeStrategies.join(',');
    const walterStrats = walter.activeStrategies.join(',');

    if (backendStrats !== cortexStrats || backendStrats !== walterStrats) {
      discrepancies.push({
        field: 'activeStrategies',
        backend: backend.activeStrategies,
        cortex: cortex.activeStrategies,
        walter: walter.activeStrategies,
        severity: 'high'
      });
    }

    // Compare riskPerTrade (medium priority)
    if (this.hasNumericDiscrepancy(backend.riskPerTrade, cortex.riskPerTrade, walter.riskPerTrade, 0.01)) {
      discrepancies.push({
        field: 'riskPerTrade',
        backend: backend.riskPerTrade,
        cortex: cortex.riskPerTrade,
        walter: walter.riskPerTrade,
        severity: 'medium',
        delta: Math.abs(backend.riskPerTrade - walter.riskPerTrade)
      });
    }

    // Compare dailyLossKillSwitch (medium priority)
    if (this.hasNumericDiscrepancy(backend.dailyLossKillSwitch, cortex.dailyLossKillSwitch, walter.dailyLossKillSwitch, 0.01)) {
      discrepancies.push({
        field: 'dailyLossKillSwitch',
        backend: backend.dailyLossKillSwitch,
        cortex: cortex.dailyLossKillSwitch,
        walter: walter.dailyLossKillSwitch,
        severity: 'medium',
        delta: Math.abs(backend.dailyLossKillSwitch - walter.dailyLossKillSwitch)
      });
    }

    // Compare maxExposurePercent (low priority)
    if (this.hasNumericDiscrepancy(backend.maxExposurePercent, cortex.maxExposurePercent, walter.maxExposurePercent, 0.01)) {
      discrepancies.push({
        field: 'maxExposurePercent',
        backend: backend.maxExposurePercent,
        cortex: cortex.maxExposurePercent,
        walter: walter.maxExposurePercent,
        severity: 'low',
        delta: Math.abs(backend.maxExposurePercent - walter.maxExposurePercent)
      });
    }

    return discrepancies;
  }

  /**
   * Check if numeric values have significant discrepancy
   */
  private hasNumericDiscrepancy(backend: number, cortex: number, walter: number, threshold: number): boolean {
    const maxDelta = Math.max(
      Math.abs(backend - cortex),
      Math.abs(backend - walter),
      Math.abs(cortex - walter)
    );
    return maxDelta > threshold;
  }

  /**
   * Generate Markdown report of truth comparison
   */
  generateMarkdownReport(comparison: TruthComparison): string {
    const { backend, cortex, walter, discrepancies, isAligned, timestamp } = comparison;

    let report = `# System Truth Alignment Report\n\n`;
    report += `**Generated:** ${timestamp}\n`;
    report += `**Status:** ${isAligned ? '✅ ALIGNED' : '⚠️ DISCREPANCIES DETECTED'}\n\n`;

    if (!isAligned) {
      report += `## 🚨 Discrepancies (${discrepancies.length})\n\n`;
      for (const disc of discrepancies) {
        report += `### ${disc.field} [${disc.severity.toUpperCase()}]\n`;
        report += `- **Backend:** ${JSON.stringify(disc.backend)}\n`;
        report += `- **Cortex:** ${JSON.stringify(disc.cortex)}\n`;
        report += `- **Walter:** ${JSON.stringify(disc.walter)}\n`;
        if (disc.delta !== undefined) {
          report += `- **Delta:** ${disc.delta.toFixed(2)}\n`;
        }
        report += `\n`;
      }
    }

    report += `## Truth Snapshots\n\n`;
    report += `### Backend\n\`\`\`json\n${JSON.stringify(backend, null, 2)}\n\`\`\`\n\n`;
    report += `### Cortex\n\`\`\`json\n${JSON.stringify(cortex, null, 2)}\n\`\`\`\n\n`;
    report += `### Walter\n\`\`\`json\n${JSON.stringify(walter, null, 2)}\n\`\`\`\n\n`;

    return report;
  }
}

// Singleton instance
export const systemTruthDiagnostic = new SystemTruthDiagnosticService();
