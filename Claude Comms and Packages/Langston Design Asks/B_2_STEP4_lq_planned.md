# B.2 Step-4 code review — LQ planned-side ledger fill (PROPOSAL ONLY, nothing live)

**Ask:** confirm this one-row migration is good to push, or flag.

**Migration:** `drizzle/migrations/2026-06-02c-b2-lq-planned.sql`. It records the lq_min DECISION on the calibration scoreboard's planned side. No live `screener_filters` edit — the live gate changes only at the APPLY/point-tighten step.

**Full diff (the entire migration body):**

```sql
UPDATE calibration_ledger
SET planned_value      = '38',
    planned_result_num = NULL,
    planned_result_den = NULL,
    planned_sub_batch  = 'B.2',
    status             = 'proposed',
    updated_at         = NOW()
WHERE asset_class = 'xstock_spot'
  AND sub_batch   = 'B.0'
  AND setting_key = 'lq_min'
  AND scope       = 'imf · 22 paths';
```

**Decision rationale:**
- **38 (single value, the conservative end of your endorsed 35–40)** — per your guardrail "do not go below ~38 until the Phase-25 position-size anchor is set." 38 ≈ $6,309 ask-depth; admits ~432/485 names in the depth replay vs ~149 at the current 43; rejects only the genuinely-thin sub-$6k books.
- **planned_result left NULL** per your denominator caveat: the 2-day pre-true-RTH depth window vs the 3-week per-family `current_result` (34,285/56,725) are not apples-to-apples; the matched % fills at the point-tighten once true-RTH depth accumulates.
- **strong_trend (30/35) + min_depth ($2k/$5k) UNCHANGED** — at main=38 your Q4 ordering holds (30/35 still looser than 38, no inversion); the $2k vts floor is a coherent thin-book catch (9.4% two-way reject, bid-side verified near-symmetric), the $5k active floor flagged "revisit at active-trading flip / Phase 19."

**Grain verified on staging** (psql): the row exists — `sub_batch=B.0`, `asset_class=xstock_spot`, `setting_key=lq_min`, `scope=imf · 22 paths`, `current_value=43`, `status=baseline`. So the UPDATE is not a silent no-op.

**Infrastructure note:** do NOT cd to /mnt/gdrive or run git on the gdrive mount. Use `ssh staging` for any repo-side inspection.

**Verdict requested:** good to push (then deploy + §9.3 UI-verify the scoreboard planned column), or flag.
