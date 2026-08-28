# MEMORY — CC-INFRA ("Infra Claude")

> Per-session volatile state. Shared protocols in `MEMORY.md`; stable governance in `CLAUDE.md`; behaviour in `CONDUCT.md`. Cap 200 lines / ~24KB — watch BYTES; collapse closed batches to one-liners.
> **★ I WORK IN MY CLONE: `C:\DawnTraderV3-infra`** on `migration/aws-supabase`. GitHub is source of truth; `git fetch` → pull → push; a rejected push = the system working. Tier-1 path-limited commit is mandated (`git commit -F <msg> -- <paths>`); the `guard-bare-commit` hook blocks a bare commit.

---

# ▶▶ CURRENT POSITION — READ THIS FIRST, BEFORE ANYTHING ELSE

> **A HEARTBEAT OR TIMER WAKE MEANS *RESUME*, NOT *REPORT*.** Read this block, then carry on from it.
> **If BLOCKED-ON says Kyle, say NOTHING and do not work the item.**
> ⚠️ **UPDATE THESE FOUR LINES AT EVERY STEP BOUNDARY.**

- **BATCH:** `B-TOKEN-WATCH` — **capture-only** observation feed over new Solana token launches. Builds case-control survival machinery WHERE A PUBLISHED ANSWER KEY EXISTS before pointing it at #594/#596/#597 where there is none. **No trading, no wallet, no execution.**
- **STEP: 6 of 11** — deploy. ⛔⛔ **THE HOST CHANGED 2026-08-28 — KYLE OVERRULED THE HELSINKI-ONLY FENCE. IT DEPLOYS TO STAGING (`188.245.193.8`).** His reason, and it defeated my argument: *"add this to staging just like we're doing with the perpetual futures… we're storing everything, but we're not trading on it."* **The precedent is real — `server/services/passive-archive/` runs four capture-only legs on that box** (`crypto-perp-archiver.ts:8-11` says CAPTURE ONLY in its own header). Step 5 CLOSED: CI 4/4 green run `33182142814`.
- **NEXT STEP: 7 of 11** — first-pass verification. ⛔ But Phase 3 (the 72h proving run + the shed-order injection) comes first, and Phase 4 (the staging page) is gated behind that.
- **BLOCKED-ON:** ⛔ **NOTHING — KYLE DELEGATED THE DECISION 2026-08-28:** *"I'll let you and Langston decide what is best for the system. iterate to consensus and then implement whatever you guys agree on."* ⇒ **iterate with Langston, reach consensus, IMPLEMENT. Do not come back to Kyle unless it is a true deadlock.**

> ⛔⛔ **THE TRANSPORT IS SETTLED AND DEPLOYED (see Step-6 below). DEAD BRANCHES, WITH CITATIONS — DO NOT RE-DERIVE:** cloudflared named tunnel needs **a ZONE** and **Kyle does not own `dawntrader.com`** (*"don't try and log in there or do anything with that particular site"* — leave that host alone) · Tailscale Funnel needs no domain but **joins the box to a mesh** (`--accept-routes`/`--advertise-exit-node`) — disqualified · **Helius WebSocket filters by ADDRESS, not transaction type**, so it delivers 43.2M/day; even excluding failed txns leaves ~7.3M/day vs a 33k/day tier — **§9.4 disposition (5), WITHDRAWN.** ★ **I argued for Helsinki for three rounds and had it BACKWARDS: staging already serves `:443` publicly, so this is a new path on an already-public proxy, while Helsinki would have meant the FIRST non-SSH port on the box running Langston + crew comms.**
> ⛔ **"HMAC" IS WITHDRAWN — Helius sends a STATIC `authHeader` VALUE.** No digest, nothing covers the body ⇒ **replayable, no body integrity.** ★ **Which is why the append-only raw-payload + provenance store is the PRIMARY control, not a backstop** (Langston: *"secret prevents; provenance recovers"*).
> ⛔ **THE ARCHIVER PRECEDENT DOES NOT COVER THE FILESYSTEM — `DATABASE_URL` is Supabase, so THEIR bytes never land on this disk and OURS DO.** Hence the 8 GiB store cap. And **nginx rate limiting is scoped to `location /api/` only — a new location inherits NOTHING**; the **"X-Forwarded-Proto allowlist" is NOT an allowlist** (`map` with `default $scheme`) — never list it as a control. `client_max_body_size 10M` IS server-level and inherits free.
> ⚠️ **`0.0.0.0:5000` is bound on staging but I MEASURED IT UNREACHABLE from outside** (ufw allows only 22/80/443) — defence-in-depth, not a live hole. Homed to a `B-SEC-HARDEN` follow-on, **owner CC-A**, not mine.
> ⚠️ **MY `PART G` STILL CONTRADICTS ITSELF — CORRECT THE BODY, DO NOT STACK A NOTE.** It rejected pull-based delivery because *"a new public listener is a security-surface change this batch has no business making."* The narrower true reason: it would add a SECOND surface.

> ⛔⛔ **WHY THESE LINES NOW CARRY STEP *NUMBERS*, AND IT IS THE FIX FOR A REAL FAILURE (2026-08-28).** This block used to end with a prose to-do list reading *"scope → Langston Step-1; **then build**"* — **which is step 1 → step 3, with step 2 silently absent.** I wrote it, it auto-loads FIRST on every start and compaction, and it is read as *where I am*, while `CLAUDE.md` §0.a is a table of addresses I must choose to consult. **When the two disagreed, the specific private list beat the generic public rule, and nothing compared them.** ⇒ **A prose next-step can skip a step invisibly; a NUMBER cannot** — 1 → 3 is visible on its face. **Never write a prose next-step here again.**

**KYLE'S RULINGS 2026-08-28 (in `B_TOKEN_WATCH_PRE_AUDIT.md` PART E):** (1) **AMENDMENT 3 WITHDRAWN — the observation grid does NOT change**; the aging display uses only the ages we already observe (3d/7d/30d/90d). The gate with a closing window no longer exists. (2) **The tracking page PROCEEDS** — his reason is operational and the audit missed it: *a collector with no visible surface is unfalsifiable for 90 days.* **His constraint is stronger than mine — the study's files live in THEIR OWN FOLDER**, so the fence is a path rather than a judgement. **Irreducible footprint = TWO LINES in two existing app files** (one route, one menu entry) plus a self-contained folder. (3) **The Helsinki Drive mount should be REMOVED, not watched.**

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
- ⛔ **A FIX RELOCATES THE DEFECT MORE OFTEN THAN IT REMOVES IT — MEASURED, TWICE IN ONE BATCH.** I fixed an algebraic cancellation by writing a second one, and fixed an index assumption by replacing it with a first-match assumption. **The correction is written by the same session, in the same context, that produced the error, so it inherits the belief that caused it.** ⇒ **every correction goes back to a FRESH reader, and the reader must be able to reach the OBJECT.** Kyle's standing authorisation, 2026-08-28: spin up second readers whenever needed, no case-by-case permission.
- ⛔ **A TEST THAT WRITES THE STATE IT ASSERTS ON PROVES ONLY THAT THE FUNCTION WORKS.** Langston: *"your tests test the function; nothing tests the connection."* 57 checks passed while nothing in production ever charged a birth. ★ **And the suite I wrote to fix that then tested the fold by CALLING IT — the same shape one function further down.** The test must drive a PRODUCTION entry point and assert on state that entry point had to reach.
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

## ✅ B-TOKEN-WATCH — STEPS 1-5 CLOSED, DO NOT RE-DERIVE (repo is authoritative)

**Step 1 APPROVED** (3 conditions) · **Step 2 APPROVED** (3 blockers) · **Step 3 built** · **Step 4 APPROVED at r3** `3c6e6ced3` after r1/r2 CHANGES-NEEDED · **Step 5 CI 4/4 green** run `33182142814`. Docs: scope, pre-registration (**append-only, AMENDMENTS 1-4**), `B_TOKEN_WATCH_PRE_AUDIT.md` (PARTS A-H), change list refreshed at the approved ref.

## ▶ WHERE STEP 6 ACTUALLY IS (pushed `17713672b`; **172 checks / 6 suites**, was 141/5)

✅ **BUILT + WIRED + MUTATION-PROVED — `liveness.py`, the dead-man's switch.** Langston's catch. **`receiver.py` claimed "nothing here can detect" a dropped push; that was FALSE IN HALF** — partial loss is genuinely undetectable (OBJ-3's job), **total stop is detectable NOW at zero credits** because 20,700/day = 0.24/s makes a silent window a Poisson impossibility. ⛔ **It counts RECORDED CENSUS ROWS, never POSTs** — so it also catches judgement-call #3 (a parse failure answering 200 forever looks healthy). **Writes GAP RECORDS (start/end) to `provenance/gaps.jsonl`**, turning unknown loss into excludable loss. **Two legs**: retrospective (inter-arrival, sees a gap that opened AND closed between hourly checks) + prospective (still-down, which retrospective structurally cannot see). **Runs BEFORE and OUTSIDE the lock** — inside it, a stuck lock would silence the watchdog. **Cutting the call fails 3 wiring checks.**
⚠️ **AND MY FIRST MUTATION RUN LIED: "0 failures" was a patch that never matched, not a surviving mutation.** Verify the mutation APPLIED before reading its result — mutate **by line number**, never by a string containing escapes.

✅ **THE ENDPOINT IS DEPLOYED AND LIVE ON STAGING** (`e0ddfa437`; **205 checks / 7 suites**). **URL: `https://188.245.193.8.sslip.io/token-watch/webhook`** → nginx `location` (own `limit_req` zone `tokenwatch`, 20r/s ≈ 83× the 0.24/s mean, **never `api`**) → `127.0.0.1:8797`.
- **User `tokenwatch`** (uid 996, no supplementary groups). **VERIFIED BOTH WAYS: it cannot read `/home/deploy/dawntrader/.env` nor traverse `/home/deploy`; `deploy` cannot read `/etc/token-watch/webhook.env`** (640 root:tokenwatch). Store `/var/lib/token-watch` 750.
- **Unit hardening APPLIED, not just declared** — `systemctl show`: `MemoryMax=536870912`, `TasksMax=64`, `CPUQuotaPerSecUSec=500ms`, `ProtectSystem=strict`. **Negative control: a write outside `ReadWritePaths` returns "Read-only file system."** `IPAddressDeny=any` + loopback-only.
- **CONTROLS RUN FROM OUTSIDE THE HOST:** wrong credential → **401**, absent → **401**, **both logged** with reason/IP/body-hash (never the body). Correct credential → **200 `{"recorded":1}`**, census row read back (2.5 SOL, `feePayer_sole_transfer`, both timestamps, lag 2.03s, `trait_carrier`), raw body in the provenance store **with the real source IP forwarded through both proxy hops.** ⛔ **Synthetic data then archived to `/root/token-watch-control-evidence-2026-08-28` and the store RESET to 0 files** — the census must not open with an invented row.
- ⛔ **THE TRADING APP WAS UNTOUCHED THROUGHOUT — restart count 584 before and after, site + API still 200 after the nginx edit.** Receiver RSS 11.7 MB vs the 512 MB cap; store 44K; disk 37G free.
- **Timers armed** (hourly follow-up, daily tier). First pass ran; the switch correctly **refused to manufacture a gap on an empty census and said so.**

⛔ **NEXT: Phase 3 proving run (72h + deliberate shed-order injection) — but the feed is NOT pointed at us yet.** The Helius webhook must be created against the URL above with the secret from `/etc/token-watch/webhook.env`. Then **Phase 4, the staging page** (Kyle: own folder; irreducible footprint = two lines in two existing app files).
⚠️ **`#926` REPRODUCED EXACTLY: the push guard is a PreToolUse hook, so it inherits the SHELL's cwd from the PREVIOUS call — a `cd` inside the same command is too late.** It ran tsc from `token-watch/` and reported 214 false drops. **Fix: `cd` to the repo root in its OWN Bash call before any push.**

★ **THREE FRESH-READER ROUNDS, CAPPED, DID NOT CONVERGE — each found more than the last.** The decisive result: **four defects the code's own comments called FIXED could each be reverted with all 116 checks still green.** `tests/test_mutations.py` exists for that and asks a different question from the other suites — not *does it work* but ***would we notice***.

**FILED, ALL PLACED AT THE PHASE-19 TAIL, NO DATES (§9.4):** `#920` `dt-review grep` silent zero · `#921` no detector for a wedged Helsinki mount (**re-aimed: REMOVE the mount, Kyle**) · `#924` two ungoverned SSH keys reach the `deploy` account (investigation Phase-19 end, remediation §20.4 beside `#110`) · `#926` push guard reads the shell's cwd · `#931` the fresh-reader loop could not fire · `#932` burn thresholds are fractions of the CAP while the plan consumes 99.3% of it — **level separates spending from not-spending, never on-plan from off-plan.**

⚠️ **`#932`'s remedy is a SCOPE DECISION, not a fix** (recommendation: project against the plan pro-rata). It does not touch the spend gate, which is independently bounded and injection-tested.

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
