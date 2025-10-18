import { db } from '../db';
import { 
  federatedEthicsState, 
  ethicalPrinciple, 
  safetyPolicy,
  ethicalViolationLog
} from '@shared/schema';
import type { 
  FederatedEthicsState,
  InsertFederatedEthicsState,
  FederatedScope
} from '@shared/schema';
import { eq, and, desc, gte } from 'drizzle-orm';
import { createHash } from 'crypto';

/**
 * Phase 14.0: Federated Ethics Hub
 * 
 * Maintains the authoritative in-memory snapshot of global ethical state.
 * Pulls from ethical_principle + Phase 13 violations + Phase 11 safety policies.
 * Exposes getSnapshot, reconcileUpdates, recordPropagation methods.
 */

export interface FederatedSnapshot {
  domain: FederatedScope;
  mode: 'live' | 'paper';
  snapshotHash: string;
  principlesActive: string[];
  policiesActive: string[];
  metadata: {
    lastSync: string;
    version: string;
    violations24h: number;
  };
  updatedAt: Date;
}

export interface PropagationUpdate {
  domain: FederatedScope;
  mode: 'live' | 'paper';
  deltaType: 'principle_update' | 'policy_update' | 'violation_sync';
  deltaPayload: any;
}

export interface PropagationOutcome {
  success: boolean;
  domain: FederatedScope;
  message: string;
  retryCount?: number;
}

class FederatedEthicsHubService {
  private snapshotCache: Map<string, FederatedSnapshot> = new Map();
  private readonly CACHE_TTL = 300000; // 5 minutes

  /**
   * Get the current federated snapshot for a domain/mode
   */
  async getSnapshot(
    domain: FederatedScope = 'global',
    mode: 'live' | 'paper' = 'paper'
  ): Promise<FederatedSnapshot> {
    const cacheKey = `${domain}:${mode}`;
    
    // Check cache first
    const cached = this.snapshotCache.get(cacheKey);
    if (cached && (Date.now() - cached.updatedAt.getTime()) < this.CACHE_TTL) {
      return cached;
    }

    console.log(`[FederatedEthicsHub] Fetching snapshot for domain=${domain}, mode=${mode}`);

    // Step 1: Fetch active principles
    const principles = await db
      .select()
      .from(ethicalPrinciple)
      .where(eq(ethicalPrinciple.enabled, true));

    const principlesActive = principles.map(p => p.name);

    // Step 2: Fetch active safety policies
    const policies = await db
      .select()
      .from(safetyPolicy)
      .where(eq(safetyPolicy.enabled, true));

    const policiesActive = policies.map(p => p.policyName);

    // Step 3: Count recent violations (last 24h)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentViolations = await db
      .select()
      .from(ethicalViolationLog)
      .where(gte(ethicalViolationLog.createdAt, twentyFourHoursAgo));

    // Step 4: Generate snapshot hash
    const snapshotData = {
      principles: principlesActive.sort(),
      policies: policiesActive.sort(),
      timestamp: new Date().toISOString(),
    };
    const snapshotHash = createHash('sha256')
      .update(JSON.stringify(snapshotData))
      .digest('hex');

    // Step 5: Create snapshot
    const snapshot: FederatedSnapshot = {
      domain,
      mode,
      snapshotHash,
      principlesActive,
      policiesActive,
      metadata: {
        lastSync: new Date().toISOString(),
        version: '14.0',
        violations24h: recentViolations.length,
      },
      updatedAt: new Date(),
    };

    // Cache it
    this.snapshotCache.set(cacheKey, snapshot);

    console.log(`[FederatedEthicsHub] ✅ Snapshot created - ${principlesActive.length} principles, ${policiesActive.length} policies`);

    return snapshot;
  }

  /**
   * Reconcile updates from multiple sources
   */
  async reconcileUpdates(updates: PropagationUpdate[]): Promise<PropagationOutcome[]> {
    console.log(`[FederatedEthicsHub] Reconciling ${updates.length} updates`);

    const outcomes: PropagationOutcome[] = [];

    for (const update of updates) {
      try {
        // Fetch current snapshot
        const currentSnapshot = await this.getSnapshot(update.domain, update.mode);

        // Apply delta based on type
        let newPrinciples = [...currentSnapshot.principlesActive];
        let newPolicies = [...currentSnapshot.policiesActive];

        if (update.deltaType === 'principle_update') {
          const { added, removed } = update.deltaPayload;
          if (added) newPrinciples.push(...added);
          if (removed) newPrinciples = newPrinciples.filter(p => !removed.includes(p));
        } else if (update.deltaType === 'policy_update') {
          const { added, removed } = update.deltaPayload;
          if (added) newPolicies.push(...added);
          if (removed) newPolicies = newPolicies.filter(p => !removed.includes(p));
        }

        // Generate new hash
        const newHash = createHash('sha256')
          .update(JSON.stringify({ 
            principles: newPrinciples.sort(), 
            policies: newPolicies.sort() 
          }))
          .digest('hex');

        // Save to database
        await db.insert(federatedEthicsState).values({
          domain: update.domain,
          mode: update.mode,
          snapshotHash: newHash,
          principlesActive: newPrinciples,
          policiesActive: newPolicies,
          metadata: {
            deltaType: update.deltaType,
            appliedAt: new Date().toISOString(),
          },
        });

        // Invalidate cache
        this.snapshotCache.delete(`${update.domain}:${update.mode}`);

        outcomes.push({
          success: true,
          domain: update.domain,
          message: `Update applied successfully (${update.deltaType})`,
        });

        console.log(`[FederatedEthicsHub] ✅ Update applied for ${update.domain}:${update.mode}`);
      } catch (error) {
        console.error(`[FederatedEthicsHub] ❌ Failed to apply update for ${update.domain}:`, error);
        outcomes.push({
          success: false,
          domain: update.domain,
          message: `Failed to apply update: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    return outcomes;
  }

  /**
   * Record propagation outcome to journal
   */
  async recordPropagation(outcome: PropagationOutcome): Promise<void> {
    // This will be called by PolicyPropagationService
    console.log(`[FederatedEthicsHub] Recording propagation outcome for ${outcome.domain}: ${outcome.success ? 'success' : 'failed'}`);
  }

  /**
   * Get all recent snapshots across domains
   */
  async getAllSnapshots(mode: 'live' | 'paper' = 'paper'): Promise<FederatedSnapshot[]> {
    const domains: FederatedScope[] = ['global', 'trading', 'devops', 'ux', 'fullstack'];
    const snapshots: FederatedSnapshot[] = [];

    for (const domain of domains) {
      const snapshot = await this.getSnapshot(domain, mode);
      snapshots.push(snapshot);
    }

    return snapshots;
  }

  /**
   * Clear snapshot cache
   */
  clearCache(): void {
    this.snapshotCache.clear();
    console.log('[FederatedEthicsHub] Cache cleared');
  }
}

export const federatedEthicsHub = new FederatedEthicsHubService();
