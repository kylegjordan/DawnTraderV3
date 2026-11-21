-- #1250 Step-9 re-read of the Step-7 five-session criterion (CC-C, 2026-11-21).
-- Window = births from deploy 3e2504129 (2026-11-15T04:22:48Z) to the close of the 5th US session, Fri 2026-11-20 8pm ET = 2026-11-21T01:00Z.
-- Archive paper rows are mode='paper_sim'; closed_trades paper rows are mode='paper'; VTS archive rows mode='vts'.
-- Run: ssh root@188.245.193.8 "dt-sql" < this file
\pset footer off
\echo == A. active xStock paper admitted rows, by realised arm: stamp / inconsistent / malformed
select gate_decision->>'entryArm' arm, count(*) n,
 count(*) filter (where gate_decision ? 'levelBasis') has_basis,
 count(*) filter (where gate_decision->>'levelBasis'='fill_rebased') lb_rebased,
 count(*) filter (where (gate_decision->>'levelSpecStamped')::boolean) spec_stamped,
 count(*) filter (where jsonb_array_length(coalesce(gate_decision->'levelSpecInconsistent','[]'::jsonb))>0) inconsistent,
 count(*) filter (where jsonb_array_length(coalesce(gate_decision->'levelSpecMalformed','[]'::jsonb))>0) malformed,
 count(*) filter (where gate_decision ? 'planTick' and gate_decision ? 'fillTick' and (gate_decision->>'planTick') is distinct from (gate_decision->>'fillTick')) plantick_ne_filltick,
 count(*) filter (where gate_decision ? 'planTick' and gate_decision ? 'fillTick') has_both_ticks,
 count(distinct symbol) syms, min(captured_at) first, max(captured_at) last
from signal_eval_archive where captured_at >= '2026-11-15T04:22:48Z' and captured_at < '2026-11-21T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted' group by 1 order by 1;
\echo == A2. any inconsistent or malformed active row, listed (empty = none)
select captured_at, symbol, strategy, gate_decision->>'entryArm' arm, gate_decision->'levelSpecInconsistent' inc, gate_decision->'levelSpecMalformed' mal, gate_decision->>'planTick' pt, gate_decision->>'fillTick' ft
from signal_eval_archive where captured_at >= '2026-11-15T04:22:48Z' and captured_at < '2026-11-21T01:00:00Z' and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted'
 and (jsonb_array_length(coalesce(gate_decision->'levelSpecInconsistent','[]'::jsonb))>0 or jsonb_array_length(coalesce(gate_decision->'levelSpecMalformed','[]'::jsonb))>0) order by captured_at;
\echo == A3. planTick vs fillTick values on active taker rows
select gate_decision->>'planTick' plan_tick, gate_decision->>'fillTick' fill_tick, count(*) n
from signal_eval_archive where captured_at >= '2026-11-15T04:22:48Z' and captured_at < '2026-11-21T01:00:00Z' and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted'
 and gate_decision->>'entryArm'='taker' group by 1,2 order by 3 desc;
\echo == B. active taker opens: target/stop form (from the trade row levelSpec) x basis x inconsistent
with t as (select a.symbol, a.captured_at, a.gate_decision g from signal_eval_archive a where captured_at >= '2026-11-15T04:22:48Z' and captured_at < '2026-11-21T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted' and gate_decision->>'entryArm'='taker')
select coalesce(c.metadata->'levelSpec'->'target'->>'form', 'op:'||(c.metadata->'levelSpec'->'target'->>'op'), case when c.id is null then 'NO-TRADE-ROW' else 'none' end) tform,
 coalesce(c.metadata->'levelSpec'->'stop'->>'form', 'op:'||(c.metadata->'levelSpec'->'stop'->>'op'), 'none') sform,
 t.g->>'targetBasis' tb, t.g->>'stopBasis' sb,
 count(*) n, count(*) filter (where jsonb_array_length(coalesce(t.g->'levelSpecInconsistent','[]'::jsonb))=0) inc_empty,
 count(*) filter (where c.metadata->'levelSpec'->'target' ? 'builtEntry') has_built
from t left join closed_trades c on c.symbol=t.symbol and c.mode='paper' and c.asset_class='xstock_spot' and abs(extract(epoch from c.opened_at-t.captured_at))<10
group by 1,2,3,4 order by 5 desc;
\echo == C. booked R vs stamped r, active r_multiple-target taker legs (R = (exit-entry)/(entry-original stop))
select c.symbol, c.strategy_name, c.opened_at, c.closed_at, c.close_reason, (c.metadata->'levelSpec'->'target'->>'r')::numeric r_stamped,
 c.entry_price e, coalesce(c.original_stop_price, c.stop_loss) s0, c.take_profit tp, c.exit_price x,
 round((c.take_profit-c.entry_price)/nullif(c.entry_price-coalesce(c.original_stop_price,c.stop_loss),0),6) r_carried,
 round((c.exit_price-c.entry_price)/nullif(c.entry_price-coalesce(c.original_stop_price,c.stop_loss),0),4) r_booked,
 to_char(c.closed_at at time zone 'America/New_York','Dy HH24:MI') closed_et
from closed_trades c where c.opened_at >= '2026-11-15T04:22:48Z' and c.opened_at < '2026-11-21T01:00:00Z' and c.asset_class='xstock_spot' and c.mode='paper' and c.chosen_entry_mode='taker'
 and c.metadata->'levelSpec'->'target'->>'form'='r_multiple' order by c.opened_at;
\echo == D. VTS xStock admitted archive rows, by strategy: levelRebase presence / target basis / inconsistent / malformed
select strategy, count(*) n, count(*) filter (where gate_decision ? 'levelRebase') has_rb,
 count(*) filter (where gate_decision->'levelRebase'->>'targetBasis'='fill_rebased') t_rebased,
 count(*) filter (where (gate_decision->'levelRebase'->>'levelSpecStamped')::boolean) stamped,
 count(*) filter (where jsonb_array_length(coalesce(gate_decision->'levelRebase'->'levelSpecInconsistent','[]'::jsonb))>0) inc,
 count(*) filter (where jsonb_array_length(coalesce(gate_decision->'levelRebase'->'levelSpecMalformed','[]'::jsonb))>0) mal
from signal_eval_archive where captured_at >= '2026-11-15T04:22:48Z' and captured_at < '2026-11-21T01:00:00Z' and asset_class='xstock_spot' and mode='vts' and reject_stage='admitted' group by 1 order by 2 desc;
\echo == E. VTS xStock trades with levelRebase: per strategy and basis, with the r-multiple arithmetic check
-- r_match: carried (tp-e)/(e-s) equals plan (pt-pe)/(pe-ps) to 1e-6 relative, i.e. target rebuilt as fill + r*(fill - carried stop).
-- dist_match: tp-e equals pt-pe to 1e-9 relative, i.e. target moved by the fill-plan distance. Under a distance stop the two coincide.
with v as (select strategy st, entry_price e, stop_loss s, take_profit tp,
 (context->'levelRebase'->>'planEntryPrice')::numeric pe,(context->'levelRebase'->>'planStopLoss')::numeric ps,(context->'levelRebase'->>'planTakeProfit')::numeric pt,
 context->'levelRebase'->>'targetBasis' tb, context->'levelRebase'->>'stopBasis' sb, context->'levelRebase'->'levelSpecInconsistent' inc, context->'levelRebase'->'levelSpecMalformed' mal
 from vts_open_trades where asset_class='xstock_spot' and opened_at >= '2026-11-15T04:22:48Z' and opened_at < '2026-11-21T01:00:00Z' and context ? 'levelRebase')
select st, sb, tb, count(*) n,
 count(*) filter (where jsonb_array_length(coalesce(inc,'[]'::jsonb))=0) inc_empty,
 count(*) filter (where jsonb_array_length(coalesce(mal,'[]'::jsonb))>0) mal,
 count(*) filter (where e<>pe) fill_ne_plan,
 count(*) filter (where pe>ps and e>s and abs((tp-e)/(e-s) - (pt-pe)/(pe-ps)) <= 1e-6*greatest(1,abs((pt-pe)/(pe-ps)))) r_match,
 count(*) filter (where abs((tp-e)-(pt-pe))/e <= 1e-9) dist_match,
 round(min((pt-pe)/nullif(pe-ps,0)),4) r_plan_min, round(max((pt-pe)/nullif(pe-ps,0)),4) r_plan_max
from v group by 1,2,3 order by 1,2,3;
\echo == F. VTS inconsistent / malformed trades listed (empty = none)
select opened_at, symbol, strategy, context->'levelRebase'->'levelSpecInconsistent' inc, context->'levelRebase'->'levelSpecMalformed' mal
from vts_open_trades where asset_class='xstock_spot' and opened_at >= '2026-11-15T04:22:48Z' and opened_at < '2026-11-21T01:00:00Z' and context ? 'levelRebase'
 and (jsonb_array_length(coalesce(context->'levelRebase'->'levelSpecInconsistent','[]'::jsonb))>0 or jsonb_array_length(coalesce(context->'levelRebase'->'levelSpecMalformed','[]'::jsonb))>0) order by opened_at;
\echo == G. VTS trades in window, with vs without levelRebase, by entry mode
select chosen_entry_mode, entry_fill_policy, count(*) n, count(*) filter (where context ? 'levelRebase') has_rb from vts_open_trades
where asset_class='xstock_spot' and opened_at >= '2026-11-15T04:22:48Z' and opened_at < '2026-11-21T01:00:00Z' group by 1,2 order by 3 desc;
