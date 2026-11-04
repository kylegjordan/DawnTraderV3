# PM Claude — decision ledger and how decisions are tracked to done

> **Why this exists (Kyle, 2026-11-04):** *"it's very important that when we make decisions together and then you relay those decisions to the others, that you're recording those decisions and then you're making sure that those decisions are being implemented by the other sessions … it's up to you to keep them honest."* Also: nothing that has been started is left unfinished unless we made a deliberate decision to cancel it.
> **Owner:** PM Claude. **This file is the record of what Kyle decided.** The plan files remain the authority for ORDER; a decision's "where" column points at the plan line that carries it.

## How the system works

1. **Record.** Every decision Kyle makes with PM Claude gets a `D-number` here **in the same turn**, with his words where he gave them, the date, and the source (Desktop chat or a Discord message id).
2. **Place.** If the decision changes the work, PM Claude writes it into the plan the same turn: the pre-sprint table, the sprint queue or the after-live list, at a named position. The issue ledger (`RUNNING_ISSUES.md`) carries the `HOME:` line.
3. **Relay.** PM Claude posts the decision on Discord to each session it binds, naming the session at the start of the post and quoting the `D-number`. **Each session replies `ACK D-n` and updates its own task list.**
4. **Verify, against the object, not the reply.** A decision moves from `RELAYED` → `ACKED` → `IN PLAN` → `IN WORK` → `DONE` only on evidence: the plan line at the review branch, the session's task-list line, the `B-NAME Step-N` commits, and for DONE the completion report or the agreed close.
5. **Check on a rhythm.** At every crew check (the PM's scheduled sweep; at least daily while sessions are working) PM Claude re-reads every decision that is not `DONE` against those objects. **No ACK within about two hours of an awake session, or no movement once its turn in the plan has come → a nudge (at most one an hour per stall); after two nudges with no movement → Kyle hears in one line.**
6. **Started-but-unfinished watch.** The same check lists every batch with a Step commit and no close. One untouched for 7 days with no recorded decision to park or cancel it → PM Claude asks the owner where it stands, and brings Kyle a decision: resume it at a named place, park it with a reason, or cancel it. **Parking or cancelling is itself a decision and is recorded here.**
7. **Changes.** A decision is never edited silently. Reversed or replaced → its status becomes `REVERSED by D-m` and the new decision gets its own number.

**Status words:** `RELAYED` · `ACKED` · `IN PLAN` · `IN WORK` · `DONE` · `WAITING ON KYLE` · `REVERSED by D-n`

## Decisions

| D | date | decision | Kyle's words / source | binds | where in the plan | status | evidence |
|---|---|---|---|---|---|---|---|
| D-1 | 2026-11-04 | The ChatGPT stand-ins' missing conversation backup (`#1238`) goes after live, owned by Infra Claude. | *"Yes, the ChatGPT fix can go after live."* (Desktop) | Infra Claude | after-live list, crew tooling, first line | IN PLAN | `f48f71517` |
| D-2 | 2026-11-04 | **Five data-truth fixes go to the very front of the pre-sprint table, in this order:** (1) finish the crypto price-feed watchdog; (2) finish the xStock bar check; (3) new batch: guard the shared database connections, owned by OLD Claude, absorbing the pool issue `#1062` from NEW Claude's archive-writer item; (4) give xStock strategies their direction score (`#1235`); (5) stop the staging disk filling: OLD Claude finishes the disk-file tiering and folds in the price-feed debug-log trim, Infra Claude fixes the token study's failed upload. | *"I'm fine with the 5 fixes that you're saying should go to the front."* (Desktop) | NEW, ANALYST, OLD, Infra Claude | pre-sprint table, top stage "00 — data truth first", orders 1-5b | RELAYED (msgs `…7329848565893` NEW, `…7347091218453` OLD, `…7368100626575` ANALYST, `…7375549702315` Infra; Langston told `…7411859664930`) | plan `efb2a0622`; ACKs pending |
| D-3 | 2026-11-04 | **No paid Backblaze storage for now.** Finish the planned storage and disk fixes first, then re-measure how fast storage grows and decide. | *"we fix the things that we've already decided to work on and see what that does for our storage accumulation … let's see where we are after we do these planned items"* (Desktop) | Infra Claude (token study), PM Claude (re-check) | re-check after D-2 item 5 closes | WAITING (re-check point) | relayed to Infra `…7375549702315` |
| D-4 | 2026-11-04 | **Kyle works through PM Claude; PM Claude relays decisions to the sessions, records them here and makes sure they are implemented where and when agreed.** | quoted above (Desktop) | all sessions | this file; `PM_CLAUDE_RULES.md` §1 | IN PLAN | rules commit (below) |
| D-5 | 2026-11-04 | PM Claude acts as Kyle's advisor: analyses the build, recommends before/after live and where for every issue, and decides with Kyle. | *"I want you to be an advisor in your role as project manager."* (Desktop) | PM Claude | `PM_CLAUDE_RULES.md` §1 | DONE | `105cebfc7` |
