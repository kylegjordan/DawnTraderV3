# BATCH 63 — Addendum: Post-72h-Audit Refinements

**Date opened:** 2026-04-20
**Status:** Scope locked (Kyle approved) + Langston consensus (CC ↔ Langston, 2026-04-20)
**Phase:** 15b Sub-Phase C (extends BATCH_63_SCOPE.md)
**Parent batch:** B63 — all core B63 work (Items 1-9) remains in flight / deployed as documented in `BATCH_63_SCOPE.md` and `BATCH_63_PRE_AUDIT.md`.

> **Source evidence:** `BATCH_63_COUNTERFACTUAL_AUDIT.md` — exit-only replay of 90 bullish high-DBS LONG trades from the B62 72h window + 94-trade mirror-defect summary (DBS ≤ -0.30 LONG).

---

## Why this addendum exists

The counterfactual audit (2026-04-20) produced three findings that go beyond what B63 Items 1-9 address:

1. **Entry-archetype evidence for morning_star.** The existing B63 Item 6 exclusion at `dbsScore >= 0.35` is validated — morning_star WR is identical 32.1% across every fixed-stop width (2×/3×/4× ATR), confirming that widening stops does not rescue the archetype. No code change needed; documentation note only.
2. **Mirror defect — counter-trend LONG entries on strong-NEGATIVE-DBS pairs.** 94 trades in the 72h window had `pairDBS ≤ -0.30` and were opened LONG. Win rate 22.3%. Dominated by `reverse_impulse` (54), `morning_star` (22), `vwap_pullback` (15). **B63 Item 6 guards ONLY the positive-DBS case; the mirror is unaddressed.**
3. **vwap_pullback is the one legacy archetype worth preserving on trending pairs.** 63.2% baseline WR on high-DBS pairs, Variant E geometry (4×ATR stop, 3R target) doubles its Sum R. Currently B63 Item 6 self-excludes vwap_pullback at `dbsScore >= 0.35` — that exclusion blocks the one archetype that works.

---

## Scope items (4 items, CC ↔ Langston consensus)

### Item 10 — Counter-trend LONG guards (mirror defect fix)

Add a strategy-level guard mirroring B63 Item 6's positive-DBS exclusion, but on the negative-DBS side. Fires for LONG-only strategies where the pair's directional bias is strongly opposite the trade direction.

**Guard:**
```ts
if ((indicators.dbsScore ?? 0) <= -0.35) {
  setNullReason('b63b_counter_trend_long_exclusion');
  return null;
}
```

**Applied to:** `morning_star`, `reverse_impulse`, `defensive_hedge`, `sma_trend_ride` (all LONG-only strategies that showed in the mirror-defect breakdown).

**NOT applied to `vwap_pullback`** — see Item 11; the full vwap_pullback DBS logic is restructured there and subsumes the mirror case.

**Null-reason string:** new, `b63b_counter_trend_long_exclusion`. Distinct from `b63_strong_dbs_exclusion` so logs/diagnostics can distinguish the two gates.

**Expected impact:** eliminates ~94 losing-LONG-on-downtrend trades per 72h window at zero offsetting cost. These strategies continue to fire on DBS ∈ (-0.35, +0.35) where their reversal/pullback archetypes are appropriate.

### Item 11 — vwap_pullback promotion into the strong-trend lane

Remove vwap_pullback's B63 Item 6 self-exclusion at `dbsScore >= 0.35`. Instead:
- Route vwap_pullback as an **additional eligible detector** in the strong-trend filter path (sourcePool `quant-strong_trend`, co-equal with `strong_bull_trend`).
- When vwap_pullback fires through the strong-trend lane, apply **strong-trend geometry override**: stop = 4×ATR, target = 3R (Variant E from audit). Normal vwap_pullback on low-DBS pairs retains its current geometry.
- Add the mirror-defect guard for vwap_pullback: `if (dbsScore <= -0.35) skip` — covers the 15 counter-trend mirror cases the audit found.

**Ordering / conflict rule:** if both `strong_bull_trend` and strong-trend-mode `vwap_pullback` fire on the same pair in the same cycle, tie-break by R-multiple (prefer the tighter-stop/better-R setup — typically `vwap_pullback` because the pullback-entry stop is naturally closer).

**Expected impact:** recovers the pullback-resumption archetype on trending pairs. Audit Sum R was +2.0 at baseline, +4.1 under Variant E on n=19 — small sample, must observe live.

### Item 12 — Strong-trend geometry override plumbing

Introduce a lightweight routing-context geometry override so the strong-trend lane can supply stop/target multipliers to its detectors without hard-coding DBS-conditional branches inside each strategy.

**Shape (proposal, refine in implementation):**
```ts
interface StrongTrendGeometryOverride {
  stopAtrMultiplier: number;     // 4.0 for Variant E
  targetAsRMultiple: number;     // 3.0 for Variant E
}
```
Passed through the routing context (same path as `sourcePool`); detectors that support it (`vwap_pullback` initially, potentially others later) consume it in place of their default geometry constants.

**Strong_bull_trend does NOT need this** — its geometry (3×ATR / 6×ATR = 2R) is already locked per B63 scope and does not use the override.

**Design rationale (Langston):** routing carries the geometry, not a hidden branch inside the strategy. Makes the "strong-trend lane" a first-class concept that future strategies (eventual `strong_bull_pullback` if needed) can inherit from without each one re-implementing its own DBS gate.

### Item 13 — Observation & decision gate for dedicated `strong_bull_pullback`

After deploy, observe vwap_pullback-in-strong-trend-lane performance for **minimum 1 week** (target: ≥ 20 closed trades through the strong-trend lane) before deciding whether to build a dedicated `strong_bull_pullback` strategy.

**Decision criteria (pre-registered):**
- IF strong-trend-lane vwap_pullback WR ≥ 55% AND Sum R > 0 over the observation → KEEP as-is, no new strategy needed.
- IF WR ∈ [45%, 55%) OR Sum R marginal → tune geometry (narrower/wider stop variants), re-observe 1 more week.
- IF WR < 45% OR Sum R ≤ baseline Sum R → **build dedicated `strong_bull_pullback`** as a B64+ item with purpose-built detection separate from vwap_pullback.

No code for Item 13 in this addendum — it's a decision gate, recorded here so it's not forgotten.

---

## Items explicitly NOT in this addendum

- Lowering B63 Item 6 threshold from 0.35 → 0.30. My audit used 0.30 boundary; B63 uses 0.35. The 0.35 threshold already captures the bulk of the bleed. Keep 0.35 for consistency; re-evaluate after Item 13's observation window.
- Building `strong_bull_pullback` as a dedicated strategy. Deferred pending Item 13 decision gate.
- Any TEC / trailing logic changes. TEC as shared service remains B63 Item 2 scope; audit confirmed TEC is an amplifier for directionally-right entries, not a rescue mechanism — framing note only.

---

## Verification criteria (post-deploy)

Measured over ≥ 48h window, compared to the B63 post-deploy baseline:

1. **Mirror-defect guard firing:** count of `b63b_counter_trend_long_exclusion` null reasons in log > 0 (proves guard is active).
2. **Counter-trend LONG trades:** closed LONG trades with `pairDirectionalBiasScore <= -0.35` in window → **0**. (Down from ~94 in the B62 72h window.)
3. **vwap_pullback routing:** at least 1 closed vwap_pullback trade with `sourcePool = 'quant-strong_trend'` in the 48h window (proves promotion is active).
4. **Geometry override applied:** the vwap_pullback closed trades in sourcePool `quant-strong_trend` must have stop distance ≈ 4×ATR_at_entry and target distance ≈ 3×(entry - stop). (Proves Item 12 plumbing works.)
5. **Morning_star / reverse_impulse in normal DBS range still firing:** non-zero count of trades on DBS ∈ (-0.35, +0.35). (Proves the addendum didn't over-restrict.)
6. **No regression in B63 Path D count:** `strong_bull_trend` trade count in the 48h window must be ≥ what B63's own post-deploy baseline showed. (Proves the promotion of vwap_pullback didn't cannibalize Path D routing.)

---

## Governance updates required

**Tier 1:**
- `BATCH_CATALOG.md` — append addendum entry to B63 row
- `PHASE_HISTORY.md` — note addendum under Phase 15b Sub-Phase C
- `.claude/memory/MEMORY.md` — update B63 status line
- This file (scope)
- `BATCH_63_COMPLETION_REPORT.md` — when B63 closes, the addendum items must appear in the objectives checklist

**Tier 2:**
- `SYSTEM_MANUAL.md` — add note under Layer 4 (Strategy Engine) about the strong-trend geometry override mechanism and the counter-trend LONG guard pattern
- `SYSTEM_IMPACT_MAP.md` — update §5.2.5 (Strategy Engine) to list the 4 strategies with new mirror guards; update strong-trend routing lane entry to list vwap_pullback as co-eligible detector
- `CHANGES_AND_FIXES.md` — new entry `DBS-B63B-001` for the mirror-defect fix

---

## Change list (summary — detailed diff in `Change Lists/BATCH_63_ADDENDUM_CHANGE_LIST.md`)

| File | Change |
|---|---|
| `server/strategies/morning-star.ts` | Add `if dbsScore <= -0.35 return null` with new null reason |
| `server/strategies/reverse-impulse.ts` | Add `if dbsScore <= -0.35 return null` with new null reason |
| `server/strategies/defensive-hedge.ts` | Add mirror guard (verify LONG-only first) |
| `server/strategies/sma-trend-ride.ts` or equivalent | Add mirror guard |
| `server/services/strategy-engine.ts` (vwap_pullback block ~line 85) | REPLACE Item 6 positive-DBS exclusion with: (a) mirror-defect negative guard, (b) strong-trend-lane detection via routing context, (c) geometry override consumption |
| `server/config/canonical-regime-strategy-map.ts` | Add vwap_pullback as eligible in `quant-strong_trend` source pool |
| Strong-trend routing layer (file TBD in pre-audit) | Plumb `StrongTrendGeometryOverride` through context to detectors |

---

## Open questions for Kyle (escalate before code, not after)

None. Consensus locked. Proceeding to pre-audit next.
