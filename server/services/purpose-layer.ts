/**
 * Phase 8.6.5 - Purpose Layer Reintegration
 * 
 * Restores system.purpose semantic node in Walter Memory
 * and mirrors it to Cortex.CoreValues.Purpose with provenance tracking
 */

import { cortexCore } from './cortex/cortex-core';
import { db } from '../db';
import { walterPurpose } from '@shared/schema';
import { provenanceLogger } from './provenance-logger';
import { nanoid } from 'nanoid';
import { eq, and } from 'drizzle-orm';

const PURPOSE_MEMORY_KEY = 'system.purpose';
const PURPOSE_CORTEX_KEY = 'CoreValues.Purpose';
const PURPOSE_PROVENANCE_TAG = 'meta/purpose';

interface PurposeNode {
  content: string;
  mode: 'live' | 'paper';
  userId: string;
  readonly: true;
  provenance: string;
  loadedAt: Date;
}

class PurposeLayerService {
  private purposeCache: Map<string, PurposeNode> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize purpose layer on server startup
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      console.log('[PurposeLayer] Initializing purpose nodes...');
      
      // Load all purposes from database
      const purposes = await db.select().from(walterPurpose);
      
      if (!purposes || purposes.length === 0) {
        console.log('[PurposeLayer] ⚠️ No purposes found in database');
        return;
      }

      // Create purpose nodes for each user/mode
      for (const purpose of purposes) {
        const purposeNode: PurposeNode = {
          content: purpose.content,
          mode: purpose.mode,
          userId: purpose.userId,
          readonly: true,
          provenance: PURPOSE_PROVENANCE_TAG,
          loadedAt: new Date()
        };

        // Store in memory cache
        const cacheKey = `${purpose.userId}:${purpose.mode}`;
        this.purposeCache.set(cacheKey, purposeNode);

        // Mirror to Cortex with long-term TTL (24 hours) and provenance
        const cortexKey = `${PURPOSE_CORTEX_KEY}:${purpose.userId}:${purpose.mode}`;
        
        // Generate traceId for purpose loading
        const traceId = nanoid();
        await provenanceLogger.logLineage({
          traceId,
          originatingService: 'walter',
          targetService: 'cortex',
          sourceTable: 'walter_purpose',
          mode: purpose.mode,
          operation: 'read',
          metadata: { purposeLength: purpose.content.length }
        });

        cortexCore.set(
          cortexKey,
          purposeNode,
          86400, // 24 hour TTL
          {
            traceId,
            mode: purpose.mode,
            sourceTable: 'walter_purpose'
          }
        );

        console.log(`[PurposeLayer] ✅ Purpose node loaded → ${cortexKey} (protected, read-only)`);
      }

      this.initialized = true;
      console.log(`[PurposeLayer] Initialization complete: ${purposes.length} purpose nodes loaded`);
    } catch (error) {
      console.error('[PurposeLayer] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get purpose for a specific user and mode
   */
  getPurpose(userId: string, mode: 'live' | 'paper'): PurposeNode | null {
    const cacheKey = `${userId}:${mode}`;
    return this.purposeCache.get(cacheKey) || null;
  }

  /**
   * Get purpose content (text only) for AI context injection
   */
  getPurposeContent(userId: string, mode: 'live' | 'paper'): string | null {
    const purpose = this.getPurpose(userId, mode);
    return purpose ? purpose.content : null;
  }

  /**
   * Validate purpose node integrity
   */
  validatePurposeIntegrity(userId: string, mode: 'live' | 'paper'): {
    exists: boolean;
    readonly: boolean;
    hasProvenance: boolean;
    inCortex: boolean;
  } {
    const purpose = this.getPurpose(userId, mode);
    const cortexKey = `${PURPOSE_CORTEX_KEY}:${userId}:${mode}`;
    const cortexValue = cortexCore.get(cortexKey);

    return {
      exists: !!purpose,
      readonly: purpose?.readonly === true,
      hasProvenance: purpose?.provenance === PURPOSE_PROVENANCE_TAG,
      inCortex: !!cortexValue
    };
  }

  /**
   * Reload purpose from database (for updates)
   */
  async reloadPurpose(userId: string, mode: 'live' | 'paper'): Promise<void> {
    const purposes = await db.select()
      .from(walterPurpose)
      .where(and(
        eq(walterPurpose.userId, userId),
        eq(walterPurpose.mode, mode)
      ))
      .limit(1);
    
    if (purposes.length === 0) {
      console.log(`[PurposeLayer] No purpose found for user ${userId} (${mode})`);
      return;
    }

    const purpose = purposes[0];
    const purposeNode: PurposeNode = {
      content: purpose.content,
      mode: purpose.mode,
      userId: purpose.userId,
      readonly: true,
      provenance: PURPOSE_PROVENANCE_TAG,
      loadedAt: new Date()
    };

    const cacheKey = `${userId}:${mode}`;
    this.purposeCache.set(cacheKey, purposeNode);

    const cortexKey = `${PURPOSE_CORTEX_KEY}:${userId}:${mode}`;
    
    const traceId = nanoid();
    await provenanceLogger.logLineage({
      traceId,
      originatingService: 'walter',
      targetService: 'cortex',
      sourceTable: 'walter_purpose',
      mode,
      operation: 'read',
      metadata: { purposeLength: purpose.content.length, reload: true }
    });

    cortexCore.set(
      cortexKey,
      purposeNode,
      86400,
      {
        traceId,
        mode,
        sourceTable: 'walter_purpose'
      }
    );

    console.log(`[PurposeLayer] 🔄 Purpose reloaded for user ${userId} (${mode})`);
  }

  /**
   * Get all loaded purposes (for governance reporting)
   */
  getAllPurposes(): PurposeNode[] {
    return Array.from(this.purposeCache.values());
  }
}

// Singleton instance
export const purposeLayer = new PurposeLayerService();
