import { db } from "../db";
import { 
  goalAlignmentProfile,
  experienceMemoryLog,
  awarenessStateLog,
  type InsertGoalAlignmentProfile,
  type GoalAlignmentProfile
} from "../../shared/schema";
import { desc, sql, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contextBridge } from "./context-bridge";

interface PerformanceDriftAnalysis {
  hasDrift: boolean;
  driftMetrics: {
    healthDelta?: number;
    cognitiveDelta?: number;
    emotionalDrift?: string;
  };
  recommendations: string[];
  suggestedAdjustments: Record<string, number>;
}

interface AlignmentWeightUpdate {
  previousWeights: Record<string, number>;
  newWeights: Record<string, number>;
  reason: string;
  confidence: number;
}

export class AdaptiveObjectiveEngine {
  private contextBridge: typeof contextBridge;
  private defaultProfile: InsertGoalAlignmentProfile;
  
  constructor(contextBridgeInstance: typeof contextBridge) {
    this.contextBridge = contextBridgeInstance;
    
    // Default goal alignment profile
    this.defaultProfile = {
      profileId: `profile_${nanoid(12)}`,
      userId: null, // System-level profile
      objectives: {
        performance: 0.6,
        reliability: 0.8,
        exploration: 0.3,
        efficiency: 0.5
      },
      targetMetrics: {
        minHealthScore: 0.7,
        minCognitiveScore: 70,
        maxResponseLatency: 2000,
        minSuccessRate: 0.75
      },
      currentStatus: "compliant",
      lastAdjustment: null,
      adjustmentHistory: []
    };
  }

  /**
   * Initialize or get the goal alignment profile
   */
  async initializeProfile(): Promise<GoalAlignmentProfile> {
    try {
      // Check if profile exists
      const existing = await db.select()
        .from(goalAlignmentProfile)
        .where(sql`${goalAlignmentProfile.userId} IS NULL`) // System profile
        .limit(1);
      
      if (existing.length > 0) {
        console.log("[AdaptiveEngine] ✅ Using existing profile:", existing[0].profileId);
        return existing[0];
      }
      
      // Create new profile
      const [newProfile] = await db.insert(goalAlignmentProfile)
        .values(this.defaultProfile)
        .returning();
      
      console.log("[AdaptiveEngine] ✨ Created new profile:", newProfile.profileId);
      return newProfile;
      
    } catch (error) {
      console.error("[AdaptiveEngine] ❌ Profile initialization failed:", error);
      throw error;
    }
  }

  /**
   * Evaluate performance drift against target metrics
   */
  async evaluatePerformanceDrift(): Promise<PerformanceDriftAnalysis> {
    console.log("[AdaptiveEngine] 📊 Evaluating performance drift...");
    
    try {
      const profile = await this.initializeProfile();
      const targetMetrics = profile.targetMetrics as any;
      
      // Get recent awareness states (last 6 hours)
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
      const recentStates = await db.select()
        .from(awarenessStateLog)
        .where(sql`${awarenessStateLog.timestamp} >= ${sixHoursAgo}`)
        .orderBy(desc(awarenessStateLog.timestamp))
        .limit(20);
      
      if (recentStates.length === 0) {
        console.log("[AdaptiveEngine] ⚠️  No recent states found");
        return {
          hasDrift: false,
          driftMetrics: {},
          recommendations: [],
          suggestedAdjustments: {}
        };
      }
      
      // Calculate current metrics
      const avgHealthScore = recentStates.reduce((sum, s) => sum + s.healthScore, 0) / recentStates.length;
      const avgCognitiveScore = recentStates.reduce((sum, s) => sum + s.cognitiveScore, 0) / recentStates.length;
      
      const healthDelta = targetMetrics.minHealthScore - avgHealthScore;
      const cognitiveDelta = targetMetrics.minCognitiveScore - avgCognitiveScore;
      
      // Detect emotional drift
      const emotionalCounts = recentStates.reduce((acc, s) => {
        acc[s.emotionalState] = (acc[s.emotionalState] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const dominantEmotion = Object.entries(emotionalCounts)
        .sort(([,a], [,b]) => b - a)[0][0];
      
      const hasDrift = healthDelta > 0.1 || cognitiveDelta > 10;
      const recommendations: string[] = [];
      const suggestedAdjustments: Record<string, number> = {};
      
      if (healthDelta > 0.2) {
        recommendations.push("Critical health degradation - increase reliability weight");
        suggestedAdjustments.reliability = 0.9;
        suggestedAdjustments.exploration = 0.1; // Reduce risky exploration
      } else if (healthDelta > 0.1) {
        recommendations.push("Moderate health degradation - boost reliability");
        suggestedAdjustments.reliability = 0.85;
      }
      
      if (cognitiveDelta > 15) {
        recommendations.push("Cognitive performance below target - optimize reasoning");
        suggestedAdjustments.efficiency = 0.7;
      }
      
      if (dominantEmotion === "fatigued" || dominantEmotion === "overloaded") {
        recommendations.push(`System showing ${dominantEmotion} state - reduce workload`);
        suggestedAdjustments.performance = 0.5;
      }
      
      // If system is stable and performing well, allow more exploration
      if (avgHealthScore > targetMetrics.minHealthScore + 0.1 && avgCognitiveScore > targetMetrics.minCognitiveScore + 10) {
        recommendations.push("System exceeding targets - safe to increase exploration");
        suggestedAdjustments.exploration = 0.5;
      }
      
      console.log(`[AdaptiveEngine] 📈 Drift analysis: hasDrift=${hasDrift}, healthDelta=${healthDelta.toFixed(3)}, cognitiveDelta=${cognitiveDelta.toFixed(1)}`);
      
      return {
        hasDrift,
        driftMetrics: {
          healthDelta,
          cognitiveDelta,
          emotionalDrift: dominantEmotion
        },
        recommendations,
        suggestedAdjustments
      };
      
    } catch (error) {
      console.error("[AdaptiveEngine] ❌ Drift evaluation failed:", error);
      throw error;
    }
  }

  /**
   * Update alignment weights based on drift analysis and experiences
   */
  async updateAlignmentWeights(
    driftAnalysis: PerformanceDriftAnalysis,
    confidence: number = 0.7
  ): Promise<AlignmentWeightUpdate> {
    console.log("[AdaptiveEngine] ⚙️  Updating alignment weights...");
    
    try {
      const profile = await this.initializeProfile();
      const currentObjectives = profile.objectives as Record<string, number>;
      const previousWeights = { ...currentObjectives };
      
      // Apply suggested adjustments with dampening factor
      const dampeningFactor = confidence * 0.5; // Max 50% adjustment per update
      const newWeights = { ...currentObjectives };
      
      for (const [key, suggestedValue] of Object.entries(driftAnalysis.suggestedAdjustments)) {
        if (key in newWeights) {
          const current = newWeights[key];
          const delta = (suggestedValue - current) * dampeningFactor;
          newWeights[key] = Math.max(0.1, Math.min(1.0, current + delta)); // Clamp to [0.1, 1.0]
        }
      }
      
      // Get recent high-impact experiences for context
      const recentExperiences = await db.select()
        .from(experienceMemoryLog)
        .where(sql`${experienceMemoryLog.impact} = 'high'`)
        .orderBy(desc(experienceMemoryLog.timestamp))
        .limit(3);
      
      const experienceContext = recentExperiences.map(exp => exp.insight).join("; ");
      
      const reason = `Adaptive adjustment based on ${driftAnalysis.recommendations.join(", ")}. Recent insights: ${experienceContext || "None"}`;
      
      // Update profile
      const adjustmentRecord = {
        timestamp: new Date().toISOString(),
        from: previousWeights,
        to: newWeights,
        reason,
        confidence,
        driftMetrics: driftAnalysis.driftMetrics
      };
      
      const currentHistory = (profile.adjustmentHistory as any[]) || [];
      const updatedHistory = [adjustmentRecord, ...currentHistory].slice(0, 50); // Keep last 50
      
      await db.update(goalAlignmentProfile)
        .set({
          objectives: newWeights,
          lastAdjustment: new Date(),
          adjustmentHistory: updatedHistory,
          currentStatus: driftAnalysis.hasDrift ? "at_risk" : "compliant"
        })
        .where(eq(goalAlignmentProfile.id, profile.id));
      
      console.log(`[AdaptiveEngine] ✅ Weights updated - ${Object.keys(driftAnalysis.suggestedAdjustments).length} adjustments`);
      
      // Broadcast alignment update
      await this.contextBridge.broadcast({
        type: "state_update",
        userId: null, // System-level event
        mode: undefined,
        payload: {
          eventType: "alignment_weights_updated",
          previousWeights,
          newWeights,
          reason,
          confidence
        }
      });
      
      return {
        previousWeights,
        newWeights,
        reason,
        confidence
      };
      
    } catch (error) {
      console.error("[AdaptiveEngine] ❌ Weight update failed:", error);
      throw error;
    }
  }

  /**
   * Get current alignment profile
   */
  async getCurrentProfile(): Promise<GoalAlignmentProfile | null> {
    const profiles = await db.select()
      .from(goalAlignmentProfile)
      .where(sql`${goalAlignmentProfile.userId} IS NULL`)
      .limit(1);
    
    return profiles[0] || null;
  }

  /**
   * Get adjustment history
   */
  async getAdjustmentHistory(limit: number = 10): Promise<any[]> {
    const profile = await this.getCurrentProfile();
    if (!profile) return [];
    
    const history = (profile.adjustmentHistory as any[]) || [];
    return history.slice(0, limit);
  }
}
