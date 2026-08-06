# B-TRADE-TIER-REGISTER — SCOPE r2 (#599's named home): the trade tables gain an ARCHIVED path

change-class: architecture
**Owner:** CC-A · 2026-08-06 · **r1→r2: four of five premises corrected per Langston Step-1 — the urgency claim is WITHDRAWN; the batch stands on its merits (rule-24 bucket 2: working-as-designed-but-unaddressed).**

## 1. WHAT IS ACTUALLY TRUE (each corrected against his refutation, re-verified where cheap)
- **NO DEADLINE.** `min(closed_at)=2026-05-11`; leg 1 (`e3cacb56e`, 07-30) set 365d, so the first GC bite is **2027-05-11**. The r1 "~08-09" was the RETIRED 90-day date — retired by MY OWN previous leg, which I scoped against anyway. Urgency withdrawn; the #430 pause backstop DROPPED — nothing races.
- **`closed_trades` is UNARCHIVED, not at-risk.** No age-deleter exists: no `data_lifecycle` key, not in either sweep registry, and the three delete sites are hard-reset/orphan paths (the reset explicitly KEEPS history rows). The finding is a missing durability path, not impending loss.
- **`vts_open_trades` IS in `data_lifecycle`** (`vts_open_trades.closed_gc_retention_days=365`) **but NOT in the sweep's table registries — and a retention key alone does not tier a table** (his standing ruling, adopted verbatim). Its closed rows are GC-DELETED at 365d with no archive: the real at-2027 move-not-delete violation.
- **The GC predicate is `closed = true AND closed_at < …`** — NOT the `state` column (that is the entry-mode axis; measured co-movement today, 49,898/109/1, is exactly how a wrong predicate survives review). Schema pasted in the pre-audit per the B79.0g-tx paste-don't-paraphrase rule.

## 2. PROVENANCE OF THE COMPONENT THIS BATCH CHANGES (§2 1.b tier 1)
`server/scripts/b75-retention-sweep.ts` — born `f4e6a73f6` 2026-05-06, subject verbatim: **"B75 Step 3 ship: tiered hot/warm/cold storage architecture."** The PLAIN lane added `dc8350110` 2026-06-16, subject verbatim: **"P19-B5c Step-3: continuous Q-D (quote-depth) friction probe (#86)"**; its in-code intent, quoted: *"These tables get a batched age-DELETE + VACUUM … NO cold-offload. This keeps B75 the SINGLE retention owner (one cron / one script) without partitioning a small derived-telemetry table."* **Disposition (2): relevant, needs updating to today's intent** — the lane was built delete-only for DERIVED telemetry; the trade tables are PRIMARY records, so the lane gains an EXPORT-BEFORE-DELETE mode rather than a new sibling (preserving the single-retention-owner intent).

## 3. THE DESIGN (r2 — honestly costed as NEW BUILD on the plain lane, not "proven machinery")
Extend `PLAIN_RETENTION_TABLES` specs with `archive: true`: for archived plain tables the sweep EXPORTS age-eligible rows in dated ranges (reusing the Wave-C JSONL.gz + warm TUS + checksum + `data_archive_manifest` components — the COMPONENTS are proven; their COMPOSITION into this lane is new build and is costed as such), verifies at warm, THEN batched-DELETEs. Delete-only tables (`xstock_qd_probe_history`) keep current behavior. Register: `vts_open_trades` (predicate `closed = true AND closed_at < now()-365d`; OPEN rows never touched) + `closed_trades` (NEW `closed_trades.hot_retention_days=365` — its FIRST retention policy: archived-then-removed at 365, never bare-deleted).
**The inherited question, answered not inherited:** `xstock_qd_probe_history` at 90d delete-only — DISPOSITION ASKED OF LANGSTON in this Step-1: its lane comment calls it "small derived telemetry" (reconstructible from the probes' sources), which reads as a deliberate STORAGE_POLICY exemption; if he concurs it stays delete-only with one exempting line added to `STORAGE_POLICY.md`; if not, it joins the archived mode here.

## 4. §9.5 PRE-AUDIT OBLIGATIONS (unchanged from r1, plus the paste rule)
Full deleter census both tables (the VTS GC + the sweep = two deleters over `vts_open_trades` — mutual-exclusion check); state-write census on export-then-delete; `\d` output pasted for both tables; SIM entries (both tables + the sweep's new mode).

## 5. VERIFICATION
Wave-C-pattern end-to-end proof on ONE real range per table: export → manifest row → warm download + checksum match → delete → range readable from warm; hot-window rows untouched (count-invariant inside the window). No urgency gate — the batch ships on quality, with ~9 months of runway.

## 6. OUT OF SCOPE
The outcome-feedback EMA store file (live working state — stated to Kyle) · partitioning (Option B, rejected with reasons in r1, unchanged) · any window change beyond registering the existing 365s.
