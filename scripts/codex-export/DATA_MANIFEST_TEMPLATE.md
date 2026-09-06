# CODEX DATA EXPORT — WHAT THIS IS, WHAT IT IS NOT, AND WHAT IS DELIBERATELY MISSING

> **Read this before opening a single file.** Two of the sections below are not housekeeping — §2 and §4 change what these files can be used to conclude.

---

## 1. THE FILES

| file | rows | what it is |
|---|---|---|
| `trades_closed.csv` | **706** | Every closed trade we have. Prices, sides, quantities, times, exit reasons, and the full **price-provenance** block. |
| `tape_1m_crypto.csv` | ~814,000 | 1-minute bars, **7 days**, every crypto symbol (571). |
| `tape_1m_xstock.csv` | ~808,000 | 1-minute bars, **7 days**, every xStock symbol (480). |
| `quotes_crypto.csv` | ~1,068,000 | Full-resolution bid/ask/last snapshots, **3 days**, every crypto symbol. |
| `quotes_xstock.csv` | ~2,690,000 | Full-resolution bid/ask/last snapshots, **1 day** (2026-09-04), every xStock symbol. |
| `fee_ladder.csv` | 19 | The venue's **account-confirmed** fee ladders. ⛔ **NOT from our database.** |
| `deploys.txt` | — | The staging deploy record: sha and time. Needed to split the holding-period window. |

---

## 2. ⛔⛔ WHAT IS MISSING, AND WHY IT IS MISSING RATHER THAN LABELLED

**Every fee-derived, cost-derived and gate-outcome column has been removed. There is no `pnl`, no `net_pnl`, no `fees`, no `total_cost`, no expected-value figure, and no gate decision anywhere in this export.**

**The reason is a defect of ours, and you found the thread that led to it.** In your last assignment you asked whether our fee model is externally identified and **refused to rule without authenticated evidence.** Acting on that refusal we discovered that **we had been charging xStock the crypto fee schedule**: taker `0.008` against a real `0.0010` — **8× too high** — and maker `0.004` against a real **`−0.0002`, which is a rebate, so our sign was inverted.** A taker/taker xStock round trip was modelled at 1.60 % against a real 0.20 %.

⇒ ⛔ **Every economic figure we have stored is therefore an artefact of that error, and so is every admission decision, because the gate that decides what gets traded is computed from those rates.**

★ **Why omitted rather than shipped-with-a-warning:** we measured, on ourselves, that instruction-shaped safeguards fail — three separate attempts to change a behaviour by instruction, three failures, and only removing the thing worked. **An absent column cannot be audited as market structure. A caveated one can.**

⛔ **THE SHADOW RANKING POOL IS NOT HERE EITHER, and that is also deliberate.** Its only use was the question *"does our selection add value"*, which has been **withdrawn from the brief**: measured on this window it grades **the broken selector**, and that verdict expires the moment the operator is corrected.

---

## 3. ✅ WHAT IS *NOT* CONTAMINATED — this is what makes the export worth having

**Signal generation is fee-free.** A detector builds its entry, stop and target from price, volatility and chart structure with **no cost input at all**. ⇒ **the candidate SET was generated identically to how a correct system would have generated it.** Only the filtering, the maker-vs-taker choice and the ranking were distorted.

**And the tape is the tape.** `tape_*.csv` and `quotes_*.csv` are venue observations. They are untouched by any of this.

⇒ **So: market-structure questions are fully answerable here. Questions about which trades we chose are not.**

---

## 4. ⛔⛔ THE TIMESTAMP PROBLEM — READ THIS BEFORE COMPUTING ANY AGE

**`captured_at` in `quotes_*.csv` is OUR RECEIPT TIME. It is not an exchange time.**

**The venue's ticker frame carries no timestamp at all** — that is stated in our own code (`server/services/passive-archive/equity-spot-archiver.ts:127`, issue `#943`). ⇒ **every age derived from this column includes network transit, queueing and our own processing latency.**

⚠️ **This is the central open question in your brief, not a footnote.** We run staleness ceilings, skip exit checks and raise alerts against this clock, and **we cannot currently distinguish "the venue is quiet" from "our feed is lagging."** If your honest conclusion is that staleness is not knowable without a venue timestamp, **say that** — it is the answer we most need.

---

## 5. ⚠️ KNOWN DEFECTS AND ASYMMETRIES IN THE DATA ITSELF

- ⛔ **THE TWO QUOTE FILES COVER DIFFERENT WINDOWS: crypto 3 days, xStock 1 day.** The xStock feed writes roughly **2.8 M rows/day** against crypto's **0.36 M**, so equal windows were not practical. **Both are full tick resolution over every symbol — the WINDOW differs, the SAMPLING does not.** ⛔ **Never compare tick COUNTS across the two files; compare rates within each.**
- ⚠️ **Crypto and xStock are structurally different instruments.** A crypto tick size is the venue's published statement; an xStock increment is **inferred by us**. Do not pool them.
- ⚠️ **The trade population is small (706) and unevenly split** across strategies, classes and time. Several strategies have never traded at all. **A per-strategy statement on this population is a statement about a handful of rows** — state the n every time.
- ⚠️ **Holding periods are censored, and not uniformly.** The active lanes have **no force close** (right-censored). The passive side has **two different ceilings — 7 days real, 48 hours shadow** — which are different instruments. ⛔ **A ceiling-terminated trade is CENSORED, not an event.** Count it as an observed exit and you manufacture a mode at the wall.
- ⚠️ **Exit mechanics changed inside the window.** Use `deploys.txt` to enumerate the exit-touching deploys and split there. **Do not assume one population.**
- ⚠️ **`trade_mode` and `mode` are different fields and mean different things.** Check both before filtering.

---

## 6. WHAT TO DO IF SOMETHING IS MISSING

⛔ **BOUNCE, DO NOT SUBSTITUTE.** If a question needs a column that is not here, **say so and stop that question.** A proxy silently changes what is being measured, and we would not be able to tell from your report that it happened.

✅ **A request for more or cleaner primitives is a good outcome, not a failure of this export.** Write it to `QUESTIONS.md`.

⛔ **And if you find yourself computing a per-strategy net-expectancy ranking, stop.** That is the withdrawn selection question wearing a cost question's clothes, and it is more dangerous than the original because it returns a number that reads like a finding.
