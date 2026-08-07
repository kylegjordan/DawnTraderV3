# B-FILTER-DIAG-PAPER — Completion Report

**Owner:** CC-B · **change-class:** `non_architecture` · **Closed:** 2026-08-07
**Directives:** Kyle 2026-08-01 (*"fix the filter diagnostics tabs in paper trading… the reasons why strategies are rejecting signals before the SQE"* — unblocks #648, analysis tabled until this landed) + Kyle 2026-08-06 (thorough audit incl. runtime logs; VTS-tab parity; **add** SQE-gate and RTB-refresh-fallout diagnostics; navigate-and-FIX every tracked metric on staging).
**Scope:** r2 APPROVED `9f4472db9` · **Pre-audit:** APPROVED `3844c01c5` (12 sections, 4 riders) · **Code:** `112619dda` → `419ac66f2` → `8372e35e7` → `a2d86ddbf` → `ef6290072` (Step-4 blockers) → `34f70cf39` (parity) → `506ef868e` (walk fix)
**CI:** 4/4 green, job-by-job, on runs `31146810887`, `31147199757`, `31147481443`, `31147862786`. **Langston:** Step-1, Step-2, Step-4 (CHANGES-NEEDED ×2 rounds → pre-authorized approval path).
**Deployed:** `dt-deploy eb102f875… --by CC-B`, window 10s, migrate 621ms, engine resumed, identity asserted.

## Objectives

| # | Objective | Outcome | Evidence (observed on the deployed build) |
|---|---|---|---|
| 1 | VTS-parity structure on the Paper tabs | **YES** | Pre-audit §11 captured the VTS model (Counting-Basis per row, per-strategy tables as norm, reset semantics inline); the Paper tabs now carry Pipeline Summary + gate table + fallout + per-strategy attrition in that idiom. |
| 2 | SQE gate diagnostics — NetEV named, not pooled | **YES** | `NetEV` promoted into `SQE_CANONICAL_GATES` after measuring **7,648 of 7,649** active sqe-stage tokens. Live crypto tab shows `NetEV … 1` accruing post-deploy beside the frozen `Pre-promotion + unrecognized tokens 544,568`. **Soak alert `d32ca173` fires 2026-08-14** with an owned exit criterion. |
| 3 | RTB refresh-fallout diagnostics | **YES** | New `sqeGateRejectsAtRefresh`; "Fell Out of the RTB Refresh (by gate)" renders per gate with the **cycle identity printed and self-consistent live**: crypto `236,018 = 235,995 + 23 + 0`; xStock `35,206 = 35,198 + 8 + 0`. |
| 4 | Per-strategy × per-stage table (the #648 instrument) | **YES** | Two lane-split tables per class. Crypto active path live: `support_bounce` 384 at sqe, `vwap_bounce` 211 sqe / 2 queued / 1 opened, `sma_trend_ride` 8 queued / 1 opened. xStock active lane honestly empty for the window; VTS lane shows its own population. |
| 5 | Structurally-empty buckets labelled honestly | **YES** | Pre-SQE zero carries *"near-0 by design; family-filter drops are counted upstream in strategy attrition, not here"*. Fallout empty state states the zero is observed **and declines to assert why**. |
| 6 | Staging metrics fix-pass (§9.3) | **YES** | Walk performed on the deployed build, both classes: W-2 tab strip 0 overlapping pairs · W-3 dormant banner gone · W-4 header now *"Paper Active-Trading Diagnostics"* · W-5 rule-17 copy live (*"Trading Window Open (24/5)"*, *"open trading hours, not downtime"*) · W-6/W-8 verified. |

## What the reviews caught (the real ledger)
**Step-4 round 1 — two blockers, both mine, both real:** (1) OBJ-4 **blended asset classes** — the table took an `assetClass` prop and never referenced it, so one merged crypto+xStock picture rendered inside both class panels; #648 would have been answered on the wrong population. (2) The client **summed `admitted` across writers** (orchestrator-queued + engine-opened) while the footer copy promised it never would — *the UI asserting an invariant the code didn't implement*, which is the worse half. **Round 2 — one item:** the `uncategorized` label fix landed at one render site and not the adjacent one. **Rider 4 ruled: envelope stays `v3`** (optional+additive is compatible by construction; bumping trains both sides to ignore bumps) — recorded in the envelope.

## Mine, on the record
A cold-cache reading nearly shipped as a finding: adding `asset_class` as a 4th GROUP BY column timed **6,708 ms** and looked like the column's cost; an interleaved A/B in one session (6,922 / 472 / 420 / 467 ms) proved the column costs ~nothing and the first number was cold cache. The service header carries the note so the next reader re-runs the interleaved form. Same family as the 0.2498 / 0.6990 / 359s cases — **the instrument's state leaking into the reading**. Also: my Langston-reply watcher matched his *previous* verdict (loose grep), and I briefly reported a re-review that had not happened — corrected in the next message.

## Deliberately NOT done (named, not silently dropped)
- **W-1, the render storm** — 16 long tasks / **12,118 ms blocked in a 39s IDLE window (31% of wall time)**, page-conditioned (the VTS page is clean on the identical switch). This is what made the tabs *feel* broken. **Not patched blind**; needs its profiled hunt. → carried.
- **RT-1** — the health surface reads `paper.engine.isRunning:false` while the orchestrator writes 424 archive rows/hour. Needs the rule-24.0 history read against **#585/#520/#512** before it gets a home; do not fix in two places. → carried.
- **The Section-Total "106% ⚠"** — left alone deliberately: that row is the B-NEW-11 drift **detector working**, flagging a real server-side double-count. Silencing it would be the anti-pattern it exists to prevent. → separate finding.
- **Mobile-width render** — **NOT VERIFIED**: the browser instrument's viewport stayed pinned at 2048px regardless of window resize, so the below-`xl` path was confirmed by DOM/class inspection (`flex overflow-x-auto justify-start xl:grid` + `flex-shrink-0` present) **but never rendered narrow**. Stated rather than claimed.

## Governance files changed
This report · `B_FILTER_DIAG_PAPER_SCOPE.md` (r2) · `B_FILTER_DIAG_PAPER_PRE_AUDIT.md` (13 sections) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` (decision log) · `SYSTEM_IMPACT_MAP.md` (component row + the lane semantics that must not be "simplified") · `RUNNING_ISSUES.md` (#648 instrument-shipped note). **System Manual: judged NOT applicable** — telemetry/display only; no architecture, strategy, regime, filter, signal-pipeline or math change.

## §4c Reconciliation (owner-confirmed)
**(1)** Every open Phase-19 batch has a card. **(2)** Every non-Complete card maps to plan/roadmap/issue work. **(3)** This card's column matches reality — `Complete` only now, with this report existing at the ref first. Reconciled by CC-B, 2026-08-07.
