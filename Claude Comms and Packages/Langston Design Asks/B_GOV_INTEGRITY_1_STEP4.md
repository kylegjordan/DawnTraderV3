# B-GOV-INTEGRITY-1 — Step-4 review packet

**Author:** OLD Claude (CC-A). **Commits:** `c24599cfa` (OBJ-1/4/2) + `ed2ea6a91` (OBJ-3+tests).
**Base:** `fc8ef05ca`. **Verification:** tsc baseline no regressions; alert unit suite **24/24 green** (9 new + 15 existing) on the C:\dev bench.

## ⚠️ Process note (surfaced, not buried)
`c24599cfa` reached **origin** before this Step-4 — it was carried there by CC-B's B-GOV-INTEGRITY-0 push on the shared HEAD (the exact shared-tree hazard I'd flagged to CC-B). It is **CI-green** (run 29112100315, all 4 jobs) and **NOT deployed**. So Step-4 now happens **before the DEPLOY gate** (the critical one); no un-reviewed code is running. `ed2ea6a91` is still local. If you want changes, I fix forward (new commit), never a shared-history rewrite.

## What to review — the complete batch diff
OBJ-1 resolve provenance (2 trust-level fields + hard evidence gate) · OBJ-4 category SSOT (cast deleted, type derived from const) · OBJ-3 class-driven delivery · OBJ-2 honest backfill (transport=null deviation flagged) · the seam regression guard test.

```diff
diff --git a/scripts/b-gov-integrity-1-backfill-resolve-provenance.ts b/scripts/b-gov-integrity-1-backfill-resolve-provenance.ts
new file mode 100644
index 000000000..3c78dfa6d
--- /dev/null
+++ b/scripts/b-gov-integrity-1-backfill-resolve-provenance.ts
@@ -0,0 +1,136 @@
+/**
+ * B-GOV-INTEGRITY-1 OBJ-2 — one-shot backfill of resolve provenance.
+ * ═════════════════════════════════════════════════════════════════════════════
+ *
+ * WHY: 249 of 249 resolved alerts predate F3b and carry no provenance — no
+ * `resolved_at`, no `resolved_by_claimed`, no `resolution_evidence`. This script
+ * adds an HONEST record to each, and NEVER fabricates one.
+ *
+ * THE ONE RULE (Langston + CC-B, 2026-07-10): do not invent provenance to make a
+ * row look complete. A backfilled row that claimed "resolved 2026-06-14 by X with
+ * evidence Y" would be a forgery with good posture — the exact #447/#455 disease.
+ * So the backfill records only what is actually known and marks the rest unknown:
+ *   - resolved_at            = the row's existing acknowledged_at, else null
+ *                             (a RECONSTRUCTION from ack time, never a minted one)
+ *   - resolved_by_claimed    = the row's existing acknowledged_by (the only
+ *                             identity we actually have; verified present on all 249)
+ *   - resolved_by_transport  = null — the channel was never recorded, and null is
+ *                             the honest value for "unknown". (Deviation from the
+ *                             scope's free-form sentinel: the field is a typed
+ *                             ResolveTransport enum; null is truthful and keeps the
+ *                             enum unpolluted. Flagged to Langston at Step-4.)
+ *   - resolution_evidence    = 'provenance-unknown-pre-F3b' — a SANCTIONED sentinel
+ *                             (RESOLUTION_EVIDENCE_SENTINELS), so a backfilled row
+ *                             passes OBJ-1's own validator on any re-run.
+ *
+ * SAFETY (OBJ-5):
+ *   - idempotent + no-clobber: a row that ALREADY carries any real provenance is
+ *     never touched (zero such rows today; guarded regardless).
+ *   - pre-image sha256 recorded; id-set conserved exactly (a SET diff, not a count
+ *     — #495); reuses the store's own withLock + atomic write (no hand-rolled I/O).
+ *   - ADDS fields only; never drops, re-states, or invalidates a row.
+ *
+ * USAGE:  tsx scripts/b-gov-integrity-1-backfill-resolve-provenance.ts [--apply]
+ *   default = DRY RUN (reports what it would do, writes nothing).
+ *   --apply = perform the migration under lock.
+ */
+import * as fs from 'node:fs';
+import * as crypto from 'node:crypto';
+import {
+  ALERTS_FILE,
+  readAllAlerts,
+  type SystemAlert,
+} from '../server/services/system-alerts.js';
+
+const BACKFILL_EVIDENCE = 'provenance-unknown-pre-F3b';
+
+function hasAnyProvenance(a: SystemAlert): boolean {
+  return (
+    a.resolved_at != null ||
+    a.resolved_by_claimed != null ||
+    a.resolved_by_transport != null ||
+    a.resolution_evidence != null
+  );
+}
+
+async function main(): Promise<void> {
+  const apply = process.argv.includes('--apply');
+
+  if (!fs.existsSync(ALERTS_FILE)) {
+    console.error(`[backfill] alerts file not found: ${ALERTS_FILE}`);
+    process.exit(1);
+  }
+  const preBytes = fs.readFileSync(ALERTS_FILE);
+  const preHash = crypto.createHash('sha256').update(preBytes).digest('hex');
+
+  const before = readAllAlerts();
+  const beforeIds = new Set(before.map((a) => a.id));
+
+  const resolved = before.filter((a) => a.state === 'resolved');
+  const targets = resolved.filter((a) => !hasAnyProvenance(a));
+  const alreadyHasProvenance = resolved.length - targets.length;
+  const missingAckIdentity = targets.filter((a) => !a.acknowledged_by).map((a) => a.id);
+
+  console.log('─── B-GOV-INTEGRITY-1 OBJ-2 backfill ' + (apply ? '(APPLY)' : '(DRY RUN)') + ' ───');
+  console.log(`  file            : ${ALERTS_FILE}`);
+  console.log(`  pre sha256      : ${preHash}`);
+  console.log(`  distinct alerts : ${before.length}`);
+  console.log(`  resolved        : ${resolved.length}`);
+  console.log(`  to backfill     : ${targets.length}`);
+  console.log(`  already has prov: ${alreadyHasProvenance} (skipped — no-clobber)`);
+  if (missingAckIdentity.length > 0) {
+    // Honest handling: if a resolved row somehow has no acknowledged_by, we still
+    // do not invent an identity — resolved_by_claimed stays null for it.
+    console.warn(`  ⚠ ${missingAckIdentity.length} target(s) have no acknowledged_by; resolved_by_claimed will be null (not invented): ${missingAckIdentity.join(', ')}`);
+  }
+
+  if (targets.length === 0) {
+    console.log('  nothing to do — every resolved row already carries provenance. (idempotent)');
+    return;
+  }
+
+  if (!apply) {
+    console.log('  DRY RUN — no write. Re-run with --apply to perform the migration.');
+    return;
+  }
+
+  // Perform under the store's OWN lock + atomic write. We re-read inside the lock
+  // (the value captured above may be stale by write time) and re-derive targets,
+  // so a concurrent writer cannot be clobbered.
+  const svc = await import('../server/services/system-alerts.js');
+  // withLock + writeAllAlertsAtomic are module-internal; expose the migration
+  // through a dedicated exported helper to keep the lock discipline in one place.
+  const result = await svc.__backfillResolveProvenance__({
+    evidence: BACKFILL_EVIDENCE,
+  });
+
+  const afterBytes = fs.readFileSync(ALERTS_FILE);
+  const afterHash = crypto.createHash('sha256').update(afterBytes).digest('hex');
+  const after = readAllAlerts();
+  const afterIds = new Set(after.map((a) => a.id));
+
+  const lost = [...beforeIds].filter((id) => !afterIds.has(id));
+  const gained = [...afterIds].filter((id) => !beforeIds.has(id));
+
+  console.log('─── result ───');
+  console.log(`  rows backfilled : ${result.backfilled}`);
+  console.log(`  post sha256     : ${afterHash}`);
+  console.log(`  id-set conserved: ${lost.length === 0 && gained.length === 0} (lost=${JSON.stringify(lost)} gained=${JSON.stringify(gained)})`);
+  console.log(`  count before/after: ${before.length} / ${after.length}`);
+  if (lost.length !== 0 || gained.length !== 0) {
+    console.error('  ✗ CONSERVATION FAILED — id set changed. Investigate before trusting this run.');
+    process.exit(1);
+  }
+  // Verify every backfilled row now passes OBJ-1's validator (no self-contradiction).
+  const stillInvalid = after.filter(
+    (a) => a.state === 'resolved' && a.resolution_evidence != null &&
+      !svc.isValidResolutionEvidence(a.resolution_evidence),
+  );
+  console.log(`  all resolved evidence passes OBJ-1 gate: ${stillInvalid.length === 0} (${stillInvalid.length} fail)`);
+  if (stillInvalid.length !== 0) process.exit(1);
+}
+
+main().catch((err) => {
+  console.error('[backfill] fatal:', err);
+  process.exit(1);
+});
diff --git a/scripts/system-alerts.ts b/scripts/system-alerts.ts
index b2157c85c..c551845d6 100644
--- a/scripts/system-alerts.ts
+++ b/scripts/system-alerts.ts
@@ -42,9 +42,9 @@ import {
   ackAlert,
   resolveAlert,
   processResurface,
+  shouldDeliverToDiscord,
   ALERTS_FILE,
   type SystemAlert,
-  type AlertCategory,
   type AlertSeverity,
   type AlertState,
   type ResurfaceDecision,
@@ -132,10 +132,13 @@ async function pushToDiscord(alert: SystemAlert): Promise<boolean> {
     // Inert until Kyle provisions the alerts webhook — no Discord posting yet.
     return false;
   }
-  // Severity gating (carried from the B-NEW-43 #135 routing): warning + critical post; info skips.
-  if (alert.severity === 'warning' || alert.severity === 'critical') {
+  // B-GOV-INTEGRITY-1 OBJ-3: delivery is CLASS-driven, not severity-only. An info
+  // alert whose category must-never-be-silent (governance, breakage) now delivers;
+  // routine info still skips. Replaces the old inline warning/critical-only gate
+  // (B-NEW-43 #135) that silenced 117 info alerts including governance gaps.
+  if (shouldDeliverToDiscord(alert)) {
     const ok = await discordWebhookSend(webhookUrl, formatAlertTextDiscord(alert));
-    if (ok) console.log(`[fire-due] Discord alert posted for ${alert.id}`);
+    if (ok) console.log(`[fire-due] Discord alert posted for ${alert.id} (${alert.severity}/${alert.category})`);
     return ok;
   }
   return false;
@@ -166,7 +169,11 @@ function frameResurface(alert: SystemAlert, d: ResurfaceDecision, nowMs: number)
 
 async function cmdAdd(args: string[]): Promise<void> {
   const triggers_at = requireFlag(args, 'triggers-at');
-  const category = requireFlag(args, 'category') as AlertCategory;
+  // B-GOV-INTEGRITY-1 OBJ-4: the `as AlertCategory` cast is DELETED — it was the
+  // hole that let 13 category strings into a 6-member type. Pass the raw string;
+  // addAlert() validates it against the creatable SSOT and throws on an off-set
+  // value, so a typo fails loudly here instead of vanishing from every consumer.
+  const category = requireFlag(args, 'category');
   const severity = requireFlag(args, 'severity') as AlertSeverity;
   const title = requireFlag(args, 'title');
   const body = requireFlag(args, 'body');
@@ -227,7 +234,9 @@ async function cmdFireDue(): Promise<void> {
 
 async function cmdList(args: string[]): Promise<void> {
   const state = getFlag(args, 'state') as AlertState | undefined;
-  const category = getFlag(args, 'category') as AlertCategory | undefined;
+  // OBJ-4: no `as AlertCategory` cast — listAlerts accepts a raw string filter so
+  // grandfathered/historical categories remain filterable.
+  const category = getFlag(args, 'category');
   const entries = listAlerts({ state, category });
   if (entries.length === 0) {
     console.log('(no alerts)');
@@ -259,11 +268,22 @@ async function cmdAck(args: string[]): Promise<void> {
 async function cmdResolve(args: string[]): Promise<void> {
   const id = args[1];
   if (!id || id.startsWith('--')) {
-    console.error('Usage: resolve <id> --by <user>');
+    console.error('Usage: resolve <id> --by <user> --evidence <reference-or-sentinel>');
     process.exit(1);
   }
   const by = requireFlag(args, 'by');
-  const updated = await resolveAlert(id, by);
+  // B-GOV-INTEGRITY-1 (F3b): closure must record WHY it is legitimate. --evidence
+  // is REQUIRED and hard-gated (a reference token or a sanctioned sentinel); there
+  // is no default and no empty. transport is 'cli' — stamped here, never a flag,
+  // so the caller cannot forge the verifiable half of the provenance.
+  const evidence = requireFlag(args, 'evidence');
+  let updated: Awaited<ReturnType<typeof resolveAlert>>;
+  try {
+    updated = await resolveAlert(id, by, evidence, 'cli');
+  } catch (err) {
+    console.error(String(err instanceof Error ? err.message : err));
+    process.exit(1);
+  }
   if (!updated) {
     console.error(`Alert ${id} not found`);
     process.exit(1);
diff --git a/server/routes.ts b/server/routes.ts
index 21ebeac32..122d7a7f7 100644
--- a/server/routes.ts
+++ b/server/routes.ts
@@ -6621,20 +6621,26 @@ export async function registerRoutes(app: Express): Promise<{ httpServer: Server
 
   apiRouter.get('/system-alerts', authenticateToken, async (req: AuthenticatedRequest, res) => {
     try {
-      const { listAlerts, listSurfaceable } = await import('./services/system-alerts.js');
-      // Narrow query strings to the union types accepted by listAlerts; reject
-      // unknown values (silently → undefined → no filter) rather than casting.
+      const { listAlerts, listSurfaceable, ALERT_CATEGORIES, GRANDFATHERED_ALERT_CATEGORIES } =
+        await import('./services/system-alerts.js');
+      // Narrow query strings to values that can actually appear in stored rows;
+      // reject unknown values (silently → undefined → no filter) rather than
+      // casting. B-GOV-INTEGRITY-1 OBJ-4: the category set is now the SSOT
+      // (creatable ∪ grandfathered) imported from the service — NOT a
+      // hand-maintained literal, which had silently omitted 'governance' (181
+      // rows / 71% of the store were unfilterable).
       const STATES = new Set(['scheduled', 'active', 'acknowledged', 'resolved'] as const);
-      const CATEGORIES = new Set([
-        'soak_verification', 'health_check', 'breakage', 'one_off', 'recurring',
-      ] as const);
+      const FILTERABLE_CATEGORIES = new Set<string>([
+        ...ALERT_CATEGORIES,
+        ...GRANDFATHERED_ALERT_CATEGORIES,
+      ]);
       const stateRaw = typeof req.query.state === 'string' ? req.query.state : undefined;
       const categoryRaw = typeof req.query.category === 'string' ? req.query.category : undefined;
       const state = stateRaw && (STATES as Set<string>).has(stateRaw)
         ? (stateRaw as 'scheduled' | 'active' | 'acknowledged' | 'resolved')
         : undefined;
-      const category = categoryRaw && (CATEGORIES as Set<string>).has(categoryRaw)
-        ? (categoryRaw as 'soak_verification' | 'health_check' | 'breakage' | 'one_off' | 'recurring')
+      const category = categoryRaw && FILTERABLE_CATEGORIES.has(categoryRaw)
+        ? categoryRaw
         : undefined;
 
       // Default response includes BOTH surfaceable-now AND scheduled-future entries
diff --git a/server/services/system-alerts.ts b/server/services/system-alerts.ts
index 41a439093..a4da2ebd2 100644
--- a/server/services/system-alerts.ts
+++ b/server/services/system-alerts.ts
@@ -43,15 +43,131 @@ const LOCK_RETRY_DELAY_MS = 100;
 const LOCK_STALE_AFTER_MS = 30_000; // 30s — if lock is older than this, assume crashed holder and force-acquire
 
 export type AlertState = 'scheduled' | 'active' | 'acknowledged' | 'resolved';
-export type AlertCategory =
-  | 'soak_verification'
-  | 'health_check'
-  | 'breakage'
-  | 'one_off'
-  | 'recurring'
-  | 'governance'; // B-GOV governance-checker: missing/thin/hollow doc-set gaps
+
+// ─── B-GOV-INTEGRITY-1 (OBJ-4, 2026-07-10): category is a SINGLE SOURCE ───────
+//
+// The runtime SSOT and the compile-time type are now the SAME thing — the type
+// is DERIVED from this const. Before this batch the type declared 6 members
+// while the live data held 13, because a `as AlertCategory` cast in the CLI
+// admitted anything: a validator beside a still-present cast is a second lock on
+// a door whose first lock is broken (Langston). The cast is deleted; every new
+// alert's category is validated against ALERT_CATEGORIES at addAlert().
+//
+// Membership decided by Langston 2026-07-10 (Step-2): categories with a real
+// forward consumer. `health_check` stays (2 live writers at the ref:
+// database-monitor + b-storage-archival-health; a 3rd pending #441). `recurring`
+// dropped (zero writers). Everything else is GRANDFATHERED — accepted on read
+// for historical rows, never creatable anew.
+export const ALERT_CATEGORIES = [
+  'governance',          // B-GOV governance-checker: missing/thin/hollow doc-set gaps
+  'breakage',
+  'soak_verification',
+  'one_off',
+  'verification',
+  'reminder',
+  'health_check',        // disk / archival-cron-silence / freshness system health
+] as const;
+export type AlertCategory = typeof ALERT_CATEGORIES[number];
+
+// Historical categories present in stored rows but NOT creatable going forward.
+// Kept ONLY so validation of existing data does not reject its own history —
+// addAlert() refuses these; readers accept them. (Never rewrite stored rows.)
+export const GRANDFATHERED_ALERT_CATEGORIES = [
+  'test',
+  'reorg_b2_1_window',
+  'b46b_soak_analysis',
+  'comms_decommission',
+  'weekend_restart_verification',
+  'scheduled_verification',
+  'tec_selfheal_verify',
+  'health_check', // also creatable; listed for reader-completeness
+  'recurring',    // dropped from creatable set this batch
+] as const;
+
+/**
+ * OBJ-4 gate: a NEW alert's category must be in the creatable SSOT. Rejects
+ * loudly — a typo or an off-taxonomy string can no longer slip in via a cast and
+ * then vanish from every consumer keyed on the real set. Returns the value
+ * narrowed to AlertCategory so call sites need no cast.
+ */
+export function assertCategoryCreatable(c: string): AlertCategory {
+  if ((ALERT_CATEGORIES as readonly string[]).includes(c)) return c as AlertCategory;
+  throw new Error(
+    `addAlert: category ${JSON.stringify(c)} is not creatable. ` +
+    `Allowed: ${ALERT_CATEGORIES.join(' | ')}. ` +
+    `(Grandfathered-historical categories are accepted on read but cannot be created.)`,
+  );
+}
+
 export type AlertSeverity = 'info' | 'warning' | 'critical';
 
+// ─── B-GOV-INTEGRITY-1 (OBJ-3, 2026-07-10): class-driven delivery ────────────
+//
+// Delivery was severity-only: warning+critical post, info skips — so 117 of 254
+// alerts (info) never reached Discord, INCLUDING info-severity `governance`
+// alerts (a governance gap that pages nobody is the whole problem this program
+// exists to fix). Delivery is now CLASS-driven: a category that must never be
+// silent delivers at ANY severity; everything else keeps the severity gate (a
+// routine info health check still need not page). Categories, not severities,
+// decide whether an alert can be silent.
+export const ALWAYS_DELIVER_CATEGORIES = new Set<string>([
+  'governance', // a doc-set gap must never be silent (Langston, Step-2)
+  'breakage',   // a break must never be silent regardless of how it was filed
+]);
+
+/**
+ * OBJ-3 delivery gate. Returns true iff this alert should be pushed to the
+ * Discord alerts sink. Warning/critical always deliver (unchanged); an info
+ * alert delivers only if its category must-never-be-silent.
+ */
+export function shouldDeliverToDiscord(alert: Pick<SystemAlert, 'severity' | 'category'>): boolean {
+  if (alert.severity === 'warning' || alert.severity === 'critical') return true;
+  return ALWAYS_DELIVER_CATEGORIES.has(alert.category);
+}
+
+// ─── B-GOV-INTEGRITY-1 (F3b, 2026-07-10): resolve provenance primitives ──────
+//
+// `resolved_by_transport` is the channel a resolve arrived through. It is the
+// VERIFIABLE half of the who-resolved-this question — stamped by the code path,
+// NEVER passed by the caller (a caller-supplied transport is just a second
+// claim, which collapses the two-field trust distinction). Each call site hands
+// resolveAlert() its own literal; there is no `--transport` flag.
+export type ResolveTransport = 'cli' | 'dispatcher' | 'api' | 'governance-checker';
+
+// Sanctioned sentinels: the ONLY non-reference strings resolution_evidence may
+// hold. `NO-EVIDENCE-GIVEN` forces an HONEST admission (better than a fake
+// reference); `provenance-unknown-pre-F3b` is the audited backfill marker (OBJ-2)
+// — enumerated here so a backfilled row does not fail this very validator on a
+// re-run. Two sanctioned literals in ONE set, not two free strings that happen
+// to differ (a set, not a count).
+export const RESOLUTION_EVIDENCE_SENTINELS = [
+  'NO-EVIDENCE-GIVEN',
+  'provenance-unknown-pre-F3b',
+] as const;
+export type ResolutionEvidenceSentinel = typeof RESOLUTION_EVIDENCE_SENTINELS[number];
+
+/**
+ * Hard gate for `resolution_evidence` (B-GOV-INTEGRITY-1 OBJ-1, Langston Q2).
+ * A non-empty check is NOT enough — it passes "looks fine", which is the exact
+ * texture of the 249 empty closes with a word added. Evidence must EITHER be a
+ * sanctioned sentinel OR carry a re-derivable reference token:
+ *   - a path:line          (server/foo.ts:42)
+ *   - a git sha            (7–40 hex)
+ *   - a uuid               (alert id / run id)
+ *   - a doc section ref    (§3.2, #440)
+ */
+export function isValidResolutionEvidence(s: unknown): s is string {
+  if (typeof s !== 'string') return false;
+  const t = s.trim();
+  if ((RESOLUTION_EVIDENCE_SENTINELS as readonly string[]).includes(t)) return true;
+  return (
+    /[\w./-]+:\d+/.test(t) ||                                   // path:line
+    /\b[0-9a-f]{7,40}\b/i.test(t) ||                            // git sha (7–40 hex)
+    /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(t) || // uuid
+    /[§#]\s*[\w.\-]+/.test(t)                                   // doc section / issue ref
+  );
+}
+
 export interface SystemAlert {
   schema_version: 1;
   id: string;                                      // uuid
@@ -60,6 +176,13 @@ export interface SystemAlert {
   fired_at: string | null;                         // ISO-8601 — when dispatcher promoted scheduled → active
   acknowledged_at: string | null;                  // ISO-8601
   acknowledged_by: string | null;                  // 'kyle' | 'cc-session-...' | 'langston' | 'system' | etc.
+  // ─── B-GOV-INTEGRITY-1 (F3b, 2026-07-10): resolve provenance ──────────────
+  // Closure must be a RECORD, not an assertion. Two identity fields at DIFFERENT
+  // trust levels — never merge them, or a claim launders into a fact:
+  resolved_at: string | null;                      // ISO-8601 — when state → resolved
+  resolved_by_claimed: string | null;              // what the CALLER passed (`--by`) — a CLAIM
+  resolved_by_transport: ResolveTransport | null;  // the channel the resolve arrived through — CODE-DERIVED, never caller-supplied
+  resolution_evidence: string | null;              // WHY the close is legitimate: a re-derivable reference token OR a sanctioned sentinel (validated, never free text)
   state: AlertState;
   category: AlertCategory;
   severity: AlertSeverity;
@@ -198,7 +321,11 @@ function writeAllAlertsAtomic(alerts: SystemAlert[]): void {
 
 export interface AddAlertOptions {
   triggers_at: string | Date;
-  category: AlertCategory;
+  // Accepts a raw string so the CLI can pass unvalidated input WITHOUT a cast
+  // (OBJ-4); addAlert() validates it via assertCategoryCreatable and throws on
+  // an off-SSOT value. Internal typed callers passing an AlertCategory literal
+  // remain assignable.
+  category: AlertCategory | string;
   severity: AlertSeverity;
   title: string;
   body: string;
@@ -230,8 +357,13 @@ export async function addAlert(opts: AddAlertOptions): Promise<SystemAlert> {
     fired_at: null,
     acknowledged_at: null,
     acknowledged_by: null,
+    resolved_at: null,
+    resolved_by_claimed: null,
+    resolved_by_transport: null,
+    resolution_evidence: null,
     state: 'scheduled',
-    category: opts.category,
+    category: assertCategoryCreatable(opts.category), // OBJ-4: reject off-SSOT categories at creation
+
     severity: opts.severity,
     title: opts.title,
     body: opts.body,
@@ -319,16 +451,37 @@ export async function ackAlert(id: string, by: string): Promise<SystemAlert | nu
  * Mark an alert as resolved (terminal state — kept for history but won't
  * surface). Use when the underlying condition is fully closed.
  */
-export async function resolveAlert(id: string, by: string): Promise<SystemAlert | null> {
+export async function resolveAlert(
+  id: string,
+  by: string,
+  evidence: string,
+  transport: ResolveTransport,
+): Promise<SystemAlert | null> {
+  // B-GOV-INTEGRITY-1 (F3b): closure is a RECORD, not a state flag. The hard
+  // evidence gate is enforced HERE (not only in the CLI) so EVERY resolve path —
+  // CLI, dispatcher, API, governance-checker — is bound by it. A close with no
+  // legitimate basis is refused, loudly, before any write.
+  if (!isValidResolutionEvidence(evidence)) {
+    throw new Error(
+      `resolveAlert(${id}): resolution_evidence rejected — must be a reference token ` +
+      `(path:line | sha | uuid | §/#ref) or a sanctioned sentinel ` +
+      `(${RESOLUTION_EVIDENCE_SENTINELS.join(' | ')}). Got: ${JSON.stringify(evidence)}`,
+    );
+  }
   ensureFileExists();
   let result: SystemAlert | null = null;
   await withLock(() => {
     const all = readAllAlerts();
     const found = all.find((a) => a.id === id);
     if (!found) return;
+    const now = new Date().toISOString();
     found.state = 'resolved';
+    found.resolved_at = now;
+    found.resolved_by_claimed = by;          // the caller's claim
+    found.resolved_by_transport = transport; // the code-stamped, verifiable channel
+    found.resolution_evidence = evidence.trim();
     if (!found.acknowledged_at) {
-      found.acknowledged_at = new Date().toISOString();
+      found.acknowledged_at = now;
       found.acknowledged_by = by;
     }
     result = { ...found };
@@ -337,6 +490,43 @@ export async function resolveAlert(id: string, by: string): Promise<SystemAlert
   return result;
 }
 
+/**
+ * B-GOV-INTEGRITY-1 OBJ-2 — one-shot backfill of resolve provenance onto the
+ * historical resolved rows that predate F3b. Kept HERE (not in the migration
+ * script) so the lock + atomic-write discipline lives in one place. Called only
+ * by `scripts/b-gov-integrity-1-backfill-resolve-provenance.ts`.
+ *
+ * HONEST-ONLY: adds `resolution_evidence` (a sanctioned sentinel) + a
+ * reconstructed `resolved_at` (from acknowledged_at, else null) + the existing
+ * `acknowledged_by` as the claimed identity. Transport stays NULL — the channel
+ * was never recorded and null is the truthful "unknown" (a typed enum has no
+ * honest slot for a backfill marker). Idempotent + no-clobber: any row already
+ * carrying provenance is left untouched.
+ */
+export async function __backfillResolveProvenance__(
+  opts: { evidence: ResolutionEvidenceSentinel },
+): Promise<{ backfilled: number }> {
+  ensureFileExists();
+  let backfilled = 0;
+  await withLock(() => {
+    const all = readAllAlerts();
+    for (const a of all) {
+      if (a.state !== 'resolved') continue;
+      const hasProvenance =
+        a.resolved_at != null || a.resolved_by_claimed != null ||
+        a.resolved_by_transport != null || a.resolution_evidence != null;
+      if (hasProvenance) continue; // no-clobber
+      a.resolved_at = a.acknowledged_at ?? null;      // reconstruction, never minted
+      a.resolved_by_claimed = a.acknowledged_by ?? null; // the only identity we have
+      a.resolved_by_transport = null;                  // honest unknown
+      a.resolution_evidence = opts.evidence;           // sanctioned sentinel
+      backfilled++;
+    }
+    if (backfilled > 0) writeAllAlertsAtomic(all);
+  });
+  return { backfilled };
+}
+
 // ─── B-ALERT-PROTOCOL (#340): no-silent-drop stale-alert re-surface ─────────
 //
 // The closure guarantee: a diagnosed-but-unresolved alert must never rot. This
@@ -463,7 +653,9 @@ export async function processResurface(
 
 export interface ListAlertsOptions {
   state?: AlertState;
-  category?: AlertCategory;
+  // A filter, not a creation — accepts any category that can appear in stored
+  // rows, INCLUDING grandfathered ones, so historical data is filterable.
+  category?: AlertCategory | string;
 }
 
 export function listAlerts(opts: ListAlertsOptions = {}): SystemAlert[] {
diff --git a/server/tests/unit/system-alerts-dedup.test.ts b/server/tests/unit/system-alerts-dedup.test.ts
index 699c6bbf8..9a87fffc3 100644
--- a/server/tests/unit/system-alerts-dedup.test.ts
+++ b/server/tests/unit/system-alerts-dedup.test.ts
@@ -51,7 +51,7 @@ describe('B-NEW-51 system-alerts dedup', () => {
   it('allows a new alert once the same-key alert is resolved', async () => {
     const { addAlert, resolveAlert, readAllAlerts } = await load();
     const a = await addAlert({ ...base, dedupe_key: 'k2' });
-    await resolveAlert(a.id, 'test');
+    await resolveAlert(a.id, 'test', 'NO-EVIDENCE-GIVEN', 'cli');
     const c = await addAlert({ ...base, dedupe_key: 'k2' });
     expect(c.id).not.toBe(a.id);            // fresh alert created
     expect(readAllAlerts()).toHaveLength(2); // resolved + new
diff --git a/server/tests/unit/system-alerts-gov-integrity-1.test.ts b/server/tests/unit/system-alerts-gov-integrity-1.test.ts
new file mode 100644
index 000000000..ac2c408c7
--- /dev/null
+++ b/server/tests/unit/system-alerts-gov-integrity-1.test.ts
@@ -0,0 +1,148 @@
+/**
+ * B-GOV-INTEGRITY-1 — unit tests for resolve provenance (OBJ-1), category SSOT
+ * (OBJ-4), class-driven delivery (OBJ-3), and the Layer-A/Layer-B evidence seam.
+ */
+import { describe, it, expect, beforeEach, afterEach } from 'vitest';
+import * as fs from 'node:fs';
+import * as os from 'node:os';
+import * as path from 'node:path';
+
+// Point the store at a throwaway file BEFORE importing the module.
+const tmpFile = path.join(os.tmpdir(), `gi1-alerts-${process.pid}-${Math.random().toString(36).slice(2)}.jsonl`);
+process.env.SYSTEM_ALERTS_FILE = tmpFile;
+
+const load = () => import('../../services/system-alerts.js');
+
+afterEach(() => {
+  for (const f of [tmpFile, `${tmpFile}.lock`]) {
+    try { fs.unlinkSync(f); } catch { /* ignore */ }
+  }
+});
+
+describe('OBJ-1 — resolution_evidence hard gate', () => {
+  it('accepts reference tokens and sanctioned sentinels', async () => {
+    const { isValidResolutionEvidence } = await load();
+    // reference-shaped
+    expect(isValidResolutionEvidence('server/foo.ts:42')).toBe(true);
+    expect(isValidResolutionEvidence('4b46bec')).toBe(true);              // short sha
+    expect(isValidResolutionEvidence('4b46bec570e1a2b3c4d5e6f7089a1b2c3d4e5f60')).toBe(true); // full sha
+    expect(isValidResolutionEvidence('550e8400-e29b-41d4-a716-446655440000')).toBe(true); // uuid
+    expect(isValidResolutionEvidence('SYSTEM_MANUAL.md §3.2')).toBe(true);
+    expect(isValidResolutionEvidence('RUNNING_ISSUES #447')).toBe(true);
+    // sentinels
+    expect(isValidResolutionEvidence('NO-EVIDENCE-GIVEN')).toBe(true);
+    expect(isValidResolutionEvidence('provenance-unknown-pre-F3b')).toBe(true);
+  });
+
+  it('REJECTS the texture of an empty close with a word added', async () => {
+    const { isValidResolutionEvidence } = await load();
+    for (const bad of ['', '   ', 'looks fine', 'verified', 'done', 'resolved', 'ok']) {
+      expect(isValidResolutionEvidence(bad)).toBe(false);
+    }
+  });
+
+  it('resolveAlert throws on invalid evidence and writes nothing', async () => {
+    const { addAlert, resolveAlert, readAllAlerts } = await load();
+    const a = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 't', body: 'b' });
+    await expect(resolveAlert(a.id, 'CC-A', 'looks fine', 'cli')).rejects.toThrow(/resolution_evidence rejected/);
+    expect(readAllAlerts().find((x) => x.id === a.id)!.state).not.toBe('resolved');
+  });
+
+  it('resolveAlert records all four provenance fields on a valid close', async () => {
+    const { addAlert, resolveAlert } = await load();
+    const a = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 't', body: 'b' });
+    const r = await resolveAlert(a.id, 'CC-A', 'server/x.ts:10', 'cli');
+    expect(r!.state).toBe('resolved');
+    expect(r!.resolved_at).not.toBeNull();
+    expect(r!.resolved_by_claimed).toBe('CC-A');
+    expect(r!.resolved_by_transport).toBe('cli');
+    expect(r!.resolution_evidence).toBe('server/x.ts:10');
+  });
+});
+
+describe('OBJ-4 — category SSOT (cast deleted)', () => {
+  it('assertCategoryCreatable accepts the 7 canonical categories', async () => {
+    const { assertCategoryCreatable, ALERT_CATEGORIES } = await load();
+    for (const c of ALERT_CATEGORIES) expect(assertCategoryCreatable(c)).toBe(c);
+    expect(ALERT_CATEGORIES).toContain('governance');
+    expect(ALERT_CATEGORIES).toContain('health_check');
+    expect(ALERT_CATEGORIES).not.toContain('recurring'); // dropped, 0 writers
+  });
+
+  it('addAlert throws on an off-SSOT category (the hole the cast left open)', async () => {
+    const { addAlert } = await load();
+    await expect(
+      addAlert({ triggers_at: new Date(), category: 'reorg_b2_1_window', severity: 'info', title: 't', body: 'b' }),
+    ).rejects.toThrow(/not creatable/);
+    // a plain typo too
+    await expect(
+      addAlert({ triggers_at: new Date(), category: 'governnace', severity: 'info', title: 't', body: 'b' }),
+    ).rejects.toThrow(/not creatable/);
+  });
+});
+
+describe('OBJ-3 — class-driven delivery', () => {
+  it('warning/critical always deliver; info delivers only for must-never-be-silent categories', async () => {
+    const { shouldDeliverToDiscord } = await load();
+    // severity path (unchanged)
+    expect(shouldDeliverToDiscord({ severity: 'critical', category: 'health_check' })).toBe(true);
+    expect(shouldDeliverToDiscord({ severity: 'warning', category: 'one_off' })).toBe(true);
+    // the fix: info governance/breakage now deliver
+    expect(shouldDeliverToDiscord({ severity: 'info', category: 'governance' })).toBe(true);
+    expect(shouldDeliverToDiscord({ severity: 'info', category: 'breakage' })).toBe(true);
+    // routine info still skips
+    expect(shouldDeliverToDiscord({ severity: 'info', category: 'health_check' })).toBe(false);
+    expect(shouldDeliverToDiscord({ severity: 'info', category: 'reminder' })).toBe(false);
+  });
+});
+
+describe('Layer-A / Layer-B evidence SEAM (regression guard)', () => {
+  it('the governance-checker graded-ref sha passes the Layer-A gate', async () => {
+    const { isValidResolutionEvidence } = await load();
+    // Exactly what scripts/governance-checker/poller.mjs emits as --evidence:
+    expect(isValidResolutionEvidence('4b46bec570e1a2b3c4d5e6f7089a1b2c3d4e5f60')).toBe(true);
+    // and its honest fetch-fail fallback:
+    expect(isValidResolutionEvidence('NO-EVIDENCE-GIVEN')).toBe(true);
+  });
+});
+
+describe('OBJ-2 — backfill is honest, idempotent, no-clobber', () => {
+  it('backfills only provenance-less resolved rows and never touches others', async () => {
+    const svc = await load();
+    const { addAlert, resolveAlert, readAllAlerts, __backfillResolveProvenance__ } = svc;
+
+    // A: a pre-F3b-style resolved row with NO provenance (simulate by resolving
+    // then stripping the fields, as the historical data has them).
+    const a = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 'A', body: 'b' });
+    // B: a resolved row that already carries real provenance (must be untouched).
+    const b = await addAlert({ triggers_at: new Date(), category: 'breakage', severity: 'warning', title: 'B', body: 'b' });
+    await resolveAlert(b.id, 'CC-A', 'server/real.ts:1', 'cli');
+
+    // Manually author A as a historical resolved row (ack present, no resolved_* fields).
+    const all = readAllAlerts();
+    const rowA = all.find((x) => x.id === a.id)!;
+    rowA.state = 'resolved';
+    rowA.acknowledged_at = '2026-06-01T00:00:00.000Z';
+    rowA.acknowledged_by = 'kyle';
+    rowA.resolved_at = null; rowA.resolved_by_claimed = null;
+    rowA.resolved_by_transport = null; rowA.resolution_evidence = null;
+    fs.writeFileSync(tmpFile, all.map((x) => JSON.stringify(x)).join('\n') + '\n');
+
+    const first = await __backfillResolveProvenance__({ evidence: 'provenance-unknown-pre-F3b' });
+    expect(first.backfilled).toBe(1); // only A
+
+    const after = await load().then((m) => m.readAllAlerts());
+    const A2 = after.find((x) => x.id === a.id)!;
+    expect(A2.resolution_evidence).toBe('provenance-unknown-pre-F3b');
+    expect(A2.resolved_by_claimed).toBe('kyle');            // the only identity we had
+    expect(A2.resolved_at).toBe('2026-06-01T00:00:00.000Z'); // reconstructed, not minted
+    expect(A2.resolved_by_transport).toBeNull();             // honest unknown
+
+    const B2 = after.find((x) => x.id === b.id)!;
+    expect(B2.resolution_evidence).toBe('server/real.ts:1'); // NOT clobbered
+
+    // idempotent: a second run backfills nothing
+    const second = await __backfillResolveProvenance__({ evidence: 'provenance-unknown-pre-F3b' });
+    expect(second.backfilled).toBe(0);
+  });
+});
diff --git a/server/tests/unit/system-alerts-resurface.test.ts b/server/tests/unit/system-alerts-resurface.test.ts
index baa16d66e..3bf3b4674 100644
--- a/server/tests/unit/system-alerts-resurface.test.ts
+++ b/server/tests/unit/system-alerts-resurface.test.ts
@@ -145,7 +145,7 @@ describe('B-ALERT-PROTOCOL processResurface (delivery-gated back-off — the Ste
     const r = await mod.processResurface(NOW, async (alert: any) => {
       delivered.push(alert.id);
       // simulate a CC resolving the OTHER alert while the first one is being delivered
-      if (delivered.length === 1) await mod.resolveAlert(a2.id, 'CC-A');
+      if (delivered.length === 1) await mod.resolveAlert(a2.id, 'CC-A', 'NO-EVIDENCE-GIVEN', 'cli');
       return true;
     });
     expect(delivered).toEqual([a1.id]);                      // a2 never delivered (re-read caught the resolve)
@@ -164,7 +164,7 @@ describe('B-ALERT-PROTOCOL markResurfaced', () => {
     expect(typeof m1?.metadata.last_resurfaced_at).toBe('string');
     const m2 = await markResurfaced(a.id, NOW);
     expect(m2?.metadata.resurface_count).toBe(2);
-    await resolveAlert(a.id, 'CC-A');
+    await resolveAlert(a.id, 'CC-A', 'NO-EVIDENCE-GIVEN', 'cli');
     expect(await markResurfaced(a.id, NOW)).toBeNull(); // resolved → not re-stamped
   });
 });
```
