# P19-B8.5k (B-ATR-RESTORE) — Pre-Audit (Step-2)

**Owner:** CC-B · **Read at:** `origin/migration/aws-supabase` (HEAD `8950946d0` at investigation) · **Change-class:** architecture.
All citations read at code; live values read on the staging DB. This artifact records the §9.5 census + the SIM/System-Manual consult + the neutrality verification, per the "Step-2 artifact is not optional even when findings live in the scope" lesson (B8.5i).

## 1. SIM / System-Manual consult
- **SYSTEM_IMPACT_MAP** — the sized-signal metadata assembly (`signal-orchestrator.ts buildSizedSignalForStrategy`) is the documented single rebuild site for #549/#550/#556 (the "curated rebuild drops its input" class). The exit path (`active-execution-engine.ts checkExitConditions` → `evaluateTECExit` → `trailing-exit-controller.tecUpdatePosition`) is the documented consumer of `atr_at_open`. This batch adds one field to the rebuild + re-proves the exit-path neutrality note; SIM gets a content update (the atr carry + the exit-path-runs-with-atr>0 note).
- **SYSTEM_MANUAL** — the `max_holding_period`/trailing exit rows document the floor-vs-trailing split (P19-B6.5b F5 ATR floor). This batch changes which block runs (floor→trailing) while keeping the outcome identical; System Manual gets the neutrality note.

## 2. §9.5(a) consumer census — who reads the ATR value
Repo-wide `git grep` at the ref (`atr_at_open`/`atrAtOpen`/`meta.atr`), tests excluded:
| Consumer | Site | Effect of restoring the real value |
|---|---|---|
| **Active exit engine** | `active-execution-engine.ts:1491→1540` | atr>0 → exit routes floor→trailing block (see §4 neutrality) |
| RTB ranking | `ready_to_buy_service.ts:1691/1841/1973` | gets the real value (was falling back) — pure gain |
| exit-strategy replay | `exit-strategy-replay-service.ts:211/364` | replay comparability improves |
| Open Trades display | adapter → `atr_at_open` | shows the real ATR instead of `'0'` |
| VTS | `vts-runner.ts:2093` etc. | **independent** — stamps from `mceContext.indicators.atr` directly, NOT the rebuild; untouched by this batch |

Only the **active exit engine** couples the value to exit behaviour. Every other consumer is a pure data-quality gain.

## 3. The drop + the source (OBJ-1)
- Drop: `signal-orchestrator.ts:~1078-1108` rebuilds `metadata` from an explicit list (`..._displayContext` the only spread); carries `maxHoldingMs` (B8.5f) but not `atr`.
- Source (Langston ask ii — confirmed): `sizingContext.atr` is stamped at `:2157` ("reorg-B2 Piece C", the per-symbol single-point, by the **caller** before `buildSizedSignalForStrategy` runs) and is the same value the reachability gate uses (`:1536`, dropping `invalid_atr` — so admitted signals carry a real value). **No fail-loud guard** (unlike maxHoldingMs): the rebuild precedes the in-function `invalid_atr` gate, so a pre-gate signal may legitimately still carry 0/absent atr and must not throw — pure forward (downstream `?? 0` handles absence, identical to today).

## 4. Neutrality under atr>0 (OBJ-2 — the centerpiece)
Live DB (`module_constants`/`trailing_exit`, all 4 asset classes, staging 2026-07-24): `break_even_enabled=false`, `moonbag_qualifying_strategies=[]`, `trailing_enabled_active=false`, `trailing_enabled_vts=false`.

**Exit OUTCOME is byte-identical** (Langston-verified): `tec-evaluator.ts:373` remaps the internal `target_hit_no_trailing` → `exitReason:'target_hit'` and clamps `exitPrice` to `targetPrice`; `:417` clamps the stop side; the writer persists `exitCondition.type`. Exit price / reason / pnl unchanged.

**The stop write-back (`active-execution-engine.ts:1563`, `if newStopPrice > stopLoss`) — precise characterisation (this REFINES the scope's "no-op"):**
- **Below target: strict no-op** — proven by unit test T1: with BE off, a price that latches break-even in the BE-on config (`+2.5×ATR`) produces `newStopPrice === entry stop` (neither dynamic-stop branch at `:1261/:1277` runs — both require `targetLatched`/`breakEvenLatched`). So no write.
- **At the target cycle: the write-back DOES fire** (`:1261` computes a dynamic stop once `targetLatched` is set at `:1198`; test T2 log showed `stop=109.02`). **But it is harmless:** `newStopPrice > stopLoss` ⟹ `targetLatched` ⟹ (moonbag-off) `closeNow` ⟹ `shouldExit` — so the write-back can **never** leave an OPEN, non-closing position with a drifted stop; it only writes on the cycle the position closes at target. Exit outcome unchanged.
- **This same path runs in VTS today** (VTS stamps atr>0 and routes through the moonbag-reject branch) — so it is established production behaviour, not novel.

## 5. Metadata deltas (Kyle heads-up — NOT exit-behaviour changes)
1. `originalStopPrice` (persisted `:1994`, sourced from engine state `_getTES`) populates `null` → entry stop, because `tecUpdatePosition` now runs — enrichment.
2. On target-closed trades, the closing-cycle write-back may record the ratcheted stop on the closed row instead of the entry stop — a **possible cosmetic delta on winning (target) closes; to confirm at the Step-8 live watch**, not asserted. Neither changes exit price/reason/pnl.

Both are Kyle's separate-lever category (per #556: "restoring the value WITHOUT any downstream effect needs a new explicit gate") — flagged, not bundled; the useTrailing gate is NOT added (reverses B8.5i).

## 6. Verification done
- tsc baseline gate: PASS (exit 0, no regression; signal-orchestrator introduces 0 new errors).
- full vitest: 2441 passed (2437 baseline + 4 new), 165 skipped, 10 environmental pg-pool file failures (baseline, unrelated).
- new suite `p19-b8-5k-atr-neutrality.test.ts`: 4/4 (T1 below-target no-op, T2 at-target closes-no-flip, 2 source guards).

## 7. Blast radius
Edits: `signal-orchestrator.ts` (1 field + comment) + new test. No migration (code carry). No VTS edit. Board claim [33] on `signal-orchestrator.ts`. Downstream `active-execution-engine.ts:3143` already spreads `...signal.metadata` — no plumbing change.
