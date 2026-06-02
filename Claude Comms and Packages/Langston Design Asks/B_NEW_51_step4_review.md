# B-NEW-51 — Step 4 code review (embedded diffs)

**Batch:** B-NEW-51 (cron-fire-evidence verifier: cadence-aware staleness + root-level alert dedup). **Reviewer:** Langston (Step-4, pre-push). You ACKed the scope (Step-1) with the ONE-not-ZERO verification correction, which is folded in.

**Local:** tsc 493 == baseline (0 net new). Targeted vitest **28/28 green** (cron-next-fire prev cases, verifier cadence/grace/boot-grace/interval-fallback/dedup-key, system-alerts dedup).

## INFRASTRUCTURE NOTE
- Do NOT `cd /mnt/gdrive` / `git status` on the FUSE mount. Diffs embedded below. `ssh staging` for any repo inspection.

## 1. server/services/cron-next-fire.ts — NEW computePrevFire (cron-parser .prev())
```ts
export function computePrevFire(expression: string, timezone?: string, from: Date = new Date()): Date | null {
  try {
    const options = timezone ? { tz: timezone, currentDate: from } : { currentDate: from };
    const interval = parseExpression(expression, options);
    return interval.prev().toDate();
  } catch (err) {
    console.error(`[CRON-PREV-FIRE][PARSE_FAIL] expr=${expression} tz=${timezone ?? '(default)'}: ` + (err instanceof Error ? err.message : err));
    return null;
  }
}
```
Mirrors `computeNextFire` exactly, `.prev()` instead of `.next()`. `.prev()` is STRICTLY-before `from` (test locks this: from on an occurrence boundary returns the PRIOR occurrence).

## 2. server/services/system-alerts.ts — root-level dedup
```diff
@@ schema (additive optional, schema_version stays 1) @@
+  dedupe_key?: string | null;   // on SystemAlert
@@ AddAlertOptions @@
+  dedupe_key?: string;
@@ addAlert — build entry @@
+    dedupe_key: opts.dedupe_key ?? null,
@@ addAlert — inside withLock, before push @@
   const all = readAllAlerts();
+  if (opts.dedupe_key) {
+    const existing = all.find((a) => a.dedupe_key === opts.dedupe_key && a.state !== 'resolved');
+    if (existing) { result = existing; return; }   // dedup: no append, return existing
+  }
   all.push(entry);
   writeAllAlertsAtomic(all);
```
- No `dedupe_key` → identical to today (every other caller unaffected). `resolved` does NOT block a fresh alert (condition can legitimately recur). Dedup runs UNDER the existing file-lock (no new race).
- Also: `ALERTS_FILE` made env-overridable (`process.env.SYSTEM_ALERTS_FILE || '/var/log/...'`) so the new unit test can target a tmp file. SYSTEM_ALERTS_FILE is never set in staging/prod → path unchanged.

## 3. server/services/cron-fire-evidence-verifier.ts — cadence-aware staleness + dedup_key + test hooks
```diff
+ import { computePrevFire } from './cron-next-fire.js';
+ const FIRE_LATENCY_GRACE_MS = 10 * 60 * 1000;  // gap between occurrence and evidence-write
+ const BOOT_GRACE_MS = 5 * 60 * 1000;           // don't judge until uptime > this
- const processStartMs = Date.now();
+ let processStartMs = Date.now();
+ export function _setProcessStartForTest(ms: number): void { processStartMs = ms; }
- export async function runVerification(): Promise<...> {
-   const now = Date.now();
+ export async function runVerification(nowMs: number = Date.now()): Promise<...> {
+   const now = nowMs;
```
Per-job loop REPLACED. New logic (the core):
```ts
// process-level boot-grace
if (now - processStartMs < BOOT_GRACE_MS) return { ok: true, stale: [] };

for (const job of jobs) {
  const lastFire = lastFires.get(job.name) ?? null;
  const prevOccurrence = computePrevFire(job.expression, job.timezone, new Date(now));

  if (prevOccurrence === null) {
    // belt-and-suspenders: unparseable expr → legacy interval×1.5 fallback (reason …_interval_fallback)
    ...
    continue;
  }
  const prevMs = prevOccurrence.getTime();
  // occurrence too recent → evidence may still be in-flight
  if (now - prevMs < FIRE_LATENCY_GRACE_MS) continue;

  const isStale = lastFire === null || lastFire.getTime() < prevMs - FIRE_LATENCY_GRACE_MS;
  if (isStale) {
    const dedupeKey = `cron_stale:${job.name}:${prevOccurrence.toISOString()}`;
    await emitStaleAlert(job.name, lastFire, prevOccurrence,
      lastFire === null ? 'no_fires_ever' : 'stale_fire_evidence', dedupeKey);
  }
}
```
`emitStaleAlert` now takes `dedupeKey`, passes it to `addAlert`, retitled "missed its scheduled fire", body corrected to drop the wrong "PM2 restart fixes it" advice (your live-diagnosis point) and explain it auto-clears on next successful fire.

## Walkthrough vs your Step-1 cases
- **weekend_shutdown (weekly, last fire 05-23, now Tue):** prevOccurrence = 05-30; lastFire 05-23 < 05-30−grace → STALE once, dedupe_key `cron_stale:weekend_shutdown:2026-05-30T00:00:00.000Z`. Every subsequent 15-min cycle re-computes the SAME key → addAlert dedups → no new alert. ✓ (your "exactly ONE" — the 05-30 miss is genuine.)
- **healthy weekly (fired on last occurrence):** lastFire ≥ prevOccurrence → healthy, no alert (old interval×1.5 would have false-flagged mid-week). ✓
- **stuck fixed-interval:** every-5-min job, prevOccurrence minutes ago, no recent fire → stale + deduped. ✓

## Deploy plan (post-ACK)
push → CI all-4-green → deploy → **resolve the ~16 legacy weekend_shutdown stale alerts** (`system-alerts resolve <id> --by cc-session-2026-06-02`) so the stream stops → confirm next verifier cycle emits EXACTLY ONE new keyed alert then ZERO subsequent (per your §42 correction) → governance + close.

## Question
Anything on the grace constants (10-min fire-latency, 5-min boot) or the dedup contract you'd change before I push? Bundled in this same push: a 1-line B.2.UI cosmetic follow-up (whole-number crypto quantities in the Volume/Order Book column, no decimals — Kyle directive) — flagging so the diff isn't a surprise.
