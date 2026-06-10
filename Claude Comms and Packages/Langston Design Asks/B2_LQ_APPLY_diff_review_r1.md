# B.2 LQ APPLY — Step-4 diff review (recheck evidence + apply migration)

> INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo.
> Everything you need is embedded below. For any repo-side inspection beyond the embedded SQL use
> `ssh staging 'cd /home/deploy/dawntrader && git ...'` (the commit is NOT pushed yet — this review
> gates the push, per workflow Step 4).

## 1. The recheck (the apply precondition you set: >= 5 true-RTH sessions)

Run 2026-06-10 ~22:30Z on staging, window **2026-06-03 → 2026-06-10** (five true US-RTH sessions
post-Memorial-week; the 06-02 original had ZERO true sessions). 485 symbols, 180,959 symbol×20-min-median
observations (55,230 RTH / 125,729 off-hours). Same SQL as the 06-02 sweep + `statement_timeout 600s`
+ `captured_at >= '2026-06-03'` (the snap table outgrew the default timeout — first run died; the
window filter is also the methodologically-right denominator).

**RTH ask-depth distribution (per symbol × 20-min median):** p10 $5,709 · p25 $9,681 · p50 $14,708 · p75 $23,032 · p90 $36,806

| cand lq_min | implied ask-depth | RTH pass | names admitted (majority of RTH buckets) |
|---|---|---|---|
| 30 | $999 | 97.89% | 474/485 (97.7%) |
| 33 | $1,994 | 96.80% | 469/485 (96.7%) |
| 35 | $3,161 | 95.69% | 465/485 (95.9%) |
| **38** | **$6,309** | **88.60%** | **433/485 (89.3%)** |
| 40 | $9,999 | 73.76% | 357/485 (73.6%) |
| 43 (current) | $19,952 | 32.44% | 128/485 (26.4%) |
| 45 | $31,622 | 13.52% | 42/485 (8.7%) |

**Read:** 38 confirmed. Its implied floor ($6.3K) sits AT the RTH p10 — exactly the lens boundary
(filter books too thin for a clean fill; reject-rate is an output). The 06-02 two-day pre-check said
432/485 names at 38; five-session true-RTH data says 433/485 — stable across the methodology fix.
Your guardrail (no lower than ~38 until the Phase-25 position-size anchor) untouched. Kyle's
conditional GO (recorded, alert ac1b69f1 ACKED) is satisfied by this table.

## 2. Live state verified pre-apply (staging psql, same session)

- `screener_filters` xstock_spot: exactly **22 rows at lq_min=43** (paper+live × trend/reversal/
  breakout/oscillator/pattern + vts_quant both modes), **paper vts_strong_trend=30**,
  **live active_strong_trend=35**, quant-active + 2 blank-path rows NULL (untouched).
- `calibration_ledger` lq_min rows: `imf · 22 paths` = proposed/38/B.2 (the 06-02c planned
  migration); `imf · active_strong_trend` 35 baseline; `imf · vts_strong_trend` 30 baseline.

## 3. The apply migration (NEW: `drizzle/migrations/2026-06-10b-b2-lq-apply.sql`, registered in MANIFEST; rollback file alongside, manifest-excluded)

```sql
BEGIN;
-- 1) 22 main paths: 43 -> 38
UPDATE screener_filters
SET lq_min = 38, last_updated_by = 'b2-lq-apply-2026-06-10', updated_at = NOW()
WHERE asset_class = 'xstock_spot' AND lq_min = 43;

-- 2) strong_trend companion: both lanes -> 33 = max(30, 38 - 5)
UPDATE screener_filters
SET lq_min = 33, last_updated_by = 'b2-lq-apply-2026-06-10', updated_at = NOW()
WHERE asset_class = 'xstock_spot'
  AND filter_path IN ('vts_strong_trend', 'active_strong_trend')
  AND lq_min IN (30, 35);

-- 3) scoreboard: main row proposed -> applied (current_* stays = 43-era before;
--    planned_result stays NULL — fills with the live per-family LQ-reject at post-deploy load sanity)
UPDATE calibration_ledger SET status = 'applied', notes = COALESCE(notes,'') || ' APPLIED 2026-06-10 ...', updated_at = NOW()
WHERE asset_class='xstock_spot' AND sub_batch='B.0' AND setting_key='lq_min' AND scope='imf · 22 paths';

-- 4) scoreboard: strong_trend rows planned_value='33', planned_sub_batch='B.2', status='applied'
UPDATE calibration_ledger SET planned_value='33', planned_sub_batch='B.2', status='applied', notes=..., updated_at=NOW()
WHERE asset_class='xstock_spot' AND sub_batch='B.0' AND setting_key='lq_min'
  AND scope IN ('imf · active_strong_trend', 'imf · vts_strong_trend');
COMMIT;
```

(Full file has the evidence header + exact notes text; idempotent on re-run — second pass matches 0 rows.)

## 4. The one judgment call to flag explicitly — strong_trend asymmetry

`max(30, main−5) = 33` makes the two strong_trend lanes RELATIONAL (move with main) instead of
crypto-clone artifacts. But note the directions: **live active_strong_trend 35 → 33 LOOSENS;
paper vts_strong_trend 30 → 33 TIGHTENS.** The paper lane tightening is a side effect of unifying
on one relational value. At 33 (~$1,994 implied) the recheck says 96.8% RTH pass — it stays a
barely-binding floor either way (the B.0 baseline measured vts_strong_trend LQ-reject at 0/56,725).
I judge the unification worth the tiny paper-lane tightening; calling it out so it's a reviewed
decision, not a buried one.

## 5. Post-deploy verification plan

1. psql: 0 rows at 43; 22 at 38; 2 at 33 (xstock_spot).
2. Load sanity over the next true-RTH stretch: distinct xstock names admitted through the LQ gate
   should rise ~3.4× (recheck-implied 128→433 names basis); watch eval-cycle volume + VTS cadence
   for load regression (the throughput study says headroom is ample, but we look anyway).
3. `calibration_ledger` planned_result_num/den fill: LIVE per-family LQ-reject over a matched
   eval window AFTER accumulation — proposed at the 4.6-B soak touchpoint (2026-06-11T19Z) or
   the next governance turn, whichever has enough RTH data.
4. Epoch question, answered: NO calibration-epoch bump — lq_min is an ADMISSION gate, not a
   shared outcome-math substrate (same class as the B3.1b volume-confirmation change, which
   also shipped without a bump). Tell me if you disagree.

## 6. Questions

- Q1: Approve the apply migration as written (push → CI → deploy tonight)?
- Q2: strong_trend 33 unification (§4) — agree, or keep paper lane at 30?
- Q3: The no-epoch-bump call (§5.4) — agree?

Reply with APPROVE / revisions per question. The push waits on this reply.
