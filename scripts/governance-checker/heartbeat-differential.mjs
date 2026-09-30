// B-PLAN-CURRENCY-CHECK P28 — the heartbeat DIFFERENTIAL harness (Langston, scope §10j 3(d)).
//
// WHY IT EXISTS: P28 refactors heartbeat-check.mjs into a pure `decideHeartbeat` plus an IO shell,
// with NO flag of its own. The ruling that allowed that asks for a differential: enumerate the
// states today's heartbeat branches on and show the refactor gives the same open/resolve outcome
// for each, the OLD outcomes taken from the code at the refactor commit's PARENT — not from a
// re-implementation of it, which would only test the new code against its author's reading.
//
// WHAT IT DOES: it runs the REAL `checkHeartbeat` of a chosen version, unmodified, once per state,
// against temp state files and a FAKE system-alerts CLI (a throwaway npm project whose
// `system-alerts` script records each call and answers add / resolve in a chosen mode). It prints
// one JSON record per state: the CLI calls made (verb, dedupe key, severity, category, title, body,
// resolve id and evidence), the returned `silent`, and the silent-alert handle left in the
// heartbeat state file. Running it at the parent and at the refactor and diffing the two outputs is
// the shell-level differential; heartbeat-check.test.mjs embeds the parent's open/resolve outcomes
// and asserts `decideHeartbeat` against them.
//
// Usage (needs git, bash and npm on PATH; not run by CI — CI runs heartbeat-check.test.mjs):
//   node scripts/governance-checker/heartbeat-differential.mjs <ref>        # the version at <ref>
//   node scripts/governance-checker/heartbeat-differential.mjs --worktree   # the working tree's
// It never touches the real alert store: GOV_STAGING_REPO points at the fake project, and
// GOV_REMOTE is removed from the environment.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..', '..');
const FILES = ['heartbeat-check.mjs', 'config.mjs'];
const SILENT_KEY = 'governance-checker-silent';

// The states. NOW is fixed so every age in a body is reproducible. `tick` is the poller state
// file's condition; `hb` the heartbeat's own state file; `add`/`resolve` the fake CLI's answer.
export const NOW = Date.parse('2026-09-30T12:00:00Z');
const MIN = 60000;
const TICKS = {
  absent: null, corrupt: null, 'lastTick-null': null,
  'fresh-10m': -10, 'boundary-60m': -60, 'stale-61m': -61, 'stale-600m': -600, 'future+5m': 5,
};
const HBS = ['absent', 'null', 'open'];
export function states() {
  const out = [];
  for (const tick of Object.keys(TICKS)) for (const hb of HBS) {
    out.push({ name: `${tick}/${hb}`, tick, hb, sha: 'abc1234def', add: 'ok', resolve: 'ok' });
  }
  // Variants on the two branches that call the CLI: an add that prints no id, and each resolve
  // outcome the shell distinguishes (confirmed, the benign `Alert <id> not found`, any other
  // failure), with the graded sha present, absent, and a decimal timestamp (the #637 sentinel case).
  out.push({ name: 'stale-61m/null/add-noid', tick: 'stale-61m', hb: 'null', sha: 'abc1234def', add: 'noid', resolve: 'ok' });
  out.push({ name: 'absent/absent/add-noid', tick: 'absent', hb: 'absent', sha: null, add: 'noid', resolve: 'ok' });
  for (const r of ['notfound', 'fail']) {
    out.push({ name: `fresh-10m/open/resolve-${r}`, tick: 'fresh-10m', hb: 'open', sha: 'abc1234def', add: 'ok', resolve: r });
  }
  out.push({ name: 'fresh-10m/open/sha-absent', tick: 'fresh-10m', hb: 'open', sha: null, add: 'ok', resolve: 'ok' });
  out.push({ name: 'fresh-10m/open/sha-timestamp', tick: 'fresh-10m', hb: 'open', sha: '1785485897377', add: 'ok', resolve: 'ok' });
  return out;
}

const FAKE_CLI = `import { appendFileSync } from 'node:fs';
const [verb, ...rest] = process.argv.slice(2);
const arg = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : null; };
const rec = { verb };
if (verb === 'add') {
  let meta = null; try { meta = JSON.parse(arg('--metadata')); } catch { meta = { unparsed: arg('--metadata') }; }
  Object.assign(rec, { dedupeKey: meta.dedupe_key ?? null, source: meta.source ?? null, severity: arg('--severity'),
    category: arg('--category'), title: arg('--title'), body: arg('--body') });
}
if (verb === 'resolve') Object.assign(rec, { id: rest[0], by: arg('--by'), evidence: arg('--evidence') });
appendFileSync(process.env.FAKE_LOG, JSON.stringify(rec) + '\\n');
if (verb === 'add') console.log(process.env.FAKE_ADD === 'noid' ? 'added (no id printed)' : JSON.stringify({ id: '00000000-0000-4000-8000-000000000001' }));
if (verb === 'resolve' && process.env.FAKE_RESOLVE === 'notfound') { console.error('Alert ' + rest[0] + ' not found'); process.exit(1); }
if (verb === 'resolve' && process.env.FAKE_RESOLVE === 'fail') { console.error('boom: the alert store is unreachable'); process.exit(1); }
`;

function slash(p) { return p.replace(/\\/g, '/'); }

export async function runDifferential(source) {
  const tmp = mkdtempSync(join(tmpdir(), 'hb-diff-'));
  const code = join(tmp, 'code'); mkdirSync(code);
  for (const f of FILES) {
    if (source === '--worktree') copyFileSync(join(SCRIPT_DIR, f), join(code, f));
    else writeFileSync(join(code, f), execFileSync('git', ['show', `${source}:scripts/governance-checker/${f}`],
      { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  }
  const fake = join(tmp, 'fake'); mkdirSync(fake);
  writeFileSync(join(fake, 'package.json'), JSON.stringify({ name: 'hb-diff-fake', private: true,
    scripts: { 'system-alerts': 'node cli.mjs' } }));
  writeFileSync(join(fake, 'cli.mjs'), FAKE_CLI);
  const stateFile = join(tmp, 'state.json'), hbFile = join(tmp, 'hb.json'), log = join(tmp, 'calls.jsonl');
  process.env.GOV_STATE_FILE = stateFile;
  process.env.GOV_HB_STATE = hbFile;
  process.env.GOV_STAGING_REPO = slash(fake);
  process.env.FAKE_LOG = log;
  delete process.env.GOV_REMOTE;
  const mod = await import(pathToFileURL(join(code, 'heartbeat-check.mjs')).href);
  const out = [];
  for (const s of states()) {
    rmSync(stateFile, { force: true }); rmSync(hbFile, { force: true }); writeFileSync(log, '');
    if (s.tick === 'corrupt') writeFileSync(stateFile, '{"lastTick": 17854');
    else if (s.tick !== 'absent') {
      const st = { lastTick: TICKS[s.tick] == null ? null : NOW + TICKS[s.tick] * MIN, openAlerts: {} };
      if (s.sha) st.gradedRefSha = s.sha;
      writeFileSync(stateFile, JSON.stringify(st));
    }
    if (s.hb === 'null') writeFileSync(hbFile, JSON.stringify({ alertId: null }));
    if (s.hb === 'open') writeFileSync(hbFile, JSON.stringify({ alertId: 'hb-open-1' }));
    process.env.FAKE_ADD = s.add; process.env.FAKE_RESOLVE = s.resolve;
    const r = mod.checkHeartbeat(NOW);
    const calls = readFileSync(log, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
    const hbAfter = existsSync(hbFile) ? JSON.parse(readFileSync(hbFile, 'utf8')) : null;
    // The refactor keeps handles in `openAlertIds` keyed by dedupe key; the parent kept one in
    // `alertId`. Read the silent handle from whichever the version under test writes.
    const handleAfter = hbAfter == null ? 'NO-FILE'
      : (hbAfter.openAlertIds && SILENT_KEY in hbAfter.openAlertIds) ? hbAfter.openAlertIds[SILENT_KEY] : (hbAfter.alertId ?? null);
    const action = calls.some((c) => c.verb === 'add') ? 'open' : calls.some((c) => c.verb === 'resolve') ? 'resolve' : 'none';
    out.push({ state: s.name, silent: r.silent, action, handleAfter, calls });
  }
  rmSync(tmp, { recursive: true, force: true });
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = process.argv[2];
  if (!source) { console.error('usage: heartbeat-differential.mjs <ref> | --worktree'); process.exit(2); }
  const rows = await runDifferential(source);
  console.log(JSON.stringify({ source, now: new Date(NOW).toISOString(), rows }, null, 2));
}
