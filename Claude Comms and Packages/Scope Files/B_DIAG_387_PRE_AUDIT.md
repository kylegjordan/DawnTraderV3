# B-DIAG-387 — Pre-Audit (Step 2) (#387)

change-class: non_architecture

**Phase:** 19 · **Owner:** Claude New (CC-B) · **Issue:** RUNNING_ISSUES #387
**Companion:** `B_DIAG_387_SCOPE.md` (Step-1 scope) · **Drafted:** 2026-06-25

> Split out from the combined scope+pre-audit per the governance-checker's non_architecture doc-set (requires a discrete `pre_audit`). Records the SIM-consult + direct-code-read pre-implementation analysis (CLAUDE.md §2 Step-2 / §9).

---

## 1. SIM consult (affected components)

Per `SYSTEM_IMPACT_MAP.md`, the affected surface is the **`/api/xstocks/filter-diagnostics` endpoint** (SIM §"`server/routes.ts` `/api/xstocks/filter-diagnostics` (HEAVY REFACTOR)"), a **HIGH-blast-radius** display surface — the *sole* data source for the xStocks Filter Diagnostics panel. The SIM's "If I Change X" note for "add a new per-lane counter" was the relevant procedure. No engine/strategy/regime/signal-pipeline component is touched — this is observability only. ⇒ SIM-scope (content update), System-Manual N/A (judged explicitly per §9).

## 2. Root-cause trace (direct code read, not memory)

- **The dead read** — `server/routes.ts:7846`: `rejectedReasons: { netEvBelowFloor: byReason['net_ev_below_floor'] || totalRejected }`. `byReason` (:7414) is never populated (its own comment at :7416 calls it "declaration scaffolding for the existing reference shape"); `totalRejected` (:7413) stays `0`. ⇒ the tile is **hard-zero forever** (the #386-misleading bug).
- **The missing write** — `server/asset_classes/xstock_spot/eval-cycle.ts:716`: the net-EV reject (`netEV ≤ VTS_NET_EV_FLOOR`) does `signalsRejectedBySQE++` + archives `reason='net_ev_below_floor'`, but records the reason in **no in-memory counter the endpoint reads** (does NOT touch `nullReasonAggregate` or the per-lane aggregates).
- **Crypto parity (the reference)** — `server/services/vts-runner.ts` increments `vtsEvalCounters.rejectedReasons.netEvBelowFloor` at its reject sites (:3826/:3910); the rolling-24h aggregator sums them (:352). The xStock endpoint already emits the SAME output shape — just from the dead var.
- **The lifetime path works** — `scanner.ts:1033-1035` merges every `nullReasonAggregate` key from the per-cycle counters into `lt.nullReasonAggregate`. ⇒ a new key written at the reject site reaches the endpoint for free (verified).

## 3. Single-reject-site + double-pass check (Langston cond-3)

`netEV <= VTS_NET_EV_FLOOR` appears **once** in `eval-cycle.ts` (:716); the other `netEV` refs are the accepted/trade-opened path (:872/:905/:971). The eval loop is per-`(pair × strategy × lane)` with `continue` on reject ⇒ 1:1 with the archive insert in the same branch, no double-pass. ⇒ the live-vs-archive cross-check is a valid EXACT comparison.

## 4. Secondary gap (no-hidden-gates)

`checkPreOpenGates` (`vts-runner.ts:3000`) can emit `reentry_cooldown` / `duplicate_position` / `price_past_stop` / `price_past_target` / `max_open_trades`. `duplicate_position` + `max_open_trades` already render (panel Section 2); the other three land in `nullReasonAggregate`/`nullReasonDetail` but are rendered by neither the structured `nullReasons` rows nor the panel groupDefs (machine-learning.tsx:2990-2997) ⇒ invisible (hidden gates). xStock pre-open reject site (`eval-cycle.ts:754-778`) writes the combined aggregate only (no per-lane) ⇒ OBJ-2 adds the per-lane write for accurate columns.

## 5. Blast radius

- `eval-cycle.ts` — +counter writes at the net-EV reject site + per-lane at the pre-open reject site. **No control-flow change.**
- `routes.ts` — endpoint surfacing + dead-scaffold removal. **xStock endpoint only** (crypto `vts.ts` untouched).
- `machine-learning.tsx` — 3 additive panel rows + the `signalRejections` type relaxed to optional. **Shared panel; additive, `?? 0`-guarded** ⇒ crypto renders 0 harmlessly.
- **Client consumer grep (blast-radius proof):** ZERO readers of `.signalRejections`/`.byRegime` ⇒ the dead `signalRejections` field is safe to remove. No schema/migration/DB change (counters in-memory; the archive already has the durable data).

## 6. Pre-audit verdict

A clean observability fix sourcing the dashboard tile from the real lifetime accumulator (crypto-path parity), surfacing the hidden pre-open gates, and excising the #386-causing dead scaffolding (§18). No gate/strategy/regime/signal-pipeline/EV-math change. Proceed to Step-3.
