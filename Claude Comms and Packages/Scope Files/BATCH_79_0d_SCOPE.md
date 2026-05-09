# BATCH 79.0d — ORB strategy IMPLEMENTATION (SCOPE rev 1)

**Status:** DRAFT 2026-05-09 22:10 UTC. Sequenced AFTER B79.0c lands.
**Phase:** 24 (Multi-Asset VTS Onboarding).
**Branch:** `migration/aws-supabase`.
**Workflow:** 11-step canonical (full).
**Time-pressure:** Target = ORB live for xstock_spot before Sunday 2026-05-10 22:00 UTC ARCA reopen, so the 24/5 names get ORB coverage at the next 14:30 UTC opening bell on Monday 2026-05-11.

---

## §0 — Honest framing (corrected per Kyle 2026-05-09)

**ORB is NOT active today.** What exists is scaffolding only:
- `server/strategies/orb.ts` exists with `detectORB()` returning `null` even when the gate is flipped (line 104: "FULL IMPLEMENTATION DEFERRED").
- DB row `module_constants.strategy_gates.xstock_spot.orb.enabled = false`.
- Whitelist entry at `server/config/canonical-regime-strategy-map.ts:906`.
- **NOT** in strategy-engine dispatch (engine doesn't know ORB exists).
- **NOT** in regime-strategy mapping (no regime can pick ORB).
- **NO** threshold parameters seeded.

**B79.0d is real implementation work, not a gate flip.** Estimate 3–5 hours including scope+PIA+impl+tests+deploy+verify.

---

## §1 — Numbered objectives

| # | Objective | Verification |
|---|---|---|
| 1 | Write `detectORB()` real detect logic in `server/strategies/orb.ts`. Identify open-range window (first 15-30min of US RTH = 14:30–15:00 UTC). Compute high/low range. Watch for breakout above/below + buffer. Generate BUY/SELL StrategySignal with stop = opposite range extreme, target = 2× range height (configurable R:R), confidence scaled by range size (volatility-discovery proxy) + volume-multiple (liquidity confirmation). Asset-class guard: returns null if `assetClass !== 'xstock_spot'`. ~100–150 lines new code. | `grep "FULL IMPLEMENTATION DEFERRED" server/strategies/orb.ts` returns 0 hits. Unit test asserts non-null signal on synthetic breakout candles + null on no-breakout |
| 2 | Register `detectORB` in strategy-engine dispatch: import + thin wrapper method on `StrategyEngine` class (mirror `detectStrongBullTrend` pattern at line 1518). | `grep "detectORB" server/services/strategy-engine.ts` returns ≥2 hits (import + method) |
| 3 | Register ORB dispatch block in `server/services/signal-orchestrator.ts` (mirror strong_bull_trend block at line 1778). Active only when `activeStrategies.has('orb')` AND assetClass === 'xstock_spot'. ~10 lines. | `grep "'orb'" server/services/signal-orchestrator.ts` returns matching dispatch block |
| 4 | Add ORB to `CANONICAL_REGIME_STRATEGY_MAP` for `IMPULSE_EXPANSION` (volatility-discovery natural fit) AND `STRUCTURAL_TRANSITION` (regime-boundary breakout natural fit). Both regimes get an ORB entry alongside existing strategies. Asset-class isolation enforced by (a) detect's internal guard + (b) `XSTOCK_SPOT_ENABLED_STRATEGIES` whitelist via SQE → asset_class_disabled rejection for crypto. | Regime-map IE + ST entries include `strategyKey: 'orb'`. SQE rejects ORB on crypto signal with `'asset_class_disabled'` |
| 5 | Seed Layer-1 thresholds in `module_constants` for `xstock_spot.orb`: open_range_minutes (default 30), breakout_buffer_atr_mult (default 0.15, mirror SBT pattern), risk_reward_ratio (default 2.0), volume_multiple_min (default 1.5), confidence_base (default 0.65). All read via `getCachedNumbersForModule('strategy.orb', ...)`. | `SELECT * FROM module_constants WHERE module_name='strategy.orb' AND asset_class='xstock_spot'` returns 5 rows |
| 6 | Flip DB gate `module_constants.strategy_gates.xstock_spot.orb.enabled = true`. Add `prefetchModule('strategy_gates')` to startup warmup if not already there (for cached sync API per CLAUDE.md no-fallbacks rule). | DB row shows true; PM2 boot log shows `[B79.0d][ORB]` ENABLED log line on next-tick xstock_spot signal |
| 7 | Register ORB in B73 exit-strategy ablation framework alongside other strategies. | Ablation table includes ORB row with N≥0 evaluations after Monday 14:30 UTC open |
| 8 | Boundary tests: `server/tests/unit/b79-0d-orb.test.ts` covering (a) range-formation phase returns null, (b) breakout-up generates BUY + correct stop/target/confidence, (c) breakout-down generates SELL, (d) no-breakout returns null with correct null-reason, (e) gate-disabled returns null even on valid breakout, (f) crypto_spot symbol returns null (asset-class guard). | `npm test b79-0d` shows ≥6 cases passing; CI green |
| 9 | No-touch fence on crypto_spot holds | `regime_factor_alternates` cadence steady post-deploy |
| 10 | CI 4 checks green; staging deploy successful | curl /api/diagnostics + PM2 logs |

---

## §2 — Files changed

### Modified
- `server/strategies/orb.ts` — write full detect logic (~100–150 lines)
- `server/services/strategy-engine.ts` — import + wrapper method
- `server/services/signal-orchestrator.ts` — dispatch block
- `server/config/canonical-regime-strategy-map.ts` — add ORB entries to IE + ST regime mappings
- `server/services/exit-strategy-ablation.ts` (or equivalent B73 framework file) — register ORB

### Added
- `server/tests/unit/b79-0d-orb.test.ts` — 6+ boundary cases
- `scripts/b79-0d-orb-thresholds-seed.sql` — 5 module_constants rows + gate flip

### DB changes
- INSERT 5 rows into `module_constants` for `xstock_spot.orb` thresholds
- UPDATE `module_constants.strategy_gates.xstock_spot.orb.enabled` from false → true

---

## §3 — Open questions for Langston

**Q1 — Open-range definition.** Default 30-min range = 14:30–15:00 UTC. But should the range be SLIDING-DAY (first-30min after symbol's first tick of the session) or CALENDAR-FIXED (always 14:30–15:00 UTC even if symbol's first tick is later due to staggered open)? **My call: calendar-fixed.** Aligns with classical equity ORB. Alternative is more robust to feed staggering but adds state complexity.

**Q2 — Breakout buffer in ATR units vs % of range.** SBT uses 0.15×ATR fixed buffer. Classical equity ORB uses 0.5%-1% of range. Both are defensible. **My call: ATR-mult (0.15)** — matches SBT pattern, regime-adaptive. Alt: range-pct buffer for purer-microstructure signal.

**Q3 — Range-formation lockout.** During 14:30–15:00 UTC, no signals fire (range still forming). After 15:00 UTC, signals can fire on any breakout. When does the breakout window CLOSE? **My call: 15:00–17:00 UTC (2-hour window).** After 17:00 UTC, range is "stale" and shouldn't trigger entries. Alt: full RTH (close at 21:00 UTC) — more signals but lower-quality late-day breakouts.

**Q4 — Confidence formula.** Proposal: `confidence = clamp(0.65 + 0.20 * (range_atr_normalized) + 0.10 * (volume_mult - 1.0), [0.55, 0.90])`. Range-large = high vol-discovery = strong signal. Volume-confirmed = liquidity-real, not thin-market noise. Concur on shape/coefficients?

**Q5 — Regime mapping.** I proposed IE + ST. Could argue TFS (TREND_FRIENDLY_STABLE) also fits — once range is set, a continuation breakout in TFS regime is high-quality. **My call: IE + ST only initially.** TFS already has many strategies; ORB adds noise-vs-signal there. Conservative ship → expand later if data supports. Concur?

**Q6 — Asset-class guard placement.** I proposed (a) inside detect's first lines + (b) in signal-orchestrator dispatch + (c) SQE whitelist (already exists). That's belt-and-suspenders-and-paranoia. **My call: keep all three** — fail loudly if any one fails, can't accidentally fire on crypto. Concur?

**Q7 — Register in B73 ablation now or later?** Ablation framework needs trade history to evaluate variants; ORB will have zero trades Monday morning. Register now (gets evaluated as soon as trades exist) vs register in a follow-up batch after first 10+ trades exist (cleaner ship)? **My call: register now.** Zero-trade variants don't break the framework, they just show n=0 in the table.

---

## §4 — Verification plan

Step 7 (CC):
- Unit tests pass via `npm test b79-0d`
- DB seed: 5 threshold rows + gate flip verified
- PM2 log line `[B79.0d][ORB]` on next post-deploy tick (gate enabled, asset_class=xstock_spot)
- Crypto_spot no-touch fence: regime_factor_alternates 30-min cadence
- HTTP 200 on `/api/diagnostics/xstock-scanner`
- Monday 14:30+ UTC: observe first ORB-evaluated signals (range-forming) + post-15:00 first breakout candidates

Step 8 (Langston):
- Independent review of unit tests, DB rows, PM2 log
- Confirm scope objectives 1–10 verifiably met

---

## §5 — Risks & mitigations

| Risk | Mitigation |
|---|---|
| ORB fires on crypto symbols | Triple-guard (detect+dispatch+SQE) |
| Q-D probe outcome challenges ORB validity | This batch ships ORB as live-VTS shadow-mode. If Q-D probe (separate B79.0a candidate) finds AAPLx-vs-AAPL correlation tier-3, B79.x flips gate back to false |
| Threshold values are guesses | Layer-1 placeholders + ablation tracks per-variant performance; tuning is B79.x calibration sub-batch |
| Crypto no-touch broken | Detect's asset-class guard returns null before any computation; whitelist enforces at SQE |
| Strategy-engine dispatch silently misses ORB | Boundary test (Q4-d above) asserts ORB enabled+breakout produces non-null signal |

---

## §6 — Out of scope (explicit)

- US equity holiday calendar (deferred)
- Q-D AAPLx-vs-AAPL probe (separate batch)
- Calibration of Layer-1 → Layer-3 thresholds (B79.x)
- Live-equity-WS pricing (B79.5)
- ORB on xstock_perp (xstock_perp doesn't have an "open bell" concept; strategy is xstock_spot only)
- ORB on 24/7 names — they don't have a "close" so no opening range. Detect must check symbol against `XSTOCK_SPOT_24_7_SYMBOLS` (added in B79.0c) and return null for those

---

*End BATCH_79_0d_SCOPE.md rev 1.*
