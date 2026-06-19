// B-GOV poller — pure decision-logic tests (no git, no ssh, no filesystem).
// Run: node scripts/governance-checker/poller.test.mjs
import { computeBatchStates, decideAlerts } from './poller.mjs';
import { batchIdToFileRegex } from './config.mjs';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-06-17T12:00:00Z');
const iso = (hAgo) => new Date(NOW - hAgo * HOUR).toISOString();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const hasKey = (arr, k) => arr.some((a) => a.dedupeKey === k);
const noStaleOpen = { open: new Set(), openSince: new Map(), naConfirmed: new Set() };

// ── batchIdToFileRegex exact-not-prefix (Langston Step-4 C8: numeric + bare-letter guards) ──
{
  const re = (bid, name) => batchIdToFileRegex(bid).test(name);
  ok('P19-B6 matches its own completion file', re('P19-B6', 'P19_B6_COMPLETION_REPORT.md'));
  ok('P19-B6 does NOT match P19-B6.5a file (numeric continuation)', !re('P19-B6', 'P19_B6_5a_COMPLETION_REPORT.md'));
  ok('P19-B6 does NOT match P19-B60 (prefix numeral)', !re('P19-B6', 'P19_B60_x.md'));
  ok('P19-B3 does NOT match P19-B3b file (BARE LETTER — the Step-4 hole)', !re('P19-B3', 'P19_B3b_PRE_AUDIT.md'));
  ok('P19-B3b matches its own file', re('P19-B3b', 'P19_B3b_PRE_AUDIT.md'));
  ok('B-NAMES matches its scope but not B-NAMES.1', re('B-NAMES', 'B_NAMES_SCOPE.md') && !re('B-NAMES', 'B_NAMES.1_SCOPE.md'));
}

// ── computeBatchStates ─────────────────────────────────────────────────────────
{
  const commits = [
    { date: iso(3), subject: 'P19-B6 Step-3 code', files: ['server/x.ts'] },
    { date: iso(2), subject: 'P19-B6 governance', files: ['1-system-manual/BATCH_CATALOG.md'] },
    { date: iso(1), subject: 'MEMORY sync', files: ['.claude/memory/MEMORY.md'] },          // housekeeping, no tag
    { date: iso(1), subject: 'misc untagged fix', files: ['server/y.ts'] },                 // untagged CODE
  ];
  const { batches, untaggedCode } = computeBatchStates(commits);
  const b6 = batches.find((b) => b.batchId === 'P19-B6');
  ok('groups P19-B6', !!b6);
  ok('P19-B6 hasGovernance', b6 && b6.hasGovernance === true);
  ok('P19-B6 lastCode = the code commit', b6 && b6.lastCode === Date.parse(iso(3)));
  ok('housekeeping MEMORY not counted as untagged code', untaggedCode === 1, `got ${untaggedCode}`);
}

// ── deadline alert: fires past 4h, not before ──────────────────────────────────
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: false }];
  const { toOpen } = decideAlerts(states, noStaleOpen, NOW);
  ok('deadline fires at 5h with no governance', hasKey(toOpen, 'gov-deadline:P19-B9'));
}
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 2 * HOUR, lastCode: NOW - 2 * HOUR, hasGovernance: false }];
  const { toOpen } = decideAlerts(states, noStaleOpen, NOW);
  ok('deadline does NOT fire at 2h', !hasKey(toOpen, 'gov-deadline:P19-B9'));
}

// ── deadline clears on first governance push (C8) ──────────────────────────────
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true }];
  const stubNoGap = () => ({ required: {} });
  const { toOpen, toResolveKeys } = decideAlerts(states, noStaleOpen, NOW, { docsetCheck: stubNoGap });
  ok('governance push resolves the deadline alert', toResolveKeys.includes('gov-deadline:P19-B9'));
  ok('no deadline re-opened once governance present', !hasKey(toOpen, 'gov-deadline:P19-B9'));
}

// ── doc-set gap: opens for missing required, distinct from deadline (C8) ────────
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true }];
  const stubGap = () => ({ required: { sim: false, system_manual: false } });
  const { toOpen } = decideAlerts(states, noStaleOpen, NOW, { docsetCheck: stubGap });
  ok('doc-gap opens for missing sim', hasKey(toOpen, 'gov-docgap:P19-B9:sim'));
  ok('doc-gap opens for missing system_manual', hasKey(toOpen, 'gov-docgap:P19-B9:system_manual'));
}

// ── doc-set gap RESOLVES when the doc is later supplied (Langston Step-4 a / Obj-13) ──
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true }];
  const stubPresent = () => ({ required: { sim: true } });
  const { toOpen, toResolveKeys } = decideAlerts(states, noStaleOpen, NOW, { docsetCheck: stubPresent });
  ok('doc-gap RESOLVES once the required doc is present', toResolveKeys.includes('gov-docgap:P19-B9:sim'));
  ok('present doc does not (re)open a gap', !hasKey(toOpen, 'gov-docgap:P19-B9:sim'));
}

// ── declared-open suspends deadline; stale-open fires past backstop (C3) ────────
{
  const states = [{ batchId: 'P19-UMB', firstCode: NOW - 10 * HOUR, lastCode: NOW - 10 * HOUR, hasGovernance: false }];
  const exc = { open: new Set(['P19-UMB']), openSince: new Map([['P19-UMB', NOW - 10 * HOUR]]), naConfirmed: new Set() };
  const { toOpen } = decideAlerts(states, exc, NOW);
  ok('declared-open suspends the 10h deadline', !hasKey(toOpen, 'gov-deadline:P19-UMB'));
  ok('not-yet-stale open (<48h) raises nothing', !hasKey(toOpen, 'gov-staleopen:P19-UMB'));
}
{
  const states = [{ batchId: 'P19-UMB', firstCode: NOW - 60 * HOUR, lastCode: NOW - 60 * HOUR, hasGovernance: false }];
  const exc = { open: new Set(['P19-UMB']), openSince: new Map([['P19-UMB', NOW - 60 * HOUR]]), naConfirmed: new Set() };
  const { toOpen } = decideAlerts(states, exc, NOW);
  ok('stale-open fires past 48h backstop', hasKey(toOpen, 'gov-staleopen:P19-UMB'));
}

// ── confirmed N/A clears a doc-gap instead of opening it (Item 3 / Obj-6) ───────
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true }];
  const exc = { open: new Set(), openSince: new Map(), naConfirmed: new Set(['P19-B9:sim']) };
  const stubGap = () => ({ required: { sim: false } });
  const { toOpen, toResolveKeys } = decideAlerts(states, exc, NOW, { docsetCheck: stubGap });
  ok('confirmed N/A does NOT open the doc-gap', !hasKey(toOpen, 'gov-docgap:P19-B9:sim'));
  ok('confirmed N/A resolves any existing doc-gap', toResolveKeys.includes('gov-docgap:P19-B9:sim'));
}

// ── B-GOV-2 OBJ-1: class-undeclared flag (fail-closed) ──
{
  const undeclared = [{ batchId: 'P19-BX', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: false, classDeclared: false, declaredClass: 'architecture' }];
  const { toOpen } = decideAlerts(undeclared, noStaleOpen, NOW, { shadow: false });
  ok('OBJ-1: undeclared class raises gov-classundeclared', hasKey(toOpen, 'gov-classundeclared:P19-BX'));
  const declared = [{ batchId: 'P19-BX', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: false, classDeclared: true, declaredClass: 'sub_batch' }];
  const r2 = decideAlerts(declared, noStaleOpen, NOW, { shadow: false });
  ok('OBJ-1: declared class does NOT raise classundeclared', !hasKey(r2.toOpen, 'gov-classundeclared:P19-BX'));
  ok('OBJ-1: declared class resolves any prior classundeclared', r2.toResolveKeys.includes('gov-classundeclared:P19-BX'));
}

// ── B-GOV-2 OBJ-2: path-heuristic under-declaration guard ──
{
  const coreFiles = ['server/services/signal-orchestrator.ts'];
  const sub = [{ batchId: 'P19-BY', firstCode: NOW - 1 * HOUR, lastCode: NOW - 1 * HOUR, hasGovernance: false, classDeclared: true, declaredClass: 'sub_batch', files: coreFiles }];
  const { toOpen } = decideAlerts(sub, noStaleOpen, NOW, { shadow: false });
  ok('OBJ-2: sub_batch touching core engine → under-declared route', hasKey(toOpen, 'gov-underdeclared:P19-BY'));
  const arch = [{ batchId: 'P19-BZ', firstCode: NOW - 1 * HOUR, lastCode: NOW - 1 * HOUR, hasGovernance: false, classDeclared: true, declaredClass: 'architecture', files: coreFiles }];
  ok('OBJ-2: architecture touching core engine → NOT under-declared', !hasKey(decideAlerts(arch, noStaleOpen, NOW, { shadow: false }).toOpen, 'gov-underdeclared:P19-BZ'));
  const docsOnly = [{ batchId: 'P19-BW', firstCode: NOW - 1 * HOUR, lastCode: NOW - 1 * HOUR, hasGovernance: false, classDeclared: true, declaredClass: 'sub_batch', files: ['1-system-manual/BATCH_CATALOG.md'] }];
  ok('OBJ-2: sub_batch NOT touching core engine → NOT under-declared', !hasKey(decideAlerts(docsOnly, noStaleOpen, NOW, { shadow: false }).toOpen, 'gov-underdeclared:P19-BW'));
}

// ── B-GOV-2 OBJ-4c: OPEN max-age escalation (can't be a permanent bypass) ──
{
  const states = [{ batchId: 'P19-UMB', firstCode: NOW - 200 * HOUR, lastCode: NOW - 200 * HOUR, hasGovernance: false }];
  const exc = { open: new Set(['P19-UMB']), openSince: new Map([['P19-UMB', NOW - 200 * HOUR]]), naConfirmed: new Set() };
  const { toOpen } = decideAlerts(states, exc, NOW, { shadow: false });
  ok('OBJ-4c: OPEN > 7d raises max-age escalation', hasKey(toOpen, 'gov-openmaxage:P19-UMB'));
  ok('OBJ-4c: OPEN > 7d does NOT also raise the 48h stale ping (single tier)', !hasKey(toOpen, 'gov-staleopen:P19-UMB'));
}

// ── B-GOV-2 OBJ-4c hole (Langston Step-4): OPEN with no parseable since-date must NOT silently suspend ──
{
  const states = [{ batchId: 'P19-BAD', firstCode: NOW - 10 * HOUR, lastCode: NOW - 10 * HOUR, hasGovernance: false }];
  const exc = { open: new Set(['P19-BAD']), openSince: new Map(), naConfirmed: new Set() }; // open but NO since-date
  const { toOpen } = decideAlerts(states, exc, NOW, { shadow: false });
  ok('OBJ-4c: OPEN with unparseable since-date raises a malformed-open flag (not silent)', hasKey(toOpen, 'gov-malformed-open:P19-BAD'));
  ok('OBJ-4c: a malformed OPEN still suspends the deadline (no false overdue)', !hasKey(toOpen, 'gov-deadline:P19-BAD'));
}

// ── B-GOV-2 OBJ-5d: shadow mode downgrades severity to info ──
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: false }];
  const shadowed = decideAlerts(states, noStaleOpen, NOW, { shadow: true }).toOpen.find((a) => a.dedupeKey === 'gov-deadline:P19-B9');
  ok('OBJ-5d: shadow mode downgrades deadline alert to info', shadowed && shadowed.severity === 'info');
  const live = decideAlerts(states, noStaleOpen, NOW, { shadow: false }).toOpen.find((a) => a.dedupeKey === 'gov-deadline:P19-B9');
  ok('OBJ-5d: non-shadow keeps deadline at warning', live && live.severity === 'warning');
}

console.log(`\nPoller logic tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
