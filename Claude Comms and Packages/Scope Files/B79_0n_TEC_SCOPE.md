# B79.0n.TEC — Trailing-Exit-Controller HARD-FAIL coverage extension + evaluator-path consolidation

**Status:** Step 1 draft, awaiting Langston ACK.
**Sub-batch:** #9 of 18 in B79.0n umbrella v4 arc. Parallel-eligible with SCORING (#8).
**Date:** 2026-05-25 evening (overnight autonomous run per Kyle directive).
**Author:** Claude Code.

---

## §-1 Prior arc & framing

The B79.TEC batch (2026-05-08) introduced the per-asset-class TEC config cache: `tecConfigCache: Map<AssetClass, TrailingExitConfig>`, `primeTECConfig()` boot warmup, `refreshTECConfigForClass(assetClass)`, HARD-FAIL via `hasExplicitAssetClassRow`, `CONFIG_MAX_STALENESS_MS = 5min` ceiling, and B-NEW-40's `Promise.race` 45s timeout fence on background refreshes. **That batch deliberately scoped HARD-FAIL coverage to one key: `break_even_enabled`**, with explicit code comment at `trailing-exit-controller.ts:358-359`: *"other keys may resolve via wildcard fallback inside getModuleConstants (intentional — see RUNNING_ISSUES #85 for the B79.x follow-up to extend HARD-FAIL coverage)."*

**This batch is that B79.x follow-up.** Per umbrella v4 row 9: "Has per-class config already (B79.TEC seeded BE/target-lock/trail-distance per class earlier per Langston D-4 of B79.0m.b). Pre-audit verifies whether TEC's evaluator + close-hook + per-class config resolution is consistent + audits for any silent crypto-fallback in TEC internals."

Concretely, the silent-fallback patterns in TEC internals are:
1. **`refreshTECConfigForClass`** asserts `hasExplicitAssetClassRow` ONLY for `break_even_enabled`. The other 10 TEC keys silently fall back to the `(*, *, *, *)` wildcard inside `getModuleConstants`. If wildcard is missing too, `pick(key, TEC_DEFAULTS.x)` falls back to a code-side default — a SECOND silent-fallback layer.
2. **`tec-evaluator.ts:resolveTECConstants`** is a SEPARATE async DB call resolving 3 TEC R-multiplier knobs (`break_even_trigger_r` / `target_lock_r` / `trail_distance_atr_multiplier`) — duplicating work the per-class cache already did at boot, AND silently falling back to `DEFAULTS` on any DB error (line 222-227 of tec-evaluator.ts). This is structurally inconsistent with the trailing-exit-controller HARD-FAIL discipline.

xstock active-trading flip (sub-batch 18 of umbrella v4) DEPENDS on this batch closing those silent-fallback paths. Otherwise a hung pg refresh OR a missing per-class row could route TEC decisions through crypto-tuned defaults during xstock live trading.

---

## §0 Live DB state (probed 2026-05-25 evening via staging psql)

```
 trailing_exit | *           | break_even_enabled                    | false   ← wildcard still present
 trailing_exit | *           | break_even_trigger_r                  | 1.0     ← wildcard still present
 trailing_exit | *           | moonbag_cap_mode                      | "reserved_slots" ← wildcard-only
 trailing_exit | *           | moonbag_max_duration_ms               | 14400000         ← wildcard-only
 trailing_exit | *           | moonbag_qualifying_source_pools       | {"vwap_pullback": ["quant-strong_trend"]}  ← wildcard-only
 trailing_exit | *           | moonbag_qualifying_strategies         | []                ← wildcard-only (DB), code DEFAULTS has 4-strategy list
 trailing_exit | *           | moonbag_reserved_slots                | 1                 ← wildcard-only
 trailing_exit | *           | persistence_debounce_ms               | 5000              ← wildcard-only
 trailing_exit | *           | rung_floor_slippage_buffer_multiplier | 1.0
 trailing_exit | *           | target_lock_r                         | 1.5
 trailing_exit | *           | trail_distance_atr_multiplier         | 1.0
 trailing_exit | crypto_perp | break_even_enabled                    | false             ← only BE for perp classes
 trailing_exit | crypto_spot | break_even_enabled                    | false             ← variant K winner
 trailing_exit | crypto_spot | break_even_trigger_r                  | 1.0
 trailing_exit | crypto_spot | rung_floor_slippage_buffer_multiplier | 1.0
 trailing_exit | crypto_spot | target_lock_r                         | 1.5
 trailing_exit | crypto_spot | trail_distance_atr_multiplier         | 1.0
 trailing_exit | xstock_perp | break_even_enabled                    | false
 trailing_exit | xstock_spot | break_even_enabled                    | false   ← drift: code comment says TRUE
 trailing_exit | xstock_spot | break_even_trigger_r                  | 1.0
 trailing_exit | xstock_spot | rung_floor_slippage_buffer_multiplier | 1.0
 trailing_exit | xstock_spot | target_lock_r                         | 1.5
 trailing_exit | xstock_spot | trail_distance_atr_multiplier         | 0.8     ← B79.0m.b xstock-specific
```

**Gaps:**
- **11 TEC keys but only `break_even_enabled` is HARD-FAIL covered.** The other 10 (`break_even_trigger_r`, `target_lock_r`, `trail_distance_atr_multiplier`, `persistence_debounce_ms`, `moonbag_qualifying_strategies`, `moonbag_qualifying_source_pools`, `moonbag_max_duration_ms`, `moonbag_cap_mode`, `moonbag_reserved_slots`, `rung_floor_slippage_buffer_multiplier`) silently wildcard-fallback.
- **6 keys are wildcard-only (no per-class rows): moonbag suite (5 keys) + persistence_debounce_ms.** Per-class operator flip is impossible without a row to UPDATE.
- **crypto_perp + xstock_perp have ONLY `break_even_enabled`** — every other TEC knob wildcard-falls-back for these classes. If perp gets activated, TEC decisions inherit crypto_spot's `trail_distance_atr_multiplier=1.0` etc. silently.
- **xstock_spot break_even_enabled = false in DB, code comment (`trailing-exit-controller.ts:107`) says TRUE.** Either migration `2026-05-11-b79-0m-b-xstock-tec-enable.sql` was rolled back at some point, OR was never applied, OR was manually flipped. Doc-vs-DB drift requires diagnosis. **Decision requested:** D-1.

---

## §1 Scope objectives (numbered, verification-criterion each)

### A. Per-class row seeding (DB)

1. **OBJ-1 (Migration 1):** Seed explicit `crypto_perp` + `xstock_perp` rows for the 4 hot TEC keys currently per-class for spot only: `break_even_trigger_r=1.0`, `target_lock_r=1.5`, `trail_distance_atr_multiplier=1.0`, `rung_floor_slippage_buffer_multiplier=1.0`. Day-1 defaults match wildcard (no behavior change). 8 new rows. Idempotent `INSERT … ON CONFLICT DO NOTHING`.

2. **OBJ-2 (Migration 1):** Seed explicit per-class rows for the 6 currently-wildcard-only keys across all 4 active classes: `persistence_debounce_ms=5000`, `moonbag_cap_mode="reserved_slots"`, `moonbag_max_duration_ms=14400000`, `moonbag_reserved_slots=1`, `moonbag_qualifying_strategies=["strong_bull_trend","sma_trend_ride","vwap_pullback","breakout"]` (note: live DB wildcard is currently `[]` — CODE DEFAULTS has the 4-strategy list; verify which is intended truth), `moonbag_qualifying_source_pools={"vwap_pullback":["quant-strong_trend"]}`. 24 new rows.

3. **OBJ-3 (Migration 2):** EXISTS-gated wildcard retirement for all 11 TEC keys — same two-step pattern as B79.TEC / B79.TEC.b / B79.0a / B79.0b. Two migrations sequenced ONE deploy. Verification: `SELECT COUNT(*) FROM module_constants WHERE module_name='trailing_exit' AND asset_class='*'` returns 0.

### B. Code HARD-FAIL extension (trailing-exit-controller.ts)

4. **OBJ-4:** Extend `refreshTECConfigForClass(assetClass)` to call `hasExplicitAssetClassRow('trailing_exit', assetClass, <key>)` for ALL 11 TEC keys, not just `break_even_enabled`. If any key is missing per-class row, throw `[TEC_MISSING_PER_CLASS_ROW]` with the same descriptive format as the existing `break_even_enabled` check. Caller (primeTECConfig) aggregates and HARD-FAILs the boot if ANY class is missing ANY key.

5. **OBJ-5:** Remove the `pick(key, TEC_DEFAULTS.x)` silent-fallback inside `refreshTECConfigForClass`. Each key reads `getCachedNumberRequired` (or JSON-typed equivalent) and throws on missing — same pattern as `sqe_config`'s `getCachedNumberRequired` discipline. The `TEC_DEFAULTS` const remains in code as TYPE TEMPLATE only — no runtime fallback path consumes it. Add comment-block flagging this is type-only.

### C. tec-evaluator silent-fallback removal (tec-evaluator.ts)

6. **OBJ-6:** Replace `resolveTECConstants(context)` async DB-call with synchronous `resolveTECConfig(context.assetClass)` (per-class cache lookup). The 3 R-multiplier knobs (`breakEvenTriggerR`, `targetLockR`, `trailDistanceAtrMultiplier`) are READ from the already-cached snapshot, NOT re-resolved. Eliminates the duplicate DB round-trip + the silent `catch → DEFAULTS` fallback (lines 222-227). `evaluateTECExit` signature stays the same; internal path changes.

7. **OBJ-7:** Re-export `resolveTECConstants` (line 459) replaced with a thin sync wrapper: `export function resolveTECConstants(context: TECExitContext): TECExitDecision['resolvedConstants'] { return pickKeys(resolveTECConfig(context.assetClass)) }`. Diagnostic + admin-UI + test callers continue working; signature returns same shape (no `Promise<>` wrap needed).

### D. Doc-vs-DB drift fix (xstock_spot break_even_enabled)

8. **OBJ-8 (pending D-1):** Reconcile `trailing-exit-controller.ts:107` comment ("xstock_spot → break_even_enabled = TRUE (Kyle 2026-05-13: BE-protect + trailing exits are deliberately ENABLED for xstocks)") with live DB row `xstock_spot.break_even_enabled = false`. Two options:
   - **A: Doc was correct, DB drifted.** Re-apply migration `2026-05-11-b79-0m-b-xstock-tec-enable.sql` (UPDATE xstock_spot.break_even_enabled to true). Confirm intent with Kyle.
   - **B: DB is correct, comment is stale.** Update the comment block to reflect false-default + add note about when it would flip.
   - **Decision requested:** D-1 (Langston / Kyle, depending on source-of-truth) — A or B?

### E. Per-batch invariants (CLAUDE.md §5)

9. **OBJ-9:** All 4 GitHub Actions checks GREEN at head commit per §5 #19.

10. **OBJ-10:** No new `as any` / `@ts-ignore` / non-null `!` in production files. `@ts-expect-error` confined to type-lock harness.

11. **OBJ-11:** Local tsc baseline `494` unchanged. Local vitest passes all new + existing tests.

12. **OBJ-12:** Crypto regression check vs pre-deploy 24h baseline: VTS trade rate, paper trade close rate, BE-latch fire rate, target-lock fire rate within ±5% per CLAUDE.md §5 #13 rolling-window discipline.

### F. Phase 24 standing rule (CLAUDE.md §3.3)

13. **OBJ-13:** Completion report includes "Asset-class onboarding workflow learnings" 4-section block + concrete edits to `ASSET_CLASS_ONBOARDING_WORKFLOW.md` — specifically new §4.16 entry codifying the TEC HARD-FAIL extension + evaluator-consolidation pattern.

### G. Step 10 governance (all 8 docs ACTUALLY edited)

14. **OBJ-14:** `BATCH_CATALOG.md` + `PHASE_HISTORY.md` + `SIM` (new "Recent Additions (B79.0n.TEC)" section) + `SYSTEM_MANUAL.md` (HARD-FAIL doctrine extension) + `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.16 + `MULTI_ASSET_VTS_EXPANSION_PLAN.md` + `CHANGES_AND_FIXES.md` + `RUNNING_ISSUES.md` (close out #85 deferred-from-B79.TEC; close drift D-1 fix).

---

## §2 F-1 / F-2 lever inventory

| Lever | Current state | Recommended Day-1 | Rationale |
|---|---|---|---|
| `break_even_enabled` | Per-class HARD-FAIL covered | **F-2** | Already done. xstock TBD pending D-1 disposition. |
| `break_even_trigger_r` | Per-class (crypto/xstock spot = 1.0) | **F-1 (identical 1.0)** | R-based; dimensionless. |
| `target_lock_r` | Per-class (crypto/xstock spot = 1.5) | **F-1 (identical 1.5)** | R-based; dimensionless. |
| `trail_distance_atr_multiplier` | Per-class (crypto=1.0, xstock=0.8) | **F-2 (xstock=0.8 / crypto=1.0)** | Equity ATR ~half crypto's per B79.0m.b note. |
| `rung_floor_slippage_buffer_multiplier` | Per-class (both 1.0) | **F-1 (identical 1.0)** | Same B65.4.1 floor placement geometry. |
| `persistence_debounce_ms` | Wildcard-only 5000 | **F-1 (identical 5000 all classes)** | I/O cadence is process-level, not class-level. |
| `moonbag_qualifying_strategies` | Wildcard `[]` (drift) vs code DEFAULTS 4-list | **F-2 (per-class strategy lists)** | xstock has different strategy whitelist per `isStrategyEnabledForAssetClass`. xstock=6 strategies enabled; crypto=19. Moonbag-qualifying subset must respect that. |
| `moonbag_qualifying_source_pools` | Wildcard-only | **F-1 (identical default)** | sourcePool-keyed; class-orthogonal. |
| `moonbag_max_duration_ms` | Wildcard-only 14400000 (4h) | **F-1 (identical 4h all classes) initially; later F-2 if evidence** | 4h is a friction-tolerance heuristic; xstock weekend-suspended state may need different cap (B79 weekend-shutdown caveat). |
| `moonbag_cap_mode` | Wildcard-only "reserved_slots" | **F-1 (identical "reserved_slots" all classes)** | Concurrency cap is mode-keyed not class-keyed. |
| `moonbag_reserved_slots` | Wildcard-only 1 | **F-1 (identical 1 all classes) initially** | Same. |

D-2 below picks up the moonbag_qualifying_strategies drift question.

---

## §3 Hostile-scenario sim (red-team)

**Q1:** What if Langston argues "HARD-FAIL on persistence_debounce_ms is overkill; it's a tunable, not a kill-switch"?
**A:** Disagree gently. NO PATCHES discipline (CLAUDE.md §5 #15) makes the structural answer: ALL TEC keys are operator-flip surfaces and should fail-hard on missing per-class row. Adopting partial HARD-FAIL means future onboarding lists "remember to seed these N keys per-class" forever — anti-NO-PATCHES. Better: HARD-FAIL everything, seed everything, document the pattern.

**Q2:** What if `resolveTECConstants → resolveTECConfig` consolidation breaks `evaluateTECExit` async signature?
**A:** It doesn't — `evaluateTECExit` is and remains async (because of the discontinuity detector + `tecShouldClose` paths). The internal `resolveTECConstants` call goes from `await` → sync `resolveTECConfig` lookup, which is a net latency improvement (one DB round-trip removed per exit-cycle).

**Q3:** What if cache miss occurs on a class that primeTECConfig didn't iterate (e.g. ACTIVE_ASSET_CLASSES drift)?
**A:** `resolveTECConfig` already throws `[TEC_CACHE_MISS_FATAL]` in that case. The caller (`tec-evaluator`) would propagate the throw. No silent fallback path created.

**Q4:** What if the doc-vs-DB drift (D-1) was Kyle's intentional manual override at incident time?
**A:** Possible. The fix is option B (update comment, not DB). Kyle's call. Either way the structural issue is the DOC SAID one thing while DB SAID another — that's a Tier-1 governance failure per CLAUDE.md §9 "buried implemented logic is a governance failure".

**Q5:** What if Migration 2 (wildcard retire) fails because a Layer-2 caller still consults wildcard rows directly via `getModuleConstants`?
**A:** Pre-audit Step 2 grep for `getModuleConstants.*trailing_exit` will surface all consumers. If any reads with `assetClass='*'`, the migration is deferred until that caller is fixed. EXISTS-gated DELETE ensures we don't break runtime — the gate fails fast.

---

## §4 Test plan

1. **`b79-0n-tec-hardfail-coverage.test.ts`** — verify `refreshTECConfigForClass` throws for EACH of the 11 TEC keys when the per-class row is missing. 11 sub-tests, one per key.
2. **`b79-0n-tec-evaluator-consolidation.test.ts`** — verify `tec-evaluator.resolveTECConstants` returns SAME values as `trailing-exit-controller.resolveTECConfig` for the same `assetClass`. Spy on `getModuleConstants` to confirm zero DB calls during steady-state evaluator path.
3. **`b79-0n-tec-perclass-moonbag.test.ts`** — verify `moonbag_qualifying_strategies` resolves per-class (crypto=4-list, xstock=different list per D-2).
4. **`b79-0n-tec-required-assetclass.test.ts`** — type-lock tests: `@ts-expect-error` on `TECExitInput` omitting `assetClass`, on `PositionUpdate`, on `isMoonbagQualifier`, etc. (already covered partially by B79.TEC tests; extend.)
5. **Update existing `b65-tec-parity.test.ts`** — confirm parity scenarios still pass post-evaluator consolidation.
6. **Update existing `b-new-40-tec-refresh-hang.test.ts`** — confirm timeout fence still fires correctly with extended HARD-FAIL coverage.

---

## §5 Implementation chunks (preview — final shape pending Langston Step 1 ACK)

| Chunk | Files | Purpose |
|---|---|---|
| 1 | `drizzle/migrations/2026-05-26-b79-0n-tec-perclass-seed.sql` + rollback + `drizzle/migrations/MANIFEST.txt` | Migration 1: 32 new rows (8 hot keys + 24 moonbag/persistence) across 4 active classes. |
| 2 | `drizzle/migrations/2026-05-26-b79-0n-tec-wildcard-retire.sql` + rollback + MANIFEST | Migration 2: EXISTS-gated wildcard delete for all 11 TEC keys. |
| 3 | `server/services/trailing-exit-controller.ts` | OBJ-4 (extend HARD-FAIL coverage 1 → 11 keys), OBJ-5 (remove `pick → DEFAULTS` silent fallback). |
| 4 | `server/services/tec-evaluator.ts` | OBJ-6 (consolidate resolveTECConstants → resolveTECConfig cache hit), OBJ-7 (wrapper for diagnostics). |
| 5 | `server/services/trailing-exit-controller.ts` line 107 OR migration re-apply | OBJ-8 (D-1 disposition: comment update OR re-UPDATE xstock_spot.break_even_enabled). |
| 6 | `server/tests/unit/b79-0n-tec-*.test.ts` (3-4 new) + existing updates | OBJ-10 + OBJ-12 + regression coverage. |
| 7 | Local `npx tsc --noEmit` + `npx vitest run` + `gh run watch` (CI all-4-green) | OBJ-9 + OBJ-11. |

---

## §6 Open clarifications for Langston (D-decisions)

- **D-1:** Doc-vs-DB drift for xstock_spot.break_even_enabled — Option A (re-apply migration setting it true) or Option B (update comment to reflect false-as-current)?
- **D-2:** `moonbag_qualifying_strategies` per-class — confirm F-2 (xstock subset of crypto's 4-strategy list, scoped to xstock-enabled strategies only) is the right Day-1, OR F-1 (xstock gets the same 4-strategy list and the SQE strategy whitelist gate filters the disabled ones)?
- **D-3:** OK consolidating tec-evaluator.resolveTECConstants into trailing-exit-controller.resolveTECConfig (removes the duplicate async DB call), OR keep them separate for blast-radius isolation?
- **D-4:** OK shipping Migration 1 + Migration 2 in the SAME deploy (atomic per-batch close) OR split into B79.0n.TEC + B79.0n.TEC.b two-step like B79.TEC / B79.TEC.b?

---

## §7 Out of scope

- SQE / FinalScore composition surface (separate batch #8, parallel-eligible).
- xstock active-trading flip (sub-batch 18 of umbrella v4).
- `outcome-feedback-store.updateEma` close-hook integration (already addressed in B79.0n.CONFIDENCE-CHAIN — R-10 mitigation; this batch may CITE that work but doesn't modify it).
- Trade-mode persistence layer (B65.4.2 + B80 surface; this batch reads, doesn't modify).
- B-NEW-40 refresh-timeout-fence rework (already complete; this batch preserves the fence).

---

## §8 Workflow disposition

After Step 1 ACK from Langston with D-1..D-4 dispositions, Step 2 pre-audit goes DEEPER on:
- All consumers of `getModuleConstants('trailing_exit', ...)` (compile-driven probe to confirm no caller reads wildcard rows directly).
- All consumers of `resolveTECConfig` + `getResolvedTECConfig` (already known: tec-evaluator, vts-runner, paper-execution-engine, trailing-exit-controller internals, routes diagnostic).
- All callers of `evaluateTECExit` (vts-runner, paper-execution-engine) — confirm caller-side `context.assetClass` threading is identical to B79.TEC's establishment.

Standard close: Step 4 dispatch / Step 5 push / Step 6 deploy / Steps 7-8 verification / Step 10 governance (ALL 8 docs ACTUALLY edited) / Step 11 completion report.

Sequencing with B79.0n.SCORING: separate batches, separate commits, separate CI confirmations per CLAUDE.md §5 #19. No file overlap expected (SCORING touches `core/filters/` + `core/utils/` + `config/` + `core/rtb/`; TEC touches `services/trailing-exit-controller.ts` + `services/tec-evaluator.ts`). Pre-audit Step 2 will confirm.

---

*Reply ACK / REVISIONS / D-1..D-4 dispositions. If [SILENT], CC proceeds with: D-1=Option B (comment update — DB is source of truth); D-2=F-2 (per-class strategy lists scoped to enabled strategies); D-3=consolidate; D-4=single batch.*
