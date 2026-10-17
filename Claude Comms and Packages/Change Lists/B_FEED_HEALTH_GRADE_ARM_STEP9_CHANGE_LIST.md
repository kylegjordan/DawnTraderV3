# B-FEED-HEALTH-GRADE-ARM — Step 9 implementation, change list for Step 4 (row 3a, `#1123`)

**Code commit:** `bafba0029` · **Design (approved r4):** `Langston Design Asks/B_FEED_HEALTH_GRADE_ARM_STEP9_R1_DESIGN.md` · **Owner:** CC-B
*Read the diff at the ref; the gates below say what each part claims and where it is pinned.*

## Gate A — F-3, the counter (adapter + snapshot)
- `kraken-websocket-adapter.ts`: `reconnectsCompleted` (field beside `reconnectRetries`), `+1` in `handleOpen` when `wasReconnect` (your settled point: the flag is set on all three reconnect paths, false only from `start()`), never reset; exposed on `getStatus()`.
- `feed-integrity-monitor.ts` `recordSnapshot`: `intervalReconnects = max(0, completed − lastReconnectsCompleted)`, `lastReconnectsCompleted` null until the first snapshot (baseline counts nothing). Condition (c): the "CUMULATIVE reconnectAttempts" comments are rewritten, not stacked.
- **Pinned:** `b-feed-health-grade-arm-step9.test.ts` F-3 block. **Mutation run:** pointing the snapshot back at `reconnectAttempts` fails 6 of 17.

## Gate B — F-1, one connection term
- `connectionReading()`: ring ready ⇒ Σ completed reconnects over the ring + its uptime % + `ringSpanMs` (newest − oldest) + samples; warming ⇒ the latest interval's count, `uptimePercent: null`.
- `connectionStatus(count)`: warning ≥ 3, critical ≥ 5 — condition (a): the threshold comments name the basis. Status = worse of liveness and this.
- Deleted (rule 18): `calculateTimeBasedUptime`, `uptimeStartTime`, `totalMinutes`, `healthyMinutes`, `lastHealthCheckTime`, `reconnectsThisInterval` (condition (d)), `categorizeHealthBySpec`, the latency and uptime status thresholds, the latency grade rungs and their env reads; `reset()` keeps only live state.
- `FeedHealthMetrics`: `uptimePercent: number | null`, `reconnectBasis`, `ringSpanMs` (condition (b)), `ringSamples`, `livenessGrade`.
- Report: reconnect issue lines name the basis and the span; latency issue lines gone; summary labels the heartbeat interval.
- **Pinned:** F-1 block — a clean hour is healthy/A; ring 2 / 3 / 5 at 12 samples and at 6; warming burst of 5 ⇒ critical on the interval; ready burst counts 5 not 10; warming prints "warming up"; a 6 s heartbeat changes nothing; 1 reconnect in 12 ⇒ 91.67 % ⇒ C; a 40-minute stall shows in `ringSpanMs`.

## Gate C — F-2, the xStock leg
- `equity-spot-archiver.ts`: `getEquityTickerUpdateAges(now)` (read-only, the `lastTickerUpdateAt` map).
- `feed-health-aggregate.ts`: `SymbolFreshness.assetClass?` (asserted, used as-is, `classify` only when absent); `ClassSuppressReason += 'recorder_warming'`; `xstockSourceWarm?` — when passed, the xStock class is always reported, `false` ⇒ `recorder_warming`, warm-and-empty ⇒ `no_symbols` (never `market_closed`).
- Monitor: recorder entries fed with `assetClass: 'xstock_spot'`, gated on `isEquityTickingCountWarm`; the open/closed edge reads the clock (`!isInXstockWeekendClose`), not the symbol list.
- **Pinned:** grader +5 cases (`p19-b6-7`), monitor F-2 block (cold ⇒ recorder_warming; warm-stale-open ⇒ critical; `STX/USD` from the recorder counts as xStock; Saturday ⇒ market_closed).

## Gate D — the clear, the session label, the readers
- `feed-integrity-auto-check.ts`: acknowledge on EVERY healthy cycle (idempotent), `[CLEAR]` line only when ≥ 1, `updateAlertState('healthy')` on the transition; dormant stub `uptimePercent: null` (+ the new fields); alert metadata and the console line write `warming` instead of a number; `sessionSegmentUtc` → `sessionSegment` on `getXstockSession` + `isInXstockWeekendClose` (labels unchanged).
- `alerts-service.ts` `acknowledgeFeedHealthAlerts`: `alertType = 'feed_health'` (record item (a)).
- `client/src/pages/ai-transparency.tsx`: "Heartbeat interval"; uptime shows "warming up" when null; the reconnect caption names the basis.
- **Pinned:** `b-feed-health-grade-arm.test.ts` — the restart case (recorded `healthy`, rows waiting ⇒ acknowledged on cycle 1), drained cycle prints nothing, non-healthy never acknowledges; DST cases in EDT and EST and the Fri/Sun 20:00 ET weekend edges.

## ⚠️ DEVIATION found in implementation — please rule
With xStock now in the liveness grade, the letter grade's fixed tick-age rungs (2 / 5 / 10 / 20 s) and the fixed "Data age" issue lines would grade xStock off crypto's clock: a healthy 15 s xStock quote graded **D** (rungs A<2 · B<5 · C<10 · D<20 s; corrected per Langston — r1 said B/C) and printed `Critical: Data age 15s (threshold: 10s)` continuously. **Changed:** the freshness term is the per-class liveness grade on each class's own DB thresholds — a class at warning caps the grade at C, at critical it is F; the issue line names the class (`Warning: crypto_spot freshest tick 7s old`). The `*_TICK_AGE_SEC` env thresholds are deleted. Pinned by two tests (xStock 15 s ⇒ A, no issue; crypto 7 s ⇒ warning, C, named). `stalenessSec` / `tickAgeSec` stay as telemetry (worst age across classes).

## Consumers whose behaviour moves
- **The P19-B6.9 parity gate** (`parity-gate.ts:95`) reads `getRollingWindowReadiness().uptimePercent` — it now sees real reconnects, so the Phase-21 go-live readiness becomes accurate, which can only make it stricter.
- The `/system/feed-health` route returns the new fields; the dashboard tile is updated.

**Verification:** tsc baseline 335 = 335; 70 tests across the three suites pass. Four unrelated suites (`b-staging-liveness-watch`, `b-tsc-baseline-fix`, `b63-item12`, `b63-item16`) fail locally on the unchanged code as well — CI is the authority.

## Step-4 ruling (Langston, 2026-10-17 ~12:40Z): PROCEED at `bafba0029`, deviation RULED required by F-2
- Condition 1 (in-commit): a present, non-suppressed class with no DB threshold prints `NOT GRADED` in the issue list — done, with a test.
- Condition 2 (Step 10): System Manual `sections/PHASE7_SYSTEM_LIFECYCLE_AND_INFRASTRUCTURE.md:533-535` and `SYSTEM_MANUAL.md:7824` still document the deleted contract — swept at Step 10.
- Record: `reset()` docstring corrected (it has a production caller); a weekend restart reads `recorder_warming` for the whole closure (uncovered, no alarm consequence, precedence kept per r4).
