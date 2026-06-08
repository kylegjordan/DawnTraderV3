# B-NEW-53.1 — PRE-AUDIT (Step-2) — admitted-features undefined-fields fix (#207)

**Author:** Claude Code. **Date:** 2026-06-08. **Predecessor scope:** `B_NEW_53_1_SCOPE.md` (Langston Step-1 = full consensus, conditions noted).
**Langston Step-2 mandate (verbatim from his Step-1 reply):** "(1) per-field source confirmation that all 13 resolve on the in-scope `openTrade` handle; (2) the xStock source-availability check that decides the Ask-2 carve-out; (3) SIM consult. I'll hold the in-scope-handle and `?? null` verification for Step-4 on the actual diff."

---

## Deliverable 1 — Per-field source confirmation (all 13 resolve on the in-scope handle)
**The in-scope handle:** at the crypto admitted archive hook, `const persistedTrade = openVirtualTrades.get(tradeId)` is **already fetched** (`vts-runner.ts:1934`, used for `chainModulatedConfidence`). Type = `OpenVirtualTrade | undefined`. The fix reads every broken field from **`persistedTrade?.<field> ?? null`** — reusing that same handle (no second `Map.get`), defensive `?? null` so a cold-start `Map` miss degrades the row instead of substituting a stale value. This satisfies Langston's Step-4 conditions (i) + (ii) by construction.

**`OpenVirtualTrade` interface (L515-602) declares 12 of the 13 as typed properties** — verified line-by-line:

| archived key | block | `OpenVirtualTrade` decl | openTrade literal sets it |
|---|---|---|---|
| `entryPrice` | features | L532 ✓ | L1467 lit |
| `target` ← `takeProfit` | features | L534 ✓ | ✓ |
| `stopLoss` | features | L533 ✓ | ✓ |
| `quantity` | features | L537 ✓ | L1322 → lit |
| `atrAtOpen` | features | L575 ✓ | L1523 |
| `pairIdHash` | features | L591 ✓ | L1531 |
| `regimeConfidenceRaw` | features | L596 ✓ | L1538 |
| `macroModifierValue` | features | L597 ✓ | L1537 |
| `phase` | features | L598 ✓ | L1543 |
| `phaseAgeSeconds` | features | L599 ✓ | L1544 |
| `strategyPhaseWeight` | features | L600 ✓ | L1545 |
| `regimeConfidenceModulated` | modulators | L601 ✓ | L1536 |
| **`expectedEdge`** | features | **NOT declared** | L1486 lit (written, persisted, but interface under-declares) |

**`expectedEdge` → fix 3-(a) (Langston-ratified):** add `expectedEdge?: number;` to the `OpenVirtualTrade` interface (one line, near `decayPenalty` L548). The literal already writes it and it already persists to DB; the interface is simply honest after this. Optional field → backward-compatible → no other `OpenVirtualTrade` construction site breaks. Then all 13 reads are uniform `persistedTrade?.<field> ?? null`.

**Fields that already populate correctly (NOT touched):** `positionSize` (Phase10TradeRecord L485, set L1621), `signalType`, `patternType`, `pool`, `sourcePool` (local), `filterTier`, `hybridScore`, `predictiveConfidence` (local), `regimeWeight` (local), `decayPenalty`, the 7 regime/friction/directional-bias fields, `chain_modulated_confidence` (local). Surgical diff = the 13 broken reads + 1 interface line.

**Why tsc never caught it:** these are reads of properties absent from `Phase10TradeRecord`; they sit in the tsc **baseline** (the CI gate blocks only *new* errors). Repointing to `persistedTrade` (typed) + the `expectedEdge?` interface line removes them cleanly with **zero new baseline errors**.

## Deliverable 2 — xStock source-availability → **DEFER to B-NEW-53.2** (clears Langston's high bar)
**Finding (verified in `server/asset_classes/xstock_spot/eval-cycle.ts`):** the xStock admitted **archive** hook (L703) fires **BEFORE** `registerOpenVtsTrade(...)` (L727). So there is **no in-scope SSOT open-trade record** at the hook — the equivalent rich record is constructed *inside* `registerOpenVtsTrade` from an argument literal built *below* the hook. Concretely:
- `quantity` (L726) + `dollarValue` (L725) are computed **after** the archive hook → not in scope at L703.
- `pairIdHash` is **never set on xStock** (cohort marker is crypto-only per the B67.3 comment) — **absent field**.
- `strategyPhaseWeight` is **not captured on xStock** (the `registerOpenVtsTrade` payload L727-761 omits it) — **absent field**.
- The rest (`entryPrice`/`stopLoss`/`takeProfit`/`atrAtOpen`/`phase`/`phaseAgeSeconds`/`regimeConfidence*`/`macroModifierValue`) exist only as scattered locals / `mceContext.*` reads, not a single record.

Folding xStock in would therefore require a **reorder** (archive after register, or hoist the payload into a named `const` above the hook + move the quantity/dollarValue computation up) **plus a decision on the 2 absent fields** — i.e. re-derivation/refactor, **not** the "pure read from an existing SSOT record, zero re-derivation, same shape" bar Langston set. **→ DEFER to B-NEW-53.2** (its own pre-audit). Not a replay blocker: B-NEW-53 provenance already captures the replay-critical xStock inputs (forming bar + resolved stop/target + constants) on admitted rows. Surfaced to Langston explicitly per his condition.

## Deliverable 3 — SIM consult (`SYSTEM_IMPACT_MAP.md`)
- **L1597-1600 (B70.2):** SIM documents the intended behavior — "`signal_eval_archive` admitted-row `features` JSONB expanded similarly, mirroring open-trades CSV." **The fix realizes the SIM-documented behavior** that the wrong-object read silently defeated on the crypto live path. Governance note at close: the SIM described the *intent*; reality wrote `undefined`; this batch makes reality match the doc.
- **No migration:** `features` is JSONB with a `schema_version` field; SIM L1629 explicitly states "JSONB schema_version field allows feature evolution without retroactive migration." Populating previously-NULL keys is **additive + schema-tolerant**. **No `*.sql`, no MANIFEST entry.**
- **Downstream consumers:** the only archive consumer named is the **post-launch Trend Mining Engine** (Phase 17.6/18.5, SIM L1629) — JSONB-tolerant, additive-safe. The drift dashboard reads in-memory counters, not these features (SIM L2135). **No consumer breaks.**
- **Blast radius: LOW** — one file (`vts-runner.ts`), one block (the crypto admitted features/modulators construction) + one interface line. Telemetry-only; active trading OFF; inside the existing best-effort try/catch.

---

## Implementation plan (Step-3)
1. `vts-runner.ts` — add `expectedEdge?: number;` to `OpenVirtualTrade` (≈L548).
2. `vts-runner.ts` — in the admitted archive hook, repoint the **13** broken reads from `tradeRecord.<field>` to `persistedTrade?.<field> ?? null` (12 in `features`, `regimeConfidenceModulated` in `modulators`). Leave the already-correct reads untouched.
3. `server/tests/unit/` — a unit test asserting the admitted-features mapping pulls from the open-trade record (guards against silent regression back to `tradeRecord`).
4. Bench: `node scripts/check-tsc-baseline.mjs` (zero new errors) + `npx vitest run` (no new failures).

## Verification (Step-7, live)
Re-run the §1 scope query on crypto admitted rows post-deploy → each `has_*` count == `admitted_rows` (100%); spot-check values sane + equal to the same trade's `vts_open_trades` row; `pairIdHash` stable per symbol (cohort not re-rolled).

## Governance at close (per Langston Ask-3 condition)
Document the **known-NULL window 2026-05-05 → deploy** in the #207 resolution + `CHANGES_AND_FIXES.md` so Phase-25 calibration queries exclude/handle it (those NULLs are a capture gap, not meaningful data). Plus BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (#207 resolved + open B-NEW-53.2 for the xStock fold-in), SIM note (B70.2 behavior realized), MEMORY 3-way.
