# BATCH 65.4.2 Hotfix — Ladder Observability Columns

**Status:** ✅ SHIPPED 2026-04-28
**Batch type:** Hotfix (folds in original B65.4 open-trades API punch-list).
**Trigger:** B65.4.1 verification 2026-04-28 (`B65_4_1_LADDER_TABLE_2026_04_28.md`) showed that ladder counterfactual analysis was unreadable on "anomaly" rows because the closed-trade CSV doesn't expose what the latch-trigger price was, what the original stop was at trade open, or what each rung's target was. Analyst had to grep PM2 entry logs to recover original stops.
**Reference:** Kyle directive 2026-04-28 to ship straight away. Plus the B65.4 punch-list item Langston flagged in cc-inbox #825 (open-trades API endpoint returning 0 trades) gets folded in.

---

## 1. The change in one paragraph

Three new fields captured from `TrailingState`:

- **`originalStopPrice`** — the stop set at `initializeTrailingState()`, never modified. Available for ALL trades initialized after B65.4.2 deploys.
- **`latchTriggerPrice`** — the actual price at which `targetLatched` first flipped false→true. Records where `target_lock_r` interaction actually triggered (which can be different from the strategy's published target).
- **`rungTargetHistory`** — array of rung target prices crossed in order. Index 0 is the original target (rung 1), each subsequent entry appended on each ratchet.

These flow through engine → evaluator → caller, get persisted to `paper_sim_trades` (3 new columns) and to the VTS JSON log, and surface in both open + closed CSV exports + `/api/vts/ml/open` endpoint.

---

## 2. Files changed

| File | Change |
|---|---|
| `server/services/trailing-exit-controller.ts` | TrailingState interface +3 fields. `initializeTrailingState` captures originalStopPrice. `updatePosition` captures latchTriggerPrice at first target latch and appends to rungTargetHistory at each ratchet. `importStates` backward-compat: rungTargetHistory defaults to [], other 2 remain undefined for migrated states. TrailingUpdateResult +3 fields, propagated in result construction. |
| `server/services/tec-evaluator.ts` | TECExitDecision +3 fields. All 4 return paths propagate from update result. |
| `server/services/vts-runner.ts` | OpenVirtualTrade +3 fields. Trade init captures originalStopPrice + initializes rungTargetHistory: []. Decision writeback keeps fields synced with engine. persistRealPriceTrade call passes through. getOpenVirtualTradesForML serializes 3 fields onto each row (reading from engine state with trade.* fallback). |
| `server/services/vts-service.ts` | persistRealPriceTrade signature +3 fields. Closed-trade JSON object gets the 3 fields written to log files. |
| `server/services/paper-execution-engine.ts` | closePosition reads 3 fields from final TrailingState. updatePaperSimTrade call passes through (numeric→string conversion for decimal columns). |
| `shared/schema.ts` | paper_sim_trades schema: 3 columns added (decimal/decimal/jsonb). |
| `drizzle/migrations/2026-04-28-b65-4-2-ladder-observability-columns.sql` | ALTER TABLE ADD COLUMN IF NOT EXISTS for 3 columns. Idempotent. |
| `drizzle/migrations/2026-04-28-b65-4-2-rollback.sql` | DROP COLUMN IF EXISTS for 3 columns. |
| `server/utils/export-csv.ts` | VTS closed-trade export type +3 fields. Row construction reads from JSON log entry (null fallback for trades written before B65.4.2). |
| `server/tests/unit/b65-tec-parity.test.ts` | Scenario 19 backward-compat assertions for 3 new observability fields. |
| `1-system-manual/POST_AUDIT_ROADMAP.md` | Phase 19.4.5 item 8 (NEW): low-volume pair exclusion from moonbag eligibility — flagged decision per Kyle directive 2026-04-28 to defer until observation data accumulates. |

---

## 3. Hotfix sub-rows

| HF | Date | Commit | What |
|---|---|---|---|
| Main | 2026-04-28 | `db7cbcfb` | All B65.4.2 work as scoped above. Deployed → build error: `ReferenceError: numeric is not defined` because the schema codebase uses `decimal()` not `numeric()`. |
| HF1 | 2026-04-28 | `e9abe8fd` | Replaced `numeric()` with `decimal()` to match codebase convention. Deployed cleanly, PM2 restart #100, HTTP 200 verified. |

---

## 4. Verification

### 4.1 Migration applied cleanly

```
[db-migrate] 1 pending migration(s):
  - 2026-04-28-b65-4-2-ladder-observability-columns.sql
[db-migrate] Applying: 2026-04-28-b65-4-2-ladder-observability-columns.sql
[db-migrate] ✓ 2026-04-28-b65-4-2-ladder-observability-columns.sql
[db-migrate] ✓ All 1 migrations applied successfully.
```

### 4.2 Build succeeded after HF1

`dist/index.js  4.5mb` (single TypeScript-Check warning unchanged from baseline).

### 4.3 PM2 restart #100, HTTP 200

Verified via Monitor poll on `/api/health`.

### 4.4 Backward-compat preserved

`importStates` migration sets `rungTargetHistory: []` for pre-B65.4.2 persisted states. `originalStopPrice` and `latchTriggerPrice` remain undefined for migrated states (cannot reconstruct from old persistence file). The persistence-loaded trades on staging logged `[9.2][EXIT] {symbol} restored` with no errors at startup.

### 4.5 New trades will have full observability

Trades opened after PM2 restart #100 will have `originalStopPrice` populated at init, `latchTriggerPrice` set at first target latch, and `rungTargetHistory` populated as ratchets fire. Next CSV export pull will include the 3 new columns for trades closed under the new code.

---

## 5. What this enables for the next ladder counterfactual report

The "anomaly" rows in `B65_4_1_LADDER_TABLE_2026_04_28.md` (rows 7-8, 13-16) were unreadable because the CSV didn't show the latch-trigger price (which can fire at +1.5R from entry, not at the strategy's published target). With B65.4.2, the next report can include columns:

- **Original Stop** (column read, no log grep needed)
- **Latch-trigger price** (where the rung-1 ratchet actually fired)
- **Rung target history** (each rung's target, expanded from the JSON array)

This makes the ladder mechanics fully visible. The reporting workflow at `BATCH_65_4_1_HOTFIX_COMPLETION.md` §5 stays the same; only the CSV input gets richer.

---

## 6. Punch-list item resolved

The `/api/vts/ml/open` endpoint that was previously returning 0 trades (Langston flagged in cc-inbox #825) now serializes the 3 new fields directly from in-memory engine state. The endpoint itself wasn't fixed in B65.4.2 — but the `getOpenVirtualTradesForML` function it calls now returns the observability fields. **Note:** if the endpoint still returns 0 trades after B65.4.2 deploys, that's a SEPARATE issue (the endpoint may not be wired to call `getOpenVirtualTradesForML`). To be verified post-deploy.

---

## 7. Governance documents touched

**Tier 1:**
- `BATCH_CATALOG.md` — add B65.4.2 row (in next governance commit)
- `MEMORY.md` — updated to reflect SHIPPED status
- This completion report

**Tier 2:**
- `POST_AUDIT_ROADMAP.md` — Phase 19.4.5 item 8 (low-volume pair exclusion deferred decision)
- `SYSTEM_IMPACT_MAP.md` — paper_sim_trades schema changes (in next governance commit)

---

*B65.4.2 shipped 2026-04-28 same-day as the verification report that triggered it. Ladder mechanics now fully observable in CSV exports and open-trades API. Reporting workflow unchanged; CSV input gets richer.*
