# DawnTrader: Changes, Fixes & Improvements Registry

> **Author**: Claude Code (System Cartographer)
> **Created**: 2026-02-15
> **Purpose**: Tracks all bugs, architectural issues, inefficiencies, and recommended changes discovered during the systematic repository audit. Each item includes severity, location, verification status, and recommended timing (pre-MCE vs during-MCE vs post-MCE).
> **This is NOT the System Manual.** This is the action registry.

---

## How This Document Is Used

- Items are added during each audit phase
- Each item is verified against source code before inclusion
- Kyle reviews and prioritizes items
- ChatGPT / Replit can be consulted for second opinions
- Items marked "during-MCE" should be bundled into MCE directives
- Items marked "pre-MCE" are standalone fixes that should happen first

---

## Severity Levels

| Level | Meaning |
|-------|---------|
| **CRITICAL** | Produces incorrect results in the active trading path. Must fix. |
| **HIGH** | Significant architectural issue that will cause problems at scale or during integration. |
| **MEDIUM** | Inefficiency, duplication, or maintainability issue. Fix during related work. |
| **LOW** | Minor issue, cosmetic, or optimization opportunity. |

---

## BUGS

### INFRA-2026-05-06: Langston runtime migrated OpenClaw → Claude Code under Max OAuth — **SHIPPED**
- **Severity**: INFRA (cost + capability optimization, not a bug fix)
- **Trigger**: Langston via OpenClaw was costing ~$50/2-day in Anthropic API charges (~$750/mo). Kyle wanted to leverage his existing Max subscription.
- **Action**: Built two custom Python long-polling bridges on Hetzner `204.168.141.77`:
  - `langston-bridge.service` (`/usr/local/bin/langston-bridge.py`) — polls `@LangstonDTBot` getUpdates, invokes `claude -p --session-id <UUID> --model claude-opus-4-7` per inbound, posts replies, mirrors all in/out/silent to `/var/log/cc-bridge-inbox.jsonl`. No @-mention required in topic 21; Langston judges per his CLAUDE.md §11 and outputs `[SILENT]` to skip Telegram post.
  - `cc-comms-bridge.service` (`/usr/local/bin/cc-comms-bridge`) — polls `@CCDTCommsBot` getUpdates, writes inbound to shared log, provides `cc-comms-bridge send` CLI for outbound. Mirrors my outbound for Langston's visibility.
- **OpenClaw decommissioned**: both Telegram accounts (`default`, `ccdt-relay`) disabled in `/root/.openclaw/openclaw.json`. Gateway idle but not stopped (optional cleanup).
- **Bot-to-bot Telegram block**: documented as a platform constraint, not a bug. Workaround: shared filesystem log + SSH+`claude -p --session-id <UUID>` for AI-to-AI delivery (replaces OpenClaw `--deliver`).
- **Cost**: $200/mo Max sub replaces ~$750/mo API. Savings ~$550/mo.
- **Model**: Opus 4.7 with 1M context (auto-upgraded by Max plan; verified via SDK `modelUsage.contextWindow: 1000000`).
- **OAuth token**: `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06). Rotate by 2027-04 via `claude setup-token` from Kyle's laptop.
- **Persona migration**: 7 OpenClaw identity files (BOOTSTRAP/SOUL/IDENTITY/USER/AGENTS/TOOLS/MEMORY, 1368 lines total) compressed into `/home/langston/CLAUDE.md` (261 lines, includes §11 "When to respond in the group" rules) + `/home/langston/MEMORY.md` (mirrors project MEMORY.md, ≤200 lines).
- **Smoke test**: Kyle DM'd `@LangstonDTBot` with status check; coherent identity-aware response in <2 min. 1M-context research task delivered via SSH (Langston confirmed Max auto-upgrades Opus to 1M context, no flag needed).
- **Governance**: project `CLAUDE.md` §6 + §8 rewritten with new send/receive protocol + operations + diagnostic runbook. SYSTEM_MANUAL.md §27 marked SUPERSEDED with pointer to new canonical reference. MEMORY.md updated. Langston's CLAUDE.md/MEMORY.md updated.
- **Lesson**: Max plan supports headless agentic loops via OAuth tokens (`claude setup-token`) and supports Opus 4.7 1M context in `claude -p` mode without flag. Trust SDK `modelUsage.contextWindow` over the model's text self-description.

### BUG-2026-05-06-A: B72 main shipped without covering 9 in-class quant strategies; B72.1 audit reinforced wrong conclusion — **RESOLVED**
- **Severity**: HIGH (governance + materially incomplete lever sweep on highest-volume strategy in the system)
- **Location**: `server/services/strategy-engine.ts:87–1344` (the missed `detect*` methods); `LEVER_INVENTORY.md §13.1` and `BATCH_72_COMPLETION_REPORT.md §K.3` (the wrong conclusions that needed correction)
- **Problem**: B72 main's lever inventory pass enumerated `server/strategies/` filesystem and identified 9 strategies, but did NOT enumerate the 9 in-class `detect*` methods (`detectVWAPPullback`, `detectABCDLong`, `detectSMATrendRide`, `detectBreakout`, `detectMeanReversion`, `detectRangeTrading`, `detectVWAPBounce`, `detectLiquidityTrap`, `detectDHMA`) inside `strategy-engine.ts`. Their 131 hardcoded parameters never made it into `module_constants`. B72.1 closure audit then doubled down on the gap by reading only the exit-condition `switch` block at `strategy-engine.ts:903` and concluding the 9 in-class strategies were "exit-only stubs / dead code candidates" — without reading the actual `detect*` methods in the same file at lines 87–1344. CLAUDE.md "17 canonical strategies" was also stale (actual is 18 — B63 added strong_bull_trend).
- **Why it mattered**: `vwap_pullback` alone produced 26,540 evaluations / 7d on staging — the highest-volume strategy in the system. B72's "comprehensive lever sweep" claim was materially incomplete. Five additional vts-runner-vs-signal-orchestrator parameter discrepancies (`breakout.volumeMultiplier` 1.5/2.0, `mean_reversion.deviationThreshold` 2.0/2.5, `range_trade` triplet) were also unaddressed.
- **Fix**: B72.2 (`eeabb7147` SQL seed + `6c42dc370` Slices 2-5 wiring). Seeded 131 rows under 9 new `strategy.<key>` modules; refactored all 9 `detect*` methods to read from `module_constants`; stripped dispatcher param-object literals across 4 dispatcher files. Coverage now 18/18 canonical strategies DB-tunable. B72.1 §13.1 + §K.3 corrected with appendix sections noting the original conclusion was wrong.
- **Lesson**: filesystem-grep audits miss in-class methods. Strategy enumeration must use `STRATEGY_DISPLAY_NAMES` (canonical SSOT in `canonical-regime-strategy-map.ts`) as the authoritative list, and grep for `detect<StrategyName>(` patterns class-wide AND filesystem-wide. Audit conclusions that contradict production telemetry (e.g. "this strategy is dead code" when the DB shows 26k evaluations / 7d) must trigger a re-audit, not be shipped. Kyle's pushback caught this — the workflow needs an independent challenge gate before audit conclusions become governance truth.

### BUG-2026-05-05-E: B72 warmup wired AFTER Boot Orchestrator initialization — **RESOLVED**
- **Severity**: HIGH (silent operational failure — VTS pipeline dormant)
- **Location**: `server/index.ts` ordering of `bootOrchestrator.initialize()` vs `warmModuleConstantsForSyncCallers()`
- **Problem**: VTS auto-start runs INSIDE `bootOrchestrator.initialize()` and triggers `pruneReentryMaps → getSetupHashExpiryMs → getCachedNumberRequired('vts_runner', ...)` against cold cache. `[BOOT][VTS] Auto-start failed: First cycle failed: module_constants: module 'vts_runner' is not warm`. Server stays online but VTS pipeline never recovers — strategies never evaluated, 0 open simulated trades for 1+ hour windows. Witnessed PM2 #155 → #161.
- **Root cause**: b72-warmup wired to run after Boot Orchestrator init, but Boot Orchestrator's VTS auto-start is the first sync caller of the new module_constants API. Ordering violated the implicit invariant that warmup precedes any sync caller.
- **Fix**: commit `c1afdfac` — moved warmup BEFORE `bootOrchestrator.initialize()`. Verified `[B72][INIT_OK] (pre-orchestrator)` precedes `[VTS_RUNNER] INIT_OK` on PM2 #162+.
- **Lesson**: boot-time hard-fail discipline only works when warmup actually runs first. For any future sync-read API addition, audit the FULL boot sequence — not just the obvious caller.

### BUG-2026-05-05-F: B72 vts-runner.ts `VTS_MAX_CONCURRENT_PER_COMBO` undefined at 2 callsites — **RESOLVED**
- **Severity**: HIGH (every VTS strategy execution thrown silently)
- **Location**: `server/services/vts-runner.ts:1289` (DUP_GUARD log) + `:2887` (outer-loop dup pre-check)
- **Problem**: Slice 2d removed `const VTS_MAX_CONCURRENT_PER_COMBO = 1` and replaced the primary callsite with `getVtsMaxConcurrentPerCombo()`. Two additional sites (a console.log interpolation at L1289 and an outer-loop duplicate-check at L2887) were missed. Every VTS strategy execution raised `ReferenceError: VTS_MAX_CONCURRENT_PER_COMBO is not defined`. detected=15-21 per cycle, signals=0.
- **Fix**: commit `4ad40b95` — both sites now use `getVtsMaxConcurrentPerCombo()`.

### BUG-2026-05-05-G: B72 expectancy.ts `FRICTION_SAFETY_BUFFER` / `ROI_MIN` / `ROI_MAX` undefined at 2 callsites — **RESOLVED**
- **Severity**: HIGH (every signal that reached ROI gate threw silently)
- **Location**: `server/core/calculations/expectancy.ts` `isSignalProfitable` (L291) + `getROIDetails` (L414+)
- **Problem**: Slice 2a removed the imports for ROI_FLEX_MULTIPLIER / ROI_MIN / ROI_MAX / FRICTION_SAFETY_BUFFER from `adaptive-thresholds.ts` and migrated `getDynamicROIThreshold` to read from module_constants. Two other consumers (`isSignalProfitable` friction floor, `getROIDetails` validation result) were missed. Every signal that reached the ROI gate threw `ReferenceError: FRICTION_SAFETY_BUFFER is not defined` → `signals=0 stratNulls=147` despite 18+ detections per cycle.
- **Fix**: commit `1a3038a4` — both functions now read via `getCachedNumberRequired('expectancy_gates', ...)`.
- **Pattern note (E + F + G shared root cause)**: mass-migration grepped primary callsites but missed (a) string-interpolated log lines, (b) sibling functions in the same file, (c) helper functions reachable from migrated entry points. **Mitigation**: post-migration, do `grep -rn "<OLD_CONST_NAME>" server/ --include="*.ts"` on every removed const before push. TypeScript build error would have caught these; the legacy-baseline TS Check failure masks new errors. Recommend `tsc --noEmit` on touched files before push as a personal CI step.

### BUG-2026-05-03-A: B69 Ticker Snap Retag Statement Timeout on Large Tables — **OPEN (deferred)**
- **Severity**: MEDIUM (existing rows have stale `equity_spot`/`equity_perp` values; new rows correctly use `xstock_*`)
- **Location**: `equity_spot_ticker_snap` (~4M rows), `equity_perp_ticker_snap` (~1.8M rows)
- **Problem**: B69 retag script (`npm run db:b69-retag`) uses PL/pgSQL loop with 5000-row batches to UPDATE `asset_class` from `equity_spot` → `xstock_spot` (and `equity_perp` → `xstock_perp`). On Supabase's connection pooler (pgbouncer), the statement timeout kills the UPDATE after the configured limit. After the timeout, Supabase pooler enters read-only mode ("cannot execute UPDATE in a read-only transaction") requiring connection reset. OHLC tables (1.2M + 260k rows) were successfully retagged before the timeout hit on ticker snap tables.
- **Detection**: B69 Step 7 verification — retag script output showed `SET` then `ERROR: canceling statement due to statement timeout`.
- **Workaround**: Run the retag SQL directly via Supabase SQL Editor (bypasses pgbouncer pooler, uses direct connection with longer/no timeout). Alternatively, reduce batch size to 1000 rows and add `pg_sleep(0.1)` between batches.
- **Impact**: Read queries filtering by `asset_class = 'xstock_spot'` will miss historical ticker rows until retag completes. New rows inserted after B69 deploy correctly use `xstock_*` values. No impact on OHLC tables (fully retagged). No impact on trading pipeline (ticker archive is passive/observational only).
- **Status**: OPEN — deferred to next Supabase SQL Editor session. Non-blocking.

### BUG-2026-04-30-I: B74 Equity Perp OHLC at 0 rows (Kraken Futures WS has no candle feed) — **RESOLVED**
- **Severity**: HIGH (perp OHLC table empty for 1+ hours despite WS connection healthy)
- **Location**: `server/services/passive-archive/equity-perp-archiver.ts`
- **Problem**: B74 v1 implemented Kraken Futures perp OHLC capture via WS subscription `feed: 'candles_trade_1m'`. That feed name does not exist on Kraken Futures WS — Kraken Futures has no candle/kline subscription feed at all. WS connection accepted the subscription request without error but returned no candle data. Symptom: ticker stream populated 1,478 rows / 10 syms while OHLC table stayed at 0 rows.
- **Detection**: B74 Step-7 verification — DB row count zero for `equity_perp_ohlc_1m` despite all other 5 tables capturing data.
- **Fix** (`b8eba807` 2026-04-30, B74.1): rewrote equity-perp-archiver to dual-path. WS for ticker only (was already working); REST polling at `https://futures.kraken.com/api/charts/v1/trade/<sym>/1m` every 60s with per-symbol last-seen-interval dedup map, 100ms inter-symbol space-out. Endpoint returns 2000 1-min candles per call (~5.5 days back) → initial poll provides historical backfill in addition to ongoing capture.
- **Lesson**: For exchange WS protocols, verify feed/channel names against live-probe behavior, not just docs. The Kraken Futures WS docs at the time of B74 v1 listed candle-related fields under message schemas without explicitly enumerating which feeds emit them — easy to assume a subscription name that doesn't actually exist. When in doubt, REST endpoints are the canonical truth for historical/aggregated data.

### BUG-2026-04-30-J: B74 Bulk Insert Exceeds Postgres 65,535-Parameter Bind Limit — **RESOLVED**
- **Severity**: HIGH (initial perp REST backfill of 20,000 rows silently dropped)
- **Location**: `server/services/passive-archive/ohlc-batch-writer.ts` + `ticker-batch-writer.ts`
- **Problem**: Drizzle `db.insert(table).values(rows)` builds a single parameterized INSERT statement. With OHLC rows having ~12 columns, 20,000 rows = 240,000 parameter placeholders → exceeds PostgreSQL's hard 65,535 bind-message parameter limit → query fails. Drizzle does NOT auto-chunk by default (verified during B74.1 verification). Surfaced when equity-perp's first REST poll buffered 20,000 historical bars (2000 candles × 10 symbols) and the entire batch was silently dropped; only subsequent 60s polls (~10 new bars) succeeded.
- **Detection**: B74.1 verification — log showed `polled 10 symbols, 20000 new bars` but DB row count was only 10 after several flush cycles.
- **Fix** (`b9c4ebbb` 2026-04-30): chunk batch inserts in CHUNK_SIZE=1000 rows in both `ohlc-batch-writer.ts` and `ticker-batch-writer.ts`. With ~12 OHLC columns × 1000 rows = 12,000 parameters per chunk — comfortable headroom under the 65,535 limit. Multiple smaller INSERTs per flush cycle, partition routing still automatic.
- **Lesson**: When using ORM bulk-insert helpers, verify chunking behavior against the underlying DB's parameter limits. Drizzle/Postgres pattern is to chunk explicitly in caller code. Alternative is `pg-format` or `COPY`-style bulk import for very large batches; for B74's typical 100-1000 row buffers chunking is sufficient.

### BUG-2026-04-30-F: B74 Config Path via `import.meta.url` Doesn't Survive esbuild Bundle — **RESOLVED**
- **Severity**: HIGH (B74 archivers silently failed to start at boot)
- **Location**: `server/services/passive-archive/universe-loader.ts`
- **Problem**: Universe-loader resolved JSON config paths via `path.dirname(fileURLToPath(import.meta.url))` + relative `../../config`. In dev this resolves correctly inside `server/services/passive-archive/`. After esbuild bundles to single-file `dist/index.js`, `import.meta.url` resolves to `dist/` and the relative path doesn't reach `server/config/`. Universe-loader threw ENOENT, bootstrap's per-archiver `.catch()` swallowed the error to a log line that wasn't surfacing distinctly. Symptom: `[B74][bootstrap] passive archive pipeline started` log printed, but no `[B74][universe] equity_spot loaded: ...` follow-up; 60s health logs showed `connected=false` for all archivers; tables stayed empty.
- **Detection**: Kyle observation post-B74 deploy that DB row counts were 0; investigated PM2 logs and found bootstrap completed without universe-load logs.
- **Fix** (`bd60add3` 2026-04-30): switched to `process.cwd()`-based path. The dawntrader app is always launched from project root by PM2, so cwd is `/home/deploy/dawntrader/` — stable in both dev and prod.
- **Lesson**: When a project bundles via esbuild to a single dist file, `import.meta.url`-based path resolution is a known footgun. Use `process.cwd()` or absolute paths for runtime-resolved files (configs, fixtures). Add a runtime-test step (not just `npm run check`) before declaring a feature shippable — the bundled output has different path semantics than source-tree TypeScript.

### BUG-2026-04-30-G: B74 Migration Partition Off-By-One on Deploy Day — **RESOLVED**
- **Severity**: HIGH (all inserts failed for hours until UTC midnight rolled over)
- **Location**: `drizzle/migrations/2026-05-01-b74-passive-archive-tables.sql` DO block
- **Problem**: Migration's DO block pre-created 12 monthly partitions starting from `DATE '2026-05-01' + (i || ' months')::INTERVAL` — covering May 2026 through April 2027. But the migration was applied on 2026-04-30 22:31 UTC (still April). Postgres has no partition for the current month → all inserts fail with `ERROR: no partition of relation "equity_spot_ohlc_1m" found for row` for ~1.5 hours until UTC midnight rolls into May 2026 (which IS pre-created). Bootstrap's headroom check passed because it queried the LATEST partition end date (2027-05-01, > 2 months ahead) without verifying CURRENT-month coverage.
- **Detection**: Manual `INSERT INTO equity_spot_ohlc_1m ... VALUES (... NOW() ...)` returned the partition error after observing that DB row counts were 0 despite archivers reporting `rows_persisted_60s` non-zero.
- **Fix** (`778cd4ed` 2026-04-30): bootstrap's `checkPartitionHeadroom` now ALSO ensures current-month partition exists, creating it inline with `[B74][partitions][SELF-HEAL] created missing CURRENT-month partition` warn log if missing. Catches both this off-by-one AND any future monthly-cron miss. Manually created the 2026-04 partitions on staging during the incident.
- **Lesson**: Time-relative migration logic (date arithmetic from a hardcoded anchor) is fragile when deploy day doesn't match the anchor. Either: (a) pre-create partitions starting from `date_trunc('month', NOW())` in the DO block, OR (b) add bootstrap-time self-heal that ensures critical partitions exist regardless of migration timing. We chose (b) because (a) requires post-migration restart to re-run. Bootstrap-time self-heal is more robust for the live system.

### BUG-2026-04-30-H: FNV-1a Hash Low-Bit Bias Causes Imbalanced WS Sharding — **RESOLVED**
- **Severity**: MEDIUM (one shard exceeded recommended 300-symbol limit)
- **Location**: `server/services/passive-archive/crypto-spot-archiver.ts` — `fnv1aHash()` function, used for `hash(symbol) % shardCount` sharding
- **Problem**: Bare FNV-1a 32-bit hash has weak avalanche on the low bits. When inputs share suffixes (all 380 crypto pairs end in `/USD`, `/USDT`, or `/USDC`), the hashed values cluster on the low bits — `% 2` produced 364/16 shard distribution (96%/4% bias) instead of expected ~190/190.
- **Detection**: Bootstrap logs showed `[B74][crypto-spot][shard0] subscribed ... for 364 symbols` and `[shard1] for 16 symbols`. Shard0 exceeded the 300-symbol Kraken WS v2 recommended limit per Langston cc-inbox #869 Q3.
- **Fix** (`778cd4ed` 2026-04-30): added Murmur3 fmix32 finalizer (xor-shift-multiply three times) after the FNV-1a main loop. The avalanche function spreads the bits uniformly so `% shardCount` distributes evenly. Post-redeploy: 180/201 split — both shards under the 300 recommended limit.
- **Lesson**: For hash-mod sharding with small modulo (especially `% 2` or `% 4`), bare FNV-1a is insufficient. Always apply a finalizer (Murmur3 fmix32 is the standard) when the input domain has suffix or prefix bias. Pattern is well-documented but easy to miss when implementing from scratch.

### BUG-2026-04-30-D: B73 Variant Collapse Persists After B73.1 (1-min OHLC vs Live TEC Tick Resolution) — **RESOLVED**
- **Severity**: HIGH (B73 framework still un-decision-grade despite morning hotfix; ALL variants on ALL trades collapse to identical inherited values)
- **Location**: `server/services/exit-strategy-replay-service.ts` (OHLC fetch window + ATR derivation) + `server/services/exit-strategy-replay.ts` (variant trigger thresholds)
- **Problem**: Variant A pass-through worked (B73.1) and TIMEOUT inheritance worked (B73.1) — but variants B-L STILL all fell into the inheritance path because no variant level ever fired within the OHLC replay window. Diagnosed by direct Kraken OHLC pull on AIXBT/USD trade (90 min duration, real exit `break_even_stop` at 0.03079): max bar high was 0.03164 (+0.5% above entry), but BE trigger threshold (entry + 1×ATR_proxy) was at 0.033586 (+5.9% above entry). No 1-min bar's high ever crossed the trigger level. Yet the live trade DID latch BE in real life — meaning live TEC monitored price at sub-minute resolution via the pricing-service tick cache and saw a brief price spike that the 1-min OHLC aggregate doesn't expose. Two compounding root causes: (1) ATR proxy `(target − entry) / 1.5` is wildly larger than the typical 1-min bar range (live ATR is computed on a different timeframe and reflects 1-hour-scale ranges, ~2-5% of price), so triggers were unreachable at bar resolution; (2) OHLC window capped at `exitTime + 1h` was too short to let Variants F (no_BE_stop) and K (no_BE_no_trail) see whether the original target would eventually have hit after the live BE_stop closed the trade.
- **Detection**: Kyle observation 2026-04-30 afternoon — UI showed all 12 variants with identical Mean P&L = -0.487 across 5 closed trades.
- **Fix** (`a98ce7ff` 2026-04-30, B73.2): per Langston cc-inbox #866: (a) Bar-derived ATR — recompute from 14 1-min bars BEFORE entry as 14-period TR average. Variant trigger thresholds use this instead of the proxy. Replay ATR ≠ live ATR; framework now answers "what would variant X have done with bar-resolution thresholds" not "what would variant X have done in the live world" — acceptable trade-off for variant-comparability per Langston Q1. (b) Extended OHLC window to `entryTime + maxHoldMs` (7d) regardless of actual exit. Pagination enabled (10080 candle cap, 14 batches × 720 candles, 500ms delay). Async fire-and-forget so 7s pagination doesn't block trade-close. (c) Both `atr_live` and `atr_bar_derived` logged in metadata of every variant row for diagnostic validation of live↔bar ATR divergence. Wiped 180 useless inherited-only rows.
- **Verification**: Pending — first new VTS close post-deploy (PM2 #119) will populate 12 rows; expect Variants B-L to differentiate now that triggers fire at bar resolution AND F/K can see post-exit reality.
- **Lesson**: Replay frameworks running on 1-min OHLC cannot reproduce sub-minute price movements that drive live exits. The choice is either (i) match live data fidelity (heavy infra: tick cache replay), (ii) accept the limitation and document it (no variant divergence visible), or (iii) intentionally degrade replay thresholds to bar-resolution scale so variants stay internally comparable. We chose (iii) for B73 — Sharpe paired-diff metric requires comparability not absolute fidelity. When designing future ablation frameworks, decide upfront which fidelity property matters and pick data resolution accordingly.

### BUG-2026-04-30-E: B67 Factor Ablation Comparison Panel Was Decoratively Dead Pre-B67.5 — **RESOLVED**
- **Severity**: MEDIUM (UI implied analysis when none was happening; eroded user trust in the framework)
- **Location**: `client/src/pages/analytics.tsx` (`AblationComparisonSection`) + understanding gap in panel's purpose
- **Problem**: Factor Ablation Comparison panel showed columns for "Both Admit", "Real Admit / Alt Reject", "$ Saved if Alt Active" — all of which require the alternate decision to produce a DIFFERENT admit/reject outcome from reality. Pre-B67.5, no downstream consumer (Kelly sizer, admission gates) reads the confidence value, so REAL and ALT decisions ALWAYS produce the same admit/reject outcome. Result: every column except total/replayed/pending always reads zero, making the panel look broken or non-functional. The 14-day calibration window seemed to be collecting nothing useful. **The actual analysis Kyle wanted — does each factor materially shift confidence values, and does high confidence correlate with better trade outcomes — IS captured in `regime_factor_alternates.alternateDecision.confidence` for every signal but was never surfaced in any UI panel.**
- **Detection**: Kyle observation 2026-04-30 afternoon: "we set up this ablation table with all these different rows... my assumption was that there were calculations being done in the background based on running the numbers with that variable involved or without it involved... but you're telling me that we're putting in all these levers, and we're not going to get anything out of it."
- **Fix** (`a98ce7ff` 2026-04-30): NEW `computeFactorCalibration()` aggregator function in `drift-dashboard-aggregator.ts` + `GET /api/analytics/factor-calibration` endpoint + new `FactorCalibrationSection` UI panel rendered ABOVE the existing Factor Ablation Comparison. Two sub-views per factor: (1) confidence-shift distribution table (avg REAL conf, avg ALT conf, avg shift, avg |shift|, max |shift|, % trades with shift=0); (2) tertile WR analysis splitting closed VTS trades into 3 equal-size buckets by REAL confidence, computing WR per bucket, plus same on ALT confidence, plus predictive lift = REAL spread − ALT spread. Decision-grade gate at n ≥ 150 per tertile bucket per Langston cc-inbox #856. Existing Factor Ablation Comparison panel labelled SUBSTRATE with explanatory pre-B67.5 note pointing readers to the calibration panel; left in UI per Kyle directive (will become useful post-B67.5).
- **Verification**: Endpoint responds with structurally correct payload; with n=1 today the tertile splits show 0/0/1 (expected). Will populate as trades accumulate over the 14d window.
- **Lesson**: When building telemetry/ablation UI, the analytical question the user wants answered ("does this lever add value?") is often answerable on captured DATA without needing the consumer-side wiring. Do not gate the analysis surface on the consumer rollout. Build the predictive-value view on day one of telemetry collection so the user can monitor evolution mid-window and make early decisions.

### BUG-2026-04-30-A: B67.0 Factor Ablation Replay Join Broken (0/1406 matches) — **RESOLVED**
- **Severity**: HIGH (factor ablation table un-decision-grade for 6 days)
- **Location**: `server/services/vts-runner.ts:1474-1488` emit + `server/services/vts-service.ts:769-770` JSONL write + `server/scripts/replay-ablation.ts:80-127` index
- **Problem**: Two different code paths produced different VTS-trade IDs. Factor-ablation-emitter wrote `vts_trade_id = signal.id = vsig_p10_<ts>_<rand>` (vts-runner format). Persisted JSONL wrote `signal.id = vts_<sym>_<strategy>_<ts>` (vts-service format). The replay-ablation cron job indexed JSONL by `signal.id` and joined on `vts_trade_id` — these never matched, so 1406 pending rows remained pending across 6 days with `matched=0` every nightly run.
- **Detection**: Kyle 2026-04-30 morning observation that Factor Ablation Comparison panel showed Total + Pending columns only, all stats columns at 0.
- **Fix** (`3afd8ed2` 2026-04-30, B67.0.1): switched join from ID-based to natural-key tuple `(pair_symbol, evaluated_at±60s, strategy)` — derived from same source data on both emit and JSONL sides, immune to ID-format drift. Added `strategy` column to `regime_factor_alternates` + composite index. Updated emitter signature + both call sites (vts-runner, signal-orchestrator) to pass strategy. Rewrote `buildVtsTradeIndex` to key by `(symbol|strategy)` with `findVtsTradeByNaturalKey` doing ±60s tolerance match. Wiped 1477 NULL-strategy pre-fix rows. Per Langston cc-inbox #864 Q1.
- **Verification**: ad-hoc `npm run b67:replay-ablation` post-deploy matched 4 rows (FLOW/USD strong_bull_trend close); API now returns `bothAdmit=1 replayed=1` per factor (was 0).
- **Lesson**: When two code paths mint IDs for the same logical entity, prefer a natural-key derived from shared source data (symbol + entry_time + strategy) over ID-based joins. ID-based joins work only as long as both sides use the same generator; under refactor pressure they silently break and the failure surface (0 matches) looks identical to "no data yet."

### BUG-2026-04-30-B: B73 Exit-Strategy Ablation Variant Collapse (11/12 identical) — **RESOLVED**
- **Severity**: HIGH (exit-strategy ablation un-decision-grade despite running cleanly)
- **Location**: `server/services/exit-strategy-replay.ts` (Variant A simulation + `timeoutExit`) + `server/services/vts-service.ts:891-919` B73 hook (ATR proxy)
- **Problem**: Across 39 trades, every variant exited on the same bar at the same price (only Variant H's tighter trail ever produced a `TRAIL_hit`, 2 of 39). Three structural causes: (a) **ATR proxy** `atr = (target-entry)/1.5` mis-scaled BE triggers — real TEC may use a different `target_lock_r`, so BE never fired in replay and all BE variants behaved like F (no_BE_stop); (b) **TIMEOUT exit** synthesized last-bar mid `(high+low)/2` — identical for all 12 variants, producing the artificial 12-way tie on the 64% of trades that hit TIMEOUT; (c) **Variant A re-simulated** instead of being live truth — sample SL_hit row had `baseline_pnl_pct=+0.62%` (real BE_stop exit) but A returned `-0.11% SL_hit`, breaking the paired-diff Sharpe vs A baseline.
- **Detection**: Kyle 2026-04-30 morning observation that Exit-Strategy Ablation panel showed all variants with near-identical stats except H.
- **Fix** (`3afd8ed2` 2026-04-30, B73.1): (a) Plumbed real `atrAtOpen` through `vts-service.persistRealPriceTrade` to B73 hook (drop the `/1.5` proxy as primary; kept as fallback for legacy open trades). (b) `timeoutExit()` now inherits realized exit values (`actualExitPrice`/`actualExitTime`/`actualExitReason`/`actualPnlPct`) instead of synthetic mid — non-firing variants register zero diff vs A, real differentiation only when a variant actually fires. (c) New `mkVariantAFromRealized` returns realized values directly — A is no longer simulated; it IS live truth. Wiped 480 bad pre-fix rows. Tests rewritten for new semantics. Per Langston cc-inbox #864 Q2(a)+(b)+(c).
- **Verification**: First post-fix close (BIO/USD strong_bull_trend) populated 12 rows with `source: realized_truth` for A and `source: realized_inherited` for B-L, with metadata explaining why each didn't fire (`be_latched: false`, `trail_active: false`, `phase: pre`).
- **Lesson**: Ablation framework Variant A baseline must equal realized P&L by construction, not re-simulation. Re-simulation will diverge from live behavior under any model imprecision (1-min OHLC vs sub-second tick monitoring, ATR proxy vs real ATR, hit-check ordering vs real-time stop semantics) — and that divergence breaks the paired-diff metric the framework is designed around.

### BUG-2026-04-30-C: drift-dashboard Aggregator Field-Name Drift — **RESOLVED**
- **Severity**: MEDIUM (UI showed 0 counts despite replay populating rows correctly)
- **Location**: `server/services/drift-dashboard-aggregator.ts:484-495`
- **Problem**: Aggregator queried `replay_outcome->>'notes' = 'admit_admit_no_delta'` and `replay_outcome->>'alternateOutcome'`, but `replay-ablation.ts` writes `notes='pre_b67_5_both_admit'` and `outcome='admitted_breakeven|admitted_won|admitted_lost'`. Strings were never aligned — likely never were aligned because B67.0 shipped with empty alternates and B67.1+ filled them later with a different shape than what the aggregator query expected.
- **Detection**: While verifying B67.0.1 fix end-to-end — replay matched 4 rows but `bothAdmitCount=0` in API response.
- **Fix** (`f6a0bb87` then `67cf66d9` for backtick-in-template build error, 2026-04-30): aligned aggregator query to actual emitter shape — `outcome` LIKE 'unreplayable_%' instead of `alternateOutcome`, `notes='pre_b67_5_both_admit'` instead of `'admit_admit_no_delta'`, `outcome='unreplayable_real_rejected'` for realRejectAltAdmitCount.
- **Verification**: API now returns `bothAdmit=1 replayed=1` per factor matching DB count.
- **Lesson**: Aggregator and emitter for the same JSONB column should share a schema-like contract (TypeScript types or constants). String drift between the two is invisible until users complain about UI counts. Add explicit aggregator-emitter contract test in B72 lever-sweep batch.

### BUG-001: VTS Signal Generation Is Generic — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Phase 14.1, Batch 15 HF6-HF7, Batch 16 HF8 `052fb224`, Batch 17 HF9 `f9fa56c6`)
- **Location**: `server/services/vts-runner.ts`
- **Problem**: ~~Generates random regime-adjusted scores instead of real strategy-specific calculations~~ VTS now wired to real strategy detect functions (HF6). Volume=0 bug fixed (HF6B). Regime classification recalibrated for crypto DX values (HF7). VTS timeframe aligned to 60-min (matching orchestrator), OHLC increased to 100 candles, BTC candles provided for defensive_hedge, strategy params relaxed, duplicate FinalScore checks removed from paper-execution-engine + RTB, return type fixed, confidence floor centralized to SQE, analytics tab wired to /api/regime-map (HF8). DSS fully deleted (superseded by MCE + detect functions), governance gate (11.7R-E) migrated to SQE, VTS IMF filters relaxed (LQ>=25, VN<=0.80, rho<=0.95) with filterTier tagging, closed trades context columns fixed, stale regime names fixed in telemetry-aggregator (HF9). OHLC cache (5-min TTL) eliminates redundant Kraken API calls for both VTS and orchestrator, orchestrator migrated to priceCache for ticker data, BATCH_SIZE increased to 300 pairs, filterTier added to export-csv push object (Batch 18 `4b6b2fa9`).
- **Impact**: VTS now produces real strategy-specific entry/stop/target from StrategyEngine detect functions. VTS and orchestrator use same 60-min timeframe — ML learning transfers directly. Mean_reversion and range_trade strategies confirmed firing in production (~2 trades/cycle). Phase 14.1B (timeframe alignment) eliminated from roadmap.
- **Remaining work**: ~~DSS pre-selector~~ DSS deleted entirely — MCE regime filtering + detect functions cover all DSS functionality. ~~Secondary metrics programmatic format~~ Deemed redundant — detect functions already evaluate these conditions internally; left as documentation in canonical-regime-strategy-map.ts. Pattern/hybrid strategies structurally unable to fire — returns "No pattern signal" across all pairs (Phase 14.5 needed). `config/vts.json` `pairsPerCycle` field is NOT consumed by vts-runner.ts — pair count comes from FX5 scanner output (now including relaxed-filter pairs via VTS IMF relaxation).
- **Phase Found**: Pre-audit (v1.0)

### ~~BUG-002~~: Active Trading Path Uses Legacy DSS Regime Model — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Directive 12.3.1 Batch 13 `4d8ef060` + Phase 13 Batch 14 `8f26369a`)
- **Location**: `server/services/dynamic-strategy-selector.ts`, `server/services/signal-orchestrator.ts`
- **Problem**: ~~Uses `SYSTEM_GUARDS.STRATEGY_MAP` (6 regimes, 9 quant) instead of canonical map (5 regimes, 17 strategies)~~ DSS rewired to `calculatePairRegime()` in Batch 13. Signal orchestrator now uses MCE (`computeContext()`) for regime + indicators in Batch 14. All 17 strategies reachable.
- **Resolution**: Batch 13 rewired DSS to canonical map. Batch 14 installed MCE as centralized regime/indicator service — signal orchestrator calls `MCE.computeContext()` instead of DSS for regime. `CANONICAL_REGIME_STRATEGY_MAP` is the sole strategy routing authority.
- **Phase Found**: Pre-audit (v1.0)

### ~~BUG-003~~: Signal Orchestrator Legacy Strategy Map — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Directive 12.3.1 Batch 13 `4d8ef060` + Phase 13 Batch 14 `8f26369a`)
- **Location**: `signal-orchestrator.ts`
- **Problem**: ~~Reads from `SYSTEM_GUARDS.STRATEGY_MAP`, complementary layer to DSS both using legacy source~~ Signal orchestrator now uses `mceContext.regime.allowedStrategies` from MCE, which looks up strategies via `CANONICAL_REGIME_STRATEGY_MAP`. Legacy `getRegimeAllowedStrategies()` no longer called for regime routing.
- **Resolution**: Batch 13 wired DSS to canonical map. Batch 14 replaced DSS regime call + inline VWAP/SMA with MCE's `computeContext()`. Strategy filtering now uses MCE's pre-computed `allowedStrategies`.
- **Phase Found**: Pre-audit (v1.0)

### BUG-004: DI Probability Divergence — NGC Masquerading as Directional Integrity — **RESOLVED**
- **Severity**: CRITICAL
- **Location**: `signal-orchestrator.ts` line 1127 (was line 1128)
- **Code**: `const DI = calculateDirectionalIntegrity(closePrices);`
- **Status**: **RESOLVED** — Directive 12.1.1, Batch 1, commit `ea6551af` (2026-02-22)
- **Resolution**: Replaced `DI = normalizedConf * 100` with `calculateDirectionalIntegrity(closePrices)` — geometric DI from OHLC close prices already in scope. DSS path and Expectancy Gate path now use the same DI source.
- **Original Problem**: The DSS kernel call converted NGC (blended confidence score) into a fake DI value. The kernel uses DI to compute `Pwin = 0.40 + DI/200`. Pwin was driven by blended confidence, NOT by price path geometry as designed.
- **Verified**: Yes — code-confirmed 2026-02-15, corroborated by ChatGPT grounded review
- **Phase Found**: Phase 1 (ChatGPT review)

### BUG-005: cost-model.ts getCostMetricsCache() Returns Empty Map
- **Severity**: LOW
- **Location**: `server/core/math/cost-model.ts` — `getCostMetricsCache()`
- **Problem**: Calls `getCacheStats()` but then ignores the result and returns `new Map()` unconditionally
- **Impact**: Does not affect runtime cost calculations. Breaks cache introspection/diagnostics only.
- **Verified**: Yes
- **Timing**: During MCE or anytime (trivial fix)
- **Fix**: Return actual cache contents from cost-cache.ts
- **Phase Found**: Phase 1

---

## ARCHITECTURAL RISKS

### ~~RISK-001~~: VTS/Active Trading Regime Math Drift — **RESOLVED**
- **Severity**: ~~HIGH → CRITICAL~~ **RESOLVED** (Directive 12.3.1, Batch 13, commit `4d8ef060`)
- **Location**: ~~VTS uses `market-regime.ts` `calculatePairRegime()` (Engine #2), active trading uses DSS `volNoise/trendSlope` (Engine #1)~~ Both VTS and active trading now use `calculatePairRegime()` from `market-regime.ts`.
- **Impact**: ~~Same pair gets different regimes depending on code path.~~ Regime models unified. VTS ML calibration and production use the same 5-regime canonical model.
- **Resolution**: DSS rewired to call `calculatePairRegime()` (Directive 12.3.1). Engine #1 (DSS legacy) replaced with Engine #2 (canonical).
- **Phase Found**: Pre-audit, deepened Phase 2 (ChatGPT/Replit analysis)

### ~~RISK-002~~: OHLC Indicator Computation Duplication — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~VWAP, SMA computed independently in signal-orchestrator.ts AND strategy-engine.ts~~ MCE now centralizes VWAP/SMA/ATR computation. Signal orchestrator and VTS runner both call `MCE.computeContext()`.
- **Resolution**: Market Context Engine (MCE) installed as centralized indicator service (Batch 14). Signal orchestrator's inline VWAP/SMA computation replaced with MCE pre-computed values. VTS runner's direct `calculatePairRegime()` calls replaced with MCE. Note: strategy-engine.ts retains internal VWAP/SMA methods — these operate on different data subsets (session candles, specific SMA lengths) and are not the same duplication MCE fixes.
- **Phase Found**: Pre-audit

### ~~RISK-003~~: DSS Gating Prevents PATTERN and HYBRID Strategies — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Directive 12.3.1 + 12.3.2, Batch 13, commit `4d8ef060`)
- **Location**: ~~DSS limits to 9 quant strategies, blocking pattern-recognizer.ts and hybrid-integration.ts~~ DSS now uses canonical map with 17 strategies (9 quant + 3 pattern + 5 hybrid). 8 new strategy modules implemented.
- **Resolution**: DSS rewired to `CANONICAL_REGIME_STRATEGY_MAP` (12.3.1). 8 new strategy modules created in `server/strategies/` (12.3.2). Signal orchestrator wired with evaluation blocks for all new strategies.
- **Phase Found**: Pre-audit

### ~~RISK-004~~: Strategy Key Mismatch — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Phase 14.1, Batch 15, HF6B commit `ae431e17`)
- **Location**: `server/services/vts-runner.ts` line 363
- **Resolution**: Added `case 'range_trade':` fallthrough alias alongside existing `case 'range_trading':` in VTS callStrategyDetect(). Both names now route to detectRangeTrading().
- **Phase Found**: Pre-audit

### RISK-005: HybridScore Falls Back to Confidence
- **Severity**: MEDIUM
- **Location**: `signal-orchestrator.ts` line 498
- **Impact**: Effective FinalScore for QUANT signals is 0.7 × confidence + 0.1 (regime absent)
- **Timing**: During MCE (PAD-001)
- **Phase Found**: Pre-audit, verified Phase 1

### RISK-006: RegimeWeight Defaults to 0.5
- **Severity**: MEDIUM
- **Location**: `signal-orchestrator.ts` line 499
- **Impact**: Regime classification has no influence on signal ranking
- **Timing**: During MCE (PAD-002)
- **Phase Found**: Pre-audit, verified Phase 1

### RISK-007: Confidence Scale Inconsistency
- **Severity**: MEDIUM
- **Location**: Strategy engine outputs 0-1, some validation checks expect 0-100
- **Timing**: During MCE (PAD-003)
- **Phase Found**: Pre-audit

### RISK-008: Engine Not Integration-Tested Since Phase 8
- **Severity**: HIGH
- **Location**: System-wide
- **Impact**: Runtime errors expected on first reactivation
- **Timing**: Pre-live
- **Phase Found**: Pre-audit

### RISK-009: Dual Friction Models in Signal Orchestrator — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.2, Batch 2 (2026-02-22), commit `8393a1ef`
- **Severity**: HIGH
- **Location**: `signal-orchestrator.ts` lines 557 and 1122 (pre-fix)
- **Problem**: Two different friction calculations in the same file:
  - Line 557: `computeTotalRoundTripCost(fee, slippage, spread)` from cost-model.ts — **CORRECT**
  - Line 1122: `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE / 100` flat percentage — **INCORRECT**
- **Resolution**: All `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` friction consumers replaced with `getCachedCostMetrics(symbol)` + `computeTotalRoundTripCost()` from cost-model.ts:
  - signal-orchestrator.ts DSS evaluation loop (line ~1122) — now uses per-pair cost metrics
  - signal-orchestrator.ts DSS_TRADE_SNAPSHOT capture (line ~1165) — now uses per-pair cost metrics
  - expectancy.ts `evaluateTradeExpectancy()` (line ~520) — now calls cost-model directly instead of `calculateFriction()`
  - analysis-utils.ts `calculateFriction()`, `calculatePerUnitFriction()`, `getFrictionRate()` — ~~marked `@deprecated`, zero runtime callers~~ **PHYSICALLY REMOVED** (Directive 12.2.5, Batch 11, commit `b3a1526c`). vts-service.ts (last active caller) migrated to canonical cost model.
- **Impact of fix**: The old code underestimated friction by 72× (0.01% vs 0.72% for default cost metrics). The DSS NetEV gate now correctly accounts for real trading costs.
- **Phase Found**: Phase 1 (ChatGPT review, Kyle-confirmed)

### RISK-010: Rolling Normalization Is Legacy Infrastructure — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: RollingNormalizer class and all 3 instances removed from quality_index.ts as part of full CWQI/NGC purge. AdaptiveRelevance linkage removed. All rolling normalization infrastructure eliminated.
- **Severity**: MEDIUM
- **Location**: `quality_index.ts` — RollingNormalizer class (lines 108-205), 3 instances (lines 207-209)
- **Problem**: Since NGC is legacy (Kyle-confirmed), the rolling normalization infrastructure serving NGC is also legacy. Three RollingNormalizer instances exist (NGC, ProfitRate, ExpectedReturn) with 500-sample/60-minute sliding windows. The smoothing factor is driven by VTS learning parameters via adaptive relevance — unnecessary coupling.
- **Phase Found**: Phase 1 (ChatGPT review, Kyle-confirmed as legacy)

---

## UNIFICATION RECOMMENDATIONS

### UNIFY-001: Friction Model Consolidation — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.2 (Batch 2) + Directive 12.2.5 (Batch 11, commit `b3a1526c`)
- **Current State**: `cost-model.ts` is the canonical friction provider for ALL friction calculations:
  - ✅ `calculateFriction()`, `calculatePerUnitFriction()`, `getFrictionRate()` **REMOVED** from analysis-utils.ts (Directive 12.2.5, Batch 11)
  - ✅ `SYSTEM_GUARDS.BASE_FEE_SLIPPAGE` removed from signal-orchestrator.ts friction paths (Directive 12.1.2, Batch 2)
  - ✅ `computeTotalRoundTripCost()` used in signal-orchestrator.ts, expectancy.ts, and vts-service.ts
  - ✅ `vts-service.ts` migrated from `calculateFriction()` to canonical `getCachedCostMetrics()` + `computeTotalRoundTripCost()` (Batch 11)
  - ⬜ `cost-metrics.updateCostData()` costFactor calculation for sizing — not yet addressed (separate concern, non-blocking)
- **Remaining work**: costFactor sizing path (separate concern, tracked independently)
- **Phase Found**: Phase 1

### UNIFY-002: Confidence Authority Consolidation (NGC Is Legacy — Kyle Confirmed) — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: All CWQI/NGC computation, rolling normalization, AdaptiveRelevance linkage, NGC confidence carrier paths, and exported SQE thresholds (MIN_NGC, MIN_CWQI, MAX_RISK, MIN_PROFIT_RATE) removed. quality_index.ts gutted to retain only active signal metric helpers. 116 files changed, 8261 lines removed in full Walter/CWQI/NGC purge.
- **Original State**: NGC was a legacy metric that was not fully removed. Kyle confirmed: "Anywhere where we have NGC in the code is a mistake. NGC is not a calculation that we want to be using anymore."
  - **NGC** (Phase 8.8): Blended from base confidence, volatility, risk, profitRate via rolling normalization. Stateful, adaptive. **LEGACY — should not be active.**
  - **PredictiveConfidence** (Phase 11): Planned as sole confidence authority. Deterministic. **TARGET state.**
- **Phase Found**: Phase 1 (Kyle-confirmed 2026-02-15)

### UNIFY-003: DI Source Consolidation — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.1, Batch 1 (2026-02-22)
- **Resolution**: NGC-derived DI path eliminated. Signal orchestrator now uses `calculateDirectionalIntegrity(closePrices)` — the same geometric function used by the Expectancy Gate. All DI inputs to the kernel now come from geometric calculation.
- **Original State**: Two DI sources feeding the same kernel:
  - Geometric DI: `calculateDirectionalIntegrity(prices)` — correct, from price data
  - NGC-derived DI: `normalizedConf * 100` — incorrect repurposing of confidence as DI
- **Phase Found**: Phase 1

---

## PHASE 2 FINDINGS

### RISK-011: Strategy Signal Audit Engine Uses Stale Metric Definitions — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: strategy-signal-audit-engine.ts removed as part of full Walter/CWQI/NGC purge. All stale NGC/CWQI recomputation eliminated.
- **Severity**: MEDIUM
- **Location**: `server/services/strategy-signal-audit-engine.ts`
- **Problem**: Recomputed NGC, CWQI, and DI using simplified formulas that did not match actual pipeline computations. Since NGC was legacy (Kyle-confirmed), the entire audit engine's purpose was questionable.
- **Phase Found**: Phase 2

### RISK-012: Static Confidence Values Reduce FinalScore Discrimination
- **Severity**: LOW
- **Location**: `server/services/strategy-engine.ts` (all 8 strategies)
- **Problem**: 7 of 9 strategies return hardcoded confidence (0.65–0.75). Only VWAP Pullback (0.7–0.9) and DHMA (dynamic 0.1–0.95) produce variable confidence. Since FinalScore uses confidence at 30% weight, invariant confidence inputs reduce FinalScore's ability to distinguish signal quality.
- **Impact**: FinalScore rankings between strategies are dominated by HybridScore and RegimeWeight rather than signal-specific confidence.
- **Timing**: Post-MCE enhancement — make confidence dynamic based on signal quality indicators
- **Phase Found**: Phase 2

### RISK-013: Oversimplified Bullish Reversal Detection
- **Severity**: LOW
- **Location**: `server/services/strategy-engine.ts`, `detectBullishReversal()` method
- **Problem**: Volume check is `volume > 0` — trivially true for any non-zero volume. Reversal detection is effectively just "price within 2% of 24h low" with no volume comparison.
- **Impact**: Affects VWAP Pullback and Mean Reversion entry quality — may trigger on noise.
- **Timing**: Pre-MCE candidate (simple fix: compare volume to 1.5× average)
- **Phase Found**: Phase 2

### ~~BUG-006~~: DSS Uses Legacy SYSTEM_GUARDS.STRATEGY_MAP Instead of Canonical Map — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Directive 12.3.1, Batch 13, commit `4d8ef060`)
- **Location**: `server/services/dynamic-strategy-selector.ts`
- **Problem**: ~~DSS imports `SYSTEM_GUARDS.STRATEGY_MAP`~~ DSS now calls `calculatePairRegime()` from `market-regime.ts` and uses `CANONICAL_REGIME_STRATEGY_MAP` for strategy routing.
- **Resolution**: DSS `determineRegimeFromOHLC()` calls `calculatePairRegime()`. `getCandidatesForRegime()` uses canonical map with 17 strategies across 5 regimes. EXTREME_NOISE preserved as pre-filter (volNoise > 0.6), not a regime. Signal orchestrator converts Kraken OHLC to `OHLCData[]` and calls DSS for canonical regime classification. All 17 strategies (9 quant + 3 pattern + 5 hybrid) now flow through the trading pipeline.
- **Kyle-confirmed**: 2026-02-16
- **Phase Found**: Phase 2

### BUG-007: Hybrid Strategy Types in hybrid-integration.ts Are Legacy
- **Severity**: HIGH
- **Location**: `server/services/hybrid-integration.ts`, `selectHybridStrategy()` method
- **Problem**: Maps to legacy types (H1_TREND_SNIPER, H2_SLINGSHOT, H3_GATECRASHER, H4_MOMENTUM_LINK) that don't exist in the canonical map. The canonical hybrids are: pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge.
- **Fix**: Replace `selectHybridStrategy()` with canonical hybrid selection logic from `canonical-regime-strategy-map.ts`
- **Timing**: Concurrent with BUG-006
- **Phase Found**: Phase 2

### ~~RISK-014~~: Strategy Sync Only Covers 8 Quant Strategies — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Directive 12.3.2, Batch 13, commit `4d8ef060`)
- **Location**: `server/services/strategy-sync.ts`, CORE_STRATEGIES array
- **Resolution**: CORE_STRATEGIES updated to include all 17 canonical strategies (9 quant + 3 pattern + 5 hybrid). `range_trading` renamed to `range_trade` (canonical name). `dhma` added (was missing from original 8).
- **Phase Found**: Phase 2

### ~~RISK-015~~: Strategy Key Mismatch: `range_trading` vs `range_trade` — **RESOLVED**
- **Severity**: ~~LOW~~ **RESOLVED** (Directive 12.3.2, Batch 13, commit `4d8ef060`)
- **Location**: strategy-engine.ts, strategy-sync.ts, signal-orchestrator.ts
- **Resolution**: Canonical name is `range_trade`. Both `range_trading` (legacy alias) and `range_trade` are accepted in enabledStrategies. strategy-sync.ts uses canonical `range_trade`.
- **Phase Found**: Phase 2

### ~~BUG-008~~: Four Parallel Regime Classification Systems With No Cross-Reference — **RESOLVED**
- **Severity**: ~~CRITICAL~~ **RESOLVED** (Batch 13 `4d8ef060` + Batch 14 `8f26369a`)
- **Locations**:
  - ~~Engine 1~~: `server/services/dynamic-strategy-selector.ts` — **REPLACED** (Batch 13). DSS now calls `calculatePairRegime()`.
  - Engine 2: `server/core/metrics/market-regime.ts` — `calculatePairRegime()`. **CANONICAL — sole pair-level authority via MCE.**
  - Engine 3: `server/core/metrics/market-regime.ts` — `getNormalizedRegime()`. **Advisory only. Preserved for ML.**
  - ~~Engine 4~~: `server/services/market-profiler.ts` + `server/services/adaptive-regime.ts` — **REMOVED** (Batch 14). MCP/ARE deleted along with all 14+ L12-L20 consumer services.
- **Resolution**:
  - Batch 13 (Directive 12.3.1): Engine #1 (DSS legacy) replaced — now calls `calculatePairRegime()` (Engine #2). Active trading and VTS unified on same regime model.
  - Batch 14 (Phase 13 MCE): Engine #4 (MCP/ARE) fully removed. All 17 L-series services + 9 routes deleted. MCE installed as centralized indicator/regime service. Only Engine #2 (canonical, via MCE) and Engine #3 (advisory) remain. System now has ONE regime authority.
  - Batch 14-hotfix: `strategy_type` PostgreSQL enum expanded 9 → 18 values to match 17 canonical strategies.
- **Phase Found**: Phase 2 (ChatGPT/Replit review + Claude Code deep trace, Kyle-confirmed legacy 2026-02-16)

### ~~RISK-016~~: MCP/ARE Legacy System Creates Parallel Strategy Authority — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~`server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`~~ Both files DELETED.
- **Resolution**: MCP/ARE and all 14+ consumer services (the entire L12-L20 cluster) removed in Batch 14. No migration needed — the L-series was a closed supervisory loop with zero downstream impact on the active trading path. MCE installed as the sole centralized regime/indicator service.
- **Phase Found**: Phase 2 (Claude Code deep trace, ChatGPT verification, Kyle-confirmed legacy 2026-02-16)

### RISK-017: Bridge JSON Staleness Risk
- **Severity**: MEDIUM
- **Location**: `bridge/canonical/mapping-regime-strategy.json`, `server/core/strategy-mapper.ts`, `server/scripts/sync-canonical-bridge.ts`
- **Problem**: Bridge JSON is generated by sync script from canonical TS map. No automated staleness check — if TS is updated without re-running sync, `strategy-mapper.ts` serves stale data at runtime.
- **Fix**: Add hash/version comparison at startup, or have `strategy-mapper.ts` import directly from TS instead of JSON.
- **Timing**: Concurrent with BUG-006 fix
- **Phase Found**: Phase 2 (ChatGPT review, validated by Claude Code)

### RISK-018: Drift Detector Has No Calibration Baselines for Pattern/Hybrid Strategies
- **Severity**: MEDIUM
- **Location**: `server/services/drift-detector.ts`
- **Problem**: Monitors α/β/σ drift per strategy with 10-snapshot rolling window. When 8 new strategies (3 pattern + 5 hybrid) are activated via canonical wiring, drift detector has no historical baselines. First check will either error, skip, or falsely report drift.
- **Fix**: Initialize baseline snapshots during canonical wiring deployment. Consider warm-up period where drift detection is advisory-only for new strategies.
- **Timing**: Concurrent with BUG-006 fix
- **Phase Found**: Phase 2 (ChatGPT review, validated by Claude Code)

### ~~RISK-019~~: MCP Uses Stubbed Metrics for Regime Classification — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~`server/services/market-profiler.ts`, `classifyRegime()` method~~ File DELETED.
- **Resolution**: MCP/ARE removed entirely in Batch 14 (L12-L20 full removal). Stubbed metrics no longer feed any system. MCE uses real OHLC-derived indicators (VWAP, SMA, ATR, volatility, momentum, ADX) via `calculatePairRegime()`.
- **Phase Found**: Phase 2 (ChatGPT verification, Claude Code confirmed)

### ~~RISK-020~~: MCP/ARE Is Legacy Predecessor System, Never Decommissioned — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Phase 13, Batch 14, commit `8f26369a`)
- **Location**: ~~`server/services/market-profiler.ts`, `server/services/adaptive-regime.ts`~~ Both files DELETED.
- **Historical Context**: MCP/ARE was built Dec 27, 2025 under Directive 8.8.4-L12 as the original regime-to-strategy system. It was immediately LOCKED. Starting Jan 2026, the canonical regime map (Directive 11.7F) and DSS were built as replacement systems. Each new system was designed in isolation — neither acknowledged MCP/ARE's existence. MCP/ARE was left running in the background, feeding T1/T2/R1/V1/C1 classifications to 14+ services, while newer systems were built alongside it without coordination. The LOCK designation made it invisible during architectural discussions.
- **Problem**: ~~MCP/ARE continues to run on a 15-minute timer, computing regime classifications with stubbed metrics (RISK-019), applying strategy weights via its own matrix, and feeding exposure/risk multipliers to 14+ services~~ MCP/ARE and all L12-L20 consumer services fully removed.
- **Resolution**: Entire L12-L20 autonomy/RL cluster removed in Batch 14 (Phase 13). 17 L-series services, 9 route files, 1 M-series service, 2 utilities deleted (~8,200 lines). The cluster was a closed supervisory loop — none of its outputs reached the active trading path. MCE installed as centralized replacement.
- **Phase Found**: Phase 2 (Claude Code deep trace, ChatGPT/Replit verification, Kyle-confirmed legacy 2026-02-16)

---

## PHASE 3 FINDINGS

### BUG-009: Two Parallel Scanning Systems Running Simultaneously
- **Severity**: CRITICAL
- **Locations**:
  - `server/services/market-scanner.ts` — `MarketScanner` class (lines 385-1013)
  - `server/routes.ts` — line 87: `const marketScanner = new MarketScanner();` (instantiated at boot)
  - `server/routes.ts` — line 371: `marketScanner.startHourlyScanning()` (actively started)
  - `server/startup.ts` — lines 36, 57: Listed as core initialized service
- **Problem**: DawnTrader runs TWO independent scanning systems simultaneously:
  1. **FX5 Scanner** (30s cycles): `collectAdaptiveBatch()` → Active Filter Pool → Signal Orchestrator. Modern, adaptive, telemetry-driven.
  2. **MarketScanner class** (10-min cycles): Kraken OHLC → direct StrategyEngine → database signal storage. Legacy, per-user watchlists, 8 quant strategies only.
- **Impact**:
  - Double Kraken API load (both scanners call getTicker, getOHLCData independently)
  - Conflicting signal generation through completely different pipelines with no deconfliction
  - Conflicting cleanup operations (MarketScanner has its own expire/clean/archive routines)
  - Wasted computation (10-min scanner evaluates pairs FX5 already evaluates every 30s with better filtering)
- **Verified**: Yes — code-confirmed 2026-02-16. Initial Phase 3 audit incorrectly stated MarketScanner was "believed to be disconnected." ChatGPT flagged this assumption; grep verification proved it is actively instantiated and started in production boot sequence.
- **Fix**: Stop instantiating MarketScanner class in `server/routes.ts`. Remove `startHourlyScanning()` call. Remove from `startup.ts` service list. The `collectAdaptiveBatch()` function in the same file must NOT be removed.
- **Status**: **RESOLVED** — Directive 12.2.2, Batch 9 (commit `8b6bb540`). MarketScanner class removed. Only FX5 Scanner runs now.
- **Timing**: Pre-MCE — standalone fix, zero dependencies on MCE
- **Phase Found**: Phase 3 (ChatGPT review correction)

### RISK-021: Volume Bucket Threshold Inconsistency Between Modules
- **Severity**: LOW-MEDIUM (LOW today if buckets are never cross-compared; MEDIUM if risk guardrails, position sizing, UI dashboards, drift detector, or ML features ever reference bucket labels)
- **Locations**:
  - `server/services/active-filter-pool.ts` — `getSymbolVolumeInfo()`: High > $50M, Medium ≥ $10M, Low ≥ $1M, Very Low < $1M
  - `server/services/market-volume-cache.ts` — `classifyVolume()`: High ≥ $5M, Medium ≥ $500K, Low ≥ $50K, Very Low < $50K
- **Problem**: Two different volume bucketing schemes. A pair classified as "High" by market-volume-cache ($5M+) would be "Low" by Active Filter Pool ($50M+ required).
- **Fix**: Consolidate to a single volume bucketing function with explicit scope parameters, OR document that these serve intentionally different scopes.
- **Timing**: Anytime
- **Phase Found**: Phase 3

### RISK-022: adaptive-pool-config.ts Name Misleads About Its Purpose
- **Severity**: LOW
- **Location**: `server/services/adaptive-pool-config.ts`
- **Problem**: File name suggests scanning pool configuration. Actual content is ACT (Adaptive Concurrency Tuner) — controls concurrent signal processing slots (MIN=3, MAX=10), completely unrelated to scanning. Actual scanning pool config is in `SCANNER_PARAMS` within `adaptive-scan-manager.ts`.
- **Fix**: Rename to `act-concurrency-config.ts` or `signal-processing-pool-config.ts`
- **Timing**: Anytime
- **Phase Found**: Phase 3

### RISK-023: Adaptive Scanning Pipeline Depends on VTS Telemetry Integrity
- **Severity**: MEDIUM
- **Location**: `adaptive-ratio-manager.ts` → `telemetry-aggregator.ts` → VTS
- **Problem**: The entire adaptive scanning feedback loop depends on VTS telemetry health. If VTS is paused, misconfigured, or data-lagged: Ideal pool quality degrades, ratio manager biases toward default (0.7), batch composition becomes stale. The adaptive benefit is silently lost with no health check or alert.
- **Fix**: Add telemetry freshness check — emit warning when pool performance data is older than X cycles. Add VTS telemetry health to system health endpoint.
- **Timing**: Pre-MCE or during MCE
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-024: Cost Cache Synchronization Coupling
- **Severity**: LOW-MEDIUM
- **Location**: FX5 Scanner → `cost-cache.ts` (TTL: 5 min) → `cost-model.ts`
- **Problem**: FX5 writes spread data every 30s; cost cache TTL is 5 min; cost model depends on fresh cache. If scan errors/restarts cause cache misses, or symbol normalization diverges between writer and reader, friction scores revert to defaults silently.
- **Mitigations**: 30s refresh >> 5-min TTL; writes cover ALL evaluated pairs. Risk is low under normal operation.
- **Fix**: Verify symbol normalization consistency. Add "cache miss" metric to detect silent fallback.
- **Timing**: Anytime
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-025: History Filter Sequential Async Risk
- **Severity**: LOW
- **Location**: `market-scanner.ts` `collectAdaptiveBatch()` lines 1280-1286
- **Problem**: History filter calls Kraken OHLC per-pair sequentially over 300 pairs (Batch 18 — was 100). Cold cache (post-restart) could make up to 300 sequential API calls, potentially violating M31 (30s runtime limit).
- **Mitigations**: Results cached 24h per pair. Cache miss with error conservatively fails (null = fail). After first cycle, nearly all cached. OHLC cache (Batch 18) provides 5-min TTL caching for standard OHLC fetches, though history filter uses daily candles (different interval).
- **Fix**: Consider pre-warming cache during boot or batching history checks.
- **Timing**: Post-MCE (low priority, mitigations adequate)
- **Phase Found**: Phase 3 (ChatGPT review)

### RISK-026: DSE Diagnostics Use Legacy Regime Names
- **Severity**: LOW
- **Location**: `server/core/risk/dynamic-sizing-engine.ts` lines 287-288
- **Problem**: `getDSEDiagnostics()` references 6 regime names including `EXTREME_NOISE` and `LOW_VOL_CHOP` which do not match the canonical 5-regime taxonomy (`BULL_QUIET`, `BULL_VOLATILE`, `BEAR_QUIET`, `BEAR_VOLATILE`, `CHOPPY`). These are display/diagnostic only and do not affect sizing math.
- **Fix**: Update regime names in diagnostics to match canonical names
- **Timing**: Anytime (cosmetic, no trading impact)
- **Phase Found**: Phase 4

### RISK-027: GASP Is Itself Legacy — L-Series Autonomy Cluster (SUPERSEDED)
- **Severity**: MEDIUM → **RECLASSIFIED** (Kyle Addendum, 2026-02-16)
- **Location**: `server/services/gasp-coordinator.ts`
- **Original Problem**: GASP depends on legacy subsystems (MOF, DCE, APR-SLE, MCP).
- **Updated Status**: Kyle confirmed (2026-02-16) that GASP is itself legacy — part of the L-Series Autonomy Cluster. GASP is a supervisory layer that does NOT touch the active trade flow. It forms a closed loop with MOF/MACO/ECS/DCE/APR-SLE/MCP. No metric source migration needed — the entire L-Series cluster (GASP + all its sources) will be removed together in a coordinated wave.
- **Fix**: Remove GASP with entire L-Series autonomy cluster. No intermediate migration needed.
- **Timing**: During L-Series cluster removal wave
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-028: Goal Alignment Logic Is Formally Deprecated — Must Be REMOVED
- **Severity**: LOW → **MEDIUM** (elevated: formal deprecation directive, Kyle Addendum 2026-02-16)
- **Location**: `server/services/pre-execution-validator.ts` — entire goal alignment gate
- **Original Problem**: Only 3 of 17 strategies had risk profiles, making goal alignment flat for most strategies.
- **Updated Status**: Kyle formally deprecated Goal Alignment (2026-02-16). The Goals tab has already been removed from the UI. This is Walter-era legacy logic. Must be **REMOVED entirely** — not expanded, not defaulted to neutral, but deleted.
- **Removal scope**: `computeGoalAlignmentScore()`, `strategyRiskProfile` map, goal alignment gate logic, Walter/Bob provenance references. Check `profitability_vs_consistency` field in system_context for other consumers — remove if none.
- **Fix**: Delete all goal alignment code. Pre-Execution Validator becomes a two-gate system (risk checks + fee-aware profitability).
- **Timing**: Pre-MCE or during MCE — standalone removal, no MCE dependency
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-029: Paper Portfolio Manager Uses Hardcoded Starting Capital — ACCEPTED
- **Severity**: LOW-MEDIUM → **LOW** (Kyle accepted, 2026-02-16)
- **Location**: `server/services/paper-portfolio-manager.ts` lines 539-541, 670-672
- **Problem**: `checkPortfolioHealth()` and `calculateMaxDrawdown()` assume `startingCapital = 10000` (hardcoded) for exposure and drawdown calculations.
- **Kyle Decision (2026-02-16)**: Hardcoded $10,000 is acceptable for now. Optional future: throw error if portfolio_state.balance is missing.
- **Fix**: No immediate action. Optional future enhancement.
- **Timing**: Post-MCE (optional)
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### RISK-030: Coherency Rules YAML vs Database CHECK Constraint Mismatch
- **Severity**: LOW
- **Location**: `audit/coherency_rules.yaml` line 253 vs RULE_007
- **Problem**: The YAML's database enforcement section specifies `daily_loss_kill_switch_pct >= 1.00 AND <= 20.00` as a CHECK constraint, but RULE_007 in the same YAML and the guardrail-policy code both enforce `1.00-25.00`. The database constraint is stricter than the application rule.
- **Fix**: Align database CHECK constraint to match RULE_007 (1.00-25.00)
- **Timing**: Anytime (database migration needed)
- **Phase Found**: Phase 4

### RISK-031: EXECUTION_CONFIG.MAX_POSITION_RISK Contradicts Guardrails — DEFERRED
- **Severity**: MEDIUM
- **Location**: `server/config/execution-config.ts` line 15, `server/core/risk/dynamic-sizing-engine.ts` line 211
- **Problem**: `EXECUTION_CONFIG.MAX_POSITION_RISK = 0.02` (2%) is used by DSE as a hard cap on position size. However, `guardrails_v2.maxPositionPercentPct` defaults to 10% (live) or 30% (paper). The DSE cap at 2% is far stricter, meaning the guardrail's UI-visible `maxPositionPercentPct` may never be the binding constraint.
- **Kyle Decision (2026-02-16)**: Confirmed this is a real conflict. Do NOT change during audit phase. Add to cleanup docket for post-audit architecture session.
- **Fix**: Clarify whether DSE should use `maxPositionPercentPct` from guardrails_v2 or keep layered. Resolve during post-audit architecture session.
- **Timing**: Post-audit architecture session (deferred per Kyle)
- **Phase Found**: Phase 4 (updated by Phase 4 Addendum)

### BUG-010: TradingEngine Simulates Partial Fills With Math.random() in Live Mode — DEFERRED
- **Severity**: CRITICAL → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` lines 346-388
- **Code**: `const isPartialFill = Math.random() < 0.1; // 10% chance`
- **Problem**: After placing a live market order via Kraken API, the engine simulates partial fills using random numbers instead of querying actual order status.
- **Impact**: In live trading, position quantity tracking would be randomly wrong. Non-blocking: paper mode is authoritative; live mode is deferred.
- **Kyle Decision (2026-02-16)**: Live mode execution is deferred. Paper mode is authoritative. Informational until live refactor. Future decision: refactor TradingEngine or rebuild from paper core.
- **Timing**: Deferred until live mode refactor
- **Fix**: Replace Math.random() logic with actual Kraken order status query.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### BUG-011: TradingEngine Simulates Slippage/Fees With Math.random() in Live Mode — DEFERRED
- **Severity**: CRITICAL → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` lines 391-393
- **Code**: `entrySlippage = Math.random() * 0.1; // 0-0.1% slippage`
- **Problem**: Entry slippage is assigned a random value and fees use a hardcoded taker rate instead of actual values from the fill response.
- **Kyle Decision (2026-02-16)**: Same as BUG-010 — live mode deferred. Informational.
- **Timing**: Deferred until live mode refactor
- **Fix**: Derive actual slippage from fill response. Same issue in `closeTrade()` at line 648.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### BUG-012: TradingEngine Contains Second Active Goal Alignment Location
- **Severity**: HIGH
- **Location**: `server/services/trading-engine.ts` lines 128-254
- **Code**: `signal.finalScore = (signal.confidence * 0.7) + (goalAlignmentScore * 0.3);`
- **Problem**: The TradingEngine computes Goal Alignment scores via `calculateGoalAlignmentScore()` and applies them to FinalScore with a 30% weight. Kyle formally deprecated Goal Alignment in Phase 4 (RISK-028), but the deprecation directive only referenced `pre-execution-validator.ts`. This is a second, independent implementation in the live-capable engine.
- **Impact**: If TradingEngine is used (live mode), FinalScore is modified by deprecated Goal Alignment logic, potentially overriding or conflicting with the canonical FinalScore from SQE.
- **Verified**: Yes — code-confirmed 2026-02-16
- **Timing**: **Pre-MCE** — should be removed alongside RISK-028 (Goal Alignment formal removal)
- **Fix**: Remove `calculateGoalAlignmentScore()` method and Goal Alignment score computation from `processSignal()`. Use FinalScore directly from signal without modification.
- **Phase Found**: Phase 5

---

### RISK-032: MicroExecutionService triggerSymbolCheck() Is a TODO Stub — ACCEPTED
- **Severity**: MEDIUM → **ACCEPTED** (Kyle, 2026-02-16: experimental/dormant)
- **Location**: `server/services/micro-execution-service.ts` — `triggerSymbolCheck()` method
- **Problem**: The method that should trigger execution when significant price deltas are detected is unimplemented.
- **Kyle Decision (2026-02-16)**: MicroExecutionService is an experimental micro-price execution prototype. Paper-only, dormant, non-interfering. Leave hidden. No removal required. Revisit only if micro-price trading becomes intentional.
- **Timing**: No action — accepted as dormant
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### RISK-033: trade-flow.ts StrategyType Lists 9 Strategies vs 17 Canonical
- **Severity**: LOW
- **Location**: `server/types/trade-flow.ts` lines 22-31
- **Problem**: The `StrategyType` union type only includes 9 strategies (the same set used by DSS/SignalOrchestrator). The canonical system defines 17 strategies (5 quant + 5 pattern + 5 hybrid + 2 special). This creates a TypeScript enforcement point where 8 strategy types cannot be properly typed through the trade flow layer.
- **Impact**: Low — consistent with BUG-002/BUG-003 (legacy strategy map) and will be resolved when those bugs are fixed. However, any MCE fix to BUG-002/003 must also update this type definition.
- **Timing**: Concurrent with BUG-002/003 fix
- **Fix**: Update `StrategyType` to include all 17 canonical strategies when legacy strategy map is replaced.
- **Phase Found**: Phase 5

### RISK-034: Failed RTB Promotion Does Not Restore Signal to Queue
- **Severity**: LOW
- **Location**: `server/services/paper-execution-engine.ts` — `checkRtbPromotion()` lines 1344-1375
- **Problem**: Per Directive A3.R1, signals are removed from the RTB queue BEFORE trade execution to prevent double-activation. If `executePromotedSignal()` subsequently fails, the signal is permanently lost — not restored to the queue.
- **Impact**: Low in practice — promotion failures should be rare, and new signals are continuously generated. However, in low-liquidity conditions with few signals, losing a valid signal could delay execution.
- **Timing**: Post-MCE (optional improvement)
- **Fix**: Consider adding a dead-letter queue or retry mechanism for failed promotions. Alternatively, add metrics to track promotion failure rate.
- **Phase Found**: Phase 5

### RISK-035: max_holding_period Exit Maps to Close Reason 'UNKNOWN'
- **Severity**: LOW
- **Location**: `server/services/paper-execution-engine.ts` — `closePosition()` close reason map
- **Code**: `'max_holding_period': 'UNKNOWN'`
- **Problem**: The `max_holding_period` exit condition maps to 'UNKNOWN' instead of a specific close reason enum value like 'MAX_HOLD'. This reduces diagnostic clarity when analyzing trade outcomes.
- **Timing**: Anytime (trivial fix)
- **Fix**: Add 'MAX_HOLD' to the close reason enum and map `max_holding_period` to it.
- **Phase Found**: Phase 5

### RISK-036: TradingEngine closeTrade() Uses Math.random() for Exit Slippage in Live Mode — DEFERRED
- **Severity**: MEDIUM → **INFORMATIONAL** (Kyle, 2026-02-16: live mode deferred)
- **Location**: `server/services/trading-engine.ts` line 648
- **Code**: `exitSlippage = Math.random() * 0.1;`
- **Problem**: Same class of issue as BUG-011 but on the exit side.
- **Kyle Decision (2026-02-16)**: Same as BUG-010/011 — live mode deferred. Informational.
- **Timing**: Deferred until live mode refactor — bundled with BUG-010/BUG-011
- **Fix**: Derive actual exit slippage from fill response.
- **Phase Found**: Phase 5 (updated by Phase 5 Addendum)

### RISK-037: NLAI System Is Legacy Conversational Control Infrastructure — **RESOLVED**
- **Severity**: MEDIUM → **FORMALLY DEPRECATED** (Kyle, 2026-02-16) → **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.2.7, Batch 4, commit `5d5c2051` (2026-02-24)
- **Resolution**: All 5 NLAI files deleted (nlai-interpreter.ts, contextual-nlai-interpreter.ts, nlai-execution-broker.ts, nlai-action-registry.ts, execution-policy-controller.ts). All references cleaned from 6 consuming files (routes.ts, live-trading-service.ts, auto_test_harness.ts, paper-sim-service.ts, config-update-service.ts, cognitive-tuner.ts). ActionResult type inlined in live-trading-service.ts. Chat handler in routes.ts now routes directly to intent-parser + command-router.
- **Original Problem**: NLAI (Natural Language Action Interpreter) was Walter AI's command bridge. It parsed chat commands, routed through execution broker, called service functions for guardrails/goals/watchlist/start-stop. Walter has been deprecated, conversational goal system removed, Goals tab removed.
- **Phase Found**: Phase 5 Addendum (Kyle directive)

### BUG-013: ML Service Client PredictionInput References Removed Phase-10 Fields
- **Severity**: MEDIUM
- **Location**: `server/services/ml-service-client.ts` — `PredictionInput` interface (line 30-31)
- **Problem**: The `PredictionInput` interface still references `ngc` (Normalized Global Confidence) and `cwqi` (Composite Weighted Quality Index), both of which were removed in Phase 10 in favor of `finalScore`, `hybridScore`, `predictiveConfidence`, and `regimeWeight`.
- **Impact**: If the Python ML service is re-enabled, it will receive stale field names. Callers must currently map Phase-10 metrics to legacy field names.
- **Verified**: Yes — interface confirmed in ml-service-client.ts
- **Timing**: During MCE or anytime (interface update only)
- **Fix**: Update `PredictionInput` to use Phase-10 canonical field names; update Python ML service to accept new fields
- **Phase Found**: Phase 6

### BUG-014: Retraining Freeze Controller Activates Phase 10 Freeze on Every Restart
- **Severity**: LOW
- **Location**: `server/services/retraining-freeze-controller.ts` — constructor (line 64)
- **Problem**: `activatePhase10Freeze()` is called unconditionally on every instantiation, imposing a 1-hour ML retraining block on every server restart. This was designed as a one-time deployment measure for the Phase 10.0 friction correction (0.26% → 0.50%) but persists as a stale artifact.
- **Impact**: Every restart delays ML calibration by 1 hour unnecessarily. In development, this may mask calibration issues.
- **Verified**: Yes — `this.activatePhase10Freeze()` confirmed in constructor
- **Timing**: Pre-MCE (easy fix — remove or gate behind config flag)
- **Fix**: Remove `activatePhase10Freeze()` from constructor, or gate behind a `PHASE10_FREEZE_ENABLED` environment variable
- **Phase Found**: Phase 6

### BUG-015: Dual Shutdown Handlers Create ML Service Shutdown Race Condition
- **Severity**: MEDIUM
- **Location**: `server/index.ts` (lines 1228-1259) and `server/core/boot_orchestrator.ts` (lines 51-73)
- **Problem**: Both `server/index.ts` and `server/core/boot_orchestrator.ts` independently register `SIGTERM`/`SIGINT` handlers. The boot orchestrator registers first (in constructor) and manages ML service shutdown (SIGTERM → 5s timeout → SIGKILL) and VTS Runner stop. The index.ts handler registers later and manages core services (RTB, DataAggregator, CentralClock, PriceCache, SystemHealth) and calls `process.exit(0)`. Since Node.js allows multiple handlers per signal, **both execute on shutdown**, but since index.ts calls `process.exit(0)`, the boot orchestrator's ML service graceful shutdown (which requires up to 5 seconds to send SIGTERM then SIGKILL) may be truncated or never complete.
- **Impact**: ML Python microservice may not receive graceful shutdown signal, potentially leaving orphaned processes. VTS Runner may not flush pending data.
- **Verified**: Yes — both handlers confirmed in source. Boot orchestrator: `process.on('SIGTERM', ...)` in constructor. Index.ts: `process.on('SIGTERM', ...)` in main IIFE.
- **Kyle Decision (Phase 7 Addendum)**: Post-audit investigation. No immediate change required.
- **Timing**: Post-audit cleanup (consolidate into single shutdown handler)
- **Fix**: Remove shutdown handler from boot_orchestrator.ts, add ML service and VTS shutdown to the index.ts handler **before** `process.exit(0)`, or use a coordinated shutdown controller.
- **Phase Found**: Phase 7

---

## ARCHITECTURAL RISKS (continued)

### RISK-038: VTS ML Calibration Performance Multiplier Is Noise-Modulated
- **Severity**: HIGH
- **Location**: `server/services/ml-calibration.ts` — `analyzePerformance()`
- **Problem**: The ML Calibration Service computes `performanceScore = finalScore × 0.5 + predictiveConfidence × 0.3 + regimeWeight × 0.2` to modulate the magnitude of weight adjustments. However, `finalScore` and `predictiveConfidence` are derived from **simulated** data in the VTS Runner (`simulateHybridScore()`, `simulatePredictiveConfidence()`), not from real strategy indicator calculations.
- **Consequence**: The **direction** of weight adjustments (INCREASE/DECREASE) is based on real win rate data (valid), but the **magnitude** of adjustments is modulated by noise. This may cause over- or under-adjustment of strategy weights.
- **Note**: This is downstream of BUG-001 (VTS signal generation is generic). Fixing BUG-001 would resolve this risk.
- **Timing**: During MCE (MCE-5 phase, bundled with BUG-001)
- **Phase Found**: Phase 6

### RISK-039: Reward Evaluator Output Is Not Consumed by Scoring Pipeline
- **Severity**: MEDIUM
- **Location**: `server/services/reward-evaluator.ts`
- **Problem**: The Reward Evaluator computes per-strategy, per-regime rewards (`R = α₁ × profit_rate + α₂ × win_rate − α₃ × drawdown`) every 30 minutes, but the audit found **no downstream consumer** of these reward values in any scoring, selection, or trading logic. The rewards are computed, persisted to disk, and emitted as events, but not consumed.
- **Kyle Decision (Phase 6 Addendum)**: Confirmed observability-only. Not harmful. Not integrated. Not a priority to connect.
- **Timing**: Post-MCE (architecture decision, low priority)
- **Phase Found**: Phase 6

### RISK-040: Five Walter-Era Learning Services — CONFIRMED LEGACY — **RESOLVED**
- **Status**: **RESOLVED** — Batch 55, commit `f52c87e1` (2026-04-10)
- **Resolution**: All remaining Walter-era learning services removed as part of full Walter/CWQI/NGC purge (116 files changed, 8261 lines removed). continuous-learning.ts, learning-coordinator.ts, learning-bridge.ts, learning-gate-validator.ts all deleted. All consuming service references cleaned.
- **Severity**: MEDIUM → **CONFIRMED LEGACY** (Kyle, Phase 6 Addendum)
- **Location**: `server/services/continuous-learning.ts`, `learning-cycle-service.ts`, `learning-coordinator.ts`, `learning-bridge.ts`, `learning-gate-validator.ts`
- **Problem**: These 5 services formed a complete learning subsystem built for the Walter/Bob AI ecosystem with zero connection to the canonical VTS/ML pipeline.
- **Phase Found**: Phase 6 (confirmed by Phase 6 Addendum)

### RISK-041: Calibration β Coefficient Clamped to Conservative Range
- **Severity**: LOW
- **Location**: `server/utils/calibration.ts` — `linearFit()` (line 99)
- **Problem**: The linear fit clamps β to [0.05, 0.5], preventing the calibration from learning relationships with slopes greater than 0.5, even when data supports steeper slopes. This biases all calibrated profit predictions toward conservatism.
- **Note**: Conservative bias may be intentional (safer to under-predict than over-predict). Document this as a design decision or widen the range.
- **Timing**: Post-MCE (design decision)
- **Phase Found**: Phase 6

### RISK-042: VTS Service / VTS Runner Trade Duration Mismatch
- **Severity**: LOW
- **Location**: `server/services/vts-service.ts` (3-hour TRADE_DURATION) vs `server/services/vts-runner.ts` (24-hour MAX_HOLD_MS)
- **Problem**: The VTS Service defines a 3-hour trade window for legacy random simulation, while the VTS Runner uses a 24-hour max hold for real-price resolution. Since Directive 11.6D deprecated the VTS Service's trade resolution, the 3-hour window is dead code.
- **Impact**: None currently — the 3-hour window is only used by deprecated methods.
- **Timing**: Anytime (cleanup, bundled with VTS Service legacy method removal)
- **Phase Found**: Phase 6

### RISK-043: Strategy-Specific Signal Logic Is Not Implemented — Artificial Strategy Differentiation
- **Severity**: **CRITICAL** (Kyle, Phase 6 Addendum — "the core architectural problem in Phase 6")
- **Location**: `server/services/vts-runner.ts` — `generatePhase10Signal()`, `simulateHybridScore()`, `simulatePredictiveConfidence()`, `simulateDecayPenalty()`
- **Problem**: Although multi-strategy simulation (Directive 11.8C) is correctly implemented — iterating over ALL strategies compatible with a pair's regime — the underlying `generatePhase10Signal()` uses **identical generic scoring logic for ALL strategies**. Specifically:
  - `simulateHybridScore()` — regime-based lookup + random noise, NOT strategy-specific
  - `simulatePredictiveConfidence()` — derived from hybridScore, NOT strategy-specific
  - `simulateDecayPenalty()` — `Math.random() * 0.15`, fully random
  - FinalScore — identical formula for all strategies
  - Stop/Target logic — volatility-based, NOT strategy-specific
  - Entry logic — current market price for all strategies
- **Consequence**: The system simulates N strategies per pair, but all N produce signals from the same generic math. Only randomness and metadata labels differ. This means:
  - Per-strategy calibration is statistically diluted — calibration learns noise, not structural edge
  - Strategy comparisons are partially artificial — "Breakout" vs "Mean Reversion" produce effectively identical signals
  - ML magnitude adjustments are noisy
  - True structural edge cannot emerge
- **Relationship to BUG-001**: BUG-001 flagged simulated scoring inputs. RISK-043 is the deeper problem — even if scoring were real, all strategies would still use the same scoring logic. Strategy-specific signal generators are the prerequisite.
- **Required correction**: Each strategy must have unique entry logic, unique stop logic, unique target logic, and unique confidence modeling. This is MCE-level work.
- **Timing**: During MCE (MCE-5 phase or dedicated strategy engine sprint)
- **Phase Found**: Phase 6 Addendum (Kyle directive)

### RISK-044: Lazy Loader Contains LATTI Removal Stub — RESOLVED
- **Severity**: LOW
- **Location**: `server/startup/lazy-loader.ts` — LATTI Manager section (lines 37-40)
- **Problem**: The lazy loader still references the removed LATTI system (Directive 11.8B-B) with a stub function that logs a removal notice. This is correct transitional behavior but should be cleaned up once all references to LATTI are confirmed removed.
- **Impact**: None — the stub is harmless and produces only an informational log line.
- **Kyle Decision (Phase 7 Addendum)**: Part of broader LATTI/coherence residue investigation. Confirm whether residual `lattiManaged`, `lockedByUser`, `manualOverride` fields still serve active purpose. If LATTI is fully removed, eliminate all residual flags.
- **Timing**: Post-audit cleanup (bundled with LATTI file cleanup)
- **Phase Found**: Phase 7
- **Status**: **RESOLVED** — Directive 12.2.8, Batch 10 (commit `189fe0b2`). Lazy-loader stub removed. Remaining LATTI references: DB column names only (`tunedByLatti`, `managedByLottie`) — renaming requires migration.

### RISK-045: Schema Validator Defined But Call Site Unknown
- **Severity**: LOW
- **Location**: `server/bootstrap/schema-validator.ts` (Directive 11.7F)
- **Problem**: The schema validator (`validateSchemaVersions()`, `validateSchemaVersionsStrict()`) is defined but is not called from `server/index.ts` or any other startup file in the Phase 7 audit scope. The expected schema version `regime-mapping/v1.4b` is hardcoded. If this validator is not invoked during startup, schema mismatches between canonical TypeScript definitions and bridge JSON files would go undetected at runtime.
- **Impact**: Potential silent schema drift if validator is not called in CI/CD or elsewhere.
- **Timing**: Pre-MCE (verify call site; if missing, add to startup or CI/CD)
- **Phase Found**: Phase 7

### RISK-046: Health Monitor Auto-Recovery Actions Are All Placeholders
- **Severity**: MEDIUM
- **Location**: `server/services/health-monitor.ts` — `executeRecovery()`, `triggerAutoRecovery()`, Phase 41F-G
- **Problem**: The Phase 41F-G auto-recovery framework has a full implementation architecture (cooldown, circuit breaker, planned actions, dry-run mode, event emission) but **every recovery action handler is a placeholder**. Recovery handlers for queue purge, WebSocket reconnect, engine restart, market data reconnect, and queue flush all end with `success = true` after a `console.log`. No actual corrective action is taken.
- **Consequence**: The health monitor correctly detects anomalies, evaluates thresholds (Phase 41F-F), and tracks recovery history, but the system **cannot self-heal**. The circuit breaker and cooldown mechanisms protect against repeated recovery attempts, but there is nothing to recover from since no real action is taken.
- **Impact**: Degraded-to-critical conditions are detected and logged but require manual intervention.
- **Timing**: Post-MCE (enhance recovery handlers when stable enough to trust automated restarts)
- **Phase Found**: Phase 7

### RISK-048: routes.ts Is 23,349-Line Monolithic Router — Extreme Architectural Accumulation
- **Severity**: INFORMATIONAL
- **Location**: `server/routes.ts`
- **Problem**: The main router file contains ~635 inline API endpoints, 40+ service imports, full JWT auth middleware, rate limiting, WebSocket server, CSV generation, tax reporting, and the registration code for all 26 modular route files — all in a single 23,349-line file. This is the largest file in the entire codebase and the most extreme monolithic accumulation point.
- **Impact**: Same class of issue as RISK-047 (index.ts at 1,260 lines). High coupling, poor separation of concerns, difficulty testing individual route groups in isolation. Route changes require editing a 23K-line file.
- **Timing**: Post-audit cleanup (refactoring opportunity, not urgent)
- **Phase Found**: Phase 8

### RISK-049: Hardcoded JWT Fallback Secret in 9 Route Files — **RESOLVED**
- **Severity**: **CRITICAL** (security — if JWT_SECRET env var not set, auth is trivially bypassable)
- **Location**: `server/routes/market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `calibration.ts`, `paper_validation.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: JWT fallback secrets removed from all 12 route files (9 original + regime-archive.ts + routes.ts JWT_SECRET + routes.ts JWT_REFRESH_SECRET). Server now throws a fatal error and refuses to start if `JWT_SECRET` or `JWT_REFRESH_SECRET` environment variables are not set. Fail-hard, fail-closed.
- **Original Problem**: If the `JWT_SECRET` environment variable was not set, all 9 route files fell back to a hardcoded string visible in source code. Any attacker who knew this string could forge valid JWT tokens.
- **Kyle Decision (Phase 8 Addendum, ADD-2)**: Eliminate fallback values entirely. Fail hard if `JWT_SECRET` is not defined.
- **Phase Found**: Phase 8

### RISK-050: Inconsistent JWT Fallback Secret in regime-archive.ts — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/routes/regime-archive.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: Fallback secret removed. `regime-archive.ts` now uses the same fail-hard pattern as all other route files. No more inconsistent authentication behavior.
- **Original Problem**: Used a different fallback secret (`'your-secret-key'`) than all other route files. Tokens would be incompatible across endpoints if env var was missing.
- **Phase Found**: Phase 8

### RISK-051: Auth Bypass via `x-internal-audit` Header in 4 Route Files — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/routes/pricing.ts`, `calibration.ts`, `regime-archive.ts`, `paper_validation.ts`
- **Status**: **RESOLVED** — Directive 12.1.3, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: All `x-internal-audit` and `x-validation-session` bypass header checks removed from all 4 files. The `auditOrAuth` middleware functions now enforce JWT authentication on every request with no bypass path. Replit confirmed no dependency on these headers before removal.
- **Original Problem**: Any request with `x-internal-audit: true` header bypassed JWT authentication entirely. `calibration.ts` and `regime-archive.ts` also accepted `x-validation-session` as a second bypass.
- **Kyle Decision (Phase 8 Addendum, ADD-3)**: Remove entirely (option c selected).
- **Phase Found**: Phase 8

### RISK-052: 13 Route Files Have Zero Authentication
- **Severity**: MEDIUM-HIGH
- **Location**: `health.ts`, `status.ts`, `dse.ts`, `signal-audit.ts`, `audit.ts`, `back_audit.ts`, `provenance-debug.ts`, `vts-predictive-adjustments.ts`, `dce.ts`, `gasp.ts`, `mof.ts`, `pdc-ecs.ts`, `apr-sle.ts`
- **Problem**: 13 of 26 route files have no authentication middleware on any endpoint. This includes files with destructive/mutating operations: `health.ts` (POST recovery trigger, fault injection), `dse.ts` (POST reset), `audit.ts` (state-changing GET), `gasp.ts` (reset, rollback, recalibrate with unbounded inputs), `mof.ts` (evolve, reset), `pdc-ecs.ts` (reset, recalibrate), `apr-sle.ts` (reset, recalibrate), `provenance-debug.ts` (enable/disable debug, clear traces).
- **Mitigating factor**: L-Series files (dce, gasp, mof, pdc-ecs, apr-sle) will be removed with Wave 6. `status.ts` intentionally has no auth for health probes. `vts-predictive-adjustments.ts` is read-only.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Standardize permission enforcement across all routes. L-Series files removed with Wave 6. Active files must have auth added during auth consolidation.
- **Timing**: For L-Series files → remove with Wave 6. For active files → add auth during ADD-1 consolidation.
- **Phase Found**: Phase 8

### RISK-053: Duplicated Auth Middleware Across 8+ Route Files
- **Severity**: MEDIUM
- **Location**: All route files with `requireAuth` copy-pasted inline
- **Problem**: The `requireAuth` function and `AuthenticatedRequest` interface are copy-pasted identically in 8+ route files instead of being imported from a shared module. Each copy duplicates JWT verification, the hardcoded fallback secret, and error handling. This middleware is NOT equivalent to the main `authenticateToken` middleware in routes.ts (which additionally fetches user from database on every request — fail-closed). Only `learning.ts` (unmounted) correctly imports from `../middleware/auth`.
- **Impact**: Security policy changes require updating 9+ files. Inconsistency between route-file auth (JWT only) and routes.ts auth (JWT + DB verification). Any security fix must be applied to all copies.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Part of auth layer consolidation. Centralize to single middleware module with RBAC enforcement.
- **Timing**: During route cleanup or post-audit — refactor to centralized middleware module.
- **Phase Found**: Phase 8

### RISK-055: RBAC Not Enforced in Modular Route Files — Phase 8 Addendum ADD-1
- **Severity**: HIGH
- **Location**: All 8 route files with copy-pasted `requireAuth`: `market.ts`, `vts.ts`, `vts-audit.ts`, `maco.ts`, `rl.ts`, `m3b.ts`, `tlva.ts`, `regime-archive.ts`
- **Problem**: The copy-pasted `requireAuth` middleware verifies JWT token validity but **never checks the user's role or permissions**. It decodes the token and attaches `req.user = { id, username }` — no role field is extracted or validated. Any authenticated user (including `viewer` role) can access all mutating endpoints in these files. Examples: `vts-audit.ts` POST `/update-mode` allows any user to switch system mode; `market.ts` POST `/regime/refresh` allows any user to force regime recheck; `calibration.ts` POST `/ml/trigger` allows any user to trigger ML calibration.
- **Contrast**: routes.ts uses `authenticateToken` (DB-backed) + `requireEditor`/`requireOwner` guards on mutating endpoints.
- **Kyle Decision (Phase 8 Addendum, ADD-1)**: Standardize permission enforcement across all routes. All mutating endpoints must enforce at minimum `editor` role. All admin/destructive operations must enforce `owner` role.
- **Timing**: During auth consolidation (post-audit or pre-MCE)
- **Phase Found**: Phase 8 Addendum

### RISK-056: No API Versioning — Phase 8 Addendum ADD-4
- **Severity**: LOW
- **Location**: All endpoints use unversioned `/api/*` paths
- **Problem**: No API versioning namespace. All endpoints use `/api/*` directly. Any breaking change to endpoint contracts requires coordinating frontend and backend deployments simultaneously. No path for graceful API migration.
- **Kyle Decision (Phase 8 Addendum, ADD-4)**: Introduce `/api/v1/` namespace before next major refactor.
- **Implementation**: Mount existing apiRouter at both `/api/v1` and `/api` (backward-compatible), migrate frontend, then deprecate unversioned paths.
- **Timing**: Post-audit cleanup (bundled with routes.ts refactoring)
- **Phase Found**: Phase 8 Addendum

### BUG-016: REST Violation — GET Method for State-Changing Operation in audit.ts
- **Severity**: LOW
- **Location**: `server/routes/audit.ts` — GET `/api/audit/trigger`
- **Problem**: Uses GET method for a state-changing operation (triggers system audit). GET requests should be idempotent per HTTP specification. This means browser prefetch, link crawling, or caching proxies could inadvertently trigger audits.
- **Timing**: Anytime (change to POST)
- **Phase Found**: Phase 8

### BUG-017: Internal Service Key Guard Bypass in rl.ts
- **Severity**: MEDIUM
- **Location**: `server/routes/rl.ts` — GET `/api/rl/internal/buffer`
- **Code**: `const expectedKey = process.env.INTERNAL_SERVICE_KEY; if (expectedKey && internalKey !== expectedKey) { ... }`
- **Problem**: If `INTERNAL_SERVICE_KEY` env var is empty string or not set, the guard is bypassed entirely (empty string is falsy in JavaScript). The internal buffer endpoint, intended only for ML service-to-service communication, becomes publicly accessible.
- **Kyle Decision (Phase 8 Addendum, ADD-3)**: Part of header bypass removal. Internal service auth must be fail-closed.
- **Timing**: Pre-MCE (change to fail-closed: reject if env var is not set)
- **Phase Found**: Phase 8

### RISK-054: vts.ts Route File at 1,425 Lines / 37 Endpoints
- **Severity**: LOW
- **Location**: `server/routes/vts.ts`
- **Problem**: Oversized route file with 37 endpoints covering VTS status, configuration, tuning, simulation control, and audit functions. Should be split into logical groupings (VTS core, VTS config, VTS audit). Contains functional overlap with `vts-audit.ts` (which adds 6 more endpoints at the same mount point).
- **Timing**: During VTS refactor or post-audit cleanup
- **Phase Found**: Phase 8

### RISK-047: Server Entry Point Is 1,260-Line Single File — Architectural Accumulation
- **Severity**: INFORMATIONAL
- **Location**: `server/index.ts`
- **Problem**: The entire server boot sequence, middleware configuration, route mounting, service initialization (~40+ services), lazy loading, scheduler registration, config audit telemetry, and graceful shutdown are all in a single 1,260-line file. This is a maintainability observation, not an active defect — the code is functional and well-organized with clear section comments.
- **Impact**: High coupling makes it harder to reason about boot order dependencies and to test individual startup modules in isolation.
- **Kyle Decision (Phase 7 Addendum)**: "Phase 7 does not indicate instability. It indicates architectural accumulation." Acknowledged as hygiene candidate for post-audit cleanup, not emergency defect.
- **Timing**: Post-audit cleanup (refactoring opportunity, not urgent)
- **Phase Found**: Phase 7

---

## PHASE 9 FINDINGS

### BUG-018: Dead History Import in App.tsx
- **Severity**: LOW
- **Location**: `client/src/App.tsx` — line 7
- **Code**: `import History from "@/pages/history";`
- **Problem**: `History` page component is imported but never rendered in any route. The history page was superseded by the Trade History tab in `active-trades.tsx`, but the import was never removed.
- **Impact**: Unnecessary bundle inclusion of a 253-line dead page component.
- **Verified**: Yes — grep confirmed `History` only appears on the import line in App.tsx, not in any JSX.
- **Timing**: Anytime (trivial fix — remove import)
- **Fix**: Remove the import statement.
- **Phase Found**: Phase 9

### BUG-019: Dead Watchlist Import in active-trades.tsx
- **Severity**: LOW
- **Location**: `client/src/pages/active-trades.tsx` — line 4
- **Problem**: `Watchlist` component is imported but never rendered in JSX. `useQuery` is also imported but never called in the page component. These are remnants from a previous page layout that was refactored into tabs.
- **Impact**: Unnecessary imports, potential bundle size.
- **Timing**: Anytime (trivial fix)
- **Fix**: Remove unused imports.
- **Phase Found**: Phase 9

### BUG-020: Simulated Current Price in Active Trades Component — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `client/src/components/trading/active-trades.tsx` — line 30
- **Status**: **RESOLVED** — Directive 12.1.4, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Resolution**: Removed `entryPrice * 1.02` simulated price. Component now shows entry price with "(entry)" label and "Awaiting live price" for P/L column. The v2 component (`active-trades-v2.tsx`) already fetches real prices via WebSocket and is the correct production implementation.
- **Original Problem**: Current price was simulated as a hardcoded 2% gain above entry price. Users saw fabricated green P/L numbers with no connection to market reality.
- **Phase Found**: Phase 9

### BUG-021: system-config.tsx Uses Raw fetch() Instead of apiFetch
- **Severity**: LOW
- **Location**: `client/src/pages/system-config.tsx`
- **Problem**: Uses `fetch()` with `localStorage.getItem('token')` for API calls instead of the centralized `apiRequest` / `apiFetch` utilities. This bypasses the standard auth flow (token refresh, 30s timeout, 401 retry, `x-app-mode` header, request tracing).
- **Impact**: Config page could fail silently on expired tokens (no auto-refresh), has no timeout protection, and is missing the trading mode header.
- **Timing**: Anytime (moderate fix — refactor to use apiRequest)
- **Fix**: Replace raw `fetch()` calls with `apiRequest` from `@/lib/queryClient`.
- **Phase Found**: Phase 9

---

### RISK-057: 123 Console.log Statements Across Frontend — Production Logging Concern
- **Severity**: MEDIUM
- **Location**: Throughout `client/src/` — top offenders: `top-bar.tsx` (30), `api.ts` (16), `performance-profiler.ts` (12), `use-websocket.tsx` (11), `active-trades-v2.tsx` (11)
- **Problem**: 123 `console.log` statements persist in production code. Several are in high-frequency render paths (Phase 35.2A goal widgets log on every render, `api.ts` logs every API call). This causes:
  - Performance degradation on high-frequency components
  - Information leakage (API tokens, trading states, internal metrics visible in browser console)
  - Console noise obscures real errors
- **Fix**: Replace with conditional dev-mode logging (`import.meta.env.DEV && console.log(...)`) or remove entirely. The Vite build will tree-shake dev-only code.
- **Timing**: Pre-MCE (easy batch fix)
- **Phase Found**: Phase 9

### RISK-058: ~460 Server Endpoints Have No Frontend Consumer (ADD-5 Census)
- **Severity**: INFORMATIONAL
- **Location**: System-wide — frontend references ~291 of ~750 server endpoints
- **Problem**: The ADD-5 Endpoint Census found that approximately 460 server endpoints (~61% of total) have NO frontend consumer. Some of these serve legitimate purposes (internal service-to-service communication, scheduled jobs, external integrations), but many are likely dead API surface from removed features.
- **Recommended action**: During post-audit cleanup, use this census to identify and remove dead endpoints — particularly those in L-Series route files (already targeted for Wave 6), Walter routes (Wave 3), and speculative endpoints that were never implemented.
- **Timing**: Post-audit cleanup (use census data during Wave 3/6/8 removals)
- **Phase Found**: Phase 9

### RISK-059: enhanced-system-monitoring.tsx References ~60 Speculative/Aspirational API Endpoints
- **Severity**: LOW
- **Location**: `client/src/components/system/enhanced-system-monitoring.tsx`
- **Problem**: This single component references approximately 60 API endpoints, many across speculative/aspirational namespaces that almost certainly do not exist on the server: `/api/ethics/*`, `/api/collaboration/*`, `/api/federation/*`, `/api/knowledge/*`, `/api/oversight/*`, `/api/alignment/*`, `/api/introspection/*`, `/api/reasoning/*`. These were likely added as UI scaffolding for features that were never implemented.
- **Impact**: All calls to non-existent endpoints return 404s. React Query handles this gracefully (error states), but the dead references add unnecessary network requests and console noise.
- **Fix**: Audit which endpoints actually exist on the server. Remove references to non-existent endpoints. Consider whether this component should be simplified.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9

### RISK-060: Walter Frontend Integration Will Break on Backend Removal (Wave 3) — RESOLVED
- **Status**: **RESOLVED** — Directive 12.2.3 Sub-Batch B, Batch 6 (2026-02-26), commit `1ea3bb38`
- **Severity**: MEDIUM (planning concern)
- **Location**: 7+ frontend files with Walter dependencies
- **Resolution**: Frontend Walter cleanup was absorbed into Sub-Batch B (Batch 6) alongside the backend removal. 5 frontend files deleted (`walter.tsx`, `walter-floating-assistant.tsx`, `walter-approvals.tsx`, `chat-file-attachment.tsx`, `useWalterPreferences.tsx`). App.tsx modified (removed Walter route, floating assistant render, getPageContext). sidebar.tsx modified (removed Walter nav item). Backend and frontend were removed in a single coordinated batch, preventing the broken-state window.
- **Phase Found**: Phase 9

### RISK-061: Per-TradeRow Settings Fetch Creates N+1 Query Pattern
- **Severity**: LOW
- **Location**: `client/src/components/trading/active-trades.tsx` — `TradeRow` component
- **Problem**: Each `TradeRow` component independently fetches `/api/settings` (for timezone information) with a 5-minute stale time. If there are 10 active trades, this creates 10 independent `useQuery` calls for the same endpoint. While React Query deduplicates concurrent requests, this is an anti-pattern that wastes query cache entries and could cause unnecessary re-renders.
- **Fix**: Lift the settings query to the parent component and pass timezone as a prop.
- **Timing**: Anytime (low priority optimization)
- **Phase Found**: Phase 9

### RISK-062: AJ16/AJ17 Naming Inconsistency in Diagnostics Card
- **Severity**: LOW
- **Location**: `client/src/components/goals/aj17-diagnostic-card.tsx`
- **Problem**: The file name and API paths reference "AJ17" while the card title and toast messages display "AJ16". This naming inconsistency could confuse developers maintaining the code.
- **Fix**: Align naming to a single identifier.
- **Timing**: Anytime (cosmetic)
- **Phase Found**: Phase 9

---

## PHASE 9 ADDENDUM — Kyle's Directives (2026-02-17)

> **Kyle's Final Position**: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit."

### RISK-063: JWT Token Storage in localStorage — XSS Exposure Risk (Phase 9 Addendum ADD-1)
- **Severity**: MEDIUM (security)
- **Location**: `client/src/lib/auth.ts` — `saveTokens()`, token retrieval throughout `api.ts`
- **Problem**: JWT access tokens and refresh tokens are stored in `localStorage`. This is the simplest storage mechanism but has a known security trade-off: any XSS vulnerability in the application (including third-party dependencies) allows an attacker to read and exfiltrate JWT tokens from `localStorage`. The 12-hour access token lifetime gives a large exploitation window.
- **Contrast**: `httpOnly` cookies cannot be read by JavaScript, preventing token exfiltration via XSS. A hybrid approach (httpOnly refresh cookie + in-memory access token) minimizes both XSS and CSRF risks.
- **Kyle Directive (Phase 9 Addendum ADD-1)**: Document this risk. Recommend future migration to secure cookie or hybrid approach.
- **Recommended migration path**:
  1. Move `refreshToken` to an `httpOnly`, `Secure`, `SameSite=Strict` cookie
  2. Keep `accessToken` in memory only (not localStorage) — short-lived, re-obtained via refresh cookie
  3. Add CSRF protection if cookie-based auth is adopted
  4. Reduce access token lifetime from 12 hours to 15–30 minutes
- **Timing**: Post-audit (future security improvement — not urgent for paper-only mode)
- **Phase Found**: Phase 9 Addendum

### RISK-064: Monolithic Pages Require Component Decomposition (Phase 9 Addendum ADD-2)
- **Severity**: MEDIUM (maintainability)
- **Location**: `ai-transparency.tsx` (2,074 lines), `machine-learning.tsx` (1,985 lines), `analytics.tsx` (1,939 lines), `top-bar.tsx` (1,042 lines)
- **Problem**: Four frontend files exceed 1,000 lines each. These are unmaintainable monoliths where individual sections are tightly coupled. Bug fixes, feature changes, and code review are significantly harder in files this large.
- **Kyle Directive (Phase 9 Addendum ADD-2)**: Flag these files for component decomposition.
- **Decomposition strategy**: Each major section (tab, panel, data view) should be extracted into a standalone component with clear props/data contracts.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9 Addendum

### RISK-065: No Centralized Polling Policy — Ad-Hoc Refresh Intervals (Phase 9 Addendum ADD-3)
- **Severity**: LOW
- **Location**: Throughout all hooks and components with `useQuery` refetch intervals
- **Problem**: Every hook and component defines its own polling interval ad-hoc. There is no centralized polling policy or shared constants. Intervals range from 5s (trading status) to 3,600s (database status) with no documented rationale for the specific values. Some inconsistencies: watchlist scan diagnostics polls at 10s (too aggressive for informational data), KillSwitchBanner polls `/api/settings` at 15s (could be WebSocket-driven instead).
- **Kyle Directive (Phase 9 Addendum ADD-3)**: Define standard refresh tiers:
  - **Critical** (5s): Trading status, real-time state
  - **Semi-critical** (15–30s): Health, active trades, alerts
  - **Informational** (60s+): Portfolio, briefs, settings
- **Fix**: Create a `POLLING_TIERS` constant in `lib/` that all hooks reference. Enforce via code review.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 9 Addendum

### Phase 9 Addendum ADD-4: Remove Speculative Endpoints
- **Status**: Directive — linked to RISK-059
- **Kyle Directive**: Clean `enhanced-system-monitoring.tsx`. Remove the ~60 speculative/aspirational API endpoints that generate unnecessary 404 network requests. Simplify the component to match actual system capabilities.
- **Timing**: Post-audit cleanup (can be bundled with ADD-2 decomposition)

### Phase 9 Addendum ADD-5: Remove Simulated Price Display — **RESOLVED**
- **Status**: **RESOLVED** — Directive 12.1.4, Batch 3, commit `0ddc8db1` (2026-02-23)
- **Kyle Directive**: Replace `entryPrice * 1.02` hardcoded simulation with real price feed from price cache or WebSocket price stream.
- **Resolution**: Simulated price removed. Shows entry price with honest "Awaiting live price" label. Full live price integration exists in v2 component.
- **Kyle's elevation**: BUG-020 timing confirmed as Pre-MCE by Kyle.

---

## REGISTRY METADATA

| Metric | Count |
|--------|-------|
| Total Bugs | 21 |
| Critical Bugs | 7 (BUG-001 through BUG-004, ~~BUG-006~~ RESOLVED, BUG-008 partial, ~~BUG-009~~ RESOLVED) |
| Informational Bugs | 2 (BUG-010, BUG-011 — deferred, live mode not in scope) |
| High Bugs | 2 (BUG-007, BUG-012) |
| Medium Bugs | 4 (BUG-013, BUG-015, BUG-017, BUG-020) |
| Low Bugs | 6 (BUG-005, BUG-014, BUG-016, BUG-018, BUG-019, BUG-021) |
| Architectural Risks | 65 (RISK-001 through RISK-065) |
| Critical Architectural Risks | 2 (RISK-043 — artificial strategy differentiation; ~~RISK-049~~ RESOLVED) |
| Informational Risks | 3 (RISK-047 — monolithic index.ts; RISK-048 — monolithic routes.ts; RISK-058 — endpoint census) |
| Phase 9 Addendum Risks | 3 (RISK-063 — XSS token exposure; RISK-064 — monolithic pages; RISK-065 — no polling policy) |
| Phase 9 Addendum Directives | 2 (ADD-4 — remove speculative endpoints; ADD-5 — remove simulated price) |
| Unification Recommendations | 3 |
| Kyle-Accepted/Deferred | 6 (RISK-029 accepted, RISK-031 deferred, RISK-027 superseded, BUG-010/011 deferred, RISK-032 accepted, RISK-036 deferred) |
| Formally Deprecated | 2 (RISK-028 — Goal Alignment, BUG-012 — Goal Alignment Location 2). ~~RISK-037~~ RESOLVED. |
| Confirmed Legacy | 1 (RISK-040 — 5 Walter-era learning services, confirmed Kyle Phase 6 Addendum) |
| Live Mode Deferred | 3 (BUG-010, BUG-011, RISK-036 — informational until live refactor) |
| Items Pre-MCE Timing | 20 (BUG-004, BUG-006, BUG-007, BUG-008, BUG-009, BUG-012, BUG-014, BUG-017, BUG-020, RISK-013, RISK-014/015, RISK-016/017/018, RISK-023, RISK-028, RISK-037, RISK-045, RISK-049, RISK-050, RISK-051, RISK-057) |
| Items During-MCE/Wave 6 | 18 (includes RISK-019, RISK-020, RISK-038, RISK-043) |
| Items L-Series Cluster Removal | 2 (RISK-027 — entire GASP removed with cluster; RISK-052 partially — L-Series route files) |
| Items Post-MCE/Anytime | 36 (includes RISK-021 through RISK-026, RISK-029, RISK-030, RISK-033, RISK-034, RISK-035, RISK-039, RISK-041, RISK-042, RISK-044, RISK-046, RISK-047, RISK-048, RISK-052 active files, RISK-053, RISK-054, RISK-055, RISK-056, RISK-058, RISK-059, RISK-060, RISK-061, RISK-062, RISK-063, RISK-064, RISK-065, BUG-016, BUG-018, BUG-019, BUG-021) |
| Items Post-Audit Architecture | 1 (RISK-031 — DSE cap authority) |
| Post-Audit Infrastructure Investigation | 9 systems flagged (Kyle Phase 7 Addendum — scheduler tasks, MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI residuals, CLE/CWA, Ethical Principles, Phase 17.0 Cluster) |

**Phase 4 Addendum applied**: RISK-027 superseded (GASP itself is legacy), RISK-028 elevated to formal deprecation, RISK-029 accepted by Kyle, RISK-031 deferred to post-audit.

**Phase 5 additions**: BUG-010/011 (TradingEngine placeholder code), BUG-012 (Goal Alignment second location), RISK-032 through RISK-036.

**Phase 5 Addendum applied**: NLAI formally deprecated (RISK-037). BUG-010/011/RISK-036 reclassified as informational (live mode deferred per Kyle). RISK-032 accepted (MicroExecution experimental/dormant). "Must Fix Before Live Trading" category replaced with "Live Mode Deferred" category.

**Phase 6 additions**: BUG-013 (ML Service Client stale interface), BUG-014 (retraining freeze stale deployment), RISK-038 through RISK-042.

**Phase 6 Addendum applied**: RISK-043 added (CRITICAL — artificial strategy differentiation, Kyle: "core architectural problem in Phase 6"). RISK-040 upgraded from POTENTIAL LEGACY to CONFIRMED LEGACY (5 Walter-era learning services). RISK-039 confirmed observability-only. BUG-014 confirmed for removal/manual trigger.

**Phase 7 additions**: BUG-015 (dual shutdown handlers race condition), RISK-044 through RISK-047. Three potential legacy systems flagged for Kyle confirmation: Phase 17.0 Cluster System (TaskRouter + TaskWorker), CLE/CWA scheduler tasks, Ethical Principles Seeder.

**Phase 7 Addendum applied**: Kyle's position: "Phase 7 infrastructure is stable. No hidden kill switches, no silent trade shutdown mechanisms. However, architectural accumulation requires post-audit cleanup." All 3 potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED." 6 additional systems added to post-audit investigation list: MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags, background scheduler tasks. New registry category added: "Post-Audit Infrastructure Investigation" (9 systems). BUG-015 timing updated from "Pre-MCE" to "Post-audit investigation." RISK-047 acknowledged as architectural accumulation.

**Phase 8 additions**: BUG-016 (REST violation — GET mutates state in audit.ts), BUG-017 (rl.ts internal service key bypass), RISK-048 through RISK-054. Major security findings: RISK-049 (CRITICAL — hardcoded JWT fallback in 9 files), RISK-050 (inconsistent JWT secret in regime-archive.ts), RISK-051 (x-internal-audit header bypass in 4 files), RISK-052 (13 unauthenticated route files), RISK-053 (duplicated auth middleware in 8+ files). Architecture: RISK-048 (routes.ts at 23,349 lines — largest file in codebase), RISK-054 (vts.ts at 1,425 lines / 37 endpoints).

**Phase 8 Addendum applied**: Kyle's position: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk." Five directives issued:
- **ADD-1 (RISK-055)**: RBAC enforcement inconsistency — modular route files verify JWT only but do not enforce role checks. Standardize permission enforcement across all routes.
- **ADD-2 (RISK-049/050)**: Remove JWT fallback secrets entirely. Fail hard if `JWT_SECRET` is not defined.
- **ADD-3 (RISK-051, BUG-017)**: Remove `x-internal-audit` header bypass. Replace with proper internal service key validation, signed internal JWT, or remove entirely.
- **ADD-4 (RISK-056)**: Create API versioning plan. Introduce `/api/v1/` namespace before next major refactor.
- **ADD-5**: Post-audit endpoint census — during Phase 9, cross-reference frontend usage against all endpoints, mark unused for removal.
Kyle decisions added to RISK-049, RISK-050, RISK-051, RISK-052, RISK-053, BUG-017. RISK-055 (RBAC gap) and RISK-056 (API versioning) added. Total: 17 bugs, 56 risks.

**Phase 9 additions**: BUG-018 (dead History import in App.tsx), BUG-019 (dead Watchlist import in active-trades.tsx), BUG-020 (simulated current price in active trades), BUG-021 (system-config bypasses apiFetch), RISK-057 through RISK-062. ADD-5 Endpoint Census completed: ~291 frontend endpoints vs ~750 server endpoints — ~460 endpoints with no frontend consumer. Major findings: 123 console.log statements (RISK-057), enhanced-system-monitoring.tsx references ~60 speculative endpoints (RISK-059), Walter frontend integration requires coordinated cleanup wave (RISK-060). Total: 21 bugs, 62 risks.

**Phase 9 Addendum applied**: Kyle's position: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit." Five directives issued:
- **ADD-1 (RISK-063)**: JWT tokens in localStorage create XSS exposure risk. Document and recommend migration to httpOnly cookie or hybrid approach. MEDIUM severity.
- **ADD-2 (RISK-064)**: Four monolithic pages (ai-transparency 2,074, machine-learning 1,985, analytics 1,939, top-bar 1,042 lines) flagged for component decomposition. MEDIUM severity.
- **ADD-3 (RISK-065)**: No centralized polling policy. Define standard refresh tiers: Critical (5s), Semi-critical (15–30s), Informational (60s+). LOW severity.
- **ADD-4**: Remove speculative endpoints from enhanced-system-monitoring.tsx (~60 aspirational API endpoints). Directive linked to RISK-059.
- **ADD-5**: Remove simulated price display (`entryPrice * 1.02`). Replace with real price feed. Directive linked to BUG-020. Kyle confirmed Pre-MCE timing.
Total: 21 bugs, 65 risks.

---

## PHASE 10 FINDINGS

### RISK-066: Zero Frontend Test Coverage — 189 Frontend Files With No Tests
- **Severity**: HIGH
- **Location**: `client/src/` — all 189 frontend files (25 pages, 133 components, 14 hooks, 9 lib, 2 contexts, 2 utils)
- **Problem**: No `*.test.tsx`, `*.spec.tsx`, or any test files exist under `client/`. React Testing Library is not installed. No component tests, integration tests, or snapshot tests exist for any frontend code. The entire frontend — including authentication flows, trading mode switching, WebSocket reconnection, and RBAC enforcement — has zero automated test coverage.
- **Impact**: Frontend regressions can only be caught manually or through the 3 Playwright E2E tests (which cover config snapshot and paper trading flow only, not individual component behavior).
- **Recommended**: Install `@testing-library/react` and `@testing-library/jest-dom`. Add Vitest config for client-side tests. Start with critical path components: auth flow, trading mode context, RBAC hook, WebSocket singleton.
- **Timing**: Post-audit (medium-term investment)
- **Phase Found**: Phase 10

### RISK-067: No CI/CD Pipeline — Tests Never Run Automatically
- **Severity**: HIGH
- **Location**: Repository root — no `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, or any CI/CD configuration
- **Problem**: The 60 test files are never automatically executed. No pipeline runs tests on pull requests, merges, or deployments. Tests only run when a developer manually invokes `npx vitest` or `npx playwright test`. This means regressions can be introduced without any automated safety net.
- **Impact**: Test suites may be silently broken. Schema version conflicts between tests may go undetected. Architectural invariant tests (codebase scanning) provide no value unless someone remembers to run them.
- **Recommended**: Create a GitHub Actions or GitLab CI pipeline that runs `vitest` on every push. Add Playwright E2E tests as a separate pipeline stage (requires running server).
- **Timing**: Post-audit (should be one of the first infrastructure improvements)
- **Phase Found**: Phase 10

### RISK-068: No Test Scripts in package.json — No Standard Entry Point
- **Severity**: MEDIUM
- **Location**: `package.json` — `"scripts"` section
- **Problem**: No `"test"`, `"test:unit"`, `"test:e2e"`, or `"test:integration"` scripts are defined. The only scripts are `dev`, `build`, `start`, `check`, `db:push`. New developers have no obvious way to discover or run the test suite. CI/CD pipelines cannot use the standard `npm test` command.
- **Fix**: Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:ui": "vitest --ui"`, `"test:e2e": "playwright test"`, `"test:coverage": "vitest run --coverage"`
- **Timing**: Anytime (trivial fix)
- **Phase Found**: Phase 10

### RISK-069: Schema Version Conflicts Across Tests — Staleness Gradient
- **Severity**: MEDIUM
- **Location**: Multiple test files assert different schema versions
- **Problem**: `schema_v1_5.test.ts` asserts `SCHEMA_VERSION === 'v1.5.0'` while `telemetry_persistence_sql.test.ts` asserts v1.5.2, `net_expectancy.test.ts` asserts v1.5.7, and `cost_cache.test.ts` asserts v1.5.8. If the shared `SCHEMA_VERSION` constant is at v1.5.8, then `schema_v1_5.test.ts` will fail. Multiple schema version assertions across different test files create a staleness gradient where older tests break silently.
- **Recommended**: Audit all schema version assertions. Remove version pinning from older tests or update them to match current versions. Consider making schema version assertions reference a single source of truth rather than hardcoded strings.
- **Timing**: Post-audit (should be addressed before enabling CI/CD)
- **Phase Found**: Phase 10

### RISK-070: Test Files for Deprecated Walter/Bob Systems — Will Break on Removal — RESOLVED
- **Status**: **RESOLVED** — Directive 12.2.3 (Batches 5-7B, completed 2026-02-26)
- **Severity**: LOW (planning concern)
- **Location**: `server/tests/diagnostic-system.test.ts` (466→414→~285 lines), `server/tests/phase-6.0-simulations.test.ts` (136→65 lines, cleaned in Batches 5+6)
- **Resolution (Walter)**: All Walter imports and test blocks removed from both test files in Batch 6. `phase-6.0-simulations.test.ts` retains only 2 Bob diagnostic tests (deferred to Bob cleanup batch). `diagnostic-system.test.ts` retains Tests 1-7 and 9+ (diagnostic-controller/bob-inspector tests); Test 8 (walterPatchAnalyst) removed.
- **Resolution (Bob)**: Batch 7B removed bobInspector import and Tests 4-7 from diagnostic-system.test.ts (~129 lines). All Walter/Bob test dependencies now fully removed.
- **Remaining**: `paper_validation_engine.ts` DCE/GASP references remain for Wave 6 (L-Series removal).
- **Phase Found**: Phase 10

### RISK-071: Standalone Test Scripts Not Discoverable by Test Framework
- **Severity**: LOW
- **Location**: `server/tests/diagnostic-system.test.ts`, `server/tests/live-pricing-validation.ts`, `server/tests/system-verify.ts`, `server/tests/test-force-trade.ts`
- **Problem**: Four test files use standalone script patterns (custom `main()`, `process.exit()`, shebang lines) rather than Vitest `describe`/`it` blocks. Some have `.test.ts` extensions despite not being framework tests, causing confusion. These cannot be discovered or executed by `vitest run` and require manual invocation via `tsx`. They also require a running server and database, making them environment-dependent.
- **Recommended**: Either convert to Vitest tests with proper setup/teardown, or rename to `*.script.ts` to distinguish from framework tests.
- **Timing**: Post-audit cleanup
- **Phase Found**: Phase 10

### RISK-072: No Mocking Infrastructure — All Tests Require Real Dependencies
- **Severity**: LOW
- **Location**: All 60 test files
- **Problem**: No mocking framework is used anywhere in the test suite. Every test imports and exercises real service code. Integration and system tests require a running database and server. This makes tests high-fidelity but also fragile, slow, and impossible to run in isolated CI environments without full infrastructure.
- **Impact**: Cannot run tests in lightweight CI containers. Test failures cascade when shared services have initialization issues. Database state leaks between tests.
- **Recommended**: For critical path tests, introduce `vi.mock()` for external dependencies (database, Kraken API). Keep the current real-import approach for integration tests but add a separate "unit" tier that runs without infrastructure.
- **Timing**: Post-audit (long-term investment)
- **Phase Found**: Phase 10

---

## PHASE 11 FINDINGS

### RISK-073: ~71 Legacy Tables (~44% of Schema) — Dead Database Surface
- **Severity**: MEDIUM (capacity/maintenance)
- **Location**: `shared/schema.ts` — tables from Phases 8.6–18 (L-Series cognitive architecture, ethics/governance, distributed cluster), Walter tables, paper-specific duplicates
- **Problem**: Of ~160 tables defined in schema.ts, approximately 71 (~44%) serve deprecated or aspirational systems: 32 L-Series cognitive tables (Phases 8.6–10.0), 16 ethics/governance tables (Phases 11–16), 9 distributed cluster tables (Phases 17–18), 10 Walter tables, 3 paper-specific duplicate tables, and 1 superseded guardrails V1 table. These tables exist in the database consuming storage overhead and add 2,000+ lines to the schema definition.
- **Impact**: Schema file complexity (4,836 lines), ~40 legacy enum definitions that cannot be dropped while referencing tables exist, potential stale data accumulation, developer confusion about which tables are active.
- **Recommended**: After confirming tables are empty (zero rows), drop legacy tables in coordinated waves matching the existing removal plan (Wave 3 for Walter, Wave 6 for L-Series, etc.). Remove corresponding enum definitions after table drops.
- **Timing**: Post-audit cleanup (coordinate with existing removal waves)
- **Phase Found**: Phase 11

### RISK-074: Dual Migration Directories — Untracked Migration Files
- **Severity**: MEDIUM
- **Location**: `migrations/` (4 files, journal tracked) and `drizzle/migrations/` (5 files, no journal)
- **Problem**: Two separate migration directories exist. The Drizzle Kit journal (`migrations/meta/_journal.json`) only tracks 2 of the 4 files in `migrations/`. The 5 files in `drizzle/migrations/` have no journal at all. This means 7 of 9 total migration files are not tracked by the migration system. The primary migration mechanism (`drizzle-kit push`) bypasses migration files entirely, comparing schema.ts directly to the live database.
- **Impact**: No reliable migration history. Cannot reconstruct schema state at any point in time. Cannot replay migrations on a fresh database. No rollback capability.
- **Recommended**: Consolidate to a single migration directory. Ensure all migrations are tracked in the journal. Consider switching from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate` for a more controlled workflow.
- **Timing**: Post-audit (recommended before any production deployment)
- **Phase Found**: Phase 11

### RISK-075: No Database Pruning or Archival Strategy — 10 GB Limit
- **Severity**: MEDIUM
- **Location**: Neon PostgreSQL instance (10 GB limit), `server/services/database-monitor.ts`
- **Problem**: The database monitor checks size daily against a 10 GB Neon limit (warning at 6.5 GB, critical at 8 GB), but there is no mechanism to archive or prune old data. Active tables that grow continuously include: `telemetry_history`, `paper_sim_trades`, `paper_sim_trade_logs`, `execution_attempt_audit`, `rtb_signals`, `safety_telemetry`, `error_logs`, `kill_switch_events`, and various audit/log tables. With no TTL, retention policy, or archival process, these tables will grow until they hit the 10 GB limit.
- **Impact**: Eventually the database will fill up and operations will fail. Legacy tables with stale data compound the problem by consuming space that active tables need.
- **Recommended**: Implement retention policies for log/telemetry tables (e.g., 90-day rolling window). Drop legacy tables to reclaim space. Consider moving historical data to a separate archive database or file-based storage.
- **Timing**: Post-audit (should be addressed before sustained paper trading generates significant data)
- **Phase Found**: Phase 11

### RISK-076: storage.ts Monolith — Third-Largest File in Codebase
- **Severity**: LOW (maintainability)
- **Location**: `server/storage.ts` (4,580 lines)
- **Problem**: The data access layer is a single monolithic file containing all CRUD operations for all domains (trading, Walter, AI, goals, telemetry, diagnostics, etc.). At 4,580 lines, it is the third-largest file in the codebase after `routes.ts` (23,349) and `schema.ts` (4,836). Like `routes.ts`, this is an architectural accumulation pattern where each new feature added methods to the same file.
- **Impact**: Difficult to navigate, review, and test. Walter-related storage methods will become dead code on Wave 3 removal. No domain-specific boundaries.
- **Recommended**: Consider splitting into domain-specific storage modules (trading-storage.ts, walter-storage.ts, telemetry-storage.ts, etc.) during post-audit refactoring. This is a lower priority than routes.ts decomposition.
- **Timing**: Post-audit (anytime)
- **Phase Found**: Phase 11

### RISK-077: ~50 Untyped jsonb Columns — No ORM-Level Validation
- **Severity**: LOW
- **Location**: Throughout `shared/schema.ts` — ~50 columns use `jsonb` type
- **Problem**: Only 1 of approximately 50 jsonb columns uses Drizzle's `$type<>()` for TypeScript type safety (`system_config.systemFlags`). All other jsonb columns accept arbitrary JSON at the ORM level. Validation, if any, happens only at the application layer. This means malformed JSON can be written to the database without ORM-level rejection.
- **Impact**: Data integrity risk for jsonb columns. TypeScript provides no compile-time safety for jsonb reads/writes. JSON schema changes are not versioned.
- **Recommended**: Add `$type<>()` annotations to critical jsonb columns (at minimum: `strategy_settings.params`, `screener_filters.filterOverrides`, `system_context.metadata`).
- **Timing**: Post-audit (incremental improvement)
- **Phase Found**: Phase 11

### RISK-078: ~200+ Indexes Without Usage Audit
- **Severity**: MEDIUM
- **Location**: `shared/schema.ts` — index definitions across ~160 tables
- **Problem**: Over 200 indexes are defined but no `pg_stat_user_indexes` audit has been performed. Unused indexes consume storage, slow writes (every INSERT/UPDATE/DELETE must maintain the index), and increase vacuum overhead. Legacy table indexes (~71 tables worth) are maintained on every write operation even though the tables may be inactive.
- **Impact**: Write performance degradation, wasted storage, increased vacuum time. Particularly impactful on high-volume append-only tables (telemetry_history, execution_attempt_audit, paper_sim_trade_logs).
- **Recommended**: Run `pg_stat_user_indexes` to identify zero-scan indexes. Drop unused indexes. Review for duplicate/overlapping indexes.
- **Timing**: Post-audit (Phase E of database cleanup)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-079: No Table Partitioning for Append-Only Tables
- **Severity**: MEDIUM
- **Location**: `shared/schema.ts` — `telemetry_history`, `paper_sim_trade_logs`, `execution_attempt_audit`, `safety_telemetry`, `error_logs`, `ai_audit_log`, `ai_transparency_log`
- **Problem**: High-volume append-only tables are not partitioned. All data is stored in a single heap per table. Queries on recent data must scan entire tables. Retention (deleting old rows) requires expensive DELETE operations rather than simple partition drops.
- **Impact**: Growing query latency as tables accumulate data. Difficult data retention. Vacuum overhead increases linearly with table size.
- **Recommended**: Implement time-based partitioning (monthly) for high-volume append-only tables. This enables efficient queries on recent data, simple retention via partition drops, and faster vacuum.
- **Timing**: Post-audit (Phase E of database cleanup)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-080: Migration Drift — Schema Not Reconstructable from History
- **Severity**: MEDIUM
- **Location**: `migrations/`, `drizzle/migrations/`, `drizzle.config.ts`
- **Problem**: The database schema cannot be reconstructed from migration history alone. The initial migration captures schema at one point, but subsequent changes were applied via `drizzle-kit push` without generating migration files. 7 of 9 migration files are untracked. This means a fresh database cannot be reliably set up by replaying migrations, and there is no way to verify what schema version is running.
- **Impact**: Disaster recovery requires pg_dump, not migration replay. Cannot verify schema state. Cannot set up new environments reproducibly.
- **Recommended**: Perform migration rebaseline — generate a fresh baseline migration from current schema.ts. Archive old migration files. Switch to `drizzle-kit generate` + `drizzle-kit migrate` workflow.
- **Timing**: Post-audit (Phase D of database cleanup, recommended before production deployment)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

### RISK-081: LATTI Residual Fields in system_context Table — PARTIALLY RESOLVED
- **Severity**: LOW
- **Status**: **PARTIALLY RESOLVED** — Directive 12.2.1, Batch 8 (2026-02-27), commit `8086264c`
- **Location**: `shared/schema.ts` — `system_context` table, `server/storage.ts`
- **Problem**: The `system_context` table contains fields that are remnants of the deprecated LATTI (Latent Attention Through Transparent Intent) system. While the table itself is active (stores engine state and trading mode), LATTI-specific fields for coherence tracking, attention management, and intent tracking are dead weight. These fields have default values that are maintained but serve no active purpose.
- **Impact**: Schema noise, confusing field semantics for developers, potential for stale LATTI defaults to leak into active code paths.
- **Recommended**: Audit system_context columns, identify LATTI-specific fields, remove them in a targeted migration.
- **Timing**: During Wave 6 or dedicated cleanup pass
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)
- **Resolution**: Batch 8 removed 3 LATTI-specific ORM field definitions from `systemContext` in `schema.ts` and deleted the `lattiBaselineHistory` table ORM definition (+ insert schema + types). Physical database columns and table remain in Neon (no migration was run — only ORM definitions removed). Remaining LATTI-branded DB columns (`tunedByLatti`, `managedByLottie`, etc.) are still referenced by active code (`adaptive-guardrails.ts`) and cannot be removed without a migration + code update.

### RISK-082: No Data Retention Policy — Unbounded Row Growth
- **Severity**: MEDIUM
- **Location**: All log/telemetry/audit tables
- **Problem**: No data retention policy exists for any table. Every row ever written is preserved indefinitely. Given the 10 GB Neon limit, this is unsustainable — particularly for high-volume tables that grow with every trading cycle (telemetry_history, paper_sim_trade_logs, execution_attempt_audit, safety_telemetry, error_logs, RTB signals).
- **Impact**: Eventual database full condition, performance degradation as tables grow, inability to reclaim space from legacy data.
- **Recommended**: Define retention tiers: Hot (0–30 days, full fidelity), Warm (30–90 days, aggregate summaries), Cold (90+ days, archive or delete). Implement automated pruning via scheduled jobs.
- **Timing**: Post-audit (Phase E of database cleanup, should precede sustained trading)
- **Phase Found**: Phase 11 Addendum (ChatGPT feedback)

---

## PHASE 11 ADDENDUM — CORTEX AND TAB CATALOG FINDINGS

### RISK-083: Cortex System — Active but Undocumented Walter Dependency — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `server/services/cortex/cortex-core.ts` (393 lines), `cortex-config.yaml`, `cortex-memory.json`, `cortex-registry.json`, `analytics-scheduler.ts` (250 lines)
- **Problem**: The Cortex system is an ACTIVE in-memory caching/orchestration layer sitting between Bob modules and Walter. It maintains a TTL-based memory cache, performs snapshot syncs, and runs a 15-minute analytics cycle. It is initialized at startup via lazy-loader.ts, exposes 4 API endpoints (`/api/cortex/status`, `/api/cortex/snapshot`, `/api/cortex/flush`, `/api/cortex/force-sync`), and is consumed by 9+ service files (config-change-handler.ts, context-refresh-coordinator.ts, contextual-nlai-interpreter.ts, corpus-domain-service.ts, phase-8.6.5-enhancements.ts, purpose-layer.ts, bob-config.ts, autonomy-controller.ts, system-truth-diagnostic.ts). Despite being architecturally coupled to both Bob and Walter, Cortex was not mentioned in any prior audit phase. It must be included in Wave 3 (Walter/Bob removal) scope.
- **Impact**: If Walter/Bob are removed without removing Cortex, the Cortex system will continue running, consuming memory, executing 15-minute analytics cycles, and maintaining stale cache data with no consumers. The 9+ importing services would also need to be audited for Cortex dependencies.
- **Recommended**: Add Cortex to Wave 3 removal scope. 6 files to remove, 4 API endpoints to remove, 9+ consuming services to audit and decouple.
- **Timing**: During Wave 3 (Walter/Bob removal)
- **Phase Found**: Post-audit investigation (Cortex audit 2026-02-17)
- **Resolution**: Directive 12.2.3 Sub-Batch C (Batches 7A + 7B + 7B-hotfix, commit `39dc23b1`). All 5 Cortex files deleted (cortex-core.ts, analytics-scheduler.ts, cortex-config.yaml, cortex-memory.json, cortex-registry.json). All 4 API endpoints removed from routes.ts. All 9+ consuming services surgically decoupled. Cortex is fully removed.

### BUG-022: Duplicate Tab Value "learning" in enhanced-system-monitoring.tsx
- **Severity**: LOW
- **Location**: `client/src/pages/enhanced-system-monitoring.tsx` (~line 1300+ and ~line 2800+)
- **Problem**: Two separate `<TabsTrigger>` components share the same `value="learning"` attribute. In a Radix UI Tabs component, duplicate values cause the second tab to be unreachable — clicking it activates the first tab's content panel instead. The second "learning" tab (likely "Adaptive Learning" or similar) is effectively dead UI.
- **Impact**: One of the 27 tabs in enhanced-system-monitoring.tsx is unreachable. Minor UI bug but indicates the page has grown beyond maintainable complexity.
- **Verified**: Yes — discovered via automated tab catalog audit
- **Timing**: Post-audit (anytime)
- **Fix**: Rename the second tab's value attribute to a unique identifier (e.g., `"adaptive-learning"` or `"learning-metrics"`)
- **Phase Found**: Post-audit investigation (Tab catalog 2026-02-17)

### BUG-023: Regime Archive Data Wiped on Every Server Restart — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/index.ts` (startup sequence), `client/src/pages/machine-learning.tsx` (debug UI)
- **Status**: **RESOLVED** — Batch 18C, commit `c42283f1` (2026-03-10)
- **Resolution**: Three compounding issues fixed in 11 surgical edits across 2 files:
  1. **Primary**: Removed `clearArchiveForFreshStart()` call from server startup (index.ts). This function deleted all archive JSON files and reset the manifest on every Replit restart, destroying weekly archive data created by the cron job.
  2. **Secondary**: Removed debug UI scaffolding from machine-learning.tsx — yellow test button, `[DIAG]` console.log statements, WeakMap handler identity tracking, DOM visibility checks, mount/unmount trackers, render counters.
  3. **Minor**: Removed duplicate regime-archive route mount from index.ts (was mounted in both index.ts and routes.ts). Removed unused `regimeArchiveRouter` import.
- **Original Problem**: The Regime Archive tab on the Machine Learning page showed 0 records. A debug test button was visible in production UI. Root cause: `clearArchiveForFreshStart()` in the startup sequence wiped all archive data every time the server restarted (which happens frequently on Replit).
- **Phase Found**: Post-Batch 18 investigation (2026-03-10)

### BUG-024: VTS Pipeline Starved — Batch Size Hardcode + Relaxed Filter Dead Path — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/services/market-scanner.ts` (batch size), `server/config/system-guards.ts` (VTS thresholds)
- **Status**: **RESOLVED** — Batch 18E, commit `5d774fb2` (2026-03-10)
- **Resolution**: Two compounding bugs fixed in 4 surgical edits across 3 files:
  1. **Primary**: `targetBatchSize = 100` hardcoded in market-scanner.ts line 512. This Directive 11.4C-R2 refill mechanism was written when BATCH_SIZE was 100 and was missed during Batch 18's increase to 300. Changed to `SCANNER_PARAMS.BATCH_SIZE`.
  2. **Secondary**: `VTS_IMF_THRESHOLDS.VN_MAX = 0.80` matched `IMF_THRESHOLDS.VN_MAX = 0.80` (passive learning strict threshold), creating zero gap between strict and relaxed filtering. Market VN values are 0.82-1.00 on 60-min candles. VN_MAX raised to 0.95 to create a meaningful 0.80-0.95 relaxed gap. Stale "100-pair" comments fixed in adaptive-scan-manager.ts.
- **Original Problem**: VTS producing zero new simulated trades per session. FX5 scanner sometimes scanning only 100 pairs (should be 300). Log showed "0 relaxed-filter" pairs consistently. VTS received 1-45 non-benchmark pairs per cycle, all producing null from strategy detect functions.
- **Additional Findings (NOT bugs)**: 252 "conditions not met" nulls (expected — 8 pattern strategies require Phase 14.5 dual-path). sigma and VN data quality issues traced to priceHistory empty arrays — root cause fixed in Batch 18F (BUG-025).
- **Phase Found**: Post-Batch 18 investigation (2026-03-10)

### BUG-025: FX5 Scanner VN/σ/DI Computed on Empty Arrays — **RESOLVED**
- **Severity**: HIGH
- **Location**: `server/services/fx5-scanner.ts` (lines 502, 528-568)
- **Status**: **RESOLVED** — Batch 18F, commit `9de4afc7` (2026-03-10)
- **Resolution**: Three surgical edits in fx5-scanner.ts:
  1. **Import**: Added `import { ohlcCache } from './ohlc-cache.js'` — gives FX5 access to the OHLC cache singleton (Batch 18, 5-min TTL, ~720 60-min candles per symbol).
  2. **Pre-fetch loop**: Replaced `imfModule` dynamic import (passive-learning-only, VTS-cache-dependent, limited coverage) with universal OHLC pre-fetch loop that runs sequentially for all post-global-filter survivors (~60-70 per cycle). Results stored in `Map<string, number[]>` for synchronous access inside `.map()` chain.
  3. **IMF calculation block**: Replaced 3-branch conditional (passive+OHLC, passive+ticker, active+ticker) with single OHLC-first path. VN, DI, and Sigma now computed from real ~720 close prices. LQ unchanged (uses ticker-derived volume/trades/spread). Falls back to ticker data if OHLC unavailable.
- **Original Problem**: `priceHistory` and `history` fields declared in market-scanner.ts BatchResult interface but NEVER populated. `const prices = s.priceHistory || s.history || []` always resolved to `[]`. `calculateVolNoise([])` returned 0.5 (pairs passed VN≤0.60 strict filter for wrong reason — no data, not low noise). `calculateSigma([])` returned 0. `calculateDirectionalIntegrity([])` returned 0.5. The entire IMF classification operated on fabricated metrics.
- **Phase Found**: Post-Batch 18E investigation (2026-03-10)

### BUG-026: LQ (Log Liquidity) Saturates at 100 for All Crypto Pairs — **RESOLVED**
- **Severity**: MEDIUM
- **Location**: `server/services/fx5-scanner.ts` (LQ calculation)
- **Status**: **RESOLVED** — Batch 18G, commit `f82b7b66` (2026-03-10)
- **Resolution**: Two surgical edits in fx5-scanner.ts:
  1. **ohlcDataMap expanded**: `Map<string, number[]>` changed to `Map<string, { prices: number[], avgVolumeUSD: number }>`. Pre-fetch loop now computes per-candle average USD volume using `typicalPrice × volume` (same formula as imf-metrics.ts).
  2. **LQ formula replaced**: When OHLC data available, uses `log10(avgVolumeUSD + 1) * 10` instead of `calculateLogLiquidity(volumeUSD, tradeCount, spread)`. Standard formula retained as fallback when OHLC unavailable.
- **Original Problem**: The standard `calculateLogLiquidity(V, C, S)` in analysis-utils.ts uses `10 * (ln(V*C) - ln(S/C) - 10)` capped at `Math.min(100, raw)`. For crypto, 24h aggregate volume is so large that the formula always hits 100. All pairs showed LQ=100.0 — BTC/USD, memecoins, micro-caps, everything identical. The LQ≥40 filter (strict) and LQ≥25 filter (VTS) never excluded anything.
- **Fix Approach**: Per-candle volume on 60-min candles is ~1/24th of 24h volume, and `log10` instead of `ln` produces values in the 30-60 range — exactly where LQ thresholds can discriminate. Unified across both VTS and active trading paths.
- **Phase Found**: Post-Batch 18F monitoring (2026-03-10)

### BUG-027: VTS In-Memory Map Accumulates Stale Positions Indefinitely — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 18I, commit `3d907032`, 2026-03-11)
- **Location**: `server/services/vts-runner.ts`, `resolveOpenVirtualTrades()` method
- **Problem**: The `openVirtualTrades` Map holds open VTS trades in memory. When price data is unavailable for a symbol (cache miss, API rate limit, delisted pair), the code executed `continue` BEFORE reaching the 24-hour timeout check. Trades with unavailable prices were never closed, accumulating indefinitely. DUP_GUARD checks found stale entries and blocked new trades on those symbol+strategy combos.
- **Impact**: 47 stale positions observed, ~1,041 DUP_GUARD blocks/day (47 combos x ~22 cycles). VTS throughput degraded over time as more symbol+strategy combos became blocked.
- **Resolution**: Moved timeout check (`holdDurationMs > MAX_HOLD_MS`) BEFORE the price availability check. Trades older than 24 hours are force-closed using live price if available, or entry price as fallback (0% gross P&L minus friction).
- **Phase Found**: Post-Batch 18H monitoring (2026-03-11)

### PERF-001: Pattern-Path Volume Confirmation Too Strict — Hard Gate Blocking Reversal Signals — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 57, commit `ce5378f6`, 2026-04-11)
- **Location**: `server/services/strategies/support-bounce.ts`, `server/services/strategies/reverse-impulse.ts`
- **Problem**: All 8 pattern strategies had hard volume gates requiring 1.2-1.3x mean volume per candle. Quant strategies (mean_reversion, range_trading) had no such gate. Pattern pool admits lower-liquidity pairs via relaxed FX5 filters, which then hit the per-candle volume gate. In crypto's spiky volume environment, legitimate reversal setups were blocked by the strict threshold. "Volume Confirmation Failed" was the #1 pattern-path null reason (1,460 pattern vs 304 quant).
- **Impact**: Valid reversal signals on support_bounce and reverse_impulse blocked despite otherwise qualifying setups. Pattern-path signal generation suppressed disproportionately vs quant path.
- **Resolution**: Converted hard volume gate to graduated confidence factor for support_bounce and reverse_impulse. Scale: >=2.0x mean volume: bonus, >=1.2x: small bonus, >=0.8x: neutral, <0.8x: penalty. Breakout strategies (volume_expansion, breakout_fade, etc.) retain hard gates where volume confirmation is structurally essential.

### PERF-002: support_bounce Cluster Tolerance Too Strict for Crypto Support Zones — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 57, commit `544955f0`, 2026-04-11)
- **Location**: `server/services/strategies/support-bounce.ts`
- **Problem**: SB_CLUSTER_TOLERANCE_BASE was set to 0.5%, which is too tight for crypto's wider support zones. Legitimate support bounces were rejected because nearby lows didn't cluster within the narrow tolerance, producing "No Valid Range" null reasons. Crypto pairs exhibit wider price dispersion around support levels than forex, requiring a more permissive clustering threshold.
- **Impact**: Valid support_bounce signals rejected at the cluster-detection stage. Contributed to the 10K "No Valid Range" null reasons observed in quant-pool diagnostics.
- **Resolution**: Widened SB_CLUSTER_TOLERANCE_BASE from 0.5% to 0.7%. Also added separate abcd_structure_not_found null reason for abcd_long to distinguish structural failures from generic "No Pattern Detected".
- **Phase Found**: Batch 57 pool-split null reason analysis (2026-04-11)

### BUG-029: Pattern-Strategy Mismatch — Global Best Pattern Sent to All Strategies — **RESOLVED**
- **Severity**: ~~HIGH~~ **RESOLVED** (Batch 57, commits `fb15bd34`, `b2822a3f`, 2026-04-10 to 2026-04-11)
- **Location**: `server/services/vts-runner.ts`, `server/services/signal-orchestrator.ts`, `server/services/strategies/adaptive-flow.ts`
- **Problem**: Both VTS and active trading path sent the single globally-strongest detected pattern to ALL strategies during signal generation. Each strategy received the same `patternInput` regardless of whether the pattern matched that strategy. Result: strategies that required a specific pattern (e.g., adaptive-flow needs THREE_SOLDIERS/MORNING_STAR) received mismatched patterns and returned "No Pattern Detected" nulls. Active trading path was worse — no strategy filtering at all. Additionally, adaptive-flow.ts had a pre-existing canonicalization bug: THREE_SOLDIERS canonicalizes to MORNING_STAR but the strategy only accepted THREE_SOLDIERS.
- **Impact**: ~125K "No Pattern Detected" nulls per 24h. "No Pattern Detected" was the #1 null reason at 38% of all pattern-path nulls. After fix, dropped to negligible. Post-fix, "Volume Confirmation Failed" became #1 pattern-path null reason (302 pattern vs 42 quant).
- **Resolution**: Batch 57 introduced `buildPatternInputForStrategy()` in signal-orchestrator.ts — each strategy now receives only its matching pattern. VTS runner updated with same per-strategy pattern routing. adaptive-flow.ts updated to accept both THREE_SOLDIERS and MORNING_STAR.
- **Phase Found**: Batch 57 investigation (2026-04-10)

### BUG-028: Fee Constants Fragmented — 4 Files Using Hardcoded Pre-Unification Values — **RESOLVED**
- **Severity**: ~~MEDIUM~~ **RESOLVED** (Batch 18J, commit `5eae1601`, 2026-03-11)
- **Location**: `paper-execution-engine.ts`, `routes.ts` (2 locations), `adaptive-thresholds.ts`, `cost-metrics.ts`
- **Problem**: The canonical fee source (`exchange-defaults.ts`, Directive 11.3B) correctly defines `DEFAULT_TAKER_FEE = 0.0026` (0.26%) and `DEFAULT_SLIPPAGE = 0.0005` (0.05%). However, 4 files still had OLD hardcoded values: paper-execution-engine (FEE=0.10%, SLIP=0.15%), routes.ts 2 locations (FEE=0.10%, SLIP=0.15%), adaptive-thresholds (FEE=0.10%, SLIP=0.15%), cost-metrics (FEE=0.25%). Paper trading was undercharging fees by ~0.16% per side (0.32% round trip), making paper results systematically more profitable than real trading.
- **Impact**: Paper trade P&L calculations showed inflated profits. The friction floor in `isSignalProfitable()` was 0.00365 instead of the correct 0.00575, allowing marginal signals through.
- **Resolution**: All 4 files migrated to import from `exchange-defaults.ts` using `DEFAULT_TAKER_FEE * 100` for percentage-based consumers and `DEFAULT_TAKER_FEE` for decimal-based consumers. cost-metrics.ts DEFAULT_FEE also corrected from 0.0025 to 0.0026.
- **Phase Found**: Batch 18J fee constant audit (2026-03-11)

---

## REPLIT LSP AUDIT CROSS-REFERENCE FINDINGS

### RISK-084: Deprecated RiskManager Class — 12 Import Locations, Not Removed
- **Severity**: MEDIUM
- **Location**: `server/services/risk-manager.ts`, imported in 7 files across 12 locations
- **Problem**: RiskManager was deprecated in Phase 8.8.3-H4, replaced by `checkGuardrailRisk()` from `trade-safety.ts`. However, it was never removed. It is still imported and instantiated in: `routes.ts` (4 locations), `test-guardrails.ts` (2), `paper-sim-diagnostic.ts` (3), `heuristic-trader.ts` (2 — dynamic import), `behavioral-template.ts` (2), `trading-state-sync.ts` (2 — dynamic import), `daily-brief.ts` (3).
- **Impact**: Deprecated risk management logic may still be exercised. Consumers may be calling outdated risk calculations that don't align with Guardrails V2 percentage-based model. Creates confusion about which risk management path is authoritative.
- **Recommended**: Systematic replacement across all 12 import locations. Replace with `checkGuardrailRisk()` from trade-safety.ts, then delete risk-manager.ts.
- **Timing**: Pre-MCE or during Wave 3 cleanup
- **Phase Found**: Replit LSP audit (Dec 2025), cross-referenced Feb 2026

### RISK-085: ~620 TypeScript LSP Errors Across Codebase
- **Severity**: LOW (informational)
- **Location**: Codebase-wide, concentrated in `routes.ts` (~211 errors), `storage.ts` (~66 errors), Walter services
- **Problem**: Replit LSP analysis (updated Jan 2, 2026) found ~620 TypeScript errors. Primary categories: type mismatches in routes.ts (211), schema mismatches in storage.ts (66), null/undefined parameter issues, Walter service type issues. The 211 errors in routes.ts and 66 in storage.ts are structural — tied to the monolithic file architecture already flagged in RISK-048 and RISK-076.
- **Impact**: TypeScript errors indicate potential runtime type safety issues. While many may be benign (type widening, strict null checks), some could indicate real bugs. The high error count also makes it harder to identify new genuine errors during development.
- **Recommended**: Address during routes.ts decomposition (RISK-048) and storage.ts modularization (RISK-076). A targeted pass on null/undefined parameter issues could be done independently.
- **Timing**: Post-audit (incremental, tied to monolith decomposition)
- **Phase Found**: Replit LSP audit (Dec 2025), cross-referenced Feb 2026

---

## Batch 58 — Phase 11 Finalization (2026-04-11)

### INFRA-001: Adjustment Registry + Authority Baseline — **IMPLEMENTED**
- **Severity**: MEDIUM (governance infrastructure)
- **Location**: `server/config/adjustment-registry.ts` (new), `server/config/authority-baseline.ts` (new), `server/core/boot_orchestrator.ts` (modified), `server/routes.ts` (modified)
- **What**: Phase 11 Finalization (Directives 11.8B-E + 11.8C). Created the Adjustment Framework governance document defining three tiers (evidence-adjustable / supervised / constitutional), parameter hierarchy, evidence-gating with three-mode hierarchy (Live > Paper > VTS), and safety guarantees. Created Authority Baseline V1.0 snapshot of all adjustable parameters (24 screener_filters rows, 150+ strategy constants, shared config). Implemented code-level parameter registry with bounds validation (log-only mode) and audit logging.
- **Files created**: `adjustment-registry.ts` (parameter bounds, validation, audit logging), `authority-baseline.ts` (baseline loader, drift detection), `ADJUSTMENT_FRAMEWORK.md`, `AUTHORITY_BASELINE.md`, `authority-baseline-v1.json`
- **Files modified**: `boot_orchestrator.ts` (startup validation + baseline load), `routes.ts` (log-only validation on `/api/filters-v2` PUT)
- **Impact**: No trading logic changes. No threshold changes. Validation is log-only (warns but never blocks). Startup validation is non-blocking. Baseline loader degrades gracefully if file missing.
- **Phase Found**: Phase 11.8B-E/11.8C (Batch 58)

---

## REGISTRY METADATA

| Metric | Count |
|--------|-------|
| Total Bugs | 28 |
| Critical Bugs | 7 (BUG-001 through BUG-004, ~~BUG-006~~ RESOLVED, BUG-008 partial, ~~BUG-009~~ RESOLVED) |
| Informational Bugs | 2 (BUG-010, BUG-011 — deferred, live mode not in scope) |
| High Bugs | 2 (BUG-007, BUG-012) |
| Medium Bugs | 6 (BUG-013, BUG-015, BUG-017, BUG-020, ~~BUG-027~~ RESOLVED, ~~BUG-028~~ RESOLVED) |
| Low Bugs | 7 (BUG-005, BUG-014, BUG-016, BUG-018, BUG-019, BUG-021, BUG-022) |
| Architectural Risks | 85 (RISK-001 through RISK-085) |
| Critical Architectural Risks | 2 (RISK-043 — artificial strategy differentiation; ~~RISK-049~~ RESOLVED) |
| Informational Risks | 3 (RISK-047 — monolithic index.ts; RISK-048 — monolithic routes.ts; RISK-058 — endpoint census) |
| Phase 9 Addendum Risks | 3 (RISK-063 — XSS token exposure; RISK-064 — monolithic pages; RISK-065 — no polling policy) |
| Phase 9 Addendum Directives | 2 (ADD-4 — remove speculative endpoints; ADD-5 — remove simulated price) |
| Phase 10 Risks | 7 (RISK-066 — zero frontend tests; RISK-067 — no CI/CD; RISK-068 — no test scripts; RISK-069 — schema version conflicts; RISK-070 — legacy test staleness; RISK-071 — standalone scripts; RISK-072 — no mocking) |
| Phase 11 Risks | 5 (RISK-073 — 71 legacy tables; RISK-074 — dual migration dirs; RISK-075 — no DB pruning; RISK-076 — storage.ts monolith; RISK-077 — untyped jsonb) |
| Phase 11 Addendum Risks | 6 (RISK-078 — index usage audit; RISK-079 — no table partitioning; RISK-080 — migration drift; RISK-081 — LATTI residuals; RISK-082 — no retention policy; RISK-083 — Cortex undocumented dependency) |
| Post-Audit Bugs | 1 (BUG-022 — duplicate tab value in enhanced-system-monitoring.tsx) |
| Unification Recommendations | 3 |
| Kyle-Accepted/Deferred | 6 (RISK-029 accepted, RISK-031 deferred, RISK-027 superseded, BUG-010/011 deferred, RISK-032 accepted, RISK-036 deferred) |
| Formally Deprecated | 2 (RISK-028 — Goal Alignment, BUG-012 — Goal Alignment Location 2). ~~RISK-037~~ RESOLVED. |
| Confirmed Legacy | 1 (RISK-040 — 5 Walter-era learning services, confirmed Kyle Phase 6 Addendum) |
| Live Mode Deferred | 3 (BUG-010, BUG-011, RISK-036 — informational until live refactor) |
| Items Pre-MCE Timing | 20 (BUG-004, BUG-006, BUG-007, BUG-008, BUG-009, BUG-012, BUG-014, BUG-017, BUG-020, RISK-013, RISK-014/015, RISK-016/017/018, RISK-023, RISK-028, RISK-037, RISK-045, RISK-049, RISK-050, RISK-051, RISK-057) |
| Items During-MCE/Wave 6 | 18 (includes RISK-019, RISK-020, RISK-038, RISK-043) |
| Items L-Series Cluster Removal | 2 (RISK-027 — entire GASP removed with cluster; RISK-052 partially — L-Series route files) |
| Replit LSP Cross-Reference Risks | 2 (RISK-084 — deprecated RiskManager 12 imports; RISK-085 — ~620 TS LSP errors) |
| Items Post-MCE/Anytime | 57 (includes RISK-021 through RISK-026, RISK-029, RISK-030, RISK-033, RISK-034, RISK-035, RISK-039, RISK-041, RISK-042, RISK-044, RISK-046, RISK-047, RISK-048, RISK-052 active files, RISK-053, RISK-054, RISK-055, RISK-056, RISK-058, RISK-059, RISK-060, RISK-061, RISK-062, RISK-063, RISK-064, RISK-065, RISK-066, RISK-067, RISK-068, RISK-069, RISK-071, RISK-072, RISK-073, RISK-074, RISK-075, RISK-076, RISK-077, RISK-078, RISK-079, RISK-080, RISK-081, RISK-082, RISK-084, RISK-085, BUG-016, BUG-018, BUG-019, BUG-021, BUG-022) |
| Items During Wave 3 Removal | 2 (RISK-070 — legacy test files; RISK-083 — Cortex system) |
| Items Post-Audit Architecture | 1 (RISK-031 — DSE cap authority) |
| Post-Audit Infrastructure Investigation | 9 systems flagged (Kyle Phase 7 Addendum — scheduler tasks, MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI residuals, CLE/CWA, Ethical Principles, Phase 17.0 Cluster) |

**Phase 4 Addendum applied**: RISK-027 superseded (GASP itself is legacy), RISK-028 elevated to formal deprecation, RISK-029 accepted by Kyle, RISK-031 deferred to post-audit.

**Phase 5 additions**: BUG-010/011 (TradingEngine placeholder code), BUG-012 (Goal Alignment second location), RISK-032 through RISK-036.

**Phase 5 Addendum applied**: NLAI formally deprecated (RISK-037). BUG-010/011/RISK-036 reclassified as informational (live mode deferred per Kyle). RISK-032 accepted (MicroExecution experimental/dormant). "Must Fix Before Live Trading" category replaced with "Live Mode Deferred" category.

**Phase 6 additions**: BUG-013 (ML Service Client stale interface), BUG-014 (retraining freeze stale deployment), RISK-038 through RISK-042.

**Phase 6 Addendum applied**: RISK-043 added (CRITICAL — artificial strategy differentiation, Kyle: "core architectural problem in Phase 6"). RISK-040 upgraded from POTENTIAL LEGACY to CONFIRMED LEGACY (5 Walter-era learning services). RISK-039 confirmed observability-only. BUG-014 confirmed for removal/manual trigger.

**Phase 7 additions**: BUG-015 (dual shutdown handlers race condition), RISK-044 through RISK-047. Three potential legacy systems flagged for Kyle confirmation: Phase 17.0 Cluster System (TaskRouter + TaskWorker), CLE/CWA scheduler tasks, Ethical Principles Seeder.

**Phase 7 Addendum applied**: Kyle's position: "Phase 7 infrastructure is stable. No hidden kill switches, no silent trade shutdown mechanisms. However, architectural accumulation requires post-audit cleanup." All 3 potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED." 6 additional systems added to post-audit investigation list: MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags, background scheduler tasks. New registry category added: "Post-Audit Infrastructure Investigation" (9 systems). BUG-015 timing updated from "Pre-MCE" to "Post-audit investigation." RISK-047 acknowledged as architectural accumulation.

**Phase 8 additions**: BUG-016 (REST violation — GET mutates state in audit.ts), BUG-017 (rl.ts internal service key bypass), RISK-048 through RISK-054. Major security findings: RISK-049 (CRITICAL — hardcoded JWT fallback in 9 files), RISK-050 (inconsistent JWT secret in regime-archive.ts), RISK-051 (x-internal-audit header bypass in 4 files), RISK-052 (13 unauthenticated route files), RISK-053 (duplicated auth middleware in 8+ files). Architecture: RISK-048 (routes.ts at 23,349 lines — largest file in codebase), RISK-054 (vts.ts at 1,425 lines / 37 endpoints).

**Phase 8 Addendum applied**: Kyle's position: "Infrastructure is functional. Security hygiene is inconsistent. Legacy L-Series routes remain exposed. Auth layer requires consolidation. routes.ts is an architectural accumulation risk." Five directives issued:
- **ADD-1 (RISK-055)**: RBAC enforcement inconsistency — modular route files verify JWT only but do not enforce role checks. Standardize permission enforcement across all routes.
- **ADD-2 (RISK-049/050)**: Remove JWT fallback secrets entirely. Fail hard if `JWT_SECRET` is not defined.
- **ADD-3 (RISK-051, BUG-017)**: Remove `x-internal-audit` header bypass. Replace with proper internal service key validation, signed internal JWT, or remove entirely.
- **ADD-4 (RISK-056)**: Create API versioning plan. Introduce `/api/v1/` namespace before next major refactor.
- **ADD-5**: Post-audit endpoint census — during Phase 9, cross-reference frontend usage against all endpoints, mark unused for removal.
Kyle decisions added to RISK-049, RISK-050, RISK-051, RISK-052, RISK-053, BUG-017. RISK-055 (RBAC gap) and RISK-056 (API versioning) added. Total: 17 bugs, 56 risks.

**Phase 9 additions**: BUG-018 (dead History import in App.tsx), BUG-019 (dead Watchlist import in active-trades.tsx), BUG-020 (simulated current price in active trades), BUG-021 (system-config bypasses apiFetch), RISK-057 through RISK-062. ADD-5 Endpoint Census completed: ~291 frontend endpoints vs ~750 server endpoints — ~460 endpoints with no frontend consumer. Major findings: 123 console.log statements (RISK-057), enhanced-system-monitoring.tsx references ~60 speculative endpoints (RISK-059), Walter frontend integration requires coordinated cleanup wave (RISK-060). Total: 21 bugs, 62 risks.

**Phase 9 Addendum applied**: Kyle's position: "Phase 9 is mostly accurate. No fabricated claims. No phantom issues. No hidden code misrepresentation. Frontend is stable but: bloated, Walter-heavy, security-light on token handling, and in need of cleanup after audit." Five directives issued:
- **ADD-1 (RISK-063)**: JWT tokens in localStorage create XSS exposure risk. Document and recommend migration to httpOnly cookie or hybrid approach. MEDIUM severity.
- **ADD-2 (RISK-064)**: Four monolithic pages (ai-transparency 2,074, machine-learning 1,985, analytics 1,939, top-bar 1,042 lines) flagged for component decomposition. MEDIUM severity.
- **ADD-3 (RISK-065)**: No centralized polling policy. Define standard refresh tiers: Critical (5s), Semi-critical (15–30s), Informational (60s+). LOW severity.
- **ADD-4**: Remove speculative endpoints from enhanced-system-monitoring.tsx (~60 aspirational API endpoints). Directive linked to RISK-059.
- **ADD-5**: Remove simulated price display (`entryPrice * 1.02`). Replace with real price feed. Directive linked to BUG-020. Kyle confirmed Pre-MCE timing.
Total: 21 bugs, 65 risks.

**Phase 10 additions**: RISK-066 through RISK-072. Major findings: zero frontend test coverage (RISK-066, HIGH), no CI/CD pipeline (RISK-067, HIGH), no test scripts in package.json (RISK-068), schema version conflicts across tests (RISK-069), test files for deprecated Walter/Bob systems (RISK-070), standalone scripts not discoverable by framework (RISK-071), no mocking infrastructure (RISK-072). Test suite inventory: 60 test files (~13,735 lines), 31 unit tests, 13 integration tests, 3 E2E tests (Playwright), 4 standalone scripts. Runtime validation: 5 runtime validation services + 15+ diagnostic services. Total: 21 bugs, 72 risks.

**Phase 10 Addendum applied**: Kyle's verdict: "Accurate. Grounded. Technically strong. Well-cataloged. Not inflated. Backend math QA is elite-tier. Frontend and API QA are light. Runtime validation systems are extensive but fragmented." Corrections: slightly overstated backend execution risk, understated frontend blind spot and legacy test contamination, did not address unified QA architecture. Five directives issued:
- **ADD-1**: Legacy test suite audit required — tag all tests referencing Walter/Bob/DCE/NGC/CWQI/NLAI. Per-test decision: remove/archive/refactor/keep behind legacy flag. Strengthens RISK-070 scope. Important distinction: tests that assert legacy metrics are _absent_ are positive architectural guards, not contamination.
- **ADD-2**: Create unified test runner scripts in package.json (`test:unit`, `test:e2e`, `test:all`). Standardize entry point even before CI exists. Addresses RISK-068.
- **ADD-3**: Frontend test introduction plan — minimum targets: auth token refresh, TradingModeContext, use-websocket reconnection, TopBar start/stop flow. Install @testing-library/react + jest-dom. Addresses RISK-066.
- **ADD-4**: Mark standalone scripts as operational QA tools (not regression tests) in documentation. Addresses RISK-071.
- **ADD-5**: Property-based testing for core math (optional, high ROI) — FinalScore invariants, VolNoise monotonicity, covariance positive semi-definiteness, regime classification determinism. Recommended framework: fast-check.
Total: 21 bugs, 72 risks (no new risks — all directives are improvement actions addressing existing risks).

**Phase 11 additions**: RISK-073 through RISK-077. Schema inventory: ~160 tables (4,836 lines), ~80 enums, ~71 legacy tables (~44% of schema). Major findings: legacy table bloat from aspirational L-Series/ethics/cluster systems (RISK-073, MEDIUM), dual migration directories with untracked files (RISK-074, MEDIUM), no database pruning strategy against 10 GB Neon limit (RISK-075, MEDIUM), storage.ts monolith at 4,580 lines (RISK-076, LOW), ~50 untyped jsonb columns (RISK-077, LOW). Migration infrastructure: 9 files across 2 directories, only 2 tracked in journal, primary mechanism is `drizzle-kit push` (no review step, no rollback). Total: 21 bugs, 77 risks.

**Phase 11 Addendum applied** (ChatGPT feedback + Cortex/Tab audit, 2026-02-17):
- **ChatGPT corrections**: "71 legacy tables" nuanced — some have active writers, need pre-drop audit. "No transactions" corrected to "limited transactions." Storage layer coupling order constraint added.
- **6 new risks from ChatGPT feedback**: RISK-078 (index usage audit, MEDIUM), RISK-079 (no table partitioning, MEDIUM), RISK-080 (migration drift/rebaseline, MEDIUM), RISK-081 (LATTI residual fields, LOW), RISK-082 (no data retention policy, MEDIUM), RISK-083 (Cortex undocumented dependency, MEDIUM).
- **Cortex system identified**: ACTIVE in-memory caching layer between Bob and Walter. 6 files, 4 API endpoints, 9+ consuming services. Must be included in Wave 3 removal scope (RISK-083).
- **Directive 12.2.3 Sub-Batch A** (Batch 5, commit `cc320466`): 9 Walter service files with zero external importers deleted (~2,792 lines). Test file `phase-6.0-simulations.test.ts` cleaned (7 tests removed). RISK-070 partially resolved. Directive completed in Batches 5-7B (see Directive 12.2.3 Completion Log below).
- **1 new bug from tab catalog**: BUG-022 (duplicate `value="learning"` in enhanced-system-monitoring.tsx, LOW). Second tab with same value is unreachable.
- **5-phase database cleanup strategy** endorsed from ChatGPT: Phase A (Isolation) → B (Modularization) → C (Schema Simplification) → D (Migration Rebaseline) → E (Index & Retention Hygiene).
Total: **22 bugs, 83 architectural risks**.

**Replit LSP audit cross-reference** (2026-02-17):
- **Source**: "Pre-Phase 9 Comprehensive Audit Report" by Replit (Dec 30, 2025, updated Jan 2, 2026).
- **2 new risks**: RISK-084 (deprecated RiskManager class, 12 import locations, MEDIUM), RISK-085 (~620 TypeScript LSP errors, LOW/informational).
- **Confirmed completed**: 4 legacy files deleted (F-001 to F-003, F-008), Guardrails V2 migration (F-004 to F-006), UnifiedFilterGateway created (F-007), CWQI friction standardization (F-010/F-011). All verified consistent with our audit findings.
- **Critical disagreements resolved**: Replit report listed Walter services, ConfigBob/BobCore, Goals Learning Engine, and WalterPurposeTab as "Do Not Touch" — all four are now confirmed LEGACY per Kyle decisions made after the Replit report was written (Feb 2026). The "Phase 13 restoration" plan for Walter referenced in the Replit report is superseded. Kyle's direction is permanent removal, not preservation.
- **RiskManager class**: Not previously captured in our audit. Deprecated since Phase 8.8.3-H4, replaced by `checkGuardrailRisk()` from trade-safety.ts, but still imported in 12 locations across 7 files.
Total: **22 bugs, 85 architectural risks**.

**ChatGPT System Manual review** (2026-02-17):
- **Source**: ChatGPT review of the consolidated SYSTEM_MANUAL.md (9,930+ lines).
- **Accepted recommendations**: Added System Authority Hierarchy (front-page quick reference), Legacy Clusters appendix (6 removal groupings), expanded "About" section with reading guidance for current-state vs intended-state labeling, Paper vs Live development authority clarification, MCP/ARE elevated to "High-Impact Legacy Cluster" classification.
- **Already addressed (no changes needed)**: VTS generic signal CRITICAL callout — already present as multi-paragraph FINDING block plus 5-point Critical Observations in Chapter 6. NGC contamination chain — already documented across multiple chapters with specific code locations. MCP/ARE 14+ consumer impact — already thoroughly documented in Chapter 2 with full consumer list, strategy matrix, exposure multipliers, timer, and Kyle's decision.
- **Declined**: Per-chapter "Reality Snapshot" blocks — Chapter 2 already has this (`⚠️ CRITICAL: Current State vs Intended State` block), and the new "About" reading guidance + Authority Hierarchy address this concern document-wide without repetitive per-chapter blocks.
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Directive Implementation Workflow established** (2026-02-19):
- Created `WORKFLOW.md` — 7-step directive lifecycle with templates (directive, review, completion report)
- Created `SYSTEM_IMPACT_MAP.md` — comprehensive component dependency map covering 30+ services across 11 layers, with upstream/downstream dependencies, blast radius ratings, and "If I Change X, Check Y" quick lookup table
- Created `directives/DIRECTIVE_INDEX.md` — master tracker for all Phase 12+ directives (18 directives pre-loaded for Phase 12)
- Created `sync-repo.bat` — one-click repository sync script (GitHub → local clone worktree)
- POST_AUDIT_ROADMAP.md revised to v2 — formal phase numbering (12-22), incorporated Kyle's Next Steps, Phase 11.8 final steps, Directional Bias, Short Trading, and ML planning documents (~43 week timeline)
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Replit onboarding & governance embedding** (2026-02-19):
- Created `REPLIT_ONBOARDING_PROMPT.md` — conversational prompt for onboarding Replit Agent to the directive workflow, covering role definition, Three Rules, directive protocol, prohibited/required actions, and review cycle expectations
- Updated `replit.md` (project root) — replaced Walter-era general overview with streamlined architecture reference + embedded Development Governance section (Three Rules, role definition, directive protocol, prohibited/required actions, reference document table). This file is read by Replit Agent at the start of every conversation, making the governance rules persistent.
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

**Document Update Package workflow — Step 7 revision** (2026-02-19):
- **Problem**: Step 7 originally said "Kyle: push updated docs to GitHub" but Replit is the only push path to GitHub. Claude Code writes doc updates locally, but those files need to reach GitHub through Replit.
- **Solution**: Introduced Document Update Packages (`DOC_UPDATE_X.Y.Z.md`) — Claude Code writes exact FIND/REPLACE edits for governance documents, Kyle sends the package to Replit, Replit applies verbatim and pushes.
- Updated `WORKFLOW.md` — revised Step 7 diagram, added When to Sync entry for doc update pushes, added full Step 7 explanation section, added Document Update Package template, updated Document Discipline principles
- Updated `replit.md` — added Document Update Packages section, updated prohibited actions with carve-out for packages provided by Kyle
- Updated `REPLIT_ONBOARDING_PROMPT.md` — added Document Update Packages section, updated review cycle description, updated prohibited/required actions, updated confirm understanding checklist
- Updated `SYSTEM_MANUAL_OVERVIEW.md` — revised directive flow diagram, updated "What Replit Must Do" list, revised "What Happens After Implementation" description
- No new bugs or risks. Registry unchanged: **22 bugs, 85 architectural risks**.

---

**AUDIT COMPLETE**: All 11 phases of the systematic repository audit are now finished. Post-audit addenda applied: ChatGPT Phase 11 feedback, Cortex investigation, frontend tab catalog, Replit LSP audit cross-reference, ChatGPT System Manual review, and directive workflow establishment. Final registry: **22 bugs, 85 architectural risks** across the full DawnTrader codebase.

---

*Registry now entering implementation phase. Future entries will track directive-resolved bugs/risks as they are completed.*

---

## DIRECTIVE 12.2.3 COMPLETION LOG (2026-02-26)

**Directive 12.2.3: Wave 3 — Walter/Bob/Cortex Removal — COMPLETE**

Total removal: ~17,100 lines across ~65 files over 7 batches (5, 5B, 6, 6B, 7A, 7B, 7B-hotfix).

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 5 (Sub-Batch A) | 9 Walter files with zero external importers | ~2,792 | `cc320466` |
| Batch 5B | Governance update | — | `8a286e64` |
| Batch 6 (Sub-Batch B) | 10 Walter backend + 1 middleware + 5 frontend + docs. 13 consuming files modified. 28 route handlers removed. | ~8,600 | `1ea3bb38` |
| Batch 6B | Governance update | — | `eaacf34c` |
| Batch 7A (Sub-Batch C) | 28 Bob/Cortex files + 3 directories + 718-file training data tree deleted | ~4,500 | `5fc79598` |
| Batch 7B (Sub-Batch C) | 12 consuming files surgically modified (routes.ts, index.ts, lazy-loader.ts, config-change-handler.ts, diagnostic-controller.ts, cognitive-interpreter.ts, phase-8.6.5-enhancements.ts, self-repair.ts, intent-executor.ts, context-refresh-coordinator.ts, enhanced-system-monitoring.tsx, diagnostic-system.test.ts) | ~1,000 | `8cc362cc` |
| Batch 7B-hotfix | 11 missed broken imports fixed across 4 files (routes.ts, reasoning-orchestrator.ts, autonomy-controller.ts). learning-cycle-service.ts deleted. | ~200 | `39dc23b1` |

**Risks resolved by this directive:**
- RISK-070 (legacy test files) — RESOLVED: All Walter/Bob test dependencies removed
- RISK-083 (Cortex undocumented dependency) — RESOLVED: All Cortex files, endpoints, and consuming service imports removed

**Test baseline progression:**
- Pre-directive: 816/81 (897 total)
- After Sub-Batch A (Batch 5): 809/81 (890 total, 7 Walter tests removed)
- After Sub-Batch B (Batch 6): 802/81 (883 total, 7 more Walter tests removed)
- After Sub-Batch C (Batch 7): 800/81 (881 total, 4 Bob tests removed, 2 tests net from file deletion)

---

## DIRECTIVE 12.2.1 COMPLETION LOG (2026-02-27)

**Directive 12.2.1: Wave 1 — Safe Deletions — COMPLETE**

Total removal: ~1,254 lines across 13 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 8 | 2 files deleted (dhma.ts, latti-safety-monitor.tsx). 11 files modified: routes.ts (handleLATTITargets + comment), index.ts (LATTI audit→systemManaged), schema.ts (lattiBaselineHistory + 3 fields), enhanced-system-monitoring.tsx, target-daily-goals.tsx (full rewrite), 5 goal component text replacements, signal-orchestrator.ts (expectedDuration). | ~1,254 | `8086264c` |

**Risks addressed by this directive:**
- RISK-081 (LATTI residual fields) — PARTIALLY RESOLVED: ORM definitions removed, physical DB columns remain
- RISK-044 (lazy-loader LATTI stub) — UPDATED: All other LATTI residuals removed; lazy-loader stub (2 lines) remains

**Test baseline**: 800/81 (881 total) — unchanged

---

## DIRECTIVE 12.2.9 + 12.2.2 COMPLETION LOG (2026-02-27)

**Directive 12.2.9: Wave 9 — Frontend Dead Pages — COMPLETE**
**Directive 12.2.2: Wave 1.5 — MarketScanner Class Removal — COMPLETE**

Total removal: ~3,110 lines across 12 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 9 | 6 frontend pages deleted (admin.tsx, analysis.tsx, command-center.tsx, history.tsx, search.tsx, settings-old-backup.tsx). MarketScanner class removed from market-scanner.ts (~637 lines). 5 consuming files cleaned (routes.ts, market-scan-task.ts, startup.ts, status.ts, App.tsx). | ~3,110 | `8b6bb540` |

**Bugs resolved by this directive:**
- BUG-009 (Two Parallel Scanning Systems) — RESOLVED: MarketScanner class removed, only FX5 Scanner runs

**Risks addressed:**
- RISK-081 (LATTI residual fields) — No change (remains PARTIALLY RESOLVED)

**Test baseline**: 800/81 (881 total) — unchanged

---

## DIRECTIVE 12.2.8 COMPLETION LOG (2026-02-27)

**Directive 12.2.8: Wave 8 — Walter-Era Learning Services + Residual Cleanup — COMPLETE**

Total removal: ~1,460 lines across 7 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 10 | 3 dead services deleted (cognitive-interpreter.ts 589, event-broker.ts 247, phase-8.6.5-enhancements.ts 527). autonomy-controller.ts bug fixed (4 broken references). LATTi lazy-loader stub removed. [LATTIManager] log prefixes cleaned. 3 Walter storage methods removed. | ~1,460 | `189fe0b2` |

**Risks resolved by this directive:**
- RISK-044 (lazy-loader LATTI stub) — RESOLVED: Stub removed, only DB column names remain

**Test baseline**: 800/81 (881 total) — unchanged

---

## DIRECTIVE 12.2.6 + 12.2.5 COMPLETION LOG (2026-02-27)

**Directive 12.2.6: Wave 4.5 — Goal Alignment Gate Removal — COMPLETE**
**Directive 12.2.5: Wave 4 — Friction Model Unification — COMPLETE**

Total removal: ~1,440 lines across 10 files in 1 batch.

| Batch | Scope | Lines Removed | Commit |
|-------|-------|---------------|--------|
| Batch 11 | **12.2.6**: alignment-verifier.ts + strategic-policy-guard.ts deleted (~758 lines). autonomy-controller.ts gate check removed. routes.ts: 7 /alignment routes + 3 strategicPolicyGuard refs + compliance endpoint removed (~180 lines). schema.ts: alignmentAuditLog + valueAlignmentMatrix tables + 3 derived types removed (~38 lines). enhanced-system-monitoring.tsx: AlignmentTab removed (~296 lines). **12.2.5**: vts-service.ts migrated to canonical cost model. 3 deprecated friction functions removed from analysis-utils.ts (~39 lines). expectancy.ts comment updated. | ~1,440 | `b3a1526c` |

**Items resolved by this batch:**
- UNIFY-001 (Friction Model Consolidation) — RESOLVED: All deprecated friction functions removed, all callers migrated to canonical cost model
- Phase 9.0 Alignment Verification System — REMOVED: AlignmentVerifier gate no longer blocks autonomy actions

**Items NOT resolved (separate systems):**
- RISK-028 (Goal Alignment in pre-execution-validator.ts) — Phase 4 system, separate from Phase 9.0
- BUG-012 (Goal Alignment in trading-engine.ts) — Phase 5 finding, separate from Phase 9.0

**Test baseline**: 800/81 (881 total) — unchanged

---

## PHASE 12.3 PIPELINE UNIFICATION COMPLETION LOG (2026-03-03)

**Directive 12.3.1: Regime Authority Resolution — COMPLETE**
**Directive 12.3.3: Confidence Authority Cleanup (NGC Removal) — COMPLETE**
**Directive 12.3.2: Strategy Routing Expansion (Implementation) — COMPLETE**

Total: 5 files modified + 10 files created = 15 files. ~4,000 new/modified lines across 1 mega-batch.

| Batch | Scope | Lines Changed | Commit |
|-------|-------|---------------|--------|
| Batch 13 | **12.3.1**: DSS rewired to `calculatePairRegime()`, canonical 5-regime model, EXTREME_NOISE pre-filter preserved. **12.3.3**: NGC replaced with deterministic confidence formula `(stratConf*0.60 + (1-vol)*0.20 + (1-risk)*0.20)`. Rolling normalization bypassed. **12.3.2**: 8 new strategy modules (morning_star, inside_bar_reversal, support_bounce, pivot_shift, reverse_impulse, defensive_hedge, adaptive_flow, volatility_edge). StrategySignal type 9→17. strategy-sync.ts updated to 17 strategies. Signal orchestrator wired with 8 new evaluation blocks. | ~4,000 | `4d8ef060` |

**Items resolved by this batch:**
- BUG-006 (DSS Legacy Strategy Map) — RESOLVED: DSS now uses canonical map with 17 strategies
- BUG-008 (Four Parallel Regime Systems) — PARTIALLY RESOLVED: Engine #1 replaced, Engine #4 (MCP/ARE) remains for Wave 6
- RISK-001 (VTS/Active Trading Regime Drift) — RESOLVED: Both paths use `calculatePairRegime()`
- RISK-003 (DSS Blocks Pattern/Hybrid) — RESOLVED: All 17 strategies flow through pipeline
- RISK-014 (Strategy Sync 8 Quant Only) — RESOLVED: Sync covers 17 strategies
- RISK-015 (range_trading vs range_trade) — RESOLVED: Canonical name `range_trade`, legacy alias accepted

**Items NOT resolved (separate scope):**
- BUG-008 Engine #4 (MCP/ARE) — deferred to Wave 6 (MCE). 14+ consumers need migration.
- RISK-017 (Bridge JSON Staleness) — not addressed in this batch
- RISK-018 (Drift Detector Baselines) — not addressed in this batch
- BUG-007 (hybrid-integration.ts legacy types) — not addressed, may be obsoleted by new strategy modules

**Test baseline**: 791/90 (881 total) — 9 new failures from strategy module interactions with existing tests

---

## Batch 40 — Migration to Hetzner + Supabase (2026-03-30)

| Category | Description |
|----------|-------------|
| **Infrastructure** | Migrated from Replit to Hetzner CPX22 staging server (188.245.193.8, Falkenstein). nginx reverse proxy with WebSocket upgrade, SSL-ready, rate limiting. PM2 process manager. |
| **Database** | Migrated from Neon serverless to Supabase PostgreSQL 17.6 (Frankfurt). Driver swap: `@neondatabase/serverless` to standard `pg`. Drizzle ORM adapter changed to `drizzle-orm/node-postgres`. 182 tables, full data imported. |
| **CI/CD** | GitHub Actions pipeline: typecheck, build, Docker build on every push to migration branch. Deploy-staging workflow template with TODO gates. |
| **Code cleanup** | Removed 3 Replit Vite plugins. Removed unused REPLIT/REPLIT_DEPLOYMENT env vars. Removed REPLIT_DEV_DOMAIN CORS handling. Disabled OpenAI-dependent imports (ai-analyst, ai-opportunities, daily-brief) to unblock Express startup. |
| **Workflow** | Adopted Post-Replit workflow (POST_REPLIT_WORKFLOW.md). Replit frozen. Clone repo now read-write on migration branch. Direct SSH deployment. |

**Items resolved:**
- Replit operational friction (Agent queue confusion, prompt truncation, browser automation fragility) — RESOLVED: direct SSH access
- Indirect deployment path (zip + INSTRUCTIONS.md + Agent) — RESOLVED: git-native workflow
- Limited log/DB access — RESOLVED: direct PM2 logs and psql to Supabase

**Items outstanding:**
- ai-analyst.ts full removal (legacy Walter code — currently disabled, not removed)
- Non-fatal DB column errors (some tables missing columns added in later batches)
- ML service not running on staging (python3 PATH issue)
- Sidebar toggle z-index fix needs testing across screen sizes

---

## PHASE 15a FIXES (Batch 59, 2026-04-12)

### FIX-B59-001: Regime Archive Field Name Mismatch
- **Severity**: HIGH (data correctness)
- **Location**: `server/core/logging/vts-telemetry.ts:148`
- **Problem**: Telemetry aggregator looked for `netProfitPercent`/`pnlPercent`/`profitPct` but VTS trades store `netProfit` (decimal). Fell through to 0 — 0% win rate and $0 P&L in all 39 regime archive entries despite 449+ trades being read.
- **Fix**: Added `netProfit` to fallback chain with `* 100` decimal-to-percent conversion.
- **Found by**: Claude Code pre-implementation audit (staging UI review)

### FIX-B59-002: Regime Archive PnL Double-Scaling (Langston Catch)
- **Severity**: HIGH (latent — activated by FIX-B59-001)
- **Location**: `server/core/logging/vts-telemetry.ts:158`
- **Problem**: `pnl += netProfitPercent * 100` — double-scaled percent to basis points. Harmless when always 0, 100x inflated once real data flows.
- **Fix**: `pnl += netProfitPercent` — removed redundant `* 100`.
- **Found by**: Langston code-level review

### FIX-B59-003: Mapping Drift Stale Sync Timestamp
- **Severity**: LOW (diagnostic display)
- **Location**: `canonical-regime-strategy-map.ts:38`, `sync-canonical-bridge.ts:67`
- **Problem**: Hard-coded `updatedAt: '2026-03-05T00:00:00Z'`, never refreshed. No automatic sync scheduler.
- **Fix**: Updated metadata, added `updatedAt` override in sync script, added daily `canonical_bridge_sync` scheduler task, MIN_SAMPLES 30→10.

### FIX-B59-004: ESM Compatibility — sync-canonical-bridge.ts
- **Severity**: MEDIUM (blocked force-sync API + scheduler task)
- **Location**: `server/scripts/sync-canonical-bridge.ts:201`
- **Problem**: `require.main === module` throws in ESM. Same pattern as B58 `__dirname` fix.
- **Fix**: `typeof require/module` guard with try/catch.

### INFRA-B59-001: Predictive Diagnostics Placeholder Data
- **Severity**: INFORMATIONAL
- **Location**: `predictive-diagnostics.service.ts`, `analytics.tsx`
- **Problem**: Model Diagnostics values are hardcoded constructor defaults, never fed real data.
- **Fix**: Added amber placeholder warning banner. Full wiring deferred to B60.

---

## PHASE 15B INFRASTRUCTURE FIXES (2026-04-14 → 2026-04-15)

### INFRA-15B-001: CCDT Relay Stopped Copying Messages to cc-inbox (Six Root Causes)
- **Severity**: HIGH (broke the Kyle → Claude Code message relay pipeline, forcing manual workaround sends that masked the real issue for ~14 hours)
- **Discovered**: 2026-04-15 00:30 by the new CC session during B61 Phase 3a — "CCDT is posting fake acks in the group and not relaying Kyle's messages to cc-inbox"
- **Diagnosed**: 2026-04-15 00:45 (previous governance CC session, three root causes) + 2026-04-15 01:30 (Langston infrastructure session, three additional root causes)
- **Symptom**: Messages Kyle posted in Topic 21 were NOT appearing in `cc-inbox`. The new CC session's polling chain returned "no unread messages" even when Kyle posted. Simultaneously, messages attributed to "CCDT Communicator" were appearing in the group that looked like automated acks not originated by CC.
- **Six root causes identified (all fixed)**:
  1. **`channels.telegram.accounts.ccdt-relay.enabled: false`** in `openclaw.json` — had been disabled in every config backup going back weeks. Inbound path to the relay agent blocked at the account level. Outbound sends via `openclaw message send --account ccdt-relay` still worked (masking the disable), which is why CC's workaround posts were succeeding.
  2. **Legacy streaming config keys** (`channels.telegram.*.streamMode`, `streaming` scalar, `chunkMode`, `blockStreaming`, `draftChunk`, `blockStreamingCoalesce`) were incompatible with the OpenClaw 2026.4.14 schema after today's 2026.4.5 → 2026.4.14 upgrade. Even with `enabled: true`, the ccdt-relay account couldn't load cleanly. Fixed via `openclaw doctor --fix` which migrated them to the nested `streaming.{mode,chunkMode,preview.chunk,block.enabled,block.coalesce}` structure.
  3. **Duplicate gateway — leftover `openclaw-ccdt` systemd service** was running in parallel to the main gateway, fighting for the `@CCDTCommsBot` token. Either gateway could handle any given inbound, each with stale config, producing intermittent behavior. Stopped and disabled the leftover service.
  4. **Missing `openclaw agents bind` routing** — the `telegram-relay ← telegram accountId=ccdt-relay` binding had been wiped at some point. `enabled: true` in config is necessary but not sufficient; the runtime bind is a separate wire. Re-added via `openclaw agents bind`.
  5. **Stale `SOUL.md` at obsolete profile path** — the silent-relay instructions had been maintained at `/root/.openclaw-ccdt/workspace/SOUL.md` (an obsolete separate OpenClaw profile), but the main gateway's `telegram-relay` agent actually reads from `/root/.openclaw/agents/telegram-relay/workspace/SOUL.md`, which still held an old verbose version. Wrote the correct silent-relay version there.
  6. **Wrong model on `telegram-relay` agent** — was `openai/gpt-4.1-mini`, which cannot reliably invoke shell tools. Instead of calling `cc-inbox write "..."`, the mini model was outputting the literal text `cc-inbox write "..."` directly into the group chat. This was misdiagnosed as "chatty ack posts" when it was actually failed tool-call fallbacks leaking as text. Switched to `openai/gpt-4.1` (full) — slower and slightly more expensive but actually calls tools.
- **Secondary fix**: `agents.defaults.bootstrapMaxChars` raised from 20,000 to 40,000 so Langston's BOOTSTRAP.md (at 19,952 chars after Phase 15b additions) doesn't silently truncate on next session reset.
- **End-to-end verification**: Kyle posted `test relay 3` in Topic 21 → CCDT silently executed `cc-inbox write` → `cc-inbox` showed `#774 [FROM: Kyle Jordan] [TOPIC: 21] test relay 3` with no text output in the group. Relay agent behaving as specified.
- **Operational rules added as a result** (see `SYSTEM_MANUAL.md` Telegram Infrastructure section and CLAUDE.md §8):
  - **Model rule**: Never use `gpt-4.1-mini` for OpenClaw agents that need to invoke shell tools (relay, conductor, or similar). Use `gpt-4.1` full minimum. Mini is fine for text-generation-only jobs.
  - **Binding rule**: `enabled: true` in `openclaw.json` is necessary but NOT sufficient for an agent↔account wire. The runtime `openclaw agents bind` is separate state and can be wiped independently.
  - **Duplicate-gateway check**: When an OpenClaw agent is misbehaving, always check `systemctl list-units --type=service | grep openclaw` AND `ps aux | grep openclaw-gateway` for leftover/duplicate processes fighting for the same bot token.
  - **Workspace path verification**: If behavior contradicts documented workspace rules (e.g. SOUL.md says "silent in group topics" but agent is chatty), verify the agent is actually loading the file you think it is. OpenClaw profiles can have multiple workspace paths. Confirm with `openclaw health` and the registered `agentDir` in `openclaw.json`.
- **Masking effect**: For ~14 hours (April 14 10:28 UTC → April 15 00:30 UTC), the broken relay was masked by Langston writing to cc-inbox directly via his BOOTSTRAP additions ("Always copy your messages to cc-inbox so Claude Code's polling picks them up"). This made it look like the relay was working when it wasn't. The real breakage was only discovered when the new CC session expected relay-formatted messages in its polling loop and they weren't arriving.
- **Follow-up cleanup** (tracked, not blocking): delete or rename `/root/.openclaw-ccdt/` obsolete profile path so future sessions don't accidentally edit workspace files that aren't the live ones.

### INFRA-15B-002: OpenClaw Gateway Upgrade 2026.4.5 → 2026.4.14 (1M Context Override Deferred)
- **Severity**: INFORMATIONAL (operational improvement; one regression addressed by INFRA-15B-001)
- **Location**: `/usr/lib/node_modules/openclaw` (global npm install) + `/root/.openclaw/openclaw.json`
- **Trigger**: Upstream bug [openclaw/openclaw#42225](https://github.com/openclaw/openclaw/issues/42225) — GPT-5.4 runtime context-engineering path uses hardcoded 272,000-token cap instead of the model's real 1,050,000-token capacity, causing premature compaction on Langston's topic-21 session. Related PR [#44475](https://github.com/openclaw/openclaw/pull/44475) proposes `agents.defaults.models` passthrough override to fix.
- **Action taken**: Upgraded via `openclaw update` (2026.4.5 → 2026.4.14, latest as of 2026-04-14). Attempted both documented override patterns:
  1. `agents.defaults.models.openai/gpt-5.4.contextWindow = 1050000` — REJECTED, schema still `.strict()`, PR #44475 not merged in 2026.4.14.
  2. `models.providers.openai.models[].contextWindow = 1050000` — schema-accepted after adding required `baseUrl` and `name` fields, but the override did not propagate to runtime session telemetry (session still reported `contextTokens: 272000`). Matches the #42225 "catalog lookup wins before forward-compat patch" caveat.
- **Status**: **272K cap deferred** until OpenClaw ships a newer release containing PR #44475. Langston workspace files (BOOTSTRAP, MEMORY, SOUL) were already structured for the 272K constraint as part of the Phase 15b governance transition. Monitor [openclaw/openclaw releases](https://github.com/openclaw/openclaw/releases) and retry the override when PR #44475 lands.
- **Side effect**: The upgrade surfaced the legacy streaming config keys that broke the CCDT relay, which was the trigger chain for INFRA-15B-001.
- **Post-upgrade verification**: `openclaw health` reports `telegram: ok (@LangstonDTBot, @CCDTCommsBot)`, both accounts healthy after INFRA-15B-001 fixes applied.

### INFRA-15B-003: `.claude/settings.json` Invalid JSON (Missing Comma)
- **Severity**: MEDIUM (silently broke Claude Code project hooks)
- **Location**: `.claude/settings.json` (line 10-11)
- **Problem**: Missing comma between `"_notificationPing"` and `"_test"` keys. Claude Code silently failed to parse the file, which meant the `ConfigChange` hook (which runs `cc-inbox read && cc-inbox mark-read` on config change) was not loading. Hooks had been broken for an unknown period.
- **Fix**: Added the missing comma. File now parses as valid JSON.

### INFRA-15B-004: `.claude/settings.local.json` Wrong Permission Wildcard Syntax
- **Severity**: HIGH (caused aggressive permission prompts that blocked the new CC session's B61 work and led to manual allow-list accumulation)
- **Location**: `.claude/settings.local.json` permissions.allow list
- **Problem**: Every entry used `Bash(*)`, `Read(*)`, `Write(*)`, etc. Per the official Claude Code settings documentation, these are interpreted as "bash with the specific literal argument `*`" — which never matches any real command. The wildcard syntax for "all bash commands" is the bare tool name `Bash` (no parentheses). Because the wildcards were non-functional, the new CC session was prompted on every `Bash` invocation and had been accumulating specific command entries like `Bash(cp ".claude/tmp_cc_msg.txt" /tmp/cc_msg.txt)` each time Kyle clicked "Always allow", bloating the file and not solving the underlying problem.
- **Fix**: Rewrote the allow list with bare tool names per the documented syntax: `"Bash"`, `"Read"`, `"Write"`, `"Edit"`, `"Grep"`, `"Glob"`, `"WebFetch"`, `"WebSearch"`, `"Task"`, `"TodoWrite"`, `"NotebookEdit"`, plus `"mcp__plugin_telegram_telegram__reply"`. Added `$schema` reference. Session restart required because Claude Code loads settings at session startup only — no hot-reload for `permissions.allow`.
- **Reference**: [Claude Code settings docs — permission rule syntax](https://code.claude.com/docs/en/settings)
- **Lesson**: When pattern-matching settings don't behave as expected, consult the official docs for the exact syntax before hacking around. Wildcard conventions vary across tools and Claude Code specifically uses bare tool names for "match all", not `(*)` patterns.

### INFRA-15B-005: CLAUDE.md Multi-Line Telegram Send Pattern — Double-Expansion Trap
- **Severity**: MEDIUM (every multi-line Telegram send from CC sessions landed in Telegram as one collapsed paragraph with no bullets or newlines)
- **Location**: `CLAUDE.md` §6 "Reliable multi-line pattern" subsection
- **Problem (first version)**: Original pattern used `"$(cat /tmp/cc_msg.txt)"` inside an SSH command with outer double quotes. The local shell expanded the file contents during SSH command construction, inserting them directly into the SSH command string. Any `$(...)`, backticks, or `$VAR` literals in the body were then re-expanded a SECOND time by the remote shell, breaking on unbalanced quotes. The newline-preservation also failed in some send paths.
- **Problem (first fix version)**: The new CC session hit the double-expansion trap trying to send the B61 scope review to Langston — the review itself documented the `"$(cat /tmp/cc_msg.txt)"` pattern, which then got re-expanded on the remote side and failed.
- **Final fix**: Rewrote CLAUDE.md §6 with the correct pattern: (a) write body to local `/tmp/cc_msg.txt` via heredoc with quoted delimiter `<<'BODY_EOF'`, (b) `scp` file to remote server, (c) wrap ssh command in outer SINGLE quotes, (d) on remote side use `MSG=$(cat /tmp/cc_msg.txt); openclaw ... --message "$MSG"`. The double-quoted variable expansion `"$MSG"` substitutes the stored string without re-running command substitution on its contents. Metacharacters come through as literals. Added explicit "what NOT to do" block showing the obsolete pattern.
- **Reference**: CLAUDE.md §6 "Reliable multi-line pattern" after commit `30e4d19c`.
- **Lesson**: Any time a shell command chain crosses an SSH boundary with potentially-unsafe content, think carefully about where each expansion happens (local shell vs remote shell) and use variable assignment on the target side to prevent double-expansion.

### DBS-B61-001: Dormant Wire + Half-Wire Discovery at DBS Consumer Sites
- **Severity**: MEDIUM (governance framing was wrong — SIM said "NONE" and "never imported anywhere" but two consumer sites existed in source)
- **Type**: DISCOVERY
- **Location**: `server/services/signal-orchestrator.ts:454` (dormant wire), `server/services/vts-runner.ts:877` (half-wire)
- **Summary**: Two DBS consumer sites found that governance docs had classified as "orphan": signal-orchestrator.ts:454 (dormant wire — imports `computeBiasConfidenceModifier`, computes `dbsModifier`, multiplies confidence, but active trading has been OFF since at least 2026-01-12, so this code has never executed against a captured cycle) and vts-runner.ts:877 (half-wire — computes `biasModifier = computeBiasConfidenceModifier(biasCategory)` then the result is never referenced again, discarded every VTS cycle). Corrected framing from "orphan" to "dormant wire + half-wire" in SIM §5.1b and System Manual Layer 1b. Both carried as discovered, not fixed during B61 — fixing is deferred to B62+ when the DBS integration path is designed.
- **Governance lesson**: The prior SIM entry said "NONE" for downstream consumers. This was operationally true for captured decisions during the DBS era, but false as a code-path inventory claim. Every future review must check both runtime consumer behavior AND source-level imports, not conflate them. See SIM §5.1b burial-pattern case study (false parity claim between two broken paths).
- **Reference**: `BATCH_61_SCOPE.md` §2, `BATCH_61_PRE_AUDIT.md` §2.2.1, SIM §5.1b (updated 2026-04-15).

### DBS-B62-001: Regime Classifier Redesign (Design B — DBS-Integrated)
- **Severity**: HIGH (structural fix for 70% drift contamination in RANGE_BOUND_STABLE)
- **Type**: REDESIGN
- **Location**: `server/core/metrics/market-regime.ts`, `server/services/market-context-engine.ts`
- **Summary**: `calculatePairRegime()` redesigned to accept `dbsScore` as 4th input. Three DBS gates added: RBS requires `|DBS| < 0.10` (eliminates drift contamination), TFS admits `|DBS| >= 0.30`, IE admits `|DBS| >= 0.50 + vol > 0.015`. MCE ordering swapped to DBS-before-regime. Phase 0 evidence: TFS+IE 14.1%→36.5%, RBS drift 70.2%→0.0%, family flicker 1.99% (passes 2.0% ceiling). TFS threshold 0.30 selected by parameter sweep as the only value that passes flicker ceiling.
- **Reference**: `BATCH_62_PHASE0_REPLAY_ANALYSIS.md`, `BATCH_62_SCOPE.md`

### DBS-B62-002: Global DBS Three-Defect Fix (A.3 Remediation)
- **Severity**: MEDIUM (global DBS was operationally noisy — 50.32% flicker from partial cache reads)
- **Type**: FIX
- **Location**: `server/core/metrics/directional-bias.ts`, `server/services/market-context-engine.ts`, `server/services/market-indicators.ts`
- **Summary**: Three A.3 defects fixed: (1) real 24h volume from MCE cache instead of empty map, (2) coverage gate at 70% of peak — prevents computing global DBS from underfilled cache, (3) sentinel-zero filter on `DirectionalBiasResult`. Configurable weight cap constant added (`GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT = 1.0`, disabled). Further architectural improvement (persistent store + end-of-cycle snapshot) deferred to post-72h verification.
- **Reference**: `BATCH_61_A3_GLOBAL_DBS_METHODOLOGY.md`, `BATCH_62_PRE_AUDIT.md`

### DBS-B62-003: VTS Benchmark Unblock + Dead Code Removal
- **Severity**: MEDIUM
- **Type**: CLEANUP + FEATURE
- **Location**: `server/services/vts-runner.ts`, `server/services/signal-orchestrator.ts`, `server/services/fx5-scanner.ts`
- **Summary**: (1) Directive 11.6F benchmark exclusion removed from vts-runner.ts. (2) Batch 52 benchmark filter removed from fx5-scanner.ts. BTC/ETH/SOL now flow through VTS. (3) Dormant DBS confidence modifier removed from signal-orchestrator.ts (L448-467 + import). (4) Half-wired biasModifier removed from vts-runner.ts (L875-877 + import). Both `computeBiasConfidenceModifier` imports eliminated.
- **Reference**: `BATCH_62_SCOPE.md` §4.9

### DBS-B62-004: B62 Verification CONFIRMED — 72h post-deploy metrics PASS
- **Severity**: VERIFICATION (closure record)
- **Type**: CONFIRMATION
- **Location**: `Claude Comms and Packages/Batch Completion/BATCH_62_COMPLETION_REPORT.md`
- **Summary**: 72h B62 verification window (2026-04-16 09:15 UTC → 2026-04-19 09:15 UTC) confirms all primary metrics. 174,287 MCE pair-cycle samples + 359 closed trades across 76 symbols. Results:
  - **RBS drift contamination: 0.00%** (0/23,983 RBS samples). Target <30%. Pre-B62 was 70.2%. Primary B62 objective achieved definitively.
  - **TFS+IE combined: 46.19%** (TFS 43.0% + IE 3.2%). Target 18-25%. Pre-B62 was 14.1%. Exceeds target band.
  - **RBS share: 14.4%** (was 55.7%).
  - **IE share: 3.2%** — within 2-5% target band; IE redefine successful.
  - **ST share: 33.2%** — high but stable; no DBS-aware sub-condition needed at this time.
  - Family-level flicker within 2.0% ceiling.
  - Component-clamp saturation stable vs B61 baselines.
- **Additional finding (triggered B63):** high-DBS trades (|DBS|≥0.30) show 25.6% WR vs 37.9% for neutral pairs, 70% stop-out rate. Root cause: existing TFS/IE-mapped strategies (morning_star, reverse_impulse, vwap_pullback) are reversal/pullback patterns misapplied to trending pairs. NOT a filter/gate rejection issue — conversion rates are fine (0.21-0.29%). Triggers B63 = Strong Bull Trend strategy (Path D) + TEC shared service.
- **Reference**: `BATCH_62_COMPLETION_REPORT.md` §4 and §4.1, `POST_B62_PRE_LAUNCH_PLAN.md` Items 1-2.

### INFRA-15B-006: CLAUDE.md Autonomy-With-Langston Rule Missing
- **Severity**: MEDIUM (caused the new CC session to escalate every routine Langston exchange to Kyle instead of iterating to consensus directly)
- **Location**: `CLAUDE.md` §6 Three-Way Communication Protocol
- **Problem**: The original CLAUDE.md §6 documented the three-way roles and the 2-step send pattern, but did NOT explicitly state that CC and Langston can iterate on technical review without looping Kyle in for every exchange. Without that explicit rule, the fresh CC session defaulted to the conservative "ask the user when uncertain" pattern, which manifested as escalating every round of Langston feedback to Kyle — exactly the failure mode Kyle called out as "passive behavior" in the screenshot of the B61 scope exchange.
- **Fix**: Added a full "Autonomy with Langston — iterate to consensus, don't escalate every round to Kyle" subsection in §6 with: iterate-decide-respond loop, 5 explicit escalation triggers (true deadlock 2-3 rounds, architectural decision, risk/authority boundary, new directive needed, scope expansion), explicit default behavior statement, and exceptions for Langston's no-objection feedback and Kyle interruptions.
- **Reference**: CLAUDE.md §6 "Autonomy with Langston" after commit `6f667570`.
- **Lesson**: Stable content in instant-context files (CLAUDE.md / BOOTSTRAP.md) must explicitly describe the DEFAULT behavior, not just the exceptions. Omission reads as "escalate when in doubt" to fresh sessions. If you want the default to be "iterate with peer and decide," say so explicitly.

### DBS-B63B-001: Counter-Trend LONG Guard (Mirror-Defect Fix)
- **Severity**: MEDIUM
- **Type**: FIX + NEW GOVERNANCE PATTERN
- **Location**: `server/strategies/morning-star.ts`, `server/strategies/reverse-impulse.ts`, `server/strategies/defensive-hedge.ts`, `server/services/strategy-engine.ts` (sma_trend_ride block), `server/services/strategy-engine.ts` (vwap_pullback block — restructured in DBS-B63B-002)
- **Problem**: B62 72h counterfactual audit found 94 LONG-only trades opened on pairs with `pairDirectionalBiasScore ≤ -0.30` (strong downtrend). Win rate 22.3%. Contributors: reverse_impulse (54), morning_star (22), vwap_pullback (15), defensive_hedge (2), sma_trend_ride (1). Mirror of B63 Item 6's positive-DBS exclusion — the negative side was unaddressed.
- **Fix**: Added `if dbsScore <= -0.35 return null` with new null-reason `b63b_counter_trend_long_exclusion` to all 5 LONG-only strategies. Threshold -0.35 chosen for symmetry with B63 Item 6's +0.35. Commits `b0b8e39e` (Stage 10A, 4 strategies) + `c3fe0712` (Stage 10B+10C, vwap_pullback restructure integrates the mirror guard).
- **Post-deploy verification**: 5 occurrences of `b63b_counter_trend_long_exclusion` in compiled dist (one per strategy) confirmed after PM2 #79 restart.
- **Reference**: `BATCH_63_SCOPE.md` Item 10; `BATCH_63_COUNTERFACTUAL_AUDIT.md` for trigger evidence.

### DBS-B63B-002: vwap_pullback Promotion Into Strong-Trend Lane + First-Claim-Wins Arbitration
- **Severity**: MEDIUM (architectural)
- **Type**: FEATURE
- **Location**: `server/services/strategy-engine.ts` (vwap_pullback block), `server/config/canonical-regime-strategy-map.ts` (new `MULTI_FAMILY_ELIGIBILITY` map), `server/services/vts-runner.ts` (family-eligibility gate + first-claim-wins arbitration block)
- **Problem**: Counterfactual audit showed vwap_pullback as the ONE legacy archetype that works on strong-trend pairs (baseline WR 63.2% on n=19 high-DBS bullish sample). B63 Item 6's positive-DBS exclusion blocked promotion.
- **Fix**: (1) Removed vwap_pullback's positive-DBS exclusion. (2) Added mirror-defect guard per DBS-B63B-001. (3) New `MULTI_FAMILY_ELIGIBILITY` map makes vwap_pullback eligible in both `trend` (primary) and `strong_trend` families; gate logic OR's primary + additional. (4) Lane arbitration: if both `strong_bull_trend` and strong-trend-lane `vwap_pullback` fire same-pair same-cycle, first-claim-wins (same pattern as Batch 19G duplicate guard). Null-reason `strong_trend_lane_conflict`. Strict R-multiple arbitration deferred to future enhancement.
- **Commit**: `c3fe0712` (Stage 10B+10C).
- **Reference**: `BATCH_63_SCOPE.md` Items 11 + 13.

### DBS-B63B-003: Strong-Trend Geometry Override Plumbing (Variant E)
- **Severity**: LOW (additive)
- **Type**: FEATURE
- **Location**: `server/services/strategy-engine.ts` (new optional `TechnicalIndicators.strongTrendGeometryOverride` field + vwap_pullback consumption), `server/services/vts-runner.ts` (override attached when `sourcePool === 'quant-strong_trend'`)
- **Design rationale**: routing lane is the first-class concept; override carried via routing context (not hard-coded DBS branch inside the strategy). Future strategies promoted into the lane inherit the contract automatically.
- **Fix**: Optional `strongTrendGeometryOverride: { stopAtrMultiplier, targetAsRMultiple }` on `TechnicalIndicators`. vts-runner attaches `{ 4.0, 3.0 }` (Variant E per counterfactual audit) at call site when sourcePool is quant-strong_trend. `vwap_pullback` consumes override; `strong_bull_trend` ignores (uses own locked constants).
- **Contract test**: `server/tests/unit/b63-item12-geometry-override.test.ts` — 4 tests verify override path, default path, counter-trend guard precedence, Variant E constants.
- **Commit**: `c3fe0712` (Stage 10B+10C).
- **Reference**: `BATCH_63_SCOPE.md` Item 12.

### DBS-B63B-004: Strong-Trend Lane Mode-Overlay Bypass
- **Severity**: HIGH (silently destroyed R:R geometry on every pre-fix strong-trend trade)
- **Type**: FIX
- **Location**: `server/services/vts-runner.ts` (~L1086), `server/services/paper-execution-engine.ts` (~L2165)
- **Problem**: Existing mode-overlay applied asymmetric multipliers globally. DEFENSIVE: stop×1.2 + target×0.8 → 2:1 RR became 1.33:1. SURVIVAL: stop×1.5 + target×0.6 → ratio 0.8 (target closer than stop, inversion). Every pre-fix strong_bull_trend trade in observed CSVs sat in DEFENSIVE or SURVIVAL with silently-destroyed geometry.
- **Fix**: Lane-based bypass. When `sourcePool === 'quant-strong_trend'`, use native stop/target distances. Reversal/continuation archetypes retain mode-overlay as designed — bypass is scoped to the strong-trend lane only.
- **Post-deploy verification**: direct proof from same-cycle log pair under SURVIVAL mode. ETH/USD (normal lane): `Stop 2283.27→2271.75 | TP 2333.89→2322.86` (multipliers applied). EVAA/USD (strong-trend lane): `Stop 0.6653→0.6653 | TP 1.1200→1.1200` (bypass active, identical before/after values).
- **Commit**: `c3fe0712` (Stage 10B+10C).
- **Reference**: `BATCH_63_SCOPE.md` Item 14.

### DBS-B63-ITEM16-001: Global DBS Persistent Store + End-of-Cycle Atomic Snapshot + Fixed 20-Pair Floor
- **Severity**: HIGH (architectural)
- **Type**: FEATURE (replaces opportunistic cache-read approach)
- **Location**: NEW `server/core/metrics/directional-bias-store.ts`, MOD `server/services/market-context-engine.ts`
- **Problem**: Pre-fix global DBS used opportunistic TTL cache reads with a 70% coverage gate that silently returned NEUTRAL/0 when cache dropped below threshold. Consumers could receive different values within the same cycle depending on cache state at read time. No explicit stale/cold-start semantics.
- **Fix**: (1) Persistent per-pair DBS store with timestamps + 5-minute hard expiry. (2) End-of-cycle atomic snapshot publish — consumers read snapshot, get same value within a cycle. (3) Fixed 20-pair floor replaces 70% coverage gate. (4) Explicit 5-row behavior spec implemented:
  - Row 1 — cold start (empty store + no prior) → `null` + `[GlobalDBS][coldStart]` log
  - Row 2 — below floor WITH prior snapshot → stale prior, `isStale: true` + `[degradedCoverage]` log
  - Row 3 — below floor WITHOUT prior snapshot → `null` + `[noSnapshot]` log
  - Row 4 — non-finite compute → stale prior if exists, else null + `[invalidCompute]` log
  - Row 5 — happy path → fresh snapshot, `isStale: false`, no log (normal operation)
- **Semantics contract**: `null` and `isStale: true` are DIFFERENT states; consumers never substitute zero/default for null. In-memory only for B63 (DB persistence deferred). Within-cycle determinism: `getLatestSnapshot()` returns same object reference until next publish.
- **Contract test**: `server/tests/unit/b63-item16-dbs-store.test.ts` — 11 tests covering all 5 spec rows including fake-timer-driven Row 2 (populate → publish → advance 6min → repopulate below floor → assert stale carry-forward with exact prior value/coverage/snapshotTime).
- **Post-deploy verification (PM2 #81, 2026-04-21 15:34:43 UTC)**: cold-start log at T+3s, warm-up to first valid snapshot at T+63s (pairs=33), zero degraded/stale/invalid/noSnapshot logs during 15+ min of normal operation post-warm-up.
- **Commit**: `a4f5dbe0` (Stage 16).
- **Reference**: `BATCH_63_SCOPE.md` Item 16; `BATCH_63_PRE_AUDIT.md` §13 Item 16 (5-row behavior spec source).

### DBS-B63-AUDIT-001: Counterfactual Audit — Exit-Only Replay of B62 72h High-DBS Trades
- **Severity**: EVIDENCE (audit finding, no code change)
- **Type**: ANALYSIS
- **Location**: `Claude Comms and Packages/Scope Files/BATCH_63_COUNTERFACTUAL_AUDIT.md`, `scripts/phase15b/b63_counterfactual_audit.py`
- **Summary**: Exit-only counterfactual replay of 90 bullish high-DBS LONG trades from the B62 72h window. Six variants tested (baseline, A/B/C/D/E with varying stop × target geometry) using 15-min Kraken OHLC + MCE-derived ATR-at-entry. Findings: (a) morning_star (55/90 = 61% of population) had identical 32.1% WR across EVERY fixed-stop variant — widening stops does NOT rescue the archetype, confirming entry-archetype problem not exit-geometry; (b) vwap_pullback (19/90) already profitable at baseline (63.2% WR) and responds positively to Variant E (4×ATR stop, 3R target, Sum R doubled to +4.1); (c) only 13.5% of original stop-outs later reached +1R under fixed-stop variants — small rescue effect, concentrated in vwap_pullback; (d) losers' median MFE 0.0016 vs winners' 0.0252 (15× gap) — directionally wrong from entry, not stopped by noise; (e) separate mirror defect — 94 DBS ≤ -0.30 LONG trades in window with WR 22.3%, dominated by reverse_impulse (54) and morning_star (22). **Triggered: B63 Items 10 (counter-trend LONG guards), 11 (vwap_pullback lane promotion), 12 (geometry override), 14 (mode-overlay bypass).**
- **Reference**: `BATCH_63_COUNTERFACTUAL_AUDIT.md`.

### B64-AUDIT-001: B58a Authority Baseline — Current DB State Verified
- **Severity**: VERIFICATION (restores trust after prior discovery of DB-vs-docs drift)
- **Type**: AUDIT (documented-as-wired vs actually-wired)
- **Location**: `screener_filters` table on staging Supabase.
- **Context**: Earlier in B63 Kyle raised that DB rows existed but values were not all populated per documented design. Trust in governance records was shaken. This audit verifies current state against `AUTHORITY_BASELINE.md` Section A.
- **Finding**: **ALL 12 B58a baseline filter paths match AUTHORITY_BASELINE.md Section A exactly on `vn_max, di_min, di_max, min_volume` across both `live` and `paper` modes = 24 rows, exact match.** Additionally B63 added 2 new strong_trend filter paths (`active_strong_trend`, `vts_strong_trend`) = 28 total rows in DB today.
- **Documented-vs-actual drift (1 item, intentional)**: B63 original scope doc proposed `min_volume=$250k` for strong_trend paths; B63.4 intentionally loosened to `min_volume=$0` to increase Path D trade count. Current DB reflects the loosened value. B63 scope doc is stale on this specific parameter. Log and close — no further action required.
- **Residual observation**: B63.3 commit message references columns (min_price tiered, max_price, liquidity, market_cap, spread, history) outside the B58a baseline scope (baseline documented only `vn_max/di_min/di_max/min_volume/volume_24h_min`). Those columns are present in the schema but out of B58a-audit scope. B64 treats this as confirmed-baseline-intact, not a gap.
- **Reference**: `AUTHORITY_BASELINE.md` Section A; `BATCH_63_COMPLETION_REPORT.md` §B64 audit section.

### DBS-B64a-001: Regime & Strategy Drift Dashboard
- **Severity**: FEATURE (observation tool)
- **Type**: NEW UI + NEW API + STORE EXTENSION
- **Location**:
  - NEW `server/services/drift-dashboard-aggregator.ts` — reads closed-trade JSONs + MCE telemetry JSONLs; computes B62-style metrics + strategies-by-regime tables; reads live snapshot/history/transitions from `directional-bias-store`.
  - MOD `server/routes.ts` — new endpoint `GET /api/analytics/drift-dashboard?window=rolling_24h|rolling_7d|rolling_30d|cohort_latest` (auth required).
  - MOD `server/core/metrics/directional-bias-store.ts` — added `snapshotHistory` ring buffer (96 × 15-min = 24h) + `transitions` array (last 50 category changes). New public methods `getHistory()` + `getTransitions()`. Transitions only emitted across FRESH snapshots (stale carry-forwards deliberately excluded to avoid false transition events).
  - MOD `client/src/pages/analytics.tsx` — new "Drift Dashboard" tab (5th of 8). `DriftDashboardSection` with window toggle + summary cards + regime shares + regime integrity metrics + DBS distribution counts + Global DBS live snapshot with isStale badge + `GlobalDbsSparkline` inline SVG chart + category transition list + per-regime strategy performance tables.
- **Design decisions (per Kyle 6-question spec 2026-04-22):**
  1. Window: rolling 24h/7d/30d + since-last-restart toggle
  2. Metrics: all B62-72h-report metrics (regime shares, family flicker, RBS drift contamination, component-clamp saturation, DBS distribution)
  3. Strategy grouping: by REGIME (for each regime, which strategies fired + WR + avg R / net PnL)
  4. DBS distribution: simple category counts, no heavy charts
  5. Global DBS: current snapshot + 24h history sparkline + transitions list
  6. CLOSED trades only (live positions stay on existing Active Trades page)
- **Scope constraints:**
  - No caching — aggregator reads disk on each request. Add 60s memoization later if CPU becomes an issue.
  - Regime strings sourced through canonical SSOT (`REGIMES.*` from `canonical-regime-strategy-map.ts`) to satisfy the `regime_mapping_integrity` test (no hardcoded regime strings outside config/tests).
  - Zero external chart library dependencies — inline SVG for sparkline.
- **Hotfix 1** (`cd139ed8`): initial UI-sync commit had `await import(...)` inside a sync function; esbuild failed. Replaced with static top-of-file import.
- **Hotfix 2** (`cf7baef1`): regime_mapping_integrity test failed because aggregator hardcoded regime strings in 4 places. Routed all through `CANONICAL_REGIMES` / `REGIMES.*`.
- **Post-deploy verification (PM2 #84, 2026-04-22 ~02:05 UTC):**
  - Endpoint returns 24h rolling: 84 closed trades, WR 55.95%, avg net +1.414%, 72,765 MCE samples
  - Regime shares: TFS 40.4% / RBS 25.5% / ST 21.8% / IE 10.6% / HVU 1.8%
  - Family flicker 1.24% (target ≤ 2.0% — passing)
  - Strategy tables populated per regime (e.g. RBS range_trade n=21 WR 71%, TFS strong_bull_trend n=32 WR 53%)
  - History + transitions start empty (cold start) — expected; populate within ~15-30 min of stable operation
- **Commits**: `eb790763` (B64a), `cd139ed8` (HF1), `0be18c4f` (B64a.1 history+sparkline), `cf7baef1` (HF2 regime strings).
- **Reference**: `BATCH_63_SCOPE.md` Item 7 originally planned as B71 drift dashboard tab; shifted up to B64a since Kyle wanted it operational during the B63 audit window (Items 15/18/19 in flight).

### B64b-FIX-001 — MAX_HOLD_MS safety valve restoration
- **Reported by**: Langston in B63-close commit review 2026-04-23
- **Resolved by**: B64b commit `0a56d139` (2026-04-23, PM2 #86)
- **Issue**: B63-close commit set `MAX_HOLD_MS = Number.POSITIVE_INFINITY` while removing the 24-hour timeout (Kyle directive). This unintentionally disabled the Batch 18I force-close-stale safety valve — VTS trades on illiquid pairs with unavailable price feeds would accumulate indefinitely.
- **Fix**: `vts-runner.ts` L534 `MAX_HOLD_MS = 7 * 24 * 60 * 60 * 1000` (7 days). Normal trades resolve via TP/SL well before 7d (longest observed hold ~22h); cap exists only as zombie-cleanup.

### B65.1-FIX-001 — drizzle-kit push introspection broken on PG ARRAY defaults
- **Reported by**: CC during B65.1 deploy attempt 2026-04-23
- **Resolved by**: B65.1-HF3 commits `a129e567` + `b98fd288` + `31013517` (2026-04-23, PM2 #91)
- **Issue**: drizzle-kit 0.31.4 introspector parses PG ARRAY column defaults (`ARRAY['USD','USDT']::text[]` and similar — present on ~15 columns in `shared/schema.ts`) as JSON, fails with `SyntaxError: Unexpected token 'R'`. Has blocked schema-driven migrations.
- **Fix**: New `scripts/db-migrate.ts` file-based migration runner. Reads SQL files from `drizzle/migrations/` in lexicographic order, tracks applied filenames in `_migrations` ledger table, skips rollback files. Uses `pg` Client directly. Self-loads `.env`. Deploys now use `npm run db:migrate` instead of `npm run db:push`. db:push retained as dev-only tool.

### B65.2-FIX-001 — TEC dormant for 8 months
- **Reported by**: Kyle observation 2026-04-23 — "B65.2 plumbing-only commit shipped without behavior change."
- **Resolved by**: B65.2 functional commit `0fcd19b1` + HF1 `806effc0` (2026-04-23, PM2 #93)
- **Issue**: The trailing-exit engine (`trailing-exit-controller.ts`, Directive 9.2) had been dormant since Phase 11 — built, unit-tested, never wired into VTS or paper exit loops. Same for the Phase-11 Trade Execution Controller (`execution-controller.ts`, Directive 11.0C) which contained a separate competing trailing implementation plus the dormant adaptive-sizing function. Both running orphaned. CC's first attempt at B65.2 (`dd1f5372`) shipped a centralized evaluator but set `useTrailing:false` on both callers — plumbing without function. CLAUDE.md §2 step 7 (staging UI verification) skipped, so the gap survived through deploy.
- **Fix**: B65.2 functional commit engaged the engine end-to-end. VTS exit loop and paper `checkExitConditions` both call `evaluateTECExit({ useTrailing:true })`. Stop writeback to `paper_sim_open_positions.stop_loss` on every ratchet. ATR/DI/VolNoise snapshot at trade open. trade_mode populated across all four trade-row tables. Phase-11 percentage-trailing implementation deleted outright (`execution-controller.ts`, `execution-config.ts`, `trade-flow.ts`, 2 unit tests) per Kyle directive — no deprecation. EXECUTION_CONFIG live consumers migrated to module_constants before deletion. SIGTERM handler synchronously flushes trailing-state persistence file. 11-scenario parity test green.
- **Lesson logged**: CLAUDE.md §2 steps 2 (SIM walk) and 7 (UI verification on staging) BOTH have to be substantive. The earlier commit looked workflow-compliant but each step had been done shallow.

### B65.2-FIX-002 — break_even_stop mislabeled as trailing_stop_hit
- **Reported by**: Kyle CSV review 2026-04-24
- **Resolved by**: B65.2-HF3 commit `def5ec68` (2026-04-24, PM2 #96)
- **Issue**: Two distinct semantic concepts collapsed into one `trailing_stop_hit` label: (a) BE-lock-stop hit on a trade that gained 1×ATR and reversed before reaching target (protective exit near breakeven, NOT moonbag), and (b) genuine moonbag trailing-stop hit on a trade that flipped into TRAILING_TAKE and reversed. 7-day post-deploy data showed 49 events of (a) at +$0.09 mean and 5 events of (b) at +$2.68 mean — but the collapsed label made (a) look like underperforming moonbag. Compounding: `export-csv.ts` mapping priority was inverted (`trade.resultType` checked before raw exitReason), so even with correct exitReason the UI badges showed legacy TAKE_PROFIT.
- **Fix**: New `break_even_stop` exit reason threaded through tec-evaluator → vts-runner → vts-service → paper-execution-engine → closed-trade log. Engine logic: `targetLatched → trailing_stop_hit`; `breakEvenLatched only → break_even_stop`; `neither → stop_hit`. UI renders "BE PROTECT" (slate) badge separate from "TRAIL STOP" (emerald). export-csv mapping priority inverted: specific exitReason cases now win over legacy resultType.

### B65.2-FIX-003 — VTS Machine Learning UI missed during pre-audit
- **Reported by**: Kyle UI review 2026-04-23 evening
- **Resolved by**: B65.2-HF2 commit `48e830c4` + HF2b `98705e8e` + HF2c `aa7d9bb1` (2026-04-23, PM2 #95)
- **Issue**: CC told Langston in B65.2 pre-audit that VTS had no open/closed simulated-trades UI surface and got sign-off to skip surfacing trailing-engine state there. Kyle screenshots of `/machine-learning` proved this wrong — the VTS Open + Closed Simulated Trades tables have existed since Phase 11. CC failed to screenshot staging UI during pre-audit (CLAUDE.md §2 step 2) and again during first-pass verification (step 7).
- **Fix**: HF2 extended `getOpenVirtualTradesForML()` and `getClosedVTSTradesFromLogs()` to carry trailing-engine state. UI in `machine-learning.tsx` got a new TEC State column on Open. HF2b widened TradeRecord type for boolean. HF2c added the matching column on Closed.

### B65.4 — Ladder trailing model (target ratchets up with each rung hit)
- **Reported by**: Kyle direction 2026-04-23 (laid out as one of three trailing options); reaffirmed 2026-04-24 (CSV review showed 4 of 6 moonbag exits BELOW original target); 2026-04-25 acknowledged that CC committed to building three times without doing it.
- **Resolved by**: B65.4 commits `37beb18c` (main) + `4b958a6b` (HF1 test boundary fixes) + `ce13705e` (governance) (2026-04-25, PM2 #97).
- **Issue**: B65.2's pure-trail moonbag mode latched at first target hit and then trailed via HWM-based dynamic stop. Original target was the only target latch event for the trade's life; there was no concept of a second or third target hit. Post-B65.2 observation showed price typically poked just past target and reversed before the dynamic trail could ratchet meaningfully — 4 of 6 moonbag trades exited BELOW the original target. Designed-but-not-realized profit on the typical "spike + reversal" crypto pattern.
- **Compounding**: CC committed to the ladder design three times across two days and let governance / HF work crowd it out each time without flagging the deferral. Workflow failure per CLAUDE.md §11 (unflagged deferral = failure mode).
- **Fix**: Each target hit now ratchets BOTH stop and target. New rung target = previous + R-distance step (where R = original entry-to-target distance). New rung floor = cost-aware floor of just-hit target (`computeNetTargetFloor`). Combined with HWM-based dynamic trail kept as SECONDARY floor (active stop = max(rungFloor, dynamic_HWM_trail)) — clean superset of pure-trail. Multi-rung gaps in a single cycle handled via while-loop. Backward-compat persistence migration handles pre-B65.4 states (targetLatched=true → ladderRung=1). 9 new test scenarios (12-20) cover all paths including Langston Q5 ordering test. Schema migration adds `paper_sim_trades.ladder_rungs_hit INTEGER NOT NULL DEFAULT 0`. UI surfaces `🌙 MB×N` rung count chip on both Open + Closed Simulated Trades.
- **Lesson logged**: when a commitment has a concrete next step that's not yet started, the next commit message must either (a) include that work, or (b) include an explicit "still pending" note. No more silent deferral.

### B65.4.1 — Cost-aware floor formula change (floor placed ABOVE target with slippage buffer)
- **Reported by**: B65.4 ladder counterfactual analysis 2026-04-26 (`B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md`) showed first 5 closed laddered trades lost ~$11 vs the just-take-target counterfactual.
- **Resolved by**: B65.4.1 commit `050ccc88` (2026-04-26, PM2 #98). Per Kyle directive 2026-04-26 to ship straight away without Step-1/Step-4 review.
- **Issue**: The B65.4 rung-floor formula `target * (1 - totalCost/2)` placed the floor BELOW the just-hit target — a "breakeven-after-costs" floor. On price reversal off target, this allowed the trade to exit BELOW the original target value. 2Z/USD example: target $0.0963, floor placed at $0.0905 (6.26% below target), reversed, exited at $0.0902 — **a trade that hit its target became a small loser**.
- **Fix**: Replaced formula with `target * (1 + slippage * bufferMultiplier)`. Floor now sits ABOVE just-hit target by exactly the per-pair slippage estimate × multiplier. Multi-rung ratcheting still works as before. Buffer multiplier exposed as `module_constants.trailing_exit.rung_floor_slippage_buffer_multiplier` (seed 1.0), tunable per `(asset_class, exchange, regime, strategy)` without code redeploy. Migration `2026-04-26-b65-4-1-rung-floor-buffer-seed.sql`.
- **Verification (B65.4.1 verification 2026-04-28)**: hotfix formula confirmed working on post-deploy clean cases (4 trades, ~break-even vs counterfactual). Multi-rung still captures upside in design's payoff scenario. Aggregate ladder Δ across all 17 laddered trades: −59.89pp / ≈ −$39 vs counterfactual; even with hotfix, ladder is net-negative in aggregate. Bigger picture: broader 7-day cohort (1,136 trades) is **−$1,187** with 74% of exits at break-even-stop / original-stop / trailing-stop. Most trades never reach target. **The dominant problem is upstream entry quality, not ladder calibration.** B67 macro confidence modifier is the priority lever. Ladder net contribution stays under observation per Phase 19.4.5 item 7.

### B65.4.2 — Ladder observability columns
- **Reported by**: B65.4.1 verification 2026-04-28 showed the counterfactual analysis was unreadable on "anomaly" rows because the closed-trade CSV didn't expose latch-trigger price (which can fire at +1.5R from entry due to `target_lock_r` interaction, not at the strategy's published target), original stop, or per-rung target history. Analyst had to grep PM2 entry logs to recover original stops.
- **Resolved by**: B65.4.2 commits `db7cbcfb` main + `e9abe8fd` HF1 (`decimal` vs `numeric` build error) + `021b6d06` governance (2026-04-28, PM2 #100). Per Kyle directive 2026-04-28 to ship straight away.
- **Fix**: Three new TrailingState fields captured: `originalStopPrice` at init, `latchTriggerPrice` at first target latch, `rungTargetHistory[]` appended at each ratchet. Propagated through engine → evaluator → caller chain. Three new `paper_sim_trades` columns: `original_stop_price` decimal(20,8), `latch_trigger_price` decimal(20,8), `rung_target_history` jsonb. Migration `2026-04-28-b65-4-2-ladder-observability-columns.sql`. Both open + closed CSV exports + `/api/vts/ml/open` endpoint serializer include the fields. Folds in the original B65.4 punch-list item (open-trades API wiring). Backward-compat: `importStates` migration sets `rungTargetHistory: []` for pre-B65.4.2 persisted states; `originalStopPrice` and `latchTriggerPrice` remain undefined for trades whose state was persisted pre-B65.4.2 (cannot reconstruct).
- **Lesson logged**: ad-hoc analysis reports requiring log grepping is a sign that observability needs to land in CSV columns. The tradeoff was right (ship engine first via B65.4 / B65.4.1, observability second via B65.4.2) but the gap should have been visible from the start.

### B67.0 — Telemetry & Ablation Framework for Coordinated Regime-Confidence Overhaul
- **Reported by**: 2026-04-27 master planning doc + 2026-04-28 V2 pre-audit established that the B67 coordinated regime overhaul (6 sub-deliverables) needs a way to MEASURE per-factor contribution before any factor producer ships. Without a counterfactual harness, "did B67.1 macro modifier actually help?" is unanswerable.
- **Resolved by**: B67.0 commit `105d2b53` (2026-04-28, PM2 #101). Sub-deliverable 1 of 6 in B67.
- **Built**: New `regime_factor_alternates` DB table with XOR-discriminated source (`active_signal` vs `vts_trade`) capturing real classifier decisions plus N factor-level alternates per signal evaluation. Fire-and-forget `factor-ablation-emitter.ts` service (gated on `b67_0_ablation_emit_enabled` module constant) wired into both `signal-orchestrator.ts` (active path) and `vts-runner.ts` (VTS mirror); empty alternates today, populated by B67.1+ producers. Nightly `replay-ablation.ts` job (skeleton + 90-day retention sweep functional; outcome-lookup logic ships with B67.1+). New API endpoint `GET /api/analytics/ablation-comparison`, aggregator extension `computeAblationComparison()` reading four-quadrant taxonomy from `replay_outcome` JSONB. New `AblationComparisonSection` UI panel in existing Drift Dashboard tab — empty-state explainer at ship time, 8-column per-factor table when populated.
- **Verification (Step-7 first-pass)**: HTTP 200 post-PM2-restart, schema confirmed via psql (12 columns, 4 indexes, XOR CHECK constraint), 3 module_constants seeds present, row count 0 (expected — no factor producers yet), API returns well-formed empty response, zero `[B67` errors in PM2 logs.
- **Workflow note**: Langston Step-1 (scope) + Step-2 (V2 pre-audit) + Step-4 (×3 chunks: foundational, backend pipeline, UI + bug fix) all approved before push. V2 pre-audit caught a SQL duplicate-condition bug before Step 5; both fixes applied + re-confirmed before push.
- **Independent safety gap surfaced**: V2 pre-audit code-level inspection found `tripKillSwitch()` accepts auto-trip params but is never called automatically; `dailyLossKillSwitchPct` (10% per UI) is configured but enforcement is not wired. Logged as `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 9 marked **BLOCKING for live-trading activation**. Independent of B67 — must close before any real capital is at risk.
- **Lesson logged**: Step-2 pre-audit must include actual SIM consultation + code-level inspection of every consumer integration point, not just architectural reasoning. V1 pre-audit was lighter than CLAUDE.md §9 mandates and Kyle correctly challenged it; V2 redo surfaced findings (kill-switch gap, position sizing is risk-pct not Kelly, FinalScore lockstep across two consumer sites, B63 mode-overlay-bypass coexistence) that V1 missed entirely. Pre-audit shortcuts compound into scope drift downstream.

### B67.1 — Macro Confidence Modifier (regime classifier blind to macro market state)
- **Reported by**: Master planning doc 2026-04-27 §1 + canonical 04-22 hostile-day evidence: the per-pair regime classifier has no visibility into macro market state. On 04-22 globalRegime reported "trend-friendly stable, 98% bullish" while BTC dominance was rising sharply — a contrarian flag the system could not see. 177 strong-bull-trend trades fired; 84% lost. Cost in real money: catastrophic.
- **Resolved by**: B67.1 commit `828f6d92` (2026-04-28, PM2 #103). Sub-deliverable 3 of 6 in B67. Ships in shadow mode (`b67_1_enabled=false`); activation via module_constants flip after 24h soak.
- **Built**: External-data-driven multiplier in [0.85, 1.05] applied to `RegimeClassification.confidence` post-classification. Confidence-modifier architecture (Langston's Option C from master planning doc §3) — label preserved; only confidence is modulated. Inputs: BTC dominance (CoinGecko), aggregated funding rates (Binance public futures, BTC + ETH 8h, OI-weighted 0.6/0.4), total-mcap momentum (CoinGecko period-over-period delta). New pure `computeMacroModifier()` function with min-48-sample z-score floor + stale-data fallback. New `external-macro-feed.ts` singleton: 60s polling, 720-sample in-memory rolling window for z-score baselines, partial-feed graceful, loud `[B67.1][feed]` PM2 logging. MCE periodic refresh loop reads feed snapshot + module_constants, computes modifier, exposes via sync `getCurrentMacroContext()` accessor. `calculatePairRegime` accepts optional `macroModifier` 3rd arg applied pre-clamp; clamp upper bound raised 0.95 → 1.0. Ablation hooks at orchestrator + vts-runner push B67.1 alternate row (`buildB67_1Alternate` helper) when modifier non-null; shadow mode emits no alternate to avoid noise. `market-snapshot.ts` stub reconciled per V2 pre-audit §3.5 (single caller `ai-market-analyzer.ts` transparently inherits real values; +`fundingRate` field on type — no parallel structure created). 11 module_constants seeds in new `macro_modifier` module.
- **Verification (Step-7 first-pass)**: HTTP 200 post-PM2-restart-#103, all 11 seeds present in DB, feed alive (`[B67.1][feed] btc_dom=57.98% mcap_mom=0.00000 funding=0.000029 windows=(btc:2,fund:2,mcap:1)`), zero `[B67.1]` errors. CI overall conclusion SUCCESS — every B67.1 file is TS-clean at edit lines (the 656 vs 655 error-count delta is a re-evaluation artifact, not new B67.1 errors). 18 unit tests pass (`b67-1-macro-modifier.test.ts`): clamp behavior, weight math sign convention, cold-start floor (3 baseline-source tests), stale-data fallback, missing-input fallback, `buildB67_1Alternate` JSONB shape + reverse-derivation correctness.
- **Workflow note**: per Kyle directive 2026-04-28 each sub-deliverable in B67 gets its own dedicated `BATCH_67_X_SCOPE.md` + `_PRE_AUDIT.md` (alongside the master B67 docs). 4 governance docs landed: `BATCH_67_1_SCOPE.md`, `BATCH_67_1_PRE_AUDIT.md`, `BATCH_67_2_SCOPE.md`, `BATCH_67_2_PRE_AUDIT.md`. All Langston-approved cc-inbox #844. Step-4 code review (cc-inbox #845) caught one bug — `mcapMomentum` and raw `totalMarketCapUsd` were sharing a single field on `MacroSnapshot` (a "naming lie" that would bite future readers). Fix applied per option (a) — separate fields. Two design notes confirmed: (a) shadow-mode ablation row suppression is correct (no point in emitting thousands of value=1.0 rows that pollute the table); (b) reverse-derivation `confidence_without = modulated / modifier.value` is acceptable for ablation telemetry (clamp-edge imprecision is bounded and sub-percent for calibration purposes).
- **Lesson logged**: when reconciling pre-existing stub services, separate concerns explicitly. The original stub `market-snapshot.ts` carried `totalMarketCapUsd` which I initially overloaded with the COMPUTED momentum value to avoid adding a new field. Langston caught this as a naming lie. The fix is trivial — add the new field, keep the old name semantically correct. The lesson: **field names are contracts**; overloading them to dodge a schema addition produces a debt that compounds.

### B67.1 governance pattern — per-sub-deliverable scope + pre-audit
- **Reported by**: Kyle directive 2026-04-28: "Have B67.1 and .2 been pre-implementation audited? Have you looked at the system impacts map? The normal workflow should be used for these sub deliveries. that means a scope file too." Initial implementation lane was about to skip Steps 1+2 of CLAUDE.md §2 for B67.1 + B67.2, treating the master B67 scope/pre-audit as sufficient.
- **Resolved by**: stop the implementation lane; write 4 dedicated docs (B67.1 scope + pre-audit, B67.2 scope + pre-audit) with full SIM consultation per CLAUDE.md §9 + code-level inspection + §11 decision 12 BTC-correlation codebase grep. All four Langston-approved cc-inbox #844 in 2 rounds.
- **Pre-audit findings worth carrying forward** (`BATCH_67_1_PRE_AUDIT.md` §3.4 + §3.5): (1) `defensive-hedge.ts` already uses per-pair Spearman BTC correlation as an entry filter; this is ORTHOGONAL to B67.1's macro BTC-dominance signal (different decision points, different time scales, no double-count); (2) `market-snapshot.ts` had a pre-existing stub with hardcoded values that B67.1 must reconcile rather than parallel-create — exactly the burial pattern CLAUDE.md §9 warns against. Both findings documented and addressed.
- **Lesson logged**: master-batch scope/pre-audit is necessary but NOT sufficient for sub-deliverables. Each sub-deliverable still gets its own Step-1 + Step-2 docs covering its specific file-level changes, SIM walk, coexistence requirements, and verification criteria. Compaction of multiple sub-deliverables into a single master scope hides the per-sub-deliverable detail that Step-2 SIM consultation needs.

### B67 pre-calibration-window foundation work (silent observability gaps + cold-start data corruption)
- **Reported by**: Kyle review 2026-04-29 of the live ablation dashboard. Multiple gaps surfaced — replay job not actually running (counter stuck at 0), per-input attribution missing on the macro modifier, modifier + phase + regime confidence not visible on trade records, BTC/ETH OI weighting hardcoded, fallback patterns left over from B67.1's first ship. Plus deeper finding: phase=EARLY universally + modifier=1.0 universally across today's 16 closed trades, traced to cold-start artifacts from frequent PM2 restarts (8 deploys in a few hours wiped both in-memory stores each time).
- **Resolved by**: 7 commits between PM2 #106 and PM2 #113 on 2026-04-29, all on migration/aws-supabase. Each fix shipped autonomously per Kyle "go ahead" + DM-back protocol while Kyle was in a separate session.
- **Per-input ablation split** (`ed9a1a08`): single `b67_1_macro_modifier` row replaced with three per-input rows (`b67_1_btc_dominance` / `b67_1_funding_rates` / `b67_1_mcap_momentum`), each independently attributable. `b67_2_phase_dimension` renamed `b67_2_phase_preference`. `buildB67_1Alternate` (singular) replaced with `buildB67_1Alternates` (array of 3). New `MarketContextEngine.getCurrentMacroConfig()` accessor for ablation hooks to recompute counterfactuals.
- **Final fallback removal** (`cab55804`): per Kyle "all fallbacks deleted" — removed every silent-substitution pattern. 7 `??` config-read fallbacks → throw with explicit missing-key list. `readConst<T>(name, fallback)` → `readConstStrict<T>(name)`. `pollIntervalSec` default removed. `calculatePairRegime(macroModifier=1.0)` default arg removed (parameter required; all callers updated). `?? 1.0` at MCE consumer site → throws on cold-start race. `b67_1_enabled` shadow flag removed entirely; `MacroContext.modifier` non-nullable. BTC/ETH 0.6/0.4 funding weighting promoted from hardcode to `module_constants`. `?? 0` z-score result fields → NaN (so downstream can distinguish "computed zero" from "couldn't compute"). Cold-start warmup fallback (modifier=1.0 + fallbackActive=true when rolling baseline below 48 samples) stays — explicit runtime state with telemetry.
- **B67.3 activation** (`c1b314ad` + DB UPDATE): `pair_id_hash` trade-open persistence wired into both active-trading and VTS paths (single `assignCohortHash` source). `b67_3_enabled=true` flipped via SQL UPDATE on staging. Per-underlying cap actively gating cohort-0 signals.
- **B67.2.1 trade record observability** (`141ec3c3` + `41abd541` + `575dbca4`): originally deferred to B67.5; pulled forward per master plan §0.11.D. Schema migration adds 6 nullable columns to `paper_sim_trades` (regime_confidence_raw, macro_modifier_value, phase, phase_age_seconds, strategy_phase_weight, regime_confidence_modulated). Active-trading path captures via `paper-execution-engine.ts`; VTS path via `OpenVirtualTrade` + `persistRealPriceTrade`. UI: regime label + confidence number + phase badge (EARLY blue / PRIME emerald / LATE amber) all in SAME column per Kyle directive. CSV exports auto-include via Object.keys.
- **Replay logic + cron** (`3d1a1e7f` + `5e1031a6` + `33df2380`): `replay-ablation.ts` actual outcome lookup wired (was stubbed). VTS JSONL reader indexes 14d of closed trades, classifies via `classifyTradeOutcome(netPnl)`. Real bug found mid-implementation: ablation rows store `vts_trade_id = signal.id` (`vsig_p10_*`) but JSONL `trade.signal.id` was a NEW random `vs_*` id created inside `persistRealPriceTrade` — different formats, never matched. Fixed by threading original signal id through as `originalSignalId` field. Cron scheduled at 04:00 UTC nightly in root crontab.
- **Persistence + dashboard cleanup** (`8f417ca5`): investigation root-caused phase=EARLY + modifier=1.0 to in-memory stores being reset on every PM2 restart. `regime-phase.ts` and `external-macro-feed.ts` both now persist to `/tmp/*.json` files (pattern matches `trailing-exit-controller`'s state file). Phase store: 24h hard-expiry on entries; saves on regime transitions + ~2% of stable ticks. Macro feed: `restoreFeedState` on init; `persistFeedState` after every successful poll. Aggregator SQL also filters out legacy `b67_1_macro_modifier` + `b67_2_phase_dimension` rows from dashboard (preserved in DB for forensics).
- **Confidence saturation finding** (resolved by B67.3.5 below): pre-existing B62 design issue surfaced by investigation. TFS branch in `market-regime.ts:177-184` saturated at 0.95 INPUT for any pair with positive momentum + |DBS| ≥ 0.30. Resolved 2026-04-29 in B67.3.5; HVU/RBS/IE/ST branches still on original step-function (deferred per RUNNING_ISSUES #40).
- **Lesson logged**: in-memory stores that drive operationally-significant metrics (regime age, z-score baselines) MUST persist to disk. The pattern was already in the codebase (`trailing-exit-controller`'s state file) and was implicitly approved when B67.2's `regimePhaseStore` shipped without persistence on the assumption that PM2 restarts are infrequent. That assumption broke during a heavy-deploy day. Default rule going forward: any singleton store that accumulates state-over-time must persist on every meaningful update.

### B73 Exit-Strategy Ablation Framework — observation only (data layer)
- **Reported by**: Kyle 2026-04-29 review of 7d closed-trades CSV. Pattern: 509 BREAK_EVEN_STOP (44%) vs only 22 take-profit hits (2%); long winning streaks (20-30 TPs in a row historically) gone, replaced by BE-stop streaks (longest 32). Hypothesis: BE-stop is converting what would have been TPs into break-evens — price retraces to BE due to volatility, gets stopped out, then climbs back to target. Counterfactual analysis on n=87 BE_STOP trades with `originalStopPrice` populated (Kraken OHLC walk-forward, 8h window): **18.4% would have hit TP first (avg +9%), 28.7% would have hit original SL first (avg −2%), 52.9% chopped sideways → net +1.18% per trade vs ~0% with BE-stop**. n=87 too small to act on alone.
- **Resolved by**: B73 multi-week observation framework (commit `a747b646`, PM2 #115, 2026-04-29). Build the framework, accumulate data over weeks, then decide. Workflow Steps 1/2/4 Langston-approved cc-inbox #861/#862/#863.
- **Architecture** (parallel to B67.0):
  - New `exit_strategy_alternates` table (12 rows per closed trade)
  - New `exit-strategy-replay.ts` (12 variant evaluators) — BE A-F (current/ATR-padded/higher-trigger/trailing-instead/vol-conditional/no-BE), Trail G-J (current/tighter/looser/no-trail), Combined K-L (no-BE-no-trail / BE+pad-and-looser-trail)
  - New `exit-strategy-replay-service.ts` (orchestrator) — async fire-and-forget, OHLC fetch, bulk-insert, error-swallowing logging
  - 13 module_constants in new `exit_strategy_replay` module
  - Hook in `vts-service.persistRealPriceTrade` — VTS only (paper-execution-engine intentionally NOT wired per Kyle directive: B67-style symmetry, paper hook unnecessary while active trading OFF)
- **Selection criterion (pre-registered)**: Sharpe-like `(mean_variant - mean_baseline) / std(variant - baseline) × sqrt(n)` per Langston cc-inbox #858. n=200 total + n=50 per regime minimum.
- **Variant A baseline isolation**: anchors on `b73_baseline_*` snapshot constants, NOT live `trailing_exit`. Insulates multi-week observation from TEC tuning that would otherwise drift the baseline.
- **Replay precision**: 1-min OHLC. Convention: low ≤ level (BUY) or high ≥ level (SELL) → triggered. Conservative; matches real-stop semantics. Trailing variants use simplified state machine (peak + level + ATR multiplier); moonbag/ladder replay deferred to v2.
- **Same-day follow-ups all shipped tonight**:
  - **API endpoint + UI panel** (`a4bd0e6c`, PM2 #116): `GET /api/analytics/exit-strategy-ablation?window=<>&regime=<>`. New `ExitStrategyAblationSection` rendered under Analytics → Drift Dashboard tab alongside DriftDashboardSection + AblationComparisonSection. Variants sorted by Δ vs A baseline (descending). Sharpe color-coded. Per-regime dropdown filter. READY/ACCUMULATING badge.
  - **Unit tests** (`49c711d2` + `f53b9d60`): 12 variants + state machine + edge cases. CI run `25136181772` Test Suite/Build/Docker green. 3 initial float-precision assertion failures fixed in `f53b9d60` (test fixtures only — implementation unchanged).
- **v2 deferrals (still open)**: real ATR plumbing through trade record, `b73_variant_l_target_lock_r` module_constant, `gap_bar=true` metadata flag.
- **Lessons logged**:
  1. **Observation-mode framework should be research-mode-time-boxed.** B73 is built for multi-week observation → variant selection → either modularize (Phase 21.4 post-launch) or just tune live TEC. Forward-compat hooks to inactive paths are speculative complexity — drop them.
  2. **Snapshot baseline isolation is critical for multi-week comparative observation.** If Variant A reads live config, paired-diff Sharpe becomes invalid the moment config tunes. Snapshot the baseline at deploy time in dedicated `b73_baseline_*` keys.
  3. **The B67.0 ablation framework's pre-trade hook in signal-orchestrator already provides forward-compat for active trading without a paper-execution-engine touch** — paper-execution-engine just executes signals that already have ablation rows. Same logic applies to B73: VTS hook is sufficient because paper close path won't fire while active trading is OFF.
  4. **Float-precision assertion lesson**: when computing P&L percentages via division (`exit/entry - 1`), JS double arithmetic produces values like `-2.0000000000000018`. Assertions using `.toBe(-2)` fail; use `.toBeCloseTo(-2, 4)` for any computed numeric. Same convention should be applied to B67.x test files (verified by spot-check).

### B67.3.5 Pre-Window Hardening — phase backfill from OHLC + TFS branch desaturation
- **Reported by**: master plan §0.12.B Items 1+2 — two open discussion items surfaced 2026-04-29 evening. Item 1: `regimePhaseStore.tick()` records `enteredAt = now` on first observation, so cold pairs read EARLY even when they've been in TFS for hours. Persistence (shipped earlier 2026-04-29 in `8f417ca5`) fixed PM2-restart wipe but not the cold-pair problem. Item 2: TFS branch saturation at 0.95 INPUT documented above — 12/16 closed trades clustered at conf=1.0 makes the calibration check meaningless. Both items discussed with Langston post-compact (cc-inbox #850) — agreed on Modified B sequencing: fix both before B67.4 cheap-tier ships, because shipping B67.4 outcome feedback on a saturated/wrong-phase signal makes the feedback loop a no-op AND wastes the 14d calibration window on uninformative data.
- **Resolved by**: B67.3.5 sub-batch (commits `49209eb4` initial + `d97d47d7` CI fixes, 2026-04-29 PM2 #114). Single coordinated batch through full 11-step workflow: scope cc-inbox #851 → pre-audit + impl plan cc-inbox #852 → 10-file diff (807 lines) cc-inbox #853 → push → CI fix → migration → deploy → verification cc-inbox #854.
- **Phase backfill from OHLC history** (`server/core/metrics/regime-phase.ts`): new `backfillFromHistory` method walks 12 backward 60-min OHLC windows running `calculatePairRegime` to find the actual regime entry boundary. First-observation only (regime transitions handled by normal `tick()` flow). Uses CURRENT DBS as approximation per Langston — vol/momentum/ADX carry most of the classification signal so the regime LABEL is robust. New `BackfillContext` interface; `tick()` 4th param optional so backwards-compatible with existing 3-arg callers (3 unit-test sites).
- **TFS branch desaturation** (`server/core/metrics/market-regime.ts:177-184`): step-function replaced with continuous mapping `confidence = min + (max - min) × (momentum_factor × dbs_strength × vol_inverse)`. Multiplicative (not weighted-sum) — semantic match for "trend-friendly STABLE" = all three should align. Output range [0.50, 0.90] via 5 module_constants in `regime_classifier` module: `b67_3_5_tfs_desat_min/max/momentum_scale/volatility_scale/dbs_scale`. Recalibrate via DB UPDATE post-deploy; no code redeploy. New `RegimeConfig` type required as 4th param on `calculatePairRegime` (matches B67.1 `macroModifier` pattern). `DEFAULT_REGIME_CONFIG` exported for advisory paths (diagnostic + 2 unit tests updated).
- **MCE wiring** (`server/services/market-context-engine.ts`): 5 new constants resolved alongside macro/phase boundaries with hard-fail on missing keys. `regimeConfig` field cleared on stop. New `getCurrentRegimeConfig()` accessor. Threaded as 4th param into `calculatePairRegime` AND as `BackfillContext` into `regimePhaseStore.tick`.
- **Verification (Step-7 first-pass)**: PM2 #114 online, refreshMacroContext completed (would throw with explicit "missing module_constants in regime_classifier" otherwise — proves all 5 constants resolved). First diversified macro modifier observed = 0.85 (clamped to min) with real z-scores: BTC -0.79, funding +1.90 (very crowded longs), mcap +0.08. Macro feed rolling windows survived restart (btc:78, fund:96, mcap:77 samples — pre-restart accumulation preserved). New unit tests: `b67-3-5-tfs-desat.test.ts` (6 cases) + augmented `b67-2-phase-dimension.test.ts` (5 backfill scenarios). Initial CI failed on 4 issues all caught by tests + integrity check (timestamp generation in test fixtures, `computeMomentum` lookback semantics in test fixtures, hardcoded `'TREND_FRIENDLY_STABLE'` string in MCE — fixed in `d97d47d7`).
- **Deferred verification** (~24h post-deploy): backfill log lines on cold pairs entering universe; TFS confidence raw distribution shift (target P10≤0.55, P50∈[0.60,0.80], P90≥0.80); phase distribution mix shift away from universal EARLY.
- **Out of scope (deferred)**: HVU / RBS / IE / ST branch desaturation. TFS alone covers ~55-60% of pairs (the dominant regime, immediate calibration bottleneck). Logged as `RUNNING_ISSUES.md` #40 for post-window classifier-formula tuning batch — defers until B67 calibration window completes and we have evidence on whether TFS desat actually improves confidence-bucket WR signal.
- **Lessons logged**: (1) Test fixtures with synthetic OHLC must respect `computeMomentum`'s 30-candle lookback — building a 60-candle series with end-to-end target momentum X gives the LAST-30 only ~X/2 momentum. Use `count: 30` OR scale endPrice up. (2) `regime_mapping_integrity` test catches hardcoded regime strings — even DB resolution keys need to import from canonical config, not literal strings. (3) Test OHLC timestamps must respect the test's clock — generate them as `nowMs - (count-1-i) × spacing` so the latest candle is at `now`, going backward. (4) Multiplicative continuous mapping produces wider distribution spread than weighted-sum (central limit theorem effect) — the right choice for confidence formulas where we need calibration-quality variance.

### B67.4 / B68.4 / B68.5 / B68.2 / B68.3 / B67.5-prep / B68.1 — 7-modulator confidence chain buildout (CLOSED 2026-05-03)

- **Series scope**: see `BATCH_CATALOG.md` entries for B67.4 (cheap-tier bundle 2026-05-01), B68.2 (volume regime 2026-05-02), B68.3 (pair correlation 2026-05-02), B67.5-prep (post-composition floor 2026-05-03), and **B68.1 (multi-TF agreement 2026-05-03 — the final B68.x modulator)**. Each is its own commit + scope/pre-audit/test artifacts, all approved by Langston via the standard 11-step workflow (cc-inbox #856/#857/#879 / #880-882 / #883-885 / #886 / #887-889).
- **Final chain (post-B68.1)**: `raw × macro × phase × freshness × outcome × volume_regime × pair_correlation × multi_tf_agreement → clamp [0.45, 1.0]`. Active trading off → chain is observational pre-B67.5; calibration windows attribute per-factor independently per master plan §0.11.C step 5.
- **Lessons logged across the series:**
  1. **Decorative-then-operational pattern works.** Shipping each chain modulator LIVE with an ablation row but no consumer gate (active trading off) collected real-time evidence without behavioral risk. Calibration windows attribute per-factor independently — each batch's mini-window evaluates only its own factor's rows. Pre-B67.5 the chain is observational; post-B67.5 it becomes operational.
  2. **MCE multi-group orchestrator scales cleanly.** B67.4 introduced the 6-method orchestrator with first-refresh-Promise.all + per-group-try/catch + assembleRegimeConfig pattern. Subsequent additions (B68.2 → 7 → B68.3 → 8 → B68.1 → 9) followed the same pattern with zero refactor to the orchestrator core. Hot path: each new factor takes ~80 lines of MCE diff (sub-method + state field + accessor + register in 2 arrays).
  3. **Pure-function chain factors with divide-out counterfactual.** Every chain modulator is a pure function over OHLC + state with a `buildBxx_xAlternate()` helper that produces `confidence_without = real / factor`. Same approximation across all 7 modulators; same documented limitation at clamp boundaries (Langston OBS-2 cc-inbox #879).
  4. **Family map placement choice (B68.1).** When introducing a new abstraction colocated with one consumer, place it LOCAL to that module rather than mutating shared canonical configs. B68.1's regime-family map (5 regimes → 4 families) lives in `multi-tf-agreement.ts` — keeps blast radius LOW and `canonical-regime-strategy-map.ts` untouched. Per Langston cc-inbox #888 D.1.
  5. **Higher-TF source pivot (B68.1).** Master plan §0.11.B estimated B68.1 at ~2 weeks because it characterized the higher-TF pipeline as "new infrastructure". Actual ship was ~1 day — the existing `ohlcCache` keys on `${symbol}_${interval}` so adding a 240-min cache key per pair is one line. Kraken serves 4h natively (intervals 1/5/15/30/60/240/1440/10080/21600 all supported). **Lesson:** re-examine architectural assumptions as nearby infrastructure matures — what was "real new infrastructure" at planning time may have become "one-line addition" once an adjacent component (B74 OHLC pipeline + B18 OHLC cache) exists.
  6. **OHLC-shape map duplication accumulating** (RUNNING_ISSUES #52). The Kraken raw-candle → OHLCData mapping (`parseFloat(c.open || c[1])` etc.) now appears in 4 hook sites across the chain factors. Tactical refactor candidate; deferred per Langston cc-inbox #888 D.2 to a small dedicated cleanup batch. Field-tested duplication is acceptable in the short term.
  7. **Floor engagement is signal, not bug.** B67.5-prep raised the post-composition floor from 0.40 to 0.45 `module_constant` in anticipation of B68.1's compound. Worst-case 7-modulator stack ≈ 0.419 below the new floor; floor engages on a meaningful fraction of trades. Closed Trades UI shows `conf 0.450` widely — observational evidence that the chain is compounding. Floor-binding rows visible in ablation metadata via `confidence_with_factor` (clamped) vs `confidence_without_factor` (pre-clamp). Calibration analysis can quantify the binding rate.
  8. **Local TS check unrunnable on GDrive** — npm install hits EBADF on tar writes (Windows GDrive virtual filesystem can't keep up with tar throughput). All 5 chain-factor batches relied on CI as the verification gate. Workflow fix candidate: symlink `node_modules` to local SSD off GDrive. CI proved sufficient — 664 TS errors before each batch = 664 errors after = legacy baseline (RUNNING_ISSUES #39, Phase 16 cleanup target); zero new errors introduced by any of the 5 chain-factor batches.
  9. **Visual UI verification via Claude-in-Chrome** is non-optional on UI-touching batches (Kyle directive 2026-05-03 reinforced). Even when the new factor doesn't have its own dedicated UI panel, verifying that existing panels (Factor Ablation Comparison, Closed Trades) auto-extend to surface the new factor type catches subtle wiring bugs. B68.1 visual verification confirmed the factor surfaces in `Factor Ablation Comparison` row 7/10 with correct Total/Replayed/Pending counts within 1h of deploy.


### B67.4 / B68.4 / B68.5 / B68.2 / B68.3 / B67.5-prep — chain modulator series buildout
- See **BATCH_CATALOG.md** entries for B67.4 (cheap-tier bundle 2026-05-01), B68.2 (volume regime 2026-05-02), B68.3 (pair correlation 2026-05-02), B67.5-prep (post-composition floor 2026-05-03), and B68.1 (multi-TF agreement 2026-05-03 — final). Each is its own commit with its own scope/pre-audit/test artifact set, all approved by Langston via the standard 11-step workflow with cc-inbox confirmations. The catalog entries already document each batch comprehensively; the series collectively buildout the 7-modulator confidence chain that will be wired into 7 consumers in B67.5.
- **Lessons logged across the series:**
  1. **Decorative-then-operational pattern works.** Shipping each chain modulator LIVE with an ablation row but no consumer gate (active trading off) collected real-time evidence without behavioral risk. Calibration windows attribute per-factor independently — each batch's mini-window evaluates only its own factor's rows. Pre-B67.5 the chain is observational; post-B67.5 it becomes operational.
  2. **MCE multi-group orchestrator scales cleanly.** B67.4 introduced the 6-method orchestrator with first-refresh-Promise.all + per-group-try/catch + assembleRegimeConfig pattern. Subsequent additions (B68.2 → 7 methods → B68.3 → 8 methods → B68.1 → 9 methods) followed the same pattern with zero refactor to the orchestrator core. Hot path: each new factor takes ~80 lines of MCE diff (sub-method + state field + accessor + register in 2 arrays).
  3. **Pure-function chain factors with divide-out counterfactual.** Every chain modulator is a pure function over OHLC + state with a  helper that produces . Same approximation across all 7 modulators; same documented limitation at clamp boundaries (Langston OBS-2 cc-inbox #879).
  4. **Family map placement choice (B68.1).** When introducing a new abstraction colocated with one consumer, place it LOCAL to that module rather than mutating shared canonical configs. B68.1's regime-family map (5 regimes → 4 families) lives in `multi-tf-agreement.ts` — keeps blast radius LOW and `canonical-regime-strategy-map.ts` untouched. Per Langston cc-inbox #888 D.1.
  5. **Higher-TF source pivot (B68.1).** Master plan §0.11.B estimated B68.1 at ~2 weeks because it characterized the higher-TF pipeline as "new infrastructure". Actual ship was ~1 day — the existing `ohlcCache` keys on `\_\` so adding a 240-min cache key per pair is one line. Kraken serves 4h natively (intervals 1/5/15/30/60/240/1440/10080/21600 all supported). Lesson: re-examine architectural assumptions as nearby infrastructure matures — what was 'real new infrastructure' at planning time may have become 'one-line addition' once an adjacent component (B74 OHLC pipeline + B18 OHLC cache) exists.
  6. **OHLC-shape map duplication accumulating (RUNNING_ISSUES #52).** The Kraken raw-candle → OHLCData mapping (`parseFloat(c.open || c[1])` etc.) now appears in 4 hook sites across the chain factors. Tactical refactor candidate; deferred per Langston cc-inbox #888 D.2 to a small dedicated cleanup batch. Field-tested duplication is acceptable in the short term.
  7. **Floor engagement is signal, not bug.** B67.5-prep raised the post-composition floor from 0.40 to 0.45 `module_constant` in anticipation of B68.1's compound. Worst-case 7-modulator stack ≈ 0.419 below the new floor; floor engages on a meaningful fraction of trades. Closed Trades UI shows `conf 0.450` widely — observational evidence that the chain is compounding. Floor-binding rows are visible in ablation metadata via `confidence_with_factor` (clamped) vs `confidence_without_factor` (pre-clamp). Calibration analysis can quantify the binding rate.

### B69.1 / B69.2 / B69.3 / B73.3 — bug fix series 2026-05-04

Triggered by Kyle review of the open + closed simulated trades exports + screenshots of the Factor Calibration and Exit Strategy Ablation panels on 2026-05-04. Four distinct bugs surfaced and fixed same-day.

- **BUG-2026-05-04-A: AssetClassBadge missing from canonical paper-sim views.** B69 added the badge component but only wired it into trade-history + active-trades, missing the Open Trades and Closed Trades (7d) tabs on the Machine Learning page where Kyle actually reviews trades. Fixed in B69.1 — symbol cell refactored to stack badge below the pair (per Kyle preference vs. separate column). `getOpenVirtualTradesForML` + `getClosedVTSTradesFromLogs` populate `assetClass: 'crypto_spot'` (VTS handles crypto only today). PM2 #138.

- **BUG-2026-05-04-B: b67_2 phase preference 100% shift=0 in calibration table.** Looked like the factor was a no-op. Investigation showed factor was firing correctly on every trade — the calibration aggregator's `shift = realConfidence - altConfidence` collapsed to zero by construction because both fields were sourced from the same `predictiveConfidence ?? 0.5` value (`real_decision.confidence` set by emitter; `alternateDecision.confidence` set to `_baseConf` which equals `predictiveConfidence` for b67_2 since b67_2 is the FIRST factor in the chain). Fix: change b67_2 alt.confidence to the with-factor (modulated) value. **Deeper finding:** the framework's "shift" metric isn't actually measuring per-factor effect for ANY modulator — `real_decision.confidence` is the raw classifier value, not chain-final. Multiplicative factors LOOK like they work because compounding produces non-zero shifts, but magnitude isn't a clean per-factor measurement. Predictive-lift column (REAL spread - ALT spread) is the trustworthy decision-grade metric. Proper framework refactor queued for a future cleanup batch. PM2 #139.

- **BUG-2026-05-04-C: F/J/K exit ablation variants showing identical results.** Kyle correctly suspected this when F (no_BE_stop), J (no_trailing), and K (no_BE_no_trail) all reported +0.315 mean P&L / Sharpe 1.84 / 69.5% WR. Investigation: all three variants routed through `replayPureSlTp(inputs, id, params)`. The function destructured `params.allowBe` and `params.trailMultiplier` but never used them — the function only checked target hit / original SL / timeout. F and J ran K's pure-SL/TP semantic regardless of intent. Net effect: prior "remove BE-stop adds 0.090 P&L" finding actually measured K (remove BOTH BE + trailing). Fix: two new dedicated simulators. `replayNoBeWithTrailingTake` (F) walks bars with no BE-lock pre-target; on target hit switches to trailing-after-target moonbag mode. `replayBeOnlyNoTrail` (J) walks bars with BE-lock at +1×ATR; on target hit exits at target with no trailing. K's `replayPureSlTp` unchanged. PM2 #140. **Earlier "turn off BE-stop" recommendation walked back** pending 7-10 days of clean differentiated F/J data.

- **BUG-2026-05-04-D: CoinGecko HTTP 429 rate limiting suppressing ~50% of B67.1 macro feed polls.** PM2 logs showed alternating `[B67.1][feed] CoinGecko HTTP 429` followed by `partial snapshot — btc_dom=NA mcap_mom=NA funding=...` for stretches of 70+ minutes. Both BTC dominance and mcap momentum come from the same `/global` endpoint; funding rate (Binance premiumIndex, NOT CoinGecko despite older comments) was unaffected. Root cause: shared-IP unauthenticated rate limit pool. Fix: `COINGECKO_API_KEY` env var, sent as `x-cg-demo-api-key` header (Demo key per-key 30 calls/min vs shared-IP). Single 3s backoff retry on 429. 401/403 logs as `[B67.1][feed][AUTH]`. Key added to staging `.env` directly, NOT committed. PM2 #141.

## B70 — Unified Data Archiving (2026-05-04 → 2026-05-05, PM2 #142 → #145)

- **B70 SHIPPED 2026-05-04 → 2026-05-05.** Unified data-capture infrastructure across VTS / paper-sim / live execution paths. 5 partitioned archive tables (`pair_scan_archive` ~255k/day, `signal_eval_archive` admitted-only in v1, `exit_decision_archive` per-trade-close, `macro_feed_archive` 60s, `b62_retroactive_labels` one-shot) + 48 monthly partitions + 11 module_constants in new `data_archive` module + new `server/services/data-archive/` service module (6 files) + bootstrap + Drift Dashboard `DataArchiveSection` panel + retention/partition crons. Mode-agnostic capture per Kyle directive 2026-05-04 (scope §M): every row carries `mode` (system-state from `getCurrentMode()` accessor) + `source` (per-hook origin, hardcoded). Two-column discriminator decouples system mode from hook origin (Langston cc-inbox #896). When system flips VTS→paper-sim→live no archiver code change needed. Hot-path hooks all try/catch wrapped + bounded-queue drop-OLDEST. Retention sweep cron 02:00 UTC drops monthly partitions older than 90d. Verified end-to-end: 196 pair_scan rows + 17+ macro rows accumulating with live regime/DBS values. **Deferred to B70.1** (RUNNING_ISSUES #56-#59): reject-stage signal_eval capture, B62 retroactive labels runner, Parquet exporter, unit tests.

### B70.2 silent-failure bugs (caught 2026-05-05 via PM2 log scan)

- **BUG-2026-05-05-A: B70 admit-hook ReferenceError on `rawSignal`** (commit `5617ad72` introduced, `03d704cb` fixed). The admit-archive hook in `vts-runner.ts:generatePhase10Signal` referenced `rawSignal?.metadata?.rankingScore` but `rawSignal` is a parameter to `signal-orchestrator.ts`, not vts-runner. ReferenceError caught by try/catch wrapper, every admit silently failed. Net effect: `signal_eval_archive` admitted-row count was 0 from B70 deploy 2026-05-04 until fix 2026-05-05 ~12:24 UTC. Lesson: cross-file hook copy-paste introduces scope errors that try/catch hides.

- **BUG-2026-05-05-B: B70 exit-hook TypeError on `trade.openedAt.getTime()`** (introduced in B70 main `6b63b6bd`, fixed in `03d704cb`). The exit-archive hook called `.getTime()` on `trade.openedAt` but the `OpenVirtualTrade` interface declares it as `number` (ms epoch). TypeError caught by try/catch, every exit silently failed. Net effect: `exit_decision_archive` had 0 rows despite 41+ trades closing. Wrapped to handle both number and Date defensively.

- **BUG-2026-05-05-C: B70 admit-hook ReferenceError on `_modulatedConfChain`** (introduced in B70.2 expansion, surfaced after BUG-A fix, fixed in `f799f701`). The variable was declared with `let` inside a bare `{ ... }` block at lines ~1447-1724 in vts-runner.ts (the B67.x ablation factor builder block). The admit hook is OUTSIDE that block. Replaced with read from `openVirtualTrades.get(tradeId)?.regimeConfidenceModulated` which IS function-scoped.

- **BUG-2026-05-05-D: B70 exit-hook ReferenceError on `finalTradeMode`** (introduced in B70 main, fixed in `0423a2be`). Const-declared inside the persist-trade try block at line ~2159, so the B70 exit hook below couldn't reference it. Hoisted out to closePosition function scope. Trailing snapshot read is cheap (in-memory map).

**Net diagnostic pattern:** all four were silent failures hidden by the hot-path try/catch wrappers. The wrappers prevented host-path crashes (correct design) but masked the data-capture failures. Detected only when Kyle questioned why `signal_eval_archive admitted` and `exit_decision_archive` were empty — log scan immediately surfaced the errors. Mitigation for future hook batches: include a synthetic-event integration test that asserts row writes through the full pipeline, not just the queue side.

### B70.3 — Path B momentum gate swap (2026-05-05, commit `decf5b80`)

7-day calibration data showed `b68_5_path_b_sustainability` at -2.0pp predictive lift + -0.4480 avg shift — the slope-derivative gate was binary-suppressing winning signals (consolidation pauses produce temporarily negative slope while the underlying trend is healthy). Replaced with momentum-based gate per Langston cc-inbox #901 review:

- **Old:** `(absDbs >= 0.30 && dbsSlope >= regimeConfig.b68_5DbsSlopeMin)` — slope-derivative gate
- **New:** `(absDbs >= 0.30 && mom > regimeConfig.b68_5PathBMomentumMin)` — forward-looking momentum gate
- New module_constant `b68_5_path_b_momentum_min = 0.002` (regime=TFS scope) tunable via DB
- Old `b68_5_dbs_slope_min` retained for back-compat with ablation counterfactual reader; runtime classifier reads new constant
- B68.5 ablation counterfactual builder updated to disable momentum gate (was disabling slope gate); emits new metadata fields `momentum`, `momentum_min_threshold`, `gate_kind`
- liquidity_trap iteration-loop exclusion: new `UNIVERSALLY_DISABLED_STRATEGIES` Set in vts-runner skips at top of strategy iteration BEFORE `detect()` is called; same exclusion in signal-orchestrator. Eliminates ~7,342 wasted evaluations/24h that returned `strategy_disabled_bearish`.

### B70.3b — Post-composition floor dropped 0.45 → 0.20 (2026-05-05, no code — module_constants UPDATE)

Per Kyle directive + Langston cc-inbox #902. Pre-B70.3b every open trade showed `regimeConfidenceModulated = 0.45` (floor binding 100%) — true compressed chain output hidden by the clamp. Since no consumer reads the value until B67.5 wires it, lowering the floor is pure visibility (zero behavioral impact). 0.20 well below the worst-case compound `0.85⁴ × 0.92² × 0.95 ≈ 0.42` so any realistic chain output now lands in visible range. Floor will be raised back to an empirically-correct value during B67.5 consumer wiring once we have real distribution data.

### B70 lessons (carried forward)

1. **Drizzle `db.execute(sql.raw(BEGIN; ...; COMMIT))` only returns the last result set.** Postgres-js exposes only the trailing COMMIT row (empty), so the SELECT in the middle is lost. Hotfix `3796ae56` dropped the wrapper. For B-tree partition counts on small tables there's no statement-timeout need; revisit if Supabase ever lags.
2. **Hot-path hooks must be `setImmediate`-deferred, not just try/catch.** MCE 60s cycle hits ~177 pairs synchronously; even module-resolution latency on a dynamic import would compound. Pair-scan hook uses `setImmediate(() => { (async () => { ... })() })` to push the import + enqueue completely off the hot path.
3. **Two-column discriminator beats single mode column.** When Langston suggested adding `source` alongside `mode` (cc-inbox #896), I almost shipped with mode-only. The split between "what was the system doing" (mode) vs "which code path produced this row" (source) only diverges in edge cases (VTS-always-on alongside paper-sim) but those edge cases are exactly the lifecycle-transition points the archive needs to support cleanly.
4. **Mode-agnostic capture as a first-class design property changed the implementation order.** Original scope had a `mode` column on `exit_decision_archive` only; Kyle directive 2026-05-04 promoted it to all 5 tables and required hooks in all three execution paths (signal-orchestrator live + paper-execution-engine paper-sim + vts-runner vts), even paths currently dormant. This added zero engineering cost (hooks live on existing code paths; they fire when the path activates) but adds enormous lifecycle continuity for the archive.
5. **Defer-don't-block on capture surface expansion.** Reject-stage signal_eval rows would have doubled the diff size for B70 main. Splitting into B70 (architecture + admitted-path) and B70.1 (reject-stage capture) per Langston cc-inbox #898 made each diff individually reviewable. The architecture lives or dies on whether the layer is correct, not on whether every reject site is hooked yet.

**Lessons logged:**
1. **"Three variants reporting identical numbers" is a smell.** Always sanity-check ablation comparisons that show byte-identical outputs across distinct definitions.
2. **Calibration aggregator's "shift" metric is structurally broken for any factor whose without-counterfactual equals the raw classifier value.** Primarily b67_2 (first in chain). Other factors escape via compounding.
3. **External feed reliability matters as much as feed correctness.** Half the B67.4 calibration window was getting NAs for 2 of 3 macro inputs. Authentication should be the default for any third-party API integration going forward.
4. **Same-day fix discipline.** Four bugs surfaced from one review session, all fixed and deployed within 6 hours. The B73 + B67.0 ablation frameworks are working — surfacing real issues that hand-reviewing 622 closed trades would never catch.
5. **Recommendation walk-backs are a feature, not a failure.** The "turn off BE-stop" call was based on an apparent F/J/K convergence that turned out to be a bug. Caught before any operational change.

