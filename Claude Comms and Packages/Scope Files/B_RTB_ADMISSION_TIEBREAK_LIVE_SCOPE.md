# B-RTB-ADMISSION-TIEBREAK-LIVE — SCOPE (Step 1, r1) — ⛔ A KYLE DECISION FIRST

change-class: non_architecture

**Issue:** `#1190` (Langston ruled a defect, `B-RTB-REFRESH-LIVE-PRICE` Step 2) · **Plan row:** `SPRINT_TO_LIVE_PLAN` 59f, after row 59e · **Owner:** CC-B (NEW Claude)
*Read at `origin/migration/aws-supabase` after `8165382f7`.*

## 0. What is broken, measured
`queueSQESignal` (`server/core/rtb/ready_to_buy_service.ts:~2201-2244`) decides what happens when a strategy issues a signal for a `symbol × strategy` already in the queue. It looks the incumbent up with `getQueuedSignal(mode, symbol, strategy)` (`:1380`), which filters `status: 'queued'`. **No row ever carries that status:** inserts write `active`, the refresh writes `reconfirmed`; `'queued'` is only the column default and every insert sets a status. **Measured 2026-10-12:** 0 `queued` rows (99 `reconfirmed` + 2 `active` at 08:01Z, Langston); 0 `RTB_TIEBREAK` lines in ~5 h of retained logs against 128 upsert lines in 16 minutes. ⇒ the incumbent is never found, the tiebreak never runs, and the upsert (`ON CONFLICT (mode, symbol, strategy) DO UPDATE`, `server/storage.ts:4401-4433`) overwrites the row with the new signal's levels every time: **newest wins, always.**

## 1. Provenance — and it changes the question
| | introduced | intent (quoted) |
|---|---|---|
| the incumbent check | before 2025-12-18 (a `finalScore` comparison) | keep the better of two copies |
| **the status change that made it unreachable** | **Directive 8.8.4-A3.R8, 2025-12-18** (`278322f5e` … `2f4774471`, Replit): rows became `active` / `reconfirmed`, and `getQueuedSignals` was widened to read them (*"Include both 'active' and 'reconfirmed' statuses"*) — `getQueuedSignal` (singular) was not | — |
| the R-multiple key | `8939105f8` 2026-07-25, `#558` A1: *"TIEBREAKER (Kyle-ruled 2026-07-24): queueSQESignal duplicate resolution now decides on the LIVE rank key (expected R-multiple), not finalScore"* | Kyle ruled WHAT to compare; nobody checked the branch could run |
⇒ **the tiebreak has been dead for ten months, under both keys.** Kyle's 2026-07-24 ruling has never taken effect. **Nothing downstream has been running on it:** the R-multiple ranking that picks which signal to promote is live (`getRankedSignals`) — what never happened is the choice between two copies of the SAME setup.

## 2. Why "just fix the filter" is not obviously right any more
Since this morning (`B-RTB-REFRESH-LIVE-PRICE`, row 59e) the refresh checks every queued signal against the live price and drops one already past its stop or target. In that world:
- a **re-issue** carries levels built on the current price — the strategy's current view of the setup;
- the **incumbent** carries its queue-time levels, refreshed in cost and score but not in level. Its R-multiple is computed on those old levels (`rMultipleCore`: entry, stop, target, `chosenNetEv`).
Restoring the tiebreak as ruled would keep an older copy whenever its stale-level R is higher — and a price that has moved TOWARD the stop raises that number. **It would reintroduce, inside the dedupe, the stale-levels problem Kyle asked to be removed (directive 3).**

## 3. The options (Kyle decides; Langston's view sought first)
| | what | consequence |
|---|---|---|
| **(a) restore as ruled** | fix the lookup (`status in ('active','reconfirmed')`); higher R wins | ~19,346 admissions per 72 h move from newest-wins to best-R-wins, with an `expireSignal` delete on each replace; a stale copy can block a fresh one |
| **(b) newest wins — make it explicit (RECOMMENDED)** | keep today's behaviour by design: a re-issue replaces the queued copy with current levels; **delete the dead tiebreak branch and `getQueuedSignal`** (rule 18), record that the 07-24 ruling never took effect and why it is superseded | the queue always holds the strategy's latest levels; ranking between DIFFERENT setups is unchanged (R-multiple at promotion); nothing in the live behaviour changes |
| (c) compare both copies at the live price | R recomputed at the current ask for both | favours a copy whose price has fallen toward its stop (its risk at the live price shrinks, so its R swells) — the wrong winner by construction; not recommended |
**Recommendation: (b).** It turns ten months of accidental behaviour into a stated rule, removes a branch that has never run, and is the only option consistent with directive 3. It asks Kyle to set aside his 07-24 ruling **for this one choice** (same setup, two copies) — not for ranking, where it stands.

## 4. Objectives — written for (b); re-scoped if Kyle chooses (a)
1. **The rule is explicit:** `queueSQESignal` writes the re-issue over the queued copy (the upsert, as today), with a comment and a System Manual line saying newest-wins is the design and why. *Verify:* a test that a re-issue replaces the incumbent's levels.
2. **The dead code goes (rule 18):** the incumbent branch (`[KEEP]`, `[REPLACE]`, `[UNPRICEABLE]`) and `getQueuedSignal`; `DELETED_COMPONENTS_LOG`. *Verify:* census of callers (expected: the branch only); tsc; no reader of the removed logs (Step-2 grep of every log consumer).
3. **The record:** `#1190` closed with the decision; `#558`'s 07-24 tiebreak note annotated (superseded for same-setup copies by Kyle on `<date>`); the System Manual's admission paragraph.
**Out of scope:** the R-multiple ranking itself; `#574` (the ranker's `VolNoise` input — CC-A's).
