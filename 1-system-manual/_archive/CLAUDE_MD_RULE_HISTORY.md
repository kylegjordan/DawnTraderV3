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

*End of CLAUDE_MD_RULE_HISTORY.md archive companion. Cross-references from CLAUDE.md use the section labels (e.g., "see §1.PL", "see §5.16") to locate the full backstory here.*
