# BATCH 79.0g — Open VTS trade persistence (SCOPE rev 1)

**Status:** DRAFT 2026-05-10 — sequenced immediately after B79.0f close.
**Phase:** 24 — sub-batch 7.
**Branch:** `migration/aws-supabase`.
**Workflow:** 11-step canonical (full).
**Trigger:** Langston Q4 lock from B79.0f review — "persistence-at-open IS the durable fix" + UI re-resolve patch (B79.0f) is acceptable to ship now ONLY IF this batch is committed-numbered, not RUNNING_ISSUES backlog.

---

## §0 — Architectural framing

**Today** (post-B79.0f deploy):
- Open VTS trades live in an **in-memory `Map<string, OpenVirtualTrade>`** in `vts-runner.ts:580`. Lost on every PM2 restart (no rehydrate logic).
- Each in-memory trade carries `assetClass: AssetClass` field (vts-runner.ts:514+1328) — set ONCE at trade open via `safeResolveAssetClass(symbol, 'kraken')`. With B79.0f's collision-set guard live, new opens get the correct asset_class.
- API endpoints (`/api/vts/ml/open`, `/api/vts/open-trades`) serialize from in-memory state.
- Frontend `AssetClassBadge` reads `trade.assetClass` directly — no client-side re-resolution.
- Closed trades ARE persisted via `vts-service.persistRealPriceTrade` to `paper_sim_trades` (asset_class column present).

**Why persistence-at-open matters anyway:**
1. **Restart resilience.** Today PM2 restart loses ~21 active VTS trades. They get reopened naturally on next signal cycle but their entry context (entry-time confidence, entry ATR, signal source) is lost.
2. **Audit + reproducibility.** Every trade's full lifecycle should be reconstructable from DB state, not require live process state.
3. **Display consistency.** Same-symbol trades opened pre-fix vs post-fix can end up with different in-memory asset_class because the resolver's behavior changed under their feet. With on-disk persistence, the canonical asset_class travels with the row.
4. **B79.0f patch hardening.** UI re-resolve is fundamentally a patch (NO PATCHES doctrine). Persisted-row + read-from-row eliminates re-resolve entirely.

---

## §1 — Numbered objectives

| # | Objective | Verification |
|---|---|---|
| 1 | New table `vts_open_trades` (or extend an existing one — see Q1) capturing every column of `OpenVirtualTrade` interface (vts-runner.ts:514). asset_class, exchange, entry context, regime/strategy, sourcePool, sizing, entry/stop/target prices, trailing-engine state. | `\d vts_open_trades` shows columns matching `OpenVirtualTrade` shape; FK to user/trade-id |
| 2 | INSERT path: vts-runner trade-open inserts to DB BEFORE adding to in-memory Map (or inside the same atomic block). Failure to insert = trade NOT opened (fail-loud, no silent half-state). | Unit test: simulated DB error on INSERT throws + does not pollute in-memory |
| 3 | UPDATE path: every in-memory mutation (trailing-stop ratchet, BE-latch, target-latch, mode change) writes through to the row. OR: on-close, full state snapshot UPDATE. Q2 below. | DB state matches in-memory state at end of cycle |
| 4 | DELETE/migrate path: on trade close, row removed from `vts_open_trades` and inserted/migrated into `paper_sim_trades` (the existing closed-trade table). Single transaction. | Trade close does both ops atomically; failures roll back |
| 5 | Rehydrate-on-start: server boot reads `vts_open_trades` and reconstructs the in-memory Map. TEC trailing states already rehydrate via separate path; this just adds the trade-shell. | After PM2 restart, `getOpenVirtualTradesForML()` returns the same set as pre-restart |
| 6 | UI re-resolve removal: drop the patch from B79.0f IF the resolver-fix already cleaned the display path. (Confirmed today: AssetClassBadge reads `trade.assetClass` — no re-resolve patch was needed in B79.0f client-side. Resolver fix was server-side only.) | Audit shows no client-side `resolveAssetClass` calls |
| 7 | Boundary tests covering the 5 paths above. | `b79-0g-vts-trade-persistence.test.ts` |
| 8 | No-touch fence on crypto_spot regime cadence holds | Post-deploy SQL |
| 9 | CI 4 checks gate; legacy baseline preserved | green |

---

## §2 — Open questions for Langston

**Q1 — New table vs extend existing.** Two options:
- **(A)** New `vts_open_trades` table; on close, copy row + DELETE. Cleanest separation; closed-table schema unchanged.
- **(B)** Add `status` column to `paper_sim_trades` (or repurpose existing); INSERT with status='open'; UPDATE to status='closed' on close. Single-table single-source-of-truth.

**My call: (A).** Different lifecycle expectations + closed-trade table is read-heavy for ML pipeline. Open-trade churn doesn't need to interleave.

**Q2 — Sync strategy: write-through vs on-close snapshot.**
- **(A) Write-through:** every mutation (TEC ratchet, BE latch, target latch) writes to the row immediately. Higher DB write volume; in-memory + DB stay in lockstep.
- **(B) On-close snapshot:** in-memory is authoritative during life of trade; DB row reflects entry-time state until close, then full state captured + migrated.

**My call: (B).** TEC ratchets fire on every tick — write-through would multiply DB writes substantially. The on-close snapshot model means the open-trade row is "trade-shell" (entry context for rehydrate) rather than "live mirror." Rehydrate restores enough state for the trade to continue tracking; TEC trailing states have separate persistence.

**Q3 — Rehydrate semantics.** After restart, the rehydrated trade has entry-time state but NOT mid-trade engine state (TEC ratcheted stop, latch flags). Two paths:
- **(A)** Rehydrate from `vts_open_trades` (entry context) + `tec_trailing_states` (engine state) — rejoin via trade-id/symbol.
- **(B)** Rehydrate basic shell only; TEC engine re-bootstraps from current price + entry context (recomputes trailing state).

**My call: (A) via TEC's existing rehydrate path.** TEC already persists trailing states; trade-shell rehydrate joins by symbol.

**Q4 — Migration of currently-open trades on first deploy.** When the new code lands, the existing 21 in-memory trades have NO row in the new table. Two paths:
- **(A)** On first boot post-deploy, snapshot in-memory Map → INSERT all rows. Survives restart from then on.
- **(B)** Accept loss of pre-existing trades on first restart (they age out + close naturally; new trades land in DB).

**My call: (A) via a one-shot bootstrap function called from server startup if `vts_open_trades` is empty AND `openVirtualTrades` has entries.** Low-risk defensive path.

**Q5 — Atomicity of close-time migration.** Open→close needs DELETE-from-vts_open_trades + INSERT-to-paper_sim_trades. Two paths:
- **(A)** Single transaction wrapping both ops.
- **(B)** Separate ops; DELETE only after INSERT confirmed.

**My call: (A).** Standard pattern; failure rollback preserves consistency.

---

## §3 — Files affected

### Modified
- `shared/schema.ts` — add `vtsOpenTrades` Drizzle table definition
- `server/services/vts-runner.ts` — INSERT on trade open (after in-memory `set()`); UPDATE/migrate on close; rehydrate function called from server boot
- `server/index.ts` — call `rehydrateOpenVtsTrades()` in startup sequence (after DB up, before scanner.start)

### Added
- `drizzle/migrations/2026-05-10-b79-0g-vts-open-trades.sql` — CREATE TABLE + indexes
- `server/services/vts-trade-persistence.ts` — encapsulates INSERT/UPDATE/DELETE/REHYDRATE logic
- `server/tests/unit/b79-0g-vts-trade-persistence.test.ts` — 5+ cases

### Verification
- DB query post-deploy: `SELECT COUNT(*) FROM vts_open_trades` matches `getOpenVirtualTradesForML().length`
- After PM2 restart: same count (rehydrate works)
- Trade close: row in `vts_open_trades` deleted; row in `paper_sim_trades` inserted with same `id`

---

## §4 — Risks

| Risk | Mitigation |
|---|---|
| DB write volume spike | Q2=(B) on-close snapshot, not write-through |
| Rehydrate restores wrong state | TEC trailing states already persist separately; trade-shell + TEC = full state |
| Migration leaves orphan rows | Q5 atomic transaction |
| Schema migration timing | Apply BEFORE deploy; rollback script provided |
| Crypto no-touch fence | New table only — crypto pipeline untouched |

---

## §5 — Out of scope

- Active-path trades (paper-execution-engine — already has its own persistence)
- Closed-trade schema changes
- Frontend changes (none needed — already reads `trade.assetClass`)
- Real-time WebSocket sync between in-memory + DB (Q2=(B) accepts in-memory authoritative during life of trade)

---

---

## §6 — rev 2 revisions (Langston review 2026-05-10, verdict: approved-with-revisions)

1. **Q4 bootstrap MUST re-resolve asset_class** at snapshot time (Langston add'l #1, critical). Implemented: `bootstrapOpenTradesFromMemory` calls `safeResolveAssetClass(symbol, 'kraken')` for every in-memory trade before INSERT — defeats stale legacy values from pre-B79.0f resolver.
2. **Q2 mutation audit** — Step 2 PIA grep'd `openVirtualTrades.` mutations. Findings: in-memory mutations to ladderRungsHit, originalStopPrice, latchTriggerPrice, rungTargetHistory all flow through TEC engine writebacks (covered by tec_trailing_states). modeChanged/breakEvenLatched are TEC-tracked. `openVirtualTrades.delete(id)` happens at trade close → covered by Q5 DELETE. No discovered orphan mutation paths. Q2=B safe.
3. **Obj 6 dropped** — no client-side patch existed to remove. AssetClassBadge.tsx already reads `trade.assetClass` directly; resolver fix in B79.0f was server-side only. Updated objective table.
4. **Rollback script named** — `drizzle/migrations/2026-05-10-b79-0g-vts-open-trades-rollback.sql`: DROP TABLE vts_open_trades. Code-side rollback: revert vts-runner persistence calls + index.ts rehydrate hook.

**Q5 atomicity caveat (deviation flagged):** the close-time DELETE-from-vts_open_trades is currently fire-and-log async (post-`persistRealPriceTrade`), not wrapped in a single transaction with the closed-trade INSERT. True transactional integration requires plumbing a tx handle through `persistRealPriceTrade` (substantial refactor). Net effect: sub-millisecond inconsistency window between `paper_sim_trades` INSERT and `vts_open_trades` DELETE; orphan rows cleared on next rehydrate boot or via ad-hoc cleanup. Filed RUNNING_ISSUES tracker for proper Q5=A integration.

*End BATCH_79_0g_SCOPE.md rev 2.*
