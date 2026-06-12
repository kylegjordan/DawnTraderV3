# B-4.6-B chunk B — Step-4 change list (scan-loop cooperative yields)

**From:** Claude New (CC-B) · 2026-06-12 ~02:40Z · NOT pushed — diff review BEFORE push per workflow.
**Basis (all yours-approved):** scope `B_4_6B_SCAN_STALL_SCOPE.md` obj 2 · pre-audit `B_4_6B_PRE_AUDIT.md` §1-§3 (mechanism + placement rule + C1 table) · your soak **PROCEED** verdict (`B_4_6B_SOAK_ANALYSIS_LANGSTON.md`: crypto_prefetch = proven hot, batch 95ms/pair 72ms, 200-700ms ELD spike every interval; post-deploy gate max_ms <50ms/interval).

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. Inbox copies of all 6 files are at `/home/langston/inbox/b46b/` for direct Read. Use `ssh staging` for any repo-side inspection.

**Diff shape:** 6 files — 1 NEW helper (`scan-yield.ts`, ~75 lines mostly header doc), 1 NEW test file (5 tests), 4 surgical loop edits (+18/+10/+15/+7 lines, zero deletions of logic). Bench: tsc baseline gate OK (no regressions); new tests 5/5; full vitest failure set IDENTICAL to clean-bench stash-proof (same 12 pre-existing, 0 added).

## 1. NEW `server/services/scan-yield.ts` — the ScanYielder

Elapsed-time-gated macrotask yield (your C2 ruling: measured elapsed, not pair-count proxy). Core:

```ts
export const SCAN_YIELD_THRESHOLD_MS = 20;

export class ScanYielder {
  private lastYieldAt: number;
  private yieldsThisCycle = 0;
  constructor(private readonly lane: string,
              private readonly thresholdMs: number = SCAN_YIELD_THRESHOLD_MS) {
    this.lastYieldAt = performance.now();
  }
  async maybeYield(): Promise<void> {
    if (performance.now() - this.lastYieldAt < this.thresholdMs) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
    this.lastYieldAt = performance.now();
    this.yieldsThisCycle++;
    recordYield(this.lane);
  }
  get count(): number { return this.yieldsThisCycle; }
}
```

Header doc carries: the microtask-starvation mechanism, the **granularity lock verbatim** (yields at pair/batch boundaries ONLY, never mid-pair — R3, mirrored to SIM at governance), the wall-clock-not-sync-time caveat (a cold-fetch suspension advances the budget → one wasted sub-ms macrotask at the next boundary; accepted over sync-time bookkeeping), and the residual floor (72ms single-pair = separate follow-up, your caveat 1).

**JUDGMENT CALL #1 for your ratification:** the 20ms threshold is a CODE constant, not a module_constants row. Rationale in the header: it is coupled to the instrument's 20-25ms decision rule and the <50ms acceptance gate — changing it invalidates soak evidence, so it should travel through a reviewed code change, not an operator dial. (Kyle's every-adjustable-is-DB rule was scoped to trading-behavior knobs; this is an infra latency constant. Push back if you read the rule more broadly.)

## 2. MODIFIED `server/services/scan-stall-instrument.ts` — yield witness on the METRIC stream

- New `yields` Map + `recordYield(lane)` export; `flush()` adds one line per nonzero lane:
  `[4.6B][YIELD] METRIC lane=<x> interval_s=60 yields=N` — the yield witness rides the SAME 60s stream your soak analysis reads. `_resetScanStallInstrument()` clears it.
- The file stays measurement-only (counting yields ≠ causing them).

## 3. MODIFIED `server/services/market-scanner.ts` — Loop 1, the proven hot path

BEFORE (the batch-of-10 prefetch loop):
```ts
const B63_OHLC_FETCH_CONCURRENCY = 10;
for (let i = 0; i < batch.length; i += B63_OHLC_FETCH_CONCURRENCY) {
  ...
  if (_chunkSyncMs > 0) recordSyncSpanMs('crypto_prefetch_batch', _chunkSyncMs);
}
console.log(`[B63.3][AdaptiveScan] Pre-DBS pass: ... batched 10 concurrent)`);
```
AFTER:
```ts
const B63_OHLC_FETCH_CONCURRENCY = 10;
const _yield46b = new ScanYielder('crypto_prefetch');
for (let i = 0; i < batch.length; i += B63_OHLC_FETCH_CONCURRENCY) {
  ...
  if (_chunkSyncMs > 0) recordSyncSpanMs('crypto_prefetch_batch', _chunkSyncMs);
  await _yield46b.maybeYield(); // batch-of-10 boundary
}
console.log(`[B63.3][AdaptiveScan] Pre-DBS pass: ... batched 10 concurrent, yields=${_yield46b.count})`);
```
Pre-audit placement honored: BATCH boundary only — the 10 callbacks' sync tails drain as one atomic span by design; no yield inside the Promise.all. The main filter loop (:707) and 19F pattern loop get NO yields (uninstrumented, not proven hot, chunk-A R1 escalation did not fire — deliberately out of scope).

## 4. MODIFIED `server/asset_classes/xstock_spot/scanner.ts` — xstock cycle (one yielder, two loops)

```ts
const _yield46b = new ScanYielder('xstock_cycle');   // before the DBS pre-loop
for (const symbol of symbolList) {                    // DBS pre-compute loop
  await _yield46b.maybeYield(); // symbol boundary
  ...computeATR/computeDirectionalBias/store.updatePair...
}
console.log(`[B-PHASE-A2][CYCLE_DBS_TIMING] ... yields=${_yield46b.count}`);
for (const symbol of symbolList) {                    // eval loop
  await _yield46b.maybeYield(); // pair boundary ONLY
  ...evaluateXstockPairForVTS...
}
```

**JUDGMENT CALL #2 — FLAGGED ADDITION beyond the pre-audit's three named loops:** the DBS PRE-COMPUTE loop. It is fully synchronous (zero awaits; `dbs_compute_ms` historically ~50ms contiguous per CYCLE_DBS_TIMING — over the 25ms bar) and was OUTSIDE the chunk-A segment set, so the soak could not name it; it is a plausible second contributor to residual interval max once crypto_prefetch is fixed. Placement follows the same symbol-boundary rule. **Shared-state walk (the part the C1 table did not cover):** the loop's writes are (a) `dbsBySymbol` — loop-local, safe by construction; (b) `xstockDirectionalBiasStore.updatePair` per symbol — a mid-loop reader now can observe mixed-vintage per-pair scores (this cycle for processed symbols, last cycle for the rest). Basis for mutation-harmless: xstock DBS inputs are 15-MINUTE bars, so per-cycle score drift is tiny; the store's global publish has its own floors (global ≥30, sector ≥7); and readers already observe the store between cycles at full 30s staleness — a mixed 0-30s-vintage median sits inside that envelope. If you want this addition STRUCK (ship crypto-only first, escalate later if the gate misses), say so — it is one line + the yielder hoist, trivially removable.

## 5. MODIFIED `server/services/vts-runner.ts` — Loop 3, EVAL loop only

```ts
const _yield46b = new ScanYielder('vts_eval');
for (const pair of pairs) {                // the :3311 eval loop
  await _yield46b.maybeYield(); // pair boundary
  try { ... }
}
```
Comment in code states the pre-audit C1 lock: the RESOLVE loop gets NO yields (its `.state` weekend-suspend read-coherence spans stay atomic). Verified: only the eval loop touched.

## 6. NEW `server/tests/unit/b46b-scan-yield.test.ts` — 5 tests

(1) threshold pin 20ms; (2) no yield under threshold across 50 boundaries; (3) yield + budget reset over threshold; (4) **the mechanism lock**: a starved 0ms timer fires mid-loop across yields (macrotask proof — the exact failure chunk B fixes); (5) per-instance lane counts.

## Behavioral invariants (scope obj 2)

Same pairs, same order, same outputs, same per-cycle counters — yields are pure scheduling. No schema, no migration, no config rows. Cadence witness post-deploy: pairs_scanned / SCAN_CYCLE / CYCLE_DBS_TIMING counters unchanged; [4.6B][YIELD] lanes appear; ELD max_ms drops. Acceptance gate (scope obj 3): p99 < 50ms AND max < 250ms over ≥24h + zero skipped cron slots; your PROCEED caveat 2 re-check: max_ms < 50ms/interval before close.

## The ask

Step-4 verdict: APPROVE-TO-PUSH or revisions. Explicit calls wanted on JUDGMENT CALL #1 (code-constant threshold) and #2 (xstock DBS pre-loop addition — ratify or strike).
