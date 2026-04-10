import OpenAI from "openai";
import { db } from "../db";
import { knowledgeRetrievalLog } from "@shared/schema";
import { eq, sql, desc, and } from "drizzle-orm";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Phase 16.0: SemanticCorrelationEngine
 * 
 * Semantic analysis and knowledge graph correlation:
 * - Text embedding generation (OpenAI)
 * - Knowledge graph relationship detection
 * - Relevance scoring for retrieved information
 */
export class SemanticCorrelationEngine {
  /**
   * Generate embeddings for text using OpenAI
   */
  async embedText(text: string): Promise<number[]> {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text.substring(0, 8000), // Limit input size
      });
      
      return response.data[0].embedding;
    } catch (error) {
      console.error("Embedding generation failed:", error);
      // Return zero vector as fallback
      return new Array(1536).fill(0);
    }
  }



  /**
   * Compute relevance score between query and retrieved data
   */
  async computeRelevanceScore(query: string, retrievedData: string): Promise<number> {
    // Extract keywords from query and data
    const queryKeywords = this.extractKeywords(query);
    const dataKeywords = this.extractKeywords(retrievedData);
    
    // Compute keyword overlap
    const overlap = queryKeywords.filter(qk => 
      dataKeywords.some(dk => dk.toLowerCase() === qk.toLowerCase())
    ).length;
    
    const keywordScore = overlap / Math.max(queryKeywords.length, 1);
    
    // Length penalty for very short or very long responses
    const dataLength = retrievedData.length;
    const lengthScore = dataLength >= 100 && dataLength <= 5000 ? 1.0 :
                       dataLength < 100 ? dataLength / 100 :
                       5000 / dataLength;
    
    // Combined score
    const relevanceScore = (keywordScore * 0.7) + (lengthScore * 0.3);
    
    return Math.min(1.0, relevanceScore);
  }

  /**
   * Compute semantic similarity between two text embeddings
   */
  computeSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) {
      return 0;
    }
    
    // Cosine similarity
    let dotProduct = 0;
    let mag1 = 0;
    let mag2 = 0;
    
    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      mag1 += embedding1[i] * embedding1[i];
      mag2 += embedding2[i] * embedding2[i];
    }
    
    const magnitude = Math.sqrt(mag1) * Math.sqrt(mag2);
    
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    // Remove common stop words
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
      'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
      'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that',
      'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
    ]);
    
    // Extract words (alphanumeric + hyphen)
    const words = text.toLowerCase()
      .match(/\b[a-z0-9-]+\b/g) || [];
    
    // Filter stop words and short words
    const keywords = words.filter(word => 
      !stopWords.has(word) && word.length > 2
    );
    
    // Get unique keywords
    return [...new Set(keywords)];
  }

  /**
   * Generate suggested knowledge links
   */
  private generateSuggestedLinks(data: string, relatedMemories: any[]): string[] {
    const suggestions: string[] = [];
    
    // Suggest links based on related memories
    if (relatedMemories.length > 0) {
      suggestions.push(`Related to ${relatedMemories.length} existing memories`);
    }
    
    // Detect potential action items
    const actionWords = ['should', 'must', 'need to', 'have to', 'require', 'recommend'];
    if (actionWords.some(word => data.toLowerCase().includes(word))) {
      suggestions.push('Contains actionable recommendations');
    }
    
    // Detect temporal information
    if (/\d{4}/.test(data) || data.includes('today') || data.includes('recent')) {
      suggestions.push('Contains time-sensitive information');
    }
    
    // Detect quantitative data
    if (/\d+\.\d+|\d{1,3}(,\d{3})*|\d+%/.test(data)) {
      suggestions.push('Contains quantitative metrics');
    }
    
    return suggestions;
  }

  /**
   * Assess knowledge gap - determine if external retrieval is needed
   */
  async assessKnowledgeGap(
    query: string,
    userId: string,
    threshold: number = 0.3
  ): Promise<{ hasGap: boolean; confidence: number; reason: string }> {
    // Check recent retrievals
    const recentRetrievals = await db
      .select()
      .from(knowledgeRetrievalLog)
      .where(eq(knowledgeRetrievalLog.userId, userId))
      .orderBy(desc(knowledgeRetrievalLog.createdAt))
      .limit(20);

    // Simple keyword matching to assess if knowledge exists
    const queryKeywords = this.extractKeywords(query);

    let retrievalMatches = 0;
    for (const retrieval of recentRetrievals) {
      const data = retrieval.retrievedData || "";
      const matches = queryKeywords.filter(kw =>
        data.toLowerCase().includes(kw.toLowerCase())
      ).length;
      retrievalMatches += matches;
    }

    const confidence = Math.min(1.0, retrievalMatches / (queryKeywords.length * 3));

    const hasGap = confidence < threshold;

    const reason = hasGap
      ? `Low knowledge confidence (${(confidence * 100).toFixed(1)}%) - external retrieval recommended`
      : `Sufficient knowledge exists (${(confidence * 100).toFixed(1)}%) - retrieval may not be needed`;

    return { hasGap, confidence, reason };
  }
}

export const semanticCorrelationEngine = new SemanticCorrelationEngine();
