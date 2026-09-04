# B-XSTOCK-SESSION-FRESHNESS — (i-r) ESTIMAND REGISTRATION

> **PRE-REGISTERED. Committed BEFORE any figure was computed against it.** The commit that
> introduces this file is the evidence of that ordering, and it is the only evidence that
> matters: a criterion chosen after seeing the window can always be made to pass.
>
> Owner CC-C · plan row `3b.f-c` · dispatched to Langston 2026-09-03 07:33Z as a single gate.
> Supersedes nothing; the `obj9_*.sql` instruments describe the FEED and are not this estimand.

---

## 0. Why this exists

Kyle ruled on 2026-09-03 that xStock freshness keeps one standard round the clock and is **not to
be loosened** — *"if that means we don't get a chance to exit overnight … then so be it. We just
hold that until we start getting fresher data"* — with one opening: *"if we can PROVE that the risk
is not increased by relaxing that during off hours, then I'm willing to listen."*

**The burden therefore sits with whoever proposes a relaxation, and this document is what that
proof would have to be measured against.** It is registered before the data so the answer cannot be
shaped to the question.

## 1. Object

**The ENTRY freshness gate's refusal decision on xStock active-dispatch attempts.**
Not the feed. Not the gap distribution. Not the alert ledger. Those are different objects, and
measuring one of them while claiming about this one is exactly how the first attempt went wrong.

## 2. Population

Rows of `vts_open_trades` with `asset_class = 'xstock_spot'` and `inserted_at` in
**2026-08-20 to 2026-09-02 inclusive**, less attempts that never reached the gate.

⚠️ **THE DENOMINATOR CARRIES ITS OWN LIMIT, AND THAT LIMIT TRAVELS IN THE SAME SENTENCE AS ANY
RATE — never in a caveat below it.** Four gates sit above the freshness check:
`active-dispatch.ts:141` engine-active · `:149-153` class-active · `:155-158` orchestrator handle ·
`:168-172` fill-safety resolve.

✅ **Gates 1 and 2 DISCHARGED, and the load-bearing reason is `:139`, not the timestamps:** it is
`await storage.getSystemContext('paper')` — a **live DB read on every dispatch**, not a
boot-hydrated flag. Against an in-memory context the row's `updated_at` would witness nothing about
the value the gate actually read. Both writers stamp `updatedAt` unconditionally, and a whole-tree
census finds writers only in `storage.ts` (`:4243`, `:4251`, `:4259`) — **instrument proved on
those known positives before its silence elsewhere was read.**

⛔ **Gates 3 and 4 are BOUNDED, NOT DISCHARGED.** Both fail silently into in-memory counters, so
their silence over a three-week window carries no information. They are bounded by consequence — an
xStock position cannot open unless both passed — and opens landed on **all ten trading days** in the
window. **The limit is therefore "not a full trading day, on any trading day". It gets no number,
and must not acquire one.**

## 3. Per-attempt measurement

| term | definition |
|---|---|
| `age(a)` | `inserted_at(a)` minus max{`captured_at` ≤ `inserted_at(a)`} on `xstock_spot_ticker_snap` for `symbol(a)` |
| `refused_today(a)` | `age(a) > L`, where **L = `active_fill_max_age_ms` = 15,000 ms** |
| `room(a)` | `abs(entry_price − stop_loss) / entry_price` — **both columns on the same attempt row**, so the risk term needs no reconstruction |
| `ceiling(a)` | `clamp(budget_k × room(a) / σ_rate(symbol(a)), floor_ms, cap_ms)` |
| `admitted_by_budget(a)` | `age(a) ≤ ceiling(a)` |

**Live knob values, read 2026-09-03 and not recalled:** `budget_k` 0.5 · `floor_ms` 15,000 ·
`cap_ms` 300,000, all `xstock_spot`, all stamped 2026-07-22. **L = 15,000, stamped 2026-06-15 —
predating the window, so a write during it would have moved that stamp into it.**

⚠️ **INSTRUMENT PROPERTY, STATED AND NOT FOOTNOTED:** the reconstruction understates true age
**one-directionally by 67–108 ms** (the insert-to-gate offset). That is the fail-safe direction for
a staleness gate. A verdict can flip only for attempts within ~110 ms of `L`, and **that flip count
ships beside the estimate.**

## 4. Primary quantity

**D = { a : `refused_today(a)` AND `admitted_by_budget(a)` }** — the attempts today's flat clock
refuses that a risk-derived budget would admit — and, for each, the **REALIZED adverse price
movement** across the stale interval, as a fraction of `room(a)`.

## 5. The risk test, in Kyle's terms

The claim *"risk is not increased"* is operationally: **for attempts in D, realized adverse
movement over the stale interval did not exceed `budget_k × room(a)`.**
**FALSIFIED if the upper tail of that distribution crosses the budget.** A statement about what
prices actually did — never about what the formula permits.

## 6. Positive control — run before any figure counts

Three known refusals, each stating in its own alert body the age the gate observed:

| alert | symbol | stated | reconstructed | delta |
|---|---|---|---|---|
| `7526b48a` | PCG/USD | 19,366 ms | 19,299 ms | −67 ms |
| `130aa417` | RIOT/USD | 45,397 ms | 45,307 ms | −90 ms |
| `1d1573c7` | RIOT/USD | 55,473 ms | 55,365 ms | −108 ms |

⛔ **THE CONTROL THAT FAILED FIRST IS PART OF THIS RECORD, because its failure nearly killed the
measurement.** Aimed at the alert's own `fired_at` it missed all three in **both** directions
(+18.4 s, −22.5 s, −41.3 s) — `fired_at` is MINT time, and the lag to the attempt is 38 s / 450 s /
726 s. **That failure was read as proof no attempt record existed anywhere.**
⇒ ★ **A FAILING CONTROL IS EVIDENCE ABOUT THE CONTROL BEFORE IT IS EVIDENCE ABOUT THE WORLD** — and
a control makes a false absence feel *earned* in a way a bare grep never does.

## 7. The no-change-warranted arm — three ways in, all real outcomes

1. **D empty or trivially small** ⇒ no change warranted.
2. **Realized adverse movement in D exceeds the budget** ⇒ no change warranted, positively.
3. ⭐ **`σ_rate` resolves CLASSWIDE for most of D** ⇒ **INCONCLUSIVE, never PASS** — the budget is
   then not symbol-specific and the risk claim has no symbol evidence under it. **Not
   hypothetical: this is the LI overnight case, `src=classwide` on 841 of 841 lines.**

## 8. ⛔⛔ SUBSTITUTION-THROUGH — AND IT DID NOT COME OUT CLEAN

**It does NOT collapse.** D is non-empty whenever `L < age(a) ≤ ceiling(a)`, and `ceiling` ranges
over [15,000, 300,000], so there is real room between them. Langston's A2 degeneracy — an estimand
that zeroes algebraically and enters the sums looking priced — is not present.

⛔ **BUT `floor_ms` ON THE EXIT CEILING IS 15,000 ms AND `L` ON THE ENTRY GATE IS 15,000 ms. THE
SAME NUMBER.** Therefore `ceiling(a) ≥ L` for **every** attempt, without exception, and the budget
**can never refuse an attempt the flat clock admits.**

⇒ ⭐ **A risk-derived entry gate built on these knobs is a PURE ONE-DIRECTIONAL RELAXATION,
arithmetically incapable of tightening anything.**
⇒ **So it cannot be argued as "applying Kyle's consistency requirement" — which is close to how it
has been framed, mine included.** It lands inside his proof bar by construction, and the only
honest way to propose it is as a relaxation with evidence attached.
⇒ The estimand is correspondingly one-sided: **D is the only set that can change**, so the
measurement asks exactly one question — was the movement over those stale intervals inside the
budget the formula assumes.

★ **One behaviour recorded as INTENDED rather than as a defect:** for a fast-moving symbol `σ_rate`
is large, `ceiling` collapses toward the floor, and D goes empty for that symbol. **Volatile names
get no relaxation at all.** That is the design working — and it is also why arm 3 matters, since a
classwide σ hides exactly this discrimination.

## 10. LANGSTON'S SIX CONDITIONS — FOLDED IN, ALL BEFORE ANY COMPUTATION

> Accepted 2026-09-03 07:34Z with six additions, each pre-registration and each cheap. He
> independently re-derived `active_fill_max_age_ms = 15000` and `budget_k 0.5 / floor_ms 15000 /
> cap_ms 300000` at the live DB and both code sites, and confirmed the §8 finding: *"pure
> one-directional relaxation, confirmed independently. That reframing is correct and I want it
> carried in the record, not softened."*

### 10.1 — RECONCILE AGAINST THE DIRECT INSTRUMENT (his condition 1, and it is the sharpest)
⛔ **The positive control in §6 validates the AGE instrument, not the OBJECT.** `refused_today` is
reconstructed from VTS `inserted_at` — the ADJACENT lane — while the gate has a direct instrument in
`_staleSkips` and `raiseStaleFillAlert`. **That is his own `#675` shape: a true measurement on the
adjacent object.**
⇒ **RECONCILIATION, pre-registered:** every alert-minted refusal in the window MUST appear as a
reconstructed refusal. Mints are a strict subset of refusals (the key is global, so a refusal while
another symbol's row is active mints nothing), so **containment is the testable direction: a mint
with no matching reconstructed refusal means the reconstruction is on the wrong lane and the run is
void.** `_staleSkips` itself cannot serve — in-memory, lost at every restart.

⛔⛔ **AND STATE THE LIMIT OF THAT RECONCILIATION, BECAUSE IT IS ONE-WAY (Langston, 2026-09-03):
CONTAINMENT CAN ONLY *VOID*, NEVER *CONFIRM*.** A window with zero mints passes it **vacuously** —
that is `#661` leg 2, an instrument with zero opportunity, not evidence.
⇒ **The mint count over the window ships ALONGSIDE the reconciliation result, every time.** A pass
with a mint count of zero is reported as *no opportunity to fail*, never as a pass.
⚠️ **There is no count source that survives a restart, on either side. Do not build one** — his
words, and my `_staleSkips` reading agrees.

### 10.2 — THE INSERT-TO-GATE OFFSET IS BOUNDED, NOT MERELY OBSERVED (condition 2)
Observed on the three probes: **67, 90, 108 ms**, one-directional (understating age).
**Pre-registered bound: 150 ms.** Reported beside the estimate: the count of attempts whose `age(a)`
sits within 150 ms of `L`, i.e. every verdict the bound could flip. **Stress at ±500 ms as well; a
sign flip under either ⇒ INCONCLUSIVE, never PASS.**

### 10.3 — THE THREE ADJECTIVES, PINNED TO NUMBERS BEFORE THE DATA (condition 3)
| adjective | pinned value | why this value |
|---|---|---|
| D is "trivially small" | **n(D) < 30** | below 30 the p95 rests on fewer than two tail order statistics, so any tail claim is noise rather than evidence |
| the risk test's tail statistic | **p95 of `realized_adverse_move(a) / (budget_k × room(a))`; FALSIFIED if p95 ≥ 1.0** | the budget is a PER-ATTEMPT bound, so the ratio is the natural unit; p95 not max (one outlier tick must not decide it) and not median (the bar is about tail risk, not typical behaviour) |
| arm (c)'s "most of D" | **> 50% of D resolving σ classwide** | above half, the majority of the evidence carries no symbol-specific σ, so the aggregate cannot speak to symbol-level risk |
⛔ **These are fixed here so the verdict cannot be chosen once the distribution is visible.**

### 10.4 — THE TRADING-CALENDAR FILTER, NAMED (condition 4)
Attempts qualify only when `inserted_at` falls inside the **24/5 window: Sunday 20:00 ET to Friday
20:00 ET**. ⚠️ **Named explicitly because my own earlier refusal shares on this exact question were
weekend-contaminated — regular-hours stale clock read 14.0% and was 5.5% once the window was
enforced — and were deleted rather than corrected.** **Holidays: none in 2026-08-20 to 2026-09-02;
that span sits between Independence Day and Labor Day (2026-09-07). Stated as a calendar fact about
THIS window, not as a property of the filter, which remains holiday-blind.**

### 10.5 — DEPLOY-BOUNDARY SPLIT (condition 5, and it is my own batch that causes it)
**F-G-1 deployed 2026-08-28, mid-window, and it rounds entry and stop onto the venue tick grid — the
exact two columns `room(a)` is computed from.** ⇒ **A window straddling a deploy is TWO populations.**
Pre-registered: report D **split at 2026-08-28**, both arms separately. Pool only if
`budget_k × room` is shown immaterially changed across the boundary, and **show that rather than
assert it.**

### 10.6 — THE ONE-DIRECTIONAL PROPERTY IS A COINCIDENCE OF TWO VALUES, NOT A DESIGN GUARANTEE (condition 6)
⛔⛔ **`floor_ms` (module `mark_staleness`) and `active_fill_max_age_ms` (module
`xstock_fill_safety`) are INDEPENDENTLY SETTABLE IN DIFFERENT MODULES. They are equal at 15,000 ms
TODAY, by coincidence.** ⇒ **the "cannot tighten" guarantee in §8 INVERTS SILENTLY the first time
either knob moves, and nothing would announce it.**
⇒ **The claim is stamped with BOTH values as read on 2026-09-03, and an invariant test ships with
any mechanism built on it.** §13 disposition: **fold into the work in hand** as a registration
condition — not a new batch, no date.

---

## 11. ⛔⛔ THE CLOSE OBLIGATION — WHAT GOVERNS THE OUTCOME REGARDLESS OF THE NUMBERS

> Langston, 2026-09-03, offered explicitly as a **fresh derivation rather than a recovery** of a
> line that was truncated in transit — *"if it differs from what got cut, this version stands."*

★★ **THE CRITERIA ARE ONLY WORTH WHAT THE SESSION THAT CLOSES THE WINDOW ACTUALLY RE-READS.**

He will be **stateless** at ruling time. This document is pinned at a ref. His own `MEMORY` runs far
over its cap and **has twice carried a heading telling him a closed gate was still open** — and my
own always-loaded file did exactly that this same day, asserting a blackout option as still open
after Kyle had closed it.

⇒ ⛔ **THE OBLIGATION: at ruling time, read §10 AT THE REF — never from any memory file, mine or
his — AND STATE WHICH REF YOU READ IT AT.**
★ **That governs the outcome regardless of what the numbers come out to**, because a criterion
recalled rather than re-read is a criterion that has already drifted.

## 9. What this registration does NOT do

⛔ **It leaves entry behaviour UNGATED for this close (Langston C4).** It is a delivered
measurement, not an outcome bar, and **must never be written up as an entry-side pass.**

---

# 12. RESULT — run 2026-09-03 against the criterion above, unedited

> ⛔ **THE CRITERION WAS FIXED AND COMMITTED BEFORE THIS RAN** (`0879666fa` carries the instrument
> UNRUN; the criterion predates it). **Nothing below was chosen after seeing a number.**

## 12.1 The output

| arm | attempts | symbols | refused today | **n(D)** | D on own σ | D on classwide σ | flippable ±150 ms | flippable ±500 ms |
|---|---|---|---|---|---|---|---|---|
| pre-F-G-1 (→ 08-27) | 480 | 121 | 47 | **32** | 3 | 29 | 0 | 0 |
| post-F-G-1 (08-28 →) | 225 | 86 | 8 | **4** | 1 | 3 | 0 | 0 |
| **total** | **705** | — | **55** | **36** | **4** | **32** | **0** | **0** |

*(705 of the 709 in-window attempts survive the §10.4 trading-window filter. §10.2 is discharged
outright: **no attempt anywhere sits within 500 ms of `L`**, so the instrument's 67–108 ms
one-directional offset cannot flip a single verdict.)*

## 12.2 ⛔ THE PRE-REGISTERED VERDICT: **INCONCLUSIVE — NOT A PASS**

**§7 arm (c) trips, and not marginally: 32 of 36 attempts in D — 88.9% — rest on a CLASSWIDE σ,
against a registered threshold of 50%.** The budget is therefore not symbol-specific where it would
act, and **the risk claim has no symbol evidence under it.**

**§7 arm (a) additionally trips on the post-F-G-1 arm alone: n(D) = 4, against a registered floor
of 30.** The §10.5 deploy split was mandatory, and it leaves that arm far below the floor.

⇒ **Two independent registered arms return no-change-warranted. Kyle's standard stands by default,
which is exactly what he asked for in the absence of proof.**
★ **The §5 risk test was NOT reached, and must not be reported as passed or failed.** Arm (c) is a
gate on whether the evidence can speak at all, and it closed first.

## 12.3 ⭐ WHY IT TRIPPED — STRUCTURAL, NOT INCIDENTAL, AND THIS IS THE REAL FINDING

**My first explanation was WRONG and I am recording it because the correction is the substance.** I
expected the off-hours quoting cadence to starve the 200-observation floor. **Measured: it does
not** — 95.6% of regular-hours attempts and **62.7% of off-hours attempts** clear the floor, median
274 observations off-hours. **The session story is refuted.**

**What is actually happening is a SELECTION effect, and it is stark:**

| attempts | σ-eligible (obs ≥ 200) | median observations |
|---|---|---|
| admitted by the clock (age ≤ 15 s) | **93.5%** | 390 |
| **REFUSED (age > 15 s)** | ⛔ **9.1%** | ⛔ **43** |

⇒ ⭐⭐ **THE CONDITION THAT TRIGGERS THE REFUSAL IS THE SAME CONDITION THAT STARVES THE σ ESTIMATE.**
A symbol is refused because its feed went quiet; a quiet feed is exactly a window with too few ticks
to measure that symbol's own volatility. **So a risk-derived entry budget is structurally LEAST able
to be symbol-specific precisely on the attempts it would newly admit.** Only **5 of 55** refused
attempts carry enough of their own history to compute a symbol-specific σ at all.

⛔⛔ **A PARAGRAPH THAT STOOD HERE IS WITHDRAWN — REFUTED AT THE OBJECT BY LANGSTON AND RE-DERIVED BY
ME BEFORE STRIKING IT.** It read that *"the existing design already resists this: the classwide
fallback is the 90th percentile, so a high σ gives a small ceiling, and since `floor_ms` = `L` a
classwide σ collapses the ceiling toward the entry limit and shrinks D toward empty by
construction."* ★ **I flagged it to him as the part most worth attacking, and it did not survive.**

**MEASURED on the same rows, my own re-derivation reproducing his:**

| σ source | n(D) | raw ceiling min | raw ceiling median | at the 300 s cap | at the 15 s floor |
|---|---|---|---|---|---|
| classwide | 32 | 69,136 ms | 172,680 ms | **0** | **0** |
| own | 4 | 87,291 ms | 171,095 ms | **0** | **0** |

⇒ ⛔ **NOT ONE ROW SITS WITHIN 4.6× OF THE FLOOR, nothing is at the cap, and the classwide arm did
not shrink D — IT PRODUCED 32 OF THE 36.** Had the mechanism worked as I described, D would be
roughly the four own-σ rows.
★ **The reasoning was not circular; it was directionally right and QUANTITATIVELY IRRELEVANT.**
`ceiling = 0.5 × room / σ`, and the 90th percentile moves σ one rank-order step inside a
distribution whose product sits two orders of magnitude above the floor. **`room` is doing the work,
not σ. A percentile choice cannot be conservative when the binding point is nowhere near it.**
⛔⛔ **AN ADDITION OF MINE IS WITHDRAWN HERE TOO — IT SURVIVED LESS THAN AN HOUR.** I added that the two arms'
ceiling medians are indistinguishable (172,680 vs 171,095), reading it as *the fallback is not even
tighter in effect*. **Langston ruled the arm comparison NOT ANSWERABLE FROM THIS WINDOW AT ALL, and he is
right on three counts:** the arms are disjoint **as-assigned** populations split on the very variable in
question (`obs >= 200`); `raw = 0.5 × room / σ` has two free terms and the split holds neither, so equal
medians is **not** *no arm effect* — `sigma_classwide` is the p90 of the QUALIFYING own-σs, high and hence
tighter BY CONSTRUCTION, so equal medians on the `in_d` subsets **implies the classwide rows carry
proportionally LARGER `room`** — a statement about room, not σ; and **a median at n=4 cannot separate
*indistinguishable* from *underpowered*.**
★ **The paired form is computable — `calc` carries both σs on every row — but for the 32 thin rows own-σ
IS the value the guard declares unusable, so pairing buys a comparison against an untrustworthy
comparator.** ⇒ **Withdrawn, and not carried as support.**
✅ **What survives is arm-FREE, which is exactly why it survives: `d_at_cap` = 0, `d_at_floor` = 0, and the
4.6× distance from the floor. Those three carry *room is doing the work* on their own.**

⛔ **TWO FURTHER REASONS THE WITHDRAWN CLAIM COULD NOT HAVE STOOD, both Langston's:**
1. ⭐ **THE CLASSWIDE POOL IS DRAWN FROM THE `obs >= 200` WELL-FED SYMBOLS AND APPLIED TO THE
   STARVED ONES — §12.3's own selection effect running a SECOND time, inside the fallback.** The
   direction of that bias is unknown and unknowable from this window, *because those symbols by
   definition lack the history to check it*. ⛔ **And per `#566` — which I surfaced myself — σ sits
   in the DENOMINATOR, so an UNDERSTATED σ WIDENS the window: if thin names gap harder than the
   fed-name 90th percentile, the fallback is WIDEST on exactly the names it should refuse.**
   *"Conservative" was assumed, never established.*
2. **"Since `floor_ms` equals `L`" is a premise §10.6 of this very document marks as a COINCIDENCE
   of two independently-settable values in different modules that inverts silently.** ⛔ **A safety
   argument may not rest on it.**

★ **What survives, and Langston states it is STRENGTHENED rather than weakened by this:** the bar on
a future proposer is that a budget computed from a class-average σ must be shown to mean something
on the specific symbols it would admit.

## 12.4 What this does and does not license

✅ **Says:** on this window, a risk-derived entry budget would newly admit **at most 36 attempts out
of 705** — about two and a half per trading day — and for 89% of them the volatility term is a class
average rather than the symbol's own.
⛔ **Does NOT say** the relaxation would be harmful. **The risk test was never reached.**
⛔ **Does NOT say** the entry gate is correct as it stands. The §8 asymmetry is real and unresolved.
⛔ **And per §9 it leaves entry behaviour UNGATED for this close.** It is a delivered measurement.

★ **What a future proposer must now clear, and it is higher than before:** not merely that the
movement stayed inside the budget, but that a budget computed from a **class-average** σ means
anything on the specific symbols it would admit. **That is a harder claim than the one this batch
set out to test, and it was found by running the measurement rather than by arguing about it.**

---

## 13. ⭐⭐ THE ENTRY-SIDE GUARD, MEASURED ON A LIVE ALERT — **AND THE WHOLE-DAY NUMBER WAS A MIXTURE ARTEFACT THAT INVERTED THE FINDING**

**Langston routed alert `16500abc-16f0-47b9-ab26-62daf0ef52b5` to me on 2026-09-04T19:02:35Z with a named action:** *"confirm whether the 19.25s is re-serve cadence against a flat 15s guard or a genuine ASTS feed stall; leave active, do not ack."* ✅ **ANSWERED — and it is NEITHER of the two he offered.**

### ✅ THE EVENT IS PINNED TO 16 MILLISECONDS — NOT INFERRED, RECONSTRUCTED
⛔ **THE LOGS COULD NOT HAVE ANSWERED THIS AND I CHECKED BEFORE ASSUMING THEY COULD:** `out.log` begins **2026-09-04 19:13:11Z** (size-rotated), so the 11:43Z event is outside it; `error.log` covers from **00:00:09Z** — **1,284 lines inside the 11:4x window, so the time reach is PROVEN** — and `ASTS` appears **0 times in the whole file**, which places the block line on the `out.log` stream, now gone.
✅ **THE GUARD READS A DURABLE TABLE, NOT A LOG.** `active-dispatch.ts:75-79` — `getLatestTickAgeMs` selects `MAX(captured_at)` from **`xstock_spot_ticker_snap`**. ⇒ **the evidence survives rotation entirely.**
**RECONSTRUCTED AT THE OBJECT:** ASTS/USD's last snapshot before the raise was **`11:43:39.560Z`**; the next was **`11:44:00.060Z`** — **one gap of 20.500 s.** The alert's `triggers_at` is **`11:43:58.827Z`** ⇒ age at the raise = **19,267 ms**. The alert body states **19,251 ms**. ⇒ ✅ **Δ = 16 ms. This is that gap, and no other.**
⚠️ **AND THE ALERT'S OWN TIMESTAMPS DO NOT AGREE, BY DESIGN — READ `triggers_at`, NEVER `fired_at`:** `fired_at` is `11:48:15.134Z`, four minutes later, because `dedupe_key='xstock-stale-fill-block'` reuses one row. **A reader pinning the event from `fired_at` would have searched the wrong 20 seconds.**

### ⛔ IT IS NOT A FEED STALL — THE CONTROL IS DECISIVE
**Kyle's `#994` discriminator is feed-wide liveness: the other books are the control.** **MEASURED inside the EXACT 20.5 s gap (`11:43:39.560Z` → `11:44:00.060Z`): 124 distinct xStock symbols received 260 snapshots.** Denominator: **466 distinct symbols served in the surrounding ten minutes.** ⇒ ⛔ **The feed was demonstrably serving while ASTS was not. A class-wide stall is EXCLUDED.**

### ⛔ AND IT IS NOT THE `#951` RE-SERVE SAWTOOTH EITHER — **HIS OWN CAVEAT WAS CORRECT**
He wrote: *"the rung structure I measured (14.3/29.3/44.3/59.3 s) was on a population I have not confirmed covers ASTS — do not carry it as established."* ✅ **He was right to hold it.** ASTS's own cadence has a **hard floor at exactly 4.00 s** and a **median of 4.67 s** across **10,028 gaps today** — a ~4 s throttle, **not rungs.** ⇒ **the sawtooth does not describe this lane, and importing it would have been a wrong-object explanation that fitted the number by coincidence.**

### ⛔⛔ THE THIRD ANSWER — AND THE FIRST FIGURE I COMPUTED WAS **DOUBLE-WRONG**, IN TWO INDEPENDENT WAYS
**(1) COUNT-vs-TIME.** The naive read is *"715 of 10,028 gaps exceed 15 s = 7.13%"*. ⛔ **THAT IS THE WRONG QUANTITY.** A fill attempt lands at an arbitrary INSTANT, so the exposure is the **length-weighted** share of TIME spent in a >15 s-stale state — `Σ max(gap−15,0) / Σ gap` — **not the share of gaps.** ⇒ **9,698 s of 71,889 s = 13.49%, nearly DOUBLE the count share.** ★ **Length-biased sampling: long gaps are over-represented in what a random arrival sees, exactly because they are long.**

**(2) AND THE 13.49% IS ITSELF A MIXTURE ARTEFACT — SPLITTING BY REGIME INVERTS THE CONCLUSION:**
| regime | n gaps | p50 | p95 | max | **% of TIME older than the 15 s guard** |
|---|---|---|---|---|---|
| **RTH (13:30–20:00Z)** | 5,138 | **4.28 s** | **5.81 s** | 24.90 s | ⭐ **0.11%** |
| **off-hours** | 4,906 | 6.36 s | **27.55 s** | 153.12 s | ⛔ **19.91%** |

⇒ ⭐⭐ **THE GUARD IS ESSENTIALLY NEVER BINDING IN REGULAR HOURS AND BINDS ONE-FIFTH OF OFF-HOURS.** ⛔ **The whole-day 13.49% describes NEITHER regime and would have supported a threshold change that RTH does not need.**
⚠️ **AND THE ALERT FIRED AT 11:43:58Z — WHICH IS OFF-HOURS.** ⇒ **this event is the off-hours regime, in full.**

### ⭐⭐ WHAT THIS ACTUALLY IS: **THE BODY STATES THE CONDITION THAT MATTERS AND THE CODE NEVER TESTS IT**
The alert's own text reads: *"Routine if transient; **persistent staleness during US regular hours** indicates a feed problem."* ✅ **That qualifier is exactly right.** ⛔ **And `raiseStaleFillAlert` (`active-dispatch.ts:87-99`) has NO regime test, NO persistence test, and hard-codes `category: 'breakage'`.** ⇒ **a routine pre-market cadence tail is raised as BREAKAGE, with the correct discriminator written in prose one line above the code that ignores it.**
⇒ ⛔ **BUG TAXONOMY OUTCOME (2) — WORKING AS DESIGNED, UNADDRESSED. NOT a defect to fix unilaterally: what is missing is a DECISION.** ★ **And it is Kyle's decision already, stated: `#994` — *staleness because the US market is SHUT must not raise a breakage alert; staleness because OUR feed is impaired must.* This is that rule's first measured instance, with its discriminator (feed-wide liveness) shown WORKING on a real event.**

### ✅ AND IT CONFIRMS OBJ-9'S STANDING ANSWER RATHER THAN DISTURBING IT
**`active_fill_max_age_ms` STAYS AT 15,000 ms.** ⭐ **Now better evidenced than when I answered it: on this symbol the limit costs 0.11% of RTH time.** ⇒ **Moving it would relax a constraint that is not binding in the hours that matter, in order to quiet an off-hours symptom — which is precisely the trade Kyle ruled against.**
⚠️ **CLASS-vs-SYMBOL, STATED: my OBJ-9 re-base used a CLASS-WIDE RTH p99 of 15.07 s. ASTS's OWN whole-day p99 is 42.02 s.** ⇒ **ASTS is a wide-cadence symbol relative to its class, so a flat class-calibrated ceiling is symbol-blind by construction. That is a REAL structural point and it is NOT an argument for raising the number** — it is an argument for the alert policy, which is where it is homed.
⛔ **POPULATION LIMIT, NAMED: ONE SYMBOL, ONE DAY (2026-09-04, n=10,028 gaps). NOT a class rate. A class-wide version of this table is what `3b.f-c` owes; this is the worked instance that shows the split matters.**

### ✅ DISPOSITION
⛔ **ALERT LEFT ACTIVE AND NOT ACKED, per Langston's routing** — and the reason is now positive rather than procedural: **the row is the standing evidence for the alert-policy decision, and acking it would silence the only live instance we have.**
**DISPOSITION: folded into this row (`3b.f-c`) as the entry-side arm's worked instance.** ⛔ **NOTHING is written into `#526` — `B-VENUE-QUIET-ALERTING` is CC-B's, and the lane partition holds.**
