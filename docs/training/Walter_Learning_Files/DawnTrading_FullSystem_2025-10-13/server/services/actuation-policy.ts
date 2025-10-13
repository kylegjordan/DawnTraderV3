// server/services/actuation-policy.ts
// Actuation Policy Registry - Milestone 17A
// Defines safe bounds and rules for AI-driven parameter adjustments

import { storage } from '../storage';
import type { ActuationPolicy, InsertActuationPolicy } from '@shared/schema';

export interface PolicyViolation {
  reason: string;
  details: string;
}

export class ActuationPolicyService {
  /**
   * Initialize default actuation policies for a user
   * These define which parameters the AI can adjust and their safe boundaries
   */
  async initializeDefaultPolicies(userId: string): Promise<void> {
    const defaultPolicies: Omit<InsertActuationPolicy, 'userId'>[] = [
      // Filter Parameters
      {
        variableName: 'minVolume24h',
        variableCategory: 'filter',
        minValue: '500000',
        maxValue: '5000000',
        stepSize: '100000',
        cooldownHours: 24,
        maxDailyChanges: 2,
        confidenceThreshold: 75,
        enabled: true
      },
      {
        variableName: 'rsiMin',
        variableCategory: 'filter',
        minValue: '20',
        maxValue: '40',
        stepSize: '2',
        cooldownHours: 24,
        maxDailyChanges: 3,
        confidenceThreshold: 70,
        enabled: true
      },
      {
        variableName: 'rsiMax',
        variableCategory: 'filter',
        minValue: '60',
        maxValue: '80',
        stepSize: '2',
        cooldownHours: 24,
        maxDailyChanges: 3,
        confidenceThreshold: 70,
        enabled: true
      },
      {
        variableName: 'maxSpread',
        variableCategory: 'filter',
        minValue: '0.1',
        maxValue: '1.0',
        stepSize: '0.1',
        cooldownHours: 48,
        maxDailyChanges: 2,
        confidenceThreshold: 75,
        enabled: true
      },
      
      // Strategy Parameters
      {
        variableName: 'vwapPullbackThreshold',
        variableCategory: 'strategy',
        minValue: '1.0',
        maxValue: '3.0',
        stepSize: '0.25',
        cooldownHours: 48,
        maxDailyChanges: 2,
        confidenceThreshold: 80,
        enabled: true
      },
      {
        variableName: 'vwapVolumeMultiplier',
        variableCategory: 'strategy',
        minValue: '1.2',
        maxValue: '2.0',
        stepSize: '0.1',
        cooldownHours: 48,
        maxDailyChanges: 2,
        confidenceThreshold: 80,
        enabled: true
      },
      {
        variableName: 'abcdBreakoutThreshold',
        variableCategory: 'strategy',
        minValue: '1.0',
        maxValue: '2.5',
        stepSize: '0.25',
        cooldownHours: 48,
        maxDailyChanges: 2,
        confidenceThreshold: 80,
        enabled: true
      },
      
      // Guardrail Parameters
      {
        variableName: 'riskPerTrade',
        variableCategory: 'guardrail',
        minValue: '1.0',
        maxValue: '2.5',
        stepSize: '0.25',
        cooldownHours: 72,
        maxDailyChanges: 1,
        confidenceThreshold: 85,
        enabled: false // Disabled by default for safety
      },
      {
        variableName: 'maxOpenPositions',
        variableCategory: 'guardrail',
        minValue: '3',
        maxValue: '7',
        stepSize: '1',
        cooldownHours: 72,
        maxDailyChanges: 1,
        confidenceThreshold: 85,
        enabled: false // Disabled by default for safety
      }
    ];

    for (const policy of defaultPolicies) {
      try {
        await storage.createActuationPolicy({
          ...policy,
          userId
        });
      } catch (error) {
        console.log(`[ActuationPolicy] Policy ${policy.variableName} already exists for user ${userId}`);
      }
    }

    console.log(`[ActuationPolicy] Initialized ${defaultPolicies.length} default policies for user ${userId}`);
  }

  /**
   * Check if a proposed adjustment complies with the actuation policy
   */
  async validateProposal(
    userId: string,
    variableName: string,
    currentValue: number,
    proposedValue: number,
    confidenceScore: number
  ): Promise<{ valid: boolean; violations: PolicyViolation[] }> {
    const violations: PolicyViolation[] = [];
    
    // Get the policy for this variable
    const policy = await storage.getActuationPolicy(userId, variableName);
    
    if (!policy) {
      violations.push({
        reason: 'NO_POLICY',
        details: `No actuation policy defined for variable: ${variableName}`
      });
      return { valid: false, violations };
    }

    if (!policy.enabled) {
      violations.push({
        reason: 'POLICY_DISABLED',
        details: `Actuation policy for ${variableName} is disabled`
      });
      return { valid: false, violations };
    }

    // Check confidence threshold
    const confidenceThreshold = policy.confidenceThreshold ?? 70;
    if (confidenceScore < confidenceThreshold) {
      violations.push({
        reason: 'INSUFFICIENT_CONFIDENCE',
        details: `Confidence ${confidenceScore} below threshold ${confidenceThreshold}`
      });
    }

    // Check value bounds
    const minValue = parseFloat(policy.minValue);
    const maxValue = parseFloat(policy.maxValue);
    
    if (proposedValue < minValue || proposedValue > maxValue) {
      violations.push({
        reason: 'OUT_OF_BOUNDS',
        details: `Proposed value ${proposedValue} outside allowed range [${minValue}, ${maxValue}]`
      });
    }

    // Check step size
    const stepSize = parseFloat(policy.stepSize);
    const delta = Math.abs(proposedValue - currentValue);
    
    if (delta > stepSize && delta % stepSize !== 0) {
      violations.push({
        reason: 'INVALID_STEP_SIZE',
        details: `Change of ${delta} does not align with step size ${stepSize}`
      });
    }

    // Check cooldown period
    const cooldownHours = policy.cooldownHours ?? 24;
    const recentAdjustments = await storage.getRecentProposedAdjustments(
      userId,
      variableName,
      cooldownHours
    );
    
    const appliedAdjustments = recentAdjustments.filter(a => 
      a.status === 'applied' && a.appliedAt
    );
    
    if (appliedAdjustments.length > 0) {
      violations.push({
        reason: 'COOLDOWN_ACTIVE',
        details: `Last adjustment was ${new Date(appliedAdjustments[0].appliedAt!).toISOString()}, cooldown: ${cooldownHours}h`
      });
    }

    // Check daily change limit
    const maxDailyChanges = policy.maxDailyChanges ?? 3;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayAdjustments = recentAdjustments.filter(a => 
      a.status === 'applied' && 
      a.appliedAt && 
      new Date(a.appliedAt) >= todayStart
    );
    
    if (todayAdjustments.length >= maxDailyChanges) {
      violations.push({
        reason: 'DAILY_LIMIT_EXCEEDED',
        details: `Already made ${todayAdjustments.length} changes today, limit: ${maxDailyChanges}`
      });
    }

    return {
      valid: violations.length === 0,
      violations
    };
  }

  /**
   * Create a new proposed adjustment
   */
  async createProposal(params: {
    userId: string;
    variableName: string;
    currentValue: number;
    proposedValue: number;
    mode: 'live' | 'paper';
    confidenceScore: number;
    rationale: string;
  }): Promise<any> {
    const { userId, variableName, currentValue, proposedValue, mode, confidenceScore, rationale } = params;
    
    // Create proposed adjustment
    const proposal = await storage.createProposedAdjustment({
      userId,
      variableName,
      currentValue: currentValue.toString(),
      proposedValue: proposedValue.toString(),
      mode,
      confidenceScore,
      rationale,
      status: 'pending'
    });
    
    return proposal;
  }

  /**
   * Approve a proposed adjustment
   */
  async approveProposal(proposalId: string, approverNotes: string, approverId: string): Promise<void> {
    await storage.updateProposedAdjustment(proposalId, {
      status: 'approved',
      reviewedBy: approverId,
      reviewedAt: new Date(),
      reviewNotes: approverNotes
    });
    
    console.log(`[ActuationPolicy] Approved proposal ${proposalId}`);
  }

  /**
   * Reject a proposed adjustment
   */
  async rejectProposal(proposalId: string, rejectReason: string, reviewerId: string): Promise<void> {
    await storage.updateProposedAdjustment(proposalId, {
      status: 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      reviewNotes: rejectReason
    });
    
    console.log(`[ActuationPolicy] Rejected proposal ${proposalId}`);
  }

  /**
   * Apply an approved proposed adjustment
   */
  async applyProposal(proposalId: string): Promise<void> {
    const proposal = await storage.getProposedAdjustment(proposalId);
    
    if (!proposal) {
      throw new Error(`Proposal ${proposalId} not found`);
    }
    
    if (proposal.status !== 'approved') {
      throw new Error(`Proposal ${proposalId} must be approved before applying`);
    }
    
    // Mark as applied
    await storage.updateProposedAdjustment(proposalId, {
      status: 'applied',
      appliedAt: new Date()
    });
    
    console.log(`[ActuationPolicy] Applied proposal ${proposalId}: ${proposal.variableName} = ${proposal.proposedValue}`);
  }

  /**
   * Get actuation metrics and summary
   */
  async getActuationMetrics(userId: string): Promise<{
    totalPolicies: number;
    enabledPolicies: number;
    recentProposals: number;
    approvedProposals: number;
    rejectedProposals: number;
    pendingProposals: number;
  }> {
    const policies = await storage.getActuationPolicies(userId);
    const recentProposals = await storage.getAllProposedAdjustments(userId, 168); // Last 7 days
    
    return {
      totalPolicies: policies.length,
      enabledPolicies: policies.filter(p => p.enabled).length,
      recentProposals: recentProposals.length,
      approvedProposals: recentProposals.filter(p => p.status === 'approved').length,
      rejectedProposals: recentProposals.filter(p => p.status === 'rejected').length,
      pendingProposals: recentProposals.filter(p => p.status === 'pending').length
    };
  }
}

export const actuationPolicyService = new ActuationPolicyService();
