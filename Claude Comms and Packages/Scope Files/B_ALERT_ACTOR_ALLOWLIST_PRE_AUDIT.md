# B-ALERT-ACTOR-ALLOWLIST — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (r1)

**Owner:** CC-B · **Issue:** #987 · **change-class: non_architecture** *(confirmed by Langston at Step 1: `config.mjs:130-134` makes `system_manual` and `sim` CONDITIONAL for this class; no `CORE_ENGINE_PATHS` entry matches the diff)* · **Scope:** `B_ALERT_ACTOR_ALLOWLIST_SCOPE.md` r3, Step 1 APPROVED 2026-09-02 · **Read at:** `origin/migration/aws-supabase` = `2c2111a80` (all `path:line` below are from the ref, not my working tree)

---

## ⛔ PREVIOUSLY STATED / NOW — every number that moved since the scope

> **PREVIOUSLY STATED: six identity sites. NOW: seven.** REASON: the scope's census counted code sites; **Langston's own path is a seventh** — he acks and resolves over SSH into the same CLI (`langston` 179 acks, plus five spelling variants), and nothing in the repo constrains what his prompt tells him to type. It is bound by the same server gate (site 1) but it is a distinct *producer* of strings and the normalisation table's biggest customer.
> **PREVIOUSLY STATED: `kyle` 0 acks all-time. NOW: still 0 — but the UI default is `kyle` and the UI has NO error display**, so a refused ack from the page would be *invisible*, not merely a 500. REASON: `client/src/pages/system-alerts.tsx` has no `onError`/`isError` handling on the ack mutation (unbounded grep, §A6).
> **PREVIOUSLY STATED: the unit tests pass `--by`-style strings. NOW: two fixtures pass `'test'` and six pass `'CC-A'` (upper-case).** REASON: read at the ref (§A7). `CC-A` normalises; `'test'` does not and those two fixtures must change — stated here so it is not a surprise in CI.
> **PREVIOUSLY STATED: 782 rows / 75 distinct strings.** Unchanged at this audit; **re-taken in the deploy command per OBJ-5(a), never read forward from here.**

---

## PART A — THE AUDIT (sources named; every claim carries its object)

### A1 · SOURCE 1, the code at the ref — what `ackAlert` / `resolveAlert` actually do
- **`server/services/system-alerts.ts:436-455` `ackAlert(id, by)`** — inside `withLock`, finds the row; **writes `acknowledged_by = by` only when `state === 'active'`** (`:443-448`); any other state returns the row unchanged (`:449-452`, *"idempotent"*). **`by` is never inspected.** ⇒ the ack path has no identity check at all; and (cross-ref, not this batch) a second ack on a non-active row silently does nothing — **that is #642's subject and is untouched here.**
- **`:461-498` `resolveAlert(id, by, evidence, transport)`** — **the evidence gate runs at `:471-477`, BEFORE `ensureFileExists()` and BEFORE `withLock`**, throwing a plain `Error` whose message names the accepted forms. Inside the lock it writes `resolved_by_claimed = by`, `resolved_by_transport = transport`, and **if the row was never acknowledged it also writes `acknowledged_by = by`** (`:490-493`). ⇒ **the resolve path is a second writer of `acknowledged_by`**, so the allowlist must sit in front of *both* functions, not only `ackAlert`. **This is the placement OBJ-2 copies: validate before the lock, throw a typed error.**
- **`:320` `writeAllAlertsAtomic`** — *"Atomic whole-file rewrite via tmpfile-rename. Always called inside withLock()"*. **`:291` `readAllAlerts()`** parses every line; **it has no identity logic** — the object OBJ-5(c) must keep untouched.
- **`:513-528` `__backfillResolveProvenance__`** — copies `acknowledged_by → resolved_by_claimed` on historical rows under the lock; *"Called only by `scripts/b-gov-integrity-1-backfill-resolve-provenance.ts`"* (`:504`). It **moves** strings, it does not accept new ones. **Explicitly unbound by this batch (OBJ-5(d)).**

### A2 · §9.5(a) — component census on the two identity fields, repo-wide, tests excluded (unbounded grep, `acknowledged_by|resolved_by_claimed`)
| question | members | count |
|---|---|---|
| who **writes** `acknowledged_by`? | `ackAlert` `:446` · `resolveAlert` `:492` (unacked-row branch) · `addAlert` `:366` (writes `null` at creation) · `staging-liveness-watchdog.mjs:56` (writes `null` on its fallback rows — **a writer OUTSIDE the library, appending rows directly**) | **4** |
| who **writes** `resolved_by_claimed`? | `resolveAlert` `:487` · `__backfillResolveProvenance__` `:527` · `addAlert` `:368` (`null`) · watchdog `:58` (`null`) | **4** |
| who **reads** them? | `scripts/system-alerts.ts:165` (dispatcher body: *"owned by X"*) and `:262` (list output) · `client/src/pages/system-alerts.tsx:23` (type) · `b-gov-integrity-1-backfill-…ts:15,:72,:82` (the one-shot script) | 3 files |
| who **mutates** an existing value? | **exactly one**: `__backfillResolveProvenance__` (`:527`, one-shot, historical rows only). No path re-writes a populated `acknowledged_by` — `ackAlert` refuses non-active rows, `resolveAlert` writes it only when null | **1 — stated as an asserted single member; evidence is the grep above** |
| who **deletes** rows? | **NONE** — unbounded grep for `deleteAlert|removeAlert|splice(|filter((a) => a.id !==` across the library and the CLI returns nothing; positive control on the same corpus: `writeAllAlertsAtomic` hits. **The file only grows or rewrites; rows are never removed.** | **0** |
| who **schedules/starts** work against the file? | see A3 — **four systemd timers + the API + the CLI + Langston over SSH** | 7 entry points |

### A3 · §9.5(a-ii) entry points enumerated FIRST, repo-wide + on the box (source 2, measured on staging 2026-09-02)
| # | entry point | what it runs | identity it passes | cadence |
|---|---|---|---|---|
| 1 | `system-alerts-dispatcher.timer` | `npm run system-alerts -- fire-due` (`scripts/system-alerts.ts:210` `fireDue()` → `:233` `processResurface`) | **none — it promotes and re-surfaces; it never acks or resolves** (unbounded grep: `ackAlert`/`resolveAlert` appear only in `cmdAck :275` / `cmdResolve :297`) | every 15 min |
| 2 | `governance-checker.timer` | `node scripts/governance-checker/poller.mjs` from **a second clone, `/opt/governance-checker/DawnTraderV3`** (`ExecStartPre: git fetch` — the clone behind alert `65c1acaa`) | `poller.mjs:389` `--by governance-checker` via the deploy tree's CLI | every 30 min |
| 3 | `governance-checker-heartbeat.timer` | `heartbeat-check.mjs` | `:50` `--by governance-checker-heartbeat` | every 15 min |
| 4 | `dawntrader-watchdog.timer` | `server/scripts/staging-liveness-watchdog.mjs` | **appends rows directly with `acknowledged_by: null`** — never acks; **not a library caller, so NOT bound by the server gate; needs no binding because it writes `null`** | every 5 min |
| 5 | `POST /api/system-alerts/:id/acknowledge` (`routes.ts:6757-6790`, `authenticateToken`) | `ackAlert(id, req.body.by)` | free text from the body | on demand |
| 6 | the UI page → site 5 | `ackMutation.mutate({ id, by: actorOverride })` (`system-alerts.tsx:195`), `actorOverride` default `'kyle'` (`:76`), free-text `<input>` (`:147-155`) | free text | on demand |
| 7 | **Langston over SSH → the CLI** (`ssh staging … npm run system-alerts -- ack/resolve --by …`, per his own instructions) | site 1's CLI | **whatever his prompt says** — measured: `langston` 179, `Langston` 18, `Langston (reviewer)` 3, `langston-reviewer` 3, `Langston-reviewer` 1, one 60-char transport note | on demand |
**Exactly one entry point promotes and re-surfaces (the dispatcher); it never writes an identity.** Two machine timers write fixed identities. Three human/agent paths write free text. **No two concurrent entry points write the same row's identity field on a schedule** — the row race in #647 is between two *human* resolves, and it is out of scope here.

### A4 · SOURCE 2, the runtime — the live file
782 rows, sha256 `d5cbd5a2…` at scope time and **already `9d825862…` by Langston's re-read the same day** — the file mutates on every dispatcher tick's re-surface. **75 distinct `acknowledged_by`, 67 distinct `resolved_by_claimed`.** The app's rotated stdout logs (`pm2-logrotate-out__2026-08-20…08-27`) are the only retained window and the ack route is not logged distinctively — **route-hit counts are not measurable from logs; the file is the instrument.**

### A5 · SOURCES 3 + 4 — SIM and System Manual
- **SIM** carries the alerting path (`:892-897`: writers via `addAlert`, the governance-checker as *"the FIRST writer that lives OUTSIDE the app process"*; `:2777`: the dispatcher + owner-routing) — **but no entry for the identity fields or for the API/UI ack path.** ⇒ **governance gap, flagged:** the SIM does not know that a browser page is a writer to this file. Closed at Step 10 (P9).
- **System Manual** mentions the queue three times (`:7574` CLI, `:10710` a table row, `:11232` input-health alerting) — **silent on identity.** Not a contradiction (the manual does not model who acks); **silence stated, not treated as coverage.** Consistent with the class ruling: no manual content is touched.

### A6 · THE FINDING THE SCOPE MISSED — the page cannot show a refusal
`client/src/pages/system-alerts.tsx` `ackMutation` (`:84-94`) has `onSuccess` only. **Unbounded grep for `isError`, `onError`, `ackMutation.error`: zero hits.** `apiFetch` (`client/src/lib/api.ts:17`) has *"proper error handling with HTTP status codes"* per its header, but **the page never renders the mutation's error state.** ⇒ **even with OBJ-2b's 400, a refused ack from the browser would be silent** — the button does nothing and the user sees nothing. **OBJ-2c must add an error surface, not only a select.** *(A select makes the refusal near-impossible; the error surface is for the day the served set and the client disagree — e.g. a stale tab after a deploy.)*

### A7 · SOURCE 5, the ledger and the tests — already decided / already known
- **#447 RESOLVED by B-GOV-INTEGRITY-1** — the evidence gate and the claimed/transport split. **The model for this batch; not re-litigated.**
- **#642 OPEN** — `acknowledged_by` treated as an ownership register with no transfer path; **Langston's ruling there (no unauthenticated reassign) is a constraint on this batch; the transfer path is NOT built here.**
- **#647 OPEN** — last-writer-wins on the row (two resolves 445 ms apart). **Not touched**; this batch makes the writer's *name* well-formed, not the write atomic.
- **#646 RETRACTED**, **#654 / #679** (checker ageing, re-fire) — adjacent, not this.
- **`dt-deploy.sh:46,:81`** already validates its own `--by` with a *shape* regex and lists `CC-A|CC-B|CC-C|kyle-direct|langston` — **a THIRD naming convention in the repo** (upper-case aliases, `kyle-direct`). Out of scope to change, **cross-referenced so `B-CHANGE-CLASS-DOCSET-FIT`-style drift is visible**; the normalisation table maps `CC-A`→`cc-a` so a session copying the deploy convention is not refused.
- **Tests at the ref:** `system-alerts-dedup.test.ts:54,:64` pass `'test'`; `gov-integrity-1.test.ts:49,:56,:126` and `resurface.test.ts:148,:167` pass `'CC-A'`. **`CC-A` normalises; `'test'` does not** — those two fixtures change to a canonical value (P7). *Stated so CI red on the first push is not a surprise.*
- **`bridge/canonical/` (source 6): consulted — no coverage.** Control: `ready-to-buy` hits 6 files; `system-alerts|acknowledged_by|alerts.jsonl` hits 0. The alert system is May-2026, post-governance; **the provenance is the two introducing commits quoted in the scope §1, and that is complete.**

### A8 · What the reads DID NOT find (asserted absences, each with its control)
- **No existing identity validation anywhere** on the write path — control: `RESOLUTION_EVIDENCE_SENTINELS` hits 4 sites with the same grep.
- **No deleter of rows** — control: `writeAllAlertsAtomic` hits.
- **No other reader of `readAllAlerts` that transforms identity** — the 8 call sites (`:383,:414,:440,:481,:519,:609,:646-647,:669,:681`) all read for state, none for identity.

---

## PART B — THE PLAN (every item names the finding it falls out of)

| # | item | falls out of | verification |
|---|---|---|---|
| **P1** | `ALERT_ACTORS` table in `server/services/system-alerts.ts`: `{ value, tag: 'roster'\|'machine'\|'human', why }` — roster `cc-a cc-b cc-c cc-infra`; machine `governance-checker` (A3 #2), `governance-checker-heartbeat` (A3 #3), `b-new-40-soak-verify` (A3 note, after P6); human `langston` (A3 #7), `kyle` (A3 #6 default). **No `dispatcher`, no `system`** (A3 #1: the dispatcher never writes an identity; A7: 0 acks). | A2, A3, scope OBJ-1 | unit test: roster-tagged values == active roster aliases lower-cased, **both directions**; every machine value's cited caller grep-hits at the ref |
| **P2** | `ALERT_ACTOR_NORMALISATION` — a data table applied before membership, storing the canonical: the Langston variants → `langston`; `cc-analyst`,`cc-c-analyst`,`CC-C` → `cc-c`; `infra-claude` → `cc-infra`; `CC-A`,`cc-a-old-claude` → `cc-a`; case/whitespace. **Refused, never mapped:** `cc-session-<date>`, `cc-<date>-govflood`, `cc-<alias>-<date>`, `phase4-*`, `b-new-43-*`, `test`. | A4 multiset, A7 tests, scope OBJ-1b | the test iterates the table; each refused pattern has a case |
| **P3** | `assertAlertActor(by): CanonicalActor` — throws a typed `AlertActorError` naming the set; **called in `ackAlert` and `resolveAlert` BEFORE `ensureFileExists()`/`withLock`**, mirroring `:471-477`; the canonical value is what gets written at `:446`, `:487`, `:492`. | A1 (two writers, evidence-gate placement) | unit: `cc-b` ok; `cc-analyst` → stored `cc-c`; `cc-session-2026-09-02` refused; **mutation A: remove the call ⇒ test fails; mutation B: move it inside `withLock` ⇒ a lock-not-acquired-on-refusal test fails** |
| **P4** | `routes.ts` ack handler: catch `AlertActorError` → **400 `{ error, accepted: [...] }`**; any other error still 500. `GET /api/system-alerts` adds `actors: ALERT_ACTORS.map(({value,tag}) => …)`. | A3 #5, scope OBJ-2b | route test: refused body → 400 with the set; a thrown non-actor error → 500 |
| **P5** | UI: `actorOverride` becomes a `<select>` populated from `data.actors`, default `kyle`; **add the mutation's error surface** (`isError` → the 400's `error` + `accepted` list rendered by the button); no free-text path remains. | A3 #6, **A6** | grep: no `<input` bound to `actorOverride`; **§9.3 in Claude-in-Chrome: the select renders the served set, an ack lands canonical, and a forced 400 (dev-tools body edit) shows the list** |
| **P6** | `scripts/b-new-40-soak-verify.ts:126` → fixed `b-new-40-soak-verify`, PID into the log line. | A3 note, scope OBJ-3 | grep: no caller builds `by` from a PID or date |
| **P7** | Test fixtures: `dedup.test.ts:54,:64` `'test'` → `'cc-b'`; the `'CC-A'` fixtures stay (they exercise P2's case mapping and should be asserted as stored `cc-a`). | A7 | CI green with the identity assertions added |
| **P8** | The three in-code teachers of the retired form (`routes.ts:6698`, `system-alerts.ts:185`, `scripts/system-alerts.ts:24`) + the CLI usage text at `:271,:286` + the dispatcher body `:172` `--by <you>` → all print/quote the canonical set. | scope OBJ-4 (Langston FINDING-1) | **class-empty grep** `git grep -n "cc-session-" origin/… -- server scripts client` returns only tests + P2's refused-pattern list; control: the same grep finds `RESOLUTION_EVIDENCE_SENTINELS` |
| **P9** | Governance: `CLAUDE.md` §10.5 step 3 + `ALERT_HANDLING_PROTOCOL.md:28-36` name the canonical set and say `resolved_by_transport` is the only verifiable field; `CLAUDE_MD_RULE_HISTORY.md` same commit; **SIM gains the identity fields + the API/UI writer (A5 gap)**; **Langston's own instructions (his `CLAUDE.md`/alert handling) told the canonical value `langston`** — A3 #7 is a producer nothing in the repo constrains. | A5, A3 #7, scope OBJ-4 | both docs quote the exported set; SIM entry present; Langston confirms his side at Step 4 |
| **P10** | OBJ-5 conservation: in the **deploy command**, capture `sha256sum` + the `acknowledged_by` multiset; after OBJ-6's N acks: row count identical, exactly N rows' ack fields changed, multiset otherwise unchanged. **Read-path mutation test:** a guard placed on `readAllAlerts` fails a test that round-trips a historical `cc-session-2026-06-19` row through read → `writeAllAlertsAtomic` unchanged. | A1 (`:291`, `:320`), A4 (sha moves daily), scope OBJ-5 | the two sha256s and multisets in the completion report; the mutation test in CI |
| **P11** | OBJ-6 live: `--by cc-analyst` → stored `cc-c`; `--by infra-claude` → stored `cc-infra`; `--by cc-session-2026-09-02` → refused with the set; API body → 400; UI select → canonical; **Langston acks once as `Langston (reviewer)` from his box and it lands `langston`** (A3 #7 exercised, not assumed). | A3, A4 | alert ids in the completion report |

**`UNAUDITED`: none.** Every plan item back-references a finding above.

## PART C — BLAST RADIUS AND WHAT COULD GO WRONG
- **A refused ack that used to succeed** — the incumbents (`cc-analyst`, `infra-claude`, `CC-A`, all Langston spellings) are mapped (P2). **The remaining refused population is exactly the strings that identify nobody.** The checker's two fixed names are in the set (P1). **The watchdog is untouched** (A3 #4 writes `null`, never acks).
- **Deploy restarts live trading** (rule: a deploy is not neutral) — this batch has **no in-process state**; the alert file is on disk. The dispatcher timer is independent of the app process.
- **The `/opt/governance-checker` clone** runs the *deploy tree's* CLI (`cd ${STAGING_REPO}`), so it picks up the server gate at deploy without its own fetch — **stated because that clone's fetch is currently failing (`65c1acaa`) and one could otherwise assume it needed updating.**

## PART D — REVIEWER LOOP RECORD (§2 skill; fresh reader, Mode B mandatory for the absence and mechanism claims)
`REVIEWER r1: claim-only · "no path deletes rows; the dispatcher never writes an identity; exactly one mutator of a populated acknowledged_by" · <verdict pending> · re-derived <y/n>`

## PART E — PLAIN LANGUAGE
The audit found what the scope expected — two functions write the owner name and neither looks at it — plus two things it didn't: **the web page can't show a refusal at all** (it only handles success), and there's a **seventh way names get in** that no code constrains: Langston typing them over SSH, which is where five of his six spellings come from. The plan adds one fixed list with a translation table for the names people actually use, refuses everything else *before* the file is locked, turns the page's text box into a dropdown *with* an error display, fixes the tool's own help text, and proves history wasn't rewritten by comparing the file before and after rather than by a check that can't fail.
