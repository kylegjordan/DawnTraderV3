# P19-B7.2b — Pre-Implementation Audit (Step-2, DEEP — Kyle-directed thoroughness)

**Owner:** CC-B · **Reviewer:** Langston (Step-2) · change-class: architecture
**Method:** first-hand code trace of the VTS EV/fee flow + the VTS-vs-active trade-recording stores + the UI→API→store mapping + the `decideMakerTaker` input signature, applying the belongs-in-vs-duplicates check (MEMORY 2026-06-21) + the CLAUDE.md rule-20 `paper_sim_*` naming-trap caution.

## §1. OBJ-A conditional — RESOLVED (Langston Step-1 gate): the active move-before-SQE is a PURE reorder
Langston's gate: the active-side "move `decideMakerTaker` before the SQE" is only a pure reorder if the decision consumes NOTHING the SQE produces. **Proven in code:**
- `calculateExtendedSignalMetrics` runs at `signal-orchestrator.ts:568` → produces `extendedMetrics.finalScore`. The SQE evaluate (`signalQualityEvaluator.evaluate`) runs at `:684` and produces `sqeResult`.
- `decideMakerTaker`'s inputs at the active call site are: entry/stop/target (from `rawSignal`, available from the top), `costs` (`getCachedCostMetrics` — cache read), `feeRateMaker`/`feeRateTaker` (`getFrictionForAssetClass` — DB cache), `DI`/`dbsScore` (`fx5Data` — cache read, safe to move up), pWin params (module_constants cache), **`signalStrength = extendedMetrics.finalScore` (computed at :568, PRE-SQE)**, `urgencyClass` (`STRATEGY_FAMILY_MAP` — static), `haircut` (DB cache).
- **⇒ The decision consumes NO SQE-produced value.** `extendedMetrics.finalScore` is available from :568; the only other movable input is the `fx5Data` cache read. So moving the call to after `:572` (after extendedMetrics) and before the SQE `:684` is a genuine reorder — retiring the Q3 caveat structurally. (Behavior today is identical either way — active SQE EV-gate dormant — but correctness holds when it's activated.) **OBJ-A cleared for implementation.**

## §2. OBJ-A VTS side — the insertion point is local + clean
`vts-runner.ts` computes `finalScore`/`predictiveConfidence` at `:1605`/before, then the Net-EV gate at `:1647` on the TAKER-only `computeNetExpectancyKernel` result (`:1625`, taker friction `:1619`). All `decideMakerTaker` inputs (entry/stop/target, `costMetrics`, `_assetClass`, `finalScore`/`predictiveConfidence`, `sourcePool`, `propagatedDbs`, `strategy`→family) are ALREADY in scope BEFORE `:1647`. So the shared call inserts locally before the gate; gate on the chosen best-of-both netEV. **BELONGS-IN:** EXTENDS the existing VTS gate with the SHARED `decideMakerTaker` — does NOT duplicate the economics (F6). The ROI gate (`:1674`) is VTS-bypassed (logs only) — no change needed there.

## §3. ★ OBJ-B/OBJ-C RESHAPED — the rule-20 trap CONFIRMED: VTS and active-paper use SEPARATE stores (NOT "same tables, mode-distinguished")
The scope assumed one carry path. The trace proves **four stores across two subsystems** — the `paper_sim_*` tables are the ACTIVE-PAPER path's, NOT the VTS's:

| UI table | API endpoint | Backing store | Writer | `chosen_entry_mode` today |
|---|---|---|---|---|
| RTB (`ready-to-buy-table.tsx`) | `/api/trading-signals` | `rtb_signals` | `queueSQESignal` | ✅ (B7.2) — needs API-expose + UI col only |
| Open trades (`active-trades-v2.tsx`) | `/api/paper-sim/active-trades` | `paper_sim_open_positions` | `paper-execution-engine:2554`, `trade-executor:227` (active-paper) | ❌ add col + carry |
| Closed trades (`trade-history-tab.tsx`) | `/api/paper-sim/trades` | `paper_sim_trades` | `paper-execution-engine:2479`, `trade-executor:208` (active-paper) | ❌ add col + carry |
| VTS view (`shadow-trades-tab.tsx`, reorg-B4.1) | shadow/virtual | **VTS OPEN → `vts_open_trades`** (raw SQL, `vts-trade-persistence.ts:125`); **VTS CLOSED → `vts_trades_*.json` FILES** (`/data`, `vts-runner.ts:23/4905`) — NOT a DB table | `vts-trade-persistence` + the JSON writer | ❌ add to both the table + the JSON payload |

**Consequences (materially larger than the scope's one-path assumption — surfacing per §9/§11):**
- **OBJ-B = FOUR write paths:** (1) `paper_sim_open_positions` col + carry (active-paper open); (2) `paper_sim_trades` col + carry (active-paper closed); (3) `vts_open_trades` col + carry (VTS open — a raw-SQL INSERT, not drizzle); (4) the `vts_trades_*.json` payload (VTS closed — a file write, no migration). The migration covers the 3 DB tables; the JSON is a code change.
- **OBJ-C = the VTS view is a DIFFERENT component** (`shadow-trades-tab.tsx`), NOT `active-trades-v2`/`trade-history-tab` (those are active-paper only). So "show it for VTS AND paper-active" = the column lands in `ready-to-buy-table` (RTB, shared) + `active-trades-v2` + `trade-history-tab` (active-paper open/closed) + `shadow-trades-tab` (VTS). Four UI surfaces, three APIs to extend.
- **Q2 (VTS chosen-mode carrier) — RESOLVED:** the VTS has NO per-signal `rtb_signals` row; it carries state in-memory via `openVirtualTrades`/`openShadowTrades` Maps + `vts-trade-persistence`. So the chosen mode must be threaded from the VTS decision (`:1647`) onto the `OpenVirtualTrade`/persistence record directly (not via an RTB snapshot).
- **Q3 (exit-leg fee) — the decision is ENTRY-leg only; the UI column must LABEL it "entry fee mode" (not a round-trip figure).** The exit leg pays taker both classes today (unchanged).

## §4. belongs-in-vs-duplicates verdict
OBJ-A (both paths) EXTENDS the shared `decideMakerTaker` — no duplicated economics (F6 satisfied). OBJ-B rides existing columns/patterns (`paper_sim_open_positions.entry_fee`/`source_pool` is the model; `vts_open_trades` raw-SQL INSERT extends its column list; the JSON payload extends its object). OBJ-C reuses the existing table components (add a column, not a new view).

## §5. Governance (OBJ-D, full set) + migration
Migration adds `chosen_entry_mode` + `entry_fee_rate` to `paper_sim_open_positions`, `paper_sim_trades`, `vts_open_trades` (3 DB tables; NULL-not-guessed for pre-existing rows). The `vts_trades_*.json` payload gains the fields in code. Governance: completion report + PHASE_19_PLAN §1/§5 + BATCH_CATALOG + PHASE_HISTORY + SIM (the VTS-now-calls-the-shared-decision wiring + the 3 new trade-store columns) + SYSTEM_MANUAL (the shared-across-active+VTS completion + the symmetric placement) + POST_AUDIT_ROADMAP + RUNNING_ISSUES + ADJUSTMENT_FRAMEWORK (unchanged knobs — note only) + Langston MEMORY.

## §6. Verdict
Scope design holds; OBJ-A cleared (pure reorder proven). **OBJ-B/OBJ-C are RESHAPED by the confirmed rule-20 finding: VTS and active-paper are separate stores → FOUR trade-write paths + FOUR UI surfaces (one shared RTB + two active-paper + one VTS), not one.** This is a scope-size increase (surfaced now, not after) — recommend Langston re-confirm OBJ-B/C at this reshaped size before implementation. No architecture surprise in the DECISION (the shared function is exactly reused); the surprise is the trade-store fan-out, which is plumbing, not new economics.
