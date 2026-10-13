# B-VENUE-QUIET-ALERTING — STEP 9, r7c — DESIGN (two items; r7 2026-10-12 ~22:30Z, r7b ~02:30Z and r7c ~02:50Z UTC 2026-10-13)

> ⚠️ **TWO LANGSTON REPLIES CROSSED IN HIS QUEUE, and they point different ways — recorded so the next read sees both.** 01:44Z (on the FAIL-3 post, before he had read r7): *hysteresis on the 60 s union only delays a saturating statistic … prefer a comparison on the ceiling's own clock* (point 7). 01:51Z (on r7 itself): **(iv) APPROVED with BLOCKER-1 + two conditions**. r7b/r7c recommend (vi), the session gate, because it meets point 7 and has no pending state at all — so (iv)'s two conditions (a pending entry that fails silent under a config error; the `pending=` line as the only instrument) do not arise. **BLOCKER-1 is independent of the option and is taken into r7c as A.7.** If Langston prefers (iv) as approved, A.7 and B.3 carry over unchanged.

change-class: architecture (unchanged from the scope header)
**Why Step 9:** the Monday window read **FAIL-3** (one quiet-family `price-skip` mint after the close, `78fe1d30` INVH/USD 20:16:54Z) — record: `Batch Completion/B_VENUE_QUIET_ALERTING_PROGRESS_REPORT.md` §3c. Per §3 the batch reopens at Step 9. It was already owed **FINDING-1** (§3a clause 4: disposition 1, fixed in this batch whatever Monday showed). This document designs both. All `path:line` read at `origin/migration/aws-supabase` after `44d2b83bb`.

---

## ITEM A — THE EDGE (FAIL-3) — r7b, after Langston's review (2026-10-13 01:44Z)

⛔ **r7's option (iv) "confirm before paging" is WITHDRAWN** — Langston: hysteresis on the 60 s union only delays a saturating statistic, and would then have to be tuned for the ramp-up *and* the burst writer. **His constraint, adopted: never trade a self-announcing failure for a silent one; prefer the ceiling's own clock.**

### A.1 The mechanism, corrected (Langston, re-derived)
Not a lag but a **clock mismatch**: `T` is a 60 s union (`venue-quiet-alerting.ts:41,136-137`) excusing a 15 s ceiling. It saturates — a 4× rate cut leaves it at 410. **n = 3 on 10-12, all off-session:** NOC 00:16:16Z and 00:17:54Z (ramp-up; ET Sunday 20:16 = `overnight`), INVH 20:16:54Z (wind-down; ET 16:16 = `after`). INVH was not alone: 322 of 467 symbols were stale by its own standard at the page instant.

### A.2 Measured on the ceiling's clock — `F15` = distinct xStock symbols with a snapshot in the trailing 15 s (`xstock_spot_ticker_snap_2026_10_12`; 10 s instants)
| window | `F15` | `T60` |
|---|---|---|
| **regular session**, every 10 min 14:00-19:50Z (36 instants) | **449-461** | — |
| wind-down 20:15:20 → 20:16:00Z | 462 → 408 → 344 → 248 → 223 | 467 throughout |
| after the close 20:16:20-20:18:30Z | 140-202, **one burst to 358 at 20:16:10Z** | 461 → 260 |
| ramp-up 00:15:20-00:17:20Z | **246-335** (00:15:10Z = 467: the resubscribe snapshot frames, which the engine's counter excludes, r4) | 467 → 429 |
| overnight steady from 00:17:40Z | 110-167 | 412 → 204 |
| NOC/USD's own snaps after the reopen | 00:15:00.602 (snapshot), **00:16:38.578, 00:19:24.878** — every 1.5-3 min | |
| first update per symbol after the 00:15:32Z resume (n = 468) | p50 12.6 s · p90 51.1 s · p95 77.3 s · max 1,600 s | |
⇒ **Off-session, single-symbol staleness against a 15 s ceiling is the normal state** — NOC updates every 1.5-3 minutes and a tenth of the cohort takes over 51 s to take its first update. **In session the cohort is fresh almost to a symbol (≥ 449 of ~467 on every instant read).**

### A.3 Options
| | what | verdict |
|---|---|---|
| (iv) confirm before paging (r7) | delay on the 60 s union | ✗ withdrawn (Langston) |
| (v) a ceiling-clock quorum | page a quiet-only streak only if ≥ Q symbols ticked within **the paging symbol's own ceiling** | ✓ fixes all three (`F15` at the three instants ≈ 297, 156, 152) — **but it is a new knob with one day of calibration, and still exposed to the burst writer for one ceiling-window** (`F15` 358 at 20:16:10Z; Langston: 421 distinct in the 20:19:00Z 10 s bucket) |
| **(vi) SESSION GATE (recommended)** | **outside the US regular session, a `quiet_market`-only streak joins the standing record whatever the cohort count** (unless `thin`/`null` — arm (ii) unchanged: a near-silent feed still pages); **inside the regular session, the cohort test runs exactly as today** | ✓ fixes all three, **adds no knob, and is immune to the burst writer and the ramp-up**, because it never asks the 60 s union to describe an off-session minute |

### A.4 Why (vi), and its cost stated as a cost
- **It is Kyle's own rule applied to the reason family it was written for.** #994: a mark going stale because the market is closed is by design — keep the count, raise no alert; alert only when OUR feed is impaired. Off-session, A.2 shows a single symbol 15 s stale is the market, not our feed. The book-state family already has exactly this gate (`familyJoinsStandingRecord`, `getXstockSession(nowMs) !== 'regular'`, Kyle's 2026-10-09 direction); (vi) gives `quiet_market` the same one.
- **What still pages off-session:** `thin` (fewer than 50 updating — our feed impaired), `null` (config unreadable), any streak carrying an `other` family (the minority veto is unchanged), and every crypto path.
- ⚠️ **THE COST — a delay, not a silence:** a genuinely lost single-symbol subscription that starts off-session no longer pages at once. It **stays a member of the standing record**, and the **duration page** fires once the class has read not-quiet for `escalate_after_ms` (30 min) — in practice about 30 min into the next regular session (10-12: the class read not-quiet continuously from 13:45:37Z). **It announces itself; it is not hidden.** Item B makes sure no held off-session row can block that page.
- **In session nothing changes** — `T60` and `F15` agree there (Langston: 466 fresh vs `T` 467 at 20:14:54Z), so the 60 s counter is not asked to do anything it cannot.
- **Residual, unchanged and named:** `getXstockSession` has no holiday calendar (`#392`): on a US holiday, regular hours run the in-session cohort test on a shut venue — `quiet` joins, `thin` pages, as today.

### A.5 The change
`familyJoinsStandingRecord` (`venue-quiet-alerting.ts:83-90`): `if (family === 'quiet_market') return verdict === 'quiet' || getXstockSession(nowMs) !== 'regular';` — after the `closed` and `thin` arms, so `thin` still pages off-session. One line in the rule, a comment citing this record, and the header's QUIET-MARKET bullet updated.

### A.7 BLOCKER-1 (Langston 01:51Z) — the COLD COUNT at a restart, taken into this design whatever option is chosen
**The defect, re-derived by Langston at the code:** `T` lives in memory — `countEquitySymbolsUpdatedSince` iterates `lastTickerUpdateAt` (`equity-spot-archiver.ts:214-220`), written at one site on `frameType === 'update'` (`:267`); `_priceSkipEscalated` is in memory too (`active-execution-engine.ts:705`, cleared only at `:2695`). After a bounce both are empty ⇒ `T = 0` ⇒ `thin` ⇒ every family pages (arm ii). **Measured: at the 10-10 11:59:18.959Z restart all 16 open xStock positions re-crossed within 63 s; same at 17:05:11.443Z; §3c's first sweep after the 00:42Z restart read `T=0 thin held=16`. 16 pages per bounce against FAIL-3's one row.** Under (vi) the session gate does not help — `thin` is placed before it, deliberately.
**The fix — Langston's remedy, the existing boot-bound pattern applied to the count:** `NOT_WARM_GRACE_MS` (`venue-quiet-alerting.ts:44`, *"a BOOT-ORDERING bound, not a trading decision"*) already makes a cold KNOB "skip this tick without escalating" (`active-execution-engine.ts:820`). Apply it to the cold COUNT:
- the count is **cold** until a full `TICKING_WINDOW_MS` has passed since this process's **first `update` frame** (the archiver already counts them: `tickerSnapsByType60s.update`; the first-frame time is one new field beside `lastTickerUpdateAt`);
- while cold, an xStock streak that crosses **skips this tick without escalating** — the streak keeps counting and re-crosses on the next tick, judged on a warm count;
- **bounded, fail-closed:** if the count is still cold `NOT_WARM_GRACE_MS` after the engine was constructed (`_engineConstructedAt`) — i.e. no update frame has arrived at all — it is treated as warm, so `T = 0` reads `thin` and pages. **A feed dead at boot still announces itself, within 120 s.**
- Not a widening of `thin`: only an EMPTY instrument is excused, never a low reading from a warm one (Langston: *"the carve-out is the boot bound, nothing wider"*). No new knob.
- Unit: restart (empty map) + crossing at t+56 s ⇒ no page; first update frame at t+5 s ⇒ warm at t+65 s ⇒ decided then; no update frame ever ⇒ pages at t+120 s as `thin`. Mutant: drop the cold check ⇒ the 16-position replay pages.

### A.6 Verification
- Unit: off-session + `not_quiet` + quiet-only ⇒ joins (the three 10-12 rows replayed: NOC ×2 `overnight`, INVH `after`); off-session + `thin` ⇒ pages; off-session + quiet + `other` ⇒ pages (veto); in-session + `not_quiet` + quiet-only ⇒ pages (unchanged); DST: a winter and a summer instant at 16:16 ET.
- Mutant: drop the session clause ⇒ the INVH replay pages; must fail a test.
- Staging, pre-registered for the next weekday: **zero quiet-only `price-skip` mints outside the US regular session** over positions priced in session; any in-session quiet-only mint listed with `T`, verdict and the symbol's own last update.

---

## ITEM B — FINDING-1, WHAT IS LEFT OF IT

### B.1 What r6b already covers
A **standing-record member** whose book-state basis leaves an off-session row held on its key is rescued by the duration page: the sweep resolves the held row as `SUPERSEDED-BY-DURATION-PAGE` first, then mints (`venue-quiet-alerting.ts`, the `held` block in the duration branch). Monday's open did not exercise it — no member was still held 30 min into the session.

### B.2 The gap that remains
A position whose streak **PAGED off-session instead of joining** — e.g. a `thin` verdict (arm ii pages every family), or a streak whose families include `other` — is **not a member**, so the duration path never sees it. Its row clears only on `PRICED-AFTER-MINT` or `POSITION-CLOSED` (the `skipPat` branch of the sweep). If book-state refusals persist into the regular session:
- the engine does not re-escalate — `_priceSkipEscalated` holds the position for the whole streak (`:834-835`), and a book-state refusal never ends the streak (it never reaches `notePriced`, `:2697`);
- so **no regular-session page fires**, and the only row on the key describes the off-session context. That is the FINDING-1 shape, on the rows the duration rescue cannot reach.

### B.3 The design — r7b: EVERY family, not only book-state (Langston's INVH point)
⚠️ **Langston, 2026-10-13: INVH has not been priced since 00:33:31Z; if `78fe1d30` (pure `quiet_market`, minted `after`) is still held at the 13:30Z open, it suppresses the regular-session page — FINDING-1's shadow on a quiet-family row.** So B.3 cannot be scoped to `book_state`.
In the sweep's `skipPat` branch, for an xStock row that is still unpriced since mint:
- read the **session at mint** from `created_at` with `getXstockSession(createdMs)` — no new stamp needed, and it works on rows minted before r7;
- if the row was minted **outside** the regular session and the current session **is** regular (any families): resolve it as **`SUPERSEDED-BY-SESSION-CHANGE position=<uuid>`** (a new `clearEvidence` token, so the row says why) and **hand the position back to the engine's own rule**: add its id to a `VenueQuietState.reJudge` set, which the engine drains by clearing that position's escalation latch and streak (`_priceSkipEscalated` / `_priceSkipStreak`, `active-execution-engine.ts:800-835`). **The sweep mints nothing itself.** The streak re-accumulates on in-session skips and, if it crosses, is judged in session by the rule that applies there — a book-state streak pages (arm (i)), a quiet-only streak pages only if the cohort is not quiet. ★ **Why hand back rather than re-mint (changed in r7b):** at the first sweep after 13:30Z the symbol may simply not have ticked yet; a re-mint would page it in the first minute of the session — the ramp-up shape, one session later. Handing back gives it a full in-session threshold first, and the page that follows (if any) carries in-session inputs instead of a re-worded off-session row.
- If the supersede fails: do not touch the latch; retry next sweep (the r6b rule).
- **Build notes (Langston 01:51Z, adopted):** (1) read a row's families through `memberFamilies` (`venue-quiet-alerting.ts:215-218`), which carries the pre-r5 singular `reasonFamily` fallback — so legacy rows are covered as claimed; (2) the duration branch's **three**-part pattern — resolve first, **bail and retry next sweep if the resolve failed**, act only on success; (3) the session-change set is in memory, so a restart can re-supersede once per session — the safe direction, stated rather than left to be inferred.
- **Exhaustiveness (Langston enumerated it):** the `skipPat` branch has exactly two exits — position closed (`:262-264`) and priced after mint (`:266-267`); `resolveStuckAfterMs` (`:363`) is the resolve-failure watchdog, not a clearing path; the r6b rescue (`:317-322`) iterates the standing record's own members, so a position that paged is structurally unreachable by it. B.2 is exhaustive, not approximate.
- `getXstockSession` is day-blind and has no holiday calendar (`#392`, §3b residual) — the same residual as the duration page, named not fixed.

### B.4 Verification
- Unit: off-session rows (quiet-only, and `thin` with `book_state`) + regular session + unpriced ⇒ superseded once and the position handed back (latch and streak cleared), nothing minted by the sweep; the engine then pages a book-state streak in session, and a quiet-only streak only on a not-quiet cohort; regular-session-minted row ⇒ untouched; priced ⇒ resolved as today; quiet-only families ⇒ untouched.
- Staging: observable only if a book-state refusal persists into a regular session — Monday's corroboration says that is rare (0 escalations after the open). The unit tests are the evidence; staging reads `SUPERSEDED-BY-SESSION-CHANGE` if it ever fires.

---

## What this does NOT change
The freshness standard, the thresholds (346/50), the skip log, the standing record's join and clear rules, the duration page, and every non-xStock path.

## For Langston
1. Does FAIL-3 stand as judged (§3a criterion 3 has no `not_quiet` carve-out)?
2. Item A (r7b): (vi) the session gate, or (v) the ceiling-clock quorum?
3. Item B: is B.2 the right statement of what FINDING-1 still owes after r6b?
