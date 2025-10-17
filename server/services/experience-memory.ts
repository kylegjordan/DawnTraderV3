import { db } from "../db";
import { 
  experienceMemoryLog,
  autonomyAuditLog,
  awarenessStateLog,
  type InsertExperienceMemoryLog 
} from "../../shared/schema";
import { desc, sql, and, gte } from "drizzle-orm";
import { nanoid } from "nanoid";
import { contextBridge } from "./context-bridge";

interface ExperienceSynthesisResult {
  synthesizedCount: number;
  insights: string[];
  highImpactLessons: number;
}

export class ExperienceMemoryService {
  private contextBridge: typeof contextBridge;
  
  constructor(contextBridgeInstance: typeof contextBridge) {
    this.contextBridge = contextBridgeInstance;
  }

  /**
   * Synthesize experiences from autonomy and awareness logs
   * Extracts patterns and lessons learned from recent system behavior
   */
  async synthesizeExperiences(mode?: 'live' | 'paper'): Promise<ExperienceSynthesisResult> {
    console.log("[ExperienceMemory] 🧠 Starting experience synthesis...");
    
    try {
      // Get recent autonomy audit logs (last 24 hours)
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const autonomyLogs = await db.select()
        .from(autonomyAuditLog)
        .where(gte(autonomyAuditLog.timestamp, oneDayAgo))
        .orderBy(desc(autonomyAuditLog.timestamp))
        .limit(100);
      
      // Get recent awareness states (last 24 hours)
      const awarenessStates = await db.select()
        .from(awarenessStateLog)
        .where(gte(awarenessStateLog.timestamp, oneDayAgo))
        .orderBy(desc(awarenessStateLog.timestamp))
        .limit(50);
      
      const insights: string[] = [];
      let synthesizedCount = 0;
      let highImpactLessons = 0;
      
      // Analyze health score patterns
      if (awarenessStates.length > 0) {
        const avgHealthScore = awarenessStates.reduce((sum, s) => sum + s.healthScore, 0) / awarenessStates.length;
        
        if (avgHealthScore < 0.5) {
          const insight = `System health averaged ${(avgHealthScore * 100).toFixed(1)}% over last 24h - persistent degradation detected`;
          const confidence = Math.min(0.9, awarenessStates.length / 20); // Higher confidence with more data
          
          await this.storeInsight({
            memoryId: `exp_${nanoid(12)}`,
            contextDomain: "system",
            insight,
            confidence,
            impact: "high",
            recommendation: "Investigate root cause of health degradation and implement corrective actions",
            sourceEvents: { 
              awarenessStates: awarenessStates.slice(0, 5).map(s => s.stateId),
              avgHealthScore 
            }
          });
          
          insights.push(insight);
          synthesizedCount++;
          highImpactLessons++;
        }
      }
      
      // Analyze autonomy action patterns
      const explorationActions = autonomyLogs.filter(log => log.actionType === "exploration");
      const selfCheckActions = autonomyLogs.filter(log => log.actionType === "self_check");
      
      if (explorationActions.length > 0) {
        const successRate = explorationActions.filter(a => a.success).length / explorationActions.length;
        
        if (successRate < 0.3 && explorationActions.length > 5) {
          const insight = `Exploration actions have low success rate (${(successRate * 100).toFixed(0)}%) - ${explorationActions.length} attempts in 24h`;
          
          await this.storeInsight({
            memoryId: `exp_${nanoid(12)}`,
            contextDomain: "cognitive",
            insight,
            confidence: 0.75,
            impact: "medium",
            recommendation: "Adjust exploration parameters or refine discovery strategies",
            sourceEvents: {
              explorationActions: explorationActions.slice(0, 3).map(a => a.runId)
            }
          });
          
          insights.push(insight);
          synthesizedCount++;
        }
      }
      
      // Analyze cognitive performance correlation
      if (selfCheckActions.length > 0 && awarenessStates.length > 0) {
        // Find correlation between health scores and cognitive scores
        const correlationInsight = this.analyzeCognitiveHealthCorrelation(
          awarenessStates,
          selfCheckActions
        );
        
        if (correlationInsight) {
          await this.storeInsight(correlationInsight);
          insights.push(correlationInsight.insight);
          synthesizedCount++;
          if (correlationInsight.impact === "high") {
            highImpactLessons++;
          }
        }
      }
      
      console.log(`[ExperienceMemory] ✅ Synthesis complete - ${synthesizedCount} insights, ${highImpactLessons} high-impact`);
      
      // Broadcast synthesis completion
      await this.contextBridge.broadcast({
        type: "state_update",
        userId: null, // System-level event
        mode: mode, // Include mode if provided (user-initiated) or undefined (autonomous)
        payload: {
          eventType: "experience_synthesis_complete",
          synthesizedCount,
          highImpactLessons,
          insights: insights.slice(0, 3) // Top 3
        }
      });
      
      return {
        synthesizedCount,
        insights,
        highImpactLessons
      };
      
    } catch (error) {
      console.error("[ExperienceMemory] ❌ Synthesis failed:", error);
      throw error;
    }
  }

  /**
   * Analyze correlation between cognitive performance and health scores
   */
  private analyzeCognitiveHealthCorrelation(
    awarenessStates: any[],
    selfCheckActions: any[]
  ): InsertExperienceMemoryLog | null {
    if (awarenessStates.length < 3) return null;
    
    const lowHealthStates = awarenessStates.filter(s => s.healthScore < 0.5);
    const highHealthStates = awarenessStates.filter(s => s.healthScore >= 0.7);
    
    if (lowHealthStates.length === 0 || highHealthStates.length === 0) return null;
    
    const avgCognitiveLowHealth = lowHealthStates.reduce((sum, s) => sum + s.cognitiveScore, 0) / lowHealthStates.length;
    const avgCognitiveHighHealth = highHealthStates.reduce((sum, s) => sum + s.cognitiveScore, 0) / highHealthStates.length;
    
    const cognitiveDelta = avgCognitiveHighHealth - avgCognitiveLowHealth;
    
    if (Math.abs(cognitiveDelta) > 15) { // Significant difference
      const insight = cognitiveDelta > 0 
        ? `Cognitive performance ${cognitiveDelta.toFixed(1)}pts higher during healthy periods (${avgCognitiveHighHealth.toFixed(1)}% vs ${avgCognitiveLowHealth.toFixed(1)}%)`
        : `Cognitive performance surprisingly ${Math.abs(cognitiveDelta).toFixed(1)}pts lower during healthy periods - investigate reasoning quality`;
      
      return {
        memoryId: `exp_${nanoid(12)}`,
        contextDomain: "cognitive",
        insight,
        confidence: 0.8,
        impact: cognitiveDelta > 20 ? "high" : "medium",
        recommendation: cognitiveDelta > 0 
          ? "Prioritize system health maintenance to preserve cognitive performance"
          : "Review reasoning quality metrics - health may not be primary factor",
        sourceEvents: {
          lowHealthStates: lowHealthStates.slice(0, 3).map(s => s.stateId),
          highHealthStates: highHealthStates.slice(0, 3).map(s => s.stateId),
          cognitiveDelta
        }
      };
    }
    
    return null;
  }

  /**
   * Store a learned insight/lesson
   */
  private async storeInsight(insight: InsertExperienceMemoryLog): Promise<void> {
    if (!insight.memoryId) {
      insight.memoryId = `exp_${nanoid(12)}`;
    }
    
    await db.insert(experienceMemoryLog).values(insight);
    console.log(`[ExperienceMemory] 💡 Stored insight: ${insight.insight.substring(0, 80)}...`);
  }

  /**
   * Get recent experiences by domain
   */
  async getExperiencesByDomain(domain: string, limit: number = 10): Promise<any[]> {
    return db.select()
      .from(experienceMemoryLog)
      .where(sql`${experienceMemoryLog.contextDomain} = ${domain}`)
      .orderBy(desc(experienceMemoryLog.timestamp))
      .limit(limit);
  }

  /**
   * Get high-impact experiences
   */
  async getHighImpactExperiences(limit: number = 5): Promise<any[]> {
    return db.select()
      .from(experienceMemoryLog)
      .where(sql`${experienceMemoryLog.impact} = 'high'`)
      .orderBy(desc(experienceMemoryLog.confidence), desc(experienceMemoryLog.timestamp))
      .limit(limit);
  }

  /**
   * Get all recent experiences
   */
  async getRecentExperiences(limit: number = 20): Promise<any[]> {
    return db.select()
      .from(experienceMemoryLog)
      .orderBy(desc(experienceMemoryLog.timestamp))
      .limit(limit);
  }
}
