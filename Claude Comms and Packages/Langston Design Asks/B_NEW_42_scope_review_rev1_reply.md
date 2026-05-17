Read all three. Here's my round-1 review.

---

# B-NEW-42 Scope Review — Langston Round 1

**Verdict:** scope is largely faithful to v2 plan §0 but has **two real deltas** from the locked plan that need to be folded in before Step 2, plus a couple of looseness flags on §4 verification criteria. **Revisions needed — not clean.**

---

## Responses to your 7 questions

### Q1 — Procedural correctness

**Mostly faithful, two deltas, one edge-case worth raising.**

**Delta A — Scope §2.2.3 drops the v2-plan ex-dividend window detail.**
- v2 plan §0.2.3 (line 74 of plan): "ex-dividend dates need same scheduled-event blocking as earnings (per Q2 option (b) pattern, **but with shorter window — 1-2 hours before market open on ex-date**)."
- Scope §2.2.3 (line 44): "ex-dividend dates need same scheduled-event-blocking machinery that Phase D earnings handling will build → flag as a Phase D dependency."
- The architectural framing ("same machinery") is right, but the **window is fundamentally different from earnings** (1-2h pre-open ex-date vs 24h pre / 4h post earnings). Losing that detail means the Phase D dependency note gets logged without the timing parameter Phase D needs to read. Fix: re-add the "1-2 hours before market open on ex-date" specifier when flagging the Phase D dependency.

**Delta B — Scope §2.3.4 weakens v2-plan halt-sentinel directive into a conditional.**
- v2 plan §0.3.4 (line 81): "Document halt-handling policy **+ add halt-detection sentinel to data-freshness layer**."
- Scope §2.3.4 (line 55): "(whether the data-freshness layer's existing staleness detection suffices or we need an explicit halt-detection sentinel)."
- v2 reads as directive; scope reads as conditional. v2 plan §0 closing line (83) — "If clean (verified policies documented + tests pass), proceed to A.1 design call" — suggests passing the §2.3.3 test is the gate, NOT building the sentinel. So the spirit was probably conditional. **But the literal text of v2 §0.3.4 is the locked plan**, and right now scope and plan disagree. Pick one and align: either upgrade scope §2.3.4 to commit-to-build (and accept that's code work even on CLEAN), OR explicitly note in scope that v2 §0.3.4's sentinel line is reinterpreted as conditional based on §2.3.3 test outcome. My read: go with the conditional interpretation, but call out the reinterpretation explicitly so the paper trail doesn't drift.

**Edge case — reverse splits absent from §2.1.4 test design.**
- Scope §2.1.4 (line 37): "synthetic 50% single-bar price drop (simulating a 2:1 split)."
- v2 plan §0.1.4 (line 68) is identical — only forward-split direction.
- TEC trailing-stop on a LONG position handles a 50% drop differently than a 2x or 10x JUMP (reverse split, e.g. struggling tickers going 1:10). The trailing-stop code is symmetric in some respects but BE-stop / moonbag logic is not. Recommend adding a **second test variant in §2.1.4: 2x single-bar price jump (simulating a 1:2 reverse split on a LONG position)**. Same test file, same TEC mocking; one extra assertion block. Cheap to add, catches an asymmetric edge case.

**Edge case — special cash dividends / spin-offs not covered by §2.2.1 scan range.**
- Scope §2.2.1 (line 42): "magnitude consistent with quarterly dividend yields (0.3-1.5% range)."
- Special cash dividends and spin-offs can cause 5-15% one-time gap-downs (Kellogg's WK Kellogg spin; one-time special divs). Those would miss the 0.3-1.5% scan window.
- Defensible to scope this out (rare events; xStock universe likely doesn't include the affected names) — but worth either widening the scan to "any unexplained overnight gap >0.3%" (cheap CSV-side filter widening) OR explicitly out-of-scoping in §3 with a Phase D follow-up note. Don't leave it silently uncovered.

Everything else in §2.1, §2.2, §2.3 is faithful. ADR / index-self xStocks / RTH boundary correctly deferred per v2 plan (those are A.1 / B.1 concerns, not Phase 0).

---

### Q2 — Verification criteria sufficiency

§4 table is well-structured for the testable items (2.1.4, 2.3.3) and the CSV-exists items. **Four rows are too loose**, all on the documentation-landing criteria:

**Row 2.1.5 (line 83) — too loose.**
- Current: "Section exists with policy + Kraken behavior + handling decision."
- Problem: "policy + behavior + decision" is three required sub-items but "section exists" doesn't enforce that all three landed. A 2-paragraph stub passes.
- Fix: enumerate the required headings. Suggested verification: "Section exists, contains H3 headings 'Archive Findings', 'Kraken WebSocket Behavior', 'TEC Handling Policy', each ≥1 paragraph with cited evidence (CSV row count, Kraken doc URL, test name + result)."

**Row 2.2.3 (line 86) — under-specified.**
- Current: "Either 'no handling needed' decision documented OR Phase-D blocking dependency flagged."
- Problem: where is the flag? Completion report? SYSTEM_MANUAL? POST_AUDIT_ROADMAP? RUNNING_ISSUES?
- Fix: name the location. Recommend: dependency flag goes in both `1-system-manual/POST_AUDIT_ROADMAP.md` (Phase D entry) AND completion report. SYSTEM_MANUAL contains the policy statement either way.

**Row 2.2.4 (line 87) — fine but thin.**
- Current: "Source named in SYSTEM_MANUAL.md."
- Add: source name + retrieval cadence + free-tier limits sentence (so Phase D doesn't re-research). Same level of detail you'd want on the earnings-calendar source decision in D.1.

**Row 2.3.4 (line 91) — too loose.**
- Same issue as 2.1.5. "Section exists" is not a verification. Enumerate headings.

**Row 2.4 (line 92) — needs explicit section name.**
- Current: "Gate decision recorded in completion report. CLEAN or DIRTY with evidence + Phase A unblock status."
- Fix: name the required section. Recommend "Completion report contains §X 'Phase 0 Gate Decision' with verdict (CLEAN/DIRTY), evidence (test results + CSV row counts + documentation links), Phase A unblock status (TRUE/FALSE)."

**Row 2.1.1 vs 2.2.1 vs 2.3.1 — inconsistent.**
- 2.1.1 specifies "row count + any hits annotated" — good.
- 2.2.1, 2.3.1 just say "CSV exists at ...". Mirror 2.1.1's bar across all three CSV criteria.

---

### Q3 — CLEAN vs DIRTY gate

**Fork into B-NEW-42b sub-batch if DIRTY. Don't expand B-NEW-42 in place.**

Reasons:

1. **Scope discipline.** B-NEW-42's intent is audit-only. Expanding it in place turns "audit" into "audit + design + impl + Langston code review + CI + deploy + verify + redeploy." That's three different batches' worth of work inside one batch, with one completion report trying to cover all of it. The CHANGES_AND_FIXES and BATCH_CATALOG entries get fuzzy.

2. **Different Langston-review surfaces.** Step 4 review of two test files is ~0.25 day. Step 4 review of a TEC code change (with regression coverage for crypto) is closer to 1 day. Treating them as the same batch under-budgets the review effort.

3. **Audit conclusion can close on its own clock.** If the audit completes Tuesday and the fix takes through Friday, you want the audit-CLEAN/DIRTY verdict landing Tuesday so Phase A.1 design discussion can iterate against a known-state Phase 0, rather than waiting on hotfix-batch completion to "close" Phase 0.

4. **§8 #11 NO PATCHES alignment.** A hotfix bolted onto an audit batch reads like a patch in the catalog. A separate hotfix batch with its own scope, design, code review, and verification reads like the long-term sustainable solution it should be.

Counter to "but the extra batch overhead is friction": agreed it's friction, but the boundary discipline is worth the overhead. B-NEW-42b scope doc would be ~1 page (the bug is already characterized by B-NEW-42's failing test) — that's a quick scope, not a heavy lift.

**Recommended scope §2.4 rewrite:** CLEAN → Phase A unblocked, plan proceeds to A.1 / A.2 as separate follow-on batches. DIRTY → B-NEW-42 closes with verdict + evidence; **B-NEW-42b is spawned as a separate hotfix batch with its own Step 1 scope, design, code review, and verification**. Phase A is gated on B-NEW-42b ship, not B-NEW-42b being merged into B-NEW-42.

---

### Q4 — Artifact location

**Prefer `1-system-manual/audits/b-new-42/`.** Reasons:

1. **`Claude Comms and Packages/Scope Files/` is for scope docs**, not audit CSVs + reports. Mixing the two muddies the directory's purpose. Future readers grepping Scope Files for design context get noise from CSV blobs.

2. **`1-system-manual/audits/` signals governance home.** Audit artifacts are reviewable governance evidence — not throwaway scratch. They have the same audience as PHASE_HISTORY / CHANGES_AND_FIXES (future devs, future calibration phases). They belong in the system manual tree.

3. **Reusable pattern.** `1-system-manual/audits/<batch-id>/` becomes the convention for any future audit-style batch (B81 prerequisite check, crypto-friction-review, etc.). One consistent place to look.

4. **Doesn't disrupt the existing `1-system-manual/` taxonomy.** `audits/` parallels `_archive/`. Already-established sibling pattern.

This is a preference not a blocker — if there's a structural reason I don't see for keeping it in `Claude Comms and Packages/`, name it and we'll reconsider. But absent a reason, move it.

---

### Q5 — Risk + blast radius narrative

**Framing is mostly right; refine into LOW-to-MEDIUM with explicit decomposition.**

§6 (line 124) says MEDIUM. That's defensible but coarse. Cleaner framing:

- **LOW** if the DIRTY fix is a new sentinel module (`corporate-action-detector.ts` or `halt-detector.ts`) consumed by TEC via a single `if (detector.isActionActive(pair)) skip stop` gate. Sentinel is read-only, contained, easily regression-tested. Crypto path unaffected because the gate is no-op (`isActionActive` returns false for crypto pairs since their detector has no events to find).
- **MEDIUM** if the DIRTY fix requires modifying TEC's core trailing-stop logic in `trailing-exit-controller.ts` (changing the stop-trigger threshold formula, adding asset-class branching deeper in the path, etc.). That's the genuine cross-asset blast surface.

The scope language at §6 (line 124) — "must be guarded by `asset_class === 'xstock_spot'` checks unless the fix is genuinely cross-asset-correct" — is correct as a guardrail but doesn't expose the LOW/MEDIUM split. Either decomposition gets written into §6 at scope time, OR the hotfix batch's own scope makes the call once the bug's characterized. I lean toward decomposing in scope so the §6 reader has the right mental model.

**Missing risk to call out: xStock VTS observation continuity during the DIRTY hotfix window.** If Phase 0 DIRTY → 3-5 days of B-NEW-42b → during that window xStock VTS observations continue with the known split/halt bug still active. Not catastrophic (we're in observation mode, no live capital exposed) but the observation data collected in those days carries a known-defective TEC behavior. Should be either (a) tagged as `pre_calibration_xstock_2026_05` so it gets excluded from analysis anyway (which it already is per F-NOW), or (b) explicitly truncated post-fix. Add one sentence acknowledging this so future readers don't wonder why a stretch of observation data looks anomalous.

Counter-mitigation of "disable xStock trading during hotfix window" is overkill since VTS is observation-only. Just flag it.

---

### Q6 — Sequencing assumption

**Compatible with how I want to run the next 2-3 weeks. One omission worth flagging.**

§7 (line 134): A.1 design as parallel working document, A.2 blocked on Phase 0 — matches v2 plan §0 ("parallel to A.1") and v2 plan §A.2 (waits on archive maturation AND A.1 design). ✓

**Missing from §7: A.1 has its own internal sub-blocker — the sector ETF data availability check** (v2 plan §A.1 line 94). If >3 SPDR ETFs are missing from xStock universe, A.1 spawns an offline-feed integration sub-batch with its own Langston design call before A.2 starts. That's not B-NEW-42's concern but it affects whether A.2 timing assumptions hold. Heads-up only; don't bake into scope.

**Also worth keeping on the radar (not Phase 0 concerns, parallel work):**
- **Crypto-friction-review batch** (v2 plan §2 line 232) needs scheduling — independent of Phase 0, parallel with Phase B, but it's B81 prereq item 2. Don't lose track.
- **F-NOW** (~half-day calibration_state column addition) has no Phase 0 dependency and can run any time. Could be a parallel side-batch to clear it before Phase B starts.

Both flagged so you have the cadence picture; not gating B-NEW-42.

---

### Q7 — Anything in v2 §0 I missed

Covered in Q1 already — the two deltas (ex-dividend window detail in 2.2.3, halt sentinel directive in 2.3.4). No other v2 §0 line items missing.

One meta-flag: **the conditional code-work rule at scope line 26** ("Phase 0 becomes a hotfix batch BEFORE Phase A starts") needs to be reconciled with Q3's recommended fork-into-B-NEW-42b model. If you adopt fork, rewrite line 26 to: "Phase 0 closes with DIRTY verdict + spawns separate B-NEW-42b hotfix batch BEFORE Phase A starts."

---

## Summary of revisions requested

Before proceeding to Step 2:

1. **§2.2.3** — re-add v2 plan's "1-2 hours before market open on ex-date" window specifier on the Phase D dependency flag. (line 44)
2. **§2.3.4** — reconcile with v2 plan §0.3.4 directive language. Either upgrade scope to commit-to-build OR explicitly note the conditional reinterpretation. (line 55)
3. **§2.1.4** — add reverse-split (2x or 10x single-bar jump) test variant alongside the forward-split 50% drop test. (line 37)
4. **§2.2.1** — widen scan to include unexplained overnight gaps >0.3% (catches special divs / spin-offs) OR explicitly out-of-scope in §3 with Phase D follow-up note. (line 42)
5. **§4 rows 2.1.5, 2.2.3, 2.2.4, 2.3.4, 2.4** — enumerate required content (headings, locations, evidence types) instead of "section exists" / "documented" / "named". Mirror 2.1.1's row-count+annotation bar across CSV rows 2.2.1, 2.3.1.
6. **§2.4 + line 26** — fork DIRTY into B-NEW-42b hotfix batch instead of expanding B-NEW-42 in place.
7. **§5 artifact location** — move from `Claude Comms and Packages/Scope Files/b-new-42-artifacts/` to `1-system-manual/audits/b-new-42/`.
8. **§6** — refine MEDIUM to LOW-to-MEDIUM with sentinel-vs-TEC-core decomposition. Add one sentence on xStock VTS observation continuity during hotfix window.

After rev2, expect to be CLEAN on round 2. Nothing structurally wrong — just folding the v2 plan details back in tight and tightening the verification criteria.

— Langston
