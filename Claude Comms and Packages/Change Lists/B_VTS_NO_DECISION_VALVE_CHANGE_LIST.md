# B-VTS-NO-DECISION-VALVE (row `3n.q3`) — Step-4 change list

**Code at `b24b755cd`** (the Step-3 commit; CI `36938896888` 4/4 green), **plus the commit carrying this file** (the reader fix: `vts-service.ts` outcome feedback on the carried class, one test).
⚠️ **`server/services/vts-runner.ts` carries the `🔒 LOCKED MODULE` header — named here per `#1076` (Langston ruled (b)): changes go through the eleven-step workflow, with this change list naming the header.**

## Header (the three fields)
| # | field | value |
|---|---|---|
| i | **declared change-class** | `architecture` (scope header, unchanged) |
| ii | **the class's doc set** | **scope** present — `Scope Files/B_VTS_NO_DECISION_VALVE_SCOPE.md` (r2, approved) · **pre_audit** present — `Scope Files/B_VTS_NO_DECISION_VALVE_PRE_AUDIT.md` (approved, C4-C7 folded, P9 amendment) · **completion_report** absent — Step 11 · **batch_catalog** absent — Step 10 · **phase_history** absent — Step 10 · **system_manual** absent — Step 10 (§18.0.1: a forced exit with no sell side closes unpriced) · **sim** absent — Step 10 (VTS close path both lanes, the shadow sink column, the weekend controller's reach, the collision set) · conditional: **running_issues** present (`#1141`, `#1143`, `#1144`, `#1145`) · **adjustment_framework** owed at Step 10 (rule 8 register: closes to new A/B members; the `#1145` exclusion selector) · **roadmap** N/A (no roadmap item) · **changes_and_fixes** judged at Step 10 · **deleted_log** owed at Step 10 (the `stale_timeout → shadow_max_hold` relabel and `bookedNoBidClamp` removed) · **phase_19_plan** N/A (the active plan is `SPRINT_TO_LIVE_PLAN`, rows 4/4a-4c written) |
| iii | **Step-2 reference** | `Claude Comms and Packages/Scope Files/B_VTS_NO_DECISION_VALVE_PRE_AUDIT.md` at `b24b755cd` |

## What to attack (the judgement calls)
1. **P2's helper extraction.** The archive write and the finishing steps moved out of the close loop into `archiveVtsExit` / `finishVtsClose` so the priced and unpriced closes share them. Content moved unchanged except where marked `3n.q3`; the priced call is now `await archiveVtsExit(...)` (the inline block awaited its imports too).
2. **The unpriced test is `exitPrice === null || exitReason === 'timeout_unpriced'`** — one fact tested twice so the compiler narrows both on the priced path.
3. **P9 extended by `#1145` (the collision re-run): 8 tickers added to `XSTOCK_SPOT_KRAKEN_COLLISIONS` (USD + EUR, 17 → 33 entries).** On `exchange = 'kraken'` these 8 now resolve `crypto_spot`. That is what fixes the STX/STRK contamination, and it is the one change in this batch that alters what the resolver returns.
4. **The boot repair (`bootstrapOpenTradesFromMemory`) now KEEPS a valid carried class** — B79.0g's design (re-resolve everything) is inverted; its tests are rewritten to the new intent.
5. **P6's skip placement** — before `recordLook`, keyed on `isInXstockWeekendClose(new Date(now))`.

## Load-bearing hunks

**P1 — `server/core/trading/vts-exit-booking.ts`**
```ts
-  clampPrice: number,
-): VtsBookedExit {
-  if (!usable(observedMark)) return { price: clampPrice, arm: 'clamp_no_mark' };
-  if (!usable(observedBid)) return { price: clampPrice, arm: 'clamp_no_bid' };
+): VtsBookedExit {
+  if (!usable(observedMark)) return { price: null, arm: 'clamp_no_mark' };
+  if (!usable(observedBid)) return { price: null, arm: 'clamp_no_bid' };
```

**P1/P7 — the real-lane push site (`vts-runner.ts`)**
```ts
+    const _vtsBooked = resolveVtsBookedExitPrice(_vtsExitBid, currentPrice);
+    if (_vtsBooked.price === null) countUnpricedArm(countersFor(_vtsExitByClass, trade.assetClass), _vtsBooked.arm);
     tradesToClose.push({ id: tradeId, trade, exitPrice: _vtsBooked.price,
+      exitReason: _vtsBooked.price === null ? 'timeout_unpriced' : normalizedReason,
       exitArm: _vtsBooked.arm });
```

**P2 — the close loop leaves before any outcome**
```ts
+    if (exitPrice === null || exitReason === 'timeout_unpriced') {
+      await closeVtsTradeUnpriced(id, trade, exitArm, now, holdDurationStr);
+      unpriced++;
+      continue;
+    }
     // Calculate P&L
     const grossPnl = (exitPrice - trade.entryPrice) / trade.entryPrice;
```
**P2 — `closeVtsTradeUnpriced`** (new): twin ⇒ Map delete, soft-close, `clearVtsTrailingState`, no record; otherwise ⇒ `archiveVtsExit(trade, { exitReason: 'timeout_unpriced', exitArm, exitPrice: null, pnlPercent: null, grossPnl: null, netPnl: null, finalTradeMode, now })` then `finishVtsClose(id, trade)`; counter `closedUnpriced`; one `console.warn` `[3n.q3][VTS_UNPRICED_CLOSE]`.
**P2/P4/P9 — inside `archiveVtsExit` (marked changes only)**
```ts
+      timeout_unpriced: 'time_stop_unpriced',
-      trade.entryPrice && trade.stopLoss && trade.entryPrice !== trade.stopLoss
+      exitPrice !== null && Number.isFinite(exitPrice) && trade.entryPrice && trade.stopLoss && trade.entryPrice !== trade.stopLoss
-      assetClass: vtsResolveClassOrLoggedDefault(trade.symbol),
+      assetClass: asValidAssetClass(trade.assetClass) ?? vtsResolveClassOrLoggedDefault(trade.symbol),
-      exitPrice,
-      pnlPct: pnlPercent !== undefined ? Number(pnlPercent) : undefined,
+      exitPrice: exitPrice ?? undefined,
+      pnlPct: pnlPercent !== null ? Number(pnlPercent) : undefined,
+        exitBookingArm: exitArm,   // in stateSnapshot
```
**`finishVtsClose`** = the removed inline block (Map delete → `markOpenTradeClosed` → both cooldown keys → trailing state), unchanged.
**Fix-on-find:** the priced twin path now ends `await clearVtsTrailingState(id, trade.symbol); continue;` (it never cleared trailing state).

**P3/P5 — shadow lane**
```ts
+  if (exitPrice === null || !Number.isFinite(exitPrice)) {
+    return { grossPnl: null, netPnl: null, rMultiple: null, holdingMs: now - openedAt };
+  }
...
+  const _sFr = exitPrice === null ? null : recomposeVtsCloseFriction(trade, exitArm);
+      exitBookingArm: exitArm,
...
-    const reason = decision.exitReason === 'stale_timeout' ? 'shadow_max_hold' : (decision.exitReason ?? 'timeout');
-    const _sBooked = resolveVtsBookedExitPrice(_sExitBid, currentPrice, decision.exitPrice);
+    const _sBooked = resolveVtsBookedExitPrice(_sExitBid, currentPrice);
+    if (_sBooked.price === null) countUnpricedArm(countersFor(_vtsShadowByClass, trade.assetClass), _sBooked.arm);
+    const reason = _sBooked.price === null ? 'timeout_unpriced' : (decision.exitReason ?? 'timeout');
```
Migration `2026-10-02-b-vts-no-decision-valve-shadow-arm.sql` (+ rollback, both in git; MANIFEST): `ALTER TABLE rtb_shadow_pairings ADD COLUMN IF NOT EXISTS exit_booking_arm VARCHAR(16)`, `lock_timeout 5s`, comment *"NULL = written before 2026-10-02, never an arm"* (C7). Drizzle column added.

**P6 — the shadow pass**
```ts
   for (const [tradeId, trade] of openShadowTrades) {
     if (!trade.assetClass) { openShadowTrades.delete(tradeId); continue; }
+    if (trade.assetClass === 'xstock_spot' && isInXstockWeekendClose(new Date(now))) continue;
```

**P7 — `server/core/trading/vts-exit-counters.ts`** (new, pure): per-class `exitLooks`, `exitNoTransactableSide`, `unpricedNoBid`, `unpricedNoMark`, `closedUnpriced`; both lines print `crypto_spot{…} xstock_spot{…}` when any class has a count; `bookedNoBidClamp` retired.

**P8** — `_vtsExitRefusal` = the crypto selection's `tickerRefusal` (or `no_bid_side`) / the xStock guard's `reason`; the streak reason becomes `no_transactable_side (<refusal>)`; the alert body says the trade *"closes with NO recorded price (`time_stop_unpriced`)"* and that a `crossed_book` cannot be fixed by any ceiling.

**P9** — the open-time friction fallback and the boot repair use `asValidAssetClass(…) ?? <ticker resolver>`; `shared/asset-classes.ts` +8 USD +8 EUR collision entries (names read from `xstock_spot_universe`, 2026-10-01).

## A second reader at `a7b54d991` (object round) — what it found, and what changed
- **Priced closes are NOT byte-for-byte unchanged, and I said they were.** The order and awaiting hold (persist → archive → finish → log; finish = Map delete → soft-close → both cooldown keys → trailing state). The changes, all intended: the archive row's class is the carried one (collision xStocks now archive `xstock_spot`); every snapshot gains `exitBookingArm`; the priced twin clears its trailing state; and **a priced close with a valid stamp no longer calls the ticker resolver, so its per-close collision WARN and the classify-fall-through counter stop firing for those closes** (that counter's population shrinks).
- **The collision additions flip the ticker resolver for 8 tickers to `crypto_spot` — and one re-derivation site served xStock CLOSES:** `persistRealPriceTrade` (`vts-service.ts:1139`) chose the outcome-feedback EMA and EV-gap bucket from the ticker. **Fixed in this commit** (carried class first) — it was already wrong for the original 9 collision tickers. The reader's other sites: the crypto pair loop and crypto open (`vts-runner.ts:1543, :2331, :5395`) and the RTB crypto-cache telemetry (`rtb-refresh-service.ts:454`) only see crypto symbols, so the flip CORRECTS them for STX/STRK; `rtb-refresh-service.ts:349` is a no-stamp fallback; `vts-service.ts:352` is inside `simulateTrade`, which has **zero callers** (`git grep`) — dead code, homed to row 4a (rule 18).
- **Limits, stated:** the archive is the unpriced close's only durable record, and it is switchable (`b70_exit_decision_capture_enabled`) and queued, not flushed; `closedUnpriced` lands on the NEXT printed line (it can wait, or be lost on a restart, when the map empties first); a trade skipped as an unsupported class appears in no counter; the shadow skip keys on the window while the real lane keys on `state` (they can disagree for one controller poll), and neither covers US holidays.

## Tests
New `server/tests/unit/b-vts-no-decision-valve.test.ts` (18 tests: the resolver; the counters; the shadow math with a priced positive control; `closeVtsTradeUnpriced` driven for real with the archiver and the soft-close mocked — one archive row with null price/P&L/R, the arm, the carried class for a MET xStock, the LEGACY cooldown key for crypto (C6), no archive row for a twin; source fences for what it never calls, the loop order, P4, P6's placement, P8). Updated: `b-price-side-8a-p3-crypto-finish`, `b65-tec-parity` (D7 inverted, as its own comment said it would be), `fg2-obj5-vts-cost-truth`, `b-price-side-8a-p4c-instrument`, `b79-0f-asset-class-collisions` (17 → 33), `b79-0g-vts-trade-persistence` (a valid carried class is kept). `tsc` 339 = baseline. Local full suite: the only failures are files I did not touch that need a database (ECONNREFUSED :5432) or fail to load on Windows — CI is the arbiter.

## Step 7 — the pre-registered reads (CC-C, 2026-11-05)

Deploy line: release deploy B `3576d39810fa7428501b68ce341ee46533c24935`, live 2026-10-06T15:45:04Z. Every read below is in `scripts/analysis/b_vts_no_decision_valve_step7.sql` (run on staging 2026-11-05 ~21:10Z, and re-runnable). The first xStock shut window after the deploy is **[2026-10-10 00:00Z, 2026-10-12 00:00Z)** — 10-10 is a Saturday. ⚠️ **Corrected at Step 8 (Langston F1): eight deploys landed inside the read window**, so 'the deploy line' is the valve's, not the build each read ran on — (c) and (f) ran on `620b1b6b5` (live 2026-10-11 11:18:24Z → 10-12 00:41:48Z), which carries this batch's weekend skip unchanged plus increment C's venue-transition pause eight lines under it (`sun_reopen` = 20:00-20:34 ET); `vts-exit-booking.ts` is byte-identical between the two.

| read | criterion as pre-registered | result |
|---|---|---|
| (a) shadow | no new `shadow_max_hold` row | **PASS** — 0; since the deploy the shadow closes are `stop_hit` / `target_hit` / `timeout` (arm `bid`) and `timeout_unpriced` (arms `clamp_no_bid` 239, `clamp_no_mark` 189) |
| (a) real lane | no plain `time_stop` archive row with a `clamp_*` arm | **PASS** — 141 `time_stop`, all arm `bid`; the clamp arms appear only as 5 `time_stop_unpriced` (xStock) |
| (b) | every new shadow close carries `exit_booking_arm` | **PASS** — 0 NULL across 70,924 shadow closes |
| (c) | 0 xStock shadow closes inside the first shut window — proves the SKIP, not that Class B is gone | **PASS** — **0**; control, the same window one week earlier (pre-deploy): **193** |
| (d) | unpriced rows carry NULL outcomes and appear in no `virtual_trades` JSON | **PASS** — 428 shadow + 5 real unpriced rows, every one NULL price and NULL P&L; 9,438 records in the 31 JSON files since the deploy, none unpriced (positive control: every record's `exitReason` read — 6,336 `stop_hit`, 2,103 `target_hit`, 807 `never_filled`, 190 `timeout`, 2 `legacy_missing_fill_provenance`) |
| (e) | the counter lines print per class | **PASS** — `[8a-P3][VTS_TOUCH] crypto_spot{… closedUnpriced=…} xstock_spot{… closedUnpriced=…}` (read 2026-11-05 20:28Z) |
| (f) | the first reopen: the xStock shadows open at the window start whose 48 h cap fell inside it close in the first passes, predominantly UNPRICED; **expected ≈ 100-115**; *a count far outside the band is investigated* | **186**, all closed 2026-10-12 00:35:42-53Z — **123 unpriced (66%: `clamp_no_bid` 70, `clamp_no_mark` 53), 63 priced at the bid**, every clamp row NULL price and NULL P&L. **Run on `620b1b6b5`, not `3576d3981` (F1):** that build's `sun_reopen` pause holds the first pass to 00:35Z, when more of the feed is back than at 00:00Z, so **66% unpriced is a FLOOR** for the valve alone. **The decisive evidence is the before/after on the SAME definition:** the 10-03 capped set was **193 of 193 `shadow_max_hold`, NULL arm, closed 10-03 14:03Z → 10-04 21:27Z — inside the weekend, at entry price**; after the deploy, 0 inside and all 186 at the reopen (the 193 are also (c)'s control rows — one fact, not two). **The count is above the band and the excess is NOT explained here (F2):** the capped set on five weekends reads 114 / 103 / 193 / 186 / 77, but the eligible opens in the 48 h before each were 382 / 461 / 507 / **30,461** / 1,124 — capped fractions 29.8% / 22.3% / 38.1% / **0.61%** / 6.9% — so comparing levels across a 60× population change says nothing; the band was simply never tested against a week like this one. ⚠️ The pre-registration named `clamp_no_mark` as dominant; `clamp_no_bid` was larger — explained by what the arm tests (F3, homed at `#1144`). |

**Not covered, stated:** (c) proves the skip on one weekend; Class B on a weekday (the SYK/USD 09-16 case, C4) is outside this read. **The minting burst is unexplained:** xStock shadow opens ran 215 (10-05) and 311 (10-06), then **2,458 (10-07), 18,409 (10-08), 12,052 (10-09)**, and were back to 175 (10-12) and 242 (10-13). It ended before 10-12, so the row-59e shadow-per-signal change deployed that day cannot be its cause — my first draft said it was, which is chronologically impossible (corrected at Step 8, Langston F2). Its cause is unestablished; Langston is surfacing it to Kyle, because a 60× swing in shadow minting sits upstream of every shadow-sourced read.

**Observation datum, live inside the window (2026-11-06, Langston Step 8 record (2)):** VTS xStock trade `vts_xstock_spot_1793813086152_lhyuixj` (STRK/USD, and its twin) opened 2026-11-04 17:24:46Z and is still open ~30 h later with no transactable side (`no_transactable_side (too_old)`); its no-decision rail has paged 9 times on the trade and 9 on the twin (11-04 18:53Z → 11-05 20:42Z). The other 6 of the 24 `no-trigger-vts-STRK/USD*` rows since 10-28 belong to a SEPARATE trade, `…1793202670303_sjhycom` (opened 2026-10-28T15:51:10Z, paged 10-28 → 10-30) — so the refusal is recurrent on the symbol across two trades a week apart (three alert keys, enumerated by Langston; the keys are per-trade-and-twin, so the 9/9/6 split is read off the keys, not inferred from the bodies). Each clear was a streak reset at the 60 s cadence, NOT a decision. Its 7-day max-hold falls 2026-11-11 17:24Z (scheduled read: alert `00b727aa-e1b6-4277-902f-4c6f628c167f`, 2026-11-11T17:30Z); if no usable bid exists then, it is this batch's subject arriving live and should close `time_stop_unpriced` with NULL price and P&L — read it then.
➕ **For the 2026-11-11 17:30Z read (alert `00b727aa`), Langston 2026-11-06 (Discord `1568253368206360617`):** before touching either ceiling, read STRK/USD's cached sides — `bid == ask` means the cache never received real sides for it, which is a different cause from a stale one. The two no-decision alerts (`c4ef1533`, twin `0e29d4fa`) are the same trade; resolve both at that read, never ack.
➕ **2026-11-06 14:06Z (CC-C, at Langston's routing in Langston, Discord `1568265055860949133`):** the two no-decision alerts were resolved with evidence, not left to 11-11 — the guard refusing an aged or wide STRK/USD xStock quote and holding is the designed `#994` behaviour. Read at 14:06Z: 1,118 STRK/USD snapshots in 24 h (one per ~77 s on average), last 14:00:40Z, quote 68.35 / 69.73 (≈2.0 % wide, against the 1.07 % exit ceiling). The 11-11 max-hold read (alert `00b727aa`) stands, and the cached-sides check above still comes first.
➕ **2026-11-06 ~17:10Z (CC-C) — CORRECTION AND THE MISSED-STOP RECORD (Langston, Discord `1568285647918072054`, `1568292498206621768`, `1568307357006700689`).** (1) **My resolve evidence on `c4ef1533`/`0e29d4fa` (14:06Z) and `344790c5`/`cf1244b3` (15:00Z) named the WIDTH ceiling (`exit_max_spread_fraction` 0.0107); the arm the engine reported is AGE** — `vts-xs-guard.ts:43` returns `too_old` before the spread test at `:48`, and near the stop the age ceiling collapses to `floor_ms` 15,000 (`mark-staleness.ts:203-205`) against a STRK quote cadence of ~24 s (47 % of gaps > 15 s). In the 15:23-15:36Z window the width arm was ALSO shut (26 of 27 ticks over 1.07 %, Langston from snapshots). Both arms bind on this symbol; tune neither on the strength of the alert text. (2) **A stop was breached and not taken:** 15:23-15:36Z bid 68.12 against stop 68.4453 for ~1.6 min, the only tick clearing both arms came after the recovery to 68.70; on 11-04 the bid sat at or below the stop with the market tight on 235 snapshots. (3) **The 11-11 17:24:46Z max-hold therefore closes both trades unpriced on a probable LOSS** — the read at `00b727aa` must record the reconstructed result from the snapshots (the stop-touchable moments, the price, and the loss it implies), so the loss stays in the record even though the trade row carries none. (4) Homes: the thin-symbol ceiling-vs-unpriced decision is row 2 increment (4a) objective 12 (this batch's valve, mine); the structural cure — a stop that rests at the venue — is `#563` / row 191 `B-VENUE-RESTING-EXITS` (CC-A, Wave B3, before go-live).
➕ **2026-11-06 17:02Z — PRESERVED NOW, AND REPEATED AT THE 11-11 READ (Coltrane, KD-34, Discord inbox 17:01:56Z): the evidence record for the missed stop, which no later deploy can strengthen.** Population **2 of 2 trades** (`vts_xstock_spot_1793813086152_lhyuixj` + `_twin`); **18 of 27 snapshot instants** 15:23-15:36Z at or through the stop **68.44530375**; minimum bid **68.12**; about **1.6 minutes** through the stop; **RECONSTRUCTED from `xstock_spot_ticker_snap`, not engine-observed and not shown bookable** (26 of 27 instants were over the 1.07 % width ceiling, and the engine refused on age). ⇒ **(b) is the before-11-11 action and it is enough for these two trades; (c) no ceiling change before the read.** **(a), the engine-side count, is follow-on telemetry, NOT a prerequisite** — carried in row 2 increment (4a) with Coltrane's two corrections: (1) split by the INDEPENDENT age and width predicates, including both-shut, never by the guard's exclusive verdict (`vts-xs-guard.ts:43` returns `too_old` before the spread test at `:48`); (2) count TRADE-looks or key by trade — `recordLook` runs once per trade while `[VTS_XS_SYM]` rolls up by symbol, so the twin doubles every instant and later trades carry different stops; the existing stop counter is the narrower `bid <= stop && last > stop` divergence (`vts-xs-instrument.ts:121-123`) on the pass line only (`:259`). Keep the minimum bid and first/last time per predicate combination — counts alone do not reconstruct a loss.
➕ **2026-11-06 17:20Z — LANGSTON AGREES (b) AND (c); (a) SCOPED SMALLER (Discord `1568312613287239700`, re-derived at `5948ad918`).** The guard's verdict is exclusive AND censors the width arm (`vts-xs-guard.ts:43` returns before the spread is computed at `:46-47`). Most of (a) already ships: `[8a-P4c][VTS_XS_SYM]` emits the per-symbol live-verdict split (`vts-xs-instrument.ts:25`, emit `:274`), and the independent `wide` (`:118`) and `ageOver` (`:119`) predicates are computed un-short-circuited. **The one missing piece:** `bidFiresStop` (`:121-123`) is counted only into `PassCounters` (`:136`, emitted `:259`), never into `SymbolCounters` (`:145-149`) or the roll-up (`:272-274`), so a refusal and a stop touch cannot be intersected. **(a) = `bidFiresStop` into the per-symbol counters + a `liveAtStop[]` vector + the cross-tab against the age/width predicates (both-shut readable), keyed by TRADE, with minimum bid and first/last time per combination.** ⛔ Build the width cross-tab on the LIVE ceiling (`live[]`/`refusedLive`, 0.0107 at `vts-xs-touch-config.ts:22`), NOT the instrument's frozen `wide` band 0.01115 (`:35`, fence `b-price-side-8a-p4c-inc3-guard.test.ts:376`). **Not a prerequisite for 11-11:** deployed 11-07→11-11 it could not see 15:23-15:36Z; the snapshot reconstruction is the only instrument with reach to that event. It is the instrument for the NEXT one. **Step-4 conditions:** the change list names its reader (the 11-11 read at `00b727aa` and any later valve read) and states the windows the deploy crosses — row 52's replacement observation window (to 11-26) and C-P5's read (to 11-16); log-only is expected to perturb neither, stated rather than left to be found. **Placement:** an item of row 2 increment (4a) objective 12, built after the 11-07 joint deploy.
➕ **2026-11-06 — the max-hold valve fired on WM/USD and its twin (`vts_xstock_spot_1793368508926_uv677jt`, 13:55:57Z, `timeout_unpriced`, arm `clamp_no_bid`, 168 h, empty outcomes; alerts `a7640e71` / `baf7a8e7` resolved citing `#1144`).** Not the first live fire: 7 rows, which are 5 episodes because a trade and its twin mint twice (FAST 10-26, URI 10-28, FDX 11-05, WM 11-06 off-session; LYV 10-26 in-session) — 4 of 5 episodes off-session (Langston's re-derivation, 2026-11-06). This one expired at 08:55 ET pre-market although WM was quoted ~5,000 times a weekday at 0.20-0.96 % spreads — the wall-clock limit landed off-session. Whether an off-session expiry should wait for the next session is added as an item to `B-SHADOW-HOLD-CLOCK` (row 4c, `#1144`).

➕ **2026-11-11 17:30Z scheduled STRK read — the registered max-hold branch did NOT occur; both trades took the stop two days earlier.** `vts_open_trades` has both ids present and closed: the twin at `2026-11-09T15:24:42.222373Z`, the base at `2026-11-09T15:25:41.733950Z`. The base's durable `exit_decision_archive` row is `SL_hit`, exit bid **68.32**, **−2.79%**, duration **7,080.9203 min**; the tagged twin is deliberately absent from that archive and instead has the comparison-only `virtual_trades/2026-11-09.json` row (`countsInAggregates=false`), exit **68.30**, gross **−2.84495%**, net **−3.09495%**, dollar P&L **−4.64242532**. This one-archive/one-JSON shape matches the priced-twin isolation at `vts-runner.ts:4333-4348`; it is not a lost close. Positive control: the JSON census parsed **36,380 records across 224 files** and found exactly the twin target id; the base target was found in the database archive. Nearest stored sides straddling each close were real, unequal sides and through the **68.44530375** stop: twin **68.30 / 68.93**; base **68.32 / 68.93** before and **68.30 / 68.93** after, all under the live 1.07% width ceiling. The required hypothetical-expiry cache read also showed real sides, not a fabricated one-sided cache: last before `17:24:46Z` **67.92 / 68.60** (0.996191%), first after **67.92 / 68.60**, and **0 of 12** rows in the ±5-minute window had `bid=ask`; the trades were already closed. The 2026-11-06 missed-stop reconstruction above remains the frozen evidence for the earlier refusal episode, but the eventual priced stop confirms the loss instead of erasing it. No ceiling was changed. Alerts `c4ef1533…` and `0e29d4fa…` were already resolved on 2026-11-06 with `#994` evidence and were not touched again; scheduled read alert `00b727aa-e1b6-4277-902f-4c6f628c167f` closes on this read.
