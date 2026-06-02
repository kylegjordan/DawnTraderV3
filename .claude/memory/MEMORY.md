# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language strengthened 2026-05-28; §2 Step 1.a/§9 **audit = code-level deep read of SIM AND System Manual + trace consumers, NOT grep-and-cite**; §3.3 Phase-24; §5 #15 NO PATCHES + #19 CI per-batch; §6.5.0.a embedded-diff + no-gdrive; **§7.1 🔒SET-IN-STONE storage workflow**; §9.1 scaffolding; §9.3 UI-verify; §10.5 alerts).
   - **🔒 §7.1 STORAGE WORKFLOW (SET IN STONE, Kyle 2026-06-01):** Google Drive folder = SOURCE OF TRUTH; edit there → copy changed files to `C:\dev` test bench → `npx tsc --noEmit`/`npx vitest run` → when green, **commit + push to GitHub FROM the Google Drive folder** → GitHub → staging. **NEVER pull GitHub → Google Drive. NEVER push to GitHub from `C:\dev`.** Only allowed pull: GitHub → `C:\dev`. Batch-close gate: from Google Drive, `git rev-list --count HEAD..origin = 0`.
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: EVERY message. TWO paragraphs default. % WITH raw counts. **Use the system's CANONICAL terms for system items — "regime" NOT "market condition"; IMF / DBS / LQ / VN / DI — Kyle 2026-06-02 "terms matter."** Topic 21 + Claude Desktop both. NO DMs to @CCDTCommsBot.
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-06-02 — B.0 baseline DONE + B-CALSCORE tab CLOSED; NEXT = B.2)

**B.0 BASELINE (NEW read-only sub-batch, before B.2):** Kyle directive — capture a "before" baseline of everything the Phase-24 calibrations will change (xStocks ONLY, NO win/loss), flag what's "definitely off" NOW, overlay operational events so distorted windows aren't read blindly. Deliverable = a WRITTEN numbers report at `Claude Comms and Packages/Scope Files/B_XSTOCK_CALIB_BASELINE_REPORT.md` (NO UI/code). Methodology: rolling windows (rule #13); **every rate shown WITH raw counts** (Kyle); event-overlay + extremes-first + batch-catalog causation; "definitely off" list. Scope = `B_XSTOCK_CALIB_BASELINE_SCOPE.md` v4 (Langston Step-1 ACK: standalone B.0; depth replay+forward, session-segment RTH; liquidity-gate-coverage = #1 priority).

**Kyle decisions:** (a) **numbers-first; the side-by-side comparison TAB is a SEPARATE follow-on batch** ("Calibration Scoreboard", analytics/diagnostics page; simple columns: setting · current value · current result% · planned value · planned result%). (b) **Correlation:** stays a confidence MODULATOR (NOT an IMF filter); the misplaced IMF-embedded correlation gets REMOVED at the END of all calibrations; benchmark/modulator correlation SETUP deferred to **Phase 25**. (c) Depth: reconstruct ~1 day + accumulate forward, session-segmented RTH.

**KEY BASELINE FINDINGS (all in the report):**
1. **#1 — two uncoordinated liquidity gates.** `lq_min=43` ≈ **$19,950 ask-depth** (crypto-VOLUME-era carryover, mis-scaled when B.1.5 made LQ depth-based) → rejects **~70% RTH** (30% pass); the hard `min_depth_usd` gate (2000/5000 two-way) rejects only **4-13%**. Disagree 4-10×. Core B.2 target: recalibrate lq_min on the depth scale + coordinate with min_depth. (Resolves Langston #1: family paths DO have a liquidity gate — LQ — mis-scaled, not absent.)
2. **Correlation:** canonical IMF = LQ/VN/DI only (crypto confirms `fx5-scanner.ts:813`); xStock wrongly bundled correlation INTO IMF (`imf-evaluator.ts:148-177`) AND it's non-functional (called w/o benchmark → const 0.5 → rejects 0%).
3. **Regime mix skewed:** STRUCTURAL_TRANSITION 44.7%, TREND_FRIENDLY 38.7%, HIGH_VOL 12.4%, IMPULSE 4.0%, **RANGE_BOUND 0.14%** (near-never).
4. **Strategy mix:** vwap_pullback 50% + morning_star 29% = ~80%; **breakout + inside_bar_reversal ENABLED but 0 trades**; mean_reversion 2; **strong_bull_trend OFF but 21 trades** (anomaly to run down).
5. spread gate ~2.3% rolling (single-cycle flashed 16% = rule-13 lesson); min_volume 0% (inert); VN <1%; DI 0% trend/breakout, 32-35% reversal/oscillator. Universe **489** scanned (NOT 260 — that was stale DBS-backfill coverage). Restart ~1.6/day.

**Feeds (verified, no-assume):** CoinGecko = xStock symbol DISCOVERY (+crypto macro); **Finnhub = SECTOR tags** (UNCATEGORIZED when null); NO wired sector-ETF PRICE feed → per-sector correlation benchmark blocked; SPY/QQQ in registry (broad-market unblocked but deferred to P25).
**Data availability:** `signal_eval_archive` rich+live (regime + downstream funnel CLEAN, 6M rows/3wk); `vts_open_trades` = throughput (paper_sim_trades=0); `xstock_spot_ticker_snap` ~1-day retention (depth FORWARD-only); `xstock_dbs_backfill` STALE (05-05→15 only); upstream scan-funnel = in-memory only (reconstruct via replay / live `/api/xstocks/filter-diagnostics`, NOT archived).

**B.0 baseline report DONE** (Langston Step-8 reviewed, 3 corrections absorbed: min_depth=min(ask,bid) statistic / regime-drift caveat-grade / strategy anomalies date-segmented-genuine). **B-CALSCORE Calibration Scoreboard tab CLOSED 2026-06-02** (deploy `c6d73bb1d`, CI `26786998299` all-4-green, Langston Step-1+4+8, staging-UI-verified): the live before/after home — Analytics "Calibration" tab + `calibration_ledger` table + `/api/analytics/calibration-scoreboard`, seeded with the 10 B.0 tunable rows (num/den SSOT, pct derived). Each later calibration sub-batch fills the planned side of its rows. **B.0/B-CALSCORE onboarding learnings captured** into `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (NEW standing steps: pre-calibration-baseline before Step 7b + carryover-audit checklist + data-availability-map) + B-CALSCORE completion report §3.3 (Kyle 2026-06-02: the baseline IS a big onboarding learning).

**★ NEXT — B.2 (Phase-24 IMF/threshold calibration, archive-replay, no outcomes):** lead item = **recalibrate `lq_min` onto the DEPTH scale + coordinate with `min_depth_usd`** (the #1 baseline finding: lq_min=43 ≈ $19,950 ask-depth rejects ~70% RTH vs min_depth 2000/5000's 4-13%; they measure different book statistics — LQ=ask-only, min_depth=min(ask,bid); FINDING decision-grade, TARGET needs depth to thicken forward / bound-with-range). Then remaining Phase-24 (B.3 per-strategy gates incl. the gate-bypass [strong_bull_trend OFF yet 21 trades] + never-fire [breakout/inside_bar] D-audit findings, B.4+B.5 friction/spread, B.6 TEC priors, B.7 sector, C macro, D strategy audit, CRYPTO-FRICTION) — all archive-replay, BEFORE Phase 25. **Correlation OUT of the arc:** stays a confidence modulator; the misplaced IMF correlation is removed at END-of-calibrations; benchmark setup deferred to Phase 25 (sector-ETF prices not wired — CoinGecko=discovery, Finnhub=sector tags; SPY/QQQ available for broad-market).

**Earlier 2026-06-01 CLOSED:** B-XSTOCK-CALIB **F-NOW** (calibration_state plumbing, VTS-only, deploy `cdac422b9`, CI green; opt-in exclusion INERT until Phase-25; Step-8 Langston cross-check hung+killed, CC-verified, optional re-run); B-NEW-47, B-NEW-50; Langston CLI 2.1.159 + opus-4-8[1m]; §7.1 SET IN STONE.

**DEFERRED:** Comms STAY Telegram (revisit Discord post-Phase-24). #173 recurring zero-NULL guard (Phase 25). **#166** TEC stale-cache alert `b83b1e4b` ACTIVE/UNACKED **BY DESIGN** (deferred to post-calibration; Langston re-flags each turn — NOT rotting).

**Kyle comms: DESKTOP ONLY** unless 3-way Langston. Plain language every message, two-paragraph default, % + raw counts. Active trading OFF (VTS passive learning only).

---

## POST-COMPACTION PROMPT FOR KYLE

> Resume Phase 24 xStock calibration at **B.2** (archive-replay, no trade outcomes). B.0 baseline report is DONE (Langston-reviewed) and the **B-CALSCORE "Calibration" tab is CLOSED + live on staging** (the before/after scoreboard, seeded with the 10 B.0 tunable rows). **B.2 lead item = recalibrate `lq_min` onto the depth scale + coordinate with `min_depth_usd`** — the #1 baseline finding (lq_min=43 ≈ $19,950 ask-depth rejects ~70% RTH vs min_depth 2000/5000's 4-13%; they measure different book statistics: LQ=ask-only, min_depth=min(ask,bid); the FINDING is decision-grade but the recalibration TARGET needs the ~1-day depth data to thicken forward → bound with a sensitivity range). Then remaining Phase-24 (B.3 per-strategy gates incl. the D-audit gate-bypass [strong_bull_trend OFF yet 21 trades] + never-fire [breakout/inside_bar] findings, B.4+B.5 friction/spread, B.6 TEC priors, B.7 sector, C macro, D strategy audit, CRYPTO-FRICTION) — all archive-replay, BEFORE Phase 25. As each calibration runs, fill the planned side of its rows in the Calibration tab (`calibration_ledger`: planned_value / planned_result_num/den / planned_sub_batch; status proposed→applied; set updated_at). **Correlation OUT of the arc** (stays a confidence modulator; misplaced IMF correlation removed at end-of-calibrations; benchmark deferred to Phase 25 — sector-ETF prices NOT wired, SPY/QQQ available for broad-market). Read CLAUDE.md + MEMORY.md + `B_XSTOCK_CALIB_BASELINE_REPORT.md` (findings) + `B_XSTOCK_CALIB_SCOPE.md` first. 🔒 §7.1 storage set-in-stone (edit GDrive → test C:\dev → push from GDrive; never reverse). Active trading OFF.
