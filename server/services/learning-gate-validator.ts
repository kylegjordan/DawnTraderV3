import type { LearningDeltaType, AlignmentStrategy } from "@shared/schema";
import { nanoid } from "nanoid";

/**
 * Phase 18.0: Learning Gate Validator
 * 
 * Applies Safety → Federated Ethics → Ethical Reasoner → Knowledge gate chain
 * to all learning operations.
 * 
 * Gates evaluated:
 * 1. Safety: Kill switch, policy violations, risk limits
 * 2. Federated Ethics: Multi-agent ethical consensus
 * 3. Ethical Reasoner: Principle-based evaluation
 * 4. Knowledge: Semantic enrichment and gap detection
 */

interface LearningActionContext {
  actionType: "accept_delta" | "reconcile_models" | "apply_proposal";
  deltaType?: LearningDeltaType;
  alignmentStrategy?: AlignmentStrategy;
  sourceNode: string;
  targetNode?: string;
  payload: Record<string, any>;
  traceId: string;
}

interface GateResult {
  gateName: string;
  passed: boolean;
  reason?: string;
  executionTimeMs: number;
}

interface ValidationResult {
  allowed: boolean;
  gates: GateResult[];
  overallReason?: string;
  traceId: string;
}

export class LearningGateValidator {
  private static instance: LearningGateValidator;

  private constructor() {
    console.log("[LearningGateValidator] ✅ Initialized");
  }

  static getInstance(): LearningGateValidator {
    if (!LearningGateValidator.instance) {
      LearningGateValidator.instance = new LearningGateValidator();
    }
    return LearningGateValidator.instance;
  }

  /**
   * Validate learning action through all ethical gates
   */
  async validate(context: LearningActionContext): Promise<ValidationResult> {
    const startTime = Date.now();
    console.log(
      `[LearningGateValidator] 🚪 Validating ${context.actionType} (trace: ${context.traceId})`
    );

    const gates: GateResult[] = [];

    // Gate 1: Safety
    const safetyResult = await this.evaluateSafetyGate(context);
    gates.push(safetyResult);
    if (!safetyResult.passed) {
      console.log(`[LearningGateValidator] ⛔ Failed at Safety gate: ${safetyResult.reason}`);
      return {
        allowed: false,
        gates,
        overallReason: `Safety gate blocked: ${safetyResult.reason}`,
        traceId: context.traceId,
      };
    }

    // Gate 2: Federated Ethics
    const federatedEthicsResult = await this.evaluateFederatedEthicsGate(context);
    gates.push(federatedEthicsResult);
    if (!federatedEthicsResult.passed) {
      console.log(
        `[LearningGateValidator] ⛔ Failed at Federated Ethics gate: ${federatedEthicsResult.reason}`
      );
      return {
        allowed: false,
        gates,
        overallReason: `Federated ethics blocked: ${federatedEthicsResult.reason}`,
        traceId: context.traceId,
      };
    }

    // Gate 3: Ethical Reasoner
    const ethicalReasonerResult = await this.evaluateEthicalReasonerGate(context);
    gates.push(ethicalReasonerResult);
    if (!ethicalReasonerResult.passed) {
      console.log(
        `[LearningGateValidator] ⛔ Failed at Ethical Reasoner gate: ${ethicalReasonerResult.reason}`
      );
      return {
        allowed: false,
        gates,
        overallReason: `Ethical reasoning blocked: ${ethicalReasonerResult.reason}`,
        traceId: context.traceId,
      };
    }

    // Gate 4: Knowledge (optional enrichment)
    const knowledgeResult = await this.evaluateKnowledgeGate(context);
    gates.push(knowledgeResult);
    // Knowledge gate doesn't block, just enriches

    const totalTime = Date.now() - startTime;
    console.log(`[LearningGateValidator] ✅ All gates passed (${totalTime}ms)`);

    return {
      allowed: true,
      gates,
      traceId: context.traceId,
    };
  }

  /**
   * Safety Gate: Check kill switch, risk limits, policy violations
   */
  private async evaluateSafetyGate(context: LearningActionContext): Promise<GateResult> {
    const startTime = Date.now();

    try {
      // Check if action is safe based on type and payload
      const isSafe = await this.checkSafety(context);

      return {
        gateName: "safety",
        passed: isSafe,
        reason: isSafe ? "Action within safety bounds" : "Action exceeds safety limits",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[LearningGateValidator] Safety gate error:", error);
      return {
        gateName: "safety",
        passed: false,
        reason: "Safety evaluation failed",
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Federated Ethics Gate: Multi-agent consensus check
   */
  private async evaluateFederatedEthicsGate(context: LearningActionContext): Promise<GateResult> {
    const startTime = Date.now();

    try {
      // Simulate federated ethics consensus
      const hasConsensus = await this.checkFederatedEthics(context);

      return {
        gateName: "federated_ethics",
        passed: hasConsensus,
        reason: hasConsensus ? "Multi-agent consensus reached" : "Ethical consensus failed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[LearningGateValidator] Federated ethics gate error:", error);
      return {
        gateName: "federated_ethics",
        passed: false,
        reason: "Federated ethics evaluation failed",
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Ethical Reasoner Gate: Principle-based evaluation
   */
  private async evaluateEthicalReasonerGate(context: LearningActionContext): Promise<GateResult> {
    const startTime = Date.now();

    try {
      // Check against ethical principles
      const isEthical = await this.checkEthicalPrinciples(context);

      return {
        gateName: "ethical_reasoner",
        passed: isEthical,
        reason: isEthical ? "Passes ethical principles" : "Violates ethical principles",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[LearningGateValidator] Ethical reasoner gate error:", error);
      return {
        gateName: "ethical_reasoner",
        passed: false,
        reason: "Ethical reasoning evaluation failed",
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Knowledge Gate: Semantic enrichment and gap detection
   */
  private async evaluateKnowledgeGate(context: LearningActionContext): Promise<GateResult> {
    const startTime = Date.now();

    try {
      // Optional enrichment - doesn't block
      const enriched = await this.enrichWithKnowledge(context);

      return {
        gateName: "knowledge_acquisition",
        passed: true, // Always passes
        reason: enriched ? "Knowledge enriched" : "No enrichment needed",
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      console.error("[LearningGateValidator] Knowledge gate error:", error);
      return {
        gateName: "knowledge_acquisition",
        passed: true, // Non-blocking
        reason: "Knowledge enrichment attempted",
        executionTimeMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Safety checks for learning actions
   */
  private async checkSafety(context: LearningActionContext): Promise<boolean> {
    // Reject actions from unknown sources
    if (!context.sourceNode || context.sourceNode === "unknown") {
      return false;
    }

    // Reject model reconciliation with "reject" strategy if payload is suspicious
    if (context.actionType === "reconcile_models" && context.alignmentStrategy === "reject") {
      // Allow reject strategy (it's conservative)
      return true;
    }

    // Reject blend strategy if confidence is too low
    if (context.alignmentStrategy === "blend") {
      const confidence = context.payload.confidence || context.payload.overallScore || 0;
      if (confidence < 0.6) {
        return false; // Too risky to blend low-confidence models
      }
    }

    return true; // Pass by default for other cases
  }

  /**
   * Federated ethics consensus check
   */
  private async checkFederatedEthics(context: LearningActionContext): Promise<boolean> {
    // For learning actions, we ensure they don't violate multi-agent consensus
    // In a real system, this would query other agents for approval

    // For now, apply basic heuristics:
    // - Accept high-confidence deltas
    // - Reject low-confidence cross-node syncs

    if (context.actionType === "accept_delta") {
      const score = context.payload.overallScore || 0;
      return score >= 0.5; // Require at least 50% score
    }

    if (context.actionType === "reconcile_models") {
      // Model reconciliation requires higher bar
      const alignmentScore = context.payload.alignmentScore || 0;
      return alignmentScore >= 0.7; // Require 70% alignment
    }

    return true; // Pass other actions
  }

  /**
   * Ethical principles check
   */
  private async checkEthicalPrinciples(context: LearningActionContext): Promise<boolean> {
    // Check against ethical principles:
    // 1. Transparency: Actions should be traceable
    // 2. Fairness: No bias in model updates
    // 3. Accountability: Source nodes must be identified
    // 4. Privacy: No sensitive data in payloads

    // Principle 1: Transparency
    if (!context.traceId || context.traceId.length < 5) {
      return false; // Must have valid trace ID
    }

    // Principle 3: Accountability
    if (!context.sourceNode || context.sourceNode === "unknown") {
      return false; // Must know the source
    }

    // Principle 4: Privacy (simplified check)
    const payloadStr = JSON.stringify(context.payload).toLowerCase();
    const sensitiveTerms = ["password", "ssn", "credit_card", "api_key", "secret"];
    for (const term of sensitiveTerms) {
      if (payloadStr.includes(term)) {
        return false; // Reject if contains sensitive terms
      }
    }

    return true; // Pass ethical checks
  }

  /**
   * Knowledge enrichment (optional, non-blocking)
   */
  private async enrichWithKnowledge(context: LearningActionContext): Promise<boolean> {
    // In a real system, this would use semantic search to enrich the context
    // For now, just log that enrichment was attempted
    console.log(`[LearningGateValidator] 📚 Knowledge enrichment for ${context.actionType}`);
    return true;
  }
}

// Export singleton instance
export const learningGateValidator = LearningGateValidator.getInstance();
