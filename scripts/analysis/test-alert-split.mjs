// B-TOKEN-BURN-CUT amendment 1, OBJ-6 — tests for .claude/hooks/alert-split.mjs (pure). Run: node scripts/analysis/test-alert-split.mjs
// Every case states its expectation before it runs; the suite ends with a count of cases that SHOWED something, so a
// run that shows nothing can never read as a pass.
import { splitAlerts, capBuckets, CLONE_TO_ALIAS, CHURN_HOURS } from '../../.claude/hooks/alert-split.mjs';

let pass = 0, fail = 0, shown = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const A = (id, sev = 'warning') => ({ id, sev, title: `alert ${id}` });
const owners = {
  _meta: { seeded_at: '2026-09-30T14:00:00Z' },
  'mine-1': { owner: 'CC-A' }, 'theirs-1': { owner: 'CC-B' }, 'kyle-1': { owner: 'Kyle' }, 'crit-theirs': { owner: 'CC-B' },
  'crit-mine': { owner: 'CC-A' },
};
const alerts = [A('mine-1'), A('theirs-1'), A('kyle-1'), A('unrouted-1'), A('crit-theirs', 'critical'), A('crit-mine', 'critical'), A('unrouted-crit', 'critical')];
const s = splitAlerts(alerts, owners, 'CC-A');
shown += s.mine.length + s.unrouted.length + s.critical.length;
ok('narrowed when alias and owner record exist', s.narrowed === true);
ok('routed to me → YOURS (a critical one of mine is YOURS, not the critical list)', s.mine.map((a) => a.id).join() === 'mine-1,crit-mine', s.mine.map((a) => a.id).join());
ok('C3/C4: no owner → shown in full as unrouted, a critical unrouted one included', s.unrouted.map((a) => a.id).join() === 'unrouted-1,unrouted-crit');
ok('C5: critical routed ELSEWHERE → one line with its owner', s.critical.length === 1 && s.critical[0].id === 'crit-theirs' && s.critical[0].owner === 'CC-B');
ok('C7: routed to another session or to Kyle → counted only', s.others === 2, String(s.others));
ok('every alert lands in exactly one place', s.mine.length + s.unrouted.length + s.critical.length + s.others === alerts.length);
const b = splitAlerts(alerts, owners, 'CC-B');
ok('the same record read as CC-B: its own two, the unrouted two, and the critical one routed to CC-A on its critical line', b.mine.map((a) => a.id).join() === 'theirs-1,crit-theirs' && b.critical.map((a) => a.id).join() === 'crit-mine' && b.unrouted.length === 2);
ok('FAIL-OPEN: no owner record → not narrowed', splitAlerts(alerts, null, 'CC-A').narrowed === false);
ok('FAIL-OPEN: no alias (unmapped clone) → not narrowed', splitAlerts(alerts, owners, null).narrowed === false);
ok('a SEEDED record with no routings narrows, and every alert is unrouted (shown), none counted away',
  (() => { const e = splitAlerts(alerts, { _meta: { seeded_at: 'x' } }, 'CC-A'); return e.narrowed && e.unrouted.length === alerts.length && e.others === 0; })());
ok('(b) a record PRESENT but never seeded does NOT narrow (it would call every alert unrouted — false)',
  (() => { const u = splitAlerts(alerts, { 'mine-1': { owner: 'CC-A' } }, 'CC-A'); return u.narrowed === false && /not seeded/.test(u.why); })());
ok('the clone map covers the four sessions', ['DawnTraderV3-old', 'DawnTraderV3-new', 'DawnTraderV3-analyst', 'DawnTraderV3-infra'].every((k) => CLONE_TO_ALIAS[k]));

// ── round 3 BLOCKER-3: a recently CHANGED owner is not trusted ──
{
  const NOW = Date.parse('2026-09-30T16:00:00Z');
  const o = { _meta: { seeded_at: 'x' },
    'flip-recent': { owner: 'CC-A', changed_at: '2026-09-30T15:00:00Z', flips: 43 },
    'flip-old': { owner: 'CC-A', changed_at: '2026-09-28T10:00:00Z', flips: 2 },
    'stable': { owner: 'CC-A', flips: 0 } };
  const r = splitAlerts([A('flip-recent'), A('flip-old'), A('stable')], o, 'CC-A', NOW);
  shown += r.mine.length + r.unrouted.length;
  ok(`BLOCKER-3: an owner changed within ${CHURN_HOURS} h reads UNROUTED (shown to every session)`, r.unrouted.map((a) => a.id).join() === 'flip-recent');
  ok('BLOCKER-3: an owner changed long ago, and a never-changed one, are trusted', r.mine.map((a) => a.id).join() === 'flip-old,stable');
  ok('BLOCKER-3: the churning alert is listed with its current owner and change count', r.churning.length === 1 && r.churning[0].owner === 'CC-A' && r.churning[0].flips === 43);
  const b2 = splitAlerts([A('flip-recent')], o, 'CC-B', NOW);
  ok('BLOCKER-3: the same churning alert is unrouted for another session too, never counted away', b2.unrouted.length === 1 && b2.others === 0);
  // Round 3 condition 1 (Langston's mutation M5 survived 19/19): a churned CRITICAL routed to someone else must land in
  // `unrouted` IN FULL, not on the one-line critical bucket — that bucket prints `owner X`, an owner the split has just
  // decided not to trust. Live shape: 5c2e53a2, critical, 21 changes, currently routed to Kyle.
  const oc = { _meta: { seeded_at: 'x' }, 'crit-flip': { owner: 'Kyle', changed_at: '2026-09-30T15:32:59Z', flips: 21 } };
  const c3 = splitAlerts([A('crit-flip', 'critical')], oc, 'CC-B', NOW);
  shown += c3.unrouted.length;
  ok('condition 1 (M5): a churned CRITICAL routed elsewhere reads UNROUTED in full, not on the critical line',
    c3.unrouted.map((a) => a.id).join() === 'crit-flip' && c3.critical.length === 0 && c3.others === 0);
}
// ── round 3 BLOCKER-2: one cap, priority critical → unrouted → yours, cut named per group ──
{
  const many = (n, p) => Array.from({ length: n }, (_, i) => A(`${p}-${i}`));
  const s = { mine: many(25, 'm'), unrouted: many(1, 'u'), critical: [{ ...A('c-0', 'critical'), owner: 'CC-B' }] };
  const c = capBuckets(s, 25);
  ok('BLOCKER-2: at the cap, the critical and the unrouted alert are KEPT and two of yours are cut',
    c.critical.length === 1 && c.unrouted.length === 1 && c.mine.length === 23 && c.cut.mine === 2 && c.cutTotal === 2, JSON.stringify(c.cut));
  const flood = capBuckets({ mine: [], unrouted: many(3, 'u'), critical: many(30, 'c') }, 25);
  ok('BLOCKER-2: criticals alone past the cap are cut, and the cut names the group', flood.critical.length === 25 && flood.cut.critical === 5 && flood.cut.unrouted === 3);
  const under = capBuckets({ mine: many(2, 'm'), unrouted: many(2, 'u'), critical: [] }, 25);
  ok('BLOCKER-2: under the cap nothing is cut', under.cutTotal === 0 && under.mine.length === 2 && under.unrouted.length === 2);
}

console.log(`\nAlert split tests: ${pass} passed, ${fail} failed (${shown} alerts shown across the cases — the instrument speaks)`);
process.exit(fail === 0 ? 0 : 1);
