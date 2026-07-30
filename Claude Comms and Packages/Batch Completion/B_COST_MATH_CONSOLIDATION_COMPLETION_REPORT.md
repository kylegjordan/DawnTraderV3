# B-COST-MATH-CONSOLIDATION — COMPLETION REPORT

**Owner:** Claude Analyst (CC-C) · **Kyle-directed 2026-07-29** · change-class: **architecture**
**Head:** `b0a7a7873` · **CI 4-green** (Test Suite · Build · TypeScript Check (baseline gate) · Docker Build): **run `30503313569`, which graded `9f1663ef1` — the head named above is +2.** The intervening `d3ba03b47` is **comment-only** in `vts-runner.ts` (+22/−10, Langston re-read it), so no functional change is uncovered. **Both SHAs are stated deliberately: #621 is filed for exactly this class — the ref that was graded is not the ref that shipped.** · No migration · **Deployed staging 2026-07-29 00:46Z, pm2 restart #541, HTTP 200, 0 unstable restarts.**
**Scope:** `Scope Files/B_COST_MATH_CONSOLIDATION_SCOPE.md` · **Pre-audit:** `..._PRE_AUDIT.md`
**Review:** Langston Step-1 CHANGES-NEEDED → rev2 → rev3; Step-2 APPROVED; **Step-4 CHANGES-NEEDED ×2 → both cleared at `9f1663ef1` → SIGNED OFF.**

> # 🚨 THIS BATCH IS **NOT CLOSED**. ONE OBJECTIVE IS UNVERIFIED.
> **§9.3 UI verification has NOT been performed.** The staging pages this batch touches (Open Trades, portfolio summary) have **not** been visually inspected. Backend verification is complete and is reported below, but **§9.3 is explicit that a curl, a log line and a psql row do NOT satisfy it.** Per the 2026-07-29 lesson (a column shipped at position 33 of 35 and called verified because the accessibility tree said it rendered), **"it renders" is not "a human can see it."** This report is therefore **PARTIAL**, and the batch must not be recorded as closed until that leg lands.

## 🚨 PREVIOUSLY-STATED-VS-NOW (§9.2)
| | PREVIOUSLY | NOW | REASON |
|---|---|---|---|
| Site count | 3 → 5 → 7 → 8 | **9 real + 1 benign** | Census re-scoped twice: by QUANTITY not PATTERN, then to **monetary** quantities. Site 9 found by running the fence across all of `server/`. |
| Economic cash figure | $1,886.71 | **≈$1,931.66** | The first double-counted 37 pre-anchor closes (−$44.95) against an anchor that is not all-time. |
| −$318.34 as "the display gap" | implied | **WITHDRAWN** | Computed over the full table; the screen computes over a ≤100-row window. Economics ≠ display gap. |
| Site 7/8 disposition | "correct by accident" | **WRONG TODAY** | Live endpoint returns `realizedPnl 0` / `currentBalance 2250`. The "engine is off" premise was stale — it re-sessioned 22:03Z. |
| #618 severity | a reporting-route issue | **A RISK-PATH ISSUE** | `getPortfolioBalanceV2` feeds the **daily-loss kill-switch denominator**. |
| "the last copy of the ghost default" | asserted | **WITHDRAWN** | An asserted absence with no client-wide census behind it (#453). |

## Objectives checklist
| # | Verdict | Evidence |
|---|---|---|
| 1 — one implementation | **YES** | `server/core/math/trade-pnl.ts`; sites 1-3 now call it. |
| 2 — bit-identical | **YES — PROVEN, not asserted** | Reference implementations **transcribed verbatim from the three retired copies and written BEFORE the re-point**; compared with `toBe`, not `toBeCloseTo`, across the live ONDO row, a sub-penny pair, extreme scale, a loser, a flat maker fill, and the zero-basis guard. |
| 3 — structural fence | **YES** | Quantity-scoped, not shape-scoped; plus a purity fence (no I/O, no clock) and the carried-forward slippage guard. |
| 4 — F1/F2/F3 recorded | **YES** | In `trade-pnl.ts`'s header + SIM. **F2's four-component composition is retired, not just its rates** — stated because the failure mode is a reader counting four components and re-adding slippage. |
| 5 — self-checks repaired | **YES (4)** | Sites 4, 5, 6 + the two route reads. |
| 6 — SIM entry | **YES** | **SIM 9.15**, incl. the fact that it had **no entry at all**. |
| **§9.3 UI** | ⏳ **NOT DONE** | See the banner. |

## ★ What the batch actually found (the arithmetic was the smaller half)
**The census was scoped by PATTERN (`gross − cost`), not by QUANTITY** — so it re-found the same three sites at any ref, forever. Re-scoped to *"computes **or ASSERTS** a relationship among MONETARY quantities"* it went **3 → 9**. Langston's two fences — **`as any` on a schema-typed row** (a greppable pattern, better than my "absence-reads-as-valid", which is a concept no grep finds) and **`.tsc-baseline.json` as a registry of MUTED phantom reads** — each returned sites the other could not. **Neither closes the census alone.**

**Nine sites read `portfolio_state.startingBalance`, a column that does not exist.** Three fallback polarities: to the displayed balance (**always RED — 339 false alarms since 07-15**), to `0` (**always GREEN — structurally unreachable**; Langston's falsifiable prediction of zero warnings **tested at zero on both streams**), and to `balance` (silent substitution).

**★ And it ended at the risk envelope.** Site 9 (`guardrail-settings.getPortfolioBalanceV2`) feeds the **daily-loss kill-switch denominator** (`daily-loss-budget.ts:135`, CC-C-verified) and `SizingContext` on both asset classes, carrying the same frozen anchor + capped session-scoped sum ⇒ **it divides by a figure too large, so loss% reads too small and it trips LATER than the approved limit. Langston VOIDED HIS OWN P19-B6 approval**, which had rested on a shrinking denominator the cap and session-scope prevent. ⚠️ **Direction certain; MAGNITUDE UNMEASURED. Paper mode, no capital exposed. Must close before Phase 21.**

## ★★ THE TWO SENTENCES A READER WILL OTHERWISE GET WRONG
1. **THE GUARDRAIL BALANCE IS NOW HONEST, NOT CORRECT. $2,250 STAYS $2,250.** Reading the field under its true name changes what the code *claims*, not what it *shows*. Nothing moves until the anchor is re-anchored or the sum un-scoped — **neither is in this batch.**
2. **THE KILL-SWITCH MAGNITUDE IS UNMEASURED.** Direction certain, magnitude not. It must not acquire an adjective between here and any decision that cites it.

## ★ Errors I made in this batch, recorded because the corrections are the value
1. **I turned an always-RED check into an always-GREEN one.** Re-anchoring site 4 fixed 17 false alarms **and made it unfalsifiable in the same stroke** — both sides became the same number. **The exact failure I had flagged at site 6 an hour earlier, on the worse polarity.** Demoted to OBSERVED; real invariant homed **#620**.
2. **I wrote a false constraint into the code**, justifying #620's deferral as a race-between-live-reads. The write happens by primary key *before* the diagnostic fires — a re-fetch is deterministic. **The blocker is scope. A follow-up must not inherit a technical objection that does not exist.**
3. **My 409 pushed the fabricated zero one hop downstream** — the client re-invents it, *and* fabricates `status: 'OK'`, a made-up all-clear. **My line cite was off by one, which is exactly why the worse of the two went unnamed.**
4. **I asserted an absence I had not swept for** ("the only one left") — withdrawn; the client leg now begins with the census.
5. **I nearly reported a false zero** — read a pipeline's exit code as the compiler's.
6. **I nearly refuted a live count from a wrong-stream grep.**

## ★★ The standing check this batch earned — and then failed
> **BEFORE PAIRING ANY TWO CLAIMS AS IF THEY MEASURE THE SAME POPULATION — NUMBERS *OR* ARGUMENTS — STATE THE SET EACH IS COMPUTED OVER.**

Written after two wrong dollar figures. **Beaten the same day by a third instance** (a tolerance measured 100% xStock, applied to an exposure measured 67% crypto) **because I had scoped it to "quantities" and that one was an argument.** A figure invites *"over what?"*; a claim does not. **HOME: `..._PRE_AUDIT.md` §4** (the check's canonical statement and all three instances). ⚠️ **Citation corrected at Step-11:** an earlier draft cited **#621** as the home — #621 is the *deploy-head gate bypass*. The instance is recorded inside that issue's decision block because it arose there, **but the CHECK lives in the pre-audit, and a rule whose home is a paragraph inside an unrelated issue is a rule nobody will find.**

## Verification
- **tsc delta: part 1 = 0, part 2 = −1** (measured stash/count/pop, clean restore both times). **The baseline gate NAMES the removed error:** `server/routes.ts TS2339: 1 -> 0 [Property 'startingBalance' does not exist…]`, `OK — no regressions above baseline`.
- **`.tsc-baseline.json` deliberately NOT regenerated** (Langston-ruled): on a three-session branch, `--generate` converts another session's regression into accepted state. The gate only fails on rises; a stale zero-count entry is inert.
- **21/21 tests green.**
- **★ LIVE POST-DEPLOY:** last false MISMATCH of either family **00:15:09Z**; **zero in the 32 minutes following**, while **60 `OBSERVED` lines fired** ⇒ the path executes and no longer invents failures. **Zero errors naming any changed symbol.**
- ⚠️ **CI trap recorded:** two of this batch's runs were **CANCELLED** by superseding pushes from other sessions. **Cancelled ≠ red** — the cited green run is on a settled head.

## Governance files changed
BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN §5 · **SIM 9.15** · **SYSTEM_MANUAL** (⚠️ *listed here in an earlier draft BEFORE it was true — Langston caught it; the module-inventory row + the `trade-pnl.ts` chapter entry carrying the F1/F2/F3 resolution are now actually in it*) · RUNNING_ISSUES (**#614, #616, #618 retitled + consumers corrected, #620 new, #621 decision block**) · CLAUDE.md **§24.0** + `CLAUDE_MD_RULE_HISTORY.md` · MEMORY_CC_C · scope · pre-audit · this report.
⚠️ `bridge/canonical/` **NOT edited** — frozen historical record (§9.5(b)). Its inconsistency is recorded here and in the System Manual, not fixed there.

## Out of scope, homed (§9.4)
**#618** (frozen anchor + capped session-scope; **two repair homes — display and risk-sizing must not share a Step-8**) · **#620** (engine-vs-persisted round-trip) · **the client ghost-default leg** (begins with a client-wide census).

**⚠️ CORRECTED AT STEP-11 — I WROTE THREE; THERE ARE SIX, AND HALF ARE ON THE SIZING PATH (Langston).** Set stated, since that is the whole point: `grep -n '|| 50000' server/routes.ts` ⇒ **`4759` · `4845` · `4924` · `14852` · `14885` · `15017`**, all `await getPortfolioBalanceV2(…) || 50000`. (`5669` is `price || 50000`, a different quantity — excluded deliberately.) **★ `14852` and `15017` are NOT display: both flow `portfolioValue → calculateRiskAmount(portfolioValue, pct) → riskAmount → quantity = riskAmount / stopDistance`. A fabricated $50,000 would SIZE POSITIONS.** ⇒ folded into **#618**'s consumers table rather than left as a footnote here.
**★★ AND THE MISS IS THIS REPORT'S OWN §9.2 TOP ROW, COMMITTED IN THE SAME DOCUMENT.** That row says the census went 3→9 *because it was scoped by PATTERN rather than by QUANTITY* — and then this section asserted a count of three **with no census behind it and no set stated.** Identical shape to my error #4 (an asserted absence), and to the widened check two sections above. **Writing the rule at the top of a document does not make you obey it at the bottom.**
