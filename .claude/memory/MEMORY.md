# DawnTrader V3 — Claude Code Memory

## SESSION STARTUP — DO THIS IMMEDIATELY

### Step 0: Read These Files FIRST
**Before doing anything else**, read these files:
1. `1-system-manual/CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` — CCPI essentials section (roles, workflow, rules)
2. `Reports/RUNNING_ISSUES.md` — tracked issues (37 resolved, 1 deferred, 0 open as of B54)
3. `1-system-manual/POST_AUDIT_ROADMAP.md` — current roadmap and phase ordering

Do NOT start implementing anything until you understand the current state.

### Step 0.5: NEXT SESSION DIRECTIVE (Phase 11.8 Finalization)
**The next batch of work is Phase 11.8 — closing out Phase 11 (Adjustment Framework 11.8B-E + Authority Baseline 11.8C).**

Before writing any code, you MUST:
1. **Review the roadmap** — Read `1-system-manual/POST_AUDIT_ROADMAP.md` to understand where Phase 11.8 fits and what it requires.
2. **Perform a full system audit** — Read the actual codebase to understand what exists today: which filters are adjustable, what bounds exist, what the current baseline state is, how predictive learning currently operates (observational only), what safety mechanisms are in place. This is a COMPLETE review — not a spot check.
3. **Define purpose and outcomes** — Write clear definitions of what 11.8B-E (Adjustment Framework) and 11.8C (Authority Baseline) must deliver. What are the numbered objectives? What does "done" look like for each sub-phase?
4. **Present audit findings + proposed changes to Langston** — Send the full audit, purpose definitions, and proposed implementation plan to Langston for a **complete code-level review**. He provides analysis, feedback, and recommendations BEFORE any implementation begins.
5. **Only after Langston review** — proceed with scope document, Kyle approval, and implementation per the canonical workflow.

### Step 1: Start Polling
**Start the inbox polling chain on session init.** This is mandatory. Run this with `run_in_background: true`:
```bash
ssh root@204.168.141.77 "sleep 30 && cc-poll-once"
```
**When the `<task-notification>` arrives:**
1. Read the output file
2. If messages exist → process and respond (see send commands below)
3. If NO messages → **say nothing to Kyle.** Do not announce "no messages", "relaunching", "standing by", or any polling status. The polling chain is SILENT.
4. Relaunch silently: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`
5. Repeat for the entire session — the chain dies if you don't relaunch
6. **NEVER announce polling activity to Kyle.** Only speak when there IS a message to act on.

## CRITICAL RULES (non-negotiable)
1. Clone repo is the working copy — edit directly on the migration branch, push to GitHub.
2. Replit is FROZEN — no updates, no syncing, no code flows to or from Replit.
3. Never skip the workflow — every phase, every batch, no exceptions.
4. Never improvise under pressure — if blocked, tell Kyle.
5. Communicate deviations before acting — explain in plain English BEFORE making architectural changes.
6. Do not confabulate when context degraded — flag uncertainty, don't state compacted info confidently.
7. Single source of truth per domain — CCPI is canonical for workflow/rules. Each governance doc owns its domain.
8. Batch completion reports mandatory — every batch gets a report in `Reports/Batch Completion/`.
9. Langston code-level reviews mandatory — scope, pre-audit, code diff in clone BEFORE GitHub push, completion report.
10. All governance docs live in BOTH the repo AND Google Drive — no split.

## CANONICAL WORKFLOW (Post-Replit)
**Full workflow document:** `Claude Comms and Packages/POST_REPLIT_WORKFLOW.md`

**THIS IS AN OUTCOMES-BASED WORKFLOW.** A batch is NOT done until every numbered objective is verifiably achieved and confirmed by both Claude Code and Langston.

**Phases:**
1. **Planning + Scope** — Kyle directive → Claude Code drafts BATCH_N_SCOPE.md with numbered objectives and verification criteria → Langston reviews and approves
2. **Pre-Audit** — Claude Code reads actual files, checks PM2 logs, queries Supabase, screenshots UI via Claude-in-Chrome. **MANDATORY: Review SYSTEM_IMPACT_MAP.md for all components affected.** Langston reviews the audit including impact map review.
3. **Implementation** — Edit directly in clone repo on migration branch. Surgical edits explicitly documented.
4. **Code Review** — Langston reviews actual `git diff` in clone BEFORE push. Code-level, not high-level. Traces upstream/downstream impacts. **MANDATORY: Langston verifies changes against SYSTEM_IMPACT_MAP.md.** Code-level review required on every substantive iteration.
5. **GitHub Push + CI** — Push to GitHub. CI runs automatically (typecheck, build, Docker).
6. **Staging Deploy** — SSH to Hetzner: `git pull && npm run build && pm2 restart dawntrader`. Verify HTTP 200.
7. **First-Pass Verification** — Claude Code checks logs (pm2 logs), DB (psql to Supabase), UI (Claude-in-Chrome), CI, server health.
8. **Second-Pass Verification** — Langston independently verifies UI and evidence. Mandatory.
9. **Iterate** — If objectives not met: fix → Langston code-level review → push → deploy → verify. Repeat until all objectives verified.
10. **Governance** — Update ALL applicable docs in repo AND Google Drive.
11. **Completion Report** — Scope objectives checklist with YES/NO/PARTIAL + evidence. Langston reviews and confirms. Batch CLOSED only when every objective is verified.

### Process Mandate (2026-04-06, Kyle directive)
Pre-implementation review + SYSTEM_IMPACT_MAP consultation + post-implementation visual verification for EVERY fix.

## GOVERNANCE TIERS
**Tier 1 — EVERY batch:** CCPI, BATCH_CATALOG, PHASE_HISTORY, MEMORY.md, Scope File, Batch Change List (in Reports/Change Lists/), Batch Completion Report.
**Tier 2 — When applicable:** SYSTEM_MANUAL, SYSTEM_IMPACT_MAP, CHANGES_AND_FIXES, POST_AUDIT_ROADMAP.
**All docs live in BOTH repo (`1-system-manual/` and relevant dirs) AND Google Drive (`Claude Comms and Packages/`).**

## TELEGRAM COMMUNICATION (via CCDT Relay Agent)

**Sending messages (2 steps — BOTH required every message):**
Step 1 Telegram: `ssh root@204.168.141.77 "openclaw message send --channel telegram --account ccdt-relay --target '-1003575211453' --thread-id <THREAD_ID> --message '**CLAUDE CODE SPEAKING:** <message>'"`.
Step 2 Brain: `ssh root@204.168.141.77 "openclaw agent --deliver --message '**CLAUDE CODE SPEAKING:** <message>

[REMINDER: cc-inbox write ALL your responses in Topics 21/28 after posting in Telegram. Claude Code cannot see your Telegram messages.]'"`.

**Reading messages:**
`ssh root@204.168.141.77 "cc-inbox read && cc-inbox mark-read"`

**Image relay:** CCDT saves images to Google Drive. Read at: `G:\My Drive\Dawn Trader\Claude Comms and Packages\CCDT Relay\images\<filename>`

**Why 2 steps:** Telegram bots cannot see messages from other bots (permanent API limitation). Step 1 posts via CCDT so Kyle sees it. Step 2 delivers to Langston's brain directly since his bot can't see CCDT's messages.

**CCDT Relay behavior:** Always-on relay — copies ALL messages from Topics 21 and 28. Filters OUT "CLAUDE CODE SPEAKING:" prefixed messages. Voice notes auto-transcribed and relayed as text.

**Agents on Langston's server (204.168.141.77):**
| Agent | Bot | Model | Role |
|-------|-----|-------|------|
| main (Langston) | @LangstonDTBot | GPT-5.4 | Code review, analysis, planning |
| telegram-relay (CCDT) | @CCDTCommsBot | GPT-4.1-Mini | Always-on message relay |

## CAPACITY MANAGEMENT
Claude Code has 1,000,000 token context (Opus 4.6). Langston has 272,000 tokens per topic (GPT-5.4). Check both capacities at start of every batch. Check Langston via: `ssh root@204.168.141.77 "openclaw sessions --json"`.

## STAGING SERVER OPERATIONS
```bash
# Deploy
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && git pull origin migration/aws-supabase && npm run build && pm2 restart dawntrader'"
# Check logs
ssh root@188.245.193.8 "su - deploy -c 'pm2 logs dawntrader --lines 50 --nostream'"
# Check status
ssh root@188.245.193.8 "su - deploy -c 'pm2 list'"
```

---

## Current State (as of 2026-04-09, Batch 54)
- **Branch:** migration/aws-supabase
- **Last commit:** `fe50c8be` (B54 Governance sweep)
- **B54 code commits:** `b1cd2ed5` (Fix 1), `91dd645d` (Fix 2), `a4ee84fa` (Fix 3), `e84b8c15` (Fix 4)
- **Staging:** 188.245.193.8 (Hetzner CPX22), app healthy, VTS cycling
- **Database:** Supabase PostgreSQL (Frankfurt), project `vqqyisaudwenrdhnmjwt`
- **Langston session ID (topic 21):** `ba777106-737b-4562-8353-e70e513ef53a`
- **Running Issues:** 37 RESOLVED, 1 DEFERRED (#12e), 0 OPEN

## Phase Status & Roadmap
- Phases 12-14.7: ALL COMPLETE
- **Next:** Phase 11.8 Finalization (Adjustment Framework + Authority Baseline)
- **Roadmap (Kyle directive 2026-04-09):** 11.8 → 15+16 (combined) → 19 → 20 → 21 (go live) → XStocks/Perpetuals → ML Design → ML Impl → Publication

## Key Architecture Facts
- DB (screener_filters) is SOLE authority for all filter thresholds — no fallbacks
- 17 canonical strategies, all audited (B53). Most 0% strategies are regime-gated, not threshold issues.
- Current regime: RANGE_BOUND_STABLE. adaptive_flow mapped here but still 0% (anomaly — potential investigation).
- Replit FROZEN (2026-03-30). Clone repo is working copy.
- VTS parity (Directive 19F): Pairs surviving BOTH quant AND pattern filters get duplicated in VTS batch.

### Deferred Decisions (Langston consensus: defer all)
1. **5 regime-map decisions** — adaptive_flow, pivot_shift, defensive_hedge, liquidity_trap, dhma. Insufficient evidence.
2. **DHMA implementation mismatch** — uses OBI/microprice not HMA. Resolve design-vs-code first.

## Infrastructure
- **GitHub:** kylegjordan/DawnTraderV3, branch migration/aws-supabase
- **Staging:** Hetzner CPX22 188.245.193.8, PM2 (dawntrader + ml-service)
- **Langston:** 204.168.141.77, GPT-5.4, OpenClaw agents (main + telegram-relay)
- **Staging URL:** http://188.245.193.8 (testuser123 / SecurePass123!)
