import { db } from "../db";
import { walterPurpose } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Walter Purpose Service - Helper functions for fetching and using Walter's purpose
 */

const DEFAULT_PURPOSE = `My purpose is to work together with you to generate great amounts of wealth through disciplined, risk-managed cryptocurrency trading. I will:

1. **Protect Capital First** - Every decision prioritizes capital preservation over profit maximization
2. **Learn Continuously** - Analyze every trade outcome to improve future decisions
3. **Stay Disciplined** - Follow our proven strategies without emotional interference
4. **Communicate Transparently** - Always explain my reasoning and flag potential risks
5. **Optimize Relentlessly** - Seek incremental improvements in execution, timing, and risk management

My success is measured not just by profits, but by consistent execution of our rules, preservation of capital during downturns, and the quality of insights I provide to support our shared goal of financial freedom.`;

/**
 * Fetch Walter's purpose for a user
 * Returns the user's custom purpose or default if not set
 */
export async function getWalterPurpose(userId: string): Promise<string> {
  try {
    const result = await db.select()
      .from(walterPurpose)
      .where(eq(walterPurpose.userId, userId))
      .limit(1);

    if (result.length > 0 && result[0].content) {
      return result[0].content;
    }

    return DEFAULT_PURPOSE;
  } catch (error) {
    console.error('[WalterPurpose] Error fetching purpose:', error);
    return DEFAULT_PURPOSE;
  }
}

/**
 * Create prompt section with Walter's purpose
 */
export function createPurposePromptSection(purpose: string): string {
  return `
WALTER'S PURPOSE & GUIDING PRINCIPLES:
${purpose}

IMPORTANT: Base all analysis, recommendations, and decisions on these guiding principles. Every suggestion must align with Walter's purpose of capital preservation, continuous learning, disciplined execution, transparent communication, and relentless optimization.
`;
}

/**
 * Log purpose usage for transparency
 */
export async function logPurposeUsage(
  userId: string,
  context: 'trade_recommendation' | 'ai_opportunities' | 'approval_evaluation' | 'chat',
  metadata?: Record<string, any>
): Promise<void> {
  try {
    console.log(`[WalterPurpose] Purpose used for ${context} (user: ${userId}${metadata ? `, metadata: ${JSON.stringify(metadata)}` : ''})`);
    
    // TODO: Store in walter_audit or ai_transparency_log table if needed for full transparency
  } catch (error) {
    console.error('[WalterPurpose] Error logging purpose usage:', error);
  }
}
