# B-KRAKEN-FEE-WATCH — SCOPE

**Batch:** `B-KRAKEN-FEE-WATCH` · **Issue:** `#1011` · **Plan row:** `PHASE_19_PLAN` 2.4-FEE-b · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** **r4** — Langston's r3 BLOCKERS 1-3 re-derived at the object and folded, his FINDING-1 and four code defects fixed, the pin moved to `Spot Crypto` WITH A REASON (2026-09-12) · **Card:** `PVTI_lAHODmulEM4BfQP4zg6mZFg`

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
| 9 | r3 OBJ-1: pin `Cross-platform Fee Tiers` | **PIN `Spot Crypto`, WITH A STATED REASON** — it is the product the ladder governs for us; the cross-platform table is the umbrella explaining how tiers combine, and is the likelier one to lag a spot-only revision | Langston BLOCKER-3: either is defensible, **an unreasoned pin is not** |

---

## 1. THE DEFECT

**Kraken revised its fee schedule on 2026-07-09. We found out on 2026-09-06, because Kyle looked at the page.** For 59 days the system priced against a model nothing compared to its source. That gap produced `#1010`.

⛔ **THREE OBJECTS, NOT TWO** — the live **PAGES**, our **TRANSCRIPTION**, and the **DATABASE**. A page-only diff catches the next venue change and is blind to drift we already have. **The page-versus-database leg is the one that earns its keep.**

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

### 2.3 Which ladder governs our account

**`KRAKEN_FEE_SCHEDULE_REFERENCE.md` §1 is seventeen rungs transcribed from Kyle's AUTHENTICATED in-app Fees dialog** (`pro.kraken.com/app/trade/sui-usd#dialog/fee-level`, 2026-09-06), and §0.b records that **every figure in §1 was cross-checked against those dialogs**. The three rungs quoted in §0.b's prose are spot-checks it chose to print, **not the extent of the capture** — my r2 reading of that as the population was wrong, and Langston corrected it at the object.

⇒ **The account ladder matches `Cross-platform Fee Tiers`, `Spot Crypto` and `Futures` at all seventeen rungs, and `Spot Maker Rebate` at none.** The database (`0.004 / 0.008`) is correct for this account **as an account-wide rate** — see §2.2a for the per-pair exception that is not yet bounded.

⭐ **WHY THE PIN IS `Spot Crypto` AND NOT THE OTHER MATCHING TABLE (Langston's reasoning, adopted):** it is **the product the ladder governs for us**. `Cross-platform Fee Tiers` is the umbrella table explaining how tiers combine across products, and is **the likelier of the two to lag a spot-only revision**. Either is defensible on today's values — both read 17/17 — **but an unreasoned pin is not**, and a pin chosen by "it matched" is the runtime best-fit the stop-don't-reselect rule exists to forbid.
⚠️ **Both routes rest on one CC-B read of screenshots that are deliberately uncommitted** (`RUNNING_ISSUES:7796` — they show live balances). **The transcription dependency is unavoidable and was already fully incurred; seventeen rungs costs nothing more than three.**

### 2.4 The other measurements, unchanged from r2

| # | question | measured | control |
|---|---|---|---|
| **M1** | page fetchable from Helsinki? | HTTP 200, ~1.39 MB | `api.kraken.com/0/public/Time` 200/87 B |
| **M5** | xStock ladder on the public page? | ⛔ **NO** — `$100,000,001` → 0 hits; 1 xStock mention near any rate cell, belonging to another table | the same proximity test finds **8** `Tier 1` mentions near rate cells |
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
⛔ **IDENTITY AND VALUES ARE TWO DIFFERENT CHECKS, AND SAYING SO IS THE POINT (Langston, r3):** the 17-rung match is **NECESSARY BUT NOT SUFFICIENT** for the pin — **three ladders satisfy it**. **IDENTITY is verified by the pinned title resolving to EXACTLY ONE table** (OBJ-5). ⛔ **If the title resolves to 0 or >1 tables, or the pinned ladder no longer matches at 17/17, the run mints `GOVERNING-TABLE-IN-DOUBT` and STOPS — it never falls back to another table.** Otherwise a later reader takes "pin verified" to mean "we are on the right table".
**Verify:** names its heading; a scratch fixture with a wrong DB value reports disagreement naming both sides; a fixture with the pinned heading renamed mints `GOVERNING-TABLE-IN-DOUBT` and selects nothing.

### OBJ-3 — THE PAGE-VERSUS-TRANSCRIPTION LEG
Compare the pinned ladder against §1's seventeen rungs.
**Verify:** reports no drift today (17/17); one edited rung in a scratch copy is named with both values.

### OBJ-4 — xSTOCK: A DATED RE-CAPTURE OBLIGATION, **90 days + an event trigger**
⛔ **Measured (M5, M6, M7): no machine source exists for the xStock rates**, and no session may log in (`CLAUDE.md` §7).
- **90 days, first due 2026-12-11.** Monthly is a nag that gets ignored; the contract landed 09-11 and a tokenised-equity schedule does not move monthly.
- ⭐ **EVENT TRIGGER: any crypto-leg disagreement makes the xStock re-capture due IMMEDIATELY** — a venue that revised one schedule likely revised both, which is the 2026-07-09 case.
- **Resolves only against a capture date.**
**Verify:** fires at its due date naming the held values (`0.0010` / `-0.0002`); a forced crypto disagreement brings it due at once.

### OBJ-5 — THREE OUTCOMES, NEVER TWO, AND FAIL LOUD ON SIX INPUTS
**measured · no-change · `MEASUREMENT FAILED`**, the third naming the operand, read off **exit status, never an HTTP code**.
⛔ **Fail loud, never coerce — SEVEN inputs:** unparseable cell · **pinned title resolving to 0 or >1 table** · **rung count ≠ 17** · **a column name that does not resolve** (strict: a column naming a leg but neither spot nor futures RAISES — the default-to-spot arm is deleted, so this can actually fire) · **a row label outside `Tier 1-12`/`Pro 1-5`** (`ROW_RE` is bounded; it no longer accepts `Tier 99`) · ⭐ **a DUPLICATE RUNG KEY** (a repeated label, or `Tier 13` colliding with `Pro 1`→13 — **neither moves the rung count, so the ≠ 17 check is structurally blind to it**) · an unseen normaliser form.
**Verify:** each outcome produced deliberately, artifact attached, **including every failure branch** (`#744` rider).

### OBJ-6 — MACHINE ACTOR + INSTALL-ORDER NEGATIVE CONTROL
Add `kraken-fee-watch` (tag `machine`) to `ALERT_ACTORS`. ⛔ **The actor must be in the DEPLOYED source before the cron exists.**
**Verify:** a `--by kraken-fee-watch` resolve attempted **before** the deploy showing the **refusal**, and the same call **after** showing acceptance.

### OBJ-7 — ONE LIVE COPY, INSTALLED AS THE ESTATE ALREADY INSTALLS
Repo home `comms-infra/discord/`, installed by `comms-infra/discord/deploy.sh` — the path that installs `dt-deploy-drift.sh`.
**Verify:** `/usr/local/bin/` holds the only invoked artifact; the repo copy has zero invokers, measured with a control.

### OBJ-8 — THE CENSUS ASSERTION (replaces the dropped content hash)
A structural guard firing only on change to what we read: **ladder count · rungs per ladder · column-name resolution · the pinned title's presence.**
⭐ **PLUS FINDING-1 (Langston, r3) — ASSERT THE MATCH VECTOR FOR ALL FOUR LADDERS, NOT ONLY THE PINNED ONE.** The extractor already computes it; r3 threw it away. **With three tables indistinguishable by header and two indistinguishable by value, A WRONG PIN IS SILENT FOREVER unless the others are asserted too.** Today's vector, measured: `{Cross-platform Fee Tiers 17/17 Δ{0.00} · Spot Crypto 17/17 Δ{0.00} · Spot Maker Rebate 0/17 Δ{−0.02} · Futures 17/17 Δ{0.00}}`. **Any change to that vector is a finding, pinned or not.** Near-zero cost.
**Verify:** today it asserts 4 ladders / 17 rungs each / both column names resolving; a saved body with a renamed column or heading fails it.

### OBJ-9 — GOVERNANCE
SIM entry mirroring the `dt-deploy-drift.sh` table **and stating the cadence** — hourly makes this **writer #12** to `system-alerts.jsonl` alongside the hourly drift monitor. **Name the `#647` collision risk; do not fix it here.**
⛔ **`SYSTEM_MANUAL` §5 gets one real paragraph** (Langston r2 ruling 1): the cost model now has a **source-of-truth verification contract** — **the DATABASE is authoritative for CHARGING, the PAGE is authoritative for DRIFT-DETECTION only.**

### OBJ-10 — ESTABLISH WHETHER ANY PAIR WE TRADE IS ON THE SPOT-MAKER-REBATE ELIGIBLE LIST
⛔ **This is the only leg that could be costing money today, and it is UNMEASURED (§2.2a).** `fee_model` holds one maker rate per asset class; the venue runs a **per-pair** maker incentive at `0.38 %` on selected lower-liquidity spot pairs. **If any pair in our universe is on that list, we model `0.40 %` and are charged `0.38 %`.**
- **Read the eligible-pair list** from the page the `Spot Maker Rebate` body links to (not yet fetched by this batch), and intersect it with our traded universe.
- **Report the intersection, INCLUDING WHEN IT IS EMPTY** — an empty intersection is a measured zero with a named population, not a silence (`#453`).
- ⛔ **Do NOT add a per-pair rate to `fee_model` in this batch.** If the intersection is non-empty, that is a **scope decision for Kyle** and a separate batch — the bug taxonomy's outcome (2), working-as-designed-but-unaddressed.
**Verify:** the list is fetched with its own control (a known-present pair resolves), the intersection is printed with both denominators, and the finding is homed in `RUNNING_ISSUES` whichever way it comes out.

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
- ⚠️ **What ladder 3 describes is unestablished.** Over-reporting is the safe direction: the watcher names every ladder it finds.
- ⚠️ **The account view is a 2026-09-06 capture, not a live read.** Seventeen rungs does not make it live; it uses all of what was captured. If the account's tier moves, the governing-table determination must be re-made — which is what OBJ-4's event trigger and ruling 5's alert wording exist to surface.

## 10. PLAIN-LANGUAGE SUMMARY

Kraken changed its fees in July and we did not notice until September, because nothing compares what the venue publishes against what we actually charge. This builds that comparison and runs it on a schedule.

The complication is that Kraken's page does not publish one fee table — it publishes four, and they do not agree. Three match Kyle's signed-in account exactly across all seventeen tiers. The fourth is Kraken's **spot maker rebate**: a discount on a hand-picked list of thinly-traded pairs, which pays two hundredths of a percent better than the standard rate. So the check cannot just "read the table" — it has to be told which table is ours, confirm that table still matches the account on every tier, and stop and say so if it ever does not.

**One thing worth your attention, because it may be costing us now rather than later.** Our system stores one maker fee for all crypto. Kraken's rebate applies per pair. If any pair we actually trade is on that eligible list, the venue is charging us less than we think — our numbers would be pessimistic rather than dangerous, but they would be wrong. **Whether that is happening is not yet measured**: the eligible list sits on a page we have not read. This scope adds a step to go and find out, and deliberately does not change any fee until you have seen the answer.

The tokenized stocks stay manual, because their table is not published anywhere public and the only place it appears requires logging in, which no session may do. That becomes a reminder every ninety days — and immediately, if the crypto side ever disagrees.
