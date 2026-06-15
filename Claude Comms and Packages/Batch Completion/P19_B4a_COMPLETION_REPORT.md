# P19-B4a — Completion Report (xStock active-path wire-in + feed-safety)

**Batch:** P19-B4a · **Date:** 2026-06-14 · **Author:** Claude New (CC-B)
**Status:** _pending Langston Step-4 + Step-8 + Kyle acknowledgment_

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (CLAUDE.md §9.1)

> **THIS BATCH DOES NOT TURN xStock ACTIVE-PAPER TRADING ON. The xStock active-dispatch path wired in by B4a (C2) REMAINS DORMANT until P19-B7b flips the authoritative `system_context.isEngineActive` flag.** Every active-fill safety gate, the strategy gate, and the classify hardening are BUILT and verified but INERT while active trading is off. B4a makes the wire-in + safety gates exist and be correct; it does not make xStock active trading functional. B7b (hard-gated on B6.5 crypto-resurrection + B6.6 price-discovery-liveness) is the activation.

---

## PREVIOUSLY-STATED-VS-NOW (CLAUDE.md §9.2)

- **C7 (RTB `asset_class SET NOT NULL`).** PREVIOUSLY STATED: B4a ships the Phase-4 `SET NOT NULL`. NOW: DEFERRED to B7b post-activation (RUNNING_ISSUES #237). REASON: nothing writes `rtb_signals` while active-paper is dormant, so the scope-mandated 48h zero-null soak would be vacuous — and the scope itself forbids a vacuous soak gating the flip. The substantive deliverable (the resolver-backed write, C1) shipped.
- **C8 (xStock pattern cap).** PREVIOUSLY STATED: validate 0.50 against shadow evidence. NOW: 0.50 → 0.15 interim correction (shadow validation impossible pre-activation; 0.50 is an unjustified placeholder). REASON: no active-paper data exists to measure binding; xStock is less liquid than crypto so its cap should be ≤ crypto's 0.15, not 3.3× higher. Final per-class calibration stays Phase-25 (#153).
- **#236 (NEW) / #237 (NEW)** issues created (holiday-hole liveness gate → B6.6; SET-NOT-NULL deferral). **B7b pre-flight now hard-gated on B6.5 + B6.6.**

---

## Scope objectives (P19-B4a §3 + the A-items)

| Item | Objective | Status | Evidence |
|---|---|---|---|
| A1/A1.5 (C1) | resolver-backed RTB asset_class write (no literal default) | ✅ YES | stamp-at-source: `SizingContext.assetClass` required field, full build-method sweep; RTB write throws on missing; SUI/USD collision two-pipe test green (commit 89b76c8b8 / 755857016) |
| A1 (C2) | xStock active-path wire-in (dormant) | ✅ YES | `dispatchExternalSignal` seam + `active-dispatch.ts` connector, gated on `isEngineActive`; 6 tests (commit d37e9cc9e) |
| A2 (C3) | freshness + liquid-fill-window + silent-stall gate | ✅ YES | measured (Fri session, RTH p99 8.75s → 15s; discovery 12–22% RTH vs 2–7% off); 3 gates DB-resolved fail-closed; 21 tests; Langston 4 conditions met (commit df00c27c8) |
| A3 (C4) | classify hardening + escalation hook + #230 tag | ✅ YES | prefer-stamp (validated) + safe-skip across 10 active sites; hook registered active-only; #230 hard-skip; Langston conditions met (commit 450383164) |
| A4 (C7) | RTB Phase-4 SET NOT NULL | ⏸ DEFERRED | #237 — vacuous soak while dormant; flip → B7b post-activation soak; C1 write = shipped precondition (commit fc4650f97) |
| A5 (C5) | DB-resolved active strategy gate + dispose hardcoded list | ✅ YES | gate at `buildSizedSignalForStrategy` chokepoint (reverse-alias); disposed 2 literals + Set machinery; DELETED_COMPONENTS_LOG; reb-2-12F diagnostic re-pointed; default-open (commit da83a48ad) |
| A6 (C8) | #153 0.50 pattern-cap validation | ✅ YES (corrected) | 0.50 → 0.15 interim; final calibration Phase-25 (commit 71690d99e) |
| A7 (C6) | calibration_state tag on paper_sim tables | ✅ YES | NOT NULL DEFAULT + auto-backfill on both paper_sim tables (commit 0cd3e0575) |

## Decisions for Kyle (flagged) + Langston (ratified Step-4)
1. **xStock active FILLS gated to US regular hours (RTH 09:30–16:00 ET)** as a fill-quality liquidity gate — token still 24/5 for scan+VTS; config-widenable. **★ KYLE RESOLUTION 2026-06-15:** the RTH clock was only a PROXY for book liquidity (used because B4a had no live order-book-depth feed). Kyle's call — gate on actual book-depth-sufficiency, 24/5, NOT a clock. RESOLVED: the liquid-fill-window clock is RETIRED and replaced by a book-depth-sufficiency gate once B4b.1 builds the depth feed (RUNNING_ISSUES #295; no live impact — B4a's gate is dormant and B4b.1 lands before B7b activation). The freshness + stall-watchdog gates stay (both correct, both 24/5).
2. **C5 strategy gate default-open** (not explicit-allowlist — would black out crypto).
3. **C7 SET-NOT-NULL deferred** to B7b post-activation soak (#237).
4. **C8 pattern cap 0.50 → 0.15** (interim; final Phase-25).

## Bench verification
- tsc baseline gate: "no regressions above baseline" after every chunk.
- Full suite: **168 files / 1932 tests passed** after C3, C4, C5.

## CI / deploy (Step 5–8) — ✅
- **CI run `27517345398` — conclusion success / all-4-green** on head `1523ff7ac`.
- **Push:** `fd05fe7b7..1523ff7ac` from the Google-Drive source-of-truth folder; sync gate both-directions-0.
- **Staging deploy verified:** db:migrate applied all 3 pending migrations (C3 fill-safety seed ✓, C6 calibration_state ✓, C8 cap-correction ✓); build done; `pm2 restart` online; **HTTP 200**; clean boot (`[P19-B4a][C4][INIT_OK] classify fall-through escalation hook registered`, BOOT_ORCHESTRATOR INIT_OK, TEC_PRIME 4 classes warmed 30ms). DB confirms: xstock_spot `pattern_max_position_pct` = **0.15** (C8), 5 `xstock_fill_safety` rows (C3), `calibration_state` columns present on both paper_sim tables with 0 nulls (C6). C7 NOT applied (deferred #237).
- **UI verification (§9.3): N/A** — the xStock active dispatch + all gates are DORMANT (`isEngineActive`=false) until B7b; there is no UI-visible behavior change to Chrome-verify (§9.1 scaffolding). Backend evidence above is the appropriate Step-7 proof.
- **Langston Step-4: APPROVE-WITH-CONDITIONS** (3 decisions ratified; conditions 2–4 confirmed inline; condition 1 homed #238).
- **Langston Step-8: CONFIRMED-CLOSED** — independently re-verified on staging (cap=0.15 both classes, exactly 5 `xstock_fill_safety` rows matching the seed, `calibration_state` NOT NULL DEFAULT on both paper_sim tables, hook at `index.ts:245`, engine DORMANT/passive). Deferred homes confirmed §13-compliant. **SHA NOTE (Langston):** deployed CODE = `1523ff7ac` (all C2–C8); repo head = `659b8c60e` (governance docs only — docs don't require redeploy; the SHA gap is consistent, NOT a deploy miss).

## Governance files changed (Step 10)
- **Tier-1:** BATCH_CATALOG (P19-B4a row), PHASE_HISTORY, PHASE_19_PLAN §1/§5/§6, `.claude/memory/MEMORY.md` (repo-mirror) + the auto-loaded MEMORY truth file, this completion report.
- **Tier-2:** SYSTEM_IMPACT_MAP, SYSTEM_MANUAL, CHANGES_AND_FIXES, RUNNING_ISSUES (#236/#237/#238 added; #92/#95/#153/#221/#228/#230/#231/#235 dispositions), ASSET_CLASS_ONBOARDING_WORKFLOW, MULTI_ASSET_VTS_EXPANSION_PLAN, Langston `/home/langston/MEMORY.md` sync.

## Close gates — ✅
- §7.1 sync: both directions 0 after push ✓.
- Rule-19 CI all-4-green: run `27517345398` success ✓.
- Pre-existing finding (NOT B4a): ~20 Kraken symbols/scan-cycle fall classify (single-letter tokens + USDC/USDT/PYUSD/RLUSD/EUROP-quoted pairs; B3a counter ~147k) — B4a makes these SAFE-skip; classifier coverage gap belongs to #229 (symbol-module consolidation, Phase 20).
