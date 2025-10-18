/**
 * Phase 9.6: Consensus Engine (Extended in Phase 9.7)
 * 
 * Evaluates agent contributions and computes consensus scores.
 * Records consensus snapshots for decision tracking.
 * Phase 9.7: Integrates with LearningBridge for cooperative learning feedback.
 */

import { db } from '../db';
import { 
  consensusSnapshots,
  collaborationMessages,
  InsertConsensusSnapshot,
  ConsensusSnapshot
} from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { learningBridge } from './learning-bridge';

export interface AgentInput {
  agentId: string;
  position: 'agree' | 'disagree' | 'conditional' | 'abstain';
  confidence: number; // 0-1
  reasoning: string;
  supportingData?: any;
}

export interface ConsensusEvaluation {
  overallConsensus: number; // 0-1
  agreementScores: Record<string, number>; // Per-agent scores
  dissenterAgents: string[];
  consensusRationale: string;
  decidingFactors: any;
  resolutionPath: string;
  canProceed: boolean;
}

class ConsensusEngine {
  private consensusThreshold: number = 0.75; // 75% agreement required

  /**
   * Evaluate consensus from agent inputs
   */
  async evaluateConsensus(
    sessionId: string,
    inputs: AgentInput[]
  ): Promise<ConsensusEvaluation> {
    try {
      console.log(`[ConsensusEngine] 🧮 Evaluating consensus for session ${sessionId} with ${inputs.length} inputs`);

      // Guard against empty inputs to avoid Infinity in decidingFactors
      if (inputs.length === 0) {
        console.log(`[ConsensusEngine] ⚠️ No inputs provided, returning safe defaults`);
        return {
          overallConsensus: 0,
          agreementScores: {},
          dissenterAgents: [],
          consensusRationale: 'No agent inputs available for consensus evaluation.',
          decidingFactors: {
            highestConfidence: 0,
            lowestConfidence: 0,
            unanimousAgreement: false,
            abstentions: 0,
          },
          resolutionPath: 'awaiting_input',
          canProceed: false,
        };
      }

      // Calculate individual agreement scores
      const agreementScores: Record<string, number> = {};
      const dissenterAgents: string[] = [];
      let totalAgreement = 0;
      let activeAgents = 0;

      for (const input of inputs) {
        let score = 0;

        switch (input.position) {
          case 'agree':
            score = input.confidence;
            break;
          case 'conditional':
            score = input.confidence * 0.7; // Conditional support counts as 70%
            break;
          case 'disagree':
            score = 0;
            dissenterAgents.push(input.agentId);
            break;
          case 'abstain':
            // Don't count abstentions in consensus
            continue;
        }

        agreementScores[input.agentId] = score;
        totalAgreement += score;
        activeAgents++;
      }

      // Calculate overall consensus
      const overallConsensus = activeAgents > 0 ? totalAgreement / activeAgents : 0;
      const canProceed = overallConsensus >= this.consensusThreshold;

      // Determine consensus rationale
      let consensusRationale = '';
      if (canProceed) {
        consensusRationale = `Strong consensus achieved (${(overallConsensus * 100).toFixed(1)}% agreement). All agents aligned on proposed action.`;
      } else if (overallConsensus >= 0.5) {
        consensusRationale = `Moderate consensus (${(overallConsensus * 100).toFixed(1)}%). Some disagreement exists. Consider addressing dissenter concerns.`;
      } else {
        consensusRationale = `Low consensus (${(overallConsensus * 100).toFixed(1)}%). Significant disagreement detected. Further discussion required.`;
      }

      // Identify deciding factors
      const decidingFactors = {
        highestConfidence: Math.max(...inputs.map(i => i.confidence)),
        lowestConfidence: Math.min(...inputs.map(i => i.confidence)),
        unanimousAgreement: dissenterAgents.length === 0 && inputs.length > 0,
        abstentions: inputs.filter(i => i.position === 'abstain').length,
      };

      // Determine resolution path
      let resolutionPath = '';
      if (canProceed) {
        resolutionPath = dissenterAgents.length > 0 
          ? 'proceed_with_concerns_noted'
          : 'unanimous_approval';
      } else {
        resolutionPath = dissenterAgents.length > inputs.length / 2
          ? 'rejected_by_majority'
          : 'requires_mediation';
      }

      console.log(`[ConsensusEngine] 📊 Consensus: ${(overallConsensus * 100).toFixed(1)}% (threshold: ${(this.consensusThreshold * 100)}%)`);
      console.log(`[ConsensusEngine] ${canProceed ? '✅ Can proceed' : '⚠️ Cannot proceed'} - ${dissenterAgents.length} dissenters`);

      return {
        overallConsensus,
        agreementScores,
        dissenterAgents,
        consensusRationale,
        decidingFactors,
        resolutionPath,
        canProceed,
      };
    } catch (error: any) {
      console.error('[ConsensusEngine] Failed to evaluate consensus:', error);
      throw error;
    }
  }

  /**
   * Record consensus snapshot
   */
  async recordSnapshot(
    sessionId: string,
    evaluation: ConsensusEvaluation,
    participantInputs: AgentInput[]
  ): Promise<ConsensusSnapshot> {
    try {
      const snapshotId = `consensus_${nanoid(12)}`;

      console.log(`[ConsensusEngine] 💾 Recording consensus snapshot ${snapshotId}`);

      const snapshotData: InsertConsensusSnapshot = {
        snapshotId,
        sessionId,
        evaluationPoint: new Date(),
        participantInputs: participantInputs as any,
        agreementScores: evaluation.agreementScores as any,
        overallConsensus: evaluation.overallConsensus,
        dissenterAgents: evaluation.dissenterAgents,
        consensusRationale: evaluation.consensusRationale,
        decidingFactors: evaluation.decidingFactors as any,
        resolutionPath: evaluation.resolutionPath,
        metadata: {},
      };

      const [snapshot] = await db.insert(consensusSnapshots)
        .values(snapshotData)
        .returning();

      console.log(`[ConsensusEngine] ✅ Snapshot ${snapshotId} recorded`);

      // Phase 9.7: Record learning feedback for each participating agent
      await this.recordAgentFeedback(sessionId, participantInputs, evaluation);

      return snapshot;
    } catch (error: any) {
      console.error('[ConsensusEngine] Failed to record snapshot:', error);
      throw error;
    }
  }

  /**
   * Get consensus snapshots for a session
   */
  async getSessionSnapshots(sessionId: string): Promise<ConsensusSnapshot[]> {
    try {
      const snapshots = await db.select()
        .from(consensusSnapshots)
        .where(eq(consensusSnapshots.sessionId, sessionId))
        .orderBy(consensusSnapshots.evaluationPoint);

      return snapshots;
    } catch (error: any) {
      console.error('[ConsensusEngine] Failed to fetch snapshots:', error);
      return [];
    }
  }

  /**
   * Get latest consensus for a session
   */
  async getLatestConsensus(sessionId: string): Promise<ConsensusSnapshot | null> {
    try {
      const [snapshot] = await db.select()
        .from(consensusSnapshots)
        .where(eq(consensusSnapshots.sessionId, sessionId))
        .orderBy(sql`${consensusSnapshots.evaluationPoint} DESC`)
        .limit(1);

      return snapshot || null;
    } catch (error: any) {
      console.error('[ConsensusEngine] Failed to fetch latest consensus:', error);
      return null;
    }
  }

  /**
   * Set consensus threshold (0-1)
   */
  setConsensusThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 1) {
      throw new Error('Consensus threshold must be between 0 and 1');
    }
    this.consensusThreshold = threshold;
    console.log(`[ConsensusEngine] 🎯 Consensus threshold set to ${(threshold * 100)}%`);
  }

  /**
   * Get current consensus threshold
   */
  getConsensusThreshold(): number {
    return this.consensusThreshold;
  }

  /**
   * Phase 9.7: Record learning feedback for participating agents
   */
  private async recordAgentFeedback(
    sessionId: string,
    participantInputs: AgentInput[],
    evaluation: ConsensusEvaluation
  ): Promise<void> {
    try {
      console.log(`[ConsensusEngine] 📝 Recording learning feedback for ${participantInputs.length} agents`);

      // Record feedback for each agent based on their contribution
      const feedbackPromises = participantInputs.map(async (input) => {
        // Calculate accuracy score (how well agent aligned with consensus)
        const agentScore = evaluation.agreementScores[input.agentId] || 0;
        const accuracyScore = input.position === 'abstain' 
          ? 0.5  // Neutral score for abstentions
          : agentScore;

        // Consensus alignment is the overall consensus score
        const consensusAlignment = evaluation.overallConsensus;

        // Generate improvement notes based on performance
        let improvementNotes = '';
        if (input.position === 'agree' && evaluation.canProceed) {
          improvementNotes = `Agent aligned with consensus (${(accuracyScore * 100).toFixed(1)}% contribution). Strong performance.`;
        } else if (input.position === 'disagree') {
          improvementNotes = `Agent dissented from consensus. Consider reviewing reasoning: "${input.reasoning.substring(0, 100)}..."`;
        } else if (input.position === 'conditional') {
          improvementNotes = `Agent provided conditional support (${(input.confidence * 100).toFixed(1)}% confidence). Conditions should be reviewed.`;
        } else if (input.position === 'abstain') {
          improvementNotes = `Agent abstained from decision. May need more context or expertise in this domain.`;
        }

        // Extract domain from agent ID (e.g., "TradingBob" -> "trading")
        const domain = input.agentId.toLowerCase().replace('bob', '').replace('agent', '') || 'general';

        return learningBridge.recordFeedback(
          input.agentId,
          domain,
          sessionId,
          accuracyScore,
          consensusAlignment,
          improvementNotes,
          'peer' // Feedback from peer consensus
        );
      });

      await Promise.all(feedbackPromises);
      console.log(`[ConsensusEngine] ✅ Learning feedback recorded for all agents`);
    } catch (error: any) {
      console.error('[ConsensusEngine] Failed to record agent feedback:', error);
      // Don't throw - feedback recording is non-critical
    }
  }

  /**
   * Analyze consensus trends for a session
   */
  async analyzeConsensusTrends(sessionId: string): Promise<{
    snapshots: number;
    averageConsensus: number;
    consensusTrend: 'improving' | 'declining' | 'stable';
    peakConsensus: number;
  }> {
    try {
      const snapshots = await this.getSessionSnapshots(sessionId);
      
      if (snapshots.length === 0) {
        return {
          snapshots: 0,
          averageConsensus: 0,
          consensusTrend: 'stable',
          peakConsensus: 0,
        };
      }

      const consensusValues = snapshots.map(s => s.overallConsensus);
      const averageConsensus = consensusValues.reduce((a, b) => a + b, 0) / consensusValues.length;
      const peakConsensus = Math.max(...consensusValues);

      // Determine trend (compare first half to second half)
      let consensusTrend: 'improving' | 'declining' | 'stable' = 'stable';
      if (snapshots.length >= 4) {
        const midpoint = Math.floor(snapshots.length / 2);
        const firstHalf = consensusValues.slice(0, midpoint);
        const secondHalf = consensusValues.slice(midpoint);
        
        const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
        
        const change = secondAvg - firstAvg;
        if (change > 0.1) consensusTrend = 'improving';
        else if (change < -0.1) consensusTrend = 'declining';
      }

      return {
        snapshots: snapshots.length,
        averageConsensus,
        consensusTrend,
        peakConsensus,
      };
    } catch (error: any) {
      console.error('[ConsensusEngine] Failed to analyze trends:', error);
      return {
        snapshots: 0,
        averageConsensus: 0,
        consensusTrend: 'stable',
        peakConsensus: 0,
      };
    }
  }
}

// Singleton instance
export const consensusEngine = new ConsensusEngine();
