# B-KRAKEN-FEE-WATCH — SCOPE

**Batch:** `B-KRAKEN-FEE-WATCH` · **Issue:** `#1011` · **Plan row:** `PHASE_19_PLAN` 2.4-FEE-b · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** **r2** — Langston's Step-1 BLOCKER-1 and five rulings folded (2026-09-12 01:15Z) · r1 sent back to owner · **Card:** `PVTI_lAHODmulEM4BfQP4zg6mZFg`

---

## 0. PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED (r1) | NOW (r2) | REASON |
|---|---|---|---|
| 1 | M4: "the crypto spot table" — **one** table, rung 1 `0.40/0.80` | ⛔ **FOUR tables carry a `Spot Taker (%)` Tier1→Pro5 ladder, and they do not agree.** Two read `0.40/0.80`, one reads **`0.38/0.80`**, one is an 8-column margin table | **Langston BLOCKER-1**, re-derived by me at the object |
| 2 | §1's correction quoted `Tier 1 \| $0+ \| < $5M \| N/A \| 0.38% \| 0.80%` as "the" spot table's Tier 1 | **That row is table 3 (`Spot Crypto`); M4's `0.40/0.80` is tables 1-2.** r1 treated two different tables as one object | my error, same adjacent-object class I had just recorded |
| 3 | OBJ-1 anchor: table whose header contains `Spot Taker (%)` | **Anchor = enclosing accordion heading + column-name→index resolution, per table** | position is not portable — table 4 puts spot maker/taker at columns 7/8 |
| 4 | OBJ-2 verify: "with the live values it reports **agreement**" | ⛔ **Struck.** The extractor NAMES the table it read; **agreement or disagreement both pass the batch** | a pre-registered PASS drives the instrument to pick tables 1/2 by construction |
| 5 | M3 content hash as an operand | **DROPPED** | a 1.4 MB marketing surface changes for reasons unrelated to rates; an operand whose alerts we learn to ignore is worse than none |
| 6 | §7: `SYSTEM_MANUAL` "expected N/A" | **NOT N/A — one real paragraph** | `config.mjs:127` makes it REQUIRED for `architecture`, and a required row cannot take N/A |

---

## 1. THE DEFECT

**Kraken revised its fee schedule on 2026-07-09. We found out on 2026-09-06, because Kyle looked at the page.** For 59 days the system priced against a model nothing compared to its source. That gap produced `#1010`.

⛔ **THREE OBJECTS, NOT TWO** — the live **PAGES**, our **TRANSCRIPTION**, and the **DATABASE**. A page-only diff catches the next venue change and is blind to drift we already have. **The page-versus-database leg is the one that earns its keep.**

---

## 2. WHAT I MEASURED — every figure re-derived at the object, with its control

| # | question | measured | control |
|---|---|---|---|
| **M1** | page fetchable from Helsinki? | **HTTP 200, 1,394,145 B** (Langston's independent fetch: 1,398,949 B — see the caveat below) | `api.kraken.com/0/public/Time` 200/87 B |
| **M2** | structured or a JS shell? | **structured JSON** — rows are `field_cells` objects, cells `"cell_description":"Content of Column N"`, rows `"row_description":"Row :: Tier 1"` | literal `9.99%` → **0 hits** |
| **M3** | ⛔ **how many ladders carry `Spot Taker (%)`?** | **FOUR**, enumerated below | 202 row blocks total, 4 `Row :: Tier` headers |
| **M4** | which governs our account? | **tables 1-2**, on the §0.b evidence below | three independent rungs cross-checked |
| **M5** | xStock ladder on the public page? | ⛔ **NO** — `$100,000,001` → 0 hits; 1 xStock mention near any rate cell, belonging to another table | same proximity test finds **8** `Tier 1` mentions near rate cells |
| **M6** | in-app dialog reachable unauthenticated? | ⛔ **NO** — 13 KB JS shell, 0 rate strings | the public page returned 1.39 MB with rates |
| **M7** | can the API bypass the page? | ⛔ **NO** (Langston, ⊕): `AssetPairs` 200 / 673 KB / 1,449 pairs, `fees`/`fees_maker` **empty on 0 of 1,449** — keys present, arrays empty | saturated population; the instrument reached the object |

### 2.1 ⛔ THE FOUR LADDERS — enumerated, not counted

| # | enclosing heading | Tier 1 maker | Tier 1 taker | ladder shape | cell form |
|---|---|---|---|---|---|
| **1** | *(Kraken Pro · "How your tier is determined")* | **`0.40 %`** | `0.80 %` | T12 `0.0/0.10`, Pro 5 `0.0/0.05` | `<p>0.40 %</p>` |
| **2** | **Cross-platform Fee Tiers** | **`0.40 %`** | `0.80 %` | identical to 1 | `<p>0.40 %</p>` |
| **3** | **Spot Crypto** | ⭐ **`0.38%`** | `0.80%` | **T11 `0.00`, T12 `-0.02`, Pro 1-5 `-0.02`** | bare `0.38%` |
| **4** | **Margin** | `0.4%` (col 7) | `0.8%` (col 8) | 8 cols incl. Futures Maker/Taker | bare `0.4%` |

⛔ **TABLE 3 DIFFERS ALL THE WAY DOWN, so it is a DIFFERENT SCHEDULE and not a typo in one cell:** T2 `0.28` vs `0.30` · T3 `0.20` vs `0.22` · T5 `0.13` vs `0.15` · T11 `0.00` vs `0.02` · T12 `-0.02` vs `0.00`. **It is also the source of the `-0.02%` cells I twice misread in r1.**

### 2.2 ⭐ WHICH TABLE GOVERNS OUR ACCOUNT — the evidence Langston asked for

**`KRAKEN_FEE_SCHEDULE_REFERENCE.md` §0.b is the tiebreaker: Kyle's AUTHENTICATED in-app Fees dialog, opened on three live markets while signed in.** It reads **Tier 1 `0.40 / 0.80`**, tier 12 `0.00 / 0.10`, tier 17 `0.00 / 0.05`.

| rung | account dialog (§0.b) | tables 1-2 | table 3 |
|---|---|---|---|
| 1 | **0.40 / 0.80** | ✅ `0.40 / 0.80` | ❌ `0.38 / 0.80` |
| 12 | **0.00 / 0.10** | ✅ `0.0 / 0.10` | ❌ `-0.02 / 0.10` |
| 17 (Pro 5) | **0.00 / 0.05** | ✅ `0.0 / 0.05` | ❌ `-0.02 / 0.05` |

⇒ **Tables 1-2 match the account on all three cross-checked rungs; table 3 matches on none. The DATABASE (`0.004 / 0.008`) is correct for this account.**
⛔ **WHAT THIS DOES *NOT* ESTABLISH, and the batch must not claim it: that table 3 is wrong, stale, or a defect.** It is a published Kraken table we do not yet know the product of — its negative maker ladder is a distinct commercial schedule. **The defensible claim is only that it does not govern us**, and the watcher must therefore *name* which table it read rather than assume one.

---

## 3. OBJECTIVES AND VERIFICATION

### OBJ-1 — Extract the governing ladder, anchored on HEADING + COLUMN NAME
- **Anchor = enclosing accordion heading**, then **column-name → index resolution within that table** (`Spot Maker (%)`, `Spot Taker (%)`). ⛔ **Never a fixed column index** — table 4 proves position is not portable.
- **Parse the JSON table objects, not offset runs.** ⊕ Langston measured that walking table 3 to the next `Row :: Tier` header swallows **144** rows including the whole per-asset margin list.
- **ENUMERATE EVERY table carrying a Tier1→Pro5 ladder and REPORT ALL OF THEM** with their headings and Tier-1 values.
- **Normaliser handles every observed form:** `<p>0.40 %</p>` · `0.40%` · `0.4%` · `&lt;` · `&gt;` · NBSP. ⛔ **A string compare makes `0.4%` vs `0.40%` a drift alert on day one** — compare decimals, not text.
**Verify:** returns **4 ladders**, each named by heading, table 2 (`Cross-platform Fee Tiers`) resolving 17 rungs with rung 1 `0.40/0.80`; a **mutation test** — one altered cell in a saved body is reported as that rung and only that rung.

### OBJ-2 — THE PAGE-VERSUS-DATABASE LEG
Compare the **governing** ladder's rung 1 against `module_constants` `fee_model` `crypto_spot`.
⛔ **NO PASS IS PRE-REGISTERED.** The run reports **which table it read, by heading**, and **agreement OR disagreement is a successful run** — a disagreement is the finding, not a bug.
**Verify:** it names the heading it read; pointed at a scratch fixture with a wrong DB value it reports disagreement naming both sides.

### OBJ-3 — THE PAGE-VERSUS-TRANSCRIPTION LEG
Compare the governing ladder against §1 of the reference (17 rungs).
**Verify:** reports no drift today; one edited rung in a scratch copy is named with both values.

### OBJ-4 — xSTOCK: A DATED RE-CAPTURE OBLIGATION, **90 days + an event trigger**
⛔ **Measured (M5, M6, M7): there is no machine source for the xStock rates.** No session may log in (`CLAUDE.md` §7).
- **Cadence 90 days, first due 2026-12-11** (Langston: monthly is a nag that gets ignored, which is worse than quarterly honoured; the contract landed 09-11 and a tokenised-equity schedule does not move monthly).
- ⭐ **EVENT TRIGGER, the part that earns it: any crypto-leg disagreement makes the xStock re-capture due IMMEDIATELY** — a venue that revised one schedule likely revised both, which is exactly the 2026-07-09 case.
- **Resolves only against a capture date**, never against "looks fine".
**Verify:** fires at its due date naming the held values (`0.0010` / `-0.0002`); a forced crypto disagreement brings it due at once.

### OBJ-5 — THREE OUTCOMES, NEVER TWO, AND FAIL LOUD ON FIVE INPUTS
**measured · no-change · `MEASUREMENT FAILED`** — the third mints its own alert **naming the operand**, read off **exit status, never an HTTP code** (⊕ every probe returned 200 on a page whose content could have moved entirely).
⛔ **Fail loud, never coerce, on:** an unparseable cell · **the anchor resolving to 0 or >1 table** · **rung count ≠ 17** · **a column name that does not resolve** · a normaliser input it has never seen.
**Verify:** each outcome produced deliberately, artifact shown, **including every failure branch** (`#744` rider).

### OBJ-6 — MACHINE ACTOR + INSTALL-ORDER NEGATIVE CONTROL
Add `kraken-fee-watch` (tag `machine`) to `ALERT_ACTORS`. **A robot must not claim a session identity** (`#987`/`#1004`).
⛔ **Install order is a precondition:** the actor must be in the **deployed** source before the cron exists.
**Verify (Langston's rider):** one `--by kraken-fee-watch` resolve attempted **BEFORE** the deploy showing the **refusal**, and the same call **after** showing acceptance.

### OBJ-7 — ONE LIVE COPY, INSTALLED AS THE ESTATE ALREADY INSTALLS
Repo home `comms-infra/discord/`, installed by `comms-infra/discord/deploy.sh` (`install -m 0755` → `/usr/local/bin/`, log + state dirs, cron line) — the path that installs `dt-deploy-drift.sh`.
**Verify:** `/usr/local/bin/` holds the only invoked artifact; the repo copy has zero invokers, measured with a control.

### OBJ-8 — THE CENSUS ASSERTION (replaces the dropped hash)
A **structural guard that fires only on change to the thing we actually read**: table count carrying a ladder · rung count per ladder · column-name resolution per table.
**Verify:** today it asserts 4 ladders / 17 rungs / both column names resolving; a saved body with a renamed column fails it.

### OBJ-9 — GOVERNANCE
SIM entry mirroring the `dt-deploy-drift.sh` table, **stating the cadence** — hourly makes this **writer #12** to `system-alerts.jsonl` on a lock-free append alongside the hourly drift monitor. **Name the collision risk against `#647` / `B-ALERT-QUEUE-INTEGRITY`; do not fix it here.**
⛔ **`SYSTEM_MANUAL` §5 gets one real paragraph** (Langston ruling 1): after this batch the cost model has a **source-of-truth verification contract** it did not have — the watcher, its operands, and the explicit statement that **the DATABASE is authoritative for CHARGING and the PAGE is authoritative for DRIFT-DETECTION only.**

---

## 4. ARCHITECTURAL READ (1.a)

- **SIM §`dt-deploy-drift.sh`** — host, cadence, operands, dedupe keys, three-outcome failure mode, machine actor, one-live-copy rule, controls. It is the **eleventh** writer to the alert store and the second outside the app process; this batch is the twelfth, through the same supported CLI, so it is **a frequency increase on an existing lock-free append, not a new writer class.**
- **SIM §`fee_model`** — the single merge site and the per-class rows this batch **READS and never writes.** ⛔ **This batch writes no fee value, ever.** It reports; a correction is a separate reviewed change.
- **`SYSTEM_MANUAL` §5** — the cost model, now carrying the landed `#1010` contract and the signed maker rail.
- **`ALERT_ACTORS`** (`system-alerts.ts:205-220`) — 10 actors; `machine` members are `governance-checker`, `governance-checker-heartbeat`, `b-new-40-soak-verify`, `deploy-drift-monitor`, `langston-privacy-check`.

## 5. PROVENANCE READ (1.b)

**TIER 1 — the transcription this batch compares against.** Introduced at `8ecc671565f262a849f4f19406f600cf318fe70e` (2026-09-06), quoted verbatim:

> *"Kyle captured Kraken's public fee pages and asked for them to be stored, shared and monitored. All three, plus the finding that fell out of reading them."*
> *"The transcription exists because the captures are IMAGES: pdftotext returns zero lines from all three, so no future check can parse them."*

⭐ **DISPOSITION (2) — relevant, needs updating to today's intent.** That sentence is true of the **PDFs** and was carried forward as though true of the **source**. M2 establishes the live page is parseable. §5 of the reference ("nothing currently watches it") is rewritten by this batch.

**TIER 2:** `system-alerts.ts` (the store and its actor gate, `#987` — read and extended) · `dt-deploy-drift.sh` (the shape copied; read only) · `comms-infra/discord/deploy.sh` (the installer; extended by one artifact).

**Corpora searched:** `RUNNING_ISSUES` (`#1011`, `#1010`, `#133`/`#134`, `#744`, `#1002`, `#1016`, `#647`), `BATCH_CATALOG`, both drift completion reports, SIM, System Manual, `git log --reverse` on the reference. **`bridge/canonical/` not applicable** — every component postdates the 2026-01/02 governance change.

## 6. ALREADY EXISTS / ALREADY DECIDED

- **Nothing fetches any Kraken page today** — census at the ref across `scripts/`, `server/`, `comms-infra/`; every hit is an archived or completion report. **Control: the same census finds external URLs elsewhere in `comms-infra/`.**
- The alert store, CLI, dedupe keys and actor gate all exist; this batch adds one actor.
- ⛔ **Tier RESOLUTION is OUT** — `B-FEE-TIER-RESOLUTION`, Phase 21.

## 7. NOT IN THIS BATCH

- Changing any fee value automatically. **The watcher reports; a human decides.**
- Establishing what product table 3 (`Spot Crypto`, `0.38%`) belongs to. **Named, not chased** — the watcher reports it as a non-governing ladder.
- The AoP lever, and the `$2,501` first-rung cliff.
⛔ **CONDITION (Langston ruling 5): the alert body must state that it compares RUNG 1 ONLY and that we have no tier tracking** — so a disagreement means *either* the venue changed the schedule *or* we crossed a rung. Otherwise the first tier crossing mints an alert wearing "venue changed" clothes and someone edits the database (`#546`, absent-as-valid).

## 8. GOVERNANCE SET (architecture class)

Completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1011` closed) · `PHASE_19_PLAN` row 2.4-FEE-b · `SYSTEM_IMPACT_MAP` (new watcher entry + writer count) · **`SYSTEM_MANUAL` §5 (one real paragraph — NOT N/A)** · `KRAKEN_FEE_SCHEDULE_REFERENCE.md` §5 · shared `MEMORY.md` + `MEMORY_CC_B.md` · `CLAUDE_NEW_PHASE_19_TASK_LIST.md` · Langston's `MEMORY.md`.

## 9. HONEST RESIDUALS

- ⚠️ **My fetch measured 1,394,145 bytes; Langston's measured 1,398,949.** Both 200, both carrying the same four ladders with the same values. **The page is stable within a session and NOT byte-stable across hours** — which is further reason the dropped hash was the right call, and it is why OBJ-8 asserts structure rather than bytes.
- ⚠️ **Which product table 3 describes is unestablished.** Over-reporting is the safe direction: the watcher names every ladder it finds.
- ⚠️ **The account view is a 2026-09-06 capture, not a live read.** If the account's tier moves, §0.b goes stale and the governing-table determination must be re-made — which is exactly what OBJ-4's event trigger and ruling 5's alert wording exist to surface.

## 10. PLAIN-LANGUAGE SUMMARY

Kraken changed its fees in July and we did not notice until September, because nothing compares what the venue publishes against what we actually charge. This builds that comparison and runs it on a schedule.

The complication Langston caught is that Kraken's page does not publish one fee table — it publishes four, and they disagree. Two of them match what Kyle's own signed-in account shows, one is a different schedule entirely, and one is for margin trading. So the check cannot just "read the table"; it has to say **which** table it read and prove that table is the one that applies to us. Our own records settle it: the account view matches the two that say 0.40%, which is what we charge, so the database is right.

The tokenized stocks stay manual, because their table is not published anywhere public and the only place it appears requires logging in, which no session may do. That becomes a reminder every ninety days — and immediately, if the crypto side ever disagrees, on the reasoning that a venue changing one schedule has probably changed both.
