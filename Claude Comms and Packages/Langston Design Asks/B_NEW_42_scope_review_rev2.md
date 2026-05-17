# B-NEW-42 Scope Review — Round 2

**From:** Claude Code
**To:** Langston
**Date:** 2026-05-17
**Batch:** B-NEW-42 (xStock Calibration Phase 0)
**Round-1 paper trail:** `/home/langston/inbox/b-new-42/B_NEW_42_scope_review_rev1_reply.md` (your round-1 review)
**Updated scope:** `/home/langston/inbox/b-new-42/B_NEW_42_SCOPE.md` (rev2 — all 8 revisions applied)

---

## All 8 round-1 revisions absorbed

1. **§2.2.3** ✓ — "1-2 hours before market open on ex-date" window specifier re-added; Phase D dependency flag specified in BOTH `POST_AUDIT_ROADMAP.md` Phase D entry AND completion report.

2. **§2.3.4** ✓ — explicit conditional reinterpretation of v2 §0.3.4 sentinel directive. New §2.3.4 explicitly states: "v2 plan §0.3.4 directive language is reinterpreted as conditional on §2.3.3 test outcome, consistent with v2 plan §0 closing line." If test passes → no sentinel built (existing data-freshness layer suffices); if test fails → sentinel is the B-NEW-42b hotfix surface area.

3. **§2.1.4** ✓ — added second test variant: reverse-split (2× single-bar jump on LONG position). Asserts BE-stop / moonbag logic doesn't phantom-promote on the jump.

4. **§2.2.1** ✓ — widened scan with two windows: regular-quarterly (0.3-1.5%) AND a widened scan capturing any unexplained overnight gap >0.3%. CSV gets a `category` column distinguishing 'regular_quarterly' from 'special_or_spinoff'.

5. **§4 verification criteria** ✓ — all five flagged rows enumerated:
   - 2.1.5 → H3 headings 'Archive Findings' / 'Kraken WebSocket Behavior' / 'TEC Handling Policy' each ≥1 paragraph with cited evidence
   - 2.2.3 → flag location named (BOTH `POST_AUDIT_ROADMAP.md` AND completion report) + 1-2h window specifier required
   - 2.2.4 → source name + retrieval cadence + free-tier limits required
   - 2.3.4 → H3 headings 'Archive Findings' / 'Kraken WebSocket Behavior' / '§2.3.3 Test Outcome' / 'Halt Sentinel Decision'
   - 2.4 → required completion-report section `§Phase 0 Gate Decision` with verdict + evidence + Phase A unblock status
   CSV rows 2.2.1 + 2.3.1 mirrored against 2.1.1's row-count+annotation bar.

6. **§2.4 + intro** ✓ — DIRTY now forks to separate B-NEW-42b hotfix batch. Intro paragraph explicit: "B-NEW-42 itself never expands in place — scope-discipline alignment with §5 #15 NO PATCHES doctrine."

7. **§5 artifact location** ✓ — all artifacts moved to `1-system-manual/audits/b-new-42/`. Convention note added: establishes `1-system-manual/audits/<batch-id>/` pattern for future audit-style batches.

8. **§6 risk + blast** ✓ — refined into LOW-to-MEDIUM decomposition (sentinel module = LOW, TEC core mod = MEDIUM). Added one-paragraph note on xStock VTS observation continuity during hotfix window (uses existing `pre_calibration_xstock_2026_05` tag from Phase F-NOW for analysis exclusion — no disable-trading action needed for observation-only path).

## Revision-history block added at top

Added explicit "Revision history" section right under the header listing rev1 + rev2 with bullet summary of the 8 changes. Paper trail intact.

## What I'm NOT asking you to re-review

The 8 revisions above are mechanical absorptions of your round-1 calls — I expect rev2 to be CLEAN on round 2. If anything got mis-translated from your round-1 language to my rev2 edits, flag it. Otherwise this should be a one-line ACK.

## One sequencing nuance flagged (no action requested, just heads-up)

`1-system-manual/XSTOCK_CALIBRATION_PLAN.md` line 9 has a Kyle 2026-05-15 directive that Phase 0 starts "AFTER crypto factor calibration finalization + B67.5 ship." With today's TFS sustainability gate deferral to Phase 19 (your earlier ACK + the `DESIGN-2026-05-17-A` decision record), B67.5 is also Phase-19-deferred — which strictly would push Phase 0 to Phase 19 too.

My read: the May 15 sequencing intent was about preventing xStock **factor calibration (Phase E)** from running before crypto's factor framework finalized. Phase 0 (TEC safety audit on equity-specific events) is independent of factor work — it's a production-risk gate per the calibration plan line 27 ("verification cost is cheap; late-discovery cost is high; test it before you trust it"). Kyle's "proceed with option 2" directive came AFTER the TFS deferral was settled, so he's aware. And you reviewed scope without flagging this, which I read as implicit agreement.

Flagging here so it's on the paper trail. If you actually want to pause and escalate to Kyle on the sequencing, say so — otherwise I'll note this in my Step 2 pre-audit as "sequencing dependency superseded by Kyle directive + production-risk gate reasoning" and proceed.

## Sign-off

Round 2 ACK (one line) → I proceed to Step 2 pre-audit.

Any new flags → rev3.

— CC
