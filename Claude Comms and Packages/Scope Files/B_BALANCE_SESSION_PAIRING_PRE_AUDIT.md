# B-BALANCE-SESSION-PAIRING — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture · **Owner:** CC-C · **Scope:** `Scope Files/B_BALANCE_SESSION_PAIRING_SCOPE.md` r3 (Langston PROCEED 2026-11-05, ruled at `4d55be3c4`) · **Drafted:** 2026-11-05 ~06:45Z.

## 0. Previously stated vs now
- **PREVIOUSLY STATED (scope §1, 02:10Z):** realized since the v5 anchor −$210.04 over 527 closes. **NOW:** −$210.30 over 528 (Langston, 03:05Z). **REASON:** one more close; not a correction.
- **PREVIOUSLY STATED (scope r3 OBJ-1, NOT RE-READ):** "the two historical override scripts ran flat". **NOW: they did NOT** — v2 (`measurement_override`, 07-15) had 7 positions open at the event ($399.30 entry cost) and v3 (07-16) had 10 ($2,089.18), A4. **REASON:** measured at this step. It changes nothing in the formula, which is the point of the straddle term (Langston: it makes the flatness claims non-load-bearing); see A4 for what it does change.
- **PREVIOUSLY STATED (scope r3 §2 row 5):** exposure numerator `Σ quantity × avg_price`; OBJ-1 said `Σ quantity × entry price`. **NOW:** in paper both are `avg_price` — `getActivePositions` maps `entryPrice: p.avgPrice` (`trade-safety.ts:98-103`), so `entryPrice || avgPrice || '0'` (`:634`) reduces to `avg_price || '0'` (A3).

## 1. Audit

### A1 — the function and its callers, census at the ref (§9.5(a); `git grep` over `server/`, tests excluded)
`getPortfolioBalanceV2(mode)` (`guardrail-settings.ts:25`) returns `portfolio_state.balance` + `getRealizedPnlSince(mode, engineSessionStart)`, and **returns 0 on any throw** (its own catch, `:138-141`). Writers of its inputs: `portfolio_state` has ONE writer, `executeReanchor` (`portfolio-anchor-service.ts:148-181`; Langston, repo-wide); `engineSessionStart` is set at engine start and nulled at the two stop paths (scope §1). **Direct callers (8):**

| # | site | use | needs | disposition |
|---|---|---|---|---|
| 1 | `daily-loss-budget.ts:160` | kill-switch denominator | session-paired (Kyle, P19-B6; `#632`) | **unchanged** |
| 2 | `xstock_spot/active-dispatch.ts:222` | xStock `SizingContext.portfolioValue` | money held | **moves** |
| 3 | `guardrail-settings.ts:183` → `buildSettingsFromGuardrails().portfolioValue` | see A2 | money held | **moves** |
| 4 | `active-execution-engine.ts:6759` | OPENED audit row's working balance | money held | **moves** |
| 5 | `trade-safety.ts:613` | `checkMaxTotalExposure` denominator | money held (A3) | **moves** |
| 6 | `signal-orchestrator.ts:2106` | `[B6]` sizing (`<= 0` ⇒ SIZING_ERROR) | money held | **moves** |
| 7 | `command-router.ts:293` | `riskPerTrade` | — | **dead code** (its own comment cites `#136`); untouched, allow-listed with that reason |
| 8 | `routes.ts:4584`, `:4670`, `:4749` | `/api/portfolio/history`, `/value-history`, `/stats` initial balance, `\|\| 50000` | display | **untouched** — the main Dashboard is off-limits unless it breaks paper or the VTS (Kyle 2026-10-19). The `\|\| 50000` hard-coded default for a DB-governed value goes to Kyle as an item, not into this batch (A6) |

### A2 — readers of `buildSettingsFromGuardrails().portfolioValue` (the one-hop-down census)
`git grep '\.portfolioValue'` over `server/`, tests excluded, settings readers only: `trade-safety.ts:340` (`checkPositionSizeCap`), `trade-safety.ts:564` (inside the commented-out body of the DORMANT LPCP check — `checkLowPricedCoinProtection` always returns `{ ok: true }` at `:502`, so this read never runs), `pre-execution-validator.ts:111` (the buffered-notional estimate), `active-execution-engine.ts:5584` (the AJ19 dry-run diagnostic). Every other `buildSettingsFromGuardrails` caller reads other fields (`maxOpenTrades` at `routes.ts:11911`/`:12505`, etc.).
**⚠️ FINDING — the live position-size cap is FAIL-OPEN on a non-positive balance:** `trade-safety.ts:340-345` returns `{ ok: true }` when `portfolioValue` is missing or `<= 0` ("skipping position size cap check"). (`:564-567` has the same shape but sits in the dormant LPCP body and never runs.) So the existing `getPortfolioBalanceV2` catch (`return 0`) already turns a DB fault into a SKIPPED position-size cap. **Consequence for the plan:** the new function must signal a refusal by something these checks cannot read as "skip" — never 0 (P1, P4).

### A3 — the exposure check's basis (Langston Step-2 notes 2 and 3)
`checkMaxTotalExposure` (`trade-safety.ts:607-650`): denominator `getPortfolioBalanceV2(mode) × maxTotalExposurePct / 100`; numerator Σ `quantity × (entryPrice || avgPrice || '0')` over `getActivePositions`, which for paper reads `storage.getActiveOpenPositions('paper')` and maps `entryPrice: p.avgPrice` (`:98-103`). `getActiveOpenPositions` ignores its `mode` argument (`storage.ts:3847-3852`; Langston's §13 find). The trade term is `trade.preComputedNotional || (trade.entryPrice * 1)` (`:638`), a silent one-share default. **Measured 2026-11-05 ~06:40Z:** 20 open rows, 0 with a null or zero `avg_price`, 0 with a null or zero quantity. Both `|| '0'` and `* 1` read as SAFE while being the permissive direction (`#546`'s shape): a missing price counts as zero exposure, a missing notional as one share.

### A4 — every paper anchor event, with what was open at it (measured 2026-11-05 ~06:40Z)
Straddlers = `closed_trades` rows, mode paper, `opened_at` < event, `closed_at` NULL or after it, not `never_filled`.

| v | reason | at | balance | straddlers | entry cost | their P&L after |
|---|---|---|---|---|---|---|
| 1 | start_new | 07-14 14:57Z | 878.00 → 824.11 | 0 | 0 | 0 |
| 2 | measurement_override | 07-15 15:50Z | 824.11 → 2400.00 | 7 | $399.30 | −$0.44 |
| 3 | measurement_override | 07-16 13:37Z | 2400.00 → 2250.00 | 10 | $2,089.18 | −$28.73 |
| 4 | auto_divergence | 08-12 04:19Z | 2250.00 → 824.11 | 5 | $1,615.43 | +$187.32 |
| 5 | measurement_override | 10-06 15:52Z | 824.11 → 820.00 | **0** | 0 | 0 |

- **v5, the anchor in force, has no straddlers**, so the money-held figure today is $820.00 − $210.30 = **$609.70**.
- `start_new` stops the engine before it anchors (`routes.ts:11158-11163`), and the stop flattens (`stopActiveEngine`'s `closeType` flatten, `active-engine-service.ts`); v1's measured zero agrees. *(Read at the code, not exercised; non-load-bearing either way because of the straddle term.)*
- **v2 and v3 were operator overrides taken with positions open.** Whether those operator-typed figures meant uncommitted cash or total capital is not recorded; for them the straddle term would add $399.30 and $2,089.18. **They are history:** the function reads only the anchor in force (v5). **Forward guard:** the one live operator path, `paper-reset-3000.ts`, refuses unless flat (`:33-37`); the two scripts that minted v2/v3, `server/scripts/b8-5-measurement-override.ts` and `b8-5-tune3-anchor.ts`, are one-off historical tools that can still mint an anchor with positions open (P6).

### A5 — retention (Langston Step-2 note 1)
`closed_trades` is in the B75 hot-retention sweep (`server/scripts/b75-retention-sweep.ts:203`, `timestampColumn: 'closed_at'`, `archive: true`). **Measured: `data_lifecycle` / `closed_trades.hot_retention_days` = 365** (`module_constants`, updated 2026-08-06). Earliest paper close in `closed_trades`: 2026-07-15 06:18Z, so nothing has been swept yet. The v5 anchor is 30 days old ⇒ about 335 days of runway. Past it, the sweep would drop realized P&L — and the straddle term's rows first — out of the figure, silently and in the high direction: the same failure as the restart, by another door.

### A6 — ledger and provenance (§9.5(b), (b-ii))
- **Searched** `RUNNING_ISSUES` (`#618`, `#632`, `#648`, `#1171`, `#136`, `#546`), `BATCH_CATALOG` (`P19-B6`, `B-BALANCE-TRUTH`), the `B-BALANCE-TRUTH` completion report, the System Manual (§ "`getPortfolioBalanceV2`", `SYSTEM_MANUAL.md:3711-3716`), the System Impact Map (`:137`), and `bridge/canonical/`.
- **Original intent — `bridge/canonical/DawnTrader_System_Invariants_Design_Guarantees.md` §1.3, INVARIANT T3:** *"Guardrail risk calculations MUST use Current Balance (realized only)… Current Balance = Starting Balance + Realized P/L… Risk calculations (position sizing, max exposure) use Current Balance."* `Phase_8_Implementation_History.md` §5.3.4 (C7) states the same. **There is no engine session in the original definition**: the session scoping arrived with `594aad717` (scope §3) as a refactor with no stated intent. ⇒ **capital at cost is T3 as written**; this batch restores it for sizing and the exposure cap, and the kill switch keeps the session pairing Kyle later decided for it (`#632`). Disposition (2), relevant but needs updating to today's intent.
- **`#648` — Kyle's exposure-cap objection (2026-08-01):** Kyle objected to the cap blocking entries; the record keeps CC-C's disagreement visible ("at a 100% cap, blocking an entry that takes total exposure PAST the balance is the guardrail WORKING"). This batch makes the cap block every new paper entry until about $164 of exposure closes (scope §4a). **Not a defect report and not a decision this batch can take for him:** the cap stays 100% (no limit loosens), and the pause is stated to Kyle BEFORE the deploy (P7).
- **`#136`:** `CommandRouter` is dead code with its own home; left as it is.
- **`#736`:** three raw-SQL readers outside `storage.ts` do not partition on `mode`; none is on this path.

### A7 — System Impact Map and System Manual
- **System Manual `:3711-3716`** documents `getPortfolioBalanceV2` as "realized P/L from closed trades within current engine session" with no mention that sizing and the exposure cap read it. **Gap:** nothing says which consumers need which meaning. Step 10 rewrites the entry: two functions, two meanings, the consumer list, T3.
- **System Impact Map `:137`** records `B-BALANCE-TRUTH`; there is no component entry for the balance function or its consumers. **Gap:** flagged; Step 10 adds one (writers, readers, the anchor-event dependency, the retention dependency, blast radius).

### A8 — entry points (§9.5 entry-point enumeration)
The balance is read on demand only, with no scheduler, timer or subscription of its own. Its triggers are the callers in A1/A2: the signal orchestrator's sizing per cycle, the xStock dispatch per signal, the trade-safety checks per attempt, the pre-execution validator per request, and the OPENED audit write. The kill switch's `setImmediate` hook (`daily-loss-budget.ts`) stays on the old function. **One writer of each input** (A1); no mutual-exclusion question arises.

### A9 — live mode and the null session (scope OBJ-3)
- **Null session (`#585`):** the money-held figure does not depend on the session, so the null-session branch does not arise for it. It stays in `getPortfolioBalanceV2` for the kill switch, unchanged.
- **Live:** the live leg reads `storage.getTrades(mode, { status: 'closed' })` and `realizedPL` (`guardrail-settings.ts:115-130`), a different table; live mode is Phase 21 and is not running. Live money held is the exchange balance, which this batch cannot define from paper's ledger.

## 2. Plan (each item cites its finding)
| # | item | finding |
|---|---|---|
| **P1** | **`getMoneyHeld(mode)`**, beside `getPortfolioBalanceV2` in `guardrail-settings.ts`. Reads `portfolio_state` (balance, `anchor_version`) and the `portfolio_anchor_events` row with the same `(mode, anchor_version)`; **money held = balance + Σ `quantity × entry_price` of paper `closed_trades` rows open at that event + `getRealizedPnlSince(mode, occurred_at)`** (the same aggregate as the kill switch's numerator, `COALESCE(reconstructed_net_pnl, pnl)`). **It THROWS a typed `MoneyHeldUnavailable` with a reason, never returns 0**, on: no state row; no ledger row for the version; ledger `new_balance` ≠ state balance; a straddler with a null or non-positive price or quantity; anchor age ≥ `closed_trades.hot_retention_days` (read through the module-constants reader, no fallback — a missing constant is itself a refusal); `mode = 'live'` (A9: "live money held is the exchange balance, Phase 21"). It logs one line with every term. | A1, A3, A4, A5, A9; scope OBJ-1, OBJ-3 |
| **P2** | **Re-point the money-held callers:** A1 rows 2, 4, 5, 6 call `getMoneyHeld`; `buildSettingsFromGuardrails` (row 3) sets `portfolioValue` from it and, on `MoneyHeldUnavailable`, sets it to `null` with the reason logged, so the 20+ callers that read other fields keep working. `getPortfolioBalanceV2` keeps the kill switch only. | A1, A2 |
| **P3** | **Every money-held reader refuses on a refusal, never skips:** `trade-safety.ts:340` changes from `return { ok: true }` to a blocking refusal when `portfolioValue` is null or not finite (the dormant LPCP body at `:564` is not touched; it does not run); `pre-execution-validator.ts:104` already throws on null; `signal-orchestrator.ts:2106` and `active-dispatch.ts:222` catch `MoneyHeldUnavailable` and refuse the sizing (`SIZING_ERROR` with the reason); `trade-safety.ts:613` returns a blocking `MONEY_HELD_UNAVAILABLE`; the audit write (row 4) records `null`, not 0. | A2 |
| **P4** | **The exposure check's two silent defaults (Langston notes 2, 3, and the scope's §4b, disposition 1):** a position with a null or non-positive price or quantity, or a trade with no `preComputedNotional`, REFUSES the check (blocking, named code) instead of counting zero or one share. Reachability first, at Step 3: who calls `checkMaxTotalExposure` without `preComputedNotional`; if no production caller can, the refusal is a fence and the record says so. The straddle term and the exposure numerator then agree on paper's open rows without reproducing a fallback chain: both refuse where the price is missing. | A3 |
| **P5** | **`getActiveOpenPositions` mode fence (scope §4b):** a test that fails if a live caller reads it, plus a record line beside the function; no behaviour change. | A3 |
| **P6** | **The two historical override scripts** (`b8-5-measurement-override.ts`, `b8-5-tune3-anchor.ts`) can still mint an anchor with positions open, which P1 would then read as uncommitted cash. **Disposition (rule 18): delete them in this batch**, with blast radius verified (no code importer at the ref — the only mentions are governance documents, the 2026-07-15 migration and `MANIFEST.txt`; `paper-reset-3000.ts` is the live operator path and refuses unless flat), logged in `DELETED_COMPONENTS_LOG.md` and archived. *If Langston prefers to keep them, the alternative is the same flat check `paper-reset-3000.ts` uses.* | A4 |
| **P7** | **Deploy consequence, stated to Kyle beforehand (scope §4a, `#648`):** the entry pause until about $164 of exposure closes, re-measured at deploy, with the Step-7 read. No limit changes. | A6 |
| **P8** | **Tests:** OBJ-1's list (restart; operator re-anchor; the v3/v4 auto-after-operator shape; a straddler closed after and one still open, each counted once; broken pair; retention age; null-price straddler; live refused); the synthetic anchor/session split (OBJ-2's discriminator); the census fence — every caller of `getPortfolioBalanceV2` is `daily-loss-budget.ts`, `command-router.ts` (`#136`) or the three display routes, each with its reason; the fail-open-to-refusal fence for `trade-safety.ts:340`; P4's refusals; P5's fence. | all |
| **P9** | **Step 10 docs:** System Manual entry rewritten (two functions, two meanings, T3, the consumer list, the retention dependency); a System Impact Map component entry; `RUNNING_ISSUES` `#618` leg 1 closed on this batch; the `\|\| 50000` display default (A1 row 8) to Kyle as a question, not filed as work. | A6, A7 |

**Not in this plan, and why:** the kill-switch denominator (`#632`, Kyle's decision); the display routes (Kyle's 2026-10-19 rule); the `pnl` vs `netPnl` basis (Langston's standing condition: both sides together or not at all).

## 3. Step 7 (pre-registered; scope §4, §4a)
1. **Confirmation:** the first sizing log after deploy shows money held = v5 balance + realized since 2026-10-06 15:52:57Z (no straddlers at v5), re-measured from the database at the same minute.
2. **The pause:** every new-entry refusal in the window names `MAX_TOTAL_EXPOSURE`; open exposure falls through closes with no new opens until it is at or under money held; entries resume when it is. **FAIL** if entries are refused for any other reason, or exposure is at or under money held and entries do not resume.
3. **OBJ-4 (after the drain):** the first new entries' notional against the pre-deploy ratio (about 1/1.34).
4. **Zero refusals of `MoneyHeldUnavailable`** in the window, with the instrument shown able to produce one (the unit test that throws it, and a grep control on the refusal string's presence in the build).

## 4. Risk
- **Entry pause at deploy** (P7), expected and stated.
- **Refusal instead of skip** (P3, P4) can block entries that today pass on a DB fault. That is the intended direction: risk tolerance wins.
- **The function now reads two more rows per call** (the ledger row and the straddle aggregate) on the sizing path. The ledger row is a unique-index lookup; the straddle aggregate is bounded by the rows open at the anchor event (0 today).

## 5. Plain-language summary
The audit confirmed the scope and found two more things. One of the safety checks — the cap on a single position's size — quietly switches itself OFF when the balance reads zero, so a database hiccup can make it pass instead of block; the new balance never reads zero to signal trouble, and that check now blocks instead. And the old one-off tools that set the balance by hand could still do it while trades are open, so the plan removes them. The design rule written at the start of the project says risk sizing uses the starting balance plus realized profit and loss, with no engine session in it — this batch puts that back for sizing and the exposure cap, and leaves the daily-loss kill switch exactly as Kyle decided.
