# BATCH 79.0a — Live xstock_spot scanner wire-in (Phase 24)

**Status:** rev 2 — Langston Step 1 APPROVE WITH REVISIONS applied (review staged at `/tmp/lang_b790a_scope_reply.txt` 2026-05-08 20:42 UTC; verbatim Telegram-relayed msg 3730+3731). Q1-Q7 locked decisions in §11. The 9 detail revisions Langston flagged are PIA-time per his explicit "not blocking" note — folded in `BATCH_79_0a_PRE_AUDIT.md` rev 1 §0 cover.
**Workflow:** 11-step canonical (full).
**Branch:** `migration/aws-supabase`.
**Sequencing:** SECOND sub-batch in Phase 24, immediately after B79.TEC. B79.0a turns the dormant xstock_spot scaffold (live since B79 ship 2026-05-07) into a live scanner producing VTS observations on the per-class TEC config that B79.TEC now provides. Precedes B79.4 (B73 exit-strategy ablation extension).
**Tracker:** RUNNING_ISSUES #77 (B79.0a TRACKER, OPEN); also #81 (backpressure policy first-execution).

**Doctrine:** CLAUDE.md §5 #15 NO PATCHES; §11 NO_FALLBACK; §6.7 peer-to-peer iteration; §10c.2 backpressure (vertical-scale, never asset-class shedding).

---

## §0 — Re-frame and scope boundary

**This batch flips xstock_spot from dormant scaffold to a live VTS-observing asset class.** Specifically:

✅ In scope:
- Live xstock_spot dedicated scanner subscribed to `centralClock` (NOT a parallel `setInterval` — same tick-source pattern as `Fx5ScannerService`). Reads from kraken-equities WebSocket (live since B69; equity-spot-archiver subscribes already).
- `AdaptiveRatioManager` constructor injection of telemetry (so xstock ARM consumes its own `TelemetryAggregator` instance, NOT the `getTelemetryAggregator()` global). Closes the dormant-state caveat at `asset-class-instances.ts:94-101`.
- Asset-class-aware data-freshness gate helper (replaces hardcoded crypto-spot freshness math at the freshness check site; one helper consumed by both crypto and xstock paths).
- Q-D AAPLx-vs-AAPL yfinance probe (one-shot diagnostic that records the price-discrepancy distribution between the tokenized-equity and the underlying equity for a small sample of pairs; informs whether xstock_spot's canonical pricing is fit for VTS observation OR whether we need a friction adjustment). Output captured to JSON; NOT a feedback loop into the trading system this batch.
- Step-4 N2-N4 cleanup (the 3 non-blocking notes from B79 PUSH_GREENLIT — defer-able items: SQE pattern-pool floor scoping, redundant strategy guard, missing boundary tests).
- Pre-deploy 1.3× synthetic load test as **sizing decision-gate** (RUNNING_ISSUES #81 first-execution): replay 1.3× historical scan-cycle volume, measure CPU/memory/DB/API headroom on Hetzner CPX22 + Supabase. If headroom <30% on any surface → **gate is upgrade Hetzner tier before ship, NEVER asset-class shedding.** Documented in MULTI_ASSET_VTS_EXPANSION_PLAN.md §10c.2.

❌ Out of scope (deferred or other batch):
- B73 exit-strategy ablation extension to xstock_spot — B79.4
- B79.x pattern-pool guardrails refinement (currently inherits crypto values from B79 ship)
- xstock_perp live wire-in — B80
- ORB strategy enabling for xstock_spot — gated on Q-D probe outcome + Layer 3 evidence; remains `orb_enabled=false` Day 1
- Sector-classification yfinance script — B79.x
- Layer-3 threshold calibration for xstock_spot per scope §9 of plan-doc — gated on observation evidence post-live-wire (this batch produces the observations; calibration is downstream)
- Boot Readiness Coordinator — Phase 19.x

---

## §1 — Numbered objectives (outcomes-based per CLAUDE.md §2)

A batch is done when every objective is verifiably achieved on staging + Langston second-pass-confirmed.

1. **`XstockSpotScannerService` exists + subscribes to centralClock.** New file at `server/services/xstock-spot-scanner.ts`. Class shape mirrors `Fx5ScannerService` minimally: `subscribe('XstockSpotScanner', clockTickHandler)` on start, `unsubscribe('XstockSpotScanner')` on stop, internal `isScanning` mutex flag, `getDiagnostics()` returning `{isRunning, lastTickAt, lastCycleDurationMs, cyclesCompleted, lastError}`. Module export pattern: `export const xstockSpotScanner = new XstockSpotScannerService();`. Verification: PM2 logs show `[CentralClock][SUBSCRIBE] module=XstockSpotScanner totalSubscribers=N+1` at boot; diagnostic endpoint reports `isRunning:true`.

2. **Per-cycle scan flow honors xstock_spot two-instance pattern.** Inside the tick handler, the scanner uses `getXstockSpotInstances()` (already exists at `asset-class-instances.ts:123`) NOT the crypto globals. All telemetry writes flow into the xstock `TelemetryAggregator` instance; all pair-failure tracking flows into the xstock `PairFailureTracker`; all adaptive-ratio reads/writes flow through the xstock `AdaptiveRatioManager`. **No call to `getTelemetryAggregator()` / `adaptiveRatioManager` (global singletons) on the xstock path.** Verification: grep on the new scanner file confirms it imports ONLY from `asset-class-instances.ts` for these dependencies; runtime sanity — telemetry counts on the xstock instance grow over time, crypto telemetry is unaffected.

3. **`AdaptiveRatioManager` constructor injection of telemetry.** Currently `AdaptiveRatioManager.computeAdaptiveRatio()` calls `getTelemetryAggregator()` (global singleton) inline. Refactor: constructor accepts optional `telemetry?: TelemetryAggregatorService` parameter; if provided, instance methods use that; if omitted, fallback to `getTelemetryAggregator()` (back-compat for the crypto path). Crypto callers continue to work unchanged. xstock instance constructed via `new AdaptiveRatioManager(xstockTelemetry)` in `bootstrapXstockSpotInstances`. Verification: TS compile + grep all ARM call sites; xstock ARM diagnostics show telemetry-source = xstock instance (not "default global").

4. **Asset-class-aware data-freshness gate helper.** Refactor: extract the hardcoded crypto-freshness math (currently scattered in scanner / signal-orchestrator paths — exact site list discovered in PIA) into one helper `isPairDataFresh(symbol, assetClass, now)` accepting AssetClass. crypto_spot uses the existing 60s default; xstock_spot uses a per-class window TBD by PIA based on equities tick rate (likely 30-60s during market hours, ∞ during market-closed → leverage existing `isXstockMarketOpenUTC` from B79). Default lookup via `module_constants` `data_freshness_window_ms` keyed by `(*, assetClass, *, *)`. Verification: grep confirms ZERO hardcoded freshness magic numbers remain in scanner / orchestrator code; helper is the single read-site.

5. **`xstock_spot` per-class data-freshness row in `module_constants`.** Migration adds `(market_data, *, xstock_spot, *, *, data_freshness_window_ms) = <PIA-determined>` row. crypto's wildcard row remains. Verification: psql post-migration shows the row.

6. **Q-D AAPLx-vs-AAPL probe script.** New file at `scripts/b79-0a-qd-probe.ts`. Reads `XSTOCK_SPOT_SYMBOLS` ∩ a hardcoded probe-set (e.g. AAPL, MSFT, GOOGL, NVDA — 5-10 names). For each, fetches the latest xstock spot price from kraken-equities AND the underlying equity price from yfinance (web-fetch via `ws-equities.kraken.com` + the existing yfinance tooling we have). Computes (xstock_price - underlying_price) / underlying_price → percentage delta. Outputs JSON to `Claude Comms and Packages/Reports/B79_0a_qd_probe_<timestamp>.json` with per-pair {ticker, xstock_price, underlying_price, delta_pct, timestamp}. Run once at deploy-time; not a continuous loop. Outcome informs whether xstock VTS observations need a friction adjustment downstream. Verification: file exists post-run; sanity = deltas <2% per pair at fair-priced moments (large deltas → diagnostic surface, NOT a failure of this batch).

7. **Step-4 N2-N4 cleanup folded in.** Three non-blocking notes from B79 PUSH_GREENLIT now actioned:
   - **N2 (SQE pattern-pool floor crypto-scoped):** the SQE config `pattern_pool_floor` row is currently asset_class='*' but its value was tuned for crypto. Add explicit `asset_class='crypto_spot'` row with the current value AND `asset_class='xstock_spot'` row with a starting value (PIA-determined; likely the same as crypto Day 1 since pattern strategies are universal). Wildcard row deleted in a separate B79.0b mini-deploy if 48h verify is clean (mirror of B79.TEC.b pattern).
   - **N3 (redundant truthy strategy guard):** the truthy-check on a strategy field that was redundant — file:line surfaced in PIA, removed.
   - **N4 (missing boundary tests):** add unit tests for the boundary conditions surfaced by Langston in B79 review (file:list surfaced in PIA).

8. **Pre-deploy 1.3× load test.** Synthetic test: run a script (`scripts/b79-0a-load-test.ts`) that replays the last 4 hours of crypto-spot scan cycles AT 1.3× speed against the staging environment (xstock_spot scanner ALREADY active in staging via Step 7 deploy). Capture: PM2 CPU%, RSS memory, Hetzner load avg, Supabase connection count + query time p95. **Decision gate** — if any surface shows <30% headroom (i.e. CPU >70%, memory >70% of 4GB, Supabase >70% of pool): HALT → recommend Hetzner tier upgrade (CPX22 → CPX31) BEFORE the actual deploy. NEVER asset-class shed (per #81 policy lock). Verification: load test report committed to `Claude Comms and Packages/Reports/B79_0a_load_test_<timestamp>.json`; if gate fires, follow-up commit upgrades infra OR the batch closes with explicit "infra-upgrade-pending" status.

9. **No-touch fence on crypto_spot factor cadence holds.** Pre-deploy + post-deploy SQL on `regime_factor_alternates` cadence shows ±10% of pre-B79.0a baseline. Same query pattern as B79 / B79.TEC forward-watch.

10. **`/api/diagnostics/xstock-scanner` endpoint.** New endpoint mirroring `/api/diagnostics/central-clock` shape. Returns `{isRunning, lastTickAt, lastCycleDurationMs, cyclesCompleted, lastError, telemetrySnapshot: <xstock instance counters>, ratioManagerState: <xstock ARM state>}`. Public (no auth) per the operational pattern in routes.ts §R9.3.HF-5.

11. **`[B79.0a]` log prefixes**, grep-friendly, on:
    - `[B79.0a][SCAN_CYCLE_START] tick=N`
    - `[B79.0a][SCAN_CYCLE_DONE] tick=N duration=Xms pairs_scanned=Y`
    - `[B79.0a][PAIR_FAIL] symbol=X reason=Y` (delegates to existing failure tracker)
    - `[B79.0a][TELEMETRY_FLUSH] count=N` (per-cycle aggregator dump)
    - `[B79.0a][BACKPRESSURE_OBSERVED]` IF cycle duration exceeds budget — telemetry signal only, NEVER triggers shedding (per #81).

12. **Forward-watch posture.** Post-deploy: 24h forward-watch on the no-touch fence + xstock cadence + load test rerun at +24h. Same protocol as B79's #74 / B79.TEC's #79 close.

13. **CI 4 checks gate.** TS Check is allowed to remain on legacy baseline (#39); B79.0a must NOT introduce NEW server/* TS errors. Test Suite must show baseline + B79.0a new tests all pass (zero existing regressions). Build + Docker green.

---

## §2 — Component changes

### Files added (expected)

| File | Purpose |
|---|---|
| `server/services/xstock-spot-scanner.ts` | Live scanner subscribed to centralClock; uses xstock two-instance pattern |
| `scripts/b79-0a-qd-probe.ts` | One-shot AAPLx-vs-AAPL price-discrepancy diagnostic |
| `scripts/b79-0a-load-test.ts` | 1.3× replay synthetic load test for sizing-gate decision |
| `server/utils/data-freshness.ts` (or co-located in scanner-utils) | Asset-class-aware freshness helper |
| `drizzle/migrations/2026-05-XX-b79-0a-data-freshness-row.sql` (+ rollback) | xstock_spot data_freshness_window_ms row |
| `drizzle/migrations/2026-05-XX-b79-0a-sqe-pattern-pool-floor-per-class.sql` (+ rollback) | N2 cleanup — explicit per-class rows |
| `server/tests/unit/b79-0a-xstock-scanner.test.ts` | Scanner cycle + tick handler + diagnostic |
| `server/tests/unit/b79-0a-data-freshness-helper.test.ts` | Helper coverage |
| `server/tests/unit/b79-0a-arm-injection.test.ts` | ARM constructor-injection back-compat coverage |

### Files modified (expected)

| File | Change |
|---|---|
| `server/services/adaptive-ratio-manager.ts` | Constructor accepts optional `telemetry?: TelemetryAggregatorService`; instance methods use injected over global; back-compat fallback |
| `server/services/asset-class-instances.ts` | `bootstrapXstockSpotInstances` constructs ARM via `new AdaptiveRatioManager(telemetry)`; comment block at 94-101 deleted (caveat closed) |
| `server/services/fx5-scanner.ts` (or signal-orchestrator) | Replace hardcoded freshness magic with `isPairDataFresh(symbol, assetClass, now)` call (single-line per site) |
| `server/index.ts` | Bootstrap `xstockSpotScanner.start()` after primeTECConfig + loadTrailingStates; `[B79.0a][BOOT]` log line |
| `server/routes.ts` | Add `/api/diagnostics/xstock-scanner` endpoint |
| (PIA-discovered) | N3 redundant truthy strategy guard removed |
| `server/asset_classes/xstock_spot/pattern-pool-filters.ts` (PIA-discovered) | N2 — SQE pattern-pool floor per-class scoping |

### Files explicitly NOT modified (no-touch fence)

- All `regime_factor_alternates` aggregator paths
- All B70/B72/B74/B75/B76/B77/B78/B79/B79.TEC archive + signal pipeline + TEC code
- `crypto_spot` scanner (`fx5-scanner.ts`) — touched ONLY for freshness-helper extraction; no behavioral change
- TEC trailing-exit-controller.ts (B79.TEC just shipped + verified)

---

## §3 — DB migrations

### Migration 1 — xstock_spot data_freshness_window_ms

```sql
BEGIN;
INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('market_data', '*', 'xstock_spot', '*', '*', 'data_freshness_window_ms', '<PIA-VALUE>'::jsonb, 'B79.0a')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO NOTHING;

-- Assertion: row present
DO $$
DECLARE row_count int;
BEGIN
  SELECT COUNT(*) INTO row_count FROM module_constants
   WHERE module_name='market_data'
     AND asset_class='xstock_spot'
     AND constant_name='data_freshness_window_ms';
  IF row_count != 1 THEN
    RAISE EXCEPTION 'B79.0a Migration 1 assertion failed: expected 1 row, found %', row_count;
  END IF;
END $$;
COMMIT;
```

### Migration 2 — N2 cleanup, SQE pattern-pool floor per-class

Adds explicit `asset_class='crypto_spot'` AND `asset_class='xstock_spot'` rows for the SQE pattern-pool-floor key. Wildcard row preserved for now (removed in a B79.0b mini-deploy after 48h verify, mirroring B79.TEC.b pattern). Exact key + values determined by PIA grep + Langston review.

---

## §4 — Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | xstock scanner cycle duration exceeds central-clock budget → backpressure telemetry signal fires | MEDIUM | Pre-deploy 1.3× load test (Objective 8) is the sizing-gate; if gate fires, infra upgrade BEFORE deploy. NEVER skip cycles. |
| 2 | ARM constructor-injection refactor breaks crypto path | HIGH | Back-compat fallback to `getTelemetryAggregator()` when constructor arg omitted; comprehensive unit tests on both paths; crypto integration touched at zero call sites |
| 3 | Data-freshness helper extraction touches a hot path; behavioral drift on crypto_spot | HIGH | Helper is a pure refactor — extract math verbatim; line-cite each replaced site in PIA; behavioral test on crypto_spot unchanged |
| 4 | Q-D probe yfinance fetch fails (rate limit, network) | LOW | Probe is one-shot diagnostic; failure logs `[B79.0a][QD_PROBE_FAIL]` and exits 0; not a deploy gate |
| 5 | Scanner subscribes to centralClock at start but tick handler races against bootstrap (instances triad not yet constructed) | MEDIUM | Bootstrap ordering: primeTECConfig → loadTrailingStates → getXstockSpotInstances() (force lazy-init) → xstockSpotScanner.start(). HARD-FAIL if any step throws. |
| 6 | SQE per-class migration row has wrong value vs current production | MEDIUM | PIA grep + value comparison vs current wildcard row; assertion fails the migration if values differ from the current wildcard's value (operator must explicitly choose to override) |
| 7 | xstock telemetry counters grow unbounded if no flush path is wired | MEDIUM | xstock TelemetryAggregator is in-memory only Day 1 (per asset-class-instances.ts:84 design); flush path is a B79.x scope item — log to RUNNING_ISSUES if PIA surfaces a memory-growth concern |
| 8 | Live equities WS disconnect / market-closed transition → scanner produces zero observations | LOW | Existing `isXstockMarketOpenUTC` gate already in place; scanner short-circuits gracefully; reconnect handled by existing equity-spot-archiver pattern |
| 9 | Pre-existing kraken-websocket-adapter v1→v2 issue (B78.2 fix) — any latent impact on equities WS | LOW | B78.2 already shipped + verified. equity-spot-archiver uses its own subscribe path (direct WS). No shared codepath. |
| 10 | Q-D probe outputs unexpected large deltas → architectural concern about VTS observation fidelity | LOW | Probe is diagnostic. Large deltas surface as data points for B79.x friction-modeling decision; do NOT block this batch. |
| 11 | Boot-failure alert wiring not in place for B79.0a errors | MEDIUM | Same as B79.TEC Risk 11 — accepted; tracked in RUNNING_ISSUES; alert-wiring is Phase 19.x Boot Readiness Coordinator OR a B79.x.alert minor batch |

---

## §5 — Pre-Implementation Audit (PIA) acceptance criteria

The PIA must include the following line-citation work:

1. **Freshness-helper extraction sites:** `grep -rn "60_000\|60 \* 1000\|fresh.*ms\|isFresh\|data_freshness" server/ --include="*.ts" | head -30` — list all sites currently doing freshness math; classify each as (a) needs replacement with helper (b) leaves alone (c) different concept. Cite each site with file:line + before/after sketch.

2. **ARM call-site audit:** every consumer of `AdaptiveRatioManager.computeAdaptiveRatio()` and any other instance methods. Cite each, confirm crypto callers continue to work without modification (back-compat lane); xstock instance is the only one that gets injected telemetry.

3. **`getTelemetryAggregator()` call-site audit (xstock path).** `grep -rn "getTelemetryAggregator\(\)" server/` — every hit must be classified: crypto path (OK), xstock path (BUG — must be replaced with `xstockTelemetry` from instances triad), neutral (admin/diagnostic — leave). xstock-path hits are the prerequisite list for Objective 2.

4. **N3 redundant truthy guard:** identify the file:line surfaced in B79 Step 4 review notes. Quote before/after.

5. **N4 boundary tests:** identify the boundary cases surfaced. Cite + write tests.

6. **Bootstrap order audit:** trace `server/index.ts` boot. Insert point for `xstockSpotScanner.start()` — verify primeTECConfig + loadTrailingStates + (lazy-init xstock instances) all complete BEFORE the scanner subscription fires.

7. **SIM consultation:** Read SYSTEM_IMPACT_MAP.md entries for: `central-clock.ts`, `fx5-scanner.ts`, `adaptive-ratio-manager.ts`, `telemetry-aggregator.ts`, `asset-class-instances.ts`, `signal-orchestrator.ts`. Document upstream/downstream/shared-state/blast-radius for each. Flag any cascade risks not in §4.

8. **Hostile sim plan:** procedure to validate the no-shed posture. Suggested: instrument the scanner with a `BACKPRESSURE_TEST_MODE` env flag that artificially makes scan cycles take 2× their normal duration; verify scanner CONTINUES emitting cycles (does not skip), `[B79.0a][BACKPRESSURE_OBSERVED]` log fires, telemetry continues to grow. Restore env flag → behavior normalizes.

9. **Q-D probe value-range expectation:** PIA documents what fair-priced delta range looks like (typical equity-spread tier; estimate 0.1-1.0%). Out-of-band deltas surface as data, not failure.

10. **`data_freshness_window_ms` value determination:** PIA proposes a starting value for xstock_spot based on ARCA tick cadence + central-clock interval. PIA reasoning + value embedded in Migration 1.

PIA written at `Claude Comms and Packages/Scope Files/BATCH_79_0a_PRE_AUDIT.md`. Sent to Langston via file-first protocol.

---

## §6 — Verification criteria (Step 7+8)

### Step 7 first-pass (CC)

1. HTTP 200 on staging post-deploy.
2. `[B79.0a][BOOT]` log line + `[CentralClock][SUBSCRIBE] module=XstockSpotScanner` in PM2 boot logs.
3. `/api/diagnostics/xstock-scanner` returns `{isRunning: true, cyclesCompleted: > 0 after 1 minute}`.
4. `/api/diagnostics/tec-bootstrap` STILL returns ready=true for all 4 active classes (B79.TEC unaffected).
5. `[B79.0a][SCAN_CYCLE_DONE]` log lines appearing — at minimum one per central-clock tick during market hours.
6. xstock TelemetryAggregator instance counters growing (queryable via `/api/diagnostics/xstock-scanner`); crypto telemetry counters unaffected (sanity: snapshot before deploy = snapshot after deploy ± normal traffic).
7. Q-D probe ran successfully; report file present in repo at `Claude Comms and Packages/Reports/`.
8. Pre-deploy 1.3× load test report present + headroom ≥30% on all surfaces; if not, infra-upgrade-required note prominent.
9. No-touch fence SQL: `regime_factor_alternates` cadence on crypto_spot ±10% of pre-deploy baseline.
10. `[B79.0a][BACKPRESSURE_OBSERVED]` log lines absent during normal market hours (would surface only under hostile-sim).
11. No new TS errors introduced in server/* (legacy baseline #39 unchanged).

### Step 8 second-pass (Langston)

Independent verification of all Step 7 items + line-cite confirmation that implementation matches PIA's audit work + edge-case consideration CC may have missed.

### Step 7+8 hostile simulation (no-shed posture)

Per PIA §8: enable `BACKPRESSURE_TEST_MODE` env flag, verify scanner continues emitting cycles, `[B79.0a][BACKPRESSURE_OBSERVED]` fires, no skipped cycles, no asset-class shedding. Disable flag, verify normal cadence resumes.

---

## §7 — Sequencing within Phase 24

1. ✅ B79.TEC (CLOSED 2026-05-08, PM2 #190)
2. **B79.0a (this batch)** — live xstock scanner, ARM injection, Q-D probe, N2-N4 cleanup, load-test sizing gate
3. **B79.TEC.b** — wildcard `break_even_enabled` row removal (separate mini-deploy after 48h gate from B79.TEC; orthogonal to B79.0a, can interleave)
4. **B79.4** — extend B73 exit-strategy ablation to xstock_spot; new dedicated UI tab
5. **B79.0b** — mini-deploy companion to B79.0a Migration 2 (N2 wildcard cleanup, after 48h verify)
6. **B79.1/.2/.3/.5/.6/.x** — observation-triggered

---

## §8 — Open questions for Langston (Step 1+2 review)

1. **Q-D probe scope.** CC lean: 5-10 names, one-shot at deploy-time, JSON report into `Reports/`. Confirm OR counter (e.g. continuous probe at lower cadence; OR delta into a DB table for trend visibility).
2. **`data_freshness_window_ms` Day 1 value for xstock_spot.** CC lean: 60s during market hours (matches crypto), `null` (skip the gate) during market-closed since `isXstockMarketOpenUTC` already short-circuits. Confirm OR propose alternative.
3. **Pre-deploy load test methodology.** CC lean: replay last 4hr of crypto cycles AT 1.3× speed against staging. Concern: xstock's actual load profile is unknown until live, so we're projecting. Better methodology if you have one?
4. **N2 cleanup approach — wildcard row removal in B79.0b mini-deploy.** Mirrors B79.TEC.b pattern. Confirm sequencing OK OR fold into B79.0a directly.
5. **Hostile-sim BACKPRESSURE_TEST_MODE shape.** CC lean: env flag + artificial sleep in scan cycle. Better way to surface "scanner under load" without actually overloading?
6. **Scanner module name and file location.** CC lean: `server/services/xstock-spot-scanner.ts`, mirroring `fx5-scanner.ts` shape. Acceptable OR put it in `server/asset_classes/xstock_spot/` subtree (consistency with the asset-class folder layout from B79)?
7. **ORB strategy gating.** Currently `module_constants.strategy_gates.xstock_spot.orb.enabled = false` (B79 ship). Stays false for B79.0a. Confirm — OR if Q-D probe outcome enables consideration for a follow-up.

---

## §9 — Implementation sequencing (Step 3 plan, for PIA-time use)

Once PIA closes, Step 3 implementation order:

1. Refactor `AdaptiveRatioManager` constructor → optional `telemetry?` parameter (pure back-compat addition)
2. Refactor `bootstrapXstockSpotInstances` to inject telemetry into ARM construction
3. Extract `isPairDataFresh(symbol, assetClass, now)` helper
4. Refactor crypto-path freshness sites to use helper (verify pre/post behavior unchanged)
5. New `xstock-spot-scanner.ts` skeleton (subscribe to clock, no-op tick handler initially)
6. Wire scanner tick handler to invoke per-cycle scan flow using `getXstockSpotInstances()`
7. Wire `xstockSpotScanner.start()` in `server/index.ts` boot (after primeTECConfig + loadTrailingStates)
8. New `/api/diagnostics/xstock-scanner` endpoint
9. N3 redundant guard removed
10. N4 boundary tests added
11. Migration 1 (`data_freshness_window_ms` row) + Migration 2 (SQE per-class, optional based on Langston Q4 answer)
12. Q-D probe script (`scripts/b79-0a-qd-probe.ts`)
13. Load test script (`scripts/b79-0a-load-test.ts`)
14. Run load test BEFORE PM2 restart on staging
15. Apply migrations
16. Deploy + verify (Step 7+8)
17. Hostile sim + Langston second-pass

---

## §10 — Process commitments

1. **NO PATCHES.** Long-term sustainable solution. If implementation surfaces an issue, design + Langston review + ship properly.
2. **No-touch fence on crypto_spot factor cadence + crypto path.** Pre-deploy + post-deploy SQL on every step.
3. **PIA must include line-citations per §5.**
4. **Hostile simulation per §6 mandatory.**
5. **No backpressure shedding.** Vertical-scale sizing-gate per #81. If gate fires, halt + escalate to Kyle.
6. **MEMORY synced 3-way** per CLAUDE.md §2 Step 10.b.
7. **Plain-language summary in conversation at Step 11 close.**
8. **Step 10 governance commits AFTER Step 8 sign-off.** (Langston note from B79.TEC close — keep order tight on this batch.)

---

## §11 — Q1-Q7 LOCKED via Langston rev 1 review (2026-05-08)

| Q | Locked decision |
|---|---|
| Q1 Q-D probe scope | One-shot JSON for B79.0a confirmed. Probe set MUST include ≥1 high-vol name (NVDA or TSLA) and ≥1 lower-tier liquidity name (NOT all mega-caps — biases friction estimate low). Open RUNNING_ISSUES tracker NOW for "B79.x continuous Q-D probe → DB table for trend visibility" so the friction-modeling surface has a placeholder. |
| Q2 data_freshness Day 1 value | NOT pinned to 60s without empirical measurement. PIA must pull p50/p95/p99 inter-tick gap from `equity-spot-archiver` logs (B69+) for 5-10 representative xstock symbols during a market-hours sample. Choose `value = max(p99 + buffer, central_clock_interval)`. Closed-market: helper returns `true` (treat as fresh) when `assetClass='xstock_spot' && !isXstockMarketOpenUTC()` — explicit contract beats `null`. |
| Q3 Load test methodology | Replay 1.3× crypto necessary BUT NOT SUFFICIENT. Run BOTH (a) 1.3× crypto replay + (b) xstock dry-run scan loop at intended cadence over full xstock universe (filter pipeline only, no trades). Combined load is what sizing-gate evaluates. Add **log throughput** surface (per #81 list — was missing in rev 1 Obj 8). Tighten Supabase pool headroom 30% → **50%** (pool exhaustion non-graceful, spikes nonlinear). |
| Q4 N2 cleanup B79.0b | Confirmed two-step pattern. PIA must ENUMERATE ALL SQE wildcard rows (not just `pattern_pool_floor`) and decide explicitly which fold into B79.0a/.0b vs defer to RUNNING_ISSUES #85 — avoid drip-fed cleanup batches. Confirm B79.TEC.b + B79.0b mini-deploys can interleave safely (no shared row, no race on same DELETE window). |
| Q5 Hostile-sim shape | Env flag + artificial sleep acceptable. Refinements: gate behind `NODE_ENV !== 'production'` AND emit `[B79.0a][HOSTILE_SIM_ACTIVE]` startup log when flag set (cheap insurance against env flag silently lingering in prod). Test must verify BOTH legs: (1) cycles continue emitting (no skipped tick) AND (2) `[B79.0a][BACKPRESSURE_OBSERVED]` telemetry signal fires. Both grep-confirmed. Keep gate permanently (NODE_ENV-bounded) for future asset-class hostile-sims; don't strip after Step 8. |
| Q6 Scanner location | LOCKED at `server/asset_classes/xstock_spot/scanner.ts` (NOT `server/services/`). Reasoning: B79 established asset-class folder convention; new asset-class-specific code colocates with the asset-class folder. fx5-scanner.ts predates the convention — not the precedent for new code. **Document the location rule in `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §F so the next asset class has a clear path.** Crypto's fx5-scanner can be rehoused later as cleanup; out of scope here. |
| Q7 ORB gating | Stays `orb_enabled=false`. Add explicit out-of-scope note in §0: ORB enablement gates on (a) Q-D probe outcome confirming xstock pricing fidelity AND (b) Layer 3 ablation evidence per asset class. Don't expose ORB params as "tunable but disabled" in operator surfaces — invites accidental enablement without calibrated params. Per-class HARD-FAIL (#85) should treat ORB params as gated when `orb_enabled=false` for the class. |

## §12 — Langston rev 1 PIA-time revisions list (folded into PIA rev 1 §0 cover)

Per Langston "PIA-time, not blocking" note — these tightenings live in the upcoming PIA, not in scope rev 2:

1. §1 Obj 8 — add log throughput surface; tighten Supabase pool threshold to 50%.
2. §3 Migration 1 assertion — add `AND value IS NOT NULL AND value::text != 'null'` to catch botched insert.
3. §3 Migration 2 — value-comparison assertion explicit in migration SQL, not "manual check in PIA".
4. §4 Risk #5 / §1 Obj 1 bootstrap — make `xstockSpotScanner.start()` HARD-FAIL the boot on throw, matching B79.TEC pattern. State the rule in §1 Obj 1 explicitly, not just in Risks.
5. §5 PIA criterion #7 — add `equity-spot-archiver.ts` to SIM consultation list (xstock WS ingress, shared subscription state with scanner).
6. §5 PIA criterion #10 — value determination must include empirical tick-cadence measurement from archiver logs, not just ARCA-cadence reasoning.
7. §6 Step 7 #6 — quantify "± normal traffic" → "± 20% of pre-deploy 1h baseline rate" or similar.
8. §9 step 14 vs 15 — clarify load test runs against staging env BEFORE migration apply; resolve sequencing ambiguity (DB row read on every freshness gate → migrations first if so).
9. §1 Obj 12 forward-watch — explicitly distinguish *pre-deploy projection* (Obj 8) from *post-deploy stress observation* (Obj 12).

---

*End BATCH_79_0a_SCOPE.md rev 2.*
