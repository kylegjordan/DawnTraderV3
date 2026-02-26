/**
 * Phase 8.6.5 Enhancements - Consolidated Implementation
 * 
 * Tasks 3-9:
 * - Secure-Core Mode Toggle
 * - Learning Alignment Refit (BoB facts 0.9-1.0 vs Cortex insights 0.6-0.8)
 * - Paper→Live Knowledge Transfer with promotion criteria
 * - Enhanced feedback integration: Learning Bob → Cortex → Strategy Bob
 */

import { db } from '../db';
import { learningFragments } from '../../shared/schema';
import { eq, and, sql, desc } from 'drizzle-orm';
// Directive 12.2.3: cortexCore import removed (file deleted in Batch 7A)
// Directive 12.2.3: learningBob import removed (file deleted in Batch 7A)
import { createHash } from 'crypto';

// Task 3: Secure-Core Mode Configuration
export interface SecureCoreConfig {
  enabled: boolean;
  allowedDomains: ('Trading' | 'Governance' | 'Engineering' | 'Frontend' | 'General')[];
  restrictedOperations: string[];
  bypassUsers: string[]; // Users who can override
}

// Task 4: Learning Source Weights
export interface LearningSourceWeights {
  bobFacts: number; // 0.9-1.0 for authoritative data
  cortexInsights: number; // 0.6-0.8 for derived insights
  userInput: number; // 1.0 for explicit user preferences
  historicalPatterns: number; // 0.7-0.9 based on validation
}

// Task 8: Promotion Criteria
export interface PromotionCriteria {
  minOccurrences: number; // ≥5 default
  minConfidence: number; // ≥0.8 default
  requirePositiveExpectancy: boolean;
  excludeStrategies?: string[];
}

// Task 3: Secure-Core Mode Service
class SecureCoreService {
  private config: SecureCoreConfig = {
    enabled: false,
    allowedDomains: ['Trading', 'Governance'],
    restrictedOperations: ['system_config', 'user_management', 'deployment'],
    bypassUsers: [] // Empty by default, can be configured
  };

  /**
   * Enable Secure-Core Mode (Trading & Governance only)
   */
  enableSecureCore(userId?: string): { success: boolean; message: string } {
    this.config.enabled = true;
    
    console.log(`[SecureCore] 🔒 ENABLED - Only Trading & Governance domains accessible`);
    
    return {
      success: true,
      message: 'Secure-Core Mode activated. Walter restricted to Trading and Governance domains only.'
    };
  }

  /**
   * Disable Secure-Core Mode (Full cognitive access)
   */
  disableSecureCore(userId?: string): { success: boolean; message: string } {
    this.config.enabled = false;
    
    console.log(`[SecureCore] 🔓 DISABLED - Full cognitive mode restored`);
    
    return {
      success: true,
      message: 'Full Cognitive Mode activated. All knowledge domains accessible.'
    };
  }

  /**
   * Check if operation is allowed
   */
  isOperationAllowed(operation: string, domain: string, userId?: string): boolean {
    // Bypass users always allowed
    if (userId && this.config.bypassUsers.includes(userId)) {
      return true;
    }

    // If secure-core disabled, all allowed
    if (!this.config.enabled) {
      return true;
    }

    // Check domain restriction
    if (!this.config.allowedDomains.includes(domain as any)) {
      console.log(`[SecureCore] ❌ Domain '${domain}' blocked in Secure-Core mode`);
      return false;
    }

    // Check operation restriction
    if (this.config.restrictedOperations.includes(operation)) {
      console.log(`[SecureCore] ❌ Operation '${operation}' blocked in Secure-Core mode`);
      return false;
    }

    return true;
  }

  /**
   * Get current configuration
   */
  getConfig(): SecureCoreConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SecureCoreConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log(`[SecureCore] Configuration updated:`, this.config);
  }
}

// Task 4: Learning Alignment Service
class LearningAlignmentService {
  private weights: LearningSourceWeights = {
    bobFacts: 1.0, // Authoritative database facts
    cortexInsights: 0.7, // Derived insights from analysis
    userInput: 1.0, // Explicit user preferences
    historicalPatterns: 0.8 // Validated historical patterns
  };

  /**
   * Calculate weighted confidence for a learning insight
   */
  calculateWeightedConfidence(
    source: 'bob' | 'cortex' | 'user' | 'historical',
    baseConfidence: number
  ): number {
    const sourceWeights = {
      bob: this.weights.bobFacts,
      cortex: this.weights.cortexInsights,
      user: this.weights.userInput,
      historical: this.weights.historicalPatterns
    };

    const weight = sourceWeights[source] || 0.5;
    const weighted = baseConfidence * weight;

    console.log(
      `[LearningAlignment] Source: ${source}, Base: ${baseConfidence.toFixed(2)}, ` +
      `Weight: ${weight.toFixed(2)}, Weighted: ${weighted.toFixed(2)}`
    );

    return weighted;
  }

  /**
   * Validate source alignment with authoritative data
   */
  async validateSourceAlignment(
    insight: { source: string; data: any; mode: 'live' | 'paper' }
  ): Promise<{ aligned: boolean; confidence: number; recommendations: string[] }> {
    const recommendations: string[] = [];
    let confidence = 0.5;

    // BoB facts have highest confidence (0.9-1.0)
    if (insight.source.startsWith('BoB') || insight.source === 'ExecutionCore') {
      confidence = 0.95;
      recommendations.push('Authoritative source - high trust');
    }
    // Cortex insights have medium confidence (0.6-0.8)
    else if (insight.source.startsWith('Cortex')) {
      confidence = 0.7;
      recommendations.push('Derived insight - verify against BoB');
    }
    // User input has high confidence for preferences
    else if (insight.source === 'UserInput') {
      confidence = 1.0;
      recommendations.push('Direct user preference - highest priority');
    }
    // Historical patterns validated (0.7-0.9)
    else if (insight.source === 'Historical') {
      confidence = 0.8;
      recommendations.push('Historical pattern - good reliability');
    }

    return {
      aligned: confidence >= 0.6,
      confidence,
      recommendations
    };
  }

  /**
   * Get current weight configuration
   */
  getWeights(): LearningSourceWeights {
    return { ...this.weights };
  }

  /**
   * Update weights (for tuning)
   */
  updateWeights(updates: Partial<LearningSourceWeights>): void {
    this.weights = { ...this.weights, ...updates };
    console.log(`[LearningAlignment] Weights updated:`, this.weights);
  }
}

// Task 8: Paper→Live Knowledge Transfer Service
class PaperLiveTransferService {
  private promotionCriteria: PromotionCriteria = {
    minOccurrences: 5,
    minConfidence: 0.8,
    requirePositiveExpectancy: true,
    excludeStrategies: []
  };

  /**
   * Calculate lesson hash for cross-mode matching
   */
  private calculateLessonHash(lesson: {
    eventType: string;
    eventCategory?: string | null;
    narrative: string;
  }): string {
    const content = `${lesson.eventType}:${lesson.eventCategory || 'general'}:${lesson.narrative.substring(0, 100)}`;
    return createHash('md5').update(content).digest('hex');
  }

  /**
   * Find matching lessons across modes
   */
  async findCrossModeLessons(
    globalContextId: string,
    minOccurrences: number = 5
  ): Promise<Array<{
    lessonHash: string;
    paperOccurrences: number;
    liveOccurrences: number;
    avgConfidence: number;
    canPromote: boolean;
    reason?: string;
  }>> {
    console.log(`[PaperLiveTransfer] Finding cross-mode lessons (min: ${minOccurrences})`);

    // Get all paper fragments
    const paperFragments = await db.select()
      .from(learningFragments)
      .where(and(
        eq(learningFragments.globalContextId, globalContextId),
        eq(learningFragments.mode, 'paper')
      ))
      .orderBy(desc(learningFragments.timestamp))
      .limit(1000);

    // Get all live fragments
    const liveFragments = await db.select()
      .from(learningFragments)
      .where(and(
        eq(learningFragments.globalContextId, globalContextId),
        eq(learningFragments.mode, 'live')
      ))
      .orderBy(desc(learningFragments.timestamp))
      .limit(1000);

    // Group by lesson hash
    const lessonMap = new Map<string, {
      paperCount: number;
      liveCount: number;
      totalConfidence: number;
      count: number;
    }>();

    // Process paper fragments
    for (const fragment of paperFragments) {
      const hash = this.calculateLessonHash({
        eventType: fragment.eventType,
        eventCategory: fragment.eventCategory,
        narrative: fragment.narrative
      });

      const existing = lessonMap.get(hash) || { 
        paperCount: 0, 
        liveCount: 0, 
        totalConfidence: 0, 
        count: 0 
      };
      
      // Estimate confidence from significance
      const confidence = fragment.significance === 'critical' ? 0.9 
                       : fragment.significance === 'significant' ? 0.7 
                       : 0.5;
      
      existing.paperCount++;
      existing.totalConfidence += confidence;
      existing.count++;
      lessonMap.set(hash, existing);
    }

    // Process live fragments
    for (const fragment of liveFragments) {
      const hash = this.calculateLessonHash({
        eventType: fragment.eventType,
        eventCategory: fragment.eventCategory,
        narrative: fragment.narrative
      });

      const existing = lessonMap.get(hash);
      if (existing) {
        existing.liveCount++;
      }
    }

    // Build results
    const results = Array.from(lessonMap.entries()).map(([hash, data]) => {
      const avgConfidence = data.totalConfidence / data.count;
      const canPromote = 
        data.paperCount >= minOccurrences &&
        avgConfidence >= this.promotionCriteria.minConfidence &&
        data.liveCount === 0; // Not yet in live

      return {
        lessonHash: hash,
        paperOccurrences: data.paperCount,
        liveOccurrences: data.liveCount,
        avgConfidence,
        canPromote,
        reason: canPromote 
          ? 'Meets promotion criteria' 
          : data.paperCount < minOccurrences 
            ? `Need ${minOccurrences - data.paperCount} more occurrences`
            : avgConfidence < this.promotionCriteria.minConfidence
              ? `Confidence too low (${avgConfidence.toFixed(2)} < 0.8)`
              : 'Already in live mode'
      };
    });

    const promotable = results.filter(r => r.canPromote).length;
    console.log(`[PaperLiveTransfer] Found ${promotable} promotable lessons out of ${results.length} total`);

    return results;
  }

  /**
   * Promote paper learnings to live mode
   */
  async promoteLearnings(
    globalContextId: string,
    criteria?: Partial<PromotionCriteria>
  ): Promise<{
    promoted: number;
    skipped: number;
    details: Array<{ lessonHash: string; status: 'promoted' | 'skipped'; reason: string }>;
  }> {
    const effectiveCriteria = { ...this.promotionCriteria, ...criteria };
    
    console.log(`[PaperLiveTransfer] Starting promotion cycle with criteria:`, effectiveCriteria);

    const crossModeLessons = await this.findCrossModeLessons(
      globalContextId,
      effectiveCriteria.minOccurrences
    );

    const promotable = crossModeLessons.filter(l => l.canPromote);
    const results = {
      promoted: 0,
      skipped: 0,
      details: [] as Array<{ lessonHash: string; status: 'promoted' | 'skipped'; reason: string }>
    };

    for (const lesson of crossModeLessons) {
      if (lesson.canPromote) {
        // Directive 12.2.3: Cortex promotion metadata storage removed (file deleted in Batch 7A)

        results.promoted++;
        results.details.push({
          lessonHash: lesson.lessonHash,
          status: 'promoted',
          reason: `Promoted with ${lesson.paperOccurrences} occurrences, ${lesson.avgConfidence.toFixed(2)} confidence`
        });

        console.log(`[PaperLiveTransfer] ✅ Promoted: ${lesson.lessonHash.substring(0, 8)}`);
      } else {
        results.skipped++;
        results.details.push({
          lessonHash: lesson.lessonHash,
          status: 'skipped',
          reason: lesson.reason || 'Does not meet criteria'
        });
      }
    }

    console.log(
      `[PaperLiveTransfer] Promotion complete: ${results.promoted} promoted, ${results.skipped} skipped`
    );

    return results;
  }

  /**
   * Get promotion criteria
   */
  getCriteria(): PromotionCriteria {
    return { ...this.promotionCriteria };
  }

  /**
   * Update promotion criteria
   */
  updateCriteria(updates: Partial<PromotionCriteria>): void {
    this.promotionCriteria = { ...this.promotionCriteria, ...updates };
    console.log(`[PaperLiveTransfer] Criteria updated:`, this.promotionCriteria);
  }
}

// Task 9: Enhanced Feedback Integration Service
class FeedbackIntegrationService {
  /**
   * Aggregate learning insights into Pattern Reports
   */
  async aggregatePatternReports(
    globalContextId: string,
    mode: 'live' | 'paper'
  ): Promise<{
    totalPatterns: number;
    byCategory: Record<string, number>;
    highConfidencePatterns: number;
    recommendations: string[];
  }> {
    console.log(`[FeedbackIntegration] Aggregating patterns for ${mode} mode`);

    // Directive 12.2.3: learningBob.getStats() removed (file deleted in Batch 7A)
    const stats = { topCategories: [] as Array<{ category: string; count: number }> };

    const highConfidencePatterns = stats.topCategories
      .filter(cat => cat.count >= 3) // Recurring patterns
      .length;

    const recommendations: string[] = [];
    
    // Generate recommendations based on patterns
    for (const category of stats.topCategories.slice(0, 5)) {
      if (category.count >= 5) {
        recommendations.push(
          `Pattern "${category.category}" appears ${category.count} times - consider strategy adjustment`
        );
      }
    }

    const byCategory: Record<string, number> = {};
    stats.topCategories.forEach(cat => {
      byCategory[cat.category] = cat.count;
    });

    const result = {
      totalPatterns: stats.topCategories.length,
      byCategory,
      highConfidencePatterns,
      recommendations
    };

    // Directive 12.2.3: Cortex pattern report storage removed (file deleted in Batch 7A)

    console.log(
      `[FeedbackIntegration] Pattern report generated: ${result.totalPatterns} patterns, ` +
      `${result.highConfidencePatterns} high-confidence`
    );

    return result;
  }

  /**
   * Feed learnings into Strategy Bob for guardrail adjustments
   */
  async feedToStrategyGuardrails(
    globalContextId: string,
    mode: 'live' | 'paper'
  ): Promise<{
    guardrailsUpdated: number;
    adjustments: Array<{ strategy: string; adjustment: string; reason: string }>;
  }> {
    console.log(`[FeedbackIntegration] Feeding learnings to Strategy guardrails (${mode})`);

    const patternReport = await this.aggregatePatternReports(globalContextId, mode);
    const adjustments: Array<{ strategy: string; adjustment: string; reason: string }> = [];

    // Analyze patterns for guardrail adjustments
    for (const [category, count] of Object.entries(patternReport.byCategory)) {
      if (count >= 5) {
        // Example: if "stop_hit" appears frequently, tighten risk
        if (category.includes('stop') || category.includes('loss')) {
          adjustments.push({
            strategy: 'risk_management',
            adjustment: 'tighten_stop_loss',
            reason: `${count} stop-loss events detected`
          });
        }
        
        // Example: if "profit_target" appears frequently, optimize exits
        if (category.includes('target') || category.includes('profit')) {
          adjustments.push({
            strategy: 'exit_optimization',
            adjustment: 'review_profit_targets',
            reason: `${count} profit target events detected`
          });
        }
      }
    }

    // Directive 12.2.3: Cortex guardrail adjustments storage removed (file deleted in Batch 7A)

    console.log(`[FeedbackIntegration] ${adjustments.length} guardrail adjustments recommended`);

    return {
      guardrailsUpdated: adjustments.length,
      adjustments
    };
  }
}

// Export singleton instances
export const secureCoreService = new SecureCoreService();
export const learningAlignmentService = new LearningAlignmentService();
export const paperLiveTransferService = new PaperLiveTransferService();
export const feedbackIntegrationService = new FeedbackIntegrationService();
