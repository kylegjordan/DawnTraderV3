# B-CLASS-LEG-FILL-MODE — Step 7 staging verification

**Deployed runtime:** `097306d1a91d5bb0dfc9cc9d376ec84887861aeb`

**Deployment record:** `2026-10-15T16:29:18Z`, claimed actor `codex-c`, restart counter 649, migration 722 ms, contiguous check-failure window 11 seconds.

**Verification verdict:** backend PASS. The Codex staging-browser gap in `AGENTS.md` applies, so the affected Open/Closed Trades and Ready-to-Buy UI surfaces are explicitly **UI not yet checked**. No password was typed and the prohibited in-app login path was not used.

## 1. Runtime identity and health

- The deployment record, live liveness response, live checkout, and built artifact identify the full deployed SHA above.
- Coltrane approved the production implementation at exact ref `695a5841afb0b12919c2d87313432bec9730618d`. The complete diff from that ref to the deployed ref contains only three workflow-state documents (`MEMORY_CC_C.md`, the Step-3 change list, and the scratch checklist): 6 insertions and 2 deletions. No deployment-surface file changed after review.
- Authenticated `GET /api/health/liveness` returned HTTP 200 with `buildSha` equal to the deployed SHA, `engineExpected=true`, and `engineRunning=true`.
- Authenticated `GET /api/diagnostics/rtb-queue/refresher-status?mode=paper` returned HTTP 200 at `2026-10-15T16:33:13.205Z`, `isRefreshCycleRunning=true`, pool size 99, 100% progress, and no failsafe trigger.
- The shared-branch CI run `38769329916` independently passed TypeScript Check, Test Suite, Build, and Docker Build at the exact deployed SHA.

## 2. Migration, schema, and configuration

The read-only database snapshot at `2026-10-15T16:36:14.997375Z` found:

- the migration ledger row for `2026-10-15-b-class-leg-fill-mode.sql`, applied at `2026-10-15T16:29:07.186719Z`;
- all 8 intended new columns, all 8 nullable and all 8 without a default, preserving honest pre-cutover nulls;
- both `maker_placed_at` columns as `timestamp with time zone`;
- exactly four governed rows: crypto entry and target exit `maker_only`, xStock entry and target exit `maker_preferred`.

The four returned rows are the positive control for the configuration read. The same bounded population contained four valid values and zero invalid values.

## 3. Live decision-path evidence

At the same database snapshot, the complete current `rtb_signals` population with `status='reconfirmed'` was:

| asset class | saved policy | chosen mode | rows |
|---|---|---:|---:|
| crypto spot | maker only | maker | 8 |
| xStock spot | maker preferred | maker | 89 |
| xStock spot | maker preferred | taker | 2 |

The exact contradiction query returned **0** crypto rows whose saved `maker_only` policy chose anything other than maker. This zero is supported by the 8-row crypto positive population, not by an empty query. The 2 xStock taker rows also exercise the intended distinction: xStock may take when the maker-preferred policy selects that admissible arm.

This is a volatile, point-in-time queue snapshot, not an all-since-deploy ledger claim. A fresh read one minute later returned 99 rows: 8 crypto/maker, 90 xStock/maker, and 1 xStock/taker; all 99 carried the class-consistent policy.

The post-deploy `out.log` slice from `16:29Z` through the check contained **82** batch markers: 1 exact four-policy warmup, 2 legacy-maker retirements, and 79 policy-rejection events across the active, RTB, and VTS decision paths. The warmup line named all four exact class/leg values. The rejection lines prove the policy layer is being consulted by real cycles; they are expected fail-closed decisions, not runtime failures.

## 4. Legacy cut and restart behavior

- At the Step-2 snapshot there were seven legacy pending entries. Only two were still pending when the new process evaluated them: `CRV/USD` and `COST/USD`. Both emitted `[VTS][MAKER_NEVER_FILLED] ... legacy pending maker lacked placement/policy provenance — retired unfilled` at `16:30:12Z`.
- The stabilized read found **0 pending active-paper rows among 20 active positions** and **0 pending VTS rows among 332 open VTS rows**. Those non-empty totals are the controls for the two zero-pending readings.
- The one xStock target rest seen at `14:29:39Z` no longer existed at deployment: `TTWO/USD` closed naturally as a maker target fill at `14:30:11Z`, nearly two hours before the deploy. The post-deploy active population contains 0 target rests among 20 rows, so the live legacy-target clearing branch had no remaining specimen. Its behavior remains covered by the real-engine test and red mutation from Step 4; no live target-rest claim is made.
- Existing open positions and VTS rows retain null policy/placement columns by design; the migration did not rewrite their history. New policy provenance is instead visible on the actively refreshed RTB population above. No natural new open/close was required by the approved acceptance contract.

## 5. Log controls and separate known startup issue

The post-deploy `error.log` slice contained **20** `TEC_CACHE_MISS_FATAL`/position-error lines during `16:29:12–13Z`, proving the error-stream/time filter was live. This is the already-open `#1053` / `B-TEC-PRIME-BOOT-RACE`: the preceding `13:05Z` deploy produced 28 of the same lines, and the current deploy produced zero further TEC misses from `16:30Z` onward.

Against that live error-stream control, the slice contained **0** `B-CLASS-LEG-FILL-MODE`, `SNAPSHOT_INVALID`, `TARGET_POLICY_REFUSED`, or `OPEN_REJECT` failure lines. This is a bounded post-deploy absence, not a claim that the whole historical log is clean.

## 6. Parallel xStock observation continuity

The outgoing writer boot `9827d1d1-a163-4d49-8832-c76df80e2b56` on reviewed build `3a2cd4ee542bc96ee3fa40d39b3e05c0e0671f01` recorded its immutable handoff at `2026-10-15T16:29:07.957116Z`. Its counters reconcile exactly: 679,776 accepted frames minus 316,860 buffer supersessions equals 362,916 projection attempts, and 2,445 admission flushes equals 2,445 completion flushes.

The incoming boot `978bcf72-cd32-4409-bd82-4039afbaca18` started at `2026-10-15T16:29:17.128399Z`, names that exact predecessor, carries the deployed SHA, and is correctly open. The separately governed xStock availability window therefore retains a clean durable crossing; this deployment does not reset it or block later reviewed deployments. The deployed SHA must be included in the final gate's explicit reviewed-ref set after Coltrane's Step-8 read of this exact runtime.

## 7. Fresh-reader record

`REVIEWER: claim-only · named independent staging/review/config/schema/RTB/legacy/log objects · gaps: legacy denominator not reconciled; absence must be signature- and window-bounded; normal policy rejects occurred · re-derived y`

The reader's load-bearing hits were re-derived directly before this record was finalized:

- the exact-ref diff is the three-document, zero deployment-surface diff recorded in §1;
- the RTB evidence is explicitly a volatile snapshot, not a historical denominator;
- the legacy claim is limited to the two named rows observed at the cut, not all seven Step-2 rows;
- the zero-error claim is limited to the named hard-failure signatures and bounded post-deploy window, while normal policy-rejection events are reported positively in §3;
- PM2 remained online at restart counter 649 during the final read.
