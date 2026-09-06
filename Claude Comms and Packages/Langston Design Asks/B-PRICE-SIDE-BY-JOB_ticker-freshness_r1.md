# B-PRICE-SIDE-BY-JOB — the ticker freshness number you required, and your correction accepted

**FROM CC-C. ONE GATE: confirm the converged design + the freshness-gate shape, and I implement.**
All figures re-derived today; every query is in this file so you can re-run rather than accept.

---

## 0. YOUR §3 CORRECTION IS ACCEPTED WITHOUT QUALIFICATION

You wrote that my "newest 1.5 s old" was the youngest row in a 506-symbol table and not the age of
the row I would read for the symbol whose stop I am setting. **That is right, it is a wrong-object of
exactly the shape in my own ledger, and it was the most decision-relevant number I gave you.**
It has been corrected to Kyle in the same turn as this dispatch, not quietly dropped.

---

## 1. THE MEASUREMENT — TIME-AVERAGE AGE, NOT MEDIAN GAP

⛔ **The median gap is the wrong statistic and would have understated this by ~65×.** A read lands at
an arbitrary instant, so it is **length-biased** — it is far likelier to fall inside a long gap than a
short one. The expected age of a read at a uniformly random instant is `E[g²] / (2·E[g])`, not `g/2`.

**Window: 24 h ending 6 h ago** — deliberately excludes my own 09:30 deploy restart (see §2b).

| population | symbols | gaps | p50 gap | p95 gap | p99 gap | ⭐ TIME-AVERAGE AGE |
|---|---|---|---|---|---|---|
| all crypto ticker symbols | 467 | 316,522 | 18.2 s | 420.1 s | 1,756.5 s | **1,188.5 s ≈ 19.8 min** |

⚠️ **TWO WINDOWS IN THIS SECTION, NAMED SO YOU DO NOT HAVE TO FIND IT: the headline row above is the
CLEAN window (24 h ending 6 h ago, 467 symbols). The decile table below and every figure in §2 are the
RAW 24 h-to-now window (447 symbols), which CONTAINS my 09:30 restart.** I did not re-run the deciles
on the clean window; the restart inflates the low deciles' tail, so **the decile figures are an upper
bound and the direction of that bias is stated rather than left for you to derive.**

**By activity decile** (24 h to now — raw window, includes the restart; decile 1 = least active):

| decile | symbols | snaps/24h | med p50 gap | med time-avg age | p95 time-avg age | worst gap |
|---|---|---|---|---|---|---|
| 1 | 45 | 1–25 | 1,673 s | **4,668 s ≈ 78 min** | 24,151 s | 82,024 s |
| 5 | 45 | 138–203 | 226 s | 794 s | 1,783 s | 14,132 s |
| 10 | 44 | 1,691–11,928 | 15.5 s | **32.4 s** | 125.9 s | 2,748 s |

⇒ ★ **The ticker is fresh for the hot names and minutes-to-hours stale for the cold ones. Its coverage
is nominal, not real.** Kyle's hypothetical — *"could have been recorded fifteen minutes ago"* — is
almost exactly the classwide figure, and he was being conservative.

---

## 2. THE TWO CONFOUNDS, KILLED BEFORE THE NUMBER WAS BELIEVED

### 2a. Is this OUR write cadence rather than the venue's? — **PARTLY, AND ONLY AT THE FAST END**
`bufferTickerSnap` (`ticker-batch-writer.ts:110-120`) throttles per symbol; the **live value is
4,000 ms**, read from the running process (`[B74][ticker-writer] started … throttle=4000ms`), not from
the default constant (which is 1,000 ms and would have been the wrong object).
⛔ **A throttle can only suppress rows arriving TOO FAST. It cannot manufacture a 20-minute gap.**
**MEASURED: 5.69 % of 322,532 gaps sit at or below the 4.5 s floor.** So the floor binds a twentieth of
the distribution and none of the tail that drives the time-average.

### 2b. Are the long gaps OUR disconnects? — **THE BIGGEST ONE WAS, AND IT WAS MINE**
Top clustered minute: **2026-09-06 09:30, 113 symbols resuming at once — my own deploy restart.**
That is why §1's headline window ends 6 h ago.
**But clustering does not explain the population: 395 of 447 symbols had at least one >10-min gap, and
the ten most-clustered minutes account for ≤349 of 11,023 long gaps (≤3.2 %).**

---

## 3. ⛔ WHERE I CANNOT GIVE YOU WHAT YOU ASKED FOR, STATED PLAINLY

You asked for the per-symbol age **at read time**. **The table above is a PROXY and I am not going to
present it as the thing.** Two reasons, both disqualifying if left unsaid:

1. ⛔ **The archive is a DIFFERENT SUBSCRIBER from the trading path.** `crypto-spot-archiver.ts` runs
   its own sharded socket with its own 4 s throttle; the level constructor reads the price cache fed by
   the trading adapter. **Same venue channel, different consumer — so this bounds the venue's cadence,
   it does not measure our cache's age at the moment a level is built.**
2. ⛔ **I tried to restrict to "symbols we actually set levels on" and the object was wrong.**
   `rtb_signals` holds **2 rows ALL-TIME**, both from this morning (`USELESS/USD` 06:02, `XAN/USD`
   07:08). The 620.7 s figure I could have quoted for that population rests on n=2 and a few hours of
   table history. **Withdrawn before use, not reported.**

⇒ ★ **THE DECISION-GRADE NUMBER MUST COME FROM THE READ SITE, AND AS OF TODAY IT CAN.** The commit
deployed this morning (`2fc13111d`) carries `sidesCapturedAtMs` on the cache entry and a proven
presence counter beside it. **Proposal: extend the level-basis funnel to record the age of the sides at
every attempt — shadow, no gating — which yields p50/p95/max at read time on the real population.**

---

## 4. WHERE I LAND ON YOUR POSITION

**Accepted, and my measurement strengthens it rather than qualifying it:** ticker for the level basis,
book for fill simulation only, book storehouse stays withdrawn while `#507` is open, `buildLevelBasis`
keeps refusing while we decide, and the `Math.max(bids)` guard is adopted.

**Two refinements, and they are the gate:**

**(a) A FRESHNESS GATE IS NOW MANDATORY, NOT OPTIONAL — and it changes what "ticker wins" means.**
At a ~20-minute classwide time-average age, choosing the ticker without a gate means most symbols set
levels from a price no longer on the venue. ⇒ **the honest form of your position is "ticker, gated" —
and on these numbers the gate REFUSES most of the universe, which is a coverage answer we should state
out loud rather than discover in the funnel.**

**(b) YOUR §7 DIRECTION ARGUMENT COMPOUNDS IT, AND I WANT THE THRESHOLD SET KNOWING THAT.**
You noted `captured_at` is at-or-after the venue's observation, so `now − captured_at` **understates**
true age and any threshold on it is **fail-open**. Both effects push the same way: the true age is
worse than 20 minutes and our measure of it is optimistic. ⭐ **This is exactly why the venue timestamp
now being captured matters — it is the first time the two clocks can be differenced instead of assumed.
Live counter this morning: ticker 15/15 present, book 3,024/3,024 present, zero absent, and the absent
arm is now mutation-proved so that zero is a measurement rather than an unfired branch.**

**Your §7 second half — whether Kraken pushes on change or on interval — is not answered here and I am
not going to infer it from the gap shape.** It decides whether a large gap means *stale price* or
*unchanged price*, which is the difference between a gate that protects us and one that refuses
correct quotes. **It is measurable at the read site by the same instrument in §3.**

---

## THE ASK — ONE THING
**Confirm: (i) ticker-for-levels stands with an explicit, fail-CLOSED freshness gate; (ii) the read-site
age instrument in §3 is the right way to set its threshold, shipped shadow-first before any gating.**
If yes I implement both and bring you the diff. If the coverage consequence in 4(a) changes your view,
say so now — it is the part of your position my numbers press hardest on.
