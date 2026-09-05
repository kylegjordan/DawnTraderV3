# LANGSTON — build, architecture, and operating envelope

> **What this is:** the single description of how the independent reviewer is built and how he operates. **Kyle-requested 2026-07-24**, because this changes over time and was previously scattered across `CLAUDE.md` §6/§8, the Discord findings list, and several batch reports.
>
> **★ LIVING DOCUMENT — maintenance rule.** Update it whenever **his build changes**: model, runtime version, how he is invoked, how he reads code, what he can and cannot touch, his auth, or his files. Do **NOT** log per-batch review activity here (that belongs in batch reports). **When you change something, record what it was before and why it changed** — every rollback we have ever needed was found by reading the "before".
>
> **Companion:** `BUILD_METHOD_PLAYBOOK.md` describes the *method* portably (role-based, for reuse elsewhere). **This file is the concrete DawnTrader instance.** `CLAUDE.md` §6/§8 remain the binding comms rules.
>
> **All facts below were read off the live host on 2026-07-24, not from memory.**

---

## 1. WHAT HE IS — and the boundary that makes him worth having

**Role: senior PM + code-level reviewer. The independent check on work he did not do.** He rules at three gates: the scope (before work starts), the actual diff (before it advances), and staging verification (after deploy).

★ **He reviews and NEVER implements, and never pushes.** This separation is the entire product. An author cannot see their own blind spot; the moment the reviewer starts writing code, the review becomes a second opinion from the same head.

★ **The never-push rule is ENFORCED, not trusted (2026-07-23).** He has no working copy that could push, and the one repository he can reach has its push URL set to a deliberately invalid `DISABLED://…` value. A push from him fails at the tool, not at his good behaviour.

★ **He is also a peer, not a rubber stamp.** He is expected to push back on the implementing session *and on Kyle*, with reasons. Several of the most load-bearing corrections in this project came from him refusing a plausible answer.

---

## 2. WHERE HE RUNS

| | |
|---|---|
| **Host** | Hetzner CPX22, `204.168.141.77` (Helsinki), hostname `dawntrader-agent` |
| **OS / kernel** | Ubuntu 24.04, Linux 6.8.0-107 |
| **Disk** | 75 GB, ~17 GB used (24%) |
| **User** | `langston`, home `/home/langston` |
| **Separate from** | the staging/trading server (`188.245.193.8`, Falkenstein). **Deliberately a different machine** — the reviewer must not share a failure domain with the thing under review. |

---

## 3. RUNTIME

| | Current | Notes |
|---|---|---|
| **Harness** | Claude Code **2.1.261** | ⚠️ **READ IT LIVE, NEVER FROM THIS CELL: `sudo -u langston /usr/bin/claude --version`.** Upgraded 2026-09-04 from **2.1.159** (which had sat since 2026-06-01, ~100 releases behind). Global npm at `/usr/lib/node_modules/@anthropic-ai/claude-code`; node 22.22.1 satisfies the `>=22.0.0` engine. **Rollback: `npm install -g @anthropic-ai/claude-code@2.1.159`.** Prior 2026-06-01 upgrade fixed a thinking-block error on tool use with the 1M variant. |
| **Model** | **`claude-opus-5[1m]`** (Opus 5, 1M context) — switched 2026-07-27 | Set by `--model` at **TWO live sites** (see below). Previously `claude-opus-4-8[1m]` (2026-06-13 → 07-27), which Anthropic now lists as **legacy** with an explicit migrate-to-Opus-5 recommendation; Opus 5 is same price ($5/$25 per MTok), same 1M context, newer knowledge cutoff (May 2026 vs Jan 2026). Before that Fable 5 (2026-06-09 → 06-13) until that access was retired |
| **★ Model is set at TWO sites — switch BOTH or he runs split** | (1) `/opt/discord-bridges/discord-langston-bridge.py:69` `CLAUDE_MODEL` — the Discord conversational path; (2) `/usr/local/bin/langston-call:38` `MODEL` — the generic invoker used by the **alert/queue** path (accepts a `--model` override) | Discovered by census at the 2026-07-27 Opus-5 switch; the older docs named only the bridge. Switching only one leaves the bridge on the new model and alerts/queue on the old — a silent split that reads as reasoning drift, not config drift. **Any future model switch must census both.** |
| **Auth** | OAuth token at `/etc/langston/oauth.env`, mode `640 root:langston` | ⏳ **Valid ~1 year from issue — rotate by 2027-04** via `claude setup-token`. This expires silently; put it on a calendar |
| **Permission mode** | `bypassPermissions` | An `acceptEdits` mode previously hung his worker on tool use |
| **Invocation timeout** | 900 s (15 min) | A review exceeding this returns a timeout message rather than hanging forever |
| **Working dir / HOME** | `/home/langston` | |

★ **Verify a model change with a one-off live invocation BEFORE flipping the bridge**, and snapshot a rollback copy. The app's model dropdown **lists models that are retired and will error** — "listed" is not "working". Confirm two ways: the official docs/news, *and* a live test call.

---

## 4. HIS FILES

⛔⛔ **THIS SECTION NAMES WHERE TO READ EVERY LIVE VALUE. IT DOES NOT STATE ONE, AND THAT IS THE RULE, NOT A STYLE CHOICE.**
⚠️ **MEASURED 2026-09-05 (`B-LANGSTON-CONTEXT`, `#1007`): the table here USED to assert *"~55 KB"*, *"~38 KB"* and *"Kept ≤200 lines."* All three were wrong.** The `MEMORY.md` figure understated the live file by **56%**, and the line rule had been **RETIRED by Langston on 2026-07-28** in favour of a bytes-first cap — because the line rule had once been satisfied by packing 5.8 KB onto a single line while the file read as compliant.
★ **CITING THE RETIRED RULE DID NOT MERELY MISLEAD, IT UNDERSTATED A BREACH BY MORE THAN HALF.** Same class as the model line that was wrong for 17 days. ⇒ **a governance document may name a file, a tool and a command; it may never name a size.**

| File | What it is | Read its live size with |
|---|---|---|
| `/home/langston/CLAUDE.md` | His persona, rules and role. **Auto-loads on every invocation.** ⚠️ **The LARGEST of the three, and it has never been governed by any size rule at all.** | `langston-size-watch --status` |
| `/home/langston/MEMORY.md` | His volatile state, mirroring the project's. **Auto-loads** via the `@MEMORY.md` import in his `CLAUDE.md`. ⚠️ **Grows BY DESIGN** — his §10.b mandates an append at every batch close, with no delete rule. | `langston-size-watch --status` |
| `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md` | The **index** of his self-memory store (next block). **Auto-loads** as the harness auto-memory index. | `langston-size-watch --status` |

★ **THE THREE ABOVE ARE THE *ALWAYS-LOADED SET*, AND WHAT IS CAPPED IS THEIR SUM (`#1007`).** The ceiling **may only ever DECREASE**; any batch touching any of them leaves the total at or below what it found. ⛔ **NEVER restate that cap per-file — a per-file cap is satisfiable by SPLITTING a file while the loaded total is unchanged, which is exactly why Langston rejected a per-file number.**
✅ **The live ceiling and total are held in `/opt/langston-memory/usage/ratchet-state.json` and read with `langston-size-watch --status`.** A daily timer measures them and alarms on a breach; `--set-ceiling` **REFUSES to raise the value**, so the monotonicity fails at the tool rather than at somebody's discipline.
✅ **Whether the three actually REACH him — as opposed to merely existing at the right size — is a different question with its own instrument: `langston-load-canary`.** It asks him to reproduce facts only present in those files, with tools denied, alongside a decoy question about a file deliberately NOT auto-loaded; if the decoy is answered the run is VOID rather than passing. **First run 2026-09-05: `LOADED`.**

### ⭐ HIS OWN DECISION STORE — he built it unprompted, and it is not a governance artifact

`/home/langston/.claude/projects/-home-langston/memory/` — **started 2026-05-07, the day after he came online, and still being written to.** Nobody asked him for it.
★ **Its entries are not notes: each carries the incident, a `Why:`, a `How to apply:` and `[[wiki-links]]` to related rulings.** They are **re-usable decisions**, which is what makes this the most valuable artifact on the box — and, until 2026-09-05, the least protected: **one manual snapshot, taken by hand, with nothing scheduled to ever take another.**
✅ **NOW BACKED UP DAILY AND VERIFIED BY REPRODUCTION** — `langston-selfmemory-backup` (timer 05:20 UTC) writes an archive to `/root/backups/langston-selfmemory/`, **extracts it again and compares sha256 of every member against the live file**, and DISCARDS any snapshot that fails while leaving older ones untouched.
⛔ **REPRODUCTION, NOT COMPARISON, AND `CLAUDE.md` §7.1 SAYS WHY: comparing refs "certified an EMPTY backup four times."** The verifier is mutation-proved — it rejects a missing member, a corrupted member, and an empty archive.
✅ **He can enumerate the backup HIMSELF: `/opt/langston-memory/usage/selfmemory-backup-manifest.md`,** which is langston-readable by design. **He is stateless and cannot remember that a backup exists; a manifest he cannot open is, from where he sits, a backup that does not exist.** It carries a generation stamp, because a quiet job and a dead job look identical without one.
⚠️ **RESIDUAL, NAMED NOT GLOSSED: the store still has NO cap and NO eviction rule.** ⛔ **When one is written it must EVICT BY SUPERSESSION, NEVER BY AGE** — a 2026-05 ruling that still governs is worth more than a 2026-09 note about a batch that closed, and an age rule deletes exactly the wrong one. That work is `B-LANGSTON-FILE-FLOOR` (`PHASE_19_PLAN` row 2.8a).

★ **Keep his `CLAUDE.md` and `MEMORY.md` in sync with the project's rules when comms protocol, his role, or sequencing changes.** His memory auto-loads on every call — stale memory means a wrong baseline on the next review.

⚠️ **NEVER stage a copy of the project's rulebook or his persona into his home directory.** Two such copies were found and deleted 2026-07-10, including a user-global one the harness had been silently prepending to his real rules **for two months**.
⛔ **AND NEVER ADD A FILE TO THE AUTO-LOADED SET WITHOUT PAYING FOR IT.** `/home/langston/PROBE-DECOY-NOT-AUTOLOADED.md` exists on disk deliberately and must stay out of every auto-load path — the moment it is loaded it stops being a control and the load canary reports VOID forever.

⚠️ **Observation, not a defect (2026-07-24):** files he fetches to read persist in his home afterwards — e.g. `sim.md` and `cr.md`, both written during a review. He re-fetches rather than reusing them, so this is not currently a staleness risk.

---

## 5. HOW HE IS INVOKED

**Discord `#general` is the only channel.** One message → one fresh `claude -p` process.

★★ **HE IS STATELESS PER INVOCATION.** Every message spins a new context with **no memory of his own prior turns.** This is a feature — no drift, no accumulated assumption — but it means:
- **Any multi-turn context must be carried in the prompt or in a committed file.** Never assume he recalls what he said an hour ago.
- **He cannot vouch for his own prior output.** For anything he is *reported* to have said, he re-derives it from the ref rather than defending it from a memory he does not have.

**Address gating (deterministic, not model judgment):**
- He engages a session's post **only when his name LEADS it.** A mid-sentence mention does not wake him. Kyle may name him anywhere.
- His replies are **auto-prefixed with the addressee's name**, derived from who triggered the turn — so the wake routing catches them.
- ★ **Relay hand-off:** if you ask him something on *another* session's behalf, his answer is addressed to **you** and the other session never wakes. Whoever asks owns relaying it. Better: let the session that owns the work ask him directly.
- **When directly addressed, he always answers** — there is no silent opt-out on this channel.

**Turn limit:** `BOT_TURN_LIMIT = 100_000` — effectively unbounded. ★ It was **6**, which silently swallowed sign-off requests mid-review; a normal overnight review is 30–50 messages. It exists only to bound a pathological loop, never to ration conversation.

**Bridge:** `/opt/discord-bridges/discord-langston-bridge.py` (systemd `discord-langston-bridge.service`, `active`). Alongside it, `discord-cc-bridge.service` carries the implementation sessions' voice and the human's inbound.

---

## 6. ★ HOW HE READS CODE — rebuilt 2026-07-23/24 on Kyle's direction

> **He reads off the REVIEW BRANCH. He holds no working copy at all.**

**Default — a single file, straight off GitHub at the exact reviewed commit:**
`https://raw.githubusercontent.com/kylegjordan/DawnTraderV3/<sha>/<path>` — public repo, no auth, no local copy. **The `<sha>` is stamped into the top of every invocation** by the bridge (`resolve_review_ref()` → `git ls-remote`). Reading at the sha rather than the branch name means a push landing mid-read cannot hand him different bytes.
- If the ref cannot be resolved, his prompt carries an explicit **do-not-assert** warning instead of a sha. **It fails loud; it never silently omits.**

**Fallback — whole-tree search only** (every caller / appears-nowhere-else / blast-radius census), which GitHub will not serve to an outside machine:
`dt-review grep '<pattern>'` | `dt-review show <path>` | `dt-review ls` | `dt-review ref` (`/usr/local/bin/dt-review`).
★ **It pulls from GitHub FIRST and only then reads, and REFUSES rather than return possibly-stale bytes on a failed fetch** (Kyle directive — the rule is enforced in the tool, not left to memory). It reads `/srv/dawntrader-backup.git` (langston-owned bare repo, push-`DISABLED`).

**Why no working copy:** measured, not assumed — a *bare* repository with no working tree serves both file reads and whole-tree search, and single files come straight off GitHub. The only thing a checkout buys is **execution** (`tsc`, `vitest`), **which he never does.** A 929 MB working clone built for him on 2026-07-23 was deleted the same day as an over-build.
**Langston's own condition, recorded:** *"a clone pinned to the graded SHA IS read-at-the-ref… it only becomes the stale-worktree bug when it drifts."* Hence the invoke-time stamp and the pull-before-read.

⛔ **NEVER `/mnt/gdrive`.** That retired mount is what used to wedge his long reviews for hours (high load, near-zero CPU = uninterruptible I/O wait). His rulebook was repointed away from it 2026-07-24.
⚠️ **`ssh staging` reads a DEPLOY-LAGGED copy** — it once sat 42 commits behind. It is valid for *runtime* verification (logs, live data, the running app), **never as the code ref.**

---

## 7. WHAT HE CAN AND CANNOT TOUCH

| Can | Cannot |
|---|---|
| Read any file at the graded ref (raw URL / `dt-review`) | **Push to any repository** — enforced by an invalid push URL, not by policy |
| Search the whole tree at the ref via `dt-review` | Author or commit code |
| `ssh staging` (`deploy@188.245.193.8`, key restricted to this host's IP) for runtime verification | Change the review branch in any way |
| Acknowledge/resolve system alerts he owns | Read the retired Drive mount (gone) |
| Write in his own home + post to `#general` | |

**Cron (as `langston`):** `*/15 * * * * /usr/local/bin/dt-backup-sync.sh` — refreshes and **reproduction-verifies** the backup that doubles as his search corpus. ★ Runs **as `langston` because he owns the repo**: run as root it trips git's dubious-ownership guard and returns **every field empty**, which reads as a reproduction failure and is not one.

---

## 8. ROLLBACK

Bridge snapshots at `/opt/discord-bridges/discord-langston-bridge.py.pre-*`. Most recent: `pre-syncfix-20260723` (before the read-off-branch change), `pre-stale-msg-fix-20260703`, `pre-step4fix-20260622`. Model rollbacks: `langston-bridge.py.pre-opus48-backup-20260613`. His rulebook: `CLAUDE.md.pre-readoff-20260723`.
**Restore = copy the snapshot back + `systemctl restart discord-langston-bridge.service`.**

---

## 9. KNOWN LIMITS — stated, not hidden

1. **Stateless per invocation** (§5) — the most consequential property. Design every dispatch around it.
2. **A long review is queued, not stalled.** Work is serialised, one at a time. Wall-clock silence ≠ hung. **Check whether the invocation has actually started before re-poking** — a wall-clock re-poke just stacks a second request.
3. **He cannot run tests or the typechecker.** By design; that is the implementer's job.
4. **He can only read what is pushed.** An unpushed diff is a file that does not exist for him — commit and push *before* dispatching.
5. **He has no push path to the human's phone.** Anything needing Kyle's approval is relayed by the session that saw it.
6. **The OAuth token expires silently (§3).**

---

## 10. CHANGE LOG

| Date | Change | Before → After / why |
|---|---|---|
| 2026-09-05 | ⭐⭐ **§4 rewritten: his SELF-BUILT decision store is documented for the first time, it now has a verified daily backup, and every asserted size was removed** | **BEFORE:** §4 listed two files with hard-coded sizes (*"~55 KB"*, *"~38 KB"*) and a *"Kept ≤200 lines"* rule **Langston himself had retired on 2026-07-28**; the `MEMORY.md` figure understated the live file by **56%**, so citing it understated a breach by more than half. His self-memory store — 37 entries, started 2026-05-07, unprompted, carrying `Why:` / `How to apply:` / `[[wiki-links]]` — **was not mentioned at all**, and its only backup was ONE manual snapshot with nothing scheduled to take another. **AFTER:** the table names the TOOL to read each live size with and states no size at all; the always-loaded SET and its monotone ceiling (`#1007`) are described, with the cap explicitly NOT restated per-file; the store has its own block, a daily `langston-selfmemory-backup` (05:20 UTC) **verified by REPRODUCTION — extract and sha256 every member, mutation-proved against a missing member, a corrupted member and an empty archive** — and a langston-readable manifest, because he is stateless and a backup he cannot enumerate does not exist from where he sits. **WHY:** `B-LANGSTON-CONTEXT` P-3, findings F-7/F-8. ⛔ The residual is named rather than closed: the store still has no eviction rule, and when one is written it must **evict by SUPERSESSION, never by AGE** — an age rule deletes a 2026-05 ruling that still governs in favour of a 2026-09 note about a closed batch. Homed at `PHASE_19_PLAN` row 2.8a. |
| 2026-09-05 | Two new instruments: `langston-size-watch` (daily 05:40 UTC) and `langston-load-canary` (on demand) | **BEFORE:** nothing measured his instruction files, and the byte log next door says in its own `measures` field that it stats candidates and is **NOT proof the harness loaded them**. So "are his files reaching him?" had no answer, and "are they growing?" had no alarm — which is why `MEMORY.md` grew **+137% in 28 days** unnoticed; the alarm was itself the unfinished item from the 2026-08-05 plan. **AFTER:** the size watch measures the SUM daily against a ceiling it **refuses to raise**, and the load canary proves reachability by reproduction with tools denied plus a not-auto-loaded decoy that VOIDS the run if answered. First canary verdict: **`LOADED`**. |
| 2026-07-24 | Rulebook repointed off the retired Drive mount | The load-bearing "read code at `/mnt/gdrive`" pointers now say read off the branch / `dt-review`. Backup `CLAUDE.md.pre-readoff-20260723` |
| 2026-07-23 | **Read path rebuilt: reads off the review branch, no working copy** | 929 MB clone (built and deleted same day) → raw-URL-at-sha + `dt-review`. A 5-min sync cron → **stamp at invoke time**, because a timer can hand him a file older than the push he was asked to review |
| 2026-07-23 | Backup relocated + re-owned; `dt-review` created | `/root/backups/…` (unreachable by him) → `/srv/dawntrader-backup.git` (langston-owned). Pull-before-read enforced in the tool |
| 2026-07-22 | Long dispatches stopped being silently truncated | Messages over the platform cap were split and everything after the first piece was **discarded before it became work** |
| 2026-06-25 | Comms moved to Discord | Telegram **blocks bot-to-bot delivery**, so agent-to-agent exchange needed a workaround. Telegram decommissioned 2026-07-02 |
| 2026-07-27 | Model → **`claude-opus-5[1m]`** (from `claude-opus-4-8[1m]`), at **BOTH** live sites | Kyle-directed. Anthropic's official model docs now list Opus 4.8 as **legacy** with an explicit migrate-to-Opus-5 recommendation; Opus 5 is **same price** ($5/$25 per MTok), same 1M context, newer knowledge cutoff (May 2026 vs Jan 2026) — a same-cost upgrade, not a trade-off. Discipline followed: both `claude-opus-5` and `claude-opus-5[1m]` live-tested on his box (both returned OK) **BEFORE** any edit; `[1m]` kept so his 1M-context whole-tree review capability is unchanged; rollback snapshots `*.pre-opus5-20260727-234713` taken for BOTH files; py/bash syntax-checked; service restarted clean; **live end-to-end round-trip confirmed through the bridge** (he verified both sites himself at the ref). **★ CENSUS FINDING: two live sites, not one** (`discord-langston-bridge.py:69` + `langston-call:38`) — the prior docs named only the bridge, so a single-site switch would have split him across two models. **Honest boundary (his own words): he is stateless per-invoke, so he has NO felt baseline of 4.8 to compare against — "no degradation" would be an unmeasured adjective. Judge the switch on his next Step-4 diff, not on a self-report.** |
| 2026-06-13 | Model → `claude-opus-4-8[1m]` | Fable 5 access retired mid-flight; verified by live one-off before the bridge flip |
| 2026-05-06 | Runtime → Claude Code under Max OAuth | Replaced OpenClaw + API (~$750/mo → ~$200/mo) |
| 2026-08-05 | **`MEMORY.md` made to actually LOAD (`@MEMORY.md` import) + six false/stale statements fixed in his always-loaded `CLAUDE.md`** (B-RULES-1a OBJ-2, #651) | **BEFORE:** his MEMORY.md had NEVER loaded at invoke despite §10/§12 claiming auto-load — every batch's step-10.b sync wrote to a file he never saw; his §4 said review the diff "BEFORE push" (contradicting the 2026-07-23 graded-ref correction AND his own §1); the trading-mode block said active trading was DORMANT and that paper routes through "Kraken's paper order system" (falsified P19-B2); §3 hardcoded "18 canonical strategies" with two enumerations that omitted `orb` (SSOT holds 19) and stale line refs; §9 named the retired `/mnt/gdrive` repo path as where the repo is; §10.5 step 3 said ack "so it stops surfacing" — inverted (an ack SILENCES via dedupe-key blocking, `system-alerts.ts:388-389`; only resolve frees the key) and had him claiming alerts that are not his. **Load PROVEN by sentinel at BOTH invocation paths** (langston-call + Discord bridge — the two-site census lesson again). Langston ruled every item himself at `c3e93c1c1` (B5 via r2→r3, his mechanism corrections adopted verbatim); backups `*.pre-obj2-20260805-131246`; file 61,369→63,750 B (slimming homed: `B-RULES-1E-LANGSTON-SLIM`, #651) |
| 2026-08-05 | **Per-invoke instructions-load observability added (B-RULES-1a OBJ-1, #651)** | **BEFORE:** nothing recorded what loaded into his context per invoke; the MEMORY.md never-loaded defect sat invisible for months precisely because no instrument existed. NOW: `/usr/local/bin/langston-log-loaded` (fail-open, bare-except, tz-aware, paths-as-identity, populations, honest `measures` label) called from BOTH invocation sites (`langston-call:104` + `discord-langston-bridge.py` `invoke_claude`), appending to `/var/log/langston-instructions-loaded.jsonl` (root-pre-created langston:langston 0644; logrotate weekly/8). Falsifiable-at-birth passed (row 1 = his four independently-predicted byte values); fail-open walked 3 ways incl. a full invoke with the log dead; Discord path self-observed by him (row 5). Baseline: 93,494 B loaded per invoke. Backups (both sites, same-day): `/root/backups/*.pre-obj1-20260805-134306` + copies at `/home/langston/backups/` (langston-readable — his mode-700 `/root` reach finding, fixed not argued) |
| 2026-09-02 | **His GitHub read path is now AUTHENTICATED — `dt-review` and the Helsinki backup mirror fetch over SSH with a read-only deploy key (`langston@helsinki`, `SHA256:gvtY9j7v…`), registered by Kyle on `kylegjordan/DawnTraderV3`; `dt-push-notice` pinned to the same key via `GIT_SSH_COMMAND`** (#990, CC-A) | **BEFORE:** every server-side GitHub call was ANONYMOUS over HTTPS (no credential existed on the box), which worked because the repo is public. **WHY:** on 2026-09-02 GitHub began answering the anonymous pack request from both Hetzner addresses with 401 (per-address anonymous rate-limiting, measured: the same clone worked from Kyle's laptop) — `dt-review` returned FETCH FROM GITHUB FAILED and the mirror could not pull. **Unchanged:** he still reads at a ref with no working copy; the mirror's push URL is still `DISABLED://…` (§7.1 terminal). Rollback: `/root/backups/github-remote-rollback-2026-09-02/`. |
| 2026-09-04 | **Harness upgraded 2.1.159 → 2.1.261 (Kyle-directed); MODEL DELIBERATELY UNCHANGED at `claude-opus-5[1m]`** | **BEFORE:** the CLI had sat at 2.1.159 since 2026-06-01. The daily rule-21 check found two things the same morning — Fable 5.1 (`claude-fable-5-1`) is now a current model, AND the CLI was ~100 releases behind — **and they turned out to be ONE problem: asking his box for `claude-fable-5-1` returned `API Error: 400 … Claude Code 2.1.159 does not support this model; version 2.1.251 or newer is required`.** ⇒ the newer model was never a config choice; it was gated on the runtime. ⛔ **KYLE'S DECISION: STAY ON OPUS 5 — *"Fable five point one is too expensive to run right now."* Both model sites untouched and still read `claude-opus-5[1m]`.** **VERIFIED AFTER, not assumed:** node engine checked BEFORE (22.22.1 vs `>=22.0.0`); rollback anchor recorded before touching anything; **direct-invoke path proven with a LOAD CANARY whose answers only his auto-loaded files can supply — `OK` / `8` retraction entries / `langston-recall` — so `MEMORY.md` AND `CLAUDE.md` both still load (the `#651` failure mode, tested not assumed)**; and the **Discord-bridge path proven by him composing a substantive review through it after the upgrade.** |
