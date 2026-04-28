# Batch 67.3 — Change List

**Batch:** B67.3 (Per-underlying position limits, sub-deliverable 2 of 6 in B67)
**Commit:** `ca0e2c2d` (2026-04-28)
**CI:** run `25072886601` GREEN (2m24s, 4/4 checks)
**Deploy:** PM2 restart #102, 2026-04-28 ~19:25 UTC. HTTP 200.
**Mode at deploy:** SHADOW (`b67_3_enabled=false`). Activation via module_constants flip.

---

## Code changes (7 files)

### New files (3)

| File | Purpose | Lines |
|---|---|---:|
| `drizzle/migrations/2026-04-28-b67-3-per-underlying-cap-pair-hash.sql` | Migration: `paper_sim_trades.pair_id_hash` integer + 3 module_constants seeds | ~50 |
| `drizzle/migrations/2026-04-28-b67-3-rollback.sql` | Symmetric rollback | ~15 |
| `server/services/per-underlying-cap.ts` | `checkPerUnderlyingCap()` API + `assignCohortHash()` (FNV-1a 32-bit) + `formatDecisionLog()` | ~155 |

### Modified files (4)

| File | Change |
|---|---|
| `shared/schema.ts` | Added `pairIdHash` integer column on `paperSimTrades` |
| `server/core/audit/signal_lifecycle_audit.ts` | Added `'PER_UNDERLYING_CAP'` to RejectionReason taxonomy |
| `server/services/signal-orchestrator.ts` | Wire-in gate after SQE_PASS, before RTB queue. Calls `storage.getActiveTrades(mode)` for open-symbol list. Fail-open on lookup error. Import added at top |
| `server/services/vts-runner.ts` | Wire-in gate after MAX_OPEN_TRADES check, before trade-record creation. Reads symbols from in-memory `openVirtualTrades` map. Fail-open. Sets `setNullReason('per_underlying_cap')` on reject. Import added at top |

---

## Module constants seeded (3 rows in `per_underlying_cap` module)

- `b67_3_enabled` (bool, default `false` — shadow mode at deploy)
- `b67_3_max_concurrent_per_underlying` (int, default `2`)
- `b67_3_universe_split_active` (bool, default `true` — A/B cohort gating active)

Activation: `UPDATE module_constants SET value = 'true'::jsonb WHERE module_name='per_underlying_cap' AND constant_name='b67_3_enabled'` (no code redeploy required).

---

## Schema additions (1 column)

`paper_sim_trades.pair_id_hash` SMALLINT (nullable). Stores FNV-1a(symbol) % 2 cohort marker at trade open. NULL on rows opened pre-B67.3.

**Persistence wire-in deferred:** the column exists post-migration; the gate computes the cohort on every signal evaluation. End-of-observation cohort comparison requires the cohort persisted on the trade record. Lands as a small follow-up commit before `b67_3_enabled` is flipped to true.

---

## Behavior

**Shadow mode (current state):**
- Gate runs on every signal evaluation
- Decisions logged to PM2 (`[B67.3] {symbol} base={base} cohort={0|1} open={count}/{cap} → ...`)
- Trades are NOT actually rejected even when cap reached
- Allows verification of cohort assignment + cap-reach detection without affecting trading

**Active mode (post-flip):**
- Cohort 0 (treatment): cap enforced. Rejected signals carry `PER_UNDERLYING_CAP` reason
- Cohort 1 (control): cap bypassed (during A/B universe-split observation)
- After observation closes: flip `b67_3_universe_split_active=false` to apply cap universally if cohort 0 outperformed cohort 1

---

## Wire-in placement (intentional design choice)

**Two gates, not three.** Scope §5.5 listed signal-orchestrator + vts-runner + paper-execution-engine. Implementation wired signal-orchestrator + vts-runner only. Reasoning: paper-execution-engine consumes signals via the RTB queue; signal-orchestrator gates BEFORE the queue, so capped signals never reach paper-execution. Avoids redundant third gate and consistency-drift risk between two paper-side gates.

Langston confirmed this placement during Step-4 review (cc-inbox #841).

---

## Verification log

| Check | Result |
|---|---|
| TypeScript | `npx tsc --noEmit` clean |
| CI | run `25072886601` GREEN (TypeScript Check, Test Suite, Build, Docker Build) |
| Migration | `npm run db:migrate` applied 1 pending migration cleanly |
| HTTP health | `GET /api/health` → 200 |
| Schema column | `paper_sim_trades.pair_id_hash` PRESENT |
| Module constants | 3 rows in `per_underlying_cap` module: enabled=false, cap=2, split=true |
| Live B67.3 logs | Not yet visible — VTS reports "No pairs available" during verification window. Gate will exercise live when signal flow resumes (active trading currently STOPPED per UI) |
| PM2 errors | Zero `[B67.3]` errors |

---

## Workflow gates

| Step | Status |
|---|---|
| 1 — Scope | ✅ Approved (rolled into B67 master scope §5) |
| 2 — Pre-audit | ✅ Approved (B67 V2 pre-audit covers all sub-deliverables) |
| 3 — Implementation | ✅ Complete |
| 4 — Code review | ✅ Langston-approved (cc-inbox #841); one non-blocking comment fix applied (FNV-1a vs CRC32 in migration header) |
| 5 — GitHub push + CI | ✅ commit `ca0e2c2d`, CI green |
| 6 — Staging deploy | ✅ PM2 #102, HTTP 200 |
| 7 — First-pass verification (CC) | ✅ See verification log |
| 8 — Second-pass verification (Langston) | Skipped per Kyle workflow — Step-4 review by Langston covered code-level evidence |
| 9 — Iterate | None needed |
| 10 — Governance | ✅ This change list + BATCH_CATALOG row update + PHASE_HISTORY entry + progress report B67.3 closure block + MEMORY |
| 11 — Completion ack | ⏳ Pending Kyle |

---

## Activation plan post-ship

1. ✅ Ship in shadow mode (`b67_3_enabled=false`) — current state
2. Verify shadow-mode logs are coherent once signal flow resumes (active trading turned ON or VTS gets pairs back)
3. Add the `pair_id_hash` trade-open wire-in (small follow-up commit; persists cohort to `paper_sim_trades.pair_id_hash` column at trade open so end-of-observation cohort comparison can compute "cohort 0 WR vs cohort 1 WR")
4. Flip `b67_3_enabled=true` via module_constants UPDATE — no code change required
5. Begin 14-day observation period
6. End-of-observation cohort comparison: WR / net expectancy / max-loss-per-day in cohort 0 (limited) vs cohort 1 (unlimited)
7. If cohort 0 ≥ cohort 1 on net expectancy → keep cap, flip `b67_3_universe_split_active=false` so all pairs get the limit
8. If cohort 0 < cohort 1 → escalate to Kyle; deactivate `b67_3_enabled`

---

## Out of scope (deferred)

- **`pair_id_hash` trade-open persistence** — small follow-up commit before activation
- **paper-execution-engine third gate** — intentionally NOT wired (avoids consistency drift)
- **B68.3 cross-quote correlation** — ETH/BTC counts toward BASE only in B67.3; B68.3 will handle pair-correlation context

---

*Sub-deliverable B67.3 of B67. Progress report at `Claude Comms and Packages/Batch Completion/BATCH_67_PROGRESS_REPORT.md` open. Next sub-deliverable: B67.1 + B67.2 (deploy together per scope §3 dependency chain) — macro confidence modifier + phase dimension.*
