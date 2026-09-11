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

---

## §14 — ⭐⭐ THE CLASS-WIDE ARM `3b.f-c` OWED, MEASURED ON THE **ALERT POPULATION** *(2026-09-11, CC-C)*
> ⚠️ **RENUMBERED 2026-09-11 from `§11`** — it collided with this document's ORIGINAL `## 11.` (*THE CLOSE OBLIGATION*, above). **Commits, Langston's rulings and notes dated before 2026-09-11 cite THIS section as `§11`.** *(Enumerator blind to the heading FORM: I searched `## §N` and never saw `## N.` — `enumerator-blind-spot` n=12, the day after filing n=11.)*


> ⛔ **§10 named its own limit: *"ONE SYMBOL, ONE DAY … NOT a class rate. A class-wide version of this table is what `3b.f-c` owes."*** ✅ **This is that arm, on a different and complementary object: not the GAP population (how often the guard binds) but the ALERT population (how often it SPEAKS).**

**OBJECT:** every DISTINCT `Exit checks skipped — mark older than ceiling` alert ever recorded in `system-alerts.jsonl`, de-duplicated by `id`. **POPULATION: 204 rows, all-time, none excluded, zero unparseable timestamps.**

| | n | share |
|---|---|---|
| ⛔ **fired OUTSIDE the US cash session** (not 13:30–20:00 UTC) | **198** | **97.1%** |
| ✅ **fired INSIDE it** | **6** | **2.9%** |

**AND THE ASSET-CLASS SPLIT IS TOTAL: 67 distinct symbols in the outside group, and NOT ONE IS A CRYPTO PAIR.** *(Tested by quote-currency and against a named coin list; the crypto set returned EMPTY.)* ⇒ ⭐ **this alert class is, in practice, an xStock-only phenomenon — which is what `#994` predicts, because crypto trades 24/7 and has no "market shut" state to mistake for impairment.**

**THE FIRING-HOUR SHAPE, and it is the finding rather than decoration:** peaks at **20:00Z (32), 00:00Z (31), 21:00Z (23), 22:00Z (19)** — the hours at and after the 4pm-ET close — and **ZERO alerts in the 14:00, 15:00, 17:00, 18:00 and 19:00 hours**, the heart of the session. ★ **The distribution is not merely skewed; it is nearly disjoint from regular hours.**

### ⇒ ⭐⭐ WHAT THIS CHANGES, AND IT IS NOT "SILENCE THEM"
⛔ **THE NOISE-TO-SIGNAL RATIO IS 33:1, SO THE ALERT IS DESTROYING ITS OWN SIGNAL.** The 6 in-session fires are **the exact population the alert exists to catch** — `#994`'s *"staleness because OUR feed is impaired"* — and they are indistinguishable from 198 fires that mean *"the US market is shut,"* which is `#994`'s *"must not raise a breakage alert."*
✅ **SO THE FIX IS THE DISCRIMINATOR, NOT A THRESHOLD AND NOT A MUTE.** ⛔ **Do NOT raise `active_fill_max_age_ms` — §10 already settled that it costs 0.11% of RTH time; loosening it would relax a constraint that is not binding when it matters, to quiet an alert that fires when it does not.**
★ **AND §10 ALREADY FOUND THE CONDITION WRITTEN IN THE ALERT'S OWN TEXT AND NEVER TESTED IN CODE:** *"persistent staleness **during US regular hours** indicates a feed problem."* ⇒ **the discriminator is not a new invention — it is the qualifier the message already claims, made executable.**

### ⚠️ LIMITS, STATED
- **This measures ALERTS, not staleness.** A symbol whose feed died quietly and never crossed the ceiling is invisible here. **The gap-population arm (§10) is the other half and neither replaces the other.**
- **The 13:30–20:00 UTC window is the US CASH session and ignores holidays and half-days.** ⇒ **a handful of the 6 "inside" fires may be holiday closures, which would push the signal count DOWN, not up.** **The direction of that error is stated because it makes the 33:1 a FLOOR.**
- **`xStock trades 24/5`, so "outside the cash session" is NOT "not trading" — it is thinner trading.** ⛔ **The discriminator must therefore be feed-wide liveness (`#994`: the other ~478 books are the control), NOT a clock test.** ★ **A clock test would silence a genuine overnight feed death, which is the failure mode this whole row exists to prevent.**

---

## §14-W — ⛔⛔ **§14 IS WITHDRAWN IN FULL. EVERY NUMBER IN IT IS RETRACTED.** *(Langston, 2026-09-11; each finding re-derived by me at the object before accepting)*
> ⚠️ **RENUMBERED 2026-09-11 from `§11-W`, WITH ITS PARENT** — `§11` became `§14`, so its withdrawal became `§14-W`. **It did not itself collide: there is no original `11-W`.** Commits and notes dated before 2026-09-11 cite it as `§11-W`.


⛔ **DO NOT CITE §14 *(formerly §11)*. THE SCOPE MAY NOT CARRY ITS FIGURES.** ✅ **The DISPOSITION survives — discriminator, not a threshold, not a mute — because Kyle ruled that at `#994` and it never rested on this arm.** ★ **The arm does not survive. Langston opened Step 1 on `3b.f-c` and withdrew the evidence in the same ruling, which is the right shape: the decision was already made, and my table was not what made it.**

### THE FOUR ERRORS, EACH RE-DERIVED
| # | what I did | corrected |
|---|---|---|
| **1** | ⛔ **I binned on `fired_at`.** | **`§13` OF THIS DOCUMENT SAYS *"READ `triggers_at`, NEVER `fired_at`."*** **Re-derived: drift is NON-ZERO on 206 of 206 rows, p50 `463.8 s`, max `885.6 s`, and ZERO rows where the two agree.** It walks rows across the session boundary. |
| **2** | ⛔ **I did not apply the weekend filter.** | **35 of 206 are WEEKEND rows** — Sat/Sun UTC, outside the `Sun 20:00 ET → Fri 20:00 ET` window. **The market is not thinly traded then, it is SHUT.** |
| **3** | ⛔ **I counted one event as four.** | `AMZN`/`ETN`/`GEV`/`PWR` at `2026-08-01T16:40:07.189/.213/.232/.251Z` — **62 ms wide, identical bodies. ONE event across four books.** And **2026-08-01 was a SATURDAY.** |
| **4** | ⛔ **I treated "the ceiling" as one number.** | **It is not. Measured across the class: `300 s` on 70 rows, `15 s` on 31, and ~90 OTHER distinct values** (`177`, `206`, `273`, `148`, …) — **it is computed per symbol.** My surviving in-session candidate quotes **`ceiling 300s`, the CAP, not the 15 s floor.** |

⇒ ⛔⛔ **CORRECTED RESULT: the in-session count is NOT 6. IT IS 1 — a single event, `DD/USD`, `2026-08-05` Wed `13:35:56Z`, at the cap.** **206 rows · 35 weekend · 170 off-session inside 24/5 · 1 in-session.**

### ⛔ "33:1 IS A FLOOR" IS WITHDRAWN, AND THE DIRECTION IS UNKNOWN — NOT SMALL
**The dedupe key is per-symbol (`price-skip-paper-<sym>`) and ack is non-terminal.** ⇒ **an unresolved off-hours row SUPPRESSES that symbol's next in-session event.** ★ **That deflates the inside count, which is the side I claimed was safe.** ⛔ **I called a bias a floor without establishing its sign. The honest statement is that the suppression bias is UNMEASURED.**

### ⚠️ ONE CLAIM OF LANGSTON'S I RE-DERIVED AND MUST CORRECT — IT DOES NOT RESCUE ANYTHING OF MINE
**He wrote: *"there is no `resurface_count` field on these rows at all."*** ⛔ **Measured: it is present on 99 of 206 rows, alongside `last_resurfaced_at` on the same 99.** ✅ **His underlying point stands and is the one that matters: my `229` summed the field where present and silently scored ABSENT AS ZERO, so it was a LOWER BOUND presented as a total.** ⇒ **we were wrong in opposite directions about the same field, and the number is unusable either way.**

### ★★ THE PART THAT IS WORSE THAN THE ARITHMETIC
⛔ **`§10.4` OF THIS VERY DOCUMENT IS THE WEEKEND FILTER, AND IT EXISTS *BECAUSE I MADE THIS EXACT ERROR BEFORE*** — the earlier refusal shares were weekend-contaminated, `14.0%` → `5.5%`, **and were deleted rather than corrected.** ⇒ ★ **I re-committed a registered error against a filter registered in the same file, four sections below where I was writing.** ⚠️ **My own working memory carries the line *"the refusal shares once here were weekend-contaminated"* — I had the warning, in two places, and did not apply it.**
✅ **WHAT THE NEXT ARM MUST DO, AS A CHECKLIST RATHER THAN AN INTENTION:** read `triggers_at` · drop weekend rows · collapse fires within ~2 s into one event · **split by ceiling regime (`15 s` floor / computed / `300 s` cap) because they are different mechanisms** · state the suppression bias as unmeasured.

---

## §15 — ⭐⭐ STEP-1 EXISTENCE CHECK ON `3b.f-c`: **THE DISCRIMINATOR ALREADY EXISTS, IS ALREADY LANGSTON-RULED, AND IS DELIBERATELY SWITCHED OFF BEHIND A NAMED PREREQUISITE** *(2026-09-11, CC-C)*
> ⚠️ **RENUMBERED 2026-09-11 from `§12`** — it collided with this document's ORIGINAL `# 12.` (*RESULT — run 2026-09-03*, above). **Commits and notes dated before 2026-09-11 cite THIS section as `§12`** — ⛔ **but a `§12` citation naming the 2026-09-03 result, or any `§12.x` subsection, means the ORIGINAL.**


⛔⛔ **I WAS ONE STEP FROM SCOPING A BATCH TO BUILD SOMETHING THAT IS ALREADY BUILT. THIS IS `#1025` EXACTLY, AND ONLY THE STEP-1 *"DOES IT ALREADY EXIST"* CHECK CAUGHT IT.**

**FOUND AT THE OBJECT, repo-wide, tests excluded:**
| | |
|---|---|
| **the mechanism exists** | `feedStubFraction` / `feedCohortN` are **typed, threaded and CONSUMED** — `book-state.ts:165-166` reads them, `:254` branches on `feedStub >= cfg.feedStubFractionF` |
| **it is database-governed** | `book-state-config.ts:36-38` binds `feed_stub_fraction_f`, `feed_stub_window_ms`, `feed_cohort_floor` |
| ⛔ **its only producer passes a hardcoded `null`** | `book-state-tracker.ts:211-212` |
| ✅ **and the code states WHY, in its own words** | *"Candidate (ii) is INERT by knob (`feed_read_enabled = 0`) until F4's re-measure lands; the cohort read is wired then, on the guard's own telemetry — not stubbed here."* |

✅✅ **AND IT IS ALREADY GOVERNED, NOT MERELY PRESENT.** `B_XSTOCK_FEED_SANITY_PROGRESS_REPORT:75`: *"Candidate (ii), the feed-health read, is INERT by knob … until its fraction is re-measured on the guard's own first-week telemetry (**F4**). **Langston ruled it admissible as instrument health, not a second venue; Kyle may overturn** (told 2026-09-02)."*

### ⇒ ⭐ WHAT `3b.f-c` ACTUALLY IS, AND IT IS MUCH SMALLER THAN WHAT I WAS ABOUT TO PROPOSE
⛔ **NOT *"design and build a feed-wide discriminator."*** **That work is done, reviewed and merged; it is switched off behind ONE named gate.**
✅ **IT IS: RUN `F4`'s PRE-REGISTERED RE-MEASURE on the guard's own telemetry, and if it supports the fraction, TURN THE KNOB ON.** ★ **The thing that separates *"the market is shut"* from *"our feed is impaired"* — `#994`'s discriminator — is `feed_cohort_floor` plus `feed_stub_fraction_f`, sitting in the database with a producer feeding it `null`.**
⚠️ **RIPENESS NOT ASSERTED: `F4` says *first-week* telemetry and the guard deployed after 2026-09-07, so roughly four days exist as of today. WHETHER F4 CAN RUN YET IS OBJECTIVE 1, NOT AN ASSUMPTION.** ⛔ **I am not declaring the window ripe to make my own scope shorter.**
⚠️ **AND `#943` IS STILL OPEN in its observation window, so this is work INSIDE an open batch, not a fresh one** — §9.4 disposition 1 or 2, for Langston to settle, not me.

### ★ THE STEP-1 LESSON, RECORDED BECAUSE IT IS THE SECOND TIME IN THREE DAYS
⛔ **`#1025`: I proposed building a push-guard exemption that already existed. Here I was about to propose building a discriminator that already exists.** ⇒ ★ **BOTH TIMES THE TRIGGER WAS A SYMPTOM I HAD MEASURED MYSELF, AND THE MEASUREMENT'S VIVIDNESS IS WHAT SUBSTITUTED FOR THE EXISTENCE CHECK.** ✅ **A big number feels like a mandate to build. It is not — it is a reason to go and look first.**

---

## §16 — ⭐ THE 2026-09-11 NEWMONT HOLLOW-BOOK FIRE, CLASSIFIED *(Langston routed alert `0c9687e2` here; re-derived by CC-C, NOT ruled on his triage)*
> ⚠️ **NUMBERED `§13` FOR A FEW MINUTES WHILE UNCOMMITTED, THEN RENUMBERED 2026-09-11** — it collided with this document's ORIGINAL `## 13.` (*THE ENTRY-SIDE GUARD*, above). ⛔ **It was never committed or cited as `§13`: EVERY existing `§13` citation to this document — including Langston's *"§13 of your own document"* and `§14-W` row 1 — means the ORIGINAL `## 13.`, not this section.**


**THE EVENT.** `0c9687e2`, `triggers_at 2026-09-11T06:21:02Z` — a **Friday**, inside the 24/5 window, **not** a weekend row. `bid_collapsed`: bid `124.00` / ask `125.97` / last `125.94`, `priorBid 125.80`, `spreadFrac` 1.58% against a trailing median of 0.135%. Guard withheld 60 ticks, then yielded at the cap.
⛔ **LEFT ACTIVE AND UNACKED, per Langston:** it is `#943` window evidence.

**EXPOSURE, re-derived at `active_open_positions`:** NEM/USD is **2.76% above its `122.1768` stop**, −0.70% unrealised, mark 1 s old. **The collapsed `124.00` bid was still 1.49% above the stop.** All three xStock positions are ≥2.5% clear (NEM 2.76 · CRWD 3.44 · MDB 5.83). ⇒ **nothing was at risk.**

### ⭐ THE QUESTION LANGSTON SAID ONE EPISODE COULD NOT ANSWER — AND THE RAW QUOTES ANSWER IT
**His framing:** *"either the last resting order in an empty overnight book or a quote that stopped updating — I can't separate those two from one episode."* **His description:** the bid *"held at exactly $124.00 to the penny for about seven minutes."*
✅ **RE-DERIVED from `xstock_spot_ticker_snap_2026_09_11`: the bid did NOT simply sit. It DROPPED to exactly `124.00` FOUR times and RECOVERED from the first three — the fourth drop is the one that stuck.** *(Corrected 2026-09-11: first written as "snapped to 124.00 and back four times". The table below always showed three recoveries. The conclusion does not change: a quote that has stopped updating cannot recover even once.)*
| moment | bid |
|---|---|
| `06:15:13` | **124.00** → `06:15:57` back to **125.37** |
| `06:16:33` | **124.00** → `06:16:38` back to **125.48** |
| `06:17:41` | **124.00** → `06:18:19` back to **125.42** |
| `06:18:31` → `06:24:18` | **124.00 pinned** (~6 min); `124.04` at `06:25:00` |

⇒ ⛔ **A QUOTE THAT HAS STOPPED UPDATING CANNOT RETURN TO 125.37, 125.48 AND 125.42 AND THEN DROP BACK.** The bid updated repeatedly. ⇒ ★ **Consistent with a REAL resting `$124.00` order becoming the best bid whenever the nearer bids cancel — GENUINE OVERNIGHT THINNESS, not a stuck feed.**
✅ **PRECONDITION VERIFIED — EXACTLY ONE LIVE WRITER.** `bufferTickerSnap` callers: `crypto-spot-archiver.ts:124` (crypto_spot), **`equity-spot-archiver.ts:184` (xstock_spot)**, `kraken-futures-archiver.ts:127` (the perp legs). The ticker writer routes `xstock_spot → xstockSpotTickerSnap`. **No raw insert path found for the pattern searched.** ⇒ **the alternation is the book, not two sources interleaving** — which would have meant the opposite.
⚠️ **NOT RULED OUT, AND STATED RATHER THAN CHASED:** different Kraken frame kinds landing in the same table through that ONE writer.

### THE BOOK DID NOT RECOVER
| phase | snapshots | median spread | distinct bids | distinct asks |
|---|---|---|---|---|
| before, `05:40`–`06:10` | 361 | **0.2476%** | 39 | 31 |
| episode, `06:10`–`06:30` | 70 | 0.4615% | 22 | 14 |
| after, `06:30`–`06:35` | 9 | **2.1217%** | **2** | **2** |

⇒ **spread 8.6× wider, snapshot rate ~6× lower, two price levels each side.** A book thinning further as the night deepens (`06:30Z` = 02:30 ET).

### ⭐ "4 OF THE LAST 6 FIRES ARE NEWMONT" — TRUE ON RAW IDS; **3 OF 6** AFTER THE FILTER I WAS CORRECTED FOR IN §14-W
**The hollow-book family, all-time, ordered by `triggers_at` (not `fired_at`): 8 distinct ids.** On raw ids the last six hold **4** Newmont.
⛔ **BUT `2026-09-05T00:16:31Z` IS A SATURDAY, AND IT CARRIES NEWMONT *AND* SILVER AT THE SAME INSTANT** — one event across two books, 16 minutes after the Friday close, **when the market is shut.** That is `#994`'s market-closed class, not a Newmont book problem.
⇒ **Weekend excluded and collapsed to events: Newmont is 3 of the last 6 weekday events.**
★ **STILL DISPROPORTIONATE — one symbol, half the events — so Langston's question stands.** ✅ **And Newmont's fires hit BOTH SIDES** (`bid_collapsed` and `ask_spiked`), which fits a book thin on both sides better than a one-sided stuck feed.
⇒ **WORKING ANSWER, NOT A CAUSE:** Newmont may simply carry the thinnest overnight book among our holdings. **What would test it:** per-symbol overnight median spread and snapshot rate across every held xStock, same window. **Not run here.**

### ➕ §16 AMENDMENT 2026-09-11 — LANGSTON RE-DERIVED IT AND FOUND A STRONGER INSTRUMENT; THE GAP INSIDE THE PIN IS NOW ESTABLISHED AS A GENUINE NEWMONT FRAME DROUGHT
**The stronger instrument (Langston; re-derived by CC-C at `xstock_spot_ticker_snap_2026_09_11`):** during the `$124.00` pin, `bid_qty` moved 106 → **108** (06:23:47) → 106 → 109 (06:25:00); `ask_qty` moved 220 → **140** (06:19:06); `last` moved 125.42 → 125.80 → 125.81 → 125.94. ⇒ **the feed was live DURING the pin, not only around it. A stuck quote is ruled out, not merely unlikely.**
**Magnitude, corrected:** the pin was observed **6 times over 5m47s** (06:18:31 → 06:24:18) with a **249-second observation hole, 06:19:38 → 06:23:47.** *(Langston withdrew his own "about seven minutes"; the "~6 min" above is the span, not continuous observation.)*

⛔⛔ **THE HOLE IS A GENUINE NEWMONT FRAME DROUGHT — NOT A WRITE STALL AND NOT WRITE LOSS. "Not lost" did not by itself establish "no frames arrived": a TRANSIENT failure retains rows and writes them late, which would open this gap IF the timestamp were stamped at write time. Three legs, each measured:**
| leg | measured |
|---|---|
| **the stamp is CAPTURE time** | `parseTickerSnap` buffers `capturedAt: new Date()`; the `ticker_snap` schema column has **no default**; `ticker-batch-writer.ts:138` is a plain insert with no `NOW()` override ⇒ a late write keeps its capture stamp and **cannot** open a gap |
| **the writer never stalled** | **84** `[B74][ticker-writer] xstock_spot flushed` lines in 06:18–06:25, **max gap between flushes 5 s**, none over 6 s |
| **no write failure of any kind** | **0** TRANSIENT, **0** PERMANENT, **0** SHED in 06:15–06:30 — control: **2,187** `error.log` lines in that window; all three of the ticker writer's failure wordings are visible to the search |

⇒ ✅ **other xStock symbols kept flowing; NO Newmont ticker frame was captured for 249 s, on an open position, 51 s inside the 300 s cap, so nothing skipped.** A 249 s gap cannot be the per-symbol snapshot throttle.
⚠️ **Caveat, Langston's and kept:** this is the throttled ARCHIVE, not the in-memory mark (`aee:1164`). ⇒ **this is `3b.f-c`'s own question — how long a mark stays trusted on a quiet symbol — arriving as live data.**

⭐ **"THINNEST OVERNIGHT BOOK" ANSWERS HALF THE POPULATION (Langston).** In ET the six weekday events split **3 / 3**: 09-03 16:16 LI · 09-03 16:32 ARKK · 09-08 16:16 NEM — **just after the cash close** — and 09-08 04:59 NEM · 09-09 04:24 LMT · 09-11 02:21 NEM — **overnight.** ⇒ **the per-symbol spread and snapshot-rate test must run in BOTH bands, or it answers for one cluster.** The 16:16–16:32 ET alignment is flagged as a pattern, not a root: at n=8 it could be a market clock or a scheduler phase.
