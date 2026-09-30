// B-TOKEN-BURN-CUT amendment 1, OBJ-6 — tests for .claude/hooks/alert-split.mjs (pure). Run: node scripts/analysis/test-alert-split.mjs
// Every case states its expectation before it runs; the suite ends with a count of cases that SHOWED something, so a
// run that shows nothing can never read as a pass.
import { splitAlerts, CLONE_TO_ALIAS } from '../../.claude/hooks/alert-split.mjs';

let pass = 0, fail = 0, shown = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const A = (id, sev = 'warning') => ({ id, sev, title: `alert ${id}` });
const owners = {
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
ok('an empty owner record narrows, and every alert is unrouted (shown), none counted away',
  (() => { const e = splitAlerts(alerts, {}, 'CC-A'); return e.narrowed && e.unrouted.length === alerts.length && e.others === 0; })());
ok('the clone map covers the four sessions', ['DawnTraderV3-old', 'DawnTraderV3-new', 'DawnTraderV3-analyst', 'DawnTraderV3-infra'].every((k) => CLONE_TO_ALIAS[k]));

console.log(`\nAlert split tests: ${pass} passed, ${fail} failed (${shown} alerts shown across the cases — the instrument speaks)`);
process.exit(fail === 0 ? 0 : 1);
