# B-MEASURE-GATE leg 2 — PRE-AUDIT (Step 2)

**Owner:** CC-A · 2026-07-30 · scope at `d04bf1978` · change-class `architecture` · home `RUNNING_ISSUES` #623

## 1. MEASURED STATE OF THE HOOK LAYER (read, not recalled)

**OBJECT:** `.claude/hooks/` + `.claude/settings.local.json` in `C:\DawnTraderV3-old`. **POPULATION:** all 5 hook files and all wired events.

| File | Bytes | Wired to |
|---|---|---|
| `guard-governed-read.mjs` | 2,205 | `PreToolUse` / matcher `Bash` |
| `guard-bare-commit.mjs` | 15,435 | `PreToolUse` / matcher `Bash` |
| `fresh-rules.mjs` | 7,951 | `SessionStart` / `startup\|resume\|compact` |
| `session-reminder.mjs` | 1,258 | `SessionStart` / same |
| `load-own-memory.mjs` | 4,565 | `SessionStart` / same |

**Two events wired: `PreToolUse` (2 hooks, chained) and `SessionStart` (3 hooks).**

**The precedent contract, quoted from `guard-governed-read.mjs:8-10` rather than summarised:**
> *"Fail-OPEN by construction: any parse/read problem here exits 0 (allow) so this guard can NEVER break a session — it only ever blocks the one precise dangerous shape. Exit 2 = block; the stderr message is fed back to the model."*

Mechanics confirmed at the source: payload arrives as JSON on **stdin**, command at `tool_input.command` (`:15-16`); **every** failure path is `process.exit(0)` (`:18`); block is `exit 2` with the explanation on stderr (`:27-36`); the trigger is the **conjunction** of two narrow regexes (`:22`, `:24`), not either alone.

**★ FINDING A — hooks are invoked via `$CLAUDE_PROJECT_DIR`, so they are PATH-PORTABLE and take effect in ALL THREE CLONES automatically.** This is not a per-session opt-in. ⇒ **OBJ-0's notification is load-bearing, not courtesy** — confirmed by measurement, which is why it is objective zero.

**★ FINDING B — there is NO `UserPromptSubmit` hook today.** OBJ-1 therefore introduces a **new event surface**, not another entry on an existing one. That is exactly the exposure behind Langston's *"an SSH to Frankfurt on every turn is a new wedge surface."*

## 2. ★ THE ORDERING CHALLENGE — I think OBJ-5 must precede OBJ-1, and Langston ruled the reverse

He ruled §10.5 *"strongest candidate, convert first."* **I am not reordering on my own judgement — I am putting the argument to him**, because two measured facts cut against it:

1. **OBJ-1 is the ONLY hook that runs on EVERY TURN in ALL THREE sessions** (Finding A + Finding B). Its blast radius is every session's every turn; every other objective fires on a specific command shape.
2. **OBJ-1 is fail-open on a NETWORK call — so its failure mode is SILENT BY DESIGN.** A wedged or dead alert-injector looks exactly like "no active alerts," which is **the absent-as-valid class this entire batch exists to kill**, now installed in the enforcement layer itself.

⇒ **His own second non-negotiable — the self-test, because *"a fail-open hook that has silently stopped running is a lookalike failure in the enforcement layer itself"* — applies MOST SHARPLY to OBJ-1, and therefore should EXIST BEFORE IT, not after.** ⇒ **Proposed order: OBJ-4 (lowest-risk, establishes the warn-only pattern) → OBJ-5 (the self-test) → OBJ-1 → OBJ-2 → OBJ-3.** His call; I will build his order if he holds it.

## 3. BLAST RADIUS (§9.5(a) census on the layer being changed)

- **WRITES here:** only CC sessions editing `.claude/`; the `fresh-rules.mjs` hook **re-stages `CLAUDE.md` / `.claude/*` into the index** (known, in `MEMORY_CC_A`) ⇒ **any commit in this batch must verify staged content is mine** (rule 25.c). Done for every commit so far via `--cached` content checks.
- **READS here:** the Claude Code harness, per event, in all three clones.
- **DELETES here:** nothing. No hook is removed in leg 2 (leg 3 territory, and only text-collapse even then).
- **SCHEDULERS/ENTRY POINTS:** `PreToolUse` (per Bash call), `SessionStart` (`startup|resume|compact`), and **newly** `UserPromptSubmit` (per turn) — the third is new and is the risk.
- **SHARED STATE:** `.claude/settings.local.json` is a **single file all three sessions edit** ⇒ claim it on the crew board before editing (§5 rule 25.a) and expect pull-time collisions.

## 4. WHAT I WILL NOT ASSERT

- **I have not verified the harness's `UserPromptSubmit` payload shape or its timeout semantics** — I am reasoning from the documented `PreToolUse` contract and one unread event type. **Before OBJ-1 ships, that gets measured with a no-op hook that logs its payload, not assumed.** (Assuming an adjacent event behaves like the one I have read is the exact error class this batch is about.)
- **I have not proven a warn-only `PreToolUse` hook's stderr reaches me without blocking** — i.e. whether exit 0 + stderr surfaces at all. **If it does not, OBJ-4's whole delivery mechanism is wrong**, and that is measured first, with a control, before the real matchers are written.

### 4.1 ★ ATTEMPTED THAT MEASUREMENT AND IT IS **DEFERRED, NOT ANSWERED** — recorded because the near-miss is the point

A sentinel-gated probe (`.claude/hooks/probe-warn-delivery.mjs`, fires only on the literal `CCA_HOOK_PROBE_9f3`, so it is inert for every other command and session) was wired **LOCALLY and deliberately NOT committed**, then the sentinel was run. **No warning appeared.**

⚠️ **THAT RESULT IS UNINFORMATIVE AND MUST NOT BE READ AS "warn-only delivery does not work."** `CLAUDE.md` rule 22 states the reason outright: *"Hooks load at session start, so a freshly-added hook is live from the NEXT session, not the one that added it."* ⇒ **the instrument could not reach the thing being measured**, so its silence carries no information — **the exact absent-as-valid shape this batch exists to kill, arrived at while building the batch.** Under rule 29(b) the probe was run with only a positive treated as evidence, which is why nothing was concluded.

**DISPOSITION:** the probe **stays wired locally (uncommitted)** so it answers on the next session start. **OBJ-4 does not get finalised until it does** — if warn-only stderr does not surface, OBJ-4's delivery is wrong and the objective is redesigned rather than shipped hopefully.

**★ AND IT GENERALISES TO THE WHOLE LEG: every hook in this batch is unverifiable in the session that writes it.** So "wrote the hook" and "the hook works" are separated by a session boundary for all five objectives, and **any claim of a working hook made in the same session that authored it would be unevidenced by construction.** That is now a stated verification constraint on this batch, not a surprise to be discovered at Step 7.
