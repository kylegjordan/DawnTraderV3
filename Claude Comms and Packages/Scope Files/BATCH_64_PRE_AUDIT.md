# Batch 64b — Pre-Implementation Audit

**Author:** Claude Code, 2026-04-23
**Status:** Phase 2 deliverable. Phase 1 scope approved by Langston 2026-04-23 10:50 UTC.
**Mandatory per CLAUDE.md §9:** SIM consultation for every component affected.

---

## 1. Components affected (from BATCH_64_SCOPE.md)

| Component | File(s) | Objective(s) | Blast radius |
|---|---|---|---|
| Canonical regime-strategy map | `server/config/canonical-regime-strategy-map.ts` | Obj 1 (IE metrics), Obj 2 (B63 annotations) | LOW (documentation in comments + narrative strings; no code behavior change) |
| Drift Dashboard UI | `client/src/pages/analytics.tsx` (`DriftDashboardSection`) | Obj 3 (rename column headers), Obj 4 (polish) | LOW (UI-only, no data-layer change) |
| VTS runner | `server/services/vts-runner.ts` (L518) | Obj 6 (MAX_HOLD_MS restoration) | LOW (constant change from `POSITIVE_INFINITY` to 7d finite value; re-enables safety valve) |

## 2. SIM consultation (per CLAUDE.md §9)

Consulted `1-system-manual/SYSTEM_IMPACT_MAP.md` for each component:

### 2.1 `canonical-regime-strategy-map.ts` (SIM L572, Recent Additions B63 L736)

- **UPSTREAM dependencies:** none — this IS the source of truth. No upstream data feeders.
- **DOWNSTREAM consumers:** 
  - `server/services/vts-runner.ts` — reads via `CANONICAL_REGIME_STRATEGY_MAP` import + `MULTI_FAMILY_ELIGIBILITY` export for family-eligibility gate
  - `server/services/strategy-engine.ts` — reads strategy registrations
  - `server/services/regime-strategy-registry.ts` — reads for regime → strategy mapping
  - `client/src/pages/analytics.tsx` (`MappingDriftSection` component) — displays narrative text
  - `client/src/pages/machine-learning.tsx` — displays regime metadata
  - `server/tests/unit/regime_mapping_integrity.test.ts` — enforces structure
- **SHARED STATE:** none (stateless config)
- **BACKGROUND EXECUTION:** imported at module-load time; no timers/intervals
- **Blast radius rating:** LOW for pure text/annotation changes (descriptions in `REGIME_METRICS`, comment blocks, `secondaryMetrics` strings on strategy entries). **Would become HIGH** if we modified strategy registrations, regime names, or regime/strategy types — none of that is in B64b scope.

### 2.2 `client/src/pages/analytics.tsx` — `DriftDashboardSection` component

- **UPSTREAM dependencies:** reads from `/api/analytics/drift-dashboard` endpoint (response type `DriftDashboardResponse` containing `strategiesByRegime`, `tradeCounts`, `regime.shares`, etc.)
- **DOWNSTREAM consumers:** end-user browser rendering only; no downstream data consumers
- **SHARED STATE:** React component state (useQuery refresh; auto-refetch per refresh timer)
- **BACKGROUND EXECUTION:** useQuery polls the endpoint; no intervals owned by this component
- **Blast radius rating:** LOW. Column-header rename changes the `<th>` string only; does not change the data schema or the field names (`avgNetPct`, `sumNetPct`) read from the response. Preserves backward compatibility with the endpoint.

### 2.3 `server/services/vts-runner.ts` L518 MAX_HOLD_MS

- **UPSTREAM dependencies:** none (local constant)
- **DOWNSTREAM consumers:** single consumer at L1453 (the force-close-stale gate inside `resolveVirtualTrades`)
- **SHARED STATE:** affects `openVirtualTrades` Map indirectly (trades can be force-closed and removed from the Map when the gate triggers)
- **BACKGROUND EXECUTION:** `resolveVirtualTrades` is invoked per VTS cycle (every 30s per `simulationIntervalSec`), which is when this gate is evaluated
- **Blast radius rating:** LOW. Going from `POSITIVE_INFINITY` (always-false gate, zombie accumulation risk) to `7 * 24 * 60 * 60 * 1000` (finite, fires only at 7-day hold) preserves the Batch 18I safety valve. Observed maximum hold in live data: ~22 hours. No normal trade will hit the 7-day cap.

## 3. "If I Change X, Check Y" consultation (SIM L667)

From SIM §"Quick Lookup: If I Change X, Check Y":
- **If you edit MULTI_FAMILY_ELIGIBILITY** → check `vts-runner.ts` family-eligibility gate logic AND the canonical regime-strategy map narratives for the affected strategy. **Not applicable — B64b does NOT modify this map; Objective 2 only adds comment annotations referencing it.**
- **If you edit the strong-trend geometry override constants** → check BOTH `vts-runner.ts` AND `paper-execution-engine.ts`. **Not applicable — not modifying constants, only documenting them.**
- **If you edit the mode-overlay bypass condition** → check sourcePool string matches. **Not applicable.**
- **If you edit the regime string constants** → all code paths must route through `CANONICAL_REGIMES` / `REGIMES.*`. **Not applicable — not modifying regime names.**

All SIM change-impact checklist items are non-applicable to B64b because the batch is documentation + UI + a single safety-valve constant adjustment.

## 4. Tests affected

| Test | File | Affected by B64b? |
|---|---|---|
| `regime_mapping_integrity.test.ts` | `server/tests/` | **Yes, verify still passes.** Test asserts that regime strings route through `CANONICAL_REGIMES`. Our B64b changes don't modify regime string usage, but adding comment annotations could theoretically reorder imports or break a brittle line-based assertion. Run pre-push. |
| `b63-item12-geometry-override.test.ts` | `server/tests/unit/` | No — no code behavior change in geometry override logic |
| `b63-item16-dbs-store.test.ts` | `server/tests/unit/` | No — no code behavior change in DBS store |
| Any client-side tests that assert UI text | `client/src/tests/` | **Check before change.** If any test asserts the string "Avg net %" or "Sum net %" exactly, those tests need the same rename. |

**Action in Phase 3:** grep for `"Avg net %"` and `"Sum net %"` in tests before implementation. If any tests have that literal, update them in the same commit as the UI rename.

## 5. Per-objective implementation plan

### Obj 1 — IE metrics description update

**Current state** (canonical-regime-strategy-map.ts L128-133):
```
IMPULSE_EXPANSION: {
  momentum: '>0.010',
  adx: '>30',
  volatility: '>0.03',
  description: 'Sharp moves with trend acceleration and violent expansion'
},
```

**Gap:** description doesn't reflect:
- B62: DBS-informed classification (high-DBS + high-momentum → IE rather than pure-momentum threshold)
- B63: SBT registered in IE strategy list when routed via `quant-strong_trend` sourcePool

**Proposed update to description:**
`"Sharp directional moves with trend acceleration and violent expansion. Post-B62 (2026-04-19): classification incorporates DBS score alongside momentum/ADX/volatility — pairs entering IE typically show |DBS| ≥ 0.50 combined with rapid momentum expansion. Post-B63 (2026-04-21): strong_bull_trend is registered in this regime's strategy list and fires via quant-strong_trend sourcePool; range/reversal strategies gated out by family eligibility."`

Also add similar DBS-awareness notes to other regime descriptions where the B62 classifier change materially shifted meaning (TFS most obvious candidate).

### Obj 2 — Canonical map B63 annotations (currently partial, need completeness audit)

**Current state** (per grep):
- L285-287 covers Items 11 / 12 / 14 in MODULE comments
- TFS strategy entries have `secondaryMetrics` referencing B63 Items 10/11/12 (vwap_pullback "Blocked when DBS ≤ -0.35... Also eligible in strong-trend lane at DBS ≥ 0.35 with Variant E geometry")
- morning_star entry references B63 Items 6 and 10

**Gap candidates (to verify by read-through):**
- Are `defensive_hedge`, `reverse_impulse`, `sma_trend_ride`, `volatility_edge` entries annotated for B63 Item 10 counter-trend LONG guard?
- Is there a clear annotation block for `MULTI_FAMILY_ELIGIBILITY` at the top of the file explaining what it is?
- Is the mode-overlay bypass mechanism (Item 14) annotated on strategies that benefit from it?

**Proposed action:** read the full file, identify gaps, add concise inline annotations with B63 item references. No structural changes.

### Obj 3 — Drift Dashboard column header rename

**Changes in `analytics.tsx`:**
- Line 1215: `<p>Avg net %</p>` → `<p>Avg move %</p>` (top-line stat)
- Line 1347: colgroup comment `Avg net %` → `Avg move %` (cosmetic)
- Line 1349: colgroup comment `Sum net %` → `Sum move %` (cosmetic)
- Line 1358: `<th>Avg net %</th>` → `<th>Avg move %</th>` (table header)
- Line 1360: `<th>Sum net %</th>` → `<th>Sum move %</th>` (table header)

Keep `avgNetPct` / `sumNetPct` in code unchanged (per Langston).

### Obj 4 — Drift Dashboard residual polish

Start implementation now per Langston. Initial review:
- Current layout is `max-w-4xl` with 8-column fixed widths — should render cleanly on laptop viewports
- Column widths are percentages of parent width — responsive
- Sticky header row — works on scroll
- Empty-regime handling — already handled with "no closed trades in this regime during the window" message

No polish items identified without actual post-deploy operator review. Will monitor during Phase 7 verification. If no issues surface by Phase 8 Langston verification, close this objective as "no residual polish needed."

### Obj 6 — MAX_HOLD_MS safety-valve restoration

**Current state** (vts-runner.ts L517-526):
```
// 2026-04-23: 24h VTS timeout removed per Kyle directive. Rationale: ...
// ... (existing comment block)
const MAX_HOLD_MS = Number.POSITIVE_INFINITY;
```

**Proposed update:**
```
// 2026-04-23 (B63-close → B64b): 24h VTS timeout REMOVED for normal operation, but a
// 7-day hard safety valve PRESERVED to prevent zombie accumulation. The Batch 18I
// force-close-stale gate at L1453 uses this constant to catch trades on illiquid pairs
// that stop receiving price updates. Normal trades resolve via TP/SL; longest observed
// hold in live data was ~22h, so the 7-day cap should never fire in normal operation.
// Langston-flagged in B63 close review (2026-04-23 10:43 UTC) that POSITIVE_INFINITY
// re-introduced the pre-B18I bug of indefinite Map accumulation for stale-price trades.
const MAX_HOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (safety valve only)
```

No other code touched. L1453 gate continues to fire with `exitReason: 'timeout'` when it activates, which correctly flags these as "stale cleanup" not "normal timeout."

## 6. Risk summary

| Risk | Likelihood | Mitigation |
|---|---|---|
| Canonical map test breaks on re-import order change | Low | Run full test suite locally pre-push; fix test assertions if needed |
| Client-side UI text test assertion breaks on column rename | Low | Grep tests before change; update same commit |
| MAX_HOLD_MS 7-day safety valve still too loose for some edge case | Very Low | If post-deploy observation shows a specific scenario not covered, tighten in a follow-up. Unlikely given 22h observed max hold. |
| Annotation addition inadvertently changes canonical map SSOT behavior | Very Low | Objective 2 explicitly COMMENT-ONLY — structural code untouched |

**Overall batch risk: LOW.** Single-session implementation feasible.

## 7. Phase 3 (Implementation) task list

1. Read `canonical-regime-strategy-map.ts` in full to identify Obj 2 annotation gaps
2. Grep `client/src/tests/` for "Avg net %" / "Sum net %" literals; update any found
3. Implement Obj 6 MAX_HOLD_MS change (1 constant + comment)
4. Implement Obj 3 column rename (5 sites in `analytics.tsx`)
5. Implement Obj 1 IE regime description update + related regime descriptions
6. Implement Obj 2 annotation additions (inline comments + cross-refs)
7. Run full test suite locally (`npm test` — primary targets: `regime_mapping_integrity`, `b63-item12-geometry-override`, `b63-item16-dbs-store`)
8. TypeScript check (`npm run check` or equivalent)
9. Local build verification
10. Post Phase 4 code review request to Langston with diff
11. On Langston approval → push → CI
12. On CI green → staging deploy
13. Phase 7 CC verification (visual + log checks)
14. Phase 8 Langston verification
15. Governance updates (Phase 10)
16. Completion report (Phase 11)

## 8. Open questions (none expected at this stage)

The scope approval already resolved all open questions from Phase 1. No new questions emerged during pre-audit. Implementation can proceed directly.

---

*End of B64b Pre-Audit. Phase 3 (Implementation) begins next.*
