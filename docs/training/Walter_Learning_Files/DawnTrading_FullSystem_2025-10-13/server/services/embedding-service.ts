import OpenAI from "openai";

/**
 * Embedding Service
 * Milestone 15: Generates vector embeddings using OpenAI's text-embedding-3-small model
 * 
 * Features:
 * - Batch embedding generation (≤100 records per batch)
 * - Retry logic (3 attempts) for API failures
 * - Cost tracking and logging
 */
export class EmbeddingService {
  private openai: OpenAI;
  private readonly MODEL = "text-embedding-3-small";
  private readonly DIMENSIONS = 1536;
  private readonly MAX_BATCH_SIZE = 100;
  private readonly MAX_RETRIES = 3;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  /**
   * Generate embeddings for a single text input
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0];
  }

  /**
   * Generate embeddings for multiple text inputs (batched)
   * Automatically splits into batches of MAX_BATCH_SIZE
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Split into batches
    const batches: string[][] = [];
    for (let i = 0; i < texts.length; i += this.MAX_BATCH_SIZE) {
      batches.push(texts.slice(i, i + this.MAX_BATCH_SIZE));
    }

    const allEmbeddings: number[][] = [];

    for (const batch of batches) {
      const batchEmbeddings = await this.generateBatchWithRetry(batch);
      allEmbeddings.push(...batchEmbeddings);
    }

    return allEmbeddings;
  }

  /**
   * Generate embeddings with retry logic
   */
  private async generateBatchWithRetry(texts: string[]): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        const response = await this.openai.embeddings.create({
          model: this.MODEL,
          input: texts,
          dimensions: this.DIMENSIONS,
        });

        // Extract embeddings in the same order as input
        const embeddings = response.data.map(item => item.embedding);

        console.log(
          `[EmbeddingService] Generated ${embeddings.length} embeddings ` +
          `(${response.usage.total_tokens} tokens, attempt ${attempt}/${this.MAX_RETRIES})`
        );

        return embeddings;
      } catch (error) {
        lastError = error as Error;
        console.error(
          `[EmbeddingService] Attempt ${attempt}/${this.MAX_RETRIES} failed:`,
          error
        );

        // Wait before retry (exponential backoff)
        if (attempt < this.MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw new Error(
      `Failed to generate embeddings after ${this.MAX_RETRIES} attempts: ${lastError?.message}`
    );
  }

  /**
   * Calculate estimated cost for embedding generation
   * text-embedding-3-small: $0.00002 per 1K tokens
   */
  calculateEstimatedCost(tokenCount: number): number {
    return (tokenCount / 1000) * 0.00002;
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
