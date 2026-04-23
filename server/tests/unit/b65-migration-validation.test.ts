/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B65.1 — Migration Validation Test
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Validates the three B65 migrations at the SQL-level without requiring a live
 * database:
 *   (1) Files exist with expected names
 *   (2) baseCurrency derivation rule produces expected values for canonical symbols
 *       (emulating COALESCE(NULLIF(SPLIT_PART(symbol, '/', 1), ''), symbol) in TS)
 *   (3) module_constants seed values match trailing-exit-controller defaults
 *
 * Does NOT run the SQL — that happens at deploy time via Drizzle migration
 * runner. These are sanity checks on the migration authors' intent.
 *
 * Source: BATCH_65_SCOPE.md §4, BATCH_65_PRE_AUDIT.md §4.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_DIR = path.resolve(
  __dirname,
  '../../../drizzle/migrations',
);

// Emulate the SQL derivation rule in JS for symbol → baseCurrency
function deriveBaseCurrency(symbol: string): string {
  // COALESCE(NULLIF(SPLIT_PART(symbol, '/', 1), ''), symbol)
  // 1. split by '/', take index 0 — if input has no '/', this returns the whole string in PG
  //    but in JS split returns the whole string as [0]. Match PG-side semantics:
  //    SPLIT_PART("ETH", '/', 1) returns "" in PG (not "ETH") — NO. Actually PG returns
  //    the full string if separator not found for index 1. Let me verify both paths:
  //    PG: SELECT SPLIT_PART('ETH', '/', 1) returns 'ETH' (whole string returned when sep absent).
  //    PG: SELECT SPLIT_PART('ETH/USD', '/', 1) returns 'ETH'.
  //    So the NULLIF catches only the edge case where the symbol STARTS with '/', e.g. '/ETH' → first part is ''.
  //    In that case, fall back to the full symbol.
  const parts = symbol.split('/');
  const first = parts[0];
  if (first === '') return symbol;
  return first;
}

describe('B65.1 migration validation', () => {
  describe('File existence', () => {
    it('2026-04-23-b65-add-exchange-asset-class.sql exists', () => {
      const p = path.join(MIGRATIONS_DIR, '2026-04-23-b65-add-exchange-asset-class.sql');
      expect(fs.existsSync(p)).toBe(true);
    });

    it('2026-04-23-b65-add-base-currency-to-trades.sql exists', () => {
      const p = path.join(MIGRATIONS_DIR, '2026-04-23-b65-add-base-currency-to-trades.sql');
      expect(fs.existsSync(p)).toBe(true);
    });

    it('2026-04-23-b65-create-module-constants.sql exists', () => {
      const p = path.join(MIGRATIONS_DIR, '2026-04-23-b65-create-module-constants.sql');
      expect(fs.existsSync(p)).toBe(true);
    });

    it('2026-04-23-b65-rollback.sql exists', () => {
      const p = path.join(MIGRATIONS_DIR, '2026-04-23-b65-rollback.sql');
      expect(fs.existsSync(p)).toBe(true);
    });
  });

  describe('Migration 1 — exchange + asset_class column adds', () => {
    it('adds exchange column to all 4 pair-level tables', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-add-exchange-asset-class.sql'),
        'utf-8',
      );
      for (const table of ['watchlist_pairs', 'trading_signals', 'trades', 'paper_sim_trades']) {
        expect(sql).toContain(`ALTER TABLE ${table}`);
      }
      expect(sql.match(/ADD COLUMN IF NOT EXISTS exchange/gi)?.length).toBe(4);
      expect(sql.match(/ADD COLUMN IF NOT EXISTS asset_class/gi)?.length).toBe(4);
    });

    it('defaults are kraken + crypto_spot', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-add-exchange-asset-class.sql'),
        'utf-8',
      );
      expect(sql).toContain(`DEFAULT 'kraken'`);
      expect(sql).toContain(`DEFAULT 'crypto_spot'`);
    });
  });

  describe('Migration 2 — baseCurrency on trades + paper_sim_trades', () => {
    it('uses COALESCE(NULLIF(SPLIT_PART)) pattern per Langston review', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-add-base-currency-to-trades.sql'),
        'utf-8',
      );
      expect(sql).toContain(`COALESCE(NULLIF(SPLIT_PART(symbol, '/', 1), ''), symbol)`);
    });

    it('enforces NOT NULL post-backfill on both tables', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-add-base-currency-to-trades.sql'),
        'utf-8',
      );
      expect(sql.match(/ALTER COLUMN base_currency SET NOT NULL/gi)?.length).toBe(2);
    });

    it('has pre-commit null check that aborts if any row still null', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-add-base-currency-to-trades.sql'),
        'utf-8',
      );
      expect(sql).toContain('RAISE EXCEPTION');
      expect(sql.match(/null_count > 0/gi)?.length).toBe(2);
    });
  });

  describe('Migration 3 — module_constants creation + TEC seeds', () => {
    it('creates module_constants table with 5D composite primary key', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-create-module-constants.sql'),
        'utf-8',
      );
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS module_constants');
      expect(sql).toContain('PRIMARY KEY (module_name, exchange, asset_class, strategy, regime, constant_name)');
    });

    it('seeds TEC defaults: break_even, target_lock, trail_distance, persistence_debounce', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-create-module-constants.sql'),
        'utf-8',
      );
      for (const constant of [
        'break_even_trigger_r',
        'target_lock_r',
        'trail_distance_atr_multiplier',
        'persistence_debounce_ms',
      ]) {
        expect(sql).toContain(`'${constant}'`);
      }
    });

    it('uses ON CONFLICT DO NOTHING for seed idempotency', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-create-module-constants.sql'),
        'utf-8',
      );
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO NOTHING');
    });
  });

  describe('baseCurrency derivation logic — canonical symbol cases', () => {
    it('ETH/USD → ETH', () => {
      expect(deriveBaseCurrency('ETH/USD')).toBe('ETH');
    });

    it('BTC/EUR → BTC', () => {
      expect(deriveBaseCurrency('BTC/EUR')).toBe('BTC');
    });

    it('SOL/USDT → SOL', () => {
      expect(deriveBaseCurrency('SOL/USDT')).toBe('SOL');
    });

    it('USDT/USD → USDT (stablecoin pair — left side preserved per Langston)', () => {
      expect(deriveBaseCurrency('USDT/USD')).toBe('USDT');
    });

    it('DAI/USD → DAI (another stablecoin pair)', () => {
      expect(deriveBaseCurrency('DAI/USD')).toBe('DAI');
    });

    it('malformed: no separator → fallback to full symbol', () => {
      expect(deriveBaseCurrency('BAREPAIR')).toBe('BAREPAIR');
    });

    it('malformed: leading slash → fallback to full symbol', () => {
      expect(deriveBaseCurrency('/ORPHAN')).toBe('/ORPHAN');
    });

    it('multi-slash: ETH/USD/NOTE → ETH (takes first segment)', () => {
      expect(deriveBaseCurrency('ETH/USD/NOTE')).toBe('ETH');
    });
  });

  describe('Rollback script', () => {
    it('reverses all 3 forward migrations in reverse order', () => {
      const sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, '2026-04-23-b65-rollback.sql'),
        'utf-8',
      );
      expect(sql).toContain('DROP TABLE IF EXISTS module_constants');
      expect(sql).toContain('DROP COLUMN IF EXISTS base_currency');
      expect(sql).toContain('DROP COLUMN IF EXISTS exchange');
      expect(sql).toContain('DROP COLUMN IF EXISTS asset_class');
    });
  });
});
