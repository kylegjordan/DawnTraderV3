# Crew handover, Claude to Codex, 2026-11-09

Written by PM Claude (skill `pm-transition-to-codex`) on Kyle's word in the Desktop chat: *"Yes, prepare and switch."* The Claude crew stopped at the 85% weekly usage line on 2026-11-08 ~04:50Z. The Claude allowance resets **2026-11-12 23:00Z**, and the crew is expected to switch back after that. PM Codex runs the switch back once it is built (KD-62, KD-63).

**Read your own POSITION block first** (`.claude/memory/MEMORY_CC_<X>.md`, CURRENT POSITION). This sheet does not replace it. It lists what a POSITION block can hide: reviews answered after the stop, held deploys, timed checks, and items waiting on Kyle. Every sha and message id below is quoted from the session's own memory or the Discord log; re-read it at the ref before acting on it.

## Ground rules for this shift
- **Reviewer:** Coltrane. Start a Discord post with `Coltrane` to wake him. Langston is OFF (bridge disabled), and so is his alert lane.
- **Alerts:** nobody triages them automatically this shift. Each session reads the due alerts by hand (`ssh root@188.245.193.8 'python3 -' < scripts/due-alerts.py`) and acks or resolves only its own, under its `codex-` actor name if one exists, otherwise it leaves them and reports.
- **Langston answered several reviews after the stop** (log `/var/log/cc-discord-inbox.jsonl`, 2026-11-08 03:30-05:00Z). Read them before re-asking anything. Anything still unanswered goes to Coltrane, with the full context in the post or a staged file.
- **No staging browser on the Codex side.** A Step 7 page check is marked "UI not yet checked", and Kyle is asked to look at the page. Kyle's Chrome is also signed out of staging, so several UI legs are waiting on him either way.
- **Deploys restart the trading app.** Before any `dt-deploy`, read `/home/deploy/dawntrader-deploy.record` and the held-deploy notes below.
- **Coordination:** PM Codex does not exist yet. OLD Codex builds it first (brief: `1-system-manual/pm/reviews/2026-11-09_PM_CODEX_BUILD_BRIEF.md`) and coordinates until it is running.

## Folder state at the switch (PM Claude read it, 2026-11-09)
All four clones: nothing uncommitted, nothing unpushed. Each is 4-7 commits behind the review branch, so **pull first**. Only `.claude/launch.json` is untracked (local config). **ANALYST's folder is on branch `b8c-step3`**, which has nothing that is not already on the review branch. Switch it to `migration/aws-supabase` before working.

## OLD (CC-A → OLD Codex)
1. **First job: build PM Codex** from the brief, with Coltrane reviewing. Tell Kyle how to open the new PM Codex session in `C:\DawnTraderV3-pm` (brief step 0).
2. **B-DB-SIZE-RELIEF: STEP 4 of 11 · NEXT 5.** Langston ruled **gate 4: PROCEED WITH CONDITIONS** at 2026-11-08 04:53Z (Discord). Read the conditions and fold them in. The open-row note in `GOVERNANCE_EXCEPTIONS.md` must flip to open-retired before any governance alert is resolved at close.
3. **DEPLOY HELD:** any deploy at or after `a2f5cbc6d` applies B-DB-SIZE-RELIEF's database migrations. It waits for its queue place (5c). Other sessions' deploys must not carry it early without OLD's agreement.
4. **Drift body-capture item:** Langston ruled **disposition 2, ruling A withdrawn** (2026-11-08 04:45Z and 04:57Z): it folds into B-CREDENTIALS-PRIVATE-REPO OBJ-4. Nothing more for OLD to carry.
5. **B-DB-POOL-GUARD P5** (Step 8 evidence confirmed): its folds ride the next deploy, behind the hold above. Still owed: the UI leg and the weekday main-pool read.
6. **B-CLOSE-WRITER-COSTS: STEP 7**, and **B-STATUS-BOARD: STEP 7.** Their page checks wait on Kyle signing Chrome into staging.
7. **Owed to Langston:** the alert-verb design (#982). On this shift it goes to Coltrane, or waits.
8. **Weekly CC-A alerts now due:** plan census 2026-W46 (`890d6c3d`) and the mistake-pattern pass 2026-W46 (`70b88eb1`).

## NEW (CC-B → NEW Codex)
1. **First on resume (Langston, 2026-11-08 23:04Z):** close **B-FORMULA-HEALTH-AUDIT-FRESHNESS** (row 59g1a, parked 10-19) with the park as its disposition. Write the completion report, flip the `GOVERNANCE_EXCEPTIONS.md` row to open-retired, push, THEN resolve alerts `559f075c` and `86ed43a0` (never ack). Also #1214.
2. **Timed today: inc-A read, alert `801330ae`, 2026-11-09 21:30Z** (B-ENTRY-GATE Step 7).
3. **B-PRICE-FEED-COVERAGE inc 0: STEP 5 of 11, landing waits for that read.** After it: cherry-pick byte-identical from `review/b-price-feed-coverage-inc0` @`d1fd2974d`, CI 4/4 at the landed sha, a reviewer re-reads the landed sha (Coltrane this shift), `dt-deploy`, post the deploy sha to OLD (KD-48). Step 7 is the 11-10 session. Then inc B (Step-4 PROCEED on `20404d0a4`; re-land needs its own fresh CI).
4. **B-PRICE-FEED-COVERAGE main batch: STEP 2 of 11.** Coltrane's exact-ref sign-off on scope r9 was still pending. PART 1 method document next.
5. **Row 52 B-SILENT-STRATEGY-CENSUS: STEP 10 · NEXT 11.**
6. **Weekly reads:** six-settings `510a2e6a` (next 11-11 12Z) and the dt-deploy observation `e441b84b` (next 11-11 07Z).
7. **Waiting on Kyle:** row 172 B-TEC-PRIME-BOOT-RACE moving to NEW (the group's recommendation is with him).

## ANALYST (CC-C → ANALYST Codex)
1. **Due now: KD-19 Step 7, the 48-hour VTS exit read, alert `7e20ed0f`** (due 2026-11-09 15:20Z).
2. **`3n` B-PRICE-SIDE-BY-JOB `8c`: STEP 7.** Live but switched off (deploy `5c3b14496`). The page check and the switch-on wait on Kyle; the switch-on must state the flow rate (plan §13).
3. **Balance batch: STEP 7.** Items 2-3 were unexercised (book full). Watcher state is in the POSITION block.
4. **B-XSTOCK-BAR-AVAILABILITY: STEP 9.** C6 rehearsal ~11-11; read alert `3306c5c3` 2026-11-18 00:15Z.
5. **#1250: STEP 7.** Alerts `0c5f81ac` (11-10) and `ac78c006` (11-15).
6. **Other timed reads:** STRK max-hold `00b727aa` 2026-11-11 17:30Z; C-P5 `f6131ab0` 2026-11-16 02Z.
7. **Routine:** every `xstock-stale-fill-block` alert is ANALYST's and never goes to Kyle (agreed 2026-11-09). Langston resolved 28 of them overnight.

## INFRA (CC-INFRA → INFRA Codex)
1. **B-AGENT-INVOKE-FAILURE-NOTICE: STEP 4 · NEXT 5.** Gate 4C was with Coltrane (sent 11-08 02:30Z). Check the log for his answer.
2. **Gate-4C ruling, Discord msg `1568814816225660989`:** listed in the POSITION block as queued with Langston. Check whether it was answered; if not, it goes to Coltrane.
3. **B-LANGSTON-TWO-WORKERS: STEP 7.** Alert `7ae5446f` 2026-11-10 00:30Z (count plus control, then switch-on). Langston is off this shift, so the switch-on of his second worker waits until he is back on.
4. **B-TOKEN-WATCH-FOLLOWUP-MEMORY: STEP 3.** The P1 capture ended ~11-08 12:30Z. Hand-read its end record, then encoding-check, derive N, and run the arms.
5. **B-TRANSCRIPT-ARCHIVE: NEXT 7** (read back a scheduled nightly run). **B-DISK-HEADROOM: STEP 6** (Stage B on its own night).
6. **token-watch store over its warn line** (`7b19347d`): the fix is the follow-up sweep above.
7. **Waiting on Kyle:** B-WAKE-LEAD-NAME close acknowledgement.

## PM
PM Claude's handover is the CURRENT POSITION block of `.claude/memory/MEMORY_PM.md`: Kyle's pending decisions, open decision ACKs and follow-ups. Until PM Codex is running, OLD Codex coordinates.
