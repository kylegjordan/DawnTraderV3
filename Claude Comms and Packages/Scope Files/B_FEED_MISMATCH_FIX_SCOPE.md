# B-FEED-MISMATCH-FIX — SCOPE r1 (PHASE_19_PLAN row `3n.u`)

change-class: architecture

**Owner:** CC-B · **Directive:** Kyle 2026-09-19 — *"Please fix the incorrect feeds that are not going to be fixed by analyst."* · **Source of the defect list:** `B_FEED_BY_SITUATION_AUDIT_FIRST_PASS.md` §DETERMINATIONS (Langston at `e752dba24`, Coltrane at `b5036e606`). Read for this scope at `origin/migration/aws-supabase` `6236d37a6`.
**STEP: 1 of 11 · NEXT STEP: 2 of 11.**

⛔ **OUT OF SCOPE, BY OWNER:** every xStock SIDE cell (maker fills, exit trigger, VTS xStock) → CC-C `8a-P4`, now PLACED at plan row `3n.q2` (Langston's precondition met). Bar-close LEVEL BASIS stays (`8c`, Kyle's B-NEW-34) — **this batch does not change where a level comes from.** VTS xStock clamp re-arm → `3n` OBJ-7 (CC-C). Legacy `TradingEngine` → CC-A row 11.5.

Class `architecture` because it changes exit-fill semantics and the stop/flatten path (System Manual §fill model and "Force Close on Stop"; SIM "Exit provenance" + "OrderPlacer").

---

## THE ONE STATEMENT (Langston): *the close fill inherits no freshness contract, and the paths that bypass the exit-decision gate inherit nothing.*

## OBJECTIVES

**OBJ-1 — THE CLOSE FILL GRADES THE BOOK IT WALKS.** In `closePosition`'s taker leg (`active-execution-engine.ts:3294-3312`), grade `_closeSnap` with the EXISTING `assessWarmth(snap, 'bids', cfg)` (`depth-source.ts:148-163`, `warmth_max_age_ms` 5,000 crypto / 15,000 xStock) — the close is the only fill site that skips it. Three arms:
- **warm** → walk, unchanged.
- **stale-but-present** → still walk it, and persist that it was over the ceiling (`exit_fill_depth_age_ms` already persisted; add the verdict).
- **cold (no two-sided book)** → never `requestedPrice` when that is an entry or stale price — see OBJ-2's request price and **DESIGN QUESTION Q1**.
- **Verify:** unit fixtures per arm, including Coltrane's: *a stop at 100 whose first usable bid is 95 never books an execution-realistic 100*; plus a fresh adequately-sized book that closes normally. On staging: the verdict column populated on post-deploy taker closes; zero warm-arm behaviour change (fill = walked VWAP as before).

**OBJ-2 — FLATTENS STOP REQUESTING AT ENTRY AND STOP ACCEPTING AN AGELESS PRICE.** `forceCloseAllOpenPositionsOnStop` (`active-portfolio-manager.ts:307-359`; callers: engine stop, admin/mode stop, reset, **kill switch** `guardrail-policy.ts:530` via daily-loss, m5e validation):
- (a) no-price arm (`:311-331`) no longer requests at ENTRY. Today `slippageQuote = (requestedPrice − fillPrice) × qty` (`order-placer.ts:119-120`) ⇒ **the slippage column equals gross P&L on every such flatten** (Langston: a measurement contaminating a measurement).
- (b) the live arm (`:343-359`) and close-all (`:632`) test PROVENANCE (`!== 'no_reliable_price'`) where they must test AGE: `getPriceWithFallback`'s last resort re-serves `last_known_good` with **no age bound** (`live-pricing-adapter.ts:1394-1413`; the `5000` argument decides whether to attempt a refresh, not whether to serve).
- **Verify:** fixtures for no-price, stale-reserve and fresh arms; the recorded slippage on a flatten is measured against a real reference or NULL, never entry; `exit_price_source`/`producer` honest on each arm.

**OBJ-3 — MANUAL CLOSE-ALL ROUTES THROUGH THE CANONICAL CLOSE. THE BUTTON STAYS.** `closeAllPositions` (`active-portfolio-manager.ts:607-712`) writes the mark as exit, takes `last_known_good`, no book walk, no fee, gross P&L (`:646`) — and **if no matching trade row is found at `:616`, `:710` still deletes the position: a silent position deletion with no close row.** Route each position through `forceClosePosition` (walk, fee, provenance, the C3 non-filled-stays-open rule), sharing OBJ-2's price resolution. Rule-24 outcome (3) legacy; rule 18 applies to the implementation, not the affordance (Langston).
- **Verify:** no path in `closeAllPositions` deletes a position without a closed-trade row; `POST /active-engine/close-all` on staging produces rows with fee, walked fill and provenance — **only with Kyle's go-ahead to press it on staging**; otherwise fixture-proved.

**OBJ-4 — THE xSTOCK ACTIVE GATE CHECKS THE LEVELS, NOT ONLY THE SYMBOL.** `active-dispatch.ts:181-186` checks the symbol's latest TICK age against `active_fill_max_age_ms` = 15,000 ms. Its intent is RIGHT for its own job (below) — **but the entry/stop/target it forwards (`:202-204`) come from a 15-minute bar, and nothing checks them.** Add a level-validity check, default **HOLD** (matches Kyle's D6 exit-freshness ruling). Two candidate terms, chosen at Step 2 after measurement:
- (i) the levels' bar is the LATEST completed bar (bar age ≤ interval + grace — "a few ticks of its own cadence"), and/or
- (ii) the levels still hold at the CURRENT ASK — entry not overshot, reward-to-risk at the ask ≥ the strategy floor (Coltrane).
- **Verify:** Step-2 measurement FIRST (Langston): is the entry re-validated against the fill ask anywhere downstream? A first grep of the engine found no such check by name — **not yet an absence**. Alert `404e978a` (this gate firing) folds in. On staging: held counts by reason, no fill on a stale level.

---

## DESIGN QUESTIONS FOR LANGSTON (Step 1 rulings needed)
- **Q1 — cold-book close (OBJ-1) and no-price flatten (OBJ-2a).** Langston: last observed bid with its own age + penalty. Coltrane: with no evidence of a fill, keep the close PENDING (unresolved exposure) rather than invent one; label any synthetic liquidation and exclude it from learning. ⭐ **My recommendation: Coltrane's for paper, using the machinery that already exists** — the C3 close-seam rule (`types.ts`; `aee:3314-3320`) already leaves a non-filled close OPEN and retries next cycle. ⇒ the cold arm returns non-filled when there is **no observed bid of any age**; when a last observed bid exists it books that bid − penalty, carrying its age. The kill switch still fires and still retries every cycle. ⚠️ **This changes "a market exit always gets out" (System Manual §fill model, `b74526dc3`) for the no-observed-price case only — a risk-envelope question, so it goes to Kyle if you agree it is one.**
- **Q2 —** new DB constants for OBJ-4 (per rule 15: `module_constants`, per class, fail-closed) — agree none are needed for OBJ-1 (warmth reuses `fill_depth_gate`)?

## PROVENANCE (1.b) — corpora searched: `git log -S` (not path-limited), `BATCH_CATALOG`, `RUNNING_ISSUES`, completion reports, `SYSTEM_MANUAL`, `SYSTEM_IMPACT_MAP`, the `P19_B4a_C3` design ask; `bridge/canonical/` for the Replit-era sites (no coverage — Langston's grep and mine).
| site (TIER 1) | introducing commit, verbatim | intent | disposition |
|---|---|---|---|
| `closeOrder` cold/no-config arms | `b74526dc3` 2026-06-16 P19-B4b.1: *"CLOSE always full-fills w/ DB-resolved beyond-depth penalty (no magic constant)"*; SysManual:817 *"a market exit always gets out — never a phantom stuck position"* | never strand a position | **(2) update** — keep exiting, grade the book |
| `forceCloseAllOpenPositionsOnStop` entry fallback | `306b5d69c` 2025-12-06 (Replit): *"a hard stop feature to ensure all open positions are closed when a paper trading simulation is stopped, using live or fallback pricing data"* | close everything on stop | **(2) update** |
| `closeAllPositions` | `306b5d69c` + `6ee84af0a` 2025-12-08: *"consistently use `livePricingAdapter.getPriceWithFallback`. This ensures a 5-second staleness guard and fallback to REST API"* — ⚠️ the "5-second staleness guard" is FALSE for the last-resort arm, and `SYSTEM_MANUAL` "Force Close on Stop" repeats it | operator panic button, predates the order placer | **(2) update — route**; implementation is (3) legacy |
| `last_known_good` re-serve | P19-B8.9a (code comment `live-pricing-adapter.ts:1394-1400`): *"A stale re-serve is a MEMORY of a venue read, not a venue read — last_known_good is its true name; the engine's skip-tick + escalation rail now engage as designed"* | label, so the ENGINE can refuse it | **(1) correct** — the flatten callers are what fail to refuse it |
| `active-dispatch` freshness gate | `df00c27c8` 2026-06-15 P19-B4a C3 *"xStock fill-safety gate (freshness 15s …)"*; design ask `69e65b24e`: *"block if the symbol's latest tick is older than max(15s, p99+margin)"*, audit-4 R1 *"never fill on a dead price"*, and *"The dispatch input carries **no timestamp**"* | a DEAD-SYMBOL check | **(1) correct for its job** — the level check is outcome (2), working-as-designed-but-unaddressed |
TIER 2 (read, unchanged): `assessWarmth` (P19-B4b.1, open-side gate) · `getDepthSnapshot` (B4b.1, per-class depth) · `forceClosePosition` (B-EXIT-PROVENANCE P6, provenance split) · `closeFillFull` depth walk.

## ARCHITECTURAL READ (1.a)
- **SIM "Exit provenance"** (`:325-354`): FIVE close paths write `closed_trades`; `apm:587` close-all never calls `closePosition` — OBJ-3 removes that exception. `active_open_positions` deleted from seven sites; OBJ-3 must not add an eighth unrecorded one. Actionable gate reads `source`, never `producer` — unchanged.
- **SIM "OrderPlacer"** (`:950-957`): C3 close-seam rule is the live-swap seam; OBJ-1's cold arm reuses it rather than inventing a pending state. Tests `order-placer.test.ts` (cold-book/no-config) will need amending deliberately.
- **System Manual** §fill model (`:815-819`) and "Force Close on Stop" (`:4142-4147`) must be updated at Step 10 — the latter's "5s staleness guard" is wrong today.
- **Blast radius:** every taker close (both classes), every engine stop / kill-switch flatten, the close-all route, every xStock active open. No change to entry fills, triggers, ranking or VTS.
