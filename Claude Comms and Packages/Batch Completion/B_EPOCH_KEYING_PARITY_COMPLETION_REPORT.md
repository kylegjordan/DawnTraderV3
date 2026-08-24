# B-EPOCH-KEYING-PARITY — COMPLETION REPORT

> **Owner:** Claude Analyst (CC-C) · **Closed 2026-08-24** · **change-class: non_architecture**
> **Deployed `30808c6c0ecddb6ca4d3247c4c795e3e27d666a2`** 2026-08-24T10:55Z · **CI run `32718981861`, 4/4 green per-job**
> **Langston: APPROVED at `60e53fe36` — "Deploy it."** 5 non-blocking conditions, all discharged below.
> **Part F: the F-F remainder.** Scope: `Scope Files/B_EPOCH_KEYING_PARITY_SCOPE.md`

---

## 1. HOW IT WAS FOUND — AND THAT IS THE POINT

Kyle directed me to the **Paper Trading page** dashboard. **I had been verifying the main Dashboard tab
and reported on it.** He redirected me. **On the correct page the defect was visible in one screenshot.**

**MEASURED on staging, three figures on ONE card at ONE moment (2026-08-24T10:26Z):**

| card | showed | keying actually used |
|---|---:|---|
| Earnings — Today / 7d / 30d | **−$4.91** over 6 | `computeRollingEarnings` — **both-leg** ✅ |
| **Lifetime Net P/L** | **+$5.76** over 13 | `getLifetimeScoreboard` — **close-keyed** ❌ |
| **Activity & Results** — win rate | **66.7% (6 of 9)** | `trades/analytics` 24h — **unscoped** ❌ |
| **Averages & Edge** | $2.74 × 9 = $24.66 | same window ❌ |

Re-derived independently in SQL against the live epoch `2026-08-22T22:01:00Z`: **close-keyed 13 / +$5.76 ·
both-leg 6 / −$4.91 · all-time 534 / −$68.35.**

⇒ **An honest figure and a contaminated figure side by side, DISAGREEING IN SIGN, each looking equally
authoritative** — the exact failure `B_OBSERVATION_EPOCH_SCOPE.md` §3 says that batch existed to prevent.

## 2. ★ THE REAL FINDING: A DECIDED RULE SHIPPED INTO ONE READER OUT OF FOUR

`B-OBSERVATION-EPOCH` **decided** both-leg keying (at Langston's own insistence that it be a stated
decision), **argued** it against measured numbers, and **pinned it with four tests.** It still shipped wrong.

⛔ **BECAUSE THE PREDICATE LIVED INLINE INSIDE `computeRollingEarnings`.** The other three readers never
had access to the rule.

⛔ **AND THE FOUR TESTS COULD NOT HAVE CAUGHT IT — THEY TESTED THE FUNCTION, NOT THE PARITY.** All four
passed, on a system whose card showed three different answers to one question.

**A rule with no single home gets re-implemented differently, and tests scoped to one implementation are
structurally blind to the others.** Same family as the `#641` two-sources shape this project keeps paying for.

## 3. OBJECTIVES

| # | Objective | Result |
|---|---|---|
| **OBJ-1** | ONE home for the keying rule | ✅ `isInObservationEpoch` / `clampWindowToEpoch` exported; the three TS readers call them |
| **OBJ-2** | Lifetime is both-leg | ✅ **−$4.91 over 6**, matching the rolling windows |
| **OBJ-3** | Analytics window epoch-scoped | ✅ win rate now **50.0% (3 of 6)**; Avg Net R **−0.25R (6 trades)**; Profit Factor **0.78** |
| **OBJ-4** | Empty-window branch scopes too | ✅ `range=1h` reports **−4.91/−4.91/−4.91**, not all-time |
| **OBJ-5** | *(REWORDED — was overclaimed)* the `epoch === null` branch unchanged | ⚠️ see §5 |
| **OBJ-6** | Kyle's requirement | ✅ **24h = 7d = 30d = Lifetime = −$4.91**, all over 6 trades |

**UI-VERIFIED (§9.3), not curl-checked:** Paper Trading page navigated in the browser post-deploy.
Portfolio Value $841.32 live / **Realized, Starting and Kraken balance all $824.11**.

★ **THE HONEST PICTURE IS MATERIALLY WORSE THAN THE CONTAMINATED ONE, and that is the point.** Win rate
66.7% → **50.0%**; Avg Net R 1.81R → **−0.25R**; Profit Factor 2.51 → **0.78**. The straddlers' entries
were taken at ghost-book prices, and **they flattered the record.**

## 4. THE FOUR SITES

1. **`dashboard-metrics.ts`** — predicate extracted and exported; the **`(t as any).openedAt` cast
   removed** (`openedAt` is a declared field, so the cast only ever suppressed checking).
2. **`routes.ts` `/active-engine/trades/analytics`** — the epoch is now resolved **ABOVE** the window
   filter. ★ **That placement WAS the root cause:** it was read ~180 lines below, so the value did not
   exist at the filter line. Window keyed on both legs; floor clamped to the epoch.
3. **`routes.ts` empty-window branch** — passed `null` over the **FULL** valid set, and its comment
   **defended this**: *"`validTrades` is empty here … there is nothing to scope."* **False — only
   `trades` is empty; `validTrades` is all 534 rows.** Any range with an empty window silently reported
   unscoped all-time earnings.
4. **`storage.getLifetimeScoreboard`** — `opened_at` leg added, **guarded** so the no-epoch path is
   untouched. A bare `opened_at >= '-infinity'` would **not** be equivalent: it drops null-`openedAt` rows.

**FENCE MUTATION-PROVED, not merely green** (`#594`: restoring the bug left all six fences green).
Reverted to close-only ⇒ **4 fence tests + 2 pre-existing FAIL**; restored ⇒ **26/26**; tsc **384 = baseline**.

## 5. LANGSTON'S FIVE CONDITIONS — ALL DISCHARGED

**(1) THE FENCE IS NECESSARY BUT NOT SUFFICIENT, AND HIS REASONING IS THE SHARPEST THING IN THIS BATCH.**
My fence's *"★ THE PARITY ITSELF"* block asserts agreement between `isInObservationEpoch` and
`computeRollingEarnings` — **a function and its own caller, both in TypeScript.**
⛔ **`getLifetimeScoreboard` is a second implementation of the same rule in a second language, and it has
no test at all — and it is the reader that was wrong by the largest margin.** My fence header says *"the
production readers all call it."* **The SQL does not.** ⇒ **my own fence header is a comment describing
code that is not there — the third instance of that class in one day.**
★ **The sufficient shape already exists in this repo and was built yesterday:**
`b-phantom-fill-reconstruct-fence.test.ts:15` names the same risk (*"THE TWO EXPRESSIONS DRIFT"* between
SQL `HONEST_PNL` and JS `honestNetPnl()`) and `:147` asserts them **row-by-row over the same rows.**
⇒ **filed `#900`, home `B-EPOCH-PARITY-FENCE`, owner CC-C, due 2026-09-05.**

**(2) THE RULE NOW HAS ONE HOME; THE EPOCH *VALUE* STILL HAS TWO.** Langston measured it at the ref: the
SQL keys on the **explicit `module_constants` row only**, while every TS reader keys on `epochStartedAt`,
which `storage.ts:3455` resolves as **`explicit ?? first_trade`**. **If the explicit row were removed the
SQL would admit 534 and the TS predicate 530 — a 4-row, 0.75% divergence** (the 4 were open at the moment
of the first close). **Inert today, and it pre-dates this batch** — but **this batch propagated it from
one reader to three.** ⇒ **filed `#901`, same home.**

**(3) OBJ-5 REWORDED — IT WAS OVERCLAIMED.** The fence proves the **`epoch === null`** branch, a state the
production caller reaches **only with zero trades**. It does not prove "no-epoch behaviour exactly
unchanged." The scope now says what the test shows rather than what I wanted it to show.

**(4) THE FIFTH TOUCHED FILE, NAMED.** `kraken-websocket-adapter.ts:3300` — comment-only but it reaches a
response body, and by its own text it belongs to **`B-MBIM-SWITCH-ON`'s** Step-7 read. Named in both
reports so that batch's record contains a correction made under its name.

**(5) RUNTIME RE-VERIFY, FOUR FIGURES QUOTED WITH COUNTS.** Post-deploy, `range` ∈ {24h, 7d, 30d}:
`windowNetPnl` **−4.91**, `n` **6**; `lifetime.netPnl` **−4.91**, `tradeCount` **6**; earnings
24h/7d/30d **−4.91 / −4.91 / −4.91**; epoch `2026-08-22T22:01:00.000Z`. `range=1h` (empty window):
earnings still **−4.91** — OBJ-4 confirmed.

**PLUS his boundary tightening:** `getRealizedPnlTotal` / `getRecentClosedPnls` are now the **only**
remaining unscoped epoch readers ⇒ **filed `#902` with owner + due, not left in prose.**

**PLUS the board:** card `PVTI_lAHODmulEM4BfQP4zg3wiyQ` created (he does not create cards),
Status=Governance / Owner=Analyst / Type=Batch / Blocked on=Nothing / Issue=`#900 #901 #902 #903`,
**read back through GraphQL `fieldValues`** rather than `item-list`, which the protocol records as
untrustworthy for fields.

## 6. A SECOND DEFECT FOUND, AND IT WAS MASKING THE FIRST

`/api/portfolio/overview?mode=paper` is the **one endpoint of 25** that returns **401** on page load —
request #2, immediately after the unauthenticated `/api/settings`. **Not an authorization defect:** same
`authenticateToken` middleware as endpoints that return 200, and server-side with a token it returns
**200 with `totalValue: 824.11`.** The browser sent it without a usable token, and **the component does
not retry**, so the Portfolio Value card on the main Dashboard tab sits in **skeleton-load forever.**
⚠️ **It also MASKS `#902`** — a bug hidden by another bug. ⇒ **filed `#903`, `B-DASHBOARD-AUTH-RACE`,
owner CC-C, due 2026-09-05.**

## 7. GOVERNANCE FILES CHANGED

`RUNNING_ISSUES.md` (#900–#903) · `Scope Files/B_EPOCH_KEYING_PARITY_SCOPE.md` · this report ·
`MEMORY_CC_C.md` · `/home/langston/MEMORY.md` · delivery-board card.
**BATCH_CATALOG / PHASE_HISTORY / PHASE_19_PLAN entries land with the closing commit.**
**SYSTEM_MANUAL judged NOT applicable** — no architecture, strategy, regime, filter, signal-pipeline or
math change; this is display-reader keying. **SIM judged NOT applicable** — no component added, removed
or re-keyed; the shared predicate lives inside an existing module.

## 8. WHAT I GOT WRONG, RECORDED

- **I verified the wrong page.** Step-7 was run against the main Dashboard tab when the batch's subject
  was the Paper Trading page. Kyle redirected me. `verified-the-wrong-page`.
- **I decided a rule, tested it, and left it inline in one of four readers.** `rule-with-no-home`.
- **I rate-limited the staging login myself** — `/api/auth/login` allows 5 per 900 s and repeated `curl`
  logins return 429. **My own doing, declared as such rather than reported as a finding.** Fixed by
  caching one token.
- **My first `storage.ts` write produced a 644-line diff for 12 real lines** — Python's `write_text`
  rewrites every line ending. Caught by `--ignore-all-space --numstat` **before** commit and re-applied
  byte-exact. Langston: *"I'd have bounced 316 lines of line-ending noise."*
- **My fence header overclaimed** (*"the production readers all call it"*) — the SQL reader does not.
  Langston caught it; `#900`.
