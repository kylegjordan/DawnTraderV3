# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language; §6+§8 Langston comms; §6.5 Step 3 verbatim Telegram relay).
2. Read this file.
3. Read `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` — locked plan (rev 2); held until crypto B-NEW-33 backtest + B67.5 close.
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for broader context.
5. Kyle messages me here in Claude Desktop. Kyle↔Langston visibility via `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
6. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; use technical jargon in Kyle-facing summaries (plain language only).

---

## CURRENT STATE — 2026-05-15 (B-NEW-33 + B-NEW-34 CLOSED, B67.5 BLOCKED on B-NEW-36)

**B-NEW-33 — Crypto factor calibration backtest tool + nightly cron unblock — CLOSED.** Commit `892da2f27` + parity check `58e2011dd`. Live drain on staging: 33,049 pending rows processed; 13,830 matched; 19,219 marked `unreplayable_real_rejected`. Post-drain pending=0. **All 10 crypto factors verdict INCONCLUSIVE.** Critical Langston Step 8 finding: tertile WRs non-monotonic across all 10 factors (low 17% → mid 26% → high 21%) — single upstream artifact contaminating every calibration. **Kyle Option 1 LOCKED 2026-05-15 evening: HOLD Langston's 7pp + p<0.05 gate.** Parity check vs May 5/6 screenshot confirmed methodology sound (confidence-shift values identical e.g. b68_5: 0.4457→0.4456); divergence is at verdict-labeling LAYER not calculation (screenshot used ~+3pp floor as "DECISION-GRADE WIN", my CLI uses Langston's 7pp gate). Operational discipline of not shipping potential noise into consumer chain takes precedence. **B67.5 BLOCKED on B-NEW-36** diagnostic spike (tertile non-monotonicity + 58% unmatched-rate decomposition). b68_5_path_b_sustainability flagged for ~0.37 calibration multiplier in B67.5 (NOT DROP) — only factor doing real work (mean |Δconf|=0.43), but only after B-NEW-36 resolves upstream artifact.

**B-NEW-36 spawned** via mcp__ccd_session__spawn_task. Two scopes: (a) tertile non-monotonicity diagnostic — is it base distribution or matched-cohort selection bias? (b) unmatched-rate audit grouping 19,219 unreplayable rows by (symbol, hour-of-day, dow, signal direction, strategy).

**B-NEW-34 — xstock 60-min bar parity + 4-hour pre-warm staged + B74 dup-row workaround — CLOSED.**

Four commits on `migration/aws-supabase`:
- `756b64e49` — main implementation (10 files: aggregator + cache + scanner + eval-cycle + both filters + freshness + tests + migration SQL + xstocks-tab banner)
- `a7545d595` — hotfix 1: drizzle `WHERE symbol = ANY(${arr})` → `IN (${literal-list})` (drizzle array-binding pitfall)
- `88e34bd67` — hotfix 2: cache depth `MAX_BARS_60M=200 / MAX_BARS_240M=60` → `60 / 30` (cut source-row workload ~4×)
- `1ee3ceb27` — hotfix 3: DISTINCT ON aggregator (B74 source has 18-56× duplicate rows per (symbol,interval_begin)) + 240m warm-fetch SUSPENDED (commented out)

**Staging VERIFIED live via Claude-in-Chrome (CLAUDE.md §9.3):** xStocks tab Scanner Cycle Metrics shows LAST CYCLE DURATION=675ms (vs 25s+ pre-fix), PAIRS SCANNED=64 of 75 (vs 26 pre-deploy), 10 consecutive healthy cycles, no SCAN_TIMEOUT after PM2 #287 restart.

**Two structural insights from B-NEW-34 verification:**
1. **B74 archive write bug:** `xstock_spot_ohlc_1m` has 18-56× duplicate rows per `(symbol, interval_begin)`. The B74 WS archive emits a fresh row for every intra-minute tick rather than upserting one closed bar per minute. Empirical (AAPL/USD over 2h): 4876 rows for 103 distinct minutes; one minute had 227 distinct OHLCV tuples with $1.78 close spread. Latest `captured_at` per (symbol, interval_begin) = the correct closed bar.
2. **`last_analyze=NULL` on the partition.** The May partition (13.5M rows, 3.4GB) had never been analyzed. Manually ran ANALYZE during hotfix 3 diagnosis. Watch item for autovacuum settings on partitioned tables.

**B-NEW-35 spawned** (via mcp__ccd_session__spawn_task) for B74 source-side fix: UNIQUE constraint on (symbol, interval_begin) + cleanup migration + writer rewrite to INSERT ON CONFLICT DO UPDATE. Once B-NEW-35 lands: (i) DISTINCT ON CTE in ohlc-aggregator.ts becomes redundant and is removed; (ii) 240-min warm-fetch in scanner.ts is re-enabled.

**Governance shipped (8 docs + completion report):**
- `BATCH_CATALOG.md` — B-NEW-34 entry inserted before BATCH_82
- `PHASE_HISTORY.md` — Phase 24 EXTENDED 2 sub-batch row
- `SYSTEM_MANUAL.md` — NEW Phase 24 EXTENDED 2 section: "Bar interval — design rationale" + "B74 duplicate-row workaround" + "Cache architecture" + "Filter-floor SSOT promotion" + "Freshness gate REMOVED" subsections
- `SYSTEM_IMPACT_MAP.md` — 8 new component entries under "Recent Additions (B-NEW-34)"
- `CHANGES_AND_FIXES.md` — INFRA-2026-05-15-A architectural fact entry
- `XSTOCK_CALIBRATION_PLAN.md` — rev 2 entry: bar-interval ripples into Phase B sub-batches, cohort start resets to 2026-05-15, Phase D ORB suspended, pre-flight C debt absorbed
- `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md` line 294 — doc drift cleanup ("5-minute intervals" → "60-minute intervals")
- `client/src/components/machine-learning/xstocks-tab.tsx` — banner updated for B-NEW-34 architecture
- `B-NEW-34_COMPLETION_REPORT.md` — written; top-of-report scaffolding-vs-functional + previously-stated-vs-now blocks per CLAUDE.md §9.1/§9.2

**Pre-flight C calibration debt** (~12 indicator/threshold concerns from 60-min bar shift; 300-period Z-window meaning shifts from 5h to 12.5 days) absorbed into Phase B of XSTOCK_CALIBRATION_PLAN.md rev 2.

---

## NEXT SESSION PLAN (immediate next step after Kyle ack)

**Priority 1 — B-NEW-36 diagnostic spike** (unblocks B67.5).

Two findings from B-NEW-33 verdicts require investigation BEFORE B67.5 consumer-gate design proceeds:

1. **Tertile non-monotonicity across all 10 crypto factors.** Low ~17% → mid ~26% → high ~21% — mid-confidence wins more than high-confidence universally. Single upstream artifact, not 10 independent signals. Two hypotheses: (A) base confidence distribution has non-monotonic relationship with outcome (high-confidence routed to thinner-liquidity contexts), (B) 13,830 matched cohort is selection-biased.

2. **58% of pending rows unmatched.** Need audit grouping 19,219 `unreplayable_real_rejected` rows by (symbol, hour-of-day, day-of-week, strategy) to check for skew. If uniform → crypto reality, move on. If lopsided → matched cohort is biased and every B-NEW-33 verdict is suspect.

Build CLI tool `scripts/b-new-36-cohort-diagnostic.ts` (mirror B-NEW-33 pattern). Output Markdown report at `Claude Comms and Packages/Batch Completion/B-NEW-36_DIAGNOSTIC.md`. Full prompt captured in spawned-task chip (2026-05-15).

**Priority 2 — Re-run B-NEW-33 post-B-NEW-36.** If tertile shape resolves to monotonic post-diagnostic, several factors that look INCONCLUSIVE today might cross the 7pp gate cleanly.

**Priority 3 — Design B67.5 consumer-gate** from the re-run verdicts. b68_5 likely candidate for ~0.37 calibration multiplier (not DROP).

**Priority 4 — xStock Calibration Plan Phase 0** sequenced AFTER B67.5 ships.
- Phase 0.1 splits, 0.2 dividends, 0.3 halts (corporate actions pre-flight).
- Per Kyle directive 2026-05-15: Phase 0 does NOT start until crypto factor calibration finalization + B67.5 ship are complete.

---

## RECENT SHIPS (compressed)

**B-NEW-33 (2026-05-15, commit `892da2f27`, no PM2 restart):** Crypto factor calibration backtest tool + nightly cron unblock. New `factor-replay-core.ts` shared between cron and CLI; dual-source matcher; unmatched rows marked unreplayable. CLI drained 33,049 pending in one pass. **All 10 factors verdict INCONCLUSIVE.** Tertile non-monotonicity finding (Langston Step 8 catch) blocks B67.5 on B-NEW-36 spike.

**B-NEW-34 (2026-05-15, commits `756b64e49`→`a7545d595`→`88e34bd67`→`1ee3ceb27`, PM2 #287):** xstock scanner switched to 60-min bar parity with crypto. Local SQL rollup from `xstock_spot_ohlc_1m`. Filter floor 60→24 via module_constants SSOT. ORB disabled. Freshness gate removed. 240m warm-fetch SUSPENDED until B-NEW-35. Discovered B74 source 18-56× duplicate-row bug.

**B-NEW-32 (2026-05-15, commit `de28e4de0`, PM2 #283):** CoinGecko Pro-tier migration. Tier-configurable env var (COINGECKO_API_TIER=demo|pro). Feed restored after 3-day outage.

**xStocks diagnostic data/UI sprint CLOSED 2026-05-14:** B-NEW-31 freeze headers; B-NEW-14 max_bid_ask_spread; B-NEW-TZ timezone; B-NEW-21 freshness query 157× speedup.

**xStock Calibration Plan v2 LOCKED 2026-05-15.** Living plan at `1-system-manual/XSTOCK_CALIBRATION_PLAN.md`. Now rev 2 with B-NEW-34 bar-interval ripples. Picks up post-B-NEW-33/B67.5.

**BATCH_82 (2026-05-14, PM2 #275):** xstock_spot ablation/calibration data path repair. xStock signal-emission path still bypasses `emitAblationRecord` — Phase E.2 of calibration plan addresses.

**B83 hotfix (2026-05-14, commit `b4cde6b85`, PM2 #274):** vts-runner second for-loop ReferenceError. 24h stall; 85-trade backlog flushed.

---

## OPERATIONAL FACTS

- xstocks: 265-pair universe + 24h DB-backed trade counts via `vts_open_trades` (B79.0g-tx soft-delete with 90d retention).
- 75-pair round-robin scan rotation. 3 pinned benchmarks: SPY/QQQ/GLD.
- xstock + perp feeds archived via B74 (`xstock_*_ohlc_1m` / `xstock_*_ticker_snap`).
- **xstock scanner: 60-min bars** (B-NEW-34) via xstockOhlcCache → ohlc-aggregator SQL rollup from xstock_spot_ohlc_1m. 240-min aggregator built but warm-fetch SUSPENDED (commented in scanner.ts) until B-NEW-35.
- Strategy registration: 9 enabled for xstock_spot post-B-NEW-34 (ORB disabled; defensive_hedge already DB-disabled).
- xstock_spot BE-protect = TRUE in DB per Kyle directive (intentional).
- Active trading OFF (Phase 19 territory). VTS passive learning ON.
- TEC state persists across PM2 restarts via `/tmp/trailing-states.json`. Per-trade keyed (BATCH_80).
- `[B83-CYCLE]` log fires unconditionally per VTS exit cycle.
- DBS for xstock currently SYNTHESIZED NEUTRAL (DBS=0) — Phase A of calibration plan fixes.
- `emitAblationRecord` wiring MISSING for xStock pipeline — Phase E.2 fixes.
- `module_constants.xstock_spot.min_ohlc_history_bars = 24` (single SSOT for both global-filter + pattern-filter). `data_freshness_window_ms` row DELETED.
- Kraken: Pro account = trading tier (xStocks unlocked). NO Kraken equities REST endpoint at any tier (B79.0k verdict + 2026-05-15 re-verification).
- **B74 source quality bug:** `xstock_spot_ohlc_1m` writes 18-56× duplicate rows per (symbol, interval_begin). Aggregator DISTINCT ON workaround in place (B-NEW-34 hotfix 3). B-NEW-35 will fix source-side. Watch item: autovacuum/auto-analyze on partitioned tables (last_analyze was NULL on May partition).

---

## LANGSTON RUNTIME + COMMS — see CLAUDE.md §6 + §8

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox `/var/log/cc-bridge-inbox.jsonl`. 3-step protocol: Telegram visibility + SSH-deliver via `claude -p --permission-mode bypassPermissions` with FRESH UUID per send + verbatim Telegram relay with `**LANGSTON SPEAKING:**` prefix. File-first for prompts >3KB; scp to `/home/langston/inbox/<batch>/`.

B-NEW-34 ran R1+R2+R3+Step 4 + R4 fixes across 5 inbox files. Step 4 R4 caught 2 load-bearing TZ bugs in the aggregator SQL (date_trunc session-TZ-dependence + AT TIME ZONE 'UTC' timestamptz downcast). Both fixed pre-push.

---

## Kyle Operating Directives (active, condensed)

- **NO PATCHES** (CLAUDE.md §5 #15). Long-term sustainable solutions only.
- **Per-asset-class config is the default** for behavioral knobs.
- **Backpressure: vertical-scale, never asset-class shedding.**
- **Each new asset class gets its OWN dedicated observation UI tab.**
- **No fallbacks for DB-governed settings.**
- **Kyle messages me in Claude Desktop.** Telegram = Kyle↔Langston + CC outbound visibility only.
- **Iterate with Langston to consensus** — escalate only on deadlock / scope expansion / new directive / risk boundary. Independently evaluate his feedback; never rubber-stamp.
- **"Staging verified" means UI-navigated, not curl-checked** (CLAUDE.md §9.3).
- **Numeric deltas / scaffolding-vs-functional declarations** must be top-of-report explicit (CLAUDE.md §9.1, §9.2). B-NEW-34 completion report observes this.
- **Plain-language summaries to Kyle, every time** (CLAUDE.md §1 + §11). Reference exemplar: B-NEW-14 / B-NEW-21 / xStock plan summary / B-NEW-34 hotfix-3 summary.
- **Verify with the data, not assumption.** B-NEW-34 hotfix 3 discovered the B74 dup-row bug only because I tested actual SQL execution times instead of assuming. Always grep + DB-query + git-log + EXPLAIN before stating a regression.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` (rev 2)
4. `1-system-manual/POST_AUDIT_ROADMAP.md`
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
6. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` (calibration-dependency invariant + canonical blueprint)
