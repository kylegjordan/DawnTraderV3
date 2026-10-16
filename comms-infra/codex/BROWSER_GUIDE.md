# Coltrane - using the browser and web search

Moved out of your auto-loaded `AGENTS.md` on 2026-10-16 (`B-LANGSTON-RELIEF` OBJ-4) so that file fits its
size ceiling; nothing here was dropped. Your `AGENTS.md` keeps the three rules you need even if you read
nothing else, and points here. **Read this before you drive the browser.**

- ⭐ **A REAL BROWSER — you can open pages, click, and take screenshots.** Tools named
  `browser_navigate`, `browser_snapshot`, `browser_take_screenshot` and friends. It is a
  real headless Chromium, so **it runs the page's JavaScript** — which is the whole point:
  our staging app is a single-page app, and `curl` returns only an empty shell that renders
  nothing.
- ⭐ **WEB SEARCH — use it freely for RESEARCH, and prefer it over the browser for that.**
  Looking something up, checking a library's current version, reading how an API behaves,
  finding what other people hit: **search is the right instrument and it is much cheaper
  than driving a browser around.** Kyle asked for this explicitly. **Cite the source.**

★ **THE DIVIDING LINE, because getting it wrong is not a style question:**
  **SEARCH answers "what is true about the world."** **THE BROWSER answers "what does THIS
  page actually show right now."** Anything about OUR system — a deployed screen, a number
  on a dashboard, whether a change is live — is the second, always.
  ⛔ **AND THIS EXACT CONFUSION ALREADY FOOLED A RUN.** Asked to open a page and report its
  heading, the first attempt answered **from a web search** — correctly — at a moment when
  the browser was completely broken and had never started. **The answer was true and the
  instrument was dead**, which is the hardest failure to catch.
  ⇒ **If you were asked to LOOK at a page, use the browser, and if it fails SAY IT FAILED.**
  Never let a search stand in for an observation of our own system.
  ✅ **ALWAYS SAVE A SCREENSHOT AND REPORT ITS FULL PATH**, so what you claim to have seen
  can be checked against the image by someone who was not there.
  ⚠️ **THE TWO OUTPUTS GO TO DIFFERENT PLACES, AND THE MISMATCH HAS ALREADY CAUSED A FALSE
  ACCUSATION.** Page snapshots and console logs go to `/home/coltrane/browse-output/`;
  a **screenshot you name goes to your WORKING DIRECTORY**. Infra Claude checked
  `browse-output`, found no images, and was one sentence away from reporting that you had
  invented the filenames — the files existed the whole time, one directory away.
  ⇒ **Report the path you can `ls`, not the path you assume.**
  ✅ **YOUR BROWSER OPENS STAGING ALREADY SIGNED IN** (Kyle's ruling, 2026-09-09) — the same
  position his own browser is in. You can verify any deployed screen: navigate, look, report
  what is actually rendered. **`https://188.245.193.8.sslip.io`**
  ⛔ **YOU STILL NEVER TYPE INTO THE SIGN-IN FORM.** The session is handed to your browser
  before it starts. **If you ever land on `/login`, the session has expired — SAY SO and
  stop.** Do not try to get past it; a human refreshes it with one command.
  ⚠️ **WHO YOU ARE SIGNED IN AS (corrected 2026-10-16).** Until 2026-10-15 the shared crew login was an
  ADMIN, so you were signed in as the owner. `B-CREW-ACCESS-HARDEN` P2 removed that: the crew login is now a
  **non-admin editor** (`#1092`). Admin-only screens such as Settings > Users will refuse you, and that refusal
  is correct. **The restraint is still yours, not the software's: LOOK, DO NOT CLICK THINGS THAT CHANGE STATE.**
  Reading a page, scrolling and screenshotting are always fine. Anything that saves, starts, stops, resets
  or submits is not yours to click unless you were asked for it by name.
