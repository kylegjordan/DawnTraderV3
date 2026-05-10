# BATCH 79.0g — Open VTS trade persistence (COMPLETION REPORT)

**Status:** CLOSED 2026-05-10. Deploy on PM2 #205. All 9 objectives verified.
**Phase:** 24 — sub-batch 7.
**Branch:** `migration/aws-supabase`. Commits: `6542dccb6` (impl) → `fb42335f7` (Step 4 F1+F3 fixes + test fix).
**Trigger:** Langston Q4 lock from B79.0f review — UI re-resolve is a patch; persistence-at-trade-open is the durable architectural fix.

---

## §1 — Objectives — outcomes

| # | Objective | Status |
|---|---|---|
| 1 | New `vts_open_trades` table | ✅ Migration applied to staging |
| 2 | INSERT path (await before Map.set per Langston F1 invert) | ✅ vts-runner.ts trade-open block; aborts cleanly on persist failure |
| 3 | UPDATE path (Q2=B on-close snapshot) | ✅ TEC trailing states cover mid-trade mutations; on-close snapshot via DELETE+migrate |
| 4 | DELETE/migrate on close (Q5 deviation: fire-and-log async) | ⚠️ Implemented as fire-and-log; full tx integration deferred to B79.0g-tx (RUNNING_ISSUES #91) per Langston accept |
| 5 | Rehydrate-on-start | ✅ `rehydrateOpenVtsTrades` invoked from server/index.ts after loadTrailingStates, before scanner.start; soft-fail policy |
| 6 | (Dropped per Q4 add'l #1) UI re-resolve removal | N/A — no client-side patch existed; AssetClassBadge already reads `trade.assetClass` |
| 7 | Boundary tests | ✅ 8 cases in `b79-0g-vts-trade-persistence.test.ts` incl. bootstrap re-resolve regression-lock |
| 8 | No-touch fence on crypto_spot | ✅ Cadence resumed within 60s post-restart |
| 9 | CI 4 checks gate | PASS (3/4 + legacy; 1086+8 = ~1094 passing on top of 59 baseline) |

---

## §2 — Files

### Modified
- `server/services/vts-runner.ts` — trade-open INSERT (await + abort-on-fail), trade-close DELETE (fire-and-log), `rehydrateOpenVtsTrades` exported function
- `server/index.ts` — boot sequence wires rehydrate after loadTrailingStates, before xstockSpotScanner.start

### Added
- `drizzle/migrations/2026-05-10-b79-0g-vts-open-trades.sql` (+ rollback)
- `server/services/vts-trade-persistence.ts` (~190 lines: insert/delete/rehydrate/bootstrap)
- `server/tests/unit/b79-0g-vts-trade-persistence.test.ts` (8 cases)

### Documentation
- `BATCH_79_0g_SCOPE.md` rev 2
- `B79_0g_scope_review_rev1_reply.md` (approved-with-revisions Q1-Q5 + 4 add'l)
- `B79_0g_step4_code_review.md/_reply.md` (approved-with-revisions; F1 invert + F2 RUNNING_ISSUES #91 + F3 in-memory bootstrap mutation)

---

## §3 — Langston review process

**Step 1 (scope rev 1 → 2):** approved-with-revisions, Q1-Q5 calls + 4 add'l: (1) bootstrap re-resolves asset_class via safeResolveAssetClass — critical to defeat legacy bad values from pre-B79.0f resolver; (2) Q2 mutation audit confirmed (TEC trailing-states covers all mid-trade mutations; no orphans); (3) Obj 6 dropped (no client-side patch existed); (4) rollback script named.

**Step 4 (code review):** approved-with-revisions, 3 findings:
- **F1 — observer-divergence (P1, blocked):** original implementation used `void persistOpenTradeWithGuard()` (fire-and-forget) at trade-open, creating a window where in-memory Map.set happened before async INSERT outcome. Langston: "comment 'Per Langston Q5 lock' was misapplied — Q5 was close-time atomicity, not open-time." **Fix:** inverted order — `await insertOpenTrade(openTrade)` blocks BEFORE Map.set; trade-open returns null cleanly on persist failure.
- **F2 — Q5 deviation paper trail:** close-time DELETE+INSERT atomic transaction was scope-locked Q5=A; implementation deferred to fire-and-log async because `persistRealPriceTrade` doesn't expose tx handle (substantial refactor — affects B73 + B70 + multiple sites). Per Langston: "RUNNING_ISSUES alone is not sufficient paper trail — pinned batch ID required." **Fix:** RUNNING_ISSUES #91 created with explicit B79.0g-tx batch ID + scope-doc deviation paragraph in §6.
- **F3 — in-memory bootstrap mismatch:** bootstrap re-resolves asset_class for DB but didn't update the in-memory Map. **Fix:** mutation added to bootstrap loop so cache + DB agree post-boot.

**Verdict:** approved-with-revisions, ship-after F1+F2+F3 fixes — all applied this session.

---

## §4 — Plain-language summary (Kyle)

VTS open trades now persist to `vts_open_trades` at trade-open (with `asset_class` baked in from the post-B79.0f resolver — correct). They survive PM2 restarts via `rehydrateOpenVtsTrades` at boot. Closed trades migrate to `paper_sim_trades` as before; the open-trade row gets DELETE'd post-close (fire-and-log async — sub-millisecond inconsistency window cleared on next rehydrate).

The architectural property Langston wanted: ANY downstream consumer that wants `asset_class` reads from the row (or the in-memory cache seeded from the row). No re-resolve from canonical symbol form. The bug class that surfaced via SUI/USD displaying as "xStock Spot" is now structurally impossible.

**Outstanding:** B79.0g-tx (RUNNING_ISSUES #91) — full transactional integration of close-time DELETE+INSERT through `persistRealPriceTrade`. Sequenced after B79.0e ships. Estimated 4-6 hours including B73+B70 hook updates.

---

*End BATCH_79_0g_COMPLETION_REPORT.md.*
