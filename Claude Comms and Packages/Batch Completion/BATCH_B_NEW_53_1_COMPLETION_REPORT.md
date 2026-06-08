# B-NEW-53.1 — COMPLETION REPORT — admitted-`features` read from the open-trade SSOT (#207)

**Date:** 2026-06-08. **Status: DEPLOYED + LIVE-CONFIRMED — CLOSED.**
**Deploy commit:** `53a208880`. **CI:** run `27112656601` — all 4 jobs GREEN (Test Suite, TypeScript Check, Build, Docker Build). **Deployed staging:** HTTP 200, clean boot, 2026-06-08T02:33Z. **Langston Step-4:** APPROVE-TO-PUSH (choice c).

## What this batch does (one paragraph)
Root-cause fast-follow to RUNNING_ISSUES #207 — the latent B70.2 bug surfaced during the B-NEW-53 crypto-enable. The admitted-row `features` block in `vts-runner.ts` read 13 at-entry fields off `tradeRecord` (the lean `Phase10TradeRecord`, which declares `entry` not `entryPrice` and never carries the other 12), so every crypto admitted row in `signal_eval_archive.features` archived `undefined` for those fields since 2026-05-05. The fix repoints those 13 reads at the in-scope `persistedTrade` open-trade SSOT (`OpenVirtualTrade`, already fetched at the hook) — the record that genuinely computes + persists each value at trade-open — and declares the one missing field (`expectedEdge?`) on the interface. Telemetry-only; no trade/gate/decision change; no migration; active trading OFF.

## Scope objectives (checklist)
1. **All 13 fields populate on crypto admitted rows — YES.** Live-confirmed: the first post-deploy admitted row (ESPORTS/USD `strong_bull_trend`, 02:38Z) populated all 13 at 100% (entryPrice/target/stopLoss/quantity/expectedEdge/atrAtOpen/pairIdHash/regimeConfidenceRaw/macroModifierValue/phase/phaseAgeSeconds/strategyPhaseWeight + regimeConfidenceModulated), vs the deterministic 0/145 blank before. A broader re-confirm alert (2026-06-08T14:00Z) re-checks at scale.
2. **Values equal the live trade-open + sane — YES.** Sample: entry 0.0826, stop 0.0609, target 0.1260 (stop < entry < target, correct for a long); phase `LATE` (valid enum); cohort `0` (valid; not re-rolled — read from the record, `assignCohortHash` not re-invoked).
3. **No regression to the already-correct fields — YES.** Only the 13 broken reads + 1 interface line changed; the scoring/classification/friction block (on `tradeRecord`, correctly set) is untouched.
4. **No new tsc baseline errors; suite green — YES.** Bench: `vts-runner.ts` TS2339 **25 → 8** (the broken reads were real type errors absorbed by the baseline; the typed `persistedTrade` reads + the `expectedEdge?` declaration resolve them), total 494→476, "no regressions above baseline"; vitest no new failures (11 pre-existing failing files = the known clean-head set).
5. **xStock parallel gap decided + recorded — YES.** DEFERRED to B-NEW-53.2 (RUNNING_ISSUES #208): the xStock admitted archive hook (`eval-cycle.ts:703`) fires BEFORE `registerOpenVtsTrade` (L727) → no in-scope SSOT record; `pairIdHash`/`strategyPhaseWeight` absent on xStock → fold-in is re-derivation, not the pure-read bar. Not a replay blocker (B-NEW-53 provenance covers the replay-critical inputs).
6. **Telemetry-only / safety — YES.** Diff confined to the archive `features`/`modulators` construction + one optional interface field; no migration; inside the existing best-effort try/catch; active trading OFF.

## Langston gates
- **Step-1:** full consensus — read-from-`openTrade` ratified over extend-the-type; `expectedEdge` 3-(a) (declare on interface); xStock DEFER; no-backfill confirmed (condition: document the known-NULL window).
- **Step-2:** pre-audit delivered his 3 mandated items (per-field source confirmation; xStock source-availability → DEFER; SIM consult → no migration, realizes documented behavior).
- **Step-4 code review:** **APPROVE-TO-PUSH (choice c).** Independently verified: `persistedTrade` in scope (no fresh lookup); `expectedEdge` genuinely populated at runtime (literal L1486/1595) so the new interface field isn't null-on-arrival; closed interface (no index sig) so the tsc gate is real; **`?? null` not `?? undefined`** is correct for JSONB — `undefined` drops the key under `JSON.stringify`, `null` preserves it as explicitly-empty for the post-launch Trend-Mining column-presence queries.

## ⚠️ Known-NULL window (Langston Ask-3 condition — Phase-25 must exclude)
Crypto admitted rows in `signal_eval_archive.features` are hollow for these 13 fields across **2026-05-05 → 2026-06-08 (this deploy)**. Phase-25 calibration queries reading at-entry economics from admitted-row `features` MUST exclude/handle this window — those NULLs are a capture gap, not data. Documented in `CHANGES_AND_FIXES.md` + RUNNING_ISSUES #207. **No backfill** — the realized trades carry their own `vts_open_trades` SSOT; re-deriving open-time MCE context would be silently-wrong approximation.

## Files changed
**Modified:** `server/services/vts-runner.ts` only (the `OpenVirtualTrade` interface +`expectedEdge?` line; the admitted-features/modulators block — 13 reads repointed to `persistedTrade?.<field> ?? null`). **No migration.**

## Governance files updated
- `1-system-manual/`: RUNNING_ISSUES (#207 RESOLVED + NEW #208 xStock-defer + NEW #209 baseline-ratchet-on-Linux), CHANGES_AND_FIXES (closure + known-NULL window), BATCH_CATALOG (B-NEW-53.1 row), PHASE_HISTORY (B-NEW-53.1 entry), SYSTEM_IMPACT_MAP (B70.2 line annotated — behavior now realized; xStock gap noted).
- `Claude Comms and Packages/`: `Scope Files/B_NEW_53_1_SCOPE.md`, `B_NEW_53_1_PRE_AUDIT.md`; `Change Lists/B_NEW_53_1_STEP4_CHANGE_LIST.md`; this completion report.
- MEMORY.md (truth + in-repo mirror). **Langston MEMORY (§10.b) sync pending** (bundle with the B-NEW-53 close block, when his session idle).

## Follow-ups raised
- **#208 → B-NEW-53.2:** add an at-entry-context block to the xStock admitted archive hook (own pre-audit: reorder/hoist vs the 2 absent fields).
- **#209:** ratchet `.tsc-baseline.json` down to lock the regression guard — regenerate on Linux/staging (not the Windows bench) to avoid a ±1 cross-platform skew red-CI.

## Verification evidence
- Bench: tsc-baseline GREEN (25→8 in vts-runner, no regressions); vitest no new failures.
- CI: run `27112656601` all-4-green on `53a208880`.
- Staging: HTTP 200, clean boot, no errors.
- **Live-data (the Step-7 gate Langston chose):** post-deploy crypto admitted row populated all 13 fields 100%, sane values (ESPORTS/USD). Broader re-confirm alert 2026-06-08T14:00Z.
