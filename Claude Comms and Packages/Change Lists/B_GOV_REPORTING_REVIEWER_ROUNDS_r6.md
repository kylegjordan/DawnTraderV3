# B-GOV-REPORTING r6 — THE FRESH-READER ROUND RECORD (for Langston)

**The loop ran three rounds and hit its cap.** Per the step skills, the cap outcome is not neutral: this is the full record. Each round was a fresh set of readers (one per gate, plus one looking for rulings r6 missed), handed the working tree, your rulings and the previous round's called-out items — never the earlier readers' reasoning. Every round was an OBJECT round (read the diff and the files at the ref, ran the commands).

⛔ **Nothing below is offered as evidence that r6 is right.** Strike this file from the dispatch and the changes still stand or fall on their own citations. It is here so you can see what was argued, what changed, and what I declined.

| round | called-out items it checked | satisfied | new items raised (must / should / note) |
|---|---|---|---|
| r1 | — (first read) | — | 24 must-fix |
| r2 | 25 (r1's) | 19 | 2 / 19 / 20 |
| r3 | 26 (r2's must+should) | 20 | 1 / 12 / 17 |

## AFTER r3 — WHAT I CHANGED (committed with this record)
- **10.b's impossible instruction (r3's must-fix):** the sum may only go down, the sync appends, the trim is Infra's. The skill now STATES the three cannot all hold, keeps the sync to the closure line, records the before/after sum, and routes the rise to Infra Claude — and the conflict is a G6 question to you.
- The `PHASE_19_PLAN` verdict slot restored as its own T1 row (a `P19-*` batch still owes it); the active-plan row made conditional on the batch having a sprint row, with a stated `N/A` form for one that does not.
- A `BLOCKED` row of ANY kind now blocks the close (it was only REQUIRED rows), parked with the blocker named in the task list's OPEN AND STALLED line — not on a progress report, which is for observation windows.
- The hotfix cells made true for a `P19-*` hotfix and for the scope + catalogue rows `workflow-hotfix` requires; the `R*` legend names the class-override route.
- `workflow-11` drops the Kyle-acknowledgement step (his 2026-09-02 ruling; my memory note homed the correction to the next governance batch touching that skill — this one), and "dated home" becomes a placed home (§9.4).
- `bug-investigation` keeps the plain phrase ban AS WELL AS the deletion test (stricter under either reading of your 07:15Z / 07:27Z rulings — which reading stands is a G6 question); its open question now says where your ruling lands.
- The sibling check's orphan detection restored (the AND I added had weakened it); `CLAUDE.md` §10.5's post-diagnosis line now says an event-wait alert is routed, pointing at `#646` for the protocol document; the §8 sentence stating another file's current content removed; the crew-board pointer moved to the after-live list.
- Records: `B-GOV-LEDGER-GRADE` (renumbered `#1099` at push — `#1096` and `#1097` were both taken by then) says four pieces, its home no longer claims an order the after-live list does not have, the after-live line says it is a RE-PLACEMENT; `B-GATE-GUARD`'s after-live line carries the `rules_change` ordering; `MISTAKE_PATTERNS` record 1 counts two, not one.

## DECLINED OR LEFT OPEN, WITH MY POSITION
- **The dormant `tail -20` in `wake-watcher-heartbeat-cc-a`** — that task is unregistered (the live heartbeat reads the whole file); it belongs to `B-WAKE-OUT-OF-BAND` (2.4g-b), which already says to measure it before rebuilding it.
- ~~**`due-alerts.py`'s clause-(b) population** … the `fired_at` leg of (b) is not covered~~ — **WITHDRAWN (Langston, G1): backwards.** The `fired_at` leg is a strict subset of the ack leg (an ack cannot precede its fire; a resurface does not rewrite `fired_at`), so the script is broader than the wording, never narrower. His nit applied instead: `acknowledged_by` is matched case-insensitively by prefix, catching his 27 historical ack spellings.
- **Shared `MEMORY.md` item 3 still names the dead `langston-alert-invokes.log`** — `#1054`, Infra Claude.
- **The hotfix's one R cell is graded only once a completion report exists** — the `#754` blind spot, already stated in the skill's honest limit.
- **Tier-1 unconditional (`CLAUDE.md` §3.0) vs judged `SCOPE`/`PRE_AUDIT` for `sub_batch`**, **row 8 item (v)**, **the generated after-live list** — G6 questions.

## THE THIRD ROUND'S FULL OUTPUT (the unresolved state before the changes above)

### G1
- r2-item **SATISFIED** — 1. CLAUDE.md §10.5: the hook gives only id, severity and title and is capped at 25, while step 2 requires body and metadata. Open gaps were (a) no source for metadata, (b) body cut at 400 characters, (c) the by-hand read triggered only for acting, which is step 3, not surfacing, which is step 2
- r2-item **SATISFIED** — 2. MEMORY.md:16: clause (b), Langston's acks within the last 24h, had no executable command, and the `or` made the hook look sufficient
- r2-item **SATISFIED** — 3. Dropped rule: shared MEMORY.md:58 removed `owned = routed, row left active` (the #982 event-wait prescription) with no replacement
- r2-item **SATISFIED** — 4. Three records say Langston's 09-13 dedupe sentence landed at §10.5 STEP 3, but it sat under STEP 1
- r2-item **NOT_SATISFIED** — 5. A tail sibling of #980 survives: CC-A's hourly heartbeat task reads alerts with `tail -20`, and the #980 annotation does not name it
- NEW **should_fix** — CLAUDE.md:202 (rule 25.a) puts the new home for B-CREW-BOARD-REMOVAL in a plan that the active plan calls history, and does not name the item's live placement. The pointer is also ambiguous: PHASE_19_PLAN has two rows numbered 11.
- NEW **should_fix** — The two always-loaded homes for the per-turn alert check disagree on whether the script must run on an ordinary turn with due alerts. MEMORY.md:16 sends (a) to the hook alone, but CLAUDE.md requires the script for the body and metadata of every due alert.
- NEW **note** — MEMORY.md:16 now names due-alerts.py as the instrument for clause (b), but the script selects a different population from the one (b) states.
- NEW **note** — The header of due-alerts.py describes output the code no longer produces.
- NEW **note** — CLAUDE.md:570 says `an ack also stops it surfacing` without qualification. That holds only for the per-turn read. The dispatcher still re-surfaces acknowledged warning and critical alerts.
- NEW **note** — The new sentence at CLAUDE.md:419 (§8) states the current content of another file inside a paragraph whose own lesson forbids exactly that. The paragraph also still carries the per-file `~24KB` cap in its narrative.
- NEW **note** — The rewritten MEMORY.md:16 still points clause (b) at a log that has been dead since June.
- NEW **note** — Object hygiene: the working tree is 13 commits behind origin, and PHASE_19_PLAN.md changed on origin in the meantime. So `git diff origin/migration/aws-supabase -- 1-system-manual/PHASE_19_PLAN.md` shows two reversal hunks that r6 did not write.

### G2
- r2-item **SATISFIED** — G2-1: bug-investigation/SKILL.md:49 claimed the claim-only/object-round interpretation was 'PUT TO LANGSTON 2026-09-29 AND NOT YET RULED'. It was never put to him, and 'NOT YET RULED' was a live status with no pointer.
- r2-item **SATISFIED** — G2-2: the sibling check's TERMINATION marker was the loop heading, not Langston's 08-28T07:15Z object-round condition. It passed while bug-investigation lacked his corrections and would pass again if they regressed. Suggested fix: add 'termination requires an *object* round' as a second required mar
- NEW **should_fix** — The sibling check's new conjunction weakens its ORPHAN detection. `orphan` (:40) is computed from `term`, and `term` now needs BOTH markers (:38). So an instruction file that carries the loop heading 'it is a loop, not a one-shot' but not the mechanism is no longer reported. The old script reported it as TERMINATION WITHOUT MECHANISM. Fix: compute orphans from files carrying EITHER termination marker, and keep the AND only for `missing`.
- NEW **should_fix** — workflow-11-completion still requires Kyle's acknowledgement to close a batch. Kyle's 2026-09-02 directive removed that requirement, and the correction was explicitly homed to THIS batch. r6 edits workflow-11 but neither makes the correction nor records a §9.4 disposition for it.
- NEW **note** — bug-investigation:47 deletes the explicit phrase ban and presents 'a deletion test, not a phrase ban' as settled. Scope §7d:254 records that exact question as OPEN ('Which stands?'). Line :49 flags its own open question inline; :47 carries no such flag. The change list's G2 gate line also does not carry the question, so the G2 dispatch will show it to Langston as decided.
- NEW **note** — bug-investigation:49 is an instruction with a live conditional ('Until he rules, satisfy BOTH') that names neither where the ruling will be recorded nor what retires the interim text. Once Langston rules, the skill goes stale unless someone remembers to edit it, and the pointer will still lead to a scope section headed 'not decided here'.
- NEW **note** — This is pre-existing and outside the diff, but it sits in a file this diff edits. workflow-11:30 requires an open scope item to carry a 'dated home', and CLAUDE.md §9.4 forbids a calendar date on a home.

### G3
- r2-item **NOT_SATISFIED** — 1 (round-1 #3). BLOCKER-2 'grep the class': the lines saying the CHECKER requires exactly one document of a hotfix are false for a P19-* hotfix
- r2-item **SATISFIED** — 2 (round-1 #4). T1 PHASE_19_PLAN made 'judged' for non-P19 batches; the remaining leg was shared MEMORY.md:13 still saying 'PHASE_19_PLAN progress' is unconditional
- r2-item **SATISFIED** — 3. :130 gave 'the class table has no correct exit for it (#985)' as a ground for BLOCKED, but Langston's #985 ruling retired that use
- r2-item **NOT_SATISFIED** — 4. The hotfix column contradicts workflow-hotfix, and the SCOPE row's tokens misstate what the checker does
- r2-item **SATISFIED** — 5. The BLOCKED close path at :130 was incomplete: it did not say whether a batch closes, it cleared the alert via na-skip without stating the tier, a na-skip clears permanently, and BLOCKED fails LEDGER_TOKEN
- r2-item **SATISFIED** — 6. CLAUDE.md:419 still pointed readers to Langston's per-file MEMORY header for his cap (a third copy)
- r2-item **SATISFIED** — 7. :127's universal claim ('every other Tier 3 … is a parameter, fee, data … tier') was false because of governance-DOCUMENT Tier 3s
- r2-item **SATISFIED** — 8. The new SPRINT_TO_LIVE_PLAN ledger row turns a proposal awaiting Langston into a Tier-1 obligation that §7a did not claim
- NEW **must_fix** — 10.b (SKILL.md:203) states Langston's ratchet and then, in the same paragraph, tells the session to break it: 'THE SUM MAY ONLY GO DOWN' is followed by 'A sync is an append … record the rise, do not cut his file yourself' and 'assume a prune is due'. As written the instruction cannot be followed, and it overrides a ruling that nobody re-ruled.
- NEW **should_fix** — The PHASE_19_PLAN verdict slot was dropped from the ledger. The class matrix still marks it R for any P19-* batch, but the table a session fills in and posts has no row for it, so a P19-* batch can fill every row and still fail the checker.
- NEW **should_fix** — BLOCKED on a JUDGED row has no close rule. :130 says only that a BLOCKED REQUIRED row blocks the close, which invites a close with an owed (applicable) update not landed. The progress report it parks on is also defined for observation windows, not for blockers.
- NEW **note** — The hotfix column's only R cell (CHANGES_AND_FIXES, :113) is graded only after a completion report exists, and the same column marks COMPLETION_REPORT 'judged · c'. For a hotfix that writes only workflow-hotfix's 'short completion note', the R cell can have no live instrument, and the cell does not say so.
- NEW **note** — :127's list of the 'other' Tier 3 kinds is still not exhaustive. The document-tier claim holds, but the sentence meant to stop the question coming back is still refuted by a live governance document.
- NEW **note** — Always-loaded CLAUDE.md:84 says 'Tier-1 is unconditional every batch AND sub-batch', but two T1 ledger rows (SCOPE :142, PRE_AUDIT :143) are 'judged' for sub_batch in the class matrix this diff rewrote (:106, :107). This is the 'grep the class' axis again.
- NEW **note** — The author's claim map for this file (scope §7a row 7) describes a BLOCKED mechanism the working-tree file no longer contains.
- NEW **note** — The new active-plan row is REQUIRED in every class (:119, :140 'your row') and has no exit for a batch that has no row in SPRINT_TO_LIVE_PLAN. That is the BLOCKER-2 shape: N/A is forbidden on a REQUIRED row and no re-declared class removes it.

### MISSED
- r2-item **NOT_SATISFIED** — 1. CLAUDE.md §10.5: land the 09-13T21:47Z sentence next to step 3 and :576/577; correct MEMORY.md:58 and PHASE_19_PLAN:617 item (v); record on #982 / PRE_LIVE_SPRINT:324
- r2-item **SATISFIED** — 2. The 09-13 sentence's placement is recorded as 'landed at step 3' in three places, but it sat inside step 1
- r2-item **NOT_SATISFIED** — 3. Change list G1 misstates the 09-13 ruling as 'an acked alert blocks the next mint of its key' and drops the active-row half
- r2-item **SATISFIED** — 4. Two RUNNING_ISSUES annotations sit after their entry's closing `---`; the #982 annotation abuts `### #984`
- r2-item **NOT_SATISFIED** — 5. B-GOV-LEDGER-GRADE is recorded as the home Langston named but is placed elsewhere, and its HOME lacks `after <item>`
- r2-item **SATISFIED** — 6. The 7d 'conditional docs are never graded' finding is not recorded at its named destination (#1097)
- r2-item **SATISFIED** — 7. Folding rules_change into #744 drops Langston's ordering constraint
- r2-item **SATISFIED** — 8. MISTAKE_PATTERNS record 1 has no slug; record 2 is filed under a dated heading rather than with its slug
- r2-item **SATISFIED** — 9. The 7c disposition row for the MISTAKE_PATTERNS records is orphaned outside the table
- r2-item **SATISFIED** — 10. A third, per-file copy of Langston's memory cap survives in CLAUDE.md §8
- r2-item **SATISFIED** — 11. r6 breaks the offline mandated-command fixture (M0 red for the allowlist home; the due-alerts read uncovered)
- NEW **should_fix** — The change list's gate plan gives no gate to the items the scope says go to Langston 'at the gate'. That includes the B-GOV-LEDGER-GRADE re-placement, the MISTAKE_PATTERNS candidate occurrence, the rules_change record on #744, and the seven §7d questions.
- NEW **should_fix** — The change list's field (ii), 'that class's doc set', omits `phase_19_plan`, even though the batch edits PHASE_19_PLAN.md. This is the same document Langston's 08-29 BLOCKER-1 was about.
- NEW **should_fix** — MISTAKE_PATTERNS record 1 misstates Langston's count as ONE occurrence. He counted two: one copied edit-series plus the F-G line. As written, the record's own 'third occurrence completes the count' does not add up.
- NEW **should_fix** — The #1097 home, and the removal of the after-live B-GOV-REPORTING line, were hand-written into a GENERATED file. The next run of the generator silently deletes the home and restores the removed line.
- NEW **should_fix** — r6 writes part of #646's §10.5 ack doc-fix (CC-B's `B-ALERT-ACK-PROCEDURE-DOCFIX`) into CLAUDE.md:570 without cross-referencing #646. The 'definitive process' doc that §10.5 points to still tells owners to ack, which contradicts the new line. #982's own HOME line was also never updated.
- NEW **should_fix** — The rules_change-before-#744 ordering is recorded only in the ledger entry. Neither plan row that sequences B-GATE-GUARD carries it, and under §9.4 the ledger points at the plan while the position lives in the plan.
- NEW **note** — #1097's intro and the sprint-list line disagree with the entry body. The intro says three items and there are four. The sprint line lists only three and states one of them as a decided fix.
- NEW **note** — The #980 annotation describes due-alerts.py's output as 'the start of each body'. The script prints the body up to 100,000 characters (in effect the whole body) plus metadata.
- NEW **note** — Issue-number uniqueness holds, but the #1097 append will conflict with origin's #1096 at pull time.

## DISPATCH ROUNDS — G2, G3, G4 (2026-09-29)

Each round was a fresh reader handed the draft and the objects at the ref (object rounds). The record is the mechanism's own denominator, not evidence that anything in the dispatch is right.

- **G2** — REVIEWER r1: object · 3 misquotes + 1 misdated ruling + 6 unmentioned changes · all fixed, sent 15:56Z. Langston: APPROVED with one condition (the phrase ban), carried out at e6e3364ee.
- **G3** — REVIEWER r1: object · 10 items: item 5 asked him to clear text r6 had replaced; §3.2 two-limb removal unstated; the tier sentence corrects his 08-29 census; BLOCKED/gov-ledgerrow case missed; hotfix gaps; stale checker comment; §3.0 conflict missing; "twice" ambiguous; a SYSTEM_MANUAL token wrong; 8 unlisted diff changes · all taken (workflow-10 :92 reworded and #1099 gained the config.mjs:121-123 comment at e3262f563).
- **G3** — REVIEWER r2: object · 12 items: change list covers only 9608a3da5; the archived Tier 3 WAS in force (Phase 12 → 15b), so his historical conclusion falls, not only his census; :120 → :119; BLOCKED breach is only a completion-named file; BLOCKED is a token where he wrote a state; :266 missed G1 C1 (fixed at afcc86469); deploy hold misattributed to Kyle (it is two observation windows, GOVERNANCE_EXCEPTIONS.md:32); five tokens, not three; hotfix also narrows; :92 not in the header; sub_batch R*; non-P19 matrix vs ledger · all taken.
- **G3** — REVIEWER r3 (cap): object · 4 corrections (BLOCKED graded only on the task-lists row; the 08-30T01:40Z quote cut Kyle's attribution, and the 10.b interim RELAXED Kyle-approved row 2.8b; no-scope-file means architecture-grade missing-doc alerts; hotfix "one document" holds only when the class is readable) + 10 smaller (plan row 8 is PHASE_19_PLAN:619; one-line form at :180; :129 had no exception in reading order; hotfix PHASE_19_PLAN cell is —; the narrowing is every non-P19 batch; :193 "twenty rows"; r4's 10.b change also superseded; CLAUDE.md:84 by line; Tier 3 in force 03-10 → 04-20) · all taken; :129, :193 and the 10.b interim fixed in the file before sending. **Cap reached: sent with this record.**
- **G4** — REVIEWER r1: object · edit 9 had approved the block's ungating; c8627a0b9 missing; his item-4 sentence paraphrased; the two/three-places reading misframed; r6's :88 edit never committed; "can" vs "does"; the "two days" figure was 14.5 hours (corrected at cd1943763) · all taken.
- **G4** — REVIEWER r2: object · his 08-28 ruling asked for ONE durable home (report OR commit message); "no enforcement mechanism" is my gloss, not Kyle's words; edit 9 covered the ungating only, so the block's content goes to him; MISTAKE_PATTERNS:399 still said two days (fixed at afcc86469); 9 smaller · all taken.
- **G4** — REVIEWER r3 (cap): object · no misquote, no wrong line; 3 overstated characterizations (edit 9 was put to him in summary and he changed the block; his 08-28 ruling named two acceptable homes, not a cap of one; he did object at 11:50Z, not to :188) + 3 omissions (his edit-9 approval rested on "3 of 4", struck, and "two days", now 14.5h — both legs gone; the first spawn started with Kyle's grant; option (b) would starve #1099 item 1) + 8 smaller · all taken. **Cap reached: sent with this record.**

- **r7 (G4 conditions)** — REVIEWER r1: object · items 1-8 check out; bug-investigation's heading is dated to Kyle's directive, not undated; the AWAITING-KYLE paragraph wrong (it had said the block was owed to Kyle) · taken. Then a separate trace found Kyle had answered items 1-3 on 2026-07-10 (fa6b06b16).
- **r7** — REVIEWER r2: object · the header's commit count; "Kyle's 07-10 answer is what the text carries" unsupported; the REPORT label WAS put to Kyle (10:46Z) and taken off at 13:22Z; workflow-10 :65 vs :68 carry two versions; the Observation column is dated 08-27 · all taken (3020ed530); the dispatch now asks him which version records as Kyle's answer instead of asserting one.
- **r7** — REVIEWER r3 (cap): object · :65 and :68 are ONE composed rule (:61), not two versions; :68 is Kyle's 08-26 directive; workflow-10 :57 lacked the rename sweep; "overnight" wrong · all taken (f7e9417e4). **Cap reached: sent 17:49Z.** Langston CLEARED r7 with two conditions (17:56Z).
- **r8 (G6 rulings + r7 conditions)** — REVIEWER r1: object · the drift premise misquoted; a mixed-surface chunk figure; the regenerate-and-diff check, the prune-reason audit answer and the rules_change HOME left out; #744, #1099, PRE_LIVE_SPRINT :348 and scope §7c/§7d still pre-ruling · taken (2b251af9e).
- **r8** — REVIEWER r2: object · the inventory reasons WERE inferred (answerable now); a resolve re-mints ONE rung; the 17:30Z routing to Kyle; e6e3364ee filed before his ruling; message kinds; stale counts · taken (8c3db7e1d).
- **r8** — REVIEWER r3 (cap): object · a possible third sibling-left-stale occurrence (2b251af9e's own trailer); the carry-back not stated; issues_deep.py is where the word match lives; two memory writes merged into one; the label's message misattributed; the installed-script hash named the wrong sha; the ownership split on d9caf6f5 · all taken; the label question posted to Kyle in #general (18:41Z) and the :32 overstatement told to NEW Claude. **Cap reached: sent with this record.**
- **G6 (+ G5 q1)** — REVIEWER r1 on G5: object · Kyle's 08-30 re-home was the MEMORY trim, not the AWAITING-KYLE block; CONDUCT :104 vs the proposed fifth value; edit 7 was ruled 08-27, not 08-26 · taken; G5 q2 moved to r7, q1 folded into G6 as item 9.
- **G6** — REVIEWER r1: object · the :84 proposal omitted judged cells and left MEMORY.md:13's copy; rules_change had its own 08-26 home; today's catches carry fix-follows-pointer, not sibling-left-stale · taken.
- **G6** — REVIEWER r2: object · #947 (B-GOV-CLASS-PARSE, owner CC-A) duplicates #968 and was pruned from the inventory while OPEN; #747's guard dates from 5de0b9432 (08-27), not eae252a32; POST_AUDIT_ROADMAP :27 has no ordered list; outcome (2) reaches Kyle as DECISION REQUIRED · taken.
- **G6** — REVIEWER r3 (cap): object · GOV-ARC (#668) is parked by Kyle; #947's home was named, never placed; the inventory row is an unconfirmed first pass with a false reason; #947 holds three facts #968 lacks; :104/:147 put as a question · taken. **Cap reached: sent 17:44Z with this record.**

## DISPATCH READERS NOT LISTED ABOVE, AND STEP 11 (2026-09-29)

- **G1 (dispatch)** — REVIEWER r1: object · two stale statements (the guard comment on the removed allowlist entry; the crew-board placement's category) · both fixed at `442d0359a` before the G1 send.
- **Step 11 (completion report)** — REVIEWER r1: object · the report and the records disagreed with what landed (the BATCH_CATALOG/PHASE_HISTORY/plan/task-list closing lines still said Step 10 was blocked on `#1057`; the scope's placement line; the rules-history entries for §4, §8, §9.4's pointer and rule 25.a missing) · fixed at `262439aad`.
- **Step 11** — REVIEWER r2: object, at `262439aad` · 25 items: Objective 1's due-date claim wider than its check; the CI "rest were cancelled" (most succeeded); counts with no population (withdrawals, changes never put to him); the Langston-memory swap written in reverse; two ledger rows over one sentence; `ALERT_HANDLING_PROTOCOL` `N/A` where the trigger fired; `DELIVERY_BOARD_PROTOCOL` :131 left stale; the board card in the wrong column; no PREVIOUSLY/NOW block; the REPORT label with no failure condition · all taken, r10 (the commit carrying this line).
- **Step 11** — REVIEWER r3 (cap): object, at `034865e01` · 11 items: the commit message's copy of the ledger lacked the below-table detail and the Langston-memory row lacked the loaded sum; `CLAUDE.md` §10.5's closing paragraph stale after r10; the `#646` note cited shared `MEMORY.md` item 3 (the wording is in its hook-layer paragraph); a line number that now points at `#643`; the edits' date range; the REPORT label's open item had no owner, home or closing condition; 13,191 B included the composer's 202 B stamp; the failing CI test misnamed; the PREVIOUSLY/NOW block incomplete; the Observation `N/A` cited no scope line; four records lagging · all taken at r11 (`55d5ca034`), each re-derived; nothing after r11 has been read by a reader.
