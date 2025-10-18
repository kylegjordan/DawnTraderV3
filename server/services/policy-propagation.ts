import { db } from '../db';
import { ethicsPropagationJournal } from '@shared/schema';
import type { 
  InsertEthicsPropagationJournal,
  PropagationStatus,
  FederatedScope
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { federatedEthicsHub } from './federated-ethics-hub';
import type { PropagationUpdate, PropagationOutcome } from './federated-ethics-hub';

/**
 * Phase 14.0: Policy Propagation Service
 * 
 * Push/pull delta updates between FederatedEthicsHub and agent-local caches.
 * Retries with backoff; records into propagation journal (success/failure & reason).
 */

interface PropagationConfig {
  maxRetries: number;
  baseDelayMs: number;
  backoffMultiplier: number;
}

class PolicyPropagationService {
  private config: PropagationConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    backoffMultiplier: 2,
  };

  /**
   * Propagate updates to target domains
   */
  async propagateUpdates(updates: PropagationUpdate[]): Promise<PropagationOutcome[]> {
    console.log(`[PolicyPropagation] Starting propagation cycle for ${updates.length} updates`);

    const propagationId = `prop_${nanoid(12)}`;
    const outcomes: PropagationOutcome[] = [];

    for (const update of updates) {
      const outcome = await this.propagateToTarget(propagationId, update);
      outcomes.push(outcome);
    }

    console.log(`[PolicyPropagation] ✅ Propagation cycle complete - ${outcomes.filter(o => o.success).length}/${outcomes.length} succeeded`);

    return outcomes;
  }

  /**
   * Propagate a single update to a target domain with retry logic
   */
  private async propagateToTarget(
    propagationId: string,
    update: PropagationUpdate
  ): Promise<PropagationOutcome> {
    let retryCount = 0;
    let lastError: string | null = null;

    while (retryCount <= this.config.maxRetries) {
      try {
        // Record attempt to journal
        await this.recordPropagationAttempt(propagationId, update, retryCount, 'pending');

        // Attempt to reconcile update via FederatedEthicsHub
        const reconcileResults = await federatedEthicsHub.reconcileUpdates([update]);
        const result = reconcileResults[0];

        if (result.success) {
          // Success - mark as complete
          await this.recordPropagationAttempt(
            propagationId,
            update,
            retryCount,
            'success',
            null
          );

          console.log(`[PolicyPropagation] ✅ Propagated to ${update.domain} (${update.deltaType})`);

          return {
            success: true,
            domain: update.domain,
            message: result.message,
            retryCount,
          };
        } else {
          lastError = result.message;
          throw new Error(lastError);
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : 'Unknown error';
        
        if (retryCount < this.config.maxRetries) {
          // Retry with backoff
          const delayMs = this.config.baseDelayMs * Math.pow(this.config.backoffMultiplier, retryCount);
          console.warn(`[PolicyPropagation] ⚠️ Retry ${retryCount + 1}/${this.config.maxRetries} for ${update.domain} after ${delayMs}ms`);
          
          await this.recordPropagationAttempt(
            propagationId,
            update,
            retryCount,
            'retrying',
            lastError
          );

          await this.delay(delayMs);
          retryCount++;
        } else {
          // Max retries reached - fail
          await this.recordPropagationAttempt(
            propagationId,
            update,
            retryCount,
            'failed',
            lastError
          );

          console.error(`[PolicyPropagation] ❌ Failed to propagate to ${update.domain} after ${retryCount} retries: ${lastError}`);

          return {
            success: false,
            domain: update.domain,
            message: `Failed after ${retryCount} retries: ${lastError}`,
            retryCount,
          };
        }
      }
    }

    // Should not reach here
    return {
      success: false,
      domain: update.domain,
      message: lastError || 'Unknown error',
      retryCount,
    };
  }

  /**
   * Record propagation attempt to journal
   */
  private async recordPropagationAttempt(
    propagationId: string,
    update: PropagationUpdate,
    retryCount: number,
    status: PropagationStatus,
    errorMessage: string | null = null
  ): Promise<void> {
    try {
      await db.insert(ethicsPropagationJournal).values({
        propagationId,
        targetDomain: update.domain,
        mode: update.mode,
        deltaType: update.deltaType,
        deltaPayload: update.deltaPayload,
        status,
        retryCount,
        errorMessage,
        completedAt: status === 'success' || status === 'failed' ? new Date() : null,
      });
    } catch (error) {
      console.error('[PolicyPropagation] Failed to record to journal:', error);
    }
  }

  /**
   * Pull latest deltas from federated hub
   */
  async pullLatestDeltas(targetDomain: FederatedScope, mode: 'live' | 'paper' = 'paper'): Promise<any> {
    console.log(`[PolicyPropagation] Pulling latest snapshot for ${targetDomain}:${mode}`);

    try {
      const snapshot = await federatedEthicsHub.getSnapshot(targetDomain, mode);
      
      return {
        success: true,
        snapshot,
        message: 'Snapshot pulled successfully',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[PolicyPropagation] Failed to pull snapshot: ${errorMessage}`);
      
      return {
        success: false,
        snapshot: null,
        message: errorMessage,
      };
    }
  }

  /**
   * Get propagation stats
   */
  async getStats(): Promise<{
    totalPropagations: number;
    successCount: number;
    failedCount: number;
    pendingCount: number;
  }> {
    const allPropagations = await db
      .select()
      .from(ethicsPropagationJournal);

    const successCount = allPropagations.filter(p => p.status === 'success').length;
    const failedCount = allPropagations.filter(p => p.status === 'failed').length;
    const pendingCount = allPropagations.filter(p => p.status === 'pending' || p.status === 'retrying').length;

    return {
      totalPropagations: allPropagations.length,
      successCount,
      failedCount,
      pendingCount,
    };
  }

  /**
   * Delay helper for retry backoff
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const policyPropagationService = new PolicyPropagationService();
