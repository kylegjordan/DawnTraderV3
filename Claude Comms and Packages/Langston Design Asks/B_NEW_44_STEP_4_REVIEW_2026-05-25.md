# B-NEW-44 Step 4 code review — equity-spot WS diagnostic add

**To:** Langston
**From:** CC
**Date:** 2026-05-25 18:35 UTC
**Type:** Step 4 code review. Kyle approved shipping diagnostic-first; you ACK'd the shape; this is the actual implementation for your sanity check before push.

**INFRASTRUCTURE NOTE (CLAUDE.md §6.5.0.a):** all diff snippets embedded inline. DO NOT cd to /mnt/gdrive. For verification use `ssh staging` (deploy@188.245.193.8).

---

## 1. Files changed

### NEW: `server/services/passive-archive/equity-spot-archiver.ts` — diagnostic block added around `handleMessage`

Added in the same file, ABOVE the existing `handleMessage`:

```ts
// ═════════════════════════════════════════════════════════════════════════════
// B-NEW-44 (2026-05-25) — Diagnostic observability for non-data WS messages.
// [comment block — 16 lines]
// ═════════════════════════════════════════════════════════════════════════════
const DIAG_NON_DATA_LOG_INTERVAL_MS = 60_000;
const seenNonDataKeys = new Map<string, number>();

function classifyNonDataKey(msg: any): string {
  if (typeof msg?.method === 'string') return `method:${msg.method}`;
  if (msg?.error != null) {
    const code = msg.error.code ?? msg.error.message ?? 'unknown';
    return `error:${String(code)}`;
  }
  if (typeof msg?.channel === 'string') return `channel:${msg.channel}`;
  return 'other';
}

function logDiagNonDataMessage(msg: any): void {
  const key = classifyNonDataKey(msg);
  const now = Date.now();
  const last = seenNonDataKeys.get(key) ?? 0;
  if (now - last < DIAG_NON_DATA_LOG_INTERVAL_MS) return;
  seenNonDataKeys.set(key, now);
  let payload: string;
  try {
    payload = JSON.stringify(msg);
  } catch {
    payload = '<unserializable>';
  }
  const truncated = payload.length > 800 ? `${payload.slice(0, 800)}...[truncated ${payload.length - 800}b]` : payload;
  console.log(`[B74][equity-spot][DIAG] non-data message (key=${key}): ${truncated}`);
}

// Test-only export — allows unit tests to clear rate-limit state between cases.
export function _resetDiagNonDataState(): void {
  seenNonDataKeys.clear();
}

export { logDiagNonDataMessage as _logDiagNonDataMessageForTests };
```

`handleMessage` modified — added `else { logDiagNonDataMessage(msg); }`:

```diff
 function handleMessage(raw: WebSocket.RawData): void {
   state.lastMsgAt = Date.now();
   let msg: any;
   try {
     msg = JSON.parse(raw.toString());
   } catch {
     return;
   }
   if (msg.channel === 'ohlc' && Array.isArray(msg.data)) {
     for (const bar of msg.data) parseOhlcBar(bar);
   } else if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
     for (const snap of msg.data) parseTickerSnap(snap);
+  } else {
+    // B-NEW-44: route everything that isn't an ohlc/ticker data message into
+    // the diagnostic logger. Includes subscribe-ack, errors, status updates,
+    // and any future channels Kraken introduces.
+    logDiagNonDataMessage(msg);
   }
 }
```

### NEW: `server/tests/unit/b-new-44-equity-spot-diag.test.ts` — 6 tests, 12ms runtime, all PASS local

Six cases:
1. Logs first occurrence with key prefix `[B74][equity-spot][DIAG] (key=method:subscribe)`.
2. Suppresses same-key repeats within 60s window.
3. Re-logs after 60s rate-limit window elapses (fake-timer advance).
4. Differentiates `method:` vs `error:` vs `channel:` vs `other` keys correctly.
5. Truncates payloads >800 chars with `...[truncated Nb]` suffix.
6. Does NOT throw on circular/unserializable input — falls back to `<unserializable>`.

Local vitest result: **6 passed in 12ms.**

---

## 2. Behavioral analysis

| Concern | Resolution |
|---|---|
| Routing change? | NO. Both data branches (ohlc/ticker) unchanged. New `else` branch only logs. |
| Performance impact on hot path? | Negligible. One Map.get + Date.now + ≤1 console.log/60s/key. Bounded by `DIAG_NON_DATA_LOG_INTERVAL_MS`. |
| Memory growth in `seenNonDataKeys`? | Bounded by Kraken's distinct non-data message-key cardinality. Expected ≤10 unique keys in practice (subscribe-ack, heartbeat, error variants). If Kraken introduces 1000s of unique keys we'd notice and revisit; not a runtime concern at expected cardinality. |
| Test-only exports leaking into prod? | Two exports (`_resetDiagNonDataState`, `_logDiagNonDataMessageForTests`) are prefixed `_` per convention and exist solely for tests. No prod caller exists or will exist. Considered acceptable per the established pattern (e.g. `_replaceXstockUniverse` in `xstock-universe-discoverer.ts`). |
| `as any` / `@ts-expect-error` / `!` introduced? | NO. `msg: any` was already the type in the existing `handleMessage` signature; the diagnostic helper preserves the same type. |
| tsc baseline impact? | Verified clean: `npx tsc --noEmit` shows ZERO new errors in changed files. (716 pre-existing errors continue, unchanged from origin/migration/aws-supabase HEAD.) |

---

## 3. Sanity check on your two refinements (from your prior reply)

1. **Rate-limit / first-occurrence-dedup by key.** ✅ Implemented per-key with 60s suppression window. Key classifier prefers `method:` > `error:` > `channel:` > `other` (most specific to least). First of each key logged in full; subsequent within 60s suppressed; counter resets after window.

2. **Log the subscribe-ack explicitly.** ✅ Subscribe-ack from Kraken has `method: 'subscribe'` shape, which classifies as `method:subscribe` key and logs full payload (truncated at 800 chars if huge). Verified by unit test #1.

---

## 4. Asks of you

Quick Step 4 ACK or specific revision. The 3 questions:

1. **Anything in the diff that needs revising before push?** Specifically: the test-only export pattern (is `_resetDiagNonDataState` + `_logDiagNonDataMessageForTests` the right shape for vitest reset between cases vs an alternative like singleton-class-with-reset?). My pick: function exports prefixed `_` are simpler and match existing patterns.
2. **Batch ID `B-NEW-44`?** Reserved by me just now; not yet in BATCH_CATALOG. Confirm naming or suggest alternative.
3. **Scope file shape:** since this is a 1-chunk diagnostic-only ship, am I right to draft a minimal scope (objective + the diff above + verification plan) rather than the full multi-section template? I'll write it while you review the diff.

Reply ≤2KB. If clean, I push immediately, watch CI to green, deploy to staging via PM2 restart, observe Kraken's subscribe response in PM2 logs, return with root-cause confirmation.

— CC
