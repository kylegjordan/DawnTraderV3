/**
 * Alert Context Engine (Phase 27.F.19-20)
 * 
 * Converts raw technical metrics into impact-weighted classifications.
 * Determines whether alerts should be auto-suppressed, logged, or escalated
 * based on real trading context.
 */

import { storage } from '../storage';

export interface AlertContext {
  // Raw metrics
  latency_ms?: number;
  deviation_percent?: number;
  reconnect_count?: number;
  tick_age_sec?: number;
  uptime_percent?: number;
  
  // Trading context
  active_trade_count: number;
  open_positions_value: number;
  current_volatility_index: number;
  mode: 'live' | 'paper';
  
  // Component info
  component: 'feed' | 'formula' | 'system';
  anomaly_type: string;
}

export interface ImpactAssessment {
  impact_score: number; // 0-100
  severity: 'info' | 'warning' | 'critical';
  action: 'auto_suppress' | 'log_only' | 'escalate';
  reason: string;
  confidence: number; // 0-1
}

export class AlertContextEngine {
  /**
   * Assess the real-world impact of a detected anomaly
   */
  static async assessImpact(context: AlertContext): Promise<ImpactAssessment> {
    const { component, mode } = context;
    
    // Calculate base impact score
    let impact_score = 0;
    let reason_parts: string[] = [];
    
    if (component === 'feed') {
      impact_score = this.calculateFeedImpact(context, reason_parts);
    } else if (component === 'formula') {
      impact_score = this.calculateFormulaImpact(context, reason_parts);
    } else {
      impact_score = this.calculateSystemImpact(context, reason_parts);
    }
    
    // Apply context multipliers
    const context_multiplier = this.getContextMultiplier(context);
    impact_score *= context_multiplier;
    
    // Clamp impact_score to [0, 100] (Architect feedback)
    impact_score = Math.max(0, Math.min(100, impact_score));
    
    // Determine initial severity and action
    let severity = this.getSeverity(impact_score);
    let action = this.getAction(impact_score, context);
    const confidence = this.calculateConfidence(context);
    
    // CONTEXTUAL SUPPRESSION & DOWNGRADING (when no active trades)
    // CRITICAL: Never override escalations required by impact≥15 AND (live OR trades>0)
    if (component === 'feed' && context.active_trade_count === 0) {
      
      // Suppress low-latency feed alerts (<10s) regardless of mode
      if (context.latency_ms !== undefined && context.latency_ms < 10000) {
        // Only suppress if impact didn't already require escalation
        if (action !== 'escalate') {
          action = 'auto_suppress';
          reason_parts.push(`Suppressed: latency <10s, no active trades (${context.mode} mode)`);
        }
      }
      
      // Downgrade moderate-latency alerts (10-30s) when volatility is low (paper mode only)
      if (context.mode === 'paper' &&
          context.latency_ms !== undefined &&
          context.latency_ms >= 10000 && 
          context.latency_ms <= 30000 &&
          context.current_volatility_index < 0.3) {
        // Downgrade to log_only (but respect already-suppressed actions)
        if (action !== 'auto_suppress') {
          action = 'log_only';
          reason_parts.push('Downgraded: low volatility, paper mode, no trades');
        }
        if (severity === 'critical') {
          severity = 'warning';
          reason_parts.push('Severity downgraded: low volatility, paper mode, no trades');
        }
      }
    }
    
    return {
      impact_score: Math.round(impact_score),
      severity,
      action,
      reason: reason_parts.join('; '),
      confidence,
    };
  }
  
  /**
   * Calculate impact score for feed-related issues
   */
  private static calculateFeedImpact(context: AlertContext, reasons: string[]): number {
    let score = 0;
    
    // Latency impact
    if (context.latency_ms !== undefined) {
      if (context.latency_ms < 5000) {
        score += 5;
        reasons.push('Latency < 5s (minimal impact)');
      } else if (context.latency_ms < 10000) {
        score += 15;
        reasons.push('Latency 5-10s (moderate impact)');
      } else if (context.latency_ms < 30000) {
        score += 30;
        reasons.push('Latency 10-30s (significant impact)');
      } else {
        score += 50;
        reasons.push('Latency > 30s (critical impact)');
      }
    }
    
    // Reconnect impact
    if (context.reconnect_count !== undefined) {
      if (context.reconnect_count >= 5) {
        score += 30;
        reasons.push(`${context.reconnect_count} reconnects (unstable feed)`);
      } else if (context.reconnect_count >= 3) {
        score += 15;
        reasons.push(`${context.reconnect_count} reconnects (degraded)`);
      } else if (context.reconnect_count >= 1) {
        score += 5;
        reasons.push(`${context.reconnect_count} reconnect(s)`);
      }
    }
    
    // Tick staleness
    if (context.tick_age_sec !== undefined) {
      if (context.tick_age_sec > 30) {
        score += 40;
        reasons.push('Data > 30s stale (critical)');
      } else if (context.tick_age_sec > 10) {
        score += 20;
        reasons.push('Data > 10s stale');
      } else if (context.tick_age_sec > 5) {
        score += 10;
        reasons.push('Data > 5s stale');
      }
    }
    
    // Uptime impact
    if (context.uptime_percent !== undefined && context.uptime_percent < 95) {
      score += 15;
      reasons.push(`Uptime ${context.uptime_percent.toFixed(1)}% (degraded)`);
    }
    
    return score;
  }
  
  /**
   * Calculate impact score for formula-related issues
   */
  private static calculateFormulaImpact(context: AlertContext, reasons: string[]): number {
    let score = 0;
    
    if (context.deviation_percent !== undefined) {
      if (context.deviation_percent < 0.5) {
        score += 2;
        reasons.push('Deviation < 0.5% (negligible)');
      } else if (context.deviation_percent < 1) {
        score += 10;
        reasons.push('Deviation 0.5-1% (minor)');
      } else if (context.deviation_percent < 3) {
        score += 25;
        reasons.push('Deviation 1-3% (significant)');
      } else if (context.deviation_percent < 10) {
        score += 50;
        reasons.push('Deviation 3-10% (major)');
      } else {
        score += 80;
        reasons.push('Deviation > 10% (critical)');
      }
    }
    
    return score;
  }
  
  /**
   * Calculate impact score for system issues
   */
  private static calculateSystemImpact(context: AlertContext, reasons: string[]): number {
    let score = 30; // Base score for system issues
    reasons.push('System health issue detected');
    return score;
  }
  
  /**
   * Get context multiplier based on trading state
   */
  private static getContextMultiplier(context: AlertContext): number {
    let multiplier = 1.0;
    
    // Active trades significantly increase impact
    if (context.active_trade_count > 0) {
      multiplier *= (1.0 + (context.active_trade_count * 0.3));
    }
    
    // High volatility increases impact
    if (context.current_volatility_index > 0.7) {
      multiplier *= 1.5;
    } else if (context.current_volatility_index > 0.5) {
      multiplier *= 1.2;
    }
    
    // Large open positions increase impact
    if (context.open_positions_value > 1000) {
      multiplier *= 1.3;
    } else if (context.open_positions_value > 500) {
      multiplier *= 1.15;
    }
    
    // Live mode has higher impact than paper
    if (context.mode === 'live') {
      multiplier *= 1.5;
    }
    
    return multiplier;
  }
  
  /**
   * Determine severity level from impact score
   * Critical bypass threshold (≥40)
   */
  private static getSeverity(impact_score: number): 'info' | 'warning' | 'critical' {
    if (impact_score >= 40) return 'critical'; // Only ≥40 is critical (bypasses cooldown/dedup)
    if (impact_score >= 15) return 'warning';  // 15-39 is warning (subject to dedup/cooldown gating)
    return 'info'; // <15 is informational
  }
  
  /**
   * Determine action based on impact score and context
   * Note: Contextual suppression/downgrading is applied in assessImpact() post-processing
   * 
   * Escalation Rules:
   * - Always escalate: impact ≥40 (critical)
   * - Escalate if: impact ≥15 AND (active trades >0 OR mode=live)
   * - Otherwise: log only or suppress based on impact
   */
  private static getAction(impact_score: number, context: AlertContext): 'auto_suppress' | 'log_only' | 'escalate' {
    // Very low impact: always suppress (all components)
    if (impact_score < 5) {
      return 'auto_suppress';
    }
    
    // Critical issues (≥40): always escalate
    if (impact_score >= 40) {
      return 'escalate';
    }
    
    // High issues (30-39): escalate only if live mode OR active trades present
    if (impact_score >= 30) {
      if (context.mode === 'live' || context.active_trade_count > 0) {
        return 'escalate';
      }
      return 'log_only'; // Paper mode with no active trades: just log
    }
    
    // Medium impact (15-29): escalate if active trades or live mode, otherwise log
    if (impact_score >= 15) {
      if (context.active_trade_count > 0 || context.mode === 'live') {
        return 'escalate';
      }
      return 'log_only';
    }
    
    // Low impact (5-14): always log only
    return 'log_only';
  }
  
  /**
   * Calculate confidence in the assessment
   */
  private static calculateConfidence(context: AlertContext): number {
    let confidence = 0.8; // Base confidence
    
    // More data points increase confidence
    let data_points = 0;
    if (context.latency_ms !== undefined) data_points++;
    if (context.deviation_percent !== undefined) data_points++;
    if (context.reconnect_count !== undefined) data_points++;
    if (context.tick_age_sec !== undefined) data_points++;
    if (context.uptime_percent !== undefined) data_points++;
    
    confidence += (data_points * 0.03);
    
    // Clear context increases confidence
    if (context.active_trade_count !== undefined) confidence += 0.05;
    if (context.current_volatility_index !== undefined) confidence += 0.05;
    
    return Math.min(0.99, confidence);
  }
  
  /**
   * Check if an issue has trading impact
   * Used to determine if trades should be paused
   */
  static async hasTradingImpact(impact: ImpactAssessment): Promise<boolean> {
    // Critical severity with high impact score requires trading pause
    return impact.severity === 'critical' && impact.impact_score >= 40;
  }
}
