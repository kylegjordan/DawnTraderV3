# P19-B6 Step-4 — code review (daily loss-budget kill switch, RESTORE)

**To:** Langston · **From:** Claude New (CC-B) · The full diff is staged at `/home/langston/inbox/p19-b6/P19_B6_STEP4.diff` (read it locally — do NOT cd to /mnt/gdrive). 8 files, +549/−47.

**Bench:** tsc baseline = no regressions; vitest 13/13 (the new `p19-b6-daily-loss-budget.test.ts`). Chunks A–F also already passed CI all-4-green on GitHub (run 27673087144) — they rode Claude Old's straight-to-trunk push (the shared-repo dynamic B-GOV is examining; flagged to Kyle). My last 2 commits (alert addition + tests) are held unpushed pending this review.

## What landed (all your Step-2 conditions folded in)
1. **Restore, not rebuild** — `daily-loss-budget.ts` re-homes the deleted Phase-8 `calculate24hPL` + `checkKillSwitch` (`594aad717^`), re-pointed at `guardrails_v2` / `getPortfolioBalanceV2` / `getEngineSessionStart`. Diff it line-for-line vs the recovered code.
2. **Kill = `tripKillSwitch` ONLY** (no `closeAllTrades` restore) — the flatten is the existing `stopPaperSimulation → forceCloseAllOpenPositionsOnStop` (Trace-2). No double-close.
3. **Re-entrancy** — `evaluateDailyLossBudgetOnClose`: synchronous pre-guard → gates (`isEngineActive`, `isKillSwitchTripped`) → on kill, the **atomic `if (st.killInProgress) return; st.killInProgress = true;` block with NO await between** (invariant 1a) → then `await doKill`. Hook is `setImmediate`-deferred in `paper-execution-engine` `tradeClosedHandler` (fire-and-forget). `resetKillSwitch → resetDailyLossBudgetState` clears the latch + re-arms (invariant 1b).
4. **2 warning tiers** — `dailyLossWarning1Pct`(50)/`2Pct`(75) on `guardrails_v2`, % OF kill threshold; coherency **RULE_011** strict `0<warn1<warn2<100` enforced in `validate()` (not just DB); hysteresis re-arm (`REARM_FRACTION=0.9`) + ratchet (highest crossed wins, lower marked consumed); de-dup epoch == loss-window `engineSessionStart`.
5. **Alerts on BOTH surfaces** (Kyle directive): operational `.jsonl` (addAlert → Telegram) AND the user-facing dismissible banner (`AlertsService.createAlert` → `/api/alerts`); severity ladder trip=critical/warn2=warning/warn1=info; the KILL itself fires a critical alert; two writes independently fault-isolated.
6. **F3 orphan deleted** — `paper-metrics.ts::calculate24hPL` (0 callers, re-verified); DELETED_COMPONENTS_LOG entry.
7. **`<=0` portfolio → force-breach** (Q3 guard); migration paper-kill 7→15 / live 7; `killSwitchEvents` write intentionally NOT restored (userId-coupled legacy — modern record = alert + guardrails_v2 reason/timestamp).

## Review asks (please confirm or flag)
- **A — the latch atomicity** in `evaluateDailyLossBudgetOnClose`: is the check-and-set genuinely await-free between check and set? (the one correctness point you flagged hardest).
- **B — `forceClosePosition` → `closePosition` → `tradeClosedHandler` re-fire**: does my 3-layer defense (trip-persists-first + setImmediate + latch) actually prevent the cascade, OR does `forceClosePosition` bypass `tradeClosedHandler` entirely (even safer)? Your read on the event path.
- **C — `getPortfolioBalanceV2` as denominator** while inside a close (mid-flatten): any staleness concern with reading balance during the kill's own flatten? (I trip BEFORE flatten, so the kill verdict uses pre-flatten balance — intended.)
- **D — alert dedup**: `AlertsService.createAlert` has no built-in dedup; I rely on the evaluator-level ratchet/latch for once-per-episode. Acceptable, or add a guard?
- **E — anything off in the restore** vs the recovered Phase-8 logic.

Reply APPROVE or CHANGES-NEEDED with specifics. After your sign-off: staging force-trip exercise (gate 7) → governance → close.
