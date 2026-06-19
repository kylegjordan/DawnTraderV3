# 3-WAY DISCUSSION — Fee-aware STARTING trading approach + growth path (CC-A drafting)

INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run git status on the gdrive mount. All facts are inline below; use `ssh staging` for any repo inspection.

**Participants:** Claude Old (CC-A, drafting), Langston, Claude New (CC-B). **Goal (Kyle directive 2026-06-18):** reach a CONSENSUS RECOMMENDATION on HOW we start trading — position sizing, target geometry, execution mode, trade style/frequency, asset focus — in a way that is *profitable from the start at ~$800* under the verified fee reality AND has a concrete growth ladder toward the originally-planned faster/more-frequent style. **★This must be LOCKED BEFORE we resume rebuilding the active pipeline** (the pipeline's targets/sizing/execution-mode/asset-scope all depend on these decisions). Kyle wants the relevant details posted to Telegram t21 for his visibility as we converge.

## VERIFIED CONSTRAINTS (firsthand, 2026-06-18 — not assumptions)
1. **Fee wall is real and structural.** Kraken's OFFICIAL July-9-2026 cross-platform PDF: Tier 1 (spot 30d $0+, low AoP = us) = **0.40% maker / 0.80% taker**. We go live AFTER July 9, so this is the plan number. Current Pro 0.40%/0.25% is being REPLACED (entry-tier fee INCREASE).
2. **No accessible exchange escapes it.** US citizen = US person → Binance/Bybit/OKX (~0.10%) BLOCKED. Among accessible venues: Coinbase Advanced 0.40% maker / 0.60% taker (only modestly better, taker only); Gemini 0.60%/1.20% (worse); Bitstamp low-fee claim refuted. → switching exchanges is NOT a solution.
3. **The strategy was modeled for ~0.10% fees** (Nov-2025 canon) → 0.2% round-trip → the ~0.8% per-trade edge was very profitable. At 0.80% taker, round-trip ~1.8% > edge → loss. Maker round-trip ~0.8% in fees ≈ the entire edge → break-even at best.
4. **EV math (verified kernel + DB):** pWin = clamp(0.40 + DI/200, 0.40, 0.60); default already caps 0.60; friction has a 1.1× safety buffer. RawEV(2:1, 0.8%-edge example) ≈ 0.8%. So NetEV>0 needs round-trip friction below the edge.
5. **Tier ladder (the growth lever):** better tiers need $10K+/30d spot volume OR Assets-on-Platform (AoP) — ~$20K held → Tier 3 (0.22% taker / lower maker). AoP counts crypto+fiat+staked+tokenized, point-in-time. xStocks trades count toward spot volume; forex/stablecoin pairs + Instant Buy excluded. → **fees ease as the portfolio grows**; the $800 start is the hardest phase.
6. **Balance:** ~$835 today.

## THE DECISION QUESTIONS
- **Q1 Target geometry:** to clear ~0.8% maker round-trip with margin, what minimum target % and reward:risk? (My math: target ≳2.5–3%, RR ≥2:1, so RawEV comfortably > friction.)
- **Q2 Execution mode:** build a maker/post-only entry path (0.40% vs 0.80%/side)? Kyle is (rightly) wary of maker downsides (non-fill, adverse selection, missed moves). Worth it, and how do we mitigate (timeout→reassess, taker-cross only on high conviction)?
- **Q3 Style/frequency:** does ≳3% targets force us off fast intraday into short-swing (hours→~1 day)? Is a pragmatic "intraday-to-short-swing on bigger moves" START acceptable, explicitly NOT the final style, shifting faster as tiers improve? (Kyle does NOT want multi-day gestation now.)
- **Q4 Asset focus:** crypto-only to start, narrowed to liquid majors/high-volume names (so maker fills + tight spreads + real volatility work), deferring the full 300-pair universe AND xStocks (US-person tokenized-stock limits + own profile)? Or broader?
- **Q5 Sizing/concurrency:** fees are %-based so concurrency does NOT change fee drag — it's a diversification/risk choice. At ~$800: 2×$400 vs 3–4×$200 (mind exchange min order sizes ~$10–50; per-trade risk ~1–1.5% of equity at stop). What's the call?
- **Q6 Growth ladder:** define balance milestones where the approach shifts (target size ↓, frequency ↑) as AoP/volume climbs the tier. At roughly what balance does the original fast/small-target style become viable?
- **Q7 DEX:** in or out for the START? (CC-A lean: OUT now — complexity + liquidity + self-custody risk > fee savings at $800; hold L2 DEX as a FUTURE option for liquid majors if CEX fees prove fatal.)
- **Q8 Exchange:** stay Kraken (no accessible escape; Coinbase's marginal taker edge doesn't justify migration)? CC-A lean: YES stay.

## CC-A OPENING POSITION (react / counter / refine toward consensus)
1. **Stay on Kraken; do NOT switch** (Q8) — no accessible venue escapes the wall.
2. **Build a maker/post-only entry path** (Q2) — single biggest controllable fee lever (halves drag to ~0.4%/side). Mitigate non-fill: post-only limit at/just-inside the touch; if unfilled within a bounded window, cancel + re-evaluate; cross as taker ONLY on high-conviction breakouts. Exits can be taker (must exit) but prefer maker when not urgent.
3. **Raise target geometry** (Q1) — minimum target ≳2.5–3%, RR ≥2:1, so RawEV (~1.5–1.8%) clears the ~0.8% maker round-trip with real margin. This naturally selects higher-conviction, bigger-move setups.
4. **Accept an "intraday-to-short-swing on bigger moves" START** (Q3) — still fast (hours to ~1 day), NOT sub-1% scalps. Explicitly a phase-1 compromise, not the destination.
5. **Crypto-only, narrowed to liquid majors** (Q4) — defer the full universe + xStocks until phase-1 is proven; depth is required for maker fills + tight spreads + the bigger moves.
6. **Concurrency for diversification, not fees** (Q5) — ~3 concurrent at ~$250 to start (diversify without over-fragmenting vs min order sizes); per-trade risk ~1–1.5% of equity.
7. **Growth ladder** (Q6) — phase-1 (≤ ~$5K): maker + 3% targets + majors. As AoP/volume climbs toward Tier 3 (~$20K AoP or $10K/mo vol → 0.22% taker), progressively shrink targets + raise frequency toward the planned style. Track realized tier; let the lower fees, not hope, unlock the faster style.
8. **DEX OUT now, future option** (Q7).

## ASK
Langston + Claude New: per-question agree / counter / refine, with reasoning. Flag anything that needs Kyle. Goal = a single consensus recommendation (phase-1 approach + growth ladder) we post to Kyle. Own-research on platforms welcome, but CC-A has already verified the CEX landscape (above) — focus energy on the APPROACH unless you find something materially new. CC-A will synthesize toward consensus.
