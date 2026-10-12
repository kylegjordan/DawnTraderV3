# CC-B deploy record — 2026-10-12

## Deploy 1 — `e8f575d3c180bef3fb218d8e424d8f7d9048d725` (row 59e `B-RTB-REFRESH-LIVE-PRICE`), declared before it runs
**From (rollback target):** `78f62ed016a3453947280a35d6a6af028f0303df` (Analyst Claude's deploy, `pm_uptime` 2026-10-12T00:42:03Z).
**Runtime commits in range `78f62ed01..e8f575d3c`:**
- CC-B, row 59e: `40306a0a0` (Step 3), `e8f575d3c` (Step-4 r2) — Langston Step 4 **APPROVED** at `e8f575d3c`.
- Analyst Claude, row 33 `B-PRICE-STALENESS-BOUND`: `839aeb386`, `9114cbdf8`, `1e48298ab` (the tripwire's age arm narrowed; "arm (d) narrowing approved") — **riding with Analyst Claude's clearance** (asked 2026-10-12 08:54Z; the answer is recorded below before the deploy runs).
**CI:** run `38225689498` on `e8f575d3c`, per job TypeScript Check, Test Suite, Build, Docker Build — all `success`.
**Migration:** none (the schema change is a declaration of the unique index the database already has).
**Timing:** before the 13:30Z US open (row 3a1's criterion-1 window re-anchors at the restart — its §3a clause 5), outside 02:00-02:30Z.
**Mechanics:** staging files set aside (`phase9_predictive-learning.json`, `reports/`) to `/home/deploy/preserved-<TS>`, stashed, `dt-deploy <sha> --by cc-b`, popped, sha256 compared.

**Step 7 reads (row 59e), pre-stated:**
1. **The wiring:** the `[A4.R10R-3][RTBRefresh]` line carries `askAdmissible=`; a `[B-RTB-REFRESH-LIVE-PRICE][PASS]` line appears per refresh pass with per-class outcome counts.
2. **The retirement, on the pool as it stands:** the read-1/Langston-08:01Z would-retire rows still queued at deploy (DOT ×2, ONDO, SENT, INJ…, SKHY, SNDK as present) — crypto ones retired on their first priced pass, xStock on the second; each with a `[RETIRE]` line and a `signal_eval_archive` row `source='rtb-refresh'`, `reject_stage='rtb_price'`; `rtb_signals` no longer holding them. **Population read before the deploy** (below), so "retired" is checked against a named list.
3. **The refusals (Langston's Step-4 finding):** the instrument for `ask_expired` and every other `unpriced` reason is the **stdout `[PASS]` line** (`getPriceCheckCounts()` has no route); it is captured from every out-log file in the window, not `out.log` alone (the log rotates ~every 20 min at 1 GB).
4. **The shadow:** `rtb_price_shadow` rows appear at ≤ 7 per signal per hour; population named — conditioned on an admissible ask, excludes every retirement.
5. **[C1](b):** `[CLAIM_REFUSED]` lines if any (a zero is unexercised, not evidence); `PROMOTION_SUMMARY` carries `claimRefused=`.
6. **No regression on the open path:** opens continue; `ENTRY_GEOMETRY` (row 59 inc 1) unchanged.

**Pre-deploy population (class-partitioned M1 query, staging DB, 2026-10-12 08:53:55Z, deployed `78f62ed01`; the crypto archive is a ~60 s sampler, so 69 of 97 crypto rows had no archive row within 15 s — a proxy, not the refresh's read):** would-retire with an admissible archived ask — **TAO/USD `pivot_shift`** (crypto, ask 295.0991 ≥ target 286.3522, queued 2026-10-09 01:54Z); **SKHY/USD `pivot_shift`** and **SKHY/USD `morning_star`** (xStock, ask 166.42 ≤ stops 169.14 / 166.97); **SNDK/USD `pivot_shift`** (xStock, ask 1550 ≤ stop 1575.72). Every one two-sided with quantity, spread 0.034-0.129 %. (DOT ×2, ONDO and SENT from read 1 are no longer in the would-retire set at this read — either gone from the queue or not archived within 15 s.)
