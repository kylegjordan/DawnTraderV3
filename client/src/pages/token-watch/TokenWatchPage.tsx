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
    size_source: string | null;
    venue: string | null;
    follow_reason: string | null;
  }>;
  display_ages: string[];
};

type Response =
  | { available: false; reason: string }
  | { available: true; stale: boolean; ageSeconds: number | null; summary: Summary };

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
}: {
  title: string;
  icon: React.ReactNode;
  counts: Record<string, number>;
  ages: string[];
  caption: string;
  denominator: number;
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
  const deathAges = Object.keys(s.died.by_age_at_death);

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
          <strong className="text-foreground">Two different populations.</strong>{' '}
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
          caption="Cumulative: a token counted at 30 days is also counted at 3 and 7."
        />
        <AgeTable
          title="Died — where they died"
          icon={<Skull className="h-4 w-4 text-rose-500" />}
          counts={s.died.by_age_at_death}
          ages={deathAges}
          denominator={tracked}
          caption={s.died.note}
        />
      </section>

      <section className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h3 className="font-medium">Oldest survivors</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The {s.oldest_survivors.length} longest-lived tracked tokens with no
            recorded death, oldest first.
          </p>
        </div>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2 font-medium">Token</th>
                <th className="px-4 py-2 text-right font-medium">Age (days)</th>
                <th className="px-4 py-2 text-right font-medium">Size at launch</th>
                <th className="px-4 py-2 font-medium">Why tracked</th>
              </tr>
            </thead>
            <tbody>
              {s.oldest_survivors.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    No tracked token has survived long enough to appear here yet.
                  </td>
                </tr>
              )}
              {s.oldest_survivors.map((t) => (
                <tr key={t.mint} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs">{t.mint}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.age_days !== null ? t.age_days.toFixed(1) : '—'}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {/* ⛔ An unresolved size is shown as unresolved, never as 0.
                        The extractor labels it, and that label is why the two
                        are distinguishable at all. */}
                    {t.size_source === 'unresolved' || t.initial_size === null
                      ? <span className="text-muted-foreground">unresolved</span>
                      : `${t.initial_size} SOL`}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {t.follow_reason === 'trait_carrier' ? 'trait carrier' : 'random control'}
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
