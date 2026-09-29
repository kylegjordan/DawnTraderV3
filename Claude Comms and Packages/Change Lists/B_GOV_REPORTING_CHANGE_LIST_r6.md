# B-GOV-REPORTING — CHANGE LIST r6 (2026-09-29) — for Langston, one gate at a time

## THE THREE DISPATCH FIELDS
| # | field | value |
|---|---|---|
| i | **declared change-class** | `non_architecture` (scope header, verbatim) |
| ii | **that class's doc set** | `SCOPE` — present, `Claude Comms and Packages/Scope Files/B_GOV_REPORTING_SCOPE.md` (r6 = §7) · `PRE_AUDIT` — **absent**, see (iii) · `COMPLETION_REPORT` — absent (Step 11 not reached) · `BATCH_CATALOG` — absent (lands at Step 10) · `PHASE_HISTORY` — absent (Step 10) · `SYSTEM_MANUAL` — judged N/A: no trading architecture, strategy, regime, filter, pipeline or math changes · `SYSTEM_IMPACT_MAP` — judged at Step 10 (the rules layer's own SIM entry, "Claude Code Hook Layer", is the candidate) · `CHANGES_AND_FIXES` — judged N/A: no bug/risk registry entry · `RUNNING_ISSUES` — present (`#1099` new; `#744`, `#980`, `#982` annotated) · `PHASE_19_PLAN` (conditional, `c`) — present: one due date swept · the active plan `SPRINT_TO_LIVE_PLAN.md` — this batch's row is §0's CC-A plate line; updated at close · `POST_AUDIT_ROADMAP` — judged N/A: no phase change · `DELETED_COMPONENTS_LOG` — judged N/A: nothing removed · `ADJUSTMENT_FRAMEWORK` — judged N/A: no parameter |
| iii | **Step 2** | **NO STEP 2 — this batch is RETROACTIVE: its edits were pushed before a scope existed (scope §1-§2b says so), and the scope stood in for the audit.** r6's §7 is the audit of what landed; a separate pre-audit document would restate it. ⚠️ Rule on whether that is acceptable — it is the `#1005` shape. |

## WHAT r6 IS
Every edit below carries out a ruling of yours that was never applied. Nothing new is decided here; where a ruling needed a judgement to apply, it is named. The reconstruction behind it (four readers, each attacked by a verifier, then a completeness pass over all 49 commits to the rule files since 2026-08-26) is summarised in the scope §7; the load-bearing findings were re-derived by CC-A at the ref.

## THE GATES, IN THE ORDER THEY WILL BE SENT (one per dispatch)
- **G1 — `CLAUDE.md` + shared `MEMORY.md`:** §9.4 annotation cut (your 08-27T15:59Z edit-6 condition (b)) and §10.5 whole-file read (#980, your 09-01T06:18Z). Plus: the alert hook now says `0 due` instead of staying silent, a tested manual read (`scripts/due-alerts.py`), the tail allowlist entries removed, the due-date sweeps, the sibling-check predicate, and your 09-13 sentence at step 3 — ANY unresolved row, scheduled, active or acknowledged, blocks the next mint of its key, so an event-wait alert is routed, not acked.
- **G2 — the reviewer loop:** `bug-investigation` gains your 08-28T07:15Z corrections it never received; the four workflow skills + bug-investigation stop calling the round count "the useful number"; workflow-11's condition-2 remnant. **And the read-back you never gave on edit 10's corrected text** (`37633550d`).
- **G3 — the tier ledger:** your 08-29T10:37Z BLOCKER-1/BLOCKER-2/graded column, the BLOCKED token (08-30T02:55Z), "prompt, not proof", 10.b's cap. **And the clearance of edit 11 r3-r5 you conditioned at 08-28T11:58Z.**
- **G4 — never put to you:** the Observation column paragraph (`a97a7325a`), the 2026-09-13 two-place wording (`f29e27f5c`) + scope §6, and `df368871f` (§6b rewrite + the base reviewer block).
- **G6 — everything the scope says goes to you "at the gate":** the §7d questions (10.b's three-way conflict, the phrase ban, claim-only vs the object round, Tier-1 vs the sub_batch matrix, row-8 item (v), the generated after-live list), the `B-GOV-LEDGER-GRADE` re-placement, the `MISTAKE_PATTERNS` candidate occurrence, and the `rules_change` ordering recorded on `#744`.
- **THE REVIEWER RECORD:** three fresh-reader rounds ran before this reached you and the loop hit its cap — the full record, with what each round found, what was fixed and what was declined and why, is `Change Lists/B_GOV_REPORTING_REVIEWER_ROUNDS_r6.md`.
- **G5 — two questions, no diff:** edit 7's `DISPOSITION:` values after §9.4 gained a fifth (the stored `CONDUCT.md` is 24,417 B, 159 B under its cap, so it fits without an eviction); edit 3's "scheduled ≠ verified" rider.

## THE r6 DIFF (rules files), against `origin/migration/aws-supabase` before r6

```diff
diff --git a/.claude/hooks/guard-measurement-shape.mjs b/.claude/hooks/guard-measurement-shape.mjs
index ced2bb497..acd9456c0 100644
--- a/.claude/hooks/guard-measurement-shape.mjs
+++ b/.claude/hooks/guard-measurement-shape.mjs
@@ -260,7 +260,7 @@ const SHAPES = [
     id: 'truncation-is-not-population',
     // ⛔⛔ `tail` IS DELIBERATELY NOT IN THIS SHAPE, AND THE REASON IS A PERMANENT FLOOR RATHER
-    // THAN A JUDGEMENT CALL. Governance MANDATES a tail on every turn — CLAUDE.md §10.5 requires
-    // `tail -50 …/system-alerts.jsonl` BEFORE RESPONDING TO ANY USER MESSAGE, and MEMORY.md item
-    // 4 requires `tail -30 …/cc-discord-inbox.jsonl` at session start. Both matched, both fired,
+    // THAN A JUDGEMENT CALL. Governance MANDATED a tail on every turn — CLAUDE.md §10.5 required
+    // `tail -50 …/system-alerts.jsonl` until 2026-09-29 (it now requires a whole-file read, #980),
+    // and MEMORY.md item 4 still requires `tail -30 …/cc-discord-inbox.jsonl` at session start. Both matched, both fired,
     // on a shape that CAN NEVER BECOME A CLAIM. ⇒ unlike batch-session contamination this never
     // washes out: it scales with turn count, in every session, forever. A guard that fires on a
diff --git a/.claude/hooks/inject-due-alerts.mjs b/.claude/hooks/inject-due-alerts.mjs
index 67824e252..5fe187a48 100644
--- a/.claude/hooks/inject-due-alerts.mjs
+++ b/.claude/hooks/inject-due-alerts.mjs
@@ -133,5 +133,10 @@ function main() {
   const [, due, total] = countLine.split('|');
   note({ decided: true, due: Number(due), total_ids: Number(total), ms });
-  if (!alerts.length) return; // genuine "no alerts" — the COUNT line proves the filter ran.
+  // Genuine "no alerts" — the COUNT line proves the filter ran. It is SAID, not left silent
+  // (B-GOV-REPORTING r6): §10.5 treats hook silence as "did not run", so zero must be visible.
+  if (!alerts.length) {
+    emit(`§10.5: 0 due alerts (whole file, ${total} ids; ${ms}ms) — the filter ran.`);
+    return;
+  }
 
   const shown = alerts.slice(0, MAX_INJECT);
diff --git a/.claude/memory/MEMORY.md b/.claude/memory/MEMORY.md
index 8a89550ec..60550f956 100644
--- a/.claude/memory/MEMORY.md
+++ b/.claude/memory/MEMORY.md
@@ -11,8 +11,8 @@
 ## SESSION-START PROTOCOL
 1. Read `CLAUDE.md` (§1 plain-language + CANONICAL-TERMS; §3 GOVERNANCE-TIERS; §5 NO-PATCHES; §6.5 Langston comms; §7.1 🔒storage; §9 SIM/SysManual-discipline + §9.3 UI-verify; §10.5 alerts).
-   - ★**GOVERNANCE (Kyle reinforced 2026-06-16):** per-batch state docs are UNCONDITIONAL every batch AND sub-batch (completion report + BATCH_CATALOG + PHASE_HISTORY + RUNNING_ISSUES updated/closed/produced + MEMORY + PHASE_19_PLAN progress) regardless of any SIM/SysManual change; SIM gets a CONTENT update when a component/cross-cutting-state changes, SysManual when architecture/strategy/regime/filter/signal-pipeline/math changes — judge applicability (don't pad: a display/data-quality service is SIM-scope not SysManual-scope), but NEVER skip-by-default + reorganizing-a-doc ≠ updating-its-content (CLAUDE.md §9 anti-pattern; the why = the doc map is what keeps the system buildable). Don't claim "closed" until every applicable Tier-1/Tier-2 doc landed.
+   - ★**GOVERNANCE (Kyle reinforced 2026-06-16):** per-batch state docs are UNCONDITIONAL every batch AND sub-batch (completion report + BATCH_CATALOG + PHASE_HISTORY + RUNNING_ISSUES updated/closed/produced + MEMORY + your SPRINT_TO_LIVE_PLAN row) regardless of any SIM/SysManual change; SIM gets a CONTENT update when a component/cross-cutting-state changes, SysManual when architecture/strategy/regime/filter/signal-pipeline/math changes — judge applicability (don't pad: a display/data-quality service is SIM-scope not SysManual-scope), but NEVER skip-by-default + reorganizing-a-doc ≠ updating-its-content (CLAUDE.md §9 anti-pattern; the why = the doc map is what keeps the system buildable). Don't claim "closed" until every applicable Tier-1/Tier-2 doc landed.
    - 🔒 **§7.1 STORAGE: GITHUB is the source of truth.** Each session works in its OWN clone (`C:\DawnTraderV3-old|-new|-analyst`), all on `migration/aws-supabase`. Flow: edit in your clone → test in your clone → **`git fetch origin` FIRST** → pull → push. **Git REJECTS a push from a clone that is behind — that is the system working: pull, then push.** Backups (Helsinki mirror, Drive bundle) are TERMINAL — never author in one, never push from one. Migrations are gitignored `*.sql` → `git add -f` + register in `drizzle/migrations/MANIFEST.txt`. ⛔ **CORRECTED 2026-09-21 (CC-B, Langston-caught): the rollback file goes IN GIT TOO — only the MANIFEST entry is forward-only.** This line read *"rollback files stay OUT"* and that is FALSE against the repo: **94 rollback files are tracked**, every sibling batch since 09-03 ships one, and acting on the old wording shipped a batch whose rollback existed only on one laptop — which is the one moment a rollback is needed and the one place it cannot be reached from. Sync gate = CLAUDE.md §7.1's four checks, preceded by `git fetch`.
 2. This file AND your own `MEMORY_CC_<X>.md` are **auto-loaded** (native for this shared file; the `load-own-memory.mjs` hook for your own) — no manual read needed. Confirm your own state loaded; if it didn't, read your file directly. Write volatile state ONLY to your own file. (Optionally read another session's for cross-visibility.)
-3. **§10.5 alerts (EVERY turn, before responding):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` — surface (a) state=active + acknowledged_at=null + triggers_at≤now, AND (b) ★GAP-FIX 2026-06-11 (Kyle caught b46b invisible): anything fired_at/acknowledged_at within last 24h where acknowledged_by=langston — Langston ACK ≠ resolved; his response lives in Helsinki /var/log/langston-alert-invokes.log; the follow-through WORK is usually CC s.
+3. **§10.5 alerts (EVERY turn, before responding):** WHOLE file filtered, never a `tail` (`#980`): hook `inject-due-alerts` lists (a); `ssh root@188.245.193.8 'python3 -' < scripts/due-alerts.py` gives their body+metadata, (b), and the fallback — surface (a) state=active + acknowledged_at=null + triggers_at≤now, AND (b) anything fired_at/acknowledged_at within last 24h where acknowledged_by=langston — Langston ACK ≠ resolved; his response lives in Helsinki /var/log/langston-alert-invokes.log; the follow-through WORK is usually CC s.
 4. Comms poll (Discord = the ONLY channel; Telegram DECOMMISSIONED 2026-07-02 B-TELEGRAM-DECOMM #348): `ssh root@204.168.141.77 "tail -30 /var/log/cc-discord-inbox.jsonl"`.
 4.5. **★ARM WAKE WATCHER — Monitor tool (`persistent: true`), NEVER Bash `run_in_background`** (a bg task only notifies on EXIT — the 06-19 trap). Command, executed verbatim (kept INLINE by design — post-compaction sessions must not need to follow a pointer to re-arm):
@@ -23,5 +23,5 @@
 4.8. **★ POST ONLY TO DISCORD.** All crew comms go through **Discord #general** (+ the Desktop conversation for Kyle). Telegram no longer exists as a path (decommissioned 2026-07-02; `cc-comms-bridge` removed).
 5. Plain language EVERY Kyle msg (Discord #general + Desktop; Telegram rollback-only per 4.6/4.8), two-para default, % WITH raw counts. CANONICAL TERMS (CLAUDE.md §1, strengthened 2026-06-13 — emphatic): "regime" not "market condition"; "xStock" not "stocks"; **"live mode" NEVER "real money mode"/"real-money trading"/any paraphrase**; use the ACTUAL component names — **MCE, TCL, TEC, SQE, VTS, signal orchestrator, RTB (ready-to-buy queue/refresh/pool), paper mode, live mode** + IMF/DBS/LQ/VN/DI as-is — NO made-up casual references.
-5.5. **★DAILY CURRENCY CHECK (Kyle 2026-06-13, expanded 2026-06-16, CLAUDE.md rule 21):** persistent scheduled task `daily-claude-model-check` (~9:22am local) — PART A: newer/stronger Claude model; **PART B (NEW): new Claude Code FEATURES/functionality useful to DawnTrader** (dedup ledger `1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md`; assess vs how we work; surface + recommend, Kyle decides; append+commit ledger). Messages Kyle (Discord #general) ONLY if model OR feature found (silent otherwise). **⚠️ AVAILABILITY confirmed TWO ways, NEVER the app model dropdown (it lists SHUT-DOWN models — Fable 5 shows but errors): (a) Anthropic OFFICIAL site (docs.claude.com/anthropic.com news/status), AND (b) LIVE one-off test invocation on Langston box `claude -p --model <id> "OK"` → returns text = usable; errors "model may not exist or you may not have access" = NOT usable (also re-test claude-fable-5 daily to catch its return).** ⛔ **DO NOT STATE LANGSTON’S MODEL HERE — READ IT FROM THE TWO LIVE SITES.** `discord-langston-bridge.py:69` (chat) and `langston-call:38` (alert/queue). ⚠️ **MEASURED 2026-08-23: this line was WRONG for 17 days.** It asserted `claude-fable-5[1m]` "switched 2026-08-06"; both live sites read **`claude-opus-5[1m]`**. The Fable 5 switch either never landed or was reverted — and **this file PREDICTED that**, carrying the note *"repo-mirror commit of the bridge model line still owed — until it lands a comms-infra deploy silently reverts the chat path."* **The prediction came true and nobody read it back.** ★ **THE LESSON, which is bigger than the model: AN ALWAYS-LOADED FILE MUST NOT ASSERT A LIVE CONFIG VALUE.** It has no link to the value, nothing compares them, and every session then loads the wrong fact with full confidence. **Name WHERE to read it, never WHAT it currently is.** (Same class as the governance docs asserting a 30-observation window against a live 100 — #739/#740 family.) Prior: Opus 5 `[1m]` 07-27→08-06. NEVER switch unilaterally → surface + recommend; Langston switch repeats the live test BEFORE bridge-flip + rollback backup.
+5.5. **★DAILY CURRENCY CHECK (Kyle 2026-06-13, expanded 2026-06-16, CLAUDE.md rule 21):** persistent scheduled task `daily-claude-model-check` (~9:22am local) — PART A: newer/stronger Claude model; **PART B (NEW): new Claude Code FEATURES/functionality useful to DawnTrader** (dedup ledger `1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md`; assess vs how we work; surface + recommend, Kyle decides; append+commit ledger). Messages Kyle (Discord #general) ONLY if model OR feature found (silent otherwise). **⚠️ AVAILABILITY confirmed TWO ways, NEVER the app model dropdown (it lists SHUT-DOWN models — Fable 5 shows but errors): (a) Anthropic OFFICIAL site (docs.claude.com/anthropic.com news/status), AND (b) LIVE one-off test invocation on Langston box `claude -p --model <id> "OK"` → returns text = usable; errors "model may not exist or you may not have access" = NOT usable (also re-test claude-fable-5 daily to catch its return).** ⛔ **DO NOT STATE LANGSTON’S MODEL HERE — READ IT FROM THE TWO LIVE SITES.** `discord-langston-bridge.py:69` (chat) and `langston-call:38` (alert/queue). ⚠️ **MEASURED 2026-08-23: this line was WRONG for 17 days.** It asserted `claude-fable-5[1m]` "switched 2026-08-06"; both live sites read **`claude-opus-5[1m]`**. The Fable 5 switch either never landed or was reverted — and **this file PREDICTED that**, carrying the note *"repo-mirror commit of the bridge model line still owed — until it lands a comms-infra deploy silently reverts the chat path."* **The prediction came true and nobody read it back.** ★ **THE LESSON, which is bigger than the model: AN ALWAYS-LOADED FILE MUST NOT ASSERT A LIVE CONFIG VALUE.** It has no link to the value, nothing compares them, and every session then loads the wrong fact with full confidence. **Name WHERE to read it, never WHAT it currently is.** (Same class as the governance docs asserting a 30-observation window against a live 100 — #739/#740 family.) NEVER switch unilaterally → surface + recommend; Langston switch repeats the live test BEFORE bridge-flip + rollback backup.
 6. Acknowledge readiness in one line.
 
@@ -56,5 +56,5 @@
 ⛔⛔ **AND THE ONE EVERY SESSION MUST KNOW (`#1004`): `dt-deploy` DOES NOT INSTALL ITSELF.** A deploy leaves `/usr/local/bin/dt-deploy` untouched — measured. **If you change that script, INSTALL IT BY HAND and verify `sha256sum` equals the blob at the deployed sha.** The comparator exists (`daily_deploy_check.sh:33-38`) and nothing schedules it; arming that is `P19-B12`.
 
-**★ THE HOOK LAYER IS LIVE (B-MEASURE-GATE leg 2, closed 2026-09-02, CC-A):** every session now runs warn-only guards at MEASURE time — `guard-measurement-shape` / `guard-stale-fetch` / `guard-ci-cited` (PreToolUse), `guard-result-shape` (PostToolUse), and **`inject-due-alerts` does the §10.5 read as a whole-file hook on every prompt with FULL alert ids** (the mandated `tail -50` saw 4 of 11 due alerts — #980; the `CLAUDE.md` wording change is homed at B-GOV-REPORTING (iv)). ⛔ **A guard's silence is NON-EVIDENTIAL — its header says so.** ⛔ **ACK SILENCES AN EVENT-WAIT ALERT and there is no unack verb (#982) — owned = routed, row left active.** Registry: SYSTEM_IMPACT_MAP "Claude Code Hook Layer". Other clones run the version their last session start refreshed (`B-HOOK-ESTATE-VERSION`, CC-C).
+**★ THE HOOK LAYER IS LIVE (B-MEASURE-GATE leg 2, closed 2026-09-02, CC-A):** every session now runs warn-only guards at MEASURE time — `guard-measurement-shape` / `guard-stale-fetch` / `guard-ci-cited` (PreToolUse), `guard-result-shape` (PostToolUse), and **`inject-due-alerts` does the §10.5 read as a whole-file hook on every prompt with FULL alert ids** (a `tail -50` saw 4 of 11 due — #980; `CLAUDE.md` fixed 2026-09-29). ⛔ **A guard's silence is NON-EVIDENTIAL — its header says so.** ⛔ **ACK SILENCES AN EVENT-WAIT ALERT and there is no unack verb (#982) — route, don't ack; ANY unresolved row blocks its key's next mint.** Registry: SYSTEM_IMPACT_MAP "Claude Code Hook Layer". Other clones run the version their last session start refreshed (`B-HOOK-ESTATE-VERSION`, CC-C).
 
 **★ A COMPLETION REPORT WITHOUT THE T1 TASK-LIST ROW NOW RAISES `gov-ledgerrow` (checker, 2026-09-11, `#1009`)** — add the row and it clears itself; genuinely N/A ⇒ a confirmed `na-skip` `task_lists` row.
diff --git a/.claude/settings.local.json b/.claude/settings.local.json
index efba293d7..eebc6ada6 100644
--- a/.claude/settings.local.json
+++ b/.claude/settings.local.json
@@ -91,11 +91,8 @@
       "mcp__Claude_in_Chrome__get_page_text",
       "mcp__Claude_in_Chrome__form_input",
-      "Bash(tail -50 /var/log/dawntrader/system-alerts.jsonl 2>&1 | head -60)",
+      "Bash(ssh root@188.245.193.8 'python3 -' < scripts/due-alerts.py)",
       "Bash(ssh root@204.168.141.77 'systemctl is-active discord-cc-bridge.service discord-langston-bridge.service; echo \"---\"; stat -c %y /var/log/cc-discord-inbox.jsonl')",
       "Bash(ssh root@204.168.141.77 \"systemctl is-active discord-cc-bridge.service discord-langston-bridge.service; stat -c %y /var/log/cc-discord-inbox.jsonl\")",
-      "Bash(ssh root@188.245.193.8 \"tail -20 /var/log/dawntrader/system-alerts.jsonl\")",
       "Bash(ssh -o ConnectTimeout=15 root@204.168.141.77 'systemctl is-active discord-cc-bridge.service discord-langston-bridge.service; stat -c %y /var/log/cc-discord-inbox.jsonl')",
-      "Bash(ssh root@188.245.193.8 'tail -20 /var/log/dawntrader/system-alerts.jsonl')",
-      "Bash(ssh root@188.245.193.8 \"tail -30 /var/log/dawntrader/system-alerts.jsonl\")",
       "Bash(ssh root@204.168.141.77 \"sudo -u langston bash -c 'export CLAUDE_CODE_OAUTH_TOKEN=\\\\$\\(cat /etc/langston/oauth.env | cut -d= -f2-\\) && export HOME=/home/langston && /usr/bin/claude -p --model claude-fable-5 --permission-mode bypassPermissions \\\\\"reply with the single word OK\\\\\"'\")",
       "Bash(ssh root@204.168.141.77 'systemctl is-active discord-cc-bridge.service discord-langston-bridge.service; stat -c %y /var/log/cc-discord-inbox.jsonl')",
diff --git a/.claude/skills/bug-investigation/SKILL.md b/.claude/skills/bug-investigation/SKILL.md
index 6877fedbb..b0c2ad236 100644
--- a/.claude/skills/bug-investigation/SKILL.md
+++ b/.claude/skills/bug-investigation/SKILL.md
@@ -44,13 +44,12 @@ description: BUG INVESTIGATION ONLY - what to do when you think you have found a
 ⚠️ **EACH ROUND GETS A *FRESH* REVIEWER.** Re-using one that has seen your earlier draft rebuilds the memory-of-forming-the-belief that the boundary exists to remove. **Round 3’s reader must not know what rounds 1 and 2 said.**
 
-⛔⛔ **TERMINATION IS A GATE, NOT A VERDICT — AND THIS IS THE LINE THAT KEEPS THE LOOP HONEST (Langston’s condition (i), which the loop would otherwise collide with).**
-- ✅ **What a quiet final round licenses: DISPATCHING.** You may proceed to Langston.
-- ⛔ **What it NEVER licenses: SAYING THE FINDING IS CORRECT.** *"The reviewer agreed"* / *"it came back clean"* **may not be written in the dispatch, the scope or the report** — a clean is not evidence (#453), and Langston will bounce it as one.
-★ **Both hold at once because they answer different questions: the loop decides WHEN YOU ARE DONE ITERATING; it does not decide WHETHER YOU ARE RIGHT. Langston decides that, and the loop exists to stop wasting his rounds on errors a reader could have caught.**
-✅ **KYLE’S OWN FRAMING, and it is narrower than "clean" — the loop closes when THE REVIEWER’S OWN CALLED-OUT ITEMS ARE SATISFIED, nothing wider: *"that is the best version of what they can put forward in front of Langston."*** ⛔ **NOT *"this is correct."* Langston still pokes holes in it, and is expected to.**
+⛔⛔ **TERMINATION IS A GATE, NOT A VERDICT.** ✅ **A quiet final round licenses DISPATCHING to Langston. It never licenses saying the finding is CORRECT** — a clean is not evidence (#453). ★ **The loop decides WHEN YOU ARE DONE ITERATING; Langston decides WHETHER YOU ARE RIGHT.** ✅ **Kyle's own framing, and it is narrower than "clean": the loop closes when THE REVIEWER'S OWN CALLED-OUT ITEMS ARE SATISFIED — *"that is the best version of what they can put forward in front of Langston."*** Langston still pokes holes in it, and is expected to.
+⛔⛔ **AND IT IS ENFORCED BY A DELETION TEST, NOT BY BANNING A PHRASE (Langston, 2026-08-28).** ⚠️ **A pressured session will never type *"the reviewer agreed"*; it will type *"three rounds, converged"* — identical warrant, none of the banned words. A phrase ban polices a string; the inference routes around strings.** ⛔ **And the plain ban stands too:** *"The reviewer agreed"* / *"it came back clean"* **may not be written in the dispatch, the scope or the report** (Langston 07:27Z: *"'The reviewer agreed' stays banned"*). ✅ **THE TEST, ten seconds: STRIKE EVERY MENTION OF THE LOOP FROM THE DISPATCH. If the finding still stands on its own citations — object, population, mechanism-with-line — dispatch it. If anything sags, it was never a finding.** ⛔ **The round count is not evidence either.**
 
-⚠️ **TWO WAYS THE LOOP FAILS — WATCH FOR BOTH, THEY ARE NOT HYPOTHETICAL:**
-1. ⛔ **CONVERGENCE BY EROSION.** Rounds can end quietly because the claim has been weakened until it asserts nothing. ★ **Before dispatching, read the FIRST version against the LAST: if the finding got smaller every round, you did not verify it — you dissolved it, and the honest output is `NO WORK — WITHDRAWN` (§9.4 disposition 5), not a thin finding.**
-2. ⛔ **A LOOP THAT WILL NOT CLOSE.** **Cap it at THREE rounds.** Still contested ⇒ **stop and dispatch BOTH positions to Langston**, saying what the reviewer holds and what you hold. **Do not keep spawning until one of you yields — that selects for persistence, not truth.**
+⛔⛔ **TERMINATION REQUIRES AN *OBJECT* ROUND — A `claim-only` CLEAN MAY NOT CLOSE THE LOOP (Langston).** ★ **A reviewer that never reached the artifact is silent with zero opportunity.** ⚠️ **How this combines with the claim-only rule above is an open question to Langston (`B-GOV-REPORTING` scope §7d); his ruling lands in that batch's completion report, and this line is rewritten to it. Until then, satisfy BOTH: claim-only rounds, and a last round that reads the object at the ref.**
 
-**RECORD EVERY ROUND, not just the last:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round COUNT is the useful number — a finding that took three rounds and one that took none are not equally trustworthy, and only the record can tell them apart later.**
+⚠️ **TWO WAYS THE LOOP FAILS:**
+1. ⛔ **EROSION — AND *SHRINKAGE IS NOT THE SIGNAL* (Langston, 2026-08-28).** A finding can narrow hard and survive on a different mechanism — that is healthy. ★ **THE DISCRIMINATOR: did each round replace a checkable assertion with a NARROWER CHECKABLE ONE, or with a HEDGE?** ⇒ **apply rule 29 to the FINAL text — object, population, and something that would falsify it. If those three survive, the narrowing was healthy however much it shrank. If not, withdraw under §9.4 disposition 5.**
+2. ⛔ **A LOOP THAT WILL NOT CLOSE — CAP AT THREE ROUNDS.** ⛔ **The cap outcome is NOT NEUTRAL: send Langston the FULL ROUND RECORD and BOTH POSITIONS — what the reviewer holds and what you hold — because the unresolved disagreement is the first thing he rules on, before the substance.** Iterating to agreement selects for persistence, not truth.
+
+**RECORD EVERY ROUND, not just the last:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round record is the MECHANISM's own denominator — how often the loop runs and how often it closes — and never EVIDENCE that a finding is right.**
diff --git a/.claude/skills/workflow-02-audit-and-plan/SKILL.md b/.claude/skills/workflow-02-audit-and-plan/SKILL.md
index ccc16a96f..ef0f72abb 100644
--- a/.claude/skills/workflow-02-audit-and-plan/SKILL.md
+++ b/.claude/skills/workflow-02-audit-and-plan/SKILL.md
@@ -125,5 +125,5 @@ Before cutting ANY code, **enumerate the state it WRITES and grep for READERS of
 1. ⛔ **EROSION — AND *SHRINKAGE IS NOT THE SIGNAL* (Langston corrected my diagnostic, 2026-08-28).** ⚠️ **#675 narrowed hard under his own retraction and the disposition SURVIVED on a different mechanism — that was CORRECT narrowing.** ★ **THE DISCRIMINATOR: did each round replace a checkable assertion with a NARROWER CHECKABLE ONE, or with a HEDGE?** ⇒ **apply rule 29 to the FINAL text — object, population, and something that would falsify it. If those three survive, the narrowing was healthy however much it shrank. If not, withdraw under §9.4 disposition 5.**
 2. ⛔ **A LOOP THAT WILL NOT CLOSE — CAP AT THREE ROUNDS.** ⛔ **The cap outcome is NOT NEUTRAL: send the FULL ROUND RECORD, because the unresolved disagreement is the first thing Langston rules on, before the substance.** **Iterating to agreement selects for persistence, not truth.**
-**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round COUNT is the useful number — a finding that took three rounds and one that took none are not equally trustworthy.**
+**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round record is the MECHANISM's own denominator — how often the loop runs and how often it closes — and never EVIDENCE that a finding is right.**
 
 ## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
diff --git a/.claude/skills/workflow-04-code-review/SKILL.md b/.claude/skills/workflow-04-code-review/SKILL.md
index 9b61f9eac..2da585985 100644
--- a/.claude/skills/workflow-04-code-review/SKILL.md
+++ b/.claude/skills/workflow-04-code-review/SKILL.md
@@ -98,5 +98,5 @@ Watch for his pickup. **No engagement in ~8-10 min → re-poke. Escalate after 2
 1. ⛔ **EROSION — AND *SHRINKAGE IS NOT THE SIGNAL* (Langston corrected my diagnostic, 2026-08-28).** ⚠️ **#675 narrowed hard under his own retraction and the disposition SURVIVED on a different mechanism — that was CORRECT narrowing.** ★ **THE DISCRIMINATOR: did each round replace a checkable assertion with a NARROWER CHECKABLE ONE, or with a HEDGE?** ⇒ **apply rule 29 to the FINAL text — object, population, and something that would falsify it. If those three survive, the narrowing was healthy however much it shrank. If not, withdraw under §9.4 disposition 5.**
 2. ⛔ **A LOOP THAT WILL NOT CLOSE — CAP AT THREE ROUNDS.** ⛔ **The cap outcome is NOT NEUTRAL: send the FULL ROUND RECORD, because the unresolved disagreement is the first thing Langston rules on, before the substance.** **Iterating to agreement selects for persistence, not truth.**
-**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round COUNT is the useful number — a finding that took three rounds and one that took none are not equally trustworthy.**
+**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round record is the MECHANISM's own denominator — how often the loop runs and how often it closes — and never EVIDENCE that a finding is right.**
 
 ## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
diff --git a/.claude/skills/workflow-07-verify-cc/SKILL.md b/.claude/skills/workflow-07-verify-cc/SKILL.md
index ce6cb5e89..9184c3156 100644
--- a/.claude/skills/workflow-07-verify-cc/SKILL.md
+++ b/.claude/skills/workflow-07-verify-cc/SKILL.md
@@ -86,5 +86,5 @@ With active trading on, **most changes have a staging-visible surface.** For any
 1. ⛔ **EROSION — AND *SHRINKAGE IS NOT THE SIGNAL* (Langston corrected my diagnostic, 2026-08-28).** ⚠️ **#675 narrowed hard under his own retraction and the disposition SURVIVED on a different mechanism — that was CORRECT narrowing.** ★ **THE DISCRIMINATOR: did each round replace a checkable assertion with a NARROWER CHECKABLE ONE, or with a HEDGE?** ⇒ **apply rule 29 to the FINAL text — object, population, and something that would falsify it. If those three survive, the narrowing was healthy however much it shrank. If not, withdraw under §9.4 disposition 5.**
 2. ⛔ **A LOOP THAT WILL NOT CLOSE — CAP AT THREE ROUNDS.** ⛔ **The cap outcome is NOT NEUTRAL: send the FULL ROUND RECORD, because the unresolved disagreement is the first thing Langston rules on, before the substance.** **Iterating to agreement selects for persistence, not truth.**
-**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round COUNT is the useful number — a finding that took three rounds and one that took none are not equally trustworthy.**
+**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round record is the MECHANISM's own denominator — how often the loop runs and how often it closes — and never EVIDENCE that a finding is right.**
 
 ## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
diff --git a/.claude/skills/workflow-10-governance/SKILL.md b/.claude/skills/workflow-10-governance/SKILL.md
index 47f31eeac..d35efdde9 100644
--- a/.claude/skills/workflow-10-governance/SKILL.md
+++ b/.claude/skills/workflow-10-governance/SKILL.md
@@ -90,4 +90,5 @@ When a substantive asset-class-onboarding learning surfaces in ANY batch, fold i
 ★★ **AND THE SECOND HALF OF HIS REASON IS THE REAL ONE: *"it gets them in the habit of looking at every file in our tiered governance system — and sometimes just looking at something reminds you that you need to do something."*** ⇒ **the table's job is to put EVERY name in front of you. The verdict column is the by-product; the ENUMERATION is the point.**
 
+⚠️ **THE LEDGER IS A PROMPT, NOT A PROOF.** It makes each row exist; it cannot stop a row being filled in falsely — twice a ledger ticked `✅` against a document holding zero mentions of the batch, and **the checker caught it, not the author** (`B-DISAGREEMENT-FINDER`, 2026-08-31). **The independent detector is the governance checker, on the `R` rows.**
 ⛔ **POST IT WHOLE. EVERY ROW, EVERY BATCH — including the `N/A`s.** ⚠️ **A table with the `N/A` rows deleted defeats it entirely: a short list is exactly what it exists to make visible.**
 ⛔ **EVERY ROW CARRIES A VERDICT *AND* ONE LINE — see the table below for what that line says.** **Keep it to a sentence: the substance is in the documents; this is an index.**
@@ -103,33 +104,45 @@ When a substantive asset-class-onboarding learning surfaces in ANY batch, fold i
 | document | architecture | non_architecture | sub_batch | hotfix |
 |---|---|---|---|---|
-| the batch `SCOPE` | **REQUIRED** | **REQUIRED** | judged | judged |
-| the batch `PRE_AUDIT` | **REQUIRED** | **REQUIRED** | judged | judged |
-| `COMPLETION_REPORT` | **REQUIRED** | **REQUIRED** | **REQUIRED** | judged |
-| `BATCH_CATALOG.md` | **REQUIRED** | **REQUIRED** | **REQUIRED** | judged |
-| `PHASE_HISTORY.md` | **REQUIRED** | **REQUIRED** | **REQUIRED** | judged |
-| `SYSTEM_MANUAL.md` | **REQUIRED** | judged | judged | judged |
-| `SYSTEM_IMPACT_MAP.md` | **REQUIRED** | judged | judged | judged |
-| `CHANGES_AND_FIXES.md` | judged | judged | judged | ⛔ **REQUIRED — the ONLY one a hotfix must have** |
-| `PHASE_19_PLAN.md` · shared `MEMORY.md` + your own `MEMORY_CC_<X>.md` · Langston’s `MEMORY.md` | **REQUIRED** | **REQUIRED** | **REQUIRED** | **REQUIRED** |
-| every other row in the ledger below | judged | judged | judged | judged |
-
-⚠️ **THE THREE LOCAL-STATE ROWS ARE REQUIRED IN *EVERY* CLASS, HOTFIX INCLUDED, AND THAT IS DELIBERATE — they are how the NEXT session and Langston find out what happened.** ★ **The governance checker does not grade them (they are not in its `CLASS_DOCSET`), so nothing but this row asks.**
+| the batch `SCOPE` | **REQUIRED** · R | **REQUIRED** · R | judged · R* | **REQUIRED** (`workflow-hotfix` §2.35) · R* |
+| the batch `PRE_AUDIT` | **REQUIRED** · R | **REQUIRED** · R | judged · c | judged · — |
+| `COMPLETION_REPORT` | **REQUIRED** · R | **REQUIRED** · R | **REQUIRED** · R | judged · c |
+| `BATCH_CATALOG.md` | **REQUIRED** · R | **REQUIRED** · R | **REQUIRED** · R | **REQUIRED** (`workflow-hotfix` §5, one row) · — |
+| `PHASE_HISTORY.md` | **REQUIRED** · R | **REQUIRED** · R | **REQUIRED** · R | judged · — |
+| `SYSTEM_MANUAL.md` | **REQUIRED** · R | judged · c | judged · c | judged · — |
+| `SYSTEM_IMPACT_MAP.md` | **REQUIRED** · R | judged · c | judged · c | judged · — |
+| `CHANGES_AND_FIXES.md` | judged · c | judged · c | judged · c | ⛔ **REQUIRED · R — the one document the CHECKER requires of every hotfix** (a `P19-*` one also owes `PHASE_19_PLAN`) |
+| `RUNNING_ISSUES.md` | judged · c | judged · c | judged · c | judged · — |
+| `POST_AUDIT_ROADMAP.md` | judged · c | judged · c | judged · — | judged · — |
+| `DELETED_COMPONENTS_LOG.md` | judged · c | judged · c | judged · c | judged · c |
+| `ADJUSTMENT_FRAMEWORK.md` | judged · c | judged · c | judged · c | judged · — |
+| `PHASE_19_PLAN.md` (history) | ⛔ **R for a `P19-*` batch, ANY class** (`REQUIRED_IF`); otherwise c | same | same | same, but — |
+| the ACTIVE plan — `SPRINT_TO_LIVE_PLAN.md`: your row | **REQUIRED if the batch has a row there** · — | same | same | same |
+| shared `MEMORY.md` + your own `MEMORY_CC_<X>.md` · Langston’s `MEMORY.md` | **REQUIRED** · — | **REQUIRED** · — | **REQUIRED** · — | **REQUIRED** · — |
+| your own session task list (the other three: `N/A — not mine`) | **REQUIRED** · ledger row | **REQUIRED** · ledger row | **REQUIRED** · ledger row | **REQUIRED** · ledger row |
+| every other row in the ledger below | judged · — | judged · — | judged · — | judged · — |
+
+**THE TOKEN AFTER THE DOT IS WHAT THE GOVERNANCE CHECKER DOES WITH THAT CELL** (`scripts/governance-checker/config.mjs`, `DOCS` + `CLASS_DOCSET` + `REQUIRED_IF`): **`R`** = graded as required, absence raises an alert · **`c`** = conditional in the config — ⚠️ **but the live poller grades REQUIRED documents only** (`poller.mjs:315` and `:698` both pass `requiredOnly: true`), **so today a `c` cell has no instrument either** · **`—`** = **NO INSTRUMENT AT ALL — only this table asks** · **`ledger row`** = graded as a row INSIDE the completion report (`gov-ledgerrow`), not as a document · **`R*`** = no scope file makes the checker treat the class as UNDECLARED and grade the batch as `architecture`, where the scope is required (`poller.mjs`, class-undeclared) — so a missing scope is caught in every class — unless a confirmed `class-override` row in `GOVERNANCE_EXCEPTIONS.md` declares the class. ★ **It sits in every cell rather than in a sentence below the table because a claim ninety lines away from its row has already diverged from it once (Langston, 2026-08-29).**
+⚠️ **THE LOCAL-STATE ROWS ARE REQUIRED IN *EVERY* CLASS, HOTFIX INCLUDED, AND THAT IS DELIBERATE — they are how the NEXT session and Langston find out what happened.** ⇒ **The memory rows' `—` is the point: a required row with no instrument is exactly the row that gets skipped.**
+⚠️ **`POST_AUDIT_ROADMAP.md` is ungraded for `sub_batch` while conditional for the two batch classes** (`config.mjs:138`) — probably not deliberate; homed at `B-GOV-LEDGER-GRADE` (`#1099`), with the fact that `c` has no live instrument.
+★ **THE LIVE GOVERNANCE HAS TWO DOCUMENT TIERS.** A third has been proposed or used before — the retired instructions file's *"Tier 3 — Periodic cleanup"* and `B-RULES-1d`'s r1 *"TIER 3 — RUNBOOKS & REFERENCE"* — and neither is in force. Every other `Tier 3` in the tree tiers something else (priority, risk defence, severity, parameters, fees, data), not documents.
 
 ⛔ **A `REQUIRED` ROW CANNOT TAKE `N/A`. If it is genuinely not applicable, THE CLASS IS WRONG — re-declare it, do not write `N/A` against an obligation.**
-★ **A `hotfix` requiring exactly ONE document is not laxity: the fast path is short BECAUSE it is narrow, and `workflow-hotfix` carries the qualifying test that decides whether you are on it at all.**
+★ **A ROW CAN BE `BLOCKED — <ref>`** — the update is owed and cannot be made yet because something outside this batch holds it. ⛔ **The cell carries the REFERENCE of what holds it — an issue, an alert id, a sha — or it is an `N/A` wearing a new name** (Langston, 2026-08-30). ⛔ **A batch with ANY `BLOCKED` row does NOT close** — required or applicable, the update is still owed. It stays open, with the blocker named in its task-list OPEN AND STALLED line, until the blocker clears. ⚠️ **Not for a class that does not fit — that is re-declaring the class, as the line above says** (Langston's `#985` ruling, 2026-09-02, retired a BLOCKED cell used that way). **The checker does not know this token.**
+★ **The checker requiring only `CHANGES_AND_FIXES` of a `hotfix` (plus `PHASE_19_PLAN` for a `P19-*` one) is not laxity — the scope, the catalogue row and the local-state rows above still bind it: the fast path is short BECAUSE it is narrow, and `workflow-hotfix` carries the qualifying test that decides whether you are on it at all.**
 ⚠️ **The class is AMENDABLE — a sub-batch that grows re-declares (§3.0). Amend the class, then re-read this table; do not carry an old class forward because the ledger is already half-filled.**
 
-**VERDICT IS ONE OF EXACTLY TWO TOKENS: `✅` (updated) or `N/A` (judged not applicable).** ⚠️ *(Stated HERE, above the table — it used to be defined thirty lines below it, so a session filling top-down could invent its own tokens.)*
+**VERDICT IS ONE OF EXACTLY THREE TOKENS: `✅` (updated) · `N/A` (judged not applicable — never on a REQUIRED row, except `N/A — not mine` on the three task lists that are not yours) · `BLOCKED — <ref>` (owed, and held by the referenced blocker).** ⚠️ *(Stated HERE, above the table — it used to be defined thirty lines below it, so a session filling top-down could invent its own tokens.)*
 
 | # | document | WHEN IT APPLIES | verdict | **ONE LINE — REQUIRED ON *EVERY* ROW** |
 |---|---|---|---|---|
-| **T1** | `BATCH_CATALOG.md` | every batch |  |  |
-| **T1** | `PHASE_HISTORY.md` | every batch |  |  |
-| **T1** | `PHASE_19_PLAN.md` | ⏳ **Phase 19 only** — after EVERY batch and sub-batch |  |  |
+| **T1** | `BATCH_CATALOG.md` | every batch (a hotfix: one row, `workflow-hotfix` §5) |  |  |
+| **T1** | `PHASE_HISTORY.md` | every batch (a hotfix: judged — see the class table) |  |  |
+| **T1** | ★ **the ACTIVE plan, `SPRINT_TO_LIVE_PLAN.md`** — your row: status + report link, and any discovery that passes its §2 | ⛔ **EVERY batch close for a batch with a row there** (the plan's own §3); a batch with none: `N/A — after live, <its PRE_LIVE_SPRINT.md line>`. ⚠️ **Nothing grades it yet — that is `B-PLAN-CURRENCY-CHECK`.** |  |  |
+| **T1** | `PHASE_19_PLAN.md` — now HISTORY | **a `P19-*` batch: REQUIRED** (the checker enforces it); any other: `N/A — not a P19 batch` |  |  |
 | **T1** | shared `MEMORY.md` + your own `MEMORY_CC_<X>.md` | every batch |  |  |
 | **T1** | the batch `SCOPE` | written at Step 1 |  |  |
 | **T1** | ★ **the batch `PRE_AUDIT`** | written at Step 2. ⛔ **REQUIRED by the governance checker for BOTH change classes (`config.mjs:127,:131`) and it was ABSENT from this ledger — so a fully-filled table could still FAIL the checker.** |  |  |
 | **T1** | the `COMPLETION_REPORT` | written at Step 11 |  |  |
-| **T1** | ★ **THE FOUR SESSION TASK LISTS** — `1-system-manual/` `CC_A` · `CC_B` · `CC_C` · `CC_INFRA` `_SESSION_TASK_LIST.md` | ⛔ **EVERY batch close, EVERY class (Kyle 2026-09-05).** ★ **FOLDER: `1-system-manual/`, beside the rest of the Tier-1 set (`B-TASK-LIST-SLOT`, 2026-09-11). SHAPE: each list LEADS with `OPEN AND STALLED` — every batch the session opened and has not closed, the step it stalled at, and what it waits on — and only then the queue in working order.** ⛔ **The governance checker now grades THIS ROW inside the completion report of every batch whose earliest report was first added after 2026-09-05T05:45Z (`gov-ledgerrow`): a ledger table row whose FIRST cell is its `T1` tier marker and that names the session task lists, whose first verdict is not ❌ and one of whose verdicts begins ✅ — `✅ mine / N/A ×3` is the correct answer; a sentence, or an objectives row, that merely names the lists fails.** **YOURS is the one you UPDATE** — batches assigned to you, sub-batches identified, hotfixes, findings to investigate, **IN WORKING ORDER** — and the same update goes to the **phase plan** and, where roadmap-level, `POST_AUDIT_ROADMAP.md`. ★ **THE OTHER THREE ARE LISTED SO YOU SEE THEM (Kyle: *"the vast majority of the time they're not going to be messing with anybody else's task list, but it's just good to see them all there"*)** — verdict `N/A — not mine` is the CORRECT answer on those three; touching another session's list needs a reason. ⚠️ **Derive yours FROM the plan; if the two disagree the LIST is stale.** |  |  |
+| **T1** | ★ **THE FOUR SESSION TASK LISTS** — `1-system-manual/` `CC_A` · `CC_B` · `CC_C` · `CC_INFRA` `_SESSION_TASK_LIST.md` | ⛔ **EVERY batch close, EVERY class (Kyle 2026-09-05).** ★ **FOLDER: `1-system-manual/`, beside the rest of the Tier-1 set (`B-TASK-LIST-SLOT`, 2026-09-11). SHAPE: each list LEADS with `OPEN AND STALLED` — every batch the session opened and has not closed, the step it stalled at, and what it waits on — and only then the queue in working order.** ⛔ **The governance checker now grades THIS ROW inside the completion report of every batch whose earliest report was first added after 2026-09-05T05:45Z (`gov-ledgerrow`): a ledger table row whose FIRST cell is its `T1` tier marker and that names the session task lists, whose first verdict is not ❌ and one of whose verdicts begins ✅ — `✅ mine / N/A ×3` is the correct answer; a sentence, or an objectives row, that merely names the lists fails.** **YOURS is the one you UPDATE** — batches assigned to you, sub-batches identified, hotfixes, findings to investigate, **IN WORKING ORDER** — and the same update goes to the **active plan** (`SPRINT_TO_LIVE_PLAN.md`) and, where roadmap-level, `POST_AUDIT_ROADMAP.md`. ★ **THE OTHER THREE ARE LISTED SO YOU SEE THEM (Kyle: *"the vast majority of the time they're not going to be messing with anybody else's task list, but it's just good to see them all there"*)** — verdict `N/A — not mine` is the CORRECT answer on those three; touching another session's list needs a reason. ⚠️ **Derive yours FROM the plan; if the two disagree the LIST is stale.** |  |  |
 | **T1** | ★ **Langston’s `/home/langston/MEMORY.md`** | ⛔ **PROMOTED FROM TIER 2 (Langston):** §10.b says *"in the same turn you update your own"* — **unconditional. A verdict cell on a mandatory item lets an `N/A` be written against it.** |  |  |
 | **T2** | `SYSTEM_MANUAL.md` | architecture · strategy logic · regime detection · filter design · signal pipeline · quantitative math | | |
@@ -160,9 +173,10 @@ When a substantive asset-class-onboarding learning surfaces in ANY batch, fold i
 ⇒ ★★ **THIS CONVERTS A SILENT FALSE NEGATIVE INTO A CHECKABLE FALSE STATEMENT** — which Langston can bounce at Step 4 or Step 11. **Same move as rule 29(a): state the object and the population, or it is not an answer.**
 
-⛔⛔ **EVERY ROW GETS ONE LINE — BOTH VERDICTS. KYLE RULED THIS DIRECTLY, 2026-08-28, AND IT SUPERSEDES MY EARLIER "`N/A` ROWS ONLY" SPLIT.** His words: *"if we add that third column back in based on what I’m saying, then I think there’s no longer a conflict between what Langston is proposing and what I’m proposing."*
+⛔⛔ **EVERY ROW GETS ONE LINE — EVERY VERDICT. KYLE RULED THIS DIRECTLY, 2026-08-28, AND IT SUPERSEDES MY EARLIER "`N/A` ROWS ONLY" SPLIT.** His words: *"if we add that third column back in based on what I’m saying, then I think there’s no longer a conflict between what Langston is proposing and what I’m proposing."*
 | verdict | what the line says |
 |---|---|
 | **`✅`** | **a concise one-sentence descriptor of WHAT CHANGED.** ⛔ **Not a detailed statement** — the substance is in the document. |
 | **`N/A`** | **a brief FACT that makes it checkable** — *"nothing under `server/` changed"*, not *"not applicable"*. |
+| **`BLOCKED — <ref>`** | **what the referenced blocker is holding** — *"held by `#1054`: the runbook this row updates is being rewritten"*. |
 
 ⛔⛔ **ONE SENTENCE. HARD LIMIT, AND IT IS THE POINT OF THE RULE, NOT A STYLE NOTE.** ★ **Kyle, in the same breath: *"I don’t want a lot of time wasted or used up and a lot of effort used up on the sessions trying to summarise yet another piece of data … I don’t want to take up too much time, too much effort, or even tokens."***
@@ -180,5 +194,5 @@ When a substantive asset-class-onboarding learning surfaces in ANY batch, fold i
 ⛔⛔ **DO NOT WRITE THAT LIST FROM WHAT YOU REMEMBER DOING.** ★ **That is the second half of the same defect: the report is written by the session, from its own recollection, so the checklist and the report are never compared and a skipped tier is invisible in both.**
 ⚠️ **`N/A` IS A REAL ANSWER AND IS OFTEN CORRECT — a display-only change is SIM-scope, not System-Manual-scope.** ⛔ **But it is an ANSWER, so it is written down. Silence is not `N/A`.**
-⚠️ **HONEST LIMIT: nothing enforces this table.** The governance checker grades the doc-set at close against the declared change-class, but **its `DOCS` table has no `CLAUDE.md` / `CONDUCT.md` entry, and per `#754` it cannot see a batch at all until the completion report first-adds.** ⇒ **this is a format that makes the omission VISIBLE, not a gate that prevents it.**
+⚠️ **HONEST LIMIT: nothing enforces this table as a whole.** The governance checker grades the `R` documents at close against the declared change-class, and one row inside the completion report (the task lists); nothing checks the post in the session window. And **its `DOCS` table has no `CLAUDE.md` / `CONDUCT.md` entry, and per `#754` it cannot see a batch at all until the completion report first-adds.** ⇒ **this is a format that makes the omission VISIBLE, not a gate that prevents it.**
 
 ## ⛔ THE ANTI-PATTERNS
@@ -188,5 +202,5 @@ When a substantive asset-class-onboarding learning surfaces in ANY batch, fold i
 
 ## 10.b — LANGSTON'S MEMORY
-Sync `/home/langston/MEMORY.md` in the same turn you update your own: batch closure, sequencing changes, operational invariants. **His MEMORY auto-loads every invocation — stale memory means a wrong baseline at the next review.** ⛔⛔ **KEEP IT UNDER THE CAP — AND THE CAP IS BOTH: `CLAUDE.md` §3.2 reads *"NO FILE MAY EXCEED 200 LINES **OR** 24,576 BYTES — whichever binds first, and it is usually the BYTES."*** ⚠️ **I wrote *"there is no line target"* here and that was WRONG — it contradicted the always-loaded rules file, which every session reads FIRST.** ★ **Langston’s *"bytes-first"* is from HIS file’s own header and is about which cap BINDS, not about the line cap ceasing to exist.** ⚠️ **This line read *"≤200 lines"* until today and that phrasing is what MANUFACTURED the overage: it is satisfiable in FORM while the file grows.** ⛔ **READ THE SIZE, DO NOT TRUST A FIGURE WRITTEN HERE: `ssh root@204.168.141.77 "wc -lc /home/langston/MEMORY.md"`.** ⚠️ **This line CARRIED a dated measurement until a fresh reader caught it — an instruction file asserting a live value, three headings above *"IF A DOCUMENT STATES A NUMBER, CHECK IT AGAINST THE LIVE VALUE."*** ★ **Name WHERE to read it, never WHAT it currently is.** *(It was well over when last measured; assume a prune is due until the command says otherwise.)*
+Sync `/home/langston/MEMORY.md` in the same turn you update your own: batch closure, sequencing changes, operational invariants. **His MEMORY auto-loads every invocation — stale memory means a wrong baseline at the next review.** ⛔⛔ **HIS LOAD IS CAPPED AS A SUM, AND THE SUM MAY ONLY GO DOWN (`B-LANGSTON-LOAD-RATCHET`, `PHASE_19_PLAN` row 2.8b — Langston ruled, Kyle approved, 2026-09-05).** The unit is the TOTAL of everything auto-loaded into each invoke, never one file — **do not restate it per file.** ⛔ **READ IT, DO NOT TRUST A FIGURE WRITTEN HERE: `ssh root@204.168.141.77 'langston-size-watch --status'`** — and put the sum **before and after** your write in the governance ledger's line for this row. ⛔ **AND TODAY THESE THREE CANNOT ALL HOLD — stated rather than hidden:** the sync appends, the sum may not rise, and the trim is Infra Claude's (`#946`, Kyle 2026-08-30). **Until `#946` pays for it: keep the sync to the batch-closure line, record the before/after sum in the ledger line, and tell Infra Claude the size of the rise.** The conflict is before Langston (`B-GOV-REPORTING` scope §7d). ★ `CLAUDE.md` §3.2 caps the CC memory files, not his (Langston, 2026-09-05). ★ **Name WHERE to read it, never WHAT it currently is.** *(It was well over when last measured; assume a prune is due until the command says otherwise.)*
 
 ⛔⛔ **HOW TO WRITE IT — THROUGH `langston-memory-write`, AND ONLY THROUGH IT (B-LANGSTON-CONTEXT P-6b, 2026-09-11).**
@@ -250,5 +264,5 @@ Move the card to **`Governance`**.
 10. **Governance Updates** — Update ALL applicable Tier 1 + Tier 2 docs (see §3). If batch touched architecture/math → update SYSTEM_MANUAL.md. If batch touched components → update SYSTEM_IMPACT_MAP.md. Failing to update either when applicable = incomplete batch.
 
-    **MANDATORY 10.b — Langston memory sync (Kyle directive 2026-05-07):** at the same time you update your own MEMORY.md, also update Langston's `/home/langston/MEMORY.md` on Hetzner with the batch closure block + sequencing changes + operational invariants. Langston's MEMORY auto-loads every `claude -p` invocation; stale MEMORY → wrong baseline at next review. Mirror your MEMORY structure (state block, recent-batch row, sequencing update, open-issue diff). Keep ≤200 lines — ⛔ **SUPERSEDED 2026-08-28: THE LIVE CAP IS BYTES, ~24 KB, WITH NO LINE TARGET. See §10.b above.** *(This preserved-verbatim block declares itself authoritative on divergence, which is exactly why the stale number is corrected HERE and not only above.)* Sync via:
+    **MANDATORY 10.b — Langston memory sync (Kyle directive 2026-05-07):** at the same time you update your own MEMORY.md, also update Langston's `/home/langston/MEMORY.md` on Hetzner with the batch closure block + sequencing changes + operational invariants. Langston's MEMORY auto-loads every `claude -p` invocation; stale MEMORY → wrong baseline at next review. Mirror your MEMORY structure (state block, recent-batch row, sequencing update, open-issue diff). Keep ≤200 lines — ⛔ **SUPERSEDED: his load is capped as a SUM that may only go down (row 2.8b); read it with `langston-size-watch --status`. See §10.b above.** *(This preserved-verbatim block declares itself authoritative on divergence, which is exactly why the stale number is corrected HERE and not only above.)* Sync via:
 
     ⛔ **THE `/tmp` + `cp` RECIPE THAT STOOD HERE IS REPLACED (B-LANGSTON-CONTEXT P-6b, 2026-09-11)** — corrected in THIS block too, because it declares itself authoritative on divergence and a session reading bottom-up would otherwise follow the hazard. It wrote through the fixed, pre-creatable path `/tmp/langston_memory.md` (a symlink there steers a root write; an owned file there injects text into every Langston invoke), with no compare-and-swap and no copy of what it overwrote. Use `langston-memory-write` as shown in §10.b above:
diff --git a/.claude/skills/workflow-11-completion/SKILL.md b/.claude/skills/workflow-11-completion/SKILL.md
index a52382c2d..059040c8c 100644
--- a/.claude/skills/workflow-11-completion/SKILL.md
+++ b/.claude/skills/workflow-11-completion/SKILL.md
@@ -6,5 +6,5 @@ description: STEP 11 ONLY of the DawnTrader batch workflow - the Completion Repo
 # STEP 11 — COMPLETION REPORT
 
-**Ends when:** Langston confirms and **Kyle acknowledges**. Only then is the batch CLOSED.
+**Ends when:** Langston confirms. **Then the batch is CLOSED — Kyle does NOT acknowledge a close** (Kyle, 2026-09-02: never block on him for an ack; move the card, post the block).
 
 ## ⛔ FIRST: DOES THIS BATCH ALREADY HAVE A **PROGRESS REPORT**? THEN YOU ARE *CONVERTING*, NOT WRITING (Kyle directive 2026-08-26)
@@ -13,7 +13,6 @@ description: STEP 11 ONLY of the DawnTrader batch workflow - the Completion Repo
 
 ⛔ **DO NOT WRITE A FRESH REPORT FROM MEMORY. CONVERT THAT FILE.** Rename it to `<BATCH-ID>_COMPLETION_REPORT.md` and finish it:
-1. **(a) WHAT DATA CAME IN.** The observation’s actual result, set against the criterion the progress report **PRE-REGISTERED** — **quote the criterion as written, then the outcome.**
+1. **(a) WHAT DATA CAME IN.** The observation’s actual result, set against the criterion the progress report **PRE-REGISTERED** — **quote the criterion as written, then the outcome.** ★ **A criterion chosen after seeing the window can always be made to pass. That is exactly what pre-registration prevents, and rewriting it now destroys the protection.**
 2. **(b) WHAT DECISION OR ACTION WAS TAKEN ON IT, and by whom.** ⛔ **A report carrying (a) and not (b) has NOT closed the loop.**
-   *(Split into two sub-items 2026-08-27, Langston condition 2: the merged version left "quote the criterion as written" trailing behind (b), reading as though you quote a criterion for the DECISION — and its emphasis markers were unbalanced, rendering bold from a mid-clause comma, in the file whose subject is legibility.)* — quote the criterion as written, then the outcome. ★ **A criterion chosen after seeing the window can always be made to pass. That is exactly what pre-registration prevents, and rewriting it now destroys the protection.**
 3. Complete the objectives table and the governance-files-changed list.
    ⛔⛔ **THE GOVERNANCE-FILES-CHANGED LIST IS *COPIED FROM STEP 10's TIER LEDGER*, NEVER WRITTEN FROM WHAT YOU REMEMBER DOING (Kyle directive 2026-08-28).** ★ **Writing it from recollection is half of the skipped-tier defect: the session that skipped a tier also writes the report, so the checklist and the report are never compared and the omission is invisible in both.** ⇒ **open the step-10 table and transcribe it, `N/A` rows included.** ⚠️ **If there is no filled table, Step 10 is not finished — go back and fill it rather than reconstructing the list here.**
@@ -29,5 +28,5 @@ Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md
 - **The list of governance files ACTUALLY changed** (including Langston's MEMORY). **If SIM or the System Manual were applicable and are absent from that list, the close is rejected.**
 - **CI run ID + green status, per-job.**
-- **Any scope item left open — stated at the TOP, not buried**, with its owner, dated home, closing condition and failure condition.
+- **Any scope item left open — stated at the TOP, not buried**, with its owner, its PLACED home (a position in the active plan — never a date, `CLAUDE.md` §9.4), closing condition and failure condition.
 - **New findings**: what was turned up that was not in scope, and the investigation that settled it. **If it turned out NOT to be a defect, leave it out entirely.**
 - **Honest residual.** What this batch did not establish.
@@ -86,8 +85,8 @@ Report to Kyle in the `CONDUCT.md` §6 format, move the board card, and **update
 1. ⛔ **EROSION — AND *SHRINKAGE IS NOT THE SIGNAL* (Langston corrected my diagnostic, 2026-08-28).** ⚠️ **#675 narrowed hard under his own retraction and the disposition SURVIVED on a different mechanism — that was CORRECT narrowing.** ★ **THE DISCRIMINATOR: did each round replace a checkable assertion with a NARROWER CHECKABLE ONE, or with a HEDGE?** ⇒ **apply rule 29 to the FINAL text — object, population, and something that would falsify it. If those three survive, the narrowing was healthy however much it shrank. If not, withdraw under §9.4 disposition 5.**
 2. ⛔ **A LOOP THAT WILL NOT CLOSE — CAP AT THREE ROUNDS.** ⛔ **The cap outcome is NOT NEUTRAL: send the FULL ROUND RECORD, because the unresolved disagreement is the first thing Langston rules on, before the substance.** **Iterating to agreement selects for persistence, not truth.**
-**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round COUNT is the useful number — a finding that took three rounds and one that took none are not equally trustworthy.**
+**Record every round:** `REVIEWER r<n>: <object|claim-only> · <verdict> · <what you changed>`. ★ **The round record is the MECHANISM's own denominator — how often the loop runs and how often it closes — and never EVIDENCE that a finding is right.**
 
 ## ☑ THE DELIVERY BOARD — MOVE THE CARD WHEN THE WORK MOVES
-**Blocked on = Langston** for his sign-off → then **Blocked on = Kyle** for acknowledgement → then move to **`Complete`**. **Not before Kyle acknowledges.**
+**Blocked on = Langston** for his sign-off → then move to **`Complete`** (no Kyle acknowledgement, 2026-09-02).
 ★ **LANGSTON SETS THE `Review` FIELD; THE SESSION MOVES THE CARD.** *(Kyle’s wording, 2026-08-24.)* ⛔ **His approval is NOT the move** — he sets `Review = Approved`, then YOU move it and update `Blocked on`. If approval also moved the card the board would freeze every time he is mid-review, at FOUR gates per batch.
 ⚠️ **NOTHING AUTOMATES THIS.** An un-updated board is a **confidently wrong second record, which is worse than no board** — and the whole point is that Kyle can see who is doing what without asking. ⛔ **The card holds STATUS, OWNER, ORDER and the description — NOTHING ELSE.** Every finding, citation and verdict stays in the repo and the card LINKS to it. Board: https://github.com/users/kylegjordan/projects/1 · full protocol: `1-system-manual/DELIVERY_BOARD_PROTOCOL.md`.
@@ -98,5 +97,5 @@ Report to Kyle in the `CONDUCT.md` §6 format, move the board card, and **update
 > This is exactly what `CLAUDE.md` §2 held for this step before §2 was removed on 2026-08-21. It is kept word-for-word so the move loses nothing: the summary above is a derivation, and a derivation is not the rule. Where the two differ, **this block is authoritative.**
 
-11. **Completion Report** — Scope objectives checklist with YES / NO / PARTIAL + evidence. List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b). Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`. Langston reviews + confirms. Batch CLOSED only after Kyle's acknowledgment.
+11. **Completion Report** — Scope objectives checklist with YES / NO / PARTIAL + evidence. List ACTUALLY-edited governance files (including Langston's MEMORY per 10.b). Save to `Claude Comms and Packages/Batch Completion/BATCH_N_COMPLETION_REPORT.md`. Langston reviews + confirms. Batch CLOSED only after Kyle's acknowledgment. ⛔ **SUPERSEDED 2026-09-02 (Kyle): a close needs no acknowledgement from him — see the top of this skill.**
 
 ---
diff --git a/1-system-manual/PHASE_19_PLAN.md b/1-system-manual/PHASE_19_PLAN.md
index f34b0efaf..8f88f1113 100644
--- a/1-system-manual/PHASE_19_PLAN.md
+++ b/1-system-manual/PHASE_19_PLAN.md
@@ -643,5 +643,5 @@ ALL must be ✅ before the flip commit. Verify each at the **B8 switch-on** Step
 **DECISION 4 — depth goes to runbooks, but the runbook strategy is now MEASURED AND WEAK.** Across five runbooks: 3 commits and 9 mentions ever (control: RUNNING_ISSUES has 370). **So §6 was NOT gutted** — Kyle’s point stands that the comms rules got followed BECAUSE they were in the always-loaded file.
 **DECISION 5 — an always-loaded file must not assert a live config value.** Name where to read it. Adopted after the shared MEMORY carried the wrong Langston model for 17 days.
-**DEFERRED WITH A NAME, not dropped:** Infra Claude’s onboarding into the crew comms (Kyle, ~1-2 weeks, date open) · the crew-board keep-narrow-or-kill decision (delegated to CC-A + Langston) · the `read-the-field` promotion argument · #739 and #740 to `B-RULES-1e`, due 2026-09-05.
+**DEFERRED WITH A NAME, not dropped:** Infra Claude’s onboarding into the crew comms (Kyle, ~1-2 weeks, date open) · the crew-board keep-narrow-or-kill decision (delegated to CC-A + Langston) · the `read-the-field` promotion argument · #739 and #740 to `B-RULES-1e`.
 
 ### B-MISTAKES-FILE — closed 2026-08-20 (CC-A) · §5 decision-log entry
diff --git a/CLAUDE.md b/CLAUDE.md
index 01a5e52ce..ece52d430 100644
--- a/CLAUDE.md
+++ b/CLAUDE.md
@@ -200,5 +200,5 @@ Two MEMORY.md files, kept in sync:
 
 25.a **✅ THE CREW COORDINATION BOARD — RETIRED 2026-08-23** (Langston ruling, Kyle-delegated). **The deciding number was not low usage but THREE CLAIMS MADE, ZERO EVER RELEASED** — a protocol nobody completes, so its empty state was never EARNED. The race it was built for became structurally impossible at one-clone-per-session (#557), and the one real collision (`RUNNING_ISSUES.md`) has a structural fix in the #702 number blocks. ⛔ **DO NOT RE-PROPOSE WITHOUT A NEW FAILURE THE NUMBER BLOCKS DO NOT COVER.**
-    ⚠️ **RESIDUAL, NAMED NOT CONCEDED: `CLAUDE.md`, `CONDUCT.md`, shared `MEMORY.md`** — four sessions edit the same prose regions, blocks cannot apply, and a semantic collision merges cleanly. Detection exists (`fresh-rules.mjs` + the Monday review); prevention does not. **Code removal + the residual’s structural fix: `B-CREW-BOARD-REMOVAL`, CC-A, due 2026-09-05.** *(Full ruling, blast radius and restore path: `DELETED_COMPONENTS_LOG.md`.)*
+    ⚠️ **RESIDUAL, NAMED NOT CONCEDED: `CLAUDE.md`, `CONDUCT.md`, shared `MEMORY.md`** — four sessions edit the same prose regions, blocks cannot apply, and a semantic collision merges cleanly. Detection exists (`fresh-rules.mjs` + the Monday review); prevention does not. **Code removal + the residual’s structural fix: `B-CREW-BOARD-REMOVAL`, CC-A (gated on Kyle; placed after live in `PRE_LIVE_SPRINT.md`, crew tooling).** *(Full ruling, blast radius and restore path: `DELETED_COMPONENTS_LOG.md`.)*
 
 26. **WHEN NAMED, ANSWER — FAST.** → `CONDUCT.md` section 12. The ack/resolve mechanics stay in `ALERT_HANDLING_PROTOCOL.md`.
@@ -417,5 +417,5 @@ ssh root@188.245.193.8 'TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/l
 - **Runtime:** Claude Code 2.1.159+ under Kyle's Max OAuth (updated from 2.1.131 on 2026-06-01 to fix the `[1m]` thinking-block-on-tool-use error). Token at `/etc/langston/oauth.env` (mode 640 root:langston, valid 1 year — rotate by 2027-04 via `claude setup-token`).
 - **Default model: `claude-opus-5[1m]` (Opus 5, 1M context — switched 2026-07-27, Kyle-directed).** Anthropic's official docs now list Opus 4.8 as **legacy** with an explicit migrate-to-Opus-5 recommendation; Opus 5 is same price ($5/$25 per MTok), same 1M context, newer cutoff (May 2026). **★ THE MODEL IS SET AT TWO LIVE SITES — SWITCH BOTH OR HE RUNS SPLIT:** (1) `/opt/discord-bridges/discord-langston-bridge.py:69` `CLAUDE_MODEL` (the Discord conversational path) and (2) `/usr/local/bin/langston-call:38` `MODEL` (the generic invoker the **alert/queue** path uses). The second site was found by census at the 07-27 switch — the older wording here named only the bridge, and a single-site switch leaves alerts on the old model, a silent split that reads as reasoning drift rather than config drift. **Rollback:** restore `*.pre-opus5-20260727-234713` for BOTH files + `systemctl restart discord-langston-bridge.service`. ⚠️ The pre-07-02 rollback paths formerly listed here (`/usr/local/bin/langston-bridge.py*`, `langston-bridge.service`) are the **decommissioned Telegram-era bridge** and are DEAD — do not use them (corrected 2026-07-27). Prior models: Opus 4.8 `[1m]` 2026-06-13→07-27; Fable 5 `[1m]` 06-09→06-13. Full build record + change log: `1-system-manual/LANGSTON_ARCHITECTURE.md`.
-- **Working directory:** `/home/langston/` owned by `langston`. Contains `CLAUDE.md` (persona; includes §11 "When to respond in the group" with `[SILENT]` marker rules) + `MEMORY.md` (volatile state, mirrors project's MEMORY.md). **⛔ NEITHER FILE'S SIZE RULE OR LINE COUNT IS STATED HERE — READ THE CAP FROM `MEMORY.md`'s OWN HEADER AND THE LENGTH FROM THE BOX.** ⚠️ **BOTH FIGURES THIS LINE USED TO ASSERT WERE STALE, MEASURED 2026-08-30: it said his `CLAUDE.md` is "~261 lines" (live: **517**) and his `MEMORY.md` is "≤200 lines" — a rule **Langston RETIRED on 2026-07-28** in favour of a **bytes-first ~24KB cap with explicitly NO line target**, because the line rule was once satisfied by packing 5.8KB onto a single line while the file read as compliant. ★ Citing the retired rule made me report a 2.2×-over file as "10 lines over" — **the stale rule did not just mislead, it UNDERSTATED THE BREACH BY MORE THAN HALF.** This is the shared `MEMORY.md`'s own standing lesson landing in `CLAUDE.md`: **an always-loaded file must NAME WHERE to read a live value, NEVER WHAT IT CURRENTLY IS** — same class as the Langston-model line that was wrong for 17 days.** Both auto-load every claude-cli invocation.
+- **Working directory:** `/home/langston/` owned by `langston`. Contains `CLAUDE.md` (persona; includes §11 "When to respond in the group" with `[SILENT]` marker rules) + `MEMORY.md` (volatile state, mirrors project's MEMORY.md). **⛔ NEITHER FILE'S SIZE RULE OR LINE COUNT IS STATED HERE — READ THE CAP FROM `PHASE_19_PLAN` ROW 2.8b — HIS LOAD IS CAPPED AS THE SUM OF EVERY AUTO-LOADED FILE, AND IT MAY ONLY GO DOWN (Langston ruled, Kyle approved, 2026-09-05) — AND THE LIVE SUM FROM `langston-size-watch --status` ON THE BOX.** ⚠️ **BOTH FIGURES THIS LINE USED TO ASSERT WERE STALE, MEASURED 2026-08-30: it said his `CLAUDE.md` is "~261 lines" (live: **517**) and his `MEMORY.md` is "≤200 lines" — a rule **Langston RETIRED on 2026-07-28** in favour of a **bytes-first ~24KB cap with explicitly NO line target**, because the line rule was once satisfied by packing 5.8KB onto a single line while the file read as compliant. ★ Citing the retired rule made me report a 2.2×-over file as "10 lines over" — **the stale rule did not just mislead, it UNDERSTATED THE BREACH BY MORE THAN HALF.** This is the shared `MEMORY.md`'s own standing lesson landing in `CLAUDE.md`: **an always-loaded file must NAME WHERE to read a live value, NEVER WHAT IT CURRENTLY IS** — same class as the Langston-model line that was wrong for 17 days.** Both auto-load every claude-cli invocation.
 - **★ LIVE COMMS FABRIC = DISCORD (since cutover #333, 2026-06-25)** — all in `/opt/discord-bridges/` on Helsinki:
   - **Bridges (systemd):** `discord-cc-bridge.service` (CC's outbound to `#general` + Kyle/voice inbound → `/var/log/cc-discord-inbox.jsonl`) + `discord-langston-bridge.service` (Langston's native in-channel reasoning + replies; engages a CC post only when it LEADS with "Langston"). Both run on `discord.py` in the venv at `/opt/discord-bridges/venv/`.
@@ -506,5 +506,5 @@ OpenClaw replaced as Langston's runtime. See history doc §8.1 for the migration
 ⚠️ **So: a DISPUTE about how a component behaves obliges you to run the census and the provenance read, even with no batch and no step open. Load `workflow-02-audit-and-plan` and work from it.**
 
-### 9.4 THE FIND IS THE TRIGGER — EVERY OUT-OF-SCOPE FINDING GETS A DECLARED DISPOSITION, IN THE SAME TURN *(Kyle directive 2026-06-13; TRIGGER CORRECTED 2026-08-27)*
+### 9.4 THE FIND IS THE TRIGGER — EVERY OUT-OF-SCOPE FINDING GETS A DECLARED DISPOSITION, IN THE SAME TURN *(Kyle directive 2026-06-13)*
 
 ⛔⛔ **IT FIRES THE MOMENT YOU FIND THE THING — NOT WHEN YOU DECIDE IT IS WORTH FIXING.** **THE TRIGGER: you come across ANYTHING outside the scope of what you are currently doing** — a defect, an unknown, a gap, a wrong assumption, **or a piece that requires an addition to the current batch, task, step or investigation.** ✅ **That is the whole test. No judgement gate in front of it.**
@@ -515,5 +515,5 @@ OpenClaw replaced as Langston's runtime. See history doc §8.1 for the migration
 | # | disposition | when |
 |---|---|---|
-| **1** | **FOLD INTO THE WORK IN HAND** — amend the scope / audit / step you are on | **the current batch DEPENDS on it.** ★ *The one the old rule had no branch for at all.* |
+| **1** | **FOLD INTO THE WORK IN HAND** — amend the scope / audit / step you are on | **the current batch DEPENDS on it.** |
 | **2** | **ADD AS AN ITEM TO AN EXISTING BATCH** | it belongs to work already planned — becomes an extra step or objective there |
 | **3** | **ITS OWN BATCH, PLACED IN THE PLAN** | it stands alone ⇒ the `HOME:` form below, positioned between named items |
@@ -527,15 +527,15 @@ OpenClaw replaced as Langston's runtime. See history doc §8.1 for the migration
 ⛔⛔ **A HOME IS A NAME AND A PLACE IN THE QUEUE — NEVER A CALENDAR DATE. DO NOT PUT A DUE DATE ON A BATCH (Kyle directive 2026-08-25).** His words: *"Who knows what we're gonna be doing on September fifth?"* **Batches are SLOTTED into the current batch/task list where they make the most sense; they are not booked against a day.** A date on a batch is a **fake commitment** — nothing enforces it, the queue in front of it moves, and it expires into a stale record that reads as a missed deadline rather than as work that was correctly re-ordered.
 ★ **THE ONE THING A DATE IS FOR, and it is the reason the mechanism exists at all: a period whose LENGTH is the point** — an observation window, a soak, a test period, a data-collection run. *"+48h gate"*, *"14-day soak"*, *"collect 30 days"*. **There the days ARE the content**, so the date is a measurement parameter, not a promise. `RUNNING_ISSUES` #87's *"+48h gate"* is the correct shape; **`B-GATE-GUARD` due 2026-09-05 was not.**
-⛔⛔ **AND "QUEUED" IS NOT A HOME EITHER — THAT WORDING WAS MINE AND IT WAS WRONG (Kyle, 2026-08-26).** Striking the date does not license a vaguer home; **it raises the bar on the PLACE.** ★ **THE HOME IS A SPECIFIC PLACEMENT IN THE PHASE PLAN — A POSITION ANYONE CAN LOOK UP AND SEE.** Kyle’s words: *"it didn’t actually do the thing it was supposed to, which is to put it in a specific place in our phase plan, where anyone can look and see — okay, this is where that hotfix or that batch goes."*
+⛔⛔ **AND "QUEUED" IS NOT A HOME EITHER (Kyle, 2026-08-26).** Striking the date does not license a vaguer home; **it raises the bar on the PLACE.** ★ **THE HOME IS A SPECIFIC PLACEMENT IN THE PHASE PLAN — A POSITION ANYONE CAN LOOK UP AND SEE.** Kyle’s words: *"it didn’t actually do the thing it was supposed to, which is to put it in a specific place in our phase plan, where anyone can look and see — okay, this is where that hotfix or that batch goes."*
 ⇒ **WRITE IT INTO `PHASE_19_PLAN.md` (or the active phase plan / `POST_AUDIT_ROADMAP.md`) AS A REAL, PLACED ITEM** — named, owned, and **positioned relative to the work around it** — then cite that placement in the `RUNNING_ISSUES` entry. **The ledger entry POINTS AT the plan; the plan is where the position lives.**
 ⚠️ **THE FAILURE THIS KILLS, measured 2026-08-26: a session named the batch, minted an issue number, declared it "locked", correctly refused a due date — AND NEVER PUT IT ANYWHERE IN THE PLAN.** Every ceremony of homing was performed and **the item still had no place**, so it is invisible to anyone reading the plan to find out what happens next. **Naming is not placing.**
 ⇒ **WRITE IT IN THIS FORM — IT IS A FORMAT, NOT A REMINDER:**
 > `HOME: B-<NAME>, owner <session>, placed in <plan> at <position>, after <item>`
-⚠️ **RESTORED 2026-08-27 (Langston condition 3). Kyle’s correction was to the FALLBACK — the word "queued" — and I deleted the TEMPLATE along with it, replacing a format with prose.** That is the same trade his own B-MEASURE-GATE rule refuses: **a gate that is a format gets followed; a gate that is a paragraph gets paraphrased.** The fallback is struck; the form stays.
+★ **A gate that is a format gets followed; a gate that is a paragraph gets paraphrased.**
 
 ★ **IF THE RIGHT POSITION IS GENUINELY UNCLEAR, SETTLE IT WITH LANGSTON AND RECORD WHAT YOU AGREED** (§6.7 iterate-and-decide). **"I discussed it and we placed it after X" is a home. "Queued" is not.**
-⚠️ **NOT A LICENCE TO GO VAGUE — the rest of §9.4 stands unchanged.** The name, the owner and the ledger entry are still mandatory; only the DATE is struck, because it was the one part of the home that nothing could keep true.
+⚠️ **NOT A LICENCE TO GO VAGUE: the name, the owner and the ledger entry stay mandatory.** Only a DATE is struck — it was the one part of a home that nothing could keep true.
 
-★ **AND A SLOTTED ITEM ALSO LANDS IN THE OWNING SESSION'S TASK LIST (Kyle 2026-09-05) — the full rule, the three destinations and the plan-is-authority guard live in `workflow-10-governance`'s Tier-1 ledger row, NOT here.** ⚠️ **I first wrote it here as six lines of rules text and Kyle struck it the same morning: *"I don't think that this becomes a new rule."* `#998` says why — every rule added to this file weakens the others, including the risk rules — and a rule with no slot is what produced `#1005`. **The ledger row is the enforcement; this line is only the pointer.**
+★ **AND A SLOTTED ITEM ALSO LANDS IN THE OWNING SESSION'S TASK LIST (Kyle 2026-09-05) — the full rule, the three destinations and the plan-is-authority guard live in `workflow-10-governance`'s Tier-1 ledger row, NOT here.** **The ledger row is the enforcement; this line is only the pointer.**
 
 **Mechanics (mandatory):** (1) the item lands in `RUNNING_ISSUES.md` with its assigned home stated explicitly in the entry; (2) if it's a roadmap item, it is written into `POST_AUDIT_ROADMAP.md` (or the active phase plan, e.g. `PHASE_19_PLAN.md`) as a real numbered/named item — not just referenced; (3) the completion report or message that surfaces it NAMES the home; (4) if the right home is genuinely a judgment call (e.g. Phase 19 small-batch vs Phase 20 workstream), CC + Langston decide it then and there (escalate to Kyle only on no-consensus) — but a home IS chosen before the item is considered "handled." A surfaced issue with no home is an open loop, and open loops get dropped. Applies to BOTH CC and Langston (his CLAUDE.md carries the matching rule).
@@ -563,9 +563,10 @@ Every CC session — both CC (this) and Langston — must perform this check **b
 
 **Procedure:**
-1. Read `/var/log/dawntrader/system-alerts.jsonl` from staging via SSH:
-   - CC sessions: `ssh root@188.245.193.8 'tail -50 /var/log/dawntrader/system-alerts.jsonl'`
-   - Langston sessions: `ssh staging 'tail -50 /var/log/dawntrader/system-alerts.jsonl'` (via `~/.ssh/config` alias, IP-restricted to Helsinki)
+1. Read the **WHOLE** `/var/log/dawntrader/system-alerts.jsonl` from staging and filter it — ⛔ **NEVER a `tail`.** The file is ordered by when an alert was CREATED while due-ness is `triggers_at`, so the OLDEST due alerts are the ones a tail misses (`#980`: a `tail -50` saw 4 of 11). Merge rows by `id`, then keep the step-2 set.
+   - CC sessions: the `inject-due-alerts` hook does this on every prompt and says one of: the due alerts with FULL ids (up to 25; id, severity and title only), `0 due alerts … the filter ran`, or that it could not run or threw. ⛔ **If it said none of these, it did not run.** **By hand** — when it did not run, when more than 25 are due, and for the `body` and `metadata` step 2 cites: `ssh root@188.245.193.8 'python3 -' < scripts/due-alerts.py` (full ids, body, metadata, and Langston's acks of the last 24h; it ends with a COUNT line naming the HOST it read — no COUNT line, or a host that is not staging, means the read did not happen).
+   - Langston sessions: the whole-file read in his own `CLAUDE.md` (his file's form is Infra Claude's to keep, Kyle 2026-08-30).
 2. For each entry where `state === 'active'` AND `acknowledged_at === null` AND `triggers_at <= NOW()`: surface to user **as part of your response in plain language** (not raw JSON, not file paths); cite `id`, `title`, `severity`, `body`, `metadata`; state whether action this turn or FYI.
 3. If you ACT on an alert: `ssh <user>@188.245.193.8 'cd /home/deploy/dawntrader && npm run system-alerts -- ack <id> --by <actor>'` — **`--by` is a CANONICAL ACTOR from the one table in `server/services/system-alerts.ts` (`ALERT_ACTORS`): `cc-a` | `cc-b` | `cc-c` | `cc-infra` | `governance-checker` | `governance-checker-heartbeat` | `b-new-40-soak-verify` | `kyle` | `langston`. Anything else is REFUSED (B-ALERT-ACTOR-ALLOWLIST, #987).** ⛔ **The `cc-session-<YYYY-MM-DD>` form this line taught from 2026-05-17 is RETIRED — it predated the session roster by 26 days and produced 75 distinct identity strings, most naming nobody.** A resolve additionally needs `--evidence <ref-or-sentinel>`.
+   ⚠️ **ANY alert that is not RESOLVED — scheduled, active or acknowledged — blocks the next alert with the same dedupe key** (`server/services/system-alerts.ts`, the non-terminal dedupe check). ⇒ **Route an event-wait alert, do not ack it (an ack also takes it out of this per-turn read) — and know that either way its next occurrence cannot fire until it is resolved** (Langston, 2026-09-13; `#982`).
 4. If can't reach staging (SSH timeout / file missing / Hetzner unreachable): state explicitly to user; continue with user's request anyway.
 
@@ -574,5 +575,5 @@ Every CC session — both CC (this) and Langston — must perform this check **b
 **Queue contents:** scheduled verifications (e.g., 14-day soak verification), one-off reminders, recurring health checks, breakage triggers. Dispatcher cron on staging promotes scheduled events to active when `triggers_at` arrives. See `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md` §2.8 for architecture.
 
-**★ Post-diagnosis handling (B-ALERT-PROTOCOL #340, 2026-06-23):** the per-turn check above is the PULL side (read + surface). What happens AFTER an alert is diagnosed — who owns the follow-through, the ack=owned / resolve=fixed discipline, the per-class action table, and the no-silent-drop re-surface closure guarantee — is the definitive process in **`1-system-manual/ALERT_HANDLING_PROTOCOL.md`**. Short version: Langston's triage ends with `[[ALERT id=.. owner=<CC-A|CC-B|Kyle> action=".."]]` → the wake routes to the owner → owner `ack --by` (claims) → does the work → `resolve --by` (the ONLY thing that stops the dispatcher re-surfacing it on a widening back-off + escalating to Kyle).
+**★ Post-diagnosis handling (B-ALERT-PROTOCOL #340, 2026-06-23):** the per-turn check above is the PULL side (read + surface). What happens AFTER an alert is diagnosed — who owns the follow-through, the ack=owned / resolve=fixed discipline, the per-class action table, and the no-silent-drop re-surface closure guarantee — is the definitive process in **`1-system-manual/ALERT_HANDLING_PROTOCOL.md`**. Short version: Langston's triage ends with `[[ALERT id=.. owner=<CC-A|CC-B|Kyle> action=".."]]` → the wake routes to the owner → owner `ack --by` (claims — ⚠️ but an EVENT-WAIT alert is routed, not acked: step 3 above; the protocol document's own correction is `#646`, CC-B) → does the work → `resolve --by` (the ONLY thing that stops the dispatcher re-surfacing it on a widening back-off + escalating to Kyle).
 
 ---
diff --git a/scripts/check-reviewer-siblings.mjs b/scripts/check-reviewer-siblings.mjs
index 80f3d33cb..32d3d80c6 100644
--- a/scripts/check-reviewer-siblings.mjs
+++ b/scripts/check-reviewer-siblings.mjs
@@ -16,4 +16,7 @@ import { execSync } from 'node:child_process';
 const MECHANISM   = 'what other states of the world are consistent';
 const TERMINATION = 'it is a loop, not a one-shot';
+// Langston 2026-08-28T07:15Z: the loop's TERMINATION CONDITION is an object round, not the heading.
+// The heading alone passed while bug-investigation lacked his corrections (B-GOV-REPORTING r6).
+const OBJECT_ROUND = 'termination requires an *object* round';
 
 // Scope and completion documents QUOTE the mechanism while RECORDING a change to
@@ -22,5 +25,7 @@ const TERMINATION = 'it is a loop, not a one-shot';
 const isInstruction = (f) =>
   /^\.claude\/skills\/[^/]+\/SKILL\.md$/.test(f) ||
-  /^1-system-manual\/_pending-skills\/.+\.md$/.test(f);
+  /^1-system-manual\/_pending-skills\/.+\.md$/.test(f) ||
+  // Langston 2026-08-28T07:38Z: the two always-loaded rule files are instruction files too.
+  f === 'CLAUDE.md' || f === 'CONDUCT.md';
 
 const tracked = execSync('git ls-files "*.md"', { encoding: 'utf8' })
@@ -31,7 +36,9 @@ const has = (f, s) => {
 };
 const mech = tracked.filter((f) => has(f, MECHANISM));
-const term = tracked.filter((f) => has(f, TERMINATION));
+const term = tracked.filter((f) => has(f, TERMINATION) && has(f, OBJECT_ROUND));
 const missing = mech.filter((f) => !term.includes(f));
-const orphan  = term.filter((f) => !mech.includes(f));
+// Orphans are judged on EITHER marker (a reader found the AND weakened this: a loop heading with no mechanism went unreported).
+const anyTerm = tracked.filter((f) => has(f, TERMINATION) || has(f, OBJECT_ROUND));
+const orphan  = anyTerm.filter((f) => !mech.includes(f));
 
 console.log(`instruction files: ${tracked.length}`);
diff --git a/scripts/due-alerts.py b/scripts/due-alerts.py
new file mode 100644
index 000000000..b7333bee9
--- /dev/null
+++ b/scripts/due-alerts.py
@@ -0,0 +1,57 @@
+# §10.5 manual alert read — the fallback for when the inject-due-alerts hook says it could not run.
+# Runs ON STAGING, sent over stdin so no quoting survives the trip:
+#     ssh root@188.245.193.8 'python3 -' < scripts/due-alerts.py
+# It reads the WHOLE file (never a tail — #980: the file is in mint order, due-ness is triggers_at,
+# so a tail misses the oldest due alerts), keeps the last row per id, and prints:
+#   (a) every alert that is active, unacknowledged and due — FULL id (the CLI's ack/resolve match
+#       the id exactly; a prefix is a no-op), severity, title, the whole body and the metadata;
+#   (b) every alert Langston acknowledged in the last 24h — his ack is not a resolve, and the
+#       follow-through is usually a CC's;
+# then a COUNT line naming the host. It is the positive control: no COUNT line means the read did not
+# finish; a host that is not staging means a local stray copy was read. Neither is "nothing due".
+import json, datetime, socket
+
+PATH = '/var/log/dawntrader/system-alerts.jsonl'
+now = datetime.datetime.now(datetime.timezone.utc)
+
+def when(s):
+    try:
+        return datetime.datetime.fromisoformat(str(s).replace('Z', '+00:00'))
+    except Exception:
+        return None
+
+def one_line(s, n):
+    return ' '.join(str(s or '').split())[:n]
+
+last = {}
+for raw in open(PATH, encoding='utf-8', errors='replace'):
+    raw = raw.strip()
+    if not raw:
+        continue
+    try:
+        a = json.loads(raw)
+    except Exception:
+        continue
+    if a.get('id'):
+        last[a['id']] = a
+
+due = []
+for a in last.values():
+    if a.get('state') != 'active' or a.get('acknowledged_at'):
+        continue
+    t = when(a.get('triggers_at') or a.get('fired_at'))
+    if t is not None and t > now:
+        continue
+    due.append(a)
+
+acked = [a for a in last.values()
+         if a.get('acknowledged_by') == 'langston' and a.get('state') != 'resolved'
+         and (when(a.get('acknowledged_at')) or now - datetime.timedelta(days=2)) > now - datetime.timedelta(hours=24)]
+
+for a in sorted(due, key=lambda x: str(x.get('triggers_at') or '')):
+    print('DUE   | %s | %s | %s' % (a.get('id'), a.get('severity'), one_line(a.get('title'), 140)))
+    print('      | body: %s' % one_line(a.get('body'), 100000))
+    print('      | metadata: %s' % json.dumps(a.get('metadata') or {}, ensure_ascii=False))
+for a in acked:
+    print('LACKED| %s | %s | %s' % (a.get('id'), a.get('severity'), one_line(a.get('title'), 140)))
+print('COUNT | host=%s due=%d langston_acked_24h=%d ids=%d' % (socket.gethostname(), len(due), len(acked), len(last)))
diff --git a/scripts/measure-gate/test-guard-measurement-shape.mjs b/scripts/measure-gate/test-guard-measurement-shape.mjs
index 6407ea263..746ce403e 100644
--- a/scripts/measure-gate/test-guard-measurement-shape.mjs
+++ b/scripts/measure-gate/test-guard-measurement-shape.mjs
@@ -187,4 +187,8 @@ function extractCommands(path, label) {
       out.push({ site: at, cmd: m[1].trim() }); hit = true;
     }
+    // B-GOV-REPORTING r6 (#980): the §10.5 alert read is now a whole-file script sent over stdin.
+    for (const m of line.matchAll(/`([^`]*due-alerts\.py[^`]*)`/g)) {
+      out.push({ site: at, cmd: m[1].trim() }); hit = true;
+    }
     // ⛔ FENCED BLOCKS. `CLAUDE.md:279` — the §6.6 mandated inbox read — lives inside a ```bash
     // fence, NOT backticks, so the pattern above never saw it. A home written as a fence was
@@ -207,4 +211,7 @@ function extractCommands(path, label) {
       out.push({ site: at, cmd: m[1].replace(/\\"/g, '"').replace(/:\*$/, '').trim() });
     }
+    for (const m of line.matchAll(/"Bash\(((?:[^"\\]|\\.)*due-alerts\.py(?:[^"\\]|\\.)*)\)"/g)) {
+      out.push({ site: at, cmd: m[1].replace(/\\"/g, '"').replace(/:\*$/, '').trim() });
+    }
   });
   return out;

```
