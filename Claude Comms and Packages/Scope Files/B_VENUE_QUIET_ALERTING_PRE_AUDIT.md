# B-VENUE-QUIET-ALERTING — PRE-AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: architecture · **Issues:** `#526` + `#994` + `#638` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 3a1 (paired with 3a) · **Owner:** CC-B
**Scope:** `B_VENUE_QUIET_ALERTING_SCOPE.md` r3 (`6445f46b2`), Langston Step-1 PROCEED with C1-C3 and §7 = add `engine`.
**Read at:** `origin/migration/aws-supabase` (head `c11f2f09d`); staging `xstock_spot_ticker_snap`, `system-alerts.jsonl`, `out.log` 2026-10-06/07.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (3b.f-d, 2026-09-03, seven ordinary sessions): after-hours median 269 of 479 symbols ticking per minute. NOW (2026-10-06 20:00 → 24:00Z, one session): median 154 of 468. REASON:** a different night and a different universe size; the pre-registration below uses tonight's measured distribution and states its single-session limit. The overnight figures agree (Sept min 88 / median 131; tonight min 108 / median 135).
- **PREVIOUSLY STATED (scope r1a §6.2): the ceiling may tighten off-hours — a HYPOTHESIS. NOW: confirmed in direction by the code (§A4), magnitude unmeasured.**

## SOURCES READ
| # | source | read |
|---|---|---|
| 1 | code | `active-execution-engine.ts:750-860` (`_recordPriceSkip`), its 8 call sites (`:1948`, `:1953`, `:1978`, `:2004`, `:2114`, `:2221`, `:2369`, `:2422`), the streak reset `:2428`, the other per-symbol keys (`:2062`, `:3289`, `:3482`, `:4294`); `system-alerts.ts:137-144`, `:205-220`, `:411`, `:505-514`, `:533-548`, `:583-605`, `:715-783`; `scripts/system-alerts.ts:100-229`; `module-constants-service.ts:420-424`, `:465-468`; `asset_classes/xstock_spot/mark-staleness.ts:171-233`, `sigma-rate.ts:81-219`, `sigma-rate-cache.ts:84-149` |
| 2 | runtime + DB | per-minute ticking counts 2026-10-06 12:00 → 10-07 03:00Z; every `price-skip-paper-*` row minted 10-06 after 19:30Z (46) with the trailing-60 s ticking count at its mint instant; alert `d5f259c9`'s recorded history; the boot warm-up lines of the 10-06 15:44Z restart |
| 3 | System Impact Map | the exit-monitor freshness rail and the alerts store; **no entry for a per-class standing alert or a production resolver** (both land at Step 10, required for this class) |
| 4 | System Manual | `P19-B8.5` venue-only pricing + `P19-B8.5e` ceiling; **the alerts lifecycle has no production resolver documented** — the new resolve path is documented at Step 10 (architecture class) |
| 5 | ledger | `#526`, `#994`, `#638`, `#548`, `#566`, `#569` (`B-OFFHOURS-BEHAVIOUR`, CC-B — the slot-jam/time-exit options paper), `#572` (adjacent, unfolded), `#982`, `#987` |
| 6 | provenance | `P19-B8.5` (Langston condition 1: *"must not fail silently"*), the 2026-07-22 copy split, `P19-B8.5e`, `B-ALERT-ACTOR-ALLOWLIST` (`#987`) — as scope §1.8 |

## A. AUDIT
**A1 — what feeds the key (census, whole tree, tests excluded).** One minting function, `_recordPriceSkip`; one key, `price-skip-<mode>-<symbol>`; **eight call sites with eight reason families**: `equity_age_knob_missing` (`:1948`), `equity_tick_missing` (`:1953`), `equity_tick_stale_<basis>` / `…_floor_bound_near_stop` (`:1978`), `book_state_knob_missing` (`:2004`), `book_state_yield_refused` (`:2114`), `book_state_unvalidated` (`:2221`), and the crypto REST failures (`:2369`, `:2422`). The streak is per `position.id` (`:811`), the key per symbol, and the alert copy already picks the DOMINANT reason over the streak (P-7h r2). Separate per-symbol keys, NOT in scope: `book-state-hollow-*` (`:2062`), `no-trigger-*` (`:3289`), `close-refused-*` (`:3482`), `close-no-trade-row-*` (`:4294`). ⇒ **Only the quiet-market family (`equity_tick_stale_*`, `equity_tick_missing`) can be a quiet market;** knob-missing, book-state and REST reasons are not explained by the venue being closed and keep paging exactly as today.

**A2 — the cohort never went thin last night (Langston's Q2 condition, measured before choosing a line).** Object: distinct xStock symbols with ≥1 `xstock_spot_ticker_snap` row per clock minute; universe 468 symbols seen; population every minute 2026-10-06 12:00Z → 10-07 03:00Z.
| segment (UTC, DST-valid to 2026-11-01) | minutes | min | p05 | median | max |
|---|---|---|---|---|---|
| regular 13:30-20:00 | 390 | 242 | 461 | 464 | 468 |
| after-hours 20:00-24:00 | 240 | 120 | 132 | 154 | 468 |
| overnight 00:00-08:00 (to 03:00) | 180 | 108 | 117 | 135 | 467 |
| pre-market 08:00-13:30 (from 12:00) | 90 | 198 | 208 | 234 | 468 |
Regular-hours minutes under the line chosen in A3: **11 of 390, all 13:30-13:42Z** (first 12 minutes after the US open; 242-339 ticking) — a quiet-classed open, stated so the escalation in plan item 4 covers it.

**A3 — THE RULE, PRE-REGISTERED (Langston: the share is the batch's prediction, not a knob).** At the decision instant, `T` = distinct xStock symbols with a tick in the TRAILING 60 s (a trailing window, never a clock-minute bin — `RUNNING_ISSUES:325`).
- **class QUIET** iff `T < 346` (= 75 % of the regular-hours p05, 461);
- **cohort THIN** iff `T < 50` ⇒ cannot tell a quiet venue from an impaired feed ⇒ **PAGE** (default-to-page, Langston r1 Q2);
- a quiet-family skip on a QUIET class ⇒ the standing record, no page; on a NOT-quiet class ⇒ page, as today.
**Applied to the 46 rows minted 2026-10-06 after 19:30Z** (trailing-60 s `T` at each row's `created_at`): `T` ranged 125-401; **2 would still page** — `NWL/USD` (T = 401) and `HUT/USD` (T = 389), both at 20:17Z, seventeen minutes after the close while most names still ticked. **PRE-REGISTERED SHARE: 2 of the first-hour 15 (13.3 %); 2 of all 46 (4.3 %).** Step 7 checks the next close against this — **FAIL if the observed paged share is above 25 % of the first hour's quiet-family rows, or if a whole-feed stall is ever classed QUIET.** Single-session limit stated: one night's distribution; the line is re-checked against the first two weeks of the window report.

**A4 — the ceiling tightens off-hours (scope §6.2 hypothesis, confirmed in direction by code).** A symbol uses its own σ only with ≥ `sigma_min_observations` = 200 observations in the trailing 30 min (`sigma-rate.ts:208-219`; seed `2026-07-21-p19-b8-5e-mark-staleness-knobs.sql:63`); the repo's own diagnostic (`scripts/analysis/ir_sigma_eligibility.sql:1-4`) puts off-hours at ~90-140 ticks per 30 min ⇒ off-hours symbols fall to the class-wide 90th-percentile σ (`:146-198`), or, with no eligible symbol, to null and the 15 s floor (`mark-staleness.ts:181-183`) — a TIGHTER ceiling, so the rail rejects more and the key mints more. **Magnitude unmeasured. Not changed here** (the freshness standard does not move, Kyle 09-03). **§9.4 disposition 2:** recorded on `#569` (`B-OFFHOURS-BEHAVIOUR`, CC-B — the off-hours options paper), which already owns "the freshness ceiling is not the lever".

**A5 — the "re-dispatched resolved row" (scope §6.3).** `d5f259c9` (`price-skip-paper-PDD/USD`): created 21:54:53Z, **fired once** at 21:57:05Z, `resurface_count` null, resolved 21:59:36Z. **The dispatcher sent it exactly once, before the resolve.** The "re-dispatch" was that one send reaching the reviewer's queue late. The mechanism that DOES repeat rows is the new-row-same-key path: a resolve frees the key (`:505-514`) and the next 40-tick streak mints a fresh row with a fresh id — 46 rows over 11 symbols in four hours. Two genuine send-after-resolve windows exist (`scripts/system-alerts.ts:221-229` sends promoted copies after the lock is released; `:778-783` re-reads once then awaits the post) — record items, not this batch's subject; the standing record removes the repetition at its source.

**A6 — the class grep Langston required (`getActive*AlertId()` predicates whose setter only receives null).** Whole tree, tests excluded: **exactly one member** — `feed-integrity-auto-check.ts:92` / `feed-integrity-monitor.ts:640`, setter `:633` called only with null — which row 3a removes. The wider shape (`alertId|AlertId|alertRaised|alertActive|alertOpen|alertSent`) returns only request parameters and function arguments in `routes.ts` and `alerts-service.ts`, no stored recovery state.

**A7 — warm-up (Langston C3).** At the 2026-10-06 15:44Z restart the boot warm-up ran 15:44:55 → 15:44:57Z, `exit_integrity` and `mark_staleness` among the last prefetched (2 s). ⇒ **bound: a NOT-WARM read skips that tick without escalating; if still not warm 120 s after engine start, it pages** (sixty times the measured warm-up).

**A8 — the resolve machinery (objectives 7-9).** `resolveAlert(id, by, evidence, transport)` (`:583-605`): actor gated by `assertAlertActor` (`:591`, total), evidence by `isValidResolutionEvidence` (`:600`; a uuid passes), transport the closed union at `:143`; the comment at `:137-144` says transport is never passed by a caller — **rewritten in the same commit**. `readAllAlerts` (`:411`) is the read for the by-key composite. Zero production callers today (Langston, 31 hits, all `system-alerts.ts` or tests).

**A9 — the restart case.** The streak `Map` is per engine instance (`:755`); a restart between a mint and the market's return leaves the row active with nothing to clear it. ⇒ the sweep re-measures; it never consults the streak.

## B. PLAN (each item points at its finding)
1. **Quiet-market family + class state** — `_recordPriceSkip` keeps every emit and log line; when the streak's DOMINANT reason is in the quiet-market family (A1) and the class is QUIET by A3, no `breakage` row is minted; the per-class standing record `venue-quiet-<mode>-xstock_spot` is upserted with each skipping position's id, symbol and CURRENT mark age, the oldest age, and the skip rate. Every other reason family pages as today. *(A1, A3)*
2. **Thin ⇒ page** — `T < 50` mints the per-symbol row as today. *(A2, A3)*
3. **Threshold robustness (FINDING-1)** — `streak >= threshold` with a once-per-streak escalated flag (same key and lifecycle as the streak). *(scope §1.5)*
4. **Duration escalation** — a position in the standing record whose mark age passes 30 minutes INTO a not-quiet window (the market has resumed but this symbol has not) mints its own per-symbol row; this also covers the quiet-classed first minutes after the open (A2). *(A2, scope objective 3)*
5. **Cold vs unseeded (C3)** — the `catch` at `:820` discriminates the two messages: unseeded ⇒ a per-class config alert `price-skip-config-<mode>-<class>` + escalate this position now; not-warm ⇒ skip without escalating, page past 120 s from engine start. The hard-coded 40 is removed. *(A7)*
6. **`resolveAlertsByDedupeKey`** in `system-alerts.ts` — selects non-terminal rows with the exact key, resolves each through `resolveAlert`, logs `[RESOLVE_BY_KEY][MULTI_MATCH]` if more than one, no-op on none. *(A8)*
7. **Actor + transport** — `active-exit-monitor` (machine) in `ALERT_ACTORS`; `ResolveTransport` gains `'engine'`, commented as a CLASS (server runtime resolving in-process); `:137-144` rewritten. *(A8)*
8. **The sweep** — at engine start and after every monitor cycle, off the exit path: select keys matching exactly `^price-skip-<mode>-[A-Z0-9.]+/USD$` and the standing record; re-measure each symbol now; resolve when its mark is within its own ceiling, or its position has closed — evidence = the RE-MEASURED position's uuid, or the closed trade's id. The standing record resolves when the class is no longer QUIET and it lists no position still past its ceiling. A throwing resolve is caught, logged `[VENUE_QUIET][RESOLVE_FAILED]`, counted on the cycle line, retried next sweep; a key failing every sweep for an hour raises `venue-quiet-resolve-stuck-<mode>` once. *(A5, A8, A9; C2)*
9. **Every new key clears (C1)** — `price-skip-config-<mode>-<class>`: resolved by the sweep once the row reads successfully; `venue-quiet-resolve-stuck-<mode>`: resolved by the sweep once every key it named has resolved. Tests assert both. *(C1)*
10. **Entry leg** — `xstock-stale-fill-block` stays OUT: one global key, an entry refused, already self-batching, different trigger and resolve condition (3b.f-d). *(scope objective 6)*
11. **Tests** — the scope's list, plus: the 46-row replay (A3) reproduces 2 pages from recorded `T` values; a non-quiet-family reason on a QUIET class still pages; the sweep's selector rejects `venue-quiet-resolve-stuck-paper`; both new keys clear. Mutation: with the QUIET test inverted the replay pages 44 of 46.
12. **Step 7** — at the next US close with xStocks held: the paged share of the first hour's quiet-family rows against A3's pre-registered 2 of 15; one standing record minted and resolved at or after the open with `--by active-exit-monitor` and transport `engine`; zero stuck keys; the per-position skip log intact.
13. **Step 10** — System Impact Map (the standing record as cross-cutting state; the first production resolver; the new actor/transport); System Manual (the alert lifecycle now has an in-process resolver; the quiet rule and its measured basis); `ADJUSTMENT_FRAMEWORK` if the 346 / 50 / 30 min / 120 s values become DB constants (they will — no hard-coded decision constants, `P25` blueprint); `#569` annotation (A4); `DELETED_COMPONENTS_LOG` for the 40 fallback.

No item is UNAUDITED.

## C. HONEST LIMITS
- A3's line rests on one night's distribution; the open-of-session dip (11 minutes) is classed quiet by design and covered by item 4, not by the page.
- A4's magnitude is not measured; this batch does not change the ceiling.
- `T` comes from the recorder's table; the engine's own tick timestamps are the decision-instant source in code — Step 3 states which it reads and shows they agree on the 46-row replay.
