# B-PRICE-SIDE-BY-JOB row `8a-P4c` — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture

**Owner:** CC-C. **Plan row:** `3n.q2`. **Scope:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md` (approved r2 `e9a6b7f68`; Step 1 for this piece discharged by Langston 2026-09-22T13:37:16Z). **The xStock half's last piece: VTS xStock.** One batch, one completion report (Kyle, 2026-09-15); the record is `Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md`.
**Status:** `STEP: 2 of 11` · `NEXT STEP: 3 of 11` (increment 1 only — see §C).
**Read at:** `origin/migration/aws-supabase` `74e0e61a6`. Staging DB read 2026-09-22 ~13:45Z.

---

## 0. PREVIOUSLY STATED vs NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | Scope §1 X4 and X9 read "the mark (`lastPrice`)". | They read the **close of the latest 15-minute bar** — `scanner.ts` sets `price = latestBar.close` and passes it as `lastPrice` into `evaluateXstockPairForVTS` (`scanner.ts:909-910`, `:934-938`; used at `eval-cycle.ts:957` and `:1235`). | Read at the caller. Not a live quote at all. |
| 2 | Scope §1 X7 (the VTS stop/target trigger) is one site, `vts-runner:3322-3328`. | **Two sites** — the real lane (`vts-runner.ts:3322-3345`) and the **shadow lane** (`vts-runner.ts:4205`, `triggerPrice: crypto ? _sExitBid : currentPrice`). X8 likewise has two sites (`:3514` real; `:4237` shadow). ⚠️ **The shadow lane is the RTB shadow-pairing study, not VTS's trade records** — it books through `shadowClose` into `rtb_shadow_pairings` (`:4066-4081`, `rtb-shadow-store.js`). **Live for xStock:** 66 open and 1,258 closed pairings opened in the last 14 days (read ~13:55Z). | Census at every hop (§9.5(a)). The shadow lane reads `last` only (`:4146-4160`). |
| 3 | Scope §1 X0: "a missing side becomes ZERO … a SELL comparator on `bid = 0` fires every stop it reads". | Still true at the code (`vts-runner.ts:3152-3153`, `parseFloat(r.bid) \|\| 0`) — but **measured rare in the source table**: in the 24 h to ~13:45Z, **1** row with no bid, **0** with no ask, **95** crossed, out of **2,945,680** rows on **468** symbols. | A latent hazard, not a frequent one. ⚠️ **Read before this document's decision rule was written, so the missing/crossed-side share is NOT a pre-registered metric** (§B4). |
| 4 | Scope §1: the VTS xStock row age bound is 300 s; Step 2 derives a ceiling from risk. | Unchanged; the derivation needs the age distribution AT the decision instants, which only the instrument gives. §B4 rule B pre-registers how the ceiling is chosen. | — |

---

## A. AUDIT

### A1. The VTS xStock quote read (X0) — what it does now
- **Real lane** (`vts-runner.ts:3126-3160`): one `DISTINCT ON (symbol)` query over `xstock_spot_ticker_snap`, `captured_at > NOW() - INTERVAL '5 minutes'`, selecting `last` as the price and `bid`, `ask` as sides. A row is kept only if `last > 0`; sides default to `0` when missing. **`captured_at` is not carried**, so no decision knows the quote's age inside the 5-minute window.
- **The fetched sides are never the price a trigger, fill or booking compares against.** `priceDataMap.get` returns them (`:3165-3174`), but the pending fill takes `last` (`:3217`, `_pFillPrice = currentPrice` off the crypto branch), the trigger takes `last` (`:3322`), and the booking returns the evaluator's own exit price (`clamp_class_seam`, `vts-exit-booking.ts:44`) — the stop/target level on a stop/target hit, `last` on a timeout.
- ⚠️ **But a SPREAD computed from the sides does reach xStock VTS decisions, as an ESTIMATE** (a second reader's catch, re-read at the code): the scanner's spread and depth medians feed the admission filters (`scanner.ts:646`, `:688` → `eval-cycle.ts:346`, `:349`); the measured spread feeds the cost metrics (`cost-model.ts:262-267`) behind the pre-open gates, the maker/taker choice and the booked friction (`eval-cycle.ts:898`, `:808`, `:1018`); and it sets the break-even and rung floors (`trailing-exit-controller.ts:1113-1119`), so it can move the stop the trigger is compared against. **These are estimate jobs, which keep the spread by the `3n` rule — out of this piece's scope, stated so no reader assumes the sides are inert.**
- **Shadow lane** (`vts-runner.ts:4145-4168`): its own query, `last` only, same 5-minute window.
- **UI** (`vts-runner.ts:6045-6078`): `last` for display — an estimate, out of scope by the rule.
- **Weekend:** open trades are suspended (`vts-trade-persistence.ts:241-243` matches `state = 'open'` only) and skipped (`:3108`, `:3197`). ⚠️ **Two things still run:** a PENDING xStock rest is not suspended, so X5 still checks `last` over the weekend (only the drop is held, `:3244-3248`); and the shadow lane has no weekend skip. The TEC freeze (`trailing-exit-controller.ts:1032`) skips stop evaluation only while `isXstockMarketOpenUTC` is false — the weekend close (`market-hours.ts:104-106`: xStock is 24/5).
- **No book-state guard exists on either VTS lane.**

**Census, tests excluded:** readers of `xstock_spot_ticker_snap` in the VTS runner — **exactly three** (`vts-runner.ts:3139`, `:4151`, `:6056`); elsewhere, `markets/xstock-grid-refresher.ts:64` (the `last` prints behind the price grid that rounds xStock VTS levels at signal birth), `sigma-rate.ts:92`, `:160`, `price-liveness.ts:145`, `qd-probe-service.ts:136` and `routes.ts:8468`; the scanner reads it twice for the entry side (`scanner.ts:646`, ticker + sides within 30 min; `:688`, 20-min depth medians); the paper lane reads it through `active-dispatch.ts:77` (age) and `depth-source.ts` (the fill walk). **Writers:** the equity archiver only (`#950`: built as an archive sharing no state with trading, now the trading feed).

### A2. The cells, at the ref
| cell | lane | site | reads today | target |
|---|---|---|---|---|
| **X4** placement marketability | VTS | `eval-cycle.ts:957` | **latest 15-min bar close** (row 0 #1) | **ASK** |
| **X9** twin placement | VTS | `eval-cycle.ts:1235` | the same bar close | **ASK** — moves with X4 in one commit |
| **X5** resting entry fill | VTS real | `vts-runner.ts:3217` | `last` | **ASK** ≤ limit |
| **X6** placement ask for the VTS generate path | VTS | `vts-runner.ts:2258-2265` (`placementAsk`, non-crypto ⇒ `currentMarketPrice`) | the mark | **ASK** (only if xStock reaches this path — §A5 Q1) |
| **X7** stop/target trigger | VTS real · RTB shadow pairings | `vts-runner.ts:3322` · `:4205` | `last` | **BID** |
| **X8** exit booking | VTS real · RTB shadow pairings | `:3514` · `:4237` → `clamp_class_seam` | the evaluator's own exit price (stop/target level on a hit, `last` on a timeout) | **BID** |
| **C8** taker entry booking | VTS, both classes | the signal level | the level | **ASK** |

### A3. What "no decision" looks like on VTS xStock today
- The only no-decision path that carries a REASON is **no usable price**: no row within 5 minutes, so `currentPrice` is `null` and `evaluateTECExit` returns `no_usable_mark`. **Silent skips also exist, none recording a reason:** the weekend TEC freeze (`trailing-exit-controller.ts:1032`), the xStock-only price-discontinuity deferral (`price-discontinuity-detector.ts:269`), the per-trade error catch (`vts-runner.ts:3402-3410`) and the missing-asset-class skip (`:3281`). The instrument counts looks, `noRow` and the side arms — **not these**; stated as its limit.
- **Known positive:** at `8a-P3` Step 7 (2026-09-15 12:05Z) the VTS no-decision rail opened 53-60 streaks in one pass, of which 14+ were xStock trades with no usable mark (`vts-runner.ts:3365-3369`, the comment that made the rail crypto-only).
- **The rail is crypto-only by design since `8a-P3` deploy 2** — an xStock rail belongs to this piece, under Kyle's `#994` rule (off-hours staleness must not page).
- ⇒ **xStock VTS no-decision volume has no instrument today** (Langston's C2) — nothing counts it, split by session or otherwise.

### A4. Runtime
- `vts_open_trades`: **200 xStock rows in state `open`** (and 6,892 crypto), read ~13:45Z — the invocation population is real.
- VTS xStock stop distances, trades opened in the last 14 days: **n = 2,805; p10 0.507% · p50 1.044% · p90 2.633%** (`(entry − stop) / entry`).
- ⇒ **the risk-derived spread ceiling, by `8a-P2`'s formula `spread ≤ 2·D·(1+f)` with D = p10 and f = 0.10: 1.11%.** (Crypto's is 2%.) It moves with the traded universe and is re-derived at build.

### A5. SIM / System Manual / open questions
- **SIM S25 / S25b:** the paper comparator map is single-writer by design (`#996` refused an entry-side writer for that reason). **Langston ruled 2026-09-22: no read-only reuse of the paper verdict** — a symbol paper does not hold has no key, and a missing key reads as unguarded (`#546`). **VTS gets its own state; the usable-side selection is ONE pure function both lanes call** (`xstockTransactableSides`, today exported from `active-execution-engine.ts:501`, moves to a shared module).
- **SYSTEM_MANUAL §18.0.1** shows the VTS xStock column on the mark at every job; §3.5.1 documents only the paper guard. **Silent on:** how a VTS xStock side would be judged. That silence is what increment 3 fills.
- **Q1 — does xStock reach `vts-runner`'s generate path at all (X6)?** xStock VTS entries come from `evaluateXstockPairForVTS` (the scanner); X6 is reached only if an xStock symbol goes through `generatePhase10Signal`. Answered at increment 3's audit by an entry-point census; X6 is carried as UNVERIFIED until then.

### A6. THE DESIGN FORK THE INSTRUMENT MUST DECIDE
**Stateful** (the paper guard, as scoped): judges each frame against the symbol's own recent frames. It tells a hollow book from a normally-wide one. But:
- it **passes a symmetric outward widening** — the MDB false stop (`#1065`), where both sides moved and the mid held;
- its memory is **emptied by a restart**, so cold seeds pass vacuously (`#1066`);
- and VTS would need a second copy of that state.

**Stateless** (crypto VTS's pattern, `selectCryptoTouch` with `maxAgeMs` + `maxSpreadFraction`): refuses any frame older than a ceiling or wider than a ceiling. It catches symmetric widening by construction and has no memory to lose. **Its cost:** a book that is normally wide (a thin name) is refused all the time.

⇒ **Which one is right is an empirical question about the SPREAD at VTS decision instants, split by session** — exactly what the instrument measures.

### A7. Ledger and provenance (Tier 1)
- **Corpora searched:** `RUNNING_ISSUES` (symbols `B79.0m.b2`, `EXIT_XSTOCK_PRICE_FETCH`, `SHADOW_XSTOCK`, `resolveOpenShadowTrades`, `5 minutes`), `BATCH_CATALOG`, the `8a-P3`/`8a-P4` records, `git log -S` (not path-limited). `bridge/canonical/`: not consulted — the VTS xStock lane was built 2026-05-11, after the governance change.
- **Introducing commit, `c0a69fb7d` (2026-05-11), verbatim:**
  > *"vts-runner resolveOpenVirtualTrades now partitions open trades by assetClass: crypto leg uses priceCache (KrakenService crypto REST); xstock leg queries xstock_spot_ticker_snap directly for the most-recent tick per symbol (5-min window, DISTINCT ON symbol DESC). Without this dispatch, xstock trades would never see a non-null currentPrice and would sit in openVirtualTrades until the 7-day MAX_HOLD_MS safety valve tripped."*
- **Reading:** the read was built so xStock VTS trades would **close at all**. `last`, the 5-minute window and the zero-defaulted sides were availability choices; nothing in the record chose them as a transactable-side decision. **Disposition (1.b): (2) relevant but needs updating to today's intent** — the `3n` rule.
- **Related, not duplicated:** `#950` (the feed's lineage) and `#949` (the xStock book ladder, `3b.d`) sit upstream; `3n.o` owns the VTS entry/exit spread asymmetry; `3n.q3` owns the no-decision time bound (with `#1073`).

---

## B. INCREMENT 1 — THE INSTRUMENT (measure before any mechanism)

### B1. What it counts
Per real-lane resolve pass, for every open (not pending, not suspended) xStock trade — a **look** — classified by the New York-time session at the pass:
**`regular` 09:30-16:00 · `pre` 04:00-09:30 · `after` 16:00-20:00 · `overnight` 20:00-04:00.** No pooled rate is ever published (Langston, 2026-09-22).
Per look (from the same row the decision uses, with `captured_at` now carried):
- **`noRow`** — no row within 5 minutes (today's `no_usable_mark`);
- **the row's age**, bucketed `≤5 s · ≤15 s · ≤30 s · ≤60 s · ≤120 s · ≤300 s`;
- **`sideUnusable`** — `bid ≤ 0`, `ask ≤ 0`, non-finite, or `ask < bid` — through the SAME predicate as paper (`xstockTransactableSides`);
- **the spread** `(ask − bid) / mid`, bucketed `≤0.25% · ≤0.5% · ≤1.11% · ≤2% · ≤5% · >5%`;
- **divergence** — `bidFiresStop` (bid ≤ stop while `last` > stop) and `lastFiresTarget` (`last` ≥ target while bid < target): the looks where the rule would change the decision.
Resting (pending) xStock entries are counted separately: looks, and `askAtOrBelowLimit` vs `lastAtOrBelowLimit`.

### B2. How it reports
- One line per pass, `[8a-P4c][VTS_XS_TOUCH]`, only when looks > 0, **on `console.warn` ⇒ `error.log`** (daily files, ~14-day reach). ⚠️ **Not `console.log`**: `out.log` rotates in ~20 minutes (~4.5 h reach), which is how `8a-P3` lost ~70 h of lines.
- **No behaviour change.** Every decision still reads `last`; a fence test pins that.

### B3. The three legs (`#661`)
- **Capability:** one pure classifier, fixture-tested on every arm (a row with no bid, a crossed row, each age and spread bucket, each divergence). **Live known-positive:** `noRow` (14+ xStock no-mark streaks in one pass at `8a-P3` Step 7).
- **Coverage:** `error.log` holds ~14 days; the window below is 5 sessions; the extract names its file range.
- **Invocation:** `looks > 0` in each bucket (200 open xStock VTS trades today). **A bucket with no looks is UNKNOWN, not zero.**

### B4. THE DECISION RULE — PRE-REGISTERED HERE, BEFORE THE INSTRUMENT IS BUILT
- **Window:** from the instrument deploy's restart, **five full US weekday sessions**. A later restart does not reset emitted totals; a build change splits the window.
- **n-floor:** **1,000 looks per bucket**; below it, counts only.
- **Rule A — which guard.** Let **W = the share of `regular` looks with a usable pair whose spread exceeds 1.11%.**
  - **W ≤ 5% ⇒ build the STATELESS guard:** an age ceiling (rule B), the spread ceiling (re-derived at build from the then-current p10 stop distance), and the shared usable-side predicate. No comparator state ⇒ no restart hole.
  - **W > 5% ⇒ build the STATEFUL guard as scoped** (own state, shared predicate). `3n.q8`'s restart-durable ring then becomes a prerequisite for it too.
  - *Why 5%:* a ceiling that refuses more than one in twenty regular-hours decisions leaves positions un-evaluated for material stretches in the session where stops matter. The stateful guard refuses only what departs from a symbol's own normal. **A judgement — attack it.**
- **Rule B — the age ceiling.** The smallest of **{15 s, 30 s, 60 s, 120 s, 300 s}** whose `regular` refusal share (`noRow` + older than the ceiling) is **≤ 1%**. If none qualifies, 300 s stays and the gap goes to the feed row (`3b.e`, `#950`), not to this batch.
- **Rule C — alerting (`#994`).** Any off-hours refusal share is ACCEPTED (Kyle, 2026-09-03: off-hours holds are acceptable by design). **Off-hours refusals are logged but never notify; a `regular`-hours streak does notify.**
- **Rule D — materiality, descriptive only.** `bidFiresStop` and `lastFiresTarget` counts per bucket, with their denominators. No gate.
- **Falsifies the instrument, not the design:** zero looks in `regular` over the window, or `noRow` = 0 while trades are demonstrably open with no recent row ⇒ the instrument is broken, and it is fixed before any rule is read.

---

## C. THE PLAN — each item back-references its finding

### Increment 1 — the instrument (this document's Step 3)
| P | from | change |
|---|---|---|
| **P1** | A1 | Carry `captured_at` in the real-lane xStock query and the map entry. No decision reads it yet. |
| **P2** | A5, B1 | Move `xstockTransactableSides` from `active-execution-engine.ts` to a shared module; both lanes import the one function (Langston's ruling). **Behaviour-identical for paper**, fenced. |
| **P3** | B1 | A pure `classifyXstockVtsLook(row, nowMs, stop, target)` and a session classifier (New York time). Fixture-tested on every arm. |
| **P4** | B2 | Per-pass counters by session; one `[8a-P4c][VTS_XS_TOUCH]` line on `console.warn`. Pending looks counted separately. |
| **P5** | B2 | Fence: every xStock VTS decision still reads `last` (a test that fails if any xStock seam changes). |
**No epoch change** (no decision moves). **Deploy, then the five-session window, then rule A-D are read and the result recorded before increment 2.**

### Increment 2 — X0 (after the instrument's read)
| P | from | change |
|---|---|---|
| **P6** | A1, row 0 #3 | Sides become `number \| null`; `captured_at` becomes the age input; the zero default is removed. Every consumer branches on `null`. |

### Increment 3 — the guard and the cells (shape fixed by rule A)
| P | from | change |
|---|---|---|
| **P7** | A6, B4 | The VTS xStock guard: STATELESS or STATEFUL per rule A, its ceilings per rules A-B, its own state if stateful. |
| **P8** | A2 | X5 (ask ≤ limit), X7 real + shadow pairings (the bid; `null` ⇒ no decision), X8 real + shadow pairings (book the bid; the `clamp_class_seam` arm goes), **X4 + X9 in one commit** (the ask, from the scanner's own ticker read at `scanner.ts:646`, which already fetches the sides). |
| **P9** | A2 | C8: a taker entry books at the ask, both classes. |
| **P10** | A3, B4 rule C | The xStock no-decision rail, keyed on the trade id, with automatic re-arm; notifies in `regular` hours only. |
| **P11** | scope row | The no-ask placement policy on both lanes (paper refuses at the depth gate, VTS rests — `8a-P3` §5g); the twin line's `ask=` label; the `aee:2806` comment. |
| **P12** | scope row | Epoch: `xstock_spot/vts` +1, `updated_at` set; the re-stamp writes `crypto_spot/vts` = 2026-09-15T11:59:22Z and `xstock_spot/vts`'s 2026-09-19 boundary into `ADJUSTMENT_FRAMEWORK` (Langston's Step-1 point 3). |
| **P13** | A5 Q1 | Entry-point census for X6. `UNAUDITED` until then. |

**Increments 2 and 3 get their own Step-2 revision** once the instrument has read; this document audits and plans them only as far as the evidence reaches today.

---

## D. JUDGEMENT CALLS TO ATTACK
1. **The 5% threshold in rule A**, and whether W should be measured over all `regular` looks or only over looks with a stop within reach.
2. **Rule B's 1%** and its candidate set.
3. **The instrument on the real lane only.** The shadow lane runs the same symbols at a similar cadence, but through its own query; its decision instants are not counted.
4. **Five sessions**, with an n-floor rather than a fixed count.

---

## E. PLAIN-LANGUAGE SUMMARY
**What the audit found:** VTS xStock decides everything on the last traded price, over a quote up to five minutes old. Missing bids and asks are almost nonexistent in the data, so the real questions are how old the quote is and how wide the spread is when VTS decides. Two corrections to the scope: the entry checks use a 15-minute bar's close, not a live quote, and there is a second exit path (the shadow lane) that needs the same change.
**The plan:** first, a counter that measures, at every VTS decision, the age and spread of the quote, split into US market hours and off-hours, without changing any decision. The rule for reading it is written above, before the data exists: if wide spreads are rare in market hours, VTS gets a simple age-and-spread ceiling, which also catches the whole-market widening that caused the MDB false stop; if they are common, it gets the paper-style guard with its own memory. Then the fixes themselves.

---

## F. REVIEW RECORD
`REVIEWER r1: object (§0 + §A against the code) · which claims the code does not support, and where else a side reaches an xStock decision · 6 hits (a line cite; the booking wording; weekend pending + shadow still run; silent no-decision skips; a census that was not repo-wide; the shadow lane books to rtb_shadow_pairings) + the spread-as-estimate routes · every hit re-derived at the code, corrected · re-derived y`
