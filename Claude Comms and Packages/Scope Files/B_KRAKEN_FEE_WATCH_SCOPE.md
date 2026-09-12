# B-KRAKEN-FEE-WATCH — SCOPE

**Batch:** `B-KRAKEN-FEE-WATCH` · **Issue:** `#1011` · **Plan row:** `PHASE_19_PLAN` 2.4-FEE-b · **Owner:** CC-B (Claude New)
**change-class: architecture**
**Revision:** r1 · **Drafted:** 2026-09-12 · **Card:** `PVTI_lAHODmulEM4BfQP4zg6mZFg` (Scope / Claude New / Batch / Phase 19)

> **Declared `architecture` deliberately, and it is a judgement Langston should grade:** the batch adds a **new canonical actor to deployed runtime code** (`server/services/system-alerts.ts` `ALERT_ACTORS`) and a **new out-of-process writer to the alert store**. It is not merely a script. Fail-closed per `CLAUDE.md` §3.0 — if it is over-declared, say so and I will re-declare.

---

## 0. THE DEFECT

**Kraken revised its fee schedule on 2026-07-09. We found out on 2026-09-06, by hand, because Kyle happened to look at the page.** For 59 days the system priced against a model nothing had compared to its source. That gap produced `#1010` — xStocks charged the crypto schedule, taker 8× too high and maker with the sign inverted — which was a **selection** defect, not a bookkeeping one.

⛔ **THE DESIGN CONSTRAINT, from `#1011` and unchanged by anything measured here: THERE ARE THREE OBJECTS, NOT TWO** — the live **PAGES**, our **TRANSCRIPTION** (`1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md`), and the **DATABASE** (`module_constants` / `fee_model`). **A watcher that only diffs the pages catches the NEXT venue change and is structurally blind to the drift we already had.** The page-versus-database leg is the one that earns its keep.

---

## 1. WHAT I MEASURED BEFORE DRAFTING — every number here was taken tonight, with a control

⭐ **These measurements changed the design. `#1011` was drafted on the assumption that the sources are unparseable; that is true of our PDF captures and NOT true of the live page.**

| # | question | measured answer | control |
|---|---|---|---|
| **M1** | Is the public fee page fetchable from Helsinki? | **YES** — `https://www.kraken.com/features/fee-schedule` returns **HTTP 200, ~1.39 MB** | `api.kraken.com/0/public/Time` returned 200/87 B, so the host has egress |
| **M2** | Does the body carry rates, or is it a JS shell? | **It carries a STRUCTURED JSON payload** — rows are objects of `field_cells`, each cell `{"cell_description":"Content of Column N","field_content":"<p>0.40 %</p>"}`, each row tagged `"row_description":"Row :: Tier 1"` | the literal `9.99%` returns **0 hits** — the instrument discriminates |
| **M3** | Is the page stable enough to hash? | **BYTE-IDENTICAL across two consecutive fetches** — same sha256, same 1,398,949 bytes | the diff of the two bodies is empty |
| **M4** | Is our crypto ladder extractable and correct? | **YES, and the transcription is FAITHFUL.** The spot table holds **17 rungs** (`Tier 1`-`Tier 12`, `Pro 1`-`Pro 5`). Rung 1 = `0.40 % / 0.80 %`, rung 12 = `0.00 % / 0.10 %`, rung 17 = `0.00 % / 0.05 %` — matching §1 of our transcription row for row | the table's own header row (`Row :: Tier`) names the columns, incl. `Spot Taker (%)` |
| **M5** | Is the **xStock** ladder on the public page? | ⛔ **NO.** Our reference's fingerprint `$100,000,001` returns **0 hits**; only **1** xStock mention sits within 400 chars of any rate cell, and it belongs to another table's `$100,000,000 +` institutional row | the same proximity test finds **8** `Tier 1` mentions near rate cells — so the near-absence is measured, not an instrument failure |
| **M6** | Is the in-app xStock dialog publicly reachable? | ⛔ **NO** — `pro.kraken.com/app/trade/xstocks-nvda-usd` unauthenticated returns a **13 KB JS shell, zero rate strings** | the same fetch of the public fee page returned 1.39 MB with rates |

⚠️ **A CORRECTION I MADE TO MYSELF, RECORDED BECAUSE IT IS THE SCOPE'S OWN METHOD:** I first read the `-0.02%` rows on that page as the xStock ladder, then as the futures ladder. **Both were wrong.** They are the **CRYPTO SPOT** ladder's high Pro tiers — settled by reading *that table's own Tier 1 row* (`Spot Taker (%) | Tier 1 | $0+ | < $5M | N/A | 0.38% | 0.80%`) instead of inferring identity from a nearby string. I also suspected a 16-vs-17 rung drift; **that was my own miscount of the Pro rows.** No finding is claimed from any of the three.

---

## 2. OBJECTIVES AND VERIFICATION

### OBJ-1 — Extract the crypto spot ladder from the live page, ANCHORED ON STRUCTURE
Parse the page's JSON payload and read the spot table by **table identity + row identity + column position** — locate the table whose header row (`"row_description":"Row :: Tier"`) contains the column name `Spot Taker (%)`, then read each `Row :: Tier N` / `Row :: Pro N` row's maker and taker cells.
⛔ **NOT a percentage regex over the page.** A blind sweep returns dozens of rates from the stablecoin, futures and institutional tables; the page holds **8 tables / 202 row blocks**.
**Verify:** the extractor returns exactly **17 rungs** with rung 1 = `0.40 / 0.80` and rung 17 = `0.00 / 0.05`; a **mutation test** — feed it a saved body with one cell altered and assert it reports that rung changed, and only that rung.

### OBJ-2 — THE PAGE-VERSUS-DATABASE LEG (the one that earns its keep)
Compare the extracted **rung-1** pair against `module_constants` `fee_model` `crypto_spot` (`spot_maker_fee` / `spot_taker_fee`) on staging.
★ **This is the leg that would have caught `#1010`**, because it compares the venue to what we actually charge rather than the venue to itself.
**Verify:** with the live values it reports **agreement** (0.004 / 0.008 ↔ 0.40 % / 0.80 %); pointed at a deliberately wrong DB value in a scratch fixture it reports **disagreement naming both sides**. ⛔ The comparison normalises units explicitly (`0.40 %` ↔ `0.004`) and **fails loudly on an unparseable cell rather than coercing it**.

### OBJ-3 — THE PAGE-VERSUS-TRANSCRIPTION LEG (catches the next venue change)
Compare the extracted ladder against §1 of `KRAKEN_FEE_SCHEDULE_REFERENCE.md`.
**Verify:** today it reports **no drift** (M4 — the transcription is faithful row for row); with one rung edited in a scratch copy of the reference it names the rung and both values.

### OBJ-4 — THE xSTOCK LEG IS A DATED RE-CAPTURE OBLIGATION, NOT A SCRAPER
⛔ **Measured (M5, M6): the xStock schedule is NOT on any public page and its dialog is authenticated.** No session may log in (`CLAUDE.md` §7 — a session may not type a password into a form), so **there is no machine source for the xStock rates, and this batch will not pretend otherwise.**
⇒ Ship a **dated re-capture obligation**: a scheduled alert that comes due on a stated cadence and asks Kyle for a fresh capture of the in-app xStocks dialog, naming the two values currently held (`0.0010` / `-0.0002`) so the check is a glance, not a project.
**Verify:** the alert fires at its due date, names the held values, and **resolves only against a capture date** — never against "looks fine".
⚠️ **Langston's condition, adopted verbatim: the transcription leg cannot be automated — it is a human read of an unparseable image — so it needs a dated re-capture obligation, never the pretence of a third machine source.**

### OBJ-5 — THREE OUTCOMES, NEVER TWO
**measured · no-change · `MEASUREMENT FAILED`.** The third mints its own alert **naming the operand that failed**, and is read off the **exit status, never an HTTP code**.
★ Mirrors `dt-deploy-drift.sh`, whose own header records why: a 404's JSON body carries a `status` field, so an `is None` guard never fired and **a 404 rendered as ZERO DRIFT — all-clear from an instrument that could not see the repository at all.**
**Verify:** each of the three outcomes is produced deliberately and its artifact shown — including the failure path.

### OBJ-6 — A MACHINE ACTOR, AND THE INSTALL-ORDER PRECONDITION
Add `kraken-fee-watch` (tag `machine`) to `ALERT_ACTORS` in `server/services/system-alerts.ts`. **An hourly robot must not claim a session identity** (`#987` / `#1004`).
⛔ **INSTALL ORDER IS A PRECONDITION, NOT A NOTE** (learned from the drift line): the actor must be **present in the DEPLOYED source before the cron is installed**, because the CLI is source-run — otherwise every resolve is refused and the job re-mints against itself.
**Verify:** the actor is in the deployed tree (a returning `grep -c` on the staging worktree) **before** the cron line exists; a refused `--by` names the canonical set.

### OBJ-7 — ONE LIVE COPY, INSTALLED THE WAY THE ESTATE ALREADY INSTALLS
Repo home `comms-infra/discord/`, installed by the existing `comms-infra/discord/deploy.sh` (`install -m 0755` → `/usr/local/bin/`, log + state dirs, cron line) — the same path that installs `dt-deploy-drift.sh`.
**Verify:** `/usr/local/bin/` holds the only invoked artifact; the repo copy has **zero invokers**, measured with a control, and the SIM entry says so.

### OBJ-8 — THE FAILURE BRANCH IS EXERCISED AGAINST A REAL RESPONSE (`#744` rider)
⛔ **Binding on this batch by construction: it is a guard written against an EXTERNAL contract.** Exercise it against a **real** broken response — a 404, a truncated body, a table whose columns moved — and **state the expected output BEFORE running**.
**Verify:** the artifact of each failure run is attached to the change list. ⛔ A clean read of the happy path is **not** evidence.

### OBJ-9 — GOVERNANCE
SIM entry mirroring the `dt-deploy-drift.sh` table (HOST · TRIGGER + CADENCE · OPERANDS · `dedupe_key` · FAILURE MODE · ACTOR · INSTALLED PATH · CONTROLS), plus the writer-count line — **it becomes a further out-of-process writer to `system-alerts.jsonl`**, landing on `#647` / `B-ALERT-QUEUE-INTEGRITY`. §5 of the Kraken reference ("nothing currently watches it") is rewritten to name the watcher.

---

## 3. ARCHITECTURAL READ (MANDATORY 1.a)

- **`SYSTEM_IMPACT_MAP.md` §`dt-deploy-drift.sh`** (added 2026-09-07, `#1002`) — the nearest neighbour and the template: host, cadence, operands, dedupe keys, three-outcome failure mode, machine actor, one-live-copy rule, controls. **It is the ELEVENTH writer to `system-alerts.jsonl` and the SECOND outside the app process**; this batch adds another, through the same supported CLI rather than a file append, so it is **a frequency increase on the existing lock-free append, not a new writer class.**
- **`SYSTEM_IMPACT_MAP.md` §`fee_model`** — the single merge site (`cost-model.getFrictionForAssetClass`) and the per-class rows this batch READS but never writes. ⛔ **This batch writes no fee value. Ever.** It reports disagreement; a correction is a separate, reviewed change.
- **`SYSTEM_MANUAL.md` §5** — the cost model, now carrying the landed `#1010` contract and the signed maker rail.
- **`ALERT_ACTORS`** (`server/services/system-alerts.ts:205-220`) — 10 actors today; `machine` members are `governance-checker`, `governance-checker-heartbeat`, `b-new-40-soak-verify`, `deploy-drift-monitor`, `langston-privacy-check`.

## 4. PROVENANCE READ (MANDATORY 1.b)

**TIER 1 — the transcription this batch compares against.** Introduced at `8ecc671565f262a849f4f19406f600cf318fe70e` (2026-09-06). Quoted verbatim from that commit, not summarised:

> *"Kyle captured Kraken's public fee pages and asked for them to be stored, shared and monitored. All three, plus the finding that fell out of reading them."*
> *"NEW: 1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md — the venue's published schedule transcribed with its provenance, plus the three unmodified PDFs under kraken-fees/2026-09-06/. The transcription exists because the captures are IMAGES: pdftotext returns zero lines from all three, so no future check can parse them."*

⭐ **DISPOSITION (2) — relevant, needs updating to today's intent.** The file is correct and faithful (M4), but its §5 states *"nothing currently watches it"* and its design note assumes no machine source is parseable. **M1-M4 establish that the LIVE PAGE is parseable even though our CAPTURES are not** — the commit's sentence is true of the PDFs and was carried forward as though it were true of the source. This batch updates that, and the distinction is the reason the page-versus-database leg is buildable at all.

**TIER 2 — one-line intent notes.** `system-alerts.ts` — the alert store and its canonical-actor gate (`#987`, mine); read and extended, not changed in behaviour. `dt-deploy-drift.sh` — the external-contract watcher whose shape this batch copies; read only. `comms-infra/discord/deploy.sh` — the estate's installer; extended by one artifact.

**Corpora searched:** `RUNNING_ISSUES.md` (`#1011`, `#1010`, `#133`/`#134`, `#744` rider, `#1002`, `#1016`), `BATCH_CATALOG.md` (B-DEPLOY-DRIFT-LINE, B-DRIFT-RUNTIME-PREDICATE), the completion reports for both drift batches, `SYSTEM_IMPACT_MAP.md`, `SYSTEM_MANUAL.md`, and `git log --reverse` on the reference file. **`bridge/canonical/` NOT consulted and it is not applicable** — every component here postdates the 2026-01/02 governance change by months.

## 5. ALREADY EXISTS / ALREADY DECIDED

- **Nothing fetches any Kraken page today.** Census at the ref across `scripts/`, `server/`, `comms-infra/`: zero fetchers of `kraken.com` public pages; every hit is an archived report or a completion report. **Control: the same census finds external URLs elsewhere in `comms-infra/`.**
- **The alert store, its CLI, its dedupe keys and its actor gate all exist** — this batch uses them and adds one actor.
- ⛔ **Tier RESOLUTION is deliberately OUT** — homed at `B-FEE-TIER-RESOLUTION`, Phase 21. This batch reports what the venue publishes; it does not decide which rung we are on.

## 6. NOT IN THIS BATCH

- Changing any fee value automatically. **The watcher reports; a human decides.**
- The AoP lever (§0.d of the reference) — unpriced, and a decision for Kyle.
- The `$2,501` live-volume cliff (§4 item 3 of the reference — we have no tier tracking at all). **Named here because this batch will make it visible, and it is a scope call, not a defect.**

## 7. GOVERNANCE SET (architecture class)

Completion report · `BATCH_CATALOG` · `PHASE_HISTORY` · `RUNNING_ISSUES` (`#1011` closed) · `PHASE_19_PLAN` row 2.4-FEE-b · `SYSTEM_IMPACT_MAP` (new watcher entry + writer count) · `KRAKEN_FEE_SCHEDULE_REFERENCE.md` §5 · `SYSTEM_MANUAL` §5 (only if the cost-model contract changes — expected **N/A**) · shared `MEMORY.md` + `MEMORY_CC_B.md` · `CLAUDE_NEW_PHASE_19_TASK_LIST.md` · Langston's `MEMORY.md`.

---

## 8. PLAIN-LANGUAGE SUMMARY

Kraken changed its fees in July and we did not notice until September, because nothing compares what the venue publishes to what we charge. This builds that comparison and runs it on a schedule.

The useful surprise is that Kraken's fee page turns out to be machine-readable — it serves its tables as structured data, and two fetches came back byte-identical, so a check can read the crypto ladder exactly rather than guessing at a screenshot. Our own written copy of that ladder matches the live page row for row today, which gives the check a verified starting point.

The honest limit is the tokenized stocks: their fee table is not on any public page, and the only place it appears requires logging in, which no session may do. So that half is not automated — it becomes a dated reminder that asks Kyle for a fresh screenshot and shows the two numbers we currently hold, so checking it takes a glance.
