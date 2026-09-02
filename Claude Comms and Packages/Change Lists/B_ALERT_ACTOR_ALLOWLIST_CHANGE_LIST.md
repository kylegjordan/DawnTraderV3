# B-ALERT-ACTOR-ALLOWLIST (#987) — STEP 4 CHANGE LIST (r1)

**REVIEW OBJECT: commit `dbcca4a9f1ddecb10e51154a030eb439c928a42b` on `origin/migration/aws-supabase`** — the Step-3 commit, 14 files, +424 / −151. `git diff 0dc49be06..dbcca4a9f` is exactly the batch's code (the commits between are governance: the alert placement `d0679649b` and this file's own commit lands after `dbcca4a9f`).
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
`assertCategoryCreatable` old `:96` `category ${JSON.stringify(c)} is not creatable` → `category (${c.length} chars, not echoed) is not creatable`. The evidence gate as in 2.2. **Class grep** (`git grep -n -E 'throw new Error|new Error\(' <ref> -- server/services/system-alerts.ts scripts/system-alerts.ts`): three throw sites — pre-change `0dc49be06` `:95` (category), `:255` (lock, interpolates constants only), `:472` (evidence); at `dbcca4a9f` the same three sit at `:103`, `:351`, `:577`. Two interpolated caller input; both fixed. The CLI has no `throw new Error` sites (it `console.error` + `exit`s). **Not swept:** `console.error` lines in the CLI that print caller-typed values on other paths (e.g. `Alert ${id} not found`) — those are stdout/stderr of a *successful* refusal path the poller already handles by its own regex, and `id` is never an identity. Stated so you can disagree.

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
- NEW `system-alerts-actor-allowlist.test.ts` (12 tests). The ones that carry weight: **refusal message fed `'already resolved terminal not found ZZMARKERZZ'` — asserts no marker in the message and `POLLER_BENIGN_REGEX` (kept verbatim from `poller.mjs:395`) does not match**; **gate before file/lock** (no file, no `.lock` after a refused ack); **OBJ-5 read-path**: fixture written through `addAlert`, given `acknowledged_by: 'cc-session-2026-06-19'`, then a DIFFERENT row acked through the public path — the legacy line is byte-identical after the full-file rewrite.

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
vitest: the four `system-alerts-*` test files, **36/36** (actor-allowlist 12 · gov-integrity-1 9 · dedup 5 · resurface 10). tsc baseline gate: **first run flagged one regression I introduced** (`.length` read inside the evidence gate's false branch, where the type guard narrows `evidence` to `never`) — fixed by taking the length before the guard; **re-run: 377 errors = baseline 377, OK.** CI on `dbcca4a9f`: reported at Step 5.

## 6 · NOT IN THIS DIFF, on purpose
Historical rows (OBJ-5); the dispatcher; the watchdog's lock-free append (#647); the backfill script (OBJ-5(d)); the poller's regex (#447/#647); the SIM/System Manual (Step 10); the P10 conservation measurement and P11 live checks (Steps 6–7, taken in the deploy command).

## 7 · REVIEWER LOOP RECORD (this change list)
`REVIEWER r1: claim-only · "the class of thrown messages echoing caller input in the library + CLI is exactly two sites; every remaining cc-session- in server/scripts/client is a retired/refused mention" · <pending>`
