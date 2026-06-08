# B-NEW-53.1 — STEP-4 CHANGE LIST (code review) — #207 admitted-features fix

**Author:** Claude Code. **Date:** 2026-06-08. **Reviewer:** Langston. **Step-1 + Step-2:** consensus reached (this implements your ratified read-from-`openTrade` + expectedEdge 3-(a) + xStock DEFER).
**INFRASTRUCTURE NOTE:** do NOT `cd /mnt/gdrive` or run `git status`/`git log` on the gdrive-mounted repo (FUSE hang). The full diff is embedded below. For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`.

**Diff = ONE file, `server/services/vts-runner.ts`. No migration (JSONB `schema_version` — additive). Telemetry-only; active trading OFF.**

---

## Step-2 deliverables (your 3 mandated items — full detail in `B_NEW_53_1_PRE_AUDIT.md`)
1. **Per-field source confirmed:** 12 of 13 broken fields are typed properties on `OpenVirtualTrade` (L532-601), so they resolve on the already-fetched in-scope handle `persistedTrade` (`vts-runner.ts:1934`). The 13th, `expectedEdge`, is written by the literal (≈L1486) + persisted to DB but **not declared** on the interface → fixed via 3-(a) (one optional line).
2. **xStock = DEFER to B-NEW-53.2** (clears your high bar). The xStock admitted **archive** hook (`eval-cycle.ts:703`) fires **BEFORE** `registerOpenVtsTrade` (L727) → **no in-scope SSOT record**; `quantity`/`dollarValue` are computed below the hook; `pairIdHash` + `strategyPhaseWeight` are **absent on xStock entirely**. Folding in needs a reorder/hoist + a decision on the 2 absent fields = re-derivation, not a pure read. Surfaced to you explicitly per your condition.
3. **SIM consult:** SIM L1597-1600 documents B70.2's intent ("admitted-row `features` JSONB expanded, mirroring open-trades CSV") — **this fix realizes the documented behavior** the wrong-object read silently defeated. No migration (L1629 JSONB schema_version). Only downstream consumer = post-launch Trend Mining Engine (JSONB-tolerant). Blast radius LOW.

---

## CHANGE 1 — `OpenVirtualTrade` interface: declare `expectedEdge` (your 3-(a))
**BEFORE (≈L548):**
```ts
  decayPenalty: number;
  pool: 'ideal' | 'rotational';
  openedAt: number;
```
**AFTER:**
```ts
  decayPenalty: number;
  // B-NEW-53.1 (2026-06-08, #207): declared to match the literal (≈L1486) + the
  // persisted DB row. Consumed by the B70.2 admitted-features archive, which had
  // been reading it off the lean Phase10TradeRecord (which never carried it) →
  // archived undefined on every crypto admitted row since 2026-05-05. Optional →
  // backward-compatible with every other OpenVirtualTrade construction site.
  expectedEdge?: number;
  pool: 'ideal' | 'rotational';
  openedAt: number;
```

## CHANGE 2 — admitted-features block: repoint the 13 broken reads to `persistedTrade`
The hook already has `const persistedTrade = openVirtualTrades.get(tradeId)` (L1934). Per your Step-4 conditions: (i) **same in-scope handle**, no fresh lookup ✓; (ii) **defensive `?? null`** so a cold-start Map miss degrades the row, never substitutes a stale value ✓.

**BEFORE (the 13 broken reads — abbrev.):**
```ts
        entryPrice: tradeRecord.entryPrice,        // → undefined (type has `entry`, not entryPrice)
        target: tradeRecord.takeProfit,            // → undefined (not on Phase10TradeRecord)
        stopLoss: tradeRecord.stopLoss,            // → undefined
        quantity: tradeRecord.quantity,            // → undefined
        expectedEdge: tradeRecord.expectedEdge,    // → undefined
        regimeConfidenceRaw: tradeRecord.regimeConfidenceRaw,    // → undefined
        macroModifierValue: tradeRecord.macroModifierValue,      // → undefined
        phase: tradeRecord.phase,                  // → undefined
        phaseAgeSeconds: tradeRecord.phaseAgeSeconds,            // → undefined
        strategyPhaseWeight: tradeRecord.strategyPhaseWeight,    // → undefined
        pairIdHash: tradeRecord.pairIdHash,        // → undefined
        atrAtOpen: tradeRecord.atrAtOpen,          // → undefined
        // ...and in modulators:
        regimeConfidenceModulated: tradeRecord.regimeConfidenceModulated,  // → undefined
```
**AFTER:**
```ts
        entryPrice: persistedTrade?.entryPrice ?? null,
        target: persistedTrade?.takeProfit ?? null,
        stopLoss: persistedTrade?.stopLoss ?? null,
        quantity: persistedTrade?.quantity ?? null,
        expectedEdge: persistedTrade?.expectedEdge ?? null,
        regimeConfidenceRaw: persistedTrade?.regimeConfidenceRaw ?? null,
        macroModifierValue: persistedTrade?.macroModifierValue ?? null,
        phase: persistedTrade?.phase ?? null,
        phaseAgeSeconds: persistedTrade?.phaseAgeSeconds ?? null,
        strategyPhaseWeight: persistedTrade?.strategyPhaseWeight ?? null,
        pairIdHash: persistedTrade?.pairIdHash ?? null,
        atrAtOpen: persistedTrade?.atrAtOpen ?? null,
        // modulators:
        regimeConfidenceModulated: persistedTrade?.regimeConfidenceModulated ?? null,
```
**Untouched (already correct — declared + set on `tradeRecord`):** `positionSize`, `signalType`, `patternType`, `pool`, `sourcePool` (local), `filterTier`, `hybridScore`, `predictiveConfidence` (local), `regimeWeight` (local), `decayPenalty`, the 7 regime/friction/directional-bias fields, `chain_modulated_confidence` (local).

---

## Verification (bench, C:\dev)
- **tsc baseline gate GREEN:** `vts-runner.ts` TS2339 **25 → 8** (the 13 broken reads were literally type errors — now resolved by typed reads off `persistedTrade`). Total 494→476. "OK — no regressions above baseline."
- **vitest:** no new failures — the 11 pre-existing failing files (DB-integration + regime-mapping + pattern-filter, identical to clean head per the B-NEW-53 report) are unchanged; the B-NEW-53 provenance test passes; nothing in the admitted path broke.

## ⚠️ ONE DESIGN QUESTION FOR YOU (regression guard)
The tsc drop (25→8) means a future regression back to `tradeRecord.<field>` would **re-introduce those TS2339s** — but they currently sit *under* the frozen baseline (25), so CI would NOT catch a partial regression. Three options for a durable guard; **your call:**
- **(a) Ratchet `.tsc-baseline.json` down** (regenerate via `--generate`) so the 8 becomes the new floor → CI auto-blocks any regression to `tradeRecord`. **Risk:** regenerating the full baseline in the Windows bench could differ from CI's Linux tsc by ±1 on some file → red CI. Would need careful verification.
- **(b) A unit test** asserting the mapping reads from the open-trade record. **Cost:** `OpenVirtualTrade`/the hook aren't exported; testing it cleanly needs extracting a pure mapper module (more surface than you asked for inline).
- **(c) Rely on the live Step-7 re-query** (crypto admitted rows → all 13 populated 100%) as the behavioral gate, baseline left as-is (safe green CI).
- **My recommendation: (c) for this batch** (proportionate, safe green CI) + note the baseline-ratchet as a future hygiene pass. But you own the test-discipline call — if you want (a) or (b), I'll do it.

## Governance plan at close (incl. your Ask-3 condition)
Document the **known-NULL window 2026-05-05 → deploy** in the #207 resolution + `CHANGES_AND_FIXES.md` so Phase-25 queries exclude/handle it. Plus BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (#207 resolved + new B-NEW-53.2 for the xStock fold-in), SIM note (B70.2 behavior realized), MEMORY 3-way.

**Ask:** APPROVE TO PUSH (with your call on the (a)/(b)/(c) regression-guard question), or flag revisions.
