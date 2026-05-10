# B79.0g Step 4 review

## Verdict
approved-with-revisions

## Findings
- F1: vts-runner.ts:1452 uses `void persistOpenTradeWithGuard(...)` — fire-and-forget. Map.set happens, function returns, downstream observers (TEC, scanner cycle, signal logging at 1456) see the trade as live. If async INSERT fails 50-200ms later, the guard's Map.delete creates observer divergence (trade was logged opened, TEC may have created trailing state, scanner cycle saw it, then it vanishes). Comment "Per Langston Q5 lock" is misapplied — Q5 was close-time atomicity, not open-time. Fix: either (a) `await persistOpenTradeWithGuard(...)` so trade-open blocks until persisted, or preferably (b) invert order — INSERT first, Map.set only on success, abort trade-open cleanly on failure. Option (b) is the canonical "no half-state" pattern.
- F2: Q5 deviation (fire-and-log close DELETE instead of single-tx DELETE+INSERT) needs explicit paper trail beyond RUNNING_ISSUES. Per CLAUDE.md §8 #11 NO PATCHES, scope-locked decisions reverted at implementation time require governance update same session. File a pinned follow-up batch ID (e.g. B79.0g-tx) and update the scope doc (B79_0g_scope_rev2.md or successor) with the deviation rationale before push.
- F3 (minor, non-blocking): bootstrap re-resolves asset_class for DB but doesn't update the in-memory Map. During the bootstrap session the in-memory cache holds the stale value while DB has corrected. Eventually consistent on next restart. Document or fix opportunistically.

## Specific checks
- Migration applied to staging: yes
- INSERT path: yes
- Bootstrap re-resolves asset_class (Q4 add'l #1): yes
- Mutation audit OK (Q2 lock): yes
- Soft-fail rehydrate: yes

## Q5 atomicity verdict
accept fire-and-log for ship + file follow-up — orphan-recovery via rehydrate is a deterministic correctness mechanism, the inconsistency window is sub-ms, and the tx plumbing through persistRealPriceTrade legitimately impacts B73 ablation hooks + B70 archive enqueue (own scope doc warranted). CONDITION: pinned batch ID for tx integration + scope doc updated this session per F2. RUNNING_ISSUES alone is not sufficient paper trail.

## Ship recommendation
ship after F1 fix + F2 paper trail. F1 is one-line (await or invert); F2 is governance doc update. Both this session, no rework loop needed.

ACK approved-with-revisions
