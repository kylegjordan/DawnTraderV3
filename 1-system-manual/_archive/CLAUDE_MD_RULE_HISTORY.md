# CLAUDE.md Rule History — Originating Batches + Full Backstories

> **Purpose.** This archive holds the full origin stories, empirical evidence, and detailed rationale paragraphs for the rules codified in `CLAUDE.md`. CLAUDE.md itself keeps the rule statement + a one-line rationale + a pointer here. Read this file when you need the WHY behind a rule (which batch surfaced it, what the specific failure was, what the lesson is).
>
> **Maintenance.** When a new rule is added to CLAUDE.md, append its full backstory here under the matching section heading. Do NOT edit rules already in CLAUDE.md and leave the backstory stale here — they must stay in sync.

---

## §0 — Mission (full original, condensed in CLAUDE.md 2026-06-20 per B-GOV R3)
The condensed §0 in CLAUDE.md keeps every operative element; this is the full original framing (the motivational "why behind everything" passage), preserved for reference:

> **DawnTrader exists to grow the portfolio balance as much as possible, as fast as possible, by trading fully autonomously — WITHOUT ever compromising the risk tolerance Kyle has set.** This single objective is the reason behind every batch, threshold, calibration, and architectural decision. The set risk limits — kill-switch, daily-loss budget, position sizing, concurrency caps, EV / Net-Expectancy gating — are **HARD boundaries that BOUND the growth, never dials to loosen in pursuit of more**: if maximizing growth and honoring the risk tolerance ever conflict, the risk tolerance wins. The edge that actually produces the growth is **being excellent at selecting the genuine winners out of the ready-to-buy pool** — choosing and sizing the single best available signal each cycle (honest ranking + EV gating + evidence-based calibration), not trading more often. Every calibration target, fee-ladder rung, and ranking/selection improvement traces back to this: **pick right, size right, stay inside the risk envelope, compound.**

---

## §1.PL — Plain-language summaries to Kyle (Kyle directive 2026-05-14)

**Reference exemplar.** The B-NEW-14 and B-NEW-21 plain-language explanations from 2026-05-14 are the bar. Match that style for every Kyle-facing summary.

**Failure mode this prevents.** When Kyle-facing summaries are full of function names and code snippets, Kyle can't visualize what's happening, his eyes glaze, he disengages from the discussion, and decisions get rubber-stamped without his real input. A confused approval is worse than a slow one — it lets bad calls through. Plain language is what keeps him in the loop as a real decision-maker, not a button-presser.

**Scope clarification.** The plain-language rule applies specifically to the **summary messages delivered to Kyle in chat when he is being asked to understand, decide on, or approve something**. Investigation transcripts, agent thinking, and governance docs stay technical. CC ↔ Langston peer exchanges (both directions) stay technical at whatever depth the work demands so technical fidelity isn't lost.

---

## §1.ALWAYS-POST — ALWAYS post plain-language summaries in Claude Desktop too (Kyle directive 2026-05-25)

**The Telegram-only failure mode.** Kyle is at the keyboard in Claude Desktop watching CC work, the autonomous run hits a meaningful milestone (CI green, scope locked, pre-audit ACK, batch closed), CC posts the summary to Telegram but says nothing in Claude Desktop, and Kyle has no idea anything substantive just happened unless he switches to Telegram. Don't make him switch contexts. The Telegram post stays a separate side-effect (for visibility + paper trail); the Claude Desktop post is the primary delivery.

**Originating batch.** Surfaced during B79.0n.CONFIDENCE-CHAIN (2026-05-25) when Kyle had to explicitly call out that CC was posting CI-green and Step-8 ACK summaries to Telegram only, leaving him to switch apps to see them. Rule added to §1 of CLAUDE.md in the same session.

---

## §1.PERSIST — Problem-solving disposition (creativity, resourcefulness, persistence)

**Look at every problem from multiple angles before settling on a solution.** The surface symptom, the immediate cause, the upstream cause, and whether the problem is structural or local — examine all four. Don't stop at the first plausible answer if it feels thin.

**Use what's already in the codebase before proposing new code.** Existing infrastructure is cheaper and safer than new infrastructure. Orphaned assets are opportunities, not noise. The DBS (Directional Bias Score) discovery in April 2026 — fully implemented but never consumed — is the canonical example. Always ask: "Does this already exist somewhere?"

**Be persistent when the easy answer fails.** If the first approach doesn't work, don't abandon the goal — find a different path. The naive momentum-check patch to the regime classifier failed; the structural DBS-based redesign succeeded. Dig deeper.

**Be resourceful with context.** Read adjacent code. Query the DB. Pull the logs. Screenshot the UI. Simulate outcomes. Cross-reference historical data. Don't rely on what you remember — verify.

**Never confabulate when context is degraded.** If you're not sure, say so. Flag uncertainty explicitly. Check the file, the commit, the DB row. Don't state compacted info confidently.

---

## §2.1a — Architectural read BEFORE drafting the scope (Kyle directive 2026-05-24)

**Discipline origin.** B79.0n.STRATEGY scope v1 underestimated the detect-method caller surface 2-files-estimated → 7-files-actual (Langston caught it at Step 1 review; v2 fixed the gap via compile-driven probe). Reading SIM + System Manual upfront would have produced an accurate v1 and saved an iteration. The Step 2 pre-audit then goes DEEPER into the same architecture — Step 1 establishes the surface; Step 2 enumerates per-component upstream/downstream/blast-radius details. **A thinner scope means a slower batch.** Front-loading the architectural read pays back across all 11 steps.

---

## §2.10b — Langston memory sync (Kyle directive 2026-05-07)

**Why.** Langston's MEMORY auto-loads on every `claude -p` invocation; if it's stale, his next review will start from the wrong baseline. Mirror your MEMORY structure: state block, recent-batch row, sequencing update, open-issue diff.

**`/home/langston/CLAUDE.md`** is updated only when the comms protocol or his persona changes (rare). System Manual / BATCH_CATALOG / PHASE_HISTORY / RUNNING_ISSUES on the repo side are auto-visible to Langston via his GDrive mount (when not hung) — no explicit copy needed.

---

## §3.1 — MEMORY.md two-file pattern (Kyle directive 2026-04-29)

**Why this pattern exists.** The user-cache MEMORY.md is what Claude Code auto-loads at session start (the truth file). The in-repo MEMORY.md at `.claude/memory/MEMORY.md` is a mirror checked into git, pushed to GitHub so the state is never lost if user-cache is wiped. If a session updates user-cache without copying to in-repo, the next push to GitHub leaves stale state on the remote.

**Two-step update workflow (non-negotiable):**
1. Edit the user-cache MEMORY.md (the truth file).
2. Copy the entire updated file to the in-repo persistence path. Commit + push as part of the same governance turn.

---

## §3.2 — MEMORY.md hard cap: 200 lines (Kyle directive 2026-04-29)

**Why this exists.** MEMORY.md auto-loads into every Claude Code session — runaway growth wastes context every turn.

**Update discipline.** Every time MEMORY.md is updated: count lines (`wc -l`). If >200, prune before commit — collapse stale entries, drop resolved items, condense the state block. The line-count check runs every update, not just occasionally.

---

## §3.3 — Asset-class onboarding learning-capture rule (Kyle directive 2026-05-20 — Phase 24 standing rule)

**Why this exists.** B79.0n is structured as ~17 sub-batches that each audit one subsystem for asset-class awareness. Every sub-batch surfaces concrete, reusable patterns about what an asset-class onboarding actually requires. If we don't capture those learnings as they emerge, the next asset class (perpetual futures, then 4th/5th asset classes) will re-discover the same mistakes in real time. Goal: at end of Phase 24, the onboarding workflow is concrete enough that 90-95% of the guesswork is eliminated for the next asset class.

**Phase 24 closure batch.** At end of Phase 24, a dedicated review batch consolidates all learnings into a finalized `ASSET_CLASS_ONBOARDING_WORKFLOW.md`. The finalization batch reviews every prior Phase 24 batch's learnings section and distills them into the canonical workflow document.

**Time-bounded.** This rule applies from 2026-05-20 through the end of Phase 24 (the multi-asset VTS expansion + xStock active-trading wire-in arc). After Phase 24 closes with a finalized `ASSET_CLASS_ONBOARDING_WORKFLOW.md`, this rule converts to "ad-hoc update when substantive learnings surface" (the standard governance discipline for evolving docs).

**The four sections required in every Phase 24 batch's completion report under "Asset-class onboarding workflow learnings":**
- (a) **What worked well** — patterns / shapes / call-site conventions that should become reusable templates for the next asset class.
- (b) **What surprised us** — pitfalls that future asset-class onboardings need to avoid.
- (c) **Recurring structural patterns** observed across asset-class boundaries.
- (d) **Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`** — specific section additions, rule strengthenings, checklist items. Edits get applied as part of the same governance turn.

Empty section is fine if nothing substantive emerged — explicitly state "No new onboarding learnings this batch." Don't add filler.

---

## §5.13 — Prefer rolling windows over single-point snapshots (origin context)

**Specific evidence (B59 → B61).** The B59 investigation reported 47% drift contamination from a single 88-pair snapshot, while the B61 audit measured 72.59% from a 13,954-sample rolling window — same classifier, same universe. The B59 investigation also reported 19.3% TFS share from a snapshot, while B61 measured 3.42% from a rolling window — a 16-point delta. Both deltas would have produced wrong decisions if the snapshots had been treated as authoritative.

**Decision rule.** If only a snapshot is available, label it explicitly as "snapshot, single-moment, not decision-grade" and treat it as indicative only. Decisions get made from rolling windows, audits, or repeated measurements — not from one-shot point-in-time observations.

---

## §5.14 — Log non-existent exchange API names (Kyle directive 2026-04-30)

**Specific origin.** B74 v1 spent hours assuming Kraken Futures WS had a `candles_trade_1m` feed that doesn't exist; B74.1 found the correct REST endpoint (`https://futures.kraken.com/api/charts/v1/trade/<sym>/1m`) after live-probing. Without the `KNOWN_NONEXISTENT_NAMES` registry, the next batch that touches Kraken Futures could repeat the same mistake.

**Required entry fields.** Exchange, type (WS feed / REST endpoint / etc.), the failing name, the context where you tried it, the correct alternative you found, the date, a one-line reason. Reference from any code comment that uses the working alternative.

---

## §5.15 — NO PATCHES (Kyle directive 2026-05-08)

**Origin.** B79-era discovery that BE-latch was firing despite a global disable flag — the response is **never** to ship a quick patch; identify the structural root cause, design the right architecture, document the design BEFORE implementing, get Langston's review, and ship a proper batch. Patches accumulate as future-debt and erode trust in the system.

**Specific corollaries:**

- **Cold-start warmup is acceptable.** A 1-5 minute system startup that loads cleanly is better than instant-on with a stale-cache race window. Production restarts will be infrequent (weekly+). Sacrifice immediate functioning for clean, deterministic startup.
- **Backpressure is never asset-class shedding.** If the system is hitting a compute / memory / DB / API ceiling, the answer is vertical-scale (Hetzner tier upgrade, Supabase plan upgrade) or computational-distribution refactor. Dropping an asset class to free resources is not acceptable. Resource ceilings are a hardware/infrastructure problem with hardware/infrastructure solutions.
- **Every architectural decision discussed must be documented BEFORE implementation.** When Kyle and CC (or Kyle and Langston) discuss a fix or feature, it goes into the right governance doc (scope, plan, workflow, RUNNING_ISSUES, roadmap) the same session it's discussed. Promises like "we'll fix that later" without an associated documented issue / batch / scope-line will be rejected. The project is too large and runs over too many phases for verbal commitments to survive without paper trail.
- **Per-asset-class configuration is the default for behavioral knobs.** Trading-policy decisions (BE enable, trailing exits, stop policy, regime thresholds, confidence floors) must be DB-resolved with `asset_class` as a first-class scoping dimension. A global wildcard row is acceptable as a starting placeholder ONLY when the value is genuinely identical across all asset classes; the moment any asset class needs a different value, the wildcard row is replaced with explicit per-class rows. No silent fallbacks.

---

## §5.16 — Claude Code permission-prompt regression workaround (Kyle directive 2026-05-20)

**Context.** Claude Code v2.1.7+ has a known regression (GitHub issues #28183, #28023, #27139) where the compound-command safety classifier evaluates the whole command line as a single unit independently of the allow list, even when every individual subcommand is allow-listed. Without the fix, the user gets prompted every 30 seconds and work grinds to a halt.

**Why the load-bearing line matters.** The TOP-LEVEL `"defaultMode": "bypassPermissions"` at line 2 of `.claude/settings.local.json` (outside the `permissions` block) is the canonical schema for session-wide permission-mode override. If this line ever gets deleted or moved inside the `permissions` block only, prompts will return. Reference commit: working file committed at `.claude/settings.local.json` as of `39b033738` (B-NEW-36 sub-batch (b) Step 10/11 governance close).

**Future regression.** If a future Claude Code update changes the schema again and this fix stops working, research the current canonical syntax via the GitHub issues + Claude Code docs (https://code.claude.com/docs/en/permissions) and re-derive the fix; do NOT spend hours trying to add individual rules — go straight to the structural `bypassPermissions` fix.

---

## §5.17 — xStock trading window is 24/5 (Kyle directive 2026-05-22)

**Origin.** xStocks (tokenized equities) trade **24 hours a day, Sunday through Friday** — a continuous ~5-day window, off only for the weekend (Friday close → Sunday open; the B-NEW-36 `weekend_shutdown` / `weekend_restart` timers manage that boundary).

**Reasoning trap.** Never assume xStocks follow US equity regular trading hours (≈13:30–20:00 UTC). They are live around the clock on weekdays. "It's overnight / off-hours" is **NOT** a valid explanation for xStock trades not closing, or xStock prices being blank/stale, during the Sun–Fri window.

**Caveat (added 2026-05-25 during B79.0n.CONFIDENCE-CHAIN).** US market holidays DO pause the live xstock signal cadence — the 24/5 window is normal-week-only, not holidays. Memorial Day, Independence Day, Thanksgiving, etc. are holiday-pauses analogous to the weekend boundary.

---

## §5.18 — Legacy-component review register (Kyle directive 2026-05-22)

**Origin.** B-NEW-43 Phase 1 surfaced `paper-48hr-simulation.ts` + `paper-portfolio-manager.ts` as legacy while fixing a type error that ran through them. Mid-batch deletion would have expanded scope and risk.

**The recurring legacy theme is the user-ID dependency** — the system was meant to be mode-based; an early PM built it user-based; multiple cleanup phases since have not fully removed it. userId-coupled code paths are prime register candidates.

**Register location.** `1-system-manual/RUNNING_ISSUES.md` entry #136 (Phase 16 legacy-component review register). Phase 16 does a single consolidated review of the register to decide what actually gets removed.

---

## §5.19 — CI per-batch confirmation rule (Kyle directive 2026-05-23, B-NEW-43 Phase 3)

**Why this matters.** B-NEW-43 was scoped specifically to recover CI from a pre-existing red state (the `continue-on-error: true` setting + ~700 hidden TS errors + 98 failing tests). Now that CI is green, the discipline that keeps it green is per-batch verification — push, watch, confirm, THEN close. Any batch closed without the green-CI confirmation is at risk of having shipped a CI regression that the next batch will surface confusingly.

**First-time application.** B-NEW-43 itself — Phase 4 close + full batch close both follow this rule.

---

## §6.5.0 — Large-prompt protocol (Kyle directive 2026-05-08) — empirical context

**Empirical evidence.** A 7702-byte design ask hung twice on consecutive 240s first-byte timeouts; a 2825-byte version succeeded in 60s on attempt 1; PING/PONG probes return in 3s. Why this happens isn't fully diagnosed (likely API queue prioritization or first-token-streaming path differences for large prompts), and we are not going to keep diagnosing it — we use a pattern that sidesteps it cleanly.

**GDrive FUSE cache lag empirical (2026-05-11).** The Hetzner GDrive FUSE mount (rclone) has multi-minute cache lag on newly-written files; pointing Langston at `/mnt/gdrive/...` paths for files written in the same session causes silent file-not-found and Langston spins indefinitely on Read tool retries. SCP-stage to `/home/langston/inbox/<batch>/` instead.

**Why we never shorten content.** When CC shortens a design ask to dodge the hang, details get cut. Cut details cause missed scope items, missed risks, missed architectural decisions, and result in breaks in the system. NO PATCHES doctrine (§5 #15) applies to comms infrastructure too — file-first is the proper solution; size-based content-cutting is a patch.

---

## §6.5.0.a — Embed diff snippets inline (Kyle directive 2026-05-17, B-NEW-42b lesson)

**Reason (B-NEW-42b empirical).** Two consecutive Step 4 round-2 dispatches hung 30+ minutes each because Langston's claude-cli auto-exploration ran `cd /mnt/gdrive/...` + `git status` on the 10GB+ repo via the GDrive FUSE mount. FUSE cache stalls on the first git command and the whole subprocess pins indefinitely. The third dispatch had the diff snippets embedded inline + explicitly told Langston "DO NOT cd to /mnt/gdrive" — Langston ACK'd in under 1 minute.

**Why this matters.** Langston's tool surface includes Bash with auto-exploration heuristics. Without the embedded snippets + explicit no-gdrive instruction, his first instinct is to "look at the repo" — which hits the FUSE mount and hangs. Embedding the diff content makes "look at the repo" unnecessary; the explicit no-gdrive instruction overrides the auto-exploration.

---

## §6.5.0.b — Hung-instance checking (Kyle directive 2026-05-17, B-NEW-42b lesson)

**Reason (B-NEW-42b empirical).** Typical Langston claude-cli turnaround is 1-8 minutes for substantive reviews. If a dispatch has been running for >10 minutes with a 0-byte reply file, the inner process is almost certainly hung (gdrive FUSE, session UUID lock, network hiccup, etc.). Waiting longer wastes Kyle's time and the day's work cycle. Kyle's frustration on 2026-05-17 ("If Langston isn't responding, please intervene") was triggered after the 30+ minute mark on a hung dispatch — that's too long.

**The 30-minute previous behavior was a workflow violation** — past CC sessions waited too long because the polling loop had no upper bound. Fix it at the loop level (max iterations) AND at the check-in level (5-10 min ScheduleWakeup), not just one of the two.

---

## §6.5.1 — Flag note (empirical 2026-05-11)

**`--permission-mode acceptEdits`** (the watchdog wrapper default) hangs silently on any Bash tool invocation in Langston's reasoning. For ANY review task where Langston might shell out (psql verification, diff inspection, file Read via shell), `bypassPermissions` is the only working flag. Default to `bypassPermissions` even for pure-file-read tasks to avoid the failure mode.

**Kyle's 2026-05-07 directive on verbatim Telegram relay.** When CC delivers to Langston via SSH+claude-cli with a fresh UUID (the workaround when the canonical bridge UUID is locked), the response goes to CC's stdout but the Telegram bridge daemon never sees it. CC MUST relay it manually using the curl pattern. Otherwise Kyle has zero visibility into what Langston actually said — only CC's summary, which can drift from what Langston wrote.

---

## §7.1 — Local verification environment (B-NEW-43 mirror clone, 2026-05-22)

**Why it exists.** The canonical working copy lives on the Google Drive FUSE mount (`G:\My Drive\...\DawnTraderV3`). `npm install` cannot complete there — npm's many-small-files write pattern triggers `EBADF` / `TAR_ENTRY_ERROR` on the FUSE layer, so `node_modules` is permanently incomplete and `npx tsc` produces ~18k cascade errors from missing type defs (unusable). B-NEW-43 Phase 0 established a second clone on a local NTFS disk where `npm install` works.

**The mirror specifics.** A `--depth 1 --single-branch --branch migration/aws-supabase` shallow clone (a full clone fails with `early EOF` — the repo carries years of archives; shallow is small + reliable and still supports commit + push fine). `npm install` there completes in ~26 s; `npx tsc --noEmit` runs to completion and produces the authoritative error set (verified 2026-05-22: exactly 696 errors — identical to CI run 26255691977). `npx vitest` (3.2.4) resolves and runs.

**Sync protocol — ONE-DIRECTION-EDIT discipline (HARD RULE, split-brain prevention).** Two working copies is a drift hazard. The rule:
- **Code edits land in the `C:\dev` mirror ONLY.** Push to GitHub from the mirror.
- **The GDrive clone (`G:\My Drive\...`) is refreshed via `git pull` only** — never edited for code. It stays canonical for governance-doc authoring + Langston's FUSE-mount visibility.
- **No bidirectional sync** (rsync etc.) — that is the classic split-brain footgun. Git is the single sync channel: mirror → push → GDrive clone pulls.
- Governance docs (scope / pre-audit / completion reports, `1-system-manual/`, `MEMORY.md`) may still be authored in the GDrive clone — they don't need `tsc`. **Code** (`server/`, `client/`, `shared/`, `drizzle/`, test files) is **mirror-only**.

---

## §8.1 — OpenClaw decommission (2026-05-06)

**Pre-2026-05-06 architecture.** Langston ran on OpenClaw+Opus-4.6-API. Cost ~$750/mo (API). Post-migration: Claude Code under Kyle's Max OAuth on the same Hetzner box. Cost ~$200/mo (Max sub).

**Cleanup.** The OpenClaw `default` and `ccdt-relay` Telegram accounts are both `enabled: false` in `/root/.openclaw/openclaw.json`. The `openclaw-gateway` user-systemd service may still be running but is idle (no active bot bindings). Optional cleanup: `systemctl --user stop openclaw-gateway && systemctl --user disable openclaw-gateway`.

**Obsolete commands to avoid:**
- `openclaw message send --account ccdt-relay ...` → use `cc-comms-bridge send` instead
- `openclaw agent --deliver --session-id <UUID> ...` → use direct SSH+`claude -p --session-id <UUID>` invocation
- `cc-inbox read && cc-inbox mark-read` → use `tail /var/log/cc-bridge-inbox.jsonl` instead
- Anything referencing `/root/.openclaw/workspace/` files (BOOTSTRAP.md, SOUL.md, etc.) — Langston's identity now lives at `/home/langston/CLAUDE.md` + `/home/langston/MEMORY.md`.

---

## §9.framing — Buried implemented logic is a governance failure

**The DBS example.** DBS (Directional Bias Score) existed, was wired, was computing every MCE cycle, and was doing nothing — because no governance doc surfaced it and no review caught that it had been orphaned. That is not a docs problem. That is the governance system failing to do its job. Treat every instance of burial this way.

DawnTrader is massive and scaling. Cascade effects are easy to miss. Important details get buried. Kyle cannot be the only safeguard — his human memory is imperfect and the system is too large. The governance docs must surface what matters, and the workflow must force those docs to stay current.

---

## §9.1 — SCAFFOLDING-VS-FUNCTIONAL declaration (Kyle directive 2026-05-11)

**Originating context.** Burying "deferred to next batch" in row 16 of an objectives table or in a paragraph at the end of a completion report has produced multiple cases where Kyle was told a capability was working when it wasn't:
- B79.0d told Kyle "ORB will flow through VTS shadow-mode Monday 14:30 UTC" — the wiring was never built.
- xstock_spot scaffolding was repeatedly described as "operational" while line 292 of `scanner.ts` still held a `TODO B79.x: route fresh pairs into signal-orchestrator`.

The TOP-OF-REPORT declaration makes the gap impossible to miss.

---

## §9.2 — NUMERIC-DELTAS-MUST-BE-SURFACED (Kyle directive 2026-05-11)

**Originating context.** Burying a new value in a table cell, test assertion, or seventh-paragraph parenthetical has produced multiple cases where Kyle was told a number that didn't survive scope iteration. Example: "6 strategies for xstocks" → shipped as 10 after Langston rev 5 expanded the set; the expansion was technically defensible but never explicitly surfaced as a delta. The TOP-OF-REPORT delta section makes drift unmistakable.

---

## §9.3 — STAGING-VERIFIED means UI-navigated, not curl-checked (Kyle directive 2026-05-11)

**Why backend health checks aren't enough.** A successful API response, a psql query returning rows, a PM2 log line, an `npm run build` success — these prove the server didn't crash and the route returned data. They do NOT prove the UI panel that consumes that data actually renders correctly, that the user sees real numbers, that no field is undefined-rendering-as-"--" in the table, or that the layout isn't broken.

**Kyle's browser opens a tab when Claude-in-Chrome navigates** — he can SEE whether the verification actually happened. False claims of "staging verified" are immediately detectable on his end.

**No assumptions when Kyle reports issues.** Every issue the user raises must be: confirmed (reproduce it; locate the code path; quote the actual data), investigated (not dismissed with "marked N/A" or "probably the threshold"), tracked in a dedicated batch-tracking document so nothing is glossed over. Quick-fixing one item and declaring everything resolved is the failure mode. The discipline is: enumerate every item raised → tackle each one with evidence → only mark resolved when independently re-verified.

---

## §10.5 — System Alerts per-turn check (Kyle directive 2026-05-17 — context)

**Why this is mandatory.** Sessions can be days or weeks apart; whoever is at the keyboard at the moment a scheduled check is due is the one who picks it up. Telegram messages don't get reliably read because there's so much technical CC↔Langston chatter. The per-turn check ensures alerts get seen by either Claude or Kyle (via Claude's plain-language surfacing) regardless of which channel Kyle is using to interact.

**Why per-turn, not session-start-only.** Alerts can fire between turns of a long session. Failure to perform this check on every turn is a process violation.

---

## §11 — Kyle Preferences (full context for §1 already in CLAUDE.md)

**Kyle is a human with imperfect memory.** The job of CC and Langston is to SURFACE things buried in the system, not wait for Kyle to remember them. If something important is easy to forget, put it in a Tier 1 or Tier 2 doc and reference it in the auto-loaded files. That is what CLAUDE.md is for.

---

## §DEAD-RULES — the 2026-07-24 obsolete-rule sweep (Kyle directive, after CC-A's rule-25 find)

**What happened.** CC-A, re-reading `CLAUDE.md` after the repo moved off Google Drive, found rule 25 still asserting that the path-limited commit form *segfaults silently* and therefore telling the reader to reach for the `CC_COMMIT_ATTESTED` override. That premise had only ever been true on the GDrive FUSE mount. Kyle's response was the important part: **their point was not "correct that rule" — it was "that rule should not be in the rulebook at all, because we do not use that system anymore," and go find the others.**

**The sweep found seven more, in three distinct shapes.** The shapes matter more than the count, because they are what to look for next time:

1. **A live instruction pointing at a dead path.** §6.2 named a Telegram DM to `@CCDTCommsBot` / topic 21 as a current way for Kyle to reach CC — three weeks after the bridges were stopped and their unit files removed (#348). Also §8.1, which redirected an obsolete OpenClaw command to `cc-comms-bridge send` — *itself* removed on the same date. **A dead pointer to a dead pointer: the rule had been rewritten once already and still went stale, because only the near end was checked.**

2. **A rule whose premise silently evaporated.** §3 step 10.b said repo docs were "auto-visible to Langston via his GDrive mount." **The mount still exists on his box and is empty** — it resolves without error and returns nothing. That is the absent-as-valid class (#546/#568) sitting inside governance itself: a reader relying on it concludes *the document isn't there*, not *I cannot see it*. It also flatly contradicted §7.1's own "Never `/mnt/gdrive`."

3. **A freeze that outlived its audit.** Rule 11 froze all regime/DBS threshold and formula changes "until the Phase 15b audit completes." **It completed in April 2026** (B61–B65; RBS drift contamination 70.2% → 0.00%). Left standing, it was quotable against Phase 25 — which *is* regime and threshold calibration. **A stale freeze is the most dangerous shape of all, because a dead permission is merely useless while a dead prohibition is enforceable.**

**And the worst one was not in `CLAUDE.md`.** The shared `MEMORY.md` — auto-loaded by every session at every start *and every compaction* — still opened its **operational non-negotiables** with "test on the `C:\dev` bench" and "push only from the GoogleDrive folder." `C:\dev` had been deleted and the Drive folder's push URL deliberately invalidated. A session obeying its own non-negotiables faithfully would have failed at git. **The block asserting that violations are "a process failure, not a judgment call" was the block that was wrong.**

**The rule this produced:** when a system is retired, the retirement is not finished when the machinery stops. **Grep the always-loaded files for its name and re-read every hit** — the failure is never the entry that says "X is retired," which is easy to write and easy to find. It is the *other* entry, written earlier for a different purpose, that quietly depends on X still working.

**★ KYLE OVERRULED THE FIRST ATTEMPT, AND HE WAS RIGHT.** The sweep initially *retired the rules in place* — leaving each dead rule's text behind under a 🗑 marker saying what it used to say and why it went. **Kyle rejected that outright:** *"This shit needs to be deleted and never seen from again. It saves space in the Claude file, and it takes up less resources when Langston reloads."*

**The reasoning is a cost argument the first version ignored.** `CLAUDE.md` is auto-loaded into every session at every start **and every compaction**, and it is re-read by Langston on **every single invocation** of his. A retirement note is therefore not a free annotation — **it is a recurring tax, charged on every turn of every session forever, to preserve a sentence whose only remaining purpose is to describe something that no longer exists.** The archive costs nothing per turn because nothing loads it. So: **the dead rule is DELETED from `CLAUDE.md`; its story lives here, and only here.** ~3.2 KB came out on the first pass.

**The one thing that survives deletion is the NUMBER.** Rule 11's slot is now simply absent — the list runs 10, 12, 13. Renumbering would silently break every citation of rules 12–28 across the doc set, and those citations are load-bearing. **An absent number is self-evident and costs nothing; a shifted number is a wrong pointer that still resolves.**

---

## §NON-NEGOTIABLES — the block that was itself wrong (2026-07-24)

The shared `MEMORY.md` opens with **OPERATIONAL NON-NEGOTIABLES**, prefaced *"Violating any of these is a process failure, not a judgment call."* The 2026-07-24 review found **two of its six items were false**, which is the sharpest possible version of the staleness problem: **the block claiming zero discretion was the block giving wrong instructions.**

- **Item 5** told every session to test on the `C:\dev` bench and push from the Google Drive folder. `C:\dev` was deleted; the Drive folder's push URL was deliberately invalidated. **Obeying it faithfully would have failed at git.**
- **Item 2** said *"Langston reads the actual `git diff` BEFORE it is pushed."* Kyle had corrected exactly this on 2026-07-23 — *"Langston reviews the review branch on GitHub, so it's already been pushed"* — and `CLAUDE.md` §2 step 4 was fixed then. **The non-negotiable was not.** A correction applied to one file and not its twin is how two rulebooks drift apart while both look authoritative.

**Kyle's instruction was to review rather than strip:** *"There are probably some nonnegotiables that are true for the process and system that we're running now… Clean up the ones that need cleaning but keeping, and throwing out the ones that aren't necessary, and adding anyone that's not in there that we think should be in there."* Four items were true and kept as-is (CI-never-red, iterate-to-completion, the 11-step workflow, the bug taxonomy). Two were corrected. **Two were added, and the selection rule was: a thing Kyle has had to say twice is not a preference, it is a non-negotiable that was never written down** — **investigate before you announce** (rule 24.a, after eleven defect claims were announced and retracted in a single day) and **stay in your own lane** (rule 28, whose cost is Kyle's own reading time).

---

## §UNLOCK — "we may have unlocked functionality that was switched off" (Kyle, 2026-07-24)

Kyle proposed, against a set of behaviour changes that all appeared within days of each other, that recent batches had **re-activated dormant functionality rather than introduced new defects** — *"all of that functionality was turned off, and now he's probably accidentally reactivated some of it."*

**The code confirmed it verbatim for the max-hold**, in the comment written by the batch that did it (`signal-orchestrator.ts:1089-1097`): the max-hold value *"died here and the exit engine's `max_holding_period` branch was skipped for **EVERY position**. Measured: 0 of 15 live positions carried it, and there are **0 max_holding_period closes in the entire closed_trades history**… that stamp comment also says 'active trading is OFF — changes no live behavior today' (2026-06-06); **it is ON now, so a dormant forward-prep guarantee had quietly become load-bearing.**"*

**The 24-hour value was introduced on 2026-06-06 (`ecf185753`) as a unit-normalisation change — "unify max-hold on explicit milliseconds" — at a time when active trading was OFF and it therefore could not affect anything.** It was plumbing hygiene, never a trading decision, and it was never put to Kyle as one. When the plumbing was repaired on 2026-07-22 it began enforcing, for the first time ever, a holding limit **nobody currently running the system had agreed to.**

**The lesson, and it generalises well beyond this case:** a value written while a system is OFF has never been tested against the question *"do we actually want this?"* — it only ever had to satisfy *"is this the right shape?"* **Turning the system on converts every such value from documentation into policy, silently and all at once.** When a dormant path is re-activated, its constants need re-approval, not just verification that they now flow.

**And the framing error worth remembering:** the sweep's first report called the 24 hours *"the deliberate default"* — true of the *value* (explicit milliseconds, not a unit bug) and badly misleading about its *standing*, which Kyle caught immediately: *"at no point have I approved a twenty four hour limit."* **"Deliberate" describes how something was written. It says nothing about whether it was ever decided.**


---

*End of CLAUDE_MD_RULE_HISTORY.md archive companion. Cross-references from CLAUDE.md use the section labels (e.g., "see §1.PL", "see §5.16") to locate the full backstory here.*

## §2.1b — THE PROVENANCE READ AS A STANDING SCOPE OBLIGATION (Kyle directive 2026-07-29)

**The rule:** every scope must dig into the history of whatever it touches and record the ORIGINAL INTENT, then state which of four dispositions applies (relevant / relevant-but-needs-updating / disconnected-should-be-reconnected / connected-should-be-removed).

**What produced it.** Not one incident — a pattern that ran for two days straight across all three sessions, where the cost was paid in retractions rather than in reading:

- **The orphaned-trade hunt (CC-C, 2026-07-27/28).** THREE separate causes were proposed and announced — an engine-shutdown cleanup path, a restart landing mid-open, and the #532 dual-refresh — and **every one was killed by a data question from Kyle** ("when were they opened?" / "why only 3?"). The actual cause (an unlocked promotion latch plus a silently-swallowed unique-constraint rejection) only surfaced after a census. Each wrong cause had been *plausible from the code as it stands today*; what distinguished them was history and measurement.
- **The A6 slippage "bug" (CC-C, 2026-07-28).** Reported as losses being flipped green. The net P&L was correct on 293/293 trades; the model was a deliberate, coherent ideal-trade-minus-frictions decomposition. **The intuitive fix (clamp total_cost ≥ 0) would have BROKEN a correct net on 57 rows.** Only reading what the accounting was built to express prevented that.
- **#534 (WITHDRAWN)** — a governed, Kyle-approved decision reported as a defect; the code comment beside it cited its own batch id and issue number.
- **#174** — a finding independently re-derived seven weeks after it was already filed, because the ledger was searched for the SYMPTOM rather than the FILENAME.
- **CC-A's `0.7` default** — a constant lifted out of a component being deleted and adopted as a baseline purely because "the dying file said so," which CC-A itself identified as the same inherited-claim-without-re-derivation failure.

**Why it is framed around the four dispositions.** Rule 24 requires classifying every find as a real defect, working-as-designed-but-unaddressed, or legacy that no longer fits. **That classification is literally unanswerable without knowing what the thing was built to do** — which is why the taxonomy kept getting collapsed into "it's a bug." The dispositions make the provenance read *actionable* rather than merely informative.

**On the token objection, pre-empted by Kyle when he gave the directive.** He raised it himself: this costs more context per batch. His answer, and it matches the measured record: *"we're already eating up a shit ton of tokens and context when we're trying to fix mistakes that have been made, or when we have to correct statements that were made, or when sessions go on wild goose chases for something they think is a bug, which turns out to be okay."* The read does not add cost — it **moves** cost from the expensive end (retraction, re-litigation, broken working code) to the cheap end (reading before writing).

**Scope of the extension.** §9.5(b) already required provenance for AUDITS and disputed behaviour. This directive makes it a **standing obligation for every implementation batch's scope**, and names the pre-governance corpora (`bridge/canonical/` + the old unorganised phase/batch reports) as first-class sources for anything predating the 2026-01/02 governance change — with the standing caveat that the canonical corpus records intent-at-the-time, is not current-state truth, and is never edited.

**Langston's four Step-4 amendments (2026-07-29), all adopted — each closes a way the rule as first written would have failed:**
- **(A) A fifth disposition: "disconnected and should STAY disconnected."** As first written, genuinely dead code hit no box, and the nearest were "reconnect it" — wrong, and the accidental-re-entry hazard §15 exists to prevent — or "connected but remove," which falsely asserts it is wired. **The rule mildly incentivised resurrecting things that should die.**
- **(B) An explicit "intent not recoverable" outcome, plus an evidence standard.** "A scope that cannot say which disposition applies is not finished," with no not-recoverable box, pressures a scope into picking the most plausible disposition and asserting it — **which is precisely the CC-A `0.7`-default failure the rule itself cites as motivation.** So: NAME the corpora searched, QUOTE the introducing commit verbatim rather than summarising it (#452 — a reviewer ruling on a gloss is ruling on the wrong artifact), and where intent cannot be recovered mark the disposition `INFERRED-FROM-CODE` rather than established (#453 — an asserted absence needs presence-evidence).
- **(C) Search FORMER filenames, and do not path-limit `git log -S`.** P19-B-RENAME (2026-07-03) renamed the entire `active-*` family plus three tables. Searching the CURRENT name returns nothing written during the years the file was called something else — the #174 failure mode reached by a different route.
- **(D) Tier the obligation.** "Every service/module/function/helper/route a batch touches" is unbounded on a 40-file batch, and **unbounded rules get quietly skipped** — which would have cost the rule everything. Tier 1 (full provenance) for anything whose BEHAVIOUR the batch changes; tier 2 (a one-line intent note) for things merely read or called. Kyle's cost argument is strongest on tier 1 anyway.

**A note on how this rule was itself produced.** It was written, reviewed, and amended in one pass — and the amendments were not cosmetic: two of them (A and B) identified ways the rule would have actively caused the failures it was written to prevent. That is the pairwise-review discipline working on governance text rather than on code, and it is worth remembering that a rule is as capable of being wrong as an implementation.

---

## §24.0 — every FOUND BUG gets its own provenance read (Kyle directive 2026-07-30)

**What happened.** Kyle read a session's chat and could not tell whether it was working one batch
or had been interrupted by an emergency fix. It was one batch throughout — `B-COST-MATH-CONSOLIDATION` —
whose Step-1 census surfaced four additional sites one after another. The reporting made a single
coherent investigation look like scatter.

His directive had two halves. The first was about communication (§5 rule 28's territory: report on
the batch you are working on). **The second created this rule:** *"scope every batch and every found
bug/error/misfunction by investigating the history and historical intent. Then judge if it is still
an error or something that needs to be updated."*

**The gap it closes.** §2 1.b already bound a BATCH to a provenance read, and rule 24 already said
judge on code + intent. But neither explicitly bound a bug **found mid-batch** — surfaced by an alert,
a reviewer, or in passing — to its OWN history read before disposition. That seam is where finds were
being judged on current code alone.

**The case that proves the cost is worth paying.** In the same batch, `routes.ts:12490` was found
reading `(portfolioState as any).startingBalance` — a column that does not exist on `portfolio_state` —
and silently falling back to `portfolioState.balance`, which then fed `cashBalance`, `currentBalance`
and `netPnlPercent` on a live user-facing route. **On the code alone this is an obvious defect.**
The intent read reversed it: `portfolio_state.balance` is an ANCHOR (measured: `2250.00`,
`anchor_version` 3, unchanged across fourteen days of active trading) that deliberately does not track
realized P&L — so the substituted field holds exactly the value the variable wanted, and the number
is **correct**. Rule-24 outcome 2, not outcome 1.

**And the reason it mattered rather than being a curiosity:** the obvious response to the neighbouring
#614 alarm (339 "balance mismatch" warnings) is *"make `balance` track realized P&L."* Doing that would
have silently broken this correct route — `1886.71 + (−363.29) = 1523.42` — with nothing failing.
That is the **second** appearance of this exact shape in one batch family; the first was
B-COST-ACCOUNTING-HONESTY, where clamping `total_cost ≥ 0` would have broken a correct net on 57 rows.
**In this subsystem the obvious fix to a loud symptom keeps breaking a quiet correct number, and only
the intent read distinguishes them.**

---

## §5.29 — Measurement discipline (Kyle-directed 2026-07-30; Langston-ruled; binds all four parties)

**What happened.** In one session CC-A made **eleven** claims that measurement overturned, and Kyle stopped the
work to ask why: *"I ask you simple questions and the whole premise of your implementation falls apart… I am
frustrated because now I can't trust your follow up assertions."* His sharper observation is the one that
produced the rule: **"This didn't seem to be an issue before, but now it is an every-batch issue."**

**The measured shape.** Ten of the eleven were a single class — *the object adjacent to the claim was measured*:
`patternType` "2.95% drift" was **28/28 = 100%** once filtered to the HYBRID population · a table hunt filtered
`LIKE '%trade%' OR '%vts%'` **cannot match `exit_decision_archive`**, producing "there is no trade archive" ·
`vts_open_trades` (52 MB, a **working** table) was reported as the whole closed-trade corpus · **33,301 shadow
counterfactual rows were counted against a sink that excludes them BY DESIGN, test-enforced**, producing a false
"93% of July is lost" · "zero `COMPUTE_MISS` in `out.log`" when `console.warn` goes to **stderr**.

**Langston's two corrections to the proposal, both of which improved it.** (1) **The population of errors was
itself off by one — the same shape being diagnosed.** #6 (a mechanism invented in a migration comment) is not a
targeting error: there was no measurement to control, so it is **confabulation**, and a gate governing how a
number is reported is silent on it — hence clause (c). The self-caught eleventh is *a working control, not a
defect*, and counting it inflated the denominator the fix was being sized against. (2) **A control on every
number would be abandoned inside a week**; the affordable, lab-standard form is a **positive control** required
only for load-bearing numbers, zeros, near-totals and absences.

**Why the rule is a FORMAT, not another reminder — the load-bearing finding.** Every rule needed to catch this
**already existed and was auto-loaded on every turn**: 25.c (*"a matching name is not a matching thing"*), 22,
§9.5(a), and the session's own memory line *"a head-N slice is NOT the population — measure the population"*
— filed under a heading that reads **"STANDING LESSONS (earned; do not re-learn)."** Three of the errors are
verbatim instances of two of those lines. ⇒ **Restatement was never going to work. The rules are consulted at
session start and at ANNOUNCE time; the failure occurs at MEASURE time.** Corroboration: the only behavioural
fixes that durably held in the same period are the two **hooks**, which require nobody to remember anything —
and Langston noted a third and stronger form we already use, §7.1's `DISABLED://` push URL, which makes the
wrong action *impossible* rather than intercepted.

**Why NOW and not before (Kyle's question).** The work changed class. Code-edit batches settle a claim by
reading a file, which is unambiguous. With active trading ON, nearly every claim is about **live data**, and a
live-data claim forces a choice of table, column, log stream, window, filter and population — **each one an
opportunity to hit the adjacent object.** Meanwhile the system accreted **lookalike pairs**: working table vs
archive · shadow vs real · JSON snapshot vs typed columns · `out.log` vs stderr · `vts_trades`-the-file vs
`vts_trades`-the-table-that-does-not-exist. All ten errors are a lookalike confusion, and the rules predate that
population existing.

**Self-demonstrating footnote, recorded because it is the best evidence for the rule.** Filing the issue number
for this very rule, form A (`^### #NNN`) returned max **621** and its positive control — *does this instrument
find the known-present #622?* — returned **0**. The instrument was right; the **ref was six commits stale**. The
control caught it, a fetch fixed it, and the correct answer (#623) followed. The rule worked on its own
authoring turn, and it is also a second witness for §7.1 step 0.
