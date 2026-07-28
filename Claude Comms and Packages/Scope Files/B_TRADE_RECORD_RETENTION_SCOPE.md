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
