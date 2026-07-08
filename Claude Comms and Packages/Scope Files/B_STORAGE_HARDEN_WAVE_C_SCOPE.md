# B-STORAGE-HARDEN — Wave C Scope (OBJ-2): extend never-delete tiering to the B70 analytics tables

change-class: architecture
**Owner:** CC-A (OLD Claude) · **Reviewer:** Langston · **Parent batch:** B-STORAGE-HARDEN (Wave A closed 2026-07-08; this is the core never-drop fix)
**Date:** 2026-07-08 · **Home:** RUNNING_ISSUES #430 (V1 — the B70 DROP-only violation)

> **What this fixes:** the 5 B70 analytics tables are DROP-only at 90 days (`b70-retention-sweep.ts`), which violates Kyle's 2026-05-06 "we don't ever drop data" directive. Wave A confirmed this + PAUSED the DROP cron; Wave C makes the fix permanent by routing these tables through the SAME proven B75 export→warm→cold move-not-delete path, then retiring the B70 DROP.

## 1. Live findings (staging, 2026-07-08 — the evidence this wave acts on)
All 5 B70 tables are **monthly RANGE-partitioned by `captured_at` (timestamptz)** — identical shape to the B74 tables the B75 sweep already tiers. Sizes + risk:

| Table | Size | Keep decision | Note |
|---|---|---|---|
| `signal_eval_archive` | 25.6 GB (~14.5 GB/mo) | **KEEP** | the exact Phase-25 calibration data (`features`/`gate_decision`) B-NEW-53 populated cleanly |
| `pair_scan_archive` | 8.4 GB | **KEEP → cold** | Langston Step-1 (Wave A): net expectancy favors keep; producer-agnostic raw scan substrate |
| `signal_eval_provenance` | 4.2 GB | **KEEP** | B-NEW-53 forming/settled-bar provenance |
| `macro_feed_archive` | 0.04 GB | **KEEP** | tiny |
| `exit_decision_archive` | 0.02 GB | **KEEP** | tiny; realized-trade outcomes (learning) |

**No table is dropped — all 5 preserved (never-drop directive).** **★ Zero partitions are past 90 days today** (oldest data = 2026-05; earliest 90d-eligibility ~2026-09-01), so there is NO at-risk data right now and NO urgency — we build + test before any real move, and the paused DROP was never going to fire before ~September anyway.

## 2. Design (reuse the proven B75 machinery — no new archival engine)
The B75 `b75-retention-sweep.ts` already exports monthly-partitioned tables → warm (export → upload → download-verify → DROP-only-after-verify), with adaptive per-day slicing for large partitions, streamed I/O, the crash-safe manifest state machine, and failure→§10.5 alerts. Its `B74_TABLES` inventory is a list of `{parent, timestampColumn, retentionConstantName}`. **The B70 tables fit that shape exactly** (`timestampColumn='captured_at'`).

**OBJ-2 changes:**
1. **Add the 5 B70 tables to the B75 sweep's partitioned-archive inventory** (each: `parent`, `timestampColumn:'captured_at'`, `retentionConstantName`). They then get export→warm→move-not-delete on the same daily 02:15 cron. The adaptive slicer handles the big ones (signal_eval_archive June = 14.5 GB > the 3 GB slice threshold → per-day slices, exactly as designed for the 31 GB ticker partition).
2. **Seed per-table `data_lifecycle.<table>.hot_retention_days` = 90** (matches the current B70 drop boundary — same hot-disk footprint, but the partition now lands in warm instead of vanishing). The sweep's `reqNum()` fails hard if a key is missing, so **these rows MUST be seeded before the new code deploys** (migration ordering).
3. **`b75-cold-rotator.ts` needs NO change** — it's table-agnostic (rotates any warm manifest row past `default_warm_retention_days`=365 to cold). So B70 warm objects roll to cold automatically at 365 d, `pair_scan_archive` included.
4. **RETIRE `b70-retention-sweep.ts`** (the DROP-only script) per CLAUDE.md rule 18 — delete it + remove its (currently-paused) cron line + archive to `_archive/deleted-code/*.removed` + `DELETED_COMPONENTS_LOG.md` entry. Blast-radius: it's a standalone cron script, zero in-app callers (verify via grep + tsc). `b70-create-monthly-partitions.ts` STAYS (create ≠ drop — the tables still need forward partitions).
5. **Archival-health watchdog:** the B70 tables now flow through `b75-retention.log`, so the existing `b75-retention` watchdog check already covers them; update the watchdog's "b70 skipped while paused" note to "b70-retention retired; tables tiered via b75 sweep" (the standalone b70 cron no longer exists).
6. Drop the `b70_postgres_retention_days` global constant from active use (superseded by per-table `data_lifecycle` keys) — leave the row or remove it (decide in Step-2; the deleted sweep was its only reader).

## 3. What this needs from Kyle
- **Per-table keep-vs-drop:** default KEEP all 5 (recommended). `pair_scan_archive` → KEEP to cold (Langston Step-1). **Confirm at close** (the one Wave-C Kyle decision flagged in the Wave-A summary).
- **Hot-retention window:** proposed 90 d (unchanged from the drop boundary — preserves the current hot footprint, just stops deleting). Shortening it (more hot-disk relief) is a separate lever = OBJ-3/OBJ-4 (Wave D). Kyle can override the 90 d if he wants more immediate hot relief now.

## 4. Verification criteria (Step-7)
- A B70 analytics partition past its (test-lowered) retention is EXPORTED to warm (manifest row + object) and only DROPped after download-verify — never a bare drop; a bounded real proof rotation on the smallest table (`macro_feed_archive` or `exit_decision_archive`, ~tens of MB) end-to-end (hot→warm→cold + rehydrate-verify), mirroring the Wave-A OBJ-1 proof discipline.
- The 5 `data_lifecycle.<table>.hot_retention_days` rows seeded (fail-hard config satisfied); the new sweep run logs the B70 tables (0 real drops today — nothing past 90 d — so the proof uses a bounded retention override like Wave A).
- `b70-retention-sweep.ts` deleted + cron removed + DELETED_COMPONENTS_LOG + archive; `b70-create-monthly-partitions` still scheduled; grep/tsc prove zero dangling refs.
- CI 4-green; governance (SIM B70/B75 sections, System Manual if the tiering architecture changes, CHANGES, RUNNING_ISSUES #430 fully closed, catalog/history/plan, completion report, both MEMORYs).

## 5. Risk order + open questions for Langston (Step-1)
1. **Extend the existing `b75-retention-sweep.ts` inventory** (add a B70 group) vs a **separate b70-archive sweep** (would need extracting the machinery to a shared module). I lean EXTEND — the B74 loop already does exactly this for monthly-partitioned tables; adding 5 entries is minimal + reuses the proven path; one retention owner. Agree?
2. **Hot retention = 90 d** (preserve current boundary, move-not-delete) — agree, or set a different per-table window now?
3. **Retire `b70-retention-sweep.ts` entirely** (rule 18 delete) vs keep it gutted-to-no-op. I lean DELETE (rule 18 — never leave legacy lingering). Agree?
4. **Proof discipline:** a bounded real hot→warm→cold rotation on a tiny B70 table (exit_decision/macro_feed) via a retention override, same as the Wave-A OBJ-1 proof — agree that's the right end-to-end proof (vs. waiting for natural 90 d eligibility in September)?
5. **The B70 partitions are big + JSONB-wide** (signal_eval June 14.5 GB, wide `features`/`gate_decision` JSONB). The B75 exporter BATCH=1000 + per-day slicing was tuned for the 31 GB ticker partition — confirm it's fine for the JSONB-wide B70 rows (Step-2 will validate export memory on a real large partition).
6. change-class = architecture (schema-adjacent config + retention-behavior + a cron/script removal) — agree?
