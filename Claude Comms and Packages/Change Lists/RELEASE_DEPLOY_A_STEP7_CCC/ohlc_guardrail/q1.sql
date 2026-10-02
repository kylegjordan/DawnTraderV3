set statement_timeout='120s';
select table_name, column_name, data_type, is_nullable from information_schema.columns
 where table_schema='public' and column_name in ('arrived_at','captured_at','interval_begin')
 and table_name in ('crypto_spot_ohlc_1m','xstock_spot_ohlc_1m','crypto_perp_ohlc_1m','xstock_perp_ohlc_1m') order by 1,2;
select now() as db_now;
