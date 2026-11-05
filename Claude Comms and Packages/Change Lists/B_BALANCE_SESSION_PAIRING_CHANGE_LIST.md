# B-BALANCE-SESSION-PAIRING — change list for the Step-4 diff review

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (scope header).
- **(ii) Doc set for that class:** scope `Scope Files/B_BALANCE_SESSION_PAIRING_SCOPE.md` r3 — present (Langston PROCEED); pre-audit `Scope Files/B_BALANCE_SESSION_PAIRING_PRE_AUDIT.md` r3 — present (Langston PROCEED, stamped `549a1cd66`); completion report — absent (batch at Step 4); `BATCH_CATALOG` / `PHASE_HISTORY` / System Manual / System Impact Map — owed at Step 10 (pre-audit P9); `DELETED_COMPONENTS_LOG` — landed in this commit (P6).
- **(iii) Step 2:** the pre-audit above.

**Ref:** code `4b54a052bda5095c8d1a2dcfbc22d20e56540c7c` (one commit, `e05ce6666` before rebase). Line numbers below are at it. **Built off the branch head, not `0abfd710`** (your Step-2 note).

| file | change |
|---|---|
| `server/services/guardrail-settings.ts` | NEW `MoneyHeldUnavailable` (`:149`), `readClosedTradesHotRetentionDays` (`:158`), `getMoneyHeld` (`:184`; the formula at `:207`); the builder's `portfolioValue` from it, null on a refusal (`:265`, `:287`) |
| `server/services/portfolio-anchor-service.ts` | NEW `getAnchorEventByVersion` (`:131`) |
| `server/storage.ts` | NEW `getStraddleEntryCostAt` (`:3318`) + interface line |
| `server/asset_classes/xstock_spot/active-dispatch.ts` | read hoisted above the literal, refuses by name (`:226`) |
| `server/services/signal-orchestrator.ts` | money held, refusal caught by name; the `<= 0` test replaced (`:2111-2115`) |
| `server/services/active-execution-engine.ts` | OPENED audit read with its own catch + null-safe write (`:6768`, `:6784`); dry-run diagnostic keeps null absent (`:5588`) |
| `server/services/trade-safety.ts` | position-size cap refuses instead of skipping (`:347`); exposure cap reads money held (`:625`); unreadable position refuses (`:662`); unsized candidate sized by the fixed-notional rule (`:677`); `MONEY_HELD_UNAVAILABLE` code |
| `server/services/rtb-metrics-service.ts` | `MONEY_HELD_UNAVAILABLE` in the reason union and both lists |
| `server/services/pre-execution-validator.ts` | passes its own estimate as the notional (`:135`) |
| `server/scripts/b8-5-measurement-override.ts`, `b8-5-tune3-anchor.ts` | DELETED (P6); archived; logged |
| tests | NEW `b-balance-session-pairing.test.ts` (28); `b-guardrail-fail-closed.test.ts` re-pointed + 3 behavioural cases; 8 more files' mocks re-pointed (P10) |

## P1 — `getMoneyHeld` (`guardrail-settings.ts:184-217`)
```ts
if (mode !== 'paper') throw new MoneyHeldUnavailable(`… live money held is the exchange balance (Phase 21) …`);
const state = await getAnchorState(mode);                                  // portfolio_state (balance, anchor_version)
const ev = await getAnchorEventByVersion(mode, state.anchorVersion);       // the ledger row that WROTE it
if (Math.abs(ev.newBalance - state.balance) > 0.005) throw …               // broken pair
const retentionDays = await readClosedTradesHotRetentionDays();            // data_lifecycle, no fallback
if (ageDays >= retentionDays) throw …
const straddle = await storage.getStraddleEntryCostAt(mode, ev.occurredAt);
if (straddle.invalidCount > 0 || !Number.isFinite(straddle.entryCost)) throw …
const { realizedPnl } = await storage.getRealizedPnlSince(mode, ev.occurredAt);
const moneyHeld = state.balance + straddle.entryCost + realizedPnl;        // :207
if (!Number.isFinite(moneyHeld) || moneyHeld <= 0) throw …
// any other throw is wrapped as MoneyHeldUnavailable(`read failed: …`)
```
`getStraddleEntryCostAt` (`storage.ts:3318`): `SUM(quantity * entry_price)`, `COUNT(*)`, and `COUNT(*) FILTER (WHERE quantity <= 0 OR entry_price <= 0)` over `closed_trades` where `mode = $mode`, `opened_at < $at`, `(closed_at IS NULL OR closed_at > $at)`, `close_reason IS DISTINCT FROM 'never_filled'`.

## P3 / C-1 — the audit row (`active-execution-engine.ts:6768-6784`)
BEFORE `const portfolioValue = await getPortfolioBalanceV2(this.mode);` … `portfolioValue: portfolioValue.toString(),`
AFTER
```ts
let portfolioValue: number | null;
try {
  portfolioValue = await getMoneyHeld(this.mode);
} catch (e) {
  if (!(e instanceof MoneyHeldUnavailable)) throw e;
  console.warn(`[B-BALANCE-SESSION-PAIRING][AUDIT_MONEY_HELD_NULL] ${signal.symbol}: ${e.reason}`);
  portfolioValue = null;
}
…
portfolioValue: portfolioValue === null ? null : portfolioValue.toString(),
```

## P3 / A2 — the position-size cap (`trade-safety.ts:343-352`)
BEFORE `if (!Number.isFinite(rawPortfolioValue) || rawPortfolioValue <= 0) { console.log('[J7][GUARDRAIL_SKIP] …'); return { ok: true }; }` with `parseFloat(settings.portfolioValue?.toString() || '0')`
AFTER: `null` stays NaN (no `|| '0'`), and the same test returns `{ ok: false, code: 'MONEY_HELD_UNAVAILABLE' }`.

## P4 — the exposure check (`trade-safety.ts:652-678`) — ⚠️ one deliberate deviation from the plan, for your ruling
- A position with an unreadable quantity or price now REFUSES (`GUARDRAIL_READ_FAIL`), as planned.
- **An unsized candidate is NOT refused (the plan said refuse).** At Step 3 I found the position-size cap above already handles an unsized candidate by sizing it with `bufferedTradeNotional` — **B-SIZING-DEC-RESTORE increment 2c's decided rule** (`trade-safety.ts:383-399`: *"an unsized candidate is checked at the size the sizer WOULD give it"*). A refusal in the exposure check would have contradicted that decision (§9.5(b-ii)) and made the two checks disagree about one candidate's size. So the exposure check now uses the same formula (`:677`); an unreadable `maxPositionPercent` refuses. I first built it as a refusal and reverted.
- Reachability, measured: the paper entry path always passes `preComputedNotional` (`active-execution-engine.ts`, the candidate before `checkGuardrailRisk`); an unsized candidate arrives only from the manual `/trading/validate` route (no UI or code caller; now passes its own estimate) and the legacy `TradingEngine` (live only, Phase-21-gated, the paper instance never started).

## Tests and mutation checks
- `b-balance-session-pairing.test.ts` (28): the formula ($820.00 − $211.49 = $608.51 today), realized and straddle both from the anchor event, the synthetic anchor/session split (OBJ-2's discriminator, plus a check that `getMoneyHeld` never reads the engine session), the v3/v4 shape, a straddler counted once; every refusal (live, no state, no ledger row, broken pair, retention age, missing/zero retention constant, invalid straddler, non-positive result, wrapped read error); the source fences P2, P3/C-1, P4, P5, P11, P12, and the straddle query's predicates.
- `b-guardrail-fail-closed.test.ts`: the balance fault moved onto `getMoneyHeld` (a raw error still gives `CHECK_THREW`); a named refusal gives `MONEY_HELD_UNAVAILABLE`; the code count 16 → 17; behavioural cases — the position-size cap refuses on a null money-held value, the exposure check refuses an open position with no price, and a control passes.
- **Mutations (each turns a test red, each restored byte-for-byte):** the J7 skip put back · the zero-price default put back · the straddle term dropped from the formula.
- Unit suite locally: 4,525 of 4,560 pass; 6 fail — 4 whole-tree walks that time out under the parallel run (all pass alone) and the scanner census reading a git-excluded local agent worktree.

## P11 — the census by value, as built
A per-file count of the whole-word token `portfolioValue` in non-test `server/` (17 files, 127 tokens; your 105 was counted differently), each classified with a reason; **a new occurrence changes its file's count and fails until classified.** Per-file rather than per-line so a line move does not churn the fence; a count change is exactly a new or removed site.

## Outside this batch — found at Step 3, for #734 (no change here)
`getActiveOpenPositions` ignores its `mode`, and three callers ask for `'live'` beside `'paper'`, so they read the same paper rows twice: `kraken-websocket-adapter.ts:3227` and `index.ts:1078` union symbol sets (harmless); `trailing-exit-controller.ts:674` re-writes the same row's `tradeMode` under a "live" log line. Nothing here touches paper or the VTS today; it matters at Phase 21. P5's fence pins the three. **Proposed disposition: an item on `#734` (live-mode go-live), not a new batch** (Kyle 2026-10-19).

## Judgement calls to attack
1. P4's deviation above (unsized candidate sized, not refused).
2. `getMoneyHeld` wraps every read error as a refusal: a transient DB error blocks sizing for that cycle. Fail-closed by design; is that the right trade?
3. The retention refusal compares calendar age with the constant; it fires ~335 days from now on today's anchor.
4. P11 by file and count rather than by line.
