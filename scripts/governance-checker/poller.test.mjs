// B-GOV poller — pure decision-logic tests (no git, no ssh; the filesystem only where named:
// the P29 presence check reads this directory, and the P64 atomic-write tests use a temp directory).
// Run: node scripts/governance-checker/poller.test.mjs
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeBatchStates, decideAlerts, applyCutoff, anchorClosedBatches, decideOrphanSweep, decideStaleOpenAlertDrops, makeVerifyLedgerRow, parseExceptions, parseExceptionsLegacy, decideMalformedAlerts, DRIFT_LOADED_FILES, checkerCodeDrift, driftAlertBody, writeStateAtomic, resolveGradedRef, checkerResolveEvidence, decidePlanLineAlerts, decidePlanReadAlerts, decidePlanLineTick, runPlanLineRule, makeVerifyPlanLine, planMalformedSignature, PLANLINE_UNREADABLE_KEY, PLANLINE_LISTING_EMPTY_KEY, PLANLINE_MALFORMED_KEY, maybeRunWeekly, buildAddCommand, weekGateMs, weeklySeverity } from './poller.mjs';
import { decideHeartbeat, CENSUS_SILENT_KEY } from './heartbeat-check.mjs';
import { CENSUS_FAILED_KEY, MISTAKEPASS_FAILED_KEY } from './census.mjs';
import { batchIdToFileRegex, extractBatchId, extractLeadingBatchId, parentBatchId, resolveEvidenceOrSentinel, LEDGER_ROWS, DOCS, VALID_CLASSES, UMBRELLA_NOT_IMPLEMENTED, EXCEPTIONS_MALFORMED_PREFIX, EXCEPTIONS_MALFORMED_TYPE_CAP, isoWeek, resolveGovRefEnv, DEFAULT_GOV_REF, GOV_REF, PLAN_LINE } from './config.mjs';
import { ledgerRowInText, checkLedgerRows, __setGitExecForTest, docPresent, resolveGovRefSha, lsTreeNamesAt, showFileAt, planRowsByBatch, statusIsDefault, cellNamesFile, checkPlanState, findGlobDoc } from './checker.mjs';

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

// ── B-PLAN-CURRENCY-CHECK P31: a lowercase letter after a digit, and the T-* form ──
// Planted-fault check (run before trusting these): with config.mjs's B pattern reverted to the pre-P31
// `(?:-[A-Z0-9]+)*` and the T line removed, the first four FAIL (B-RULES phantom; T-* → null).
{
  ok('P31: B-RULES-1e extracts whole (not the phantom B-RULES)', extractLeadingBatchId('B-RULES-1e Step-3: code') === 'B-RULES-1e');
  ok('P31: B-RULES-1a extracts whole', extractLeadingBatchId('B-RULES-1a close') === 'B-RULES-1a');
  ok('P31: `B-RULES-1c/1d x` → B-RULES-1c', extractLeadingBatchId('B-RULES-1c/1d x') === 'B-RULES-1c');
  ok('P31: T-W20C-SCALAR-LEG extracts', extractLeadingBatchId('T-W20C-SCALAR-LEG Step-1: scope') === 'T-W20C-SCALAR-LEG');
  ok('P31 unchanged: B-TEC-SELFHEAL', extractLeadingBatchId('B-TEC-SELFHEAL fix') === 'B-TEC-SELFHEAL');
  ok('P31 unchanged: B-GOV-4', extractLeadingBatchId('B-GOV-4 Step-3') === 'B-GOV-4');
  ok('P31 unchanged: B-NAMES.1', extractLeadingBatchId('B-NAMES.1 foo') === 'B-NAMES.1');
  ok('P31 unchanged: B-NEW-53a', extractLeadingBatchId('B-NEW-53a close') === 'B-NEW-53a');
  ok('P31 unchanged: P19-B6.5a', extractLeadingBatchId('P19-B6.5a Step-3') === 'P19-B6.5a');
  ok('P31 unchanged: a mid-subject B-GOV-4 → null', extractLeadingBatchId('Governance: concretize #350 B-GOV-4 home') === null);
  ok("P31: batchIdToFileRegex('B-RULES-1a') matches B_RULES_1A_COMPLETION_REPORT.md",
    batchIdToFileRegex('B-RULES-1a').test('B_RULES_1A_COMPLETION_REPORT.md'));
  ok("P31: batchIdToFileRegex('T-W20C-SCALAR-LEG') matches T_W20C_SCALAR_LEG_SCOPE.md",
    batchIdToFileRegex('T-W20C-SCALAR-LEG').test('T_W20C_SCALAR_LEG_SCOPE.md'));
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
// heartbeat process now share. heartbeat-check's resolve branch is tested in
// heartbeat-check.test.mjs since P28 (the decision pure, the #637 handle rule
// through an injected sink, and one shell run against an unreachable CLI);
// the CLI call itself succeeding is still covered only by the live staging
// run. Saying so because #594's lesson was a suite that fenced the READER
// while the defect lived in the WRITER.
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
  ok('EX Step-4 CONDITION-1: the unterminated-comment reason names how many table rows it swallowed',
    /including 1 table row/.test(unterminated.malformed[0]?.reason || ''), unterminated.malformed[0]?.reason);

  // Step 4 BLOCKER-1: a valid row carrying an INLINE comment is honoured — with its positive control beside it,
  // and the legacy rule as the reference (it honours both). Plus a close-then-reopen line, which must keep the
  // second comment open.
  const inline = exLedger(
    exRow('B-INLINE', 'na-skip', 'scope', 'langston', 'a note <!-- aside --> and more'),
    exRow('B-CLEAN', 'na-skip', 'scope', 'langston', 'a plain note'),
    exRow('B-TWO-SPANS', 'na-skip', 'scope', 'langston', '<!-- a --> x <!-- b | c --> y'),
  );
  const vi = parseExceptions(inline), li = parseExceptionsLegacy(inline);
  ok('EX BLOCKER-1 control: the legacy rule honours the clean row and the inline-comment row',
    li.naConfirmed.has('B-CLEAN:scope') && li.naConfirmed.has('B-INLINE:scope'));
  ok('EX BLOCKER-1: the new rule honours a row whose note holds a complete <!-- … --> span',
    vi.naConfirmed.has('B-INLINE:scope') && vi.naConfirmed.has('B-CLEAN:scope') && vi.malformed.length === 0, JSON.stringify([...vi.naConfirmed]));
  ok('EX BLOCKER-1: two complete spans on one row (one holding a `|`) are both stripped and the row is honoured',
    vi.naConfirmed.has('B-TWO-SPANS:scope'));
  const reopen = parseExceptions(exLedger('<!-- first', 'still first --> then <!-- second',
    exRow('B-IN-SECOND', 'open', 'open since 2026-09-01T00:00:00Z', 'langston'), '-->'));
  ok('EX BLOCKER-1: a line that closes one comment and opens another keeps the second one open',
    !reopen.open.has('B-IN-SECOND') && reopen.malformed.length === 0);
}
{
  // Step 4 G4-7 (Langston): pin the invariant the flip rests on — on the ledger AS THIS BATCH LEAVES IT, the new
  // rule and the legacy rule return the same honoured sets. A COMMITTED FIXTURE frozen at the G4 push commit,
  // never the live ledger (a legitimate future malformed row must raise its alert, not turn this test red).
  const fx = readFileSync(new URL('./fixtures/exceptions-ledger-at-a3097dc6a.md', import.meta.url), 'utf8');
  const nv = parseExceptions(fx), lv = parseExceptionsLegacy(fx);
  const same = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const sameMap = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
  ok('EX G4-7: the frozen fixture is the real ledger (non-empty sets — the pin can fail)',
    nv.open.size > 0 && nv.naConfirmed.size > 0 && nv.classOverride.size > 0, `${nv.open.size}/${nv.naConfirmed.size}/${nv.classOverride.size}`);
  ok('EX G4-7: new and legacy rules agree on open', same(nv.open, lv.open), `${nv.open.size} vs ${lv.open.size}`);
  ok('EX G4-7: … on naConfirmed', same(nv.naConfirmed, lv.naConfirmed), `${nv.naConfirmed.size} vs ${lv.naConfirmed.size}`);
  ok('EX G4-7: … on classOverride', sameMap(nv.classOverride, lv.classOverride), `${nv.classOverride.size} vs ${lv.classOverride.size}`);
  ok('EX G4-7: … and the new rule finds 0 malformed rows on it', nv.malformed.length === 0, JSON.stringify(nv.malformed));
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

// ─── B-PLAN-CURRENCY-CHECK P29: the drift list covers every checker PROCESS; injectable blobAt ───
// Expected outputs stated first: heartbeat-check.mjs is listed and every listed file exists (a listed
// file absent at both refs is now a counted no-op, so the presence check is what keeps one out of the
// tree); a differing heartbeat blob reads as drift; a README-only difference does not; a file absent at
// BOTH refs is skipped and counted WITHOUT blinding the check for the others (R1-Q15); absent at ONE ref
// and any other read failure still fail OPEN (the 2026-07-11 ruling); the alert body names every file.
{
  const here = dirname(fileURLToPath(import.meta.url));
  ok('P29 heartbeat-check.mjs is in DRIFT_LOADED_FILES', DRIFT_LOADED_FILES.includes('heartbeat-check.mjs'));
  const missing = DRIFT_LOADED_FILES.filter((f) => !existsSync(join(here, f)));
  ok('P29 every DRIFT_LOADED_FILES entry exists beside poller.mjs (a listed-but-absent file is caught here, in CI)',
    missing.length === 0, missing.join(', '));
  const blobs = (over = {}) => (ref, f) => {
    const k = `${ref === 'HEAD' ? 'H' : 'O'}:${f}`;
    if (k in over) { const v = over[k]; if (v instanceof Error) throw v; return v; }
    return f === 'not-yet-created.mjs' ? null : `blob-${f}`;  // a listed name absent at both refs (census.mjs now exists)
  };
  const same = checkerCodeDrift(blobs());
  ok('P29 identical blobs → not drifted', same.drifted === false && !same.error && same.compared.length === DRIFT_LOADED_FILES.length);
  ok('P29 a differing heartbeat-check.mjs blob → drifted', checkerCodeDrift(blobs({ 'O:heartbeat-check.mjs': 'blob-new' })).drifted === true);
  const readme = checkerCodeDrift(blobs({ 'H:README.md': 'r-old', 'O:README.md': 'r-new' }));
  ok('P29 a README-only difference → not drifted (README is not a loaded file)', readme.drifted === false && !readme.error);
  const withCensus = [...DRIFT_LOADED_FILES, 'not-yet-created.mjs'];
  const skip = checkerCodeDrift(blobs(), withCensus);
  ok('P29 a listed file absent at BOTH refs is a no-op, and COUNTED',
    skip.drifted === false && !skip.error && skip.absentBoth.length === 1 && skip.absentBoth[0] === 'not-yet-created.mjs', JSON.stringify(skip));
  const stillSees = checkerCodeDrift(blobs({ 'O:poller.mjs': 'blob-new' }), withCensus);
  ok('P29 ...and does not blind the check: a real poller.mjs difference beside it still reads as drift',
    stillSees.drifted === true && stillSees.absentBoth.length === 1);
  const oneSide = checkerCodeDrift(blobs({ 'O:heartbeat-check.mjs': null }));
  ok('P29 absent at ONE ref only still fails open (the named residual)', oneSide.drifted === false && /absent at .* only/.test(oneSide.error || ''), JSON.stringify(oneSide));
  const broken = checkerCodeDrift(blobs({ 'O:config.mjs': new Error('fatal: Not a valid object name') }));
  ok('P29 any other read failure still fails open (2026-07-11)', broken.drifted === false && /Not a valid object name/.test(broken.error || ''));
  const behind = checkerCodeDrift(blobs({ 'O:poller.mjs': 'blob-with-the-longer-list' }), ['poller.mjs', 'checker.mjs', 'config.mjs']);
  ok('P29 a list extension with the box behind: HEAD\'s old list, poller.mjs blobs differ → drifted', behind.drifted === true);
  const body = driftAlertBody(checkerCodeDrift(blobs({ 'O:poller.mjs': 'blob-new' })));
  const named = (body.match(/loaded-code \(([^)]*)\)/) || [])[1];
  ok('P29 the drift body names every listed file (derived from the array, not hard-coded)',
    named === DRIFT_LOADED_FILES.join('|'), String(named));
}

// ─── B-PLAN-CURRENCY-CHECK P64: saveState is atomic — temp file in the SAME directory, then rename ───
{
  const dir = mkdtempSync(join(tmpdir(), 'gov-state-'));
  const target = join(dir, 'state.json');
  const before = { openAlerts: { 'gov-code-drift': 'id-before' }, lastTick: 1 };
  const after = { openAlerts: { 'gov-code-drift': 'id-after', 'gov-x': 'y'.repeat(5000) }, lastTick: 2 };

  // Expected first (success): the target holds the COMPLETE new state and no temp file is left behind.
  writeFileSync(target, JSON.stringify(before, null, 2));
  writeStateAtomic(target, after);
  ok('P64 success: the target holds the complete new state', JSON.stringify(JSON.parse(readFileSync(target, 'utf8'))) === JSON.stringify(after));
  ok('P64 success: no temp file is left behind', readdirSync(dir).join() === 'state.json', readdirSync(dir).join());

  // Expected first (a REAL failure between the write and the rename): the target is a non-empty
  // DIRECTORY, so the write of the temp file succeeds and the OS refuses the rename (EISDIR on Linux,
  // EPERM on Windows). Expected: the error PROPAGATES (nothing catches it, so the tick dies loudly); the
  // target is untouched (its sentinel file intact — nothing torn reached it); and the complete new JSON
  // sits in a temp file in the SAME directory as the target.
  const dir2 = mkdtempSync(join(tmpdir(), 'gov-state-'));
  const blocked = join(dir2, 'state.json');
  mkdirSync(blocked);
  writeFileSync(join(blocked, 'sentinel'), 'untouched');
  let err = null;
  try { writeStateAtomic(blocked, after); } catch (e) { err = e; }
  ok('P64 induced rename failure: the error propagates (no catch)', err !== null && /EISDIR|EPERM|EEXIST|ENOTEMPTY|EACCES/.test(String(err.code)), String(err?.code));
  ok('P64 induced rename failure: the target is untouched',
    statSync(blocked).isDirectory() && readFileSync(join(blocked, 'sentinel'), 'utf8') === 'untouched');
  const tmps = readdirSync(dir2).filter((f) => f !== 'state.json');
  ok('P64 induced rename failure: the temp file is in the SAME directory as the target', tmps.length === 1 && tmps[0].startsWith('state.json'), tmps.join());
  ok('P64 induced rename failure: the temp file holds the complete new state',
    tmps.length === 1 && JSON.stringify(JSON.parse(readFileSync(join(dir2, tmps[0]), 'utf8'))) === JSON.stringify(after));
  rmSync(dir, { recursive: true, force: true });
  rmSync(dir2, { recursive: true, force: true });
}

// ── B-PLAN-CURRENCY-CHECK P58 (6) / §10j 3(c): ONE GOV_REF/GOV_BRANCH resolution, warned once on divergence ──
// Expected first: neither set → the default, silent; GOV_REF only → it, silent; GOV_BRANCH only → it, silent;
// both set and equal → that value, silent; both set and DIFFERENT → GOV_REF, exactly ONE warning naming both
// values and the winner. Planted fault: returning `branch || ref` (GOV_BRANCH winning) fails the last case;
// deleting the warn call fails its warning count.
{
  const run = (env) => { const w = []; const ref = resolveGovRefEnv(env, (m) => w.push(m)); return { ref, w }; };
  const none = run({});
  ok('P58(6) neither env var set → the default ref, no warning', none.ref === DEFAULT_GOV_REF && none.w.length === 0);
  const refOnly = run({ GOV_REF: 'origin/x' });
  ok('P58(6) GOV_REF only → GOV_REF, no warning', refOnly.ref === 'origin/x' && refOnly.w.length === 0);
  const brOnly = run({ GOV_BRANCH: 'origin/y' });
  ok('P58(6) GOV_BRANCH only → GOV_BRANCH (the alias), no warning', brOnly.ref === 'origin/y' && brOnly.w.length === 0);
  const agree = run({ GOV_REF: 'origin/z', GOV_BRANCH: 'origin/z' });
  ok('P58(6) both set and agreeing → that ref, no warning', agree.ref === 'origin/z' && agree.w.length === 0);
  const differ = run({ GOV_REF: 'origin/a', GOV_BRANCH: 'origin/b' });
  ok('P58(6) both set and DIFFERENT → GOV_REF wins, ONE warning', differ.ref === 'origin/a' && differ.w.length === 1, JSON.stringify(differ));
  ok('P58(6) the warning prints BOTH values and which won',
    /origin\/a/.test(differ.w[0] || '') && /origin\/b/.test(differ.w[0] || '') && /GOV_REF wins/.test(differ.w[0] || ''), differ.w[0]);
  ok('P58(6) the module-level GOV_REF is the same resolution of this process env', GOV_REF === resolveGovRefEnv(process.env, () => {}));
}

// ── B-PLAN-CURRENCY-CHECK N8 (2) / P58: the sha stamped on a doc-set resolve IS the sha the docPresent read used ──
// The git exec is faked: fetch succeeds; `rev-parse` returns sha A on its first call and sha B on any later
// call (a push landing mid-tick); every read records the ref it was given. Expected first: ONE fetch in the
// process (ensureFetched does not fetch again after the resolver); ONE rev-parse; docPresent's ls-tree and
// show calls both read at A; checkerResolveEvidence() === A. Planted faults, each run before trusting the
// pass: (i) the wrappers reading GOV_REF instead of `_resolvedRef ?? GOV_REF` → the reads name
// 'origin/migration/aws-supabase' ≠ A → FAIL; (ii) the resolver not setting `_fetchedThisRun` → a second
// fetch → FAIL; (iii) resolveGradedRef stamping a fresh `rev-parse` → B ≠ A → FAIL.
{
  const A = 'a'.repeat(40), B = 'b'.repeat(40);
  const calls = [];
  let revParses = 0;
  const fake = (cmd, args) => {
    calls.push(args);
    if (args[0] === 'fetch') return '';
    if (args[0] === 'rev-parse') { revParses++; return `${revParses === 1 ? A : B}\n`; }
    if (args[0] === 'ls-tree') return 'Claude Comms and Packages/Batch Completion/B_N8_COMPLETION_REPORT.md\n';
    if (args[0] === 'show') return 'B-N8 entry\nmore\nlines\nhere\nand more\n';
    throw new Error(`unexpected git ${args.join(' ')}`);
  };
  __setGitExecForTest(fake);
  const r = resolveGradedRef();
  const hasReport = docPresent('B-N8', 'completion_report');
  const hasEntry = docPresent('B-N8', 'batch_catalog');
  const evidence = checkerResolveEvidence();
  const reads = calls.filter((a) => a[0] === 'ls-tree' || a[0] === 'show');
  const readRefs = reads.map((a) => (a[0] === 'ls-tree' ? a[2] : a[1].split(':')[0]));
  ok('N8(2) the resolver fetched and resolved sha A', r.fetchOk === true && r.sha === A, JSON.stringify(r));
  ok('N8(2) both docPresent reads happened and found the doc', hasReport === true && hasEntry === true && reads.length === 2);
  ok('N8(2) the evidence stamped on a resolve IS the sha every docPresent read used',
    evidence === A && readRefs.every((x) => x === evidence), JSON.stringify({ evidence, readRefs }));
  ok('N8(2) ONE fetch in the process — ensureFetched does not fetch again after the resolver',
    calls.filter((a) => a[0] === 'fetch').length === 1, JSON.stringify(calls.filter((a) => a[0] === 'fetch')));
  ok('N8(2) ONE rev-parse — a moved ref (B) is never read', revParses === 1);
  ok('N8 the resolution is cached for the process', resolveGovRefSha() === resolveGovRefSha() && revParses === 1);

  // A FAILED fetch is reported, not swallowed: fetchOk false, no sha, the evidence is the honest sentinel,
  // and no second fetch follows (so the tick's gov-fetch-failed path fires, and nothing reads a moved ref).
  const calls2 = [];
  __setGitExecForTest((cmd, args) => {
    calls2.push(args);
    if (args[0] === 'fetch') throw new Error('fatal: unable to access origin');
    if (args[0] === 'ls-tree') return '';
    throw new Error(`unexpected git ${args.join(' ')}`);
  });
  const f = resolveGradedRef();
  docPresent('B-N8', 'completion_report');
  ok('P58(2) a failed fetch is REPORTED (fetchOk false, the error kept, no sha)',
    f.fetchOk === false && /unable to access/.test(f.fetchError) && f.sha === null, JSON.stringify(f));
  ok('P58(2) after a failed fetch the evidence is the sanctioned sentinel, never a stale sha', checkerResolveEvidence() === 'NO-EVIDENCE-GIVEN');
  ok('P58(3) after a failed fetch no second fetch runs and nothing is rev-parsed',
    calls2.filter((a) => a[0] === 'fetch').length === 1 && !calls2.some((a) => a[0] === 'rev-parse'), JSON.stringify(calls2));

  // A rev-parse that does not return a commit sha THROWS (fail-closed) — never a graded sha of null or junk.
  __setGitExecForTest((cmd, args) => (args[0] === 'fetch' ? '' : args[0] === 'rev-parse' ? 'origin/migration/aws-supabase\n' : ''));
  let threw = null;
  try { resolveGovRefSha(); } catch (e) { threw = e; }
  ok('P58 a rev-parse without a commit sha throws out of the resolve (fail-closed)', threw !== null && /not a commit sha/.test(threw.message));

  // explicit-ref readers read exactly the ref they are given, with no fetch
  const calls3 = [];
  __setGitExecForTest((cmd, args) => { calls3.push(args); return args[0] === 'ls-tree' ? 'd/x.md\n' : 'text'; });
  const names = lsTreeNamesAt(A, 'd');
  const text = showFileAt(A, 'd/x.md');
  ok('N8 lsTreeNamesAt / showFileAt read at the given ref and never fetch',
    names.join() === 'x.md' && text === 'text' && calls3.length === 2 && calls3[0][2] === A && calls3[1][1] === `${A}:d/x.md`, JSON.stringify(calls3));
  __setGitExecForTest(null);
  resolveGradedRef(() => ({ fetchOk: false, sha: null })); // leave the poller's module sha as a fresh process has it
}

// ── B-PLAN-CURRENCY-CHECK P32: the PLAN_LINE table — dormant at landing, key disjoint from DOCS and LEDGER_ROWS ──
// Planted faults: `enabled: true` fails the first; `naKey: 'task_lists'` (or any DOCS key) fails the second.
{
  ok('P32 PLAN_LINE.enabled === false at landing (rewritten only by the P61 flip commit)', PLAN_LINE.enabled === false);
  ok('P32 PLAN_LINE.naKey is disjoint from the DOCS and LEDGER_ROWS keys (one flat na-skip namespace)',
    ![...Object.keys(DOCS), ...Object.keys(LEDGER_ROWS)].includes(PLAN_LINE.naKey));
  ok('P32 no sinceMs (re-cut: a state check has no first-add gate)', !('sinceMs' in PLAN_LINE));
  ok('C′ the §5 header carries the report column', PLAN_LINE.s5Header === '| item | owner | closes | report |');
}

// ── B-PLAN-CURRENCY-CHECK P33: planRowsByBatch — the plan-row parser and the exported join (re-cut §1.2) ──
// A synthetic plan in the live plan's shape: a §0 table and a §6 table that must never be read, two §4 wave
// tables, and the §5 table with its C′ report column. Expected first, per case below. Planted faults run before
// trusting the pass: dropping the §4 header-equality check (throw on a mismatched wave header) fails the
// "one of the wave headers differs" case; reading §6 as §5 fails the "§0/§6 never classified" case; a §4 width
// of 8 fails the malformed case.
const H4 = PLAN_LINE.s4Header, H5 = PLAN_LINE.s5Header;
const SEP4 = '|---|---|---|---|---|---|---|', SEP5 = '|---|---|---|---|';
const planFixture = ({ waveB = H4, s5 = [H5], s4a = [], s4b = [], s5rows = [] } = {}) => [
  '# Sprint', '', '## 0. Clear the plates first', '', '| session | item | batch | owner |', '|---|---|---|---|',
  '| 1 | B-ZERO | B-ZERO | CC-A |', '', '## 4. The plan', '', '### Wave A', '', H4, SEP4,
  '| 1 | Plan checker | B-PLAN-X | CC-A (Old Claude) | QUEUED | — | the first row |',
  '| 6 | a pointer | plan row 6 | CC-B | QUEUED | — | x |',
  '| 7 | T-W20C-SCALAR-LEG | — batch named at Step 1 | CC-B | QUEUED | — | item-cell-only id |',
  ...s4a, '', '### Wave B', '', waveB, SEP4,
  '| 9 | **B-BOLD** | `B-BOLD` | CC-C | **QUEUED** | — | marked-up id |',
  ...s4b, '', '## 5. Running now — observation windows', '', ...s5, SEP5,
  '| B-WIN | CC-B | 2026-10-10 | — |', ...s5rows, '',
  '## 6. Who owns what', '', '| session | item | owner | closes |', '|---|---|---|---|', '| CC-A | B-SIX | x | y |', '',
].join('\n');
{
  const j = planRowsByBatch(planFixture());
  ok('P33 a §4 row with its id in the batch cell joins by that id', j.rows.get('B-PLAN-X')?.s4.length === 1 && j.rows.get('B-PLAN-X').s4[0].rowNo === '1');
  ok('P33 a §4 row keeps its status, report and line number', j.rows.get('B-PLAN-X')?.s4[0].status === 'QUEUED' && j.rows.get('B-PLAN-X').s4[0].report === '—' && j.rows.get('B-PLAN-X').s4[0].lineNo === 15);
  ok('P33 `plan row 6` has no id (unparsed)', j.unparsed.some((r) => r.rowNo === '6' && r.id === null));
  ok('P33 an item-cell-only id (the 107/120 shape) has no id (unparsed)', j.unparsed.some((r) => r.rowNo === '7') && !j.rows.has('T-W20C-SCALAR-LEG'));
  ok('P33 a marked-up batch cell (**B-BOLD**, `B-BOLD`) is de-marked before the id is read', j.rows.get('B-BOLD')?.s4.length === 1);
  ok('P33 §0 and §6 lines are never classified', !j.rows.has('B-ZERO') && !j.rows.has('B-SIX') && !j.unparsed.some((r) => r.lineNo < 9 || r.lineNo > 30));
  ok('P33 the §5 row joins by its item cell, with its closes and report cells', j.rows.get('B-WIN')?.s5.length === 1 && j.rows.get('B-WIN').s5[0].closes === '2026-10-10' && j.rows.get('B-WIN').s5[0].report === '—');
  ok('P33 counts: rows4 = every 7-cell numbered §4 row, rows5 = every §5 row', j.rows4 === 4 && j.rows5 === 1, `${j.rows4}/${j.rows5}`);
  ok('P33 no malformed rows in a clean plan', j.malformed.length === 0);
  const m = planRowsByBatch(planFixture({ s4b: ['| 138a | Decide | B-PATTERN-SIZE-CAP-REVIEW | CC-C | DONE | — | SUPERSEDED: | stray |'] }));
  ok('P33 an 8-cell numbered row (the 138a shape) → malformed with its line number and cell count, not a row',
    m.malformed.length === 1 && m.malformed[0].section === 4 && m.malformed[0].rowNo === '138a' && m.malformed[0].cellCount === 8
      && m.malformed[0].lineNo === 24 && !m.rows.has('B-PATTERN-SIZE-CAP-REVIEW'), JSON.stringify(m.malformed));
  const m5 = planRowsByBatch(planFixture({ s5rows: ['| B-OLD | CC-A | 2026-10-02 |'] }));
  ok('P33 a 3-cell line under the 4-cell §5 header (the pre-C′ shape) → malformed §5, rowNo null',
    m5.malformed.length === 1 && m5.malformed[0].section === 5 && m5.malformed[0].rowNo === null && m5.malformed[0].cellCount === 3 && !m5.rows.has('B-OLD'));
  const throws = (text) => { try { planRowsByBatch(text); return null; } catch (e) { return e.message; } };
  ok('P33 all wave headers exact → no throw', throws(planFixture()) === null);
  const wb = throws(planFixture({ waveB: '| # | item | batch / reference | owner | status | report | note | extra |' }));
  ok('P33 ONE of the §4 wave headers with an extra column → throws, naming its line', wb !== null && /line\(s\) 21/.test(wb), wb);
  ok('P33 no §4 header → throws', throws(planFixture().split('\n').filter((l) => l !== H4).join('\n')) !== null);
  ok('P33 no §5 header → throws', /appears 0 times/.test(throws(planFixture({ s5: [] })) || ''));
  ok('P33 the pre-C′ §5 header alone (a lone header edit) → throws', /appears 0 times/.test(throws(planFixture({ s5: ['| item | owner | closes |'] })) || ''));
  ok('P33 two §5 headers → throws', /appears 2 times/.test(throws(planFixture({ s5: [H5, SEP5, H5] })) || ''));
  ok('P33 empty text → throws; null → throws', throws('') !== null && throws('   \n') !== null && throws(null) !== null);
  const crlf = planRowsByBatch(planFixture().replace(/\n/g, '\r\n'));
  ok('P33 CRLF line endings parse the same', crlf.rows.get('B-PLAN-X')?.s4[0].lineNo === 15 && crlf.rows4 === 4);
}

// ── P34: the status and report tests (re-cut §1.4, with Langston §10g N6's case-insensitive prefix) ──
// Expected first; planted faults: an exact `=== 'QUEUED'` status test fails the prefix and lower-case cases;
// dropping the `(?!\.[A-Za-z0-9_-])` guard fails the .bak/.md.2 cases; a `.` in the right boundary class fails
// the sentence-dot passes.
{
  const X = 'B_X_COMPLETION_REPORT.md';
  const st = [
    ['QUEUED', true], ['**QUEUED**', true], ['`QUEUED`', true], ['', true], ['—', true], ['–', true], ['-', true],
    ['— —', true], ['   ', true], ['\u00a0', true], ['\u00a0\u00a0', true],
    ["QUEUED — next in CC-A's list", true], ['queued', true], ['Queued (Kyle)', true],
    ['DONE — decided', false], ['BUILT — deploy after 2026-09-30', false], ['QUEUEDX', false], ['IN FLIGHT — Step 7', false],
  ];
  for (const [cell, want] of st) ok(`P34 statusIsDefault(${JSON.stringify(cell)}) === ${want}`, statusIsDefault(cell) === want);
  const rp = [
    ['`Claude Comms and Packages/Batch Completion/B_X_COMPLETION_REPORT.md`', true], ['`Batch Completion/B_X_COMPLETION_REPORT.md`', true],
    [X, true], ['[report](../Claude Comms and Packages/Batch Completion/B_X_COMPLETION_REPORT.md)', true],
    ['report: `B_X_COMPLETION_REPORT.md`.', true], ['B_X_COMPLETION_REPORT.md.', true],
    ['**`Batch Completion/B_X_COMPLETION_REPORT.md`.**', true], ['B_X_COMPLETION_REPORT.md. Closed.', true],
    ['—', false], ['B_X_PROGRESS_REPORT.md', false], ['OLD_B_X_COMPLETION_REPORT.md', false], ['B_X_COMPLETION_REPORT.md.bak', false],
    ['B_X_COMPLETION_REPORT.md.2', false], ['B_X_COMPLETION_REPORT.md_x', false], ['B_X_COMPLETION_REPORT', false],
  ];
  for (const [cell, want] of rp) ok(`P34 cellNamesFile(${JSON.stringify(cell)}) === ${want}`, cellNamesFile(cell, X) === want);
}

// ── P34: checkPlanState — graded once there is a report and the id is in the plan; per section 0/1/2+ rows ──
{
  const R = (bid) => `${bid.replace(/-/g, '_')}_COMPLETION_REPORT.md`;
  const reportsFor = (have) => (bid) => (have.includes(bid) ? [R(bid)] : []);
  const legOf = (res, bid, leg) => res.legs.find((l) => l.bid === bid && l.leg === leg);
  const s4row = (no, bid, status, report) => `| ${no} | item | ${bid} | CC-A | ${status} | ${report} | note |`;
  const s5row = (bid, report) => `| ${bid} | CC-B | 2026-10-10 | ${report} |`;
  const run = (opts, have) => checkPlanState(planRowsByBatch(planFixture(opts)), reportsFor(have));
  const q = run({}, ['B-PLAN-X']);
  ok('P34 one row QUEUED / — → s4 FAIL on both tests', legOf(q, 'B-PLAN-X', 's4')?.fail === true && legOf(q, 'B-PLAN-X', 's4').why.join('+') === 'status+report');
  ok('P34 a graded id with no §5 line has no s5 leg (not required)', !legOf(q, 'B-PLAN-X', 's5') && q.legs.length === 1);
  ok('P34 an id with no completion report is not graded (no legs)', !q.graded.includes('B-BOLD') && !legOf(q, 'B-BOLD', 's4'));
  const done = run({ s4a: [s4row('2', 'B-DONE', 'DONE — x', `\`Batch Completion/${R('B-DONE')}\``)] }, ['B-DONE']);
  ok('P34 DONE — x + the report named → s4 PASS', legOf(done, 'B-DONE', 's4')?.fail === false && legOf(done, 'B-DONE', 's4').why.length === 0);
  const qn = run({ s4a: [s4row('2', 'B-QN', 'QUEUED — next in the list', R('B-QN'))] }, ['B-QN']);
  ok('P34 `QUEUED — next …` + the report named → s4 FAIL on the status test only (N6: /^queued\\b/i)',
    legOf(qn, 'B-QN', 's4')?.fail === true && legOf(qn, 'B-QN', 's4').why.join('+') === 'status');
  const built = run({ s4a: [s4row('2', 'B-BUILT', 'BUILT — deploy after 2026-09-30', '—')] }, ['B-BUILT']);
  ok('P34 BUILT — … + — → s4 FAIL on the report test only', legOf(built, 'B-BUILT', 's4')?.why.join('+') === 'report');
  const amb = run({ s4a: [s4row('2', 'B-AMB', 'DONE', R('B-AMB'))], s4b: [s4row('36', 'B-AMB', 'DONE', R('B-AMB'))] }, ['B-AMB']);
  const al = legOf(amb, 'B-AMB', 's4');
  ok('P34 an id in two §4 rows → s4 FAIL ambiguous, naming both rows', al?.fail === true && al.why.join() === 'ambiguous' && al.rowNos.join() === '2,36', JSON.stringify(al));
  const s5only = run({}, ['B-WIN']);
  ok('P34 an id in §5 only → an s5 leg only, failing on its report cell `—`',
    legOf(s5only, 'B-WIN', 's5')?.fail === true && legOf(s5only, 'B-WIN', 's5').why.join() === 'report' && !legOf(s5only, 'B-WIN', 's4'));
  const s5ok = run({ s5rows: [s5row('B-WIN2', R('B-WIN2'))] }, ['B-WIN2']);
  ok('P34 a §5 report cell naming the report → s5 PASS (the synthetic §5 PASS fixture; §10h)', legOf(s5ok, 'B-WIN2', 's5')?.fail === false);
  const s5amb = run({ s5rows: [s5row('B-WIN', R('B-WIN'))] }, ['B-WIN']);
  ok('P34 two §5 lines for one id → s5 FAIL ambiguous', legOf(s5amb, 'B-WIN', 's5')?.why.join() === 'ambiguous');
  const both = run({ s4a: [s4row('2', 'B-WIN', 'DONE', R('B-WIN'))] }, ['B-WIN']);
  ok('P34 C3: the §5 leg is required independently of §4 — s4 passes while s5 fails',
    legOf(both, 'B-WIN', 's4')?.fail === false && legOf(both, 'B-WIN', 's5')?.fail === true);
  const any = checkPlanState(planRowsByBatch(planFixture({ s4a: [s4row('2', 'B-TWO', 'DONE', 'B_TWO_B_COMPLETION_REPORT.md')] })),
    () => ['B_TWO_A_COMPLETION_REPORT.md', 'B_TWO_B_COMPLETION_REPORT.md']);
  ok('P34 several resolved reports: naming ANY one of them passes', legOf(any, 'B-TWO', 's4')?.fail === false);
}

// ── P34 (Langston §10g C1): findGlobDoc filters a listing the caller already read — no second ls-tree ──
{
  const calls = [];
  __setGitExecForTest((cmd, args) => { calls.push(args); return ''; });
  const got = findGlobDoc('B-X', 'completion_report', ['B_X_COMPLETION_REPORT.md', 'B_X_PROGRESS_REPORT.md', 'B_Y_COMPLETION_REPORT.md']);
  ok('P34 findGlobDoc(bid, doc, names) filters the given listing', got.length === 1 && /B_X_COMPLETION_REPORT\.md$/.test(got[0]), JSON.stringify(got));
  ok('P34 ...and runs no git at all', calls.length === 0, JSON.stringify(calls));
  __setGitExecForTest(null);
}

// ── B-PLAN-CURRENCY-CHECK P36: decidePlanLineAlerts — per-leg keys, bodies that do not move, the malformed singleton ──
// Expected first, per case. Planted faults run before trusting the pass: ignoring `enabled` fails the flag-off
// case; naming `lineNos` in the body fails the "same string" cases; resolving the malformed key on EVERY tick it
// is open (not only on a signature change) fails the same-signature case; dropping the na-skip check fails it.
{
  const L = (o) => ({ bid: 'B-X', leg: 's4', fail: true, why: ['status', 'report'], rowNos: ['35'], lineNos: [777], reports: ['B_X_COMPLETION_REPORT.md'], ...o });
  const na0 = new Set();
  const off = decidePlanLineAlerts([L()], [{ section: 4, rowNo: '9', lineNo: 5, cellCount: 8 }], na0, { enabled: false, shadow: false });
  ok('P36 flag off → no intents for ANY gov-planline key (FREEZE)', off.toOpen.length === 0 && off.toResolveKeys.length === 0);
  const on = decidePlanLineAlerts([L()], [], na0, { enabled: true, shadow: false });
  const o = on.toOpen.find((a) => a.dedupeKey === 'gov-planline:B-X:s4');
  ok('P36 a failing leg opens its per-leg key at warning', o && o.severity === 'warning');
  ok('P36 the body names the id, the §4 row, the report and the preview command', o && /B-X/.test(o.body) && /§4 row 35/.test(o.body) && /B_X_COMPLETION_REPORT\.md/.test(o.body) && /plan-lines-preview\.mjs/.test(o.body));
  const bodyOf = (leg) => decidePlanLineAlerts([L(leg)], [], na0, { enabled: true, shadow: false }).toOpen.find((a) => a.dedupeKey === 'gov-planline:B-X:s4')?.body;
  const bBoth = bodyOf({}), bStatus = bodyOf({ why: ['status'] }), bReport = bodyOf({ why: ['report'] }), bMoved = bodyOf({ lineNos: [787] });
  ok('P36 N7: the body is the SAME string for a status-only, a report-only and a both-tests failure', bBoth === bStatus && bBoth === bReport);
  ok('P36 N7: ...and for the same row moved down ten lines (no line number in the body)', bBoth === bMoved && !/777|787/.test(bBoth));
  ok('P36 shadow → the per-leg key opens at info', decidePlanLineAlerts([L()], [], na0, { enabled: true, shadow: true }).toOpen[0].severity === 'info');
  const pass = decidePlanLineAlerts([L({ fail: false, why: [] })], [], na0, { enabled: true, shadow: false });
  ok('P36 a passing leg resolves its key', pass.toResolveKeys.includes('gov-planline:B-X:s4') && !pass.toOpen.some((a) => a.dedupeKey.startsWith('gov-planline:')));
  const naSkip = decidePlanLineAlerts([L(), L({ leg: 's5', rowNos: [null] })], [], new Set(['B-X:plan_line']), { enabled: true, shadow: false });
  ok('P36 a confirmed na-skip `B-X:plan_line` resolves BOTH legs', naSkip.toResolveKeys.includes('gov-planline:B-X:s4') && naSkip.toResolveKeys.includes('gov-planline:B-X:s5') && naSkip.toOpen.length === 0);
  const s5 = decidePlanLineAlerts([L({ leg: 's5', rowNos: [null], why: ['report'] })], [], na0, { enabled: true, shadow: false }).toOpen[0];
  ok('P36 an s5 leg opens `gov-planline:<bid>:s5` and names §5, not a row', s5.dedupeKey === 'gov-planline:B-X:s5' && /§5/.test(s5.body) && !/row null/.test(s5.body));
  const amb = decidePlanLineAlerts([L({ why: ['ambiguous'], rowNos: ['35', '36'], lineNos: [1, 2] })], [], na0, { enabled: true, shadow: false }).toOpen[0];
  ok('P36 an ambiguous leg names every row number', /rows 35, 36/.test(amb.body) && /more than one/.test(amb.body));
  const mal = [{ section: 4, rowNo: '138a', lineNo: 256, cellCount: 8 }, { section: 5, rowNo: null, lineNo: 360, cellCount: 3 }];
  const mOpen = decidePlanLineAlerts([], mal, na0, { enabled: true, shadow: false, refSha: 'c'.repeat(40) });
  const mi = mOpen.toOpen.find((a) => a.dedupeKey === PLANLINE_MALFORMED_KEY);
  ok('P36 malformed rows open the singleton, every line number AND cell count in the body, stamped with the ref sha',
    mi && /138a/.test(mi.body) && /line 256, 8 cells/.test(mi.body) && /§5 line 360 \(3 cells\)/.test(mi.body) && mi.body.includes('c'.repeat(40)), mi && mi.body);
  ok('P36 ...and does not resolve it when it is not open', !mOpen.toResolveKeys.includes(PLANLINE_MALFORMED_KEY));
  const sig = planMalformedSignature(mal);
  const same = decidePlanLineAlerts([], mal, na0, { enabled: true, shadow: false, malformedOpen: true, malformedSig: sig });
  ok('P36 open under the SAME signature → no resolve (the add is deduped; no flap)', !same.toResolveKeys.includes(PLANLINE_MALFORMED_KEY) && same.malformedSig === sig);
  const moved = decidePlanLineAlerts([], [{ ...mal[0], lineNo: 257 }, mal[1]], na0, { enabled: true, shadow: false, malformedOpen: true, malformedSig: sig });
  ok('P36 open under a DIFFERENT signature (a row moved a line) → resolve AND open again',
    moved.toResolveKeys.includes(PLANLINE_MALFORMED_KEY) && moved.toOpen.some((a) => a.dedupeKey === PLANLINE_MALFORMED_KEY) && moved.malformedSig !== sig);
  const none = decidePlanLineAlerts([], [], na0, { enabled: true, shadow: false, malformedOpen: true, malformedSig: sig });
  ok('P36 no malformed rows → the singleton resolves; signature null', none.toResolveKeys.includes(PLANLINE_MALFORMED_KEY) && none.malformedSig === null);
  ok('P36 the signature is over content (rowNo+lineNo+cellCount), order-independent',
    planMalformedSignature([mal[1], mal[0]]) === sig && planMalformedSignature([{ ...mal[0], cellCount: 9 }, mal[1]]) !== sig && planMalformedSignature([]) === null);
}

// ── P38: decidePlanReadAlerts — two unreadable keys, each decided by its own read (N7) ──
{
  const r = (o) => decidePlanReadAlerts({ refSha: 'd'.repeat(40), shadow: false, ...o });
  const bad = r({ planError: 'a §4 table header differs', listingEmpty: false });
  ok('P38 plan unreadable → `gov-planline-unreadable` opens (warning); the listing key resolves',
    bad.toOpen.length === 1 && bad.toOpen[0].dedupeKey === PLANLINE_UNREADABLE_KEY && bad.toOpen[0].severity === 'warning' && bad.toResolveKeys.join() === PLANLINE_LISTING_EMPTY_KEY);
  const empty = r({ planError: null, listingEmpty: true });
  ok('P38 listing empty → `gov-planline-listing-empty` opens (warning), naming the listing; the plan key resolves',
    empty.toOpen.length === 1 && empty.toOpen[0].dedupeKey === PLANLINE_LISTING_EMPTY_KEY && /Batch Completion/.test(empty.toOpen[0].body) && empty.toResolveKeys.join() === PLANLINE_UNREADABLE_KEY);
  const good = r({ planError: null, listingEmpty: false });
  ok('P38 both reads good → both singletons resolve, none opens', good.toOpen.length === 0 && good.toResolveKeys.length === 2);
  const both = r({ planError: 'x', listingEmpty: true });
  ok('P38 both reads bad → both singletons open', both.toOpen.length === 2 && both.toResolveKeys.length === 0);
  ok('P38 N7: every singleton key is disjoint from the per-leg regex (a hyphen, not a colon)',
    [PLANLINE_UNREADABLE_KEY, PLANLINE_LISTING_EMPTY_KEY, PLANLINE_MALFORMED_KEY].every((k) => !/^gov-planline:(.+):(s4|s5)$/.test(k)));
}

// ── P38: decidePlanLineTick — the rule for one tick, from the two reads; FREEZE on either bad read ──
{
  const R = 'B_PLAN_X_COMPLETION_REPORT.md';
  const text = planFixture();
  const names = [R, 'B_OTHER_COMPLETION_REPORT.md'];
  const sha = 'e'.repeat(40);
  const off = decidePlanLineTick({ enabled: false, refSha: sha, planText: text, names, malformedSig: 'kept' });
  ok('P38 flag off → no intents, no liveness line, verifier keeps (FREEZE), stored signature kept',
    off.toOpen.length === 0 && off.toResolveKeys.length === 0 && off.liveness === null && off.verifyPlanLine('B-PLAN-X', 's4') === false && off.malformedSig === 'kept');
  const t = decidePlanLineTick({ enabled: true, refSha: sha, planText: text, names, shadow: false });
  ok('P38 a good tick opens the failing leg (B-PLAN-X row 1 is QUEUED / —)', t.toOpen.some((a) => a.dedupeKey === 'gov-planline:B-PLAN-X:s4'));
  ok('P38 ...grades only ids with a report (B-BOLD and B-WIN have none)', !t.toOpen.some((a) => /B-BOLD|B-WIN/.test(a.dedupeKey)) && t.legs.length === 1);
  ok('P38 ...resolves both read singletons', t.toResolveKeys.includes(PLANLINE_UNREADABLE_KEY) && t.toResolveKeys.includes(PLANLINE_LISTING_EMPTY_KEY));
  ok('P38 the liveness line prints ref=<the sha read at> and the counts',
    t.liveness === `[gov-checker] planline: enabled ref=${sha} rows4=4 rows5=1 ids=3 graded=1 legs=1 fail=1 malformed=0`, t.liveness);
  ok('P38 the verifier: a graded leg → null (owned this tick); a leg not graded → true (not required at the ref)',
    t.verifyPlanLine('B-PLAN-X', 's4') === null && t.verifyPlanLine('B-GONE', 's4') === true && t.verifyPlanLine('B-PLAN-X', 's5') === true);
  const bad = decidePlanLineTick({ enabled: true, refSha: sha, planText: text.replace(H5, '| item | owner | closes |'), names, shadow: false });
  ok('P38 plan unreadable (a lone §5 header edit) → ONLY the unreadable key opens; zero per-leg intents',
    bad.toOpen.map((a) => a.dedupeKey).join() === PLANLINE_UNREADABLE_KEY && !bad.toResolveKeys.some((k) => k.startsWith('gov-planline:')));
  ok('P38 ...the verifier keeps every per-leg key; the liveness line says FROZEN',
    bad.verifyPlanLine('B-PLAN-X', 's4') === false && bad.verifyPlanLine('B-GONE', 's5') === false && /ref=e+ FROZEN \(plan unreadable\)/.test(bad.liveness));
  const absent = decidePlanLineTick({ enabled: true, refSha: sha, planText: null, names, shadow: false });
  ok('P38 plan absent at the ref (null, what showFileAt returns) → the unreadable key opens; zero per-leg intents',
    absent.toOpen.map((a) => a.dedupeKey).join() === PLANLINE_UNREADABLE_KEY && !absent.toResolveKeys.some((k) => k.startsWith('gov-planline:')));
  const emptyL = decidePlanLineTick({ enabled: true, refSha: sha, planText: text, names: [], shadow: false });
  ok('P38 listing EMPTY with a good plan → ONLY the listing key opens; zero per-leg intents; the verifier keeps (no flap)',
    emptyL.toOpen.map((a) => a.dedupeKey).join() === PLANLINE_LISTING_EMPTY_KEY && !emptyL.toResolveKeys.some((k) => k.startsWith('gov-planline:'))
      && emptyL.verifyPlanLine('B-PLAN-X', 's4') === false && /FROZEN \(Batch Completion listing empty\)/.test(emptyL.liveness));
  ok('P38 ...and the malformed singleton is neither opened nor resolved on a frozen tick',
    ![...bad.toOpen, ...emptyL.toOpen].some((a) => a.dedupeKey === PLANLINE_MALFORMED_KEY) && ![...bad.toResolveKeys, ...emptyL.toResolveKeys].includes(PLANLINE_MALFORMED_KEY));
}

// ── P38 + N8: runPlanLineRule reads BOTH inputs at the ONE resolved sha and prints it as ref= ──
// Faked git whose ref MOVES: rev-parse returns A first and B on any later call. Expected first: the plan read
// and the listing read both name A; the liveness line prints ref=A; the resolve evidence is A. Planted fault:
// runPlanLineRule reading through the symbolic showFile/lsTreeNames (GOV_REF) fails it; a flag-off rule
// making ANY read fails the flag-off case.
{
  const A = 'a'.repeat(40), B = 'b'.repeat(40);
  const reads = [];
  let rp = 0;
  __setGitExecForTest((cmd, args) => {
    if (args[0] === 'fetch') return '';
    if (args[0] === 'rev-parse') { rp++; return `${rp === 1 ? A : B}\n`; }
    if (args[0] === 'show') { reads.push(args[1].split(':')[0]); return planFixture(); }
    if (args[0] === 'ls-tree') { reads.push(args[2]); return 'Claude Comms and Packages/Batch Completion/B_PLAN_X_COMPLETION_REPORT.md\n'; }
    throw new Error(`unexpected git ${args.join(' ')}`);
  });
  resolveGradedRef();
  const t = runPlanLineRule({ enabled: true, shadow: false });
  ok('P38/N8 both reads were made at the resolved sha A', reads.length === 2 && reads.every((r) => r === A), JSON.stringify(reads));
  ok('P38/N8 the liveness line prints ref=A, and the resolve evidence is A', t.liveness.includes(`ref=${A}`) && checkerResolveEvidence() === A);
  ok('P38/N8 the ref was resolved once (a moved ref B is never read)', rp === 1);
  reads.length = 0;
  const off = runPlanLineRule({ enabled: false, malformedSig: 's' });
  ok('P38 flag off → NO read at all, no intents, no liveness line', reads.length === 0 && off.toOpen.length === 0 && off.liveness === null && off.malformedSig === 's');
  __setGitExecForTest(null);
  resolveGradedRef(() => ({ fetchOk: false, sha: null }));
}

// ── P37: decideOrphanSweep's per-leg branch ──
{
  const noop = () => false;
  const keys = ['gov-planline:B-GONE:s4', 'gov-planline:B-LIVE:s4', 'gov-planline:B-WIN:s5', PLANLINE_UNREADABLE_KEY, PLANLINE_LISTING_EMPTY_KEY, PLANLINE_MALFORMED_KEY];
  const v = makeVerifyPlanLine([{ bid: 'B-LIVE', leg: 's4' }]);
  const res = decideOrphanSweep(keys, new Set(), noop, noop, noop, v);
  ok('P37 a key whose id left the plan (not graded this tick) → RESOLVED (verified: not required at the ref)', res.resolve.includes('gov-planline:B-GONE:s4'));
  ok('P37 a key graded this tick → skipped (decidePlanLineAlerts owns it; neither resolved nor kept)', !res.resolve.includes('gov-planline:B-LIVE:s4') && !res.keep.includes('gov-planline:B-LIVE:s4'));
  ok('P37 an s5 key after its §5 line is removed → RESOLVED', res.resolve.includes('gov-planline:B-WIN:s5'));
  ok('P37 the three singletons are not matched by the per-leg regex', ![PLANLINE_UNREADABLE_KEY, PLANLINE_LISTING_EMPTY_KEY, PLANLINE_MALFORMED_KEY].some((k) => res.resolve.includes(k) || res.keep.includes(k)));
  const noVerifier = decideOrphanSweep(['gov-planline:B-GONE:s4'], new Set(), noop);
  ok('P37 no verifier injected → KEPT', noVerifier.keep.includes('gov-planline:B-GONE:s4') && noVerifier.resolve.length === 0);
  const frozen = decideOrphanSweep(['gov-planline:B-WS-SUBSCRIBE-CLASS-FILTER:s4'], new Set(), noop, noop, noop,
    decidePlanLineTick({ enabled: true, refSha: 'f'.repeat(40), planText: planFixture(), names: [], shadow: false }).verifyPlanLine);
  ok('P37 an open per-leg key with an EMPTY listing → KEPT (the flap case: a join on [] would call it not required)',
    frozen.keep.includes('gov-planline:B-WS-SUBSCRIBE-CLASS-FILTER:s4') && frozen.resolve.length === 0);
  const seen = [];
  decideOrphanSweep(['gov-planline:B-X-Y:s4'], new Set(['B-X-Y']), noop, noop, noop, (bid, leg) => { seen.push(`${bid}|${leg}`); return true; });
  ok('P37 the per-leg key is verified by its bid (group 1), never as `<bid>:s4`; the commit window does not skip it',
    seen.join() === 'B-X-Y|s4', seen.join());
}

// ─── B-PLAN-CURRENCY-CHECK P41: the add command is a pure builder, byte-identical for every existing caller ───
{
  // The literal was produced BEFORE the P41 edit by evaluating the pre-edit alertSink.add template (poller.mjs at
  // 225480e9d, :608-611, copied verbatim with its shq) on these inputs.
  const LITERAL = "cd /home/deploy/dawntrader && npm run -s system-alerts -- add --triggers-at 2026-09-28T09:00:00.000Z --category governance --severity warning --title 'It'\\''s a title' --body 'Body with `ticks` and $vars' --metadata '{\"dedupe_key\":\"gov-deadline:B-X\",\"source\":\"governance-checker\"}'";
  const args = { nowMs: Date.parse('2026-09-28T09:00:00Z'), severity: 'warning', title: "It's a title", body: 'Body with `ticks` and $vars', dedupeKey: 'gov-deadline:B-X', repo: '/home/deploy/dawntrader' };
  ok('P41 an existing caller\'s add command is byte-identical to the pre-edit template', buildAddCommand(args) === LITERAL, buildAddCommand(args));
  const w = buildAddCommand({ ...args, category: 'verification', metadata: '{"counts":{}}', storeDedupeKey: 'gov-plancensus:2026-W40' });
  ok('P41 the weekly add carries --category verification, its own metadata, and --dedupe-key LAST',
    / --category verification /.test(w) && w.includes(`--metadata '{"counts":{}}'`) && w.endsWith(" --dedupe-key 'gov-plancensus:2026-W40'"), w);
  ok('P41 no --dedupe-key unless given', !buildAddCommand(args).includes('--dedupe-key'));
  const res = decideOrphanSweep(['gov-plancensus:2026-W40', 'gov-mistakepass:2026-W40', CENSUS_FAILED_KEY, MISTAKEPASS_FAILED_KEY], new Set(), () => true, () => true, () => true, () => true);
  ok('P41 decideOrphanSweep leaves the weekly keys untouched (neither resolved nor kept)', res.resolve.length === 0 && res.keep.length === 0, JSON.stringify(res));
  ok('P43 census.mjs is in DRIFT_LOADED_FILES (P29: it joins in the commit that creates it)', DRIFT_LOADED_FILES.includes('census.mjs'));
}

// ─── B-PLAN-CURRENCY-CHECK P40 / P42 / P46: the weekly gate, run through the SHIPPED maybeRunWeekly with fakes ───
{
  const MON = Date.parse('2026-09-28T09:00:00Z');                   // Monday of ISO week 2026-W40
  const DAY = 24 * HOUR;
  const W40 = '2026-W40', W41 = '2026-W41';
  const PLANTEXT = ['## 0. x', '| session | in flight now | disposition |', '|---|---|---|', '| CC-A (Old Claude) | B-FOO — Step 3 | FINISH |',
    '## 4. The plan', '| # | item | batch / reference | owner | status | report | note |', '|---:|---|---|---|---|---|---|',
    '| 1 | foo | B-FOO | CC-A (Old Claude) | QUEUED | — | — |', '## 5. Running now', '| item | owner | closes | report |', '|---|---|---|---|',
    '## 6. Who', '| session | group | items |', '|---|---|---:|', '| CC-A (Old Claude) | g | 1 |', '## 7. end'].join('\n');
  const FILES = { '1-system-manual/RUNNING_ISSUES.md': '### #100 OPEN 2026-09-01 (CC-A) x\nHOME: B-FOO (CC-A)\n### #101 OPEN (CC-B) y',
    '1-system-manual/SPRINT_TO_LIVE_PLAN.md': PLANTEXT, 'Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md': '## After live — 1\n- B-BAR — x\n',
    '1-system-manual/POST_AUDIT_ROADMAP.md': '| 19-1 | a | b |' };
  const world = (log, over = {}) => {
    const calls = [], boxes = [], saved = [];
    let n = 0;
    const sink = {
      add: (a, nowMs) => { calls.push({ op: 'add', ...a, nowMs }); log.push(`add:${a.dedupeKey}`); if (over.addThrows) throw new Error('cli exit 1'); return over.nullId ? null : `id-${++n}`; },
      resolve: (id) => { calls.push({ op: 'resolve', id }); log.push(`resolve:${id}`); if (over.resolveThrows) throw new Error('resolve blew up'); },
    };
    const readers = {
      show: (ref, p) => (over.brokenRead ? null : FILES[p]), names: () => ['B_OLD_COMPLETION_REPORT.md'],
      added: (prev, ref) => { calls.push({ op: 'added', prev, ref }); return []; }, planHistory: () => [],
      refBefore: (ref, ms) => { calls.push({ op: 'refBefore', ref, ms }); return 'b'.repeat(40); },
      bodies: (prev, ref) => { calls.push({ op: 'bodies', prev, ref }); return ['fix\n\nMISTAKE: wrong-object [B-X] — y']; },
    };
    const deps = { sink, readers, ref: over.ref === undefined ? 'a'.repeat(40) : over.ref, writeBox: (week) => { boxes.push(week); log.push(`box:${week}`); return `/x/${week}.json`; },
      save: (st) => { saved.push(JSON.parse(JSON.stringify(st))); log.push('save'); }, flags: over.flags ?? { census: true, mistakePass: false } };
    return { deps, calls, boxes, saved };
  };
  const fresh = () => ({ openAlerts: {}, lastTick: null });
  const adds = (calls) => calls.filter((c) => c.op === 'add');

  // flags off (the committed state) → no state change, no call at all
  {
    const st = fresh(), before = JSON.stringify(st), w = world([], { flags: { census: false, mistakePass: false } });
    maybeRunWeekly(st, MON, new Set(), w.deps);
    ok('P40 flags OFF → state byte-identical and nothing called', JSON.stringify(st) === before && w.calls.length === 0 && w.saved.length === 0);
    const def = fresh(); maybeRunWeekly(def, MON, new Set(), { sink: { add: () => { throw new Error('must not be called'); } } });
    ok('P40 the COMMITTED flags (config.mjs) are off: the default deps touch nothing', JSON.stringify(def) === JSON.stringify(fresh()));
  }
  // two simulated Mondays → two distinct adds; a later tick in a run week → none
  {
    const st = fresh(), w = world([]);
    maybeRunWeekly(st, MON, new Set(), w.deps);
    maybeRunWeekly(st, MON + 2 * DAY, new Set(), w.deps);           // Wednesday of the same, already-run week
    maybeRunWeekly(st, MON + 7 * DAY, new Set(['id-1']), w.deps);    // next Monday
    const keys = adds(w.calls).map((c) => c.dedupeKey);
    ok('P40 two simulated Mondays → two distinct adds; a non-Monday tick in a censused week → none',
      keys.join() === `gov-plancensus:${W40},gov-plancensus:${W41}`, keys.join());
    ok('P40 state records the week, the time, the graded ref and the id', st.lastCensusWeek === W41 && st.lastCensusAt === MON + 7 * DAY && st.lastCensusRef === 'a'.repeat(40) && st.lastCensusAlertId === 'id-2');
    ok('P41 the weekly key is recorded in openAlerts', st.openAlerts[`gov-plancensus:${W40}`] === 'id-1' && st.openAlerts[`gov-plancensus:${W41}`] === 'id-2');
    ok('P40 list (a)\'s window is by REF: the second run reads lastCensusRef..ref, the first the branch 7 days back',
      w.calls.filter((c) => c.op === 'added').map((c) => c.prev).join() === ['b'.repeat(40), 'a'.repeat(40)].join() &&
      w.calls.find((c) => c.op === 'refBefore').ms === MON - 7 * DAY);
  }
  // catch-up and the Monday-09:00Z edge
  {
    const st = fresh(), w = world([]);
    maybeRunWeekly(st, MON - 1, new Set(), w.deps);
    ok('P40 Monday 08:59:59.999Z → no add (the gate is 09:00Z)', adds(w.calls).length === 0);
    maybeRunWeekly(st, MON + DAY, new Set(), w.deps);
    ok('P40 (Q10 catch-up) a Tuesday tick in an uncensused week → fires', adds(w.calls).length === 1 && st.lastCensusWeek === W40);
    ok('P40 weekGateMs is Monday 09:00Z of the ISO week', weekGateMs(MON + 3 * DAY + 5 * HOUR) === MON && weekGateMs(Date.parse('2027-01-03T12:00:00Z')) === Date.parse('2026-12-28T09:00:00Z'));
  }
  // resolve-then-tick on the same Monday → no second add (condition 1: the gate is the SOLE dedupe)
  {
    const st = fresh(), w = world([]);
    maybeRunWeekly(st, MON, new Set(['id-1']), w.deps);
    delete st.openAlerts[`gov-plancensus:${W40}`];                   // resolved out-of-band and pruned by the reconcile
    maybeRunWeekly(st, MON + HOUR, new Set(), w.deps);
    ok('P40 resolve-then-tick on the same Monday → no second add', adds(w.calls).length === 1);
  }
  // save at the add; a throw after the add cannot re-add
  {
    const log = [], st = fresh(), w = world(log, { resolveThrows: true });
    st.openAlerts[CENSUS_FAILED_KEY] = 'fail-1';                     // a failure alert is open, so a resolve follows the save
    maybeRunWeekly(st, MON, new Set(['fail-1']), w.deps);
    ok('P40 the box file is written BEFORE the add, and saveState runs right AFTER it (before the resolve that throws)',
      log.slice(0, 4).join() === `box:${W40},add:gov-plancensus:${W40},save,resolve:fail-1`, log.join());
    const reloaded = w.saved[0];
    const w2 = world([]);
    maybeRunWeekly(reloaded, MON + HOUR, new Set(), w2.deps);
    ok('P40 ...so a state reloaded from that save does not re-add this week', reloaded.lastCensusWeek === W40 && adds(w2.calls).length === 0);
  }
  // a census failure: the failure alert opens, the week is not recorded; the next success resolves it
  {
    const st = fresh(), w = world([], { brokenRead: true });
    const r = maybeRunWeekly(st, MON, new Set(), w.deps);
    const a = adds(w.calls);
    ok('P40 a census throw → gov-census-failed at warning, the week NOT recorded', a.length === 1 && a[0].dedupeKey === CENSUS_FAILED_KEY && a[0].severity === 'warning' &&
      st.lastCensusWeek === undefined && st.openAlerts[CENSUS_FAILED_KEY] === 'id-1' && r.census.ran === false);
    maybeRunWeekly(st, MON + HOUR, new Set(), w.deps);
    ok('P40 a repeated failure does not add a second failure alert', adds(w.calls).length === 1);
    const ok2 = world([]);
    maybeRunWeekly(st, MON + 2 * HOUR, new Set(), ok2.deps);
    ok('P40 the next success adds the census and resolves the failure alert', adds(ok2.calls).length === 1 && ok2.calls.some((c) => c.op === 'resolve' && c.id === 'id-1') && !st.openAlerts[CENSUS_FAILED_KEY] && st.lastCensusWeek === W40);
    const noRef = fresh(), wn = world([], { ref: null });
    maybeRunWeekly(noRef, MON, new Set(), wn.deps);
    ok('P40 no graded ref → a failure, never a census at a guessed ref', adds(wn.calls)[0]?.dedupeKey === CENSUS_FAILED_KEY && noRef.lastCensusWeek === undefined);
    const dead = fresh(), wd = world([], { brokenRead: true, addThrows: true });
    let threw = false; try { maybeRunWeekly(dead, MON, new Set(), wd.deps); } catch { threw = true; }
    ok('P40 even a failing failure-alert add does not throw out of the tick', !threw);
  }
  // Q6: a null id after exit 0 → the week is censused, lastCensusAlertId null, no retry; shadow is logged once a week
  {
    const st = fresh(), w = world([], { nullId: true });
    maybeRunWeekly(st, MON, new Set(), w.deps);
    maybeRunWeekly(st, MON + HOUR, new Set(), w.deps);
    ok('P40 (Q6) a null id after exit 0 marks the week, records lastCensusAlertId null, and does not retry (also the shadow case: once a week)',
      adds(w.calls).length === 1 && st.lastCensusWeek === W40 && st.lastCensusAlertId === null && !(`gov-plancensus:${W40}` in st.openAlerts));
  }
  // the liveness seed: set on the first tick that reads the flag on, before the gate
  {
    const st = fresh(), w = world([], { brokenRead: true });
    st.lastCensusWeek = W40;
    maybeRunWeekly(st, MON + DAY, new Set(), w.deps);
    ok('P40 censusEnabledSince is set on the first flag-on tick even when the gate does not match', st.censusEnabledSince === MON + DAY && adds(w.calls).length === 0);
    const failing = fresh(), wf = world([], { brokenRead: true });
    for (let d = 0; d <= 9; d++) maybeRunWeekly(failing, MON + d * DAY, new Set(), wf.deps);
    const hb = decideHeartbeat({ lastTick: MON + 9 * DAY, lastCensusAt: failing.lastCensusAt ?? null, lastMistakePassAt: null,
      censusEnabledSince: failing.censusEnabledSince, mistakePassEnabledSince: null, censusEnabled: true, mistakePassEnabled: false, openAlertIds: {} }, MON + 9 * DAY);
    ok('P40+P28 flag on for 9 days and no census ever run → the heartbeat raises ONE census warning',
      hb.intents.length === 1 && hb.intents[0].dedupeKey === CENSUS_SILENT_KEY && hb.intents[0].severity === 'warning', JSON.stringify(hb.intents));
  }
  // P42 severity (§10e Q13)
  {
    const sev = (open, live) => weeklySeverity(open, 'gov-plancensus:', W41, live);
    ok('P42 prior week live → warning', sev({ [`gov-plancensus:${W40}`]: 'p' }, new Set(['p'])).severity === 'warning');
    ok('P42 prior week resolved (pruned from state) → info', sev({}, new Set()).severity === 'info');
    ok('P42 prior week acknowledged (still live in the snapshot) → warning', sev({ [`gov-plancensus:${W40}`]: 'p' }, new Set(['p', 'q'])).severity === 'warning');
    ok('P42 two weeks back still live, the prior week resolved → warning', sev({ 'gov-plancensus:2026-W39': 'o' }, new Set(['o'])).severity === 'warning');
    ok('P42 a key held but not live → info', sev({ [`gov-plancensus:${W40}`]: 'p' }, new Set()).severity === 'info');
    ok('P42 the store unreadable (liveIds null) → warning, flagged', sev({}, null).severity === 'warning' && sev({}, null).storeUnreadable === true);
    ok('P42 the SAME week\'s key does not escalate itself', sev({ [`gov-plancensus:${W41}`]: 'p' }, new Set(['p'])).severity === 'info');
    const st = fresh(), w = world([]);
    maybeRunWeekly(st, MON, new Set(), w.deps);
    maybeRunWeekly(st, MON + 7 * DAY, new Set(['id-1']), w.deps);
    const [a1, a2] = adds(w.calls);
    ok('P42 an unresolved prior week does not block this week\'s add, and raises it to warning', a1.severity === 'info' && a2.severity === 'warning' && a2.dedupeKey === `gov-plancensus:${W41}`);
    ok('P41/Q1 (ii) category verification at EVERY severity, with --dedupe-key = the week key', [a1, a2].every((a) => a.category === 'verification' && a.storeDedupeKey === a.dedupeKey));
    ok('P45 the census metadata leads with its counts', a1.metadata.startsWith('{"counts":{"h":'));
    const u = fresh(), wu = world([]);
    maybeRunWeekly(u, MON, null, wu.deps);
    ok('P42 liveIds null at mint → warning, and the body says the prior week could not be read', adds(wu.calls)[0].severity === 'warning' && /Alert store unreadable/.test(adds(wu.calls)[0].body));
  }
  // P46: the mistake pass, independent of the census
  {
    const st = fresh(), w = world([], { brokenRead: true, flags: { census: true, mistakePass: true } });
    maybeRunWeekly(st, MON, new Set(), w.deps);
    const a = adds(w.calls);
    const pass1 = a.find((x) => x.dedupeKey === `gov-mistakepass:${W40}`);
    ok('P46 a census fault does not block the pass (its own keys and gate)', a.some((x) => x.dedupeKey === CENSUS_FAILED_KEY) && pass1 && st.lastMistakePassWeek === W40 && st.lastCensusWeek === undefined);
    ok('P46 the pass is verification/info with a counts-first body', pass1.category === 'verification' && pass1.severity === 'info' && /wrong-object 1/.test(pass1.body) && pass1.metadata.startsWith('{"counts":'));
    ok('P41/P46 the pass carries --dedupe-key = its own week key (the store write guard)', pass1.storeDedupeKey === `gov-mistakepass:${W40}`);
    st.openAlerts[`gov-mistakepass:${W40}`] = 'ack-1';                  // acknowledged, never resolved (the 8a07c40b shape)
    maybeRunWeekly(st, MON + 7 * DAY, new Set(['ack-1']), w.deps);
    const pass2 = adds(w.calls).find((x) => x.dedupeKey === `gov-mistakepass:${W41}`);
    ok('P46 week N+1 is minted while week N is acknowledged-unresolved, at warning (still verification)', pass2 && pass2.severity === 'warning' && pass2.category === 'verification');
    ok('P46 the trailer window is by REF: lastMistakePassRef..ref', w.calls.filter((c) => c.op === 'bodies').map((c) => c.prev).join() === ['b'.repeat(40), 'a'.repeat(40)].join());
    const pf = fresh(), wp = world([], { flags: { census: false, mistakePass: true } });
    wp.deps.readers.bodies = () => { throw new Error('git log failed'); };
    maybeRunWeekly(pf, MON, new Set(), wp.deps);
    ok('P46 a pass failure opens gov-mistakepass-failed, not the census key', adds(wp.calls)[0].dedupeKey === MISTAKEPASS_FAILED_KEY && pf.lastMistakePassWeek === undefined);
  }
}

// ─── Step 4 BLOCKER-2 (Langston, 2026-09-30): pin the WRAPPER, not only writeStateAtomic ───
// rename() installs a NEW inode; writeFileSync truncates the SAME one. So saveState replacing the file's inode is
// the discriminator: reverting the one-line wrapper to writeFileSync keeps the inode and turns this red.
// Linux only (CI): Windows file ids are not a POSIX inode contract.
if (process.platform !== 'win32') {
  const dir = mkdtempSync(join(tmpdir(), 'savestate-'));
  const target = join(dir, 'state.json');
  writeFileSync(target, '{"old":1}');
  const before = statSync(target).ino;
  const prev = process.env.GOV_STATE_FILE;
  process.env.GOV_STATE_FILE = target;
  const fresh = await import('./poller.mjs?savestate-inode-test');
  fresh.saveState({ openAlerts: {}, lastTick: 1 });
  const after = statSync(target).ino;
  if (prev === undefined) delete process.env.GOV_STATE_FILE; else process.env.GOV_STATE_FILE = prev;
  ok('BLOCKER-2: saveState REPLACES the state file (new inode — an atomic rename, not an in-place write)', after !== before, `${before} -> ${after}`);
  ok('BLOCKER-2: … and the new file holds the state', JSON.parse(readFileSync(target, 'utf8')).lastTick === 1);
  ok('BLOCKER-2: … and leaves no temp file behind', readdirSync(dir).length === 1, readdirSync(dir).join(','));
  rmSync(dir, { recursive: true, force: true });
} else {
  console.log('  (BLOCKER-2 inode test skipped on win32 — CI runs it on Linux)');
}

console.log(`\nPoller logic tests: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

