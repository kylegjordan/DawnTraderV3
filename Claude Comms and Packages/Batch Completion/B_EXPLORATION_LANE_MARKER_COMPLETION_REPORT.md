# B-EXPLORATION-LANE-MARKER — COMPLETION REPORT

**Owner:** Claude Analyst (CC-C) · Kyle-directed (scratch list A2) · Closed: 2026-07-27 · change-class: **non_architecture**
**Head at Step-4:** `c753339e9` · CI 4-green (run `30307200206`) · No migration · Deployed with B-EXPLORATION-ANNEAL-CLOSED-FIX in one window (branch head `1c63c07da`), HTTP 200, engine online.
**Scope:** `Scope Files/B_EXPLORATION_LANE_MARKER_SCOPE.md` · **Langston Step-4: APPROVED** (independently re-verified all 3 files at the ref; honest-null mapping correct; shared-table internals unchanged; change-class confirmed).

## Objective
Surface the already-stored `admissionBasis` ('exploration' vs normal net-EV lane) as a **"Lane"** marker column on the paper Open + Closed trade tables. Display-only; removable when exploration mode ends.

## Objectives checklist
| # | Verdict | Evidence |
|---|---|---|
| 1 — Adapter carries `admissionBasis` | **YES** | `paper-trade-adapter.ts`: added to `AdaptedOpenTrade`/`AdaptedClosedTrade`; mapped `metaStr(meta,"admissionBasis") ?? null` in both adapt fns (honest-null). Adapter tests 15/15. |
| 2 — Open tab Lane column | **YES — §9.3 verified** | `paper-open-trades-tab.tsx` Lane `<th>` in extraHeaders + EXPL/em-dash cell. **Staging Open tab:** ONDO/USD (exploration) renders amber **EXPL**; GM/CL/SPGI/TGT (normal) render **—**. |
| 3 — Closed tab Lane column | **YES — §9.3 verified** | `trade-history-tab.tsx` extraHeaders+renderExtraCells on the ClosedTradesTable mount. **Staging Closed tab:** Lane header + EXPL on UNI/LINK/AAVE/USELESS/NEAR/WLD (exploration); non-exploration render —. |
| 4 — VTS tabs untouched | **YES** | Uses the shared tables' default-OFF append props; only the paper mounts pass them (Langston-verified). |

## §9.3 UI verification
Claude-in-Chrome, authenticated staging (`https://188.245.193.8.sslip.io/paper-trading`): Open tab — ONDO EXPL badge + others em-dash, cross-checked vs `metadata->>'admissionBasis'`. Closed tab — EXPL on 6 named exploration rows via the Lane column + tooltip. Both tables render correctly.

## Review trail
Langston Step-4 APPROVED (one non-blocking note: shared closed table empty-state `colSpan={32}` doesn't count the appended Lane column → a no-trades render is one column short; pre-existing shared-table behavior, cosmetic; recorded as a follow-on).

## Bench + tests
tsc: no new errors in the 3 files. `paper-trade-adapter.test.ts` 15/15 green.

## Governance files changed (this close)
BATCH_CATALOG.md · PHASE_HISTORY.md · PHASE_19_PLAN.md (§5 row) · SYSTEM_IMPACT_MAP.md (brief: adapter now carries `admissionBasis` to the client display shape) · this report · scope file · MEMORY_CC_C.md (+ mirror). System Manual: N/A (display-plumbing only). RUNNING_ISSUES: N/A (scratch-list item).

## Open follow-ons (named homes)
- Shared closed-table empty-state colSpan doesn't count appended columns → cosmetic, only on a no-trades render. Home: a one-line fix whenever that empty state is next touched (Langston's noted follow-up).

## ★ FOLLOW-UP AMENDMENT 2026-07-29 — THE COLUMN WAS CORRECT AND EFFECTIVELY INVISIBLE (Kyle-reported)

**What happened.** Kyle could not find the Lane column on staging, having already hard-refreshed and cleared cache. **It was there and working the whole time** — deployed, built, and rendering the right values. **Measured live:** the open-trades table carries **35 columns** and this batch placed Lane at **column 33**; the table is **3,452px wide** against a **938px** visible area ⇒ **~2,514px of horizontal scrolling** to reach it. Present, correct, unreachable.

**★ THE LESSON, and it is a real gap in how this batch verified itself.** The original §9.3 check confirmed the column **RENDERED** — via the accessibility tree, which happily reports elements no human would ever scroll to. **"It renders" and "a person can see it" are different claims, and only the second is what §9.3 asks for.** Verifying presence while believing you verified usability is the display-layer analogue of a green test that never exercised the guard.
**⇒ Standing addition (Langston concurs): for any column add, state its RENDERED POSITION and the table's TOTAL WIDTH in the completion report — not merely that it renders.**

**Fix (deployed 2026-07-29, restart #538, CI green run `30473874302`, Langston Step-4 APPROVED at `39434a6c` + nit fixed at `9e9d427a7`):** Lane moved to immediately after Symbol on BOTH tabs.
- **Open Trades:** now **column 3 of 35** (Symbol · Slot · **Lane**), at **146–207px** from the table's left edge. Live values verified: FIG/NEAR/TON = `EXPL`, others = `—`.
- **Closed Trades:** now **column 2 of 31** (Symbol · **Lane**), at **117–178px**. Live values verified: WLD/TON/HYPE = `EXPL`, TSM/INTC/SKHY/SNDK = `—`.
- The closed table had no after-Symbol slot, so `afterSymbolHeaders` / `renderAfterSymbolCells` were added to `vts-closed-trades-table.tsx` mirroring the open table's P19-B8.10 pair — **both optional and default-OFF, so the VTS mount renders exactly as before** (Langston independently verified the ruling-B contract: optional props, optional-call, signature parity, header/cell alignment, and no index-based column dependencies).

**Langston's nit, fixed in the same pass — a drifted mirror of the same class this session censused on the cost math.** `vts-closed-trades-table.tsx` carried a comment claiming `colSpan 33` while the code said `32`, and `vts-open-trades-table.tsx` justified **its** number by citing "the closed table's 32+1 pattern" — **which the closed table never implemented**, so the citation was wrong rather than merely stale. Both empty-state spans corrected, and **deliberately NOT re-encoding a precise count**: the value only has to be ≥ the widest mount (browsers clamp overshoot), and a hard-coded count in a comment is exactly what rotted. 

**⚠️ Verification honesty:** two browser probes during the re-check returned nonsense (`windowInnerWidth: 0`, screenshots failing), so the "visible without scrolling" boolean is **not** being relied on. The claims above rest on the column's own measured position within the table, which is independent of the window state. If Kyle still cannot see it, **his observation outranks my instruments** — which is the lesson of this amendment in the first place.
