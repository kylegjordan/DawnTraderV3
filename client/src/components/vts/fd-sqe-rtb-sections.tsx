/**
 * B-FILTER-DIAG-STANDARDIZE — the SQE and RTB sections. **PAPER / LIVE ONLY.**
 *
 * Kyle 2026-08-07: *"The only difference is that paper and live mode will have added sections for the
 * SQE and the RTB."* These are absent from the VTS tab not by a flag but because **the VTS pipeline has
 * no SQE stage at all**.
 *
 * ★ AND THIS IS WHERE NET-EV LIVES ON THE ACTIVE PATH. Kyle: *"the VTS does its net EV check differently
 * in a different part of the pipeline… Leave the net EV scoring in the VTS filter diagnostics tabs where
 * it is. But for the paper trading and live trading filter diagnostics tables, this has to go in the SQE
 * section."* Verified at both sites: the VTS rejects on net-EV inside its own evaluation loop, with no
 * SQE anywhere in it (`vts-runner.ts:4917-4919`, `detailReason === 'net_ev_rejected'`); the active path
 * rejects **inside the SQE** (`gate_decision.reason = "NetEV … <= 0"`, `rejectStage:'sqe'`).
 * ⇒ Same metric, same label, DIFFERENT SECTION per tab — that is the pipeline's real shape, not a
 * display inconsistency, and it is the one place "standardised" deliberately does not mean "identical".
 *
 * Gate ids and display labels come from the SHARED classifier (`shared/sqe-gate-classifier`), so this
 * table and the engine cannot drift about what a gate means.
 * Sentinel discipline (`shared/filter-diagnostics-lane.ts`): absent instrumentation renders an honest
 * state — NEVER `?? 0`. "Not measured" and "measured zero" are different statements.
 */
import { useQuery } from '@tanstack/react-query';
import { sqeGateLabel } from '@shared/sqe-gate-classifier';
import { DiagTableCard, DIAG_TABLE_THEMES, FROZEN_FIRST_COL_TABLE } from './vts-filter-diagnostics-panel';

type FunnelClass = {
  status: 'active' | 'dormant';
  sqeEvaluated: number;
  sqePassed: number;
  sqeGateRejects: Record<string, number>;
  sqeGateRejectsAtRefresh?: Record<string, number>;
  strategyNullReasons?: Record<string, Record<string, number>>;
  sqeAttempts?: { atGeneration: number; atRefresh: number };
  rtbRefresh?: {
    cyclesRun: number; refreshedAttempted: number; reconfirmed: number;
    rejectedInRefresh: number; promoted: number; droppedError?: number;
  };
};

export function ActiveSqeAndRtbSections({
  modeTail, assetClass,
}: { modeTail: 'paper' | 'live'; assetClass: 'crypto_spot' | 'xstock_spot' }) {
  const funnel = useQuery<{ startedAt: string; byAssetClass: Record<string, FunnelClass> }>({
    queryKey: [`/api/active-engine/diagnostics/funnel?mode=${modeTail}`],
    refetchInterval: 10000,
    staleTime: 5000,
  });

  if (funnel.isError) {
    return (
      <div className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-600" data-testid="fd-sqe-error">
        SQE / RTB sections unavailable — the diagnostics fetch FAILED. That is a failure, not an empty result.
      </div>
    );
  }

  const label = modeTail === 'paper' ? 'Paper' : 'Live';
  /** #675: the MODE label ('Paper'/'Live') and the ASSET-CLASS label are different claims, and a coverage
   *  gap belongs to the class, never the mode. Kept as a separate name so the two can't be swapped by
   *  accident — they already were once, and it produced a card asserting Paper was unmeasured while Paper
   *  crypto was measured on the neighbouring tab. */
  const className = assetClass === 'crypto_spot' ? 'crypto' : 'xStock';
  const cls = funnel.data?.byAssetClass?.[assetClass];
  const since = funnel.data?.startedAt ? new Date(funnel.data.startedAt).toLocaleString() : null;

  if (!cls || cls.status !== 'active') {
    // ★ Step-4 finding (C): the first version returned the SQE card ALONE here, so the RTB section
    // silently vanished in the awaiting state — the exact absent-vs-zero conflation this file's own
    // header forbids, committed in the file that forbids it. BOTH sections must be present in every
    // state, or a reader cannot tell "no activity yet" from "this tab has no RTB section".
    return (
      <div className="space-y-4" data-testid="fd-sqe-rtb-awaiting">
        <DiagTableCard theme="summary" title="SQE — Signal Quality Evaluation" subtitle={`${label} — awaiting first recorded activity`} testId="fd-sqe-awaiting">
          <div className="p-3 text-sm text-muted-foreground">
            No SQE activity recorded for this asset class yet. Deliberately blank rather than zeros — “not
            measured” and “measured zero” are different statements, and this tab will not conflate them.
          </div>
        </DiagTableCard>
        <DiagTableCard theme="rolling" title="RTB — Ready-to-Buy Refresh" subtitle={`${label} — awaiting first recorded activity`} testId="fd-rtb-awaiting">
          <div className="p-3 text-sm text-muted-foreground">
            No RTB refresh activity recorded for this asset class yet. Present-and-empty on purpose: the
            section exists on this tab, and it has nothing to report — which is a different statement from
            the section being absent.
          </div>
        </DiagTableCard>
      </div>
    );
  }

  const gateRows = Object.entries(cls.sqeGateRejects ?? {}).sort((a, b) => b[1] - a[1]);
  const refreshRows = cls.sqeGateRejectsAtRefresh
    ? Object.entries(cls.sqeGateRejectsAtRefresh).sort((a, b) => b[1] - a[1])
    : null;
  const rtb = cls.rtbRefresh;

  return (
    <div className="space-y-4" data-testid="fd-sqe-rtb-sections">
      <DiagTableCard
        theme="summary"
        title="SQE — Signal Quality Evaluation"
        subtitle={`${label} — cumulative${since ? ` since ${since}` : ''}`}
        testId="fd-sqe-section"
      >
        <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
          <thead>
            <tr className={`border-b ${DIAG_TABLE_THEMES.summary.head}`}>
              <th className="text-left p-2 font-medium">SQE Gate</th>
              <th className="text-right p-2 font-medium">Count</th>
              <th className="text-left p-2 font-medium text-muted-foreground text-xs">Counting Basis</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-muted/30">
              <td className="p-2 font-medium">Evaluated</td>
              <td className="p-2 text-right font-mono">{cls.sqeEvaluated.toLocaleString()}</td>
              <td className="p-2 text-xs text-muted-foreground">
                {cls.sqeAttempts
                  ? `at generation ${cls.sqeAttempts.atGeneration.toLocaleString()} + at RTB refresh ${cls.sqeAttempts.atRefresh.toLocaleString()}`
                  : 'generation + refresh'}
              </td>
            </tr>
            <tr className="border-b bg-muted/30">
              <td className="p-2 font-medium">Passed</td>
              <td className="p-2 text-right font-mono">{cls.sqePassed.toLocaleString()}</td>
              <td className="p-2 text-xs text-muted-foreground">organic + exploration-lane admits</td>
            </tr>
            {gateRows.length === 0 ? (
              <tr><td colSpan={3} className="p-3 text-sm text-muted-foreground">No SQE gate rejects recorded yet — an observed zero.</td></tr>
            ) : gateRows.map(([gate, n]) => (
              <tr key={gate} className="border-b last:border-0">
                <td className="p-2 font-medium">
                  {sqeGateLabel(gate)}
                  {gate === 'NetEV' && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      net expectancy ≤ 0 after friction — the VTS applies this same gate elsewhere in its
                      pipeline, so on the VTS tab it appears under Post-Signal Rejections
                    </span>
                  )}
                </td>
                <td className="p-2 text-right font-mono">{n.toLocaleString()}</td>
                <td className="p-2 text-xs text-muted-foreground">
                  {gate === 'uncategorized' ? (
                    <>
                      A reason label the classifier does not recognise. These counts run from the
                      start of the window and are never rewritten, so almost all of this bucket is
                      Net EV recorded before Net EV had its own label — measured at 7,648 of 7,649
                      (B-FILTER-DIAG-PAPER, 24h sample). Read it as Net EV; a genuinely new gate
                      would also land here, which is why it is not relabelled outright.
                    </>
                  ) : (
                    'rejected at this SQE gate'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </DiagTableCard>

      <DiagTableCard
        theme="rolling"
        title="RTB — Ready-to-Buy Refresh"
        subtitle={`${label} — cumulative${since ? ` since ${since}` : ''}`}
        testId="fd-rtb-section"
      >
        {!rtb ? (
          <div className="p-3 text-sm text-muted-foreground">
            RTB refresh counters not recorded for this class yet — blank rather than zeros.
          </div>
        ) : (
          <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
            <thead>
              <tr className={`border-b ${DIAG_TABLE_THEMES.rolling.head}`}>
                <th className="text-left p-2 font-medium">Stage</th>
                <th className="text-right p-2 font-medium">Count</th>
                <th className="text-left p-2 font-medium text-muted-foreground text-xs">Counting Basis</th>
              </tr>
            </thead>
            <tbody>
              {([
                ['Refresh Cycles Run', rtb.cyclesRun, 'refresh passes over the queue'],
                ['Re-evaluated', rtb.refreshedAttempted, 'queued signals put back through the SQE'],
                ['Reconfirmed', rtb.reconfirmed, 'still qualified — stayed in the queue'],
                ['Fell Out at Refresh', rtb.rejectedInRefresh, 'failed re-evaluation and left the queue'],
                ['Dropped on Error', rtb.droppedError ?? 0, 'removed because the refresh pass errored'],
                ['Promoted', rtb.promoted, 'left the queue to an open attempt'],
              ] as const).map(([name, n, basis]) => (
                <tr key={name} className="border-b last:border-0">
                  <td className="p-2 font-medium">{name}</td>
                  <td className="p-2 text-right font-mono">{Number(n).toLocaleString()}</td>
                  <td className="p-2 text-xs text-muted-foreground">{basis}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/10 text-xs">
                <td className="p-2 text-muted-foreground" colSpan={3}>
                  Cycle identity: re-evaluated = reconfirmed + fell-out + dropped-on-error (
                  {rtb.refreshedAttempted.toLocaleString()} = {rtb.reconfirmed.toLocaleString()} +{' '}
                  {rtb.rejectedInRefresh.toLocaleString()} + {(rtb.droppedError ?? 0).toLocaleString()}).
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </DiagTableCard>

      {/* ★ THE PER-STRATEGY DECLINE TABLE — Kyle's requirement that the DATA FEED, not that the section
          be labelled absent. Real numbers now: the active path reads the reason its strategies were already
          setting (shared null-reason-tracker), which the VTS has always read.
          PRESENCE vs EMPTY is load-bearing here and the two render differently:
            field ABSENT  → server predates the wiring → honest not-instrumented state
            field EMPTY   → wired, and nothing has declined yet → an observed zero
          Conflating them is the #546 absent-as-valid class this batch exists to remove. */}
      {(() => {
        const snr = cls.strategyNullReasons;
        if (!snr) {
          return (
            {/* ★ #675 — NAME THE ASSET CLASS, NEVER THE MODE. `label` is 'Paper'/'Live', and an earlier
                revision of this card used it here: it rendered "not recorded for Paper yet", which is FALSE
                — Paper crypto records them, on this very tab set. That is the same naming-the-wrong-cause
                failure this card exists to prevent, committed inside the fix for it. Caught on the staging
                walk, not in review. The uninstrumented thing is the CLASS's evaluation path. */}
            <DiagTableCard theme="rolling" title="Why Each Strategy Declined" subtitle={`${className} — not measured yet`} testId="fd-strategy-nulls-absent">
              <div className="p-3 text-sm text-muted-foreground">
                <p>
                  Decline reasons are not recorded for <strong>{className}</strong> yet.{' '}
                  <strong>These are not zeros.</strong> The figure is absent, which says something about what
                  is being measured — not about how the {className} strategies behaved.
                </p>
                <p className="mt-2">
                  Crypto and xStock run through separate evaluation paths, and only the crypto path reports
                  its decline reasons today — so this is a gap in {className} coverage, not in {label} mode.
                  Wiring the xStock path is its own tracked piece of work; until it lands this table stays
                  empty however long the system runs, so waiting will not fill it.
                </p>
              </div>
            </DiagTableCard>
          );
        }
        const rows = Object.entries(snr)
          .map(([strategy, reasons]) => ({
            strategy,
            reasons,
            total: Object.values(reasons).reduce((a, b) => a + b, 0),
          }))
          .sort((a, b) => b.total - a.total);
        const allReasons = Array.from(new Set(rows.flatMap((r) => Object.keys(r.reasons)))).sort();
        return (
          <DiagTableCard theme="rolling" title="Why Each Strategy Declined" subtitle={`${label} — cumulative${since ? ` since ${since}` : ''}`} testId="fd-strategy-nulls">
            {rows.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                Recording is live and no strategy has declined yet — an observed zero, not a missing feature.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
                  <thead>
                    <tr className={`border-b ${DIAG_TABLE_THEMES.rolling.head}`}>
                      <th className="text-left p-2 font-medium">Strategy</th>
                      {allReasons.map((r) => (
                        <th key={r} className="text-right p-2 font-medium whitespace-nowrap">{r}</th>
                      ))}
                      <th className="text-right p-2 font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.strategy} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="p-2 font-medium">{row.strategy}</td>
                        {allReasons.map((r) => (
                          <td key={r} className="p-2 text-right font-mono">{(row.reasons[r] ?? 0).toLocaleString()}</td>
                        ))}
                        <td className="p-2 text-right font-mono font-semibold">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Counted where the strategy itself declined to produce a setup — the reason is the strategy&apos;s
                  own, the same taxonomy the VTS tab shows. <strong>unknown</strong> means a strategy declined
                  without recording a reason, which is kept as its own bucket rather than folded away.
                </div>
              </div>
            )}
          </DiagTableCard>
        );
      })()}

      {refreshRows && (
        <DiagTableCard
          theme="lastScan"
          title="RTB — What Fell Out, by SQE Gate"
          subtitle={`${label} — the refresh-phase slice of the SQE table above`}
          testId="fd-rtb-fallout"
        >
          <table className={`w-full text-sm ${FROZEN_FIRST_COL_TABLE}`}>
            <thead>
              <tr className={`border-b ${DIAG_TABLE_THEMES.lastScan.head}`}>
                <th className="text-left p-2 font-medium">SQE Gate</th>
                <th className="text-right p-2 font-medium">Fell out at refresh</th>
              </tr>
            </thead>
            <tbody>
              {refreshRows.length === 0 ? (
                <tr><td colSpan={2} className="p-3 text-sm text-muted-foreground">
                  Nothing has fallen out of the refresh cycle since this counter started — an observed zero,
                  not a missing feature. (Why it is zero is not asserted here.)
                </td></tr>
              ) : refreshRows.map(([gate, n]) => (
                <tr key={gate} className="border-b last:border-0">
                  <td className="p-2 font-medium">{sqeGateLabel(gate)}</td>
                  <td className="p-2 text-right font-mono">{n.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-blue-500/30 bg-blue-50/20 dark:bg-blue-950/10 text-xs">
                <td className="p-2 text-muted-foreground" colSpan={2}>
                  A SUBSET of the SQE gate table above — <strong>never add the two together</strong>.
                </td>
              </tr>
            </tbody>
          </table>
        </DiagTableCard>
      )}
    </div>
  );
}
