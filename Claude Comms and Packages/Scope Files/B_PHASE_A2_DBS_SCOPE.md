# B-PHASE-A2 — xStock DBS Foundation Implementation Scope (rev2)

> **Batch ID:** B-PHASE-A2 (sub-batch of the xStock Calibration Plan, Phase A)
> **Author:** Claude Code
> **Date opened:** 2026-05-17
> **Predecessor:** Phase A.1 design call CLOSED (`B_PHASE_A1_DBS_design_ask_rev2.md`). Langston pre-greenlit on R1-R4 absorption.
> **Plan reference:** `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` §A.2
> **Critical path gate:** unblocks Phase A.3 (DBS verification gate) and Phase B (threshold calibration)
> **Rev1 → rev2 delta:** absorbed Langston Step 1 scope review (7 refinements): D5 now ships `xstock_sector_mappings_reference.md` companion doc for spot-check; D13 isolation note added; D17 high-profile-name spot-check asserts added; D26 + D28 cross-reference each other for B-PHASE-E-PRE-1; §3 pre-audit gains MCE-branch verification + scanner-headroom-fallback beats; §4 specifies numeric minimum test count.

---

## §1 — Objectives (verifiable on staging)

The batch is CLOSED when every numbered objective below shows a YES verdict in the Step 11 completion report.

### Core implementation

1. **NEW** `server/core/metrics/directional-bias-store.ts` is extended to support TWO singleton store instances via constructor option `{ mode: 'crypto' | 'xstock', assetClassForKnobs: 'crypto_spot' | 'xstock_spot' }`. Crypto instance behavior unchanged; xStock instance adds sector partition filter + sector-coverage floor per design rev2 §3.6.
2. **NEW** `xstockDirectionalBiasStore` singleton exported alongside the existing `directionalBiasStore` (crypto). Same module file per design rev2 §3.1.
3. `PairStoreEntry` interface gains optional `sector?: XstockSector` field. Crypto writes leave it undefined; xStock writes populate it from registry lookup.
4. `updatePair()` signature extended with optional 5th parameter `sector?: XstockSector`. All existing crypto call sites unchanged (4 args).
5. `XSTOCK_SPOT_REGISTRY` (`shared/asset-classes.ts`) extended with required `sector: XstockSector` field on every entry. Optional `adr?: boolean` and `cryptoAdjacent?: boolean` flags added. **All ~250 entries get sector mapping in this batch** (TypeScript hard-fails any missed entry). **Companion deliverable (Langston Step 1 #1 — correctness gate):** `Claude Comms and Packages/Langston Design Asks/xstock_sector_mappings_reference.md` — a table of all ~250 entries (ticker, name, GICS sector tag, source citation). Source: S&P GICS canonical mapping (cross-referenced against SEC EDGAR for ADRs). Reference doc lands BEFORE the TypeScript-mapping commit hits `migration/aws-supabase`, so Langston spot-checks a sample (30-60min turnaround) and catches wrong mappings (AAPL→XLK is obvious; MSTR/AMZN/GOOGL/V/MA are judgment calls). Wrong mappings silently corrupt the global xStock DBS weighted-median; the reference doc is the upstream-data correctness gate.
6. **NEW** `XstockSector` union type exported from `shared/asset-classes.ts`: 11 GICS sectors (XLK / XLE / XLV / XLF / XLI / XLP / XLY / XLU / XLB / XLRE / XLC) + `INDEX_PROXY` + `BROAD_ETF` + `INTL_ETF`.

### Scanner integration

7. `server/asset_classes/xstock_spot/scanner.ts` adds a pre-cycle DBS compute block (mirrors `fx5-scanner.ts:1098-1118`) that runs BEFORE the eval loop at line ~467: for each symbol with sufficient OHLC + ATR, compute per-pair DBS + slope, feed `xstockDirectionalBiasStore.updatePair(symbol, score, sentinelZero, volume24hUSD, sector)`, store in `dbsBySymbol` Map for thread-down to eval-cycle.
8. `evaluateXstockPairForVTS` signature extended with `propagatedDbs?: { score; category; slope? }` parameter (mirrors crypto's pattern). Scanner call-site at line ~495 threads `dbsBySymbol.get(symbol)`.
9. `eval-cycle.ts:327` MCE consult passes the propagatedDbs through unchanged: `mce.computeContext(symbol, ohlc, lastPrice, volume24h, undefined, propagatedDbs, ASSET_CLASS)`. MCE's existing non-crypto branch consumes it (no MCE code change needed beyond verifying the path).
10. End-of-cycle `xstockDirectionalBiasStore.publishSnapshot()` invoked after the eval loop. ARCA-closed cycles short-circuit before this (no eval, no publish).

### Backfill

11. **NEW** table `xstock_dbs_backfill` created per design rev2 §4.4 — captures `final_score`, `slope_component`, `return_component`, `ema_component`, `sentinel_zero`, `atr` per bar per symbol. Primary key `(symbol, ts)`; secondary index on `(sector, ts)`.
12. **NEW** script `scripts/b-phase-a2-backfill.ts` replays archived `xstock_spot_ohlc_1m` aggregated to 60-min via `xstockOhlcCache`, computes per-bar DBS components, inserts into `xstock_dbs_backfill`. Idempotent ON CONFLICT DO NOTHING on `(symbol, ts)`. Targets a 14-day window minimum (archive depth permits ~30 days at A.2 ship time).

### module_constants — idempotent migration

13. **NEW** migration `drizzle/migrations/2026-MM-DD-b-phase-a2-dbs-constants.sql` adds the following rows. Pattern: `ON CONFLICT (module, knob, exchange, asset_class, strategy, regime) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()` (idempotent UPDATE per Langston Q7 ACK).

| module | knob | exchange | asset_class | strategy | regime | value | rationale |
|---|---|---|---|---|---|---|---|
| `dbs_calculation` | `min_sample_count` | `*` | `xstock_spot` | `*` | `*` | `30` | global floor |
| `dbs_calculation` | `sector_coverage_floor` | `*` | `xstock_spot` | `*` | `*` | `7` | NEW knob — distinct GICS sectors required |
| `dbs_calculation` | `slope_weight` | `*` | `xstock_spot` | `*` | `*` | `0.40` | byte-identical to crypto |
| `dbs_calculation` | `return_weight` | `*` | `xstock_spot` | `*` | `*` | `0.35` | byte-identical to crypto |
| `dbs_calculation` | `ema_weight` | `*` | `xstock_spot` | `*` | `*` | `0.25` | byte-identical to crypto |
| `dbs_calculation` | `lookback_period` | `*` | `xstock_spot` | `*` | `*` | `48` | byte-identical to crypto |
| `dbs_calculation` | `ema_fast_period` | `*` | `xstock_spot` | `*` | `*` | `12` | byte-identical to crypto |
| `dbs_calculation` | `ema_slow_period` | `*` | `xstock_spot` | `*` | `*` | `26` | byte-identical to crypto |

The wildcard `(*, *, *, *, *)` rows remain at crypto's current values (no change to crypto behavior). **Isolation note (Langston Step 1 #5):** these per-asset-class rows isolate xStock from any future crypto-side retunes of the wildcard rows; xStock-specific retunes happen post-A.3 evidence-gated per rev2 design §2 + CLAUDE.md §8 #11 (per-asset-class is the default; wildcards are placeholders). Whoever reads this scope 18 months from now: the explicit row is intentional, not redundant.

### Telemetry

14. Structured log `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` emitted on the first publish-success of each ARCA session. Captures `seconds_post_open`, per-sector entry counts, total `freshCount`. A.3 verification reads this.
15. Structured log `[B-PHASE-A2][SECTOR_MISSING] symbol=...` warns when scanner encounters a symbol not in the registry (defense-in-depth; TypeScript-checked registry should prevent this in practice).

### Tests (unit + integration)

16. **NEW** unit test `server/tests/unit/b-phase-a2-xstock-dbs-store.test.ts` covers:
    - Two-instance construction (mode='crypto' vs mode='xstock') produces independent stores.
    - xStock store's `publishSnapshot()` applies sector partition + sector-coverage floor.
    - Crypto store's `publishSnapshot()` unchanged (regression-locks crypto behavior).
    - Sentinel entries don't count toward xStock floor; do count toward crypto floor (preserves current crypto behavior + RUNNING_ISSUES entry).
    - INDEX_PROXY / BROAD_ETF / INTL_ETF entries stored but excluded from xStock aggregation.
17. **NEW** unit test `server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts` covers:
    - `evaluateXstockPairForVTS` with `propagatedDbs` provided → MCE receives real DBS, regime classifier uses it.
    - `evaluateXstockPairForVTS` with `propagatedDbs` undefined → MCE's non-crypto branch synthesizes neutral (current behavior preserved for insufficient-OHLC pairs).
    - `XSTOCK_SPOT_REGISTRY` completeness: every entry has a defined `sector` field (TypeScript compile-time check + runtime spot-check).
    - **High-profile-name spot-check asserts (Langston Step 1 #2):** explicit assertions on 15 names whose volume share dominates the weighted-median aggregation, so misclassification is regression-locked at compile + test time:
      ```ts
      expect(XSTOCK_SPOT_REGISTRY.get('AAPL/USD')?.sector).toBe('XLK');
      expect(XSTOCK_SPOT_REGISTRY.get('MSFT/USD')?.sector).toBe('XLK');
      expect(XSTOCK_SPOT_REGISTRY.get('NVDA/USD')?.sector).toBe('XLK');
      expect(XSTOCK_SPOT_REGISTRY.get('JPM/USD')?.sector).toBe('XLF');
      expect(XSTOCK_SPOT_REGISTRY.get('BAC/USD')?.sector).toBe('XLF');
      expect(XSTOCK_SPOT_REGISTRY.get('XOM/USD')?.sector).toBe('XLE');
      expect(XSTOCK_SPOT_REGISTRY.get('CVX/USD')?.sector).toBe('XLE');
      expect(XSTOCK_SPOT_REGISTRY.get('JNJ/USD')?.sector).toBe('XLV');
      expect(XSTOCK_SPOT_REGISTRY.get('ELV/USD')?.sector).toBe('XLV');  // substitute for UNH (not in xStock registry)
      expect(XSTOCK_SPOT_REGISTRY.get('PG/USD')?.sector).toBe('XLP');
      expect(XSTOCK_SPOT_REGISTRY.get('KO/USD')?.sector).toBe('XLP');
      expect(XSTOCK_SPOT_REGISTRY.get('RTX/USD')?.sector).toBe('XLI'); // substitute for BA (not in xStock registry)
      expect(XSTOCK_SPOT_REGISTRY.get('AMZN/USD')?.sector).toBe('XLY');
      expect(XSTOCK_SPOT_REGISTRY.get('TSLA/USD')?.sector).toBe('XLY');
      expect(XSTOCK_SPOT_REGISTRY.get('GOOGL/USD')?.sector).toBe('XLC');
      ```

### Verification

18. Staging deploy verified via Claude-in-Chrome UI: the xStocks tab `/api/xstocks/filter-diagnostics` panel shows per-cycle DBS counts > 0 (proving real DBS values flow). Compare to a representative crypto pair's regime classifier output for sanity.
19. SSH-side psql verification: `SELECT count(*), count(DISTINCT symbol), count(DISTINCT sector) FROM xstock_dbs_backfill;` returns non-zero counts in all three columns after backfill completes.
20. PM2 log review confirms `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` fires at next ARCA open, with `freshCount` clearing the 30-entry + 7-sector floor (or stale-prior served if rotation hasn't covered enough symbols yet).

### Governance (Step 10)

21. `SYSTEM_IMPACT_MAP.md` updated with the new component "xStock Directional Bias Store" + upstream/downstream/blast-radius.
22. `SYSTEM_MANUAL.md` updated with the architecture: two-store pattern, sector taxonomy, floor mechanics, integration flow.
23. `BATCH_CATALOG.md` + `PHASE_HISTORY.md` updated with B-PHASE-A2 closure entry.
24. `CHANGES_AND_FIXES.md` entry for the xStock DBS plumbing fix (replaces synthesized-neutral with real values).
25. `RUNNING_ISSUES.md` entry pre-locked verbatim from rev2 §6: "Crypto DBS floor counts sentinel-zero entries; stricter rule applied to xStock per B-PHASE-A1". Severity low, OPEN.
26. `MULTI_ASSET_VTS_EXPANSION_PLAN.md` + `XSTOCK_CALIBRATION_PLAN.md` updated to mark Phase A.2 SHIPPED + flag Phase A.3 next. **Both docs must include the B-PHASE-E-PRE-1 dependency cross-reference (Langston Step 1 #7):** XSTOCK_CALIBRATION_PLAN.md Phase E section gains an explicit line "Sector-correlation factor work (`b68_3_pair_correlation` repurposed) is GATED on B-PHASE-E-PRE-1 (SPDR offline-feed integration). See MULTI_ASSET_VTS_EXPANSION_PLAN.md Phase E for the placeholder." Both docs reference the placeholder so neither orphans it.
27. `.claude/memory/MEMORY.md` (truth + repo mirror) + `/home/langston/MEMORY.md` (Hetzner) updated with closure state.
28. **B-PHASE-E-PRE-1 placeholder** added to `MULTI_ASSET_VTS_EXPANSION_PLAN.md` Phase E section with description: "Offline SPDR feed integration (FRED daily-close + Yahoo intraday for XLK/XLE/XLV/XLF/XLI/XLP/XLY/XLU/XLB/XLRE/XLC). Estimated 5-7 days. Triggered by B-PHASE-A1 §3.3 11/11-missing escalation. Path-1 recommended; paths 2/3 rejected (circularity / silent factor drop). Final path locked at Phase E kickoff design ask. Kyle override window at Phase E kickoff."

---

## §2 — Out-of-scope (deferred)

- xStock-specific DBS component-weight retune (post-A.3 evidence-gated)
- Volume-weighted-median skew analysis at the architectural level (A.3 verification scope)
- Sector-correlation factor work (Phase E, gated on B-PHASE-E-PRE-1)
- Crypto-side sentinel-counting hardening (filed as RUNNING_ISSUES open item; future batch)
- SPDR offline feed integration (B-PHASE-E-PRE-1 placeholder; Phase E)
- UI surfacing of xStock global DBS on the xStocks tab dashboard (Phase A.3 or later)

---

## §3 — Pre-audit checklist (Step 2 deliverable)

`B_PHASE_A2_DBS_PRE_AUDIT.md` will document:

1. **SIM consultation:** xstock_spot scanner + eval-cycle + MCE entry shape changes.
   - UPSTREAM: `xstockOhlcCache.getOHLCDataBatch(60)` already returns 60-min bars; no upstream change.
   - DOWNSTREAM consumers of `directionalBiasStore`: enumerate via grep. Confirm xstock store has zero existing consumers (new singleton; first consumer is A.3 verification queries).
   - SHARED STATE: `module_constants.dbs_calculation.*` row resolution. Verify the new xstock_spot rows resolve correctly via the precedence rules; wildcard fallback for crypto unaffected.
   - BACKGROUND EXECUTION: pre-cycle DBS compute adds ~50ms × N pairs to scanner cycle. Worst case 200 pairs × 50ms = 10s. Current scanner cycle budget 25s; check headroom.
   - BLAST RADIUS: Medium. New code paths only activate on xstock_spot eval; crypto behavior provably unchanged.

1.a **MCE non-crypto-branch verification (Langston Step 1 #3 — material):** trace `mce.computeContext()` non-crypto branch end-to-end and confirm the `propagatedDbs` argument is actually READ, not discarded by a hidden `assetClass === 'crypto_spot'` guard further down the call chain. Read `market-context-engine.ts:889-916` carefully; verify no second guard between the directionalBias assignment and the downstream consumers (regime classifier, confidence modifier, Path-B sustainability gate). If discarded anywhere, MCE code change goes into B-PHASE-A2 scope, NOT deferred to a future batch. Better to catch this in pre-audit than at Step 4 code review.

2. **System Manual consultation:** verify rev2 §3 architecture is consistent with the current State Manual's DBS chapter; flag any contradictions.

3. **Two-instance construction safety:** confirm the constructor pattern doesn't break tests that mock `directionalBiasStore`.

4. **Registry completeness pre-check:** before code lands, dry-run-grep `XSTOCK_SPOT_REGISTRY` entries to confirm the sector mapping is committable without surprises (intel/healthcare/finance-heavy concentrations expected).

5. **Archive maturity gate (v2 plan §A.2 invariant):** re-verify `xstock_spot_ohlc_1m` start date at PR-open time. <7 days → A.2 WAITS. 7-14 days → ship with thinness caveat. 14+ days → no caveat. Expected ≥30 days at A.2 ship.

6. **Scanner-headroom-fallback design (Langston Step 1 #4):** if pre-audit measurement of (DBS compute time × N pairs) consumes more than 70% of the 25s scanner cycle budget (i.e., headroom margin <30%), the pre-audit pre-commits to a fallback design BEFORE implementation lands. Three candidate mitigations, ranked:
   - **(a)** Compute DBS only for symbols passing the pre-MCE global-filter (liquidity/price/volume gates); insufficient-OHLC + global-filter-rejected pairs skip DBS compute entirely. Cuts compute count from ~200 to ~50-100 in steady state.
   - **(b)** Batch ATR + DBS compute in a worker pool (Node.js worker_threads) parallel to the SQL round-trips. Cuts wall-clock by 4-6× on multi-core; small refactor cost.
   - **(c)** Throttle to the N most-recently-updated pairs per cycle; rotate through the universe. Risk: DBS staleness for non-priority pairs.
   Pre-audit measures empirically (on staging, via timing instrumentation), picks the fallback if needed, captures in scope rev3 before Step 3 implementation. **Better to have the fallback designed at pre-audit than improvised at Step 4.**

---

## §4 — Verification criteria (Step 7 + Step 8)

Step 7 (CC first-pass) and Step 8 (Langston second-pass) both verify:

- **Minimum 85 unit tests passing** (current 76/76 baseline + D16 ≥5 cases + D17 ≥4 cases = floor 85; Langston Step 1 #6 numeric specificity). New tests must register cleanly; if collision with existing test names or test files, count below 85 is a regression signal.
- TypeScript compiles cleanly (CI baseline maintained; pre-existing 13 failures unchanged).
- PM2 logs show `[B-PHASE-A2][FIRST_FLOOR_CLEAR]` at next ARCA open.
- psql `xstock_dbs_backfill` populated with >7 days of bars.
- xStocks tab UI shows non-zero DBS values flowing through the regime classifier (Claude-in-Chrome navigation per §10.5 rule and CLAUDE.md §9.3 STAGING-VERIFIED-means-UI-navigated).
- `XSTOCK_SPOT_REGISTRY` regression test passes (every entry has `sector`).
- Crypto FX5 cycle metrics unchanged on staging post-deploy (regression-lock).

---

## §5 — Workflow plan

Standard 11-step workflow:

1. ✅ Scope (this doc) — Kyle/Langston ACK pending
2. Pre-audit — written after scope ACK
3. Implementation — sequential commits per logical chunk
4. Step 4 Langston code review — embed-diff-inline per CLAUDE.md §6.5.0.a
5. Push to GitHub + CI
6. Hetzner staging deploy
7. CC first-pass verify (UI + psql + PM2)
8. Langston second-pass verify (independent)
9. Iterate if needed
10. Governance updates per §1 deliverable list
11. Completion report

**Nominal duration: 3-5 days** per v2 plan §2.

---

— Claude Code, 2026-05-17
