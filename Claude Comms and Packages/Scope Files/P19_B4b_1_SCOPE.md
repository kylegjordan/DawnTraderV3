# P19-B4b.1 — SCOPE (paper fill fidelity: crypto depth-walked fill + partial fills + #295 book-depth-sufficiency gate)

**Batch:** P19-B4b.1 · **Date:** 2026-06-16 · **Author:** Claude New (CC-B)
**Run mode:** AUTONOMOUS with Langston (Kyle directive 2026-06-13/16 — iterate the workflow to verified-complete + verified-correct; escalate to Kyle only on no-consensus; thorough code-level + SIM + System-Manual audit; verify everything before close).
**Predecessor:** P19-B4b D5 (paper/live split-brain isolation) CLOSED 2026-06-15. B4b.1 is the **fill-fidelity half** that D5's decomposition (Langston O4) deferred.

---

## §0 — PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2 — numeric/scope deltas surfaced up front)

The Step-1.a architectural audit (3 parallel code reads + 1 live-vs-legacy trace + SIM/System-Manual read, all verify-before-edit) **corrected several standing assumptions** about B4b.1. Every delta below is evidence-backed (`file:line`) in §1.

| Item | PREVIOUSLY STATED (plan/MEMORY) | NOW (audited) | REASON |
|---|---|---|---|
| D2 "crypto order-book-depth substrate" | "build the depth feed" | **The live feed already EXISTS** — the active `kraken-websocket-adapter` subscribes the Kraken WS v2 `book` channel at **depth=10** and maintains an in-memory `orderBooks` ladder per symbol. D2 = **expose it to the fill seam + add a warmth/staleness assertion**, NOT a from-scratch build. | `kraken-websocket-adapter.ts:1097,1112,3075` + the internal `orderBooks` map. |
| Depth-walk fill math | "build it" | **A proven book-walk already exists** (`slippage-fee-model.ts:91-125` `calculatePriceImpact`) — but it lives only in **dead/dormant code** (`realtime-paper-executor.ts`, `pre-execution-validator.ts`), NEVER exercised on the active path. The active engine uses **flat slippage** via the `PaperOrderPlacer` port. D3 = wire a depth-walk into the live fill seam (reuse the proven math) + handle partials. | active fill = `paper-execution-engine.ts:2068` → `order-placer.ts:57-70` (flat). |
| D4 "validate=true round-trip + warmth" | bundled into B4b.1 | **RECOMMEND DEFER** the `validate=true` Kraken round-trip to the **#296 S3 batch** (it needs the credential-keyed rate-limit lane, which lives inside the 🔒 LOCKED `kraken.ts` and needs the formal locked-module directive #296 already carries). "Warmth" stays in B4b.1 (it's the depth-sufficiency assertion, no Kraken call). | locked-module + lane entanglement — see §3.1 + §4 Q1. |
| Asset-class coverage | implied both classes | **Crypto-first.** xStock has **NO real-time L2 depth feed** (equities WS = ohlc + ticker only). xStock keeps a documented conservative fallback; depth-fidelity is crypto (and any depth-fed class) only. | `equity-spot-archiver.ts` subscribes ohlc+ticker, no `book` channel. |

---

## §1 — AUDITED REALITY (Step-1.a findings — the ground truth B4b.1 builds on)

**A. The active paper fill is flat-slippage, atomic, always-full.**
- Open seam: `paper-execution-engine.ts:2068` → `PaperOrderPlacer.openOrder` (`order-placer.ts:57-70`): `fillPrice = intendedPrice + intendedPrice×slippage%`; `feeQuote = notional×feePct`; `slippageQuote = slippagePerUnit×qty`. Slippage% = `SLIPPAGE_PERCENT = DEFAULT_SLIPPAGE×100 = 0.05%` (`exchange-defaults.ts:21`, `paper-execution-engine.ts:137`).
- Close seam: `paper-execution-engine.ts:~1163` → `PaperOrderPlacer.closeOrder` (`order-placer.ts:76-89`): symmetric (price made worse-down for a sell).
- **Fees are already DB-tiered per asset class** (good — no fee work needed): `feePercentFor` → `cost-model.getFrictionForAssetClass(cls).feeRateTaker` (`paper-execution-engine.ts:139-149`), DB `module_constants.fee_model` (taker both legs, B-4.5).
- **Open seam treats any non-`filled` status as a BUG and SKIPS the trade** (`paper-execution-engine.ts:2071-2076`). So introducing a `partial` result requires a real **engine-seam change**, not just placer math — the open seam must learn to accept a partial (size down to filled qty + proceed) rather than skip. Close seam already has the C3 "non-fill → leave position open, retry next cycle" rule (`types.ts` C3 close-seam rule) — partial-close fits that retry contract.

**B. The depth-walk fill math exists but is DEAD on the active path.**
- `slippage-fee-model.ts:91-125` `calculatePriceImpact` walks the book level-by-level (avg fill price across consumed `[price,volume]` levels; returns 0.5% if order exceeds book). Proven, unit-test-able.
- Its only consumers — `pre-execution-validator.ts:136` and `realtime-paper-executor.ts:119` — are **DEAD/DORMANT on the active path** (verdict from the live-vs-legacy trace): `realtimePaperExecutor` is referenced only by one diagnostic endpoint (`routes.ts:~10939`); `preExecutionValidator` only by `/api/trading/validate`, `intent-executor.ts:449` (the #297 dormant live-engine subsystem), and `b72-warmup`. Neither is called by `paper-execution-engine`, `signal-orchestrator`, SQE, RTB, or TCL.

**C. The crypto L2 depth feed IS live — at depth=10 — on the active WS adapter.**
- The ACTIVE adapter `kraken-websocket-adapter.ts` (started at boot `index.ts:~963`; used by the engine for price ticks) subscribes BOTH `ticker` + `book` (`:1097,1112`; `:3075` `depth: 10`) and maintains `this.orderBooks` (`handleV2BookUpdate` ~:695). **This is the depth source B4b.1 should walk** (it is the same connection the live engine already trusts for prices).
- ⚠️ **Accretion note (rule-20 territory):** there is a SECOND, DORMANT depth path — `market-data-ws.ts` (a separate `wss://ws.kraken.com/v2` connection, also `book` depth=10) → `market-data-coordinator.getLatestOrderBook` (`:63,136`) → feeds ONLY the dead `realtime-paper-executor` + diagnostic monitors (`feed-integrity-monitor`, `parity-gate`). Two live WS connections both subscribing `book` is duplication to be reconciled (disposition in §3.2).

**D. xStock has NO real-time L2 depth feed.**
- Equities WS (`equity-spot-archiver.ts`) subscribes ohlc(1) + ticker only — no `book` channel. The `entryLiquidityValue`/`askDepthUsd` capture is **crypto-guarded** (`vts-runner.ts:1534`, `=== 'crypto_spot'`, value = `volume24h` not depth) and returns `undefined` for xStock; `askDepthUsd` elsewhere is a test sentinel. **⚠️ SIM-vs-code discrepancy to confirm at Step-2:** the SIM "Recent Additions (P19-B4a)" text describes an xStock `entryLiquidityValue=askDepthUsd, kind='depth_usd'` capture — the code trace says xStock gets `undefined`. One of them is wrong; flagged for Step-2 verification + a SIM correction if confirmed.

**E. #295 is homed HERE.** B4a-C3 shipped an RTH clock `liquid-fill-window` gate as a *proxy* for book liquidity (only because B4a had no depth feed). Kyle 2026-06-15: xStocks trade 24/5 → gate on **book-depth-sufficiency, not a clock** (the clock is wrong in both directions). RUNNING_ISSUES #295: once B4b.1 builds the depth feed + warmth + depth-walk + partials, **retire the RTH clock gate and replace with a 24/5 book-depth-sufficiency gate**. The other two C3 gates (price-freshness + silent-stall watchdog) stay (both already 24/5-correct).

---

## §2 — NUMBERED OBJECTIVES + VERIFICATION CRITERIA

**Crypto-first. Everything ships DORMANT until B7b** (active trading off) — verification is behavioral-via-unit-tests + deploy-clean + the dormant endpoints, NOT a live fill (§9.1 disclosure in §6).

**OBJ-1 — Fill-grade depth accessor + warmth/staleness assertion (D2).**
Expose the live `kraken-websocket-adapter` `orderBooks` ladder through a clean, typed read accessor the fill seam can call at order time, with a **depth-warmth assertion**: book present + fresh (within a measured staleness bound) + non-empty + enough levels/notional for the requested size. Fail-closed + observable (counter/alarm) when warmth fails — never a silent fill on a cold/empty book. Crypto-keyed; returns "no depth" cleanly for classes without a feed (xStock).
*Verify:* unit tests (warm book → accessor returns ladder; stale/empty/missing → warmth-fail signal); the staleness bound is evidence-set from a measured crypto `book`-update inter-gap distribution (mirrors the C3 freshness method); tsc-baseline no-regression.

**OBJ-2 — Depth-walked fill model + partial-fill realism (D3).**
Replace the flat-% slippage in the paper fill seam (new depth-aware placer or an extended `PaperOrderPlacer`) with a **deterministic book-walk** (reuse the proven `calculatePriceImpact` math from a pure extracted helper; **drop the stochastic Box-Muller micro-move** for reproducibility — paper EV must be analyzable). Emit `PartialFillResult` when requested size exceeds available book liquidity at acceptable slippage. **Update the open seam** (`paper-execution-engine.ts:2071`) to accept a partial (size down to filled qty + proceed) instead of skipping; close-seam partials ride the existing C3 retry contract. Fees unchanged (already per-class).
*Verify:* unit tests — full fill on deep book (avg price matches hand-computed walk); partial on a thin book (filled qty + remainingQty correct, slippage = walked avg); the open seam opens a sized-down position on a partial; the close seam retries on a partial-close; no flat-% path remains on the active seam; bench `npx vitest run` green + tsc-baseline no-regression.

**OBJ-3 — #295: retire the RTH clock gate → 24/5 book-depth-sufficiency gate.**
Remove B4a-C3's `isXstockLiquidFillWindowET` clock gate from the active-fill path; replace with a **book-depth-sufficiency gate** (the OBJ-1 warmth + "deep enough for this size at acceptable slippage") evaluated 24/5, where a depth feed exists (crypto). Keep price-freshness + silent-stall. For xStock (no depth feed), the 24/5 fill-quality guard is the price-discovery-liveness gate from **B6.6/#236** (see §4 Q3 for the sequencing dependency).
*Verify:* unit tests (deep book off-hours → gate passes; thin book any-hour → gate blocks); the retired clock predicate has no remaining active-fill caller (grep-clean); SIM + System-Manual updated to record the proxy→direct-measure swap; #295 closed.

**OBJ-4 — Governance + correctness close (every batch, §3/§9).**
Completion report (with the §9.1 scaffolding disclosure + the §9.2 deltas) + PHASE_19_PLAN §1/§5 + BATCH_CATALOG + PHASE_HISTORY + RUNNING_ISSUES (#295 close; #296/#236 cross-refs; any new homes) + MEMORY (4 copies). **SIM content update** (the depth accessor + the two-WS-path reconciliation + the fill seam's new depth dependency + the C3-gate swap) and **System-Manual content update** (Ch1 §7 slippage model: the active fill now depth-walks for crypto + partial-fill semantics; the proxy→direct gate swap) — both are in-scope architecture changes, not optional.
*Verify:* governance-files-changed list in the completion report; Langston Step-4 + Step-8; CI all-4-green on head; sync-gate both-directions 0.

---

## §3 — EXPLICIT DEFERRALS (each with a concrete named home, §9.4)

**§3.1 — D4 `validate=true` Kraken round-trip → fold into the #296 S3 batch (RECOMMENDED; Langston Q1).**
The "Kraken-vetted" half of the rule-20 high-fidelity fill (send every paper order to Kraken with `validate=true` for real-venue vetting) needs the **credential-keyed rate-limit lane** so paper's validate traffic can never throttle a live order at Phase-21 co-run. That lane lives inside the 🔒 LOCKED `kraken.ts` and requires the formal locked-module directive — which **#296 already carries**. Shipping the validate call WITHOUT the lane would be a patch (NO-PATCHES, rule-15). The existing `kraken.addOrder({validate:true})` method exists, so no locked-module edit is needed for the *call* — but the *lane* is the locked-module piece, and call+lane belong together. **Recommendation: B4b.1 = depth-fidelity (OBJ-1/2/3); the validate round-trip + the credential lane ship together in the #296 batch.** This keeps B4b.1 tight and mirrors the B6.5/B7b "separate proof from flip" discipline. (§9.1 discloses paper fill is not yet "Kraken-vetted" until #296.)

**§3.2 — Dead-code disposition (rule-18): `realtime-paper-executor.ts`, `pre-execution-validator.ts`, possibly `market-data-ws.ts`+`market-data-coordinator.ts` → named follow-up (Langston Q2).**
These are dead/dormant on the active path (§1.B/§1.C), but NOT clean cuts: `pre-execution-validator` is called by the #297 dormant live-engine subsystem (`intent-executor`) + a `/api/trading/validate` endpoint + `b72-warmup`; `market-data-coordinator`/`market-data-ws` feed live-ish diagnostics (`feed-integrity-monitor`, `parity-gate`). Per rule-18 they cannot just linger — but their blast radius is entangled with #297 and the diagnostics. **Recommendation: do NOT bundle the removal into B4b.1** (it would balloon the batch and the #297 subsystem is itself under investigation). Home it to a dedicated "dead executor + dup-WS reconciliation" cleanup, decided WITH the #297 investigation. **Open question Q2:** does B4b.1 instead REUSE `slippage-fee-model.calculatePriceImpact` (keeping that file alive + now exercised on the active path) and remove only the two truly-dead executors later — or extract a fresh pure helper and leave slippage-fee-model untouched? CC lean: extract a pure helper (decoupled, deterministic, no Box-Muller), and home the dead-executor sweep separately.

**§3.3 — xStock depth-fidelity → blocked-by-feed; documented fallback now.**
xStock has no L2 feed (§1.D). B4b.1 ships xStock with a **conservative documented fallback** (the no-book estimate or a fixed per-class slippage), and the 24/5 xStock fill-quality guard is B6.6/#236's price-discovery-liveness gate. A real xStock depth feed (if Kraken equities ever exposes a book channel, or via another venue) is a future item — home it to the Phase-19/20 boundary if/when a feed is identified (Q3).

---

## §4 — OPEN DESIGN QUESTIONS FOR LANGSTON (Step-1 ACK)

- **Q1 (decomposition):** Concur that **D4 `validate=true` + the credential rate-limit lane move to the #296 batch**, and B4b.1 = depth-fidelity core (OBJ-1/2/3)? Or do you want the validate call (without the lane) in B4b.1 as a dormant stub now? (CC: defer — call+lane belong together, lane is the locked-module piece.)
- **Q2 (reuse vs extract + dead-code):** REUSE `slippage-fee-model.calculatePriceImpact` from the active seam, or extract a fresh pure deterministic helper and leave slippage-fee-model alone? And: agree the dead-executor removal (`realtime-paper-executor`, `pre-execution-validator`, dup `market-data-ws`/coordinator) is a SEPARATE named cleanup tied to the #297 investigation, not bundled here?
- **Q3 (#295 ⇄ B6.6 sequencing):** Retiring the xStock RTH clock in B4b.1 leaves xStock with only price-freshness until B6.6's price-discovery-liveness gate lands. Acceptable since all are pre-B7b + dormant? Or should B4b.1's clock-retirement be **gated on B6.6 landing first** (so xStock is never momentarily under-guarded in the codebase, even dormant)? (CC: record the dependency; since dormant, order is flexible — but B7b's pre-flight must require BOTH.)
- **Q4 (depth-sufficiency thresholds):** the warmth staleness bound + "deep enough for size at acceptable slippage" thresholds — set from a measured crypto `book`-update + depth-vs-size distribution (evidence, mirroring C3). Agree thresholds are DB-resolved per class (no hardcoded fallback, rule-11) + fail-closed?
- **Q5 (micro-move determinism):** confirm we DROP the stochastic Box-Muller micro-move on the active fill (reproducibility > faux-realism for paper EV analysis). The book-walk + real fees already give honest friction.

---

## §5 — SIM / SYSTEM-MANUAL TOUCH-POINTS (governance preview, finalized at Step-10)

- **SIM:** new depth accessor on the adapter; the active fill seam's new depth dependency (blast radius); the two-WS-path duplication note + reconciliation home; the C3 gate swap (clock→depth-sufficiency); cross-refs #295 (close), #296 (D4 home), #236/B6.6.
- **System Manual:** Ch1 §7 (Slippage & Fee Model) — the active paper fill now **depth-walks for crypto** + **partial-fill semantics** + micro-move dropped; the proxy→direct fill-quality gate swap; reaffirm fees unchanged (per-class DB). Ch5 (PaperExecutionEngine) — open-seam partial handling.

## §6 — §9.1 SCAFFOLDING-VS-FUNCTIONAL DISCLOSURE

> 🚨 **THIS BATCH DOES NOT TURN ON ANY TRADING.** The depth-walked fill + partials + the 24/5 depth-sufficiency gate ship **DORMANT** (active trading is off until B7b). It also does NOT make the paper fill "Kraken-vetted" — the `validate=true` round-trip + credential rate-limit lane are DEFERRED to the #296 batch (§3.1). B4b.1 delivers the **depth-fidelity core** (honest crypto slippage from a real book + partial fills + the correct 24/5 gate); the venue-vetting half follows in #296, and the live exercise of all of it happens at B7b.

---

## §7 — LANGSTON STEP-1 ACK + CONDITIONS (consensus 2026-06-16 — THIS IS THE SCOPE OF RECORD)

Langston **ACK with conditions** — objective spine accepted unchanged (crypto-first OBJ-1→2→3→4), conditions all agreed by CC. Verbatim relay posted to thread 21.

- **C-Q1 (defer D4):** validate=true round-trip + credential rate-limit lane → #296. **Hold:** the §6/§9.1 "paper fill is NOT venue-vetted until #296" disclosure must survive into the completion report (don't drop it at close).
- **C-Q2a (extract + golden test):** extract a pure, deterministic, Box-Muller-free book-walk helper owned by the active seam — AND ship a **golden test pinning it to `slippage-fee-model.calculatePriceImpact`'s outputs** (same book + size → same avg fill; order > book → the 0.5% behavior). Port-and-prove, never re-derive-and-hope.
- **C-Q2b (concrete dead-code home — §9.4):** a NUMBERED `RUNNING_ISSUES` entry with a real disposition target (batch-id / roadmap phase+item), NOT "tied to #297". It must cover: `realtime-paper-executor.ts`, `pre-execution-validator.ts`, the **left-behind duplicate book-walk math in `slippage-fee-model.ts`**, AND the dup `market-data-ws`/`market-data-coordinator` second WS `book` connection. Log the left-behind dup math in `DELETED_COMPONENTS_LOG` as "left intentionally — deleted with <named home>" so a later grep doesn't read it as a missed cut.
- **C-Q3 (retire clock now + write the B7b artifact THIS batch):** retire the RTH clock now (it's not real protection); xStock keeps freshness + silent-stall. BUT write the **B7b dual-gate pre-flight assertion into PHASE_19_PLAN / B7b scope this batch** (not a verbal promise): active trading BLOCKS if, per asset class, the applicable fill-quality gate is absent/unwired — crypto: depth-sufficiency; xStock: #236 price-discovery-liveness. Cross-ref #236/B6.6 in RUNNING_ISSUES at #295 close.
- **C-Q4 (fail-closed precision + two measured distributions):** missing threshold ≠ default → **refuse the fill (warmth-fail) + alarm, OR deterministic cold-start warmup-seed** (warmup acceptable; a silent hardcoded constant is NOT). Step-2 must produce **two distinct MEASURED distributions** on live crypto books: (a) book-update inter-arrival staleness (mirror the C3 freshness method); (b) depth-notional-vs-order-size sufficiency. Step-4: Langston greps the fill seam for any literal slippage/depth constant standing in as a fallback.
- **C-Q5 (RNG-free):** drop the stochastic micro-move; Step-4 assertion = **the active fill seam is RNG-free end-to-end** (no `Math.random`, no time-seeded jitter in the helper or the placer path).
- **Step-2 blast-radius holds (both about partials not corrupting downstream accounting):** (1) partial fill must propagate **ACTUAL filled qty, not requested qty**, to risk sizing, portfolio heat, position clustering, trade-identity — trace it; (2) **partial CLOSE** must track the reduced remaining position and NOT double-count realized PnL on the already-closed chunk.
- **Promoted from §1.D footnote:** the SIM-vs-code xStock `entryLiquidityValue`/`askDepthUsd` discrepancy may be a LIVE bug, not doc drift — trace whether any gate/score CONSUMES that value expecting a number (an `undefined`→silent-default path). Resolve + correct whichever side is wrong at Step-2.

**Step-2 deliverables Langston will hold the pre-audit to:** the two measured distributions; the partial-fill downstream trace; the SIM-vs-code resolution; confirmation the three concrete homes land (dead-executor sweep #, B7b dual-gate pre-flight artifact, #236 cross-ref).

---

*Step-1 CLOSED — Langston ACK-with-conditions, consensus reached (no Kyle escalation). Next = Step-2 pre-audit per the §7 deliverable list → `P19_B4b_1_PRE_AUDIT.md` → Langston Step-2 → chunked implementation.*
