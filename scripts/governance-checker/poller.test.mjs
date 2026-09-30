// B-GOV poller — pure decision-logic tests (no git, no ssh, no filesystem).
// Run: node scripts/governance-checker/poller.test.mjs
import { computeBatchStates, decideAlerts, applyCutoff, anchorClosedBatches, decideOrphanSweep, decideStaleOpenAlertDrops, makeVerifyLedgerRow, parseExceptions, parseExceptionsLegacy, decideMalformedAlerts } from './poller.mjs';
import { batchIdToFileRegex, extractBatchId, extractLeadingBatchId, parentBatchId, resolveEvidenceOrSentinel, LEDGER_ROWS, DOCS, VALID_CLASSES, UMBRELLA_NOT_IMPLEMENTED, EXCEPTIONS_MALFORMED_PREFIX, EXCEPTIONS_MALFORMED_TYPE_CAP, isoWeek } from './config.mjs';
import { ledgerRowInText, checkLedgerRows } from './checker.mjs';

const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-06-17T12:00:00Z');
const iso = (hAgo) => new Date(NOW - hAgo * HOUR).toISOString();
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.log(`  FAIL: ${name} ${extra}`); } };
const hasKey = (arr, k) => arr.some((a) => a.dedupeKey === k);
const noStaleOpen = { open: new Set(), openSince: new Map(), naConfirmed: new Set() };
// B-TASK-LIST-SLOT (#1009): decideAlerts now grades ledger rows for any batch with a completion report,
// and its default reads git. Every pre-existing test that sets hasCompletionReport injects this stub so
// the suite stays pure (no git, no network) — the row logic has its own tests at the foot of the file.
const noRows = () => ({});

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
  const { toOpen, toResolveKeys } = decideAlerts(states, noStaleOpen, NOW, { ledgerRowCheck: noRows, docsetCheck: stubNoGap });
  ok('governance push resolves the deadline alert', toResolveKeys.includes('gov-deadline:P19-B9'));
  ok('no deadline re-opened once governance present', !hasKey(toOpen, 'gov-deadline:P19-B9'));
}

// ── doc-set gap: opens for missing required, distinct from deadline (C8) ────────
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
  const stubGap = () => ({ required: { sim: false, system_manual: false } });
  const { toOpen } = decideAlerts(states, noStaleOpen, NOW, { ledgerRowCheck: noRows, docsetCheck: stubGap });
  ok('doc-gap opens for missing sim', hasKey(toOpen, 'gov-docgap:P19-B9:sim'));
  ok('doc-gap opens for missing system_manual', hasKey(toOpen, 'gov-docgap:P19-B9:system_manual'));
}

// ── doc-set gap RESOLVES when the doc is later supplied (Langston Step-4 a / Obj-13) ──
{
  const states = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
  const stubPresent = () => ({ required: { sim: true } });
  const { toOpen, toResolveKeys } = decideAlerts(states, noStaleOpen, NOW, { ledgerRowCheck: noRows, docsetCheck: stubPresent });
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
  const { toOpen, toResolveKeys } = decideAlerts(states, exc, NOW, { ledgerRowCheck: noRows, docsetCheck: stubGap });
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
  // window arrives with hasGovernance FALSE (that is what `computeBatchStates`' window-scoped
  // `if (governance) s.hasGovernance = true;` produces).
  // Pre-fix `decideAlerts` block (1) — clear is `toResolveKeys.push(deadlineKey)` under an
  // `if (s.hasGovernance)` test — would not resolve, and the `Governance overdue:` mint would
  // re-open forever.
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
  // `computeBatchStates` (which calls `propagateGovernanceToParents` inline); `anchorClosedBatches`
  // is called LATER in the same tick. Without re-propagating after
  // the pin, a closed sub-batch that aged out pins itself and its PARENT's deadline goes unsatisfied
  // — the exact P19-B8.4 false-overdue #508 killed. Silent: throws nothing, and the pre-existing
  // #508 propagation assertions inject states directly (never calling `anchorClosedBatches`), so
  // they cannot catch it.
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
    !hasKey(decideAlerts(preReport, noStaleOpen, NOW, { ledgerRowCheck: noRows, docsetCheck: stubGap }).toOpen, 'gov-docgap:P19-B9:sim'));
  const postReport = [{ batchId: 'P19-B9', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
  ok('OBJ-4: completion report present + doc missing → doc-gap fires',
    hasKey(decideAlerts(postReport, noStaleOpen, NOW, { ledgerRowCheck: noRows, docsetCheck: stubGap }).toOpen, 'gov-docgap:P19-B9:sim'));
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

// ─── #637: resolve-evidence token shape — ONE SSOT shared by TWO processes ───
// WARNING ON SCOPE: these fence the PURE helper the poller and the SEPARATE
// heartbeat process now share. They do NOT exercise heartbeat-check's resolve
// branch, which shells out via execFileSync with no injection seam - that half
// is covered by the live staging run. Saying so because #594's lesson was a
// suite that fenced the READER while the defect lived in the WRITER.
ok('#637 a real sha passes through unchanged',
  resolveEvidenceOrSentinel('b7471a28c') === 'b7471a28c'
  && resolveEvidenceOrSentinel('0464c8219031') === '0464c8219031');
ok('#637 null/undefined yield the sanctioned sentinel and never throw',
  resolveEvidenceOrSentinel(null) === 'NO-EVIDENCE-GIVEN'
  && resolveEvidenceOrSentinel(undefined) === 'NO-EVIDENCE-GIVEN');
ok('#637 a plausible-but-invalid token is rejected to the sentinel (a lastTick is not a ref)',
  resolveEvidenceOrSentinel('1785485897377') === 'NO-EVIDENCE-GIVEN'
  && resolveEvidenceOrSentinel('lastTick=123') === 'NO-EVIDENCE-GIVEN'
  && resolveEvidenceOrSentinel('') === 'NO-EVIDENCE-GIVEN');

// ── B-TASK-LIST-SLOT (#1009) P1: the Tier-1 task-list ledger row, graded inside the completion report ──
// SEEDED cases (pre-audit P1 S1-S6). S7 — the real reports at the ref — needs git and is run by
// ledger-rows-preview.mjs, not here.
{
  const spec = LEDGER_ROWS.task_lists;
  const S1 = '| T1 | the four session task lists | ✅ **mine** / `N/A` ×3 | `CC_A_SESSION_TASK_LIST.md` updated; the other three are not mine to touch |';
  ok('S1: "✅ mine / N/A ×3" table row PASSES (N/A-not-mine is the correct answer on three of four)', ledgerRowInText(S1, spec));
  ok('S2: four ✅ verdicts PASS', ledgerRowInText('| **T1** | the four session task lists | ✅ | ✅ | ✅ | ✅ |', spec));
  ok('S3: task lists named in PROSE — even carrying a ✅ — FAIL (not a table row)',
    !ledgerRowInText("**Batch Catalog · Phase History · this batch's Scope · the session task lists (✅ mine) · this Completion Report**", spec));
  ok('S3b: PROSE containing a pipe before a check mark FAILS (only a line that BEGINS with a pipe is a table row)',
    !ledgerRowInText('The ledger for the session task lists | ✅ mine was filled in after review.', spec));
  const S4 = '| **T1** | ★ **THE FOUR SESSION TASK LISTS** — `CC_A` · `CC_B` · `CC_C` · `CC_INFRA` `_SESSION_TASK_LIST.md` | ⛔ **EVERY batch close, EVERY class (Kyle 2026-09-05).** |  |  |';
  ok('S4: the skill\'s own row pasted with its verdict cells EMPTY FAILS', !ledgerRowInText(S4, spec));
  ok('S4b: every verdict N/A (own list not updated) FAILS', !ledgerRowInText('| T1 | the four session task lists | N/A ×4 | not touched |', spec));
  ok('S5: ledger with the row ABSENT FAILS — other ✅ rows do not satisfy it',
    !ledgerRowInText('| T1 | `BATCH_CATALOG.md` | ✅ | entry added |\n| T1 | `PHASE_HISTORY.md` | ✅ | entry added |', spec));
  ok('S5b: CRLF report text still grades', ledgerRowInText(`| x |\r\n${S1}\r\n`, spec));
  ok('S5c: a row with no trailing pipe still grades', ledgerRowInText('| T1 | session task lists | ✅ mine', spec));
  ok('S5d: unreadable report (null) FAILS and never throws', !ledgerRowInText(null, spec));
  // r2 — the object-round reader's six misjudgements, each reproduced on the r1 matcher before this fix
  ok('R1: an OBJECTIVES row mentioning a task list with ✅ does NOT satisfy the ledger row',
    !ledgerRowInText('| OBJ-3 | move CC_A task list | ✅ done |', spec));
  ok('R2: an explicit ❌ verdict is not rescued by a ✅ in a later note cell',
    !ledgerRowInText('| T1 | the four session task lists | ❌ | ✅ (Langston: must fix) |', spec));
  ok('R3: a ledger row inside a code fence is not a ledger row',
    !ledgerRowInText('```\n| T1 | the four session task lists | ✅ | x |\n```', spec));
  ok('R4: "N/A ×3 / ✅ mine" PASSES — the verdict cell leads with N/A and carries the own-list ✅',
    ledgerRowInText('| T1 | the four session task lists | N/A ×3 / ✅ mine | ok |', spec));
  ok('R5: a linked check mark PASSES', ledgerRowInText('| T1 | the four session task lists | [✅](x.md) | ok |', spec));
  ok('R6: "⚠️ ✅ partial" FAILS — a non-conforming verdict token (workflow-10 defines exactly ✅ and N/A)',
    !ledgerRowInText('| T1 | the four session task lists | ⚠️ ✅ partial | ok |', spec));
  ok('R7: the skill row FILLED IN passes — its ⛔ "when it applies" cell is not read as the verdict',
    ledgerRowInText('| **T1** | ★ **THE FOUR SESSION TASK LISTS** | ⛔ **EVERY batch close, EVERY class** | ✅ mine / N/A ×3 | updated |', spec));
  ok('R8: a filename-only ledger row passes', ledgerRowInText('| T1 | `CC_A_SESSION_TASK_LIST.md` | ✅ | updated |', spec));
  ok('R9: ✅ with a variation selector passes', ledgerRowInText('| T1 | the four session task lists | ✅️ mine | ok |', spec));
  // r3 — object-round reader r2's ten shapes, each reproduced on the r2 matcher (hitprobe2) before this fix
  const F3 = '`'.repeat(3);
  ok('Q1: a NAME cell leading with ✅ is not the verdict; the ❌ is', !ledgerRowInText('| T1 | ✅ session task lists | ❌ not updated |', spec));
  ok('Q2: an N/A note column before the real ✅ verdict PASSES', ledgerRowInText('| T1 | session task lists | N/A for CC-B | ✅ mine |', spec));
  ok('Q3: ❌ with a ✅ later in the SAME cell FAILS', !ledgerRowInText('| T1 | the four session task lists | ❌ not done (should be ✅) | x |', spec));
  ok('Q4: "N/A — not ✅ yet" FAILS (no segment begins with ✅)', !ledgerRowInText('| T1 | the four session task lists | N/A — not ✅ yet | x |', spec));
  ok('Q5: inline code at a line start is not a fence — the row after it PASSES',
    ledgerRowInText(F3 + 'x' + F3 + ' is inline\n| T1 | the four session task lists | ✅ mine | ok |', spec));
  ok('Q6: four-space-indented backticks are not a fence — the row after it PASSES',
    ledgerRowInText('    ' + F3 + '\n| T1 | the four session task lists | ✅ mine | ok |', spec));
  ok('Q7: a ~~~ block is not closed by a backtick line — the example row inside stays hidden',
    !ledgerRowInText('~~~\n' + F3 + '\n| T1 | the four session task lists | ✅ | example |\n~~~', spec));
  ok('Q8: an UNCLOSED fence runs to end of file, as it renders — a row after it FAILS (deliberate)',
    !ledgerRowInText(F3 + 'js\nconst a = 1;\n\n| T1 | the four session task lists | ✅ mine / N/A ×3 | ok |', spec));
  ok('Q9: an OBJECTIVES row using the words (no T1 tier cell) FAILS', !ledgerRowInText('| 3 | move the session task lists to 1-system-manual | ✅ done |', spec));
  ok('Q10: a ledger table inside a blockquote PASSES', ledgerRowInText('> | T1 | session task lists | ✅ mine |', spec));
  ok('Q11: CC-C real row shape — tier and name merged in the first cell — PASSES',
    ledgerRowInText('| T1 · the four session task lists | ✅ **mine** / `N/A — not mine` ×3 — ⚠️ added late | note |', spec));
  ok('Q13: a NAME cell leading with ✅ does not satisfy the row when the real verdict is N/A ×4',
    !ledgerRowInText('| T1 | ✅ session task lists | N/A ×4 |', spec));
  ok('Q14: REAL ROW, B_EXIT_BOOK_AGE_STAMP_COMPLETION_REPORT.md:90 at 33b62ee16 — its verdict cell names CC_C_SESSION_TASK_LIST.md — PASSES',
    ledgerRowInText("| T1 · the four session task lists | ✅ **mine** / `N/A — not mine` ×3 — ⚠️ **added 2026-09-11, late:** `CC_C_SESSION_TASK_LIST.md` did not exist at this 09-07 close (Kyle's rule landed 09-05). It is created in the same commit as this row, on the governance checker's alert `2ec36624`, routed by Langston. The other three lists are not mine to touch. |", spec));
  // r4 — final object-round reader r3
  ok('Z1: T1 at the start of a NOTES cell does not make an objectives row a ledger row',
    !ledgerRowInText('| OBJ-3 | session task lists moved | ✅ | T1 ledger row updated |', spec));
  ok('Z2: a T2 row whose note begins T1 is not the Tier-1 row', !ledgerRowInText('| T2 | session task lists | ✅ | T1 row above covers it |', spec));
  ok('Z3: document cell without "session", verdict cell naming the filename — PASSES',
    ledgerRowInText('| T1 | the four task lists | ✅ `CC_A_SESSION_TASK_LIST.md` updated / N/A ×3 | ok |', spec));
  ok('Z4: bold inside the name still names the row', ledgerRowInText('| T1 | **session** task lists | ✅ mine | ok |', spec));
  ok('Z5: code-marked word inside the name still names the row', ledgerRowInText('| T1 | `session` task lists | ✅ mine | ok |', spec));
  ok('Z6: a non-breaking space inside the name still names the row', ledgerRowInText('| T1 | session\u00a0task lists | ✅ mine | ok |', spec));
  ok('Z7: "N/A ×3 · ✅ mine" — a middle-dot separator — PASSES', ledgerRowInText('| T1 | the four session task lists | N/A ×3 · ✅ mine | ok |', spec));
  ok('Z8: "★ ✅ mine" — a star before the check — PASSES', ledgerRowInText('| T1 | the four session task lists | ★ ✅ mine | ok |', spec));
  ok('Z9: a later NOTES cell beginning ❌ does not veto a ✅ verdict', ledgerRowInText('| T1 | the four session task lists | ✅ mine / N/A ×3 | ❌ none outstanding |', spec));
  // r5 — Langston Step 4 conditions
  ok('W1: a fence INSIDE A BLOCKQUOTE hides the row inside it (it renders as code)',
    !ledgerRowInText('> ' + F3 + '\n> | T1 | the four session task lists | ✅ mine | ok |\n> ' + F3, spec));
  ok('W2: a row inside a multi-line HTML comment does not count (it does not render)',
    !ledgerRowInText('<!--\n| T1 | the four session task lists | ✅ mine | ok |\n-->', spec));
  ok('W3: a single-line HTML comment does not hide the row after it',
    ledgerRowInText('<!-- ledger below -->\n| T1 | the four session task lists | ✅ mine | ok |', spec));
  ok('W4: a GFM row with NO leading pipe PASSES', ledgerRowInText('T1 | session task lists | ✅ mine', spec));
  ok('W5: a tier column spelled "Tier 1" ALERTS — stated in the change list, not relaxed', !ledgerRowInText('| Tier 1 | session task lists | ✅ mine |', spec));
  ok('W6: prose starting "T1" with a single pipe is not a row', !ledgerRowInText('T1 is done for the session task lists | ✅ mine', spec));
  ok('W7 (condition 3): LEDGER_ROWS keys and DOCS keys are disjoint — na-skip values share one namespace',
    Object.keys(LEDGER_ROWS).every((k) => !(k in DOCS)));
  ok('Q12: a 4-backtick fence is closed only by ≥4 backticks — a 3-backtick line inside does not close it',
    !ledgerRowInText('````\n' + F3 + '\n| T1 | the four session task lists | ✅ | example |\n````', spec));
}
// checkLedgerRows with injected readers — the date gate and the read-failure path (reader r1: both untested)
{
  const since = LEDGER_ROWS.task_lists.sinceMs;
  const row = '| T1 | the four session task lists | ✅ mine / N/A ×3 | ok |';
  const io = (reports, addedMs, text) => ({ findGlobDoc: () => reports, completionReportCommitTime: () => addedMs, showFile: () => text });
  const R = ['Claude Comms and Packages/Batch Completion/X_COMPLETION_REPORT.md'];
  ok('CLR1: no completion report → null (not graded)', checkLedgerRows('X', io([], null, row)).task_lists === null);
  ok('CLR2: report first-added BEFORE the row existed → null', checkLedgerRows('X', io(R, since - 1, '')).task_lists === null);
  ok('CLR3: report first-added exactly AT since → graded', checkLedgerRows('X', io(R, since, row)).task_lists === true);
  ok('CLR4: after since, row present → true', checkLedgerRows('X', io(R, since + 1, row)).task_lists === true);
  ok('CLR5: after since, row absent → false', checkLedgerRows('X', io(R, since + 1, '| T1 | `BATCH_CATALOG.md` | ✅ |')).task_lists === false);
  ok('CLR6: after since, unreadable report (null) → false, never throws', checkLedgerRows('X', io(R, since + 1, null)).task_lists === false);
  ok('CLR7: any one of two reports carrying the row satisfies it',
    checkLedgerRows('X', { findGlobDoc: () => ['a_COMPLETION.md', 'b_COMPLETION.md'], completionReportCommitTime: () => since + 1,
      showFile: (p) => (p === 'b_COMPLETION.md' ? row : '') }).task_lists === true);
}
// makeVerifyLedgerRow — the orphan verifier tick() now builds (reader r1: tick wiring untested)
{
  const na = new Set(['OLD-NA:task_lists']);
  const v = (result) => makeVerifyLedgerRow(na, () => result);
  ok('VLR1: row still missing, no N/A → NOT satisfied (alert kept)', v({ task_lists: false })('OLD', 'task_lists') === false);
  ok('VLR2: row missing but a confirmed N/A → satisfied', v({ task_lists: false })('OLD-NA', 'task_lists') === true);
  ok('VLR3: row now present → satisfied', v({ task_lists: true })('OLD', 'task_lists') === true);
  ok('VLR4: report no longer grades (null) → satisfied', v({ task_lists: null })('OLD', 'task_lists') === true);
  ok('VLR5: row name removed from LEDGER_ROWS (undefined) → satisfied, not stranded', v({})('OLD', 'task_lists') === true);
}
{
  const closed = [{ batchId: 'P19-BL', firstCode: NOW - 5 * HOUR, lastCode: NOW - 5 * HOUR, hasGovernance: true, hasCompletionReport: true }];
  const noGap = () => ({ required: {} });
  const run = (states, exc, rows) => decideAlerts(states, exc, NOW, { shadow: false, docsetCheck: noGap, ledgerRowCheck: rows });
  const missing = run(closed, noStaleOpen, () => ({ task_lists: false }));
  ok('P1: row missing → gov-ledgerrow opens at warning',
    missing.toOpen.some((a) => a.dedupeKey === 'gov-ledgerrow:P19-BL:task_lists' && a.severity === 'warning'));
  const present = run(closed, noStaleOpen, () => ({ task_lists: true }));
  ok('P1: row present → resolves and does not open',
    present.toResolveKeys.includes('gov-ledgerrow:P19-BL:task_lists') && !hasKey(present.toOpen, 'gov-ledgerrow:P19-BL:task_lists'));
  const s6 = run(closed, noStaleOpen, () => ({ task_lists: null }));
  ok('S6: report predates the row (null = not graded) → resolves, never opens',
    s6.toResolveKeys.includes('gov-ledgerrow:P19-BL:task_lists') && !hasKey(s6.toOpen, 'gov-ledgerrow:P19-BL:task_lists'));
  const naExc = { open: new Set(), openSince: new Map(), naConfirmed: new Set(['P19-BL:task_lists']) };
  const na = run(closed, naExc, () => ({ task_lists: false }));
  ok('P1: confirmed N/A (na-skip value task_lists) → resolves, does not open',
    na.toResolveKeys.includes('gov-ledgerrow:P19-BL:task_lists') && !hasKey(na.toOpen, 'gov-ledgerrow:P19-BL:task_lists'));
  const openBatch = [{ ...closed[0], hasCompletionReport: false }];
  const notClosed = run(openBatch, noStaleOpen, () => { throw new Error('ledger rows must not be graded before the completion report exists'); });
  ok('P1: no completion report → the row is not graded at all (close-time obligation)',
    !notClosed.toOpen.some((a) => a.dedupeKey.startsWith('gov-ledgerrow:')));
}
{
  const openKeys = ['gov-ledgerrow:OLD-FIXED:task_lists', 'gov-ledgerrow:OLD-MISSING:task_lists', 'gov-ledgerrow:IN-WIN:task_lists'];
  const { resolve, keep } = decideOrphanSweep(openKeys, new Set(['IN-WIN']), () => false, () => false, (bid) => bid === 'OLD-FIXED');
  ok('P1 orphan sweep: out-of-window row now present → resolved', resolve.includes('gov-ledgerrow:OLD-FIXED:task_lists'));
  ok('P1 orphan sweep: out-of-window row still missing → KEPT (no cry-silence)', keep.includes('gov-ledgerrow:OLD-MISSING:task_lists'));
  ok('P1 orphan sweep: in-window row NOT swept (decideAlerts owns it)',
    !resolve.includes('gov-ledgerrow:IN-WIN:task_lists') && !keep.includes('gov-ledgerrow:IN-WIN:task_lists'));
  const dflt = decideOrphanSweep(['gov-ledgerrow:OLD-FIXED:task_lists'], new Set(), () => true);
  ok('P1 orphan sweep: no ledger verifier injected → KEEP, never a silent resolve (the doc-gap verifier does not leak across)',
    dflt.keep.includes('gov-ledgerrow:OLD-FIXED:task_lists'));
}

// ── B-PLAN-CURRENCY-CHECK OBJ-10 (P21-P25): the exceptions-ledger parser behind EXCEPTIONS_V2_ENABLED ──
const exRow = (bid, type, value, by, reason = 'reason') => `| 2026-09-01T00:00:00Z | ${bid} | ${type} | ${value} | ${by} | ${reason} |`;
const exLedger = (...rows) => ['# ledger', '', '| timestamp (UTC) | batch-id | input-type | value | confirmed_by | reason |', '|---|---|---|---|---|---|', ...rows].join('\n');
const malFor = (res, bid) => res.malformed.filter((m) => m.batchId === bid);
{
  // P21 + P22: one row per confirmer form at the ref (HY-A1), and each retirement idiom (HY-A6).
  const raw = exLedger(
    exRow('B-L-EXACT', 'na-skip', 'system_manual', 'langston'),
    exRow('B-L-PAREN', 'na-skip', 'scope', 'langston (routed alert `15c6c33e`, 2026-09-29T14:43Z)'),
    exRow('B-CCC-ALERT', 'open', 'open since 2026-09-03T20:38:36Z (re-justified)', 'cc-c (alert `94c35699`, 2026-09-29)'),
    exRow('B-CCC-EXACT', 'open', 'open since 2026-08-21T00:00:00Z', 'cc-c'),
    exRow('B-CCC-NA', 'na-skip', 'sim', 'cc-c (alert `abc12345`)'),
    exRow('B-HOLD', 'deploy-hold', 'staging held at `bc199185e`', 'cc-b (Langston routed drift rung `d9caf6f5`)'),
    exRow('B-PENDING', 'open', 'open since 2026-06-25', 'pending'),
    exRow('B-PLUS', 'na-skip', 'pre_audit', 'langston+cc-a'),
    exRow('B-LK', 'class-override', 'declared:hotfix', 'langston+kyle'),
    exRow('B-CASE', 'na-skip', 'sim', 'Langston'),
    exRow('B-WITHDRAWN', 'na-skip', 'system_manual', '⛔ **WITHDRAWN 2026-09-01 — THIS ROW SHOULD NOT EXIST.**'),
    exRow('B-COMMA', 'na-skip', 'scope', 'langston,'),
    exRow('B-EMPTY-BY', 'na-skip', 'scope', ''),
    exRow('B-PLUS-BOGUS', 'na-skip', 'scope', 'langston+someone'),
    exRow('B-RET-OPEN', 'open-retired', 'RETIRED 2026-06-26', 'pending'),
    exRow('B-RET-NA', 'na-skip-retired', 'system_manual', '⛔ a withdrawn confirmer'),
    exRow('B-RET-CO', 'class-override-retired', 'declared:nonsense', 'langston'),
    exRow('B-CLOSED', 'closed', 'open since 2026-08-21T00:00:00Z', 'cc-c'),
    exRow('B-CLOSED-BOLD', '**CLOSED 2026-08-26**', 'closed 2026-08-26T18:45:00Z', 'cc-c'),
    exRow('B-UMB-NS', 'umbrella-namespace', 'owns P19-B6.*', 'langston'),
    exRow('B-UMB-DONE', 'umbrella-done', 'done', 'langston'),
    exRow('B-TYPO', 'na_skip', 'sim', 'langston'),
    exRow('B-CAPS', 'Open', 'open since 2026-09-01T00:00:00Z', 'langston'),
    // Q31: retirement is IN-PLACE only — an APPENDED open-retired row beneath a live open row retires nothing (#654).
    exRow('B-APPENDED', 'open', 'open since 2026-07-30T00:00:00Z', 'langston'),
    exRow('B-APPENDED', 'open-retired', 'open since 2026-07-30T00:00:00Z', 'langston'),
    '<!--',
    exRow('B-IN-COMMENT', 'open', 'open since 2026-01-01T00:00:00Z', 'langston', 'a 7-cell line inside a comment'),
    '-->',
  );
  const r = parseExceptions(raw);
  ok('EX P21: header row and separator are neither honoured nor malformed',
    !r.malformed.some((m) => m.batchId === 'batch-id' || /^-+$/.test(m.batchId)));
  ok('EX P21: a 7-cell line inside <!-- … --> is skipped — not honoured, not malformed',
    !r.open.has('B-IN-COMMENT') && malFor(r, 'B-IN-COMMENT').length === 0);
  ok('EX P22: `langston` exact → counts', r.naConfirmed.has('B-L-EXACT:system_manual'));
  ok('EX P22: `langston (routed …)` → counts', r.naConfirmed.has('B-L-PAREN:scope'));
  ok('EX P22: `cc-c (alert …)` on open → counts, with its open-since date',
    r.open.has('B-CCC-ALERT') && r.openSince.get('B-CCC-ALERT') === Date.parse('2026-09-03T20:38:36Z'));
  ok('EX P22: `cc-c` exact on open → counts', r.open.has('B-CCC-EXACT'));
  ok('EX P22: `cc-c (alert …)` on na-skip → NOT permitted, flagged',
    !r.naConfirmed.has('B-CCC-NA:sim') && malFor(r, 'B-CCC-NA').length === 1 && /not permitted for na-skip/.test(malFor(r, 'B-CCC-NA')[0].reason));
  ok('EX P22: `pending` → unconfirmed and SILENT', !r.open.has('B-PENDING') && malFor(r, 'B-PENDING').length === 0);
  ok('EX P22: `langston+cc-a` on na-skip → counts', r.naConfirmed.has('B-PLUS:pre_audit'));
  ok('EX P22: `langston+kyle` → counts', r.classOverride.get('B-LK') === 'hotfix');
  ok('EX P22: `Langston` (case) → counts', r.naConfirmed.has('B-CASE:sim'));
  ok('EX P22: the ⛔ WITHDRAWN cell → unconfirmed AND flagged',
    !r.naConfirmed.has('B-WITHDRAWN:system_manual') && malFor(r, 'B-WITHDRAWN').length === 1);
  ok('EX P22: `langston,` → unconfirmed AND flagged', !r.naConfirmed.has('B-COMMA:scope') && malFor(r, 'B-COMMA').length === 1);
  ok('EX P22: `langston+<non-roster>` → EVERY part must be a roster token: unconfirmed AND flagged',
    !r.naConfirmed.has('B-PLUS-BOGUS:scope') && malFor(r, 'B-PLUS-BOGUS').length === 1 && /is not langston/.test(malFor(r, 'B-PLUS-BOGUS')[0].reason));
  ok('EX P22: an empty confirmer cell → unconfirmed AND flagged', !r.naConfirmed.has('B-EMPTY-BY:scope') && malFor(r, 'B-EMPTY-BY').length === 1);
  ok('EX P23: *-retired rows are skipped whole — not honoured, not flagged, confirmer included',
    ['B-RET-OPEN', 'B-RET-NA', 'B-RET-CO'].every((b) => malFor(r, b).length === 0) &&
    !r.open.has('B-RET-OPEN') && !r.naConfirmed.has('B-RET-NA:system_manual') && !r.classOverride.has('B-RET-CO'));
  ok('EX P23: unknown type `closed` → flagged, not honoured',
    !r.open.has('B-CLOSED') && malFor(r, 'B-CLOSED').length === 1 && malFor(r, 'B-CLOSED')[0].typeSlug === 'closed');
  ok('EX P23: `**CLOSED 2026-08-26**` → flagged with a SLUGGED type token',
    malFor(r, 'B-CLOSED-BOLD').length === 1 && malFor(r, 'B-CLOSED-BOLD')[0].typeSlug === 'closed-2026-08-26');
  ok('EX P23 (R3-Q11 (a)): deploy-hold → neither honoured nor flagged',
    !r.open.has('B-HOLD') && malFor(r, 'B-HOLD').length === 0);
  ok('EX P23 (R1-Q8): umbrella-namespace and umbrella-done → FLAGGED "not implemented — B-UMBRELLA-OPEN-STATE"',
    ['B-UMB-NS', 'B-UMB-DONE'].every((b) => malFor(r, b).length === 1 && malFor(r, b)[0].reason === UMBRELLA_NOT_IMPLEMENTED));
  ok('EX P23: near-miss types (`na_skip`, `Open`) → flagged, never sniffed into a known type',
    malFor(r, 'B-TYPO').length === 1 && malFor(r, 'B-CAPS').length === 1 && !r.naConfirmed.has('B-TYPO:sim') && !r.open.has('B-CAPS'));
  ok('EX Q31: an APPENDED open-retired row retires nothing — the open row still counts', r.open.has('B-APPENDED'));
  ok('EX P21: every malformed entry carries its 1-based line number',
    r.malformed.every((m) => Number.isInteger(m.lineNo) && raw.split('\n')[m.lineNo - 1].includes(`| ${m.batchId} |`)));

  // FLAG OFF = today's exact rule: pinned, so the push is inert to grading while EXCEPTIONS_V2_ENABLED is false.
  const L = parseExceptionsLegacy(raw);
  ok('EX legacy: returns today\'s four outputs and NO malformed list', !('malformed' in L));
  ok('EX legacy: today counts the WITHDRAWN cell and `cc-c` on na-skip (any non-pending confirmer)',
    L.naConfirmed.has('B-WITHDRAWN:system_manual') && L.naConfirmed.has('B-CCC-NA:sim') && L.naConfirmed.has('B-COMMA:scope'));
  ok('EX legacy: today honours the 7-cell line inside the comment (the R2-HY-4 hole)', L.open.has('B-IN-COMMENT'));
  ok('EX legacy: today ignores `closed`, retired and umbrella rows silently',
    !L.open.has('B-CLOSED') && !L.open.has('B-RET-OPEN') && !L.open.has('B-UMB-NS'));
}
{
  // P24: the strict class-override shape. Every declared(+optional heuristic) shape keeps today's class.
  const shapes = [];
  for (const d of VALID_CLASSES) { shapes.push(`declared:${d}`); for (const h of VALID_CLASSES) shapes.push(`declared:${d} heuristic:${h}`); }
  const rows = shapes.map((v, i) => exRow(`B-CO-${i}`, 'class-override', v, 'langston'));
  const good = parseExceptions(exLedger(...rows)), goodL = parseExceptionsLegacy(exLedger(...rows));
  ok(`EX P24: all ${shapes.length} well-formed values accepted with TODAY's class, none flagged`,
    good.malformed.length === 0 && shapes.every((_, i) => good.classOverride.get(`B-CO-${i}`) === goodL.classOverride.get(`B-CO-${i}`) && good.classOverride.has(`B-CO-${i}`)));
  const bad = {
    'B-RECLASS': 'declared:non_architecture reclassified:architecture',
    'B-FOO': 'declared:foo',
    'B-BADHEUR': 'declared:hotfix heuristic:bar',
    'B-TRAIL': 'declared:hotfix heuristic:architecture extra',
    'B-PREFIX': 'note declared:hotfix',
  };
  const b = parseExceptions(exLedger(...Object.entries(bad).map(([bid, v]) => exRow(bid, 'class-override', v, 'langston'))));
  ok('EX P24: each malformed value is IGNORED and FLAGGED — never honoured by a first match',
    Object.keys(bad).every((bid) => !b.classOverride.has(bid) && malFor(b, bid).length === 1 && malFor(b, bid)[0].typeSlug === 'class-override'));
  const bL = parseExceptionsLegacy(exLedger(exRow('B-RECLASS', 'class-override', bad['B-RECLASS'], 'langston')));
  ok('EX P24: control — today\'s first match DOES honour the reclassified value (the defect this closes)',
    bL.classOverride.get('B-RECLASS') === 'non_architecture');
  ok('EX P24: a pending class-override with a bad value stays silent (unconfirmed first)',
    parseExceptions(exLedger(exRow('B-PEND-CO', 'class-override', 'declared:foo', 'pending'))).malformed.length === 0);
}
{
  // P21 (round 2): the rewritten grammar comment, verbatim from GOVERNANCE_EXCEPTIONS.md → 0 rows, 0 malformed,
  // under BOTH rules (the legacy rule reads a 7-cell line as a row, so the comment must hold no `|`).
  const grammar = [
    '<!--',
    'GRAMMAR (B-PLAN-CURRENCY-CHECK OBJ-10, P21-P26; ruled by Langston 2026-09-30, scope §10i). Enforced by parseExceptions in scripts/governance-checker/poller.mjs from the one-line flip of EXCEPTIONS_V2_ENABLED in config.mjs; until that flip the checker applies the legacy rule (exact type match, any non-pending confirmer counts, the first declared:<class> match wins).',
    'input-type, exactly one of:',
    '  honoured: open, na-skip, class-override',
    '  retired (skipped whole, confirmer included): open-retired, na-skip-retired, class-override-retired',
    '  record-only: deploy-hold. No code reads it; the checker neither honours nor flags it. A deploy-hold row does NOT suspend the governance deadline; only an open row does.',
    '  NOT IMPLEMENTED, flagged: umbrella-namespace, umbrella-done (the build is B-UMBRELLA-OPEN-STATE, CC-B)',
    '  anything else is malformed: the row is ignored and raises gov-exceptions-malformed at warning.',
    'confirmed_by: the LEADING word, lowercased, split on +; every part one of langston, kyle, cc-a, cc-b, cc-c, cc-infra. na-skip and class-override need langston or kyle among the parts; open accepts any of the six. pending = unconfirmed and silent. Anything else = unconfirmed and flagged.',
    'value: na-skip = the doc key (or a ledger-row key such as task_lists); open = "open since <ISO>"; class-override = exactly "declared:<class>" or "declared:<class> heuristic:<class>", each class one of architecture, non_architecture, sub_batch, hotfix. Any other class-override value is ignored and flagged.',
    'EDIT RULE: append-only, one row per declaration, with exactly two permitted in-place edits.',
    '  (i) RETIREMENT is a type-cell edit: open to open-retired, na-skip to na-skip-retired, class-override to class-override-retired. An APPENDED retired row retires nothing (#654; alerts 5f64d950, 4e9d0ded, a1dc9d48, 9e08f8d8).',
    '  (ii) a CORRECTION ruled by Langston to a value or reason cell, with the ruling and its date appended to the reason cell.',
    'No line inside this comment may contain the pipe character: a line with 7 or more pipe-separated cells is read as a ledger row by the legacy rule.',
    '-->',
  ].join('\n');
  const g = parseExceptions(grammar), gL = parseExceptionsLegacy(grammar);
  const empty = (e) => e.open.size === 0 && e.naConfirmed.size === 0 && e.classOverride.size === 0;
  ok('EX P21: the rewritten grammar comment yields 0 rows and 0 malformed (new rule)', empty(g) && g.malformed.length === 0);
  ok('EX P21: … and 0 rows under the legacy rule too', empty(gL));
  const unterminated = parseExceptions(exLedger('<!--', exRow('B-SWALLOWED', 'open', 'open since 2026-09-01T00:00:00Z', 'langston')));
  ok('EX P21: an UNTERMINATED <!-- is surfaced as malformed, never swallowed silently',
    !unterminated.open.has('B-SWALLOWED') && unterminated.malformed.length === 1 && unterminated.malformed[0].batchId === '_ledger');
}
{
  // P25 (Q30): malformed rows → gov-exceptions-malformed:<batchId>:<type-slug> at warning; the tick resolves
  // every open key of the prefix that no longer parses malformed.
  const r = parseExceptions(exLedger(
    exRow('B-CLOSED-BOLD', '**CLOSED 2026-08-26**', 'closed', 'cc-c'),
    exRow('B-WD', 'na-skip', 'system_manual', '⛔ **WITHDRAWN 2026-09-01 — THIS ROW SHOULD NOT EXIST.**'),
    exRow('B-WD', 'na-skip', 'sim', 'langston,'),
    exRow('B-LONG', 'x'.repeat(200) + ' ' + '*'.repeat(10), 'v', 'langston'),
  ));
  const d = decideMalformedAlerts(r.malformed, [], 'abc1234def');
  const keys = d.toOpen.map((a) => a.dedupeKey);
  ok('EX P25: a malformed row opens gov-exceptions-malformed at warning',
    keys.includes(`${EXCEPTIONS_MALFORMED_PREFIX}B-CLOSED-BOLD:closed-2026-08-26`) && d.toOpen.every((a) => a.severity === 'warning'));
  ok('EX P25: two malformed rows of one batch+type share ONE key, and the body names both lines',
    keys.filter((k) => k === `${EXCEPTIONS_MALFORMED_PREFIX}B-WD:na-skip`).length === 1 &&
    (d.toOpen.find((a) => a.dedupeKey.endsWith('B-WD:na-skip')).body.match(/line \d+/g) || []).length === 2);
  ok('EX P25: the key\'s type token is slugged and capped — never the raw cell',
    keys.every((k) => /^gov-exceptions-malformed:[A-Za-z0-9._-]+:[a-z0-9-]+$/.test(k)) &&
    keys.every((k) => k.split(':')[2].length <= EXCEPTIONS_MALFORMED_TYPE_CAP));
  ok('EX P25: neither title nor body echoes a raw cell',
    d.toOpen.every((a) => !/WITHDRAWN|⛔|\*\*CLOSED|x{40}/.test(a.title + a.body)));
  ok('EX P25: the body names the graded sha, so a reader can re-derive it', d.toOpen.every((a) => a.body.includes('abc1234def')));
  const stillBad = `${EXCEPTIONS_MALFORMED_PREFIX}B-CLOSED-BOLD:closed-2026-08-26`;
  const fixed = `${EXCEPTIONS_MALFORMED_PREFIX}B-FIXED:closed`;
  const openKeys = [stillBad, fixed, 'gov-docgap:B-FIXED:sim', 'gov-exceptions-unreadable', 'gov-ledgerrow:B-X:task_lists'];
  const d2 = decideMalformedAlerts(r.malformed, openKeys, 'abc1234def');
  ok('EX P25: fixing the row resolves its key; a still-malformed key is not resolved',
    d2.toResolveKeys.includes(fixed) && !d2.toResolveKeys.includes(stillBad));
  ok('EX P25: only keys of its own prefix are ever resolved (gov-docgap / gov-ledgerrow / gov-exceptions-unreadable untouched)',
    d2.toResolveKeys.every((k) => k.startsWith(EXCEPTIONS_MALFORMED_PREFIX)));
  const clean = parseExceptions(exLedger(exRow('B-OK', 'na-skip', 'sim', 'langston'), exRow('B-OK2', 'open', 'open since 2026-09-01T00:00:00Z', 'cc-b')));
  const d3 = decideMalformedAlerts(clean.malformed, [], 'abc1234def');
  ok('EX P25: a correct ledger opens nothing', clean.malformed.length === 0 && d3.toOpen.length === 0 && d3.toResolveKeys.length === 0);
  const sweep = decideOrphanSweep([fixed, stillBad], new Set(), () => true, () => true, () => true);
  ok('EX P25: the key is disjoint from the orphan sweep (the tick owns its resolution)',
    sweep.resolve.length === 0 && sweep.keep.length === 0);
  ok('EX P25: the prefix is disjoint from gov-docgap / gov-ledgerrow / gov-planline',
    !['gov-docgap:', 'gov-ledgerrow:', 'gov-planline'].some((p) => EXCEPTIONS_MALFORMED_PREFIX.startsWith(p) || p.startsWith(EXCEPTIONS_MALFORMED_PREFIX)));
  ok('EX P25: no sha → the body says so rather than inventing one',
    decideMalformedAlerts(r.malformed, [], null).toOpen.every((a) => /sha was unavailable/.test(a.body)));
}

// ─── B-PLAN-CURRENCY-CHECK P27: isoWeek — the weekly gate's week key (UTC, ISO week-year) ───
// Expected outputs stated before the run (pre-audit P27's list, plus the week edges and a year
// whose Jan 1 is a Friday): a wrong week-year or an off-by-one at the Monday/Sunday edge fails here.
{
  const w = (iso) => isoWeek(Date.parse(iso));
  ok('P27 isoWeek 2026-09-28 (Monday) → 2026-W40', w('2026-09-28T00:00:00Z') === '2026-W40', w('2026-09-28T00:00:00Z'));
  ok('P27 isoWeek 2026-10-04 23:59:59Z (Sunday) → still 2026-W40', w('2026-10-04T23:59:59Z') === '2026-W40', w('2026-10-04T23:59:59Z'));
  ok('P27 isoWeek 2026-10-05 → 2026-W41', w('2026-10-05T00:00:00Z') === '2026-W41', w('2026-10-05T00:00:00Z'));
  ok('P27 isoWeek 2026-12-28 → 2026-W53', w('2026-12-28T12:00:00Z') === '2026-W53', w('2026-12-28T12:00:00Z'));
  ok('P27 isoWeek 2027-01-03 → 2026-W53 (the ISO week-year, not the calendar year)', w('2027-01-03T12:00:00Z') === '2026-W53', w('2027-01-03T12:00:00Z'));
  ok('P27 isoWeek 2027-01-04 → 2027-W01', w('2027-01-04T00:00:00Z') === '2027-W01', w('2027-01-04T00:00:00Z'));
  ok('P27 isoWeek 2024-12-30 → 2025-W01 (a December day in the next year\'s week 1)', w('2024-12-30T00:00:00Z') === '2025-W01', w('2024-12-30T00:00:00Z'));
  ok('P27 isoWeek 2021-01-01 (Friday) → 2020-W53', w('2021-01-01T00:00:00Z') === '2020-W53', w('2021-01-01T00:00:00Z'));
  ok('P27 isoWeek 2025-12-31 (Wednesday; its Thursday is 2026-01-01) → 2026-W01', w('2025-12-31T23:00:00Z') === '2026-W01', w('2025-12-31T23:00:00Z'));
  let threw = false; try { isoWeek(NaN); } catch { threw = true; }
  ok('P27 isoWeek throws on a non-finite input rather than keying a week "NaN-WNaN"', threw);
}

console.log(`\nPoller logic tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

