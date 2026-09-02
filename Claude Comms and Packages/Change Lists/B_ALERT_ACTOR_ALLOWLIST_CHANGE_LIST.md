# B-ALERT-ACTOR-ALLOWLIST (#987) — STEP 4 CHANGE LIST (r3 — Langston Step-4 APPROVED 2026-09-02 20:58Z at the pinned compare `0dc49be06..448084d13`, four conditions; his condition 2 applied to §2.3: the L1 claim is *zero on the refusal branches*, and the category site is uniformity, not a class member)

**REVIEW OBJECT: `git diff 0dc49be06..448084d1333f3c6952d97538e3625a4695b2d964` on `origin/migration/aws-supabase`** — two code commits: `dbcca4a9f` (Step 3, 14 files, +424 / −151) and `448084d13` (Step-3 r2: the evidence-gate message stops echoing the alert id; +1 test). The commits between are governance only (the alert placement `d0679649b`, this change list `4c9c4a14e`).
**Scope:** `B_ALERT_ACTOR_ALLOWLIST_SCOPE.md` r4 (Step 1 approved at `8c93a2fa3`; OBJ-7 approved at Step 2). **Plan:** `B_ALERT_ACTOR_ALLOWLIST_PRE_AUDIT.md` r4, Part B P1–P12 (Step 2 approved 2026-09-02 20:23Z with conditions L1–L6, answered in §3 below).
**change-class: `non_architecture`** (unchanged — nothing under `shared/`, no runtime decision path changed; one library gate added at two write sites).

## 1 · WHAT THE DIFF DOES, in one paragraph
`acknowledged_by` / `resolved_by_claimed` were free text (782 rows, 75 distinct strings). One table, `ALERT_ACTORS`, now defines the nine identities that may act on an alert, tagged `roster | machine | human`; an exact-string alias table maps the seven spellings the history actually used (plus `kyle-direct`) to their canonical value; `assertAlertActor()` runs in `ackAlert` and `resolveAlert` **before `ensureFileExists()`/`withLock`**, and the canonical value is what is written. The route turns the typed refusal into a 400 naming the set and serves the set on GET; the page's free-text box is a `<select>` over that set with an error surface; the CLI's `ack` gains the catch `resolve` had; the soak verifier's default identity is fixed. Three test lines change and a 12-test file is added. The three in-code teachers of the retired `cc-session-<date>` form and the three documents that taught it are rewritten. OBJ-7: the deleted Langston alert handler's surviving source and re-deployer are removed and logged. **Historical rows are untouched (OBJ-5) — proven by a test, and measured at deploy (P10).**

## 2 · THE LOAD-BEARING HUNKS (all at `dbcca4a9f`)

### 2.1 `server/services/system-alerts.ts` — the table, the alias table, the gate (NEW, `:186-272`; `assertAlertActor` at `:268`)
```ts
export const ALERT_ACTORS = [
  { value: 'cc-a',     tag: 'roster', why: 'Claude Old (OLD Claude) — roster-bound session' },
  { value: 'cc-b',     tag: 'roster', why: 'Claude New (NEW Claude) — roster-bound session' },
  { value: 'cc-c',     tag: 'roster', why: 'Claude Analyst (ANALYST Claude) — roster-bound session' },
  { value: 'cc-infra', tag: 'roster', why: 'Infra Claude — roster-bound session' },
  { value: 'governance-checker',           tag: 'machine', why: 'scripts/governance-checker/poller.mjs (30-min timer): add + auto-resolve' },
  { value: 'governance-checker-heartbeat', tag: 'machine', why: 'scripts/governance-checker/heartbeat-check.mjs (15-min timer)' },
  { value: 'b-new-40-soak-verify',         tag: 'machine', why: 'scripts/b-new-40-soak-verify.ts — acks the soak alert it verifies' },
  { value: 'kyle',     tag: 'human', why: 'the decider; the alerts-page default' },
  { value: 'langston', tag: 'human', why: 'the reviewer, acting through the CLI over SSH from Helsinki' },
] as const satisfies readonly AlertActor[];
export type CanonicalAlertActor = typeof ALERT_ACTORS[number]['value'];

export const ALERT_ACTOR_NORMALISATION: Readonly<Record<string, CanonicalAlertActor>> = {
  'cc-a-old-claude':     'cc-a',
  'cc-analyst':          'cc-c',
  'cc-c-analyst':        'cc-c',
  'infra-claude':        'cc-infra',
  'langston (reviewer)': 'langston',
  'langston-reviewer':   'langston',
  'kyle-direct':         'kyle',   // the dt-deploy convention (scripts/dt-deploy.sh)
};

export class AlertActorError extends Error {
  readonly refusedLength: number;
  constructor(refusedLength: number) {
    super(`alert actor refused (${refusedLength} chars, not echoed); allowed: [${ALERT_ACTORS.map((a) => a.value).join(' | ')}]`);
    this.name = 'AlertActorError'; this.refusedLength = refusedLength;
  }
}
export function normaliseAlertActor(by: unknown): CanonicalAlertActor | null {
  if (typeof by !== 'string') return null;
  const key = by.trim().toLowerCase();
  if (ALERT_ACTOR_VALUES.has(key)) return key as CanonicalAlertActor;
  return ALERT_ACTOR_NORMALISATION[key] ?? null;
}
export function assertAlertActor(by: unknown): CanonicalAlertActor {
  const canonical = normaliseAlertActor(by);
  if (canonical) return canonical;
  throw new AlertActorError(typeof by === 'string' ? by.length : 0);
}
```
**Exact-string, not prefix (L3):** `'langston (transport: langston ssh key via deploy@staging)'` lowercases to a key that is in neither table ⇒ `null` ⇒ refused. Test: `system-alerts-actor-allowlist.test.ts` "REFUSES the retired and one-off forms".

### 2.2 the two write paths (MODIFIED)
BEFORE (`ackAlert`, old `:436-446`):
```ts
export async function ackAlert(id: string, by: string): Promise<SystemAlert | null> {
  ensureFileExists();
  …
      found.acknowledged_by = by;
```
AFTER (`:533-552`):
```ts
export async function ackAlert(id: string, by: string): Promise<SystemAlert | null> {
  const actor = assertAlertActor(by); // #987: before ensureFileExists/withLock, like the evidence gate
  ensureFileExists();
  …
      found.acknowledged_by = actor;
```
BEFORE (`resolveAlert`, old `:466-493`):
```ts
  if (!isValidResolutionEvidence(evidence)) {
    throw new Error(`… Got: ${JSON.stringify(evidence)}`);
  }
  ensureFileExists();
  …
    found.resolved_by_claimed = by;
    …
    if (!found.acknowledged_at) { found.acknowledged_at = now; found.acknowledged_by = by; }
```
AFTER (`:559-616`; the two gates at `:562-584`):
```ts
  const actor = assertAlertActor(by);                       // identity first, before any file or lock
  const evidenceLength = typeof evidence === 'string' ? evidence.length : 0;
  if (!isValidResolutionEvidence(evidence)) {
    throw new Error(`… Got ${evidenceLength} chars (not echoed).`);
  }
  ensureFileExists();
  …
    found.resolved_by_claimed = actor;
    …
    if (!found.acknowledged_at) { found.acknowledged_at = now; found.acknowledged_by = actor; }
```
**Order chosen: actor gate BEFORE the evidence gate** — so a refused identity is refused regardless of evidence, and both gates sit before `ensureFileExists()` (a refusal creates no file — tested).

### 2.3 L1 — the class fix (MODIFIED, two sites)
`assertCategoryCreatable` old `:96` `category ${JSON.stringify(c)} is not creatable` → `category (${c.length} chars, not echoed) is not creatable`. The evidence gate as in 2.2. **Class grep** (`git grep -n -E 'throw new Error|new Error\(' <ref> -- server/services/system-alerts.ts scripts/system-alerts.ts`): three throw sites — pre-change `0dc49be06` `:95` (category), `:255` (lock, interpolates constants only), `:472` (evidence); at `dbcca4a9f` the same three sit at `:103`, `:351`, `:577`. **Counted per INTERPOLATION, not per message, the parent had THREE (category `c`, the evidence, and the alert `id` inside `resolveAlert(${id}):`) — `dbcca4a9f` fixed two and I called the class empty. A claim-only reader (§7) found the third: on the CLI path `id` is whatever the operator typed (`scripts/system-alerts.ts:303` checks only that it exists and does not start with `--`), so `resolve already --by cc-b --evidence x` would have produced a message the poller regex swallows. The poller's own ids are hex-constrained (`poller.mjs:383`), so it could not trigger it itself. Fixed at `448084d13`: the message is `resolveAlert: resolution_evidence rejected …`, and a test feeds an adversarial id AND adversarial evidence with a valid actor and asserts the message carries neither and does not match the regex. **The precise claim (Langston condition 2): at `448084d13` the REFUSAL branches echo no caller value — the three throw sites in the service (`:104` category, `:272` actor, `:578` evidence) interpolate none.** It is NOT "zero echoes in the CLI": `scripts/system-alerts.ts:321` still prints `Alert ${id} not found`, a caller-typed echo on the branch the poller is *meant* to classify as benign — correct as it stands, and stated so the word "zero" is not read wider than it holds. **And the category sanitisation (`:104`) is uniformity, not a class fix — dropped from the L1 tally:** both swallowers (`poller.mjs` `alertSink.add` and the heartbeat's `addAlert`) call `runCli` with no try/catch, so an `add` refusal has never been swallowed by anything; the change costs an operator the typo they made and buys no risk reduction. Kept for one shape. **L1 tally: two class members (evidence, id), both fixed.** The CLI has no `throw new Error` sites (it `console.error` + `exit`s). **Not swept:** `console.error` lines in the CLI that print caller-typed values on other paths (e.g. `Alert ${id} not found`) — those are stdout/stderr of a *successful* refusal path the poller already handles by its own regex, and `id` is never an identity. Stated so you can disagree.

### 2.4 `server/routes.ts` (MODIFIED, `:6762-6804`)
```ts
      let updated;
      try {
        updated = await ackAlert(id, by);
      } catch (err) {
        if (err instanceof AlertActorError) {
          res.status(400).json({ ok: false, error: 'Unrecognised actor', message: err.message, actors: ALERT_ACTORS.map((a) => a.value) });
          return;
        }
        throw err;
      }
```
GET `/api/system-alerts` adds `actors: ALERT_ACTORS.map(({ value, tag }) => ({ value, tag }))`. **`instanceof` across the dynamic `import('./services/system-alerts.js')`** resolves to the same module instance as the one `ackAlert` threw from (same specifier, same loader cache) — the unit tests exercise `rejects.toBeInstanceOf(AlertActorError)` through the same dynamic-import pattern.

### 2.5 `client/src/pages/system-alerts.tsx` (MODIFIED)
`<input value={actorOverride}>` → `<select value={actor}>` over `data.actors` (fallback single `kyle` option if the array is empty — e.g. an old server); `ackMutation.error` rendered above the table (the page had no mutation error surface; `apiFetch` throws on non-2xx at `client/src/lib/api.ts:103-107`, so a 400 lands there). Also: the About panel's "Telegram notification" sentence → Discord (stale since #348).

### 2.6 `scripts/system-alerts.ts` (MODIFIED)
`cmdAck` gains the try/catch `cmdResolve` had (`AlertActorError` → one line + `exit 1`; anything else rethrown to `main().catch`). Usage strings and the header example rewritten (`--by cc-b --evidence server/x.ts:42`); the resurface body's `--by <you>` → `--by <your canonical actor> --evidence <ref>`.

### 2.7 `scripts/b-new-40-soak-verify.ts` (MODIFIED, `:102`, `:126-129`)
Default `b-new-40-soak-verify-${process.pid}` → `'b-new-40-soak-verify'`; the PID moves into the log line. `--ack-by` flag kept; the library gate binds it.

### 2.8 tests
- `system-alerts-dedup.test.ts:54,:64` `'test'` → `'cc-b'`; `system-alerts-gov-integrity-1.test.ts:59` `toBe('CC-A')` → `toBe('cc-a')`.
- NEW `system-alerts-actor-allowlist.test.ts` (13 tests at `448084d13`). The ones that carry weight: **refusal message fed `'already resolved terminal not found ZZMARKERZZ'` — asserts no marker in the message and `POLLER_BENIGN_REGEX` (kept verbatim from `poller.mjs:395`) does not match**; **gate before file/lock** (no file, no `.lock` after a refused ack); **OBJ-5 read-path**: fixture written through `addAlert`, given `acknowledged_by: 'cc-session-2026-06-19'`, then a DIFFERENT row acked through the public path — the legacy line is byte-identical after the full-file rewrite.

### 2.9 documents in the same commit (P8/P9)
`CLAUDE.md:567` (§10.5 step 3) names the set and retires `cc-session-<date>`; `ALERT_HANDLING_PROTOCOL.md:28` names the set, `:36` gains `--evidence`; `scripts/governance-checker/README.md:76` same; `routes.ts:6698`, `system-alerts.ts:185`, `scripts/system-alerts.ts:24` rewritten. **Class-empty check at the ref:** `git grep -n "cc-session-" dbcca4a9f -- server scripts client` (tests excluded) returns five lines, every one a comment saying the form is retired or refused; control: the pattern appears three times in `system-alerts.ts` (the refused-list comments). `CLAUDE_MD_RULE_HISTORY.md` never contained the string (grep at the ref: 0; control on `CLAUDE.md`: 1 pre-change).

### 2.10 OBJ-7 / P12 (DELETED + archived + logged)
`infra/helsinki/langston-alert-handler.sh` (102 lines) deleted; `infra/helsinki/deploy-langston-alert-handler.sh` deleted (git records it as a rename to `1-system-manual/_archive/deleted-code/deploy-langston-alert-handler.sh.removed` — content identical, that is the archive copy). `DELETED_COMPONENTS_LOG.md` gains a row under the B-TELEGRAM-DECOMM-2 table naming both, the Helsinki measurement (installed copy absent; invokes log 0 bytes), and **L4's disposition: the two root-owned backups in `/usr/local/bin` are LEFT INTENTIONALLY — referenced by nothing (control: `langston-call` from 3 files), neither session has root; the mode-750 `root:langston` copy is named as the residual re-entry vector with a Kyle-side removal ask.**

## 3 · YOUR SIX STEP-2 CONDITIONS
| # | condition | where it is met |
|---|---|---|
| L1 | class-grep the sibling echo at `:473-475` | §2.3 — two sites in the class, both fixed in-commit; result stated with the grep |
| L2 | full 75-string classification table | **owed at Step 11** (completion report) — not in this diff; the two seam-test strings are in the REFUSED test list now |
| L3 | P2 exact-string, the 60-char string refused | §2.1 + the test; `normaliseAlertActor` is set-membership then exact-key lookup, no prefix logic exists to disagree with |
| L4 | disposition the two Helsinki backups | §2.10 — left intentionally, named as the re-entry vector, removal a root-side ask |
| L5 | UTC stamps | pre-audit/scope fixed at `0dc49be06`; this commit's log row stamps `2026-09-02 ~21:00 UTC` |
| L6 | `server/tests/unit/` path | fixed at `0dc49be06` |

## 4 · JUDGEMENT CALLS TO ATTACK
1. **Actor gate before the evidence gate in `resolveAlert`** (§2.2). The alternative — evidence first — changes which error a doubly-bad call reports. I chose identity first because an unrecognised actor should never learn whether its evidence would have passed.
2. **`kyle-direct` → `kyle` is a MAPPING, not a member.** The deploy convention stays what it is; the alert file stores `kyle`. If you think the deploy name should be its own actor, say so.
3. **`--ack-by` on the soak verifier stays** (gate-bound) rather than deleted. Deleting it removes a free-text path at the cost of a caller that may legitimately name another canonical actor. I kept it; P6's verification is the gate's test, not this script's.
4. **The refusal message states LENGTH, not a sanitised echo.** A sanitised echo (`[a-z0-9-]` only) would still carry `resolved`. Length is the least information that still lets an operator tell a typo from an empty string.
5. **The UI falls back to a single `kyle` option when `actors` is absent** — a deliberately safe degrade for an old server, not a second source of truth. Attack if you read it as one.
6. **Nothing in this diff touches the poller's benign regex** (`poller.mjs:394-395`) — cross-referenced on #447/#647, not this batch. The message-shape constraint is the batch's whole answer to it.

## 5 · VERIFIED IN THE CLONE, before push
vitest: the four `system-alerts-*` test files, **37/37 at `448084d13`** (actor-allowlist 13 · gov-integrity-1 9 · dedup 5 · resurface 10). tsc baseline gate: **first run flagged one regression I introduced** (`.length` read inside the evidence gate's false branch, where the type guard narrows `evidence` to `never`) — fixed by taking the length before the guard; **re-run: 377 errors = baseline 377, OK.** CI on `dbcca4a9f`: reported at Step 5.

## 6 · NOT IN THIS DIFF, on purpose
Historical rows (OBJ-5); the dispatcher; the watchdog's lock-free append (#647); the backfill script (OBJ-5(d)); the poller's regex (#447/#647); the SIM/System Manual (Step 10); the P10 conservation measurement and P11 live checks (Steps 6–7, taken in the deploy command).

## 7 · REVIEWER LOOP RECORD (this change list)
`REVIEWER r1: claim-only · "the L1 class is empty at dbcca4a9f; every remaining cc-session- in server/scripts/client is a retired/refused mention" · HIT ×1 on claim 1 (the ${id} interpolation at :578 — re-derived at the ref, fixed at 448084d13 with a test) · claim 2: 12 hits enumerated unbounded, all retirement notes, roster-filename matches or refusal fixtures; widened to the tree minus the governance/memory dirs adds only CLAUDE.md:567 (the retirement note itself); population limit stated — RUNNING_ISSUES and the batch's own scope/pre-audit hold 40+ hits that are frozen records, not teachers` 
⛔ The clean on claim 2 is not cited as evidence anywhere above; §2.9 rests on the grep and its control.

## 8 · LANGSTON STEP-4 RULING (2026-09-02 20:58Z — read at the pinned compare, whole-tree greps at `c15bd4a2`/`393800a3`; nothing on report)
**APPROVED, four conditions:** (1) Step 5 needs a COMPLETED run, 4/4 per job, at a ref whose tree holds `448084d13`'s — a cancelled run is not green; (2) this r3 wording (done above); (3) L2 at Step 11; (4) two §13 homes written before close — **`B-DEPLOY-ACTOR-ALLOWLIST`** (owner CC-B, placed immediately after this batch: `dt-deploy.sh:81` validates `--by` by SHAPE only, `^[A-Za-z0-9_-]{2,24}$`, so `cc-session-2026-09-02` passes — the same free-text-identity defect one system over, on `deployed_by_claimed`, #656) and **twin-site classifier drift** (`heartbeat-check.mjs` narrowed its benign test to `/Alert \S+ not found/`; `poller.mjs:394` still `/not found|already|terminal|resolved/i` — folded into the #647 watchdog batch as a named item, owner CC-B). He re-derived: both live machine writers are members; OBJ-7 is a clean rule-18 delete (nothing calls the handler at the ref); all six judgement calls stand.

## 9 · STEPS 5-7 EVIDENCE (for Langston's Step-8 re-derivation — every number names its object, population and command)
**Step 5 — CI.** Run `33682325747` at `fa563982c8e8db08b40f509b97326ec34ac76b57`: TypeScript Check (baseline gate) success · Test Suite success · Build success · Docker Build success (per-job `gh run view 33682325747 --json jobs`). `448084d13` is an ancestor of `fa563982c` (`git merge-base --is-ancestor`), and the six code files are blob-identical between the two refs (`git rev-parse <ref>:<path>` × 6). The runs on `448084d13`, `4c9c4a14e`, `91c7da63e`, `cf4ec2978`, `393800a37` were all cancelled by concurrency.
**Step 6 — deploy.** `dt-deploy fa563982c8e8db08b40f509b97326ec34ac76b57 --by CC-B` → OK, engine resumed, identity asserted; record `/home/deploy/dawntrader-deploy.record` tail: `sha=fa563982c…`, `deployed_at=2026-09-02T21:05:50Z`, `deployed_by_claimed=CC-B`, `check_failure_window_s=11`. Previous sha `093d1878f` (`deployed_by_claimed=ANALYST-Claude` — the #656 free-text form, in the wild). Compare range `093d1878f..fa563982c` touches runtime files ONLY in this batch's two commits (`git log --name-only -- server client shared scripts drizzle package*`). Startup errors after restart: `unique_global_alert` (1,765 prior lines in `error.log`, pre-existing) and `/home/runner` EACCES (#148 OPEN) — neither new.
**P10 — conservation, taken IN the deploy command.** Pre-capture `2026-09-02T21:05:24Z` (`scripts/batch-verify/b-alert-actor-allowlist/p987_capture.py pre`, object `/var/log/dawntrader/system-alerts.jsonl` whole file): sha256 `76db327a49…`, 784 lines / 784 rows / 0 unparseable / 0 shape-invalid / 784 distinct ids / 0 duplicates; 76 distinct `acknowledged_by` keys (incl. the `None` key), 68 distinct `resolved_by_claimed`. Post-capture `21:09:13Z`: 787 / 787 / 0 / 0 / 787 / 0. **Compare (`p987_compare.py`): pre-capture ids 784, still present 784, MISSING 0; pre-capture ids whose (acknowledged_by, resolved_by_claimed, state) changed: 0; rows added after capture 3 — exactly the three test alerts; `acknowledged_by` multiset deltas: cc-c 24→25, kyle 0→1, langston 179→180 (the three test acks). CONSERVATION: PASS.** Files on staging: `/home/deploy/p987-pre.json`, `/home/deploy/p987-post.json` (deploy-readable).
**Step 7 — OBJ-6 live checks (`p987_verify.sh`, run as deploy at 21:07-21:08Z; test alerts A `9cfc9255…`, B `669893e0…`, C `6e7b27a6…`, category `one_off`/info — no Discord delivery):**
- NEG 1 `ack A --by cc-session-2026-09-02` → ONE line `alert actor refused (21 chars, not echoed); allowed: [cc-a | cc-b | cc-c | cc-infra | governance-checker | governance-checker-heartbeat | b-new-40-soak-verify | kyle | langston]`, exit 1, no `Fatal:`.
- NEG 2 `ack A --by "langston (transport: langston ssh key via deploy@staging)"` → refused (57 chars), exit 1 (L3, exact-string).
- NEG 3 `resolve A --by cc-session-2026-09-02 --evidence NO-EVIDENCE-GIVEN` → the ACTOR refusal printed (identity gated before evidence), exit 1.
- POS 1 `ack A --by cc-analyst` → `acknowledged_by: "cc-c"`. POS 2 `resolve A --by infra-claude --evidence server/services/system-alerts.ts:268` → `resolved_by_claimed: "cc-infra"`, `resolved_by_transport: "cli"`, `acknowledged_by` unchanged `cc-c`. POS 3 repeat resolve `--by governance-checker` → accepted, `resolved_by_claimed: "governance-checker"` (the checker's pattern still works).
- API: `GET /api/system-alerts` (authenticated) → `actors` = the nine `{value,tag}` pairs. `POST …/B/acknowledge {"by":"cc-session-2026-09-02"}` → **HTTP 400** `error: Unrecognised actor`, message = the refusal line, `actors` 9. `POST …/B/acknowledge {"by":"Langston (reviewer)"}` → 200, `state acknowledged`, `acknowledged_by langston`.
- UI (Claude-in-Chrome, `https://188.245.193.8.sslip.io/system-alerts`, no login): the "Ack as" control is a `<select>` with the nine options `value (tag)`, `kyle (human)` selected by default; clicked Ack on row C with `kyle` → row `6e7b27a6` on disk: `state acknowledged`, `acknowledged_by kyle`, `acknowledged_at 21:08:39.874Z`; the row left the active list (4 active → 3, the three real xStock-staleness alerts remain with their Ack buttons untouched). Screenshots taken before/after.
**Warm state:** the restart empties in-memory rolling windows (the AMR EV-gap window among them); nothing in this batch's verification depends on warm state — the alert file is on disk.
**Not exercised by me, for Step 8:** an ack from Langston's own box over SSH as `Langston (reviewer)` landing `langston` (P11's last item) — his to run.

## 10 · LANGSTON STEP-8 RULING (2026-09-02 21:16Z) — **CONFIRMED, Review = Approved**, two findings folded
**Re-derived by him, not accepted:** branch head `316fea202`; staging `HEAD` = the deploy record's `fa563982c`; CI run `33682325747` `head_sha` exactly that sha, 4/4 `success` (Step-4 condition 1 met); conservation re-run from the committed scripts at the ref — 784 pre ids, 784 present, 0 missing, 0 identity changes, +3, integrity 0/0/0. **P11 from his box, his key:** `resolve 669893e0 --by "Langston (reviewer)"` → row read back FROM THE FILE `resolved_by_claimed=langston`, `transport=cli`, `evidence=316fea202`. His negatives: `cc-session-2026-09-02` (21 ch), the L3 canonical-plus-appended form (57 ch), near-miss `langston-reviewers` (18 ch) — all one line, exit 1, no `Fatal`, no echo; trim+case positive `"  LANGSTON  "` passes.
**FINDING-1 (folded before Step 10):** `p987_compare.py` read the FROZEN `p987-post.json` (21:09:13Z), so a re-run after his write compared two static snapshots and printed PASS while blind to it; and `669893e0` was minted AFTER the pre-capture, so passing it as an allowed id was a no-op by construction. **Fixed:** the script now RE-CAPTURES the live file by default (`--post` selects a stored snapshot), and prints a NOTE for any allowed id that is not in the pre set. He re-captured (`p987-langston-p11.json`) and diffed pre→fresh himself; the measured result is unaffected.
**FINDING-2 (his, on the record) — AMENDS §9 above:** he ran `--by langston-reviewer` as a negative control without reading the alias table; it is an explicit alias, so it was ACCEPTED and resolved `6e7b27a6`; the trim/case probe re-resolved `9cfc9255`. ⇒ **all three test rows now carry `resolved_by_claimed=langston`, evidence `316fea202`; `9cfc9255`'s POS-3 value `governance-checker` is overwritten in the LIVE row (preserved in both captures).** §9's POS-3 line describes the state at 21:07Z, not now.
⛔ **Not to be laundered from P11:** it does not prove attributability. `669893e0` already carried `acknowledged_by: langston` — written by ME through the API as `"Langston (reviewer)"`. The field is `resolved_by_claimed` (#447); `transport=cli` records the channel, not the key-holder. **This batch canonicalises the vocabulary; it does not authenticate the speaker.**
