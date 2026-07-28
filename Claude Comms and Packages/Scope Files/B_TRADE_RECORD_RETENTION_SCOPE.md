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
| `chosen_entry_mode`, `entry_fee_rate`, `maker_limit_price` | **the ONLY record of maker-vs-taker entry policy** — lose them and entry-mode friction / Net-Expectancy attribution is **unrecoverable** | ★ **IN** |
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
