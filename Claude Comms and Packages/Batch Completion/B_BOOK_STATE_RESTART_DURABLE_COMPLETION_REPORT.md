# B-BOOK-STATE-RESTART-DURABLE — Completion Report

change-class: `architecture` · sprint plan row 15 · Phase-19 row `3n.q8` · `#1066` · owner CC-C (Analyst Claude) · ⏳ **STEP 11 — closes on Langston's confirm**

**Scope items left open:** none in this batch. **One related item is homed elsewhere and is NOT claimed here:** how long a seed-implausible chain stays absorbing is reported by nothing — the `#1066` amendment of 2026-10-06, re-homed 2026-10-09 to `SPRINT_TO_LIVE_PLAN` row 2 (`B-XSTOCK-BID-TRIGGER-RELAND`, owner CC-C).
⚠️ **Late close, stated:** deployed 2026-10-06 and Step-8-confirmed then; Steps 10-11 sat owed through the crew's two-week break and were written 2026-11-05 under KD-43 (Kyle: complete governance at every batch end).

## 1. What it was for
The xStock book-state guard judges each new reference chain's first frame against a retained spread ring — the trailing spreads of the symbol's last plausible, moving chain (SIM S25b). That ring lived in memory only. A restart emptied it, and a seed with nothing to judge against is vacuously plausible, the permissive direction: on 2026-09-19 a restart during the market-wide post-close blowout validated ANET/USD's 32%-wide book and closed it `stop_hit` 12 s later — a false stop (`#1066`). This batch makes the ring survive a restart.

## 2. What shipped
- `server/asset_classes/xstock_spot/book-state-tracker.ts` — `retainsRing` (the ONE write predicate, now used by the clear and by the snapshot), the typed S25b entry (spreads, seed basis, write time, restored flag), `snapshotRetainableRings`, `restoreRetainedRings`, the `RESTORED_RING_CONSUMED` line.
- `server/asset_classes/xstock_spot/book-state-ring-store.ts` (new) — 30 s snapshot, shutdown flush (5 s cap), boot restore with per-row validation, the whole-store alert `book-state-ring-restore-failed` and the repeated-failure alert `book-state-ring-snapshot-failing`, the `RING_RESTORED` line. **Upsert-only — no delete path** (Step-4 r3).
- `server/index.ts` — restore and snapshot start **before `resumeActiveEngines()`**; the flush beside the trailing-state flush.
- `shared/schema.ts` + `drizzle/migrations/2026-09-24-b-book-state-restart-durable.sql` (+ rollback, both in git; `MANIFEST.txt`) — table `xstock_book_state_rings`.
- `server/tests/unit/b-book-state-restart-durable.test.ts` (new) — 20 cases on the real tracker; 7 mutations, all killed.
- Code `f07c86c37` → Step-4 rounds to `d7d8d509d` (approved; record `94b80463f`). CI `36016582885` on `d7d8d509d`: Test Suite, TypeScript Check, Build, Docker Build — all success.
- Deployed in release deploy B, `3576d39810fa7428501b68ce341ee46533c24935`, 2026-10-06T15:45:04Z (`dt-deploy --by cc-b`).

## 3. Objectives
| # | objective | result | evidence |
|---|---|---|---|
| 1 | The store holds, per symbol, the ring a clear would leave behind now, through ONE predicate | **YES** | `retainsRing` used by `clearBookStateComparator` and `snapshotRetainableRings`; tests on the real tracker; bypassing the predicate in the snapshot fails a test (change list, Step 4) |
| 2 | Restored at boot before the first xStock exit frame; never worse than today | **YES** | restore wired before `resumeActiveEngines()` (`server/index.ts`); boot test reads `retainedMedianNow` ≠ `none`; corrupt-store test falls back and alerts; live `RING_RESTORED` line every boot. ⚠️ Both failure alerts (`book-state-ring-restore-failed`, `book-state-ring-snapshot-failing`) have **never minted a row** — 0 of 2,862 queue rows (Langston, Step 11) — so those arms are verified by tests only; no live silence is citable for them |
| 3 | Provenance recorded, not gated | **YES** | every boot line splits `judged`/`vacuous` (2026-11-05 14:39Z: `judged=138 vacuous=115`); test asserts the bit follows the seed basis |
| 4 | Net effect on the r6 hole stated, not assumed | **YES** | Step 2 measured both sides (pre-audit A12); Step 7 recorded ring age at the deploy-B boot (p90 1557.8 min) — and age is not capped, by design |
| 5 | Durable store chosen and its loss bound stated | **YES** | option (a), a table, migration + rollback in git; cadence 30 s; shutdown flush measured on 4 of 4 graceful exits (`369d66633`, FINDING-1 discharged) |
| 6 | Verified on a real restart; operator rule replaced in the System Manual | **YES** | P9 on the deploy-B restart: `RING_RESTORED n=3`, `RESTORED_RING_CONSUMED` 2 of 2 `verdict=plausible`, `verdict=not_judged ringDeleted=true` = 0 (`Change Lists/RELEASE_DEPLOY_B_STEP7_CCC.md`); Langston CONFIRMED the restart leg (Step 8). Since then: the 12 boots of 2026-11-04 12:13Z → 11-05 14:39Z — eleven deploys of eleven different builds plus one unplanned restart (11-04 18:16Z, 11 min down, 251 rings restored) — all restored with 0 invalid and 0 not-loaded rows; there was no restart between 2026-10-20 and 11-04, so the evidence is two clusters, the deploy-B restart and this 26-hour run. System Manual §3.5.1a: the "do not restart in a blowout" caution retired (this close) |
| 7 | Calibration line | **YES** | **impact NAMED, not epoch-bumped** (Langston, Step-2 C2): refusing a seed changes when a stop fires, so "no calibration impact" was withdrawn as false; no bump, because a bump resets every xStock aggregate, would have been a second reset inside `B-XSTOCK-FEE-CONTRACT`'s window, and the contamination removed was measured small. Recorded as a precedent under `ADJUSTMENT_FRAMEWORK` epoch rule 2 |

## 4. Reviews
Step 1 scope r1 APPROVED (Langston 2026-09-24 13:40Z, `6e2c5ec20`) · Step 2 PROCEED (14:02Z, `d4c3c90b9`, conditions C1-C4) · Step 4 r1 CHANGES-NEEDED → r2 → r3 APPROVED at `d7d8d509d` · Step 8: restart leg CONFIRMED 2026-10-06 22:50Z; the live-refusal bullet sent back twice and re-issued (`cd090a153`, `ef0d53e19`).

## 5. Numeric corrections
None to this batch's own numbers. Two Step-7 statements were corrected at Step 8 and carry `MISTAKE: wrong-object` trailers (`cd090a153`: a 40-tick sample reported as the whole HUT refusal episode; `ef0d53e19`: "no alarm on HUT" — the onset was alarmed). Both counted in the W42 mistake pass.

## 6. New findings / dispositions
- **The absorbing state has no duration report** (`#1066` amendment, HUT/USD and ALB/USD, 2026-10-06/07). `DISPOSITION: added to B-XSTOCK-BID-TRIGGER-RELAND — SPRINT_TO_LIVE_PLAN row 2` (re-homed 2026-10-09, Kyle: one batch).
- **The r6 residual — persistence lengthens a contaminated ring's life** (§8). `DISPOSITION: added to B-XSTOCK-BID-TRIGGER-RELAND — SPRINT_TO_LIVE_PLAN row 2 increment (1)`: its refusal-duration report also carries the restored-ring age and provenance counts (Langston's Step-11 recommendation; folded into agreed work, no new slot).
- **Trailing-exit state loads after the engines resume** (pre-audit §2b, a hypothesis). `DISPOSITION: added to 3n.c B-TRAILING-STATE-DURABILITY, Step 1 item` (unchanged).

## 7. Governance ledger
CHANGE-CLASS: `architecture`

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what it fixed, how, the restart result, `#1066` closed |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 15) | ✅ | row 15 at STEP 11 with this report linked; the §5 CC-C line brought current |
| T1 | PHASE_19_PLAN.md (row `3n.q8`, in flight there) | ✅ | the row finished: Step 11, report linked, residual named |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ mine / N/A shared | mine: position line; no shared truth changed |
| T1 | the batch SCOPE | ✅ | written at Step 1 (r1; class re-declared to `architecture` at Step 4) |
| T1 | the batch PRE_AUDIT | ✅ | written at Step 2 (r2) |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | Observation column | N/A | the scope's one observation (P9's restart read) was read at Step 7 and confirmed at Step 8; nothing waits |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-C: rows 14 · 15 brought current, row 15 at Step 11 |
| T1 | Langston's MEMORY.md | ✅ | closure line added; the valve section's heads/CI and its now-stale board-drift line removed — part `1a0c6bc90616`→`d13ee79f2909`, −61 B (`MEMORY.md` 74,835 → 74,774 B); `langston-size-watch --status` at 2026-11-05 ~21:30Z, after later writes by others: **143,779 B** against the 143,856 ceiling |
| T2 | SYSTEM_MANUAL.md | ✅ | §3.5.1a: the restart caution retired; the persistence mechanism, its failure modes and the measured restarts written in |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | S25b's restart hole marked closed; new row S25c for the table, its writers, reader and bounds |
| T2 | RUNNING_ISSUES.md | ✅ | `#1066` closed, residual pointed at row 2 |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-11-05-B |
| T2 | ADJUSTMENT_FRAMEWORK.md | ✅ | epoch rule 2 gains the "impact named, not epoch-bumped" form, with this batch as its precedent |
| T2 | GOVERNANCE_EXCEPTIONS.md | BLOCKED — Langston's Step-11 confirm | the 2026-09-29 `open` row flips to closed when the confirm lands, as the `B-SIZING-DEC-RESTORE` rows did |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed — the diff adds two files and a table and deletes no code path |
| T2 | MISTAKE_PATTERNS.md | N/A | the batch's two `wrong-object` trailers fall in the W42 pass window (`be41f85..780a206`) and were counted there |
| T2 | POST_AUDIT_ROADMAP.md · AUTHORITY_BASELINE.md · STORAGE_POLICY.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · rule history · ALERT_HANDLING_PROTOCOL.md · DELIVERY_BOARD_PROTOCOL.md · CLAUDE_CODE_FEATURE_WATCH.md | N/A | no phase-level, constitutional, retention-policy, method, reviewer-build, rule or process change — one xStock exit-guard store |

⚠️ **STORAGE_POLICY judged, not skipped:** the new table is upsert-only, one row per symbol (253 rows at 2026-11-05), bounded by the xStock universe — no retention tier is needed.

## 8. Honest residual
- **Rings carry no age cap, by design** (S25b: staleness is not the hazard, provenance is). At the 2026-11-05 14:39Z boot the restored rings' last feed frames were p50 ≈ 8.5 days old. A stale healthy ring fails refusing; a contaminated one fails open, and persistence lengthens a contaminated ring's life — the r6 hole, made countable here and homed in row 2 increment (1) (§6). The shape is already visible: at that boot `live=17 retained=236`, so 93% of what the store re-persists is an old ring rather than a live chain's.
- **`RING_RESTORED n` is a census, not coverage** — with no delete, it includes symbols no longer traded.
- **The restart evidence is two clusters 29 days apart:** the deploy-B restart (10-06) and twelve boots in one 26-hour run (11-04 12:13Z → 11-05 14:39Z). There was no restart between 2026-10-20 and 11-04 (staging reflog), so nothing in between was exercised.
