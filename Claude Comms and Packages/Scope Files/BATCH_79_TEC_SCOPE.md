# BATCH 79.TEC — Per-asset-class TEC configuration architecture (Phase 24)

**Status:** rev 2 — Langston Step 1+2 review APPROVE WITH REVISIONS applied (review at `Claude Comms and Packages/Langston Design Asks/B79_TEC_scope_rev1_review.md`). Rev 2 deltas folded with PIA cover per Langston's suggestion ("fold rev 2 deltas into PIA cover and close both in one review pass").
**Workflow:** 11-step canonical (full).
**Branch:** `migration/aws-supabase`.
**Sequencing:** FIRST sub-batch in Phase 24 (per Langston design call 2026-05-08 07:44 UTC). Precedes B79.0a (live xstock scanner wire-in) + B79.4 (exit-strategy ablation extension).
**Trigger:** B79 ship surfaced that BE-latch fires for new VTS trades despite global `module_constants.trailing_exit.break_even_enabled = false`. Two structural bugs (per RUNNING_ISSUES #79 + #82): (1) TEC config resolution hardcodes `assetClass: 'crypto_spot'` at `trailing-exit-controller.ts:104`; (2) cold-start cache race — `cachedConfig` initial value is `TEC_DEFAULTS` (`breakEvenEnabled: true`) until first async caller refreshes; `primeTECConfig()` exists but is never called by app bootstrap.

**Doctrine reference:** Kyle directive 2026-05-08 NO PATCHES (CLAUDE.md §5 #15) — this batch is the long-term sustainable architectural fix, not a patch.

---

## §-1 — Locked architectural decisions (do not relitigate)

All locked via the rev 1 + condensed + file-first design ask iterations 2026-05-08. Reference docs:
- `Claude Comms and Packages/Langston Design Asks/B79_TEC_design_ask_rev1.md` (full ask)
- `Claude Comms and Packages/Langston Design Asks/B79_TEC_design_ask_rev1_reply.md` (Langston Q1-Q5 architectural opinion)
- `MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10c.4d (refinements summary)

| Decision | Lock |
|---|---|
| Cache structure | `Map<AssetClass, TrailingExitConfig>`; immutable wholesale snapshots; refresh on TTL not per-field. |
| `resolveTECConfig` signature | `resolveTECConfig(assetClass: AssetClass): TrailingExitConfig`. Drop optional `strategy?` / `regime?` args (decorative if not in cache key). |
| Bootstrap ordering | `primeTECConfig` BEFORE `loadTrailingStates`. Canonical: DB connectivity → primeTECConfig → loadTrailingStates → market feed → updatePosition. |
| State vs config rehydrate | `state.*` (`breakEvenLatched`, peak, trailing-active) rehydrate verbatim from disk. `config.*` re-resolve from current DB rows on rehydrate. |
| Boot failure mode | **HARD-FAIL** on `primeTECConfig` failure for any registered asset class. Same in production AND development. No degraded-boot. No env flag. (Kyle directive 2026-05-08, Q3 resolved.) |
| `TEC_DEFAULTS.breakEvenEnabled` | Flip `true` → `false` (fail-closed). Asymmetric risk argument: accidentally-on costs real money on BE-stopped trades; accidentally-off is degraded-but-functional TEC. |
| Per-class DB rows | `(trailing_exit, *, crypto_spot, *, *, break_even_enabled) = false` (Variant K winner, locked) + `(trailing_exit, *, xstock_spot, *, *, break_even_enabled) = false` (Day 1 default; flips after B73 evidence per #80). |
| Wildcard `(*, *, *, *)` row removal | Two-step migration. Step 1 = code + per-class rows. Step 2 = DELETE wildcard. Min 48h gap. Idempotent signature-guarded. Rollback path documented. |
| Zombie BE-latched trades | LEFT AS-IS. 4 zombies from 2026-04-25 (Q/USD, RAIN/USD, UMXM/USD, RENDER/EUR) run through to natural close. PIA verifies their behavior remains correct under new architecture. |
| Boot Readiness Coordinator (broader systemic version) | DEFERRED to Phase 19.x. Not B79.TEC scope. |

---

## §0 — Re-frame and scope boundary

**This batch fixes ONLY the TEC configuration architecture for the BE-latch path.** Specifically:

✅ In scope:
- Per-asset-class `TrailingExitConfig` cache (replacing single shared cache)
- `resolveTECConfig` signature change + asset-class-keyed dispatch
- `updatePosition` plumbing of `update.assetClass` to TEC config lookup
- `primeTECConfig` wired into app bootstrap before `loadTrailingStates`
- HARD-FAIL on bootstrap failure with `[TEC_BOOTSTRAP_FAIL]` log + health endpoint degradation
- `TEC_DEFAULTS.breakEvenEnabled` flipped to `false` (fail-closed)
- Per-class DB rows seeded (crypto_spot + xstock_spot, both `break_even_enabled = false`)
- Wildcard `break_even_enabled` row deletion via two-step migration
- Cache-miss path in `resolveTECConfig` logs loud
- PIA line-citations for latch gate + BE-stop exit + grep-confirm `config.breakEvenEnabled` checked at exactly one site

❌ Out of scope (deferred or other batch):
- Boot Readiness Coordinator (broader systemic boot architecture) — Phase 19.x
- Other TEC config knobs going per-asset-class (`break_even_trigger_r`, `target_lock_r`, `trail_distance_atr_multiplier`, moonbag config, `rung_floor_slippage_buffer_multiplier`) — `break_even_enabled` is the one we KNOW we need to flip per-class for xstock_spot (post-B73 evidence). Other knobs can be promoted to per-class scopes when evidence drives, NOT speculatively.
- B73 exit-strategy ablation extension to xstock_spot — B79.4
- Live xstock scanner setInterval — B79.0a
- Adjacent state-vs-config entanglements (trailing-active flag, lock-threshold-hit flag) — log to RUNNING_ISSUES if PIA surfaces; do NOT scope-creep into B79.TEC
- Closing or unlatching the 4 zombie trades — Kyle directive: leave as-is

---

## §1 — Numbered objectives (outcomes-based per CLAUDE.md §2)

A batch is done when every objective below is verifiably achieved on staging + Langston second-pass-confirmed.

1. **Cache structure refactored.** `cachedConfig` (single shared) → `Map<AssetClass, TrailingExitConfig>` (per-class, immutable wholesale snapshots). Each entry has its own TTL + invalidation. Verification: code review + diagnostic endpoint dump + grep-confirm no single-instance reads remain.

2. **`resolveTECConfig` signature simplified.** `resolveTECConfig(assetClass: AssetClass, strategy?, regime?)` → `resolveTECConfig(assetClass: AssetClass)`. Optional args removed. Verification: TypeScript compile + grep all call sites pass exactly one arg.

3. **`updatePosition` plumbs assetClass — non-optional, no fallback.** `PositionUpdate.assetClass` is changed from `assetClass?: string` to `assetClass: AssetClass` (non-optional, typed). TypeScript catches every call site that doesn't pass it. `updatePosition` reads `update.assetClass` directly — NO `?? 'crypto_spot'` fallback (silent fallback would reproduce the original bug pattern; rejected per CLAUDE.md §11). If a legacy code path can't supply assetClass, that path HARD-FAILS with `[TEC_UPDATE_MISSING_ASSET_CLASS]` log + throw. Verification: TS compile succeeds with strict typing + grep confirms no fallback expression survives. (Langston rev 2 adjustment.)

4. **`primeTECConfig` wired into app bootstrap.** Called BEFORE `loadTrailingStates` in `server/index.ts`. Iterates `ASSET_CLASSES` enum (or registered subset) and warms the cache for each. Verification: log line `[TEC_PRIME] warming cache for assetClass=X` per class on boot; PM2 logs show ALL registered classes warmed before `loadTrailingStates` runs.

5. **HARD-FAIL on bootstrap failure.** If `primeTECConfig` cannot resolve `break_even_enabled` (or any required key) for any registered asset class, the app refuses to boot. `[TEC_BOOTSTRAP_FAIL]` log line with grep-friendly prefix + per-class diagnostic + process exits non-zero. Verification: simulate via temporary DB row deletion + verify PM2 reports the app fails to start with the explicit error.

6. **`TEC_DEFAULTS.breakEvenEnabled` flipped to `false`.** Fail-closed default. Documented in code comment as intentional safe-state per CLAUDE.md §11 (NOT a silent fallback). Verification: code review + unit test asserting default value.

7. **Per-class DB rows seeded.** New rows: `(trailing_exit, *, crypto_spot, *, *, break_even_enabled) = false` + `(trailing_exit, *, xstock_spot, *, *, break_even_enabled) = false`. Migration file in `drizzle/migrations/`. Verification: psql `SELECT` post-migration shows both rows present + values false.

8. **Cache-miss path THROWS, does NOT default.** Since `primeTECConfig` HARD-FAILs at boot for any registered asset class, the cache cannot legitimately miss for a registered class at runtime. A cache miss therefore means the caller passed an asset class NOT in the registered `ASSET_CLASSES` set — a programming error. Action: throw with `[TEC_CACHE_MISS_FATAL]` log line + explicit error message. Returning `TEC_DEFAULTS` silently here would be the same anti-pattern Objective 3 fights. Verification: unit test exercises the path; production never hits it. (Langston rev 2 adjustment — clarifies cache-miss semantics vs HARD-FAIL doctrine.)

9. **Health endpoint reflects boot state.** `/api/diagnostics/tec-bootstrap` (or equivalent existing health endpoint) returns `{ ready: false, reason: 'primeTECConfig pending' }` until ALL registered asset classes are warmed; `{ ready: true }` after. Verification: curl pre-warmup vs post-warmup.

10. **Wildcard row removal Step 2 script.** `scripts/b79-tec-remove-wildcard-be-row.ts` (or .sql) — idempotent, signature-guarded (pre-check `SELECT COUNT(*) = 1`, capture row before DELETE, signature WHERE includes `value = false AND created_at < <step1_deploy_timestamp>`), documented rollback in script header. **NOT executed in B79.TEC ship — runs ONLY after 48h post-deploy verification gate per §1c.** Verification: script lints clean + dry-run prints expected DELETE target.

11. **Verification gate instrumentation.** `resolveTECConfig` instrumented with resolution-path-by-class counter + log line `[TEC_RESOLVE] assetClass=X path=explicit/wildcard/default count=N`. Used during the 48h gap between Step 1 deploy and Step 2 wildcard removal to confirm resolution NEVER falls through to wildcard. Verification: post-deploy SQL/log audit shows zero `path=wildcard` events for crypto_spot or xstock_spot.

12. **No-touch fence on crypto_spot factor cadence holds.** Pre-deploy + post-deploy SQL on `regime_factor_alternates` cadence shows ±10% of baseline. Verification: same SQL pattern as B78/B79 forward-watch.

13. **Behavioral regression check on currently-open trades.** The 4 zombie BE-latched trades (Q/USD, RAIN/USD, UMXM/USD, RENDER/EUR) continue to behave correctly under the new architecture — `breakEvenLatched: true` state preserved on rehydrate, line-503 latch-gate skips because already-latched, BE-stop fires on price reversal. Verification: PIA line-cites the rehydrate path + post-deploy PM2 log shows the 4 zombies tracking correctly (not re-evaluated as if config changed their state).

14. **Zero new BE-latch on POST-deploy crypto trades.** After deploy, NEW crypto VTS trades that would have BE-latched under the old broken cache do NOT latch BE under the new architecture. Verification: query `signal_eval_archive` (or VTS JSONL) for trades opened post-deploy + closed within first 24h; count `exitReason = break_even_stop` should be ZERO for crypto_spot (excluding the 4 pre-existing zombies).

15. **`ASSET_CLASSES` SSOT iteration.** `primeTECConfig` iterates over a single source-of-truth enum/constant (`ASSET_CLASSES` from `shared/asset-classes.ts`), NOT a locally-hardcoded list. Reason: when B79.0a wires xstock_spot live and future asset classes are added, the primer picks them up automatically — otherwise the next class's first deploy reproduces this exact bug. Verification: `grep -rn "ASSET_CLASSES" server/services/trailing-exit-controller.ts` shows primeTECConfig consumes the SSOT enum + grep confirms exactly one definition site for `ASSET_CLASSES` in `shared/asset-classes.ts`. (Langston rev 2 addition.)

16. **CI TS Check explicit pass criterion.** The signature change to `resolveTECConfig` + non-optional `assetClass` typing on `PositionUpdate` will ripple through call sites. **TS Check CI gate must be GREEN on the B79.TEC push** — this is a behavioral change (the previous batches accepted legacy TS Check baseline failures because they were unrelated; this batch's TS errors WOULD be related). New errors introduced by signature changes must be fixed before push, not deferred to legacy-baseline. Verification: TS Check CI job conclusion = success on push run. (Langston rev 2 addition.)

---

## §1c — Wildcard row removal: two-step gate

Step 1 (this batch's deploy):
- Code lands on staging
- Per-class rows inserted via migration
- Wildcard `(*, *, *, *) break_even_enabled = false` row REMAINS (so any unforeseen resolution-path miss still falls through to a safe value)
- `[TEC_RESOLVE]` instrumentation captures resolution-path-by-class for 48h

Step 2 (separate deploy, MIN 48h after Step 1):
- Audit the 48h `[TEC_RESOLVE]` log: zero `path=wildcard` for crypto_spot OR xstock_spot
- If clean → execute wildcard removal script (Objective 10)
- If dirty → diagnose missing per-class row, do NOT cut wildcard, fix root cause first

Step 2 is its own mini-deploy, not folded into B79.TEC's Step 6. Tracked as a B79.TEC.b sub-deploy + closed when verified.

---

## §2 — Component changes

### Files modified (expected)

| File | Change |
|---|---|
| `server/services/trailing-exit-controller.ts` | `cachedConfig` → `Map<AssetClass, TrailingExitConfig>`. `resolveTECConfig` signature simplified. `updatePosition` plumbs `assetClass`. `TEC_DEFAULTS.breakEvenEnabled = false`. `primeTECConfig` refactored to iterate registered asset classes. Cache-miss log added. Resolution-path instrumentation. |
| `server/index.ts` | `await primeTECConfig()` added BEFORE `loadTrailingStates()` in boot sequence. HARD-FAIL handler — uncaught primeTECConfig error exits process with explicit log. |
| `server/routes.ts` | New diagnostic endpoint `/api/diagnostics/tec-bootstrap` returning `{ready, perClassStatus, lastWarmup}`. |
| `server/services/health-monitor.ts` (or whichever health surface is most-canonical post-survey) | Returns degraded until TEC bootstrap green. Survey in PIA confirms which file is the right surface. |

### Files added

| File | Purpose |
|---|---|
| `drizzle/migrations/2026-05-XX-b79-tec-per-class-be-rows.sql` | Insert per-class rows for crypto_spot + xstock_spot break_even_enabled. |
| `drizzle/migrations/2026-05-XX-b79-tec-per-class-be-rows-rollback.sql` | Rollback. |
| `scripts/b79-tec-remove-wildcard-be-row.sql` (or .ts) | Step-2 wildcard removal script. NOT executed in this batch's deploy. Documented + linted + dry-runned only. |
| `server/tests/unit/b79-tec-per-class-cache.test.ts` | Unit tests: cache structure, resolveTECConfig signature, fail-closed default, cache-miss log. |

### Files explicitly NOT modified (no-touch fence)

- All `regime_factor_alternates` aggregator paths
- All B70/B72/B74/B75/B76/B77/B78/B79 archive + signal pipeline code
- xstock_spot scanner / archiver / WS feed paths (not yet wired live; B79.0a)

---

## §3 — DB migrations

### Migration 1 (B79.TEC ship — Langston rev 2: ON CONFLICT DO NOTHING + assertion)

```sql
-- B79.TEC: per-asset-class break_even_enabled rows
-- NO ON CONFLICT DO UPDATE (rev 2 fix per Langston Risk 9): silent overwrite of
-- a manual experimental value would be lossy. Use DO NOTHING + post-INSERT
-- assertion. If a conflict row exists with a DIFFERENT value, the assertion
-- fails loudly and operator decides — intentional override or stale cleanup.
BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('trailing_exit', '*', 'crypto_spot',  '*', '*', 'break_even_enabled', 'false'::jsonb, 'B79.TEC'),
  ('trailing_exit', '*', 'xstock_spot',  '*', '*', 'break_even_enabled', 'false'::jsonb, 'B79.TEC')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO NOTHING;

-- Post-INSERT assertion: both rows exist AND have value = false. If any row
-- already existed with a different value, this fails the migration loudly.
DO $$
DECLARE row_count int;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
   WHERE module_name = 'trailing_exit'
     AND constant_name = 'break_even_enabled'
     AND asset_class IN ('crypto_spot', 'xstock_spot')
     AND value = 'false'::jsonb;
  IF row_count != 2 THEN
    -- Log the conflicting row(s) for operator review
    RAISE EXCEPTION 'B79.TEC migration assertion failed: expected 2 false rows for crypto_spot+xstock_spot break_even_enabled, found %. Pre-existing intentional override may exist; manual review required.', row_count;
  END IF;
END $$;

COMMIT;
```

### Deploy ordering for §6 Step 6 (Langston Risk 10)

Migration 1 MUST run BEFORE PM2 restart on new code. Sequence:
1. Apply Migration 1 to staging Supabase (psql).
2. Verify via psql `SELECT` that both per-class rows present + `value = false`.
3. THEN `git pull && npm run build && pm2 restart dawntrader` on Hetzner.

If steps reversed (code first), the app refuses to start because TEC_DEFAULTS is false + primeTECConfig HARD-FAILs on missing per-class rows. Recovery is to apply migration immediately then `pm2 restart`. Documented but to-be-avoided.

### Wildcard removal script (B79.TEC.b — separate deploy, min 48h gap)

```sql
-- B79.TEC.b: remove wildcard break_even_enabled row after 48h verification clean
BEGIN;

-- 1. Capture for rollback
SELECT * FROM module_constants
 WHERE module_name='trailing_exit' AND asset_class='*' AND constant_name='break_even_enabled'
 \gset captured_row_

-- 2. Pre-check: exactly 1 row matches
DO $$
DECLARE row_count int;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
   WHERE module_name='trailing_exit' AND asset_class='*' AND constant_name='break_even_enabled'
     AND value = 'false'::jsonb;
  IF row_count != 1 THEN
    RAISE EXCEPTION 'Expected exactly 1 wildcard row, found %', row_count;
  END IF;
END $$;

-- 3. Signature-guarded DELETE
DELETE FROM module_constants
 WHERE module_name = 'trailing_exit'
   AND asset_class = '*'
   AND constant_name = 'break_even_enabled'
   AND value = 'false'::jsonb
   AND created_at < '<STEP1_DEPLOY_TIMESTAMP>'::timestamptz;

COMMIT;

-- ROLLBACK:
-- INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime,
--                               constant_name, value, updated_by)
-- VALUES ('trailing_exit', '<captured exchange>', '*', '<captured strategy>', '<captured regime>',
--         'break_even_enabled', 'false'::jsonb, 'B79.TEC.b_rollback');
```

---

## §4 — Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | Per-class cache refactor introduces a regression in crypto_spot's TEC behavior | HIGH | Comprehensive unit tests; PIA line-cites the latch gate + BE-stop exit; behavioral verify on 4 zombie trades + new crypto trades; no-touch fence SQL on factor cadence |
| 2 | `primeTECConfig` HARD-FAIL bricks the app on a transient DB blip during PM2 restart | MEDIUM | Acceptable per Kyle directive — production restarts infrequent + want loud failure. Documented behavior. Monitoring + alert plan for boot failures (Telegram or ops surface). |
| 3 | `loadTrailingStates` after `primeTECConfig` rehydrates state but the rehydrate path itself uses TEC config in a way that drifts from current DB | MEDIUM | State-vs-config rehydrate boundary explicitly written into PIA + scope; rehydrate path audit confirms `state.*` vs `config.*` separation respected |
| 4 | Wildcard row removal Step 2 deletes a row some other resolution path silently relied on | MEDIUM | 48h `[TEC_RESOLVE]` instrumentation gate before Step 2; signature-guarded DELETE; documented rollback |
| 5 | Adjacent state-vs-config entanglements (trailing-active, lock-threshold-hit) surface during PIA but get scope-creeped into B79.TEC | LOW | Langston flag respected: if PIA surfaces these, log to RUNNING_ISSUES + dedicated future batch; do NOT add to B79.TEC scope |
| 6 | Health endpoint + diagnostic endpoint conflict with existing surfaces (system-health-monitor, etc.) | LOW | PIA surveys existing health-surface files; new endpoint added in least-overlap location; do NOT touch the broken `SystemHealthMonitor.startPeriodicChecks` path (Phase 19.x cleanup) |
| 7 | Test failures count climbs above 59/995/5/1059 baseline | LOW | New unit tests added are expected to pass; if any existing test breaks, diagnose before push. **Re-capture baseline at PIA time** (Langston rev 2 — the 59/995/5/1059 number was captured at B79 ship; drift since possible). Treat freshly-captured baseline as comparison line. |
| 8 | `update.assetClass` not set at every call site that builds an Update | MEDIUM | PIA acceptance criterion §5 #9 audits every site that constructs/mutates a `PositionUpdate`; non-optional type per Objective 3 makes TS compile catch most; manual grep verifies remaining state-construction paths. (Langston rev 2 addition.) |
| 9 | Migration 1 `ON CONFLICT DO UPDATE` clobbers manual experimental values someone set between scope-time and deploy-time | MEDIUM | **Change to `ON CONFLICT DO NOTHING` + post-INSERT assertion** that 2 rows now exist with `value = false`. If a conflicting row exists with a different value, migration logs the conflict and either passes (row already correct) or fails (intentional override exists — operator decides). Loud, not silent. (Langston rev 2 addition; §3 Migration 1 rewrite below.) |
| 10 | Deploy ordering: code-before-migration causes app refusal-to-start because TEC_DEFAULTS is false + primeTECConfig HARD-FAILs on missing per-class rows | MEDIUM | Step 6 deploy sequence explicitly applies migration FIRST, verifies psql shows both per-class rows present, THEN PM2 restart on new code. Add explicit ordering assertion to §6 Step 7 first-pass criteria. (Langston rev 2 addition.) |
| 11 | Boot-failure alert wiring not yet in place — `[TEC_BOOTSTRAP_FAIL]` log emits but no one is paged | MEDIUM | Risk 2 mitigation made explicit (Langston rev 2): PM2 boot failure on Hetzner emits `[TEC_BOOTSTRAP_FAIL]` log; alert wiring (Telegram bot? log-watch script? Kyle ping?) is **NOT in scope for B79.TEC**. Risk explicitly accepted. Wiring tracked as a follow-up line item — to be folded into Phase 19.x Boot Readiness Coordinator OR a B79.TEC.c minor batch if Phase 19.x is too distant. |

---

## §5 — Pre-Implementation Audit (PIA) acceptance criteria

The PIA must include the following line-citation work per Langston Q4:

1. **Latch gate:** cite the EXACT conditional that fires the BE-latch (`trailing-exit-controller.ts:503` per current code), quote the line, confirm under new architecture it reads `cfg = this.cache.get(assetClass) ?? TEC_DEFAULTS` (or equivalent) instead of the global `cachedConfig`.

2. **BE-stop exit logic:** cite the EXACT conditional that fires `exitReason = 'break_even_stop'` (`tec-evaluator.ts:340-342` per current code), quote the line, confirm it consults ONLY `update.breakEvenLatched` (state) NOT `cfg.breakEvenEnabled` (config). State-vs-config separation must hold post-refactor.

3. **Single-call-site grep:** `grep -rn "breakEvenEnabled" server/ --include="*.ts"` — count must be small, every hit must be (a) the latch-gate read, (b) the cache population, (c) the test, or (d) a comment. No silent secondary read.

4. **Bootstrap order audit:** trace the boot path in `server/index.ts` from `server.listen()` upward; cite line where `primeTECConfig` is awaited; cite line where `loadTrailingStates` is called; confirm primeTECConfig is BEFORE loadTrailingStates and BEFORE the listen() call (or the equivalent traffic-acceptance gate).

5. **Adjacent entanglement audit:** survey `TrailingState` struct fields (`server/services/trailing-exit-controller.ts:230` per current code). For each field that's a "latch-style" boolean (breakEvenLatched, targetLatched, trailing-active, etc.) confirm whether its activation depends on a `cfg.*` config knob. If yes, document — those are candidates for similar treatment in a future batch but DO NOT add to B79.TEC.

6. **SIM consultation:** read SYSTEM_IMPACT_MAP.md entries for trailing-exit-controller, tec-evaluator, vts-runner, paper-execution-engine. Trace upstream + downstream + shared state + blast radius. Document any cascade risks not already covered in §4.

7. **Schema audit:** verify `module_constants` is the right table; confirm no other place is reading `break_even_enabled` (e.g. paper trade close-reason mapping at `paper-execution-engine.ts:972`). If yes, those paths must respect the same per-class resolution. **Explicit confirmation (Langston rev 2):** PIA must verify `paper-execution-engine.ts:972` consumes `update.exitReason` produced by tec-evaluator and does NOT independently re-resolve `break_even_enabled` — a hidden second call site that the per-class refactor wouldn't catch would be a silent failure mode.

8. **`resolveTECConfig` call-site audit (Langston rev 2 addition).** `grep -rn "resolveTECConfig" server/ --include="*.ts"` — every hit must pass exactly one arg (`assetClass`), no leftover calls passing `strategy`/`regime`, no calls without an explicit assetClass. Required since signature simplification is a breaking change.

9. **`PositionUpdate` construction site audit (Langston rev 2 addition).** Every place a `PositionUpdate` (or state object passed to TEC) is constructed must set `assetClass` explicitly. Grep all call sites that construct or mutate Update; confirm assetClass is set. With non-optional typing per Objective 3, TS compile catches most — manual grep verifies remaining state-construction paths (paper-execution-engine, signal-orchestrator, vts-runner, tec-evaluator, anywhere downstream).

PIA written at `Claude Comms and Packages/Scope Files/BATCH_79_TEC_PRE_AUDIT.md`. Sent to Langston via file-first protocol per CLAUDE.md §6.5.0.

---

## §6 — Verification criteria (Step 7+8)

### Step 7 first-pass (CC)

1. **HTTP 200** on staging post-deploy.
2. **`[TEC_PRIME]` log lines** appear in PM2 — one per registered asset class — BEFORE any `[loadTrailingStates]` lines.
3. **No `[TEC_BOOTSTRAP_FAIL]` log lines.** Bootstrap succeeded for all classes.
4. **Diagnostic endpoint** `/api/diagnostics/tec-bootstrap` returns `{ready: true, perClassStatus: {crypto_spot: {ready: true, ...}, xstock_spot: {ready: true, ...}}}`.
5. **No-touch fence SQL** on `regime_factor_alternates` cadence: ±10% of pre-deploy baseline.
6. **psql:** both per-class `break_even_enabled = false` rows present + wildcard row STILL PRESENT (Step 2 not yet executed).
7. **`[TEC_RESOLVE]` instrumentation log:** non-zero events captured for crypto_spot; zero `path=wildcard` events.
8. **Behavioral check on 4 zombie trades:** open positions UI shows them still tracking with their existing `breakEvenLatched=true` state preserved.
9. **No new errors in PM2 logs** from `[B79.TEC]`-prefixed sources.

### Step 8 second-pass (Langston)

Independent verification of all Step 7 items + line-cite confirmation that the implementation matches the PIA's audit work + consideration of edge cases CC may have missed.

### Step 7+8 hostile simulation (HARD-FAIL test)

To verify hard-fail behavior, PIA describes a TEMPORARY simulation:
- Comment-out one per-class row in module_constants (e.g. drop crypto_spot's `break_even_enabled`)
- Restart PM2
- VERIFY: app refuses to start with `[TEC_BOOTSTRAP_FAIL]` log + non-zero exit code
- Restore the row
- Restart PM2
- VERIFY: app boots cleanly

This simulation is the hostile validation that hard-fail is wired correctly. Run after primary verify is green; reverts cleanly.

---

## §7 — Sequencing within Phase 24

Per Langston design call 2026-05-08 + Kyle 2026-05-08:

1. **B79.TEC** (this batch) — per-asset-class TEC config + bootstrap warmup + per-class DB rows + fail-closed defaults
2. **B79.TEC.b** (separate mini-deploy, 48h+ after B79.TEC ship) — wildcard row removal
3. **B79.0a** — live xstock scanner via centralClock + ARM injection + Q-D probe + N2-N4 cleanup
4. **B79.4** — extend B73 exit-strategy ablation to xstock_spot (parallel panel + dedicated UI tab + schema lift)
5. **B79.1/.2/.3/.5/.6/.x** — observation-triggered

**Why B79.TEC first:** routing xstock_spot through hardcoded-crypto TEC config even briefly is architecturally wrong + contaminates B79.4 ablation baseline. NO PATCHES doctrine.

**B79.TEC.b artifact (Langston rev 2):** at B79.TEC Step 11 close, CC creates `Claude Comms and Packages/Scope Files/BATCH_79_TEC_b_VERIFY_CHECKLIST.md` containing the 48h gate criteria + audit SQL + rollback path. This file is the trigger artifact when 48h elapses — Kyle or CC opens it, runs the audit, gives go/no-go. Without an explicit artifact the gate gets dropped.

---

## §8 — Q1-Q6 LOCKED via Langston rev 2 review

All 6 outstanding questions answered + folded as locked decisions:

| Q | Locked decision |
|---|---|
| Q1 Cache TTL | **60s uniform across classes.** Variable TTLs add complexity without payoff + create cross-class skew. The point of immutable wholesale snapshots is consistency. One number. |
| Q2 Diagnostic endpoint | **New `/api/diagnostics/tec-bootstrap`.** Existing health surfaces are partly broken (Risk 6 + Phase 19.x deferral). Don't build atop fragility. |
| Q3 `[TEC_RESOLVE]` log volume | **Per-minute aggregated counter, NOT per-call.** Per-call would flood PM2 retention. Aggregator dump: `[TEC_RESOLVE_AGGR] minute=… crypto_spot=explicit:N wildcard:0 default:0 xstock_spot=…`. PLUS one immediate loud log on the FIRST `path=wildcard` hit per asset class per process lifetime (early-warning). Clean post-48h audit + no missed wildcard event + no log volume issue. |
| Q4 Wildcard removal authority | **B79.TEC ship deploys Step 1 (automated). B79.TEC.b is deliberate operator action with explicit go/no-go after 48h audit.** Codify preconditions in script header: 48h elapsed since `<step1_deploy_timestamp>`, zero `path=wildcard` events for crypto_spot AND xstock_spot, signature-guarded `SELECT COUNT(*) = 1`. Gate isn't a vibe — explicit checks. |
| Q5 Health endpoint integration | **Defer to PIA, but constrained.** Don't extend `system-health-monitor` (broken `startPeriodicChecks` is on Phase 19.x rip-list). Don't extend `SystemHealthMonitor` either. Acceptable: dedicated `/api/diagnostics/tec-bootstrap` AND/OR a minimal hook into a lightweight health summary endpoint IF PIA confirms one exists and is non-fragile. PIA must name the file + line + confirm health surface isn't on the Phase 19.x rip-list before extending. |
| Q6 Test baseline | **Re-capture at PIA time.** 59/995/5/1059 was B79 ship; drift since possible. Run suite once at PIA, capture fresh numbers, treat THAT as comparison line. Objective wording: post-B79.TEC = baseline + N new tests, all new pass, zero existing regressions. |

---

## §9 — Implementation sequencing (Step 3 plan, for PIA-time use)

Once PIA closes, Step 3 implementation order:

1. Refactor `cachedConfig` → `Map<AssetClass, TrailingExitConfig>` (TEC file only)
2. Update `resolveTECConfig` signature
3. Plumb `update.assetClass` through `updatePosition`
4. Refactor `primeTECConfig` to iterate registered asset classes
5. Wire `primeTECConfig` into `server/index.ts` BEFORE `loadTrailingStates`
6. Add HARD-FAIL handler around primeTECConfig boot call
7. Flip `TEC_DEFAULTS.breakEvenEnabled` to false
8. Add `[TEC_CACHE_MISS]` and `[TEC_RESOLVE]` instrumentation
9. Add `/api/diagnostics/tec-bootstrap` endpoint
10. Add health endpoint integration (per Q5 answer)
11. Write Migration 1 (per-class rows) + apply to staging Supabase
12. Write wildcard-removal script (Migration 2) — DO NOT execute
13. Add unit tests
14. Run full test suite (expect baseline + new tests pass)

---

## §10 — Process commitments

1. **NO PATCHES.** This batch is the long-term fix. If implementation surfaces a new issue, design + Langston review + ship properly — do not paper over.
2. **No-touch fence on crypto_spot factor cadence.** Pre-deploy + post-deploy SQL on every step.
3. **PIA must include line-citations per §5** — not architectural reasoning alone.
4. **Hostile simulation per §6 is mandatory** to validate hard-fail is wired correctly.
5. **MEMORY synced 3-way + Langston MEMORY synced before next-session pickup** per CLAUDE.md §2 Step 10.b.
6. **Plain-language summary in conversation at Step 11 close** per Kyle directive.

---

*End BATCH_79_TEC_SCOPE.md rev 1.*
