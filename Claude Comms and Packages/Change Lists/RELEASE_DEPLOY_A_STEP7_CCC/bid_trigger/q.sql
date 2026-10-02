set statement_timeout='120s';
select asset_class, count(*) from active_open_positions group by 1 order by 1;
select asset_class, symbol, id, opened_at from active_open_positions where asset_class not like 'crypto%' order by opened_at;
