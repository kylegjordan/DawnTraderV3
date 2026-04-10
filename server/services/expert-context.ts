/**
 * Expert Context Service - Phase 5.8
 * 
 * Selects and injects relevant trading principles into system responses
 * based on conversation context and topic.
 */

import { db } from '../db';
import { 
  expertPrinciples, 
  expertSources,
  expertResponseLogs,
  type ExpertPrinciple 
} from '@shared/schema';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';

export interface PrincipleContext {
  principleId: string;
  principle: string;
  category: string;
  source: string;
  author: string;
  credibilityScore: number;
}

export interface ExpertContextOptions {
  userId: string;
  topic?: string;
  categories?: string[];
  maxPrinciples?: number;
  chatId?: string; // Changed from chatLogId to chatId
}

export class ExpertContextService {
  private principlesCache: Map<string, ExpertPrinciple[]> = new Map();
  private cacheExpiry: number = 60 * 60 * 1000; // 1 hour
  private lastCacheUpdate: number = 0;

  /**
   * Get relevant expert principles based on conversation context
   */
  async getRelevantPrinciples(options: ExpertContextOptions): Promise<PrincipleContext[]> {
    const { 
      userId, 
      topic, 
      categories = [], 
      maxPrinciples = 5 
    } = options;

    // Determine relevant categories based on topic
    const relevantCategories = this.determineCategories(topic, categories);

    // Load principles from database (with caching)
    const principles = await this.loadPrinciples(relevantCategories);

    // Select best principles based on relevance and usage
    const selected = this.selectBestPrinciples(principles, topic || '', maxPrinciples);

    // Format for injection
    const formatted = selected.map(p => ({
      principleId: p.id,
      principle: p.principle,
      category: p.category,
      source: p.sourceName,
      author: p.sourceAuthor,
      credibilityScore: p.credibilityScore
    }));

    // Log principle usage
    if (options.chatId) {
      await this.logPrincipleUsage(userId, options.chatId, formatted);
    }

    // Update usage counts
    await this.incrementUsageCount(selected.map(p => p.id));

    return formatted;
  }

  /**
   * Determine relevant categories based on conversation topic
   */
  private determineCategories(topic?: string, requestedCategories: string[] = []): string[] {
    // If specific categories requested, use them
    if (requestedCategories.length > 0) {
      return requestedCategories;
    }

    if (!topic) {
      // Default: mix of all categories
      return ['psychology', 'risk_management', 'market_structure', 'trade_execution'];
    }

    const topicLower = topic.toLowerCase();
    const categories: string[] = [];

    // Psychology keywords
    if (topicLower.match(/emotion|fear|greed|discipline|patience|mistake|loss|revenge|overconfid/)) {
      categories.push('psychology');
    }

    // Risk management keywords
    if (topicLower.match(/risk|stop|position.?size|exposure|drawdown|loss|protect|safe/)) {
      categories.push('risk_management');
    }

    // Market structure keywords
    if (topicLower.match(/trend|support|resistance|break|volume|pattern|setup|strateg/)) {
      categories.push('market_structure');
    }

    // Trade execution keywords
    if (topicLower.match(/entry|exit|trade|execution|order|plan|journal|review/)) {
      categories.push('trade_execution');
    }

    // If no matches, return all categories
    return categories.length > 0 ? categories : [
      'psychology', 
      'risk_management', 
      'market_structure', 
      'trade_execution'
    ];
  }

  /**
   * Load principles from database with caching
   */
  private async loadPrinciples(categories: string[]): Promise<ExpertPrinciple[]> {
    const cacheKey = categories.sort().join(',');
    const now = Date.now();

    // Check cache
    if (
      this.principlesCache.has(cacheKey) && 
      (now - this.lastCacheUpdate) < this.cacheExpiry
    ) {
      return this.principlesCache.get(cacheKey)!;
    }

    // Load from database using inArray for SQL injection safety
    const principles = await db
      .select()
      .from(expertPrinciples)
      .where(
        and(
          eq(expertPrinciples.isActive, true),
          inArray(expertPrinciples.category, categories)
        )
      )
      .orderBy(desc(expertPrinciples.credibilityScore));

    // Update cache
    this.principlesCache.set(cacheKey, principles);
    this.lastCacheUpdate = now;

    return principles;
  }

  /**
   * Select best principles based on relevance, credibility, and usage balance
   * ENSURES at least one principle from each category for diversity
   */
  private selectBestPrinciples(
    principles: ExpertPrinciple[], 
    topic: string, 
    maxCount: number
  ): ExpertPrinciple[] {
    if (principles.length === 0) return [];
    if (principles.length <= maxCount) return principles;

    // Group principles by category
    const byCategory = new Map<string, ExpertPrinciple[]>();
    principles.forEach(p => {
      if (!byCategory.has(p.category)) {
        byCategory.set(p.category, []);
      }
      byCategory.get(p.category)!.push(p);
    });

    // Score all principles
    const scored = principles.map(p => ({
      principle: p,
      score: this.calculateRelevanceScore(p, topic)
    }));

    // Sort by score within each category
    scored.sort((a, b) => b.score - a.score);

    const selected: ExpertPrinciple[] = [];
    const categoriesUsed = new Set<string>();

    // Phase 1: Select best principle from each category (ensures diversity)
    for (const [category, categoryPrinciples] of byCategory.entries()) {
      if (selected.length >= maxCount) break;
      
      // Find highest scored principle in this category
      const best = scored.find(s => s.principle.category === category && !selected.includes(s.principle));
      if (best) {
        selected.push(best.principle);
        categoriesUsed.add(category);
      }
    }

    // Phase 2: Fill remaining slots with highest scoring principles
    for (const item of scored) {
      if (selected.length >= maxCount) break;
      
      if (!selected.includes(item.principle)) {
        selected.push(item.principle);
      }
    }

    return selected;
  }

  /**
   * Calculate relevance score for a principle
   */
  private calculateRelevanceScore(principle: ExpertPrinciple, topic: string): number {
    let score = 0;

    // Base score from credibility (0-50 points)
    score += (principle.credibilityScore || 4) * 10;

    // Bonus for low usage count (favor underused principles) (0-20 points)
    const usageCount = principle.usageCount || 0;
    if (usageCount === 0) score += 20;
    else if (usageCount < 5) score += 15;
    else if (usageCount < 10) score += 10;
    else if (usageCount < 20) score += 5;

    // Bonus for keyword matching (0-30 points)
    if (topic) {
      const topicLower = topic.toLowerCase();
      const principleLower = principle.principle.toLowerCase();

      // Extract key words from topic (ignore common words)
      const commonWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'is', 'are', 'was', 'were']);
      const topicWords = topicLower.split(/\W+/).filter(w => w.length > 3 && !commonWords.has(w));

      const matchCount = topicWords.filter(word => principleLower.includes(word)).length;
      score += Math.min(matchCount * 10, 30);
    }

    return score;
  }

  /**
   * Log principle usage for tracking and analytics
   */
  private async logPrincipleUsage(
    userId: string, 
    chatId: string, 
    principles: PrincipleContext[]
  ): Promise<void> {
    try {
      await db.insert(expertResponseLogs).values({
        userId,
        chatId,
        chatLogId: null, // Optional - could be set if we had message ID
        principlesInjected: principles,
        expertContextUsed: true,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('[ExpertContext] Failed to log principle usage:', error);
    }
  }

  /**
   * Increment usage count for selected principles
   */
  private async incrementUsageCount(principleIds: string[]): Promise<void> {
    try {
      for (const id of principleIds) {
        await db
          .update(expertPrinciples)
          .set({ 
            usageCount: sql`${expertPrinciples.usageCount} + 1` 
          })
          .where(eq(expertPrinciples.id, id));
      }
    } catch (error) {
      console.error('[ExpertContext] Failed to increment usage count:', error);
    }
  }

  /**
   * Format principles for prompt injection
   */
  formatForPrompt(principles: PrincipleContext[]): string {
    if (principles.length === 0) {
      return '';
    }

    const formatted = principles.map((p, index) => 
      `${index + 1}. **${p.category.replace(/_/g, ' ').toUpperCase()}**: "${p.principle}" (${p.author}, ${p.source})`
    ).join('\n');

    return `\n## Expert Trading Principles\n\nReference these expert principles in your response when relevant:\n\n${formatted}\n`;
  }

  /**
   * Get category distribution for compliance reporting
   */
  async getCategoryDistribution(userId: string, dateFrom: Date, dateTo: Date): Promise<Record<string, number>> {
    const logs = await db
      .select()
      .from(expertResponseLogs)
      .where(
        and(
          eq(expertResponseLogs.userId, userId),
          sql`${expertResponseLogs.timestamp} BETWEEN ${dateFrom} AND ${dateTo}`
        )
      );

    const distribution: Record<string, number> = {
      psychology: 0,
      risk_management: 0,
      market_structure: 0,
      trade_execution: 0
    };

    logs.forEach((log: any) => {
      const principles = log.principlesInjected as PrincipleContext[];
      principles.forEach(p => {
        if (distribution[p.category] !== undefined) {
          distribution[p.category]++;
        }
      });
    });

    return distribution;
  }

  /**
   * Get expert adherence rate (% of responses that used expert context)
   */
  async getAdherenceRate(userId: string, dateFrom: Date, dateTo: Date): Promise<number> {
    const result = await db
      .select({
        total: sql<number>`COUNT(*)`,
        withExpert: sql<number>`SUM(CASE WHEN ${expertResponseLogs.expertContextUsed} = true THEN 1 ELSE 0 END)`
      })
      .from(expertResponseLogs)
      .where(
        and(
          eq(expertResponseLogs.userId, userId),
          sql`${expertResponseLogs.timestamp} BETWEEN ${dateFrom} AND ${dateTo}`
        )
      );

    if (!result[0] || result[0].total === 0) return 0;

    return (result[0].withExpert / result[0].total) * 100;
  }

  /**
   * Clear cache (useful for testing or after corpus updates)
   */
  clearCache(): void {
    this.principlesCache.clear();
    this.lastCacheUpdate = 0;
  }
}

// Export singleton instance
export const expertContextService = new ExpertContextService();
