// REMOVED in P19-B8.4c REV-3 (2026-07-08) — superseded by DormantPipelineTables (the VTS-mirror dormant
// 3-table skeleton on Paper/Live). These two display components were the pre-REV-3 generic Paper/Live
// pipeline display; OBJ-8 replaced them. The B8.4b active-funnel WRITERS persist server-side; the
// /api/active-engine/diagnostics/funnel + /pipeline-tail endpoints are client-UNCONSUMED until B8.5 wires
// DormantPipelineTables to live counts. Deleted per rule #18 (no reuse of THESE components planned — B8.5
// wires the new tables, not these). Git history is the authoritative archive; this copy is browse-only.
// Extracted from client/src/components/vts/vts-filter-diagnostics-panel.tsx (ActivePipelineTail + ActiveDownstreamFunnel).

// ─── ActivePipelineTail ───────────────────────────────────────────────────────────────────────
/**
 * P19-B8.3 (OBJ-3c v1) — the mode's REAL active-path tail, from existing
 * sources only (/api/active-engine/pipeline-tail): pool population, RTB queue
 * depth, the rtb-metrics gate tallies, real opens. Honest zeros until B8.4;
 * a failed load renders an ERROR, never a silent blank (OBJ-8).
 */
function ActivePipelineTail({ mode }: { mode: 'paper' | 'live' }) {
  const q = useQuery<any>({
    queryKey: ['/api/active-engine/pipeline-tail', mode],
    queryFn: () => apiFetch(`/api/active-engine/pipeline-tail?mode=${mode}`),
    refetchInterval: 30000,
  });
  const d = q.data;
  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>{mode === 'paper' ? 'Paper' : 'Live'}-Mode Pipeline Tail</span>
          <span className="text-xs font-normal text-muted-foreground">this mode's OWN thresholds & pipeline — zeros are honest until the switch-on (B8.4)</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span>Couldn't load the pipeline tail — a data-feed failure, not zeros.</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => q.refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : q.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-sm">
            <div><span className="text-muted-foreground block text-xs">Active Pool ({mode})</span><span className="font-mono font-semibold">{d?.poolSize ?? '—'} pairs</span></div>
            <div><span className="text-muted-foreground block text-xs">Ready-to-Buy Queue</span><span className="font-mono font-semibold">{d?.rtbQueueDepth ?? '—'} signals</span></div>
            <div><span className="text-muted-foreground block text-xs">Gate: opened / blocked</span><span className="font-mono font-semibold">{d?.gate ? `${d.gate.openedTotal} / ${d.gate.blockedTotal}` : 'not available'}</span></div>
            <div><span className="text-muted-foreground block text-xs">Open Positions</span><span className="font-mono font-semibold">{d?.openPositionsCount ?? '—'}</span></div>
            {d?.gate && Object.keys(d.gate.blockedByReason ?? {}).length > 0 && (
              <div className="sm:col-span-2 lg:col-span-4 text-xs text-muted-foreground">
                Blocks by reason: {Object.entries(d.gate.blockedByReason).map(([r, c]) => `${r}: ${c}`).join(' · ')}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── ActiveDownstreamFunnel ───────────────────────────────────────────────────────────────────
/**
 * P19-B8.4 Part-2 — the mode's active-path DOWNSTREAM funnel (Signal generation + pre-SQE / SQE per-gate /
 * RTB refresh), from the (mode, assetClass)-keyed `/api/active-engine/diagnostics/funnel`. WIRED but the
 * counters are DORMANT until active trading turns on (B8.5): while `status === 'dormant'` each stage renders
 * an explicit "awaiting activation" row — NEVER a bare 0 (MUST-2 dormant≠zero); once `'active'`, the real
 * per-stage breakdown renders. A failed load shows an ERROR, never a silent blank (OBJ-8).
 */
function ActiveDownstreamFunnel({ mode, assetClass }: { mode: 'paper' | 'live'; assetClass: 'crypto_spot' | 'xstock_spot' }) {
  const q = useQuery<ActiveFunnelEnvelope>({
    queryKey: ['/api/active-engine/diagnostics/funnel', mode],
    queryFn: () => apiFetch(`/api/active-engine/diagnostics/funnel?mode=${mode}`),
    refetchInterval: 30000,
  });
  const cls = q.data?.byAssetClass?.[assetClass];
  const isActive = cls?.status === 'active';
  const fmt = (n: number | undefined | null): string => (n === undefined || n === null ? '—' : n.toLocaleString());
  const rows = (o: Record<string, number> | undefined): [string, number][] =>
    Object.entries(o ?? {}).sort((a, b) => b[1] - a[1]);
  const DORMANT_STAGES = [
    'Family strength filters (LQ / VN / DI)',
    'Signal generation + pre-SQE rejections',
    'SQE quality gates (per-gate screening)',
    'Ready-to-Buy refresh (refreshed / promoted / rejected)',
  ];
  const StageBlock = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div>
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">{title}</div>
      {children}
    </div>
  );
  const KvRows = ({ data, empty }: { data: Record<string, number> | undefined; empty: string }) => {
    const r = rows(data);
    if (!r.length) return <div className="text-xs text-muted-foreground">{empty}</div>;
    return (
      <table className="w-full text-sm"><tbody>
        {r.map(([k, v]) => (
          <tr key={k} className="border-b hover:bg-muted/30"><td className="p-1.5">{k}</td><td className="p-1.5 text-right font-mono">{fmt(v)}</td></tr>
        ))}
      </tbody></table>
    );
  };

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-lg flex items-center justify-between">
          <span>Downstream Pipeline{isActive ? '' : ' — awaiting activation'}</span>
          <span className="text-xs font-normal text-muted-foreground">
            {isActive ? `live ${mode} active-path counts${q.data?.startedAt ? ` · since ${new Date(q.data.startedAt).toLocaleString()}` : ''}` : 'wired — fills when active trading turns on (B8.5)'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {q.isError ? (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span>Couldn't load the active-path funnel — a data-feed failure, not zeros.</span>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => q.refetch()}>
              <RefreshCw className="w-3 h-3 mr-1" /> Retry
            </Button>
          </div>
        ) : !isActive ? (
          <div className="space-y-2 text-sm">
            {DORMANT_STAGES.map((label) => (
              <div key={label} className="flex items-center justify-between rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2" data-testid="fd-downstream-dormant">
                <span>{label}</span>
                <span className="text-xs text-muted-foreground">awaiting activation — populates at switch-on (B8.5)</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4" data-testid="fd-downstream-active">
            {/* Upstream, pre-generation: strategies the family filter excluded BEFORE any signal was built —
                NOT a subset of "signals generated", so it renders as its own stage above the funnel. */}
            <StageBlock title="Strategy attrition (family filter — before signal generation, upstream of the funnel)">
              <KvRows data={cls?.strategyAttrition} empty="No strategies filtered out in this window." />
            </StageBlock>
            <StageBlock title={`Signal generation + pre-SQE rejections — ${fmt(cls?.signalsGenerated)} signals generated`}>
              <KvRows data={cls?.preSqeRejects} empty="No pre-SQE rejections in this window." />
            </StageBlock>
            <StageBlock title={`SQE quality gates — ${fmt(cls?.sqePassed)} passed / ${fmt(cls?.sqeEvaluated)} evaluated`}>
              <KvRows data={cls?.sqeGateRejects} empty="No SQE gate rejections in this window." />
            </StageBlock>
            <StageBlock title="Post-SQE rejections (passed SQE, dropped before Ready-to-Buy)">
              <KvRows data={cls?.postSqeRejects} empty="No post-SQE rejections in this window." />
            </StageBlock>
            <StageBlock title="Ready-to-Buy refresh">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5 text-sm">
                <div><span className="text-muted-foreground block text-xs">Cycles</span><span className="font-mono font-semibold">{fmt(cls?.rtbRefresh.cyclesRun)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Refreshed</span><span className="font-mono font-semibold">{fmt(cls?.rtbRefresh.refreshedAttempted)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Reconfirmed</span><span className="font-mono font-semibold text-green-600">{fmt(cls?.rtbRefresh.reconfirmed)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Rejected (re-SQE)</span><span className="font-mono font-semibold text-red-500">{fmt(cls?.rtbRefresh.rejectedInRefresh)}</span></div>
                <div><span className="text-muted-foreground block text-xs">Promoted</span><span className="font-mono font-semibold">{fmt(cls?.rtbRefresh.promoted)}</span></div>
              </div>
              {/* MUST-4: the two SQE-attempt phases are TWO labelled numbers, never a silent sum. */}
              <div className="mt-2 text-xs text-muted-foreground">
                SQE evaluations (honest double-count): <span className="font-mono">{fmt(cls?.sqeAttempts.atGeneration)}</span> at generation ·
                {' '}<span className="font-mono">{fmt(cls?.sqeAttempts.atRefresh)}</span> during RTB refresh — counted separately, not summed.
              </div>
            </StageBlock>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
