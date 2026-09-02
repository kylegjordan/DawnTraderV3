/**
 * B-TOKEN-WATCH — the tracking page.
 *
 * ★ WHY IT EXISTS (Kyle, 2026-08-28): *a collector with no visible surface is
 *   unfalsifiable for 90 days.* This is the surface. It exists so the study can
 *   be checked next week rather than believed until the readout.
 *
 * ⛔ IT SHOWS TWO DIFFERENT DENOMINATORS AND LABELS BOTH, because conflating
 *    them is the one way this page could be confidently wrong. The CENSUS is
 *    every launch the feed reported. The TRACKED set is the far smaller group
 *    that is actually re-checked — trait carriers plus a fixed random control.
 *    Only tracked tokens can ever be observed dying, so every survival figure
 *    runs over that population and the page says so beside the numbers, not in
 *    a footnote.
 */

import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Clock, Database, Skull, Sprout } from 'lucide-react';

type Summary = {
  generated_at: string;
  launches: { total: number; by_day: Record<string, number>; note: string };
  tracked: { total: number; share_of_launches: number | null; note: string };
  alive: { total: number; by_age: Record<string, number>; note: string };
  died: {
    total: number;
    by_age_at_death: Record<string, number>;
    by_class: Record<string, number>;
    note: string;
  };
  oldest_survivors: Array<{
    mint: string;
    created_at: string | null;
    age_days: number | null;
    initial_size: number | null;
    initial_size_usd: number | null;
    size_source: string | null;
    size_is_inferred: boolean | null;
    venue: string | null;
    follow_reason: string | null;
    name: string | null;
    symbol: string | null;
    market_cap_usd: number | null;
    buys_h24: number | null;
    sells_h24: number | null;
    chart_url: string | null;
    sol_usd: number | null;
    observed_at: string | null;
    socials: { telegram?: boolean; twitter?: boolean; website?: boolean } | null;
  }>;
  display_ages: string[];
  grid_ages: string[];
};

type Response =
  | { available: false; reason: string }
  | { available: true; stale: boolean; ageSeconds: number | null; summary: Summary };

const DEATH_LABEL: Record<string, string> = {
  faded: 'Faded — pool alive, no trading in 24h',
  liquidity_pulled: 'Liquidity pulled — the pool itself is gone',
  unknown: 'Unclassified — evidence did not distinguish',
};

const AGE_LABEL: Record<string, string> = {
  '1h': '1 hour',
  '6h': '6 hours',
  '24h': '24 hours',
  '3d': '3 days',
  '7d': '7 days',
  '30d': '30 days',
  '90d': '90 days',
};

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function AgeTable({
  title,
  icon,
  counts,
  ages,
  caption,
  denominator,
  total,
  totalLabel,
}: {
  title: string;
  icon: React.ReactNode;
  counts: Record<string, number>;
  ages: string[];
  caption: string;
  denominator: number;
  total: number;
  totalLabel: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {icon}
        <h3 className="font-medium">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Age</th>
              <th className="px-4 py-2 text-right font-medium">Tokens</th>
              <th className="px-4 py-2 text-right font-medium">Share of tracked</th>
            </tr>
          </thead>
          <tbody>
            {ages.map((age) => {
              const n = counts[age] ?? 0;
              return (
                <tr key={age} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2">{AGE_LABEL[age] ?? age}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{n.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                    {denominator > 0 ? `${((n / denominator) * 100).toFixed(2)}%` : '—'}
                  </td>
                </tr>
              );
            })}
            {/* ⛔ THE TOTAL IS PASSED IN, NEVER SUMMED FROM THE COLUMN. The
                survival column is CUMULATIVE -- a token alive at 30 days is
                also counted at 3 and 7 -- so adding it up would count the same
                token several times and print a number larger than the study.
                The deaths column is mutually exclusive (a token dies once, at
                one checkpoint) and its total IS the sum. Two different
                columns, two different meanings, so the label says which. */}
            <tr className="border-t-2 border-border bg-muted/30 font-medium">
              <td className="px-4 py-2">{totalLabel}</td>
              <td className="px-4 py-2 text-right tabular-nums">{total.toLocaleString()}</td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                {denominator > 0 ? `${((total / denominator) * 100).toFixed(2)}%` : '—'}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}

export default function TokenWatchPage() {
  const { data, isLoading, error } = useQuery<Response>({
    queryKey: ['/api/token-watch/summary'],
    // The study publishes hourly; polling faster would only re-read one file.
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading the launch study…</div>;
  }

  // ⛔ AN ABSENT SUMMARY IS REPORTED AS ABSENT, NEVER RENDERED AS ZEROS. A page
  //    reading "0 launches" because a file was missing is indistinguishable
  //    from one reading "0 launches" because nothing launched — and only the
  //    second is a finding.
  if (error || !data || !data.available) {
    const reason =
      data && !data.available ? data.reason : 'Could not reach the launch study.';
    return (
      <div className="p-6">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <h2 className="font-medium">No study data available</h2>
            <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              This is deliberately not shown as zeros — an empty page and an empty
              result are different things.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const s = data.summary;
  const tracked = s.tracked.total;
  // ⛔ NEVER Object.keys() HERE. The payload is written with sorted keys, so
  //    the checkpoints come back ALPHABETICALLY and 30 days renders between
  //    24 hours and 3 days. Seen on the live page. The order is carried
  //    explicitly by the study, which is the only thing that knows it.
  const deathAges = s.grid_ages ?? Object.keys(s.died.by_age_at_death);

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold">Token launch study</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A capture-only observation study of new token launches. It trades nothing,
          holds nothing, and touches no part of the trading system.
        </p>
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Updated {new Date(s.generated_at).toLocaleString()}
          {data.stale && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600">
              stale — the hourly job may not be running
            </span>
          )}
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Launches recorded"
          value={s.launches.total.toLocaleString()}
          sub="Every launch the feed reported"
        />
        <Stat
          label="Tracked"
          value={tracked.toLocaleString()}
          sub={
            s.tracked.share_of_launches !== null
              ? `${(s.tracked.share_of_launches * 100).toFixed(1)}% of launches — the re-checked group`
              : 'The re-checked group'
          }
        />
        <Stat
          label="Still alive"
          value={s.alive.total.toLocaleString()}
          sub="Of tracked tokens, not observed dead"
        />
        <Stat
          label="Died"
          value={s.died.total.toLocaleString()}
          sub={Object.entries(s.died.by_class)
            .map(([k, v]) => `${k.replace('_', ' ')} ${v}`)
            .join(' · ')}
        />
      </section>

      {/* ⛔ THE DENOMINATOR WARNING SITS BESIDE THE NUMBERS, NOT IN A FOOTNOTE.
          Only tracked tokens are ever re-checked, so survival cannot be read
          against the census — and a reader who misses that would take every
          figure below as a rate over all launches. */}
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
        <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          <strong className="text-foreground">One population — every launch.</strong>{' '}
          {s.tracked.note} {s.alive.note}
        </p>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <AgeTable
          title="Still alive — how long they have survived"
          icon={<Sprout className="h-4 w-4 text-emerald-500" />}
          counts={s.alive.by_age}
          ages={s.display_ages}
          denominator={tracked}
          total={s.alive.total}
          totalLabel="Alive now (distinct tokens)"
          caption="Cumulative: a token counted at 30 days is also counted at 3 and 7 — so the total is the number of DISTINCT tokens not observed dead, not the sum of the column above."
        />
        <AgeTable
          title="Died — where they died"
          icon={<Skull className="h-4 w-4 text-rose-500" />}
          counts={s.died.by_age_at_death}
          ages={deathAges}
          denominator={tracked}
          total={s.died.total}
          totalLabel="Died in total"
          caption={s.died.note}
        />
      </section>

      {/* DEATHS BY TYPE, with the definitions ON the table (Kyle, 2026-09-01).
          The two classes both end at zero, so a win/lose column would treat
          them identically -- but they are different events and the study
          treats that difference as a primary object, not a footnote. A reader
          who has to go elsewhere for the definition will read the label
          instead, and the labels are not self-explanatory. */}
      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-medium">How they died</h3>
          <div className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">Faded</strong> — the trading pool
              still exists, but nothing has traded in 24 hours. The token is still
              listed; nobody is buying or selling it.
            </p>
            <p>
              <strong className="text-foreground">Liquidity pulled</strong> — the
              trading pool has DISAPPEARED, where we had previously seen one.
              There is nothing left to trade against.{' '}
              <strong className="text-foreground">The name overstates what we
              measured.</strong>{' '}
              This is inferred entirely from the pool vanishing — we have never
              read a liquidity figure at the moment of death, on any of these.
              A vanished pool is strong evidence (re-checked hours later, none
              of a 60-token sample had returned), but it is evidence, not a
              measurement of money removed.
            </p>
            <p>
              <strong className="text-foreground">Unclassified</strong> — the token
              is not trading, but the evidence does not distinguish the two above.
              Recorded as unclassified rather than guessed, because a death wearing
              a class it did not earn is worse than one with no class at all.
            </p>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">Tokens</th>
              <th className="px-4 py-2 text-right font-medium">Share of deaths</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(s.died.by_class).map(([cls, n]) => (
              <tr key={cls} className="border-b border-border/50">
                <td className="px-4 py-2">{DEATH_LABEL[cls] ?? cls}</td>
                <td className="px-4 py-2 text-right tabular-nums">{n.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {s.died.total > 0 ? `${((n / s.died.total) * 100).toFixed(2)}%` : '—'}
                </td>
              </tr>
            ))}
            {/* A token dies once, under one class, so this total IS the sum. */}
            <tr className="border-t-2 border-border bg-muted/30 font-medium">
              <td className="px-4 py-2">Died in total</td>
              <td className="px-4 py-2 text-right tabular-nums">
                {s.died.total.toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">100.00%</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-medium">Oldest survivors</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The {s.oldest_survivors.length} longest-lived tracked tokens with no
            recorded death, oldest first.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <strong>*Size at launch is INFERRED</strong> — the largest transfer by
            the launcher in the creation transaction, not a figure anyone
            reported. It is shown in SOL and converted at the SOL price recorded
            at that token&apos;s own last observation, never a single rate applied
            to every row. A dash means <strong>not observed recently</strong>, which
            is not the same as zero. Name and symbol exist only from the point we
            began keeping them; older rows will be blank.
          </p>
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Symbol</th>
                <th className="px-4 py-2 text-right font-medium">Age (days)</th>
                {/* The label says INFERRED because it is: the largest transfer
                    by the fee payer, not a figure anyone reported to us. The
                    ground-truth check is still outstanding, so it must not sit
                    unmarked in a row of measured values. */}
                <th className="px-4 py-2 text-right font-medium">Size at launch*</th>
                <th className="px-4 py-2 text-right font-medium">Value now</th>
                <th className="px-4 py-2 text-right font-medium">Buys / sells 24h</th>
                <th className="px-4 py-2 text-center font-medium">Web</th>
                <th className="px-4 py-2 text-center font-medium">X</th>
                <th className="px-4 py-2 text-center font-medium">TG</th>
                <th className="px-4 py-2 font-medium">Chart</th>
              </tr>
            </thead>
            <tbody>
              {s.oldest_survivors.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                    No tracked token has survived long enough to appear here yet.
                  </td>
                </tr>
              )}
              {s.oldest_survivors.map((t) => (
                <tr key={t.mint} className="border-b border-border/50 last:border-0">
                  {/* A BLANK IS "NOT OBSERVED RECENTLY", NEVER "ZERO". The
                      lookup reads a bounded window of observations, so an
                      em-dash here means we have not looked lately -- which is
                      a different claim from a measured nil. */}
                  <td className="px-4 py-2">
                    {t.name || <span className="font-mono text-xs text-muted-foreground">{t.mint.slice(0, 10)}…</span>}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{t.symbol || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.age_days !== null ? t.age_days.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {/* ⛔ An unresolved size is shown as unresolved, never as 0.
                        The extractor labels it, and that label is why the two
                        are distinguishable at all. */}
                    {t.size_source === 'unresolved' || t.initial_size === null ? (
                      <span className="text-muted-foreground">unresolved</span>
                    ) : (
                      <>
                        {t.initial_size} SOL
                        {t.initial_size_usd !== null && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (${t.initial_size_usd.toLocaleString()})
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.market_cap_usd !== null && t.market_cap_usd !== undefined
                      ? `$${Math.round(t.market_cap_usd).toLocaleString()}`
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-xs">
                    {t.buys_h24 !== null && t.buys_h24 !== undefined
                      ? <span><span className="text-emerald-500">{t.buys_h24}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-rose-500">{t.sells_h24}</span></span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-2 text-center">{t.socials ? (t.socials.website ? '✓' : '·') : '—'}</td>
                  <td className="px-4 py-2 text-center">{t.socials ? (t.socials.twitter ? '✓' : '·') : '—'}</td>
                  <td className="px-4 py-2 text-center">{t.socials ? (t.socials.telegram ? '✓' : '·') : '—'}</td>
                  <td className="px-4 py-2 text-xs">
                    {t.chart_url
                      ? <a href={t.chart_url} target="_blank" rel="noreferrer"
                           className="text-primary hover:underline">open</a>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
