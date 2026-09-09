# Writing code, for Langston and Coltrane

> Deployed to `/home/langston/AGENT_AUTHORING_GUIDE.md` and `/home/coltrane/AGENT_AUTHORING_GUIDE.md`.
> Repo copy at `comms-infra/AGENT_AUTHORING_GUIDE.md` is authoritative; edit here, then deploy.
>
> ⛔⛔ **THIS IS A PULL-ONLY DOCUMENT AND THAT IS DELIBERATE. It is NOT added to either
> agent's auto-loaded set.** Langston's loaded files were **already 2,835 B over their
> ceiling** when this capability was built (measured 2026-09-08: ceiling 143,856 B, actual
> 146,691 B, `last_status: BREACH`). Adding a page of new standing instructions to an
> always-loaded file that is already in breach would have deepened the exact problem
> `B-LANGSTON-CONTEXT` exists to fix — and it would have done so in the same week the
> ratchet was built to catch it. **Read this when you are about to write code.**

---

## 1. ⛔⛔ YOU NOW HAVE A WORKING COPY. IT IS NOT A REVIEW SOURCE.

**Langston:** `/home/langston/authoring/DawnTraderV3-agent-work`
**Coltrane:** `/home/coltrane/work/DawnTraderV3-agent-work`

⛔ **NEVER quote `path:line` from it. Not once, not "just to check".** A working copy is
stale the moment anybody pushes, and every line number in a review has to resolve at the
graded ref. ✅ **Reviewing is unchanged: read at the ref, exactly as you always have** —
`dt-review` and raw GitHub for Langston, `coltrane-review` for Coltrane.

★ **WHY THIS WARNING IS FIRST RATHER THAN LAST.** Langston's value is positional: he has no
working copy, so he cannot accidentally read one. **Handing him a working copy removes that
protection and replaces it with a rule** — which is strictly weaker, and the only honest
thing to do is say so and put the rule where it is read first.

⛔ **`git pull --rebase` BEFORE YOU START. EVERY TIME.** Four sessions push to the real repo
all day. A clone that sat overnight is a different codebase.

---

## 2. ⛔ WHERE YOUR PUSHES GO — AND WHERE THEY CANNOT GO

You push to **`kylegjordan/DawnTraderV3-agent-work`**. That is NOT the review branch.
**Pushing there deploys nothing, reaches no staging, and advances nothing.**

⛔ **YOU CANNOT PUSH TO THE REAL REPOSITORY, AND THIS IS STRUCTURAL RATHER THAN A RULE YOU
ARE BEING ASKED TO KEEP.** Your key is registered on the work repo alone. Aimed at the real
one, GitHub answers `Permission to kylegjordan/DawnTraderV3.git denied to deploy key` —
measured for both of you on 2026-09-08.
★ **This is the `DISABLED://` pattern from §7.1 again: the wrong action fails at git, not at
somebody's memory.** If you ever find you *can* push to the real repo, something is broken —
say so loudly rather than using it.

**Branch naming: `langston/<topic>` and `coltrane/<topic>`.** Do not push to
`migration/aws-supabase` in the work repo either — it is the copy everybody branches from.

---

## 3. ★ HOW YOUR WORK REACHES THE REVIEW BRANCH — a session merges it, and that is the point

1. You push your branch to the work repo.
2. **You say so in Discord, NAMING the session that should pick it up** — their name must be
   in the message or nobody wakes. Say what the branch is called, what it does, and what you
   want checked.
3. That session pulls your branch, reviews it, and merges it into the real review branch
   from their own clone.

⚠️ **THE HAND-OFF IS NOT FRICTION THAT SURVIVED FOR LACK OF A BETTER IDEA — IT IS THE
REVIEWER/AUTHOR SEPARATION.** If you wrote it, you are not the independent reader of it.
✅ **AND IT IS RECIPROCAL: the two of you can review each other.** You can both see every
branch in the work repo, so one of you writing and the other reading at the ref is exactly
the arrangement Kyle asked for.

★ **§7.1's one-direction rule is UNCHANGED by any of this, and that was a design goal rather
than a happy accident:** *"the review branch takes input from exactly ONE source: the clones
on Kyle's laptop."* You push to a different repository, and a laptop clone still performs
every push into the review branch. **Nothing in the storage rules needed amending.**

---

## 4. WHAT TO DO WHEN THE WORK IS DONE

⛔ **A pushed branch that nobody has been told about is invisible work.** The push is not the
hand-off; **the named Discord message is.**

Include: the branch name · what it changes and why · what you want the reviewer to look
hardest at · anything you were unsure about. ⚠️ **State what you did NOT check** — a fresh
reader cannot tell the difference between "verified" and "looked fine".

⛔ **Do not describe your change by quoting your working copy.** Push first, then quote at
the ref, so the reader is looking at the same bytes you are.

---

## 5. THE GIT DETAILS, once

- Remote is already set. It uses a host alias (`github-agentwork`) that selects the right
  key — **the plain `github.com` URL will offer the wrong key and fail confusingly**, because
  each of you now holds two GitHub keys and a deploy key is bound to one repository.
- Your name and email are already configured in the clone. **A commit with no identity fails
  outright on a fresh account** — nothing is inherited.
- **Commit with explicit paths** (`git commit -F <msgfile> -- <paths>`), the same rule the
  sessions follow. It is in `CLAUDE.md` rule 25 and it exists because a bare commit has
  published another session's staged work before.
- **Write a real commit message.** It is where the reasoning goes — not the Discord post,
  which scrolls away.

---

## 6. ⭐ YOU BOTH HAVE A BROWSER NOW, AND IT OPENS STAGING ALREADY SIGNED IN

**`https://188.245.193.8.sslip.io` — navigate, look, screenshot.** A real headless Chromium,
so it runs the page's own code. **`curl` returns an empty shell for every one of those
addresses** and tells you nothing: the whole app draws itself in the browser, and the
redirect to the sign-in screen happens there too. **A `200` is not a rendered page.**

⛔ **YOU NEVER TYPE INTO THE SIGN-IN FORM.** The session is handed to your browser before it
starts — the same position Kyle's own browser is in. **If you land on `/login`, the session
has expired: SAY SO and stop.** A human refreshes it with one command. Do not try to get
past it.

⚠️ **YOU ARE SIGNED IN AS THE OWNER, NOT A READ-ONLY VIEWER, AND KYLE CHOSE THAT KNOWINGLY.**
The app has no working read-only role — `#1022` measured it: 157 of 216 state-changing
routes have no permission check at all, and `requireOwner` is defined and applied to nothing.
His reasoning: *"if you guys were going to be making changes and causing problems, that would
have already happened by now... you can do much more damage in the back end than from the
front end."*
⇒ ★ **SO THE RESTRAINT IS YOURS, NOT THE SOFTWARE'S. LOOK; DO NOT CLICK THINGS THAT CHANGE
  STATE.** Reading, scrolling and screenshotting are always fine. Anything that saves,
  starts, stops, resets or submits is not yours to click unless you were asked for it by name.

✅ **SAVE A SCREENSHOT AND CONFIRM THE FILE EXISTS BEFORE YOU NAME IT.** Whoever reads your
report was not there; the image is what lets them check you. ⚠️ Page snapshots and console
logs go to `browse-output/`; **a screenshot you name goes to your working directory** — two
different places, and checking the wrong one once nearly produced a false accusation.

★ **AND USE WEB SEARCH FOR RESEARCH — the browser is for OBSERVING OUR SYSTEM.** Search
answers *what is true about the world*; the browser answers *what does this page show right
now*. ⛔ A search once answered a "look at this page" question correctly while the browser was
completely broken — a true answer from a dead instrument. **If you were asked to look, look.**
