---
name: workflow-07-verify-cc
description: STEP 7 ONLY of the DawnTrader batch workflow - first-pass verification by the implementing Claude session. Use when gathering evidence that a deployed change works - PM2 logs, Supabase queries, and mandatory navigation of the staging UI in a browser. NOT for Langston second-pass verification, which is step 8.
---

# STEP 7 — FIRST-PASS VERIFICATION (CC)

**Ends when:** evidence is captured **and the UI has been navigated**.

## ⛔ "STAGING VERIFIED" MEANS UI-NAVIGATED, NOT CURL-CHECKED
It is **NOT** satisfied by a successful API curl, a psql row count, a PM2 log line, or a build + restart. Those are backend health checks — **they do not prove the panel renders, that values are not showing as "--", or that the layout is not broken.**
**Requires:** navigate the staging URL in the browser, read the actual DOM, cross-check rendered values, screenshot where useful.

## ⛔ UI VERIFICATION IS THE DEFAULT, NOT AN EXTRA
With active trading on, **most changes have a staging-visible surface.** For any change with one, load the affected tabs and verify it renders and behaves. **"Working in the background but not showing on the front end" is a failure state Kyle cannot detect.**
**If there is genuinely no UI surface, SAY SO AND SAY WHY** — state the judgement rather than skipping the step.

⛔⛔ **STAGING NEEDS NO LOGIN — IN *CLAUDE-IN-CHROME*. THE TOOL YOU PICK DECIDES THIS, AND THAT IS THE WHOLE DISTINCTION (Kyle directive 2026-08-28, MEASURED the same day).**
★ **Kyle, who has had to say this repeatedly:** *"I keep getting sessions telling me that they can't go to the staging site because they need a login and password. They don't need one. They just need to use Chrome for Claude and then navigate to it."*

| surface | verdict |
|---|---|
| ✅ **Claude: `mcp__claude-in-chrome__*`; Codex: the bundled Browser plugin's Chrome backend, following `staging-browser-access`** — Kyle's real Chrome, carrying his session | ⛔ **THE ONLY SURFACE FOR STAGING.** **The full dashboard loads with NO LOGIN** *(measured 2026-08-28: portfolio, Ready-to-Buy, Filter Health, strategy table all rendered).* Codex must not substitute desktop-wide Computer Use or ask Kyle for screenshots while the browser-scoped signed-in tab is available. |
| ⛔⛔ the in-app Browser pane (`mcp__Claude_Browser__*`) | ⛔⛔ **DO NOT USE IT FOR STAGING. IT IS A DEAD END, NOT AN ALTERNATIVE.** It serves a `"Welcome Back / Sign in"` form, and **a session MAY NOT TYPE A PASSWORD INTO A FORM** — a hard boundary, not a permission we can grant. ⇒ **it can never get past that page, no matter what credentials exist.** |

⛔⛔ **THAT IS WHY THIS IS A PROHIBITION AND NOT A COMPARISON (Kyle, 2026-08-28).** ★ **His correction: *"if you need login details and the ability to log in with a password using the in-app method, then that can't work — so that needs to be removed, or we explicitly say don't use the in-app login method."*** ⚠️ **My first version described it as an option that merely *needs the credentials*. It is not an option. Documenting a dead end as a choice invites a session to spend a turn discovering it.**
✅ **AND NO AMOUNT OF TEST CREDENTIALS FIXES IT — the constraint is the TYPING, not the account.**

⛔⛔ **THE LANDING DASHBOARD IS STALE WINDOW DRESSING — IGNORE EVERYTHING ON IT (Kyle, 2026-08-28).** *"Nothing has been updated on that in over six months… old alerts and messages and warnings that we don't need to listen to."*
⚠️ **MEASURED THE SAME DAY, AND IT CAUGHT ME: I read its *"database 153.37 GB — 1533.7% of the 10 GB limit"* banner and a *"CRITICAL"* alert from 8/14 and filed them as a finding. Both are dashboard furniture.**
⇒ ★ **VERIFY ON THE TAB YOUR BATCH TOUCHED — Filter Diagnostics, Ready-to-Buy, Open/Closed Trades — NEVER on the landing page.** ⛔ **A stale banner read as live telemetry is a finding you will have to withdraw, and it costs Kyle a turn.**

⇒ ⛔⛔ **"I NEED CREDENTIALS" IS NOT A REASON TO SKIP THIS STEP — IT MEANS YOU REACHED FOR THE WRONG BROWSER.** ★ **Both halves are true, which is exactly why sessions keep getting it wrong: the login wall is REAL on one surface and ABSENT on the other, and the rules file listed the credentials without ever saying which.**
⚠️ **The `testuser123` credentials in `CLAUDE.md` §7 serve the AUTHENTICATED API CALL in that same section, and nothing else. They are NOT a precondition for §9.3 verification, and no session can log in with them.**
★ **This line read *"serve the in-app browser AND the API calls"* until 2026-08-29 — describing the credentials as serving a surface this same section PROHIBITS three paragraphs above.** ⇒ ⛔ **The surviving half of the dead end Kyle told me to remove: I forbade the pane in one place and left it named as a legitimate consumer in another.** *(Langston, Step-4 finding 2.)*

## ALSO
- PM2 logs, psql, CI status, server health — **as well as**, not instead of.
- ⛔ **A database read goes through `dt-sql` (`CLAUDE.md` §7), never a hand-built `psql` login.** On 2026-11-16 one hand-built login sent the password still URL-encoded, psql's default retried it without SSL, and two wrong passwords banned the staging server's address for ~60 min (`#1259`). `dt-sql` uses the database-enforced read-only role `dt_reader`, makes one verified-TLS attempt, and locks itself after any refused or unclear login. **An empty result from `auth` or `storage` is not absence:** RLS makes 26 such tables read as empty to this role. *(The verbatim §2 line below still says "psql to Supabase"; it is preserved history, not the instruction.)*
- ⚠️ **AN EMPTY GREP OVER AN OLDER WINDOW PROVES NOTHING — STATE THE WINDOW THE INSTRUMENT ACTUALLY COVERS.** ⛔⛔ **BUT DO NOT DECLINE THE CHECK ON THE OLD “retains only a couple of hours” CLAIM THAT STOOD HERE — IT WAS WRONG IN BOTH DIRECTIONS AND IT WOULD HAVE MADE A SESSION REFUSE A CHECK THE ARCHIVES CAN ANSWER (measured 2026-09-03, CC-C).** ★ **SINCE 2026-11-20 THE SYSTEM `logrotate` ROTATES** (hourly timer, config `/etc/dawntrader/logrotate-app.conf`, `B-DISK-FILE-TIERING` P9); `pm2-logrotate` is uninstalled. ⛔ **READ THE RETENTION, NEVER QUOTE IT:** the count and age kept per stream are in that conf (at the ref: `comms-infra/staging/logrotate-dawntrader-app.conf`), and the reach actually on disk is `ls /var/log/dawntrader/error__* /var/log/dawntrader/out__*`. **The out stream reaches far less far back than the error stream, because of volume.** *(Under `pm2-logrotate`, measured 2026-09-03: 14 files per stream ⇒ error 14 days, out ~3.5 days.)* ⚠️ **SINCE THAT INSTALL, TWO NAME CHANGES BREAK A HAND-TYPED GLOB:** an archive is named with the **real run instant** (e.g. `error__2026-11-21_00-01-37.log`, not `_00-00-00`), and it is **compressed one rotation later** (`.log` → `.log.gz`) ⇒ **glob `error__<D>_*.log*` and read with `zgrep` / `zcat -f`, or a compressed day reads as empty.** ⭐ **THE ASYMMETRY IS THE OPERATIVE FACT, because every exit-path skip/refusal line is `console.warn`/`console.error` and therefore lands in the LONG-LIVED stream** — `/var/log/dawntrader/error.log` plus its `error__<date>` archives, NEVER `out.log`. ⛔⛔ **AND THE FILENAME IS THE *ROTATION INSTANT*, NOT THE CONTENT DATE — SO EVERY ARCHIVE HOLDS THE **PRECEDING** DAY (measured 2026-09-03; CC-B hit the false negative, I verified it at the object).** `error__2026-08-31_00-00-00.log` runs `2026-08-30 00:00:01` → `2026-08-30 23:59:58`. ⇒ **TO READ DATE `D`, OPEN THE FILE NAMED `D+1`.** ⛔ **THIS IS THE SILENT-MISS TRAP: grep the file named for the date you want and it returns NOTHING — which reads as ‘the event did not happen’ when it means ‘wrong file’.** ⛔ **READ THE REACH, NEVER QUOTE IT — AND SUBTRACT A DAY:** `ls /var/log/dawntrader/error__*.log* | head -1` names the oldest ARCHIVE, whose CONTENT starts the day BEFORE it (measured: oldest file `error__2026-08-21`, content floor **2026-08-20**). **The safe move is to confirm with `head -1 <file>` rather than trust either the name or a figure written here** — a figure goes stale silently, and a filename lies by one day every time.
- **Every issue Kyle raises gets reproduced, located in code, and quoted from real data** — never dismissed, never marked N/A without evidence.

## ⛔ VERIFY THE THING THAT CHANGED, WITH THE INSTRUMENT THAT SHOWED THE PROBLEM
**"The server came back up" is not verification. Neither is "no errors in the log."**
- **Re-run the SAME measurement that established the problem.** A different instrument showing a different number proves nothing about the change; **the same instrument, before and after, is the only comparison that carries.**
- **PROVE THE INSTRUMENT FIRST.** Run it where you already KNOW the answer — the positive control — before reading its silence as good news. *(Three log-filter tests read as PASS while processing nothing at all: a missing header meant every line was silently dropped. It was caught only when a known-good line also produced nothing.)*
- ⛔⛔ **A POSITIVE CONTROL MUST MATCH THE POPULATION’S *SIZE*, NOT ONLY ITS *STREAM* (Langston, 2026-08-23).** A fixture drawn from the right source but the wrong SHAPE passes while the real thing fails. **MEASURED:** an alert-routing fix was proven with six hand-written controls — correct stream, correct field, all passing — and shipped a mechanism that could not execute on **99.5%** of real traffic, because the controls were a few hundred characters and the real bodies have a **median of 2,289**, putting the matched token past a 400-char truncation. **Re-run against the REAL population: old code routed 4 of 1,026; the fix routes 1,018.** ⇒ **Before trusting a control, ask what the real inputs LOOK like — length, position, multiplicity — and draw at least one fixture from the actual data.**
- ⛔ **TESTING THE FILE IS NOT TESTING THE PROCESS.** A running service holds the code it started with. **Verifying a fixed file proves the file; it says nothing about the process still running the old one.**


## ⛔ BEFORE THIS STEP LEAVES YOUR HANDS — REVIEW IT THE WAY LANGSTON WOULD
**Against the OBJECT, not your memory** (`CONDUCT.md` §6b — the full mechanism and why it is positional rather than clever). This step IS the object-check — but apply it to your own evidence too: **prove the instrument on a known answer, and confirm your fixtures match the real population’s SIZE, not just its source.**
✅ **Fix what you find and move on.** In-task corrections belong in the commit message, **never in a report to Kyle.**

### ★ AND FOR A LOAD-BEARING CLAIM — A FRESH READER (`1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §1 · `WI-F1`)
⛔ **Read §1 of the shared contract before this step publishes a number, a cause, an absence or a completion it rests on. The rule is held there once, word for word, and that text is authoritative.** The trigger, in short: spawn a fresh reader without asking (Kyle's standing approval, 2026-08-27); hand it the object and the claim, or **the claim alone for any mechanism or absence claim (mandatory)**; one reader, one pass, then Langston; a hit is a lead to re-derive at the ref, a clean is never evidence; leave the `REVIEWER:` record; label any load-bearing claim you did not route `NOT RE-READ`.

## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
Move the card to **`Verification`**.
★ **The board rules every step shares — Langston sets `Review`, the session moves the card, nothing automates it, and the card holds status, owner, order and the description only — are in `1-system-manual/WORKFLOW_SHARED_CONTRACT.md` §2 (`WI-B1`).** Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.

---

## THE ORIGINAL RULES-FILE TEXT — ARCHIVED (`WI-A07`)
The word-for-word `CLAUDE.md` §2 text for this step is archived, unchanged, at `1-system-manual/_archive/WORKFLOW_SKILL_ORIGINAL_TEXT.md` (`WI-A07`; B-WORKFLOW-IMPROVE Q10, 2026-11-20). **Every rule in it is carried by the summary above;** the archive keeps the origin cases, dates and issue numbers. Read it when a rule's history matters.
