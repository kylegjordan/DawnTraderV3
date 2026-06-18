# P19-B6.5e — Completion Report (TCL → paper-execution-engine open-path silent-failure repair)

> **Date:** 2026-06-18. **Implementer:** Claude New (CC-B). **Reviewer:** Langston — Step-1 PROCEED, Step-4 APPROVE (Phase A), dry-run-findings scope verdict (consensus). **Phase:** 19. **Issue:** #325. **Change-class:** non_architecture (open-path observability + the rtb-metrics invariant; no new engine — Langston ratified on condition of the SIM content update, delivered below).
>
> 🚨 **SCAFFOLDING-VS-FUNCTIONAL (CLAUDE.md §9.1):** THIS BATCH DOES NOT MAKE CRYPTO ACTIVE-PAPER TRADING OPEN A TRADE. It makes the open path's failures **observable + accounted** (the scoped #325 repair) and **diagnoses** why no crypto trade opens. Producing an actual crypto open (gate-10) is moved to a named successor (**P19-B6.5g**, below) — it was never achievable in this batch because the blocker is decision-grade EV-input math, out of this batch's scope.

## 0. What #325 actually was, and why it's fixed
The crypto open "silently vanished" — `[8.8.3-I3] attempts=N / opened=0 / blocked=0 / reasonSum=0`, `paper_sim_trades=0`, no error, no reason. Root cause (Step-1.a): `executeSimulatedTrade` was **`void`-returning with ~7 bare-`return` post-guardrail early-exits invisible to the I3 invariant**, and `executePromotedSignal` inferred success by a **trade-count delta**. Any post-guardrail open failure → "no new trade" → silent. **That silent-failure was the scoped defect, and it is repaired** (Phase A).

## 1. Objectives

| OBJ | Item | Status | Evidence |
|---|---|---|---|
| 1 | Make the post-guardrail open stage OBSERVABLE so a sized signal can never silently vanish (typed `OpenOutcome` + `openFailed` 3rd term; I3 invariant `attempts === opened + blocked + openFailed`) | ✅ **MET + PROVEN LIVE** | dry-run: `[8.8.3-I3][INVARIANT_CHECK][OK] ✓ attempts=8, opened=0, blocked=0, openFailed=8 [EV_REJECT:8]` — reconciled + stage-named (was a silent MISMATCH) |
| 2 | Root-cause the actual crypto open break (NO PATCHES) | ✅ **MET (diagnosed)** | The open path executes correctly to the **Net-Expectancy gate (11.8B)**, which honestly rejects every crypto signal (NetEV<0 after friction). NOT the depth gate. See §2. |
| 3 | Gate-10: ≥1 FULL closed crypto lifecycle | ➡️ **MOVED to P19-B6.5g** | Blocked by HONEST EV rejection rooted in default EV inputs (#233) — decision-grade math, out of this batch's scope. CC+Langston+Kyle consensus to promote. |
| 4 | #327 — remove dead dynamic `resolveAssetClass` import (signal-orchestrator) | ✅ **MET** | one-liner removed, rule-18 verified (single binding, no call site); DELETED via diff |
| 5 | JC#4 — `[STAMP_MISSING_ACTIVE]` disposition from the dry-run rate | ✅ **MET (zero observed)** | the dry-run produced **0** `[STAMP_MISSING_ACTIVE]` lines — the carried stamp held across the active crypto path; no residual carry gap. Disposition: **leave the un-throttled tripwire as-is** (proven clean; it stays silent unless a real gap appears). |
| 6 | Tests | ✅ **MET** | `p19-b6-5e-open-failed-invariant.test.ts` (6 tests) — invariant reconciliation incl. the exact "11 tried / 0 opened / 0 blocked" symptom + a regression guard |

## 2. The diagnosis (dry-run, OBJ-2) — full detail in `Scope Files/P19_B6_5e_DRYRUN_FINDINGS.md`
Contained crypto-only paper dry-run on staging (Phase A deployed `dbd0a2283`), **reverted to dormant baseline after** (verified: both engines off, `active_asset_classes={}`, 0 open positions). The EV gate breakdown (`[11.8B-A][ExpectancyGate]`):

| Symbol | NetEV | RawEV | Friction | pWin | DI | VolNoise |
|---|---|---|---|---|---|---|
| SOL/USD | −0.090 | 1.149 | 1.239 | 0.60 | 50.0 | 0.300 |
| ETH/USD | −7.49 | 22.46 | 29.95 | 0.60 | 50.0 | 0.300 |
| LTC/EUR | −0.326 | 0.348 | 0.673 | 0.60 | 50.0 | 0.300 |

- **`NetEV = RawEV − Friction`, internally consistent** (Friction/RawEV ratios cluster 1.08–1.93× across ~$90–$3000 symbols → unit-consistent; ETH −7.49 is price-scaling, NOT a bug — Langston corroborated).
- **RawEV POSITIVE on every signal** (genuine edge) but **Friction exceeds it** → the gate correctly refuses a friction-losing trade. **The EV gate is working; do not weaken it.**
- **⚠️ pWin/DI/VolNoise are IDENTICAL defaults (0.60/50/0.300) on every signal** — the signal metadata isn't reaching `evaluateTradeExpectancy` (the already-homed **#233**). A true per-signal pWin would lift RawEV and some signals (e.g. SOL/USD at ratio 1.08×) would clear friction → real opens. **The lever for gate-10 is fixing the EV inputs, not the open path.**

## 3. Successors created (CC+Langston consensus, Kyle-approved 2026-06-18) — §9.4 homes
- **P19-B6.5f** (NEW, small, urgent — ships FIRST): canonicalizer quote-currency completeness. The dry-run fired **6 critical `classify-fallthrough-active` alerts** (ETH/EUROP, ETH/PYUSD, XBT/EUROP, XBT/PYUSD, XRP/RLUSD + earlier A/EUR). **Two root causes (both confirmed):** (a) `symbol-canonicalizer.ts:151` `knownQuotes` missing the newer Kraken stablecoin quotes; (b) `shared/asset-classes.ts` `CRYPTO_SPOT_CANONICAL` quote group `[A-Z0-9]{3,4}` caps at 4 chars — EUROP/PYUSD/RLUSD are 5. **DISTINCT from B6.5d's single-letter BASE fix (these fail on the QUOTE side).** Fix: enumerate Kraken's full current quote set (verify live) + widen the quote length + a **loud named alert on any unrecognized quote** so the next gap is a one-line diagnosis. (Root-cause analysis contributed by Claude Old + Langston, Kyle-relayed.)
- **P19-B6.5g** (NEW): EV-input integrity + gate-10 lifecycle proof. Core = **#233** (thread real `DI`/`VolNoise`/`prices`/`dbsScore` into `evaluateTradeExpectancy`); + a **friction-decomposition audit** (spread/fee/slippage — rule out double-counting the spread or a wrong fee tier); + a **ranking/sizing normalization check** (price-unit NetEV is fine for the sign decision but NOT comparable across symbols — confirm nothing ranks/sizes on absolute NetEV); + **gate-10 (≥1 full closed crypto lifecycle) as the exit gate**, re-run on real inputs. **B7b activation stays HARD-GATED on B6.5g-green** (gate-10 moves, does not vanish). *(Naming note: Langston suggested "P19-B7"; renamed B6.5g to avoid colliding with the existing B7a/B7b activation batches and to keep gate-10 in the crypto-resurrection arc — flag for confirm.)*

## 4. Two findings LOGGED (Langston Step-4 + this close)
- **#297 intent-executor guard inversion** (Langston Step-4): the `void→OpenOutcome` widening means the dormant `intent-executor.ts:512` `if (!trade) throw` now sees a truthy `OpenOutcome` even on `{opened:false}` → would report success-on-failed-open IF that dead `#297` path ever ran. No live impact (gated, dormant). **Home: folded into the existing #297 dead-subsystem tracking** — correct the guard to `if (!trade || !trade.opened)` OR delete when #297 is actioned.
- **rtb-metrics API field gap:** `GET /api/diagnostics/rtb-metrics` (`routes.ts:8704`) returns `totals.openFailed` but NOT the `openFailedByStage` / `byReason` breakdown (came back `null` in the dry-run pull; the log line + `getSummary()` HAVE it). **Home: P19-B6.5g** (surface the breakdown in the route alongside the EV-input work).

## 5. Verification
- **Bench:** tsc-baseline CLEAN (no regressions; paper-execution-engine 3→1); `p19-b6-5e-open-failed-invariant.test.ts` 6/6 + depth-gate + B6.5d asset-class = 30 green. (Docker unavailable locally → DB-backed suite deferred to CI, as prior batches.)
- **CI (rule 19):** run **27731034448 — all-4-green** ✅ on `dbd0a2283` (`gh run watch --exit-status` exit 0).
- **Deploy:** ✅ staging `dbd0a2283`, build + `pm2 restart` #404, HTTP 200, clean boot (no migration — pure code).
- **★ OBJ-1 PROVEN ON THE DEPLOYED CODE:** the contained crypto dry-run reconciled the invariant and named the stage (`openFailed=8 [EV_REJECT:8]`) — the silent failure is structurally impossible now. Reverted to dormant baseline (verified).

## 6. Governance files changed (this close)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — **CONTENT (Langston's non_architecture condition):** registered `rtb-metrics-service` as cross-cutting telemetry singleton **S16** + the NEW I3 invariant shape (`attempts === opened + blocked + openFailed`) + the Phase-21 mode-isolation HOME.
- `1-system-manual/RUNNING_ISSUES.md` — #325 RESOLVED (silent failure fixed); NEW homes: B6.5f, B6.5g (folds #233), #297 guard-inversion note, rtb-metrics API field gap.
- `1-system-manual/BATCH_CATALOG.md` + `PHASE_HISTORY.md` — P19-B6.5e entry + narrative.
- `1-system-manual/PHASE_19_PLAN.md` — §1 board (B6.5e CLOSED; B6.5f + B6.5g added; B7b gate-10 owner = B6.5g) + §5 decision log.
- `.claude/memory/MEMORY.md` (in-repo mirror) + Langston `/home/langston/MEMORY.md` — 3-way sync.
- This report + `Scope Files/P19_B6_5e_SCOPE.md`, `_PRE_AUDIT.md`, `_DRYRUN_FINDINGS.md` + `Change Lists/P19_B6_5e_PHASE_A_STEP4_CHANGE_LIST.md`.
- **SYSTEM_MANUAL:** N/A (no architecture/strategy/regime/filter/math change — judged per §9; the EV-gate behavior is documented Layer-1 §1.2 and is unchanged).

## 7. SYNC + close
Push `affa630ef..` head incl. Phase A code (`dbd0a2283`, CI-green, deployed) + governance. Batch-close sync gate: Google Drive ↔ GitHub 0/0. **B6.5e CLOSED on its proven deliverable (#325) + diagnosis; gate-10 owned by B6.5g.**
