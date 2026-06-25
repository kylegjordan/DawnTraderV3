# P19 reorg-B4 — Change List (Step-4 diff review)

**Batch:** P19 reorg-B4 — shadow-trade telemetry layer (selection-quality data engine)
**change-class:** architecture
**Author:** NEW Claude (CC-B) · 2026-06-25
**State:** built + bench-green, **UNCOMMITTED** (Langston Step-4 diff review BEFORE push)

> INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run `git status`/`git log` on the gdrive-mounted repo (it hangs the FUSE mount). The files are readable directly on your mount at the paths below; the load-bearing snippets are embedded here so you don't have to navigate.

---

## What this batch does

For EVERY member of the RTB ranked pool at each promotion cycle (the promoted picks AND the non-promoted alternatives), open a telemetry-only counterfactual "shadow" trade, price it through the SAME exit engine the real trades use, and record decision-time ranking inputs + realized outcome into a NEW isolated sink `rtb_shadow_pairings`. This is the selection-quality data engine that feeds reorg-B5 (the ranking fix). It must never perturb the live trading path or the VTS learning path.

**Dormancy (§9.1 forward-instrumentation disclaimer):** `rtb_total = 0` right now — the RTB pool is empty because paper-mode active trading is OFF, so the promotion boundary that opens shadows is DORMANT. No live shadow rows are produced until paper-active turn-on (~B9). Step-7 proof = wired + unit-tested, not live rows.

---

## The 3 design decisions I want your eyes on (these emerged during the code-read; within the approved envelope but worth confirming)

**(a) Hook site = `getRankedSignals`, capturing the full `validSignals` pool pre-slice.**
`checkRtbPromotion` only receives the top-`openSlots` (post-slice), so it cannot see the full pool. The full pool with ranks exists only inside `getRankedSignals` (after the finalScore sort, before `.slice(0, limit)`). I grep-confirmed `getRankedSignals` has exactly ONE live caller — `checkRtbPromotion` — so a capture there is unambiguously one-per-promotion-cycle (no diagnostics/UI caller to cause spurious opens). The capture is fire-and-forget; the return value is unchanged.

**(b) Dedupe by `(mode, signalId)` — one live shadow per pool member.**
A queued signal can sit in the pool across many cycles until promoted/expired. Without dedupe, the same signal opens a fresh shadow EVERY cycle → uncontrolled creep (this was the unbounded-creep you flagged at Step-2). With `shadowOpenBySignal`, the open-shadow population is bounded at ~pool-size; the 6h TTL and SHADOW_CAP=10k are then TRUE backstops, not the primary bound. The dedupe map is re-seeded on rehydration so a post-restart cycle doesn't re-open a live shadow.

**(c) `promoted = (rank < limit)` = "ranker-selected"; `promotedTradeId` left null.**
At the capture site I know the ranker's choice (top-`limit` by finalScore) but not the downstream execution result (some top-`limit` DEFER on AMR gate or fail execution). For B5's ranking-evaluation question ("did the ranker's top-N outperform the alternatives?"), "ranker-selected" is the correct semantic — it's the ranker's decision, independent of execution friction. `promotedTradeId` (the real-trade FK) is left null; B5 needs pool + ranks + outcomes, not the real-trade linkage.

---

## Isolation proof (the by-construction segregation you required at Step-2)

**Open side:** shadows land in a SEPARATE `openShadowTrades` Map, never `openVirtualTrades`. Every live-Map reader (cap gates, dup/lane guards, getStats, ranking) is shadow-free with no predicate to forget.

**Closed side:** `shadowClose` is an ALLOWLIST — it calls ONLY:
- `updateShadowPairingOutcome` (the isolated `rtb_shadow_pairings` sink),
- `markOpenTradeClosed` (the shadow's OWN `vts_open_trades` backing row),
- `clearTrailingState` (exit-mechanics cleanup, not a learning sink).

It NEVER touches `outcomeFeedbackStore.updateEma`, `telemetry.recordPairTelemetry`, `updateRollingAverages`, `persistRealPriceTrade`, `archiveExitDecision`, `paper_sim_trades`, or `phase10SessionTrades`. A unit test asserts this textually (comment-stripped) so a future edit can't silently break it.

**Restart:** persisted shadow rows carry `shadow:true` in their `vts_open_trades.context` jsonb; the boot rehydration routes `.shadow === true` rows into `openShadowTrades` (strict `=== true` → missing/NULL fails SAFE to the live pool).

---

## Exit-math reuse (Kyle's drift question + the drift-guard test)

The shadow resolver `resolveOpenShadowTrades` CALLS the SAME exit-math service `evaluateTECExit` the real resolver uses — not a copy. Zero drift: a change to the exit math is auto-applied to shadows. The ONLY shadow-specific differences are PARAMETERS/ACTIONS:
- `maxHoldMs = SHADOW_MAX_HOLD_MS` (6h) vs the real `MAX_HOLD_MS` (7d);
- close ACTION = `shadowClose` (isolated sink) vs the real `persistRealPriceTrade` cascade;
- TEC cleanup = the SAME `clearTrailingState(id)` the real close calls.

A unit test pins that the shadow resolver calls `evaluateTECExit({` with `maxHoldMs: SHADOW_MAX_HOLD_MS` and does NOT re-implement stop/target comparison locally — it fails if anyone forks the math.

---

## File-by-file

### NEW `server/services/rtb-shadow-store.ts` — the sink writer (writes ONLY `rtb_shadow_pairings`)
`insertShadowPairing(row)` (decision-time row, ON CONFLICT DO NOTHING) + `updateShadowPairingOutcome(id, outcome)` (realized outcome, idempotent via `WHERE closed=false`). No learning-sink references in code.

### `shared/schema.ts` (+61) — `rtbShadowPairings` table + types
One row per pool-member×cycle. Decision-time columns (finalScore + components, rankingScore, sourcePool, di/dbs at queue, sqe verdict/reason, regime, promotionRank, promoted, cycleKey) + outcome columns (gross/net pnl, rMultiple, closeReason, exitPrice, holdingMs) + 3 indexes. ISOLATION-INVARIANT comment block. Migration `drizzle/migrations/2026-06-25-p19-reorg-b4-shadow-pairings.sql` (idempotent CREATE TABLE IF NOT EXISTS + 3 indexes + DO-block verify) + `-rollback.sql` (kept OUT of git) + registered in MANIFEST.txt (`git add -f` the .sql at commit).

### `server/services/vts-runner.ts` (+458) — the shadow lifecycle
- `openShadowTrades` Map + `SHADOW_CAP=10000` + `SHADOW_MAX_HOLD_MS=6h` + `shadowDropCount` + `shadowOpenBySignal` dedupe + `_shadowCycleSeq` / `nextShadowCycleKey`.
- `registerOpenShadowTrade(input)` — dedupe → cap-check (reject-NEW + drop-counter + warn) → build minimal exit-eval shell with `shadow:true`/`mode`/`signalId` → persist (`insertOpenTrade`) → `insertShadowPairing` → Map.set. Persist-before-Map ordering (no orphan).
- `computeShadowOutcomeMath(...)` — exported PURE; `grossPnl=(exit-entry)/entry`, `netPnl=gross-friction`, `rMultiple=(exit-entry)/|entry-stop|` — identical to the real cascade. Unit-tested.
- `shadowClose(...)` — the ALLOWLIST close (see Isolation proof).
- `resolveOpenShadowTrades()` — sibling resolver, OWN price fetch (mirrors the real dispatch; duplicated on purpose so the live resolver is byte-identical), calls the SAME `evaluateTECExit` with `maxHoldMs=SHADOW_MAX_HOLD_MS`.
- Cycle wire: `await resolveOpenShadowTrades()` right after `await resolveOpenVirtualTrades()`, own try/catch (a shadow fault never perturbs the live cycle).
- Rehydration split at the boot set-loop: `.shadow === true` → `openShadowTrades` (+ dedupe re-seed); else → `openVirtualTrades`.

```ts
// the rehydration split (boot):
for (const r of rows) {
  if ((r as { shadow?: unknown }).shadow === true) {
    openShadowTrades.set(r.id, r as unknown as OpenVirtualTrade);
    const sigKey = `${(r as any).mode ?? 'paper'}:${(r as any).signalId ?? `${r.symbol}:${r.strategy}`}`;
    shadowOpenBySignal.set(sigKey, r.id); shadowCount++;
  } else { openVirtualTrades.set(r.id, r as unknown as OpenVirtualTrade); liveCount++; }
}
```

```ts
// shadowClose — the allowlist (only 3 effects):
await updateShadowPairingOutcome(id, { grossPnl, netPnl, rMultiple, closeReason: exitReason, exitPrice, holdingMs });
openShadowTrades.delete(id); /* + dedupe delete */
await markOpenTradeClosed(id);
clearTrailingState(id);
```

### `server/core/rtb/ready_to_buy_service.ts` (+75) — the capture hook
```ts
// getRankedSignals, right after the finalScore sort, before the slice:
void this.captureShadowPool(mode, validSignals, limit, assetClass).catch(...);
return validSignals.slice(0, limit);   // unchanged
```
`captureShadowPool` mints one `cycleKey` per cycle, then for each pool member opens a shadow with `promotionRank=i`, `promoted=(i<limit)`, decision-time ranking inputs mapped from the RtbSignal typed columns + metadata. Dynamic import avoids an rtb↔vts-runner cycle.

### NEW `server/tests/unit/reorg-b4-shadow-isolation.test.ts` — 13 tests, all green
allowlist (no learning sinks in shadowClose) · store sink-purity · open-side separation · OBJ-3a (never reaches executePromotedSignal/paper_sim_trades) · drift-guard (same evaluateTECExit + maxHoldMs param) · capture-hook full-pool/promoted-flag · math-parity behavioral.

---

## Bench (C:\dev)
- `node scripts/check-tsc-baseline.mjs` → **OK, no regressions above baseline** (fixed one introduced TS2352 by casting `as unknown as OpenVirtualTrade`).
- `vitest` new file → **13/13 green**.
- full `server/tests/unit` → **1856 pass**, 3 files fail = `ECONNREFUSED 127.0.0.1:5432` (no local Postgres: geometry-override / dbs-store / strategy-modes) — environmental, unrelated to this batch (CI has Postgres).

## Ask
Review the diff + the 3 decisions above. On consensus I push (`git add -f` the migration .sql), confirm CI 4-green, deploy with `db:migrate`, run Step-7 (forward-instrument proof), then governance (SIM §17 Liveness Registry for `openShadowTrades` + `rtb_shadow_pairings`, System Manual signal-pipeline, RUNNING_ISSUES §13 C2/E homes, BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, completion report).

---

## Step-4 review delta (Langston findings closed before push)

**Verdict received: APPROVE for push, with one load-bearing CHANGES-NEEDED finding now closed + 2 cheap items landed + 2 scheduled to B9.**

**★ LOAD-BEARING (closed this batch) — persisted-table reader contamination.** The original isolation proof covered in-memory Map readers + the close cascade, but NOT table-scan readers of the SHARED `vts_open_trades` table (shadow rows persist there, tagged `context.shadow`, closed=true after `markOpenTradeClosed`). Fix: a single shared SQL fragment `VTS_OPEN_TRADES_EXCLUDE_SHADOW = sql\`(context->>'shadow') IS DISTINCT FROM 'true'\`` (in vts-trade-persistence.ts), composed into every non-shadow read:
1. `factor-replay-core.ts:loadClosedVtsTradesFromDb` (HIGH — the factor-replay/ablation learning feed) — excluded.
2. `routes.ts:7732` xStock 24h telemetry count (MEDIUM) — excluded.
3. `vts-trade-persistence.ts:bootstrapOpenTradesFromMemory` boot-gate COUNT (LOW) — excluded.
Full sweep of every `FROM/UPDATE/DELETE vts_open_trades`: `rehydrateOpenTrades` MUST include shadows (it routes them to `openShadowTrades` — that IS the split); `exit-strategy-replay-service:256` is id-scoped + shadows never enter its feed; `asset-name-resolver:319` is `DISTINCT symbol` (shadow symbols are real symbols, no contamination) — both intentionally unfiltered. The weekend bulk-suspend UPDATE touching shadow xstock rows is a write-path lifecycle nicety (not learning-contamination) → folded into the B9 §13 hardening item. OBJ-3b test extended: 4 new assertions (shared fragment exists + all 3 loaders carry it).

**(b) key-derivation parity (this batch):** extracted `shadowDedupeKey(mode,signalId,symbol,strategy)`, called at all 3 sites (open / rehydration re-seed / close delete) → byte-identical by construction; 3 unit tests pin it. `mode`+`signalId` round-trip through `vts_open_trades.context` jsonb.

**(c) `promoted` column comment (this batch):** added the "ranker top-N choice, NOT execution-confirmed; promotedTradeId NULL in B4" semantic to the schema column.

**Confirmed:** TTL/shadow_max_hold closes route through `shadowClose` (same `toClose` path as stop/target) → the dedupe entry clears → an expired signal can re-open. cycleKey is one-per-promotion-cycle today (checkRtbPromotion calls getRankedSignals with no assetClass); a future per-class promotion would make it per-(cycle×class) — to be noted in the SIM.

**Scheduled to B9 (paper-active turn-on) — RUNNING_ISSUES §13 homes before close:**
1. Rehydration fail-direction robustness — make `rtb_shadow_pairings` authoritative on rehydration (any id present in open shadow pairings is a shadow regardless of the jsonb flag); ambiguous rows quarantine, never default-into-live. (Carries the weekend-lifecycle nicety.)
2. The (a) capture-path guard — gate `captureShadowPool` behind an explicit `captureShadows:true` arg from `checkRtbPromotion` instead of relying on sole-caller.

**Backlog (non-blocking, noted):** shared price-fetch helper (or SIM lockstep note) for `resolveOpenShadowTrades`'s duplicated fetch; a dedicated `ShadowTrade` type instead of the `as unknown as` shell cast.

**Bench after delta:** tsc baseline OK no-regressions; reorg-b4 suite 20/20; persistence 12/12 + factor-replay/exit-replay 35/35 unaffected.
