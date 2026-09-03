---
name: monday-slot-jam-recheck
description: One-time Monday 2026-07-27 check: is the RTB pool + open-trade slots trending back toward the July 18-22 slot-jam?
---

One-time check (Kyle-requested 2026-07-25) — has the ready-to-buy (RTB) pool and the open-trade slots started trending back toward the slot-jam we saw the week of July 18-22? This is a FRESH run with no memory of the prior conversation; everything you need is below.

BACKGROUND (verified context): The week of 2026-07-18 to 07-22 the RTB pool backed up to ~100 signals and the open-position slots jammed. Root cause: open positions filled with xStocks that opened Friday and were held through the weekend (xStocks are suspended over the weekend, and their order-book activity also drops outside US trading hours, so overnight/weekend positions get stuck), PLUS a broken time-exit so nothing cleared them. With slots full, new signals could not promote and piled up in the pool. It cleared 07-23 when the exit path was fixed and turnover resumed. The max-hold time-exit was PAUSED again on 07-24 (Kyle's choice), so the jam can re-form this week. A healthy state is: RTB pool ~1-5, open positions cycling with few old ones. The jam signature is: open positions near the cap (~15) AND xStock-dominated AND many older than 24-48h, AND the RTB pool rising into the tens or hundreds.

DO (keep it to a few queries + one Discord post):
1. Query the live DB. Pattern: ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && set -a && . ./.env && set +a && psql \"\$DATABASE_URL\" -c \"<SQL>\"'"
   a. RTB pool size: SELECT COUNT(*) FROM rtb_signals;
   b. Open positions by class + age: SELECT asset_class, COUNT(*), COUNT(*) FILTER (WHERE opened_at < now()-interval '24 hours') AS over_24h, COUNT(*) FILTER (WHERE opened_at < now()-interval '48 hours') AS over_48h FROM active_open_positions GROUP BY 1;
   c. Oldest open positions: SELECT symbol, asset_class, ROUND(EXTRACT(EPOCH FROM (now()-opened_at))/3600.0,1) AS age_h FROM active_open_positions ORDER BY opened_at ASC LIMIT 15;
2. ASSESS against the jam signature above. Trending-toward-jam = slots filling + xStock-dominated + many old (>24-48h) + pool rising above ~5. Healthy = low pool + positions cycling.
3. POST the result to Discord #general: ssh root@204.168.141.77 'cc-send --sender "Monday-Jam-Check" --message "<plain-language finding naming OLD Claude / NEW Claude / ANALYST Claude so their wake watchers fire>"'. State plainly: current pool size, open-slot count + how many are stuck old xStocks, and whether we are trending toward last week's jam. Add --notify (to @-mention Kyle on his phone) ONLY if trending toward the jam; otherwise post without --notify (quiet if healthy).
4. If trending toward the jam, note in the post that three candidate solutions are on file for discussion in `Claude Comms and Packages/Langston Design Asks/XSTOCK_TRADING_WINDOW_AND_EXIT_NOTES.md`: (a) Friday dampening of new xStock entries before the weekend; (b) a non-time-based exit that clears positions gone stale/inactive; (c) per-xStock time-of-day entry gating from order-book activity. So the discussion is teed up.

Plain language in the Discord post — Kyle reads it directly.