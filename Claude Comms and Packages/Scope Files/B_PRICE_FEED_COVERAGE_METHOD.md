# B-PRICE-FEED-COVERAGE — PART 1 METHOD DOCUMENT (OBJ-2 pre-registration, r1)

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
| **start quote** | the last archived row with `captured_at ≤ t` — the quote in effect at `t`. |
| **endpoint quote** | the **first** archived row with `captured_at ≥ t + a`. Its realised horizon `h = captured_at(endpoint) − captured_at(start)` is therefore `≥ a`. |
| **statistic** | `X = (ask_end − ask_start) / ask_start`. A favourable move gives `X < 0`; only the upper tail is used. |
| **absent endpoint** | no row in `[t + a, t + a + H]`, `H` = 900 s (pre-registered) ⇒ the pair is **counted as an exceedance** (`X = +∞`), never dropped and never read as zero movement. |
| **outage** | if a class-wide archive gap longer than `G` = 30 s (pre-registered) falls inside the class's session and overlaps `[start, endpoint]`, the pair is **counted as an exceedance**. *Positive control, required before the build reads any cell:* the gap detector, run over 2026-10-26 → 2026-11-08, must flag a gap at ≥ 90 % of the logged `[B74][equity-spot] disconnected` events that fall inside a session (140 logged in that span, pre-audit PART 1 OBJ-5 input). Below 90 %, the detector is not certified and the xStock surface is UNASSESSABLE. |
| **replay rows** | a reconnect replays books with a fresh `captured_at` (scope r6; `equity-spot-archiver.ts:334-338`). They cannot make a pair optimistic once the outage rule holds, because the replay follows a disconnect and the disconnect's gap already marks every pair across it. Replay rows are **not** used as anchors' start quotes when they fall within 60 s after a flagged gap (the start quote is then the last pre-gap row, and the pair is an exceedance under the outage rule anyway). |

**Why the pairing is not optimistic (the r9 invariant's "shown" half).** Two archive effects could shorten the horizon the sample sees: (1) the archive throttle **drops** a frame inside `passive_archive.b74_ticker_snapshot_min_interval_ms` rather than deferring it (`ticker-batch-writer.ts:108`, `:114-115` — *"snapshots within the throttle window are dropped"*), and (2) the ≤ 5 s flush. Both make a row's quote older than its `captured_at`. The start rule takes the quote in effect at `t`, which can only be older than `t`; the endpoint rule takes the first row at or after `t + a`, and a ticker frame carries the full current top of book, so it includes every change before its own receipt. Both effects therefore **lengthen** the span the statistic covers, never shorten it. This is conservative **on the assumption that the upper quantile of adverse movement does not fall as the horizon grows**; M4's monotone envelope enforces that assumption on the published surface, and M5's holdout test is its falsification check. `NOT RE-READ` (mechanism claim; the throttle line is cited, the frame-carries-full-state premise is the adapter contract and should be confirmed by the reviewer).

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
| **B0** | crypto birth mark | `lastUpdatedAt` of the mark (`signal-orchestrator.ts:2582-2583` at `47b9360f7`) | the mark's writer is not the ask archive's writer, so the mark can be older than any archived ask — the gate's age is on the mark's own clock, which is the older one. ✅ conservative, **but** the mark is a different quantity from the ask (pre-audit PART 1, B0/8c): B0 takes the interim bound (M9) regardless of OBJ-3. |

`#6`'s "venue precedes receipt" is a property of clocks, not a measurement; any receipt-clock checkpoint whose gate reads a **younger** clock than receipt would need a widened horizon — none in the set does. `NOT RE-READ` (each row's gate clock is taken from the census at `c8dfa3db1` and the cites above; OBJ-6's mapping table re-derives every one at its build ref).

## M4. Inference — what is computed per cell, and why it holds for every plan at once

A **cell** is `(symbol, stratum, a)`. For each cell, from its `n` training pairs:

1. **The bound.** Let `ξ` be the `(1 − p*)` quantile of `X`. The `k`-th order statistic `X₍ₖ₎` is a `1 − δ'` upper confidence bound on `ξ` when `P(Bin(n, 1 − p*) ≤ k − 1) ≥ 1 − δ'`; take the smallest such `k`. **Distribution-free** — no shape is assumed for movement — and exceedances counted as `+∞` (M2) only push it up. The published value is `q(cell) = X₍ₖ₎`.
2. **Why one bound serves every plan.** The decision's `Δ` varies trade by trade. If `q ≥ ξ` holds, then for **any** `Δ ≥ q`, `P(X > Δ) ≤ P(X > ξ) ≤ p*`. So the admission test **`q(cell) ≤ Δ`** is valid for every `Δ` simultaneously — the plan's distance does not need its own confidence allocation.
3. **Minimum sample, derived, not chosen.** A cell exists only if some `k ≤ n` qualifies: `n ≥ ln δ' / ln(1 − p*)`. Fewer ⇒ the cell is **UNASSESSABLE ⇒ refuse** (never `?? 0`, `#546`). Illustrative values at `1 − δ` = 0.95:

   | cells in the version (`M`) | `p*` = 0.01 | `p*` = 0.05 | `p*` = 0.10 |
   |---|---|---|---|
   | 1,000 | 986 | 194 | 94 |
   | 10,000 | 1,215 | 238 | 116 |
   | 100,000 | 1,444 | 283 | 138 |

4. **Simultaneous, not pointwise (scope r3b).** One published version per class serves every cell in it, and the admissible age is found by scanning. So `δ' = δ / M`, where `M` = symbols × strata × grid ages **in that version**, counted at build and stored in the version key (Bonferroni). Every later operation below runs on bounds that already hold together.
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
| **holdout test** | per class and stratum, pooled across symbols and ages: the share of holdout pairs with `X > q'(cell)`. One-sided exact binomial test against `p*` at 0.05. If it rejects, **that stratum's version is not published** (UNASSESSABLE). This is a falsification check, not tuning — nothing is re-chosen after it. |
| **build reads** | `passive_archive.b74_ticker_snapshot_min_interval_ms` and the session classifier are read live at build and stored in the version (scope r7 condition 1; `module_constants` filtered on all six key columns). |

**Rough sample sizes from the lattice** (anchors before overlap thinning and exclusions — not data, arithmetic): xStock regular stratum, ~15 trading days × 6.5 h of training: 5,850 anchors per symbol at 60 s, 1,170 at 300 s, 390 at 900 s. Crypto, 21 days: 30,240 at 60 s, 2,016 at 900 s. Read against M4's table, **xStock at `p*` = 0.01 is expected to be UNASSESSABLE above roughly 120 s of age in the regular session and over most of the overnight stratum.** That is the consequence the OBJ-8 ask shows Kyle; it is stated here so nobody discovers it after the data is read.

## M6. `φ` and the age-uncertainty bound — how they compose (Langston r8 carry)

They act on **different axes**, so `φ` cannot be spent twice:
- **`φ` shrinks the distance.** `Δ = φ × 0.25R`. The remainder `(1 − φ) × 0.25R` is reserved **only** for OBJ-3's three named terms — spread, depth walk, decision-to-fill latency — and is never used to absorb clock error.
- **Age uncertainty would act on the age.** The scope allowed a pre-registered conservative bound on the age for rows whose clock can understate (scope r6). **Version 1 does not use one:** a row without a trustworthy clock is **UNASSESSABLE ⇒ refuse**. This is not a hidden cost: OBJ-6's central reader takes those rows' age from the cold-preserving in-memory tick, which already keeps the old time on a replay (`equity-spot-archiver.ts:315-326`). So there is exactly one conservatism knob on the window, `φ`, and one on the age axis, UNASSESSABLE.

## M7. Candidate parameters

| parameter | candidates | owner | note |
|---|---|---|---|
| `p*` | **0.01 · 0.05 · 0.10** | Kyle | shown to him as refusal shares per class and session (OBJ-8), never as a probability. |
| `1 − δ` | **0.95**, simultaneous over the version | technical group | one value, to keep the forking paths to the one Kyle owns. |
| `φ` | **0.5** | technical group | half the 0.25R window to age, half to spread + walk + latency. OBJ-3 tests it; a FAIL resolves per scope OBJ-3 (a)-(c), **never by re-choosing `φ`**. |

## M8. The version key

Every published surface carries: class · `p*` · `1 − δ` · `φ` · `M` · the per-checkpoint clock table (M3) · window dates (train / holdout) · price basis (ask; plan basis per `B-PLAN-PRICE-BASIS`) · the grid · `H` · `G` · the archive throttle value read at build · strata boundaries · lattice seed · the committed query's sha. A reader whose key does not match the live parameters refuses (scope r5). A change in `B-PLAN-PRICE-BASIS` re-derives the surface (scope §5).

## M9. The interim conservative bound for B0 and #46 (scope OBJ-3 (b))

Applied in increment 3 **whether OBJ-3 passes or fails**, labelled interim, replaced only by a reviewed successor.
- **B0, crypto signal-birth mark:** admit only if the mark's age (`now − lastUpdatedAt`) is at most the live value of `level_basis.level_build_max_age_ms` — the one reviewed age ceiling at the same seam, on the same class, already applied to the **sides** of the same cache row (census row 47, `level-basis.ts:231`). One ceiling for both fields of one cache row at one seam; no new number is invented. Its value is read live at increment 3, never written here.
- **#46, xStock signal-birth bar close:** admit only if `now − start(newest contributing 1-minute candle)` is at most **that same ceiling + 60 s**. The extra minute is the bar clock's resolution: the bar's age is known only to the minute, and the reader uses the **upper** bound so it can never admit on a lower bound (scope r9). If the candle time is not carried ⇒ refuse.
- **Consequence first:** the share of birth evaluations each interim would refuse, per class and session, is measured and shown to Kyle in the OBJ-8 ask before increment 3 is built (crypto birth is still priced from sources OBJ-4 has not yet widened, so B0's share may be large).

## M10. The exit estimand — definition only (derivation in a later revision)

Same framework (M2-M8), different statistic and its own sample: **did the executable exit side (the bid, for a long) cross EITHER contemporaneous boundary during age `a`** — stop below, target above, any trailing boundary on its own side — measured as a **path** crossing over the span, not an endpoint (a stop touched and recovered is still a crossing), with direction-specific distances from the current side to each boundary. Missing boundary or path coverage ⇒ UNASSESSABLE ⇒ refuse. Census #18's stop-side risk-consumption rule is precedent in kind only, and its zero-room `clamped: true` branch must not be read as "unassessable" (scope r9). The crypto 2 s exit bound (#11/#12) is re-derived under this estimand. **Until that revision is reviewed, every exit row keeps its current contract.**

## M11. What remains of PART 1 after this file

Coverage (OBJ-4 stages and the owned message-rate stop rule) · reconnect (OBJ-5, both branches, pending set) · census row 47 in OBJ-6's mapping · the OBJ-3 carrier with CC-A and CC-C (KD-48) · the KD-56 register or its fallback alert chain. Then PART 1 goes to Langston and Coltrane whole.

**Choices the reviewers may want changed** (named so they are argued, not inherited): Bonferroni over every cell versus a less conservative selection-valid procedure · the unconditional (lattice) anchor versus a change-conditioned one · counting an absent endpoint as an exceedance (it will refuse quiet off-hours symbols outright) · `H` = 900 s and `G` = 30 s · one `1 − δ` candidate rather than two.
