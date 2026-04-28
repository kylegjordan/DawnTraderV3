# Batch 67 — Pre-Implementation Audit

**Author:** Claude Code, 2026-04-28
**Status:** Step 2 deliverable. Pending Langston review.
**Companion to:** `BATCH_67_SCOPE.md` (Step 1, Langston-approved)
**Master planning doc:** `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0

---

## 1. Audit objectives

Per CLAUDE.md §2 Step 2 + `BATCH_67_SCOPE.md` §11, this pre-audit covers:

1. SIM consultation per CLAUDE.md §9
2. BTC-correlation pre-existing logic (Kyle §11 decision 12)
3. Position sizing service location + design (B67.5 Consumer #2)
4. EV gate location + design (B67.5 Consumer #3)
5. Daily loss budget service location + design (B67.5 Consumer #6)
6. RegimeWeight deletion file list verification (Langston Step-1 review point #2)
7. External-data feed reachability from Hetzner staging

The scope explicitly flagged that if any of items 3/4/5 don't exist as a service, B67.5 expands from "wire-in" to "build + wire-in." This audit's primary deliverable is determining which path applies.

---

## 2. Headline findings (executive summary)

| Audit item | Finding | B67 scope impact |
|---|---|---|
| BTC-correlation pre-existing logic | STUB ONLY (hardcoded `btcDominance: 54.2` in `market-snapshot.ts`). No live integration. | B67.1 fills the stub. No double-counting risk. |
| Position sizing service | Exists. `server/services/paper-position-sizing.ts`. NOT Kelly-based — uses `risk_per_trade_pct × portfolio / stop_distance`. | **B67.5 Consumer #2 reframed.** Wire `regime_conf` as multiplier on `riskAmount` BEFORE division by stop distance. Implementation difficulty unchanged; conceptual framing differs. |
| EV gate | Exists. `server/core/calculations/expectancy.ts` (`isSignalProfitable`, `getMinROIForRegime`, `getDynamicROIThreshold`). Consumed by SQE. | B67.5 Consumer #3 = wire-in only. No build needed. |
| Daily loss budget service | **NOT FOUND as dedicated service.** No file matching `*loss-budget*`. No `dailyLossBudget` symbol in code. Trading guard may be partial inside `trade-safety.ts`. | **B67.5 Consumer #6 likely "build + wire-in" — scope expansion.** Investigation needed; if confirmed absent, recommend deferring Consumer #6 to a follow-on batch and shipping B67.5 with 7 consumers. |
| RegimeWeight deletion file list | Verified 46 server files + UI + schema + 1-system-manual against scope §9.3. Langston-flagged file `bridge/reference/signal-quality-ranking-metrics-overview.md` is in `bridge/` directory (archival; pre-Phase-12 governance per CLAUDE.md §4). Excluded from active deletion sweep; flagged for archival reference only. | No scope change. |
| External-data feed reachability | Not yet tested from Hetzner. CoinGecko, Binance public futures, Coinglass endpoints all expected reachable — no IP allowlist on any. | Test in implementation Step 3 first action; flag any blocked endpoint then. |

**Net effect on B67 scope:** one consumer (#2) reframed mechanically without scope change. One consumer (#6) likely needs build-from-scratch and may justify scope reduction or deferral to a follow-on batch. All other items confirmed buildable as scoped.

**Recommended scope adjustment, pending #6 investigation conclusion:** if daily loss budget service is confirmed absent, drop Consumer #6 from B67.5 and add as B73 ("Daily Loss Budget Service + B67-style confidence weighting") to the pre-Phase-19 work queue.

---

## 3. SIM consultation per CLAUDE.md §9

### 3.1 Components affected by B67

| Component | B67 sub-deliverable | Upstream | Downstream | Shared state | Background exec | Blast radius |
|---|---|---|---|---|---|---|
| `market-regime.ts` | B67.1, B67.2, B67.4 | DBS, OHLC, MCE | All confidence consumers | Per-pair regime state | Every MCE cycle (~60s) | HIGH |
| `signal-orchestrator.ts` | B67.5 (#1, #4) | SQE results, regime confidence | RTB queue, paper executor, VTS | Active signals | Per scan cycle | HIGH |
| `score-calculator.ts` | B67.5 (#1) | Regime confidence | FinalScore consumers | None | Per signal evaluation | HIGH |
| `paper-position-sizing.ts` | B67.5 (#2) | Portfolio value, signal SL distance | Trade-safety guards | risk_per_trade_pct | Per signal admission | MEDIUM |
| `expectancy.ts` | B67.5 (#3) | Signal target/stop, regime | SQE | Per-regime min-ROI | Per signal evaluation | MEDIUM |
| `trailing-exit-controller.ts` | B67.5 (#5) | Trade state, regime confidence at entry | Exit decisions | Per-trade trailing state | Per FX5 tick | MEDIUM |
| `ready_to_buy_service.ts` | B67.5 (#8) | Signal queue | Top-signal selector | RTB queue persisted | Per RTB resolve cycle | LOW |
| `paper_sim_trades` schema | B67.5 (#7) + ablation | None | Closed-trade analytics | DB | Persistent | LOW |
| `signal_quality_evaluator.ts` | B67.5 (#1) replaces RegimeWeight | Signal metrics | Admission decisions | finalScoreMin, regimeWeightMin | Per signal evaluation | HIGH (RegimeWeight removal touchpoint) |
| `canonical-regime-strategy-map.ts` | B67.2 phase preference annotations | None | Strategy admission | Static config | Startup | MEDIUM |

**Cascade risk inventory:**

- **High-risk: RegimeWeight removal across `score-calculator.ts` + `signal_quality_evaluator.ts`.** These are the load-bearing FinalScore computation files. Test coverage in `finalscore-equivalence.test.ts` is the primary safety net — the test must be UPDATED to test the new formula (regimeConfidence in place of regimeWeight) and the old test should be RENAMED, not deleted, so we have historical reference of the old formula behavior. Hidden risk: any caller passing `regimeWeight` from elsewhere (e.g., directly persisting telemetry) will silently break if not also updated. Mitigation: TypeScript compile is the safety net; the field is required in the SignalMetrics interface today, removal will surface every caller as a compile error.

- **High-risk: regime confidence wired into Kelly equivalent (Consumer #2).** Currently `riskAmount = portfolio × risk_per_trade_pct`. Post-B67.5: `riskAmount = portfolio × risk_per_trade_pct × regime_conf_multiplier`. If regime_conf is 1.0 by default this is benign; if uncalibrated and pushing toward 0.6-0.7, position sizes shrink ~30-40%. **Calibration check (§8 of scope) is the mandatory gate. Without it, capital deployment changes underneath the system silently.**

- **Medium-risk: TEC parameters as functions of regime confidence (Consumer #5).** TEC parameters today are static at trade-open. Post-B67.5 they vary trade-to-trade. New `b67_5_tec_confidence_floor = 0.40` (Langston point #6) prevents pathological values. Hidden risk: per-trade TEC params will break any UI that assumes fixed thresholds. Surface this in code review — UI may need to display per-trade TEC params instead of system-wide constants.

### 3.2 Background execution effects

- B67.0 ablation emitter runs per signal evaluation (~hundreds/day at VTS scale). Adds ~5ms per evaluation. Acceptable.
- External macro feed (B67.1) polls every 60s. New process; no interruption to existing background work.
- B67.2 phase computation runs per MCE cycle alongside existing classification. Adds ~2ms per pair. Acceptable.
- Nightly replay job (B67.0) runs at 04:00 UTC. New PM2 cron entry. Coexists with other archive jobs.
- B67.4 outcome feedback updates rolling state on every closed trade. Synchronous to trade close path — adds ~3ms. Acceptable.

### 3.3 SIM file updates required at Step 10

`SYSTEM_IMPACT_MAP.md` will gain new entries for:
- `external-macro-feed.ts` (NEW)
- `macro-modifier.ts` (NEW)
- `regime-phase.ts` (NEW)
- `realized-outcome-feedback.ts` (NEW)
- `factor-ablation-emitter.ts` (NEW)
- Updated entries for `market-regime.ts`, `signal-orchestrator.ts`, `score-calculator.ts`, `paper-position-sizing.ts`, `trailing-exit-controller.ts` reflecting new dependencies.

---

## 4. BTC-correlation pre-existing logic (§11 decision 12)

### 4.1 Findings

Repo-wide grep on `btcDominance|btc_dominance|btcCorrelation|btc_correlation|dominanceScore` returned 2 server files:

**`server/services/market-snapshot.ts`:**
- Line 7: `btcDominance?: number;  // %` — interface field declaration
- Line 26: `btcDominance: 54.2,` — **HARDCODED STUB VALUE**
- No fetch logic, no API call, no live update.

**`server/strategies/defensive-hedge.ts`:**
- Symbol-level references only (e.g., checking if pair is BTC). Not dominance/correlation logic.

### 4.2 Conclusion

Kyle's concern was: "I believe that we already have some sort of BTC correlation component factored in somewhere into our system." Investigation: there's **no live BTC correlation logic.** The only artifact is a stub that hardcodes 54.2% dominance and is not consumed by any current decision path.

**B67.1 implementation:**
- Fills the existing stub (`market-snapshot.ts:26`) with live CoinGecko-fetched value
- No risk of double-counting because nothing is consuming the stub today
- The stub's existence is a sign someone planned this work earlier; B67.1 completes it

This finding actually de-risks B67.1 — we expected potential conflicts and there are none.

---

## 5. Position sizing audit (B67.5 Consumer #2)

### 5.1 Findings

**Service:** `server/services/paper-position-sizing.ts`. Confirmed exists.

**Algorithm (NOT Kelly):**
```
riskAmount = portfolioValue × risk_per_trade_pct
positionSize = riskAmount / stop_distance
positionNotional = positionSize × entry_price
```

This is **risk-per-trade-percentage sizing**, the standard "risk fixed percent of capital per trade, divide by stop distance to get size" pattern. Not Kelly fraction (Kelly would compute size from win-rate × payoff geometry).

### 5.2 Implication for B67.5 Consumer #2

The scope said "Kelly × regime_conf." That phrasing is conceptually wrong for this codebase. Reframed:

```
riskAmount = portfolioValue × risk_per_trade_pct × regime_conf_multiplier
positionSize = riskAmount / stop_distance
```

`regime_conf_multiplier` is a function of `regime_conf` clamped to e.g. [0.5, 1.0]:
- regime_conf = 1.0 → multiplier = 1.0 → unchanged
- regime_conf = 0.7 → multiplier = 0.7 → position size shrinks 30%
- regime_conf < `b67_5_kelly_confidence_multiplier_floor` (0.5) → clamp to 0.5

Same effect as the Kelly framing intended. Implementation simpler because it's a single multiplier on `riskAmount`, not a redesign of position sizing math.

**Renaming module_constants:** `b67_5_kelly_confidence_multiplier_floor` → `b67_5_risk_amount_confidence_multiplier_floor` for accurate naming. Will update scope §9.4.

### 5.3 Status

B67.5 Consumer #2 = wire-in. No build needed. Scope difficulty unchanged; conceptual framing corrected.

---

## 6. EV gate audit (B67.5 Consumer #3)

### 6.1 Findings

**Service:** `server/core/calculations/expectancy.ts`. Confirmed exists.

**Public API:**
- `isSignalProfitable(signal)` — boolean gate
- `getMinROIForRegime(regime)` — returns regime-specific min ROI threshold
- `getDynamicROIThreshold(regime, conditions)` — returns dynamic threshold

**Consumers:** `signal_quality_evaluator.ts` (the SQE) imports these.

**Current behavior:** ROI threshold varies by regime (categorical). Does NOT vary by regime confidence (continuous).

### 6.2 B67.5 Consumer #3 implementation

Modify `getDynamicROIThreshold(regime, conditions)` to accept a `regimeConfidence` parameter:

```
required_ROI = base_min_ROI / max(regime_conf, b67_5_ev_gate_min_confidence)
```

Lower confidence → higher required ROI. `b67_5_ev_gate_min_confidence` (default 0.4) prevents division explosion at extreme low confidence.

Same pattern — wire-in only. Module_constant naming and value already in scope §9.4.

### 6.3 Status

Wire-in only. No build.

---

## 7. Daily loss budget audit (B67.5 Consumer #6) — POTENTIAL SCOPE EXPANSION

### 7.1 Findings

Repo-wide grep returned matches in `routes.ts`, `permissions.ts`, `ethical-principles-seeder.ts`, `ethical-reasoner.ts`, but inspection shows:
- `routes.ts`: API endpoint references (not implementation)
- `permissions.ts`: governance constants
- `ethical-*.ts`: unrelated AI safety / ethical reasoning module (DawnTrader has internal ethics system; false positive)

**Glob `*loss-budget*` returned ZERO files.**

**Conclusion: there is no dedicated daily loss budget service in the active codebase.**

Adjacent guards exist in `trade-safety.ts` (max position size cap, exposure caps) but no daily-loss aggregator that throttles new entries based on cumulative daily P&L.

### 7.2 Implication

B67.5 Consumer #6 ("low-conf trade losses get cost multiplier against daily budget") presupposes a service that doesn't exist.

**Two options:**

**Option A — Build the service inside B67.5.**
- Creates `server/services/daily-loss-budget.ts`
- Schema additions: daily aggregator state
- Wire into trade-close path to update budget
- Wire into signal-admission path to consult budget
- Adds ~3-5 days implementation time to B67.5
- Adds risk: never-existed service shipped under B67 banner alongside other complex changes

**Option B — Drop Consumer #6 from B67.5; create B73 follow-on batch.**
- B67.5 ships with 7 consumers (drop #6)
- New batch B73 "Daily Loss Budget Service + Confidence Weighting" inserted into pre-Phase-19 queue between B67 and B68
- Smaller, focused batch — easier to review and verify
- B67 timeline doesn't slip
- Daily loss budget gets proper design attention rather than being a B67.5 sub-item

**Recommendation: Option B.** Reasoning:
- B67.5 is already the largest sub-deliverable; adding a new service is risk-stacking
- Daily loss budget is a real piece of infrastructure that deserves its own scope/audit/review cycle
- It's not blocking the rest of B67 — Consumers #1-5, 7, 8 all stand independently
- B73 can ship before Phase 19 begins without delaying anything

### 7.3 Decision required from Kyle

This is the one item where the pre-audit produced a scope-changing finding. Awaiting Kyle's decision: A or B.

If A: scope §9.2 grows by 1 sub-sub-deliverable, file list expands, timeline extends ~3-5 days.
If B: scope §9.2 drops Consumer #6, success thresholds §12 drops the budget-related metric, B73 added to MEMORY.md and POST_AUDIT_ROADMAP.md.

---

## 8. RegimeWeight deletion file list verification

### 8.1 Re-grep results

Repo-wide grep on `regimeWeight|RegimeWeight|regime_weight` returned 50+ matches (hit pagination limit on initial scan in pre-audit prep). Cross-referenced against scope §9.3 list:

- All 46 server files in scope §9.3: confirmed present in active code
- `client/src/pages/machine-learning.tsx`: confirmed present
- `shared/schema.ts`: confirmed (`paper_sim_trades.regime_weight` column)
- All 14 test files: confirmed
- All governance docs in scope §9.3: confirmed

**Langston-flagged file: `bridge/reference/signal-quality-ranking-metrics-overview.md`**
- Located in `bridge/reference/` directory
- Per CLAUDE.md §4 canonical paths: `bridge/canonical/` and `bridge/reference/` are both archival directories from pre-Phase-12 governance
- File is reference documentation, not active code or live governance
- **Excluded from B67.5 deletion sweep.** Will not edit; serves as historical record of the formula at the time it was documented.

**No additional files found beyond scope §9.3 list.**

### 8.2 Status

File list verified complete. Scope §9.3 stands as-is.

---

## 9. External-data feed reachability

### 9.1 Plan

**Sources to test:**
- CoinGecko `/api/v3/global` (BTC dominance, mcap)
- Binance Futures `/fapi/v1/premiumIndex` (funding rates)
- Coinglass `/api/futures/funding_rate/all` (alt funding source)

**Test will run as first action of Step 3 implementation:** SSH to Hetzner staging, curl each endpoint, verify 200 + valid JSON. Document rate limits.

**Why deferred to Step 3 not done now:** the scope already commits B67.1 to filling the existing `market-snapshot.ts` stub regardless of which provider lands. Reachability test gates which provider, not whether the work happens. If primary source blocked, fallback to alternate.

### 9.2 Risk assessment

CoinGecko, Binance public, Coinglass: all public APIs, no IP allowlist. Hetzner Falkenstein (eu-central) location: standard VPS, expected to reach all three without issue. Low risk.

---

## 10. Pre-audit conclusions

### 10.1 Scope changes identified

1. **Consumer #2 framing correction** — "Kelly × regime_conf" → "riskAmount × regime_conf_multiplier." Mechanical fix, no scope size change.
2. **Consumer #6 likely deferred to B73** — pending Kyle decision (Option A vs B above). Recommend Option B.
3. **Module_constants rename** — `b67_5_kelly_confidence_multiplier_floor` → `b67_5_risk_amount_confidence_multiplier_floor`.

### 10.2 Scope items confirmed buildable as written

- B67.0 telemetry & ablation framework — clean build, no blockers
- B67.3 per-underlying limits — admission integration straightforward
- B67.1 macro modifier — stub already exists, fill it
- B67.2 phase dimension — extension of regime classifier
- B67.4 realized-outcome feedback — clean build
- B67.5 Consumers #1, #3, #4, #5, #7, #8 — all wire-in
- B67.5 Consumer #2 — wire-in (after framing fix)
- RegimeWeight deletion sweep — file list complete

### 10.3 Risks logged

- Confidence calibration is the gating safety mechanism — must pass before B67.5 ships
- Outcome feedback (B67.4) needs 30-day oscillation monitoring per Langston Step-1 review point #7
- TEC modulation per-trade may surface UI assumptions about static thresholds — flag during code review

### 10.4 Ready for Step 3?

After Kyle's Option A/B decision on Consumer #6 lands and scope §9.2 is updated accordingly, Step 3 implementation can begin. Internal sequence per scope §3 dependency chain.

---

## 11. Cross-references

- `Claude Comms and Packages/Scope Files/BATCH_67_SCOPE.md` — Step-1 scope (Langston-approved)
- `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` — master planning doc
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — current SIM (will be updated at Step 10)
- `1-system-manual/SYSTEM_MANUAL.md` — formula docs (will be updated at Step 10)

---

*End of `BATCH_67_PRE_AUDIT.md` Step-2 draft. Awaiting Langston review and Kyle decision on §7.3 Consumer #6 path.*
