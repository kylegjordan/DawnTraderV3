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
| morning_star | spread | max(1.0, 1.543×0.90=1.389) | **1.39** |
| support_bounce | spread | max(1.0, 0.861×0.90=0.775) → **CLAMP** (sub-1.0 mean) | **1.00** |
| volatility_edge | spread | max(1.0, 0.686×0.90=0.617) → **CLAMP** (sub-1.0 mean) | **1.00** |
| defensive_hedge / vwap_bounce / inside_bar_reversal / pivot_shift | THIN | no row → `*` | **2.00** (`*`) |

> **★ CORRECTION (Langston Step-2):** crypto morning_star mean = 1.543 (NOT sub-1.0) → it gets its ordinary **formula floor 1.39**, NOT a "held at 1.0". Holding it at 1.0 would LOOSEN its gate by 0.39 RR (admit the 1.0–1.39 band calibration drops) = unsuppress-as-side-effect, which scope §4-D forbids. (D) is reserved strictly for the genuinely sub-1.0-mean cases below.

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

### ★ FINDING for decision (D) — only ONE cell is a real (D) call, and (D) changes ZERO floors this batch (Langston Step-2 corrected)
Three strategies have a **sub-1.0 mean RR**, and all three clamp to the 1.0 floor *by formula, regardless of (D)* — so (D) is irrelevant to their floors:
- **morning_star (xStock)** — mean 0.944 → formula 0.85 → clamp 1.0.
- **volatility_edge (crypto)** — mean 0.686 → formula 0.62 → clamp 1.0.
- **support_bounce (crypto)** — mean 0.861 → formula 0.78 → clamp 1.0.

**morning_star on crypto is the ONLY real (D) cell** — mean 1.543 (NOT sub-1.0), formula floor 1.39. Seeding it at 1.0 would be a discretionary override *below* its data-derived floor = a loosening (scope §4-D forbids). **This batch seeds it at the formula 1.39**; (D) later decides whether to push it *higher* (to suppress) — never to 1.0.

**So (D) changes ZERO floors this batch** (all floors are formula-set). (D) is a pure **Phase-25 25-20 throughput-philosophy** question.

**★ METHODOLOGY CORRECTION (Langston Step-2) — this batch makes NO net-expectancy / "stays suppressed" claim, and must not:**
- **Mean RR ≠ Net Expectancy.** A low-RR / high-win-rate strategy can be net-POSITIVE (the entire mean-reversion family is). Whether to trade vs suppress a low-RR strategy needs realized **win-rate × RR − friction per strategy** — which this batch does NOT have. So we do NOT assert these strategies are net-negative or should be suppressed; that is precisely the 25-20 question (25-20 owns the win-rate calibration).
- **The suppression %s are NOT decision-grade for post-batch behavior (§5 rule 13).** They are `rrDrops/evals` measured under TODAY's flat `*`=2.5 gate (verified: the only live min_rr rows are crypto/xStock `*`=2.5). After this batch most floors DROP, so those percentages do not describe post-batch behavior. (Data-integrity note resolved: strong_bull_trend showing 93.5% not 100% under 2.5 despite fixed-RR 2.0 is NOT a floor anomaly — `rrSuppressionRate`'s denominator is TOTAL evals including atr/stop/reach short-circuits that never reach the RR check; the 6.5% gap is those short-circuits, current floor confirmed 2.5.)

**Recommendation to Kyle:** the floors are set by the data-derived formula and the batch unsuppresses nothing (§4-D satisfied). (D) — whether to push the structurally-low-mean strategies higher (suppress) or invest in making them tradeable — is a **net-expectancy/throughput question for 25-20**, NOT decidable from RR here. One real (D) cell (crypto morning_star), held at its formula 1.39 pending that decision.

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

## §6 — OPEN ITEMS / Step-3 confirmations + Step-4 carry-forwards
1. Step-3 `tsc` confirms the ~22-caller enumeration is complete (no missed `getPerClassTargetGate` site).
2. The migration seeds the per-strategy rows above (**crypto 8 rows**: mean_reversion 2.88, vwap_pullback 2.44, strong_bull_trend 1.95, range_trade 1.71, reverse_impulse 2.40, morning_star **1.39**, support_bounce 1.00, volatility_edge 1.00; **xStock 4 rows**: vwap_pullback 1.96, sma_trend_ride 1.95, pivot_shift 2.16, vwap_bounce 1.95; xStock morning_star 1.00 also seeded; thin strategies get NO row → inherit `*`); `*` per-class default = 2.0; the old global `expectancy_gates.min_rr=2.5` removed/superseded.
3. (D) — Kyle's open call; **changes ZERO floors this batch** (the three sub-1.0 cases clamp to 1.0 by formula; crypto morning_star is 1.39 by formula). Pure Phase-25 25-20 throughput question.

### Step-4 carry-forwards (Langston — verify CONCRETELY at the diff, not re-assert)
- **CF-1 — no-non-strategy-arg caller:** the chokepoint-correctness claim rests on every `getPerClassTargetGate` caller passing a strategy token. Step-4 must verify it tsc-concretely (22-caller enumeration, every arg traced to a strategy token) — if even one passes a non-strategy token pre-canonicalization, the single-chokepoint guarantee breaks.
- **CF-2 — rrSumSq eviction parity = SAME code path:** `rrSumSq` + `rrSum` must be evicted by the SAME eviction function touching both atomically — NOT two parallel evictions that happen to align (a §8#11 patch; if they drift, reconstructed σ is over a different sample than the mean = garbage for 25-20). Step-4 reads the eviction function.

### FYI-to-Kyle (Langston — not a blocker)
- **mean_reversion-crypto 2.5→2.88 flips the system's BEST-RR strategy from 0%→non-zero suppression.** Its rrMin is 2.533 (currently under the 2.5 floor → nothing drops); at 2.88 the 2.533–2.88 band starts getting cut. By-design (notch below its own mean; the Net-Expectancy gate is the real downstream judge) — but the one strategy getting *stricter* is the strongest one, and that's intentional, not a misfire.

### Step-10 governance homes (Langston §13/§18 — name now, land at close)
- **SIM** — content update to the **Cross-Cutting Runtime State / Singletons & Liveness Registry** (the `canonicalizeStrategyName` chokepoint is new cross-cutting runtime state + the gate-resolution path changes) PLUS the per-class gate-resolution component entry. NOT just BATCH_CATALOG/PHASE_HISTORY.
- **System Manual** — content update to the signal-pipeline / gate chapter: the per-(strategy×class) floor-derivation method + the double-gate topology.
- (Standard Tier-1 still applies: BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, RUNNING_ISSUES, completion report, MEMORY.)
