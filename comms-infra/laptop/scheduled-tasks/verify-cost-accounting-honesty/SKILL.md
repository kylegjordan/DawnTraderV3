---
name: verify-cost-accounting-honesty
description: One-time §9.3 verification of B-COST-ACCOUNTING-HONESTY once trades have closed post-deploy (gross on actual fills, cost line = fees only, never negative)
---

You are Claude Analyst (CC-C) on DawnTrader V3. This is the deferred §9.3 verification for batch B-COST-ACCOUNTING-HONESTY, which deployed to staging on 2026-07-28 at ~11:57 UTC (pm2 restart #537, head c4b9abfb5 in branch head 795d8c92e). At deploy time NO trade had closed yet, so the new semantics could not be verified on a live row — this task closes that gap.

WHAT THE BATCH CHANGED (three sites: the engine close path in server/services/active-execution-engine.ts, the manual-close path and the open-positions display in server/routes.ts):
- gross P&L is now computed from ACTUAL fill prices: (actualExit - actualEntry) * quantity  (previously it used the INTENDED/requested prices)
- the cost line is now EXPLICIT COSTS ONLY: totalCost = entryFee + exitFee  (slippage is no longer deducted — it is already inside the actual fill prices; deducting it too would double-count)
- netPnlPercent (and pnlPercent) now divide by ACTUAL entry value, not intended entry value — this is a BASIS change, the one number that genuinely moves
- slippage columns are RETAINED as signed execution-quality telemetry (positive = cost), reported but NOT deducted
- NET P&L IS PROVABLY UNCHANGED — this was verified pre-deploy on 298/298 closed trades with zero divergences

DO THIS:

1. Query staging for trades closed AFTER the deploy:
   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && set -a && . ./.env && psql \"$DATABASE_URL\" -c \"SELECT symbol, closed_at, close_reason, gross_pnl, total_cost, net_pnl, net_pnl_percent, entry_fee, exit_fee, entry_slippage, exit_slippage, actual_entry_price, actual_exit_price, quantity FROM closed_trades WHERE closed_at > timestamptz '2026-07-28 11:57:00+00' ORDER BY closed_at DESC LIMIT 10;\"'"
   If ZERO rows: the verification is still pending — say so plainly and RE-SCHEDULE this task for +6 hours rather than declaring anything verified. Do NOT infer success from an empty result (an asserted absence needs presence-evidence).

2. For each post-deploy row, assert ALL of:
   (a) total_cost == entry_fee + exit_fee  (to 4dp) — the cost line is fees only
   (b) total_cost >= 0 — NEVER negative
   (c) gross_pnl == (actual_exit_price - actual_entry_price) * quantity  (to 4dp) — gross on actual fills
   (d) net_pnl == gross_pnl - total_cost (to 4dp)
   (e) net_pnl_percent == net_pnl / (actual_entry_price * quantity) * 100 (to 3dp) — the new basis
   Report each as PASS/FAIL with the actual numbers. A FAIL is a real defect — surface it prominently.

3. Confirm no NEW negative-cost rows have appeared:
   SELECT count(*) FILTER (WHERE total_cost < 0 AND closed_at > timestamptz '2026-07-28 11:57:00+00') AS neg_post_deploy, count(*) FILTER (WHERE total_cost < 0) AS neg_all_time FROM closed_trades WHERE closed_at IS NOT NULL;
   Expect neg_post_deploy = 0. The all-time count (57 at deploy) is HISTORICAL and stays by design — rows are not backfilled.

4. §9.3 UI check via Claude-in-Chrome: navigate https://188.245.193.8.sslip.io/paper-trading, click the "Closed Trades" tab, and confirm for a POST-DEPLOY row that the Gross P/L matches actual price movement and the Costs column is not negative. (Pre-deploy rows keep the old semantics — do not judge those.)

5. Report the result to Kyle in PLAIN LANGUAGE in this session's chat (no file paths, no function names, no code, no jargon; two paragraphs) AND post the same to Discord #general via:
   ssh root@204.168.141.77 'cc-send --sender "ANALYST Claude" --message "..."'
   If everything passes, say so plainly and note that the batch's §9.3 leg is now closed. If anything fails, state exactly which assertion failed with the numbers, and do not soften it.

GOVERNANCE: follow the DawnTrader CLAUDE.md rules — read it at the start; never suppress stderr on a git read; perform the §10.5 system-alerts check before responding. If this verification passes, update the batch's completion report (Claude Comms and Packages/Batch Completion/B_COST_ACCOUNTING_HONESTY_COMPLETION_REPORT.md) to record the §9.3 leg as VERIFIED with the evidence, then commit and push from C:\DawnTraderV3-analyst (git fetch origin first; pull before push).