# B-NEW-53.2 — SCOPE — xStock admitted at-entry-context block (RUNNING_ISSUES #208)

**Author:** Claude Code. **Date:** 2026-06-08. **Predecessor:** B-NEW-53.1 (#207, crypto admitted-features fix — CLOSED + live-confirmed). **Type:** telemetry data-completeness, additive. **No trade/gate/decision change; no migration; active trading OFF.**

> **Origin (B-NEW-53.1 Step-2 finding, Langston DEFER):** xStock admitted rows are blank for at-entry economics/context — but by a DISTINCT mechanism from #207: the xStock decision path (`server/asset_classes/xstock_spot/eval-cycle.ts`) **never had a B70.2-style at-entry block** (its admitted `features` are scoring-metadata-only by design). The archive hook fires BEFORE `registerOpenVtsTrade`, so there's no in-scope SSOT record → Langston's correct call was DEFER to its own batch (this one) because folding it in needs a reorder/payload-hoist + a decision on fields xStock doesn't compute. Confirmed live: 0 of 23 xStock admitted rows in 36h carry these fields.

---

## 1. The gap
The xStock admitted archive hook (`eval-cycle.ts` ≈L703) writes `features = { sourcePool, hybridScore, predictiveConfidence, regimeWeight }` — scoring-metadata only. It carries none of the at-entry economics/context that the crypto path now archives (post B-NEW-53.1): entry/stop/target/quantity/positionSize/expectedEdge/atrAtOpen/phase/phaseAgeSeconds/regimeConfidence*/macroModifierValue. For Phase-25 xStock calibration (the same reason Kyle wanted crypto provenance captured), these belong on xStock admitted rows too. **Not a replay blocker** — B-NEW-53 provenance already captures the replay-critical xStock inputs (forming bar + resolved stop/target + constants); this is *additional* at-entry context.

## 2. Why it's a real batch (not a 53.1-style one-liner)
Verified in code — the flow is `detect → finalScore → Net-EV → archive (L703) → registerOpenVtsTrade (L727)`:
- The archive hook fires **before** `registerOpenVtsTrade`, so there is **no in-scope open-trade record** to read (unlike crypto's `persistedTrade`).
- `dollarValue` (L725) + `quantity` (L726) are computed **after** the archive hook.
- The `registerOpenVtsTrade(...)` payload (L727-761) DOES already compute the 11 at-entry fields xStock has (entryPrice/stopLoss/takeProfit/positionSize/quantity/atrAtOpen/macroModifierValue/regimeConfidenceModulated/regimeConfidenceRaw/phase/phaseAgeSeconds) — but as an inline argument literal, below the hook.
- `pairIdHash` + `strategyPhaseWeight` are **absent on xStock entirely** (the cohort A/B marker is crypto-only per B67.3; eval-cycle applies no phase-preference modulation, so no `strategyPhaseWeight` is computed).

## 3. Fix (recommended — Langston to ratify)
**Payload-hoist (keeps the archive-before-register ordering + makes the values a single SSOT both read):**
1. Move the `dollarValue` (L725) + `quantity` (L726) computation **above** the admitted archive hook.
2. Build the `registerOpenVtsTrade` argument as a named **`const xOpenTrade = { ... }`** just above the archive hook.
3. Add an at-entry-context `features` block to the admitted `archiveSignalEval` call, reading **purely** from `xOpenTrade` + the in-scope locals (no re-derivation).
4. `const tradeId = await registerOpenVtsTrade(xOpenTrade);` (unchanged behavior — same object).

**Per-field mapping (mirrors the crypto B70.2 key set for cross-class Phase-25 query uniformity):**
| key | xStock source | note |
|---|---|---|
| `entryPrice`/`stopLoss`/`target`/`quantity`/`positionSize` | `xOpenTrade.*` | ✓ genuine |
| `atrAtOpen` | `xOpenTrade.atrAtOpen` (`mceContext.indicators.atr`) | ✓ |
| `regimeConfidenceRaw`/`regimeConfidenceModulated`/`macroModifierValue`/`phase`/`phaseAgeSeconds` | `xOpenTrade.*` | ✓ |
| `pairDirectionalBias(+Score)` | `xOpenTrade.*` | ✓ (already in payload) |
| **`expectedEdge`** | **`kernelResult.netEV`** | xStock's friction-adjusted net expectancy (in scope at the hook) — the proper xStock analog of crypto's `finalScore*dynamicTarget − frictionCost`. **Langston confirm the semantic.** |
| **`pairIdHash`** | **`null`** | crypto-only cohort A/B marker (B67.3); xStock runs no such experiment → null + documented, NOT fabricated. |
| **`strategyPhaseWeight`** | **`null`** | eval-cycle applies no phase-preference modulation → no weight is computed on xStock → null + documented. |
| `signalType`/`patternType`/`pool`/`sourcePool` | `stratDef.*` / `'rotational'` / `lane.sourcePool` | ✓ in scope |

**Same key SET as the crypto block, with explicit `null` where xStock genuinely lacks the value** — so a Phase-25 cross-class query reads one schema. `?? null` throughout (preserves the JSONB key, per the B-NEW-53.1 / Langston rule). Telemetry-only; the only structural change is moving 2 already-present computations up + naming the payload — zero behavior change to the trade or the gates.

## 4. Numbered objectives + verification
1. **xStock admitted rows populate the at-entry block.** *Verify:* post-deploy live query — xStock admitted `features` carry entryPrice/stopLoss/target/quantity/atrAtOpen/phase/expectedEdge etc. at 100%; `pairIdHash`/`strategyPhaseWeight` present-as-null (key exists, value null).
2. **Values equal the trade that registered + sane.** *Verify:* archived entry/stop/target == the same trade's `vts_open_trades` row; stop/entry/target ordering correct.
3. **Zero behavior change.** *Verify:* `registerOpenVtsTrade` receives the identical object; the gates (net-EV, pre-open) and reject archives are untouched; trade-open count unaffected.
4. **No new tsc baseline errors; suite green.**
5. **Cross-class uniformity.** *Verify:* xStock admitted `features` keys == crypto admitted `features` keys (same schema; nulls where genuinely absent).
6. **Telemetry-only / safety:** diff confined to `eval-cycle.ts` admitted branch; no migration; active trading OFF.

## 5. Out of scope
- Backfill of historical xStock admitted rows (forward-only; the realized xStock trades carry their own `vts_open_trades`).
- Any gate/threshold/strategy change.
- The crypto-only cohort A/B experiment or phase-preference modulation on xStock (not adding them — capturing genuine state only).

## 6. Files in play
- `server/asset_classes/xstock_spot/eval-cycle.ts` (the admitted branch: hoist payload + add the features block). **No migration.**
- `server/tests/unit/` — a small test if the mapping is cleanly testable (likely the same import-side-effect constraint as 53.1 → may rely on live-verify + Langston Step-4; surface the choice).
- Governance at close: RUNNING_ISSUES #208 resolved, CHANGES_AND_FIXES, BATCH_CATALOG, PHASE_HISTORY, SIM (the B70.2 line's xStock note → realized), MEMORY 3-way.

## 7. Step-1 ask to Langston
1. Ratify the **payload-hoist** approach (§3) over reorder-archive-after-register (which would couple admitted-archival to trade-open success — a contract change).
2. Confirm **`expectedEdge` = `kernelResult.netEV`** is the right xStock semantic.
3. Confirm **`pairIdHash` = null + `strategyPhaseWeight` = null** (documented crypto-only / not-in-xStock-decision-path) is correct vs adding lookups — i.e. capture genuine state, don't fabricate.
4. Confirm **mirror the crypto key set** (same schema, null where absent) for Phase-25 cross-class query uniformity.
5. ACK to proceed to Step-2 pre-audit.
