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
**Run 2026-09-18 ~21:30Z, inside the database (one session; 14 daily partitions `xstock_spot_ticker_snap_2026_09_04` → `_17`; tumbling 20-snapshot blocks, i.e. rolling medians at `trailingSpreadWindowSnaps` = 20 sampled every 20 frames; ring proxies drawn from blocks where the book MOVED; regular hours = weekdays 13:30-20:00 UTC).** Population: **1,319,489 blocks, 468 of 473 listed symbols measured, 0 excluded as thin**; the 5 unmeasured have no ticker rows in the span. Held set = 70 symbols paper opened in the last 30 days, **68** of them measured.

| proxy | stranded (ratio > `kRel` 3) | share | paper-held stranded | this proxy says |
|---|---|---|---|---|
| **PRIMARY — p5 of block medians** (signed: inflates ratios, toward C) | **4 of 468** | **0.9%** | **0 of 68** | A + named arm |
| **SENSITIVITY — median of block medians** | **0 of 468** | **0.0%** | **0 of 68** | A + named arm |

⇒ **THE PRE-REGISTERED RULE RETURNS A + THE NAMED ARM; C IS HOMED.** Both proxies agree, so the disagreement branch is not reached. This matches the substitution written before the data.
**The four locked symbols under both proxies:** AMC 1.13 / 1.00 · ANET 2.02 / 0.84 · LOW 2.34 / 0.99 · MDB 2.06 / 0.85 — all under 3.
**Distribution of the PRIMARY ratio:** median 2.02, p90 2.40, max 6.59.
⚠️ **The margin is real but not wide:** under the conservative proxy, one symbol in ten sits above 2.4 against a bar of 3. That tail is what the named arm is for.
⚠️ **Limits, stated:** the proxies are not the in-memory ring, and the captured ticker is a different producer from the guard's frames (both named before the run).
**`HOME: C (a ring-independent release bound) — owner CC-C, homed as its own item in PHASE_19_PLAN at 3n, after 8a-P4c`**, and reopened if the named arm's logged real ratios show a held symbol stranded.

---

## B. PLAN — every item names the finding it falls out of

| # | from | item |
|---|---|---|
| **P1** | A1 (writer reachable every tick), A2 (A would have released all four) | **The escape, in the writer.** In `advanceBookStateComparator`, when the previous chain is `seedImplausible`, has `observedMovement`, and `kRel` is readable, it ends only if ALL of these hold: **(a)** the chain's FULL trailing ring (20 frames, this one included) has its MEDIAN ≤ `kRel` × the retained median, so one tight print cannot escape; **(b)** THIS frame is itself ≤ that bound, so the new seed passes the ordinary seed test by construction and consumes the ring under r4 instead of re-locking; **(c)** at least TWO frames of the window are both plausible AND moved — the jump into a tight quote is one, so a book frozen there does not escape (found while writing the fixture: an ever-moved flag, or moves counted while still wide, let that case through). Then it clears through `clearBookStateComparator(key, 'seed_escape_recovered')`, and this frame seeds the new chain by the ordinary no-`prev` path. **The escape seed does not validate on its own frame** (that verdict was taken against the old chain); it validates on the next `two_sided` frame, like any seed. No new knob, no clock term; the new chain starts with `observedMovement = false` (r5). |
| **P2** | Langston BLOCKER-1 condition | **One basis line per chain on its FIRST refusal**, at `aee:2059`: `seedSpread`, `retainedMedian`, `kRel`, `inherited=true|false`, and the chain's current median spread. `inherited` = the chain's `seededAtMs` is earlier than the position's `openedAt`. This needs the seed spread and retained median carried on the comparator — two new fields on `BookStateComparator`, written at seed. |
| **P3** | scope OBJ-4 | **The escape line:** `SEED_ESCAPED symbol framesHeld seedSpread escapeMedian retainedMedian kRel`, as `warn`. |
| **P4** | the alert misattribution (Langston 20:03Z) | The unmanageable alert from `_recordPriceSkip(…'book_state_unvalidated')` stops saying *"no Kraken price"*. It names the guard's refusal and carries the real ratio. |
| **P5** | A7 — the rule returned **A + the named arm** | **The named arm is P4's alert, not a new mechanism.** When `_recordPriceSkip(…'book_state_unvalidated')` reaches its existing threshold (39 of 40 ticks), the unmanageable alert names the symbol, `seedSpread`, the retained median, the chain's current median, **the real ratio** and the exposure (bid vs stop and target). **Owner: CC-C.** Every `REFUSE unvalidated` line also logs the real ratio. That per-refusal ratio is the production evidence §4a says settles whether C is ever needed. ⚠️ The alert is keyed per symbol today, so a held row blocks later mints; the resolve-to-re-arm rule applies, and the per-chain key is Step 3's call. The off-hours notify cut remains `3b.f-c`'s (`#994`). |
| **P6** | OBJ-2 | Fixtures on the REAL tracker state machine: a recovered book escapes within 20 frames; the CRM 7.00/1000.00 book never does; a frozen tight book never does (no movement); a single tight print inside a wide book does not; the new chain has no inherited movement; an in-place flip is impossible (the escape leaves a `COMPARATOR_CLEARED reason=seed_escape_recovered` line). The r3-r5 fixtures stay **unmodified**. A source fence on no clock term, plus a class tripwire. |
| **P7** | A3, A4 | SIM S25b and the `book-state*` entry; SYSTEM_MANUAL §3.5.1 — content, at Step 10. |

**UNAUDITED:** none. Every item above points at an A-finding.
