# B-CRON-VERIFIER-QUERY-FAIL — Step 4 change list (row 59g2, `#1211`)

**Audit and plan (approved, C-8…C-10 folded):** `Scope Files/B_CRON_VERIFIER_QUERY_FAIL_PRE_AUDIT.md` · **Owner:** CC-B

## The code (`server/services/cron-fire-evidence-verifier.ts`)
- `queryLastFires` returns `Map | null`; its catch keeps the `QUERY_FAIL` log and now `return null` (the comment says why the old pre-filled nulls paged).
- `runVerification`: return type widened to `{ ok; stale; skipped?: 'query_fail' }`. On `null`: `consecutiveSkips += 1`, `totalSkips += 1`, `firstSkipAt` set on the first, log `[CRON-FIRE-VERIFIER][SKIPPED_QUERY_FAIL] consecutive=<n> total=<m> since=<ISO>`, **`if (consecutiveSkips >= BLIND_ESCALATION_SKIPS)`** (C-8 — a swallowed write at exactly 4 cannot leave an episode unpaged; the dedupe keeps one row per episode; after a hand-resolve while still blind the next skip re-pages), return `{ ok: true, stale: [], skipped: 'query_fail' }`. On a map: `consecutiveSkips = 0`, `firstSkipAt = null`, then today's code unchanged. The early return covers the interval-fallback arm too.
- `BLIND_ESCALATION_SKIPS = 4` with the cadence reasoning beside it.
- `emitBlindAlert(since)`: `dedupe_key cron_verifier_blind:<since ISO>`, **category `breakage`** (C-9 — the sibling `cron_stale` category, in `ALWAYS_DELIVER_CATEGORIES`, so a blind verifier is never silent), severity `warning`, title *"… could not read job history for at least 4 consecutive checks"*, body naming the `SKIPPED_QUERY_FAIL` line as the live count and that the row is resolved by hand; swallow on write failure as `emitStaleAlert` does.

## The tests (`server/tests/unit/cron-fire-evidence-verifier.test.ts`, 14)
- The existing *"does not throw if DB query fails"* now asserts **no alert** — it fails on the original code (the original paged).
- New block, failures queued as `mockImplementationOnce` throws that fall through to the factory's own read — **no restore**, so no leg can pass on a successful-but-empty read (C-10): one failed read ⇒ `{ ok, stale: [], skipped }`, no alert; **its minting twin** (the never-fired fixture, read working) ⇒ `no_fires_ever`; four failures ⇒ one blind alert (`breakage`, floor wording), a fifth ⇒ re-offered under the same key; **the reset asserted positively** — three failures then a real read of a job WITH a fire row ⇒ `{ ok: true, stale: [] }`, zero alerts — then four more failures ⇒ a new episode key.
- **Mutants:** the original verifier fails 4 tests; the `===` one-shot fails 1. tsc 329 = 329.

## Record items for the completion report
(i) the return-type widening (above). (ii) **What covers a genuine cron outage in the first blind hour:** if the cause is the database being down, the database monitor and every DB-dependent service's own errors; if the cause is local to `scheduled_tasks_audit`, nothing does until skip 4 — that hour is the cost of not paging on a one-off timeout.
