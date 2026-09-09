# Coltrane's browser — how it is built, and the two things that fooled a test

> Repo copy is authoritative. Live registration: `codex mcp get browser` as the `coltrane` user.

## What it is

A real headless Chromium, driven through the Playwright MCP server, registered as a Codex
tool called `browser`. Coltrane gets `browser_navigate`, `browser_snapshot`,
`browser_take_screenshot`, clicking and typing — the same shape of tools a Claude session
has in Chrome.

- server: `@playwright/mcp@0.0.80` (pinned), launched via `npx` per invoke
- browsers: `/opt/playwright-browsers` (658 MB, world-readable), `PLAYWRIGHT_BROWSERS_PATH`
- flags: `--browser chromium --headless --isolated --no-sandbox --viewport-size 1440,900`
- artifacts: `--output-dir /home/coltrane/browse-output`

## ⛔⛔ THREE THINGS THAT LOOK LIKE THEY WORK AND DO NOT

**1. `--browser chromium` IS REQUIRED, and its absence fails late.** The MCP server defaults
to branded Google Chrome at `/opt/google/chrome/chrome`, which is not installed and is NOT
what `playwright install chromium` puts on disk. Without the flag every navigation dies with
`Chrome is missing`, long after registration reported success.

**2. AN MCP TOOL CALL RAISES AN APPROVAL REQUEST, AND HEADLESS DEFAULTS TO REFUSING IT.**
Measured: three navigations in a row returned *"MCP tool call requires approval, but approval
policy is never"*. The fix is `--approve-for-me`, which **cannot be combined with `-s`** —
codex refuses the pair. ⇒ the invoke line dropped `-s workspace-write` for it.
★ **The sandbox fence was RE-PROVED under the new flag rather than assumed to survive it** —
identical results: home read-only, `/etc` read-only, `cat /etc/langston/oauth.env` denied,
memory store writable. The refusals are the OS sandbox; the approval layer sits above it.

**3. A WEB SEARCH ANSWERS BROWSER QUESTIONS CORRECTLY WHILE THE BROWSER IS BROKEN.** Asked to
open `example.com` and report the heading, the agent returned the right heading **from a web
search**, at a moment when the browser could not start at all. The transcript said
`web search:` where it should have said `mcp: browser/…`.
⇒ **Verify by an ARTIFACT ONLY A BROWSER PRODUCES** — a screenshot file, a rendered page
snapshot, a console log. A correct answer is not evidence that the instrument ran.

## ⚠️ THE ARTIFACT PATHS ARE NOT THE SAME PATH

Snapshots and console logs land in `--output-dir`. **A named screenshot lands in the agent's
WORKING DIRECTORY** (`/home/coltrane/work`). Infra Claude checked `browse-output`, saw no
images, and was one sentence from reporting that Coltrane had invented two filenames. **Both
files existed, one directory away.** `wrong-object`, on the reviewer rather than the agent.

## ⛔ THE STAGING UI IS BEHIND A LOGIN AND COLTRANE HAS NO ACCOUNT

Every staging route redirects to `/login` in a real browser. `curl` returns `200` for those
same URLs because the server hands back the single-page app's empty shell — **the redirect
happens in JavaScript, so only a browser sees it.** A status code is not a rendered page.

⇒ **Coltrane can browse the open internet and can reach staging, but cannot verify any
authenticated screen.** `CLAUDE.md` §7 makes that a hard boundary: a session may not type a
password into a form, and no session may log in with the staging credentials. Extending that
is Kyle's call, not this file's.
