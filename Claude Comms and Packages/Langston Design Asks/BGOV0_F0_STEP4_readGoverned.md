# P19 B-GOV-INTEGRITY-0 F0 — Step-4 review packet (CC-B)
## Fix: poller.mjs loadExceptions reads the ledger AT THE GRADED REF, fail-loud (#449 root cause)

**One file changed: scripts/governance-checker/poller.mjs. node --check OK. poller.test.mjs: 64 passed / 0 failed.**

### What changed, and why
- `loadExceptions()` read `join(REPO_ROOT, '1-system-manual', 'GOVERNANCE_EXCEPTIONS.md')` — the WORKING TREE.
  On the checker box that tree is ~2 weeks stale, so it parsed 1 na-skip row while origin had 10.
- Now a helper `readGovernedExceptions()` reads `git show ${BRANCH}:1-system-manual/GOVERNANCE_EXCEPTIONS.md`
  — the SAME ref every other read grades at (checker.mjs:28-29 invariant; docPresent already honours it).
  origin is fetched by gitFetchAndLog() earlier in the same tick, so the ref is current.
- FAIL-LOUD: empty/unreadable ledger THROWS. tick() catches, raises a `critical` `gov-exceptions-unreadable`
  alert, persists, and returns {opened:0,resolved:0,rulebookUnreadable:true} — REFUSES to grade rather than
  grade off an empty rulebook (which would re-open every dispositioned batch — the #449 harm inverted).
- Framing per your note: read AT the ref (`origin/migration/aws-supabase:<path>`), NOT 'read from staging'.

### Acceptance tests (yours to own; both must pass or the root cause is only masked)
1. POSITIVE: a synthetic `na-skip` filed at origin auto-resolves its doc-gap alert within one tick.
2. NEGATIVE (your catch — the decisive one): file the na-skip at ORIGIN, leave the checker box worktree
   WITHOUT it (it already lacks the last ~2 weeks). Correct fix grades it (read at ref); the old
   readFileSync(REPO_ROOT) path silently misses it. The box's stale worktree makes this a live natural test.
3. GOV_SHADOW=1 dry-run on the box: intended-action diff BEFORE any enforcing tick. You review that diff.

### FULL DIFF
```diff
diff --git a/scripts/governance-checker/poller.mjs b/scripts/governance-checker/poller.mjs
index b7395f801..dd6100126 100644
--- a/scripts/governance-checker/poller.mjs
+++ b/scripts/governance-checker/poller.mjs
@@ -307,12 +307,30 @@ const alertSink = {
 };
 function shq(s) { return `'${String(s).replace(/'/g, `'\\''`)}'`; }
 
-// Read declared exceptions from the in-repo ledger (open/umbrella/na).
+// Read the exceptions ledger from the GRADED REF, never the working tree. This is the #449
+// root-cause fix: reading join(REPO_ROOT, …) let a stale checkout honour 1 na-skip row while
+// origin carried 10, so every exception filed after the box's last redeploy was invisible and
+// the checker manufactured a flood of false doc-gap alerts. checker.mjs:28 already declares the
+// invariant — "all reads go through GOV_REF after a fetch, never a stale copy" — and docPresent
+// honours it; loadExceptions was the one place that violated it. origin is fetched by
+// gitFetchAndLog() earlier this tick, so `git show BRANCH:<path>` sees the pushed state.
+// FAIL-LOUD: an unreadable/empty rulebook must THROW, never fall back to an empty exception set —
+// that silent-{} default is the original defect in a new mask (no suppressions ⇒ false-alarm flood,
+// or, if the grader ever trusted it, silent under-enforcement). tick() catches the throw, raises a
+// critical alert, and refuses to grade rather than grade permissively.
+function readGovernedExceptions() {
+  const relPath = '1-system-manual/GOVERNANCE_EXCEPTIONS.md';
+  const raw = execFileSync('git', ['show', `${BRANCH}:${relPath}`],
+    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
+  if (!raw || !raw.trim()) {
+    throw new Error(`governed read of ${relPath} at ${BRANCH} returned empty — refusing to grade with no rulebook (#449 fail-loud)`);
+  }
+  return raw;
+}
+
 function loadExceptions() {
   const open = new Set(), openSince = new Map(), naConfirmed = new Set();
-  const p = join(REPO_ROOT, '1-system-manual', 'GOVERNANCE_EXCEPTIONS.md');
-  if (!existsSync(p)) return { open, openSince, naConfirmed };
-  for (const line of readFileSync(p, 'utf8').split('\n')) {
+  for (const line of readGovernedExceptions().split('\n')) {
     const cells = line.split('|').map((c) => c.trim());
     if (cells.length < 7) continue;
     const [, ts, bid, type, value, confirmedBy] = cells;
@@ -372,7 +390,31 @@ export function tick(nowMs = Date.now()) {
   const enforceable = applyCutoff(batches, ENFORCEMENT_CUTOFF_MS);
   // OBJ-1 (B-GOV-2): read each enforceable batch's declared change-class from its scope header.
   for (const b of enforceable) { const d = readDeclaredClass(b.batchId); b.declaredClass = d.class; b.classDeclared = d.declared; }
-  const exceptions = loadExceptions();
+  // #449 fail-loud: loadExceptions now reads the ledger at the graded ref and THROWS on an empty/
+  // unreadable rulebook. An enforcer that cannot read its suppressions must refuse to grade, not
+  // grade permissively — grading with an empty exception set would re-open every legitimately-
+  // dispositioned batch. Mirror the fetch-fail contract: raise a critical alert, persist, exit the
+  // tick with zero opens/resolves so nothing is mis-graded off a rulebook we could not read.
+  let exceptions;
+  try {
+    exceptions = loadExceptions();
+  } catch (e) {
+    const EXC_KEY = 'gov-exceptions-unreadable';
+    const body = `The governance checker could not read GOVERNANCE_EXCEPTIONS.md at ${BRANCH}: ${String(e.message || e).slice(0, 300)}. ` +
+      `Refusing to grade this tick — grading with no rulebook would re-open every dispositioned batch (#449). No alerts opened or resolved. Investigate the checker's git access to the ref.`;
+    if (!state.openAlerts[EXC_KEY]) {
+      const id = alertSink.add({ dedupeKey: EXC_KEY, severity: 'critical',
+        title: `governance-checker cannot read its rulebook at ${BRANCH} — grading paused`, body }, nowMs);
+      if (id) state.openAlerts[EXC_KEY] = id;
+    }
+    state.lastTick = nowMs; saveState(state);
+    return { opened: 0, resolved: 0, untaggedCode: 0, fetchOk: true, rulebookUnreadable: true };
+  }
+  // rulebook read cleanly — clear any prior unreadable alert.
+  if (state.openAlerts['gov-exceptions-unreadable']) {
+    alertSink.resolve(state.openAlerts['gov-exceptions-unreadable']);
+    delete state.openAlerts['gov-exceptions-unreadable'];
+  }
   const { toOpen, toResolveKeys } = decideAlerts(enforceable, exceptions, nowMs);
   // dedupe via own state (logical key → alert id); only add if not already open.
   for (const a of toOpen) {
```
