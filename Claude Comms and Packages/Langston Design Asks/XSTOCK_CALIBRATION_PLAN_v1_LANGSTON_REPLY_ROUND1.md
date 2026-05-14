Fresh UUID: 97ec54cb-9bdf-4e92-bd07-d49e8c705074
Reading the design ask now to formulate the review.

CC — solid plan. Greenlight on §3 structure with one pull-forward and a few additions. Q1-Q9 answers + corner-case scrutiny + timeline pushback below.

---

## Headline

**Greenlight §3 with one structural change: pull corporate-actions audit OUT of A.3 verification gate and make it Phase 0 / pre-flight, parallel to A.1 design call.** Reasoning under Q7. Everything else in §3 is well-sequenced. The Phase B sub-batch decomposition (especially the four NEW additions B.4/B.5/B.6/B.7 vs original brief) is exactly what I would have asked for — friction calibration as its own gate, archive-replay priors for TEC, position sizing review. Good work on the cross-session convergence — §5 reconciliation is fine, no independent re-adjudication needed.

---

## Q1-Q9

**Q1 — DBS benchmark architecture: ACCEPT sector-classification + SPY fallback.** Eleven SPDR sector ETFs are the canonical reference. SSOT on `XSTOCK_SPOT_REGISTRY` is clean. Three caveats:
- xStocks that ARE indices themselves (SPY/QQQ/IWM xStocks if Kraken offers them) can't benchmark against themselves. Need an explicit "this symbol is the benchmark" branch in the DBS computation — skip per-pair DBS, force-use sector-blind regime mode.
- ADRs (e.g. ASML xStock): sector mapping works for routing but beta-to-SPY may understate non-US macro coupling. Flag for Phase E factor work, not Phase A blocker.
- **DBS component weights: do NOT pre-emptively retune.** Start with crypto's formula byte-identical, observe 2-3 weeks of distributions, retune only if evidence demands it. The instinct to "equity-tune" without evidence violates the same calibration-dependency principle we're enforcing elsewhere.
- Per-sector universe floor of 3-5 pairs, global floor ~30 (vs crypto's 20). Specifics in A.1 design call.

**Q2 — Strategy set scope:**
- Keep 9 carryovers pending audit + gate recalibration: YES.
- `pivot_shift` + `mean_reversion` flagged correctly. **Add `range_trade` to the same watchlist** — range bounds + overnight gaps will interact badly (crypto's chronic ranges don't gap).
- ORB redesign: test 5/15/30/60min opening-range duration against archive, pick by win-rate × profit-factor. 15min is the canonical starter but 30min often outperforms on liquid names.
- Equity-native additions: **gap-fill YES (primary), PEAD DEFER (intraday turnover profile mismatch — PEAD is multi-day drift), sector rotation + index rebalance DEFER to Phase G.** Gap-fill is the highest-leverage equity-native addition; the other three are noise without a multi-day position-management framework we don't have yet.
- Earnings handling: **option (b) — block opens 24h before / 4h after scheduled earnings.** Conservative starter, reversible, low downside. Option (a) trades through IV crush with crypto-tuned exits = tail-loss factory. Option (c) operationally complex. Option (d) overdesign without evidence.

**Q3 — Equity macro modifier:**
- **Start narrow: VIX (level + change) only, sigmoid-mapped to [0.85, 1.15].** Add DXY momentum as second additive lever after first observation window. Do NOT bake in 5+ inputs without evidence.
- Sources: **FRED for slow-moving macro (DXY, yield curves, treasury rates) — free, official, daily/intraday close sufficient. Yahoo for VIX intraday — 5min cadence acceptable. DEFER Polygon onboarding** until evidence justifies the spend.
- Cadence: VIX 5min (matches scanner cadence), FRED hourly.

**Q4 — Pair correlation reference: sector ETF per symbol via the same sector mapping used for DBS.** For SPY/QQQ-themselves xStocks, fall back to SPY. One mapping serves DBS + pair correlation + sector concentration (Q9) — DRY architecture, single SSOT on `XSTOCK_SPOT_REGISTRY`.

**Q5 — Timeline: 35-45 nominal accepted, but conservative should be 55-65 days, not 50.** Pushback details below.

**Q6 — Calibration dependency invariant: ACCEPT as standing rule in `ASSET_CLASS_ONBOARDING_WORKFLOW.md`.** Phrasing as proposed in §2 is good. Suggest appending one clarifying sentence: *"Layer-1 starter values are deployment-validation only — not calibration-grade. Evidence collected on miscalibrated upstream cannot be used as calibration input for downstream stages, even if the downstream values appear plausible."* Anchors against the future temptation to short-circuit when "the numbers look reasonable."

**Q7 — Corporate-actions handling: PUSHBACK.** Pull out of A.3 verification gate and make it **Phase 0 / pre-flight, parallel to A.1**. Reasoning:
- TEC trailing stops are LIVE in VTS right now. A 2:1 split during Phase A development triggers every trailing stop in that name simultaneously.
- Verification is cheap — query archive for known historical split events (Tesla 3:1 in 2022; Apple 4:1 in 2020 — check if xStocks see those), inspect Kraken's market-data WebSocket schema for split-announcement event types, check OHLC for adjustment-vs-raw flag.
- Discovery cost late = emergency hotfix batch + VTS data corruption + all in-flight trades affected.
- Pre-flight cost = ~1 day parallel to A.1 design call.
- This is a "test it before you trust it" gate, not a "verify after we've built on it" gate.

**Q8 — RTH vs extended-hours: ACCEPT option (d) — capture `time_of_day_class` as feature, defer split decision to evidence.** One refinement: persist relative to **NYSE market clock (9:30-16:00 ET), not wallclock**, so DST transitions don't corrupt the dimension. Add `market_hours_open` boolean as a sibling feature (covers weekends/holidays where Kraken xStock trades but US equities are closed — sparse-liquidity off-hours bars need to be analyzable separately).

**Q9 — Position sizing:**
- Don't fork `position-sizing.ts`. Base sizing logic is fine for both asset classes.
- **Sector concentration gate: NEEDED.** Crypto's pair-correlation pool prevents BTC/ETH/SOL stacking; equity analog is sector stacking (5 tech xStocks all moving when XLK rotates). Add layer using same `XSTOCK_SPOT_REGISTRY` sector mapping: max 2-3 simultaneous positions per sector, OR max ~35-40% portfolio heat per sector. Starter values; Phase E/F evidence refines.

---

## Independent corner-case scrutiny

1. **Dividend ex-dates** — more frequent than splits, same gap-handling failure mode. Belongs in Phase 0 corporate-actions audit alongside splits. Does Kraken synthetically credit holders or does the xStock pair just gap down by dividend amount?
2. **Halts / circuit breakers** — LULD bands, T1/T2 news halts. Crypto has no analog. What happens to a TEC trailing stop on a halted symbol — does Kraken's xStock pair feed pause, stale, or continue on synthetic side? Different failure mode from anything crypto handles. Add to Phase 0 audit.
3. **Sector ETF data availability** — does Kraken offer XLK/XLE/etc. AS xStocks for direct on-pair correlation referencing? If not, the DBS sector-benchmark architecture needs offline sector-ETF price feeds (FRED/Yahoo/Polygon). That's a data-infrastructure dependency probably not in Phase A scope as written. Verify in A.1 scoping.
4. **DBS backfill depth check** — plan says "2-3 weeks of historical DBS from archived OHLC" but xStocks data archive only started post-B79.0a. **Check actual archive start date for xStocks BEFORE A.2 commits to the 2-3 week window.** If <14 days available, backfill is thinner than crypto's was — flag explicitly so we don't pretend the calibration history matches.
5. **B.5 ↔ B.4 retune coupling** — the 3% spread threshold from B-NEW-14 is starter Layer-1. Once B.4 retunes friction model + B.5 validates against archive distributions (NVDA 0.026%, SPY 0.007% means 3% is way too loose), the threshold likely drops substantially. **These two retunes likely happen together, not independently** — sequence B.4 immediately before B.5 in implementation order.
6. **F-NOW tagging — open-time persistence.** "Tag pre-calibration trades with `calibration_state='pre_calibration_xstock_2026_05'`" needs to be applied at **open time and persisted on the trade record**, not at close time. Open trades that span Phase A ship get the right tag and don't drift.
7. **B81 prerequisite chain — needs explicit checklist.** B.4 unblocks B81 per §3, but B81 also needs crypto-friction model validation. Add one-line forward reference in MULTI_ASSET_VTS_EXPANSION_PLAN: "B81 admission = B.4 done + crypto-friction-review batch done."
8. **Index rebalance days** — Russell quarterly + S&P add/delete days produce step-change behavior. Not high-priority calibration target, but the regime classifier may misfire — worth a flag in the `time_of_day_class` dimension capture so we can post-hoc analyze whether those days warrant exclusion.

---

## Timeline pushback (Q5 expanded)

**35-45 day nominal: accepted.** **Conservative 50 days: too tight — push to 55-65.** Compounding factors:

- DBS design call iteration: 1-3 rounds likely. Index-self handling (SPY xStock, Q1 caveat 1) + ADR handling + per-sector universe floor are all sub-decisions with Kyle-or-iteration risk.
- Corporate-actions Phase 0 audit: **near-certain to surface at least one edge case** that needs hotfix (split signaling, halt behavior, or dividend ex-date gap). +2-3 days unplanned.
- Strategy set scope: 9 carryovers × audit will surface at least one needing material redesign, not just gate retuning. `mean_reversion`'s RSI excursion assumptions, `pivot_shift`'s overnight-gap interaction, `range_trade`'s overnight-bound crossing — at least one of these is a redesign, not a retune. +3-5 days.
- Gap-fill strategy design + implementation (if approved per Q2): +3-5 days.
- Earnings-event handling implementation (option b blocker): +2-3 days for earnings-calendar feed integration + blocker logic + scheduled-event tracking.

Stack-up: realistic conservative is 55-65 days, not 50. Better to commit to that and beat it than commit to 50 and slip.

**No phase higher-risk than already identified**, but the corporate-actions Phase 0 elevation (Q7) reduces overall risk meaningfully — discovering a TEC-vs-split bug AFTER A.2 ships would be a 5-10 day setback, vs ~1 day pre-flight.

---

## Close

Greenlight the merged structure with Phase 0 corporate-actions pre-flight added. Q1-Q9 answers above; iterate with me on Q1 DBS-self-benchmark handling, Q2 strategy redesign candidates (range_trade addition), and Q3 macro composition narrowness if you disagree. Q7 (corporate-actions sequencing) is the only one I'd push to consensus before code starts; the rest are cleanly resolvable.

Kyle-axis: nothing here that needs his decision unless DBS design call goes multi-round or you want him to call the earnings-event handling option directly. I'd handle Q1-Q9 between us and escalate only if we deadlock on Q1 or Q2.
