/**
 * B-STATUS-BOARD (#1227) — the phone status board.
 *
 * Kyle, 2026-10-19: "Here's the list that we all agreed on. Here's who's working on it. Here's what that particular
 * task or batch is for … and here's the current status." At the top what is being worked on now, then each
 * session's queue, then the rest of the plan.
 *
 * ⛔ THIS PAGE INVENTS NOTHING. Every word comes from the file the governance checker writes from the plan at the
 *    reviewed ref (GET /api/status-board). A missing description says so; a status the board cannot map says
 *    `unrecognised` with its own text; a missing file is reported as missing, never rendered as an empty board.
 * ⛔ TWO AGES, SHOWN APART: the data's age (the checker) and this page's build (the app deploy). Either can lag.
 */
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ChevronDown, ChevronRight, Clock, GitCommit } from 'lucide-react';

type Waiting = { waiting: string; text: string };
type Step = { step: number; at: string; sha: string } | null;
type Item = {
  key: string; position: number; stage: string; order: string; item: string; ids: string[];
  owner: string; session: string | null; planRow: string | null; issue: string; agreed: string;
  state: string; stateLabel: string; statusText: string; statusSource: string;
  waiting: Waiting; lastStep: Step; planBehind: boolean;
  description: string | null; descriptionTooLong: boolean;
  openReason: string | null; openReasonFull: string | null; conflict: string | null;
};
type RestRow = {
  key: string; planRow: string; wave: string | null; item: string; ids: string[]; owner: string; session: string | null;
  state: string; stateLabel: string; statusText: string; lastStep: Step; description: string | null; descriptionTooLong: boolean;
};
type Board = {
  ok: true; generated_at: string; ref: string; rulebook: 'read' | 'unreadable'; ageMs: number; stale: boolean; pageBuild: string | null;
  items: Item[]; rest: RestRow[]; couldNotRead: { lineNo: number; why: string }[]; conflicts: { lineNo: number; item: string; why: string }[];
  counts: { items: number; rest: number; unrecognised: number; descriptionsOwed: number; conflicts: number; couldNotRead: number };
};
type Unavailable = { ok: false; reason: string; pageBuild: string | null };

const SESSIONS: { key: string; name: string }[] = [
  { key: 'CC-A', name: 'OLD Claude' }, { key: 'CC-B', name: 'NEW Claude' },
  { key: 'CC-C', name: 'ANALYST Claude' }, { key: 'CC-INFRA', name: 'Infra Claude' },
];
const sessionName = (s: string | null, owner: string) => SESSIONS.find((x) => x.key === s)?.name ?? (owner || 'owner not named');
const NOW_STATES = new Set(['in_progress', 'built', 'observation', 'unrecognised']);
const STATE_STYLE: Record<string, string> = {
  in_progress: 'bg-blue-500/15 text-blue-700 dark:text-blue-300', built: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  observation: 'bg-amber-500/15 text-amber-700 dark:text-amber-300', queued: 'bg-muted text-muted-foreground',
  parked: 'bg-slate-500/15 text-slate-600 dark:text-slate-300', done: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  moved: 'bg-slate-500/10 text-slate-500', unrecognised: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

function ageText(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'less than a minute ago';
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} hour${h === 1 ? '' : 's'} ago` : `${Math.round(h / 24)} days ago`;
}
const short = (sha: string | null | undefined) => (sha ? sha.slice(0, 9) : 'unknown');

function StatePill({ state, label }: { state: string; label: string }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATE_STYLE[state] ?? STATE_STYLE.unrecognised}`}>{label}</span>;
}

function Card({ it }: { it: Item }) {
  const [open, setOpen] = useState(false);
  const ref = [it.planRow ? `plan row ${it.planRow}` : null, it.issue || null].filter(Boolean).join(' · ');
  return (
    <div className="rounded-lg border bg-card p-3" data-testid="status-board-item">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <span className="font-medium break-words">{it.item}</span>
        <StatePill state={it.state} label={it.stateLabel} />
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">{sessionName(it.session, it.owner)}{ref ? ` · ${ref}` : ''}</div>
      <p className="mt-2 text-sm">
        {it.description ?? <span className="italic text-muted-foreground">description owed — {sessionName(it.session, it.owner)}</span>}
        {it.descriptionTooLong && <span className="ml-1 rounded bg-amber-500/15 px-1 text-xs text-amber-700">too long</span>}
      </p>
      <dl className="mt-2 space-y-1 text-xs">
        <div><dt className="inline text-muted-foreground">Status: </dt><dd className="inline">{it.statusText || '—'} <span className="text-muted-foreground">({it.statusSource})</span></dd></div>
        <div><dt className="inline text-muted-foreground">Waiting on: </dt><dd className="inline">
          {it.waiting.waiting === 'unrecognised' ? <span className="text-red-600">unrecognised — {it.waiting.text}</span> : (it.waiting.text || 'nothing')}
        </dd></div>
        <div><dt className="inline text-muted-foreground">Last recorded step: </dt><dd className="inline">
          {it.lastStep ? `Step ${it.lastStep.step} of 11, ${new Date(it.lastStep.at).toLocaleDateString()}` : 'no recorded step'}
        </dd></div>
        {it.planBehind && <div className="text-amber-700">The commit history shows work started; the plan has not caught up.</div>}
        {it.openReason && (
          <div>
            <dt className="inline text-muted-foreground">Held open: </dt>
            <dd className="inline">{open ? it.openReasonFull : it.openReason}
              {it.openReasonFull && it.openReasonFull !== it.openReason && (
                <button className="ml-1 underline" onClick={() => setOpen(!open)}>{open ? 'less' : 'more'}</button>
              )}
            </dd>
          </div>
        )}
        {it.conflict && <div className="text-red-600">Plan entry needs fixing: {it.conflict}</div>}
      </dl>
    </div>
  );
}

function Section({ title, hint, children, defaultOpen = true }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-2">
      <button className="flex w-full items-center gap-1 text-left" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <h2 className="text-base font-semibold">{title}</h2>
      </button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {open && children}
    </section>
  );
}

export default function StatusBoardPage() {
  const { data, isLoading, error } = useQuery<Board | Unavailable>({
    queryKey: ['/api/status-board'],
    // The checker writes every 30 minutes; a faster poll would only re-read one file.
    refetchInterval: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Loading the status board…</div>;
  if (error || !data || !data.ok) {
    const reason = data && !data.ok ? data.reason : 'Could not reach the status board.';
    return (
      <div className="p-4">
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <h2 className="font-medium">No board to show</h2>
            <p className="mt-1 text-sm text-muted-foreground">{reason}</p>
            <p className="mt-2 text-xs text-muted-foreground">Shown as missing on purpose: an empty board and an unwritten one are different things.</p>
          </div>
        </div>
      </div>
    );
  }

  const b = data;
  const preSprint = [...b.items].sort((x, y) => x.position - y.position);
  const now = preSprint.filter((i) => NOW_STATES.has(i.state));
  const next = preSprint.filter((i) => i.state === 'queued');
  const finished = preSprint.filter((i) => ['done', 'parked', 'moved'].includes(i.state));
  const bySession = (list: Item[]) => SESSIONS.map((s) => ({ ...s, items: list.filter((i) => i.session === s.key) }))
    .concat([{ key: 'other', name: 'Owner not named', items: list.filter((i) => !SESSIONS.some((s) => s.key === i.session)) }])
    .filter((g) => g.items.length > 0);
  const waves: { wave: string; rows: RestRow[] }[] = [];
  for (const r of b.rest) {
    const w = r.wave ?? 'Unlabelled';
    const last = waves[waves.length - 1];
    if (last && last.wave === w) last.rows.push(r); else waves.push({ wave: w, rows: [r] });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-4" data-testid="status-board">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Pre-sprint and sprint status</h1>
        <p className="text-sm text-muted-foreground">The agreed list, who holds each item, and where it has got to — read from the plan, not typed in twice.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Data from the plan at {short(b.ref)}, built {ageText(b.ageMs)}</span>
          <span className="flex items-center gap-1"><GitCommit className="h-3.5 w-3.5" />Page build {short(b.pageBuild)}</span>
        </div>
        {b.stale && <div className="rounded bg-amber-500/15 px-2 py-1 text-xs font-medium text-amber-700">Stale — the board has not been rebuilt for over an hour. The governance checker may have stopped updating.</div>}
        {b.rulebook === 'unreadable' && <div className="rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-700">The exceptions record could not be read this time, so the reasons a batch is held open are not shown.</div>}
        {(b.counts.couldNotRead > 0 || b.counts.conflicts > 0 || b.counts.unrecognised > 0) && (
          <div className="rounded bg-red-500/10 px-2 py-1 text-xs text-red-700">
            Not everything could be read: {b.counts.couldNotRead} plan line{b.counts.couldNotRead === 1 ? '' : 's'} unreadable, {b.counts.conflicts} entr{b.counts.conflicts === 1 ? 'y' : 'ies'} to fix, {b.counts.unrecognised} status{b.counts.unrecognised === 1 ? '' : 'es'} not recognised.
            {b.couldNotRead.map((c) => <div key={c.lineNo}>plan line {c.lineNo}: {c.why}</div>)}
          </div>
        )}
      </header>

      <Section title="Now — being worked on" hint="In progress, built but not yet live, or watching data, by session.">
        {now.length === 0 && <p className="text-sm text-muted-foreground">Nothing in progress in the pre-sprint list.</p>}
        {bySession(now).map((g) => (
          <div key={g.key} className="space-y-2"><h3 className="text-sm font-medium">{g.name}</h3>{g.items.map((it) => <Card key={`${it.key}-${it.position}`} it={it} />)}</div>
        ))}
      </Section>

      <Section title="Next — each session's queue" hint="In the plan's order; an item slotted in appears where it was placed.">
        {next.length === 0 && <p className="text-sm text-muted-foreground">Nothing queued in the pre-sprint list.</p>}
        {bySession(next).map((g) => (
          <div key={g.key} className="space-y-2"><h3 className="text-sm font-medium">{g.name}</h3>{g.items.map((it) => <Card key={`${it.key}-${it.position}`} it={it} />)}</div>
        ))}
      </Section>

      <Section title={`Done, parked or moved (${finished.length})`} defaultOpen={false}>
        <div className="space-y-2">{finished.map((it) => <Card key={`${it.key}-${it.position}`} it={it} />)}</div>
      </Section>

      <Section title={`The rest of the plan (${b.rest.length})`} hint="Sprint rows not yet in the pre-sprint list, by wave. A row not started shows no status." defaultOpen={false}>
        {waves.map((w) => (
          <Section key={w.wave} title={`${w.wave} (${w.rows.length})`} defaultOpen={false}>
            <ul className="space-y-1">
              {w.rows.map((r) => (
                <li key={r.planRow} className="rounded border bg-card px-2 py-1.5 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span><span className="text-muted-foreground">{r.planRow}</span> {r.item}</span>
                    {r.state !== 'queued' && <StatePill state={r.state} label={r.stateLabel} />}
                  </div>
                  <div className="text-xs text-muted-foreground">{sessionName(r.session, r.owner)}</div>
                  {r.description && <p className="mt-1 text-xs">{r.description}</p>}
                </li>
              ))}
            </ul>
          </Section>
        ))}
      </Section>
    </div>
  );
}
