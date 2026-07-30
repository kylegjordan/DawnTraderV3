// B-GOV poller — pure decision-logic tests (no git, no ssh, no filesystem).
// Run: node scripts/governance-checker/poller.test.mjs
import { computeBatchStates, decideAlerts, applyCutoff, anchorClosedBatches, decideOrphanSweep, decideStaleOpenAlertDrops } from './poller.mjs';
import { batchIdToFileRegex, extractBatchId, extractLeadingBatchId, parentBatchId } from './config.mjs';

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
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
  const stubGap = () => ({ required: { sim: false, system_manual: false } });
  const { toOpen } = decideAlerts(states, noStaleOpen, NOW, { docsetCheck: stubGap });
  ok('doc-gap opens for missing sim', hasKey(toOpen, 'gov-docgap:P19-B9:sim'));
  ok('doc-gap opens for missing system_manual', hasKey(toOpen, 'gov-docgap:P19-B9:system_manual'));
}

// ── doc-set gap RESOLVES when the doc is later supplied (Langston Step-4 a / Obj-13) ──
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
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
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
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

// ── B-GOV-3 OBJ-1: grandfather cutoff (key on lastCode/close; straddlers enforced) ──
{
  const CUTOFF = Date.parse('2026-06-15T00:00:00Z');
  const at = (d) => Date.parse(d + 'T00:00:00Z');
  const before = { batchId: 'B-OLD', firstCode: at('2026-06-10'), lastCode: at('2026-06-12'), hasGovernance: true };
  const after = { batchId: 'B-NEW', firstCode: at('2026-06-16'), lastCode: at('2026-06-17'), hasGovernance: true };
  const straddler = { batchId: 'B-STRAD', firstCode: at('2026-06-13'), lastCode: at('2026-06-16'), hasGovernance: true }; // started before, closes after
  const nullcode = { batchId: 'B-NULL', firstCode: null, lastCode: null, hasGovernance: true };
  const kept = applyCutoff([before, after, straddler, nullcode], CUTOFF).map((b) => b.batchId);
  ok('OBJ-1: pre-cutoff close is grandfathered (filtered out)', !kept.includes('B-OLD'));
  ok('OBJ-1: post-cutoff close is enforced (kept)', kept.includes('B-NEW'));
  ok('OBJ-1: straddler (started before, closes AFTER cutoff) is STILL enforced', kept.includes('B-STRAD'));
  ok('OBJ-1: no-code-close (lastCode null) is grandfathered', !kept.includes('B-NULL'));
}

// ── #605: the deadline's CLEAR-condition is anchored, and re-propagation survives the pin ──
// Both of these MUST FAIL with the #605 pin reverted (mutation-proof), or they assert nothing.
{
  const at = (d) => Date.parse(d);
  // (1) THE DEFECT ITSELF: a closed batch whose governance commit has scrolled out of the -n300
  // window arrives with hasGovernance FALSE (that is what the window-scoped :64 write produces).
  // Pre-fix the deadline gate at :207 would not resolve, and :208 would re-open forever.
  const agedOut = { batchId: 'B-AGED', lastCode: at('2026-07-25T00:00:00Z'),
    completionAddTime: at('2026-06-01T00:00:00Z'), scopeAddTime: at('2026-05-31T00:00:00Z'),
    hasGovernance: false };
  anchorClosedBatches([agedOut]);
  ok('#605: closed batch with out-of-window governance is pinned hasGovernance=true (deadline can clear)',
    agedOut.hasGovernance === true);

  // (2) CRY-SILENCE FENCE: a genuinely ungoverned / never-closed batch must NOT be pinned, so it
  // keeps alerting. B-REGIME-INPUTS-LIVE is the live case (no completion report on disk at all).
  const neverClosed = { batchId: 'B-REGIME-INPUTS-LIVE', lastCode: at('2026-07-20T00:00:00Z'),
    completionAddTime: null, scopeAddTime: at('2026-07-19T00:00:00Z'), hasGovernance: false };
  anchorClosedBatches([neverClosed]);
  ok('#605 cry-silence fence: never-closed batch is NOT pinned (stays overdue)',
    neverClosed.hasGovernance === false && neverClosed.hasCompletionReport === false);

  // (2b) ★ LANGSTON Step-4 ②: the REOPENED case was unfenced for the NEW pin. The existing
  // re-open test asserts only lastCode + cutoff and never sets hasGovernance at all, so nothing
  // stopped a reopened batch from being pinned. The pin lives under `closed && !reopened`, so a
  // genuine post-close scope rev must NOT pin — otherwise re-opening a batch would silence its
  // deadline forever, which is the cry-silence failure wearing a different hat.
  const reopenedPin = { batchId: 'B-RE-PIN', lastCode: at('2026-07-25T00:00:00Z'),
    completionAddTime: at('2026-06-10T00:00:00Z'), scopeAddTime: at('2026-07-24T00:00:00Z'),
    hasGovernance: false };
  anchorClosedBatches([reopenedPin]);
  ok('#605: REOPENED batch is NOT pinned (deadline still enforceable after a post-close scope rev)',
    reopenedPin.hasGovernance === false);
  ok('#605: REOPENED batch keeps its recent lastCode (no close-event pin)',
    reopenedPin.lastCode === at('2026-07-25T00:00:00Z'));

  // (3) ★ LANGSTON-REQUIRED #508 REGRESSION FENCE. The child→parent propagation runs inside
  // computeBatchStates (:527); anchorClosedBatches runs later (:538). Without re-propagating after
  // the pin, a closed sub-batch that aged out pins itself and its PARENT's deadline goes unsatisfied
  // — the exact P19-B8.4 false-overdue #508 killed. Silent: throws nothing, and the :305/:325/:326
  // tests inject states directly so they cannot catch it.
  const child = { batchId: 'P19-B8.4b', lastCode: at('2026-07-25T00:00:00Z'),
    completionAddTime: at('2026-06-01T00:00:00Z'), scopeAddTime: at('2026-05-31T00:00:00Z'),
    hasGovernance: false };
  const parent = { batchId: 'P19-B8.4', lastCode: at('2026-07-25T00:00:00Z'),
    completionAddTime: null, scopeAddTime: at('2026-05-30T00:00:00Z'), hasGovernance: false };
  const parentBare = { batchId: 'P19-B8', lastCode: at('2026-07-25T00:00:00Z'),
    completionAddTime: null, scopeAddTime: at('2026-05-30T00:00:00Z'), hasGovernance: false };
  anchorClosedBatches([child, parent, parentBare]);
  ok('#605/#508: pinned child re-propagates to dotted parent (parent deadline still satisfied)',
    parent.hasGovernance === true);
  ok('#605/#508: pinned child re-propagates transitively to bare parent',
    parentBare.hasGovernance === true);
  ok('#605/#508: re-propagation does NOT fabricate a completion report for the parent',
    parent.hasCompletionReport === false);
}

// ── B-GOV-4 OBJ-1: leading-token extraction (a mid-subject ref must not establish a batch) ──
{
  ok('OBJ-1: leading bare batch-id extracts', extractLeadingBatchId('P19-B6.6 Step-1: scope') === 'P19-B6.6');
  ok('OBJ-1: leading id with adjacent context extracts', extractLeadingBatchId('B-DIAG-387 (#387): fix') === 'B-DIAG-387');
  ok('OBJ-1: MID-subject reference does NOT extract (null)',
    extractLeadingBatchId('Governance: concretize #350 B-GOV-4 home') === null);
  ok('OBJ-1: plain-descriptor commit does NOT extract', extractLeadingBatchId('MEMORY_CC_A: state refresh') === null);
  ok('OBJ-1: leading whitespace tolerated', extractLeadingBatchId('  B-GOV-4 Step-3: code') === 'B-GOV-4');
  const cs = computeBatchStates([{ date: iso(1), subject: 'Governance ledger: home parser-fix at #350 -> B-GOV-4', files: ['1-system-manual/RUNNING_ISSUES.md'] }]);
  ok('OBJ-1: computeBatchStates ignores a mid-subject B-GOV-4 reference', !cs.batches.some((b) => b.batchId === 'B-GOV-4'));
}

// ── B-GOV-4 OBJ-2: multi-hyphen-name capture (no B-TEC-SELFHEAL → B-TEC truncation) ──
{
  ok('OBJ-2: B-TEC-SELFHEAL captured WHOLE (not truncated to B-TEC)', extractBatchId('B-TEC-SELFHEAL Step-3: fix') === 'B-TEC-SELFHEAL');
  ok('OBJ-2: B-LANGSTON-QUEUE-345 captured whole', extractBatchId('B-LANGSTON-QUEUE-345 close') === 'B-LANGSTON-QUEUE-345');
  ok('OBJ-2: B-GOV-2 still captured whole (regression)', extractBatchId('B-GOV-2 shipped') === 'B-GOV-2');
  ok('OBJ-2: B-GOV still captured (regression)', extractBatchId('B-GOV done') === 'B-GOV');
  ok('OBJ-2: B-NAMES.1 sub-suffix still captured (regression)', extractBatchId('B-NAMES.1 foo') === 'B-NAMES.1');
  ok('OBJ-2: B-NEW-40 still routed to the B-NEW pattern (regression)', extractBatchId('B-NEW-40 soak finding') === 'B-NEW-40');
  ok('OBJ-1+2: leading B-TEC-SELFHEAL extracts whole', extractLeadingBatchId('B-TEC-SELFHEAL Step-10/11: close') === 'B-TEC-SELFHEAL');
}

// ── B-GOV-4 OBJ-3: anchorClosedBatches — pin closed-quiescent to the close event; re-open re-enrolls ──
// NOTE: scopeAddTime here is what scopeCommitTime returns = the LATEST scope first-add (Math.max), so
// a value AFTER completionAddTime models a genuine post-close scope rev (realistic re-open), not a
// fabricated first-scope-after-close (Langston Step-4 Finding 1 — the Math.min inertness is fixed).
{
  const CUT = Date.parse('2026-06-23T00:00:00Z');
  const at = (d) => Date.parse(d);
  const closedRemention = { batchId: 'B-NEW-40', lastCode: at('2026-06-25T10:00:00Z'),
    completionAddTime: at('2026-05-18T00:00:00Z'), scopeAddTime: at('2026-05-17T00:00:00Z') };
  anchorClosedBatches([closedRemention]);
  ok('OBJ-3: closed-quiescent batch pinned to completion-report add (immune to re-mention)',
    closedRemention.lastCode === at('2026-05-18T00:00:00Z'));
  ok('OBJ-3: pinned closed batch is grandfathered (cutoff filters it out)', applyCutoff([closedRemention], CUT).length === 0);
  ok('OBJ-3: hasCompletionReport set true for a closed batch', closedRemention.hasCompletionReport === true);

  const reopened = { batchId: 'B-RE', lastCode: at('2026-06-25T00:00:00Z'),
    completionAddTime: at('2026-06-10T00:00:00Z'), scopeAddTime: at('2026-06-24T00:00:00Z') };
  anchorClosedBatches([reopened]);
  ok('OBJ-3: re-opened batch (LATEST scope add > completion add = a post-close scope rev) keeps recent lastCode + re-enrolls',
    reopened.lastCode === at('2026-06-25T00:00:00Z') && applyCutoff([reopened], CUT).length === 1);

  const sameCommit = { batchId: 'B-SAME', lastCode: at('2026-06-25T00:00:00Z'),
    completionAddTime: at('2026-05-01T00:00:00Z'), scopeAddTime: at('2026-05-01T00:00:00Z') };
  anchorClosedBatches([sameCommit]);
  ok('OBJ-3: scope add == completion add is NOT a re-open (strict >, stays pinned)', sameCommit.lastCode === at('2026-05-01T00:00:00Z'));

  const newBatch = { batchId: 'P19-B9', lastCode: at('2026-06-25T00:00:00Z'), completionAddTime: null, scopeAddTime: at('2026-06-24T00:00:00Z') };
  anchorClosedBatches([newBatch]);
  ok('OBJ-3: new batch (no completion report) keeps lastCode + hasCompletionReport=false (still graded)',
    newBatch.lastCode === at('2026-06-25T00:00:00Z') && newBatch.hasCompletionReport === false);
}

// ── B-GOV-4 OBJ-4: doc-set SENTINEL — the gap fires only once the completion report is present ──
{
  const stubGap = () => ({ required: { sim: false } });
  const preReport = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: false }];
  ok('OBJ-4: governance present but NO completion report → no doc-gap (close-before-docset race eliminated)',
    !hasKey(decideAlerts(preReport, noStaleOpen, NOW, { docsetCheck: stubGap }).toOpen, 'gov-docgap:P19-B9:sim'));
  const postReport = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
  ok('OBJ-4: completion report present + doc missing → doc-gap fires',
    hasKey(decideAlerts(postReport, noStaleOpen, NOW, { docsetCheck: stubGap }).toOpen, 'gov-docgap:P19-B9:sim'));
  const noReportOverdue = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: false, hasCompletionReport: false }];
  ok('OBJ-4: a no-report/abandoned batch still fires the DEADLINE (deadline independent of sentinel — does not go dark)',
    hasKey(decideAlerts(noReportOverdue, noStaleOpen, NOW).toOpen, 'gov-deadline:P19-B9'));
}

// ── B-GOV-4 OBJ-4b: orphan sweep RE-VERIFIES at the ref — present→resolve, still-missing→keep ──
{
  const openKeys = ['gov-docgap:OLD-CLOSED:sim', 'gov-docgap:OLD-GAP:pre_audit', 'gov-docgap:IN-WIN:scope'];
  const enforceableIds = new Set(['IN-WIN']);   // only IN-WIN is still in this tick's window
  const verify = (bid) => bid === 'OLD-CLOSED'; // OLD-CLOSED's doc is now present; OLD-GAP is still missing
  const { resolve, keep } = decideOrphanSweep(openKeys, enforceableIds, verify);
  ok('OBJ-4b: out-of-window orphan whose doc is NOW present → resolved', resolve.includes('gov-docgap:OLD-CLOSED:sim'));
  ok('OBJ-4b: out-of-window orphan whose doc is STILL missing → KEPT (no cry-silence on a real aged-out gap)',
    keep.includes('gov-docgap:OLD-GAP:pre_audit'));
  ok('OBJ-4b: in-window key is NOT swept (handled by decideAlerts)',
    !resolve.includes('gov-docgap:IN-WIN:scope') && !keep.includes('gov-docgap:IN-WIN:scope'));
}

// ── B-GOV-ORPHAN-CLASS OBJ-1: confirmed class-override suppresses under-declared AT SOURCE (no flap) ──
{
  const base = { batchId: 'P19-BOV', classDeclared: true, declaredClass: 'non_architecture', files: ['server/services/strategy-engine.ts'], hasGovernance: true };
  const noOvr = decideAlerts([base], noStaleOpen, NOW, { shadow: false, coreEngineCheck: () => true });
  ok('OBJ-1: non_arch + core paths, NO override → under-declared opens', hasKey(noOvr.toOpen, 'gov-underdeclared:P19-BOV'));
  const ovr = decideAlerts([base], noStaleOpen, NOW, { shadow: false, coreEngineCheck: () => true, confirmedOverride: (b) => b === 'P19-BOV' });
  ok('OBJ-1: confirmed override → under-declared NOT opened (suppress-at-source)', !hasKey(ovr.toOpen, 'gov-underdeclared:P19-BOV'));
  ok('OBJ-1: confirmed override → under-declared resolved via else (no flap: not in both lists)',
    ovr.toResolveKeys.includes('gov-underdeclared:P19-BOV') && !hasKey(ovr.toOpen, 'gov-underdeclared:P19-BOV'));
}

// ── B-GOV-ORPHAN-CLASS OBJ-2: orphan sweep resolves out-of-window classundeclared when class IS declared ──
{
  const openKeys = ['gov-classundeclared:OLD-DECL', 'gov-classundeclared:OLD-UNDECL', 'gov-classundeclared:IN-WIN'];
  const enforceableIds = new Set(['IN-WIN']);
  const isClassDeclared = (bid) => bid === 'OLD-DECL';   // OLD-DECL has header/override; OLD-UNDECL doesn't
  const { resolve, keep } = decideOrphanSweep(openKeys, enforceableIds, () => false, isClassDeclared);
  ok('OBJ-2: out-of-window classundeclared with declared class → resolved', resolve.includes('gov-classundeclared:OLD-DECL'));
  ok('OBJ-2: out-of-window classundeclared still undeclared → KEPT (no cry-silence)', keep.includes('gov-classundeclared:OLD-UNDECL'));
  ok('OBJ-2: in-window classundeclared NOT swept (handled by decideAlerts)',
    !resolve.includes('gov-classundeclared:IN-WIN') && !keep.includes('gov-classundeclared:IN-WIN'));
}

// ── B-GOV-ORPHAN-CLASS OBJ-3: class-aware verify resolves a NOT-owed doc, keeps a genuinely-missing required one ──
{
  const requiredByClass = { 'OLD-HOTFIX': new Set(['changes_and_fixes']) };  // hotfix owes only changes_and_fixes
  const present = new Set();                                                  // nothing physically present
  const verify = (bid, doc) => present.has(`${bid}:${doc}`) || !(requiredByClass[bid]?.has(doc)); // mirrors the real class-aware verifyDoc
  const openKeys = ['gov-docgap:OLD-HOTFIX:system_manual', 'gov-docgap:OLD-HOTFIX:changes_and_fixes'];
  const { resolve, keep } = decideOrphanSweep(openKeys, new Set(), verify);
  ok('OBJ-3: hotfix doc NOT required for class → resolved', resolve.includes('gov-docgap:OLD-HOTFIX:system_manual'));
  ok('OBJ-3: hotfix REQUIRED doc genuinely missing → KEPT', keep.includes('gov-docgap:OLD-HOTFIX:changes_and_fixes'));
}

// ── B-GOV-ORPHAN-CLASS OBJ-4: store-reconcile drops resolved-in-store keys, fail-OPEN on unreadable store ──
{
  const openAlerts = { 'gov-docgap:A:sim': 'id-live', 'gov-classundeclared:B': 'id-dead' };
  const drops = decideStaleOpenAlertDrops(openAlerts, new Set(['id-live']));  // id-dead no longer live
  ok('OBJ-4: key whose id is not live → dropped', drops.includes('gov-classundeclared:B'));
  ok('OBJ-4: key whose id IS live → kept', !drops.includes('gov-docgap:A:sim'));
  ok('OBJ-4: store unreadable (liveIds null) → drop NOTHING (fail-open)', decideStaleOpenAlertDrops(openAlerts, null).length === 0);
}

// ── #508: sub-batch governance satisfies the PARENT's deadline (the P19-B8.4 false-overdue) ──
{
  const commits = [
    { date: iso(6), subject: 'P19-B8.4 Part-2a: S21 accumulator', files: ['server/x.ts'] },
    { date: iso(5), subject: 'P19-B8.4b Step-5: engine emits', files: ['server/y.ts'] },
    { date: iso(4), subject: 'P19-B8.4b Step-10/11: governance close', files: ['1-system-manual/BATCH_CATALOG.md'] },
  ];
  const { batches } = computeBatchStates(commits);
  const parent = batches.find((b) => b.batchId === 'P19-B8.4');
  const child = batches.find((b) => b.batchId === 'P19-B8.4b');
  ok('#508: child governance propagates to parent (deadline satisfied)', parent?.hasGovernance === true);
  ok('#508: child keeps its own governance', child?.hasGovernance === true);
}
{
  // no propagation when the child has code but NO governance
  const commits = [
    { date: iso(6), subject: 'P19-B9 Step-3 code', files: ['server/x.ts'] },
    { date: iso(5), subject: 'P19-B9.1 Step-3 code only', files: ['server/y.ts'] },
  ];
  const { batches } = computeBatchStates(commits);
  ok('#508: code-only child does NOT satisfy parent', batches.find((b) => b.batchId === 'P19-B9')?.hasGovernance === false);
}
{
  // transitive: letter sub-batch → dotted parent → bare parent (only ids that EXIST get set)
  const commits = [
    { date: iso(6), subject: 'P19-B8 umbrella code', files: ['server/a.ts'] },
    { date: iso(5), subject: 'P19-B8.5 tune code', files: ['server/b.ts'] },
    { date: iso(4), subject: 'P19-B8.5a governance close', files: ['1-system-manual/PHASE_HISTORY.md'] },
  ];
  const { batches } = computeBatchStates(commits);
  ok('#508: transitive to dotted parent', batches.find((b) => b.batchId === 'P19-B8.5')?.hasGovernance === true);
  ok('#508: transitive to bare parent', batches.find((b) => b.batchId === 'P19-B8')?.hasGovernance === true);
}
{
  // letter-named ids are NOT parent/child in parentBatchId (P-form family only). NOTE:
  // extractLeadingBatchId('B-NEW-53.1 …') already yields 'B-NEW-53' (pre-existing pattern —
  // the .1 never reaches propagation), so the guard here is the pure function's null.
  ok('#508: parentBatchId(B-NEW-53.1) is null (no letter-named propagation)', parentBatchId('B-NEW-53.1') === null);
  ok('#508: parentBatchId(B-GOV-4) is null', parentBatchId('B-GOV-4') === null);
  ok('#508: parentBatchId(P19-B8.4b) → P19-B8.4', parentBatchId('P19-B8.4b') === 'P19-B8.4');
  ok('#508: parentBatchId(P19-B8.5) → P19-B8', parentBatchId('P19-B8.5') === 'P19-B8');
  ok('#508: parentBatchId(P19-B8) is null (top of chain)', parentBatchId('P19-B8') === null);
}

console.log(`\nPoller logic tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
