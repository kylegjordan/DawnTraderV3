# B-DEPLOY-ACTOR-ALLOWLIST — CHANGE LIST (Step 4, r1)

**READY AT:** `origin/migration/aws-supabase` · **implementation commit `b054b8e62`**, verified contained in branch head `5e44e3cf5` (`git merge-base --is-ancestor` returned 0).
**Owner:** CC-B · **Issue:** `#656` residual, plus **`#1000` opened and fixed here** · **Plan row:** `PHASE_19_PLAN.md:498` (`2.4a`) · **change-class:** `non_architecture`
**Audit + plan:** `B_DEPLOY_ACTOR_ALLOWLIST_PRE_AUDIT.md` **r5** — you approved r4 with one condition (the locator), applied here.
**Untracked check:** `git status --porcelain | grep '^??'` returns only `.claude/launch.json`, the known untracked local config. **No untracked file is part of this change set.**

**5 files, +316 / −17.**

---

## MODIFIED — `scripts/dt-deploy.sh` (P1, P2, P3)

### 1. The gate itself (P1) — was CHARSET-ONLY, is now a TOTAL canonical lookup

**BEFORE** (`:80-81` at the parent commit):
```bash
[ -n "$BY" ] || fail "no --by given. Every deploy names its session — …"
echo "$BY" | grep -qE '^[A-Za-z0-9_-]{2,24}$' || fail "'--by $BY' must be 2-24 chars of [A-Za-z0-9_-] (e.g. CC-B, kyle-direct)."
```

**AFTER** (`:117-137` at the ref — comment block above it omitted here, it is ~25 lines):
```bash
declare -A DEPLOY_ACTORS=(
  # the SIX deploy-set canonical values, mapping to themselves
  [cc-a]=cc-a  [cc-b]=cc-b  [cc-c]=cc-c  [cc-infra]=cc-infra
  [kyle]=kyle  [langston]=langston
  # the SEVEN aliases — every target is inside the six; none collides with a
  # canonical value; none points at a machine actor. Union 6+7=13.
  [cc-a-old-claude]=cc-a
  [cc-analyst]=cc-c
  [cc-c-analyst]=cc-c
  [infra-claude]=cc-infra
  ["langston (reviewer)"]=langston
  [langston-reviewer]=langston
  [kyle-direct]=kyle
)
DEPLOY_ACTOR_LIST="cc-a | cc-b | cc-c | cc-infra | kyle | langston"

[ -n "$BY" ] || fail "no --by given. …"
BY_KEY=$(printf '%s' "$BY" | tr '[:upper:]' '[:lower:]' | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')
BY_CANON="${DEPLOY_ACTORS[$BY_KEY]:-}"
[ -n "$BY_CANON" ] || fail "--by refused (${#BY} chars, not echoed). Accepted: $DEPLOY_ACTOR_LIST."
BY="$BY_CANON"
```

**Totality, as you conditioned it:** no pass-through arm. The only exits are a table hit or `fail`. `BY` is reassigned to the canonical value **before** `:113`'s lock-holder write and `:210`'s record write, so neither can receive raw input.

### 2. The four refusal sites (P2) — none echoes the raw value

| line | before | after |
|---|---|---|
| `:55` | `--by value '$2' looks like a flag` | `--by value looks like a flag (${#2} chars, not echoed…)` |
| `:56` | `duplicate --by ('$BY' then '$2')` | `duplicate --by (${#BY} then ${#2} chars, neither echoed)` |
| `:62`→new arm | fell to catch-all, echoed the whole token | **new `--by=*\|--pre-restart=*` arm**, below |
| `:81`→gate | `'--by $BY' must be 2-24 chars…` | `--by refused (${#BY} chars, not echoed). Accepted: …` |

**The `:62` fix is a CAUSE fix, not an echo fix, and this is judgement call J1 below:**
```bash
    --by=*|--pre-restart=*)
                   echo "dt-deploy: REFUSED — ${1%%=*} takes a SPACE-separated value, not '='. $USAGE" >&2; exit 1 ;;
    *)             echo "dt-deploy: REFUSED — unrecognised argument (${#1} chars, not echoed). $USAGE" >&2; exit 1 ;;
```
`${1%%=*}` yields the flag NAME only — everything from the first `=` stripped — so the message stays useful while carrying no user value.

### 3. The usage string (P3)

**BEFORE:** `--by <session: CC-A|CC-B|CC-C|kyle-direct|langston>` — could not name `cc-infra`, and advertised an alias as the canonical form.
**AFTER:** `--by <cc-a|cc-b|cc-c|cc-infra|kyle|langston>` — the six, matching `PHASE_19_PLAN.md:498` verbatim.

---

## MODIFIED — `server/services/system-alerts.ts` (P7 = `#1000`, P6)

**BEFORE:**
```ts
export function normaliseAlertActor(by: unknown): CanonicalAlertActor | null {
  if (typeof by !== 'string') return null;
  const key = by.trim().toLowerCase();
  if (ALERT_ACTOR_VALUES.has(key)) return key as CanonicalAlertActor;
  return ALERT_ACTOR_NORMALISATION[key] ?? null;
}
```

**AFTER:**
```ts
  if (ALERT_ACTOR_VALUES.has(key)) return key as CanonicalAlertActor;
  if (!Object.prototype.hasOwnProperty.call(ALERT_ACTOR_NORMALISATION, key)) return null;
  const mapped: unknown = ALERT_ACTOR_NORMALISATION[key];
  if (typeof mapped !== 'string' || !ALERT_ACTOR_VALUES.has(mapped)) return null;
  return mapped as CanonicalAlertActor;
```
**P6:** the bare `782 rows` header comment now carries its measurement date and an instruction to re-measure rather than quote it.

---

## NEW — `server/tests/unit/dt-deploy-actor-parity.test.ts` (P4, P5) — 160 lines, 9 tests

Parses the bash literal out of the real script (repo-root path via the **three-level** `join(__dirname,'..','..','..')` idiom) and asserts:
set equality against `{ALERT_ACTORS where tag !== 'machine'} ∪ {aliases targeting them}` · the **derivation** itself, so a new machine actor cannot silently become a deployer · identical mapping on both sides · **OBJ-4 as a property of the table**, with a positive control that the property discriminates · the usage string · gate-before-lock by string position · and that no refusal interpolates the raw value.
**Fail-closed:** every parse step throws. A missing file, an empty file, a renamed block or a zero-entry parse is RED, never a skip.

## MODIFIED — `server/tests/unit/system-alerts-actor-allowlist.test.ts` — +48, `#1000` regression
Six prototype keys refused, a non-string guard, and a **positive control** that the real actors and aliases still pass — without which the block is satisfied by a function that refuses everything.

## MODIFIED — the audit document, r4 → r5 (your locator condition)
`:497` → `:498` at all five sites, **re-derived before applying** rather than taken on your authority, which is how `:497` got in.

---

## EVIDENCE — everything below was RUN, not reasoned about

| check | result |
|---|---|
| the probe that FOUND `#1000` | `constructor`, `__proto__`, `' CONSTRUCTOR '` all now REFUSED; control `cc-b` → `cc-b` |
| **mutation — put the `#1000` defect back** | **4 tests go RED**, green on restore. Restore hash-verified against baseline. |
| **mutation — drop `cc-infra` from the bash table** | **2 tests go RED.** Restore hash-verified. |
| **mutation — rename the table** | **fail-closed**, three `FAIL-CLOSED` messages, never a skip |
| gate behaviour, against the REAL script | `cc-analyst`, `CC-B`, `kyle-direct`, `langston (reviewer)` pass the gate; `governance-checker` refused *(18 chars, not echoed)*; `cc-session-2026-09-04` refused *(21 chars)* |
| mapping, table read OUT of the real script | `CC-B`→`cc-b` · `  kyle-direct  `→`kyle` · `LANGSTON (REVIEWER)`→`langston` · `@`→refused · **13 keys** |
| bash `@` / `*` / newline-key subscript behaviour | **verified ON STAGING (5.2.21)**, not assumed from the manual: all yield empty under `${A[$k]:-}` |
| tsc baseline | **377 = 377**, no regression |
| unit suite | 4 files failing — **identity-matched** to the same 4 with my changes stashed. Zero test-level failures. *(An earlier full run showed a 5th file and 1 test failure that did not reproduce; recorded as a collect-phase flake rather than dropped.)* |

⚠️ **NOT VERIFIED, and it cannot be from here:** the installed `/usr/local/bin/dt-deploy` still holds the OLD gate. The deploy path installs from the blob at the deployed sha, so **this reaches the box on the first deploy AFTER it lands** — a validator in the tree refuses nothing. Step 6 is the first moment it is live, and Step 7 must re-run the refusal cases **on the box**.

---

## ⛔ FIVE JUDGEMENT CALLS — attack these rather than confirm them

**J1 — I fixed a CAUSE where the plan only asked for an echo. Is that scope creep?** P2 said "do not echo". I added a `--by=*` arm so the equals form is *recognised* instead of merely silenced. It is more than the plan authorised. My reasoning: silencing the catch-all would leave `--by=CC-B` producing *"unrecognised argument (10 chars)"*, which is useless to the person who typed it — a usability regression introduced by a security fix. **If you judge this an unauthorised widening, it comes out and P2's minimal form ships.**

**J2 — the catch-all now reports a LENGTH for a genuinely unknown argument.** For a mistyped flag the useful information is the flag name, and I have removed it. I chose consistency with `AlertActorError` over debuggability. **This is the weakest of the five and I would not defend it hard.**

**J3 — `kyle-direct` now lands in the record as `kyle`.** A real change to a recorded value, for a form this script advertised until today. A-6 shows no reader matches the value against a set, so nothing breaks — but it is a silent change in what history will say, and you may want the alias refused rather than mapped.

**J4 — the table property is asserted on canonical OUTPUTS only, not on alias KEYS.** That is what lets `langston (reviewer)` keep its space and parens. It is correct only because an alias key can never reach the record. **If you can find a path where a KEY reaches the record line, the property is scoped wrong.**

**J5 — `#1000` ships TWO guards where one would close the bug.** `hasOwnProperty.call` alone stops the prototype chain. The `typeof === 'string'` check is not needed for *this* defect. I kept it because it makes the function robust to a future table gaining a surprising key rather than to this one bug. **You may read it as belt-and-braces that hides which guard is load-bearing.**

---

## §9.4 — ONE FINDING SURFACED BY RUNNING IT, NOT FOLDED

`dt-deploy.sh:84` treats **any** non-zero `mkdir` as lock-held. Observed while testing locally, where `/home/deploy` does not exist: the script printed the full lock refusal **including the `#540` tier-3 stale-lock protocol, for a lock that did not exist** — a wrong-cause message that sends a reader hunting a phantom holder. Low severity on staging, where that directory always exists.
**DISPOSITION 2 — added to `P19-B12`**, which already carries `#652` and the installed-copy drift check; recorded as an amendment on `#649` at Step 10. ⛔ **Deliberately NOT folded here: it is `#649`'s lock, explicitly out of scope per the audit's §7, and widening a batch to cover what it tripped over is how scopes rot.**

## ONE GATE
**Approve the diff at `b054b8e62`, or send it back.** Nothing else is being asked in this dispatch.
