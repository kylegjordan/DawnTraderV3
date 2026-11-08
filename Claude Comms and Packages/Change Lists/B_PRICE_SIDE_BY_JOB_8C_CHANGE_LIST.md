# B-PRICE-SIDE-BY-JOB row `8c` (switch-on) — Step-4 CHANGE LIST (CC-C)

> **RECONCILED 2026-11-08 to the graded ref `922f9397b`** (Langston's Step-4 F1). The first version of this list described `e684bc61a`, before the switch existed; it said "the signal is REFUSED" with no qualifier, which is false with the switch OFF. Langston graded `922f9397b`: **PROCEED** (Discord `1568806902933229791`, 2026-11-08T01:58Z).

## Dispatch header (workflow-04, three fields)
| # | field | value |
|---|---|---|
| i | **DECLARED CHANGE-CLASS** | `architecture` (the batch's class, unchanged) |
| ii | **DOC SET (architecture)** | SCOPE — present, the `3n` batch scope (row `8c` is an item of it) · PRE_AUDIT — present, `Scope Files/B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` (§1-§13) · COMPLETION_REPORT — absent, written at Step 11 (row `8c` closes with `3n`) · BATCH_CATALOG / PHASE_HISTORY / SYSTEM_MANUAL / SYSTEM_IMPACT_MAP — absent until Step 10, all applicable (the crypto level basis, the cost model's geometry argument, a boot-started writer, a new `module_constants` module and its switch) |
| iii | **STEP-2 REFERENCE** | `B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` — the 09-28 re-ruling (four conditions), §5-§7 ruled 2026-11-06, §9 amendment 4 (ruled 2026-11-07), §11 amendment 5 (ruled 22:24Z), §12 amendment 6 (ruled 22:49Z), §13 the switch (ruled 00:33Z; its Step 4 PROCEED 01:28Z) |

## ⛔ SHIPPED DARK — `level_basis.crypto_birth_sided_enabled`, seeded 0
**At the graded ref 8c is behind a switch that is OFF.** OFF: every crypto signal is stamped `levelGeometry: 'mid'` and every cost site reads `'mid'` (today's arithmetic); there is no birth re-base and no walk record; the §12 floor (keyed on `'sided'`) never runs. **LIVE in both states:** the open refusal of a crypto row with NO birth stamp (`LEVEL_GEOMETRY_ABSENT`) — measured 0 such rows before and after the deploy. The switch is read in ONE place (the birth seam); every later job keys on the row's own stamp. A flip is live within ~60 s (prefetched module, 60 s re-warm), no restart.
**Deployed inert:** `5c3b14496` (carried by OLD Claude's `B-DB-POOL-GUARD` P5, 2026-11-08T01:31:46Z; migration before restart; the four rows live). **The inert period proves the code deploys and boots — nothing observational.** The switch-on, after Kyle's §6(b) report, is the first live exercise of everything in the ON column below.

## Item map (plan → code)
| item | what shipped | where |
|---|---|---|
| P3 + §9 | **The birth re-base, per stamped form (ON).** `baseCryptoLevelsAtBirth` (pure): every price through `priceForLevelRole` — levels at `'stop'`/`'target'` (the bid), entry at `'entry_taker'` (the ask), maker at `'entry_maker_resting'` (the bid); stop/target re-derived by `rebaseLevels` (`fill` = the bid, `entryBasis` = the ask, item 3). Idempotent on the `'sided'` stamp. Stamps `levelGeometry: 'sided'` + `levelBasisAtBirth` (bid, ask, capture instant, plan, rung, producer, age, stop distance, f). | `server/core/trading/crypto-birth-levels.ts` |
| cond. 1 | **With the switch ON, no midpoint fallback:** no accepted rung, an absent/malformed stamp (item 4), a stamp that does not reproduce the plan (`rebaseLevels` would keep that leg on the plan — the mid at birth — so it is refused), or an unreadable knob ⇒ REFUSED, counted pre-SQE as `level_<reason>` (one prefix). Mutation: reverting the stop to the mid fails 4 tests. | same + the seam |
| seam | `buildSizedSignalForStrategy`, crypto only, after the funnel denominator and before the venue grid. OFF ⇒ stamp `'mid'` (a carried stamp is kept). ON ⇒ the walk (own stage `active_level_build`) and the re-base. | `server/services/signal-orchestrator.ts` |
| §13 switch | `level_basis.crypto_birth_sided_enabled` 0/1 (missing or non-0/1 throws; boot fails). | `level-build-config.ts`, migration |
| §5 | **Four** `level_basis` rows (crypto_spot): `level_build_max_age_ms` 60000 · `level_build_max_spread_fraction` 0.50 · `level_build_drift_ref_60s` 0.00429 · `crypto_birth_sided_enabled` 0 — seeded by `2026-11-08-b-price-side-8c-level-build-knobs.sql` (exactly four asserted; + rollback; MANIFEST), prefetched, asserted at boot. **`LEVEL_BASIS_OBSERVATION_*` deleted** with the engine's unused import; the active and VTS shadows read the DB ceilings. | `level-build-config.ts`, `b72-warmup.ts`, `level-basis.ts`, `vts-runner.ts` |
| P4 / §11 | **The spread counted once at S1-S7, each reading the row's stamp through `levelGeometryOf`:** S1 birth maker/taker (`'sided'`: maker entry = the recorded bid) · S2 orchestrator net geometry · S3 HF9 pre-filter · S4 RTB refresh + re-decision · S5 the ranker's net R · S6 the open-gate EV · S7 fill economics. `computeNetGeometry` and `evaluateTradeExpectancy` take a REQUIRED `levelGeometry`. Composers: `2f+2s+spread` mid-to-mid · `2f+2s` sided · `2f+1s+½spread` walked-ask/mid-exit · `2f+1s` walked-ask/sided-exit (and `computeNetGeometry`'s sided arm walks the entry, then `2f+1s`). **Scope, stated (Langston F3): entry, ranking, open and fill — NOT the exit job** (`computeNetBreakeven`, homed below). The mid arm's 3×-slippage / 1.5×-spread overlap is `#1252` (for Kyle), not fixed. | `cost-model.ts`, `expectancy.ts`, `ready_to_buy_service.ts`, `active-execution-engine.ts`, `fill-economics.ts` |
| maker | A sided maker rests at the recorded bid (`makerEntryOf`); at `signal.entryPrice` (the ask) every maker would be marketable at placement. | `active-execution-engine.ts` |
| §12 | **The held floor on the SIDED triple, before the queue write** (crypto, sided only): after `_mtPolicyDecision`, `sidedRewardToRisk` reads the chosen arm's entry from the build basis; `rr < min_rr` ⇒ `level_rr_below_min_sided`; an unresolvable floor ⇒ `level_rr_floor_unresolved`. (The reorg-B2 floor runs after `queueSQESignal` and never refused a paper open — `#373`.) | `crypto-birth-levels.ts`, `signal-orchestrator.ts` |
| hops | The orchestrator's allow-listed RTB metadata carries `levelSpec`/`levelGeometry`/`levelBasisAtBirth` (`pickLevelStamps`); a HYBRID carries its quant source's stamps; RTB keeps metadata whole; the promotion spreads it. | `signal-orchestrator.ts` |
| (iv) | A `crypto_spot` row reaching the open with NO birth stamp is REFUSED before the open-gate EV (`LEVEL_GEOMETRY_ABSENT`); the class resolves stamp-else-symbol. Never reads the switch. | `active-execution-engine.ts`, `rtb-metrics-service.ts` |
| item 4 | `defensive_hedge` stamped (anchor stop `engulfingLow·(1−buf)` `:241`, distance target `:242`). Pattern pool stamped distance/distance at `patternToTradeSignal` and carried by the pattern pass. **Census:** every crypto constructor stamps — 9 in-file detectors (one `signal` literal each), 10 strategy files, the pattern pool; HYBRID carries. | `defensive-hedge.ts`, `pattern-recognizer.ts`, `strategy-engine.ts` |
| P7 | `/var/log/dawntrader/level-basis-funnel.jsonl`, every row each 15 min with the lifetime anchor. First line on staging 2026-11-08T01:46:43Z (build `5c3b14496`, restart 687). | `level-basis-funnel-writer.ts`, `server/index.ts` |
| §10 | The per-form re-score: **18 of 50 (36.0 %)** vs every-leg 19 of 50; (a) PASS on method; (b) not exercised, fenced in code. | §10-RESULT, `scripts/analysis/b_price_side_8c_rescore.*` |
| docs | `ASSET_CLASS_ONBOARDING_WORKFLOW` Step 6.1 / `R-STRATEGY6`: the `levelSpec` stamp is wire-in point 7. | |

## The fences (counts at `922f9397b`)
- `b8c-birth-levels` (**15**): each form, R against the ASK, every refusal arm, idempotence, the f stamp, the arm's R from the build basis, the one reader.
- `b8c-switch-on-wiring` (**22**): seam placement, refusals return, the knobs, the stage, one `level_` prefix, S1-S7 through the one reader, the sided fill friction, the sided net geometry charging each cost once, the maker limit, the stamps through pattern / HYBRID / RTB / jsonb / promotion, the open refusal before the EV gate (stamp-keyed), the floor before the queue, the funnel line.
- `b8c-switch` (**7**): the reader (0/1/throws), boot refuses, ONE switch read in the orchestrator and none in the engine, OFF stamps `'mid'`, the floor and cost sites key on the stamp, the migration seeds 0, `levelGeometryStampOf`.
- `b1250-level-spec-counterfactual` (**95**): `defensive_hedge` and the pattern pool in fence 1; **fence 3** — crypto membership covered (mutation dropping `defensive_hedge` fails it); fence 2 stays at 18.
- Amended visibly: `8a-p1` fence 8h, the prefetch sweep register, the fill-economics / net_expectancy fixtures (`'mid'`), the consumption-freshness engine fixture (sided stamp, bid = its entry).
- CI 4/4 at `922f9397b` (Langston, check-runs); at `5c3b14496` run 42431079807.

## Homed by the review (no new slot)
- **F3 — `computeNetBreakeven` charges the full spread and is outside S1-S7** (`cost-model.ts:363`, used by the break-even stop in `trailing-exit-controller.ts:1118`). On a sided triple it would set the break-even stop about one spread too high. **Cannot fire today:** break-even is OFF for every class (`trailing_exit.break_even_enabled` = false; Kyle KD-36, off until after live). Outcome (2). **HOME: an item of `3n` row `8d` (booking), owner CC-C; binds only if `crypto_birth_sided_enabled` → 1 AND crypto `break_even_enabled` → true.** Recorded in `RUNNING_ISSUES` (`#1253`).
- **8c-OFF-REMOVAL** — an item of row `8c` after the switch-on holds (plan §13 (d)).

## Second reader (one pass, claim-only)
`REVIEWER: claim-only · "every crypto_spot signal reaching the open is sided or refused before an economic gate" · 13 SAFE / 2 GAP + 1 ordering finding · re-derived y` — gap 15 fixed; gap 14 measured 0; the ordering finding became amendment 6 (§12).

## Deviations, stated
1. **`defensive_hedge` stamped anchor stop** (item 4 read it as distance; Langston accepted the correction).
2. **`pattern-recognizer.ts` LOCKED header** — one type import + one metadata key; Langston approved it as the architectural review.
3. **0.50 spread bound** — safe BECAUSE of §12 (the floor now refuses a wide real spread on its sided economics before the queue); it was not safe at the ref where the sentence was first written (Langston).
