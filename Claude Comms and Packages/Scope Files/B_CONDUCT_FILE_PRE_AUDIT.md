# B-CONDUCT-FILE — STEP-2 PRE-AUDIT r1

**Owner:** CC-A · 2026-08-19 · Scope r3 @ `b5d85c85b` (Step-1 APPROVED). Read at `origin/migration/aws-supabase`.

> ⛔⛔ **HEADLINE: THE DELIVERY MECHANISM I PROPOSED WOULD HAVE SHIPPED WITH A SILENT THREE-CLONE GATE, AND §7(a) COULD NOT HAVE SEEN IT.** Langston's Step-1 condition — *"whatever bounds the instrument's reach bounds the conduct file's reach"* — is confirmed, sharper than either of us stated, and it changes the design.

---

## 1. ⛔ THE REACH FINDING — CITED, AND MY EARLIER CLAIM WAS WRONG
**Langston required a citation or a withdrawal (29(c)). Here is the line.**
- ❌ **MY CLAIM: "the instrument only covers the four clones."** **FALSE as a mechanism.** `.claude/settings.local.json` **IS TRACKED AND COMMITTED** — the committed blob carries all nine hook registrations (4 `PreToolUse`, 4 `SessionStart`, 1 `InstructionsLoaded`). **Any repo copy therefore carries them.** No four-clone limit exists at the registration layer.
- ✅ **THE ACTUAL MECHANISM, TWO LAYERS, BOTH CITED:**
  1. **`G:\My Drive\Dawn Trader` IS NOT A REPO COPY** — **no `.git`, no `.claude/`** (it holds `.docx` files; it is the retired working folder). ⇒ **a session with that cwd fires NO SessionStart hooks at all.** *(This is what Langston predicted as the alternative: "then THAT is the mechanism, say it.")*
  2. ⛔⛔ **AND THE ONE NEITHER OF US HAD — `load-own-memory.mjs:22-36` GATES ON A THREE-ENTRY `CLONE_TO_SESSION` MAP** (`DawnTraderV3-old` / `-new` / `-analyst`) **and `:36` reads `if (!session) process.exit(0); // unmapped clone -> inject nothing, never guess`.** ⇒ **even inside a legitimate repo copy — the SPARE clone `C:\DawnTraderV3`, which scheduled tasks use — this loader emits NOTHING, silently, by design.**

## 2. ⇒ THE DESIGN CONSEQUENCE (this is why the pre-audit exists)
⛔ **DO NOT deliver the conduct file by extending `load-own-memory.mjs`.** That loader is correctly gated: per-session memory is *per session*, so an unmapped clone SHOULD get nothing. **Conduct is the opposite — it is SHARED and must load EVERYWHERE.** Extending it would silently inherit the three-clone gate.
✅ **DECISION: a SIBLING hook (`load-conduct.mjs`), registered on the same `SessionStart startup|resume|compact`, with NO clone gate** — it emits the conduct file for **any** repo copy. Fail-open identically (missing file ⇒ emit nothing, exit 0).
⚠️ **RESIDUAL, STATED NOT SOLVED: the Drive folder still gets nothing, because it has no `.claude/` to register a hook in.** The hourly `wake-watcher-heartbeat` demonstrably runs there ⇒ **that class of session will run WITHOUT conduct rules.** **Not fixable inside this batch; it is a cwd problem, not a conduct problem.** *(Adjacent, unclaimed: those tasks arguably should not be running from a retired documents folder at all.)*

## 2.5 ✅ THE GATE-1 DISCHARGE MEASUREMENT — STATED HERE BECAUSE §6 CITED IT AND IT WAS NOT IN THE ARTIFACT
⛔ **r1's §6 said "§2's 49 unprompted events discharge it" — and the string `49` appeared NOWHERE in this document. I also stamped a DO-NOT-RE-LITIGATE lock into two other scopes pointing at that empty citation. A LOCK ON AN ABSENT CITATION IS WORSE THAN A BAD CITATION: it stops the next reader checking.** *(Langston: the #452 shape with a latch on it.)*

**MEASUREMENT, rule-29(a) form:**
- **OBJECT:** `C:\Users\kyleg\.claude\instructions-loaded.jsonl` — the sink written by `instructions-loaded-native.mjs` (the `InstructionsLoaded` hook).
- **POPULATION: 56 unprompted events** = **57** rows with `source=native-InstructionsLoaded`, **MINUS the 1 `session_id=canary` row.**
- **WHY THAT DENOMINATOR:** the canary row was **hand-fed by me** at build time — it evidences that the script writes when piped input, **NOT** that the harness fires it. **Excluding it is the whole point:** GATE 1's requirement is literally *"a first NO-MANUAL-INPUT row."*
- **WINDOW:** `2026-08-07T11:38:12Z` → `2026-08-19T20:49:58Z` (12 days). **DISTINCT SESSIONS: 27.**
★ **AND THE COUNT MOVED WHILE I WAS BEING CORRECTED — 49 → 56 — because sessions kept starting. That is exactly why a bare count with no window is a bad citation, and it argues for citing OBJECT + WINDOW rather than a figure that ages.**
⇒ **GATE 1 (1c) is DISCHARGED: the harness fires the hook unprompted, across 27 sessions over 12 days.** ⚠ **SCOPE OF THE CLAIM: this evidences the hook FIRES. It says NOTHING about the Drive-folder class (§2), which has no `.claude/` to fire anything.**

## 3. §9.5(a) CENSUS — the conduct file's delivery hop
| question | answer |
|---|---|
| who **writes** the conduct file | this batch only; thereafter the one-in-one-out rule |
| who **reads/emits** it | **exactly one** new site: `load-conduct.mjs` (to be built) |
| who **registers** it | `.claude/settings.local.json` `SessionStart` — **committed, so it travels with any repo copy** |
| who **mutates** | none — read-only at load |
| who **DELETES** | none |
| **what gates it** | ⛔ **cwd must be a repo copy with `.claude/`.** No other gate, deliberately (contrast the 3-clone map above) |

## 4. BLAST RADIUS
`CLAUDE.md` (source, shrinks) · a new conduct file · a new hook · one registration line · the skills named in scope §5. **No code path, no schema, no runtime behaviour, no trading surface.** ⚠️ **The one real risk is a MOVED RULE THAT STOPS FIRING** — addressed in §5(e), and it is the failure this batch exists to prevent, not merely avoid.

## 4.5 ✅ SIM / SYSTEM-MANUAL APPLICABILITY — STATED, NOT LEFT TO OMISSION (Langston rider 2, §16 addendum)
- ✅ **`SYSTEM_IMPACT_MAP.md`: APPLICABLE — a new hook is a new estate component.** `load-conduct.mjs` gets an entry: what it loads, its `SessionStart startup|resume|compact` trigger, its **fail-open** contract, and — load-bearing — **that it has NO clone gate, expressly UNLIKE `load-own-memory.mjs`.** ★ **A future reader comparing the two WILL assume they share the gate; the SIM must say they do not.** The entry also records the §2 reach bound (#699).
- ⛔ **`SYSTEM_MANUAL.md`: NOT APPLICABLE, and here is the judgment rather than silence** — its scope is architecture, strategy logic, regime, filters, the signal pipeline and quantitative math. **This batch moves PROSE between two instruction files and adds a loader. No trading behaviour, no math, no pipeline surface is touched.** *(If Step-3 ends up changing what a rule MEANS rather than where it LIVES, this flips — flagged so the judgment is re-made rather than inherited.)*

## 5. VERIFICATION (scope §7, with Langston's Step-1 condition folded)
**(a)** the conduct file demonstrably loads on **startup, resume AND compaction** — observed in the native `InstructionsLoaded` sink. ⛔ **SCOPED CLAIM, per his condition: a green (a) is scoped to EXACTLY the population §1 measured — repo copies carrying `.claude/`. It says NOTHING about the Drive-folder class, and cannot: §7(a) CANNOT SEE A SESSION THAT DID NOT LOAD IT.** State that in the completion report or the green is read wider than it is.
**(b)** over-cap warning **proven by deliberately exceeding the cap**; a warning never fired is not a warning.
**(c)** every moved rule findable at its new home; §339 old→new table; **nothing deleted.**
**(d)** `CLAUDE.md` byte drop measured **blob-to-blob at the ref**, never worktree-to-blob (#449).
**(e)** ⚠️ **the moved rules still FIRE — behavioural, not presence.** A rule that loads but sits below the point of use is the failure this batch exists to fix.
**(f)** ⛔ **rule-21 removal stays GATED behind alert `9c3037f0` — not shipped on my withdrawn "capability proven."**

## 6. ✅ STALE CROSS-REFS SWEPT (Langston's Step-1 rider)
§**2.5**'s measurement — OBJECT + POPULATION + WINDOW, **56** unprompted events across **27 sessions** over 12 days — discharges the 1c GATE-1 positive control. Three sites still claimed it undischarged and would have re-litigated a passed gate: `B_RULES_1D_SCOPE.md:86` · `B_RULES_1C_SCOPE.md:27` · `MEMORY_CC_A.md`. **Updated in this batch — and re-stamped at r2 to cite §2.5 rather than an empty §2.**

## 7. WHAT THIS PRE-AUDIT DID NOT ESTABLISH
Whether the `daily-claude-model-check` run COMPLETES (gated at `9c3037f0`; my no-transcript argument remains a **hypothesis** with Langston's three reach legs open) · whether the Drive-folder tasks *should* be re-homed (adjacent, unowned) · the per-rule compressed wording, which is Step-3 work.
