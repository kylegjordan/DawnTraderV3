# P19-B8.5j — SCOPE
## The maximum-hold master switch: THREE flags (paper / live / VTS)

change-class: architecture
**Issue:** #562-family (new) · **Owner:** CC-B · **Reviewer:** Langston
**Kyle directive 2026-07-24 (verbatim intent):** "right now, I don't want there to be a maximum hold until
we all have a chance to sit around, debate it… just turn that functionality off altogether." + "create a
switch for active trading in paper mode and one for live mode, and one switch for VTS."

---

## 🚨 URGENCY
A **crypto** paper position (VVV/USD) is ~8h from a 24h force-close as of scoping; it carries a stamped
`maxHoldingMs=86400000`. The switch gates **enforcement** (not stamping), so deploying it OFF protects
every already-open position immediately, including VVV. This is why the batch moves now.

## THE PROBLEM (measured, not asserted)
- Four xStock positions closed `max_holding_period` at **exactly 24.00h** (to the second). All
  `vwap_pullback`; 3 of 4 at a loss (−3.7%, −3.3%, −2.0%).
- The 24h value is a **wildcard** `module_constants` row (`strategy.vwap_pullback.max_holding_ms=86400000`,
  `asset_class='*'`), plus a hard-coded `DEFAULT_MAX_HOLDING_MS = 24h` in `strategy-engine.ts`. The code
  comment states the 24h was chosen to preserve the crypto-era "24 bars × 60-min". **xStocks run 15-min
  bars ⇒ 24 bars = 6h, not 24h.** There is NO xstock-specific row — xStocks inherit the crypto number.
- **It was never crypto-specific.** Open positions opened *after* the #550 carry-fix carry the stamp
  regardless of class — VVV/USD (crypto) and USD/CHF (crypto) both carry `86400000`. The only reason MU/TSM
  (open 6.8 days) are not closing is that they predate the carry-fix and carry NO stamp.
- **Why it started now:** P19-B8.5f (#550) repaired the metadata-rebuild drop so `maxHoldingMs` finally
  reaches open positions. The 24h exit had **never once fired** in `closed_trades` history before that.
  Repairing the carry made a latent, mis-calibrated, undebated rule go live. **Rule-24 outcome (2):
  working-as-designed-but-UNADDRESSED — a policy decision Kyle owns, not a defect to silently re-tune.**

## OBJECTIVES

- **OBJ-1 — THREE DB-governed boolean switches**, in a new `module_constants` module `max_hold_switch`
  (`asset_class='*'`): `enabled_paper`, `enabled_live`, `enabled_vts`. **All seed FALSE.**
- **OBJ-2 — Gate the ACTIVE enforcement** at `active-execution-engine.ts:1652` (`checkExitConditions`,
  a private async method with `this.mode ∈ {paper,live}`): only enter the `max_holding_period` branch when
  the mode-resolved flag is TRUE (`this.mode==='live'` → `enabled_live`, else `enabled_paper`). Seeded
  FALSE ⇒ the branch never fires ⇒ no time-based active close.
- **OBJ-3 — Gate the VTS enforcement AT THE CALL SITE, not inside the evaluator.** The VTS timeout fires
  in `evaluateTECExit` (`tec-evaluator.ts:228` `stale_timeout` / `:242` `timeout`) purely off the injected
  `maxHoldMs`. So gate at `vts-runner.ts:2969` (real) and `:3694` (shadow) by passing
  `maxHoldMs: enabled_vts ? MAX_HOLD_MS : Infinity` (real) / `enabled_vts ? SHADOW_MAX_HOLD_MS : Infinity`
  (shadow). **This reuses the EXACT idiom the active path already uses (`active-execution-engine.ts:1523`
  `maxHoldMs: Infinity`) and leaves `evaluateTECExit` UNCHANGED** — so every tec-evaluator test that calls
  it with an explicit `maxHoldMs` is unaffected. Blast radius shrinks to two lines. **⚠️ CONSEQUENCE TO SURFACE TO KYLE (OBJ-3a): the VTS "max hold" is a ZOMBIE-CLEANUP /
  STALE-SIM SAFETY VALVE, not a 24h trade rule. Seeding `enabled_vts=false` also disables that cleanup —
  VTS sims could then run unbounded.** Kyle asked for a VTS switch and to turn it off; this batch honours
  that literally (seed false) but the completion path MUST make the zombie-valve consequence explicit so
  Kyle can choose to seed `enabled_vts=true` instead. This is a Kyle decision, surfaced not assumed.
- **OBJ-4 — FAIL-SAFE semantics, documented.** `enabled = (resolved === true)`. An absent / cold-cache
  read is treated as **OFF** (do not enforce). This is the NON-DESTRUCTIVE direction (a force-close is
  irreversible; not-closing is not), and it is the honest reading of a boolean enable-switch (unset =
  not-enabled). **This deliberately DIFFERS from TEC `requireKey` fail-closed-hard-fail** — there, absent
  means refuse-to-boot; here, "off" IS the safe state, so absent→off is correct, not a silent-fallback
  violation of rule 11. Documented at both sites + in System Manual.
- **OBJ-5 — Warmup.** Add `max_hold_switch` to `b72-warmup.ts PREFETCH_MODULES` (the B8.5e lesson: a
  `module_constants` key is not usable by a sync caller until its module is prefetched). Boot assertion
  is NOT required (fail-safe is off, not refuse-to-boot).
- **OBJ-6 — Migration** (forward + rollback + MANIFEST): 3 rows `'false'::jsonb`, ON CONFLICT DO UPDATE.

## NON-GOALS
- **NOT** deciding what any max-hold value should be. That is the deferred debate. This batch only makes
  the enforcement switchable and ships it OFF.
- **NOT** touching the STAMPING (`stampMaxHoldingMs`) — gating enforcement is what protects already-open
  positions. Stamping stays; it is inert while the switch is off.
- **NOT** re-tuning the 24h value or adding an xStock row (that is the debate's output, not this batch).

## VERIFICATION
- tsc baseline clean; FULL vitest A/B (guard against the B8.5i "seeded 1 of N test fixtures" trap — census
  every test that exercises `checkExitConditions` or `evaluateTECExit`).
- Deploy migration-FIRST, verify all 3 rows present, then build+restart; confirm no `max_holding_period`
  close fires post-deploy on any open position (VVV specifically — watch past its 24h mark).
- §9.3 UI: Open Trades tab renders; no new close appears for the time-limit reason.

## GOVERNANCE (architecture class ⇒ full set)
BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, RUNNING_ISSUES (file the max-hold policy-debate item with a
named home), SYSTEM_IMPACT_MAP (new module + two gated sites), **SYSTEM_MANUAL (the switch + fail-safe +
the VTS zombie-valve consequence)**, completion report, **this scope + a separate pre_audit doc** (B8.5i
lesson: the checker grades architecture for a pre_audit file).
