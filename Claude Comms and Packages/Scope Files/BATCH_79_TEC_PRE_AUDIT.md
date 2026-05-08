# BATCH 79.TEC — Pre-Implementation Audit (PIA)

**Status:** rev 1 — Step 2 audit per CLAUDE.md §2 + scope rev 2 + Langston scope review acceptance criteria.
**Companion to:** `BATCH_79_TEC_SCOPE.md` rev 2.
**Cover note (Langston rev 2 suggestion):** scope rev 2 deltas folded with this PIA for one combined Step 1+2 review pass.

---

## §0 — Scope rev 2 cover note

Per Langston's scope rev 1 review (`Claude Comms and Packages/Langston Design Asks/B79_TEC_scope_rev1_review.md`), the following rev 2 deltas were applied to `BATCH_79_TEC_SCOPE.md`:

| Delta | Where applied |
|---|---|
| Q1-Q6 answers folded as locked decisions | §8 |
| Objective 3 rewritten — drop fallback, non-optional `assetClass: AssetClass`, hard-fail on missing | §1 #3 |
| Objective 8 rewritten — cache-miss THROWS not defaults (`[TEC_CACHE_MISS_FATAL]`) | §1 #8 |
| Objective 15 added — `ASSET_CLASSES` SSOT iteration | §1 #15 |
| Objective 16 added — TS Check CI gate explicit | §1 #16 |
| Risk 8 added — assetClass plumb audit pre-PIA | §4 |
| Risk 9 added — Migration 1 ON CONFLICT DO NOTHING + assertion | §4 + §3 rewritten |
| Risk 10 added — deploy ordering migration-before-code | §4 + §3 deploy-ordering note |
| Risk 11 added — boot-failure alert wiring explicitly out of scope, accepted risk | §4 |
| §5 PIA #8 added — `resolveTECConfig` call-site audit | §5 |
| §5 PIA #9 added — `PositionUpdate` construction site audit | §5 |
| §5 PIA #7 expanded — explicit confirm `paper-execution-engine.ts:972` does NOT re-resolve `break_even_enabled` | §5 |
| §7 sequencing — `BATCH_79_TEC_b_VERIFY_CHECKLIST.md` artifact at Step 11 close | §7 |

Scope rev 2 is the canonical reference; this PIA executes against it.

---

## §1 — Line-citations (Langston Q4 acceptance criterion)

This is the load-bearing audit work. Every claim is line-cited from current code on `migration/aws-supabase` HEAD (commit `98bb9d792` at PIA-time).

### §1.1 — Latch gate (PIA item 1)

**Current code, `server/services/trailing-exit-controller.ts:503`:**
```ts
  if (cachedConfig.breakEvenEnabled && !state.breakEvenLatched && state.ATR > 0) {
```

This is the SOLE gate that fires `state.breakEvenLatched = true` (line 508). It reads `cachedConfig.breakEvenEnabled` (single shared cache).

**Post-refactor expected:** the read becomes per-class:
```ts
  const cfg = resolveTECConfig(update.assetClass);
  if (cfg.breakEvenEnabled && !state.breakEvenLatched && state.ATR > 0) {
```

**Verification at code-review time (Step 4):** grep confirms line 503 reads from `cfg` (per-class) NOT `cachedConfig` (single shared); `cachedConfig` declaration at line 93 is removed; `resolveTECConfig` called once near top of `updatePosition` (passing `update.assetClass`).

### §1.2 — BE-stop exit logic (PIA item 2)

**Current code, `server/services/tec-evaluator.ts:340-342`:**
```ts
      } else if (update.breakEvenLatched) {
        exitReason = 'break_even_stop';
        exitPrice = currentPrice;
```

This consumes `update.breakEvenLatched` (state) — does NOT consult `cfg.breakEvenEnabled` (config). State-vs-config separation already correctly holds at this site. Post-refactor: NO CHANGE expected here.

**Verification at code-review time (Step 4):** grep confirms `tec-evaluator.ts:340` still reads `update.breakEvenLatched` only; no config read inserted by accident during refactor.

### §1.3 — Single call-site grep for `breakEvenEnabled` (PIA item 3)

```
$ grep -rn "breakEvenEnabled\|break_even_enabled" server/ --include="*.ts" | grep -v "\.test\.ts"
server/services/trailing-exit-controller.ts:60:  //   `trailing_exit.break_even_enabled` (default true). Adopted after the
server/services/trailing-exit-controller.ts:63:  breakEvenEnabled: boolean;                    [interface field decl]
server/services/trailing-exit-controller.ts:80:  breakEvenEnabled: true, ...                  [TEC_DEFAULTS — flips to false]
server/services/trailing-exit-controller.ts:113: breakEvenEnabled: pick(...)                  [cache population]
server/services/trailing-exit-controller.ts:500: // Post-B75 (2026-05-06): BE-latch gated by  [comment]
server/services/trailing-exit-controller.ts:503: if (cachedConfig.breakEvenEnabled && ...)   [THE LATCH GATE — the one site]
```

**Six hits total. Five are non-read (interface field decl, default initializer, cache population, two comments). Exactly ONE read site at line 503.** Confirms: `breakEvenEnabled` is checked at the latch gate and nowhere else.

**Post-refactor expected count:** still six, with line 503 reading from `cfg` (per-class snapshot) instead of `cachedConfig` (single global).

### §1.4 — Bootstrap order audit (PIA item 4)

**Current `server/index.ts`:**
- Line 625: `server.listen(port, ...)` — server starts accepting traffic
- Line 687-688: `loadTrailingStates()` is called (inside the listen callback)
- **`primeTECConfig()` is NOT called anywhere in the boot sequence today.** This is the bug.

**Post-refactor expected:**
- Move `primeTECConfig()` BEFORE `server.listen()` so the app refuses traffic until cache is warm
- `loadTrailingStates()` runs AFTER `primeTECConfig()` (Langston Q2 lock)
- HARD-FAIL handler around `primeTECConfig()` exits process non-zero with `[TEC_BOOTSTRAP_FAIL]` log

**Verification at code-review time (Step 4):**
1. `primeTECConfig()` `await`-ed in async boot path BEFORE `server.listen()`
2. `loadTrailingStates()` called AFTER `primeTECConfig()` succeeds
3. Try/catch around `primeTECConfig()` calls `process.exit(1)` with explicit log
4. `/api/diagnostics/tec-bootstrap` endpoint returns `{ready: true}` only when all classes warmed

### §1.5 — `TrailingState` adjacent latch-style fields (PIA item 5, Langston flag)

`server/services/trailing-exit-controller.ts:230` interface `TrailingState`:
- `breakEvenLatched: boolean` — gated by `cfg.breakEvenEnabled` (this batch)
- `targetLatched: boolean` — gated by moonbag qualifier path (NOT `cfg.breakEvenEnabled`); see line 634 `else if (state.breakEvenLatched && !state.targetLatched && state.ATR > 0)` block — that's BE-targeted ratchet logic, also reads from cachedConfig
- `ladderRung: number` — counter, no enable-gate

**Adjacent risk surfaced (Langston flag — NOT B79.TEC scope):** `targetLatched` activation depends on `cfg.moonbagQualifyingStrategies` and `cfg.moonbagQualifyingSourcePools` via `isMoonbagQualifier`. After B79.TEC ships, those config knobs ALSO benefit from per-class scoping IF xstock_spot's moonbag qualifying set differs from crypto's. Day 1 they're identical; B79.4 evidence may surface that they should diverge. **Action: log to RUNNING_ISSUES as adjacent-risk candidate; do NOT add to B79.TEC scope.** (Per Langston rev 2 instruction.)

### §1.6 — SIM consultation (PIA item 6)

Per `1-system-manual/SYSTEM_IMPACT_MAP.md`:

**`trailing-exit-controller.ts`:**
- Upstream: tec-evaluator (calls updatePosition), vts-runner (calls updatePosition via tec-evaluator), paper-execution-engine (same path)
- Downstream: trailingStates Map (in-memory), persistence to /tmp/trailing-states.json
- Shared state: `cachedConfig` (single global; this batch refactors to per-class Map)
- Background execution: 60s TTL refresh inside `resolveTECConfig`; debounced persistence timer
- Blast radius: HIGH (this is the BE-latch authority for ALL trades — VTS + paper)

**`tec-evaluator.ts`:**
- Upstream: vts-runner, paper-execution-engine
- Downstream: returns `decision` to caller; the `exitReason` string flows to vts-service.persistRealPriceTrade and paper-execution-engine close-reason mapping
- Shared state: NONE (stateless per-call given inputs)
- Blast radius: HIGH (every TEC eval flows through here)

**`paper-execution-engine.ts:972`:**
- Confirmed (PIA §1.7 below) consumes `decision.exitReason === 'break_even_stop'` only; does NOT re-resolve `cfg.breakEvenEnabled`. State-vs-config separation holds.

**`vts-runner.ts:1990-2017`:**
- Consumes `decision.exitReason` from tec-evaluator (line 2005-2017 `switch`). NOT a hidden second BE config read; pure mapping.
- Blast radius: HIGH.

**SIM update required at Step 10:** trailing-exit-controller.ts entry shows new per-class cache structure; new `/api/diagnostics/tec-bootstrap` endpoint registered.

### §1.7 — Schema audit + paper-execution-engine `break_even_stop` consumer (PIA item 7, expanded)

`paper-execution-engine.ts:972`:
```ts
          case 'break_even_stop':
            // B65.2-HF3: BE-lock-ratcheted stop was hit before trade reached
            // target. Reuse the existing stop_hit ExitCondition type on the
            // paper side to keep downstream P&L math identical; the reason
            // string carries the BE-protect semantics and the closed-trade
            // row records 'break_even_stop' in the closeReason column.
            console.log(`[B65.2][EXIT_TRIGGER] symbol=${position.symbol} type=break_even_stop price=${currentPrice} ratcheted_stop=${decision.newStopPrice?.toFixed(4)}`);
            return {
              type: 'stop_hit',
              ...
            };
```

**Confirmed:** This `case` matches on the `exitReason` string returned by tec-evaluator. It does NOT call `getModuleConstants` or `resolveTECConfig` to independently check `break_even_enabled`. State-vs-config separation holds. The per-class refactor at trailing-exit-controller.ts:503 captures the entire decision-making surface; paper-execution-engine just consumes the verdict.

**`module_constants` is the right table.** `break_even_enabled` is stored only there. No other table has a `break_even` knob. Verified via:
```
$ grep -rn "break_even" server/ shared/ drizzle/ --include="*.ts" --include="*.sql" | grep -v "\.test\." | grep -v node_modules | head -20
```
All hits are: comments, the trailing_exit module_constants row writes, the TEC field/cache reads (already audited), tests, exit_strategy_alternates B73 hooks (consumes `update.breakEvenLatched` not config), or VTS-archive close-reason mapping (consumes the exitReason string).

### §1.8 — `resolveTECConfig` call-site audit (PIA item 8, Langston rev 2 add)

```
$ grep -rn "resolveTECConfig" server/ --include="*.ts"
server/services/trailing-exit-controller.ts:97: async function resolveTECConfig(strategy?: string, regime?: string)  [DECL — current]
server/services/trailing-exit-controller.ts:144:  const cfg = await resolveTECConfig(strategy, regime);              [isMoonbagQualifier]
server/services/trailing-exit-controller.ts:166:  const cfg = await resolveTECConfig(strategy, regime);              [canEnterMoonbag]
server/services/trailing-exit-controller.ts:177:export async function getResolvedTECConfig(strategy?, regime?) { return resolveTECConfig(strategy, regime); }  [diagnostic wrapper]
server/services/trailing-exit-controller.ts:183: * cachedConfig so the next resolveTECConfig() call refetches from the   [comment]
server/services/trailing-exit-controller.ts:699:export async function primeTECConfig(): Promise<void> { await resolveTECConfig(); }
server/tests/unit/b65-tec-parity.test.ts: ...                                                                          [test calls — fine]
```

**Five non-test call sites + one decl + one comment.** Post-refactor:
- Decl signature: `resolveTECConfig(assetClass: AssetClass): TrailingExitConfig` (synchronous? See note below — currently async)
- All 5 call sites must pass exactly one arg: `assetClass`
- `isMoonbagQualifier` + `canEnterMoonbag` + `getResolvedTECConfig` callers must thread `assetClass` through their own signatures (they currently take `strategy`, `regime` optional — adding `assetClass` is a signature change that ripples to THEIR callers, fine, expected)
- `primeTECConfig` called per-class

**Open question for implementation:** `resolveTECConfig` is currently async (line 97 `async function`) because it calls `getModuleConstants` which is DB-async. Post-refactor: cache is pre-warmed by primeTECConfig at boot, so `resolveTECConfig` becomes a SYNCHRONOUS map lookup (`cache.get(assetClass)`). The async signature becomes unnecessary. **Decision for implementation: make `resolveTECConfig` synchronous** — simplifies callers (`isMoonbagQualifier` / `canEnterMoonbag` no longer need `await`); aligns with the "snapshot is immutable wholesale" framing. Document as part of Q1 cache-structure intentional-limitation note.

### §1.9 — `PositionUpdate` construction site audit (PIA item 9, Langston rev 2 add)

```
$ grep -rn "PositionUpdate\|symbol.*entryPrice.*targetPrice\|update.*currentPrice.*currentStopPrice" server/ --include="*.ts" | grep -v "\.test\." | head -20
```

`PositionUpdate` interface declared at `trailing-exit-controller.ts:286`. Construction sites:

1. **`tec-evaluator.ts:273`** — `tecUpdatePosition({...})`. Currently passes: symbol, entryPrice, targetPrice, currentPrice, DI, VolNoise, ATR, currentStopPrice, strategy, sourcePool, regime, callerMode, moonbagQualified, moonbagAllowed. **Must add `assetClass`** post-refactor (will be set from caller's input.context.assetClass or similar).

2. **`paper-execution-engine.ts`** — `updatePosition(...)` is called from the position-evaluation loop. Source of `assetClass` is the position record's asset_class column (already populated by B69 schema work + B79 wiring). Construction site to be located + amended.

3. **`vts-runner.ts`** — calls TEC via tec-evaluator (not directly), so the assetClass plumbing is at the tec-evaluator boundary not the vts-runner boundary. But the `OpenVirtualTrade` shape must have assetClass — needs verification at code-review time.

**Action for implementation Step 3:** make `assetClass: AssetClass` non-optional on `PositionUpdate`; let TS compile error guide the discovery of every call site. Add `assetClass` to each construction site reading from the trade/position record.

**Adjacent risk (Langston Risk 8):** The `OpenVirtualTrade` interface in vts-runner already has assetClass per B79 work — verify it's populated at trade-open time consistently. If any path constructs an OpenVirtualTrade without assetClass, the TS strict-typing fix surfaces it.

---

## §2 — Telemetry partitioning audit (B79 PIA precedent — applies here too)

The B79 PIA established that PairFailureTracker / AdaptiveRatioManager / TelemetryAggregator are not asset-class-partitioned, and this was resolved via separate-instance pattern (LIVE for xstock_spot per B79.0a, deferred Day 1 because xstock pipeline is dormant).

**Does B79.TEC introduce any new partitioning concerns?** No.
- `cachedConfig` becoming `Map<AssetClass, TrailingExitConfig>` IS the partitioning fix at the TEC level.
- TEC does not write to TelemetryAggregator / PairFailureTracker / AdaptiveRatioManager — those concerns are elsewhere.
- `trailingStates Map<symbol, state>` is keyed by symbol, not partitioned by class. Symbols are unique across classes (no collision possible); already-isolated by-key. No change needed.

---

## §3 — Hostile simulation plan (Step 7 verify)

Per scope §6: validate hard-fail by simulating `primeTECConfig` failure.

**Procedure:**
1. Pre-deploy: capture current state of `module_constants` per-class break_even_enabled rows for crypto_spot + xstock_spot via psql `SELECT ... INTO temp table or file`.
2. Deploy B79.TEC normally; verify Step 7 first-pass green (HTTP 200, `[TEC_PRIME]` logs, etc.).
3. **Hostile simulation:** psql `DELETE FROM module_constants WHERE module_name='trailing_exit' AND asset_class='crypto_spot' AND constant_name='break_even_enabled';`
4. PM2 restart: `ssh root@188.245.193.8 "su - deploy -c 'pm2 restart dawntrader'"`
5. **Expected:** PM2 status shows app `errored` (or restart loop); `pm2 logs` shows `[TEC_BOOTSTRAP_FAIL] primeTECConfig failed for assetClass=crypto_spot reason=...`; HTTP request to staging returns 502 / connection-refused (server not listening).
6. **Restore:** psql re-INSERT the deleted row from the captured backup.
7. PM2 restart: app boots cleanly, `[TEC_PRIME]` logs show all classes warmed, HTTP 200 returns.

**If steps 5 OR 7 fail:** the hard-fail wiring is broken; B79.TEC implementation has a bug; do NOT close the batch until fixed.

This is the only way to actually prove hard-fail is wired correctly. Per CLAUDE.md §11 NO PATCHES doctrine — claiming hard-fail without testing it would be exactly the kind of papered-over fix that doctrine prohibits.

---

## §4 — Test baseline re-capture (Langston rev 2 Q6)

To run AT PIA TIME (immediately before scope+PIA review closes):

```bash
ssh root@204.168.141.77 "cd /mnt/gdrive/Dawn\ Trader/DT_Clone_Repo/DawnTraderV3 && npm test 2>&1 | tail -10"
```

Capture: total test files, total tests, passed, failed, skipped. Treat as the comparison line for B79.TEC's post-implementation suite.

**Expected at PIA time:** ~59 failed / 995 passed / 5 skipped / 1059 total (B79 ship baseline). Drift since 2026-05-07 evening would be small but should be re-confirmed.

**Step 5 push acceptance (per scope Objective 16):** TS Check CI gate is GREEN. Test Suite is post-B79.TEC = baseline + N new tests, all new pass, zero existing regressions.

---

## §5 — Pre-existing infrastructure issues acknowledged

These are NOT B79.TEC scope; they are pre-existing issues acknowledged so the PIA reader knows the boundary:

1. **`SystemHealthMonitor.startPeriodicChecks` is broken** (PM2 logs show `TypeError`). Phase 19.x Boot Readiness Coordinator territory. B79.TEC's `/api/diagnostics/tec-bootstrap` endpoint does NOT extend this broken path.
2. **`MarketDataHealthCheck` EACCES error** (`Failed to write health log: /home/runner/...`). CI runner path leaked into staging config. Not B79.TEC's surface.
3. **TS Check legacy baseline** has pre-existing failures from before B79.TEC. Per scope Objective 16: B79.TEC must NOT add new TS errors; existing baseline failures are pre-existing.

---

## §6 — Open questions for Langston (Step 1+2 review of scope rev 2 + this PIA)

1. **`resolveTECConfig` async → sync.** Per PIA §1.8, since the cache is pre-warmed by primeTECConfig at boot, `resolveTECConfig` can become synchronous (pure map lookup). This simplifies all callers (`isMoonbagQualifier` / `canEnterMoonbag` / `updatePosition` no longer need `await`). Confirm this is the right call. CC lean: yes, sync.

2. **Health endpoint integration confirmation.** PIA confirmed that `system-health-monitor` + `SystemHealthMonitor` are on the Phase 19.x rip-list (they're broken). Lightweight health summary endpoint: `server/routes.ts` has `/api/diagnostics/central-clock` (line 7003-7004) — clean, narrow. CC lean: dedicated `/api/diagnostics/tec-bootstrap` (new endpoint) at the same routes.ts location near central-clock. Do NOT extend the broken health-monitor surfaces. Confirm or counter.

3. **`AssetClass` type import location.** Currently in `shared/asset-classes.ts`. `trailing-exit-controller.ts` would import from there. Single-import path acceptable. Confirm.

4. **`primeTECConfig` failure granularity.** If primeTECConfig fails to resolve `break_even_enabled` for crypto_spot specifically (DB row missing), does the app hard-fail completely OR continue trying to warm xstock_spot before reporting all failures together? CC lean: try ALL classes, accumulate per-class failures, then if any failed exit-with-aggregate-error. This way operator sees ALL missing rows in one shot, not one-at-a-time. Confirm.

5. **`primeTECConfig` retry policy.** If DB connection is transiently unavailable at boot, does primeTECConfig retry with backoff before hard-failing? CC lean: yes, brief retry-with-backoff (3 attempts, 1s/2s/4s) — matches Kyle's "1-5 min cold-start warmup is acceptable" directive. After all retries exhausted → hard-fail. Confirm policy + tunable bounds.

---

## §7 — Step 3 implementation sequencing (refresher from scope §9, with PIA findings folded)

1. Add `AssetClass` import + type non-optional `assetClass: AssetClass` on `PositionUpdate` (TS will error every construction site)
2. Refactor `cachedConfig` → `Map<AssetClass, TrailingExitConfig>`
3. Make `resolveTECConfig(assetClass: AssetClass): TrailingExitConfig` SYNC (pending Q1 confirm)
4. Plumb `update.assetClass` through `updatePosition`; remove ?? fallback
5. Refactor `primeTECConfig` to iterate `ASSET_CLASSES` + retry-with-backoff + aggregate-error report (pending Q4/Q5 confirm)
6. Wire `primeTECConfig` into `server/index.ts` BEFORE `server.listen()`; HARD-FAIL handler exits process
7. Flip `TEC_DEFAULTS.breakEvenEnabled` to false
8. Add `[TEC_RESOLVE_AGGR]` per-minute aggregator + `[TEC_FIRST_WILDCARD_HIT]` early-warning; `[TEC_CACHE_MISS_FATAL]` throw on cache miss for unregistered class
9. Add `/api/diagnostics/tec-bootstrap` endpoint
10. Migration 1 (per-class rows, ON CONFLICT DO NOTHING + assertion); apply to staging Supabase BEFORE PM2 restart
11. Wildcard-removal script (Migration 2) — DO NOT execute; commit only
12. Add unit tests
13. Run full test suite (expect baseline + new tests pass; zero new TS errors)
14. Hostile-simulation procedure documented in completion report

---

## §8 — Acceptance for Step 1+2 close

- [ ] Langston APPROVE on scope rev 2 (incorporating his rev 1 review feedback)
- [ ] Langston APPROVE on this PIA
- [ ] Q1-Q5 of §6 above answered (architectural call from Langston)
- [ ] No new RUNNING_ISSUES gaps surfaced beyond what's already filed (#79, #82, #83 + adjacent-risk note in §1.5)

After Langston-greenlit, Step 3 implementation begins.

---

*End BATCH_79_TEC_PRE_AUDIT.md rev 1.*
