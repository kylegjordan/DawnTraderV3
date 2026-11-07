\pset pager off
\pset format unaligned
\pset fieldsep ','
with t as (
 select ct.id, ct.symbol, ct.strategy_name strategy, ct.opened_at, ct.intended_entry_price e, ct.stop_loss s, ct.take_profit tp, ct.source_pool sp_pool,
  (select (k.ask-k.bid)/((k.ask+k.bid)/2) from crypto_spot_ticker_snap k where k.symbol=ct.symbol and k.captured_at<=ct.opened_at and k.captured_at>ct.opened_at-interval '5 minutes' and k.bid>0 and k.ask>k.bid order by k.captured_at desc limit 1) sp
 from closed_trades ct
 where ct.asset_class='crypto_spot' and ct.opened_at >= '2026-10-06 15:44:53+00' and coalesce(ct.close_reason,'') <> 'never_filled'
   and ct.intended_entry_price>0 and ct.stop_loss>0 and ct.take_profit>ct.intended_entry_price and ct.stop_loss<ct.intended_entry_price
)
select t.opened_at, t.id, t.strategy, t.e, t.s, t.tp, t.sp, coalesce(t.sp_pool,'') pool,
 coalesce((select value::numeric from module_constants m where m.module_name='expectancy_gates' and m.constant_name='min_rr' and m.asset_class='crypto_spot' and m.strategy=t.strategy::text),2.0) floor_rr
from t order by t.opened_at;
select module_name, constant_name, strategy, asset_class, value from module_constants where (module_name in ('strategy.sma_trend_ride','strategy.vwap_pullback') and constant_name ~ 'r_multiple') or (constant_name ~ 'target_as_r|targetAsR') order by 1,2;
