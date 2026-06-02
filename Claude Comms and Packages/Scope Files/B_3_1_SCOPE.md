# B3.1 — xStock Strategy-Gate Correctness Audit + Calibration — SCOPE v1

> **Audit correctness, then calibrate only what's wrong.** Not a gate-loosening pass. For EVERY gate on EVERY xStock strategy — blocking AND non-blocking — determine whether its accept/reject is CORRECT, then change only the gates the evidence proves wrong. Kyle directive 2026-06-03: "the question is whether they're being blocked correctly… how do we determine that?" — methodology below, Kyle-approved.
>
> **Calibration basis = live/forming-bar telemetry** (`signal_eval_archive`, what VTS actually produced), per the B.3 forming-bar decision — NOT the settled replay. **CALIBRATION LENS (axiom 6) throughout. Active trading OFF.** Foundation: `B_3_REGIME_AUDIT_REPORT.md` (regime confirmed sound) + the live per-strategy reject map (§1).

---

## §0 — Plain-language headline (for Kyle)

This sub-batch does not assume that a gate turning away lots of signals is mis-tuned, or that a gate turning away few is fine. For each gate it asks one question — is it blocking the *right* signals? — and answers it by checking what the price actually did after each signal in the price history. We change a gate only where that evidence shows it's turning away winners or letting through losers. It also fixes the volume gate (which uses the wrong data for xStocks), checks the gates that feed position sizing, and gives the pattern-detection step a hard look, because that's what's blocking the most strategies.

---

## §1 — Foundation (live 7d, code-verified)

**Per-strategy PRIMARY blocker** (signal_eval_archive, xstock_spot, detect rejects):
| Strategy | primary block | n | note |
|---|---|---|---|
| morning_star | no_pattern | 1,296,937 | pattern path |
| inside_bar_reversal | breakout_fail / no_pattern | 300K / 228K | pattern + 0.2% buffer (KEEP) |
| pivot_shift | no_pattern | 287,662 | pattern path |
| vwap_pullback | price_position | 236,513 | VWAP-relative entry zone |
| vwap_bounce | price_position | 61,037 | VWAP-relative entry zone |
| sma_trend_ride | indicator_filter | 57,866 | ADX/RSI gate |
| breakout | range_not_found | 51,107 | consolidation detector |
| mean_reversion | indicator_filter | 28,222 | RSI gate |
| range_trade | range_not_found | 317 | consolidation detector |

**Key facts:**
1. **The pattern-detection side is the single largest blocker** (morning_star + pivot_shift + inside_bar ≈ 1.8M `no_pattern`). Highest leverage — feeds multiple strategies.
2. **Volume is NOT the current first-blocker** (only pivot_shift `volume_insufficient`, 993×) — strategies fail at earlier gates — BUT the volume DATA is wrong: xStock per-bar `volume` is the UNDERLYING-equity share volume (avg ~139k, never zero), not the token's. Wrong data can mis-accept AND mis-reject AND mis-size; it becomes the binding gate once upstream gates loosen.
3. **KEEP-marked hardcoded geometric buffers stay hardcoded** (Kyle 2026-06-03: deliberate `// KEEP per LEVER_INVENTORY` decisions are respected — IB/VE breakout buffers 0.002, stop buffers 0.003-0.005). NOT calibration targets.
4. Calibration basis is the live/forming-bar telemetry (forming-bar decision); the win-proxy uses the *actual* live decisions + the actual subsequent prices.

---

## §2 — The correctness-audit methodology (Kyle-approved 2026-06-03)

For EACH gate, on EACH xStock strategy, **blocking or not**, run four checks:

**Check 1 — Input-data correctness.** Is the gate using the right data for xStocks? (Volume is the known-wrong one — underlying-equity, not token. Audit every gate's inputs for crypto-borrowed or wrong-asset data.) A gate on wrong data is suspect regardless of its counts.

**Check 2 — Metric + threshold sanity.** Is the metric computed correctly for xStocks, and does its threshold sit at a defensible point of the *live xStock distribution*? (E.g. is the VWAP itself right, and is the "pullback zone" where xStock prices actually pull back to, or a crypto level they rarely reach?) Same method as the regime audit — overlay the threshold on the real distribution.

**Check 3 — Discrimination test (the win-proxy = ground-truth substitute).** With live trading off, judge correctness by what the price DID after each signal. For every candidate the gate admitted AND rejected, compute the forward price outcome from OHLC and test: does the gate's accept/reject actually separate likely-winners from likely-losers?
- A gate is CORRECT if rejected candidates would mostly have lost and admitted would mostly have won.
- A gate is TOO TIGHT if it rejects would-be winners; TOO LOOSE if it admits would-be losers (this is how non-blocking gates get caught — "passes a lot" ≠ "passes correctly").

**Check 4 — Downstream-use trace.** Does this gate's metric also feed POSITION SIZING (or scoring)? If so, a wrong metric mis-sizes even when it gates fine — verify the metric is sound at the sizing site too.

**Decision rule:** calibrate a gate ONLY where Checks 1-4 show it is wrong (wrong data / mis-placed threshold / poor discrimination / corrupts sizing). Gates that pass all four are left alone, however much they block. No loosening for count's sake (CALIBRATION LENS).

---

## §3 — Numbered objectives

**O1 — Build the correctness-audit engine (read-only).** A diagnostic that, per (strategy, gate), joins the live decisions in `signal_eval_archive` (admit/reject + reason) to forward price outcomes from `xstock_spot_ohlc_60m_snapshot`, and computes the discrimination test (Check 3). Two levels: (L1) forward return over the strategy's horizon from the decision bar (feasible at scale, primary); (L2) reconstruct entry/stop/target and simulate hit-target-vs-stop for the strategies where the geometry matters (refinement). Plus the metric-sanity distribution overlays (Check 2) and the input-data + sizing-trace audit (Checks 1, 4).
- *Verify:* per-gate correctness table (data-ok? threshold-sane? discriminates? feeds-sizing?) with the win-proxy numbers + raw counts, rolling windows (rule #13), RTH-segmented, holiday-aware.

**O2 — Run the audit across ALL xStock strategies' gates** (10 enabled + assess the 9 disabled for whether any should be enabled), blocking and non-blocking. Deliverable: `B_3_1_GATE_CORRECTNESS_REPORT.md`.

**O3 — Volume-gate structural fix (prerequisite).** Replace the wrong volume input with an honest token-appropriate signal — order-book depth movement (depth-delta) — for xStock volume-confirmation gates, OR remove volume-confirmation where it can't be computed honestly. Per-class, DB-resolved, both VTS + active paths (§5 #15). Design-first, Langston-reviewed.

**O4 — Pattern-detection-side assessment (top leverage).** The `no_pattern` rejections gate ~1.8M signals across morning_star/pivot_shift/inside_bar. Assess the pattern-recognizer + the strategies' pattern-quality sub-gates for xStocks: is it under-producing patterns, or are the pattern-quality thresholds too strict? Apply Checks 1-3. If substantial, may split to its own sub-batch (B3.1d) rather than bloat B3.1.

**O5 — MCE non-regime-output check.** The MCE produces confidence + indicator values (beyond the regime label) that flow downstream into scoring/sizing. Verify those are sane for xStocks (Check 2). Flag for this batch or a follow-on.

**O6 — Calibrate only the proven-wrong gates** (DB threshold changes, per-class, both paths), with before/after + the Check-1-4 evidence per change. Leave correct gates untouched. KEEP-marked hardcoded buffers untouched. Fill the scoreboard "planned" side for the affected strategy-gate rows.

---

## §4 — 🚨 Scaffolding / phasing (per §9.1)

B3.1 is large enough to phase; proposed internal structure (each its own Langston Step-4/8):
- **B3.1a — correctness-audit engine + findings** (READ-ONLY; `B_3_1_GATE_CORRECTNESS_REPORT.md`). Determines which gates are wrong. *Immediate next build.*
- **B3.1b — volume-gate structural fix** (depth-delta; code + DB; prerequisite for meaningful calibration of any volume-touching gate).
- **B3.1c — gate calibrations** (DB threshold changes, only the proven-wrong gates from B3.1a).
- **B3.1d — pattern-detection-side calibration** (if O4 shows it's wrong; possibly standalone given leverage).
- MCE check (O5) folds into B3.1a's read.

> 🚨 B3.1a changes NOTHING live (read-only audit). B3.1b/c/d make the actual changes, each reviewed. Active trading OFF throughout — all impact is on VTS telemetry until Phase 19.

---

## §5 — Methodology detail (win-proxy honesty)

- **Decisions are real, outcomes are real:** the win-proxy uses the ACTUAL live accept/reject decisions (forming-bar-based, as the system really made them) joined to the ACTUAL subsequent settled prices. No re-derivation of forming-bar state needed for L1.
- **Caveats (stated up front):** the win-proxy is forward-return discrimination, not realized P&L (no friction/slippage — those are B.4/5); L1 uses a fixed forward horizon (a proxy for the strategy's intended hold); rejected-candidate entry/stop/target reconstruction (L2) is approximate. The proxy answers "did the setup the gate accepted/rejected tend to work," which is exactly the correctness question — it is not a backtest P&L claim.
- **Sample sufficiency:** reject buckets are data-rich (tens of thousands to millions); admit buckets are thin for some strategies — so the audit is strongest at testing whether REJECTIONS are correct (the dominant question), and flags where admit-side samples are too thin to judge.
- Rolling windows + raw counts + RTH-segmentation + holiday-awareness (rules #13, #17).

---

## §6 — Blast radius / SIM (Step-2 pre-audit deepens)

- O1/O2/O4/O5 read-only (diagnostic script + analysis) — zero production blast radius.
- O3 volume fix: touches the strategies' volume-confirmation gates (`strategy-engine.ts` quant strategies + `server/strategies/*.ts`) + a depth-delta source; per-class DB config; both paths. Real blast radius — own pre-audit + Langston review.
- O6 calibrations: `module_constants` per-strategy gate values (DB), per-class.
- Pattern-detection (O4): `pattern-recognizer.ts` + pattern-quality sub-gates.
- Scoreboard (`calibration_ledger`): fill planned side of strategy-gate rows.
- Position-sizing trace (Check 4): map gate-metrics → sizing sites (sizing engine).

---

## §7 — Open questions for Langston (Step 1)

1. **Win-proxy horizon:** what forward horizon for L1 — per-strategy intended hold (varies) or a small set of fixed horizons (e.g. 4h/8h/24h) reported side-by-side? Proposal: a few fixed horizons + the strategy's nominal hold where defined.
2. **Discrimination metric:** mean/median forward return per accept/reject bucket, AND a separation score (e.g. % of rejected that were would-be-winners). Agree?
3. **L2 (target/stop simulation):** which strategies warrant the rigorous hit-target-vs-stop reconstruction vs L1 forward-return being sufficient?
4. **Volume fix shape:** depth-delta as the token-appropriate replacement vs removing volume-confirmation for xStocks — your lean? (Depth is already the liquidity screen; depth-movement as a confirmation proxy is the natural candidate.)
5. **Phasing:** agree B3.1a (read-only audit) is the immediate build, gating B3.1b/c/d?

---

---

## §8 — Langston Step-1 ACK + LOCKED methodology conditions (2026-06-03)

Langston ACK'd B3.1a to build conditioned on the following (all accepted — they fix real holes in the win-proxy; absorbed as binding methodology, superseding §2/§5 where they differ):

**Win-proxy correctness fixes (must ship in B3.1a):**
1. **EXCESS return, not raw (THE critical fix).** xStocks share underlying-equity/SPY/sector beta — a raw forward-return test measures market drift, not gate skill (accept + reject buckets both look like winners in an up-window). The discrimination metric is **forward return minus a universe (or sector) base rate over the same window**; report the base rate alongside. De-meaning against the universe is mandatory, not optional; RTH-segmentation does not substitute.
2. **No look-ahead at bar-0.** `signal_eval_archive` has no decision-price column → reconstruct bar-0 from `captured_at` against **`xstock_spot_ohlc_1m`** (exists) to the decision minute, and **start the forward measurement at bar +1** (not the 60m decision-bar close, which leaks ≤60min). First check whether `features` JSON carries the decision-time quote — use it as bar-0 if present.
3. **Reached-G bucketing.** detect short-circuits at the first failing gate; the per-gate reason is the terminal one. For gate G, the only clean test is **among candidates that REACHED G: passed-G vs rejected-at-G** — NOT vs final admits (which conflates G with downstream gates). Reconstruct "reached G" from the terminal reason + the known per-strategy gate ORDER (confirm `gate_decision` records the ordered trace, else derive from detect-code order).
4. **L1 only for PURE-FILTER gates (hard rule).** Rejected candidates have no entry price; entry-timing gates (vwap_pullback, vwap_bounce, breakout, range_trade, abcd_long, inside_bar_reversal, morning_star, pivot_shift — anything upstream of a conditional entry) must use **L2** (reconstruct entry/stop/target, simulate hit-ordering on 1m bars). L1 (decision-bar forward return) is valid only for pure-filter gates (`indicator_filter` on sma_trend_ride/mean_reversion; score/regime gates).
5. **Path-dependency + session-clipping.** Endpoint return mislabels target-then-revert / stop-then-recover → L2 hit-ordering (1m) for any stop/target geometry. Forward windows **must not span closed xStock sessions** (overnight/weekend gaps); clip to session, holiday-aware.
6. **Verdict = rolling-window CONSISTENCY (multiple-comparisons guard).** ~10 strategies × gates × horizons = dozens of tests; some separate by chance. A gate is "proven-wrong" only on **consistent failure across rolling windows** (rule #13), not one window's number.
7. **Use realized VTS outcomes for the admit bucket.** `exit_decision_archive` carries real `entry_price`/`exit_price` for VTS trades that ran — cleaner than the proxy for admits, and mitigates the thin-admit weakness. Cross-check proxy vs realized; divergence is itself a finding.
8. **Capture-coverage check FIRST.** The 1.8M `no_pattern` (reject_stage `strategy_internal`) rows are DROPPED when `signalEvalPreFilterEnabled` is OFF (`signal-eval-archiver.ts:76-82`). Confirm the kill-switch was ON across the full 7d window before trusting any reject count — a capture gap silently skews every discrimination test.

**Q-answers (locked):** Q1 — fixed horizons (robustness) + strategy nominal hold (primary verdict); measure from bar+1; report as excess. Q2 — **rank-based separation (AUC / Mann-Whitney) as PRIMARY** (no win-threshold, tail-robust) + mean AND median + n per bucket, base-rate-adjusted. Q3 — L2 for the 8 entry-conditional strategies listed; L1 for pure-filter. Q4 — depth-delta (top-of-book only, label honestly; substrate = `xstock_spot_ticker_snap` bid_qty/ask_qty) but **validate depth-delta's OWN discrimination in B3.1a before adopting**; if it fails, REMOVE volume-confirmation (NO-PATCHES) — explicit branch in B3.1b. Q5 — B3.1a read-only first; it MUST also (a) run the depth-delta discrimination test and (b) diagnose the pattern-side failure mode (under-producing patterns vs too-strict pattern-quality thresholds) so B3.1d is scoped right.

**Status:** B3.1a (correctness-audit engine, read-only) cleared to build with the above folded in. Next: Step-2 pre-audit confirms the data surfaces (`xstock_spot_ohlc_1m`, `exit_decision_archive`, `xstock_spot_ticker_snap`, capture-coverage) then build.

---

*Scope v2 (Langston Step-1 conditions absorbed). Calibration basis = live/forming-bar telemetry (B.3 decision). Foundation: `B_3_REGIME_AUDIT_REPORT.md` + live per-strategy map. Active trading OFF.*
