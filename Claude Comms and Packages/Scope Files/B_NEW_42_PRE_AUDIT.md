# B-NEW-42 Pre-Audit — xStock Calibration Phase 0

**Batch ID:** B-NEW-42
**Date:** 2026-05-17
**Author:** Claude Code
**Scope:** `B_NEW_42_SCOPE.md` rev2 (Langston ACK 2026-05-17)
**Branch:** `migration/aws-supabase`

---

## §1 Sequencing dependency reconciliation (per Langston rev2 round-2 guidance)

`1-system-manual/XSTOCK_CALIBRATION_PLAN.md` line 9 records a Kyle 2026-05-15 directive that Phase 0 starts "AFTER crypto factor calibration finalization + B67.5 ship." With the 2026-05-17 TFS sustainability gate decision (`CHANGES_AND_FIXES DESIGN-2026-05-17-A` + MEMORY "JUST DECIDED" block), B67.5 is now Phase-19-deferred. A strict reading would push Phase 0 to Phase 19 as well.

**Reconciliation (Langston rev2 round-2 confirmation):** the May 15 sequencing intent was scoped to **factor-calibration interlock** (Phase E should not run before crypto's factor framework finalized), not a blanket gate on every xStock workstream. Phase 0 (TEC safety audit on equity-specific events: splits, dividends, halts) is **orthogonal to factor work** and is justified independently by the calibration-plan line 27 cost-asymmetry framing:

> "Production-risk gate. TEC trailing stops are LIVE on xStock VTS trades right now. A 2-for-1 split that drops price 50 percent would cascade-trigger every trailing stop in that name simultaneously. Verification cost is cheap (~1 day); late-discovery cost is high. Test it before you trust it."

Kyle's 2026-05-17 "proceed with option 2" directive post-dated the TFS deferral decision, so the sequencing intent is already reconciled at the directive level. Langston confirmed the interpretation in his rev2 ACK (2026-05-17): "Phase 0 is a production-risk safety audit on TEC's equity-specific blind spots — orthogonal to factor work … belongs in front of A.1, not behind B67.5/Phase 19."

**Decision:** Phase 0 proceeds. Factor-calibration interlock for Phase E (xStock factor calibration) and any future B67.5-equivalent consumer-gate wiring remain Phase-19-gated; Phase 0 is independently safety-justified and not blocked.

---

## §2 SIM consultation per CLAUDE.md §9 (mandatory)

### 2.1 Affected components from `1-system-manual/SYSTEM_IMPACT_MAP.md`

**Component: Trailing Exit Controller (TEC)**
- **File:** `server/services/trailing-exit-controller.ts`
- **SIM coverage:** §"Recent Additions (B-NEW-40)" + "B79.TEC config-cache subsystem" — comprehensive subsystem documentation including upstream/downstream dependencies. **No corporate-action or halt-detection coverage in current SIM** (this batch will surface whether that's needed).
- **Upstream:** module_constants config-cache; pg pool (server/db.ts); per-class config snapshot via `resolveTECConfig`.
- **Downstream:** `tec-evaluator.ts`, paper-execution-engine, VTS runner, `/api/diagnostics/tec-config` endpoint.
- **Shared state:** in-memory `trailingStates` Map keyed by `tradeId` (B80). Per-asset-class config cache.
- **Background execution:** none (per-call). B80 / B-NEW-40 audit confirmed zero recurring schedules introduced.
- **Blast radius (per B-NEW-40 audit):** TEC is shared crypto+xStock infrastructure. xstock_spot branch at line 862-893 short-circuits via `isXstockMarketOpenUTC`. **There is currently NO branch for split detection or halt detection** — gap analysis confirmed.

**Component: Data freshness gate**
- **File:** `server/utils/data-freshness.ts` (112 lines, B79.0a)
- **SIM coverage:** mentioned in B79.0a context; no standalone SIM entry.
- **Function:** asset-class-aware staleness check via `isPairDataFresh(symbol, assetClass, lastTickTimestampMs, now)`.
- **Critical finding for §2.3.3 halt test design:** B-NEW-34 (2026-05-15) DELETED the `market_data.xstock_spot.data_freshness_window_ms` row. xstock_spot now falls through to `_NO_WINDOW = Infinity` → **always-fresh** semantics. **There is currently NO halt-detection logic** in the freshness layer; staleness is purely time-windowed and disabled for xStocks.
- **Upstream:** `getModuleConstants('market_data', { exchange: 'kraken', assetClass, … })`.
- **Downstream:** xstock_spot scanner gates (B-NEW-34); xStock eval-cycle; potentially TEC indirectly via tick-feed.

**Component: Ticker archive (xstock_spot_ticker_snap)**
- **File:** `shared/schema.ts:4677` — `xstockSpotTickerSnap` pgTable.
- **SIM coverage:** not in SIM as a standalone component (storage layer).
- **Schema:** includes `prev_day_close`, `open_24h`, `last`, `metadata` jsonb, `is_extended_hours`. **`prev_day_close / open_24h` is the canonical pair for §2.1.1 step-change scanning.**
- **Per-row metadata:** `metadata jsonb DEFAULT '{"schema_version": 1}'` — currently no `adjustment_factor` or `event_type` fields known. The §2.1.3 inspection will confirm.
- **Archive depth:** xstock_spot archive started post-B79.0a (early May 2026). ~14 days as of 2026-05-17. v2 plan §A.2 acknowledges this depth limitation.

**Component: OHLC archive (xstock_spot_ohlc_1m)**
- **File:** `shared/schema.ts:4629` — `xstockSpotOhlc1m` pgTable.
- **Per-row metadata:** `metadata jsonb DEFAULT '{"schema_version": 1}'`.
- **Used in §2.1.1 for minute-bar step-change detection.**

**Component: Kraken WebSocket adapter**
- **File:** `server/exchanges/kraken/kraken-websocket-adapter.ts`
- **SIM coverage:** not in SIM as standalone entry.
- **For §2.1.2:** the WS schema review queries Kraken's public docs (`https://docs.kraken.com/api/docs/websocket-v2/ticker`) — no code change here, just documentation.

**Component: xStock universe registry**
- **File:** `shared/asset-classes.ts:214` — `XSTOCK_SPOT_REGISTRY`.
- **SIM coverage:** not in SIM as standalone entry.
- **Used in §2.2.1** to cross-reference the dividend-paying name list (KO, JNJ, etc.) against actual xStock spot universe.

**Component: paper-execution-engine + VTS runner (TEC callers — Langston rev1 §2 add)**
- **Files:** `server/services/paper-execution-engine.ts`, VTS runner (per-class).
- **Role:** callers of `shouldClosePosition(tradeId, currentPrice)`. The halt-test scenario design in §2.3.3 explicitly assumes these callers feed the last-known `currentPrice` into the stop check during/post-halt.
- **No production code path touched by B-NEW-42.** The halt regression test mocks these callers' `currentPrice` pass-through behavior in isolation.

**Component: Archive ingest path (upstream-feeder of scan tables — Langston rev1 §2 add)**
- **Files:** xStock spot archivers (kraken-equities WS → `xstock_spot_ticker_snap` + OHLC bucketer → `xstock_spot_ohlc_1m`).
- **Question for audit:** does the ingest path normalize / apply adjustment-factor transforms / filter splits before write? **Currently UNKNOWN** — the §2.1.3 metadata-jsonb inspection is the indirect probe; if metadata is absent the ingest path is by-construction passing through whatever Kraken sends. Confirmed answer lands in the §3.4 audit report under "Archive ingest behavior" subsection.
- **Risk:** if the ingest writes adjusted prices silently, the >40% step-change scan signal is contaminated. Mitigation: explicitly state-of-knowledge in audit report; flag as Phase A.1 open question if indeterminate.

---

### 2.2 Upstream / downstream / shared-state / background trace per CLAUDE.md §9.1

**UPSTREAM dependencies (does any upstream feeder need to change for the audit to proceed?):**
- TEC: no upstream changes needed for the audit (regression tests are unit-test isolated).
- Archive scans (§2.1.1, §2.2.1, §2.3.1): read-only against existing tables. No upstream changes.
- Kraken WS schema review (§2.1.2): docs-only, no code touch.

**DOWNSTREAM consumers (will any downstream consumer break from the audit?):**
- The audit itself touches no production code paths. CSV outputs + audit report + test files only.
- The unit tests added in §2.1.4 + §2.3.3 mock TEC dependencies and run in isolation. No downstream consumer affected.
- IF DIRTY → B-NEW-42b would touch TEC's `shouldClosePosition` flow or add a sentinel module. Blast radius analysis lives in that batch's own pre-audit.

**SHARED STATE:**
- TEC's in-memory `trailingStates` Map — UNTOUCHED by this batch. Unit tests use fresh in-memory state.
- module_constants cache — UNTOUCHED.
- Archive tables — read-only reads only.

**BACKGROUND EXECUTION:**
- No new timers, intervals, or background tasks introduced by this batch.
- The audit queries are interactive scripts run during Step 3 (not deployed services).

**BLAST RADIUS:**
- CLEAN path: ZERO (audit-only).
- DIRTY → B-NEW-42b path: LOW (sentinel module) to MEDIUM (TEC core mod). Decomposition per scope §6.

---

## §3 Gap analysis — what the audit will discover

### 3.1 Predicted §2.1.4 forward-split test outcome: **LIKELY FAILS**

Code reading at `trailing-exit-controller.ts:1326-1331`:

```typescript
export function shouldClosePosition(tradeId: string, currentPrice: number): boolean {
  const state = trailingStates.get(tradeId);
  if (!state) return false;
  return currentPrice <= state.currentStopPrice;
}
```

**Analysis:** the stop check is a naive `currentPrice <= currentStopPrice`. On a synthetic 2:1 split, every long xStock position with `currentStopPrice > currentPrice / 2` (which is essentially every protected position — break-even or better) would have its stop fire simultaneously. No split-detector intervenes.

**Implication:** §2.1.4 forward-split test will fail. **Phase 0 will close DIRTY** on the corporate-actions branch. B-NEW-42b is likely.

### 3.2 Predicted §2.1.4 reverse-split test outcome: **LIKELY PASSES BUT EDGE-CASE WORTH TESTING**

`updatePosition` line 933-935 updates `state.highWaterMark` on `update.currentPrice > state.highWaterMark`. A 2× single-bar jump from $50 → $100 would set new HWM = $100. Subsequent stop placements compute from $100. The naive arithmetic doesn't phantom-promote TRAILING_TAKE mode (which requires hitting `targetPrice`, not just exceeding HWM).

**However:** if the synthetic jump happens to cross `targetPrice` exactly during the jump, target-lock latch fires (line 1009-1010 `isTargetLockTriggered`) — pushing the trade into TRAILING_TAKE. That IS a phantom promotion. The reverse-split test will catch this.

**Test parameter lock (Langston rev1 §3 add):** to stress phantom-promotion deliberately, the test MUST be parameterized with the jump crossing the target. Specifically: **entry = $50, target = $80, single-bar jump from $50 → $100**. This guarantees the jump traverses target ($80), exercising `isTargetLockTriggered`. Parameters where jump stays under target ($50 → $70) test only the easy path; explicit comment in test header documents this.

### 3.3 Predicted §2.3.3 halt test outcome: **AMBIGUOUS — DEPENDS ON CALLER**

`shouldClosePosition` itself takes `currentPrice` as a parameter — it doesn't read the freshness layer. The freshness layer is checked at the *caller* (paper-execution-engine, VTS runner, etc.). If during a halt, the caller passes the last-known stale price, the stop check fires based on that stale value.

**Three scenarios (Langston rev1 §3 add — post-resume gap is the actually-interesting failure mode):**
1. **Halt → Kraken pauses ticker (no new rows):** caller's lastTick remains the pre-halt price. `currentPrice = lastTick = pre-halt-price`. If pre-halt-price was above stop, stop doesn't fire. If pre-halt-price was already at/below stop, stop already fired before the halt — no incremental damage.
2. **Halt → Kraken streams stale value with advancing `captured_at`:** depending on staleness window, freshness layer may flag stale (and caller skips eval) OR may treat as fresh (and caller proceeds). With xstock_spot freshness window now `_NO_WINDOW = Infinity`, the always-fresh path is in play.
3. **Halt resumes at a gapped price — the genuinely interesting case (Langston rev1 §3.3 add):** ticker freezes 10 min, resumes at a price that gapped down through the stop level (e.g. pre-halt $50, stop $48, news pending halt resolves with re-priced open at $45). Naive TEC fires the stop on what is effectively a re-priced open, not a market drift through the stop. The halt test stresses this with an explicit pre-halt → freeze → post-resume-with-gap-down sequence. The assertion that matters: "did the stop fire on visibility-return as opposed to genuine price movement?" Test scope §2.3.3 already references this in the "on resume, TEC re-evaluates from the new live price not the stale-frozen one" verification language.

**Implication:** §2.3.3 test outcome depends on (a) what Kraken actually does during halts (§2.3.2 schema review), (b) what the caller sites do with stale data, and (c) whether the test reproduces scenario 3 (post-resume-gap) as the load-bearing case. The test design must mock the caller behavior AND drive a price-discontinuity at resume. Likely outcome: scenario 3 exposes a real gap — the always-fresh `_NO_WINDOW` default for xStock provides no protection against post-resume gap-down through stops.

### 3.4 Predicted §2.2 dividend behavior: **EMPIRICAL UNKNOWN**

No code-side hypothesis can prove or refute Kraken's synthetic-dividend handling. Pure data question. Outcome:
- If archive shows regular-quarterly gap-downs aligned with declared dividend amounts → Kraken does NOT credit, Phase D earnings handling needs a 1-2h pre-open block window on ex-dates.
- If archive shows no such gap-downs → Kraken credits synthetic dividends, no handling needed (just documentation).

Without prior empirical evidence, can't predict the direction.

---

## §4 Files identified for audit work (Step 3)

**Audit query scripts (to be authored):**
- `scripts/b-new-42-corp-action-scan.ts` — archive query for §2.1.1 step-change detection.
- `scripts/b-new-42-dividend-gap-scan.ts` — archive query for §2.2.1 ex-dividend gap scanning.
- `scripts/b-new-42-halt-gap-scan.ts` — archive query for §2.3.1 tick-stream gap detection.

**Regression tests:**
- `server/tests/unit/b-new-42-tec-split-resilience.test.ts` (NEW) — forward + reverse split variants.
- `server/tests/unit/b-new-42-tec-halt-resilience.test.ts` (NEW) — 10-minute ticker freeze.

**Audit deliverables:**
- `1-system-manual/audits/b-new-42/corp-actions-scan.csv`
- `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv`
- `1-system-manual/audits/b-new-42/halt-gaps-scan.csv`
- `1-system-manual/audits/b-new-42/audit-report.md` — consolidated findings + Kraken WS schema review verbatim quotes.

**Governance:**
- `1-system-manual/SYSTEM_MANUAL.md` — add "Corporate Actions" + "Trading Halts" subsections.
- `1-system-manual/POST_AUDIT_ROADMAP.md` — if §2.2.3 lands as Phase D dependency, add 1-2h block-window entry.
- `1-system-manual/BATCH_CATALOG.md` + `PHASE_HISTORY.md` — closing entries.
- `.claude/memory/MEMORY.md` (truth file) + repo mirror at `DawnTraderV3/.claude/memory/MEMORY.md` (Langston rev1 §4 add — was listed in scope §5 line 138 but omitted from pre-audit §4 governance list).
- `1-system-manual/CHANGES_AND_FIXES.md` (Langston rev1 §4 add) — **on DIRTY path:** the discovered-gap entry lands under B-NEW-42 closure (the bug is *discovered* by this batch even if it's *fixed* in B-NEW-42b); the fix entry lands under B-NEW-42b at its closure. On CLEAN path: no CHANGES_AND_FIXES touch needed (no defect to record).

**SIM update (this batch's increment) — scope §5 line 136 condition satisfied (Langston rev1 §5 framing):** audit surfaces documented absence of split/halt detectors as missing dependency edges between corp-action awareness and TEC, and between halt-detection and freshness layer. Add a brief "B-NEW-42 — Phase 0 audit findings" section under Recent Additions covering the surfaced gaps (TEC has no split-detector; freshness layer has no halt-detection for xStocks since B-NEW-34 removed the window). **Audit findings only** — fix entries land in B-NEW-42b's SIM increment per scope §5 line 136.

---

## §5 Risk register (Step-2 specific items)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Archive too thin (<14 days) to surface real corp-action event | HIGH | Documentation gap | Regression tests provide coverage the archive can't; flag thinness explicitly in audit report. |
| Kraken WS schema docs silent on `adjustment_factor` | MEDIUM | Open question for A.1 | Acceptable per v2 plan §0 — file open question. |
| §2.1.4 forward-split test fails (predicted) | HIGH | DIRTY verdict → B-NEW-42b spawned | Expected outcome; B-NEW-42b scope template prepared in advance. |
| §2.3.3 halt test outcome ambiguous | MEDIUM | Test design churn | Three test variants matching the three Kraken behaviors (pause / stale-stream / post-resume gap); document all outcomes. |
| Test files break crypto path inadvertently | LOW | CI red | Tests use asset_class='xstock_spot' explicitly; crypto path untouched by mocks. |
| Step 4 Langston review surfaces structural rev | LOW | rev2/rev3 churn | Scope already at rev2 ACK; tests are mechanical against specified assertions. |
| **Test mock fidelity gap (Langston rev1 §5 add)** | MEDIUM | Mocked tests pass while production path still has the bug (classic CLAUDE.md §6 "Trust but verify" failure mode) | Tests invoke the actual exported `updatePosition` + `shouldClosePosition` APIs (not a re-implementation of the state machine); fresh `trailingStates` Map per test; explicit comment in test header confirming no re-implementation. Avoid mocking TEC internals — mock only the upstream config + storage layers (matches B-NEW-40 test pattern). |
| **B-NEW-42b scope-drift risk at Step 4 (Langston rev1 §5 add)** | MEDIUM | Temptation to fold the small fix into B-NEW-42 in place, violating scope §1 line 38 + §2.4 line 84 | Discipline held at Step 4 review; flagged explicitly in pre-audit and scope so the retrofit pressure is documented up front. Langston will hold the line on the fork at Step 4. |
| **Unknown-unknown discovery (Langston rev1 §5 add, optional)** | LOW | Behavior surface area doesn't fit pause/stale/synthetic (halts) or quarterly/special (dividends) | Default response: file as Phase A.1 open question, document in audit report's "Open Questions" section. Explicit intake path in §4 audit deliverable shape. |

---

## §6 Step 2 → Step 3 transition

Pre-audit complete. No SIM gaps requiring blocking action. Sequencing reconciliation documented in §1. Predicted-outcome analysis in §3 sets expectations: **CLEAN-or-DIRTY verdict is the result, not the goal**. The audit's job is to discover; the value of the batch is the discovery itself + the regression-test coverage it leaves behind regardless of verdict.

**Ready to proceed to Step 3 (implementation).** Sub-step order:
1. Author the three archive query scripts.
2. Run them against staging DB; persist CSVs.
3. Hand-review Kraken WS schema docs; persist verbatim quotes in audit report.
4. Author the two TEC regression tests.
5. Run tests locally; capture results.
5b. **Verdict check-in to Langston (Langston rev1 §6 add — optional, parallelization win):** send test results + verdict draft. If §2.1.4 lands DIRTY (HIGH predicted-likelihood), B-NEW-42b scope drafting can start in parallel with B-NEW-42 closure docs, saving ~½ day round-trip. CLEAN path → check-in is a 30-second confirm and (6) proceeds without delay.
6. Author consolidated audit report with gate-decision verdict.

— Claude Code, 2026-05-17
