# B-OPEN-TRADES-DISPLAY — COMPLETION REPORT

**change-class: non_architecture** · **Owner:** Claude Analyst (CC-C) · Kyle-directed (running-issues board items 5 + 3, autonomous)
**Review:** Langston Step-4 **APPROVED** (both objectives independently traced at the graded ref). **Deployed + §9.3 UI-verified.**
**Commit:** `cf2164b3c` (under merge `cfbef76a5`) · **CI:** green on the head (merge run 30137939820) · **Deployed** staging restart, HTTP 200.

---

## OBJECTIVE 1 (item 5) — Open Trades regime column now shows all three parts · ✅ YES

**Problem:** the shared `OpenTradesTable` (`vts-open-trades-table.tsx:247-260`) already renders label + confidence + EARLY/PRIME/LATE phase, each conditional on data. The **open**-position row never carried the confidence/phase (`active_open_positions` has only `confidence`; the closed side has 7 regime columns). So the open table showed only the label.

**Fix (no migration):**
- `active-execution-engine.ts` — the `createActiveOpenPosition` write now stamps the six at-entry regime values into the position **metadata** (the identical `_b67_2_1_*` values the `createClosedTrade` write two blocks above already uses). Honest-null when the MCE context was absent at open.
- `paper-trade-adapter.ts` — `adaptPaperOpenTrade` maps the six from metadata (parity with the closed adapter; `metaNum(...) ?? null`, never fabricated).
- Test fences (`paper-trade-adapter.test.ts`): present→mapped, absent→null.

**Verification:**
- tsc baseline clean (no new errors); `paper-trade-adapter.test.ts` **15/15**.
- **Langston Step-4 traced the metadata-safety concern I flagged** and cleared it: budget governor reads `metadata->>'admissionBasis'/'assetClass'` (named-key pluck, sibling-indifferent); no reader iterates the object; the `phase` key can't collide (no other writer of `active_open_positions.metadata.phase`); `_b67_2_1_*` in scope, same vintage; display-only telemetry, no admission/ranking/sizing/exit input. **Both other sessions independently corroborated** (CC-A: #558 reads signal metadata not this object; CC-B: traced every reader of this exact object during B8.5k — all key-specific).
- **§9.3 UI (staging, live):** a freshly-opened position **SUI/USD** renders the three parts — `HIGH_VOLATILITY_UNSTABLE` + `conf 0.893` + `PRIME` phase badge; an older position (**ETH/USD**, opened pre-deploy) correctly shows the label only (honest-null). DB confirmed: post-deploy opens carry `metadata.regimeConfidenceModulated/phase/...`; pre-deploy opens do not. Expected end-to-end behavior.

## OBJECTIVE 2 (item 3) — closed table "shows open positions": FINDING, no code fix · ✅ (premise did not reproduce)

- The `createClosedTrade` record is written **at open** and updated at close — an intentional lifecycle record, long-standing (predates P19-B-RENAME).
- **Every closed-trades display/analytics path already excludes not-yet-closed rows** (rule 24 — do not fix what works): `trade-history-tab.tsx` passes `closedOnly=true` (since 2025-12-11); `getClosedTradesPaginated` gates on `closed_at IS NOT NULL`; the analytics path filters ghosts. Langston re-read the citations rather than take them.
- **§9.3 UI:** Closed Trades shows **314 total trades**; DB cross-check: 314 = rows with `closed_at IS NOT NULL`; the **18** not-yet-closed rows (open positions written at open) are **excluded**. Open positions do not appear in the closed table.
- **Orphans: 2 rows** (`MET/USD` 07-15, one 07-18), NULL `closed_at` + no matching open position — **one-off, none since 07-18**, harmless (hidden by the filter AND ghost-excluded from learning). **Disposition: documented, NOT auto-deleted** (a production data edit on 2 hidden rows is not worth the risk; Kyle can green-light a cleanup). No code change.

**Observation (out of item-3 scope, logged not acted):** the 314 count includes ~61 `never_filled` terminated rows (they carry `closed_at` but no `exit_price`). Whether never-filled maker orders belong in the closed history is a separate display-policy question, not item 3 (which is about *open* positions).

## GOVERNANCE FILES CHANGED
`BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `SYSTEM_IMPACT_MAP.md` (brief note extending the P19-B8.10 genesis-capture entry — the documented sibling) · `CURRENT_RUNNING_ISSUES.md` (board items 5 + 3) · scope `B_OPEN_TRADES_DISPLAY_SCOPE.md` · this report. **System Manual: N/A** (no architecture/strategy/regime/filter/pipeline/math change — display-plumbing only; Langston concurred).

## STATUS
**COMPLETE** — implemented, Langston-approved, CI-green, deployed, §9.3 UI-verified (both objectives). Awaiting Kyle's acknowledgment to close.
