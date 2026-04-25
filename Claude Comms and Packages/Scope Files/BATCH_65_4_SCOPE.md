# Batch 65.4 — Ladder Trailing Model (Target-Ratcheting Moonbag)

**Author:** Claude Code, 2026-04-25
**Status:** Step 1 scope. Pending Langston Step-4 review with paired pre-audit.
**System phase:** 15c
**Prereq:** B65.2 (functional trailing exits) deployed and observed.

---

## 1. Why this batch exists

The trailing engine that B65.2 turned on uses a "pure trail" design: when a trade hits its target, the engine flips into TRAILING_TAKE mode and the stop ratchets up under each new high water mark, but the **target stays fixed at the original level**. Once the trade is in TRAILING_TAKE, there is only one target latch event in the trade's life — the original target hit. There is no concept of a second or third target hit.

Kyle's stated intent for moonbag mode was different: each time price hits the current target, both the stop AND the target should ratchet up to a new level (a "rung" of the ladder). Then aim for the new target. If hit, ratchet again. The trade runs until either price reverses through a ratcheted stop or the moonbag duration cap fires.

This batch swaps the pure-trail design for the ladder design Kyle described. Done.

**Concrete user-visible difference:**

| Pure trail (current) | Ladder (this batch) |
|---|---|
| One target latch event per trade | Multiple rung events per trade — each one ratchets target AND stop |
| Stop trails HWM minus K' × ATR continuously | Stop locked at the previous rung's target level after each rung; trails dynamically only between rungs |
| Closed-trade exit captures a single "trailing_stop_hit" reason with no rung count | Closed trade carries `ladderRungsHit` count, exit captures whether stop was hit during rung-N's wait or after rung-N's target was reached |

**Observed need:** in the post-B65.2 data, 4 of 6 moonbag trades exited BELOW the original target — meaning price barely poked past target and reversed before the dynamic trail caught up. The ladder's "lock at previous target" mechanic should catch the reversal at-or-above the previous target instead of letting price fall below it.

---

## 2. Operating-mode context

VTS active, paper off, live off. Same as B65.2. The ladder runs in both VTS and paper exit loops, behind `useTrailing:true`.

---

## 3. Design

### 3.1 Rung structure

Define the trade's risk: `R = entryPrice - stopPrice` (initial, at trade open). The original target is at distance `R_target = (targetPrice - entryPrice) / R` (typically 1.5R for moonbag-qualifying strategies, but read from existing trade target).

**On trade open:**
- `ladderRung = 0` (no targets hit yet).
- Engine state initialized as today.

**On target latch (Stage 2 in B65.2 terminology):**
- If qualifier check + cap check pass (existing B65.2 logic): proceed with ladder ratchet instead of pure-trail flip.
- `ladderRung = 1`.
- New stop = previous target's price (or net-target floor of previous target, i.e. previous_target × (1 − cost_fraction)).
- New target = previous_target + (R_target × R) — the same risk-multiple step up. So if original entry $100, stop $95 (R=$5), target $107.50 (1.5R), then rung 1 target = $115 (3R from entry, 1.5R above the previous target).
- mode flips to TRAILING_TAKE.
- Engine logs `[9.2][LADDER] {symbol} rung=1 target=X stop=Y` for observability.

**On subsequent target hits while in TRAILING_TAKE:**
- `ladderRung += 1`.
- New stop = previous target (the one we just hit).
- New target = previous_target + (R_target × R) — keep stepping up by the same R-distance.
- Engine logs the rung event.

**On stop hit at any rung ≥ 1:**
- Exit with reason `trailing_stop_hit`.
- Capture `ladderRungsHit = currentRung` in the closed-trade record.
- Exit price = currentPrice (same convention as B65.2).

**On moonbag duration cap (existing 4h):**
- Same as B65.2 — exit with `moonbag_timeout`. Capture `ladderRungsHit` as well.

**On qualifier reject or concurrency cap reject at first target hit:**
- Same as B65.2 — exit with `target_hit`, no ladder.

### 3.2 What replaces the dynamic HWM-based trailing in TRAILING_TAKE mode

Today, between target latch and stop hit, the engine uses `calculateTrailingStopPrice(HWM, ATR, DI, VolNoise)` to dynamically push the stop up under each new high. The ladder design is simpler and more predictable: between rungs, the stop **stays at the previous rung's target level** (no dynamic ratchet). Only when the next target is HIT does the stop move up.

Trade-offs of the simpler design:
- **Pro:** predictable. Operator can compute "if I'm at rung 2, my locked-in profit is at least 2R."
- **Pro:** matches Kyle's mental model of "step-ladder, lock in each step."
- **Con:** if price runs FAR past the next target without quite reaching it, then reverses, we lose more upside than HWM-based trailing would have captured.

To mitigate the con without abandoning the predictability, **keep the existing HWM-based dynamic trailing as a FLOOR**: the active stop = `max(previous_target_floor, dynamic_HWM_trail)`. This way:
- Stop never drops below the previous rung's locked-in profit level.
- Stop ratchets higher than that if price moves significantly past current target without quite hitting next target.

This is a clean superset of both designs.

### 3.3 Stage 1.5 (BE-latched-but-not-target-latched) unchanged

The Stage 1.5 path that produced the +$12.81 ZBT/USD outcome — BE latched, dynamic stop trails between BE and original target — stays exactly as-is. The ladder only changes behavior AFTER the first target hit.

### 3.4 Cost-aware floors stay

Each rung's "previous target floor" is the cost-aware floor (`net_target_floor = target × (1 - cost_fraction)`). Same math as today's target-latch floor.

---

## 4. Schema and persistence

### 4.1 New persisted state field

`TrailingState` interface extended with:
- `ladderRung: number` (default 0; increments on each target ratchet)
- `currentRungTarget: number` (the active target — equals state.targetPrice initially, advances on each ratchet)
- `currentRungFloor: number` (the locked-in stop floor for the current rung — equals `previous_target × (1 - cost_fraction)` after rung ≥ 1)

`importStates` / `exportAllStates` include these fields. Backward-compat: states loaded from old persistence files default `ladderRung = state.targetLatched ? 1 : 0` (one-time migration, then field is canonical).

### 4.2 Open-trade record extension

VTS `OpenVirtualTrade` interface adds:
- `ladderRungsHit?: number` — set on each rung event by the engine writeback (same path as `tradeMode` and `engineStopPrice`)

Paper `paper_sim_open_positions.metadata` jsonb gets `ladder_rungs_hit` field via the existing metadata write path. No schema migration needed.

### 4.3 Closed-trade record extension

VTS JSON log: `tradeMode`, `exitReason`, and now `ladderRungsHit` written by `vts-service::persistRealPriceTrade` (signature update).

Paper `paper_sim_trades`: add `ladder_rungs_hit INTEGER NOT NULL DEFAULT 0` column via migration.

### 4.4 Exit-reason taxonomy

No change to the exit-reason enum. `trailing_stop_hit` still means "the engine's ratcheted stop caught a reversal." The `ladderRungsHit` field tells you HOW FAR up the ladder the trade got before reversing. A trade that exits with `trailing_stop_hit` and `ladderRungsHit = 3` ran past the original target and two more rung targets before reversing — that's a real moonbag.

A trade with `trailing_stop_hit` and `ladderRungsHit = 1` hit the original target, latched, and reversed before reaching rung 2. Same exit reason, but you can tell the trade did less work.

`break_even_stop` (HF3) unchanged.
`moonbag_timeout` unchanged but also captures `ladderRungsHit` in the closed-trade record.

---

## 5. UI

ML page Closed Simulated Trades — TEC State column gets a small chip showing the rung count for moonbag-ended trades:

- TARGET (existing) — trade closed at static target/stop/timeout, no ladder
- 🌙 MB×1 — moonbag, 1 rung hit (closed at or below original target after target latch)
- 🌙 MB×2 — moonbag, 2 rungs hit (price reached one rung past target before reversing)
- 🌙 MB×3+ — etc.

Trade History tab on Trading page — moonbag chip already shows in the close-reason cell; just update to include rung count when present.

API endpoints `/api/vts/ml/open` and `/api/vts/ml/closed` — extend with `ladderRungsHit` field.

---

## 6. Implementation plan (step-by-step)

The ordering matters. Each step keeps build green.

### Step A — Engine state extensions
1. Extend `TrailingState` and `PositionUpdate` and `TrailingUpdateResult` interfaces in `trailing-exit-controller.ts`.
2. `initializeTrailingState` initializes `ladderRung = 0`, `currentRungTarget = targetPrice`, `currentRungFloor = 0`.
3. Update `importStates` / `exportAllStates` to handle new fields with old-state migration.

### Step B — Engine ladder logic
1. Replace the existing `if (!state.targetLatched) { ... }` target-latch block with ladder logic.
2. On target hit: check qualifier + cap (existing). If pass: increment rung, advance target, lock stop at previous-target-floor.
3. Keep dynamic HWM trailing as a floor between rungs.
4. On rung hits, log `[9.2][LADDER]` events.

### Step C — Evaluator surface updates
1. `tec-evaluator.ts::TECExitDecision` includes `ladderRungsHit?: number` (read from `update.ladderRung`).

### Step D — VTS wiring
1. `vts-runner.ts` exit loop: read `decision.ladderRungsHit` and write to `trade.ladderRungsHit`.
2. `getOpenVirtualTradesForML()` returns `ladderRungsHit` on open trades.
3. `vts-service.persistRealPriceTrade` accepts `ladderRungsHit` and writes to JSON log.
4. `getClosedVTSTradesFromLogs` (export-csv) reads and surfaces `ladderRungsHit`.

### Step E — Paper wiring
1. `paper-execution-engine.ts` reads decision and writes to position metadata + closed-trade row.
2. New migration: `2026-04-2x-b65-4-add-ladder-rungs-to-paper-sim-trades.sql` — adds `ladder_rungs_hit INTEGER NOT NULL DEFAULT 0` column.

### Step F — UI
1. `machine-learning.tsx` — TEC State column on Closed Simulated Trades displays rung-count chip for moonbag trades.
2. `trade-history-tab.tsx` — close-reason cell renders rung count when present.

### Step G — Tests
1. Update `b65-tec-parity.test.ts` with ladder scenarios:
   - Rung 1 hit + reverse: `ladderRungsHit=1`, exit close to original target.
   - Rung 2 hit + reverse: `ladderRungsHit=2`, exit close to first-rung target.
   - Rung 3 hit + reverse: `ladderRungsHit=3`, exit close to second-rung target.
   - Stop hit after rung 0 (no target latch): same as today's `stop_hit` or `break_even_stop`.
   - Qualifier reject at rung 0: closes at target, `ladderRungsHit=0` (no ladder).
   - Concurrency cap reject at rung 0: same.
   - HWM-floor case: price runs significantly above current target without crossing next target, then reverses — the dynamic floor pulls the stop above previous-target-floor, exit captures more upside than rung-floor alone would.

### Step H — Persistence migration for old states
1. Existing trailing-states.json files from B65.2 don't have ladder fields. `importStates` migration: if state has `targetLatched=true` but no `ladderRung`, set `ladderRung=1`, `currentRungTarget=state.targetPrice` (best-effort). Log the migration.

---

## 7. Non-goals

- Adaptive sizing (mid-trade quantity changes) — still B65.3 stub, post-launch.
- Changing the qualifier list or duration cap — those stay tunable in module_constants.
- Touching the BE-lock or Stage-1.5 logic — unchanged.
- Modifying VTS or paper exit cadence — unchanged.
- Changing the qualifier source-pool gate (vwap_pullback in quant-strong_trend only) — unchanged.

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Ladder produces premature exits when price oscillates near a rung target | The rung-target locks at the previous floor; only triggers on actual stop violation. A small bounce + dip won't ladder unless the bounce crosses the new target. |
| HWM-based dynamic floor and rung-target floor produce conflicting stops | `max(rung_floor, dynamic_HWM_trail)` — explicitly always uses the higher, never moves stop down. |
| State persistence migration breaks restart for in-flight moonbag trades | Migration sets `ladderRung=1` for any pre-existing target-latched state. Logged. Next cycle's `updatePosition` corrects via fresh logic. |
| Closed-trade `ladderRungsHit` not populated for in-flight trades that were opened pre-deploy | Default to 0. Old data is unaffected. |
| Concurrency cap counter rebuild on `importStates` doesn't include new ladder state | Cap counter is per-`callerMode`, computed from `tradeMode === 'TRAILING_TAKE'` count. Ladder doesn't change that. Counter rebuilds correctly. |
| The "lock at previous target floor" is too tight on volatile pairs and produces frequent exits-at-floor instead of capturing more upside | Mitigation: HWM-based dynamic floor as fallback (already in the design §3.2). Observation will tell us if this is enough; if not, the floor multiplier can become a `module_constants` row to tune. |

---

## 9. Governance checklist (Step 10)

Tier 1:
- `BATCH_CATALOG.md` — add B65.4 row.
- `PHASE_HISTORY.md` — append note.
- `MEMORY.md` — volatile state.
- `BATCH_65_4_COMPLETION_REPORT.md` — written at close.

Tier 2 (applicable):
- `SYSTEM_IMPACT_MAP.md` — note ladder state extensions, paper schema migration, UI surface.
- `SYSTEM_MANUAL.md` — §5 TrailingExitController updated to describe ladder.
- `CHANGES_AND_FIXES.md` — entry for the ladder swap.

Change list at `Claude Comms and Packages/Change Lists/BATCH_65_4_CHANGE_LIST.md` for Langston Step-4 review.

---

## 10. Langston review request (Step 1+2)

Please review for:
1. Does the ladder rung step size (same R-distance as original target) match what Kyle described? Or did he intend a different step size (HWM-based, ATR-based, something else)?
2. Is "lock stop at previous-target floor + max with dynamic HWM trail" the right hybrid, or is the simpler "lock at previous-target only" cleaner?
3. Anything in the existing B65.2 engine I'm about to touch where the impact map shows downstream consumers I haven't accounted for?
4. Any concern that backward-compat migration of old persisted states will produce weird behavior on the first cycle after deploy?
5. Test scenarios — is the 7-scenario set in §6.G sufficient, or are there edge cases I should add (e.g., target hit on the exact same cycle as stop hit; rung hit at moonbag-duration-cap boundary)?

Once you sign off, I'll proceed with implementation. Step 4 code review on the diff before push.
