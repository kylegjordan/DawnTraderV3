# reorg-B3.3x — Completion Report

**Batch:** P19 reorg-B3.3x — xStock VTS un-strangle (the xStock half of reorg-B3.3) · RUNNING_ISSUES #382
**change-class:** architecture (signal-pipeline / VTS — xStock)
**Date:** 2026-06-24 · **By:** CC-B (NEW Claude) + Langston (Step-1 scope + Step-4 diff CONCUR) · autonomous
**Deployed:** staging `53f601b93`, restart#415, CI 4-green `28131918663`, **no migration**

---

## Why

reorg-B3.3 un-strangled the CRYPTO VTS path; the xStock VTS path (`xstock_spot/eval-cycle.ts`) was left
default-`'enforce'` (still strangled) because it had **no `normalizeAndGateTarget` call** (build-history gap,
B79.0m) — so none of reorg-B3.2's tag-don't-drop disposition, reorg-B3.3y's `target<=entry` validity, or the
`vtsGateVerdict` capture. B3.3x closes that gap.

## The fix — Option B (UNIFY, Langston's call): one shared normalizer SSOT, not a second copy

- **OBJ-1** — `eval-cycle.ts:526` opts the xStock VTS dispatch into `'tag'` → the strategy guard stops
  hard-dropping quality fails (the strangle), same mechanism as crypto.
- **OBJ-2** — added the SAME `normalizeAndGateTarget` call after detect, BEFORE the Net-EV kernel/floor
  (orthogonal + sequential): quality (`rr_below_min`/`unreachable`) TAG + simulate (native target); validity
  (`invalid_atr`/`invalid_geometry`) DROP. xStock thereby GAINS the reorg-B3.3y `target<=entry` backstop it
  never had. Positive-narrow verdict typing (flat `TargetNormalizeResult`).
- **OBJ-3** — `vtsGateVerdict` on the xStock trade record. **★Langston Step-1 catch (corrected):** the shared
  sink `RegisterOpenVtsTradeInput` had NO `vtsGateVerdict` field — my `xOpenTrade` field type-checked only via
  excess-property bypass on a variable, so the sink silently ignored it (inert). Fixed: added the field to
  `RegisterOpenVtsTradeInput` + threaded it onto the `OpenVirtualTrade` record `registerOpenVtsTrade` builds
  (`vts-runner.ts`) — the SAME in-memory surface crypto stamps at ~:1649. **This is NOT "zero sink change"**
  (the original scope claim was wrong). The verdict is **in-memory-only — no DB column** (B3.2 no-migration;
  shared crypto+xStock historical-persistence gap → RUNNING_ISSUES **#384**, homed to reorg-B4).

## Objectives — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | xStock VTS dispatch → `'tag'` | ✅ YES | `eval-cycle.ts:526` `callStrategyDetect(..., 'tag')` |
| OBJ-2 | shared normalizer (tag quality / drop validity), before the Net-EV floor | ✅ YES | block after `finalScore`, before the kernel; positive-narrow |
| OBJ-3 | `vtsGateVerdict` on the xStock record (sink threaded) | ✅ YES | `RegisterOpenVtsTradeInput` += field; `registerOpenVtsTrade` copies it; `xOpenTrade:815`→`registerOpenVtsTrade(:923)` |
| OBJ-4 | tests + Step-7 + governance | ✅ YES | new test 5/5; tsc baseline OK; CI green; governance below |

## Langston review

- **Step-1:** Option B approved ("not close" — NO PATCHES); caught the OBJ-3 sink claim (fixed); 5 Step-4 catches named.
- **Step-4:** CONCUR after I quoted the call-site wire (`:815`→`:923`) + named the #384 persistence home. All 5
  catches verified: xStock class to `getPerClassTargetGate` (no crypto default); normalizer slotted where
  entry/stop/target/atr all in scope, before the kernel; positive-narrow partition (unknown→DROP); `'tag'` on
  VTS dispatch only (active untouched); explicit `target==entry→invalid_geometry→DROP` test.

## Step-7 verification

Deployed `53f601b93`, restart#415, HTTP 200; `reorg-B3.3x` present in `dist/index.js` (4 refs). xStock eval-cycle
active (24/5, weekday). Proof: `[reorg-B3.3x][VTS][TAG_NO_DROP]` markers fire on xStock quality-gated signals
(now tag-and-simulate instead of hard-drop at the strategy), and the new `invalid_geometry`/`target<=entry`
backstop catches degenerate xStock longs (Langston check #3). **✅ CONFIRMED (post-restart#415 read):**
`[reorg-B3.3x][VTS][TAG_NO_DROP]` markers fire on real xStock symbols — `KR/USD/vwap_pullback unreachable
rr=3.48`, `MRNA/USD/morning_star rr_below_min rr=2.09`, `MRVL/USD/vwap_pullback rr_below_min rr=2.00` — i.e.
quality-gated xStock signals that pre-B3.3x were hard-dropped at the strategy now tag-and-simulate. The
un-strangle works for xStock. **The `target<=entry` validity backstop: 0 live drops in the window** — honest
read: no degenerate xStock geometry occurred (these are rare; on crypto it was the `volatility_edge rr=-0.00`
case). The backstop is in code + unit-tested (`target==entry→invalid_geometry→DROP`, 5/5) — available but not
yet exercised live (NOT over-dropping/flooding, which was Langston's failure mode). `vtsGateVerdict` rides onto
the opened xStock trade via the threaded sink (the markers confirm the disposition; the in-memory record now
carries it at crypto parity).

## Governance files changed

- `1-system-manual/SYSTEM_MANUAL.md` — §11 updated: the normalizer's tag-don't-drop is now the ONE shared VTS gate for crypto AND xStock (§16 content update)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — §1.2a-2 reorg-B3.3x line (xStock unified; registry-applicability re-stated)
- `1-system-manual/RUNNING_ISSUES.md` — #382 RESOLVED + #384 (in-memory-only persistence → reorg-B4)
- `1-system-manual/PHASE_19_PLAN.md` — §1 board (deployed) + §5 log
- `1-system-manual/BATCH_CATALOG.md` — reorg-B3.3x row
- `1-system-manual/PHASE_HISTORY.md` — plain-language entry
- `Claude Comms and Packages/{Scope Files,Langston Design Asks,Batch Completion}/...` — scope, Step-4, this
- MEMORY (CC-B + Langston §10.b)

**Code:** `server/asset_classes/xstock_spot/eval-cycle.ts`, `server/services/vts-runner.ts`, + new test.

**Status:** all steps complete; Langston Step-4 CONCUR; awaiting Step-7 live counts + Langston Step-8 + Kyle ack.
The reorg-B3.3 family is now complete across both asset classes (B3.3 crypto, B3.3x xStock, B3.3y validity).
