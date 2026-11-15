-- #1250 Step-7 five-session read (CC-C, 2026-11-15). Window = deploy 1d4be9cf7 at 2026-11-07T19:06:27Z to the close of the 5th US session, Fri 2026-11-13 8pm ET = 2026-11-14T01:00Z.
-- Archive paper rows are mode='paper_sim'; closed_trades paper rows are mode='paper'. Run: psql -f this file.
\pset footer off
\echo == A. active xStock paper admitted rows in window, by realised arm
select gate_decision->>'entryArm' arm, count(*) n,
 count(*) filter (where gate_decision ? 'levelBasis') has_basis,
 count(*) filter (where (gate_decision->>'levelSpecStamped')::boolean) spec_stamped,
 count(*) filter (where jsonb_array_length(coalesce(gate_decision->'levelSpecInconsistent','[]'::jsonb))>0) inconsistent,
 count(distinct symbol) syms, min(captured_at) first, max(captured_at) last
from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted' group by 1 order by 1;
\echo == B. taker admitted: leg arithmetic vs plan (expected per basis), fill-relative stop
with t as (select symbol, strategy, captured_at, (gate_decision->>'entryPrice')::numeric e,(gate_decision->>'stopPrice')::numeric s,(gate_decision->>'targetPrice')::numeric tp,
 (gate_decision->>'planEntryPrice')::numeric pe,(gate_decision->>'planStopLoss')::numeric ps,(gate_decision->>'planTakeProfit')::numeric pt,
 gate_decision->>'stopBasis' sb, gate_decision->>'targetBasis' tb, gate_decision->>'levelBasis' lb
 from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted' and gate_decision->>'entryArm'='taker')
select count(*) n, count(*) filter (where lb='fill_rebased') lb_rebased, count(*) filter (where lb='plan') lb_plan,
 count(*) filter (where sb='fill_rebased') s_dist, count(*) filter (where sb='anchor') s_anchor, count(*) filter (where tb='fill_rebased') t_dist, count(*) filter (where tb='anchor') t_anchor,
 max(abs(s - case when sb='fill_rebased' then e-(pe-ps) else ps end)) max_stop_err, max(abs(tp - case when tb='fill_rebased' then e+(pt-pe) else pt end)) max_tgt_err,
 max(abs(s - case when sb='fill_rebased' then e-(pe-ps) else ps end)/e) max_stop_err_rel, max(abs(tp - case when tb='fill_rebased' then e+(pt-pe) else pt end)/e) max_tgt_err_rel,
 count(*) filter (where (e-s)/e < 0.003) stop_under_0p3pct, count(*) filter (where e<>pe) fill_ne_plan, count(*) filter (where e<pe) below_plan, count(*) filter (where e>pe) above_plan,
 string_agg(distinct coalesce(sb,'null')||'/'||coalesce(tb,'null'),',') basis_pairs
from t;
\echo == C. active xStock paper entry_fill refusals in window, by reason
select gate_decision->>'reason' reason, count(*) n from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='entry_fill' group by 1 order by 2 desc;
\echo == D. flips (carried decides vs plan geometry recorded), taker rows with both
select reject_stage, count(*) n,
 count(*) filter (where (gate_decision->>'fillEconRefused')::boolean and not (gate_decision->>'fillEconRefusedPlanGeometry')::boolean) refused_only_carried,
 count(*) filter (where not (gate_decision->>'fillEconRefused')::boolean and (gate_decision->>'fillEconRefusedPlanGeometry')::boolean) refused_only_plan,
 count(*) filter (where (gate_decision->>'netEvAtFill')::numeric < (gate_decision->>'netEvAtFillPlanGeometry')::numeric) ev_lower_carried,
 count(*) filter (where (gate_decision->>'netEvAtFill')::numeric > (gate_decision->>'netEvAtFillPlanGeometry')::numeric) ev_higher_carried
from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and gate_decision ? 'netEvAtFillPlanGeometry' group by 1;
\echo == E. boundary: any levelBasis on non-xStock-taker admitted rows (paper)
select asset_class, gate_decision->>'entryArm' arm, count(*) n, count(*) filter (where gate_decision ? 'levelBasis') has_basis
from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and mode='paper_sim' and reject_stage='admitted' and not (asset_class='xstock_spot' and gate_decision->>'entryArm'='taker') group by 1,2 order by 1,2;
\echo == F. taker rows whose target is off the distance formula, with the strategy levelSpec from the trade row
with t as (select a.symbol, a.strategy, a.captured_at, (gate_decision->>'entryPrice')::numeric e,(gate_decision->>'stopPrice')::numeric s,(gate_decision->>'targetPrice')::numeric tp,
 (gate_decision->>'planEntryPrice')::numeric pe,(gate_decision->>'planStopLoss')::numeric ps,(gate_decision->>'planTakeProfit')::numeric pt,
 gate_decision->>'stopBasis' sb, gate_decision->>'targetBasis' tb, gate_decision->'levelSpecInconsistent' inc
 from signal_eval_archive a where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted' and gate_decision->>'entryArm'='taker')
select t.symbol, t.strategy, t.sb, t.tb, t.inc, t.e, t.s, t.tp, t.pe, t.ps, t.pt, round(t.tp-(t.e+(t.pt-t.pe)),6) tgt_err,
 c.take_profit ct_tp, c.stop_loss ct_sl, c.entry_price ct_e, c.metadata->'levelSpec' spec
from t left join closed_trades c on c.symbol=t.symbol and c.mode='paper' and c.asset_class='xstock_spot' and abs(extract(epoch from c.opened_at-t.captured_at))<10
where abs(t.tp - case when t.tb='fill_rebased' then t.e+(t.pt-t.pe) else t.pt end)/t.e > 1e-6 or jsonb_array_length(coalesce(t.inc,'[]'::jsonb))>0
order by t.captured_at;
\echo == G. entry_fill rows with null reason: what gate
select gate_decision->>'gate' gate, gate_decision->>'entryArm' arm, count(*) from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='entry_fill' and gate_decision->>'reason' is null group by 1,2;
\echo == H. (c) entryObservedAgeMs on xStock paper maker fills, opens in window
select chosen_entry_mode, entry_fill_policy, count(*) n, count(*) filter (where metadata ? 'entryObservedAgeMs') has_age, count(*) filter (where metadata ? 'levelBasis') has_basis
from closed_trades where opened_at >= '2026-11-07T19:06:27Z' and opened_at < '2026-11-14T01:00:00Z' and asset_class='xstock_spot' and mode='paper' group by 1,2;
\echo == I. durable taker rows vs archive carried levels (same open)
with t as (select a.symbol, a.captured_at, (gate_decision->>'stopPrice')::numeric s,(gate_decision->>'targetPrice')::numeric tp,(gate_decision->>'entryPrice')::numeric e
 from signal_eval_archive a where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z'
 and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted' and gate_decision->>'entryArm'='taker')
select count(*) n, count(c.id) joined, count(*) filter (where coalesce(c.original_stop_price,c.stop_loss)=t.s) stop_eq, count(*) filter (where c.take_profit=t.tp) tgt_eq, count(*) filter (where c.entry_price=t.e) entry_eq
from t left join closed_trades c on c.symbol=t.symbol and c.mode='paper' and c.asset_class='xstock_spot' and abs(extract(epoch from c.opened_at-t.captured_at))<10;
\echo == J. the 6 maker fills without entryObservedAgeMs
select symbol, opened_at, closed_at, entry_observed_at_ms is not null obs_col, entry_price_source, entry_book_age_ms, metadata->>'exitReason' exit_reason, (select string_agg(k,',') from jsonb_object_keys(metadata) k where k ~* 'maker|fill|rest|cancel|age') keys
from closed_trades where opened_at >= '2026-11-07T19:06:27Z' and opened_at < '2026-11-14T01:00:00Z' and asset_class='xstock_spot' and mode='paper' and chosen_entry_mode='maker' and not (metadata ? 'entryObservedAgeMs') order by opened_at;
\echo == K. the durable/archive mismatch taker row
with t as (select a.symbol, a.captured_at, (gate_decision->>'stopPrice')::numeric s,(gate_decision->>'targetPrice')::numeric tp from signal_eval_archive a where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z' and asset_class='xstock_spot' and mode='paper_sim' and reject_stage='admitted' and gate_decision->>'entryArm'='taker')
select t.symbol, t.captured_at, t.s, t.tp, c.stop_loss, c.original_stop_price, c.take_profit, c.closed_at, c.metadata->>'exitReason' er from t join closed_trades c on c.symbol=t.symbol and c.mode='paper' and c.asset_class='xstock_spot' and abs(extract(epoch from c.opened_at-t.captured_at))<10 where coalesce(c.original_stop_price,c.stop_loss)<>t.s or c.take_profit<>t.tp;
\echo == L. target-leg form census over the 45 taker opens (runtime check can fire only on r_multiple / mixed)
select coalesce(c.metadata->'levelSpec'->'target'->>'form', 'op:'||(c.metadata->'levelSpec'->'target'->>'op'), 'none') tform, c.metadata->'levelSpec'->'stop'->>'form' sform, count(*) from closed_trades c where opened_at >= '2026-11-07T19:06:27Z' and opened_at < '2026-11-14T01:00:00Z' and asset_class='xstock_spot' and mode='paper' and chosen_entry_mode='taker' group by 1,2 order by 3 desc;
\echo == M. VTS xStock admitted rows in window: levelRebase presence
select gate_decision->>'chosenMode' cm, count(*) n, count(*) filter (where gate_decision ? 'levelRebase') has_rb, count(*) filter (where jsonb_array_length(coalesce(gate_decision->'levelRebase'->'levelSpecInconsistent','[]'::jsonb))>0) inc,
 count(*) filter (where gate_decision->'levelRebase'->>'levelBasis'='fill_rebased') rebased from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z' and asset_class='xstock_spot' and mode='vts' and reject_stage='admitted' group by 1;
\echo == N. VTS xStock booking refusals in window by reason
select gate_decision->>'reason' reason, count(*) from signal_eval_archive where captured_at >= '2026-11-07T19:06:27Z' and captured_at < '2026-11-14T01:00:00Z' and asset_class='xstock_spot' and mode='vts' and reject_stage='tcl' and gate_decision->>'gate'='entry_ask' group by 1 order by 2 desc;
\echo == O. VTS taker trades: carried levels vs plan at 1e-9 relative
with v as (select entry_price e, stop_loss s, take_profit tp, (context->'levelRebase'->>'planEntryPrice')::numeric pe,(context->'levelRebase'->>'planStopLoss')::numeric ps,(context->'levelRebase'->>'planTakeProfit')::numeric pt, context->'levelRebase'->>'stopBasis' sb, context->'levelRebase'->>'targetBasis' tb
 from vts_open_trades where asset_class='xstock_spot' and opened_at >= '2026-11-07T19:06:27Z' and opened_at < '2026-11-14T01:00:00Z' and context ? 'levelRebase')
select count(*) n, count(*) filter (where abs(s-case when sb='fill_rebased' then e-(pe-ps) else ps end)/e>1e-9) stop_off,
 count(*) filter (where abs(tp-case when tb='fill_rebased' then e+(pt-pe) else pt end)/e>1e-9 and abs(tp-greatest(case when tb='fill_rebased' then e+2*(e-s) else pt end, e+2*(e-s)))/e>1e-9 ) tgt_off_dist_and_r2,
 count(*) filter (where (e-s)/e<0.003) stop_under_0p3pct from v;
with v as (select symbol, strategy, chosen_entry_mode cem, entry_fill_policy efp, maker_limit_price mlp, entry_price e, stop_loss s, take_profit tp, context, (context->'levelRebase'->>'planEntryPrice')::numeric pe,(context->'levelRebase'->>'planStopLoss')::numeric ps,(context->'levelRebase'->>'planTakeProfit')::numeric pt
 from vts_open_trades where asset_class='xstock_spot' and opened_at >= '2026-11-07T19:06:27Z' and opened_at < '2026-11-14T01:00:00Z' and context->'levelRebase'->>'stopBasis'='fill_rebased')
select (abs(s-(e-(pe-ps)))/e>1e-9) off, strategy, cem, efp, count(*) n, max(round((e-s)/nullif(pe-ps,0),4)) ratio_max, min(round((e-s)/nullif(pe-ps,0),4)) ratio_min,
 max(round((tp-e)/nullif(pt-pe,0),4)) tratio_max, min(round((tp-e)/nullif(pt-pe,0),4)) tratio_min, bool_or(context->'levelRebase' ? 'levelSpec') has_spec
from v group by 1,2,3,4 order by 1,2,3;
with v as (select strategy st, entry_price e, stop_loss s, take_profit tp, (context->'levelRebase'->>'planEntryPrice')::numeric pe,(context->'levelRebase'->>'planStopLoss')::numeric ps,(context->'levelRebase'->>'planTakeProfit')::numeric pt, context->'levelRebase'->>'targetBasis' tb
 from vts_open_trades where asset_class='xstock_spot' and opened_at >= '2026-11-07T19:06:27Z' and opened_at < '2026-11-14T01:00:00Z' and context ? 'levelRebase')
select st, tb, count(*) n,
 count(*) filter (where abs(tp-(e+(pt-pe)))/e<=1e-9) dist_exact,
 count(*) filter (where abs(tp-(e+2*(e-s)))<=1.5e-8) r2_exact_8dp,
 count(*) filter (where abs(tp-pt)<=1.5e-8) plan_exact,
 count(*) filter (where (tp-e) > 2*(e-s)+1.5e-8 and abs(tp-(e+(pt-pe)))/e>1e-9 and abs(tp-pt)>1.5e-8) above_r2_other
from v group by 1,2 order by 1,2;
