# P19-B6.7 — Change List (Step-4 diff review)

**For:** Langston · **From:** Claude New (CC-B) · **Date:** 2026-06-26
**Full diff:** `P19_B6_7_CHANGE_LIST_DIFF.txt` (same dir; 1621 lines — dominated by the two deleted files). Read code locally — do NOT cd the gdrive mount; `ssh staging` for repo inspection.
**Bench:** tsc-baseline OK (incl. **post-delete zero-dangling proof**) + vitest **2070 pass / 27 new all-pass**; the 9 failed FILES are the pre-existing env-only DB-connect set (TEC primeTECConfig / b72-dbs / cost_telemetry / dynamic_sizing — no Postgres on bench), count unchanged from the B6.6 baseline, none feed-integrity/market-data.
**State:** 7 local commits, NOT pushed (this Step-4 gate). All change-class: architecture.

---

## Your Step-4 watch-list → status

1. **parity-gate re-point value-correct BOTH directions — DONE + unit-tested.** The decision is in the pure, tested `assessWsReadiness`. Tests: healthy primary → PASS; **connected-but-no-fresh-ticks (the dead-feed false-PASS) → BLOCK**; disconnected → BLOCK; minority-fresh → BLOCK.
2. **No surviving consumer branches on `usingFallback`/`dataSource` — DONE.** All four re-points drop the dimension; none branches on it (the field no longer exists). health-monitor's old `blocked_fallback_rest` branch removed; `restFallbackActive` hard-set false. No undefined-as-blank (§9.3) — each renders connected/fresh state.
3. **§15 hygiene — DONE.** Re-point → tsc-zero-dangling → delete → archive `.removed` + DELETED_COMPONENTS_LOG + repo-wide grep re-run (only my own new comments + the now-removed symbol-canonicalizer line remained). Full caller trace in the log entry.
4. **SIM + System-Manual CONTENT** — that's the Step-10 governance gate; not in this code diff. Flagging so you know it's pending, not skipped (SIM: 2nd-WS removal + the new `feed-health-aggregate` component + Liveness-Registry note; System Manual: feed-health alarm architecture).

---

## Files

**NEW `server/services/market-data/feed-health-aggregate.ts`** — the pure, dependency-injected aggregates (27 tests in `server/tests/unit/p19-b6-7-feed-health-aggregate.test.ts`):
- `freshestSymbolAgeMs` — min ageMs; null = whole set silent. The ALARM/display aggregate.
- `proportionFresh` — fraction fresh; empty = 0 (conservative). The GATE aggregate.
- `assessWsReadiness` — parity-gate: connected+uptime AND proportion-fresh.
- `gradePerClassFeedLiveness` — the ALARM. Per-class freshest-age; xStock per-symbol market-open gate (suppress class only when ALL xStock symbols closed) + warmup-grace suppression; overall = worst non-suppressed class.

**`server/services/feed-integrity-monitor.ts`** (re-point, ~192 lines) — the load-bearing change:
```ts
private computeLiveness(now: number): { grade: FeedAliveGrade; worstAgeSec: number } {
  const health = krakenWebSocketAdapter.getI8EWsHealth().map(h => ({ symbol: h.symbol, ageMs: h.ageMs }));
  // closed→open edge (re)starts the warmup grace
  const anyXstockOpen = health.some(h =>
    resolveAssetClass(h.symbol,'kraken')==='xstock_spot' && isXstockMarketOpenUTC(h.symbol, new Date(now)));
  if (anyXstockOpen && !this.xstockWasOpen) this.xstockOpenedAtMs = now;
  this.xstockWasOpen = anyXstockOpen;
  const warmupGraceMs = this.tryGetConfig('xstock_spot','warmup_grace_ms');
  const xstockWarmupRemainingMs = (this.xstockOpenedAtMs!==null && warmupGraceMs!==null)
    ? Math.max(0, warmupGraceMs - (now - this.xstockOpenedAtMs)) : 0;
  const thresholds = {}; // per-class warning/critical from DB feed_health (defensive)
  for (const cls of ['crypto_spot','xstock_spot']) { const w=this.tryGetConfig(cls,'warning_age_ms'),c=this.tryGetConfig(cls,'critical_age_ms'); if(w!==null&&c!==null) thresholds[cls]={warningMs:w,criticalMs:c}; }
  if (Object.keys(thresholds).length===0) return { grade:'healthy', worstAgeSec:0 }; // unwarmed → don't alarm
  const result = gradePerClassFeedLiveness(health, { classify:s=>resolveAssetClass(s,'kraken'), thresholds,
    xstockClassKey:'xstock_spot', isXstockSymbolOpen:s=>isXstockMarketOpenUTC(s,new Date(now)), xstockWarmupRemainingMs });
  /* worstAgeSec = worst non-suppressed class freshest age */ return { grade: result.overall, worstAgeSec };
}
```
- `getHealthMetrics()` + `recordSnapshot()`: status = `worseStatus(livenessGrade, categorizeHealthBySpec(reconnects, /*tickAge*/0, latency, uptime))` — **liveness owns staleness** (tickAge term 0); connection-quality (reconnects/latency/uptime) re-sourced from the primary adapter. latency = `getDiagnostics().lastPongAgeMs` (fixes the old tick-age-as-latency TODO). interval reconnects = delta of cumulative `reconnectAttempts`.
- `tryGetConfig` swallows an unwarmed-cache throw → returns null → the cycle skips the liveness grade (never crash, never false-fire off a config gap).

**`server/services/parity-gate.ts`** — Check-4 now calls `assessWsReadiness(getStatus(), getI8EWsHealth(), {…thresholds})`; added thresholds `freshTickMaxMs:10000`, `minSymbolsFreshPercent:80`.
**`server/services/system-health-monitor.ts` / `health-monitor.ts`** — display re-points: `marketDataSource` = connected?'ws':'N/A'; `lastTickAgeMs` = freshestSymbolAgeMs(getI8EWsHealth()); health = connected AND fresh. Dropped fallback dim.
**`server/services/slippage-fee-model.ts`** — `OrderBookSnapshot` re-homed inline (was imported from the deleted file; type-only).
**`server/services/market-scanner.ts`** — OBJ-4 #396 pure telemetry on `krakenUniverseSize < BATCH_SIZE` (getTicker/getTradablePairs/join-drop attribution). Fix homed P19-B6.9.
**`drizzle/migrations/2026-06-26-p19-b6-7-feed-health-seed.sql` (+MANIFEST)** — `feed_health` per-class thresholds + xStock warmup grace; verify-count guard; rollback OUT (consistent w/ B6.6).
**DELETE** `market-data-ws.ts` + `market-data-coordinator.ts` → `_archive/deleted-code/*.removed` + DELETED_COMPONENTS_LOG.

---

## Open questions for you
- feed_health seed values (crypto 5s/10s, xStock 60s/120s, warmup 120s) — sane, or want different magnitudes? They're DB-tunable post-deploy regardless.
- The `worseStatus(liveness, connQuality)` combine — keeping reconnect/latency/uptime as orthogonal alarm factors (not the liveness aggregate). Agree, or want the alarm purely liveness?
