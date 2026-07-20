# B-REGIME-REFRESH-PIPE — SCOPE (Step 1)

**change-class: architecture**
**Owner:** CC-A · **Date:** 2026-07-21 · **Co-design:** Langston (Kyle delegated design→completion to CC-A + Langston, full autonomy, urgency: trading live, ~54/55 refreshed signals rejecting)
**Follows:** B-REGIME-INPUTS-LIVE (`6d22a9b63` deployed) — this closes the coverage gap that batch EXPOSED.

---

## 1. THE PROBLEM, CONFIRMED AT CODE (not inferred)

The RTB refresh (30s cadence) recomputes `regimeWeight` and, since `6d22a9b63`, reads live regime inputs via `readRegimeInputs → getCachedContext`. It rejects on a miss (fail-loud, correct). **Live: 54 of 55 queued pairs miss → reject.** Root cause, traced:

- **The MCE computes regime context ONLY for FX5 survivors** (signal-orchestrator.ts:1620) + xStock survivors (eval-cycle.ts:368). `getCachedContext` is a passive read of that survivor-populated, 60s-TTL cache.
- **The scanner DELIBERATELY EXCLUDES queued/traded pairs from the survivor set** (market-scanner.ts:773 — `if (poolSymbols.has(sym) || activeTradeSymbols.has(sym)) skip`), and the pool's 5-min TTL does not refresh in place. So a pair, once queued or traded, cycles OUT of the survivor set → MCE stops computing it → its cache goes cold → the refresh misses.
- ⇒ The exclusion is **BY DESIGN** (avoid re-signaling an already-queued/traded pair). The refresh has the OPPOSITE need: fresh regime for exactly those queued pairs. Two purposes, one engine — they conflict. **The refresh needs its own path to fresh regime.** (Kyle's architecture call.)

**History (provenance-confirmed):** the refresh (born 2025-12-14) predates the MCE (2026-03-03) by ~3 months; the MCE's own commit wired only the orchestrator + VTS, never the refresh. The refresh's regime inputs were placeholder constants (0.015 vol / 0.5 trend) — a volatility source whose data-filler (`updateVolatilityData`) was written 2026-01-08 and NEVER wired to any caller. So the pin was unfinished scaffolding, not a design choice.

## 2. OBJECTIVE

**Give the RTB refresh fresh, live regime inputs (volatility + trend) for every queued pair, computed at refresh time, without re-introducing a substituted constant and without the pool-drain.** When genuinely no data exists, still fail-loud (reject) — but that should become RARE, not 54/55.

## 3. THE DESIGN — two options; CC-A recommends A, Langston to rule

**Both** compute fresh regime for queued pairs via the EXISTING `mce.computeContext(...)` (which returns `RegimeCalculationResult` with live `volatility` + `adx` — exactly what `readRegimeInputs` extracts). Both carry the **queue-time DBS** from the signal metadata to satisfy the MCE's B63 hard-contract (`market-context-engine.ts:1179` THROWS for crypto without DBS). **★ This is SAFE and is the load-bearing simplification: the SIM confirms `regimeWeight` is "signal-level vol only" — DBS is NOT a regimeWeight input. DBS only satisfies the run-contract + sets the regime LABEL; the number we gate on is derived from price-math volatility + ADX, DBS-independent. A stale-by-minutes DBS cannot corrupt the regimeWeight.**

- **OPTION A (CC-A rec) — refresh self-computes on cache-miss.** `readRegimeInputs`, on `getCachedContext` returning null, actively calls `computeContext(symbol, ohlc, price, volume, undefined, dbsFromMetadata, assetClass)`, then extracts volatility+adx. computeContext caches its result (warms the 60s cache for any sibling read). Smallest surface — a contained change to `regime-inputs.ts` + threading the queued signal's DBS/OHLC in. Reuses computeContext + both OHLC caches. No new background loop. Ships fastest, lowest coordination risk. **Cost:** computeContext per queued symbol per 30s cycle (~54); the regime math is CPU-cheap; OHLC is cache-served (crypto ohlc-cache; xStock xstock-ohlc-cache serves fresh recent bars via a live 24h 1m-overlay).
- **OPTION B (Kyle's described shape) — a dedicated "queued-pairs" MCE pipe.** A background loop runs the RTB-queued set through computeContext on a timer, TAGGED, keeping the cache warm so the refresh's passive `getCachedContext` hits. Cleaner separation of concerns; more new code (loop + lifecycle + tag routing). Same outcome.

**CC-A lean: A.** Same result as Kyle's intent (queued pairs get fresh MCE regime), far smaller/contained change to code CC-A already owns, reuses everything, no new loop — best fit for the urgency + lowest-risk bar. B if Langston wants the hard separation.

## 4. OPEN DECISIONS FOR LANGSTON (Step-1)
- **Q1 — A vs B.** (CC-A: A.)
- **Q2 — DBS: carry queue-time (CC-A rec, SIM-safe) vs recompute fresh.** Carrying is simpler and regimeWeight-safe; recompute needs directional-bias-store access + is heavier.
- **Q3 — `volume24h`.** computeContext takes it; queued xStock rows carry NULL (by design), crypto non-pool rows may lack it. Does the volatility/adx path need volume, or only the regime-label/classifier path? (Pre-audit will trace; flagging as a Step-2 item.)
- **Q4 — xStock stale 60m snapshot.** Analyst found `xstock_spot_ohlc_60m_snapshot` 3 days stale; the cache's live 24h 1m-overlay still yields FRESH recent bars (enough for ATR/ADX), so this design is NOT blocked — but the stale snapshot is a real separate defect. Confirm we ride the fresh overlay here and file the snapshot stall to the xStock-freshness work (#441), not this batch.

## 5. VERIFICATION (a fix that cannot be faked)
1. **Reject rate collapses:** `mce_context_absent` refresh rejects drop from ~54/55 to near-zero (only genuinely dataless symbols).
2. **DISTRIBUTION holds:** refreshed `regimeWeight` stays a real spread (not re-pinned) AND at least one genuine below-floor (<0.30) admission-rejection is observed — the acceptance test B-REGIME-INPUTS-LIVE could not reach.
3. **No pool-drain:** queue depth stable; promotions resume.
4. **NO substituted constant:** no path scores on 0.015/0.5; a genuine no-data case still rejects (fail-loud preserved).
5. **UI (§9.3):** Filter Diagnostics / RTB surfaces on staging show the change.
6. **Perf:** refresh cycle time does not blow up under the added computeContext calls (measure p50/p90 cycle duration pre/post).

## 5.5 STEP-1 RESOLUTION (CC-A + Langston consensus 2026-07-21)

**Q1 → A1, implemented as a NEW PURE METHOD ON THE MCE.** Langston ruled A1 (not close): warming via `computeContext` is rejected because it entangles the desired cache-write with FIVE side-effects — `regimePhaseStore.tick` (mce:~1310), `this.cache.set` (:1373, split-brain vs the 60s MCE cycle that owns the cache), `directionalBiasStore.updatePair` (:1393, persistent DBS-store corruption), `emitMceTelemetry`, and `archivePairScan` (:1432, ~155k rows/day). A `skipArchive` flag is a 3+-flag patch on a hot core fn (§8 #11). **Instead:** add `computeRegimeInputsOnly(symbol, ohlcData, propagatedDbs, assetClass): {volatility, adx} | null` to the MCE — it reuses the MCE's OWN per-pair config assembly (private `regimeLookbacksByClass` merge + `getMacroConfigForClass` [:554, public]), calls the PURE `calculatePairRegime` (market-regime.ts:231 — `computeVolatility/Momentum/ADX` + dispatch, no cache/DB/archive), returns `{volatility, adx}`. **ZERO of the five side-effects.** Keeping it on the MCE (vs replicating config-assembly in the refresh) avoids config drift. The refresh (`ready_to_buy_service.ts:829`) calls this on the queued pair; `readRegimeInputs` (the pure cache-router) is UNTOUCHED — B-REGIME-INPUTS-LIVE's contract preserved.

**Q2 → carry queue-time DBS. SAFE (Langston verified at code):** `regimeWeight = trendStrength×0.70 + (1−min(1,vol))×0.30`, `trendStrength = adx/50`; both price-math from `ctx.raw.{volatility,adx}`; DBS only populates the regime LABEL/routing (mce:1179). A stale-by-minutes DBS cannot move the gated number.

**Q3 → CLOSED.** `calculatePairRegime` takes no volume param; vol/adx are OHLC-derived. NULL-volume xStock rows are fine.

**Q4 → ride the fresh 1m aggregation; #441 owns the 60m-snapshot stall.** PROVEN (Analyst): `xstock_spot_ohlc_1m`+crypto 1m FRESH; `_60m_snapshot` 3-days stale. NOT-YET-PROVEN (my inference, VERIFY at Step-2 before relying): the in-memory 24h 1m-overlay yields ≥atrPeriod fresh HOURLY buckets for a fallen-out xStock. Verification hook: assert an xStock queued pair gets FRESH VARYING vol/adx (not just crypto), else a non-fresh overlay silently rejects xStock rows.

**FINDING 3 → REJECT-ON-SPARSE-BARS (fail-loud; Analyst tags it a live #546 instance).** `computeATR` returns 0 when `ohlc.length < atrPeriod` — an ABSENCE collapsing into a valid-looking 0 (reads as low-vol = inflated regimeWeight). `computeRegimeInputsOnly` returns `null` (→ reject) when `ohlc.length < atrPeriod`, NEVER scores on vol=0. Absence stays absence.

**LABEL-LEAK → CLEAN.** The refresh reads a STORED queue-time regime label (`ready_to_buy_service.ts:2169 meta.regime`), which A1 never recomputes or overwrites — A1 discards `calculatePairRegime`'s label and uses only vol/adx. No stale-DBS label is introduced. (Step-2: confirm :2169's `regime` usage is display/telemetry, not a decision branch.)

**THROTTLE-BASELINE → ALREADY SETTLED, not a Kyle blocker.** The geometry-throttle activation was Kyle-delegated to CC-A+Langston, consensus = ship-as-is (option 1), DEPLOYED in `6d22a9b63`. Alert `011a7839`'s body predates that consensus and is stale on the "blocked on a Kyle scope call" line. This batch COMPLETES the throttle's activation with real baselines (the refresh will write live volatility back once it can compute it), which is the ship-1 behavior already approved.

## 6. OUT OF SCOPE
- The xStock 60m snapshot capture stall (→ #441 / xStock-freshness).
- Item-3 retry-limit + kick-out for genuinely-dataless queued signals (separate; this batch makes misses rare, so the retry-forever is far less pressing).
- The 0.30 floor value (Phase-25 calibration, unchanged).
