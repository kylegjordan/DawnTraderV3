# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms; §2 Step 10.b — Langston MEMORY sync mandatory; §6.5 Step 3 — Telegram verbatim relay mandatory).
2. Read this file.
3. Read `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` — **this is the canonical blueprint for any new asset class onboarding.** Updated post-Phase-24 with numbered procedural checklist + Section L (ticker-collision check) + Section D.1 (code templates).
4. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase.
5. Receive Kyle messages in this Claude Desktop conversation.
6. For Kyle ↔ Langston traffic visibility, tail `/var/log/cc-bridge-inbox.jsonl` on Hetzner.
7. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough; forget the no-touch fence on crypto_spot; dump every lesson into the workflow doc (only standing rules belong there per Kyle directive 2026-05-10).

---

## TEMPORARY MAINTENANCE RULES (xStocks UI sprint — remove when all B-NEW items FIXED + verified)

Kyle directive 2026-05-12 EOD. These rules apply WHILE the xStocks Filter Diagnostics tab still has open items. Remove from MEMORY.md once `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` Open Items list is empty AND each item is Kyle-verified on staging.

**Rule 1 — `XSTOCKS_DIAGNOSTICS_TAB_FIXES.md` (canonical xstock UI tracker):**
- All-time changelog format. Keep every entry forever (FIXED + REVERTED + OPEN).
- Every UI fix to xstock tab → add a row to CHANGELOG with date, commit hash, exact change, status.
- Every new issue Kyle raises → append a `B-NEW-N` entry to OPEN ITEMS table (incrementing N).
- One-by-one workflow: fix → push → Kyle verifies on staging → mark FIXED → next.
- File path: `Claude Comms and Packages/Batch Completion/XSTOCKS_DIAGNOSTICS_TAB_FIXES.md`.

**Rule 2 — `ASSET_CLASS_ONBOARDING_WORKFLOW.md` (distilled standing rules only):**
- Update with **standing rules that every future asset class needs**, NOT trial-and-error history.
- Criterion: "Tomorrow we add a new asset class. What gets us 98% there on first pass?"
- Trial-and-error history lives in per-batch completion reports and the xstocks tracker, NOT the workflow doc.
- Standing rules examples: scanner architecture defenses (config cache, scan timeout, rotation), constant-name canonicalization, NO silent fallbacks, symbol normalization audit, etc.
- File path: `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md`. Step 2b added today.

**Rule 3 — Update both files in the same session you ship a fix.** Otherwise the changelog drifts from reality and the workflow doc loses the learning.

---

## CURRENT STATE — 2026-05-12 EOD (B79.0m.b2 + 6 follow-up patches SHIPPED PM2 #235; xstock pipeline at crypto parity AND diagnostically clean; awaiting RTH signal flow)

✅ **B79.0m.b2 main + 6 follow-ups deployed.** PM2 #235 (HEAD `f31fc18d6`).

**Main commits:** `4c60d259e` + `909182690` (test fixup).
**Follow-up commits (Mon evening 2026-05-12):**
- `8fd97b16e` — endpoint patch (pattern path applicable=true) + scanner lifetime counter expansion + SYSTEM_MANUAL Phase 24 EXTENDED appendix + CHANGES_AND_FIXES B79.0m.b2 entry
- `ac38ac194` — familyPaths shape fix (panel rows render correctly)
- `a7f494cc0` — strip `vts_`/`active_` prefix from family keys for panel parity
- `1dd6b9e45` — xStocks tab description text updated (no longer claims scanner-not-wired)
- `dd0466c7e` — **pattern strategies eligible in family lanes** (matches crypto's symbol-pool-union model)
- `f31fc18d6` — **per-lane counter split (quant vs pattern) + slow load fix (~60s → 0.94s) + freshness panel removed + setup-hash dedupe counter + family-mismatch denominator fix**

### What's verified live on staging right NOW (2026-05-12 evening UTC)

Counters from live xstock cycles post-deploy:
- `quantPairsEvaluated: 1035`, `patternPairsEvaluated: 435` (per-lane split working)
- `quantStrategyEvaluations: 1846`, `patternStrategyEvaluations: 289` (pattern strategies firing on BOTH pattern + family lanes per `dd0466c7e`)
- `quantStrategyNulls: 1843` / `patternStrategyNulls: 288` (99.8% null rate both lanes)
- `quantSignalsGenerated: 0`, `patternSignalsGenerated: 0`, `tradesOpened: 0`
- `setupHashDeduped: 0` (silent skip is NOT the cause of 0 trades — verified)
- `familyMismatchDenominatorTotal: 5408` (correct denominator: 1846+289+3273 mismatches)

**Endpoint load time:** ~60s → 0.94s (60× speedup). Was caused by (a) `signal_eval_archive` queries referencing 4 nonexistent columns (`regime`/`null_reason`/`signal_generated`/`trade_opened`) that silently failed; (b) `COUNT(DISTINCT date_trunc('second', captured_at))` over millions of tick rows hit 60s statement timeout. Both replaced with cheap in-memory reads from `scanner.diag.evalCountersLifetime`.

### Why 0 trades right now (Mon evening, post-RTH-close)

**Not infrastructure** — every counter populates correctly, every silent-skip path now has telemetry. **Pure detect-time strategy nulls:** pattern strategies (`scanPatterns()` not finding chart patterns on 1m equity bars), quant strategies (thresholds tuned for crypto microstructure, not equity 1m). This is Layer-3 calibration territory.

**Pattern path filter calibration concern (Kyle 2026-05-12):** `di_min=3` is very lenient — admits 435 pairs to pattern lane, but pattern strategies still return null because `scanPatterns()` doesn't detect actual chart patterns in noisy after-hours data. **Generous filter ≠ generous signal flow.** Layer-3 evidence-driven calibration needed once Tuesday-Friday RTH evidence accumulates.

### Verified gates pre-RTH (Mon evening)

- G1 effective GREEN (Build+Docker; TS+Test at pre-existing legacy baseline)
- G2 GREEN (4 pattern rows seeded)
- G8 GREEN (crypto ORB admitted=0/24h, rollback trigger NOT tripped)
- G10 PARTIAL (10 factor families emitting; +30min re-check still pending)
- G12 GREEN (26 wildcard rows resolve cleanly)

### Pending RTH 2026-05-12 13:30 UTC (Tuesday morning)

G3-G7 + G9 trade-flow verification:
- `vts_open_trades WHERE asset_class='xstock_spot'` ≥ 1
- `signal_eval_archive` rows with `features->>'sourcePool' = 'pattern'` AND `reject_stage='admitted'`
- B73 replay row in `exit_strategy_alternates WHERE asset_class='xstock_spot'` after first xstock trade closes
- `patternRejectByMinHistory` should stay near 0 (60-bar floor is correct for normal-volume RTH cycles)

### Kyle's 9 catalog of issues — status

| # | Issue | Status |
|---|---|---|
| 1 | Slow tab load (~60s) | ✅ FIXED — 0.94s |
| 2 | Pattern path 0 pair-pool/strategy evals | ✅ FIXED via per-lane counter split |
| 3 | Last scan filter breakdown missing global-filter line-by-line | ⏸ NOT a bug — xstock global filter is permissive; counters legitimately 0. Verify UI doesn't omit zero rows next session |
| 4 | 24h pattern path "no DI failures" | ⏸ Layer-3 calibration concern (di_min=3 too lenient) |
| 5 | Pattern path dead after VTS destination | ✅ FIXED (same as #2) |
| 6 | Family-mismatch 158.8% rate (math broken) | ✅ Endpoint surfaces correct denominator. **Frontend UI math fix still queued** — `machine-learning.tsx` divides by old denominator |
| 7 | No pattern nulls in pre-eval skips | ✅ FIXED via patternStrategyNulls field |
| 8 | 8 signals → 0 trades no visible reason | ✅ FIXED via setupHashDeduped counter (verified NOT the cause) |
| 9 | Remove Per-Pair Fresh-Tick Latency table | ✅ REMOVED |

## NEXT SESSION — Resume sequence

1. **Read this MEMORY file first.** Then read `Claude Comms and Packages/Batch Completion/BATCH_79_0m_b2_COMPLETION_REPORT.md` (the closure addendum at the bottom catalogs the 6 follow-up commits).
2. **Check staging xstock counters at RTH-open or post-RTH:**
   ```bash
   ssh root@188.245.193.8 'TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"testuser123\",\"password\":\"SecurePass123!\"}" | python3 -c "import json,sys; print(json.load(sys.stdin)[\"accessToken\"])") && curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/xstocks/filter-diagnostics" | python3 -m json.tool' | less
   ```
3. **Check first xstock trade:** `SELECT COUNT(*) FROM vts_open_trades WHERE asset_class='xstock_spot';` — if ≥ 1, batch is functionally complete and banner can come off.
4. **If patternRejectByMinHistory dominates** → Layer-3 60-bar-floor calibration pull-forward.
5. **If pattern lane admits but no signals** → Layer-3 calibration pull-forward to tighten pattern filter (di_min likely needs to rise from 3 to ~30-40 for equity) and/or tune per-strategy thresholds.
6. **ORB rollback trigger check** (§-1.7): re-run baseline SQL; verify crypto ORB admitted=0 and no new reject_stage values.
7. **Two known follow-up items queued (non-blocking):**
   - Frontend math fix: `machine-learning.tsx` family-mismatch % should consume `vtsEvaluation.familyMismatchDenominatorTotal` (currently divides by `strategiesEvaluated` only, showing 158%/177% instead of correct ~60%)
   - ORB `setNullReason` on early-return paths (replace `unknown: 279` with `orb_outside_active_window`, `orb_atr_zero`, etc.)
8. **Issue #3 (filter breakdown UI gap)** — investigate whether the UI actually omits zero-failure global-filter rows or shows them as zeros; verify on staging.

**Calibration concern (Kyle 2026-05-12) — for follow-up sub-batch:** pattern path `di_min=3` lets 435 pairs into pattern lane but `scanPatterns()` returns null on all of them. Generous lane filter ≠ generous signal flow. Tighten DI floor based on RTH evidence, AND/OR investigate whether `scanPatterns()` needs equity-specific tuning (currently crypto-tuned ATR multipliers at lines 553-554).

---

## NO-TOUCH FENCE on crypto_spot through 2026-05-15

```sql
SELECT factor_name, COUNT(*) FROM regime_factor_alternates
WHERE asset_class='crypto_spot' AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name;
```
If cadence drops post-deploy → halt and revert.

---

## OPERATIONAL FACTS

- xstocks 24/5 ARCA-aligned + 10 Kraken Phase-1 24/7 names (TSLA, AAPL, SPY, QQQ, GLD, GOOGL, HOOD, MSTR, NVDA, CRCL — bypass ARCA gate). $1000 base → ~$150/trade sizing.
- Kraken WS-equities silent on weekends regardless of 24/7 marker (RUNNING_ISSUES #89). Future B79.x: REST polling fallback OR Kraken Pro feed-tier investigation.
- xstock + perp feeds archived via B74 (renamed to xstock_*_ohlc_1m / xstock_*_ticker_snap in B79.0e).
- B74 Kraken Futures REST live at `server/services/passive-archive/equity-perp-archiver.ts`.

---

## LANGSTON RUNTIME + COMMS — see CLAUDE.md §6 + §8

Two systemd bridges on Hetzner `204.168.141.77`. Unified inbox log `/var/log/cc-bridge-inbox.jsonl`. Send protocol = 3 steps (Telegram visibility + SSH-deliver via direct `claude -p` + verbatim relay back to Telegram). Empirical-confirmed details now in CLAUDE.md §6.5.0/6.5.1/§8.2: use `--permission-mode bypassPermissions` (NOT acceptEdits — hangs on Bash); scp-stage files to `/home/langston/inbox/<batch>/` (GDrive rclone cache lag hides new files from `/mnt/gdrive/...` for many minutes); fresh UUID every send.

---

## Kyle Operating Directives (active, condensed)

- **NO PATCHES** (CLAUDE.md §5 #15). Long-term sustainable solutions only. Architecture decisions documented BEFORE implementation, same session.
- **Per-asset-class config is the default** for behavioral knobs. Wildcards only as starting placeholders.
- **Backpressure: vertical-scale, never asset-class shedding.**
- **Each new asset class gets its OWN dedicated observation UI tab** — don't stack panels under existing tabs.
- **Don't dump every lesson into workflow docs** (Kyle 2026-05-10). Only standing rules. Trial-and-error history lives in completion reports.
- **No fallbacks for DB-governed settings.** Sensitive credentials → staging `.env` via SSH only.
- **Kyle messages me here in Claude Desktop.** Telegram is for Kyle ↔ Langston + CC outbound visibility only.
- **No-touch fence on crypto_spot through 2026-05-15.**
- **Iterate with Langston to consensus** — escalate to Kyle only on deadlock / scope expansion / new directive / risk boundary.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` (canonical blueprint)
4. `1-system-manual/POST_AUDIT_ROADMAP.md` (current phase)
5. `Claude Comms and Packages/Batch Completion/BATCH_79_*_COMPLETION_REPORT.md` (most recent closures for trial-and-error history)
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
