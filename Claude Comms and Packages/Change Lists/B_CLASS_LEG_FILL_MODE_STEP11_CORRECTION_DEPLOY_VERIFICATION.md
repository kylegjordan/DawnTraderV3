# B-CLASS-LEG-FILL-MODE — Step 11 correction deployment verification

**Correction/runtime ref:** `30af855f2e4bdb4cc33ca22b69bf14321df6543e`

**Deployment:** `2026-10-15T17:25:17Z` by `codex-c`; restart counter 650; no pending migration; 11-second contiguous check-failure window.

**Verdict:** backend PASS. UI remains not applicable to the corrected crypto VTS persistence/logging seams and was not checked under the Codex browser restriction.

## Identity and health

- Live checkout, `dist/BUILD_SHA`, and authenticated liveness all returned the full correction ref.
- Liveness returned HTTP 200 with `engineExpected=true` and `engineRunning=true`.
- The paper RTB refresher returned HTTP 200, `isRefreshCycleRunning=true`, pool size 133, 100% progress, and `failsafeTriggered=false`.
- The sole `dawntrader` PM2 process was online at restart counter 650 with zero unstable restarts.
- CI `38775865750` passed TypeScript Check, Test Suite, Build, and Docker Build individually at the exact correction ref.

## Database and live policy exercise

- All 8 intended policy/placement columns remain present, nullable, and without defaults; both placement fields remain `timestamp with time zone`.
- The exact four governed rows remain crypto entry/target `maker_only` and xStock entry/target `maker_preferred`.
- The complete reconfirmed RTB snapshot contained 132 rows: 12 crypto maker-only/maker, 118 xStock maker-preferred/maker, and 2 xStock maker-preferred/taker. The contradiction query returned 0 crypto rows against the non-empty 12-row crypto control population.
- Current position controls were 20 active-paper rows in state `open`; VTS contained 420 `open`, 2 `pending`, and 242,183 historical `closed` rows. These are point-in-time controls, not outcome-rate claims.

## Bounded logs

The fixed UTC window `[2026-10-15 17:25:06, 2026-10-15 17:27:18)` contained 78,192 `out.log` lines and 1,658 `error.log` lines. It included 29 `B-CLASS-LEG-FILL-MODE` markers, including the exact four-policy warmup and normal fail-closed policy activity. It contained 16 existing TEC startup-error control lines, proving the error slice and filter were live, and 0 of the named `SNAPSHOT_INVALID`, `TARGET_POLICY_REFUSED`, `OPEN_REJECT`, or missing/invalid/non-finite selected-EV failure signatures.

## xStock availability handoff

The outgoing reviewed writer boot `978bcf72-cd32-4409-bd82-4039afbaca18` on `097306d1a91d5bb0dfc9cc9d376ec84887861aeb` recorded its immutable handoff at `2026-10-15T17:25:07.138760Z`. Its counters reconcile exactly: 200,717 accepted frames minus 109,271 buffer supersessions equals 91,446 projection attempts; 668 admission flushes equals 668 completion flushes.

The incoming boot `06cc1925-9dc6-485c-8016-efe6add1e7a7` started at `2026-10-15T17:25:16.863615Z`, names that exact predecessor, carries correction ref `30af855f2e4bdb4cc33ca22b69bf14321df6543e`, and is correctly open. The separate xStock observation therefore crossed this normal reviewed deployment cleanly; this record neither resets nor prematurely completes that observation.

## Limits and next gate

No natural post-correction VTS maker-only open was required: the deterministic counterexample, production wiring fence, red mutation, all-four CI, exact live identity, and bounded runtime checks are the functional acceptance controls. Coltrane must independently verify this exact evidence ref and explicitly admit runtime `30af855f2` to the separate xStock reviewed-ref set before the completion report closes.
