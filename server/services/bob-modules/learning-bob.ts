/**
 * Phase 8.6.1: Learning Bob - Learning Fragment Management
 * 
 * Manages learning fragments from the cognitive interpreter:
 * - Stores fragments in database
 * - Caches recent fragments for quick access
 * - Provides analysis and retrieval capabilities
 * - Tracks learning patterns over time
 */

import { db } from "../../db";
import { learningFragments, type InsertLearningFragment, type LearningFragment } from "../../../shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";

export interface LearningFragmentStats {
  totalFragments: number;
  bySignificance: {
    minor: number;
    significant: number;
    critical: number;
  };
  byEventType: Record<string, number>;
  topCategories: Array<{ category: string; count: number }>;
  recentFragments: LearningFragment[];
}

/**
 * Learning Bob Module
 * Manages learning fragments with caching and analysis
 */
class LearningBobModule {
  /**
   * Store a learning fragment
   */
  async storeFragment(fragment: InsertLearningFragment): Promise<LearningFragment> {
    console.log(`[LearningBob] 💾 Storing fragment: ${fragment.eventType} (${fragment.significance})`);
    
    const [stored] = await db.insert(learningFragments)
      .values(fragment)
      .returning();
    
    console.log(`[LearningBob] ✅ Fragment stored: ${stored.id}`);
    return stored;
  }

  /**
   * Get learning fragment statistics
   */
  async getStats(globalContextId: string, mode: 'live' | 'paper'): Promise<LearningFragmentStats> {
    console.log(`[LearningBob] 📊 Fetching stats for ${globalContextId} (${mode})`);
    
    const fragments = await db.select()
      .from(learningFragments)
      .where(and(
        eq(learningFragments.globalContextId, globalContextId),
        eq(learningFragments.mode, mode)
      ))
      .orderBy(desc(learningFragments.timestamp))
      .limit(1000);

    // Calculate statistics
    const bySignificance = {
      minor: fragments.filter((f: LearningFragment) => f.significance === 'minor').length,
      significant: fragments.filter((f: LearningFragment) => f.significance === 'significant').length,
      critical: fragments.filter((f: LearningFragment) => f.significance === 'critical').length,
    };

    const byEventType: Record<string, number> = {};
    fragments.forEach((f: LearningFragment) => {
      byEventType[f.eventType] = (byEventType[f.eventType] || 0) + 1;
    });

    // Count categories
    const categoryCount: Record<string, number> = {};
    fragments.forEach((f: LearningFragment) => {
      if (f.eventCategory) {
        categoryCount[f.eventCategory] = (categoryCount[f.eventCategory] || 0) + 1;
      }
    });

    const topCategories = Object.entries(categoryCount)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const stats = {
      totalFragments: fragments.length,
      bySignificance,
      byEventType,
      topCategories,
      recentFragments: fragments.slice(0, 20), // Last 20 fragments
    };

    console.log(`[LearningBob] ✅ Stats generated: ${stats.totalFragments} fragments`);
    return stats;
  }

  /**
   * Get recent fragments by type
   */
  async getRecentByType(
    globalContextId: string,
    mode: 'live' | 'paper',
    eventType: string,
    limit: number = 50
  ): Promise<LearningFragment[]> {
    console.log(`[LearningBob] 🔍 Fetching recent ${eventType} fragments`);
    
    const fragments = await db.select()
      .from(learningFragments)
      .where(and(
        eq(learningFragments.globalContextId, globalContextId),
        eq(learningFragments.mode, mode),
        eq(learningFragments.eventType, eventType as any)
      ))
      .orderBy(desc(learningFragments.timestamp))
      .limit(limit);

    console.log(`[LearningBob] ✅ Found ${fragments.length} ${eventType} fragments`);
    return fragments;
  }

  /**
   * Get critical fragments (for urgent analysis)
   */
  async getCriticalFragments(
    globalContextId: string,
    mode: 'live' | 'paper',
    limit: number = 20
  ): Promise<LearningFragment[]> {
    console.log(`[LearningBob] 🚨 Fetching critical fragments`);
    
    const fragments = await db.select()
      .from(learningFragments)
      .where(and(
        eq(learningFragments.globalContextId, globalContextId),
        eq(learningFragments.mode, mode),
        eq(learningFragments.significance, 'critical')
      ))
      .orderBy(desc(learningFragments.timestamp))
      .limit(limit);

    console.log(`[LearningBob] ✅ Found ${fragments.length} critical fragments`);
    return fragments;
  }

  /**
   * Get fragments by category for pattern analysis
   */
  async getByCategory(
    globalContextId: string,
    mode: 'live' | 'paper',
    category: string,
    limit: number = 50
  ): Promise<LearningFragment[]> {
    console.log(`[LearningBob] 📂 Fetching fragments for category: ${category}`);
    
    const fragments = await db.select()
      .from(learningFragments)
      .where(and(
        eq(learningFragments.globalContextId, globalContextId),
        eq(learningFragments.mode, mode),
        eq(learningFragments.eventCategory, category)
      ))
      .orderBy(desc(learningFragments.timestamp))
      .limit(limit);

    console.log(`[LearningBob] ✅ Found ${fragments.length} fragments in category ${category}`);
    return fragments;
  }

  /**
   * Mark fragment as analyzed
   */
  async markAnalyzed(fragmentId: string): Promise<void> {
    console.log(`[LearningBob] ✓ Marking fragment ${fragmentId} as analyzed`);
    
    await db.update(learningFragments)
      .set({ analyzedAt: new Date() })
      .where(eq(learningFragments.id, fragmentId));
    
    console.log(`[LearningBob] ✅ Fragment ${fragmentId} marked as analyzed`);
  }

  /**
   * Get unanalyzed fragments for learning cycle
   */
  async getUnanalyzed(
    globalContextId: string,
    mode: 'live' | 'paper',
    limit: number = 100
  ): Promise<LearningFragment[]> {
    console.log(`[LearningBob] 🔄 Fetching unanalyzed fragments`);
    
    const fragments = await db.select()
      .from(learningFragments)
      .where(and(
        eq(learningFragments.globalContextId, globalContextId),
        eq(learningFragments.mode, mode),
        sql`${learningFragments.analyzedAt} IS NULL`
      ))
      .orderBy(desc(learningFragments.timestamp))
      .limit(limit);

    console.log(`[LearningBob] ✅ Found ${fragments.length} unanalyzed fragments`);
    return fragments;
  }
}

// Export singleton instance
export const learningBob = new LearningBobModule();

/**
 * Bob Core fetch functions for caching layer
 */

export async function fetchLearningStats(context: { globalContextId: string; mode: 'live' | 'paper' }): Promise<LearningFragmentStats> {
  return learningBob.getStats(context.globalContextId, context.mode);
}

export async function fetchCriticalFragments(context: { globalContextId: string; mode: 'live' | 'paper' }): Promise<LearningFragment[]> {
  return learningBob.getCriticalFragments(context.globalContextId, context.mode, 20);
}
