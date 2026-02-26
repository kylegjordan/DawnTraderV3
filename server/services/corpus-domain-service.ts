/**
 * Phase 8.6.5 Task 2 - Corpus Domain Rebinding
 *
 * Directive 12.2.3: Walter expert corpus removed (Batch 6).
 * This service is stubbed to maintain interface compatibility with
 * index.ts initialization and phase-8.6.5 routes.
 * Full removal deferred to Cortex cleanup batch.
 */

import { cortexCore } from './cortex/cortex-core';

interface CorpusDomainMetadata {
  name: string;
  hash: string;
  confidence: number;
  topicCount: number;
  loadedAt: Date;
}

class CorpusDomainService {
  private domainMetadata: Map<string, CorpusDomainMetadata> = new Map();
  private initialized: boolean = false;

  /**
   * Initialize corpus domains on server startup (no-op — corpus data source removed)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    console.log('[CorpusDomains] Corpus data source removed (Directive 12.2.3). Initialization skipped.');
    this.initialized = true;
  }

  getDomainMetadata(domainName: string): CorpusDomainMetadata | null {
    return this.domainMetadata.get(domainName) || null;
  }

  validateDomains(): {
    totalDomains: number;
    activeDomains: number;
    validatedDomains: string[];
    status: 'ok' | 'degraded' | 'failed';
  } {
    return {
      totalDomains: 0,
      activeDomains: 0,
      validatedDomains: [],
      status: 'ok'
    };
  }

  getDomain(domainName: string): any | null {
    return cortexCore.get(`Cortex.Domain.${domainName}`);
  }

  async refreshDomain(_domainName: string): Promise<void> {
    console.log('[CorpusDomains] Refresh skipped — corpus data source removed (Directive 12.2.3)');
  }

  getAllDomainMetadata(): CorpusDomainMetadata[] {
    return Array.from(this.domainMetadata.values());
  }
}

// Singleton instance
export const corpusDomainService = new CorpusDomainService();
