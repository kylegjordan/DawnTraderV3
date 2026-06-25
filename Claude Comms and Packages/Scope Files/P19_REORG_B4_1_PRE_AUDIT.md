# P19 reorg-B4.1 — Pre-Audit (Step-2)

**Batch:** reorg-B4.1 — shadow-trading visibility tab + per-cycle pool-membership record
**change-class: architecture** · Owner CC-B · reviewer Langston
Addresses Langston's Step-1 three must-checks + two confirmations.

---

## SIM / System-Manual consult (mandatory)
- The shadow layer is documented in the SIM "reorg-B4 SHADOW-TRADE TELEMETRY LAYER" callout + Liveness Registry **S19** (`openShadowTrades` Map) + System Manual **§19.8**. This batch is ADDITIVE to that family: a new persisted table `rtb_shadow_pool_members` (a second isolated telemetry sink) + a read endpoint + UI tab. **No cross-cutting runtime state changes:** the `openShadowTrades` Map (S19), the allowlist `shadowClose`, the `VTS_OPEN_TRADES_EXCLUDE_SHADOW` shared-table predicate, and the rehydration split are ALL unchanged. The only live-engine behavior change is the `registerOpenShadowTrade` return contract (internal to the shadow family — see must-check 1). The new table is NOT a singleton/shared-state entry (it's a DB sink, like `rtb_shadow_pairings`); it folds into the existing reorg-B4 SIM callout, not a new S-row.

## Must-check 1 — `registerOpenShadowTrade` return-contract change (null → id on dedupe)
**VERIFIED SAFE.** Exhaustive caller enumeration (`grep registerOpenShadowTrade server/`):
- The ONLY live caller is `captureShadowPool` (`ready_to_buy_service.ts:1724`): `await registerOpenShadowTrade({...})` — the return value is **discarded** (not assigned, not branched on). All other hits are the definition, comments, or tests.
- So no caller treats `null` as a control sentinel ("if null, already-registered, skip X"). Changing the dedupe return from `null` → the existing trade id cannot alter any existing control flow.
- **New use:** `captureShadowPool` will now CAPTURE the returned id (existing-or-new) to FK the member row. On a true failure (persist error / cap reject), `registerOpenShadowTrade` still returns `null`; `captureShadowPool` must then SKIP the member-write for that signal (no member row without a valid trade id — see must-check 2). So the contract becomes: **returns the shadow trade id (existing on dedupe, new on open) on success; `null` only on genuine failure (cap-reject / persist-fail).** The cap-reject path still returns null → no member row (correct: a capped signal has no shadow trade to reference).

## Must-check 2 — transactional boundary of the member-write (no orphan / dangling FK)
**Boundary (explicit, per §8 #11):** per pool member, `captureShadowPool` does, in order:
1. `const tradeId = await registerOpenShadowTrade(...)` — resolves the shadow trade FIRST. On a NEW signal this is `insertOpenTrade` + `insertShadowPairing` (the pairing row = the FK target) then returns the id; on dedupe it returns the existing id; on failure/cap it returns `null`.
2. **If `tradeId === null` → SKIP the member-write** (a member row is never written without a valid, already-persisted trade id → a dangling FK is impossible by construction).
3. Else `await insertShadowPoolMember({ ...memberRow, shadowTradeId: tradeId })` — its own try/catch; a failure is LOGGED and TOLERATED (telemetry loss of ONE member row for ONE cycle — no corruption, no dangling FK, the trade + its outcome are intact).

**Why not a single cross-table txn:** the pairing-row insert is idempotent (`ON CONFLICT (id) DO NOTHING`) and the member-write only ever runs AFTER a confirmed-persisted trade id, so the FK is always valid. The cost of a partial failure is a single missing telemetry member row, not an anomaly — matching the existing fire-and-forget shadow philosophy (the whole capture is already `void ... .catch()` off the promotion hot path). The FK column is declared `NOT NULL` (a member row always has a resolved trade). _(If Langston prefers strict atomicity for the NEW-signal case, the trade+member inserts can be wrapped in one txn — flagging the choice rather than leaving it implicit; my recommendation is the resolve-first-then-tolerate contract above, as it's telemetry and simpler.)_

## Must-check 3 — retention/growth → §13 home (NAMED now)
Member rows are written every cycle for every pool member, un-deduped → once paper-active is on (~B9), at the picker cadence × pool size × mode × asset_class this grows fast with no TTL (the reorg-B4 6h TTL is the shadow-EXIT governor — a different thing; it bounds OPEN shadows, not the persisted member-row history). **Home: RUNNING_ISSUES #390 — `rtb_shadow_pool_members` retention sweep, gated to B9 (paper-active turn-on).** A plain-table age-delete pass (mirror the B75 sweep pattern / `data_lifecycle` hot-retention) — NOT built this batch (dormant, zero rows), but named + tracked, not a silent later. Will land in RUNNING_ISSUES §13 at governance.

## Confirmation (a) — `promoted = rank < openSlots` uses the SAME openSlots as the real promotion
**CONFIRMED.** `checkRtbPromotion` computes `openSlots = maxTrades - openPositions.length` ONCE (`paper-execution-engine.ts:1730`), then calls `getRankedSignals(this.mode, openSlots)` (`:1740`). Inside `getRankedSignals`, that same `limit=openSlots` is used for BOTH the real promotion slice (`validSignals.slice(0, limit)`) AND the shadow capture (`captureShadowPool(mode, validSignals, limit, assetClass)` → `promoted = i < limit`). Same value, same call, no re-read → the telemetry `promoted` flag matches the actual promotion decision exactly.

## Confirmation (b) — `cycle_key` unique/stable per cycle
**CONFIRMED.** `nextShadowCycleKey(mode, assetClass) = ${mode}|${assetClass}|${Date.now()}|${_shadowCycleSeq++}` (`vts-runner.ts:719`). The monotonic `_shadowCycleSeq++` guarantees uniqueness even for two cycles within the same millisecond; `captureShadowPool` mints exactly ONE cycleKey per call (one per promotion cycle) and stamps it on every member row of that cycle. **Grouping note:** today `checkRtbPromotion` calls `getRankedSignals(mode, openSlots)` with NO assetClass → one GLOBAL mixed-class pool per cycle, so the cycleKey's `assetClass` segment is `all`; the per-member `asset_class` column is separate. The canonical "pool at cycle N" GROUP BY is therefore **`cycle_key`** (which already uniquely identifies the cycle); `(mode, asset_class)` are filter dimensions. The `(mode, asset_class, cycle_key)` index supports per-class filtered reads; the full-pool view groups by `cycle_key`. (If a future per-class promotion is added, cycleKey becomes per-(cycle×class) — already noted in the reorg-B4 cycleKey-per-class §13 note.)

## Implementation plan (Step-3)
1. **Schema** (`shared/schema.ts`): `rtbShadowPoolMembers` table + types. Migration `*.sql` + rollback (OUT of git) + MANIFEST (`git add -f`).
2. **Capture** (`vts-runner.ts`): `registerOpenShadowTrade` returns the trade id (existing on dedupe / new on open / null on fail-or-cap). NEW `insertShadowPoolMember` in `rtb-shadow-store.ts` (writes ONLY `rtb_shadow_pool_members` — isolation preserved).
3. **Capture hook** (`ready_to_buy_service.ts captureShadowPool`): per member → resolve trade id → if non-null, write the member row (per must-check 2).
4. **Endpoint** (`routes.ts`): `GET /api/shadow-trades/by-cycle` (paper-mode, optional `assetClass`, paginated by cycle) — by-cycle pool (ranked + promoted-marked) JOINed to outcomes + open-shadows-in-flight + selection-quality summary. Read-only.
5. **UI** (`active-trades.tsx` + new `shadow-trades-tab.tsx`): "Shadows" tab after Trade History (grid→6); mirror trade-history-tab patterns; clean empty-state.
6. **Tests:** member-capture per-cycle (rank/promoted per cycle; dedupe still bounds OPEN shadows; member-write touches no learning store) + endpoint-shape; bench.
7. **Staging UI verify** (Claude-in-Chrome): empty-state clean + seed-then-clean populated proof (screenshots).
8. **Governance:** SIM (new table folded into the reorg-B4 callout) + System Manual §19.8 extension + RUNNING_ISSUES #390 + BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN §1/§5 + completion report.

**No code before Langston's Step-2 sign-off.**
