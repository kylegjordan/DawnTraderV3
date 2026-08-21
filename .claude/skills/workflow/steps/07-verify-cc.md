# STEP 7 — FIRST-PASS VERIFICATION (CC)

**Ends when:** evidence is captured **and the UI has been navigated**.

## ⛔ "STAGING VERIFIED" MEANS UI-NAVIGATED, NOT CURL-CHECKED
It is **NOT** satisfied by a successful API curl, a psql row count, a PM2 log line, or a build + restart. Those are backend health checks — **they do not prove the panel renders, that values are not showing as "--", or that the layout is not broken.**
**Requires:** navigate the staging URL in the browser, read the actual DOM, cross-check rendered values, screenshot where useful.

## ⛔ UI VERIFICATION IS THE DEFAULT, NOT AN EXTRA
With active trading on, **most changes have a staging-visible surface.** For any change with one, load the affected tabs and verify it renders and behaves. **"Working in the background but not showing on the front end" is a failure state Kyle cannot detect.**
**If there is genuinely no UI surface, SAY SO AND SAY WHY** — state the judgement rather than skipping the step.

## ALSO
- PM2 logs, psql, CI status, server health — **as well as**, not instead of.
- ⚠️ **The application log retains only a couple of hours.** An empty grep over an older window proves nothing; **state the window the instrument actually covers.**
- **Every issue Kyle raises gets reproduced, located in code, and quoted from real data** — never dismissed, never marked N/A without evidence.
