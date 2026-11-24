import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Batch 19G migration starting...\n');

    // Step 1: Add new columns
    console.log('Step 1: Adding new columns...');
    await client.query(`ALTER TABLE screener_filters ADD COLUMN IF NOT EXISTS filter_path VARCHAR(20) NOT NULL DEFAULT 'active_quant'`);
    await client.query(`ALTER TABLE screener_filters ADD COLUMN IF NOT EXISTS lq_min DECIMAL(5,2) DEFAULT 35.00`);
    await client.query(`ALTER TABLE screener_filters ADD COLUMN IF NOT EXISTS vn_max DECIMAL(5,4) DEFAULT 0.9300`);
    await client.query(`ALTER TABLE screener_filters ADD COLUMN IF NOT EXISTS corr_max DECIMAL(5,4) DEFAULT 0.9200`);
    await client.query(`ALTER TABLE screener_filters ADD COLUMN IF NOT EXISTS di_min DECIMAL(5,2) DEFAULT 55.00`);
    console.log('  Done.\n');

    // Step 2: Drop old unique index, create new composite index
    console.log('Step 2: Updating unique index...');
    await client.query(`DROP INDEX IF EXISTS screener_filters_mode_idx`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS screener_filters_mode_path_idx ON screener_filters (mode, filter_path)`);
    console.log('  Done.\n');

    // Step 3: Update existing rows to active_quant
    console.log('Step 3: Tagging existing rows as active_quant...');
    await client.query(`UPDATE screener_filters SET filter_path = 'active_quant' WHERE mode = 'paper' AND (filter_path IS NULL OR filter_path = '')`);
    await client.query(`UPDATE screener_filters SET filter_path = 'active_quant' WHERE mode = 'live' AND (filter_path IS NULL OR filter_path = '')`);
    console.log('  Done.\n');

    // Step 4: Seed rows for paper mode
    console.log('Step 4: Seeding paper mode rows...');

    // Active Quant (paper) — update existing row
    await client.query(`
      UPDATE screener_filters
      SET lq_min = 35.00, vn_max = 0.9300, corr_max = 0.9200, di_min = 55.00,
          min_volume = 500000.00, min_liquidity = 500000.00, min_price = 0.25000000,
          max_price = 100000.00, max_bid_ask_spread = 0.50, min_market_cap = 250000000.00,
          exclude_stablecoins = true, min_history_days = 30,
          active_timeframes = '["5m","15m","1h"]'::jsonb
      WHERE mode = 'paper' AND filter_path = 'active_quant'
    `);
    console.log('  paper/active_quant updated.');

    // Active Pattern (paper)
    await client.query(`
      INSERT INTO screener_filters (
        mode, filter_path, min_volume, min_liquidity, min_price, max_price,
        max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
        active_timeframes, universe_size, confidence_threshold, final_score_min,
        regime_weight_min, lq_min, vn_max, corr_max, di_min,
        managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
      ) VALUES (
        'paper', 'active_pattern', 250000.00, 250000.00, 0.25000000, 100000.00,
        1.00, 100000000.00, true, 14,
        '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
        0.3000, 20.00, 0.9800, 0.9500, 30.00,
        false, true, '["USD"]'::jsonb, false
      )
      ON CONFLICT (mode, filter_path) DO UPDATE SET
        min_volume = EXCLUDED.min_volume, min_liquidity = EXCLUDED.min_liquidity,
        min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price,
        max_bid_ask_spread = EXCLUDED.max_bid_ask_spread, min_market_cap = EXCLUDED.min_market_cap,
        exclude_stablecoins = EXCLUDED.exclude_stablecoins, min_history_days = EXCLUDED.min_history_days,
        active_timeframes = EXCLUDED.active_timeframes, universe_size = EXCLUDED.universe_size,
        confidence_threshold = EXCLUDED.confidence_threshold, final_score_min = EXCLUDED.final_score_min,
        regime_weight_min = EXCLUDED.regime_weight_min, lq_min = EXCLUDED.lq_min,
        vn_max = EXCLUDED.vn_max, corr_max = EXCLUDED.corr_max, di_min = EXCLUDED.di_min
    `);
    console.log('  paper/active_pattern inserted/updated.');

    // VTS Quant (paper)
    await client.query(`
      INSERT INTO screener_filters (
        mode, filter_path, min_volume, min_liquidity, min_price, max_price,
        max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
        active_timeframes, universe_size, confidence_threshold, final_score_min,
        regime_weight_min, lq_min, vn_max, corr_max, di_min,
        managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
      ) VALUES (
        'paper', 'vts_quant', 300000.00, 250000.00, 0.05000000, 100000.00,
        0.75, 100000000.00, true, 21,
        '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
        0.3000, 25.00, 0.9800, 0.9500, 35.00,
        false, true, '["USD"]'::jsonb, false
      )
      ON CONFLICT (mode, filter_path) DO UPDATE SET
        min_volume = EXCLUDED.min_volume, min_liquidity = EXCLUDED.min_liquidity,
        min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price,
        max_bid_ask_spread = EXCLUDED.max_bid_ask_spread, min_market_cap = EXCLUDED.min_market_cap,
        exclude_stablecoins = EXCLUDED.exclude_stablecoins, min_history_days = EXCLUDED.min_history_days,
        active_timeframes = EXCLUDED.active_timeframes, universe_size = EXCLUDED.universe_size,
        confidence_threshold = EXCLUDED.confidence_threshold, final_score_min = EXCLUDED.final_score_min,
        regime_weight_min = EXCLUDED.regime_weight_min, lq_min = EXCLUDED.lq_min,
        vn_max = EXCLUDED.vn_max, corr_max = EXCLUDED.corr_max, di_min = EXCLUDED.di_min
    `);
    console.log('  paper/vts_quant inserted/updated.');

    // VTS Pattern (paper)
    await client.query(`
      INSERT INTO screener_filters (
        mode, filter_path, min_volume, min_liquidity, min_price, max_price,
        max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
        active_timeframes, universe_size, confidence_threshold, final_score_min,
        regime_weight_min, lq_min, vn_max, corr_max, di_min,
        managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
      ) VALUES (
        'paper', 'vts_pattern', 150000.00, 150000.00, 0.05000000, 100000.00,
        1.50, 50000000.00, true, 14,
        '["5m","15m","1h","4h"]'::jsonb, 100, 60, 0.3500,
        0.3000, 18.00, 0.9900, 0.9700, 20.00,
        false, true, '["USD"]'::jsonb, false
      )
      ON CONFLICT (mode, filter_path) DO UPDATE SET
        min_volume = EXCLUDED.min_volume, min_liquidity = EXCLUDED.min_liquidity,
        min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price,
        max_bid_ask_spread = EXCLUDED.max_bid_ask_spread, min_market_cap = EXCLUDED.min_market_cap,
        exclude_stablecoins = EXCLUDED.exclude_stablecoins, min_history_days = EXCLUDED.min_history_days,
        active_timeframes = EXCLUDED.active_timeframes, universe_size = EXCLUDED.universe_size,
        confidence_threshold = EXCLUDED.confidence_threshold, final_score_min = EXCLUDED.final_score_min,
        regime_weight_min = EXCLUDED.regime_weight_min, lq_min = EXCLUDED.lq_min,
        vn_max = EXCLUDED.vn_max, corr_max = EXCLUDED.corr_max, di_min = EXCLUDED.di_min
    `);
    console.log('  paper/vts_pattern inserted/updated.\n');

    // Step 5: Seed rows for live mode
    console.log('Step 5: Seeding live mode rows...');

    // Active Quant (live) — update existing row
    await client.query(`
      UPDATE screener_filters
      SET lq_min = 35.00, vn_max = 0.9300, corr_max = 0.9200, di_min = 55.00,
          min_volume = 500000.00, min_liquidity = 500000.00, min_price = 0.25000000,
          max_price = 100000.00, max_bid_ask_spread = 0.50, min_market_cap = 250000000.00,
          exclude_stablecoins = true, min_history_days = 30,
          active_timeframes = '["5m","15m","1h"]'::jsonb
      WHERE mode = 'live' AND filter_path = 'active_quant'
    `);
    console.log('  live/active_quant updated.');

    // Active Pattern (live)
    await client.query(`
      INSERT INTO screener_filters (
        mode, filter_path, min_volume, min_liquidity, min_price, max_price,
        max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
        active_timeframes, universe_size, confidence_threshold, final_score_min,
        regime_weight_min, lq_min, vn_max, corr_max, di_min,
        managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
      ) VALUES (
        'live', 'active_pattern', 250000.00, 250000.00, 0.25000000, 100000.00,
        1.00, 100000000.00, true, 14,
        '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
        0.3000, 20.00, 0.9800, 0.9500, 30.00,
        false, true, '["USD"]'::jsonb, false
      )
      ON CONFLICT (mode, filter_path) DO UPDATE SET
        min_volume = EXCLUDED.min_volume, min_liquidity = EXCLUDED.min_liquidity,
        min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price,
        max_bid_ask_spread = EXCLUDED.max_bid_ask_spread, min_market_cap = EXCLUDED.min_market_cap,
        exclude_stablecoins = EXCLUDED.exclude_stablecoins, min_history_days = EXCLUDED.min_history_days,
        active_timeframes = EXCLUDED.active_timeframes, universe_size = EXCLUDED.universe_size,
        confidence_threshold = EXCLUDED.confidence_threshold, final_score_min = EXCLUDED.final_score_min,
        regime_weight_min = EXCLUDED.regime_weight_min, lq_min = EXCLUDED.lq_min,
        vn_max = EXCLUDED.vn_max, corr_max = EXCLUDED.corr_max, di_min = EXCLUDED.di_min
    `);
    console.log('  live/active_pattern inserted/updated.');

    // VTS Quant (live)
    await client.query(`
      INSERT INTO screener_filters (
        mode, filter_path, min_volume, min_liquidity, min_price, max_price,
        max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
        active_timeframes, universe_size, confidence_threshold, final_score_min,
        regime_weight_min, lq_min, vn_max, corr_max, di_min,
        managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
      ) VALUES (
        'live', 'vts_quant', 300000.00, 250000.00, 0.05000000, 100000.00,
        0.75, 100000000.00, true, 21,
        '["5m","15m","1h"]'::jsonb, 100, 60, 0.3500,
        0.3000, 25.00, 0.9800, 0.9500, 35.00,
        false, true, '["USD"]'::jsonb, false
      )
      ON CONFLICT (mode, filter_path) DO UPDATE SET
        min_volume = EXCLUDED.min_volume, min_liquidity = EXCLUDED.min_liquidity,
        min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price,
        max_bid_ask_spread = EXCLUDED.max_bid_ask_spread, min_market_cap = EXCLUDED.min_market_cap,
        exclude_stablecoins = EXCLUDED.exclude_stablecoins, min_history_days = EXCLUDED.min_history_days,
        active_timeframes = EXCLUDED.active_timeframes, universe_size = EXCLUDED.universe_size,
        confidence_threshold = EXCLUDED.confidence_threshold, final_score_min = EXCLUDED.final_score_min,
        regime_weight_min = EXCLUDED.regime_weight_min, lq_min = EXCLUDED.lq_min,
        vn_max = EXCLUDED.vn_max, corr_max = EXCLUDED.corr_max, di_min = EXCLUDED.di_min
    `);
    console.log('  live/vts_quant inserted/updated.');

    // VTS Pattern (live)
    await client.query(`
      INSERT INTO screener_filters (
        mode, filter_path, min_volume, min_liquidity, min_price, max_price,
        max_bid_ask_spread, min_market_cap, exclude_stablecoins, min_history_days,
        active_timeframes, universe_size, confidence_threshold, final_score_min,
        regime_weight_min, lq_min, vn_max, corr_max, di_min,
        managed_by_lottie, manual_override_enabled, quote_currencies, allow_regulated_only
      ) VALUES (
        'live', 'vts_pattern', 150000.00, 150000.00, 0.05000000, 100000.00,
        1.50, 50000000.00, true, 14,
        '["5m","15m","1h","4h"]'::jsonb, 100, 60, 0.3500,
        0.3000, 18.00, 0.9900, 0.9700, 20.00,
        false, true, '["USD"]'::jsonb, false
      )
      ON CONFLICT (mode, filter_path) DO UPDATE SET
        min_volume = EXCLUDED.min_volume, min_liquidity = EXCLUDED.min_liquidity,
        min_price = EXCLUDED.min_price, max_price = EXCLUDED.max_price,
        max_bid_ask_spread = EXCLUDED.max_bid_ask_spread, min_market_cap = EXCLUDED.min_market_cap,
        exclude_stablecoins = EXCLUDED.exclude_stablecoins, min_history_days = EXCLUDED.min_history_days,
        active_timeframes = EXCLUDED.active_timeframes, universe_size = EXCLUDED.universe_size,
        confidence_threshold = EXCLUDED.confidence_threshold, final_score_min = EXCLUDED.final_score_min,
        regime_weight_min = EXCLUDED.regime_weight_min, lq_min = EXCLUDED.lq_min,
        vn_max = EXCLUDED.vn_max, corr_max = EXCLUDED.corr_max, di_min = EXCLUDED.di_min
    `);
    console.log('  live/vts_pattern inserted/updated.\n');

    // Step 6: Verify seed data
    console.log('Step 6: Verifying seed data...');
    const result = await client.query(`
      SELECT mode, filter_path, min_volume, min_price, lq_min, vn_max, corr_max, di_min, max_bid_ask_spread, min_history_days
      FROM screener_filters
      ORDER BY mode, filter_path
    `);
    console.log(`\nTotal rows: ${result.rows.length} (expected 8)\n`);
    console.table(result.rows);

    if (result.rows.length !== 8) {
      console.warn(`\nWARNING: Expected 8 rows, got ${result.rows.length}`);
    } else {
      console.log('\nMigration complete. 8 rows confirmed.');
    }

  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
