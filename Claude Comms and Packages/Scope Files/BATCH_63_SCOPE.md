# BATCH 63 — Scope

**Date opened:** 2026-04-20
**Last updated:** 2026-04-21 — post-72h-audit expansion (items 10-19)
**Status:** Scope locked (Kyle approved 2026-04-20, expanded 2026-04-21) + Langston consensus (multiple iterations)
**Phase:** 15b Sub-Phase C

> **Combined pre-audit + implementation plan** lives at [BATCH_63_PRE_AUDIT.md](BATCH_63_PRE_AUDIT.md) per Kyle's "one report" directive. This scope file is the canonical Tier-1 governance entry.

---

## Objective

Three connected problems surfaced across B62 verification and the post-72h counterfactual audit:

1. **Strong-DBS pairs already trading are losing money** — existing strategies (morning_star, vwap_pullback, reverse_impulse) fire on strong-trend pairs and lose because their archetypes are reversal/pullback, not continuation. Counterfactual audit confirmed that widening stops does not rescue morning_star — the archetype is the problem.
2. **Strong-DBS pairs may be filtered OUT entirely** — DI/VN filters reject exactly the trending pairs we'd want to ride, because DI/VN are noisy proxies for what DBS now measures directly.
3. **Mirror-defect + geometry mauling** — LONG-only strategies were opening against strong NEGATIVE DBS (94 trades in B62 72h window); mode-overlay was silently squashing strong_bull_trend's 2:1 RR to 1.33:1 or worse in DEFENSIVE/SURVIVAL states; stability framework has not been revalidated since Phase 11.7R and may be fundamentally miscalibrated post-B62.

B63 addresses all three through a combination of **implementation** (Items 1-14, 16) and **audit-only investigations** (Items 15, 17-19) that produce evidence for B64+ decisions. Paper trading goes live after implementation; audits run in parallel during the observation window.

---

## Scope summary — 19 items

| # | Item | Type | Sub-phase |
|---|---|---|---|
| 1 | DBS computation moves pre-filter | Implementation | Core B63 |
| 2 | DBS end-to-end propagation | Implementation | Core B63 |
| 3 | Strong-trend DB filter paths | Implementation | Core B63 |
| 4 | Strong-DBS exclusive routing to Path D | Implementation | Core B63 |
| 5 | `strong_bull_trend` strategy | Implementation | Core B63 |
| 6 | Detect() self-exclusion guards (existing strategies) | Implementation | Core B63 |
| 7 | Path-aware Net EV kernel | Implementation | Core B63 |
| 8 | Ship to VTS + active-trading paths | Implementation | Core B63 |
| 9 | Governance updates | Documentation | Core B63 |
| 10 | Counter-trend LONG guards (mirror-defect fix) | Implementation | Post-audit |
| 11 | `vwap_pullback` promotion into strong-trend lane | Implementation | Post-audit |
| 12 | Strong-trend geometry override plumbing | Implementation | Post-audit |
| 13 | Observation & decision gate for `strong_bull_pullback` | Decision gate | Post-audit |
| 14 | Strong-trend lane mode-overlay bypass | Implementation | Post-audit |
| 15 | Multi-lever adaptive framework audit | **Audit-only** | Framework |
| 16 | Global DBS architecture fix | Implementation | Framework |
| 17 | High-DBS exclusivity review | Decision gate | Framework |
| 18 | Full SQE audit | **Audit-only** | Framework |
| 19 | Classifier cadence / latency audit | **Audit-only** | Framework |

**Implementation items (1-14, 16):** ship within B63, enable paper active trading.
**Audit-only items (15, 18, 19):** produce evidence in parallel during observation; action in B64+.
**Decision gates (13, 17):** recorded commitments to revisit with observation data.

---

## Core B63 scope (Items 1-9, Langston GREEN)

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

---

## Post-audit additions (Items 10-14, Langston + Kyle consensus 2026-04-20)

Source evidence: `BATCH_63_COUNTERFACTUAL_AUDIT.md` — exit-only replay of 90 bullish high-DBS LONG trades from B62 72h window + 94-trade mirror-defect summary.

### Item 10 — Counter-trend LONG guards (mirror-defect fix)

Add strategy-level guard mirroring B63 Item 6's positive-DBS exclusion, on the negative-DBS side. Applied to LONG-only strategies where the pair's directional bias is strongly opposite the trade direction.

**Guard:**
```ts
if ((indicators.dbsScore ?? 0) <= -0.35) {
  setNullReason('b63b_counter_trend_long_exclusion');
  return null;
}
```

**Applied to:** `morning_star`, `reverse_impulse`, `defensive_hedge`, `sma_trend_ride`. NOT applied to `vwap_pullback` — its full DBS logic is restructured in Item 11.

**Null-reason string:** `b63b_counter_trend_long_exclusion` (distinct from `b63_strong_dbs_exclusion` so logs can distinguish the two gates).

**Expected impact:** eliminates ~94 losing-LONG-on-downtrend trades per 72h window at zero offsetting cost. Strategies continue to fire on DBS ∈ (-0.35, +0.35) where their archetype fit is appropriate.

### Item 11 — `vwap_pullback` promotion into the strong-trend lane

Remove vwap_pullback's Item 6 self-exclusion at `dbsScore >= 0.35`. Instead:
- Route vwap_pullback as **additional eligible detector** in the strong-trend filter path (sourcePool `quant-strong_trend`, co-equal with `strong_bull_trend`).
- When vwap_pullback fires through the strong-trend lane, apply **strong-trend geometry override**: stop = 4×ATR, target = 3R (Variant E from audit). Normal vwap_pullback on low-DBS pairs retains current geometry.
- Add mirror-defect guard for vwap_pullback: `if (dbsScore <= -0.35) skip` — covers the 15 counter-trend mirror cases the audit found.

**Ordering / conflict rule (implemented 2026-04-21, first-claim-wins):** if both `strong_bull_trend` and strong-trend-mode `vwap_pullback` fire on the same pair in the same cycle, the FIRST strategy whose signal results in an open trade claims the pair. Subsequent lane-eligible strategies on the same pair+cycle return null with reason `strong_trend_lane_conflict`. This uses the same first-claim-wins pattern as the existing per-strategy duplicate guard (Batch 19G).

**Strict R-multiple arbitration deferred** as a future enhancement. Would require collecting all lane-eligible signals before opening any (larger refactor than warranted for this stage). Upgrade if post-deploy observation shows first-claim-wins produces wrong outcomes. Practically, the two strategies rarely satisfy their entry conditions on the same bar (vwap_pullback needs pullback-to-VWAP + reversal pattern; strong_bull_trend needs Donchian breakout + anti-exhaustion), so same-cycle conflicts should be uncommon.

**Expected impact:** recovers the pullback-resumption archetype on trending pairs. Audit Sum R baseline +2.0; Variant E +4.1 on n=19. Small sample — must observe live.

### Item 12 — Strong-trend geometry override plumbing

Introduce a lightweight routing-context geometry override so the strong-trend lane can supply stop/target multipliers to its detectors without hard-coding DBS-conditional branches inside each strategy.

**Shape:**
```ts
interface StrongTrendGeometryOverride {
  stopAtrMultiplier: number;     // 4.0 for Variant E
  targetAsRMultiple: number;     // 3.0 for Variant E
}
```

Passed through routing context alongside `sourcePool`; detectors that support override (`vwap_pullback` initially) consume it in place of their default geometry constants.

**strong_bull_trend does NOT use this override** — its geometry (3×ATR / 6×ATR) is locked per core B63 scope.

**Design rationale (Langston):** routing carries the geometry, not a hidden branch inside the strategy. Makes the "strong-trend lane" a first-class concept that future strategies (eventual `strong_bull_pullback` if needed) inherit from without re-implementing their own DBS gate.

### Item 13 — Observation & decision gate for dedicated `strong_bull_pullback`

After deploy, observe vwap_pullback-in-strong-trend-lane performance for **minimum 1 week** (target ≥ 20 closed trades through the strong-trend lane) before deciding whether to build a dedicated `strong_bull_pullback`.

**Pre-registered decision criteria:**
- IF strong-trend-lane vwap_pullback WR ≥ 55% AND Sum R > 0 over observation → KEEP as-is, no new strategy.
- IF WR ∈ [45%, 55%) OR Sum R marginal → tune geometry, re-observe 1 more week.
- IF WR < 45% OR Sum R ≤ baseline Sum R → **build dedicated `strong_bull_pullback`** as a B64+ item with purpose-built detection separate from vwap_pullback.

No code for Item 13 — it's a decision gate recorded here so it's not forgotten.

### Item 14 — Strong-trend lane bypass of mode overlay

**Problem:** existing mode-overlay (NORMAL/DEFENSIVE/SURVIVAL) applies asymmetric multipliers to stop/target distances globally. In DEFENSIVE: stop×1.2, target×0.8 → 2:1 RR becomes 1.33:1. In SURVIVAL: stop×1.5, target×0.6 → ratio 0.8 (target closer than stop, inversion).

Observed live: every sbt trade in the CSV was sitting at 1.33:1 or 0.8:1 instead of the designed 2:1. The strategy-level logic is correct; mode-overlay is silently neutering it.

**Fix:** lane-based bypass. Any trade with `sourcePool === 'quant-strong_trend'` uses its **native** geometry, skipping mode-overlay multipliers.

**Implementation (`server/services/vts-runner.ts` near line 1072):**
```ts
const STRONG_TREND_LANE = 'quant-strong_trend';
const useNativeGeometry = sourcePool === STRONG_TREND_LANE;
const adjustedStopDistance = useNativeGeometry
  ? stopDistance
  : stopDistance * modeOverlay.stopLossDistanceMultiplier;
const adjustedTargetDistance = useNativeGeometry
  ? targetDistance
  : targetDistance * modeOverlay.takeProfitDistanceMultiplier;
```

Same change applied wherever mode-overlay is consumed on the active-trading path (paper-execution-engine, signal-orchestrator). **Ship to BOTH VTS and active-trading paths** per Item 8.

**Rationale:** mode-overlay's asymmetric target/stop multipliers are defensible for reversal archetypes (grab profits fast in choppy markets). They are destructive for continuation archetypes (trend-riders need room to capture the full trend). The bypass is SCOPED to the strong-trend lane only — reversal strategies keep mode-overlay and its choppy-market adaptation.

**In-flight trades:** NOT modified. Current open trades close under their existing geometry. Fix applies to new signals from deploy forward.

---

## Framework additions (Items 15-19, Kyle + Langston consensus 2026-04-21)

Context: the post-audit + mode-overlay investigation surfaced several framework-level questions that go beyond individual strategy fixes. Kyle was explicit that (a) don't react to current market conditions with changes that break other conditions, (b) the adaptation framework needs to be **bidirectional** (dampen cold archetypes AND favor hot archetypes), (c) adaptation needs to be **timely** (current classifier has 7-day-bound inputs that can't respond to 2-6h condition shifts), and (d) we need **multiple levers** not just mode-overlay geometry.

Items 15, 18, 19 are **audit-only in B63** — they produce evidence for B64+ framework decisions. Item 16 ships as implementation. Item 17 is a decision gate.

### Item 15 — Multi-lever adaptive framework audit

**Scope:** evaluate the entire stability + mode-overlay framework — inputs, outputs, mechanisms — and produce evidence on whether the current single-lever design is sufficient or needs to become a multi-lever adaptive system.

**Three-level audit structure. Each level gates the next.**

**Level 1 — Framework question.** Is the current single-lever (mode-overlay geometry) framework the right mechanism for adapting trading behavior to market conditions? Kyle's framing: the system should be capable of (a) dampening cold archetype families, (b) favoring hot archetype families, (c) near-full brake in genuinely dangerous conditions (ultra-rare high-confidence setups only), (d) all-gas when broad conditions support it, (e) proportional response between these extremes. This is a **multi-lever adaptive framework** that the current single-lever design cannot deliver.

Langston's framing: "All brake, no steering." Current system answers "how dangerous is the environment?" (gating) but cannot answer "which archetypes are fitting the environment?" (rotation). Both signals are needed; they answer different questions.

**Level 1 verdict (pick exactly one):**
- **KEEP** — the current single-lever framework shape is the right mechanism; proceed to input review for recalibration only.
- **MODIFY** — the framework shape is partly right but needs additional levers / structural changes; proceed to input review for redesign.
- **REPLACE** — the framework shape is fundamentally wrong and should be replaced with a multi-lever adaptive framework; proceed to input review for redesign.

Level 1 deliverable: explicit KEEP / MODIFY / REPLACE verdict with evidence, and if MODIFY or REPLACE is selected, a sketch of what multi-lever architecture is proposed. Candidate levers already identifiable in the system: gating strictness (SQE thresholds), family weighting / rotation (signal selection priority), rare-setup-only mode (confidence floor raised), mode-overlay geometry (current lever), per-archetype position sizing, RTB queue ordering weights, pool eligibility rules.

**Level 2 — Inputs question.**

- **If Level 1 verdict = KEEP:** input review for **recalibration** — are the current 4 stability inputs (driftScore, volZ, regimeConfidence, flipRate) still the right inputs for the existing framework, and do their thresholds need adjustment?
- **If Level 1 verdict = MODIFY or REPLACE:** input review for **redesign** — what signals SHOULD feed the proposed multi-lever adaptive framework? Don't narrow to Kyle's examples (global regime, global DBS) — survey what metrics could drive adaptive response. Current 4 inputs may or may not be retained.

Specific sub-questions:
- Is **archetype-fit / family-level rolling performance** a missing input class? The 7d streakiness data (70-consecutive-loss runs) suggests yes.
- Are any current 4 inputs REDUNDANT or actively MISLEADING post-B62?
- Is `flipRate` at 7-day lookback structurally too slow to be a useful real-time signal?
- Is `driftScore`'s DRIFT_CANONICAL table (calibrated pre-B62) still producing meaningful distance measurements given post-B62 regime distribution shifts?

**Level 3 — Calibration question (only if Level 1 verdict = KEEP AND Level 2 confirms current inputs remain the right inputs).** Threshold calibration against observed distributions.

**Empirical ride-along (all three levels):** use actual simulated trades from past 2-4 weeks. Segment by:
- **Archetype family** — trend/continuation, reversal/pullback, breakout, oscillator/defensive, pattern. Averages alone will lie; a framework could be right for reversals and wrong for trend-riders.
- **Market condition** — as best we can label historical windows (stable, transitioning, unstable).
- **Mode that was active at the time** — NORMAL, DEFENSIVE, SURVIVAL.

Test: did each mode measurably help or hurt each archetype family during comparable market conditions?

**B62 classifier boundary:** explicitly label pre- vs post-B62 data. Don't blend outcomes across classifier behavior changes.

**Predefined outputs:**
1. Level 1 verdict with evidence — is the framework shape correct?
2. Level 2 inputs survey — current 4 inputs' fitness + recommended additions/removals
3. Level 3 calibration table (only if Levels 1+2 pass)
4. Empirical ride-along table — trade outcomes segmented by mode × market condition × archetype family
5. B64 action candidate list — what should B64 build if audit recommends framework shift
6. Multi-lever architecture proposal — if Level 1 recommends framework shift, sketch what levers + inputs + response timescales the new framework should have
7. Risk register (Langston's six concerns): feedback-loop risk, sample-size fraud, whipsaw/thrash, hysteresis requirement, family definition accuracy, long-only asymmetry

**Ship constraint:** audit-only in B63. NO threshold changes, NO framework changes, NO new lever implementations in this batch. Evidence → B64+ implementation.

### Item 16 — Global DBS architecture fix (moved up from B64 Item 3)

**Problem:** current global DBS uses opportunistic TTL cache reads with a coverage gate (fires if 70% of peak cache is available). Produces inconsistent cycle-to-cycle composition and degrades silently when coverage drops.

**Fix (per POST_B62_PRE_LAUNCH_PLAN.md Item 3):**
1. **Persistent per-pair DBS store** with timestamps. Hold latest-known DBS for each pair with cycle-aligned staleness bounds (soft: ≤ 2 scan intervals; hard: ≤ 5 minutes).
2. **End-of-cycle atomic snapshot.** At the end of each full scan cycle, publish one consistent global DBS snapshot. Consumers read the published snapshot, not the live store.
3. **Fixed 20-pair floor.** Replace the 70% coverage gate with a minimum sample count (N=20 pairs). Below the floor, keep the last good snapshot, mark it stale, log it. Do NOT compute a fresh global DBS from degraded data.

**Non-goals in B63:**
- No external signal blending (BTC dominance, BTC/ETH/SOL basket, Fear & Greed) — that's separate work.
- No weighting algorithm changes — transformed/capped volume weighting stays as current. If Item 15 audit recommends volume-weighting changes, action in B64+.

**Verification:** global DBS should produce identical value when read multiple times within a single cycle (before: varied with cache state; after: deterministic from snapshot). Coverage-degradation events should leave last-known value flagged stale rather than computing fresh from partial data.

### Item 17 — High-DBS exclusivity review (decision gate, NOT code change)

Current B63: pairs at |DBS| ≥ 0.35 route EXCLUSIVELY to Path D (strong-trend lane). They do not enter other quant families or the pattern pool.

Langston raised: should high-DBS pairs be eligible for all paths, with strong-trend lane as ADDITIONAL option rather than exclusive?

**Consensus position:** keep exclusive for now. Rationale:
- High-DBS pair has clear directional prior → trend-rider archetype is best-fit
- Exclusivity makes routing legible (first-class concept)
- Pre-Item 11, the lane only contained strong_bull_trend (breakout archetype). With vwap_pullback promoted in (Item 11), the lane now contains TWO archetypes — continuation breakout AND pullback-resumption. If those two cover the reasonable trading archetypes for trending pairs, exclusivity is appropriate.
- Mirror-defect guard (Item 10) handles the case where other strategies would have fired counter-trend anyway.

**Decision gate:** after observation window per Item 13, if evidence shows missed signals (e.g., morning_star would have fired profitably on a high-DBS pair), reopen. Otherwise exclusive routing stays.

### Item 18 — Full SQE audit (expanded 2026-04-21 from threshold-only to full audit)

**Scope:** audit the entire SQE as a gatekeeper. SQE has not been revisited since Phase 11. B62 and B63 materially changed the system (DBS as first-class regime input, routing changes, new strong-trend lane, Net EV path-awareness, etc.). The right question is: does SQE's **whole design** still fit post-B62, and what needs adjustment?

**Audit scope includes:**

**Thresholds and formulas:**
- FinalScore threshold (default 0.35) + FinalScore formula — still aligned with post-B62 signal distribution?
- RegimeWeight threshold (default 0.30) + formula — still aligned with post-B62 regime distribution (RBS 55.7% → 14.4%, TFS 43%, IE 3.2%)?
- Confidence floors per mode — still calibrated for current archetypes?
- Mode-based qualifiers — consistent with whatever framework Item 15 recommends?
- Pattern-pool guardrails — still needed post-B62? (Lower-liquidity pattern pool had different justification pre-B62.)

**rankingScore architecture (Kyle explicit ask):**
Current design (Directive 14.5 Batch 19): rankingScore = `FinalScore*qualityWeight + netReturn*returnWeight - frictionPenalty*frictionWeight + contextBonus`. Explicitly used ONLY for RTB queue ordering, not SQE quality gating.

Evaluate three architectural outcomes:
1. **Keep separation** — FinalScore gates, rankingScore orders. Current architecture.
2. **Add rankingScore sanity floor to SQE** — SQE checks a rankingScore minimum threshold alongside FinalScore. Captures "high FinalScore but economically weak" signals.
3. **Collapse** — rankingScore replaces FinalScore as single score for both gating and ordering.

Langston's prior (ordered by likelihood, most to least):
- **most likely:** option 2 (add rankingScore sanity floor to SQE alongside FinalScore)
- **next:** option 1 (keep the current clean separation)
- **least likely:** option 3 (full collapse of FinalScore into rankingScore)

Rationale: collapse risks overloading one number with two jobs (quality gating + queue ordering), and Net EV kernel already catches most "high FinalScore but economically weak" cases. Audit produces evidence; does not lock conclusion.

**Governance gates:**
- Strategy eligibility — still fit post-B62 routing?
- Exposure checks — scale correctly with new position-sizing nominal base?
- Cooldown logic — still timescale-appropriate?

**Structural question:**
Is SQE correctly designed as a single-stage gate, or should it be multi-stage (quality gate + economic gate + context gate)? Multi-stage would let B64+ work selectively tighten/loosen one stage without disturbing others.

**Alignment with VTS evidence:**
VTS does NOT use SQE (by Kyle's design — learn from good and bad alike). But **the SQE that live trading uses SHOULD be aligned with what VTS data reveals about signal quality.** If VTS data shows certain signal patterns consistently losing, SQE should reject those exact patterns. Audit evaluates whether current SQE is catching what VTS teaches us.

**Predefined outputs:**
1. Threshold recommendation table — current vs recommended per component
2. Formula review — each SQE formula's fitness post-B62, mark any stale
3. rankingScore architecture recommendation — which of the three outcomes + rationale
4. Structural recommendation — keep single-stage or split into multi-stage
5. VTS-alignment gaps — signal patterns VTS shows as bad that SQE doesn't catch
6. B64 action candidate list

**Ship constraint:** audit-only in B63. NO SQE formula or threshold changes in this batch.

### Item 19 — Classifier cadence / latency audit

**Scope:** measure actual adaptation latency of the stability classifier and its inputs. Kyle's requirement: timely adaptation, not half-day lag.

**Per-input measurements (driftScore, volZ, regimeConfidence, flipRate):**
- **Computational cadence** — how often recomputed (30s in FX5 scanner cycle, confirmed).
- **Signal responsiveness** — how many cycles until the input substantially reflects a new market regime (EMA half-life, rolling-window fraction, etc.).
- **Tail drag** — how long until the input forgets the old regime (e.g., 7-day flipRate carries old flips for 7 days).

**Per-output measurements (classifier + mode-overlay):**
- How fast does stability classification flip (cold → hot or vice versa) when underlying market actually shifts?
- Comparison to observed timescale of market-condition changes from streakiness data (2-6h windows in the evidence).

**Suspected findings (from code inspection, to be confirmed by audit):**
- 7-day flipRate is structurally too slow for 2-6h regime shifts
- EMA-smoothed driftScore (α=0.4) takes 15-30+ cycles to register real shifts = 7-15 minutes minimum
- regimeConfidence response characteristics unknown — audit verifies
- volZ response depends on lookback window — audit verifies

**Predefined outputs:**
1. Per-input cadence + response + tail-drag table
2. Full-loop adaptation latency measurement (input change → classification change → mode flip → live signal impact)
3. Comparison against observed market-shift timescales
4. B64 cadence-redesign candidate list — which inputs need shorter lookbacks, which need replacement

**Ship constraint:** audit-only in B63.

---

## Cohort separation for observation (Langston requirement)

B63 is accreting multiple sub-items. The observation plan and B63 completion report MUST separate:
1. **Original B63 cohort** — trades opened under Items 1-9 only (pre-addendum if deployed separately)
2. **Post-Items-10-14 cohort** — trades opened after mirror-defect guard + vwap_pullback promotion + geometry override + mode-overlay bypass
3. **Post-Item-16 cohort** — trades opened after global DBS architecture fix
4. **vwap_pullback-in-strong-trend-lane cohort** — Item 11 subset, for Item 13 decision gate

Each cohort's performance reported separately in the B63 completion report. Otherwise outcomes blur across internal versions and we lose attribution.

If Items 10-14 and Item 16 ship in the same commit, collapse to a single "post-addendum" cohort. If separate commits / deploys, separate cohorts.

---

## Verification criteria (post-deploy)

**Core B63 (see PRE_AUDIT §8):**
- **Path D trade count in first 2h — investigation trigger, not hard fail.** Target ≥ 3 in first 2h; if count < 3, investigate routing and strategy detection (may be legitimate quiet-market behavior, not automatic proof of implementation failure).
- Strong-DBS routing share ≥ 95% to Path 6 (routing correctness is pass/fail; sample-independent)
- Existing strategies firing on |DBS|≥0.35 → ~0 (routing correctness; pass/fail)
- Path D TP hit rate ≥ 30% (over sufficient sample — minimum N=20 closed trades before evaluation)
- Path D stop-out ≤ 55% (same sample-size requirement)
- Path D RTB rank: median top half (sample-size-dependent)

**Items 10-14 (post-audit):**
- `b63b_counter_trend_long_exclusion` null-reason count > 0 (Item 10 guard is active)
- Counter-trend LONG trades (closed LONG with pairDBS ≤ -0.35) in 48h window → **0**
- **Item 11 vwap_pullback promotion verification — split into routing vs outcome:**
  - **Routing + eligibility (pass/fail, sample-independent):** vwap_pullback is registered as eligible detector in quant-strong_trend sourcePool in canonical map; high-DBS pairs that enter the lane trigger vwap_pullback detection evaluation; open-trade creation succeeds for valid signals.
  - **Outcome (sample-size-dependent):** at least 1 closed vwap_pullback trade with sourcePool='quant-strong_trend' in observation window. **If no closes occur, mark as "insufficient sample", NOT failed implementation.** Routing may be correct with no qualifying market setup occurring in the window.
- vwap_pullback closed trades in strong-trend lane show stop distance ≈ 4×ATR_at_entry and target ≈ 3×(entry-stop) (Item 12 geometry override plumbed)
- `strong_bull_trend` trades show stop distance ≈ 3×ATR and target ≈ 6×ATR regardless of global mode (Item 14 bypass working). Before fix: ratio 1.33:1 or 0.8:1 under DEFENSIVE/SURVIVAL. After fix: ratio 2:1 consistently.
- morning_star + reverse_impulse in normal DBS range (-0.35, +0.35) still firing — non-zero count (Items 10/11 did not over-restrict)
- No regression in core B63 Path D count (vwap_pullback promotion did not cannibalize strong_bull_trend routing)

**Item 16 (global DBS fix):**
- Global DBS value is deterministic within a cycle (multiple reads return same value)
- Coverage-degraded events leave last-known-snapshot intact with stale flag
- Fixed 20-pair floor enforced — degraded global DBS never computed below sample threshold

**Audit items (15, 18, 19):**
- Explicit deliverable files produced, Langston-reviewed before B63 close:
  - `Claude Comms and Packages/Scope Files/B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md`
  - `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT.md`
  - `Claude Comms and Packages/Scope Files/B63_ITEM19_CADENCE_LATENCY_AUDIT.md`
- Each deliverable produces its predefined outputs (not vague narrative)
- B64 action candidate list in each deliverable is explicit, with priorities

---

## Deferred to later batches

**To B64:**
- Multi-lever adaptive framework design + prototype (if Item 15 audit recommends framework shift)
- SQE formula / threshold changes (based on Item 18 audit evidence)
- Classifier input replacements / lookback changes (based on Item 19 audit evidence)
- Canonical map UI sync / IE metrics description (from POST_B62 plan Item 4)
- TEC shared-service wiring (per POST_B62 plan; audit in B63 confirmed TEC is amplifier not rescue mechanism)

**To B65+:**
- Production implementation of multi-lever adaptive framework (if B64 prototype holds up)
- Asset class + standardized schema (POST_B62 plan Item 5)
- Data archiving (POST_B62 plan Item 6)
- Regime drift dashboard (POST_B62 plan Item 7)

**Post-launch / no current batch:**
- Strong Bear Trend variant (Path E) — system is LONG-only for go-live; bear variant is post-launch if SHORT-enable happens
- External signal blending into global DBS (BTC dominance, BTC/ETH/SOL basket, Fear & Greed)
- ML/AI-driven archetype recognition (Kyle's original plan for dynamic market adaptation; may become obsolete if the multi-lever framework delivers sufficient adaptation without it)
