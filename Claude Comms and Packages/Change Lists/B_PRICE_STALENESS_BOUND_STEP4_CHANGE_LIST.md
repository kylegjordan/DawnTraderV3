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

## GATE 1 — APPROVED by Langston (2026-10-11) with three in-commit conditions — FOLDED (part 1b, this commit)
- **BLOCKER-1 — polarity inverted.** `parseTickerSnap`: `frameType === 'update'` refreshes (`tsMs = now`, `observed: true`); ANY other frame — `snapshot`, untyped, unrecognised — carries the prior `tsMs` + `observed`, or births a cold mark. Same polarity as the cohort clock. `EquityTick.observed` is now REQUIRED (the chain harness states `observed: h.markObserved ?? true`). Test: an update, then an untyped and a `mystery` frame an hour later — age unchanged, price moved; an untyped frame with no prior entry births a cold mark. Mutation (back to snapshot-only) → red.
- **BLOCKER-2 — its own reason.** A cold mark past its allowance is recorded as `equity_tick_stale_cold_unobserved` (never a ceiling basis), so per-basis counts stay clean; the `equity_tick_stale_` prefix keeps it in the quiet-market family (`venue-quiet-alerting.ts:60`) and the stale-reject copy (`active-execution-engine.ts:555`) with no second site. Test asserts the exact reason.
- **CONDITION-3 — the markless writer fenced.** Test: a cold and an observed mark each receive a frame with no mark ten minutes later — `tsMs`, `observed` and price carry, the sides move. Mutation (the branch rebuilt without `observed`) → red.
- **Record items:** (a) migration before code — `dt-deploy` runs `db:migrate` in-chain before the restart, so the warm-up sees the row; the rollback header states the reverse order. (b) Line refs pinned at this commit: `_recordPriceSkip` `:913` (increment `:914`), cold gate `:2220`, reset `:2800`. (c) `_coldAge` removed — the gate uses `_eqAge`, the one quantity. (d) the cycle line splits `coldMarkPositionsNow` (waiting) from `coldExpiredPositionsNow`. (e) **Ruled: a restart inside the `sun_reopen` pause may mint `price-skip` rows** — the pause sits after pricing, so an ordinary stale mark in that window already does the same; it is bounded, the honest direction, and a clock term in the mark gate would be worse. (f) Judgement call 4, restated as you put it: **the bound is the knob**; `ceilingMs ≥ floor_ms` always, so at the seed (= `floor_ms`) the `min()` is constant and binds only if the knob is raised. The warm-up band `(0, cap_ms]` is coherence, not a guard rail.

## GATE 2 — APPROVED by Langston (2026-10-11) with two in-commit conditions — FOLDED (this commit)
- **Calls ruled:** (1) operator closes stay ungated (`active-portfolio-manager.ts:349-350` states why); (2) keep the equality, generalised — see condition 1; (3) the engine is the right home.
- **CONDITION 1 — arm (d), AGE.** `classifyReserveRow` now returns `{ violations, ageAtCloseMs }` with four arms: `null_stamp` · `stamp_too_young` (age at close < `RESERVE_MIN_HONEST_AGE_MS` = 100 ms — subsumes exact equality and a stamp after close; the youngest honest re-serve on record is 936 ms) · `wrong_source` (NULL included) · **`stale_at_close`** (age at close > `CRYPTO_EXIT_PRICE_MAX_AGE_MS`, any close path — the only arm that reaches the ungated operator closes; an upper bound on decision-time age). `close_reason` is selected and carried into the alert and the run line. Per-run alert cap 20 (`overCap` counted). Run line states `lookback=restart_24h|watermark`; the header states the invariant is checked only while the engine runs. Test: 14.3 s fires `stale_at_close` (it was the old negative control — certified clean, as you said); 936 ms / 100 ms / 2,000 ms stay clean; the cap. Mutation (arm d removed) → red.
- **CONDITION 2 — the structurally-zero counter removed.** `exitAgeExemptUsed` is gone from the engine with the reason in a comment (an exempt producer reaching 8g is always already fresh); the judgement keeps the exempt branch; the P-7h comment that promised the exemption would decide at 8g is corrected. Fence: no `exitAgeExemptUsed` in the engine.
- **The `#951` residual is discharged positively** (your enumeration: 8 reserve rows, `paper`, 2026-09-22 → 2026-10-06, all stamped, source `kraken_rest`, 936-4,553 ms) — the module header says so; `RUNNING_ISSUES` records it at Step 10.

## GATE 3 — SENT BACK by Langston (2026-10-11), three findings — FOLDED (gate 3 r2, this commit)
- **FINDING-1 — the reachability ruling: a non-finite `observedAt` is treated as REACHABLE.** The type says `number`, but the cache writer's `quote.observedAt ?? Date.now()` admits NaN, and nothing proves every writer finite. So every P3 site takes `:867`'s shape: the xStock gate, the all-APIs-failed and fetch-exception re-serves require `Number.isFinite(observedAt)` and otherwise fall to `no_reliable_price`; the Kraken REST quote leg requires it and otherwise falls to the paths below; `peekCachedPrice` returns no peek, which `routes.ts:4932` reads as venue-quiet (the safe direction). No `?? Date.now()`. The gate's own log line uses the same predicate (`_gateServes`), so it never says `serving=last_known_good` for a row it will not serve. Tests: a NaN row on each of the four legs ⇒ `no_reliable_price`, no peek; the gate leg is asserted to decide AT the gate (its log line, and no `Live fetch exception`) — without that assertion the gate guard's mutation passed, because the throw was caught one leg down. Mutations of the gate guard and the catch-leg guard → red.
- **FINDING-2 — your withdrawn ruling amended in the body, not stacked:** the comment now states that since P3 a NaN would reach BOTH the provenance columns and `isPriceVenueQuiet` (`:378`) at `routes.ts:4932` (via `peekCachedPrice`) and `routes.ts:12106` (via `:11931`), and why every P3 site guards. The neighbouring sentence that called the last-known-good leg "UNGUARDED" is corrected the same way.
- **FINDING-3 — `#913` by class.** Enumerated: exactly three log lines print `${diffMs}` — `[PRICE_TICK] diff_ms=` (honest), `[ENGINE_PRICE_READ]` and `[8.8.3-I6][ENGINE_LIVE_PRICE]`, the second renamed from `age=…ms` to `sinceLastTickMs=`. The fence now reads every console line carrying `${diffMs}`, asserts the three by tag, and requires each label to be `diff_ms` or `sinceLastTickMs`. Mutation (`age=` restored) → red. No script parses either line (grep of `scripts/` and `server/`).

## GATE 3 r2 — APPROVED by Langston (2026-10-11): Step 4 cleared on the code. Two non-blocking conditions — FOLDED (this commit)
- **Condition 1 — every NaN leg asserted to decide WITHOUT an exception.** Without its guard each leg throws in `observedIso` and the `catch` also returns `no_reliable_price`, so a verdict assertion cannot see a lost guard. The all-APIs-failed (NANX) and REST-quote (NANZ) cases now also assert no new `Live fetch exception`. **All four guards mutation-proved: each removed in turn → 1 test red** (all-APIs-failed, fetch-exception, REST quote, gate). The class, recorded: a guard whose omission throws into a `catch` that returns the same verdict is invisible to a verdict assertion.
- **Condition 2 — the label, not the variable.** The two `[LAST_KNOWN_GOOD_FALLBACK]` lines printed `age=${cacheAge}ms` — the RECEIPT age, reset every poll — beside a quote now stamped with its observation time. They print both, named: `receiptAgeMs=` and `observedAgeMs=`. Fence: both lines carry both labels and no bare `age=`. Left intentionally (Langston): `:526`, `:1311`, `:1428` print the receipt age as the TTL/threshold decision's own quantity.
- **Nit:** the comment's `isPriceVenueQuiet (:378)` corrected to `:381`.

## STEP 5 — CI on the final head `10a41786a31e645e9033d03c77ee4c0deaadd803`: run `38158614608`, per job — TypeScript Check (baseline gate) success · Test Suite success · Build success · Docker Build success.

## STEP 7 — PRE-REGISTERED BEFORE THE DEPLOY (written 2026-10-11 17:30Z; deploy held until the row-2 Sunday-reopen reads finish, ~2026-10-12 01:00Z)
Logs: `error.log` for warn/error lines (the PM2 split — an exit-path zero is never read from `out.log` alone), `out.log` for the cycle and tripwire lines. Every count names its window.
1. **Deploy took** — `dt-deploy` record at the reviewed head; `db:migrate` ran; ENGINE RESUMED; the warm-up line passes (the `cold_mark_max_ms` row present: `module_constants` read, all six key columns).
2. **P2, the NEGATIVE CONTROL first, on tonight's reopen (OLD code):** the watchdog pair at Sunday 20:00 and ~20:13 ET (2026-10-12 00:00Z / 00:13Z) is EXPECTED in stderr tonight, because the deploy comes after it. **PASS for P2 is read at the NEXT Sunday reopen (2026-10-18/19 00:00Z): zero `[STALL]` lines and zero `xstock-equity-feed-stall` rows between 00:00Z and 00:35Z, AND the watchdog still able to fire (no `closureSeenAt` stuck in the future — the 00:47Z+ silence rule holds).** Tonight's pair is the control that the instrument sees the event.
3. **P1/P1b at the deploy's own subscribe:** per held xStock, either `EQUITY_MARK_COLD_CLEARED waitedMs=` (an update arrived inside 15 s) or `EQUITY_MARK_COLD_EXPIRED` then `equity_tick_stale_cold_unobserved` skips (no update inside 15 s — expected on thin overnight books). **FAIL if any held xStock logs `XS_FRAME frame=ok` before its first `update`** (the PLTR shape), i.e. a `frame=ok` line for a symbol whose COLD line has not cleared. The cycle line's `coldMarkTicksSinceStart` > 0 at the first cycles is the positive control that the state was entered at all.
4. **P1b quiet-market join:** any `equity_tick_stale_cold_unobserved` escalation joins the `venue-quiet-paper-xstock_spot` standing record when the class verdict is quiet/closed; it pages only on `not_quiet`/`thin`. No new dedupe key minted (alert store, keys since deploy).
5. **P4/8g:** `exitAgeRefused` on the `EVAL_EXIT` cycle line, and every `[EXIT_AGE_REFUSED]` line (producer, verdict, age). Expected rare: only a rate-limited re-serve older than 2 s at the crypto exit leg. A zero is read against the count of `kraken_rest_rate_limited_reserve` serves in the same window (`[8.8.5][REST_BLOCKED]` lines) — no serves ⇒ unexercised, not passed.
6. **P4/8g-bis:** `[RESERVE_ROW_TRIPWIRE]` run lines every ~10 minutes per mode; the first says `lookback=restart_24h`; `reserveRowsChecked=` read against the reserve rows in `closed_trades` over the same window (the instrument's population, queried independently).
7. **P3 on the screen (Claude-in-Chrome):** the RTB "Current" column and the open-trades table show a re-served price's OBSERVATION age (a badge reading venue-quiet where the observation is > 60 s old), cross-checked against the adapter's `[LAST_KNOWN_GOOD_FALLBACK] … observedAgeMs=` lines for the same symbol.
8. **P5:** the new labels present (`sinceLastTickMs=` on both cadence lines, `receiptAgeMs=`/`observedAgeMs=` on the fallback lines) and no `age=${diffMs}`-shaped line.

## STEP 6 — DEPLOYED `78f62ed016a3453947280a35d6a6af028f0303df` 2026-10-12T00:42:13Z (`dt-deploy --by cc-c`, restart 639, migrate 786 ms, engine resumed, identity asserted). CI `38188554376` 4/4 per job. Range from `620b1b6b5`: this batch + CC-A's `B-AFTERLIVE-TOTAL-RULE` census (Step 8 confirmed), announced. Preserved files (phase9 + 5 CSAV reports) SHA256-identical after the deploy (`/home/deploy/preserved-row33-20261012T004141Z`). Rollback target `620b1b6b5`.

## STEP 7 — FIRST READS (2026-10-12 00:42-00:43Z; `error.log`/`out.log` from 00:42:13Z) against the pre-registration above
- **(2) P2 negative control — SEEN as predicted on the OLD code:** `[STALL] open socket silent 792224ms` at 00:00:13Z and `777998ms` at 00:13:13Z. PASS is read at the next Sunday reopen (2026-10-19 00:00Z) on this build.
- **(3) P1/P1b — PASS on its discriminating read.** `coldMarkTicksSinceStart` 13 → 46 over the first cycles (the state was entered). 5 `EQUITY_MARK_COLD_CLEARED` (UNH 2.5 s, AMAT 4.1 s, PLTR 5.8 s, CRCL 8.6 s, COPX 10.2 s) and 8 `EQUITY_MARK_COLD_EXPIRED` (BKR, RCL, RBLX, STZ at 15.0-15.2 s; GEV, KKR, MCD, NOC at 16.1-16.4 s, allowance 15,000 ms). **Every cold symbol's first `XS_FRAME frame=ok` came AFTER its clear** (UNH 00:42:18 vs 00:42:15 · PLTR 00:42:21 vs :18 · CRCL :24 vs :21 · COPX :26 vs :22; AMAT none yet); no expired symbol has a `frame=ok`. CRWD, MRVL, ORCL decided with no cold line: their first frame after the subscribe was an `update` (observed from the start — consistent). **PLTR, the 20.8-hour frozen book, cleared on a genuine update before any decision.**
- **(5) P4/8g — EXERCISED.** 8 `[EXIT_AGE_REFUSED]` in the first 17 s: UAI/USD ×6 (2.8-3.2 s), OOB/USD, DRV/USD (2.6-2.7 s), all `kraken_rest_rate_limited_reserve` `stale`; against 17 `[REST_BLOCKED]` serves in the same window. Followed through: UAI's refusal went to the direct REST leg and decided on a fresh `[8.9.2][REST_TICK]` mid. `exitAgeRefused` 0-2 per cycle.
- **(6) P4/8g-bis — UNEXERCISED, not passed:** `RESERVE_ROW_TRIPWIRE mode=paper lookback=restart_24h reserveRowsChecked=0 violating=0` — consistent with the population (the 8 reserve rows on record are 2026-09-22 → 10-06, outside 24 h).
- **Owed (Step 7 continues):** (4) the cold-unobserved escalations joining the standing record (needs a streak of 40); (7) the UI read in Claude-in-Chrome; (8) the labels at their first emission; (2) PASS at the 10-18/19 reopen.
- **(7) UI, Claude-in-Chrome (Kyle's session, 2026-10-12 00:49Z):** `/paper-trading` → Open Trades renders 20 positions. The `/api/active-engine/active-trades?mode=paper` payload that table reads: the 6 cold-EXPIRED xStocks (KKR, MCD, NOC, BKR, RCL, STZ) carry `priceSource=entry_fallback`, `priceVenueQuiet=true` — no fresh-looking number for a book with no update since the subscribe; observed xStocks read `kraken_equities_ws` at 148-1,597 ms; UAI `kraken_rest` 54 ms (its fresh REST read after the refusal). **No re-served (`last_known_good`) price was on the page at the read, so P3's observation-age display was UNEXERCISED there**; the RTB "Ready to Buy" list was empty (`/api/trading-signals` 0 rows). Re-read at the first re-serve that reaches a display.
