import { db } from '../db';
import { 
  crossAgentEthicsSession,
  ethicsConflictRegister,
  ethicalViolationLog
} from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { 
  InsertCrossAgentEthicsSession,
  InsertEthicsConflictRegister,
  EthicalVerdict,
  FederatedScope
} from '@shared/schema';
import { nanoid } from 'nanoid';
import { federatedEthicsHub } from './federated-ethics-hub';
import { contextBridge } from './context-bridge';

/**
 * Phase 14.0: Ethics Consensus Orchestrator
 * 
 * Runs multi-agent consensus checks for proposed actions.
 * Inputs: action metadata, federated snapshot, agent-local recommendations
 * Outputs: verdict with confidence score and rationale
 * Writes to cross-agent ethics session log and conflict register
 */

export interface ActionMetadata {
  actor: string;
  action: string;
  domain: FederatedScope;
  risk: 'low' | 'medium' | 'high' | 'critical';
  mode: 'live' | 'paper';
  metadata?: any;
}

export interface AgentRecommendation {
  agentName: string;
  verdict: EthicalVerdict;
  confidence: number; // 0.0 to 1.0
  reasoning: string;
}

export interface ConsensusResult {
  verdict: EthicalVerdict;
  confidence: number; // 0.0 to 1.0
  rationale: string;
  hasConflict: boolean;
  sessionId: string;
  participatingDomains: string[];
}

class EthicsConsensusOrchestratorService {
  /**
   * Run multi-agent consensus check for an action
   */
  async checkConsensus(
    actionMetadata: ActionMetadata,
    agentRecommendations: AgentRecommendation[]
  ): Promise<ConsensusResult> {
    const sessionId = `session_${nanoid(12)}`;
    
    console.log(`[EthicsConsensus] Starting consensus check (session: ${sessionId})`);
    console.log(`[EthicsConsensus] Action: ${actionMetadata.action} by ${actionMetadata.actor}`);
    console.log(`[EthicsConsensus] ${agentRecommendations.length} agent recommendations received`);

    // Step 1: Get current federated snapshot
    const snapshot = await federatedEthicsHub.getSnapshot(
      actionMetadata.domain,
      actionMetadata.mode
    );

    // Step 2: Analyze recommendations
    const verdicts = agentRecommendations.map(r => r.verdict);
    const uniqueVerdicts = Array.from(new Set(verdicts));
    const hasConflict = uniqueVerdicts.length > 1;

    // Step 3: Calculate consensus verdict
    let finalVerdict: EthicalVerdict;
    let confidence: number;
    let rationale: string;

    if (!hasConflict) {
      // All agents agree
      finalVerdict = verdicts[0];
      confidence = this.calculateAverageConfidence(agentRecommendations);
      rationale = `All ${agentRecommendations.length} agents reached consensus: ${finalVerdict}`;
    } else {
      // Conflict detected - use weighted majority voting
      const consensusResult = this.resolveConflict(agentRecommendations);
      finalVerdict = consensusResult.verdict;
      confidence = consensusResult.confidence;
      rationale = consensusResult.rationale;

      console.warn(`[EthicsConsensus] ⚠️ Conflict detected - resolved to: ${finalVerdict}`);
    }

    // Clamp confidence to [0, 1] and ensure no NaN/Infinity
    confidence = Math.max(0, Math.min(1, confidence || 0));

    // Step 4: Record session to database
    const agentInputs = agentRecommendations.reduce((acc, rec) => {
      acc[rec.agentName] = {
        verdict: rec.verdict,
        confidence: rec.confidence,
        reasoning: rec.reasoning,
      };
      return acc;
    }, {} as Record<string, any>);

    const participatingDomains = Array.from(
      new Set(agentRecommendations.map(r => r.agentName.toLowerCase()))
    );

    await db.insert(crossAgentEthicsSession).values({
      sessionId,
      actor: actionMetadata.actor,
      action: actionMetadata.action,
      domains: participatingDomains,
      mode: actionMetadata.mode,
      agentInputs,
      verdict: finalVerdict,
      confidence,
      rationale,
      hasConflict,
      metadata: {
        ...actionMetadata.metadata,
        snapshotHash: snapshot.snapshotHash,
        risk: actionMetadata.risk,
      },
    });

    // Step 5: If conflict, record to conflict register
    if (hasConflict) {
      await this.recordConflict(
        sessionId,
        agentRecommendations,
        finalVerdict
      );

      // Broadcast conflict event
      await contextBridge.broadcast({
        type: 'ethics_conflict_updated',
        payload: {
          sessionId,
          openConflicts: await this.getOpenConflictsCount(),
          action: actionMetadata.action,
          finalVerdict,
        },
      });
    }

    // Step 6: Broadcast ethical_event
    await contextBridge.broadcast({
      type: 'ethical_event',
      payload: {
        sessionId,
        actor: actionMetadata.actor,
        action: actionMetadata.action,
        verdict: finalVerdict,
        confidence,
        hasConflict,
        federatedConsensus: {
          verdict: finalVerdict,
          confidence,
          participants: participatingDomains,
        },
      },
    });

    console.log(`[EthicsConsensus] ✅ Consensus reached: ${finalVerdict} (confidence: ${(confidence * 100).toFixed(1)}%)`);

    return {
      verdict: finalVerdict,
      confidence,
      rationale,
      hasConflict,
      sessionId,
      participatingDomains,
    };
  }

  /**
   * Resolve conflict using weighted majority voting
   */
  private resolveConflict(recommendations: AgentRecommendation[]): {
    verdict: EthicalVerdict;
    confidence: number;
    rationale: string;
  } {
    const votes: Record<EthicalVerdict, { count: number; totalConfidence: number }> = {
      approved: { count: 0, totalConfidence: 0 },
      rejected: { count: 0, totalConfidence: 0 },
      requires_review: { count: 0, totalConfidence: 0 },
    };

    // Count weighted votes
    for (const rec of recommendations) {
      votes[rec.verdict].count++;
      votes[rec.verdict].totalConfidence += rec.confidence || 0.5;
    }

    // Find winner by highest weighted vote
    let winner: EthicalVerdict = 'requires_review'; // Default to review on tie
    let maxWeightedVotes = 0;

    for (const [verdict, data] of Object.entries(votes)) {
      const weightedVotes = data.count * (data.totalConfidence / data.count || 0.5);
      if (weightedVotes > maxWeightedVotes) {
        maxWeightedVotes = weightedVotes;
        winner = verdict as EthicalVerdict;
      }
    }

    const winnerData = votes[winner];
    const confidence = winnerData.count > 0 
      ? winnerData.totalConfidence / winnerData.count 
      : 0.5;

    const rationale = `Conflict resolved by weighted majority: ${winner} (${winnerData.count}/${recommendations.length} votes, avg confidence: ${(confidence * 100).toFixed(1)}%)`;

    return {
      verdict: winner,
      confidence: Math.max(0, Math.min(1, confidence)),
      rationale,
    };
  }

  /**
   * Calculate average confidence from recommendations
   */
  private calculateAverageConfidence(recommendations: AgentRecommendation[]): number {
    if (recommendations.length === 0) return 0;
    
    const sum = recommendations.reduce((acc, rec) => acc + (rec.confidence || 0), 0);
    return Math.max(0, Math.min(1, sum / recommendations.length));
  }

  /**
   * Record conflict to register
   */
  private async recordConflict(
    sessionId: string,
    recommendations: AgentRecommendation[],
    finalVerdict: EthicalVerdict
  ): Promise<void> {
    const conflictingSources = recommendations.map(r => r.agentName);
    const conflictingVerdicts = recommendations.reduce((acc, rec) => {
      acc[rec.agentName] = rec.verdict;
      return acc;
    }, {} as Record<string, string>);

    await db.insert(ethicsConflictRegister).values({
      sessionId,
      conflictingSources,
      conflictingVerdicts,
      resolutionStatus: 'open',
      resolutionMethod: 'weighted_majority',
      resolutionRationale: 'Automated resolution via weighted voting',
      finalVerdict,
    });

    console.log(`[EthicsConsensus] ⚠️ Conflict recorded for session ${sessionId}`);
  }

  /**
   * Get count of open conflicts
   */
  private async getOpenConflictsCount(): Promise<number> {
    const conflicts = await db
      .select()
      .from(ethicsConflictRegister)
      .where(eq(ethicsConflictRegister.resolutionStatus, 'open'));

    return conflicts.length;
  }

  /**
   * Get conflicts from database (public method for API/scheduler)
   */
  async getConflicts(status: 'all' | 'resolved' | 'unresolved' | 'rejected' | 'escalated' | 'open' = 'all') {
    if (status === 'all') {
      return await db.select().from(ethicsConflictRegister).orderBy(desc(ethicsConflictRegister.detectedAt));
    }
    
    return await db
      .select()
      .from(ethicsConflictRegister)
      .where(eq(ethicsConflictRegister.resolutionStatus, status as any))
      .orderBy(desc(ethicsConflictRegister.detectedAt));
  }

  /**
   * Resolve a conflict by ID (public method for API/scheduler)
   */
  async resolveConflictById(
    conflictId: string,
    resolution: 'resolved' | 'rejected' | 'escalated',
    notes?: string
  ) {
    const updated = await db
      .update(ethicsConflictRegister)
      .set({
        resolutionStatus: resolution,
        resolutionRationale: notes || `Manually resolved as ${resolution}`,
        resolvedAt: new Date(),
      })
      .where(eq(ethicsConflictRegister.conflictId, conflictId))
      .returning();

    if (updated.length === 0) {
      throw new Error(`Conflict ${conflictId} not found`);
    }

    console.log(`[EthicsConsensus] ✅ Conflict ${conflictId} resolved as ${resolution}`);
    return updated[0];
  }
}

export const ethicsConsensusOrchestrator = new EthicsConsensusOrchestratorService();
