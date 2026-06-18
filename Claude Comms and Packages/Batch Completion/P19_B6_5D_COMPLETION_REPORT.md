# P19-B6.5d — Completion Report (asset-class stamp integrity)

> **Date:** 2026-06-18. **Implementer:** Claude New (CC-B). **Scope+audit:** Claude Old (CC-A), commit 419408374. **Reviewer:** Langston — Step-1 APPROVE (reconciled), **Step-4 APPROVE** (JC#3 folded in), Step-8 PENDING. **Phase:** 19. **Change-class:** non_architecture (signal-pipeline classifier + per-class plumbing; no new engine).
>
> **Origin:** the live `classify-fallthrough-active` CRITICAL alert (id `58367b27`, `A/EUR@kraken` dropped on the active path). The investigation surfaced a STRUCTURAL issue (asset class re-derived from the symbol at 26 of 35 resolve sites instead of carried with the pair), not a one-off. NO-PATCHES: fixed all of it in one batch.

## 0. The invariant enforced
**One SizingContext = one asset class = one pipe; the class is STAMPED at pipe entry and CARRIED with the pair — never re-derived from the symbol string downstream.** Re-deriving hardcodes `exchange='kraken'`, which mis-handles the 9 USD/8 EUR collision tickers + single-letter bases.

## 1. Objectives

| OBJ | Item | Status | Evidence |
|---|---|---|---|
| 1 | Single-letter ticker recognition — widen the 3 resolver base floors {2,..}→{1,..} via one SSOT `TICKER_BASE_MIN_LEN` (clears the live `A/EUR` alert: A=Vaulta, a real Kraken-spot crypto) | ✅ **MET + bench-proven** | `shared/asset-classes.ts`; test: `A/EUR→crypto_spot`, `/USD` still throws, 15-ok/16-throws unchanged. `symbol-normalize.ts` imports the compiled regex → zero drift |
| 2 | Per-pair classify-fallthrough alert key (`classify-fallthrough-active:${symbol}@${exchange}`) | ✅ **MET** | `server/index.ts:265`; two distinct unclassifiable pairs → two alerts |
| 3 | SWAP the stamp-available re-derive sites to prefer the carried stamp (SQE gate, signal-orchestrator ×4, routes ×2, paper-engine AMR ×2 + position filters, pre-exec-validator, RTB AMR-shadow ×2) | ✅ **MET** | the SQE gate now honors `input.assetClass` + fails-closed; signal-orchestrator reuses the `sizingContext` stamp (throwing import removed); §B `[STAMP_MISSING_ACTIVE]` instrument on the active money sites |
| 4 | THREAD `assetClass` through `evaluateTradeExpectancy` + `feePercentFor` (removes the in-code "future batch" deferral) | ✅ **MET** | optional param, prefer-stamp; order requests already carried `assetClass` (types.ts:110/133) so the order-placer fill fee is now class-correct |
| 5 | Remove silent `?? 'crypto_spot'` defaults — fail-closed on active, logged on passive | ✅ **MET** | rtb-refresh fail-closed (2 drops replace 2 silent defaults); 2 reject-archive tail-defaults skip-on-null; vts-runner **6** logged defaults (audit said 4; grep found 5 resolver + the JC#3 stamp-default at :2787) |
| 6 | Swap exactly 2 throwing-variant passive sites (`market-context-engine.ts:1442`, `vts-service.ts:341`) | ✅ **MET** | both → safe variant + skip/log-on-null. Reconciliation: `vts-service.ts:963` was ALREADY safe (the subagent mislabeled it; scope was right to exclude) |
| 7 | Tests (resolver + collision-precedence ORDER + thread param) | ✅ **MET** | `p19-b6-5d-asset-class-integrity.test.ts`, **14 tests pass**; locks the collision-precedence order (the substantive risk) |
| 8 | Governance | ⏳ in progress (this report + SIM + System Manual + Tier-1) |

## 2. Langston Step-4 verdict (verbatim summary)
**APPROVE — clean to push.** Carry-the-stamp invariant implemented correctly across all six objectives; diff matched staging HEAD context; tsc-baseline clean; 14 new tests pass; the 9 vitest file-failures are the known #226 DB-isolation env issue (reproduced on the clean baseline — not from this batch). He independently verified via `ssh staging`: `SizingContext.assetClass` is typed non-null AND a pipe-entry guard `[P19-B4a][STAMP_MISSING]` at `evaluateMarket:438` already catches an absent stamp before the 4 sig-orch sites — the keystone making JC#1 correct.

**Rulings on the 4 judgment calls:**
- **JC#1** (sig-orch uses `sizingContext.assetClass` directly, no dead `?? safeResolve`): **AGREE** — the type + the :438 invariant make the fallback dead code.
- **JC#2** (routes P/L display: logged crypto_spot last-resort, not fail-closed): **AGREE** — correct asymmetry; a reporting route degrades, money gates fail-closed.
- **JC#3** (vts-runner:2772 `trade.assetClass ?? 'crypto_spot'`): **INCLUDE NOW** → **DONE** (folded in at :2787 as a logged stamp-default; vts-runner is now fully consistent).
- **JC#4** (`[STAMP_MISSING_ACTIVE]` un-throttled): **KEEP AS-IS** — the B6.5e dry-run wants every occurrence to measure the rate; **disposition homed** to the B6.5e completion report (root-cause if non-zero per NO-PATCHES; a counter only if dry-run proves clean zero).

## 3. Issues surfaced + their homes (§9.4)
- **N1 — `signal-orchestrator.ts:1151` possibly-dead dynamic `resolveAssetClass` import** (the fire-and-forget archive block writes `sizingContext.assetClass` at :1156, so the dynamic import looks unused). Pre-existing, not in this diff. **Home: `RUNNING_ISSUES` (own entry) → confirm-and-sweep in a near-term housekeeping pass** (do NOT expand B6.5d).
- **N2 — OBJ-1 single-letter premise** (`Z/USD` now classifies crypto instead of throwing). **CONFIRMED CLOSED** this batch: grep of `symbol-normalize.ts` + `symbol-canonicalizer.ts` found no min-length / single-letter rejection used as a malformed-symbol gate; the scanner only feeds real Kraken pairs.
- **JC#4 — `[STAMP_MISSING_ACTIVE]` disposition** → **Home: P19-B6.5e completion report** (contingent on the observed dry-run rate).

## 4. Files changed (code commit `3bd3deedc`)
14 source files + 1 new test + the Step-4 change-list. Push `affa630ef..3bd3deedc`, +422/−104. (Disjoint from CC-A's in-flight B-GOV-2 — code committed by path, never `-A`.)

## 5. Verification
- **Bench:** tsc-baseline clean (no regressions above baseline); 14 new tests pass; full suite 1918 passing, the 9 file-failures are pre-existing #226 (reproduced on clean baseline).
- **CI (rule 19):** run **27728040408 — all-4-green** ✅ (Build / TypeScript Check / Test Suite / Docker Build all success on `3bd3deedc`).
- **Deploy:** ✅ staging `3bd3deedc`, HTTP 200, `pm2 restart` #403, clean build (no migration — pure code).
- **★ Step-8 HEADLINE GATE — MET:** verified on the **actually-deployed resolver** (`ssh staging` + tsx): `A/EUR=crypto_spot` (the alert-clearing case), `T/USD=crypto_spot` (collision gate, drift-warn fires = precedence preserved), `Tx/USD=xstock_spot`, `TICKER_BASE_MIN_LEN=1`. The `classify-fallthrough-active` alert (id `58367b27`) **RESOLVED** via the CLI (`--by cc-session-2026-06-18`); **no new classify-fallthrough fired** post-deploy (system dormant, engines off, the hook fences behind `isEngineActive`). **Langston independent Step-8: ✅ CONFIRMED-CLOSED** — he re-verified all four gate legs against the deployed tree (ran `safeResolveAssetClass` + the new vitest suite himself: 14/14 pass; `A/EUR→crypto_spot`, `/USD→null`, `T/USD` via the collision gate; grepped all swapped files = zero bare throwing `resolveAssetClass(` on the active path; alert `58367b27` state=resolved). JC#1 + JC#2 ratified independently.

## 6. Governance files (Step-10 — to land after deploy+verify, sequenced with CC-A on the shared docs)
BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, RUNNING_ISSUES (N1 + close the underlying classify issue), SYSTEM_MANUAL (the base-length MIN rule + never-re-derive invariant in the classifier section), SYSTEM_IMPACT_MAP (the classifier's matchable-universe change + per-pair dedupe cross-cutting state + document the 14 left-as-is VTS sites), this report, 3-way MEMORY sync.

*Dormant baseline (paper + live engines off, `active_asset_classes={}`) verified at Step-2. Batch is code-shipped + Langston-APPROVED; NOT closed until the alert-clear gate + CI green + governance land.*
