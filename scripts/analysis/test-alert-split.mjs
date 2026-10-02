// B-TOKEN-BURN-CUT amendment 1, OBJ-6 — tests for .claude/hooks/alert-split.mjs (pure). Run: node scripts/analysis/test-alert-split.mjs
// Every case states its expectation before it runs; the suite ends with a count of cases that SHOWED something, so a
// run that shows nothing can never read as a pass.
import { splitAlerts, capBuckets, lostRoutings, lostReport, CLONE_TO_ALIAS, CHURN_HOURS } from '../../.claude/hooks/alert-split.mjs';

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

// ── owner=Langston (his ruling, 2026-09-30): an alert he holds is counted away in EVERY session — no session alias is
// "Langston" — unless it is critical (then one line, owner named). His own §10.5 read and the dispatcher's re-surface are
// state-keyed and never read this record, so it still surfaces to him and still escalates to Kyle if he sits on it.
{
  const o = { _meta: { seeded_at: 'x' }, 'held-by-L': { owner: 'Langston', flips: 0 }, 'crit-L': { owner: 'Langston', flips: 0 } };
  const rows = [A('held-by-L'), A('crit-L', 'critical')];
  const per = ['CC-A', 'CC-B', 'CC-C', 'CC-INFRA'].map((al) => splitAlerts(rows, o, al));
  ok('owner=Langston: counted away (not shown) in all four sessions', per.every((s) => s.others === 1 && s.mine.length === 0 && s.unrouted.length === 0));
  ok('owner=Langston + critical: one line, owner named, in all four', per.every((s) => s.critical.length === 1 && s.critical[0].owner === 'Langston'));
}

// ── B-WAKE-OWNER-LOSS-VISIBLE (#1142): lostRoutings. Expectations stated per case (Langston C1, C8, C9, C11).
{
  const NOW = Date.parse('2026-10-03T12:00:00Z');
  const ID1 = 'aaaaaaaa-0000-4000-8000-000000000001', ID2 = 'bbbbbbbb-0000-4000-8000-000000000002';
  const L = (o) => JSON.stringify({ ts: '2026-10-03T10:00:00.123456+00:00', at: '2026-10-03T10:00:05Z', ids: [], rejects: [], prose: 0, ...o });
  const lost1 = L({ ids: [{ id: ID1, owner: 'CC-A' }] });
  const run = (lines, owners, dropFirst = false) => lostRoutings(lines, owners, NOW, dropFirst);
  // expected: no owner entry → still lost, owner carried (C11)
  let r = run([lost1], {});
  ok('a lost id with no owner entry is reported, with its owner', r.lost.length === 1 && r.lost[0].id === ID1 && r.lost[0].owner === 'CC-A');
  shown += r.lost.length;
  // expected: an owner entry with a LATER message ts clears it
  ok('cleared by a later owner entry (message clock)', run([lost1], { [ID1]: { owner: 'CC-B', ts: '2026-10-03T11:00:00+00:00' } }).lost.length === 0);
  // expected: the SAME instant, written in the other format (Z, no fraction vs +00:00 with micro) — does NOT clear when the
  // instants differ by the fraction; DOES clear when they are the same instant (C9: parsed epoch ms, never strings)
  ok('same instant, other format, clears (>=, parsed)', run([L({ ts: '2026-10-03T10:00:00+00:00', ids: [{ id: ID1, owner: 'CC-A' }] })],
    { [ID1]: { owner: 'CC-B', ts: '2026-10-03T10:00:00Z' } }).lost.length === 0);
  // expected: an OLDER owner entry (a replay of an earlier message) does NOT clear (C1)
  ok('an older owner entry does not clear', run([lost1], { [ID1]: { owner: 'CC-B', ts: '2026-10-03T09:00:00+00:00' } }).lost.length === 1);
  // expected: a missing/unparseable ts on either side never clears; only expiry ends it (C9)
  ok('null ts on the loss never clears', run([L({ ts: null, ids: [{ id: ID1, owner: 'CC-A' }] })], { [ID1]: { owner: 'CC-B', ts: '2026-10-03T11:00:00Z' } }).lost.length === 1);
  ok('unparseable owner ts never clears', run([lost1], { [ID1]: { owner: 'CC-B', ts: 'garbage' } }).lost.length === 1);
  // expected: the owner on record equals the lost owner → the routing stands, cleared (C11)
  ok('owner on record equals the lost owner → cleared', run([lost1], { [ID1]: { owner: 'CC-A', ts: '2026-10-01T00:00:00Z' } }).lost.length === 0);
  // expected: expiry reads `at` (wall clock), not the message ts: an old message ts with a fresh `at` is kept; a fresh ts
  // with an `at` 24 h old is dropped
  ok('expiry reads at, not ts (old ts, fresh at → kept)', run([L({ ts: '2026-09-20T00:00:00Z', at: '2026-10-03T11:00:00Z', ids: [{ id: ID1, owner: 'CC-A' }] })], {}).lost.length === 1);
  ok('expiry reads at (at 24 h old → dropped)', run([L({ at: '2026-10-02T12:00:00Z', ids: [{ id: ID1, owner: 'CC-A' }] })], {}).lost.length === 0);
  // expected: a no-id loss still reports, as rejects + prose (C3)
  r = run([L({ rejects: ['[[ALERT id=bad owner=CC-B]]'], prose: 2 })], {});
  ok('a no-id loss reports its rejects and prose', r.lost.length === 0 && r.rejects.length === 1 && r.prose === 2);
  shown += r.rejects.length;
  // expected: a torn line ANYWHERE is skipped and counted (C8); a cut FIRST line from an offset read is skipped, not counted
  r = run(['{"ts": "2026-10-03T1', lost1, '{not json', L({ ids: [{ id: ID2, owner: 'Kyle' }] })], {}, true);
  ok('torn line mid-tail counted; offset-cut first line not counted', r.unparseable === 1 && r.lost.length === 2);
  r = run(['{not json', lost1], {}, false);
  ok('torn FIRST line counted when the read was not from an offset', r.unparseable === 1 && r.lost.length === 1);
  // expected: the latest loss per id wins (two losses for one id → one entry, the later owner)
  r = run([lost1, L({ ts: '2026-10-03T10:30:00Z', ids: [{ id: ID1, owner: 'CC-C' }] })], {});
  ok('latest loss per id wins', r.lost.length === 1 && r.lost[0].owner === 'CC-C');
  // expected: no owner record at all (null) → nothing clears, nothing throws
  ok('null owners → reported, no throw', run([lost1], null).lost.length === 1);
  // Langston Step-4 C-1 — expected: an owner-less line for id "__proto__" is NOT cleared by prototype indexing
  // (control: the pre-fix `owners[x.id]` read Object.prototype, whose `.owner` is undefined === the line's undefined owner)
  ok('C-1: id "__proto__" with no owner is not silently cleared', run(['{"ts":"2026-10-03T10:00:00Z","at":"2026-10-03T10:00:05Z","ids":[{"id":"__proto__"}]}'], {}).lost.length === 1);
  // Langston Step-4 BLOCKER-1 — the report line itself: shown with NO owner record (the load-failure case), and the
  // could-not-read case says so; nothing to say gives ''.
  const rep = lostReport(run([lost1], null), null);
  ok('B1: the report names id → owner even when there is no owner record', rep.includes('aaaaaaaa → CC-A') && rep.includes('tell Langston, leading with his name'));
  shown += rep ? 1 : 0;
  ok('B1: a failed read of the loss file says the session cannot tell', /cannot tell whether any alert routing was lost/.test(lostReport(null, 'the lost-routing record could not be read (EACCES)')));
  ok('nothing lost and no read failure → empty', lostReport(run([], {}), null) === '' && lostReport(null, null) === '');
  // r2 nit — expected: a loss with NO routing leads with that fact, never "failed to save 0 alert routing(s)"
  const rep0 = lostReport(run([L({ rejects: ['[[ALERT id=bad owner=CC-B]]'] })], {}), null);
  ok('a no-routing loss says no routing was lost, and names what was', rep0.includes('no routing was lost') && rep0.includes('1 rejected marker(s)') && !rep0.includes('0 alert routing'));
  // r2 nit (fix-follows-pointer) — expected: splitAlerts reads staging ids as own properties too: an alert whose id is
  // "__proto__" is shown as unrouted, not looked up on the prototype
  const sp = splitAlerts([A('__proto__')], { _meta: { seeded_at: 'x' } }, 'CC-A');
  ok('splitAlerts: an alert id "__proto__" reads as unrouted', sp.unrouted.length === 1 && sp.others === 0);
}

console.log(`\nAlert split tests: ${pass} passed, ${fail} failed (${shown} alerts shown across the cases — the instrument speaks)`);
process.exit(fail === 0 ? 0 : 1);
