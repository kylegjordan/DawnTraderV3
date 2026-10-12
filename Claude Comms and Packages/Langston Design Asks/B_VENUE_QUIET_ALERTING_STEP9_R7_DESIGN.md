# B-VENUE-QUIET-ALERTING — STEP 9, r7 — DESIGN (two items; draft for Langston, written 2026-10-12 ~22:30Z UTC)

change-class: architecture (unchanged from the scope header)
**Why Step 9:** the Monday window read **FAIL-3** (one quiet-family `price-skip` mint after the close, `78fe1d30` INVH/USD 20:16:54Z) — record: `Batch Completion/B_VENUE_QUIET_ALERTING_PROGRESS_REPORT.md` §3c. Per §3 the batch reopens at Step 9. It was already owed **FINDING-1** (§3a clause 4: disposition 1, fixed in this batch whatever Monday showed). This document designs both. All `path:line` read at `origin/migration/aws-supabase` after `44d2b83bb`.

---

## ITEM A — THE TRANSITION EDGE (FAIL-3)

### A.1 What happened, at the code
- The engine decides join-or-page **at the moment a streak crosses its threshold**, from a verdict it computes then: `measureXstockTicking(_nowMs)` → `classVerdict(_t, …)` (`active-execution-engine.ts:852-853`), then `joinsStandingRecord(_families, _verdict, _nowMs)` (`:859`); otherwise it pages (`:866-876`).
- `T` counts xStock symbols with an update in the trailing `TICKING_WINDOW_MS` = 60,000 ms (`venue-quiet-alerting.ts:41,136-137`). **A trailing count remembers the last minute.** When the venue goes quiet, `T` stays above `quiet_ticking_min` (346) for up to a minute after the ticking stops.
- 2026-10-12: sweeps read `T` 464-467 to 20:15:51Z, **410 at 20:16:51Z**, 261 (`quiet`) at 20:17:52Z. INVH's last tick ~20:15:42Z; its 40-skip streak crossed at 20:16:54Z with the page's own `T=410` ⇒ `not_quiet` ⇒ page.
- **The same shape in reverse, measured the same evening:** after the close the verdict flickers — 3 of 54 sweeps 20:17-21:13Z read `not_quiet` for one sweep (T 440 / 466 / 415 between quiet readings of 153-311). A quiet-family streak crossing inside one of those minutes pages the same way.

### A.2 Options considered
| | what | verdict |
|---|---|---|
| (i) shorten the window | e.g. 20 s | ✗ — the 346/50 knobs were calibrated on a 60 s count; moves a measured threshold to fix a timing edge, and a short window is noisier, which feeds the flicker |
| (ii) compare against the symbol's own silence | "did the cohort keep ticking after THIS symbol stopped?" | ✗ — does not save INVH: the cohort ticked for ~20-60 s after INVH stopped, because INVH went quiet first. It answers a different question |
| (iii) session-boundary rule | treat N min after 20:00Z as quiet | ✗ — a calendar hard-code; the venue ticked at full rate for 16 min past the close, and it does not cover the flicker |
| **(iv) CONFIRM BEFORE PAGING (recommended)** | a quiet-family-only streak that crosses on a `not_quiet` verdict is held **pending** and decided by the sweep once a full window has passed: still `not_quiet` and still unpriced ⇒ page; `quiet`/`closed` ⇒ join the standing record; priced or closed ⇒ drop | ✓ — fixes both shapes with one rule, moves no knob, and costs a page at most one window plus one sweep (~60-120 s) on a streak that is already ~40 ticks old |

### A.3 The design (iv)
1. **Scope — only what the edge can mislead.** Only a streak whose family set is exactly `{quiet_market}` on `xstock_spot`, crossing on verdict `not_quiet`. Everything else is unchanged: `thin` and `null` still page at once (arm ii, default-to-page); book-state and `other` families are untouched (their rules do not read the cohort's recency the same way); crypto is untouched.
2. **Pending, not escalated.** At the crossing (`:834-835`), instead of minting, record `pending.set(position.id, { symbol, crossedAtMs, meta })` on `VenueQuietState` and log `[VENUE_QUIET][PENDING] <sym> … T=<t> verdict=not_quiet — confirming at the next sweep after <crossedAt+window>`. `_priceSkipEscalated` is still set, so the streak does not re-cross every tick.
3. **The sweep decides** (`sweepVenueQuiet`, before the row loop), for each pending entry with `nowMs - crossedAtMs >= TICKING_WINDOW_MS` — i.e. the trailing count no longer contains any tick from before the crossing:
   - position closed ⇒ drop;
   - priced after `crossedAtMs` ⇒ drop (the streak ended on its own);
   - verdict `quiet` or `closed` ⇒ **join the standing record** with the original meta plus `confirmedVerdict`, `confirmedT` (the join is the engine's `_joinVenueQuietStanding` — the sweep needs it as a dep, the same way it takes `addAlert`);
   - verdict `not_quiet` or `thin` ⇒ **mint the page exactly as `:866-876` does today**, with `metadata.confirmedVerdict`/`confirmedT` beside the crossing-time `classVerdict`/`T`, so the record shows both reads.
4. **Restart.** Pending lives in memory; a restart drops it and resets the streak (as it does today), so the streak re-crosses and re-enters pending. Never earlier than true, at worst one window later.
5. **Line on every sweep:** `pending=<n>[sym:ageS,…]` appended to the sweep line (as `held=` was in r6), so a pending entry that never decides is visible.

### A.4 Verification (Step 9 tests + the next window)
- Unit: crossing on `not_quiet` → pending; next sweep `quiet` → joins, no page; next sweep `not_quiet` → page with both reads; priced in between → drop; `thin` at crossing → immediate page (unchanged); mixed families → immediate decision (unchanged).
- Mutant: remove the window-elapsed guard → the INVH replay pages; must fail a test.
- Staging: the next weekday close — **zero quiet-family mints at or after 20:00Z over positions priced in session (§3a criterion 3 as written)**, plus `[VENUE_QUIET][PENDING]` lines showing the decisions taken.

---

## ITEM B — FINDING-1, WHAT IS LEFT OF IT

### B.1 What r6b already covers
A **standing-record member** whose book-state basis leaves an off-session row held on its key is rescued by the duration page: the sweep resolves the held row as `SUPERSEDED-BY-DURATION-PAGE` first, then mints (`venue-quiet-alerting.ts`, the `held` block in the duration branch). Monday's open did not exercise it — no member was still held 30 min into the session.

### B.2 The gap that remains
A position whose streak **PAGED off-session instead of joining** — e.g. a `thin` verdict (arm ii pages every family), or a streak whose families include `other` — is **not a member**, so the duration path never sees it. Its row clears only on `PRICED-AFTER-MINT` or `POSITION-CLOSED` (the `skipPat` branch of the sweep). If book-state refusals persist into the regular session:
- the engine does not re-escalate — `_priceSkipEscalated` holds the position for the whole streak (`:834-835`), and a book-state refusal never ends the streak (it never reaches `notePriced`, `:2697`);
- so **no regular-session page fires**, and the only row on the key describes the off-session context. That is the FINDING-1 shape, on the rows the duration rescue cannot reach.

### B.3 The design
In the sweep's `skipPat` branch, for an xStock row that is still unpriced since mint:
- read the **session at mint** from `created_at` with `getXstockSession(createdMs)` — no new stamp needed, and it works on rows minted before r7;
- if the row was minted **outside** the regular session, the current session **is** regular, and the row's `metadata.reasonFamilies` include `book_state`: resolve it as **`SUPERSEDED-BY-SESSION-CHANGE position=<uuid>`** (a new `clearEvidence` token, so the row says why), then mint a fresh page on the same key, worded for the regular session (*"our own book-state check is still refusing <sym>'s order book inside the US regular session"*), flag only a row actually created (the r6b rule), and record the symbol in a per-session set so it pages once per session.
- `getXstockSession` is day-blind and has no holiday calendar (`#392`, §3b residual) — the same residual as the duration page, named not fixed.

### B.4 Verification
- Unit: off-session `thin` row with `book_state` + regular session + unpriced ⇒ superseded and re-minted once; regular-session-minted row ⇒ untouched; priced ⇒ resolved as today; quiet-only families ⇒ untouched.
- Staging: observable only if a book-state refusal persists into a regular session — Monday's corroboration says that is rare (0 escalations after the open). The unit tests are the evidence; staging reads `SUPERSEDED-BY-SESSION-CHANGE` if it ever fires.

---

## What this does NOT change
The freshness standard, the thresholds (346/50), the skip log, the standing record's join and clear rules, the duration page, and every non-xStock path.

## For Langston
1. Does FAIL-3 stand as judged (§3a criterion 3 has no `not_quiet` carve-out)?
2. Item A: (iv) confirm-before-paging, or another option?
3. Item B: is B.2 the right statement of what FINDING-1 still owes after r6b?
