# P19-B7.2b AND BEYOND — master plan + sequence (Kyle directives 2026-07-01)

**Purpose:** compaction-proof record of every open thread + the execution SEQUENCE, so nothing is dropped. Owner CC-B. Authoritative for the maker/taker arc; PHASE_19_PLAN §1/§5 + POST_AUDIT_ROADMAP + RUNNING_ISSUES point here.

## ★ KYLE DIRECTIVES 2026-07-01 (the corrections that reshaped the arc)
1. **The maker/taker DECISION + the maker-order FILL behavior must be ACTIVE in BOTH the VTS and paper mode — BUILT NOW, not deferred.** "If the paper maker/taker system is not operable, that needs to be FIXED — not a casual side note." We CANNOT test it live until paper-active turns on (B8, a couple batches away), but **everything must be built first. Don't put off till tomorrow what we build today.**
2. **Model (locked):** a signal in the RTBQ carries a maker/taker DECISION only — it works NO order. The RTB refresh RE-DECIDES it each cycle (load-bearing: feeds the B7.1 ranker's queue order AND the [11.8B] gate). The maker ORDER goes out (to Kraken in live; simulated in paper) ONLY at PROMOTION.
3. **Post-promotion pending maker order (paper + live):** a promoted maker order OCCUPIES A SLOT and shows as **PENDING** in open trades while waiting to fill. LIVE = a real Kraken resting order (Phase-21). PAPER = SIMULATED fill (build NOW). VTS = same maker-fill simulation as paper.
4. **Maker-pending TIMEOUT = a tiered diminishing-returns model.** Don't block a slot indefinitely. Tiers: if a maker fills within window T1 it has ~X% profitability; unfilled into T2 → lower; a final threshold → DROP. Tiers DB-governed; calibrated (Phase-25, needs fill data). Initial CC-B suggestion: a conservative single max-age (~1h crypto) as the hard-drop now + the tiered structure as placeholders, calibrated later.
5. **File-naming = ONE batch AFTER the B7.2 arc:** rename FILES + DB TABLES, and replace "paper" → "active" for the SHARED active-trading pipes (paper + live share one infra). VTS files carrying "paper" → drop it. Delete dead old "paper" files. ONLY genuinely paper-only / live-only divergence files keep an explicit designation (audit whether any exist).

## PAPER MAKER-FILL SIMULATION — how it works (plain, for the build)
No order to Kraken. Watch Kraken's REAL live price feed. A pretend maker BUY limit at price P "fills" ONLY if the real market TRADES THROUGH P (a real print at ≤ P for a buy) — honest, never optimistic. On fill → open a real paper position at P + the maker fee. While waiting → PENDING, holds a slot. Not filled by the tiered max-age → convert-to-taker-if-still-profitable (via decideMakerTaker taker leg + [11.8B]) else DROP. Same simulation in the VTS. (Today paper only simulates the immediate/taker fill; the maker resting-fill sim is NEW and must be built.)

## ═══ EXECUTION SEQUENCE ═══

### P19-B7.2b (CURRENT — the shared decision + fee visibility) — finish this first
- ✅ OBJ-A: VTS calls decideMakerTaker (before its Net-EV gate) + active-path decision moved before the SQE (SQE stays calc-free). DONE+benched.
- ✅ OBJ-E: RTB refresh re-runs decideMakerTaker each cycle (load-bearing). DONE+benched. ⏳ score-timing fix (use decayed refreshedFinalScore).
- ✅ maker_pending STRIP: removed processMakerPending/markMakerPending/refresh-branch/mutual-exclusion/promotion-POST + dropped 4 rtb_signals cols (migration). DONE+benched. ⏳ DELETED_COMPONENTS_LOG entry.
- ⏳ OBJ-B: carry chosen_entry_mode + entry_fee_rate onto trade records (4 write paths: paper_sim_open_positions, paper_sim_trades, vts_open_trades raw INSERT, vts_trades_*.json). [schema+migration DONE].
- ⏳ OBJ-C: fee-mode UI column (ready-to-buy-table + active-trades-v2 + trade-history-tab + shadow-trades-tab; 3 APIs) — label "entry fee mode", NULL→"—", Claude-in-Chrome verify.
- ⏳ Consolidated diff → Langston Step-4 (blast-radius incl the deletion) → CI → deploy(db:migrate) → Step-8 → FULL governance → Kyle ack.

### P19-B7.2c (NEXT — the post-promotion maker-fill lifecycle; BUILD NOW per Kyle) 
- Post-promotion: a maker-chosen promoted signal → PENDING open trade holding a slot (NOT immediate open). New pending state on the open-trade record (paper_sim_open_positions + the VTS open-trade record) — NOT on rtb_signals (that was the wrong stage).
- PAPER + VTS maker-fill SIMULATION: honest trade-through of the real price → fill (pending→open, at limit + maker fee).
- TIERED timeout (DB-governed maker_taker knobs): fill-quality tiers + hard-drop max-age; on timeout → convert-to-taker-if-[11.8B]-positive else drop the slot.
- LIVE real Kraken resting-order place/reprice/cancel = Phase-21 (POST_AUDIT_ROADMAP item).
- Full workflow + Langston + governance.

### P19-B7.2a (fee-resolver #330 consolidation) — small, schedule adjacent
### P19-B-RENAME (file + DB-table rename batch — AFTER the B7.2 arc)
- Shared active pipes: paper→active (files + DB tables). VTS: drop "paper". Delete dead old "paper" files. Keep only true paper-only/live-only divergence designations (audit first). Propose the exact list (name→new-name, category) for Kyle+Langston sign-off BEFORE any rename. DB-table renames = highest risk (careful migration + lockstep query updates); consider files-first.
### Then: crypto gate-10 lifecycle proof → P19-B8 (paper switch-on, BOTH classes) → P19-B9 (run + audit).

## Phase-21 named homes (relocated, NOT dropped)
- Live maker resting-order lifecycle (Kraken post-only place/reprice/timeout/cancel + real fill events + the pending-slot in live).
- The tiered fill-timeout profitability CALIBRATION (needs real live fill data → Phase-25).
