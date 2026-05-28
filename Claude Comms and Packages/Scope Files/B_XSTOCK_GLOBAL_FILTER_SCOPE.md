# B-XSTOCK-CALIB Sub-Batch — xStock Volume/Price Data-Quality + Global-Filter Calibration

**Provisional ID:** B.1.5 (data-quality GATE — sequenced BEFORE B.2 IMF calibration; see §4 Q1 for numbering/sequencing confirmation)
**Umbrella:** B-XSTOCK-CALIB (`1-system-manual/XSTOCK_CALIBRATION_PLAN.md`)
**Type:** Investigation + data-quality remediation + global-filter recalibration. Mix of analysis (replay/SQL) and config/code change.
**Status:** v1.1 — Step 1 Langston ACK = **CLEAN-CONDITIONAL** (3 conditions folded below); awaiting Kyle sign-off BEFORE implementation.
**Authorized by:** Kyle DM 2026-05-28 10:47Z — "proceed with … scoping out the volume/price quality sub-batch." Origin: Kyle screenshot review of xStock 24h volume + stale/dislocated pricing; questions (a) is the volume representative or an artifact, (b) how many of ~485 symbols are worth trading, (c) what's wrong with the dislocated prices, (d) run a standalone global-filter batch or fold into IMF.

---

## §0 — Why this sub-batch exists (VERIFIED findings, not assumptions)

This scope's §0 was drafted AFTER reading the actual ingestion code and querying the live staging archive — NOT from memory. Two prior internal assumptions were **wrong** and are corrected here.

### 0.1 What the data feed actually is (verified)
The xStock price + volume feed is a single WebSocket to Kraken's dedicated equities endpoint (`wss://ws-equities.kraken.com`), in `server/services/passive-archive/equity-spot-archiver.ts`. It subscribes to `ohlc(interval=1)` + `ticker` and stores:
- OHLC bars → `xstock_spot_ohlc_1m` (price comes from bar `close`).
- Ticker snaps → `xstock_spot_ticker_snap`, including `volume_24h` (the raw Kraken ticker `volume` field, line 102) and `last`/`bid`/`ask`.

The scanner (`server/asset_classes/xstock_spot/scanner.ts:609-660`) computes the dollar-volume liquidity figure as **`volume24hUSD = volume_24h (shares) × latest price`**.

### 0.2 CORRECTION #1 — "volume comes from the underlying equity" was unverified
A prior internal note (and an earlier scoping hypothesis) asserted the 24h volume was the underlying NASDAQ/NYSE equity's volume (billions/day) rather than the Kraken-tradeable token's volume. **That was never verified.** The code reads Kraken's `volume` field — but **what Kraken populates that field with (the token's on-exchange volume vs. a passthrough/reference of the underlying-equity volume) is still unknown and is the central open question of this sub-batch.** The empirical numbers (§0.4) make the "real on-Kraken token volume" reading look implausible, but the answer must come from comparing stored values against Kraken's own published xStock volumes, not from a guess in either direction.

### 0.3 CORRECTION #2 — paper-mode and live-mode filter values are NOT identical
A prior note said the `mode` (paper/live) column in `screener_filters` is a "byte-identical write-twice artifact." **The live DB contradicts this** — paper and live diverge for many filter paths (examples below). Any recalibration must treat paper and live as independently-set, not assume mirroring.

### 0.4 What the live staging data shows (queried 2026-05-28, last 6h of ticker snaps, 485 symbols)
- **Volume magnitudes are implausibly large for a thin token venue.** Max computed 24h USD volume ≈ **$2.8 BILLION** (MU/USD); NVDA/USD ≈ $628M; QQQ/USD ≈ $843M; TSLA/USD ≈ $547M; median ≈ $310K. 173 symbols compute to >$1M; 301 >$100K; only 4 symbols zero/null volume. Genuine Kraken xStock-token daily volume is nowhere near hundreds-of-millions-to-billions — so the `volume_24h` field is very likely NOT the on-Kraken token volume. (Note: this is in tension with Kyle's screenshot showing ~$600K max — that discrepancy itself needs reconciling; Kyle may have been viewing a different metric/column/symbol-detail than this 24h figure.)
- **Price dislocations are REAL and symbol-specific.** MU/USD = $910.71 (Kyle flagged ~$916) while NVDA/USD ($210), TSLA/USD ($434), QQQ/USD ($726) all look plausible for 2026. So it is NOT a uniform scaling bug — specific symbols are off while others are correct. SNDK was flagged by Kyle (~$1555) but did not appear in the last-6h snap window (worth confirming whether it's stale/absent). **Caveat:** "dislocated" must be proven by comparison to a reference underlying price — this scope does NOT pre-judge that MU is wrong (memory/AI names can move a lot); it flags it for reference-comparison.

### 0.5 Why the current global filter can't protect against this
The global filter (`server/asset_classes/xstock_spot/global-filter.ts`, `filter_path='active_quant'`) has the right gates but mis-calibrated values:
- **min_volume = $1,000,000** (paper AND live, active_quant). Because min_volume only fails when volume is *known AND below* the floor, and the volume field is the suspect billions-scale number, this floor is effectively meaningless / backwards relative to true liquidity.
- **max_price = 0.00 (DISABLED)** on active_quant → the price-dislocation sanity ceiling is OFF; MU's $910 sails through. (Other filter paths DO set max_price, e.g. 10000 or 99999999.99.)
- **min_price = 5.00** on active_quant (higher than other paths' 0.01-2.00).
- min_volume passes through entirely when volume = 0 (intentional cold-start tolerance), which also masks missing-data symbols.

### 0.6 Why this must be a GATE before the rest of Phase B
B.1 (regime), B.2 (IMF), B.4 (friction), B.5 (spread) all calibrate thresholds against this same volume/price data. **If the volume field is semantically wrong and some prices are dislocated, every downstream calibration is fitting to corrupt inputs.** Establishing data integrity first is a precondition, not a parallel nicety. This is the "data-quality gate" rationale for sequencing this before B.2.

---

## §1 — Scope (numbered objectives + verification criteria)

**O1.0 — (Langston condition #1) Reconcile the Kyle-screenshot discrepancy FIRST.** Kyle's screenshot showed ~$600K max 24h volume; our query computes ~$2.8B max from `volume_24h × last`. That is ~4 orders of magnitude apart. Before any external comparison, reconcile WHAT Kyle was looking at — a different column (per-bar volume? rolling N-minute?), different units, or different aggregation — so O1 doesn't validate against the wrong number.
*Verify:* a written reconciliation identifying the exact metric/column Kyle's screenshot showed vs. the `volume_24h × last` figure.

**O1 — Determine what `volume_24h` actually measures (token vs. underlying vs. reference).**
Compare stored `xstock_spot_ticker_snap.volume_24h` for a representative sample (top/median/bottom by magnitude, ~20-30 symbols) against Kraken's own published xStock-token 24h volume (Kraken REST/market-data for the equities venue) AND against the underlying equity's volume (a reference source). Classify the field: (a) token on-exchange volume, (b) underlying passthrough, (c) something else.
*Verify:* a written determination per sample symbol with both reference numbers, and a single classification conclusion with confidence. If the field is NOT usable as a tradeable-liquidity proxy, O4/O5 change accordingly.

**O2 — Characterize price dislocations and root-cause them.**
For every symbol whose stored price diverges materially from a reference underlying price (threshold TBD in pre-audit, e.g. >50% or >3×), record symbol, stored price, reference price, ratio, and bid/ask. Determine root cause: feed corruption, stale/last-print on illiquid book, unit/parse error, symbol-mapping error, or genuine. MU and SNDK are confirmed starting cases.
**O2.a — (Langston condition #2) Absent-symbol handling as a finding, not a footnote.** SNDK (Kyle-flagged) did not appear in the last-6h ticker snaps. If a flagged symbol is absent from recent ticker data entirely, that's a data-pipeline gap layered on top of the price problem — characterize WHY (subscription gap, symbol-mapping miss, delisted upstream, stale-only) rather than skipping it.
*Verify:* a dislocation table (symbol, stored, reference, ratio, root-cause hypothesis) + a root-cause conclusion for at least the MU/SNDK class + an explicit characterization for any flagged-but-absent symbol.

**O3 — Determine the representativeness of the 24h volume figure (snapshot vs. rolling).**
Per CLAUDE.md rule #13 (rolling windows over snapshots): compare the single-snapshot `volume_24h` against a multi-day rolling distribution rebuilt from `xstock_spot_ohlc_1m` (sum of bar volumes over rolling 24h windows across multiple days). Quantify how much a one-moment snapshot drifts from the rolling figure.
*Verify:* per-symbol snapshot-vs-rolling delta distribution; an explicit "is the snapshot decision-grade" finding.

**O4 — Quantify the tradeable universe (how many of ~485 symbols are worth trading).**
Using the O1/O3 corrected liquidity measure (NOT the raw suspect field if O1 disqualifies it), produce the count of symbols clearing candidate liquidity floors AND sane-price filters, over a multi-week window (not a single snapshot). Multi-week consistency: which symbols are *consistently* liquid vs. intermittently. **O3's rolling-distribution output FEEDS this count directly (Langston Q6) — they are sequenced, not computed twice.**
*Verify:* a table of candidate floors → surviving-symbol counts, plus a consistency classification (always / usually / rarely liquid).

**O5 — Recalibrate the global filter for xStock reality.**
Set evidence-based values for the global-filter gates on the relevant filter path(s): `min_volume` (or replacement liquidity measure), `max_price` (re-enable the dislocation ceiling), `min_price`, in `screener_filters`. Respect `adjustment-registry.ts` bounds (min_volume $50K-$1M, min_price 0.001-1.0, etc.) OR propose bound changes with justification if reality falls outside them. Apply to BOTH paper and live deliberately (not assumed-mirrored — Correction #2).
*Verify:* before/after `screener_filters` rows; a replay or live-cycle showing the recalibrated filter admits the intended liquid universe and rejects dislocated/illiquid symbols, visible in Filter Diagnostics counters.

**O6 — Decide universe-membership liquidity pruning (vs. scanner-stage filtering only).**
Today the universe (`xstock_spot_universe`) delists only on a 30-day time-staleness rule — there is NO liquidity-based pruning; illiquid-on-Kraken symbols enter the scanner and fail per-pair gates each cycle. Decide whether to add a liquidity-based soft-exclusion at universe level (cheaper, cleaner pools) or keep it purely at scanner global-filter stage. Design only if adopted; implementation may defer.
*Verify:* a documented decision with rationale; if adopted, the mechanism + threshold + cadence specified.

**O7 — Build the analysis as a reusable, indexed diagnostic script.**
The volume/price/liquidity/dislocation analysis (O1-O4) is delivered as a committed, re-runnable script (mirroring the B.1a replay-harness disposition) so the multi-week consistency check and future re-validation are repeatable, not one-shot.
*Verify:* committed script with run-command header; produces the O1-O4 outputs from a documented invocation.

---

## §2 — Out of scope

- IMF family threshold calibration (LQ/VN/DI/Correlation) — that's B.2, runs AFTER this gate.
- Regime threshold / confidence-formula re-tuning — B.1 (done) / Phase 25.
- Friction (spread/slippage) + max_bid_ask_spread calibration — B.4/B.5 coupled unit.
- Building a new offline reference-equity *price/volume feed* as production infrastructure. O1/O2 may use a reference source for the *analysis*, but standing up a live equity-reference feed is Phase C/E territory (B-PHASE-E-PRE-1). If O1 concludes the live token feed itself is unusable for trading, that escalates to Kyle as a finding — it does not expand this batch into building a replacement feed.
- Any active-trading flip. xStock remains in passive-learning/observation.

---

## §3 — Risks

- **R1 — Reference data availability.** O1/O2 need a trustworthy underlying-equity reference. Free sources (Yahoo, FRED, Finnhub already used for sector) have rate limits / coverage gaps. Mitigation: sample-based (20-30 symbols), not full-universe live calls.
- **R2 — The volume field may be unusable.** If O1 finds `volume_24h` is underlying-passthrough (or corrupt), the liquidity gate needs a different basis (e.g. rolling bar-volume from OHLC, or bid/ask depth). That's a larger design change — flag to Kyle before O5 implementation rather than forcing a number into a broken field.
- **R3 — Dislocation root cause may be upstream (Kraken).** If MU/SNDK are Kraken feed errors we cannot fix at source, the only defense is the max_price ceiling + spread gate + a dislocation-detection guard — defensive, not curative. Set expectations accordingly.
- **R4 — Sequencing pressure.** Designating this a gate before B.2 delays B.2. If Kyle wants B.2 to proceed in parallel, we accept that B.2 may re-run if this batch changes the universe/data basis.
- **R5 — Paper/live divergence (Correction #2).** Recalibrating must not blindly copy one mode to the other; each is set deliberately. Risk of regressing crypto or other paths if a migration is written too broadly — scope changes to `xstock_spot` + specific filter_path(s) only.

---

## §4 — Decisions (resolved with Langston, Step 1)

- **Q1 — Numbering + sequencing → GATE, B.1.5 confirmed.** This blocks B.2; NOT parallel-with-re-run (running B.2 against the suspect `volume_24h` field would fit thresholds to corrupt inputs and force a re-do). B.1.5 numbering accepted (data-quality slot under the B.1 family).
- **Q2 — Filter-path target → `active_quant` only.** O5 recalibrates the global-filter path (`active_quant`) here; per-family min_volume stays with B.2. Touching all 14 paths is scope creep with cross-asset blast radius.
- **Q3 — Reference source → Finnhub for price, with a caveat.** Use Finnhub (already wired + keyed) for the underlying-price reference. BUT verify in pre-audit that Finnhub's free tier returns underlying-equity 24h *volume* (not just last/quote); if it requires a rate-limited candle endpoint, fall back to Yahoo for the volume side. Document the fallback in the pre-audit.
- **Q4 — Dislocation handling → two-tier + static ceiling.** Soft-flag at >2× (investigate + log to diagnostics), hard-reject at >3× (re-enabled `max_price` ceiling). Two tiers avoid false-positiving names that legitimately moved 50-80% on news while still catching SNDK at ~$1555. The re-enabled `max_price` is a single static universe-wide value for THIS batch; a per-symbol dynamic ceiling is architecturally correct but a follow-on (separate batch needing reference-feed infra, correctly out-of-scope here).
- **Q5 — O6 universe pruning → design + decide here; implement only if safe.** Implement in-batch ONLY if (a) low-risk, (b) fully reversible (re-listable), and (c) no impact on existing trade IDs / VTS records / passive paper history. If any fails, deliver the design + decision and defer implementation to its own batch.
- **Q6 — Cuts/adds.** No cuts. Adds = Langston conditions #1 (O1.0 reconciliation) + #2 (O2.a absent-symbol) + the O3→O4 sequencing note, all folded above.

**Langston Step 1 verdict: CLEAN-CONDITIONAL — proceed to Step 2 pre-audit with the three conditions folded in.** Pending: Kyle sign-off before any implementation.

---

*End B.1.5 (B_XSTOCK_GLOBAL_FILTER) scope v1.1 — Langston ACK folded; awaiting Kyle sign-off.*
