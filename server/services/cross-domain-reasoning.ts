import { db } from "../db";
import { clusterBus } from "./cluster-bus";
import { learningCoordinator } from "./learning-coordinator";
import type { DomainChannel, LearningDeltaType } from "@shared/schema";
import { nanoid } from "nanoid";

/**
 * Phase 18.0: Cross-Domain Reasoning Pipelines
 * 
 * Transforms and routes learning deltas between different domain channels.
 * - RESEARCH → TRADING: Convert research insights into trading signals
 * - COMPLIANCE → TRADING: Apply compliance constraints to trading strategies
 * - ANALYTICS → RESEARCH: Feed analytics findings back to research
 * - TRADING → ANALYTICS: Share trading outcomes for analysis
 */

interface DomainProposal {
  proposalId: string;
  sourceChannel: DomainChannel;
  targetDomain: string;
  proposalType: "signal" | "constraint" | "insight" | "feedback";
  payload: Record<string, any>;
  confidence: number;
  requiresApproval: boolean;
  traceId: string;
  createdAt: Date;
}

export class CrossDomainReasoning {
  private static instance: CrossDomainReasoning;
  private proposals: Map<string, DomainProposal> = new Map();
  private readonly proposalTimeout: number = 3000; // 3 seconds max for proposal generation

  private constructor() {
    this.initializeChannels();
    console.log("[CrossDomainReasoning] ✅ Initialized with 4 domain channels");
  }

  static getInstance(): CrossDomainReasoning {
    if (!CrossDomainReasoning.instance) {
      CrossDomainReasoning.instance = new CrossDomainReasoning();
    }
    return CrossDomainReasoning.instance;
  }

  /**
   * Initialize domain channel subscriptions
   */
  private initializeChannels(): void {
    // Subscribe to model_sync events to trigger cross-domain transformations
    clusterBus.subscribe("model_sync", async (payload: Record<string, any>, sourceNode?: string) => {
      await this.handleModelSync(payload, sourceNode);
    });
  }

  /**
   * Handle model_sync events and generate cross-domain proposals
   */
  private async handleModelSync(payload: Record<string, any>, sourceNode?: string): Promise<void> {
    try {
      const deltaType = payload.deltaType as LearningDeltaType;
      const traceId = payload.traceId || nanoid();

      console.log(`[CrossDomainReasoning] 🔄 Processing model_sync (type: ${deltaType}, trace: ${traceId})`);

      // Determine which domain channels to activate based on delta type
      const channels = this.selectChannelsForDelta(deltaType, sourceNode);

      for (const channel of channels) {
        const proposal = await this.generateProposal(channel, payload, traceId);
        if (proposal) {
          this.proposals.set(proposal.proposalId, proposal);
          console.log(
            `[CrossDomainReasoning] ✨ Generated ${channel} proposal (id: ${proposal.proposalId}, confidence: ${(proposal.confidence * 100).toFixed(1)}%)`
          );
        }
      }
    } catch (error) {
      console.error("[CrossDomainReasoning] Error handling model_sync:", error);
    }
  }

  /**
   * Select appropriate domain channels based on delta type and source
   */
  private selectChannelsForDelta(deltaType: LearningDeltaType, sourceNode?: string): DomainChannel[] {
    const channels: DomainChannel[] = [];

    switch (deltaType) {
      case "discovery":
      case "insight":
        // Research insights go to trading
        channels.push("research_to_trading");
        break;

      case "strategy_adjustment":
        // Compliance constraints go to trading
        if (sourceNode?.includes("compliance") || sourceNode?.includes("risk")) {
          channels.push("compliance_to_trading");
        }
        break;

      case "model_update":
        // Analytics feedback
        channels.push("analytics_to_research");
        channels.push("trading_to_analytics");
        break;

      case "risk_parameter":
        // Risk updates go to trading
        channels.push("compliance_to_trading");
        break;
    }

    return channels;
  }

  /**
   * Generate a domain-specific proposal
   */
  private async generateProposal(
    channel: DomainChannel,
    payload: Record<string, any>,
    traceId: string
  ): Promise<DomainProposal | null> {
    const startTime = Date.now();

    try {
      let proposal: DomainProposal | null = null;

      switch (channel) {
        case "research_to_trading":
          proposal = await this.transformResearchToTrading(payload, traceId);
          break;

        case "compliance_to_trading":
          proposal = await this.transformComplianceToTrading(payload, traceId);
          break;

        case "analytics_to_research":
          proposal = await this.transformAnalyticsToResearch(payload, traceId);
          break;

        case "trading_to_analytics":
          proposal = await this.transformTradingToAnalytics(payload, traceId);
          break;
      }

      const elapsedMs = Date.now() - startTime;
      if (elapsedMs > this.proposalTimeout) {
        console.warn(`[CrossDomainReasoning] ⚠️  Proposal generation slow (${elapsedMs}ms > ${this.proposalTimeout}ms)`);
      }

      return proposal;
    } catch (error) {
      console.error(`[CrossDomainReasoning] Failed to generate proposal for ${channel}:`, error);
      return null;
    }
  }

  /**
   * Transform research insight into trading signal
   */
  private async transformResearchToTrading(
    payload: Record<string, any>,
    traceId: string
  ): Promise<DomainProposal> {
    return {
      proposalId: nanoid(),
      sourceChannel: "research_to_trading",
      targetDomain: "trading",
      proposalType: "signal",
      payload: {
        signalType: "research_insight",
        data: payload.payload || payload.data,
        researchConfidence: payload.overallScore || 0.5,
        actionRecommendation: this.extractActionRecommendation(payload),
      },
      confidence: payload.overallScore || 0.5,
      requiresApproval: true,
      traceId,
      createdAt: new Date(),
    };
  }

  /**
   * Transform compliance constraint into trading rule
   */
  private async transformComplianceToTrading(
    payload: Record<string, any>,
    traceId: string
  ): Promise<DomainProposal> {
    return {
      proposalId: nanoid(),
      sourceChannel: "compliance_to_trading",
      targetDomain: "trading",
      proposalType: "constraint",
      payload: {
        constraintType: "compliance_rule",
        data: payload.payload || payload.data,
        severity: "high",
        enforcementRequired: true,
      },
      confidence: 1.0, // Compliance rules are mandatory
      requiresApproval: false, // Auto-apply compliance constraints
      traceId,
      createdAt: new Date(),
    };
  }

  /**
   * Transform analytics findings into research input
   */
  private async transformAnalyticsToResearch(
    payload: Record<string, any>,
    traceId: string
  ): Promise<DomainProposal> {
    return {
      proposalId: nanoid(),
      sourceChannel: "analytics_to_research",
      targetDomain: "research",
      proposalType: "feedback",
      payload: {
        feedbackType: "analytics_findings",
        data: payload.payload || payload.data,
        patterns: this.extractPatterns(payload),
      },
      confidence: payload.overallScore || 0.6,
      requiresApproval: true,
      traceId,
      createdAt: new Date(),
    };
  }

  /**
   * Transform trading outcomes into analytics data
   */
  private async transformTradingToAnalytics(
    payload: Record<string, any>,
    traceId: string
  ): Promise<DomainProposal> {
    return {
      proposalId: nanoid(),
      sourceChannel: "trading_to_analytics",
      targetDomain: "analytics",
      proposalType: "insight",
      payload: {
        insightType: "trading_outcome",
        data: payload.payload || payload.data,
        performanceMetrics: this.extractPerformanceMetrics(payload),
      },
      confidence: 0.8,
      requiresApproval: false, // Auto-feed to analytics
      traceId,
      createdAt: new Date(),
    };
  }

  /**
   * Extract action recommendation from payload
   */
  private extractActionRecommendation(payload: Record<string, any>): string {
    const data = payload.payload || payload.data || {};
    if (data.recommendation) return data.recommendation;
    if (data.action) return data.action;
    if (data.signal) return data.signal;
    return "review_and_decide";
  }

  /**
   * Extract patterns from analytics data
   */
  private extractPatterns(payload: Record<string, any>): string[] {
    const data = payload.payload || payload.data || {};
    if (Array.isArray(data.patterns)) return data.patterns;
    if (data.trends) return Array.isArray(data.trends) ? data.trends : [data.trends];
    return ["no_patterns_detected"];
  }

  /**
   * Extract performance metrics from trading data
   */
  private extractPerformanceMetrics(payload: Record<string, any>): Record<string, any> {
    const data = payload.payload || payload.data || {};
    return {
      winRate: data.winRate || 0,
      profitFactor: data.profitFactor || 0,
      sharpeRatio: data.sharpeRatio || 0,
      maxDrawdown: data.maxDrawdown || 0,
    };
  }

  /**
   * Get pending proposals awaiting approval
   */
  getPendingProposals(targetDomain?: string): DomainProposal[] {
    const proposals = Array.from(this.proposals.values());

    if (targetDomain) {
      return proposals.filter(
        p => p.targetDomain === targetDomain && p.requiresApproval
      );
    }

    return proposals.filter(p => p.requiresApproval);
  }

  /**
   * Approve a proposal
   */
  async approveProposal(proposalId: string): Promise<boolean> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      console.error(`[CrossDomainReasoning] Proposal not found: ${proposalId}`);
      return false;
    }

    console.log(`[CrossDomainReasoning] ✅ Approved proposal ${proposalId} for ${proposal.targetDomain}`);

    // Remove from pending
    this.proposals.delete(proposalId);

    // Publish approval event
    await clusterBus.publish(
      "model_sync",
      {
        proposalId,
        approved: true,
        targetDomain: proposal.targetDomain,
        payload: proposal.payload,
        traceId: proposal.traceId,
      },
      "cross_domain_reasoning"
    );

    return true;
  }

  /**
   * Reject a proposal
   */
  async rejectProposal(proposalId: string, reason?: string): Promise<boolean> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) {
      console.error(`[CrossDomainReasoning] Proposal not found: ${proposalId}`);
      return false;
    }

    console.log(`[CrossDomainReasoning] ❌ Rejected proposal ${proposalId}: ${reason || "no reason provided"}`);

    // Remove from pending
    this.proposals.delete(proposalId);

    return true;
  }

  /**
   * Get proposal statistics
   */
  getStatistics(): {
    totalProposals: number;
    pendingApprovals: number;
    byChannel: Record<DomainChannel, number>;
  } {
    const proposals = Array.from(this.proposals.values());

    const byChannel: Record<DomainChannel, number> = {
      research_to_trading: 0,
      compliance_to_trading: 0,
      analytics_to_research: 0,
      trading_to_analytics: 0,
    };

    proposals.forEach(p => {
      byChannel[p.sourceChannel]++;
    });

    return {
      totalProposals: proposals.length,
      pendingApprovals: proposals.filter(p => p.requiresApproval).length,
      byChannel,
    };
  }
}

// Export singleton instance
export const crossDomainReasoning = CrossDomainReasoning.getInstance();
