# B-XSTOCK-FEED-SANITY — STEP 4 CHANGE LIST (for Langston's code review at the graded ref)

**Batch:** `B-XSTOCK-FEED-SANITY` (`#943`; closes `#567`) · **owner:** CC-C · **change-class: architecture** · **READY-AT: `87f0d39bd2f8c6f4f2074da95e3e71887c5356f0`** (the BLOCKER-3 fix; the THREE code commits on the branch for this batch are `3b2c4966c` → `2ee14d690` → `87f0d39bd`, each followed by doc-only commits — nothing else touches code; `origin/migration/aws-supabase`) · **CI: `3b2c4966c` run `33700967265` 4/4; `2ee14d690` run `33702052440` 4/4; `87f0d39bd` reported per job in the dispatch** · **plan:** `Scope Files/B_XSTOCK_FEED_SANITY_PRE_AUDIT.md` PART B (P1–P13), cleared 00:24Z with C1–C3 folded.
**⛔ DEPLOY HOLD unchanged:** nothing deploys before the `#951` window closes 2026-09-07. This is a review of the diff, not a deploy.
**Verification at the ref:** `node scripts/check-tsc-baseline.mjs` → 377 = 377 OK · `vitest` 62/62 at the ref across `b-xstock-feed-sanity-book-state` (21, NEW), `b-xstock-feed-sanity-fence` (16, NEW), `b-exit-provenance-fence` (25), `b-new-44-equity-spot-diag` (6), `p19-b4b1-depth-gate` (10), `p19-b8-5e-mark-staleness` (16).

## 0. PREVIOUSLY STATED vs NOW (plan → code)
| # | PREVIOUSLY (audit P-item) | NOW (the diff) | REASON |
|---|---|---|---|
| 0.1 | P3: the provenance base's `tickerBid/tickerAsk` are filled from the extended tick | **they stay NULL; the column keeps its archiver-witness producer.** The decision-instant sides are in `metadata.bookState.*.inputs`, the verdict in `exit_book_state` | filling them would silently re-define an existing column's producer on xStock — the persist site falls back to `_witness`, and on xStock the equities ticker IS the feed the mark comes from (`#641` / wrong-object) |
| 0.2 | P3: "on a yield the cache IS updated" | as planned — the yield falls through to the existing `updateCache` at the mark hand-off; the SKIP branch `continue`s before it (C1), fenced | — |
| 0.3 | P2: eleven knob rows | **twelve** (`trailing_spread_window_snaps` and `feed_read_enabled` are separate rows) — the boot assertion reads the LIVE row set (`getCachedNumbersForModule`) and requires it to EQUAL `BOOK_STATE_KNOBS` (a thirteenth row refuses too), and the fence asserts migration == `BOOK_STATE_KNOBS` == warmup | C2; Langston Step-4 condition (the first draft counted the list it iterated — a tautology) |
| 0.4 | first push (`3b2c4966c`): `closeAllPositions` checked the entry-price fallback BEFORE the class, so a CRYPTO close-all on the fallback wrote `unknown`/`guard` | **class first; and no label at all unless the guard actually assessed a live frame** — crypto, the entry-price fallback, a disabled guard, cold knobs or no tick all leave NULL | Langston Step-4 BLOCKER-1 |
| 0.5 | first push: a disabled guard wrote `exit_book_state = 'unknown'` with basis `guard`; the maker leg wrote `at_fill = 'unknown'`; a flatten with no decision verdict wrote `unknown` | **NULL in every case where no frame was assessed** — `unknown` now means exactly one thing: the guard LOOKED and had no comparator yet. A NULL is re-cuttable (the re-cut selects `IS NULL`); a value is a look that happened. Column and schema comments say so. | Langston Step-4 BLOCKER-2 (`#546` with the repair path welded shut) |
| 0.6 | first push: the closed row's `bookState` record came from the RE-FETCHED position row, whose copy is throttled (≤ 9 skips short) | **the exit stamp carries the loop's in-memory record (`bookStateRecord`) and the carry prefers it** — the closed row is exact; only `active_open_positions` lags between throttled writes | Langston Step-4 point 3 |
| 0.7 | first push: the re-cut's `decision_price` basis set the held side and `last` to the PRIOR frame's own values, so every hold check was true by construction | **the held side and `last` come from the archived frame at/before the close; the comparator from the two-sided frame before it** — data against data; the basis still OVER-CALLS (the archive dropped the true decision frame), which the header states and the body-close DISCRIMINATING control measures and prints | Langston Step-4 point 5 |
| 0.9 | second push (`2ee14d690`): the basis was keyed on EITHER label, so a flatten through `forceClosePosition` (no decision verdict + a live fill assessment) could land `(NULL, hollow, guard)` — and the re-cut, selecting on `exit_book_state IS NULL` alone, would overwrite that `guard` with a clock proxy | **the basis describes `exit_book_state` ALONE** (`at_fill` is written only by the live assessment — basis `guard` by construction, no column); the re-cut's SELECT and UPDATE both require `exit_book_state IS NULL AND exit_book_state_basis IS NULL`; fence F-INV (3 tests): a non-NULL basis ⇒ a non-NULL label, the re-cut carries the predicate, controls on the pre-fix shapes | Langston Step-4 BLOCKER-3 (created by the second push) |
| 0.8 | `hollow_skip_cap = 60` "covers 7 of 9 P-A episodes and nearly the p90" | **a PRE-REGISTRATION of 90 s (60 × the live 1,500 ms), not a derivation** — P-A's nine episodes are five zeroes, 9.2, 13.7, 108.9 and a 7-snap weekend artifact; 1 of 9 (GEV, 108.9 s) exceeds the cap, so one yield is expected on that shape | Langston Step-4 point 2 (audit §A.9 corrected) |

## 1. THE JUDGEMENT CALLS I WANT ATTACKED — *Langston answered all five at 00:57Z; his rulings are folded (rows 0.4–0.8) and recorded beside each*
*(1) keep — `unknown ⇒ actionable` at open is constraint 1; withholding on an empty comparator would trap on the post-restart path. (2) keep the repeat-yield-per-interval shape; the cap is a 90 s pre-registration, not a P-A derivation (0.8). (3) the closed row is now exact via the stamp's `bookStateRecord` (0.6). (4) keep the absent-ask arm — consistency; near-unreachable at 1.0e-07. (5) NOT honest enough as first written — the held-side checks were true by construction; fixed and the over-call is now measured (0.7).*
1. **The comparator advances only from the engine, only on `two_sided`** (`book-state-tracker.ts` `advanceBookStateComparator`; the engine calls it at `:1338-1342`). A label read at a fill or a flatten never moves it. Consequence: a symbol not held has no comparator, so the first decision tick after an open reads `unknown` (labelled, actionable) until a two-sided frame seeds it — is `unknown ⇒ actionable` the right fail direction at open?
2. **After a YIELD the streak resets to zero**, so a still-hollow book earns another `hollow_skip_cap` of withholding before the next yield. Bounded per interval, not once per episode — is one yield per cap-interval the intended shape of constraint 7?
3. **`_recordBookStateEvent` throttles the row write** (first skip of a streak, every 10th, every yield) — the log line is per tick. The closed row's `bookState.hollowSkips` can therefore be up to 9 short of the true count at close. Stated; acceptable?
4. **The absent-ASK branch** (`book-state.ts` `absent_ask`) reads hollow too — the scope only named the absent BID. P-B found the venue omits neither side in practice (7 in 67.8 M); I added the symmetric case for the same reason the departure is symmetric. Over-reach or consistency?
5. **The re-cut reconstructs the decision frame** on the departed side (`2·dp − otherSide`) for basis `decision_price`. It assumes the un-departed side held at the archived prior — which is what the 21-row read showed but not what it proved for every row. Is the reconstruction honest enough for a `decision_price` basis, or should that basis carry a `reconstructed` marker?

## 2. FILES — NEW
| file | what | lines |
|---|---|---|
| `server/asset_classes/xstock_spot/book-state.ts` | the pure predicate; `BOOK_STATE_KNOBS` (12) + `BOOK_STATE_SEED`; `medianOf` | 255 |
| `server/asset_classes/xstock_spot/book-state-config.ts` | `readBookStateKnobs` / `resolveBookStateConfigSync` (sync, `getCachedNumberRequired`, no default) / `assertBookStateKnobsAtBoot` (count === 12 + ranges) | 70 |
| `server/asset_classes/xstock_spot/book-state-tracker.ts` | the per-symbol comparator (module singleton, mode-invariant — SIM registry entry owed at Step 10) + `assessBookStateNow(symbol)`, the one reader | 103 |
| `drizzle/migrations/2026-09-03-b-xstock-feed-sanity.sql` (+ `-rollback.sql`, not in MANIFEST) | 3 columns + comments; 12 `book_state` rows; `calibration_epoch/xstock_spot/paper_sim = 3` | 59 |
| `scripts/xstock-hollow-recut.ts` | P6: bases `decision_price` → `minute_proxy` → `market_state_predicate` → NULL; `--dry-run`; controls | 127 |
| `scripts/reset-outcome-feedback-keys.ts` | P8: removes exactly `paper_sim_xstock_spot_*`; keeps the pre-reset file; re-validates JSON | 50 |
| `server/tests/unit/b-xstock-feed-sanity-book-state.test.ts` | real-row fixtures; every knob mutation-proved | 144 |
| `server/tests/unit/b-xstock-feed-sanity-fence.test.ts` | F-C1 / F-C2 / F-C3 / F-INV / F-$, each with a firing control | 160 |

## 3. FILES — MODIFIED, load-bearing hunks inline

### 3.1 `server/services/passive-archive/equity-spot-archiver.ts` — P1, the raw sides on EVERY frame
BEFORE (`:117-121`, `:133-146`):
```ts
const latestEquityTick = new Map<string, { price: number; tsMs: number; kind: 'mid' | 'last' }>();
export function getLatestEquityTick(symbol: string): { price: number; tsMs: number; kind: 'mid' | 'last' } | null { … }
…
    const _kind = markKindOf(_bid, _ask);
    const _mark = _kind === 'mid' ? (_bid + _ask) / 2 : _last;
    if (Number.isFinite(_mark) && _mark > 0) {
      latestEquityTick.set(String(data.symbol).toUpperCase(), { price: _mark, tsMs: Date.now(), kind: _kind });
    }
```
AFTER:
```ts
export interface EquityTickRaw { bid: number | null; ask: number | null; last: number | null; bidQty: number | null; askQty: number | null; atMs: number; }
export interface EquityTick { price: number; tsMs: number; kind: 'mid' | 'last'; raw?: EquityTickRaw; }
const latestEquityTick = new Map<string, EquityTick>();
…
    const _raw: EquityTickRaw = { bid: Number.isFinite(_bid) ? _bid : null, ask: …, last: …, bidQty: …, askQty: …, atMs: _now };
    const _kind = markKindOf(_bid, _ask);
    const _mark = _kind === 'mid' ? (_bid + _ask) / 2 : _last;
    if (Number.isFinite(_mark) && _mark > 0) {
      latestEquityTick.set(_sym, { price: _mark, tsMs: _now, kind: _kind, raw: _raw });
    } else {
      // No mark this frame (#636): the MARK fields keep their prior value and age — the ceiling still governs them — but `raw` moves.
      const _prev = latestEquityTick.get(_sym);
      if (_prev) latestEquityTick.set(_sym, { ..._prev, raw: _raw });
    }
```
The existing reader (`aee:1164`) destructures `price/tsMs/kind` only — unchanged. ⚠️ One residual: a symbol whose FIRST frame ever has no mark writes nothing (there is no `_prev`); the guard reads `no_tick` and the mark path reads `equity_tick_missing` — consistent with today.

### 3.2 `server/services/active-execution-engine.ts` — P3 the guard, P4 the fill-instant read, P5 the persist
Imports (`:152-153`): `assessBookStateNow`, `advanceBookStateComparator`, `type BookState`. State (`:285`): `_bookStateSkipStreak: Map<string, number>` beside `_priceSkipStreak`. Counters (`:1170-1171`): `hollowSkips`, `hollowYields` → EVAL_EXIT. Decls (`:1191-1192`): `bookStateAtDecision: BookState | null`, `bookStateYielded`.
**The guard** — inserted between the ceiling breach `continue` and `currentPrice = _eqTick.price` (the `assessBookStateNow` call at `:1285`; the block runs `:1274-1347`, the hand-off `:1348`):
```ts
{
  const _bs = assessBookStateNow(position.symbol);
  if (!_bs.ok) {
    if (_bs.reason === 'knobs_missing') { console.error(…); withoutPrice++; await this._recordPriceSkip(position, 'book_state_knob_missing'); continue; }
    // disabled by knob (or no tick): NO frame assessed ⇒ the label stays NULL (never `unknown`+`guard`; Langston B2)
  } else {
    const { result: _r, cfg: _c, raw: _raw } = _bs;
    const _streak = this._bookStateSkipStreak.get(position.id) ?? 0;
    if (_r.state === 'hollow') {
      const _next = _streak + 1;
      if (_next >= _c.hollowSkipCap) {                    // YIELD
        this._bookStateSkipStreak.delete(position.id);
        bookStateAtDecision = 'hollow'; bookStateYielded = true; hollowYields++;
        console.warn(`[B-XSTOCK-FEED-SANITY][BOOK_STATE] ${sym} YIELD after ${_next} hollow ticks (cap …) reasons=… inputs=…`);
        try { await addAlert({ …, title: `Hollow book held ${sym} for ${_next} ticks — exit evaluation YIELDED`, dedupe_key: `book-state-hollow-${this.mode}-${sym}` }); } catch { … }
        await this._recordBookStateEvent(position, { kind: 'yield', … });
        // falls through: the mark hands off below and the cache IS updated
      } else {                                               // SKIP
        this._bookStateSkipStreak.set(position.id, _next); hollowSkips++; withoutPrice++;
        console.warn(`[B-XSTOCK-FEED-SANITY][BOOK_STATE] ${sym} SKIP hollow streak=${_next}/${cap} reasons=… inputs=…`);
        await this._recordBookStateEvent(position, { kind: 'skip', … });
        // ⛔ NO `updateCache` ON THIS BRANCH (Langston C1)
        continue;
      }
    } else {
      if (_streak > 0) this._bookStateSkipStreak.delete(position.id);
      bookStateAtDecision = _r.state;                     // 'two_sided' | 'unknown'
      if (_r.state === 'two_sided' && _raw.bid !== null && _raw.ask !== null)
        advanceBookStateComparator(position.symbol, { bid: _raw.bid, ask: _raw.ask, last: _raw.last, atMs: _raw.atMs }, _c.trailingSpreadWindowSnaps);
    }
  }
}
currentPrice = _eqTick.price;
priceSource = 'kraken_equities_ws';
```
`_recordBookStateEvent` (new private method at `:358`, before the I7 diagnostics block): merges `{ hollowSkips, lastSkip, yields[≤20] }` into `position.metadata.bookState`; persists on `yield | streak === 1 | streak % 10 === 0`.
Provenance base (`:1549-1554`, incl. `bookStateRecord`): `tickerBid/tickerAsk` stay `null` (0.1); `bookStateAtDecision`, `bookStateYielded` added. Option type (`exitProvenance`, `:2242-2246`): `bookStateAtDecision`, `bookStateYielded`, `bookStateRecord`.
**Fill instant** (`closePosition`): `let _bsAtFill: BookState | null = null;` hoisted at `:2310` beside `_fillDepthAgeMs`; maker leg → stays NULL (no book consulted ⇒ no assessment); taker leg (`:2330`), BEFORE `getDepthSnapshot`: `_bsAtFill = assessBookStateNow(symbol).ok ? result.state : null`.
**Persist** (`:2679-2687`, beside `exitTickerAsk`):
```ts
exitBookState: options?.exitProvenance?.bookStateAtDecision ?? null,
exitBookStateAtFill: _bsAtFill,
exitBookStateBasis: options?.exitProvenance?.bookStateAtDecision != null ? 'guard' : null,   // the basis describes the DECISION label alone (BLOCKER-3)
```
**Metadata carry** (`:2580-2594`; `_bsRec` at `:2586`): the `fg2Shadow` carry generalised — `bookState` rides onto the closed row from the exit stamp's `bookStateRecord` (the loop's in-memory, per-tick-exact copy), falling back to the re-fetched row's; `yielded` explicit; never a wipe.

### 3.3 `server/services/active-portfolio-manager.ts` — P4 at `closeAllPositions` (`apm:672-688`, the call at `:685`)
Inside the `updateClosedTrade` payload, after `exitTickerAsk: null`: an awaited IIFE — non-xStock ⇒ `{}` (FIRST — BLOCKER-1); the entry-price fallback ⇒ `{}` (no frame behind the number); else `assessBookStateNow(symbol)` ⇒ `{ exitBookState: state, exitBookStateBasis: 'guard' }` when it assessed, `{}` when it did not. Never withholds; never writes `unknown` for a look that did not happen.

### 3.4 `server/routes.ts` — P4 at the two manual writers
`POST /active-engine/close-trade/:id` (`:12978-12987`, `Object.assign` at `:12982`): the label assigned AFTER the payload literal (so its inferred type and the pre-existing baseline diagnostic on it are unchanged), ONLY when the guard assessed. `POST /active-engine/force-clear-stranded` (`:13093-13101`): the same inside the `createClosedTrade` literal; crypto, the entry fallback and a guard that did not run leave NULL.

### 3.5 `shared/schema.ts` (`:1856-1876`; the three columns at `:1874-1876`) — three `varchar` columns with the basis discipline in the comment. `server/startup/b72-warmup.ts` (`'book_state'` at `:168`; `assertBookStateKnobsAtBoot()` at `:344`; the assertion itself reads the LIVE row set at `book-state-config.ts:55`) — `'book_state'` prefetched; `assertBookStateKnobsAtBoot()` called after the `mark_staleness` block. `package.json` — two scripts. `drizzle/migrations/MANIFEST.txt` — one line.

## 4. WHAT IS NOT IN THIS DIFF, BY DESIGN
- **P7(ii)** (the RTB gate relaxation) and **P9** (the entry-seam gate): coupled, waiting on Kyle's A/B/C/D pick. The fence F-C3 already requires any future reader of the state to read the basis.
- **P10** (the raw-capture crontab): staging-side, at deploy.
- **Candidate (ii)**'s cohort read: INERT by knob (`feed_read_enabled = 0`); the read is wired when F4's re-measure lands on the guard's own telemetry.
- **Deploy** and the observation window: after 2026-09-07.

## 5. Reader record
- `REVIEWER (Step 3 → 4): none spawned — the load-bearing claims of this step are the tests' assertions and the tsc comparator, both run at the ref and both reproducible by Langston with one command each.`
