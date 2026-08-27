# MEMORY — CC-INFRA ("Infra Claude")

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`; behaviour in `CONDUCT.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-infra`** on `migration/aws-supabase`. GitHub is source of truth; `git fetch` → pull → push; a rejected push = the system working. Tier-1 path-limited commit is mandated (`git commit -F <msg> -- <paths>`); the `guard-bare-commit` hook blocks a bare commit.

---

# ▶▶ CURRENT POSITION — READ THIS FIRST, BEFORE ANYTHING ELSE

> **A HEARTBEAT OR TIMER WAKE MEANS *RESUME*, NOT *REPORT*.** Read this block, then carry on from it.
> **If BLOCKED-ON says Kyle, say NOTHING and do not work the item.**
> ⚠️ **UPDATE THESE FOUR LINES AT EVERY STEP BOUNDARY.**

- **BATCH:** `B-TOKEN-WATCH` (working name) — a **capture-only** observation feed over newly launched DEX tokens, to test whether our ingest/filter/rank/learn method finds a separating signal. **No trading, no wallet, no execution.** Kyle: not urgent, must not disturb fee-viability, the perpetuals feed, or the pipeline audit.
- **STEP:** Langston ruled **NOT A REJECT** — he would gate a *forward observation recorder* and reject "point DawnTrader at a new market", warning the second hides inside the first. His reframe: the prize is **case-control survival machinery built on free data WITH a published answer key**, then pointed at our own strategy population (#594/#596/#597) where data is scarce and there is none. *"The machinery is what we keep."*
- **BLOCKED-ON:** **KYLE** — ⛔ the planned source is DEAD. CoinGecko API terms §6.1/§6.2 forbid storing or deriving from the data, **identically on free and every paid tier** (cache must refresh ≤24h). That forbids the dataset itself, not the tier. Recommendation put to him: read the chain direct via a commercial-use-permitted provider (Helius/Bitquery/Birdeye), which also supplies the true on-chain birth timestamp Langston's discovery-lag fix needs.
- **NEXT (on his word):** pick the access route, then the three gates — measure requests-per-day against ~20.7k launches/day (I computed supply, never demand), write the **pre-registration** before data arrives, and read `STORAGE_POLICY.md` before proposing any retention.

---

## ★ WHO I AM AND WHAT I OWN

Registered in `.claude/cc-session-roster.json` as **CC-INFRA**. Stood up 2026-07-22 to improve Langston; by 2026-08-07 it had **organically become a fourth working session** — Kyle: *"you've just organically evolved into another work session… so we need to make sure that the same rules are applied."*

**Lane:** Langston's memory/instruction/tooling architecture, `comms-infra/*`, the crew status tooling, and the personal-assistant programme. **NOT DawnTrader batch work.** Shipped: langston-recall (Phase B), B-COMMS-IMAGES, B-COMMS-IMAGES-2, B-CREW-STATUS, B-CREW-STATUS-2. Owns RUNNING_ISSUES **#651** (Langston instruction-file slim, unstarted) and **#657**; **#670** (crew-status cold hand-off) is mine and open.

## ⛔ STANDING — INSTRUCTION SOURCES (Kyle 2026-08-26)

I previously ran on my **own** rules file at `G:\My Drive\CLAUDE.md` and loaded none of the crew's. Kyle ended that: I now run from my clone and load exactly what the others load — `CLAUDE.md`, shared `MEMORY.md`, `CONDUCT.md`, and this file (via the `load-own-memory.mjs` SessionStart hook). **The repo rulebook GOVERNS; where anything conflicts, the repo wins.**

## ⚑ STANDING LESSONS (earned; do not re-learn)

- **THE INVOKE TO LANGSTON MUST `cd /home/langston` FIRST.** `sudo -u langston …` does not change directory, so the process inherits `cwd=/root`, which langston cannot read — **every Bash call dies with a bare `Exit code 1` and no output.** I did this across a whole session of consults without noticing; he disclosed it each time and reviewed anyway. Canary: demand `echo LANGSTON_SHELL_OK` back. Full form: `cd /home/langston && sudo -u langston env CLAUDE_CODE_OAUTH_TOKEN=$TOK HOME=/home/langston /usr/bin/claude -p --model 'claude-opus-5[1m]' --permission-mode bypassPermissions < PROMPT.md` — prompt on **stdin**, never `-p "$(cat …)"`.
- **NEVER hand structured text to a shell.** It has mangled a Discord post, a Python heredoc, a CLI prompt, a git commit message and a review dispatch. Write to a file → pass the path or pipe on stdin.
- **VERIFY THE ARTIFACT, NOT THE SOURCE.** Two in one hour: a text-cleanup regex whose backreference became a literal control character and silently **deleted** every bolded sentence; and a patch script that printed four success lines then died before writing, so three "landed" edits never existed. Both caught only by reading the rendered output.
- **MEASURE THE RIGHT POPULATION.** Twice now I have reported a ratio over the wrong denominator — most recently claiming "7 of 8 user turns are machine" when that was a raw-record count, not what the shipped filter admits. Langston caught it by reading my own code against my claim.
- **A VERIFICATION THAT CANNOT FAIL IS NOT A VERIFICATION.** I wrote a test asserting contamination must be zero, in a design where every route to non-zero was already closed. Langston had bounced me for that exact shape one item earlier in the same list.
- **Desktop app login ≠ CLI login** — separate credential stores; an app sign-in does not revive an expired CLI token. Anything that must survive a restart should not depend on an interactive login: use the long-lived token pattern (`/etc/langston/oauth.env`), proven since 2026-05-06.
- **`git checkout origin/<ref> -- <path>` STAGES the file.** Prefer `git show origin/<ref>:<path> > <path>` — writes the worktree, touches the index not at all.
- **Re-read issue numbers IMMEDIATELY BEFORE writing one.** Three sessions share one counter with no atomic allocation; I pushed a duplicate `#665` once (→ `#670`).

## ✅ DISCORD WAKE — ONBOARDED 2026-08-26 (Kyle lifted his own deferral)

Until today I could be **named in the channel and never woken**: `cc-wake-filter.py` carried `CC-INFRA` in its alert-owner tuple for **suppression only** and had no `NAMES` entry, which the file stated in its own comment. The roster already had me; only that registry did not. Added the three name spellings + the display name **"Infra Claude"** (the form measured on the channel — it is also the `--sender` value, and a mismatch self-wakes). Repo mirror `comms-infra/laptop/cc-wake-filter.py` synced, pushed `0bda086c8`. **Watcher armed via the Monitor tool with alias `CC-INFRA`** — never Bash `run_in_background` (MEMORY 4.5). ⚠️ **Intended side effect:** a message naming only me now SUPPRESSES for CC-A/B/C rather than broadcasting to them; it reaches them when they next re-arm.
★ **THE TESTING LESSON, which cost me two false failures:** my first two canaries returned ALL-NEGATIVE and I nearly read that as a broken fix. It was a broken TEST — the filter is driven by a multi-file `tail` and only parses lines following a `==> filename <==` header, so it never saw my input. **A positive control is what separated "the fix is wrong" from "the instrument is deaf."** All ten cases pass with one.

## ⚑ LANGSTON'S CONCEPT-REVIEW CATCHES (keep — they generalise)

- **FOUR DENOMINATORS, ONE CLAIM.** I stacked four studies (18.67M / 832,941 / 100,063 / Solidus) as if one population. The "under 2% even with a perfect filter" ceiling is a **published conditional rate on their cohort**, not a prediction about ours. Arithmetic may only compose figures sharing a denominator.
- **I COMPUTED SUPPLY AND NEVER DEMAND.** Quoted the rate limit as the cost model; ~**20.7k launches/day** is what actually sets cost, and tokens-per-request was unstated. Pre-code gate.
- **IT IS LEFT-TRUNCATION, NOT SURVIVORSHIP** — and the name changes the fix. We see a token only once the feed notices it; with 68.67% dying on day one that removes a large *non-random* slice, and "size at birth" (the strongest predictor, HR 4.51) silently becomes size-at-discovery. Fix: record BOTH the on-chain creation time and first-sight time — the gap is a measured bias, not an unknown one. Plus a positive control on daily indexed count vs an independent count.
- **DON'T TUNE THE SCHEDULE TO THE BUDGET** — that makes coverage "whatever we could afford". Census on birth, case-control on follow-up (100% trait-carriers + a fixed random control), a **fixed** observation grid so cohorts pool, death defined ex ante.
- **ONE BATCH THEN ZERO DRIP.** His cost constraint is Kyle's attention, not API calls: stand it up, then nothing until a stated readout date. Iterating means it was not cheap.

## 📌 OPEN THREADS

- **B-CREW-STATUS-2 remainder — PARKED at Kyle's direction (2026-08-26).** Built and live: turn classification (structural, `origin.kind` + tag-shape + compaction flags), trailhead spans, containment-based attribution, the synthesis briefing on `sonnet` with evidence caching + a 15-minute floor. **Unbuilt:** persist-derived-facts-at-observation (the one with real consequences — compaction and reflog expiry destroy provenance that cannot be rebuilt later), blocked-on-Kyle sort key, the unknown-tag and rate-anomaly canaries, the SIM entry, Langston Step-4 review and Step-8 close.
- **#651 B-RULES-1E-LANGSTON-SLIM** — Langston's instruction-file restructure (lean core + on-demand modules + ledger split). Transferred to me by CC-A. **NOT STARTED**; Kyle has not given the go.
- **#670** — crew-status snapshots have no cold hand-off; warm tier grows unbounded (~18 MB/yr gz, policy-conformance not capacity).
- **Langston runs `claude-opus-5[1m]`** at two sites — read them live, never assert the value here (`discord-langston-bridge.py:69`, `langston-call:38`). Change BOTH or he runs split.

## ✅ CLOSED — repo is authoritative

- **B-CREW-STATUS** (2026-08-07) — the first board. Superseded in substance by B-CREW-STATUS-2 and by CONDUCT.md's per-step summaries.
- **B-COMMS-IMAGES / -2** — two-way Discord images for all sessions including Langston.
- **Langston Phase B** — `langston-recall` over `/opt/langston-memory/`, nightly index 04:10Z, refuses on degraded corpus.
