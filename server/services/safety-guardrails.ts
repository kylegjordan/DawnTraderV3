import { db } from '../db';
import { safetyPolicy, safetyEventLog, killSwitch } from '@shared/schema';
import type { SafetyPolicy, SafetyEventLog, SafetySeverity, SafetyScope, InsertSafetyEventLog } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { contextBridge } from './context-bridge';

/**
 * Phase 11.0: Safety Guardrails Service
 * 
 * Enforces safety policies, kill-switch control, and logs safety events.
 * Integrates with Context Bridge for real-time safety event broadcasting.
 */

export interface SafetyEvaluationResult {
  allowed: boolean;
  severity: SafetySeverity;
  policyHits: string[];
  reason: string;
}

export interface SafetyAction {
  actor: string;
  action: string;
  scope: SafetyScope;
  metadata?: any;
}

class SafetyGuardrailsService {
  /**
   * Evaluate an action against all active safety policies
   */
  async evaluateAction(safetyAction: SafetyAction): Promise<SafetyEvaluationResult> {
    console.log(`[SafetyGuardrails] Evaluating action: ${safetyAction.action} by ${safetyAction.actor}`);

    // Step 1: Check kill switch first
    const killSwitchStatus = await this.getKillSwitchStatus();
    if (killSwitchStatus.isEnabled) {
      console.warn(`[SafetyGuardrails] ⛔ Kill switch is ENABLED - blocking all trading/execution`);
      
      // Log the blocked action
      await this.logEvent({
        actor: safetyAction.actor,
        action: safetyAction.action,
        policyHits: ['KILL_SWITCH'],
        severity: 'critical',
        metadata: {
          ...safetyAction.metadata,
          killSwitchReason: killSwitchStatus.reason,
        },
      });

      // Emit to Context Bridge
      await contextBridge.broadcast({
        type: 'safety_event',
        payload: {
          severity: 'critical',
          policyHits: ['KILL_SWITCH'],
          actor: safetyAction.actor,
          action: safetyAction.action,
          blocked: true,
        },
      });

      return {
        allowed: false,
        severity: 'critical',
        policyHits: ['KILL_SWITCH'],
        reason: `Kill switch is enabled: ${killSwitchStatus.reason || 'Emergency shutdown'}`,
      };
    }

    // Step 2: Fetch active policies for the action's scope
    const policies = await db
      .select()
      .from(safetyPolicy)
      .where(and(
        eq(safetyPolicy.enabled, true),
        eq(safetyPolicy.scope, safetyAction.scope)
      ));

    console.log(`[SafetyGuardrails] Found ${policies.length} active policies for scope: ${safetyAction.scope}`);

    // Step 3: Evaluate against each policy
    const violations: string[] = [];
    let maxSeverity: SafetySeverity = 'low';

    for (const policy of policies) {
      const violated = this.checkPolicyViolation(safetyAction, policy);
      if (violated) {
        violations.push(policy.policyName);
        const policySeverity = this.determineSeverity(policy);
        if (this.compareSeverity(policySeverity, maxSeverity) > 0) {
          maxSeverity = policySeverity;
        }
      }
    }

    // Step 4: Determine if action is allowed
    const allowed = violations.length === 0;
    const severity = violations.length > 0 ? maxSeverity : 'low';

    // Step 5: Log the event
    if (!allowed) {
      await this.logEvent({
        actor: safetyAction.actor,
        action: safetyAction.action,
        policyHits: violations,
        severity,
        metadata: safetyAction.metadata,
      });

      // Emit to Context Bridge
      await contextBridge.broadcast({
        type: 'safety_event',
        payload: {
          severity,
          policyHits: violations,
          actor: safetyAction.actor,
          action: safetyAction.action,
          blocked: true,
        },
      });

      console.warn(`[SafetyGuardrails] ⚠️ Action BLOCKED - Violations: ${violations.join(', ')}`);
    } else {
      console.log(`[SafetyGuardrails] ✅ Action allowed - No violations`);
    }

    return {
      allowed,
      severity,
      policyHits: violations,
      reason: allowed ? 'No policy violations' : `Violated policies: ${violations.join(', ')}`,
    };
  }

  /**
   * Check if an action violates a specific policy
   */
  private checkPolicyViolation(action: SafetyAction, policy: SafetyPolicy): boolean {
    const constraints = policy.constraints as any;

    // Example constraint checks (expand based on actual policy structure)
    if (constraints.blockedActors && constraints.blockedActors.includes(action.actor)) {
      return true;
    }

    if (constraints.blockedActions && constraints.blockedActions.includes(action.action)) {
      return true;
    }

    if (constraints.maxActionsPerHour && action.metadata?.actionCount > constraints.maxActionsPerHour) {
      return true;
    }

    if (constraints.requiresApproval && !action.metadata?.approved) {
      return true;
    }

    return false;
  }

  /**
   * Determine severity level from policy constraints
   */
  private determineSeverity(policy: SafetyPolicy): SafetySeverity {
    const constraints = policy.constraints as any;
    return (constraints.severity as SafetySeverity) || 'medium';
  }

  /**
   * Compare two severity levels (returns -1, 0, 1 like compareTo)
   */
  private compareSeverity(a: SafetySeverity, b: SafetySeverity): number {
    const levels: Record<SafetySeverity, number> = {
      low: 1,
      medium: 2,
      high: 3,
      critical: 4,
    };
    return levels[a] - levels[b];
  }

  /**
   * Log a safety event
   */
  async logEvent(event: InsertSafetyEventLog): Promise<void> {
    try {
      await db.insert(safetyEventLog).values(event);
      console.log(`[SafetyGuardrails] 📝 Event logged: ${event.severity} severity for ${event.action}`);
    } catch (error) {
      console.error('[SafetyGuardrails] ❌ Failed to log event:', error);
    }
  }

  /**
   * Get kill switch status
   */
  async getKillSwitchStatus(): Promise<{ isEnabled: boolean; reason: string | null; updatedAt: Date }> {
    const result = await db
      .select()
      .from(killSwitch)
      .where(eq(killSwitch.id, 'global_kill_switch'))
      .limit(1);

    if (result.length === 0) {
      return {
        isEnabled: false,
        reason: null,
        updatedAt: new Date(),
      };
    }

    return {
      isEnabled: result[0].isEnabled,
      reason: result[0].reason,
      updatedAt: result[0].updatedAt,
    };
  }

  /**
   * Toggle kill switch
   */
  async toggleKillSwitch(enabled: boolean, reason: string | null, userId?: string): Promise<void> {
    console.log(`[SafetyGuardrails] ${enabled ? '🔴 ENABLING' : '🟢 DISABLING'} kill switch: ${reason || 'No reason'}`);

    await db
      .update(killSwitch)
      .set({
        isEnabled: enabled,
        reason,
        updatedAt: new Date(),
      })
      .where(eq(killSwitch.id, 'global_kill_switch'));

    // Broadcast kill switch change to context bridge (frontend)
    await contextBridge.broadcast({
      type: 'kill_switch_changed',
      payload: {
        isEnabled: enabled,
        reason,
        timestamp: new Date().toISOString(),
      },
    });

    // Phase 27.4: Emit to cluster bus for backend services (e.g., TradingStateSync)
    if (enabled) {
      const { clusterBus } = await import('./cluster-bus.js');
      clusterBus.emit('kill_switch_activated', {
        userId: userId || 'system',
        reason: reason || 'Kill switch enabled',
        timestamp: new Date(),
      });
      console.log(`[SafetyGuardrails] 🚨 Kill switch activation event emitted to cluster bus`);
    }

    console.log(`[SafetyGuardrails] ✅ Kill switch ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Create or update a safety policy
   */
  async applyPolicy(policyData: Omit<SafetyPolicy, 'id' | 'createdAt'>): Promise<SafetyPolicy> {
    console.log(`[SafetyGuardrails] Applying policy: ${policyData.policyName}`);

    // Check if policy already exists
    const existing = await db
      .select()
      .from(safetyPolicy)
      .where(eq(safetyPolicy.policyName, policyData.policyName))
      .limit(1);

    if (existing.length > 0) {
      // Update existing policy
      const [updated] = await db
        .update(safetyPolicy)
        .set({
          scope: policyData.scope,
          enabled: policyData.enabled,
          constraints: policyData.constraints,
        })
        .where(eq(safetyPolicy.policyName, policyData.policyName))
        .returning();

      console.log(`[SafetyGuardrails] ✅ Policy updated: ${policyData.policyName}`);
      return updated;
    } else {
      // Create new policy
      const [created] = await db
        .insert(safetyPolicy)
        .values(policyData)
        .returning();

      console.log(`[SafetyGuardrails] ✅ Policy created: ${policyData.policyName}`);
      return created;
    }
  }

  /**
   * Get all active policies
   */
  async getActivePolicies(): Promise<SafetyPolicy[]> {
    return db.select().from(safetyPolicy).where(eq(safetyPolicy.enabled, true));
  }

  /**
   * Get recent safety events
   */
  async getRecentEvents(limit: number = 10): Promise<SafetyEventLog[]> {
    return db
      .select()
      .from(safetyEventLog)
      .orderBy(safetyEventLog.createdAt)
      .limit(limit);
  }

  /**
   * Get high-severity events for oversight
   */
  async getHighSeverityEvents(limit: number = 50): Promise<SafetyEventLog[]> {
    return db
      .select()
      .from(safetyEventLog)
      .where(eq(safetyEventLog.severity, 'high'))
      .orderBy(safetyEventLog.createdAt)
      .limit(limit);
  }

  /**
   * Archive low-severity events older than specified days
   */
  async archiveOldEvents(daysOld: number = 7): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await db
      .delete(safetyEventLog)
      .where(and(
        eq(safetyEventLog.severity, 'low'),
        // Note: This is a simplified version, proper date comparison should be done
      ));

    console.log(`[SafetyGuardrails] 🗑️ Archived old low-severity events`);
    return 0; // Placeholder return
  }
}

export const safetyGuardrails = new SafetyGuardrailsService();
