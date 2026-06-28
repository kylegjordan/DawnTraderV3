# P19-B6.8 — Scope: Per-mode guardrail completeness (the user-facing guardrails tab)

**change-class: architecture** (guardrails_v2 schema columns + migration + per-mode wiring + UI + backend consumption)
**Batch:** P19-B6.8 (#302 + #323) · **Owner:** Claude New (CC-B) · **Reviewer:** Langston
**Sequenced:** after B6.7, before B7a · paper-only B7b pre-flight gate (§6 gate 14)
**Date:** 2026-06-27

---

## 0. Premise correction (verified, NOT assumed — Kyle directed a thorough pre-audit)

The #302 premise — "user-settable guardrails still live in the mode-blind legacy `trading_settings` table → migrate them to per-mode `guardrails_v2`" — is **OUTDATED**. Verified against live code:
- `trading_settings` user-level reads are **PURGED** (Phase 41F-L / B-NEW-43): `getTradingSettings`/`create`/`update` commented out, STRICT_MODE throws `[FORBIDDEN]`.
- The old per-mode `guardrails` table is **bypassed** (config-update-service reads v2; micro-execution hardcodes its fields; the legacy `PUT /api/guardrails` writes a table the active path never reads).
- **`guardrails_v2` is the live per-mode SoT.** The active paper F1 gate (`guardrail-policy.checkGuardrailRisk` @ paper-execution-engine:1959) reads it. System Manual Ch4: "10 named guardrails + kill switch."

**Kyle's clarified ask (2026-06-27):** the anchor is the **user-facing guardrails tab** (guardrails-and-filters page). "There needs to be a set of guardrails for paper mode AND for live mode… whatever you need to do to make that right, make it right." So B6.8 = **make every control in that tab a clean per-mode (paper + live) guardrail that genuinely drives the backend** — paper complete + functional, live the same structure (not required fully wired, per #302).

## 1. The verified gap (the tab is a tangle of 4 storage origins)

1. **Real per-mode v2 set (✓ correct):** `core-four-guardrails.tsx` renders 6 per-mode v2 guardrails (maxTotalExposurePct, portfolioRiskPerTradePct, symbolCooldownMinutes, maxOpenPositions, dailyLossKillSwitchPct, maxPositionPercentPct) — these drive the backend.
2. **★ SPLIT-BRAIN (the core bug):** `guardrails-tab.tsx` renders **"Daily Loss Kill Switch (%)"** (:406) + **"Max Position Size Cap (%)"** (:432) bound to the **GLOBAL mode-blind `/api/settings`** (`trading_settings`), while the backend reads the per-mode v2 equivalents (`dailyLossKillSwitchPct`/`maxPositionPercentPct`). **A user's daily-loss kill-switch + max-position settings in the tab may not reach the per-mode failsafe/gate** — a safety-critical wiring split + a confusing duplication with the v2 Core-Six.
3. **INERT controls:** the tab shows `microLoopInterval`(8)/`priceDeltaTrigger`(0.30); the backend `micro-execution-service` **hardcodes** them ("not in guardrails_v2, use hardcoded defaults") → the user control sets nothing.
4. **Vestigial old-table $-fields:** the tab's `DEFAULTS` carry old `guardrails`-table dollar fields (maxDailyLoss, maxPositionSize, maxDrawdown, riskPerTrade, maxRequiredCapital, maxRiskPerTradeLimit, aiCanAdjust) — Step-2 confirms which (if any) are still rendered/used vs dead duplicates of the v2 %-based set.

## 2. Failsafe (#323) — verified behavior MATCHES Kyle's intent; the gap is wiring

`daily-loss-budget.ts` already implements Kyle's described failsafe: reads per-mode `dailyLossKillSwitchPct` + the 2 warning tiers → INFO/WARNING system-alert at warn1/warn2 (~50%/75% of the kill threshold, hysteresis anti-flap) → on breach **auto-trips** `tripKillSwitch` (sets `killSwitchTripped` + `isEngineActive=false` = shuts trading down) → **manual** `resetKillSwitch` to resume (NOT auto-resume). Gated on `isEngineActive` (dormant until active-paper). **So #323's behavior is built (B6); the only gap is that the tab's kill-switch input writes to the GLOBAL path, so the user's setting must be re-wired to the per-mode v2 value the failsafe actually reads.**

---

## 3. Objectives (numbered; verification criteria in §4)

- **OBJ-1 — One clean per-mode guardrail set in the tab.** Every user-settable control in the guardrails tab resolves to a **per-mode `guardrails_v2`** value (paper row + live row), saved per-mode, and **consumed by the backend**. No control silently saves to a mode-blind/global table.
- **OBJ-2 — Kill the split-brain (the safety fix).** Move "Daily Loss Kill Switch (%)" + "Max Position Size Cap (%)" off the global `/api/settings` path onto the per-mode v2 fields (`dailyLossKillSwitchPct`/`maxPositionPercentPct`) the backend reads — so the user's safety settings genuinely take effect per-mode. Remove the duplicate global controls (or make them read-only mirrors — Step-2 decides).
- **OBJ-3 — Execution-rhythm controls: wire or remove (Kyle decision at Step-1).** `microLoopInterval`/`priceDeltaTrigger` (and `cooldownMinutes` if a duplicate of `symbolCooldownMinutes`): EITHER add per-mode v2 columns + wire `micro-execution-service` to read them (de-hardcode, DB-governed) OR remove them from the tab if they are not meant to be user-settable. **(Open Q for Kyle/Langston — see §5.)**
- **OBJ-4 — Reconcile/remove the vestigial old-table $-fields** in the tab (maxDailyLoss/maxPositionSize/maxDrawdown/riskPerTrade/etc.): confirm each is a dead duplicate of the v2 %-based set and remove from the UI, or surface if any is genuinely still needed.
- **OBJ-5 — #323 failsafe wiring verified end-to-end.** The user's per-mode kill-switch + warning-tier settings (set in the tab) reach `daily-loss-budget.ts`; behavior = 50/75 alerts → auto-trip at threshold → manual restart (already built — verify, don't rebuild).
- **OBJ-6 — Copy-to-Live covers the full per-mode set.** The "Copy to Live" path populates the complete v2 set paper→live (live = same structure, not required fully wired).
- **OBJ-7 — §15 disposition of the now-confirmed vestigial pieces** (old `guardrails` table + legacy `PUT /api/guardrails` write-path + `trading_settings` table): delete-on-the-spot with blast-radius proof, OR a dated scheduled removal (DELETED_COMPONENTS_LOG). **(Boundary Q for Kyle/Langston — fold in here vs a separate §15 batch — see §5.)**

## 4. Verification criteria
- Staging-UI (§9.3, Claude-in-Chrome): the guardrails tab in **paper** mode shows one coherent per-mode set; changing a value + saving writes the per-mode v2 row (verify via DB); switching to **live** shows live's own row; "Copy to Live" populates live.
- A user-set daily-loss kill switch in the tab is the value `daily-loss-budget.ts`/`guardrail-policy` reads for that mode (DB cross-check) — no global/per-mode divergence.
- microLoop controls: either DB-governed + consumed (verify the service reads the row), or absent from the tab.
- No control writes to `/api/settings`/`trading_settings` for a guardrail.
- Bench tsc-baseline GREEN + tests; CI 4-green; Langston Step-1/2/4/8.

## 5. Open questions for Kyle / Langston (resolve at Step-1/2)
1. **OBJ-3:** are `microLoopInterval`/`priceDeltaTrigger` meant to be user-tunable per-mode (→ add to v2 + wire) or internal constants (→ remove from tab)? (They've been hardcoded + inert; needs a call.)
2. **OBJ-7:** fold the vestigial §15 cleanup (old `guardrails` table + legacy endpoint + `trading_settings`) into B6.8, or schedule as a separate §15 batch? (Kyle's Q-answer leaned "make it right" = likely fold the parts that touch the tab's correctness; the pure dead-table drop could be separate.)
3. Confirm the exact UI layout (does the goals page render `core-four-guardrails` AND `guardrails-tab` as separate sections, or is one the live tab?) — Step-2 pre-audit nails this before implementation.

---
*Step-1 draft for Langston review. Nothing implemented. Step-2 pre-audit will produce the exact field-by-field disposition table (every tab control → current source → target per-mode v2 field → backend consumer) + the SIM/System Manual/Active-Trading-Audit cross-read.*
