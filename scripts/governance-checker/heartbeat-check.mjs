// B-GOV-2 OBJ-3 — dead-man heartbeat check (the "is the checker itself alive?" watcher).
// A checker can't report its own death, so this runs as a SEPARATE staging timer (sibling
// to the existing cron-fire-evidence verifier). It reads the poller's state.json lastTick;
// if it's stale beyond TICK_MINUTES × HEARTBEAT_MISS_LIMIT, it raises a low-sev
// `governance-checker-silent` alert into the §10.5 queue (and resolves it once ticks resume).
//
// Coverage (Langston Step-1): process-death of the poller → caught here; host-death of
// staging → already caught loudly by the live trading system's own monitoring.
//
// B-PLAN-CURRENCY-CHECK P28 (OBJ-3 liveness; scope §10i Q3, §10j 3(d)): the decision is now the
// PURE `decideHeartbeat`, and `checkHeartbeat` is the IO shell around it. Two more legs share the
// same seam — the weekly census and the weekly mistake-pattern pass each raise a `warning` when
// ENABLED and silent for more than CENSUS_STALE_DAYS — and both are DORMANT until their
// config.mjs flags flip (P62), so with today's committed flags only the silent-poller leg can
// produce an intent. No flag of its own: the differential (heartbeat-check.test.mjs, derived with
// heartbeat-differential.mjs at this refactor's parent) shows the silent-poller outcome unchanged.
//
// Run on staging via its own systemd timer: node scripts/governance-checker/heartbeat-check.mjs

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  TICK_MINUTES, HEARTBEAT_MISS_LIMIT, resolveEvidenceOrSentinel,
  WEEKLY_CENSUS_ENABLED, MISTAKE_PASS_ENABLED, CENSUS_STALE_DAYS, writeStateAtomic,
} from './config.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.GOV_STATE_FILE || join(SCRIPT_DIR, '.gov-checker-state.json');
const HB_STATE = process.env.GOV_HB_STATE || join(SCRIPT_DIR, '.gov-heartbeat-state.json');
const STAGING_REPO = process.env.GOV_STAGING_REPO || '/home/deploy/dawntrader';
const RUN_REMOTE = process.env.GOV_REMOTE === '1';
const STAGING = process.env.GOV_STAGING || 'deploy@188.245.193.8';

// The three dedupe keys this process owns. `openAlertIds` (the heartbeat state file and the
// decision's input) is keyed by THESE, never by handle field names (Langston, §10i Q3).
export const SILENT_KEY = 'governance-checker-silent';
export const CENSUS_SILENT_KEY = 'gov-census-silent';
export const MISTAKEPASS_SILENT_KEY = 'gov-mistakepass-silent';

const DAY_MS = 86400000;

// ── PURE DECISION (unit-tested; no IO) ─────────────────────────────────────────

// The dead-man test: silent when no tick has ever been recorded or the last one is older than
// TICK_MINUTES × HEARTBEAT_MISS_LIMIT (strictly).
// ⛔ Step 4 BLOCKER-1 (Langston, 2026-09-30): the pre-P28 expression failed OPEN on exactly the corruption
// the census legs fail CLOSED on — a present-but-non-finite lastTick made `NaN > staleMs` false (not
// silent), and a far-future lastTick made the difference negative (not silent, permanently). Either value
// silently disabled the only live leg. Both are now SILENT. A future tick within the window (clock skew,
// `future+5m` in the differential) stays not-silent, as before. The differential missed this because its
// states were derived from the branches the code already had — a missing branch cannot be enumerated
// that way (`enumerator-blind-spot`); the two states now exist there, with the divergence pinned.
export function pollerSilent(lastTick, nowMs) {
  const staleMs = TICK_MINUTES * HEARTBEAT_MISS_LIMIT * 60 * 1000;
  if (lastTick == null) return true;
  if (!Number.isFinite(lastTick)) return true;
  if (lastTick - nowMs > staleMs) return true;
  return (nowMs - lastTick) > staleMs;
}

// One liveness leg (census or mistake pass). Its anchor is the LATER of the last run and the
// moment the flag was first seen on (P40 writes both into the poller's state file), so a
// re-enable does not inherit an old silence. Defined cases:
//   • disabled → no intent at all (neither open nor resolve; see the resolve rule below).
//   • both anchors null → no intent: the since-key does not exist yet, and a missing anchor is
//     never read as 0 (a Math.max(null, null) would make every enabled leg instantly stale).
//   • an anchor present but not a finite number → OPEN (the state is unreadable, so silence
//     cannot be ruled out); this can never resolve, because a resolve needs positive freshness.
//   • stale is STRICTLY more than CENSUS_STALE_DAYS since the anchor.
// A resolve is emitted only on POSITIVE evidence of freshness, with a handle to clear.
function livenessIntent(key, what, enabled, lastAt, enabledSince, openId, nowMs) {
  if (!enabled) return null;
  const present = [lastAt, enabledSince].filter((v) => v != null);
  if (present.length === 0) return null;
  const bad = present.filter((v) => !Number.isFinite(v));
  if (bad.length > 0) {
    return openId ? null : { dedupeKey: key, severity: 'warning', action: 'open', unreadable: true,
      reason: `${what} is enabled but its state is unreadable (lastAt=${JSON.stringify(lastAt)}, enabledSince=${JSON.stringify(enabledSince)})` };
  }
  const anchor = Math.max(...present);
  const ageDays = (nowMs - anchor) / DAY_MS;
  const stale = (nowMs - anchor) > CENSUS_STALE_DAYS * DAY_MS;
  const facts = `last run ${lastAt == null ? 'never' : new Date(lastAt).toISOString()}; ` +
    `enabled since ${enabledSince == null ? 'unrecorded' : new Date(enabledSince).toISOString()}; ` +
    `${ageDays.toFixed(1)} days since the later of the two (limit ${CENSUS_STALE_DAYS})`;
  if (stale && !openId) return { dedupeKey: key, severity: 'warning', action: 'open', reason: `${what} is enabled but silent: ${facts}` };
  if (!stale && openId) return { dedupeKey: key, severity: 'warning', action: 'resolve', reason: `${what} ran again: ${facts}` };
  return null;
}

// Langston's signature (scope §10i Q3). Returns every intent this run should act on; the shell
// performs them. `openAlertIds` maps dedupe key → the open alert's id (absent/null = none open).
export function decideHeartbeat({ lastTick, lastCensusAt, lastMistakePassAt, censusEnabledSince,
  mistakePassEnabledSince, censusEnabled, mistakePassEnabled, openAlertIds }, nowMs) {
  const open = openAlertIds ?? {};
  const intents = [];
  const silent = pollerSilent(lastTick, nowMs);
  if (silent && !open[SILENT_KEY]) {
    intents.push({ dedupeKey: SILENT_KEY, severity: 'warning', action: 'open',
      reason: lastTick == null ? 'no poller tick recorded'
        : !Number.isFinite(lastTick) ? `the recorded last poller tick is not a time (${JSON.stringify(lastTick).slice(0, 40)})`
        : lastTick > nowMs ? `the recorded last poller tick is ${Math.round((lastTick - nowMs) / 60000)}m in the FUTURE`
        : `last poller tick ${Math.round((nowMs - lastTick) / 60000)}m ago` });
  } else if (!silent && open[SILENT_KEY]) {
    intents.push({ dedupeKey: SILENT_KEY, severity: 'warning', action: 'resolve',
      reason: `poller ticks resumed (last tick ${Math.round((nowMs - lastTick) / 60000)}m ago)` });
  }
  for (const leg of [
    livenessIntent(CENSUS_SILENT_KEY, 'the weekly plan census', censusEnabled, lastCensusAt, censusEnabledSince, open[CENSUS_SILENT_KEY], nowMs),
    livenessIntent(MISTAKEPASS_SILENT_KEY, 'the weekly mistake-pattern pass', mistakePassEnabled, lastMistakePassAt, mistakePassEnabledSince, open[MISTAKEPASS_SILENT_KEY], nowMs),
  ]) if (leg) intents.push(leg);
  // Step 4 G5-1 (Langston): a flag turned OFF never clears its alert (a flip must not silence a governance
  // alarm) — but it must not sit there unread either. The shell logs these notes to the journal each run.
  const notes = [];
  for (const [key, enabled] of [[CENSUS_SILENT_KEY, censusEnabled], [MISTAKEPASS_SILENT_KEY, mistakePassEnabled]]) {
    if (!enabled && open[key]) notes.push(`${key} is still OPEN (${open[key]}) but its flag is now OFF — `
      + 'it is left open on purpose (a resolve needs positive freshness); resolve it by hand once the reason is settled');
  }
  return { intents, notes };
}

// The alert text for an OPEN intent. The silent-poller TITLE is the pre-P28 text. Its BODY changed once,
// deliberately, AFTER the byte-parity was recorded (Step 4 G5-7, Langston; the parity commit is the one before
// this): the parent read "last tick: never ago" when no tick was recorded, and would have read "NaNm ago" for
// the junk tick BLOCKER-1 now catches. The tick clause now says what is actually known.
export function heartbeatAlertText(intent, { nowMs, lastTick }) {
  if (intent.dedupeKey === SILENT_KEY) {
    const tick = lastTick == null ? 'no tick has ever been recorded'
      : !Number.isFinite(lastTick) ? 'the recorded last tick is not a time'
      : lastTick > nowMs ? `the recorded last tick is ${Math.round((lastTick - nowMs) / 60000)}m in the future`
      : `last tick: ${Math.round((nowMs - lastTick) / 60000)}m ago`;
    return {
      title: 'governance-checker appears SILENT — no tick within the dead-man window',
      body: `The governance-checker poller has not written a heartbeat in over ${TICK_MINUTES * HEARTBEAT_MISS_LIMIT}m (${tick}). It may be dead — enforcement is OFF until it resumes. Check the governance-checker.timer on staging.`,
    };
  }
  if (intent.dedupeKey !== CENSUS_SILENT_KEY && intent.dedupeKey !== MISTAKEPASS_SILENT_KEY) {
    throw new Error(`heartbeatAlertText: no text for dedupe key ${intent.dedupeKey}`);
  }
  const what = intent.dedupeKey === CENSUS_SILENT_KEY ? 'weekly plan census' : 'weekly mistake-pattern pass';
  const flag = intent.dedupeKey === CENSUS_SILENT_KEY ? 'WEEKLY_CENSUS_ENABLED' : 'MISTAKE_PASS_ENABLED';
  // Step 4 G5-2 (Langston): an UNREADABLE anchor gets its own title — it must not assert an age nobody
  // measured (#546: an absent input must not wear a measured value's clothes). Same dedupe key.
  if (intent.unreadable) {
    return {
      title: `governance-checker ${what} state is UNREADABLE — silence cannot be ruled out`,
      body: `${flag} is true in config.mjs, but the poller's record of the ${what} cannot be read (${intent.reason}), so ` +
        `whether it has run is unknown. Check the poller's state file on staging. This alert cannot clear itself: it needs a ` +
        `readable record showing a recent ${what}.`,
    };
  }
  return {
    title: `governance-checker ${what} is SILENT — enabled, but no run in over ${CENSUS_STALE_DAYS} days`,
    body: `${flag} is true in config.mjs, but the governance checker has recorded no ${what} within ${CENSUS_STALE_DAYS} days ` +
      `(${intent.reason}). The weekly gate may be failing without raising its failure alert. Check the governance-checker ` +
      `poller's journal on staging. This clears on the first heartbeat run after a ${what} is recorded.`,
  };
}

// Performs the intents through an injected sink and returns the next `openAlertIds`.
// #637: a handle is nulled ONLY on a confirmed clear — discarding it on a failed resolve was the
// half that made the dead-man alert unrecoverable (alert still open, the only id that could close
// it thrown away in the same statement). An add that prints no id leaves the handle null, as before.
export function applyHeartbeatIntents(intents, openAlertIds, sink, { nowMs, lastTick, gradedRefSha }) {
  const next = { ...(openAlertIds ?? {}) };
  for (const intent of intents) {
    if (intent.action === 'open') {
      const { title, body } = heartbeatAlertText(intent, { nowMs, lastTick });
      next[intent.dedupeKey] = sink.add(intent.dedupeKey, intent.severity, title, body, nowMs);
    } else if (intent.action === 'resolve') {
      if (sink.resolve(next[intent.dedupeKey], gradedRefSha)) next[intent.dedupeKey] = null;
    } else {
      throw new Error(`applyHeartbeatIntents: unknown action ${JSON.stringify(intent.action)} for ${intent.dedupeKey}`);
    }
  }
  return next;
}

// ── IO SHELL ───────────────────────────────────────────────────────────────────

function runCli(cmd) {
  return RUN_REMOTE ? execFileSync('ssh', [STAGING, cmd], { encoding: 'utf8' })
                    : execFileSync('bash', ['-lc', cmd], { encoding: 'utf8' });
}
function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
function addAlert(dedupeKey, severity, title, body, nowMs) {
  const meta = JSON.stringify({ dedupe_key: dedupeKey, source: 'governance-checker-heartbeat' });
  // --dedupe-key (Langston, Step 4 part 2 finding): the key rode ONLY inside --metadata, so these rows carried a
  // null top-level dedupe_key and got no server-side suppression — if the id regex below ever misses, the next
  // run mints a second alert. The CLI's --dedupe-key (B-STAGING-LIVENESS-WATCH) makes the store refuse the repeat.
  const cmd = `cd ${STAGING_REPO} && npm run -s system-alerts -- add --triggers-at ${new Date(nowMs).toISOString()} ` +
    `--category governance --severity ${severity} --dedupe-key ${shq(dedupeKey)} --title ${shq(title)} --body ${shq(body)} --metadata ${shq(meta)}`;
  const out = runCli(cmd);
  const m = out.match(/"id":\s*"([0-9a-f-]+)"/);
  return m ? m[1] : null;
}
// #637: was `resolve <id> --by …` with NO `--evidence`. `scripts/system-alerts.ts`
// made that flag MANDATORY at B-GOV-INTEGRITY-1 (2026-07-10) and exits 1 without
// it — so this ALREADY throws on every call, the catch swallows it, and the
// caller then discarded the id unconditionally. Net effect: the dead-man alert
// could never be cleared and nothing retained the handle to retry.
// Returns TRUE only on a confirmed clear.
// ⚠️ The catch is LOAD-BEARING in the good case (CC-A): a genuinely ALREADY-TERMINAL
// alert must not blow up the heartbeat run. So distinguish the two rather than
// removing it — terminal is benign, anything else is a real failure and must be loud.
function resolveAlert(id, evidence) {
  const ev = resolveEvidenceOrSentinel(evidence);
  try {
    runCli(`cd ${STAGING_REPO} && npm run -s system-alerts -- resolve ${id} --by governance-checker-heartbeat --evidence ${ev}`);
    return true;
  } catch (err) {
    const out = `${err?.stdout ?? ''}${err?.stderr ?? ''}${err?.message ?? ''}`;
    // ⛔ ANCHORED TO THE CLI'S ACTUAL MESSAGE SHAPE (Langston Step-4 blocker).
    // A bare `not found` substring ALSO matches `bash: npm: command not found`
    // and `node: not found` — the classic non-login-PATH failure under a systemd
    // timer. That would return true, null hb.alertId, and REINTRODUCE #637
    // exactly: alert still open, handle discarded, nothing able to retry.
    // ⚠️ `already resolved` / `terminal` were DEAD alternatives and are removed:
    // server/services/system-alerts.ts:461-498 has NO terminal-state guard, so
    // re-resolving a resolved alert SUCCEEDS and re-stamps it — it never errors.
    // The only benign failure the CLI actually emits is :303 `Alert <id> not found`.
    if (/Alert \S+ not found/i.test(out)) return true; // benign: the row is genuinely gone
    console.error(`[gov-heartbeat] resolve FAILED for ${id} (id RETAINED for retry): ${out.slice(0, 300)}`);
    return false;
  }
}

export function checkHeartbeat(nowMs = Date.now()) {
  // ⛔ No catch here: an unreadable heartbeat state file throws out of the run, which fails the
  // systemd unit loudly (P64's no-catch rule, §10j 3(d)) rather than defaulting to "nothing open"
  // and re-opening an alert that is already open.
  const hb = existsSync(HB_STATE) ? JSON.parse(readFileSync(HB_STATE, 'utf8')) : {};
  // The pre-P28 file held ONE handle, `alertId`, for the silent-poller alert. Carry it into the
  // keyed map so an alert open across the upgrade keeps its handle. `alertId` WINS whenever it is
  // present: this version always writes it equal to openAlertIds[SILENT_KEY], so the two differ only
  // when a reverted (pre-P28) version wrote `alertId` last and carried this map forward stale — and
  // then `alertId` is the live handle (a stale map entry would orphan the alert it opened).
  const openAlertIds = { ...(hb.openAlertIds ?? {}) };
  if ('alertId' in hb) openAlertIds[SILENT_KEY] = hb.alertId ?? null;
  else if (!(SILENT_KEY in openAlertIds)) openAlertIds[SILENT_KEY] = null;
  let st = null;
  if (existsSync(STATE_FILE)) {
    try { st = JSON.parse(readFileSync(STATE_FILE, 'utf8')); } catch { /* unreadable → treat as silent */ }
  }
  const lastTick = st?.lastTick ?? null;
  const { intents, notes } = decideHeartbeat({
    lastTick,
    lastCensusAt: st?.lastCensusAt ?? null,
    lastMistakePassAt: st?.lastMistakePassAt ?? null,
    censusEnabledSince: st?.censusEnabledSince ?? null,
    mistakePassEnabledSince: st?.mistakePassEnabledSince ?? null,
    censusEnabled: WEEKLY_CENSUS_ENABLED,
    mistakePassEnabled: MISTAKE_PASS_ENABLED,
    openAlertIds,
  }, nowMs);
  for (const n of notes) console.warn(`[gov-heartbeat] ${n}`);
  // #637: the resolve evidence is the sha the poller last GRADED at (it writes null on a tick that
  // graded nothing); resolveEvidenceOrSentinel turns a missing or non-sha value into the sentinel.
  const next = applyHeartbeatIntents(intents, openAlertIds, { add: addAlert, resolve: resolveAlert },
    { nowMs, lastTick, gradedRefSha: st?.gradedRefSha ?? null });
  // `alertId` is still written, mirroring the silent handle, so a revert of this commit reads the
  // handle it expects instead of orphaning an open alert and adding a second one.
  // G5-6(a): through the shared atomic writer (config.mjs) — a torn HB_STATE threw on every run, forever.
  writeStateAtomic(HB_STATE, { alertId: next[SILENT_KEY] ?? null, openAlertIds: next });
  return { silent: pollerSilent(lastTick, nowMs), lastTick, intents };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = checkHeartbeat();
  console.log(`[gov-heartbeat] silent=${r.silent} lastTick=${r.lastTick}`);
}
