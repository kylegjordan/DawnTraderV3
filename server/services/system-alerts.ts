/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-40 — System Alerts Library
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Persistent queue of "events that someone needs to look at" — both human
 * operators (UI tab) and AI agents (per-turn check in CC + Langston sessions).
 *
 * Writers that touch this file concurrently (census: B_ALERT_ACTOR_ALLOWLIST_PRE_AUDIT §A3):
 *   - The CLI (`scripts/system-alerts.ts`) — operator/AI-invoked, incl. Langston over SSH
 *   - The dispatcher timer (15-min systemd timer on staging) — promotes
 *     scheduled events to active when their `triggers_at` arrives; writes no identity
 *   - The governance-checker timers (poller + heartbeat) — add + resolve via the CLI
 *   - The HTTP API (`/api/system-alerts/:id/acknowledge`) — UI ack button
 *   - Direct library importers: `scripts/b-new-40-soak-verify.ts` (ack) and the
 *     one-shot resolve-provenance backfill script
 *   - The liveness watchdog (`server/scripts/staging-liveness-watchdog.mjs`) —
 *     appends rows itself, outside this library and its lock (#647)
 *
 * Identity: every `by` that reaches ackAlert/resolveAlert must normalise into
 * ALERT_ACTORS (B-ALERT-ACTOR-ALLOWLIST, #987) — free text is refused before the lock.
 *
 * Concurrency model: O_EXCL-based file lock (`/var/log/dawntrader/system-
 * alerts.jsonl.lock`). Same primitive that `proper-lockfile` uses under the
 * hood; no new npm dep needed (per Kyle "no new npm deps" directive from B75).
 *
 * Parse resilience: malformed JSONL lines are skipped with a console.warn,
 * not abort-on-error. Operator can fix in place; reader keeps going.
 *
 * First-deploy bootstrap: the first `add` call creates the file if it doesn't
 * exist (Langston Step 1 review concern — the per-turn check fail-soft path
 * handles file-missing gracefully but bootstrapping cleanly is preferred).
 *
 * Schema-versioning: all entries currently `schema_version: 1`. Future schema
 * changes bump this and old readers must skip-or-migrate based on version.
 *
 * Reference: B_NEW_40_SCOPE.md §2.8, B_NEW_40_PRE_AUDIT.md §2.7
 * ═════════════════════════════════════════════════════════════════════════════
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// B-NEW-51: env-overridable for unit tests (defaults to the staging path —
// SYSTEM_ALERTS_FILE is never set in staging/prod, so behavior is unchanged).
export const ALERTS_FILE = process.env.SYSTEM_ALERTS_FILE || '/var/log/dawntrader/system-alerts.jsonl';
const LOCK_FILE = `${ALERTS_FILE}.lock`;
const LOCK_RETRY_MAX = 50;       // 50 × 100ms = 5s max wait
const LOCK_RETRY_DELAY_MS = 100;
const LOCK_STALE_AFTER_MS = 30_000; // 30s — if lock is older than this, assume crashed holder and force-acquire

export type AlertState = 'scheduled' | 'active' | 'acknowledged' | 'resolved';

// ─── B-GOV-INTEGRITY-1 (OBJ-4, 2026-07-10): category is a SINGLE SOURCE ───────
//
// The runtime SSOT and the compile-time type are now the SAME thing — the type
// is DERIVED from this const. Before this batch the type declared 6 members
// while the live data held 13, because a `as AlertCategory` cast in the CLI
// admitted anything: a validator beside a still-present cast is a second lock on
// a door whose first lock is broken (Langston). The cast is deleted; every new
// alert's category is validated against ALERT_CATEGORIES at addAlert().
//
// Membership decided by Langston 2026-07-10 (Step-2): categories with a real
// forward consumer. `health_check` stays (2 live writers at the ref:
// database-monitor + b-storage-archival-health; a 3rd pending #441). `recurring`
// dropped (zero writers). Everything else is GRANDFATHERED — accepted on read
// for historical rows, never creatable anew.
export const ALERT_CATEGORIES = [
  'governance',          // B-GOV governance-checker: missing/thin/hollow doc-set gaps
  'breakage',
  'soak_verification',
  'one_off',
  'verification',
  'reminder',
  'health_check',        // disk / archival-cron-silence / freshness system health
] as const;
export type AlertCategory = typeof ALERT_CATEGORIES[number];

// Historical categories present in stored rows but NOT creatable going forward.
// Kept ONLY so validation of existing data does not reject its own history —
// addAlert() refuses these; readers accept them. (Never rewrite stored rows.)
export const GRANDFATHERED_ALERT_CATEGORIES = [
  'test',
  'reorg_b2_1_window',
  'b46b_soak_analysis',
  'comms_decommission',
  'weekend_restart_verification',
  'scheduled_verification',
  'tec_selfheal_verify',
  'health_check', // also creatable; listed for reader-completeness
  'recurring',    // dropped from creatable set this batch
] as const;

/**
 * OBJ-4 gate: a NEW alert's category must be in the creatable SSOT. Rejects
 * loudly — a typo or an off-taxonomy string can no longer slip in via a cast and
 * then vanish from every consumer keyed on the real set. Returns the value
 * narrowed to AlertCategory so call sites need no cast.
 */
export function assertCategoryCreatable(c: string): AlertCategory {
  if ((ALERT_CATEGORIES as readonly string[]).includes(c)) return c as AlertCategory;
  throw new Error(
    `addAlert: category (${c.length} chars, not echoed) is not creatable. ` +
    `Allowed: ${ALERT_CATEGORIES.join(' | ')}. ` +
    `(Grandfathered-historical categories are accepted on read but cannot be created.)`,
  );
}

export type AlertSeverity = 'info' | 'warning' | 'critical';

// ─── B-GOV-INTEGRITY-1 (OBJ-3, 2026-07-10): class-driven delivery ────────────
//
// Delivery was severity-only: warning+critical post, info skips — so 117 of 254
// alerts (info) never reached Discord, INCLUDING info-severity `governance`
// alerts (a governance gap that pages nobody is the whole problem this program
// exists to fix). Delivery is now CLASS-driven: a category that must never be
// silent delivers at ANY severity; everything else keeps the severity gate (a
// routine info health check still need not page). Categories, not severities,
// decide whether an alert can be silent.
export const ALWAYS_DELIVER_CATEGORIES = new Set<string>([
  'governance', // a doc-set gap must never be silent (Langston, Step-2)
  'breakage',   // a break must never be silent regardless of how it was filed
]);

/**
 * OBJ-3 delivery gate. Returns true iff this alert should be pushed to the
 * Discord alerts sink. Warning/critical always deliver (unchanged); an info
 * alert delivers only if its category must-never-be-silent.
 */
export function shouldDeliverToDiscord(alert: Pick<SystemAlert, 'severity' | 'category'>): boolean {
  if (alert.severity === 'warning' || alert.severity === 'critical') return true;
  return ALWAYS_DELIVER_CATEGORIES.has(alert.category);
}

// ─── B-GOV-INTEGRITY-1 (F3b, 2026-07-10): resolve provenance primitives ──────
//
// `resolved_by_transport` is the channel a resolve arrived through. It is the
// VERIFIABLE half of the who-resolved-this question — stamped by the code path,
// NEVER passed by the caller (a caller-supplied transport is just a second
// claim, which collapses the two-field trust distinction). Each call site hands
// resolveAlert() its own literal; there is no `--transport` flag.
export type ResolveTransport = 'cli' | 'dispatcher' | 'api' | 'governance-checker';

// Sanctioned sentinels: the ONLY non-reference strings resolution_evidence may
// hold. `NO-EVIDENCE-GIVEN` forces an HONEST admission (better than a fake
// reference); `provenance-unknown-pre-F3b` is the audited backfill marker (OBJ-2)
// — enumerated here so a backfilled row does not fail this very validator on a
// re-run. Two sanctioned literals in ONE set, not two free strings that happen
// to differ (a set, not a count).
export const RESOLUTION_EVIDENCE_SENTINELS = [
  'NO-EVIDENCE-GIVEN',
  'provenance-unknown-pre-F3b',
] as const;
export type ResolutionEvidenceSentinel = typeof RESOLUTION_EVIDENCE_SENTINELS[number];

/**
 * Hard gate for `resolution_evidence` (B-GOV-INTEGRITY-1 OBJ-1, Langston Q2).
 * A non-empty check is NOT enough — it passes "looks fine", which is the exact
 * texture of the 249 empty closes with a word added. Evidence must EITHER be a
 * sanctioned sentinel OR carry a re-derivable reference token:
 *   - a path:line          (server/foo.ts:42)
 *   - a git sha            (7–40 hex)
 *   - a uuid               (alert id / run id)
 *   - a doc section ref    (§3.2, #440)
 *
 * HONEST LIMIT (Langston Step-4): this is a FORCING FUNCTION, not airtight
 * validation. Any shape gate is defeatable — an English hex-word like "defaced"
 * matches the sha rule. The real safety is the sanctioned `NO-EVIDENCE-GIVEN`
 * escape hatch: it lets an honest "I have no reference" through, so nobody needs
 * to fake one. The gate raises the cost of a lazy close; it does not verify the
 * reference exists (that is Layer-B, in the checker, at the graded ref).
 */
export function isValidResolutionEvidence(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if ((RESOLUTION_EVIDENCE_SENTINELS as readonly string[]).includes(t)) return true;
  return (
    /[\w.\/-]*[.\/][\w.\/-]*:\d+/.test(t) ||                    // path:line — requires a '.' or '/' so a bare time ("3:00") fails
    /\b[0-9a-f]{7,40}\b/i.test(t) ||                            // git sha (7–40 hex) — permissive by design (see HONEST LIMIT)
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(t) || // uuid
    /[§#]\s*[\w.\-]+/.test(t)                                   // doc section / issue ref
  );
}

// ─── B-ALERT-ACTOR-ALLOWLIST (#987, 2026-09-02): who may act on an alert ───────
//
// `acknowledged_by` / `resolved_by_claimed` were free text: 782 rows carried 75
// (MEASURED 2026-09-02, the whole alerts file at that date — a count, not a rate,
// and it does not update itself: re-measure before citing it, never quote it from here.)
// distinct strings, most of them dated one-offs (`cc-session-<date>`) that
// identify nobody — the retired convention CLAUDE.md §10.5 step 3 itself taught
// for 26 days before the session roster existed. The identity is now ONE
// canonical table, defined here, tagged by what each entry IS, applied at BOTH
// write paths before the lock. Free text is refused, never mapped by guesswork:
// the normalisation table below is EXACT strings after trim + lowercase — never a
// prefix, never a regex — so `langston (transport: …)` is refused, not mapped
// (Langston Step-2 condition L3). Historical rows are NOT rewritten (OBJ-5).
export type AlertActorTag = 'roster' | 'machine' | 'human';
export interface AlertActor {
  readonly value: string;
  readonly tag: AlertActorTag;
  readonly why: string;
}
export const ALERT_ACTORS = [
  // roster — the four Claude Code sessions, bound in .claude/cc-session-roster.json
  { value: 'cc-a',     tag: 'roster', why: 'Claude Old (OLD Claude) — roster-bound session' },
  { value: 'cc-b',     tag: 'roster', why: 'Claude New (NEW Claude) — roster-bound session' },
  { value: 'cc-c',     tag: 'roster', why: 'Claude Analyst (ANALYST Claude) — roster-bound session' },
  { value: 'cc-infra', tag: 'roster', why: 'Infra Claude — roster-bound session' },
  // machine — timers and scripts that act on the file with a fixed name
  { value: 'governance-checker',           tag: 'machine', why: 'scripts/governance-checker/poller.mjs (30-min timer): add + auto-resolve' },
  { value: 'governance-checker-heartbeat', tag: 'machine', why: 'scripts/governance-checker/heartbeat-check.mjs (15-min timer)' },
  { value: 'b-new-40-soak-verify',         tag: 'machine', why: 'scripts/b-new-40-soak-verify.ts — acks the soak alert it verifies' },
  // human
  { value: 'kyle',     tag: 'human', why: 'the decider; the alerts-page default' },
  { value: 'langston', tag: 'human', why: 'the reviewer, acting through the CLI over SSH from Helsinki' },
] as const satisfies readonly AlertActor[];
export type CanonicalAlertActor = typeof ALERT_ACTORS[number]['value'];
const ALERT_ACTOR_VALUES: ReadonlySet<string> = new Set(ALERT_ACTORS.map((a) => a.value));

// Exact-string aliases (matched AFTER trim + lowercase) that the live history
// actually used for a canonical actor. Anything not listed here and not in
// ALERT_ACTORS is refused — including every `cc-session-<date>`, the govflood
// and `cc-<alias>-<date>` forms, `phase4-*`, `b-new-43-*`, `test`, and a canonical
// name with text appended. A refused string is never silently mapped.
export const ALERT_ACTOR_NORMALISATION: Readonly<Record<string, CanonicalAlertActor>> = {
  'cc-a-old-claude':     'cc-a',
  'cc-analyst':          'cc-c',
  'cc-c-analyst':        'cc-c',
  'infra-claude':        'cc-infra',
  'langston (reviewer)': 'langston',
  'langston-reviewer':   'langston',
  'kyle-direct':         'kyle',   // the dt-deploy convention (scripts/dt-deploy.sh)
};

/**
 * Typed refusal. The message deliberately does NOT echo the refused string:
 * the governance-checker poller classifies a resolve failure as benign — and
 * prints nothing — when stderr matches /not found|already|terminal|resolved/i
 * (poller.mjs), so an echoed value containing one of those words would make
 * the refusal vanish. Length + the allowed set is enough for the caller, who
 * typed the value. (Same class fix applied to the category and evidence gates.)
 */
export class AlertActorError extends Error {
  readonly refusedLength: number;
  constructor(refusedLength: number) {
    super(
      `alert actor refused (${refusedLength} chars, not echoed); allowed: ` +
      `[${ALERT_ACTORS.map((a) => a.value).join(' | ')}]`,
    );
    this.name = 'AlertActorError';
    this.refusedLength = refusedLength;
  }
}

/**
 * Trim + lowercase, then exact membership or exact alias. Null = refused.
 *
 * #1000 (2026-09-04) — TOTALITY. This function shipped with `ALERT_ACTOR_NORMALISATION[key]`
 * on a PLAIN OBJECT LITERAL, so the lookup fell through to `Object.prototype` and `??` — which
 * catches only null/undefined — never saw the inherited value. MEASURED by execution, not read:
 * `constructor` returned the `Object` FUNCTION and `assertAlertActor`'s truthy check passed it,
 * after which `JSON.stringify` DROPPED it and the row landed with NO `acknowledged_by` KEY AT
 * ALL — an absent attribution inside the gate built to stop free-text attribution. `__proto__`
 * returned `Object.prototype` and wrote `{}`. `toString`/`valueOf`/`hasOwnProperty` refused only
 * ACCIDENTALLY, because `.toLowerCase()` mangles the key away from the prototype's spelling —
 * nothing in the design was doing that work.
 *
 * TWO independent guards, deliberately not one: `hasOwnProperty.call` stops the prototype chain,
 * and the `typeof === 'string'` check below stops ANY non-string escaping regardless of how it
 * got into the table. The second is what makes this robust to a future table gaining a
 * surprising key rather than to this one bug.
 */
export function normaliseAlertActor(by: unknown): CanonicalAlertActor | null {
  if (typeof by !== 'string') return null;
  const key = by.trim().toLowerCase();
  if (ALERT_ACTOR_VALUES.has(key)) return key as CanonicalAlertActor;
  if (!Object.prototype.hasOwnProperty.call(ALERT_ACTOR_NORMALISATION, key)) return null;
  const mapped: unknown = ALERT_ACTOR_NORMALISATION[key];
  if (typeof mapped !== 'string' || !ALERT_ACTOR_VALUES.has(mapped)) return null;
  return mapped as CanonicalAlertActor;
}

/**
 * The gate. Called by ackAlert and resolveAlert BEFORE ensureFileExists()/withLock,
 * mirroring the evidence gate: a refusal touches no file and takes no lock.
 * Returns the canonical value — that is what gets written, never the raw input.
 */
export function assertAlertActor(by: unknown): CanonicalAlertActor {
  const canonical = normaliseAlertActor(by);
  if (canonical) return canonical;
  throw new AlertActorError(typeof by === 'string' ? by.length : 0);
}

export interface SystemAlert {
  schema_version: 1;
  id: string;                                      // uuid
  created_at: string;                              // ISO-8601
  triggers_at: string;                             // ISO-8601 — when this should fire
  fired_at: string | null;                         // ISO-8601 — when dispatcher promoted scheduled → active
  acknowledged_at: string | null;                  // ISO-8601
  acknowledged_by: string | null;                  // a CanonicalAlertActor since #987 (historical rows hold the 75 legacy strings — never rewritten)
  // ─── B-GOV-INTEGRITY-1 (F3b, 2026-07-10): resolve provenance ──────────────
  // Closure must be a RECORD, not an assertion. Two identity fields at DIFFERENT
  // trust levels — never merge them, or a claim launders into a fact:
  resolved_at: string | null;                      // ISO-8601 — when state → resolved
  resolved_by_claimed: string | null;              // what the CALLER passed (`--by`) — a CLAIM
  resolved_by_transport: ResolveTransport | null;  // the channel the resolve arrived through — CODE-DERIVED, never caller-supplied
  resolution_evidence: string | null;              // WHY the close is legitimate: a re-derivable reference token OR a sanctioned sentinel (validated, never free text)
  state: AlertState;
  category: AlertCategory;
  severity: AlertSeverity;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
  /** Schema-reserved for future recurring health checks. Not used yet. */
  recurrence_interval_seconds: number | null;
  /** B-NEW-51 (2026-06-02): optional de-duplication key. When set, `addAlert`
   * suppresses creating a NEW alert if a NON-terminal alert (scheduled |
   * active | acknowledged) with the same key already exists — collapsing a
   * repeating condition (e.g. a cron job that's stale every 15-min verifier
   * cycle) into a single alert instead of one per cycle. Absent/undefined on
   * pre-B-NEW-51 alerts and on callers that don't pass one (no dedup → legacy
   * behavior). A `resolved` same-key alert does NOT block a fresh one. */
  dedupe_key?: string | null;
}

// ─── File-lock primitives (O_EXCL based, no npm deps) ──────────────────────
//
// Note (Langston Step 4 review, R-busy-wait): acquireLock is async — under lock
// contention it yields the Node event loop via `await new Promise(setTimeout)`
// instead of busy-waiting synchronously. This matters because the HTTP path
// (`/api/system-alerts/:id/acknowledge`) calls into this library from an
// Express handler in the trading-hot Node process; a synchronous busy-wait
// would stall every other route (TEC, signal pipeline) for up to 5s under
// contention. All public mutating APIs (addAlert/fireDue/ackAlert/resolveAlert)
// are therefore async — CLI callers must `await`.

async function acquireLock(): Promise<void> {
  for (let attempt = 0; attempt < LOCK_RETRY_MAX; attempt++) {
    try {
      // O_EXCL + O_CREAT: atomic "create only if doesn't exist". If another
      // process holds the lock, fails with EEXIST.
      const fd = fs.openSync(LOCK_FILE, fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY, 0o644);
      fs.writeSync(fd, `${process.pid}\n${new Date().toISOString()}\n`);
      fs.closeSync(fd);
      return;
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // Check if the lock is stale (holder crashed before releasing)
        try {
          const stats = fs.statSync(LOCK_FILE);
          if (Date.now() - stats.mtimeMs > LOCK_STALE_AFTER_MS) {
            // Stale lock — force-remove and retry. Race window: two acquirers
            // simultaneously detecting staleness both unlink → second unlink
            // could remove a fresh lock from the first acquirer. Window is
            // tens of microseconds against a 30s+ stale lock, so very low
            // probability. Hardening (PID-based liveness check) tracked as
            // RUNNING_ISSUES candidate, not blocking B-NEW-40 ship.
            console.warn(`[system-alerts] stale lock detected (age ${Date.now() - stats.mtimeMs}ms), force-acquiring`);
            try { fs.unlinkSync(LOCK_FILE); } catch { /* race: another writer cleaned up first */ }
            continue;
          }
        } catch { /* file vanished between EEXIST and statSync — race; retry */ }
        // Active lock; yield event loop and retry
        await new Promise<void>((resolve) => setTimeout(resolve, LOCK_RETRY_DELAY_MS));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`[system-alerts] failed to acquire lock after ${LOCK_RETRY_MAX} retries (~${LOCK_RETRY_MAX * LOCK_RETRY_DELAY_MS}ms)`);
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
      console.error('[system-alerts] failed to release lock:', err);
    }
  }
}

async function withLock<T>(fn: () => T | Promise<T>): Promise<T> {
  await acquireLock();
  try {
    return await fn();
  } finally {
    releaseLock();
  }
}

// ─── Read / parse with skip-on-error resilience ────────────────────────────

function ensureFileExists(): void {
  if (!fs.existsSync(ALERTS_FILE)) {
    fs.mkdirSync(path.dirname(ALERTS_FILE), { recursive: true });
    fs.writeFileSync(ALERTS_FILE, '', { flag: 'a' }); // create empty if absent
  }
}

/**
 * Read all alerts from the file. Malformed lines are SKIPPED with a warning,
 * not aborted. If the file doesn't exist returns []. Used by readers (CLI list,
 * API GET, per-turn AI check).
 */
export function readAllAlerts(): SystemAlert[] {
  if (!fs.existsSync(ALERTS_FILE)) return [];
  const raw = fs.readFileSync(ALERTS_FILE, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const result: SystemAlert[] = [];
  let skipped = 0;
  for (const [idx, line] of lines.entries()) {
    try {
      const entry = JSON.parse(line) as SystemAlert;
      // Minimal shape validation — skip if required fields missing
      if (!entry.id || !entry.state || !entry.triggers_at) {
        skipped++;
        continue;
      }
      result.push(entry);
    } catch (_err) {
      skipped++;
      // Don't spam if many lines bad; one warning is enough
      if (skipped === 1) {
        console.warn(`[system-alerts] skipping malformed JSONL line ${idx + 1} (and potentially more)`);
      }
    }
  }
  return result;
}

/**
 * Atomic whole-file rewrite via tmpfile-rename. Always called inside withLock().
 */
function writeAllAlertsAtomic(alerts: SystemAlert[]): void {
  const tmp = `${ALERTS_FILE}.tmp.${process.pid}.${Date.now()}`;
  const content = alerts.map((a) => JSON.stringify(a)).join('\n') + (alerts.length > 0 ? '\n' : '');
  fs.writeFileSync(tmp, content, { mode: 0o644 });
  fs.renameSync(tmp, ALERTS_FILE);
}

// ─── Public mutating API (all under lock) ──────────────────────────────────

export interface AddAlertOptions {
  triggers_at: string | Date;
  // Accepts a raw string so the CLI can pass unvalidated input WITHOUT a cast
  // (OBJ-4); addAlert() validates it via assertCategoryCreatable and throws on
  // an off-SSOT value. Internal typed callers passing an AlertCategory literal
  // remain assignable.
  category: AlertCategory | string;
  severity: AlertSeverity;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  recurrence_interval_seconds?: number | null;
  /** B-NEW-51: when set, suppress creating a new alert if a non-terminal
   * (scheduled/active/acknowledged) alert with the same key already exists. */
  dedupe_key?: string;
}

/**
 * Insert a new alert. If `triggers_at` is in the past, the dispatcher will
 * promote it to active on its next run. State starts as `scheduled`.
 *
 * B-NEW-51 dedup: when `opts.dedupe_key` is provided and a NON-terminal alert
 * (state !== 'resolved') with the same `dedupe_key` already exists, no new
 * alert is written and the EXISTING one is returned. This collapses a
 * repeating condition into a single alert. Callers that omit `dedupe_key` get
 * the original always-append behavior (backward-compatible).
 */
export async function addAlert(opts: AddAlertOptions): Promise<SystemAlert> {
  ensureFileExists();
  const triggersAtISO = typeof opts.triggers_at === 'string' ? opts.triggers_at : opts.triggers_at.toISOString();
  const entry: SystemAlert = {
    schema_version: 1,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    triggers_at: triggersAtISO,
    fired_at: null,
    acknowledged_at: null,
    acknowledged_by: null,
    resolved_at: null,
    resolved_by_claimed: null,
    resolved_by_transport: null,
    resolution_evidence: null,
    state: 'scheduled',
    category: assertCategoryCreatable(opts.category), // OBJ-4: reject off-SSOT categories at creation

    severity: opts.severity,
    title: opts.title,
    body: opts.body,
    metadata: opts.metadata ?? {},
    recurrence_interval_seconds: opts.recurrence_interval_seconds ?? null,
    dedupe_key: opts.dedupe_key ?? null,
  };
  let result: SystemAlert = entry;
  await withLock(() => {
    const all = readAllAlerts();
    if (opts.dedupe_key) {
      // Dedup: a non-resolved alert with the same key already represents this
      // condition — return it, write nothing. (`resolved` is terminal and does
      // NOT block a fresh alert if the condition recurs.)
      const existing = all.find(
        (a) => a.dedupe_key === opts.dedupe_key && a.state !== 'resolved',
      );
      if (existing) {
        result = existing;
        return;
      }
    }
    all.push(entry);
    writeAllAlertsAtomic(all);
  });
  return result;
}

/**
 * Dispatcher invocation: promote `scheduled` entries whose `triggers_at <= NOW()`
 * to `active`. Returns the entries that were promoted (so callers can fire
 * the Discord alerts-webhook notification etc.).
 *
 * Idempotency: state mutation persists even if subsequent post-promotion steps
 * (e.g. the Discord push) fail — caller handles push errors separately.
 */
export async function fireDue(nowMs: number = Date.now()): Promise<SystemAlert[]> {
  ensureFileExists();
  const promoted: SystemAlert[] = [];
  await withLock(() => {
    const all = readAllAlerts();
    const nowISO = new Date(nowMs).toISOString();
    let mutated = false;
    for (const entry of all) {
      if (entry.state === 'scheduled' && entry.triggers_at <= nowISO) {
        entry.state = 'active';
        entry.fired_at = nowISO;
        promoted.push({ ...entry }); // clone for return so caller mutations don't affect file state
        mutated = true;
      }
    }
    if (mutated) {
      writeAllAlertsAtomic(all);
    }
  });
  return promoted;
}

/**
 * Mark an alert as acknowledged. `by` must normalise into ALERT_ACTORS (#987) —
 * refused before any file or lock is touched; the CANONICAL value is written.
 * Returns the updated alert, or null if not found.
 */
export async function ackAlert(id: string, by: string): Promise<SystemAlert | null> {
  const actor = assertAlertActor(by); // #987: before ensureFileExists/withLock, like the evidence gate
  ensureFileExists();
  let result: SystemAlert | null = null;
  await withLock(() => {
    const all = readAllAlerts();
    const found = all.find((a) => a.id === id);
    if (!found) return;
    if (found.state === 'active') {
      found.state = 'acknowledged';
      found.acknowledged_at = new Date().toISOString();
      found.acknowledged_by = actor;
      result = { ...found };
      writeAllAlertsAtomic(all);
    } else {
      // Idempotent — if already acknowledged or resolved, return current state
      result = { ...found };
    }
  });
  return result;
}

/**
 * Mark an alert as resolved (terminal state — kept for history but won't
 * surface). Use when the underlying condition is fully closed.
 */
export async function resolveAlert(
  id: string,
  by: string,
  evidence: string,
  transport: ResolveTransport,
): Promise<SystemAlert | null> {
  // B-ALERT-ACTOR-ALLOWLIST (#987): identity is gated first, before any file or
  // lock — a repeat resolve (the checker re-resolves by design) is bound too.
  const actor = assertAlertActor(by);
  // B-GOV-INTEGRITY-1 (F3b): closure is a RECORD, not a state flag. The hard
  // evidence gate is enforced HERE (not only in the CLI) so EVERY resolve path —
  // CLI, dispatcher, API, governance-checker — is bound by it. A close with no
  // legitimate basis is refused, loudly, before any write. The refused value is
  // NOT echoed (#987 L1: the poller's benign-failure regex would swallow it).
  // Length is taken BEFORE the guard: inside the false branch the type guard has
  // narrowed `evidence` to `never`, so `.length` there is a tsc error.
  const evidenceLength = typeof evidence === 'string' ? evidence.length : 0;
  if (!isValidResolutionEvidence(evidence)) {
    throw new Error(
      // (#987 L1, second reader: the id is caller-typed on the CLI path too — an id of
      // "already" would have matched the poller's benign regex. Not echoed either.)
      `resolveAlert: resolution_evidence rejected — must be a reference token ` +
      `(path:line | sha | uuid | §/#ref) or a sanctioned sentinel ` +
      `(${RESOLUTION_EVIDENCE_SENTINELS.join(' | ')}). Got ${evidenceLength} chars (not echoed).`,
    );
  }
  ensureFileExists();
  let result: SystemAlert | null = null;
  await withLock(() => {
    const all = readAllAlerts();
    const found = all.find((a) => a.id === id);
    if (!found) return;
    const now = new Date().toISOString();
    found.state = 'resolved';
    found.resolved_at = now;
    found.resolved_by_claimed = actor;       // the caller's claim, canonicalised (#987)
    found.resolved_by_transport = transport; // the code-stamped, verifiable channel
    found.resolution_evidence = evidence.trim();
    if (!found.acknowledged_at) {
      found.acknowledged_at = now;
      found.acknowledged_by = actor;
    }
    result = { ...found };
    writeAllAlertsAtomic(all);
  });
  return result;
}

/**
 * B-GOV-INTEGRITY-1 OBJ-2 — one-shot backfill of resolve provenance onto the
 * historical resolved rows that predate F3b. Kept HERE (not in the migration
 * script) so the lock + atomic-write discipline lives in one place. Called only
 * by `scripts/b-gov-integrity-1-backfill-resolve-provenance.ts`.
 *
 * HONEST-ONLY: adds `resolution_evidence` (a sanctioned sentinel) + a
 * reconstructed `resolved_at` (from acknowledged_at, else null) + the existing
 * `acknowledged_by` as the claimed identity. Transport stays NULL — the channel
 * was never recorded and null is the truthful "unknown" (a typed enum has no
 * honest slot for a backfill marker). Idempotent + no-clobber: any row already
 * carrying provenance is left untouched.
 */
export async function __backfillResolveProvenance__(
  opts: { evidence: ResolutionEvidenceSentinel },
): Promise<{ backfilled: number }> {
  ensureFileExists();
  let backfilled = 0;
  await withLock(() => {
    const all = readAllAlerts();
    for (const a of all) {
      if (a.state !== 'resolved') continue;
      const hasProvenance =
        a.resolved_at != null || a.resolved_by_claimed != null ||
        a.resolved_by_transport != null || a.resolution_evidence != null;
      if (hasProvenance) continue; // no-clobber
      a.resolved_at = a.acknowledged_at ?? null;      // reconstruction, never minted
      a.resolved_by_claimed = a.acknowledged_by ?? null; // the only identity we have
      a.resolved_by_transport = null;                  // honest unknown
      a.resolution_evidence = opts.evidence;           // sanctioned sentinel
      backfilled++;
    }
    if (backfilled > 0) writeAllAlertsAtomic(all);
  });
  return { backfilled };
}

// ─── B-ALERT-PROTOCOL (#340): no-silent-drop stale-alert re-surface ─────────
//
// The closure guarantee: a diagnosed-but-unresolved alert must never rot. This
// is a PUSH mechanism (re-post + escalate), distinct from the pull-based §10.5
// per-turn check (we are NOT piling a second patch on that — Langston Step-1).
// Run from the dispatcher AFTER fireDue() (Langston Step-1 (d): same process,
// holds the same file lock, no sibling cron). Kept as a SEPARATE PURE function
// so the "exactly one re-surface per back-off window" invariant is unit-testable.
//
// Two-tier TTL (Langston Step-1 (b)): an `active` alert is UN-ACKED — nobody
// owns it yet, the worse state — so it re-surfaces at the SHORT TTL; an
// `acknowledged` (owned, being worked) alert gets a LONGER leash. Ack does NOT
// reset the staleness clock — only `resolve` stops re-surfacing. The back-off
// WIDENS each re-surface (1× → 2× → 4× TTL); the 2nd+ re-surface escalates to
// Kyle by name (once it's in front of him the forcing function is done — nudge,
// don't spam). `info` severity never pushes.

const HOUR_MS = 3_600_000;
/** Base TTL (ms) for the FIRST re-surface, by state then severity. */
export const RESURFACE_TTL_MS: Record<'active' | 'acknowledged', Record<'warning' | 'critical', number>> = {
  active: { critical: 2 * HOUR_MS, warning: 6 * HOUR_MS }, // un-acked = worse state = shorter fuse
  acknowledged: { critical: 4 * HOUR_MS, warning: 12 * HOUR_MS }, // owned + being worked = longer leash
};
// CAP the widening back-off (Langston Step-4 note): without it, an alert re-surfaced N× while
// unclaimed then acked jumps to baseTtl·2^N (e.g. 12h·2³ = 96h for a warning) — more leash than
// intended, and the doubling marches toward never-firing. Capping the multiplier bounds the max
// re-nudge interval (acked warning ≤ 48h, acked critical ≤ 16h) and keeps a steady nudge cadence.
export const RESURFACE_MAX_BACKOFF_MULT = 4;

export interface ResurfaceDecision {
  alert: SystemAlert;
  /** This is the Nth re-surface (1-based). */
  resurfaceCount: number;
  /** 2nd and later re-surfaces escalate to Kyle by name. */
  escalateToKyle: boolean;
}

/**
 * PURE: which non-resolved alerts are due to re-surface at `nowMs`. Does not
 * mutate — the caller posts each + calls markResurfaced(). The staleness clock
 * runs from `fired_at` (or a re-surface), NEVER from `acknowledged_at` (ack must
 * not reset it — only resolve stops re-surfacing); acking only swaps the alert
 * onto the longer-leash TTL tier.
 */
export function computeResurfaceStale(alerts: SystemAlert[], nowMs: number = Date.now()): ResurfaceDecision[] {
  const out: ResurfaceDecision[] = [];
  for (const a of alerts) {
    if (a.state !== 'active' && a.state !== 'acknowledged') continue; // scheduled/resolved never re-surface
    if (a.severity === 'info') continue; // info never pushes
    const baseTtl = RESURFACE_TTL_MS[a.state][a.severity];
    const firedMs = a.fired_at ? Date.parse(a.fired_at) : Date.parse(a.created_at);
    const count = typeof a.metadata?.resurface_count === 'number' ? (a.metadata.resurface_count as number) : 0;
    const lastResurfacedAt = a.metadata?.last_resurfaced_at;
    const lastMs = typeof lastResurfacedAt === 'string' ? Date.parse(lastResurfacedAt) : firedMs;
    const gapMs = baseTtl * Math.min(Math.pow(2, count), RESURFACE_MAX_BACKOFF_MULT); // widening 1×→2×→4×, capped
    if (nowMs - lastMs >= gapMs) {
      out.push({ alert: a, resurfaceCount: count + 1, escalateToKyle: count >= 1 });
    }
  }
  return out;
}

/**
 * Record that an alert was re-surfaced: bump `metadata.resurface_count` + stamp
 * `metadata.last_resurfaced_at`. Under lock. Called by the dispatcher AFTER it
 * posts the re-surface. Returns the updated alert, or null if not found / now
 * resolved (a race where it resolved between compute and mark — skip).
 */
export async function markResurfaced(id: string, nowMs: number = Date.now()): Promise<SystemAlert | null> {
  ensureFileExists();
  let result: SystemAlert | null = null;
  await withLock(() => {
    const all = readAllAlerts();
    const found = all.find((a) => a.id === id);
    if (!found || found.state === 'resolved') return; // resolved between compute+mark → don't re-stamp
    const count = typeof found.metadata?.resurface_count === 'number' ? (found.metadata.resurface_count as number) : 0;
    found.metadata = {
      ...found.metadata,
      resurface_count: count + 1,
      last_resurfaced_at: new Date(nowMs).toISOString(),
    };
    result = { ...found };
    writeAllAlertsAtomic(all);
  });
  return result;
}

export interface ResurfaceResult {
  id: string;
  delivered: boolean;
  skipped?: 'resolved';
}

/**
 * Orchestrate one re-surface pass (B-ALERT-PROTOCOL #340 — reworked after Langston Step-4
 * CHANGES-NEEDED). For each stale alert: re-validate under a fresh read (skip if it RESOLVED
 * between the unlocked compute snapshot and now — the race fix, so a just-resolved alert can't
 * throw a bogus "STILL UNRESOLVED" post or a false Kyle escalation), DELIVER via the injected
 * sink, and **advance the back-off (markResurfaced) ONLY when delivery actually succeeded.**
 * An UNDELIVERED re-surface must NOT consume the window — otherwise the back-off marches toward
 * never-firing while zero notifications reach anyone (the inverted-guarantee bug). The `deliver`
 * sink is injected (the dispatcher owns the Discord alerts-webhook channel — the sole push sink since B-TELEGRAM-DECOMM-2) so this
 * orchestration is unit-testable without network IO.
 */
export async function processResurface(
  nowMs: number,
  deliver: (alert: SystemAlert, d: ResurfaceDecision) => Promise<boolean>,
): Promise<ResurfaceResult[]> {
  const out: ResurfaceResult[] = [];
  for (const d of computeResurfaceStale(readAllAlerts(), nowMs)) {
    const fresh = readAllAlerts().find((a) => a.id === d.alert.id);
    if (!fresh || fresh.state === 'resolved') {
      out.push({ id: d.alert.id, delivered: false, skipped: 'resolved' });
      continue;
    }
    const delivered = await deliver({ ...fresh }, d);
    if (delivered) await markResurfaced(d.alert.id, nowMs); // advance back-off ONLY on real delivery
    out.push({ id: d.alert.id, delivered });
  }
  return out;
}

// ─── Read accessors (no lock — concurrent reads are safe) ─────────────────

export interface ListAlertsOptions {
  state?: AlertState;
  // A filter, not a creation — accepts any category that can appear in stored
  // rows, INCLUDING grandfathered ones, so historical data is filterable.
  category?: AlertCategory | string;
}

export function listAlerts(opts: ListAlertsOptions = {}): SystemAlert[] {
  let all = readAllAlerts();
  if (opts.state) all = all.filter((a) => a.state === opts.state);
  if (opts.category) all = all.filter((a) => a.category === opts.category);
  return all;
}

/**
 * Convenience: alerts that an AI per-turn check or the UI tab should surface.
 * These are unack'd active alerts whose `triggers_at` has already arrived.
 */
export function listSurfaceable(): SystemAlert[] {
  const nowISO = new Date().toISOString();
  return readAllAlerts().filter(
    (a) =>
      (a.state === 'active' || (a.state === 'scheduled' && a.triggers_at <= nowISO)) &&
      a.acknowledged_at === null,
  );
}
