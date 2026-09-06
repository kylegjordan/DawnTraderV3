# CODEX DATA EXPORT — WHAT THIS IS, WHAT IT IS NOT, AND WHAT IS DELIBERATELY MISSING

> **Read this before opening a single file.** Two of the sections below are not housekeeping — §2 and §4 change what these files can be used to conclude.

---

## 1. THE FILES

| file | rows | what it is |
|---|---|---|
| `trades_closed.csv` | **706** | Every closed trade we have. Prices, sides, quantities, times, exit reasons, and the full **price-provenance** block. |
| `tape_1m_crypto.csv` | **814,356** | 1-minute bars, **7 days**, every crypto symbol (571). |
| `tape_1m_xstock.csv` | **807,914** | 1-minute bars, **7 days**, every xStock symbol (480). |
| `quotes_crypto.csv` | **1,068,352** | Full-resolution bid/ask/last snapshots, **3 days**, every crypto symbol. |
| `quotes_xstock.csv` | **2,887,660** | Full-resolution bid/ask/last snapshots, **1 day** (2026-09-04), every xStock symbol. |
| `fee_ladder.csv` | 19 | The venue's **account-confirmed** fee ladders. ⛔ **NOT from our database.** |
| `deploys.txt` | **1 record** | ⛔ **The CURRENT deploy only — NOT a history. See the warning below.** |
| `code_changes_exit_path.csv` | **39** | Commits touching exit-path code since 2026-08-25. ⚠️ **COMMIT times, not deploy times.** |

⚠️ **ONE COLUMN LOOKS LIKE AN ECONOMIC FIGURE AND IS NOT: `exit_fee_mode` is a LABEL** — it says
whether the exit leg rested as a maker or crossed as a taker. **No amount, no rate.** It is kept
because which leg was which is a fact about the order, and you cannot reconstruct it from prices.
⇒ **Pair it with `chosen_entry_mode` for the entry side.**

**Total on disk: ~966 MB uncompressed.** The two quote files are ~78 % of that; the tape and the
trades are small. **Start with the small ones** — `trades_closed.csv` is 706 rows and answers more
per byte than anything else here.

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

⚠️ **AS OF THE EXPORT, AND ALREADY MOVING: work landed on 2026-09-06 that parses a venue-supplied timestamp and carries it BESIDE our own clock rather than replacing it** (`B-PRICE-SIDE-BY-JOB` §14). ⇒ **the "no timestamp at all" statement is true of the archived rows IN THIS EXPORT and is being actively worked on the live system.** It does not change what you can compute here; it does mean **a recommendation of "capture the venue clock" is already in flight, so aim past it.**

⚠️ **This is the central open question in your brief, not a footnote.** We run staleness ceilings, skip exit checks and raise alerts against this clock, and **we cannot currently distinguish "the venue is quiet" from "our feed is lagging."** If your honest conclusion is that staleness is not knowable without a venue timestamp, **say that** — it is the answer we most need.

---

## 5. ⚠️ KNOWN DEFECTS AND ASYMMETRIES IN THE DATA ITSELF

- ⛔ **THE TWO QUOTE FILES COVER DIFFERENT WINDOWS: crypto 3 days, xStock 1 day.** The xStock feed writes roughly **2.8 M rows/day** against crypto's **0.36 M**, so equal windows were not practical. **Both are full tick resolution over every symbol — the WINDOW differs, the SAMPLING does not.** ⛔ **Never compare tick COUNTS across the two files; compare rates within each.**
- ⚠️ **Crypto and xStock are structurally different instruments.** A crypto tick size is the venue's published statement; an xStock increment is **inferred by us**. Do not pool them.
- ⚠️ **The trade population is small (706) and unevenly split** across strategies, classes and time. Several strategies have never traded at all. **A per-strategy statement on this population is a statement about a handful of rows** — state the n every time.
- ⚠️ **Holding periods are censored, and not uniformly.** The active lanes have **no force close** (right-censored). The passive side has **two different ceilings — 7 days real, 48 hours shadow** — which are different instruments. ⛔ **A ceiling-terminated trade is CENSORED, not an event.** Count it as an observed exit and you manufacture a mode at the wall.
- ⛔⛔ **WE CANNOT GIVE YOU DEPLOY BOUNDARIES, AND THE BRIEF ASKS YOU TO SPLIT ON THEM. Read this before deciding what to do about it.**
  **`deploys.txt` holds ONE record — the deploy currently live.** There is no deploy history table: measured, **zero tables in the schema match `%deploy%`**, and the on-host record is overwritten each time. **So the instant each exit change went live is not recoverable from anything we hold.**
  ✅ **What we CAN give you is `code_changes_exit_path.csv`: 39 commits touching the exit path since 2026-08-25**, each with its file and subject. ⚠️ **These are COMMIT times. A commit is not a deploy** — the gap between them is unmeasured and is sometimes days.
  ⇒ ⛔ **DO NOT SILENTLY TREAT COMMIT TIME AS DEPLOY TIME.** Either state the assumption explicitly wherever you rely on it, or **declare the stratification `INSUFFICIENT`** — which is a first-class verdict here and, on this particular question, may well be the correct one. **Telling us the holding-period split cannot be made honestly is more useful than a split built on a proxy.**
- ⚠️ **Exit mechanics DID change inside the window** — that much is certain from the commit list above. **Do not assume one population.**
- ⚠️ **`trade_mode` and `mode` are different fields and mean different things.** Check both before filtering.

---

## 6. WHAT TO DO IF SOMETHING IS MISSING

⛔ **BOUNCE, DO NOT SUBSTITUTE.** If a question needs a column that is not here, **say so and stop that question.** A proxy silently changes what is being measured, and we would not be able to tell from your report that it happened.

✅ **A request for more or cleaner primitives is a good outcome, not a failure of this export.** Write it to `QUESTIONS.md`.

⛔ **And if you find yourself computing a per-strategy net-expectancy ranking, stop.** That is the withdrawn selection question wearing a cost question's clothes, and it is more dangerous than the original because it returns a number that reads like a finding.
