# B3.1a — Gate-Correctness Audit FINDINGS — Langston Step-4 review ask (v1)

**INFRASTRUCTURE NOTE: do NOT `cd /mnt/gdrive` or run `git`/`grep` on the gdrive-mounted repo (hangs on FUSE). Everything you need is embedded below. For any repo inspection use `ssh staging 'cd /home/deploy/dawntrader && git ...'`. The full report (if you want it) is local-readable at `/home/langston/inbox/b31a/B_3_1_GATE_CORRECTNESS_REPORT.md` (scp'd to you).**

You ACK'd the B3.1a engine to build with 8 win-proxy conditions (excess-return de-meaning, no-look-ahead bar+1, reached-G bucketing, L1-only-for-pure-filter, path-dependency/session-clip, rolling-day consistency, realized-VTS cross-check, capture-coverage-first). I built CHUNK 2 (L2 + depth-delta + pattern + Check-2) folding all 8 in, ran it on 7 live trading days (window ending 2026-06-02), and need your code-level/methodology review of the FINDINGS before any B3.1b/c/d build. Please scrutinize hard — these verdicts decide what we change.

## 1. Method as actually implemented (confirm faithful to your conditions)
- Candidates = live `signal_eval_archive` decisions, deduped to one per (symbol, minute) via `DISTINCT ON … ORDER BY captured_at DESC`. Terminal reason from `gate_decision->>'reason'`.
- **Reached-G bucketing via the source-extracted per-strategy gate ORDER:** for gate G at order-index gi, a strategy_internal row with reason at index < gi = didn't-reach-G (EXCLUDED); == gi = rejected-at-G; > gi = passed-G; admitted/tcl/sqe/rtb = passed-G. (This fixes the chunk-1 admitted-only undercount you flagged.)
- **Excess return** = fwd return (entry=open(min+1), exit=close(min+1+H)) − cross-sectional universe mean over same [decisionMin] window. Endpoint H=60m,240m.
- **L2 hit-ordering**: entry=open(min+1); STANDARDIZED geometry applied IDENTICALLY to passed & rejected — (a) stop=1×ATR60, target=2×ATR60 (ATR-14 from `xstock_spot_ohlc_60m_snapshot`, production computeATR style); (b) stop=0.5%, target=1.0%. Walk 1m bars to 240m cap, stop-checked-before-target within a bar (conservative), session-clip on bar gap. Win = target-first. (I used standardized geometry, NOT per-strategy reconstructed stops, deliberately — to isolate the gate's signal from geometry noise. Flag if you'd prefer per-strategy geometry.)
- AUC = Mann-Whitney (tie-averaged ranks). Verdict = cross-day consistency. LOW-N guard at 30/bucket.

**Q-A: is standardized-geometry L2 acceptable, or do you want per-strategy entry/stop/target reconstructed (fragile — telemetry stores NO geometry, only `sourcePool` + terminal reason; I'd reconstruct VWAP/range/parent-low from bars)?**

## 2. Check-1 (settled, please sanity-check): volume = WRONG data on EVERY volume gate
Traced: `xstock_spot_ohlc_1m.volume` is written verbatim from the underlying-equity ws-equities OHLC channel `data.volume` (`equity-spot-archiver.ts:82` → `ohlc-batch-writer.ts:150` → `ohlc-aggregator.ts:265 SUM`). Magnitude: summed daily 1m volume×price = SPY ~$6.8B/day, NVDA ~$5.0B/day vs the entire xStock token market <$1M/24h (~4 orders of magnitude). Affects breakout, vwap_pullback, vwap_bounce, inside_bar, pivot_shift (hard gates) + morning_star (soft confidence). B.1.5 already replaced this for the LIQUIDITY filter (depth-USD) but the STRATEGY volume gates were never migrated. **Agree this is settled?**

## 3. Discrimination findings (the core verdicts — challenge these)
passed-G / rejected-at-G | AUC 60m/240m | per-day(240m) | verdict:
- **pivot_shift indicator_filter (RSI35–65 + ADX-slope): 1228/10613 | 0.530/0.591 | 0.55–0.65 consistent** → admitted +1.14% excess vs rejected −0.16% @4h. Check-2: RSI live p25–p75 = 36–62, med 48.6 → band well-placed. **VERDICT: CORRECT — LEAVE.**
- range_trade range_not_found: 160/336 | 0.594/0.679 | low-N → looks correct, provisional LEAVE.
- vwap_pullback price_position: 28780/119970 | 0.500/0.488 → NO discrimination.
- inside_bar no_pattern: 82806/66089 | 0.489/0.497 → NO discrimination; strategy 0 admits anyway.
- morning_star no_pattern: 16727/366882 | 0.520/0.510 → marginal/noisy.
- pivot_shift no_pattern: 11841/271638 | 0.517/0.497 → marginal.
- breakout range_not_found: 11105/50910 | 0.479/0.457 → slightly inverted; 0 admits.
- vwap_bounce price_position: 1221/60796 | 0.464/0.442 → thin/noisy.
- pivot_shift volume_insufficient: 309/919 | 0.483/0.587 low-N → appears to discriminate BUT on WRONG data → untrustworthy.

**Headline claim to challenge: NOT ONE gate shows the "too tight, false-rejecting winners" signature (consistent AUC<0.45 with rejected out-performing). So zero loosening warranted (CALIBRATION LENS).** Realized VTS exits LOSE on every strategy (−0.17R to −0.64R; all medians −1.0R) → strategy-edge problem, not gate problem.

## 4. Depth-delta validate-or-remove (your Q4 condition)
Top-of-book two-sided depth-USD 15-min delta, forward discrimination: H=60m n=19788 AUC=0.499; H=240m n=12340 AUC=0.501. **No signal (>0.55 required).** → **B3.1b REMOVES volume-confirmation rather than swap in depth-delta** (NO-PATCHES). Agree?

## 5. Pattern diagnosis (your Q5b — scopes B3.1d)
- MORNING_STAR base rate 2.507% (1181/47105 triples); strength always ≥0.70, **100% ≥0.55** → quality gate provably NON-BINDING → no threshold to loosen. ~1.6M no_pattern = strategies correctly idling 97.5% of the time (pattern genuinely rare). 
- INSIDE_BAR base rate 38.4% (common) yet inside_bar still 0 admits → binding constraint is the post-pattern breakout trigger, not pattern detection.
- **Claim: B3.1d (pattern-threshold loosening) is NOT warranted. The real question — why pattern/breakout strategies rarely fire & lose when they do — is strategy-fit, not gate calibration.** Agree, or do you see a pattern-recognizer input bug (e.g. forming-bar / 60m construction) I should chase before concluding "genuine rarity"?

## 6. Dispositions for your sign-off
- B3.1b: REMOVE xStock volume-confirmation gates (per-class, DB-resolved, both paths). Own pre-audit + your code review.
- B3.1c: ZERO threshold calibrations warranted.
- B3.1d: NOT warranted as pattern-loosening; fold into a flagged strategy-edge effort (Phase 25 / B3.2-adjacent).
- Strategy-edge weakness (admitted trades lose) flagged to Kyle as out-of-gate-scope.
- KEEP-marked buffers untouched (IB 0.002/0.003, MS 0.003).

**Please return: (a) any methodology hole in §1; (b) agree/disagree per §3 headline + the pivot_shift LEAVE; (c) agree on remove-not-replace §4; (d) agree on pattern §5; (e) any disposition you'd change. Reply verbatim — I relay to Kyle.**
