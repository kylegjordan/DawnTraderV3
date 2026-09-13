# INCIDENT — CC-B's ANALYTICAL QUERIES EXHAUSTED THE LIVE CONNECTION POOL AND DROPPED MARKET DATA

**2026-09-13 · CC-B · alert `fbebd936-a3ca-4133-966a-12269c250a7c` (critical) · `#1062`**

⛔ **CAUSE WAS MINE.** Not a defect in the ticker writer. This is the record the alert's
`--evidence` points at.

---

## 1. WHAT HAPPENED

While investigating the target-gate finding I ran a series of heavy analytical queries against the
**live staging database** — several of 8–15 minutes, some concurrently, several planned with parallel
workers, scanning `signal_eval_archive`, `signal_eval_provenance`, `vts_open_trades` and
`crypto_spot_ohlc_1m` across multi-week windows.

That exhausted the connection pool the live writers depend on.

## 2. THE EVIDENCE IT WAS CONTENTION, NOT THE WRITER

Every failure line names the pool, not the table:

```
11:00:09  [B74][ticker-writer]  crypto_perp PERMANENT flush failure (202 rows dropped, NOT retried): Query read timeout
10:59:18  [B74][ticker-writer]  crypto_perp TRANSIENT (90 rows RETAINED,  buffer=177): ticker-batch-writer: pool slot timeout (5s)
10:59:23  [B74][ticker-writer]  crypto_perp TRANSIENT (177 rows RETAINED, buffer=271): ticker-batch-writer: pool slot timeout (5s)
11:01:27  [B74][batch-writer]   crypto_spot TRANSIENT (26 rows RETAINED,  buffer=75):  ohlc-batch-writer:   pool slot timeout (5s)
11:01:27  [B74][batch-writer]   crypto_perp TRANSIENT (34 rows RETAINED,  buffer=68):  ohlc-batch-writer:   pool slot timeout (5s)
11:01:28  [B70][ARCH] flush failed table='signal_eval_archive' (28 rows dropped): Query read timeout
```

⭐ **THE DISCRIMINATOR: it was POOL-WIDE, not writer-specific.** Three independent writers — the
ticker writer, the OHLC writer and the signal-eval archiver — failed in the same seconds with the same
error class, across `crypto_perp`, `crypto_spot` and `xstock_perp`. A fault in the alerting writer
could not do that.

**Loss: 202 ticker rows + 28 signal-eval rows discarded** (classified permanent ⇒ not retried).

## 3. RECOVERY — VERIFIED BY PRESENCE, NOT SILENCE

- Every query of mine cancelled 11:05–11:11; `pg_stat_activity` returned **zero** rows for them after.
- **Zero** `pool slot timeout` / `PERMANENT flush` lines after **11:01:28**. ✅ **Instrument proven**:
  the same grep returned 8 hits in the preceding minutes, so its silence carries information.
- ✅ **Presence evidence:** newest `crypto_perp_ticker_snap` row at **11:12:12.746Z**, lag **1.29 s** —
  data flowing normally, not merely "no errors".

## 4. WHAT I SHOULD HAVE DONE, AND THE STANDING CHANGE

⛔ **I never considered pool contention before the first ten-minute query.** The database is not an
analysis warehouse — it is the thing the live system writes to, and a long read starves it.

**Standing, for me and worth adopting crew-wide:**
1. **No unbounded scans against the live database.** Bound by partition or by a short window.
2. **Serially, never concurrently.** I had two multi-minute queries plus a probe in flight at once.
3. **`SET statement_timeout` low** — I used 900–1700 s, which let a single query hold a slot for a
   quarter of an hour. Minutes, not hours.
4. **Full-history work goes to exported data**, not the running system. The B70 export path exists.
5. ⚠️ **A "read-only" query is not harmless.** It consumes the scarce resource — a pool slot — that
   writes need. Nothing in my head flagged reads as risky, and that is the gap.

## 4b. ⚠️ ATTRIBUTION — "CAUSE WAS MINE" IS STRONGER THAN WHAT I MEASURED

**Amended 2026-09-13, after CC-C independently claimed the same incident and then retracted**, saying
my account was better evidenced. **That retraction does not make my attribution measured, and I am
not going to let a self-blame claim stand on weaker evidence than I would demand of any other claim.**

✅ **WHAT IS MEASURED:** my queries were running during the failure window; the failures name pool
exhaustion; killing my queries was followed by recovery. **That is strong causal evidence for a
CONTRIBUTION and it is sufficient to own the incident.**

⛔ **WHAT IS NOT MEASURED, and I did not check at the time:** the per-session share of pool
consumption. I read `pg_stat_activity` several times during the window and saw my own queries plus
ordinary app traffic, but **a snapshot is not the window**, I did not record those reads as evidence,
and I never enumerated other sessions' load. **CC-C believed theirs contributed, which is at least
evidence that mine was not obviously the only analytical load on the box.**

⇒ **THE HONEST STATEMENT: my queries were a MAJOR and probably the DOMINANT contributor, on timing
and on the recovery-after-kill. "Sole cause" is not established and is withdrawn.** The standing
change in §4 is unaffected — it is correct whether my share was 100 % or 60 %.

⭐ **AND THE CREW-WIDE VERSION IS STRONGER THAN THE PERSONAL ONE:** if two sessions can each
plausibly believe they caused the same pool exhaustion, then **nothing attributes analytical load to a
session**, and the next occurrence will be argued the same way. **A per-session `application_name` on
analytical connections would settle attribution at the object instead of by recollection.**

## 4c. CC-C's OWN MEASUREMENT — recorded because it is evidence I did not have

CC-C claimed this incident to Kyle **~10 minutes before I filed**, then withdrew in my favour. Their
stated basis, quoted so it is not lost with the retraction:

> *"my storage queries were in the same window and the failure rate was **58 in those fifteen minutes
> against a background of two**."*

✅ **That is a RATE with a baseline — a better-shaped measurement than anything in my own account**,
which rests on timing plus recovery-after-kill. It does not identify WHOSE load, because neither of us
can attribute a pool slot to a session (§4b). **What it establishes is the magnitude of the excursion:
~29× the background failure rate during a window in which BOTH of us had analytical queries running.**

⇒ **This corroborates §4b rather than reopening ownership.** I hold the incident; the honest causal
statement remains **major and probably dominant contributor, sole cause withdrawn**. Two sessions each
independently believing they caused it, on non-overlapping evidence, is the attribution gap — not a
dispute to be settled by whoever writes the record first.

## 5. HONEST NOTE ON THE FINDINGS THIS RAN ALONGSIDE

⛔ **None of the target-gate findings depend on the contended queries**, and this incident does not
launder them:
- the floor/ceiling arithmetic is over **two constants and one function**, re-derived independently by
  Langston at `9ec641072`;
- the zero-live-admissions result for `strong_bull_trend` and `vwap_pullback` came from a **single
  daily partition** (2026-09-12), a small bounded read;
- the `ABCD` enum defect is read from the enum itself plus the error log.

⚠️ **What IS affected:** the all-strategy target curve was killed mid-run and has **no result**. It is
not reported anywhere and must be re-run against exported data.
