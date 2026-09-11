# B-OHLC-FRAME-GUARD (`#1028`, `#1029`) — STEP 4 CHANGE LIST

**READY AT:** the commit that adds this file on `origin/migration/aws-supabase` — its sha is in the dispatch post.
**ONE GATE:** code review of Step 3 against the approved plan — pre-audit r4 (`Scope Files/B_OHLC_FRAME_GUARD_PRE_AUDIT.md` §II P1–P8) and your Step-2 conditions (`Scope Files/B_OHLC_FRAME_GUARD_SCOPE.md` §15, C1–C7, J1, J6).
**change-class:** non_architecture (scope header, unchanged).

---

## 0. ⛔ PREVIOUSLY STATED → NOW — where the build departs from the approved plan

| # | PREVIOUSLY STATED (plan / conditions) | NOW (code) | REASON |
|---|---|---|---|
| **1** | **C1:** `Number('0x10')` is 16 and PG **rejects** `"0x10"`, dropping the chunk; same for `0b`/`0o` | **PG 17.6 ACCEPTS** `0x10`, `0X10`, `0b101`, `0B101`, `0o17`, `0O17`, `-0x10`, `1_000` (value-identical to JS for the unsigned forms). **The real JS-accepts / PG-rejects gap is non-ASCII whitespace:** `'12'`+NBSP, BOM+`'12'`, U+3000+`'12'` read 12 in JS, PG rejects | probed at the sink, controls first, cross-checked by real casts — `scripts/analysis/b_ohlc_frame_guard_sink_acceptor_probe.sql`. Recorded: scope §15.1, pre-audit §0 row 21 + P1 |
| **2** | P1 (1b): *"the **trimmed** string must be a plain decimal"* | the **UNTRIMMED** string is gated | the stored value is `String(original)`; trimming first re-opens exactly the gap in row 1 |
| **3** | closed reason set of **7** | **8** — `not_decimal` added | (1b)'s failure needs a name |
| **4** | P4: throttle helper *"in the validator module"* | P4 + P5 live in a sibling, `ohlc-frame-skip-tracker.ts` | the validator stays import-free and pure; the tracker holds all state and side effects |
| **5** | P5 raise mechanics from `alertPermanentWriteFailure` — which imports `addAlert` **dynamically** | `addAlert` imported **statically** | **measured:** two classes crossing the threshold in one tick → under vitest the second `await import()` of the mocked module had not settled after 300 ms; the latch stayed claimed with no alert and no error. Mechanism NOT established. The equity archiver already imports `system-alerts` statically, so no new module enters the process |
| **6** | P5 latch: released on a failed raise, re-armed after `ALERT_RE_ARM_MS` | **also cleared** once no symbol in the class is still at the threshold | BLOCKER-11's rule on the writer's latch (`ohlc-batch-writer.ts:109-137`): a latch that never clears silences the next genuinely new fault; the JSONL dedupe still suppresses a re-raise while the alert is unresolved |
| **7** | P5 streak per `(assetClass, symbol)` | frames with **no usable symbol** share one per-class streak, **reset by any accepted bar in that class** | otherwise a renamed `symbol` key rejects every bar and never alerts; mixed junk among good traffic resets constantly and stays quiet |
| **8** | C6 says the knob is read non-required and kept out of boot asserts; silent on how the module gets **warm** | explicit, **non-fatal** `prefetchModule('passive_archive')` at the top of `passiveArchiveBootstrap` — NOT in `b72-warmup`'s lists | without it the knob is warm only as a side effect of the bootstrap's `getConstant` reads (`loadModule` fills the same cache; the refresher re-warms every cached key, `module-constants-service.ts:514-530`). A control that fires only by accident is not a control |
| **9** | J1: *"on fire the alert routes to CC-C"* | body names **CC-C (ANALYST Claude)** as owner + `metadata.suggested_owner: 'CC-C'` | `AddAlertOptions` has no owner field (`system-alerts.ts:448-463`); routing is your triage, and the body is what you read |

---

## 1. FILES

**New:** `server/services/passive-archive/ohlc-frame-validator.ts` · `server/services/passive-archive/ohlc-frame-skip-tracker.ts` · `server/tests/unit/b-ohlc-frame-guard.test.ts` · `drizzle/migrations/2026-09-11-b-ohlc-frame-guard.sql` (+ `-rollback.sql`, NOT in MANIFEST) · `scripts/analysis/b_ohlc_frame_guard_sink_acceptor_probe.sql`
**Modified:** `equity-spot-archiver.ts` · `crypto-spot-archiver.ts` · `kraken-futures-archiver.ts` (P2, P3) · `drift-dashboard-aggregator.ts` · `client/src/pages/analytics.tsx` (P3, C7) · `ohlc-batch-writer.ts` (P6 `:66-68`, P7 `:167`) · `ticker-batch-writer.ts` (P6 `:154`) · `server/startup/passive-archive-bootstrap.ts` (row 8) · `p19-b4a-c3-gate-watchdog.test.ts` (the `#594` twin) · `drizzle/migrations/MANIFEST.txt` · pre-audit + scope (row 1)

---

## 2. LOAD-BEARING HUNKS

### 2a. The validator's numeric path (P1 steps 1–4) — `ohlc-frame-validator.ts`
```ts
const PLAIN_DECIMAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;   // ASCII digits, no whitespace
function checkNumeric(v: unknown, bound: number | null): Checked<{ text: string; n: number }> {
  if (v === undefined || v === null) return { ok: false, reason: 'absent' };
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return { ok: false, reason: 'not_finite' };
    if (bound !== null && Math.abs(v) >= bound) return { ok: false, reason: 'out_of_range' };
    return { ok: true, value: { text: String(v), n: v } };
  }
  if (typeof v !== 'string') return { ok: false, reason: 'not_number_or_string' };
  if (v.trim() === '') return { ok: false, reason: 'empty' };
  if (!PLAIN_DECIMAL.test(v)) return { ok: false, reason: 'not_decimal' };   // UNTRIMMED (row 2)
  const n = Number(v);
  if (!Number.isFinite(n)) return { ok: false, reason: 'not_finite' };
  if (bound !== null && Math.abs(n) >= bound) return { ok: false, reason: 'out_of_range' };
  return { ok: true, value: { text: v, n } };                               // String(original)
}
```
Field order: `symbol` → `intervalBegin` (so a rejected VALUE still has a bar identity) → open/high/low/close (`< 1e12`) → volume (`< 1e20`) → vwap (null passes) → trades (null passes; integer inside int4). No time-plausibility rule (option (c)).

### 2b. xStock spot — `parseOhlcBar`, BEFORE → AFTER (P2, A14)
```ts
// BEFORE
  if (!data?.symbol || !data?.interval_begin) return;
  state.lastDataMsgAt = Date.now();
  bufferOhlcBar(ASSET_CLASS, { …, open: String(data.open), …, volume: String(data.volume ?? '0'), … });
  state.rowsPersistedLastMinute++;
  state.cumulativeOhlcRows++;
// AFTER
  state.cumulativeOhlcRows++;                                  // scanned: every bar RECEIVED (#1029)
  const verdict = validateOhlcFrame({ symbol: data?.symbol, intervalBegin: data?.interval_begin, open: data?.open,
    high: data?.high, low: data?.low, close: data?.close, volume: data?.volume ?? '0', vwap: data?.vwap, trades: data?.trades });
  if (!verdict.ok) {
    state.ohlcFramesSkipped++;
    noteOhlcFrameRejected('equity-spot', ASSET_CLASS, { symbol: data?.symbol, intervalBegin: data?.interval_begin }, verdict);
    return;                                                    // no data-clock stamp for a rejected bar
  }
  state.lastDataMsgAt = Date.now();
  const bar = verdict.row;
  bufferOhlcBar(ASSET_CLASS, { symbol: bar.symbol, …, open: bar.open, …, volume: bar.volume, vwap: bar.vwap, tradeCount: bar.tradeCount });
  state.rowsPersistedLastMinute++;
  noteOhlcFrameAccepted(ASSET_CLASS, bar.symbol);
```
Ticker: `state.cumulativeTickerSnaps++` moved above the `!data?.symbol` guard; nothing else in `parseTickerSnap` changes.

### 2c. Crypto spot — the caller (P2, J8)
```ts
// BEFORE                                   // AFTER
parseOhlcBar(bar);                          shard.cumulativeOhlcRows++;                      // unconditional (J8)
shard.rowsPersistedLastMinute++;            if (parseOhlcBar(bar)) shard.rowsPersistedLastMinute++;
shard.cumulativeOhlcRows++;                 else shard.ohlcFramesSkipped++;
```
`parseOhlcBar` now returns `boolean`; ticker unchanged. `Shard` is exported for the new test hook `_makeShardForTests`.

### 2d. Futures — the candle loop (P2, C5, C7)
```ts
for (const candle of data.candles) {
  const time = candle?.time;
  if (typeof time === 'number' && time <= lastSeen) continue;          // today's skip
  this.cumulativeOhlcRows++;                                           // every candle EVALUATED
  const verdict = validateOhlcFrame({ symbol, intervalBegin: time, open: candle?.open, high: candle?.high,
    low: candle?.low, close: candle?.close, volume: candle?.volume ?? '0', vwap: null, trades: null });
  if (!verdict.ok) {
    this.ohlcFramesSkipped++;                                          // instance field
    noteOhlcFrameRejected('kraken-futures', this.cfg.assetClass, { symbol, intervalBegin: time }, verdict);
    continue;                                                          // the mark does NOT move
  }
  const bar = verdict.row;
  bufferOhlcBar(this.cfg.assetClass, { symbol, …, open: bar.open, …, volume: bar.volume, vwap: null, tradeCount: null });
  noteOhlcFrameAccepted(this.cfg.assetClass, symbol);
  newCount++;
  if (typeof time === 'number' && time > maxTime) maxTime = time;     // today's mark
}
```
The catch at the end of `pollOhlcOnce` is unchanged and still reached by `fetch` / `resp.json()` (C5). Ticker `cumulativeTickerSnaps++` moved above the `product_id` guard.

### 2e. The tracker — streak and raise (P5)
```ts
const threshold = resolveStreakThreshold(assetClass);        // getCachedConstant, try/catch → 10 cold (C6)
if (s.bars.size < threshold) s.bars.add(barIdentity(frame.intervalBegin));   // BARS: identity = getTime() of the minute
if (s.bars.size >= threshold) raiseSustainedSkipAlert(assetClass, threshold, now);
// raise:
if (last != null && now - last < ALERT_RE_ARM_MS) return;
_alertLatch.set(assetClass, now);                            // claimed before the first await
… await addAlert({ category: 'breakage', severity: 'warning', dedupe_key: `ohlc-frame-skip-sustained-${assetClass}`, … });
} catch { if (_alertLatch.get(assetClass) === now) _alertLatch.delete(assetClass); … }   // release only our own claim
```
A present-but-unusable knob value (not a positive integer) is logged (throttled) and the cold default used.

### 2f. P7 — the permanent-failure alert body
```ts
// BEFORE: `${dropped} rows dropped and every further flush for this class will fail the same way until it is fixed. …`
// AFTER:  `${dropped} rows dropped in this flush. The error was classified permanent, so these rows were discarded rather
//          than retried, which lets the next flush for this class succeed if the fault was specific to them. If the fault
//          persists, later flushes drop their rows too and this alert is raised again once its re-arm window passes
//          (a re-raise is suppressed while this alert is unresolved). This is the #704 shape: …`
```

### 2g. The panel (P3, A5, C7)
Server interface + row literal carry `ohlcFramesSkipped`; the interface comment at the old `:688` said *"scanned-but-not-stored fraction"* over a field that is stored / scanned — rewritten, with the C7 warning. Client: `universe` union aligned to the server's four values; `universeLabel` maps all four (`xStock perps` replaces `Stock perps` — canonical term); OHLC header `colSpan` 3 → 4; new sub-header **"skipped (since PID)"** and cell (amber when > 0); the legend gains one plain sentence on *skipped* and the perp-row store-% artifact.

---

## 3. EVIDENCE — each re-derivable at the ref

| check | result | how to re-run |
|---|---|---|
| unit tests | **64 passed** across `b-ohlc-frame-guard.test.ts` (38), `p19-b4a-c3-gate-watchdog.test.ts` (20, was 19), `b-new-44-equity-spot-diag.test.ts` (6). Same two pre-existing files read 25/25 before any edit | `npx vitest run <those three>` |
| **mutation proof, by hand** (P8) | **29 of 29 killed**: 16 validator clauses (incl. *trim-before-gate*), 4 xStock (stamp-before-guard, scanned dropped, skipped dropped, ticker scanned after guard), 1 crypto (persisted unconditional), 2 futures (mark moves on reject, null-unsafe `candle.time`), 6 tracker (distinct bars, latch not released, no throttle, no latch gate, accept doesn't reset, knob ignored). Each run named the case expected to go red; each file restored and sha-checked | scratchpad harness; the mutation list is reproduced in §5 |
| tsc baseline | **377 = 377, OK** — no new (file, code, message) | `node scripts/check-tsc-baseline.mjs` |
| C1 at the sink | PG 17.6 matrix above; controls `123.45` t / `abc` f; typmod proven applied (`1000000000000` f for `numeric(20,8)`, t for `numeric(28,8)`), real casts agree on all 10 cross-checked strings | `scripts/analysis/b_ohlc_frame_guard_sink_acceptor_probe.sql` (read-only) |
| **NOT verified here** | CI (Step 5) · the migration applied and the knob row present (Step 6) · the panel rendering four labelled rows and the skipped column in the staging UI (Step 7) · the bootstrap's prefetch line in the boot log (Step 7) | — |

---

## 4. ⛔ JUDGEMENT CALLS — ATTACK THESE

1. **The untrimmed gate also rejects ASCII-padded strings PG would store** (`' 12'`, `'12\r\n'`). Stricter than the sink by design — a venue never pads, and a padded value is a malformed frame worth counting. Attack it if you would rather store what PG accepts.
2. **The symbol-less streak (row 7)** — one per class, reset by any accepted bar in the class.
3. **The latch clears on recovery (row 6)** in addition to the 6 h re-arm.
4. **Static `addAlert` import (row 5)** — deviating from the writer precedent on a measured-but-unexplained test symptom.
5. **The explicit bootstrap prefetch (row 8)** — a new boot-time DB read, non-fatal.
6. **`not_number_or_string` for a non-string `symbol`** — kept the approved name rather than minting `not_string`.
7. **Futures `candle?.time` typed `| null` on the response** — a `null` element is now a counted skip (intervalBegin `absent`) rather than a throw into the catch that also discarded every later good candle in that response (§0 row 12 closes).

---

## 5. THE MUTATIONS (for re-derivation)
Validator: delete `absent` · delete type gate · delete `empty` · delete decimal gate · gate `v.trim()` instead of `v` · delete finite (number) · delete finite (string) · delete bound (number) · delete bound (string) · volume bound → null · vwap bound → null · delete `not_integer` · delete int4 · time always valid · delete symbol type · delete symbol empty.
xStock: stamp `lastDataMsgAt` before validation · drop scanned bump · drop skipped bump · ticker scanned after guard. Crypto: persisted bumped unconditionally. Futures: advance the mark on a rejected candle · `(candle as any).time`. Tracker: random bar identity · no latch release on failed raise · throttle disabled · latch gate removed · accept does not clear the symbol streak · knob value ignored.
