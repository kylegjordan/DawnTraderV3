# B-GOV-INTEGRITY-0 F9 (partial) — Step-4: checker code-drift canary (#490 recurrence guard)

**One file: scripts/governance-checker/poller.mjs. Adds checkerCodeDrift() + a per-tick check.**
node --check OK. poller.test.mjs: 64 passed / 0 failed.

## What & why
- #449 recurred once because the checker box silently fell 388 commits behind and nobody noticed.
- New checkerCodeDrift() compares HEAD:scripts/governance-checker vs ${BRANCH}:scripts/governance-checker.
  Scoped to the CHECKER'S OWN CODE SUBTREE (your #490 predicate) — NOT the repo — so a doc push never trips it.
- On drift: raise a WARNING gov-code-drift alert (redeploy the box). On no-drift: auto-resolve it. rev-parse
  failure is treated as NOT drift (no false alarm).

## Acceptance tests
1. Box current (HEAD==origin subtree): NO drift alert. (verified: drift('HEAD')=false)
2. Forced drift (run with GOV_BRANCH=<older-checker-ref>): drift alert fires. (verified: drift('97b56f56c')=true)
3. Live on box: after deploy, current state = no alarm; then GOV_BRANCH=97b56f56c tick -> gov-code-drift raised.

## FULL DIFF
```diff
diff --git a/scripts/governance-checker/poller.mjs b/scripts/governance-checker/poller.mjs
index dd6100126..ca61ed7eb 100644
--- a/scripts/governance-checker/poller.mjs
+++ b/scripts/governance-checker/poller.mjs
@@ -341,6 +341,26 @@ function loadExceptions() {
   return { open, openSince, naConfirmed };
 }
 
+// #490 recurrence guard ("who checks the checker"): detect when the DEPLOYED checker CODE has
+// drifted from origin. #449 recurred once because the box silently fell 388 commits behind and
+// nobody noticed — a manual git pull was a patch, not a fix. Compare the checker's OWN code subtree
+// (HEAD:scripts/governance-checker) against origin's; if they differ, the box is executing logic that
+// no longer matches what was reviewed and pushed. Scoped to the checker subtree (NOT the whole repo)
+// so a routine governance-doc push never trips it — the checker's code changes ~5×/90d, docs push
+// thousands of times (the exact #490 lesson: grade the code by its own tree hash, not the repo count).
+// origin is already fetched this tick. A rev-parse failure is NOT drift — don't manufacture a false alarm.
+function checkerCodeDrift() {
+  try {
+    const local = execFileSync('git', ['rev-parse', 'HEAD:scripts/governance-checker'],
+      { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
+    const origin = execFileSync('git', ['rev-parse', `${BRANCH}:scripts/governance-checker`],
+      { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
+    return { drifted: local !== origin, local, origin };
+  } catch (e) {
+    return { drifted: false, error: String(e.message || e) };
+  }
+}
+
 export function tick(nowMs = Date.now()) {
   const state = loadState();
   const { commits, fetchOk } = gitFetchAndLog();
@@ -368,6 +388,22 @@ export function tick(nowMs = Date.now()) {
   }
   state.fetchFailStreak = 0; state.fetchFailSev = undefined;
   if (state.openAlerts[FETCH_KEY]) { alertSink.resolve(state.openAlerts[FETCH_KEY]); delete state.openAlerts[FETCH_KEY]; }
+  // #490 recurrence guard: warn if the deployed checker code has drifted from origin, so a silent
+  // redeploy gap can never again let the box grade with stale logic the way #449 hid for two weeks.
+  const DRIFT_KEY = 'gov-code-drift';
+  const drift = checkerCodeDrift();
+  if (drift.drifted) {
+    if (!state.openAlerts[DRIFT_KEY]) {
+      const id = alertSink.add({ dedupeKey: DRIFT_KEY, severity: 'warning',
+        title: 'governance-checker code is STALE vs origin — redeploy the checker box',
+        body: `Deployed checker code subtree ${drift.local} differs from origin ${drift.origin}. The box is ` +
+          `running governance logic that no longer matches what was reviewed and pushed; grading may be wrong. ` +
+          `Redeploy scripts/governance-checker/ (git pull on the checker box) and this clears. (#490 recurrence guard.)` }, nowMs);
+      if (id) state.openAlerts[DRIFT_KEY] = id;
+    }
+  } else if (state.openAlerts[DRIFT_KEY]) {
+    alertSink.resolve(state.openAlerts[DRIFT_KEY]); delete state.openAlerts[DRIFT_KEY];
+  }
   const { batches, untaggedCode } = computeBatchStates(commits);
   // B-GOV-4 OBJ-3/4: enrich each batch with the shared close-detection primitive (git FIRST-ADD
   // commit time of its completion report + scope), then PIN closed-quiescent batches to their
```
