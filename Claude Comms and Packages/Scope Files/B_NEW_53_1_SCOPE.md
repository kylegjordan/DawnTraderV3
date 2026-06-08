# B-NEW-53.1 — SCOPE — admitted-features undefined-fields fix (RUNNING_ISSUES #207 / B70.2)

**Author:** Claude Code. **Date:** 2026-06-08. **Phase:** 19-adjacent (telemetry-completeness; active trading OFF). **Predecessor:** B-NEW-53 (decision-provenance capture, CLOSED — both classes runtime-proven).
**Type:** root-cause data-completeness fix. Additive/telemetry-only. **No change to any trade, gate, or decision.**

> **Langston Step-1 framing reminder (from B-NEW-53 close):** "source each field from its real source local at the hook OR extend Phase10TradeRecord + its literal — NOT papering over with the typed record. Own Step-4." This scope honours that and proposes a third, strictly-better synthesis (read from `openTrade`, the SSOT record that already carries every field) for Langston to ratify or redirect.

---

## 0. PREVIOUSLY-STATED-VS-NOW (per CLAUDE.md §9.2)
- **#207 field count: PREVIOUSLY "~12 fields". NOW: 13 fields** (empirically enumerated below). REASON: live-DB count of the distinct NULL keys in the admitted `features` block.
- **#207 blast radius: PREVIOUSLY "crypto admitted rows". NOW: crypto admitted rows (the #207 bug) PLUS a *distinct* xStock at-entry-context absence** (different mechanism — see §5). REASON: a contrast query showed xStock admitted rows are also blank for these fields, but via a separate cause (no equivalent block), not the #207 wrong-object read.

---

## 1. The bug (empirically confirmed on live prod, 2026-06-08)
The B70.2 "full at-entry context" block on **crypto admitted** rows (added 2026-05-05) archives **13 fields as `undefined`/NULL**. Confirmed live: of **145** crypto admitted rows in the last 24h, **0** carry any of these 13 keys:

`entryPrice, target (takeProfit), stopLoss, quantity, expectedEdge, atrAtOpen, pairIdHash, regimeConfidenceRaw, macroModifierValue, phase, phaseAgeSeconds, strategyPhaseWeight, regimeConfidenceModulated`

(That last one lives in `modulators`, the other 12 in `features`; both blank.)

**These rows are otherwise fine** — the scoring/classification fields (`hybridScore`, `predictiveConfidence`, `regimeWeight`, `signalType`, `patternType`, `pool`, `sourcePool`, `filterTier`, friction + directional-bias fields, `positionSize`) populate correctly because they ARE on `Phase10TradeRecord` and ARE set in its literal.

**Provenance (B-NEW-53) is UNAFFECTED** — it sources the real detect-output locals; its `resolved_stop_price`/`resolved_target_price` + forming bar are correct. #207 is purely the older B70.2 `features` block.

---

## 2. Root cause (exact, verified in code — `server/services/vts-runner.ts`)
The admitted archive hook (≈L1937) builds its `features` block by reading **`tradeRecord.<field>`**. But `tradeRecord` is a **`Phase10TradeRecord`** (interface L469-506) — a *lean telemetry record* that:
- declares **`entry`**, NOT `entryPrice`; and
- does **not declare** `stopLoss`, `takeProfit`, `quantity`, `expectedEdge`, `atrAtOpen`, `pairIdHash`, `regimeConfidenceRaw`, `macroModifierValue`, `phase`, `phaseAgeSeconds`, `strategyPhaseWeight`, `regimeConfidenceModulated` at all.

Its literal (L1605-1629) sets only `entry: entryPrice` and the lean fields. So every `tradeRecord.<missing>` read resolves to `undefined`.

**The values were always present** — on the sibling **`openTrade`** record (`const openTrade: OpenVirtualTrade`, literal L1467-1550), which is the SSOT trade-open record and explicitly computes/persists **all 13** (e.g. `atrAtOpen: mceContext.indicators.atr` L1523, `pairIdHash: assignCohortHash(symbol)` L1531, `regimeConfidenceRaw` IIFE L1538, `phase`/`phaseAgeSeconds`/`strategyPhaseWeight` L1543-1545, plus `entryPrice`/`stopLoss`/`takeProfit`/`quantity`/`expectedEdge`). `openTrade` is **already in function scope at the hook** (it is re-fetched there as `persistedTrade = openVirtualTrades.get(tradeId)` for `chainModulatedConfidence`). The block simply read the wrong object.

**Why TypeScript didn't catch it:** these are reads of properties absent from `Phase10TradeRecord`; they sit in the tsc **baseline** (the CI gate only blocks *new* errors above baseline — which is exactly why the same pattern, when I first wired provenance off `tradeRecord.stopLoss/takeProfit`, surfaced as 4 *new* TS2339s and forced the correct source-local wiring).

---

## 3. Fix (recommended approach — Langston to ratify)
**Recommended: read the 13 fields from the SSOT `openTrade` record (or its originating local), not `tradeRecord`.** This is "source each field from its real source" in the strongest form — `openTrade` is the record of what the trade actually opened with, so the archived value is **equal-by-construction** to the live trade (no recomputation drift, no double-invocation of side-effectful derivations like `assignCohortHash`).

Per-field source (final mapping confirmed in Step-2 pre-audit):
| archived key | NEW source | note |
|---|---|---|
| `entryPrice` | `openTrade.entryPrice` | interface-typed ✓ |
| `target` | `openTrade.takeProfit` | ✓ |
| `stopLoss` | `openTrade.stopLoss` | ✓ |
| `quantity` | `openTrade.quantity` | ✓ |
| `atrAtOpen` | `openTrade.atrAtOpen` | ✓ |
| `pairIdHash` | `openTrade.pairIdHash` | ✓ (do NOT re-call `assignCohortHash` — would re-assign cohort) |
| `regimeConfidenceRaw` | `openTrade.regimeConfidenceRaw` | ✓ |
| `macroModifierValue` | `openTrade.macroModifierValue` | ✓ |
| `phase` | `openTrade.phase` | ✓ |
| `phaseAgeSeconds` | `openTrade.phaseAgeSeconds` | ✓ |
| `strategyPhaseWeight` | `openTrade.strategyPhaseWeight` | ✓ |
| `regimeConfidenceModulated` (modulators) | `openTrade.regimeConfidenceModulated` | ✓ |
| `expectedEdge` | **Step-2 decision** | `openTrade` sets it (L1486) but `OpenVirtualTrade` does **not declare** it → reading `openTrade.expectedEdge` is a *new* TS2339. Two clean fixes: (a) add `expectedEdge?: number` to the `OpenVirtualTrade` interface (one line; it is already written to the literal + DB), or (b) source the in-scope local expression. **Recommend (a)** — the field genuinely belongs on the record. |

`openTrade` is non-null at the hook (the trade aborts earlier on persist failure, L1566), but the read will use the same defensive `?? null` the block already uses, so a cold-start race degrades the row instead of dropping it.

**Rejected alternative — extend `Phase10TradeRecord` + its literal:** redundant (the data already lives on `openTrade`), and several values are derived inside the ablation block *after* the `tradeRecord` literal is built, so it would force either hoisting or re-derivation — strictly more churn for no benefit.

---

## 4. Numbered objectives + verification criteria
1. **All 13 fields populate on crypto admitted rows.** *Verify:* re-run the §1 live query post-deploy → each `has_*` count == `admitted_rows` (100%), values finite/sane (e.g. `entryPrice`>0, `stopLoss`≠`target`, `phase` ∈ {EARLY,PRIME,LATE}).
2. **Archived values equal the live trade-open values.** *Verify:* for a sample of post-deploy admitted rows, the archived `entryPrice`/`stopLoss`/`target` match the same trade's `vts_open_trades` row (equal-by-construction check), and `pairIdHash` is stable per symbol (cohort not re-rolled).
3. **No regression to the already-correct fields** (scoring/classification/friction block unchanged). *Verify:* those keys still populate at 100%.
4. **No new tsc baseline errors; full unit suite green** (the `expectedEdge` handling in particular must not introduce a TS2339). *Verify:* `node scripts/check-tsc-baseline.mjs` clean in the C:\dev bench; `npx vitest run` no new failures.
5. **xStock parallel gap decided + recorded** (see §5) — folded in this batch or logged as an explicit deferred follow-up with rationale.
6. **Telemetry-only / safety:** zero change to any trade, gate, signal, or decision; active trading remains OFF; the change is inside the existing best-effort try/catch. *Verify:* diff is confined to the archive `features`/`modulators` construction (+ optionally one interface line); Langston Step-4 confirms.

---

## 5. Related finding — xStock at-entry context is absent (DISTINCT mechanism; Langston/Kyle decision)
The contrast query showed **xStock admitted rows are also blank** for `entryPrice/stopLoss/quantity/atrAtOpen/phase` (0 of 23 in the last 36h). **This is NOT the #207 bug** — the xStock decision path archives from a *different* file (`server/asset_classes/xstock_spot/eval-cycle.ts`) which **never had a B70.2-style "full at-entry context" block** (it writes scoring-metadata-only `features` by design — confirmed in the B.5 W2.0b gate-zero probe). So xStock taken-trade rows simply never attempted these fields.

**Why it matters:** Kyle's disposition on B-NEW-53 was "capture the decision data now so Phase-25 calibration has it." The same at-entry context (ATR, regime phase, regime confidence, cohort) on **xStock** admitted rows would be equally valuable for Phase-25 xStock calibration.

**Recommendation (Langston to weigh in at Step-1):** **fold in** an equivalent at-entry-context block on the xStock admitted hook **IF** `eval-cycle.ts` has an in-scope SSOT trade-open record carrying these values (Step-2 pre-audit confirms availability). If that record is **not** in scope there (xStock may compute geometry differently), log a clean deferred follow-up (B-NEW-53.2) rather than bolt on a fragile re-derivation. **Do not** expand silently — surface + decide. Note: B-NEW-53 provenance already covers the *replay-critical* xStock inputs (forming bar + resolved stop/target + constants) on admitted rows, so this is *additional* context, not a replay blocker — there is runway to defer if the source isn't cleanly available.

---

## 6. Files in play (anticipated)
- `server/services/vts-runner.ts` — the admitted-features block (≈L1958-1998) repointed to `openTrade`; optionally one line on the `OpenVirtualTrade` interface (`expectedEdge?`).
- *(conditional, pending §5 decision)* `server/asset_classes/xstock_spot/eval-cycle.ts` — add the equivalent admitted at-entry-context block.
- `server/tests/unit/` — a small unit test asserting the admitted-features mapping reads from the populated record (guards against silent regression to `tradeRecord`).
- Governance at close: BATCH_CATALOG, PHASE_HISTORY, CHANGES_AND_FIXES, RUNNING_ISSUES (#207 → resolved), MEMORY (3-way). SIM/System-Manual only if the §5 xStock block is added (new writer behavior).

---

## 7. Out of scope
- Backfilling the historically-blank rows (2026-05-05 → now). The forward fix is what matters for Phase-25; a backfill would require re-deriving open-time MCE context that wasn't persisted on those archive rows — not reliably reconstructable, and the realized trades that DID open carry their own `vts_open_trades` record. **Note for the record, do not backfill.**
- Any gate/threshold/strategy change. Pure data-completeness.

---

## 8. Step-1 ask to Langston
1. Ratify the **read-from-`openTrade`** approach (§3) over extend-`Phase10TradeRecord`, and the `expectedEdge` interface-line choice (3-(a) vs 3-(b)).
2. Call on §5: **fold xStock in now** (if its source record is in scope) **or** defer to B-NEW-53.2 — your read on whether bolting a block onto `eval-cycle.ts` is clean or fragile.
3. Confirm §7 "no backfill" is the right call.
4. ACK to proceed to Step-2 pre-audit (per-field source confirmation + the xStock source-availability check + SIM consult).
