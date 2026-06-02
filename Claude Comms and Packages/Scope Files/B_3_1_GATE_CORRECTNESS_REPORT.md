# B3.1a — xStock Strategy-Gate Correctness Audit — FINDINGS REPORT (DRAFT)

> **Read-only audit. Changes nothing live.** Answers, per gate, the Kyle question (2026-06-03): *is it blocking the RIGHT signals?* — not "does it block a lot." Method = the Langston-hardened correctness methodology in `B_3_1_SCOPE.md` §2/§8 (reached-gate bucketing; excess-return de-meaning vs the cross-sectional universe; no look-ahead, entry at bar+1; AUC/Mann-Whitney primary; rolling-day consistency = verdict; L1 pure-filter / L2 entry-conditional; depth-delta validate-or-remove; pattern under-production vs too-strict).
>
> **Calibration basis = live/forming-bar telemetry** (`signal_eval_archive`, what VTS actually produced). Window = 7 live trading days ending 2026-06-02. Active trading OFF — all impact is on VTS telemetry until Phase 19. CALIBRATION LENS (axiom 6) throughout: we change a gate ONLY where the evidence proves it wrong; reject rate is an output, never a target.

---

## §0 — Headline

**The audit largely VINDICATES the gates and redirects the real fix to the data layer + strategy edge.** Across all 10 xStock strategies and every blocking/non-blocking gate, **not one gate shows the "too tight — false-rejecting winners" signature** (no gate has a consistent AUC < 0.45 with its rejected bucket out-performing). So there is no CALIBRATION-LENS case for loosening anything. Instead:

1. **One gate is clearly correct — leave it: pivot_shift's RSI/ADX `indicator_filter`** discriminates consistently (AUC 0.53→0.59 at 4h, 0.55–0.65 per-day; admitted names beat rejected by +1.14% excess at 4h) and its 35–65 RSI band sits squarely on the real xStock distribution (Check-2). `range_trade`'s range detector also looks correct (AUC 0.59–0.68) but is low-N.
2. **Most entry-zone / pattern gates don't discriminate (AUC ≈ 0.50)** — vwap_pullback, inside_bar, morning_star/pivot_shift pattern. Loosening them would admit equally-mediocre setups, not solid opportunities → leave (CALIBRATION LENS).
3. **The volume gates run on wrong data (underlying-equity volume) on EVERY strategy that checks volume** (§1, settled). The honest replacement candidate — order-book depth-delta — has **no forward signal** (AUC 0.50, §4) → **B3.1b REMOVES volume-confirmation for xStocks rather than swapping in a second meaningless gate** (NO-PATCHES).
4. **The pattern blocker is mostly intrinsic, not a threshold to loosen** (§5): the MORNING_STAR shape is genuinely rare (2.5%) and its quality gate is provably non-binding; INSIDE_BAR is common (38%) yet the strategy still never fires because the post-pattern breakout trigger doesn't, so its blocker isn't pattern detection.
5. **Deeper finding, beyond gate calibration:** the strategies' *admitted* trades lose in VTS (−0.17R to −0.64R realized). The gates aren't false-rejecting good trades; the strategies' **edge is weak for xStocks** (they were crypto-tuned). That is strategy-design work (entry/exit/regime-fit), not a gate-threshold change — flagged for a dedicated effort, not forced into B3.1.

**Net:** B3.1c (gate threshold calibrations) has **essentially no warranted changes** — a legitimate, evidence-driven outcome. The actionable fix is **B3.1b (remove the wrong-data volume gates)**; the rest is correctly-functioning gates + a separately-scoped strategy-edge problem.

---

## §1 — Check 1: Input-data correctness — the VOLUME gates run on WRONG data (SETTLED)

**Finding (definitive, code-traced + magnitude-confirmed): every strategy volume-confirmation gate on the xStock path reads UNDERLYING-EQUITY volume, not the token's traded volume.**

- **Code trace.** The per-1-minute bar `volume` in `xstock_spot_ohlc_1m` is written verbatim from the `data.volume` field of the underlying-equity websocket feed (`wss://ws-equities.kraken.com`, OHLC channel) — `equity-spot-archiver.ts:82` (`parseOhlcBar`: `volume: String(data.volume ?? '0')`), upserted unchanged by `ohlc-batch-writer.ts:150-163`, and summed into 60m/240m bars by `ohlc-aggregator.ts:265` (`SUM(volume)`). The codebase's own comments label this field "the underlying equity's share volume, not the token's" (`scanner.ts:607-609, 749-751`; `:134` "24h rolling SHARE volume from Kraken ticker"). The 24h ticker field (`volume24h`, read by the two VWAP strategies via `indicators.volume`) is the same underlying-equity quantity, established by the B.0 baseline + the `X-Stocks Volume Feed Research` doc.
- **Magnitude confirmation (courtroom check).** Summed daily 1m `volume` × price: SPY ≈ **$6.8 billion/day**, NVDA ≈ **$5.0 billion/day**, MU ≈ **$5.5 billion/day**. The entire xStock TOKEN market trades **under $1 million / 24h** across all names combined. Off by ~4 orders of magnitude — this is underlying-equity volume, beyond any doubt.
- **B.1.5 precedent.** The liquidity *filter* was already migrated off this wrong volume to two-sided top-of-book depth-USD (`bid/ask × qty`) in B.1.5. The **strategy volume-confirmation gates were never migrated** and still read the wrong field.

**Which gates are affected** (from the source extraction):

| Strategy | Volume gate | Hard/soft | Field read | Verdict |
|---|---|---|---|---|
| vwap_pullback | `volume ≥ avgVol×1.5` | HARD | `indicators.volume` (24h underlying USD) vs per-bar token-vol avg — **unit mismatch on top of wrong data** | WRONG |
| vwap_bounce | `volume ≥ avgVol×1.3` | HARD | same unit mismatch | WRONG |
| breakout | `currentVol ≥ avgVol×1.5` | HARD | per-bar `volume` (underlying-equity) | WRONG |
| abcd_long | `currentVol ≥ avgVol×1.5` | HARD | per-bar (underlying-equity) | WRONG (disabled for xstock) |
| inside_bar_reversal | `breakoutVol ≥ avgVol×1.3` | HARD | per-bar (underlying-equity) | WRONG |
| pivot_shift | `currentVol ≥ avgVol×1.3` | HARD | per-bar (underlying-equity) | WRONG |
| morning_star | `volumeRatio` | SOFT (confidence only) | per-bar (underlying-equity) | WRONG but non-gating |
| range_trade / sma_trend_ride / mean_reversion | — | none | — | n/a (no volume gate) |

**Why this matters even though volume is not the current first-blocker** (only `pivot_shift volume_insufficient`, 993×): the gates fail at *earlier* gates today, so the wrong-volume gate rarely binds yet — but it mis-accepts and mis-rejects whenever it does, and it becomes the binding gate the moment any upstream gate is loosened. Wrong data is wrong regardless of current counts. **This is the B3.1b prerequisite.**

**Disposition → B3.1b.** Replace the volume-confirmation input across ALL strategy volume gates with an honest token-appropriate signal (top-of-book depth-delta) — per-class, DB-resolved, both VTS and active paths — OR, if depth-delta shows no discrimination (§4 below), REMOVE volume-confirmation for xStocks rather than keep a meaningless gate (NO-PATCHES). Decision driven by §4.

---

## §2 — Check 3: Discrimination — do the gates separate winners from losers?

**Method recap.** For each gate G, among candidates that REACHED G, compare passed-G vs rejected-at-G on forward EXCESS return (raw forward return minus the cross-sectional universe base rate over the same window — de-means the shared equity/market beta). AUC > 0.5 ⇒ passed-G out-performs rejected-at-G ⇒ the gate keeps the better setups (correct). AUC ≈ 0.5 ⇒ no discrimination (suspect). AUC < 0.45 ⇒ inverted (rejecting the better setups). Verdict requires cross-day consistency, not one window. L2 entry-conditional strategies additionally get a path-dependent hit-ordering cross-check (standardized geometry applied identically to both buckets).

### §2.1 — Pure-filter gates (L1, from CHUNK 1)

| Strategy / gate | passed-G n | rejected-at-G n | AUC (consistency) | Verdict |
|---|---|---|---|---|
| sma_trend_ride / indicator_filter | ~4,381 | [n] | 0.49–0.53 across days | NEUTRAL — not rejecting winners; strategy's own edge is weak (admitted median ≈ −1R). Gate not wrong → no loosening. |
| mean_reversion / indicator_filter | thin | ~28k | inert | INERT — 25 signals/wk clear the gate, 4 traded; rejects slightly-below-market names. Not false-rejecting → no loosening. |

### §2.2 — Entry-conditional gates (L2)

Numbers = passed-G vs rejected-at-G; AUC on forward EXCESS return (de-meaned vs cross-sectional universe), endpoint at 60m/240m + L2 standardized-geometry hit-ordering. "passed-G" = cleared the gate (admitted or failed a later gate); "rejected-at-G" = terminal reject reason == gate. (abcd_long is DISABLED for xstock_spot → no live candidates → not shown.)

| Strategy / gate | passed-G / rejected-at-G | AUC 60m / 240m | per-day (240m) | L2 win% passed/rej | Verdict |
|---|---|---|---|---|---|
| vwap_pullback / price_position | 28,780 / 119,970 | 0.500 / 0.488 | 0.42–0.56, centered 0.50 | 6.6% / 6.2% | **NO discrimination.** Entry-zone gate doesn't separate winners/losers; admitted trades lose (−0.22R realized). Leave (loosening adds mediocre setups). |
| vwap_bounce / price_position | 1,221 / 60,796 | 0.464 / 0.442 | 0.24–0.62 (noisy) | 2.5% / 6.7% | **Thin admit + noisy/slightly-inverted, not decision-grade.** Strategy barely admits (71 over 7d). Weak edge, not a gate fix. |
| breakout / range_not_found | 11,105 / 50,910 | 0.479 / 0.457 | 0.41–0.50 | 4.5% / 7.1% | **Slightly inverted + strategy produces ZERO admits** (breakout_fail passed=0). Range detector not helping; moot since strategy never fires. |
| breakout / breakout_fail | 0 / 11,105 | n/a (no admits) | — | — | Strategy never fires for xStocks (0 admitted). The post-range breakout trigger never clears. |
| range_trade / range_not_found | 160 / 336 | **0.594 / 0.679** | low-N (mostly n/a) | 18.9% / 13.7% | **DISCRIMINATES POSITIVELY (correct-looking) but LOW-N** (160/336 over 7d). Provisional LEAVE; re-confirm with more data. |
| inside_bar_reversal / no_pattern | 82,806 / 66,089 | 0.489 / 0.497 | 0.47–0.52 | 4.4% / 5.9% | **NO discrimination.** Inside-bar presence doesn't predict outcome. Pattern common (38%, §5) but strategy still 0 admits → blocker is the breakout trigger, not the pattern gate. |
| inside_bar_reversal / breakout_fail | 0 / 82,806 | n/a | — | — | Strategy never fires (0 admitted). Post-inside-bar breakout trigger never clears. |
| morning_star / no_pattern | 16,727 / 366,882 | 0.520 / 0.510 | 0.42–0.60 | 4.6% / 5.3% | **MARGINAL/noisy ~0.51.** Pattern genuinely rare (2.5%, §5); quality gate non-binding. No threshold change helps. Admitted trades lose (−0.17R). |
| pivot_shift / no_pattern | 11,841 / 271,638 | 0.517 / 0.497 | 0.41–0.64 | 4.6% / 5.4% | Same as morning_star (shares MORNING_STAR shape). Marginal. |
| **pivot_shift / indicator_filter** | 1,228 / 10,613 | **0.530 / 0.591** | **0.55–0.65 (consistent)** | flat | **✅ CORRECT — DISCRIMINATES.** RSI(35–65)+ADX-slope gate keeps the better setups: admitted +1.14% excess vs rejected −0.16% at 4h, consistent every day. Threshold sane (§3). **LEAVE.** |
| pivot_shift / volume_insufficient | 309 / 919 | 0.483 / 0.587 | low-N | 11.1% / 2.5% | **Appears to discriminate BUT on WRONG (underlying-equity) data + low-N** → untrustworthy. B3.1b removes the input, then re-test. |

**Cross-cutting (realized VTS exits, admit cross-check):** every strategy with realized trades LOSES on average — vwap_pullback −0.22R (n=445), vwap_bounce pnl −0.78% (n=72), range_trade −0.64R (n=8), morning_star −0.17R (n=333), pivot_shift −0.21R (n=42); all medians −1.0R. The gates aren't false-rejecting winners; the strategies aren't finding winners. **Strategy-edge problem, not gate problem.**

---

## §3 — Check 2: Metric + threshold sanity

**RSI-14 across live xStock 60m bars** (n=40,800): p5=20.6, p25=36.1, **med=48.6**, p75=61.6, p95=79.7. The pivot_shift `indicator_filter` admits the RSI 35–65 neutral band (keeps 57.0% of bars). **The band is well-placed** — it is centered on the real median (48.6) and brackets the interquartile range (36–62) almost exactly. This is NOT a crypto-borrowed level; it sits where xStock RSI actually lives. Corroborates §2.2: the gate both discriminates AND its threshold is sane → leave it. (The mean_reversion/sma_trend_ride RSI/indicator gates from CHUNK 1 also sit on this same well-behaved distribution.)

**Pattern strength thresholds** (Check-2 of the pattern gates) are provably non-binding for MORNING_STAR — see §5 (strength always ≥0.70 vs 0.55/0.50 gates), so threshold-placement is moot there.

*Limitation:* VWAP-distance for the price_position gates could not be overlaid directly — the 60m snapshot table stores no VWAP column, and the live VWAP is forming-bar-dependent. The discrimination test (§2.2) already shows those gates don't separate outcomes regardless of exact threshold placement, so a threshold-overlay would not change the verdict. Recomputing live VWAP for a dedicated overlay is a B3.1c option only if §2.2 were ambiguous (it isn't).

---

## §4 — Depth-delta validation (validate-or-remove) — the honest volume replacement candidate

**Result: depth-delta has NO forward-return signal → do NOT adopt it → REMOVE volume-confirmation.**

Top-of-book two-sided depth-USD (`bid×bid_qty + ask×ask_qty` from `xstock_spot_ticker_snap`), 15-minute change, tested as a forward predictor on the live universe (depth coverage excellent — 837,071 per-minute snaps, 485 symbols):

| Horizon | n | top-tercile excess | bottom-tercile excess | AUC(top>bottom) |
|---|---|---|---|---|
| 60m | 19,788 | −0.01% | −0.01% | **0.499** |
| 240m | 12,340 | −0.01% | 0.00% | **0.501** |

AUC ≈ 0.50 at both horizons — a rise in book depth carries **zero** information about subsequent excess return. Per Langston's locked condition (Q4: "validate depth-delta's OWN discrimination before adopting; if it fails, REMOVE volume-confirmation — NO-PATCHES"), depth-delta **fails** the bar (>0.55 required).

**Disposition → B3.1b: REMOVE the volume-confirmation sub-gate from the xStock strategy paths**, rather than swap one meaningless gate (underlying-equity volume) for another (signal-less depth-delta). The honest position: xStocks have no usable token-volume feed today, so a volume-confirmation gate cannot be computed honestly and should not exist on the xStock path. (Liquidity screening remains correctly handled by the B.1.5 two-sided depth-USD *level* gate — that is a level filter, distinct from the per-bar volume-*confirmation* the strategies use; this finding does not touch the liquidity gate.)

*Nuance:* a volume-confirmation gate's intent is to confirm a move has participation; testing forward-return discrimination is the right correctness test because the gate's implicit claim is "confirmed moves perform better." Depth-delta shows no such effect → it cannot honestly confirm.

---

## §5 — Pattern-side diagnosis (top leverage — scopes B3.1d)

**The single largest blocker is pattern non-detection** (~1.6M `no_pattern` across morning_star + pivot_shift, both of which gate on the MORNING_STAR shape; + 228K inside_bar on the INSIDE_BAR shape).

**Quality threshold is NON-BINDING (code + data settled).** MORNING_STAR strength = `min(1, 0.7 + min(0.2, recovery×0.1) + gapBonus)` — minimum possible value **0.7**, always above the `weak_pattern` gates (morning_star 0.55, pivot_shift 0.50). Measured on the live 60m bars: strength min=0.700, med=0.829, **100.0%** of detected shapes ≥0.55. So *if a MORNING_STAR shape is detected at all, it always clears the quality gate.* The entire `no_pattern` block is about **shape availability**, not quality strictness — loosening the strength threshold would change nothing.

**Measured base rates (live 60m bars):**
- **MORNING_STAR: 2.507%** (1,181 shapes / 47,105 bar-triples). ~1 morning-star per ~40 symbol-hours — a plausible, GENUINE rarity for a specific 3-candle reversal, not an obvious recognizer bug. morning_star + pivot_shift are pattern-dependent strategies that will rarely have a setup for xStocks **by design**; the 1.6M `no_pattern` count is the strategies correctly idling 97.5% of the time, not a mis-calibrated gate.
- **INSIDE_BAR: 38.407%** (18,278 / 47,590 bar-pairs); 82.7% pass the compression≤0.85 gate. The shape is COMMON — yet inside_bar_reversal still produces **zero admits** (§2.2). So inside_bar's binding constraint is NOT pattern detection; it's the post-pattern **breakout trigger** (`price > parentHigh×1.002`) that essentially never fires for xStocks, plus the global guards.

**B3.1d re-scoped by this evidence:** there is **no pattern-threshold to loosen** (quality gate non-binding; pattern presence doesn't even discriminate, AUC ≈ 0.50–0.51 §2.2). The honest B3.1d question is NOT "are pattern thresholds too strict" — it is "why do the pattern strategies (and breakout/inside_bar) almost never fire, and is forcing them to fire even desirable given they don't discriminate and lose when admitted?" That is a strategy-fit question (60m timescale + crypto-tuned trigger geometry on a 24/5 equity-derivative), much closer to strategy-design than gate calibration. **Recommendation: B3.1d as originally imagined (pattern-threshold loosening) is NOT warranted; fold the real question into the strategy-edge effort flagged in §0 (point 5) + §8.**

---

## §6 — Check 4: Position-sizing-feed trace

The sizing-relevant outputs of each strategy are the **stop distance** (risk-per-trade → position size) and the **confidence** (→ scoring/EV). From the source extraction:
- **Stop distance** is derived from **ATR** (60m token OHLC high/low/close) and price-level geometry (VWAP, range, parent-bar low). ATR does **not** use volume → the core sizing input is on CORRECT data. Good.
- **The wrong (underlying-equity) volume's only sizing-adjacent path is morning_star's confidence bonus** (`volumeBonus`, a soft confidence add) — it does NOT enter stop distance or the hard gates' sizing. So sizing corruption from the volume bug is limited to one strategy's confidence nudge, not the risk sizing.
- The metrics of the one CORRECT gate (pivot_shift RSI/ADX) and the price_position metrics are not sizing inputs.

**Net Check-4:** the volume-data bug does not materially corrupt position sizing (sizing rides on ATR, which is clean). Confirm-and-close the morning_star confidence path when B3.1b touches the volume gates. *A full sizing-engine read (Kelly/EV site) is folded into B3.1b's pre-audit, since that is the batch that edits the volume-touching code.*

---

## §7 — Per-gate correctness summary table

| Strategy | Gate | Data OK? | Threshold sane? | Discriminates? | Feeds sizing? | VERDICT |
|---|---|---|---|---|---|---|
| pivot_shift | indicator_filter (RSI/ADX) | ✅ | ✅ (band on real median) | ✅ 0.53–0.59, consistent | no | **LEAVE — correct gate** |
| range_trade | range_not_found | ✅ | n/a | ✅ 0.59–0.68 (low-N) | no | **LEAVE — looks correct (re-confirm w/ data)** |
| sma_trend_ride | indicator_filter | ✅ | ✅ | neutral 0.49–0.53 | no | LEAVE (not false-rejecting; weak strat edge) |
| mean_reversion | indicator_filter | ✅ | ✅ | inert | no | LEAVE (not false-rejecting) |
| vwap_pullback | price_position | ✅ | (no overlay; moot) | ✗ 0.50 (no skill) | no | LEAVE (loosening adds mediocre; strat edge weak) |
| vwap_bounce | price_position | ✅ | (moot) | thin/noisy | no | LEAVE (thin admit; strat edge weak) |
| breakout | range_not_found / breakout_fail | ✅ | n/a | ✗ ~0.46 + 0 admits | no | strategy inert; gate moot |
| inside_bar_reversal | no_pattern / breakout_fail | ✅ | n/a | ✗ 0.49 + 0 admits | no | strategy inert (breakout trigger never fires) |
| morning_star | no_pattern | ✅ | non-binding | marginal 0.51 | (vol→confidence only) | LEAVE (pattern rare by design) |
| pivot_shift | no_pattern | ✅ | non-binding | marginal 0.51 | no | LEAVE |
| **ALL w/ volume gate** | volume-confirmation | **✗ WRONG (underlying-equity)** | — | — | morning_star confidence only | **FIX-B3.1b: REMOVE (depth-delta no signal)** |

**No gate is marked "calibrate-B3.1c."** The evidence warrants zero threshold changes — only the B3.1b data-layer removal.

---

## §8 — Dispositions

- **B3.1b (volume fix) — THE one code change warranted.** REMOVE volume-confirmation sub-gates from the xStock strategy paths (breakout, vwap_pullback, vwap_bounce, inside_bar_reversal, pivot_shift hard gates + morning_star soft confidence). Rationale: input is wrong data (§1) and the only honest replacement (depth-delta) has no signal (§4) → an honest "no volume-confirmation on the xStock path until a real token-volume feed exists" beats a meaningless gate (NO-PATCHES). Per-class, DB-resolved, both VTS + active paths (§5 #15). Own pre-audit + Langston code review (touches `strategy-engine.ts` quant detectors + `server/strategies/*.ts`). Does NOT touch the B.1.5 liquidity depth-level gate.
- **B3.1c (gate threshold calibrations): NONE warranted.** No gate is proven false-rejecting winners; the one discriminating gate (pivot_shift RSI/ADX) is correct and sanely-thresholded. Leave all thresholds. (Legitimate CALIBRATION-LENS outcome: reject rate is an output, not a target.)
- **B3.1d (pattern threshold loosening): NOT warranted** (§5 — quality gate non-binding; pattern presence doesn't discriminate). Folded into the strategy-edge item below.
- **NEW — strategy-edge finding (out of gate-calibration scope, flag to Kyle):** the strategies' admitted trades lose in VTS (−0.17R to −0.64R) and several never fire for xStocks (breakout, inside_bar, vwap_bounce ~thin). The gates are fine; the **strategies' entry/exit/regime-fit is weak for xStocks** (crypto-tuned, 60m timescale on a 24/5 equity-derivative). This is strategy-design, not a gate threshold — recommend a dedicated strategy-fit effort (Phase 25 / B3.2-adjacent), NOT bloating B3.1.
- **Leave-alone (correct or not-false-rejecting):** pivot_shift indicator_filter; range_trade range_not_found; sma_trend_ride + mean_reversion indicator_filter; all price_position + pattern gates.
- **KEEP-marked buffers untouched:** inside_bar IB_BREAKOUT_BUFFER 0.002 / IB_STOP_BUFFER 0.003; morning_star MS_STOP_BUFFER 0.003 (deliberate per LEVER_INVENTORY — Kyle 2026-06-03).

---

## §9 — Method caveats (honest limits)

- Win-proxy = forward EXCESS return (de-meaned vs cross-sectional universe), not realized P&L with friction (friction is B.4/5). It answers "did the setups the gate accepted/rejected tend to out/under-perform the universe" — the correctness question — not a backtest P&L claim.
- L2 hit-ordering uses STANDARDIZED geometry (1ATR:2ATR and 0.5%:1.0%) applied identically to both buckets, to isolate the GATE's signal from per-strategy geometry noise; absolute win-rates are not P&L, only the passed-vs-rejected difference is read.
- Admit buckets are thin for several strategies (flagged LOW-N) — the audit is strongest at testing whether REJECTIONS are correct (the dominant question, data-rich); thin admits are cross-checked against realized VTS exits.
- 7 live trading days; rolling per-day AUC is the verdict driver (rule #13). range_trade + pivot_shift volume_insufficient are LOW-N and marked provisional.
- Forming-bar basis: candidates are the live forming-bar decisions (what VTS actually produced), per the B.3 decision — the correct calibration basis.

---

*Draft. CHUNK 1 (L1 pure-filter) + CHUNK 2 (L2 + depth-delta + pattern + Check-2) engine outputs feed §2–§5. Langston Step-4 review before any B3.1b/c/d build.*
