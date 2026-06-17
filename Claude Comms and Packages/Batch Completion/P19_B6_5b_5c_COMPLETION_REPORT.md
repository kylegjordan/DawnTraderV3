# P19-B6.5b + P19-B6.5c — Joint Completion Report

> **Date:** 2026-06-17. **Author:** Claude New (CC-B). **Reviewer:** Langston (Step-4 APPROVE on B6.5c; gate-10 disposition ruling; Step-8 pending). **Phase:** 19.
> B6.5b's governance was deferred to this joint close (its dry-run surfaced the breaks B6.5c repairs). Both batches are closed here.
>
> 🚫 **NOT "all objectives met."** B6.5c objectives 1-3 are MET + proven live; **objective 5 (gate-10 — ≥1 FULL closed crypto lifecycle) is NOT met** — blocked by a new downstream open-path break and **carried to the new batch P19-B6.5e** (per Langston's ruling 2026-06-17). See §3.

---

## 1. P19-B6.5b — per-asset-class crypto active gate + F1-F5 (SHIPPED)

**Commit `d56a0cc1e` · CI 27693018813 all-4-green · deployed staging HTTP200 · Langston Step-4 APPROVE.**

| # | Item | Status | Evidence |
|---|---|---|---|
| Gate | Per-class crypto gate propagated into fx5-scanner pool population (#320 — the audited master-flag-only bypass) + defense-in-depth reject at the `queueSQESignal` chokepoint + `purgeInactiveClassSignals` re-eval purge | ✅ | code + `p19-b6-5b-crypto-isolation.test.ts` |
| F2 | Wired the previously-uncalled `witnessAssetClassEmissionWhileInactive` (#321) — observable LIVENESS_SPLIT | ✅ | test |
| F3 | Paper cooldown read re-pointed `getTrades`(legacy `trades`)→`getPaperSimTradesPaginated`(paper_sim_trades) — was a silent no-op | ✅ | code |
| F5 | ATR-zero exit FLOOR in tec-evaluator (hard stop/target when `useTrailing && atr<=0` — a never-closing-position hole) | ✅ | `p19-b6-5b-tec-atr-floor.test.ts` |
| Rule-18 | Dead-code DELETED: `queueSignal` + `RTBSignalInput` + `storage.insertRtbSignal` (0 callers) | ✅ | DELETED_COMPONENTS_LOG |

**B6.5b dry-run** flipped crypto ON in paper then reverted; it PROVED the front half (scanner→pools→orchestrator→SQE all fire for crypto, no crash) and SURFACED the two RTB-insert breaks that B6.5c repairs (it could not reach a closed lifecycle — 0 signals reached the queue).

## 2. P19-B6.5c — crypto signal → ready-to-buy REPAIR (objectives 1-3 MET + proven)

**Commits `52adcdf6f` (fix) + `0b5bb206d` (drop-counter log) · CI 27720080156 all-4-green · deployed staging (cwqi migration applied) HTTP200 clean boot · Langston Step-4 APPROVE.**

| Obj | Item | Status | Evidence |
|---|---|---|---|
| 1 | Drop the drifted NOT-NULL `cwqi` column on `rtb_signals` (was rejecting every insert — 16,930 dry-run drops, ALL strategies) | ✅ **MET** | migration `2026-06-17-p19-b6-5c-drop-rtb-cwqi.sql` applied on staging (`db:migrate` ✓); `information_schema` confirms `cwqi` GONE; DB-dep check was clean (0 views/constraints/triggers; only the auto-dropped index) |
| 2 | Crypto pattern signals carry a CANONICAL strategy name (no `pattern_*`) — 8,503 dry-run drops fixed | ✅ **MET + PROVEN LIVE** | new `resolvePatternConsumingStrategy` (exact-match-or-drop, regime+class aware, additive — `selectContextAwareStrategy` untouched); `patternToTradeSignal` no longer asserts a strategy. **Live:** RTB received `AKT/USD→reverse_impulse`, `AUD/USD→inside_bar_reversal` (regime-resolved); **0 `pattern_*` rows**; 0 enum errors post-deploy |
| 3 | Site-2 sizing corrected / redundant emitter removed | ✅ **MET** | redundant double-emission loop REMOVED (rule 18 — the dispatch already evaluates every pattern-consuming strategy; the loop sized under hardcoded `'breakout'`); DELETED_COMPONENTS_LOG entry; RTB dedup key `(mode,symbol,strategy)` confirmed collapses overlap |
| 4 | (A/EUR classify) | ➡️ **MOVED to P19-B6.5d** (Claude Old) — not a B6.5c objective; the single-letter classify-fallthrough is the structural asset-class-stamp-integrity fix |
| 5 | **Gate-10: ≥1 FULL closed crypto lifecycle (open→exit→close→cooldown→telemetry) + canonical `paper_sim_trades.strategy_name` end-to-end** | ❌ **NOT MET — carried to P19-B6.5e** | the dry-run proved the front half but a trade will not OPEN (see §3) |

**Observable no-match drop counter (Langston D3/D4):** `getPatternNoMatchDropStats()` surfaced in the live log (`[PATTERN_NOMATCH_DROPS]`) — during the dry-run it showed regime-coherent drops (ABCD only consumed by `volatility_edge` in IMPULSE_EXPANSION → dropped elsewhere; INSIDE_BAR only in HVU; PINBAR only in HVU/RBS) — exactly the exact-match-or-drop design, not "going dark." xStock isolation held (0 xStock RTB rows).

## 3. Gate-10 dry-run result + disposition (Langston ruling 2026-06-17)

The B6.5c gate-10 dry-run (crypto_spot flipped ON in paper, then reverted) **proved the fix** (front half + RTB now healthy with canonical names) but surfaced a **NEW downstream break: a sized crypto signal will not OPEN a paper trade.** Sizing succeeds (`AUD/USD inside_bar_reversal` sized $102.20, `success=true`, guardrails loaded, portfolio $878) but the system's own invariant monitor flags `[8.8.3-I3][INVARIANT_CHECK][MISMATCH] attempts=11, opened=0, blocked=0, reasonSum=0` — open attempts vanish in the TCL→paper-execution-engine handoff with no error, no block, no reason. `paper_sim_trades` stayed 0. This is a different component than B6.5c touched (the open/fill path, untested since Phase 8), surfacing only now that signals reach the queue — the same layered-discovery pattern as B6.5b→B6.5c.

**Langston ruling:** close B6.5c on its proven objectives 1-3; **move gate-10 (objective 5, full closed lifecycle) to a new named batch `P19-B6.5e`** — "TCL→paper-execution-engine open-path silent-failure repair" — which OWNS the closed-lifecycle proof (promote to a full P19-B7 if the surface is large). The diagnostic hook is already in place (the invariant monitor); `reasonSum=0 + blocked=0` points at an un-awaited promise / swallowed throw / early-return-no-telemetry in the handoff — root-cause it (NO PATCHES), don't add a log and call it found. The dry-run was REVERTED before handoff (paper engine off, `active_asset_classes={}` both modes — verified).

**Two non-fatal items homed SEPARATELY (not folded into B6.5c):** (a) B63 DBS-not-propagated hard-contract warns on some crypto pairs in the pattern-pool eval (caught/skipped) → its own RUNNING_ISSUES entry under the B63 DBS-propagation lineage; (b) single-letter classify-fallthroughs (A/EUR, Q/USD, S/USD) → P19-B6.5d (Langston acked the live A/EUR critical alert against that home). **B7b (crypto-first activation) remains gated on the closed-lifecycle proof, now owned by B6.5e.**

## 4. Governance files changed (this close)

- `1-system-manual/DELETED_COMPONENTS_LOG.md` — B6.5c removals (site-2 loop + patternToTradeSignal strategy field + cwqi column) ✅
- `1-system-manual/RUNNING_ISSUES.md` — **#325** open-path silent-failure (home P19-B6.5e) + **#326** B63 DBS-not-propagated (proposed home "P19 pre-go-live DBS-propagation hardening" — needs Kyle/Langston confirm per §9.4)
- `1-system-manual/PHASE_19_PLAN.md` — §1 board (B6.5b/B6.5c CLOSED, B6.5e added) + §5 decision log (B6.5c close obj-5-carried + B6.5e creation)
- `1-system-manual/POST_AUDIT_ROADMAP.md` — B6.5e numbered item
- `1-system-manual/BATCH_CATALOG.md` — P19-B6.5b + P19-B6.5c entries
- `1-system-manual/PHASE_HISTORY.md` — P19-B6.5b + P19-B6.5c narratives
- `1-system-manual/SYSTEM_MANUAL.md` — CONTENT: pattern→strategy routing contract (exact-match-or-drop) in the signal-pipeline/strategy chapter + 17→19 strategy-count fix (basis: `STRATEGY_DISPLAY_NAMES` = 19 keys)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — CONTENT: cwqi schema reconciliation + site-2 removal + the pattern-pool emitter's canonical resolution + 17→19 count fix
- Scope/pre-audit/change-list committed under `Claude Comms and Packages/` (Scope Files + Change Lists)
- `.claude/memory/MEMORY.md` (in-repo mirror) + Langston `/home/langston/MEMORY.md` — 3-way sync
- This completion report

## 5. Still owed to Kyle (carried forward)
- A plain-language recap of the B6.5b findings (incl. the two breaks).
- The B6 paper-kill **50%-vs-20% cap** surface: Kyle wanted 50% but the schema CHECK caps `daily_loss_kill_switch_pct` at [1,20] (set 20.00 = MAX); offer a tiny migration to loosen the ceiling. (Dormant until B7b.)

## 6. Verification status
- CI all-4-green on `0b5bb206d` (run 27720080156): TypeScript Check, Test Suite, Build, Docker Build = success.
- Deployed staging (PM2 restart #402); cwqi migration applied; HTTP200; clean boot; cwqi column gone (verified).
- Live proof of objectives 1-3 captured in the reverted dry-run (§2).
- **Langston Step-8 (independent re-verify): pending.**

*Batch CLOSED on objectives 1-3 (B6.5c) + B6.5b shipped, with objective 5 explicitly carried to P19-B6.5e. Awaiting Langston Step-8 + Kyle acknowledgment.*
