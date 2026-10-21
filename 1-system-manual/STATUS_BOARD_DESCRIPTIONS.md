# STATUS BOARD DESCRIPTIONS — one plain-language line per pre-sprint item

> Read by the governance checker every 30 minutes and shown on Kyle's phone status board under each item (`B-STATUS-BOARD`, `#1227`). **One `### <batch id>` heading per item, the description in the lines below it, until the next heading.** An item with no batch id is keyed `### row <N>` (its sprint-plan row). Write for Kyle: what the item is for and what changes when it is done, in two or three sentences, real component names, no file paths or code. A description longer than 700 characters is still shown, and marked as too long.
> **The owning session keeps its own items current.** The starting set below was drafted by CC-A from each item's own plan row and issue entry on 2026-10-21; an owner who finds one wrong corrects it here. **Status and who an item is waiting on do NOT go here** — they live in the plan's pre-sprint table and its sprint rows, so there is one copy.
> **Boundary (Langston, gate B):** the board counts a description as owed only for the pre-sprint table's items. Sprint rows outside it show a description when one is written here, and no owed mark when none is.

---

## CC-A (Old Claude)

### B-STATUS-BOARD
This page. One place on Kyle's phone that shows the agreed pre-sprint and sprint plan, who holds each item, where it has got to and what it is waiting on, so he does not have to ask each session. The governance checker rebuilds it from the plan every 30 minutes.

### B-MUTATING-ROUTES-AUTH
A hotfix: staging server addresses that change something or run work answered without a login — among them the order-book monitor's start, stop and audit, the test routine's start and stop, the simulation-session flag, a conversation rename, a screener test, the recovery test and three audit runs. They now require one. Read-only addresses wait for the sprint row that covers them.

### B-B75-EXPORT-COMPLETENESS
Makes the B75 trade-record export prove it is complete before anything is archived or deleted from it, so a short export can never be mistaken for a full one.

### B-RULES-1e
Crew tooling: the last part of the rules programme, including the order the rules load in and Langston's 15-minute review ceiling. Parked until after live.

### B-MEASURE-GATE
The checks that warn a session when a measurement is the wrong shape before it is reported. Leg 2 (the warnings that run on every command) is built and live. Its pre-registered observation window is open: it needs at least 50 real warnings, at least 20% of them right, and one caught published claim, judged by a session that did not write it. Below 20% it is re-scoped or deleted; under 50 after one extension it is deleted.

### B-PLAN-CURRENCY-CHECK
Keeps the sprint plan current: the governance checker grades each finished batch's plan row and runs a weekly census of the plan, so the plan never silently falls behind the work.

### B-TOKEN-BURN-CUT
Stopped sessions being woken every 30 minutes for nothing: each session's wake watcher now ends on the first real message and resumes from where it stopped, cutting idle token use.

## CC-B (New Claude)

### B-ENTRY-GATE
Refuses a trade entry whose price has drifted too far from its plan, in either direction, and makes the RTB refresh re-price what it holds. Carries the entry re-check and the crypto birth-feed items folded into it.

### B-BOOK-CHECKSUM-CIRCUIT-BREAKER
Detects an order book that no longer matches the venue's, by the venue's own checksum, and switches that coin's book off until it is rebuilt, so no decision is made on a corrupted book.

### B-PRICE-FEED-COVERAGE
Most crypto signals are priced from a 30-60 second poll while the live feed is sub-second. This puts every signal on the live feed and gives "fresh" one definition across the pipeline.

### B-PLAN-PRICE-BASIS
A signal's stop and target are set from one "now" price that is a smoothed midpoint for crypto or a thin stock's last trade for xStock. This bases the plan on the price a real trade would get.

### B-BOOK-TRUST-FLEET-GUARD
Limits how many order books the checksum breaker can switch off at once, and makes a mass event raise one alert instead of one per coin.

### B-ENTRY-LEVEL-RECHECK
Re-checks an entry's price against its plan at the moment of entry. Moved into B-ENTRY-GATE by Kyle's locked list.

### B-CRYPTO-BIRTH-FEED
Prices a crypto signal at its birth from the live feed rather than the poll. Moved into B-ENTRY-GATE by Kyle's locked list.

### B-DISPLAY-TRIGGER-PRICE
The Open Trades screen shows the midpoint while crypto exits fire on the bid, so a trade looks further from its stop than it is. This shows the price that actually decides the exit, and the ask for entries.

### B-ENGINE-STOP-DURATION-COLUMN
An engine stop could not be recorded once a session had run about 25 days, because the run time overflowed its field; it has already halted a paper reset once. The fix stops storing that number, which can be worked out from the start and stop times.

### B-B75-SCRIPT-TEST-HARNESS
The B75 archive scripts' safety gates are tested by reading the code, not by running it. This runs them in a test so a broken gate is caught before it matters.

### B-FEED-MISMATCH-FIX
Fixes the price feeds the feed-by-situation audit found wrong and that CC-C's work does not cover (Kyle 2026-09-19). Its observation window ended; parked by Kyle, its progress report converts to a completion report at close.

### B-REACH-BASELINE-ADJUST
Replaced a theoretical placeholder baseline with numbers from the data we have gathered, as a new starting point to calibrate from later (Kyle 2026-09-15). Closed; Kyle kept the rows when the crowding check fired.

### B-XSTOCK-FEE-CONTRACT
Put xStock fees on the venue's real contract, including the maker rebate, so xStock net expectancy is computed on true costs.

### B-ARCHIVE-RETENTION-SIZING
A decision on the archive's retention windows, raised when the disk reached 65% of its cap. Closed as a decision item, with no code.

### T-W20C-SCALAR-LEG
Proves that recorded market history replays to the same trading decisions, so tests run on replays can be trusted.

### PAPER-RESET-3000
Resets paper mode to its new $820-per-slot sizing and starts a new dashboard epoch, so results from before and after the trading fixes are not mixed. Runs only on Kyle's decision.

### row 100
The learning-record restart: once the last fix that changes what a closed trade looks like has landed, the learning record starts again from that point, so the system learns only from trades recorded the right way.

## CC-C (Analyst Claude)

### B-LOSS-WINDOW-OPERATOR-CLOSES
Keeps closes made by an operator, such as the paper reset's, out of the kill switch's daily loss count, so a reset can never trip the kill switch.

### B-PRICE-STALENESS-BOUND
Stops an old last-known price being served as if it were current, with no age limit, including the stale snapshot a shut market sends for about 15 seconds after every reconnect.

### B-KRAKEN-PRIMARY-KEY-RESOLUTION
Makes every price-cache entry use Kraken's own name for the coin, closing the last two gaps where one coin could be stored under two names.

### WS parse-error drops
The Kraken live feed drops about eleven messages a day on a parse error. Handled inside B-PRICE-SIDE-BY-JOB.

### B-PRICE-SIDE-BY-JOB
Each job in the pipeline reads the side of the market a real trade would get (buy on the ask, sell on the bid) instead of the midpoint, so no trigger, fill or booking rests on the midpoint.

### B-ENTRY-CONSUMPTION-FRESHNESS
Checks a price's age at the moment it is used for an entry, not only when it arrived, for both crypto and xStock.

### B-CLASS-LEG-FILL-MODE
Sets, per asset class and per leg, how a paper trade fills (resting or immediate), with a safeguard against a later quote, so paper fills match how the class would really trade.

### B-BALANCE-SESSION-PAIRING
The paper balance snaps back to $820 at every restart. This ties the balance to its trading session so a restart keeps it. Waits behind CC-B's list.

### B-XSTOCK-BID-TRIGGER-RELAND
The one xStock-realism batch: xStock trades open and close only where a real trade could — stops and targets fire on the bid, a broken order book holds the exit, and the venue's open and close transitions pause it.

### P-8e split (the extrapolated-fill field)
A split of the extrapolated-fill field, so a fill the system had to estimate is recorded apart from one it saw. Lands with or before B-XSTOCK-BID-TRIGGER-RELAND's verification.

### B-SPREAD-BLOWN-RELEASE-MOVEMENT
After an exit is held because the spread is too wide, it is currently released by two narrower readings with no check that the price actually moved. This adds that check.

### B-CRYPTO-MARK-AGE-GATE
The crypto side of exit realism: whether one spread ceiling fits every coin or each coin needs its own, and a report of how long exits are refused.

### B-EXIT-TICKER-LEG-ADAPTER-SIDES
Lets the exit path see both sides of the price (bid and ask) from the ticker feed, not one blended number.

### B-STALE-BOOK-DEPTH-REFUSAL
Every depth-check refusal in a measured week came from our own stale order-book copy, not the venue, and most were one coin. This fixes the stale copy rather than refusing the trade.

### B-EXIT-DECISION-RUNG-STAMP
Records which price source an exit decision used, so every close can be traced to the price that decided it.

### row 62
A resting order's deadline keeps running even while no usable price is available, so an order cannot sit past its deadline unnoticed.

### B-OPEN-REFUSAL-DURABLE-ROW
An entry refused at the fill stage leaves no record today, so half of the paper-standard's never-fill measure has nothing to count. This writes a lasting record of every such refusal.

### B-XSTOCK-BAR-AVAILABILITY
xStock price bars become available about 15 minutes after the time they are labelled with, but live and replay code read the label. This makes every reader use when a bar was actually available.

### B-XSTOCK-SNAPSHOT-RETENTION
The xStock 15-minute and 60-minute snapshot tables keep every old bucket forever. This prunes them on a schedule.

### B-CRON-MISSED-CATCHUP
Two daily scheduled tasks have silently stopped firing before. This makes a missed run noticed and caught up.

### B-OHLC-FRAME-GUARD
A price bar with no price was written as the text "undefined", and one bad bar destroyed the whole batch it arrived in, for crypto and xStock. This guards the price-bar writer so one bad bar is refused alone. Only the on-screen check is left.

### B-OHLC-WRITE-ORDER
The price-bar writer's retry could write an older bar over a newer one when two writes overlap and both fail. This makes the newer bar always win.

### B-VTS-NO-DECISION-VALVE
A VTS trade with no usable sell price no longer books its timeout at the midpoint. Increment 2 measures whether a paper resting order can fill after its deadline while a price is refused.

### B-REST-SIDES-TO-CACHE
The REST price reader reads the bid and the ask, then stores only the midpoint. This stores both sides in the price cache, so a read that falls back to REST still sees the bid and the ask.

### B-BOOK-STATE-RESTART-DURABLE
After a restart the xStock book-state guard started out treating every book as good, which fired a false stop within seconds once. This keeps the guard's state across a restart.

### B-SIZING-DEC-RESTORE
Restored paper position sizing to Kyle's decisions: one shared pot, about 5% per trade, around 20 open at full exposure, and the old open-slots limit retired.

### CORZ investigation
The investigation of why CORZ's xStock price bars looked late. It found that xStock bars become available about 15 minutes after the time they are labelled with, which became B-XSTOCK-BAR-AVAILABILITY.

### the main Dashboard 0-trades read
A check of why the main Dashboard showed zero trades. Withdrawn by Kyle on 2026-10-19: the main Dashboard is off-limits unless it breaks paper-mode trading or the VTS.

### B-XSTOCK-LIVE-FEED
Makes the xStock price recorder reload its list of stocks every day. Moved out of the pre-sprint into the sprint by Kyle.

## Infra Claude

### B-LANGSTON-RELIEF
The lasting fix for Langston's delays: people's posts are answered ahead of alerts, a cheaper model triages alerts and escalates to Langston by his rules, and his memory is trimmed daily. In its observation window.

### B-LANGSTON-CLAUDEMD-RESIDUAL
Brings Langston's always-loaded files under their size ceiling: after the memory trim he is still over it, mostly from his rules file, which needs its own method.

### B-CREDENTIALS-PRIVATE-REPO
Takes passwords out of the repository for good and makes the repository private, after giving every reader that needs it, Langston included, its own read key.

### B-CREW-ACCESS-HARDEN
Hardens how the sessions and agents reach the servers, from Kyle's 2026-10-08 alert. Paused by Kyle for B-LANGSTON-RELIEF.

### B-LANGSTON-CONTEXT
Keeps Langston's working memory continually trimmed by a standing system. Chunk 1 is closed; the rest is partly overtaken by B-LANGSTON-RELIEF and waits for a re-scope.

### B-LANGSTON-AUTOMEMORY-TRIM
Cut Langston's memory index from about 25 KB to about 9 KB so it stopped being cut off when it loads. Done inside B-LANGSTON-RELIEF.

### B-SIZE-WATCH-BREACH-ALARM
Langston's size watch alarms only when it stops running, never while he is over his ceiling, so a breach looks like a pass. This gives the breach its own alert.

### B-LANGSTON-MEMORY-NOTICES
A damaged memory index for Langston is noticed only by chance. This gives it its own alert and makes the tools' recovery text name the fix, not a session.

### B-AGENT-INVOKE-FAILURE-NOTICE
A failed Coltrane or Langston run posts nothing, so a failed review looks exactly like a slow one. This records the failure and tells the requester to re-send, and caps restart re-tries.

### B-AGENT-PRIVATE-TMP
Gives Langston and Coltrane private scratch space, after a Langston run wrote a copy of his memory where every account could read it.

### B-LANGSTON-REPOST-FAILED
A Langston reply that fails to post is re-asked from scratch today. This keeps the reply and posts it again instead of re-running the whole review.

### B-ALERT-LANE-LEDGER-OWNER
The alert lane guesses who owns an alert from Langston's past routing notes. This reads the owner from the plan instead, so alerts stop bouncing between sessions.

### B-LANGSTON-RECONCILE-VERB
Gives Langston's memory tool a reviewed way to accept a hand edit, plus a daily check that his live memory matches what the tool last wrote.

### B-CHAPLET-DELETE
Deletes the old Chaplet router, which once served the app's own files to the public internet; it is already switched off.

### B-TRANSCRIPT-ARCHIVE
Turns old session conversations into text-only, searchable archives with an index, keeping all history.

### B-TOKEN-WATCH
A capture-only observation of new Solana token launches, recording them without trading. Parked until after live.

### B-CREW-STATUS-2
The follow-up to the old crew status page. It dissolves when this status board retires that page.
