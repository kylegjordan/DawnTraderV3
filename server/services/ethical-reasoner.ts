import { db } from '../db';
import { ethicalPrinciple, ethicalViolationLog } from '@shared/schema';
import type { EthicalPrinciple, EthicalVerdict, ViolationSeverity, InsertEthicalViolationLog } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { contextBridge } from './context-bridge';

/**
 * Phase 13.0: Ethical Reasoner Service
 * 
 * Evaluates all proposed actions (trades, decisions, analysis) against ethical principles.
 * Provides verdict (approved, rejected, requires_review) with reasoning.
 * Logs violations and broadcasts events for transparency.
 */

export interface EthicalEvaluationResult {
  verdict: EthicalVerdict;
  severity: ViolationSeverity;
  principlesViolated: string[];
  reasons: string[];
  requiresHumanReview: boolean;
}

export interface EthicalAction {
  actor: string;
  action: string;
  context: {
    tradeAmount?: number;
    riskLevel?: string;
    marketCondition?: string;
    userApproved?: boolean;
    [key: string]: any;
  };
}

class EthicalReasonerService {
  private principlesCache: EthicalPrinciple[] = [];
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  /**
   * Evaluate an action against all enabled ethical principles
   */
  async evaluateAction(ethicalAction: EthicalAction): Promise<EthicalEvaluationResult> {
    console.log(`[EthicalReasoner] Evaluating action: ${ethicalAction.action} by ${ethicalAction.actor}`);

    // Step 1: Load active principles
    const principles = await this.getActivePrinciples();
    console.log(`[EthicalReasoner] Found ${principles.length} active ethical principles`);

    // Step 2: Evaluate against each principle
    const violations: { principle: string; reason: string; severity: ViolationSeverity }[] = [];
    
    for (const principle of principles) {
      const violation = this.checkPrincipleViolation(ethicalAction, principle);
      if (violation) {
        violations.push(violation);
      }
    }

    // Step 3: Determine verdict based on violations
    const verdict = this.determineVerdict(violations);
    const maxSeverity = this.getMaxSeverity(violations);
    const principlesViolated = violations.map(v => v.principle);
    const reasons = violations.map(v => v.reason);

    // Step 4: Log violations if any
    if (violations.length > 0) {
      for (const violation of violations) {
        await this.logViolation({
          actor: ethicalAction.actor,
          action: ethicalAction.action,
          principleViolated: violation.principle,
          verdict,
          severity: violation.severity,
          reason: violation.reason,
          metadata: ethicalAction.context,
        });
      }

      // Emit to Context Bridge
      await contextBridge.broadcast({
        type: 'ethical_event',
        payload: {
          verdict,
          severity: maxSeverity,
          principlesViolated,
          actor: ethicalAction.actor,
          action: ethicalAction.action,
          reasons,
        },
      });

      console.warn(`[EthicalReasoner] ⚖️ Action verdict: ${verdict} - Violations: ${principlesViolated.join(', ')}`);
    } else {
      console.log(`[EthicalReasoner] ✅ Action approved - No ethical violations detected`);
    }

    return {
      verdict,
      severity: maxSeverity,
      principlesViolated,
      reasons,
      requiresHumanReview: verdict === 'requires_review',
    };
  }

  /**
   * Clear the principles cache (called when principles are updated)
   */
  clearCache(): void {
    this.principlesCache = [];
    this.lastCacheUpdate = 0;
    console.log('[EthicalReasoner] Cache cleared');
  }

  /**
   * Get active ethical principles (with caching)
   */
  private async getActivePrinciples(): Promise<EthicalPrinciple[]> {
    const now = Date.now();
    
    // Return cached principles if still fresh
    if (this.principlesCache.length > 0 && (now - this.lastCacheUpdate) < this.CACHE_TTL) {
      return this.principlesCache;
    }

    // Fetch fresh principles from database
    const principles = await db
      .select()
      .from(ethicalPrinciple)
      .where(eq(ethicalPrinciple.enabled, true))
      .orderBy(ethicalPrinciple.priority);

    this.principlesCache = principles;
    this.lastCacheUpdate = now;

    return principles;
  }

  /**
   * Check if an action violates a specific principle
   */
  private checkPrincipleViolation(
    action: EthicalAction,
    principle: EthicalPrinciple
  ): { principle: string; reason: string; severity: ViolationSeverity } | null {
    const constraints = principle.constraints as any;

    switch (principle.name) {
      case 'transparency':
        // Check if action has proper audit trail and reasoning
        if (constraints?.require_reasoning_log && !action.context.reasoningLogId) {
          return {
            principle: principle.name,
            reason: 'Action lacks required reasoning log for transparency',
            severity: 'medium',
          };
        }
        if (constraints?.require_audit_trail && !action.context.auditTrailId) {
          return {
            principle: principle.name,
            reason: 'Action lacks required audit trail for accountability',
            severity: 'medium',
          };
        }
        break;

      case 'harm_prevention':
        // Check if action violates risk/harm prevention constraints
        if (action.context.tradeAmount && constraints?.max_risk_per_trade_pct) {
          const riskPct = action.context.riskLevel ? parseFloat(action.context.riskLevel) : 0;
          if (riskPct > constraints.max_risk_per_trade_pct) {
            return {
              principle: principle.name,
              reason: `Risk level (${riskPct}%) exceeds maximum allowed (${constraints.max_risk_per_trade_pct}%)`,
              severity: 'high',
            };
          }
        }
        if (action.context.dailyLoss && constraints?.max_daily_loss_pct) {
          const dailyLossPct = parseFloat(action.context.dailyLoss);
          if (dailyLossPct > constraints.max_daily_loss_pct) {
            return {
              principle: principle.name,
              reason: `Daily loss (${dailyLossPct}%) exceeds maximum allowed (${constraints.max_daily_loss_pct}%)`,
              severity: 'critical',
            };
          }
        }
        break;

      case 'fairness':
        // Check for prohibited market manipulation or unfair practices
        if (constraints?.prohibit_manipulation) {
          const manipulationKeywords = ['manipulate', 'front-run', 'spoof', 'wash-trade'];
          const actionLower = action.action.toLowerCase();
          for (const keyword of manipulationKeywords) {
            if (actionLower.includes(keyword)) {
              return {
                principle: principle.name,
                reason: `Action appears to involve market manipulation (${keyword})`,
                severity: 'critical',
              };
            }
          }
        }
        break;

      case 'autonomy_bounds':
        // Check if user approval is required and present
        if (constraints?.require_approval_for_live_trades && 
            action.context.tradingMode === 'live' && 
            !action.context.userApproved) {
          return {
            principle: principle.name,
            reason: 'Live trading action requires user approval but none provided',
            severity: 'high',
          };
        }
        if (constraints?.respect_user_preferences && action.context.overrideUserPreference) {
          return {
            principle: principle.name,
            reason: 'Action overrides user preferences without authorization',
            severity: 'high',
          };
        }
        break;

      case 'accountability':
        // Check for proper logging and audit capabilities
        if (constraints?.log_all_decisions && !action.context.decisionLogId) {
          return {
            principle: principle.name,
            reason: 'Autonomous decision not logged for accountability',
            severity: 'medium',
          };
        }
        if (constraints?.enable_human_review && action.context.bypassHumanReview) {
          return {
            principle: principle.name,
            reason: 'Action attempts to bypass required human review',
            severity: 'high',
          };
        }
        break;
    }

    return null;
  }

  /**
   * Determine verdict based on violations
   */
  private determineVerdict(
    violations: { principle: string; reason: string; severity: ViolationSeverity }[]
  ): EthicalVerdict {
    if (violations.length === 0) {
      return 'approved';
    }

    // Critical or high severity = rejected
    const hasCritical = violations.some(v => v.severity === 'critical');
    const hasHigh = violations.some(v => v.severity === 'high');

    if (hasCritical || hasHigh) {
      return 'rejected';
    }

    // Medium severity = requires review
    const hasMedium = violations.some(v => v.severity === 'medium');
    if (hasMedium) {
      return 'requires_review';
    }

    // Low severity = approved with warning
    return 'approved';
  }

  /**
   * Get maximum severity from violations
   */
  private getMaxSeverity(
    violations: { principle: string; reason: string; severity: ViolationSeverity }[]
  ): ViolationSeverity {
    if (violations.length === 0) return 'low';

    const severityOrder: ViolationSeverity[] = ['low', 'medium', 'high', 'critical'];
    let maxSeverity: ViolationSeverity = 'low';

    for (const violation of violations) {
      const currentIndex = severityOrder.indexOf(violation.severity);
      const maxIndex = severityOrder.indexOf(maxSeverity);
      if (currentIndex > maxIndex) {
        maxSeverity = violation.severity;
      }
    }

    return maxSeverity;
  }

  /**
   * Log an ethical violation
   */
  private async logViolation(violation: InsertEthicalViolationLog): Promise<void> {
    try {
      await db.insert(ethicalViolationLog).values(violation);
      console.log(`[EthicalReasoner] Logged violation: ${violation.principleViolated} by ${violation.actor}`);
    } catch (error) {
      console.error('[EthicalReasoner] Failed to log violation:', error);
    }
  }

  /**
   * Get ethical alignment status
   */
  async getAlignmentStatus(): Promise<{
    alignmentScore: number;
    violationsToday: number;
    principleCount: number;
    principleHealth: { principle: string; enabled: boolean; priority: number }[];
  }> {
    const principles = await this.getActivePrinciples();
    
    // Count violations in last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentViolations = await db
      .select()
      .from(ethicalViolationLog)
      .where(eq(ethicalViolationLog.createdAt, oneDayAgo)); // This is a simplified query

    // Calculate alignment score (100 = perfect, 0 = severe violations)
    const criticalViolations = recentViolations.filter(v => v.severity === 'critical').length;
    const highViolations = recentViolations.filter(v => v.severity === 'high').length;
    const mediumViolations = recentViolations.filter(v => v.severity === 'medium').length;

    let alignmentScore = 100;
    alignmentScore -= criticalViolations * 20;
    alignmentScore -= highViolations * 10;
    alignmentScore -= mediumViolations * 5;
    alignmentScore = Math.max(0, alignmentScore);

    return {
      alignmentScore,
      violationsToday: recentViolations.length,
      principleCount: principles.length,
      principleHealth: principles.map(p => ({
        principle: p.name,
        enabled: p.enabled,
        priority: p.priority,
      })),
    };
  }

  /**
   * Clear principles cache (useful after updates)
   */
  clearCache(): void {
    this.principlesCache = [];
    this.lastCacheUpdate = 0;
    console.log('[EthicalReasoner] Principles cache cleared');
  }
}

// Export singleton
export const ethicalReasoner = new EthicalReasonerService();
