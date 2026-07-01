# P19-B7.2b — Complete the shared maker/taker service: VTS wiring + fee-mode visibility (Kyle directive 2026-07-01)

**Owner:** CC-B · **Reviewer:** Langston (Step-1/2/4/8) · **2nd-eyes:** CC-A · **change-class: architecture**

**Why (Kyle, after B7.2 close):** B7.2 built the maker/taker best-of-both decision as a shared standalone function BUT only the ACTIVE path (live + paper) actually calls it — the **VTS still runs its own separate taker-only Net-EV gate**. The decision was agreed to be a service SHARED across active-live, active-paper, AND the VTS. Also, the chosen entry fee mode is stored on the ready-to-buy row but does NOT carry onto the open-position / closed-trade records, and nothing SHOWS it in the UI — Kyle wants to see, per trade, WHICH fees were used (maker vs taker), in the RTB table + the open-trades table + the closed-trades table, for BOTH VTS and paper-active.

## Objectives (workstreams)

**OBJ-A — VTS calls the shared decision (`decideMakerTaker`), + symmetric active-path placement.**
- **VTS:** in `vts-runner.ts` the Net-EV gate at `:1647` (the "SQE-equivalent in VTS" — code comment `:4293`) currently gates on the TAKER-only `computeNetExpectancyKernel` result (`:1625`, taker friction `:1619`). Call the SHARED `decideMakerTaker` just BEFORE that gate (matching Kyle's "generated → decide → gate" model) and gate on the CHOSEN best-of-both netEV; record the chosen mode on the VTS signal. Reuse the vars already in scope (entry/stop/target, `costMetrics`, `_assetClass`, `finalScore`/`predictiveConfidence`, `sourcePool`, `propagatedDbs`, `strategy` → the continuation/reversal urgency via `STRATEGY_FAMILY_MAP`). Config = the SAME `resolveMakerTakerHaircut(assetClass)` (per-class DB). **This is F6 (the shared decision function both paths call) — no second copy of the economics.**
- **Active symmetry:** move the active-path `decideMakerTaker` call (currently after the SQE evaluate, `signal-orchestrator.ts:~750`) to BEFORE the SQE evaluate (`:677`), so BOTH paths decide before their gate. This matches Kyle's model AND permanently resolves the B7.2 Q3 caveat (if the active SQE ROI gate is ever activated it can no longer reject a maker-chosen opener upstream — best-of-both is already computed before it). Requires reading `fx5Data` before the SQE (a pure cache read — safe to move up).
- **Data fence unchanged:** VTS maker decisions are simulated/telemetry; the same NON-CALIBRATION fence applies (real adverse selection = Phase-21).

**OBJ-B — carry the chosen entry mode + effective fee rate onto the trade records (open + closed), VTS + paper-active.**
- Add `chosen_entry_mode` (`taker`|`maker`) + `entry_fee_rate` (the actual per-side fee rate used for the entry) to the OPEN-position record (`paper_sim_open_positions` — already carries `entry_fee`/`source_pool`, the natural home) and the CLOSED-trade record (`paper_sim_trades`), for BOTH VTS and paper-active (same tables, mode-distinguished — the exact VTS-vs-active write paths are a Step-2 pre-audit item). Carry from the signal's snapshot (`rtb_signals.chosen_entry_mode`) through open → close. Migration (`git add -f` + MANIFEST; rollback stays out).
- **NO silent default:** if a record predates B7.2 (no snapshot), the column is NULL, not a guessed 'taker'.

**OBJ-C — UI fee-mode column in the RTB table + open-trades + closed-trades (VTS + paper-active).**
- Add a column showing the entry fee mode (maker/taker) + the fee % used, in `ready-to-buy-table.tsx` (RTB), `active-trades-v2.tsx` (open trades), and `trade-history-tab.tsx` (closed trades) — for both the VTS and the paper-active views. **§9.3: verify all three rendered on staging via Claude-in-Chrome before close (not curl).**

**OBJ-D — FULL governance (Kyle: this is a big, important batch).** Completion report + PHASE_19_PLAN §1/§5 + BATCH_CATALOG + PHASE_HISTORY + SYSTEM_IMPACT_MAP + SYSTEM_MANUAL + **POST_AUDIT_ROADMAP** + RUNNING_ISSUES + ADJUSTMENT_FRAMEWORK (as applicable) + Langston MEMORY.

## Step-2 pre-audit questions (to resolve before implementation)
1. **The VTS trade-recording path** — vts-runner does not directly call `createPaperSimTrade`/`createPaperSimOpenPosition`; how do VTS virtual trades reach `paper_sim_*` (via `runPhase10SimulationCycle`? a separate recorder? routes.ts:12493/12574?), and is it the SAME table set as paper-active (mode-distinguished) or a separate grain? (Determines whether OBJ-B is one carry path or two.) Apply the CLAUDE.md rule-20 taxonomy caution (paper_sim_* naming trap).
2. **Where VTS holds the chosen mode** between the decision (`:1647`) and the trade record (VTS may not have a per-signal RTB row like the active path — confirm the carrier).
3. **The exit-side fee** — the entry decision is maker/taker for the ENTRY leg; confirm what the exit leg pays and whether the UI should show entry-only (the decision's scope) or entry+exit.
4. **belongs-in-vs-duplicates** (MEMORY 2026-06-21): confirm the VTS wiring EXTENDS the shared `decideMakerTaker` (does not duplicate the economics) + the UI column reuses existing table plumbing.

## Verification criteria
VTS Net-EV gate evaluates on the chosen best-of-both (a VTS unit/integration check); active-path decision now before the SQE (unchanged behavior — SQE EV-gate dormant — + the Q3 caveat retired); chosen_entry_mode + fee rate persisted on open + closed records (VTS + paper-active); the UI column renders in all three tables (Claude-in-Chrome, both VTS + paper-active views); shared-function single-source (no duplicated economics); bench tsc-baseline + vitest; CI 4-green; full governance.

## Notes
- Sits on top of P19-B7.2 (`c595d987e`); completes the "shared across active + VTS" requirement (D6) + the fee-visibility ask. DORMANT parts (active-paper) stay §9.1; the VTS path is LIVE (VTS runs continuously) so the VTS maker/taker decision + telemetry are exercised immediately (the maker-pick-rate monitor gets real VTS data — though still model-vs-model, data-fenced).
