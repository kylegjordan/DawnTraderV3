# P19-B8.5k (B-ATR-RESTORE) — Scope

**change-class: architecture**
**Owner:** CC-B (NEW Claude) · **Phase:** 19 (paper-active) · **Drafted:** 2026-07-24
**Issue homes:** #556 (the ATR/trailing coupling — Kyle decision element) · #549/#550 family (the curated-rebuild drop) · related #562 (B8.5i trailing switch, closed).

---

## 1. One-line intent
Restore the volatility (ATR) value so it reaches open positions — the value is computed on every signal, then **dropped in transit** at the sized-signal metadata rebuild, so `atr_at_open` persists `'0'` on every live position. Restoring it feeds the real value to the display, the ready-to-buy ranking, the exit-strategy replay, and VTS-parity.

## 2. The drop (verified at `origin/migration/aws-supabase`, HEAD `737bf1752`)
- `signal-orchestrator.ts:~1078-1108` rebuilds the sized signal's `metadata` from an **explicit field list**; `..._displayContext` is the only spread. It carries `maxHoldingMs: _maxHoldingMs` (added by B8.5f) but **not** `atr`. So the `atr` stamped on the raw signal dies at that line.
- Consequence: `active-execution-engine.ts:3344` persists `atr_at_open` from `signal.metadata.atr ?? 0` → **`'0'` on 15/15 live positions**; the exit engine reads it back at `:1491` (`atrAtOpen = metadata.atr_at_open ? parseFloat : 0`) → `evaluateTECExit` receives `atr: 0`.
- Same one-line-drop class as #550 (`maxHoldingMs`) and #549 (display fields). This is **part (1) only** — the carry.

## 3. The coupling finding, and why part (2) was DROPPED (Langston Step-1 review, accepted)
Restoring `atr` moves the active exit path out of the hard stop/target **floor** block (`tec-evaluator.ts:268`, runs today because `atr=0`) and into the **trailing** block (`:294`, runs when `atr>0`). My first-pass scope proposed a second part — gate `useTrailing` on `trailing_enabled_active` — to keep exits on the floor block. **That part is dropped**, for two Langston-verified reasons:

1. **Exits are already byte-identical in storage.** `tec-evaluator.ts:373` remaps the internal `target_hit_no_trailing` discriminator to `exitReason:'target_hit'` and **clamps `exitPrice` to `targetPrice`** ("fill-convention parity"); the stop side clamps to `stopPrice` (`:417`); the writer (`active-execution-engine.ts:1962`) persists `exitCondition.type` = `target_hit`/`stop_hit`. The `target_hit_no_trailing` label never reaches storage (traced end-to-end in B8.5i OBJ-3). So the earlier "close-reason + exit-price differ" premise was **wrong**.
2. **Gating `useTrailing` would reverse Kyle's explicit B8.5i design ruling** — "the three `useTrailing:true` hardcodes UNCHANGED; the switch is gated by `mode:CallerMode` at the single chokepoint `isMoonbagQualifier`." `trailing_enabled_active` already routes trailing-off through the moonbag-reject branch (outcome-identical fills). A second `useTrailing` gate is redundant with Kyle's chosen mechanism and undoes his call — an authority boundary, his to reopen, not ours to bundle.

## 4. Live-state confirmation (staging DB, `module_constants` / `trailing_exit`, all 4 asset classes)
`break_even_enabled=false` · `moonbag_qualifying_strategies=[]` · `trailing_enabled_active=false` · `trailing_enabled_vts=false`. So with `atr>0` the trailing state machine **engages** but does no actual trailing: no break-even ratchet (`:1123` skipped), no moonbag ladder (`:1200` skipped), no pre-target stop movement.

## 5. Objectives
- **OBJ-1 — Carry `atr` forward.** Add `atr` to the sized-signal metadata field list at `signal-orchestrator.ts:~1100`, mirroring how B8.5f added `maxHoldingMs` (`_maxHoldingMs` at `:1027`). Sourced from the raw signal's stamped `atr`. **Verify:** `atr_at_open` persists the real non-zero value on newly-opened positions (psql + §9.3 UI Open Trades).
- **OBJ-2 — RE-PROVE NEUTRALITY WITH `atr>0` (the centerpiece; B8.5i proved neutrality only while `atr=0`, so the state machine never ran — restoring `atr` fires `tecUpdatePosition` for the first time on the active path).**
  - (a) moonbag-reject target/stop exits stay clamped to `targetPrice`/`stopPrice` — **assert on the persisted `closed_trades` row**, not the internal discriminator.
  - (b) **The one genuine risk:** the stop write-back at `active-execution-engine.ts:1563` (`if newStopPrice > stopLoss → updateActiveOpenPosition(stopLoss)`) must be a **no-op** with BE+moonbag off. Pre-audit read: `newStopPrice == currentStopPrice == stopLoss` pre-target (neither dynamic-stop branch runs), so the `> stopLoss` condition is false. **Verify with a unit/source-guard test + live-log watch that no stop is written back on a non-trailing position.**
  - (c) `break_even_enabled` false on the live rows per class — **confirmed** (§4).
- **OBJ-3 — Active-only; VTS untouched.** `vts-runner.ts:2093` stamps `atrAtOpen` directly from `mceContext.indicators.atr`, independent of the orchestrator rebuild — VTS has been running the trailing SM with `atr>0` through the moonbag-reject branch in production all along (live evidence the branch is neutral). **This batch touches no VTS code.** Verify: no diff under `vts-runner.ts` / `vts-service.ts`.

## 6. Known metadata delta (Kyle heads-up, NOT an exit-behaviour change)
Restoring `atr` makes `tecUpdatePosition` run, so `_getTES(position.id)` returns engine state and **`originalStopPrice` (persisted at `:1994`) populates from `null` → the entry stop** — metadata **enrichment** (arguably more correct), not an exit-outcome change (`tradeMode`, `ladderRungsHit`, pnl, exit price all unchanged). If Kyle wants it to stay `null` for `atr=0`-era parity, that is a **separate explicit Kyle decision with a different lever** — flagged, not bundled.

## 7. Out of scope
The max-hold policy debate (`B-MAXHOLD-POLICY`), the trailing on/off decision (Kyle's, via the existing switch), any VTS change, the RTB ranking's *use* of atr (it already reads `meta.atr ?? meta.atrAtOpen` and simply gets a real value now).

## 8. Governance (Tier-1 every sub-batch; Tier-2 where applicable)
Completion report · BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN · RUNNING_ISSUES (close #556's carry element; note the coupling resolution) · MEMORY. SIM (the `atr` carry + exit-path note) + SYSTEM_MANUAL (the exit-path/neutrality note) — **applicable**, will update. Pre-audit artifact (`P19_B8_5K_PRE_AUDIT.md`) written before implementation.

## 9. Verification gates
tsc clean · full vitest A/B (no pre-existing loss) · CI 4/4 green on head · migration N/A (no schema change — a code carry) · deploy · §9.3 UI Open Trades shows real ATR · live-log neutrality watch (no stop write-back on non-trailing positions; exit labels unchanged) · Langston Step-8.
