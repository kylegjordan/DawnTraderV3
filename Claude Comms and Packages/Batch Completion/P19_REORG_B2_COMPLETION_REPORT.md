# P19 reorg-B2 — Completion Report

> **Batch:** reorg-B2 · **Phase:** 19 · **change-class:** architecture · **Author:** NEW Claude (CC-B) · **Date:** 2026-06-20
> **Title:** Rung-1 — per-class target-floor + universal RR gate + reachability gate (BOTH classes); the rung-1 plumbing for crypto opening.
> **Comms:** Discord (this batch). CC-B + Langston iterated autonomously Step-1→Step-4.
> **Commits:** `b41fb3e64` (A core + OBJ-7) · `dc5ee32a3` (B threading) · `4880d2ea2` (B migration + boot + resolver) · `d592c8e29` (A wiring + V4#1) · `aaa0d8a9f` (C foundation) · `4b55d9794` (C folded into normalizer) · `3c7a28f12` (§13) · `1090d83d9` (CI fix) · `7cbd40440` (Step-4 fix #1 — active ATR carrier + loud invalid_atr) · `74681cf7e` (Step-4 fix #2 — VTS invalid_atr distinct + SkipReason union) · `250761929` (Step-4 note-1 — boot assertion iterates CANONICAL_REGIMES). **Deployed head: `250761929`.** Scope `d6e290862` · pre-audit `194d4dc1a`.

## 🚨 SCAFFOLDING-VS-FUNCTIONAL (mandatory, §9.1)
**THIS BATCH DOES NOT MAKE CRYPTO OPEN A TRADE. It is the rung-1 PLUMBING.** Decision-grade EV finding (CC-B + Langston): at the Tier-1 taker fee wall (~1.8% round-trip) with the pWin ceiling 0.60, the Net-Expectancy kernel is net-negative even at a 4% target / 1.6% stop (`0.6·4 − 0.4·1.6 − 1.8 ≈ −0.04%`), so the 11.8B EV gate HONESTLY refuses to open crypto at taker — matching the Phase-19 audit. The EV gate is the safety (it never opens a net-negative trade). **Actual profitable crypto-opening requires the maker build (reorg-B7, rung-2) + the pWin-ceiling recalibration (Phase-25).** reorg-B2 ships the machinery + honest per-class values; opening is gated on #335 (win-rate validation at B9 turn-on).

## PREVIOUSLY-STATED-VS-NOW
- **PREVIOUSLY STATED: reorg-B2 "gets crypto trades OPENING at taker rates." NOW: it ships the rung-1 PLUMBING; the EV gate (correctly) won't open crypto at taker; the real opener is the maker build (B7) + Phase-25 pWin. REASON: the decision-grade EV kernel math at the Tier-1 fee wall + the pWin 0.60 ceiling (matches the Phase-19 audit).**
- Piece C: PREVIOUSLY a `screener_filters` column wired across 5 scan paths. NOW folded into the central normalizer (one helper, the two existing convergence points). REASON: reachability shares entry+target+ATR there → a separate filter site is pure sprawl; reachability is path-invariant by design (Langston consensus).

## Objectives
| # | Objective | Status | Evidence |
|---|---|---|---|
| A | Per-class target floor (lift), wired both paths | ✅ | `signal-target-normalizer.ts` `normalizeAndGateTarget` (lift→RR→reach); wired at `buildSizedSignalForStrategy` (active) + `vts-runner.ts:1176` (VTS). Single point each (Langston split-brain check). |
| B | Per-class ROI/EV gate (thread assetClass; no silent global) | ✅ | `expectancy.ts` 5 fns threaded; per-class `expectancy_gates`/`roi_gating` migration DELETES the global `'*'` rows; boot assertion throws (fail-closed) for BOTH classes. |
| C | Movement/reachability gate (per-class, by-reason) | ✅ | Folded into the normalizer: `atrsToTarget=(target'−entry)/ATR ≤ reachAtrMax`; path-invariant; drop+by-reason (`unreachable`). |
| — | Universal RR gate (native or lifted), drop-not-co-move | ✅ | `rr<minRR → drop`; applied to ALL signals; never co-moves the structural stop (Langston Step-2). |
| OBJ-7 | Delete deprecated ROI consts | ✅ | `adaptive-thresholds.ts` ROI_MIN/MAX/FLEX + FRICTION_SAFETY_BUFFER + CONFIG removed (kept DEFAULT_SLIPPAGE); DELETED_COMPONENTS_LOG. |
| V4 | Orchestrator fallback literals | ✅/homed | #1 (`?? entry×1.015`) deleted on-spot; #2 (`?? ×0.97/×1.03`) dated-homed (#334 — sizing-requires-stop dependency). |
| Tests | | ✅ | `p19-reorg-b2-target-normalizer.test.ts` 8/8 (lift, dispersion, RR universal, unreachable, geometry); focused suite 70/70; regime_mapping_integrity green. |

## Multi-path consistency (Kyle directive)
The lift+RR+reachability normalizer runs at BOTH convergence points — the active `buildSizedSignalForStrategy` (covers all active sizing emit paths) and the VTS `vts-runner.ts` (which calls `strategyEngine.detect*` directly, NOT via the orchestrator). The per-class ROI gate (`isSignalProfitable`) is VTS/SQE-shared by construction. So VTS and active normalize/gate IDENTICALLY (sim-to-live parity).

## Known properties (Langston Step-4 notes — logged)
- `target_floor_pct=4%` / `min_rr=2.5` / `roi_absolute_max=4%`, both classes identical (same account-wide Tier-1 fee wall) — a CONSERVATIVE starting placeholder; Phase-25 calibrates per-class. The floor lifts WEAK targets to 4%; STRONG native targets ride ABOVE 4% (dispersion preserved — `roi_absolute_max` caps the GATE threshold, NOT the target; locked by a test).
- Reachability is PATH-INVARIANT (feasibility, not a quality bar) → per-class only, never per-filterPath.
- The boot assertion fails CLOSED (server refuses to start without the per-class rows, both classes).

## §13 homes (concrete, §9.4)
- **#335** realized net-of-friction win-rate validation → P19 reorg-B9 turn-on pre-flight gate.
- **#336** xStock target floor must come DOWN → Phase-25 (named calibration item).
- **#334** V4 literal #2 removal → P19 pre-go-live cleanup (sizing-requires-stop dependency).

## Step-4 fixes (Langston code-level review — CHANGES-NEEDED → APPROVED)
Langston ran the Step-4 read and surfaced one real latent blocker + one in-review item; both fixed in-batch, then **APPROVED / PROCEED**:
1. **Active reachability fed `atr=0`** (the `marketContext` 4th param is optional; the ~20 internal strategy-loop callers pass 3 args) → would have dropped 100% of active crypto signals as `unreachable` at turn-on (invisible today — active path dormant). **Fix (`7cbd40440`):** ATR carried on the universal `SizingContext`, stamped once per pipe from `mceContext.indicators.atr` before the dispatch loop; the active call reads `marketContext?.atr ?? sizingContext.atr ?? NaN`; a genuinely-missing ATR returns a distinct **loud `invalid_atr`** (`console.error` + drop) — never coerced to 0, never masked as `unreachable`.
2. **VTS silently mislabeled `invalid_atr`** as `target_rr_gate` (the VTS `!_b2.ok` block was a 2-way branch) — corrupts the learning-data diagnostics VTS exists for. **Fix (`74681cf7e`):** VTS gives `invalid_atr` its own `Target_Invalid_ATR`/`target_invalid_atr` skip reason + a matching `console.error`; all three reorg-B2 reasons typed into the `SkipReason` union (dropped vts-runner errors *below* baseline — anti-graveyard).
3. **Note-1 (pre-approved fold-in, `250761929`):** boot assertion iterates `CANONICAL_REGIMES` (SSOT) instead of a hand-written array → auto-extends if a regime is ever added.
4. **Note-2 confirmed:** `buildSizedSignalForStrategy` has two feeders — the strategy-dispatch loop (`sizingContext.atr`, post-stamp) + `dispatchExternalSignal` (xStock, `marketContext.atr`); both fed, neither can reach NaN silently.

## Verification
- **Bench:** tsc baseline GREEN (the union fix dropped vts-runner errors below baseline); `p19-reorg-b2-target-normalizer` 8/8 (incl. `invalid_atr`-distinct-from-`unreachable`); `regime_mapping_integrity` 7/7.
- **CI:** GREEN — all 4 jobs on deployed head `250761929` (run 27883194231).
- **Step-4:** Langston **APPROVED / PROCEED** (code-level read of the final + atrfix + vtsfix diffs; both his stated checks PASS — REGIMES is genuine SSOT, boot assertion covers the full 5-regime enum × both classes, no partial list).
- **Deploy + migration apply:** ✅ DONE — `git pull` (head `250761929`) → `npm run db:migrate` ("1 pending migration applied successfully") → `npm run build` → `pm2 restart`; server online, no crash-loop.
- **Staging verification (Step-7 + Langston Step-8, decision-grade):** ✅ **Fail-closed boot assertion PASSED** (server online + HTTP 200, `unstable_restarts: 0` — by construction proves every per-class key resolves). Direct DB evidence (CC-B + Langston independent psql): `module_constants` has **11 per-class rows for BOTH `crypto_spot` and `xstock_spot`** (6 `expectancy_gates` consts + 5 `roi_gating` regimes), **0 global `'*'` rows in `roi_gating`**, and **1 DELIBERATE global row in `expectancy_gates` — `friction_safety_buffer` — kept class-agnostic BY DESIGN** (see the friction_safety_buffer disposition below). No silent global ROI fallback (the 6 ROI gate knobs + the per-regime min_roi are per-class; the migration deleted their global `'*'` rows). Active path dormant ⇒ the EV gate (correctly) won't open crypto at taker — the documented expected behavior, not a defect.

### friction_safety_buffer — intentional global (Langston Step-8 surfaced; CC-B + Langston consensus, §13-homed)
`expectancy_gates.friction_safety_buffer` retains its single global `'*'` row — it was **not** split per-class, by design. It is a uniform safety **margin** applied on top of the friction **model**, and the model itself is already per-class (`fee_model` + per-class spreads carry the crypto-vs-xStock fee/spread/settlement differences). So the materially-different friction profiles are captured in the per-class model, not the buffer; a single conservative margin on top is correct, not a missed split. **Disposition (§11-respecting, not a silent default):** keep global now; **Phase-25 calibration revisits** whether the buffer itself should go per-class IF the per-class friction models show the margin needs to differ. Homed in `RUNNING_ISSUES.md` (#337) ↔ POST_AUDIT_ROADMAP Phase-25 item. **Issue-number note:** reorg-B2's surfaced items were renumbered #335→#335 / #336→#336 (win-rate / xStock-floor) to deconflict from B-DISCORD's #335/#336 (a cross-session collision — both CC sessions independently grabbed those numbers); #334 (V4#2) kept.
- **Step-8 (Langston second-pass):** _IN PROGRESS — dispatched with the live evidence; he picks up from the live logs._

## Governance files changed (Step-10 — ALL LANDED)
Scope + pre-audit + change list + this report; **`RUNNING_ISSUES.md`** (#335 win-rate / #336 xStock-floor / #334 V4#2 / NEW #337 friction_safety_buffer + the #332/#333 cross-session deconfliction note); **`DELETED_COMPONENTS_LOG.md`** (OBJ-7 dead ROI consts); migration + rollback (+ MANIFEST); **`SYSTEM_MANUAL.md`** §4 (per-class target-setting normalizer lift→RR→reachability math + per-class ROI gate + the friction MODEL/MARGIN decomposition + the EV-plumbing reality); **`SYSTEM_IMPACT_MAP.md`** §1.2a (new Target-Normalizer + Per-Class ROI Gate component, both convergence points, friction MODEL-vs-MARGIN); **`BATCH_CATALOG.md`** (reorg-B2 entry); **`PHASE_HISTORY.md`** (Phase-19 row); **`PHASE_19_PLAN.md`** §1 (reorg-B2 status row); **`POST_AUDIT_ROADMAP.md`** §3.3 (NEW Phase-25 items 25-17 xStock floor ↔ #336, 25-18 friction buffer ↔ #337 with the verbatim trigger); MEMORY (CC-B + shared, this session).

## Next
reorg-B3 (EV-input plumbing #233) per the board — though the EV finding re-weights the sequence toward reorg-B7 (maker) as the actual crypto opener; CC-B + Langston to confirm the micro-order.
