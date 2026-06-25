# P19-B6.6 — price-discovery-liveness fill gate (xStock) — SCOPE

**Batch:** P19-B6.6
**change-class:** architecture
**Owner:** CC-B (Claude New) · **Reviewer:** Langston
**Issue:** RUNNING_ISSUES #236 · **Cross-ref:** #295 (the depth-sufficiency gate, the other half of the fill-time "is the book real" guard)
**Drafted:** 2026-06-26 (Step-1)

---

## 1. Problem (verbatim intent of #236)

xStock active fills are guarded by, in order: a price-FRESHNESS gate (latest `captured_at` recent enough) at **dispatch**, and a book-depth-SUFFICIENCY + warmth gate at the **engine open seam** (B4b.1 / #295). The old clock-based "liquid-fill-window" (RTH 09:30–16:00 ET) gate was RETIRED (#295) because a clock is the wrong proxy in both directions.

**The hole (#236):** on a US-equity **holiday** or **half-day**, the xStock token feed is 24/5 so snapshots keep arriving (`captured_at` stays fresh → freshness gate PASSES) and the top-of-book may still carry market-maker quotes (`bid/ask/qty > 0` → depth gate can PASS) — but the underlying ARCA is closed, so the **traded price (`last`) has not actually moved in hours**. Both existing gates pass and an active fill can land on a closed-book, stale reference price. This is the same "fresh `captured_at` but dead `last`" failure the retired session gate existed to stop, leaking through a different door. No holiday/half-day calendar exists in the code (`market-hours.ts` encodes only the 24/5 weekend boundary), so a clock fix would be brittle.

**Durable fix (Langston lean + CC agree, per #236):** a **price-discovery-LIVENESS gate** — require the symbol's `last` price to have actually MOVED within a recent window before permitting a fill. This directly measures tradeable-ness and is immune to holidays, half-days, AND DST/clock bugs in one stroke, with no calendar to maintain.

**Verified facts (Step-1 investigation, 2026-06-26):**
- `xstock_spot_ticker_snap.last` is **fully populated** — 7,793,286 snapshots in the last 24h, 100% non-null `last`, 476 symbols. The data the gate needs exists.
- The active xStock fill path is **DORMANT** until B7b (`system_context.isEngineActive=false`). Per CLAUDE.md §9.1 this batch is **forward-instrumentation** — the gate is BUILT, wired, tested, and threshold-calibrated from real archived data, but governs no live fill until B7b flips xStock active. **🚨 THIS BATCH DOES NOT TURN xStock ACTIVE TRADING ON.**
- No existing "has the price moved" / liveness notion exists anywhere (crypto or xStock) — this is genuinely new logic (the freshness gate measures recency of the latest tick, not movement).

---

## 2. The KEY DESIGN DECISION — gate PLACEMENT (flagged for Langston Step-1)

The freshness gate lives at **dispatch** (`xstock_spot/active-dispatch.ts`, on the signal entering the pipeline); the depth-sufficiency gate lives at the **engine open seam** (`paper-execution-engine._evaluateOpenDepthGate` → `execution/depth-source.ts`, at the actual fill). #236's text contains an internal tension: it says both "before permitting a **fill**" AND "piggybacks on the same per-symbol **freshness** read" — those point to *different* seams. So placement is a real call, not a given.

**Three options:**
- **A — dispatch, beside the freshness gate** (what "piggyback the freshness read" literally implies). Pro: early reject; xStock-local file. Con: dispatch is upstream of SQE→RTB→TEC, so a pass here does NOT guarantee the book is live at the *actual* fill minutes later; the freshness gate shares this weakness.
- **B — engine open seam, beside the depth gate** (CC RECOMMENDATION). The liveness property ("has `last` moved recently = is this a live tradeable market") is a *fill-time* property and the threat in #236 is literally "a **fill** lands on a dead book." Co-locating it with the depth gate makes the two halves of #295's "is the book real" guard fire together, fail-closed, at the one seam that actually opens the position, surfaced through the same `recordDepthGateBlock` telemetry. The B7b pre-flight gate-#13 ("require BOTH per class") then checks one seam.
- **C — both** (defense-in-depth). Rejected as the primary: two windowed `last`-move queries duplicate logic, against the project's "no redundant/duplicate gates" discipline (CLAUDE.md §5). A cheap dispatch-time early-reject *could* be added later if Langston wants belt-and-suspenders, but the authoritative gate belongs at the fill seam.

**CC recommendation: Option B.** Home the xStock-specific liveness logic (pure function + config resolver) in the `xstock_spot` module, but CALL it from the open-seam depth-gate evaluation so the fill-time "is the book real?" check is single, authoritative, and co-located with depth. The dispatch-time freshness gate stays unchanged as a cheap early reject. **Open for Langston's call at Step-1.**

**Scope note — xStock-only.** The gate is xStock-specific: crypto trades 24/7 globally so `last` always moves and there is no holiday analog (a liveness gate on a quiet altcoin would false-block). It returns a pass/skip for non-`xstock_spot` classes, mirroring how `depth-source` branches by class.

**Config design correction (verify-don't-assume).** A "holiday-exempt" config flag (suggested by an early code-survey) is REJECTED — it would defeat the gate. The whole point is that a flat-`last` holiday book is EXACTLY when we want to BLOCK; blocking on a dead book is the correct behavior, not an exception.

---

## 3. Objectives

| # | Objective | Verification criteria |
|---|---|---|
| **OBJ-1** | **Evidence-based thresholds.** Measure the in-RTH vs off-RTH `last`-move cadence from `xstock_spot_ticker_snap` (off-RTH weekday = the natural holiday-analog: feed ON, underlying closed). Set the window + min-move-count so a normally-quiet-but-OPEN stock passes in-RTH and a flat-`last` (holiday/off-RTH) book blocks. | The Step-2 pre-audit doc records the measured distribution (in-RTH inter-move gap p50/p99, off-RTH flatness) and derives each threshold from it, mirroring the C3 freshness measurement. No guessed numbers. |
| **OBJ-2** | **The liveness gate.** A pure, tested function: over a configurable recent window (N ms / ≥M snapshots), did `last` change by ≥ threshold? Fail-closed on: no/sparse snapshots, no movement. xStock-only. | Unit tests: clear in-window move → pass; flat `last` (holiday) → block; sparse/absent data → block (fail-closed); crypto/other class → skip. |
| **OBJ-3** | **DB-resolved config (fail-closed).** A new `module_constants` config set + resolver following the `xstock_fill_safety` / `fill_depth_gate` pattern (per-asset-class rows, missing/incomplete → `null` → block loudly). Seed migration + MANIFEST. | Resolver returns `null` and blocks when rows absent; seeded rows resolve; 60s cache. Migration applied on staging; rows present. |
| **OBJ-4** | **Wire-in at the chosen seam (Option B unless Langston redirects),** fail-closed + observable (a block is counted/surfaced, never a silent skip), and never throws into the hot path. | Code review + a behavioral test proving a blocked open is counted (depth-gate block counter or sibling) and the open does not proceed. |
| **OBJ-5** | **Isolation / no regression.** The existing freshness gate, depth gate, and silent-stall watchdog are unchanged; the retained `liquid_fill_window_*` keys (used by the watchdog) are untouched. tsc baseline no-regress; full unit suite green; CI 4-green. | Bench + CI evidence; Langston confirms no collateral change to the other gates. |
| **OBJ-6** | **B7b pre-flight gate-#13 formalized.** PHASE_19_PLAN §6 records that B7b requires BOTH the depth-sufficiency gate AND the liveness gate green per class being switched on. | PHASE_19_PLAN §1 board + §5 decision-log + §6 pre-flight updated; #236 resolved. |

---

## 4. Out of scope
- Turning xStock active trading ON (B7b).
- Any holiday/half-day **calendar** (the liveness gate is explicitly the calendar-free alternative; a calendar is the rejected stopgap).
- Crypto liveness (24/7, no holiday — N/A).
- Changing the freshness gate, depth gate, or stall watchdog behavior.

---

## 5. Governance plan (change-class architecture)
**Tier-1 (every batch):** BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5 (+ §6 B7b pre-flight gate-#13), MEMORY_CC_B, this scope, pre-audit, change-list, completion report; RUNNING_ISSUES #236 → RESOLVED.
**Tier-2 (applicable):** SYSTEM_MANUAL (signal-pipeline / xStock fill-safety chapter — a new safety gate is architecture); SYSTEM_IMPACT_MAP (register the new gate + config module in the active-dispatch/fill-safety + open-seam depth area; note dormant-until-B7b). Langston §10.b MEMORY sync.

---

## 6. Workflow
Step-1 scope (this) → Langston review → Step-2 pre-audit (the OBJ-1 measurement + full blast-radius: read SIM + System Manual + the active-trading-path audit for every component touched; place-decision finalized with Langston) → implement → Step-4 diff review (Langston, iterate to consensus) → CI 4-green → deploy (db:migrate) → Step-7 verify (forward-instrument proof: gate wired + unit-tested + config seeded + §9.1 disclaimer; the active path is dormant so there is no live fill to UI-verify) → Step-8 Langston → governance → close (Kyle ack).
