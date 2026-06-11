# B-5 AMR BODY — Step-4 Change List (code review dispatch)

> Scope: `B_5_AMR_BODY_SCOPE.md` (16 objectives, all Step-1/Step-2 conditions folded).
> Local commits b56ceb341..50a6c9009 on top of origin head 641f20377 — **NOT pushed** (this review gates the push).
> Full diff staged at `/home/langston/inbox/b5-amr/b5_full.diff` (3,620 lines, 25 files, +3,131/−38).
> All NEW files staged in the same inbox for direct Read.
> INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git on the gdrive mount. Inbox files are local-FS.

## Review structure (pre-audit §6 item 4): diff A = additive/shadow-safe, diff B = gates + consumer wiring. SHIP A WITH B in ONE deploy (ratified — nothing bleeds today).

---

## DIFF A — stores, feeds, aggregator, sentinels, #217, migration (additive; zero live behavior except Obj-12/13 source flips)

### NEW `server/asset_classes/xstock_spot/friction-sample-store.ts` (Obj-0a)
Scanner-cycle capture of measured spread+depth; reason-coded read OK | NO_SOURCE | MARKET_CLOSED (isXstockMarketOpenUTC-keyed, never sample-absence) | LOW_VOLUME_THIN(n/min) | WARMING(k/N); `getMeasuredSpreadDecimal` for the cost model; warmup re-seeds on scanner resume. Knobs DB-governed (`amr_friction_sample`, fail-hard, boot-asserted).

### MODIFIED `server/asset_classes/xstock_spot/scanner.ts`
Capture hook after the depth-map build (try/catch never-throws); `resetXstockFrictionWarmup()` in `resume()`.

### MODIFIED `server/services/market-indicators.ts` (Obj-13 — supersedes the B-4.7 pool read)
`computeGlobalFrictionWithDetails`: crypto samples `getAllCachedSymbols()` (scanned universe, ≤500) — the activation-dependent pool membership is GONE; xstock reads the friction-sample store via new `computeXstockFrictionFromStore()`. `FrictionResult.reason/reasonDetail` + `MarketIndicators.frictionReason` added; NO_SAMPLE narrative is reason-specific (LOW_VOLUME_THIN reads as thin-open-market, never shutdown). **DELETED `TOP_100_FALLBACK_PAIRS`** — it back-stopped a thin POOL; under universe membership the empty-cache case yields honest null (the fallback never helped that case — empty cache had no metrics for the fallback pairs either).

### MODIFIED `server/core/math/cost-model.ts` (Obj-12 / Pull-in A — LIVE behavioral write)
xstock branch of `getCachedCostMetrics`: measured spread when fresh (`spreadSource: 'measured'`), static module spread otherwise (`'static_fallback'`). `CostComponents.spreadSource` optional — rides every JSON-persisted payload. Crypto unstamped v1 (cache conflates writes with getOrSet seeding — comment documents; B81 cache dimension unlocks it).

### MODIFIED `server/core/metrics/calibration-epoch.ts` + 2 call sites (Obj-12 ruling)
`getCalibrationEpoch(source, assetClass?)` — class-scoped row via native most-specific-wins; wildcard unchanged for sources without splits. vts-service + paper-engine pass the `_assetClass` they already hold. Migration seeds `calibration_epoch/xstock_spot/vts = wildcard+1` (INSERT-SELECT — crypto lineage untouched).

### NEW `server/services/amr-weather-report.ts` (Obj-3/3a/7 — the aggregator)
M2 contract: continuousScore 0-1 monotone; hard rules are SCORE CAPS (classification stays pure bucketing; bucket edges DB-tunable). IDLE per Obj-3a (re-seed silently, flips never span idle); B5 min(firstRead, NORMAL); A8a epochs = live cycles; A8b one-rung ladder (dwell + confirm, tighten immediate); R2 quarantine caps score at 0.5; **INPUT-COMPLETENESS CAP (design fix the unit suite surfaced): FAVORABLE requires all 5 weighted inputs present — thin renormalized snapshots could otherwise inflate to FAVORABLE, violating B5 never-loosen. In prod FAVORABLE is unreachable until the EV-gap window warms, by design.** EV-gap rolling window (per-class N) fed by the close hook; ledger writer (would_dials + drained would_blocks + #217 rankingShadow); in-service 90-day prune (the B-NEW-47 partition sweep does not fit this small non-partitioned table — deviation, flag if you disagree); M4 transition alerts active-only; A5 disabled = no compute.

### NEW `server/services/amr-equity-feed.ts` (Obj-14b — your 5 source conditions)
CBOE schema guard fail-loud; last_trade_time dedupe; ICE formula over frankfurter (ECB no-new-date = no observation; eurofxref XML documented fallback); FRED keyed cross-check trade-date + pending-not-mismatch (`fredCrossCheck: disabled` honestly when no FRED_API_KEY); observation-denominated windows; /tmp state persist (B67.1 pattern).

### NEW `server/services/amr-input-health.ts` (Obj-15b, R1-R5)
{fresh, inBounds, varying, crossConsistent} per input; OOB = quarantine-not-clamp; R3 distinct-count arming (K over trailing window) + stuck-at-zero fast N; incident-close re-arm (re-alerts on second break); absence escalation after tolerance epochs; alerts deduped per (class, input, kind), fire in shadow AND active (R1; aggregator never calls for disabled — A5).

### NEW `server/services/amr-context-bonus-shadow.ts` + getTopSignal hook + seeds (Obj-10, #217 — OWN COMMIT a5ea8b567)
Computed per ranked set, fire-and-forget AFTER selection (bestSignal already chosen — structurally cannot alter it); regime-agreement per-class voteStatus-aware; confirmation = BTC MCE-context trend (crypto) / SPY 15m bars (xstock, 4 pins: closed buckets only, stale_bars own state, off-RTH = class_idle, lookback ≤ 600 boot-asserted); bull-compatible mapping DB jsonb (EXTREME_NOISE/STRUCTURAL_TRANSITION omitted = null = honest no-term); stamps rank1Changed + ceilingSaturationRate (#221) onto the ledger weather json.

### Migration `2026-06-11c-b5-amr-body.sql` (+MANIFEST; rollback file untracked per policy)
amr_decision_ledger table + index; ~150 seeds with CAPTURED provenance (crypto friction 29-31 fee-dominated 12h series n=1402; xstock RTH 0.089% vs overnight 1.64% — SESSION-BIMODAL ~18x, so thresholds 45/70 put overnight legitimately CHOPPY/STORMY; |DBS| p95 crypto 0.460 / xstock 0.319); governance_modes per-class via INSERT-SELECT COPY of live wildcard values (parity by construction, zero retyped literals) + AGGRESSIVE floor = NORMAL value (B1); dial seeds = 11.7S shipped literals + AGGRESSIVE loosening mirror (1.25/1.0/1.2/0.75, no stop-tighten per the 11.7S doctrine).

### MODIFIED `server/startup/b72-warmup.ts`
7 modules prefetched; B-5 boot assertion (every class × mode × dial + floors + 8 rules + xstock store knobs + SPY lookback ≤ 600).

---

## DIFF B — modes, gates, consumer wiring (dormant until flag; parity-preserving)

### MODIFIED `server/core/governance/strategy-modes.ts` (Obj-1/2/4)
`StrategyMode` += AGGRESSIVE (legacy class-less record access THROWS by design — no class-less AGGRESSIVE dials exist; serving crypto dials to xstock would be the bug); `resolveStrategyModeFromWeather` (the M2 brain seam, IDLE → null); `getModeOverlayForClass`/`getSlotCapForMode`/`meetsConfidenceFloorForClass` (per-(mode,class), fail-hard); per-class mode stats (F2; legacy aggregate kept consistent). Legacy trio literals untouched.

### NEW `server/core/governance/amr-gates.ts` (Obj-5/6)
Self-sourcing (F1): flag+mode resolved internally — the RTB-refresh partial-SQE path can never skip gating by omission. disabled → skipped; shadow → dry_run (blocks → ledger relay, allowed=true); active → enforce. **Fail-closed under active on gate-resolution error** (never a silent allow); entry-only; slot count caller-supplied (gate stays pure).

### MODIFIED `server/core/filters/signal_quality_evaluator.ts` (site 1)
Unconditional gate call before the governance gate; failures push into the existing failures[] (same rejection shape).

### MODIFIED `server/services/paper-execution-engine.ts` (sites 2+3 + consumer swap)
processSignal: mode/overlay source swap under active (legacy bit-identical otherwise — the floor check became `conf >= modeOverlay.confidenceFloor`, literally the same comparison the legacy helper performed); execution-entry gate with per-class open count; F2 per-class execution counters. checkRtbPromotion: per-signal re-check — enforce DEFERS (continue, stays in queue); B63 Item-14 strong-trend geometry bypass untouched (lane split preserved).

### MODIFIED `server/services/realtime-paper-executor.ts`
Same gate at executeTrade (dormant live scaffold — ships wired so live can never bypass AMR by omission).

### MODIFIED `server/services/vts-runner.ts` + `vts-service.ts` (scope delta 6 + F6)
VTS dials PINNED to legacy path forever; adds the at-open weather/mode STAMP (B.2.UI 6-point threading; lazy module ref keeps the graph cycle-free) persisted on closed records; EV-gap feed in the post-persist close region (both sides percent-of-notional; vts source by construction; paper flip = separate Phase-19 operator decision per B2).

### MODIFIED `server/routes.ts` (Obj-8)
`/api/diagnostics/amr/current` (byClass report + flag + mode); governance endpoint gains `amr` block; **FIX: `overlays: STRATEGY_MODE_OVERLAYS` serialization would have hit the AGGRESSIVE fail-hard getter and 500d the endpoint — legacy trio now enumerated explicitly.**

### MODIFIED `server/services/autonomy-scheduler.ts`
B-5 boot: equity feed + 30s AMR cycle + **`startObservabilityLoop()` — DEAD-CODE FIX (fix-not-delete): designed in 11.3B, never called anywhere; its 60s [CostEngine] line is the crypto universe-spread telemetry the provenance capture needed.** Deferred-retry start (10×30s) so module load order cannot race b72-warmup.

---

## VERIFICATION (bench, C:\dev)
- `check-tsc-baseline`: OK, 0 regressions; **17 baseline errors incidentally FIXED** (enumerated for the completion report).
- New suite `b5-amr-body.test.ts`: **27/27 PASS** (store taxonomy incl. MARKET_CLOSED-by-predicate; Obj-12 stamp; per-class dials ≠ across classes; B1 floor equality; brain-seam mapping; AGGRESSIVE legacy-access throw; cross-class divergence crypto-CALM/xstock-STORMY; IDLE re-seed + min(firstRead,NORMAL) both directions; one-rung ladder with dwell; R2 quarantine cap; A5 no-compute; mixed-flag crypto-active/xstock-shadow; EV-gap warming→ratio; gate flag discipline incl. enforce blocks + fail-closed; R3 arming + zero fast-path + legit-quiet disarm).
- Full vitest: 1,676 pass; 12 fails are PRE-EXISTING environmental (PROVEN identical with all B-5 changes stashed: 6 suites need the CI postgres service container; 4 suites have Windows-path scan issues). Authoritative full-suite verdict = the CI Test Suite job at push.

## DEVIATIONS / JUDGMENT CALLS TO RATIFY
1. Input-completeness cap (design fix; FAVORABLE needs 5/5 inputs — extends your B5 ruling to steady-state thinness).
2. Ledger retention = in-service daily DELETE (90d), not the B-NEW-47 partition sweep (table is small + non-partitioned).
3. Calibration-epoch class-dimension extension (the v0 "per-source only" wildcard broke on the first class-scoped calibration change; most-specific-wins is the native resolver mechanism).
4. TOP_100_FALLBACK_PAIRS deleted (rationale above — subsumed, not designed-in for the universe source).
5. startObservabilityLoop wired (dead-designed code, Kyle fix-not-delete).
6. FRED_API_KEY: ships optional — absent key = `fredCrossCheck: 'disabled'` reported honestly (key added to staging .env at deploy; free registration).
7. would_blocks ride the NEXT cycle's ledger row (one-cycle attribution skew; each block carries its own ts+site+gate tags).
8. Seed-count delta: PREVIOUSLY ~100 rows. NOW ~150. REASON: Obj-15b health rails + #217 ranking_context_bonus modules added by the Kyle correctness/sentinel directives after the estimate.

Reply per diff: APPROVE / revisions. Both approvals → single push + single deploy.
