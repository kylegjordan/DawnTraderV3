# B-5.1 Pre-audit — AMR input-integrity fixes (#222/#223/#224)

**Date:** 2026-06-12 · Scope ACK'd by Langston (D1 confirmed w/ boundary-record condition; D2 confirmed w/ annotation; D3 confirmed; Notes 1-4). This pre-audit answers Notes 2 and 3 and enumerates the implementation surface. SIM consulted: B-5 section (12 components) + the relevant legacy sections; System Manual Ch12.

## Note-2 answer — #223 first-write semantics (pinned)

`setCostMetrics(symbol, data)` builds a full entry (missing fields ← defaults) and merges onto existing. The guard: **a negative `data.spread` is dropped as a non-measurement at the FIELD level** —
- existing entry → other fields update; `spread` retains the prior value (prior-good-measurement retained);
- **NO existing entry → NO entry is created** by a spread-only write carrying a negative value. Writing DEFAULT_SPREAD instead would fabricate a "measured" sample: the friction sampler counts every entry with spread ≥ 0, so a default-stamped entry inflates n with invented data. A cache miss is the honest state; the reader's existing cache-miss path covers it.
- **Zero spread stays accepted** (locked book = legitimate measurement). Negative-only rejection.
- Log: once per symbol per 5-min window (`[CostCache] crossed-quote spread rejected`), not per write (crossed books can persist seconds and the writers run per-scan).
- Unit tests: (a) prior retained on negative write; (b) first-write-negative → no entry (getCacheMetrics undefined); (c) zero accepted; (d) positive path unchanged.

## Note-3 answer — ACTIVE-mode restart behavior with IDLE (pinned; REAL GAP FOUND)

**Current code (amr-gates.ts:121-123):** under `enforce` (flag=active), `mode === null` → `{ allowed: true, executed: 'skipped' }` — the B-5 "boot/idle = no posture, no gating" branch. Consequence under ACTIVE: every fresh restart has an UNGATED window until the first LIVE classification (~30-60s today), and the O3 IDLE-extension would WIDEN that window (IDLE holds mode null until friction warms) — precisely the moved-not-closed failure Note 3 warned about.

**Pinned design:** the null-mode branch becomes execution-aware —
- `enforce` (ACTIVE): `mode === null` → **fail closed**: block with gate `no_posture` (reason: boot/warm-up/idle — no live weather read yet). All four gate sites are ENTRY-side (SQE admit, paper-engine entry, RTB promotion re-check, realtime executor) — exits are never gated, so fail-closed cannot trap an open position. xStock weekends under ACTIVE: IDLE all weekend → no new xstock entries while the market is closed — correct by construction.
- `dry_run` (SHADOW): `mode === null` → skip as today (nothing to rehearse; the ledger records the IDLE cycle separately). Shadow behavior unchanged — no mid-shadow-week evidence disturbance from this branch.
- **No persisted-posture hazard:** posture lives ONLY in the in-memory per-class tracker (verified — ClassTrackers map, no DB/file persistence; ledger rows are records, never read back as state). "Hold last persisted posture" cannot occur; restart always passes through null → (now) blocked-under-active → first LIVE read ≤ NORMAL (post-IDLE rule).
- Tests: enforce+null → blocked with `no_posture`; dry_run+null → skipped; enforce+resolved → existing behavior.

## Implementation surface (per object)

**O1 (#222):** `market-context-engine.ts:1395` — wrap in `if (assetClass === 'crypto_spot')` (allowlist per Note 1). Diff-review confirmation: line 1395 is the ONLY `directionalBiasStore.updatePair` call site (grep-verified: one production hit). Regression test: class-generic — seed compute for `xstock_spot` AND a synthetic class string; assert crypto store size unchanged (store-level lock, not symbol-name heuristics). Audit-script extension: crypto DBS dump asserts zero known-equity symbols (existing registry membership check) — permanent live-level lock (verification criterion 1).
**O2 (#223):** `cost-cache.ts` `setCostMetrics` field-level guard per Note-2 answer. Both writers covered (market-scanner.ts:728, fx5-scanner.ts:1062 — chokepoint).
**O3 (#224):** `amr-weather-report.ts` classification path — friction null with reason WARMING/NO_SOURCE → IDLE branch (same shape as the existing vote-IDLE branch; staleness[] carries `friction_warming`/`friction_no_source`); `amr-gates.ts` null-mode enforce/dry_run split per Note-3 answer; panel copy already renders IDLE honestly (no UI change — the legend's IDLE row covers warm-up). 28-test suite: update friction-absent seeds; ADD one explicit friction-absent → IDLE assertion per class (Note 4); warm-up fixture (WARMING → IDLE → first LIVE ≤ NORMAL).

## Blast radius

- O1 changes the crypto global DBS aggregate VALUE (to the correct one): consumers = market-indicators display, MCE computeGlobalBias → B62 confidence modifier, VTS `globalDirectionalBias[Score]` stamps, AMR dbs input. **D2 condition honored:** deploy timestamp recorded in CHANGES_AND_FIXES + completion report as (a) the intra-epoch-4 DBS-stamp boundary (D1 condition) and (b) the shadow-week evidence annotation (step-change attribution).
- O2: strictly-cleaner cache values; readers unchanged.
- O3: ledger/panel show more IDLE cycles at boot (honest); shadow dry_run unchanged; ACTIVE-mode behavior changes only in the previously-ungated null window (now blocked) — no ACTIVE consumer exists today (both flags shadow).
- Governance (Step 10): SIM B-5 section + Manual Ch12 (IDLE-during-warm-up + no_posture gate + friction-source-prerequisite line), ASSET_CLASS_ONBOARDING_WORKFLOW (Note 4: friction source = prerequisite for AMR LIVE classification), RUNNING_ISSUES (#222/#223/#224 → RESOLVED), CHANGES_AND_FIXES entry w/ boundary timestamp, BATCH_CATALOG, PHASE_HISTORY, completion report w/ Note-1 grep statement.

## ADDENDUM (2026-06-12, pre-deploy — Kyle workflow challenge): cost-cache reader enumeration, PROVEN not asserted

The original blast-radius line "O2: readers unchanged, strictly cleaner values" was an ASSERTION. Kyle challenged whether the SIM-grade consumer walk was actually done for the cost cache (an old component, SIM §2.5 — not part of the day-fresh B-5 docs the rest of this batch leaned on). It had not been done explicitly. Done now, before deploy; CI was still running, nothing shipped un-walked.

**The new miss source:** first-write-crossed → no entry created. A miss was ALWAYS possible (5-min TTL expiry, never-scanned symbols), so the question is whether every reader handles it. Every reader, verified at the call site:

| Reader | Site | Miss handling | Verdict |
|---|---|---|---|
| market-indicators (friction sampler) | :281 | `if (metrics && metrics.spread >= 0)` — skip symbol | SAFE (B-5 guard) |
| telemetry-aggregator | :1402-1410 | null → canonical-symbol retry → `getOrSetCostMetrics` defaults fallback (pre-existing semantics for any miss) | SAFE |
| fx5-scanner (spread audit log) | :1775 | `cachedMetrics?.spread ?? 0.001` — debug logging only | SAFE |
| tec-costs diagnostics | :43-58 | explicit `if (metrics)` else defaults branch (labeled source) | SAFE |
| routes diagnostics ×2 | :8508-8523, :8559 | same explicit defaults branch / `getOrSetCostMetrics` | SAFE |
| cost-model | :179 | `getOrSetCostMetrics` (creates defaults; never-null path — proven unaffected, DEFAULT_SPREAD ≥ 0) | SAFE |

(`cost-model.ts:205 getCostMetricsCache` is cost-model's OWN map, not this cache — not a reader.)

**SIM note:** SIM §2.5 covers the Cost Cache; its consumer list will be refreshed with this table at Step-10 governance. Lesson folded into the batch record: a component outside the current batch's fresh documentation gets the explicit SIM walk, regardless of diff size.
