# KRAKEN FEE SCHEDULE — THE EXTERNAL CONTRACT, TRANSCRIBED

> **What this is.** The venue's own PUBLISHED fee schedule, captured from Kraken's public pages, transcribed here so that any session can check what we implement against what the venue charges **without an account login and without asking Kyle.**
> ⛔ **THIS FILE IS A TRANSCRIPTION OF AN EXTERNAL DOCUMENT. IT IS NOT OUR CONFIGURATION AND IT IS NOT AUTHORITATIVE FOR WHAT WE CHARGE.** What we charge lives in the database (`module_constants`, module `fee_model`) and in `server/services/cost-model.ts`. **The whole point of this file is that those two can DISAGREE, and until 2026-09-06 nothing in the system could tell.**
> ⚠️ **THE PUBLISHED SCHEDULE IS NOT THE ACCOUNT'S SCHEDULE.** It states the ladder; it does not state which rung Kyle's account sits on. **An account-specific confirmation is still owed** and only Kyle can obtain it.

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

---

## 1. ⛔⛔ SPOT CRYPTO — THE TIER LADDER (effective 2026-07-09)

**Tier is the BEST OF three measures**, assessed independently: 30-day spot volume **OR** 30-day futures volume **OR** Assets on Platform. Qualifying on more than one at the same tier gives no extra benefit.

| Tier | Spot 30d vol | Futures 30d vol | AoP (USD) | **Spot maker** | **Spot taker** |
|---|---|---|---|---|---|
| **1** | $0+ | < $5M | N/A | **0.40 %** | **0.80 %** |
| 2 | $2.5K+ | ≥ $5M | N/A | 0.30 % | 0.60 % |
| **3** | $10K+ | ≥ $10M | **20k** | **0.22 %** | **0.38 %** |
| 4 | $25K+ | ≥ $15M | 50k | 0.20 % | 0.35 % |
| 5 | $50K+ | ≥ $25M | 100k | 0.15 % | 0.30 % |
| 6 | $100K+ | ≥ $40M | 200k | 0.12 % | 0.25 % |
| 7 | $250K+ | ≥ $50M | 400k | 0.10 % | 0.22 % |
| 8 | $500K+ | ≥ $75M | 600k | 0.08 % | 0.20 % |
| 9 | $1M+ | ≥ $100M | 1m | 0.06 % | 0.18 % |
| 10 | $2.5M+ | ≥ $150M | 2.5m | 0.04 % | 0.15 % |
| 11 | $5M+ | ≥ $250M | 5m | 0.02 % | 0.12 % |
| 12 | $10M+ | ≥ $300M | 10m | **0.0 %** | 0.10 % |
| Pro 1 | $50M+ | ≥ $400M | 20m | 0.0 % | 0.09 % |
| Pro 2 | $100M+ | ≥ $500M | 25m | 0.0 % | 0.08 % |
| Pro 3 | $250M+ | ≥ $1B | 50m | 0.0 % | 0.07 % |
| Pro 4 | $400M+ | ≥ $2B | 80m | 0.0 % | 0.06 % |
| Pro 5 | $500M+ | > $5B | 100m | 0.0 % | 0.05 % |

★ **WE IMPLEMENT `0.004 / 0.008` FOR CRYPTO, WHICH IS EXACTLY TIER 1 — so the crypto rate is RIGHT, conditional on the account actually being Tier 1.** ⛔ **That condition has never been verified against the account.**

### ⭐ THE AoP COLUMN IS THE ONE NOBODY HAS COSTED
**Assets on Platform is assessed POINT-IN-TIME — the current balance, not a 30-day average** — and it is an independent route to a tier. **$20,000 held on the platform is Tier 3: taker 0.80 % → 0.38 %, maker 0.40 % → 0.22 %.** That is better than halving our single largest cost, and it is bought by *moving money*, not by trading more.

**AoP INCLUDES** wallet balances (tokenized assets, crypto, fiat), Opt-In Rewards assets, staked assets, dual-investment balances. **AoP EXCLUDES** loans, embed parent-client balances, **and equities**.
⚠️ **It cuts both ways: the tier falls IMMEDIATELY if the balance falls** — a market drop or a withdrawal — so a strategy that assumed a tier can lose it mid-session with no notice.

**Spot 30-day volume INCLUDES** spot and margin trades on crypto-cash, crypto-crypto **and xStocks** markets. **EXCLUDES** forex / stablecoin / FX pairs (USDC/USDT, EUR/USD, USDC/USD), conversions, and **anything traded outside Kraken Pro — the Instant Buy path on kraken.com or the app earns no volume credit.**

---

## 2. ⛔⛔⛔ PRO xSTOCKS — A COMPLETELY DIFFERENT SCHEDULE, AND WE DO NOT IMPLEMENT IT

**Kraken Pro's xStocks schedule is flat and has two rows. There is no tier ladder.**

| 30-day volume (USD) | **Maker** | **Taker** |
|---|---|---|
| **$0 +** | **−0.02 %  (a REBATE — the venue PAYS the maker)** | **0.10 %** |
| $100,000,000 + | −0.02 % | 0.08 % |

*(The $100M row is footnoted as institutional: 30-day spot-crypto **and** xStocks volume over $100M plus activity on Kraken Futures, Custody or Staked.)*

⇒ ⛔⛔ **WE CHARGE xSTOCK THE CRYPTO SCHEDULE. MEASURED in `module_constants`, unbounded across every scope, 2026-09-06:**

| | our `fee_model` value | Kraken's published Pro xStocks rate | error |
|---|---|---|---|
| `spot_taker_fee` @ `xstock_spot` | **0.008** | **0.0010** | **8× too high** |
| `spot_maker_fee` @ `xstock_spot` | **0.004** | **−0.0002** | **wrong SIGN — we book a cost where the venue pays a rebate** |

**A taker-in / taker-out xStock round trip: we model 1.60 %. The published schedule is 0.20 %.**

★ **AND THE CONSEQUENCE IS NOT ONLY MIS-BOOKED OUTCOMES — IT IS MIS-SELECTION.** The net-EV gate that decides what gets traded is computed from these rates, so **every xStock candidate has been graded against a cost roughly eight times the published one.** Rejections attributed to a fee wall are not evidence of a fee wall until this is corrected and re-run.

⚠️ **BOTH xStock rows were written 2026-06-10 21:50:44Z and have not been touched since** — they predate Kraken's own 2026-07-09 revision by a month. **There is no per-class override anywhere: the xStock rows are byte-identical to the crypto rows.**

---

## 3. THE OTHER PRODUCTS (recorded so nobody re-reads the PDFs for them)

| product | fee |
|---|---|
| **Kraken (retail) Instant Buy/Sell** | **1 %** on instant + recurring; 1.5 % on custom orders. A SPREAD is additionally embedded in the quoted price. Kraken+ waives the trading fee up to $10,000/month — spreads and card fees still apply. **Not Kraken Pro; earns no volume credit.** |
| **Kraken (retail) xStocks** | **No trading fee** when purchased with USDG or USD; the 1 % instant fee applies with other assets; a spread may be embedded. ⛔ **This is the RETAIL product and is NOT the Pro schedule in §2 — do not conflate them.** |
| **Stocks / Pro Stocks (real US equities)** | Commission-free; regulatory pass-through fees apply. US only. **A different asset class from xStocks.** |
| **Perps** | 0.25 % of notional to open, 0.25 % of closed notional to close. |
| **Futures** | maker 0.0200 % → 0.0125 %, taker 0.0500 % → 0.0125 % across Tier 1 → Pro 5. **Futures maker goes NEGATIVE from Tier 11 (−0.0030 %).** |
| **Spot Maker Rebate programme** | A separate maker incentive on selected lower-liquidity spot pairs, on the same best-of tier basis. **Eligible-pair list NOT captured — fetch it before relying on this.** |

**Fee mechanics stated by Kraken:** charged per trade; calculated as a percentage of the trade's **quote-currency** volume by default (some pairs allow base-currency via a Fee Currency option); volume measured in the listed Fee Volume Currency, which **may differ from the pair's base or quote currency**; tiers reassessed after every trade.

---

## 4. ⛔ WHAT IS STILL NOT ESTABLISHED

1. ⛔⛔ **WHICH TIER KYLE'S ACCOUNT IS ON.** Everything above is the public ladder. **Only an authenticated read settles the rung**, and no session may log in to obtain it (`CLAUDE.md` §7 — a session may not type a password into a form). **KYLE ACTION.**
2. **Whether the xStocks we trade reach us through Kraken Pro's xStocks market** (schedule §2) or by some other route. The volume-inclusion text says Pro xStocks markets count toward spot volume, which implies the §2 schedule — **but our own venue path has not been traced against it in this document.**
3. **The Spot Maker Rebate eligible-pair list**, which could make some crypto pairs cheaper than the §1 ladder.
4. **The 0.05 %-per-leg slippage constant** welded into our friction numbers is OURS, not Kraken's, and is not separable in any historical row. It is not part of this contract.

---

## 5. ⚠️ THIS FILE GOES STALE AND NOTHING CURRENTLY WATCHES IT

**Kraken changed this schedule on 2026-07-09 and we found out on 2026-09-06, by hand, because Kyle happened to look.** The pages are **public** — no login, no paywall — so a change check is cheap and needs no credential.

⛔ **A WATCHER IS NOT BUILT. Homed as `B-KRAKEN-FEE-WATCH`** (see `RUNNING_ISSUES`). Until it exists, **treat every number here as "true on 2026-09-06" and re-check the pages before any decision that rests on a rate.**

★ **Design note for whoever builds it: there are THREE objects, not two — the live PAGES, this TRANSCRIPTION, and the DATABASE.** A watcher that only diffs the pages catches the next venue change and stays silent about the drift we already have. **It must compare all three.**

---

*Captures: `1-system-manual/external-references/kraken-fees/2026-09-06/`. Our implementation: `module_constants` module `fee_model`, and `server/services/cost-model.ts`.*
