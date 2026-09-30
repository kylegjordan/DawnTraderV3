// B-GOV governance-checker — configuration (single source of truth).
// Deterministic, no LLM. Defines: batch-id/phase naming + parser, the per-change-class
// expected-doc-set, and the paths the mechanical checks read. See
// "Claude Comms and Packages/Scope Files/BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md".

// ─────────────────────────────────────────────────────────────────────────────
// 1. NAMING + PARSER (Obj-9). Must recognize alpha/letter batch-ids (B-NAMES, B-GOV),
//    not only P19-B<n> — the raw 68% tag rate was a parser-coverage artifact, real
//    code-push discipline is ~100% (pre-audit §1.b.i).
// ─────────────────────────────────────────────────────────────────────────────

// Ordered most-specific → least-specific so the first match wins (sub-batch before batch).
export const BATCH_ID_PATTERNS = [
  /\bP\d{1,3}-B\d+(?:\.\d+)?[a-z]?\b/,      // P19-B6, P19-B6.5a  (phase-scoped batch + sub-batch)
  /\bB-NEW-\d+[a-z]?\b/,                     // B-NEW-53, B-NEW-53a (historical)
  /\bB\d{2,}\.\d+[a-z]?(?:-[A-Z])?\b/,       // B79.0n, B4.6-B style
  // B-GOV-4 OBJ-2: capture the FULL hyphenated name. The old `(?:-\d+)?` only allowed a
  // single numeric suffix (B-GOV-2) and TRUNCATED multi-segment names — B-TEC-SELFHEAL was
  // graded as the phantom `B-TEC` (#350 second failure mode). `(?:-[A-Z0-9]+)*` captures every
  // hyphen-joined uppercase/alnum segment (B-TEC-SELFHEAL, B-LANGSTON-QUEUE-345, B-GOV-2),
  // still stopping at whitespace or a lowercase continuation; `.<n>` sub-batch suffix preserved.
  // B-PLAN-CURRENCY-CHECK P31 (CD-A9): a segment may also END in ONE lowercase letter after a digit
  // (`[A-Z0-9]*\d[a-z]`) — the lettered sub-batch form B-RULES-1a / B-RULES-1e. Without it the old
  // pattern could not end on the digit (no word boundary between `1` and `e`), backtracked, and
  // graded the PHANTOM `B-RULES` for every B-RULES-1<x> commit. `B-RULES-1c/1d x` → B-RULES-1c.
  /\bB-[A-Z][A-Z0-9]+(?:-(?:[A-Z0-9]*\d[a-z]|[A-Z0-9]+))*(?:\.\d+)?\b/,  // B-NAMES, B-GOV, B-GOV-2, B-TEC-SELFHEAL, B-NAMES.1, B-RULES-1e
  // P31 (CD-A10): the T-* form (T-W20C-SCALAR-LEG), which no pattern matched, so those commits were
  // untagged and the batch never graded. No F-G-* line: that grammar gap is B-BATCH-ID-ALIAS-GRAMMAR
  // (#1116, Langston §10d Q7), not this batch.
  /\bT-[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*\b/,     // T-W20C-SCALAR-LEG
];

// Commits that legitimately carry NO batch tag (not code pushes — pre-audit §1.b.i).
// A commit whose files are ENTIRELY within these paths is exempt from the untagged-code flag.
export const HOUSEKEEPING_ONLY_PATHS = [
  '.claude/memory/',                  // MEMORY mirror
  'Claude Comms and Packages/Cross-Session Briefs/',
];
export const HOUSEKEEPING_ONLY_BASENAMES = ['MEMORY.md', 'CLAUDE.md'];

export function extractBatchId(subject) {
  for (const re of BATCH_ID_PATTERNS) {
    const m = subject.match(re);
    if (m) return m[0];
  }
  return null;
}

// #508: the PARENT of a phase-scoped sub-batch id, or null if the id has no parent form.
// P19-B8.4b → P19-B8.4 (letter suffix) ; P19-B8.5 → P19-B8 (dotted numeric suffix).
// Letter-named batches (B-GOV-4, B-NEW-53.1) deliberately return null — their numeric
// tails are version-like, not parent/child (B-NEW-53.1 closing must not silence B-NEW-53's
// own deadline; the P19_B8_4b precedent this fixes is specifically the P-form family).
export function parentBatchId(bid) {
  let m = bid.match(/^(P\d+-B\d+(?:\.\d+)*)[a-z]$/);
  if (m) return m[1];
  m = bid.match(/^(P\d+-B\d+(?:\.\d+)*)\.\d+$/);
  if (m) return m[1];
  return null;
}

// B-GOV-4 OBJ-1: LEADING-token extraction for the GRADING path. A batch-id is treated as a
// batch-being-worked only if it is the leading token of the commit subject (the declared
// own-batch position). A batch-id appearing only MID-subject is a contextual reference and must
// NOT establish/refresh a gradable batch — that mid-subject match (#350 first failure mode)
// un-grandfathered closed batches (B-NEW-40 led, but also "…concretize #350 B-GOV-4 home" matched
// B-GOV-4 mid-subject) and even graded never-existent ids. Empirically safe to anchor: zero
// conventional-commit `type(scope):` prefixes in 400 origin subjects (pre-audit §5), so there is
// no prefix to skip — our convention leads with the bare batch-id or a plain descriptor.
// `m.index === 0` (after trimming leading whitespace) ⇒ the match starts the subject. NON-grading
// callers (e.g. recentBatchIds, the backtest display) keep using extractBatchId (any position).
// NOTE (Langston Step-4 minor): a bracketed/quoted leading id (`[B-GOV-4] …`) returns null because
// m.index fails on the `[`. Fine under the bare-id-leading convention (pre-audit §5); revisit only
// if the subject-prefix convention ever changes (it would quietly drop those batches from grading).
export function extractLeadingBatchId(subject) {
  const s = subject.replace(/^\s+/, '');
  for (const re of BATCH_ID_PATTERNS) {
    const m = s.match(re);
    if (m && m.index === 0) return m[0];
  }
  return null;
}

// Canonical separators in batch-ids vs filenames differ ("P19-B6.5a" ↔ "P19_B6_5a").
// Build a filename matcher that is EXACT at the sub-batch boundary so "P19-B6" never
// matches "P19-B6.5a" files (Langston C8 / exact-match-not-prefix).
export function batchIdToFileRegex(bid) {
  const flex = bid.replace(/[-_.]/g, '[-_. ]');
  // leading boundary = any non-alphanumeric (so "(P19-B6", "*P19-B6*" match) + flexible
  // separators. Two trailing guards (Langston Step-4 C8): reject a numeric continuation
  // ([._-]?digit) so "P19-B6" ≠ "P19-B6.5a" / "P19-B60"; AND reject a bare trailing letter
  // so "P19-B3" ≠ "P19-B3b" (real lettered sub-batches exist). Separator-led suffixes
  // (".md", "_COMPLETION", "-x") still match.
  return new RegExp(`(?<![A-Za-z0-9])${flex}(?![._-]?\\d)(?![A-Za-z])`, 'i');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PATH CLASSIFICATION (code vs governance) for commit classification + deadline.
// ─────────────────────────────────────────────────────────────────────────────
export const CODE_PREFIXES = ['server/', 'shared/', 'client/', 'scripts/', 'drizzle/'];
export const GOVERNANCE_PREFIXES = [
  '1-system-manual/',
  'Claude Comms and Packages/Batch Completion/',
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. DOC REGISTRY — where each governance doc lives + how presence is detected.
//    kind:'file-glob'  → a per-batch file whose name contains the batch-id.
//    kind:'entry'      → an append-style shared doc; presence = batch-id appears inside it.
// ─────────────────────────────────────────────────────────────────────────────
export const DOCS = {
  scope:            { kind: 'file-glob', dir: 'Claude Comms and Packages/Scope Files',     match: /SCOPE/i },
  pre_audit:        { kind: 'file-glob', dir: 'Claude Comms and Packages/Scope Files',     match: /PRE[_-]?AUDIT/i },
  completion_report:{ kind: 'file-glob', dir: 'Claude Comms and Packages/Batch Completion', match: /COMPLETION|COMPLETE/i },
  batch_catalog:    { kind: 'entry', path: '1-system-manual/BATCH_CATALOG.md' },
  phase_history:    { kind: 'entry', path: '1-system-manual/PHASE_HISTORY.md' },
  phase_19_plan:    { kind: 'entry', path: '1-system-manual/PHASE_19_PLAN.md' },
  system_manual:    { kind: 'entry', path: '1-system-manual/SYSTEM_MANUAL.md' },
  sim:              { kind: 'entry', path: '1-system-manual/SYSTEM_IMPACT_MAP.md' },
  changes_and_fixes:{ kind: 'entry', path: '1-system-manual/CHANGES_AND_FIXES.md' },
  running_issues:   { kind: 'entry', path: '1-system-manual/RUNNING_ISSUES.md' },
  roadmap:          { kind: 'entry', path: '1-system-manual/POST_AUDIT_ROADMAP.md' },
  deleted_log:      { kind: 'entry', path: '1-system-manual/DELETED_COMPONENTS_LOG.md' },
  adjustment_framework: { kind: 'entry', path: '1-system-manual/ADJUSTMENT_FRAMEWORK.md' },
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. CHANGE-CLASS → expected-doc-set (CLAUDE.md §3, validated in pre-audit §3).
//    REQUIRED → absence is RED. CONDITIONAL → absence is at most a low-sev Langston-route.
//    Predicates for CONDITIONAL run against the batch's commit diff (live poller); in the
//    backtest only REQUIRED + always-checkable docs are asserted.
// ─────────────────────────────────────────────────────────────────────────────
export const CLASS_DOCSET = {
  architecture: {
    required: ['scope', 'pre_audit', 'completion_report', 'batch_catalog', 'phase_history', 'system_manual', 'sim'],
    conditional: ['changes_and_fixes', 'running_issues', 'roadmap', 'deleted_log', 'phase_19_plan'],
  },
  non_architecture: {
    required: ['scope', 'pre_audit', 'completion_report', 'batch_catalog', 'phase_history'],
    // system_manual conditional here too (Langston Step-4 d): a non-arch batch can still
    // touch strategy/regime/filter/pipeline (System-Manual scope, 2026-06-16 rule).
    conditional: ['system_manual', 'sim', 'changes_and_fixes', 'running_issues', 'roadmap', 'deleted_log', 'adjustment_framework', 'phase_19_plan'],
  },
  sub_batch: {
    required: ['completion_report', 'batch_catalog', 'phase_history'],
    conditional: ['scope', 'pre_audit', 'system_manual', 'sim', 'changes_and_fixes', 'running_issues', 'deleted_log', 'adjustment_framework', 'phase_19_plan'],
  },
  hotfix: {
    required: ['changes_and_fixes'],
    conditional: ['completion_report', 'deleted_log'],
  },
};

// architecture conditional also carries adjustment_framework (Langston Step-4 d).
CLASS_DOCSET.architecture.conditional.push('adjustment_framework');

// Predicate-required docs (Langston Step-4 d): required when the predicate matches the
// batch-id, independent of class. phase_19_plan is REQUIRED for every P19-* batch + sub-batch
// while the §14 temp rule is live (delete this entry at Phase-19 close with the rule).
export const REQUIRED_IF = {
  phase_19_plan: (batchId) => /^P19-/i.test(batchId),
};

// B-TASK-LIST-SLOT (#1009) P1: Tier-1 LEDGER ROWS graded INSIDE a batch's completion report — rows for
// documents the DOCS table above cannot see (the per-session task lists are not repo docs it grades).
// Every class owes them (workflow-10-governance's Tier-1 rows are unconditional), so this table is NOT
// class-keyed. `sinceMs` = the commit at which the row first appears in workflow-10-governance at the
// ref; a report first added before it is NOT GRADED. It records when the requirement came into
// existence — a fact about the repo, not deploy config — so, unlike GOV_CUTOFF, it is NOT env-overridable.
// Scoped to ONE row deliberately (pre-audit P1): the two MEMORY rows landed before the verdict-column
// ledger shape was in common use; extending to them is homed at PHASE_19_PLAN row 4.8, OBJ-B.
// ⚠️ (Langston Step 4, condition 3) a confirmed `na-skip` row is stored as ONE flat `batchId:value` set, shared by the
// doc-gap resolve (value = a DOCS key) and the ledger-row resolve (value = a LEDGER_ROWS key). A LEDGER_ROWS key must
// NEVER equal a DOCS key, or an N/A confirmed for one silently resolves the other. poller.test.mjs asserts the two
// key sets are disjoint.
export const LEDGER_ROWS = {
  task_lists: {
    // "session task list(s)" or a CC_<X>_SESSION_TASK_LIST filename — NOT any "task list": an objectives
    // row such as "move CC_A task list | ✅ done" must not satisfy the ledger row (object-round reader r1).
    names: /session[\s_-]*task[\s_-]*lists?/i, // matched on text with * and ` removed and NBSP as space
    sinceMs: Date.parse('2026-09-05T05:45:00Z'), // bfdd1197f — workflow-10-governance:132 lands
  },
};

// Undeclared class → strictest (architecture) + flag (Item 5 / fail-closed).
export const DEFAULT_CLASS = 'architecture';

// Deadline (R1): hours from last code-bearing push before a governance-miss alarm.
// Validated empirically — 13/13 recent closes within 4h, max 2.1h (pre-audit §1.a).
export const DEADLINE_HOURS = 4;
// Poller tick + dead-man (Item 4 / Q3): 30-min tick, heartbeat alarm at 2 missed ticks.
export const TICK_MINUTES = 30;
export const HEARTBEAT_MISS_LIMIT = 2;
// Open-state backstop (R1 / C3): a declared-open batch open past this routes to Langston.
export const OPEN_STATE_BACKSTOP_HOURS = 48;

// Emptiness floor (Obj-3 / C7 / C10): a doc touched but with <= this many net
// content lines (after stripping whitespace/date-bump/TOC/heading-only) is "hollow".
export const HOLLOW_NET_LINE_FLOOR = 3;

// ─────────────────────────────────────────────────────────────────────────────
// B-GOV-2 (activation) constants
// ─────────────────────────────────────────────────────────────────────────────

// OBJ-1: a batch declares its change-class in its SCOPE-file header (NOT the commit
// message — Langston Step-1). The checker resolves the batch's scope file from the
// canonical Scope Files dir (filename contains the batch-id) and parses this marker.
export const SCOPE_DIR = 'Claude Comms and Packages/Scope Files';
export const CHANGE_CLASS_MARKER = /(?:^|\n)\s*(?:[-*>]\s*)?(?:\*\*)?change-class(?:\*\*)?\s*[:=]\s*`?([a-z_]+)`?/i;
export const VALID_CLASSES = ['architecture', 'non_architecture', 'sub_batch', 'hotfix'];

// OBJ-2: path-heuristic under-declaration guard. A diff touching these CORE ENGINE
// paths but declaring a non-architecture class → route "class may be under-declared".
// NOTE: substring match (`.includes`) — a typo'd path SILENTLY never matches (Langston
// Step-4 b-2). Every entry below is grep-verified to resolve to a real file in the tree.
export const CORE_ENGINE_PATHS = [
  'server/services/signal-orchestrator',
  'server/services/market-context-engine',        // MCE
  'server/core/filters/signal_quality_evaluator', // SQE
  'server/services/tec-evaluator',                // TEC (was the non-existent "trade-execution")
  'server/services/strategy-engine',              // the 9 in-class quant strategies (Langston b-1: the omission its own body named)
  'server/strategies',                            // file-based strategies (System-Manual scope, 2026-06-16)
  'server/core/metrics/market-regime',
  'server/core/metrics/regime-phase',
  'server/config/canonical-regime-strategy-map',  // SSOT (was the non-existent "shared/...")
  'server/asset_classes',
];

// OBJ-4c: an OPEN-declared batch open past this is a low-sev "still open?" escalation
// (on top of the 48h ping) — OPEN must never become a silent permanent bypass.
export const OPEN_STATE_MAX_AGE_HOURS = 24 * 7; // 7 days

// OBJ-5d: SHADOW mode — the first batch-or-two after activation run with ALL governance
// alerts downgraded to 'info' severity (visible, not paged) to calibrate against live
// Phase-19 patterns before warning-sev is trusted. Env-overridable: GOV_SHADOW=0 to exit.
export const SHADOW_MODE = process.env.GOV_SHADOW !== '0';

// ─────────────────────────────────────────────────────────────────────────────
// B-GOV-3 (go-live) constants
// ─────────────────────────────────────────────────────────────────────────────

// OBJ-1: GRANDFATHER CUTOFF (the flood fix). The live poller ENFORCES only on batches
// whose code CLOSES at/after this timestamp; everything that closed before go-live is
// grandfathered (NOT retroactively flagged — the 2026-06-19 flood was exactly retroactive
// grading of pre-checker history). Keyed on lastCode (close), NOT firstCode, so a STRADDLER
// (started before go-live, closes after) is STILL enforced (Langston Step-2). A config
// cutoff (vs 30 hand-rows) is the sustainable form (NO-PATCHES, Langston). Env-overridable
// `GOV_CUTOFF` so the exact go-live timestamp is set AT the flip without a code change;
// default grandfathers the recent clean closes (B-DISCORD/reorg-B2) + grades the first truly
// post-cutoff batch. ★ The Obj-3 backtest BYPASSES this (runs the pure computeBatchStates/
// decideAlerts directly, never the tick filter) so it can grade historical fixtures — applying
// the cutoff there would filter every fixture out and pass vacuously (Langston Catch #1).
export const ENFORCEMENT_CUTOFF_MS = Date.parse(process.env.GOV_CUTOFF || '2026-06-23T00:00:00Z');

// ─── #637: ONE SSOT FOR THE RESOLVE-EVIDENCE TOKEN SHAPE (Langston-ruled) ────
// `scripts/system-alerts.ts` REQUIRES `--evidence` and validates it as one of
// `path:line | sha | uuid | §/#ref` or a sanctioned sentinel. TWO separate
// processes issue resolves — the poller (which holds the graded sha in memory)
// and the heartbeat (a SEPARATE process that cannot see that memory). Both must
// agree on the shape, so the test lives HERE and neither duplicates it.
// ⚠️ Returns the SANCTIONED SENTINEL rather than throwing: an honest
// "NO-EVIDENCE-GIVEN" is a valid resolve, whereas a fabricated reference is the
// provenance-shaped theater #447 exists to prevent.
export function resolveEvidenceOrSentinel(sha) {
  if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) return 'NO-EVIDENCE-GIVEN';
  // ⚠️⚠️ A DECIMAL TIMESTAMP IS ALL-HEX BY ACCIDENT, AND THIS GUARD IS THE ONLY
  // THING STOPPING IT. `lastTick` = 1785485897377 is 13 chars, every one in
  // [0-9a-f]. ⛔ CORRECTED (Langston Step-4): an earlier comment here claimed it
  // would "fail the CLI's validation one layer deeper". IT WOULD NOT.
  // `isValidResolutionEvidence` (server/services/system-alerts.ts:172) tests
  // /[0-9a-f]{7,40}/i — UNANCHORED — so 13 hex chars PASSES. The timestamp
  // would have been written into `resolution_evidence` AS IF IT WERE A GIT SHA.
  // ⇒ not a failure moved later: a SILENT FABRICATED PROVENANCE RECORD, which is
  // the #447 class the sentinel exists to prevent. A real git sha at 7+ chars
  // being entirely decimal is a ~1-in-10^7 accident; a timestamp is ALWAYS decimal.
  if (/^[0-9]+$/.test(sha)) return 'NO-EVIDENCE-GIVEN';
  return sha;
}

// ─────────────────────────────────────────────────────────────────────────────
// B-PLAN-CURRENCY-CHECK P58 (6) / N8 — THE GRADED REF: ONE resolution of GOV_REF and GOV_BRANCH
// ─────────────────────────────────────────────────────────────────────────────
// Before this, poller.mjs read GOV_BRANCH alone while checker.mjs read `GOV_REF || GOV_BRANCH`, so setting
// GOV_REF alone made the two files grade DIFFERENT refs, undetected (Langston §10i, his finding 1). Both now
// import GOV_REF from here, and the old names stay as aliases (poller.mjs keeps BRANCH = GOV_REF). §10j 3(c):
// when BOTH env vars are set to DIFFERENT values, GOV_REF wins and ONE warning is printed at resolution,
// naming both values and the winner; silent when only one is set or both agree; it warns, it never fails.
// Resolved once per process at module load, so "once" is by construction. Pure over (env, warn) so all four
// input states are unit-tested. The box's unit sets only GOV_BRANCH (governance-checker.service).
export const DEFAULT_GOV_REF = 'origin/migration/aws-supabase';
export function resolveGovRefEnv(env, warn = console.warn) {
  const ref = env.GOV_REF || '', branch = env.GOV_BRANCH || '';
  if (ref && branch && ref !== branch) {
    warn(`[gov-checker] GOV_REF=${ref} and GOV_BRANCH=${branch} are both set and differ — grading at GOV_REF=${ref} (GOV_REF wins; GOV_BRANCH is its alias)`);
  }
  return ref || branch || DEFAULT_GOV_REF;
}
export const GOV_REF = resolveGovRefEnv(process.env);

// ─────────────────────────────────────────────────────────────────────────────
// B-PLAN-CURRENCY-CHECK OBJ-10 (P21-P25) — the exceptions ledger's grammar
// ─────────────────────────────────────────────────────────────────────────────

// ⛔ DORMANT BEHIND A COMMITTED FLAG (Langston, scope §10i R1-Q6 (ii)). `false` = TODAY'S EXACT RULE:
// poller.mjs `parseExceptionsLegacy` (exact type match, any non-`pending` confirmer counts, first
// `declared:<class>` match wins) and NO `gov-exceptions-malformed` alerts — so the push that carries
// the new parser is inert to grading. `true` = `parseExceptions` (closed type grammar, confirmer
// roster, strict class-override shape) plus the malformed-row alerts. Flipped by a ONE-LINE committed
// change after Langston's Step 4; DELETED in the batch's Step-10 commit, together with the legacy parse.
// Committed source, never env: push is deploy, and an env default is invisible at the graded ref.
export const EXCEPTIONS_V2_ENABLED = false;

// P22 (Q11 (a)): the confirmer roster — the four roster sessions + the two humans of ALERT_ACTORS
// (server/services/system-alerts.ts). A confirmer cell counts by its LEADING whitespace-delimited
// token, lowercased, split on '+'; every part must be here. `open` accepts any member (today's
// roster behaviour — the scope's Owner line is NOT parsed, so self-confirmation stays invisible:
// residual recorded on #1099); `na-skip` and `class-override` need langston or kyle among the parts.
export const EXCEPTION_CONFIRMERS = ['langston', 'kyle', 'cc-a', 'cc-b', 'cc-c', 'cc-infra'];
export const EXCEPTION_ACCEPT_BY_TYPE = {
  open: EXCEPTION_CONFIRMERS,
  'na-skip': ['langston', 'kyle'],
  'class-override': ['langston', 'kyle'],
};

// P23 (Q29 closed grammar; Q31 retirement by IN-PLACE retype only; R1-Q8; R3-Q11 (a)). Every type
// cell must be one of these, exactly; anything else is malformed (never keyword-sniffed).
//   honoured       — the three types the checker acts on.
//   retired        — skipped entirely, confirmer included. Retirement is an IN-PLACE type edit: an
//                    APPENDED `*-retired` row retires nothing (#654), so none is ever cross-matched.
//   recordOnly     — `deploy-hold`: accepted silently; no code reads it, and a deploy-hold row does
//                    NOT suspend the deadline (only an `open` row does).
//   notImplemented — the umbrella types are documented but have no parser branch, so a row that
//                    relies on one is FLAGGED rather than left inert (the #464 shape).
export const EXCEPTION_TYPES = {
  honoured: ['open', 'na-skip', 'class-override'],
  retired: ['open-retired', 'na-skip-retired', 'class-override-retired'],
  recordOnly: ['deploy-hold'],
  notImplemented: ['umbrella-namespace', 'umbrella-done'],
};
export const UMBRELLA_NOT_IMPLEMENTED = 'not implemented — B-UMBRELLA-OPEN-STATE (CC-B)';

// P24: the WHOLE class-override value must have this shape; the heuristic token stays OPTIONAL
// (B-LANGSTON-QUEUE-2 is `declared:hotfix`). No `reclassified:` token (condition 4). Built from
// VALID_CLASSES so the class list has one home.
export const CLASS_OVERRIDE_VALUE = new RegExp(
  `^declared:(${VALID_CLASSES.join('|')})(?: heuristic:(${VALID_CLASSES.join('|')}))?$`);

// P25 (Q30): one `warning` alert per `<batchId>:<type-slug>`; the type token is slugged and capped,
// never the raw cell echoed. Not a decideOrphanSweep type — the tick owns its resolution.
export const EXCEPTIONS_MALFORMED_PREFIX = 'gov-exceptions-malformed:';
export const EXCEPTIONS_MALFORMED_TYPE_CAP = 32;
export const EXCEPTIONS_MALFORMED_BID_CAP = 64;

// ─────────────────────────────────────────────────────────────────────────────
// B-PLAN-CURRENCY-CHECK OBJ-3 / OBJ-4 (P27) — the weekly census and mistake pass
// ─────────────────────────────────────────────────────────────────────────────

// ⛔ DORMANT BEHIND COMMITTED FLAGS (scope §10 Q9's form; §10e Q14 extends it to the mistake pass).
// `false` = TODAY'S BEHAVIOUR: no weekly census, no weekly mistake-pattern pass, and no liveness
// alert for either (heartbeat-check.mjs reads these same flags — this file is the one SSOT both
// checker processes import). Each is flipped by its OWN one-line committed change, only after the
// P44 dry run is committed, Langston has ruled its figures and his Step 4 is done (P62).
// Committed source, never env: push is deploy, and an env default is invisible at the graded ref.
export const WEEKLY_CENSUS_ENABLED = false;
export const MISTAKE_PASS_ENABLED = false;

// The weekly gate fires on the first successful tick at or after Monday CENSUS_HOUR_UTC:00Z of an
// ISO week not yet run (§10e Q10, catch-up). The heartbeat raises a `warning` liveness alert when an
// ENABLED census (or pass) has not run for more than CENSUS_STALE_DAYS days (P28). The census alert
// body is capped at CENSUS_BODY_MAX characters; the full lists live in the box file (§10e Q19).
export const CENSUS_HOUR_UTC = 9;
export const CENSUS_STALE_DAYS = 8;
export const CENSUS_BODY_MAX = 1000;

// ISO-8601 week of a UTC instant, as 'YYYY-Www'. The year is the ISO WEEK-YEAR (the year of that
// week's Thursday), so 2027-01-03 is '2026-W53' and 2027-01-04 is '2027-W01'. Pure; throws on a
// non-finite input rather than returning 'NaN-WNaN' as a week key.
export function isoWeek(ms) {
  if (!Number.isFinite(ms)) throw new TypeError(`isoWeek: not a finite timestamp: ${ms}`);
  const DAY_MS = 86400000;
  const d = new Date(ms);
  const dayFromMonday = (d.getUTCDay() + 6) % 7;
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayFromMonday + 3);
  const weekYear = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(weekYear, 0, 4);
  const week1Monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS;
  const week = Math.floor((thursday - week1Monday) / (7 * DAY_MS)) + 1;
  return `${weekYear}-W${String(week).padStart(2, '0')}`;
}
