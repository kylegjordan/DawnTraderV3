# T-W20C-SCALAR-LEG — ARM SELECTION + ERA AXIS, r2 (CC-B, 2026-09-13)

Supersedes the r1 arm-selection sketch. Answers Langston's four adoption conditions, his design
ruling (era axis), his upper-bound correction, and his two own measurements.

---

## 1. THE REWRITE — one dedup rule, per-cell rank-space stride

```sql
WITH win AS (           -- join + window predicate only
  SELECT p.archive_id, p.symbol, p.captured_at, b.reject_stage,
         date_trunc('minute', p.captured_at) AS minute
    FROM signal_eval_provenance p
    JOIN signal_eval_archive b
      ON b.id = p.archive_id AND b.captured_at = p.captured_at
   WHERE p.asset_class = $1 AND p.strategy = $2
     AND p.captured_at >= $3 AND p.captured_at < $4
),
deduped AS (            -- ONE dedup rule, applied to BOTH arms (BLOCKER-2)
  SELECT DISTINCT ON (arm, symbol, minute)
         CASE WHEN reject_stage = 'strategy_internal' THEN 'no_fire' ELSE 'fired' END AS arm,
         symbol, minute, archive_id, captured_at, reject_stage
    FROM win
   ORDER BY arm, symbol, minute, captured_at DESC, archive_id DESC
),
ranked AS (             -- order + stride OUTSIDE the dedup (BLOCKER-1)
  SELECT *,
         row_number() OVER (PARTITION BY arm, era ORDER BY captured_at, archive_id) AS rn,
         count(*)     OVER (PARTITION BY arm, era) AS cell_n
    FROM (SELECT *, <era expression> AS era FROM deduped) d
)
SELECT * FROM ranked
 WHERE rn % GREATEST(1, (cell_n / $5)) = 1      -- $5 = target n PER (arm, era) cell
 ORDER BY arm, era, rn;
```

`DISTINCT ON` leads its own `ORDER BY` with its key expressions, which is what Postgres requires;
the tie-break is explicit. Ordering and striding happen outside the dedup, on
`(captured_at, archive_id)`, because `captured_at` alone is not a total order here.

### CONDITION 2 — what uniform-in-rank buys, stated plainly

**Equal probability PER ROW. Not equal coverage PER DAY.** A globally rank-uniform sample weights
periods by row density, so a dense period contributes proportionally more rows. That is the correct
property for a per-row estimand and the WRONG one for anything read per-day — which is exactly why
condition 3 and the era axis are not optional decoration.

### CONDITION 3 — stride per (arm × era), fractions published per cell

⛔ **A single global stride constant is refused by the data.** Measured on the join over the pinned
window: `strategy_internal` **2,014,902** against **114,689** for all other stages combined —
**17.6 : 1**. One constant gives two wildly unbalanced n and a pooled statistic weighted by a stride
accident.

⇒ the stride divisor is computed **per cell** from that cell's own `cell_n`, and every run publishes
the **realised sampling fraction per cell with its denominator** — `n_sampled / cell_n`, never a
bare n.

### CONDITION 4 — it is a mechanism claim, so 29(c): cite the line and MUTATION-PROVE it

The stride is one line: `WHERE rn % GREATEST(1, (cell_n / $5)) = 1`, above.

**MUTATION, pre-registered here before the run:** neuter it to `WHERE true` and show the per-day
histogram MOVES. **Expected direction, stated in advance:** neutering must shift day-shares toward
the densest days. A stride that cannot be broken is a stride that has not been tested.

---

## 2. THE ERA AXIS — the identifying assumption, repaired

Langston's ruling accepted: the census broke the **identifying assumption**, not the
pre-registration, and no pre-registration rescues an unidentified contrast. The confound is a
function of **the row's age** — a 09-11 row was produced by near-today's code, an 08-06 row by 163
commits back.

⛔ **THERE IS NO DEPLOY HISTORY TO STRATIFY ON.** `dt-deploy` writes
`/home/deploy/dawntrader-deploy.record` with `cat > "$RECORD"` — it **overwrites**, so only the
latest deploy survives. Neither table carries a build sha (`signal_eval_provenance` has
`constants_hash`, which tracks governed constants, not code). So the axis is built from the census
itself.

**CODE DISTANCE** = the number of closure-touching commits landing between a row's `captured_at`
and the replay's own code. Derived from the 163 commit timestamps committed at `bed70e7e8`:

| stratum | capture range (UTC) | code newer by |
|---|---|---|
| **E1** | 2026-08-01T00:00:00Z .. 2026-08-20T21:54:51Z | **123 commits** |
| **E2** | .. 2026-08-28T11:58:09Z | **83 commits** |
| **E3** | .. 2026-09-04T06:42:25Z | **42 commits** |
| **E4** | .. 2026-09-11T20:09:47Z | **0 commits** |

**THE TEST:** divergence must hold the **same sign across all four strata**. Flat across eras ⇒ code
movement is not driving it and the leg is identified. Rising with code distance ⇒ it is, and we have
measured the confound rather than assumed it away.

⚠️ **THE AXIS'S OWN LIMIT, stated because it runs against me:** commit time is a proxy for deploy
time, and a commit is live only once deployed. A row captured inside the deploy lag was produced by
code WITHOUT that commit, while this measure counts it as already in — so **code distance is an
UNDER-estimate for rows in the lag window.** Observed lags on the drift alerts run 4–17 h. That does
not disturb the monotone ordering of the four strata (123 / 83 / 42 / 0), which is what the
same-sign test rests on, but it does mean each boundary is soft to about a day.

---

## 3. ACCEPTED CORRECTIONS

**73 of 254 is an UPPER BOUND, not "the surface."** `tsc --listFiles` is compile-time reach; the
question is which changed lines EXECUTE. The narrowing instrument is coverage on a real replay run —
the executed-line set intersected with the 321 file-touches — not a grep. I gave the empty grep no
weight and still do.

**My 08-03 "retention floor" — WITHDRAWN, and he was right to test it.** He measured
`signal_eval_archive_2026_08` holding 1,651,245 rows on 08-01 and 1,774,127 on 08-02, so there is no
left-truncation and the gap is slice-specific.

✅ **What it actually is: THE WEEKEND. 2026-08-01 was a Saturday and 08-02 a Sunday; 08-03 is the
Monday.** xStock trades 24/5, off Friday close to Sunday open (`CLAUDE.md` rule 17). It is a
**calendar** boundary, not a producer-era one.

**Corroborated at the code, not only the calendar:** no commit touches
`server/asset_classes/xstock_spot/`, `strategy-engine.ts`, `signal-eval-archiver.ts`,
`market-scanner.ts` or `universe-loader.ts` anywhere in 2026-07-28 .. 2026-08-05. **Instrument
controlled:** the same command over 2026-08-01 .. 2026-09-11 returns **26** for
`signal-orchestrator.ts`, so the zero is the world and not the tool.

⇒ **the pin start stays 2026-08-01T00:00:00Z**; the first xStock row simply falls on the Monday.

---

## 4. STILL OWED — the join-loss count, per arm

Not yet published, and it is load-bearing exactly as he says: the harness join is **INNER**, so it
drops silently, and that is precisely where NULLs the archive lacks could hide. `admitted` is the
smallest and most decision-bearing stratum (**566** on the join) — an unexplained loss there is not
a rounding detail.

Owed per arm: rows-in-archive vs rows-surviving-the-join, with LEFT vs INNER stated. ⚠️ **The
archive-side counts must be cut at the SAME pin end to be comparable** — my earlier September figure
was a whole-partition count and is **not** a valid comparator.

---

## 5. §13 — `scripts/**` SITS IN NO COMPILATION GRAPH

Confirmed by enumerating every tracked `tsconfig*.json`: `tsconfig.json` includes only
`client/src/**`, `shared/**` and `server/**`; `server/tsconfig.json` is rooted at `server/`.
**38 tracked TypeScript files under `scripts/` are graded by nothing** — the tsc baseline gate has
never covered them.

> `HOME: B-SCRIPTS-TSC-COVERAGE, owner CC-B, placed in PHASE_19_PLAN.md at row 2.4-FEE-e, after 2.4-FEE-d B-FILTER-DIAG-XSTOCK`

Not this leg's to carry, and not absorbed into it.
