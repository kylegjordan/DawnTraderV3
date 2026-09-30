# B-PRICE-SIDE-BY-JOB row `8a-P4c` — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture

**Owner:** CC-C. **Plan row:** `3n.q2`. **Scope:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4_SCOPE.md` (approved r2 `e9a6b7f68`; Step 1 for this piece discharged by Langston 2026-09-22T13:37:16Z). **The xStock half's last piece: VTS xStock.** One batch, one completion report (Kyle, 2026-09-15); the record is `Batch Completion/B_PRICE_SIDE_BY_JOB_8A_P3_PROGRESS_REPORT.md`.
**Status:** `STEP: 2 of 11` — **APPROVED for increment 1 by Langston 2026-09-22T14:03:44Z, conditional on the §B4 amendment (r3), which lands HERE, before any instrument code** · `NEXT STEP: 3 of 11` (increment 1 only — see §C).
**Read at:** `origin/migration/aws-supabase` `74e0e61a6`. Staging DB read 2026-09-22 ~13:45Z.

---

## 0. PREVIOUSLY STATED vs NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | Scope §1 X4 and X9 read "the mark (`lastPrice`)". | They read the **close of the latest 15-minute bar** — `scanner.ts` sets `price = latestBar.close` and passes it as `lastPrice` into `evaluateXstockPairForVTS` (`scanner.ts:909-910`, `:934-938`; used at `eval-cycle.ts:957` and `:1235`). | Read at the caller. Not a live quote at all. |
| 2 | Scope §1 X7 (the VTS stop/target trigger) is one site, `vts-runner:3322-3328`. | **Two sites** — the real lane (`vts-runner.ts:3322-3345`) and the **shadow lane** (`vts-runner.ts:4205`, `triggerPrice: crypto ? _sExitBid : currentPrice`). X8 likewise has two sites (`:3514` real; `:4237` shadow). ⚠️ **The shadow lane is the RTB shadow-pairing study, not VTS's trade records** — it books through `shadowClose` into `rtb_shadow_pairings` (`:4066-4081`, `rtb-shadow-store.js`). **Live for xStock:** 66 open and 1,258 closed pairings opened in the last 14 days (read ~13:55Z). | Census at every hop (§9.5(a)). The shadow lane reads `last` only (`:4146-4160`). |
| 3 | Scope §1 X0: "a missing side becomes ZERO … a SELL comparator on `bid = 0` fires every stop it reads". | Still true at the code (`vts-runner.ts:3152-3153`, `parseFloat(r.bid) \|\| 0`) — but **measured rare in the source table**: in the 24 h to ~13:45Z, **1** row with no bid, **0** with no ask, **95** crossed, out of **2,945,680** rows on **468** symbols. | A latent hazard, not a frequent one. ⚠️ **Read before this document's decision rule was written, so the missing/crossed-side share is NOT a pre-registered metric** (§B4). ⛔ **Wrong population for any claim about DECISIONS (Langston F-5): this is every row of the table over 468 symbols; decisions read the latest row per symbol, at ~30 s instants, on the ~99 symbols holding open trades. Never quote it as evidence about decisions — `sideUnusable` is that instrument.** |
| 4 | Scope §1: the VTS xStock row age bound is 300 s; Step 2 derives a ceiling from risk. | Unchanged; the derivation needs the age distribution AT the decision instants, which only the instrument gives. §B4 rule B pre-registers how the ceiling is chosen. | — |

---

## A. AUDIT

### A1. The VTS xStock quote read (X0) — what it does now
- **Real lane** (`vts-runner.ts:3126-3160`): one `DISTINCT ON (symbol)` query over `xstock_spot_ticker_snap`, `captured_at > NOW() - INTERVAL '5 minutes'`, selecting `last` as the price and `bid`, `ask` as sides. A row is kept only if `last > 0`; sides default to `0` when missing. **`captured_at` is not carried**, so no decision knows the quote's age inside the 5-minute window.
- **The fetched sides are never the price a trigger, fill or booking compares against.** `priceDataMap.get` returns them (`:3165-3174`), but the pending fill takes `last` (`:3217`, `_pFillPrice = currentPrice` off the crypto branch), the trigger takes `last` (`:3322`), and the booking returns the evaluator's own exit price (`clamp_class_seam`, `vts-exit-booking.ts:44`) — the stop/target level on a `stop_hit`/`target_hit`; `last` on trailing-stop, break-even, moonbag and max-hold exits (`tec-evaluator.ts:466`, `:512`, `:515`); the ENTRY price on `stale_timeout` (`:287`).
- ⚠️ **But a SPREAD computed from the sides does reach xStock VTS decisions, as an ESTIMATE** (a second reader's catch, re-read at the code): the scanner's spread (the latest row within 30 min) and its 20-minute depth medians feed the admission filters (`scanner.ts:646`, `:688` → `eval-cycle.ts:346`, `:349`); the measured spread feeds the cost metrics (`cost-model.ts:262-267`) behind the pre-open gates, the maker/taker choice and the booked friction (`eval-cycle.ts:898`, `:808`, `:1018`); and it sets the break-even and rung floors (`trailing-exit-controller.ts:1113-1119`), so it can move the stop the trigger is compared against. **These are estimate jobs, which keep the spread by the `3n` rule — out of this piece's scope, stated so no reader assumes the sides are inert.**
- **Shadow lane** (`vts-runner.ts:4145-4168`): its own query, `last` only, same 5-minute window.
- **UI** (`vts-runner.ts:6045-6078`): `last` for display — an estimate, out of scope by the rule.
- **Weekend:** open trades are suspended (`vts-trade-persistence.ts:241-243` matches `state = 'open'` only) and skipped (`:3108`, `:3197`). ⚠️ **Two things still run:** a PENDING xStock rest is not suspended, so X5 still checks `last` over the weekend (only the drop is held, `:3244-3248`); and the shadow lane has no weekend skip. The TEC freeze (`trailing-exit-controller.ts:1032-1055`) applies only while `isXstockMarketOpenUTC` is false — the weekend close (`market-hours.ts:104-106`: xStock is 24/5) — and it freezes the TRAILING state (no ratchet, latch or lock); the stop comparison itself still runs against the frozen stop (`tecShouldClose`, `tec-evaluator.ts:494` → `trailing-exit-controller.ts:1585`), except for a trade with no trailing state yet (`:1570`).
- **No book-state guard exists on either VTS lane.**

**Census, tests excluded:** readers of `xstock_spot_ticker_snap` in the VTS runner — **exactly three** (`vts-runner.ts:3139`, `:4151`, `:6056`); elsewhere, `markets/xstock-grid-refresher.ts:64` (the `last` prints behind the price grid that rounds xStock VTS levels at signal birth), `sigma-rate.ts:92`, `:160`, `price-liveness.ts:145`, `qd-probe-service.ts:136`, `routes.ts:8468`, `drift-dashboard-aggregator.ts:871`/`:939` and the cron `server/scripts/b-xstock-freshness-monitor.ts:142`, `:172` — none reaches a VTS decision; the scanner reads it twice for the entry decision (`scanner.ts:646`, ticker + sides within 30 min; `:688`, 20-min ask AND bid depth medians); the paper lane reads it through `active-dispatch.ts:77` (age) and `depth-source.ts` (the fill walk). **Writers:** the equity archiver only (`#950`: built as an archive sharing no state with trading, now the trading feed).

### A2. The cells, at the ref
| cell | lane | site | reads today | target |
|---|---|---|---|---|
| **X4** placement marketability | VTS | `eval-cycle.ts:957` | **latest 15-min bar close** (row 0 #1) | **ASK** |
| **X9** twin placement | VTS | `eval-cycle.ts:1235` | the same bar close | **ASK** — moves with X4 in one commit |
| **X5** resting entry fill | VTS real | `vts-runner.ts:3217` | `last` | **ASK** ≤ limit |
| **X6** placement ask for the VTS generate path | VTS | `vts-runner.ts:2258-2265` (`placementAsk`, non-crypto ⇒ `currentMarketPrice`) | the mark | **ASK** (only if xStock reaches this path — §A5 Q1) |
| **X7** stop/target trigger | VTS real · RTB shadow pairings | `vts-runner.ts:3322` · `:4205` | `last` | **BID** |
| **X8** exit booking | VTS real · RTB shadow pairings | `:3514` · `:4237` → `clamp_class_seam` | the evaluator's own exit price (stop/target level on a hit; `last` on trailing, break-even, moonbag and max-hold exits; entry price on `stale_timeout`) | **BID** |
| **C8** taker entry booking | VTS, both classes | the signal level | the level | **ASK** |

### A3. What "no decision" looks like on VTS xStock today
- The only no-decision path that carries a REASON is **no usable price**: no row within 5 minutes, so `currentPrice` is `null` and `evaluateTECExit` returns `no_usable_mark`. **Other skips exist that set no `noDecisionReason` and feed no counter** (each logs a line): the xStock-only price-discontinuity deferral (`price-discontinuity-detector.ts:269`; `TEC_DISCONTINUITY_SKIP_STOP`, `trailing-exit-controller.ts:1578`), the per-trade error catch (`vts-runner.ts:3402-3410`, `[TEC_VTS_EXIT_EVAL_ISOLATED]`) and the missing-asset-class skip (`:3280`, `[TEC_VTS_MISSING_ASSET_CLASS]`). The instrument counts looks, `noRow` and the side arms — **not these**; stated as its limit.
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
➕ **r3 (Langston BLOCKER-1, CONDITION-2, FINDING-4):**
- **SYMBOL-KEYED.** Every counter is also kept per `(lane, session, symbol)`. Pooled shares cannot tell "every name occasionally wide" from "five names always wide" — at 174 open trades over 99 symbols (max 4 per symbol) each symbol carries ~1% of looks — and without symbol keys in the emitted record that is unrecoverable from the window.
- **THE UNION.** For each candidate age ceiling `c` in {15, 30, 60, 120, 300} s, a look is REFUSED-AT-`c` if `noRow` OR age > `c` OR `sideUnusable` OR spread > 1.11%. The stateless guard's refusal is that union, not either arm.
- **BOTH LANES.** The shadow-pairing lane's query gains `bid, ask, captured_at` (columns only, no behaviour change) and runs the SAME classifier under `lane=shadow`. It is ~37% of the real lane's look volume (Langston: 65 open / 1,264 closed in 14 days, still opening today), has no weekend skip, and plausibly holds the thin names the real lane did not take — the population the guard exists for.

### B2. How it reports
- One line per pass per lane, `[8a-P4c][VTS_XS_TOUCH] lane=… session=…`, only when looks > 0, **on `console.warn` ⇒ `error.log`** (daily files, ~14-day reach).
- ➕ **r3:** one roll-up line per `(lane, session, symbol)` per clock hour, `[8a-P4c][VTS_XS_SYM]` — looks, `noRow`, `sideUnusable`, wide (> 1.11%), age over each candidate, the union at each candidate — flushed at the hour boundary and on a session change. ⚠️ A restart loses the partial hour held in memory; the window records each restart. ⚠️ **Not `console.log`**: `out.log` rotates in ~20 minutes (~4.5 h reach), which is how `8a-P3` lost ~70 h of lines.
- **No behaviour change.** Every decision still reads `last`; a fence test pins that.

### B3. The three legs (`#661`)
- **Capability:** one pure classifier, fixture-tested on every arm (a row with no bid, a crossed row, each age and spread bucket, each divergence). **Live known-positive:** `noRow` (14+ xStock no-mark streaks in one pass at `8a-P3` Step 7).
- **Coverage:** `error.log` holds ~14 days; the window below is 5 sessions; the extract names its file range.
- **Invocation:** `looks > 0` in each bucket (200 open xStock VTS trades today). **A bucket with no looks is UNKNOWN, not zero.**
- ➕ **REACHABILITY OF THE SYMBOL FLOOR, MEASURED ON DAY 1 (Langston's Step-3 rider, 2026-09-22T14:07:47Z):** at the **first full `regular` hour** of the window, count per lane the symbols with any `regular` look and state the number out loud. The floor needs ≥ 50 symbols at ≥ 120 `regular` looks over the window, and decisions sit on ~99 symbols — a thin margin, and the shadow lane may not reach it. **A lane that cannot clear 50 is INCONCLUSIVE-EXTEND by construction, and that is known on day 1, not discovered at close. It is NOT licence to relax the floor.**
- ⚠️ **Cross-lane reach (Langston):** the new lines are on `console.warn` (~14-day `error.log`), while `8a-P3`'s `[VTS_TOUCH]` stays on `console.log` (~4.5 h `out.log`) — any comparison between them over the window has 14 days on one side and hours on the other.

### B4. THE DECISION RULE — PRE-REGISTERED HERE, BEFORE THE INSTRUMENT IS BUILT
- **Window:** from the instrument deploy's restart, **five full US weekday sessions**. A later restart does not reset emitted totals; a build change splits the window.
- ~~n-floor: 1,000 looks per bucket~~ — **struck at r3 (Langston §D4): at ~20,900 looks/hour it binds in minutes and gives false assurance.** ➕ **SYMBOL FLOOR instead:** a symbol counts toward any rule only with **≥ 120 `regular` looks** in the window (about one hour of held time); the reading is INCONCLUSIVE-EXTEND unless **≥ 50 distinct symbols** clear that floor on the lane being read.
- **Rule B is read FIRST — the age ceiling `c*`.** The smallest of **{15 s, 30 s, 60 s, 120 s, 300 s}** whose `regular` AGE refusal share (`noRow` + older than `c`) is **≤ 1%**. If none qualifies, 300 s stays and the gap goes to the feed row (`3b.e`, `#950`), not to this batch. ➕ **Reported beside it, free (Langston §D2): the paper lane's 15 s entry ceiling (`xstock_fill_safety.active_fill_max_age_ms`) and its live refusals in the same window (e.g. alert `7a8cb0a5`, RKT/USD 26,023 ms).**
- **Rule A — which guard. ➕ r3: THE UNION BINDS, NOT EITHER ARM (CONDITION-2).** Let **U = the share of `regular` looks REFUSED-AT-`c*`**, over ALL regular looks — not reach-conditioned (Langston §D1).
  - **CONCENTRATION CLAUSE, read BEFORE U (BLOCKER-1):** let **K = the number of floor-clearing symbols whose own `regular` union share at `c*` exceeds 50%.**
  - **K ≥ 3 ⇒ pooled U does NOT decide.** A stateless ceiling would refuse those names almost always and never evaluate their exits. **Tie-break, stated now: build a PER-SYMBOL RELATIVE ceiling** — refuse when spread > max(1.11%, `k` × the symbol's trailing-median spread computed from the PERSISTED table, as the scanner already does for depth at `scanner.ts:688`), `k` = 3 (the paper guard's `kRel`), plus the age ceiling `c*`. Its reference lives in the database, not in memory, so it has no restart hole; a median resists a few minutes of post-close blowout, so it still sees the symmetric widening.
  - **K ≤ 2 and U ≤ 5% ⇒ build the STATELESS guard:** `c*`, the 1.11% spread ceiling (re-derived at build from the then-current p10 stop distance), and the shared usable-side predicate. No comparator state ⇒ no restart hole.
  - **K ≤ 2 and U > 5% ⇒ build the STATEFUL guard as scoped** (own state, shared predicate); `3n.q8`'s restart-durable ring becomes its prerequisite.
  - *Why 5%:* a ceiling that refuses more than one in twenty regular-hours decisions leaves positions un-evaluated for material stretches in the session where stops matter. The stateful guard refuses only what departs from a symbol's own normal. **A judgement — attack it.**
- ➕ **r3 — EACH LANE IS READ ON ITS OWN (FINDING-4).** Rules A-B are evaluated separately on `lane=vts` and `lane=shadow`; a design applies to a lane only if that lane's own reading supports it. If the two lanes point to different guards, increment 3's Step 2 carries both and says why.
- ⛔ **DISCIPLINE (Langston): nobody reads the spread or age distribution — from the table or the instrument — before the window closes.** One un-pre-registered read already happened (row 0 #3, sides only) and is labelled; a read of the quantity rule A turns on would spend the pre-registration.
- **Rule C — alerting (`#994`).** Any off-hours refusal share is ACCEPTED (Kyle, 2026-09-03: off-hours holds are acceptable by design). **Off-hours refusals are logged but never notify; a `regular`-hours streak does notify.**
- **Rule D — materiality, descriptive only.** `bidFiresStop` and `lastFiresTarget` counts **per session** (the per-pass scalars summed, `looks` as the denominator — NOT per age or spread bucket, which is not instrumented), with their denominators. No gate. ➕ **Direction, named when published (Langston Step 4): the counters use the STATIC stop and target; a trailing or break-even ratchet only RAISES the stop, so `bidFiresStop` is a LOWER BOUND on divergence, never an estimate.**
- **Falsifies the instrument, not the design:** zero looks in `regular` over the window, or `noRow` = 0 while trades are demonstrably open with no recent row ⇒ the instrument is broken, and it is fixed before any rule is read. ➕ **Step-4 CONDITION-2: `ageUnknown > 0` ⇒ the instrument is FAULTED and fixed before any rule is read.** `captured_at` is NOT NULL and the archiver stamps it with its own clock, so a missing or NEGATIVE age (negatives are routed to `ageUnknown`, CONDITION-1 — the crypto guard's `age_unknown` disposition) can only be a fault. With it zero, rule B's numerator is exactly `noRow` + older than `c`, as written above.
- ➕ **Step-4 CONDITION-3 — THE `weekend` LABEL, written here before the window opens.** A pass inside the Fri 20:00 → Sun 20:00 ET close is labelled `weekend` and is never read by any rule; its counts stay published. It only REMOVES looks from the weekday sessions — the population this rule already excluded — and without it the shadow lane (no weekend-suspension skip) and pending real-lane rests would file a Saturday 10:00 ET look under `regular`. ⚠️ **US market holidays are NOT the weekend close, so a holiday pass reads as its clock session** — inert for a five-weekday window from 2026-09-22; stated for any extension. (`#392` stays where it is.)

---

## C. THE PLAN — each item back-references its finding

### Increment 1 — the instrument (this document's Step 3)
| P | from | change |
|---|---|---|
| **P1** | A1 | Carry `captured_at` in the real-lane xStock query and the map entry. No decision reads it yet. |
| **P2** | A5, B1 | Move `xstockTransactableSides` from `active-execution-engine.ts` to a shared module; both lanes import the one function (Langston's ruling). **Behaviour-identical for paper.** ⛔ **r3 CONDITION-3:** `b-price-side-8a-p4b-paper-xstock.test.ts:47` asserts `count(/xstockTransactableSides\(/g) === 3` in the paper engine (the definition + the two sites). Its SUBJECT is "paper calls the shared predicate at exactly these two sites" — **re-point it** (two call sites in the engine, the one definition in the new module), never relax it. |
| **P3** | B1 | A pure `classifyXstockVtsLook(row, nowMs, stop, target)` and a session classifier (New York time). Fixture-tested on every arm. |
| **P4** | B1, B2 | Per-pass counters by lane and session, and per-`(lane, session, symbol)` hourly roll-ups; `[8a-P4c][VTS_XS_TOUCH]` and `[8a-P4c][VTS_XS_SYM]` on `console.warn`. Pending looks counted separately. The union at each candidate age ceiling. |
| **P4b** | B1 r3 | The shadow lane's query gains `bid, ask, captured_at`; the same classifier under `lane=shadow`. Columns only — every shadow decision still reads `last`. |
| **P4c** | Langston NIT-6 | The stale comment at `vts-runner.ts:4768-4770` ("No-op until paper-mode active trading is on … dormant at `rtb_total=0` today") is corrected — the shadow lane is live. |
| **P5** | B2 | Fence: every xStock VTS decision, real lane AND shadow lane, still reads `last` (a test that fails if any xStock seam changes). |
**No epoch change** (no decision moves). **Deploy, then the five-session window, then rule A-D are read and the result recorded before increment 2.**

### Increment 2 — X0 (after the instrument's read)
| P | from | change |
|---|---|---|
| **P6** | A1, row 0 #3 | Sides become `number \| null`; `captured_at` becomes the age input; the zero default is removed. Every consumer branches on `null`. |

### Increment 3 — the guard and the cells (shape fixed by rule A)
| P | from | change |
|---|---|---|
| **P7** | A6, B4 | The VTS xStock guard: STATELESS or STATEFUL per rule A, its ceilings per rules A-B, its own state if stateful. |
| **P7a** *(added 2026-09-28, Langston's 03:47Z re-read on alert `1b32831f`; §9.4 disposition 1)* | A1-A2 re-read at head | **P7 is a choice of BASIS before it is a number.** The VTS xStock ENTRY places on the latest 15-minute bar close (`scanner.ts:910` → `eval-cycle.ts:957`), with no age term, because B-NEW-34 (2026-05-15) removed the tick gate on purpose (`scanner.ts:571`, `:736`: *"No freshness GATE — OHLC bar history is the source of truth"*). A bar close is structurally up to ~15 min old, so a tick-age ceiling on it refuses nearly every entry: state the basis (tick snap or bar close), then the ceiling. **Carried with it:** `isPairDataFresh` (`server/utils/data-freshness.ts:87`, zero production callers) gets a rule-18 disposition, and four stale sources are corrected: `scanner.ts:16`, `eval-cycle.ts:7`, `SYSTEM_IMPACT_MAP.md:2398` (all describe a live per-pair gate), and `CHANGES_AND_FIXES.md:1285` (justifies the 5-minute recency window by the removed 90 s gate). ⚠️ A1's *"`captured_at` is not carried"* is the pre-P1 state: since P1 the exit-lane read carries it as `at_ms`. ➕ **Langston 03:55Z, ratifying P7a: the whole MODULE is dead, not only the function.** `server/utils/data-freshness.ts` has exactly one importer tree-wide, its own unit test (`b79-0a-data-freshness.test.ts:30`), so the rule-18 disposition is module-level (file and test to `_archive/deleted-code/` with a `DELETED_COMPONENTS_LOG` entry). ⛔ **That test suite is green against a configuration that cannot exist:** three of its four cases mock a `data_freshness_window_ms` row for `xstock_spot` that B-NEW-34's own migration deleted, and the fourth probes a sentinel only the dead function reads. **Nobody may cite it as evidence that an xStock freshness gate is enforced.** |
| **P8** | A2 | X5 (ask ≤ limit), X7 real + shadow pairings (the bid; `null` ⇒ no decision), X8 real + shadow pairings (book the bid; the `clamp_class_seam` arm goes), **X4 + X9 in one commit** (the ask, from the scanner's own ticker read at `scanner.ts:646`, which already fetches the sides). |
| **P9** | A2 | C8: a taker entry books at the ask, both classes. |
| **P10** | A3, B4 rule C | The xStock no-decision rail, keyed on the trade id, with automatic re-arm; notifies in `regular` hours only. |
| **P11** | scope row | The no-ask placement policy on both lanes (paper refuses at the depth gate, VTS rests — `8a-P3` §5g); the twin line's `ask=` label; the `aee:2806` comment. ➕ **Step 9 (2026-09-22): `P4c` fixed ONE of THREE sites of the same stale claim** (*"dormant at `rtb_total=0` today"* — the shadow lane is live). **The other two ride here:** the `resolveOpenShadowTrades` docblock (`vts-runner.ts:4138-4139`) and the shadow-capture comment (`ready_to_buy_service.ts:1895`); `routes.ts:2799` was already corrected. Repo-wide pattern sweep at `origin/migration/aws-supabase`: 4 hits, 1 correct, 1 fixed by `P4c`, 2 here. Comment-only, zero behaviour — rides the next reviewed code change rather than a separate review lap (§9.4 disposition 2). |
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
`REVIEWER r2: object (the corrected §0/§A/§C against the code) · were r1's points met, and what else is unsupported · 7 of 7 met; residual wording (the booking arms, 'no reason recorded', two uncited readers, the freeze does NOT skip the stop comparison) · re-derived at the code (tec-evaluator.ts:494, trailing-exit-controller.ts:1570, :1585), corrected · re-derived y`
`LANGSTON Step 2 (2026-09-22T14:03:44Z): APPROVED for increment 1, conditional — BLOCKER-1 (symbol keys + concentration clause), CONDITION-2 (the union binds), CONDITION-3 (re-point the P2 fence), FINDING-4 (measure the shadow lane), FINDING-5 (row 0 #3's population), NIT-6 (the stale shadow comment); §D settled. All folded at r3, committed before any instrument code.`

---

## C2. INCREMENT 2 — X0: PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2 r1, 2026-09-30, CC-C)
*This increment rides the file's one graded class — line 3, `architecture` (Langston Step-2 condition 5, 2026-09-30: a second marker mid-document, bold and in a lower class, is struck; it deletes code under `server/` and adds a tracked script, so the stricter doc set is the honest one).* **No decision moves ⇒ no epoch change.** Ships in the ≥ 2026-10-02T20:10Z window. Increment 1's window read is confirmed (progress report §9.6-§9.8).

**PREVIOUSLY STATED vs NOW:** PREVIOUSLY STATED (P6, above): "sides become `number | null` … every consumer branches on `null`." NOW: the zero-defaulted sides have **no consumer at all**, so they are DELETED, not retyped. REASON: the census below.

### C2.1 AUDIT — read at `46c9ba3a2`
| # | finding | evidence |
|---|---|---|
| **E1** | the real lane's zero-defaulted sides are written and never read | `vts-runner.ts:3193-3194` (`bid: parseFloat(r.bid) \|\| 0`, `ask: …`) on each `xstockPriceMap` entry. Readers, census of the resolve function: the helper `priceDataMap.get` (`:3203-3211`) has ONE caller (`:3244`), which reads `.price` only (`:3245`); the pending look and the exit look read `rawQuote` (`:3277`, `:3370`); the crypto half of the helper returns `p.bid`/`p.ask` that nothing reads either. The other `priceDataMap` (`:5039`) is a different function's local over `priceCache.getBatch`. ⇒ **row 0 #3's hazard ("a SELL comparator on `bid = 0` fires every stop") cannot fire today: nothing compares against these fields.** Rule 18: dead fields, removed. |
| **E2** | the shadow lane already carries only the undefaulted quote | `vts-runner.ts:4198-4220`: `{ price, rawQuote }`, sides through `parseQuoteNumber` (never a default). Nothing to change. |
| **E3** | the undefaulted quote is already the age-carrying object | `rawQuote: { last, bid, ask, atMs }` via `parseQuoteNumber` (`vts-xs-instrument.ts`), `atMs` = `captured_at`; `null` for a missing or non-finite side. Increment 3's guard reads THIS object. |
| **E4** | Langston's §9.8 correction 1 — a per-symbol roll-up is cut by its emitting line's stamp | a `VTS_XS_SYM` line is emitted ~5 s after the hour it describes; the window extract dropped the last `after` hour (vts 8,638, shadow 6,825 looks). No decision impact. The extract lived only in CC-C's scratchpad. |

### C2.2 PLAN
| # | item | from |
|---|---|---|
| **P6 r2** | delete the two zero-defaulted fields from the real lane's map entries and the unused `bid?`/`ask?` from `priceDataMap.get`'s return type (crypto half included); correct the stale comment at `:3165-3166` ("increment 2 (X0) replaces them"); a fence asserts the xStock read has no `\|\| 0` default on a side and the entry carries no `bid`/`ask`, with a positive control that `rawQuote` is carried on both lanes | E1-E3 |
| **P6b** | commit the window extract as `scripts/analysis/p4c-window-extract.py`, cutting `VTS_XS_SYM` lines on their `hour=` field (inside the window ⇔ the hour it DESCRIBES starts before the end) and `VTS_XS_TOUCH` lines on their own stamp; re-run on the closed window as its control: `after` SYM looks must now equal `after` TOUCH looks on both lanes | E4 |

**Judgement call:** deleting rather than retyping the dead fields — P6's wording assumed consumers existed.
**Plain language:** a missing price side was being filled in as zero on the main VTS lane. Nothing ever read that zero, so it could not cause a false stop. This piece deletes it, so nothing can start reading it later. The pricing read's script also goes into the repo, fixed so the last hour of each day is counted.

### C2.3 STEP 2 — LANGSTON: PROCEED, WITH BLOCKER-1 AND FOUR CONDITIONS (2026-09-30 01:31Z; census re-derived by him at `7fc76ca43`)
| # | ruling | as built (Step 3) |
|---|---|---|
| **BLOCKER-1** | P6b's control `after SYM == after TOUCH` is satisfied by `0 == 0` — add (a) a NEGATIVE control, (b) enumerate + fail loud on the rotations, (c) publish the segment totals | (a) `--sym-cut stamp` restores the old cut and reproduces the gap **vts 8,638 / shadow 6,825 exactly**; (b) the required rotations are enumerated from the range, a missing one is FATAL (exit 2, nothing printed — shown on a 2026-08-01 start), `.gz` opened explicitly, per-file line counts printed; (c) every session's TOUCH and SYM totals published, `readable` false on a zero |
| **C2** | restart-straddling hours: exclude by name, equality over unrestarted hours, fixed now | restarts read from PM2's own log; an hour holding a restart after a lane's first line is excluded BY NAME with the count published. The window holds ONE restart, the instrument's deploy at the window's own start (14:38:49Z, before any line; PM2 uptime since 2026-09-22T14:38:49.748Z) ⇒ **0 hours excluded** |
| **C3** | delete, type-enforced, fence mutation-proved both directions | the entry type and the helper's return type carry no side; fence `b-price-side-8a-p4c-x0-fence.test.ts`, 4 mutations each red on its own test |
| **C4** | the crypto projection goes too, same commit — two change-list rows | done; two rows in the increment-2 change list (xStock: outcome 1; crypto: outcome 3) |
| **C5** | one graded marker | struck above |
| **NIT-6** | `DELETED_COMPONENTS_LOG` line, no archive owed | done |
**P6b's control, as read at the closed window (`hour` cut):** after-session SYM looks = TOUCH looks on both lanes (vts 211,691 · shadow 163,326); **per-(hour, session) equality holds in every graded cell — vts 182 of 182 over 177 hours, shadow 179 of 179 over 174** (TOUCH lines placed by stream order, so a pass straddling an hour counts where its looks were recorded). Rule readings unchanged: c* vts 120 s / shadow 60 s, U 1.76% / 1.47%, K 0.

### C2.4 STEP 4 — LANGSTON: APPROVED, FOUR CONDITIONS + ONE NIT, NO BLOCKER (2026-09-30 ~02:3xZ; re-derived at `1b5d9d9e2`)
**The restart arm's EXPECTED output, stated BEFORE its first run (FINDING-2; the two-clause rider on `#744`)** — `scripts/analysis/p4c-window-extract-selftest.py`, a synthetic one-lane corpus (a pass every 10 min, 2 looks each, 10:40Z-15:00Z, window [10:30Z, 15:00Z)):
- **A, a restart at 12:25Z:** hours excluded BY NAME = {11:00, 12:00}; 6 TOUCH looks lost at the restart (the 12:00/12:10/12:20 passes); graded = {13:00, 14:00} ⇒ 2 cells, 0 unequal, holds.
- **B, the same corpus with the restart removed from the PM2 log (the negative control):** nothing excluded; hour 12 reads sym 6 vs touch 12 ⇒ 1 unequal, does NOT hold — the exclusion arm is what keeps a restarted hour from reading as a broken reader.
- **C, a PM2 log that starts inside the window:** exit 2, "does not reach the window start" (FINDING-3's reach assertion).
**As built (Step 4 conditions):**
| # | ruling | as built |
|---|---|---|
| **FINDING-1** | the per-hour equality is an IDENTITY by construction (`recordLook` bumps the pass and symbol counters together; `flushSymbols` runs inside `beginPass`, before that pass's looks), so 182/182 tests line completeness and session keying, NOT the `hour=` label | the weight is re-attributed in progress report §9.9: correction 1 is closed by **(a) the negative control** (corpus identity: the old cut reproduces 8,638 / 6,825 exactly) and **(b) construction** (`flushSymbols` reads `this.hour` before `beginPass` overwrites it, so the label IS the ended hour). (d)'s reach is stated. **His corroboration, adopted in place of the degenerate 182/182:** graded cells exceed graded hours by exactly **+5 on both lanes** (182/177, 179/174), which is exactly the five non-hour-aligned session boundaries in the window — the 09:30 ET regular-session open on five weekdays |
| **FINDING-2** | the restart arm was never exercised | the self-test above, expectation committed at `a5efad289` BEFORE its first run; **first run: all 10 checks PASS** (A excluded {11:00, 12:00}, 6 lost, 2/2 cells hold; B hour 12 sym 6 vs touch 12, does not hold; C exit 2) |
| **FINDING-3** | the restart source's reach was not asserted | the extract now dies unless the PM2 log's first stamp is ≤ the window start, and publishes `restart_source` (first stamp, `App [dawntrader:N] starting` line total) beside `unparsed_ts`. **Re-run on staging: first stamp `2026-03-30T17:33:06Z`, 667 `starting` lines total, one in range (the window's own start), unparsed 0; every reading unchanged** |
| **FINDING-4** | S28's line refs are stale | **Step-10 debt, named:** real lane `:3241 · :3282 · :3375 · :3586`, shadow `:4239 · :4255 · :4315` at `1b5d9d9e2` (re-measure at write time — this commit moves them again); re-verify the `vts-xs-instrument.ts:171` flush ref |
| **NIT-5** | the real lane's `symbol` is unread | **folded:** both lanes now declare `{ price; rawQuote }`; the fence pins the one type on both lanes (count 2) |
