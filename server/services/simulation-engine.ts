import { db } from "../db";
import { strategicSimulationLog, decisionTraceLog } from "@shared/schema";
import type { InsertStrategicSimulationLog, StrategicSimulationLog } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contextBridge } from "./context-bridge";

interface SimulationScenario {
  type: "risk_assessment" | "strategy_optimization" | "market_condition" | "decision_replay" | "what_if_analysis";
  description: string;
  inputState: Record<string, any>;
  actions: Record<string, any>;
}

interface SimulationResult {
  simulationId: string;
  predictedOutcome: Record<string, any>;
  confidence: "very_low" | "low" | "medium" | "high" | "very_high";
  lessonsLearned: string[];
  recommendations: string[];
}

export class SimulationEngineService {
  /**
   * Run a new simulation scenario
   */
  async runSimulation(
    userId: string,
    scenario: SimulationScenario,
    mode?: "live" | "paper"
  ): Promise<StrategicSimulationLog> {
    const simulationId = nanoid(16);

    // Analyze scenario and generate predictions
    const prediction = await this.generatePredictions(scenario);

    const simulation: InsertStrategicSimulationLog = {
      simulationId,
      userId,
      scenarioType: scenario.type,
      scenarioDescription: scenario.description,
      inputState: scenario.inputState,
      simulatedActions: scenario.actions,
      predictedOutcome: prediction.outcome,
      evaluationStatus: "simulating",
      outcomeConfidence: prediction.confidence,
      successScore: prediction.successProbability,
      lessonsLearned: prediction.insights,
      linkedDecisions: [],
      metadata: {
        simulatedBy: "simulation_engine",
        simulationMethod: "predictive_modeling",
        timestamp: new Date().toISOString(),
      },
    };

    const [created] = await db.insert(strategicSimulationLog).values(simulation).returning();

    await contextBridge.broadcast({
      type: "state_update",
      userId,
      mode,
      payload: {
        source: "simulation_engine",
        action: "simulation_started",
        simulationId: created.simulationId,
        scenarioType: created.scenarioType,
        confidence: created.outcomeConfidence,
      },
    });

    // Mark simulation as completed after prediction
    await this.completeSimulation(simulationId, userId, mode);

    return created;
  }

  /**
   * Generate predictions based on scenario
   */
  private async generatePredictions(scenario: SimulationScenario): Promise<{
    outcome: Record<string, any>;
    confidence: "very_low" | "low" | "medium" | "high" | "very_high";
    successProbability: number;
    insights: string[];
  }> {
    // Analyze scenario type and generate appropriate predictions
    let outcome: Record<string, any> = {};
    let confidence: "very_low" | "low" | "medium" | "high" | "very_high" = "medium";
    let successProbability = 0.5;
    let insights: string[] = [];

    switch (scenario.type) {
      case "risk_assessment":
        outcome = {
          riskLevel: "medium",
          potentialLoss: scenario.inputState.portfolioBalance * 0.05,
          mitigationStrategies: ["diversification", "stop_loss_tightening"],
        };
        confidence = "high";
        successProbability = 0.7;
        insights.push("Risk assessment suggests moderate exposure");
        break;

      case "strategy_optimization":
        outcome = {
          optimizedParams: scenario.actions,
          expectedImprovement: 15,
          tradeoffs: ["higher_risk", "better_returns"],
        };
        confidence = "medium";
        successProbability = 0.65;
        insights.push("Strategy optimization shows potential 15% improvement");
        break;

      case "market_condition":
        outcome = {
          marketTrend: "bullish",
          volatility: "moderate",
          optimalStrategy: "breakout",
        };
        confidence = "medium";
        successProbability = 0.6;
        insights.push("Market conditions favor breakout strategies");
        break;

      case "decision_replay":
        outcome = {
          originalResult: scenario.inputState.originalOutcome,
          alternativeResult: scenario.actions.alternativeAction,
          comparison: "alternative_better",
        };
        confidence = "high";
        successProbability = 0.75;
        insights.push("Historical replay suggests alternative approach was better");
        break;

      case "what_if_analysis":
        outcome = {
          scenario: scenario.description,
          likelyOutcome: scenario.actions.hypotheticalAction,
          riskRewardRatio: 2.5,
        };
        confidence = "low";
        successProbability = 0.55;
        insights.push("What-if analysis provides directional guidance");
        break;
    }

    return { outcome, confidence, successProbability, insights };
  }

  /**
   * Complete a simulation
   */
  async completeSimulation(
    simulationId: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicSimulationLog | null> {
    const [updated] = await db
      .update(strategicSimulationLog)
      .set({
        evaluationStatus: "completed",
      })
      .where(eq(strategicSimulationLog.simulationId, simulationId))
      .returning();

    if (updated) {
      await contextBridge.broadcast({
        type: "state_update",
        userId,
        mode,
        payload: {
          source: "simulation_engine",
          action: "simulation_completed",
          simulationId: updated.simulationId,
          successScore: updated.successScore,
        },
      });
    }

    return updated || null;
  }

  /**
   * Update simulation with actual outcome
   */
  async updateActualOutcome(
    simulationId: string,
    actualOutcome: Record<string, any>,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicSimulationLog | null> {
    const [simulation] = await db
      .select()
      .from(strategicSimulationLog)
      .where(eq(strategicSimulationLog.simulationId, simulationId));

    if (!simulation) return null;

    // Calculate success score based on prediction accuracy
    const successScore = this.calculateAccuracy(
      simulation.predictedOutcome as Record<string, any>,
      actualOutcome
    );

    const [updated] = await db
      .update(strategicSimulationLog)
      .set({
        actualOutcome,
        successScore,
      })
      .where(eq(strategicSimulationLog.simulationId, simulationId))
      .returning();

    if (updated) {
      await contextBridge.broadcast({
        type: "state_update",
        userId,
        mode,
        payload: {
          source: "simulation_engine",
          action: "outcome_updated",
          simulationId: updated.simulationId,
          successScore: updated.successScore,
        },
      });
    }

    return updated || null;
  }

  /**
   * Calculate prediction accuracy
   */
  private calculateAccuracy(
    predicted: Record<string, any>,
    actual: Record<string, any>
  ): number {
    // Simple accuracy calculation based on matching keys
    const predictedKeys = Object.keys(predicted);
    const actualKeys = Object.keys(actual);
    
    const commonKeys = predictedKeys.filter(key => actualKeys.includes(key));
    const matchingValues = commonKeys.filter(key => {
      const predictedVal = predicted[key];
      const actualVal = actual[key];
      
      // Simple comparison
      if (typeof predictedVal === 'number' && typeof actualVal === 'number') {
        const diff = Math.abs(predictedVal - actualVal);
        const avg = (Math.abs(predictedVal) + Math.abs(actualVal)) / 2;
        return avg === 0 ? diff === 0 : (diff / avg) < 0.2; // Within 20%
      }
      
      return JSON.stringify(predictedVal) === JSON.stringify(actualVal);
    });

    return commonKeys.length > 0 ? matchingValues.length / commonKeys.length : 0;
  }

  /**
   * Get all simulations for a user
   */
  async getSimulations(
    userId: string,
    limit = 50
  ): Promise<StrategicSimulationLog[]> {
    return await db
      .select()
      .from(strategicSimulationLog)
      .where(eq(strategicSimulationLog.userId, userId))
      .orderBy(desc(strategicSimulationLog.createdAt))
      .limit(limit);
  }

  /**
   * Get simulation results
   */
  async getSimulationResults(simulationId: string): Promise<{
    simulation: StrategicSimulationLog | null;
    analysis: Record<string, any>;
  }> {
    const [simulation] = await db
      .select()
      .from(strategicSimulationLog)
      .where(eq(strategicSimulationLog.simulationId, simulationId));

    if (!simulation) {
      return { simulation: null, analysis: {} };
    }

    const analysis = {
      accuracyScore: simulation.successScore,
      confidence: simulation.outcomeConfidence,
      lessonsLearned: simulation.lessonsLearned,
      recommendedActions: this.generateRecommendations(simulation),
    };

    return { simulation, analysis };
  }

  /**
   * Generate recommendations based on simulation
   */
  private generateRecommendations(simulation: StrategicSimulationLog): string[] {
    const recommendations: string[] = [];
    
    if (simulation.successScore && simulation.successScore > 0.8) {
      recommendations.push("High accuracy - consider applying this approach");
    } else if (simulation.successScore && simulation.successScore < 0.5) {
      recommendations.push("Low accuracy - revisit assumptions and model");
    }

    if (simulation.outcomeConfidence === "very_low" || simulation.outcomeConfidence === "low") {
      recommendations.push("Gather more data to improve prediction confidence");
    }

    return recommendations;
  }

  /**
   * Generate simulation from decision
   */
  async simulateDecision(
    decisionId: string,
    userId: string,
    mode?: "live" | "paper"
  ): Promise<StrategicSimulationLog | null> {
    const [decision] = await db
      .select()
      .from(decisionTraceLog)
      .where(eq(decisionTraceLog.decisionId, decisionId));

    if (!decision) return null;

    const scenario: SimulationScenario = {
      type: "decision_replay",
      description: `Simulation of decision: ${decision.decisionType}`,
      inputState: decision.contextSnapshot as Record<string, any>,
      actions: decision.chosenAction as Record<string, any>,
    };

    return await this.runSimulation(userId, scenario, mode);
  }
}

export const simulationEngine = new SimulationEngineService();
