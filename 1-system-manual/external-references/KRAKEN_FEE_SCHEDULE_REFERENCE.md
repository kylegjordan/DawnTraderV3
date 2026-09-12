# KRAKEN FEE SCHEDULE — THE EXTERNAL CONTRACT, TRANSCRIBED

> **What this is.** The venue's own PUBLISHED fee schedule, captured from Kraken's public pages, transcribed here so that any session can check what we implement against what the venue charges **without an account login and without asking Kyle.**
> ⛔ **THIS FILE IS A TRANSCRIPTION OF AN EXTERNAL DOCUMENT. IT IS NOT OUR CONFIGURATION AND IT IS NOT AUTHORITATIVE FOR WHAT WE CHARGE.** What we charge lives in the database (`module_constants`, module `fee_model`) and in `server/services/cost-model.ts`. **The whole point of this file is that those two can DISAGREE, and until 2026-09-06 nothing in the system could tell.**
> ✅ **THE ACCOUNT IS NOW CONFIRMED — see §0.b. Kyle captured the authenticated in-app fee dialogs on 2026-09-06 and they AGREE with the public pages line for line.** The caveat this file shipped with (*"the published schedule is not the account's schedule"*) is **DISCHARGED for spot crypto, Pro xStocks and futures.**

---

## 0. PROVENANCE

| | |
|---|---|
| **Captured** | 2026-09-06, by Kyle, as page-to-PDF screen captures |
| **Sources** | `kraken.com/features/fee-schedule` (twice — accordions collapsed, then expanded) and `support.kraken.com/articles/cross-platform-fee-tier-changes` |
| **Stored** | `1-system-manual/external-references/kraken-fees/2026-09-06/` — three PDFs, unmodified |
| **Kraken's own "last updated"** | **July 9, 2026** (stated on the support article) |
| **Transcribed by** | CC-B, read from the rendered captures |

⛔ **THE CAPTURES ARE IMAGES, NOT TEXT.** `pdftotext` returns zero lines from all three. They were read by rendering each page. **A future automated check cannot parse these files** — it must fetch the live pages.

⚠️ **ONE CAPTURE DEFECT, STATED BECAUSE IT NEARLY COST US THE TABLE:** on `kraken.com/features/fee-schedule` the tier tables are horizontally scrollable and the capture froze them at the left edge, so **the percentage columns are absent from both fee-schedule PDFs** — the page itself says *"Scroll table to the right to view percentages."* **The rates in §1 come from the SUPPORT ARTICLE capture, which renders every column.** A future capture of the main page must scroll the table first, or it records tier thresholds and no prices.

### 0.b ✅✅ THE AUTHENTICATED IN-ACCOUNT VIEW — CAPTURED 2026-09-06, AND IT MATCHES

Kyle opened Kraken Pro's own **Fees** dialog on three live markets while signed in, and screenshotted each. **This is the account's actual schedule, not the public ladder** — it names his tier and his qualifying measures.

| | reading |
|---|---|
| **Fee tier** | **Tier 1**, on all three markets |
| 30-day spot volume | **0.00 USD** |
| 30-day futures volume | **0.00 USD** |
| **Assets on Platform (AoP)** | **836.13 USD** *(holdings: 824.11 USDC + 0.05576100 NVDAx ≈ 12.79 USD)* |
| next tier needs | +$2,501 spot volume **or** +$5,000,001 futures volume. ⛔ **No AoP route to Tier 2 — the AoP column reads N/A there** |

✅ **EVERY FIGURE IN §1, §2 AND THE FUTURES ROW OF §3 WAS CROSS-CHECKED AGAINST THESE DIALOGS AND MATCHES.** Spot Tier 1 `0.40 / 0.80`; the in-app ladder's tier 12 `0.00 / 0.10` and tier 17 `0.00 / 0.05` are the public page's Tier 12 and Pro 5. **The in-app view numbers the rungs 1-17 where the public page names the top five “Pro 1-5” — same ladder, different labels.** Futures Tier 1 `0.0200 / 0.0500`, maker negative from rung 11.

⭐⭐ **AND THE DIALOG CONFIRMS `#1010` ON OUR OWN ACCOUNT, ON A SYMBOL WE ACTUALLY TRADE.** `pro.kraken.com/app/trade/xstocks-nvda-usd` shows the market header **`FEES  Maker rebate  −0.02% / 0.10%`**, the tier table `maker −0.02 % / taker 0.10 %`, and the order form's own estimate reading **`Est. trading fee   Maker rebate   −0.0001 USD`**. ⇒ **the rebate is not a published aspiration; it is what the venue quotes Kyle's account, per order.**

### 0.c ⛔⛔ xSTOCK FEES ARE **NOT** CROSS-PLATFORM, AND THAT CHANGES THE FIX

**The xStocks fee dialog has ONE qualifying column — `Min spot volume`.** No futures column. **No AoP column.** Its Tier 2 needs **$100,000,001** of spot volume.

⇒ ★ **xSTOCK IS EFFECTIVELY A CONSTANT: maker −0.02 %, taker 0.10 %, permanently.** No tier modelling is needed for it at all — which makes the `#1010` correction simpler than the crypto side, not harder.
⇒ ⛔ **AND IT KILLS THE AoP LEVER FOR xSTOCK.** Assets on Platform moves the **crypto** tier and does nothing whatever for xStocks. **Any argument that depositing funds improves xStock economics is wrong.**

### 0.d ⚠️ THE AoP LEVER, RE-MEASURED AGAINST THE ACCOUNT — SMALLER AND SLOWER THAN FIRST STATED

**PREVIOUSLY STATED (this file, first revision): “$20,000 held on the platform is Tier 3.” NOW: true, but the account holds $836.13, so it is a ~$19,165 DEPOSIT, not a reshuffle of money already there. REASON: the authenticated dialog supplied the current AoP, which the public page could not.**

✅ **AND THE CHEAPER ROUTE IS VOLUME, NOT DEPOSIT:** **Tier 2 needs only $2,501 of 30-day spot volume** — crypto taker 0.80 % → 0.60 %, maker 0.40 % → 0.30 %. **Tier 3 is $10,001 of volume OR $20,001 of AoP** → 0.38 % / 0.22 %.
⚠️ **Neither is reachable today: 30-day spot volume is 0.00 because we have never traded live.** ⇒ **the tier improves on its own once live trading starts, and the first rung is cheap.** ⛔ **A fee model that hardcodes Tier 1 forever will be wrong within days of go-live** — which is a second, separate defect from `#1010` and is recorded on it.

---

## 1. ✅ SPOT CRYPTO — THE CONFIRMED LADDER (17 rungs)

> ✅ **AUTHENTICATED. Transcribed from Kyle's signed-in Kraken Pro Fees dialog, `pro.kraken.com/app/trade/sui-usd#dialog/fee-level`, 2026-09-06.** It agrees with the public support article line for line, so the public page's Tier 1-12 + Pro 1-5 and this 1-17 numbering are **the same ladder under two labellings.** ⛔ **Cite the RUNG NUMBER from this table, never "Pro 3" — the in-app view is what an operator sees.**

**Qualifying measure = the BEST OF three, assessed independently:** 30-day spot volume **OR** 30-day futures volume **OR** Assets on Platform. Meeting several at one rung gives no extra benefit. **Reassessed after every trade.**

| Rung | Min spot vol | or Min futures vol | or Min AoP | **Maker** | **Taker** |
|---|---|---|---|---|---|
| **1** ⭐ *current* | — | — | — | **0.40 %** | **0.80 %** |
| 2 | $2,501 | $5,000,001 | — | 0.30 % | 0.60 % |
| 3 | $10,001 | $10,000,001 | $20,001 | 0.22 % | 0.38 % |
| 4 | $25,001 | $15,000,001 | $50,001 | 0.20 % | 0.35 % |
| 5 | $50,001 | $25,000,001 | $100,001 | 0.15 % | 0.30 % |
| 6 | $100,001 | $40,000,001 | $200,001 | 0.12 % | 0.25 % |
| 7 | $250,001 | $50,000,001 | $400,001 | 0.10 % | 0.22 % |
| 8 | $500,001 | $75,000,001 | $600,001 | 0.08 % | 0.20 % |
| 9 | $1,000,001 | $100,000,001 | $1,000,001 | 0.06 % | 0.18 % |
| 10 | $2,500,001 | $150,000,001 | $2,500,001 | 0.04 % | 0.15 % |
| 11 | $5,000,001 | $250,000,001 | $5,000,001 | 0.02 % | 0.12 % |
| 12 | $10,000,001 | $300,000,001 | $10,000,001 | **0.00 %** | 0.10 % |
| 13 | $50,000,001 | $400,000,001 | $20,000,001 | 0.00 % | 0.09 % |
| 14 | $100,000,001 | $500,000,001 | $25,000,001 | 0.00 % | 0.08 % |
| 15 | $250,000,001 | $1,000,000,001 | $50,000,001 | 0.00 % | 0.07 % |
| 16 | $400,000,001 | $2,000,000,001 | $80,000,001 | 0.00 % | 0.06 % |
| 17 | $500,000,001 | $5,000,000,001 | $100,000,001 | 0.00 % | 0.05 % |

✅ **WE IMPLEMENT `0.004 / 0.008`, WHICH IS EXACTLY RUNG 1, AND THE ACCOUNT IS CONFIRMED ON RUNG 1. CORRECT, VERIFIED BOTH SIDES.** ⚠️ **Correct only while we are in paper: see §0.d and §2.c.**

### ⭐ THE AoP COLUMN IS THE ONE NOBODY HAS COSTED
**Assets on Platform is assessed POINT-IN-TIME — the current balance, not a 30-day average** — and it is an independent route to a tier. **$20,000 held on the platform is Tier 3: taker 0.80 % → 0.38 %, maker 0.40 % → 0.22 %.** That is better than halving our single largest cost, and it is bought by *moving money*, not by trading more.

**AoP INCLUDES** wallet balances (tokenized assets, crypto, fiat), Opt-In Rewards assets, staked assets, dual-investment balances. **AoP EXCLUDES** loans, embed parent-client balances, **and equities**.
⚠️ **It cuts both ways: the tier falls IMMEDIATELY if the balance falls** — a market drop or a withdrawal — so a strategy that assumed a tier can lose it mid-session with no notice.

**Spot 30-day volume INCLUDES** spot and margin trades on crypto-cash, crypto-crypto **and xStocks** markets. **EXCLUDES** forex / stablecoin / FX pairs (USDC/USDT, EUR/USD, USDC/USD), conversions, and **anything traded outside Kraken Pro — the Instant Buy path on kraken.com or the app earns no volume credit.**

---

## 2. ✅ PRO xSTOCKS — A COMPLETELY DIFFERENT SCHEDULE, AND **AS OF 2026-09-11 WE IMPLEMENT IT**

> ✅✅ **IMPLEMENTED 2026-09-11 20:09:47Z — `B-XSTOCK-FEE-CONTRACT` (`#1010`), deployed `b597f1bf2`.** The heading read *"AND WE DO NOT IMPLEMENT IT"* until that deploy. `fee_model|*|xstock_spot` now holds **taker `0.0010` / maker `-0.0002`**, matching the rung-1 row below; `crypto_spot` is untouched at `0.008 / 0.004`. **Confirmed in booked money 2026-09-12 00:16:31Z:** an xStock maker exit paid **`-0.000200`** (`CRM/USD`, `exit_fee -0.03387422`), against a control of 92 pre-deploy maker exits all at `+0.004000`. ⚠️ **The table immediately below this point is the DEFECT RECORD, not the current state.**

> ✅ **AUTHENTICATED**, from `pro.kraken.com/app/trade/xstocks-nvda-usd#dialog/fee-level`, 2026-09-06. Account is on **rung 1**.

**Two rungs, and ONE qualifying column — `Min spot volume`. No futures column. No AoP column.**

| Rung | Min spot vol | **Maker** | **Taker** |
|---|---|---|---|
| **1** ⭐ *current* | — | **−0.02 %  (a REBATE — the venue PAYS the maker)** | **0.10 %** |
| 2 | **$100,000,001** | −0.02 % | 0.08 % |

⭐ **THE ORDER FORM QUOTES IT PER ORDER, NOT JUST THE SCHEDULE PAGE:** the NVDAx market header reads `FEES  Maker rebate  −0.02% / 0.10%` and a live limit order's own estimate reads `Est. trading fee   Maker rebate   −0.0001 USD`.
*(The public page footnotes the rung-2 row as institutional: 30-day spot-crypto **and** xStocks volume over $100M plus activity on Kraken Futures, Custody or Staked. **The in-app dialog states the volume threshold only.**)*

⇒ ✅ **FIXED 2026-09-11. WHAT FOLLOWS IS WHAT WE CHARGED BEFORE THAT DATE — measured in `module_constants`, unbounded across every scope, 2026-09-06:**

| | our `fee_model` value | Kraken's rate, **account-confirmed** | error |
|---|---|---|---|
| `spot_taker_fee` @ `xstock_spot` | **0.008** | **0.0010** | **8× too high** |
| `spot_maker_fee` @ `xstock_spot` | **0.004** | **−0.0002** | **wrong SIGN — we book a cost where the venue pays a rebate** |

**A taker-in / taker-out xStock round trip: we model 1.60 %. The confirmed schedule is 0.20 %.**

★ **AND THE CONSEQUENCE IS NOT ONLY MIS-BOOKED OUTCOMES — IT IS MIS-SELECTION.** The net-EV gate that decides what gets traded is computed from these rates, so **every xStock candidate has been graded against a cost roughly eight times the confirmed one.** Rejections attributed to a fee wall are not evidence of a fee wall until this is corrected and re-run.

⚠️ **BOTH xStock rows were written 2026-06-10 21:50:44Z by `b45-tier1-seed` and have not been touched since** — a month before Kraken's own 2026-07-09 revision. **They are byte-identical to the crypto rows, timestamp included.**

⛔ **CORRECTION — an earlier revision of this file said "there is no per-class override anywhere," and that is WRONG (Langston, re-derived at the ref).** `asset_class` **is a primary-key column** and `xstock_spot` **holds its own row**, which the resolvers already key on (`cost-model.ts:114-119`, `slippage-fee-model.ts:39-42`). ⇒ ★ **THE PER-CLASS DIMENSION EXISTS AND IS HONOURED. The defect is the VALUE seeded into an existing per-class slot** — which makes the fix smaller, and means the correction must also reach `drizzle/migrations/2026-06-11-b45-fee-model-tier1.sql:39-42`, **which seeds all four rows from ONE Tier-1 literal and would re-seed the defect into any fresh database.**

### 2.b ✅ FUTURES / PERPETUALS — THE CONFIRMED LADDER (17 rungs)

> ✅ **AUTHENTICATED**, from `pro.kraken.com/app/trade/futures-btc-usd-perp#dialog/fee-level`, 2026-09-06. **Same three qualifying measures as spot crypto, same rung thresholds — only the rates differ.** Account is on **rung 1**.

| Rung | Min spot vol | or Min futures vol | or Min AoP | **Maker** | **Taker** |
|---|---|---|---|---|---|
| **1** ⭐ *current* | — | — | — | **0.0200 %** | **0.0500 %** |
| 2 | $2,501 | $5,000,001 | — | 0.0175 % | 0.0450 % |
| 3 | $10,001 | $10,000,001 | $20,001 | 0.0150 % | 0.0400 % |
| 4 | $25,001 | $15,000,001 | $50,001 | 0.0125 % | 0.0350 % |
| 5 | $50,001 | $25,000,001 | $100,001 | 0.0100 % | 0.0300 % |
| 6 | $100,001 | $40,000,001 | $200,001 | 0.0075 % | 0.0275 % |
| 7 | $250,001 | $50,000,001 | $400,001 | 0.0050 % | 0.0250 % |
| 8 | $500,001 | $75,000,001 | $600,001 | 0.0050 % | 0.0225 % |
| 9 | $1,000,001 | $100,000,001 | $1,000,001 | **0.0000 %** | 0.0200 % |
| 10 | $2,500,001 | $150,000,001 | $2,500,001 | 0.0000 % | 0.0180 % |
| 11 | $5,000,001 | $250,000,001 | $5,000,001 | **−0.0030 %** | 0.0175 % |
| 12 | $10,000,001 | $300,000,001 | $10,000,001 | −0.0030 % | 0.0170 % |
| 13 | $50,000,001 | $400,000,001 | $20,000,001 | −0.0030 % | 0.0160 % |
| 14 | $100,000,001 | $500,000,001 | $25,000,001 | −0.0050 % | 0.0150 % |
| 15 | $250,000,001 | $1,000,000,001 | $50,000,001 | −0.0060 % | 0.0135 % |
| 16 | $400,000,001 | $2,000,000,001 | $80,000,001 | −0.0060 % | 0.0130 % |
| 17 | $500,000,001 | $5,000,000,001 | $100,000,001 | −0.0060 % | 0.0125 % |

⛔ **FUTURES MAKER GOES NEGATIVE FROM RUNG 11 — a SECOND signed-fee product.** ⇒ **the `(0, 0.05]` boot rail is not only an xStock problem; any future perps work hits it too.** Recorded here so the `#1010` rail redesign is scoped once, not twice.
⚠️ **DO NOT CONFUSE THIS WITH THE RETAIL "Perps" PRODUCT in §3**, which is a flat 0.25 % open / 0.25 % close. **This ladder is what Kraken Pro quotes on `BTC Perp`.** Same word, two prices.
⚠️ **We do not trade this class today** (`crypto_perp` / `xstock_perp` exist as `module_constants` scopes but carry no fee rows). Recorded for completeness at Kyle's instruction, and because rung 1 futures is **16× cheaper on the taker leg than spot crypto** — a fact nobody has costed against our strategy set.

### 2.c ⛔ THE THREE LADDERS DO NOT MOVE TOGETHER — THE RUNG IS PER PRODUCT

| product | qualifying measures | rungs | account is on | can our activity move it? |
|---|---|---|---|---|
| **spot crypto** | spot vol **OR** futures vol **OR** AoP | 17 | **1** | **Yes** — rung 2 at $2,501 of 30-day spot volume |
| **Pro xStocks** | **spot vol ONLY** | **2** | **1** | **Effectively no** — rung 2 needs $100,000,001 |
| **futures / perps** | spot vol **OR** futures vol **OR** AoP | 17 | **1** | Yes, same thresholds as spot crypto |

⛔⛔ **SO A FEE MODEL THAT RESOLVES ONE TIER FOR THE ACCOUNT IS WRONG BY CONSTRUCTION.** The rung is a property of **(account, product)**, not of the account. **xStocks does not share the cross-platform measures at all** — AoP and futures volume move the crypto and futures rungs and do nothing for xStocks.
✅ **AND THE ONE PIECE OF GOOD NEWS: xSTOCKS IS A CONSTANT FOR US AT ANY REALISTIC SCALE** — maker −0.02 %, taker 0.10 %, flat below $100M. **Model it as a constant, not as a ladder.**

---

## 3. THE OTHER PRODUCTS (recorded so nobody re-reads the PDFs for them)

| product | fee |
|---|---|
| **Kraken (retail) Instant Buy/Sell** | **1 %** on instant + recurring; 1.5 % on custom orders. A SPREAD is additionally embedded in the quoted price. Kraken+ waives the trading fee up to $10,000/month — spreads and card fees still apply. **Not Kraken Pro; earns no volume credit.** |
| **Kraken (retail) xStocks** | **No trading fee** when purchased with USDG or USD; the 1 % instant fee applies with other assets; a spread may be embedded. ⛔ **This is the RETAIL product and is NOT the Pro schedule in §2 — do not conflate them.** |
| **Stocks / Pro Stocks (real US equities)** | Commission-free; regulatory pass-through fees apply. US only. **A different asset class from xStocks.** |
| **Perps** | 0.25 % of notional to open, 0.25 % of closed notional to close. |
| **Futures / Perps on Kraken Pro** | ⛔ **See §2.b for the full confirmed ladder — not restated here.** |
| **Spot Maker Rebate programme** | A separate maker incentive on selected lower-liquidity spot pairs, on the same best-of tier basis. **Eligible-pair list NOT captured — fetch it before relying on this.** |

**Fee mechanics stated by Kraken:** charged per trade; calculated as a percentage of the trade's **quote-currency** volume by default (some pairs allow base-currency via a Fee Currency option); volume measured in the listed Fee Volume Currency, which **may differ from the pair's base or quote currency**; tiers reassessed after every trade.

---

## 4. ⛔ WHAT IS STILL NOT ESTABLISHED

1. ✅ **~~WHICH TIER KYLE'S ACCOUNT IS ON~~ — SETTLED 2026-09-06, §0.b. Tier 1 on all three products, AoP $836.13, spot and futures volume both 0.00.**
2. ✅ **~~WHETHER OUR xSTOCKS REACH US THROUGH KRAKEN PRO'S xSTOCKS MARKET~~ — SETTLED 2026-09-06.** The authenticated dialog was opened at `pro.kraken.com/app/trade/xstocks-nvda-usd` and served the §2 schedule. **NVDAx is a symbol we trade and it is on the Pro xStocks market.**
3. ⚠️ **STILL OPEN, AND NEWLY VISIBLE: WE HAVE NO TIER-TRACKING AT ALL.** The fee model holds two flat numbers. **Kraken reassesses the tier after every trade**, and crypto has 17 rungs. ⇒ the moment live trading generates $2,501 of 30-day volume our crypto rate is stale in the other direction — **we would over-charge ourselves and reject candidates that clear.** Recorded on `#1010`; it is a design requirement of the fix, not a separate finding.
4. **The Spot Maker Rebate eligible-pair list**, which could make some crypto pairs cheaper than the §1 ladder.
5. **The 0.05 %-per-leg slippage constant** welded into our friction numbers is OURS, not Kraken's, and is not separable in any historical row. It is not part of this contract.

---

## 5. ⚠️ THIS FILE GOES STALE AND NOTHING CURRENTLY WATCHES IT

**Kraken changed this schedule on 2026-07-09 and we found out on 2026-09-06, by hand, because Kyle happened to look.** The pages are **public** — no login, no paywall — so a change check is cheap and needs no credential.

⛔ **A WATCHER IS NOT BUILT. Homed as `B-KRAKEN-FEE-WATCH`** (see `RUNNING_ISSUES`). Until it exists, **treat every number here as "true on 2026-09-06" and re-check the pages before any decision that rests on a rate.**

★ **Design note for whoever builds it: there are THREE objects, not two — the live PAGES, this TRANSCRIPTION, and the DATABASE.** A watcher that only diffs the pages catches the next venue change and stays silent about the drift we already have. **It must compare all three.**

---

*Public-page captures: `1-system-manual/external-references/kraken-fees/2026-09-06/`. The authenticated in-account dialogs of §0.b were screenshotted by Kyle and transcribed here; **the images themselves are NOT committed — they show live balances.** Our implementation: `module_constants` module `fee_model`, and `server/services/cost-model.ts`.*
