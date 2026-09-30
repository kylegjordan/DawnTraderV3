# B-PLAN-CURRENCY-CHECK — Step 2, PART 5 of 5: OBJ-10 (checker hygiene, CI, SIM/workflow-10 governance) + §8 out-of-scope dispositions + UNAUDITED items

Ref `f4ceb7e48` · full document: `Claude Comms and Packages/Scope Files/B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md` · detail for any id below: grep the full document at the ref · change-class `non_architecture` · Step-2 document = this pre-audit (RETROACTIVE it is not — it is the real Step 2). Your binding rulings: scope §10c conditions 2-4 and 6, the mandatory CI job, your `CLAUDE.md` §14 re-point; §10 Q9 (committed flag), Q10 (checker and heartbeat tests into CI).

## THE ASK
Rule on this area's questions and approve this area's plan items, or name what is wrong; rule the §8 dispositions. **Once all five parts are ruled, approve the whole Step 2** (the document's §6: P1-P63 plus P13a).

## WHAT MOVED (this area) — §1 rows, previous -> now (reason; finding)
- **1** confirmer intent at `GOVERNANCE_EXCEPTIONS.md:9` -> `:8` at `9d80cd991`, `51726bea6`, `d4a2679c4`; `:9` is the parent-ride N/A line. Miscitation, not drift. (HY-A19)
- **30** SIM anchors (state contract :3604-3608; Telegram :915, :2842; Task Lists :1055-1068) -> Telegram :915, :916, :2847; always-engage :2854 and `CLAUDE.md` :224 ("category marker"; live bridge keys on the alerts webhook id); Task Lists heading :1057, table :1061-1068; state contract disputed (HY :3609-3617, CD :3609-3613, CE :3604-3617) — cite by name. (HY-A14, CE-A19)
- **31** three hollowness texts -> six (+README :67, SIM :913); the `#605` "self-revoking" pin argument has a hole (a hollowed report keeps closed=true). (HY-A9)
- **32** README stale at :36/:74 -> also :54 ("23 cases"; 165). (HY-A10)
- **37** Q10: "checker **and heartbeat** tests into CI" -> no heartbeat test and no seam. (HY-A11, CE-A13; Q3)
- **38** OBJ-10: "a planted failing checker test shown to turn it red" -> cannot go on `migration/aws-supabase`; a throwaway `migration/<name>` push triggers CI; a PR would not (HYPOTHESIS). (HY-A13; Q4)
- **39** "68-row parse" -> 66 data rows + header + separator = 68 loader-visible lines; reconciled. (HY numbers [0])
- **40** carried s2_0 numbers (P2-P5, P6, P12, oq 1/2/5/6) -> renumbered: ledger pass ships with P21-P25; P22 uses P21's fixture; L111 retype P26; symbol conversion P52; Questions 29, 30, 4, 32.
- **41** workflow-10 cites `poller.mjs` on 2 lines / 4 citations -> 2 lines / 5 (:124 `:314`, `:268`, `:315`, bare `:698`; :130 `:334`). (HY-A16)
- **42** `absent or hollow` grep = 2 -> 3 (`poller.mjs:128`, `:325`, SIM :913); README texts need a second check. (HY-A9; P47)
- **43** B-ALERT-LIFECYCLE "confirmed placed" at PLS :331 -> named and positioned, not owned there (`(—)`); RI :5252 says CC-C; no plan line; own row PHASE_19_PLAN :147. (P58)
- **44** §8: `00-legacy.md` over cap and bridge diff = disposition 5 -> not 5: `#946`'s HOME (RI:1760) is explicitly unplaced (in no plan list; control `#1004` at row 164) — recorded on `#946`; bridge row recorded on `#1004` (placed, row 164, P19-B12). (§8)
- **45** P29/P30 in Group 5 -> two hazards: listing absent `census.mjs` blinds the drift guard and resolves `gov-code-drift`; a heartbeat CI step before P28 turns Test Suite red. (HY-A23)
- **46** "live on push" stated as a property -> put to you as a departure from Q9's intent: P21-P26, P28-P29, P31 grade live before Step 4. (R1-Q6)
- **47** P23: umbrella types "known", neither honoured nor flagged -> documented but unwired (no parser branch; ledger :96 "was NEVER BUILT"); home `B-UMBRELLA-OPEN-STATE` (CC-B, PLS :373); silent whitelisting = `#464` shape. (HY-A22; R1-Q8)
- **R2-HY-1** 66 rows, open 15, 7 `cc-c` open; P26 targets by line -> at `3d34dff88` 68 rows, open 17, 9 `cc-c` open (`309394337` inserted two at :35-:36, all lines below +2); by-line P26 would retype live rows; P26 now names targets by key; expected preview diff unchanged. (HY-A1)
- **R2-HY-2** after a failed fast-forward a new file "reads as clean" (R1-Q7) -> cannot occur (old poller, old list; the list edit changes `poller.mjs`'s blob); consequence withdrawn; 2026-07-11 fail-open stands. (HY-A23)
- **R2-HY-3** Group 4 before P30 -> first live checker change would reach the box with no CI over `poller.test.mjs` (`ci.yml` has no checker step; `vitest.config.ts:8` only `server/**`); P30's poller step moves ahead of Group 4.
- **R2-HY-4** P21 skips header and separator only -> any line with ≥7 `|` cells is a row; a rewritten grammar comment listing 9 types or the confirmer table would parse (malformed alert within ~30 min, or a phantom row); P21 skips `<!-- -->` blocks, comment written without `|`.
- **R2-HY-5** planted control in `poller.test.mjs` only -> the heartbeat step needs its own planted failure; both red steps cited by run id.
- **R2-HY-6** §8 `saveState`, `#559`, row 138a "1 — fold" -> no plan item carried them; now pending Q20, pending Q28, and P13a.
- **R2-HY-7** P56 UNAUDITED -> audited (HY-A24): PHASE_19_PLAN header wording collides §10c vs `CLAUDE.md:530`/workflow-10 :118/:141; R2-Q1; P60 lists PHASE_19_PLAN applicable.
- **R2-HY-8** 10 of 13 class-override values `declared:non_architecture heuristic:architecture` -> 9 (9+2+1+1); strict shape still accepts 12, rejects only B-DIAG-387. (HY-A8)
- **R3-HY-1** preview "today vs proposed at the push ref" shows 3 removals, 0 flags -> at the push ref it shows 0 differences whatever the parser does; restated as two refs (today's rule at the push commit's PARENT vs `parseExceptions` at the push commit); expected: naConfirmed loses `B-CROSS-SESSION-BLEED:system_manual`, `B-DIAG-387:system_manual`; open loses `B-XSTOCK-FEED-LIVENESS`; 0 flags. (HY-A4; P26, R1-Q6)
- **R3-HY-2** workflow-10 is the only live surface citing `poller.mjs` by line (2 lines, 5) -> widened regex `(config|checker|poller|heartbeat-check|census)\.mjs:[0-9]` finds 9 matches / 6 lines at `0efb956f7` (workflow-10 :124, :126, :130, :144; always-loaded `CLAUDE.md:85` `config.mjs:106-141`; `MEMORY_CC_A.md:94` `config.mjs:201`, already stale); P31/P33/P22/P23 move them; P52 converts all four skill lines with P21-P26, P51 converts `CLAUDE.md:85` in or before P31. (HY-A16)
- **R3-HY-3** P53 annotates `#654`; §8 puts 888-vs-864 on `#1004` -> both are CC-B's entries (RI:3162, RI:7705); scope §7 forbids editing another session's entries: hand-offs to CC-B. `#464` was filed by Langston (RI:434): its close is put to you. (R3-Q10)
- **R3-HY-4** §8's `#946` re-measure and `#1004` measurement "recorded" -> no plan item carried either; P53(a) and P53(b) now do.
- **R3-HY-5** CI before Group 4 gates the first live change -> CI does not gate the deploy: `20-auto-redeploy.conf` fetches and `merge --ff-only` with a leading `-`; `go-live.conf` `GOV_SHADOW=0`; nothing reads CI; the box runs a pushed commit within ≤30 min. Added: a pre-push local test run (exit 0, cited) on every live-on-push checker commit (P21-P26, P28, P29, P31). (HY-A10)
- **R3-HY-6** P47 "existing docgap tests assert the new body" -> no test asserts any alert body (grep returns nothing; control `docgap` 17 lines); P47 adds one with a failing control.
- **R3-HY-7** P55 target `00-legacy.md` -> the part `langston-memory-write` resolves at Step 10 (workflow-10 `SKILL.md:217`); today only `00-legacy.md` (90,166 B).
- **R3-HY-8** Q33 filed as a design choice -> departs from the approved "CI job … (mandatory)" (scope :172, :90); labelled a departure, number kept.
- **R3-HY-9** P23 `deploy-hold` "neither honoured nor flagged", no finding -> HY-A25: record-only, no code reads it; R3-Q11.
- **R3-HY-10** P57 UNAUDITED; §10 "Five" UNAUDITED -> HY-A26: your §14 (Helsinki :460-462) names only PHASE_19_PLAN; P57 audited with a verification, OWED until read back; now three UNAUDITED (P58, P59, P60) plus the P51 half.

## THE QUESTIONS (this area)
**Departing from a ruling or the approved scope:**
- **Q3 — your Q10 put "the heartbeat tests" into CI; none exist.** No test file, no seam (`checkHeartbeat` reads files and shells out; `poller.test.mjs:406-410` says heartbeat resolves are not exercised); a single `hb.alertId` and hard-coded `dedupe_key` cannot carry a second alert. P28 adds a pure `decideHeartbeat` seam and `heartbeat-check.test.mjs` (first coverage), silent-poller path unchanged; the two reads proposed different signatures (P28 carries both). Confirm this refactor is inside this batch. *(HY-A11, CE-A12, CE-A13.)*
- **Q4 — the planted-failure CI control cannot be pushed to the shared branch** (it would turn it red); a PR into it would not trigger CI (HYPOTHESIS: `*` does not match `/`, documented rules, not measured); a throwaway `migration/b-plan-currency-check-ci-control` push does (`migration/**`). Removing that remote branch afterwards is a delete — needs Kyle's or your OK before Step 5; the alternative is to leave it and name it in the completion report. *(HY-A13.)*
- **Q11 — confirmers for `open` rows.** The scope says "also by the owning session as today"; the loader cannot tell the owning session from other roster sessions without parsing the scope's Owner line. Accept any of `cc-a/cc-b/cc-c/cc-infra` (today's behaviour) with the limit recorded, or require `langston`/`kyle` plus the owner parsed from the scope? *(HY-A1, A3, A4.)*
- **Q33 — CI shape (DEPARTURE, labelled r3).** Scope: "the CI job for the checker and heartbeat tests (mandatory)" (§10c, :172); OBJ-10 verification: "the CI job name and a green run citing it" (:90). The recommendation replaces the job with steps; verification would read "the `Test Suite` job and the two step names, with a green run citing them". A step inside Test Suite (keeps the four-job texts in `CLAUDE.md` §7, `workflow-05-ci`, `guard-ci-cited.mjs` true — **recommended**) or a fifth job (independent of Postgres and `npm ci`, but every "four jobs" text changes in the same commit)? *(HY-A12.)*
- **R1-Q6 — DEPARTURE from Q9's intent: live before review.** P21-P26 (parser, confirmer normalisation, closed grammar, strict class-override, `gov-exceptions-malformed`, ledger retypes), P28-P29 (heartbeat seam, drift list) and P31 (id pattern) are live on push; the box fast-forwards each tick with `GOV_SHADOW=0` and Step 4 runs after the push. (i) accept live-before-review on the committed exceptions preview (P26), run across two refs — today's rule at the push commit's parent vs the new parser at the push commit — showing exactly the three intended removals and zero flags (*r3: a single-ref run at the push ref shows 0 differences by construction and is not this check*); (ii) new parser (and pattern fix) behind a committed flag defaulting to today's behaviour, flipped by a one-line change after your Step 4; (iii) review the diff from a side ref (throwaway `migration/<name>`) before pushing to `migration/aws-supabase`. **R3: none gets a CI gate for free** — the box reads no CI status, so under each option the checker tests run on the exact local commit before the push, output cited in the change list. *(HY-A10; §1 46, R3-HY-5.)*
- **R1-Q7 — WITHDRAWN at round 2 (R2-HY-2); no ruling needed; your 2026-07-11 fail-open ruling stands.** A failed fast-forward cannot make a newly listed file read clean. What remains is R1-Q15's case (Part 2) — rule once there. *(HY-A23; P29.)*

**Design choices:**
- **Q29 — closed grammar for the ledger's type cell, flagging an unknown type?** **Recommended:** a typo (`na_skip`, `na-skip-retird`) otherwise silently changes status. Cost: retyping L42/L43 (CC-C's) and L45 (confirmed by langston) from `closed`/`**CLOSED…**` to `open-retired`, no status change. *(HY-A5, A6, A7.)*
- **Q30** — malformed-row alerts: key `gov-exceptions-malformed:<batchId>:<type>` at `warning` (re-surfaces; an `info` row never does — the `65bb4388` shape), resolved by the tick when the row parses clean? *(HY-A4, A8.)*
- **Q31** — retirement by in-place retype only (your wording, B-GOV-4 precedent), or also cancel an `X` row when a later `X-retired` row names the same batch and value? The appended form failed in `#654`. **Recommendation: in-place only**, with the grammar comment and a test saying an appended retired row retires nothing, and L111 retyped. *(HY-A5.)*
- **Q32** — home for the hollowness residual (a hollowed or empty required doc passes live grading; weakens the `#605` pin): `#1099` B-GOV-LEDGER-GRADE (CC-A, after live, cited by name — proposed) or `#1107` B-CHECKER-BLOCK-GATE? *(HY-A9, A21.)*
- **R1-Q8** — with Q29: `umbrella-namespace`/`umbrella-done` are documented (GE :11, :89; README :72) with no parser branch; ledger row :96 says the type "was NEVER BUILT"; home B-UMBRELLA-OPEN-STATE (CC-B, PLS :373). Recognise and FLAG them "not implemented — B-UMBRELLA-OPEN-STATE" (**recommended**; no row uses them, nothing moves), or accept as known and inert with the comment saying so? *(HY-A22; P23, P26.)*
- **R1-Q9** — `#946` (your MEMORY over cap, one 90,166 B part) has an explicitly unplaced HOME (RI:1760, Kyle's 2026-08-30 re-home to Infra's instruction-file workstream, "Kyle owns the placement inside Infra's queue"); in no plan list. Recorded on `#946`, not withdrawn. Raise the missing placement to Kyle now, or leave it to the first live census list (b)? *(HY-A18; §8.)*
- **R2-Q1 — what should the PHASE_19_PLAN header say?** §10c: both plans run today (rows 3n, 2.4x live); `CLAUDE.md:530` ("PHASE_19_PLAN.md is now history", Kyle 2026-09-28) and workflow-10 :118/:141 say history. (a) keep §10c: header "superseded as the running plan by SPRINT_TO_LIVE_PLAN (2026-09-28); the rows still in flight here (e.g. 3n, 2.4x) keep running here until they close", same wording into `CLAUDE.md:530` and workflow-10 :118/:141 in one commit (shared prose: Kyle-visible coordination + rules-history entry); (b) header "history", with 3n and 2.4x first moved to the sprint plan by their owners; (c) leave the header until Phase 19 closes, P56 fixes only DELIVERY_BOARD :145 and POST_AUDIT_ROADMAP :119. P60 records PHASE_19_PLAN applicable if P56 edits it. *(HY-A24; P56, P57.)*
- **R3-Q10** — `#464` ("class-override ledger type documented but UNWIRED") was filed by you (RI:434); its fix landed in B-GOV-ORPHAN-CLASS OBJ-1 (poller.mjs:488-495, :655-669; report :10; HY-A17). Scope §7 bars editing another session's entries and you never push: may CC-A write the close with that citation, naming your ruling, or another way? Until ruled, P53 does not touch `#464`. *(R3-HY-3.)*
- **R3-Q11** — `deploy-hold` is read by no code (`git grep -n deploy-hold 0efb956f7 -- ':!*.md'` nothing); not in the grammar comment; its one row (GE:37, B-XSTOCK-FEE-CONTRACT, cc-b) calls itself the hold's record. Under the closed grammar: (a) accepted silently as record-only, defined so in the comment (current P23/P26); (b) flagged like the umbrella types? **Recommendation: (a)** — no ledger text claims checker behaviour, so not the `#464` shape once the comment says record-only. *(HY-A25, R3-HY-9.)*

Cross-refs: R1-Q15 drift fail-open, Q20 `saveState`, P28/P29 (Part 2); Q28 reused numbers (Part 4); Q34 `draft.py`/`render.py` (Part 3).

## THE PLAN ITEMS (this area)
- **P21** — exported pure `parseExceptions(raw)` -> {open, openSince, naConfirmed, classOverride, malformed[]}; skip header, separator, `<!-- -->` blocks — HY-A1, A2, A21 — **LIVE ON PUSH**; P21-P26 ONE commit.
- **P22** — `EXCEPTION_CONFIRMERS` (six) + `EXCEPTION_ACCEPT_BY_TYPE`; leading token, lowercase, split `+`; `pending` silent; else flagged — HY-A1..A4 — LIVE ON PUSH; Q11.
- **P23** — closed type grammar (9 types; `*-retired` skipped; unknown -> malformed; umbrella flagged not-implemented; `deploy-hold` record-only) — HY-A5, A6, A7, A22, A25 — LIVE ON PUSH; Q29, Q31, R1-Q8, R3-Q11.
- **P24** — strict class-override shape `^declared:(4)(?: heuristic:(4))?$`; no `reclassified:` — HY-A8 — LIVE ON PUSH.
- **P25** — `gov-exceptions-malformed:<batchId>:<type>` warning, resolved by the tick — HY-A4, A8 — LIVE ON PUSH; Q30.
- **P26** — one-time ledger pass by KEY (retype B-CROSS-SESSION-BLEED, B-DIAG-387 na-skip; B-XSTOCK-FEED-LIVENESS open; B-MBIM-SWITCH-ON, B-BALANCE-TRUTH, B-PHANTOM-FILL-RECONSTRUCT -> open-retired; B-DIAG-387 value; L68 reason; header :8/:11; grammar comment without `|`; edit rule append-only + two in-place edits) + committed two-ref `exceptions-preview.mjs` run before and after push — HY-A1, A4-A8, A19, A22, A25, A10 — LIVE ON PUSH; owners told; pre-push `poller.test.mjs` exit 0 cited.
- **P30** — two steps in Test Suite (`if: ${{ !cancelled() }}`): poller (before Group 4) and heartbeat (with/after P28); planted failures in both files on a throwaway branch, cited by run id — HY-A11, A12, A13 — CI detects, does not gate; Q4, Q33.
- **P47** — hollowness texts say "presence only" (poller.mjs:127-128, :325; README :53, :67, :72; SIM :913); new body assertion with failing control — HY-A9, A21 — residual home Q32.
- **P48** — README :36 (clone deploys itself), :74-79, :54, Pieces table, :22-32/:599 — HY-A10, A20 — text.
- **P50** — SIM content: plan-as-graded block, Monday-gate block, new keys at :916, Telegram fixes (:915, :916, :2847), always-engage :2854, CI row :1184, `#637` contract by name, :912; §6 hand-maintained; System Manual N/A (0/56) — HY-A12, A14, A15, A20, CE-A19, A2, A13 — Step 10.
- **P51** — `CLAUDE.md` :224 always-engage fix; `CLAUDE.md:85` to symbols in or before P31 — CE-A19, A2, HY-A16 — shared prose, coordinated; **rules-history half UNAUDITED**.
- **P52** — workflow-10 :124/:126/:130/:144 to symbols in the P21-P26 commit; :119/:140 in the OBJ-1 flip commit (P61) — HY-A16 — widened check.
- **P53** — (a) annotate CC-A's `#946` (90,166 B, unplaced HOME); `#1099` hollowness per Q32; (b) hand-offs to CC-B: `#654` correction, `#1004` 888-vs-864; (c) `#464` only on your OK — HY-A5, A9, A17, A18, A21, CE census [4] — OWED until CC-B's land.
- **P55** — your MEMORY closure line in the part `langston-memory-write` resolves at Step 10; OWED, never ticked for you — HY-A18 — condition 6.
- **P56** — DELIVERY_BOARD :145 and POST_AUDIT_ROADMAP :119 before/after texts; PHASE_19_PLAN :1 per R2-Q1; `MISTAKE: sibling-left-stale` — HY-A24 — text.
- **P57** — your §14 re-pointed by Infra (CC-A posts the ask); read back before Step 11, OWED until then — HY-A26 — wording per R2-Q1.
- **P58** — add tick-summary finding to `#1107`, two-fetch finding to `#1099`, `recurrence_interval_seconds` to B-ALERT-LIFECYCLE (CC-C asked to write its owner first); by line name — scope §5 only — **UNAUDITED** (findings not re-read at Step 2).
- **P59** — CC-A resolves `d9caf6f5` with the held deploy's sha naming the discharging condition (`#1021`); say so in channel if the deploy slips past 2026-10-02 — scope §10b only — **UNAUDITED** (no read of the alert row).
- **P60** — Step 10/11 obligations: class-matrix docs with applicability calls (CHANGES_AND_FIXES, POST_AUDIT_ROADMAP, PHASE_19_PLAN, RUNNING_ISSUES, DELETED_COMPONENTS_LOG, SIM applicable; ADJUSTMENT_FRAMEWORK, SYSTEM_MANUAL N/A), memory rows, board card; row 1's close-line edit AFTER P61/P62 — CD-A1, HY-A24 — **UNAUDITED** (Step-10 set not audited).

## §8 DISPOSITIONS (proposed; for you to rule)
- Reused numbers ≥6 (PF-A17) — pending Q28; recorded reach limit until then; then 1 (renumber with owners, via P16) or list (b) names each.
- `#464` OPEN though fixed (HY-A17) — 1, fold, on your OK (P53(c)); L68's stale reason folded into P26.
- `#760` attribution claim (CD-A17) — 1, fold (P54), `MISTAKE:` trailer.
- `#909` fixed under `#906` (PF-A4) — 1, hand-off to CC-C (P16); `#449` to CC-B; `#483`/`#499` closed by P15 if discharged; `#705` to you (R2-Q8); `#508` dropped.
- `#654` mechanism line (HY-A5) — 1, hand-off to CC-B (P53(b)); retirement leg discharged by P26; DRAFT leg stays 2.4b B-ALERT-QUEUE-INTEGRITY.
- Stale always-engage/Telegram wording, SIM :2854/:2847/:915/:916, `CLAUDE.md` :224 (CE-A19, HY-A14) — 1, fold (P50, P51); shared prose.
- Hollowness residual (HY-A9, A21) — 2, add to `#1099` B-GOV-LEDGER-GRADE (alt `#1107`, Q32); texts fixed by P47.
- `saveState` not atomic — pending Q20; in scope -> 1 (Group 7 item); out -> 3, own batch placed where you rule.
- Row 16 stale status (CD-A13) — 1, OBJ-9 with CC-C (P4).
- Row 138a stray cell (CD-A8) — 1, P13a with CC-C.
- `#736` stale PHASE_19_PLAN pointer; §5 `8a-P4c` ended window (PF-A6, round 2) — 1, hand-offs to CC-C (P16).
- RI:3436 `PRE_LIVE_SPRINT.md:509` (DL-A13) — 1, by name (P20).
- `draft.py`/`render.py` into CC-B's clone (DL-A15) — yours: 1 (extend OBJ-5) or 3 (own placed batch); Q34; until then LEFT with the hazard.
- SIM :1184 CI row (HY-A12) — 1 (P50(e)). `MEMORY_CC_B.md:32` (DL-A3) — 1, hand-off (P19). Plan :51 "208" (DL-A10) — 1 (P20).
- `B-RULES-1c/-1d` cannot see their combined report (CD-A10) — 4, scheduled review at this batch's Step 4 (`batchIdToFileRegex` for combined names).
- `c28606e63` message claims a `clusters.py` assert (DL-A14) — 5, no work (immutable history).
- `00-legacy.md` 90,166 B over ~24 KB (HY-A18) — recorded on `#946` (P53(a)); not 5; placement is R1-Q9.
- Live vs repo `discord-langston-bridge.py` 888 vs 864 (CE census [4]) — recorded on `#1004` (placed, row 164, P19-B12) as a hand-off to CC-B (P53(b)).
- Window-scoped lower bound (CD-A7) — in-scope residual, named not fixed, recorded in the SIM entry.

## LOAD-BEARING FINDINGS
- **HY-A2** — `isConfirmed` (poller.mjs:480) = `Boolean(by) && by !== 'pending'`: any text confirms; naConfirmed holds all 31 na-skip incl. L40 (WITHDRAWN) and L54 (SUPERSEDED).
- **HY-A3** — strict literal match would un-declare 10 legitimate rows (L28-L34, L36-L38) plus L40.
- **HY-A4** — proposed rule with the P26 edits: exactly 3 set removals (2 naConfirmed, 1 open), classOverride 13 -> 13, 0 flags; without edits L40 changes and B-DIAG-387 drops.
- **HY-A5** — appended `open-retired` retires nothing: L112 under L111; alerts `5f64d950` (2026-08-01T00:10Z), `4e9d0ded`, `a1dc9d48`, `9e08f8d8` (08-06).
- **HY-A8** — 13 class-override values (9 + 2 + 1 + 1); L68 `declared:hotfix` needs the optional heuristic; L53 `reclassified:` rejected.
- **HY-A9** — live path grades presence only (`docPresent` checker.mjs:112-117); `isHollowFile`/`netContentLines`/`preAuditStructure` called only by `backtest.mjs`.
- **HY-A10** — README :36 "NOTHING DEPLOYS TO THIS CLONE" false: `20-auto-redeploy.conf` ExecStartPre fetch + ff-merge; clone at `244fe6c5d`.
- **HY-A11** — no CI runs a checker test (`vitest.config.ts:8`; `ci.yml:102-103`); `poller.test.mjs` 165/0, planted copy exit 1; plain node, no npm.
- **HY-A16** — workflow-10 :119 instrument `—`, :140 "Nothing grades it yet"; line citations move with this batch (widened R3-HY-2).
- **HY-A23** — `checkerCodeDrift` (poller.mjs:521-534) one `try`, `{drifted:false}` on any throw; tick (:593-606) never reads `drift.error` and resolves open `gov-code-drift`.

The document's fresh-reader loop reached its cap; round-3 corrections (§7.11 and the r3 edits) have been read by no reader — see §11.
