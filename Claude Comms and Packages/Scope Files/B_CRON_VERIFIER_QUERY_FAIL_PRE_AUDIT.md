# B-CRON-VERIFIER-QUERY-FAIL — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Issue:** `#1211` · **Plan row:** 59g2 · **Owner:** CC-B
*Read at `origin/migration/aws-supabase` after the scope r2 commit. Scope r1 APPROVED by Langston at `b41d5442d` with C-4…C-7, folded into r2.*

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope r1): N = 4 because "every measured failure was a single isolated run". NOW: N = 4 derived from the cadence; the isolation is measured on 2 of 7 episodes and inferred on 5. REASON (Langston C-4):** the alert queue cannot see clustering (one `prevOccurrence` key covers an hour's four runs); the log can, and reaches only ~14 days back.
- **PREVIOUSLY STATED (scope r1 objective 4): the next real failure is observed live. NOW: not a gate; carried as a forward read on `#1211`. REASON (C-6):** that would be waiting to observe an absence.

## A. AUDIT
**A1 — the six sources.** (1) Code at the ref: `cron-fire-evidence-verifier.ts` `:72-108` (`queryLastFires`), `:116-214` (`runVerification`), `:216-265` (`emitStaleAlert`), `:271-291` (the loop) — Langston re-read every cite at `b41d5442d`. (2) Runtime: 2 `QUERY_FAIL` lines in retained stderr, each one run (C-4); the queue's seven `no_fires_ever` sets. (3) SIM §9.10.c (`:937-960`). (4) System Manual: nothing on the verifier's failure mode — content N/A (it documents the trading system; this is the monitoring layer). (5) Ledger: `#167`, `#198`, `#691`, `#1185`, `#1211`. (6) `bridge/canonical/`: no coverage.

**A2 — entry points, enumerated first, repo-wide (tests excluded).** `runVerification` is called from exactly one place: the `setInterval` in `startCronFireEvidenceVerifier` (`:278-285`), started once at `server/index.ts:1534-1535` (idempotent guard `:272-275`). No other scheduler, cron, route or bootstrap calls it; the tests call it directly. The return value is discarded at `:279` — **no production reader**.

**A3 — state-write census (§9.5(a-ii)).** New module state: `consecutiveSkips`, `totalSkips`, `firstSkipAt` — read only by `runVerification` and its log line; reset of `consecutiveSkips` / `firstSkipAt` on a successful read. New alert key `cron_verifier_blind:<first-skip ISO>` — written by `addAlert`; readers: the per-turn alert read and Langston's triage; **nothing resolves it in code** (by design, scope §interlock). Removed behaviour: a failed read no longer writes `cron_stale:*` rows — their reader (the queue) loses only false rows. `addAlert`'s dedupe: any non-resolved row blocks a new one with the same key — the first-skip timestamp in the key makes each episode distinct.

**A4 — what is not touched.** The healthy path (a successful read) is byte-for-byte the same; the boot-grace skip (`:129-135`) and the latency grace (`:181`) are unchanged; `emitStaleAlert`'s body (incl. its false "clears automatically" sentence — leg (a)'s, `#691`) is unchanged.

## B. PLAN (each item back-references its finding)
1. **(A2, scope obj 1)** `queryLastFires` returns `Map | null` — `null` from its catch, with the `QUERY_FAIL` log kept; the comment rewritten to say what it now does.
2. **(A3, scope obj 1-2)** `runVerification`: on `null`, increment both counters (set `firstSkipAt` on the first), log `[CRON-FIRE-VERIFIER][SKIPPED_QUERY_FAIL] consecutive=<n> total=<m> since=<ISO>`, at exactly `consecutive === 4` call a new `emitBlindAlert(firstSkipAt)` (`cron_verifier_blind:<ISO>`, `warning`, the floor wording of C-5), and return `{ ok: true, stale: [], skipped: 'query_fail' }`; on a map, reset `consecutiveSkips` / `firstSkipAt` and run as today. `BLIND_ESCALATION_SKIPS = 4` as a named constant with the cadence reasoning beside it.
3. **(scope obj 3; C-7)** Tests in `server/tests/unit/cron-fire-evidence-verifier.test.ts`: one throw ⇒ no alert + `skipped`; its twin — the `:101-109` fixture verbatim without the throw ⇒ mints `no_fires_ever`; four persistent throws ⇒ one `cron_verifier_blind`, a fifth ⇒ none, a restored read ⇒ count reset (a further four ⇒ a new episode key); the existing `:173-181` test asserts no alert. Counters cleaned by the existing `vi.resetModules()`.
4. **(scope obj 4)** Step 7: the regular cycle's log lines unchanged after the deploy; 0 new verifier error lines. The first real `SKIPPED_QUERY_FAIL` is a forward read on `#1211`.
5. **Governance:** SIM §9.10.c (the skip state, the blind key, that nothing resolves it); `#1211` (the forward read); `BATCH_CATALOG`, `PHASE_HISTORY`, `SPRINT_TO_LIVE_PLAN.md` row 59g2, task list, shared `MEMORY.md` named in the ledger; completion report.
No `UNAUDITED` items.

**Blast radius:** one service file and its tests; the healthy path unchanged; no trading path, no table, no route.
