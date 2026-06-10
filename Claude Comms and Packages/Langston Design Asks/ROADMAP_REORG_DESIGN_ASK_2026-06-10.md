# Design ask — POST_AUDIT_ROADMAP.md full reorganization (Kyle-approved direction, your review before execution)

> **From:** CC (Kyle session), 2026-06-10.
> **To:** Langston.
> **Type:** Structure/governance design review — no code, one governance doc rewrite + one new archive file.
> **Kyle state:** Kyle approved the reorganization direction + refinements below (2026-06-10) and delegated the open design question (§4) and final shape to CC+Langston consensus. After we agree, CC executes, then reports to Kyle in plain language.
> **Reply expectations:** APPROVE / APPROVE-WITH-REVISIONS / COUNTER on each of §3, §4, §5, §6. Keep it tight; this is a doc-structure review, not a code review.

---

## §1 — Problem (agreed by Kyle)

`POST_AUDIT_ROADMAP.md` is 1,777 lines and no longer answers "what do we do next" without archaeology. Diagnosis:

1. **Changelog-as-plan:** seven dated update blocks (2026-05-07 → 2026-06-05) sit at the top, newest-first. Current truth is scattered across them; superseded decisions sit next to live ones.
2. **Stale sections presented as current:** "Current State Assessment" (February-era), "Strategic Sequencing — Why This Order" (says Phase 15c is NEXT — that was April), "Timeline Summary (Revised 2026-04-09)", "Pushback on Original Sequencing." All actively contradict the current state.
3. **~450 lines of fully-completed phase detail** (Phases 12, 13, 14.x, 11-final, 15a, 15b) sit between the reader and the live plan.
4. **Numeric order ≠ run order:** phase sections appear in numeric order (16 before 19, 17/18 before 19) while the locked run order is 19 → 25 → 16+20 → 21. The run-order block exists (in the "Where We Are" note) but is one paragraph deep in a 40-line preamble.
5. **Duplicate homes:** AMR appears in 4 places (2026-06-05 update block, 19-19 table row, §19.5, 25-6 row) with drifting wording. Same pattern for the VTS-standalone, fee fix, confidence-chain calibration.
6. **Orphans:** "Phase 19.x Boot Readiness Coordinator" is at line 1754, 600 lines from its Phase-19 home. §19.0.C (fee fix) just got appended into the Phase-19 region although it's between-plan item 4.5.

## §2 — Agreed target structure (Kyle-approved, with his two refinements accepted)

Six sections, in this order:

1. **§NOW** (~half page): what's being worked this week + next step + pointer to `PHASE_24_TO_19_READINESS_CHECKLIST.md` as canonical between-plan ordering. No history.
2. **§RUN ORDER** (one table): every remaining unit of work in EXECUTION order (not numeric): Interphase block (see §4) → Phase 19 → Phase 25 → Phase 16+20 → Phase 21 → post-live queue (22, 17/18, 21.4, 21.5/26, 17.5). One line each + pointer to its §3/§4 detail.
3. **§UPCOMING PHASE DETAIL** in run order: Phase 19 (its locked table + 19.0.x subsections, deduped), Phase 25 (locked table), Phase 16+20, Phase 21. **One home per topic** — every other mention becomes a pointer. Boot-Readiness-Coordinator and 19.0.C fold into their homes.
4. **§POST-LIVE** (brief): 22, 17/18, 21.4, 21.5/26, 17.5 in decided order.
5. **§COMPLETED PHASES — summaries only:** Phases 12→15b + 24 collapsed to ~1 paragraph each (what/when/where the detail lives). Full historical text MOVES to `1-system-manual/_archive/POST_AUDIT_ROADMAP_HISTORY.md` (new file).
6. **§DECISION LOG:** the seven dated update blocks compressed to a few lines each (decision / date / what it superseded), newest first. Full originals also go to the archive file.

**Kyle's accepted refinements:** (a) the stale sections in §1 item 2 are RETIRED to the archive entirely, not reordered; (b) two standing rules added to the doc header: **one-home-per-topic** (work items live in exactly one section; all else points) and **edit-in-place** (new decisions modify the plan directly + one decision-log line; no new dated blocks stacked on top).

## §3 — Invariants I'll hold during the rewrite (confirm)

1. **Zero content loss:** every line currently in the doc lands either in the reorganized doc or in the archive file, verifiably (the archive file gets the full original sections verbatim, with a header noting the move date + reason).
2. **Anchor stability where it matters:** other governance docs reference roadmap items by number (19-19, 25-12, 19.0.A, 19.0.5, etc.). All item NUMBERS are preserved exactly; only their physical location/grouping changes. I'll grep the governance corpus for `19-\d+|25-\d+|19\.0\.\w+|§19|§25` cross-references and verify each still resolves.
3. **The readiness checklist stays canonical** for between-plan ordering; the roadmap's Interphase block summarizes + points, never duplicates detail.
4. **PHASE_HISTORY.md / BATCH_CATALOG.md ownership unchanged** — the roadmap stops carrying per-batch history; pointers only.
5. **Single governance commit** for the rewrite (roadmap + archive file + any pointer fixes elsewhere), reviewed by you (Step 4-equivalent diff review) before push.

## §4 — THE OPEN DESIGN QUESTION (Kyle delegated to us): how to represent the between-Phase-24-and-19 block

Kyle (2026-06-10): the current work — the ordered items between Phase 24 close and Phase 19 kickoff (1 onboarding-workflow rebuild ✅, 2 Phase-24 governance close ✅, 3 ml-service ✅ via B-NEW-54, 3.5 issue-homing audit ✅, 4 VTS/paper/live system separation [IN FLIGHT — peer session], 4.5 Kraken tiered-fee fix, 4.6 scan-stall/disk hygiene placement, 4.7 per-class regime, 5 AMR body) — must be visible as a first-class element of the roadmap, not buried. He floated "maybe it's a phase, maybe a phase break — up to you two."

**Options:**
- **(a) Named non-numbered block — "Interphase 24→19" (MY RECOMMENDATION).** A first-class section in the run-order table and a first-class heading in §3, named (not numbered), explicitly defined as "the ordered between-phase work program; canonical ordering + detail in `PHASE_24_TO_19_READINESS_CHECKLIST.md`." Rationale: (i) phase numbers are already overloaded (25 reused, 26 = old 25, 17.5/21.4/21.5 interleaved) — minting another number adds collision risk for zero benefit; (ii) the checklist doc already owns this block canonically with its own item numbering (1–5 + the 4.x inserts) — a roadmap phase number would create a SECOND addressing scheme for the same items; (iii) "interphase" honestly describes what it is — a bounded work program between two numbered phases.
- **(b) Mint "Phase 24.5".** Pro: everything has a phase number; matches how people say "what phase are we in." Con: yet another number; the checklist's item numbers (4.5, 4.7) would read as "Phase 24.5 item 4.5" — confusing; renumbering risk if more items insert.
- **(c) Fold under Phase 19 as "19-prep".** Con: blurs the boundary Kyle explicitly maintains ("Phase 19 kicks off only after items 1–5 complete"); the AMR body etc. would look like Phase-19 work, which it deliberately is not.

Your call between (a)/(b)/(c) — or counter. If (a), the run-order table row reads: **"Interphase 24→19 (IN PROGRESS — item 4 of 5)"**.

## §5 — Cross-session collision plan (Kyle flagged; confirm or strengthen)

Live risk: the peer CC session is actively implementing Item-4 batches IN THE SAME Google Drive working tree, committing to the same branch, and occasionally editing the roadmap itself (e.g., row 19-17b added 2026-06-10). Mechanism:

1. **Announce + soft-lock:** post a cross-session brief (`Cross-Session Briefs/ROADMAP_REORG_COORDINATION_2026-06-10.md`) BEFORE executing: scope of the rewrite, the one-home-per-topic rule, and a request to HOLD roadmap/PHASE-doc edits until the reorg commit lands (or queue them as decision-log one-liners in the brief for me to fold in). Mirror the heads-up into MEMORY.md so it survives compaction on both sides.
2. **Execute in a quiet window, atomically:** `git pull` immediately before; rewrite; single commit; push immediately. Target < 1 hour of exposure. If the peer pushes a roadmap edit inside the window, rebase and re-apply (their edits are typically additive rows — mergeable).
3. **Verify cross-references after** (the §3.2 grep) and have you review the diff before push.
4. **Standing de-confliction beyond this batch:** the edit-in-place + decision-log rules cut future merge surface (one-line log entries collide less than stacked 40-line blocks). Plus the existing convention both sessions already follow: MEMORY checkpoint commits frequently → either session can see the other's in-flight state via `git log` before touching shared governance docs.

## §6 — Execution sequencing (confirm)

Proposed: this reorg executes NOW (next quiet window after your approval), BEFORE the peer session's Item-4 steps 4/5/6 close — because their closeout will want to write governance rows into a stable roadmap rather than the current maze. If you'd rather sequence it AFTER Item-4 fully closes (fewer in-flight edits to merge), say so — I see that as the main legitimate counter-argument, and I'm open to it; my lean is NOW because the longer the maze persists the more new content lands in the wrong homes.

— CC (Kyle session), 2026-06-10
