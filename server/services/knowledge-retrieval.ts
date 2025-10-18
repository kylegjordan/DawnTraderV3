import { db } from "../db";
import {
  knowledgeRetrievalLog,
  knowledgeCache,
  knowledgeTrustRecord,
  type KnowledgeSource,
  type RetrievalTrustLevel,
  type InsertKnowledgeRetrievalLog,
  type InsertKnowledgeCache,
} from "@shared/schema";
import { eq, sql, and, desc } from "drizzle-orm";
import crypto from "crypto";

/**
 * Phase 16.0: KnowledgeRetrievalService
 * 
 * Safe, policy-bound web intelligence retrieval with:
 * - Sandboxed web queries
 * - Trust scoring based on domain reputation
 * - Query caching and logging
 * - No arbitrary URL access - only through approved flow
 */
export class KnowledgeRetrievalService {
  /**
   * Query web for information (sandboxed)
   * Note: This is a template method - actual web_search/web_fetch would be called by routes
   */
  async queryWeb(
    query: string,
    userId: string,
    source: KnowledgeSource = "web"
  ): Promise<{
    data: string;
    trustLevel: RetrievalTrustLevel;
    relevanceScore: number;
    url?: string;
  }> {
    const queryHash = this.generateQueryHash(query);
    
    // Check cache first
    const cached = await this.getCachedQuery(queryHash);
    if (cached && new Date(cached.expiresAt) > new Date()) {
      await this.updateCacheHitCount(cached.id);
      return {
        data: cached.cachedData,
        trustLevel: cached.trustLevel,
        relevanceScore: cached.relevanceScore || 0.8,
        url: cached.metadata?.url as string | undefined,
      };
    }
    
    // Placeholder for actual retrieval - would integrate with web_search/web_fetch
    // In production, this would call external APIs or search engines
    const retrievedData = `Retrieved data for: ${query}`;
    const url = `https://example.com/search?q=${encodeURIComponent(query)}`;
    const trustLevel = await this.scoreTrust(url);
    const relevanceScore = 0.75;
    
    // Store in cache
    await this.cacheQuery(query, queryHash, retrievedData, source, trustLevel, relevanceScore, url);
    
    // Record retrieval
    await this.recordRetrieval(userId, query, source, url, trustLevel, relevanceScore, retrievedData);
    
    return { data: retrievedData, trustLevel, relevanceScore, url };
  }

  /**
   * Parse and store retrieved data
   */
  async parseAndStore(
    rawData: string,
    metadata: Record<string, any>
  ): Promise<{ extractedText: string; summary: string }> {
    // Simple text extraction - in production would use proper HTML parsing
    const extractedText = rawData.substring(0, 5000); // Limit size
    
    // Generate summary (first 200 chars)
    const summary = extractedText.length > 200 
      ? extractedText.substring(0, 200) + "..."
      : extractedText;
    
    return { extractedText, summary };
  }

  /**
   * Score trust level based on domain reputation
   */
  async scoreTrust(url?: string): Promise<RetrievalTrustLevel> {
    if (!url) {
      return "low";
    }
    
    try {
      const domain = new URL(url).hostname;
      
      // Check existing trust records
      const trustRecord = await db
        .select()
        .from(knowledgeTrustRecord)
        .where(eq(knowledgeTrustRecord.domain, domain))
        .limit(1);
      
      if (trustRecord.length > 0) {
        return trustRecord[0].trustLevel;
      }
      
      // Default trust scoring based on domain characteristics
      const trustedDomains = [
        'wikipedia.org',
        'reuters.com',
        'bbc.com',
        'bloomberg.com',
        'coindesk.com',
        'cointelegraph.com',
        'github.com',
        'stackexchange.com',
        'stackoverflow.com',
        'arxiv.org',
        'nature.com',
        'science.org',
      ];
      
      const mediumTrustDomains = [
        'medium.com',
        'dev.to',
        'reddit.com',
        'twitter.com',
        'x.com',
      ];
      
      const domainLower = domain.toLowerCase();
      
      if (trustedDomains.some(td => domainLower.includes(td))) {
        await this.createTrustRecord(domain, "high");
        return "high";
      }
      
      if (mediumTrustDomains.some(md => domainLower.includes(md))) {
        await this.createTrustRecord(domain, "medium");
        return "medium";
      }
      
      // Default to low trust for unknown domains
      await this.createTrustRecord(domain, "low");
      return "low";
    } catch (error) {
      return "low";
    }
  }

  /**
   * Record retrieval in log
   */
  async recordRetrieval(
    userId: string,
    query: string,
    source: KnowledgeSource,
    url: string | undefined,
    trustLevel: RetrievalTrustLevel,
    relevanceScore: number,
    retrievedData: string
  ): Promise<void> {
    await db.insert(knowledgeRetrievalLog).values({
      userId,
      query,
      source,
      url,
      trustLevel,
      relevanceScore,
      retrievedData: retrievedData.substring(0, 10000), // Limit storage
      metadata: { timestamp: new Date().toISOString() },
    });
    
    // Update trust record stats if domain exists
    if (url) {
      try {
        const domain = new URL(url).hostname;
        await this.updateTrustStats(domain, true, relevanceScore);
      } catch (error) {
        // Invalid URL, skip trust update
      }
    }
  }

  /**
   * Generate query hash for caching
   */
  private generateQueryHash(query: string): string {
    return crypto.createHash('sha256').update(query.toLowerCase()).digest('hex');
  }

  /**
   * Get cached query result
   */
  private async getCachedQuery(queryHash: string) {
    const results = await db
      .select()
      .from(knowledgeCache)
      .where(eq(knowledgeCache.queryHash, queryHash))
      .limit(1);
    
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Cache query result
   */
  private async cacheQuery(
    query: string,
    queryHash: string,
    data: string,
    source: KnowledgeSource,
    trustLevel: RetrievalTrustLevel,
    relevanceScore: number,
    url?: string
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
    
    await db
      .insert(knowledgeCache)
      .values({
        queryHash,
        query,
        source,
        cachedData: data.substring(0, 10000),
        trustLevel,
        relevanceScore,
        expiresAt,
        metadata: { url },
      })
      .onConflictDoUpdate({
        target: knowledgeCache.queryHash,
        set: {
          cachedData: data.substring(0, 10000),
          trustLevel,
          relevanceScore,
          expiresAt,
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Update cache hit count
   */
  private async updateCacheHitCount(cacheId: string): Promise<void> {
    await db
      .update(knowledgeCache)
      .set({ 
        hitCount: sql`${knowledgeCache.hitCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeCache.id, cacheId));
  }

  /**
   * Create trust record for domain
   */
  private async createTrustRecord(
    domain: string,
    trustLevel: RetrievalTrustLevel
  ): Promise<void> {
    try {
      await db.insert(knowledgeTrustRecord).values({
        domain,
        trustLevel,
        verificationMethod: "auto_scoring",
        metadata: { createdBy: "knowledge_retrieval_service" },
      });
    } catch (error) {
      // Domain may already exist, ignore conflict
    }
  }

  /**
   * Update trust record statistics
   */
  private async updateTrustStats(
    domain: string,
    success: boolean,
    relevanceScore?: number
  ): Promise<void> {
    const existing = await db
      .select()
      .from(knowledgeTrustRecord)
      .where(eq(knowledgeTrustRecord.domain, domain))
      .limit(1);
    
    if (existing.length === 0) return;
    
    const record = existing[0];
    const newSuccessCount = success ? record.successfulRetrievals + 1 : record.successfulRetrievals;
    const newFailCount = success ? record.failedRetrievals : record.failedRetrievals + 1;
    
    // Update average relevance if provided
    let newAvgRelevance = record.averageRelevance || 0;
    if (success && relevanceScore !== undefined) {
      const totalRetrievals = newSuccessCount + newFailCount;
      newAvgRelevance = ((record.averageRelevance || 0) * (totalRetrievals - 1) + relevanceScore) / totalRetrievals;
    }
    
    await db
      .update(knowledgeTrustRecord)
      .set({
        successfulRetrievals: newSuccessCount,
        failedRetrievals: newFailCount,
        averageRelevance: newAvgRelevance,
        updatedAt: new Date(),
      })
      .where(eq(knowledgeTrustRecord.domain, domain));
  }

  /**
   * Get recent retrievals for user
   */
  async getRecentRetrievals(userId: string, limit: number = 10) {
    return await db
      .select()
      .from(knowledgeRetrievalLog)
      .where(eq(knowledgeRetrievalLog.userId, userId))
      .orderBy(desc(knowledgeRetrievalLog.createdAt))
      .limit(limit);
  }

  /**
   * Get all trusted domains
   */
  async getTrustedDomains() {
    return await db
      .select()
      .from(knowledgeTrustRecord)
      .orderBy(desc(knowledgeTrustRecord.trustLevel));
  }

  /**
   * Refresh cache by removing expired entries
   */
  async refreshCache(): Promise<number> {
    const result = await db
      .delete(knowledgeCache)
      .where(sql`${knowledgeCache.expiresAt} < NOW()`);
    
    return result.rowCount || 0;
  }

  /**
   * Audit trust levels - re-evaluate domain trustworthiness
   */
  async auditTrust(): Promise<void> {
    const allRecords = await db.select().from(knowledgeTrustRecord);
    
    for (const record of allRecords) {
      // Downgrade trust if failure rate is high
      const totalRetrievals = record.successfulRetrievals + record.failedRetrievals;
      if (totalRetrievals > 10) {
        const successRate = record.successfulRetrievals / totalRetrievals;
        
        let newTrustLevel: RetrievalTrustLevel = record.trustLevel;
        
        if (successRate < 0.5 && record.trustLevel !== "low") {
          newTrustLevel = "low";
        } else if (successRate >= 0.8 && record.trustLevel === "low") {
          newTrustLevel = "medium";
        } else if (successRate >= 0.95 && record.trustLevel === "medium") {
          newTrustLevel = "high";
        }
        
        if (newTrustLevel !== record.trustLevel) {
          await db
            .update(knowledgeTrustRecord)
            .set({ 
              trustLevel: newTrustLevel,
              lastAuditDate: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(knowledgeTrustRecord.id, record.id));
        }
      }
    }
  }
}

export const knowledgeRetrievalService = new KnowledgeRetrievalService();
