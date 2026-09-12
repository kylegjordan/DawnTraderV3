# B-KRAKEN-FEE-WATCH — SCOPE

**Batch:** `B-KRAKEN-FEE-WATCH` · **Issue:** `#1011` · **Plan row:** `PHASE_19_PLAN` 2.4-FEE-b · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** **r3** — Langston's three r2 edits folded, and every ladder figure re-derived by a structured parser under a control that can fail (2026-09-12) · **Card:** `PVTI_lAHODmulEM4BfQP4zg6mZFg`

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | r1 M4: **one** spot table, rung 1 `0.40/0.80` | **FOUR ladders carry a spot maker/taker column pair, and one disagrees** | Langston BLOCKER-1, re-derived by me |
| 2 | r2 §2.2: *"three independent rungs cross-checked"* — tables 1-2 match the account at rungs 1, 12, 17 | ⛔ **STRUCK. The evidence is 17/17**, and §0.b's three rungs were the paragraph's quoted spot-checks, not the extent of what was captured — §1's seventeen rungs carry the same authenticated provenance | **Langston, r2 ruling: "ALL SEVENTEEN"**. I had read the prose as the population |
| 3 | r2: the governing table is determined by matching | ⛔ **The governing heading is a PINNED CONSTANT. The 17-rung check VERIFIES the pin; on failure it mints `GOVERNING-TABLE-IN-DOUBT` and does NOT re-select** | Langston r2 edit 2 — a watcher that picks whichever table matches best can never report drift |
| 4 | r2 OBJ-1: anchor = enclosing heading + column-name resolution | **Plus ROW-LABEL resolution** (`Tier 1-12` + `Pro 1-5` → rungs 1-17) | Langston r2 edit 3 — otherwise OBJ-5's `rung count ≠ 17` trips on the page's own labelling on day one |
| 5 | r2 §2.1: ladder values, and a later working claim that only the margin table matched | **Three of the four ladders match the reference 17/17; ladder 3 diverges at all 17** | both earlier readings were artifacts of offset-scanning; see §2.3 |

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

### 2.2 The four ladders, as the structured parser reads them

| # | Tier 1 (maker/taker) | rungs | vs reference §1 | spot columns |
|---|---|---|---|---|
| **1** | `0.40 / 0.80` | 17 | ✅ **17/17** | maker 4, taker 5 |
| **2** | `0.40 / 0.80` | 17 | ✅ **17/17** | maker 4, taker 5 |
| **3** | ⭐ `0.38 / 0.80` | 17 | ⛔ **0/17 — diverges at every rung** | maker 4, taker 5 |
| **4** | `0.40 / 0.80` | 17 | ✅ **17/17** | futures 4/5, **spot 6/7** |

- ⭐ **LADDER 3'S DIVERGENCE IS SYSTEMATIC, NOT SCATTERED: its maker leg is exactly `0.02` below the reference at EVERY rung** (`0.38` vs `0.40`, `0.28` vs `0.30`, … `0.00` vs `0.02`, `-0.02` vs `0.00`) **while its taker leg is identical throughout.** A uniform single-column offset is the signature of a different commercial schedule, not of a stale or mistyped table.
- ⛔ **WHAT THAT DOES NOT ESTABLISH, and the batch must not claim it: what ladder 3 IS.** Named, not chased (§7).
- ⛔ **LADDERS 1, 2 AND 3 HAVE BYTE-IDENTICAL HEADER ROWS** (`Tier | Spot 30-Day Vol (USD) OR | Futures 30-Day Vol (USD) OR | AoP (USD) | Spot Maker (%) | Spot Taker (%)`). **So the header row cannot discriminate them — only the ENCLOSING ACCORDION HEADING can** (`Kraken Pro` / `Cross-platform Fee Tiers` / `Spot Crypto` / `Margin`, recovered separately). **The committed extractor does NOT yet capture that heading; OBJ-1 must add it.** This is the strongest argument for Langston's pinned-constant ruling: with three identical headers, "find the table that matches" is not merely weak, it is undefined.
- **Ladder 4 is the margin table** and proves position is not portable — it carries futures *and* spot pairs, with spot at columns 6/7.

### 2.3 Which ladder governs our account

**`KRAKEN_FEE_SCHEDULE_REFERENCE.md` §1 is seventeen rungs transcribed from Kyle's AUTHENTICATED in-app Fees dialog** (`pro.kraken.com/app/trade/sui-usd#dialog/fee-level`, 2026-09-06), and §0.b records that **every figure in §1 was cross-checked against those dialogs**. The three rungs quoted in §0.b's prose are spot-checks it chose to print, **not the extent of the capture** — my r2 reading of that as the population was wrong, and Langston corrected it at the object.

⇒ **The account ladder matches ladders 1, 2 and 4 at all seventeen rungs, and ladder 3 at none.** The database (`0.004 / 0.008`) is correct for this account.
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
- **Anchor 1 — the enclosing accordion heading, PINNED AS A CONSTANT** (`Cross-platform Fee Tiers`). ⛔ **Never a runtime best-fit.** Three ladders share a header row; the heading is the only discriminator.
- **Anchor 2 — column-name → index within that table** (`Spot Maker (%)`, `Spot Taker (%)`). ⛔ **Never a fixed index** — ladder 4 puts the spot pair at 6/7.
- **Anchor 3 — ROW-LABEL resolution:** the page labels rungs `Tier 1`-`Tier 12` then `Pro 1`-`Pro 5`; the reference numbers them 1-17. **Map `Pro N` → rung `12 + N`.**
- **Parse the JSON payload as JSON** (`window.__INITIAL_PROPS__`, `paragraphArticleBodyTable` → `field_rows`), never offset runs.
- **Normalise every observed cell form:** `<p>0.40 %</p>` · `0.40%` · `0.4%` · `&lt;` · `&gt;` · NBSP. **Compare decimals, never strings** — `0.4%` vs `0.40%` would otherwise alert on day one.
**Verify:** reports **4 ladders**, each with its enclosing heading; the pinned one resolves 17 rungs at `0.40/0.80`; a **mutation test** on a saved body reports the altered rung and only that rung.

### OBJ-2 — THE PAGE-VERSUS-DATABASE LEG, AND THE PIN IS VERIFIED, NEVER RE-SELECTED
Compare the pinned ladder's rung 1 against `module_constants` `fee_model` `crypto_spot`.
⛔ **NO PASS IS PRE-REGISTERED.** The run names the heading it read; **agreement OR disagreement is a successful run** — a disagreement is the finding.
⛔ **If the pinned heading no longer resolves, or its ladder no longer matches the reference at 17/17, the run mints `GOVERNING-TABLE-IN-DOUBT` and STOPS. It does not fall back to another table.**
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
⛔ **Fail loud, never coerce:** unparseable cell · **pinned heading resolving to 0 or >1 table** · **rung count ≠ 17** · **a column name that does not resolve** · **a row label outside `Tier 1-12`/`Pro 1-5`** · an unseen normaliser form.
**Verify:** each outcome produced deliberately, artifact attached, **including every failure branch** (`#744` rider).

### OBJ-6 — MACHINE ACTOR + INSTALL-ORDER NEGATIVE CONTROL
Add `kraken-fee-watch` (tag `machine`) to `ALERT_ACTORS`. ⛔ **The actor must be in the DEPLOYED source before the cron exists.**
**Verify:** a `--by kraken-fee-watch` resolve attempted **before** the deploy showing the **refusal**, and the same call **after** showing acceptance.

### OBJ-7 — ONE LIVE COPY, INSTALLED AS THE ESTATE ALREADY INSTALLS
Repo home `comms-infra/discord/`, installed by `comms-infra/discord/deploy.sh` — the path that installs `dt-deploy-drift.sh`.
**Verify:** `/usr/local/bin/` holds the only invoked artifact; the repo copy has zero invokers, measured with a control.

### OBJ-8 — THE CENSUS ASSERTION (replaces the dropped content hash)
A structural guard firing only on change to what we read: **ladder count · rungs per ladder · column-name resolution · the pinned heading's presence.**
**Verify:** today it asserts 4 ladders / 17 rungs each / both column names resolving; a saved body with a renamed column or heading fails it.

### OBJ-9 — GOVERNANCE
SIM entry mirroring the `dt-deploy-drift.sh` table **and stating the cadence** — hourly makes this **writer #12** to `system-alerts.jsonl` alongside the hourly drift monitor. **Name the `#647` collision risk; do not fix it here.**
⛔ **`SYSTEM_MANUAL` §5 gets one real paragraph** (Langston r2 ruling 1): the cost model now has a **source-of-truth verification contract** — **the DATABASE is authoritative for CHARGING, the PAGE is authoritative for DRIFT-DETECTION only.**

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
- **Establishing what ladder 3 is.** Its uniform maker−0.02 offset is characterised in §2.2 and reported by the watcher as a non-governing ladder. **Named, not chased.**
- The AoP lever, and the `$2,501` first-rung cliff.
⛔ **CONDITION (Langston r2 ruling 5): the alert body must state it compares RUNG 1 ONLY and that we have no tier tracking** — so a disagreement means *either* the venue changed the schedule *or* we crossed a rung (`#546`, absent-as-valid).

## 8. GOVERNANCE SET (architecture class)

Completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1011` closed) · `PHASE_19_PLAN` row 2.4-FEE-b · `SYSTEM_IMPACT_MAP` · **`SYSTEM_MANUAL` §5 (one real paragraph — NOT N/A)** · `KRAKEN_FEE_SCHEDULE_REFERENCE.md` §5 · shared `MEMORY.md` + `MEMORY_CC_B.md` · `CLAUDE_NEW_PHASE_19_TASK_LIST.md` · Langston's `MEMORY.md`.

## 9. HONEST RESIDUALS

- ⚠️ **The extractor does not yet capture the enclosing accordion heading** — the one thing that discriminates ladders 1, 2 and 3. **OBJ-1 is not satisfied until it does.**
- ⚠️ **My fetch measured 1,394,111-1,394,145 bytes across runs; Langston's measured 1,398,949** — same four ladders, same values. **The page is stable within a session and NOT across hours**, which is the stronger reason the content hash was dropped.
- ⚠️ **What ladder 3 describes is unestablished.** Over-reporting is the safe direction: the watcher names every ladder it finds.
- ⚠️ **The account view is a 2026-09-06 capture, not a live read.** Seventeen rungs does not make it live; it uses all of what was captured. If the account's tier moves, the governing-table determination must be re-made — which is what OBJ-4's event trigger and ruling 5's alert wording exist to surface.

## 10. PLAIN-LANGUAGE SUMMARY

Kraken changed its fees in July and we did not notice until September, because nothing compares what the venue publishes against what we actually charge. This builds that comparison and runs it on a schedule.

The complication is that Kraken's page does not publish one fee table — it publishes four, and they do not agree. Three of them match Kyle's own signed-in account exactly, across all seventeen tiers. The fourth is a different schedule whose maker rate sits two hundredths of a percent below ours at every single tier — a consistent gap, which is what a different commercial deal looks like rather than a mistake. So the check cannot just "read the table": it has to be told which table is ours, then confirm that table still matches our account on every tier, and stop and say so if it ever does not.

The tokenized stocks stay manual, because their table is not published anywhere public and the only place it appears requires logging in, which no session may do. That becomes a reminder every ninety days — and immediately, if the crypto side ever disagrees.
