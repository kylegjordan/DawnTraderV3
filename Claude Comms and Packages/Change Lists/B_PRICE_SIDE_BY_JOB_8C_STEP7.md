# B-PRICE-SIDE-BY-JOB row `8c` — first-week Step-7 read

**Owner:** ANALYST Codex (`codex-c`)

**Registered alert:** `c15fb88d-c4b2-4235-9b6e-d7d5816acd77`

**Window:** `[2026-11-16T09:45:01.351822Z, 2026-11-23T09:45:01.351822Z)`

**Authoritative terms and evidence record:** `Scope Files/B_PRICE_SIDE_BY_JOB_8C_AUDIT_AND_PLAN.md` §13-SWITCHED-ON and §13-FIRST-WEEK-READ

## Registered decision rule

- Count crypto paper opens from `closed_trades` by `opened_at`, with no closure filter.
- Add `active_open_positions` only as an anti-join for an open lacking its `closed_trades` carrier.
- Split at the first deployed process that carries 9j, or any other deploy that changes which crypto signals may open.
- The 25-40 range is a hypothesis, not a criterion.
- The only gradeable falsifier is `opens < 10 * (days / 7)`, and it is available only when every UTC day portion has at least seven distinct admitted crypto symbols under `mode='paper_sim'`.
- A segment with a day below seven admitted symbols is written NO-RESULT.

## Evidence

### Positive controls

The same database reads reproduce both registered baseline shapes for 2026-11-09 through 2026-11-15:

- Opens: `1/2/4/2/11/6/12 = 38`.
- Admitted distinct symbols: `15/10/18/7/16/8/9` (range 7-18).

### Boundary census

The deploy clone's complete reflog has six resets in the window, to `ecbdf882e`, `85e7ce638`, `4456f515d`, `6a9b6802f`, `2a501de33` and `c21c1502a`. The PM2 log has the matching six and only six starts; the full table, process-start lines, restart-count deltas and per-range change census are in §13. None carries 9j; none changes the deployed crypto eligibility rule. B-ENTRY-GATE increment C is the only generic birth-path change, and its deployed migration explicitly keeps `crypto_spot=false`, the same shadow arm as before. The database confirms that this and the xStock price-age migration are the only two migrations applied in the window, both at 2026-11-20T23:25:52Z, and the current crypto row remains `false`.

This is deliberately the registered **deploy-boundary** conclusion, not an unqualified claim that every possible behavior boundary is absent. The reflog cannot rule out a temporary ad-hoc setting change, an unrecorded filesystem mutation or operational queue/capital/cache state.

### Registered population

- **67** crypto paper opens on **34** distinct symbols.
- Geometry: **67 sided, 0 mid, 0 absent/other**.
- Signal type: 40 QUANT, 21 HYBRID, 6 PATTERN.
- Active-position anti-join: **0** missing `closed_trades` carriers.
- Daily opens by UTC day portion, 11-16 through 11-23: `7/11/3/10/8/7/13/8`.
- Daily admitted distinct symbols: `9/12/11/14/9/6/12/13`.

The 11-21 supply cell is **6**, below the pre-registered floor of 7. The registered result is therefore **NO-RESULT**, not PASS. The under-10 stop rule did not fire; 67 is descriptive, and the pre-struck 25-40 hypothesis is not graded.

### Registered refusal-line census

The exact time filter over 18 retained error-stream files returns:

- `[8c][LEVEL_BUILD_REFUSED]`: 355 lines — 325 `no_transactable_basis`, 6 `rebase_plan_not_long`, 24 `rebase_rebased_not_long`.
- `[8c][SIDED_RR_FLOOR]`: 2,929 lines — all `level_rr_below_min_sided`.
- Total: 3,284 line events; 178 distinct tag/symbol/strategy/reason tuples.

These are refresh-emitted line events, not distinct signals or opens, and they do not grade the window.

## Reviewer re-run

Boundary objects:

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git reflog --since=2026-11-16T09:45:01Z --until=2026-11-23T09:45:01Z --date=iso-strict'"
ssh root@188.245.193.8 "grep -n 'App \[dawntrader:0\] online' /home/deploy/.pm2/pm2.log | tail -n 30"
```

Database read, sent to `ssh root@188.245.193.8 dt-sql` on stdin:

```sql
-- Baseline positive control.
select opened_at::date, count(*), count(distinct symbol)
from closed_trades
where asset_class='crypto_spot' and mode::text='paper'
  and opened_at >= '2026-11-09T00:00:00Z' and opened_at < '2026-11-16T00:00:00Z'
group by opened_at::date order by opened_at::date;

-- Registered opens and stamps.
select opened_at::date, count(*), count(distinct symbol),
       count(*) filter (where coalesce(metadata->>'levelGeometry','absent')='sided') as sided,
       count(*) filter (where coalesce(metadata->>'levelGeometry','absent')='mid') as mid,
       count(*) filter (where coalesce(metadata->>'levelGeometry','absent') not in ('sided','mid')) as other
from closed_trades
where asset_class='crypto_spot' and mode::text='paper'
  and opened_at >= '2026-11-16T09:45:01.351822Z' and opened_at < '2026-11-23T09:45:01.351822Z'
group by opened_at::date order by opened_at::date;

-- Missing open-time carrier anti-join.
select count(*)
from active_open_positions a
where a.asset_class='crypto_spot' and a.mode::text='paper'
  and a.opened_at >= '2026-11-16T09:45:01.351822Z' and a.opened_at < '2026-11-23T09:45:01.351822Z'
  and not exists (
    select 1 from closed_trades c
    where c.symbol=a.symbol and c.asset_class=a.asset_class and c.mode::text=a.mode::text and c.closed_at is null
  );

-- Registered supply condition.
select captured_at::date, count(*), count(distinct symbol)
from signal_eval_archive
where asset_class='crypto_spot' and mode='paper_sim' and reject_stage='admitted'
  and captured_at >= '2026-11-16T09:45:01.351822Z' and captured_at < '2026-11-23T09:45:01.351822Z'
group by captured_at::date order by captured_at::date;
```

Refusal-line source population:

```bash
zgrep -h -E '\[8c\]\[(LEVEL_BUILD_REFUSED|SIDED_RR_FLOOR)\]' \
  /var/log/dawntrader/error.log /var/log/dawntrader/error__*.log* \
  | awk '$0 >= "2026-11-16 09:45:01" && $0 < "2026-11-23 09:45:01"'
```

The Step-7 counts group that output by the exact bracketed tag and by `reason=` (or the parenthesized floor reason); no substring-only count is used as a verdict.

## UI and step disposition

The first live sided open's Paper Trading -> Open Trades values were already navigated and cross-checked at switch-on, recorded in §13-SWITCHED-ON. This timed read has no separate UI surface.

**Step 7 result:** evidence complete; registered verdict NO-RESULT; no stop trigger.

**Step 8 question for Coltrane:** does the literal NO-RESULT rule require another registered window before `8c-OFF-REMOVAL`, or can the switch-on hold be discharged from 67/67 sided opens while preserving the statement that this window did not PASS?

## Fresh-reader record

`REVIEWER: claim-only · no deploy in the window changed which crypto paper signals could open; name the settling objects and other consistent states · deploy-induced boundary claim holds, unqualified behavior-boundary claim is too broad · re-derived y`

The hit was re-derived against all six adjacent source ranges, the applied-migration rows and the current per-class setting. The dispatch is narrowed to the deploy-induced boundary the registered rule asks for; it does not turn ad-hoc settings, other eligibility authorities, unrecorded files or queue/capital/cache state into claimed absences.
