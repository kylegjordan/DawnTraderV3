# BATCH B-GOV — Post-Batch Governance Checker (CONVERGED design, 2026-06-17)

> **Status:** Step-1 scope, converged design. **SUPERSEDES** `BATCH_B_GOV_SCOPE.md` (the 18-objective version — branches / merge-gate / PreToolUse spine / CLAUDE.md-into-config-scatter are all DROPPED per Kyle 2026-06-17). Keep ONLY the bot-mechanical / Langston-judgment model from the prior design.
> **Owner:** Claude Old (CC-A). Author for Langston Step-1 review.
> **Design lineage:** `Cross-Session Briefs/B_GOV_ADVERSARIAL_LANGSTON_2026-06-17.md` (the adversarial round that converged this), `B_GOV_ROCKSOLID_LANGSTON_REVIEW_2026-06-17.md`, `B_GOV_RESEARCH_SYNTHESIS_CCA_2026-06-16.md`, plus the 2026-06-17 Kyle design dialogue.

---

## 0. The problem (one paragraph)

Our written governance policy is good; ENFORCEMENT leaks. Docs that should update at batch-close sometimes don't — caught only when Kyle happens to ask (the B3b missing-pre-audit case is the canonical example). Kyle wants this moved out of prose and into tooling, but with a hard bar: **rock-solid, or he keeps the small leaks.** No speculative, scatter-heavy design. No new policy that spreads our governance to the four corners of the doc system on a "maybe."

## 1. What we are NOT building (rejected — record so it isn't re-proposed)

- **NO side branches / merge-gate.** Kyle's call: governing the branch-merge is itself an ungovernable, circular process; risk of unverified code reaching main from confusion. We stay straight-to-trunk: **Google Drive → GitHub (`migration/aws-supabase`) → staging.**
- **NO real-time block.** Honest ceiling, stated up front: there is no airtight pre-emptive block without the branch boundary Kyle rejected. This system **DETECTS a governance gap and drives it to a fix** — it does not physically prevent a push.
- **NO Discord governance agent.** Evaluated and dropped (pays a migration to enable the least-trustworthy function; an always-on watcher with no heartbeat is worse than nothing; wrong-nag trains dismissal).
- **NO scattering CLAUDE.md into config/rules/skills as part of this batch.** (Slimming may come later on its own merits; not coupled here.)

## 2. The shape of what we ARE building (plain language)

A **post-batch checker** with a clean split of labor:

- **The bot is the MECHANICAL side** — a deterministic script, no LLM, runs in seconds, cannot be talked out of its answer. It knows what to expect and reports facts: which docs are present, which are missing, which were touched-but-empty, whether the pre-audit was filed and structurally cites the right sources.
- **Langston is the JUDGMENT side** — the fallible, reasoning calls: "is this document actually thorough enough," "is this skip genuinely legitimate." The bot routes only real signal to him so he isn't spammed.

**Trigger:** the **code push to GitHub IS the alert to the checker.** When a batch's code lands, the checker starts watching for that batch's governance push to follow.

**Closed loop:** any gap the checker finds becomes a **persistent, stateful alert in the §10.5 system-alerts queue** (the one read every turn) — not just a Telegram message. It names the specific gap, stays ACTIVE until the actual fix lands and the checker re-verifies, and only then resolves. Kyle is the backstop, not the first line.

---

## 3. Numbered objectives + verification criteria

### Obj-1 — Push-trigger + batch linkage (deterministic)
The checker detects each code push to `migration/aws-supabase` and extracts the **batch-id** from the commit message(s) (e.g. `P19-B6`, `P19-B6.5a`). A push carrying a batch-id opens (or updates) a tracked "open batch" record. This depends on a **commit-message batch-id convention** — Obj-9 defines + documents it; the checker is only as good as that tag, so the tag becomes a governed convention.
- **Verify:** feed the checker a real recent push (e.g. B6.5a's code commit); it correctly identifies the batch-id and opens a tracking record. A push with NO batch-id is flagged as "untagged push — cannot govern" (itself a low-severity alert), never silently ignored.

### Obj-2 — Governance-push watch window with deadline **X**
After a batch's code push, the checker watches for that same batch-id's **governance push** (completion report + the Tier-1/Tier-2 doc updates) within a deadline **X**. If governance lands → run the mechanical check (Obj-3/4). If deadline **X** passes with no governance push for that batch-id → raise an alert ("batch P19-B6 code landed <X ago>, no governance push seen").
- **OPEN ITEM for Langston:** the value of **X**. It must be long enough not to false-alarm on a normal batch's own close cadence (code push and governance push can be minutes-to-hours apart), short enough to actually catch a real miss. Candidate: a generous fixed window (e.g. 24–48h) OR "next code push for a DIFFERENT batch-id arrives before this one's governance" (a strong signal the prior batch was abandoned mid-close). Settle in review.
- **Verify:** a batch whose governance lands inside **X** → no deadline alarm. A simulated batch with code-only and no governance past **X** → deadline alarm fires into the queue.

### Obj-3 — Mechanical doc-set check: file-by-file presence + emptiness (ROCK-SOLID)
Config-driven expected doc set per change-class. The checker reports, by name:
- **Presence:** "5 of 9 expected docs present; missing: BATCH_CATALOG entry, PHASE_HISTORY update, SIM update, RUNNING_ISSUES update."
- **Emptiness / no-op:** a doc that was touched but has ~0 net content change, or only a date-bump / TOC-reshuffle / whitespace — flagged as "present-but-empty," because reorganizing ≠ updating (CLAUDE.md §9 anti-pattern).
- **Verify:** run against a real recent clean close (should pass) AND against B3b's history (should flag the missing pre-audit) AND against a hand-made date-bump-only doc (should flag present-but-empty).

### Obj-4 — Mechanical pre-audit check: filed + cites SIM/System-Manual + code-level markers (ROCK-SOLID)
For batches whose class requires a pre-audit, the checker confirms a pre-audit doc exists for that batch-id AND that it structurally **cites the SIM and System Manual** AND carries **code-level markers** (file:line citations, not just prose). This is the structural half of "was a real audit done" — presence of the citations, not whether they're correct.
- **Verify:** a pre-audit with file:line citations + SIM references passes the structural check; a thin pre-audit with no citations is flagged for routing to Langston (Obj-5).

### Obj-5 — Judgment routing to Langston: "I don't believe this is sufficient — what's your read?"
When the mechanical check finds a **real signal of thinness** (a required doc present but suspiciously light; a pre-audit filed but with no/low code-level citation density), the checker routes THAT doc to Langston with a direct prompt: *"I don't believe this is sufficient — what is your read?"* Langston makes the call (genuinely thorough vs date-bump-dressed-as-update; citations actually support the claims). The checker does NOT route every doc — only flagged ones — so Langston isn't spammed.
- **Verify:** a flagged-thin doc produces a Langston dispatch (file-first per §6.5) and his verdict is recorded against the batch; a clean batch produces NO Langston routing.

### Obj-6 — Legitimate-skip exception valve (Langston-confirmed, auditable)
A doc can be marked **"N/A because <reason>"** so the checker doesn't force a hollow document ("we don't want documents posted up there that don't have real defining context"). The N/A must be **confirmed by Langston** (escalated to Kyle for bigger/ambiguous calls = three-way agreement), and is **recorded/auditable**. **Realistic flow (Kyle's own point):** because we lack the discipline to pre-declare skips, the alarm will usually fire FIRST, and the N/A-confirmation is the RESPONSE that clears it — that's fine, the alarm is the forcing function.
- **Verify:** an N/A marked + Langston-confirmed clears the specific alert and leaves an audit record; an N/A asserted WITHOUT confirmation does NOT clear the alert.

### Obj-7 — Closed loop into the stateful §10.5 alert queue
Every gap (missing doc, present-but-empty, missing/thin pre-audit, deadline miss, untagged push) becomes a **stateful alert** in the system-alerts queue: state `active` until the real fix lands; the checker **re-verifies on the next governance push** for that batch-id and only then flips the alert to `resolved`. Names the exact gap in plain language. Never auto-resolves on anything but a verified fix (or a confirmed N/A per Obj-6).
- **Verify:** raise a gap → alert `active`; push the fix → checker re-runs → alert `resolved`. Push an unrelated change → alert stays `active` (no false resolve).

### Obj-8 — Where the bot lives + how it sees Langston/CC posts (the agent-visibility question)
The MECHANICAL checker is a deterministic script; it needs a host that can (a) see GitHub pushes, (b) hold the watch-window timer, (c) open/close alerts, (d) dispatch to Langston. Proposed home: a small persistent watcher on the Hetzner box alongside the existing bridges (it can poll GitHub + use the same SSH→claude-cli path to reach Langston, sidestepping the Telegram bot-to-bot block entirely). The JUDGMENT side reuses the EXISTING Langston (no new standing agent — that was the cost/maintenance trap we rejected).
- **OPEN ITEM for Langston:** confirm host choice (Hetzner watcher vs a CI job vs hybrid) and the exact GitHub-watch mechanism. The watch-window-with-deadline requirement (Obj-2) makes a pure CI-on-push job insufficient on its own — a CI job can't wait X hours for a second push — which is why a small persistent watcher is the lean fit.
- **Verify:** the watcher survives a restart, re-reads open-batch state, and a push it missed while down is picked up on reconnect.

### Obj-9 — Batch-id commit-message convention (the linchpin, governed)
Because Obj-1/2 key everything off the batch-id in commit messages, that convention becomes a **governed rule**: code commits and governance commits for a batch carry the batch-id in a defined position. Documented in CLAUDE.md (a small, additive line — NOT a scatter) so both CC sessions follow it. Existing recent commits already do this informally ("P19-B6 Step-3", "P19-B6.5a governance"); we formalize it.
- **★ Kyle directive 2026-06-17 — the CLAUDE.md addition MUST include an explicit BATCH-AND-PHASE NAMING convention line**, not just "put the tag in the commit." It defines how batches AND phases are named so naming is consistent and the checker's parser is unambiguous:
  - **Phases:** `Phase NN` (e.g. Phase 19, Phase 24) — the milestone level.
  - **Batches:** the phase-scoped form `P<phase>-B<n>` (e.g. `P19-B6`); **sub-batches** append a dotted suffix (`P19-B6.5a`); **letter-named** standalone batches use `B-<NAME>` (`B-NAMES`, `B-GOV`); the historical `B-NEW-NN` form stays valid.
  - **Tag-in-commit rule:** every code/governance commit for a batch carries its batch-id at the START of the subject; pure-housekeeping commits (MEMORY-only / CLAUDE-only / cross-session-brief-only) are EXEMPT — they are not code pushes (pre-audit §1.b.i).
- **Parser consequence (from the triage):** the checker's tag parser MUST recognize **alpha/letter batch-ids** (`B-NAMES`, `B-GOV`), not only `P19-B\d` — the raw 68% tagging rate was a parser-coverage artifact; real code-push discipline is ~100% (pre-audit §1.b.i).
- **Verify:** the convention (including the batch+phase naming line) is written in CLAUDE.md; a probe over the last ~20 commits confirms the checker's parser matches the real-world tags including letter-named batches.

### Obj-10 — Self-test on its own close (dogfood)
B-GOV's OWN batch close is the first live test of the checker: it must correctly govern itself (expected docs present, this scope + its pre-audit + completion report + the governance updates all detected).
- **Verify:** run the checker against B-GOV's own close; it passes cleanly or names exactly what's missing.

---

## 4. The honest ceiling (stated plainly, because it's what makes this rock-solid not oversold)

- **Rock-solid / deterministic (the bot):** is the doc there, is it empty, was the pre-audit filed, does it structurally cite SIM/System-Manual, did governance arrive within X, is the push tagged. These are facts; the bot cannot be wrong about them and cannot be talked out of them.
- **Judgment / fallible (Langston):** is the content genuinely sufficient, is the audit genuinely thorough, is this skip legitimate. Routed to a separate context (Langston, already independent on his own box — satisfies "don't grade your own homework").
- **What it does NOT do:** physically block a push, or guarantee substance. It guarantees the gap is SEEN, NAMED, and kept ACTIVE in the queue we read every turn until really fixed. Kyle stops being the detector; he becomes the backstop.

## 5. OPEN ITEMS to settle with Langston in Step-1 review

1. **Deadline X** (Obj-2) — fixed window vs "next different-batch push" signal vs both.
2. **Thinness threshold** (Obj-5) — what mechanical signal trips a route-to-Langston, tuned to avoid spamming him.
3. **Exception-confirmation flow** (Obj-6) — exact bar for when an N/A needs Kyle (three-way) vs Langston alone.
4. **Bot host** (Obj-8) — Hetzner persistent watcher vs CI vs hybrid; GitHub-watch mechanism.
5. **Change-class → expected-doc-set config** (Obj-3) — confirm the per-class doc lists (batch / sub-batch / hotfix) against current §3 Tier-1/Tier-2.
6. **Hole-poke:** Langston to attack this design for failure modes we haven't seen — same adversarial mandate as the 2026-06-17 round.

## 6. Coordination + sequencing constraint (Kyle directive 2026-06-17)

**Do NOT commit any B-GOV artifact to `migration/aws-supabase` until coordinated with Claude New (CC-B), which is running live Phase-19 batches on the same branch.** The Langston review round needs ZERO commits (scope is staged to his inbox by copy). When B-GOV commits do happen (final scope, then the build), gate each on CC-B being at a clean point (between sub-batches), keep all B-GOV files in their own area so content can't collide, and check the recent commit history / ping CC-B by name before committing. The build itself is a proper batch sequenced into a gap in CC-B's work, not slipped in mid-stream.

---

## 7. STEP-1 RESOLUTIONS — Langston review 2026-06-17 (APPROVE to Step-2 with hardening)

Langston's verbatim verdict relayed to t21. Settlements below are folded in; the six open items are now CLOSED as stated. Framing note he led with: the whole system keys off two **self-declared** inputs — the **batch-id tag** and the **change-class** — declared by the same sessions being governed. That is the soft underbelly; most hardening protects those two inputs.

- **Item 1 — Deadline X = 24h fixed wall-clock, measured from the LAST code-bearing push for that batch-id** (multi-day Step-4/Step-9 iteration resets it). **DROP the "next different-batch push = abandonment" signal** — with CC-A and CC-B both pushing concurrently, a different-tag push is the normal state, not abandonment (Hole #7). Governance-bearing push is classified by PATH (touches completion-report path or `1-system-manual/` docs), no tag needed for that.
- **Item 2 — Thinness is a per-(change-class × doc) cell, not global.** Three bands: GREEN pass / AMBER route-to-Langston / RED deterministic gap. Floors keyed per doc-type; **starting floors derived empirically from the last ~10 clean closes** (Step-2 task). **★ Architecture-class pre-audits ALWAYS route to Langston regardless of citation density** — density is gameable (valid-format-but-wrong citations = the B72.1 failure), so the headline motivating case must always get human eyes.
- **Item 3 — N/A tiering by whether it fights the config.** Langston-alone when the N/A agrees with a CONDITIONAL marking; **three-way (escalate Kyle) when it overrides a REQUIRED doc** (esp. SIM/System-Manual on an arch batch) or is a repeat-skip pattern. **Durable record in-repo** (`GOVERNANCE_EXCEPTIONS.md` or appended to CHANGES_AND_FIXES) — greppable independent of the queue.
- **Item 4 — Host = Hetzner, but a systemd-TIMER tick poller, NOT a long-lived `while true` daemon** (corrects the scope's "persistent watcher"). Reasons: the §18 54-day watch-loop that choked the box; must be its OWN process isolated from the dawntrader event loop (`proj_cron_eventloop_misses`); restart-safety is native to a tick poller. **GitHub-watch = poll (`git fetch` / API since-last-SHA), not webhook.** Poller emits a **dead-man self-heartbeat** alert if it misses its own tick.
- **Item 5 — Doc set is CONDITIONAL, not flat.** Each doc per class = REQUIRED / CONDITIONAL(predicate) / N/A-allowed. **Bot is RED-certain ONLY on unconditionally-REQUIRED docs**; CONDITIONAL absence is at most a low-severity Langston-route (bot can't know from a diff whether a bug was fixed / param changed). **Change-class is DECLARED in the scope-file header** (folded into Obj-9); undeclared → default to STRICTEST (architecture/full) + flag. Sub-batch SYSTEM_MANUAL/SIM content is REQUIRED iff arch-changing (the P19-B4b D5 miss; §16 says a sub-batch is a batch for content purposes).

### New numbered objectives promoted from the hole-poke (build these)
- **Obj-11 — Backtest/calibration is a Step-2 GATE (Hole #5).** Run the checker over the last ~15–20 closed batches from git history; it MUST pass known-good clean closes (no false alarms) AND flag B3b's known missing pre-audit. Thresholds aren't ready until both reproduce; this is where Item-2 floors get tuned. Hard gate, not post-hoc.
- **Obj-12 — Misclassification guard (Hole #1, deepest).** Cheap diff-path heuristic: if the diff touches core engine paths (strategy-engine, MCE/SQE/TEC, regime, signal orchestrator) but class is declared non-architecture → route "class may be under-declared." Plus Langston reviews declared class at Step-1/Step-2.
- **Obj-13 — Re-verify decoupled from batch-id (Hole #3).** A fix often lands under a DIFFERENT tag or via direct GDrive edit. On ANY governance-bearing push (and on the poller timer), re-run the full mechanical check for ALL open batch-ids against CURRENT branch state; resolve on verified branch state, not a tag-matched event.
- **Obj-14 — Don't poison the shared §10.5 queue (Hole #4).** Tight rate-limit + high precision; a max-open-governance-alerts budget (exceeding it is itself the signal); the backtest (Obj-11) proves precision before go-live. The queue is our one reliable alert surface — flooding it trains dismissal across ALL categories.

### Other holes folded as build-time constraints
- **#6 self-governance circularity:** Langston MANUALLY verifies B-GOV's own dogfood (Obj-10) result rather than trusting the checker's self-PASS.
- **#8 force-push:** poller detects non-fast-forward, re-baselines, alerts "history rewrite."
- **#9 GDrive→GitHub seam:** source of truth is **GitHub `migration/aws-supabase`, full stop**; an unpushed doc reads as missing = correct by design (unpushed ≠ done) — stated so push-lag isn't argued as a false alarm.
- **#10 minimal-compliance arms race:** strip-whitespace/date/TOC emptiness logic hardened against DELIBERATE token-compliance; borderline routes to Langston, never auto-passes.

### Honest-ceiling amendment (§4)
"Rock-solid" is precise: deterministic ONLY on unconditionally-REQUIRED-doc presence/emptiness/filed-and-cites and the 24h deadline. CONDITIONAL-doc "should this have fired?" and all substance/thoroughness = judgment, routed to Langston. Misclassification of the self-declared class is the one structural hole the path-heuristic mitigates but cannot fully close — which is why Langston reviews the declared class at the gate.

**STATUS:** Step-1 CONSENSUS reached, then REOPENED by Kyle refinements (§8 below) — re-running past Langston. NOT committed — coordinate with CC-B before any commit (§6).

## 8. KYLE REFINEMENTS 2026-06-17 (post Step-1 consensus — re-run past Langston)

Kyle reviewed the Step-1 result and pushed back on three points. These REVISE items Langston already approved (the deadline value + umbrella handling) and ADD a CLAUDE.md-slim constraint, so they go back to Langston for a sanity check before Step-1 is truly closed.

### R1 — Deadline is TOO LONG at 24h → shorten to ~4h (settable), made safe by an explicit OPEN-BATCH state
Kyle: most batches close within a few hours, often under 12; 24h is too long. **The real reason isn't alert-loss** — the checker runs on the server and never forgets. **It's that a session reminded 24h late may have COMPACTED AWAY vital details** that should have been folded into the governance docs (the bug-context, the why-we-decided, the exact caller surface). A short deadline catches the forgotten close **while those details are still in the session's context.** That is the load-bearing justification for going short.
- **Proposal: deadline ~4h from the LAST code-bearing push (settable constant), NOT 24h.** 4h clears CI + deploy + first-pass verify but lands inside the normal few-hours close, so a genuinely-forgotten close surfaces the same working session while context is warm.
- **What makes a short deadline safe = an explicit OPEN-BATCH declaration (this also answers R3).** A batch that legitimately needs longer (soak-gated, waiting on Langston Step-8, multi-day, umbrella) is DECLARED open and the deadline timer does NOT run on it. The short timer therefore only ever applies to batches that genuinely should close fast. This REPLACES the "24h to avoid false alarms" reasoning: we get safety from the open-state, not from a long clock.
- Re-verify (Obj-13) + reset-on-last-push (Item 1) unchanged; only the wall-clock value changes and the open-state suppression is added.

### R2 — Umbrella batches with sub-batches (the OPEN-BATCH state, applied)
An umbrella/parent batch with mid-flight sub-batches stays OPEN and is NOT expected to produce a closing report or roll-up governance while open → **no deadline alarm on the umbrella while open.** Mechanics:
- Each **sub-batch closes on its own** when it lands, against ITS OWN diff, with the lighter sub-batch doc set (catalog + history entries, MEMORY sync, plan-board update; SIM/System-Manual content IFF it changed architecture per §16). The short deadline DOES apply per sub-batch.
- The **umbrella's final roll-up** (umbrella completion report confirming every sub-batch closed + catalog/history wrap-up) is required ONLY when the umbrella is DECLARED done — that declaration starts the umbrella's own close deadline.
- So nothing waits until the very end to be governed (each sub-batch is checked as it lands), but the umbrella is never nagged for a report it isn't supposed to write yet. (This is the old design-notes "Addition A — umbrella/running-progress governance," now realized via the open-state.)

### R3 — CLAUDE.md slim: KEEP ALL RULES ALWAYS-LOADED; extract ONLY the narrative. NO scatter.
Kyle is NOT comfortable scattering rules into separate / path-scoped / load-on-demand files — the risk is a rule simply NOT being loaded when needed, which is worse than a present-but-occasionally-skimmed rule. So:
- **Every rule stays in the single always-loaded CLAUDE.md.** No rules moved to `.claude/rules/`, no path-scoped conditional loading, no skills-for-rules, nothing off-by-default. **This explicitly OVERRIDES the research-synthesis "REAL slim levers = .claude/rules/ + skills" recommendation** for the rule TEXT — Kyle's load-guarantee requirement wins over the context-saving of conditional loading.
- **Strip only the NARRATIVE** — backstory, empirical "why," worked examples — out of each rule into the existing companion (`1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md`), leaving the terse imperative rule + a "see history §X" pointer. This shrinks the always-loaded footprint (which research says raises adherence to what remains) WITHOUT removing or de-loading any rule.
- Net: rule-without-the-essay, essay one click away. The slim is narrative-extraction, not rule-relocation.

**For Langston:** sanity-check R1 (4h + open-state vs his 24h), confirm R2 umbrella mechanics are airtight under two concurrent sessions, and confirm R3 doesn't break anything he relies on. Then Step-1 closes.

### STEP-1 CLOSED — Langston accepted all three (withdrew 24h for 4h), guardrails settled 2026-06-17

**R1 settled — 4h + open-state (Langston withdrew 24h; calls it cleaner than his own).** Guardrails:
- **Undeclared defaults to STRICT** (subject to the 4h timer), NEVER to "open." Forgetting to declare open is the safe-but-noisy failure, not the silent one — this is the hinge.
- **Alarm-first, declare-to-clear** — same valve as Obj-6 (we lack discipline to pre-declare; the 4h alarm fires, someone declares open, it clears — and the session is still warm, exactly Kyle's goal). No new mechanism.
- **Open suspends the DEADLINE only, NOT the eventual mechanical doc check.** Open ≠ exempt; full Obj-3/4 check still runs at actual close.
- **Open declarations logged greppable in-repo** (same as the Obj-6 N/A audit record).
- **48h backstop ping:** a batch open past ~48h emits a LOW-severity "still open — confirm?" alert. Open is a snooze with a sanity check, not an infinite mute (stops "declare open" becoming the arms-race escape hatch).
- **Step-2 validation:** measure the historical code-push→governance-push gap over the last ~10–20 closes; if p90 < 4h, 4h is empirically safe (confirms "most close in a few hours" with data). Fold into Obj-11. (A wall-clock deadline can't be replayed from git, but the gap distribution can.)

**R2 settled — umbrella airtight on four mechanics (concurrency already handled by the dropped-abandonment design):**
- **Umbrella declaration ENUMERATES its sub-batch namespace** (e.g. "P19-B6 umbrella owns P19-B6.*"). Parent-child is declared, never inferred — this is the hinge for "no deadline on umbrella, short deadline per sub-batch."
- **Close/done events EXACT-match batch-id, never prefix-match** (except the namespace-ownership lookup), so closing P19-B6 isn't confused with P19-B6.5a.
- **Obj-13 re-verify is open-state-aware:** skip deadline-eval on a declared-open umbrella; run the normal mechanical check on sub-batches as they close.
- **Umbrella-done is REJECTED (or routed to Langston) if any sub-batch in its namespace is still open or carries an active gap alert** — the teeth; stops "umbrella done" hiding an unclosed sub-batch. Done-declaration is OWNER-ONLY (per roster) so one session can't declare done while the other has a sub-batch in flight.

**R3 settled — judgment strip, not mechanical truncation:**
- **Operative content STAYS inline** — the imperative, plus enumerated lists / thresholds / exemplar-pointers / the one canonical example that shows how to APPLY the rule to a non-obvious case (the "why" is sometimes load-bearing for generalizing to an un-enumerated case). **True narrative GOES** — incident backstory, motivational essay, when-it-broke story.
- **Inline "see history §X" pointer at each stripped rule** — an actionable pointer beats silent removal; the agent must KNOW disambiguating narrative exists and where.
- **Langston reviews the slimmed CLAUDE.md diff** (Step-4 of that sub-batch) — it's his operating file; a wrong strip de-loads something he reasons from.
- **Companion (`_archive/CLAUDE_MD_RULE_HISTORY.md`) reachable via git / `ssh staging`, not only the gdrive working tree** — §18 read-hang risk if consulted from the FUSE mount.
- Orthogonal to the checker (slim touches CLAUDE.md rules; checker reads governance docs). The slim is its own light-doc-set sub-batch.

**Cross-cutting (the recurring underbelly):** R1 and R2 ADD two more self-declared inputs — the **open-batch state** and the **umbrella namespace claim**. Both get the SAME treatment as batch-id + change-class: **auditable in-repo record + strict default when undeclared + a cheap cross-check heuristic** (e.g. "a push arriving under a done-declared umbrella → flag," mirroring Obj-12's misclassification guard). With that, the refinements harden the design instead of quietly widening the self-declaration hole.

**STATUS: STEP-1 CLOSED** — CC-A + Langston full consensus, all of Kyle's refinements accepted with guardrails. Awaiting Kyle's go to Step-2 pre-audit (class config + empirical floors + the Obj-11 backtest/gap-distribution gate). NOT committed — coordinate with CC-B before any commit (§6).

---

*End B-GOV converged scope. Next: Kyle confirm → Step-2 pre-audit (class config + empirical floors + backtest gate), coordinated with CC-B for commit timing.*
