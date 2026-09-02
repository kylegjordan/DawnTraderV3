# B-ALERT-ACTOR-ALLOWLIST — SCOPE (r1)

change-class: non_architecture
**Owner:** CC-B · **Issue:** #987 · **Kyle directive:** 2026-09-02 (*"fix the anonymous acknowledgment problem"*, sequenced after the #605 pin proof, before the item-by-item alert review) · **Queue:** `PHASE_19_PLAN` §governance 2.4 · **Status:** Step 1, with Langston

---

## 0. THE PROBLEM, MEASURED — not "sloppy names", a mandated convention with no register behind it

**On 2026-09-02, five alerts left the due list acknowledged by `cc-session-2026-09-02`. That string identifies no session.** Measured over the last 30 days of `system-alerts.jsonl` (population: every alert with `acknowledged_at ≥ 2026-08-03`; instrument: distinct `acknowledged_by` strings): **roughly five actors used 23 distinct name strings.** Langston appears as `langston`, `Langston`, `Langston (reviewer)`, `langston-reviewer`, `Langston-reviewer` and one 60-character transport note; Analyst as `cc-analyst`, `cc-c`, `cc-c-2026-08-23`, `cc-c-2026-08-24`; and **eight distinct `cc-session-<date>` labels account for 38 acks, 15 of them this month.**

⛔ **THE ROOT CAUSE IS A RULE, NOT A HABIT.** `CLAUDE.md` §10.5 step 3 — the always-loaded rules file — instructs: *"`ack <id> --by <session-name>` (session names: `cc-session-<YYYY-MM-DD>` or `langston` or `kyle-direct`)."* **Sessions acking anonymously were following the rule.** `ALERT_HANDLING_PROTOCOL.md:28` says `--by <CC-A|CC-B|kyle|...>` — a different convention — and `:30` says *"`acknowledged_by` IS the owner record."* **Two governing documents disagree, and the tool accepts anything, so the owner record cannot be one.**

## 1. PROVENANCE (mandatory 1.b — Tier 1, behaviour changes)

**`acknowledged_by`** — introduced **2026-05-17** by `6a70b45c4` (*B-NEW-40: pg pool keepalive + TEC refresh timeout fence + alerts infra*), typed at `server/services/system-alerts.ts:185` as `string | null` with the comment **`// 'kyle' | 'cc-session-...' | 'langston' | 'system' | etc.`** ⇒ **the anonymous form was the DESIGNED convention.** It predates the session roster (`cc-session-roster.json`, Kyle directive 2026-06-12) by 26 days. **Disposition (2): relevant, needs updating to today's intent** — the roster now exists and names are permanently bound to sessions.

**`resolved_by_claimed` / `resolved_by_transport`** — introduced **2026-07-10** by B-GOV-INTEGRITY-1 F3b (`596abfa77` ledger; code `c24599cfa`+`19f80d3b8`, #447). Quoted from the header at `:187-190`: *"Closure must be a RECORD, not an assertion. Two identity fields at DIFFERENT trust levels — never merge them, or a claim launders into a fact: `resolved_by_claimed` — what the CALLER passed (`--by`) — a CLAIM; `resolved_by_transport` — the channel the resolve arrived through — CODE-DERIVED, never caller-supplied."* And the evidence gate at `:466-476` is enforced **in the server function** *"so EVERY resolve path — CLI, dispatcher, API, governance-checker — is bound by it."* **Disposition (1): still correct — and it is the model this batch copies.**

⛔ **THE TRAP LANGSTON ALREADY NAMED, adopted as a constraint (#642):** *"a `--by` reassignment would be one more UNAUTHENTICATED FREE-TEXT field, i.e. PROVENANCE-SHAPED THEATER."* ⇒ **this batch does NOT authenticate anyone and does not claim to.** It makes the CLAIM well-formed: a `--by` outside a fixed, roster-derived set is REFUSED, so the register can at least be read. `resolved_by_transport` remains the only verifiable half.

**Searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md` (#447, #642, #647, #340), `ALERT_HANDLING_PROTOCOL.md`, `git log -S` on both field names (not path-limited), `server/services/system-alerts.ts`, `scripts/system-alerts.ts`. **Capability check (existing identity validation anywhere): none** — positive control `RESOLUTION_EVIDENCE_SENTINELS` found at 4 sites with the same grep.

## 2. ARCHITECTURAL READ (mandatory 1.a)

`SYSTEM_IMPACT_MAP.md` carries the alerting path at `:892-897` and `:2777` (dispatcher, owner-routing) but **no component entry for the alert library's identity fields** — flagged as a SIM gap, closed in Step 10. `SYSTEM_MANUAL.md`: 3 incidental mentions; **no System-Manual-scope content is touched** (no engine/strategy/regime/filter/signal-pipeline/math).

**CALLER CENSUS of `ackAlert` / `resolveAlert` — compile-driven grep, every site, unbounded:**
| site | identity it passes | bound by a server-side gate? |
|---|---|---|
| `scripts/system-alerts.ts:275,:297` (CLI) | `--by` free text | yes — calls the server functions |
| `server/routes.ts:6770` (API ack, `authenticateToken`) | `req.body.by` free text | yes |
| `scripts/governance-checker/poller.mjs:389` + `heartbeat-check.mjs:50` | `governance-checker`, `governance-checker-heartbeat` via the CLI | yes |
| `scripts/b-new-40-soak-verify.ts:126` | **`b-new-40-soak-verify-<pid>`** — a PID-suffixed string | yes — **and a strict list would refuse it; see OBJ-3** |
| `server/scripts/staging-liveness-watchdog.mjs` | writes rows directly with `acknowledged_by: null` — does not ack | n/a |

## 3. OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** | **ONE canonical actor set, defined once in `server/services/system-alerts.ts`**, derived from the roster aliases plus the fixed machine actors: `cc-a`, `cc-b`, `cc-c`, `cc-infra`, `langston`, `kyle`, `governance-checker`, `governance-checker-heartbeat`, `dispatcher`, `system`. Exported; the CLI usage text prints it. | a unit test asserts the set's session members equal the roster's `active` aliases lower-cased — **drift between roster and code fails CI** |
| **OBJ-2** | **`ackAlert` and `resolveAlert` REFUSE any `by` outside the set** — enforced in the server functions, same placement and reasoning as the evidence gate, so CLI, API, checker and dispatcher are all bound. Refusal names the accepted values. | unit test: `cc-b` accepted; `cc-session-2026-09-02`, `Langston (reviewer)`, `cc-c-2026-08-23` refused; **mutation: remove the check ⇒ the test fails** |
| **OBJ-3** | The one legitimate machine caller with a variable name (`b-new-40-soak-verify-<pid>`) passes a fixed `b-new-40-soak-verify` and the PID moves into the log line. | grep: no remaining caller builds a `by` from a PID or a date |
| **OBJ-4** | **The two disagreeing documents agree with the tool:** `CLAUDE.md` §10.5 step 3 names the roster aliases and retires `cc-session-<YYYY-MM-DD>`; `ALERT_HANDLING_PROTOCOL.md:28` lists the same set; `_archive/CLAUDE_MD_RULE_HISTORY.md` records the change in the same commit. | both docs quote the exported set; the rule-history entry exists |
| **OBJ-5** | **History is NOT rewritten.** The 23 historical strings stay as written; the completion report carries a mapping table (string → actor) so a reader can normalise, and the ledger row `#987` links it. | `git diff` of `system-alerts.jsonl` is empty; the table is in the report |
| **OBJ-6** | Live verification on staging after deploy, with a positive control: a test alert acked `--by cc-b` succeeds; the same ack `--by cc-session-2026-09-02` is refused with the accepted list in the message; the API path refuses the same body. | recorded in the completion report with the alert id |

## 4. OUT OF SCOPE, stated so it is not silently absorbed
- **Reassignment / transfer of an acked alert** (#642's actual subject) — untouched; Langston's *"honest fork"* there is a separate decision.
- **Last-writer-wins on the row** (#647) — untouched; this batch makes the writer's *name* well-formed, not the write atomic.
- **Authentication.** Nothing here proves who typed `--by cc-b`. `resolved_by_transport` stays the only verifiable field, and the docs will say so.

## 5. CHANGE-CLASS: `non_architecture`
Diff surface: `server/services/system-alerts.ts`, `scripts/system-alerts.ts`, `scripts/b-new-40-soak-verify.ts`, one unit test, `CLAUDE.md` §10.5, `ALERT_HANDLING_PROTOCOL.md`, `CLAUDE_MD_RULE_HISTORY.md`, SIM. **Nothing under `server/core`, strategy, regime, filter, signal pipeline or math.** SIM: applicable (a cross-cutting identity register gains a rule). System Manual: judged `N/A` on that diff fact. **Deploy: required** — the server function ships in the app and the CLI runs from the deployed tree.

## 6. §9.4 — what this batch was found by, and what it leaves
Found during Kyle's 2026-09-02 alert review. **Related, not absorbed:** #647 (row race), #642 (transfer path), #646, #654. Nothing deferred without a home.
