# T-W20C-SCALAR-LEG — THE OLD SAMPLER'S HISTOGRAM (CC-B, 2026-09-13)

Langston's adoption condition 1: *"The histogram still runs, on the OLD sample. The fix does not
retroactively make anything already characterised on the id-space sample sound. It is no longer a
gate on the new design — it is the record of what the old one did."*

This is that record. **Population:** `signal_eval_provenance ⋈ signal_eval_archive`,
`asset_class='xstock_spot'`, `strategy='vwap_pullback'`,
`captured_at ∈ [2026-08-01T00:00:00Z, 2026-09-11T20:09:47Z)`, `reject_stage='strategy_internal'`
(the no-fire arm). **Denominator: 2,014,902 rows over 34 days present.**

---

## 1. THE STRIDE IS NOT THE SKEW — IT IS UNIFORM

| measure | value |
|---|---|
| realised stride rate, overall | **0.1259 %** |
| theoretical `1/797` | **0.1255 %** |
| per-day rate, days with >1000 rows (n=30) | min **0.107 %**, max **0.159 %**, spread **0.052 pp** |

⇒ **`(archive_id % 797) = 0` selects uniformly across days.** My r1 framing blamed the stride; that
was wrong, and so was calling it "arbitrary". The id-space filter behaves exactly as a stride should.

---

## 2. THE SKEW IS REAL, AND IT IS THE BARE `LIMIT` — LANGSTON'S HYPOTHESIS, CONFIRMED

He wrote: *"On a monthly-partitioned table a bare LIMIT plausibly drains the earliest partition first
— i.e. August-heavy, possibly zero September, a directional skew, not noise."*

**It is not August-heavy. It is September-ABSENT.**

**Step 1 — the pool the `LIMIT` draws from, after the stride:**

| | stride-selected rows |
|---|---|
| August | **2,032** |
| September | **505** |
| total | **2,537** |

**Step 2 — the cap, read at the ref** (`scripts/b5-w20c-provenance-replay.ts:45`, `:158`, `:186`):
`SAMPLE_CAP = 3000`, `half = 1500`, no-fire `LIMIT = SAMPLE_CAP − min(half, fired.length)`. The fired
population is 114,689 on the join, so `fired.length` saturates at `half` ⇒ **the no-fire `LIMIT` is
exactly 1,500.**

**Step 3 — the scan order, from `EXPLAIN` rather than assumed:**

```
Limit  (cost=0.56..548.44 rows=1500 width=28)
  ->  Nested Loop
        ->  Append
              ->  Seq Scan on signal_eval_provenance_2026_08   <-- FIRST
              ->  Seq Scan on signal_eval_provenance_2026_09
              ->  Bitmap Heap Scan on ..._2026_10 / _11 / _12 / 2027_01
```

`Append` emits its children in order and `Limit` stops as soon as it is satisfied.

⇒ **1,500 < 2,032, so the `LIMIT` is satisfied entirely inside the August partition. Every W20C
replay run to date has had a no-fire arm that is 100 % August and 0 % September, by construction.**

| `LIMIT` | August | September |
|---|---|---|
| 500 | 100.0 % | 0.0 % |
| 1,000 | 100.0 % | 0.0 % |
| **1,500 (actual)** | **100.0 %** | **0.0 %** |
| 2,032 | 100.0 % | 0.0 % |
| 2,537 (whole pool) | 80.1 % | 19.9 % |

⚠️ **Limits of this instrument, stated:** `EXPLAIN` without `ANALYZE` shows the chosen plan, not a
executed one; the `rows=8816` August estimate is the planner's and the actual is 2,032. What the plan
establishes is the **Append ORDER**, which is structural rather than an estimate, and the conclusion
rests on the actual counts, not the estimates. The plan is serial — no `Gather` node — so no parallel
reordering applies. Also: the harness's arms carry **no upper time bound** (`captured_at >= $3` only),
so later partitions are scanned too; they sort after August and cannot change the result.

### WHY THIS COMPOUNDS THE IDENTIFICATION PROBLEM

The era strata (r2) put August entirely in the **highest code-distance** bands — E1 (123 commits
newer), E2 (83), and the first days of E3. ⇒ **every no-fire comparison made to date was drawn from
the oldest, most code-drifted rows in the window, and from no others.** The sampling defect and the
identification defect point the same way.

---

## 3. THE WEEKEND SIGNATURE — independent corroboration of the 08-03 boundary

Every Saturday and Sunday in the window, from the same histogram:

```
2026-08-01 Sat ABSENT     2026-08-16 Sun ABSENT     2026-08-30 Sun 5 rows
2026-08-02 Sun ABSENT     2026-08-22 Sat 21 rows    2026-09-05 Sat 36 rows
2026-08-08 Sat ABSENT     2026-08-23 Sun 5 rows     2026-09-06 Sun ABSENT
2026-08-09 Sun ABSENT     2026-08-29 Sat ABSENT
2026-08-15 Sat ABSENT
```

Against weekday counts of 24,492–104,478. **All twelve weekend days are absent or near-zero.**

⇒ the 08-03 start is the **Monday after a weekend**, not a producer-era boundary — now corroborated
by six further weekends in the same series, independent of the calendar argument and of the
code-absence argument. `CLAUDE.md` rule 17: xStock trades 24/5, off Friday close to Sunday open.

---

## 4. ROW DENSITY — the thing a bare `LIMIT` rides

| | rows | days | mean/day |
|---|---|---|---|
| August | 1,609,769 | 24 | 67,073 |
| September | 405,133 | 10 | 40,513 |

**August is 79.9 % of the corpus.** Any selection that walks partitions in order and stops early
inherits that imbalance before the stride has any say in it.
