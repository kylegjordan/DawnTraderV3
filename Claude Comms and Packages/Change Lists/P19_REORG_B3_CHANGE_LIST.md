# P19 reorg-B3 — CHANGE LIST (Step-4, for Langston)

> **Batch:** reorg-B3 · **Phase:** 19 · **change-class: architecture** (signal-pipeline) · **Author:** NEW Claude (CC-B) · **Date:** 2026-06-24
> **#233** EV-input thread (Option B, FX5-pool-carried — you endorsed it). Scope `P19_REORG_B3_SCOPE.md`, pre-audit `P19_REORG_B3_PRE_AUDIT.md`.
> Bench: `node scripts/check-tsc-baseline.mjs` → OK, no regressions above baseline. New test 8/8 green. CI pending push.
> **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git on the mounted repo. Read this file + the staged `reorgb3.diff` directly (local FS). Use `ssh staging` for any repo inspection.**

## The fix in one line
The Net-Expectancy kernel EV inputs (DI + dbsScore) were DROPPED at the orchestrator→RTB boundary, so the open-gate always used kernel defaults (the #233 bug). reorg-B3 threads them — from the FX5 survivor snapshot the pool already carries — through a typed at-queue carrier to the open-gate.

## Files changed (8 code/test + migration)
1. **server/services/active-filter-pool.ts** — `di?` added to `ActiveFilteredPair`; `DI?` added to the `addSurvivors` survivor param (matches the scanner survivor's uppercase `DI`); `di: survivor.DI` set in both `newEntry` builds; `getFX5DataForSymbol` return widened to `{price, volume24h, dbsScore?, di?}`. (dbsScore was already stored; only DI was being dropped.)
2. **shared/schema.ts** — `rtb_signals` gains typed `di_at_queue` + `dbs_score_at_queue` (DECIMAL(8,4), nullable). Column comment pins the at-queue semantics (cond 2).
3. **drizzle/migrations/2026-06-24-p19-reorg-b3-rtb-ev-inputs.sql** (+ `-rollback.sql` OUT of git; registered in MANIFEST.txt) — ADD COLUMN IF NOT EXISTS + verify DO-block (template = b79-0n-rtb-phase1).
4. **server/services/signal-orchestrator.ts** — `buildSizedSignalForStrategy` reads the FX5 entry ONCE (`fx5Data`) and populates `diAtQueue`/`dbsScoreAtQueue` (+ `volume24h`) on the `sqeSignalInput`. OBJ-5 DI-provenance comment at the inline [HF9] recompute (left untouched).
5. **server/core/rtb/ready_to_buy_service.ts** — `SQESignalInput` gains the two optional scalars; `queueSQESignal` persists them to the typed columns (NOT metadata); xstock → null (no crypto FX5 source).
6. **server/services/paper-execution-engine.ts** — the load-bearing file (see FIND 1). The promote conversion carries the two scalars (parsed string→number) AND `sourcePool` onto `promotedSignal`; `executeSimulatedTrade` param intersection extended; open-gate reads `signal.diAtQueue ?? undefined` / `signal.dbsScoreAtQueue ?? undefined` (no coerce); OBJ-4 sample hook after the kernel call.
7. **server/services/rtb-metrics-service.ts** — OBJ-4: `EvInputSample` type + bounded buffer + `recordEvInputSample` + `getEvInputSamples` + `getEvInputThreadProof` (the OBJ-6 proof summary) surfaced on `getSummary` → the `/api/diagnostics/rtb-metrics` endpoint.
8. **server/tests/unit/reorg-b3-ev-input-thread.test.ts** (NEW, 8/8) — pool carry; H2 (strong-trend branch FIRES with non-default dbsScore, pins floor when null); H1 (real DI gives zero lift); OBJ-4 surface proof (strongTrendWithDbs).

## Open-gate hunk (the #233-relevant change)
BEFORE: `DI: signal.metadata?.DI, ... dbsScore: signal.metadata?.dbsScore` (metadata never populated → always default).
AFTER:  `DI: signal.diAtQueue ?? undefined, ... dbsScore: signal.dbsScoreAtQueue ?? undefined` (typed at-queue carrier; null → kernel documented default, no coerce).

## Your 5 conditions — dispositions (all visible in the diff)
1. **Snapshot identity** — the pool dedup-SKIPs non-expired entries (active-filter-pool ~:276-281, 5-min TTL) → the entry is the stable routing-time survivor snapshot; the typed columns freeze it at queue regardless of later pool refresh. Verified.
2. **at-queue semantics stated** — schema column comment + migration comment: "survivor snapshot that drove this entry, NOT freshest-at-instant" + explicit do-not-refix-to-live-MCE warning.
3. **Null handling, no coerce** — open-gate passes `undefined`; kernel applies its documented default (`expectancy.ts:574 DI ?? 50`; `net-expectancy-kernel.ts:107 dbsScore ?? 0` → strong-trend 0.40 floor). Explicit in code comments.
4. **Caller sweep + cond 3/4 interaction** — strong-trend routing requires |DBS|>=0.35 (exclusive lane, `canonical-regime-strategy-map.ts:1043/1080`), and only the scanner computes DBS → for CRYPTO the null-dbs-on-strong-trend path is UNREACHABLE (floor handler = belt-and-suspenders). For XSTOCK there is no crypto FX5 source → null → floor is LOAD-BEARING + fail-safe. **Stated explicitly, not papered over** (see FIND 2 home).
5. **Widening additive-safe** — `getFX5DataForSymbol` has ONE caller (`signal-orchestrator.ts:769`, reads `.volume24h`) → additive, breaks nothing.

## FIND 1 (your cond 1) — latent bug: the promote conversion DROPPED sourcePool
`checkRtbPromotion`'s rtb-row→`promotedSignal` conversion built `metadata: {source, originalSignalId, rtbQueueId, queuedAt}` and never carried `sourcePool`. **Blast radius (all on the dormant active path — active trading OFF, so no live damage; would have bitten at paper-active turn-on):**
- **EV (the decisive one):** open-gate `sourcePool` read → `undefined` → the kernel strong-trend pWin branch NEVER fired for any promoted signal → the dbsScore thread (H2) would have been inert even with reorg-B3's column thread. **This is why reorg-B3 MUST thread sourcePool too** — without it the batch is a no-op for strong-trend.
- **Telemetry/data-quality:** the trade/position record `sourcePool` persists (paper-execution-engine ~:2408/:2496/:2987) → stored NULL for promoted signals → any sourcePool-keyed post-trade analysis blinded.
- **Sizing/fill:** sourcePool-keyed paths (~:2901/:2927, e.g. pattern-pool reduced sizing) → defaulted.
reorg-B3's single thread (`promotedSignal.metadata.sourcePool = (signal.metadata as any)?.sourcePool`, :1879) fixes ALL of them. → logged in CHANGES_AND_FIXES at Step-10.

## FIND 2 (your cond 2) — xstock strong-trend null-DBS: a REAL fix, named home (not an accepted permanent gap)
xStock HAS a per-class DBS (B79.0n.MCE), it is simply not wired into the at-queue carrier (xstock does not flow through the crypto FX5 scanner). So an xstock strong-trend signal reaches the open-gate with `dbs_score_at_queue = NULL` → 0.40 floor (fail-safe now, but it gates out legitimate xstock strong-trend entries once xstock active-paper turns on). **Disposition: REAL fix — wire xStock's per-class DBS into the at-queue carrier — homed to the xStock active-path work (reorg-B8 xStock net-new / before xStock active-paper turn-on), tracked in RUNNING_ISSUES (#370-range, my block).** NOT a permanent accepted gap.

## OBJ dispositions
- **OBJ-2 (friction):** audited CLEAN, no code change (`cost-model.computeTotalRoundTripCost` adds spread once; taker both legs; fee DB-governed). Recorded; no fix.
- **OBJ-3 (raw-NetEV sizing):** proven no-op (`dynamic-sizing-engine` has zero netEV refs; netEV is a >0 gate; ranking is finalScore-native). No fix.
- **OBJ-5 (HF9 vs open-gate DI):** documented provenance; HF9 recompute LEFT untouched (live VTS filter; DI accuracy-only). No code change beyond the comment.
- **OBJ-6 (proof):** REFRAMED (you concurred) — the active path is dormant, so live rtb-metrics observe is gated on paper-active turn-on (§9.1-disclaimed, named home = turn-on). The achievable proof NOW is the integration test: it asserts the strong-trend branch FIRES with a non-default dbsScore (positive assertion) + the OBJ-4 surface captures it.

## Follow-up homed (§9.4)
- **di_at_open** (paper-execution-engine ~:2468) still reads `metadata.DI ?? 50` (always 50 today) for the trailing-exit engine — a SEPARATE consumer, out of #233's EV-gate scope. Could read `di_at_queue` for coherence; homed to RUNNING_ISSUES (not bundled — would change trailing-exit behavior).

## Governance planned (Step-10, after your Step-4 approve)
System Manual (signal-pipeline EV-input provenance: defaults→at-queue-threaded; strong-trend dbsScore parity; FIND 1 sourcePool thread) · SIM (rtb_signals typed columns + FX5 pool di carry + promoted-signal new fields cross-cutting state) · CHANGES_AND_FIXES (FIND 1) · RUNNING_ISSUES (FIND 2 xstock + di_at_open) · BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN §1/§5 · #233 resolve · completion report.
