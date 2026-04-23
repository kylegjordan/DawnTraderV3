# Batch 64b — Canonical Map Sync + Residual UI Alignment + MAX_HOLD_MS safety-valve fix

**Author:** Claude Code, 2026-04-23 (scope approved 2026-04-23 10:50 UTC)
**Status:** Phase 1 APPROVED by Langston. Phase 2 (Pre-Audit) in progress.
**Phase:** 15c
**Naming note:** this batch is referred to as **B64b** in completion docs per Langston review (B64a = Drift Dashboard shipped 2026-04-22, separate commit history).
**Prereq:** B63 close (audits + synthesis + scope docs landed via commit `ba44573b`)
**Blocks:** None hard. B65 can start in parallel if needed.
**Estimated effort:** 2-3 engineer-days

---

## 1. Purpose

B64 is a **narrow housekeeping batch** that picks up the residual UI / documentation items flagged during B63 implementation and audit closure. Not structural. Not a recalibration. No formula changes, no new strategies, no DB migrations.

Scope has been intentionally narrowed from the original POST_B62 "infrastructure cleanup" plan because:
- Global DBS persistent store fix (originally B64 Item 3) → pulled into **B63 Item 16**, already shipped
- Position sizing concerns → to be addressed in B66 (per-underlying limits) or later
- Adaptive framework structural fixes → deferred to B66 (recalibration batch)

What's left is the UI + canonical-map polish that was explicitly tagged "to B64" during B63 and in the POST_B62 plan.

---

## 2. Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** B64 changes are UI + documentation + annotation only. No behavioral changes in the scanning / classification / execution pipelines. Safe to deploy within the current observation-lite window (B63 observation closed, B66-prep observation ongoing).

---

## 3. Numbered scope objectives

Each objective has a **completion criterion** that must be verifiably true before batch close.

### Objective 1 — IE (IMPULSE_EXPANSION) regime metrics description update

**Source:** BATCH_63_SCOPE.md §"To B64" explicitly listed "IE metrics description." Current UI text for IE regime is pre-B62 language that doesn't reflect B62's DBS-integrated classifier behavior or B63's SBT routing into IE.

**Action:**
- Audit IE regime description text across:
  - `server/config/canonical-regime-strategy-map.ts` (L128 area, `REGIME_METRICS.IMPULSE_EXPANSION`)
  - `server/config/canonical-regime-strategy-map.ts` (L250 area, strategies registered for IE)
  - Any client-side rendering of regime descriptions
- Update description to reflect: (a) B62 DBS-informed classification criteria, (b) B63 SBT registration in IE when `|DBS|>=0.50`
- Ensure narrative text is consistent between the code-side config and any documentation

**Completion criterion:** IE description in canonical map + any surfaced UI text accurately describes the POST-B62/B63 classifier behavior. Langston reviews the updated text for accuracy.

### Objective 2 — Canonical map annotations for B63 structural changes

**Source:** B63 added `MULTI_FAMILY_ELIGIBILITY`, strong-trend geometry override, mode-overlay lane bypass. Some annotations were added in B63 Stage UI-sync commits (`3e15e3b6`, `cd139ed8`) but may not fully cover what the post-audit synthesis now documents.

**Action:**
- Audit `canonical-regime-strategy-map.ts` for completeness of annotations referencing:
  - `MULTI_FAMILY_ELIGIBILITY` map and how vwap_pullback's dual-family eligibility is represented
  - `strongTrendGeometryOverride` — where Variant E (4× ATR stop, 3R target) applies
  - Mode-overlay bypass for `sourcePool === 'quant-strong_trend'`
  - Strong-trend lane's "first-claim-wins" arbitration
- Add concise comment annotations where missing. Do NOT restructure the file.
- Verify the annotations match what `SYSTEM_MANUAL.md` Appendix B63 and `SYSTEM_IMPACT_MAP.md` "Recent Additions (B63)" describe.

**Completion criterion:** a reader opening `canonical-regime-strategy-map.ts` can see B63's structural concepts (MULTI_FAMILY_ELIGIBILITY, lane bypass, geometry override) clearly annotated without having to cross-reference the System Manual. Langston spot-checks and approves.

### Objective 3 — `avgNetPct` semantics clarity in Drift Dashboard

**Source:** B63 completion report §5.8 flagged: "`avgNetPct` field semantics in drift dashboard — value scale suggests price-% entry→exit, not position-adjusted $ return. Usable for comparison across strategies (same formula), but should not be read as a portfolio metric. Flagged for B64 wording pass."

**Action (decided 2026-04-23 post-Langston-review):**
- **Rename UI column headers: `Avg net %` → `Avg move %` and `Sum net %` → `Sum move %`** (in `DriftDashboardSection` strategy-by-regime table AND the top-line `tradeCounts.avgNetPct` display).
- Keep field names in code (`avgNetPct`, `sumNetPct`) unchanged — only UI labels change.
- No tooltip (per Langston: "Kyle reads headers, not hovers").
- The new dollar columns (`Avg net $` / `Sum net $`) already added in the B63-close commit (`ba44573b`) ARE position-sized and correctly labeled as "net" — those stay unchanged.

**Completion criterion:** a user reading the Drift Dashboard sees `Avg move %` / `Sum move %` in the column headers (clearly distinguishing from the dollar-denominated `Avg net $` / `Sum net $` which ARE portfolio-adjusted). Renders correctly on staging.

### Objective 4 — Drift Dashboard residual polish from post-deploy observation

**Source:** the B63-close deploy (PM2 #85 at 2026-04-23 ~10:41 UTC) is the first time the table redesign + dollar columns are live on staging. Any rendering issues, column-width oddities, or accessibility concerns that surface during operator use are in-scope for B64b.

**Action (decided 2026-04-23 post-Langston-review):**
- **Do not wait 24h.** Start implementation now. Layer in any post-deploy-surface findings during the implementation phase.
- Capture any: (a) column-width rendering issues at different viewport sizes, (b) sort-order concerns, (c) color/contrast issues, (d) missing data handling (e.g. when a regime has no closed trades in the window)
- If issues are found, address them as UI fixes within B64b
- If no issues surface, document "no residual polish needed" and close this objective

**Completion criterion:** Langston + Kyle both report the Drift Dashboard is rendering correctly and readably across the regime-segmented view. OR: any issues found are fixed and re-verified.

### Objective 6 — MAX_HOLD_MS safety-valve restoration (added 2026-04-23 post-scope-review)

**Source:** Langston's B63 close commit review (2026-04-23 10:43 UTC) flagged that the 24h-timeout-removal hotfix in `vts-runner.ts` set `MAX_HOLD_MS = Number.POSITIVE_INFINITY`, which re-introduces the pre-Batch-18I bug: trades for pairs that go illiquid and stop receiving price updates will accumulate indefinitely in the `openVirtualTrades` Map. The Batch 18I force-close-stale gate was the safety valve for that scenario and is now effectively disabled.

**Action:**
- Change `MAX_HOLD_MS` in `server/services/vts-runner.ts` L518-ish from `Number.POSITIVE_INFINITY` to **7 days** (`7 * 24 * 60 * 60 * 1000` = 604,800,000 ms)
- Update the comment block above the constant to reflect: normal trades resolve via TP/SL; this is a SAFETY VALVE for zombie-cleanup after a week, not a normal-trade timeout
- Verify `[11.6][STALE_CLEANUP]` log string unchanged (still fires with `exitReason: 'timeout'` if it ever triggers)
- No behavioral change expected in normal operation — longest observed trade in 7d pre-window was ~22 hours; no trade should hit the 7-day cap under normal market conditions

**Risk:** near-zero. Only affects trades that haven't resolved in 7 days, which has never been observed in 7d+ of data collection.

**Completion criterion:** `MAX_HOLD_MS` is finite and is 7 days. Comment reflects intent. `[11.6][STALE_CLEANUP]` log path still compiles and executes when triggered (verified by reading surrounding code, not by waiting 7 days for a trigger).

### Objective 5 — Governance updates (Tier 1 + Tier 2)

Per CLAUDE.md §3, every batch must update:

**Tier 1 (mandatory):**
- `BATCH_CATALOG.md` — B64 entry
- `PHASE_HISTORY.md` — Phase 15c progress (B64 completes)
- `MEMORY.md` — state update
- `BATCH_64_SCOPE.md` — this doc
- `BATCH_64_PRE_AUDIT.md` — Phase 2 deliverable
- `BATCH_64_COMPLETION_REPORT.md` — Phase 11 deliverable

**Tier 2 (applicable to B64):**
- `SYSTEM_MANUAL.md` — only if canonical map narrative changes rise to "architectural documentation" level (likely NO for B64)
- `SYSTEM_IMPACT_MAP.md` — annotations-only changes likely do not trigger updates, but if any component's downstream consumers change, update
- `CHANGES_AND_FIXES.md` — new entries for any UI-only fixes landed in Objective 4

**Completion criterion:** all Tier 1 docs updated. Tier 2 updated where applicable with rationale for skipping any that aren't.

---

## 4. Out of scope (deferred)

- Anything requiring a DB migration (B65 owns schema work)
- Any formula recalibration (B66)
- Any new strategy (out of scope indefinitely per 2026-04-22 finding that naive additions have poor S/N)
- TEC wiring (B65)
- External data integration (B67)
- Per-underlying position limits (B66)
- Any change that could affect VTS trade generation rate
- Any change to `module_constants` table or related infrastructure (B65)

---

## 5. Risk assessment

**Risk level: LOW.**

- No behavioral changes to scanning, classification, execution, or signal generation
- No DB migrations
- No new dependencies
- UI and documentation-only changes
- Rollback path: revert single commit, redeploy. No data migration to undo.

**Specific risks and mitigations:**

| Risk | Likelihood | Mitigation |
|---|---|---|
| Canonical map annotation change breaks a test that reads map content | Low | Run full test suite pre-push. If broken, either revise annotation to preserve test expectation OR update test to match new annotation. |
| UI change renders incorrectly in edge case (empty regime, many strategies, long strategy names) | Medium | Visual verification in Claude-in-Chrome across 24h/7d/30d windows + screenshot capture. |
| Wording change on `avgNetPct` confuses an existing documentation cross-reference | Low | Grep for `avgNetPct` across docs, update any doc that references the old wording. |

---

## 6. Verification plan

**Phase 7 (First-pass CC verification):**
1. Visual verification of IE regime text in any UI surface that renders it
2. Read-through of `canonical-regime-strategy-map.ts` post-edit, confirming B63 concepts are annotated
3. Drift Dashboard screenshot with tooltip/footnote visible
4. No TypeScript errors, all 4 CI checks GREEN
5. PM2 logs show no new error patterns post-deploy

**Phase 8 (Second-pass Langston verification):**
1. Independent UI verification via Claude-in-Chrome
2. Review of canonical map annotations for accuracy + clarity
3. Confirm `avgNetPct` wording is unambiguous
4. Sign-off that governance docs are complete

---

## 7. Sequencing

**B64 is NOT staged into sub-deploys.** Single deploy once all objectives are implementation-ready and Langston has reviewed the diff. This is a small enough batch that sub-staging adds overhead without risk reduction.

Suggested workflow timing:
- Phase 1 (Scope, this doc) — written 2026-04-23. Submit to Langston for review.
- Phase 2 (Pre-audit) — after Langston approves scope. Full SIM consult for any components touched.
- Phase 3 (Implementation) — 1-2 engineer-days. Small edits.
- Phase 4 (Code review) — Langston reviews diff.
- Phase 5 (Push + CI) — once code review passes.
- Phase 6-7 (Deploy + CC verification) — same session.
- Phase 8 (Langston verification) — shortly after.
- Phase 9 (Iterate if needed).
- Phase 10 (Governance updates).
- Phase 11 (Completion report).

Target close: within 3-5 days of scope approval.

---

## 8. Open questions — RESOLVED 2026-04-23 post-Langston-review

1. ✅ **Objective 3 framing:** rename column headers `Avg net %` → `Avg move %` and `Sum net %` → `Sum move %`. No tooltip. Keep code field names unchanged.
2. ✅ **Objective 4 observation window:** start now, don't wait 24h. Layer in any post-deploy findings.
3. ✅ **Naming:** this batch is B64b in completion docs (B64a = Drift Dashboard shipped separately).
4. ✅ **Objective 6 added:** MAX_HOLD_MS safety-valve restoration (Langston-flagged real bug introduced in B63 close commit). Fold into B64b implementation rather than standalone hotfix, per Kyle directive.

---

## 9. References

- `BATCH_63_SCOPE.md` §"To B64" — original deferred items list
- `BATCH_63_COMPLETION_REPORT.md` §5.8 — `avgNetPct` wording flag
- `POST_B62_PRE_LAUNCH_PLAN.md` §308 — original B64 scope (narrowed)
- `server/config/canonical-regime-strategy-map.ts` — primary file for Objectives 1 + 2
- `client/src/pages/analytics.tsx` `DriftDashboardSection` — primary file for Objective 3 + 4
- `SYSTEM_MANUAL.md` Appendix B63 — canonical source for concepts to annotate
- `SYSTEM_IMPACT_MAP.md` — Recent Additions B63 entries

---

*End of B64 scope. Phase 2 (pre-audit) begins after Langston review.*
