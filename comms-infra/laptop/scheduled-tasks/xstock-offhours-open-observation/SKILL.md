---
name: xstock-offhours-open-observation
description: One-time: at US open, confirm the #569 overnight-slot-jam prediction and #566 US-hours-recovery inference with a second session of data
---

You are Claude New (CC-B) on the DawnTrader V3 project. This is a ONE-TIME observation task, fired ~45 min after the US market open (13:30 UTC), to gather a SECOND session of evidence for two things I claimed on 2026-07-22 but explicitly marked UNVERIFIED. Do NOT skip the plain-language rule for Kyle-facing messages (CLAUDE.md §1).

BACKGROUND (what you are testing):
- On 2026-07-22 I diagnosed a freshness problem (#548/#566) and an off-hours slot-jam problem (#569). Two claims were fenced as INFERENCE from a single day of data and must not be written up as fact until a second session confirms them:
  1. (#566) The "11 thin xStocks" do NOT exist — they only LOOK thin because I sampled at 21:05 UTC, ~1h after the US close. PREDICTION: during US hours (13:30-20:00 UTC) the slow names (C, MOS, ARKK, PM, CDNS) recover to a tick rate near the fast names (MU, INTC, ORCL). Yesterday C ticked 739-811/hr during US hours vs MU 812-886, collapsing to 57/hr by 21:00 UTC.
  2. (#569) xStock open positions cannot close overnight (mark stale -> freshness gate skips them -> the time-based exit is structurally unreachable), so the 15 shared slots stay JAMMED by xStocks through the whole off-hours window, starving crypto. PREDICTION: the 15 positions open overnight are still the SAME positions now (held continuously, none closed overnight), and they only begin closing after this US open.

WHAT TO DO (staging DB access: ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && set -a && . ./.env 2>/dev/null && set +a && psql \"$DATABASE_URL\" -t -c \"...\"'"):

STEP 1 — tick-rate recovery (tests #566). Query hourly tick counts for C/USD and MU/USD over the last ~20 hours:
  SELECT date_trunc('hour',captured_at) hr, count(*) FILTER (WHERE symbol='C/USD') c, count(*) FILTER (WHERE symbol='MU/USD') mu FROM xstock_spot_ticker_snap WHERE captured_at > NOW() - interval '20 hours' AND last>0 GROUP BY 1 ORDER BY 1;
  CONFIRM or REFUTE: does C recover toward MU's rate during 13:30-20:00 UTC and collapse after? Compute C-as-%-of-MU for the overnight hours vs the US hours.

STEP 2 — overnight slot jam (tests #569). Query the open positions and their ages:
  SELECT symbol, opened_at, round(EXTRACT(EPOCH FROM (NOW()-opened_at))/3600,1) hours_held, asset_class FROM active_open_positions ORDER BY opened_at;
  CONFIRM or REFUTE: were the slots held continuously across the overnight window (positions with hours_held spanning the whole US-closed period)? Are all/most slots xStock (starving crypto)? Also check whether any closed_trades rows have a close during the overnight window (00:00-13:00 UTC today) — if zero xStock closes overnight, that supports the "no time-exit fires" claim.
  SELECT count(*) FROM closed_trades WHERE asset_class='xstock_spot' AND closed_at > CURRENT_DATE AND closed_at < CURRENT_DATE + interval '13 hours';

STEP 3 — be disciplined about the epistemic status. State what the data CONFIRMS, REFUTES, or leaves ambiguous. If a claim is refuted, say so plainly — do NOT force the data to fit yesterday's story (that was the exact failure mode all of 2026-07-22). Check arithmetic and timestamps before asserting causation (CLAUDE.md rule 24.a).

STEP 4 — update the ledger. In G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\RUNNING_ISSUES.md, update #566 and #569: if confirmed, change the "one-day inference, unverified" fences to "confirmed over 2 sessions (2026-07-22 + 2026-07-23)"; if refuted, record the refutation prominently. Commit from the Google Drive folder with an attested explicit-path commit (CC_COMMIT_ATTESTED=1 git commit -F <msgfile> after git add of the explicit path; check git diff --cached --name-only holds only your path first) and push to origin/migration/aws-supabase. Plain descriptor commit subject (not a batch-id token).

STEP 5 — tell Kyle in plain language, in BOTH Discord #general (ssh root@204.168.141.77 'cc-send --sender "NEW Claude" --message "..."') AND note it for the desktop session. Two short paragraphs: what the second day of data showed, and whether it confirms or overturns yesterday's picture of how xStocks behave when the US market is closed. This feeds the B-OFFHOURS-BEHAVIOUR options paper (#569) Kyle needs to decide on. No jargon, no file paths, no table names in the Kyle-facing message.