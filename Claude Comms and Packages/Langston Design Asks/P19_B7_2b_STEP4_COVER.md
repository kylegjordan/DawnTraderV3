# P19-B7.2b — Step-4 consolidated diff cover (NEW Claude → Langston)

**Bundle:** `P19_B7_2b_STEP4_FULL.diff` (1206 lines, embedded in your inbox). 14 code files + `DELETED_COMPONENTS_LOG.md`. Migration `.sql` (gitignored) embedded below. **Bench: TSC baseline OK (no regressions — touched files actually reduced pre-existing baseline errors, e.g. vts-runner TS2339 25→3); maker-taker test 13/13; 2122 vitest pass. The 9 failing files are all no-DB-on-bench pg-pool failures (module-constants), none mine.**

This closes B7.2b: OBJ-A (already benched — VTS wiring + active-path move), OBJ-E (score-timing), the maker_pending STRIP, OBJ-B (fee-mode carry-through, 4 stores), OBJ-C (fee-mode UI column, 4 surfaces). Answers to your five Step-4 gates:

---

## Gate 1 — Phase-21 escalation home (already committed governance, not new-in-diff)
The named home already landed in the plan-doc governance pass (committed `6310d1f96`), so it's not in THIS diff — it's live in the repo:
- **RUNNING_ISSUES #410**: "the REAL Kraken post-only **place/reprice/timeout/cancel** resting-order lifecycle → **Phase-21** (§13)"; haircut calibration → Phase-25.
- **RUNNING_ISSUES #412**: the conversion trigger stated precisely — "on timeout → **convert-to-taker-if-[11.8B]-positive else drop the slot**"; "Phase-21: the real Kraken resting-order place/reprice/cancel + real fills + the pending-slot in live mode; the fill-timeout profitability CALIBRATION (needs live fill data)."
- POST_AUDIT_ROADMAP B-4.5 deposits carry the Phase-19 maker-entry-evaluation + Phase-21 fee-tier-automation items.

If you'd rather these be re-asserted inside the B7.2b completion report's governance list, I'll cite them there at close — but the durable named homes exist now.

## Gate 2 — maker_pending DROP blast-radius (the one you'd scrutinize hardest)
- **Zero remaining references to `processMakerPending`/`markMakerPending`** — repo-wide grep across `server/`+`client/` returns only doc/comment mentions of the removal.
- **Zero remaining readers of the 4 columns** (`maker_pending`/`maker_posted_at`/`maker_limit_price`/`maker_budget_expires_at`): the **drizzle column defs are removed from `schema.ts`** (comment-only marker remains — see diff), so no ORM field; no `select *` reader, no view/mat-view. grep for `makerPending|makerPostedAt|makerLimitPrice|makerBudgetExpiresAt` = 0 code hits.
- **tsc clean** after the type-field removal + the mutual-exclusion branch came out of `getRankedSignals` (bench-verified — no regression).
- **Migration is forward-only with an honest down-migration** — the rollback `.sql` re-adds the 4 columns as nullable/default (recreate-as-nullable). Data was never populated (active trading OFF) so nothing is lost either direction.
- Full §15 disposition is in `DELETED_COMPONENTS_LOG.md` (in this diff).

## Gate 3 — OBJ-E score-timing ✓
The re-decide now runs **AFTER `refreshedFinalScore`** and consumes it as `signalStrength` (was reading the stale stored `signal.finalScore` before). Geometry inputs are captured in `_b72bMTInputs` in the geometry block, then the `decideMakerTaker` call is deferred to just after the decayed score is computed. NULL-retain-on-skip via the conditional spread is unchanged.

## Gate 4 — atomicity of the refresh re-decide vs the ranker read (you asked 3×)
**Satisfied — single row UPDATE.** The re-decide writes `chosen_entry_mode` + `chosen_net_ev` + `taker_net_ev` + `maker_net_ev_adjusted` **and** the decayed `finalScore` in the SAME `storage.updateRtbSignal(signal.id, {...})` call (one statement — see `ready_to_buy_service.ts` reconfirm block in the diff). No two-write split-brain window. And on the denominator: **`distStop` (entry−stop) is NOT mutated by the refresh** — the refresh recomputes `netExpectedEdge` but never touches entry/stop/target prices — so the ranker's `r = chosen_net_ev / distStop` has an **atomic numerator and an invariant denominator**. The half-updated-row hazard (new EV / old stop) cannot occur because the stop never moves on this path.

## Gate 5 — intent: what honors a `maker` verdict when active trading turns ON?
**A maker verdict's execution path is built in the very next sub-batch, B7.2c, BEFORE active trading is switched on.** Sequence: B7.2b (decision + strip) → **B7.2c (build the post-promotion pending maker-fill simulation for paper + VTS — Kyle "build NOW")** → … → **B8 (paper-active ON)**. So by the time active trading is ON, the maker handler exists (simulated fill holding a PENDING slot; convert-to-taker-or-drop on tiered timeout). Live Kraken resting-order = Phase-21. **There is no interim window where active trading is ON with a maker branch the executor can't honor** — it's sequencing, not an implicit taker-only constraint. This is stated in the DELETED_COMPONENTS_LOG "interim-constraint note" + RUNNING_ISSUES #412.

---

## One scope correction you should know (OBJ-C surface)
The scope said "3 components for both VTS and paper-active views," and the plan doc loosely named `shadow-trades-tab`. On tracing the data: `active-trades-v2` + `trade-history-tab` are **paper-only** (no VTS toggle), and `shadow-trades-tab` is the reorg-B4 **selection-quality** layer (no per-trade fee mode). The actual **VTS per-trade view is `machine-learning.tsx`** — `OpenTradesTable` ("Open Simulated Trades", `/api/vts/ml/open`) + `ClosedTradesTable` ("Closed Simulated Trades", `/api/vts/ml/closed`). So the **four real surfaces** are: RTB (`ready-to-buy-table`), paper-open (`active-trades-v2`), paper-closed (`trade-history-tab`), and VTS open+closed (`machine-learning.tsx`). All four now carry the column via ONE shared `formatEntryFeeMode()` (uniform "Entry Fee Mode" label; maker/taker + fee %; NULL→em-dash — your Step-2 add). Flag if you'd rather I ALSO surface it on shadow-trades-tab, but its rows are pool-members-per-cycle, not trades, so fee mode isn't a natural fit there.

## Data-flow for the column (4 stores → 4 surfaces)
- **RTB**: `/api/trading-signals` spreads `...signal` → `chosen_entry_mode` flows automatically. UI reads it.
- **paper-open**: `paper_sim_open_positions.chosen_entry_mode`+`entry_fee_rate` written at `createPaperSimOpenPosition` (fee rate = class per-side rate for the chosen mode, fail-hard via cost-model). `/api/paper-sim/active-trades` whitelist +2. UI reads it.
- **paper-closed**: `paper_sim_trades` (same row created at open, updated on close → fields persist). `/api/paper-sim/trades` returns raw rows. UI reads it.
- **VTS-open**: `vts_open_trades.chosen_entry_mode`+`entry_fee_rate` — promoted to **typed columns** (out of `context` jsonb → single home; rehydrate reads column with legacy-context fallback). `getOpenVirtualTradesForML` type+push. UI reads it.
- **VTS-closed**: carried onto `Phase10TradeRecord` + through `persistRealPriceTrade` → the `vts_trades_*.json` record → `getClosedVTSTradesFromLogs` read-back. UI reads it.

## Migration (gitignored `.sql`, registered in MANIFEST.txt)
```sql
ALTER TABLE paper_sim_open_positions ADD COLUMN IF NOT EXISTS chosen_entry_mode varchar(8), ADD COLUMN IF NOT EXISTS entry_fee_rate numeric(10,6);
ALTER TABLE paper_sim_trades         ADD COLUMN IF NOT EXISTS chosen_entry_mode varchar(8), ADD COLUMN IF NOT EXISTS entry_fee_rate numeric(10,6);
ALTER TABLE vts_open_trades          ADD COLUMN IF NOT EXISTS chosen_entry_mode varchar(8), ADD COLUMN IF NOT EXISTS entry_fee_rate numeric(10,6);
-- DROP the wrong-stage in-queue maker ladder columns (never populated in prod):
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS maker_pending, DROP COLUMN IF EXISTS maker_posted_at, DROP COLUMN IF EXISTS maker_limit_price, DROP COLUMN IF EXISTS maker_budget_expires_at;
```
NULL-not-guessed (a pre-B7.2 row stays NULL, never coerced to 'taker'). Entry-leg only (exit pays taker both classes today).

**Requesting your Step-4 sign-off to push.** After push → CI 4-green → deploy (db:migrate) → then I Claude-in-Chrome verify all four surfaces render on staging (§9.3) for your Step-8, then full governance + completion report.
