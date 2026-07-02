# P19-B7.2d Step-4 Change List — xStock VTS lane maker/taker wiring (#434)

**Commit (local, NOT pushed — Step-4 gates the push):** `127c6d845` on `migration/aws-supabase`, 5 files, +516/−47.
**Bench:** tsc-baseline OK (no regressions above baseline); vitest full run **2147 passed / 0 failed tests** (9 failed FILES = the known no-DB pg-pool collection errors); the 3 B7.2-arc test files 33/33.
**Full diff staged alongside this file:** `P19_B7_2d_STEP4.diff` (738 lines).

---

## Your Step-2 conditions — dispositions

### 1. Lock-lift honored exactly as bounded
`maybeOpenTwin` extracts ONLY the twin sub-block (was vts-runner :2099-2136). Crypto's PRIMARY open stays inline — the diff's only touch to `generatePhase10Signal` is replacing the inline twin block with the `maybeOpenTwin(...)` call (+ the lock-lift comment). The `registerOpenVtsTrade` header's B79.0m.b lock text is untouched (the general retrofit stays B79.0n+).

### 2. Crypto twin regression — BOTH branches asserted
The decision half is the pure `planTwin` (pending-maker-logic.ts) with the inline block's semantics transcribed in its test header. Tests pin:
- **OPEN branches:** pending-maker chosen → taker twin born `state='open'`, taker fee, no limit/deadline; taker-by-decision chosen (non-marketable) → maker twin `state='pending'` at the limit + `now + maxPendingMs`, maker fee.
- **SKIP branches (your reinforcement):** kill-knob off → silent skip; marketable maker twin (market AT the limit and BELOW it — the `<=` comparator) → skip; marketable-fallback chosen leg → degenerate skip; precedence (disabled beats marketable; a taker twin is never marketability-blocked).
- One deliberate non-verbatim mechanic, flagged for you: `maker_max_pending_ms` is resolved via a LAZY thunk invoked only in the maker-twin open branch — the inline block called the fail-hard resolver exactly there; an eager resolve would have moved the throw point for a missing knob to every twin evaluation.

### 3. `maybeOpenTwin` parameter contract — the line-by-line map you asked to diff

| Inline closure read (pre-B7.2d) | In the helper |
|---|---|
| `_vtsPendingMaker` | param `pendingMaker` |
| `_vtsMtDecision.chosenMode` | param `decisionChosenMode` |
| `_vtsFriction.feeRateMaker` | param `feeRateMaker` |
| `_vtsFriction.feeRateTaker` | param `feeRateTaker` |
| `_vtsEffectiveMode` (log only) | param `effectiveMode` |
| `currentMarketPrice` | param `currentMarketPrice` |
| `entryPrice` (the limit) | `chosenTrade.entryPrice` — read off the passed-in chosen leg's record; identical by construction (the record was built from the same local) |
| `symbol` / `strategy` (logs) | `chosenTrade.symbol` / `.strategy` — same by-construction identity |
| `tradeAssetClass` | `chosenTrade.assetClass` |
| `openTrade` (twin spread base) | `openVirtualTrades.get(chosenTradeId)` — the SAME object reference the inline block spread (Map.set happened in the register step) |
| `tradeId` (twin id derivation) | param `chosenTradeId` → `${chosenTradeId}_twin` |
| `resolveTwinEnabled(class)` / `resolveMakerMaxPendingMs(class)` / `isMarketableAtPlacement` / `Date.now()` / `insertOpenTrade` / `openVirtualTrades` | resolved inside the helper (module scope, same call points; maxPendingMs lazy per #2) |

So the 8th-read check: the closure set beyond my 7-param list is exactly the chosen-leg record fields + module-scope resolvers, all carried via `chosenTradeId` → Map lookup. Twins do NOT route through `registerOpenVtsTrade` (derived id + direct `insertOpenTrade` + `Map.set`, verbatim).

### 4. Weekend-suspend pending hazard — verified NON-EXISTENT, guard-commented
`markAllXstockWeekendSuspended` already predicates `AND state = 'open'` (SQL) + `trade.state === 'open'` (in-memory mirror); `unmarkAllXstockWeekendSuspended` flips ONLY `state = 'weekend_suspended'` rows both legs. A pending row can neither be suspended nor restored-to-open — it passes the boundary untouched and resolves honestly (fill or deadline drop). No code change needed; both functions now carry a ⚠️ LOAD-BEARING PREDICATE comment so a future widening of either predicate is a flagged act. (A pending whose 1h deadline lapses inside the closed window hard-drops on the next resolve pass — consistent with the B7.2c no-convert model.)

---

## The xStock seam itself (eval-cycle.ts)

1. **Decision placement:** after the kernel try/catch, BEFORE the Net-EV floor. Inputs mirror the kernel call it sits next to (same `costMetrics`, `DI`, `lane.sourcePool`, `_XSTOCK_GK` pWin params) + per-class `getFrictionForAssetClass('xstock_spot')` rates + `resolveMakerTakerHaircut('xstock_spot')` + `entryUrgencyClassForFamily(STRATEGY_FAMILY_MAP[normalizeStrategy(strategyKey)])` (confirm-B discipline). Same `[P19-B7.2b][VTS][MAKER_TAKER]` log line as crypto (Step-7 greps work unchanged).
2. **Floor gates on `chosenNetEV`** (crypto :1724 parity). The floor-reject + admitted archive records now carry `netEv` = the gated chosen value + `chosenMode` + `takerNetEv` (the kernel taker leg, kept for row-comparability with pre-B7.2d records; chosen ≥ taker by construction so reject rows are below-floor on both). The features `expectedEdge` stays the kernel taker netEV — UNITS comment updated.
3. **Bifurcation** (crypto :1944-1958 parity): maker-chosen + marketable → stored-taker check on the decision's own taker leg (`takerNetEV > 0` → effective-mode flip to taker; else `maker_marketable_dropped` — counters + per-lane aggregates + archive + continue). Maker-chosen + NOT marketable → `_xPendingMaker`, born `state='pending'` + `makerLimitPrice` + `makerDeadline` via `resolveMakerMaxPendingMs('xstock_spot')`.
4. **Stamp:** `chosenEntryMode` = EFFECTIVE mode; `entryFeeRate` per mode from the per-class rates.
5. **Twin:** inside the existing `if (tradeId)` block → `maybeOpenTwin({...})` with `currentMarketPrice: lastPrice` (the same live price the pre-open gates used). The open log gains `mode=... (pending)`.
6. **`registerOpenVtsTrade` passthrough:** input widened with `chosenEntryMode`/`entryFeeRate`/`state?: 'pending'`/`makerLimitPrice`/`makerDeadline`; construction uses the same conditional-spread shape as crypto's inline open. Absent → undefined → legacy dash-by-design preserved.

## Invariants held
- NO migration (both knobs seeded per class at B7.2c — Step-7 will still run your live seed-row query).
- `dispatchXstockActiveSignal` fork untouched. Active path untouched. No knob/threshold changes.
- Log markers unchanged (`[P19-B7.2c][VTS][TWIN_OPENED|TWIN_SKIPPED|TWIN_FAIL|MARKETABLE_TAKER_FALLBACK|MAKER_MARKETABLE_DROPPED]`) — the #433 soak monitor + evidence continuity unaffected.

## Step-7 commitments (restated)
(a) resolve-side no-class-gate grep (fill/drop/never-filled/rehydrate iterate the shared Map tag-based, not class-gated); (b) close-side twin short-circuit confirmed tag-based (`mtTwin`/`mtPairId`); (c) live `maker_taker` seed-row query for xstock_spot; (d) first stamped xStock VTS open + first xStock pending/twin on the VTS screens (§9.3).
