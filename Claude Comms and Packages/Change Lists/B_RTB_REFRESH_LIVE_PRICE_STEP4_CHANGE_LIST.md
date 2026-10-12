# B-RTB-REFRESH-LIVE-PRICE — STEP 4 CHANGE LIST (r1)

**Batch:** sprint row 59e (row 59's pre-sprint increment, P1a; Kyle's directive 3) · **Owner:** CC-B · **change-class:** architecture · **Graded ref:** `40306a0a0` (Step 3) · **Pre-audit:** `Scope Files/B_RTB_REFRESH_LIVE_PRICE_PRE_AUDIT.md` (r2 §5 — your C5-C9)

## (i) What changed, item by item (each ← its pre-audit plan item)
| item | file | change |
|---|---|---|
| 1 | `server/services/rtb-retirement-ask.ts` (new) | `readRetirementAsk(signal, now)` — the contract (below) |
| 1, 3 | `server/core/rtb/rtb-price-retirement.ts` (new) | `decideRetirement` — pure; `RETIREMENT_PASSES_REQUIRED` crypto 1 / xStock 2 |
| 2 | `server/services/rtb-refresh-service.ts` | the ask map built per bucket signal and handed in; the switch; `cyclesRun` kept under its old gate (C9) |
| 3, 4, 5, 6(a), 7 | `server/core/rtb/ready_to_buy_service.ts` | the price decision before the SQE; retirement through `bulkDeletes`; counters; the sampled shadow; the latch held through the delete; map cleanup |
| 6(b), C7 | `ready_to_buy_service.ts` `promoteSignal` + `server/services/active-execution-engine.ts` | the claim returns `PromoteOutcome`; the engine opens only on `'deleted'`; the second call removed |
| C8 | `server/core/trading/crypto-touch.ts`, `server/services/execution/crypto-touch-readers.ts` (new), the engine, `server/services/vts-runner.ts` | the two exit constants moved with their derivations; one readers object |
| — | `server/services/data-archive/signal-eval-archiver.ts` | source `'rtb-refresh'`; stages `'rtb_price'`, `'rtb_price_shadow'` (TS-only; `reject_stage` is free text) |
| 8 | the RTB service; `server/services/fx5-scanner.ts`; `server/tests/unit/p19-b6-5b-crypto-isolation.test.ts`; `1-system-manual/_archive/deleted-code/ready_to_buy_service.hasPair-purgeInactiveClassSignals.pre-B-RTB-REFRESH-LIVE-PRICE.ts.removed` | rule 18 — `hasPair`, `purgeInactiveClassSignals`, the unused import; the comment re-pointed |
| 11 | `shared/schema.ts:~2173` | the unique index declared as `(mode, symbol, strategy)` |
| 9 | `server/tests/unit/b-rtb-refresh-live-price.test.ts` (24), `server/tests/unit/b-rtb-retirement-ask.test.ts` (15) | below |

**Not in this diff — Step 10:** System Manual and System Impact Map (plan item 10), `DELETED_COMPONENTS_LOG`, the series-break filter note.

## (ii) The load-bearing code, inline
**The contract** (`rtb-retirement-ask.ts`):
```ts
const cls = asValidAssetClass(signal.assetClass);                 // C5 — the row's class, never the symbol
if (cls === null) return { ok: false, reason: 'class_unresolved' };
if (cls === 'crypto_spot') {
  const { selection } = selectCryptoTouch(signal.symbol, CRYPTO_TOUCH_READERS, nowMs, {
    maxAgeMs: EXIT_TRIGGER_MAX_AGE_MS,                            // the PAPER EXIT policy: 2,000 ms
    maxSpreadFraction: EXIT_TRIGGER_MAX_SPREAD_FRACTION,          // 0.02 — not the entry leg's +Infinity
  });
  if (!selection.ok) return { ok: false, reason: `crypto_${selection.bookRefusal}_${selection.tickerRefusal}` };
  ...
}
if (cls === 'xstock_spot') {
  const tick = getLatestEquityTick(signal.symbol);
  if (!tick || !tick.raw) return { ok: false, reason: 'xstock_no_tick' };
  if (tick.observed === false) return { ok: false, reason: 'xstock_cold_mark' };
  const sides = xstockTransactableSides(tick.raw);
  if (sides === null) return { ok: false, reason: 'xstock_not_two_sided' };
  if (!(tick.raw.askQty !== null && tick.raw.askQty > 0)) return { ok: false, reason: 'xstock_ask_qty_absent' };
  // ageMs vs computeStalenessCeiling(price, stop, σ) — σ absent ⇒ its floor (15 s)
  const yardstick = await resolveEntryYardstick(signal.symbol, cfg.trailingSpreadWindowSnaps);
  if (yardstick.median === null) return { ok: false, reason: `xstock_yardstick_${yardstick.basis}` };   // C6
  if (judgeEntrySpread(spread, yardstick.median, cfg.kRel, cfg.floorPct).refuse) return { ok: false, reason: 'xstock_implausible_spread' };
  ...
}
// catch ⇒ { ok: false, reason: 'read_error:…' }                  // C6 — a thrown read keeps
```
**The decision** (`rtb-price-retirement.ts`): no ask ⇒ `unpriced` and the streak RESETS; `refuseTakerBooking(ask, stop, target ?? NaN)`; `passes = prior.reason === refusal ? prior.passes + 1 : 1`; retire at `RETIREMENT_PASSES_REQUIRED[class]`, else `hold_breach`.

**The refresh** (`ready_to_buy_service.ts`, inside the per-signal block, after the class resolves and `refreshedAttempted` ticks, BEFORE the SQE input is built):
```ts
const _rpAsk: RetirementAsk = asks?.get(`${mode}:${signal.symbol}:${signal.strategy}`) ?? { ok: false, reason: 'ask_not_supplied' };
const _rp = decideRetirement({ assetClass: sqeAssetClass, ask: _rpAsk, stopPrice: _rpStop, targetPrice: _rpTarget, prior: _refreshState.priceBreach });
_refreshState.priceBreach = _rp.nextBreach;
if (_rp.decision.action === 'retire') {
  /* [RETIRE] log · logRtbTrace(… 'deleted', `price_${reason}`) · archive (rtb-refresh / rtb_price) */
  bulkDeletes.push(signal.id); expiredCount++;
  if (_fCls) recordActiveRtbRefresh(mode, _fCls, { rejectedInRefresh: 1 });
  return;
}
if (_rpAsk.ok) this._maybeArchivePriceShadow(…);
```
**[C1](a)** — BEFORE: `finally { _refreshState.isRefreshing = false; }` · AFTER: `finally { if (!bulkDeletes.includes(signal.id)) _refreshState.isRefreshing = false; }` and, after every chunk, the delete in a `try { deleteRtbSignalsByIds } finally { for deleted rows: signalRefreshStates.delete(key) }`.
**[C1](b) + C7** — BEFORE (`active-execution-engine.ts`): `await readyToBuyService.promoteSignal(signal.id, 'pending');` then the open; later `await readyToBuyService.promoteSignal(signal.id, tradeResult.tradeId);`. AFTER:
```ts
const _claim = await readyToBuyService.promoteSignal(signal.id);
if (_claim !== 'deleted') { console.warn(`…[CLAIM_REFUSED] … outcome=${_claim} — not opened`); claimRefusedCount++; continue; }
```
`promoteSignal`: missing row ⇒ `'missing'`; `isSignalRefreshing(mode, signal.signalId)` ⇒ `'refreshing'` (not deleted); delete ⇒ `'deleted'` (and its refresh-state entry removed); delete throws ⇒ `'delete_failed'` with **no write** (the `status: 'promoted'` fallback is gone). The second call is removed.
**The switch** (`rtb-refresh-service.ts`) — BEFORE: `if (validPrices.size > 0) { await refreshAndRank(mode, keys); for (cls) recordActiveRtbRefresh(mode, cls, { cyclesRun: 1 }); log }`. AFTER: the asks are read; `await refreshAndRank(mode, keys, asks)` unconditionally (the bucket is non-empty here — an empty bucket returned above); `if (validPrices.size > 0) { cyclesRun }`; the log gains `askAdmissible=`.

## (iii) Judgement calls to attack
1. **The asks are read serially in the refresh service** (one `await` per bucket signal; the xStock leg makes one DB read for the yardstick). Bucket sizes are ~11 (read: `[CYCLE_START] … size=11`), xStock 1-3 per bucket. If you want them concurrent, it is a `Promise.all` — I kept it serial to avoid a burst of yardstick reads.
2. **An unpriced pass resets the xStock streak** (item 3's wording: "reset by any pass that does not refuse"). A signal priced, unpriced, priced-past-stop needs two more priced passes. Conservative by C6.
3. **The shadow's floor is read once per signal lifetime** and cached in the refresh state, so the unknown-strategy tripwire does not climb ~2,900× an hour. A floor knob changed mid-life is not seen by that signal's shadow until it is re-queued.
4. **`'refreshing'` leaves the signal queued and skips it in this promotion pass** — no attempt counted. The alternative (waiting) would hold the single-flight promotion behind a refresh chunk.
5. **The failed-open hazard stays** — a claim is a delete, so a failed open still loses the signal (named at the engine's coalesced re-run comment). Not this batch's.

## (iv) Tests and checks
- `b-rtb-refresh-live-price.test.ts` (24): the decision on read 1's six rows (DOT ×2, ONDO ⇒ target; SENT ⇒ stop; SKHY, SNDK ⇒ held then retired); inside, unpriced-resets, other-level-restarts, unsupported class / non-finite stop / null target; **the real `refreshAndRank`** (storage mocked): DOT retired, archived `rtb-refresh`/`rtb_price`, BTC reconfirmed; the SQE not called for a retired signal; xStock survives pass 1, retired on pass 2; no or refused ask ⇒ SQE as before; **[C1](a) driven** — with the delete held open, the retired signal reads `isSignalRefreshing = true` and the reconfirmed one `false`, and after the delete the map entry is gone; the four claim outcomes, `delete_failed` writing nothing; source fences on the wiring.
- `b-rtb-retirement-ask.test.ts` (15): every xStock arm (no tick, cold, crossed, one-sided, the ORCL/AMAT NULL-quantity placeholders, stale at the 15 s floor, RCL's 276/300, **no yardstick ⇒ keep**, a thrown knob read ⇒ keep); crypto (fresh ok; stale; a 5 % spread refused under the exit policy); **C5 — `STX/USD` stamped crypto reads the crypto book with an equities tick present, and stamped xStock reads the equities tick with a crypto book present**; unresolved and unsupported classes keep.
- **Mutants:** latch released for every signal ⇒ 2 fail; retirement disabled ⇒ 4 fail. **tsc baseline 337 = 337.** Full suite: **4,121 passed**; 10 files fail to load — the same 10 on the clean tree (stash, run, pop).
- **Positive control for M1's instrument (your C5 note):** the M1 query's branches are each gated on `s.asset_class` — stated in §5.

## r2 — Langston Step 4 (2026-10-12 ~09:3xZ UTC): CHANGES, three in-commit conditions — all folded
| condition | done |
|---|---|
| **1 — read-to-decide gap unbounded** (the ask judged fresh at read, acted on later; measured `rankDuration` n=63 p50 669 ms, max 1,299 ms) | `RetirementAsk` ok carries `readAtMs` + `ceilingMs` (crypto `EXIT_TRIGGER_MAX_AGE_MS`; xStock the per-symbol ceiling the read computed); `decideRetirement` re-checks `ageMs + (now − readAtMs) ≤ ceilingMs` at decide time ⇒ else `unpriced`/`ask_expired`. **(a)** the shared `_askNow` is gone — every read takes its own clock. Test: an ask read at 1,400 ms decided 700 ms later ⇒ `ask_expired`; decided 500 ms later ⇒ retired. |
| **2 — `'deleted'` asserted on a zero-row delete** | `promoteSignal` reads the count: `removed >= 1 ? 'deleted' : 'missing'`; `recordQueueRemove(removed)`. Test: a zero-row delete ⇒ `'missing'`. |
| **3 — the verdict-change escape had no rate limit** (70 of 101 live rows within 0.05 R of the floor) | a change row needs `RTB_PRICE_SHADOW_CHANGE_MIN_MS` = 10 min since the last row; flips between rows are counted and carried (`flipsSinceLastRow`); bound: at most 7 rows per signal per hour (~700/h at ~100 queued). Test: 20 flips in 5 minutes ⇒ one row; the next flip past 10 minutes ⇒ one row carrying ≥ 20. |
| record 1 — the decision dispatched on `sqeAssetClass` (symbol-resolvable) | now `asValidAssetClass(signal.assetClass)` — the row's class — with a fence. |
| record 2 — the promotion trace written before the delete | moved after a successful delete. |
| record 3 — `1-system-manual/ACTIVE_PATH_FLOW.md:242,244` document both removed calls | added to the Step-10 list. |
| record 4 — CI | run `38223297445` on `40306a0a0` was cancelled by the change-list push (Build and TypeScript Check `success`, Test Suite and Docker Build `cancelled`); no 4/4 on that head — Step 5 will cite the run on the r2 head. |
**Tests:** 43 (24 + 4 new in the refresh file, 15 unchanged in the contract file) · tsc 337 = 337 · full suite 4,125 passed, the same 10 files fail on the clean tree.

