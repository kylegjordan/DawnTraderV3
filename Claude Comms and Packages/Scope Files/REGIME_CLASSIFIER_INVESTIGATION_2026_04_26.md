# Regime Classifier Investigation — 2026-04-26

**Trigger:** Kyle question 2026-04-26: "How is it that our global regime is saying one thing, but all of our trades open during that period say otherwise? Is our global regime calculation an issue?"
**Triggering events:** 04-18 (B63 streakiness day, 70-loss streak) and 04-22 (B65.5 Phase A0 hostile-window finding) — both classified globalRegime = TREND_FRIENDLY_STABLE while system-wide WR collapsed to 9.7% and 18.8% respectively.
**Status:** Investigation complete. Findings actionable.
**Owner:** CC investigation, Langston review pending, Kyle decision pending.

---

## 1. TL;DR

**The global regime aggregation is doing what it was designed to do — it's not a bug.** It returns the most-common per-pair regime classification across the active pair universe. The disconnect between "globalRegime = TFS" and "WR collapses" comes from two layers below the global aggregation:

1. **The per-pair regime classifier (`server/core/metrics/market-regime.ts`) over-classifies pairs as TREND_FRIENDLY_STABLE.** A single condition (`|DBS| >= 0.30`) is sufficient to tag a pair TFS, with no check for trend sustainability. On strong-direction days that condition is trivially true for the majority of pairs. The classifier was tuned for *flicker stability*, not for *outcome alignment* — code comment in market-regime.ts:160 confirms "Threshold 0.30 is the only tested value that passes 2.0% flicker ceiling."
2. **The directional bias score is a lagging indicator.** It correctly captures recent realized price movement but does not predict imminent reversal. On 04-22 the system read globalDBS = +0.473 (UP_MODERATE/STRONG, 98% of pairs bullish), routed 177 trades to `strong_bull_trend`, and lost 84% of them — the canonical "lagging-bullish-signal-at-the-top" failure. Of 194 losing trades, 191 (98.5%) exited at price < entry; the bias signal was confidently wrong about direction.

**On 04-22, per-pair regime confidence was inverted from outcome:**

| Per-pair regime | Trades | WR |
|---|---:|---:|
| TREND_FRIENDLY_STABLE (most confident "stable trend") | **195** | **13.8%** |
| IMPULSE_EXPANSION | 22 | 36.4% |
| RANGE_BOUND_STABLE | 12 | 33.3% |
| HIGH_VOLATILITY_UNSTABLE | 4 | 25.0% |
| **STRUCTURAL_TRANSITION** ("regime in flux", least confident) | **6** | **83.3%** |

The classifier's confidence ordering was inverted from what actually worked.

**Recommendation:** open a future batch to audit the per-pair regime classifier (specifically the TFS triggering conditions), tighten the `|DBS| >= 0.30`-only-path to require additional non-lagging confirmation, and design Phase 19.5 AMR detection to NOT rely solely on `globalRegime` as a hostile-window signal — it does not separate hostile from clean conditions.

---

## 2. The mechanism — how globalRegime is computed

`server/services/vts-runner.ts:1249-1251` (called at every trade open):

```typescript
globalRegime: (() => {
  try { const ta = getTelemetryAggregator(); return ta.getDominantRegime?.()?.regime ?? regime; } catch { return regime; }
})(),
```

`server/services/telemetry-aggregator.ts:1216-1254` (`getDominantRegime`):

```typescript
getDominantRegime(): { regime: MarketRegime; ... } | null {
  for (const [, entries] of this.pairTelemetry.entries()) {
    const recent = entries.filter(t => now - t.lastUpdated < this.historyWindowMs);
    if (recent.length === 0) continue;
    const latest = recent[recent.length - 1];
    const regime = latest.pairRegime ?? this.currentRegime;
    if (!regimeCounts[regime]) regimeCounts[regime] = { count: 0, totalScore: 0 };
    regimeCounts[regime].count += 1;
    regimeCounts[regime].totalScore += latest.regimeScore ?? 50;
  }
  const sorted = Object.entries(regimeCounts).sort((a, b) => b[1].count - a[1].count);
  return { regime: sorted[0][0], avgRegimeScore, pairCount, percentage };
}
```

**Reading:** `globalRegime = mode(per-pair regime across active pair universe)`. So when "globalRegime = TFS for 100% of trades on a given day" it means "for every trade open on that day, the most common per-pair regime was TFS." That's a true statement about the per-pair classifier's outputs aggregated; it doesn't tell you anything about whether the per-pair classifications were right.

---

## 3. Per-day data — the visible inversion

Pulled from VTS log JSONL files at `/home/deploy/dawntrader/logs/virtual_trades/2026-04-{18..25}.json`, deduplicated by trade `id`, grouped by entry day. All trades in `status=closed`.

| Day | n | WR | sumNet | globalRegime | per-pair TFS share | globalDBS mean |
|---|---:|---:|---:|---|---:|---:|
| 2026-04-18 | 154 | 9.7% | −$3.34 | 100% TFS | 45% | −0.057 (NEUTRAL) |
| 2026-04-19 | 83 | 36.1% | −$2.03 | 100% TFS | 63% | −0.234 (DOWN_MOD) |
| 2026-04-21 | 61 | 59.0% | +$0.14 | 70% TFS / 30% RBS | 38% TFS / 54% RBS | +0.324 (UP_MOD) |
| 2026-04-22 | 239 | 18.8% | −$5.23 | 100% TFS | **82%** | **+0.473** (UP_MOD/STRONG) |
| 2026-04-23 | 56 | 41.1% | −$0.21 | 98% TFS | 48% | +0.501 (UP_MOD) |
| 2026-04-24 | 186 | 36.0% | −$1.67 | 100% TFS | 62% | +0.611 (UP_STRONG) |
| 2026-04-25 | 137 | 27.0% | −$1.05 | 99% TFS | 88% | +0.508 (UP_MOD) |

**Observations:**

- **globalRegime is almost always TFS regardless of day quality.** Only 04-21 and 04-23 had even partial RBS classification; every other day was 98–100% TFS at the global aggregation level. The global aggregation does not separate good days from bad days at all. This alone disqualifies it as the AMR detection signal.
- **04-18 and 04-22 are different in the bias dimension despite both being catastrophic.** 04-18 was NEUTRAL globalDBS (mean −0.057); 04-22 was strongly bullish (+0.473). Both produced ~10–20% WR. **Bad days come in different shapes — both directionally-confident-bullish and directionally-uncertain.** AMR cannot rely on globalDBS alone either.
- **04-22's per-pair TFS concentration (82%) is the highest of any day in the window.** The classifier was MOST confident about "stable trending" on the day with the second-worst WR. Inverted signal.
- **04-25 has 88% per-pair TFS share and globalDBS +0.508**, very similar to 04-22 conditions, but only 27% WR (vs 18.8%). Same classifier readings, different outcomes — suggests there's at least one input the classifier doesn't capture that distinguishes "actually stable bullish trend" from "looks-stable-bullish-but-about-to-reverse."

---

## 4. The smoking gun — per-pair classifier code path

`server/core/metrics/market-regime.ts:147-174`:

```typescript
if (vol < 0.012 && dx < 45 && absDbs < 0.10) {
  // Low vol + low ADX + low DBS = genuine ranging market
  regime = REGIMES.RANGE_BOUND_STABLE;
  confidence = 0.75 + (0.012 - vol) * 12;
} else if ((vol > 0.020 && dx > 55) || (vol > 0.015 && absDbs >= 0.50)) {
  // High vol + strong direction OR moderate vol + very strong DBS = impulse
  regime = REGIMES.IMPULSE_EXPANSION;
  confidence = 0.65 + (vol - 0.015) * 6 + (dx - 45) * 0.002 + absDbs * 0.1;
} else if ((mom > 0.003 && dx > 50) || absDbs >= 0.30) {       // ⬅ TFS branch
  // B62: Positive momentum + directional strength OR moderate+ DBS = trend
  // (pre-B62: TFS was 13.2%; now 34.6% as directional pairs correctly routed)
  // Threshold 0.30 is the only tested value that passes 2.0% flicker ceiling
  regime = REGIMES.TREND_FRIENDLY_STABLE;
  confidence = 0.70 + Math.min(Math.max(mom, 0) * 8, 0.15) + Math.min(absDbs * 0.3, 0.1);
}
```

**The TFS branch fires when EITHER:**

- Path A: positive momentum > 0.003 AND ADX > 50, OR
- Path B: **`|DBS| >= 0.30` (alone)**

**Path B is the problem on strong-direction days.** DBS is built from recent realized price movement. On a strongly bullish day where most pairs have moved up over the prior look-back, `|DBS| >= 0.30` is trivially true for the majority of the pair universe — by construction, not by edge.

Once Path B fires, the pair is tagged TFS with confidence = 0.70 + (small bonuses up to ~0.25) regardless of whether:
- ADX is high enough to confirm the move is sustained (Path A would have required ADX > 50)
- Momentum is fresh or exhausted
- Volume is supporting the move
- Price is at the top of the recent range or in the middle
- The DBS reading is rising or peaking

**The code comment confirms the design priority:** *"Threshold 0.30 is the only tested value that passes 2.0% flicker ceiling."* The threshold was tuned to keep the classifier from changing its mind too often (flicker stability). It was NOT tuned for outcome alignment. The 04-22 evidence shows what that trade-off costs.

---

## 5. The lagging-indicator failure

On 04-22, the system was:

1. Reading globalDBS = +0.473 (UP_MODERATE/STRONG) — recent realized price movement was bullish
2. Reading per-pair regime = TFS for 195 of ~239 pairs traded — Path B (|DBS|≥0.30) was firing for almost everyone
3. Routing trades to `strong_bull_trend` (177 of 239 = 74%) — the strategy designed to ride sustained bullish trends
4. Receiving stop_loss exits on **66% of all trades** (157 of 239) — well above the ~33% you'd expect on a balanced 2:1 R:R day
5. Of the 194 losing trades, **191 (98.5%) exited at exit < entry** — price moved DOWN after entry, not random noise
6. Mean trade duration 13.4 hours, p90 = 24 hours (the VTS hard timeout) — trades carried the entire reversal day

The directional bias signal correctly reflected "what the market was just doing" but did not predict "what the market is about to do." On 04-22 those were opposite. The system entered into the lagging bullish read and got reversed on entry.

**This is the structural issue with relying on price-history-derived signals to drive entries:** they are most confident at the top of moves (because the recent history is most bullish), and the top of moves is exactly when reversal risk is highest.

---

## 6. Why globalRegime cannot be the AMR detection signal

Phase 19.5 AMR §10 (concept doc, 2026-04-26 update) needs canonical positive cases to design against. Both 04-18 and 04-22 are positive cases, but **globalRegime alone fires identically on both bad days (TFS) and good days (also TFS)**. It has no separating power.

What WOULD separate 04-22 from 04-25 (which had similar per-pair classifications but better WR)?

Candidate signals to test in the Phase 19.5 calibration:
- **Realized-vs-predicted EV gap** — already in the existing telemetry. If predicted EV is +X% but realized is −Y% across the last N closed trades, that's a hostile signal.
- **Stop-loss-to-take-profit exit ratio rolling window** — 66% SL share on 04-22 is a strong leading indicator within the day. By hour 5 (52 trades, 15.4% WR), the system could have flagged hostile conditions.
- **Per-pair regime confidence vs outcome lag** — track rolling correlation between per-pair regime confidence and trade outcome over the last N hours. When confidence and outcomes diverge, throttle.
- **Cross-pair outcome dispersion** — on clean days, some strategies win and some lose. On hostile days, EVERYTHING loses. Low cross-strategy outcome dispersion is itself a hostile signal.
- **External signals (B67)** — funding rates, BTC dominance, exchange flows — independent of internal classifier, may catch hostile conditions the internal classifier misses by construction.

---

## 7. What this is NOT

- **Not a bug in the global aggregation.** `getDominantRegime` correctly returns the most-common per-pair regime. The global aggregation is doing what it was designed to do.
- **Not a B62 regression.** B62 successfully addressed the previous classifier issues (RBS drift contamination dropped 70.2% → 0.00%, TFS+IE share normalized). The remaining issue is a different layer — TFS classification *itself* is over-broad on the Path B (`|DBS| >= 0.30`) trigger.
- **Not unique to vwap_pullback or strong_bull_trend.** The over-broad TFS classification affects every strategy mapped to TFS. On 04-22, even strong_bull_trend (the strategy designed for this regime) lost 84% of its trades.
- **Not the same as the directional bias issue.** The lagging-indicator failure (§5) is a separate-but-compounding issue. Tightening the per-pair classifier alone won't fix entries that get reversed on a lagging signal; both layers need attention.

---

## 8. Recommendations

### 8.1 New future batch — Per-pair regime classifier audit (separate from B65.5)

Open a queued slot for a focused audit of `server/core/metrics/market-regime.ts`. Scope:

- **Audit Path B (`|DBS| >= 0.30` alone) trigger condition.** Test whether requiring an additional non-lagging confirmation (e.g., ADX > 35 OR momentum > 0.002 OR volume ratio > 1.2) would have excluded the over-broad TFS classifications on 04-22 while preserving the correct TFS classifications on 04-21 / 04-23.
- **Re-tune the 0.30 threshold for outcome alignment, not flicker stability.** The flicker constraint can be re-imposed as a separate downstream guardrail (smoothing layer) rather than baked into the threshold itself.
- **Evaluate adding a confidence-decay term.** When DBS reading has been at the same level for >N cycles, treat the reading as exhausted-trend rather than fresh-trend.
- **Output:** scope decision document. Implementation only if the audit shows the change improves outcome alignment without degrading flicker beyond the existing 2% ceiling.

### 8.2 Phase 19.5 AMR — multi-input detection signal (already in concept doc §6)

The investigation confirms the AMR concept doc's existing position that the detection layer must be a multi-input aggregator, not a single-classifier read. Adding to the existing list in §6:

- Realized-vs-predicted EV gap (rolling N-trade window)
- Stop-loss-to-take-profit exit ratio (intraday rolling)
- Cross-strategy outcome dispersion
- Per-pair regime confidence vs outcome rolling correlation
- (B67 external signals as Tier-2 additions)

### 8.3 Methodology note for Phase 19.4 SQE recalibration (already added 2026-04-26)

The SQE Item 18 audit findings (FinalScore anti-predictive r=−0.017, D9 WR 15.3%, only quant-strong_trend net-profitable) were generated from the same observation period that includes 04-18 and 04-22. Per the methodology requirement added to POST_AUDIT_ROADMAP.md Phase 19.4, those findings must be re-validated with sibling-strategy WR controls and per-day quality segmentation before any Phase 19.4 recalibration changes are acted on. The plausible alternative explanation — that those findings reflect window-quality contamination rather than SQE failure — is now strong enough to require validation.

### 8.4 Update AMR canonical positive cases

`ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §10 already includes 04-18 and 04-22. Add an additional note: the *separating signal* between hostile and clean days is NOT globalRegime (always TFS) and is NOT globalDBS alone (different on the two hostile days, neutral on 04-18 and bullish on 04-22). It IS some combination of (a) per-pair regime concentration plus (b) some non-lagging input not currently in the system.

---

## 9. Status of the cohort metric reframe

The Phase A0 finding that B63 Item 13's BUILD_DEDICATED verdict was confounded by hostile-window contamination is **strengthened** by this investigation. Item 13's cohort happened to land in a window dominated by a single day where the classifier was confidently wrong. The verdict reframe to INCONCLUSIVE — INSUFFICIENT EVIDENCE stands and may need to extend to other B63 audit findings (Item 18 SQE specifically — see §8.3).

---

## 10. Files referenced

- `server/services/vts-runner.ts:1249-1251` — globalRegime field assignment at trade open
- `server/services/telemetry-aggregator.ts:1216-1254` — `getDominantRegime` aggregator
- `server/core/metrics/market-regime.ts:147-174` — per-pair regime classifier
- `Claude Comms and Packages/Scope Files/B65_5_PHASE_A0_WINDOW_CONTROL.md` — triggering Phase A0 finding
- `Claude Comms and Packages/Scope Files/B63_STREAKINESS_ANALYSIS.md` — 04-18 evidence
- `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §10 — canonical positive cases
- `1-system-manual/POST_AUDIT_ROADMAP.md` Phase 19.4 — SQE methodology requirement
- `/home/deploy/dawntrader/logs/virtual_trades/2026-04-{18..25}.json` — VTS data sources
- Analysis scripts preserved on staging at `/tmp/regime_invest.py` and `/tmp/regime_invest2.py`

---

## 11. Items 15 + 19 spot-check addendum (added 2026-04-26 same-day)

Per Kyle directive 2026-04-26, spot-checked the other major B63 audit findings (Items 15 and 19) for the same window-confound that affected Item 18.

**Item 15 — ExpectedEdge anti-predictive (claimed r=−0.130):**

| Segment | n | WR | r |
|---|---:|---:|---:|
| Full window | 2212 | 38.0% | −0.020 |
| HOSTILE days | 569 | 16.5% | +0.014 |
| CLEAN days | 1220 | 51.6% | −0.056 |
| MIXED days | 423 | 27.4% | +0.133 |

**Verdict:** original claim (r=−0.130) does not replicate at the strength claimed in any segment. Whatever signal exists is weak. Could be a tighter cohort or different computation method in Item 15. **Do not act on Item 15's ExpectedEdge anti-predictive finding without re-validation.**

**Item 15 — PredConf self-cancellation (qualitative claim, design flaw):**

| Segment | n | WR | r |
|---|---:|---:|---:|
| Full window | 2212 | 38.0% | −0.064 |
| HOSTILE days | 569 | 16.5% | −0.097 |
| CLEAN days | 1220 | 51.6% | −0.028 |
| MIXED days | 423 | 27.4% | +0.034 |

**Verdict:** PredConf shows mild anti-predictivity that's amplified on hostile days but persists weakly even on clean days. **Item 15's PredConf design-flaw claim probably stands at the design level even with hostile-window influence.** Do re-validate with sibling-strategy WR controls before any Phase 19.4 action.

**Item 19 — Scan-cycle batch correlation (claimed 87.8% same-outcome):**

| Segment | Multi-trade batches | All-same outcome | % |
|---|---:|---:|---:|
| Full window | 213 | 170 | 79.8% |
| HOSTILE days | 75 | 64 | 85.3% |
| CLEAN days | 101 | 79 | 78.2% |
| MIXED days | 37 | 27 | 73.0% |

**Verdict:** original claim (87.8%) reproduces approximately (my 79.8% on a slightly different methodology), AND the correlation IS higher on hostile days (85.3% vs 78.2% clean). **The "scan-cycle batches correlate" finding is partly window-driven** — on hostile days, all trades in a batch trivially correlate because everything loses. The actual interpretation needs adjustment: it's not (or not only) "scan cadence is wrong"; it's "same-cycle trades all see the same global market state, which dominates short-horizon outcome more than per-strategy edge does." **This is itself an argument for the AMR approach (catch hostile windows) rather than per-strategy detector tweaks.** Item 19's MCE-cadence-correct conclusion remains valid; only the interpretation of the batch-correlation finding needs re-framing.

**Summary across all three audits:**

| Audit | Hostile-window confound severity |
|---|---|
| Item 18 SQE | **HEAVY** — FinalScore anti-predictive is a hostile-window artifact; "only quant-strong_trend net-profitable" doesn't replicate |
| Item 15 ExpectedEdge | **WEAK / DOES NOT REPLICATE** — original strength may be a different cohort |
| Item 15 PredConf | **MILD AMPLIFICATION** — real design-level issue, hostile-amplified |
| Item 19 batch correlation | **REINTERPRETATION NEEDED** — finding stands as data; interpretation shifts from "cadence" to "global-state dominance" |

**Phase 19.4 SQE recalibration must apply sibling-strategy WR controls + per-day quality segmentation when re-validating any of these findings before acting on them.** That requirement was added to POST_AUDIT_ROADMAP.md Phase 19.4 + POST_B62_PRE_LAUNCH_PLAN.md in the 2026-04-26 governance commits.

---

*End of investigation. Findings actionable. Awaiting Langston review + Kyle decision on §8.1 (now B65.6, scope drafted 2026-04-26 — see `BATCH_65_6_SCOPE.md`) and §8.3 (SQE Item 18 re-validation requirement, now codified in POST_AUDIT_ROADMAP Phase 19.4).*
