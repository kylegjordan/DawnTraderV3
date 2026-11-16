create temp table ev(side text, t timestamptz, symbol text, pos text, bid numeric, sl numeric, bid_start numeric, lead_s int);
\copy ev from '/tmp/cp5_events.csv' csv
create temp table r as
select e.*,
 (select s.bid from xstock_spot_ticker_snap s where s.symbol=e.symbol and s.captured_at <= e.t - make_interval(secs=>e.lead_s) and s.captured_at > e.t - make_interval(secs=>e.lead_s) - interval '2 min' and s.bid>0 order by s.captured_at desc limit 1) pre_snap,
 (select percentile_cont(0.5) within group (order by s.bid) from xstock_spot_ticker_snap s where s.symbol=e.symbol and s.captured_at between e.t+interval '15 min' and e.t+interval '25 min' and s.bid>0) post_med,
 (select s.bid from xstock_spot_ticker_snap s where s.symbol=e.symbol and s.captured_at <= e.t+interval '25 min' and s.captured_at > e.t+interval '23 min' and s.bid>0 order by s.captured_at desc limit 1) post25
from ev e;
\echo INSIDE
select to_char(t,'MM-DD HH24:MI:SS') t, symbol, bid, sl, bid_start, pre_snap, post_med, post25,
  (bid < coalesce(bid_start,pre_snap) and bid < post_med) dip_med, (bid < coalesce(bid_start,pre_snap) and bid < post25) dip_25 from r where side='in' order by t;
\echo SHARES (pre = pause-start bid inside, snapshot at t-361s outside)
select side, count(*) n, count(post_med) n_post, count(coalesce(bid_start,pre_snap)) n_pre,
  count(*) filter (where bid < coalesce(bid_start,pre_snap) and bid < post_med) dip_med,
  count(*) filter (where bid < coalesce(bid_start,pre_snap) and bid < post25) dip_25,
  count(*) filter (where coalesce(bid_start,pre_snap) is not null and post_med is not null) n_both
from r group by side;
\echo SENSITIVITY inside using snapshot pre at the same lead
select count(*) filter (where bid < pre_snap and bid < post_med) dip, count(*) filter (where pre_snap is not null and post_med is not null) n from r where side='in';
