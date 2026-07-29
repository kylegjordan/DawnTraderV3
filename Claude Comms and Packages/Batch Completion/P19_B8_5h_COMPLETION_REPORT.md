# P19-B8.5h — Completion Report — xStock DBS/DI at-queue carry (#560 ≡ #377)

**Owner:** CC-B · **Closed:** 2026-07-27 · **change-class:** architecture · **Langston:** Step-1 + Step-2 + Step-4 ALL APPROVED (each independently re-read at the ref). Head `8345718fd`, CI 4/4 green.

> ✅ **LIVE-VERIFIED 2026-07-29 (CC-B) — the deferred §9.3 proof below is now IN; the batch is fully closed.** See the **LIVE VERIFICATION** section at the foot of this report for the measurement. Headline: xStock at-queue DBS carry went **0 / 1,034 rows pre-deploy → 64 / 64 post-deploy (100%)**, boundary-checked against the deploy timestamp; `di_at_queue` stays null for xStock (the ratified non-carry); crypto unchanged at 100% both eras. The §9.1 banner immediately below is preserved as the honest record of what was true at close on 2026-07-27 — it is no longer the current state.
>
> 🚨 **[SUPERSEDED 2026-07-29 — see above] SCAFFOLDING-VS-FUNCTIONAL (§9.1): the code fix is COMPLETE, DEPLOYED, and correct — but its §9.3 LIVE proof is DEFERRED.** The ready-to-buy pool is empty (the #570 net-EV/fee drought — working-as-designed, Langston-confirmed; the same condition that deferred the B8.5l fence), so there are currently zero xStock rtb_signals rows to observe. The fix is proven NOW by the 6/6 unit test + Langston's code review; the LIVE proof (an xStock row carrying a non-null `dbs_score_at_queue`, was 0/28) is homed to a self-rescheduling scheduled check (`verify-p19-b8-5h-dbs-carry`, weekdays 11:05am) that confirms + self-deletes the moment xStock signals flow.

## Objectives — all YES (live proof deferred per above)
- **OBJ-1 (class-aware DBS carry) — YES.** `resolveDbsScoreAtQueue(assetClass, fx5DbsScore, getXstockDbsScore)` (pure, exported, `signal-orchestrator.ts:272`): crypto returns `fx5Data.dbsScore` (predicate EXACTLY `'crypto_spot'` → byte-invariant), xStock returns the class-keyed MCE context's `directionalBias.score` (same [-1,1] scale). xStock source is a THUNK → crypto NEVER calls `getCachedContext`. Feeds BOTH the maker/taker decision (`:840`) AND the persisted `dbs_score_at_queue` (`:1119`) — the F2 single-basis contract — each keeping its own null sentinel (`?? undefined` / `?? null`). A miss (TTL-cold ctx or thin-pair synthesized-neutral) → each site's kernel default, byte-identical to today's crypto-null path.
- **OBJ-2 (DI non-carry) — YES (ratified).** `di_at_queue` stays null for xStock (both sites still `fx5Data?.di`). DI is EV-inert (#377 H1) + xStock DI is an unreconciled basis (#502) → carrying it under the crypto-named column is the same-name-different-quantity harm. Deferred to Phase-25 #502.
- **OBJ-3 (rule-23 fix-on-find) — YES.** Corrected the stale MCE comments (`market-context-engine.ts:1234/1261/1282`) that said "non-crypto DBS not computed / synthesize neutral" — contradicted by the live `:1284-1290` pass-through where xStock's real `propagatedDbs.score` survives. Comment-only.
- **OBJ-4 (regression guard) — YES.** `p19-b8-5h-dbs-carry.test.ts` 6/6 on the real exported helper: crypto returns fx5 + thunk-never-called (spy proof); crypto-null; xStock returns MCE score (+ negative −0.30); xStock miss → undefined; per-site sentinel matrix (real + miss, both classes); future non-crypto routes to MCE.

## Verification
- 6/6 unit test on the real `resolveDbsScoreAtQueue`. tsc-baseline gate green. CI 4/4 green on `8345718fd`.
- Deployed to staging (HTTP 200, my commit live). ~~§9.3 live UI/DB proof DEFERRED to `verify-p19-b8-5h-dbs-carry`~~ → **§9.3 LIVE PROOF LANDED 2026-07-29 — all three of Langston's pass conditions met (xStock `dbs_score_at_queue` non-null ✓ · crypto unchanged ✓ · xStock `di_at_queue` null ✓). See LIVE VERIFICATION below.**

## ★ Deploy-time operational finding (surfaced, homed — NOT caused by this fix)
The deploy's pm2 restart re-exposed a #520-class engine-resume gap: the auto-resume SKIPS the stale 11-day-old `running` session row (`5d26dbaa`, started 2026-07-16) with "[ActiveEngineHeartbeat] Session missing required fields — skipping recovery", so `/api/active-engine/status` shows `sessionInfo:null` while `isRunning:true`. **Position exit-monitoring is LIVE regardless** (`[EVAL_EXIT] positionsEvaluated=8`), so trading is NOT functionally halted — this is a session-record/display gap, not a data-corruption event (verified before flagging, rule 24.a). `/active-engine/start {mode:'continue'}` returned "already running" (state preserved, 10 open positions intact). Homed to RUNNING_ISSUES as a #520-rider for the liveness-watch owner to investigate whether the malformed session row should be reconciled/cleaned. Not this batch's fix.

## Governance files updated
SIM (reorg-B3 EV-input-provenance blocks updated: xStock DBS now carried, DI deferred #502), SYSTEM_MANUAL (same blocks ~337-340), RUNNING_ISSUES (#560 + #377 both RESOLVED; + the #520-rider session finding), BATCH_CATALOG, PHASE_19_PLAN §1+§5, this report, P19_B8_5h_SCOPE + _PRE_AUDIT, MEMORY_CC_B, Langston /home/langston/MEMORY.md. Scheduled task `verify-p19-b8-5h-dbs-carry` created for the deferred live proof. **2026-07-29 addendum:** RUNNING_ISSUES (#560 + #377 both → LIVE-VERIFIED), this report (LIVE VERIFICATION section), MEMORY_CC_B; scheduled task `verify-p19-b8-5h-dbs-carry` DELETED (job done).

---

## ★ LIVE VERIFICATION (§9.3) — 2026-07-29, CC-B — **PASS**

**Why the transient pool alone could not prove it, and what did.** At check time the live `rtb_signals` pool held **one crypto row and zero xStock rows**, sampled ten times over ~2 minutes (the #570 net-EV/fee drought persists) — so a point-in-time snapshot would have been another dry run. **The durable evidence is `rtb_shadow_pool_members`**, and it is a *stronger* proof than the snapshot the defer was waiting for, because it is a per-cycle transcript covering both sides of the deploy.

**That table records the `rtb_signals` COLUMN, not a parallel copy — verified in code before relying on it:** `ready_to_buy_service.ts:1965` sets `dbsScoreAtQueue = num(s.dbsScoreAtQueue)`, where `s` arrives via `captureShadowPool(mode, validSignals, …)` ← `getRankedSignals` ← `getQueuedSignals` ← `storage.getRtbSignals({…})` — a **DB read of `rtb_signals`**. Each shadow member row therefore transcribes what `rtb_signals.dbs_score_at_queue` actually held for a queued signal at that promotion cycle.

**MEASURED (staging Supabase; era split at the fix commit `8345718fd`, authored 2026-07-27 20:44:12Z; deployed head `795d8c92e` contains it):**

| asset_class | era | rows | dbs_carried | % | di_carried | dbs range | symbols |
|---|---|---|---|---|---|---|---|
| crypto_spot | pre-deploy | 49,671 | 49,658 | 100.0 | 49,658 | −0.7044 … +0.7391 | 77 |
| crypto_spot | post-deploy | 24,521 | 24,521 | 100.0 | 24,521 | −0.6874 … +0.5790 | 26 |
| **xstock_spot** | **pre-deploy** | **1,034** | **0** | **0.0** | **0** | — | 122 |
| **xstock_spot** | **post-deploy** | **64** | **64** | **100.0** | **0** | **−0.6608 … +0.6845** | 59 |

**The three pass conditions:**
1. **OBJ-1 xStock DBS now carries — YES.** 0/1,034 → 64/64 (100%), across 59 distinct symbols, every value inside the required [−1,1] (min −0.6608, max +0.6845). The original defect measurement was 0/28; the post-fix cohort is larger and complete.
2. **OBJ-2 xStock DI still null — YES (ratified non-carry intact).** `di_at_queue` = 0 carried in **both** eras (0/1,034 and 0/64). The fix did not accidentally start carrying DI under the crypto-named column — exactly the #377-H1 / #502 decision.
3. **Crypto byte-invariant — YES.** 100.0% carry on both columns in both eras; the one live pool row at check time (EVAA/USD, dbs −0.6689, di 28.9964) confirms current behavior.

**Boundary arithmetic checked before claiming causation (rule 24.a).** Within 2026-07-27 the xStock rows split cleanly: last NULL row `20:26:35Z`, first carried row `20:51:07Z` — the flip **brackets** the 20:44:12Z commit with nothing straddling it. No xStock rows exist for 07-25/07-26 (weekend shutdown, rule 17 — crypto ran through those days, confirming the gap is the trading window and not a feed outage).

**Method note (recorded against interest):** the first query — the one the scheduled task specified — returned only a crypto row and would have produced a third "still drought-dry, re-check next run". The proof existed the whole time in a table the task did not name. *A dry transient queue is not evidence of absence when a durable transcript of that queue exists* — the same absent-as-valid trap as #546/#568, avoided only by asking which other table carries the column.
