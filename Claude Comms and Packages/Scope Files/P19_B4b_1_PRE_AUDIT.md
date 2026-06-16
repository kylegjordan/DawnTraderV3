# P19-B4b.1 — PRE-AUDIT (paper fill fidelity: depth-walked fill + partials + #295 24/5 depth-sufficiency gate)

**Batch:** P19-B4b.1 · **Date:** 2026-06-16 · **Author:** Claude New (CC-B) · **Step:** 2 (pre-implementation audit)
**Basis:** `P19_B4b_1_SCOPE.md` + Langston Step-1 ACK-with-conditions (§7 of the scope). This pre-audit delivers the four Step-2 items Langston holds: (1) two MEASURED distributions, (2) the partial-fill downstream trace, (3) the SIM-vs-code resolution, (4) the three concrete homes — plus deeper per-component SIM/blast-radius, and two scope refinements the audit surfaced.

---

## §1 — TWO SCOPE REFINEMENTS THE AUDIT SURFACED (read first — they change OBJ-3 + the per-class design)

**R1 — xStock is NOT depth-feed-less. It has a real TOP-OF-BOOK depth signal, already wired.** The Step-1 scope §3.3 said "xStock has no L2 feed → conservative fallback." That was wrong about depth existing at all. Verified:
- xStock captures **top-of-book ask/bid depth in USD** (`ask × ask_qty`, `bid × bid_qty`) from the equities ticker's bid/ask SIZES, persisted to `xstock_spot_ticker_snap`.
- The scanner already median-aggregates it per symbol over a 20-min window (`scanner.ts:674-683`, `percentile_cont(0.5) ... ask*ask_qty`) into a `depthBySymbol` map, and it **already feeds the xStock liquidity gates** — `calculateXstockDepthLQ` (`imf-liquidity.ts:52`), the two-way-depth `MIN(ask,bid)` gate (`global-filter.ts:137`, `pattern-filter.ts:226`).
- **Difference from crypto:** xStock = ONE level (top-of-book), crypto = TEN levels (full L2 walk). So xStock supports a depth-SUFFICIENCY gate + a top-of-book slippage estimate, but NOT a multi-level walk.

**Consequence:** OBJ-3's 24/5 book-depth-sufficiency gate applies to **BOTH** classes (each at its granularity) — strictly better than "xStock falls back to freshness only." The depth-walked SLIPPAGE (multi-level) stays crypto-only; xStock gets a top-of-book slippage + the sufficiency gate. This is a per-asset-class design (rule-15 corollary).

**R2 — partial CLOSE should NOT exist in the paper model; closes always full-fill by walked slippage.** The partial-fill trace (§3) shows partial-CLOSE is materially more complex (position decrement + UPDATE-not-DELETE + realized-PnL-on-chunk → Langston's double-count hold). But a market EXIT realistically ALWAYS fully fills by crossing deeper book (accepting worse price). Order sizes are tiny vs book depth (§4), so modeling closes as **full-fill with depth-walked (and, beyond captured levels, penalized) slippage** is both accurate and simpler. **Decision proposed: partial fills are an OPEN-side phenomenon only; closes always full-fill.** This dissolves Langston's hold #2 by design (no partial-close → no double-count). The existing C3 "non-filled → leave open + retry" stays as the reject safety net (paper shouldn't produce it). Needs Langston Step-2 concurrence (§8 Q-A).

---

## §2 — ARCHITECTURAL REALITY (consolidated; the ground B4b.1 builds on)

**Two paper-execution paths exist; only one is the active engine.**
- **ACTIVE (Phase-19 target):** `paper-execution-engine.ts` → OrderPlacer port (`execution/order-placer.ts`), **flat** slippage (`SLIPPAGE_PERCENT = DEFAULT_SLIPPAGE×100 = 0.05%`, `exchange-defaults.ts:21` / `paper-execution-engine.ts:137`), atomic always-full, `status:'filled'`. Open seam `:2068`, close seam `:~1163`.
- **DEAD-on-active-path:** `realtime-paper-executor.ts` + `pre-execution-validator.ts` consume the proven book-walk (`slippage-fee-model.ts:91-125 calculatePriceImpact`). Verdict from the live-vs-legacy trace: `realtimePaperExecutor` referenced only by one diagnostic endpoint; `preExecutionValidator` only by `/api/trading/validate` + `intent-executor.ts:449` (#297 subsystem) + `b72-warmup`. Neither is on the orchestrator→engine path.

**Per-class depth sources (the OBJ-1 accessor design):**
- **Crypto — LIVE, 10 levels.** The active `kraken-websocket-adapter` subscribes WS v2 `book` depth=10 (`:1112,:3075`), maintains `this.orderBooks` (`handleV2BookUpdate ~:695`). ⚠️ A SECOND, dormant WS path (`market-data-ws.ts` → `market-data-coordinator.getLatestOrderBook :63,:136`) also carries `book` depth=10 but feeds only dead/diagnostic consumers — duplication (home §6).
- **xStock — top-of-book, DB-persisted.** `xstock_spot_ticker_snap` (cols `ask, ask_qty, bid, bid_qty, captured_at, symbol`). The active dispatch (`active-dispatch.ts`) carries NO depth → the accessor must source it at fill time (latest snap per symbol, same `captured_at` freshness the C3 gate uses).

**Fees need no work** — already per-class DB-tiered (`cost-model.getFrictionForAssetClass().feeRateTaker`, `module_constants.fee_model`, taker both legs). B4b.1 changes slippage + adds the sufficiency gate; fees untouched.

**Blast radius (SIM §9.14 + the engine):** the OrderPlacer seam is PRIVATE/LOW-blast (sole callers internal); the engine itself sits on the active execution path (CRITICAL) with downstream consumers: `paper_sim_trades`/`paper_sim_open_positions` writes, RTB promotion (TRADE_CLOSED), B70 archivers, calibration/EMA stores, risk-concentration. The depth read is a NEW upstream dependency of the fill seam (crypto: in-memory adapter; xStock: DB) — record in SIM.

---

## §3 — DELIVERABLE 1: TWO MEASURED DISTRIBUTIONS (live, Step-2 evidence)

### 3.a xStock top-of-book depth + freshness (staging DB, last 90min / 30min)
| Metric | Value |
|---|---|
| Ask-depth-USD (`ask×ask_qty`), 101,127 snaps / 486 symbols | p10 **$6,334** · p50 **$28,420** · p90 **$172,800** · min $144 · max $6.56M |
| Thinnest names (median ask-depth) | SUIG/USD $150 · GOTU/USD $158 · HSDT $180 · NWL $487 · SLMT $577 · CHPT $721 |
| Snapshot freshness (per-symbol gap, last 30min, 33,620 gaps) | p50 **3.2s** · p90 **58.5s** · max 1448s (quiet/off-RTH names) |
| xStock VTS order notional | fixed **$150** (`eval-cycle.ts:722` `dollarValue=150`) |

**Read:** median xStock name has ~$28K top-of-book ask depth vs a ~$150 order → trivially sufficient; the **thin tail** (SUIG/GOTU ≈ order size) is exactly where a sufficiency gate must bind. Freshness p50 3.2s ↔ the C3 15s freshness gate is consistent; the 1448s max is a quiet-name staleness case the warmth gate must fail-closed on.

### 3.b crypto live L2 book depth + update-staleness (Kraken public WS v2 `book` depth=10, 5-min live sample, 12 pairs)
| Pair | book-update gap (ms) p50/p90/p99/max | cum 10-lvl ASK notional p50 / min |
|---|---|---|
| BTC/USD | 0 / 54 / 383 / 3060 | $1.99M / $11.8K |
| ETH/USD | 0 / 30 / 242 / 1555 | $1.29M / $92K |
| SOL/USD | 0 / 53 / 373 / 1793 | $513K / $71K |
| XRP/USD | 0 / 35 / 279 / 1904 | $261K / $37K |
| ADA/USD | 0 / 11 / 278 / 1736 | $113K / **$5.6K** |
| DOGE/USD | 0 / 17 / 247 / 2228 | $266K / $13.7K |
| AVAX/USD | 2 / 109 / 708 / 2229 | $83K / $38.7K |
| LINK/USD | 1 / 80 / 549 / 1894 | $299K / $13.7K |
| DOT/USD | 2 / 323 / 2058 / **8669** | $42K / $6.8K |
| ATOM/USD | 0 / 141 / 1587 / 6311 | $27.6K / **$4.9K** |
| LTC/USD | 0 / 130 / 1022 / 3161 | $193K / $60.5K |
| UNI/USD | 1 / 77 / 479 / 1649 | $19.1K / **$2.2K** |

| crypto order notional (proxy) | VTS p50 **$62** (max $250); active engine = risk-based (`portfolio×risk% ÷ stopDist%`) → low-thousands typical |
|---|---|

**Read:** majors update **sub-second** (p50 ~0ms, p90 <60ms, p99 <400ms); thin pairs (DOT/ATOM) p99 ~1.5–2s, max 6–8.7s. → a crypto **warmth staleness bound ~3–5s** passes every healthy book and fails-closed only on a genuinely stale one. 10-level ask depth is $20K–$2M typical, but **transient thin moments dip to $2–6K** (UNI/ATOM/ADA mins). With active orders ~low-thousands, a sufficiency **MULTIPLE of ~3–10×** passes normally and **binds precisely in thin-book moments / thin alts** — the intended behavior. NB: crypto warmth bound (seconds) ≪ xStock (tens of seconds, §3.a p90 58.5s) → strongly per-class (rule-15 corollary).

**Threshold-design consequence (both classes):** the sufficiency gate is a **RATIO** — `available_depth_notional ≥ order_notional × MULTIPLE` at acceptable slippage — NOT a fixed dollar floor (order sizes vary by portfolio; depth varies by name). MULTIPLE + the warmth staleness bound are **DB-resolved per class** (`module_constants`), fail-closed (C-Q4): a MISSING threshold → refuse-fill + alarm OR deterministic warmup-seed, never a silent constant.

---

## §4 — DELIVERABLE 2: PARTIAL-FILL DOWNSTREAM TRACE (Langston holds #1 + #2)

**Open seam — sites consuming REQUESTED `quantity` that must switch to `_openFill.fillQty` for partial-open safety (8):**
`paper-execution-engine.ts` :2078 (positionValue), :2086 (log), :2092/:2096 (broadcast), :2132 (log), **:2194 (trade record qty)**, **:2268 (open-position record qty)**, :2322 (SLAL audit). The load-bearing two are :2194 + :2268 — once the persisted records carry filled qty, every downstream DB-reader (unrealized PnL :840, close PnL :1183/:1190, portfolio heat `paper-portfolio-manager.ts:531`, risk-concentration weights, B70 archives) auto-corrects. **This is Langston hold #1 — the switch-list.**

**Close seam — partial-close double-count (Langston hold #2):** TODAY safe by the C3 rule (`:1166` non-`filled` → leave open + retry; PnL never recorded on a non-fill). The risk only appears IF a future change makes the close ACCEPT a partial (then `:1183` grossPnl uses full `position.quantity`, `:1492` DELETEs the whole position → double-count on retry). **Per R2 (§1) we propose closes NEVER return partial (always full-fill by walked slippage) → hold #2 is N/A by design.** If Langston instead wants partial-close, it needs: decrement `position.quantity` by `fillQty`, PnL on `fillQty` only, UPDATE-not-DELETE. Schema supports it (`paper_sim_open_positions.quantity decimal(20,8)`, updatable) but it's a bigger surface — R2 avoids it.

---

## §5 — DELIVERABLE 3: SIM-vs-CODE xStock DEPTH DISCREPANCY → DOC-DRIFT ONLY (no live bug)

The SIM "Recent Additions (P19-B4a)" describes an xStock `entryLiquidityValue=askDepthUsd, kind='depth_usd'` capture. Resolution:
- **Code is correct + consistent:** xStock sets it in `eval-cycle.ts:756` (`askDepthUsd >= 0 ? askDepthUsd : undefined`); crypto sets `volume24h` in `vts-runner.ts:1534` (crypto-guarded → `undefined` for xStock on that path). The two paths never mix.
- **All consumers are display/telemetry + null-safe:** `formatEntryLiquidity` (`machine-learning.tsx:437` `value==null||!isFinite → '—'`), JSONL persist (`?? null`), CSV export (type-guarded). **No gate / score / sizing reads it as a number.** No `undefined`→silent-default arithmetic anywhere.
- **Verdict: DOC-DRIFT ONLY.** Fix = a one-line SIM clarification at Step-10 (note vts-runner stores `undefined` for xStock; the real xStock capture is `eval-cycle.ts`). NOT a live bug.

---

## §6 — DELIVERABLE 4: THE THREE CONCRETE HOMES (§9.4 — proposed, Langston ratifies)

1. **Dead-code sweep → NEW `RUNNING_ISSUES #300` homed to a dedicated post-B4b.1 cleanup batch (proposed `P19-B4b.2`), sequenced BEFORE B7b.** Covers: `realtime-paper-executor.ts`, `pre-execution-validator.ts` (its removal COORDINATES with the #297 intent-executor investigation, since #297's `intent-executor` is its only non-diagnostic caller), the **left-behind duplicate book-walk math in `slippage-fee-model.ts`** (created when B4b.1 extracts a fresh helper), and the dup `market-data-ws`/`market-data-coordinator` second WS `book` connection. The left-behind dup math is logged in `DELETED_COMPONENTS_LOG.md` THIS batch as "left intentionally — deleted with #300/B4b.2" (rule-18).
2. **B7b dual-gate pre-flight artifact → written into `PHASE_19_PLAN §6` THIS batch (new gate #13):** active trading BLOCKS if, per asset class being switched on, the applicable fill-quality gate is absent/unwired (crypto: depth-sufficiency gate present+wired; xStock: #236 price-discovery-liveness gate present+wired). Not a verbal promise — a written checklist row.
3. **#236 cross-ref:** at #295 close, RUNNING_ISSUES cross-references #236/B6.6 (xStock's 24/5 fill-quality guard) so the two gates' division of labor is explicit.

---

## §7 — DELIVERABLE: DEEPER PER-COMPONENT SIM / BLAST-RADIUS (Step-2 mandatory)

- **OBJ-1 accessor (NEW):** crypto reads the live adapter `orderBooks` (in-memory, depth=10) — add a typed read accessor + warmth assert; xStock reads latest `xstock_spot_ticker_snap` top-of-book + `captured_at` freshness. Both fail-closed. New SIM entry under Layer-6 Execution; new upstream edge on the fill seam.
- **OBJ-2 helper (NEW, pure):** extracted deterministic book-walk (port of `calculatePriceImpact`) + golden test (C-Q2a). RNG-free (C-Q5). Lives beside the placer; the placer gains a depth-aware path (crypto multi-level walk; xStock top-of-book). Blast radius LOW (seam is private).
- **OBJ-3 gate (replaces B4a-C3 clock):** retire `isXstockLiquidFillWindowET` from the active-fill path; add the per-class depth-sufficiency gate. Touches `market-hours.ts` (remove the active-fill caller; keep the predicate if still used elsewhere — verify at Step-3) + the xstock_fill_safety config module. Freshness + silent-stall stay.
- **Engine open seam:** the 8-site requested→filled switch + partial-open size-down (§4). Blast radius MEDIUM (behavioral change on the open path, dormant until B7b).

---

## §8 — IMPLEMENTATION CHUNK PLAN (preview) + LANGSTON STEP-2 ASKS

**Chunks:** (1) OBJ-1 per-class depth accessor + warmth assert + DB-resolved thresholds (migration seed) + tests; (2) OBJ-2 pure book-walk helper + golden test + depth-aware placer (crypto walk / xStock top-of-book) + RNG-free; (3) engine open-seam 8-site filled-qty switch + partial-open size-down + tests; (4) OBJ-3 retire clock → per-class sufficiency gate + tests; (5) governance (incl. #300, B7b gate #13, #295 close, SIM/System-Manual content, DELETED_COMPONENTS_LOG dup-math note).

**Langston Step-2 asks:**
- **Q-A (R2):** concur closes ALWAYS full-fill (depth-walked, penalized beyond captured levels) → partial is OPEN-side only → hold #2 N/A by design? Or do you want true partial-close (bigger surface)?
- **Q-B (R1):** concur the 24/5 sufficiency gate applies to BOTH classes — crypto multi-level walk, xStock top-of-book `askDepthUsd` (reusing the existing LQ depth signal) — not "xStock freshness-only"?
- **Q-C (thresholds):** concur the gate is a per-class DB-resolved RATIO (depth ≥ order× MULTIPLE) + a DB-resolved warmth staleness bound, both fail-closed (refuse+alarm or warmup-seed)? Crypto staleness bound to be set from the §3.b sample once it lands; xStock from the $28K-median / 3.2s-p50 evidence in §3.a.
- **Q-D (homes):** ratify #300 → P19-B4b.2 (pre-B7b) for the dead-code sweep, and the B7b gate-#13 artifact?

---

*Step-2 deliverable. §3.b crypto numbers fill on sampler completion, then dispatch to Langston for Step-2 review. On Step-2 PROCEED → chunked implementation.*
