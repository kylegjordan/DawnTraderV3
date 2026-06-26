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
  /\bB-[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*(?:\.\d+)?\b/,  // B-NAMES, B-GOV, B-GOV-2, B-TEC-SELFHEAL, B-NAMES.1
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
