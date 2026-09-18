# B-PRICE-SIDE-BY-JOB row `8a-P4a` — THE BOOK-STATE RESEED ESCAPE — PRE-IMPLEMENTATION AUDIT AND PLAN (Step 2)

change-class: sub_batch

**Scope:** `Scope Files/B_PRICE_SIDE_BY_JOB_8A_P4A_SCOPE.md`. Langston approved it at r3, `6236d37a6` (20:03Z), and gave GO on the §4a measurement. **Status:** `STEP: 2 of 11` · `NEXT STEP: 3 of 11`.

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY:** "an absorbing state" (scope r1 §0). **NOW:** a latch that renews at each off-hours reconnect. **REASON:** ANET's chain ended at a hollow yield (00:16:38Z) and re-seeded implausible 2 s later (Langston, from the log).
- **PREVIOUSLY:** LOW 194.17, 0.36% above its stop; AMC 2.905, 7% past its target. **NOW:** LOW bid 192.32, below its 193.47 stop; AMC 2.71, at its target. **REASON:** the first figures were the REST last-known-good mark, which was stale. The captured ticker is the record.
- **PREVIOUSLY:** `clearBookStateComparator` called at `aee:1918` and `:2039`. **NOW:** exactly one call site, `:1918`. **REASON:** `:2039` is a comment.

---

## A. AUDIT — the six sources, each named

### A1. Code, read at `origin/migration/aws-supabase`
**§9.5(a) census on `_comparators` (S25), tests excluded:**

| question | answer |
|---|---|
| **writes** | `advanceBookStateComparator` (`book-state-tracker.ts:130-206`, the `set` at `:196`). **Exactly one call site:** the exit loop, `aee:2022`, keyed on the HELD position. The two `aee:663-664` hits are a comment that says so. |
| **reads** | `readBookStateComparator` (`:112`), whose only caller is `assessBookStateNow` (`:311-345`). That is called at `aee:685` (entry depth gate — refuses on `state === 'hollow'` only), `aee:1884` (the exit loop), `aee:3298` (fill-time label), `active-portfolio-manager.ts:684-685` (close label) and `routes.ts:13009-13128` (diagnostics). **`comparatorValidated` has exactly two readers:** `aee:1903` (the log string) and **`aee:2059` — the exit refusal, the one behaviour this batch changes.** |
| **mutates** | only the writer above |
| ★ **deletes** | `clearBookStateComparator` (`:233-273`, the `delete` at `:273`), **one call site, `aee:1918`** (the hollow-skip yield); plus `_resetBookStateComparatorsForTest`. **Nothing evicts on position close** (Langston's finding) — an inherited locked chain is inside OBJ-1's population. |
| **schedules** | the exit monitor loop, per held xStock position per tick. No timer, no cron, no bootstrap writer. |

**Reachability (Langston re-derived):** the advance at `aee:2018-2029` sits **above** the unvalidated refusal at `aee:2059-2069`. So on every two-sided frame, an implausible chain is still advanced, and an escape inside the writer is reached every tick.
**The escape must route through `clearBookStateComparator`** (scope §4, r3). That function retains a ring only from a chain that is `!seedImplausible && observedMovement` (`:270`). So an implausible chain's own ring is **never** retained, and the retained ring that condemned it stays in place for the re-seed.

### A2. Runtime logs and DB
- **Seed-implausible events, `error.log` files from 2026-09-12 00:00Z (the lock shipped 09-13) to now:** **5 events on 4 symbols** — MDB/USD 09-15 11:16:49Z · **ANET/USD 09-16 22:43:49Z** · AMC 09-17 00:16:33Z · LOW 09-17 20:16:31Z · **ANET/USD 09-18 00:16:40Z** (ANET's chain ended at a hollow yield at 00:16:38Z and re-seeded implausible two seconds later — the renewing latch). Seed ÷ retained ratio min 4.0, median 6.0, max 56.2. **None was released by recovery:** MDB was freed by the 09-15 12:15Z restart; ANET only re-locked; AMC and LOW are still locked.
- **Refusal magnitude (Langston, whole reach):** ANET 106,623 · AMC 88,588 · LOW 25,471 · MDB 1,611; everything else ≤ 22 (the one-tick post-clear cost).
- **Would A have released them?** Share of captured-ticker frames 09-15 → 09-18 20:00Z whose spread ≤ `kRel` × the symbol's real retained median:
  | symbol | all hours | regular hours |
  |---|---|---|
  | AMC | 98.6% | 100% |
  | ANET | 79.6% | 99.4% |
  | MDB | 64.0% | 97.2% |
  | LOW | 58.6% | 61.0% |
  - n = 20,215 to 26,963 frames per symbol.
  - ⚠️ The ticker is a different producer from the guard's frames. This is a proxy, and is stated as one.
- **Knobs (`module_constants`, `book_state`, `xstock_spot`):** `single_side_departure_k_rel` = 3 · `trailing_spread_window_snaps` = 20 · `hollow_skip_cap` = 60.

### A3. `SYSTEM_IMPACT_MAP`
- The `book-state*.ts` entry says the hollow guard *"can never strand a position indefinitely"* (the 60-skip yield). **This batch's defect is a strand the SIM says cannot happen.** The unvalidated refusal is a second withholding path, and the SIM never counted it.
- S25b says the ring is *"written at a clear … deleted at the next plausible seed"*. The escape adds a clear whose reason is not a yield, and that line must say so.

### A4. `SYSTEM_MANUAL` §3.5.1
It describes the predicate and the yield. **It is silent on the seed judgement and on the unvalidated refusal** — a governance gap. That gap is how a second, uncapped refusal path came to exist without the doc noticing. §3.5.1 gets both, plus the escape.

### A5. Ledger and batch reports
- `#943` (the guard, CLOSED INCONCLUSIVE) and `#958`.
- The `8a` r3-r6 commits:
  - `f73fbfd0d` wrote down the hold-forever cost for a book that NEVER recovers.
  - The r6 note at `:251-252` says: *"Langston has ruled r5 the last gate… the remaining hole is not closeable by gating."*
  - `assessBookStateNow`'s docstring (`:296-297`) says an ABSOLUTE plausibility test *"changes exit behaviour, so it is a separate gated decision."*
  - ⇒ **Candidate C (an absolute ceiling) is exactly that separate decision.** It is not a seventh gate on the ring. §4a's rule decides whether it is taken here.
- **No existing issue records the strand on a recovered book.** It first appears in the `8a-P3` record, §6.

### A6. `bridge/canonical/`
Consulted by path: the guard was created in September 2026 (`B-XSTOCK-FEED-SANITY`), long after the pre-governance corpus closed. **No coverage, and none is possible** — that is recorded as the finding, not assumed.

### A7. THE §4a MEASUREMENT — run to the pre-registered rule
**Run 2026-09-18 ~21:30Z, inside the database (one session; 14 daily partitions `xstock_spot_ticker_snap_2026_09_04` → `_17`; tumbling 20-snapshot blocks, i.e. rolling medians at `trailingSpreadWindowSnaps` = 20 sampled every 20 frames; ring proxies drawn from blocks where the book MOVED; regular hours = weekdays 13:30-20:00 UTC).** Population: **1,319,489 blocks** (the 14 insert counts sum to it exactly), **468 of 473 listed symbols measured** — that is the coverage statement. ⚠️ *"0 excluded as thin"* is uninformative, not reassuring: at ~300 blocks per symbol per weekday nothing could fall under 20. **Held set: 70 xStock symbols paper-opened in `(2026-08-19 21:35Z, 2026-09-18 21:35Z]`** — pinned to the run's instant, because an unpinned `now() − 30 days` read 69 at 22:45Z. **68 measured; the 2 unmeasured are TEM/USD and WEN/USD, both `is_delisted = t` with no ticker rows** (the universe join drops them), so neither can strand. That disposition is written, not inferred.
**Artifacts:** the executed file is `/tmp/ccc_flip3.sql`; `/home/deploy/8ap4a_flip.sql` is a copy made at 22:02Z for Langston's reading, with sha256 identical (`d9ad7fd6ffcacfbd…`). The copy's later mtime is the copy, not a rewrite.
**What ran, stated exactly:**
- "moved" = `max(bid) > min(bid) OR max(ask) > min(ask)` — **EITHER side**, which is looser than the both-sides property C would use.
- AMC is the least comparable pair: on 09-16, 199 of its 271 regular-hours blocks had neither side move (Langston). ⇒ **When the named arm's real ratios arrive, AMC's is the one not to trust.**
- Tumbling blocks stand in for sliding windows. `row_number()` runs over rows already filtered to valid sides, so 20 "consecutive" frames can span dropped invalid frames, and `t0` files a block under its first frame's session (~4.6 min per block). That bites hardest on the hollow names.
- **2026-09-07 was Labor Day:** 7,939 blocks (0.6%), with 13:30-20:00 counted as regular hours while the market was shut. Frozen, wider quotes inflate the numerator, so this errs toward C.
- 13:30-20:00 UTC is correct for EDT through 09-17 and **breaks at the November DST shift** if re-run.

| proxy | stranded (ratio > `kRel` 3) | share | paper-held stranded | this proxy says |
|---|---|---|---|---|
| **PRIMARY — p5 of block medians** (signed: inflates ratios, toward C) | **4 of 468** | **0.9%** | **0 of 68** | A + named arm |
| **SENSITIVITY — median of block medians** | **0 of 468** | **0.0%** | **0 of 68** | A + named arm |

⇒ **THE PRE-REGISTERED RULE RETURNS A + THE NAMED ARM; C IS HOMED — CARRIED BY THE PRIMARY LEG ALONE** *(Langston, gate 1, 22:18Z)*.
⛔ **The SENSITIVITY leg was DEGENERATE and could not have voted for C:** regular hours are ~79% of each symbol's blocks, so `median(regular-hours blocks) / median(all moved blocks)` is ≈ 1 by construction. Langston measured it on one weekday (`_2026_09_16`, 464 symbols): SENSITIVITY max 1.09, p99 1.02, against a bar of 3, while PRIMARY on the same day reached 3.37 with 2 stranded. A leg that cannot reach the bar can only vote against C. He added that leg at r3 and recorded the error as his. **The outcome does not move:** PRIMARY had genuine reach (14-day max 6.59, 4 stranded) and alone returns A + the named arm on both of its own tests (0.9% < 5%; 0 of 68 held). The sentence *"Both proxies agree"* is struck. This result matches the substitution written before the data.
**The four locked symbols under both proxies:** AMC 1.13 / 1.00 · ANET 2.02 / 0.84 · LOW 2.34 / 0.99 · MDB 2.06 / 0.85 — all under 3.
**Distribution of the PRIMARY ratio:** median 2.02, p90 2.40, max 6.59.
⚠️ **The margin is real but not wide:** under the conservative proxy, one symbol in ten sits above 2.4 against a bar of 3. That tail is what the named arm is for.
⚠️ **Limits, stated:** the proxies are not the in-memory ring, and the captured ticker is a different producer from the guard's frames (both named before the run).
**`HOME: C (a ring-independent release bound) — owner CC-C, homed as its own item in PHASE_19_PLAN at 3n, after 8a-P4c`**, and reopened if the named arm's logged real ratios show a held symbol stranded.

---

### A8. *(gate-2 BLOCKER-2)* THE STEP-8 PREDICTION — WRITTEN BEFORE THE DEPLOY, under P1's THREE conditions as built
**Object:** `xstock_spot_ticker_snap_2026_09_17`, valid two-sided rows, regular hours 13:30-20:00Z, per symbol, with its real retained median. The P1 predicate is simulated frame by frame from an implausible start (`/home/deploy/8ap4a_pred.py` + `8ap4a_pred.sql` on staging), re-arming after each escape to count repeats. ⚠️ **Proxy:** captured ticker snapshots, not the guard's frames (the guard advances every ~1.5 s exit tick on the latest WS frame, so it sees repeats between updates — which is exactly why (c) is a run count, not a window).

| symbol | frames (RTH) | first escape, frames from an implausible start | ≈ time at its capture cadence | escapes/day (re-armed) | Langston's per-frame move rate |
|---|---|---|---|---|---|
| ANET/USD | 4,985 | **26** | ~2 min | 248 | 53.45% |
| MDB/USD | 4,347 | **22** | ~2 min | 213 | 50.48% |
| **AMC/USD** | 5,402 | **66** | **~5 min** | 57 | **2.33%** |
| LOW/USD | 4,697 | **445** | **~37 min** (spread plausible on only ~61% of frames) | 135 | 48.47% |

- **The prediction:** after the deploy, each of these symbols that seeds implausible in regular hours escapes, with a `SEED_ESCAPED` line on the order above.
- **AMC is the slowest mover and still escapes on the proxy.** The r1 windowed count escaped it too on the proxy (first at frame 66), but that proxy is denser in moves than the guard's frames, and fixture 4b shows the windowed count strands a book moving once per 25 frames.
- ⛔ **IF AMC (or any held symbol) DOES NOT ESCAPE at Step 8**, while its captured spread sits within the bound: that is **not** tuning. It is the ring-independent case, and `3n.q5` reopens on the named arm's real ratios. Named now, not discovered then.
- ⚠️ **The three live locks themselves are NOT this evidence:** the deploy's restart cold-seeds them (scope §6).

## B. PLAN — every item names the finding it falls out of

| # | from | item |
|---|---|---|
| **P1** | A1 (writer reachable every tick), A2 (A would have released all four), **gate-2 BLOCKER-2** | **The escape, in the writer.** In `advanceBookStateComparator`, when the previous chain is `seedImplausible`, has `observedMovement`, and a retained ring exists with `kRel` readable, it ends only if ALL of these hold: · **(a)** the chain's FULL trailing ring (20 frames, this one included) has its MEDIAN ≤ `kRel` × the retained median, so one tight print cannot escape; · **(b)** THIS frame is itself ≤ that bound, so the new seed passes the ordinary seed test by construction and consumes the ring under r4 (Langston derived this from `:236/:247/:281/:287/:301`); · **(c) — r2 of the build, after BLOCKER-2:** the book has **moved at least twice during its current PLAUSIBLE RUN** (`plausibleRunMoves`: consecutive frames within the bound; a wider frame resets it to 0). The jump into a tight quote is one move, so a book frozen there does not escape, and moves made while still wide never count. **It is not windowed:** the r1 build counted moves inside the 20-frame ring, which a quiet healthy book (AMC: 2.33% of consecutive captured frames move) rarely satisfies at 1.5 s exit ticks. A run count waits for two real moves at any cadence. Then it clears through `clearBookStateComparator(key, 'seed_escape_recovered')`, and this frame seeds the new chain by the ordinary no-`prev` path. **The escape seed does not validate on its own frame** (that verdict was taken against the old chain); it validates on the next `two_sided` frame, like any seed. No new knob, no clock term; the new chain starts with `observedMovement = false` (r5). |
| **P2** | Langston BLOCKER-1 condition, **gate-2 C2** | **One basis line per chain on its FIRST refusal**, at `aee`'s `REFUSE unvalidated`: `seedSpread`, `retainedMedian` (at seed and now), `kRel`, the current median, **the real ratio**, `inherited=true|false` (`seededAtMs` before the position's `openedAt`). **Three new fields on `BookStateComparator`** (`seedSpread`, `seedRetainedMedian`, `refusalBasisLogged`), plus `plausibleRunMoves` for P1(c). ⚠️ **"One line per chain" is enforced by a MUTATING read:** `takeChainRefusalBasis` sets `refusalBasisLogged` on the chain it returns, so `first` is true exactly once per chain, and a new chain (yield, escape, restart) starts at false. |
| **P3** | scope OBJ-4 | **The escape line:** `SEED_ESCAPED symbol framesHeld seedSpread escapeMedian retainedMedian kRel`, as `warn`. |
| **P4** | the alert misattribution (Langston 20:03Z) | The unmanageable alert from `_recordPriceSkip(…'book_state_unvalidated')` stops saying *"no Kraken price"*. It names the guard's refusal and carries the real ratio. |
| **P5** | A7 — the rule returned **A + the named arm**; **gate-2 BLOCKER-1, C3** | **The named arm is P4's alert, not a new mechanism.** When `_recordPriceSkip(…'book_state_unvalidated')` reaches its threshold (39 of 40 ticks), the unmanageable alert names the symbol, the seed spread, the retained median, the chain's current median, **the real ratio** and the exposure (bid vs stop and target). **Owner: CC-C.** Every `REFUSE unvalidated` line also logs the real ratio. ⛔ **DEPLOY STEP — the arm is silenced on all four of its subjects until done (Langston, measured):** the alert's dedupe key is `price-skip-${mode}-${symbol}`, which is REASON-BLIND (`aee:810`), and a non-resolved row blocks every later mint (`system-alerts.ts:388-389`). Four such rows hold exactly the stranded set: `3a85ba22` ANET · `c50238db` AMC · `ef81571d` LOW · `f248f7f0` MDB (MDB's is a *stale-mark* alert, the proof that the key is reason-blind). ⇒ **Immediately after the `8a-P4a` deploy, CC-C RESOLVES — never acks — all four, with the deploy sha as evidence**, so the rewritten alert can mint. Positive control that a resolve re-arms: `price-skip-paper-BSX/USD` minted three times on 07-16/17, each after its predecessor was resolved. **C3 — the evidence's retention and reader:** `REFUSAL_BASIS`, `REFUSE unvalidated` and `SEED_ESCAPED` are all `console.warn` ⇒ stderr ⇒ `error.log`, ~14-day retention (not the ~2-day stdout rotation). **Reader: CC-C at Step 8**, and on each named-arm alert; the per-refusal real ratios are what reopen `3n.q5`. |
| **P6** | OBJ-2, **gate-2 C1/C4** | **Eleven fixtures on the REAL tracker state machine.** · A recovered book escapes inside the ring, and **does NOT validate on the escape frame** (test 1). · The CRM 7.00/1000.00 book never escapes. · A single tight print does not escape. · A book frozen after one jump does not escape (test 4). · **A quiet healthy book moving once per 25 frames DOES escape** (test 4b — fails under the r1 windowed count, checked against the pushed r1 code). · An unreadable kRel never escapes. · A plausible chain is untouched. · The basis is first-once per chain, and a new chain logs again. · The alert branch. · No clock term. The r3-r5 fixtures are unmodified. **Mutation-checked:** · disabling the escape ⇒ tests 1 and 8 red; · deleting `&& !escapedThisFrame` ⇒ **test 1 red** (C1: it is not silent; test 1 asserts `validated === false` on the escape frame); · **`runMovesNow >= 1` instead of `>= 2` ⇒ tests 4 and 4b red** (C4: the 2 is measured, it discriminates frozen-after-one-jump). |
| **P7** | A3, A4 | SIM S25b and the `book-state*` entry; SYSTEM_MANUAL §3.5.1 — content, at Step 10. |

**UNAUDITED:** none. Every item above points at an A-finding.
