/**
 * Phase 8.94: Awareness Core Service
 * 
 * Centralizes awareness logic and integrates multi-layer state assessment
 * - Aggregates metrics from Autonomy Controller, Cognitive Tuner, System Health Monitor
 * - Generates unified AwarenessState object
 * - Persists state in awareness_state_log table
 * - Emits Context Bridge events
 * - Provides reflectAndRespond() for pattern detection
 */

import { nanoid } from 'nanoid';
import { db } from '../db';
import { awarenessStateLog, autonomyAuditLog } from '@shared/schema';
import type { InsertAwarenessStateLog, AutonomyAuditLog } from '@shared/schema';
import { desc, sql } from 'drizzle-orm';

export interface AwarenessState {
  stateId: string;
  timestamp: Date;
  userId?: string;
  healthScore: number;
  cognitiveScore: number;
  emotionalState: 'stable' | 'focused' | 'alert' | 'fatigued' | 'overloaded' | 'recovering';
  dominantDomain?: string;
  activeDomains: string[];
  missionFocus: string;
  recentActions: RecentAction[];
  reflectionSummary?: string;
  confidenceScore: number;
  anomalyDetected: boolean;
  metadata?: Record<string, any>;
}

export interface RecentAction {
  actionType: string;
  timestamp: Date;
  outcome: string;
  impactLevel: 'low' | 'medium' | 'high';
}

export interface ReflectionResult {
  reflectionId: string;
  timestamp: Date;
  summary: string;
  patterns: string[];
  recommendations: string[];
  insights: string[];
  moodShift?: string;
  confidenceChange: number;
}

class AwarenessCoreService {
  /**
   * Update and persist current awareness state
   */
  async updateAwarenessState(userId?: string): Promise<AwarenessState> {
    const stateId = `awareness_${nanoid(10)}`;
    
    console.log(`[AwarenessCore] 🧭 Updating awareness state (stateId: ${stateId})`);
    
    try {
      // 1. Gather metrics from multiple sources
      const { autonomyController } = await import('./autonomy-controller');
      const { cognitiveTuner } = await import('./cognitive-tuner');
      const { systemHealthMonitor } = await import('./system-health-monitor');
      
      // Get autonomy status
      const lastSelfCheck = await autonomyController.getLastSelfCheck();
      const healthScore = lastSelfCheck?.healthScore ?? 0.8;
      const cognitiveStatus = await cognitiveTuner.getStatus();
      const cognitiveScore = cognitiveStatus.accuracyScore;
      
      // Get system health
      const systemMetrics = systemHealthMonitor.getMetrics();
      
      // 2. Get recent autonomy actions (last 10)
      const recentAuditLogs = await db
        .select()
        .from(autonomyAuditLog)
        .orderBy(desc(autonomyAuditLog.timestamp))
        .limit(10);
      
      const recentActions: RecentAction[] = recentAuditLogs.map(log => ({
        actionType: log.actionType,
        timestamp: log.timestamp,
        outcome: log.success ? 'success' : 'failure',
        impactLevel: this.determineImpactLevel(log.actionType),
      }));
      
      // 3. Determine emotional state based on health and cognitive scores
      const emotionalState = this.determineEmotionalState(healthScore, cognitiveScore);
      
      // 4. Identify dominant domain and active domains
      const { dominantDomain, activeDomains } = this.analyzeDomainActivity(recentAuditLogs);
      
      // 5. Determine mission focus
      const missionFocus = this.determineMissionFocus(dominantDomain, emotionalState, healthScore);
      
      // 6. Calculate confidence score
      const confidenceScore = this.calculateConfidence(healthScore, cognitiveScore, recentActions);
      
      // 7. Detect anomalies
      const anomalyDetected = healthScore < 0.3 || cognitiveScore < 0.4;
      
      // Phase 9.0: Get adaptive learning metrics
      const { ExperienceMemoryService } = await import('./experience-memory');
      const { AdaptiveObjectiveEngine } = await import('./adaptive-objective-engine');
      const { contextBridge } = await import('./context-bridge');
      
      const experienceMemory = new ExperienceMemoryService(contextBridge);
      const adaptiveEngine = new AdaptiveObjectiveEngine(contextBridge);
      
      // Get recent experience insights
      const recentExperiences = await experienceMemory.getRecentExperiences(5);
      const experienceInsightCount = recentExperiences.length;
      
      // Get current alignment profile
      const alignmentProfile = await adaptiveEngine.getCurrentProfile();
      const alignmentScore = alignmentProfile 
        ? Object.values(alignmentProfile.objectives || {}).reduce((sum: number, val: any) => sum + (parseFloat(val) || 0), 0) / Object.keys(alignmentProfile.objectives || {}).length
        : 0.5;
      
      // 8. Build awareness state
      const awarenessState: AwarenessState = {
        stateId,
        timestamp: new Date(),
        userId,
        healthScore,
        cognitiveScore,
        emotionalState,
        dominantDomain,
        activeDomains,
        missionFocus,
        recentActions,
        confidenceScore,
        anomalyDetected,
        metadata: {
          systemMetrics: {
            memory: systemMetrics.system?.memoryUsage?.percentUsed,
            cacheHitRate: systemMetrics.cache?.hitRate,
          },
          // Phase 9.0: Adaptive Learning Metrics
          adaptiveLearning: {
            experienceInsightCount,
            alignmentScore,
            alignmentStatus: alignmentProfile?.currentStatus || 'unknown',
            lastAdjustment: alignmentProfile?.lastAdjustment,
          },
        },
      };
      
      // 9. Persist to database
      await db.insert(awarenessStateLog).values({
        stateId,
        userId,
        healthScore,
        cognitiveScore,
        emotionalState,
        dominantDomain,
        activeDomains,
        missionFocus,
        recentActions: recentActions as any,
        confidenceScore,
        anomalyDetected,
        metadata: awarenessState.metadata as any,
      });
      
      // 10. Emit Context Bridge event (note: contextBridge already imported above in Phase 9.0)
      await contextBridge.broadcast({
        type: 'state_update',
        userId: userId,
        payload: {
          stateId,
          eventSubtype: 'awareness_update',
          healthScore,
          cognitiveScore,
          emotionalState,
          dominantDomain,
          missionFocus,
          confidenceScore,
          anomalyDetected,
          // Phase 9.0: Include adaptive learning metrics
          experienceInsightCount,
          alignmentScore,
          alignmentStatus: alignmentProfile?.currentStatus || 'unknown',
        },
      });
      
      console.log(`[AwarenessCore] ✅ Awareness state updated - Emotional: ${emotionalState}, Focus: ${missionFocus}`);
      
      return awarenessState;
    } catch (error) {
      console.error('[AwarenessCore] ❌ Failed to update awareness state:', error);
      throw error;
    }
  }
  
  /**
   * Perform deep self-reflection and pattern detection
   */
  async reflectAndRespond(userId?: string): Promise<ReflectionResult> {
    const reflectionId = `reflect_${nanoid(10)}`;
    const startTime = performance.now();
    
    console.log(`[AwarenessCore] 🤔 Initiating self-reflection (reflectionId: ${reflectionId})`);
    
    try {
      // 1. Get recent awareness states (last 24 hours)
      const recentStates = await db
        .select()
        .from(awarenessStateLog)
        .where(sql`${awarenessStateLog.timestamp} > NOW() - INTERVAL '24 hours'`)
        .orderBy(desc(awarenessStateLog.timestamp))
        .limit(20);
      
      if (recentStates.length === 0) {
        console.log('[AwarenessCore] No recent states to reflect on');
        return {
          reflectionId,
          timestamp: new Date(),
          summary: 'Insufficient data for reflection',
          patterns: [],
          recommendations: [],
          insights: [],
          confidenceChange: 0,
        };
      }
      
      // 2. Analyze patterns
      const patterns = this.detectPatterns(recentStates);
      
      // 3. Generate insights
      const insights = this.generateInsights(recentStates, patterns);
      
      // 4. Generate recommendations
      const recommendations = this.generateRecommendations(patterns, recentStates[0]);
      
      // 5. Analyze mood/confidence shifts
      const moodShift = this.analyzeMoodShift(recentStates);
      const confidenceChange = this.analyzeConfidenceChange(recentStates);
      
      // 6. Build reflection summary
      const summary = this.buildReflectionSummary(recentStates[0], patterns, insights);
      
      // 7. Update latest state with reflection
      if (recentStates.length > 0) {
        await db
          .update(awarenessStateLog)
          .set({ reflectionSummary: summary })
          .where(sql`${awarenessStateLog.stateId} = ${recentStates[0].stateId}`);
      }
      
      const executionTime = Math.round(performance.now() - startTime);
      
      // 8. Emit reflection event
      const { contextBridge } = await import('./context-bridge');
      await contextBridge.broadcast({
        type: 'state_update',
        userId: userId || 'system',
        payload: {
          reflectionId,
          eventSubtype: 'awareness_reflection',
          summary,
          patternsCount: patterns.length,
          insightsCount: insights.length,
          moodShift,
          confidenceChange,
          executionTime,
        },
      });
      
      console.log(`[AwarenessCore] ✅ Reflection complete - ${patterns.length} patterns, ${insights.length} insights (${executionTime}ms)`);
      
      return {
        reflectionId,
        timestamp: new Date(),
        summary,
        patterns,
        recommendations,
        insights,
        moodShift,
        confidenceChange,
      };
    } catch (error) {
      console.error('[AwarenessCore] ❌ Reflection failed:', error);
      throw error;
    }
  }
  
  /**
   * Get current awareness state
   */
  async getCurrentState(userId?: string): Promise<AwarenessState | null> {
    const latestState = await db
      .select()
      .from(awarenessStateLog)
      .orderBy(desc(awarenessStateLog.timestamp))
      .limit(1);
    
    if (latestState.length === 0) {
      return null;
    }
    
    const state = latestState[0];
    return {
      stateId: state.stateId,
      timestamp: state.timestamp,
      userId: state.userId || undefined,
      healthScore: state.healthScore,
      cognitiveScore: state.cognitiveScore,
      emotionalState: state.emotionalState,
      dominantDomain: state.dominantDomain || undefined,
      activeDomains: state.activeDomains || [],
      missionFocus: state.missionFocus || 'Unknown',
      recentActions: (state.recentActions as any) || [],
      reflectionSummary: state.reflectionSummary || undefined,
      confidenceScore: state.confidenceScore || 0,
      anomalyDetected: state.anomalyDetected || false,
      metadata: (state.metadata as any) || undefined,
    };
  }
  
  /**
   * Get awareness state history
   */
  async getStateHistory(limit: number = 10, userId?: string): Promise<AwarenessState[]> {
    const states = await db
      .select()
      .from(awarenessStateLog)
      .orderBy(desc(awarenessStateLog.timestamp))
      .limit(limit);
    
    return states.map(state => ({
      stateId: state.stateId,
      timestamp: state.timestamp,
      userId: state.userId || undefined,
      healthScore: state.healthScore,
      cognitiveScore: state.cognitiveScore,
      emotionalState: state.emotionalState,
      dominantDomain: state.dominantDomain || undefined,
      activeDomains: state.activeDomains || [],
      missionFocus: state.missionFocus || 'Unknown',
      recentActions: (state.recentActions as any) || [],
      reflectionSummary: state.reflectionSummary || undefined,
      confidenceScore: state.confidenceScore || 0,
      anomalyDetected: state.anomalyDetected || false,
      metadata: (state.metadata as any) || undefined,
    }));
  }
  
  // ========================================
  // Private Helper Methods
  // ========================================
  
  private determineEmotionalState(
    healthScore: number,
    cognitiveScore: number
  ): 'stable' | 'focused' | 'alert' | 'fatigued' | 'overloaded' | 'recovering' {
    const avgScore = (healthScore + cognitiveScore) / 2;
    
    if (avgScore < 0.3) return 'overloaded';
    if (avgScore < 0.5) return 'fatigued';
    if (avgScore < 0.6) return 'recovering';
    if (avgScore < 0.7) return 'alert';
    if (avgScore < 0.85) return 'focused';
    return 'stable';
  }
  
  private determineImpactLevel(actionType: string): 'low' | 'medium' | 'high' {
    if (actionType === 'self_check') return 'low';
    if (actionType === 'self_reasoning') return 'medium';
    if (actionType === 'exploration' || actionType === 'optimization') return 'high';
    return 'low';
  }
  
  private analyzeDomainActivity(auditLogs: any[]): { dominantDomain?: string; activeDomains: string[] } {
    const domainCounts = new Map<string, number>();
    
    for (const log of auditLogs) {
      const domain = log.metadata?.domain;
      if (domain) {
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      }
    }
    
    const activeDomains = Array.from(domainCounts.keys());
    const dominantDomain = activeDomains.length > 0
      ? Array.from(domainCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : undefined;
    
    return { dominantDomain, activeDomains };
  }
  
  private determineMissionFocus(
    dominantDomain: string | undefined,
    emotionalState: string,
    healthScore: number
  ): string {
    if (healthScore < 0.4) {
      return 'Recovering system health';
    }
    
    if (emotionalState === 'overloaded' || emotionalState === 'fatigued') {
      return 'Stabilizing cognitive load';
    }
    
    if (dominantDomain === 'trading') {
      return 'Optimizing trading strategies';
    }
    
    if (dominantDomain === 'devops') {
      return 'Maintaining system infrastructure';
    }
    
    if (dominantDomain === 'fullstack') {
      return 'Enhancing application features';
    }
    
    if (dominantDomain === 'ux') {
      return 'Improving user experience';
    }
    
    return 'Maintaining system health';
  }
  
  private calculateConfidence(
    healthScore: number,
    cognitiveScore: number,
    recentActions: RecentAction[]
  ): number {
    const avgScore = (healthScore + cognitiveScore) / 2;
    const successRate = recentActions.length > 0
      ? recentActions.filter(a => a.outcome === 'success').length / recentActions.length
      : 1;
    
    return Math.round((avgScore * 0.6 + successRate * 0.4) * 100) / 100;
  }
  
  private detectPatterns(states: any[]): string[] {
    const patterns: string[] = [];
    
    // Pattern 1: Health degradation trend
    const healthScores = states.map(s => s.healthScore);
    if (healthScores.length >= 3) {
      const trend = healthScores.slice(0, 3);
      if (trend[0] < trend[1] && trend[1] < trend[2]) {
        patterns.push('Health improving consistently');
      } else if (trend[0] > trend[1] && trend[1] > trend[2]) {
        patterns.push('Health degrading - requires attention');
      }
    }
    
    // Pattern 2: Frequent domain switching
    const domains = states.map(s => s.dominantDomain).filter(Boolean);
    const uniqueDomains = new Set(domains.slice(0, 5));
    if (uniqueDomains.size >= 4) {
      patterns.push('High domain switching - possible lack of focus');
    }
    
    // Pattern 3: Emotional state consistency
    const emotions = states.map(s => s.emotionalState);
    const sameEmotion = emotions.slice(0, 5).every(e => e === emotions[0]);
    if (sameEmotion && emotions[0] === 'overloaded') {
      patterns.push('Sustained overload state - intervention needed');
    }
    
    return patterns;
  }
  
  private generateInsights(states: any[], patterns: string[]): string[] {
    const insights: string[] = [];
    
    const latestState = states[0];
    
    // Insight 1: Performance correlation
    if (latestState.healthScore > 0.8 && latestState.cognitiveScore > 0.8) {
      insights.push('System performing optimally across all metrics');
    }
    
    // Insight 2: Recovery trajectory
    if (patterns.some(p => p.includes('improving'))) {
      insights.push('Autonomous recovery mechanisms are effective');
    }
    
    // Insight 3: Domain expertise
    if (latestState.dominantDomain === 'trading' && latestState.confidenceScore > 0.85) {
      insights.push('Trading domain analysis showing high confidence');
    }
    
    return insights;
  }
  
  private generateRecommendations(patterns: string[], latestState: any): string[] {
    const recommendations: string[] = [];
    
    if (patterns.some(p => p.includes('degrading'))) {
      recommendations.push('Trigger deep system health investigation');
    }
    
    if (patterns.some(p => p.includes('overload'))) {
      recommendations.push('Reduce cognitive load - defer non-critical tasks');
    }
    
    if (patterns.some(p => p.includes('switching'))) {
      recommendations.push('Increase domain focus time to improve effectiveness');
    }
    
    if (latestState.anomalyDetected) {
      recommendations.push('Immediate attention required - anomaly detected');
    }
    
    return recommendations;
  }
  
  private analyzeMoodShift(states: any[]): string | undefined {
    if (states.length < 2) return undefined;
    
    const current = states[0].emotionalState;
    const previous = states[1].emotionalState;
    
    if (current === previous) return undefined;
    
    return `${previous} → ${current}`;
  }
  
  private analyzeConfidenceChange(states: any[]): number {
    if (states.length < 2) return 0;
    
    return Math.round((states[0].confidenceScore - states[1].confidenceScore) * 100) / 100;
  }
  
  private buildReflectionSummary(latestState: any, patterns: string[], insights: string[]): string {
    const parts: string[] = [];
    
    parts.push(`Current state: ${latestState.emotionalState} with ${(latestState.confidenceScore * 100).toFixed(0)}% confidence`);
    parts.push(`Mission: ${latestState.missionFocus}`);
    
    if (latestState.dominantDomain) {
      parts.push(`Primary focus: ${latestState.dominantDomain} domain`);
    }
    
    if (patterns.length > 0) {
      parts.push(`Patterns: ${patterns.join('; ')}`);
    }
    
    if (insights.length > 0) {
      parts.push(`Insights: ${insights.join('; ')}`);
    }
    
    return parts.join(' | ');
  }
}

// Export singleton instance
export const awarenessCore = new AwarenessCoreService();
