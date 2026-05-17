# xStock Sector Mappings Reference

> **Purpose:** Companion correctness-gate doc for `B-PHASE-A2 (B)` — full sector taxonomy mapping for the 265 xStock symbols in `XSTOCK_SPOT_REGISTRY`. Langston spot-checks this BEFORE the TypeScript-mapping commit hits `migration/aws-supabase` (scope rev2 D5).
> **Author:** Claude Code
> **Date:** 2026-05-17
> **Source:** S&P Global GICS canonical mapping, cross-referenced against SEC EDGAR for ADR listings.
> **Total entries:** 265
> **Distribution:** 11 GICS sectors + 3 special buckets

---

## 1. Per-sector distribution

| Sector | Count | Notes |
|---|---:|---|
| XLV (Healthcare) | 42 | Largest bucket — pharma + biotech + insurers + devices |
| XLK (Technology) | 39 | Software + semis + IT services (excl. crypto-miners which keep XLK + cryptoAdjacent flag) |
| XLF (Financials) | 37 | Banks + insurance + exchanges + payment processors |
| XLI (Industrials) | 27 | Capital goods + transportation + defense |
| XLY (Consumer Discretionary) | 24 | Includes AMZN (post-GICS-2018 still XLY despite cloud), TSLA, retailers, autos |
| XLC (Communication Services) | 22 | GOOGL post-2018 reclass + META + telcos + media |
| XLP (Consumer Staples) | 15 | Food/beverage/household + tobacco |
| XLRE (Real Estate) | 15 | REITs + REIT operators |
| XLU (Utilities) | 14 | Electric/water + renewable |
| INTL_ETF | 11 | Country/region ETFs (EWA-EWZ) |
| XLE (Energy) | 10 | Oil + gas |
| BROAD_ETF | 6 | Thematic ETFs (ARKK, ARKG, XBI, GLD, TOTL, IEMG) |
| INDEX_PROXY | 2 | SPY, QQQ — excluded from xStock global aggregation |
| XLB (Materials) | 1 | Thin — only Boise Cascade (BCC); will need fallback in Phase E sector benchmarks |
| **Total** | **265** | |

**Sector coverage floor of 7 is comfortably met** under steady-state — even an XLB-empty cycle covers 10 sectors out of the 11 GICS buckets.

**XLB thinness flag (Langston Step 1 #4 anticipated):** only 1 entry. If BCC is in cold-start / sentinel-zero, GICS-sector-coverage drops to 10 (still > 7 floor). Fine for A.2; Phase E factor work may want to backfill XLB universe (LIN, SHW, FCX, ECL — currently NOT in xStock registry).

---

## 2. GICS reclassification gotchas (Langston Step 1 #1 institutional knowledge)

Names where the canonical 2018+ GICS sector differs from popular intuition. All correctly mapped per the table below:

| Symbol | Mapped | Why this is correct |
|---|---|---|
| GOOGL/USD | **XLC** (Communication Services) | GICS 2018 reclassification moved Alphabet from XLK → XLC alongside META, NFLX, DIS. People still mis-remember as XLK. |
| AMZN/USD | **XLY** (Consumer Discretionary) | GICS classifies by majority revenue source. Retail dominates despite AWS prominence. |
| META/USD | **XLC** (Communication Services) | Same 2018 reclassification cohort as GOOGL. |
| NFLX/USD | **XLC** | Same. |
| DIS/USD | **XLC** | Same — Walt Disney moved from XLY → XLC in 2018. |
| MSTR/USD | **XLK** + `cryptoAdjacent: true` | GICS sector remains XLK (Software). The cryptoAdjacent flag tags the behavior overlay (BTC treasury / proxy beta). |
| COIN/USD | **XLF** + `cryptoAdjacent: true` | Exchange operator = Financials. The crypto-asset exposure is overlay. |
| CIFR / BITF / BTBT / HIVE / HUT / CLSK | **XLK** + `cryptoAdjacent: true` | Crypto miners are technically Software/IT-services per GICS; cryptoAdjacent flag captures the operationally-leveraged BTC exposure. |
| V/MA | **NOT IN REGISTRY** | (Heads-up only — if added later: V/MA → XLF, payment processors subsector, despite people often calling them XLK.) |

---

## 3. ADR flag set

Non-US underlying names tagged `adr: true`. Phase E factor work consumes (beta-to-SPY may under-state non-US macro coupling per A.1 design rev2 §3.2):

ASML, BABA, BHC, BIDU, BILI, BLDP, BNTX, BTI, BUD, DEO, EDU, GOTU, JD, LI, NIO, NTES, NVO, PDD, SAP, SHEL, SHOP, TAL, TEVA, TME, UL, XPEV — **26 entries.**

(BHC = Bausch Health Cos, dual-listed Canadian; flagged as ADR even though headquartered in Quebec.)

---

## 4. cryptoAdjacent flag set

Names with material crypto-asset exposure regardless of GICS sector. Phase E factor work may sub-segment for distinct beta-to-BTC profiles:

| Symbol | Type |
|---|---|
| MSTR | Balance-sheet BTC proxy (treasury) |
| COIN | Exchange operator |
| CRCL | Stablecoin issuer (Circle) |
| GLXY | Digital asset financial services |
| DFDV | DeFi development corp |
| BITF | Crypto miner |
| BTBT | Crypto miner |
| HIVE | Crypto miner |
| HUT | Crypto miner |
| CLSK | Crypto miner |
| CIFR | Crypto miner |

**11 entries total** spanning 3 structurally-distinct sub-groups (balance-sheet proxies / exchange operators / miners). A.1 design rev2 noted that Phase E factor work may want to sub-segment if data demands; single flag for A.2.

---

## 5. INDEX_PROXY + BROAD_ETF + INTL_ETF inventory

| Bucket | Symbols | Note |
|---|---|---|
| INDEX_PROXY | SPY, QQQ | Included in per-pair DBS, excluded from global aggregation (would degenerate weighted-median to "SPY's own DBS"). IWM not in xStock registry today. |
| BROAD_ETF | ARKK, ARKG, XBI, GLD, TOTL, IEMG | SPY-fallback for Phase E sector-correlation factor work. |
| INTL_ETF | EWA, EWC, EWG, EWI, EWL, EWN, EWP, EWQ, EWS, EWU, EWZ | All iShares country ETFs. SPY-fallback for Phase E. |

---

## 6. Full 265-entry mapping (alphabetical)

| Symbol | Display Name | Sector | adr | cryptoAdj |
|---|---|---|---|---|
| AAPL/USD | Apple | XLK | | |
| ABBV/USD | AbbVie | XLV | | |
| ABNB/USD | Airbnb | XLY | | |
| ADBE/USD | Adobe | XLK | | |
| AEP/USD | American Electric Power | XLU | | |
| AFL/USD | Aflac | XLF | | |
| AIG/USD | AIG | XLF | | |
| ALL/USD | Allstate | XLF | | |
| ALNY/USD | Alnylam Pharmaceuticals | XLV | | |
| AMAT/USD | Applied Materials | XLK | | |
| AMC/USD | AMC Entertainment | XLC | | |
| AMD/USD | AMD | XLK | | |
| AMGN/USD | Amgen | XLV | | |
| AMT/USD | American Tower | XLRE | | |
| AMZN/USD | Amazon | XLY | | |
| AON/USD | Aon | XLF | | |
| ARCT/USD | Arcturus Therapeutics | XLV | | |
| ARKG/USD | ARK Genomic Revolution ETF | BROAD_ETF | | |
| ARKK/USD | ARK Innovation ETF | BROAD_ETF | | |
| ASML/USD | ASML Holding | XLK | ✓ | |
| AUR/USD | Aurora Innovation | XLI | | |
| AVB/USD | AvalonBay Communities | XLRE | | |
| AXP/USD | American Express | XLF | | |
| BABA/USD | Alibaba | XLY | ✓ | |
| BAC/USD | Bank of America | XLF | | |
| BAX/USD | Baxter International | XLV | | |
| BBBY/USD | Bed Bath & Beyond | XLY | | |
| BCC/USD | Boise Cascade | XLB | | |
| BDX/USD | Becton Dickinson | XLV | | |
| BE/USD | Bloom Energy | XLI | | |
| BHC/USD | Bausch Health | XLV | ✓ | |
| BIDU/USD | Baidu | XLC | ✓ | |
| BIIB/USD | Biogen | XLV | | |
| BILI/USD | Bilibili | XLC | ✓ | |
| BITF/USD | Bitfarms | XLK | | ✓ |
| BLDP/USD | Ballard Power | XLI | ✓ | |
| BLNK/USD | Blink Charging | XLI | | |
| BMBL/USD | Bumble | XLC | | |
| BMY/USD | Bristol Myers Squibb | XLV | | |
| BNTX/USD | BioNTech | XLV | ✓ | |
| BTBT/USD | Bit Digital | XLK | | ✓ |
| BTI/USD | British American Tobacco | XLP | ✓ | |
| BUD/USD | Anheuser-Busch InBev | XLP | ✓ | |
| CB/USD | Chubb | XLF | | |
| CBOE/USD | Cboe Global Markets | XLF | | |
| CCI/USD | Crown Castle | XLRE | | |
| CHPT/USD | ChargePoint | XLI | | |
| CI/USD | Cigna | XLV | | |
| CIFR/USD | Cipher Mining | XLK | | ✓ |
| CL/USD | Colgate-Palmolive | XLP | | |
| CLSK/USD | CleanSpark | XLK | | ✓ |
| CMCSA/USD | Comcast | XLC | | |
| CME/USD | CME Group | XLF | | |
| CNC/USD | Centene | XLV | | |
| COIN/USD | Coinbase | XLF | | ✓ |
| COP/USD | ConocoPhillips | XLE | | |
| COST/USD | Costco | XLP | | |
| CRCL/USD | Circle | XLF | | ✓ |
| CRWD/USD | CrowdStrike | XLK | | |
| CSCO/USD | Cisco Systems | XLK | | |
| CVS/USD | CVS Health | XLV | | |
| CVX/USD | Chevron | XLE | | |
| D/USD | Dominion Energy | XLU | | |
| DASH/USD | DoorDash | XLY | | |
| DE/USD | Deere & Company | XLI | | |
| DEO/USD | Diageo | XLP | ✓ | |
| DFDV/USD | DeFi Development Corp | XLF | | ✓ |
| DHR/USD | Danaher | XLV | | |
| DIS/USD | Disney | XLC | | |
| DLR/USD | Digital Realty | XLRE | | |
| DTE/USD | DTE Energy | XLU | | |
| DUK/USD | Duke Energy | XLU | | |
| ED/USD | Consolidated Edison | XLU | | |
| EDU/USD | New Oriental Education | XLY | ✓ | |
| EIX/USD | Edison International | XLU | | |
| ELV/USD | Elevance Health | XLV | | |
| EMR/USD | Emerson Electric | XLI | | |
| EQIX/USD | Equinix | XLRE | | |
| EQR/USD | Equity Residential | XLRE | | |
| EQT/USD | EQT Corporation | XLE | | |
| ESS/USD | Essex Property Trust | XLRE | | |
| EVGO/USD | EVgo | XLU | | |
| EWA/USD | Australia ETF | INTL_ETF | | |
| EWC/USD | Canada ETF | INTL_ETF | | |
| EWG/USD | Germany ETF | INTL_ETF | | |
| EWI/USD | Italy ETF | INTL_ETF | | |
| EWL/USD | Switzerland ETF | INTL_ETF | | |
| EWN/USD | Netherlands ETF | INTL_ETF | | |
| EWP/USD | Spain ETF | INTL_ETF | | |
| EWQ/USD | France ETF | INTL_ETF | | |
| EWS/USD | Singapore ETF | INTL_ETF | | |
| EWU/USD | United Kingdom ETF | INTL_ETF | | |
| EWZ/USD | Brazil ETF | INTL_ETF | | |
| EXC/USD | Exelon | XLU | | |
| F/USD | Ford | XLY | | |
| FAST/USD | Fastenal | XLI | | |
| FCEL/USD | FuelCell Energy | XLI | | |
| FOX/USD | Fox Corporation (B) | XLC | | |
| FOXA/USD | Fox Corporation (A) | XLC | | |
| GEV/USD | GE Vernova | XLI | | |
| GILD/USD | Gilead Sciences | XLV | | |
| GLD/USD | Gold ETF | BROAD_ETF | | |
| GLOB/USD | Globant | XLK | ✓ | |
| GLXY/USD | Galaxy Digital | XLF | | ✓ |
| GM/USD | General Motors | XLY | | |
| GME/USD | GameStop | XLY | | |
| GOOGL/USD | Alphabet | XLC | | |
| GOTU/USD | Gaotu Techedu | XLY | ✓ | |
| GS/USD | Goldman Sachs | XLF | | |
| GWW/USD | W.W. Grainger | XLI | | |
| HCA/USD | HCA Healthcare | XLV | | |
| HD/USD | Home Depot | XLY | | |
| HIG/USD | Hartford Financial | XLF | | |
| HIVE/USD | HIVE Digital Technologies | XLK | | ✓ |
| HOLX/USD | Hologic | XLV | | |
| HOOD/USD | Robinhood | XLF | | |
| HUM/USD | Humana | XLV | | |
| HUT/USD | Hut 8 Mining | XLK | | ✓ |
| IBM/USD | IBM | XLK | | |
| ICE/USD | Intercontinental Exchange | XLF | | |
| IEMG/USD | Core MSCI Emerging Markets ETF | BROAD_ETF | | |
| INTC/USD | Intel | XLK | | |
| JD/USD | JD.com | XLY | ✓ | |
| JNJ/USD | Johnson & Johnson | XLV | | |
| JPM/USD | JPMorgan Chase | XLF | | |
| KO/USD | Coca-Cola | XLP | | |
| LCID/USD | Lucid Group | XLY | | |
| LECO/USD | Lincoln Electric | XLI | | |
| LI/USD | Li Auto | XLY | ✓ | |
| LIDR/USD | AEye Inc. | XLK | | |
| LLY/USD | Eli Lilly | XLV | | |
| LMND/USD | Lemonade | XLF | | |
| LMT/USD | Lockheed Martin | XLI | | |
| LNC/USD | Lincoln National | XLF | | |
| LOW/USD | Lowe's | XLY | | |
| LRCX/USD | Lam Research | XLK | | |
| LYFT/USD | Lyft | XLI | | |
| MAA/USD | Mid-America Apartment | XLRE | | |
| MCD/USD | McDonald's | XLY | | |
| MCK/USD | McKesson | XLV | | |
| MCO/USD | Moody's | XLF | | |
| MDB/USD | MongoDB | XLK | | |
| MDLZ/USD | Mondelez International | XLP | | |
| MDT/USD | Medtronic | XLV | | |
| MET/USD | MetLife | XLF | | |
| META/USD | Meta Platforms | XLC | | |
| MMM/USD | 3M | XLI | | |
| MO/USD | Altria Group | XLP | | |
| MOH/USD | Molina Healthcare | XLV | | |
| MPC/USD | Marathon Petroleum | XLE | | |
| MRK/USD | Merck | XLV | | |
| MRNA/USD | Moderna | XLV | | |
| MRVL/USD | Marvell Technology | XLK | | |
| MS/USD | Morgan Stanley | XLF | | |
| MSCI/USD | MSCI Inc. | XLF | | |
| MSFT/USD | Microsoft | XLK | | |
| MSTR/USD | MicroStrategy | XLK | | ✓ |
| MTCH/USD | Match Group | XLC | | |
| NBIX/USD | Neurocrine Biosciences | XLV | | |
| NDAQ/USD | Nasdaq Inc. | XLF | | |
| NEE/USD | NextEra Energy | XLU | | |
| NET/USD | Cloudflare | XLK | | |
| NFLX/USD | Netflix | XLC | | |
| NIO/USD | NIO | XLY | ✓ | |
| NKE/USD | Nike | XLY | | |
| NOW/USD | ServiceNow | XLK | | |
| NTES/USD | NetEase | XLC | ✓ | |
| NTNX/USD | Nutanix | XLK | | |
| NVAX/USD | Novavax | XLV | | |
| NVDA/USD | Nvidia | XLK | | |
| NVO/USD | Novo Nordisk | XLV | ✓ | |
| NVT/USD | nVent Electric | XLI | | |
| NWS/USD | News Corporation (B) | XLC | | |
| NWSA/USD | News Corporation (A) | XLC | | |
| O/USD | Realty Income | XLRE | | |
| OPEN/USD | Opendoor Technologies | XLRE | | |
| ORCL/USD | Oracle | XLK | | |
| OXY/USD | Occidental Petroleum | XLE | | |
| PANW/USD | Palo Alto Networks | XLK | | |
| PARA/USD | Paramount Global | XLC | | |
| PATH/USD | UiPath | XLK | | |
| PCG/USD | PG&E | XLU | | |
| PDD/USD | PDD Holdings | XLY | ✓ | |
| PEP/USD | PepsiCo | XLP | | |
| PFE/USD | Pfizer | XLV | | |
| PG/USD | Procter & Gamble | XLP | | |
| PGR/USD | Progressive | XLF | | |
| PH/USD | Parker-Hannifin | XLI | | |
| PLD/USD | Prologis | XLRE | | |
| PLTR/USD | Palantir | XLK | | |
| PLUG/USD | Plug Power | XLI | | |
| PM/USD | Philip Morris International | XLP | | |
| PNR/USD | Pentair | XLI | | |
| PRU/USD | Prudential Financial | XLF | | |
| PSA/USD | Public Storage | XLRE | | |
| PSX/USD | Phillips 66 | XLE | | |
| PWR/USD | Quanta Services | XLI | | |
| PYPL/USD | PayPal | XLF | | |
| QCOM/USD | Qualcomm | XLK | | |
| QQQ/USD | Nasdaq 100 ETF | INDEX_PROXY | | |
| RBLX/USD | Roblox | XLC | | |
| REGN/USD | Regeneron | XLV | | |
| RGEN/USD | Repligen | XLV | | |
| RIVN/USD | Rivian | XLY | | |
| RKT/USD | Rocket Companies | XLF | | |
| RMD/USD | ResMed | XLV | | |
| ROK/USD | Rockwell Automation | XLI | | |
| ROOT/USD | Root Inc. | XLF | | |
| ROP/USD | Roper Technologies | XLK | | |
| RTX/USD | RTX Corporation | XLI | | |
| SAGE/USD | Sage Therapeutics | XLV | | |
| SAP/USD | SAP | XLK | ✓ | |
| SHEL/USD | Shell | XLE | ✓ | |
| SHOP/USD | Shopify | XLK | ✓ | |
| SLB/USD | Schlumberger | XLE | | |
| SNDK/USD | SanDisk | XLK | | |
| SNOW/USD | Snowflake | XLK | | |
| SO/USD | Southern Company | XLU | | |
| SOFI/USD | SoFi Technologies | XLF | | |
| SPG/USD | Simon Property Group | XLRE | | |
| SPGI/USD | S&P Global | XLF | | |
| SPY/USD | S&P 500 ETF | INDEX_PROXY | | |
| SRE/USD | Sempra Energy | XLU | | |
| STZ/USD | Constellation Brands | XLP | | |
| SUI/USD | Sun Communities | XLRE | | |
| SUPN/USD | Supernus Pharmaceuticals | XLV | | |
| T/USD | AT&T | XLC | | |
| TAL/USD | TAL Education | XLY | ✓ | |
| TAP/USD | Molson Coors | XLP | | |
| TER/USD | Teradyne | XLK | | |
| TEVA/USD | Teva Pharmaceuticals | XLV | ✓ | |
| TGT/USD | Target | XLY | | |
| THC/USD | Tenet Healthcare | XLV | | |
| TME/USD | Tencent Music | XLC | ✓ | |
| TMO/USD | Thermo Fisher Scientific | XLV | | |
| TMUS/USD | T-Mobile | XLC | | |
| TONX/USD | TONX Inc. | XLK | | |
| TOTL/USD | DoubleLine Total Return ETF | BROAD_ETF | | |
| TRV/USD | Travelers | XLF | | |
| TSLA/USD | Tesla | XLY | | |
| TT/USD | Trane Technologies | XLI | | |
| TXN/USD | Texas Instruments | XLK | | |
| UBER/USD | Uber | XLI | | |
| UHS/USD | Universal Health Services | XLV | | |
| UL/USD | Unilever | XLP | ✓ | |
| UPS/USD | UPS | XLI | | |
| URI/USD | United Rentals | XLI | | |
| UWMC/USD | UWM Holdings | XLF | | |
| VIA/USD | Via Renewables | XLU | | |
| VICI/USD | VICI Properties | XLRE | | |
| VLO/USD | Valero Energy | XLE | | |
| VOYA/USD | Voya Financial | XLF | | |
| VRTX/USD | Vertex Pharmaceuticals | XLV | | |
| VTRS/USD | Viatris | XLV | | |
| VZ/USD | Verizon | XLC | | |
| WBA/USD | Walgreens Boots Alliance | XLP | | |
| WBD/USD | Warner Bros. Discovery | XLC | | |
| WFC/USD | Wells Fargo | XLF | | |
| XBI/USD | SPDR S&P Biotech ETF | BROAD_ETF | | |
| XEL/USD | Xcel Energy | XLU | | |
| XOM/USD | ExxonMobil | XLE | | |
| XPEV/USD | XPeng | XLY | ✓ | |
| XYL/USD | Xylem | XLI | | |
| XYZ/USD | Block (XYZ) | XLF | | |
| ZTS/USD | Zoetis | XLV | | |

---

## 7. Spot-check ask

Per scope rev2 D5 + your Step 1 #1 ask, please review:

1. **Spot-check the 14 GICS reclassification gotchas in §2.** Particularly GOOGL→XLC, AMZN→XLY, MSTR→XLK+cryptoAdjacent, COIN→XLF+cryptoAdjacent.
2. **Verify the cryptoAdjacent flag set (§4).** 11 names spanning balance-sheet / exchange / miner sub-groups.
3. **XLB thinness (§1).** Only 1 entry (BCC). If you want a Phase E follow-up to add LIN/SHW/FCX/ECL to the xStock registry, flag it now.
4. **XLC (~22 entries) and XLE (~10 entries) sample sizes.** Both clear the 7-sector floor + 30-global floor under steady-state, but worth noting if you see anything off.
5. **Any specific mappings that look wrong to you** — file path / line reference happy to dig in.

ETA: 30-60 min spot-check turnaround per your Step 1 #1 estimate.

Once you ACK, I commit sub-task B (registry data already filled + sector flipped to required in `XstockSpotEntry`) and proceed to sub-task C (scanner wiring).

— Claude Code, 2026-05-17
