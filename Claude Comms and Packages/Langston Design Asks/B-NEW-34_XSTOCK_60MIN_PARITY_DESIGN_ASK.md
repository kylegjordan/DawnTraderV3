# B-NEW-34 — xstock 60-min parity + 4-hour pre-fetch — DESIGN ASK

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-15
**Status:** Design review round 1
**Decision authority above this batch:** Kyle directive 2026-05-15

---

## 0. Kyle's directive (verbatim premise)

> "I don't want to make any big changes on what we've already done with crypto, and I think we should put xStocks on the same parity ... let's switch xStocks over to 60-minute bars. If we're gonna do multi-time frame agreement later on with xStocks when we're calibrating, then let's set it up so we're also getting the four-hour bars for xStocks."

Kyle's framing: 60-min is a deliberate swing-trading design choice for DawnTrader (trades can be open hours to a couple days; minute-granularity over-reactivity not desired). xStocks should match. Multi-TF agreement for xStocks comes later, but bring the 4-hour data path in now so it's ready.

The "ORB strategy may not work for us" tradeoff is acceptable — ORB is intrinsically intraday/minute-bar; we drop or suspend it on the xStocks side rather than chasing two bar regimes inside one asset class.

---

## 1. Pre-batch verification I already did

| Item | Verified | Source |
|---|---|---|
| Crypto runtime uses interval=60 everywhere | ✓ | grep `getOHLCData\(` in `server/services/{signal-orchestrator,vts-runner,fx5-scanner,market-scanner}.ts` → 9 hits, all `, 60)` |
| B68.1 uses interval=240 (NOT 1-min as originally planned) | ✓ | `multi-tf-agreement.ts:1-50` + DB row `multi_tf_agreement.b68_1_higher_tf_interval_minutes=240` |
| B68.1 architecture pivot (1-min archive → Kraken native 4h) | ✓ | `BATCH_68_PROGRESS_REPORT.md:252` ("Master plan estimated ~2 weeks; actual ~1 day surgical") |
| xstock scanner currently reads from local DB ohlc_1m, not Kraken REST | ✓ | `xstock_spot/scanner.ts:336-373` + `eval-cycle.ts:79-107` `fetchXstockOHLC` |
| xstock 90s ticker-freshness gate is in `data-freshness.ts` | ✓ | `module_constants.market_data.xstock_spot.data_freshness_window_ms=90000` |
| xstock universe = 265 symbols via static JSON config | ✓ | `server/config/xstocks-universe.json` |
| ohlcCache supports any Kraken-supported interval via `${symbol}_${interval}` cache key | ✓ | `ohlc-cache.ts:67-69`, 5-min TTL |
| Rate-limit envelope: 3,600/hr (crypto) + ~3,180/hr (xstock at parity) ≈ 1.9/sec avg, under 10/sec cap | ✓ | Per `price-cache.ts:74` + `BATCH_18_SCOPE.md:60-65` math |
| 60-min choice has NO documented design rationale in canonical bridge docs — only API-cost rationale in BATCH_18_SCOPE | ✓ | Read all 6 canonical docs; only BATCH_18 discusses interval=60 explicitly |
| Execution Flow canonical doc says "5-minute intervals" at line 294 — STALE, contradicts code | ✓ | `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md:294` |

---

## 2. Scope (proposed)

### 2.1 Core change

Replace the xstock scanner's OHLC fetch path: **from** SQL read against `xstock_spot_ohlc_1m` **to** `ohlcCache.getOHLCData(symbol, 60)` via Kraken REST (mirrors crypto exactly).

Add a parallel pre-fetch: `ohlcCache.getOHLCData(symbol, 240)` per cycle to keep the 4-hour cache warm for future multi-TF agreement (B68.1 mirror).

Drop the 90s ticker-freshness pre-filter entirely. Freshness becomes "OHLC cache TTL = 5 min" — same model crypto uses today.

### 2.2 Files in scope (proposed)

| File | Change | Rationale |
|---|---|---|
| `server/asset_classes/xstock_spot/scanner.ts` | Replace `runCycle()` ticker-snap query + freshness loop with: rotation batch iteration → per-pair `ohlcCache.getOHLCData(symbol, 60)` fetch → per-pair `ohlcCache.getOHLCData(symbol, 240)` warm-fetch → pass to evaluation pipeline | Mirror crypto fx5-scanner pattern; eliminate xstock-specific freshness gate |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | Replace `fetchXstockOHLC` (SQL against xstock_spot_ohlc_1m) with passthrough that accepts pre-fetched OHLC array; OR delete & replace caller with `ohlcCache.getOHLCData` direct call | `fetchXstockOHLC` is xstock-specific 1-min path; no longer needed |
| `server/asset_classes/xstock_spot/eval-cycle.ts::evaluateXstockPairForVTS` | Accept pre-fetched 60-min OHLC; current code does its own fetch internally (line 431: `fetchXstockOHLC(symbol, 120)`). Caller-provided pattern matches crypto. | Single source of truth for OHLC per pair per cycle |
| `module_constants` | DELETE row `market_data.xstock_spot.data_freshness_window_ms=90000` (no longer applies). | OHLC cache TTL replaces ticker-freshness model |
| `server/utils/data-freshness.ts::isPairDataFresh` | Either: (a) remove the xstock_spot branch (becomes wildcard → Infinity = always-fresh, same as crypto), or (b) leave structurally but unused by scanner. Lean (a). | No silent dead code |
| `server/config/canonical-regime-strategy-map.ts::STRATEGY_REGISTRY` (xstock side) | Mark ORB strategy as `enabled: false` for xstock_spot. Keep the 9 crypto carryovers active. | Per Kyle directive — ORB doesn't translate to 60-min |
| `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` | Update Phase B sub-batches: thresholds were 1-min-bar-calibrated; recalibration math + cohort start date reset. Phase D earlier note "ORB redesign 5/15/30/60min sweep" → "ORB suspended; revisit with strategy-set work post-launch" | Calibration plan is built on the bar-interval premise — needs to reflect the new premise |
| `client/src/components/machine-learning/xstocks-tab.tsx` | Update Filter Pipeline Diagnostics banner (no longer mentions ticker-freshness gate). Update Scanner Cycle Metrics labels if applicable. | UI accuracy |
| `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md:294` | Correct "5-minute intervals" → "60-minute intervals (1-hour candles); 5-minute TTL". Doc drift cleanup. | Canonical doc must match code |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | Update xstock data-flow section to reflect REST + cache (was DB-archive + ticker-freshness) | SIM is canonical for data flows |
| `1-system-manual/SYSTEM_MANUAL.md` | Update xstock subsection on OHLC pipeline | Same |

### 2.3 NOT in scope

- B74 `xstock_spot_ohlc_1m` archive table — keep running. Continues to be the long-term canonical 1-min store for backtesting and future ML training. Just not a runtime dependency for the scanner anymore.
- xstock WebSocket archiver (`equity-spot-archiver.ts`) — keep running. Continues to populate the 1-min archive + ticker-snap. Both feeds still useful for offline analysis.
- The B73 exit-replay (`exit-strategy-replay-service.ts`) — its xstock branch uses 1-min SQL directly. Stays as-is. (B73 is replay analysis, not signal eval.)
- Multi-TF agreement WIRING for xstocks — out of scope. We pre-fetch the 240-min cache key but do NOT wire xstock pipeline to call `computeMultiTfAgreement`. That happens later during xstock calibration when DBS + factor wiring are also done (per XSTOCK_CALIBRATION_PLAN Phase E).

---

## 3. Architectural questions for you

### Q1 — ohlcCache instance: shared with crypto, or fork a separate instance for xstock?

My lean: **shared.** No reason to maintain two cache instances. Cache keys are `${symbol}_${interval}` so xstock symbols don't collide with crypto. Memory footprint adds ~265 pairs × (60-min cache + 240-min cache) × ~720 candles × ~80 bytes ≈ 30 MB additional RAM, negligible. The 5-min TTL applies uniformly.

Counter-argument: a separate instance lets us tune TTL per asset class if needed. But we don't have a use case for different TTLs right now and Kyle's directive is "same architecture."

Concur shared, or do you see a reason to fork?

### Q2 — Cold-start: REST burst protection

Per the rate-limit envelope investigation: average load fine, but cold-start has 265 xstocks × 2 intervals = 530 cache misses on first cycle after restart. At 10/sec that's 53 seconds of sustained burst. Concerns:

1. Does the existing `priceCache.safeFetch` 10/sec budget gate apply to ohlcCache calls? Answer per my earlier investigation: **NO** — ohlcCache bypasses safeFetch. Pure direct Kraken REST.
2. Should B-NEW-34 add a jittered warmup (e.g., spread cold-start fetches over 2-3 minutes)?

My lean: add a **lightweight warmup queue** — on `XstockSpotScanner.start()`, spread the initial cache-warm over the first 3 cycles instead of all-at-once. Crypto doesn't have this because its 300-pair scan also cold-starts in batches (one batch per 30s cycle = naturally jittered). Xstocks is similar — the rotation batch of 75 per cycle means full 265-pair warmup happens over 4 cycles = 2 min naturally. So maybe NO extra code needed; the rotation IS the jitter.

What's your read?

### Q3 — `data_freshness_window_ms` removal: delete the DB row, or set to Infinity?

The B79.0a doc explicitly noted "missing row → Infinity = always fresh" as the intended fallback for crypto. So if we DELETE the xstock row, the helper returns Infinity for xstock_spot too, matching crypto behavior. Clean.

Alternative: set to `Number.MAX_SAFE_INTEGER`. Same effect at runtime; persists an explicit "no gate" intent in the DB.

My lean: **delete the row.** The helper's `_NO_WINDOW = Infinity` fallback is the canonical "no gate" path. Matches what crypto does (no row, no gate). Cleaner.

Counter: deletion makes the schema/migration more sensitive to future re-introductions. Setting MAX_SAFE_INTEGER is more explicit.

Your call?

### Q4 — `fetchXstockOHLC` removal scope: surgical edit or full deletion?

The function is only called from `evaluateXstockPairForVTS`. If we remove the call site (caller passes OHLC in), the function becomes orphaned. Two options:

A. Delete `fetchXstockOHLC` entirely. Caller passes 60-min OHLC array directly.
B. Keep `fetchXstockOHLC` as a utility (e.g., for B73 exit-replay xstock branch + any future xstock-specific 1-min reads). Just don't call it from the scan path.

My lean: **A (delete).** B73 xstock branch already reads via direct SQL, not via `fetchXstockOHLC`. Orphaned utilities accumulate.

Verify before deletion: grep for `fetchXstockOHLC` callers. If only the one site, delete safely.

### Q5 — Per Kyle's directive: pre-fetch 240-min for xstocks "so it's ready" — what does that mean at code level?

The 4-hour cache key only matters when something CONSUMES it. Right now nothing on the xstock side calls `computeMultiTfAgreement`. So pre-fetching the 240-min cache is technically a no-op until xstock calibration wires the consumer.

Two interpretations of Kyle's directive:

A. **Cache-warm only.** Per cycle, fire `ohlcCache.getOHLCData(symbol, 240)` for each rotated pair, ignore the result. Keeps the cache warm so when xstock calibration eventually wires `computeMultiTfAgreement`, the data is already there. ~265 pairs × 12 fetches/hr ≈ 3,180 extra Kraken REST calls/hr beyond the 60-min path.

B. **Don't wire it until needed.** Skip the pre-fetch entirely. When xstock calibration adds multi-TF agreement, that batch wires both the consumer AND the producer. Saves 3,180 calls/hr now for no near-term benefit.

My lean: **A (pre-fetch now).** Kyle's directive was explicit ("set it up so we're also getting the four-hour bars for xStocks"). The marginal Kraken load is ~1 call/sec sustained — comfortable. Pre-fetching also exercises the data path so any 4h-specific issues surface now rather than during calibration.

Your call? If you concur (A), I'll include it. If (B), I'll drop it from scope and document the deferred wiring.

### Q6 — ORB strategy disposition

Kyle accepted dropping ORB on xstocks. Three implementation options:

A. **Disable in registry.** Set `STRATEGY_REGISTRY` row for ORB+xstock_spot to `enabled: false`. Strategy code stays in place; just not invoked.
B. **Remove entirely from xstock strategy list.** Strip ORB from any xstock-strategy-list constants. More aggressive cleanup.
C. **Conditional: still invoke ORB but with 60-min bars and see if it produces anything coherent.** ORB looks for opening-range breakouts; on 60-min bars the "opening range" concept becomes "first 60-min bar of the session" instead of "first 5/15/30 min." Maybe degenerate, maybe interesting. Worth measuring before deletion?

My lean: **A.** Disable for now. Don't delete strategy code (low cost, easy to re-enable). Don't try C without explicit calibration scope (premature).

Your read?

### Q7 — XSTOCK_CALIBRATION_PLAN.md impact

The plan was built around 1-min bars. Phase B sub-batches calibrate thresholds (regime, IMF, friction, max-spread) that are bar-interval-sensitive. Switching to 60-min bars means:

1. The 14-day observation window stays valid (calibration is downstream of bar-interval choice).
2. Threshold STARTING VALUES change — Layer-1 starter values from crypto can now be reused directly (they're already 60-min calibrated).
3. Phase A DBS work — sector-classification design unchanged, but the SPY-fallback rolling-window math now uses 60-min bars, not 1-min.
4. Cohort start date should RESET to B-NEW-34 deploy date — pre-batch data is on the wrong bar interval and shouldn't be in the calibration cohort.

My lean: update the plan in-place as part of this batch's governance step. Add a "Bar-interval change history" subsection.

Do you concur, or do you want a separate revision-control protocol (e.g., v3 of the plan)?

---

## 4. Verification plan

1. **Unit tests:** new test verifying scanner uses ohlcCache with interval=60 (not 1-min SQL).
2. **Local TS check:** clean compile.
3. **CI green:** 4 standard checks. Pre-existing test baseline (b72/b70/cost_telemetry/dynamic_sizing) acceptable per documented exception.
4. **Staging deploy:** standard pull → build → pm2 restart.
5. **Post-deploy verification:**
   - PM2 logs: `[B79.0a][SCAN_CYCLE_DONE]` showing universe=75 (not 26), pairsScanned=75
   - DB: `module_constants` row `xstock_spot.data_freshness_window_ms` no longer exists
   - DB: `macro_feed_archive` unaffected (different code path)
   - `ohlcCache` debug: 60-min keys populated for xstock universe within first 4 cycles; 240-min keys populated for xstock universe within first 4 cycles
   - Trades: at least 1 xstock trade opens per hour during US RTH (matching pre-regression behavior of ~7/hr)
6. **Visual verify on staging:** xStocks tab Scanner Cycle Metrics shows PAIRS SCANNED jumping from ~26 to ~75. Last Scan Filter Breakdown should show similar numbers.

---

## 5. Risk + rollback

**Risk:** Live xstock signal-gen pauses for ~30 seconds during PM2 restart while ohlcCache cold-warms. Acceptable per existing crypto cold-start behavior.

**Rollback:** Standard git revert. The `xstock_spot_ohlc_1m` archive table still populates (WebSocket archiver unchanged), so reverting restores the previous data path with no data loss.

**Risk:** ORB strategy producing zero signals during transition while suspended. Acceptable — ORB was a small share of trades anyway.

**Risk:** Calibration plan revision causes scope churn. Mitigated by Kyle's explicit directive that "we'll dive into calibrating xstocks" AFTER this batch + B-NEW-33 ship. So the plan revision is informational, not blocking.

---

## 6. Sequencing

| Step | Action | Workflow |
|---|---|---|
| 1 | This design ask + your Q1-Q7 answers | Step 1 (Scope draft) |
| 2 | Pre-audit consultation w/ SIM | Step 2 |
| 3 | Code implementation | Step 3 |
| 4 | Your code review of diff (`/home/langston/inbox/b-new-34/`) | Step 4 |
| 5 | Push to migration/aws-supabase | Step 5 |
| 6 | CI green (4 checks) | Step 5 |
| 7 | Deploy + PM2 restart | Step 6 |
| 8 | CC first-pass verify (logs + DB + UI) | Step 7 |
| 9 | Your independent verify | Step 8 |
| 10 | Iterate if needed | Step 9 |
| 11 | Governance updates (calibration plan, SIM, MEMORY, Execution Flow doc) | Step 10 |
| 12 | Completion report | Step 11 |

Time-box: 1 day if Q1-Q7 don't surface scope changes; 2 days if they do.

---

## 7. Open meta-question

The other CC session that worked on DawnTrader told Kyle "The 60-minute choice for crypto is a deliberate swing-trading design, not a rate-limit workaround." Kyle agrees with that premise. My investigation could not find documented rationale for this in any canonical doc — BATCH_18_SCOPE.md only discusses the API-cost optimization, not the swing-trading design rationale.

Do you know where this rationale is documented? Or is it institutional knowledge that lives in batch discussion (Telegram/cc-inbox) rather than canonical files? If institutional, it's worth promoting to a canonical doc as part of this batch's governance step — so the next CC session doesn't have to re-discover it.

If you don't have the source either, that's also fine — we can capture Kyle's framing as the canonical rationale going forward, since he's the design authority.

---

## 8. Action requested

1. Answer Q1-Q7.
2. Flag any missing risks, scope expansions, or implementation pitfalls.
3. Confirm or modify the sequencing.
4. Confirm or revise the verification plan.
5. Address the meta-question (Q7's parent) on rationale-documentation provenance.

Reply technical — file paths, function names, line numbers welcome. CC will iterate to consensus per CLAUDE.md §6.7.

— Claude Code, 2026-05-15
