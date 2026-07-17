# P19-B8.7 Step-9 — LAYOUT MAP (pre-code, per Langston's gate) rev1

change-class: non_architecture (display + data-wiring; no strategy/regime/math change)
Owner: CC-B · 2026-07-17 · Carries Kyle's RTB column directive (PHASE_19_PLAN 07-16)
+ the B8.7 layout-identity obligation + OBJ-5 VTS additions (Kyle-approved).

## A. The four inventories (read at markup, exact order)

**A1. VTS OPEN (the reference, 28 cols — vts-open-trades-table.tsx :109-148):**
Symbol(sticky; class badge STACKED in-cell) · B/S · Regime · Strategy · Signal/Pattern
· Pool (I/R) · Source Pool · Entry Fee Mode · TEC State · Volume/Order Book ·
$ Value/Qty · Entry/Current · Target/Stop · Dist. T/S · Gross P/L · Costs · Net P/L ·
Rank · Final/Hybrid · Edge · Regime Wt · Glbl Regime · Pair Fric. · Glbl Fric. ·
Pair DBS · Glbl DBS · Entry Time · Duration

**A2. VTS CLOSED (27 — vts-closed-trades-table.tsx :116-148):** same order with
Entry/Exit for Entry/Current, +Result after Target/Stop, −Dist.T/S, −Rank,
Entry/Exit Time for Entry Time.

**A3. PAPER OPEN today (34 — active-trades-v2.tsx :1330-1366):** Symbol · Class ·
Slot · Strategy · Pool · Entry Fee Mode · B/S · TEC State · Signal/Pattern ·
Qty/Value · Entry · Target(TP) · Stop(SL) · Current · Dist · Gross P/L · **Entry Fee ·
Entry Slip · Exit Fee · Exit Slip · Total Cost** (the 5-col cost breakdown VTS lacks)
· Net P/L · FinalScore · Conf · Volume · Source · Regime · Friction · Edge · Rank ·
Regime Wt · Duration · Opened · Actions

**A4. RTB today (16 — ready-to-buy-table.tsx :296-312):** Rank · Symbol · FinalScore
· ML Conf · S.Wgt · Price · Entry · Target · Stop · Qty · 24h Vol · Strategy ·
Regime · Friction · Entry Fee Mode · Status. Default sort = finalScore.

## B. Target designs

**B1. RTB (Kyle's directive, applied verbatim):**
Rank · **Symbol (STACKED: symbol + asset-class badge + display name)** ·
**RankingScore** (replaces FinalScore — becomes default sort; the SAME value
`getRankedSignals` orders on, engine :2108) · S.Wgt · Price · Entry · Target · Stop ·
Qty · 24h Vol · Strategy · **Regime (WIRED)** · **Friction (WIRED)** · **DBS (new)** ·
**Net EV (new)** · Entry Fee Mode · Status. **ML Conf REMOVED** (Kyle-confirmed; feeds
nothing — severed B8.5a).
Data wiring (the server half): rtb_signals already carries typed
`di_at_queue`/`dbs_score_at_queue` (reorg-B3) + `chosen_net_ev` (B7.2) + rankingScore
in row metadata — the API row must SEND them; Regime/Friction render empty today
because the serialized row lacks populated values (pre-audit confirms whether the
columns exist unpopulated or the route omits them — enumerate at Step-2, not assumed).

**B2. PAPER OPEN → VTS-identical:** adopt A1's 28-column order/names/cell composition
wholesale, with per-cell composition copied from the VTS markup (stacked symbol cell,
Target/Stop pair cell, Costs cell, the Pair/Glbl regime-friction-DBS sextet, Entry
Time, Duration). Paper-only survivors appended AFTER the VTS set: Slot · Current-mark
staleness (if any) · Actions (see D1). Cost 5-col breakdown: per Kyle's OBJ-5 approval
the breakdown goes INTO VTS — so BOTH tables carry Costs → the 5 columns (see D2 for
the sequencing).

**B3. PAPER CLOSED → VTS-closed-identical:** same treatment against A2 (+ the B8.7
maker-exit columns — exit fee mode / rest outcome — which per OBJ-5 ALSO go into VTS
closed).

## C. Verification
§9.3 Claude-in-Chrome walk on live staging rows for all three surfaces; per-column
data-presence audit (no silent em-dash where a value exists server-side); the RTB
Regime/Friction/DBS/NetEV cells proven NON-EMPTY on real queue rows; sort default
proven = rankingScore.

## D. Decision cells for Langston (and Kyle where flagged)
**D1. Slot + Actions + Class columns (paper-only):** propose KEEP, appended after the
VTS set (operational controls; Class becomes redundant once the stacked symbol cell
carries the badge — propose DROP Class as a separate column). Langston rules.
**D2. Cost 5-col into VTS:** one diff or two? Propose: this batch does BOTH sides
(paper adopts VTS layout + VTS gains the 5-col breakdown + maker-exit closed columns)
so the mirror is exact in ONE deploy — no interim mismatch window. Langston rules.
**D3. Final/Hybrid on open/closed tables:** Kyle's retire-finalScore ruling was given
for the RTB surface. Propose: RTB drops it NOW (B1); the open/closed tables KEEP the
VTS-mirrored Final/Hybrid column until the Phase-25 scoring redesign lands (identity
with the VTS reference outranks early retirement on non-selection surfaces; #514/#523
pattern: the selection surface is where the rule bites). Kyle sanity-check flagged.
**D4. The stacked display NAME:** Kyle asked for the company/coin name stacked under
the symbol. The VTS cell stacks the CLASS BADGE (B69.1) — not a name. A name needs a
symbol→display-name source: xStock = the instrument metadata behind
XSTOCK_SPOT_SYMBOLS (pre-audit confirms whether names exist there or need a small
static map); crypto = a base-asset name map (new, small, static, non-behavioral).
Propose: add the name line to the stacked cell on ALL THREE surfaces (RTB + open +
closed + VTS reference itself so the mirror stays exact). Langston rules on the
name-source mechanism at Step-2.

---

## E. STEP-2 PRE-AUDIT FINDINGS (2026-07-17; amends the above — §9.2 corrections included)

**E1. D4 RESOLVED — my map premise was WRONG; Kyle's recollection was RIGHT.** The
VTS symbol cell ALREADY stacks the asset NAME via `getAssetName`
(vts-open-trades-table.tsx :173-175) — invisible to the header-only extraction that
built §A. The complete name system exists: `shared/asset-names.ts` (curated
CRYPTO_NAMES + xStock names from the universe metadata + overlay endpoints
`/api/xstocks/asset-names` + `/api/crypto/asset-names`, maintenance home = B-NAMES
w/ the add-entries-on-onboarding note). Langston's enumerate-first ruling resolves
with ZERO new data source: RTB + paper cells adopt the SAME `getAssetName` cell
composition. No new map, no new owner needed.

**E2. THE RANKING TRUTH (discharges Langston's honesty flag — and it caught a trap).**
The metadata field literally named `rankingScore` is **INERT** — a Phase-14.5
leftover used only as a shadow-ranking CONTROL (`ready_to_buy_service.ts:209`
"the inert rankingScore", :1885 "the inert VTS rankingScore"). The TRUE promotion
order is the B7.1 ranker: `r = chosenNetEv / distStop` computed inside
`getRankedSignals` (:1936-1940) and consumed at engine :2108. **Kyle's RankingScore
column must display r, NOT metadata.rankingScore** — a matching NAME is not a
matching THING. Since r is computed in the sort comparator and discarded, the route
recomputes it per row (pure: same two stored operands) or the ranker attaches it.

**E3. The RTB route (`GET /api/trading-signals`, routes.ts:5029-5106) — three finds:**
(a) **Regime/Friction EMPTY cause = ROUTE OMISSION**: the response is `...signal`
(raw rtb_signals row) + computed extras; `marketRegime`/`marketFriction` are never
set, so the client sorts/renders fields absent from the payload. Fix = serialize
them (exact on-row source — typed column vs metadata.regime vs a queue-time capture
gap — pinned by a live-row inspection at build, enumerated not assumed).
(b) **Today's "Rank" column is a display-only legacy formula** computed IN THE ROUTE:
`finalRank = NGC×0.40 + mlConfidence×0.35 + strategyWeight×0.25` (:5078) — NOT the
promotion order. Same class as the B8.7 phantom slots: a number the engine never
uses. Dies with this batch: Rank = position in the r-ordering.
(c) **Two hidden display fabrications die with their columns**: `mlConfidence ?? 
ngc×0.9` (:5070) and `strategyWeight ?? 0.5` (:5073). The ML Conf column is removed
(Kyle); S.Wgt keeps its column but the `?? 0.5` becomes an honest em-dash-on-absent.

**E4. Revised B1 target (supersedes §B1 wording):** Rank (= r-order position) ·
Symbol (getAssetName stacked cell) · **RankingScore = r** (default sort) · S.Wgt
(honest-absent) · Price · Entry · Target · Stop · Qty · 24h Vol · Strategy · Regime
(wired) · Friction (wired) · DBS (typed `dbs_score_at_queue`) · Net EV (typed
`chosen_net_ev`) · Entry Fee Mode · Status. FinalScore + ML Conf columns REMOVED;
the :5070/:5073/:5078 route fabrications deleted with them.
