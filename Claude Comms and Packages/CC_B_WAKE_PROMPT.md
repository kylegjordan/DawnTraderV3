# WAKE PROMPT FOR NEW CLAUDE (CC-B) — paste this as the first message

---

You are **Claude New / CC-B**. You have been dormant since **2026-08-16** — fifteen days. Today is **2026-08-31**.

**Do NOT try to reconstruct what happened while you were away.** Your rules and your own memory file load themselves. Read the four points below, then work your queue.

## 1. FIRST, BEFORE ANY WORK — YOUR CLONE IS 747 COMMITS BEHIND

`C:\DawnTraderV3-new` is **747 commits behind** `origin/migration/aws-supabase`, HEAD dated 2026-08-16.

⛔ **THE HAZARD, MEASURED TODAY BY CC-A AT A 43-COMMIT GAP — YOURS IS 17× THAT.** The `fresh-rules.mjs` SessionStart hook re-stages files into your working tree. At a large gap it can put **other sessions' committed content into your uncommitted tree**, where it looks exactly like your own work. CC-A hit this **three times today** and nearly committed CC-C's issue entries under its own name.

✅ **SO, IN THIS ORDER:** `git status` → for anything modified you do not remember writing, **read whose content it is before staging it** — the path will be right and the content will be someone else's. **Stash it, pull, and confirm it arrives from origin on its own.** Then commit only your own paths.

## 2. WHAT IS ACTUALLY NEW TO YOU (everything else you have already met)

- ⭐ **`CONDUCT.md` — you have never loaded it.** It landed 2026-08-20 with its own SessionStart loader. It is the behavioural rulebook: when to speak, the step-report format Kyle requires, one-line self-correction, investigate-before-you-announce. **It auto-loads. Read it once, properly.**
- **`CLAUDE.md` was slimmed** — nine clauses moved into the workflow step-skills, each leaving a pointer. `§9.5` is a husk plus four sub-pointers; `rule 19` is a deliberate numbered hole. **Citations still resolve.**
- **The governance ledger now leads with the batch's change-class**, and marks each document REQUIRED or JUDGED for that class. A REQUIRED row cannot take `N/A`.
- **A TypeScript language server is installed.** For "who calls this / what does this touch", use it — do not grep. On one symbol it returned five consumer files behind what looked like a one-line change.
- **All four guards you already know** (`governed-read`, `bare-commit`, `push-tsc-baseline`, `fresh-rules`) are unchanged and predate your dormancy. ✅ **The whole-filesystem-scan guard CC-A was building was DELETED (`#756`, commit `650b8897c`) — it does not exist and will not fire on you.**

## 3. ⚠️ ONE INTERMITTENT GUARD — DO NOT BYPASS IT

`guard-push-tsc-baseline` refused two of CC-A's pushes today with **"0 errors against a baseline of 384"** — a false zero, because `tsc` had not actually completed. **Re-run `node scripts/check-tsc-baseline.mjs` directly; if it returns `384 = 384 OK`, push again.** ⛔ **Do not reach for `--regen-acknowledged`.** It is doing its job: refusing to trust a suspicious zero.

## 4. YOUR QUEUE

- **33 open issues in `RUNNING_ISSUES.md` name you as owner.** Triage them yourself; nobody has been working them.
- **Two alerts routed to you by Langston on 2026-08-30:**
  - `d32ca173` — B-FILTER-DIAG-PAPER OBJ-2 soak: verify, or declare the window closed **with evidence**.
  - `7c4a873f` — T-W20C-SCALAR-LEG 99pct gate-test: run it, or re-schedule **naming the blocker**.
- ⛔ **DO NOT `ack` EITHER.** Ack silences the dedupe key without closing it — that is how three `#447` rows rotted. **Resolve with evidence, or re-home.**
- **`#972`** (filed for you 2026-08-31): xStock `atr_at_open` is 0 on 2/2 live opens and the `atr` key is absent on 61/61 xStock post-deploy closes, against crypto's 107 distinct non-zero in the same column and window. **Labelled HYPOTHESIS, not a defect** — xStock ATR may be honestly unsourced. It matters because `#581` deferred the two-distinct-ATR fence, and **a fence cannot go green against a field that is never written.**

## 5. ONE THING TO KNOW ABOUT WHY YOU WERE WOKEN

**Nothing told anyone you had stopped.** You owned 33 open items for fifteen days and no alert, report or check surfaced it — CC-A found it by accident while measuring something else. **That gap is now a named condition on the mechanisms being built: anything we ship must report whether it is actually live per session.** You are the reason that condition exists.

**Post in Discord `#general` as `NEW Claude` when you are up, with what you found in step 1 — especially if anything foreign was staged in your tree.** That is a measurement we want.
