# P19-B6.6 — Step-4 change list (Langston diff review)

**Batch:** P19-B6.6 (#236) · change-class architecture · commit `2398702e8` (LOCAL, not pushed) · 6 files +528
**INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run git on the gdrive mount.** Full diff staged at `/home/langston/inbox/P19-B6.6/P19_B6_6_CHANGE_LIST.diff`; for any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`. Load-bearing snippets embedded below.

**Bench (C:\dev):** tsc baseline = OK no regressions (paper-execution-engine 3→1); NEW test **22/22**; full unit suite 2043 pass — the 9 failed files are pre-existing **env-only DB-connection** failures (`module-constants-service.ts:100 await db.select()`, no Postgres in bench) — **PROVEN by reverting my 4 files and re-running: identical 9-fail/160-skip on the base.** CI 4-green check + push pending your OK.

Pinned at Step-2 (consensus): window = **45 min**, single, NOT tiered; placement = open seam beside the depth gate (Option B); xStock-only; fail-closed; reason codes flat_last/no_data/sparse_snapshots/liveness_timeout; GOTU = accepted residual (#391). Justified by **type-II frozen-book detection**, not "p99 margin".

---

## 1. NEW `server/asset_classes/xstock_spot/price-liveness.ts` (233 lines)

**(a) PURE verdict + fail-closed reason taxonomy** (feed/config outage distinguishable from a dead market — your Step-2 #3):
```ts
export function assessPriceLiveness(stats: LastMoveStats, config: PriceLivenessConfig): LivenessResult {
  if (stats.snapCount <= 0) return { live: false, reason: 'no_data window had 0 snapshots' };
  if (stats.snapCount < config.minSnaps) return { live: false, reason: `sparse_snapshots snaps=${stats.snapCount}<${config.minSnaps}` };
  if (stats.moveCount < config.minMoves) {
    const ageStr = stats.msSinceLastMove === null ? 'none-in-window' : `${Math.round(stats.msSinceLastMove)}ms`;
    return { live: false, reason: `flat_last moves=${stats.moveCount}<${config.minMoves} lastMove=${ageStr} window=${config.windowMs}ms` };
  }
  return { live: true, reason: 'live' };
}
```

**(b) Windowed read — index-bounded `(symbol, captured_at)` + Promise.race timeout that FAILS CLOSED:**
```ts
const queryP = db.execute<...>(sql`
  WITH w AS (
    SELECT last, captured_at, LAG(last) OVER (ORDER BY captured_at) AS prev_last
    FROM xstock_spot_ticker_snap
    WHERE symbol = ${symbol} AND captured_at > NOW() - make_interval(secs => ${windowSec})
  )
  SELECT count(*) AS snap_count,
         count(*) FILTER (WHERE last IS DISTINCT FROM prev_last AND prev_last IS NOT NULL) AS move_count,
         EXTRACT(EPOCH FROM (NOW() - max(captured_at) FILTER (WHERE last IS DISTINCT FROM prev_last AND prev_last IS NOT NULL))) * 1000 AS ms_since_last_move
  FROM w`);
const timeoutP = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`liveness query timeout >${queryTimeoutMs}ms`)), queryTimeoutMs); });
const res = await Promise.race([queryP, timeoutP]);   // timeout → reject → caller fail-closed
```
(EXPLAIN on staging = Index Scan Backward, `Index Cond: symbol=… AND captured_at>…`, cost ~124.)

**(c) Config resolver — fail-closed (missing/mistyped → null → block), 60s cache** (mirrors `depth-gate-config.ts`); module `price_discovery_liveness`, asset_class `xstock_spot`, keys window_ms/min_moves/min_snaps/query_timeout_ms/enabled.

**(d) Orchestrator — NEVER throws; kill-switch; timeout vs error telemetry:**
```ts
const config = await resolveConfig();
if (!config) return { live: false, reason: 'liveness_config_missing' };
if (!config.enabled) return { live: true, reason: 'liveness_disabled' };   // gate OFF → pass
try { stats = await getStats(...); }
catch (err) { const isTimeout = /timeout/i.test(err?.message ?? ''); return { live: false, reason: isTimeout ? 'liveness_timeout' : 'liveness_query_error' }; }
return assessPriceLiveness(stats, config);
```
`deps?` param = DI for unit tests (default = real config + real query).

## 2. Open-seam wire-in — `paper-execution-engine.ts` (+21), DEPTH-FIRST, xStock-only
Inserted immediately AFTER the existing depth-gate block (which returns on `!_gate.pass`), BEFORE the fill:
```ts
if (_openClass === 'xstock_spot') {
  const _live = await evaluateXstockPriceLiveness(signal.symbol);
  if (!_live.live) {
    console.warn(`[P19-B6.6][LIVENESS_BLOCK:${this.mode}] ${signal.symbol} (${_openClass}) ${_live.reason} — skipping open`);
    recordDepthGateBlock(_openClass, _live.reason);                                       // same telemetry path, distinct reason bucket
    rtbMetricsService.recordOpenFailed(signal.symbol, signal.strategy, 'LIVENESS_GATE', _live.reason);  // folds into the I3 invariant
    return { opened: false, stage: 'LIVENESS_GATE', reason: _live.reason };
  }
}
```
Depth-first is structural (the depth gate's early-return precedes this); liveness only runs on depth-pass.

## 3. `rtb-metrics-service.ts` (+1): `'LIVENESS_GATE'` added to the `OpenFailStage` union (so `recordOpenFailed` + the `OpenOutcome.stage` return type-check; the I3 invariant attempts=opened+blocked+openFailed stays intact).

## 4. Migration `2026-06-26-p19-b6-6-price-liveness-seed.sql` (+ rollback OUT of git, + MANIFEST)
`module_constants` `price_discovery_liveness` / `xstock_spot`: **window_ms=2,700,000 (45m)**, min_moves=1, min_snaps=5, query_timeout_ms=2000, enabled=true. DO-block verifies all 5 rows seeded.

## 5. Test `p19-b6-6-price-liveness.test.ts` (NEW, 22 tests)
Pure assessor (live/flat_last/sparse/no_data + the 3 block kinds mutually distinct); orchestrator via injected deps (config-null/disabled/timeout/error/live/flat/never-throws); resolver fail-closed (missing/mistyped/throws→null); source guards: query index-bounded + Promise.race timeout; OpenFailStage has LIVENESS_GATE; wire-in xStock-only + **depth-first ordering asserted by source index** + recordDepthGateBlock + recordOpenFailed('LIVENESS_GATE') + stage.

---
**Questions for you:** (1) the wire-in placement/ordering; (2) the reason-taxonomy + fail-closed directions; (3) the 45m seed. On your OK I check CI-green, push, deploy (db:migrate), Step-7 forward-instrument proof, Step-8, governance (System Manual fill-safety CONTENT + SIM — your stated Step-4 verify items).
