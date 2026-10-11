# B-PRICE-STALENESS-BOUND — Step 4 change list (CC-C, 2026-10-11)

**Graded ref:** `origin/migration/aws-supabase` at `bc951c51b`. **Code commits:** `0a82d2a24` (part 1: P1, P1b, P2), `cde9cbb75` (part 2: P4 = 8g + 8g-bis), `bc951c51b` (part 3: P3, P5). **CI, per job, all three:** `38151329215` (`0a82d2a24`), `38152275479` (`cde9cbb75`), `38152948890` (`bc951c51b`) — TypeScript Check (baseline gate), Test Suite, Build, Docker Build each success. tsc baseline 337 = 337.

## THE DISPATCH HEADER
| # | field | value |
|---|---|---|
| i | **declared change-class** | `architecture` |
| ii | **that class's doc set** | SCOPE — present, `Scope Files/B_PRICE_STALENESS_BOUND_SCOPE.md` · PRE_AUDIT — present, `Scope Files/B_PRICE_STALENESS_BOUND_PRE_AUDIT.md` (r3, approved) · COMPLETION_REPORT — absent, Step 11 · BATCH_CATALOG — absent, Step 10 · PHASE_HISTORY — absent, Step 10 · SYSTEM_MANUAL — absent, Step 10 (the price-freshness section: observation vs receipt age, the snapshot rule, the cold state) · SYSTEM_IMPACT_MAP — absent, Step 10 (archiver mark-age rule incl. `observed`, stated as RECEIPT age; watchdog baseline; adapter display ages; the tripwire) · CHANGES_AND_FIXES — judged, Step 10 · RUNNING_ISSUES — present in part (`#743`, `#951`, `#913` homing at `df2215047`), closures at Step 10 · DELETED_COMPONENTS_LOG — present (`bc951c51b`, `WS_CACHE_FALLBACK_MS`) · ADJUSTMENT_FRAMEWORK — judged at Step 10 (new knob `mark_staleness.cold_mark_max_ms`) · POST_AUDIT_ROADMAP — N/A, no roadmap item · PHASE_19_PLAN — N/A, not a P19 batch · SPRINT_TO_LIVE_PLAN row 33 — present, state cell at Step 10 · memory files + CC-C task list — Step 10 |
| iii | **Step-2 reference** | `Scope Files/B_PRICE_STALENESS_BOUND_PRE_AUDIT.md` at `9d7af7398` (r3, your approval at `bbf81f45a` folded as §D) |

## 1. P1 + P1b — route B, `server/services/passive-archive/equity-spot-archiver.ts` `parseTickerSnap`
```ts
// BEFORE (one line, every frame type)
latestEquityTick.set(_sym, { price: _mark, tsMs: _now, kind: _kind, raw: _raw });
// AFTER
if (frameType === 'snapshot') {
  const _prev = latestEquityTick.get(_sym);
  latestEquityTick.set(_sym, _prev
    ? { price: _mark, tsMs: _prev.tsMs, kind: _kind, raw: _raw, observed: _prev.observed }
    : { price: _mark, tsMs: _now, kind: _kind, raw: _raw, observed: false });
} else {
  latestEquityTick.set(_sym, { price: _mark, tsMs: _now, kind: _kind, raw: _raw, observed: true });
}
```
`EquityTick.observed?: boolean` (undefined on a hand-built tick reads as observed). Only `snapshot` is special-cased; an untyped frame behaves as before.

**The gate, `active-execution-engine.ts` (after the ceiling is computed, before the stale test):**
```ts
if (_eqTick.observed === false) {
  const _coldAge = Date.now() - _eqTick.tsMs;
  const _allowMs = Math.min(_coldMaxMs, _ceiling.ceilingMs);   // condition 2: own knob, ceiling a CAP
  if (_coldAge <= _allowMs) { this._coldMarkTicks++; /* per-position pending */ withoutPrice++; continue; }
  // once per episode: [EQUITY_MARK_COLD_EXPIRED] … then the ordinary stale skip:
  await this._recordPriceSkip(position, <equity_tick_stale_basis>, `no update since subscribe, ≥Ns (ceiling Ms)`);
  continue;
}
// first observed tick after a cold episode: [EQUITY_MARK_COLD_CLEARED] waitedMs coldTicks expired
```
- Condition 1: the cold path `continue`s before both `_recordPriceSkip` (the only increment, `:902`) and the reset (`:2689`). Test: streak 7 → cold tick → 7; control: an observed evaluated tick deletes it.
- Condition 3: no `updateCache`, no `updateActiveOpenPosition` on a cold tick (both asserted in the test).
- Knob: `mark_staleness.cold_mark_max_ms` = 15000, xStock only; migration `2026-10-11-b-price-staleness-bound.sql` + rollback + MANIFEST; read by `readXstockColdMarkMaxMs()` in `mark-staleness-config.ts` (the one reader — the inc-3 fence passes); warm-up asserts presence and `(0, cap_ms]`; a missing row fails closed with its siblings (`equity_age_knob_missing`).
- Counters on the EVAL_EXIT line: `coldMarkTicksSinceStart`, `coldMarkPositionsNow`.

## 2. P2 — the watchdog, `runStallWatchdogTick`
```ts
// BEFORE
if (isInXstockWeekendClose(now)) return;
const ageMs = state.lastDataMsgAt > 0 ? Date.now() - state.lastDataMsgAt : Infinity;
// AFTER
if (isInXstockWeekendClose(now) || isXstockVenueTransitionPause(now).window === 'sun_reopen') {
  state.closureSeenAt = now.getTime();
  return;
}
const ageMs = state.lastDataMsgAt > 0 ? Date.now() - Math.max(state.lastDataMsgAt, state.closureSeenAt) : Infinity;
```
Test on the real calendar (Sun 2026-10-11): no fire at 20:00:16 or 20:13:16 ET, none at 20:40, fires at 20:47:01 (751 s after the last pause tick); control: no closure stamp ⇒ the 20:40 tick fires; a weekday outage with an old stamp still fires.

## 3. P4 / 8g — the crypto exit age check
`server/core/trading/exit-price-age.ts` (new, pure): `judgeExitPriceAge(quote, now, max, isExempt)` → `fresh | exempt | stale | unstamped`; `CRYPTO_EXIT_PRICE_MAX_AGE_MS = 2000`, now also the argument to `getPriceWithFallback` so the two cannot drift.
```ts
const _venueMarkOk = <the old accept condition>;
let _exitAgeOk = true;
if (_venueMarkOk) {
  const _ageJ = judgeExitPriceAge(priceResult!, Date.now(), CRYPTO_EXIT_PRICE_MAX_AGE_MS, (p) => ageExemptionOfProducer(p) !== null);
  if (_ageJ.verdict === 'exempt') exitAgeExemptUsed++;
  if (!_ageJ.actionable) { _exitAgeOk = false; exitAgeRefused++; console.warn(`[EXIT_AGE_REFUSED] …`); }
}
if (_venueMarkOk && _exitAgeOk) { /* accept, as before */ } else { /* the existing non-actionable path → direct REST leg */ }
```
Test through the real exit loop: a 14.3 s `kraken_rest_rate_limited_reserve` at 94 below a 95 stop never reaches the evaluator; with the token bucket empty the tick skips `rest_token_exhausted`; control at 0.5 s reaches the evaluator (`EXIT_EVAL livePrice=94`). (The stop does not fire in the control because the crypto trigger needs book sides the harness does not seed — stated in the test.)

## 4. P4 / 8g-bis — `server/services/reserve-row-tripwire.ts` (new)
`classifyReserveRow` → `null_stamp | stamp_equals_close | wrong_source`; `runReserveRowTripwire` alerts once per row (`reserve-row-tripwire-<id>`); the engine runs it every 10 minutes post-cycle, awaited by nothing, logging `reserveRowsChecked=` so an empty arm reads as unexercised. Query: `SELECT id, symbol, exit_observed_at_ms, closed_at, exit_price_source FROM closed_trades WHERE mode = $mode AND exit_price_producer = 'kraken_rest_rate_limited_reserve' AND closed_at >= $since`.

## 5. P3 — display ages, `live-pricing-adapter.ts`
The xStock gate, all-APIs-failed and fetch-exception re-serves, and the Kraken REST quote: `timestamp: observedIso(<observedAt>)` (a required number, no fallback to now). `peekCachedPrice.ageMs = now − observedAt`. `getPriceWithFallback`'s last resort already passed `cached.timestamp` through unrefreshed — a fence covers all four.

## 6. P5
`ENGINE_PRICE_READ … ageMs=${diffMs}` → `sinceLastTickMs=${diffMs}` (`#913`). `WS_CACHE_FALLBACK_MS` deleted; `DELETED_COMPONENTS_LOG` entry.

## JUDGEMENT CALLS — PLEASE ATTACK
1. **Operator closes are not gated by 8g** (flatten, stop reconcile, manual close). The scope row said "every exit action"; I read the census rule that an operator decision is never blocked as governing. Is that right, or does 8g bind them too?
2. **(b) is exact-millisecond equality** to the close instant, as the row is written. A launder at close a few ms before `closed_at` is set would escape it; a tolerance would false-positive a genuine re-serve observed within that tolerance. I kept the spec.
3. **The tripwire runs in the engine** (every 10 min, per mode, 24 h look-back after a restart, so a row resolved in that window can re-alert once). Alternative homes: the governance checker, or a cron job (which would inherit `#691`).
4. **Cold allowance is `min(knob, ceiling)` evaluated at the gate each tick** — a σ change mid-episode moves the allowance. Acceptable?

**NOT RE-READ by a second reader:** the design calls above and the knob/interval reads (`max_consecutive_price_skips` 40, `monitoring_interval_ms` 1500, 2026-10-10 23:06Z). The mechanism claims are each carried by a test that was mutation-checked red.
