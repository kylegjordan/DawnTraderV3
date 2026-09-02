# B-ALERT-ACTOR-ALLOWLIST — SCOPE (r2 — Langston's Step-1 blocker + both objective rewrites taken; r1's census stopped one hop short)

change-class: non_architecture
**Owner:** CC-B · **Issue:** #987 · **Kyle directive:** 2026-09-02 (*"fix the anonymous acknowledgment problem"*, sequenced after the #605 pin proof, before the item-by-item alert review) · **Queue:** `PHASE_19_PLAN` §governance 2.4 · **Status:** Step 1 r2, with Langston

---

## ⛔ r2 — WHAT CHANGED AND WHY (Langston, 2026-09-02 11:38, read at the ref himself)

1. **BLOCKER — the census stopped one hop short of the string producers.** `client/src/pages/system-alerts.tsx:76,:147-155` is a **free-text "Ack as:" input, default `kyle`**, posted straight to `routes.ts:6770`. **A sixth identity site, the one a human types into, and no r1 objective reached it** — docs don't constrain a text box. Worse: an allowlist throw would land in the route's `catch` and return **HTTP 500 "Failed to acknowledge alert"** with no accepted list. ⇒ **OBJ-2b (new): refusal is a 400 naming the set; OBJ-2c (new): the input becomes a select bound to the exported set, served on `GET /api/system-alerts`.** *Make the string unconstructable at the site where a human types it.*
2. **OBJ-1's coupling was right; its fence was wrong in three places** — set equality must hold in **both** directions; entries must be **tagged** so the partition cannot drift; and **a roster-derived set would refuse the incumbents' actual strings** (`cc-analyst` 21 acks, `infra-claude` 5), turning a refused ack into *no* ack. ⇒ a **named normalisation table**, not fuzzy matching.
3. **OBJ-5's verification was vacuous** — `git diff` on a file that is not in git (`/var/log/dawntrader/system-alerts.jsonl`) is empty whether or not history was rewritten. Replaced with content-conservation on the object that *does* change, plus the load-bearing assertion that **the allowlist binds writes only, never the read/parse path.**
4. Two smalls: validate **before** `withLock`, mirroring the evidence gate at `:466-476`; the live check exercises the incumbents' real strings, not just the happy path.

**Everything below r1's §0–§2 still holds and is re-derived, not restated by memory.** Langston re-derived the headline from the live queue independently: **23 distinct strings / 267 acks since 2026-08-03; eight `cc-session-<date>` labels = 38 acks, 15 of them `cc-session-2026-09-02` — exact match.**

## 0. THE PROBLEM, MEASURED

**All-time, measured 2026-09-02 on the live file (782 rows, sha256 `d5cbd5a2…`): 75 distinct `acknowledged_by` strings; 67 distinct `resolved_by_claimed`.** The top of the multiset: `langston` 179 · `cc-b` 94 · **`cc-session-2026-06-19` 88** · `cc-a` 47 · `governance-checker` 39 · **`cc-2026-06-24-govflood` 37** · `cc-c` 24 · `cc-analyst` 21 · `Langston` 18 · `cc-session-2026-06-25` 16 · `cc-session-2026-09-02` 16 … and a tail of 60 strings with ≤13 acks each, 40 of them singletons or pairs.

⛔ **THE ROOT CAUSE IS A RULE, NOT A HABIT.** `CLAUDE.md` §10.5 step 3 — the always-loaded rules file — instructs: *"`ack <id> --by <session-name>` (session names: `cc-session-<YYYY-MM-DD>` or `langston` or `kyle-direct`)."* **Sessions acking anonymously were following the rule.** `ALERT_HANDLING_PROTOCOL.md:28` says `--by <CC-A|CC-B|kyle|...>` — a different convention — and `:30` says *"`acknowledged_by` IS the owner record."* Two governing documents disagree, and **the tool accepts anything, so the owner record cannot be one.**

## 1. PROVENANCE (mandatory 1.b — Tier 1, behaviour changes)

**`acknowledged_by`** — introduced **2026-05-17** by `6a70b45c4` (*B-NEW-40: pg pool keepalive + TEC refresh timeout fence + alerts infra*), typed at `server/services/system-alerts.ts:185` with the comment **`// 'kyle' | 'cc-session-...' | 'langston' | 'system' | etc.`** ⇒ **the anonymous form was the DESIGNED convention**, 26 days before the session roster (`cc-session-roster.json`, Kyle directive 2026-06-12). **Disposition (2): relevant, needs updating to today's intent.**

**`resolved_by_claimed` / `resolved_by_transport`** — introduced **2026-07-10** by B-GOV-INTEGRITY-1 F3b (ledger `596abfa77`; code `c24599cfa`+`19f80d3b8`, #447). Header at `:187-190`, quoted: *"Closure must be a RECORD, not an assertion. Two identity fields at DIFFERENT trust levels — never merge them, or a claim launders into a fact: `resolved_by_claimed` — what the CALLER passed (`--by`) — a CLAIM; `resolved_by_transport` — the channel the resolve arrived through — CODE-DERIVED, never caller-supplied."* The evidence gate at `:466-476` is enforced **in the server function**, *"so EVERY resolve path — CLI, dispatcher, API, governance-checker — is bound by it."* **Disposition (1): still correct — and it is the model this batch copies, including its placement before `withLock`.**

**The UI input** — `client/src/pages/system-alerts.tsx:76` `useState<string>('kyle')`, `:147-155` the input, `:86` the mutation posting `{ by }` to `/api/system-alerts/:id/acknowledge`. **Provenance: `INFERRED-FROM-CODE`** — no batch record found for the page in `BATCH_CATALOG` or the completion reports under `system-alerts.tsx` (searched by filename); the label *"(written to acknowledged_by audit field)"* shows it was built as an audit convenience, not an identity control. **Disposition (2).**

⛔ **THE CONSTRAINT FROM #642, adopted:** *"a `--by` reassignment would be one more UNAUTHENTICATED FREE-TEXT field, i.e. PROVENANCE-SHAPED THEATER."* ⇒ **this batch does NOT authenticate and does not claim to.** It makes the CLAIM well-formed and unconstructable-by-typo. `resolved_by_transport` remains the only verifiable half; the docs will say so.

**Searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md` (#447, #449, #642, #647, #340), `ALERT_HANDLING_PROTOCOL.md`, `git log -S` on both field names (not path-limited), `server/services/system-alerts.ts`, `scripts/system-alerts.ts`, `server/routes.ts`, `client/src/pages/system-alerts.tsx`. **Capability check (existing identity validation anywhere): none** — positive control `RESOLUTION_EVIDENCE_SENTINELS` at 4 sites with the same grep.

## 2. ARCHITECTURAL READ (mandatory 1.a)

`SYSTEM_IMPACT_MAP.md` carries the alerting path at `:892-897` and `:2777` but **no component entry for the alert library's identity fields** — a SIM gap, closed at Step 10. `SYSTEM_MANUAL.md`: 3 incidental mentions; no System-Manual-scope content is touched.

**IDENTITY-SITE CENSUS — six sites, every one enumerated (r1 had five; the sixth is the one a human uses):**
| # | site | identity it passes | bound by the server gate? |
|---|---|---|---|
| 1 | `scripts/system-alerts.ts:275,:297` (CLI) | `--by` free text | yes |
| 2 | `server/routes.ts:6770` (API ack, `authenticateToken`) | `req.body.by` free text | yes — **but its `catch` at `:6775` turns a throw into HTTP 500** (OBJ-2b) |
| 3 | **`client/src/pages/system-alerts.tsx:76,:147-155`** | **free-text input, default `kyle`** | only via site 2 — **the human-typed site** (OBJ-2c) |
| 4 | `scripts/governance-checker/poller.mjs:389` + `heartbeat-check.mjs:50` | `governance-checker`, `governance-checker-heartbeat` via the CLI | yes |
| 5 | `scripts/b-new-40-soak-verify.ts:126` | `b-new-40-soak-verify-<pid>` | yes — **a strict set would refuse it** (OBJ-3) |
| 6 | `server/services/system-alerts.ts:513-528` `__backfillResolveProvenance__` | copies `acknowledged_by` → `resolved_by_claimed` on historical rows | ⛔ **explicitly UNBOUND** — it moves existing strings, it does not accept new ones (OBJ-5c) |

**Write path (the object OBJ-5 conserves):** every mutation is an **atomic whole-file rewrite** via tmpfile-rename inside `withLock()` (`:314-324`). An ack **mutates a row; it does not append** — so row count is invariant under a valid ack.

## 3. OBJECTIVES

| # | objective | verification |
|---|---|---|
| **OBJ-1** | **ONE canonical actor table, defined once in `server/services/system-alerts.ts`, every entry TAGGED `roster` \| `machine` \| `human` with a one-line reason.** `roster`: `cc-a`, `cc-b`, `cc-c`, `cc-infra` (the four active aliases, lower-cased). `machine`: `governance-checker` (39 acks; `poller.mjs:389`), `governance-checker-heartbeat` (1; `heartbeat-check.mjs:50`), `b-new-40-soak-verify` (site 5, after OBJ-3). `human`: `langston` (179 + variants; not in the roster — he is the reviewer, not a session), `kyle` (**0 acks all-time, kept because it is the UI default and the only human**). ⛔ **DROPPED, cite-or-drop: `dispatcher` and `system` — 0 acks all-time and no caller passes them; `'dispatcher'` exists only as a `ResolveTransport` value, which is a channel, not an actor.** | **CI fence, both directions:** a unit test asserts `set(roster-tagged) == set(active roster aliases, lower-cased)` — **the roster gaining OR losing a member fails CI.** Every `machine` entry's cited caller must grep-hit at the ref. |
| **OBJ-1b** | **A NAMED normalisation table applied before the membership test, storing the canonical value** — not fuzzy matching. From the live multiset: `Langston`, `Langston (reviewer)`, `langston-reviewer`, `Langston-reviewer`, `langston (transport: …)` → `langston` · `cc-analyst`, `cc-c-analyst`, `CC-C` → `cc-c` · `infra-claude` → `cc-infra` · `CC-A`, `cc-a-old-claude` → `cc-a` · plus case/whitespace. ⛔ **`cc-session-<date>`, `cc-<date>-govflood`, `cc-<alias>-<date>`, `phase4-*`, `b-new-43-*` are NOT mapped — they identify nobody and are REFUSED going forward.** | unit test: each mapped string → its canonical; each refused string → refused; **the table is data, and the test iterates it, so a mapping cannot be added without a case** |
| **OBJ-2** | **`ackAlert` and `resolveAlert` REFUSE any `by` that does not normalise into the table** — validated **before `withLock`**, mirroring the evidence gate's placement (`:466-476`), so **no lock is taken and no partial write occurs.** Refusal message names the accepted canonical set. | unit tests: `cc-b` accepted; `cc-analyst` accepted and **stored as `cc-c`**; `cc-session-2026-09-02` refused; **mutation: remove the check ⇒ the test fails**; **mutation: move the check inside `withLock` ⇒ a lock-acquired-before-refusal test fails** |
| **OBJ-2b** | **The API route returns 400 with the accepted set on refusal**, not the generic 500 — the allowlist error is a typed error the route recognises. | route test: refused body → 400, response lists the set; a genuine internal error still → 500 |
| **OBJ-2c** | **The UI input becomes a `<select>` bound to the exported set**, served on `GET /api/system-alerts` (`routes.ts:6703`) as `actors: [{value, tag}]`; default `kyle`. **No free-text path remains in the page.** | grep: no `<input` bound to `actorOverride`; the select's options equal the served set; **§9.3 UI verification in Claude-in-Chrome: the dropdown renders the set and an ack from it lands with the canonical value** |
| **OBJ-3** | Site 5 passes the fixed `b-new-40-soak-verify`; the PID moves into the log line. | grep: no caller builds a `by` from a PID or a date |
| **OBJ-4** | **The two disagreeing documents agree with the tool:** `CLAUDE.md` §10.5 step 3 names the canonical set and **retires `cc-session-<YYYY-MM-DD>`**; `ALERT_HANDLING_PROTOCOL.md:28-36` lists the same set and states that `resolved_by_transport` is the only verifiable field; `_archive/CLAUDE_MD_RULE_HISTORY.md` records the change in the same commit. | both docs quote the exported set verbatim; the rule-history entry exists |
| **OBJ-5** | **History is NOT rewritten, proven on the object that changes.** (a) Pre-deploy: sha256 of the file + the `acknowledged_by` multiset (75 distinct / 782 rows at scope time — re-taken at deploy time). (b) After OBJ-6's live acks: **row count identical** (an ack mutates, never appends); **exactly N rows' ack fields changed for N acks**; **the historical multiset is unchanged except for those N rows**. (c) **The allowlist binds WRITES ONLY — never `readAllAlerts`/parse** — a guard on read would silently drop all 75 historical strings at the next whole-file rewrite. (d) `__backfillResolveProvenance__` named as explicitly unbound. | (a)+(b) recorded in the completion report with the two sha256s; **(c) mutation test: a guard placed on the read path fails a test that round-trips a historical `cc-session-2026-06-19` row through read → rewrite unchanged** |
| **OBJ-6** | Live verification on staging after deploy, with positive and negative controls **on the incumbents' real strings:** ack `--by cc-analyst` → accepted, stored `cc-c` · `--by infra-claude` → accepted, stored `cc-infra` · `--by cc-session-2026-09-02` → refused, message lists the set · API body `{by:"cc-session-2026-09-02"}` → **400** with the set · UI select → ack lands canonical. | recorded in the completion report with the alert ids used |

## 4. OUT OF SCOPE, stated so it is not silently absorbed
- **Reassignment / transfer of an acked alert** (#642's actual subject) — untouched.
- **Last-writer-wins on the row** (#647) — untouched; this makes the writer's *name* well-formed, not the write atomic.
- **Authentication.** Nothing here proves who chose `cc-b` from the dropdown. `resolved_by_transport` stays the only verifiable field.
- **Normalising history.** The 75 strings stay as written; the completion report carries the mapping so a reader can normalise on read.

## 5. CHANGE-CLASS: `non_architecture`
Diff surface: `server/services/system-alerts.ts`, `server/routes.ts` (two handlers), `client/src/pages/system-alerts.tsx`, `scripts/system-alerts.ts`, `scripts/b-new-40-soak-verify.ts`, unit + route tests, `CLAUDE.md` §10.5, `ALERT_HANDLING_PROTOCOL.md`, `CLAUDE_MD_RULE_HISTORY.md`, SIM. **Nothing under `server/core`, strategy, regime, filter, signal pipeline or math.** SIM applicable. System Manual judged `N/A` on that diff fact. **Deploy: required.** **UI surface: yes** — OBJ-2c is §9.3-verified in Claude-in-Chrome.

## 6. §9.4
Found during Kyle's 2026-09-02 alert review. Related, not absorbed: #647, #642, #646, #654. **Nothing deferred without a home.**
