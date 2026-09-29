# B-SIZING-DEC-RESTORE — increment 2b change list (Step 4): the position-% floor, the fallback sizer's balance

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **Declared change-class** | `architecture` (`B_SIZING_DEC_RESTORE_SCOPE.md` header, unchanged at r8) |
| ii | **That class's doc set** | scope — present (r8; obj-5 condition C-5 added at `3d008bd0e`) · pre_audit — present (`B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §15.0-15.5: the re-split, 2b's design, your ruling §15.4, the G3 check and its riders, the provenance read) · running_issues — present (`#1093`, `#1094`, `#1043` evidence, at `7368fd221`) · deleted_log — N/A for 2b (nothing deleted) · completion_report — absent, Step 11 · batch_catalog / phase_history — absent, Step 10 · system_manual — absent, Step 10 (RULE_012's range; the fallback sizer's balance) · sim — absent, Step 10 (the new CHECK) · phase_19_plan — unchanged (placement `:19`) |
| iii | **Step-2 reference** | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §15.1 (design) + §15.4 (your ruling, graded `129d1c4c3`; "no objection: code 2b" at `9c4476e87`) |

**Code commits:** `dad0c9260` (CI `36575649954`: all four success) + the `#1093` commit carrying this list (CI stated in the dispatch) · **tsc baseline:** 377 → 377

## What 2b is
The window's critical-path half of the old 2b (your §15.0 ruling): the guard that stops a decimal slip in the position % from allowing hundreds of positions now that 2a derives the count, and one fix to the fallback sizer's balance. **Nothing trades differently until the window's deploy**; after it, a save of a position % below 1 is refused by both the policy and the database.

## G1 — the floor (your conditions i-v, each landed)
**`drizzle/migrations/2026-09-29-b-sizing-inc2b-position-pct-floor.sql`** (+ MANIFEST after 2a; rollback beside it restores increment 1's `> 0`):
```sql
DO $$ DECLARE bad integer; BEGIN
  SELECT count(*) INTO bad FROM guardrails_v2 WHERE max_position_percent_pct < 1 OR max_position_percent_pct > 100;
  IF bad > 0 THEN RAISE EXCEPTION 'b-sizing-inc2b: % guardrails_v2 row(s) hold max_position_percent_pct outside [1, 100]; ...', bad; END IF;
END $$;
ALTER TABLE guardrails_v2 DROP CONSTRAINT guardrails_v2_max_position_percent_pct_range;
ALTER TABLE guardrails_v2 ADD CONSTRAINT guardrails_v2_max_position_percent_pct_range
  CHECK (max_position_percent_pct >= 1 AND max_position_percent_pct <= 100);
```
**`server/services/guardrail-policy.ts` — RULE_012's floor, RULE_013 unchanged**
```ts
// BEFORE: const ok = Number.isFinite(v) && v > 0 && v <= 100;   (both rules)
// AFTER:
const lowerBoundOk = { RULE_012: (v) => v >= 1, RULE_013: (v) => v > 0 };
const ok = Number.isFinite(v) && lowerBoundOk[r.id](v) && v <= 100;
```
| your condition | landed |
|---|---|
| justification | the migration header, the policy comment and the YAML rationale all say: the floor is **headroom** (p = 1 holds $145 to a ~$14,950 balance) and a **decimal-slip guard**; it is **NOT** a micro-position guard (p = 1 at $3,000 is 100 slots of ~$29.10) |
| (i) | the band alert named as the only instrument that sees dollars, **low and high** (migration header, policy comment, YAML) |
| (ii) | increment 3 ships in the same window — the order of work in §15.5 and the migration header |
| (iii) | "a LIVE upper typo has no detector — Phase 21's" in the migration header and the YAML, so the ceiling is never cited as live cover |
| (iv) | every `guardrails_v2` row enumerated on staging first: **2 rows, live 30.00, paper 20.00**; and the migration's own pre-check refuses with a count |
| (v) | RULE_013 keeps `> 0`, with the reason stated (an exposure typo is loud) |

**EXERCISED (G4):** scratch database on the staging cluster from `pg_dump --schema-only --schema=public` + the two `guardrails_v2` rows. Increment 1 forward → `CHECK (p > 0 AND p <= 100)`; 2b forward → `CHECK (p >= 1 AND p <= 100)`; probes in rolled-back transactions: **0.99 REFUSED · 1 accepted · 100 accepted · 100.01 REFUSED**; rollback → increment 1's form, IDENTICAL to after-increment-1; second forward IDENTICAL to the first; **negative control:** a row at 0.5 makes the forward refuse with its own message. Scratch dropped. Files copied matched the committed bytes (md5 `3830698a…` forward, `12cce24d…` rollback). ⚠️ A first attempt dumped only the table, missed its enum type and produced an all-error run whose "IDENTICAL" compared two empty outputs — discarded; the script now stops when the table is missing.

## G2 — the fallback sizer's balance (your wording)
**`server/services/active-execution-engine.ts`, the `[B6][FALLBACK_SIZING]` branch**
```ts
// BEFORE
console.log(`[B6][FALLBACK_SIZING] Signal missing sizing fields for ${signal.symbol}, will size in executeSimulatedTrade`);
const portfolioState = await storage.getPortfolioState({ mode: this.mode });
const portfolioValue = portfolioState ? parseFloat(String(portfolioState.balance)) : 0;
// AFTER
console.log(`[B6][FALLBACK_SIZING] Signal missing sizing fields for ${signal.symbol}, sizing here from guardrails_v2 and the working balance`);
const portfolioValue = await getPortfolioBalanceV2(this.mode);   // static import added at :384
```
The fallback sizer now reads the working balance (anchor + session P&L) like the main sizers — one of the FOUR balances on that path you counted; the other three are unchanged. Measured not firing today (census B). `:5058`'s `'1.50'` reader is in 2c's census (§15.4).

## G3 — FINDING-4, withdrawn on evidence (§15.4 + §15.5)
The dev-build harness, your three riders included: the tested component pinned by hash to the committed blob; from a filled box, typed and pasted `7.5` both save 7.5; a deliberately decimal-stripping handler makes the same keystrokes save **75** (the instrument can report the filed failure); the old handler's `→0`-on-clear clobber is real and increment 1 fixes it.

## G4 — tests
- `b-sizing-p5-p6-guardrail-edits.test.ts`: RULE_012 legs 0.5 / 0.99 refused, 1 / 100 accepted; exposure 0.5 accepted (RULE_013 has no floor of 1); the existing refusal legs' REASONS restated (0 and −1 below the floor; 500 and 100.01 above; NaN and '' not numbers).
- `b-sizing-inc1-guardrails-db.test.ts` (real Postgres in CI): the CHECK refuses 0, 0.99, 100.01, 500 and accepts 1 and 100.
- `b-sizing-inc2a-derived-slots.test.ts`: the `p` = 0.5 case now shows 2b refusing it at entry; a source fence on the fallback branch (no `getPortfolioState`, reads `getPortfolioBalanceV2`, log no longer claims to size elsewhere).
- `b-sizing-legacy-deletion-fence.test.ts`: reads each source file ONCE at collection time — its per-check re-reads timed out under a parallel run on this laptop (three checks at 5 s, a flake that could fake a result).

## #1093 — THE SYMBOL COOLDOWN, EXACT SYMBOL + CLASS (folded on your ruling; your five conditions in PRE_AUDIT §15.6)
**`server/storage.ts` — the cooldown's own read (search box keeps its substring filter)**
```ts
async getLastClosedAtForSymbol(mode, symbol, assetClass: AssetClass | null): Promise<Date | null> {
  // mode = mode AND symbol = symbol (EXACT) AND closed_at IS NOT NULL AND <closedOnly's row rule, unchanged>
  //   [AND asset_class = assetClass when known]  ORDER BY closed_at DESC LIMIT 1
}
```
**`server/services/trade-safety.ts` — the paper branch of `checkSymbolCooldown`**
```ts
// BEFORE
const { trades } = await storage.getClosedTradesPaginated(mode, { symbol: trade.symbol, closedOnly: true, sortBy: 'closedAt', order: 'desc', limit: 1 });
// AFTER
if (!trade.assetClass) console.warn(`...[COOLDOWN_CLASS_UNKNOWN] ${trade.symbol}: ... matching the symbol in any class (stricter)`);
const closedAt = await storage.getLastClosedAtForSymbol(mode, trade.symbol, trade.assetClass ?? null);
```
`TradeCandidate` gains an optional `assetClass`; the engine's candidate (`active-execution-engine.ts`, before `checkGuardrailRisk`) passes `asValidAssetClass(signal.metadata.assetClass)`.
- **Cond. 1:** measured — `DASH/USD` is in both classes (1 of 321 paper symbols) ⇒ the class predicate is in.
- **Cond. 2:** the QNT/USD "neither" was a 171 ms log-rounding artifact ⇒ 77 of 77 blocks had their own close.
- **Cond. 3:** strictly less strict; unchanged on the measured history; inert for `8a-P4c` (the VTS never reads this cooldown) and F-G-1; the reset's clean window opens after this deploys.
- **Cond. 4:** unit legs pin the returned close time; DB legs (CI Postgres) pin exact times for a newer look-alike, a two-class symbol, the null-class read and the other mode.
- **Cond. 5:** `#1094` stays in 2d as a call-site swap onto this method, pre-registered in the scope.
- ⚠️ **Semantics carried over, stated:** the closed-row rule is `closedOnly`'s, which counts a `never_filled` row (a maker that never filled) as a close for the cooldown — unchanged from today's behaviour; flagged, not changed.

## Judgement calls — attack these
1. **The floor value 1** (your G1 ruling accepted it on the headroom + slip justification).
2. **`#1093`** — folded on your ruling; see the section above. **Attack the `never_filled` carry-over** (a maker that never filled still starts a cooldown — today's behaviour, kept).
3. **The fence's read-once change** — a test-infrastructure change in the same commit; it reads the tree as it is on disk at the start of the run (the same object as before, read once).

## Honest residuals
- The fallback-balance change is verified by a source fence and by census B's "not firing"; no runtime path exercised it (it does not fire on staging).
- Local unit runs: the five sizing files pass together (124/124), twice.

## Step 4 — APPROVED by Langston at `137208180` (2026-09-29 14:02Z); his conditions, landed (PRE_AUDIT §15.7)
- **`never_filled`:** homed to increment 2d beside `#1094`, as a yes/no for Kyle (`#1093` am.2).
- **Why stamp-only (Langston condition 2, answered with evidence):** the file's own fallback ladder (`asValidAssetClass(stamp) ?? safeResolveAssetClass(symbol, 'kraken')`, `active-execution-engine.ts:6061-6062`) resolves by TICKER, and run on this tree it returns `crypto_spot` for `DASH/USD` (with a `[B79.0f][COLLISION_RESOLVE]` warning), and ALSO for `NVDA/USD` and `C/USD` — xStocks are stored without the `x` suffix, and the `'kraken'` exchange resolves an unsuffixed pair as crypto. So on a stamp-missing xStock signal the ladder would hand the cooldown the WRONG class and it would miss the xStock's own close: LOOSER, the one direction #1093 must never move. Stamp-only falls back to ANY class (stricter) and logs `[COOLDOWN_CLASS_UNKNOWN]`. Measured: 0 `STAMP_MISSING_ACTIVE` against 792 `TRUST_SIZED` in the retained log window (Langston). The engine's own fallback has the same flaw: `#1096`, home 2d.
- **A NEW REFUSAL PATH (honest residual):** the fallback sizer's balance is now `getPortfolioBalanceV2` — anchor + session realized P&L, unclamped, 0 on a throw — so a signal reaching that branch can take `SIZING_INVALID` where the bare anchor (effectively always > 0) used to size it. It has not fired (census B).
- **Rollback note:** the cooldown's `getLastClosedAtForSymbol` is additive; 2d's `#1094` swap is pre-registered in the scope.
