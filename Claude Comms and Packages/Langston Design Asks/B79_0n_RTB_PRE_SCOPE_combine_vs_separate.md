# B79.0n.RTB — Pre-scope architectural review: combine #11 + #12 or keep separate?

**Author:** CC (Claude Code)
**Date:** 2026-05-27
**For:** Langston architectural call
**Triggered by:** Kyle's question post-TELEMETRY close — "is the RTB refresh service a part of this RTB audit? If not, is the RTB refresh service a part of the umbrella anywhere? And if not, we need to slot it in somewhere, either as its own sub-batch or as a part of this RTB batch."

Kyle directive: do the pre-scope review, decide, run by Langston, then proceed. Standard §6.7 iterate-to-consensus.

---

## §1. What I found in the code

`server/core/rtb/ready_to_buy_service.ts` is **1809 lines**. The file header lists 11 features (lines 11-23), and they intermix queue concerns with refresh concerns:

- (1-3) Unified pool admission, FinalScore ranking, symbol+strategy uniqueness → **queue concerns**
- (4) "Removes stale/expired signals (TTL: 30s per-signal rolling)" → **refresh concern**
- (5) "Promotes highest-FinalScore signals when TCL is active and capacity available" → **queue concern with refresh trigger**
- (6) "FinalScore Decay: fresher signals prioritized via decayPenalty" → **shared (both compute time + select time)**
- (7) "Per-signal rolling TTL with staggered refresh" → **refresh concern**
- (8) "Explicit state transitions: active → reconfirmed → promoted → expired" → **shared (refresh advances state; queue stores state)**
- (9) "TCL synchronization barrier for atomic operations" → **shared (refresh holds lock; queue serves under lock)**
- (10) "Enhanced deduplication via (symbol, strategy, createdAt)" → **queue concern**
- (11) "Central Clock synchronized refresh (every 30 ticks)" → **refresh concern**

The state-machine surface (active → reconfirmed → promoted → expired) is fundamentally shared: the refresh loop is what ADVANCES the state, and the queue is what STORES the state. They're two aspects of the same finite-state-machine, not two separable concerns.

**Live cadence (per SIM §4.3):** RTB Service runs on a "1-second interval via Central Clock". Per-signal stagger over a 30-second window. Refresh examines each signal's `nextRefreshAt` timer, re-fetches metrics, and decides reconfirm vs promote vs expire.

**Concrete data shapes already in the file:**
- `Map<TradingMode, NodeJS.Timeout>` per-mode refresh intervals (line 344)
- Per-signal `nextRefreshAt: number` + `isRefreshing: boolean` flags (lines 338-339)
- `refreshIntervals: Map<TradingMode, NodeJS.Timeout>` private field on the service class

**Already-imported AssetClass plumbing:** `import { resolveAssetClass, type AssetClass } from '../../../shared/asset-classes';` at line 35 — but it's used in B79.0n.STORAGE for SQEInput field population, not for queue partitioning.

**ARM dependency:** Adaptive Ratio Manager is already factory-resolved per asset class via the B79.0a constructor injection (Langston's "bulletproof > elegant" pattern). The RTB → ARM seam needs no new per-class work in this batch.

---

## §2. The umbrella v4 row #11 / #12 split

MEMORY's table has:
- #11 RTB
- #12 RTB-REFRESH

Both spec'd in one-word names. **No detailed inline content boundary** ever recorded in MULTI_ASSET_VTS_EXPANSION_PLAN.md, MEMORY, or the prior batch completion reports. The split was Kyle's conceptual sketch when the umbrella was first laid out, not a hard architectural lock.

CC's read of the original intent (best guess): #11 = queue + ranking math; #12 = refresh cadence + reconfirm/expire loop. But the code structure makes that split artificial.

---

## §3. Two options + recommendation

### Option A — Combine into single B79.0n.RTB (#11). Reclaim #12.

**Scope of combined #11:**
- Per-class buckets in the RTB queue (either nested `Map<TradingMode, Map<AssetClass, RtbSignal[]>>` OR add `assetClass` field to `RtbSignal` and filter inline — TBD in scope draft)
- Per-class refresh cadence (config-driven via `module_constants` row, e.g. `rtb.refresh_interval_ms` per class — crypto 30s, xstock TBD)
- Per-class staggered window (`nextRefreshAt` stagger hash per class)
- Per-class reconfirm/promote/expire state-machine transitions (the refresh loop advances per-class)
- ARM consumption stays as-is (factory-resolved via B79.0a)
- Capacity guards stay class-blind unless Langston flags otherwise

**Reclaim slot #12** for one of:
- (a) Capacity-guard per-class (`isCapacityBlock` per class)
- (b) SCORING.b absorption (Kyle flagged for re-scoping into sub-batch 18 due to weak VTS-shadow observability)
- (c) Leave open — assign later when a concrete need surfaces

### Option B — Keep separate #11 + #12.

**Scope of #11 (queue):** queue partitioning, ranking math, dedup, TCL barrier, capacity guards
**Scope of #12 (refresh):** per-class refresh cadence, stagger window, state-machine transitions, TTL handling

**Internal-consistency risk:** between #11 ship and #12 ship, the queue is class-aware but the refresh loop is class-blind. The refresh loop MUTATES queue entries via state transitions — so a class-blind refresh against a class-aware queue could mis-route state advances across classes. Mitigations are possible (gate-flag the per-class queue behavior until #12 lands) but they add complexity.

**Review-load benefit:** smaller diffs per batch. Langston re-validates a smaller surface twice.

---

## §4. CC's recommendation: Option A (COMBINE)

**Rationale:**
1. **Same file, deep coupling.** The 1809-line file intermixes queue and refresh logic. Splitting creates artificial chunk boundaries that don't match the code structure.
2. **Same state machine.** Refresh ADVANCES state; queue STORES state. They're not separable concerns.
3. **Internal-consistency risk of separation.** A class-aware queue + class-blind refresh has a mis-routing failure mode that doesn't exist when both ship together.
4. **B79.0n.TELEMETRY precedent.** Telemetry-aggregator was extended in ONE batch (TELEMETRY) that touched both the per-instance data structures AND the disk-persist machinery. Same shape applies here.
5. **Concrete scope check.** I can't articulate a behavioral difference between #11 and #12 that justifies the split. Without a concrete reason to separate, defer to the simpler structure.

**Risk if I'm wrong:** the combined batch ends up larger than a typical sub-batch (TELEMETRY was ~980 LOC). RTB combined might be ~1500-2000 LOC if heavy. Langston code review takes longer. But it's a one-shot review with consistent context, vs a fragmented two-step review with the state-machine straddling the boundary.

**RTB.b fallback:** if the combined batch surfaces issues during review, we can carve a follow-up B79.0n.RTB.b — but that's reactive, not pre-planned.

---

## §5. Asks for Langston

**Q1 — combine vs separate.** Do you agree with Option A (combine into single #11, reclaim #12)? Or do you see structural reason to keep separate?

**Q2 — if combine, what should slot #12 reclaim?** My lean: leave #12 open. Kyle's "SCORING.b re-scope into sub-batch 18" comment doesn't need a slot reservation — it folds into #18 directly. Capacity-guard per-class could land in #11 or its own slot.

**Q3 — anything else.** What architectural concern about RTB are you tracking that I should know before drafting the scope? Specifically: is there a known per-class behavioral difference (cadence, TTL, capacity, state-transition timing) that the umbrella v4 split was meant to capture?

---

## §6. Next step pending your call

If you AGREE combine: I draft `B79_0n_RTB_SCOPE.md` covering the combined surface, file-first to your inbox, and we run the standard 11-step workflow from Step 1 ACK forward.

If you AGREE keep separate: I draft `B79_0n_RTB_SCOPE.md` for the queue-only surface, with explicit gate-flag for the per-class queue behavior until RTB-REFRESH (#12) ships. RTB-REFRESH scope drafts after RTB ships and we have empirical evidence the gate-flag isolated cleanly.

If you push back with a different structure: we iterate per §6.7.

Kyle is fine either way — his words: "I'm fine either way. I just want it done correctly and accurately so that it works the way that it's intended."
