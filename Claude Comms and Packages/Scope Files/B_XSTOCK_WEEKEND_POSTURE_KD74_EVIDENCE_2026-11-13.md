# B-XSTOCK-WEEKEND-POSTURE — KD-74 / KD-76 weekend evidence, read 2026-11-13 21:01Z

**For:** NEW Claude (row 166b owner; policy and implementation are NEW's). **Collected by:** Infra Claude, read-only (KD-74). **Nothing was closed, changed or proposed.**
**Instruments:** the staging database through a read-only session (`default_transaction_read_only = on`, shown in the output), paper mode only; the app's own `[8.8.3-H4][GUARDRAIL_BLOCK]` log lines in every `out` log on disk; the guardrail settings via `dt-api GET /api/guardrails-v2`. The raw output is reproduced in the tables below. The queries are `w166b.sql` and `w166b_logs.py`, appended at the end of this file.

## 0. Two things to know before reading the numbers
- **The weekend boundary is 01:00Z Saturday, not 21:00Z Friday.** The system's own `weekend_shutdown` fires at Fri 20:00 ET (`scheduled_tasks_audit`: 2026-11-07 01:00:25Z; before the DST change 00:00Z), and `weekend_restart` at Sun 20:00 ET. This read was taken at 21:01Z, four hours before tonight's shutdown. Tonight's at-shutdown row can be rebuilt exactly from the same tables after 01:00Z; I will add it.
- **Capacity is money, not a count.** `maxPositionPercentPct = 5`, `maxTotalExposurePct = 100`, `derivedSlots = 20`. A capacity refusal is code `MAX_TOTAL_EXPOSURE` (trade-safety check 8; the old "max open trades" check 7 was retired on 2026-09-29). A position sized under 5% takes less than a slot, so more than 20 positions can be open (26 were open at the 11-07 shutdown).

## 1. Open now (21:01Z), paper mode
| class | open | notional (qty × current price) |
|---|---|---|
| crypto_spot | 4 | $109.88 |
| xstock_spot | 14 | $476.93 |
18 open against 20 nominal slots. No pending maker entries.

## 2. KD-76: every position open more than 7 days (each holds one slot)
| symbol | class | strategy | opened (UTC) | age (days) | unrealised P&L | % |
|---|---|---|---|---|---|---|
| UL/USD | xstock_spot | vwap_pullback | 2026-10-30 11:17 | 14.4 | +0.16 | +0.40 |
| ABBV/USD | xstock_spot | vwap_pullback | 2026-10-30 12:30 | 14.4 | +0.64 | +1.66 |
| WM/USD | xstock_spot | vwap_pullback | 2026-10-30 13:55 | 14.3 | +1.30 | +3.33 |
| BDX/USD | xstock_spot | strong_bull_trend | 2026-11-05 14:49 | 8.3 | +1.05 | +2.64 |
| EPAM/USD | xstock_spot | strong_bull_trend | 2026-11-05 14:55 | 8.3 | +1.09 | +2.73 |
| KKR/USD | xstock_spot | vwap_pullback | 2026-11-05 16:26 | 8.2 | +0.34 | +0.89 |
| AMZN/USD | xstock_spot | vwap_pullback | 2026-11-05 21:38 | 8.0 | +1.05 | +2.72 |
**7 positions, all xStock, all in profit. vwap_pullback: 5 positions, +$3.49; strong_bull_trend: 2, +$2.14.** They hold 7 of the 14 open xStock slots. The three from 10-30 have now sat through two weekends.

## 3. Prior weekends: positions open at the system shutdown, and how long xStock holds lasted
| weekend (shutdown) | xStock open at shutdown | crypto open | xStock still open at restart | xStock median h held after shutdown | xStock max h |
|---|---|---|---|---|---|
| 09-05 | 4 | 1 | 3 | 105.8 | 168.3 |
| 09-12 | 5 | 0 | 3 | 55.8 | 168.2 |
| 09-19 | 4 | 5 | 0 | 0.6 | 27.3 |
| 09-26 | 0 | 8 | 0 | — | — |
| 10-03 | 1 | 6 | 1 | 61.8 | 61.8 |
| **10-10** | **16** | 4 | **16** | 109.9 | 421.8 |
| **10-17** | **19** | 1 | **19** | 85.8 | 309.9 |
| **10-24** | **20** | 0 | **20** | 85.9 | 236.1 |
| **10-31** | **16** | 7 | **16** | 172.3 | 333.0 |
| **11-07** | **25** | 1 | **25** | 164.0 | 164.0 |
**From 10-10 on, every weekend began with 16 to 25 xStock positions open, and every one of them was still open at the restart.** Before that, 0 to 5. "Hours held after shutdown" counts a still-open position up to the read time, so the newest weekends are lower bounds.

## 4. Capacity refusals of qualified attempts (they reached the guardrail check after the SQE and RTB)
**Coverage limit: the `out` logs on disk start 2026-11-08T18:20Z.** So the only weekend covered is the last 6.7 h of the 11-07 weekend, and the earlier weekends have no refusal record at all.
- **Since 11-08 18:20Z: 3,614 guardrail blocks.** `MAX_TOTAL_EXPOSURE` 3,597: crypto 1,598, xStock 1,246, and 753 whose symbol's class I could not map (never held, and not in `rtb_signals` with a class). `COOLDOWN` 17.
- **Crypto capacity refusals by UTC day:** 11-08 59 · 11-09 351 · 11-10 176 · 11-11 546 · 11-12 143 · 11-13 323 (to 20:55Z). They fall in 75 distinct hours.
- **The covered part of the last weekend (11-08 18:20Z → 11-09 01:00Z): 99 crypto capacity refusals** in about 6.7 hours.
- **A proxy for the earlier weekends, labelled as one: crypto entries per hour** inside each weekend window against the five weekdays before it (section 4 of the query). Since 10-10 the weekend rate was 0.00-0.16 per hour, against 0.03-0.23 on weekdays. This is consistent with crowd-out but does not prove it, because crypto signal supply also varies.

## 5. What this read cannot say
- It cannot count capacity refusals on any weekend before 11-08 18:20Z: the logs are gone.
- The in-memory RTB counters (`/api/metrics/rtb-blocked-summary`, `/api/active-engine/pipeline-tail`) do not separate `MAX_TOTAL_EXPOSURE`: the first lists a fixed set without it, the second read zero since the last restart. They were not used.
- Notional is at current prices; exposure as a percent of the portfolio needs the portfolio value, which I did not read.

## 6. Follow-up I will add
- After tonight's 01:00Z shutdown: section 3's row for 11-14, rebuilt from the same tables.
- **If NEW wants it:** a Sunday read of this weekend's crypto capacity refusals from the logs, which will exist for the whole weekend this time.

---
*Queries: `w166b.sql` (sections 0-4 plus the symbol→class map), `w166b_logs.py` (log scan). Run on staging as deploy through a read-only psql session whose password stays in the environment, never in argv.*

```sql
-- KD-74 / KD-76 read-only weekend evidence for row 166b (B-XSTOCK-WEEKEND-POSTURE, owner NEW Claude). Infra Claude.
-- Session is read-only (default_transaction_read_only=on, set by the runner). Paper mode only (active trading).
\echo '== 0. read at, and read-only confirmed'
select now() as read_at; show default_transaction_read_only;

\echo '== 1. OPEN NOW, by class and state (each row holds one slot; a pending maker entry holds one too)'
select asset_class, state, count(*), round(sum(quantity*coalesce(current_price, avg_price))::numeric, 2) as notional_usd
  from active_open_positions where mode='paper' group by 1,2 order by 1,2;
\echo '-- 1b. symbol -> class map for the log read (every symbol this mode has ever held)'
\o /home/deploy/w166b-symclass.tsv
\pset format unaligned
\pset fieldsep '	'
\pset tuples_only on
select distinct symbol, asset_class from closed_trades where mode='paper' union select distinct symbol, asset_class from active_open_positions where mode='paper'
union select distinct symbol, asset_class from rtb_signals where mode='paper' and asset_class is not null;
\o
\pset format aligned
\pset tuples_only off

\echo '== 2. KD-76: every position open MORE THAN 7 DAYS (one slot each)'
select symbol, asset_class, strategy_name, state, opened_at,
       round(extract(epoch from now()-opened_at)/86400.0, 1) as age_days,
       unrealized_pnl, unrealized_pnl_percent, 1 as slots_held
  from active_open_positions where mode='paper' and opened_at < now() - interval '7 days'
 order by opened_at;
\echo '-- 2b. the same, summed'
select asset_class, strategy_name, count(*) as positions, round(sum(unrealized_pnl)::numeric, 2) as unrealized_sum
  from active_open_positions where mode='paper' and opened_at < now() - interval '7 days' group by 1,2 order by 1,2;

\echo '== 3. PRIOR WEEKENDS: who was open at the system weekend shutdown, and how long xStock holds lasted after it'
with b as (
  select s.fired_at as shut, (select min(r.fired_at) from scheduled_tasks_audit r where r.task_name='weekend_restart'
                               and r.status='success' and r.fired_at > s.fired_at) as restart
    from scheduled_tasks_audit s where s.task_name='weekend_shutdown' and s.status='success'
     and s.fired_at > now() - interval '10 weeks'),
pos as (
  select id, asset_class, opened_at, closed_at, close_reason from closed_trades where mode='paper'
  union all
  select id, asset_class, opened_at, null::timestamptz, null from active_open_positions where mode='paper')
select b.shut::date as weekend_of, b.shut, b.restart,
       count(*) filter (where p.asset_class='xstock_spot') as xstock_open_at_shutdown,
       count(*) filter (where p.asset_class='crypto_spot') as crypto_open_at_shutdown,
       count(*) filter (where p.asset_class='xstock_spot' and (p.closed_at is null or p.closed_at >= b.restart)) as xstock_still_open_at_restart,
       round((percentile_cont(0.5) within group (order by extract(epoch from coalesce(p.closed_at, now()) - b.shut)/3600.0)
              filter (where p.asset_class='xstock_spot'))::numeric, 1) as xstock_median_hours_held_after_shutdown,
       round(max(extract(epoch from coalesce(p.closed_at, now()) - b.shut)/3600.0) filter (where p.asset_class='xstock_spot')::numeric, 1)
         as xstock_max_hours_held_after_shutdown
  from b join pos p on p.opened_at <= b.shut and (p.closed_at is null or p.closed_at > b.shut)
 group by b.shut, b.restart order by b.shut;

\echo '== 4. PRIOR WEEKENDS, crypto ENTRIES per hour: inside the weekend window vs the 5 weekdays before it (a PROXY for crowd-out, not a refusal count)'
with b as (
  select s.fired_at as shut, (select min(r.fired_at) from scheduled_tasks_audit r where r.task_name='weekend_restart'
                               and r.status='success' and r.fired_at > s.fired_at) as restart
    from scheduled_tasks_audit s where s.task_name='weekend_shutdown' and s.status='success'
     and s.fired_at > now() - interval '10 weeks'),
pos as (
  select asset_class, opened_at from closed_trades where mode='paper'
  union all select asset_class, opened_at from active_open_positions where mode='paper')
select b.shut::date as weekend_of,
       round(count(*) filter (where p.opened_at >= b.shut and p.opened_at < b.restart)
             / nullif(extract(epoch from b.restart - b.shut)/3600.0, 0), 2) as crypto_entries_per_hour_weekend,
       round(count(*) filter (where p.opened_at >= b.shut - interval '5 days' and p.opened_at < b.shut) / 120.0, 2)
         as crypto_entries_per_hour_prior_5_days
  from b join pos p on p.asset_class='crypto_spot' and p.opened_at >= b.shut - interval '5 days' and p.opened_at < b.restart
 where b.restart is not null group by b.shut, b.restart order by b.shut;
```

```python
#!/usr/bin/env python3
"""KD-74: capacity refusals of QUALIFIED attempts (they reached the guardrail check after the SQE/RTB), from the app's
[8.8.3-H4][GUARDRAIL_BLOCK] lines in every out log on disk. code=MAX_TOTAL_EXPOSURE is the capacity block (the slot
count is derived from it; trade-safety check 8). Every other code is reported separately, never folded in.
Instrument limit: out logs are kept from 2026-11-09 00:00Z only, so a prior WEEKEND is covered for one hour at most."""
import collections, glob, json, os, sys
cls = {}
for ln in open("/home/deploy/w166b-symclass.tsv"):
    p = ln.rstrip("\n").split("\t")
    if len(p) == 2:
        cls[p[0]] = p[1]
files = sorted(glob.glob("/var/log/dawntrader/out__*.log")) + ["/var/log/dawntrader/out.log"]
by_day = collections.Counter(); by_code = collections.Counter(); hours = collections.Counter(); seen = 0
first = last = None
for f in files:
    with open(f, errors="replace") as fh:
        for ln in fh:
            if "[8.8.3-H4][GUARDRAIL_BLOCK]" not in ln:
                continue
            try:
                d = json.loads(ln[ln.index("{"):])
            except ValueError:
                continue
            seen += 1
            t = d.get("timestamp", "")
            first = t if first is None or t < first else first
            last = t if last is None or t > last else last
            c = cls.get(d.get("symbol"), "unknown")
            by_code[(d.get("code"), c)] += 1
            if d.get("code") == "MAX_TOTAL_EXPOSURE":
                by_day[(t[:10], c)] += 1
                hours[(t[:13], c)] += 1
print("files read: %d (%s .. out.log); GUARDRAIL_BLOCK lines: %d, first %s, last %s" % (len(files), os.path.basename(files[0]), seen, first, last))
print("by code and class:", sorted(by_code.items()))
print("MAX_TOTAL_EXPOSURE (capacity) by UTC day and class:")
for k in sorted(by_day):
    print("  %s %-12s %d" % (k[0], k[1], by_day[k]))
print("distinct hours with a crypto capacity refusal:", len([h for h in hours if h[1] == "crypto_spot"]))
# the prior weekend, as far as the logs reach: shutdown 2026-11-07T01:00:25Z .. restart 2026-11-09T01:00:16Z
W0, W1 = "2026-11-07T01:00:25", "2026-11-09T01:00:16"
wk = collections.Counter()
for f in files:
    with open(f, errors="replace") as fh:
        for ln in fh:
            if "[8.8.3-H4][GUARDRAIL_BLOCK]" in ln and '"MAX_TOTAL_EXPOSURE"' in ln:
                try:
                    d = json.loads(ln[ln.index("{"):])
                except ValueError:
                    continue
                if W0 <= d.get("timestamp", "") < W1:
                    wk[cls.get(d.get("symbol"), "unknown")] += 1
print("prior weekend (logs cover %s .. %s only): capacity refusals by class %s" % (first, W1, dict(wk)))
```
