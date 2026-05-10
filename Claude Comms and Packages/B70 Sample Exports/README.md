# B70 Sample Exports — README

**Snapshot taken:** 2026-05-05, PM2 #146.
**Two formats per table:**
- `<table>.csv` — raw export with JSONB columns as quoted JSON strings (programmer-friendly, harder to read in a spreadsheet).
- `<table>_flat.csv` — JSONB columns split into individual readable columns (use this one to view in a spreadsheet).

---

## Plain-language mapping — what each table is for

### 1. `pair_scan_archive` ← THE ONE WITH ALL THE SCAN DATA

**One row = one pair, one MCE cycle (every 60 seconds).**

This is the top-of-funnel: every pair the system scans gets a row with its full classification context — regime label, DBS score, ATR%, the 7 modulator inputs, and a feature snapshot (vwap, sma, momentum, ADX, volatility, volume, phase, etc.).

Today: ~38k rows / hour. Each pair you have under coverage gets one row per minute.

This is the data source for any "what was happening across the universe" analysis.

---

### 2. `signal_eval_archive` ← FUNNELS INTO OPEN/CLOSED TRADES

**One row = one strategy evaluating one pair, one moment in time.**

This is mid-funnel: for each pair the scanner admits, every strategy that's eligible for that pair's regime evaluates it. The result is one row per evaluation:

- `reject_stage = 'admitted'` → strategy fired a signal, the trade opened (this is the row that ties to **open trades**)
- `reject_stage = 'strategy_internal'` → strategy looked, didn't find a setup (e.g., `no_breakout`, `price_position`)
- `reject_stage = 'sqe'` → signal generated but failed Net-EV floor (rejected)
- `reject_stage = 'tcl'` → signal generated but blocked by duplicate-position or max-open-trades

Today: ~13k rows / hour. Almost all are `strategy_internal` (most pairs don't trigger most strategies, which is normal). 1 `sqe` row so far (Net-EV-floor rejection).

This is your **"why didn't my pair trade?" / "why did my pair trade?"** answer key.

---

### 3. `exit_decision_archive` ← CLOSED SIMULATED TRADES

**One row = one closed trade, with full state at exit.**

Captures: exit_reason (BE_stop / SL_hit / TP_target_hit / TRAIL_hit / time_stop), entry/exit prices, P&L%, R-multiple, duration, regime/DBS at entry vs at exit, and full state snapshot.

**Currently empty (0 rows).** Will populate as soon as a VTS trade closes. No open VTS trades have triggered an exit since the hook deployed an hour ago. Should populate within the next several hours as normal VTS turnover happens.

This is your **closed-simulated-trades audit log** with more depth than the existing `paper_sim_trades` table — it captures the at-exit context.

---

### 4. `macro_feed_archive` ← BTC DOMINANCE / MCAP / FUNDING TIMESERIES

**One row = one macro snapshot, every 60 seconds.**

The B67.1 macro feed values: BTC dominance %, market-cap momentum, funding rate, plus modifier value and fallback flag.

Today: ~786 rows. Joinable to `pair_scan_archive` and `signal_eval_archive` by timestamp so any cross-asset analysis can pull macro context.

---

### 5. `b62_retroactive_labels` ← OFFLINE ANALYSIS UTILITY

**One row = one historical VTS trade re-classified under the current B62 regime model.**

**Currently empty (0 rows).** This is the table the one-shot runner script populates when you ask it to. It's not part of the live capture stream — it's a tool for "what would the new classifier have called this old trade?" research.

To populate: `npx tsx server/scripts/b70-b62-relabel-runner.ts`. We can run it whenever you want.

---

## How to map B70 tables to your existing UI concepts

| Your concept | B70 table | How to query |
|---|---|---|
| "What did the scanner see?" | `pair_scan_archive` | filter by `symbol` and `captured_at` range |
| "What did each strategy do?" | `signal_eval_archive` | filter by `strategy` and `reject_stage` |
| "Open Trades" | `signal_eval_archive` rows where `reject_stage='admitted'` AND no matching row in `exit_decision_archive` yet | LEFT JOIN on `(symbol, strategy, captured_at)` close in time |
| "Closed Simulated Trades" | `exit_decision_archive` | filter by `captured_at` range |
| Filter Diagnostics / nulls breakdown | `signal_eval_archive` | GROUP BY `reject_stage`, `strategy` |
| Macro context at any moment | `macro_feed_archive` | nearest-timestamp join |

---

## Why some files are empty

| File | Why |
|---|---|
| `exit_decision_archive*.csv` | No VTS trade has closed since the hook was deployed (~1 hour ago). Will populate on next exit. |
| `b62_retroactive_labels*.csv` | The one-shot re-labeling runner hasn't been run yet. Run `npx tsx server/scripts/b70-b62-relabel-runner.ts` to populate. |

---

## Why the JSONB / "script in each row" appearance

The columns `features`, `modulators`, `gate_decision`, `scan_stage_decision`, `state_snapshot`, `snapshot`, and `retroactive_inputs` are stored as JSONB in Postgres so feature schema can evolve without migration. In the raw CSV they show as one cell with `{"foo":1,"bar":2,...}` content, which looks like code clutter in a spreadsheet.

The `<table>_flat.csv` versions split those JSONB blobs into individual columns named like `features__momentum`, `features__adx`, `modulators__macro_modifier_value`, etc. Open those in Excel / Google Sheets and every value is its own readable cell.

---

## Re-exporting

Both export scripts are on the staging server at `/tmp/b70-csv-export.cjs` (raw) and `/tmp/b70-csv-flat.cjs` (flattened). Trivial to re-run with different limits, date ranges, or symbol filters.
