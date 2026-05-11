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

## CURRENT STATE — 2026-05-11 EOD (B79.0m.b2 SHIPPED PM2 #229; xstock pipeline at functional crypto parity, RTH-verification pending)

✅ **B79.0m.b2 deployed** — commits `4c60d259e` (main) + `909182690` (test fixup). PM2 #229. Pattern path + family fan-out + ORB LONG-only + B73 xstock branch + Drizzle drift fix all landed.

**G1-G2-G8-G10-G12 verified pre-RTH (weekend close):**
- G1 effective GREEN (Build+Docker; TS+Test at pre-existing baseline RUNNING_ISSUES #39 + 66 `module_constants not warm`. All 28 of my new tests pass.)
- G2 GREEN — 4 pattern rows seeded (`vts_pattern`/`active_pattern` × paper/live) with cloned crypto values.
- G8 GREEN — crypto ORB admitted=0/24h (rollback trigger NOT tripped).
- G10 PARTIAL — all 10 factor families emitting; 5/hr in 1h window is restart noise (re-check at +30min).
- G12 GREEN — 26 pattern-strategy wildcard rows confirmed; fallback unit-test validates resolution.

**G3-G7 + G9 PENDING RTH 2026-05-12 13:30 UTC:** xstock scanner correctly short-circuiting on weekend market-closed. First live cycles will surface `patternFanOut`, `pairsPassedPattern`, signals, trades, B73 replay rows. xStocks tab banner stays up until trade flow observed.

**Pre-deploy crypto ORB baseline captured (§-1.7 rollback trigger ready):** admitted=0, total=77,919 invocations/24h all `strategy_internal`. Post-deploy at +1h: re-run + check for any new admit OR new reject_stage value.

## What's new vs. B79.0m.b

- ✅ Parallel pattern path (4 new screener_filters rows + `pattern-filter.ts` + parallel global+IMF gate in eval-cycle)
- ✅ Family fan-out (`isStrategyEligibleForLane` in `lane-eligibility.ts`; pair × lane × strategy iteration mirrors `fx5-scanner.ts:1607-1643`)
- ✅ ORB LONG-only fix + `STRATEGY_FAMILY_MAP['orb'] = 'breakout'`
- ✅ B73 replay asset-class branch (xstock symbols read `xstock_spot_ohlc_1m`; EXPLAIN ANALYZE 1.035ms verified pre-deploy)
- ✅ Drizzle schema-file drift fix
- ✅ 7 Langston Step 4 nits applied inline (lane-eligibility extracted, ORB docblock, DI band tests, vi.fn assertion, archiveFailures counter)

## Resolution discipline next session

1. Read `Claude Comms and Packages/Batch Completion/BATCH_79_0m_b2_COMPLETION_REPORT.md` for full state
2. Check Hetzner staging xstock-tab + PM2 logs post-RTH for G3-G7 + G9 trade-flow verification
3. If any xstock trade closes during RTH window, verify B73 replay row appears in `exit_strategy_alternates WHERE asset_class='xstock_spot'`
4. If G3-G7 GREEN, remove xStocks banner + write closure addendum to completion report
5. If pattern path admits zero pairs → `patternRejectByMinHistory` tripwire will tell us instantly; Layer-1 60-bar floor is the prime suspect (see §-1.1 design + §-1.10 calibration debt)
6. ORB +1h post-deploy check per §-1.7: if any new crypto ORB admitted appears OR new reject_stage value, revert single line `orb: 'breakout',` from `STRATEGY_FAMILY_MAP`

## NEXT STEP — Wait for RTH and verify G3-G7 + G9 trade flow

RTH opens Monday 2026-05-12 13:30 UTC = 9:30 AM ET. First xstock cycles after 13:30 should show:
- `patternFanOut > 0` (pattern lane admitting at least some pairs)
- `pairsPassedPattern > 0`
- `signal_eval_archive` rows with `features->>'sourcePool' = 'pattern'` AND `reject_stage='admitted'`
- `vts_open_trades` count for `asset_class='xstock_spot'` ≥ 1
- B73 replay row in `exit_strategy_alternates WHERE asset_class='xstock_spot'` after first xstock trade closes

If `patternRejectByMinHistory` dominates the counter, the 60-bar floor is biting; pull a Layer-3 calibration into a sub-batch.

## Open Langston follow-ups logged

**B79.0m.a SHIPPED + VERIFIED on staging PM2 #216** (HEAD `0a9d85588`). Threshold authoring + 19 strategy_gates + 10 family-IMF rows + 3 regime classifier rows + xStocks tab amber banner + CLAUDE.md §9.1/§9.2 rules.

## Open Langston follow-ups + Phase 24 architectural rules

See `1-system-manual/SYSTEM_MANUAL.md` appendix for the 5 Phase 24 standing rules. See `RUNNING_ISSUES.md` for: per-asset-class DBS computation; macro source unification; computeContext options-object refactor; B79.TEC HARD-FAIL extension; Kraken WS-equities; governance-doc schema drift; B79.3 equity macro modifiers; B79.0n active-trading wire-in.

Most recent before B79.0m: B79.0g-tx PM2 #215; B79.0L PM2 #214; B79.0m.a PM2 #216. Full history in `BATCH_CATALOG.md`.

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
