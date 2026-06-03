# B3.1b — Volume-confirmation removal (xStock path) — COMPLETION REPORT

**Status: COMPLETE — deployed + verified on staging 2026-06-03 (commit eabf56e89). Langston Step-4 SIGNED OFF. CI all-4-green. Active trading OFF — impact is on VTS telemetry until Phase 19.**

## Scope objectives

| # | Objective | Result | Evidence |
|---|---|---|---|
| O1 | Remove volume-confirmation on the xStock strategy paths (the gates run on wrong underlying-equity volume; depth-delta replacement has no signal — B3.1a §1/§4) | ✅ YES | Per-class flag `volume_confirmation_enabled`; 6 detect sites gated |
| O2 | Per-class scoped — xStock OFF, crypto KEEPS its volume gates | ✅ YES | DB: 6 `xstock_spot`=0, 6 global `*`=1; crypto falls through to =1 |
| O3 | DB-resolved, both VTS + active paths, no hardcoded asset-class branching | ✅ YES | Read via existing `getCachedNumbersForModule` per-class resolver |
| O4 | Documented known-gap (no honest xStock token-volume feed) | ✅ YES | Migration comment + `RUNNING_ISSUES` entry |
| O5 | Langston Step-4 code review before push | ✅ YES | Approved-after-dropping-abcd_long; coverage-complete |

## What changed
- **Migration** `2026-06-03-b3-1b-xstock-volume-confirmation-disable.sql` (registered in `MANIFEST.txt`): seeds `volume_confirmation_enabled` — global `(*,*,*,*)`=1 (crypto + all non-xStock = enabled, behavior preserved) + `(*,xstock_spot,*,*)`=0 for 6 volume-touching modules (vwap_pullback, vwap_bounce, breakout, inside_bar_reversal, pivot_shift, morning_star). 12 rows, 1:1 with the 6 edited detect sites. `abcd_long` intentionally NOT seeded (Langston: disabled for xStock + its gate not wired to the flag → would imply coverage the code doesn't provide). Numeric (1/0), never string (resolver drops non-numeric → silent re-enable).
- **6 detect sites** read `(c['volume_confirmation_enabled'] ?? 1) !== 0` and bypass the volume check when 0: vwap_pullback / vwap_bounce / breakout (hard gates, `strategy-engine.ts`); inside_bar_reversal / pivot_shift (hard `volume_insufficient` gate); morning_star (soft confidence bonus neutralized to 0). Default-enabled preserves behavior if unseeded.
- **Unit test** `b3-1b-volume-confirmation-per-class.test.ts` (3 tests, green): per-class resolution (crypto=1/xstock=0), absent→enabled default, crypto_perp falls through to global.

## Verification (outcomes-based)
- **DB (psql):** `module_constants.volume_confirmation_enabled` = 6 `xstock_spot`=0 + 6 global `*`=1. ✅
- **Built bundle:** `dist/index.js` contains the edit; pm2 `dawntrader` restarted (uptime reset, restart #346). ✅
- **RUNTIME PROOF (the strong one):** post-restart logs (01:22 UTC, after the 01:18 deploy) show xStock VWAP evals: `[VWAP Strategy] Volume check: current=9405, avg=14587, multiplier=1.5x, confirmed=true, volGateEnabled=false`. Volume (9,405) is BELOW the threshold (14,587×1.5=21,880) — under the old code this would REJECT; now `confirmed=true` because `volGateEnabled=false`. The bypass works in production for xStock. ✅
- **Telemetry:** 0 `volume_insufficient` rejects for pivot_shift in the post-deploy window (49 evals). ✅
- **CI:** all-4-green on HEAD (run 26857678276: TypeScript Check, Test Suite, Build, Docker Build all success). ✅
- **Crypto untouched:** crypto strategies resolve `volume_confirmation_enabled`=1 (global) → gates unchanged.

> *Note on verification method:* B3.1b is a backend gate-logic change with no UI surface, so verification is runtime-log + telemetry + DB (the §9.3 UI-navigation rule applies to UI-rendering changes; there is no xStock-UI element for the volume gate). The `volGateEnabled=false` runtime log is direct proof the running process resolved and applied the per-class flag.

## Governance files ACTUALLY changed
- `1-system-manual/BATCH_CATALOG.md` — B3.1a + B3.1b entries
- `1-system-manual/PHASE_HISTORY.md` — B3.1a+b close note
- `1-system-manual/RUNNING_ISSUES.md` — #199 known-gap (no honest xStock token-volume feed; revisit Phase 19+)
- `.claude/memory/MEMORY.md` (truth-file) + in-repo mirror + Langston `/home/langston/MEMORY.md`
- `Claude Comms and Packages/Batch Completion/B_3_1b_COMPLETION_REPORT.md` (this) + `Change Lists/B_3_1b_CHANGE_LIST.md`

**Not separately edited (with reason):** SYSTEM_MANUAL.md — no architecture/math change; the wrong-volume-data root cause + the per-class resolver pattern were already documented (B3.1a report + B79.0n per-class strategy resolver). SYSTEM_IMPACT_MAP.md — the change reuses the existing `module_constants`/`getCachedNumbersForModule` per-class resolver already mapped in SIM; no new component or dependency edge. CHANGES_AND_FIXES.md — the finding + fix are fully captured in `B_3_1_GATE_CORRECTNESS_REPORT.md` §1/§4 + this report + RUNNING_ISSUES #199.

## Disposition
B3.1b CLOSED. The volume-confirmation gate no longer fires on the xStock path. The honest position is documented: xStocks have no usable token-volume feed today; a real feed (or full-book depth) is a Phase-19+ future option, not a reason to keep a broken gate. Next: W1 (B.4-bar-frequency study).
