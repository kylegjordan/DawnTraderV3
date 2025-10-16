/**
 * Phase 8.6.1 - Learning & Improvement Cycle
 * 
 * Periodically analyzes Learning Fragments from Learning Bob
 * Generates Cognitive Summary Reports to improve Walter's conversational style
 * 
 * Features:
 * - Scheduled analysis of learning patterns (every 24 hours)
 * - Pattern detection: user preferences, effective phrasing, problematic areas
 * - Cognitive summary reports stored in Learning Bob
 * - Style adjustments based on accumulated insights
 */

import { learningBob } from './bob-modules/learning-bob';
import { storage } from '../storage';
import { 
  paperLiveTransferService, 
  feedbackIntegrationService 
} from './phase-8.6.5-enhancements';

interface LearningPattern {
  category: 'user_preference' | 'effective_phrasing' | 'problematic_area' | 'clarity_issue';
  pattern: string;
  frequency: number;
  examples: string[];
  recommendation: string;
}

interface CognitiveSummaryReport {
  generatedAt: Date;
  analysisWindow: { from: Date; to: Date };
  totalFragments: number;
  patterns: LearningPattern[];
  styleRecommendations: string[];
  metrics: {
    positiveInteractions: number;
    negativeInteractions: number;
    averageResponseLength: number;
    topicsDiscussed: string[];
  };
}

class LearningCycleService {
  private readonly MODULE_NAME = 'LearningCycleService';
  private readonly ANALYSIS_INTERVAL_MS: number;
  private readonly WARMUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
  private intervalHandle: NodeJS.Timeout | null = null;
  private warmupHandle: NodeJS.Timeout | null = null;
  private lastAnalysisTime: Date | null = null;

  constructor(analysisIntervalHours: number = 24) {
    this.ANALYSIS_INTERVAL_MS = analysisIntervalHours * 60 * 60 * 1000;
  }

  /**
   * Start the learning cycle with periodic analysis
   */
  start(): void {
    if (this.intervalHandle || this.warmupHandle) {
      console.warn(`[${this.MODULE_NAME}] Already running, ignoring start request`);
      return;
    }

    console.log(`[${this.MODULE_NAME}] 🔄 Starting learning cycle...`);
    
    // Run initial analysis after warmup period (gives system time to accumulate data)
    this.warmupHandle = setTimeout(() => {
      this.warmupHandle = null;
      this.runAnalysisCycle();
    }, this.WARMUP_DELAY_MS);
    
    // Schedule periodic analysis
    this.intervalHandle = setInterval(
      () => this.runAnalysisCycle(),
      this.ANALYSIS_INTERVAL_MS
    );
    
    const intervalHours = this.ANALYSIS_INTERVAL_MS / (60 * 60 * 1000);
    console.log(`[${this.MODULE_NAME}] ✅ Learning cycle scheduled (every ${intervalHours} hours)`);
  }

  /**
   * Stop the learning cycle
   */
  stop(): void {
    let stopped = false;

    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
      stopped = true;
    }

    if (this.warmupHandle) {
      clearTimeout(this.warmupHandle);
      this.warmupHandle = null;
      stopped = true;
    }

    if (stopped) {
      console.log(`[${this.MODULE_NAME}] ⏹️ Learning cycle stopped`);
    }
  }

  /**
   * Run a single analysis cycle
   */
  async runAnalysisCycle(): Promise<void> {
    try {
      console.log(`[${this.MODULE_NAME}] 📊 Starting learning analysis cycle...`);

      // Define analysis window (last 24 hours)
      const now = new Date();
      const windowStart = new Date(now.getTime() - this.ANALYSIS_INTERVAL_MS);
      
      // Retrieve unanalyzed learning fragments for both modes
      const globalContextId = 'default';
      const liveFragments = await learningBob.getUnanalyzed(globalContextId, 'live', 100);
      const paperFragments = await learningBob.getUnanalyzed(globalContextId, 'paper', 100);
      const fragments = [...liveFragments, ...paperFragments];
      
      if (fragments.length === 0) {
        console.log(`[${this.MODULE_NAME}] No unanalyzed fragments, skipping analysis`);
        return;
      }

      console.log(`[${this.MODULE_NAME}] Analyzing ${fragments.length} unanalyzed fragments...`);

      // Generate cognitive summary report
      const report = await this.generateSummaryReport(fragments, windowStart, now);
      
      // Store the report as a learning fragment
      await learningBob.storeFragment({
        globalContextId: 'default',
        mode: 'paper', // System-level summaries go in paper mode
        eventType: 'engine_event',
        eventCategory: 'cognitive_summary', // Category identifies this as a summary
        significance: 'critical',
        narrative: `Cognitive analysis of ${fragments.length} fragments`,
        reasoning: `Generated ${report.patterns.length} patterns and ${report.styleRecommendations.length} recommendations`,
        originalEventData: {
          report,
          generatedAt: now.toISOString(),
          fragmentCount: fragments.length
        }
      });

      // Mark analyzed fragments
      for (const fragment of fragments) {
        await learningBob.markAnalyzed(fragment.id);
      }

      this.lastAnalysisTime = now;
      
      // Phase 8.6.5 Task 8: Paper→Live Knowledge Transfer
      console.log(`[${this.MODULE_NAME}] 🔄 Running Paper→Live knowledge transfer...`);
      const transferResult = await paperLiveTransferService.promoteLearnings(globalContextId);
      console.log(
        `[${this.MODULE_NAME}] Transfer complete: ${transferResult.promoted} promoted, ` +
        `${transferResult.skipped} skipped`
      );

      // Phase 8.6.5 Task 9: Feed learnings to Strategy guardrails
      console.log(`[${this.MODULE_NAME}] 📊 Updating strategy guardrails from learnings...`);
      const liveGuardrails = await feedbackIntegrationService.feedToStrategyGuardrails(globalContextId, 'live');
      const paperGuardrails = await feedbackIntegrationService.feedToStrategyGuardrails(globalContextId, 'paper');
      console.log(
        `[${this.MODULE_NAME}] Guardrails updated: ${liveGuardrails.guardrailsUpdated} live, ` +
        `${paperGuardrails.guardrailsUpdated} paper`
      );
      
      console.log(
        `[${this.MODULE_NAME}] ✅ Analysis complete - ` +
        `${report.patterns.length} patterns detected, ` +
        `${report.styleRecommendations.length} recommendations generated, ` +
        `${fragments.length} fragments marked as analyzed, ` +
        `${transferResult.promoted} learnings promoted to live`
      );
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Analysis cycle failed:`, error);
    }
  }

  /**
   * Generate cognitive summary report from learning fragments
   */
  private async generateSummaryReport(
    fragments: any[],
    windowStart: Date,
    windowEnd: Date
  ): Promise<CognitiveSummaryReport> {
    // Detect patterns across fragments
    const patterns = this.detectPatterns(fragments);
    
    // Generate style recommendations
    const styleRecommendations = this.generateStyleRecommendations(patterns, fragments);
    
    // Calculate metrics
    const metrics = this.calculateMetrics(fragments);

    return {
      generatedAt: new Date(),
      analysisWindow: { from: windowStart, to: windowEnd },
      totalFragments: fragments.length,
      patterns,
      styleRecommendations,
      metrics
    };
  }

  /**
   * Detect learning patterns from fragments
   */
  private detectPatterns(fragments: any[]): LearningPattern[] {
    const patterns: LearningPattern[] = [];
    
    // Pattern: User requests for clarity
    const clarityFragments = fragments.filter(f => {
      const userContext = f.userContext as any;
      return userContext?.userFeedback?.includes('clarify') ||
        userContext?.userFeedback?.includes('explain') ||
        userContext?.userFeedback?.includes('simpler');
    });
    if (clarityFragments.length > 0) {
      patterns.push({
        category: 'clarity_issue',
        pattern: 'Users frequently request simpler explanations',
        frequency: clarityFragments.length,
        examples: clarityFragments.slice(0, 3).map(f => f.narrative || ''),
        recommendation: 'Use shorter sentences and avoid technical jargon in initial responses'
      });
    }

    // Pattern: Effective technical responses
    const technicalFragments = fragments.filter(f =>
      f.narrative?.includes('technical') &&
      f.reasoning?.includes('effective')
    );
    if (technicalFragments.length > 2) {
      patterns.push({
        category: 'effective_phrasing',
        pattern: 'Technical responses are well-received when structured clearly',
        frequency: technicalFragments.length,
        examples: technicalFragments.slice(0, 2).map(f => f.reasoning || ''),
        recommendation: 'Continue providing technical depth with clear structure'
      });
    }

    // Pattern: User preferences for tone
    const conversationalFragments = fragments.filter(f =>
      f.narrative?.includes('conversational') ||
      f.narrative?.includes('friendly')
    );
    if (conversationalFragments.length > 1) {
      patterns.push({
        category: 'user_preference',
        pattern: 'Users prefer conversational, friendly tone',
        frequency: conversationalFragments.length,
        examples: conversationalFragments.slice(0, 2).map(f => f.narrative || ''),
        recommendation: 'Maintain conversational tone as default, with warmth in greetings'
      });
    }

    // Pattern: Problematic response areas
    const problemFragments = fragments.filter(f =>
      f.reasoning?.includes('avoid') ||
      f.reasoning?.includes('problem') ||
      f.reasoning?.includes('confusing')
    );
    if (problemFragments.length > 0) {
      patterns.push({
        category: 'problematic_area',
        pattern: 'Certain phrasing patterns cause confusion',
        frequency: problemFragments.length,
        examples: problemFragments.slice(0, 3).map(f => f.reasoning || ''),
        recommendation: 'Review and avoid identified problematic phrasing patterns'
      });
    }

    return patterns;
  }

  /**
   * Generate style recommendations based on patterns
   */
  private generateStyleRecommendations(
    patterns: LearningPattern[],
    fragments: any[]
  ): string[] {
    const recommendations: string[] = [];

    // Recommendation based on clarity issues
    const clarityPattern = patterns.find(p => p.category === 'clarity_issue');
    if (clarityPattern && clarityPattern.frequency > 2) {
      recommendations.push(
        'Prioritize simplicity: Start responses with clear, concise explanations before technical details'
      );
    }

    // Recommendation based on effective phrasing
    const effectivePattern = patterns.find(p => p.category === 'effective_phrasing');
    if (effectivePattern) {
      recommendations.push(
        'Maintain structured technical responses: Use bullet points and clear headings for complex topics'
      );
    }

    // Recommendation based on user preferences
    const preferencePattern = patterns.find(p => p.category === 'user_preference');
    if (preferencePattern) {
      recommendations.push(
        'Keep conversational tone: Balance friendliness with professionalism'
      );
    }

    // Recommendation based on problematic areas
    const problemPattern = patterns.find(p => p.category === 'problematic_area');
    if (problemPattern) {
      recommendations.push(
        'Avoid identified confusion triggers: Rephrase technical concepts that caused issues'
      );
    }

    // Default recommendation if no patterns detected
    if (recommendations.length === 0) {
      recommendations.push(
        'Continue current approach: No significant pattern changes detected'
      );
    }

    return recommendations;
  }

  /**
   * Calculate interaction metrics
   */
  private calculateMetrics(fragments: any[]): CognitiveSummaryReport['metrics'] {
    // Count positive vs negative interactions
    let positiveInteractions = 0;
    let negativeInteractions = 0;
    let totalResponseLength = 0;
    const topicsSet = new Set<string>();

    fragments.forEach(f => {
      // Detect sentiment from narrative and reasoning
      const narrative = f.narrative?.toLowerCase() || '';
      const reasoning = f.reasoning?.toLowerCase() || '';
      
      if (narrative.includes('effective') || reasoning.includes('positive') || reasoning.includes('helpful')) {
        positiveInteractions++;
      } else if (narrative.includes('confusing') || reasoning.includes('avoid') || reasoning.includes('problem')) {
        negativeInteractions++;
      }

      // Track response length (estimated from narrative)
      totalResponseLength += narrative.length;

      // Extract topics
      if (narrative.includes('portfolio')) topicsSet.add('Portfolio Management');
      if (narrative.includes('strategy') || narrative.includes('strategies')) topicsSet.add('Trading Strategies');
      if (narrative.includes('risk')) topicsSet.add('Risk Management');
      if (narrative.includes('trade') || narrative.includes('trading')) topicsSet.add('Trade Execution');
      if (narrative.includes('balance')) topicsSet.add('Account Balance');
    });

    return {
      positiveInteractions,
      negativeInteractions,
      averageResponseLength: fragments.length > 0 ? Math.round(totalResponseLength / fragments.length) : 0,
      topicsDiscussed: Array.from(topicsSet)
    };
  }

  /**
   * Get latest cognitive summary report
   */
  async getLatestReport(): Promise<CognitiveSummaryReport | null> {
    try {
      const summaries = await learningBob.getByCategory('default', 'paper', 'cognitive_summary', 10);
      
      if (summaries.length === 0) {
        return null;
      }

      // Get most recent summary (they're already sorted by timestamp desc)
      const latest = summaries[0];

      // Extract report from originalEventData
      const reportData = latest.originalEventData as any;
      if (!reportData || !reportData.report) {
        return null;
      }

      return reportData.report as CognitiveSummaryReport;
    } catch (error) {
      console.error(`[${this.MODULE_NAME}] Failed to retrieve latest report:`, error);
      return null;
    }
  }

  /**
   * Get learning cycle status
   */
  getStatus(): {
    isRunning: boolean;
    lastAnalysis: Date | null;
    nextAnalysis: Date | null;
  } {
    const nextAnalysis = this.lastAnalysisTime
      ? new Date(this.lastAnalysisTime.getTime() + this.ANALYSIS_INTERVAL_MS)
      : null;

    return {
      isRunning: this.intervalHandle !== null,
      lastAnalysis: this.lastAnalysisTime,
      nextAnalysis
    };
  }
}

// Export singleton instance with configurable interval (default 24 hours)
// Can be overridden via LEARNING_CYCLE_INTERVAL_HOURS environment variable
const intervalHours = parseInt(process.env.LEARNING_CYCLE_INTERVAL_HOURS || '24', 10);
export const learningCycleService = new LearningCycleService(intervalHours);
