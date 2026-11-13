# B-PRICE-FEED-COVERAGE — PART 1 METHOD DOCUMENT (OBJ-2 pre-registration, r2)

> **r2 (2026-11-13, Langston's early read of r1 at `70498b20e`: frame SOUND, M2 CHANGES-NEEDED):** M2 replay bursts handled (r1's "a replay follows a disconnect" was wrong — subscribe bursts have no gap), null-ask rows, flush leg struck, narrower monotonicity statement · M4 `M` pinned a priori, Bonferroni ruled acceptable, floor = definable not useful · M5 holdout per symbol · M6 note · M8 per-version guarantee + interim ceiling pinned · M3/M9 B0 re-pointed to the venue observation clock, #46 strict form and its same-increment carry. Coltrane reads it fresh.

**Batch:** `B-PRICE-FEED-COVERAGE` (`#1222`) · **Owner:** CC-B · **Step:** 2 of 11 (PART 1 of the pre-audit; this file is the method half, the pre-audit carries a pointer) · **Scope:** `B_PRICE_FEED_COVERAGE_SCOPE.md` r9, OBJ-2 and OBJ-3(b) · **Reviewers:** Langston and Coltrane, PROCEED required before any code reads it.

**What this is.** The exact method that turns archived quotes into the per-symbol age limits OBJ-6 will apply, written **before any movement data is read**. Nothing in this file came from a query over quote data; every number in it is either a code fact (cited at `origin/migration/aws-supabase`), a live-constant name (read at build, never written here), or a pre-registered choice labelled as one.
**What this is not.** It does not choose `p*` (Kyle's, KD-34), does not build anything, and does not cover OBJ-3's carrier (settled at Step 2 with CC-A and CC-C, KD-48) — that is the next PART 1 item.

**Owner of each parameter.** `p*` — Kyle (risk envelope, KD-34). `1 − δ`, `φ`, the grid, the window, the spacing and every rule below — the technical group (owner + Langston + Coltrane, KD-34). PM records the bound pair.

---

## M1. The rule, and the two estimands

One rule for every symbol and both classes (scope OBJ-2): **a price of age `a` may decide only if the one-sided upper confidence bound, at level `1 − δ` simultaneous over the published version, on the probability that the relevant executable side moved adversely by more than `D` within `a`, is at most `p*`.**

- **Entry estimand (built by this document).** The trade is a buy, so the relevant side is the **ask** and adverse is **up**. `D = Δ = φ × 0.25 × |planEntry − planStop|`, expressed as a fraction of `planEntry` (all displacement below is relative, so one surface serves every price level).
- **Exit estimand (defined here, derived in a later revision of this file, M10).** Exit rows keep their current measured contracts until that derivation is reviewed (scope OBJ-2, OBJ-6).

## M2. The entry statistic — defined exactly, before data

For one symbol, one stratum, one age `a`, and one anchor time `t`:

| term | definition |
|---|---|
| **side** | the executable ask. The movement sample is the ask series of the archive the class trades on (`crypto_spot_ticker_snap`, `xstock_spot_ticker_snap`). The mid series is computed beside it as a sensitivity read only — where the two disagree the difference is a spread change, which is charged to the `(1 − φ)` remainder (M6), never to age. |
| **anchor `t`** | a point on a fixed time lattice (M5), **not** a quote-change time. The estimand is unconditional: the gate is blind for `a`, so the sample must be too. *(Consequence, accepted by the scope: a quiet symbol on a healthy feed is still judged on unconditional movement — OBJ-1's `sourceHealthy` and OBJ-2's `priceAdmissible` stay separate predicates.)* |
| **start quote** | the last archived row with `captured_at ≤ t` **and a non-null ask**, outside any detected replay burst (below) — the quote in effect at `t`. A null-ask row (`equity-spot-archiver.ts:341`; `:290` *"An absent side lands `null`"*) is walked past, never substituted (r2, Langston). |
| **endpoint quote** | the **first** archived row with `captured_at ≥ t + a`, **a non-null ask**, and outside any detected replay burst. Its realised horizon `h = captured_at(endpoint) − captured_at(start)` is therefore `≥ a`. A null-ask or in-burst row is skipped and the search continues to `H`. |
| **statistic** | `X = (ask_end − ask_start) / ask_start`. A favourable move gives `X < 0`; only the upper tail is used. |
| **absent endpoint** | no row in `[t + a, t + a + H]`, `H` = 900 s (pre-registered) ⇒ the pair is **counted as an exceedance** (`X = +∞`), never dropped and never read as zero movement. |
| **outage** | if a class-wide archive gap longer than `G` = 30 s (pre-registered) falls inside the class's session and overlaps `[start, endpoint]`, the pair is **counted as an exceedance**. *Positive control, required before the build reads any cell:* the gap detector, run over 2026-10-26 → 2026-11-08, must flag a gap at ≥ 90 % of the logged `[B74][equity-spot] disconnected` events that fall inside a session (140 logged in that span, pre-audit PART 1 OBJ-5 input). Below 90 %, the detector is not certified and the xStock surface is UNASSESSABLE. |
| **replay bursts (r2 — Langston's blocking M2 finding)** | ⛔ **r1 was wrong here.** It argued a replay always follows a disconnect, so the gap rule would cover it. It does not: the `snapshot:467` bursts (~12 a day, `active-dispatch.ts:75-78`) are SUBSCRIBE bursts with no gap, and `bufferTickerSnap` stamps every replayed row `capturedAt: new Date()` (`equity-spot-archiver.ts:334`, `:338`) with no frame type on the row. A replayed endpoint carries a book from before `t + a` (`X = 0` exactly on a byte-identical replay), and a burst can **insert** a row where there was none, turning an absent-endpoint exceedance into a spurious `X ≈ 0` — the optimistic direction, on exactly the quiet population this method expects to be marginal. **Rule:** a **replay burst** is a 10 s window in which ≥ 200 distinct symbols of the class write a row **and** ≥ 80 % of those rows repeat their own previous row's bid, ask and last exactly. Rows inside a detected burst are never a start or an endpoint, and the burst is **treated as a gap**: a pair whose span overlaps it counts as an exceedance. *Positive control, required before the build reads any cell:* the detector must flag ≥ 90 % of the `snapshot:467` bursts logged in the retained error logs over the training window. Below 90 % ⇒ the detector is not certified and the class's surface is UNASSESSABLE. **Crypto:** the crypto recorder restamps too (`crypto-spot-archiver.ts:231`); the same detector shape applies, and its certification instrument (the crypto archiver's own logged subscribe/replay events) is named in r3 after a read of that write path — until then the crypto surface is UNASSESSABLE. Persisting `frameType` in the row's `metadata` (pre-audit F-1) helps only forward; the 28-day window has no discriminator. |

**Why the pairing is not optimistic (the r9 invariant's "shown" half).** One archive effect could shorten the horizon the sample sees: the archive throttle **drops** a frame inside `passive_archive.b74_ticker_snapshot_min_interval_ms` rather than deferring it (`ticker-batch-writer.ts:108`, `:114-115` — *"snapshots within the throttle window are dropped"*), so a row's quote can be older than the change it missed. *(r1 also named the ≤ 5 s flush; struck in r2 — `capturedAt` is stamped at parse, `equity-spot-archiver.ts:338`, not at insert, so the flush does not age a quote relative to its stamp.)* The start rule takes the quote in effect at `t`, which can only be older than `t`; the endpoint rule takes the first non-replay row at or after `t + a`, and a **live** (non-replay) ticker frame states the venue's current top of book at its receipt, so it includes every change before it. The throttle therefore **lengthens** the span the statistic covers, never shortens it. **Currency holds only for non-replay frames** — the replay-burst rule above is what carries the replay case, not this argument. The narrower assumption this rests on: **the `(1 − p*)` quantile of `X` at realised horizon `h` does not fall as `h` grows.** M4.5's running maximum makes the *published surface* non-decreasing in grid age `a`, which is related but not the same statement; M5's holdout is the falsification check of the assumption itself. `NOT RE-READ` (mechanism claim; the throttle and stamp lines are cited).

## M3. Clocks — per checkpoint, the gate's age and the sample's age on one named clock

**Invariant (scope r9):** per checkpoint, the gate's `a` and the sample's horizon are on the same clock, or the pairing is shown not optimistic, or the checkpoint is UNASSESSABLE. The sample's clock is always archive receipt (`captured_at`).

| census row | checkpoint | gate clock (census) | pairing with the receipt-clock sample |
|---|---|---|---|
| **#1** | xStock dispatch | in-memory last mark-change receipt since increment 0 (`active-dispatch.ts:183-184`) | same clock family (receipt). Increment 0's in-memory age is never shorter than the DB receipt age of the same quote. ✅ |
| **#2** | entry fill, open depth gate | crypto book receipt; xStock `captured_at` | receipt = receipt ✅. xStock DB row is UNASSESSABLE on a non-`update` frame until OBJ-6's reader carries `observed` (scope r9b C-8). |
| **#3** | entry fill, re-checked at use | #2 + monotonic elapsed | as #2 ✅ |
| **#5** | xStock open seam, liveness | `captured_at` (≥ 1 last-price change in 45 min) | receipt ✅; same `observed` caveat as #2. |
| **#6** | resting maker entry fill (crypto) | book receipt; sides venue-else-receipt | **venue clock where present.** Venue observation precedes receipt, so the gate's venue age is never shorter than the receipt age of the same quote — the gate reads an older cell. ✅ conservative. |
| **#8** | RTB refresh (crypto) | as #6 | as #6 ✅ |
| **#9** | RTB refresh (xStock) | in-memory tick receipt | ✅ |
| **#10** | RTB decide-time re-check | age at read + elapsed | inherits #8/#9 ✅ |
| **#23** | xStock birth quote | `captured_at` (30 min hardcoded) | receipt ✅; same `observed` caveat. |
| **#46** | xStock birth bar close | the bar cache's `fetchedAt` is NOT the bar's age; the bar's own age is unbounded today | **UNASSESSABLE on the movement surface** until the reader carries the newest contributing 1-minute candle's start time; takes the interim bound (M9). |
| **B0** | crypto birth mark | today: `lastUpdatedAt` of the mark (`signal-orchestrator.ts:2582-2583` at `47b9360f7`) | ⛔ **r1's ✅ WITHDRAWN (r2, Langston).** `lastUpdatedAt` is a RECEIPT clock with three writers at `70498b20e` — the REST ticker row (`price-cache.ts:480`, which stores REST `c[0]`, the last trade, whose own age REST does not carry), `updateFromWebSocket` (`:867`) and `updateFromRest` (`:917`) — and the field's own header says a WebSocket path refreshes it without touching the sides (`price-cache.ts:57-62`). A REST write therefore re-dates a price of unknown age (`#1056` FINDING-3). **The gate moves to the venue observation clock — M9.** Not on the movement surface; interim only. |

`#6`'s "venue precedes receipt" is a property of clocks, not a measurement; any receipt-clock checkpoint whose gate reads a **younger** clock than receipt would need a widened horizon — none in the set does. `NOT RE-READ` (each row's gate clock is taken from the census at `c8dfa3db1` and the cites above; OBJ-6's mapping table re-derives every one at its build ref).

## M4. Inference — what is computed per cell, and why it holds for every plan at once

A **cell** is `(symbol, stratum, a)`. For each cell, from its `n` training pairs:

1. **The bound.** Let `ξ` be the `(1 − p*)` quantile of `X`. The `k`-th order statistic `X₍ₖ₎` is a `1 − δ'` upper confidence bound on `ξ` when `P(Bin(n, 1 − p*) ≤ k − 1) ≥ 1 − δ'`; take the smallest such `k`. **Distribution-free** — no shape is assumed for movement — and exceedances counted as `+∞` (M2) only push it up. The published value is `q(cell) = X₍ₖ₎`.
2. **Why one bound serves every plan.** The decision's `Δ` varies trade by trade. If `q ≥ ξ` holds, then for **any** `Δ ≥ q`, `P(X > Δ) ≤ P(X > ξ) ≤ p*`. So the admission test **`q(cell) ≤ Δ`** is valid for every `Δ` simultaneously — the plan's distance does not need its own confidence allocation.
3. **Minimum sample, derived, not chosen.** A cell exists only if some `k ≤ n` qualifies: `n ≥ ln δ' / ln(1 − p*)`. Fewer ⇒ the cell is **UNASSESSABLE ⇒ refuse** (never `?? 0`, `#546`). ⚠️ **This floor is where a cell becomes DEFINABLE, not USEFUL (r2, Langston):** at `k = n` the bound is the sample maximum, and with absent endpoints counted as `+∞` a single one refuses the cell outright — so the refusal shares the OBJ-8 read shows will be worse than M5's lattice arithmetic suggests. Illustrative values at `1 − δ` = 0.95 (Langston re-derived all nine):

   | cells in the version (`M`) | `p*` = 0.01 | `p*` = 0.05 | `p*` = 0.10 |
   |---|---|---|---|
   | 1,000 | 986 | 194 | 94 |
   | 10,000 | 1,215 | 238 | 116 |
   | 100,000 | 1,444 | 283 | 138 |

4. **Simultaneous, not pointwise (scope r3b).** One published version per class serves every cell in it, and the admissible age is found by scanning. So `δ' = δ / M` (Bonferroni — ruled acceptable by Langston r2: cells co-move across symbols and adjacent ages, so Šidák would be invalid, and a max-statistic bootstrap would give up distribution-free validity under arbitrary dependence). **`M` is the A-PRIORI ATTEMPTED cell count — the class roster at the start of the training window × strata × 16 grid ages — fixed and written into the version key BEFORE any cell's `n` is looked at.** Counting `M` over surviving cells would make it data-dependent and void the correction. Every later operation below runs on bounds that already hold together.
5. **Monotone in age.** `q'(s, σ, a) = max over a' ≤ a of q(s, σ, a')`. Taking the running maximum can only raise a bound, so if every `q(a')` holds at once, every `q'(a)` holds too — monotonicisation sits inside the corrected procedure, not after it.
6. **Grid and rounding.** Ages `a` ∈ {1, 2, 3, 5, 8, 13, 20, 30, 45, 60, 90, 120, 180, 300, 600, 900} s (16 points, pre-registered). A decision of age `a` reads the **next grid age at or above** `a` (with `q'` monotone, rounding up can only refuse more). Older than 900 s, or a missing cell ⇒ UNASSESSABLE ⇒ refuse.
7. **The admissible-age boundary** for a decision is the largest grid age with `q' ≤ Δ`. It is a read of bounds that hold simultaneously, so selecting it by scan costs no extra confidence.
8. **No pooling** in version 1. Per symbol is Kyle's directive; a thin symbol is UNASSESSABLE, not borrowed from its neighbours. A pooling rule would be a later revision with its own exchangeability proof (scope OBJ-2).

`NOT RE-READ` (statistical claims 1, 2, 4, 5 — standard order-statistic and Bonferroni results; set out so the reviewers can check each in a line).

## M5. The sample — window, strata, spacing, dependence, holdout

| item | pre-registered value |
|---|---|
| **window** | the most recent 28 days of the archive at build time: days 1-21 **train**, days 22-28 **holdout** (chronological, never shuffled). Fits inside the 30-day quote-stream retention (`STORAGE_POLICY.md:41-42`). |
| **strata** | xStock: regular / extended / overnight, under one `p*` (scope §7 q3); boundaries read from the code's session classifier at the build ref, named in the version. Crypto: one stratum (24/7 market). |
| **lattice and spacing** | per cell, anchors every `a` seconds from a random offset (seed recorded in the version); a pair is **kept only if its realised span does not overlap the previous kept pair's span** (greedy, in time order), so no two pairs in one cell share any stretch of the price path. |
| **dependence** | non-overlapping spans remove the mechanical overlap dependence. Volatility clustering across spans is **not** removed; the method assumes weak dependence and tests it on the holdout (next row) rather than modelling it. |
| **holdout test (r2 — per symbol, not only pooled)** | ⛔ r1 tested only a pooled share, which is a mean used as an admissibility test: admission is per symbol, and a pooled rate passes while individual symbols fail badly (Langston's `mean-as-admissibility` class). **Two tests, both one-sided exact binomial against `p*` at 0.05, on the holdout pairs with `X > q'(cell)`:** (1) **per symbol and stratum**, pooled over that symbol's ages — a symbol that rejects is **UNASSESSABLE in this version** (refused), whatever its training cells said; (2) per class and stratum, pooled — if it rejects, **that stratum's version is not published**. The full **per-symbol exceedance-rate distribution** is reported beside the pooled figure. Testing every symbol separately will refuse some symbols that are in fact fine (no correction across symbols is applied, by choice — it errs toward refusing). This is a falsification check, not tuning — nothing is re-chosen after it. |
| **build reads** | `passive_archive.b74_ticker_snapshot_min_interval_ms` and the session classifier are read live at build and stored in the version (scope r7 condition 1; `module_constants` filtered on all six key columns). |

**Rough sample sizes from the lattice** (anchors before overlap thinning and exclusions — not data, arithmetic): xStock regular stratum, ~15 trading days × 6.5 h of training: 5,850 anchors per symbol at 60 s, 1,170 at 300 s, 390 at 900 s. Crypto, 21 days: 30,240 at 60 s, 2,016 at 900 s. Read against M4's table, **xStock at `p*` = 0.01 is expected to be UNASSESSABLE above roughly 120 s of age in the regular session and over most of the overnight stratum.** That is the consequence the OBJ-8 ask shows Kyle; it is stated here so nobody discovers it after the data is read.

## M6. `φ` and the age-uncertainty bound — how they compose (Langston r8 carry)

They act on **different axes**, so `φ` cannot be spent twice:
- **`φ` shrinks the distance.** `Δ = φ × 0.25R`. The remainder `(1 − φ) × 0.25R` is reserved **only** for OBJ-3's three named terms — spread, depth walk, decision-to-fill latency — and is never used to absorb clock error.
- **Age uncertainty would act on the age.** The scope allowed a pre-registered conservative bound on the age for rows whose clock can understate (scope r6). **Version 1 does not use one:** a row without a trustworthy clock is **UNASSESSABLE ⇒ refuse**. This is not a hidden cost: OBJ-6's central reader takes those rows' age from the cold-preserving in-memory tick, which already keeps the old time on a replay (`equity-spot-archiver.ts:315-326`). So there is exactly one conservatism knob on the window, `φ`, and one on the age axis, UNASSESSABLE. *(Langston r2: carry discharged.)* ⚠️ **That argument covers OBJ-6's READER only. The SAMPLE has its own clock problem — replayed rows stamped fresh — and M2's replay-burst rule carries it, not this section.**

## M7. Candidate parameters

| parameter | candidates | owner | note |
|---|---|---|---|
| `p*` | **0.01 · 0.05 · 0.10** | Kyle | shown to him as refusal shares per class and session (OBJ-8), never as a probability. |
| `1 − δ` | **0.95**, simultaneous over the version | technical group | one value, to keep the forking paths to the one Kyle owns. |
| `φ` | **0.5** | technical group | half the 0.25R window to age, half to spread + walk + latency. OBJ-3 tests it; a FAIL resolves per scope OBJ-3 (a)-(c), **never by re-choosing `φ`**. |

## M8. The version key

Every published surface carries: class · `p*` · `1 − δ` · `φ` · `M` (a-priori, M4.4) · the per-checkpoint clock table (M3) · window dates (train / holdout) · price basis (ask; plan basis per `B-PLAN-PRICE-BASIS`) · the grid · `H` · `G` · the replay-burst detector's parameters and its certification result · the archive throttle value read at build · strata boundaries · lattice seed · the committed query's sha · **the live value of `level_basis.level_build_max_age_ms` the interim bounds (M9) were applied with** (so a later upward drift cannot weaken the interim silently). A reader whose key does not match the live parameters refuses (scope r5). A change in `B-PLAN-PRICE-BASIS` re-derives the surface (scope §5).
⚠️ **The guarantee is PER VERSION, not per lifetime (r2, Langston):** at `1 − δ` = 0.95, twenty rebuilds expect one surface that is unsafe somewhere. The rebuild cadence is therefore part of the risk, and is stated beside the pair Kyle binds.

## M9. The interim conservative bound for B0 and #46 (scope OBJ-3 (b))

Applied in increment 3 **whether OBJ-3 passes or fails**, labelled interim, replaced only by a reviewed successor.
**The ceiling:** the live value of `level_basis.level_build_max_age_ms` — the one reviewed age ceiling at the same seam, on the same class (census row 47, `level-basis.ts:231`; `level-build-config.ts:9` states the ruling). No new number is invented; the value is read live at increment 3 and pinned into the version key (M8).
- **B0, crypto signal-birth mark (r2 — re-pointed off `lastUpdatedAt`, see M3):** admit only if **all three** hold: (i) the row's last price write was a venue PUSH (`updateFromWebSocket`, identified by `lastSource === 'kraken_ws'`, `price-cache.ts:847`; both REST writers stamp `'kraken_rest'`, `:466`, `:907`, at `70498b20e` — re-read at the build ref), so the mark and the venue stamp come from one observation; (ii) `venueObservedAtMs` is present; (iii) `now − venueObservedAtMs` ≤ the ceiling. Any other row — a REST-written price, an absent venue stamp — is **refused**: absent is refusable, never substituted (`price-cache.ts` header on `venueObservedAtMs`). ⚠️ **Consequence named:** this refuses every crypto birth priced from the REST poller. In September 161 of 170 cache entries were REST-sourced (`price-cache.ts` `lastWsMessageAtMs` header — a dated measurement, not today's share). That is why OBJ-4's coverage (increment 2) lands **before** increment 3, and the B0 share is measured after it.
- **#46, xStock signal-birth bar close (r2 — the strict form):** admit only if `now − start(newest contributing 1-minute candle)` ≤ the ceiling. r1 added 60 s for the minute resolution; Langston showed that cancels itself — `now − start` is already the upper bound on the freshest tick's age, so `ceiling + 60` on the start clock lands exactly where `ceiling` on the end clock does. **Strict form chosen.**
- ⛔ **#46 is a trading-path change, stated plainly:** the bar cache does not carry the candle time today, and a missing time refuses — so **increment 3 ships the candle-time carry in the same increment as the #46 interim, or it would switch off xStock signal birth from bar closes.** The interim does not deploy without the carry.
- **Consequence first:** the share of birth evaluations each interim would refuse, per class and session, is measured and shown to Kyle in the OBJ-8 ask before increment 3 is built.

## M10. The exit estimand — definition only (derivation in a later revision)

Same framework (M2-M8), different statistic and its own sample: **did the executable exit side (the bid, for a long) cross EITHER contemporaneous boundary during age `a`** — stop below, target above, any trailing boundary on its own side — measured as a **path** crossing over the span, not an endpoint (a stop touched and recovered is still a crossing), with direction-specific distances from the current side to each boundary. Missing boundary or path coverage ⇒ UNASSESSABLE ⇒ refuse. Census #18's stop-side risk-consumption rule is precedent in kind only, and its zero-room `clamped: true` branch must not be read as "unassessable" (scope r9). The crypto 2 s exit bound (#11/#12) is re-derived under this estimand. **Until that revision is reviewed, every exit row keeps its current contract.**

## M11. What remains of PART 1 after this file

Coverage (OBJ-4 stages and the owned message-rate stop rule) · reconnect (OBJ-5, both branches, pending set) · census row 47 in OBJ-6's mapping · the OBJ-3 carrier with CC-A and CC-C (KD-48) · the KD-56 register or its fallback alert chain. Then PART 1 goes to Langston and Coltrane whole.

**Choices the reviewers may want changed** (named so they are argued, not inherited): Bonferroni over every cell versus a less conservative selection-valid procedure · the unconditional (lattice) anchor versus a change-conditioned one · counting an absent endpoint as an exceedance (it will refuse quiet off-hours symbols outright) · `H` = 900 s and `G` = 30 s · one `1 − δ` candidate rather than two.
