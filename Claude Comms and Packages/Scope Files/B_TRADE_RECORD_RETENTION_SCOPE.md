# B-TRADE-RECORD-RETENTION — Scope (Step 1)

**Owner:** CC-A · **Date:** 2026-07-28 · **change-class:** architecture
**Status:** DRAFT — awaiting Langston Step-1. **Part (2) of `B-STORAGE-CATALOG`** (booked `PHASE_19_PLAN.md:13`, Kyle-directed).
⏳ **DATE-BOUND: first irreversible loss ≈ 2026-08-09.** ~12 days from this draft.

---

## 1. THE PROBLEM, MEASURED (not inherited)

`vts_open_trades` closed rows are **HARD-DELETED at 90 days with no archive step, and the table is registered in NO retention sweep.**

- **Mechanism:** `vts-trade-persistence.ts` → `sweepClosedOpenTrades()` — `DELETE FROM vts_open_trades WHERE closed = true AND closed_at < NOW() - retentionDays`. No export, no manifest row.
- **Window:** `module_constants.data_lifecycle.vts_open_trades.closed_gc_retention_days` = **90** (read live 2026-07-28).
- **Cadence:** runs at **BOOT**, called from `server/index.ts` after `rehydrateOpenVtsTrades()`. With **537 process restarts**, boot is frequent — this is not a monthly job.
- ★ **Registry check:** absent from all three registries in `b75-retention-sweep.ts` (`B74_TABLES`, `B70_TABLES`, `PLAIN_RETENTION_TABLES`). **It holds a retention KEY but is in no SWEEP — the two-act trap, catalogued at `STORAGE_POLICY.md` §9.**

**★★ NOTHING HAS BEEN LOST YET — MEASURED, AND THIS BOUNDS THE URGENCY HONESTLY.** Every logged run reports `swept=0` (`[B79.0g-tx][GC_SWEEP] retention=90d swept=0`, sampled 2026-07-27→28). Oldest surviving row **2026-05-11**; DB persistence began at migration `2026-05-10-b79-0g-vts-open-trades.sql` ⇒ **05-11 is a START date, not a retention edge.** ⚠️ *An earlier version of this finding claimed we were "actively losing data" and that history was already destroyed. Both were wrong and are corrected here rather than quietly dropped.*

## 2. WHAT IS ACTUALLY AT RISK — AND WHAT IS NOT

**SAFE (do not include in the fix):** the OUTCOME. `exit_decision_archive` carries `pnl_pct` + `r_multiple` at **100%** coverage, is in `B70_TABLES`, and has manifest rows in **warm AND cold**. Sizing is reconstructible: `netPnl`, `r_multiple`, `dollarValue` all survive.

**LOST at the 90-day boundary — the ENTRY SIDE + the join key:** `position_size`, `quantity`, `stop_loss`, `take_profit`, `signal_type`, `pool`, `chosen_entry_mode`, `entry_fee_rate`, `maker_limit_price`, `maker_deadline`, `calibration_state`, `opened_at`, raw `context`.

★ **LANGSTON'S SCOPING RULE — ADOPTED: protect what has a NAMED CONSUMER, not everything that disappears.**

| field(s) | named consumer | verdict |
|---|---|---|
| `chosen_entry_mode`, `entry_fee_rate` | **the ONLY record of maker-vs-taker entry policy** — lose them and entry-mode friction / Net-Expectancy attribution is **unrecoverable** | ★ **IN** | ⚠️ **CORRECTED 2026-07-30 (Langston Step-4) — `maker_limit_price` DOES NOT DO THIS WORK. `chosen_entry_mode` + `entry_fee_rate` are the genuinely unrecoverable pair. `maker_limit_price` is a COPY of `entry_price` (both writers set `makerLimitPrice: entryPrice`; a maker fills AT its limit and `entry_price` is never rewritten) and `entry_price` is already archived ⇒ RECOVERABLE. It is retained only to keep the archived row self-contained and as a coherence check if a future writer diverges limit from entry. ★ `maker_deadline` IS unrecoverable — `openedAt + resolveMakerMaxPendingMs()`, and that knob is TUNABLE, so once it moves the patience budget an order worked under is gone.**
| `pool` | ideal/rotational membership work (#597 starvation) | ★ **IN** |
| `opened_at` + trade id | the JOIN KEY to `exit_decision_archive` | ★ **IN** (without it the survivors are unlinkable) |
| `position_size`, `quantity` | reconstructible from surviving outcome fields | OUT |
| `stop_loss`, `take_profit`, `calibration_state`, raw `context` | ⚠️ **no consumer NAMED YET — decide explicitly, do not default them in** | **OPEN — Step-2** |

## 3. TWO CANDIDATE FIXES — I RECOMMEND (A), BUT THE CHOICE IS LANGSTON'S TO RULE

**(A) MOVE-NOT-DELETE: give the table a real archive leg before the delete.** Consistent with this project's stated never-delete policy and with how all 12 registered tables behave. ⚠️ **The honest obstacle: `vts_open_trades` is NOT partitioned**, so it cannot ride the partition export→verify→DROP path; it would need the PLAIN path to gain an export step it does not currently have (`PLAIN_RETENTION_TABLES` deletes with no archive today — see `STORAGE_POLICY.md` §9B). **That is a real addition, not a config line.**
**(B) DENORMALISE AT CLOSE: write the named-consumer fields onto the `exit_decision_archive` row at close time.** Smaller, targets exactly §2's IN list, and inherits an already-proven tiering path (warm+cold manifest rows exist). ⚠️ **Only protects rows closed AFTER it ships** — everything already closed still dies on schedule unless backfilled.

★ **RECOMMENDATION: (A), because (B) treats the symptom for one table while leaving the plain-delete class unarchived — and the same trap will recur on the next plain table.** But (B) is materially cheaper and (A)'s obstacle is genuine. **If (B) is chosen, a BACKFILL of already-closed rows is mandatory, not optional** — otherwise the fix ships and the data still disappears.

## 4. VERIFICATION CRITERIA
1. A closed `vts_open_trades` row older than the window **still has its named-consumer fields retrievable** after a GC run — proven by retrieval, not by config.
2. **`swept > 0` observed at least once** with no loss of the §2 IN fields ⇒ the delete path genuinely exercised, not merely configured. *(Registered ≠ exercised — `STORAGE_POLICY.md` §9E.)*
3. `STORAGE_POLICY.md` §9C updated from "the live risk" to its resolved state.

## 5. OUT OF SCOPE
The `phase15b_dbs_telemetry` 4.9 G file store and the unbounded app-local file-store class (`STORAGE_POLICY.md` §9F) — same policy area, different work, and their consumer sets are unestablished.

---

## 6. ★★ STEP-1 CORRECTION (2026-07-28, prompted by CC-B's join-key challenge) — I NEARLY FILED A LANGSTON-REQUIRED DESIGN AS A BROKEN ARCHIVE

**CC-B's challenge (accepted):** *"a join key is only worth keeping if what it joins TO still exists."* My §2 asserted the join key should be protected without checking the far side. Testing it produced a much bigger surprise than the key itself.

### THE JOIN, PROVEN
`exit_decision_archive.trade_id` (text) ↔ `vts_open_trades.id` (text). Both present. Far side is in `B70_TABLES` → hot 90 d → warm 365 d → **cold (never dropped)** ⇒ **the join target OUTLIVES anything we would archive here, so protecting the key is sound — now a claim with a verified condition, not an instinct.**

### ⚠️ THE NUMBER THAT LOOKED LIKE A FIRE
Closed `vts_open_trades` rows **39,377**; `exit_decision_archive` rows **6,770**; **matched 6,472** ⇒ only **16.4%** of closed trades have an outcome row. By week, coverage was **100% through 2026-06-22**, then **95.8 → 91.0 → 5.0 → 1.8 → 10.5%**, breaking in the **week of 2026-07-13** exactly as weekly closed volume jumped **656 → 7,136 → 22,270**. By class in July: **crypto_spot 4.2%** vs **xstock_spot 56.6%**.
⚠️ **This directly contradicted §2's "the OUTCOME is SAFE" and I was one step from reporting the outcome archive as broken.**

### ★★ THE CAUSE — READ THE CODE, AND IT IS BY DESIGN, IN LANGSTON'S OWN NAME
`vts-runner.ts:~3574` documents the **`reorg-B4` shadow close ALLOWLIST**: the shadow path writes ONLY `rtb_shadow_pairings` + its own `vts_open_trades` backing row + TEC state, and **"NEVER calls a learning store: ✗ outcomeFeedbackStore.updateEma ✗ telemetry.recordPairTelemetry ✗ vtsService.persistRealPriceTrade ✗ archiveExitDecision ✗ updateRollingAverages ✗ closed_trades"** — *"that allowlist (not denylist) is the by-construction closed-side segregation **Langston required at Step-2**."*
**CONFIRMED BY DATA:** `rtb_shadow_pairings` holds **29,465 rows spanning 2026-07-14 → 2026-07-28** — the same week the coverage "collapse" begins and very nearly the whole missing volume, and crypto-heavy, which is why crypto's coverage is the worse of the two.
⇒ **NOT a defect. Rule-24 outcome 2/3: working exactly as designed.** Shadow counterfactuals are DELIBERATELY excluded from learning stores so they cannot contaminate them, and they have **their own sink**.

### ★ WHAT THIS CHANGES IN THIS SCOPE — the blast radius is SMALLER than §2 stated, not larger
- **§2's "outcome is safe" holds — but it must be qualified BY POPULATION:** it is true for **REAL** closes (100% coverage before the shadow path began; the residual sub-100% weeks are the mixed population, not decay). It was never a claim about shadow rows, and I did not say so.
- **The ~30 k unarchived July rows are overwhelmingly SHADOW backing rows.** Deleting them at 90 days destroys a *backing row whose real record lives in `rtb_shadow_pairings`* — **materially less serious than "we delete 84% of our trade outcomes,"** which is what the raw 16.4% implies if quoted alone. ⚠️ **Do not quote the 16.4% without this paragraph.**
- ⏭ **ONE RESIDUAL, genuinely open:** `rtb_shadow_pairings` is itself in **no** sweep registry and has **no** GC that I could find — so it grows unbounded but **loses nothing**. Flagged for the catalogue, **not** for this batch.

**METHOD NOTE — why this is in the scope and not a quiet edit:** the 16.4% was real, measured, and would have been a *plausible, alarming, wrong* headline. What stopped it was reading the code before naming a cause (rule 24.a) and CC-B challenging an assumption I had asserted rather than tested. **A peer challenge to the weakest link in a scope is worth more than another measurement of its strongest.**

---

## 7. ★★ PROVENANCE READ (CLAUDE.md §2 MANDATORY 1.b, as amended at `9e9d427a7`) — AND IT REFRAMES THE BATCH

**CORPORA SEARCHED, named as the rule requires:** `BATCH_CATALOG.md`; `RUNNING_ISSUES.md` (searched by FILE and SYMBOL name, not by symptom); `git log -S "<symbol>" --reverse` **not path-limited**, so it survives the P19-B-RENAME family; the introducing commits' full messages. ⚠️ **`bridge/canonical/` NOT consulted for these two components and deliberately so — both postdate the 2026-01/02 governance change (2026-05-11 and 2026-05-05), so the pre-governance corpus cannot describe them.** Stating that rather than leaving the omission to be inferred.

### ★★ TIER 1 — `sweepClosedOpenTrades` (`vts-trade-persistence.ts`). **THIS BATCH CHANGES ITS BEHAVIOUR, SO IT GETS FULL PROVENANCE — AND THE PROVENANCE INVERTS THE SCOPE'S FRAMING.**
**ORIGIN: `79774aa51`, B79.0g-tx, 2026-05-11.** Intent **quoted verbatim from the introducing commit, not summarised:**
> *"Replaces the B79.0g fire-and-log close-time DELETE pattern with a closed-flag soft-delete + boot-time GC sweep. Resolves RUNNING_ISSUES #91."*
> *"NEW `sweepClosedOpenTrades` — boot-time CTE DELETE…RETURNING, HARD-FAIL with `[B79.0g-tx][CONFIG_MISSING]` log + null-return on missing module_constants row; does NOT halt boot."*

And the purpose stated in its own ledger entry (`RUNNING_ISSUES` #91), verbatim:
> *"Soft-delete is observability + bounded-history, not atomicity."*

★★ **THE FINDING THAT CHANGES THIS BATCH: BEFORE B79.0g-tx, CLOSED ROWS WERE DELETED AT CLOSE TIME. The sweep did not introduce deletion — it REPLACED AN IMMEDIATE DELETE WITH A 90-DAY-DEFERRED ONE.** ⇒ **this component is not the thing destroying trade history; it is the component that ADDED 90 DAYS OF RETENTION WHERE THERE WAS PREVIOUSLY NONE.**
⚠️ **§§1–2 of this scope frame the sweep as the destroyer** (*"HARD DELETE, NO ARCHIVE, and it is in NONE of the three registries"* — all true as facts about today) **and that framing is MISLEADING about intent.** The registry absence is not an oversight in the sweep; **the sweep was never an archival mechanism and was never designed to be one.** Corrected here rather than silently, because the wrong framing invites a "fix the sweep" scope when the sweep is doing exactly its job.
**DISPOSITION: (1) STILL RELEVANT AND CORRECT.** It bounds the history of a WORKING-STATE table, which is what it was built for and what it still does. ⇒ **the batch must NOT "repair" it.**
★ **THE ACTUAL GAP, restated honestly: no ARCHIVE LEG was ever built for this table.** That is a **missing capability**, not a malfunctioning component — and it is precisely rule 24's outcome **(2): working as designed, but nobody decided what should happen to the data before the bound.** ⇒ **A SCOPE CALL, not a repair.**

### ★ TIER 1 — `archiveExitDecision` / `exit-decision-archiver.ts`. **Behaviour changes only under candidate (B) (adding keys to its `state_snapshot` payload).**
**ORIGIN: `0dc7c470b`, B70 Step 3.2–3.6, 2026-05-05.** Intent verbatim from the introducing commit:
> *"Generic per-table buffered writer mirroring B74 pattern… registerArchiveTable + enqueueArchiveRow + getArchiveStats public API"* — i.e. a **capture-for-later-analysis layer**, per-domain archivers over a shared buffered writer, tiered by B75.
**DISPOSITION: (1) STILL RELEVANT AND CORRECT.** ⇒ **candidate (B) USES it as designed** — adding fields to a payload that already carries ~40 is not an amendment to the component's purpose. **That materially lowers (B)'s risk versus (A), which would add an export leg to the PLAIN retention path that has never had one.**

### TIER 2 — one-line intent notes (read or called, behaviour NOT changed by this batch)
- **`module_constants.data_lifecycle.*`** — the retention-knob SSOT (B75). Read-only here. **(1) correct.**
- **`b75-retention-sweep.ts` registries (`B74_TABLES` / `B70_TABLES` / `PLAIN_RETENTION_TABLES`)** — the tiering registrar. `vts_open_trades` is absent by history, not by exclusion decision. **(1) correct; the absence is the gap, not a fault in the registrar.**
- **`exit_decision_archive` + `state_snapshot`** — the surviving outcome record; already hot→warm→cold via `B70_TABLES`. **(1) correct.**
- **`logs/virtual_trades` JSON ledger** — ⚠️ **(2) RELEVANT BUT NEEDS UPDATING TO TODAY'S INTENT.** `HIDDEN_CONTEXTUAL_EDGE_STUDY_PLAN.md:39` designates it *"the durable long record"*, yet it has no tier, no manifest row and no backup (#601). **Any argument of the form "that field is safe, it survives in the JSON" is VOID until #601 resolves** — the basis on which Langston restored `chosen_entry_mode` + `entry_fee_rate` to the at-risk set.
- **`markOpenTradeClosed`** — the soft-delete writer, same B79.0g-tx origin. Untouched. **(1) correct.**

### DISPOSITIONS 3, 4 AND 5 — NOT USED, AND SAYING SO IS PART OF THE RULE
**(3) disconnected-and-should-reconnect:** none. **(4) connected-but-should-be-removed:** none — ⚠️ **explicitly NOT the sweep, per the Tier-1 finding above.** **(5) genuinely dead, stay disconnected:** none. **Nothing this batch touches is dead code.**

### ⚠️ NOT RECOVERABLE — MARKED `INFERRED-FROM-CODE`, NOT ESTABLISHED
**Why `vts_open_trades` was never added to a B75 registry.** B79.0g-tx introduced its retention knob 2026-05-11; B75's tiering predates it. **No commit message, scope, pre-audit or ledger entry states a decision either way** — searched by table name across `BATCH_CATALOG`, `RUNNING_ISSUES` and the B75/B-STORAGE-HARDEN scope set. ⇒ **the most likely reading is that the two were built in different batches and never reconciled — the SAME shape Langston found in the AMR friction thresholds (pool-basis fitted, universe-basis fed) hours earlier.** ★ **Marked INFERRED-FROM-CODE. Do not report it as an established decision, and do not report it as negligence: an unreconciled seam between two batches is the recurring failure mode here, not anyone's oversight.**

### ★ SEQUENCING CONSTRAINT (Langston 2026-07-30) — DO NOT SCOPE OFF TODAY'S DISK FIGURE
Alert `954d20b7` fires **2026-07-31T06:00Z** on the June partition drop. If it lands, the baseline moves from ~166 GB / 83.2% to roughly **110 GB**. ⇒ **scope Step 2's targets off the POST-SWEEP number or off the growth RATE, never off the current peak** — otherwise Step 2 is audited against a figure that expired two days earlier.

---

## 8. ★★ STEP 2 — PER-FIELD LOSS AGAINST ALL THREE STORES, AND THE HISTORICAL-READER QUESTION. **THE RESULT INVERTS THE PRIORITY RANKING.**

### ★★ FINDING 1 — `calibration_state` HAS TWO PROVEN HISTORICAL CONSUMERS, AND ONE READS THE EXACT TABLE BEING DELETED
This was ranked a *"genuine unknown"* in §2 and given lower priority than the maker/taker fields. **That ranking was wrong.** Measured at the read sites:
- **`exit-strategy-replay-service.ts` `resolveCalibrationState()`** — `SELECT calibration_state FROM vts_open_trades WHERE id = ${vtsOpenTradeId} LIMIT 1`. ⇒ **a HISTORICAL read of `vts_open_trades` BY ID.** ★★ **When the row is gone the query returns nothing and `?? null` swallows it — the function cannot distinguish "no calibration state" from "row deleted."** ⇒ **absent-as-valid, in the deletion path itself.**
- **`exit-strategy-ablation-aggregator.ts` `buildCalibrationClause()`** — `AND calibration_state IS DISTINCT FROM ${PRE_CALIBRATION_XSTOCK_TAG}`, i.e. **aggregates are FILTERED by calibration epoch.** ⇒ once rows are deleted, the rows that would have been EXCLUDED as pre-calibration are simply absent, **so the aggregate's population changes with no error and no signal.**
★ **BOTH FAIL SILENTLY.** Neither throws, neither logs a distinguishable state. ⇒ **`calibration_state` is the STRONGEST named-consumer case in this batch and should lead the IN list, ahead of the maker/taker fields.**

### ★ FINDING 2 — THE AT-RISK POPULATION IS **VTS-ONLY**. THE ACTIVE PATH ALREADY PRESERVES THREE OF THE SIX.
`closed_trades` (the active-path sink) carries **`chosen_entry_mode`, `entry_fee_rate` AND `calibration_state` as FIRST-CLASS COLUMNS**, populated **408/408 = 100%**, spanning 2026-07-15 → 07-29.
⚠️ **But `closed_trades` holds ACTIVE closes only — 408 rows against 39,377 closed `vts_open_trades` rows (~1%).** ⇒ **for VTS trades those three fields do NOT survive there.**
⇒ ★ **MATERIAL SCOPING REFINEMENT: the loss is VTS-only. The path going live already preserves all three in a columnar sink.** That lowers the stakes and it changes what the fix must target — **this is a LEARNING-CORPUS preservation question, not a live-trading-record question**, and §2 did not distinguish the two.
⚠️ **`closed_trades` is itself in NO B75 registry** (verified against the 13 catalogued in `STORAGE_POLICY.md` §9) ⇒ it grows unbounded. **Loses nothing, but it is uncatalogued — belongs to #601, not here.**

### THE THREE-STORE MATRIX, per field
| field | `exit_decision_archive.state_snapshot` | JSON ledger (`logs/virtual_trades`) | `closed_trades` (ACTIVE only) | historical reader? |
|---|---|---|---|---|
| `calibration_state` | ✗ 0/6,770 | ✗ absent | ✓ 408/408 (active) | ★★ **YES — 2, both silent-failing** |
| `chosen_entry_mode` | ✗ 0 | ✓ 214/214 ⚠️ store not durable (#601) | ✓ 408/408 (active) | none found |
| `entry_fee_rate` | ✗ 0 | ✓ 214/214 ⚠️ same caveat | ✓ 408/408 (active) | none found |
| `maker_limit_price` | ✗ 0 | ⚠️ 2/214 (0.9%) | ✗ | none found |
| `maker_deadline` | ✗ 0 | ✗ absent | ✗ | none found |
| raw `context` | ✗ 0 | ✗ absent | ✗ | none found |

⚠️ **"NONE FOUND" IS NOT "NONE EXISTS" — the search was narrow and I am marking its limit rather than asserting an absence.** I grepped `server/` for each field name intersected with `select|from|query|readFile|JSON.parse`. **That would MISS a reader that pulls the whole row and destructures it later, and it would miss any reader outside `server/`.** ⇒ **a proper census (§9.5(a): who reads, per field, repo-wide) is still owed before the IN list is final.** Recording this because an under-searched absence is exactly how the wrong five fields get protected and the right one dropped.

### ⇒ REVISED DISPOSITION FOR STEP 3
1. **`calibration_state` — IN, and FIRST.** Two historical consumers, both silently degrading, one reading the deleted table directly.
2. **`chosen_entry_mode` + `entry_fee_rate` — IN for VTS, but the justification CHANGES:** not *"the only record"* (the active path has them) but **"the only record FOR THE VTS LEARNING CORPUS"**, and their apparent survival in the JSON ledger is void until #601.
3. **`maker_limit_price` / `maker_deadline` / raw `context` — UNRESOLVED pending the repo-wide census.** No consumer found; the search was too narrow to conclude.
★ **AND THE CANDIDATE CHOICE IS NOW CLEARER: (B) denormalise-at-close targets exactly this** — three-to-six keys onto a `state_snapshot` literal that already writes ~40, in a component whose provenance disposition is *(1) still relevant and correct*. **(A)'s plain-path archive leg remains the right architectural fix for the CLASS and still carries no deadline.**

---

## 9. ★★ THE REPO-WIDE READER CENSUS I SAID WAS OWED (§9.5(a)). IT RESOLVES TWO OF THE THREE UNKNOWNS AND INDEPENDENTLY VINDICATES KYLE'S POOL-COLUMN DECISION.

**METHOD:** every read of `vts_open_trades` across `server/`, then the SELECT list of each — because a whole-row read hides its field consumers, which is exactly what §8's narrow grep would have missed. **Control: 14 files carry references; a zero would have meant a broken search.**

### ★ THE THREE 24-HOUR COUNT QUERIES ARE STRUCTURALLY IMMUNE — and that matters, because they look like consumers and are not
`routes.ts:7927`, `routes.ts:8111`, `routes/vts.ts:1691` are all `COUNT(*) FILTER (...)` aggregates over `opened_at > NOW() - INTERVAL '24 hours'`, reading only `signal_type` / `asset_class` / `opened_at`. ⇒ **a 90-day deletion cannot reach a 24-hour window. Not consumers of the at-risk data.** *(Worth stating: three of the four reads of the deleted table are irrelevant to the deletion, and a census that stopped at "who reads this table" would have counted them.)*

### ★★ THE FOURTH READ IS THE FINDING — `factor-replay-core.ts:167` CONSUMES RAW `context` **AND** `pool` HISTORICALLY
```
SELECT id, symbol, strategy, regime, pool, asset_class, opened_at, closed_at, context
FROM vts_open_trades WHERE closed = true AND opened_at >= ${sinceIso}
```
⇒ **it reads CLOSED rows over a historical window and pulls raw `context` and `pool` by name.** Its own comment states the purpose: it builds the **factor-replay + ablation LEARNING POPULATION**, with a shadow-exclusion filter *"without this filter the … learning population would silently absorb the full RTB-pool shadow set (a different population)."*
⇒ ★ **RAW `context` IS RESOLVED: IN. It has a named historical consumer — the learning population itself.** That was one of the three fields §8 left unresolved, and the narrow grep missed it precisely because this query names `context` in a whole-row-style SELECT list rather than in a `WHERE`.

### ★★ AND IT INDEPENDENTLY VINDICATES KYLE'S POOL-COLUMN RULING — measured AFTER his decision, not to justify it
Kyle ruled 2026-07-30 that the `pool` I/R column **STAYS** on all six trade tables, against CC-A's flag that it might be removable. **This query is the named historical consumer that proves the call:** `pool` is read from CLOSED rows into the factor-replay/ablation learning population. **Had the column been dropped, that learning path would have lost a dimension it reads by name — silently, since a dropped column in a named SELECT list is a hard error at the query but the *decision* to drop would have been made on "no consumer found."** ⇒ **his instinct was right and my flag was under-searched.**

### REVISED IN/OUT, with the evidence class for each
| field | verdict | basis |
|---|---|---|
| `calibration_state` | ★★ **IN — first priority** | 2 historical consumers, both silent-failing; one SELECTs it from the deleted table by id |
| raw `context` | ★ **IN** | `factor-replay-core.ts:167` — the ablation learning population |
| `chosen_entry_mode`, `entry_fee_rate` | **IN for the VTS corpus only** | no historical consumer found; active path already preserves them in `closed_trades` 408/408; JSON-ledger survival void until #601 |
| `maker_limit_price`, `maker_deadline` | ⚠️ **STILL NO CONSUMER FOUND** | census complete for `vts_open_trades` reads; **absence now has presence-evidence** (all four reads enumerated + their SELECT lists) — but a consumer reading them from the JSON ledger rather than the table would still be missed |
| `pool` | **NOT THIS BATCH — column retained by Kyle's ruling** | consumer identified above; recorded so the ruling has its evidence |

⇒ **STEP 3 READY on `calibration_state` + raw `context` + the two VTS-corpus fields, shaped as candidate (B).** ⚠️ **`maker_limit_price` / `maker_deadline` go to Step 3 as EXPLICITLY UNRESOLVED rather than silently included or silently dropped** — including a field with no consumer costs a key; dropping one with an unfound consumer costs the data, and only the second is irreversible. **Default: include them, and say why in the change list.**

> ⚠️⚠️ **TWO CORRECTIONS THAT WERE INVISIBLE UNTIL NOW — and the failure is instructive.** I first appended these as EXTRA CELLS on rows in the tables above. **GFM silently DROPS cells past the header count, so on GitHub the reader saw the corrected rows WITHOUT the corrections** — it rendered as exactly the silent edit I was trying to avoid (Langston, Step-4). They are prose now, below the table, where they render:
>
> - ⚠️ **"never-filled path only" WITHDRAWN — Langston verified `markPendingMakerFilled` sets `state='open'` and touches nothing else, so the columns SURVIVE the fill; the populated set is every maker row since B7.2c, filled and unfilled alike.**
