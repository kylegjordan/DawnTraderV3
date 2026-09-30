// B-PLAN-CURRENCY-CHECK P28 — heartbeat tests (Langston Q10: "the checker and heartbeat tests" in CI).
// The decision (`decideHeartbeat`) and the intent application (`applyHeartbeatIntents`) are tested
// pure, with an injected sink. The shell tests at the foot touch ONLY temp files: no git, no ssh,
// and the one test that reaches the alert CLI points it at a directory that does not exist.
// Run: node scripts/governance-checker/heartbeat-check.test.mjs
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// heartbeat-check.mjs reads its file paths into module constants, so the environment is set
// BEFORE it loads (hence the dynamic imports).
const TMP = mkdtempSync(join(tmpdir(), 'hb-test-'));
const STATE = join(TMP, 'state.json');
const HB = join(TMP, 'hb.json');
process.env.GOV_STATE_FILE = STATE;
process.env.GOV_HB_STATE = HB;
process.env.GOV_STAGING_REPO = join(TMP, 'no-such-repo').replace(/\\/g, '/');
delete process.env.GOV_REMOTE;
const {
  decideHeartbeat, applyHeartbeatIntents, heartbeatAlertText, pollerSilent, checkHeartbeat,
  SILENT_KEY, CENSUS_SILENT_KEY, MISTAKEPASS_SILENT_KEY,
} = await import('./heartbeat-check.mjs');
const { CENSUS_STALE_DAYS, TICK_MINUTES, HEARTBEAT_MISS_LIMIT, WEEKLY_CENSUS_ENABLED, MISTAKE_PASS_ENABLED } = await import('./config.mjs');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const MIN = 60000, DAY = 86400000;
const NOW = Date.parse('2026-09-30T12:00:00Z');
const base = {
  lastTick: NOW - 10 * MIN, lastCensusAt: null, lastMistakePassAt: null, censusEnabledSince: null,
  mistakePassEnabledSince: null, censusEnabled: false, mistakePassEnabled: false, openAlertIds: {},
};
const decide = (over) => decideHeartbeat({ ...base, ...over }, NOW).intents;
const only = (intents, key) => intents.filter((i) => i.dedupeKey === key);

// ─── §10j 3(d) THE DIFFERENTIAL — today's outcomes, taken from the code at the refactor's PARENT ───
// Derived by RUNNING the parent's own checkHeartbeat, unmodified, once per state, against temp state
// files and a fake alert CLI:
//   node scripts/governance-checker/heartbeat-differential.mjs 64605e35fa816c6336e34a393fe03a0228f1cc8f
// The states are every value today's code branches on: the poller state file (absent, unparseable,
// lastTick null, fresh, exactly at the 60-minute edge, one minute past it, long past it, in the
// future), the heartbeat's handle (no file, null, open), and the CLI's answers on the two branches
// that call it. `absent` and `corrupt` reach the decision as lastTick null — that mapping is the
// shell's, and the same harness run against the refactored shell reproduced all 30 records
// byte-for-byte (calls, titles, bodies, resolve evidence, returned `silent`, handle left behind).
// The census and mistake-pass inputs are at their dormant values (flags false, anchors null), so any
// intent other than the silent-poller one is itself a difference.
{
  const PARENT_OUTCOMES = [
    ['absent/absent', 'open'],
    ['absent/null', 'open'],
    ['absent/open', 'none'],
    ['corrupt/absent', 'open'],
    ['corrupt/null', 'open'],
    ['corrupt/open', 'none'],
    ['lastTick-null/absent', 'open'],
    ['lastTick-null/null', 'open'],
    ['lastTick-null/open', 'none'],
    ['fresh-10m/absent', 'none'],
    ['fresh-10m/null', 'none'],
    ['fresh-10m/open', 'resolve'],
    ['boundary-60m/absent', 'none'],
    ['boundary-60m/null', 'none'],
    ['boundary-60m/open', 'resolve'],
    ['stale-61m/absent', 'open'],
    ['stale-61m/null', 'open'],
    ['stale-61m/open', 'none'],
    ['stale-600m/absent', 'open'],
    ['stale-600m/null', 'open'],
    ['stale-600m/open', 'none'],
    ['future+5m/absent', 'none'],
    ['future+5m/null', 'none'],
    ['future+5m/open', 'resolve'],
    ['stale-61m/null/add-noid', 'open'],
    ['absent/absent/add-noid', 'open'],
    ['fresh-10m/open/resolve-notfound', 'resolve'],
    ['fresh-10m/open/resolve-fail', 'resolve'],
    ['fresh-10m/open/sha-absent', 'resolve'],
    ['fresh-10m/open/sha-timestamp', 'resolve'],
  ];
  const TICK_MIN = { absent: null, corrupt: null, 'lastTick-null': null, 'fresh-10m': -10, 'boundary-60m': -60,
    'stale-61m': -61, 'stale-600m': -600, 'future+5m': 5 };
  const HANDLE = { absent: {}, null: { [SILENT_KEY]: null }, open: { [SILENT_KEY]: 'hb-open-1' } };
  ok('DIFF: 30 parent states carried', PARENT_OUTCOMES.length === 30, String(PARENT_OUTCOMES.length));
  for (const [state, parentAction] of PARENT_OUTCOMES) {
    const [tick, hb] = state.split('/');
    if (!(tick in TICK_MIN) || !(hb in HANDLE)) throw new Error(`differential: unmapped state ${state}`);
    const intents = decide({ lastTick: TICK_MIN[tick] == null ? null : NOW + TICK_MIN[tick] * MIN, openAlertIds: HANDLE[hb] });
    const got = intents.length === 0 ? 'none' : intents.map((i) => `${i.action}:${i.dedupeKey}`).join('+');
    const want = parentAction === 'none' ? 'none' : `${parentAction}:${SILENT_KEY}`;
    ok(`DIFF ${state}: parent ${parentAction}, refactor the same`, got === want, `got ${got}`);
  }
}

// ─── the silent-poller leg, stated directly (HY-A11's list) ───
{
  const edge = TICK_MINUTES * HEARTBEAT_MISS_LIMIT * MIN;
  ok('P28 lastTick null → silent', pollerSilent(null, NOW) === true);
  ok('P28 within the window → not silent', pollerSilent(NOW - edge + MIN, NOW) === false);
  ok('P28 exactly at the window → not silent (strictly greater)', pollerSilent(NOW - edge, NOW) === false);
  ok('P28 beyond the window → silent', pollerSilent(NOW - edge - 1, NOW) === true);
  const open = decide({ lastTick: null });
  ok('P28 silent with nothing open → ONE open intent at warning',
    open.length === 1 && open[0].action === 'open' && open[0].severity === 'warning' && open[0].dedupeKey === SILENT_KEY, JSON.stringify(open));
  const res = decide({ openAlertIds: { [SILENT_KEY]: 'id-1' } });
  ok('P28 an open id and ticks fresh → a resolve intent', res.length === 1 && res[0].action === 'resolve' && res[0].dedupeKey === SILENT_KEY);
  ok('P28 silent with the alert already open → no second open', decide({ lastTick: null, openAlertIds: { [SILENT_KEY]: 'id-1' } }).length === 0);
  ok('P28 every intent carries dedupeKey, severity, action and a reason',
    [...open, ...res].every((i) => typeof i.dedupeKey === 'string' && typeof i.severity === 'string'
      && (i.action === 'open' || i.action === 'resolve') && typeof i.reason === 'string' && i.reason.length > 0));
}

// ─── the census and mistake-pass liveness legs (OBJ-3; §12 P28: the liveness row is `warning`) ───
for (const [key, en, last, since, label] of [
  [CENSUS_SILENT_KEY, 'censusEnabled', 'lastCensusAt', 'censusEnabledSince', 'census'],
  [MISTAKEPASS_SILENT_KEY, 'mistakePassEnabled', 'lastMistakePassAt', 'mistakePassEnabledSince', 'mistake pass'],
]) {
  const d = (over) => only(decide(over), key);
  ok(`P28 ${label}: disabled → no alert, however old the last run`, d({ [en]: false, [last]: NOW - 30 * DAY, [since]: NOW - 30 * DAY }).length === 0);
  const stale = d({ [en]: true, [last]: NOW - 9 * DAY, [since]: NOW - 20 * DAY });
  ok(`P28 ${label}: enabled, last run 9 days ago → ONE open at warning`,
    stale.length === 1 && stale[0].action === 'open' && stale[0].severity === 'warning', JSON.stringify(stale));
  ok(`P28 ${label}: exactly ${CENSUS_STALE_DAYS} days → no alert (strictly greater)`, d({ [en]: true, [last]: NOW - CENSUS_STALE_DAYS * DAY }).length === 0);
  ok(`P28 ${label}: stale with its alert already open → no second open`,
    d({ [en]: true, [last]: NOW - 9 * DAY, openAlertIds: { [key]: 'l-1' } }).length === 0);
  const fresh = d({ [en]: true, [last]: NOW - 1 * DAY, openAlertIds: { [key]: 'l-1' } });
  ok(`P28 ${label}: fresh again with its alert open → a resolve intent`, fresh.length === 1 && fresh[0].action === 'resolve');
  ok(`P28 ${label}: fresh, nothing open → nothing`, d({ [en]: true, [last]: NOW - 1 * DAY }).length === 0);
  ok(`P28 ${label}: never run, enabled 7 days ago → no alert yet`, d({ [en]: true, [since]: NOW - 7 * DAY }).length === 0);
  const nine = d({ [en]: true, [since]: NOW - 9 * DAY });
  ok(`P28 ${label}: never run, enabled 9 days ago → ONE warning (FR1-CE-8)`, nine.length === 1 && nine[0].action === 'open' && nine[0].severity === 'warning');
  ok(`P28 ${label}: enabled, BOTH anchors null → no alert (defined; never Math.max(null, null) read as 0)`, d({ [en]: true }).length === 0);
  ok(`P28 ${label}: a re-enable 2 days ago resets a 20-day-old last run (the later anchor wins)`,
    d({ [en]: true, [last]: NOW - 20 * DAY, [since]: NOW - 2 * DAY }).length === 0);
  const junk = d({ [en]: true, [last]: 'not-a-time' });
  ok(`P28 ${label}: an anchor that is not a number → OPEN (unreadable is not evidence of freshness)`,
    junk.length === 1 && junk[0].action === 'open', JSON.stringify(junk));
  ok(`P28 ${label}: an unreadable anchor never resolves an open alert`,
    d({ [en]: true, [last]: 'not-a-time', openAlertIds: { [key]: 'l-1' } }).length === 0);
  ok(`P28 ${label}: disabled with an alert open → no intent either way (resolves need positive freshness)`,
    d({ [en]: false, [last]: NOW - 1 * DAY, openAlertIds: { [key]: 'l-1' } }).length === 0);
}
{
  const both = decide({ lastTick: null, censusEnabled: true, lastCensusAt: NOW - 9 * DAY, mistakePassEnabled: true, mistakePassEnabledSince: NOW - 9 * DAY });
  ok('P28 the three legs are independent: a dead poller, a silent census and a silent pass → three opens',
    both.length === 3 && new Set(both.map((i) => i.dedupeKey)).size === 3 && both.every((i) => i.action === 'open'), JSON.stringify(both.map((i) => i.dedupeKey)));
  ok('P28 the census leg never touches the pass key and vice versa',
    only(decide({ censusEnabled: true, lastCensusAt: NOW - 9 * DAY }), MISTAKEPASS_SILENT_KEY).length === 0
    && only(decide({ mistakePassEnabled: true, lastMistakePassAt: NOW - 9 * DAY }), CENSUS_SILENT_KEY).length === 0);
  ok('P28 openAlertIds missing entirely is the same as none open', decideHeartbeat({ ...base, lastTick: null, openAlertIds: undefined }, NOW).intents.length === 1);
}

// ─── applyHeartbeatIntents — the #637 handle rule, through an injected sink ───
{
  const sink = (addId, resolveOk) => {
    const calls = [];
    return { calls, add: (k, sev, title, body) => { calls.push(['add', k, sev, title, body]); return addId; },
      resolve: (id, ev) => { calls.push(['resolve', id, ev]); return resolveOk; } };
  };
  const ctx = { nowMs: NOW, lastTick: null, gradedRefSha: 'abc1234def' };
  let s = sink('new-1', true);
  let next = applyHeartbeatIntents(decide({ lastTick: null }), {}, s, ctx);
  ok('P28 apply: an open stores the id the sink returned, under its dedupe key', next[SILENT_KEY] === 'new-1' && s.calls.length === 1 && s.calls[0][1] === SILENT_KEY);
  s = sink(null, true);
  next = applyHeartbeatIntents(decide({ lastTick: null }), {}, s, ctx);
  ok('P28 apply: an add that prints no id leaves the handle null (as before)', next[SILENT_KEY] === null);
  s = sink('x', false);
  next = applyHeartbeatIntents(decide({ openAlertIds: { [SILENT_KEY]: 'keep-me' } }), { [SILENT_KEY]: 'keep-me' }, s, ctx);
  ok('P28 apply: a FAILED resolve RETAINS the handle (#637)', next[SILENT_KEY] === 'keep-me' && s.calls[0][0] === 'resolve' && s.calls[0][1] === 'keep-me');
  s = sink('x', true);
  next = applyHeartbeatIntents(decide({ openAlertIds: { [SILENT_KEY]: 'clear-me' } }), { [SILENT_KEY]: 'clear-me' }, s, ctx);
  ok('P28 apply: a CONFIRMED resolve clears the handle, and passes the graded sha as evidence',
    next[SILENT_KEY] === null && s.calls[0][2] === 'abc1234def');
  const cen = { [CENSUS_SILENT_KEY]: 'c-1', [SILENT_KEY]: 's-1' };
  s = sink('x', true);
  next = applyHeartbeatIntents(decide({ censusEnabled: true, lastCensusAt: NOW - DAY, openAlertIds: cen }), cen, s, ctx);
  ok('P28 apply: a census resolve clears ONLY the census handle',
    next[CENSUS_SILENT_KEY] === null && next[SILENT_KEY] === null && s.calls.map((c) => c[1]).join() === 's-1,c-1');
  let threw = false;
  try { applyHeartbeatIntents([{ dedupeKey: SILENT_KEY, severity: 'warning', action: 'ack', reason: 'x' }], {}, sink('x', true), ctx); } catch { threw = true; }
  ok('P28 apply: an unknown action throws rather than being skipped', threw);
}

// ─── alert text: the silent-poller title and body are the parent's, byte for byte ───
{
  const t = heartbeatAlertText({ dedupeKey: SILENT_KEY }, { nowMs: NOW, lastTick: NOW - 61 * MIN });
  ok('P28 text: silent-poller title unchanged', t.title === 'governance-checker appears SILENT — no tick within the dead-man window');
  ok('P28 text: silent-poller body unchanged',
    t.body === 'The governance-checker poller has not written a heartbeat in over 60m (last tick: 61m ago). It may be dead — enforcement is OFF until it resumes. Check the governance-checker.timer on staging.', t.body);
  const c = heartbeatAlertText({ dedupeKey: CENSUS_SILENT_KEY, reason: 'R-census' }, { nowMs: NOW, lastTick: NOW });
  const m = heartbeatAlertText({ dedupeKey: MISTAKEPASS_SILENT_KEY, reason: 'R-pass' }, { nowMs: NOW, lastTick: NOW });
  ok('P28 text: the census alert names its flag and carries the reason', /WEEKLY_CENSUS_ENABLED/.test(c.body) && c.body.includes('R-census'));
  ok('P28 text: the pass alert names its flag and carries the reason', /MISTAKE_PASS_ENABLED/.test(m.body) && m.body.includes('R-pass'));
  let threw = false; try { heartbeatAlertText({ dedupeKey: 'gov-something-else' }, { nowMs: NOW, lastTick: NOW }); } catch { threw = true; }
  ok('P28 text: an unknown key throws rather than posting a blank alert', threw);
}

// ─── the shell, on temp files only ───
const reset = () => { rmSync(STATE, { force: true }); rmSync(HB, { force: true }); };
{
  // Expected first: an unparseable heartbeat state file THROWS out of checkHeartbeat. The run fails
  // loudly (the unit goes failed) instead of defaulting to "nothing open" and re-opening an alert.
  reset();
  writeFileSync(STATE, JSON.stringify({ lastTick: NOW - 10 * MIN }));
  writeFileSync(HB, '{"alertId": "half-writ');
  let threw = false; try { checkHeartbeat(NOW); } catch { threw = true; }
  ok('P28 shell: an unparseable heartbeat state file throws — no catch-and-default', threw);
}
{
  // Expected first: a pre-P28 state file `{alertId}` with the poller silent → no CLI call (the alert
  // is already open) and the handle carried into openAlertIds, with `alertId` mirrored for a revert.
  reset();
  writeFileSync(STATE, JSON.stringify({ lastTick: NOW - 600 * MIN }));
  writeFileSync(HB, JSON.stringify({ alertId: 'legacy-1' }));
  const r = checkHeartbeat(NOW);
  const after = JSON.parse(readFileSync(HB, 'utf8'));
  ok('P28 shell: the legacy handle is carried into openAlertIds and mirrored in alertId',
    r.silent === true && r.intents.length === 0 && after.openAlertIds[SILENT_KEY] === 'legacy-1' && after.alertId === 'legacy-1', JSON.stringify(after));
}
{
  // Expected first: the poller fresh, the legacy handle open → a resolve is ATTEMPTED; the CLI is
  // unreachable (the repo directory does not exist), so the resolve fails and the handle is KEPT.
  // A bash `No such file or directory` must not read as the benign `Alert <id> not found`.
  reset();
  writeFileSync(STATE, JSON.stringify({ lastTick: NOW - 10 * MIN, gradedRefSha: 'abc1234def' }));
  writeFileSync(HB, JSON.stringify({ alertId: 'legacy-2' }));
  console.log('  (expected: the CLI failure lines below are induced by this test, and are its subject)');
  const r = checkHeartbeat(NOW);
  const after = JSON.parse(readFileSync(HB, 'utf8'));
  ok('P28 shell: a resolve the CLI could not perform RETAINS the handle (#637)',
    r.intents.length === 1 && r.intents[0].action === 'resolve' && after.openAlertIds[SILENT_KEY] === 'legacy-2', JSON.stringify(after));
}
{
  // Expected first: revert then re-apply. A pre-P28 version rewrites the whole parsed file, so it
  // updates `alertId` and carries this version's `openAlertIds` forward STALE. Here it opened
  // 'reverted-3' while the stale map still says null. With the poller fresh, the live handle is
  // `alertId`: a resolve is ATTEMPTED on 'reverted-3' (the unreachable CLI fails it, so it is kept).
  // Reading the stale map instead would see nothing open and orphan 'reverted-3' for good.
  reset();
  writeFileSync(STATE, JSON.stringify({ lastTick: NOW - 10 * MIN, gradedRefSha: 'abc1234def' }));
  writeFileSync(HB, JSON.stringify({ alertId: 'reverted-3', openAlertIds: { [SILENT_KEY]: null } }));
  const r = checkHeartbeat(NOW);
  const after = JSON.parse(readFileSync(HB, 'utf8'));
  ok('P28 shell: after a revert and re-apply, `alertId` (written last) is the live handle, not the stale map',
    r.intents.length === 1 && r.intents[0].action === 'resolve' && after.openAlertIds[SILENT_KEY] === 'reverted-3'
    && after.alertId === 'reverted-3', JSON.stringify({ intents: r.intents, after }));
}
{
  // Expected first: the shell passes the COMMITTED flags. The state carries census and pass anchors
  // 20 days old. With both flags false (today) the run makes no call and returns no intent; with
  // either flipped it tries to add a liveness alert, and the unreachable CLI makes that throw.
  reset();
  writeFileSync(STATE, JSON.stringify({ lastTick: NOW - 10 * MIN, lastCensusAt: NOW - 20 * DAY, censusEnabledSince: NOW - 20 * DAY,
    lastMistakePassAt: NOW - 20 * DAY, mistakePassEnabledSince: NOW - 20 * DAY }));
  let threw = false, r = null;
  try { r = checkHeartbeat(NOW); } catch { threw = true; }
  const flipped = WEEKLY_CENSUS_ENABLED || MISTAKE_PASS_ENABLED;
  ok(`P28 shell: the committed flags reach the decision (flags ${flipped ? 'ON → an add was attempted' : 'OFF → no liveness intent'})`,
    flipped ? threw : (!threw && r.intents.length === 0 && existsSync(HB)));
}
rmSync(TMP, { recursive: true, force: true });

console.log(`\nHeartbeat tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
