from pathlib import Path
import re,json,hashlib
R=Path('C:/DawnTrader-Codex-Repo');O=Path(__file__).parent
queries={
 'price_accounting':['active-execution-engine','PaperOrderPlacer','closeOrder','B-COST-ACCOUNTING-HONESTY','B-EXIT-PROVENANCE'],
 'clock_sampling':['equity-spot-archiver','bufferTickerSnap','b74_ticker_snapshot_min_interval_ms','B-PRICE-AGE-TRUTH','B-EXIT-BOOK-AGE-STAMP'],
 'dhma':['DHMA','detectDHMA','calculateVolatility','realizedVol','strategy.dhma'],
 'strong_trend':['strong_bull_trend','detectStrongBullTrend','favoredListExcludes','getAllowedStrategies','B-4.7'],
 'holding':['maxHoldingMs','max_hold_switch','P19-B8.5j'],
 'venue_fees':['#1010','fee_model','spot_maker_fee'],
}
corpora={'ledger':[R/'1-system-manual/RUNNING_ISSUES.md'],'batch_reports':sorted((R/'Claude Comms and Packages/Batch Completion').glob('*.md'))}
results=[]
for group,qs in queries.items():
    for corpus,paths in corpora.items():
        for term in qs:
            matches=[]
            for p in paths:
                for i,line in enumerate(p.read_text(encoding='utf-8-sig').splitlines(),1):
                    if term.lower() in line.lower():matches.append({'file':str(p.relative_to(R)),'line':i,'excerpt':line[:350]})
            results.append({'group':group,'corpus':corpus,'literal_case_insensitive_query':term,'matched_lines':len(matches),'matches':matches})
(O/'history_searches.json').write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf-8')
# File identity for the actual cited implementing objects (not git provenance).
sources=[
 'EXPORT_PROVENANCE.md','Claude Comms and Packages/Scope Files/CODEX_AUDIT_3_BRIEF.md',
 'server/services/active-execution-engine.ts','server/services/live-pricing-adapter.ts',
 'server/services/price-cache.ts','server/services/passive-archive/equity-spot-archiver.ts',
 'server/services/passive-archive/ticker-batch-writer.ts','server/exchanges/kraken/kraken-websocket-adapter.ts',
 'server/services/execution/order-placer.ts','server/services/execution/depth-source.ts',
 'server/services/signal-orchestrator.ts','server/core/math/cost-model.ts',
 'server/services/strategy-engine.ts','server/strategies/strong-bull-trend.ts',
 'server/strategies/strategy-helpers.ts','server/services/vts-runner.ts',
 'server/core/trading/vts-exit-booking.ts','server/config/canonical-regime-strategy-map.ts',
 'server/services/market-context-engine.ts','server/core/observability/active-funnel-tracker.ts',
 'server/markets/kraken-asset-pairs-service.ts','server/asset_classes/xstock_spot/mark-staleness.ts',
 '1-system-manual/RUNNING_ISSUES.md','1-system-manual/PHASE_19_PLAN.md',
 '1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md',
]
hashes={s:hashlib.sha256((R/s).read_bytes()).hexdigest() for s in sources}
(O/'source_hashes.json').write_text(json.dumps(hashes,indent=2),encoding='utf-8')
print(json.dumps([{k:x[k] for k in ['group','corpus','literal_case_insensitive_query','matched_lines']} for x in results],indent=2))
