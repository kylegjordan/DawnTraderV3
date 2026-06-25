# B-TEC-SELFHEAL — Pre-Implementation Audit (Step 2)

**Owner:** OLD Claude (CC-A). **Drafted:** 2026-06-25. Companion to `B_TEC_SELFHEAL_SCOPE.md`. Built from a direct SIM read + a full up/downstream code trace (Explore sweep + targeted reads). **Status:** factual blast-radius map complete; the per-OBJ change-impact + the OBJ-3-timer section finalize after Langston's Step-1 (the OBJ-3 INCLUDE/OMIT call shapes the timer component).

---

## 1. Components in scope + their dependency surface (SIM-style per-component)

### 1.1 `resolveTECConfig` (`server/services/trailing-exit-controller.ts:233-327`) — OBJ-1 target
- **What:** synchronous per-asset-class config resolver. Returns the cached `TrailingExitConfig` snapshot; throws `[TEC_STALE_FAIL_CLOSED]` past the 300000ms ceiling (line ~248) and `[TEC_CACHE_MISS_FATAL]` on an unprimed class (line ~321). Fires the lazy background refresh at line ~271 (`now >= expiresAt && !inFlight`), wrapped in `Promise.race([refresh, 45s timeout])` (B-NEW-40).
- **Upstream feeders:** the 5 state maps (`tecConfigCache`/`tecConfigExpiresAt`/`tecConfigLastSuccessAt`/`tecConfigRefreshInFlight`/`tecRefreshFailCount`, decl :156-168), written by `primeTECConfig` (boot) + `refreshTECConfigForClass` (lazy). DB source: `module_constants` (trailing_exit rows).
- **Downstream consumers (6 direct callers):** `isMoonbagQualifier`:444, `canEnterMoonbag`:466, `getResolvedTECConfig`:478 (diagnostic), `updatePosition`:1022, `tec-evaluator.ts:208` (`resolveTECConstants`) + the moonbag calls 309-321 — ALL reached transitively through `evaluateTECExit`. So a throw here surfaces inside `evaluateTECExit`.
- **Shared state:** mode-SHARED cache (not split-brain — config/vocabulary, like S2/S5/S15; SIM B79.TEC/B-NEW-40 section). 4 classes: crypto_spot, crypto_perp, xstock_spot, xstock_perp.
- **Background execution:** the lazy refresh (fire-and-forget, coalesced, 45s-fenced). The `startResolveAggregator` 60s timer is a COUNTER only (not a refresh).
- **Blast radius of OBJ-1 change (refresh-before-throw):** LOW-MEDIUM — reorders the existing refresh-trigger to also run on the stale-past-ceiling path. Must NOT change the throw (fence preserved) and must route through the SAME inFlight coalescer + 45s fence (no new refresh path, no double-fire). Touches only the stale-branch control flow.

### 1.2 VTS exit loop — `resolveOpenVirtualTrades` (`vts-runner.ts:2264-~2550`), `evaluateTECExit` call at :2421 — OBJ-2 target
- **What:** per-open-trade loop (`for (const [tradeId, trade] of openVirtualTrades)` :2381) that calls `evaluateTECExit` (:2421) to manage trailing/break-even/target exits; pushes exits to `tradesToClose`.
- **Upstream:** `openVirtualTrades` map; `priceDataMap`; per-trade TEC state (`getTrailingState`).
- **Downstream / control flow:** called FIRST in `runPhase10SimulationCycle` (`await resolveOpenVirtualTrades()` :3273) BEFORE the scan/open phase (`getIdealPoolPairs` :3293 + strategy eval/open :3300+). Cycle wrapped only by the outer `startAutonomousSimulation` `[ITEM4]` catch (:4140-4148).
- **★ Blast radius TODAY (the defect):** NO per-trade try/catch around :2421 → a single trade's `evaluateTECExit` throw aborts the whole loop → propagates through `resolveOpenVirtualTrades` → aborts `runPhase10SimulationCycle` at :3273 → the scan/open phase (:3293+) is SKIPPED → whole multi-class cycle dead that tick (caught by [ITEM4], retried next tick — but re-throws while stale). **Confirmed by the 06-22 logs ([ITEM4] cycle error carrying TEC_STALE).**
- **Blast radius of OBJ-2 change (add per-trade try/catch):** LOW — mirrors the EXISTING proven pattern at `paper-execution-engine.ts:794`. One trade's throw → log + `continue` → loop finishes → scan/open proceeds. Does not change exit LOGIC or the decision for a healthy trade.

### 1.3 Paper/active exit loop — `evalExitConditions`/`checkExitConditions` (`paper-execution-engine.ts:780-1180`), `evaluateTECExit` at :1029 — REFERENCE (already correct), NOT changed
- **Already per-position isolated:** `for (const position of openPositions)` with a per-position `try { … } catch (error) { log }` at :794, so a stale-config throw skips only that position; opens unaffected; no cycle abort. This is the pattern OBJ-2 copies into VTS. **No change needed here** — but it confirms the intended design + is the parity reference. (Dormant until B7b active turn-on; the self-heal OBJ-1 still benefits it — without OBJ-1, every position's exit-eval throws each tick during a stale window = trailing-exit management frozen for all open positions until restart.)

### 1.4 `primeTECConfig` / `refreshTECConfigForClass` (lifecycle) — NOT changed (OBJ-1 reuses `refreshTECConfigForClass`)
- `primeTECConfig` (boot, index.ts:815, HARD-FAIL→process.exit) + `refreshTECConfigForClass` (the actual DB read + wholesale snapshot set + stamps `lastSuccessAt`/`expiresAt`/resets `failCount`). OBJ-1 fires `refreshTECConfigForClass` THROUGH the existing inFlight+45s machinery on the stale path — no change to the refresh function itself.

### 1.5 (OBJ-3) bounded periodic re-warm timer — ❌ OMITTED (Langston Step-1)
- **OMITTED.** No new always-on singleton, no new SIM §17 state. OBJ-1+OBJ-2 carry the fix. Recorded considered-and-declined in RUNNING_ISSUES #349 with a conditional reopen trigger (OBJ-5 observes a zero-consumer class self-healing; reopens only if the active/paper first-consult blip is ever material). Removes the timer × 45s-fence × coalescer interaction surface from the batch.

### 1.6 OBJ-1 ordering re-walk — the 6 `resolveTECConfig` callers + 2 `evaluateTECExit` callers against the final design (Langston Step-1 ask)
**Final OBJ-1 ordering:** at the TOP of `resolveTECConfig` (before BOTH the staleness throw and the cache-miss throw), schedule the coalesced non-awaited background refresh on expiry (`now >= expiresAt && !inFlight` → the existing `Promise.race([refresh,45s])` block, extracted to a helper so it is called from one place). Then the staleness-ceiling check throws (unchanged), then the cache-miss check throws (unchanged), then return cached. Net: every consult that is expired schedules exactly one coalesced refresh REGARDLESS of whether it then throws — so the stale-past-ceiling consult now self-heals instead of latching.

| Caller (file:line) | Path | Effect of OBJ-1 reorder | Risk |
|---|---|---|---|
| `tec-evaluator.ts:208` `resolveTECConstants` | exit (the hot one) | now self-heals: a stale consult schedules the refresh then throws; next exit-cycle consult succeeds | none — throw unchanged, refresh non-blocking |
| `trailing-exit-controller.ts:1022` `updatePosition` | exit | same self-heal; reached via evaluateTECExit | none |
| `:444` `isMoonbagQualifier` / `:466` `canEnterMoonbag` | config-read (within evaluateTECExit) | same self-heal | none — read-only consumers |
| `:478` `getResolvedTECConfig` | diagnostic accessor | same self-heal (a diagnostic poll now also nudges a stale class warm) | none — benign |
| `evaluateTECExit` @ `vts-runner.ts:2421` | VTS exit loop | OBJ-1 self-heals the cache; OBJ-2 isolates the (now-transient) first-consult throw so the cycle never aborts | LOW — the two fixes compose; covered by the OBJ-4 isolation test |
| `evaluateTECExit` @ `paper-execution-engine.ts:1029` | paper/active exit loop (ALREADY isolated :794) | OBJ-1 self-heals; the existing per-position catch already isolates the transient throw → no cycle/engine impact | none — unchanged path; benefits from OBJ-1 |

**Coalescer invariant (the load-bearing property — OBJ-4 test):** because the refresh-schedule sits behind `!tecConfigRefreshInFlight.has(assetClass)`, N stale consults of one class in a window produce exactly ONE in-flight refresh, not N. This is what makes the 120/hr stuck pattern cost one refresh, and is the explicit OBJ-4 assertion.

## 2. Tests — the regression surface (what the fix must not break)
- `b-new-40-tec-refresh-hang.test.ts`: asserts (e) past-ceiling `resolveTECConfig` THROWS, and the 45s timeout fence releases the inFlight Map. **OBJ-1 impact:** the throw stays (assertion holds); ADD that the stale consult now ALSO schedules a refresh (the inFlight entry appears) + a next-consult-after-successful-refresh succeeds. Careful: the test mocks a HUNG refresh — so the "still throws" path must remain true while a refresh is hung; only a SUCCESSFUL refresh clears staleness.
- `b65-tec-parity.test.ts` (7 scenarios): exit-LOGIC parity VTS↔paper. **Unchanged** — OBJ-2 adds error isolation, not logic; must stay green.
- `b79-tec-per-class-cache.test.ts`, `b79-0n-tec-b-strict-hardfail.test.ts`, `b80-tec-per-trade-keying.test.ts`: cache/hardfail/per-trade-keying — unaffected by OBJ-1/OBJ-2; must stay green.
- NEW (OBJ-4): a VTS-isolation test — one stale-class open trade does not abort the cycle / the other trades + scan-open proceed.

## 3. Cross-cutting / liveness
- TEC cache = mode-SHARED (intentional). OBJ-1 changes control flow, not the sharing → no split-brain impact. OBJ-2 is VTS-loop-local. OBJ-3 (if included) ADDS an always-on timer singleton → SIM §17 entry required.
- No Central-Clock coupling today (resolveTECConfig uses Date.now(); the 45s fence is a one-shot setTimeout). If OBJ-3 timer is included, decide Central-Clock-subscribe vs `setInterval().unref()` (the existing `startResolveAggregator` uses plain `setInterval().unref()` — precedent).

## 4. Risk + rollback
- **Risk:** LOW-MEDIUM. The changes are surgical (a stale-branch reorder + a try/catch mirror) on a SENSITIVE safety path; the fail-closed property must be provably preserved (OBJ-5 verification + the b-new-40 test). Worst case of a bug in OBJ-1 = a double-refresh (idempotent, coalesced) or a missed throw (caught by the preserved-throw test). Worst case of OBJ-2 = a swallowed real error (mitigated: log loudly + a counter, same as paper:949).
- **Rollback:** pure-code, no migration → revert the commit + redeploy. No DB/schema change.

## 5. Open items — RESOLVED at Langston Step-1 (2026-06-25)
1. ✅ OBJ-3 INCLUDE vs OMIT → **OMIT** (gold-plating on a safety path; #349 records considered-and-declined + conditional reopen).
2. ✅ change-class → **CONFIRMED architecture** (OBJ-1 reorders the kill-switch safety path; OBJ-2 changes VTS control flow).
3. ✅ OBJ-1 shape → **schedule the coalesced non-awaited refresh at the top of `resolveTECConfig` (before both throws); extract the existing line-271 block to a helper so it has ONE call site**; throw unchanged. Coalescer guarantees one in-flight refresh (the OBJ-4 assertion).
4. Config-read consumers (moonbag qualifiers :444/:466, diagnostic :478) need no separate isolation — they ride evaluateTECExit's handling (VTS = OBJ-2 isolation; paper = existing :794). Re-confirm at Step-4 diff that the helper extraction doesn't change their resolved values.

## 6. Step-2 conclusion
Pre-audit complete; the 6+2 caller surface is re-walked against the final OBJ-1 ordering (§1.6); blast radius is LOW (VTS-loop-local OBJ-2 + a stale-branch reorder OBJ-1); the fail-closed safety property is preserved by construction (throw unchanged) and gated by OBJ-5(c). No migration, pure-code, revert-to-rollback. Ready for Langston Step-2 sign-off → implementation.
