# PART F — REORGANISED AROUND KYLE'S GOAL (2026-08-23, third restructure)

> **GOAL:** when this series closes, we can trust the **entry and exit prices** of **VTS simulated
> trades** and **active paper-mode trades**. Live mode is Phase 21 — *except* where a piece is already
> connected to live mode or extends to it in a line or two, which is then noted and taken.

---

## 1. THE FINDING THAT REORGANISES EVERYTHING — THE ALARM ALREADY EXISTS

**Directive 8.9.5, commit `92e9c15fc`, 2025-12-30T22:40Z — ninety minutes after the mini-book was created:**

> *"Implement the Mini-Book Integrity Monitor (MBIM) … audits WebSocket Mini-Book mid-prices against
> REST midpoint values every 5 minutes, logs deviations exceeding 0.2%, and triggers a soft resync via
> Sentinel for auto-recovery."*

`server/services/monitoring/mini-book-integrity-monitor.ts` is **still in the tree**:
`MAX_DRIFT_PCT = 0.2` (`:39`) · `restMid = (restBid + restAsk)/2` (`:148`) · `driftPct` (`:152`) ·
the `[8.9.5][MBIM]` log line (`:168`).

⛔ **IT HAS NEVER RUN.** `.start()` is called from **exactly one place** — a manual API route
(`routes.ts:826`). **Not in `server/index.ts`, not in `server/startup/*`.** Zero `[8.9.5][MBIM]` lines
in the current log or in **any** retained log.

**★ IT WOULD HAVE CAUGHT THIS ON DAY ONE.** A ghost bid above the real ask throws the book midpoint
far past 0.2% drift from the REST midpoint; at the measured **31.08% crossed-book rate** it would have
fired continuously for months.

⇒ **THE DIVERGENCE INSTRUMENT IS NOT A BUILD. IT IS A SWITCH-ON.** `CONDUCT.md` §1 — *use what already
exists before proposing new code*. And it is stronger evidence than anything I would have written,
because it is the guard the system's own designer specified for exactly this failure.

## 2. THE EXPOSURE TIMELINE, EVIDENCED

| date | event |
|---|---|
| 2025-12-09 | `priceCache` gains its WebSocket write path (`abe074015`) |
| 2025-12-29 | **VTS starts reading `priceCache`** (`b2ad5dfb8`) |
| 2025-12-30 21:09 | mini-book + midpoint added — *"improve pricing accuracy for low-volume pairs"* (`4beae06ed`); **the wipe block ships in the SAME commit** |
| 2025-12-30 22:40 | **MBIM built — and never wired to boot** (`92e9c15fc`) |
| 2026-06-16 | the book becomes load-bearing for MONEY — depth-walked fills (`b74526dc3`) |
| 2026-07-15 | the wipe block deleted (`a443a3fe8`) — **unmasking the truncation defect** |
| 2026-08-22 | truncation fixed (`e6f7c70b3`) |

**TWO SEPARATE EXPOSURES, NOT ONE.** VTS *learning* data has been exposed since **2025-12-30**;
paper-mode *money* since **2026-06-16**. The wipe block bounded orphan age throughout — until it was
correctly deleted on **2026-07-15**, after which the defect ran unmasked.

**And the book was never specified.** Directive 8.9.0 (the v2 upgrade) covers the **ticker** channel
only — no book, no depth, no checksum. The book arrived three weeks later as an improvement, outside
any directive. **Kraken's truncation rule appears in NONE of the 1,567 archived directives** — the
only matches are about log-file exports. ★ And the midpoint was introduced *specifically to fix stale
prices on thin pairs*: **the remedy for staleness became its source.**

## 3. KYLE'S CLASSIFICATION QUESTION — IT TIERS FOR ACCOUNTING, NOT FOR LEARNING

**Fill-price integrity IS tierable**, per leg and per class, against the venue's own printed range:

| tier | meaning | measured |
|---|---|---|
| **A — provably clean** | both legs inside what the venue actually printed | **289 of 525** across both classes |
| **B — provably contaminated** | either leg outside it | **109 exits** · **18 taker entries** |
| **C — unassessable** | no venue record in the window | **127** — ⚠️ **enriched for contamination, NOT neutral**: no trades ⇒ no bar ⇒ the quiet windows are exactly where a fill against an unfilled offer is likeliest |

**⛔ BUT TRADE *SELECTION* DOES NOT TIER.** `signal-orchestrator:2160` takes `rawPrice` from the same
shared cache. So **every crypto trade since 2025-12-30 was SELECTED through a feed that could carry a
contaminated midpoint** — and a trade with two clean fills may still be one we should never have
taken. **Plus two permanently invisible classes:** depth-gate blocks (`aee:3051`) and
maker-marketable drops (`aee:3094`) stop a trade EXISTING, leaving no row anywhere, for ever.

⇒ **THE ANSWER: for P&L and accounting, use the three tiers — it is NOT all compromised. For
CALIBRATION and LEARNING, treat the crypto population as compromised AS A WHOLE**, because selection
itself was affected and no tier repairs that. **xStock is materially better on both counts** — no
order book exists for it, and VTS xStock reads the equities archiver directly.

## 4. THE REORGANISED SEQUENCE

| # | piece | why here | live-mode note |
|---|---|---|---|
| **F-A** | **SWITCH ON MBIM** — wire to boot, prove it fires, alert on drift | smallest work, highest value, already specified; the standing guard for the whole defect class | **extends to live for free** — same adapter, same book |
| **F-B** | **PROVENANCE STAMP — both legs, both paths** (paper AND VTS); `observedAt` derived at snapshot time | makes every future trade self-verifying | shared close path ⇒ **live inherits it** |
| **F-C** | **STALENESS BOUND** (`#743`) | threshold from F-B's data plus the measured snapshot→fill round-trip | live inherits |
| **F-D** | **VTS ACCESSOR + ISOLATION** — VTS uses `getPriceWithFallback` **zero** times against an invariant saying all consumers must; and the documented *"VTS cache (isolated)"* is scheduling-only, over one shared value Map | VTS is half the goal and sits outside every protection built since | VTS is paper-only |
| **F-E** | **DETECTOR + DISPOSITION** — tier the history per §3, both legs, both paths | needs F-A/F-B live first so the tiers are **provable**, not inferred | historical only |
| **F-F** | **RESET** — gated on: MBIM clean ≥N days · stamp on 100% of closes · ≥50 assessable · **zero contaminated on BOTH legs** | — | — |

**⚠️ `price-cache.ts` IS A LOCKED MODULE** (*"DO NOT MODIFY — changes require a formal directive"*,
Directive 8.8.4-A4.R10R-4). F-D touches its **consumers**, not the module. **If any piece needs to
change it, that is a formal-directive path and Kyle's call, not ours.**

---

## ★★ F-G — **TRIGGER THE EXIT ON THE SIDE WE WILL TRANSACT ON** (ADDED 2026-08-25, KYLE DIRECTIVE)

**Kyle's words, and they settle the scope question I had put to Langston:** *"Everything we are doing now is to ensure that we are entering and exiting trades in a way that is as close to what will happen when we go live with real money through Kraken. So if what you are proposing for the exits brings us closer to that realistic simulation, because we are not using leveraged trades, we're only doing spot, then that needs to be done within this series of batches and tasks. I don't want to be learning off of paper trades that are not simulating as best I possibly can."*

⛔ **HE FOUND THIS BY ASKING A QUESTION I COULD NOT ANSWER.** He asked where in Part F the fix lived for *"the exit decision still reads a midpoint."* **Nowhere.** F-A monitors · F-B **persists** the decision price · F-C bounds **age** (`#743` is the last-known-good re-serve, not mid-vs-bid) · F-D is VTS wiring · F-E tiers history · F-F resets. **Every piece records or watches. None changes the price we act on.** The arc measured the gap and never closed it, while its stated goal is confidence that entry and exit prices are correct.

**THE DEFECT.** A midpoint is the average of the best bid and the best ask — **a price nobody transacts at.** Selling gets the bid. So a stop or target evaluated on the midpoint fires at a level that cannot be obtained, and the fill lands worse.
**MEASURED, every stop-out since the epoch (`2026-08-22T22:01Z`):** **all nine filled BELOW their stop** — median **0.17%**, worst **1.1%** (TRUMP/USD). That gap is the mid-to-bid distance, paid on every exit.
★ **The fill side is ALREADY CORRECT** — `PaperOrderPlacer.closeOrder` walks the **bid** ladder (`b74526dc3`). **It is the TRIGGER that reads a mid**, so the two halves of one exit disagree about which price is real.

**WHY THE INDUSTRY'S MARK-PRICE ADVICE DOES NOT RESCUE THE CURRENT DESIGN.** Kraken, Bybit and others do recommend triggering on a mark rather than the last trade — **but explicitly for LEVERAGED products, because forced liquidation is computed off the mark, so a last-price trigger risks liquidation firing before your own stop.** **We are spot, unleveraged, with no liquidation engine.** That rationale is absent here, and Kyle's directive turns on exactly this point.
⚠️ **AND THE THIN-PAIR ARGUMENT INVERTS.** The midpoint was introduced 2025-12-30 *"to improve pricing accuracy for low-volume pairs."* The standard view is the opposite: **for illiquid instruments the last trade is preferred BECAUSE a distorted bid corrupts the mid** — which is precisely the `#741` mechanism. **The remedy became the disease.**

| # | Objective | Verified when |
|---|---|---|
| **G-1** | The **exit trigger** reads the side the exit will transact on (bid for a long exit), not the mid | a fence pins trigger-side = fill-side; the two halves of an exit can no longer disagree |
| **G-2** | Same for the **entry** trigger (ask for a long entry) | symmetry — an entry decided on a mid has the identical defect, unmeasured only because entries are not stop-triggered |
| **G-3** | **Measured before/after** on the same population | post-deploy stop-outs no longer fill systematically below their stop; the 0.17% median gap closes or is explained |
| **G-4** | xStock uses its own top-of-book equivalent | `depth-source.ts` already returns `bid`/`ask` for `xstock_spot` — **the value exists**, same as F-B's entry stamp |

⛔ **SEQUENCING — THIS IS A BEHAVIOUR CHANGE AND MUST NOT BE PRETENDED OTHERWISE.** Part F's safety case has been *"records only, decides nothing,"* and that is the argument used to keep F-C separate. **F-G forfeits it deliberately, on Kyle's explicit direction**, because a simulation that decides on an unobtainable price is not the realistic simulation the arc exists to produce. ⇒ **F-G runs AFTER F-B is live**, so the before/after in G-3 is measured on stamped rows rather than argued.
**OWNER: CC-C. DUE: within this series, before F-F's reset gate is assessed** — the gate asks for *"zero contaminated on BOTH legs,"* and a mid-triggered exit is a contaminated leg by the arc's own definition.
