# B-EPOCH-KEYING-PARITY — SCOPE

change-class: non_architecture

> **Batch id:** `B-EPOCH-KEYING-PARITY` · **Owner:** Claude Analyst (CC-C) · **2026-08-24**
> **Part F piece:** the **F-F** remainder — found at Step-7 UI verification of `B-OBSERVATION-EPOCH`.
> ⛔ **NOT DEPLOYED.** Staging runs `afb7d326c`.

---

## 1. HOW IT WAS FOUND, WHICH IS THE POINT

Kyle directed me to the **Paper Trading page** dashboard specifically. I had been verifying the main
Dashboard tab. **On the correct page the defect was visible in one screenshot**, and it is the exact
failure `B_OBSERVATION_EPOCH_SCOPE.md` §3 says that batch existed to prevent.

**MEASURED on staging, three figures on ONE card at ONE moment (2026-08-24T10:26Z):**

| card | shows | keying actually used | correct? |
|---|---:|---|---|
| Earnings — Today / 7d / 30d | **−$4.91** over 6 | `computeRollingEarnings` — **both-leg** | ✅ |
| **Lifetime Net P/L** | **+$5.76** over 13 | `getLifetimeScoreboard` — **close-keyed** | ❌ |
| **Activity & Results** — win rate | **66.7% (6 of 9)** | `trades/analytics` 24h — **unscoped** | ❌ |
| **Averages & Edge** | $2.74 × 9 = $24.66 | same window as above | ❌ |

Independently re-derived in SQL against the live epoch `2026-08-22T22:01:00Z`:
**close-keyed = 13 trades / +$5.76 · both-leg = 6 trades / −$4.91 · all-time = 534 / −$68.35.**

⇒ **The card showed an honest figure and a contaminated figure side by side, each looking equally
authoritative — and they disagree in SIGN.**

## 2. ★ THE REAL LESSON: THE DECISION SHIPPED INTO ONE READER OUT OF FOUR

`B-OBSERVATION-EPOCH` **decided** both-leg keying, **argued** it in its §4 against measured numbers,
and **pinned it with four tests.** It still shipped wrong — because **the predicate lived INLINE
inside `computeRollingEarnings`.** The other three readers never had access to the rule.

⛔ **AND THE FOUR TESTS COULD NOT HAVE CAUGHT IT: they tested the FUNCTION, not the PARITY.** Every
one passed, on a system whose card showed three different answers to one question. **A rule with no
single home is a rule that will be re-implemented differently, and tests scoped to one implementation
cannot see the others.** Same family as the `#641` two-sources shape this project keeps paying for.

## 3. OBJECTIVES

| # | Objective | Verified when |
|---|---|---|
| **OBJ-1** | ONE home for the keying rule | `isInObservationEpoch` / `clampWindowToEpoch` exported from `dashboard-metrics.ts`; every epoch-aware reader calls them |
| **OBJ-2** | Lifetime is both-leg | `getLifetimeScoreboard` SQL carries the `opened_at` leg; Lifetime reads −$4.91 / 6, matching the rolling windows |
| **OBJ-3** | The analytics window is epoch-scoped | `trades/analytics` win rate + averages computed over in-epoch trades only |
| **OBJ-4** | The empty-window branch scopes too | `range=1h` on a quiet hour reports epoch-scoped earnings, not all-time |
| **OBJ-5** | No-epoch behaviour EXACTLY unchanged | fence asserts a null-`openedAt` row still counts when no epoch is set |
| **OBJ-6** | Kyle's requirement | 24h === 7d === 30d === Lifetime on day one |

## 4. THE FOUR SITES

1. **`dashboard-metrics.ts`** — predicate EXTRACTED and exported; the `(t as any).openedAt` cast
   **removed** (`openedAt` is a declared field, so the cast only ever suppressed checking).
2. **`routes.ts` `/active-engine/trades/analytics`** — the epoch is now resolved **ABOVE** the window
   filter. ★ **That placement IS the root cause**: it used to be read ~180 lines below, so the value
   did not exist at the filter. Window keyed on both legs + floor clamped.
3. **`routes.ts` empty-window branch** — passed `null` for the epoch over the **FULL** valid set.
   Its comment defended this: *"`validTrades` is empty here … there is nothing to scope."* **FALSE
   — only `trades` is empty; `validTrades` is all 534 rows.** ⇒ any range with an empty window
   silently reported **unscoped all-time** earnings.
4. **`storage.getLifetimeScoreboard`** — the `opened_at` leg added, **guarded** so OBJ-5 holds
   exactly. ⚠️ A bare `opened_at >= '-infinity'` would NOT be equivalent: it drops null-`openedAt`
   rows and silently changes the no-epoch behaviour the prior batch promised to leave alone.

## 5. FENCE — MUTATION-PROVED, NOT MERELY GREEN

`b-epoch-keying-parity-fence.test.ts`, 11 tests. **Green proves nothing on its own** (`#594`:
restoring the bug left all six fences green). **MUTATION-PROVED:** `isInObservationEpoch` reverted
to close-only ⇒ **4 fence tests FAIL + 2 pre-existing tests FAIL**; restored ⇒ **26/26 green**,
tsc **384 = baseline**.

## 6. OUT OF SCOPE, NAMED

- **The `/api/portfolio/overview` 401** on the main Dashboard tab — a first-authenticated-request
  race; the endpoint returns `totalValue: 824.11` correctly with a token. **Not this batch**, filed.
- **`getRealizedPnlTotal` / `getRecentClosedPnls`** (main Dashboard) are also unscoped — same class,
  different page. Kyle scoped me to the Paper Trading page; recorded rather than silently widened.
- ⚠️ **I rate-limited the staging login myself** (5 per 900 s) with repeated `curl` logins, so the
  runtime re-verify of OBJ-4 is pending the window reset. **Named as my own doing, not a finding.**
