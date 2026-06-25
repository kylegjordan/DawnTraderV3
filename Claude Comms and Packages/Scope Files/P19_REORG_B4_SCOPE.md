# P19 reorg-B4 — Shadow-Trade Layer (Step-1 SCOPE, DRAFT for Langston design consensus)

change-class: architecture

**Phase:** 19 · **Owner:** Claude New (CC-B) · **Plan home:** `P19_REORG_BOTH_CLASSES_PLAN_2026-06-19.md` row B4 (pulled forward, 3-way locked) · **Drafted:** 2026-06-25

> **★ This is a DESIGN-CONSENSUS draft, not a final scope.** §0 states the locked goal; §2 surfaces the load-bearing design forks with my recommendation each, for Langston's Step-1 review. The objectives (§3) firm up once the forks are settled.

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

## 3. Provisional objectives (firm up post-consensus)
- **OBJ-1:** At `getRankedSignals`, for every signal in the freshly-scored pool, open a shadow sim (reusing `registerOpenVtsTrade` + a shadow tag), EXCLUDED from the VTS open-cap + dedupe (per FORK A/B). Crypto + xStock.
- **OBJ-2:** Shadow sims resolve to close via the existing exit machinery; on close, write a pool-pairing record (promoted_id ↔ alternatives + outcomes) for selection-quality (per FORK D).
- **OBJ-3 (guardrail):** Fail-loud assertions that a shadow signal can NEVER reach `executePromotedSignal`/the real fill/`paper_sim_trades`; shadow never affects active caps/sizing/selection. A test proving the active path is byte-identical with the shadow layer on vs off.
- **OBJ-4:** Telemetry/visibility (counts of shadow opens/closes per class) — minimal; the rich selection-quality view is reorg-B6.

## 4. Verification criteria
- Staging: shadow sims open for the full RTB pool (count > the 1 promoted), tagged, in `vts_open_trades`; the regular VTS cap + the active opens are provably unaffected (real-open count + VTS-learning-sim count unchanged vs baseline). Selection-quality pairing records written at close. UI/telemetry confirms via Claude-in-Chrome (§9.3). Bench tsc baseline + vitest; CI 4-green; no live behavior change (OBJ-3 test).

## 5. SIM / System Manual applicability
- **SIM:** YES — a new pool-aware sim path + a new cross-cutting interaction with the RTB promotion boundary + the VTS cap accounting.
- **System Manual:** YES — new architecture (the shadow-trade telemetry layer + selection-quality measurement) in the signal-pipeline chapter.
