# P19-reorg-B2.3 — Pre-Audit (Step-2)

**Batch:** reorg-B2.3 — per-(strategy × asset_class) minRR baseline-set
**change-class:** architecture (per scope header)
**Author:** Claude New (CC-B) · **Reviewer:** Langston (Step-2)
**Date:** 2026-06-27
**Scope:** `P19_REORG_B2_3_SCOPE.md` (Step-1 Langston-cleared; §4 calibration locked; single-chokepoint canonicalization adopted Step-2 design pass)

> Covers the 10 Langston Step-2 deliverables: (1) double-gate topology · (2) §2-means-derived per-strategy floors · (3) loud-fallback incl unknown-token · (4) CI tripwire spec · (5) caller-passes-a-token proof + rrSumSq eviction-parity · (6) named queryable counter metric · (7) tripwire reads SSOT at test time · (8) SHOW THE ARITHMETIC · (9) unknown-asset_class → global-max-floor · (10) emitted-token reconciliation.

---

## §1 — EMPIRICAL FOUNDATION (live guard-eval tracker, 48h+ soak)

Source: live `/api/vts/filter-diagnostics` (crypto) + `/api/xstocks/filter-diagnostics` (xStock), `guardDrops.<strategy>` per-(strategy×class) tracker. Tracker window from 2026-06-23 19:51 UTC (>48h, soak-confirmed). **xStock floors derive from xStock's OWN data — NOT a crypto borrow (Kyle 2026-06-23).**

### crypto_spot
| strategy | evals | meanRR | rrMin | rrMax | type | suppression |
|---|---|---|---|---|---|---|
| mean_reversion | 258 | 3.204 | 2.533 | 6.205 | spread | 0.00 |
| vwap_pullback | 1432 | 2.712 | 2.000 | 3.000 | spread | 0.288 |
| strong_bull_trend | 2469 | 2.000 | 2.000 | 2.000 | fixed-RR | 0.935 |
| range_trade | 4533 | 1.901 | 0.646 | 7.589 | spread | 0.791 |
| morning_star | 7104 | 1.543 | 0.298 | 10.547 | spread | 0.835 |
| reverse_impulse | 527 | 2.662 | 0.927 | 9.351 | spread | 0.528 |
| support_bounce | 866 | **0.861** | 0.275 | 5.551 | spread | 0.954 |
| volatility_edge | 233 | **0.686** | 0.005 | 2.951 | spread | 0.871 |
| defensive_hedge | 12 | 1.175 | — | — | THIN | 1.00 |
| vwap_bounce | 48 | 2.000 | — | — | THIN | 1.00 |
| inside_bar_reversal | 8 | 1.043 | — | — | THIN | 1.00 |
| pivot_shift | 73 | 2.584 | — | — | THIN | 0.425 |

### xstock_spot
| strategy | evals | meanRR | rrMin | rrMax | type | suppression |
|---|---|---|---|---|---|---|
| morning_star | 35662 | **0.944** | 0.209 | 4.480 | spread | 0.986 |
| vwap_pullback | 11266 | 2.180 | 2.000 | 10.780 | spread | 0.865 |
| sma_trend_ride | 4637 | 2.000 | 2.000 | 2.000 | fixed-RR | 0.998 |
| pivot_shift | 870 | 2.405 | 2.000 | 5.701 | spread | 0.507 |
| vwap_bounce | 859 | 2.000 | 2.000 | 2.000 | fixed-RR | 1.00 |
| range_trade | 77 | 2.187 | 0.723 | 5.025 | THIN | 0.623 |
| mean_reversion | 2 | 2.668 | — | — | THIN | 0.00 |

---

## §2 — FLOOR DERIVATION (deliverable 2 + 8: arithmetic shown)

Formula (§4 LOCKED): **spread** (rrMin≠rrMax) → `floor = max(1.0, round(mean×0.90, 2))`; **fixed-RR** (rrMin≈rrMax) → `floor = max(1.0, round(mean−0.05, 2))`; **thin** (<200 evals) → NO per-strategy row, inherits per-class `*` default = **2.0**; **morning_star** → HELD at 1.0 pending Kyle decision (D).

### crypto_spot floors
| strategy | type | arithmetic | floor |
|---|---|---|---|
| mean_reversion | spread | max(1.0, 3.204×0.90=2.884) | **2.88** |
| vwap_pullback | spread | max(1.0, 2.712×0.90=2.440) | **2.44** |
| strong_bull_trend | fixed-RR | max(1.0, 2.000−0.05=1.95) | **1.95** |
| range_trade | spread | max(1.0, 1.901×0.90=1.711) | **1.71** |
| reverse_impulse | spread | max(1.0, 2.662×0.90=2.395) | **2.40** |
| support_bounce | spread | max(1.0, 0.861×0.90=0.775) → **CLAMP** | **1.00** |
| volatility_edge | spread | max(1.0, 0.686×0.90=0.617) → **CLAMP** | **1.00** |
| morning_star | spread | HELD (D) [formula→1.39] | **1.00** |
| defensive_hedge / vwap_bounce / inside_bar_reversal / pivot_shift | THIN | no row → `*` | **2.00** (`*`) |

### xstock_spot floors
| strategy | type | arithmetic | floor |
|---|---|---|---|
| vwap_pullback | spread | max(1.0, 2.180×0.90=1.962) | **1.96** |
| sma_trend_ride | fixed-RR | max(1.0, 2.000−0.05=1.95) | **1.95** |
| pivot_shift | spread | max(1.0, 2.405×0.90=2.165) | **2.16** |
| vwap_bounce | fixed-RR | max(1.0, 2.000−0.05=1.95) | **1.95** |
| morning_star | spread | HELD (D) [formula→0.85→CLAMP 1.0] | **1.00** |
| range_trade / mean_reversion | THIN | no row → `*` | **2.00** (`*`) |

**Per-class `*` default = 2.00** (the conservative DEFAULT thin/unseeded strategies inherit — unchanged conservative posture, replaces today's flat global 2.5).

**Max-per-class floor (deliverable 9 — the unknown-token fail-closed substitution):** crypto = **2.88** (mean_reversion); xStock = **2.16** (pivot_shift). **Global max (unknown asset_class too) = 2.88.** A drifted/unknown token resolves to these — strictly ≥ the `*` 2.0, so fail-CLOSED (stricter), never the permissive default.

### ★ FINDING for decision (D) — it governs a SET of three, not just morning_star
The data shows **three** sub-1.0-mean strategies, all structurally low-reward (mean below break-even-ish), all clamping to the 1.0 floor and staying heavily suppressed even there:
- **morning_star** — xStock mean 0.944 (35,662 ev, 98.6% suppressed), crypto mean 1.543 (less extreme but low).
- **volatility_edge** — crypto mean 0.686 (87.1% suppressed).
- **support_bounce** — crypto mean 0.861 (95.4% suppressed).

(D) is the same philosophy question for all three: trade structurally-low-reward strategies (accept many small-reward signals) or keep them suppressed and route throughput to the better-reward strategies (Phase-25 25-20). The batch holds **all three at the 1.0 clamp** regardless of (D) — so it is not blocking. Recommendation unchanged: keep suppressed at 1.0, route to 25-20; surface to Kyle that the set is three, not one.

---

## §3 — DOUBLE-GATE TOPOLOGY (deliverable 1)

*[on record — the chokepoint design makes correctness independent of topology, but the behavior is documented here]*
The per-strategy minRR gate (`getPerClassTargetGate` → `applyGlobalGuards`/`normalizeAndGateTarget`, `rr<minRR` → DROP `rr_below_min`) fires at the strategy-build sites: the 8 `strategy-engine.ts` guard sites + the 10 `server/strategies/*.ts` modules (each builds its own target → guards it), AND is read again at the orchestrator convergence (`signal-orchestrator.ts:1224`) + the VTS (`vts-runner.ts:1465`) + xStock (`eval-cycle.ts:651`) gate-resolution points. Under the single-chokepoint canonicalizer (OBJ-1: `getPerClassTargetGate` canonicalizes its strategy arg on entry), **all sites resolve the SAME canonical key → the same floor**, so there is no split-brain risk even where a strategy is gated at both its build site and at convergence. *[Step-2 to confirm: no caller invokes the gate pre-canonicalization with a non-strategy arg — see §5.]*

---

## §4 — CANONICALIZER / LOUD-FALLBACK (deliverables 3, 6, 9)

`canonicalizeStrategyName(token)` is the single SSOT, called ONCE inside `getPerClassTargetGate` on entry (OBJ-1 chokepoint). Behavior:
- **Known token** → canonical name (absorbs the `range_trading→range_trade` alias; current alias map = that single entry). Resolve `min_rr` on `{exchange:'*', assetClass, strategy:canonical, regime:'*'}`, most-specific-wins, else per-class `*`=2.0.
- **Unknown token (the load-bearing failure surface)** → MUST NOT identity-return. Emit warn + bump the named queryable counter `dawntrader_gate_unknown_strategy_total{asset_class}` (deliverable 6 — stable metric name, locked here = same string at Step-2/code/Step-8) AND resolve `min_rr` = **max-per-class floor** (crypto 2.88 / xStock 2.16), or **global max 2.88** if asset_class is also unresolved (deliverable 9). **Fail-CLOSED by construction** — the substitution is the safety guarantee, independent of whether the counter is observed; the counter is observability only. No throw (never break the eval cycle).
- **§13 home:** the counter is a TRIPWIRE (alerts if it crosses zero outside the deliberate test fixture) — homed THIS batch as a system-alert (`unknown-strategy-at-gate`), not a scroll-past warn-log.

---

## §5 — PROOFS + CI TRIPWIRE (deliverables 4, 5, 7, 10)

**Caller-passes-a-token proof (deliverable 5i):** all ~22 `getPerClassTargetGate` callers pass a strategy token — enumerated: orchestrator:1224 (`strategyId`), vts-runner:1465 (`strategy` var), eval-cycle:651 (`strategy` var), strategy-engine ×8 (literals), 10 strategy files (literals/`STRATEGY_KEY` constant). No non-strategy-arg caller (it IS the per-class TARGET gate — always called with the strategy being gated). *[Step-3 tsc confirms no other call site.]*

**Emitted-token reconciliation (deliverable 10):** orchestrator emits `StrategyType` (9 file-based: `range_trading`[the 1 drift→`range_trade`], `vwap_pullback`, `abcd_long`, `sma_trend_ride`, `breakout`, `mean_reversion`, `vwap_bounce`, `liquidity_trap`[canonical-but-skipped, not absent], `dhma`). The canonical SSOT `STRATEGY_DISPLAY_NAMES` (canonical-regime-strategy-map.ts) = 18 (9 file + 9 in-class). The orchestrator's per-strategy domain is the file-based subset; in-class strategies enter via their own strategy-file detectors. The chokepoint canonicalizes whichever token arrives, so a drift alias is normalized, never folded into a canonical slot.

**CI tripwire (deliverables 4, 7):** a unit test asserts each literal/constant token passed by the strategy-engine + strategy-file callers ∈ the canonical set, AND the StrategyType non-drift values map 1:1 — **reading `STRATEGY_DISPLAY_NAMES` AT TEST TIME (imported, not a hand-copied literal)**, so the guard can't drift from the SSOT it guards. OBJ-1 live-path test: a real `range_trade` signal through the live orchestrator resolves the seeded per-strategy floor (NOT `*`) — regression to the silent-fallback fails it.

**rrSumSq eviction-parity (deliverable 5 + OBJ-6):** begin persisting `rrSumSq` in the guard-eval tracker with the SAME eviction parity as `rrSum` (both reset together on tracker eviction) — named consumer Phase-25 25-20 (dispersion-aware floors). This batch only instruments; no consumer yet.

---

## §6 — OPEN ITEMS / Step-3 confirmations
1. Step-3 `tsc` confirms the ~22-caller enumeration is complete (no missed `getPerClassTargetGate` site).
2. The migration seeds the per-strategy rows above (crypto 7 rows + xStock 4 rows; thin strategies get NO row → inherit `*`); `*` per-class default rows set to 2.0; the old global `expectancy_gates.min_rr=2.5` is removed/superseded.
3. (D) morning_star — Kyle's open call; batch proceeds at the 1.0 clamp for all three sub-1.0-mean strategies regardless.
