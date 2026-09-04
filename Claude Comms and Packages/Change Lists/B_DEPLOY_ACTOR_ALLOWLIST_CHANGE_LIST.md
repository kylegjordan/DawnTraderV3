# B-DEPLOY-ACTOR-ALLOWLIST — CHANGE LIST (Step 4, r2)

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
set equality against `{ALERT_ACTORS where tag !== 'machine'} ∪ {aliases targeting them}` · the **derivation** itself, so a new machine actor cannot silently become a deployer · identical mapping on both sides · **OBJ-4 as a property of the table**, with a positive control that the property discriminates · the usage string · gate-before-lock by string position · and that **no refusal anywhere in the script** interpolates a raw value — **r1 asserted only the four `--by` sites while a fifth stood live at `:59`; corrected under Condition 3 below.**
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

⚠️ **AT DISPATCH THIS WAS UNVERIFIED AND THE MECHANISM I GAVE FOR IT WAS WRONG.** It read: *"the deploy path installs from the blob at the deployed sha, so this reaches the box on the first deploy AFTER it lands."*
⛔⛔ **CORRECTED 2026-09-04 AT STEP 7 — THIS SAID THE OPPOSITE, AND IT WAS FALSE. `dt-deploy` DOES NOT INSTALL ITSELF.**
**MEASURED after deploying `a4bcbe3c1`:** `/usr/local/bin/dt-deploy` was still **DATED AUG 6**, with **0** occurrences of `DEPLOY_ACTORS` and **1** of the old charset regex — while `/home/deploy/dawntrader/scripts/dt-deploy.sh` held the new gate and hashed **identical to the repo blob**. **The deploy updates the CLONE and leaves the INSTALLED COPY untouched.**
⭐ **WHERE THE ERROR CAME FROM, because the shape outlives the instance:** `SYSTEM_IMPACT_MAP.md` `#649` says the installed copy is *"installed … FROM THE GIT BLOB AT THE DEPLOYED SHA"*. **I read a PROVENANCE statement as a MECHANISM statement.** It says where the installed bytes came from; it never said the deploy is what puts them there. **The sentence was true and it was not about what I took it to be about** — `wrong-object`. It survived a scope, an audit, TWO Langston reviews and a change list **because at no point did anyone execute it**, and Langston repeated it back to me in his own Step-7 standing instruction, so my unverified claim propagated into his ruling.
⇒ ✅ **WHAT IS ACTUALLY TRUE: the gate is live only when someone DELIBERATELY INSTALLS it.** Done at Step 7 — old copy backed up to `/root/dt-deploy.pre-b-deploy-actor-allowlist-20260904`, the deployed blob installed with `install -m 755`, and the installed sha256 verified equal to the clone's.
⇒ ⚠️ **AND THE CONSEQUENCE IS BIGGER THAN THIS BATCH: every `dt-deploy` change in this project's history has needed a manual install step that nothing documents and nothing checks.** That is exactly the drift risk `#649` flags and `P19-B12` owns — now **measured** rather than anticipated. Recorded there at Step 10.
✅ **VERIFIED ON THE BOX AFTER THE DELIBERATE INSTALL:** `governance-checker` (18 chars), `cc-session-2026-09-04` (21) and `nobody` (6) all REFUSED, length-only, naming the six · **positive control** — `cc-analyst` ACCEPTED, passing the actor gate and progressing to the sha check · Langston's Step-4 rider `'langston (reviewer)'` ACCEPTED on the box · `'  KYLE-DIRECT  '` ACCEPTED · `--by=cc-b` returns the flag-name-only message · usage names the six · no lock stranded. **`#1000` live in the running app: the alerts CLI refuses `--by constructor` (11 chars, not echoed) and `--by cc-b` passes the gate.**

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

---

# r2 — LANGSTON'S THREE CONDITIONS, APPLIED. All three re-derived at the object before changing anything.

**Step 4 was APPROVED at `b054b8e62` with three conditions before Step 6. These are them.**

### ⛔ CONDITION 1 — guard 2 was CERTIFIED BY A COMMENT AND NEVER EXERCISED. He is right, and it is the sharpest finding of the review.

**RE-DERIVED, and his trace holds exactly:** of my four probes, `constructor` and `__proto__` short-circuit at `hasOwnProperty`, `cc-b` short-circuits at `ALERT_ACTOR_VALUES.has(key)`, and `cc-analyst` **reaches guard 2 and PASSES it**. The assertion `r === null || typeof r === 'string'` is then satisfied by `null`. **Deleting the guard left the test green** — a test carrying the label *"The second, independent guard"* above code that never drove it. `#661` leg 3: a never-invoked path is silent with zero opportunity, however loud its body.

**FIXED by driving the reject path directly.** `Readonly<>` is compile-time only and nothing freezes the table — verified, no `Object.freeze` — so the guard is genuinely reachable:
```ts
const table = mod.ALERT_ACTOR_NORMALISATION as unknown as Record<string, unknown>;
try {
  table['ccb-c1-probe-nonstring'] = 42;     // only guard 2 can catch this
  expect(mod.normaliseAlertActor(KEY)).toBeNull();
  expect(() => mod.assertAlertActor(KEY)).toThrow();
} finally { delete table[KEY]; }
expect(Object.prototype.hasOwnProperty.call(table, KEY)).toBe(false);  // restored
```
⭐ **AND A SECOND TEST FOR THE HALF THE CONDITION DID NOT NAME:** guard 2 has two clauses, and a non-string only exercises one. A string target that is **not a canonical actor** (`'not-a-canonical-actor'`) drives `!ALERT_ACTOR_VALUES.has(mapped)`. Both halves are now covered.

### CONDITION 2 — `DEPLOY_ACTOR_LIST` was a second hand-maintained copy with **0 test references**
Confirmed at the object. `USAGE` was fenced; the **refusal message** was not — so a seventh non-machine actor would have named an incomplete set **to the person being refused**, silently, at the moment they most need it right. Now asserted in the same block.

### CONDITION 3 — a FIFTH echo site at `:59`, two lines from the four I fixed
**`--pre-restart value '$2' looks like a flag`** stood live while my comment at `:137` stated the no-echo principle in general terms and the r1 evidence row claimed it held. **`fix-follows-pointer`: the fix travelled to the four sites Step 2 pointed at and stopped.** `:59` is de-echoed to `(${#2} chars, not echoed)`, the comment now states the scope and why it was wrong, and the parity test is re-scoped to **all five** sites so the prose and the code cannot drift apart again.
*(This also settles J2, which he accepts once resolved: I had removed the flag name from the catch-all **for consistency** while leaving a raw echo two lines above.)*

### MUTATION EVIDENCE — J5 is now MEASURED, not argued, which was the condition's whole point

| mutation | result |
|---|---|
| **delete guard 2 entirely** | **2 tests RED** (both halves) — it is load-bearing |
| **drop `cc-infra` from `DEPLOY_ACTOR_LIST` only**, table untouched | **1 test RED** |
| **restore the `:59` raw echo** | **1 test RED** |
| restores | **both files hash-verified against baseline** |

**Suites: 32 passing** (10 parity + 22 allowlist). **His other rulings — J1 allowed with his own re-derivation that `${1%%=*}` can only yield two fixed literals, J3 verified safe, J4 correctly scoped, and the `mkdir` disposition — need no action.**

**Carried to Step 7, his standing instruction:** the parity test fences the **TREE**. The installed `/usr/local/bin/dt-deploy` is a separate object and this is inert until the first deploy after it lands. **The refusal cases get re-run ON THE BOX, and nobody cites the tree test as evidence the installed copy refuses.**

## ONE GATE
**Approve the diff at `b054b8e62`, or send it back.** Nothing else is being asked in this dispatch.
