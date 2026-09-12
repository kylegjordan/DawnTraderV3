# B-KRAKEN-FEE-WATCH — SCOPE

**Batch:** `B-KRAKEN-FEE-WATCH` · **Issue:** `#1011` · **Plan row:** `PHASE_19_PLAN` 2.4-FEE-b · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** **r7** — Langston's r6 BLOCKER-1/2/3 fixed **and each one now has a harness case that makes it fire** (his prescription, verbatim: *"every guard in this batch gets a harness case that makes it fire"*); findings 1-6 folded; **the condition discharged — what the 2026-07-09 revision actually changed is now established at the source, and r6's design would have MISSED IT**; cadence ruled **daily, not hourly**, with the reason stated (2026-09-12) · **Card:** `PVTI_lAHODmulEM4BfQP4zg6mZFg`

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | r1 M4: **one** spot table, rung 1 `0.40/0.80` | **FOUR ladders carry a spot maker/taker column pair, and one disagrees** | Langston BLOCKER-1, re-derived by me |
| 2 | r2 §2.2: *"three independent rungs cross-checked"* — tables 1-2 match the account at rungs 1, 12, 17 | ⛔ **STRUCK. The evidence is 17/17**, and §0.b's three rungs were the paragraph's quoted spot-checks, not the extent of what was captured — §1's seventeen rungs carry the same authenticated provenance | **Langston, r2 ruling: "ALL SEVENTEEN"**. I had read the prose as the population |
| 3 | r2: the governing table is determined by matching | ⛔ **The governing heading is a PINNED CONSTANT. The 17-rung check VERIFIES the pin; on failure it mints `GOVERNING-TABLE-IN-DOUBT` and does NOT re-select** | Langston r2 edit 2 — a watcher that picks whichever table matches best can never report drift |
| 4 | r2 OBJ-1: anchor = enclosing heading + column-name resolution | **Plus ROW-LABEL resolution** (`Tier 1-12` + `Pro 1-5` → rungs 1-17) | Langston r2 edit 3 — otherwise OBJ-5's `rung count ≠ 17` trips on the page's own labelling on day one |
| 5 | r2 §2.1: ladder values, and a later working claim that only the margin table matched | **Three of the four ladders match the reference 17/17; ladder 3 diverges at all 17** | both earlier readings were artifacts of offset-scanning; see §2.3 |
| 6 | r3 §2.2: ladder 3 is *"a different commercial schedule"*, and §7 left it *"named, not chased"* | ⛔ **FALSE. It is the page's own `Spot Maker Rebate` table — a PER-PAIR maker incentive on an eligible-pair list.** The name was on the page all along | **Langston BLOCKER-1**, re-derived by me: the accordion title and the body text |
| 7 | r3: ladder 4 sits under `Margin` | ⛔ **FALSE. It is under `Futures`.** `Margin` holds a 113-row `Currency \| Opening fee \| Rollover fee` table with **no ladder at all** | **Langston BLOCKER-2**, re-derived |
| 8 | r3 §2.2: the enclosing headings include `Kraken Pro` | ⛔ **FALSE. There is no `Kraken Pro` accordion on this page.** The ladder headings are `Cross-platform Fee Tiers`, `Spot Crypto`, `Spot Maker Rebate`, `Futures` | **Langston BLOCKER-3**, re-derived |
| 10 | ⛔ **r1-r4 OBJ-4: "there is no machine source for the xStock rates", shipped as a 90-DAY RE-CAPTURE OBLIGATION ON KYLE** | ✅ **FALSE. `Pro xStocks` is in the SAME payload we already parse** — `$0 + → maker `-0.02%` / taker `0.10%``, byte-exact to the contract `#1010` deployed. **xStock becomes a SECOND PINNED TABLE, read on every run.** | **Langston r4 BLOCKER**, re-derived by me. **M5's needle was the literal `$100,000,001` (0 hits); the page's label is `$100,000,000 +` (6 hits)** — a false absence one dollar wide |
| 11 | r4 OBJ-5: a strict column raise | **Kept, but it is UNREACHABLE on the live page** — the `Tier`-header gate returns first for 4 of 9 tables. **It is exercised by a FIXTURE, and the harness proves it (exit 2)** | Langston **FINDING-A** |
| 12 | r4 OBJ-2: "disagreement is the finding" AND "a divergent pin STOPS" | ⛔ **The code took neither branch — a divergent pin printed and fell through to `return 0`, so measured drift and no-change shared an exit status OBJ-5 reads outcomes from.** **THREE outcomes now have THREE statuses: 0 no-change · 2 MEASUREMENT FAILED · 3 measured drift** | Langston **FINDING-B** |
| 13 | r4 OBJ-10: one object (the rebate list) | **FIVE schedules `fee_model` cannot express — and FOUR are already in the payload.** Only the rebate's eligible-pair list needs the second fetch | Langston **FINDING-C** |
| 9 | r3 OBJ-1: pin `Cross-platform Fee Tiers` | **PIN `Spot Crypto`, WITH A STATED REASON** — it is the product the ladder governs for us; the cross-platform table is the umbrella explaining how tiers combine, and is the likelier one to lag a spot-only revision | Langston BLOCKER-3: either is defensible, **an unreasoned pin is not** |

---

## 1. THE DEFECT

**Kraken revised its fee schedule on 2026-07-09. We found out on 2026-09-06, because Kyle looked at the page.** For 59 days the system priced against a model nothing compared to its source. That gap produced `#1010`.

⛔ **THREE OBJECTS, NOT TWO** — the live **PAGES**, our **TRANSCRIPTION**, and the **DATABASE**. A page-only diff catches the next venue change and is blind to drift we already have. **The page-versus-database leg is the one that earns its keep.**

### 1.a ⭐⭐ WHAT THE 2026-07-09 REVISION ACTUALLY CHANGED — AND WHY r6's DESIGN WOULD HAVE MISSED IT (Langston r6 condition, discharged; §9.4 disposition 1)

**Langston's condition was exact: the scope never says what the motivating event actually did — it is the only real test of the design.** Established at the source (`support.kraken.com/articles/cross-platform-fee-tier-changes`, parsed from the same payload shape this batch already reads). **Kraken's own words:**
> *"On **July 9, 2026**, we changed how your fee tier is determined on Kraken. Instead of looking at each product separately, your tier is now based on your activity across the entire Kraken platform."* · *"New tiers were introduced and some existing fees changed."*

⛔⛔ **SO THE EVENT HAD TWO HALVES, AND r6 WATCHED ONLY ONE OF THEM.** The rate tables moved (*"some existing fees changed"*) — **OBJ-1/2/3 cover that.** But the **headline change was to TIER DETERMINATION**: the qualifying measure became **the best of 30-day spot volume, 30-day futures volume, or Assets on Platform**, where before each product stood alone. ⭐ **EVERY OBJECTIVE IN r6 READS A RATE TABLE. NOTHING IN r6 READS THE RULE THAT DECIDES WHICH ROW OF THAT TABLE APPLIES TO US.**
⇒ **Replayed honestly: had the watcher been running on 2026-07-08, it would have caught the rate half and been structurally blind to the half Kraken led with.** That is the answer to the condition, and it is not a comfortable one.

✅ **WHAT IS *NOT* NEW, STATED FIRST SO THIS IS NOT REPORTED AS A DISCOVERY (§9.5(b-ii)):** `KRAKEN_FEE_SCHEDULE_REFERENCE.md` **already records the mechanism** — best-of-three qualification (`:59`), AoP assessed **point-in-time** rather than on a 30-day average (`:84`), the rung being a property of **(account, product)** (`§2.c`), and it already names that support article as a source (`:14`). **The governance was right and captured it on 2026-09-06.** What was missing is only this: **no objective watches it.**

⭐ **TWO DETAILS THAT ARE NEW AND CHECKABLE, both from the article's own body:**
- **Spot volume EXCLUDES forex and stablecoin pairs** — the article names `USDC/USDT`, `EUR/USD`, `USDC/USD` explicitly. ⇒ **the §2.5 stratum-A pairs (34 of 481 rows, 12 of 119 symbols) are excluded from tier qualification AND charged off a different schedule.** Two separate consequences of one exclusion, and the scope stated neither.
- **Spot volume INCLUDES xStocks markets.** ⚠️ **NOT a contradiction of §0.c** (*"xStock fees are not cross-platform"*), and I checked before writing it: xStock **trades count toward the SPOT tier**, while the **xStock tier itself** is still set by spot volume alone, with no AoP and no futures column. **Both are true; they are different directions.**

⇒ **DISPOSITION 1 — FOLDED, as OBJ-11 below.** The article is machine-readable in exactly the shape this batch already parses, so the fix is cheap; shipping a fee watcher that would have missed its own motivating case is not.

---

## 2. WHAT I MEASURED

### 2.1 The instrument, and why it is a committed artifact rather than a probe

**`scripts/analysis/kraken_fee_ladder_extract.py`** — it locates `window.__INITIAL_PROPS__={…}` inside a plain `<script>`, slices it by balanced scan, parses it as JSON, and reads every `_type: "paragraphArticleBodyTable"` node's `field_rows` → `field_cells`.

⛔ **IT CARRIES A CONTROL THAT CAN FAIL, AND THAT IS THE POINT:** at least one ladder must read Tier 1 = `(0.40, 0.80)` — a value obtained independently from a direct read and from the authenticated account dialog. **On failure it prints `CONTROL FAILED` and reports nothing.**
⚠️ **Six earlier inline attempts produced four different wrong attributions** (forward windows crossing table boundaries, a backward scan returning zero, an attachment rule that collapsed four ladders into two, a shell-mangled backslash, and a payload finder looking for `type="application/json"` when the data is in a plain `<script>`). **Every one was caught by the control before it reached a document.** That is why the extraction is a file, parses JSON as JSON, and ships with the control wired in.

### 2.2 The four ladders — named by their own accordion titles

⭐ **The heading capture that r3 listed as an unsatisfied residual is now IN the extractor** (thread the ancestor trail, read the nearest `paragraphAccordionItem.field_title` — five lines, Langston's fix). **It is what turned three anonymous look-alike tables into named objects, and it falsified three of r3's stated facts.**

| accordion title | Tier 1 (maker/taker) | rungs | vs reference §1 | maker delta set |
|---|---|---|---|---|
| **`Cross-platform Fee Tiers`** | `0.40 / 0.80` | 17 | ✅ **17/17** | `{0.00}` |
| ⭐ **`Spot Crypto`** — **THE PIN** | `0.40 / 0.80` | 17 | ✅ **17/17** | `{0.00}` |
| **`Spot Maker Rebate`** | `0.38 / 0.80` | 17 | ⛔ **0/17** | **`{−0.02}` on every rung** |
| **`Futures`** | `0.40 / 0.80` *(spot pair; its futures pair is `0.02 / 0.05`)* | 17 | ✅ **17/17** | `{0.00}` |

- ⛔ **`Margin` holds NO ladder** — 113 rows of `Currency | Opening fee | Rollover fee`. **r3 called the futures table "the margin table"; the structural point (position is not portable — that table carries futures *and* spot pairs) survives, the label did not.**
- ⛔ **There is NO `Kraken Pro` accordion.** r3 asserted one; it does not exist.
- ⛔ **Three ladders share a byte-identical header row**, so the header cannot discriminate them. **Only the accordion title can** — which is why the pin is on a title and why OBJ-5 treats "the pinned heading resolving to 0 or >1 table" as a fail-loud.

### 2.2a ⛔ WHAT `Spot Maker Rebate` ACTUALLY IS — AND THE LIVE FINDING IT CARRIES

**The page's own body text, verbatim:** *"Spot rebates are a new maker fee incentive structure on a select number of lower-liquidity spot pairs… Designed to improve market structure by stimulating passive liquidity, narrowing spreads, and enhancing overall book depth on recently underperforming pairs. Full fee schedule and eligible pair list are available…"*

⇒ **It is a PER-PAIR maker incentive, not a rival account-wide schedule.** r3's *"a different commercial deal"* is struck, and §7's *"named, not chased"* with it — the name was published on the page.

⛔⛔ **AND THE REAL FINDING FALLS OUT OF IT (Langston, and he is right that it must be homed rather than left "unestablished"): `fee_model` HAS NO PER-PAIR MAKER RATE.** Our maker leg is one value per asset class. **If any pair we trade is on that eligible list, the venue charges us `0.38 %` where we model `0.40 %`** — live drift of exactly the class this batch exists to catch, **already present, and invisible to both the transcription and the database.**
⚠️ **WHAT IS NOT YET MEASURED, and I am not asserting it: WHETHER ANY PAIR WE TRADE IS ON THAT LIST.** The eligible-pair list lives on a linked page this batch has not read. **OBJ-10 establishes it; until then the reach is unknown, not zero** (`#453` — an asserted absence needs presence-evidence).

### 2.5 ⛔ THE PAGE PUBLISHES TWO TABLE SHAPES, AND READING ONLY ONE HID OUR OWN xSTOCK CONTRACT

| shape | header row | rows labelled | found |
|---|---|---|---|
| **TIERED** | labelled `Tier`, columns name their leg (`Spot Maker (%)`) | `Tier 1..12`, `Pro 1..5` | the four ladders in §2.2 |
| **BANDED** | labelled **`add here`**, columns `30- Day Volume (USD) \| Maker \| Taker` | by the band (`$0 +`, `$100,000,000 + **`) | **four schedules, below** |

| banded schedule | `$0 +` band (maker/taker) |
|---|---|
| ⭐ **`Pro xStocks`** — **OUR xSTOCK CONTRACT** | **`-0.02% / 0.10%`** — byte-exact to what `#1010` deployed |
| **`Stablecoin, Pegged Token & FX Pairs`** | `0.20% / 0.20%` |
| **`USDG Pairs`** | `0.00% / 0.01%` |
| **`USDe Pairs`** | `0.00% / 0.00%` |

⛔ **`fee_model` HOLDS ONE RATE PER ASSET CLASS AND CANNOT EXPRESS ANY OF THESE.**
✅ **`FX Pair` → `FX Pairs` corrected (Langston r6 finding 6) — and I nearly adjudicated it the wrong way.** The run prints titles through `%-34s`, and `Stablecoin, Pegged Token & FX Pair` is **exactly 34 characters**, so the truncated output cannot distinguish the two. An untruncated `repr()` settles it: the page says **`FX Pairs`**. **Langston is right and my §2.5 was wrong** — recorded because the truncation, not the reading, was the trap.
⭐ **AND THE BAND-LABEL EVIDENCE THAT MAKES BLOCKER-2 CONCRETE RATHER THAN HYPOTHETICAL:** the same logical band is published **both ways on one page** — `Pro xStocks` and `USDG Pairs` carry **`$100,000,000 + **`** (with the footnote marker) while the stablecoin schedule carries **`$100,000,000 +`** (without). ⇒ **the day `$0 +` gains a marker, an exact-string `.get()` returns `None`** — which is precisely the swallowed-then-false-DRIFT path BLOCKER-2 names. ⚠️ **`Pro xStocks` also has a SECOND band, `-0.02 / 0.08` at `$100,000,000 +`, which no revision of this scope had recorded.**
⭐ **THE COST OF THE FALSE ABSENCE, STATED PLAINLY: r1-r4 would have shipped a RECURRING MANUAL TASK ON KYLE, every 90 days, to re-read a number the machine reads on every run.** The extractor missed the table because `ladder_from()` early-returns unless a header row is labelled exactly `Tier`; M5 missed it because its needle was off by one dollar. **Two independent misses of the same object, and the batch's own control passed through both** (`#453`; recorded on `#1011` and in `MISTAKE_PATTERNS`).

### 2.3 Which ladder governs our account

**`KRAKEN_FEE_SCHEDULE_REFERENCE.md` §1 is seventeen rungs transcribed from Kyle's AUTHENTICATED in-app Fees dialog** (`pro.kraken.com/app/trade/sui-usd#dialog/fee-level`, 2026-09-06), and §0.b records that **every figure in §1 was cross-checked against those dialogs**. The three rungs quoted in §0.b's prose are spot-checks it chose to print, **not the extent of the capture** — my r2 reading of that as the population was wrong, and Langston corrected it at the object.

⇒ **The account ladder matches `Cross-platform Fee Tiers`, `Spot Crypto` and `Futures` at all seventeen rungs, and `Spot Maker Rebate` at none.** The database (`0.004 / 0.008`) is correct for this account **as an account-wide rate** — see §2.2a for the per-pair exception that is not yet bounded.

⭐ **WHY THE PIN IS `Spot Crypto` AND NOT THE OTHER MATCHING TABLE (Langston's reasoning, adopted):** it is **the product the ladder governs for us**. `Cross-platform Fee Tiers` is the umbrella table explaining how tiers combine across products, and is **the likelier of the two to lag a spot-only revision**. Either is defensible on today's values — both read 17/17 — **but an unreasoned pin is not**, and a pin chosen by "it matched" is the runtime best-fit the stop-don't-reselect rule exists to forbid.
⚠️ **Both routes rest on one CC-B read of screenshots that are deliberately uncommitted** (`RUNNING_ISSUES:7796` — they show live balances). **The transcription dependency is unavoidable and was already fully incurred; seventeen rungs costs nothing more than three.**

### 2.4 The other measurements, unchanged from r2

| # | question | measured | control |
|---|---|---|---|
| **M1** | page fetchable from Helsinki? | HTTP 200, ~1.39 MB | `api.kraken.com/0/public/Time` 200/87 B |
| **M5** | xStock **LADDER** (a `Tier 1..Pro 5` table) on the public page? | **NO — and that literal wording is all that survives.** ⛔ **The CONCLUSION drawn from it ("no machine source exists") WAS FALSE:** the rates are published as a **BANDED** table, not a ladder — see §2.5 | ⛔ **The control was testing the wrong thing.** It proved the proximity instrument worked; it never proved `$100,000,001` was the page's own string. It is not (`$100,000,000 +`, 6 hits) |
| **M6** | in-app dialog unauthenticated? | ⛔ **NO** — 13 KB JS shell, 0 rate strings | the public page returned 1.39 MB with rates |
| **M7** | can the API bypass the page? | ⛔ **NO** (Langston, ⊕): `AssetPairs` 1,449 pairs, `fees`/`fees_maker` **empty on 0 of 1,449** | saturated population |

---

## 3. OBJECTIVES AND VERIFICATION

### OBJ-1 — Extract the governing ladder, anchored on ENCLOSING HEADING + COLUMN NAME + ROW LABEL
- **Anchor 1 — the enclosing accordion title, PINNED AS A CONSTANT: `Spot Crypto`.** ⛔ **Never a runtime best-fit.** Three ladders share a byte-identical header row, so the title is the only discriminator. ⭐ **Implemented and proven** — `collect_tables` threads an ancestor trail and reads the nearest `paragraphAccordionItem.field_title`.
- **Anchor 2 — column-name → index within that table** (`Spot Maker (%)`, `Spot Taker (%)`). ⛔ **Never a fixed index** — ladder 4 puts the spot pair at 6/7.
- **Anchor 3 — ROW-LABEL resolution:** the page labels rungs `Tier 1`-`Tier 12` then `Pro 1`-`Pro 5`; the reference numbers them 1-17. **Map `Pro N` → rung `12 + N`.**
- **Parse the JSON payload as JSON** (`window.__INITIAL_PROPS__`, `paragraphArticleBodyTable` → `field_rows`), never offset runs.
- **Normalise every observed cell form:** `<p>0.40 %</p>` · `0.40%` · `0.4%` · `&lt;` · `&gt;` · NBSP. **Compare decimals, never strings** — `0.4%` vs `0.40%` would otherwise alert on day one.
**Verify:** reports **4 ladders**, each with its enclosing heading; the pinned one resolves 17 rungs at `0.40/0.80`; a **mutation test** on a saved body reports the altered rung and only that rung.

### OBJ-2 — THE PAGE-VERSUS-DATABASE LEG, AND THE PIN IS VERIFIED, NEVER RE-SELECTED
Compare the pinned ladder's rung 1 against `module_constants` `fee_model` `crypto_spot`.
⛔ **NO PASS IS PRE-REGISTERED.** The run names the heading it read; **agreement OR disagreement is a successful run** — a disagreement is the finding.
⛔ **IDENTITY AND VALUES ARE TWO DIFFERENT CHECKS, AND SAYING SO IS THE POINT (Langston, r3):** the 17-rung match is **NECESSARY BUT NOT SUFFICIENT** for the pin — **three ladders satisfy it**. **IDENTITY is verified by the pinned title resolving to EXACTLY ONE table** (OBJ-5). ⛔ **IDENTITY IS THE TITLE RESOLVING TO EXACTLY ONE TABLE. FULL STOP.** If it resolves to 0 or >1 tables the run mints `GOVERNING-TABLE-IN-DOUBT` and STOPS, and never falls back to another table.
⛔⛔ **A VALUE DIVERGENCE IS NOT AN IDENTITY FAILURE — IT IS THE FINDING, AND r5's DOC HAD IT BACKWARDS (Langston r5 BLOCKER-1).** The shipped code is the correct party: `:278-280` identity → `2`, `:282-284` rung count → `2`, `:292-293` **value divergence → `3` DRIFT**. r5's scope welded *"or no longer matches at 17/17"* into the stop rule, and **anyone implementing that sentence would make every genuine venue revision — the 2026-07-09 event this batch exists for — mint IN-DOUBT and STOP instead of reporting drift. The watcher would go silent on its own success case.** The clause is struck; harness case 1 already asserts `3` for exactly that mutation.
⭐ **THREE OUTCOMES, THREE EXIT STATUSES (Langston FINDING-B — r4's code took neither branch): `0` no-change · `2` MEASUREMENT FAILED · `3` measured drift.** OBJ-5 reads the outcome off the status, so drift and no-change may never share one.
⛔⛔ **THE CONTROL NOW RUNS *FIRST*, BEFORE ANY REPORTING, AGAINST A CONSTANT THAT IS NOT `REFERENCE_LADDER[1]` (Langston r6 BLOCKER-1 — the sixth instance of `control-that-cannot-fail`, on the flagship control, written by the hand that named the pattern).** r6's `CONTROL FAILED` branch was **unreachable**: getting to it required passing `if bad: return 3`, and an empty `bad` already proved rung 1 matched — so `ok` could never be empty, and it ran *after* every print, making §2.1's claim false twice over. **Langston moved Tier 1 in all four ladders and got exit `3` with `DRIFT ... at [1]`: a TOTAL EXTRACTION FAILURE reported as a venue finding.** ✅ **Now: exit `2`, the words `CONTROL FAILED`, and no drift text at all — asserted by harness CASE 4.**
**Verify — EXERCISED, NOT ASSERTED (`#744` rider), by `scripts/analysis/kraken_fee_ladder_mutation_test.py`:** baseline → `0`; a tiered rung moved in the pinned ladder → `3`; the xStock band moved → `3`; a column naming a leg but neither spot nor futures → `2`. **All four cases PASS.**
⛔ **THE HARNESS ABORTS IF A MUTATION CHANGED NO CELL, AND THAT GUARD IS ITSELF PROVEN:** a deliberate no-op (writing the incumbent value back) prints the NO-OP line and exits **`4`** — a status distinct from the subject's `2`, so "the harness broke" never reads as "the extractor refused". **`mutate()` now compares old to new rather than counting an assignment** (Langston r5 condition 1: it could not fail in the way it claimed).
⚠️ **COVERAGE IS 1 OF OBJ-5's 7 FAIL-LOUD INPUTS, AND THE `#744` RIDER IS THEREFORE NOT YET DISCHARGED** (Langston r5 condition 2). **The branch that matters most is DUPLICATE RUNG KEY / DUPLICATE BAND LABEL** — the scope itself says the `≠ 17` check is structurally blind to that class, so this harness is its **sole** detector, and an undetected detector defect is silent forever. Title-resolves-to-0 and to->1 are two more cases in the same frame.

### OBJ-3 — THE PAGE-VERSUS-TRANSCRIPTION LEG
Compare the pinned ladder against §1's seventeen rungs.
**Verify:** reports no drift today (17/17); one edited rung in a scratch copy is named with both values.

### OBJ-4 — xSTOCK IS A **SECOND PINNED TABLE**, READ ON EVERY RUN
✅ **A MACHINE SOURCE EXISTS AND WE ALREADY FETCH IT** (Langston r4 BLOCKER, re-derived): accordion **`Pro xStocks`**, same payload, `$0 + → maker `-0.02%` / taker `0.10%``. ⛔ **The r1-r4 premise that no machine source existed was FALSE, and the 90-day human obligation it justified is STRUCK** — folded here, not re-homed (§13 disposition 1).
- **PIN `Pro xStocks`**, compare its `$0 +` band against `fee_model` `xstock_spot`, and mint `GOVERNING-TABLE-IN-DOUBT` if the title resolves to 0 or >1 tables.
- ⚠️ **What STILL has no machine source is the account's TIER** — the in-app dialog is authenticated and no session may log in (`CLAUDE.md` §7). **That is a narrower obligation than the one r4 wrote, and it applies to BOTH classes, not just xStock.**
- **90 days, first due 2026-12-11 — ON THE ACCOUNT TIER.** Monthly is a nag that gets ignored, and a tier moves only when 30-day volume or Assets on Platform crosses a rung. ⛔ **This cadence is NOT about the xStock rates** — those are read on every run (above); r5's bullet reasoned about the rate schedule and was a remnant of the struck premise.
- ⭐ **EVENT TRIGGER: any published-vs-database disagreement, on EITHER class, makes the TIER check due IMMEDIATELY** — a rate we did not expect is the strongest available evidence that our assumed rung has moved, and a venue that revised one schedule likely revised both (the 2026-07-09 case). ⛔ **r5 worded this as an xStock "re-capture", which was the struck obligation surviving inside the trigger.**
- **Resolves only against a capture date.**
**Verify:** ⛔ **the 90-day item names the ACCOUNT TIER, never the xStock rates** — r5's acceptance criterion still read *"naming the held values (`0.0010` / `-0.0002`)"*, which **re-imports the struck obligation through the back door** (Langston r5 BLOCKER-3). It fires at its due date naming **the tier we believe we are on and the qualifying measures that would move it**, and resolves only against a dated capture of the authenticated dialog. **The rates are read by the machine on every run and are not part of this item.**

### OBJ-5 — THREE OUTCOMES, NEVER TWO, AND FAIL LOUD ON SEVEN INPUTS
**measured · no-change · `MEASUREMENT FAILED`**, the third naming the operand, read off **exit status, never an HTTP code**.
⛔ **Fail loud, never coerce — SEVEN inputs:** unparseable cell · **pinned title resolving to 0 or >1 table** · **rung count ≠ 17** · **a column name that does not resolve** (strict: a column naming a leg but neither spot nor futures RAISES — the default-to-spot arm is deleted, so this can actually fire) · **a row label outside `Tier 1-12`/`Pro 1-5`** (`ROW_RE` is bounded; it no longer accepts `Tier 99`) · ⭐ **a DUPLICATE RUNG KEY or a duplicate BAND label** (a repeated label, or `Tier 13` colliding with `Pro 1`→13 — **neither moves the rung count, so the ≠ 17 check is structurally blind to it**) · an unseen normaliser form.
⛔ **AN UNPARSEABLE RATE NOW *RAISES*; IT IS NEVER SKIPPED (Langston r6 BLOCKER-2).** r6 silently dropped a `None` rate. The tiered side survived on the `≠ 17` count — **but the banded side has NO count invariant**, so a dropped `$0 +` left `base = None`, which compared unequal to the contract and returned **`3`: a parse failure reported as measured venue drift.** Exercised with a U+2212 minus → exit `2`.
**Verify:** each outcome produced deliberately, artifact attached, **including every failure branch** (`#744` rider).
⚠️ **COVERAGE, COUNTED HONESTLY — 3 OF THE 7 FAIL-LOUD INPUTS ARE EXERCISED, NOT ALL 7.** Exercised: **unparseable cell** (CASE 5) · **pinned title resolving to >1 table** (CASE 6) · **a column name that does not resolve** (CASE 3). ⛔ **STILL UNEXERCISED: duplicate rung key / duplicate band label** (the class the `≠ 17` check is structurally blind to, so this harness is its *sole* detector) · **title resolving to 0** · **a row label outside `Tier 1-12`/`Pro 1-5`** · **an unseen normaliser form**. **The `#744` rider is NOT discharged, and "all cases pass" does not discharge it.**

### OBJ-6 — MACHINE ACTOR + INSTALL-ORDER NEGATIVE CONTROL
Add `kraken-fee-watch` (tag `machine`) to `ALERT_ACTORS`. ⛔ **The actor must be in the DEPLOYED source before the cron exists.**
**Verify:** a `--by kraken-fee-watch` resolve attempted **before** the deploy showing the **refusal**, and the same call **after** showing acceptance.

### OBJ-7 — ONE LIVE COPY, INSTALLED AS THE ESTATE ALREADY INSTALLS
Repo home `comms-infra/discord/`, installed by `comms-infra/discord/deploy.sh` — the path that installs `dt-deploy-drift.sh`.
**Verify:** `/usr/local/bin/` holds the only invoked artifact; the repo copy has zero invokers, measured with a control.

### OBJ-8 — THE CENSUS ASSERTION (replaces the dropped content hash)
A structural guard firing only on change to what we read: **ladder count · rungs per ladder · column-name resolution · the pinned title's presence.**
⭐ **PLUS FINDING-1 (Langston, r3) — ASSERT THE MATCH VECTOR FOR ALL FOUR LADDERS, NOT ONLY THE PINNED ONE.** The extractor already computes it; r3 threw it away. **With three tables indistinguishable by header and two indistinguishable by value, A WRONG PIN IS SILENT FOREVER unless the others are asserted too.** Today's vector, measured: `{Cross-platform Fee Tiers 17/17 Δ{0.00} · Spot Crypto 17/17 Δ{0.00} · Spot Maker Rebate 0/17 Δ{−0.02} · Futures 17/17 Δ{0.00}}`. **Any change to that vector is a finding, pinned or not.** Near-zero cost.
✅ **AND IT IS NOW ACTUALLY ASSERTED, WHICH r6 ONLY CLAIMED (Langston r6 finding 2).** r6 printed the vector and compared nothing — **under a heading that literally read `(asserted for ALL ladders)`.** The artifact claimed the control it did not have, which is the same shape as the self-check that matched body text instead of its own heading. **A changed ladder CENSUS now exits `2`; a changed PROFILE exits `3`.**
⚠️ **ONE DELIBERATE EXCLUSION, AND IT IS A REGRESSION I INTRODUCED AND THE HARNESS CAUGHT:** the assertion first ran ahead of the pinned ladder's rung-level check and **preempted it** — status stayed `3`, so a status-only test would have passed, while the output stopped naming the altered rung and OBJ-1's *"the altered rung and only that rung"* was silently lost. **It was the stdout assertion Langston's finding 1 demanded that caught it.** The pinned ladder is now excluded from the coarse profile check because its rung-level check below is strictly more precise.
⚠️ **CENSUS CAVEAT (Langston r4): "9 tables" is the census of `paragraphArticleBodyTable` NODES ONLY.** `Stocks`, `xStocks`, `Perps` and `Pro Stocks` carry none of that type, so the count asserts **one node type, not the page's rate surfaces.** The extractor prints this caveat on every run.
**Verify:** today it asserts 4 tiered ladders + 4 banded schedules / 17 rungs each / both column names resolving; a saved body with a renamed column or heading fails it.

### OBJ-9 — GOVERNANCE
SIM entry mirroring the `dt-deploy-drift.sh` table **and stating the cadence**. **Name the `#647` collision risk; do not fix it here.**
⚠️ **r6's "writer #12" claim is STRUCK — I never derived that count and will not republish it** (rule 29: a number with no stated object and population is a claim, not a finding).

⭐⭐ **CADENCE: DAILY, NOT HOURLY — AND THE REASON IS THE CONDITION ABOVE, NOT JUST COST (Langston r6 raised it; my call, his conclusion).** His argument stands on its own: a schedule that moves perhaps twice a year does not need **8,760 fetches of a 1.4 MB page**, and **hourly is the sole reason OBJ-9 must name the `#647` collision at all.** ⭐ **§1.a adds the decisive half: the thing that actually moved in July — tier determination — is not made more visible by polling the rate tables more often.** Hourly would buy resolution on the axis that did not move. ⚠️ **And `#647` is not hypothetical here: the alert queue has no claim mechanism, and `B-ALERT-QUEUE-INTEGRITY` (plan row 2.4b) — the batch that fixes it — is the NEXT one in my own queue. This watcher would be built on it beforehand.**

⛔⛔ **DISTINCT DEDUPE KEYS PER OUTCOME CLASS — ONE SHARED KEY SILENTLY SWALLOWS A REAL DRIFT (Langston r6 finding 3, re-derived at the line).** `addAlert` suppresses a new alert when any alert with the same `dedupe_key` has **`state !== 'resolved'`** (`server/services/system-alerts.ts`, the dedup branch). ⭐ **`acknowledged` is NOT terminal — so an ACKED row suppresses too**, and by `#982` our standing practice is **ack = owned, row left active**. ⇒ **an unresolved `MEASUREMENT FAILED` would suppress a later genuine `DRIFT` on the same key, indefinitely, and nothing would say so.** That undoes FINDING-B's whole point one layer up: three outcomes get three exit statuses in the extractor, then the alert layer collapses them again. **OBJ-9 names one key per outcome class — drift, measurement-failed, and the tier item are three keys, never one.**
⛔ **`SYSTEM_MANUAL` §5 gets one real paragraph** (Langston r2 ruling 1): the cost model now has a **source-of-truth verification contract** — **the DATABASE is authoritative for CHARGING, the PAGE is authoritative for DRIFT-DETECTION only.**

### OBJ-11 — ⭐ WATCH THE RULE THAT DECIDES WHICH ROW APPLIES TO US (§1.a, disposition 1)
**The 2026-07-09 event changed TIER DETERMINATION, and nothing in OBJ-1..9 reads it.** Watch `support.kraken.com/articles/cross-platform-fee-tier-changes` on the same run and the same cadence: it carries the qualifying measures (spot volume · futures volume · Assets on Platform), the inclusion/exclusion lists, and Kraken's own stated last-updated date.
- **Same parser, same payload shape** — `window.__INITIAL_PROPS__`, `field_heading` / `field_body` under the article node. **Measured working before this objective was written; it is not a hope.**
- **Assert the qualifying-measure SET and the exclusion list**, not prose equality — the article is marketing copy and will be reworded without changing meaning. ⛔ **A wording change must not mint a finding; a MEASURE appearing or disappearing must.**
- ⚠️ **This does NOT tell us our tier** — that stays behind the login and stays OBJ-4's human item. **It tells us when the RULES for earning one move**, which is what happened in July and what we had no way to see.
**Verify:** a fixture removing `Assets on Platform` from the measure set fails it; a fixture that only reworks the surrounding prose does not. **Both directions, because an assertion that fires on rewording would be turned off within a month.**

### OBJ-10 — ESTABLISH WHETHER ANY PAIR WE TRADE IS ON THE SPOT-MAKER-REBATE ELIGIBLE LIST
⛔ **FIVE schedules `fee_model` cannot express, not one (Langston FINDING-C) — and FOUR ARE ALREADY IN THE PAYLOAD.** Only the Spot Maker Rebate's eligible-pair list needs the second fetch I was worried about.
⛔⛔ **AND THE EXPOSURE RUNS THE OTHER WAY, WHICH IS WORSE FOR US THAN THE REBATE:** the `Stablecoin, Pegged Token & FX Pair` schedule reads **`0.20 / 0.20`** where we model **`0.80`** taker — **4× PESSIMISTIC, which SUPPRESSES trades through the Net Expectancy gate** (hold against `#570`).
⭐ **STRATIFIED, because the heuristic OVER-INCLUDES and its error is not symmetric noise (Langston r5 condition 4):**
| stratum | rows | symbols | may carry a number? |
|---|---|---|---|
| **A — BOTH legs stable/fiat** (`EUR/USD`, `USDC/GBP`, `USDT/AUD`, `AUD/USD`, `EUR/CHF`, `GBP/USD`, `USD/CAD`, `USD/CHF`, `USDC/AUD`, `USDC/CAD`, `USDC/CHF`, `USDT/GBP`) | **34** of 481 | **12** of 119 | ✅ **YES — this stratum alone falsifies "empty", and it is the honest claim** |
| B — exactly ONE stable/fiat leg (`SOL/USDC`, `XRP/USDT`, `ETH/EUR`…) | 447 | 107 | ⛔ **NO** — name-shaped only; a crypto leg makes eligibility a venue question |
- **CONTROL, and it corrected my own suspicion:** "neither leg stable/fiat" returns **0**, and that zero is **REAL, not an instrument fault** — the quote-leg census is exhaustive (`USD` 345 · `EUR` 54 · `USDT` 20 · `GBP` 20 · `USDC` 20 · `CHF` 9 · `AUD` 8 · `CAD` 5 = 481, every one fiat or stable) while **76 of 82 distinct BASE legs are non-fiat**, so the instrument does discriminate. We simply never quote against a crypto leg.
⚠️ **NEITHER STRATUM IS THE VENUE'S ELIGIBILITY LIST.** Stratum A falsifies "empty"; it does **not** size the true intersection.
- **Read the eligible-pair list** from the page the `Spot Maker Rebate` body links to (not yet fetched by this batch), and intersect it with our traded universe.
- **Report the intersection, INCLUDING WHEN IT IS EMPTY** — an empty intersection is a measured zero with a named population, not a silence (`#453`).
- ⛔ **Do NOT add a per-pair rate to `fee_model` in this batch.** If the intersection is non-empty, that is a **scope decision for Kyle** and a separate batch — the bug taxonomy's outcome (2), working-as-designed-but-unaddressed.
**Verify:** the list is fetched with its own control (a known-present pair resolves), the intersection is printed with both denominators, and the finding is homed in `RUNNING_ISSUES` whichever way it comes out.
⛔⛔ **OBJ-10 IS EXPLICITLY NON-GATING ON CLOSE (Langston r5 ruling — ONE BATCH, NOT TWO).** It is a **different object**: a second page, an eligibility list, and an intersection feeding a Kyle scope decision, with **no code deliverable in this batch**. ⚠️ **NAMED NOW RATHER THAN DISCOVERED AT STEP 7: if that page does not parse, or is not reachable unauthenticated, that is a HOMED FOLLOW-ON — not a hold on OBJ-1..9.**

---

## 4. ARCHITECTURAL READ (1.a)

- **SIM §`dt-deploy-drift.sh`** — host, cadence, operands, dedupe keys, three-outcome failure mode, machine actor, one-live-copy rule, controls. It is the eleventh writer to the alert store and the second outside the app process; **this batch is the twelfth, through the same supported CLI — a frequency increase on an existing lock-free append, not a new writer class.**
- **SIM §`fee_model`** — the single merge site and the per-class rows this batch **READS and never writes.** ⛔ **This batch writes no fee value, ever.**
- **`SYSTEM_MANUAL` §5** — the cost model, carrying the landed `#1010` contract and the signed maker rail.
- **`ALERT_ACTORS`** (`system-alerts.ts:205-220`) — 10 actors; `machine` members are `governance-checker`, `governance-checker-heartbeat`, `b-new-40-soak-verify`, `deploy-drift-monitor`, `langston-privacy-check`.

## 5. PROVENANCE READ (1.b)

**TIER 1 — the transcription this batch compares against.** Introduced at `8ecc671565f262a849f4f19406f600cf318fe70e` (2026-09-06), verbatim:

> *"Kyle captured Kraken's public fee pages and asked for them to be stored, shared and monitored. All three, plus the finding that fell out of reading them."*
> *"The transcription exists because the captures are IMAGES: pdftotext returns zero lines from all three, so no future check can parse them."*

⭐ **DISPOSITION (2) — relevant, needs updating.** That sentence is true of the **PDFs** and was carried forward as though true of the **source**. The live page parses (§2.1). §5 of the reference ("nothing currently watches it") is rewritten by this batch.

**TIER 2:** `system-alerts.ts` (store + actor gate, `#987` — read and extended) · `dt-deploy-drift.sh` (shape copied; read only) · `comms-infra/discord/deploy.sh` (installer; extended by one artifact).

**Corpora searched:** `RUNNING_ISSUES` (`#1011`, `#1010`, `#133`/`#134`, `#744`, `#1002`, `#1016`, `#647`), `BATCH_CATALOG`, both drift completion reports, SIM, System Manual, `git log --reverse` on the reference. **`bridge/canonical/` not applicable** — every component postdates the 2026-01/02 governance change.

## 6. ALREADY EXISTS / ALREADY DECIDED

- **Nothing fetches any Kraken page today** — census at the ref across `scripts/`, `server/`, `comms-infra/`. **Control: the same census finds external URLs elsewhere in `comms-infra/`.**
- The alert store, CLI, dedupe keys and actor gate exist; this batch adds one actor.
- ⛔ **Tier RESOLUTION is OUT** — `B-FEE-TIER-RESOLUTION`, Phase 21.

## 7. NOT IN THIS BATCH

- Changing any fee value automatically. **The watcher reports; a human decides.**
- ⛔ **~~Establishing what ladder 3 is~~ — STRUCK. It is the page's own `Spot Maker Rebate` table and the name was published all along (§2.2a).** What IS out of scope is *fixing* it: **OBJ-10 measures whether it reaches us; adding a per-pair maker rate to `fee_model` is a separate scope decision for Kyle.**
- The AoP lever, and the `$2,501` first-rung cliff.
⛔ **CONDITION (Langston r2 ruling 5): the alert body must state it compares RUNG 1 ONLY and that we have no tier tracking** — so a disagreement means *either* the venue changed the schedule *or* we crossed a rung (`#546`, absent-as-valid).

## 8. GOVERNANCE SET (architecture class)

Completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1011` closed) · `PHASE_19_PLAN` row 2.4-FEE-b · `SYSTEM_IMPACT_MAP` · **`SYSTEM_MANUAL` §5 (one real paragraph — NOT N/A)** · `KRAKEN_FEE_SCHEDULE_REFERENCE.md` §5 · shared `MEMORY.md` + `MEMORY_CC_B.md` · `CLAUDE_NEW_PHASE_19_TASK_LIST.md` · Langston's `MEMORY.md`.

## 9. HONEST RESIDUALS

- ✅ **~~The extractor does not capture the enclosing heading~~ — CLOSED.** It threads an ancestor trail and reads `paragraphAccordionItem.field_title`; **that fix is what falsified three of r3's stated facts**, so the residual was load-bearing and is now this batch's best evidence that a named anchor beats a positional one.
- ⚠️ **`REFERENCE_LADDER` in the extractor is a SECOND COPY of reference §1** (Langston, r3 defect (c)). Verified equal on all 17 rungs today, **but OBJ-3 then grades the page against the copy — a corrected §1 with a stale dict would report no drift.** Parsing §1 directly is the standing fix; until then OBJ-3's verify carries a fixture that edits §1 and must fail.
- ⚠️ **My fetch measured 1,394,111-1,394,145 bytes across runs; Langston's measured 1,398,949** — same four ladders, same values. **The page is stable within a session and NOT across hours**, which is the stronger reason the content hash was dropped.
- ✅ **~~What ladder 3 describes is unestablished~~ — STRUCK (Langston r5 BLOCKER-2).** §2.2a establishes it from the page's own body text: it is the **Spot Maker Rebate**, a per-pair incentive. Over-reporting remains the safe direction — the watcher names every ladder it finds — but the question is answered, not open.
- ⛔ **THE OPERAND IS A PK TRIPLE AND THE UNITS DIFFER BY A FACTOR OF 100 — PREVIOUSLY UNSTATED (Langston r6 finding 4).** There is no constant named `fee_model`: the row is `(module_name='fee_model', asset_class='xstock_spot', constant_name ∈ {spot_maker_fee, spot_taker_fee})`, and **the database stores FRACTIONS (`-0.0002` / `0.0010`) while the page prints PERCENT (`-0.02%` / `0.10%`).** ⛔ **An absent or unconvertible row must exit `2`, never `3`** — a missing operand is a measurement failure, not venue drift.
- ✅ **`--pin` is now FIXTURE-ONLY (Langston r6 finding 5).** It was a runtime flag on the one value three revisions established must never be runtime-selected; it is refused without `--file`.
- ⚠️ **MY OWN FINDING 7, FOUND BY RUNNING IT: the script had an UNDECLARED FOURTH EXIT PATH.** A `cp1252` console raised `UnicodeEncodeError` mid-report and killed the run with a traceback — **exit 1, which is none of the three declared statuses — and it happened AFTER the control had already passed.** A watcher must never die on a `print`. Fixed by forcing the stream to UTF-8 rather than hunting glyphs, because a glyph sweep misses the next character added. **Same failure and same cure as the wake filter, which `cp1252` silently killed in June 2026.**
- ⚠️ **The account view is a 2026-09-06 capture, not a live read.** Seventeen rungs does not make it live; it uses all of what was captured. If the account's tier moves, the governing-table determination must be re-made — which is what OBJ-4's event trigger and ruling 5's alert wording exist to surface.

## 10. PLAIN-LANGUAGE SUMMARY

Kraken changed its fees in July and we did not notice until September, because nothing compares what the venue publishes against what we actually charge. This builds that comparison and runs it on a schedule — **once a day.**

⭐ **The most useful thing this round turned up is that we had only half the story about July, and it is the half that matters.** Kraken did two things that day. It nudged some published rates — which is what this check was being built to catch. But the change it led with was to **how your discount level is decided**: it used to be judged on each product separately, and now it is the best of three things — how much you trade on the spot market, how much you trade futures, or simply **how much money you keep on the platform.** **Every part of the check I had designed reads the price list. Nothing read the rule that decides which row of the price list is ours.** So if this had been running the day before that change, it would have caught the small half and been blind to the big one. I have added a step that watches those rules too — it is the same page, read the same way, so it costs almost nothing.

⚠️ **One consequence worth knowing, because it cuts against us:** the trades we make in currency-like pairs — dollar-for-stablecoin and similar — **do not count toward earning a better discount level at all.** They are also charged off a different price list than the one we model. Neither of those was written down anywhere before today.

The complication is that Kraken's page does not publish one fee table — it publishes four, and they do not agree. Three match Kyle's signed-in account exactly across all seventeen tiers. The fourth is Kraken's **spot maker rebate**: a discount on a hand-picked list of thinly-traded pairs, which pays two hundredths of a percent better than the standard rate. So the check cannot just "read the table" — it has to be told which table is ours, confirm that table still matches the account on every tier, and stop and say so if it ever does not.

**One thing worth your attention, because it may be costing us now rather than later.** Our system stores one maker fee for all crypto. Kraken's rebate applies per pair. If any pair we actually trade is on that eligible list, the venue is charging us less than we think — our numbers would be pessimistic rather than dangerous, but they would be wrong. **Whether that is happening is not yet measured**: the eligible list sits on a page we have not read. This scope adds a step to go and find out, and deliberately does not change any fee until you have seen the answer.

**The tokenized stocks are NOT manual — and this paragraph said they were until now.** Their rates are published in the same page data we already read: maker −0.02%, taker 0.10%, exactly what we charge since yesterday's fix. The check reads them on every run like everything else.

What still needs a human is narrower and applies to **both** crypto and tokenized stocks: **which fee tier the account sits on.** That is only visible behind a login, which no session may use, so once a quarter it asks you to glance at it — and immediately if the published rates ever disagree with what we charge.

⚠️ **Recorded because it was nearly the opposite:** four revisions of this scope stated that no machine could read the tokenized-stock rates, and proposed a standing ninety-day task for you on that basis. The table was in the data the whole time; the search string was one dollar off. Langston caught it.
