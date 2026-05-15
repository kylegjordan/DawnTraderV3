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

## CURRENT STATE — 2026-05-16 (B-NEW-39 PHASE 1 APPLIED; awaiting verification @ 1h emission window)

**🚨 ACTIVE BATCH: B-NEW-39 multi-mechanism inversion fix. Phase 1 SQL APPLIED 2026-05-15T23:07:54Z UTC.** Floor `module_constants.regime_classifier.b67_5_post_composition_floor` reverted 0.20 → 0.45 on wildcard row (1 row updated, verified via RETURNING). Cache TTL=60s, new emissions using floor=0.45 from ~23:09 UTC. Per Langston B-NEW-39 Step 1+2 APPROVE.

**IMMEDIATE NEXT ACTION:** Wait ~1-2 hours from 23:08 UTC for natural ablation-row accumulation, then re-run forensic with `--since` filter:
```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && npm run b-new-37:inversion-forensics -- --since=2026-05-15T23:08:00Z 2>&1'"
```
First check row count: ensure ≥50 matched rows per factor for any forensic signal. Decile-grade analysis (n≥150 per decile) ideally needs 1500+ per factor = several hours of emissions.

**Phase 1 completion gate (Langston Concern C — TIGHTENED):**
- Decile shape on b67_4_outcome_feedback subset = **`monotonic-up`** ONLY (`flat` triggers Phase 3, not closure)
- Phase 4 metric: % at 0.200 floor ≈ 0% (new floor is 0.45)
- Top-decile WR ≥ bottom-decile WR

**Decision branches after verification:**
- **Phase 1 fully resolves to monotonic-up:** SKIP Phase 2, close B-NEW-39, Step 8 review, governance close
- **Phase 1 narrows but residual non-monotonic:** apply Phase 2 next — `scripts/b-new-39-phase2-b68-5-recalibrate.sql` updating ONLY the wildcard row of `path_b_sustainability.b68_5_path_b_momentum_min` from 0.001 → **0.0005** (Langston Q2 intermediate, NOT 0.0). Wildcard row scope: `(exchange=*, asset_class=*, strategy=*, regime=TREND_FRIENDLY_STABLE, value=0.001)`. **DO NOT TOUCH** the xstock_spot-scoped row at 0.0005 (Langston Q3).
- **Phase 1 makes things worse:** apply rollback `scripts/b-new-39-phase1-floor-rollback.sql` (committed). Surface to Kyle/Langston.
- **Shape goes flat:** Phase 3 raw-classifier forensics fires (possibly splitoff to B-NEW-40 per Langston).

**B-NEW-37 closed `5520d1892`:** Multi-mechanism diagnosis (FINDING-2026-05-15-A). No single-line sign flip. b68_5 gate uniform-too-aggressive (-0.40 Δconf, MW-U p=0.094 → scenario B). 0.20 floor concentrating winners (15.4% pinned, pinned WR 34.5% vs free 23.6%).

**B-NEW-36 closed:** Cohort diagnostic + chi-square confirmed Hypothesis B selection bias on 6 dimensions.

**B-NEW-33 closed:** all 10 factors INCONCLUSIVE at Langston-locked 7pp gate. Kyle Option 1 LOCKED 2026-05-15 evening.

**B-NEW-38 BLOCKED through B-NEW-39. B67.5 BLOCKED through B-NEW-38.** Total delay ~3-5 days from B-NEW-33 closure.

### Recent commits

- `5520d1892` — B-NEW-37 closure + governance
- `04ec4f940` — B-NEW-39 scope + pre-audit
- `3a0034c6c` — B-NEW-39 Phase 1 SQL + rollback + forensic --since flag + scope addendum

### Key file paths
- Forensic CLI: `scripts/b-new-37-inversion-forensics.ts` (supports `--since=<ISO>`)
- Phase 1 SQL: `scripts/b-new-39-phase1-floor-revert.sql` (applied)
- Phase 1 rollback: `scripts/b-new-39-phase1-floor-rollback.sql` (committed, not applied)
- Pre-fix forensic report: `Claude Comms and Packages/Batch Completion/B-NEW-37_FORENSICS.md`
- Scope: `Claude Comms and Packages/Scope Files/B-NEW-39_SCOPE.md` (§8b has all Langston Q+Concern resolutions)

---

## PRIOR BATCHES (compressed — full detail in completion reports + governance)

**B-NEW-37 CLOSED 2026-05-15/16** (`5520d1892`). 7-phase forensic identified TWO interacting defects (FINDING-2026-05-15-A): (1) `b67_5_post_composition_floor=0.20` set by B70.3b 2026-05-05 as visibility-window override; 15.4% trades pinned, pinned WR 34.5% vs free 23.6%; (2) b68_5 Path-B gate uniformly over-aggressive (Δconf -0.40, MW-U p=0.094, scenario B). NO single-lever sign flip exists (all 6 multiplicative levers near-neutral, ratios 0.99-1.01). Langston Step 8: CLOSE+SPAWN B-NEW-39. Bonus fix: classifyShape() segment-based monotonic-down fallback added to B-NEW-36 CLI.

**B-NEW-36 CLOSED 2026-05-15** (`bb508ce29` + `390e23ced`). Cohort diagnostic surfaced the inversion. b76 deciles: low 17% → high 11%. Chi-square confirmed Hypothesis B selection bias on 6 dimensions (p≈0). Langston Step 8: sequence B-NEW-37 → B-NEW-38 → B67.5.

**B-NEW-33 CLOSED 2026-05-15** (`892da2f27`). Factor calibration backtest tool + cron unblock. 33,049 rows drained; 13,830 matched; all 10 factors INCONCLUSIVE at 7pp gate. Kyle Option 1 LOCKED. Parity check vs May 5/6 screenshot confirmed methodology sound — divergence at verdict-labeling layer (gate threshold) not calculation. b68_5 flagged for ~0.37 multiplier; superseded by B-NEW-37 scenario B → recalibrate.

**B-NEW-34 CLOSED 2026-05-15** (4 commits ending `1ee3ceb27`, PM2 #287). xstock scanner 60-min bar parity. LAST CYCLE DURATION 675ms vs 25s+ pre-fix; PAIRS SCANNED 64 of 75 vs 26 pre-deploy. **B74 duplicate-row bug discovered (18-56× dup per minute)** — B-NEW-35 spawned for source-side dedup. 240m warm-fetch suspended until B-NEW-35.

**B-NEW-32 CLOSED 2026-05-15** (`de28e4de0`, PM2 #283). CoinGecko Pro-tier migration.

**xStocks diagnostic UI sprint CLOSED 2026-05-14:** B-NEW-31 + B-NEW-14 + B-NEW-TZ + B-NEW-21.

**B-NEW-35 spawned:** B74 archive UPSERT fix (UNIQUE constraint + cleanup migration + writer rewrite to INSERT ON CONFLICT DO UPDATE). When it lands: remove DISTINCT ON CTE in ohlc-aggregator.ts + re-enable 240m warm-fetch.

---

## NEXT SESSION PLAN (immediate next step after Kyle ack)

**Priority 1 — B-NEW-37 confidence-inversion forensics** (BLOCKS B-NEW-38 and B67.5).

The b76 confidence chain is inversely correlated with realized WR (decile 9 conf 0.42-0.49 wins 6.7% vs decile 2 conf 0.20-0.21 wins 40.5%). Per Langston Step 8 — almost certainly a system bug. Root cause priors in order: (1) label-flip in b76 training/calibration, (2) feature-polarity error in one or more of 8 modulator inputs, (3) train-vs-serve distribution mismatch, (4) rank-vs-calibration drift. (1) and (2) primary — both inspectable via training-script read + holdout SQL.

Investigation: trace b76 chain-final calibration code path; inspect each of 8 modulators' sign convention; compare b76-predicted-prob vs realized WR at training-vs-serving; confirm post-b76-cutover (legacy showed u-shape mid-dip — different from monotonic-down); pinpoint specific modulator/feature (re-run B-NEW-33 verdict with each lever DISABLED to find the resolver); propose fix. Bonus todo: fix `classifyShape()` in `scripts/b-new-36-cohort-diagnostic.ts` (missing monotonic-down branch).

**Priority 2 — B-NEW-38 stratified B-NEW-33 re-run** AFTER B-NEW-37 lands fix. Re-run on corrected baseline; primary cell b76 + TFS + quant-strong_trend + post-stall (n~4000-4400). If b76 confidence direction is fixed, several factors that look INCONCLUSIVE today might cross the 7pp gate cleanly.

**Priority 1-LEGACY-COMMENT — B-NEW-36 diagnostic spike** (was the unblocker; now CLOSED — surfaced the inversion).

Two findings from B-NEW-33 verdicts require investigation BEFORE B67.5 consumer-gate design proceeds:

1. **Tertile non-monotonicity across all 10 crypto factors.** Low ~17% → mid ~26% → high ~21% — mid-confidence wins more than high-confidence universally. Single upstream artifact, not 10 independent signals. Two hypotheses: (A) base confidence distribution has non-monotonic relationship with outcome (high-confidence routed to thinner-liquidity contexts), (B) 13,830 matched cohort is selection-biased.

2. **58% of pending rows unmatched.** Need audit grouping 19,219 `unreplayable_real_rejected` rows by (symbol, hour-of-day, day-of-week, strategy) to check for skew. If uniform → crypto reality, move on. If lopsided → matched cohort is biased and every B-NEW-33 verdict is suspect.

Build CLI tool `scripts/b-new-36-cohort-diagnostic.ts` (mirror B-NEW-33 pattern). Output Markdown report at `Claude Comms and Packages/Batch Completion/B-NEW-36_DIAGNOSTIC.md`. Full prompt captured in spawned-task chip (2026-05-15).

**Priority 3 — Design B67.5 consumer-gate** from B-NEW-38 corrected verdicts. b68_5 likely candidate for ~0.37 calibration multiplier (not DROP) IF inversion was a polarity bug.

**Priority 4 — xStock Calibration Plan Phase 0** sequenced AFTER B67.5 ships.

**Total delay estimate before B67.5 unblocks:** ~3-5 calendar days (B-NEW-37 ~1-2 days + B-NEW-38 ~1-2 days). Worth it to avoid shipping consumer gate on inverted signal.
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
