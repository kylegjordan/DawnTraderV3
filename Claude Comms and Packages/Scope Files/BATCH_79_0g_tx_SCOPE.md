# BATCH 79.0g-tx — Atomic close-time integration for VTS open-trade persistence

> **Status:** AWAITING LANGSTON STEP 1 REVIEW (architectural-design questions)
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Resolves:** RUNNING_ISSUES #91
> **Origin:** Langston B79.0g Step 4 F2 + Q5 deviation — atomic close-time integration deferred from B79.0g shipping commit, pinned as B79.0g-tx for future batch.

---

## 1. Why this batch + the open architectural question

B79.0g shipped persistence-at-trade-open (`vts_open_trades` table + INSERT-before-Map.set) but the trade-close path is fire-and-log async:

```
vts-runner exit loop
  → vtsService.persistRealPriceTrade(tradeData)   // JSON file write via logTrade(); B73 ablation replay async
  → (after return)
  → void import('./vts-trade-persistence.js').then(({ deleteOpenTrade }) => deleteOpenTrade(id))   // fire-and-log
```

If PM2 crashes between `persistRealPriceTrade` returning and `deleteOpenTrade` completing, the closed trade exists in JSON files (persisted by `logTrade`) AND `vts_open_trades` (still has the row). Rehydrate-on-boot would then re-add it to in-memory `openVirtualTrades` Map as if it were still open. Sub-millisecond inconsistency window in practice; PM2 restart cycle would clear orphans (next rehydrate cycle compares in-memory Map to current DB state — mismatch handled), but the architectural goal is true atomicity.

**The architectural question I need Langston to answer before scoping implementation:** what is "atomic" supposed to mean here?

### Option A — Atomic-DELETE only (REJECTED 2026-05-10 by Langston as a regression masquerading as a fix)

Move `deleteOpenTrade(id)` to BEFORE `persistRealPriceTrade` returns its `Promise<{persisted, mlTriggered}>`. There is NO shared Postgres-tx surface between the DELETE and the filesystem `logTrade` JSON write — they cannot be atomic with each other regardless of statement ordering. If the DELETE succeeds and the JSON write subsequently fails (process crash, disk full, etc.), the trade is **entirely lost from both DB and JSON** — no rehydrate recovery possible. Today's failure mode is a recoverable ghost-open row (JSON authoritative; rehydrate self-heals on next boot). Option A trades a recoverable race for an unrecoverable one. **Rejected.**

### Option B — Closed-flag soft-delete (intermediate)

Add `closed_at` timestamp + `closed` boolean to `vts_open_trades`. UPDATE row to `closed=true, closed_at=NOW()` instead of DELETE. Bootstrap-from-memory filters `WHERE closed=false`. UPDATE happens in same tx as JSON write triggers. Permits historical query of closed trades from same table. Periodic GC purges old `closed=true` rows.

### Option C — DB-backed closed-trades table (heavy, full vision)

New `vts_closed_trades` table. `persistRealPriceTrade` does INSERT-into-vts_closed_trades + DELETE-from-vts_open_trades in single Postgres tx. JSON file write happens AFTER tx commit (or as a sidecar). B73 ablation replay reads from `vts_closed_trades` instead of JSON file (substantial refactor — replay-ablation currently reads JSON).

### Option D — Minimal reorder (no architectural change)

Just move `deleteOpenTrade(id)` to BEFORE `logTrade`/JSON write inside `persistRealPriceTrade`. Same tx semantics as today (no Postgres tx wrapping JSON). Marginal improvement: ghost-row window narrowed but not eliminated.

**My read of the running-issue text** ("Plumb tx handle through `persistRealPriceTrade`, wrap close-time DELETE-from-vts_open_trades + INSERT-to-paper_sim_trades + B73 hooks + B70 archive in single tx") **suggests Option C was the original vision** — but the `paper_sim_trades` reference is probably wrong (paper_sim_trades is the active-trading paper-engine table; VTS doesn't write there). It should probably read `vts_closed_trades` (a NEW table this batch creates).

**My recommendation: Option B.** Lightest-touch atomic solution. No new table. Soft-delete pattern is well-understood. JSON files retained as-is for B73 replay path. Bootstrap-from-memory just filters `closed=false`. Future B79.x can promote to Option C if/when DB-backed closed trades have a real consumer (replay-ablation refactor, ML pipeline, etc.).

---

## 2. Numbered objectives (Option B — Langston-confirmed 2026-05-10)

1. **Schema migration:** add `closed_at TIMESTAMPTZ` + `closed BOOLEAN NOT NULL DEFAULT false` columns to `vts_open_trades`. **Plus partial index** `CREATE INDEX vts_open_trades_open_filter_idx ON vts_open_trades(id) WHERE closed=false` so the bootstrap filter `WHERE closed=false` stays performant as the table grows pre-GC (Langston rev #2). Forward + rollback SQL in `drizzle/migrations/`.
2. **Replace `deleteOpenTrade(id)` with `markOpenTradeClosed(id)`** in `server/services/vts-trade-persistence.ts`. UPDATE `closed=true, closed_at=NOW()` where id matches. Single Postgres UPDATE round-trip — atomic state flip from open→closed.
3. **`bootstrapOpenTradesFromMemory` + `rehydrateOpenTrades`** filter `WHERE closed=false` to exclude already-closed soft-deleted rows.
4. **Periodic GC sourced from `module_constants` (Langston rev #1):** new entry `data_lifecycle.vts_open_trades.closed_gc_retention_days` default `90`. Add a daily cron-style sweep (or boot-time sweep) that DELETEs `closed=true AND closed_at < NOW() - INTERVAL '<retention_days> days'` rows. Cold-start sync-read API (B72 pattern). Keeps table bounded; default 90 days = one quarter for forensic queries.
5. **vts-runner trade-close site:** **AWAIT** `markOpenTradeClosed(id)` BEFORE `persistRealPriceTrade` returns successfully (Langston rev #3). Same-DC Postgres UPDATE round-trip is sub-ms; the latency cost is negligible and the semantic becomes clean (no rehydrate races possible by construction). NOT fire-and-log.

---

## 3. Non-objectives + invariants

- **No change to JSON file format.** B73 ablation replay continues to read JSON.
- **No B73 fold-into-tx.** B73 ablation replay is fire-and-forget by design (async + uses imported service); folding into Postgres tx would change that semantic and add latency to every close. Out of scope for this batch.
- **No B70 archive fold-into-tx.** Same reasoning — async by design.
- **No active-trading path changes.** `paper_sim_trades` (active-trading) is untouched. Active trading is OFF until Phase 19.
- **Crypto regression: NONE by-construction.** vts_open_trades is asset-class-agnostic; the soft-delete pattern (or any of A/D) doesn't differentiate crypto vs xstock. No-touch fence preserved.
- **HARD-FAIL boot preserved.** Note: GC retention IS a DB-resolved setting per Langston rev #1 (sourced from `module_constants` per §11 / §8 #11 behavioral-knob discipline) — but it has a sensible default (90 days) and a missing row doesn't block trade-close hot path; only delays GC.
- **GC retention sourced from `module_constants`, not hardcoded literal** (Langston rev #4).

---

## 4. Verification (Step 7) — pending Option choice

Common across all options:
- G1 CI: Build + Docker green
- G2 schema verified via `\d vts_open_trades` (Option B or C only)
- G3 PM2 logs clean
- G4 crypto no-touch fence holds
- G5 first close-time event post-deploy verified: `SELECT closed, closed_at FROM vts_open_trades WHERE id = $1` returns `(true, <recent_ts>)` for a recently-closed trade (Option B); or row absent for Option A/D
- Bootstrap-from-memory regression-test: cold-start the server with `closed=true` rows in the table → verify in-memory Map stays empty (Option B) or table empty (Option A/C/D)

---

## 5. Open questions for Langston

Q1. **Which option (A/B/C/D)?** My recommendation is B. Justify your pick.

Q2. **Should B73 ablation replay stay fire-and-forget?** It's async by design today; folding into a Postgres tx adds latency + couples close-time to ablation persistence. My read: keep it out of scope for this batch.

Q3. **Should B70 archive enqueue stay fire-and-forget?** Same as Q2.

Q4. **Periodic GC for `closed=true` rows (Option B):** is 30-day retention right? Should it be longer for B73 replay window, or driven by a module_constants entry?

Q5. **Live trading window:** active trading is OFF until Phase 19, so the only real-impact close-time event today is VTS close. Is this batch even necessary now, or can it sequence after Phase 19 once active trading exposes the actual race window? Defer signal: my read is the architectural-cleanup is fine to land now even pre-Phase 19, since the pattern will be exercised by VTS closes from Monday 14:30 UTC ORB go-hot onward.

Q6. **Schema migration sequence:** apply schema migration + code together in single deploy (Option B has additive columns with safe defaults — no downtime), or split-deploy schema-first? My lean: single deploy for B/D; split for C (because C adds a new table consumer in the same path).

---

## 6. Scope sequencing

Pending Langston Q1 answer:
- **Option A or D:** ~5-10 line change. Combined Step 1+2 sufficient. Single commit.
- **Option B:** ~50-80 line change (schema migration + service-layer rename + bootstrap filter + GC sweep + tests). Separate Step 1 + Step 2.
- **Option C:** Multi-day batch with substantial pre-audit. Separate Step 1, 2, 3, 4.

---

## 7. Governance

- BATCH_CATALOG.md row for B79.0g-tx
- PHASE_HISTORY.md sub-batch row
- RUNNING_ISSUES.md #91 marked RESOLVED
- BATCH_79_0g_COMPLETION_REPORT.md post-closure addenda noting B79.0g-tx landed
- BATCH_79_0g_tx_COMPLETION_REPORT.md
- MEMORY.md (CC + Langston) — drop next-step pointer
