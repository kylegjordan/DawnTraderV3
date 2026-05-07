# BATCH 78.2 — Kraken WS subscribe fix (RUNNING_ISSUES #76)

**Status:** rev 1 (compressed — small surgical fix)
**Workflow:** 11-step canonical (compressed: Step-1+2 combined, Step-4 folded)
**Branch:** `migration/aws-supabase`
**Trigger:** RUNNING_ISSUES #76 — kraken-websocket-adapter has been silently failing Kraken WS subscribes since 2026-04-03 (49,175 health-checks all 0 subscribed; 142,079 "Method(s) not found" log lines). Per Langston Step-8 sequencing call (B78.1): must precede B79 Day 0.

## §1. Root cause

`subscribeToBookChannel` at `server/exchanges/kraken/kraken-websocket-adapter.ts:2292-2299` constructed a Kraken WS **v1**-format subscribe message:
```ts
{ event: 'subscribe', pair: [krakenPair], subscription: { name: 'book', depth: 1 } }
```
The WS_URL is `wss://ws.kraken.com/v2` — the v2 endpoint silently rejects v1 envelope shape, returning `{"error":"Method(s) not found","method":"subscribe","success":false,...}`.

The primary subscribe path at L1100-1117 already uses correct v2 format (`{method:'subscribe', params:{channel,symbol,depth}}`), and the matching unsubscribe at L3062-3065 also v2. Only `subscribeToBookChannel` was stale — likely a holdover from a Kraken v1 era never migrated.

Verified against current Kraken WS v2 spec via `https://docs.kraken.com/api/docs/websocket-v2/ticker` — v2 spec exactly matches L1100-1117. No protocol drift.

## §2. Numbered objectives

1. **Convert L2292-2299 from v1 to v2 format.** Match the shape used at L1100-1117 (`{method:'subscribe', params:{channel:'book', symbol:[krakenPair], depth:1}}`).
2. **Audit pings.** L2767 sends `{event:'ping'}` (v1 format). v2 may accept it as no-op or may reject. Out of scope unless this is also generating errors — reserved for follow-up.
3. **Behavioral verify post-deploy:** `priceTickEventsPerMinute > 0` within 5min, `[I7-WS-RAW] Method(s) not found` rate drops, PM2 health-check shows `Subscribed Symbols: > 0`.
4. **No-touch fence holds.** Crypto_spot ablation cadence stays in 20-30/factor/hr range.
5. **Governance updates landed.** RUNNING_ISSUES #76 → RESOLVED. CHANGES_AND_FIXES entry. BATCH_CATALOG + PHASE_HISTORY rows. MEMORY 3-way sync.

## §3. Out of scope

- Refactoring or restructuring subscribe paths beyond the message-shape fix.
- Adding new symbols or changing subscription scope.
- Touching B74 archiver code (separate WS connections, working).
- Touching REST fallback (it's the safety net; keep it running).
- Migrating L2767 ping format (audit-only this batch; fix in follow-up if it's also failing).

## §4. Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Fix doesn't resolve the failures** because the actual sender is a different path I haven't found | medium | Logs after deploy will show: if errors continue at same rate, issue is elsewhere; if errors stop, this WAS the bug. Fast feedback loop. |
| 2 | **WS disconnect/reconnect storm** if previously rejected subscribes were silently retried in a tight loop | low | Errors stay synchronous; no reconnect cascade observed in pre-fix logs. Watch PM2 logs post-deploy. |
| 3 | **B74 archivers regress** | very low | B74 archivers connect to separate URLs (`wss://ws-equities.kraken.com`, `wss://futures.kraken.com/ws/v1`) and use their own subscribe paths. Untouched. |
| 4 | **No symbols actually subscribed even with fix** because `subscribeToBookChannel` is only triggered by `[I7-WS-G][CHANNEL_SWITCH]` (low-volume tier) which may never fire if no symbols are tracked | medium | If priceTickEventsPerMinute remains 0 post-fix despite the error rate dropping, then the primary subscribe path at L1100-1117 isn't being CALLED at all — that's a separate diagnosis. Document and decide. |

## §5. Files affected

**Modified:** `server/exchanges/kraken/kraken-websocket-adapter.ts` (1 block edit at L2292-2299; ~8 lines diff including B78.2 comment).

**No new files. No DB migration. No new module_constants. No SIM impact.**

## §6. Verification

1. CI Build+Docker green; Test+TS Check baseline-match acceptable.
2. SSH deploy → PM2 restart.
3. Watch PM2 logs 5min:
   - `[B78.1][WS_TICK_RATE] priceTickEventsPerMinute=N` where N > 0 (success criterion).
   - `[I7-WS-RAW] Method(s) not found` rate drops sharply.
   - PM2 health-check `Subscribed Symbols: > 0`.
4. No-touch fence post-deploy SQL: crypto_spot ablation cadence 20-30/factor/hr.
5. If still 0 ticks: Risk #4 materializes; document and close with partial fix.

## §7. Compressed Langston review

Step-1+2 combined (scope review). Skip Step-4 separate (diff is a single 8-line block; Step-8 can do final inspection). Step-8 standard.

---

*End of BATCH_78_2_SCOPE.md rev 1.*
