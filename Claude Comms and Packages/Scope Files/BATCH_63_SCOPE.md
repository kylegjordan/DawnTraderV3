# BATCH 63 — Scope

**Date opened:** 2026-04-20
**Status:** Scope locked (Kyle approved) + Langston consensus (3 iterations)
**Phase:** 15b Sub-Phase C

> **Combined pre-audit + implementation plan** lives at [BATCH_63_PRE_AUDIT.md](BATCH_63_PRE_AUDIT.md) per Kyle's "one report" directive. This scope file is the canonical Tier-1 governance entry.

---

## Objective

Two connected problems identified in B62's 72h verification data:

1. **Strong-DBS pairs already trading are losing money** — 178 trades at |DBS|≥0.35, every signalType and pool bleeding. Existing strategies (morning_star, vwap_pullback, reverse_impulse) fire on strong-trend pairs and lose because their archetypes are reversal/pullback, not continuation.
2. **Strong-DBS pairs may be filtered OUT entirely** — DI/VN filters reject exactly the trending pairs we'd want to ride, because DI/VN are noisy proxies for what DBS now measures directly.

B63 addresses both with a pre-filter DBS computation + dedicated exclusive filter path (Path D) + new LONG-only trend-continuation strategy.

---

## Scope (9 items locked, Langston GREEN)

1. **Move DBS computation from MCE to FX5 scanner (pre-filter).** Hard contract — no fallback. MCE consumes propagated DBS.
2. **Propagate DBS end-to-end** through scanner → active filter pool / scan batch → VTS runner / signal orchestrator → MCE → strategy detect → expectancy gate → trade.
3. **Add `active_strong_trend` + `vts_strong_trend` DB filter paths.** Relaxed thresholds: DI disabled, VN ≤0.95, LQ=35, volume=$250k, corrMax=0.95. Spread stays tight, finalScoreMin held current.
4. **Route |DBS| ≥ 0.35 (positive, LONG-only) EXCLUSIVELY to Path 6.** Strong-DBS pairs do NOT enter the other 4 quant families or the pattern pool.
5. **New `strong_bull_trend` strategy** (QUANT signalType, LONG-only). N=12 Donchian breakout + 0.15×ATR buffer + DBS slope rising + anti-exhaustion (body ≤ 1.5×ATR). Entry geometry: stop 3×ATR, target 6×ATR (2:1 RR, pre-TEC).
6. **Detect() self-exclusion guards** on 5 existing strategies (morning_star, reverse_impulse, volatility_edge, defensive_hedge, vwap_pullback): `if (dbs >= 0.35) return null` — belt-and-braces against routing leaks.
7. **Path-aware Net EV kernel**: for `sourcePool='quant-strong_trend'`, `pWin = min(0.60, max(0.40, 0.40 + |DBS|/2))` — DBS supersedes DI for Path D, consistent with filter-layer philosophy.
8. **All changes ship to BOTH VTS and active-trading paths.** TEC wiring is the ONLY item deferred (B64+).
9. **Governance updates**: SIM §5.1b stale-text fix, BATCH_CATALOG / PHASE_HISTORY, MEMORY.md, this SCOPE, PRE_AUDIT, future COMPLETION_REPORT.

## Strategy parameters (Kyle + Langston locked)

| Param | Value |
|---|---|
| N (Donchian lookback) | 12 bars |
| DBS entry threshold | ≥ 0.35 (positive, LONG only) |
| DBS slope lookback | 3 bars |
| Breakout buffer | 0.15 × ATR |
| Anti-exhaustion | bar body ≤ 1.5 × ATR |
| Initial stop | 3.0 × ATR |
| Interim target | 6.0 × ATR (2:1 RR, pre-TEC) |
| Direction | LONG only |
| Path D-specific guardrails | NONE — rely on existing global guardrails |

## Verification criteria (post-deploy)

See PRE_AUDIT §8. Summary:
- Path D trade count ≥ 3 in first 2h (else routing broken)
- Strong-DBS routing share ≥ 95% to Path 6
- Existing strategies firing on |DBS|≥0.35 → ~0
- Path D TP hit rate ≥ 30% (2:1 RR, lower WR OK)
- Path D stop-out ≤ 55%
- Path D RTB rank: median top half (pWin fix working)
- Other strategies' WR on remaining trades: should improve

---

## Deferred to later batches

- **TEC shared service wiring** — B64+
- **Global DBS persistent store fix** — B64 (Item 3 of POST_B62 plan)
- **Canonical map UI sync / IE metrics** — B64 (Item 4)
- **Strong Bear Trend variant** (Path E) — post-launch
- **Bear-trend contamination fix** (guards on bear DBS) — post-launch
