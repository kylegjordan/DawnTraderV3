# P19 reorg-B4 — Shadow-Trade Layer (Step-1 SCOPE, DRAFT for Langston design consensus)

change-class: architecture

**Phase:** 19 · **Owner:** Claude New (CC-B) · **Plan home:** `P19_REORG_BOTH_CLASSES_PLAN_2026-06-19.md` row B4 (pulled forward, 3-way locked) · **Drafted:** 2026-06-25

> **★ STEP-1 CONSENSUS REACHED (CC-B + Langston, 2026-06-25).** §0 = locked goal; §2 = the forks (now settled — see the resolution after each); §3 = FIRMED objectives; §6 = the two hard gates before B4 close. Next: Step-2 pre-audit.
>
> **All 5 forks settled:** A → **separate `openShadowTrades` Map + parameterized resolver** (NOT filter-at-read; verified `resolveOpenVirtualTrades` iterates the in-memory Map at :2288/:2381, so shadow needs its own Map the resolver also drains — the live-counted `openVirtualTrades` stays shadow-free BY CONSTRUCTION). B → `(cycle_id, signal_id)` shadow-namespaced dedupe (exactly one shadow per pool member per cycle). C → C1 JSONB now; C2 (partial expression index on `context->>'shadow'`) decided AT the OBJ-2 pairing-query step (RUNNING_ISSUES-homed with that trigger). D → B4 = data engine; OBJ-2 captures the FULL decision-time scored-pool snapshot. E → defer SQE-rejected, RUNNING_ISSUES-homed with an explicit B5-evaluation trigger.

---

## 0. Goal (locked by the reorg plan, 3-way)

Open a **telemetry-only simulated trade for EVERY signal reaching the ready-to-buy (RTB) pool each promotion cycle** — not just the one signal that gets promoted/opened — so we can measure **selection quality** (did the live picker pick the best-performing signal out of the pool it had?) and get outcome data on the **full RTB population**, not just the 1–4 real opens. Shared (built for crypto + xStock). **HARD guardrail: telemetry-only — shadow sims must NEVER influence live/active trade selection, sizing, caps, or fills.** Runs ON the uncalibrated system *because that's exactly what it measures*. Feeds reorg-B5 (the ranking fix) — B4 produces the data, B5 wires the better ranker.

## 1. Architectural map (Step-1.a — verified by direct read, not memory)

- **Existing VTS sim machinery (REUSABLE):** `vts-runner.ts:registerOpenVtsTrade` (:3120) → persists to `vts_open_trades` (`vts-trade-persistence.ts:104`) + in-memory `openVirtualTrades` Map (:656). Exit/close handled by `resolveOpenVirtualTrades` (:2264) + TEC. Already asset-class-partitioned + carries a `context` JSONB. xStock VTS uses the SAME `registerOpenVtsTrade` (`eval-cycle.ts`).
- **VTS sims open UPSTREAM of RTB** (per-strategy-eval), independent of the promotion decision — they are NOT pool-aware. That's the gap reorg-B4 fills: a POOL-aware sim at the promotion boundary.
- **RTB → promotion boundary (the attachment point):** `ready_to_buy_service.ts:getRankedSignals` (~:1647–1669) — the full queued pool is known + freshly scored here, immediately before sort-and-slice picks the ONE promoted signal. **This is the cleanest hook: the whole pool is in hand, one winner is about to be chosen.**
- **The ONE real open is SEPARATE machinery:** promoted signal → `paper-execution-engine.ts:executePromotedSignal` (:1837) → `paper_sim_trades`. **It does NOT touch `openVirtualTrades`/`vts_open_trades`.** ⇒ **shadow sims (in `vts_open_trades`) cannot starve or block real active opens — the two portfolios are architecturally separate.** (Primary guardrail, verified.)
- **Selection-quality surface today:** `rankingScore` is computed only on the VTS path + is inert on active; ranking sorts on `finalScore` (audit: anti-predictive ~−0.14 crypto). No existing code compares the promoted pick's outcome vs the pool alternatives. ⇒ that correlation is NEW instrumentation.
- **DEAD (audit §14):** `getTopSignal` / `checkForPromotion` (zero callers) — park/decide with reorg-B5, not here.

## 2. Load-bearing design forks (Langston Step-1 consensus needed)

**FORK A — the max-open cap contention (the load-bearing one).** Regular VTS sim opens are gated by `openVirtualTrades.size >= getMaxOpenTrades()` (`vts-runner.ts:1544`, `checkPreOpenGates:3032`). If shadow sims enter the SAME `openVirtualTrades` Map, they (a) consume that cap and could starve the regular VTS learning sims (and vice-versa), and (b) make the cap semantically muddy. **My recommendation:** shadow sims are TELEMETRY and we explicitly WANT the full pool, so they must NOT share the regular VTS open-cap. Two clean options — I lean (A2):
  - (A1) a SEPARATE in-memory set + its own (or no) cap, reusing the exit machinery by tagging;
  - (A2) **keep them in `vts_open_trades` (reuse persistence + exit) but EXCLUDE shadow rows from the `getMaxOpenTrades()` count and from the regular VTS portfolio-realism accounting — i.e. the cap counts only non-shadow.** Cleanest reuse; the cap stays meaningful for the learning portfolio; shadow is uncapped telemetry.
  - REJECT: letting shadow share the cap (corrupts both the learning portfolio and the selection-quality sample).

**FORK B — setup-hash dedupe.** `registerOpenVtsTrade` dedupes by setup-hash (asset-class-namespaced). Opening sims for pool *alternatives* could dedupe against each other or against regular VTS sims — swallowing the very alternatives we're trying to measure. **My recommendation:** shadow opens BYPASS the setup-hash dedupe (or use a shadow-namespaced hash) — selection-quality needs every pool member, even duplicates of an existing VTS setup.

**FORK C — storage tag.** (C1) `context` JSONB flag `{shadow:true, promoted_signal_id, cycle_id}` — zero migration, matches existing pattern; (C2) a typed `source`/`kind` column — indexable for the selection-quality queries. **My recommendation:** start with **C1 (JSONB)** for the open path (no migration, fast), BUT add a typed indexed column ONLY IF the close-time selection-quality query (§ FORK D) needs to scan shadow rows at volume — decide that with the query shape, not preemptively. (Avoids a speculative column; §11 NO-PATCHES = decide on the real access pattern.)

**FORK D — selection-quality measurement (separate sub-objective).** At close time, correlate the promoted signal's outcome vs the pool alternatives' shadow outcomes (did the picker beat the field?). This is NEW instrumentation distinct from the shadow-open itself. **Question for Langston:** in-scope for reorg-B4, or split into B4 (the shadow data engine) + a B4-followup (the selection-quality metric/telemetry surface)? **My lean:** B4 ships the shadow OPENS + the close-time pairing record (promoted_id ↔ pool alternatives + outcomes); the actual selection-quality SCORE/visualization rides reorg-B5/B6 (the ranking + Filter-Diag work it feeds). Keeps B4 a clean data engine.

**FORK E — SQE-rejected inclusion.** The plan says "optionally, SQE-rejected signals, tagged." **My lean:** DEFER — start with the RTB pool (signals that passed SQE + reached RTB). Adding SQE-rejected sims is a bigger population + a separate tag; home it as a B4-followup if the pool data proves insufficient. (Scope discipline.)

## 3. FIRMED objectives (Step-1 consensus)

- **OBJ-1 — shadow-open the full RTB pool, off the hot path, in a separate Map.** At `ready_to_buy_service.getRankedSignals`, **AFTER the winner is sliced** (post-decision, fire-and-forget — a shadow-open failure/slowness must NEVER delay or alter the live promotion), open a shadow sim for every signal in the freshly-scored pool. Reuse `registerOpenVtsTrade`'s persistence (`vts_open_trades`, tagged `context.shadow=true` + `promoted_signal_id` + `cycle_id`) BUT insert into a **separate `openShadowTrades` Map, NOT `openVirtualTrades`** (FORK A — keeps the learning cap + all `openVirtualTrades` readers shadow-free by construction). Dedupe via a shadow-namespaced hash keyed on `(cycle_id, signal_id)` (FORK B — exactly one shadow per pool member per cycle). Crypto + xStock.
- **OBJ-2 — resolve shadows to close + write the FORWARD-COMPLETE pairing record.** Parameterize `resolveOpenVirtualTrades` (:2264) to drain BOTH `openVirtualTrades` and `openShadowTrades` through the one existing close path. On the promotion-cycle boundary, capture a **full decision-time scored-pool snapshot** (FORK D — the load-bearing one): for the promoted pick AND each pool alternative — `signal_id`, `finalScore`, `rankingScore` (+ every ranker input B5 intends to test), plus `cycle_id`, `asset_class`, `regime-at-decision`; on close, attach the realized outcome (R / PnL, exit reason, holding time). **Snapshot at decision time, NOT recomputed at close** (scores drift). C1 JSONB for the open path; the C1→C2 decision (a partial expression index on `context->>'shadow'`, or a typed column) is made HERE when the pairing-query shape is known — RUNNING_ISSUES-homed with that trigger (FORK C).
- **OBJ-3 — the guardrail, as TWO separate invariant tests.** (a) **Active path byte-identical** shadow-on vs shadow-off: a shadow signal can NEVER reach `executePromotedSignal` / the real fill / `paper_sim_trades` (fail-loud assert). (b) **VTS learning portfolio byte-identical** shadow-on vs shadow-off: the non-shadow `openVirtualTrades` count + `getMaxOpenTrades()` cap behavior + all count/accounting readers are unchanged (the FORK-A contamination surface; proven by the separate-Map design + the §6 reader enumeration).
- **OBJ-4 — minimal telemetry.** Per-class shadow open/close counts surfaced for sanity; the rich selection-quality view rides reorg-B6, the score rides reorg-B5.

## 4. Verification criteria
- Staging: shadow sims open for the full RTB pool (count > the 1 promoted), tagged, in `vts_open_trades` (separate Map in memory); the real-open count + the regular VTS-learning-sim count + cap are provably unchanged vs baseline (OBJ-3 a+b). Pairing records written with the full decision-time scored-pool snapshot. Claude-in-Chrome UI/telemetry confirm (§9.3). Bench tsc baseline + vitest (incl. the two OBJ-3 tests); CI 4-green; no migration unless C2 lands (then `git add -f` + MANIFEST + rollback).

## 5. SIM / System Manual applicability
- **SIM:** YES — new pool-aware sim path + a new cross-cutting interaction at the RTB promotion boundary + the separate `openShadowTrades` Map (a new runtime singleton → §17 Cross-Cutting Liveness Registry) + a new writer to `vts_open_trades`.
- **System Manual:** YES — the shadow-trade telemetry layer + the decision-time selection-quality capture, in the signal-pipeline chapter.

## 6. Hard gates before B4 close (Langston Step-1)
1. **Shadow excluded from EVERY cap/accounting reader** — the separate-Map design makes this true by construction; the Step-2 pre-audit enumerates every `openVirtualTrades` reader (cap gates :1544/:3032/:3455; dup/lane guards :1489/:1503/:3017/:3715; getStats :2961/:2981; cycle logs :2907/:2909; rehydrate :687; ranking-weights :4503/:4536) as the explicit proof. **CHANGES-NEEDED gate at Step-4 if any reader could see a shadow row.**
2. **Pairing record forward-complete vs B5/B6 inputs** — before B4 ships, a forward field-check against the ranker inputs B5 will test + B6's Filter-Diag selection-quality view, so B4's schema never needs re-opening (§8#11 NO-PATCHES). **Langston's hard Step-2 check.**

## 7. §13 named homes to land at Step-2 (RUNNING_ISSUES)
- **C2-trigger:** "shadow `vts_open_trades` index — decide a partial expression index on `context->>'shadow'` (or typed column) when the OBJ-2 pairing-query shape is known; trigger = the close-time query scans shadow at pool volume."
- **E-trigger:** "shadow SQE-rejected population study — revisit after B5 consumes B4's selection-quality data; if RTB-pool-only proves insufficient for B5's ranker, SQE-rejected shadow inclusion becomes a named B4-followup at that point."

## 4. Verification criteria
- Staging: shadow sims open for the full RTB pool (count > the 1 promoted), tagged, in `vts_open_trades`; the regular VTS cap + the active opens are provably unaffected (real-open count + VTS-learning-sim count unchanged vs baseline). Selection-quality pairing records written at close. UI/telemetry confirms via Claude-in-Chrome (§9.3). Bench tsc baseline + vitest; CI 4-green; no live behavior change (OBJ-3 test).

## 5. SIM / System Manual applicability
- **SIM:** YES — a new pool-aware sim path + a new cross-cutting interaction with the RTB promotion boundary + the VTS cap accounting.
- **System Manual:** YES — new architecture (the shadow-trade telemetry layer + selection-quality measurement) in the signal-pipeline chapter.
