# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 250 lines.

---

## READ FIRST ON SESSION START

1. **This memory file** — current state, in-progress work, known issues (below)
2. ⭐ **NEXT WORK = B67.1 + B67.2 (deploy together per scope §3).** B67.0 + B67.3 both closed 2026-04-28. Remaining: B67.1 macro confidence modifier (BTC dominance + funding + mcap) + B67.2 phase dimension (EARLY/PRIME/LATE on existing 5 regimes). Both modulate the regime classifier's confidence number. Ship together because they share the calibration check (gating event) downstream. Read in order:
   - `Claude Comms and Packages/Scope Files/BATCH_67_SCOPE.md` §6 (B67.1) + §7 (B67.2)
   - `Claude Comms and Packages/Scope Files/BATCH_67_PRE_AUDIT.md` (V2, SIM consultation)
   - `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 (master decisions)
   - `Claude Comms and Packages/Batch Completion/BATCH_67_PROGRESS_REPORT.md` (open; B67.0 + B67.3 closed)
   - **B67.3 follow-up before activation:** small wire-in to persist `pair_id_hash` to `paper_sim_trades` row at trade-open. Required before flipping `b67_3_enabled=true` so end-of-observation cohort comparison has the data.
3. `DawnTraderV3/1-system-manual/POST_AUDIT_ROADMAP.md` — Phase 15c sequencing
4. `DawnTraderV3/Claude Comms and Packages/Scope Files/POST_B62_PRE_LAUNCH_PLAN.md` — batches queued
5. `DawnTraderV3/Claude Comms and Packages/Scope Files/MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` — architectural reference

---

## Kyle's preferred report formats

**Ladder counterfactual report** (when Kyle asks for it ad-hoc or weekly during Phase 19 observation): use the two-table format from `B65_4_1_LADDER_TABLE_2026_04_28.md` — the format Kyle confirmed 2026-04-28 as the canonical template.

Table 1 (percent-format):
| Pair | Entry | Orig Stop | Orig Target | Final Stop (exit) | Final Rung Target | Rungs | Actual Net | Counterfactual @ Orig Target | Ladder Δ |

Table 2 (dollar-format):
| Pair | Actual $ | Counterfactual @ Orig Target $ | $ Δ |
+ TOTAL row at the bottom

Counterfactual = `((Orig Target − Entry) / Entry × 100) − cost_pct`. Ladder Δ = Actual − Counterfactual. Original stops are pulled from PM2 entry log lines (`[11.8C][Entry] {pair} opened @ {entry} | stop={origStop}`) — the closed-trade CSV only stores the final ratcheted stop, not the original. Once B65.4.2 ships (CSV column additions for `original_stop_price`, `latch_trigger_price`, `rung_target_history`), original stop becomes a column read instead of a log grep.

## Kyle Operating Directives (active)

- **Don't pause to ask permission during workflow execution.** Once Kyle says "proceed with Bxx using the batch workflow," iterate with Langston through all 11 phases until closed. Only stop for deadlocks, architectural decisions Kyle explicitly owns, risk/authority-boundary issues, or new-directive needs.
- **Code-level explanations in simple language when asked.**
- **VTS broadness is the design.** Don't propose changes that narrow VTS admission. Per-underlying limits are paper-only with VTS bypass.
- **Modularization matters because of asset class + exchange + filter expansion.** 5D matrix: `(exchange, asset_class, filter, strategy, regime)`. Not just iteration speed.
- **NO WORKAROUNDS.** If something's broken, fix it properly. Don't ship workarounds — they compound.
- **No new TypeScript errors.** Legacy errors go to Phase 16. New code should not add to the count.

---

## Session Behavior Invariants

- **Iterate with Langston to consensus; don't escalate every response to Kyle.** CLAUDE.md §6.
- **Telegram multi-line:** /tmp file → scp to 204.168.141.77 → MSG=$(cat)+openclaw. CLAUDE.md §6.
- **Kyle prefers replies in Claude Code Desktop app** unless he explicitly asks for Telegram DM.
- **VTS position sizing uses nominal $1000 base** producing ~$150/trade. Intentional — NOT a bug.
- **GitHub PAT renewed 2026-04-21**, expires 2026-05-21.

---

## Current State (2026-04-28 post-B67.3 ship)

- **Branch:** `migration/aws-supabase`
- **HEAD commit:** `ca0e2c2d` (B67.3 — Per-underlying position limits, shadow mode). Prior B67 chain: `fde70550` (B67.0 governance) → `105d2b53` (B67.0 impl).
- **Staging:** PM2 restart #102 at 2026-04-28 ~19:25 UTC post-B67.3 deploy. HTTP 200. Migration `2026-04-28-b67-3-per-underlying-cap-pair-hash.sql` applied cleanly. Zero `[B67.3]` errors in PM2 logs (gate not yet exercising — VTS reports "No pairs available" because active trading is STOPPED).
- **Langston brain (topic-21):** Opus 4.6, **session reset 2026-04-28 ~15:30 UTC** (old session `ba777106-...` overflowed past 200K, downgraded to gpt-4.1-mini). New session UUID `16b70816-c63d-4cf0-8c80-bebd9f2cf066`. Confirmed via transcript metadata: `provider:anthropic, model:claude-opus-4-6`. Cost ~$0.05/turn. Note: telegram group sessions cap at 200K context (1M override never installed); plan periodic resets every ~2-3 weeks OR install 1M override per CLAUDE.md §8.
- **Comms protocol fix 2026-04-28:** every CC message must go through BOTH `openclaw message send --channel telegram` (Kyle visibility) AND `openclaw agent --deliver` (Langston processing). Earlier in session I missed step 1 on multiple messages — Kyle didn't see them; only saw Langston's replies. Fixed.
- **B67.3 ✅ CLOSED 2026-04-28 (shadow mode at deploy)** (commit `ca0e2c2d`, PM2 #102). Sub-deliverable 2 of 6 in B67. Per-underlying position cap admission gate. New `per-underlying-cap.ts` service (cohort assignment via FNV-1a 32-bit hash on symbol; cohort 0 = treatment, cohort 1 = control). New `PER_UNDERLYING_CAP` rejection reason. `paper_sim_trades.pair_id_hash` integer column added. 3 module_constants seeds (`b67_3_enabled=false` shadow at deploy, cap=2, split=true). Wire-in: signal-orchestrator (active path, before RTB queue) + vts-runner (VTS-mirror, after MAX_OPEN_TRADES). paper-execution NOT gated (signals filter at signal-orchestrator first; redundant gate would risk consistency drift). Langston Step-4 approved (cc-inbox #841). Step-7 verification clean. Activation plan: shadow → wire pair_id_hash trade-open persistence (small follow-up) → flip `b67_3_enabled=true` via module_constants → 14-day A/B observation → cohort comparison decides keep-cap vs deactivate.
- **B67.0 ✅ CLOSED 2026-04-28** (impl `105d2b53` + governance `fde70550`, PM2 #101). First sub-deliverable. Built: `regime_factor_alternates` DB table (XOR-discriminated source), fire-and-forget `factor-ablation-emitter.ts` wired into signal-orchestrator + vts-runner with empty alternates today (B67.1+ producers populate), nightly `replay-ablation.ts` (skeleton + retention sweep), new `AblationComparisonSection` UI panel in Drift Dashboard tab with empty-state explainer, `GET /api/analytics/ablation-comparison` endpoint. Langston Step-1 + Step-2 V2 + Step-4 ×3 chunks all approved. Step-7 CC verification clean. Step-8 SKIPPED per Kyle directive; UI verified by Kyle screenshot. Progress report at `BATCH_67_PROGRESS_REPORT.md` stays OPEN until all 6 close.
- **B67 expanded scope:** original "External Data Context Layer Phase 1" (single-workstream queued slot) → 6-sub-deliverable coordinated batch per master planning doc 2026-04-27. Sequence: B67.0 ✅ → B67.3 (per-underlying limits, deploys first, no confidence dependency) → B67.1 + B67.2 (macro modifier + phase dimension EARLY/PRIME/LATE) → calibration check (tertile-monotonic ≥7pp) → B67.5 (wire confidence into 7 consumers, sourcePool gate on Consumer #5; Consumer #6 deferred to Phase 19.4.5 item 9 BLOCKING for live) → B67.4 (realized-outcome feedback). ~3-4 weeks total.
- **Independent safety gap:** kill-switch `dailyLossKillSwitchPct` (10% per UI) is configured but no auto-trip code exists; `tripKillSwitch()` only called manually. Logged as `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 9 marked **BLOCKING for live activation**. Independent of B67.
- **B63:** ✅ CLOSED 2026-04-25; **Item 13 verdict REFRAMED 2026-04-26 from BUILD_DEDICATED → INCONCLUSIVE** based on B65.5 Phase A0 findings (cohort metrics confounded by 04-22 hostile-window). Original closure stands; addendum at BATCH_63_COMPLETION_REPORT §12. Follow-on: TBD-numbered future batch to re-evaluate post-Phase-19.
- **B65.5:** ✅ CLOSED 2026-04-26 via SKIP route. Phase A0 returned decisive evidence cohort was window-confounded; routing decision SKIP A/B/C/D, defer to Phase 19.5 AMR. No code change. vwap_pullback stays in strong-trend lane. Recurrence finding: 04-22 is 2nd instance of 04-18 pattern (globalRegime=TFS while market disagreed catastrophically) — strengthens AMR case.
- **B64b status:** CLOSED 2026-04-23.
- **B65.1 status:** FULLY CLOSED — infrastructure deployed, all follow-up bugs fixed, proper migration runner in place.
- **B65.2 status (plumbing, `dd1f5372`):** SUPERSEDED. Kyle flagged it shipped plumbing without functionality.
- **B65.4 status:** ✅ CLOSED 2026-04-26 with Langston Step-8 sign-off (cc-inbox #825). First live ladder event 2026-04-26 02:11:59 UTC on 2Z/USD (rung=1 ratchet). Engine verified via PM2 logs + persistence file. **Punch-list item:** `/api/vts/ml/open` endpoint returns 0 trades — needs read-only wiring. Small follow-up batch / hotfix scope.
- **B65.4.1 verification 2026-04-28** (`B65_4_1_LADDER_TABLE_2026_04_28.md` + `B65_4_1_HOTFIX_VERIFICATION_2026_04_28.md`): hotfix formula confirmed working on post-deploy clean cases (4 trades aggregate −3.98pp, ~break-even vs counterfactual). 17-trade total still net-negative (−59.89pp aggregate). Anomaly rows (8 of 17) concentrated on illiquid pairs where slippage swallows the buffer. Conclusion: hotfix is doing what it was designed to do; ladder is calibration on top of upstream entry-quality problem. Broader 7-day cohort (1,136 trades) net is **−$1,187** with 74% of exits at BE-stop / SL / trailing-stop — the dominant problem is upstream signal quality, B67 macro modifier is the priority lever.
- **NEW deferred decision (Kyle directive 2026-04-28):** exclude low-volume pairs from moonbag eligibility? Tracked in `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 8. Decision deferred to let observation data accumulate; the longer the ladder runs on illiquid pairs, the easier the call becomes. Implementation if approved: `moonbag_min_volume_24h_usd` module_constants entry, check in `isMoonbagQualifier`. ~1-2 days work.
- **B65.4.2 SHIPPED 2026-04-28** (commits `db7cbcfb` main + `e9abe8fd` HF1 for `decimal` vs `numeric` build error). PM2 restart #100. CSV export columns for ladder mechanics observability + folds in B65.4 open-trades API punch-list. New TrailingState fields: `originalStopPrice` (captured at init), `latchTriggerPrice` (captured at first target latch), `rungTargetHistory[]` (appended at each ratchet). Propagated through engine → evaluator → caller chain. New `paper_sim_trades` columns: `original_stop_price`, `latch_trigger_price`, `rung_target_history`. Migration `2026-04-28-b65-4-2-ladder-observability-columns.sql`. Both open + closed CSV exports + `/api/vts/ml/open` endpoint serializer now include the 3 fields. Backward-compat: `importStates` migration sets `rungTargetHistory: []` for pre-B65.4.2 persisted states; `originalStopPrice` and `latchTriggerPrice` remain undefined for migrated states (cannot reconstruct from old persistence). New trades initialized post-deploy will have all 3 fields populated. Updated `b65-tec-parity.test.ts` Scenario 19 with backward-compat assertions for the new fields.
- **B65.4.1 HOTFIX SHIPPED 2026-04-26.** Counterfactual analysis (`B65_4_LADDER_COUNTERFACTUAL_ANALYSIS.md`) revealed the original rung-floor formula was destroying ~$11 across the first 5 closed laddered trades vs just-take-target counterfactual. Original `target * (1 - totalCost/2)` (floor below target) replaced with `target * (1 + slippage * bufferMultiplier)` (floor above target). New `module_constants` entry `rung_floor_slippage_buffer_multiplier` (seed 1.0). Migration `2026-04-26-b65-4-1-rung-floor-buffer-seed.sql`. **Reporting instructions for ad-hoc re-runs** of the counterfactual analysis preserved at `BATCH_65_4_1_HOTFIX_COMPLETION.md` §5 — run weekly during Phase 19 observation per Phase 19.4.5 item 7. Per Kyle directive 2026-04-26: ship straight away, no Step-1 review; Langston post-push heads-up only.
- **REGIME OVERHAUL + EXTERNAL DATA — MASTER PLAN (2026-04-27):** Master planning doc at ⭐ `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` ⭐ captures the full conversation between CC + Langston about external data integration, regime classifier improvements, and material-improvement levers. **REQUIRED PRE-WORK before any B67-related implementation.** Key positions, in plain summary form:
  - **Architecture:** Langston's "confidence modifier on classifier output" approach is recommended (external data modulates the classifier's confidence number, not the regime label). CC withdrew the original "alongside the classifier" proposal.
  - **Missing regimes:** Langston's phase dimension (EARLY/MATURE/LATE on existing 5 regimes, 2h/12h boundaries) is recommended over adding new top-level regimes. CC withdrew the new-regimes proposal.
  - **Coordinated batch:** B67 expands to 5 sub-deliverables: B67.1 macro confidence modifier, B67.2 phase dimension, B67.3 per-underlying position limits (promote from POST_B62 Item 4 paper-only to general), B67.4 realized-outcome feedback, B67.5 Path B sustainability tightening (folds in deferred B65.6 work). ~3-4 weeks total.
  - **Two material levers CC missed (Langston added):** per-underlying position limits (3-5pp hostile-day risk reduction), realized-outcome feedback into classifier confidence (2-4pp).
  - **ML-light pre-launch viable:** logistic regression on classifier inputs predicting "is this classification wrong?" Trained on 30d VTS data. ~2-3 days. Phase 19.4 candidate.
  - **Combined realistic estimate:** 10-20pp WR improvement on currently-failing cohorts; 3-5pp overall.
  - **Honest classifier rating:** medium-low overall. B62 DBS integration was a real success and CC undersold it (pre-B62 70.2% drift contamination → 0%). Top failure modes: Path B over-firing, no multi-TF agreement, no volume regime, no macro context, no pair-correlation context, no regime-age tracking, no transition-freshness state, confidence number underused.
  - **12 decisions queued for Kyle in §11 of the planning doc.** Architecture, sequencing, scope, validation, pre-implementation audit categories. These are the gating event for writing `BATCH_67_SCOPE.md`.
  - Compaction-resilient: planning doc is the recovery point if context is lost.

- **Phase 19.0 NEW (added 2026-04-26, renumbered same-day from 18.5):** VTS Partition + Exchange-Data Adapter. Sits at the very START of Phase 19, before 19.1 Paper Trading Run. Reasons: (a) Phase 19 will start-stop the active-trading engine repeatedly, interrupting VTS data accumulation if VTS shares the trading process; (b) two of Phase 21.4's 8 canonical modules (Exchange Adapter, Filter Module Family) land pre-launch on the low-risk VTS surface as a modularization preview. Sub-phases: 19.0.1 Symbol Normalizer Service (Kraken→Binance/Coinbase/KuCoin mapping), 19.0.2 Exchange-Data Adapter Layer, 19.0.3 VTS Process Partition (own PM2 process, own FX5 instance), 19.0.4 Coverage diagnostics. Combined Binance + Coinbase + KuCoin = ~95% Kraken pair coverage at $0/month. Per `INDEPENDENT_VTS_DATA_FEED_FEASIBILITY.md` (updated 2026-04-26 with combined-coverage figure correction). Effort: 1-2 weeks. **Note (Kyle directive 2026-04-26): cannot use "Phase 18.5" — Phase 18 is ML/post-launch.**
- **Phase 19.4.5 Observational Decision Gate (NEW 2026-04-26):** Inserted in roadmap between SQE recalibration (19.4) and AMR (19.5). Uses 1-2 weeks of clean active-paper-trading data to decide whether AMR / XStocks+Perp Futures / Modularization / ML need to move pre-launch based on 6 observation items (hostile-window recurrence, signal volume, classifier misclassification visible in active trading, hardcoded-constants pain, modularization friction, ML data sufficiency). References B65.6 findings paper as canonical pre-Phase-19 reference. Decision-making principle: prefer NOT to build pre-launch fixes that AMR will likely replace.

- **B65.2 status (functional, `0fcd19b1` + HF1 `806effc0` + HF2 `48e830c4` + HF2b `98705e8e` + HF2c `aa7d9bb1` + HF3 `def5ec68` + governance commit pending):** SHIPPED through HF3 by 2026-04-24. PM2 restart #96. Trailing engine wired into both VTS and paper exit loops. Phase-11 TEC deleted. HF2/2b/2c closed Step-7 verification gap on the VTS Machine Learning page (TEC State column on Open + Closed Simulated Trades). HF3 distinguished `break_even_stop` from `trailing_stop_hit` — Kyle CSV review caught that 49 BE-lock-stop exits were being mislabeled as moonbag trailing closes. Real moonbag runners produce +$2.68 mean net profit (5 in window); BE-lock protective exits produce +$0.09 mean (49 in window). Different things, now correctly badged in UI ("BE PROTECT" slate vs. "TRAIL STOP" emerald).

- **Adaptive Market Response framework (2026-04-25):** Captured the multi-batch arc (B59 onwards) recognizing that VTS streaks are market-condition-driven, not strategy-quality-driven. Existing mode overlay (Directive 11.7S in `server/core/governance/strategy-modes.ts`) is the defensive-only skeleton; expansion needed for offensive mode + richer detection signal + tunable multipliers. **Concept document filed at `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`.** Roadmap updated with conditional Phase 19.5 (between Phase 19 paper audit and Phase 20 production hardening). Decision gate at end of paper audit: build or defer to post-launch based on whether streak phenomenon materializes at active-trading scale.
- **B65.3 reframed (2026-04-25):** original scope (migrate paper metadata percentage-trailing → ATR TEC) is MOOT — paper-execution-engine.ts no longer consumes `trailingStopPercent` for exit decisions (B65.2 functional ship deleted that path). Only residual reference is one `highWaterMark` write at trade-open (line 1929) for legacy dashboards, explicitly commented as not consumed. **B65.3 folded into Phase 19** as live-paper-trading verification of the ladder + break-even + cost-aware floor under active trading conditions. tec-evaluator.ts comment about "future B65.3 sub-batch" is stale — to be updated.
- **Future flag (Kyle directive 2026-04-26):** if B65.5 Phase A0 finds the 57-trade vwap_pullback cohort ran in universally hostile windows (sibling-strategy WR ≤ 30%), open a SEPARATE future batch (post-B65.5) to re-evaluate the B63 Item 13 BUILD_DEDICATED verdict in light of conditions. The verdict may need reconsideration if the cohort metrics reflect window quality rather than strategy quality. Do not roll this into B65.5 — it's its own batch.
- **B65.5 closed 2026-04-26 via SKIP** — full closure described in current-state block above. Did NOT need to renumber. Phase A0 was sole deliverable.
- **Regime classifier investigation 2026-04-26** (`REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md`): traced Kyle's "globalRegime says one thing while trades show otherwise" question to its root. globalRegime aggregation is NOT a bug — it correctly returns the most-common per-pair regime. The actual issue is the per-pair classifier's TFS branch in `server/core/metrics/market-regime.ts:157` — fires on `|DBS| >= 0.30` ALONE (no sustainability check), trivially true on strong-direction days. Tuned for flicker stability (2% ceiling), not outcome alignment. On 04-22, TFS-classified pairs (the most confident "stable trend" tag) had 13.8% WR (n=195); STRUCTURAL_TRANSITION-classified pairs (least confident) had 83.3% WR (n=6) — inverted from outcome.
- **B65.6 CLOSED 2026-04-26 via SKIP** per Kyle directive. Per-pair regime classifier audit completed Phase A across 7 analysis tracks. Findings: cross-pair concentration is trend-rider-protection signal (catches 04-22, not 04-18); winners-have-momentum pattern is hostile-day-specific (zero clean-day separation); Option C combined-rule sweep rejected due to 50-79% clean-day winner blocking at every threshold; B62 was deployed 2026-04-16 morning UTC (04-18 was already post-B62, two-flavor finding holds apples-to-apples). No code change shipped; vwap_pullback stays in strong-trend lane; Path B unchanged. Canonical findings: `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md`. Per-pair fix deferred to **Phase 19.4.5 Observational Decision Gate** (NEW, inserted in roadmap between SQE recalibration and AMR).
- **Phase 21.4 Modularization (post-live, refined 2026-04-26):** retains 8-module architectural extraction work only. **Comprehensive lever-to-`module_constants` migration MOVES TO B72 PRE-LAUNCH** per Kyle directive 2026-04-26. Original go-live design intent: every lever must be DB-tunable before live trading.
- **B72 NEW PRE-LAUNCH (2026-04-26):** comprehensive lever-to-`module_constants` sweep. Final pre-Phase-19 batch. Runs after B65.6 / B67 / B68 / B69 / B70 close so it sweeps any new constants those batches added plus Item 15's 51 static + 18 adaptive levers. Goal: every threshold/weight/multiplier/limit DB-tunable before live trading. Inline migration during pre-live batches continues; B72 is comprehensive backstop, not a license to defer. Sub-deliverable: `LEVER_INVENTORY.md`.
- **B63 audit findings spot-check (2026-04-26 + post-B62 correction same-day):**
  - **Initial run included pre-B62 data. Kyle flagged 2026-04-26: 04-18 ran the pre-B62 classifier (B62 Phase 1 commit `b2a446a7` on 04-16, closed 04-19). All current-classifier analyses must restrict to post-B62 data: 2026-04-20 onward, POST_B62_CUTOFF_MS=1776643200000.**
  - Re-run on post-B62 only (740 trades vs original 2209):
    - **Item 18 FinalScore anti-predictive: STRONGER on post-B62 (r=−0.14 full vs original claim r=−0.017). Holds on CLEAN days too (r=−0.057). Direction is robust; magnitude needs re-validation with sibling controls. Phase 19.4 work on this is warranted.**
    - **Item 18 source-pool: INVERTED from current truth.** quant-strong_trend = WORST pool on post-B62 (28.3% WR / −$7.08 net). Pattern pool leads (57.1% WR / +$0.26). Discard the "only quant-strong_trend net-profitable" claim.
    - Item 15 ExpectedEdge r=−0.130: does not replicate on post-B62 (full r=+0.008).
    - Item 15 PredConf: mild signal at design level (post-B62 r=−0.097 full).
    - Item 19 batch correlation 87.8%: reproduces lower (~72% on post-B62), hostile-amplification holds. Reinterpretation as "global state dominance" stands.
  - **04-22 stands alone as canonical post-B62 hostile-day evidence point.** 04-18 retained in AMR concept doc as historical pre-B62 context, NOT as a current-classifier evidence point.
  - Full addendum at `REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md` §11 (initial) + §12 (post-B62 correction). Triggered by B63 Item 13 preliminary BUILD_DEDICATED verdict on vwap_pullback (57 trades, 21.1% WR, sumR -28.99 at 2.85x min sample — well below KEEP/TUNE thresholds). Approach: (1) analyze 57-trade failure cohort, pattern-match losers (real pullback or noise the detector mistook?), (2) form hypothesis on filter/detector change excluding bad ones while preserving 12 winners, (3) backtest hypothesis against historical OHLC, (4) deploy behind A/B observation flag if backtest favorable. Realistic timeline 1-2 weeks analysis + iteration. Outcome: BUILD new `strong_bull_pullback` OR DROP vwap_pullback from strong-trend lane (let `strong_bull_trend` carry it alone).
- **B71 (regime drift dashboard) DONE:** Verified live in staging UI 2026-04-25 — Analytics & Diagnostics → Drift Dashboard tab renders Rolling 24h/7d/30d/Since-last-restart toggles, summary cards, regime distribution, regime integrity (B62-style), DBS category distribution, Global DBS live snapshot. Crossed off the queue.
- **B66 SQE workstream:** moved to Phase 19.4. Original B66 archiving/dashboard work split: drift dashboard done (above), data archiving lives in B70.
- **B63 Item 13:** ✅ CLOSED 2026-04-25 — verdict BUILD_DEDICATED. Closed early by Kyle directive after statistical certainty at 2.85× min sample. B65.5 research-then-design is the follow-on action and is the next active piece of work.

---

## Closed pre-Phase-16 work

| Batch | Closure date | Core scope |
|---|---|---|
| B63 | 2026-04-25 (Item 13 reframed 04-26 → INCONCLUSIVE) | Strong Bull Trend strategy + DBS pre-filter + 19-item audit set |
| B64a | 2026-04-22 | Drift Dashboard tab MVP |
| B64b | 2026-04-23 | Canonical map sync + IE metrics + MAX_HOLD_MS restoration |
| B65.1 | 2026-04-23 | module_constants table + schema additions (exchange, asset_class, base_currency) |
| B65.2 (functional) | 2026-04-24 + HF1-HF3 | TEC engine engaged in VTS + paper; Phase-11 TEC deleted; UI TEC State column |
| B65.3 | 2026-04-25 (FOLDED to Phase 19.3.5) | Original "migrate paper percentage-trailing → ATR TEC" was moot; verification work folded into Phase 19 |
| B65.4 | 2026-04-26 (Step-8 sign-off) + HF1 | Ladder trailing model (rung ratchet on stop AND target) |
| B65.4.1 | 2026-04-26 | Hotfix: rung floor ABOVE target with slippage buffer (was below); module_constants entry |
| B65.5 | 2026-04-26 (CLOSED via SKIP) | Strong Bull Pullback research — Phase A0 routed SKIP; vwap_pullback stays in lane |
| B65.6 | 2026-04-26 (CLOSED via DEFER) | Per-pair classifier audit — multiple options tested; Kyle directive to defer per-pair fix and observe under paper trading |
| B66 | RETIRED 2026-04-25 | Original scope split: SQE → Phase 19.4, archiving → B70, drift dashboard → B71 (delivered as B64a + B64b) |
| B71 | 2026-04-25 | Regime & Strategy Drift Dashboard tab — verified live in UI |

## ⭐ Pre-Phase-16 batches REMAINING (work queue)

These are the batches that need to land BEFORE Phase 19 paper mode audit. Coordinated regime overhaul (B67) is the priority post-compaction; everything else queues behind it.

| # | Batch | Status | Plain-language description |
|---|---|---|---|
| 1 | **B67 — Coordinated Regime Overhaul** | ⭐ IN PROGRESS — B67.0 closed 2026-04-28; **B67.3 NEXT (deploys first per scope §3, no confidence dependency = safety net)**. Then B67.1+B67.2 → calibration check → B67.5 (sourcePool gate on Consumer #5; Consumer #6 deferred to Phase 19.4.5 item 9 BLOCKING for live) → B67.4. Phase dimension naming locked as EARLY/PRIME/LATE (was MATURE). Master planning doc §0 has all 12 §11 decisions resolved. Progress report `BATCH_67_PROGRESS_REPORT.md` open. ~3-4 weeks total. Expected impact: 10-20pp WR on currently-failing cohorts, 3-5pp overall. |
| 2 | **B68 — External Data Phase 2 (Tier-2)** | Conditional on B67 success | Exchange flows (BTC/ETH on-chain), liquidation cascades, DXY, SPX cross-asset. Conditional — only proceeds if B67 shows measurable lift on existing-strategy WR. ~2-3 weeks. |
| 3 | **B69 — Asset class field + standardized schema** | Pending | Adds `assetClass` enum across all signal/trade tables. Standardizes displayed = captured = archived fields. Prerequisite for equity/FX expansion (XStocks in Phase 21.5) and asset-class-specific external data routing. 1 batch. |
| 4 | **B70 — Data archiving update** | Pending | Unified archiver across VTS/Paper/Live with same schema. Pair-level scan capture (every FX5 evaluation, survivor and rejection — enables ML counterfactuals). OHLC snapshot persistence (per pair per hour, deduped, indefinite retention — Olympic blood-sample principle). Option B retroactive B62 re-labeling (~10-15k pre-B62 trades upgraded to B62-compatible training data). ~40 GB/year storage budget. 1-2 batches. |
| 5 | **B72 — Comprehensive lever-to-`module_constants` sweep** | Pending | Final pre-Phase-19 batch. Sweeps every hardcoded threshold/weight/multiplier/limit in active codebase to `module_constants` with most-specific-wins resolution scope. Goal: every lever DB-tunable before live trading per original go-live design intent. Item 15's 51 static + 18 adaptive levers + any added by B67/B68/B69/B70. Sub-deliverable: `LEVER_INVENTORY.md`. ~1-2 weeks. |
| 6 | **PUNCH-LIST: `/api/vts/ml/open` endpoint wiring** | Hotfix-scope, can land between batches | Endpoint returns 0 trades despite open positions in in-memory `openVirtualTrades` map. Known gap from B65.2 pre-audit §9 risk 1; surfaced again in B65.4 Step-8 verification. Read-only endpoint that serializes the map for UI consumption. ~1-2 days. Not blocking but worth landing soon for observation visibility. |
| 7 | **Future TBD-numbered batch — B63 Item 13 re-evaluation** | Post-Phase-19 paper audit | Re-evaluate vwap_pullback-in-strong-trend-lane verdict with cleaner cohort data + sibling-strategy WR controls in threshold definition. Earliest viable: post-Phase-19 paper audit when active-trading data is available. |

**Sequence after B67 closes:** B68 (conditional) || B69 in parallel → B70 → B72 (the comprehensive sweep, runs LAST so it captures everything) → Phase 19 (Paper Mode Audit). If B68 stays conditional and is deferred, sequence is B67 → B69 → B70 → B72 → Phase 19.

## ⭐ Phase 19 expanded sub-steps (paper mode audit gating phase)

Phase 19 has grown beyond its original three-step shape (Run / Audit / Performance Validation). Current expanded structure:

| Sub-phase | Title | Origin | Plain-language description |
|---|---|---|---|
| **19.0** | **VTS Partition + Exchange-Data Adapter** | NEW 2026-04-26 (Kyle directive 2026-04-26: phase number raised from "18.5" because Phase 18 is ML/post-launch) | First thing in Phase 19. Partitions VTS into its own PM2 process (`dawntrader-vts`) with own FX5 instance and own data feed (Binance + Coinbase + KuCoin combined ~95% Kraken coverage at $0/month). Reasons: (a) Phase 19 will start-stop the active-trading engine repeatedly during audit work, breaking VTS data continuity if VTS shares the process; (b) two of Phase 21.4 Modularization's 8 canonical modules (Exchange Adapter, Filter Module Family) land pre-launch on the low-risk VTS surface as a modularization preview. Sub-deliverables: 19.0.1 Symbol Normalizer Service, 19.0.2 Exchange-Data Adapter Layer, 19.0.3 VTS Process Partition, 19.0.4 Coverage diagnostics. ~1-2 weeks. |
| 19.1 | Paper Trading Run | Original | Run extended paper trading with the full system: 17+ strategies, MCE, VTS, Predictive Execution, ML (or shadow mode), Structural Regime, Directional Bias, Friction. |
| 19.2 | Audit & Debug | Original | Verify FinalScore / Hybrid Score / Confidence / Regime Weight all calculate correctly, Directional Bias feeds strategy selection, predictive adjustments are bounded, kill switch + guardrails fire under all conditions. Fix all discovered issues. |
| 19.3 | Performance Validation | Original | Compare paper results to expectations, validate strategy performance across regimes, confirm learning systems are improving signal quality, validate data retention + archiving. |
| **19.3.5** | **Trailing-exit live verification** | NEW 2026-04-25 (folded-in B65.3 scope) | Live verification under active paper trading that the ATR TEC service + B65.4 ladder + B65.4.1 cost-aware floor produce the expected behavior. Pass criteria: at least one closed paper trade per scenario (BE lock fires at +1×ATR; target lock fires at first rung; ladder rung ratchet advances on each rung hit; cost-aware floor holds even on volatile pairs; persistence across PM2 restarts works). Reflects in UI Closed Sim Trades with correct TEC State badge. |
| 19.4 | SQE Recalibration (was B66) | Moved 2026-04-25 | Conditional on what paper-mode evidence shows. Original B66 scope: 6 SQE formula constant promotions, PredConf rolling window, per-underlying position limits, realized-EV-adaptive floor, rankingScore logging. NOTE: B67 will likely absorb several of these (per-underlying limits = B67.3, realized-outcome feedback = B67.4); whatever's left after B67 is what 19.4 actually does. **Methodology requirement (added 2026-04-26):** any cohort-based metric must include sibling-strategy WR control. Item 18 SQE audit findings flagged for re-validation before any threshold/formula change ships. |
| **19.4.5** | **Observational Decision Gate** | NEW 2026-04-26 | 1-2 weeks of clean active-paper-trading data used to decide whether AMR / XStocks+PerpFutures / Modularization / ML need to move pre-launch. **7 observation items:** (1) hostile-window recurrence, (2) signal volume, (3) classifier misclassification visible in active trading, (4) hardcoded-constants pain, (5) modularization friction, (6) ML data sufficiency, (7) ladder net contribution at scale (added 2026-04-26 with B65.4.1 hotfix). Decision-making principle: prefer NOT to build pre-launch fixes that AMR will likely replace. References `B65_6_FINDINGS_PAPER.md` as canonical pre-Phase-19 reference. |
| 19.5 | Adaptive Market Response (AMR) | Conditional | Mode-overlay expansion from defensive-only to defensive + offensive, with multi-input detection signal (regime state + global DBS + realized-vs-predicted EV gap + pair-level regime distribution + friction trend + B67 external signals). Two canonical positive cases per `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §10: 04-18 streakiness day (historical context, pre-B62 classifier) + 04-22 hostile day (current canonical post-B62 case). Decision gate at end of paper observation per Phase 19.4.5. |
| (candidate) | **ML-light reliability score** | Langston suggestion 2026-04-26 | Logistic regression on classifier inputs (vol, ADX, momentum, DBS + B67 macro features), trained on 30d VTS data, output = "probability this classification will produce a winning trade." Reliability score becomes another confidence modifier. ~2-3 days work. Lands during paper-mode audit as additional Phase 19.4 sub-item. Pre-launch viable; doesn't require Phase 17/18 ML infrastructure. |

**Phase 19 expected outcome:** fully debugged paper trading system with optional SQE recalibration (19.4) + ML-light (candidate) + AMR (19.5) layered in based on what paper-mode evidence shows. All components validated. Ready for production hardening (Phase 20).

## Post-live phase sequence

After Phase 20 (Production Hardening) and Phase 21 (Live Mode Activation):

- **Phase 21.4 — Modularization** (8-module architectural extraction across 5D `(exchange, asset_class, filter, strategy, regime)` matrix). Precondition for Phase 21.5 exchange/asset-class expansion. Lever-migration sub-phase moved to B72 pre-launch per Kyle directive 2026-04-26; Phase 21.4 retains architectural-decomposition work only.
- **Phase 21.5 — Exchange Expansion** (Kraken XStocks tokenized stocks + Perpetual Futures).
- **Phase 17 — Machine Learning Design** (full ML, deferred to post-launch per original plan).
- **Phase 18 — Machine Learning Implementation** (ML Adaptive Intelligence Layer).
- **Phase 17.5 — Smart Thermostat / Rules-Based Predictive Execution** (formerly Phase 15b, deferred to post-launch).
- **Phase 22 — Publication & Monitoring**.

---

## Architecture Decision Records (active)

- **External data → extended MCE, not SQE.** Anchor: `EXTERNAL_DATA_ARCHITECTURE_PLACEMENT.md`.
- **Modularization: 8 canonical modules across 5 orthogonal dimensions.** Exchange Adapter / Filter Module Family / Context Provider (MCE) / Eligibility / Scoring Kernel / Threshold / Profitability / Ranking. Reference: `MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md`.
- **B66 VTS-apply vs paper-only split.** PredConf rolling window, formula constants, rankingScore logging, global regime aggregation tuning → VTS + paper. Per-underlying position limits, realized-EV-adaptive floor → paper-only with VTS bypass.
- **`baseCurrency` is the underlying-equivalent.** Don't add a parallel `underlying` column. Langston review 2026-04-23.

---

## Infrastructure / Environment (most also in CLAUDE.md §7-8)

Staging `188.245.193.8` / Langston `204.168.141.77` / topic-21 UUID `ba777106-737b-4562-8353-e70e513ef53a` / branch `migration/aws-supabase`. Deploy: `ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git pull origin migration/aws-supabase && npm run db:migrate && npm run build && pm2 restart dawntrader'"`.

*End of memory. Next session: read planning doc (`REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §11 has 12 decisions queued for Kyle) + this file, then proceed per §Pre-Phase-16 batches REMAINING.*
