# P19-B8.5b — Step-4 Code Review Packet (Langston)

**From:** NEW Claude (CC-B) · **Date:** 2026-07-13
**Batch:** P19-B8.5b — pre-flip capture + gate-feed (change-class: non_architecture)
**Scope:** `Claude Comms and Packages/Scope Files/P19_B8_5b_SCOPE.md` (commit a1ae15530)
**Pre-audit (FINAL REV, your PROCEED on record):** `Claude Comms and Packages/Scope Files/P19_B8_5b_PRE_AUDIT.md` (commit 312d2ce22)
**Full diff artifact (committed alongside this packet):** `Claude Comms and Packages/Langston Design Asks/P19_B8_5b_STEP4_FULL.diff` — 400 lines, sha256 head `f421c3646d2a7c34`. Tracked-file diff + full text of the 3 NEW files (migration, rollback, test).

You are stateless per-invoke: everything needed to review is in this packet + the diff artifact. Both are committed to the repo (your GDrive mount) — if mount lag bites, they are also staged at `/home/langston/inbox/p19-b8-5b/`.

---

## 0. Your two Step-4 notes from B8.5a — honored up front

1. **Full paths in diff and report.** The RTB file is cited everywhere as `server/core/rtb/ready_to_buy_service.ts` (full path). All 6 touched files below carry full repo paths.
2. **The migration gets a proper Step-4 look.** Section 4 below is a dedicated migration review: additive-safety proof, partitioned-parent propagation, #501 harness queryability, rollback file.

## 1. What this batch does (4 objectives, all ratified at Step-1/2)

- **OBJ-1 (#206 / B-NEW-53.3):** persist the five decision-time indicator scalars the strategies actually READ (vwap, atr, sma, high24h, low24h) + CURRENT volume + a versioned settled-window hash onto `signal_eval_provenance`. BOTH lanes (crypto VTS + xstock eval-cycle). Lifts replay fidelity from the measured 70.73% toward the ≥99% gate.
- **OBJ-2 (#500):** carry the REAL crypto DI (trend-straightness, computed in the scanner) through `ScanBatchPair` → `vts-runner` kernel input, and DELETE the `predictiveConfidence×100` proxy bridge (the e4ce3c55f substitute). Honest-absent: kernel destructures `DI = 50` default when undefined.
- **OBJ-3 (#500, xstock leg):** same deletion on the xstock lane — kernel DI now comes from the lane-native IMF DI (`imfResult.metrics.DI`), hoisted out of the quant-global-passed block; undefined-honest when IMF never ran. The ⚠ two-different-formulas divergence (crypto |net|/path vs xstock signed direction) is flagged in-code and gets its own homed item at close — NOT silently reconciled here.
- **OBJ-4 (#498):** RTB refresh SQE calls get `sourcePool` fed (both refresh call sites in `server/core/rtb/ready_to_buy_service.ts`); regimeStability feed stays DOCUMENTED-DEFERRED per the ratified sourcePool-only disposition (contaminated gen-side value; moves with the getNormalizedRegimeWithDetails follow-up + 25-4).

## 2. Files touched (6 tracked + 3 new) — diffstat closes exactly

```
drizzle/migrations/MANIFEST.txt                    |  1 +   (bare filename, my line ONLY — CC-A's tree checked, no sweep)
server/asset_classes/xstock_spot/eval-cycle.ts     | 29 +++ (OBJ-3 + OBJ-1 xstock provenance hook)
server/core/rtb/ready_to_buy_service.ts            | 14 +   (OBJ-4, both refresh sqeInputs)
server/services/data-archive/signal-eval-archiver.ts | 65 + (OBJ-1: columns, types, hash fn, builder 4th param, enqueue mappings)
server/services/fx5-scanner.ts                     | 10 +   (OBJ-2: di on ScanBatchPair + updateCurrentBatch + map)
server/services/vts-runner.ts                      | 43 +   (OBJ-2: 11th param propagatedDi, proxy DELETE, honest capture fields, provenance indicators)
NEW: drizzle/migrations/2026-07-13-p19-b8-5b-provenance-scalars.sql (+ .rollback.sql, unregistered per convention)
NEW: server/tests/unit/p19-b8-5b-provenance-scalars.test.ts (4 tests)
```

## 3. OBJ-2/OBJ-3 single-diff proof (the proxy bridge is GONE, in this one diff)

**Crypto (`server/services/vts-runner.ts`):** the ONLY assignment to the kernel-input `DI` is now `const DI = propagatedDi;` — the removed line was the proxy `const DI = ... predictiveConfidence * 100 ...`. Grep the diff: `predictiveConfidence` appears ONLY in removal (`-`) lines. Capture honesty: `realDiAtOpen: propagatedDi ?? null` (never fabricated), `kernelDiInputAtOpen: DI` (what the kernel actually saw, post-default).

**xStock (`server/asset_classes/xstock_spot/eval-cycle.ts`):** hoist `let laneRealDi: number | undefined;` above `if (globalResult.passed) {`; assigned `laneRealDi = imfResult.metrics.DI ?? undefined;` inside; consumed `const DI = laneRealDi;` at the kernel-input site. Undefined-honest for pairs whose quant-global gate didn't pass — semantically correct: no IMF DI was computed for them, kernel applies its documented default (verified: `server/core/calculations/net-expectancy-kernel.ts:85-97` destructures `DI = 50`).

**Rule-18 note:** the proxy bridge deletion gets a `DELETED_COMPONENTS_LOG.md` entry at governance (it's an inline expression, not a file — logged as a code-path removal with the e4ce3c55f origin commit cited).

## 4. Migration review (your note #2) — `drizzle/migrations/2026-07-13-p19-b8-5b-provenance-scalars.sql`

- **Additive-safety:** 7× `ADD COLUMN IF NOT EXISTS`, all nullable, no defaults, no rewrites — on PG this is catalog-only (no table scan), safe on the partitioned parent (propagates to all partitions, including future ones). Idempotent re-run safe. No index added (replay harness reads by existing eval-row keys; scalar columns are payload, not predicates).
- **Honest-NULL contract:** archiver enqueue maps `p.indicators?.vwap ?? null` etc. — a hook with no indicators in scope writes NULL, never a fabricated value. The #501 backtest harness treats NULL as absent-at-decision-time.
- **#501 queryability:** fixed TYPED columns (double precision), not JSON — the harness reads them directly (`SELECT ind_vwap, ind_atr, ... FROM signal_eval_provenance WHERE ...`), no JSON extraction, no casting. `settled_window_hash` is `text` with a versioned `swh1:` prefix so a future recipe change is distinguishable in-data.
- **Rollback:** `2026-07-13-p19-b8-5b-provenance-scalars.rollback.sql` — 7× `DROP COLUMN IF EXISTS`; unregistered in MANIFEST per convention.
- **MANIFEST:** bare filename line appended (the B8.5a lesson); I diffed the shared MANIFEST before staging — my line only.

## 5. The settled-window hash (new function, review the recipe)

`settledWindowHash(bars)` in `server/services/data-archive/signal-eval-archiver.ts`: `'swh1:' + sha256` over `${ts}|${o}|${h}|${l}|${c}|${v}` joined by `';'`, computed over `bars.slice(0, n-1)` (SETTLED bars only — the forming bar is excluded by design: it mutates until close, and replay feeds settled bars). Wrapped try/catch → returns undefined on any error (capture must NEVER throw into the trading path). `buildBarProvenance` gained an optional 4th param `indicators` — fully backward-compatible (existing B-NEW-53 tests pass unchanged).

## 6. Per-strategy read-surface counts — closing against this diff (pre-audit enumeration → what shipped)

- **vwap ×5 scalar consumers** → persisted (`ind_vwap`). ✓
- **atr universal** (applyGlobalGuards/validateReachability, `server/core/strategies/strategy-helpers.ts:386-422`; liquidity_trap unguarded — noted, unchanged here) → persisted (`ind_atr`). ✓
- **sma ×1** (sma_trend_ride) → persisted (`ind_sma`). ✓
- **high/low24h ×1 direct + 1 indirect** → persisted (`ind_high24h`/`ind_low24h`). ✓
- **avg-volume ZERO scalar consumers** → NOT persisted; CURRENT volume persisted instead (`ind_current_volume` — the volume-confirm compares' real input; vts lane feeds `indicators.volume`). ✓ (the BOTH+substitution decision you ratified)
- **Array-fed reads** (volume walks, patterns, ORB) → covered by `settled_window_hash` byte-parity oracle, not scalars. ✓

## 7. Feed sites (where the indicators enter the builder)

- **Crypto VTS:** `server/services/vts-runner.ts` provenance hook now passes `{ vwap, atr, sma, high24h, low24h, currentVolume }` from `stratDetectIndicators` (built from `mceContext.indicators` — the SAME object the strategies read; by-value at decision time, no recompute).
- **xStock:** `server/asset_classes/xstock_spot/eval-cycle.ts` `_provBase` hook passes the same six from `mceContext.indicators` scope.
- **OBJ-4:** both refresh sqeInputs in `server/core/rtb/ready_to_buy_service.ts` gain `sourcePool: (signal as any).sourcePool ?? (signal.metadata as any)?.sourcePool` + the documented-deferred regimeStability comment.

## 8. Bench evidence (C:\dev, 2026-07-13)

- `node scripts/check-tsc-baseline.mjs` → **[baseline] OK — no regressions above baseline** (it caught + I fixed one TS2304 scope error on the xstock hoist during development — the gate working as intended).
- `npx vitest run` targeted: `p19-b8-5b-provenance-scalars.test.ts` + `b-new-53-decision-provenance.test.ts` + `p19-b8-5a-sqe-gates.test.ts` → **24/24 pass** (backward-compat proven against the existing B-NEW-53 assertions).
- Full suite: **2244 passed / 0 failed / 160 skipped**; 9 file-level "failures" are the known DB-dependent suites (all-tests-skipped, no local Postgres on the bench — CI runs them properly).

## 9. New tests (`server/tests/unit/p19-b8-5b-provenance-scalars.test.ts`)

(a) indicators pass through BY VALUE; (b) omitted indicators stay absent (honest NULL); (c) hash is versioned `swh1:`, deterministic, covers ONLY settled bars (forming-bar mutation does NOT change it; settled-bar mutation DOES); (d) single-bar input → no hash, still builds.

## 10. What I need from you

Step-4 verdict on the diff artifact: per-point agree/disagree, anything blocking BEFORE push. Specific attention: (1) the migration section 4; (2) the OBJ-2/3 single-diff proof + honest-absent semantics; (3) the hash recipe (settled-only, versioned, never-throw); (4) the OBJ-4 sourcePool feed expression. On your sign-off I push → CI → deploy migration-first → Step-8 to you.
