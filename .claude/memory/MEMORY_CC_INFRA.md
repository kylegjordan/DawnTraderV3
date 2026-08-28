# MEMORY — CC-INFRA ("Infra Claude")

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`; behaviour in `CONDUCT.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-infra`** on `migration/aws-supabase`. GitHub is source of truth; `git fetch` → pull → push; a rejected push = the system working. Tier-1 path-limited commit is mandated (`git commit -F <msg> -- <paths>`); the `guard-bare-commit` hook blocks a bare commit.

---

# ▶▶ CURRENT POSITION — READ THIS FIRST, BEFORE ANYTHING ELSE

> **A HEARTBEAT OR TIMER WAKE MEANS *RESUME*, NOT *REPORT*.** Read this block, then carry on from it.
> **If BLOCKED-ON says Kyle, say NOTHING and do not work the item.**
> ⚠️ **UPDATE THESE FOUR LINES AT EVERY STEP BOUNDARY.**

- **BATCH:** `B-TOKEN-WATCH` (working name) - **capture-only** observation feed over new Solana token launches. Tests whether our ingest/filter/rank/learn method finds a separating signal, and builds case-control survival machinery WHERE A PUBLISHED ANSWER KEY EXISTS before pointing it at our own strategies (#594/#596/#597) where there is none. **No trading, no wallet, no execution.**
- **STEP: 2 — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN, IN PROGRESS.** ⛔ **I had gone STEP-1-APPROVED -> BUILD and skipped 2 entirely; KYLE CAUGHT IT 2026-08-28.** Step 1 CLOSED: scope r3 + pre-reg AMENDMENT 1 + AMENDMENT 2 + `#920` pushed at `8c5412f38`; Langston APPROVED with three conditions, all discharged in that commit.
- **BLOCKED-ON:** Nothing. Proceeding with Step 2.
- **NEXT, in order:** (1) the merged Step-2 document `B_TOKEN_WATCH_PRE_AUDIT.md` — audit FIRST, plan falls out of it, every plan item back-referencing its finding, six sources named, §9.5(a) census at every hop; (2) Langston signs off ONCE on both; (3) then Step 3 build.
- ★ **NEW SCOPE, KYLE 2026-08-28 — A TRACKER PAGE ON THE STAGING SITE (OBJ-10), built AFTER the collector is proven, but part of this study.** Three panels: aggregate of everything launched; aggregate of survivors with an aging tracker (5/15/30/45/60/75/90 days); the same aging for the dead showing WHERE they died; then a table of the oldest 100 survivors still alive.
  ⛔ **THIS COLLIDES WITH LANGSTON'S OWN FENCE AND MUST NOT BE SLID IN QUIETLY.** §0 of the scope says host on Helsinki, NOT the trading box, and its testable clause is *"if any live-path file appears in this batch's diff, the change class is wrong."* A staging page puts files in the trading app. **The fence needs an EXPLICIT NARROW AMENDMENT at Step 2, argued to Langston — never a silent breach.** My recommended shape: the collector publishes a small pre-aggregated summary from Helsinki; the page only renders it. **No study data in the trading database, no query load on the trading box, no engine contact.**

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

## B-TOKEN-WATCH - THE VERIFIED DESIGN (measured 2026-08-27; do NOT re-research)

**COINGECKO / GECKOTERMINAL IS DEAD FOR THIS.** Their terms 6.1/6.2 forbid storing or deriving from the Data **identically on free and every paid tier** (any cache must refresh within 24h). That forbids the DATASET, not the tier. Langston made licensing a pre-code gate; without it the build would have finished and then been unusable.

**THE TWO-SERVICE SPLIT - Kyle-approved 2026-08-27, total cost $0/month:**
- **BIRTHS -> Helius.** Key at `C:\Users\kyleg\.claude\.helius-key` (Kyle pasted it knowingly and accepted the risk; rotate from his dashboard if that changes). Webhook filtered to creation events. **VERIFIED on a real token: a creation parses as `type: CREATE, source: PUMP_FUN`** - creations ARE separable from the noise, and that single fact is why this is viable. ~20,700 launches/day at 1 credit = **621k/month of the 1M free tier**.
- **FOLLOW-UPS -> DexScreener.** Free, **no account or key at all**, 300 req/min (432k/day) against our ~19k/day need. **Terms READ, not assumed: commercial use explicitly permitted and NO storage or derivation prohibition** - materially unlike CoinGecko. One call returns alive / price / 24h volume / buy+sell counts / creation time together; verified live on a real pre-graduation token.
- **SPARE 379k Helius credits/month (12,633/day) -> THE LIQUIDITY GAP** (Kyle's call). DexScreener returns **liquidity: None** for pre-graduation tokens (bonding curve, not a standard pool), so pool depth is read on-chain for tokens under active follow-up. Liquidity being pulled is the clearest rug signal, so this is not optional colour.

**MEASURED LIVE AGAINST THE CHAIN (the gate Langston set, now discharged):** the launchpad program runs **500 txns/sec = 43.2M/day, 83% of them FAILED** (bot competition). Launches are **~0.05% of that traffic**. Unfiltered ingestion is impossible at EVERY tier - 43M/day against 33k/day free, and still ~6x over the $999 tier. Everything hinged on server-side filtering, which is why the CREATE verification was the decisive test rather than a detail.

**RESIDUAL, NAMED:** DexScreener needs no key, so there is no guaranteed service. If it throttles or changes, fall back to chain-direct on the spare Helius allowance - that headroom is the fallback as well as the liquidity budget.

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
