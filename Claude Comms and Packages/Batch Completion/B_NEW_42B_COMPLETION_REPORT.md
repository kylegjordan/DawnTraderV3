# B-NEW-42b Completion Report — Price-Discontinuity Detector (xStock Phase 0 Hotfix)

**Batch ID:** B-NEW-42b
**Type:** Hotfix batch (spawned by B-NEW-42 DIRTY verdict per scope §2.4 fork).
**Author:** Claude Code
**Closed:** 2026-05-17
**Commit:** `d8e0f5885` on `migration/aws-supabase`
**Deploy:** 2026-05-17T20:10:00Z (Hetzner Falkenstein, PM2 #293)
**Scope:** `B_NEW_42B_SCOPE.md` rev2 (Langston ACK)
**Pre-audit:** `B_NEW_42B_PRE_AUDIT.md` (Langston CLEAN ACK with 5 refinements applied)

---

## §1 Verdict

**B-NEW-42b CLOSED.** All three B-NEW-42-confirmed structural TEC gaps closed structurally. Phase A unblocked. Langston Step 8 PASS via SSH verification.

---

## §2 Scope Objectives Status

| # | Objective (per scope §2) | YES/NO/PARTIAL | Evidence |
|---|---|---|---|
| 2.1 | NEW `server/services/price-discontinuity-detector.ts` with 4 kinds | **YES** | 483-line module. 4 kinds enumerated in `DiscontinuityKind` type: `halt_resume_gap` / `corp_action` / `ex_dividend` / `cold_start` (Langston pre-audit rev1 #1 non-negotiable). |
| 2.1.1 | Halt-resume-gap detection (load-bearing primary) | **YES** | State machine IDLE / DISCONTINUITY_ACTIVE / CLEARING. Stateless 5min HARD_CEILING timestamp comparison (Langston pre-audit rev1 #5). Confirming-tick clearing window 30s. Documented in detector module + scope §2.1.1. |
| 2.1.2 | Corporate-action discontinuity detection | **YES** | `|Δ%| >= 40%` single-bar trigger. 24h TTL. Supersedes halt_resume_gap when both could trigger. |
| 2.1.3 | Ex-dividend curated calendar | **YES** | `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` — 15 names × ex-dates Q3+Q4 2026. 7:30-9:30 ET pre-market-open block via `Intl.DateTimeFormat(America/New_York)` (DST-aware). Calendar lazy-loaded by detector. |
| 2.2.1 | `shouldClosePosition` consumes detector | **YES** | Signature extended with optional `currentTs` + `discontinuity` params. Production path through `tec-evaluator` always provides the detector result via the hoisted-consultation pattern. |
| 2.2.2 | Target-lock consumes detector | **YES** | `updatePosition` gate at `!state.targetLatched` check. Same hoisted-consultation pattern via `update.discontinuity` field on `PositionUpdate` type. |
| 2.2.3 | Caller-side plumbing (silent-disable guardrail) | **YES (refined design)** | Pre-audit §3 refined to detector-owned cache (vs scope §2.2.3 caller-propagation). Outcome structurally equivalent; caller-side surface unchanged; silent-disable failure mode structurally eliminated. Cold-start fail-safe-skip per Langston pre-audit rev1 #1. |
| 2.3 | B-NEW-42 regression-test assertion inversion | **YES** | FORWARD SPLIT, REVERSE SPLIT, POST-RESUME GAP all assert `shouldExit=false` / `modeChanged=false` post-fix. POST-RESUME GAP also asserts `entry.activeKind === 'halt_resume_gap'` (Langston Step 4 rec to catch future cold_start drift). |
| 2.4 | SIM increment | **YES** | SIM TEC + ADJUSTMENT_FRAMEWORK Appendix A both updated. SYSTEM_MANUAL "Phase 24 EXTENDED 4" section added (move from audit-findings to fix-shipped). |
| 2.5 | Calendar-staleness sanity test (optional) | **YES** | Detector unit test "EX-DIVIDEND: tick on date NOT in calendar..." + "EX-DIVIDEND: symbol not in calendar..." cover the gracefully-degrades cases. |

---

## §3 Workflow Compliance (CLAUDE.md §2)

| Step | Status | Notes |
|---|---|---|
| 1. Scope | ✅ rev2 (Langston ACK) | 6 changes from rev1 → rev2 |
| 2. Pre-Audit | ✅ rev1 (Langston CLEAN ACK with 5 refinements applied) | Cold-start fail-safe-skip locked in as non-negotiable |
| 3. Implementation | ✅ | Detector module + TEC integration + migration + assertion inversions + ADJUSTMENT_FRAMEWORK |
| 4. Code review | ✅ round 1 (2 BLOCKERS + 1 minor) → round 2 ACK after fixes | Both blockers addressed: currentTs plumbing complete + detector consultation hoisted to single call per logical tick |
| 5. Push + CI | ✅ commit `d8e0f5885`; CI baseline held (75 passed | 13 failed; +1 passing file vs pre-push baseline of 74; 0 new failures vs pre-existing 13 Test Suite failures from Directive 11.x era accepted per RUNNING_ISSUES #113) |
| 6. Staging deploy | ✅ PM2 #293 (2026-05-17T20:10:00Z); build green; health endpoint OK |
| 7. CC first-pass verification | ✅ | Tests green on staging, migration row count 24, PM2 logs show `[B-NEW-42b][DIVIDEND_CALENDAR_LOAD]` + cold-start fail-safe-skip emissions |
| 8. Langston second-pass | ✅ PASS via SSH (HEAD=d8e0f5885 ✓, module_constants count=24 ✓, CI baseline acknowledged ✓, detector loaded at boot ✓) |
| 9. Iterate | N/A — clean ship after Step 4 round 2 |
| 10. Governance | ✅ BATCH_CATALOG + PHASE_HISTORY + SYSTEM_MANUAL + ADJUSTMENT_FRAMEWORK + CHANGES_AND_FIXES + RUNNING_ISSUES + MEMORY (truth + repo mirror) + Langston Helsinki MEMORY all updated |
| 11. Completion report | ✅ This document |

---

## §4 Files Changed

### NEW
- `server/services/price-discontinuity-detector.ts` (483 lines)
- `server/tests/unit/b-new-42b-price-discontinuity-detector.test.ts` (13 tests)
- `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` (60-entry calendar)
- `drizzle/migrations/2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql` (8 knobs × 3 rows = 24 entries; idempotent ON CONFLICT)
- 6 Langston Design Asks files (pre-audit review pair + Step 4 code review pair + round-2 dispatch + reply + Step 8 reply)
- `Claude Comms and Packages/Scope Files/B_NEW_42B_PRE_AUDIT.md`

### MODIFIED
- `server/services/trailing-exit-controller.ts` — `shouldClosePosition` + `updatePosition` target-lock gate signature changes
- `server/services/tec-evaluator.ts` — single hoisted detector consultation per logical tick + threading
- `server/tests/unit/b-new-42-tec-split-resilience.test.ts` + `b-new-42-tec-halt-resilience.test.ts` — assertion inversion + `entry.activeKind` assertion
- `1-system-manual/SYSTEM_MANUAL.md` — Phase 24 EXTENDED 4 section
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-42b row
- `1-system-manual/PHASE_HISTORY.md` — xStock Phase 0 hotfix entry + 5 lessons
- `1-system-manual/ADJUSTMENT_FRAMEWORK.md` — Appendix A (8 new knobs catalogued)
- `1-system-manual/CHANGES_AND_FIXES.md` — `BUG-2026-05-17-B` (fix entry)
- `1-system-manual/RUNNING_ISSUES.md` — #112 status updated (curated-calendar interim posture deployed)
- `.claude/memory/MEMORY.md` (truth) + `DawnTraderV3/.claude/memory/MEMORY.md` (repo mirror) — B-NEW-42b closure block
- `/home/langston/MEMORY.md` (Hetzner) — synchronized

---

## §5 Workflow Lessons (carries forward into PHASE_HISTORY)

1. **GDrive FUSE single-point-of-hang.** Two prior Step 4 round-2 dispatches hung 30+ minutes when Langston's claude-cli auto-exploration ran `cd /mnt/gdrive/...` + `git status` on the 10GB+ repo. Third dispatch embedded code-diff snippets inline + explicitly forbade gdrive access. ACK'd in <1 minute. Captured: when dispatching Langston for code review, embed essential diff content + explicitly steer to SSH for any repo inspection.

2. **Detector-owned cache cleaner than caller-side prev-tick propagation.** Pre-audit §3 refined the scope's caller-propagation design to detector-owned cache. Structurally equivalent outcome; eliminated silent-disable failure mode.

3. **Double-consultation per logical tick is a non-obvious state-machine bug.** Step 4 BLOCKER 2. Hoisted detector consult to one call per logical tick in `tec-evaluator.ts`; result threads down via parameter to both gate sites. Architectural pattern worth re-using for any future TEC-integrated sentinel.

4. **Cold-start fail-safe-skip is a structural correctness property.** Returns `{active: true, kind: 'cold_start'}` on first call per symbol; protects against unfillable-fill during PM2-restart-during-halt blind window.

5. **Pre-existing CI rot must be diagnosed before being attributed.** CI red baseline turned out to be 10+ day pre-existing technical debt, not B-NEW-40 morning. Investigation went into RUNNING_ISSUES #113 with corrected attribution.

---

## §6 Plain-language summary (per CLAUDE.md §1)

**The problem:** B-NEW-42's audit confirmed three ways the system's trailing-stop logic would book unfillable losses on real stock-market events. Forward stock splits would fire every protected stop simultaneously on what's structurally a unit-count change. Reverse splits would flip positions into wrong-mode "moonbag" tracking based on a price jump that wasn't real upside. Trading halts that resumed at a different price would book exits at the pre-halt stop — a price that wasn't available to trade at. The third one was the most operationally dangerous because nothing in the system was defending against it.

**The fix:** built a small module called the "price-discontinuity detector" that watches every price tick for an xStock position and flags four types of events: big single-bar price moves (splits and reverse splits), multi-minute pauses that resume at a meaningfully different price (halts), known ex-dividend dates from a hand-maintained calendar, and the first tick after a process restart (where the system has no prior context to evaluate against). When any of these fire, the trailing-stop logic doesn't act on the price — it waits for a confirming normal tick. After that one tick of delay, the system resumes normal operation.

**What's running on staging now:** the detector is loaded and active. The system's logs already show it doing the right thing — on every xStock position the system opens, the first price tick triggers the "cold-start fail-safe-skip" we documented as a non-negotiable safety per Langston's pre-audit review. After that first tick per position, the detector quietly monitors and only activates when an actual discontinuity event happens.

**What's next:** Phase A of the xStock calibration plan is unblocked. The DBS (directional-bias score) foundation work can now proceed. The dividend calendar is hand-maintained for the 15 most likely dividend-paying names; when Phase D ships the automated calendar feed, the detector's internal interface stays the same and the manual file gets replaced without consumer code changes.

**Pre-existing CI red baseline note:** the CI Test Suite has been failing on 13 pre-existing test files for at least 10 days — these test files exercise older code from previous refactor eras and weren't updated as the system evolved. You explicitly accepted this as documented technical debt earlier today. B-NEW-42b held the baseline: it added one new passing test file (the detector's own unit tests, 13 tests passing) and introduced zero new failures. Net change: 74 → 75 passing test files; 13 failures unchanged.

---

— Claude Code, 2026-05-17
