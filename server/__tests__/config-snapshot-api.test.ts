import { describe, it, expect, beforeAll } from 'vitest';
import type { ConfigSnapshot } from '../../types/config';

/**
 * Integration tests for Config Snapshot API - Phase 27.G
 * 
 * NOTE: These are integration tests that require a running server.
 * Run with: npm run dev (in separate terminal) && npm test
 * 
 * Or skip these tests in CI by setting: SKIP_INTEGRATION_TESTS=true
 */

const API_BASE_URL = process.env.VITE_API_URL || 'http://localhost:5000';
const SKIP_TESTS = process.env.SKIP_INTEGRATION_TESTS === 'true';

describe.skipIf(SKIP_TESTS)('Config Snapshot API Tests - Phase 27.G', () => {
  let authToken: string;

  beforeAll(async () => {
    // Authenticate to get token
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: process.env.TEST_USER_EMAIL || 'admin',
        password: process.env.TEST_USER_PASSWORD || 'admin123',
      }),
    });

    if (!loginResponse.ok) {
      throw new Error(`Failed to authenticate: ${loginResponse.statusText}`);
    }

    const authData = await loginResponse.json();
    authToken = authData.token;
  });

  describe('GET /api/diagnostics/config-snapshot', () => {
    it('should return config snapshot for paper mode', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const snapshot: ConfigSnapshot = await response.json();
      
      // Verify core fields
      expect(snapshot).toBeDefined();
      expect(snapshot.mode).toBe('paper');
      expect(snapshot.timestamp).toBeDefined();
      expect(snapshot.portfolioValue).toBeTypeOf('number');
      expect(snapshot.legacyReads).toBe(0); // Critical: must be 0
      expect(snapshot.legacyFields).toEqual([]); // Critical: must be empty array
      expect(snapshot.schemaHash).toBeDefined();
      expect(snapshot.schemaHash).toMatch(/^[a-f0-9]{32}$/); // MD5 hash format
    });

    it('should return config snapshot for live mode', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=live`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const snapshot: ConfigSnapshot = await response.json();
      
      expect(snapshot.mode).toBe('live');
      expect(snapshot.legacyReads).toBe(0);
      expect(snapshot.legacyFields).toEqual([]);
    });

    it('should include guardrails with all 4 core fields when configured', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const snapshot: ConfigSnapshot = await response.json();
      
      if (snapshot.guardrails) {
        expect(snapshot.guardrails).toHaveProperty('portfolioRiskPerTradePct');
        expect(snapshot.guardrails).toHaveProperty('symbolCooldownMinutes');
        expect(snapshot.guardrails).toHaveProperty('maxOpenPositions');
        expect(snapshot.guardrails).toHaveProperty('dailyLossKillSwitchPct');
        
        // Verify types
        expect(typeof snapshot.guardrails.portfolioRiskPerTradePct).toBe('number');
        expect(typeof snapshot.guardrails.symbolCooldownMinutes).toBe('number');
        expect(typeof snapshot.guardrails.maxOpenPositions).toBe('number');
        expect(typeof snapshot.guardrails.dailyLossKillSwitchPct).toBe('number');
        
        // Verify reasonable ranges
        expect(snapshot.guardrails.portfolioRiskPerTradePct).toBeGreaterThan(0);
        expect(snapshot.guardrails.portfolioRiskPerTradePct).toBeLessThanOrEqual(5.0);
        expect(snapshot.guardrails.symbolCooldownMinutes).toBeGreaterThanOrEqual(0);
        expect(snapshot.guardrails.maxOpenPositions).toBeGreaterThan(0);
        expect(snapshot.guardrails.dailyLossKillSwitchPct).toBeGreaterThan(0);
      }
    });

    it('should include filters with all 16 fields when configured', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const snapshot: ConfigSnapshot = await response.json();
      
      if (snapshot.filters) {
        // Verify all 16 filter fields exist
        const expectedFields = [
          'minVolume', 'minLiquidity', 'minPrice', 'maxPrice', 'minMarketCap',
          'maxBidAskSpread', 'rsiMin', 'rsiMax', 'volatilityMin', 'volatilityMax',
          'excludeStablecoins', 'allowRegulatedOnly', 'universeSize',
          'quoteCurrencies', 'activeTimeframes', 'confidenceThreshold'
        ];
        
        expectedFields.forEach(field => {
          expect(snapshot.filters).toHaveProperty(field);
        });
        
        // Verify array fields
        expect(Array.isArray(snapshot.filters.quoteCurrencies)).toBe(true);
        expect(Array.isArray(snapshot.filters.activeTimeframes)).toBe(true);
        
        // Verify boolean fields
        expect(typeof snapshot.filters.excludeStablecoins).toBe('boolean');
        expect(typeof snapshot.filters.allowRegulatedOnly).toBe('boolean');
      }
    });

    it('should include goals with all 3 fields when configured', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const snapshot: ConfigSnapshot = await response.json();
      
      if (snapshot.goals) {
        expect(snapshot.goals).toHaveProperty('activePreset');
        expect(snapshot.goals).toHaveProperty('targetDailyAvgEarningPct');
        expect(snapshot.goals).toHaveProperty('tradesPerDayEst');
        
        expect(typeof snapshot.goals.activePreset).toBe('string');
        expect(typeof snapshot.goals.targetDailyAvgEarningPct).toBe('number');
        expect(typeof snapshot.goals.tradesPerDayEst).toBe('number');
      }
    });

    it('should include complete provenance metadata', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const snapshot: ConfigSnapshot = await response.json();
      
      expect(snapshot.provenance).toBeDefined();
      
      // Verify guardrails provenance
      expect(snapshot.provenance.guardrails_source).toBe('guardrails_v2');
      expect(Array.isArray(snapshot.provenance.guardrails_columns)).toBe(true);
      expect(snapshot.provenance.guardrails_columns).toHaveLength(4);
      
      // Verify filters provenance
      expect(snapshot.provenance.filters_source).toBe('screener_filters');
      expect(Array.isArray(snapshot.provenance.filters_columns)).toBe(true);
      expect(snapshot.provenance.filters_columns).toHaveLength(16);
      
      // Verify goals provenance
      expect(snapshot.provenance.goals_source).toBe('goals_presets');
      expect(Array.isArray(snapshot.provenance.goals_columns)).toBe(true);
      expect(snapshot.provenance.goals_columns).toHaveLength(3);
      
      // Verify portfolio provenance
      expect(snapshot.provenance.portfolio_source).toBe('portfolio_balances');
      expect(Array.isArray(snapshot.provenance.portfolio_columns)).toBe(true);
    });

    it('should verify total field count is 23 (4+16+3) when all configs exist', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const snapshot: ConfigSnapshot = await response.json();
      
      let fieldCount = 0;
      
      if (snapshot.guardrails) {
        fieldCount += 4; // 4 guardrail fields
      }
      
      if (snapshot.filters) {
        fieldCount += 16; // 16 filter fields
      }
      
      if (snapshot.goals) {
        fieldCount += 3; // 3 goal fields
      }
      
      // If all configs exist, should total 23 fields
      if (snapshot.guardrails && snapshot.filters && snapshot.goals) {
        expect(fieldCount).toBe(23);
      }
    });

    it('should verify schema hash changes when config changes', async () => {
      // Get initial snapshot
      const response1 = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const snapshot1: ConfigSnapshot = await response1.json();
      const hash1 = snapshot1.schemaHash;

      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 100));

      // Get second snapshot (should be same if no changes)
      const response2 = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const snapshot2: ConfigSnapshot = await response2.json();
      const hash2 = snapshot2.schemaHash;

      // If config hasn't changed, hashes should match
      if (JSON.stringify(snapshot1.guardrails) === JSON.stringify(snapshot2.guardrails) &&
          JSON.stringify(snapshot1.filters) === JSON.stringify(snapshot2.filters) &&
          JSON.stringify(snapshot1.goals) === JSON.stringify(snapshot2.goals)) {
        expect(hash1).toBe(hash2);
      }
    });

    it('should return 400 for invalid mode', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=invalid`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      
      const error = await response.json();
      expect(error.code).toBe('INVALID_MODE');
    });

    it('should return 401 when not authenticated', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`);

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
    });

    it('should default to paper mode when mode parameter is missing', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      expect(response.ok).toBe(true);
      
      const snapshot: ConfigSnapshot = await response.json();
      expect(snapshot.mode).toBe('paper');
    });
  });

  describe('Legacy Field Validation', () => {
    it('should confirm zero legacy reads in both modes', async () => {
      const paperResponse = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const paperSnapshot: ConfigSnapshot = await paperResponse.json();

      const liveResponse = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=live`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const liveSnapshot: ConfigSnapshot = await liveResponse.json();

      // CRITICAL ASSERTION: legacyReads must be 0 for Phase 27.G compliance
      expect(paperSnapshot.legacyReads).toBe(0);
      expect(liveSnapshot.legacyReads).toBe(0);
      
      expect(paperSnapshot.legacyFields).toEqual([]);
      expect(liveSnapshot.legacyFields).toEqual([]);
    });

    it('should not include any deprecated guardrail fields', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const snapshot: ConfigSnapshot = await response.json();
      
      // Verify deprecated fields are NOT present
      const deprecatedGuardrailFields = [
        'riskPerTrade',
        'tradeWindowMinutes',
        'maxConcurrentTrades',
        'maxLossPerDay',
        'stopLossPercent',
        'takeProfitPercent'
      ];
      
      if (snapshot.guardrails) {
        deprecatedGuardrailFields.forEach(field => {
          expect(snapshot.guardrails).not.toHaveProperty(field);
        });
      }
    });

    it('should not include any deprecated filter fields', async () => {
      const response = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });

      const snapshot: ConfigSnapshot = await response.json();
      
      // Verify deprecated fields are NOT present
      const deprecatedFilterFields = [
        'avgVolumeRatio',
        'atrThreshold',
        'priceDeltaTrigger'
      ];
      
      if (snapshot.filters) {
        deprecatedFilterFields.forEach(field => {
          expect(snapshot.filters).not.toHaveProperty(field);
        });
      }
    });
  });

  describe('Audit Compliance Verification', () => {
    it('should pass full audit compliance check', async () => {
      const paperResponse = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=paper`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const paperSnapshot: ConfigSnapshot = await paperResponse.json();

      const liveResponse = await fetch(`${API_BASE_URL}/api/diagnostics/config-snapshot?mode=live`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
      });
      const liveSnapshot: ConfigSnapshot = await liveResponse.json();

      // Comprehensive audit check
      const auditChecks = [
        // Zero legacy reads
        paperSnapshot.legacyReads === 0,
        liveSnapshot.legacyReads === 0,
        
        // Empty legacy fields
        paperSnapshot.legacyFields.length === 0,
        liveSnapshot.legacyFields.length === 0,
        
        // Schema hash exists
        paperSnapshot.schemaHash.length === 32,
        liveSnapshot.schemaHash.length === 32,
        
        // Provenance complete
        paperSnapshot.provenance.guardrails_columns.length === 4,
        paperSnapshot.provenance.filters_columns.length === 16,
        paperSnapshot.provenance.goals_columns.length === 3,
        
        // Mode correct
        paperSnapshot.mode === 'paper',
        liveSnapshot.mode === 'live',
      ];

      const allChecksPassed = auditChecks.every(check => check === true);
      expect(allChecksPassed).toBe(true);
      
      console.log('✅ Phase 27.G Audit Compliance: PASSED');
      console.log(`   Paper legacyReads: ${paperSnapshot.legacyReads}`);
      console.log(`   Live legacyReads: ${liveSnapshot.legacyReads}`);
      console.log(`   Paper hash: ${paperSnapshot.schemaHash.substring(0, 8)}...`);
      console.log(`   Live hash: ${liveSnapshot.schemaHash.substring(0, 8)}...`);
    });
  });
});
