# B-4.6-B — Step-2 PRE-AUDIT (scan-stall structural fix)

> Scope `B_4_6B_SCAN_STALL_SCOPE.md` (Langston Step-1 ACK + 2 conditions). Raw enumeration: `B_4_6B_PRE_AUDIT_APPENDIX_ENUMERATION.md` (every lead below re-verified by direct read where marked ✔). SIM consulted for the three components (scanner/fx5 lane §components, VTS runner item-4 entries, MCE per-class entries + the new 4.6-A switch entry).

## 1. THE MECHANISM (the pre-audit's central finding — sharpens the scope)
All three loops **already contain per-pair `await`s** (Loop 1: `getOHLCData`/`passesHistoryFilter`; Loop 2: filter evals + archiver imports; Loop 3: `fetchOHLCForPair`/`generatePhase10Signal`). Yet they stall the event loop. **Why: an `await` on an already-resolved promise (warm cache hit) yields only to the MICROTASK queue — timers and I/O callbacks (macrotasks) never run.** On warm cycles the per-pair awaits collapse into an unbroken microtask chain and the synchronous compute (computeContext, scanPatterns, ATR/DBS math, strategy detects) accumulates into the observed 300–500ms+ stalls. Cold cycles (cache misses → real I/O suspensions) are why only ~13–25 of 120 sweeps/hr stall.
**Consequences for the design:**
- The fix is exactly `setImmediate`-class yields (macrotask boundary), not "more awaits."
- **Every interleave class a new yield can introduce ALREADY OCCURS today** whenever a per-pair await genuinely suspends on a cache miss. New yields add interleave *frequency*, not a new *class* — this bounds the C1 risk analysis below.

## 2. PLACEMENT RULE (the structural safety guarantee)
**Yields are inserted ONLY at pair boundaries (Loop 2/3) or batch-of-10 boundaries (Loop 1 prefetch), NEVER inside a single pair's compute span.** A single pair's processing remains atomic exactly as today, so no read-coherence span (two reads of the same state within one pair's evaluation) is ever split. Trigger per Langston C2: `if (elapsed since last macro-yield > ~20ms) await yieldToEventLoop()` — measured, not proxied via pair count.

## 3. C1 SHARED-STATE VERDICT TABLE (per Langston condition 1)
| State | Lane(s) | Writers | Verdict | Basis (direct-read ✔) |
|---|---|---|---|---|
| `openVirtualTrades` (vts-runner module Map) | VTS only | resolve path (delete :2693 — runs at CYCLE TOP :3115, sequentially BEFORE the pair loop), signal-gen inserts (:1581/:3073, same sequential lane), boot restore (:646) ✔ | **Mutation-harmless** | No other lane writes it; the item-4 lifecycle guard blocks cycle overlap; persistence soft-delete is awaited AFTER the Map delete in the same close cascade ✔. Pair-boundary yields = same interleave class as the existing per-pair awaits at :3309/:3587 |
| MCE `computeContext` cache | All 3 loops | MCE itself (read-through, TTL-keyed, single-threaded) | **Mutation-harmless** | Worst case = a fresher per-pair recompute mid-sweep — already true across existing await boundaries; the 1-row-per-(symbol,cycle) pair_scan invariant is per-compute, unaffected |
| cost-cache (`setCostMetrics` L1 → `getCachedCostMetrics` L2 :609) | crypto writes, xStock + MCE read | Loop 1 per-pair | **Mutation-harmless** | The two loops already run on independent 30s schedules; readers already observe mid-sweep updates today |
| `activeFilterPool` + `storage.getActiveTrades` | crypto loop; mutated by signal-orchestrator | orchestrator (cross-lane) | **SAFE — cycle-local snapshot ALREADY TAKEN** | Read ONCE into local `poolSymbols`/`activeTradeSymbols` Sets before the loop (market-scanner :608–610 ✔); the loop reads the locals |
| `btcOhlcCache` (vts-runner module array) | VTS | refreshed at cycle top (:3236–3246), read later in-cycle | **Immutable-during-cycle** | Same-lane, cycle-top-only refresh; lifecycle guard prevents overlap |
| `hybridConfluenceBuffer` | VTS + orchestrator | both | **Mutation-harmless (by item-4 design)** | Source-namespaced since step 2 (D1b) — cross-lane reads are partition-filtered |
| `lastSetupHash`, telemetry counters, `adaptiveScanManager` | various | same-lane or append-only telemetry | **Mutation-harmless** | Order-insensitive accumulators; no read-back inside the loops |
| Function-local state (dbsCache L1, vtsSymbolFamilies, dedupe sets, prefetched maps L2) | each loop | loop-local | **SAFE** | Not shared by construction ✔ |

**No item requires a new cycle-local snapshot.** The one pattern that would (activeFilterPool) already snapshots.

## 4. Chunk-A instrument design points (settling the Langston minor notes)
- `monitorEventLoopDelay` histogram with **`reset()` per logging interval** (60s) — the METRIC line carries interval-scoped p50/p95/p99/max, so before/after windows compare like with like.
- Per-segment sync-time breakdown: wrap each loop's per-pair sync span with `performance.now()` accumulation, logged per cycle (4 segments: AdaptiveScan prefetch math / main filter / xStock eval / VTS eval); sweep `duration_ms` carried into the before/after table.
- Exposed on the existing diagnostics surface (no new endpoint unless review prefers one).

## 5. Blast radius + SIM
Files touched: `metrics-service.ts` or a new sibling (instrument), `market-scanner.ts`, `xstock_spot/scanner.ts`/`eval-cycle.ts`, `vts-runner.ts` (yield insertions at boundaries only). No schema, no migration, no config semantics, no pair-universe or threshold changes. Behavioral invariants locked by the scope's objective-2 verification (identical per-cycle counters + cadence). SIM gets entries for the instrument + a yield-points note per loop at governance.

## 6. Risks honestly stated
1. Yield overhead: ~1 macrotask per 20ms of sync work — sweep wall-time stretch is bounded (<5% of a 1.5s segment); measured in the before/after table.
2. The 2s freeze Langston observed once may be a different beast (e.g., a GC pause or a one-off cold path) — chunk A's histograms + segment breakdown will catch it if it recurs; if it's not scan-sync time, that finding comes back as its own item rather than being silently absorbed.
3. Timer-callback reentrancy: a cron callback running inside a yield could in principle start work that touches a loop's lane — the per-lane guards (VTS lifecycle guard, xStock `isScanning` ✔, fx5 cycle flag) already make each lane self-exclusive.
