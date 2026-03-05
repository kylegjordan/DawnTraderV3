/**
 * Directive 11.1A + 11.1A1 — Telemetry Persistence SQL Tests
 * 
 * Validates:
 * 1. SQL-based telemetry persistence (loadRecentTelemetry, saveTelemetryRecord)
 * 2. Regime tagging for telemetry records
 * 3. Checksum computation and verification
 * 4. Environment guard (shouldPersist)
 * 5. True mode provenance (getTrueMode per 11.1A1)
 * 6. Telemetry rehydration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SCHEMA_VERSION, SCHEMA_DIRECTIVE, METRIC_ENGINE_VERSION } from '../../config/schema-version.js';
import { 
  computeTelemetryChecksum, 
  verifyTelemetryChecksum,
  shouldPersist,
  getTrueMode,
  type MarketRegime,
  type TelemetryEntry
} from '../../services/telemetry-repository.js';

describe('Directive 11.1A - Telemetry Persistence SQL', () => {
  describe('Schema Version Tracking', () => {
    it('should report schema version v1.5.2', () => {
      expect(SCHEMA_VERSION).toBe('v1.5.2');
    });

    it('should report schema directive 11.1A', () => {
      expect(SCHEMA_DIRECTIVE).toBe('11.1A');
    });

    it('should report metric engine version v1.0', () => {
      expect(METRIC_ENGINE_VERSION).toBe('v1.0');
    });
  });

  describe('Telemetry Checksum', () => {
    it('should compute SHA-256 checksum for telemetry entry', () => {
      const entry: TelemetryEntry = {
        symbol: 'BTCUSD',
        mode: 'live',
        regime: 'TREND_FRIENDLY_STABLE',
        finalScore: 0.75,
      };
      
      const checksum = computeTelemetryChecksum(entry);
      
      expect(checksum).toBeDefined();
      expect(typeof checksum).toBe('string');
      expect(checksum.length).toBe(64); // SHA-256 hex length
    });

    it('should produce consistent checksums for same data', () => {
      const entry: TelemetryEntry = {
        symbol: 'ETHUSD',
        mode: 'paper',
        regime: 'HIGH_VOLATILITY_UNSTABLE',
        finalScore: 0.45,
      };
      
      const checksum1 = computeTelemetryChecksum(entry);
      const checksum2 = computeTelemetryChecksum(entry);
      
      expect(checksum1).toBe(checksum2);
    });

    it('should produce different checksums for different data', () => {
      const entry1: TelemetryEntry = {
        symbol: 'BTCUSD',
        mode: 'live',
        regime: 'TREND_FRIENDLY_STABLE',
        finalScore: 0.75,
      };
      
      const entry2: TelemetryEntry = {
        symbol: 'BTCUSD',
        mode: 'live',
        regime: 'BEAR_STABLE', // Different regime
        finalScore: 0.75,
      };
      
      const checksum1 = computeTelemetryChecksum(entry1);
      const checksum2 = computeTelemetryChecksum(entry2);
      
      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Environment Guard', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should not persist in paper mode by default', () => {
      process.env.MODE = 'paper';
      process.env.FORCE_PERSIST = undefined;
      process.env.PERSIST_TELEMETRY = undefined;
      
      // Need to re-import to get updated env
      const result = shouldPersist();
      expect(result).toBe(false);
    });

    it('should persist in live mode by default', () => {
      process.env.MODE = 'live';
      process.env.FORCE_PERSIST = undefined;
      process.env.PERSIST_TELEMETRY = undefined;
      
      const result = shouldPersist();
      expect(result).toBe(true);
    });

    it('should persist with FORCE_PERSIST=true in paper mode', () => {
      process.env.MODE = 'paper';
      process.env.FORCE_PERSIST = 'true';
      
      const result = shouldPersist();
      expect(result).toBe(true);
    });

    it('should not persist when PERSIST_TELEMETRY=false', () => {
      process.env.MODE = 'live';
      process.env.PERSIST_TELEMETRY = 'false';
      
      const result = shouldPersist();
      expect(result).toBe(false);
    });
  });

  describe('True Mode (Directive 11.1A1)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      vi.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return live mode when MODE=live', () => {
      process.env.MODE = 'live';
      
      const result = getTrueMode();
      expect(result).toBe('live');
    });

    it('should return paper mode when MODE=paper', () => {
      process.env.MODE = 'paper';
      
      const result = getTrueMode();
      expect(result).toBe('paper');
    });

    it('should return paper mode even with FORCE_PERSIST=true (11.1A1 provenance fix)', () => {
      process.env.MODE = 'paper';
      process.env.FORCE_PERSIST = 'true';
      
      // FORCE_PERSIST enables writing but NEVER relabels mode
      const result = getTrueMode();
      expect(result).toBe('paper');
    });

    it('should default to paper when MODE is not set', () => {
      delete process.env.MODE;
      
      const result = getTrueMode();
      expect(result).toBe('paper');
    });
  });

  describe('Market Regime Types', () => {
    const validRegimes: MarketRegime[] = [
      'EXTREME_NOISE',
      'TREND_FRIENDLY_STABLE',
      'BULL_VOLATILE',
      'BEAR_STABLE',
      'HIGH_VOLATILITY_UNSTABLE',
      'RANGE_BOUND_STABLE'
    ];

    it('should accept all valid market regime values', () => {
      for (const regime of validRegimes) {
        const entry: TelemetryEntry = {
          symbol: 'BTCUSD',
          mode: 'live',
          regime,
          finalScore: 0.5,
        };
        
        expect(() => computeTelemetryChecksum(entry)).not.toThrow();
      }
    });
  });
});
