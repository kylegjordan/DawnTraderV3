# B-COMMS-IMAGES-2 — the sessions can SEE images, not only send them
change-class: non_architecture

> ⚠ **FILED RETROACTIVELY 2026-08-07, and labelled as such rather than back-dated.** This
> scope did not exist before the work; the checker caught its absence (alert `d1e3d172`) and
> Langston verified the claim at the graded ref before relaying it — *"there's no scope file
> for this batch in the repo at all, which is the real gap the missing label is a symptom of."*
> Both are right. A scope written now and presented as though it preceded the code would be a
> filename-shaped forgery, so this states plainly what happened, what was and was not skipped,
> and what the omission cost.
>
> **What was genuinely done before implementation:** Langston reviewed the design and the
> intended mechanism (private invocation #10) and returned CHANGES-NEEDED before anything was
> installed; the fixes went back to him (#11) and he ruled PROCEED before deploy. So the
> *substance* of Step 1 — the reviewer sees the plan before the code lands — happened.
> **What was skipped:** the ARTIFACT, and with it the machine-readable `change-class` line the
> checker grades. Consequence: the checker graded a laptop-side comms change against the
> architecture standard, and the gap sat undetected until the checker fired.
> **Why it happened, honestly:** Kyle said "yes, please build it" and I went straight to
> building, treating a follow-on to a closed batch as too small to need its own Step-1 file.
> Batch size is not the test — the checker grades every batch id equally, and a follow-on that
> touches the wake path of all three sessions is not small.

## Objective
Kyle, after B-COMMS-IMAGES (#657) closed: *"the end goal being that all the sessions can send
and see images."* #657 delivered Langston fully and the desktop sessions half — images were
saved and their paths recorded, but the wake filter forwarded `text` only, so a session woke
with no idea an image existed, and the file sits on Helsinki where a desktop session cannot
Read it.

## Scope (as built)
1. `cc-wake-filter.py` — `media_suffix()` appends saved image paths to wake lines that ALREADY
   fire (adds no routing), fail-open; a failed save states SAVE FAILED rather than resembling
   no image; one branch surfaces Langston's own image uploads.
2. `dt-media-get` — fetch to a local path for Read; prints NO path on failure.
3. `dt-media-post` — laptop → Helsinki → `cc-send --file` in one step, staging into the durable
   prune-governed media dir (the decision that removed any need for a bridge change).
4. Repo re-home of the wake filter out of `comms-infra/telegram-reference/` (three weeks stale,
   predating ANALYST Claude) into `comms-infra/laptop/`, made byte-identical to live first.

## Out of scope (named, with homes)
- Bridge pointing at the already-staged copy instead of re-downloading (kills the double-write).
- Sanitizing the raw filename inside `save_image_meta`'s failure string.
Both need a bridge change + announced restart → ride the next one. Owner: Infra Claude.

## Verification (all executed — see the completion report)
Posted image → real log row carries the path → INSTALLED filter emits a wake line naming it →
fetched → Read returned the image; refusal path prints no path and exits non-zero; Langston's
hostile fixture 4/4 and the regression fixture 8/8 against the installed file; CI green per-job
(run 31148009374).

## Blast radius
The wake filter is shared by all three desktop sessions — a fault there stops every wake with
no error. Mitigations: fail-open by construction, offline fixtures before install, dated backup,
and the install gate (diff vs backup + both fixtures re-run against the INSTALLED file).
No server or bridge code changed. Crew action: RE-ARM watchers (a running Monitor holds the old
code).
