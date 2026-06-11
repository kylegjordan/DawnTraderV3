# B-5 Obj-15a correctness-audit harness — design (2026-06-11)

Audit target: every AMR input recomputed from raw data vs what the system reports, judged against the §7 R4 pinned pass bars in `B_5_AMR_PRE_AUDIT_V2.md` (pinned BEFORE this audit; misses cannot be rationalized; deterministic rows EXACT, float rows |Δ| ≤ 1e-6; miss = batch NO-CLOSE).

## The structural problem this harness solves

Three of the audit rows (vote retally, DBS recompute, friction recompute) need PER-PAIR inputs that live only in process memory and are NOT retained by the published artifacts:
- The per-class regime vote iterates the MCE cache (`getDominantRegimeForClass`, market-context-engine.ts:1746) and publishes only winner/%, never the per-pair tally.
- `GlobalDbsSnapshot` retains `{value, snapshotTime, coverage, isStale}` — the per-pair scores/volumes/sentinel flags that produced `value` are local variables in `publishSnapshot()` (directional-bias-store.ts:310-325). Both classes' DBS run through this same store class (crypto + xstock instances; `mce.computeGlobalBias` is a thin delegate to the crypto store's publish).
- Friction publishes a score + n; per-symbol spreads are loop-locals.

An EXACT/1e-6 comparison is only meaningful when the recompute inputs and the system's own output come from the SAME instant — separate reads race against 30s cycles (proven live this evening: xStock flipped CALM→STORMY between two of my reads).

## AUD-1 — one-pass audit dump surface (permanent diagnostics, not a throwaway)

New read-only auth-gated endpoint `GET /api/diagnostics/amr/audit-dump`, per class returning blocks where INPUTS and the SYSTEM-COMPUTED AGGREGATE are captured in a single synchronous pass:

1. **voteDump** — new MCE method `getRegimeVoteDumpForClass(assetClass)`: refactor `getDominantRegimeForClass` onto a shared private collector (`collectClassRegimeEntries` → `[{symbol, regime, regimeScore}]`); both the existing method and the dump compute the winner from the same collected array, so dump.winner is bit-identical to what consumers see and the per-pair list is the exact tally input. No behavior change to the existing method.
2. **dbsDump** — new store method `getAuditDump()` on DirectionalBiasStore: collects current eligible entries (`[{symbol, score, volume, sentinelZero, sector}]`, honoring the xstock GICS/non-sentinel partition exactly as publishSnapshot does) and calls `computeGlobalDirectionalBias` on them in the same pass; returns entries + that computed aggregate + the latest published snapshot for reference. Exposed for BOTH instances.
3. **frictionDump** — xstock: the existing `getXstockFrictionSample()` read already returns the samples map (`bidAskSpreadPct`, capturedAt) + status; serialize it. Crypto: new `computeCryptoFrictionDump()` in market-indicators.ts sharing the existing sampling loop (universe filter + negative-spread guard) but returning per-symbol `{symbol, spreadPct}` alongside the same-pass score.

The audit script recomputes tallies/medians/averages with its OWN independent implementations (never calling production functions) and compares to the same-pass aggregates.

## AUD-2 — offline audit script `scripts/b5-amr-correctness-audit.ts` (READ-ONLY, run on staging like the B.3 replay)

Legs mapped to the pinned table:
- **Vote** (EXACT): independent majority retally over voteDump.pairs vs voteDump.winner {regime, percentage, pairCount, avgScore}. Capture leg: latest ledger rows' `votePct`/`regime` vs the `[Phase14][MarketIndicators]` log line for the matching cycle timestamp (both persisted).
- **DBS** (|Δ|≤1e-6): independent weighted-median implementation over dbsDump.entries vs dbsDump.computed.score, both classes. Capture leg: ledger `dbsScore` stamps vs `[B62][MarketIndicators]` log scores at matching cycles.
- **Friction** (EXACT formula): xstock — join recent `bidAskSpreadPct` samples against the persisted depth-readings rows (raw bid/ask, same snap row) and recompute ((a−b)/mid×100); crypto — recompute score = round(mean(computeMarketFriction(spread, slippage, fee))) from frictionDump per-symbol spreads vs same-pass score.
- **expectedEdge / netPnl** (EXACT, SQL-only): recompute from persisted ledger/trade fields per the pinned formulas; zero code needed.
- **B67.1 z-scores** (|Δ|≤1e-6): recompute (value − windowMean)/windowStd from the equity-feed state file's observation windows vs ledger `macroDetail` z stamps; crypto macro windows likewise from their store.
- **Externals**: VIX vs CBOE raw + FRED (within `vix_divergence_max_points` rail); DXY direction-only vs DTWEXBGS; BTC dom + funding vs source APIs.
- **Lifecycle**: Obj-3a boundary fixtures (already CI-green) + the last 4 weekend transitions from the scanner lifecycle record (market_events / B-NEW-36 timer logs — these predate AMR; AMR-era weekend evidence is structurally soak-dependent, first weekend upcoming) + tonight's live overnight STORMY flip as the first live session-boundary proof.
- **Side-probes** (Kyle/Langston riders): (a) negative-spread WRITER root cause (who wrote avgSpread −0.11% into cost-cache — writer inspection + occurrence count); (b) `governance_modes` wildcard-aggressive row presence check (SQL); (c) xstock `staleness[2]` identity from the live endpoint.

Evidence format per input (goes in the completion report): sample size, max deviation, pass/fail vs bar.

## Sequencing

AUD-1 diff → bench tsc/vitest → Langston in-batch review (same gate as the panel iteration) → push → CI → deploy → run AUD-2 on staging → evidence tables → NO-CLOSE rule applies to any miss.
